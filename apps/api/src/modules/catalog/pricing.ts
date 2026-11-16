import Decimal from 'decimal.js';

/**
 * Precio efectivo de un producto en una lista: precio específico si existe; si no,
 * precio base ajustado por el porcentaje de la lista. Resultado redondeado a 4 decimales.
 */
export function effectivePrice(
  basePrice: Decimal.Value,
  list?: { adjustmentPercent: Decimal.Value; itemPrice?: Decimal.Value | null } | null,
): Decimal {
  if (!list) return new Decimal(basePrice);
  if (list.itemPrice !== undefined && list.itemPrice !== null) return new Decimal(list.itemPrice);
  return new Decimal(basePrice)
    .mul(new Decimal(1).plus(new Decimal(list.adjustmentPercent).div(100)))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
