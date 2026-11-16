import { formatCuit, isValidCuit, normalizeCuit } from './cuit';

describe('CUIT', () => {
  it('acepta CUIT con dígito verificador correcto', () => {
    expect(isValidCuit('20123456786')).toBe(true);
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('30500010912')).toBe(true);
  });

  it('rechaza dígito verificador incorrecto', () => {
    expect(isValidCuit('20123456787')).toBe(false);
    expect(isValidCuit('30500010913')).toBe(false);
  });

  it('rechaza longitudes inválidas', () => {
    expect(isValidCuit('123')).toBe(false);
    expect(isValidCuit('')).toBe(false);
  });

  it('normaliza y formatea', () => {
    expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
    expect(formatCuit('20123456786')).toBe('20-12345678-6');
  });
});
