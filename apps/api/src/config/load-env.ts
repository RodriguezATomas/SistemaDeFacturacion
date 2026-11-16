import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseEnv } from 'util';

/**
 * Carga apps/api/.env si existe.
 * - En desarrollo el archivo del proyecto tiene prioridad sobre variables globales del sistema
 *   (evita que, por ejemplo, un DATABASE_URL de otro proyecto apunte a una base equivocada).
 * - En producción las variables del entorno (Docker, systemd, CI) siempre tienen prioridad.
 */
const envFile = resolve(__dirname, '..', '..', '.env');
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) {
  const values = parseEnv(readFileSync(envFile, 'utf8'));
  const override = process.env.NODE_ENV !== 'production';
  for (const [key, value] of Object.entries(values)) {
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}
