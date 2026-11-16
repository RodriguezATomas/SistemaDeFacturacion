import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CheckCircle2, FileText, Plus, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, Input, NativeSelect } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { loadMe, login, logout, register, switchCompany } from '@/lib/auth';
import { TAX_CONDITIONS } from '@/lib/constants';
import { companySchema, loginSchema, registerSchema, resetSchema } from '@/lib/schemas';
import { formatCuit } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useZodForm } from '@/hooks/use-zod-form';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <FileText className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Facturación</span>
        </div>
        <div className="relative max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight text-white">Gestión comercial y facturación electrónica para tu empresa.</h2>
          <ul className="space-y-3 text-sm text-sidebar-foreground/80">
            {[
              'Comprobantes A, B y C autorizados por ARCA con CAE y QR',
              'Clientes, productos, listas de precios y puntos de venta',
              'Multiempresa con roles, permisos y auditoría completa',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-sidebar-muted">
          <ShieldCheck className="h-4 w-4" /> Datos fiscales cifrados y aislados por empresa
        </p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ deploymentMode: 'saas' | 'private'; registrationEnabled: boolean }>('/auth/config'),
    staleTime: Infinity,
  });
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: config } = usePublicConfig();
  const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(me.activeCompanyId ? (from ?? '/') : '/seleccionar-empresa', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Ingresá con tu cuenta para continuar."
      footer={
        config?.registrationEnabled && (
          <>
            ¿No tenés cuenta?{' '}
            <Link to="/registro" className="font-medium text-primary hover:underline">
              Registrá tu empresa
            </Link>
          </>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} aria-invalid={!!form.formState.errors.email} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} aria-invalid={!!form.formState.errors.password} />
        </Field>
        <div className="flex justify-end">
          <Link to="/recuperar-clave" className="text-sm text-primary hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Ingresar
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { data: config } = usePublicConfig();
  const form = useZodForm(registerSchema, { defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirm: '',
      company: { legalName: '', cuit: '', taxCondition: 'RESPONSABLE_INSCRIPTO' },
    },
  });
  const e = form.formState.errors;

  if (config && !config.registrationEnabled) {
    return (
      <AuthShell title="Registro deshabilitado" subtitle="Esta es una instalación privada. Solicitá acceso al administrador.">
        <Button asChild variant="outline">
          <Link to="/login">Volver al inicio de sesión</Link>
        </Button>
      </AuthShell>
    );
  }

  const onSubmit = form.handleSubmit(async ({ confirm: _c, ...values }) => {
    try {
      await register(values);
      toast.success('¡Cuenta creada! Comenzó tu período de prueba.');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <AuthShell
      title="Registrá tu empresa"
      subtitle="Creá tu cuenta y empezá a facturar con ARCA."
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Iniciá sesión
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" htmlFor="firstName" error={e.firstName?.message}>
            <Input id="firstName" {...form.register('firstName')} />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={e.lastName?.message}>
            <Input id="lastName" {...form.register('lastName')} />
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={e.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contraseña" htmlFor="password" error={e.password?.message} hint="10+ caracteres, letras y números">
            <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label="Repetir contraseña" htmlFor="confirm" error={e.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
        </div>
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" /> Datos de la empresa
          </p>
          <div className="space-y-3">
            <Field label="Razón social" htmlFor="legalName" error={e.company?.legalName?.message}>
              <Input id="legalName" {...form.register('company.legalName')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CUIT" htmlFor="cuit" error={e.company?.cuit?.message}>
                <Input id="cuit" placeholder="30-12345678-9" {...form.register('company.cuit')} />
              </Field>
              <Field label="Condición frente al IVA" htmlFor="taxCondition">
                <NativeSelect id="taxCondition" {...form.register('company.taxCondition')}>
                  {Object.entries(TAX_CONDITIONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  );
}

const forgotSchema = z.object({ email: z.string().trim().email('Email inválido') });

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useZodForm(forgotSchema);
  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <AuthShell title="Recuperar contraseña" subtitle="Te enviaremos un enlace para restablecerla." footer={<Link to="/login" className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Volver</Link>}>
      {sent ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
            <p className="text-sm">Si el email está registrado, recibirás las instrucciones en unos minutos. Revisá también la carpeta de spam.</p>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" {...form.register('email')} />
          </Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const isInvite = params.get('invitacion') === '1';
  const form = useZodForm(resetSchema);
  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      toast.success(isInvite ? 'Cuenta activada. Ya podés ingresar.' : 'Contraseña actualizada');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <AuthShell title={isInvite ? 'Activá tu cuenta' : 'Nueva contraseña'} subtitle={isInvite ? 'Definí una contraseña para comenzar.' : 'Elegí una contraseña segura.'}>
      {!token ? (
        <p className="text-sm text-destructive">Enlace inválido.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Contraseña" htmlFor="password" error={form.formState.errors.password?.message} hint="10+ caracteres, letras y números">
            <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label="Repetir contraseña" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function SelectCompanyPage() {
  const me = useAuthStore((s) => s.me)!;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(params.get('nueva') === '1' || me.companies.length === 0);
  const form = useZodForm(companySchema, { defaultValues: { legalName: '', cuit: '', taxCondition: 'RESPONSABLE_INSCRIPTO' },
  });

  const choose = async (id: string) => {
    try {
      await switchCompany(id);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const create = form.handleSubmit(async (values) => {
    try {
      const company = await api<{ id: string }>('/companies', { method: 'POST', body: values });
      await loadMe();
      await choose(company.id);
      toast.success('Empresa creada');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <AuthShell
      title={creating ? 'Nueva empresa' : 'Seleccioná una empresa'}
      subtitle={creating ? 'Cargá los datos fiscales básicos.' : `Hola ${me.user.firstName}, ¿con qué empresa vas a trabajar?`}
      footer={
        <button className="text-primary hover:underline" onClick={() => logout().then(() => navigate('/login'))}>
          Cerrar sesión
        </button>
      }
    >
      {!creating ? (
        <div className="space-y-2">
          {me.companies.map((c) => (
            <button
              key={c.id}
              onClick={() => choose(c.id)}
              className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-card transition hover:border-primary/50 hover:bg-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{c.tradeName || c.legalName}</p>
                <p className="text-xs text-muted-foreground">
                  CUIT {formatCuit(c.cuit)} · {c.role}
                </p>
              </div>
            </button>
          ))}
          {me.deploymentMode === 'saas' && (
            <Button variant="outline" className="mt-2 w-full" onClick={() => setCreating(true)}>
              <Plus /> Crear otra empresa
            </Button>
          )}
        </div>
      ) : me.deploymentMode !== 'saas' ? (
        <p className="text-sm text-muted-foreground">Tu usuario no tiene empresas asignadas. Contactá al administrador.</p>
      ) : (
        <form onSubmit={create} className="space-y-4" noValidate>
          <Field label="Razón social" htmlFor="legalName" error={form.formState.errors.legalName?.message}>
            <Input id="legalName" {...form.register('legalName')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUIT" htmlFor="cuit" error={form.formState.errors.cuit?.message}>
              <Input id="cuit" {...form.register('cuit')} />
            </Field>
            <Field label="Condición frente al IVA" htmlFor="taxCondition">
              <NativeSelect id="taxCondition" {...form.register('taxCondition')}>
                {Object.entries(TAX_CONDITIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex gap-2">
            {me.companies.length > 0 && (
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            )}
            <Button type="submit" className="flex-1" loading={form.formState.isSubmitting}>
              Crear empresa
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
