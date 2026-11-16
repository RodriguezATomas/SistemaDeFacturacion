import { Injectable, Logger } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '../../../common/utils/crypto';
import { AppConfigService } from '../../../config/app-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ARCA_ENDPOINTS } from '../arca.endpoints';
import { ArcaCallContext, ArcaLogService } from '../arca-log.service';
import { CredentialsService } from '../credentials.service';
import { ArcaServiceError, ArcaTransportError, parseXml, soapBody, soapPost } from '../soap/soap-transport';
import { buildTra, LoginTicket, signTra } from './wsaa-crypto';

/** Margen antes del vencimiento a partir del cual se solicita un TA nuevo. */
const RENEW_MARGIN_MS = 5 * 60 * 1000;

export interface AccessCredentials {
  token: string;
  sign: string;
  cuit: string;
}

/**
 * WSAA — Web Service de Autenticación y Autorización.
 * Obtiene el Ticket de Acceso (TA) firmando un TRA con el certificado de la empresa y lo
 * cachea cifrado en la base hasta su vencimiento (por empresa, ambiente y servicio).
 */
@Injectable()
export class WsaaService {
  private readonly logger = new Logger(WsaaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly arcaLog: ArcaLogService,
    private readonly config: AppConfigService,
  ) {}

  async getAccess(ctx: ArcaCallContext, service: string): Promise<AccessCredentials> {
    const cached = await this.cachedTicket(ctx, service);
    if (cached) return cached;

    const credential = await this.credentials.getDecrypted(ctx.companyId, ctx.environment);
    const lockKey = `wsaa:${ctx.companyId}:${ctx.environment}:${service}`;

    // Lock por empresa/ambiente/servicio: evita pedir dos TA en paralelo (ARCA rechaza el segundo).
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const again = await this.cachedTicket(ctx, service);
        if (again) return again;

        const ticket = await this.loginCms(ctx, service, credential.certificatePem, credential.privateKeyPem);
        const key = this.config.env.CREDENTIALS_ENCRYPTION_KEY;
        await tx.arcaAccessTicket.upsert({
          where: {
            companyId_environment_service: {
              companyId: ctx.companyId,
              environment: ctx.environment,
              service,
            },
          },
          update: {
            cuit: credential.cuit,
            tokenEnc: encryptSecret(ticket.token, key),
            signEnc: encryptSecret(ticket.sign, key),
            generatedAt: ticket.generationTime,
            expiresAt: ticket.expirationTime,
          },
          create: {
            companyId: ctx.companyId,
            environment: ctx.environment,
            service,
            cuit: credential.cuit,
            tokenEnc: encryptSecret(ticket.token, key),
            signEnc: encryptSecret(ticket.sign, key),
            generatedAt: ticket.generationTime,
            expiresAt: ticket.expirationTime,
          },
        });
        return { token: ticket.token, sign: ticket.sign, cuit: credential.cuit };
      },
      { timeout: this.config.env.ARCA_TIMEOUT_MS + 15000, maxWait: 15000 },
    );
  }

  async ticketStatus(ctx: Omit<ArcaCallContext, 'invoiceId'>, service: string) {
    return this.prisma.arcaAccessTicket.findUnique({
      where: {
        companyId_environment_service: { companyId: ctx.companyId, environment: ctx.environment, service },
      },
      select: { generatedAt: true, expiresAt: true, cuit: true },
    });
  }

  private async cachedTicket(ctx: ArcaCallContext, service: string): Promise<AccessCredentials | null> {
    const ticket = await this.prisma.arcaAccessTicket.findUnique({
      where: {
        companyId_environment_service: { companyId: ctx.companyId, environment: ctx.environment, service },
      },
    });
    if (!ticket || ticket.expiresAt.getTime() - Date.now() < RENEW_MARGIN_MS) return null;
    const key = this.config.env.CREDENTIALS_ENCRYPTION_KEY;
    return { token: decryptSecret(ticket.tokenEnc, key), sign: decryptSecret(ticket.signEnc, key), cuit: ticket.cuit };
  }

  private async loginCms(
    ctx: ArcaCallContext,
    service: string,
    certificatePem: string,
    privateKeyPem: string,
  ): Promise<LoginTicket> {
    const cms = signTra(buildTra(service), certificatePem, privateKeyPem);
    const envelope =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
      `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
    const url = ARCA_ENDPOINTS[ctx.environment].wsaa;
    const started = Date.now();
    try {
      const res = await soapPost(url, envelope, '', {
        timeoutMs: this.config.env.ARCA_TIMEOUT_MS,
        ciphers: this.config.env.ARCA_TLS_CIPHERS,
      });
      try {
        const ticket = parseLoginResponse(res.body);
        await this.arcaLog.record({
          ...ctx,
          service: 'wsaa',
          operation: 'loginCms',
          requestXml: envelope,
          responseXml: res.body,
          httpStatus: res.status,
          success: true,
          durationMs: res.durationMs,
        });
        return ticket;
      } catch (err) {
        await this.arcaLog.record({
          ...ctx,
          service: 'wsaa',
          operation: 'loginCms',
          requestXml: envelope,
          responseXml: res.body,
          httpStatus: res.status,
          success: false,
          errorMessage: (err as Error).message,
          durationMs: res.durationMs,
        });
        throw translateWsaaError(err as Error);
      }
    } catch (err) {
      if (err instanceof ArcaTransportError) {
        await this.arcaLog.record({
          ...ctx,
          service: 'wsaa',
          operation: 'loginCms',
          requestXml: envelope,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - started,
        });
        this.logger.warn(`WSAA no disponible: ${err.message}`);
      }
      throw err;
    }
  }
}

export function parseLoginResponse(xml: string): LoginTicket {
  const body = soapBody(xml);
  const response = body.loginCmsResponse as Record<string, unknown> | undefined;
  const inner = response?.loginCmsReturn;
  if (typeof inner !== 'string' || !inner) throw new ArcaServiceError('Respuesta de WSAA sin ticket de acceso');
  const doc = parseXml(inner);
  const ticket = doc.loginTicketResponse as Record<string, unknown> | undefined;
  const header = ticket?.header as Record<string, string> | undefined;
  const creds = ticket?.credentials as Record<string, string> | undefined;
  if (!header || !creds?.token || !creds?.sign) throw new ArcaServiceError('Ticket de acceso de WSAA incompleto');
  return {
    token: creds.token,
    sign: creds.sign,
    generationTime: new Date(header.generationTime),
    expirationTime: new Date(header.expirationTime),
  };
}

function translateWsaaError(err: Error): Error {
  if (!(err instanceof ArcaServiceError)) return err;
  const msg = err.message;
  if (/alreadyAuthenticated|ya posee un TA valido/i.test(`${err.code} ${msg}`)) {
    return new ArcaServiceError(
      'ARCA informa que ya existe un ticket de acceso vigente emitido fuera de este sistema para este certificado. Espere a que venza (hasta 12 horas) o utilice otro certificado.',
      err.code,
    );
  }
  if (/cms\.cert\.untrusted|cms\.bad|cert/i.test(`${err.code} ${msg}`)) {
    return new ArcaServiceError(`Certificado rechazado por ARCA: ${msg}`, err.code);
  }
  if (/notAuthorized|no autorizado/i.test(`${err.code} ${msg}`)) {
    return new ArcaServiceError(
      `El certificado no está autorizado para el servicio solicitado. Asocie el servicio "wsfe" al certificado en el Administrador de Relaciones de ARCA. Detalle: ${msg}`,
      err.code,
    );
  }
  return err;
}
