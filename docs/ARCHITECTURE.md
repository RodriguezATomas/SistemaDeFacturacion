# Arquitectura

## Visión general

```
┌──────────────┐  HTTPS (mismo origen)  ┌───────────────────────────┐      ┌──────────────┐
│  SPA React   │ ─────────────────────▶ │  API NestJS  (/api/*)      │ ───▶ │ PostgreSQL   │
│  (Vite)      │   JWT en memoria +     │  Guard global: JWT,        │      │ (Prisma)     │
│              │   cookie httpOnly      │  tenant, permisos, plan    │      └──────────────┘
└──────────────┘   de refresh           │                            │ ───▶ S3 / disco (PDF)
                                        │  Módulos de dominio        │ ───▶ SMTP (emails)
                                        │  Integración ARCA ─────────┼──▶  WSAA / WSFEv1 (SOAP)
                                        └───────────────────────────┘
```

- **Monorepo** con npm workspaces: `apps/api` (NestJS), `apps/web` (React), `e2e` (Playwright), `infra` (Docker, nginx, scripts), `docs`.
- **Una sola base de código** para SaaS e instalación privada: la modalidad se elige con `DEPLOYMENT_MODE` (ver `MULTITENANCY.md`).
- En producción nginx sirve la SPA y hace proxy de `/api` a la API: SPA y API comparten origen, por lo que la cookie de refresh es first-party (`SameSite=Strict`, `HttpOnly`, `Secure`).

## Backend (`apps/api`)

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Arranque | `main.ts`, `setup-app.ts` | Helmet, CORS, cookies, prefijo `/api`, `ValidationPipe` (whitelist + forbidNonWhitelisted), Swagger, logs JSON |
| Configuración | `config/` | Validación de variables con Zod; la API no inicia con configuración inválida |
| Transversal | `common/` | Guard global de autenticación/tenant/permisos, decoradores, filtro de excepciones, paginación, utilidades (CUIT, cifrado) |
| Persistencia | `prisma/`, `apps/api/prisma/schema.prisma` | Prisma Client, modelo, migraciones versionadas |
| Dominio | `modules/*` | Un módulo por área (ver abajo) |

Módulos de dominio:

- `auth` — registro, login, refresh rotativo, logout, recuperación de contraseña, perfil.
- `companies` — alta de empresas (provisioning de roles y suscripción), datos y configuración, límites de plan, sincronización del catálogo de permisos.
- `users`, `roles` — membresías de la empresa activa, invitaciones, roles y permisos.
- `platform` — administración central SaaS: empresas, planes, suscripciones, métricas.
- `parties` — clientes y proveedores.
- `catalog` — categorías, productos/servicios, listas de precios (motor de precios).
- `points-of-sale` — puntos de venta habilitados en ARCA.
- `fiscal` — motor de cálculo fiscal puro (letra A/B/C, IVA por alícuota, tributos), catálogos ARCA, QR.
- `arca` — integración fiscal por servicio: `wsaa/` (TRA, CMS, ticket), `wsfe/` (WSFEv1), `soap/` (transporte), credenciales cifradas, registro de operaciones, estado/conciliación.
- `invoices` — borradores, emisión idempotente, conciliación (manual y programada), PDF.
- `dashboard`, `audit`, `mail`, `storage`, `health`.

Dependencias entre módulos (sin ciclos): `invoices → arca → (credentials, wsaa, wsfe)`, `invoices → fiscal`, `invoices → catalog (pricing)`, `invoices/users/points-of-sale → companies (plan limits)`. `audit`, `mail`, `storage`, `auth`, `prisma` y `config` son globales.

### Flujo de una request

1. `requestIdMiddleware` asigna `X-Request-Id`.
2. `ThrottlerGuard` (límite global y límites estrictos en endpoints de autenticación).
3. `AuthGuard` (global): verifica el JWT, que la sesión (familia de refresh) siga activa, la membresía activa en la empresa del token y el estado de la empresa; carga los permisos del rol; aplica `@RequirePermissions`, `@PlatformAdminOnly` y el modo solo lectura si la suscripción no está vigente.
4. `ValidationPipe` valida y transforma el DTO.
5. El servicio opera **siempre filtrando por `companyId`** del contexto autenticado.
6. `AllExceptionsFilter` devuelve errores con forma uniforme.

## Frontend (`apps/web`)

- **Routing** (`react-router-dom`): rutas públicas (login, registro, recuperación), selección de empresa y rutas privadas con guards por sesión, empresa y permiso.
- **Estado de sesión** (Zustand): access token solo en memoria; `/auth/me` define usuario, empresas y permisos. Al iniciar, `bootstrapSession` renueva la sesión con la cookie httpOnly.
- **Datos de servidor** (TanStack Query): caché por clave, invalidación tras mutaciones (`useApiMutation`).
- **Formularios**: React Hook Form + Zod (`useZodForm`); el backend vuelve a validar todo.
- **Cliente HTTP** (`lib/api.ts`): reintenta una vez tras renovar el token ante 401 (renovaciones concurrentes comparten una sola llamada).
- **UI**: componentes shadcn/ui sobre Radix (`components/ui`), componentes compartidos (`components/shared`: DataTable, PageHeader, EmptyState, ConfirmDialog, EntityPicker, StatCard, Field), Lucide, Recharts, Sonner.

## Integración ARCA

Ver `ARCA.md` (estrategia) y `ARCA_INTEGRATION.md` (implementación, operación y pase a producción).

## Observabilidad

- Logs de NestJS en JSON (`LOG_JSON=true`) con request id en errores.
- `GET /api/health`: verifica PostgreSQL; usado por Docker y monitoreo externo.
- Auditoría de negocio en `audit_logs`; operaciones ARCA en `arca_request_logs`.
