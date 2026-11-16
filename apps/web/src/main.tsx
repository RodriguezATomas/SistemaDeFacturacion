import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireAuth, RequireGuest, RequirePermission, RequirePlatformAdmin } from '@/components/layout/guards';
import { TooltipProvider } from '@/components/ui/primitives';
import { bootstrapSession } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, SelectCompanyPage } from '@/pages/auth/auth-pages';
import { PriceListDetailPage, PriceListsPage } from '@/pages/catalog/price-lists-page';
import { ProductsPage } from '@/pages/catalog/products-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { InvoiceDetailPage } from '@/pages/invoices/invoice-detail-page';
import { InvoiceFormPage } from '@/pages/invoices/invoice-form-page';
import { InvoicesListPage } from '@/pages/invoices/invoices-list-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { PartiesPage } from '@/pages/parties/parties-page';
import { PlatformCompaniesPage, PlatformPlansPage } from '@/pages/platform/platform-pages';
import { ArcaPage } from '@/pages/settings/arca-page';
import { CompanyPage } from '@/pages/settings/company-page';
import { AuditPage, ProfilePage, SubscriptionPage } from '@/pages/settings/misc-pages';
import { PointsOfSalePage } from '@/pages/settings/points-of-sale-page';
import { RolesPage, UsersPage } from '@/pages/settings/users-roles-pages';
import './index.css';

const guard = (permission: string, element: JSX.Element) => <RequirePermission permission={permission}>{element}</RequirePermission>;

const router = createBrowserRouter([
  { path: '/login', element: <RequireGuest><LoginPage /></RequireGuest> },
  { path: '/registro', element: <RequireGuest><RegisterPage /></RequireGuest> },
  { path: '/recuperar-clave', element: <RequireGuest><ForgotPasswordPage /></RequireGuest> },
  { path: '/restablecer-clave', element: <ResetPasswordPage /> },
  { path: '/seleccionar-empresa', element: <RequireAuth company={false}><SelectCompanyPage /></RequireAuth> },
  {
    element: <RequireAuth company={false}><AppLayout /></RequireAuth>,
    children: [
      { path: '/perfil', element: <ProfilePage /> },
      { path: '/plataforma/empresas', element: <RequirePlatformAdmin><PlatformCompaniesPage /></RequirePlatformAdmin> },
      { path: '/plataforma/planes', element: <RequirePlatformAdmin><PlatformPlansPage /></RequirePlatformAdmin> },
      {
        element: <RequireAuth><Outlet /></RequireAuth>,
        children: [
          { path: '/', element: guard('dashboard.view', <DashboardPage />) },
          { path: '/comprobantes', element: guard('invoices.read', <InvoicesListPage />) },
          { path: '/comprobantes/nuevo', element: guard('invoices.write', <InvoiceFormPage />) },
          { path: '/comprobantes/:id', element: guard('invoices.read', <InvoiceDetailPage />) },
          { path: '/comprobantes/:id/editar', element: guard('invoices.write', <InvoiceFormPage />) },
          { path: '/clientes', element: guard('customers.read', <PartiesPage kind="customers" />) },
          { path: '/proveedores', element: guard('suppliers.read', <PartiesPage kind="suppliers" />) },
          { path: '/productos', element: guard('products.read', <ProductsPage />) },
          { path: '/listas-de-precios', element: guard('price_lists.read', <PriceListsPage />) },
          { path: '/listas-de-precios/:id', element: guard('price_lists.read', <PriceListDetailPage />) },
          { path: '/configuracion/empresa', element: guard('company.manage', <CompanyPage />) },
          { path: '/configuracion/puntos-de-venta', element: guard('invoices.read', <PointsOfSalePage />) },
          { path: '/configuracion/arca', element: guard('arca.manage', <ArcaPage />) },
          { path: '/configuracion/usuarios', element: guard('users.read', <UsersPage />) },
          { path: '/configuracion/roles', element: guard('users.read', <RolesPage />) },
          { path: '/configuracion/suscripcion', element: guard('subscription.read', <SubscriptionPage />) },
          { path: '/auditoria', element: guard('audit.read', <AuditPage />) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

function App() {
  useEffect(() => {
    void bootstrapSession();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
