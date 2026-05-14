# Configuración de entorno – apps/erp-api

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
- Para pruebas locales puede usar `apps/erp-api/.env.local` sin exponer claves.
