import { fromArcaDate, issueDateError, parseDateOnly, toArcaDate, todayInArgentina } from './invoice-dates';

describe('fechas de comprobantes', () => {
  it('convierte entre formatos', () => {
    const d = parseDateOnly('2026-11-16');
    expect(toArcaDate(d)).toBe('20261116');
    expect(fromArcaDate('20261116').toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('calcula el día en Argentina', () => {
    // 01:00 UTC del 17 es aún 16 en Argentina
    expect(todayInArgentina(new Date('2026-11-17T01:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-16');
  });

  it('valida la ventana de emisión según concepto', () => {
    const now = new Date('2026-11-16T15:00:00Z');
    expect(issueDateError('PRODUCTS', parseDateOnly('2026-11-11'), now)).toBeNull();
    expect(issueDateError('PRODUCTS', parseDateOnly('2026-11-10'), now)).toMatch(/±5/);
    expect(issueDateError('SERVICES', parseDateOnly('2026-11-06'), now)).toBeNull();
    expect(issueDateError('SERVICES', parseDateOnly('2026-11-27'), now)).toMatch(/±10/);
  });
});
