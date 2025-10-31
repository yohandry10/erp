# 🚨 Instrucciones Inmediatas - Solucionar Error 404 en /api/v1/metrics

## ❌ Error Actual

```
[Nest] 2780  - 30/10/2025, 15:05:14    WARN [GlobalExceptionFilter] GET /api/v1/metrics - 404 - Cannot GET /api/v1/metrics
```

**Causa:** Prometheus está intentando acceder a `/api/v1/metrics` pero ese endpoint no existe porque no hay módulo de métricas instalado.

## ✅ Solución en 3 Pasos

### Paso 1: Instalar Dependencias (2 minutos)

```powershell
cd apps/erp-api
pnpm install
```

Esto instalará:
- `prom-client@^15.1.0` - Cliente de Prometheus
- `@willsoto/nestjs-prometheus@^6.0.0` - Integración con NestJS

### Paso 2: Reiniciar la API (1 minuto)

```powershell
# Detener el servidor actual (Ctrl+C si está corriendo)

# Iniciar nuevamente
pnpm run dev
```

O si usas Docker:

```powershell
docker-compose restart erp-api
```

### Paso 3: Verificar que Funciona (30 segundos)

```powershell
# Verificar endpoint de métricas
curl http://localhost:3002/api/metrics
```

**Debe retornar algo como:**
```
# HELP erp_http_requests_total Total de requests HTTP
# TYPE erp_http_requests_total counter
erp_http_requests_total{method="GET",route="/",status_code="200",tenant_id="unknown"} 1

# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 0.156

# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 125829120
...
```

## 🔍 Verificación Completa

### 1. Verificar que el módulo se cargó

En los logs de inicio deberías ver:

```
[Nest] 2780  - 30/10/2025, 15:05:07     LOG [NestApplication] Nest application successfully started
🚀 Servidor corriendo en puerto 3002
📊 Métricas disponibles en http://localhost:3002/api/metrics
```

### 2. Verificar endpoints disponibles

```powershell
# Endpoint principal de métricas (formato Prometheus)
curl http://localhost:3002/api/metrics

# Resumen de métricas de negocio (formato JSON)
curl http://localhost:3002/api/metrics/summary

# Métricas de salud (formato JSON)
curl http://localhost:3002/api/metrics/health
```

### 3. Verificar en Swagger

Ir a: http://localhost:3002/api/docs

Deberías ver una nueva sección "Métricas" con los endpoints:
- `GET /api/metrics/summary`
- `GET /api/metrics/health`

## 🎯 Configurar Prometheus (Opcional - 5 minutos)

Si quieres que Prometheus funcione correctamente:

### Opción A: Usar Script Automático

```powershell
.\scripts\setup-monitoring.ps1
```

### Opción B: Manual

1. **Crear archivo de configuración de Prometheus:**

Crear `monitoring/prometheus/prometheus.yml` con:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'erp-api'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['localhost:3002']
```

2. **Iniciar Prometheus:**

```powershell
docker run -d \
  -p 9090:9090 \
  -v ${PWD}/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

3. **Verificar en Prometheus:**

Ir a: http://localhost:9090/targets

Deberías ver `erp-api` con estado "UP"

## 🚀 Iniciar Sistema Completo (Opcional - 10 minutos)

Si quieres Prometheus + Grafana + Dashboards:

```powershell
# 1. Instalar dependencias
cd apps/erp-api
pnpm install
cd ../..

# 2. Iniciar todo con Docker Compose
docker-compose up -d

# 3. Verificar
.\scripts\verify-monitoring.ps1
```

Acceder a:
- API: http://localhost:3002
- Métricas: http://localhost:3002/api/metrics
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

## ⚠️ Notas Importantes

### Puerto Correcto

Tu API está corriendo en el **puerto 3002**, no 3001. Asegúrate de:

1. Actualizar `monitoring/prometheus/prometheus.yml`:
```yaml
- targets: ['erp-api:3002']  # Cambiar de 3001 a 3002
```

2. O si Prometheus corre en el host:
```yaml
- targets: ['localhost:3002']  # Cambiar de 3001 a 3002
```

### Ruta Correcta

Prometheus está intentando acceder a `/api/v1/metrics` pero la ruta correcta es `/api/metrics`.

Actualizar en `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'erp-api'
    metrics_path: '/api/metrics'  # ✅ Correcto
    # NO usar: '/api/v1/metrics'  # ❌ Incorrecto
```

## 🔧 Troubleshooting

### Problema: Dependencias no se instalan

```powershell
# Limpiar cache y reinstalar
cd apps/erp-api
rm -rf node_modules
pnpm install --force
```

### Problema: El endpoint sigue dando 404

```powershell
# 1. Verificar que el módulo esté importado
# Abrir: apps/erp-api/src/app.module.ts
# Debe tener: import { MetricsModule } from './modules/metrics/metrics.module';
# Y en imports: MetricsModule,

# 2. Verificar logs de inicio
# Debe aparecer: "Nest application successfully started"

# 3. Reiniciar completamente
docker-compose down
docker-compose up -d --build
```

### Problema: Prometheus no puede conectarse

```powershell
# 1. Verificar que la API responda
curl http://localhost:3002/api/health

# 2. Verificar que las métricas respondan
curl http://localhost:3002/api/metrics

# 3. Verificar configuración de Prometheus
docker-compose logs prometheus

# 4. Verificar que el puerto sea correcto (3002, no 3001)
```

## 📋 Checklist Rápido

- [ ] Ejecutar `pnpm install` en `apps/erp-api`
- [ ] Reiniciar la API
- [ ] Verificar `curl http://localhost:3002/api/metrics`
- [ ] Actualizar puerto en `prometheus.yml` (3002)
- [ ] Actualizar ruta en `prometheus.yml` (`/api/metrics`)
- [ ] Reiniciar Prometheus si está corriendo
- [ ] Verificar targets en http://localhost:9090/targets

## ✅ Resultado Esperado

Después de seguir estos pasos:

```powershell
# Este comando debe funcionar:
curl http://localhost:3002/api/metrics

# Y debe retornar métricas en formato Prometheus:
# HELP erp_http_requests_total Total de requests HTTP
# TYPE erp_http_requests_total counter
erp_http_requests_total{...} 123
...
```

Y en los logs de Prometheus ya no deberías ver el error 404.

## 🆘 Si Nada Funciona

1. **Verificar archivos creados:**
```powershell
# Deben existir estos archivos:
ls apps/erp-api/src/modules/metrics/metrics.service.ts
ls apps/erp-api/src/modules/metrics/metrics.controller.ts
ls apps/erp-api/src/modules/metrics/metrics.module.ts
```

2. **Verificar package.json:**
```powershell
# Debe contener:
cat apps/erp-api/package.json | grep "prom-client"
cat apps/erp-api/package.json | grep "nestjs-prometheus"
```

3. **Verificar app.module.ts:**
```powershell
# Debe importar MetricsModule
cat apps/erp-api/src/app.module.ts | grep "MetricsModule"
```

4. **Logs completos:**
```powershell
# Ver logs de la API
docker-compose logs -f erp-api

# Buscar errores de inicio
docker-compose logs erp-api | grep -i error
```

---

**¡Con estos pasos el error 404 debería estar resuelto! 🎉**
