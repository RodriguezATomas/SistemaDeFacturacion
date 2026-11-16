# API REST

- Base: `/api`. Documentación interactiva OpenAPI en **`/api/docs`** (deshabilitada en producción salvo `SWAGGER_ENABLED=true`).
- Formato JSON, fechas ISO 8601 (las fechas fiscales como `YYYY-MM-DD`), importes como string decimal.
- Autenticación: `Authorization: Bearer <accessToken>` (JWT, 15 min). El refresh token viaja solo en la cookie `fx_rt` (`HttpOnly`, `SameSite=Strict`, path `/api/auth`).
- La empresa activa va dentro del JWT (`cid`); se cambia con `POST /auth/switch-company`. Nunca se acepta un `companyId` en el cuerpo (los campos no declarados se rechazan con 400).

## Convenciones

| Aspecto | Convención |
|---|---|
| Listados | `GET /recurso?page=1&pageSize=20&search=texto` → `{ data: [], meta: { page, pageSize, total, totalPages } }` |
| Alta / edición | `POST /recurso` (201), `PATCH /recurso/:id` (200); comprobantes usan `PUT` (reemplazo total del borrador) |
| Baja | `DELETE /recurso/:id` → 204 (lógica en entidades maestras) |
| Recursos de otra empresa | 404 (no se revela su existencia) |
| Permisos insuficientes | 403 con los permisos faltantes |
| Idempotencia | `POST /invoices/:id/emit` exige `Idempotency-Key` (16-100 caracteres) |

### Forma de los errores

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": "Datos de entrada inválidos",
  "details": ["documentNumber CUIT inválido"],
  "path": "/api/customers",
  "requestId": "4f6c…",
  "timestamp": "2026-11-16T22:43:07.128Z"
}
```

Errores de Prisma: unicidad → 409, inexistente → 404, violación de relación → 409. Los 5xx no exponen detalles internos (se registran con el request id).

## Endpoints

| Área | Endpoints principales | Permiso |
|---|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/switch-company` · `GET/PATCH /auth/me` · `POST /auth/change-password` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /auth/config` | público / sesión |
| Empresa | `POST /companies` · `GET/PATCH /companies/current` · `PATCH /companies/current/settings` · `GET /companies/current/subscription` | `company.manage`, `subscription.read` |
| Usuarios | `GET /users` · `POST /users/invite` · `PATCH /users/:id` · `DELETE /users/:id` · `POST /users/:id/resend-invite` | `users.read`, `users.manage` |
| Roles | `GET /permissions` · `GET/POST /roles` · `PATCH/DELETE /roles/:id` | `users.read`, `roles.manage` |
| Clientes / Proveedores | `GET/POST /customers` · `GET/PATCH/DELETE /customers/:id` (ídem `/suppliers`) | `customers.*`, `suppliers.*` |
| Catálogo | `/categories` · `/products` (`?priceListId=` devuelve `effectivePrice`) · `/price-lists` · `PUT /price-lists/:id/items` · `DELETE /price-lists/:id/items/:productId` | `products.*`, `price_lists.*` |
| Puntos de venta | `GET/POST /points-of-sale` · `PATCH /points-of-sale/:id` | `invoices.read`, `pos.manage` |
| Comprobantes | `GET/POST /invoices` · `GET/PUT/DELETE /invoices/:id` · `POST /invoices/:id/emit` · `POST /invoices/:id/reconcile` · `POST /invoices/:id/credit-note` · `GET /invoices/:id/pdf` | `invoices.read/write/emit` |
| ARCA | `GET /arca/status` · `GET /arca/credentials` · `POST /arca/credentials/csr` · `POST /arca/credentials/certificate` · `DELETE /arca/credentials/:env` · `POST /arca/test-connection` · `GET /arca/points-of-sale` · `GET /arca/reconciliation?pointOfSaleId=` · `GET /arca/logs` | `arca.manage`, `pos.manage`, `invoices.read` |
| Dashboard | `GET /dashboard` | `dashboard.view` |
| Auditoría | `GET /audit-logs?entity=&action=&userId=` | `audit.read` |
| Plataforma | `GET /platform/stats` · `GET /platform/companies` · `PATCH /platform/companies/:id/status` · `PATCH /platform/companies/:id/subscription` · `GET/POST /platform/plans` · `PATCH /platform/plans/:id` | administrador de plataforma (solo SaaS) |
| Salud | `GET /health` | público |

## Emisión de comprobantes (resumen)

```
POST /api/invoices            → borrador (DRAFT) con importes calculados por el servidor
POST /api/invoices/:id/emit   Idempotency-Key: <clave>
  200 AUTHORIZED  → cae, caeDueDate, number
  200 REJECTED    → arcaErrors / arcaObservations (número liberado; se puede editar y reintentar)
  200 UNKNOWN     → resultado incierto: usar POST /:id/reconcile (nunca reemitir a ciegas)
  409             → otra emisión en curso / comprobantes inciertos pendientes / clave reutilizada
  503             → ARCA no disponible antes de enviar (el comprobante no fue enviado)
```

## Límites de tasa

Global: 300 req/min por IP. Registro y recuperación: 5/min. Login: 10/min. Refresh: 30/min.
