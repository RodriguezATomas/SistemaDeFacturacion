export const TAX_CONDITIONS = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  EXENTO: 'IVA Sujeto Exento',
} as const;
export type TaxCondition = keyof typeof TAX_CONDITIONS;

export const VAT_CONDITIONS = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  CONSUMIDOR_FINAL: 'Consumidor Final',
  EXENTO: 'IVA Sujeto Exento',
  NO_CATEGORIZADO: 'Sujeto No Categorizado',
  MONOTRIBUTO_SOCIAL: 'Monotributista Social',
  MONOTRIBUTO_TRABAJADOR_PROMOVIDO: 'Monotributo Trabajador Promovido',
  NO_ALCANZADO: 'IVA No Alcanzado',
  LIBERADO_LEY_19640: 'IVA Liberado – Ley 19.640',
  PROVEEDOR_EXTERIOR: 'Proveedor del Exterior',
  CLIENTE_EXTERIOR: 'Cliente del Exterior',
} as const;
export type VatCondition = keyof typeof VAT_CONDITIONS;

export const DOCUMENT_TYPES = {
  CUIT: 'CUIT',
  CUIL: 'CUIL',
  DNI: 'DNI',
  CDI: 'CDI',
  PASAPORTE: 'Pasaporte',
  SIN_IDENTIFICAR: 'Sin identificar',
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const VAT_TREATMENTS = { GRAVADO: 'Gravado', EXENTO: 'Exento', NO_GRAVADO: 'No gravado' } as const;
export type VatTreatment = keyof typeof VAT_TREATMENTS;

export const VAT_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;

export const PRODUCT_TYPES = { PRODUCT: 'Producto', SERVICE: 'Servicio' } as const;

export const CONCEPTS = {
  PRODUCTS: 'Productos',
  SERVICES: 'Servicios',
  PRODUCTS_AND_SERVICES: 'Productos y servicios',
} as const;
export type Concept = keyof typeof CONCEPTS;

export const VOUCHER_KINDS = { FACTURA: 'Factura', NOTA_DEBITO: 'Nota de débito', NOTA_CREDITO: 'Nota de crédito' } as const;
export type VoucherKind = keyof typeof VOUCHER_KINDS;

export const VOUCHER_TYPES: Record<number, { name: string; short: string; letter: 'A' | 'B' | 'C'; kind: VoucherKind }> = {
  1: { name: 'Factura A', short: 'FA', letter: 'A', kind: 'FACTURA' },
  2: { name: 'Nota de Débito A', short: 'NDA', letter: 'A', kind: 'NOTA_DEBITO' },
  3: { name: 'Nota de Crédito A', short: 'NCA', letter: 'A', kind: 'NOTA_CREDITO' },
  6: { name: 'Factura B', short: 'FB', letter: 'B', kind: 'FACTURA' },
  7: { name: 'Nota de Débito B', short: 'NDB', letter: 'B', kind: 'NOTA_DEBITO' },
  8: { name: 'Nota de Crédito B', short: 'NCB', letter: 'B', kind: 'NOTA_CREDITO' },
  11: { name: 'Factura C', short: 'FC', letter: 'C', kind: 'FACTURA' },
  12: { name: 'Nota de Débito C', short: 'NDC', letter: 'C', kind: 'NOTA_DEBITO' },
  13: { name: 'Nota de Crédito C', short: 'NCC', letter: 'C', kind: 'NOTA_CREDITO' },
};

export const INVOICE_STATUS = {
  DRAFT: { label: 'Borrador', tone: 'muted' },
  SENDING: { label: 'Enviando', tone: 'info' },
  AUTHORIZED: { label: 'Autorizado', tone: 'success' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
  UNKNOWN: { label: 'A conciliar', tone: 'warning' },
} as const;
export type InvoiceStatus = keyof typeof INVOICE_STATUS;

export const CURRENCIES = { PES: 'Pesos ($)', DOL: 'Dólar (US$)', '060': 'Euro (€)' } as const;

export const OTHER_TAX_TYPES: Record<number, string> = {
  1: 'Impuestos nacionales',
  2: 'Impuestos provinciales',
  3: 'Impuestos municipales',
  4: 'Impuestos internos',
  5: 'IIBB',
  6: 'Percepción de IVA',
  7: 'Percepción de IIBB',
  8: 'Percepciones municipales',
  9: 'Otras percepciones',
  13: 'Percepción de IVA a no categorizado',
  99: 'Otros',
};

export const SUBSCRIPTION_STATUS = {
  TRIAL: 'Prueba',
  ACTIVE: 'Activa',
  PAST_DUE: 'Pago pendiente',
  CANCELED: 'Cancelada',
} as const;

export const PERMISSION_MODULES: Record<string, string> = {
  dashboard: 'Panel',
  empresa: 'Empresa',
  usuarios: 'Usuarios y roles',
  auditoria: 'Auditoría',
  suscripcion: 'Suscripción',
  clientes: 'Clientes',
  proveedores: 'Proveedores',
  productos: 'Productos',
  precios: 'Listas de precios',
  facturacion: 'Facturación',
  arca: 'ARCA',
};
