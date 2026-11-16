import { execSync } from 'child_process';
import { join } from 'path';

/**
 * Aplica las migraciones versionadas a la base de pruebas (operación no destructiva).
 * Cada prueba crea empresas y usuarios únicos, por lo que no es necesario vaciar la base.
 */
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://facturacion:facturacion@localhost:5432/facturacion_test?schema=public';
  if (!/test/.test(new URL(url).pathname)) {
    throw new Error(`Por seguridad, las pruebas solo corren sobre una base de pruebas (recibido: ${url})`);
  }
  const root = join(__dirname, '..');
  const prisma = join(root, '..', '..', 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  execSync(`"${prisma}" migrate deploy`, {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'inherit',
  });
}
