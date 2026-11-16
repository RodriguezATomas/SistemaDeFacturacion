import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArcaEnvironment } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { decryptSecret, encryptSecret } from '../../common/utils/crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateKeyAndCsr, inspectCertificate, keyMatchesCertificate } from './wsaa/wsaa-crypto';

export interface DecryptedCredential {
  cuit: string;
  certificatePem: string;
  privateKeyPem: string;
  validTo: Date | null;
}

/**
 * Certificados digitales y claves privadas por empresa y ambiente.
 * Se guardan cifrados con AES-256-GCM; nunca se devuelven por la API.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  private get key() {
    return this.config.env.CREDENTIALS_ENCRYPTION_KEY;
  }

  async list(companyId: string) {
    const creds = await this.prisma.fiscalCredential.findMany({
      where: { companyId },
      select: {
        id: true,
        environment: true,
        cuit: true,
        certificateSubject: true,
        certificateSerial: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        certificateEnc: true,
        updatedAt: true,
      },
    });
    return creds.map(({ certificateEnc, ...c }) => ({
      ...c,
      status: !certificateEnc ? 'PENDING_CERTIFICATE' : c.validTo && c.validTo < new Date() ? 'EXPIRED' : 'ACTIVE',
    }));
  }

  /** Genera clave privada (queda cifrada en el servidor) y CSR para tramitar el certificado en ARCA. */
  async generateCsr(
    auth: AuthContext,
    companyId: string,
    environment: ArcaEnvironment,
    alias: string,
    meta: RequestMeta,
  ) {
    this.assertEnvironmentAllowed(environment);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const { privateKeyPem, csrPem } = generateKeyAndCsr({
      cuit: company.cuit,
      organization: company.legalName.slice(0, 64),
      alias,
    });
    await this.prisma.fiscalCredential.upsert({
      where: { companyId_environment: { companyId, environment } },
      update: {
        cuit: company.cuit,
        privateKeyEnc: encryptSecret(privateKeyPem, this.key),
        certificateEnc: '',
        certificateSubject: null,
        certificateSerial: null,
        validFrom: null,
        validTo: null,
        isActive: false,
      },
      create: {
        companyId,
        environment,
        cuit: company.cuit,
        privateKeyEnc: encryptSecret(privateKeyPem, this.key),
        certificateEnc: '',
        isActive: false,
      },
    });
    await this.invalidateTickets(companyId, environment);
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'arca.csr_generated',
      entity: 'fiscal_credential',
      metadata: { environment, alias },
      meta,
    });
    return { csr: csrPem };
  }

  /**
   * Carga el certificado emitido por ARCA. Si no se envía clave privada, se usa la generada con el CSR.
   * Valida formato, vigencia, correspondencia clave/certificado y que la CUIT sea la de la empresa.
   */
  async uploadCertificate(
    auth: AuthContext,
    companyId: string,
    environment: ArcaEnvironment,
    certificatePem: string,
    privateKeyPem: string | undefined,
    meta: RequestMeta,
  ) {
    this.assertEnvironmentAllowed(environment);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    let keyPem = privateKeyPem?.trim();
    if (!keyPem) {
      const pending = await this.prisma.fiscalCredential.findUnique({
        where: { companyId_environment: { companyId, environment } },
      });
      if (!pending) {
        throw new BadRequestException('Debe enviar la clave privada o generar primero un CSR desde el sistema');
      }
      keyPem = decryptSecret(pending.privateKeyEnc, this.key);
    }

    let info;
    try {
      info = inspectCertificate(certificatePem.trim());
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (!keyMatchesCertificate(certificatePem.trim(), keyPem)) {
      throw new BadRequestException('La clave privada no corresponde al certificado');
    }
    if (info.validTo < new Date()) throw new BadRequestException('El certificado está vencido');
    if (info.cuit && info.cuit !== company.cuit) {
      throw new BadRequestException(
        `El certificado pertenece a la CUIT ${info.cuit}, distinta de la empresa (${company.cuit})`,
      );
    }

    const data = {
      cuit: company.cuit,
      certificateEnc: encryptSecret(certificatePem.trim(), this.key),
      privateKeyEnc: encryptSecret(keyPem, this.key),
      certificateSubject: info.subject,
      certificateSerial: info.serialNumber,
      validFrom: info.validFrom,
      validTo: info.validTo,
      isActive: true,
    };
    const cred = await this.prisma.fiscalCredential.upsert({
      where: { companyId_environment: { companyId, environment } },
      update: data,
      create: { companyId, environment, ...data },
    });
    await this.invalidateTickets(companyId, environment);
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'arca.certificate_uploaded',
      entity: 'fiscal_credential',
      entityId: cred.id,
      metadata: { environment, subject: info.subject, validTo: info.validTo.toISOString() },
      meta,
    });
    return { id: cred.id, environment, cuit: cred.cuit, subject: info.subject, validTo: info.validTo };
  }

  async remove(auth: AuthContext, companyId: string, environment: ArcaEnvironment, meta: RequestMeta) {
    const cred = await this.prisma.fiscalCredential.findUnique({
      where: { companyId_environment: { companyId, environment } },
    });
    if (!cred) throw new NotFoundException('No hay credenciales para ese ambiente');
    await this.prisma.fiscalCredential.delete({ where: { id: cred.id } });
    await this.invalidateTickets(companyId, environment);
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'arca.credential_deleted',
      entity: 'fiscal_credential',
      entityId: cred.id,
      metadata: { environment },
      meta,
    });
  }

  /** Uso interno (WSAA): devuelve el certificado y la clave descifrados. */
  async getDecrypted(companyId: string, environment: ArcaEnvironment): Promise<DecryptedCredential> {
    const cred = await this.prisma.fiscalCredential.findUnique({
      where: { companyId_environment: { companyId, environment } },
    });
    if (!cred || !cred.isActive || !cred.certificateEnc) {
      throw new BadRequestException(
        `No hay un certificado digital activo para el ambiente de ${environment === 'PRODUCTION' ? 'producción' : 'homologación'}. Cárguelo en Configuración > ARCA.`,
      );
    }
    if (cred.validTo && cred.validTo < new Date()) {
      throw new BadRequestException('El certificado digital está vencido. Cargue uno nuevo.');
    }
    return {
      cuit: cred.cuit,
      certificatePem: decryptSecret(cred.certificateEnc, this.key),
      privateKeyPem: decryptSecret(cred.privateKeyEnc, this.key),
      validTo: cred.validTo,
    };
  }

  private assertEnvironmentAllowed(environment: ArcaEnvironment) {
    if (environment === 'PRODUCTION' && !this.config.env.ARCA_PRODUCTION_ENABLED) {
      throw new BadRequestException(
        'El ambiente de producción de ARCA no está habilitado en esta instalación (ARCA_PRODUCTION_ENABLED).',
      );
    }
  }

  private invalidateTickets(companyId: string, environment: ArcaEnvironment) {
    return this.prisma.arcaAccessTicket.deleteMany({ where: { companyId, environment } });
  }
}
