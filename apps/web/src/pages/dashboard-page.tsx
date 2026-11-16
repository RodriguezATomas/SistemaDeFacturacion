import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FilePlus2, FileText, Package, Receipt, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, InvoiceStatusBadge, PageHeader, StatCard } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { InvoiceStatus, VOUCHER_TYPES } from '@/lib/constants';
import { formatDate, formatMoney, voucherNumber } from '@/lib/utils';
import { useAuthStore, useCan } from '@/stores/auth-store';

interface Summary {
  salesThisMonth: string;
  salesPrevMonth: string;
  invoicesThisMonth: number;
  customers: number;
  activeProducts: number;
  pendingReconciliation: number;
  drafts: number;
  monthlySales: Array<{ month: string; total: string; count: number }>;
  topCustomers: Array<{ name: string; total: string; count: number }>;
  recentInvoices: Array<{ id: string; voucherType: number; number: number | null; status: InvoiceStatus; issueDate: string; receiverName: string; total: string; pointOfSale: { number: number } }>;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

export function DashboardPage() {
  const me = useAuthStore((s) => s.me)!;
  const canCreate = useCan('invoices.write');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Summary>('/dashboard') });

  const change = data && Number(data.salesPrevMonth) > 0 ? ((Number(data.salesThisMonth) - Number(data.salesPrevMonth)) / Number(data.salesPrevMonth)) * 100 : null;
  const chart = data?.monthlySales.map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1], total: Number(m.total) })) ?? [];

  return (
    <>
      <PageHeader
        title={`Hola, ${me.user.firstName}`}
        description="Resumen de la actividad comercial de tu empresa."
        actions={
          canCreate && (
            <Button asChild>
              <Link to="/comprobantes/nuevo">
                <FilePlus2 /> Nuevo comprobante
              </Link>
            </Button>
          )
        }
      />

      {error ? (
        <Card>
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        </Card>
      ) : (
        <>
          {data && data.pendingReconciliation > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{data.pendingReconciliation} comprobante(s) con resultado incierto ante ARCA</p>
                <p className="text-amber-800">No se emitirán nuevos comprobantes del mismo punto de venta y tipo hasta conciliarlos.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/comprobantes?estado=UNKNOWN')}>
                Revisar
              </Button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading || !data ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
            ) : (
              <>
                <StatCard
                  label="Ventas del mes"
                  value={formatMoney(data.salesThisMonth)}
                  icon={Receipt}
                  hint={
                    change === null ? (
                      'Sin datos del mes anterior'
                    ) : (
                      <span className={change >= 0 ? 'inline-flex items-center gap-0.5 text-emerald-600' : 'inline-flex items-center gap-0.5 text-red-600'}>
                        {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {Math.abs(change).toFixed(1)}% vs. mes anterior
                      </span>
                    )
                  }
                />
                <StatCard label="Comprobantes autorizados" value={data.invoicesThisMonth} hint={`${data.drafts} borradores pendientes`} icon={FileText} tone="success" />
                <StatCard label="Clientes" value={data.customers} icon={UsersRound} tone="muted" />
                <StatCard label="Productos activos" value={data.activeProducts} icon={Package} tone="warning" />
              </>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Ventas de los últimos 12 meses</CardTitle>
                <CardDescription>Importe neto de comprobantes autorizados (notas de crédito descontadas)</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(243 75% 52%)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="hsl(243 75% 52%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 13% 91%)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(220 9% 46%)" />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} stroke="hsl(220 9% 46%)" tickFormatter={(v) => compact.format(v)} />
                      <Tooltip formatter={(v: number) => [formatMoney(v), 'Ventas']} contentStyle={{ borderRadius: 8, borderColor: 'hsl(220 13% 89%)', fontSize: 13 }} />
                      <Area type="monotone" dataKey="total" stroke="hsl(243 75% 52%)" strokeWidth={2} fill="url(#sales)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Principales clientes</CardTitle>
                <CardDescription>Últimos 12 meses</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : data?.topCustomers.length ? (
                  <ul className="space-y-3">
                    {data.topCustomers.map((c, i) => {
                      const max = Number(data.topCustomers[0].total) || 1;
                      return (
                        <li key={c.name}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">
                              <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                              {c.name}
                            </span>
                            <span className="tabular shrink-0 font-medium">{formatMoney(c.total)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(4, (Number(c.total) / max) * 100)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState title="Sin ventas registradas" description="Los clientes aparecerán al autorizar comprobantes." />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Últimos comprobantes</CardTitle>
                <CardDescription>Actividad reciente</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/comprobantes">Ver todos</Link>
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {data?.recentInvoices.length ? (
                <ul className="divide-y">
                  {data.recentInvoices.map((inv) => (
                    <li key={inv.id}>
                      <Link to={`/comprobantes/${inv.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                          {VOUCHER_TYPES[inv.voucherType]?.letter}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{inv.receiverName}</p>
                          <p className="text-xs text-muted-foreground">
                            {VOUCHER_TYPES[inv.voucherType]?.name} {voucherNumber(inv.pointOfSale.number, inv.number)} · {formatDate(inv.issueDate)}
                          </p>
                        </div>
                        <InvoiceStatusBadge status={inv.status} />
                        <span className="tabular hidden w-32 text-right text-sm font-medium sm:block">{formatMoney(inv.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                !isLoading && <EmptyState title="Todavía no hay comprobantes" description="Creá tu primer comprobante para verlo acá." />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
