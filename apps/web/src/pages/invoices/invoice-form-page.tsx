import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Plus, Send, Trash2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, ErrorState, Field, PageHeader } from '@/components/shared/common';
import { EntityPicker } from '@/components/shared/entity-picker';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, NativeSelect, Skeleton, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { CONCEPTS, CURRENCIES, DOCUMENT_TYPES, VAT_CONDITIONS, VAT_RATES, VAT_TREATMENTS, VOUCHER_KINDS, VOUCHER_TYPES } from '@/lib/constants';
import { expectedLetter, previewTotals } from '@/lib/invoice-calc';
import { InvoiceFormValues, invoiceSchema } from '@/lib/schemas';
import type { Company, Customer, Invoice, InvoiceListItem, Paginated, PointOfSale, PriceList, Product } from '@/lib/types';
import { formatCuit, formatDate, formatMoney, idempotencyKey, todayAr, voucherNumber } from '@/lib/utils';
import { useCan } from '@/stores/auth-store';
import { useZodForm } from '@/hooks/use-zod-form';

const emptyItem = { productId: null, description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatTreatment: 'GRAVADO' as const, vatRate: 21 };

export function InvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEmit = useCan('invoices.emit');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [associated, setAssociated] = useState<InvoiceListItem | null>(null);
  const [confirmEmit, setConfirmEmit] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: company } = useQuery({ queryKey: ['company', 'current'], queryFn: () => api<Company>('/companies/current') });
  const { data: pointsOfSale, isLoading: loadingPos } = useQuery({ queryKey: ['points-of-sale'], queryFn: () => api<PointOfSale[]>('/points-of-sale') });
  const { data: priceLists } = useQuery({ queryKey: ['price-lists'], queryFn: () => api<PriceList[]>('/price-lists') });
  const { data: existing, error: loadError } = useQuery({ queryKey: ['invoices', id], queryFn: () => api<Invoice>(`/invoices/${id}`), enabled: isEdit });

  const activePos = useMemo(() => pointsOfSale?.filter((p) => p.isActive) ?? [], [pointsOfSale]);

  const form = useZodForm(invoiceSchema, { defaultValues: {
      pointOfSaleId: '',
      kind: 'FACTURA',
      concept: 'PRODUCTS',
      issueDate: todayAr(),
      currency: 'PES',
      exchangeRate: 1,
      priceListId: '',
      items: [emptyItem],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const e = form.formState.errors;
  const values = form.watch();

  useEffect(() => {
    if (!isEdit && activePos.length && !form.getValues('pointOfSaleId')) form.setValue('pointOfSaleId', activePos[0].id);
  }, [activePos, isEdit, form]);

  useEffect(() => {
    if (!existing) return;
    form.reset({
      pointOfSaleId: existing.pointOfSaleId,
      kind: VOUCHER_TYPES[existing.voucherType].kind,
      customerId: existing.customerId ?? undefined,
      concept: existing.concept,
      issueDate: todayAr(),
      serviceFrom: existing.serviceFrom?.slice(0, 10),
      serviceTo: existing.serviceTo?.slice(0, 10),
      paymentDueDate: existing.paymentDueDate?.slice(0, 10),
      currency: existing.currency,
      exchangeRate: Number(existing.exchangeRate),
      associatedInvoiceId: existing.associatedInvoiceId ?? undefined,
      notes: existing.notes ?? '',
      items: existing.items.map((i) => ({
        productId: i.productId,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountPercent: Number(i.discountPercent),
        vatTreatment: i.vatTreatment,
        vatRate: Number(i.vatRate),
      })),
    });
    if (existing.customerId) {
      api<Customer>(`/customers/${existing.customerId}`).then(setCustomer).catch(() => undefined);
    }
    if (existing.associatedInvoice) {
      const a = existing.associatedInvoice;
      setAssociated({ id: a.id, voucherType: a.voucherType, number: a.number, issueDate: a.issueDate, total: a.total, pointOfSale: { id: '', number: a.pointOfSale.number } } as InvoiceListItem);
    }
  }, [existing, form]);

  const receiverCondition = customer?.vatCondition ?? 'CONSUMIDOR_FINAL';
  const letter = company ? expectedLetter(company.taxCondition, receiverCondition) : null;
  const voucherName = letter ? `${VOUCHER_KINDS[values.kind]} ${letter}` : null;
  const totals = previewTotals(letter ?? 'B', values.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountPercent: Number(i.discountPercent), vatRate: Number(i.vatRate) })));
  const effectiveListId = values.priceListId || customer?.priceListId || company?.settings?.defaultPriceListId || '';
  const isMono = letter === 'C';

  const pickProduct = (index: number, p: Product | null) => {
    if (!p) return;
    form.setValue(`items.${index}.productId`, p.id);
    form.setValue(`items.${index}.description`, p.name);
    form.setValue(`items.${index}.unitPrice`, Number(p.effectivePrice ?? p.price));
    form.setValue(`items.${index}.vatTreatment`, p.vatTreatment);
    form.setValue(`items.${index}.vatRate`, Number(p.vatRate));
  };

  const buildBody = (v: InvoiceFormValues) => ({
    pointOfSaleId: v.pointOfSaleId,
    kind: v.kind,
    customerId: customer?.id ?? null,
    concept: v.concept,
    issueDate: v.issueDate,
    serviceFrom: v.concept !== 'PRODUCTS' ? v.serviceFrom : null,
    serviceTo: v.concept !== 'PRODUCTS' ? v.serviceTo : null,
    paymentDueDate: v.concept !== 'PRODUCTS' ? v.paymentDueDate : null,
    currency: v.currency,
    exchangeRate: v.currency === 'PES' ? 1 : Number(v.exchangeRate),
    priceListId: v.priceListId || null,
    associatedInvoiceId: v.kind !== 'FACTURA' ? v.associatedInvoiceId : null,
    notes: v.notes || null,
    items: v.items.map((i) => ({
      productId: i.productId || null,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discountPercent: Number(i.discountPercent),
      vatTreatment: i.vatTreatment,
      vatRate: i.vatTreatment === 'GRAVADO' ? Number(i.vatRate) : 0,
    })),
  });

  const save = async (v: InvoiceFormValues, emit: boolean) => {
    setBusy(true);
    try {
      const body = buildBody(v);
      const saved = isEdit ? await api<Invoice>(`/invoices/${id}`, { method: 'PUT', body }) : await api<Invoice>('/invoices', { method: 'POST', body });
      if (emit) {
        const result = await api<Invoice>(`/invoices/${saved.id}/emit`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } });
        if (result.status === 'AUTHORIZED') toast.success(`Comprobante autorizado. CAE ${result.cae}`);
        else if (result.status === 'REJECTED') toast.error('ARCA rechazó el comprobante. Revisá las observaciones.');
        else toast.warning('Resultado incierto: el comprobante quedó pendiente de conciliación.');
      } else {
        toast.success('Borrador guardado');
      }
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/comprobantes/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirmEmit(false);
    }
  };

  if (isEdit && loadError) return <Card><ErrorState message={errorMessage(loadError)} /></Card>;
  if (isEdit && existing && !['DRAFT', 'REJECTED'].includes(existing.status)) {
    return <Card><ErrorState message="Solo pueden editarse comprobantes en borrador o rechazados." /></Card>;
  }

  return (
    <>
      <Link to={isEdit ? `/comprobantes/${id}` : '/comprobantes'} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <PageHeader
        title={isEdit ? 'Editar comprobante' : 'Nuevo comprobante'}
        description="Los importes se calculan automáticamente según la condición fiscal del emisor y del receptor."
        actions={voucherName && <Badge tone="default" className="px-3 py-1 text-sm">{voucherName}</Badge>}
      />

      {!loadingPos && activePos.length === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="flex-1">No hay puntos de venta activos. <Link to="/configuracion/puntos-de-venta" className="font-medium underline">Configurá uno</Link> habilitado en ARCA para web services.</p>
        </div>
      )}

      <form onSubmit={form.handleSubmit((v) => save(v, false))} noValidate className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Datos del comprobante</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tipo" error={e.kind?.message}>
                <NativeSelect {...form.register('kind')}>
                  {Object.entries(VOUCHER_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Punto de venta" error={e.pointOfSaleId?.message}>
                <NativeSelect {...form.register('pointOfSaleId')}>
                  <option value="">Seleccionar</option>
                  {activePos.map((p) => <option key={p.id} value={p.id}>{String(p.number).padStart(5, '0')} · {p.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Fecha de emisión" error={e.issueDate?.message}>
                <Input type="date" {...form.register('issueDate')} />
              </Field>
              <Field label="Concepto">
                <NativeSelect {...form.register('concept')}>
                  {Object.entries(CONCEPTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              </Field>
              {values.concept !== 'PRODUCTS' && (
                <>
                  <Field label="Servicio desde" error={e.serviceFrom?.message}><Input type="date" {...form.register('serviceFrom')} /></Field>
                  <Field label="Servicio hasta" error={e.serviceTo?.message}><Input type="date" {...form.register('serviceTo')} /></Field>
                  <Field label="Vencimiento de pago" error={e.paymentDueDate?.message}><Input type="date" {...form.register('paymentDueDate')} /></Field>
                </>
              )}
              <Field label="Moneda">
                <NativeSelect {...form.register('currency')}>
                  {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              </Field>
              {values.currency !== 'PES' && (
                <Field label="Cotización" error={e.exchangeRate?.message}><Input type="number" step="0.000001" {...form.register('exchangeRate')} /></Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Receptor</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente" hint="Sin cliente se emite a Consumidor Final">
                <EntityPicker<Customer>
                  queryKey="customers"
                  fetcher={(s) => api<Paginated<Customer>>('/customers', { query: { search: s, pageSize: 20 } }).then((r) => r.data)}
                  value={customer}
                  onSelect={(c) => {
                    setCustomer(c);
                    setAssociated(null);
                    form.setValue('associatedInvoiceId', undefined);
                  }}
                  placeholder="Consumidor Final"
                  renderValue={(c) => c.name}
                  renderItem={(c) => (
                    <div>
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{DOCUMENT_TYPES[c.documentType]} {formatCuit(c.documentNumber)} · {VAT_CONDITIONS[c.vatCondition]}</p>
                    </div>
                  )}
                  extra={
                    customer && (
                      <button type="button" onClick={() => setCustomer(null)} className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted">
                        <UserRound className="h-4 w-4" /> Usar Consumidor Final
                      </button>
                    )
                  }
                />
              </Field>
              <Field label="Lista de precios" hint={customer?.priceList ? `El cliente usa "${customer.priceList.name}"` : undefined}>
                <NativeSelect {...form.register('priceListId')}>
                  <option value="">{customer?.priceList ? `Del cliente (${customer.priceList.name})` : 'Predeterminada / precio base'}</option>
                  {priceLists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </NativeSelect>
              </Field>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm sm:col-span-2">
                {customer ? (
                  <div className="grid gap-1 sm:grid-cols-3">
                    <span><span className="text-muted-foreground">Documento:</span> {DOCUMENT_TYPES[customer.documentType]} {formatCuit(customer.documentNumber)}</span>
                    <span><span className="text-muted-foreground">IVA:</span> {VAT_CONDITIONS[customer.vatCondition]}</span>
                    <span className="truncate"><span className="text-muted-foreground">Domicilio:</span> {customer.address ?? '—'}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Consumidor Final · sin identificar</span>
                )}
                {letter === null && <p className="mt-2 text-destructive">Las operaciones con clientes del exterior requieren Factura E (WSFEX), no disponible en este flujo.</p>}
              </div>
              {values.kind !== 'FACTURA' && (
                <Field label="Comprobante asociado" error={e.associatedInvoiceId?.message} className="sm:col-span-2">
                  <EntityPicker<InvoiceListItem>
                    queryKey="invoices-associable"
                    fetcher={(s) =>
                      api<Paginated<InvoiceListItem>>('/invoices', { query: { status: 'AUTHORIZED', customerId: customer?.id, search: s, pageSize: 30 } }).then((r) =>
                        r.data.filter((i) => VOUCHER_TYPES[i.voucherType].kind !== 'NOTA_CREDITO' && (!letter || VOUCHER_TYPES[i.voucherType].letter === letter)),
                      )
                    }
                    value={associated}
                    onSelect={(inv) => {
                      setAssociated(inv);
                      form.setValue('associatedInvoiceId', inv?.id, { shouldValidate: true });
                    }}
                    placeholder="Seleccionar comprobante autorizado"
                    renderValue={(i) => `${VOUCHER_TYPES[i.voucherType].name} ${voucherNumber(i.pointOfSale.number, i.number)}`}
                    renderItem={(i) => (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{VOUCHER_TYPES[i.voucherType].name} {voucherNumber(i.pointOfSale.number, i.number)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(i.issueDate)} · {i.receiverName}</p>
                        </div>
                        <span className="tabular text-sm">{formatMoney(i.total)}</span>
                      </div>
                    )}
                  />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Ítems</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ ...emptyItem })}><Plus /> Agregar ítem</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {typeof e.items?.message === 'string' && <p className="text-sm text-destructive">{e.items.message}</p>}
              {fields.map((field, index) => {
                const ie = e.items?.[index];
                const treatment = values.items[index]?.vatTreatment;
                return (
                  <div key={field.id} className="rounded-lg border p-3">
                    <div className="grid gap-3 md:grid-cols-12">
                      <div className="md:col-span-5">
                        <Field label="Producto / descripción" error={ie?.description?.message}>
                          <div className="space-y-2">
                            <EntityPicker<Product>
                              queryKey="products"
                              fetcher={(s) => api<Paginated<Product>>('/products', { query: { search: s, active: true, pageSize: 20, priceListId: effectiveListId || undefined } }).then((r) => r.data)}
                              value={null}
                              onSelect={(p) => pickProduct(index, p)}
                              placeholder="Buscar en el catálogo…"
                              renderValue={(p) => p.name}
                              renderItem={(p) => (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate">{p.name}</p>
                                    <p className="text-xs text-muted-foreground">{p.sku ?? ''} {p.vatTreatment === 'GRAVADO' ? `IVA ${Number(p.vatRate)}%` : VAT_TREATMENTS[p.vatTreatment]}</p>
                                  </div>
                                  <span className="tabular text-sm">{formatMoney(p.effectivePrice ?? p.price)}</span>
                                </div>
                              )}
                            />
                            <Input placeholder="Descripción" {...form.register(`items.${index}.description`)} />
                          </div>
                        </Field>
                      </div>
                      <Field label="Cantidad" error={ie?.quantity?.message} className="md:col-span-2">
                        <Input type="number" step="0.0001" min="0" {...form.register(`items.${index}.quantity`)} />
                      </Field>
                      <Field label="Precio unit. neto" error={ie?.unitPrice?.message} className="md:col-span-3">
                        <Input type="number" step="0.0001" min="0" {...form.register(`items.${index}.unitPrice`)} />
                      </Field>
                      <Field label="Bonif. %" className="md:col-span-2">
                        <Input type="number" step="0.01" min="0" max="100" {...form.register(`items.${index}.discountPercent`)} />
                      </Field>
                      {!isMono && (
                        <>
                          <Field label="IVA" className="md:col-span-3">
                            <NativeSelect {...form.register(`items.${index}.vatTreatment`)}>
                              {Object.entries(VAT_TREATMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </NativeSelect>
                          </Field>
                          <Field label="Alícuota" className="md:col-span-2">
                            <NativeSelect {...form.register(`items.${index}.vatRate`)} disabled={treatment !== 'GRAVADO'}>
                              {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                            </NativeSelect>
                          </Field>
                        </>
                      )}
                      <div className={`flex items-end justify-between gap-2 ${isMono ? 'md:col-span-12' : 'md:col-span-7'}`}>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Subtotal: </span>
                          <span className="tabular font-semibold">{formatMoney(totals.lines[index]?.total ?? 0, values.currency)}</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={fields.length === 1} onClick={() => remove(index)} aria-label="Quitar ítem">
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
            <CardContent><Textarea rows={3} placeholder="Texto adicional que se imprime en el comprobante" {...form.register('notes')} /></CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!isMono ? (
                <>
                  <Row label="Neto gravado" value={formatMoney(totals.netTaxed, values.currency)} />
                  {totals.netUntaxed > 0 && <Row label="No gravado" value={formatMoney(totals.netUntaxed, values.currency)} />}
                  {totals.exempt > 0 && <Row label="Exento" value={formatMoney(totals.exempt, values.currency)} />}
                  {totals.vatGroups.map((g) => <Row key={g.rate} label={`IVA ${g.rate}%`} value={formatMoney(g.vat, values.currency)} />)}
                </>
              ) : (
                <Row label="Subtotal" value={formatMoney(totals.netTaxed, values.currency)} />
              )}
              <div className="my-3 border-t" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Total</span>
                <span className="tabular text-2xl font-semibold">{formatMoney(totals.total, values.currency)}</span>
              </div>
              <p className="pt-2 text-xs text-muted-foreground">Vista previa. Los importes definitivos los calcula el servidor al guardar.</p>
              <div className="flex flex-col gap-2 pt-4">
                <Button type="submit" variant="outline" loading={busy && !confirmEmit} disabled={busy || letter === null}>Guardar borrador</Button>
                {canEmit && (
                  <Button
                    type="button"
                    disabled={busy || letter === null}
                    onClick={async () => {
                      if (await form.trigger()) setConfirmEmit(true);
                    }}
                  >
                    <Send /> Guardar y emitir
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      <ConfirmDialog
        open={confirmEmit}
        onOpenChange={setConfirmEmit}
        title="Emitir comprobante ante ARCA"
        description={
          <div className="space-y-2">
            <p>Se solicitará el CAE para <b>{voucherName}</b> por <b>{formatMoney(totals.total, values.currency)}</b> a {customer?.name ?? 'Consumidor Final'}.</p>
            <p>Una vez autorizado no puede modificarse ni eliminarse; solo anularse con una nota de crédito.</p>
            {company?.settings?.arcaEnvironment === 'HOMOLOGATION' && <p className="text-amber-700">Ambiente de homologación: el comprobante no tendrá validez fiscal.</p>}
          </div>
        }
        confirmLabel="Emitir"
        loading={busy}
        onConfirm={form.handleSubmit((v) => save(v, true))}
      />
      {isEdit && !existing && <Skeleton className="h-40" />}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
