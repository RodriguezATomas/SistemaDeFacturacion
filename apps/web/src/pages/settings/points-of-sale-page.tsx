import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { DataTable, EmptyState, Field, PageHeader } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import type { PointOfSale } from '@/lib/types';
import { useCan } from '@/stores/auth-store';

const schema = z.object({
  number: z.coerce.number().int().min(1, 'Entre 1 y 99998').max(99998, 'Entre 1 y 99998'),
  name: z.string().trim().min(1, 'Requerido').max(100),
  address: z.string().trim().max(250).optional().transform((v) => (v ? v : null)),
  isActive: z.boolean(),
});

interface RemotePos {
  number: number;
  emissionType: string;
  blocked: boolean;
  deactivatedAt: string | null;
}

export function PointsOfSalePage() {
  const canManage = useCan('pos.manage');
  const [dialog, setDialog] = useState<{ open: boolean; editing: PointOfSale | null }>({ open: false, editing: null });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['points-of-sale'], queryFn: () => api<PointOfSale[]>('/points-of-sale') });
  const remote = useQuery({ queryKey: ['arca', 'points-of-sale'], queryFn: () => api<RemotePos[]>('/arca/points-of-sale'), enabled: false, retry: false });
  const form = useZodForm(schema);

  useEffect(() => {
    if (dialog.open) {
      form.reset({ number: dialog.editing?.number ?? ('' as unknown as number), name: dialog.editing?.name ?? '', address: dialog.editing?.address ?? '', isActive: dialog.editing?.isActive ?? true });
    }
  }, [dialog, form]);

  const save = useApiMutation(
    (body: unknown) => (dialog.editing ? api(`/points-of-sale/${dialog.editing.id}`, { method: 'PATCH', body }) : api('/points-of-sale', { method: 'POST', body })),
    { invalidate: [['points-of-sale']], success: 'Punto de venta guardado', onSuccess: () => setDialog({ open: false, editing: null }) },
  );

  return (
    <>
      <PageHeader
        title="Puntos de venta"
        icon={Store}
        description="Deben estar dados de alta en ARCA como “Factura Electrónica – Web Services”."
        actions={canManage && <Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> Nuevo punto de venta</Button>}
      />
      <DataTable<PointOfSale>
        rows={data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          { header: 'Número', cell: (p) => <span className="tabular font-semibold">{String(p.number).padStart(5, '0')}</span> },
          { header: 'Nombre', cell: (p) => p.name },
          { header: 'Domicilio', cell: (p) => p.address ?? '—', className: 'hidden md:table-cell' },
          { header: 'Servicio', cell: () => <Badge tone="muted">WSFEv1</Badge>, className: 'hidden sm:table-cell' },
          { header: 'Estado', cell: (p) => (p.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>) },
          {
            header: '',
            className: 'w-12 text-right',
            cell: (p) => canManage && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ open: true, editing: p })} aria-label="Editar"><Pencil /></Button>,
          },
        ]}
        empty={<EmptyState icon={Store} title="Sin puntos de venta" description="Configurá al menos uno para emitir comprobantes." />}
      />

      {canManage && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Puntos de venta habilitados en ARCA</CardTitle>
              <CardDescription>Consulta en línea (FEParamGetPtosVenta) con el certificado del ambiente activo.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => remote.refetch()} loading={remote.isFetching}><RefreshCw /> Consultar</Button>
          </CardHeader>
          <CardContent>
            {remote.error ? (
              <p className="text-sm text-destructive">{errorMessage(remote.error)}</p>
            ) : remote.data ? (
              remote.data.length ? (
                <ul className="flex flex-wrap gap-2">
                  {remote.data.map((r) => (
                    <li key={r.number}>
                      <Badge tone={r.blocked || r.deactivatedAt ? 'danger' : 'success'}>
                        PV {String(r.number).padStart(5, '0')} · {r.emissionType}{r.blocked ? ' · bloqueado' : ''}{r.deactivatedAt ? ` · baja ${r.deactivatedAt}` : ''}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">ARCA no informa puntos de venta habilitados para web services.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Presioná “Consultar” para verificar contra ARCA.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Editar punto de venta' : 'Nuevo punto de venta'}</DialogTitle>
            <DialogDescription>Usá el mismo número que figura en ARCA.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <Field label="Número" error={form.formState.errors.number?.message}><Input type="number" {...form.register('number')} /></Field>
            <Field label="Nombre" error={form.formState.errors.name?.message}><Input {...form.register('name')} /></Field>
            <Field label="Domicilio comercial" hint="Opcional: se imprime en el comprobante"><Input {...form.register('address')} /></Field>
            <div className="flex items-center gap-3">
              <Switch id="pos-active" checked={form.watch('isActive')} onCheckedChange={(v) => form.setValue('isActive', v)} />
              <Label htmlFor="pos-active">Activo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Cancelar</Button>
              <Button type="submit" loading={save.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
