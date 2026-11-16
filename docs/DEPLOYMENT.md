# Despliegue

## 1. Servicios

| Servicio | Imagen | Rol |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Base de datos (volumen `pgdata`) |
| `s3` | `chrislusf/seaweedfs:4.54` | Almacenamiento S3 compatible (volumen `s3data`). Reemplazable por AWS S3, Cloudflare R2, MinIO propio, etc. |
| `mailpit` | `axllent/mailpit:v1.27` | Solo desarrollo: captura emails (UI en `:8025`) |
| `api` | `infra/docker/api.Dockerfile` | NestJS; aplica migraciones pendientes al iniciar (`prisma migrate deploy`) |
| `web` | `infra/docker/web.Dockerfile` | nginx con la SPA y proxy `/api` → `api:3000` |

## 2. Variables de entorno

Raíz (`.env`, para docker compose) — ver `.env.example`. API (`apps/api/.env` en desarrollo) — ver `apps/api/.env.example`. Las críticas:

| Variable | Descripción |
|---|---|
| `DEPLOYMENT_MODE` | `saas` o `private` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 caracteres aleatorios: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `CREDENTIALS_ENCRYPTION_KEY` | 32 bytes base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Respaldarla**: sin ella no se pueden descifrar los certificados |
| `DATABASE_URL` | Conexión PostgreSQL |
| `APP_URL` | URL pública (enlaces en emails, CORS) |
| `SMTP_*`, `MAIL_FROM` | Obligatorios en producción |
| `STORAGE_DRIVER`, `S3_*` / `STORAGE_LOCAL_PATH` | Almacenamiento de PDFs |
| `ARCA_PRODUCTION_ENABLED` | `false` por defecto; ver ARCA_INTEGRATION.md §10 |
| `LOG_JSON` | `true` en producción |

La API valida la configuración al iniciar y no arranca si falta algo o un secreto es débil.

## 3. Producción con Docker Compose

```bash
cp .env.example .env            # completar secretos, SMTP y APP_URL
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

Al iniciar, la API aplica las migraciones, sincroniza el catálogo de permisos y crea los planes iniciales si no existen. Administrador de la plataforma (SaaS):

```bash
docker compose exec -e ADMIN_PASSWORD='<clave segura>' api node dist/cli/create-platform-admin.js admin@empresa.com
```

`docker-compose.prod.yml` quita los puertos públicos de PostgreSQL y S3, deshabilita Mailpit y exige SMTP. Publicar solo el servicio `web` detrás de un proxy con TLS (Caddy, Traefik, nginx o el balanceador del proveedor). La cookie de sesión se marca `Secure` en producción: **HTTPS es obligatorio**.

## 4. Instalación privada

Igual que el punto 3 con `DEPLOYMENT_MODE=private` y, opcionalmente, `STORAGE_DRIVER=local` (montar un volumen en `STORAGE_LOCAL_PATH`). Alta de la empresa (desde una copia del repositorio con acceso a la base, con `DATABASE_URL` y `DEPLOYMENT_MODE=private` en `apps/api/.env`):

```bash
SETUP_ADMIN_PASSWORD='<clave segura>' npm run setup:private -w apps/api -- \
  --company "Mi Empresa S.A." --cuit 30500010912 --tax RESPONSABLE_INSCRIPTO \
  --email admin@miempresa.com --first Ana --last Pérez
```

## 5. Backups

```bash
./infra/scripts/backup.sh /ruta/backups      # pg_dump formato custom, retiene 14
./infra/scripts/restore.sh /ruta/backups/facturacion-AAAAMMDD-HHMMSS.dump
```

Programar el backup diario con cron y copiar los archivos fuera del servidor. Respaldar también el bucket S3 (PDFs) y, por separado, `CREDENTIALS_ENCRYPTION_KEY`.

## 6. Monitoreo

- `GET /api/health` → 200 con `database: up`; 503 si la base no responde.
- Logs JSON por stdout (`docker compose logs -f api`) para enviar a un agregador.
- Alertar si existen comprobantes `UNKNOWN` por más de 15 minutos (Configuración › ARCA muestra el contador; la conciliación automática corre cada 5 minutos).

## 7. Actualizaciones

1. Backup.
2. `git pull` de la rama DEVELOP (o del tag de versión).
3. `docker compose ... up -d --build` — las migraciones se aplican al iniciar la API.
4. Verificar `/api/health` y una prueba de conexión con ARCA.
