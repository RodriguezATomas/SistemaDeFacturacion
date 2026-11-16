# Sistema Integral de Gestión y Facturación

Plataforma comercial de **gestión empresarial y facturación electrónica para Argentina**, con **integración real con ARCA** (ex AFIP). Se ofrece como **SaaS en la nube** para múltiples empresas o como **instalación privada** en la infraestructura de cada cliente, a partir de una única base de código.

---

## Objetivos

- Permitir que cualquier empresa emita comprobantes electrónicos válidos (con CAE) de forma simple, segura y auditada.
- Centralizar la gestión comercial básica: clientes, proveedores, productos, servicios y precios.
- Ofrecer un producto comercializable, moderno y escalable, apto tanto para uso masivo (SaaS) como para empresas que requieren su propio servidor.
- Garantizar la integridad fiscal: numeración correlativa, idempotencia y conciliación con ARCA ante cualquier incertidumbre.

## Problema que resuelve

Muchas empresas facturan con herramientas aisladas (el portal de ARCA, planillas, sistemas antiguos) que no se integran con su gestión comercial, no controlan errores de comunicación con el fisco y no ofrecen trazabilidad. Esto genera comprobantes duplicados o faltantes, numeraciones inconsistentes y trabajo manual. El sistema integra la gestión comercial con la emisión electrónica y protege cada operación fiscal de fallas de red, reintentos y errores humanos.

## Público objetivo

Empresas de distintos tamaños y sectores, comercios, profesionales independientes, estudios contables y prestadores de servicios de Argentina, ya sean Responsables Inscriptos, Monotributistas o Exentos.

## Funcionalidades principales

- **Facturación electrónica ARCA:** Facturas, Notas de Débito y Notas de Crédito A, B y C con CAE, código QR oficial y PDF. Determinación automática del tipo de comprobante según la condición fiscal del emisor y del receptor.
- **Motor de cálculo fiscal:** IVA discriminado por alícuota (0 %, 2,5 %, 5 %, 10,5 %, 21 %, 27 %), operaciones exentas y no gravadas, percepciones y otros tributos, monedas extranjeras.
- **Integridad fiscal:** numeración correlativa por punto de venta, emisión idempotente, detección de resultados inciertos (timeouts) y conciliación automática con ARCA antes de cualquier reintento. Nunca se considera autorizado un comprobante sin confirmación de ARCA.
- **Gestión comercial:** clientes, proveedores, productos y servicios, categorías y listas de precios diferenciadas.
- **Panel principal:** ventas del mes, evolución de 12 meses, principales clientes y comprobantes recientes.
- **Multiempresa:** un usuario puede trabajar con varias empresas; cada empresa tiene sus datos, configuración fiscal y usuarios completamente aislados.
- **Usuarios, roles y permisos:** invitaciones por email, roles predefinidos (Propietario, Administrador, Facturación, Consulta) y roles personalizados.
- **Seguridad y auditoría:** registro de todas las acciones relevantes y de cada operación con ARCA; certificados digitales cifrados.
- **Administración SaaS:** gestión de empresas, planes, límites de uso y suscripciones.

## Módulos del sistema

| Módulo | Descripción |
|---|---|
| Identidad y acceso | Registro, inicio de sesión, recuperación de contraseña, selección de empresa |
| Empresas | Datos fiscales y comerciales, preferencias de facturación |
| Usuarios y roles | Membresías, invitaciones, permisos granulares |
| Clientes y proveedores | Datos fiscales validados (CUIT/CUIL/DNI) y de contacto |
| Catálogo | Productos, servicios, categorías y listas de precios |
| Puntos de venta | Puntos de venta habilitados en ARCA |
| Comprobantes | Borradores, emisión, conciliación, notas de crédito, PDF |
| Integración ARCA | Certificados digitales, prueba de conexión, conciliación de numeración, registro de operaciones |
| Panel y auditoría | Indicadores comerciales y registro de acciones |
| Plataforma SaaS | Empresas, planes y suscripciones |

## Arquitectura general

- **Frontend:** aplicación web de una sola página (SPA) responsive.
- **Backend:** API REST modular con autenticación por tokens, control de acceso por roles y aislamiento estricto por empresa.
- **Base de datos:** PostgreSQL con migraciones versionadas.
- **Archivos:** almacenamiento compatible con S3 (o disco local en instalaciones privadas).
- **Integración fiscal:** componentes separados por web service de ARCA (WSAA para autenticación, WSFEv1 para facturación electrónica), preparados para incorporar otros servicios.
- **Despliegue:** contenedores Docker orquestados con Docker Compose.

## Tecnologías utilizadas

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide, Zustand, TanStack Query, React Hook Form, Zod y Recharts.
- **Backend:** Node.js, NestJS, TypeScript, Prisma ORM, PostgreSQL, JWT con Refresh Tokens, Swagger/OpenAPI.
- **Infraestructura:** Docker, Docker Compose, nginx, almacenamiento S3 compatible, SMTP.
- **Calidad:** Jest, Vitest y Playwright.

## Modalidades de instalación

| | SaaS | Instalación privada |
|---|---|---|
| Infraestructura | Compartida, administrada por el proveedor | Propia del cliente |
| Base de datos | Compartida con aislamiento lógico por empresa | Exclusiva |
| Alta de empresas | Registro en línea con período de prueba | Configuración inicial por el administrador |
| Planes | Con límites de usuarios, puntos de venta y comprobantes | Sin límites |
| Dependencia de servicios centrales | Sí (plataforma) | No |

## Integración con ARCA

- Autenticación mediante **WSAA** con el certificado digital de cada empresa (el sistema puede generar el pedido de certificado).
- Emisión mediante **WSFEv1**: obtención del CAE, su vencimiento y el código QR.
- **Homologación primero:** toda empresa comienza en el ambiente de pruebas; el pase a producción es un procedimiento controlado y auditado.
- Certificados y credenciales almacenados cifrados, separados por CUIT y ambiente.
- Trazabilidad completa de cada solicitud y respuesta.
- La factura de exportación (WSFEX) está prevista en la hoja de ruta.

## Requisitos de instalación

- Servidor Linux (o Windows/macOS para desarrollo) con Docker y Docker Compose.
- Node.js 22 o superior (para desarrollo y tareas administrativas).
- Acceso a Internet hacia los servicios de ARCA.
- Servidor SMTP para el envío de emails.
- Certificado digital de ARCA y punto de venta habilitado para web services, por cada empresa que emita comprobantes.
- Dominio con HTTPS para entornos productivos.

## Información general de ejecución

El código fuente se encuentra en la rama `DEVELOP` (versión integrada y verificada); el desarrollo se realiza en `TEST`. Allí se documenta en detalle la instalación local, la configuración por variables de entorno, la ejecución con Docker Compose, las pruebas y el despliegue (carpeta `docs/`).

## Estado y alcance del proyecto

**Versión 1.0 — noviembre de 2026.**

- Implementados: identidad y acceso, multiempresa, roles y permisos, gestión comercial, motor fiscal, integración WSAA/WSFEv1 con emisión idempotente y conciliación, PDF con QR, panel, auditoría, administración SaaS, modalidad privada, contenedores de producción y backups.
- Verificado: pruebas unitarias, de integración, de interfaz y end-to-end; conectividad real con el ambiente de homologación de ARCA.
- Próximos pasos: prueba de emisión con CAE real en homologación con el certificado de la empresa, pase a producción, factura de exportación (WSFEX), consulta de padrón, cuenta corriente de clientes y pasarela de pagos para suscripciones.
