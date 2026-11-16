import { Loader2, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { EmptyState } from '@/components/shared/common';
import { useAuthStore } from '@/stores/auth-store';

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/** Rutas privadas: requiere sesión y, salvo indicación, una empresa activa. */
export function RequireAuth({ children, company = true }: { children: ReactNode; company?: boolean }) {
  const { status, me } = useAuthStore();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous' || !me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (company && !me.activeCompanyId) {
    if (me.user.isPlatformAdmin && me.companies.length === 0) return <Navigate to="/plataforma/empresas" replace />;
    return <Navigate to="/seleccionar-empresa" replace />;
  }
  return <>{children}</>;
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { status } = useAuthStore();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Protección visual por permiso. El backend aplica la autorización real en cada endpoint. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const allowed = useAuthStore((s) => Boolean(s.me?.permissions.includes(permission)));
  if (!allowed) {
    return <EmptyState icon={ShieldOff} title="Acceso restringido" description="Su rol no tiene permisos para ver esta sección." />;
  }
  return <>{children}</>;
}

export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((s) => Boolean(s.me?.user.isPlatformAdmin));
  if (!isAdmin) return <EmptyState icon={ShieldOff} title="Acceso restringido" description="Solo administradores de la plataforma." />;
  return <>{children}</>;
}
