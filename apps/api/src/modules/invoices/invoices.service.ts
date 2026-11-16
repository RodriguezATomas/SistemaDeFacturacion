import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { paginate, skipTake } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { effectivePrice } from '../catalog/pricing';
import { calculateInvoice, FiscalRuleError, resolveVoucherType, validateVoucherRules } from '../fiscal/fiscal-engine';
import { VOUCHER_TYPES } from '../fiscal/fiscal.constants';
import { normalizeDocument, validateDocument } from '../parties/party.dto';
import { CreateInvoiceDto, InvoicesQueryDto } from './invoice.dto';
import { parseDateOnly } from './invoice-dates';

export const invoiceDetailInclude = {
  items: { orderBy: { position: 'asc' }, include: { product: { select: { unit: true, sku: true } } } },
  vatBreakdown: { orderBy: { arcaId: 'asc' } },
  otherTaxes: true,
  pointOfSale: true,
  customer: { select: { id: true, name: true, email: true } },
  associatedInvoice: {
    select: { id: true, voucherType: true, number: true, issueDate: true, total: true, pointOfSale: { select: { number: true } } },
  },
  associatedNotes: {
    select: { id: true, voucherType: true, number: true, status: true, total: true },
    orderBy: { createdAt: 'asc' },
  },
  attempts: { orderBy: { attemptNumber: 'asc' } },
} satisfies Prisma.InvoiceInclude;

const EDITABLE = ['DRAFT', 'REJECTED'] as const;

/** Comprobantes: borradores, cálculo fiscal y consulta. La emisión ante ARCA está en InvoiceEmissionService. */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: InvoicesQueryDto) {
    const term = q.search?.trim();
    const numeric = term && /^\d+$/.test(term) ? Number(term) : undefined;
    const where: Prisma.InvoiceWhereInput = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.voucherType ? { voucherType: q.voucherType } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.pointOfSaleId ? { pointOfSaleId: q.pointOfSaleId } : {}),
      ...(q.from || q.to
        ? {
            issueDate: {
              ...(q.from ? { gte: parseDateOnly(q.from) } : {}),
              ...(q.to ? { lte: parseDateOnly(q.to) } : {}),
            },
          }
        : {}),
      ...(term
        ? {
            OR: [
              { receiverName: { contains: term, mode: 'insensitive' } },
              { receiverDocumentNumber: { contains: term } },
              ...(numeric !== undefined && numeric <= 99999999 ? [{ number: numeric }] : []),
              { cae: { contains: term } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        ...skipTake(q),
        select: {
          id: true,
          voucherType: true,
          number: true,
          status: true,
          issueDate: true,
          receiverName: true,
          receiverDocumentNumber: true,
          total: true,
          currency: true,
          cae: true,
          caeDueDate: true,
          arcaEnvironment: true,
          pointOfSale: { select: { id: true, number: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  async get(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: invoiceDetailInclude,
    });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    return invoice;
  }

  async create(auth: AuthContext, companyId: string, dto: CreateInvoiceDto, meta: RequestMeta) {
    const data = await this.build(companyId, dto);
    const invoice = await this.prisma.invoice.create({
      data: { ...data.invoice, companyId, createdById: auth.userId, items: { create: data.items }, vatBreakdown: { create: data.vat }, otherTaxes: { create: data.taxes } },
      include: invoiceDetailInclude,
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'invoice.draft_create',
      entity: 'invoice',
      entityId: invoice.id,
      metadata: { voucherType: invoice.voucherType, total: invoice.total.toString() },
      meta,
    });
    return invoice;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: CreateInvoiceDto, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    if (!(EDITABLE as readonly string[]).includes(current.status)) {
      throw new ConflictException('Solo pueden modificarse comprobantes en borrador o rechazados');
    }
    const data = await this.build(companyId, dto, id);
    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceVat.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceTax.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          ...data.invoice,
          status: 'DRAFT',
          arcaErrors: Prisma.DbNull,
          arcaObservations: Prisma.DbNull,
          items: { create: data.items },
          vatBreakdown: { create: data.vat },
          otherTaxes: { create: data.taxes },
        },
        include: invoiceDetailInclude,
      });
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'invoice.draft_update',
      entity: 'invoice',
      entityId: id,
      metadata: { total: invoice.total.toString() },
      meta,
    });
    return invoice;
  }

  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    if (!(EDITABLE as readonly string[]).includes(current.status) || current.number !== null) {
      throw new ConflictException('Solo pueden eliminarse borradores sin número asignado');
    }
    if (current.attempts.length > 0) {
      throw new ConflictException('El comprobante tiene intentos de emisión registrados y se conserva para auditoría');
    }
    await this.prisma.invoice.delete({ where: { id } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'invoice.draft_delete',
      entity: 'invoice',
      entityId: id,
      meta,
    });
  }

  /** Prepara un borrador de nota de crédito con los ítems del comprobante autorizado. */
  async creditNoteFrom(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    const original = await this.get(companyId, id);
    if (original.status !== 'AUTHORIZED') {
      throw new BadRequestException('Solo se pueden anular mediante nota de crédito comprobantes autorizados');
    }
    if (VOUCHER_TYPES[original.voucherType].kind === 'NOTA_CREDITO') {
      throw new BadRequestException('No se puede emitir una nota de crédito sobre otra nota de crédito');
    }
    const dto: CreateInvoiceDto = {
      pointOfSaleId: original.pointOfSaleId,
      kind: 'NOTA_CREDITO',
      customerId: original.customerId,
      receiver: original.customerId
        ? undefined
        : {
            name: original.receiverName,
            documentType: original.receiverDocumentType,
            documentNumber: original.receiverDocumentNumber,
            vatCondition: original.receiverVatCondition,
            address: original.receiverAddress,
          },
      concept: original.concept,
      issueDate: new Date().toISOString().slice(0, 10),
      serviceFrom: original.serviceFrom?.toISOString().slice(0, 10) ?? null,
      serviceTo: original.serviceTo?.toISOString().slice(0, 10) ?? null,
      paymentDueDate: original.concept !== 'PRODUCTS' ? new Date().toISOString().slice(0, 10) : null,
      currency: original.currency,
      exchangeRate: Number(original.exchangeRate),
      associatedInvoiceId: original.id,
      notes: `Anulación de ${VOUCHER_TYPES[original.voucherType].name} ${String(original.pointOfSale.number).padStart(5, '0')}-${String(original.number).padStart(8, '0')}`,
      items: original.items.map((i) => ({
        productId: i.productId,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountPercent: Number(i.discountPercent),
        vatTreatment: i.vatTreatment,
        vatRate: Number(i.vatRate),
      })),
      otherTaxes: original.otherTaxes.map((t) => ({
        arcaTaxId: t.arcaTaxId,
        description: t.description,
        baseAmount: Number(t.baseAmount),
        rate: Number(t.rate),
      })),
    };
    return this.create(auth, companyId, dto, meta);
  }

  /** Valida y calcula un comprobante a partir del DTO. Lanza BadRequest con mensajes claros. */
  private async build(companyId: string, dto: CreateInvoiceDto, excludeId?: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const pos = await this.prisma.pointOfSale.findFirst({ where: { id: dto.pointOfSaleId, companyId } });
    if (!pos) throw new BadRequestException('Punto de venta inexistente');
    if (!pos.isActive) throw new BadRequestException('El punto de venta está inactivo');

    const receiver = await this.resolveReceiver(companyId, dto);
    const priceList = await this.resolvePriceList(companyId, dto, receiver.priceListId);
    const currency = dto.currency ?? 'PES';
    const exchangeRate = currency === 'PES' ? 1 : dto.exchangeRate;
    if (currency !== 'PES' && !exchangeRate) {
      throw new BadRequestException('Indique la cotización para comprobantes en moneda extranjera');
    }

    if (dto.concept !== 'PRODUCTS' && (!dto.serviceFrom || !dto.serviceTo || !dto.paymentDueDate)) {
      throw new BadRequestException(
        'Para servicios son obligatorias las fechas de inicio y fin del período y el vencimiento de pago',
      );
    }
    if (dto.serviceFrom && dto.serviceTo && dto.serviceFrom > dto.serviceTo) {
      throw new BadRequestException('La fecha de inicio del servicio no puede ser posterior a la de fin');
    }

    let voucherType: number;
    let associated: Awaited<ReturnType<typeof this.resolveAssociated>> = null;
    try {
      voucherType = resolveVoucherType(company.taxCondition, receiver.vatCondition, dto.kind);
      if (dto.voucherType && dto.voucherType !== voucherType) {
        throw new FiscalRuleError(
          `Para el emisor y receptor indicados corresponde ${VOUCHER_TYPES[voucherType].name}`,
        );
      }
      associated = await this.resolveAssociated(companyId, dto, voucherType, excludeId);
      validateVoucherRules({
        voucherType,
        emitter: company.taxCondition,
        receiverVatCondition: receiver.vatCondition,
        receiverDocumentType: receiver.documentType,
        hasAssociatedInvoice: Boolean(associated),
      });
    } catch (err) {
      if (err instanceof FiscalRuleError) throw new BadRequestException(err.message);
      throw err;
    }
    const letter = VOUCHER_TYPES[voucherType].letter;

    const items = await this.resolveItems(companyId, company, dto, priceList, currency);
    let calc;
    try {
      calc = calculateInvoice(letter, items, dto.otherTaxes ?? []);
    } catch (err) {
      if (err instanceof FiscalRuleError) throw new BadRequestException(err.message);
      throw err;
    }

    if (associated && VOUCHER_TYPES[voucherType].kind === 'NOTA_CREDITO') {
      const credited = await this.prisma.invoice.aggregate({
        where: {
          companyId,
          associatedInvoiceId: associated.id,
          status: { in: ['AUTHORIZED', 'SENDING', 'UNKNOWN'] },
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        _sum: { total: true },
      });
      const available = new Decimal(associated.total).minus(credited._sum.total ?? 0);
      if (calc.total.gt(available)) {
        throw new BadRequestException(
          `El total de la nota de crédito (${calc.total.toFixed(2)}) supera el saldo disponible del comprobante original (${available.toFixed(2)})`,
        );
      }
    }

    return {
      invoice: {
        pointOfSaleId: pos.id,
        customerId: receiver.customerId,
        voucherType,
        concept: dto.concept,
        issueDate: parseDateOnly(dto.issueDate),
        serviceFrom: dto.serviceFrom ? parseDateOnly(dto.serviceFrom) : null,
        serviceTo: dto.serviceTo ? parseDateOnly(dto.serviceTo) : null,
        paymentDueDate: dto.paymentDueDate ? parseDateOnly(dto.paymentDueDate) : null,
        currency,
        exchangeRate: new Decimal(exchangeRate ?? 1),
        receiverName: receiver.name,
        receiverDocumentType: receiver.documentType,
        receiverDocumentNumber: receiver.documentNumber,
        receiverVatCondition: receiver.vatCondition,
        receiverAddress: receiver.address,
        netTaxed: calc.netTaxed,
        netUntaxed: calc.netUntaxed,
        exemptAmount: calc.exemptAmount,
        vatAmount: calc.vatAmount,
        otherTaxesAmount: calc.otherTaxesAmount,
        total: calc.total,
        notes: dto.notes ?? null,
        associatedInvoiceId: associated?.id ?? null,
      },
      items: items.map((item, i) => ({
        productId: item.productId,
        position: i + 1,
        description: item.description,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        discountPercent: new Decimal(item.discountPercent),
        vatTreatment: calc.items[i].vatTreatment,
        vatRate: calc.items[i].vatRate,
        netAmount: calc.items[i].netAmount,
        vatAmount: calc.items[i].vatAmount,
        totalAmount: calc.items[i].totalAmount,
      })),
      vat: calc.vatBreakdown.map((g) => ({ arcaId: g.arcaId, rate: g.rate, baseAmount: g.baseAmount, vatAmount: g.vatAmount })),
      taxes: calc.otherTaxes.map((t) => ({
        arcaTaxId: t.arcaTaxId,
        description: t.description,
        baseAmount: t.baseAmount,
        rate: t.rate,
        amount: t.amount,
      })),
    };
  }

  private async resolveReceiver(companyId: string, dto: CreateInvoiceDto) {
    if (dto.customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId, deletedAt: null } });
      if (!c) throw new BadRequestException('Cliente inexistente');
      const address = [c.address, c.city, c.province].filter(Boolean).join(', ') || null;
      return {
        customerId: c.id,
        name: c.name,
        documentType: c.documentType,
        documentNumber: c.documentNumber,
        vatCondition: c.vatCondition,
        address,
        priceListId: c.priceListId,
      };
    }
    if (dto.receiver) {
      const err = validateDocument(dto.receiver.documentType, dto.receiver.documentNumber);
      if (err) throw new BadRequestException(err);
      return {
        customerId: null,
        name: dto.receiver.name,
        documentType: dto.receiver.documentType,
        documentNumber: normalizeDocument(dto.receiver.documentType, dto.receiver.documentNumber),
        vatCondition: dto.receiver.vatCondition,
        address: dto.receiver.address ?? null,
        priceListId: null,
      };
    }
    return {
      customerId: null,
      name: 'Consumidor Final',
      documentType: 'SIN_IDENTIFICAR' as const,
      documentNumber: '0',
      vatCondition: 'CONSUMIDOR_FINAL' as const,
      address: null,
      priceListId: null,
    };
  }

  private async resolvePriceList(companyId: string, dto: CreateInvoiceDto, customerPriceListId: string | null) {
    const settings = await this.prisma.companySettings.findUnique({ where: { companyId } });
    const id = dto.priceListId ?? customerPriceListId ?? settings?.defaultPriceListId ?? null;
    if (!id) return null;
    const list = await this.prisma.priceList.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { items: true },
    });
    if (!list && dto.priceListId) throw new BadRequestException('Lista de precios inexistente');
    return list;
  }

  private async resolveAssociated(companyId: string, dto: CreateInvoiceDto, voucherType: number, excludeId?: string) {
    if (!dto.associatedInvoiceId) return null;
    if (dto.associatedInvoiceId === excludeId) throw new BadRequestException('Un comprobante no puede asociarse a sí mismo');
    const assoc = await this.prisma.invoice.findFirst({
      where: { id: dto.associatedInvoiceId, companyId },
      include: { pointOfSale: true },
    });
    if (!assoc) throw new BadRequestException('Comprobante asociado inexistente');
    if (assoc.status !== 'AUTHORIZED') throw new BadRequestException('El comprobante asociado debe estar autorizado por ARCA');
    if (VOUCHER_TYPES[assoc.voucherType].letter !== VOUCHER_TYPES[voucherType].letter) {
      throw new BadRequestException('El comprobante asociado debe ser de la misma letra');
    }
    return assoc;
  }

  private async resolveItems(
    companyId: string,
    company: Company,
    dto: CreateInvoiceDto,
    priceList: Prisma.PriceListGetPayload<{ include: { items: true } }> | null,
    currency: string,
  ) {
    const productIds = [...new Set(dto.items.map((i) => i.productId).filter((id): id is string => Boolean(id)))];
    const products = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds }, companyId, deletedAt: null } })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    return dto.items.map((item, idx) => {
      const product = item.productId ? byId.get(item.productId) : undefined;
      if (item.productId && !product) throw new BadRequestException(`Ítem ${idx + 1}: producto inexistente`);
      const description = item.description?.trim() || product?.name;
      if (!description) throw new BadRequestException(`Ítem ${idx + 1}: falta la descripción`);

      let unitPrice: Decimal.Value | undefined = item.unitPrice;
      if (unitPrice === undefined) {
        if (!product) throw new BadRequestException(`Ítem ${idx + 1}: indique el precio unitario`);
        if (currency !== 'PES') {
          throw new BadRequestException(`Ítem ${idx + 1}: en moneda extranjera indique el precio unitario`);
        }
        const listItem = priceList?.items.find((li) => li.productId === product.id);
        unitPrice = effectivePrice(
          product.price,
          priceList ? { adjustmentPercent: priceList.adjustmentPercent, itemPrice: listItem?.price } : null,
        );
      }

      // Emisores monotributistas/exentos no discriminan IVA: el tratamiento se conserva solo como referencia.
      const vatTreatment = item.vatTreatment ?? product?.vatTreatment ?? (company.taxCondition === 'RESPONSABLE_INSCRIPTO' ? 'GRAVADO' : 'NO_GRAVADO');
      const vatRate =
        vatTreatment === 'GRAVADO' ? (item.vatRate ?? (product ? Number(product.vatRate) : 21)) : 0;

      return {
        productId: product?.id ?? null,
        description,
        quantity: item.quantity,
        unitPrice,
        discountPercent: item.discountPercent ?? 0,
        vatTreatment,
        vatRate,
      };
    });
  }
}
