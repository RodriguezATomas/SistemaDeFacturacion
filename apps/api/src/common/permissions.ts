/**
 * Catálogo de permisos del sistema. Se sincroniza con la tabla `permissions` en el seed
 * y al iniciar la aplicación. Los roles de cada empresa referencian estos códigos.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: { code: 'dashboard.view', module: 'dashboard', description: 'Ver el panel principal' },
  COMPANY_MANAGE: { code: 'company.manage', module: 'empresa', description: 'Editar datos y configuración de la empresa' },
  USERS_READ: { code: 'users.read', module: 'usuarios', description: 'Ver usuarios de la empresa' },
  USERS_MANAGE: { code: 'users.manage', module: 'usuarios', description: 'Invitar, editar y desactivar usuarios' },
  ROLES_MANAGE: { code: 'roles.manage', module: 'usuarios', description: 'Administrar roles y permisos' },
  AUDIT_READ: { code: 'audit.read', module: 'auditoria', description: 'Consultar el registro de auditoría' },
  SUBSCRIPTION_READ: { code: 'subscription.read', module: 'suscripcion', description: 'Ver plan y suscripción' },
  CUSTOMERS_READ: { code: 'customers.read', module: 'clientes', description: 'Ver clientes' },
  CUSTOMERS_WRITE: { code: 'customers.write', module: 'clientes', description: 'Crear, editar y eliminar clientes' },
  SUPPLIERS_READ: { code: 'suppliers.read', module: 'proveedores', description: 'Ver proveedores' },
  SUPPLIERS_WRITE: { code: 'suppliers.write', module: 'proveedores', description: 'Crear, editar y eliminar proveedores' },
  PRODUCTS_READ: { code: 'products.read', module: 'productos', description: 'Ver productos, servicios y categorías' },
  PRODUCTS_WRITE: { code: 'products.write', module: 'productos', description: 'Administrar productos, servicios y categorías' },
  PRICE_LISTS_READ: { code: 'price_lists.read', module: 'precios', description: 'Ver listas de precios' },
  PRICE_LISTS_WRITE: { code: 'price_lists.write', module: 'precios', description: 'Administrar listas de precios' },
  INVOICES_READ: { code: 'invoices.read', module: 'facturacion', description: 'Ver comprobantes' },
  INVOICES_WRITE: { code: 'invoices.write', module: 'facturacion', description: 'Crear y editar borradores de comprobantes' },
  INVOICES_EMIT: { code: 'invoices.emit', module: 'facturacion', description: 'Emitir comprobantes ante ARCA' },
  POS_MANAGE: { code: 'pos.manage', module: 'facturacion', description: 'Administrar puntos de venta' },
  ARCA_MANAGE: { code: 'arca.manage', module: 'arca', description: 'Administrar certificados y conexión con ARCA' },
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['code'];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS).map((p) => p.code);

const P = PERMISSIONS;

/** Plantillas de roles de sistema creadas para cada empresa nueva. */
export const SYSTEM_ROLE_TEMPLATES: Array<{
  key: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
}> = [
  {
    key: 'owner',
    name: 'Propietario',
    description: 'Acceso total a la empresa',
    permissions: ALL_PERMISSION_CODES,
  },
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Administra la operación, usuarios y configuración fiscal',
    permissions: ALL_PERMISSION_CODES,
  },
  {
    key: 'billing',
    name: 'Facturación',
    description: 'Gestiona clientes, productos y emite comprobantes',
    permissions: [
      P.DASHBOARD_VIEW.code,
      P.CUSTOMERS_READ.code,
      P.CUSTOMERS_WRITE.code,
      P.PRODUCTS_READ.code,
      P.PRICE_LISTS_READ.code,
      P.INVOICES_READ.code,
      P.INVOICES_WRITE.code,
      P.INVOICES_EMIT.code,
    ],
  },
  {
    key: 'viewer',
    name: 'Consulta',
    description: 'Acceso de solo lectura',
    permissions: [
      P.DASHBOARD_VIEW.code,
      P.CUSTOMERS_READ.code,
      P.SUPPLIERS_READ.code,
      P.PRODUCTS_READ.code,
      P.PRICE_LISTS_READ.code,
      P.INVOICES_READ.code,
    ],
  },
];
