# Docker y Observabilidad ERP

## Estado objetivo

El stack local estandar usa:

- Web Next.js: `http://localhost:13001`
- API NestJS: `http://localhost:13002`
- Worker: `http://localhost:3050`
- Redis: `localhost:6381`
- Prometheus: `http://localhost:9091`
- Grafana: `http://localhost:3300`
- Redis exporter: `localhost:9122`
- Node exporter: `localhost:9101`

`docker-compose.yml` es la fuente canonica para el stack local con observabilidad. Los puertos host se parametrizan con `*_HOST_PORT` para convivir con procesos locales y otros contenedores.
`docker-compose.validation.yml` queda para validar imagenes ya construidas en puertos `13001/13002`.

## Requisitos

- Docker Desktop activo.
- `.env` local creado desde `.env.example`.
- Secretos reales solo en `.env`, variables del host o secret manager. No commitear secretos.
- Certificado demo/local en `certs/demo.pfx` solo para homologacion local.

## Arranque local completo

```bash
docker compose --env-file .env config --quiet
docker compose --env-file .env up --build -d redis erp-api worker web redis-exporter node-exporter prometheus grafana
```

## Verificacion rapida

```bash
curl http://localhost:13002/api/health/live
curl http://localhost:13002/api/health/ready
curl http://localhost:3050/health
curl http://localhost:3050/metrics
curl http://localhost:9091/-/ready
curl http://localhost:3300/api/health
```

## Prometheus

Config canonica:

- `monitoring/prometheus/prometheus.yml`

Targets esperados:

- `prometheus` -> `localhost:9090`
- `erp-api` -> `erp-api:3002/api/metrics`
- `erp-worker` -> `worker:3050/metrics`
- `redis` -> `redis-exporter:9121`
- `node` -> `node-exporter:9100`

Validacion estatica:

```bash
docker run --rm -v "$PWD/monitoring/prometheus:/etc/prometheus:ro" prom/prometheus:latest promtool check config /etc/prometheus/prometheus.yml
```

## Grafana

Datasource:

- `monitoring/grafana/provisioning/datasources/prometheus.yml`

Dashboards:

- `monitoring/grafana/dashboards/erp-infra-readiness.json`
- `monitoring/grafana/dashboards/erp-system-health.json`
- `monitoring/grafana/dashboards/erp-business-metrics.json`
- `monitoring/grafana/dashboards/erp-overview.json`

Credenciales locales por defecto:

- usuario: `admin`
- password: `admin`

El Compose local tambien habilita `GF_AUTH_ANONYMOUS_ENABLED=true` con rol `Viewer` para poder abrir dashboards sin escribir secretos durante validaciones visuales. Estas credenciales y el acceso anonimo son solo locales. Produccion debe configurar `GF_SECURITY_ADMIN_PASSWORD` desde secret manager y deshabilitar acceso anonimo salvo decision explicita de observabilidad interna.

## CI de infraestructura

Workflow:

- `.github/workflows/infra.yml`

Valida:

- `docker compose config` para `docker-compose.yml` y `docker-compose.validation.yml`.
- `promtool check config`.
- JSON de dashboards con `jq`.
- Build de imagenes `erp-api`, `web` y `worker`.

## Politica de limpieza

- No mantener configuraciones Prometheus alternativas sin uso.
- No declarar targets que no existan en Compose.
- No montar dashboards sobre la carpeta de provisioning.
- No usar `host.docker.internal` para servicios que viven dentro del mismo Compose network.
- Healthchecks deben apuntar a endpoints reales (`/api/health/ready`, `/health`).
