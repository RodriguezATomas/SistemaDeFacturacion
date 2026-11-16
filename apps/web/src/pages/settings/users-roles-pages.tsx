import { useQuery } from '@tanstack/react-query';
import { Mail, MoreHorizontal, Pencil, Plus, Shield, Trash2, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ConfirmDialog, DataTable, EmptyState, Field, PageHeader } from '@/components/shared/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Avatar, AvatarFallback, Badge, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label, NativeSelect, Textarea } from '@/components/ui/primitives';
import { useApiMutation } from '@/hooks/use-api';
import { useZodForm } from '@/hooks/use-zod-form';
import { api, errorMessage } from '@/lib/api';
import { PERMISSION_MODULES } from '@/lib/constants';
import type { Member, Permission, Role } from '@/lib/types';
import { formatDateTime, initials } from '@/lib/utils';
import { useAuthStore, useCan } from '@/stores/auth-store';

const inviteSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  firstName: z.string().trim().min(1, 'Requerido').max(100),
  lastName: z.string().trim().min(1, 'Requerido').max(100),
  roleId: z.string().min(1, 'Seleccione un rol'),
});

const STATUS: Record<Member['status'], { label: string; tone: 'success' | 'warning' | 'muted' }> = {
  ACTIVE: { label: 'Activo', tone: 'success' },
  INVITED: { label: 'Invitación pendiente', tone: 'warning' },
  DISABLED: { label: 'Desactivado', tone: 'muted' },
};

export function UsersPage() {
  const canManage = useCan('users.manage');
  const myId = useAuthStore((s) => s.me?.user.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleDialog, setRoleDialog] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [roleId, setRoleId] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['users'], queryFn: () => api<Member[]>('/users') });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const form = useZodForm(inviteSchema);

  const invite = useApiMutation((body: unknown) => api('/users/invite', { method: 'POST', body }), {
    invalidate: [['users']],
    success: 'Invitación enviada',
    onSuccess: () => {
      setInviteOpen(false);
      form.reset();
    },
  });
  const update = useApiMutation(({ id, body }: { id: string; body: unknown }) => api(`/users/${id}`, { method: 'PATCH', body }), {
    invalidate: [['users'], ['roles']],
    success: 'Usuario actualizado',
    onSuccess: () => setRoleDialog(null),
  });
  const resend = useApiMutation((id: string) => api(`/users/${id}/resend-invite`, { method: 'POST' }), { success: 'Invitación reenviada' });
  const remove = useApiMutation((id: string) => api(`/users/${id}`, { method: 'DELETE' }), {
    invalidate: [['users'], ['roles']],
    success: 'Usuario quitado de la empresa',
    onSuccess: () => setRemoving(null),
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        icon={Users}
        description="Personas con acceso a esta empresa y su rol."
        actions={canManage && <Button onClick={() => { form.reset({ email: '', firstName: '', lastName: '', roleId: roles.find((r) => r.systemKey === 'billing')?.id ?? '' }); setInviteOpen(true); }}><UserPlus /> Invitar usuario</Button>}
      />
      <DataTable<Member>
        rows={data}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        columns={[
          {
            header: 'Usuario',
            cell: (m) => (
              <div className="flex items-center gap-3">
                <Avatar><AvatarFallback>{initials(m.user.firstName, m.user.lastName)}</AvatarFallback></Avatar>
                <div>
                  <p className="font-medium">{m.user.firstName} {m.user.lastName} {m.user.id === myId && <span className="text-xs text-muted-foreground">(vos)</span>}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email}</p>
                </div>
              </div>
            ),
          },
          { header: 'Rol', cell: (m) => <Badge tone="default">{m.role.name}</Badge> },
          { header: 'Estado', cell: (m) => <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge> },
          { header: 'Último ingreso', cell: (m) => <span className="text-xs text-muted-foreground">{formatDateTime(m.user.lastLoginAt)}</span>, className: 'hidden md:table-cell' },
          {
            header: '',
            className: 'w-12 text-right',
            cell: (m) =>
              canManage && m.user.id !== myId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones"><MoreHorizontal /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { setRoleId(m.role.id); setRoleDialog(m); }}><Shield /> Cambiar rol</DropdownMenuItem>
                    {m.status === 'INVITED' && <DropdownMenuItem onSelect={() => resend.mutate(m.id)}><Mail /> Reenviar invitación</DropdownMenuItem>}
                    {m.status === 'ACTIVE' && <DropdownMenuItem onSelect={() => update.mutate({ id: m.id, body: { status: 'DISABLED' } })}><UserX /> Desactivar</DropdownMenuItem>}
                    {m.status === 'DISABLED' && <DropdownMenuItem onSelect={() => update.mutate({ id: m.id, body: { status: 'ACTIVE' } })}><UserCheck /> Reactivar</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setRemoving(m)}><Trash2 /> Quitar de la empresa</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
          },
        ]}
        empty={<EmptyState icon={Users} title="Sin usuarios" />}
      />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Invitar usuario</DialogTitle>
            <DialogDescription>Recibirá un email para definir su contraseña. Si ya tiene cuenta, se lo agrega directamente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => invite.mutate(v))} className="space-y-4" noValidate>
            <Field label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register('email')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" error={form.formState.errors.firstName?.message}><Input {...form.register('firstName')} /></Field>
              <Field label="Apellido" error={form.formState.errors.lastName?.message}><Input {...form.register('lastName')} /></Field>
            </div>
            <Field label="Rol" error={form.formState.errors.roleId?.message}>
              <NativeSelect {...form.register('roleId')}>
                <option value="">Seleccionar</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </NativeSelect>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={invite.isPending}>Enviar invitación</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleDialog} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cambiar rol de {roleDialog?.user.firstName}</DialogTitle></DialogHeader>
          <NativeSelect value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Rol">
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>Cancelar</Button>
            <Button loading={update.isPending} onClick={() => roleDialog && update.mutate({ id: roleDialog.id, body: { roleId } })}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Quitar usuario"
        description={<>¿Quitar a <b>{removing?.user.email}</b> de la empresa? Perderá el acceso inmediatamente.</>}
        confirmLabel="Quitar"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}

const roleSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
  description: z.string().trim().max(250).optional(),
});

function RoleEditor({ open, onOpenChange, editing, catalog }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Role | null; catalog: Permission[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const form = useZodForm(roleSchema);
  useEffect(() => {
    if (!open) return;
    form.reset({ name: editing?.name ?? '', description: editing?.description ?? '' });
    setSelected(new Set(editing?.permissions ?? []));
  }, [open, editing, form]);

  const save = useApiMutation(
    (body: unknown) => (editing ? api(`/roles/${editing.id}`, { method: 'PATCH', body }) : api('/roles', { method: 'POST', body })),
    { invalidate: [['roles']], success: 'Rol guardado', onSuccess: () => onOpenChange(false) },
  );
  const grouped = catalog.reduce<Record<string, Permission[]>>((acc, p) => ((acc[p.module] ??= []).push(p), acc), {});
  const toggle = (code: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(code); else n.delete(code); return n; });
  const locked = editing?.systemKey === 'owner';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Rol: ${editing.name}` : 'Nuevo rol'}</DialogTitle>
          <DialogDescription>{locked ? 'El rol Propietario tiene todos los permisos y no puede modificarse.' : 'Seleccioná los permisos del rol.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate({ ...v, description: v.description || null, permissions: [...selected] }))} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" error={form.formState.errors.name?.message}><Input {...form.register('name')} disabled={editing?.isSystem} /></Field>
            <Field label="Descripción"><Textarea rows={1} {...form.register('description')} disabled={locked} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(grouped).map(([module, perms]) => (
              <div key={module} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-semibold">{PERMISSION_MODULES[module] ?? module}</p>
                <ul className="space-y-2">
                  {perms.map((p) => (
                    <li key={p.code} className="flex items-start gap-2">
                      <Checkbox id={p.code} checked={selected.has(p.code)} disabled={locked} onCheckedChange={(v) => toggle(p.code, v === true)} />
                      <Label htmlFor={p.code} className="text-sm font-normal leading-snug">{p.description}</Label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            {!locked && <Button type="submit" loading={save.isPending}>Guardar rol</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RolesPage() {
  const canManage = useCan('roles.manage');
  const [editor, setEditor] = useState<{ open: boolean; editing: Role | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Role | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const { data: catalog = [] } = useQuery({ queryKey: ['permissions'], queryFn: () => api<Permission[]>('/permissions') });
  const remove = useApiMutation((id: string) => api(`/roles/${id}`, { method: 'DELETE' }), { invalidate: [['roles']], success: 'Rol eliminado', onSuccess: () => setDeleting(null) });

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        icon={Shield}
        description="Control de acceso basado en roles. Los permisos se validan en el servidor en cada operación."
        actions={canManage && <Button onClick={() => setEditor({ open: true, editing: null })}><Plus /> Nuevo rol</Button>}
      />
      {error ? (
        <Card><CardContent className="p-6 text-sm text-destructive">{errorMessage(error)} <Button variant="link" onClick={() => refetch()}>Reintentar</Button></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(isLoading ? [] : data ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">{r.name} {r.isSystem && <Badge tone="muted">Sistema</Badge>}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description ?? 'Rol personalizado'}</p>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{r.permissions.length} permisos · {r.membersCount} usuario(s)</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditor({ open: true, editing: r })} aria-label="Ver o editar"><Pencil /></Button>
                  {canManage && !r.isSystem && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(r)} aria-label="Eliminar"><Trash2 /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <RoleEditor open={editor.open} editing={editor.editing} catalog={catalog} onOpenChange={(open) => setEditor((e) => ({ ...e, open }))} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminar rol"
        description={<>¿Eliminar el rol <b>{deleting?.name}</b>? Debe no tener usuarios asignados.</>}
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
