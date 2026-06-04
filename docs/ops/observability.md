# Observabilidad local ERP

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `operacion`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Objetivo

Validar que Prometheus y Grafana observan el stack Docker real del ERP, sin targets falsos ni servicios futuros declarados como activos.

## Servicios

- Prometheus: `http://localhost:9091`
- Grafana: `http://localhost:3300`
- API metrics: `http://localhost:13002/api/metrics`
- Worker metrics: `http://localhost:3050/metrics`
- Redis exporter: `localhost:9122`
- Node exporter: `localhost:9101`

Los puertos host pueden cambiarse con `PROMETHEUS_HOST_PORT`, `GRAFANA_HOST_PORT`, `API_HOST_PORT`, `WORKER_HOST_PORT`, `REDIS_EXPORTER_HOST_PORT` y `NODE_EXPORTER_HOST_PORT`.

## Arranque

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
docker compose --env-file .env -f docker-compose.yml up --build -d redis erp-api worker web redis-exporter node-exporter prometheus grafana
```

## Validacion obligatoria

```bash
docker run --rm --entrypoint promtool -v "$PWD/monitoring/prometheus:/etc/prometheus:ro" prom/prometheus:latest check config /etc/prometheus/prometheus.yml
curl http://localhost:9091/-/ready
curl http://localhost:3300/api/health
```

En Prometheus abrir `http://localhost:9091/targets` y confirmar `UP` en:

- `erp-api`
- `erp-worker`
- `redis`
- `node`
- `prometheus`

En Grafana abrir `http://localhost:3300/d/erp-infra-readiness/erp-infra-readiness`.

## Dashboard minimo

Dashboard provisionado:

- `monitoring/grafana/dashboards/erp-infra-readiness.json`

Debe mostrar estado actual de:

- API target.
- Worker target.
- Redis exporter.
- Node exporter.
- Errores de worker.

## Troubleshooting

- Si Prometheus muestra targets `DOWN`, revisar primero `docker compose ps` y los healthchecks.
- Si `erp-api` esta `DOWN`, validar `http://localhost:13002/api/health/ready` con `x-health-token` cuando aplique.
- Si `erp-worker` esta `DOWN`, validar `http://localhost:3050/health` y `http://localhost:3050/metrics`.
- Si Grafana no carga dashboards, validar que los JSON tengan `title` en la raiz y que `monitoring/grafana/provisioning/dashboards/dashboards.yml` apunte a `/var/lib/grafana/dashboards`.
- No agregar targets para servicios que no existan en `docker-compose.yml`.
- No usar `host.docker.internal` para servicios que viven dentro del mismo Compose network.

## Seguridad

- `admin/admin` y Viewer anonimo solo son aceptables en local.
- Produccion debe deshabilitar Viewer anonimo salvo decision explicita y cargar password de Grafana desde secret manager.
- No commitear `.env`, certificados reales, certificados demo `.pfx`, claves Supabase, SMTP, SUNAT/OSE ni tokens.
