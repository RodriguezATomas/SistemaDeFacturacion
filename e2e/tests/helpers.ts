import { expect, type Page } from '@playwright/test';
import { randomBytes } from 'crypto';

export const PASSWORD = 'ClaveE2E12345';

/** CUIT válida aleatoria (prefijo 30) para que cada ejecución use una empresa nueva. */
export function randomCuit(): string {
  const base = `30${String(randomBytes(4).readUInt32BE() % 100000000).padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  const mod = 11 - (sum % 11);
  if (mod === 10) return randomCuit();
  return `${base}${mod === 11 ? 0 : mod}`;
}

export async function registerCompany(page: Page, taxCondition = 'RESPONSABLE_INSCRIPTO') {
  const email = `e2e-${randomBytes(4).toString('hex')}@test.local`;
  await page.goto('/registro');
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Apellido').fill('Fernández');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByLabel('Razón social').fill(`Empresa E2E ${email.slice(4, 12)}`);
  await page.getByLabel('CUIT').fill(randomCuit());
  await page.getByLabel('Condición frente al IVA').selectOption(taxCondition);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Lucía' })).toBeVisible();
  return { email };
}
