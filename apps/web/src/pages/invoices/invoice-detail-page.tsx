import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileMinus2, Pencil, RefreshCw, Send, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, ErrorState, InvoiceStatusBadge, PageHeader } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { api, apiBlob, errorMessage } from '@/lib/api';
import { CONCEPTS, DOCUMENT_TYPES, VAT_CONDITIONS, VAT_TREATMENTS, VOUCHER_TYPES } from '@/lib/constants';
import type { Invoice } from '@/lib/types';
import { formatCuit, formatDate, formatDateTime, formatMoney, formatNumber, idempotencyKey, voucherNumber } from '@/lib/utils';
import { useCan } from '@/stores/auth-store';

const ATTEMPT_LABEL: Record<string, string> = {
  PENDING: 'Enviando',
  AUTHORIZED: 'Autorizado',
  REJECTED: 'Rechazado',
  UNKNOWN: 'Incierto',
  RECONCILED_AUTHORIZED: 'Conciliado: autorizado',
  RECONCILED_NOT_FOUND: 'Conciliado: no autorizado',
};

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canWrite = useCan('invoices.write');
  const canEmit = useCan('invoices.emit');
  const [confirm, setConfirm] = useState<null | 'emit' | 'delete' | 'credit'>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: inv, isLoading, error, refetch } = useQuery({ queryKey: ['invoices', id], queryFn: () => api<Invoice>(`/invoices/${id}`) });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['invoices'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);

  const emit = useApiMutation(() => api<Invoice>(`/invoices/${id}/emit`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } }), {
    onSuccess: async (r) => {
      setConfirm(null);
      await refresh();
      if (r.status === 'AUTHORIZED') toast.success(`Comprobante autorizado. CAE ${r.cae}`);
      else if (r.status === 'REJECTED') toast.error('ARCA rechazó el comprobante');
      else toast.warning('Resultado incierto: quedó pendiente de conciliación');
    },
  });
  const reconcile = useApiMutation(() => api<{ outcome: string }>(`/invoices/${id}/reconcile`, { method: 'POST' }), {
    onSuccess: async (r) => {
      await refresh();
      const msg: Record<string, string> = {
        AUTHORIZED: 'ARCA confirmó la autorización',
        NOT_AUTHORIZED: 'ARCA no registra el comprobante: puede reintentar la emisión',
        CONFLICT: 'ARCA registra datos distintos: requiere revisión manual',
        UNDETERMINED: 'No fue posible determinar el resultado todavía',
      };
      toast.info(msg[r.outcome] ?? r.outcome);
    },
  });
  const remove = useApiMutation(() => api(`/invoices/${id}`, { method: 'DELETE' }), {
    success: 'Borrador eliminado',
    onSuccess: async () => {
      await refresh();
      navigate('/comprobantes');
    },
  });
  const creditNote = useApiMutation(() => api<Invoice>(`/invoices/${id}/credit-note`, { method: 'POST' }), {
    success: 'Borrador de nota de crédito creado',
    onSuccess: async (nc) => {
      setConfirm(null);
      await refresh();
      navigate(`/comprobantes/${nc.id}/editar`);
    },
  });

  const downloadPdf = async () => {
    if (!inv) return;
    setDownloading(true);
    try {
      const blob = await apiBlob(`/invoices/${inv.id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
  if (error || !inv) return <Card><ErrorState message={errorMessage(error)} onRetry={refetch} /></Card>;

  const type = VOUCHER_TYPES[inv.voucherType];
  const editable = inv.status === 'DRAFT' || inv.status === 'REJECTED';
  const uncertain = inv.status === 'UNKNOWN' || inv.status === 'SENDING';
  const showVat = type.letter === 'A';

  return (
    <>
      <Link to="/comprobantes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Comprobantes</Link>
      <PageHeader
        title={`${type.name} ${voucherNumber(inv.pointOfSale.number, inv.number)}`}
        description={`${inv.receiverName} · ${formatDate(inv.issueDate)}`}
        actions={
          <>
            <Button variant="outline" onClick={downloadPdf} loading={downloading}><Download /> PDF</Button>
            {editable && canWrite && <Button variant="outline" asChild><Link to={`/comprobantes/${inv.id}/editar`}><Pencil /> Editar</Link></Button>}
            {editable && canWrite && inv.number === null && inv.attempts.length === 0 && (
              <Button variant="outline" className="text-destructive" onClick={() => setConfirm('delete')}><Trash2 /> Eliminar</Button>
            )}
            {uncertain && canEmit && <Button variant="outline" onClick={() => reconcile.mutate(undefined)} loading={reconcile.isPending}><RefreshCw /> Conciliar con ARCA</Button>}
            {inv.status === 'AUTHORIZED' && type.kind !== 'NOTA_CREDITO' && canWrite && (
              <Button variant="outline" onClick={() => setConfirm('credit')}><FileMinus2 /> Nota de crédito</Button>
            )}
            {editable && canEmit && <Button onClick={() => setConfirm('emit')}><Send /> Emitir</Button>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StatusPanel inv={inv} />
          <Card>
            <CardHeader><CardTitle>Receptor</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Nombre / razón social" value={inv.customer ? <Link className="text-primary hover:underline" to="/clientes">{inv.receiverName}</Link> : inv.receiverName} />
              <Info label="Documento" value={`${DOCUMENT_TYPES[inv.receiverDocumentType]} ${inv.receiverDocumentType === 'CUIT' || inv.receiverDocumentType === 'CUIL' ? formatCuit(inv.receiverDocumentNumber) : inv.receiverDocumentNumber}`} />
              <Info label="Condición frente al IVA" value={VAT_CONDITIONS[inv.receiverVatCondition]} />
              <Info label="Domicilio" value={inv.receiverAddress ?? '—'} />
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Detalle</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">P. unit.</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Bonif.</TableHead>
                  {showVat && <TableHead className="hidden text-right md:table-cell">IVA</TableHead>}
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.description}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(i.quantity, 4)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(i.unitPrice, inv.currency)}</TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{Number(i.discountPercent) ? `${Number(i.discountPercent)}%` : '—'}</TableCell>
                    {showVat && <TableCell className="hidden text-right md:table-cell">{i.vatTreatment === 'GRAVADO' ? `${Number(i.vatRate)}%` : VAT_TREATMENTS[i.vatTreatment]}</TableCell>}
                    <TableCell className="tabular text-right font-medium">{formatMoney(showVat ? i.netAmount : i.totalAmount, inv.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {inv.notes && (
            <Card><CardContent className="p-5 text-sm"><p className="mb-1 font-medium">Observaciones</p><p className="whitespace-pre-wrap text-muted-foreground">{inv.notes}</p></CardContent></Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Importes</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {type.letter !== 'C' ? (
                <>
                  <Line label="Neto gravado" value={formatMoney(inv.netTaxed, inv.currency)} />
                  {Number(inv.netUntaxed) > 0 && <Line label="No gravado" value={formatMoney(inv.netUntaxed, inv.currency)} />}
                  {Number(inv.exemptAmount) > 0 && <Line label="Exento" value={formatMoney(inv.exemptAmount, inv.currency)} />}
                  {inv.vatBreakdown.map((v) => <Line key={v.id} label={`IVA ${Number(v.rate)}%`} value={formatMoney(v.vatAmount, inv.currency)} />)}
                </>
              ) : (
                <Line label="Subtotal" value={formatMoney(Number(inv.total) - Number(inv.otherTaxesAmount), inv.currency)} />
              )}
              {inv.otherTaxes.map((t) => <Line key={t.id} label={t.description} value={formatMoney(t.amount, inv.currency)} />)}
              <div className="my-3 border-t" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Total</span>
                <span className="tabular text-2xl font-semibold">{formatMoney(inv.total, inv.currency)}</span>
              </div>
              {inv.currency !== 'PES' && <p className="text-xs text-muted-foreground">Cotización {inv.exchangeRate}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Información</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Punto de venta" value={`${String(inv.pointOfSale.number).padStart(5, '0')} · ${inv.pointOfSale.name}`} />
              <Info label="Concepto" value={CONCEPTS[inv.concept]} />
              {inv.concept !== 'PRODUCTS' && (
                <Info label="Período" value={`${formatDate(inv.serviceFrom)} al ${formatDate(inv.serviceTo)} · vto. ${formatDate(inv.paymentDueDate)}`} />
              )}
              {inv.associatedInvoice && (
                <Info
                  label="Comprobante asociado"
                  value={<Link className="text-primary hover:underline" to={`/comprobantes/${inv.associatedInvoice.id}`}>{VOUCHER_TYPES[inv.associatedInvoice.voucherType].name} {voucherNumber(inv.associatedInvoice.pointOfSale.number, inv.associatedInvoice.number)}</Link>}
                />
              )}
              {inv.associatedNotes.length > 0 && (
                <Info
                  label="Notas asociadas"
                  value={
                    <ul className="space-y-1">
                      {inv.associatedNotes.map((n) => (
                        <li key={n.id} className="flex items-center gap-2">
                          <Link className="text-primary hover:underline" to={`/comprobantes/${n.id}`}>{VOUCHER_TYPES[n.voucherType].short} {n.number ?? 'borrador'}</Link>
                          <InvoiceStatusBadge status={n.status} />
                        </li>
                      ))}
                    </ul>
                  }
                />
              )}
              <Info label="Creado" value={formatDateTime(inv.createdAt)} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'emit'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Emitir ante ARCA"
        description={<p>Se solicitará el CAE de <b>{type.name}</b> por <b>{formatMoney(inv.total, inv.currency)}</b>. Una vez autorizado no podrá modificarse.</p>}
        confirmLabel="Emitir"
        loading={emit.isPending}
        onConfirm={() => emit.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Eliminar borrador"
        description="Esta acción no puede deshacerse."
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'credit'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Generar nota de crédito"
        description="Se creará un borrador de nota de crédito con los mismos ítems, que podrá revisar antes de emitir."
        confirmLabel="Crear borrador"
        loading={creditNote.isPending}
        onConfirm={() => creditNote.mutate(undefined)}
      />
    </>
  );
}

function StatusPanel({ inv }: { inv: Invoice }) {
  const messages = [...(inv.arcaErrors ?? []), ...(inv.arcaObservations ?? [])];
  const config = {
    AUTHORIZED: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50/60', iconCls: 'text-emerald-600', title: 'Autorizado por ARCA' },
    REJECTED: { icon: XCircle, cls: 'border-red-200 bg-red-50/60', iconCls: 'text-red-600', title: 'Rechazado por ARCA' },
    UNKNOWN: { icon: AlertTriangle, cls: 'border-amber-300 bg-amber-50/70', iconCls: 'text-amber-600', title: 'Resultado incierto: requiere conciliación' },
    SENDING: { icon: RefreshCw, cls: 'border-sky-200 bg-sky-50/60', iconCls: 'text-sky-600', title: 'Enviando a ARCA' },
    DRAFT: { icon: ShieldCheck, cls: 'border-dashed', iconCls: 'text-muted-foreground', title: 'Borrador sin validez fiscal' },
  }[inv.status];
  const Icon = config.icon;
  return (
    <Card className={config.cls}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconCls}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{config.title}</p>
              <InvoiceStatusBadge status={inv.status} />
              {inv.arcaEnvironment && <Badge tone={inv.arcaEnvironment === 'PRODUCTION' ? 'success' : 'warning'}>{inv.arcaEnvironment === 'PRODUCTION' ? 'Producción' : 'Homologación'}</Badge>}
            </div>
            {inv.status === 'AUTHORIZED' && (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <Info label="CAE" value={<span className="tabular font-semibold">{inv.cae}</span>} />
                <Info label="Vencimiento CAE" value={formatDate(inv.caeDueDate)} />
                <Info label="Autorizado" value={formatDateTime(inv.authorizedAt)} />
              </div>
            )}
            {inv.status === 'DRAFT' && <p className="mt-1 text-sm text-muted-foreground">El PDF de un borrador no es un comprobante fiscal. Emitilo para obtener el CAE.</p>}
            {inv.status === 'UNKNOWN' && (
              <p className="mt-1 text-sm text-amber-900">
                La solicitud fue enviada pero no se obtuvo una respuesta válida. Use “Conciliar con ARCA” para consultar el resultado antes de reintentar; el sistema nunca reenvía automáticamente.
              </p>
            )}
            {messages.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {messages.map((m, i) => (
                  <li key={i} className="flex gap-2"><span className="tabular shrink-0 font-mono text-xs text-muted-foreground">[{m.code}]</span><span>{m.message}</span></li>
                ))}
              </ul>
            )}
            {inv.attempts.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Intentos de emisión ({inv.attempts.length})</summary>
                <ul className="mt-2 space-y-1">
                  {inv.attempts.map((a) => (
                    <li key={a.id} className="flex flex-wrap gap-x-3 text-xs">
                      <span className="font-medium">#{a.attemptNumber}</span>
                      <span>Nro. {a.number}</span>
                      <span>{ATTEMPT_LABEL[a.result] ?? a.result}</span>
                      <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                      {a.message && <span className="w-full text-muted-foreground">{a.message}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
