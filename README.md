# Sistema Integral de Gestión y Facturación

Plataforma de gestión comercial y **facturación electrónica para Argentina** con integración real con **ARCA** (WSAA / WSFEv1). Funciona como **SaaS multiempresa** o como **instalación privada**, con la misma base de código.

> Rama de desarrollo/integración. La descripción funcional del producto está en la rama `MAIN`. Documentación técnica en [`docs/`](docs).

## Tecnologías

| Capa | Stack (versiones fijadas en `package-lock.json`) |
|---|---|
| Frontend | React 18.3, TypeScript 5.9, Vite 6.4, Tailwind CSS 3.4, shadcn/ui (Radix), Lucide, Zustand 5, TanStack Query 5, React Hook Form 7, Zod 4, Recharts 2, React Router 7 |
| Backend | Node.js 22, NestJS 11.2, Prisma 6.19, PostgreSQL 16, JWT + refresh tokens, Argon2id, Swagger, PDFKit, node-forge, fast-xml-parser |
| Infraestructura | Docker, Docker Compose, nginx, S3 compatible (SeaweedFS en desarrollo), SMTP (Mailpit en desarrollo) |
| Calidad | Jest, Supertest, Vitest, Testing Library, Playwright, ESLint |

## Requisitos

- Node.js ≥ 22 y npm ≥ 10
- Docker y Docker Compose
- Acceso a Internet para conectar con ARCA

## Instalación y ejecución local

```bash
# 1. Dependencias
npm install

# 2. Infraestructura (PostgreSQL, S3, Mailpit)
docker compose up -d postgres s3 mailpit

# 3. Configuración de la API: copiar y completar los secretos (ver comentarios del archivo)
cp apps/api/.env.example apps/api/.env

# 4. Base de datos: migraciones y datos base (permisos y planes)
npm run db:migrate
npm run db:seed          # con SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD en apps/api/.env crea el admin de plataforma

# 5. Levantar API (http://localhost:3000/api, Swagger en /api/docs) y web (http://localhost:5173)
npm run dev:api
npm run dev:web
```

Registrá una empresa desde `http://localhost:5173/registro`. Los emails (recuperación, invitaciones) se ven en Mailpit: `http://localhost:8025`.

### Comandos

| Comando | Descripción |
|---|---|
| `npm run typecheck` / `npm run lint` | Tipos y lint de api y web |
| `npm test` | Pruebas unitarias (Jest + Vitest) |
| `npm run test:integration` | Integración contra PostgreSQL (`facturacion_test`) |
| `npm run install-browsers -w e2e` y `npm run test:e2e` | End-to-end con Playwright |
| `npm run build` | Build de producción de api y web |
| `npm run arca:check -w apps/api` | Verifica conectividad real con ARCA homologación |
| `npm run setup:private -w apps/api -- …` | Alta inicial de una instalación privada (ver `docs/DEPLOYMENT.md`) |
| `docker compose --profile app up -d --build` | Stack completo en contenedores (web en `:8080`) |

## Modalidades

- **SaaS** (`DEPLOYMENT_MODE=saas`): registro público, multiempresa, planes con límites, prueba de 30 días, panel de administración de plataforma.
- **Privada** (`DEPLOYMENT_MODE=private`): una empresa, base y almacenamiento propios, sin límites ni dependencia de servicios centrales.

## ARCA

Toda empresa comienza en **homologación**. Para emitir con CAE hay que cargar un certificado digital (el sistema puede generar el CSR) y un punto de venta habilitado para web services. El pase a producción es un procedimiento controlado: ver [`docs/ARCA_INTEGRATION.md`](docs/ARCA_INTEGRATION.md).

## Documentación

[Arquitectura](docs/ARCHITECTURE.md) · [Base de datos](docs/DATABASE.md) · [API](docs/API.md) · [Multiempresa](docs/MULTITENANCY.md) · [ARCA (estrategia)](docs/ARCA.md) · [ARCA (implementación)](docs/ARCA_INTEGRATION.md) · [Pruebas](docs/TESTING.md) · [Despliegue](docs/DEPLOYMENT.md) · [Decisiones](docs/DECISIONS.md) · [Roadmap](docs/ROADMAP.md) · [Trazabilidad](docs/REQUIREMENTS_TRACEABILITY.md) · [Avance](docs/DEVELOPMENT_PROGRESS.md)

## Solución de problemas

- **La API no conecta a la base / usa otra base:** si el sistema operativo tiene un `DATABASE_URL` global, en desarrollo prevalece `apps/api/.env` para la API y los scripts `npm run prisma:*`; el CLI `npx prisma` directo usa la variable global.
- **Error TLS con ARCA (`dh key too small`):** mantener `ARCA_TLS_CIPHERS=DEFAULT@SECLEVEL=1`.
- **`El CEE ya posee un TA válido`:** se pidió un ticket con el mismo certificado fuera del sistema; esperar su vencimiento (hasta 12 h).

## Flujo de ramas

`TEST` (desarrollo) → verificación completa → `DEVELOP` (integrada). `MAIN` contiene solo el README del producto.
