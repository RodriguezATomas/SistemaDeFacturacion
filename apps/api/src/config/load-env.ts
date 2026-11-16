import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Carga apps/api/.env en desarrollo (si existe). Las variables ya definidas en el entorno
 * del proceso tienen prioridad, como en cualquier despliegue (Docker, systemd, CI).
 */
const envFile = resolve(__dirname, '..', '..', '.env');
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
