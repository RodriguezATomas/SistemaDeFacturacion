import { DocumentType, InvoiceConcept, TaxCondition, VatCondition } from '@prisma/client';

/**
 * Catálogos fiscales de ARCA (WSFEv1). Los códigos corresponden a los métodos
 * FEParamGetTiposIva, FEParamGetTiposCbte, FEParamGetTiposDoc, FEParamGetTiposConcepto
 * y FEParamGetCondicionIvaReceptor. Ver docs/ARCA_INTEGRATION.md.
 */

export const VALID_VAT_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;

/** Alícuota (%) → Id de IVA de ARCA. */
export const VAT_RATE_TO_ARCA_ID: Record<string, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

export type VoucherLetter = 'A' | 'B' | 'C';
export type VoucherKind = 'FACTURA' | 'NOTA_DEBITO' | 'NOTA_CREDITO';

export interface VoucherTypeInfo {
  code: number;
  letter: VoucherLetter;
  kind: VoucherKind;
  name: string;
}

export const VOUCHER_TYPES: Record<number, VoucherTypeInfo> = {
  1: { code: 1, letter: 'A', kind: 'FACTURA', name: 'Factura A' },
  2: { code: 2, letter: 'A', kind: 'NOTA_DEBITO', name: 'Nota de Débito A' },
  3: { code: 3, letter: 'A', kind: 'NOTA_CREDITO', name: 'Nota de Crédito A' },
  6: { code: 6, letter: 'B', kind: 'FACTURA', name: 'Factura B' },
  7: { code: 7, letter: 'B', kind: 'NOTA_DEBITO', name: 'Nota de Débito B' },
  8: { code: 8, letter: 'B', kind: 'NOTA_CREDITO', name: 'Nota de Crédito B' },
  11: { code: 11, letter: 'C', kind: 'FACTURA', name: 'Factura C' },
  12: { code: 12, letter: 'C', kind: 'NOTA_DEBITO', name: 'Nota de Débito C' },
  13: { code: 13, letter: 'C', kind: 'NOTA_CREDITO', name: 'Nota de Crédito C' },
};

export function voucherTypeCode(letter: VoucherLetter, kind: VoucherKind): number {
  const found = Object.values(VOUCHER_TYPES).find((v) => v.letter === letter && v.kind === kind);
  if (!found) throw new Error(`Tipo de comprobante inexistente: ${kind} ${letter}`);
  return found.code;
}

export const DOCUMENT_TYPE_TO_ARCA: Record<DocumentType, number> = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  PASAPORTE: 94,
  DNI: 96,
  SIN_IDENTIFICAR: 99,
};

export const VAT_CONDITION_TO_ARCA: Record<VatCondition, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  NO_CATEGORIZADO: 7,
  PROVEEDOR_EXTERIOR: 8,
  CLIENTE_EXTERIOR: 9,
  LIBERADO_LEY_19640: 10,
  MONOTRIBUTO_SOCIAL: 13,
  NO_ALCANZADO: 15,
  MONOTRIBUTO_TRABAJADOR_PROMOVIDO: 16,
};

export const VAT_CONDITION_LABEL: Record<VatCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  EXENTO: 'IVA Sujeto Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
  MONOTRIBUTO: 'Responsable Monotributo',
  NO_CATEGORIZADO: 'Sujeto No Categorizado',
  PROVEEDOR_EXTERIOR: 'Proveedor del Exterior',
  CLIENTE_EXTERIOR: 'Cliente del Exterior',
  LIBERADO_LEY_19640: 'IVA Liberado – Ley N° 19.640',
  MONOTRIBUTO_SOCIAL: 'Monotributista Social',
  NO_ALCANZADO: 'IVA No Alcanzado',
  MONOTRIBUTO_TRABAJADOR_PROMOVIDO: 'Monotributo Trabajador Independiente Promovido',
};

export const TAX_CONDITION_LABEL: Record<TaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  EXENTO: 'IVA Sujeto Exento',
};

export const CONCEPT_TO_ARCA: Record<InvoiceConcept, number> = {
  PRODUCTS: 1,
  SERVICES: 2,
  PRODUCTS_AND_SERVICES: 3,
};

/** Monedas admitidas (FEParamGetTiposMonedas). */
export const CURRENCIES: Record<string, string> = {
  PES: 'Pesos argentinos',
  DOL: 'Dólar estadounidense',
  '060': 'Euro',
};

/** Tributos (FEParamGetTiposTributos) más utilizados. */
export const OTHER_TAX_TYPES: Record<number, string> = {
  1: 'Impuestos nacionales',
  2: 'Impuestos provinciales',
  3: 'Impuestos municipales',
  4: 'Impuestos internos',
  5: 'IIBB',
  6: 'Percepción de IVA',
  7: 'Percepción de IIBB',
  8: 'Percepciones por impuestos municipales',
  9: 'Otras percepciones',
  13: 'Percepción de IVA a no categorizado',
  99: 'Otros',
};
