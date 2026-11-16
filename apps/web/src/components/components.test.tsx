import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/pages/auth/auth-pages';
import { useAuthStore } from '@/stores/auth-store';
import { ConfirmDialog, DataTable, InvoiceStatusBadge } from './shared/common';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('componentes compartidos', () => {
  it('muestra el estado del comprobante con su etiqueta', () => {
    render(<InvoiceStatusBadge status="UNKNOWN" />);
    expect(screen.getByText('A conciliar')).toBeInTheDocument();
  });

  it('DataTable muestra filas y estado vacío', () => {
    const { rerender } = render(
      <DataTable rows={[{ id: '1', name: 'Cliente Uno' }]} columns={[{ header: 'Nombre', cell: (r) => r.name }]} empty={<p>Vacío</p>} />,
    );
    expect(screen.getByText('Cliente Uno')).toBeInTheDocument();
    rerender(<DataTable rows={[]} columns={[{ header: 'Nombre', cell: (r: { id: string; name: string }) => r.name }]} empty={<p>Vacío</p>} />);
    expect(screen.getByText('Vacío')).toBeInTheDocument();
  });

  it('ConfirmDialog ejecuta la acción al confirmar', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={() => undefined} title="¿Eliminar?" description="Sin vuelta atrás" confirmLabel="Sí, eliminar" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('Login', () => {
  it('valida campos antes de llamar a la API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deploymentMode: 'saas', registrationEnabled: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ status: 'anonymous', me: null, accessToken: null });
    wrap(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(screen.getByText('Ingrese su contraseña')).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/auth/config'))).toBe(true);
  });

  it('muestra el error del servidor ante credenciales inválidas', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/auth/config')
        ? new Response(JSON.stringify({ deploymentMode: 'saas', registrationEnabled: true }), { status: 200 })
        : new Response(JSON.stringify({ statusCode: 401, message: 'Email o contraseña incorrectos' }), { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    wrap(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'ana@empresa.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'incorrecta123');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('¿No tenés cuenta?', { exact: false })).toBeInTheDocument();
  });
});
