import { normalizeDocument, validateDocument } from './party.dto';

describe('validación de documentos', () => {
  it('valida CUIT con dígito verificador', () => {
    expect(validateDocument('CUIT', '20-12345678-6')).toBeNull();
    expect(validateDocument('CUIT', '20-12345678-7')).toMatch(/inválido/);
  });

  it('valida DNI de 7 u 8 dígitos', () => {
    expect(validateDocument('DNI', '12.345.678')).toBeNull();
    expect(validateDocument('DNI', '123')).not.toBeNull();
  });

  it('exige 0 para sin identificar', () => {
    expect(validateDocument('SIN_IDENTIFICAR', '0')).toBeNull();
    expect(validateDocument('SIN_IDENTIFICAR', '123')).not.toBeNull();
  });

  it('normaliza números', () => {
    expect(normalizeDocument('CUIT', '20-12345678-6')).toBe('20123456786');
    expect(normalizeDocument('SIN_IDENTIFICAR', '')).toBe('0');
    expect(normalizeDocument('PASAPORTE', ' AB123 ')).toBe('AB123');
  });
});
