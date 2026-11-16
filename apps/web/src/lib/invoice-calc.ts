/**
 * Vista previa de importes en el formulario de comprobantes. Replica las reglas del motor
 * fiscal del backend (que es quien calcula los importes definitivos al guardar).
 */
export interface PreviewItem {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatTreatment: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
  vatRate: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function previewTotals(letter: 'A' | 'B' | 'C', items: PreviewItem[]) {
  let netTaxed = 0;
  let netUntaxed = 0;
  let exempt = 0;
  const groups = new Map<number, number>();
  const lines = items.map((i) => {
    const net = r2((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) * (1 - (Number(i.discountPercent) || 0) / 100));
    if (letter === 'C') {
      netTaxed += net;
      return { net, vat: 0, total: net };
    }
    if (i.vatTreatment === 'EXENTO') {
      exempt += net;
      return { net, vat: 0, total: net };
    }
    if (i.vatTreatment === 'NO_GRAVADO') {
      netUntaxed += net;
      return { net, vat: 0, total: net };
    }
    netTaxed += net;
    groups.set(i.vatRate, (groups.get(i.vatRate) ?? 0) + net);
    const vat = r2((net * i.vatRate) / 100);
    return { net, vat, total: r2(net + vat) };
  });
  const vatGroups = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, base]) => ({ rate, base: r2(base), vat: r2((base * rate) / 100) }));
  const vat = r2(vatGroups.reduce((acc, g) => acc + g.vat, 0));
  return {
    lines,
    netTaxed: r2(netTaxed),
    netUntaxed: r2(netUntaxed),
    exempt: r2(exempt),
    vatGroups,
    vat,
    total: r2(netTaxed + netUntaxed + exempt + vat),
  };
}

/** Letra prevista según condición del emisor y del receptor (misma regla que el backend). */
export function expectedLetter(emitter: string, receiver: string): 'A' | 'B' | 'C' | null {
  if (emitter === 'MONOTRIBUTO' || emitter === 'EXENTO') return 'C';
  if (receiver === 'CLIENTE_EXTERIOR') return null;
  if (['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'MONOTRIBUTO_SOCIAL', 'MONOTRIBUTO_TRABAJADOR_PROMOVIDO'].includes(receiver)) return 'A';
  return 'B';
}
