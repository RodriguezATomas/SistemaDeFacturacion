# Multiempresa y modalidades de despliegue

## Modalidades

| | SaaS (`DEPLOYMENT_MODE=saas`) | Instalación privada (`DEPLOYMENT_MODE=private`) |
|---|---|---|
| Base de datos | Compartida, aislamiento lógico por `companyId` | Independiente de la empresa |
| Alta de empresas | Registro público; un usuario puede crear varias empresas | `npm run setup:private` crea la empresa y su propietario; registro público deshabilitado |
| Planes y suscripciones | Prueba de 30 días en plan "profesional"; límites de usuarios, puntos de venta y comprobantes/mes; solo lectura si no está vigente | Plan "instalacion-privada" sin límites, siempre activo |
| Panel de plataforma | Disponible para administradores de plataforma | Deshabilitado (403) |
| Almacenamiento | S3 compatible | S3 propio o disco local (`STORAGE_DRIVER=local`) |
| Credenciales ARCA | Por empresa, cifradas en la base | Igual, con la clave de cifrado propia de la instalación |

La modalidad es solo configuración: misma imagen Docker, mismas migraciones, mismo código.

## Cómo se garantiza el aislamiento

1. **La empresa activa la decide el servidor**: va firmada en el JWT (`cid`) y solo se obtiene con `switch-company`, que verifica la membresía.
2. **Revalidación en cada request** (`AuthGuard`): la membresía debe existir y estar ACTIVE, la empresa ACTIVE y no eliminada. Desactivar a un usuario o suspender una empresa corta el acceso de inmediato (además se revocan sus refresh tokens).
3. **Todas las consultas filtran por `companyId`** tomado del contexto autenticado (`@CompanyId()`), nunca del cliente. Los IDs de otra empresa devuelven 404.
4. **Referencias cruzadas validadas**: al usar un cliente, producto, lista de precios, punto de venta o comprobante asociado, el servicio verifica que pertenezca a la misma empresa.
5. **Whitelist de DTOs**: cualquier campo no declarado (por ejemplo `companyId`) se rechaza con 400.
6. **Entidades hijas** (ítems, desglose de IVA) se acceden solo a través de un padre ya filtrado.
7. **Pruebas**: `apps/api/test/tenancy.int-spec.ts` verifica lectura, edición y borrado cruzado, uso de recursos ajenos, manipulación del cuerpo, cambio a empresas sin membresía, revocación y suspensión.

## Roles

Cada empresa recibe roles de sistema: **Propietario** (todos los permisos, inmodificable), **Administrador**, **Facturación** y **Consulta**; pueden crearse roles personalizados. La empresa debe conservar al menos un propietario activo y un usuario no puede cambiar su propio rol ni estado.

## Administrador de plataforma

`users.isPlatformAdmin` habilita el panel SaaS (empresas, planes, suscripciones). Se crea con el seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). No otorga acceso a los datos de negocio de las empresas.
