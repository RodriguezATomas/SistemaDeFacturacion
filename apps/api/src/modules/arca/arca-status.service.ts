import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArcaEnvironment } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VOUCHER_TYPES } from '../fiscal/fiscal.constants';
import { WSFE_SERVICE_NAME } from './arca.endpoints';
import { CredentialsService } from './credentials.service';
import { WsaaService } from './wsaa/wsaa.service';
import { WsfeService } from './wsfe/wsfe.service';

@Injectable()
export class ArcaStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly wsaa: WsaaService,
    private readonly wsfe: WsfeService,
    private readonly config: AppConfigService,
  ) {}

  async environment(companyId: string): Promise<ArcaEnvironment> {
    const settings = await this.prisma.companySettings.findUnique({ where: { companyId } });
    const env = settings?.arcaEnvironment ?? 'HOMOLOGATION';
    if (env === 'PRODUCTION' && !this.config.env.ARCA_PRODUCTION_ENABLED) {
      throw new BadRequestException('El ambiente de producción de ARCA no está habilitado en esta instalación.');
    }
    return env;
  }

  async status(companyId: string) {
    const settings = await this.prisma.companySettings.findUnique({ where: { companyId } });
    const environment = settings?.arcaEnvironment ?? 'HOMOLOGATION';
    const [credentials, ticket, pending] = await Promise.all([
      this.credentials.list(companyId),
      this.wsaa.ticketStatus({ companyId, environment }, WSFE_SERVICE_NAME),
      this.prisma.invoice.count({ where: { companyId, status: { in: ['UNKNOWN', 'SENDING'] } } }),
    ]);
    return {
      environment,
      productionEnabled: this.config.env.ARCA_PRODUCTION_ENABLED,
      credentials,
      accessTicket: ticket,
      invoicesPendingReconciliation: pending,
    };
  }

  /** Verifica, en orden: disponibilidad del servicio, autenticación WSAA y puntos de venta habilitados. */
  async testConnection(companyId: string) {
    const environment = await this.environment(companyId);
    const ctx = { companyId, environment };
    const steps: Array<{ step: string; ok: boolean; detail: unknown }> = [];

    try {
      steps.push({ step: 'FEDummy (disponibilidad WSFEv1)', ok: true, detail: await this.wsfe.dummy(environment, companyId) });
    } catch (err) {
      steps.push({ step: 'FEDummy (disponibilidad WSFEv1)', ok: false, detail: (err as Error).message });
      return { environment, ok: false, steps };
    }
    try {
      await this.wsaa.getAccess(ctx, WSFE_SERVICE_NAME);
      steps.push({ step: 'WSAA (ticket de acceso)', ok: true, detail: 'Autenticación correcta' });
    } catch (err) {
      steps.push({ step: 'WSAA (ticket de acceso)', ok: false, detail: (err as Error).message });
      return { environment, ok: false, steps };
    }
    try {
      steps.push({ step: 'Puntos de venta habilitados', ok: true, detail: await this.wsfe.pointsOfSale(ctx) });
    } catch (err) {
      steps.push({ step: 'Puntos de venta habilitados', ok: false, detail: (err as Error).message });
      return { environment, ok: false, steps };
    }
    return { environment, ok: true, steps };
  }

  async remotePointsOfSale(companyId: string) {
    const environment = await this.environment(companyId);
    return this.wsfe.pointsOfSale({ companyId, environment });
  }

  /**
   * Conciliación de numeración: compara, por tipo de comprobante, el último número autorizado
   * registrado localmente con el informado por ARCA (FECompUltimoAutorizado).
   */
  async reconciliation(companyId: string, pointOfSaleId: string) {
    const pos = await this.prisma.pointOfSale.findFirst({ where: { id: pointOfSaleId, companyId } });
    if (!pos) throw new NotFoundException('Punto de venta no encontrado');
    const environment = await this.environment(companyId);
    const ctx = { companyId, environment };

    const rows = [];
    for (const type of Object.values(VOUCHER_TYPES)) {
      const local = await this.prisma.invoice.aggregate({
        where: { companyId, pointOfSaleId, voucherType: type.code, status: 'AUTHORIZED', arcaEnvironment: environment },
        _max: { number: true },
        _count: true,
      });
      const pendingUncertain = await this.prisma.invoice.count({
        where: { companyId, pointOfSaleId, voucherType: type.code, status: { in: ['UNKNOWN', 'SENDING'] } },
      });
      let arcaLast: number | null = null;
      let error: string | null = null;
      try {
        arcaLast = await this.wsfe.lastAuthorized(ctx, pos.number, type.code);
      } catch (err) {
        error = (err as Error).message;
      }
      const localLast = local._max.number ?? 0;
      rows.push({
        voucherType: type.code,
        name: type.name,
        localLast,
        localCount: local._count,
        arcaLast,
        pendingUncertain,
        status: error ? 'ERROR' : arcaLast === localLast && pendingUncertain === 0 ? 'OK' : 'MISMATCH',
        error,
      });
    }
    return { environment, pointOfSale: pos.number, rows };
  }
}
