import { effectivePrice } from './pricing';

describe('effectivePrice', () => {
  it('sin lista devuelve el precio base', () => {
    expect(effectivePrice('100').toString()).toBe('100');
  });

  it('usa el precio específico de la lista si existe', () => {
    expect(effectivePrice('100', { adjustmentPercent: 10, itemPrice: '80' }).toString()).toBe('80');
  });

  it('aplica el ajuste porcentual de la lista', () => {
    expect(effectivePrice('100', { adjustmentPercent: 10 }).toString()).toBe('110');
    expect(effectivePrice('100', { adjustmentPercent: -15 }).toString()).toBe('85');
    expect(effectivePrice('33.3333', { adjustmentPercent: 7.5 }).toString()).toBe('35.8333');
  });
});
