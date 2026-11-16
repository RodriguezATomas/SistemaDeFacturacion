import { randomBytes } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Entorno aislado para pruebas de integración: base facturacion_test y almacenamiento temporal.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://facturacion:facturacion@localhost:5432/facturacion_test?schema=public';
process.env.DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE_OVERRIDE ?? 'saas';
process.env.APP_URL = 'http://localhost:5173';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('base64');
process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('base64');
process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = mkdtempSync(join(tmpdir(), 'facturacion-test-'));
process.env.ARCA_PRODUCTION_ENABLED = 'false';
delete process.env.SMTP_HOST;
