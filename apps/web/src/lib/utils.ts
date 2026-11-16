import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const moneyFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: string | number | null | undefined, currency = 'PES'): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  const symbol = currency === 'PES' ? '$' : currency === 'DOL' ? 'US$' : currency === '060' ? '€' : currency;
  return `${symbol} ${moneyFmt.format(Number.isFinite(n) ? n : 0)}`;
}

export function formatNumber(value: string | number, decimals = 2): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimals }).format(Number(value));
}

/** Fechas date-only del backend (UTC medianoche) → dd/mm/aaaa sin corrimiento de zona horaria. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const iso = typeof value === 'string' ? value : value.toISOString();
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatCuit(value: string | null | undefined): string {
  if (!value) return '—';
  const d = value.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : value;
}

export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

export function voucherNumber(pos: number | null | undefined, number: number | null | undefined): string {
  const p = pos == null ? '-----' : String(pos).padStart(5, '0');
  const n = number == null ? '--------' : String(number).padStart(8, '0');
  return `${p}-${n}`;
}

/** Fecha de hoy en Argentina (YYYY-MM-DD). */
export function todayAr(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

export function idempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
