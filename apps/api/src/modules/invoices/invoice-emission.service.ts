import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { ArcaStatusService } from '../arca/arca-status.service';
import { ArcaServiceError, ArcaTransportError } from '../arca/soap/soap-transport';
import { CaeRequestDetail, CaeResponse } from '../arca/wsfe/wsfe-xml';
import { WsfeService } from '../arca/wsfe/wsfe.service';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../companies/plan-limits.service';
import { validateVoucherRules } from '../fiscal/fiscal-engine';
import {
  CONCEPT_TO_ARCA,
  DOCUMENT_TYPE_TO_ARCA,
  VAT_CONDITION_TO_ARCA,
  VOUCHER_TYPES,
} from '../fiscal/fiscal.constants';
import { fromArcaDate, issueDateError, toArcaDate } from './invoice-dates';
import { InvoicePdfService } from './invoice-pdf.service';
import { invoiceDetailInclude, InvoicesService } from './invoices.service';

/** Duración del lease de emisión por punto de venta y tipo de comprobante. */
const LEASE_SECONDS = 120;
/** Un comprobante en SENDING más antiguo que esto se considera interrumpido y se concilia. */
export const STALE_SENDING_MS = (LEASE_SECONDS + 30) * 1000;

type InvoiceWithDetail = Prisma.InvoiceGetPayload<{ include: typeof invoiceDetailInclude }>;

/**
 * Emisión de comprobantes ante ARCA (WSFEv1) con garantías de integridad:
 * - Idempotencia: la misma Idempotency-Key nunca produce un segundo envío.
 * - Numeración correlativa: lease por punto de venta/tipo + FECompUltimoAutorizado.
 * - El estado SENDING se persiste ANTES de enviar: un corte deja rastro para conciliar.
 * - Timeout o respuesta incierta → UNKNOWN; se consulta FECompConsultar antes de reintentar.
 * - Nunca se marca AUTHORIZED sin CAE devuelto por ARCA.
 */
@Injectable()
export class InvoiceEmissionService {
  private readonly logger = new Logger(InvoiceEmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly wsfe: WsfeService,
    private readonly arcaStatus: ArcaStatusService,
    private readonly limits: PlanLimitsService,
    private readonly pdf: InvoicePdfService,
    private readonly audit: AuditService,
  ) {}

  async emit(auth: AuthContext, companyId: string, invoiceId: string, idempotencyKey: string, meta: RequestMeta) {
    // 1. Idempotencia: una clave ya usada devuelve el estado actual sin reenviar.
    const previous = await this.prisma.invoiceEmissionAttempt.findFirst({
      where: { idempotencyKey },
      include: { invoice: { select: { id: true, companyId: true } } },
    });
    if (previous) {
      if (previous.invoice.id !== invoiceId || previous.invoice.companyId !== companyId) {
        throw new ConflictException('La clave de idempotencia ya fue utilizada para otra operación');
      }
      return this.invoices.get(companyId, invoiceId);
    }

    const invoice = await this.invoices.get(companyId, invoiceId);
    if (invoice.status === 'AUTHORIZED') return invoice;
    if (invoice.status === 'SENDING' || invoice.status === 'UNKNOWN') {
      throw new ConflictException(
        'El comprobante tiene una emisión con resultado incierto. Concílielo con ARCA antes de reintentar.',
      );
    }

    await this.limits.assertCanEmitInvoice(companyId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const environment = await this.arcaStatus.environment(companyId);
    this.validateBeforeEmission(invoice, company.taxCondition);

    // 2. Lease por punto de venta y tipo: serializa la asignación de números.
    const holder = randomUUID();
    await this.acquireLease(invoice.pointOfSaleId, invoice.voucherType, holder);
    try {
      const uncertain = await this.prisma.invoice.count({
        where: {
          companyId,
          pointOfSaleId: invoice.pointOfSaleId,
          voucherType: invoice.voucherType,
          status: { in: ['SENDING', 'UNKNOWN'] },
          NOT: { id: invoice.id },
        },
      });
      if (uncertain > 0) {
        throw new ConflictException(
          'Existen comprobantes de este punto de venta y tipo con resultado incierto. Concílielos antes de emitir nuevos.',
        );
      }

      const ctx = { companyId, environment, invoiceId: invoice.id };
      let auth_, last: number, xml: string, number: number;
      try {
        auth_ = await this.wsfe.access(ctx);
        last = await this.wsfe.lastAuthorized(ctx, invoice.pointOfSale.number, invoice.voucherType);
        number = last + 1;
        xml = this.wsfe.prepareCaeRequest(auth_, this.buildDetail(invoice, company.cuit, number));
      } catch (err) {
        // Nada se envió a FECAESolicitar: el comprobante sigue editable.
        throw this.preSendError(err);
      }

      // 3. Persistir SENDING + intento ANTES de enviar.
      const attemptNumber = invoice.attempts.length + 1;
      const attempt = await this.prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'SENDING',
            number,
            arcaEnvironment: environment,
            emissionIdempotencyKey: idempotencyKey,
            arcaErrors: Prisma.DbNull,
            arcaObservations: Prisma.DbNull,
          },
        });
        return tx.invoiceEmissionAttempt.create({
          data: { invoiceId: invoice.id, attemptNumber, number, idempotencyKey, createdById: auth.userId },
        });
      });

      // 4. Enviar FECAESolicitar.
      let response: CaeResponse;
      try {
        response = await this.wsfe.sendCaeRequest(ctx, xml);
      } catch (err) {
        if (err instanceof ArcaTransportError && !err.requestSent) {
          await this.revertToEditable(invoice.id, attempt.id, 'CONEXION', err.message);
          throw new ServiceUnavailableException(`No se pudo conectar con ARCA. El comprobante no fue enviado. ${err.message}`);
        }
        // Enviado sin respuesta válida: resultado incierto.
        await this.markUnknown(invoice.id, attempt.id, (err as Error).message);
        await this.audit.log({
          companyId,
          userId: auth.userId,
          action: 'invoice.emission_unknown',
          entity: 'invoice',
          entityId: invoice.id,
          metadata: { number, error: (err as Error).message },
          meta,
        });
        await this.tryReconcile(companyId, invoice.id);
        return this.invoices.get(companyId, invoice.id);
      }

      // 5. Procesar resultado.
      await this.applyResponse(invoice, attempt.id, response, auth, meta);
      return this.invoices.get(companyId, invoice.id);
    } finally {
      await this.releaseLease(invoice.pointOfSaleId, invoice.voucherType, holder);
    }
  }

  /**
   * Conciliación de un comprobante con resultado incierto mediante FECompConsultar:
   * - Existe en ARCA con los mismos datos → AUTHORIZED con el CAE informado por ARCA.
   * - No existe y el último autorizado es menor a su número → no fue autorizado: vuelve a ser editable.
   * - Cualquier otra situación queda en UNKNOWN para revisión manual.
   */
  async reconcile(auth: AuthContext | null, companyId: string, invoiceId: string, meta?: RequestMeta) {
    const invoice = await this.invoices.get(companyId, invoiceId);
    if (invoice.status !== 'UNKNOWN' && invoice.status !== 'SENDING') {
      throw new BadRequestException('Solo se concilian comprobantes con resultado incierto');
    }
    if (invoice.status === 'SENDING' && Date.now() - invoice.updatedAt.getTime() < STALE_SENDING_MS) {
      throw new ConflictException('La emisión está en curso. Intente conciliar en unos minutos.');
    }
    if (!invoice.number || !invoice.arcaEnvironment) {
      throw new BadRequestException('El comprobante no tiene número asignado para conciliar');
    }
    const ctx = { companyId, environment: invoice.arcaEnvironment, invoiceId };
    const attempt = invoice.attempts[invoice.attempts.length - 1];

    try {
      const found = await this.wsfe.consult(ctx, invoice.voucherType, invoice.pointOfSale.number, invoice.number);
      if (found.found && found.cae) {
        const sameTotal = found.total !== null && new Decimal(found.total).eq(invoice.total);
        const sameDoc =
          found.docNumber !== null &&
          found.docNumber.replace(/\D/g, '') === (invoice.receiverDocumentNumber.replace(/\D/g, '') || '0');
        const sameDate = found.issueDate === toArcaDate(invoice.issueDate);
        if (sameTotal && sameDoc && sameDate) {
          await this.prisma.$transaction([
            this.prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status: 'AUTHORIZED',
                cae: found.cae,
                caeDueDate: found.caeDueDate ? fromArcaDate(found.caeDueDate) : null,
                authorizedAt: new Date(),
              },
            }),
            ...(attempt
              ? [this.prisma.invoiceEmissionAttempt.update({
                  where: { id: attempt.id },
                  data: { result: 'RECONCILED_AUTHORIZED', message: 'Autorización confirmada por FECompConsultar' },
                })]
              : []),
          ]);
          await this.audit.log({
            companyId,
            userId: auth?.userId,
            action: 'invoice.reconciled_authorized',
            entity: 'invoice',
            entityId: invoiceId,
            metadata: { cae: found.cae },
            meta,
          });
          await this.storePdf(companyId, invoiceId);
          return { outcome: 'AUTHORIZED' as const, invoice: await this.invoices.get(companyId, invoiceId) };
        }
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'UNKNOWN',
            arcaErrors: [
              {
                code: 'CONFLICTO',
                message: `ARCA registra el número ${invoice.number} con datos distintos (total ${found.total}, documento ${found.docNumber}, fecha ${found.issueDate}). Requiere revisión manual.`,
              },
            ],
          },
        });
        return { outcome: 'CONFLICT' as const, invoice: await this.invoices.get(companyId, invoiceId) };
      }

      const last = await this.wsfe.lastAuthorized(ctx, invoice.pointOfSale.number, invoice.voucherType);
      if (last < invoice.number) {
        await this.prisma.$transaction([
          this.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
              status: 'REJECTED',
              number: null,
              arcaErrors: [
                { code: 'NO_AUTORIZADO', message: 'ARCA no registra el comprobante. Puede reintentar la emisión.' },
              ],
            },
          }),
          ...(attempt
            ? [this.prisma.invoiceEmissionAttempt.update({
                where: { id: attempt.id },
                data: { result: 'RECONCILED_NOT_FOUND', message: `Último autorizado en ARCA: ${last}` },
              })]
            : []),
        ]);
        await this.audit.log({
          companyId,
          userId: auth?.userId,
          action: 'invoice.reconciled_not_found',
          entity: 'invoice',
          entityId: invoiceId,
          metadata: { number: invoice.number, arcaLast: last },
          meta,
        });
        return { outcome: 'NOT_AUTHORIZED' as const, invoice: await this.invoices.get(companyId, invoiceId) };
      }
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'UNKNOWN' } });
      return { outcome: 'UNDETERMINED' as const, invoice: await this.invoices.get(companyId, invoiceId) };
    } catch (err) {
      if (invoice.status === 'SENDING') {
        await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'UNKNOWN' } });
      }
      if (err instanceof ArcaTransportError || err instanceof ArcaServiceError) {
        throw new ServiceUnavailableException(`No fue posible consultar ARCA: ${err.message}`);
      }
      throw err;
    }
  }

  /** Concilia automáticamente los comprobantes inciertos (invocado periódicamente). */
  async reconcilePending(): Promise<number> {
    const pending = await this.prisma.invoice.findMany({
      where: {
        OR: [
          { status: 'UNKNOWN' },
          { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
        ],
      },
      select: { id: true, companyId: true },
      take: 50,
    });
    let resolved = 0;
    for (const inv of pending) {
      try {
        const r = await this.reconcile(null, inv.companyId, inv.id);
        if (r.outcome === 'AUTHORIZED' || r.outcome === 'NOT_AUTHORIZED') resolved++;
      } catch (err) {
        this.logger.warn(`Conciliación pendiente de ${inv.id}: ${(err as Error).message}`);
      }
    }
    return resolved;
  }

  buildDetail(invoice: InvoiceWithDetail, emitterCuit: string, number: number): CaeRequestDetail {
    const info = VOUCHER_TYPES[invoice.voucherType];
    const fmt = (d: Prisma.Decimal | Decimal) => new Decimal(d.toString()).toFixed(2);
    const docType = DOCUMENT_TYPE_TO_ARCA[invoice.receiverDocumentType];
    return {
      pointOfSale: invoice.pointOfSale.number,
      voucherType: invoice.voucherType,
      concept: CONCEPT_TO_ARCA[invoice.concept],
      docType,
      docNumber: docType === 99 ? '0' : invoice.receiverDocumentNumber.replace(/\D/g, '') || invoice.receiverDocumentNumber,
      number,
      issueDate: toArcaDate(invoice.issueDate),
      total: fmt(invoice.total),
      netUntaxed: fmt(invoice.netUntaxed),
      netTaxed: fmt(invoice.netTaxed),
      exempt: fmt(invoice.exemptAmount),
      otherTaxes: fmt(invoice.otherTaxesAmount),
      vat: fmt(invoice.vatAmount),
      serviceFrom: invoice.serviceFrom ? toArcaDate(invoice.serviceFrom) : undefined,
      serviceTo: invoice.serviceTo ? toArcaDate(invoice.serviceTo) : undefined,
      paymentDueDate: invoice.paymentDueDate ? toArcaDate(invoice.paymentDueDate) : undefined,
      currency: invoice.currency,
      exchangeRate: new Decimal(invoice.exchangeRate.toString()).toDecimalPlaces(6).toString(),
      receiverVatConditionId: VAT_CONDITION_TO_ARCA[invoice.receiverVatCondition],
      associated: invoice.associatedInvoice
        ? [
            {
              type: invoice.associatedInvoice.voucherType,
              pointOfSale: invoice.associatedInvoice.pointOfSale.number,
              number: invoice.associatedInvoice.number!,
              cuit: emitterCuit,
              date: toArcaDate(invoice.associatedInvoice.issueDate),
            },
          ]
        : undefined,
      taxes: invoice.otherTaxes.map((t) => ({
        id: t.arcaTaxId,
        description: t.description,
        base: fmt(t.baseAmount),
        rate: new Decimal(t.rate.toString()).toFixed(2),
        amount: fmt(t.amount),
      })),
      vatBreakdown: info.letter === 'C' ? [] : invoice.vatBreakdown.map((v) => ({ id: v.arcaId, base: fmt(v.baseAmount), amount: fmt(v.vatAmount) })),
    };
  }

  private validateBeforeEmission(invoice: InvoiceWithDetail, emitter: Parameters<typeof validateVoucherRules>[0]['emitter']) {
    if (!invoice.pointOfSale.isActive) throw new BadRequestException('El punto de venta está inactivo');
    try {
      validateVoucherRules({
        voucherType: invoice.voucherType,
        emitter,
        receiverVatCondition: invoice.receiverVatCondition,
        receiverDocumentType: invoice.receiverDocumentType,
        hasAssociatedInvoice: Boolean(invoice.associatedInvoiceId),
      });
    } catch (err) {
      throw new BadRequestException(
        `${(err as Error).message} Edite el borrador para recalcular el tipo de comprobante.`,
      );
    }
    const dateErr = issueDateError(invoice.concept, invoice.issueDate);
    if (dateErr) throw new BadRequestException(dateErr);
    if (invoice.associatedInvoice && invoice.associatedInvoice.number === null) {
      throw new BadRequestException('El comprobante asociado no tiene número autorizado');
    }
  }

  private async applyResponse(
    invoice: InvoiceWithDetail,
    attemptId: string,
    r: CaeResponse,
    auth: AuthContext,
    meta: RequestMeta,
  ) {
    const observations = r.observations.length ? (r.observations as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    if (r.result === 'A' && r.cae) {
      await this.prisma.$transaction([
        this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'AUTHORIZED',
            cae: r.cae,
            caeDueDate: r.caeDueDate ? fromArcaDate(r.caeDueDate) : null,
            authorizedAt: new Date(),
            arcaObservations: observations,
            arcaErrors: r.errors.length ? (r.errors as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          },
        }),
        this.prisma.invoiceEmissionAttempt.update({ where: { id: attemptId }, data: { result: 'AUTHORIZED', message: `CAE ${r.cae}` } }),
      ]);
      await this.audit.log({
        companyId: invoice.companyId,
        userId: auth.userId,
        action: 'invoice.authorized',
        entity: 'invoice',
        entityId: invoice.id,
        metadata: { cae: r.cae, voucherType: invoice.voucherType },
        meta,
      });
      await this.storePdf(invoice.companyId, invoice.id);
      return;
    }
    if (r.result === 'R') {
      const message = [...r.errors, ...r.observations].map((m) => `[${m.code}] ${m.message}`).join('; ') || 'Rechazado por ARCA';
      await this.prisma.$transaction([
        this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'REJECTED',
            number: null,
            arcaObservations: observations,
            arcaErrors: r.errors.length ? (r.errors as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          },
        }),
        this.prisma.invoiceEmissionAttempt.update({ where: { id: attemptId }, data: { result: 'REJECTED', message: message.slice(0, 1000) } }),
      ]);
      await this.audit.log({
        companyId: invoice.companyId,
        userId: auth.userId,
        action: 'invoice.rejected',
        entity: 'invoice',
        entityId: invoice.id,
        metadata: { message },
        meta,
      });
      return;
    }
    // Resultado no reconocido (p. ej. "P" o respuesta sin detalle): nunca se asume autorizado.
    await this.markUnknown(invoice.id, attemptId, `Resultado no concluyente de ARCA: ${r.result ?? 'sin resultado'}`);
    await this.tryReconcile(invoice.companyId, invoice.id);
  }

  private async markUnknown(invoiceId: string, attemptId: string, message: string) {
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'UNKNOWN', arcaErrors: [{ code: 'INCIERTO', message }] },
      }),
      this.prisma.invoiceEmissionAttempt.update({
        where: { id: attemptId },
        data: { result: 'UNKNOWN', message: message.slice(0, 1000) },
      }),
    ]);
  }

  private async revertToEditable(invoiceId: string, attemptId: string, code: string, message: string) {
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'REJECTED', number: null, arcaErrors: [{ code, message }] },
      }),
      this.prisma.invoiceEmissionAttempt.update({
        where: { id: attemptId },
        data: { result: 'REJECTED', message: `No enviado: ${message}`.slice(0, 1000) },
      }),
    ]);
  }

  private async tryReconcile(companyId: string, invoiceId: string) {
    try {
      // El comprobante recién quedó en UNKNOWN: la consulta inmediata resuelve los timeouts transitorios.
      await this.reconcile(null, companyId, invoiceId);
    } catch (err) {
      this.logger.warn(`Conciliación inmediata de ${invoiceId} no concluyente: ${(err as Error).message}`);
    }
  }

  private async storePdf(companyId: string, invoiceId: string) {
    try {
      await this.pdf.generateAndStore(companyId, invoiceId);
    } catch (err) {
      // El PDF puede regenerarse al descargarlo; no afecta la autorización.
      this.logger.error(`No se pudo generar el PDF de ${invoiceId}`, err as Error);
    }
  }

  private preSendError(err: unknown): Error {
    if (err instanceof ArcaTransportError) {
      return new ServiceUnavailableException(`ARCA no disponible: ${err.message}. El comprobante no fue enviado.`);
    }
    if (err instanceof ArcaServiceError) {
      return new BadRequestException(`ARCA: ${err.message}. El comprobante no fue enviado.`);
    }
    return err as Error;
  }

  private async acquireLease(pointOfSaleId: string, voucherType: number, holder: string) {
    const acquired = await this.prisma.$executeRaw`
      INSERT INTO emission_locks (id, "pointOfSaleId", "voucherType", "lockedUntil", holder)
      VALUES (gen_random_uuid(), ${pointOfSaleId}::uuid, ${voucherType}, now() + make_interval(secs => ${LEASE_SECONDS}), ${holder})
      ON CONFLICT ("pointOfSaleId", "voucherType")
      DO UPDATE SET "lockedUntil" = EXCLUDED."lockedUntil", holder = EXCLUDED.holder
      WHERE emission_locks."lockedUntil" < now()`;
    if (acquired === 0) {
      throw new ConflictException(
        'Hay otra emisión en curso para este punto de venta y tipo de comprobante. Reintente en unos segundos.',
      );
    }
  }

  private async releaseLease(pointOfSaleId: string, voucherType: number, holder: string) {
    await this.prisma.emissionLock.updateMany({
      where: { pointOfSaleId, voucherType, holder },
      data: { lockedUntil: new Date(0), holder: null },
    });
  }
}
