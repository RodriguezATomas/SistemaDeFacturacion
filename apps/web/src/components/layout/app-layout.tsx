import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown, FileText, LogOut, Menu, Plus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
} from '@/components/ui/overlays';
import { Avatar, AvatarFallback, Badge } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { logout, switchCompany } from '@/lib/auth';
import type { Company } from '@/lib/types';
import { cn, formatCuit, initials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { NAV } from './nav';

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const me = useAuthStore((s) => s.me);
  if (!me) return null;
  const has = (p?: string) => !p || me.permissions.includes(p);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
          <FileText className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Facturación</p>
          <p className="text-[11px] text-sidebar-muted">Gestión empresarial</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((section) => {
          if (section.platformOnly && !me.user.isPlatformAdmin) return null;
          const items = section.items.filter(
            (i) => (section.platformOnly || (me.activeCompanyId && has(i.permission))) && (!i.saasOnly || me.deploymentMode === 'saas'),
          );
          if (!items.length) return null;
          return (
            <div key={section.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{section.title}</p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-white shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
                            : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-muted">
        {me.deploymentMode === 'saas' ? 'Plataforma SaaS' : 'Instalación privada'} · v1.0
      </div>
    </div>
  );
}

function CompanySwitcher() {
  const me = useAuthStore((s) => s.me)!;
  const navigate = useNavigate();
  const active = me.companies.find((c) => c.id === me.activeCompanyId);

  const change = async (id: string) => {
    if (id === me.activeCompanyId) return;
    try {
      await switchCompany(id);
      navigate('/');
      toast.success('Empresa cambiada');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto max-w-[260px] justify-start gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 text-left leading-tight">
            <p className="truncate text-sm font-semibold">{active?.tradeName || active?.legalName || 'Seleccionar empresa'}</p>
            {active && <p className="text-xs text-muted-foreground">CUIT {formatCuit(active.cuit)}</p>}
          </div>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Mis empresas</DropdownMenuLabel>
        {me.companies.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => change(c.id)}>
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.tradeName || c.legalName}</p>
              <p className="text-xs text-muted-foreground">
                {formatCuit(c.cuit)} · {c.role}
              </p>
            </div>
            {c.id === me.activeCompanyId && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
        {me.deploymentMode === 'saas' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/seleccionar-empresa?nueva=1')}>
              <Plus /> Nueva empresa
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EnvironmentBadge() {
  const activeCompanyId = useAuthStore((s) => s.me?.activeCompanyId);
  const { data } = useQuery({
    queryKey: ['company', 'current'],
    queryFn: () => api<Company>('/companies/current'),
    enabled: Boolean(activeCompanyId),
  });
  const env = data?.settings?.arcaEnvironment;
  if (!env) return null;
  return env === 'PRODUCTION' ? (
    <Badge tone="success" className="hidden sm:inline-flex">ARCA · Producción</Badge>
  ) : (
    <Badge tone="warning" className="hidden sm:inline-flex">ARCA · Homologación</Badge>
  );
}

export function AppLayout() {
  const me = useAuthStore((s) => s.me)!;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu />
          </Button>
          {me.companies.length > 0 && <CompanySwitcher />}
          <div className="ml-auto flex items-center gap-3">
            <EnvironmentBadge />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-ring focus-visible:ring-2" aria-label="Menú de usuario">
                  <Avatar>
                    <AvatarFallback>{initials(me.user.firstName, me.user.lastName)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-2">
                  <p className="text-sm font-medium">
                    {me.user.firstName} {me.user.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{me.user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/perfil">
                    <UserRound /> Mi perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={doLogout}>
                  <LogOut /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
