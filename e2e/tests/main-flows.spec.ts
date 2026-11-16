import { expect, test } from '@playwright/test';
import { PASSWORD, registerCompany } from './helpers';

test.describe('Flujos principales', () => {
  test('registro, sesión persistente, cierre y nuevo inicio de sesión', async ({ page }) => {
    const { email } = await registerCompany(page);

    // La sesión se recupera con la cookie httpOnly al recargar.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hola, Lucía' })).toBeVisible();

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Contraseña').fill('incorrecta12345');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();

    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Hola, Lucía' })).toBeVisible();
  });

  test('rutas protegidas redirigen al login sin sesión', async ({ page }) => {
    await page.goto('/comprobantes');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('alta de cliente, producto y punto de venta; borrador de factura con cálculo de IVA', async ({ page }) => {
    await registerCompany(page);

    // Cliente Responsable Inscripto
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Nuevo cliente' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre o razón social').fill('Distribuidora Norte SRL');
    await dialog.getByLabel('Número').fill('20123456787');
    await dialog.getByLabel('Condición frente al IVA').selectOption('RESPONSABLE_INSCRIPTO');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText('CUIT inválido')).toBeVisible();
    await dialog.getByLabel('Número').fill('20-12345678-6');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('cell', { name: /Distribuidora Norte SRL/ })).toBeVisible();

    // Producto gravado al 21%
    await page.goto('/productos');
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    const pd = page.getByRole('dialog');
    await pd.getByLabel('Nombre').fill('Monitor 24"');
    await pd.getByLabel('Precio neto (sin IVA)').fill('150000');
    await pd.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('cell', { name: /Monitor 24/ })).toBeVisible();

    // Punto de venta
    await page.goto('/configuracion/puntos-de-venta');
    await page.getByRole('button', { name: 'Nuevo punto de venta' }).click();
    const posDialog = page.getByRole('dialog');
    await posDialog.getByLabel('Número').fill('3');
    await posDialog.getByLabel('Nombre').fill('Casa central');
    await posDialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('cell', { name: '00003' })).toBeVisible();

    // Borrador de comprobante: RI → RI = Factura A
    await page.goto('/comprobantes/nuevo');
    await page.getByRole('button', { name: 'Consumidor Final' }).click();
    await page.getByRole('option', { name: /Distribuidora Norte SRL/ }).click();
    await expect(page.getByText('Factura A', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Buscar en el catálogo…' }).click();
    await page.getByRole('option', { name: /Monitor 24/ }).click();
    await page.getByLabel('Cantidad').fill('2');
    await expect(page.getByText('$ 363.000,00').first()).toBeVisible();

    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page).toHaveURL(/\/comprobantes\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Borrador sin validez fiscal')).toBeVisible();
    await expect(page.getByText('IVA 21%')).toBeVisible();
    await expect(page.getByText('$ 363.000,00').first()).toBeVisible();

    // Sin certificado no se puede emitir y el comprobante sigue editable (nunca se simula un CAE).
    await page.getByRole('button', { name: 'Emitir' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Emitir' }).click();
    await expect(page.getByText(/No hay un certificado digital activo/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByText('Borrador sin validez fiscal')).toBeVisible();

    // El listado muestra el borrador
    await page.goto('/comprobantes');
    await expect(page.getByRole('cell', { name: 'Distribuidora Norte SRL' })).toBeVisible();
    await expect(page.getByRole('cell').getByText('Borrador')).toBeVisible();
  });

  test('monotributista emite comprobantes C sin discriminar IVA', async ({ page }) => {
    await registerCompany(page, 'MONOTRIBUTO');
    await page.goto('/configuracion/puntos-de-venta');
    await page.getByRole('button', { name: 'Nuevo punto de venta' }).click();
    await page.getByRole('dialog').getByLabel('Número').fill('1');
    await page.getByRole('dialog').getByLabel('Nombre').fill('Principal');
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('cell', { name: '00001' })).toBeVisible();

    await page.goto('/comprobantes/nuevo');
    await expect(page.getByText('Factura C', { exact: true })).toBeVisible();
    await page.getByPlaceholder('Descripción').fill('Honorarios profesionales');
    await page.getByLabel('Precio unit. neto').fill('85000');
    await expect(page.getByText('IVA 21%')).toHaveCount(0);
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByRole('heading', { name: /Factura C/ })).toBeVisible();
    await expect(page.getByText('$ 85.000,00').first()).toBeVisible();
  });

  test('gestión de usuarios y roles visible para el propietario', async ({ page }) => {
    await registerCompany(page);
    await page.goto('/configuracion/roles');
    await expect(page.getByText('Propietario')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Facturación/ })).toBeVisible();
    await page.goto('/configuracion/usuarios');
    await page.getByRole('button', { name: 'Invitar usuario' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Email').fill(`invitado-${Date.now()}@test.local`);
    await d.getByLabel('Nombre').fill('Pedro');
    await d.getByLabel('Apellido').fill('Gómez');
    await d.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Invitación pendiente')).toBeVisible();
    await page.goto('/auditoria');
    await expect(page.getByText('user.invite')).toBeVisible();
  });
});
