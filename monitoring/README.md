# Monitoreo ERP Suite

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `operacion`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## URLs locales

- Prometheus: `http://localhost:9091`
- Grafana: `http://localhost:3300`
- API metrics: `http://localhost:13002/api/metrics`
- API health live: `http://localhost:13002/api/health/live`
- API health ready: `http://localhost:13002/api/health/ready`
- Worker health: `http://localhost:3050/health`
- Worker metrics: `http://localhost:3050/metrics`

## Configuracion canonica

- Prometheus: `monitoring/prometheus/prometheus.yml`
- Alertas: `monitoring/prometheus/alerts/erp-alerts.yml`
- Grafana datasource: `monitoring/grafana/provisioning/datasources/prometheus.yml`
- Grafana dashboard provider: `monitoring/grafana/provisioning/dashboards/dashboards.yml`
- Dashboards: `monitoring/grafana/dashboards/*.json`

## Targets Prometheus esperados

- `prometheus`: `localhost:9090`
- `erp-api`: `erp-api:3002`, path `/api/metrics`
- `erp-worker`: `worker:3050`, path `/metrics`
- `redis`: `redis-exporter:9121`
- `node`: `node-exporter:9100`

No se mantienen targets para servicios que no existen en `docker-compose.yml`.

## Arranque

```bash
docker compose --env-file .env up --build -d redis erp-api worker web redis-exporter node-exporter prometheus grafana
```

Puertos host por defecto: Web `13001`, API `13002`, Worker `3050`, Redis `6381`, Prometheus `9091`, Grafana `3300`, Redis exporter `9122`, Node exporter `9101`.

## Validacion

```bash
docker compose --env-file .env config --quiet
docker run --rm -v "$PWD/monitoring/prometheus:/etc/prometheus:ro" prom/prometheus:latest promtool check config /etc/prometheus/prometheus.yml
curl http://localhost:9091/-/ready
curl http://localhost:3300/api/health
```

En Prometheus revisar `Status -> Targets` y confirmar `UP` para `erp-api`, `erp-worker`, `redis` y `node`.

En Grafana local se puede abrir `ERP Infra Readiness` como Viewer anonimo. `admin/admin` queda solo para administracion local.

## Dashboards

- `ERP Infra Readiness`: target health de API, worker, Redis y node exporter.
- `ERP Suite - Salud del Sistema`: metricas HTTP y sistema.
- `ERP Business Metrics`: metricas de negocio si el API ya genero eventos.
- `ERP Overview`: vista resumida.

## Seguridad

- `admin/admin` y Viewer anonimo de Grafana solo son aceptables en local.
- Produccion debe configurar password de Grafana con secret manager.
- No commitear `.env`, tokens, certificados reales ni claves Supabase/SMTP/SUNAT.
