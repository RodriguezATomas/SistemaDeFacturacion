import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Trash2, Truck, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ConfirmDialog, DataTable, EmptyState, Field, PageHeader, Pagination, SearchInput, useDebounced } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Badge, Input, NativeSelect, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import { DOCUMENT_TYPES, VAT_CONDITIONS } from '@/lib/constants';
import { partySchema } from '@/lib/schemas';
import type { Customer, Paginated, PriceList, Supplier } from '@/lib/types';
import { formatCuit } from '@/lib/utils';
import { useCan } from '@/stores/auth-store';

type Kind = 'customers' | 'suppliers';
type PartyRow = Customer & Supplier;

const CONFIG = {
  customers: { title: 'Clientes', singular: 'cliente', icon: UsersRound, read: 'customers.read', write: 'customers.write' },
  suppliers: { title: 'Proveedores', singular: 'proveedor', icon: Truck, read: 'suppliers.read', write: 'suppliers.write' },
} as const;

const formSchema = partySchema.and(
  z.object({
    priceListId: z.string().optional().transform((v) => (v ? v : null)),
    contactName: z.string().trim().max(150).optional().transform((v) => (v ? v : null)),
  }),
);

function PartyDialog({ kind, open, onOpenChange, editing }: { kind: Kind; open: boolean; onOpenChange: (o: boolean) => void; editing: PartyRow | null }) {
  const cfg = CONFIG[kind];
  const { data: priceLists } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api<PriceList[]>('/price-lists'),
    enabled: open && kind === 'customers',
  });
  const form = useZodForm(formSchema);
  const e = form.formState.errors;
  const docType = form.watch('documentType');

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: editing?.name ?? '',
      documentType: editing?.documentType ?? 'CUIT',
      documentNumber: editing?.documentNumber ?? '',
      vatCondition: editing?.vatCondition ?? (kind === 'customers' ? 'CONSUMIDOR_FINAL' : 'RESPONSABLE_INSCRIPTO'),
      email: editing?.email ?? '',
      phone: editing?.phone ?? '',
      address: editing?.address ?? '',
      city: editing?.city ?? '',
      province: editing?.province ?? '',
      postalCode: editing?.postalCode ?? '',
      notes: editing?.notes ?? '',
      priceListId: editing?.priceListId ?? '',
      contactName: editing?.contactName ?? '',
    });
  }, [open, editing, form, kind]);

  useEffect(() => {
    if (docType === 'SIN_IDENTIFICAR') form.setValue('documentNumber', '0');
  }, [docType, form]);

  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      editing ? api(`/${kind}/${editing.id}`, { method: 'PATCH', body }) : api(`/${kind}`, { method: 'POST', body }),
    { invalidate: [[kind]], success: editing ? `${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} actualizado` : `${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} creado`, onSuccess: () => onOpenChange(false) },
  );

  const onSubmit = form.handleSubmit((values) => {
    const body: Record<string, unknown> = { ...values };
    if (kind === 'customers') delete body.contactName;
    else delete body.priceListId;
    save.mutate(body);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${cfg.singular}` : `Nuevo ${cfg.singular}`}</DialogTitle>
          <DialogDescription>Los datos fiscales se utilizan para emitir comprobantes ante ARCA.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Nombre o razón social" error={e.name?.message} className="sm:col-span-2">
            <Input {...form.register('name')} autoFocus />
          </Field>
          <Field label="Tipo de documento">
            <NativeSelect {...form.register('documentType')}>
              {Object.entries(DOCUMENT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Número" error={e.documentNumber?.message}>
            <Input {...form.register('documentNumber')} disabled={docType === 'SIN_IDENTIFICAR'} />
          </Field>
          <Field label="Condición frente al IVA" error={e.vatCondition?.message} className="sm:col-span-2">
            <NativeSelect {...form.register('vatCondition')}>
              {Object.entries(VAT_CONDITIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Email" error={e.email?.message}>
            <Input type="email" {...form.register('email')} />
          </Field>
          <Field label="Teléfono">
            <Input {...form.register('phone')} />
          </Field>
          <Field label="Domicilio" className="sm:col-span-2">
            <Input {...form.register('address')} />
          </Field>
          <Field label="Localidad">
            <Input {...form.register('city')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provincia">
              <Input {...form.register('province')} />
            </Field>
            <Field label="C.P.">
              <Input {...form.register('postalCode')} />
            </Field>
          </div>
          {kind === 'customers' ? (
            <Field label="Lista de precios" className="sm:col-span-2" hint="Se aplica automáticamente al facturar a este cliente">
              <NativeSelect {...form.register('priceListId')}>
                <option value="">Precio base</option>
                {priceLists?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <Field label="Persona de contacto" className="sm:col-span-2">
              <Input {...form.register('contactName')} />
            </Field>
          )}
          <Field label="Observaciones" className="sm:col-span-2">
            <Textarea rows={2} {...form.register('notes')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PartiesPage({ kind }: { kind: Kind }) {
  const cfg = CONFIG[kind];
  const canWrite = useCan(cfg.write);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; editing: PartyRow | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<PartyRow | null>(null);
  const q = useDebounced(search);

  useEffect(() => setPage(1), [q, kind]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [kind, { q, page }],
    queryFn: () => api<Paginated<PartyRow>>(`/${kind}`, { query: { search: q, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });

  const remove = useApiMutation((id: string) => api(`/${kind}/${id}`, { method: 'DELETE' }), {
    invalidate: [[kind]],
    success: 'Registro eliminado',
    onSuccess: () => setDeleting(null),
  });

  return (
    <>
      <PageHeader
        title={cfg.title}
        icon={cfg.icon}
        description={kind === 'customers' ? 'Administrá la cartera de clientes y su información fiscal.' : 'Registro de proveedores de la empresa.'}
        actions={
          canWrite && (
            <Button onClick={() => setDialog({ open: true, editing: null })}>
              <Plus /> Nuevo {cfg.singular}
            </Button>
          )
        }
      />
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, documento o email…" className="sm:w-96" />
      </div>
      <DataTable<PartyRow>
        rows={data?.data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          {
            header: 'Nombre',
            cell: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
              </div>
            ),
          },
          {
            header: 'Documento',
            cell: (r) => (
              <span className="tabular text-sm">
                {DOCUMENT_TYPES[r.documentType]} {r.documentType === 'CUIT' || r.documentType === 'CUIL' ? formatCuit(r.documentNumber) : r.documentNumber}
              </span>
            ),
          },
          { header: 'Condición IVA', cell: (r) => <Badge tone="muted">{VAT_CONDITIONS[r.vatCondition]}</Badge>, className: 'hidden md:table-cell' },
          ...(kind === 'customers'
            ? [{ header: 'Lista de precios', cell: (r: PartyRow) => r.priceList?.name ?? <span className="text-muted-foreground">Base</span>, className: 'hidden lg:table-cell' }]
            : [{ header: 'Contacto', cell: (r: PartyRow) => r.contactName ?? '—', className: 'hidden lg:table-cell' }]),
          { header: 'Teléfono', cell: (r) => r.phone ?? '—', className: 'hidden lg:table-cell' },
          {
            header: '',
            className: 'w-12 text-right',
            cell: (r) =>
              canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: r })}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => setDeleting(r)}>
                      <Trash2 /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
          },
        ]}
        empty={
          <EmptyState
            icon={cfg.icon}
            title={q ? 'Sin resultados' : `Todavía no hay ${cfg.title.toLowerCase()}`}
            description={q ? 'Probá con otro término de búsqueda.' : `Cargá tu primer ${cfg.singular} para comenzar.`}
            action={canWrite && !q && <Button size="sm" onClick={() => setDialog({ open: true, editing: null })}><Plus /> Nuevo {cfg.singular}</Button>}
          />
        }
        footer={data && data.meta.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
      />
      <PartyDialog kind={kind} open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Eliminar ${cfg.singular}`}
        description={<>¿Eliminar a <b>{deleting?.name}</b>? Los comprobantes ya emitidos conservan sus datos.</>}
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
