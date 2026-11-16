# Pruebas

| Nivel | Herramienta | Ubicación | Comando | Requiere |
|---|---|---|---|---|
| Unitarias backend | Jest + ts-jest | `apps/api/src/**/*.spec.ts` | `npm run test -w apps/api` | Nada |
| Integración backend | Jest + Supertest | `apps/api/test/*.int-spec.ts` | `npm run test:integration -w apps/api` | PostgreSQL (`docker compose up -d postgres`) |
| Unitarias / componentes frontend | Vitest + Testing Library | `apps/web/src/**/*.test.ts(x)` | `npm run test -w apps/web` | Nada |
| End-to-end | Playwright (Chromium) | `e2e/tests` | `npm run test:e2e` | PostgreSQL; API y web (Playwright los levanta si no están corriendo) |
| Conectividad ARCA real | Script | `apps/api/scripts/arca-check.ts` | `npm run arca:check -w apps/api` | Internet |

Primera vez con E2E: `npm run install-browsers -w e2e`.

## 1. Unitarias backend (61)

- `fiscal-engine.spec` — letra A/B/C, códigos de comprobante, reglas (A requiere CUIT, notas requieren asociado), IVA por alícuota, 0 %, exento/no gravado, descuentos, redondeo agrupado, comprobantes C, tributos, validaciones.
- `wsfe-xml.spec` — orden de elementos de `FECAESolicitar` según el WSDL, servicios, comprobantes asociados, escape XML, respuestas aprobadas/rechazadas/con errores, SOAP Fault, último autorizado, consulta existente e inexistente (602), puntos de venta.
- `wsaa-crypto.spec` — formato de fechas, TRA, firma CMS con certificado, inspección y CUIT del certificado, correspondencia clave/certificado, CSR, respuesta de loginCms, fault de WSAA, ocultamiento de secretos en logs.
- `arca-qr.spec`, `crypto.spec` (AES-256-GCM), `cuit.spec`, `pricing.spec`, `subscription.spec`, `invoice-dates.spec`, `party.dto.spec`.

## 2. Integración backend (39)

Levantan la aplicación Nest completa contra la base `facturacion_test` (creada por `infra/docker/postgres-init.sql`), aplican las migraciones con `prisma migrate deploy` y reemplazan **solo** el cliente WSFEv1 por un doble de prueba (`test/fake-wsfe.ts`) que reproduce la semántica de ARCA (numeración por PV/tipo, CAE, consulta). El XML se arma con el constructor real.

- `auth.int-spec` — registro completo (roles, suscripción, auditoría, Argon2id), validaciones, login, rotación de refresh y detección de reutilización, logout inmediato, bloqueo por intentos, no enumeración, recuperación de contraseña de un solo uso, cambio de contraseña, forma de errores, whitelist.
- `tenancy.int-spec` — aislamiento entre empresas (lectura/edición/borrado, recursos ajenos, manipulación del cuerpo, cambio de empresa), permisos por rol, invitación y activación, revocación al desactivar, último propietario, roles personalizados, límites del plan, solo lectura, panel de plataforma y suspensión, multiempresa por usuario.
- `invoices.int-spec` — borrador con IVA, listas de precios, autorización con CAE y PDF, numeración correlativa, idempotencia, rechazo y reintento, timeout con autorización perdida (conciliado como autorizado sin reenviar), timeout no procesado (número liberado), bloqueo por incierto y conciliación manual, falla de conexión antes de enviar, concurrencia sin duplicados, nota de crédito y saldo, reglas fiscales, Factura C, protección de autorizados, Idempotency-Key obligatoria, dashboard, auditoría.
- `private-mode.int-spec` — modalidad privada: registro deshabilitado, licencia sin límites, sin panel SaaS ni empresas adicionales.

## 3. Frontend (15)

`lib.test.ts` (formato, CUIT, numeración, vista previa fiscal, esquemas Zod) y `components.test.tsx` (badge de estado, DataTable, ConfirmDialog, validación y error de servidor en Login).

## 4. End-to-end (5)

`e2e/tests/main-flows.spec.ts`: registro + sesión persistente + logout + login; redirección sin sesión; alta de cliente (con validación de CUIT), producto y punto de venta y borrador de Factura A con IVA, intento de emisión sin certificado (no se simula CAE); Factura C de monotributista; invitación de usuario, roles y auditoría.

## 5. Últimos resultados

| Suite | Resultado |
|---|---|
| `tsc --noEmit` api / web | Sin errores |
| ESLint api / web | Sin errores |
| Jest unitarias | 61 / 61 |
| Jest integración | 39 / 39 |
| Vitest | 15 / 15 |
| Playwright | 5 / 5 |
| `vite build` / `nest build` / `docker compose --profile app build` | OK |
| ARCA homologación (FEDummy, WSAA) | OK (ver ARCA_INTEGRATION.md §8) |

## 6. Seguridad verificada

Autenticación y sesiones, autorización por permisos, aislamiento entre empresas, validación de entradas, rate limiting, cifrado de credenciales fiscales, ocultamiento de secretos en logs, errores sin detalles internos, `npm audit --omit=dev` sin vulnerabilidades.
