import { z } from 'zod';
import { isValidCuit } from './utils';

/**
 * Esquemas Zod de formularios. Validan en el cliente para dar feedback inmediato;
 * el backend vuelve a validar todo (nunca se confía solo en el frontend).
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(128)
  .regex(/[A-Za-z]/, 'Debe incluir letras')
  .regex(/\d/, 'Debe incluir números');

export const cuitSchema = z
  .string()
  .trim()
  .refine((v) => isValidCuit(v), 'CUIT inválida');

export const loginSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
});

export const companySchema = z.object({
  legalName: z.string().trim().min(2, 'Ingrese la razón social').max(200),
  cuit: cuitSchema,
  taxCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO']),
});

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Requerido').max(100),
    lastName: z.string().trim().min(1, 'Requerido').max(100),
    email: z.string().trim().email('Email inválido'),
    password: passwordSchema,
    confirm: z.string(),
    company: companySchema,
  })
  .refine((d) => d.password === d.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });

const documentTypes = ['CUIT', 'CUIL', 'DNI', 'CDI', 'PASAPORTE', 'SIN_IDENTIFICAR'] as const;

export const partySchema = z
  .object({
    name: z.string().trim().min(1, 'Ingrese el nombre').max(200),
    documentType: z.enum(documentTypes),
    documentNumber: z.string().trim().max(30),
    vatCondition: z.string().min(1, 'Seleccione la condición frente al IVA'),
    email: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success, 'Email inválido')
      .transform((v) => (v ? v : null)),
    phone: optionalText(50),
    address: optionalText(250),
    city: optionalText(100),
    province: optionalText(100),
    postalCode: optionalText(20),
    notes: optionalText(1000),
  })
  .superRefine((d, ctx) => {
    const digits = d.documentNumber.replace(/\D/g, '');
    if ((d.documentType === 'CUIT' || d.documentType === 'CUIL') && !isValidCuit(digits)) {
      ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: `${d.documentType} inválido` });
    }
    if (d.documentType === 'DNI' && !/^\d{7,8}$/.test(digits)) {
      ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: 'El DNI debe tener 7 u 8 dígitos' });
    }
    if (d.documentType === 'SIN_IDENTIFICAR' && digits !== '0' && digits !== '') {
      ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: 'Use 0 para sin identificar' });
    }
  });

export const productSchema = z.object({
  type: z.enum(['PRODUCT', 'SERVICE']),
  sku: optionalText(60),
  name: z.string().trim().min(1, 'Ingrese el nombre').max(200),
  description: optionalText(1000),
  unit: z.string().trim().min(1).max(30),
  price: z.coerce.number({ error: 'Ingrese un precio' }).min(0, 'No puede ser negativo'),
  vatTreatment: z.enum(['GRAVADO', 'EXENTO', 'NO_GRAVADO']),
  vatRate: z.coerce.number(),
  categoryId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  isActive: z.boolean(),
});

export const invoiceItemSchema = z.object({
  productId: z.string().nullable().optional(),
  description: z.string().trim().min(1, 'Ingrese la descripción').max(300),
  quantity: z.coerce.number().positive('Debe ser mayor a 0'),
  unitPrice: z.coerce.number().min(0, 'No puede ser negativo'),
  discountPercent: z.coerce.number().min(0).max(100),
  vatTreatment: z.enum(['GRAVADO', 'EXENTO', 'NO_GRAVADO']),
  vatRate: z.coerce.number(),
});

export const invoiceSchema = z
  .object({
    pointOfSaleId: z.string().min(1, 'Seleccione el punto de venta'),
    kind: z.enum(['FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO']),
    customerId: z.string().optional(),
    concept: z.enum(['PRODUCTS', 'SERVICES', 'PRODUCTS_AND_SERVICES']),
    issueDate: z.string().min(10, 'Fecha requerida'),
    serviceFrom: z.string().optional(),
    serviceTo: z.string().optional(),
    paymentDueDate: z.string().optional(),
    currency: z.string(),
    exchangeRate: z.coerce.number().positive(),
    priceListId: z.string().optional(),
    associatedInvoiceId: z.string().optional(),
    notes: z.string().max(1000).optional(),
    items: z.array(invoiceItemSchema).min(1, 'Agregue al menos un ítem'),
  })
  .superRefine((d, ctx) => {
    if (d.concept !== 'PRODUCTS') {
      for (const f of ['serviceFrom', 'serviceTo', 'paymentDueDate'] as const) {
        if (!d[f]) ctx.addIssue({ code: 'custom', path: [f], message: 'Requerido para servicios' });
      }
      if (d.serviceFrom && d.serviceTo && d.serviceFrom > d.serviceTo) {
        ctx.addIssue({ code: 'custom', path: ['serviceTo'], message: 'Debe ser posterior al inicio' });
      }
    }
    if (d.kind !== 'FACTURA' && !d.associatedInvoiceId) {
      ctx.addIssue({ code: 'custom', path: ['associatedInvoiceId'], message: 'Seleccione el comprobante asociado' });
    }
  });

export type InvoiceFormValues = z.input<typeof invoiceSchema>;
