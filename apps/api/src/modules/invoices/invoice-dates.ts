import { InvoiceConcept } from '@prisma/client';

/** Fecha (YYYY-MM-DD) a Date en UTC medianoche, coherente con columnas @db.Date. */
export function parseDateOnly(value: string): Date {
  const d = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${value}`);
  return d;
}

/** Date → yyyymmdd (formato de fechas de WSFEv1). */
export function toArcaDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/** yyyymmdd → Date UTC. */
export function fromArcaDate(value: string): Date {
  return parseDateOnly(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
}

/** Fecha de hoy en Argentina (UTC-3) como Date UTC medianoche. */
export function todayInArgentina(now: Date = new Date()): Date {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return parseDateOnly(local.toISOString().slice(0, 10));
}

/**
 * Ventana de fecha de emisión admitida por WSFEv1: hasta 5 días antes/después para
 * productos y hasta 10 días para servicios, respecto de la fecha actual.
 */
export function issueDateError(concept: InvoiceConcept, issueDate: Date, now: Date = new Date()): string | null {
  const today = todayInArgentina(now);
  const diffDays = Math.round((issueDate.getTime() - today.getTime()) / 86400000);
  const window = concept === 'PRODUCTS' ? 5 : 10;
  if (Math.abs(diffDays) > window) {
    return `La fecha de emisión debe estar dentro de ±${window} días de la fecha actual para ${concept === 'PRODUCTS' ? 'productos' : 'servicios'}.`;
  }
  return null;
}
