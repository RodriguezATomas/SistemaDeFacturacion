# Roadmap

## Completado (v1.0)

| Fase del SPEC | Contenido |
|---|---|
| 0 — Preparación | Monorepo, TypeScript estricto, Docker Compose, PostgreSQL, variables de entorno, documentación |
| 1 — Arquitectura y datos | Modelo completo con Prisma, migraciones, aislamiento multi-tenant, errores centralizados |
| 2 — Identidad y acceso | Registro, login, recuperación, usuarios, roles, selección de empresa, protección de rutas |
| 3 — Interfaz principal | Sistema de diseño, layout, dashboard, componentes, responsive |
| 4 — Gestión comercial | Clientes, proveedores, productos/servicios, categorías, listas de precios, comprobantes de venta |
| 5 — Facturación y ARCA | Motor fiscal, WSAA, WSFEv1, CAE, QR, PDF, idempotencia, conciliación, auditoría |
| Calidad y despliegue | Pruebas unitarias, de integración y E2E; Docker de producción; backups; health check |

## Próximos pasos

1. **Prueba de emisión real en homologación** con certificado de ARCA (`ARCA_INTEGRATION.md` §9) y luego pase a producción (§10).
2. **WSFEX** (Factura E de exportación): nuevo cliente `arca/wsfex`, campos de exportación (país, incoterms, idioma), punto de venta con servicio WSFEX.
3. Consulta de padrón de ARCA (`ws_sr_padron_a5`) para autocompletar clientes por CUIT.
4. Logo de la empresa en el PDF (columna `logoStorageKey` ya existente) y envío del comprobante por email.
5. Cuenta corriente de clientes, cobranzas y compras a proveedores.
6. Pasarela de pagos para suscripciones SaaS.
7. Migración a Prisma 7 y `@nestjs/cli` 12; Row Level Security como defensa adicional.
8. Métricas (Prometheus/OpenTelemetry) y alertas sobre comprobantes inciertos.
