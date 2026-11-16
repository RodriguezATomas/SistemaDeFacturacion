import { DocumentType, TaxCondition, VatCondition, VatTreatment } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  VAT_RATE_TO_ARCA_ID,
  VOUCHER_TYPES,
  VoucherKind,
  VoucherLetter,
  voucherTypeCode,
} from './fiscal.constants';

/**
 * Motor de cálculo fiscal. Funciones puras, sin acceso a base ni red, para que la lógica
 * de impuestos sea verificable con pruebas unitarias.
 */

const MONOTRIBUTO_CONDITIONS: VatCondition[] = [
  'MONOTRIBUTO',
  'MONOTRIBUTO_SOCIAL',
  'MONOTRIBUTO_TRABAJADOR_PROMOVIDO',
];

export class FiscalRuleError extends Error {}

/**
 * Letra del comprobante según condición del emisor y del receptor:
 * - Emisor Monotributo o Exento → C.
 * - Emisor Responsable Inscripto → A si el receptor es RI o monotributista; B en el resto
 *   (consumidor final, exento, no categorizado, etc.).
 * Las operaciones con clientes del exterior requieren Factura E (WSFEX) y no se emiten por WSFEv1.
 */
export function determineLetter(emitter: TaxCondition, receiver: VatCondition): VoucherLetter {
  if (emitter === 'MONOTRIBUTO' || emitter === 'EXENTO') return 'C';
  if (receiver === 'CLIENTE_EXTERIOR') {
    throw new FiscalRuleError(
      'Las operaciones con clientes del exterior requieren Factura de Exportación (E) mediante WSFEX.',
    );
  }
  if (receiver === 'RESPONSABLE_INSCRIPTO' || MONOTRIBUTO_CONDITIONS.includes(receiver)) return 'A';
  return 'B';
}

export function resolveVoucherType(
  emitter: TaxCondition,
  receiver: VatCondition,
  kind: VoucherKind,
): number {
  return voucherTypeCode(determineLetter(emitter, receiver), kind);
}

/** Valida que el tipo elegido sea coherente con emisor, receptor y documento. */
export function validateVoucherRules(params: {
  voucherType: number;
  emitter: TaxCondition;
  receiverVatCondition: VatCondition;
  receiverDocumentType: DocumentType;
  hasAssociatedInvoice: boolean;
}): void {
  const info = VOUCHER_TYPES[params.voucherType];
  if (!info) throw new FiscalRuleError(`Tipo de comprobante ${params.voucherType} no soportado`);
  const expected = determineLetter(params.emitter, params.receiverVatCondition);
  if (info.letter !== expected) {
    throw new FiscalRuleError(
      `Para el emisor y receptor indicados corresponde comprobante ${expected}, no ${info.letter}.`,
    );
  }
  if (info.letter === 'A' && params.receiverDocumentType !== 'CUIT') {
    throw new FiscalRuleError('Los comprobantes A requieren que el receptor se identifique con CUIT.');
  }
  if (info.kind !== 'FACTURA' && !params.hasAssociatedInvoice) {
    throw new FiscalRuleError('Las notas de crédito y débito deben asociar el comprobante original.');
  }
}

export interface CalcItemInput {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  discountPercent?: Decimal.Value;
  vatTreatment: VatTreatment;
  vatRate: Decimal.Value;
}

export interface CalcTaxInput {
  arcaTaxId: number;
  description: string;
  baseAmount: Decimal.Value;
  rate: Decimal.Value;
}

export interface CalcItemResult {
  vatTreatment: VatTreatment;
  vatRate: Decimal;
  netAmount: Decimal;
  vatAmount: Decimal;
  totalAmount: Decimal;
}

export interface VatGroup {
  arcaId: number;
  rate: Decimal;
  baseAmount: Decimal;
  vatAmount: Decimal;
}

export interface CalcResult {
  items: CalcItemResult[];
  netTaxed: Decimal;
  netUntaxed: Decimal;
  exemptAmount: Decimal;
  vatAmount: Decimal;
  vatBreakdown: VatGroup[];
  otherTaxes: Array<CalcTaxInput & { amount: Decimal; baseAmount: Decimal; rate: Decimal }>;
  otherTaxesAmount: Decimal;
  total: Decimal;
}

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function vatArcaId(rate: Decimal.Value): number {
  const key = new Decimal(rate).toString();
  const id = VAT_RATE_TO_ARCA_ID[key];
  if (!id) throw new FiscalRuleError(`Alícuota de IVA no válida: ${key}%`);
  return id;
}

/**
 * Calcula importes del comprobante.
 * - Comprobantes A y B discriminan IVA por alícuota (array Iva de WSFEv1). El IVA total es la
 *   suma de los importes por alícuota (base agrupada × tasa), que es lo que valida ARCA.
 * - Comprobantes C no discriminan IVA: todo el importe se informa como neto (ImpNeto) e ImpIVA = 0.
 */
export function calculateInvoice(
  letter: VoucherLetter,
  items: CalcItemInput[],
  taxes: CalcTaxInput[] = [],
): CalcResult {
  if (!items.length) throw new FiscalRuleError('El comprobante debe tener al menos un ítem');

  let netTaxed = new Decimal(0);
  let netUntaxed = new Decimal(0);
  let exemptAmount = new Decimal(0);
  const groups = new Map<string, { rate: Decimal; base: Decimal }>();

  const itemResults: CalcItemResult[] = items.map((item) => {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const discount = new Decimal(item.discountPercent ?? 0);
    if (qty.lte(0)) throw new FiscalRuleError('La cantidad debe ser mayor a cero');
    if (price.lt(0)) throw new FiscalRuleError('El precio no puede ser negativo');
    if (discount.lt(0) || discount.gt(100)) throw new FiscalRuleError('Descuento inválido');

    const net = r2(qty.mul(price).mul(new Decimal(1).minus(discount.div(100))));

    if (letter === 'C') {
      netTaxed = netTaxed.plus(net);
      return { vatTreatment: item.vatTreatment, vatRate: new Decimal(0), netAmount: net, vatAmount: new Decimal(0), totalAmount: net };
    }

    if (item.vatTreatment === 'EXENTO') {
      exemptAmount = exemptAmount.plus(net);
      return { vatTreatment: 'EXENTO', vatRate: new Decimal(0), netAmount: net, vatAmount: new Decimal(0), totalAmount: net };
    }
    if (item.vatTreatment === 'NO_GRAVADO') {
      netUntaxed = netUntaxed.plus(net);
      return { vatTreatment: 'NO_GRAVADO', vatRate: new Decimal(0), netAmount: net, vatAmount: new Decimal(0), totalAmount: net };
    }

    const rate = new Decimal(item.vatRate);
    vatArcaId(rate);
    const key = rate.toString();
    const group = groups.get(key) ?? { rate, base: new Decimal(0) };
    group.base = group.base.plus(net);
    groups.set(key, group);
    netTaxed = netTaxed.plus(net);
    const vat = r2(net.mul(rate).div(100));
    return { vatTreatment: 'GRAVADO', vatRate: rate, netAmount: net, vatAmount: vat, totalAmount: net.plus(vat) };
  });

  const vatBreakdown: VatGroup[] = [...groups.values()]
    .map((g) => ({
      arcaId: vatArcaId(g.rate),
      rate: g.rate,
      baseAmount: r2(g.base),
      vatAmount: r2(g.base.mul(g.rate).div(100)),
    }))
    .sort((a, b) => a.arcaId - b.arcaId);
  const vatAmount = vatBreakdown.reduce((acc, g) => acc.plus(g.vatAmount), new Decimal(0));

  const otherTaxes = taxes.map((t) => {
    const base = r2(new Decimal(t.baseAmount));
    const rate = new Decimal(t.rate);
    if (base.lt(0) || rate.lt(0)) throw new FiscalRuleError('Tributo con importes negativos');
    return { ...t, baseAmount: base, rate, amount: r2(base.mul(rate).div(100)) };
  });
  const otherTaxesAmount = otherTaxes.reduce((acc, t) => acc.plus(t.amount), new Decimal(0));

  const total = r2(netTaxed.plus(netUntaxed).plus(exemptAmount).plus(vatAmount).plus(otherTaxesAmount));

  return {
    items: itemResults,
    netTaxed: r2(netTaxed),
    netUntaxed: r2(netUntaxed),
    exemptAmount: r2(exemptAmount),
    vatAmount: r2(vatAmount),
    vatBreakdown,
    otherTaxes,
    otherTaxesAmount: r2(otherTaxesAmount),
    total,
  };
}
