# 🚀 Configuración de Monitoreo - ERP Suite

## 📋 Resumen

Se ha implementado un sistema completo de monitoreo con **Prometheus** y **Grafana** para el ERP Suite.

### ✅ Lo que se ha configurado:

1. **Módulo de Métricas** (`apps/erp-api/src/modules/metrics/`)
   - MetricsService: Servicio para registrar métricas personalizadas
   - MetricsController: Endpoints para consultar métricas
   - MetricsInterceptor: Interceptor automático para métricas HTTP

2. **Prometheus** (`monitoring/prometheus/`)
   - Configuración de scraping
   - Reglas de alertas
   - Targets configurados para API, Worker, Redis, PostgreSQL

3. **Grafana** (`monitoring/grafana/`)
   - Datasource de Prometheus pre-configurado
   - 3 Dashboards listos para usar:
     - ERP Overview
     - Métricas de Negocio
     - Salud del Sistema

4. **Docker Compose**
   - Prometheus (puerto 9090)
   - Grafana (puerto 3000)
   - Redis Exporter (puerto 9121)
   - Node Exporter (puerto 9100)

5. **Documentación**
   - README completo de monitoreo
   - Guía de integración de métricas
   - Scripts de setup y verificación

## 🚀 Inicio Rápido

### Paso 1: Instalar Dependencias

```powershell
cd apps/erp-api
pnpm install
```

### Paso 2: Ejecutar Script de Setup

```powershell
# Desde la raíz del proyecto
.\scripts\setup-monitoring.ps1
```

Este script:
- ✅ Verifica Docker y Docker Compose
- ✅ Instala dependencias de Node
- ✅ Crea directorios necesarios
- ✅ Inicia todos los servicios
- ✅ Verifica que todo funcione

### Paso 3: Verificar Instalación

```powershell
.\scripts\verify-monitoring.ps1
```

Este script verifica:
- ✅ Contenedores Docker corriendo
- ✅ Endpoints HTTP respondiendo
- ✅ Métricas expuestas correctamente
- ✅ Targets de Prometheus activos
- ✅ Datasource de Grafana configurado

## 🌐 URLs de Acceso

Una vez iniciado, accede a:

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| **ERP API** | http://localhost:3001 | - |
| **API Docs** | http://localhost:3001/api/docs | - |
| **Métricas** | http://localhost:3001/api/metrics | - |
| **Prometheus** | http://localhost:9090 | - |
| **Grafana** | http://localhost:3000 | admin / admin |

## 📊 Métricas Disponibles

### Métricas HTTP
- `erp_http_requests_total` - Total de requests
- `erp_http_request_duration_seconds` - Latencia de requests
- `erp_http_request_errors_total` - Errores HTTP

### Métricas de Negocio
- `erp_ordenes_compra_creadas_total` - Órdenes de compra
- `erp_facturas_emitidas_total` - Facturas emitidas
- `erp_pagos_registrados_total` - Pagos registrados
- `erp_inventario_movimientos_total` - Movimientos de inventario

### Métricas de Sistema
- `process_cpu_user_seconds_total` - Uso de CPU
- `process_resident_memory_bytes` - Memoria usada
- `nodejs_heap_size_total_bytes` - Heap de Node.js
- `erp_cache_hits_total` / `erp_cache_misses_total` - Cache

### Métricas de Base de Datos
- `erp_db_query_duration_seconds` - Duración de queries
- `erp_db_connections_active` - Conexiones activas
- `erp_db_errors_total` - Errores de DB

## 📈 Dashboards de Grafana

### 1. ERP Overview
Vista general del sistema con:
- Requests por segundo
- Latencia P95
- Tasa de errores
- Uso de memoria
- KPIs de negocio

### 2. Métricas de Negocio
Métricas específicas del negocio:
- Órdenes de compra por estado
- Facturas por tipo
- Pagos por método
- Actividad por tenant

### 3. Salud del Sistema
Métricas técnicas:
- Performance HTTP
- Uso de recursos (CPU, memoria)
- Duración de queries DB
- Cache hit rate
- Event loop lag

## 🔔 Alertas Configuradas

Las alertas están en `monitoring/prometheus/alerts/erp-alerts.yml`:

### Críticas
- **ERPApiDown**: API caída > 1 minuto
- **DatabaseErrors**: Errores en DB

### Warnings
- **HighErrorRate**: Tasa de errores > 5%
- **HighLatency**: P95 > 2 segundos
- **HighMemoryUsage**: Memoria > 2GB
- **SlowDatabaseQueries**: P95 queries > 1 segundo
- **LowCacheHitRate**: Cache hit rate < 70%

## 🔧 Integración en Servicios

Para agregar métricas a tus servicios:

```typescript
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class MiServicio {
  constructor(
    private readonly metricsService: MetricsService,
  ) {}

  async miMetodo() {
    // Tu lógica
    const resultado = await this.hacerAlgo();
    
    // Registrar métrica
    this.metricsService.recordOrdenCompraCreada(
      tenantId,
      'APROBADA'
    );
    
    return resultado;
  }
}
```

Ver guía completa en: `docs/GUIA_INTEGRACION_METRICAS.md`

## 🛠️ Comandos Útiles

```powershell
# Ver logs de todos los servicios
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f prometheus
docker-compose logs -f grafana
docker-compose logs -f erp-api

# Reiniciar servicios
docker-compose restart

# Detener servicios
docker-compose down

# Reconstruir y reiniciar
docker-compose up -d --build

# Ver métricas en tiempo real
curl http://localhost:3001/api/metrics

# Ver resumen de métricas de negocio
curl http://localhost:3001/api/metrics/summary

# Ver métricas de salud
curl http://localhost:3001/api/metrics/health
```

## 🔍 Troubleshooting

### Problema: Prometheus no puede conectarse a la API

**Solución:**
```powershell
# 1. Verificar que la API esté corriendo
curl http://localhost:3001/api/health

# 2. Verificar endpoint de métricas
curl http://localhost:3001/api/metrics

# 3. Ver logs de Prometheus
docker-compose logs prometheus

# 4. Verificar targets en Prometheus
# Ir a: http://localhost:9090/targets
```

### Problema: Grafana no muestra datos

**Solución:**
```powershell
# 1. Verificar que Prometheus esté recolectando datos
# Ir a: http://localhost:9090/targets
# Todos los targets deben estar "UP"

# 2. Verificar datasource en Grafana
# Settings → Data Sources → Prometheus
# Click "Test" debe mostrar "Data source is working"

# 3. Ejecutar query de prueba en Prometheus
# http://localhost:9090/graph
# Query: erp_http_requests_total
```

### Problema: No aparecen métricas de negocio

**Causa:** Las métricas de negocio solo aparecen cuando ocurren eventos.

**Solución:** Generar actividad en el sistema:
```powershell
# Crear una orden de compra, emitir una factura, etc.
# Las métricas aparecerán automáticamente
```

## 📚 Documentación Adicional

- **Monitoreo completo**: `monitoring/README.md`
- **Guía de integración**: `docs/GUIA_INTEGRACION_METRICAS.md`
- **Prometheus Docs**: https://prometheus.io/docs/
- **Grafana Docs**: https://grafana.com/docs/

## 🔐 Seguridad en Producción

### Antes de ir a producción:

1. **Cambiar credenciales de Grafana**
   ```yaml
   # docker-compose.yml
   - GF_SECURITY_ADMIN_PASSWORD=TU_PASSWORD_SEGURO
   ```

2. **Habilitar autenticación en Prometheus**
   - Configurar basic auth
   - Usar reverse proxy con autenticación

3. **Restringir acceso por IP**
   - Configurar firewall
   - Usar VPN para acceso a métricas

4. **Habilitar HTTPS**
   - Configurar certificados SSL
   - Usar reverse proxy (nginx, traefik)

5. **No exponer métricas sensibles**
   - No incluir PII en labels
   - No exponer credenciales
   - Sanitizar datos financieros

## ✅ Checklist de Verificación

- [ ] Docker y Docker Compose instalados
- [ ] Dependencias de Node instaladas (`pnpm install`)
- [ ] Servicios iniciados (`docker-compose up -d`)
- [ ] API respondiendo en http://localhost:3001
- [ ] Métricas expuestas en http://localhost:3001/api/metrics
- [ ] Prometheus accesible en http://localhost:9090
- [ ] Grafana accesible en http://localhost:3000
- [ ] Todos los targets en Prometheus están "UP"
- [ ] Dashboards de Grafana cargados correctamente
- [ ] Métricas aparecen en Grafana

## 🎯 Próximos Pasos

1. **Integrar métricas en servicios existentes**
   - Seguir guía en `docs/GUIA_INTEGRACION_METRICAS.md`
   - Agregar métricas en servicios críticos

2. **Personalizar dashboards**
   - Crear dashboards específicos por módulo
   - Agregar paneles relevantes para tu negocio

3. **Configurar alertas**
   - Revisar alertas en `monitoring/prometheus/alerts/`
   - Agregar alertas específicas de negocio
   - Configurar notificaciones (email, Slack, etc.)

4. **Optimizar rendimiento**
   - Monitorear métricas de latencia
   - Identificar cuellos de botella
   - Optimizar queries lentas

5. **Documentar métricas personalizadas**
   - Documentar nuevas métricas agregadas
   - Mantener actualizada la documentación

## 💡 Consejos

- Revisa los dashboards regularmente para identificar patrones
- Configura alertas para problemas críticos
- Usa métricas para tomar decisiones de optimización
- Documenta métricas personalizadas que agregues
- Mantén las métricas simples y relevantes

## 🆘 Soporte

Si encuentras problemas:

1. Revisa los logs: `docker-compose logs [servicio]`
2. Verifica la documentación en `monitoring/README.md`
3. Ejecuta el script de verificación: `.\scripts\verify-monitoring.ps1`
4. Revisa la guía de troubleshooting arriba

---

**¡Sistema de monitoreo listo para usar! 🎉**
