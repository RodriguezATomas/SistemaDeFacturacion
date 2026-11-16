# Estrategia de integración fiscal con ARCA

Resumen de criterios. El detalle técnico, la operación y el pase a producción están en [`ARCA_INTEGRATION.md`](ARCA_INTEGRATION.md).

## Principios

1. **Integración real, nunca simulada.** El sistema solo marca un comprobante como autorizado cuando ARCA devuelve un CAE. Los dobles de prueba existen únicamente en las pruebas automatizadas.
2. **Por servicio y tipo de operación.** Cada web service es un componente separado (`arca/wsaa`, `arca/wsfe`); incorporar WSFEX u otros no modifica los existentes.
3. **Homologación primero.** Toda empresa inicia en homologación; producción requiere habilitación explícita de la instalación (`ARCA_PRODUCTION_ENABLED=true`), certificado de producción válido y un cambio de ambiente auditado.
4. **Credenciales por CUIT y ambiente**, cifradas con AES-256-GCM; la clave privada puede generarse en el servidor y nunca se expone.
5. **Numeración controlada** por punto de venta y tipo de comprobante: se consulta el último autorizado en ARCA bajo un lease exclusivo.
6. **Idempotencia y conciliación.** Cada emisión exige una clave de idempotencia; ante timeouts o respuestas inciertas el comprobante queda en `UNKNOWN` y se consulta en ARCA (`FECompConsultar`) antes de cualquier reintento. Nunca se reenvía automáticamente como si fuera nueva una emisión de resultado desconocido.
7. **Un PDF no es un comprobante fiscal.** Los borradores y comprobantes no autorizados se imprimen con la leyenda "SIN VALIDEZ FISCAL"; los emitidos en homologación lo indican explícitamente.
8. **Trazabilidad completa.** Request/response de cada llamada en `arca_request_logs` (sin token ni sign) y eventos de negocio en `audit_logs`.

## Alcance actual

| Servicio | Uso | Estado |
|---|---|---|
| WSAA | Autenticación (ticket de acceso) | Implementado; firma CMS validada por WSAA homologación |
| WSFEv1 | Facturas, notas de débito y crédito A, B y C con CAE | Implementado; disponibilidad verificada contra homologación (FEDummy). Emisión con CAE real pendiente de certificado de homologación |
| WSFEX | Factura de exportación (E) | Pendiente. Las operaciones con "Cliente del Exterior" se bloquean con un mensaje explícito |

Documentación oficial: https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp
