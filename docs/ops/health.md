# Health checks de operaciones

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `operacion`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Endpoints

- `GET /api/health/live`
  - Verifica que la API responde (liveness).
- `GET /api/health/ready`
  - Verifica dependencias críticas (por ahora: conectividad a Supabase).
  - Devuelve `503` si alguna dependencia crítica no responde.
- `GET /api/health/version`
  - Devuelve metadata de runtime sin secretos.
- `GET /health` o `GET /healthz` en worker
  - Devuelve salud del worker y requiere `x-health-token` si `HEALTH_TOKEN` esta definido.

## Contratos de respuesta (ejemplos)

### `GET /api/health/live`

```json
{
  "status": "alive",
  "timestamp": "2026-04-27T10:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "process": "ok"
  }
}
```

### `GET /api/health/ready` (ok)

```json
{
  "status": "ready",
  "timestamp": "2026-04-27T10:00:00.000Z",
  "checks": {
    "database": "ok"
  },
  "version": "1.0.0"
}
```

### `GET /api/health/ready` (unready)

```json
{
  "statusCode": 503,
  "message": {
    "status": "unready",
    "timestamp": "2026-04-27T10:00:00.000Z",
    "checks": {
      "database": "fail"
    },
    "failures": ["database"]
  },
  "error": "Service Unavailable"
}
```

### `GET /api/health/version`

```json
{
  "service": "erp-api",
  "version": "1.0.0",
  "commit": "sha123",
  "buildDate": "2026-04-27T08:00:00Z",
  "nodeEnv": "production",
  "timestamp": "2026-04-27T10:00:00.000Z"
}
```

## Variables de configuración

- `APP_VERSION`
- `APP_COMMIT_SHA`
- `APP_BUILD_DATE`
- `HEALTH_TOKEN` (opcional para `GET /api/health`)
- `HEALTH_TOKEN` tambien protege el health del worker si se pasa al servicio.

## Integración con Docker / Orquestación

- `docker` y Kubernetes suelen apuntar a `/api/health/live` o `/api/health/ready`.
- Recomendación:
  - Liveness: `getLiveHealth()`
  - Readiness: `getReadyHealth()`
- En `docker-compose.yml`, los healthchecks de API y worker usan `HEALTH_TOKEN` automaticamente si esta definido en el entorno.
