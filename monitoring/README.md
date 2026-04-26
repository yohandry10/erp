# Sistema de Monitoreo ERP Suite

Sistema completo de monitoreo con Prometheus y Grafana para el ERP Suite.

## 🎯 Componentes

### Prometheus
- **Puerto**: 9090
- **URL**: http://localhost:9090
- **Función**: Recolección y almacenamiento de métricas

### Grafana
- **Puerto**: 3000
- **URL**: http://localhost:3000
- **Credenciales por defecto**:
  - Usuario: `admin`
  - Password: `admin`

### Redis Exporter
- **Puerto**: 9121
- **Función**: Exporta métricas de Redis a Prometheus

### Node Exporter
- **Puerto**: 9100
- **Función**: Exporta métricas del sistema (CPU, memoria, disco)

## 📊 Métricas Disponibles

### Métricas HTTP
- `erp_http_requests_total`: Total de requests HTTP
- `erp_http_request_duration_seconds`: Duración de requests
- `erp_http_request_errors_total`: Total de errores HTTP

### Métricas de Negocio
- `erp_ordenes_compra_creadas_total`: Órdenes de compra creadas
- `erp_facturas_emitidas_total`: Facturas emitidas
- `erp_pagos_registrados_total`: Pagos registrados
- `erp_inventario_movimientos_total`: Movimientos de inventario

### Métricas de Base de Datos
- `erp_db_query_duration_seconds`: Duración de queries
- `erp_db_connections_active`: Conexiones activas
- `erp_db_errors_total`: Errores de base de datos

### Métricas de Sistema
- `erp_cache_hits_total`: Cache hits
- `erp_cache_misses_total`: Cache misses
- `erp_queue_size`: Tamaño de colas

### Métricas por Defecto (Node.js)
- `process_cpu_user_seconds_total`: Uso de CPU
- `process_resident_memory_bytes`: Memoria usada
- `nodejs_heap_size_total_bytes`: Tamaño del heap
- `nodejs_heap_size_used_bytes`: Heap usado

## 🚀 Inicio Rápido

### 1. Instalar Dependencias
```bash
cd apps/erp-api
pnpm install
```

### 2. Iniciar Servicios
```bash
# Desde la raíz del proyecto
docker-compose up -d
```

### 3. Verificar Servicios

#### Verificar Prometheus
```bash
# Abrir en navegador
http://localhost:9090

# Verificar targets
http://localhost:9090/targets
```

#### Verificar Grafana
```bash
# Abrir en navegador
http://localhost:3000

# Login: admin / admin
```

#### Verificar Métricas de la API
```bash
# Endpoint de métricas Prometheus
curl http://localhost:3001/api/metrics

# Resumen de métricas de negocio
curl http://localhost:3001/api/metrics/summary

# Métricas de salud
curl http://localhost:3001/api/metrics/health
```

## 📈 Dashboards de Grafana

### Dashboard Principal: ERP Suite - Overview
Incluye:
- Requests por segundo
- Latencia P95
- Tasa de errores
- Uso de memoria
- Órdenes de compra creadas
- Facturas emitidas
- Pagos registrados
- Cache hit rate

### Crear Dashboard Personalizado

1. Ir a Grafana: http://localhost:3000
2. Login con admin/admin
3. Click en "+" → "Dashboard"
4. Click en "Add new panel"
5. Seleccionar métrica de Prometheus
6. Configurar visualización

## 🔔 Alertas

Las alertas están configuradas en `monitoring/prometheus/alerts/erp-alerts.yml`

### Alertas Configuradas

#### Críticas
- **ERPApiDown**: API caída por más de 1 minuto
- **DatabaseErrors**: Errores en base de datos

#### Warnings
- **HighErrorRate**: Tasa de errores > 5%
- **HighLatency**: P95 > 2 segundos
- **HighMemoryUsage**: Memoria > 2GB
- **SlowDatabaseQueries**: P95 de queries > 1 segundo
- **LowCacheHitRate**: Cache hit rate < 70%

### Ver Alertas Activas
```bash
# En Prometheus
http://localhost:9090/alerts
```

## 🔍 Queries Útiles de Prometheus

### Tasa de Requests
```promql
rate(erp_http_requests_total[5m])
```

### Latencia P95
```promql
histogram_quantile(0.95, 
  sum(rate(erp_http_request_duration_seconds_bucket[5m])) by (le)
)
```

### Tasa de Errores
```promql
sum(rate(erp_http_request_errors_total[5m])) 
/ 
sum(rate(erp_http_requests_total[5m]))
```

### Órdenes Creadas por Hora
```promql
sum(increase(erp_ordenes_compra_creadas_total[1h]))
```

### Cache Hit Rate
```promql
sum(rate(erp_cache_hits_total[5m])) 
/ 
(sum(rate(erp_cache_hits_total[5m])) + sum(rate(erp_cache_misses_total[5m])))
```

### Uso de Memoria
```promql
process_resident_memory_bytes / 1024 / 1024 / 1024
```

## 🛠️ Troubleshooting

### Prometheus no puede conectarse a la API

1. Verificar que la API esté corriendo:
```bash
curl http://localhost:3001/api/health
```

2. Verificar que el endpoint de métricas responda:
```bash
curl http://localhost:3001/api/metrics
```

3. Verificar logs de Prometheus:
```bash
docker-compose logs prometheus
```

### Grafana no muestra datos

1. Verificar que Prometheus esté recolectando datos:
```bash
# Ir a Prometheus
http://localhost:9090/targets

# Todos los targets deben estar "UP"
```

2. Verificar datasource en Grafana:
- Settings → Data Sources → Prometheus
- Click "Test" debe mostrar "Data source is working"

3. Verificar que haya datos en Prometheus:
```bash
# Ejecutar query en Prometheus
http://localhost:9090/graph

# Query: erp_http_requests_total
```

### No aparecen métricas de negocio

Las métricas de negocio solo aparecen cuando ocurren eventos. Para generar datos de prueba:

```bash
# Crear una orden de compra
curl -X POST http://localhost:3001/api/compras/ordenes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"proveedor_id": "...", "items": [...]}'

# Verificar métrica
curl http://localhost:3001/api/metrics | grep ordenes_compra
```

## 📝 Agregar Nuevas Métricas

### 1. En el Servicio de Métricas

```typescript
// apps/erp-api/src/modules/metrics/metrics.service.ts

// Definir métrica
private readonly miNuevaMetrica: Counter;

constructor() {
  this.miNuevaMetrica = new Counter({
    name: 'erp_mi_nueva_metrica_total',
    help: 'Descripción de la métrica',
    labelNames: ['label1', 'label2'],
  });
}

// Método para registrar
recordMiNuevaMetrica(label1: string, label2: string) {
  this.miNuevaMetrica.inc({ label1, label2 });
}
```

### 2. Usar en tu Servicio

```typescript
constructor(private readonly metricsService: MetricsService) {}

async miMetodo() {
  // Tu lógica
  
  // Registrar métrica
  this.metricsService.recordMiNuevaMetrica('valor1', 'valor2');
}
```

### 3. Crear Alerta (opcional)

```yaml
# monitoring/prometheus/alerts/erp-alerts.yml

- alert: MiNuevaAlerta
  expr: rate(erp_mi_nueva_metrica_total[5m]) > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Descripción de la alerta"
```

## 🔐 Seguridad en Producción

### Prometheus

1. Habilitar autenticación básica
2. Usar HTTPS
3. Restringir acceso por IP

### Grafana

1. Cambiar password de admin
2. Configurar OAuth/LDAP
3. Habilitar HTTPS
4. Configurar roles y permisos

### Métricas Sensibles

No exponer en métricas:
- Datos personales (PII)
- Credenciales
- Información financiera detallada
- IDs de usuarios específicos

## 📚 Referencias

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [NestJS Prometheus](https://github.com/willsoto/nestjs-prometheus)
- [Prom-client](https://github.com/siimon/prom-client)
