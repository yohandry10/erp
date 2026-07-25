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

## Estado actual
- `apps/web/lib/auth-service.ts` consulta `GET /api/auth/profile` con `credentials: 'include'`.
- `apps/web/contexts/AuthContext.tsx` conserva en Web Storage solo un snapshot no sensible del usuario; `access_token` siempre se omite y se limpian las claves legacy `token`/`demo_credentials`.
- Tauri conserva el Bearer necesario fuera de Web Storage, cifrado con DPAPI en `auth_token.dat`; en plataformas sin keyring seguro la persistencia falla cerrada.
- La outbox offline elimina `Authorization`, `Cookie`, `Proxy-Authorization` y `x-api-key` antes de persistir. El token vigente se añade en memoria únicamente durante el envío.
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
  - En escritorio delega persistencia a `desktop-secure-session.ts`; en navegador el token queda solo en memoria.
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

## Web Storage permitido

- `localStorage`/`sessionStorage` puede usarse para preferencias no sensibles (`selectedCountry`, onboarding, tema, banners y configuración POS no secreta).
- Está prohibido persistir JWT, passwords, cookies, API keys o headers `Authorization`.
- Los estados E2E se autentican por cookie y no generan snapshots con JWT.

## Pendiente de validación manual
- Probar inicio/refresh/cierre de sesión desde web y Tauri.
- Probar reinicio de Tauri y confirmar que `auth_token.dat` empieza con `dpapi:` y que no aparece ningún JWT en Web Storage/outbox.
- Validar que endpoints protegidos devuelven 401 sin sesión y que `403`/`401` no se filtran en consola con token completo.
