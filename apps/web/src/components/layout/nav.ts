import {
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Shield,
  ShieldCheck,
  Store,
  Tags,
  Truck,
  Users,
  UsersRound,
  Layers,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  saasOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  platformOnly?: boolean;
}

export const NAV: NavSection[] = [
  {
    title: 'General',
    items: [{ to: '/', label: 'Panel', icon: LayoutDashboard, permission: 'dashboard.view' }],
  },
  {
    title: 'Ventas',
    items: [
      { to: '/comprobantes', label: 'Comprobantes', icon: Receipt, permission: 'invoices.read' },
      { to: '/clientes', label: 'Clientes', icon: UsersRound, permission: 'customers.read' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { to: '/productos', label: 'Productos y servicios', icon: Package, permission: 'products.read' },
      { to: '/listas-de-precios', label: 'Listas de precios', icon: Tags, permission: 'price_lists.read' },
    ],
  },
  {
    title: 'Compras',
    items: [{ to: '/proveedores', label: 'Proveedores', icon: Truck, permission: 'suppliers.read' }],
  },
  {
    title: 'Configuración',
    items: [
      { to: '/configuracion/empresa', label: 'Empresa', icon: Building2, permission: 'company.manage' },
      { to: '/configuracion/puntos-de-venta', label: 'Puntos de venta', icon: Store, permission: 'invoices.read' },
      { to: '/configuracion/arca', label: 'ARCA', icon: ShieldCheck, permission: 'arca.manage' },
      { to: '/configuracion/usuarios', label: 'Usuarios', icon: Users, permission: 'users.read' },
      { to: '/configuracion/roles', label: 'Roles y permisos', icon: Shield, permission: 'users.read' },
      { to: '/configuracion/suscripcion', label: 'Suscripción', icon: CreditCard, permission: 'subscription.read', saasOnly: true },
      { to: '/auditoria', label: 'Auditoría', icon: ClipboardList, permission: 'audit.read' },
    ],
  },
  {
    title: 'Plataforma',
    platformOnly: true,
    items: [
      { to: '/plataforma/empresas', label: 'Empresas', icon: FileText, saasOnly: true },
      { to: '/plataforma/planes', label: 'Planes', icon: Layers, saasOnly: true },
    ],
  },
];
