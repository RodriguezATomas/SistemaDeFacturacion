import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilePlus2, Receipt, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, EmptyState, InvoiceStatusBadge, PageHeader, Pagination, SearchInput, useDebounced } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Badge, Input, NativeSelect } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { INVOICE_STATUS, VOUCHER_TYPES } from '@/lib/constants';
import type { InvoiceListItem, Paginated, PointOfSale } from '@/lib/types';
import { formatDate, formatMoney, voucherNumber } from '@/lib/utils';
import { useCan } from '@/stores/auth-store';

export function InvoicesListPage() {
  const navigate = useNavigate();
  const canWrite = useCan('invoices.write');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const status = params.get('estado') ?? '';
  const voucherType = params.get('tipo') ?? '';
  const pointOfSaleId = params.get('pv') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  useEffect(() => setPage(1), [q, status, voucherType, pointOfSaleId, from, to]);

  const { data: pos } = useQuery({ queryKey: ['points-of-sale'], queryFn: () => api<PointOfSale[]>('/points-of-sale') });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invoices', { q, status, voucherType, pointOfSaleId, from, to, page }],
    queryFn: () => api<Paginated<InvoiceListItem>>('/invoices', { query: { search: q, status, voucherType, pointOfSaleId, from, to, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const hasFilters = Boolean(status || voucherType || pointOfSaleId || from || to);

  return (
    <>
      <PageHeader
        title="Comprobantes"
        icon={Receipt}
        description="Facturas y notas de crédito/débito electrónicas."
        actions={canWrite && <Button asChild><Link to="/comprobantes/nuevo"><FilePlus2 /> Nuevo comprobante</Link></Button>}
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Receptor, documento, número o CAE…" className="lg:w-72" />
        <NativeSelect value={status} onChange={(e) => setFilter('estado', e.target.value)} className="lg:w-40" aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect>
        <NativeSelect value={voucherType} onChange={(e) => setFilter('tipo', e.target.value)} className="lg:w-48" aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(VOUCHER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </NativeSelect>
        <NativeSelect value={pointOfSaleId} onChange={(e) => setFilter('pv', e.target.value)} className="lg:w-40" aria-label="Punto de venta">
          <option value="">Todos los PV</option>
          {pos?.map((p) => <option key={p.id} value={p.id}>PV {String(p.number).padStart(5, '0')}</option>)}
        </NativeSelect>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFilter('desde', e.target.value)} className="lg:w-40" aria-label="Desde" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setFilter('hasta', e.target.value)} className="lg:w-40" aria-label="Hasta" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}><X /> Limpiar</Button>
        )}
      </div>
      <DataTable<InvoiceListItem>
        rows={data?.data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        onRowClick={(r) => navigate(`/comprobantes/${r.id}`)}
        columns={[
          {
            header: 'Comprobante',
            cell: (r) => (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-card text-xs font-bold">{VOUCHER_TYPES[r.voucherType]?.letter}</div>
                <div>
                  <p className="font-medium">{VOUCHER_TYPES[r.voucherType]?.name}</p>
                  <p className="tabular text-xs text-muted-foreground">{voucherNumber(r.pointOfSale.number, r.number)}</p>
                </div>
              </div>
            ),
          },
          { header: 'Fecha', cell: (r) => <span className="tabular">{formatDate(r.issueDate)}</span>, className: 'hidden sm:table-cell' },
          { header: 'Receptor', cell: (r) => <span className="line-clamp-1">{r.receiverName}</span> },
          {
            header: 'Estado',
            cell: (r) => (
              <div className="flex items-center gap-1.5">
                <InvoiceStatusBadge status={r.status} />
                {r.status === 'AUTHORIZED' && r.arcaEnvironment === 'HOMOLOGATION' && <Badge tone="outline" className="hidden xl:inline-flex">Homologación</Badge>}
              </div>
            ),
          },
          { header: 'CAE', cell: (r) => <span className="tabular text-xs text-muted-foreground">{r.cae ?? '—'}</span>, className: 'hidden xl:table-cell' },
          { header: 'Total', cell: (r) => <span className="tabular font-semibold">{formatMoney(r.total, r.currency)}</span>, className: 'text-right' },
        ]}
        empty={
          <EmptyState
            icon={Receipt}
            title={hasFilters || q ? 'Sin resultados' : 'Todavía no hay comprobantes'}
            description={hasFilters || q ? 'Ajustá los filtros de búsqueda.' : 'Creá tu primera factura electrónica.'}
            action={canWrite && !hasFilters && !q && <Button size="sm" asChild><Link to="/comprobantes/nuevo"><FilePlus2 /> Nuevo comprobante</Link></Button>}
          />
        }
        footer={data && data.meta.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
      />
    </>
  );
}
