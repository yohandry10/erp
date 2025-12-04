# Configuración de demos en el mismo entorno/base

Esta app permite crear tenants demo en la misma base (empresa_config) sin migrar a otro proyecto. Para habilitarlos de forma segura:

## Variables de entorno
- `DEMO_API_ENABLED=true` habilita los endpoints `/demo/*`.
- `DEMO_CAPTCHA_SECRET` clave para anti-abuso; envíala en `X-Demo-Captcha-Token` (o `captchaToken` en el body) al crear demos.
- `HELP_API_TOKEN` token requerido por las rutas de ayuda (headers `x-help-token` o `Authorization: Bearer`).
- `APIPERU_TOKEN` valor real, cargado desde secretos.

## Cómo consumir `/demo/create`
1) Establece `DEMO_API_ENABLED=true` y define `DEMO_CAPTCHA_SECRET`.
2) Llama a `POST /api/demo/create` con el header `X-Demo-Captcha-Token: <DEMO_CAPTCHA_SECRET>` (o `captchaToken` en el JSON).
3) Throttle: 5 solicitudes por hora ya están activas.

## Conversión de demo a cuenta real
- Los demos viven en `empresa_config` con flags `is_demo`, `demo_expires_at`, etc.
- Al convertir, sólo se actualizan esos flags (no se mueven datos de tabla).
- Las credenciales de demo se devuelven en la creación; protege el endpoint con captcha/token.

## Rutas de ayuda
- Requieren `HELP_API_TOKEN` en header (`x-help-token` o `Authorization: Bearer <token>`) y `X-Tenant-Id` para la segmentación.

## Recomendación de abuso
- Mantén captcha/token y monitorea uso; si no deseas demos públicas en un entorno, pon `DEMO_API_ENABLED=false`.
