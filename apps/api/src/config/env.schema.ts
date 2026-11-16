import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['true', '1', 'yes'].includes(v.toLowerCase())));

/**
 * Esquema de configuración. La API no arranca si falta una variable obligatoria
 * o si un secreto no cumple los requisitos mínimos.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DEPLOYMENT_MODE: z.enum(['saas', 'private']).default('saas'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'CREDENTIALS_ENCRYPTION_KEY debe ser una clave de 32 bytes codificada en base64',
    }),

  ARCA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  ARCA_TLS_CIPHERS: z.string().default('DEFAULT@SECLEVEL=1'),
  ARCA_PRODUCTION_ENABLED: bool.default(false),

  STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('facturacion'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Sistema de Facturación <no-reply@facturacion.local>'),

  LOG_JSON: bool.default(false),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }
  const env = parsed.data;
  if (env.STORAGE_DRIVER === 's3' && (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY)) {
    throw new Error('Configuración inválida: STORAGE_DRIVER=s3 requiere S3_ACCESS_KEY y S3_SECRET_KEY');
  }
  if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
    throw new Error('Configuración inválida: SMTP_HOST es obligatorio en producción');
  }
  return env;
}
