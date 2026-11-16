# Avance del desarrollo

## Estado de las ramas

| Rama | Contenido | Regla |
|---|---|---|
| `TEST` | Todo el desarrollo (código, pruebas, docs) | Se trabaja solo acá |
| `DEVELOP` | Versión integrada y verificada (merge desde TEST tras pasar todas las verificaciones) | No se desarrolla directamente |
| `MAIN` | Únicamente `README.md` con la descripción del producto | Nunca recibe merges de TEST/DEVELOP |

Las ramas existen localmente. El remoto `origin` solo tiene `main` (commit inicial); publicar las tres ramas es una acción pendiente del responsable (ver README de TEST).

## Registro de avances

### 2026-11-16 — Entrega 1.0 (Fases 0 a 7)

**Implementado:** todos los requisitos de `REQUIREMENTS_TRACEABILITY.md` salvo REQ-063 (falta certificado de homologación para la prueba de CAE real) y REQ-064 (WSFEX, pendiente).

**Commits en TEST:**

| Commit | Descripción |
|---|---|
| `7a77f61` | Backend NestJS multiempresa con integración ARCA (WSAA/WSFEv1) |
| `adc42f8` | Actualización de dependencias con vulnerabilidades conocidas |
| `e3ef8f0` | Frontend React con todos los módulos |
| `341bd42` | Pruebas E2E con Playwright |
| (siguiente) | Módulo de almacenamiento (excluido por error por `.gitignore`), `.dockerignore`, modalidad privada, backups y documentación |

**Pruebas ejecutadas y resultados:** ver `TESTING.md` §5 (61 unitarias API, 39 integración, 15 Vitest, 5 E2E; builds y Docker OK; verificación real contra ARCA homologación).

**Errores encontrados y corregidos durante la entrega:**

- `.gitignore` con `storage/` excluía `apps/api/src/modules/storage`; se detectó al construir la imagen Docker y se corrigió el patrón.
- Falta de `.dockerignore`: se copiaban `node_modules` locales (y potencialmente `.env`) a la imagen.
- Dos copias de React (18 y 19 como peer instalada por npm) rompían las pruebas de componentes; se unificó en 18.3.1.
- MinIO ya no publica imágenes en Docker Hub; reemplazado por SeaweedFS.
- Vulnerabilidades en dependencias (incluida una crítica en fast-xml-parser) — actualizadas (DECISIONS D-12).
- `DATABASE_URL` global del sistema operativo de otro proyecto se imponía sobre `.env` — carga con prioridad en desarrollo (D-15).

**Pendiente:**

1. Prueba de emisión con CAE real en homologación (requiere certificado; procedimiento en ARCA_INTEGRATION.md §9).
2. WSFEX (Factura E).
3. Requisitos del SPEC funcional completo (documento no entregado).
4. Publicar ramas `TEST`, `DEVELOP` y `MAIN` en el remoto.

**Integración en DEVELOP:** realizada luego de verificar tipos, lint, pruebas unitarias, de integración, Vitest, E2E, builds y construcción de imágenes Docker.
