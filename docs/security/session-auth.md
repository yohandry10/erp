# sessions con cookie HttpOnly (`apps/web` + `apps/erp-api`)

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
- El frontend no debe persistir `access_token` en `localStorage` ni `sessionStorage`.
- La sesión debe resolverse desde cookies `HttpOnly` emitidas por `@erp-api`.
- El backend debe aceptar token desde `Authorization` (compatibilidad) y desde cookie (`access_token`) para no romper clientes legacy que ya envíen header.

## Estado actual del PR
- `apps/web/lib/auth-service.ts` consulta `GET /api/auth/profile` con `credentials: 'include'`.
- `apps/web/contexts/AuthContext.tsx` e `TenantContext` hidratan sesión solo desde el servidor.
- `apps/web/hooks/use-api.ts` y `apps/web/hooks/useConfigurationStatus.ts` usan `credentials: 'include'` y no dependen de token.
- `apps/web/app/dashboard/wizard/*` ya no envía `Authorization` manual y usa cookie.
- `apps/web/app/dashboard/cajas/components/CortesList.tsx` descarga con `credentials: 'include'`.
- `apps/erp-api/src/modules/auth/strategies/jwt.strategy.ts` extrae token desde header Bearer y cookie `access_token`.

## Implementación mínima

- `apps/erp-api/src/modules/auth/auth.controller.ts`
  - Mantiene `login`, `switch-tenant` y `refresh` emitiendo `Set-Cookie` (`httpOnly`, `secure` en producción, `sameSite` configurable con `AUTH_COOKIE_SAME_SITE`).
  - Mantiene `/logout` limpiando cookie.
- `apps/web/lib/auth-service.ts`
  - `signInWithPassword()` -> `POST /api/auth/login` con `credentials: 'include'`.
  - `getSession()` -> consulta `GET /api/auth/profile` con cookie.
  - `signOut()` -> `POST /api/auth/logout` con cookie.
  - `setSession()` deja de intentar autenticar con header manual.
- `apps/erp-api/src/modules/auth/strategies/jwt.strategy.ts`
  - `jwtFromRequest` con extractores:
    - `Authorization: Bearer ...`
    - `Cookie: access_token`

## Comportamiento esperado
- Al iniciar sesión:
  1. El servidor devuelve `access_token` en JSON para compatibilidad inmediata.
  2. El mismo token también se setea en cookie `HttpOnly`.
  3. El frontend usa `/api/auth/profile` para hidratar `Session`.
- Al cargar páginas:
  1. El navegador envía cookie automáticamente (`credentials: 'include'`).
  2. Los guards de Nest pueden validar sin tener que leer `localStorage`.
- Al cerrar sesión:
  1. `/api/auth/logout` borra cookie.
  2. Frontend limpia estado en memoria.

## Riesgos conocidos y deuda
- Quedan escenarios legacy con almacenamiento en `localStorage` para flujos de demo (`token`, `demo_credentials` en rutas de demo) sin tocar en este bloque.
- `localStorage` sigue usándose para preferencias (`selectedCountry`, banners, configuración POS), pero sin secretos de autenticación.

## Pendiente de validación manual
- Probar inicio/refresh/cierre de sesión desde web y Tauri.
- Validar que endpoints protegidos devuelven 401 sin sesión y que `403`/`401` no se filtran en consola con token completo.
