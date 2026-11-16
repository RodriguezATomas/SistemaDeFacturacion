import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ConfirmDialog, DataTable, EmptyState, ErrorState, Field, PageHeader, SearchInput, useDebounced } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import type { Paginated, PriceList, Product } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import { useCan } from '@/stores/auth-store';

const listSchema = z.object({
  name: z.string().trim().min(1, 'Ingrese el nombre').max(100),
  description: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
  adjustmentPercent: z.coerce.number().min(-100).max(1000),
});

function ListDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: PriceList | null }) {
  const form = useZodForm(listSchema);
  useEffect(() => {
    if (open) form.reset({ name: editing?.name ?? '', description: editing?.description ?? '', adjustmentPercent: editing ? Number(editing.adjustmentPercent) : 0 });
  }, [open, editing, form]);
  const save = useApiMutation(
    (body: unknown) => (editing ? api(`/price-lists/${editing.id}`, { method: 'PATCH', body }) : api('/price-lists', { method: 'POST', body })),
    { invalidate: [['price-lists']], success: 'Lista guardada', onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{editing ? 'Editar lista' : 'Nueva lista de precios'}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
          <Field label="Nombre" error={form.formState.errors.name?.message}><Input {...form.register('name')} autoFocus /></Field>
          <Field label="Descripción"><Textarea rows={2} {...form.register('description')} /></Field>
          <Field label="Ajuste general (%)" hint="Se aplica sobre el precio base a los productos sin precio específico. Ej.: -10 = 10% de descuento." error={form.formState.errors.adjustmentPercent?.message}>
            <Input type="number" step="0.01" {...form.register('adjustmentPercent')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PriceListsPage() {
  const canWrite = useCan('price_lists.write');
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<{ open: boolean; editing: PriceList | null }>({ open: false, editing: null });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['price-lists'], queryFn: () => api<PriceList[]>('/price-lists') });
  return (
    <>
      <PageHeader
        title="Listas de precios"
        icon={Tags}
        description="Precios diferenciados por segmento de cliente."
        actions={canWrite && <Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> Nueva lista</Button>}
      />
      <DataTable<PriceList>
        rows={data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        onRowClick={(l) => navigate(`/listas-de-precios/${l.id}`)}
        columns={[
          { header: 'Lista', cell: (l) => <div><p className="font-medium">{l.name}</p>{l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}</div> },
          { header: 'Ajuste general', cell: (l) => <Badge tone={Number(l.adjustmentPercent) < 0 ? 'success' : Number(l.adjustmentPercent) > 0 ? 'warning' : 'muted'}>{Number(l.adjustmentPercent) > 0 ? '+' : ''}{Number(l.adjustmentPercent)}%</Badge> },
          { header: 'Precios específicos', cell: (l) => l.itemsCount ?? 0, className: 'hidden sm:table-cell' },
          { header: 'Clientes', cell: (l) => l.customersCount ?? 0, className: 'hidden sm:table-cell' },
        ]}
        empty={<EmptyState icon={Tags} title="Sin listas de precios" description="Creá listas para mayoristas, distribuidores u otros segmentos." />}
      />
      <ListDialog open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  );
}

export function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canWrite = useCan('price_lists.write');
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const q = useDebounced(search);

  const { data: list, isLoading, error, refetch } = useQuery({ queryKey: ['price-lists', id], queryFn: () => api<PriceList>(`/price-lists/${id}`) });
  const { data: products } = useQuery({
    queryKey: ['products', { q, priceListId: id }],
    queryFn: () => api<Paginated<Product>>('/products', { query: { search: q, priceListId: id, pageSize: 50, active: true } }),
    enabled: canWrite,
  });

  const setItems = useApiMutation((items: Array<{ productId: string; price: number }>) => api(`/price-lists/${id}/items`, { method: 'PUT', body: { items } }), {
    invalidate: [['price-lists'], ['products']],
    success: 'Precios actualizados',
    onSuccess: () => setPrices({}),
  });
  const removeItem = useApiMutation((productId: string) => api(`/price-lists/${id}/items/${productId}`, { method: 'DELETE' }), {
    invalidate: [['price-lists'], ['products']],
    success: 'Precio específico eliminado',
  });
  const removeList = useApiMutation(() => api(`/price-lists/${id}`, { method: 'DELETE' }), {
    invalidate: [['price-lists']],
    success: 'Lista eliminada',
    onSuccess: () => navigate('/listas-de-precios'),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !list) return <Card><ErrorState message={errorMessage(error)} onRetry={refetch} /></Card>;

  const pending = Object.entries(prices).filter(([, v]) => v !== '' && Number(v) >= 0);

  return (
    <>
      <Link to="/listas-de-precios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Listas de precios</Link>
      <PageHeader
        title={list.name}
        description={`Ajuste general ${Number(list.adjustmentPercent) > 0 ? '+' : ''}${Number(list.adjustmentPercent)}% sobre precio base${list.description ? ` · ${list.description}` : ''}`}
        actions={
          canWrite && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Editar</Button>
              <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)}><Trash2 /> Eliminar</Button>
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Precios específicos ({list.items?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="px-0">
            {list.items?.length ? (
              <ul className="divide-y">
                {list.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{it.product.name}</p>
                      <p className="text-xs text-muted-foreground">Base {formatMoney(it.product.price)}</p>
                    </div>
                    <span className="tabular font-semibold">{formatMoney(it.price)}</span>
                    {canWrite && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem.mutate(it.productId)} aria-label="Quitar precio"><X /></Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sin precios específicos" description="Todos los productos usan el precio base con el ajuste general." />
            )}
          </CardContent>
        </Card>
        {canWrite && (
          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Asignar precios</CardTitle>
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar productos…" className="sm:w-full" />
            </CardHeader>
            <CardContent className="px-0">
              <ul className="max-h-[420px] divide-y overflow-y-auto">
                {products?.data.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">Base {formatMoney(p.price)} · Actual {formatMoney(p.effectivePrice)}</p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 w-28 text-right"
                      placeholder={Number(p.effectivePrice).toFixed(2)}
                      value={prices[p.id] ?? ''}
                      onChange={(e) => setPrices((s) => ({ ...s, [p.id]: e.target.value }))}
                      aria-label={`Precio para ${p.name}`}
                    />
                  </li>
                ))}
              </ul>
              <div className="flex justify-end border-t px-5 pt-4">
                <Button disabled={!pending.length} loading={setItems.isPending} onClick={() => setItems.mutate(pending.map(([productId, v]) => ({ productId, price: Number(v) })))}>
                  Guardar {pending.length || ''} precio(s)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <ListDialog open={editOpen} editing={list} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Eliminar lista de precios"
        description="Los clientes con esta lista pasarán a usar el precio base."
        confirmLabel="Eliminar"
        destructive
        loading={removeList.isPending}
        onConfirm={() => removeList.mutate(undefined)}
      />
    </>
  );
}
