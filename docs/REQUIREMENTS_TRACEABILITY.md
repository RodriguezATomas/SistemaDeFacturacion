# Matriz de trazabilidad de requisitos

**Fuente de requisitos:** `Plan_inicio_tecnico_facturacion.pdf` (v1.0, noviembre 2026; en adelante "SPEC") y el prompt maestro de desarrollo.
El SPEC menciona un "SPEC funcional completo" adicional que **no fue entregado**. Esta matriz cubre todos los requisitos de los documentos disponibles; los requisitos de ese documento faltante deberán incorporarse cuando esté disponible (ver `DECISIONS.md`, D-01).

Estados: **Pendiente** · **En desarrollo** · **Implementado** (código listo, sin prueba automatizada completa) · **Probado** (con pruebas automatizadas que pasan) · **Integrado en DEVELOP**.

Abreviaturas de pruebas: **U** = unitaria (Jest/Vitest), **I** = integración contra PostgreSQL (Jest + Supertest), **E2E** = Playwright, **R** = verificación contra servicios reales de ARCA.

## 1. Producto y arquitectura

| ID | Requisito | Módulo | Estado | Prueba asociada |
|---|---|---|---|---|
| REQ-001 | Modalidad SaaS: múltiples empresas y usuarios por empresa | auth, companies | Integrado en DEVELOP | I `tenancy.int-spec` (segunda empresa, cambio de empresa) |
| REQ-002 | Aislamiento estricto de información entre empresas (backend y BD) | common/guards, todos los servicios | Integrado en DEVELOP | I `tenancy.int-spec` (lectura/edición/borrado cruzado → 404, recursos ajenos en comprobantes) |
| REQ-003 | Administración de empresas, planes y suscripciones | platform | Integrado en DEVELOP | I `tenancy.int-spec` (panel de plataforma, suspensión) |
| REQ-004 | Configuraciones fiscales y comerciales independientes por empresa | companies (CompanySettings) | Integrado en DEVELOP | I (settings por empresa), E2E |
| REQ-005 | Instalación privada: infraestructura, BD y almacenamiento propios | config (`DEPLOYMENT_MODE=private`), storage local/S3 | Integrado en DEVELOP | I (registro bloqueado, ver TESTING.md §3), script `setup:private` |
| REQ-006 | Sin dependencia obligatoria de un servicio central en instalación privada | arquitectura | Integrado en DEVELOP | Revisión: la API no llama a servicios propios externos (solo ARCA y SMTP configurables) |
| REQ-007 | Única base de código; la modalidad se resuelve por configuración | config | Integrado en DEVELOP | U `env.schema`; misma imagen Docker para ambas modalidades |
| REQ-008 | Frontend React + TS + Vite + Tailwind + shadcn/ui + Lucide | apps/web | Integrado en DEVELOP | Build `vite build`, Vitest |
| REQ-009 | Zustand, TanStack Query, React Hook Form, Zod, Recharts | apps/web | Integrado en DEVELOP | Vitest (esquemas Zod), E2E |
| REQ-010 | Backend NestJS + TS, API REST, reglas de negocio | apps/api | Integrado en DEVELOP | I (37 pruebas) |
| REQ-011 | PostgreSQL + Prisma, migraciones y transacciones | apps/api/prisma | Integrado en DEVELOP | I (migraciones aplicadas con `migrate deploy` en cada corrida) |
| REQ-012 | JWT de acceso + Refresh Tokens | auth | Integrado en DEVELOP | I `auth.int-spec` (rotación y reutilización) |
| REQ-013 | Autorización por roles y permisos | roles, guard | Integrado en DEVELOP | I `tenancy.int-spec` (rol Consulta → 403) |
| REQ-014 | Swagger / OpenAPI | setup-app | Integrado en DEVELOP | Manual: `/api/docs` |
| REQ-015 | Documentación técnica en `/docs` (ARCHITECTURE, DATABASE, API, MULTITENANCY, ARCA, ROADMAP, DECISIONS) | docs | Integrado en DEVELOP | Revisión |
| REQ-016 | Docker y Docker Compose; variables de entorno | infra | Integrado en DEVELOP | `docker compose --profile app build` |
| REQ-017 | Almacenamiento compatible con S3 mediante una abstracción | storage | Integrado en DEVELOP | I (driver local), manual con SeaweedFS (PDF guardado) |
| REQ-018 | Vitest, Jest y Playwright según nivel de prueba | todos | Integrado en DEVELOP | 61 U API + 37 I + 15 Vitest + 5 E2E |
| REQ-019 | Estructura separada: frontend, backend, BD, docs, config, infraestructura | repo | Integrado en DEVELOP | Revisión |

## 2. Datos, identidad y acceso (Fases 1-2 del SPEC)

| ID | Requisito | Módulo | Estado | Prueba asociada |
|---|---|---|---|---|
| REQ-020 | Entidades User, Company, CompanyUser, Role, Permission, RolePermission, CompanySettings, Subscription, AuditLog | prisma | Integrado en DEVELOP | I (alta completa en registro) |
| REQ-021 | Relaciones, claves, índices, restricciones y eliminación lógica | prisma | Integrado en DEVELOP | I (unicidades → 409; soft delete de clientes/productos) |
| REQ-022 | Manejo centralizado de errores y convenciones de API | common/filters | Integrado en DEVELOP | I (forma de error, sin stack traces) |
| REQ-023 | Registro e inicio de sesión | auth | Integrado en DEVELOP | I, E2E |
| REQ-024 | Recuperación de contraseña | auth, mail | Integrado en DEVELOP | I (token de un solo uso, cierre de sesiones) |
| REQ-025 | Gestión de usuarios (invitación, rol, desactivación, baja) | users | Integrado en DEVELOP | I (invitación + activación + revocación), E2E |
| REQ-026 | Gestión de roles (sistema + personalizados) | roles | Integrado en DEVELOP | I (duplicados, roles de sistema protegidos) |
| REQ-027 | Selección de empresa y protección de rutas | auth (switch-company), web guards | Integrado en DEVELOP | I, E2E (redirección sin sesión) |
| REQ-028 | Hash seguro de contraseñas | auth (Argon2id) | Integrado en DEVELOP | I (hash `$argon2id$`) |
| REQ-029 | Secretos fuera del código; variables sensibles no versionadas | config, .gitignore | Integrado en DEVELOP | Validación Zod al iniciar; `.env` ignorado |
| REQ-030 | Logs y auditoría de acciones relevantes | audit, Nest logger JSON | Integrado en DEVELOP | I (auditoría de registro, invitación, autorización) |
| REQ-031 | Bloqueo ante intentos fallidos y protección contra enumeración | auth | Integrado en DEVELOP | I |
| REQ-032 | Límites del plan y modo solo lectura con suscripción vencida | companies/plan-limits, guard | Integrado en DEVELOP | I |

## 3. Interfaz principal (Fase 3)

| ID | Requisito | Módulo | Estado | Prueba asociada |
|---|---|---|---|---|
| REQ-040 | Sidebar, header y dashboard | web/layout, dashboard | Integrado en DEVELOP | E2E |
| REQ-041 | Sistema de diseño: tokens de color, tipografía, espaciados, bordes, sombras | web (tailwind.config, index.css) | Integrado en DEVELOP | Revisión visual |
| REQ-042 | Componentes reutilizables: botones, inputs, tablas, badges, modales, carga/error/vacío | web/components | Integrado en DEVELOP | Vitest (DataTable, ConfirmDialog, badge) |
| REQ-043 | Notificaciones y confirmaciones | sonner, ConfirmDialog | Integrado en DEVELOP | Vitest, E2E |
| REQ-044 | Diseño responsive | web | Integrado en DEVELOP | Revisión (sidebar en panel lateral < lg) |
| REQ-045 | Gráficos (Recharts) | dashboard | Integrado en DEVELOP | Manual |

## 4. Gestión comercial (Fase 4)

| ID | Requisito | Módulo | Estado | Prueba asociada |
|---|---|---|---|---|
| REQ-050 | Clientes | parties | Integrado en DEVELOP | I, E2E |
| REQ-051 | Proveedores | parties | Integrado en DEVELOP | U (validación de documentos), manual |
| REQ-052 | Productos y servicios | catalog | Integrado en DEVELOP | I, E2E |
| REQ-053 | Categorías | catalog | Integrado en DEVELOP | Manual (UI), I indirecta |
| REQ-054 | Listas de precios | catalog/price-lists | Integrado en DEVELOP | U `pricing.spec`, I (precio por lista y ajuste) |
| REQ-055 | Primeras operaciones comerciales (comprobantes de venta) | invoices | Integrado en DEVELOP | I, E2E |

## 5. Facturación y ARCA (Fase 5 y §5 del SPEC)

| ID | Requisito | Módulo | Estado | Prueba asociada |
|---|---|---|---|---|
| REQ-060 | Motor de cálculo fiscal (A/B/C, IVA por alícuota, exento, no gravado, tributos) | fiscal | Integrado en DEVELOP | U `fiscal-engine.spec` (14 casos) |
| REQ-061 | Integración WSAA (TRA, firma CMS, ticket de acceso, caché) | arca/wsaa | Integrado en DEVELOP | U `wsaa-crypto.spec`; **R**: WSAA homologación valida la firma CMS (responde "Certificado no emitido por AC de confianza" con certificado autofirmado) |
| REQ-062 | Integración WSFEv1 (FECAESolicitar, FECompUltimoAutorizado, FECompConsultar, FEParamGetPtosVenta, FEDummy) | arca/wsfe | Integrado en DEVELOP | U `wsfe-xml.spec` (orden según WSDL oficial); **R**: FEDummy homologación OK |
| REQ-063 | Emisión con CAE real en homologación | invoices/emission | Implementado — **pendiente de certificado de homologación** | I con doble de prueba de WSFE; falta prueba **R** con certificado emitido por ARCA (ver ARCA_INTEGRATION.md §8) |
| REQ-064 | WSFEX u otros servicios "cuando corresponda" | arca | **Pendiente** | Arquitectura preparada (servicio por módulo, `ArcaService.WSFEX`); los clientes del exterior se bloquean con mensaje explícito |
| REQ-065 | CAE y vencimiento; nunca inventar un CAE | invoices | Integrado en DEVELOP | I (solo AUTHORIZED con CAE devuelto) |
| REQ-066 | Código QR según especificación ARCA | fiscal/arca-qr, PDF | Integrado en DEVELOP | U `arca-qr.spec` |
| REQ-067 | Comprobantes PDF; un PDF sin CAE no es comprobante fiscal | invoices/pdf | Integrado en DEVELOP | I (PDF almacenado), marca de agua "SIN VALIDEZ FISCAL" en borradores |
| REQ-068 | Auditoría de operaciones fiscales (requests/responses sin credenciales) | arca-log, audit | Integrado en DEVELOP | U `redactSecrets`, R (registros de FEDummy y loginCms) |
| REQ-069 | Diseño por servicios y tipos de operación | arca | Integrado en DEVELOP | Revisión de arquitectura |
| REQ-070 | Homologación primero; habilitación controlada de producción | config `ARCA_PRODUCTION_ENABLED`, companies | Integrado en DEVELOP | Manual (bloqueo verificado), procedimiento en ARCA_INTEGRATION.md |
| REQ-071 | Certificados y credenciales por CUIT y ambiente, almacenados de forma segura | arca/credentials (AES-256-GCM) | Integrado en DEVELOP | U `crypto.spec`; R (carga y validación) |
| REQ-072 | Numeración controlada por punto de venta y tipo | invoices (lease + último autorizado) | Integrado en DEVELOP | I (concurrencia sin duplicados) |
| REQ-073 | Idempotencia | invoices (Idempotency-Key) | Integrado en DEVELOP | I (misma clave → un solo envío) |
| REQ-074 | Conciliación ante respuestas inciertas o timeouts | invoices/emission, arca-status | Integrado en DEVELOP | I (timeout autorizado/no autorizado, bloqueo por incierto) |
| REQ-075 | No reintentar como nueva una emisión de resultado desconocido | invoices/emission | Integrado en DEVELOP | I |
| REQ-076 | Notas de crédito / débito con comprobante asociado | invoices | Integrado en DEVELOP | I (NC con saldo disponible) |
| REQ-077 | Separación completa homologación / producción | arca (endpoints, credenciales, tickets, numeración) | Integrado en DEVELOP | I (numeración única por ambiente), revisión |

## 6. Calidad, despliegue y proceso

| ID | Requisito | Módulo | Estado | Prueba asociada |
|---|---|---|---|---|
| REQ-080 | TypeScript estricto sin errores | api, web | Integrado en DEVELOP | `tsc --noEmit` |
| REQ-081 | Validaciones en backend (nunca solo frontend) | DTOs class-validator + whitelist | Integrado en DEVELOP | I (campos no permitidos → 400) |
| REQ-082 | Protección de endpoints (guard global, rate limiting, Helmet, CORS) | common, setup-app | Integrado en DEVELOP | I |
| REQ-083 | Ramas TEST (desarrollo), DEVELOP (integrada), MAIN (solo README) | git | Integrado en DEVELOP | Verificación de ramas (DEVELOPMENT_PROGRESS.md) |
| REQ-084 | Backups, logs y monitoreo | infra/scripts, `/api/health`, logs JSON | Integrado en DEVELOP | Manual |
| REQ-085 | Instalación reproducible siguiendo el README | README | Integrado en DEVELOP | Ejecución local completa verificada |
| REQ-086 | Dependencias sin vulnerabilidades conocidas en producción | package.json | Integrado en DEVELOP | `npm audit --omit=dev` (ver DECISIONS D-12 sobre las de desarrollo) |
