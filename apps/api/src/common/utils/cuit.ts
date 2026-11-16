/** Valida CUIT/CUIL argentino (11 dígitos con dígito verificador módulo 11). */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

export function normalizeCuit(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCuit(value: string): string {
  const d = normalizeCuit(value);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : value;
}
