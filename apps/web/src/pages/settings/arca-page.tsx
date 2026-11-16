import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, FileKey2, KeyRound, PlugZap, Scale, ScrollText, ShieldCheck, Trash2, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, DataTable, EmptyState, ErrorState, Field, PageHeader, Pagination } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, NativeSelect, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { api, errorMessage } from '@/lib/api';
import type { Paginated, PointOfSale } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/utils';

type Env = 'HOMOLOGATION' | 'PRODUCTION';
const ENV_LABEL: Record<Env, string> = { HOMOLOGATION: 'Homologación', PRODUCTION: 'Producción' };

interface Credential {
  id: string;
  environment: Env;
  cuit: string;
  certificateSubject: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: 'PENDING_CERTIFICATE' | 'EXPIRED' | 'ACTIVE';
  updatedAt: string;
}

interface ArcaStatus {
  environment: Env;
  productionEnabled: boolean;
  credentials: Credential[];
  accessTicket: { generatedAt: string; expiresAt: string } | null;
  invoicesPendingReconciliation: number;
}

interface ArcaLog {
  id: string;
  environment: Env;
  service: string;
  operation: string;
  success: boolean;
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number;
  requestXml: string;
  responseXml: string | null;
  createdAt: string;
}

function CredentialCard({ env, cred, enabled }: { env: Env; cred?: Credential; enabled: boolean }) {
  const [csrOpen, setCsrOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [alias, setAlias] = useState('facturacion');
  const [csr, setCsr] = useState<string | null>(null);
  const [certificate, setCertificate] = useState('');
  const [privateKey, setPrivateKey] = useState('');

  const genCsr = useApiMutation(() => api<{ csr: string }>('/arca/credentials/csr', { method: 'POST', body: { environment: env, alias } }), {
    invalidate: [['arca']],
    onSuccess: (r) => setCsr(r.csr),
  });
  const upload = useApiMutation(
    () => api('/arca/credentials/certificate', { method: 'POST', body: { environment: env, certificate, privateKey: privateKey.trim() || undefined } }),
    {
      invalidate: [['arca']],
      success: 'Certificado cargado y validado',
      onSuccess: () => {
        setUploadOpen(false);
        setCertificate('');
        setPrivateKey('');
      },
    },
  );
  const remove = useApiMutation(() => api(`/arca/credentials/${env}`, { method: 'DELETE' }), {
    invalidate: [['arca']],
    success: 'Credenciales eliminadas',
    onSuccess: () => setDeleting(false),
  });

  const readFile = async (file: File | undefined, set: (v: string) => void) => {
    if (!file) return;
    if (file.size > 20000) return toast.error('Archivo demasiado grande para un certificado PEM');
    set(await file.text());
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><FileKey2 className="h-4 w-4 text-primary" /> {ENV_LABEL[env]}</CardTitle>
          <CardDescription>{env === 'HOMOLOGATION' ? 'Ambiente de pruebas: comprobantes sin validez fiscal.' : 'Ambiente real: comprobantes con validez fiscal.'}</CardDescription>
        </div>
        {cred ? (
          <Badge tone={cred.status === 'ACTIVE' ? 'success' : cred.status === 'EXPIRED' ? 'danger' : 'warning'}>
            {cred.status === 'ACTIVE' ? 'Activo' : cred.status === 'EXPIRED' ? 'Vencido' : 'Esperando certificado'}
          </Badge>
        ) : (
          <Badge tone="muted">Sin configurar</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">El ambiente de producción está deshabilitado en esta instalación (variable ARCA_PRODUCTION_ENABLED). Ver procedimiento de pase a producción en la documentación.</p>
        ) : (
          <>
            {cred?.status === 'ACTIVE' || cred?.status === 'EXPIRED' ? (
              <div className="grid gap-2 text-sm">
                <p className="break-all"><span className="text-muted-foreground">Certificado:</span> {cred.certificateSubject}</p>
                <p><span className="text-muted-foreground">Vigencia:</span> {formatDate(cred.validFrom)} al {formatDate(cred.validTo)}</p>
              </div>
            ) : cred?.status === 'PENDING_CERTIFICATE' ? (
              <p className="text-sm text-muted-foreground">Se generó la clave privada y el CSR. Tramitá el certificado en ARCA (WSASS en homologación / Administración de Certificados Digitales en producción) y cargalo acá.</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Generá el pedido de certificado (CSR). La clave privada queda cifrada en el servidor.</li>
                <li>Obtené el certificado en ARCA con ese CSR y asociale el servicio <b>wsfe</b>.</li>
                <li>Cargá el certificado (.crt / .pem).</li>
              </ol>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCsr(null); setCsrOpen(true); }}><KeyRound /> Generar CSR</Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}><Upload /> Cargar certificado</Button>
              {cred && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(true)}><Trash2 /> Eliminar</Button>}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={csrOpen} onOpenChange={setCsrOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Pedido de certificado (CSR) · {ENV_LABEL[env]}</DialogTitle>
            <DialogDescription>Se genera una clave RSA 2048 que se guarda cifrada (AES-256-GCM). Nunca se descarga ni se muestra.</DialogDescription>
          </DialogHeader>
          {!csr ? (
            <div className="space-y-4">
              <Field label="Alias del certificado" hint="Letras, números y guiones. Ej.: facturacion"><Input value={alias} onChange={(e) => setAlias(e.target.value)} /></Field>
              {cred && <p className="text-sm text-amber-700">Atención: reemplaza la clave y el certificado actuales de este ambiente.</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCsrOpen(false)}>Cancelar</Button>
                <Button onClick={() => genCsr.mutate(undefined)} loading={genCsr.isPending}>Generar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea readOnly value={csr} rows={12} className="font-mono text-xs" />
              <DialogFooter>
                <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(csr); toast.success('CSR copiado'); }}><Copy /> Copiar</Button>
                <Button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csr], { type: 'application/pkcs10' })); a.download = `${alias}-${env.toLowerCase()}.csr`; a.click(); }}>Descargar .csr</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Cargar certificado · {ENV_LABEL[env]}</DialogTitle>
            <DialogDescription>Se valida formato, vigencia, CUIT de la empresa y correspondencia con la clave privada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Certificado (PEM)">
              <Input type="file" accept=".crt,.pem,.cer" onChange={(e) => readFile(e.target.files?.[0], setCertificate)} />
              <Textarea rows={5} className="font-mono text-xs" placeholder="-----BEGIN CERTIFICATE-----" value={certificate} onChange={(e) => setCertificate(e.target.value)} />
            </Field>
            <Field label="Clave privada (opcional)" hint="Dejar vacío si el CSR se generó desde este sistema.">
              <Input type="file" accept=".key,.pem" onChange={(e) => readFile(e.target.files?.[0], setPrivateKey)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button>
            <Button onClick={() => upload.mutate(undefined)} loading={upload.isPending} disabled={!certificate.includes('BEGIN CERTIFICATE')}>Cargar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Eliminar credenciales de ${ENV_LABEL[env]}`}
        description="Se eliminarán el certificado y la clave privada. No podrá emitir en este ambiente hasta cargar nuevas credenciales."
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </Card>
  );
}

function ConnectionTest() {
  const test = useApiMutation(() => api<{ environment: Env; ok: boolean; steps: Array<{ step: string; ok: boolean; detail: unknown }> }>('/arca/test-connection', { method: 'POST' }));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Prueba de conexión</CardTitle>
          <CardDescription>FEDummy (disponibilidad) → WSAA (autenticación) → puntos de venta.</CardDescription>
        </div>
        <Button onClick={() => test.mutate(undefined)} loading={test.isPending}><PlugZap /> Probar conexión</Button>
      </CardHeader>
      {test.data && (
        <CardContent>
          <ul className="space-y-2">
            {test.data.steps.map((s) => (
              <li key={s.step} className="flex items-start gap-2 text-sm">
                {s.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div className="min-w-0">
                  <p className="font-medium">{s.step}</p>
                  <p className="break-words text-muted-foreground">{typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail)}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function Reconciliation() {
  const { data: pos } = useQuery({ queryKey: ['points-of-sale'], queryFn: () => api<PointOfSale[]>('/points-of-sale') });
  const [posId, setPosId] = useState('');
  const query = useQuery({
    queryKey: ['arca', 'reconciliation', posId],
    queryFn: () =>
      api<{ environment: Env; pointOfSale: number; rows: Array<{ voucherType: number; name: string; localLast: number; arcaLast: number | null; pendingUncertain: number; status: string; error: string | null }> }>(
        '/arca/reconciliation',
        { query: { pointOfSaleId: posId } },
      ),
    enabled: false,
    retry: false,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliación de numeración</CardTitle>
        <CardDescription>Compara el último número autorizado registrado en el sistema con el informado por ARCA.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect value={posId} onChange={(e) => setPosId(e.target.value)} className="sm:w-64" aria-label="Punto de venta">
            <option value="">Seleccionar punto de venta</option>
            {pos?.map((p) => <option key={p.id} value={p.id}>{String(p.number).padStart(5, '0')} · {p.name}</option>)}
          </NativeSelect>
          <Button variant="outline" disabled={!posId} onClick={() => query.refetch()} loading={query.isFetching}><Scale /> Conciliar</Button>
        </div>
        {query.error && <p className="text-sm text-destructive">{errorMessage(query.error)}</p>}
        {query.data && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">ARCA</th><th className="px-3 py-2">Estado</th></tr>
              </thead>
              <tbody className="divide-y">
                {query.data.rows.map((r) => (
                  <tr key={r.voucherType}>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="tabular px-3 py-2 text-right">{r.localLast}</td>
                    <td className="tabular px-3 py-2 text-right">{r.arcaLast ?? '—'}</td>
                    <td className="px-3 py-2">
                      {r.status === 'OK' ? <Badge tone="success">Coincide</Badge> : r.status === 'ERROR' ? <Badge tone="danger" title={r.error ?? ''}>Error</Badge> : <Badge tone="warning">{r.pendingUncertain ? `${r.pendingUncertain} incierto(s)` : 'Diferencia'}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Logs() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ArcaLog | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['arca', 'logs', page],
    queryFn: () => api<Paginated<ArcaLog>>('/arca/logs', { query: { page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <DataTable<ArcaLog>
        rows={data?.data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        onRowClick={setSelected}
        columns={[
          { header: 'Fecha', cell: (l) => <span className="tabular text-xs">{formatDateTime(l.createdAt)}</span> },
          { header: 'Operación', cell: (l) => <span className="font-medium">{l.service.toUpperCase()} · {l.operation}</span> },
          { header: 'Ambiente', cell: (l) => ENV_LABEL[l.environment], className: 'hidden md:table-cell' },
          { header: 'Resultado', cell: (l) => (l.success ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Error</Badge>) },
          { header: 'Duración', cell: (l) => `${l.durationMs} ms`, className: 'hidden sm:table-cell text-right' },
        ]}
        empty={<EmptyState icon={ScrollText} title="Sin operaciones registradas" />}
        footer={data && data.meta.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
      />
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{selected?.service.toUpperCase()} · {selected?.operation}</DialogTitle>
            <DialogDescription>{selected && formatDateTime(selected.createdAt)} · token y sign ocultos por seguridad</DialogDescription>
          </DialogHeader>
          {selected?.errorMessage && <p className="text-sm text-destructive">{selected.errorMessage}</p>}
          <Field label="Solicitud"><Textarea readOnly rows={8} className="font-mono text-xs" value={selected?.requestXml ?? ''} /></Field>
          <Field label="Respuesta"><Textarea readOnly rows={8} className="font-mono text-xs" value={selected?.responseXml ?? '(sin respuesta)'} /></Field>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ArcaPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['arca', 'status'], queryFn: () => api<ArcaStatus>('/arca/status') });
  const [envConfirm, setEnvConfirm] = useState<Env | null>(null);
  const changeEnv = useApiMutation((environment: Env) => api('/companies/current/settings', { method: 'PATCH', body: { arcaEnvironment: environment } }), {
    invalidate: [['arca'], ['company']],
    success: 'Ambiente de ARCA actualizado',
    onSuccess: () => setEnvConfirm(null),
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !data) return <Card><ErrorState message={errorMessage(error)} onRetry={refetch} /></Card>;
  const cred = (env: Env) => data.credentials.find((c) => c.environment === env);

  return (
    <>
      <PageHeader title="Integración ARCA" icon={ShieldCheck} description="Certificados digitales, ambiente de emisión y trazabilidad de operaciones (WSAA / WSFEv1)." />
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Ambiente activo para emitir</p>
            <div className="flex items-center gap-2">
              <Badge tone={data.environment === 'PRODUCTION' ? 'success' : 'warning'} className="px-3 py-1 text-sm">{ENV_LABEL[data.environment]}</Badge>
              {data.accessTicket && <span className="text-xs text-muted-foreground">Ticket WSAA vigente hasta {formatDateTime(data.accessTicket.expiresAt)}</span>}
            </div>
            {data.invoicesPendingReconciliation > 0 && <p className="text-sm text-amber-700">{data.invoicesPendingReconciliation} comprobante(s) pendientes de conciliación.</p>}
          </div>
          <Button
            variant="outline"
            disabled={data.environment === 'HOMOLOGATION' && !data.productionEnabled}
            onClick={() => setEnvConfirm(data.environment === 'PRODUCTION' ? 'HOMOLOGATION' : 'PRODUCTION')}
          >
            Cambiar a {data.environment === 'PRODUCTION' ? 'homologación' : 'producción'}
          </Button>
        </CardContent>
      </Card>
      <Tabs defaultValue="credentials">
        <TabsList className="flex-wrap">
          <TabsTrigger value="credentials"><FileKey2 /> Certificados</TabsTrigger>
          <TabsTrigger value="test"><PlugZap /> Conexión</TabsTrigger>
          <TabsTrigger value="reconcile"><Scale /> Conciliación</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText /> Registro</TabsTrigger>
        </TabsList>
        <TabsContent value="credentials" className="grid gap-6 lg:grid-cols-2">
          <CredentialCard env="HOMOLOGATION" cred={cred('HOMOLOGATION')} enabled />
          <CredentialCard env="PRODUCTION" cred={cred('PRODUCTION')} enabled={data.productionEnabled} />
        </TabsContent>
        <TabsContent value="test"><ConnectionTest /></TabsContent>
        <TabsContent value="reconcile"><Reconciliation /></TabsContent>
        <TabsContent value="logs"><Logs /></TabsContent>
      </Tabs>
      <ConfirmDialog
        open={!!envConfirm}
        onOpenChange={(o) => !o && setEnvConfirm(null)}
        title={`Cambiar a ${envConfirm ? ENV_LABEL[envConfirm] : ''}`}
        description={
          envConfirm === 'PRODUCTION'
            ? 'A partir de este cambio los comprobantes emitidos tendrán validez fiscal. Verifique haber probado el circuito completo en homologación y contar con el certificado de producción.'
            : 'Los nuevos comprobantes se emitirán en el ambiente de pruebas, sin validez fiscal.'
        }
        confirmLabel="Cambiar ambiente"
        destructive={envConfirm === 'PRODUCTION'}
        loading={changeEnv.isPending}
        onConfirm={() => envConfirm && changeEnv.mutate(envConfirm)}
      />
    </>
  );
}
