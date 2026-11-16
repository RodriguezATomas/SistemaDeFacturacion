# Integración ARCA — implementación y operación

## 1. Componentes

| Archivo | Responsabilidad |
|---|---|
| `arca/arca.endpoints.ts` | URLs oficiales por ambiente (WSAA y WSFEv1) |
| `arca/soap/soap-transport.ts` | POST SOAP 1.1 sobre HTTPS con timeout total; distingue errores **antes** de enviar (`requestSent=false`) de errores con resultado incierto (`requestSent=true`); parseo XML preservando valores como texto |
| `arca/wsaa/wsaa-crypto.ts` | TRA, firma CMS/PKCS#7 SHA-256 (contenido incluido), inspección de certificados, verificación clave/certificado, generación de clave RSA 2048 + CSR |
| `arca/wsaa/wsaa.service.ts` | `loginCms`, caché cifrada del ticket por empresa/ambiente/servicio, lock con `pg_advisory_xact_lock` para no pedir dos tickets en paralelo |
| `arca/wsfe/wsfe-xml.ts` | Construcción de mensajes en el orden del WSDL oficial y parseo de respuestas |
| `arca/wsfe/wsfe.service.ts` | `FEDummy`, `FECompUltimoAutorizado`, `FECAESolicitar` (preparar/enviar por separado), `FECompConsultar`, `FEParamGetPtosVenta`; registra cada llamada |
| `arca/credentials.service.ts` | CSR, carga y validación de certificados, cifrado AES-256-GCM |
| `arca/arca-status.service.ts` | Estado, prueba de conexión y conciliación de numeración |
| `invoices/invoice-emission.service.ts` | Emisión idempotente, lease de numeración, manejo de incertidumbre y conciliación |
| `fiscal/*` | Motor de cálculo, catálogos (códigos de IVA, comprobantes, documentos, condición IVA del receptor) y QR |

## 2. Endpoints oficiales

| Servicio | Homologación | Producción |
|---|---|---|
| WSAA | `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` | `https://wsaa.afip.gov.ar/ws/services/LoginCms` |
| WSFEv1 | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx` | `https://servicios1.afip.gov.ar/wsfev1/service.asmx` |

Los servidores de ARCA negocian parámetros Diffie-Hellman que OpenSSL 3 rechaza en su nivel de seguridad por defecto; por eso `ARCA_TLS_CIPHERS=DEFAULT@SECLEVEL=1` (solo para estas conexiones).

## 3. Certificados

Dos opciones, por ambiente (Configuración › ARCA):

**A. CSR generado por el sistema (recomendado).** "Generar CSR" crea una clave RSA 2048 que queda cifrada en la base y devuelve el CSR (`C=AR, O=<razón social>, CN=<alias>, serialNumber=CUIT <cuit>`). Con ese CSR se obtiene el certificado:
- Homologación: servicio **WSASS – Autogestión Certificados Homologación** (clave fiscal) → crear certificado con el CSR → **asociar el servicio `wsfe`** al alias.
- Producción: **Administración de Certificados Digitales** → agregar alias con el CSR → en **Administrador de Relaciones de Clave Fiscal** asociar el servicio "Facturación Electrónica" (`wsfe`) al certificado.
Luego "Cargar certificado" (sin clave privada).

**B. Certificado y clave existentes.** Cargar ambos en PEM.

Validaciones al cargar: formato X.509, vigencia, que la clave corresponda al certificado y que la CUIT del certificado sea la de la empresa. Cambiar el certificado invalida el ticket WSAA cacheado.

Además, el **punto de venta** debe estar dado de alta en ARCA como "Factura Electrónica – Monotributo/Responsable Inscripto – Web Services" (ABM de puntos de venta). "Consultar" en Puntos de venta lista los habilitados vía `FEParamGetPtosVenta`.

## 4. Flujo de emisión

```
DRAFT/REJECTED ──emit(Idempotency-Key)──▶ validaciones (reglas fiscales, fecha ±5/±10 días, PV activo, límites del plan)
   │                                      lease (PV, tipo)  ── ocupado → 409
   │                                      ¿hay SENDING/UNKNOWN en PV+tipo? → 409 (conciliar primero)
   │                                      WSAA (ticket) + FECompUltimoAutorizado → N = último + 1
   │                                      armado del XML (sin red)
   │                                      ── cualquier error hasta acá: nada se envió, sigue editable
   │                                      persistir SENDING + intento (N, clave)   ← antes de enviar
   │                                      FECAESolicitar
   ├── A + CAE ───────────────▶ AUTHORIZED (CAE, vto., observaciones) + PDF almacenado
   ├── R ─────────────────────▶ REJECTED (número liberado, errores/observaciones visibles)
   ├── fallo de conexión (no enviado) ▶ REJECTED con código CONEXION, 503
   └── timeout / respuesta inválida / resultado no concluyente
                                ▶ UNKNOWN → conciliación inmediata (FECompConsultar)
```

**Conciliación** (`POST /invoices/:id/reconcile`, automática cada 5 minutos y también inmediatamente tras un timeout):
- ARCA tiene el número con el mismo total, documento y fecha → `AUTHORIZED` con el CAE informado por ARCA.
- ARCA no lo tiene y su último autorizado es menor → nunca se autorizó: `REJECTED`, número liberado, puede reintentarse.
- ARCA tiene el número con otros datos → queda `UNKNOWN` con error `CONFLICTO` para revisión manual.
- Comprobantes en `SENDING` más antiguos que el lease (caída del proceso) se tratan como inciertos.

**Idempotencia:** una `Idempotency-Key` ya usada devuelve el estado actual sin reenviar; usarla para otro comprobante → 409. Un comprobante `AUTHORIZED` nunca se reenvía.

**Conciliación de numeración** (Configuración › ARCA › Conciliación): compara por tipo de comprobante el último autorizado local con `FECompUltimoAutorizado`.

## 5. Reglas fiscales implementadas

- Letra: emisor Monotributo/Exento → C; Responsable Inscripto → A a RI y monotributistas, B al resto. Cliente del exterior → requiere WSFEX (bloqueado).
- A exige receptor con CUIT. Notas de crédito/débito exigen comprobante asociado autorizado de la misma letra; la NC no puede superar el saldo del original.
- A/B: IVA discriminado por alícuota (Ids 3, 4, 5, 6, 8, 9); el IVA total es la suma por alícuota (base agrupada × tasa). Exento → `ImpOpEx`, no gravado → `ImpTotConc`. C: todo en `ImpNeto`, sin array `Iva`.
- Concepto servicios: fechas de servicio y vencimiento de pago obligatorias.
- `CondicionIVAReceptorId` informado siempre (RG 5616). Moneda extranjera: `MonId`, `MonCotiz` y `CanMisMonExt=N`.
- Otros tributos (percepciones, etc.) en `Tributos`.
- B: el PDF muestra precios con IVA incluido y la leyenda de IVA contenido (Ley 27.743).

## 6. QR

URL `https://www.afip.gob.ar/fe/qr/?p=<base64(JSON)>` con `ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec, tipoCodAut="E", codAut`. Se omite el documento del receptor cuando es "sin identificar" (99).

## 7. Seguridad de credenciales

- Certificado, clave privada, token y sign cifrados con AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`, 32 bytes). Perder la clave obliga a recargar los certificados; rotarla requiere re-cifrar (procedimiento: cargar nuevamente los certificados tras cambiar la clave).
- La API nunca devuelve certificados ni claves; los logs ocultan token, sign y el CMS.
- Ninguna credencial real está en el repositorio.

## 8. Verificaciones realizadas contra ARCA real

| Verificación | Resultado |
|---|---|
| FEDummy en homologación (desde la API y `npm run arca:check -w apps/api`) | `AppServer/DbServer/AuthServer = OK` |
| WSDL de homologación | Orden de campos de `FECAEDetRequest` verificado contra el WSDL publicado |
| WSAA homologación con certificado autofirmado | ARCA procesa el CMS y responde `Certificado no emitido por AC de confianza` (esperado): confirma TRA, firma y transporte correctos |
| Emisión con CAE real | **Pendiente**: requiere un certificado de homologación emitido por ARCA para la CUIT de prueba (ver §9) |

## 9. Cómo completar la prueba de homologación

1. Con clave fiscal de la CUIT de prueba, generar el certificado (§3, opción A) y asociarle `wsfe`.
2. Dar de alta un punto de venta web service en homologación.
3. En el sistema: cargar el certificado, crear el punto de venta, "Probar conexión" (los tres pasos deben quedar OK).
4. Emitir una Factura B a Consumidor Final y una Factura A a una CUIT válida; verificar CAE, QR (escanearlo) y la conciliación de numeración.
5. Emitir una nota de crédito sobre una factura autorizada.

## 10. Pase a producción (procedimiento controlado)

1. Completar §9 sin errores y revisar `arca_request_logs`.
2. Obtener el certificado de **producción** y dar de alta el punto de venta productivo.
3. En el servidor: `ARCA_PRODUCTION_ENABLED=true` y reiniciar la API.
4. Cargar el certificado de producción (Configuración › ARCA › Producción) y "Probar conexión" con el ambiente de producción.
5. "Cambiar a producción" (requiere confirmación; queda auditado como `company.arca_environment_changed`).
6. Emitir un primer comprobante real de bajo importe y verificarlo en "Mis Comprobantes" de ARCA.

La numeración de producción es independiente de la de homologación.
