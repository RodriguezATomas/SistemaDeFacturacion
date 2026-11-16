import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderTree, MoreHorizontal, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ConfirmDialog, DataTable, EmptyState, Field, PageHeader, Pagination, SearchInput, useDebounced } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Badge, Input, Label, NativeSelect, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import { PRODUCT_TYPES, VAT_RATES, VAT_TREATMENTS } from '@/lib/constants';
import { productSchema } from '@/lib/schemas';
import type { Category, Paginated, Product } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import { useCan } from '@/stores/auth-store';

function ProductDialog({ open, onOpenChange, editing, categories }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Product | null; categories: Category[] }) {
  const form = useZodForm(productSchema);
  const e = form.formState.errors;
  const treatment = form.watch('vatTreatment');

  useEffect(() => {
    if (!open) return;
    form.reset({
      type: editing?.type ?? 'PRODUCT',
      sku: editing?.sku ?? '',
      name: editing?.name ?? '',
      description: editing?.description ?? '',
      unit: editing?.unit ?? 'unidad',
      price: editing ? Number(editing.price) : ('' as unknown as number),
      vatTreatment: editing?.vatTreatment ?? 'GRAVADO',
      vatRate: editing ? Number(editing.vatRate) : 21,
      categoryId: editing?.categoryId ?? '',
      isActive: editing?.isActive ?? true,
    });
  }, [open, editing, form]);

  const save = useApiMutation(
    (body: unknown) => (editing ? api(`/products/${editing.id}`, { method: 'PATCH', body }) : api('/products', { method: 'POST', body })),
    { invalidate: [['products'], ['categories']], success: editing ? 'Producto actualizado' : 'Producto creado', onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar producto o servicio' : 'Nuevo producto o servicio'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Tipo">
            <NativeSelect {...form.register('type')}>
              {Object.entries(PRODUCT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Código / SKU" error={e.sku?.message}>
            <Input {...form.register('sku')} />
          </Field>
          <Field label="Nombre" error={e.name?.message} className="sm:col-span-2">
            <Input {...form.register('name')} autoFocus />
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Textarea rows={2} {...form.register('description')} />
          </Field>
          <Field label="Precio neto (sin IVA)" error={e.price?.message}>
            <Input type="number" step="0.0001" min="0" {...form.register('price')} />
          </Field>
          <Field label="Unidad de medida">
            <Input {...form.register('unit')} />
          </Field>
          <Field label="Tratamiento de IVA">
            <NativeSelect {...form.register('vatTreatment')}>
              {Object.entries(VAT_TREATMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Alícuota de IVA">
            <NativeSelect {...form.register('vatRate')} disabled={treatment !== 'GRAVADO'}>
              {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </NativeSelect>
          </Field>
          <Field label="Categoría">
            <NativeSelect {...form.register('categoryId')}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="active" checked={form.watch('isActive')} onCheckedChange={(v) => form.setValue('isActive', v)} />
            <Label htmlFor="active">Activo para facturar</Label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Ingrese el nombre').max(100),
  description: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
});

function CategoriesTab({ canWrite }: { canWrite: boolean }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const [dialog, setDialog] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Category | null>(null);
  const form = useZodForm(categorySchema);

  useEffect(() => {
    if (dialog.open) form.reset({ name: dialog.editing?.name ?? '', description: dialog.editing?.description ?? '' });
  }, [dialog, form]);

  const save = useApiMutation(
    (body: unknown) => (dialog.editing ? api(`/categories/${dialog.editing.id}`, { method: 'PATCH', body }) : api('/categories', { method: 'POST', body })),
    { invalidate: [['categories']], success: 'Categoría guardada', onSuccess: () => setDialog({ open: false, editing: null }) },
  );
  const remove = useApiMutation((id: string) => api(`/categories/${id}`, { method: 'DELETE' }), {
    invalidate: [['categories'], ['products']],
    success: 'Categoría eliminada',
    onSuccess: () => setDeleting(null),
  });

  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setDialog({ open: true, editing: null })}><Plus /> Nueva categoría</Button>
        </div>
      )}
      <DataTable<Category>
        rows={data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          { header: 'Categoría', cell: (c) => <span className="font-medium">{c.name}</span> },
          { header: 'Descripción', cell: (c) => c.description ?? '—', className: 'hidden md:table-cell' },
          { header: 'Productos', cell: (c) => c.productsCount ?? 0 },
          {
            header: '',
            className: 'w-24 text-right',
            cell: (c) =>
              canWrite && (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ open: true, editing: c })} aria-label="Editar"><Pencil /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(c)} aria-label="Eliminar"><Trash2 /></Button>
                </div>
              ),
          },
        ]}
        empty={<EmptyState icon={FolderTree} title="Sin categorías" description="Organizá tus productos en categorías." />}
      />
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{dialog.editing ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <Field label="Nombre" error={form.formState.errors.name?.message}><Input {...form.register('name')} autoFocus /></Field>
            <Field label="Descripción"><Textarea rows={2} {...form.register('description')} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancelar</Button>
              <Button type="submit" loading={save.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminar categoría"
        description={<>Los productos de <b>{deleting?.name}</b> quedarán sin categoría.</>}
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

export function ProductsPage() {
  const canWrite = useCan('products.write');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Product | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Product | null>(null);
  const q = useDebounced(search);
  useEffect(() => setPage(1), [q, type, categoryId]);

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', { q, type, categoryId, page }],
    queryFn: () => api<Paginated<Product>>('/products', { query: { search: q, type, categoryId, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const remove = useApiMutation((id: string) => api(`/products/${id}`, { method: 'DELETE' }), {
    invalidate: [['products']],
    success: 'Producto eliminado',
    onSuccess: () => setDeleting(null),
  });

  return (
    <>
      <PageHeader
        title="Productos y servicios"
        icon={Package}
        description="Catálogo con precios netos y tratamiento de IVA."
        actions={canWrite && <Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> Nuevo producto</Button>}
      />
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products"><Package /> Productos</TabsTrigger>
          <TabsTrigger value="categories"><FolderTree /> Categorías</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o código…" />
            <NativeSelect value={type} onChange={(e) => setType(e.target.value)} className="sm:w-44" aria-label="Tipo">
              <option value="">Todos los tipos</option>
              {Object.entries(PRODUCT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
            <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="sm:w-52" aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </div>
          <DataTable<Product>
            rows={data?.data}
            loading={isLoading}
            error={error ? errorMessage(error) : null}
            onRetry={refetch}
            columns={[
              {
                header: 'Producto',
                cell: (p) => (
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku ? `${p.sku} · ` : ''}{PRODUCT_TYPES[p.type]}</p>
                  </div>
                ),
              },
              { header: 'Categoría', cell: (p) => p.category?.name ?? '—', className: 'hidden md:table-cell' },
              { header: 'IVA', cell: (p) => (p.vatTreatment === 'GRAVADO' ? `${Number(p.vatRate)}%` : VAT_TREATMENTS[p.vatTreatment]), className: 'hidden sm:table-cell' },
              { header: 'Precio neto', cell: (p) => <span className="tabular font-medium">{formatMoney(p.price)}</span>, className: 'text-right' },
              { header: 'Estado', cell: (p) => (p.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>), className: 'hidden lg:table-cell' },
              {
                header: '',
                className: 'w-12 text-right',
                cell: (p) =>
                  canWrite && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: p })}><Pencil /> Editar</DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setDeleting(p)}><Trash2 /> Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
              },
            ]}
            empty={<EmptyState icon={Package} title={q ? 'Sin resultados' : 'Todavía no hay productos'} description="Cargá productos y servicios para facturarlos rápidamente." />}
            footer={data && data.meta.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
          />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
      <ProductDialog open={dialog.open} editing={dialog.editing} categories={categories} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminar producto"
        description={<>¿Eliminar <b>{deleting?.name}</b>? Los comprobantes emitidos no se modifican.</>}
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
