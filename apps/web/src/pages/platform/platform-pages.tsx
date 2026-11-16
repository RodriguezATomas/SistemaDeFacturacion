import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building, Building2, FileText, Layers, Pencil, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { DataTable, EmptyState, Field, PageHeader, Pagination, SearchInput, StatCard, useDebounced } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Badge, Input, Label, NativeSelect, Switch, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import { SUBSCRIPTION_STATUS } from '@/lib/constants';
import type { Paginated, Plan } from '@/lib/types';
import { formatCuit, formatDate, formatMoney } from '@/lib/utils';

interface PlatformCompany {
  id: string;
  legalName: string;
  cuit: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  subscription: { id: string; status: keyof typeof SUBSCRIPTION_STATUS; trialEndsAt: string | null; currentPeriodEnd: string | null; plan: { id: string; name: string } } | null;
  _count: { members: number; invoices: number };
}

export function PlatformCompaniesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PlatformCompany | null>(null);
  const [form, setForm] = useState({ planId: '', status: 'TRIAL', currentPeriodEnd: '', trialEndsAt: '', companyStatus: 'ACTIVE' });
  const q = useDebounced(search);
  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: () => api<{ companies: number; activeCompanies: number; users: number; authorizedInvoices: number }>('/platform/stats') });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform', 'companies', { q, page }],
    queryFn: () => api<Paginated<PlatformCompany>>('/platform/companies', { query: { search: q, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const { data: plans = [] } = useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api<Plan[]>('/platform/plans') });

  const saveSub = useApiMutation(
    async () => {
      if (!editing) return;
      await api(`/platform/companies/${editing.id}/subscription`, {
        method: 'PATCH',
        body: { planId: form.planId, status: form.status, currentPeriodEnd: form.currentPeriodEnd || null, trialEndsAt: form.trialEndsAt || null },
      });
      if (form.companyStatus !== editing.status) {
        await api(`/platform/companies/${editing.id}/status`, { method: 'PATCH', body: { status: form.companyStatus } });
      }
    },
    { invalidate: [['platform']], success: 'Empresa actualizada', onSuccess: () => setEditing(null) },
  );

  const open = (c: PlatformCompany) => {
    setForm({
      planId: c.subscription?.plan.id ?? plans[0]?.id ?? '',
      status: c.subscription?.status ?? 'ACTIVE',
      currentPeriodEnd: c.subscription?.currentPeriodEnd?.slice(0, 10) ?? '',
      trialEndsAt: c.subscription?.trialEndsAt?.slice(0, 10) ?? '',
      companyStatus: c.status,
    });
    setEditing(c);
  };

  return (
    <>
      <PageHeader title="Empresas de la plataforma" icon={Building} description="Administración central de clientes SaaS, planes y suscripciones." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Empresas" value={stats.data?.companies ?? '—'} icon={Building2} />
        <StatCard label="Activas" value={stats.data?.activeCompanies ?? '—'} icon={Building} tone="success" />
        <StatCard label="Usuarios" value={stats.data?.users ?? '—'} icon={Users} tone="muted" />
        <StatCard label="Comprobantes autorizados" value={stats.data?.authorizedInvoices ?? '—'} icon={FileText} tone="warning" />
      </div>
      <div className="mb-4"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Razón social o CUIT…" /></div>
      <DataTable<PlatformCompany>
        rows={data?.data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          { header: 'Empresa', cell: (c) => <div><p className="font-medium">{c.legalName}</p><p className="text-xs text-muted-foreground">CUIT {formatCuit(c.cuit)}</p></div> },
          { header: 'Plan', cell: (c) => c.subscription?.plan.name ?? '—' },
          { header: 'Suscripción', cell: (c) => c.subscription ? <Badge tone={c.subscription.status === 'ACTIVE' ? 'success' : c.subscription.status === 'TRIAL' ? 'info' : 'danger'}>{SUBSCRIPTION_STATUS[c.subscription.status]}</Badge> : '—' },
          { header: 'Estado', cell: (c) => (c.status === 'ACTIVE' ? <Badge tone="success">Activa</Badge> : <Badge tone="danger">Suspendida</Badge>) },
          { header: 'Usuarios / Comp.', cell: (c) => `${c._count.members} / ${c._count.invoices}`, className: 'hidden md:table-cell' },
          { header: 'Alta', cell: (c) => formatDate(c.createdAt), className: 'hidden lg:table-cell' },
          { header: '', className: 'w-12', cell: (c) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open(c)} aria-label="Editar"><Pencil /></Button> },
        ]}
        empty={<EmptyState icon={Building} title="Sin empresas" />}
        footer={data && data.meta.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
      />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{editing?.legalName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="Plan">
              <NativeSelect value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Estado de suscripción">
              <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(SUBSCRIPTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fin de prueba"><Input type="date" value={form.trialEndsAt} onChange={(e) => setForm({ ...form, trialEndsAt: e.target.value })} /></Field>
              <Field label="Fin de período"><Input type="date" value={form.currentPeriodEnd} onChange={(e) => setForm({ ...form, currentPeriodEnd: e.target.value })} /></Field>
            </div>
            <Field label="Estado de la empresa" hint="Suspender revoca el acceso de todos sus usuarios">
              <NativeSelect value={form.companyStatus} onChange={(e) => setForm({ ...form, companyStatus: e.target.value })}>
                <option value="ACTIVE">Activa</option>
                <option value="SUSPENDED">Suspendida</option>
              </NativeSelect>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button loading={saveSub.isPending} onClick={() => saveSub.mutate(undefined)}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const limit = z.union([z.literal(''), z.coerce.number().int().min(1)]).transform((v) => (v === '' ? null : v));
const planSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Minúsculas, números y guiones'),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(300).optional().transform((v) => (v ? v : null)),
  priceMonthly: z.coerce.number().min(0),
  maxUsers: limit,
  maxPointsOfSale: limit,
  maxInvoicesPerMonth: limit,
  isActive: z.boolean(),
});

export function PlatformPlansPage() {
  const [dialog, setDialog] = useState<{ open: boolean; editing: Plan | null }>({ open: false, editing: null });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api<Plan[]>('/platform/plans') });
  const form = useZodForm(planSchema);
  useEffect(() => {
    if (!dialog.open) return;
    const p = dialog.editing;
    form.reset({
      code: p?.code ?? '',
      name: p?.name ?? '',
      description: p?.description ?? '',
      priceMonthly: p ? Number(p.priceMonthly) : 0,
      maxUsers: p?.maxUsers ?? '',
      maxPointsOfSale: p?.maxPointsOfSale ?? '',
      maxInvoicesPerMonth: p?.maxInvoicesPerMonth ?? '',
      isActive: p?.isActive ?? true,
    });
  }, [dialog, form]);
  const save = useApiMutation(
    (body: unknown) => (dialog.editing ? api(`/platform/plans/${dialog.editing.id}`, { method: 'PATCH', body }) : api('/platform/plans', { method: 'POST', body })),
    { invalidate: [['platform']], success: 'Plan guardado', onSuccess: () => setDialog({ open: false, editing: null }) },
  );
  const e = form.formState.errors;
  return (
    <>
      <PageHeader title="Planes" icon={Layers} description="Límites operativos y precio de cada plan SaaS." actions={<Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> Nuevo plan</Button>} />
      <DataTable<Plan>
        rows={data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          { header: 'Plan', cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.code}</p></div> },
          { header: 'Precio mensual', cell: (p) => formatMoney(p.priceMonthly) },
          { header: 'Usuarios', cell: (p) => p.maxUsers ?? '∞' },
          { header: 'PV', cell: (p) => p.maxPointsOfSale ?? '∞' },
          { header: 'Comp./mes', cell: (p) => p.maxInvoicesPerMonth ?? '∞' },
          { header: 'Empresas', cell: (p) => p._count?.subscriptions ?? 0, className: 'hidden md:table-cell' },
          { header: 'Estado', cell: (p) => (p.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>) },
          { header: '', className: 'w-12', cell: (p) => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ open: true, editing: p })} aria-label="Editar"><Pencil /></Button> },
        ]}
        empty={<EmptyState icon={Layers} title="Sin planes" description="Ejecutá el seed para crear los planes iniciales." />}
      />
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog.editing ? 'Editar plan' : 'Nuevo plan'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Código" error={e.code?.message}><Input {...form.register('code')} /></Field>
            <Field label="Nombre" error={e.name?.message}><Input {...form.register('name')} /></Field>
            <Field label="Descripción" className="sm:col-span-2"><Textarea rows={2} {...form.register('description')} /></Field>
            <Field label="Precio mensual" error={e.priceMonthly?.message}><Input type="number" step="0.01" {...form.register('priceMonthly')} /></Field>
            <Field label="Máx. usuarios" hint="Vacío = sin límite"><Input type="number" {...form.register('maxUsers')} /></Field>
            <Field label="Máx. puntos de venta" hint="Vacío = sin límite"><Input type="number" {...form.register('maxPointsOfSale')} /></Field>
            <Field label="Máx. comprobantes/mes" hint="Vacío = sin límite"><Input type="number" {...form.register('maxInvoicesPerMonth')} /></Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch id="plan-active" checked={form.watch('isActive')} onCheckedChange={(v) => form.setValue('isActive', v)} />
              <Label htmlFor="plan-active">Disponible</Label>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancelar</Button>
              <Button type="submit" loading={save.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
