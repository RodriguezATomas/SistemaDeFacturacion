import { Injectable } from '@nestjs/common';
import { ArcaEnvironment } from '@prisma/client';
import { AppConfigService } from '../../../config/app-config.service';
import { ARCA_ENDPOINTS, WSFE_NAMESPACE, WSFE_SERVICE_NAME } from '../arca.endpoints';
import { ArcaCallContext, ArcaLogService } from '../arca-log.service';
import { ArcaTransportError, soapPost } from '../soap/soap-transport';
import { AccessCredentials, WsaaService } from '../wsaa/wsaa.service';
import {
  buildCaeRequest,
  buildConsultRequest,
  buildDummyRequest,
  buildLastAuthorizedRequest,
  buildPointsOfSaleRequest,
  CaeRequestDetail,
  CaeResponse,
  ConsultResponse,
  parseCaeResponse,
  parseConsult,
  parseDummy,
  parseLastAuthorized,
  parsePointsOfSale,
} from './wsfe-xml';

/**
 * Cliente de WSFEv1 (Factura Electrónica, comprobantes A, B y C con CAE).
 * Cada llamada queda registrada en arca_request_logs con request/response (sin token ni sign).
 */
@Injectable()
export class WsfeService {
  constructor(
    private readonly wsaa: WsaaService,
    private readonly arcaLog: ArcaLogService,
    private readonly config: AppConfigService,
  ) {}

  /** FEDummy: verifica disponibilidad del servicio (no requiere autenticación). */
  async dummy(environment: ArcaEnvironment, companyId: string) {
    const xml = buildDummyRequest();
    const body = await this.post({ companyId, environment }, 'FEDummy', xml);
    return parseDummy(body);
  }

  async lastAuthorized(ctx: ArcaCallContext, pointOfSale: number, voucherType: number): Promise<number> {
    const auth = await this.wsaa.getAccess(ctx, WSFE_SERVICE_NAME);
    const body = await this.post(ctx, 'FECompUltimoAutorizado', buildLastAuthorizedRequest(auth, pointOfSale, voucherType));
    return parseLastAuthorized(body);
  }

  /** Obtiene el ticket de acceso de WSAA para WSFEv1. */
  access(ctx: ArcaCallContext): Promise<AccessCredentials> {
    return this.wsaa.getAccess(ctx, WSFE_SERVICE_NAME);
  }

  /** Arma el XML de FECAESolicitar sin acceso a red (los errores aquí garantizan que nada se envió). */
  prepareCaeRequest(auth: AccessCredentials, detail: CaeRequestDetail): string {
    return buildCaeRequest(auth, detail);
  }

  /**
   * Envía FECAESolicitar. Propaga ArcaTransportError (con requestSent) para que el emisor
   * determine si el resultado es incierto y debe conciliarse.
   */
  async sendCaeRequest(ctx: ArcaCallContext, xml: string): Promise<CaeResponse> {
    const body = await this.post(ctx, 'FECAESolicitar', xml);
    return parseCaeResponse(body);
  }

  async consult(ctx: ArcaCallContext, voucherType: number, pointOfSale: number, number: number): Promise<ConsultResponse> {
    const auth = await this.wsaa.getAccess(ctx, WSFE_SERVICE_NAME);
    const body = await this.post(ctx, 'FECompConsultar', buildConsultRequest(auth, voucherType, pointOfSale, number));
    return parseConsult(body);
  }

  async pointsOfSale(ctx: ArcaCallContext) {
    const auth = await this.wsaa.getAccess(ctx, WSFE_SERVICE_NAME);
    const body = await this.post(ctx, 'FEParamGetPtosVenta', buildPointsOfSaleRequest(auth));
    return parsePointsOfSale(body);
  }

  private async post(ctx: ArcaCallContext, operation: string, xml: string): Promise<string> {
    const started = Date.now();
    try {
      const res = await soapPost(ARCA_ENDPOINTS[ctx.environment].wsfe, xml, `${WSFE_NAMESPACE}${operation}`, {
        timeoutMs: this.config.env.ARCA_TIMEOUT_MS,
        ciphers: this.config.env.ARCA_TLS_CIPHERS,
      });
      const ok = res.status >= 200 && res.status < 300;
      await this.arcaLog.record({
        ...ctx,
        service: 'wsfe',
        operation,
        requestXml: xml,
        responseXml: res.body,
        httpStatus: res.status,
        success: ok,
        errorMessage: ok ? undefined : `HTTP ${res.status}`,
        durationMs: res.durationMs,
      });
      // Un SOAP Fault llega con HTTP 500 y cuerpo XML: se deja que el parser lo traduzca a ArcaServiceError.
      if (!ok && !res.body.includes('Envelope')) {
        const httpErr = new ArcaTransportError(`ARCA respondió HTTP ${res.status}`, true);
        (httpErr as { logged?: boolean }).logged = true;
        throw httpErr;
      }
      return res.body;
    } catch (err) {
      if (err instanceof ArcaTransportError && !(err as { logged?: boolean }).logged) {
        await this.arcaLog.record({
          ...ctx,
          service: 'wsfe',
          operation,
          requestXml: xml,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - started,
        });
        (err as { logged?: boolean }).logged = true;
      }
      throw err;
    }
  }
}
