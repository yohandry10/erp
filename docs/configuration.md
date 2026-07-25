# Configuración de entorno – apps/erp-api

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `documento_general`.
>
> Leer tambien: `docs/README.md`, `docs/START_HERE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Este documento describe las variables usadas por el backend NestJS.
Todas las variables sensibles se validan con `joi` mediante `apps/erp-api/src/config/env.schema.ts`.

## Variables obligatorias

Las siguientes variables son requeridas en entornos fuera de `NODE_ENV=test`:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SESSION_SECRET`
- `CSRF_SECRET`
- `AUTH_SIGNATURE_SECRET`
- `ENCRYPTION_KEY` o `CERT_ENCRYPTION_KEY` (al menos una de ellas)
- `DB_ENCRYPTION_KEY`

## Frontera DEV/PROD

- `DEPLOYMENT_ENV`: `DEV` o `PROD`. En `NODE_ENV=production` debe ser `PROD`.
- `EXPECTED_SUPABASE_PROJECT_REF`: ref de 20 caracteres esperado. Es obligatorio en produccion y debe coincidir con el host de `SUPABASE_URL`.
- `DEMO_API_ENABLED`: puede ser `true` solo en DEV. PROD rechaza el arranque si esta habilitado.

Refs canonicos: DEV `hbueraexcbowpfnjlppi`; PROD `wypnbcptofqdmoynlonq`. Ver `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md` y ejecutar el preflight antes de operar una base.

## Variables recomendadas de seguridad

- `CERT_ENCRYPTION_KEY_OLD` (rotación de claves opcional)
- `CERTIFICATE_PASSWORD`
- `HEALTH_TOKEN` (si se protege `/api/health` con token)

## Variables de Supabase opcionales y defaults

- `SUPABASE_FETCH_TIMEOUT_MS` (default `8000` ms)
- `SUPABASE_FETCH_MAX_RETRIES` (default `2`)
- `SUPABASE_FETCH_RETRY_BASE_MS` (default `250` ms)
- `SUPABASE_NETWORK_BACKOFF_MS` (default `30000` ms)

## Variables de firma fiscal (opcional, pero consistentes)

- `PFX_PATH` y `PFX_PASS` (se deben definir juntas).
  Se usan como fallback global de firma para CPE/RA cuando el tenant no tiene certificado configurado.

## Variables de runtime

- `NODE_ENV`: `development | test | staging | production` (default `development`)
- `PORT`: puerto HTTP (default `3002`)
- `LOG_LEVEL`: texto de nivel de logs (`info` por defecto)

## JWT / auth

- `JWT_EXPIRES_IN`: default `8h`
- `JWT_REFRESH_EXPIRES_IN`: default `7d`
- `SESSION_SECRET`: secreto de sesiones de backend
- `CSRF_SECRET`: secreto para mitigaciones CSRF

## Rate limiting

- `THROTTLE_LIMIT`: límite base por ventana (default `100`)
- `THROTTLE_TTL`: TTL de ventana en milisegundos (default `60000`)

## Nota de compatibilidad

- Use `apps/erp-api/.env.example` como plantilla sin secretos reales.
- Para pruebas locales use el proyecto DEV; PROD se configura mediante `.env.production` o secretos inyectados y nunca se reutiliza para demos.
