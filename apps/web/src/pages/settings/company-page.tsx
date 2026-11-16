import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useEffect } from 'react';
import { z } from 'zod';
import { ErrorState, Field, PageHeader } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, NativeSelect, Skeleton, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import { loadMe } from '@/lib/auth';
import { TAX_CONDITIONS } from '@/lib/constants';
import type { Company, PriceList } from '@/lib/types';
import { formatCuit } from '@/lib/utils';

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const companyForm = z.object({
  legalName: z.string().trim().min(2, 'Requerido').max(200),
  tradeName: opt(200),
  taxCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO']),
  grossIncomeNumber: opt(50),
  activityStartDate: opt(10),
  address: opt(250),
  city: opt(100),
  province: opt(100),
  postalCode: opt(20),
  phone: opt(50),
  email: z.string().trim().optional().refine((v) => !v || z.string().email().safeParse(v).success, 'Email inválido').transform((v) => (v ? v : null)),
});

const settingsForm = z.object({
  defaultPriceListId: z.string().optional().transform((v) => (v ? v : null)),
  invoiceFooter: opt(500),
});

export function CompanyPage() {
  const { data: company, isLoading, error, refetch } = useQuery({ queryKey: ['company', 'current'], queryFn: () => api<Company>('/companies/current') });
  const { data: lists } = useQuery({ queryKey: ['price-lists'], queryFn: () => api<PriceList[]>('/price-lists') });
  const form = useZodForm(companyForm);
  const sForm = useZodForm(settingsForm);

  useEffect(() => {
    if (!company) return;
    form.reset({
      legalName: company.legalName,
      tradeName: company.tradeName ?? '',
      taxCondition: company.taxCondition,
      grossIncomeNumber: company.grossIncomeNumber ?? '',
      activityStartDate: company.activityStartDate?.slice(0, 10) ?? '',
      address: company.address ?? '',
      city: company.city ?? '',
      province: company.province ?? '',
      postalCode: company.postalCode ?? '',
      phone: company.phone ?? '',
      email: company.email ?? '',
    });
    sForm.reset({ defaultPriceListId: company.settings?.defaultPriceListId ?? '', invoiceFooter: company.settings?.invoiceFooter ?? '' });
  }, [company, form, sForm]);

  const save = useApiMutation((body: unknown) => api('/companies/current', { method: 'PATCH', body }), {
    invalidate: [['company']],
    success: 'Datos de la empresa actualizados',
    onSuccess: () => void loadMe(),
  });
  const saveSettings = useApiMutation((body: unknown) => api('/companies/current/settings', { method: 'PATCH', body }), {
    invalidate: [['company']],
    success: 'Configuración guardada',
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !company) return <Card><ErrorState message={errorMessage(error)} onRetry={refetch} /></Card>;
  const e = form.formState.errors;

  return (
    <>
      <PageHeader title="Empresa" icon={Building2} description={`CUIT ${formatCuit(company.cuit)} · Datos que se imprimen en los comprobantes.`} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <CardHeader>
              <CardTitle>Datos fiscales y comerciales</CardTitle>
              <CardDescription>La CUIT no puede modificarse: identifica a la empresa ante ARCA.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Razón social" error={e.legalName?.message}><Input {...form.register('legalName')} /></Field>
              <Field label="Nombre de fantasía"><Input {...form.register('tradeName')} /></Field>
              <Field label="CUIT"><Input value={formatCuit(company.cuit)} disabled /></Field>
              <Field label="Condición frente al IVA" hint="Determina la letra de los comprobantes (A/B o C)">
                <NativeSelect {...form.register('taxCondition')}>
                  {Object.entries(TAX_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Ingresos Brutos"><Input {...form.register('grossIncomeNumber')} /></Field>
              <Field label="Inicio de actividades"><Input type="date" {...form.register('activityStartDate')} /></Field>
              <Field label="Domicilio comercial" className="sm:col-span-2"><Input {...form.register('address')} /></Field>
              <Field label="Localidad"><Input {...form.register('city')} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provincia"><Input {...form.register('province')} /></Field>
                <Field label="C.P."><Input {...form.register('postalCode')} /></Field>
              </div>
              <Field label="Teléfono"><Input {...form.register('phone')} /></Field>
              <Field label="Email" error={e.email?.message}><Input type="email" {...form.register('email')} /></Field>
            </CardContent>
            <CardFooter className="justify-end"><Button type="submit" loading={save.isPending}>Guardar cambios</Button></CardFooter>
          </form>
        </Card>
        <Card>
          <form onSubmit={sForm.handleSubmit((v) => saveSettings.mutate(v))} noValidate>
            <CardHeader>
              <CardTitle>Preferencias de facturación</CardTitle>
              <CardDescription>El ambiente de ARCA se administra en Configuración › ARCA.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Lista de precios predeterminada">
                <NativeSelect {...sForm.register('defaultPriceListId')}>
                  <option value="">Precio base</option>
                  {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Leyenda al pie del comprobante">
                <Textarea rows={4} {...sForm.register('invoiceFooter')} placeholder="Ej.: datos bancarios, condiciones de pago…" />
              </Field>
            </CardContent>
            <CardFooter className="justify-end"><Button type="submit" variant="outline" loading={saveSettings.isPending}>Guardar</Button></CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}
