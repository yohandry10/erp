# Rate limiting en backend (P2.4)

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `seguridad`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Objetivo

Reactivar control de tasa global en API y definir límites diferenciados por categoría de endpoint para reducir abuso y proteger infraestructura.

## Implementación actual

- `RateLimitGuard` se aplica como guard global (`APP_GUARD`) en `apps/erp-api/src/app.module.ts`.
- `RateLimitGuard` ahora identifica al usuario autenticado (`req.user.id` o `req.user.sub`) y usa ese identificador como tracker antes que IP.
  Si no hay usuario, usa IP (`req.ip`, `connection.remoteAddress`, `socket.remoteAddress`).
- Endpoints de salud y metadatos públicos se excluyen con `@SkipThrottle()`:
  - `GET /`
  - `GET /api/health`
  - `GET /api/info`

## Políticas por categoría (estado actual)

### 1) Auth/login y refresh
- Mantiene límites por ruta explícita en `AuthController`:
  - `POST /auth/login`: `5 req / 60s` (`AuthRateLimitGuard`)
  - `POST /auth/refresh`: `10 req / 60s`
  - `POST /auth/password-reset/request`: `3 req / 60s`
  - `POST /auth/password-reset/validate`: `5 req / 60s`
  - `POST /auth/password-reset/confirm`: `3 req / 60s`

### 2) API normal
- `RateLimitGuard` usa configuración base de `SecurityModule` (`THROTTLE_LIMIT`, `THROTTLE_TTL`).
- Alcance global para rutas sin configuración específica.

### 3) Reportes / exportes
- Reportes y módulos de exportación reforzados con `@Throttle(...)`:
  - `src/modules/reports/reports.controller.ts`: 30/min por defecto, 5/min para `/ventas/export/excel`
  - `src/modules/ventas/reportes/reportes.controller.ts`: 25/min por defecto
  - `src/modules/import-export/import-export.controller.ts`: 25/min por defecto, 10/min previews, 5/min import/catalogo
  - `src/modules/cpe/cpe.controller.ts`: 8/min en `GET /cpe/comprobantes/export`

### 4) Webhooks
- `POST /webhooks/stripe`:
  - `@Throttle(120, 60)` (política especial para callbacks de terceros)

## Riesgos y próximos ajustes

- Los límites de rutas específicas aún están declarados de forma estática en decoradores (`@Throttle`) y no por variables de entorno.
- Sugerido para siguiente iteración:
  - Externalizar umbrales críticos a variables `THROTTLE_REPORT_LIMIT`, `THROTTLE_REPORT_TTL`, `THROTTLE_WEBHOOK_LIMIT`, `THROTTLE_WEBHOOK_TTL`.
  - Definir pruebas de regresión para 429 en rutas de login/reset y en una ruta de carga normal.
