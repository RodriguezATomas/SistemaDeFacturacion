import type { Concept, DocumentType, InvoiceStatus, TaxCondition, VatCondition, VatTreatment } from './constants';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Party {
  id: string;
  name: string;
  documentType: DocumentType;
  documentNumber: string;
  vatCondition: VatCondition;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  notes: string | null;
}

export interface Customer extends Party {
  priceListId: string | null;
  priceList?: { id: string; name: string } | null;
}

export interface Supplier extends Party {
  contactName: string | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  productsCount?: number;
}

export interface Product {
  id: string;
  type: 'PRODUCT' | 'SERVICE';
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  price: string;
  vatTreatment: VatTreatment;
  vatRate: string;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  isActive: boolean;
  effectivePrice?: string;
}

export interface PriceList {
  id: string;
  name: string;
  description: string | null;
  adjustmentPercent: string;
  isActive: boolean;
  itemsCount?: number;
  customersCount?: number;
  items?: Array<{ id: string; productId: string; price: string; product: { id: string; name: string; sku: string | null; price: string; unit: string } }>;
}

export interface PointOfSale {
  id: string;
  number: number;
  name: string;
  address: string | null;
  isActive: boolean;
  service: string;
}

export interface InvoiceListItem {
  id: string;
  voucherType: number;
  number: number | null;
  status: InvoiceStatus;
  issueDate: string;
  receiverName: string;
  receiverDocumentNumber: string;
  total: string;
  currency: string;
  cae: string | null;
  caeDueDate: string | null;
  arcaEnvironment: 'HOMOLOGATION' | 'PRODUCTION' | null;
  pointOfSale: { id: string; number: number };
}

export interface ArcaMessage {
  code: string;
  message: string;
}

export interface Invoice extends InvoiceListItem {
  pointOfSaleId: string;
  customerId: string | null;
  concept: Concept;
  serviceFrom: string | null;
  serviceTo: string | null;
  paymentDueDate: string | null;
  exchangeRate: string;
  receiverDocumentType: DocumentType;
  receiverVatCondition: VatCondition;
  receiverAddress: string | null;
  netTaxed: string;
  netUntaxed: string;
  exemptAmount: string;
  vatAmount: string;
  otherTaxesAmount: string;
  notes: string | null;
  associatedInvoiceId: string | null;
  authorizedAt: string | null;
  arcaObservations: ArcaMessage[] | null;
  arcaErrors: ArcaMessage[] | null;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string | null;
    position: number;
    description: string;
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    vatTreatment: VatTreatment;
    vatRate: string;
    netAmount: string;
    vatAmount: string;
    totalAmount: string;
  }>;
  vatBreakdown: Array<{ id: string; arcaId: number; rate: string; baseAmount: string; vatAmount: string }>;
  otherTaxes: Array<{ id: string; arcaTaxId: number; description: string; baseAmount: string; rate: string; amount: string }>;
  pointOfSale: PointOfSale;
  customer: { id: string; name: string; email: string | null } | null;
  associatedInvoice: { id: string; voucherType: number; number: number | null; issueDate: string; total: string; pointOfSale: { number: number } } | null;
  associatedNotes: Array<{ id: string; voucherType: number; number: number | null; status: InvoiceStatus; total: string }>;
  attempts: Array<{ id: string; attemptNumber: number; number: number; result: string; message: string | null; createdAt: string }>;
}

export interface Company {
  id: string;
  legalName: string;
  tradeName: string | null;
  cuit: string;
  taxCondition: TaxCondition;
  grossIncomeNumber: string | null;
  activityStartDate: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  settings: {
    arcaEnvironment: 'HOMOLOGATION' | 'PRODUCTION';
    defaultCurrency: string;
    defaultPriceListId: string | null;
    invoiceFooter: string | null;
  } | null;
}

export interface Member {
  id: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  createdAt: string;
  role: { id: string; name: string; systemKey: string | null };
  user: { id: string; email: string; firstName: string; lastName: string; lastLoginAt: string | null };
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  systemKey: string | null;
  membersCount: number;
  permissions: string[];
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  maxUsers: number | null;
  maxPointsOfSale: number | null;
  maxInvoicesPerMonth: number | null;
  isActive: boolean;
  _count?: { subscriptions: number };
}

export interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: Plan;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
}
