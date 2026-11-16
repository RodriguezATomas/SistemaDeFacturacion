import {
  calculateInvoice,
  determineLetter,
  FiscalRuleError,
  resolveVoucherType,
  validateVoucherRules,
} from './fiscal-engine';

describe('determineLetter', () => {
  it('emisor monotributista o exento emite C', () => {
    expect(determineLetter('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO')).toBe('C');
    expect(determineLetter('EXENTO', 'CONSUMIDOR_FINAL')).toBe('C');
  });

  it('RI a RI o monotributista emite A', () => {
    expect(determineLetter('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO')).toBe('A');
    expect(determineLetter('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO')).toBe('A');
    expect(determineLetter('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO_SOCIAL')).toBe('A');
  });

  it('RI a consumidor final o exento emite B', () => {
    expect(determineLetter('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL')).toBe('B');
    expect(determineLetter('RESPONSABLE_INSCRIPTO', 'EXENTO')).toBe('B');
    expect(determineLetter('RESPONSABLE_INSCRIPTO', 'NO_CATEGORIZADO')).toBe('B');
  });

  it('cliente del exterior requiere WSFEX', () => {
    expect(() => determineLetter('RESPONSABLE_INSCRIPTO', 'CLIENTE_EXTERIOR')).toThrow(FiscalRuleError);
  });

  it('resuelve códigos de comprobante ARCA', () => {
    expect(resolveVoucherType('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO', 'FACTURA')).toBe(1);
    expect(resolveVoucherType('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL', 'NOTA_CREDITO')).toBe(8);
    expect(resolveVoucherType('MONOTRIBUTO', 'CONSUMIDOR_FINAL', 'NOTA_DEBITO')).toBe(12);
  });
});

describe('validateVoucherRules', () => {
  const base = {
    emitter: 'RESPONSABLE_INSCRIPTO' as const,
    receiverVatCondition: 'RESPONSABLE_INSCRIPTO' as const,
    receiverDocumentType: 'CUIT' as const,
    hasAssociatedInvoice: false,
  };

  it('acepta Factura A a RI con CUIT', () => {
    expect(() => validateVoucherRules({ ...base, voucherType: 1 })).not.toThrow();
  });

  it('rechaza letra incorrecta', () => {
    expect(() => validateVoucherRules({ ...base, voucherType: 6 })).toThrow(/corresponde comprobante A/);
  });

  it('rechaza A sin CUIT', () => {
    expect(() => validateVoucherRules({ ...base, voucherType: 1, receiverDocumentType: 'DNI' })).toThrow(/CUIT/);
  });

  it('exige comprobante asociado en notas', () => {
    expect(() => validateVoucherRules({ ...base, voucherType: 3 })).toThrow(/asociar/);
    expect(() => validateVoucherRules({ ...base, voucherType: 3, hasAssociatedInvoice: true })).not.toThrow();
  });
});

describe('calculateInvoice', () => {
  it('discrimina IVA por alícuota en comprobantes A', () => {
    const r = calculateInvoice('A', [
      { quantity: 2, unitPrice: '100', vatTreatment: 'GRAVADO', vatRate: 21 },
      { quantity: 1, unitPrice: '50', vatTreatment: 'GRAVADO', vatRate: 10.5 },
      { quantity: 1, unitPrice: '30', vatTreatment: 'EXENTO', vatRate: 0 },
      { quantity: 1, unitPrice: '20', vatTreatment: 'NO_GRAVADO', vatRate: 0 },
    ]);
    expect(r.netTaxed.toFixed(2)).toBe('250.00');
    expect(r.exemptAmount.toFixed(2)).toBe('30.00');
    expect(r.netUntaxed.toFixed(2)).toBe('20.00');
    expect(r.vatBreakdown.map((g) => [g.arcaId, g.baseAmount.toFixed(2), g.vatAmount.toFixed(2)])).toEqual([
      [4, '50.00', '5.25'],
      [5, '200.00', '42.00'],
    ]);
    expect(r.vatAmount.toFixed(2)).toBe('47.25');
    expect(r.total.toFixed(2)).toBe('347.25');
  });

  it('incluye alícuota 0% como gravada en el array de IVA', () => {
    const r = calculateInvoice('B', [{ quantity: 1, unitPrice: '100', vatTreatment: 'GRAVADO', vatRate: 0 }]);
    expect(r.vatBreakdown).toHaveLength(1);
    expect(r.vatBreakdown[0].arcaId).toBe(3);
    expect(r.total.toFixed(2)).toBe('100.00');
  });

  it('aplica descuentos y redondea a 2 decimales', () => {
    const r = calculateInvoice('B', [
      { quantity: '3', unitPrice: '33.3333', discountPercent: 10, vatTreatment: 'GRAVADO', vatRate: 21 },
    ]);
    expect(r.items[0].netAmount.toFixed(2)).toBe('90.00');
    expect(r.vatAmount.toFixed(2)).toBe('18.90');
    expect(r.total.toFixed(2)).toBe('108.90');
  });

  it('calcula el IVA sobre la base agrupada (no suma de redondeos por línea)', () => {
    const items = Array.from({ length: 3 }, () => ({
      quantity: 1,
      unitPrice: '0.05',
      vatTreatment: 'GRAVADO' as const,
      vatRate: 21,
    }));
    const r = calculateInvoice('A', items);
    // base 0.15 × 21% = 0.0315 → 0.03 (línea a línea daría 3 × 0.01 = 0.03 también, pero se usa el agrupado)
    expect(r.vatBreakdown[0].baseAmount.toFixed(2)).toBe('0.15');
    expect(r.vatAmount.toFixed(2)).toBe('0.03');
  });

  it('comprobantes C no discriminan IVA', () => {
    const r = calculateInvoice('C', [
      { quantity: 2, unitPrice: '150', vatTreatment: 'GRAVADO', vatRate: 21 },
      { quantity: 1, unitPrice: '10', vatTreatment: 'EXENTO', vatRate: 0 },
    ]);
    expect(r.netTaxed.toFixed(2)).toBe('310.00');
    expect(r.vatAmount.toFixed(2)).toBe('0.00');
    expect(r.exemptAmount.toFixed(2)).toBe('0.00');
    expect(r.vatBreakdown).toHaveLength(0);
    expect(r.total.toFixed(2)).toBe('310.00');
  });

  it('suma otros tributos al total', () => {
    const r = calculateInvoice(
      'A',
      [{ quantity: 1, unitPrice: '1000', vatTreatment: 'GRAVADO', vatRate: 21 }],
      [{ arcaTaxId: 7, description: 'Percepción IIBB', baseAmount: '1000', rate: '3' }],
    );
    expect(r.otherTaxesAmount.toFixed(2)).toBe('30.00');
    expect(r.total.toFixed(2)).toBe('1240.00');
  });

  it('valida entradas', () => {
    expect(() => calculateInvoice('A', [])).toThrow(FiscalRuleError);
    expect(() =>
      calculateInvoice('A', [{ quantity: 0, unitPrice: 1, vatTreatment: 'GRAVADO', vatRate: 21 }]),
    ).toThrow(/cantidad/);
    expect(() =>
      calculateInvoice('A', [{ quantity: 1, unitPrice: 1, vatTreatment: 'GRAVADO', vatRate: 19 }]),
    ).toThrow(/Alícuota/);
  });
});
