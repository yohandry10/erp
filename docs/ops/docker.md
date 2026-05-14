# Docker operativo para ERP API

## Objetivo

Estandarizar la ejecución local y de producción del backend con:
- runtime Node 20 LTS en todas las etapas,
- puerto real de la API `3002`,
- healthcheck apuntando al endpoint `/api/health`,
- comandos de build/run reproducibles sin secretos en repositorio.

## Construcción y ejecución local (API)

1. Copiar variables del stack desde el ejemplo raiz:

```bash
cp .env.example .env
```

2. Completar valores reales en `.env` (no commitear). Para ejecucion directa del API sin Compose, tambien puede usarse `apps/erp-api/.env.example` como base de `apps/erp-api/.env.local`.

3. Validar la configuracion estatica de Compose:

```bash
docker compose --env-file .env.example config --quiet
```

4. Levantar la API:

```bash
docker compose up --build erp-api
```

5. Validar salud:

```bash
curl http://localhost:3002/api/health
```

## Variables usadas por `docker-compose.yml`

- `PORT` (default `3002`).
- `NODE_ENV`.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- `AUTH_SIGNATURE_SECRET`, `HEALTH_TOKEN`.
- `PFX_PATH` y `PFX_PASS`.
- `POS_WORKER_JWT_SECRET` para firmar JWT del worker POS; debe tener al menos 24 caracteres y coincidir con el API.
- `WORKER_API_JWT_SECRET` solo como compatibilidad de lectura del API para jobs heredados.
- SUNAT/OSE según flujo fiscal requerido.

## Política de secretos

- `docker-compose.yml` no debe contener secretos reales.
- Los valores sensibles se pasan desde variables de entorno del entorno de CI/host o desde un archivo local no versionado.
- Este bloque no crea ni almacena secretos reales en el repositorio.

## Notas

- La configuración del stack base mantiene servicios de soporte (`redis`, `worker`, observabilidad) para pruebas locales.
- Si `HEALTH_TOKEN` esta definido, los healthchecks de Compose envian automaticamente el header `x-health-token`.
- En `NODE_ENV=production`, el worker exige `ERP_API_URL` explicito y aborta al arranque si faltan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` o `POS_WORKER_JWT_SECRET`.
- El JWT que emite el worker para POS incluye `scope=pos.worker`; cambiar este contrato requiere actualizar tambien `PosController.procesarVentasPendientesWorker`.
- Si se requiere correr sólo la API, se puede omitir los servicios adicionales iniciándolos explícitamente:

```bash
docker compose up --build erp-api
```
