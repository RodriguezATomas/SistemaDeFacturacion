import { describe, expect, it } from 'vitest';
import { expectedLetter, previewTotals } from './invoice-calc';
import { invoiceSchema, partySchema, registerSchema } from './schemas';
import { formatCuit, formatDate, formatMoney, isValidCuit, voucherNumber } from './utils';

describe('utilidades de formato', () => {
  it('formatea montos en pesos argentinos', () => {
    expect(formatMoney('1234.5')).toBe('$ 1.234,50');
    expect(formatMoney(10, 'DOL')).toBe('US$ 10,00');
  });

  it('formatea fechas date-only sin corrimiento de zona horaria', () => {
    expect(formatDate('2026-11-16T00:00:00.000Z')).toBe('16/11/2026');
    expect(formatDate(null)).toBe('—');
  });

  it('formatea y valida CUIT', () => {
    expect(formatCuit('20123456786')).toBe('20-12345678-6');
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('20-12345678-7')).toBe(false);
  });

  it('arma la numeración del comprobante', () => {
    expect(voucherNumber(3, 18)).toBe('00003-00000018');
    expect(voucherNumber(3, null)).toBe('00003---------');
  });
});

describe('vista previa fiscal (misma regla que el backend)', () => {
  it('determina la letra', () => {
    expect(expectedLetter('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO')).toBe('A');
    expect(expectedLetter('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO')).toBe('A');
    expect(expectedLetter('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL')).toBe('B');
    expect(expectedLetter('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO')).toBe('C');
    expect(expectedLetter('RESPONSABLE_INSCRIPTO', 'CLIENTE_EXTERIOR')).toBeNull();
  });

  it('calcula IVA agrupado por alícuota', () => {
    const r = previewTotals('A', [
      { quantity: 2, unitPrice: 100, discountPercent: 0, vatTreatment: 'GRAVADO', vatRate: 21 },
      { quantity: 1, unitPrice: 50, discountPercent: 0, vatTreatment: 'GRAVADO', vatRate: 10.5 },
      { quantity: 1, unitPrice: 30, discountPercent: 0, vatTreatment: 'EXENTO', vatRate: 0 },
    ]);
    expect(r.netTaxed).toBe(250);
    expect(r.exempt).toBe(30);
    expect(r.vatGroups).toEqual([
      { rate: 10.5, base: 50, vat: 5.25 },
      { rate: 21, base: 200, vat: 42 },
    ]);
    expect(r.total).toBe(327.25);
  });

  it('no discrimina IVA en comprobantes C', () => {
    const r = previewTotals('C', [{ quantity: 1, unitPrice: 1500, discountPercent: 10, vatTreatment: 'GRAVADO', vatRate: 21 }]);
    expect(r.vat).toBe(0);
    expect(r.total).toBe(1350);
  });
});

describe('esquemas de validación', () => {
  it('valida el registro', () => {
    const base = {
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@empresa.com',
      password: 'ClaveSegura123',
      confirm: 'ClaveSegura123',
      company: { legalName: 'Empresa SA', cuit: '30-50001091-2', taxCondition: 'RESPONSABLE_INSCRIPTO' },
    };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, confirm: 'otra' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'sinnumeros' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, company: { ...base.company, cuit: '30500010913' } }).success).toBe(false);
  });

  it('valida documentos de clientes según su tipo', () => {
    const base = { name: 'Cliente', documentType: 'DNI' as const, documentNumber: '12345678', vatCondition: 'CONSUMIDOR_FINAL' };
    expect(partySchema.safeParse(base).success).toBe(true);
    expect(partySchema.safeParse({ ...base, documentNumber: '12' }).success).toBe(false);
    expect(partySchema.safeParse({ ...base, documentType: 'CUIT', documentNumber: '20123456787' }).success).toBe(false);
    const parsed = partySchema.parse({ ...base, email: '' });
    expect(parsed.email).toBeNull();
  });

  it('exige fechas para servicios y comprobante asociado para notas', () => {
    const base = {
      pointOfSaleId: 'pv',
      kind: 'FACTURA' as const,
      concept: 'SERVICES' as const,
      issueDate: '2026-11-16',
      currency: 'PES',
      exchangeRate: 1,
      items: [{ description: 'x', quantity: 1, unitPrice: 10, discountPercent: 0, vatTreatment: 'GRAVADO' as const, vatRate: 21 }],
    };
    const r = invoiceSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['serviceFrom', 'serviceTo', 'paymentDueDate']));
    const nc = invoiceSchema.safeParse({ ...base, concept: 'PRODUCTS', kind: 'NOTA_CREDITO' });
    expect(nc.error?.issues[0].path[0]).toBe('associatedInvoiceId');
  });
});
