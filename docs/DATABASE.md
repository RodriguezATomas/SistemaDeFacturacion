# Modelo de datos

PostgreSQL 16 + Prisma 6. Esquema: `apps/api/prisma/schema.prisma`. Migraciones versionadas en `apps/api/prisma/migrations` (se aplican con `prisma migrate deploy`; nunca se editan migraciones ya aplicadas).

Convenciones: claves UUID, `createdAt`/`updatedAt`, eliminación lógica (`deletedAt`) en entidades maestras, importes `Decimal` (nunca `float`), fechas fiscales como `DATE`.

## Identidad y acceso

| Tabla | Propósito | Claves / restricciones |
|---|---|---|
| `users` | Usuarios (globales; pueden pertenecer a varias empresas) | `email` único; `passwordHash` Argon2id (nulo hasta aceptar invitación); bloqueo por intentos |
| `company_users` | Membresía usuario ↔ empresa con rol y estado (ACTIVE/INVITED/DISABLED) | único (`companyId`,`userId`) |
| `roles` | Roles por empresa (sistema: owner/admin/billing/viewer; o personalizados) | único (`companyId`,`name`) |
| `permissions` | Catálogo global de permisos (sincronizado desde código) | `code` único |
| `role_permissions` | Permisos de cada rol | PK compuesta |
| `refresh_tokens` | Refresh tokens (hash SHA-256), familia de rotación, empresa activa | `tokenHash` único; índice por `familyId` |
| `password_tokens` | Tokens de recuperación e invitación (hash, un solo uso, vencimiento) | `tokenHash` único |

## Empresas y suscripciones

| Tabla | Propósito |
|---|---|
| `companies` | Tenant: razón social, CUIT (única), condición IVA, IIBB, inicio de actividades, domicilio, estado (ACTIVE/SUSPENDED) |
| `company_settings` | Ambiente ARCA activo, lista de precios por defecto, leyenda del comprobante. `logoStorageKey` reservado para el logo en el PDF (no expuesto aún) |
| `plans` | Planes SaaS con límites (`null` = sin límite) |
| `subscriptions` | Suscripción de cada empresa (TRIAL/ACTIVE/PAST_DUE/CANCELED, fin de prueba/período) |
| `audit_logs` | Auditoría: empresa, usuario, acción, entidad, metadatos, IP, user agent |

## Gestión comercial

| Tabla | Propósito |
|---|---|
| `customers` / `suppliers` | Datos fiscales (tipo/número de documento, condición IVA) y de contacto; cliente con lista de precios opcional |
| `product_categories` | Categorías |
| `products` | Producto/servicio, precio neto, tratamiento de IVA (GRAVADO/EXENTO/NO_GRAVADO) y alícuota |
| `price_lists` / `price_list_items` | Listas con ajuste porcentual general y precios específicos por producto (único por lista/producto) |

## Facturación y ARCA

| Tabla | Propósito |
|---|---|
| `points_of_sale` | Puntos de venta por empresa (número único por empresa) |
| `fiscal_credentials` | Certificado y clave privada **cifrados (AES-256-GCM)** por empresa y ambiente (único por empresa/ambiente) |
| `arca_access_tickets` | Ticket de acceso WSAA cifrado (token/sign) por empresa, ambiente y servicio |
| `arca_request_logs` | Request/response de cada llamada a ARCA, sin token ni sign |
| `emission_locks` | Lease por punto de venta + tipo de comprobante para numeración correlativa |
| `invoices` | Comprobante: tipo ARCA, número, estado (DRAFT/SENDING/AUTHORIZED/REJECTED/UNKNOWN), snapshot del receptor, importes, CAE y vencimiento, ambiente, observaciones/errores de ARCA, clave de idempotencia, comprobante asociado |
| `invoice_items` | Ítems con importes calculados |
| `invoice_vat` | Desglose de IVA por alícuota (array `Iva` de WSFEv1) |
| `invoice_taxes` | Otros tributos (array `Tributos`) |
| `invoice_emission_attempts` | Cada intento de emisión: número usado, clave de idempotencia, resultado (incluye resultados de conciliación) |

Restricción clave: **único (`companyId`, `pointOfSaleId`, `voucherType`, `arcaEnvironment`, `number`)**. `number` y `arcaEnvironment` son nulos en borradores; homologación y producción tienen numeraciones independientes.

## Aislamiento por empresa

Toda entidad de negocio tiene `companyId` con índice compuesto. Las entidades hijas sin `companyId` (`invoice_items`, `price_list_items`, …) solo se acceden a través de su padre ya filtrado por empresa. Ver `MULTITENANCY.md`.

## Incorporación de nuevos módulos

1. Agregar el modelo con `companyId` (FK a `companies`, `onDelete: Cascade`) e índices `(companyId, …)`.
2. `npm run prisma:migrate:dev -w apps/api -- --name <cambio>` genera la migración; revisar el SQL y commitearla.
3. Agregar permisos al catálogo `common/permissions.ts` (se sincronizan al iniciar).
4. Implementar el servicio filtrando siempre por `companyId` y agregar pruebas de aislamiento.
