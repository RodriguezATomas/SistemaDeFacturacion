import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, CreditCard, KeyRound, UserRound } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { DataTable, EmptyState, ErrorState, Field, PageHeader, Pagination, SearchInput, useDebounced } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, NativeSelect, Skeleton } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import { loadMe } from '@/lib/auth';
import { SUBSCRIPTION_STATUS } from '@/lib/constants';
import { passwordSchema } from '@/lib/schemas';
import type { AuditEntry, Paginated, Subscription } from '@/lib/types';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

interface SubscriptionInfo {
  deploymentMode: 'saas' | 'private';
  subscription: Subscription | null;
  writable: boolean;
  usage: { users: number; pointsOfSale: number; invoicesThisMonth: number };
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular text-muted-foreground">{used} / {max ?? '∞'}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: max ? `${pct}%` : '0%' }} />
      </div>
    </div>
  );
}

export function SubscriptionPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['subscription'], queryFn: () => api<SubscriptionInfo>('/companies/current/subscription') });
  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) return <Card><ErrorState message={errorMessage(error)} onRetry={refetch} /></Card>;
  const sub = data.subscription;
  return (
    <>
      <PageHeader title="Suscripción" icon={CreditCard} description="Plan contratado y uso de la plataforma." />
      {!data.writable && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          La suscripción no está vigente: el sistema funciona en modo de solo lectura. Contactá al equipo comercial para regularizarla.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Plan actual</CardDescription>
            <CardTitle className="text-2xl">{sub?.plan.name ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sub && <Badge tone={sub.status === 'ACTIVE' ? 'success' : sub.status === 'TRIAL' ? 'info' : 'danger'}>{SUBSCRIPTION_STATUS[sub.status]}</Badge>}
            {sub?.status === 'TRIAL' && <p className="text-muted-foreground">La prueba finaliza el {formatDate(sub.trialEndsAt)}.</p>}
            {sub?.currentPeriodEnd && <p className="text-muted-foreground">Período vigente hasta el {formatDate(sub.currentPeriodEnd)}.</p>}
            {sub && Number(sub.plan.priceMonthly) > 0 && <p className="tabular text-lg font-semibold">{formatMoney(sub.plan.priceMonthly)} <span className="text-sm font-normal text-muted-foreground">/ mes</span></p>}
            {sub?.plan.description && <p className="text-muted-foreground">{sub.plan.description}</p>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Uso del plan</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <UsageBar label="Usuarios" used={data.usage.users} max={sub?.plan.maxUsers ?? null} />
            <UsageBar label="Puntos de venta activos" used={data.usage.pointsOfSale} max={sub?.plan.maxPointsOfSale ?? null} />
            <UsageBar label="Comprobantes autorizados este mes" used={data.usage.invoicesThisMonth} max={sub?.plan.maxInvoicesPerMonth ?? null} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const q = useDebounced(action);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit', { q, entity, page }],
    queryFn: () => api<Paginated<AuditEntry>>('/audit-logs', { query: { action: q, entity, page, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });
  const entities = ['invoice', 'customer', 'supplier', 'product', 'price_list', 'company', 'company_user', 'role', 'fiscal_credential', 'point_of_sale', 'user'];
  return (
    <>
      <PageHeader title="Auditoría" icon={ClipboardList} description="Registro inalterable de acciones relevantes realizadas en la empresa." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="Filtrar por acción (ej.: invoice.authorized)…" />
        <NativeSelect value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="sm:w-56" aria-label="Entidad">
          <option value="">Todas las entidades</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </NativeSelect>
      </div>
      <DataTable<AuditEntry>
        rows={data?.data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          { header: 'Fecha', cell: (a) => <span className="tabular text-xs">{formatDateTime(a.createdAt)}</span> },
          { header: 'Usuario', cell: (a) => (a.user ? `${a.user.firstName} ${a.user.lastName}` : <span className="text-muted-foreground">Sistema</span>) },
          { header: 'Acción', cell: (a) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.action}</code> },
          { header: 'Entidad', cell: (a) => <span className="text-xs text-muted-foreground">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}</span>, className: 'hidden md:table-cell' },
          { header: 'IP', cell: (a) => <span className="text-xs text-muted-foreground">{a.ip ?? '—'}</span>, className: 'hidden lg:table-cell' },
        ]}
        empty={<EmptyState icon={ClipboardList} title="Sin registros" />}
        footer={data && data.meta.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
      />
    </>
  );
}

const profileSchema = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100) });
const pwdSchema = z
  .object({ currentPassword: z.string().min(1, 'Requerido'), newPassword: passwordSchema, confirm: z.string() })
  .refine((d) => d.newPassword === d.confirm, { path: ['confirm'], message: 'No coinciden' });

export function ProfilePage() {
  const me = useAuthStore((s) => s.me)!;
  const profile = useZodForm(profileSchema, { defaultValues: { firstName: me.user.firstName, lastName: me.user.lastName } });
  const pwd = useZodForm(pwdSchema);
  const saveProfile = useApiMutation((body: unknown) => api('/auth/me', { method: 'PATCH', body }), { success: 'Perfil actualizado', onSuccess: () => void loadMe() });
  const savePwd = useApiMutation((body: unknown) => api('/auth/change-password', { method: 'POST', body }), {
    success: 'Contraseña actualizada. Se cerraron las demás sesiones.',
    onSuccess: () => pwd.reset({ currentPassword: '', newPassword: '', confirm: '' }),
  });
  return (
    <>
      <PageHeader title="Mi perfil" icon={UserRound} description={me.user.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={profile.handleSubmit((v) => saveProfile.mutate(v))} noValidate>
            <CardHeader><CardTitle>Datos personales</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" error={profile.formState.errors.firstName?.message}><Input {...profile.register('firstName')} /></Field>
              <Field label="Apellido" error={profile.formState.errors.lastName?.message}><Input {...profile.register('lastName')} /></Field>
              <Field label="Email" className="sm:col-span-2"><Input value={me.user.email} disabled /></Field>
            </CardContent>
            <CardFooter className="justify-end"><Button type="submit" loading={saveProfile.isPending}>Guardar</Button></CardFooter>
          </form>
        </Card>
        <Card>
          <form onSubmit={pwd.handleSubmit(({ confirm: _c, ...v }) => savePwd.mutate(v))} noValidate>
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Cambiar contraseña</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Contraseña actual" error={pwd.formState.errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...pwd.register('currentPassword')} /></Field>
              <Field label="Nueva contraseña" error={pwd.formState.errors.newPassword?.message} hint="10+ caracteres, letras y números"><Input type="password" autoComplete="new-password" {...pwd.register('newPassword')} /></Field>
              <Field label="Repetir nueva contraseña" error={pwd.formState.errors.confirm?.message}><Input type="password" autoComplete="new-password" {...pwd.register('confirm')} /></Field>
            </CardContent>
            <CardFooter className="justify-end"><Button type="submit" loading={savePwd.isPending}>Actualizar contraseña</Button></CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}
