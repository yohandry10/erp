# 📊 Tabla event_processing_log - Documentación de Uso

## 📋 Descripción

La tabla `event_processing_log` registra el procesamiento de eventos por parte de workers y listeners, proporcionando trazabilidad completa del flujo de eventos en el sistema.

## 🗂️ Estructura de la Tabla

```sql
CREATE TABLE event_processing_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  event_id VARCHAR NOT NULL,
  processor_name VARCHAR NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Columnas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único del log |
| `tenant_id` | UUID | ID del tenant (multi-tenancy) |
| `event_id` | VARCHAR | ID del evento procesado (referencia a outbox_events o venta_id) |
| `processor_name` | VARCHAR | Nombre del worker/listener que procesó el evento |
| `started_at` | TIMESTAMPTZ | Timestamp de inicio del procesamiento |
| `completed_at` | TIMESTAMPTZ | Timestamp de finalización (NULL si aún está procesando) |
| `status` | VARCHAR | Estado: PROCESSING, COMPLETED, FAILED |
| `error_details` | JSONB | Detalles del error si falló |

### Estados Posibles

- `PROCESSING` - El evento está siendo procesado actualmente
- `COMPLETED` - El evento se procesó exitosamente
- `FAILED` - El evento falló durante el procesamiento

## 🔄 Procesadores Implementados

### 1. ContabilidadEventsListener

**Archivo:** `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts`

**Eventos que procesa:**
- `venta.procesada` → Genera asiento de venta
- `cobro.registrado` → Genera asiento de cobro
- `recepcion.registrada` → Genera asiento de compra
- `cxc.creada` → Genera asiento de cuenta por cobrar
- `pago.proveedor.registrado` → Genera asiento de pago
- `ajuste.inventario.aplicado` → Genera asiento de ajuste
- `planilla.liquidada` → Genera asiento de planilla
- `depreciacion.generada` → Genera asiento de depreciación
- `cpe.anulado` → Genera asiento de reversión

**Ejemplo de log:**
```typescript
// Inicio
await this.supabaseService.getClient()
  .from('event_processing_log')
  .insert({
    tenant_id: tenantId,
    event_id: evento.event_id,
    processor_name: 'ContabilidadEventsListener',
    started_at: new Date().toISOString(),
    status: 'PROCESSING',
  });

// Éxito
await this.supabaseService.getClient()
  .from('event_processing_log')
  .update({
    completed_at: new Date().toISOString(),
    status: 'COMPLETED',
  })
  .eq('id', logId);

// Error
await this.supabaseService.getClient()
  .from('event_processing_log')
  .update({
    completed_at: new Date().toISOString(),
    status: 'FAILED',
    error_details: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
  })
  .eq('id', logId);
```

### 2. PosCpeRetryWorker

**Archivo:** `apps/worker/src/jobs/pos-cpe-retry.job.ts`

**Eventos que procesa:**
- Ventas POS con `cpe_pendiente = true`
- Reintentos de facturación electrónica

**Ejemplo de log:**
```typescript
// Inicio
const { data: logEntry } = await supabase
  .from('event_processing_log')
  .insert({
    tenant_id: venta.tenant_id,
    event_id: venta.id,
    processor_name: 'PosCpeRetryWorker',
    started_at: new Date().toISOString(),
    status: 'PROCESSING',
  })
  .select('id')
  .single();

// Éxito
await supabase
  .from('event_processing_log')
  .update({
    completed_at: new Date().toISOString(),
    status: 'COMPLETED',
  })
  .eq('id', logId);

// Error
await supabase
  .from('event_processing_log')
  .update({
    completed_at: new Date().toISOString(),
    status: 'FAILED',
    error_details: {
      message: errorMessage,
      intento: intentoActual,
      max_intentos: 5,
    },
  })
  .eq('id', logId);
```

## 📊 Consultas Útiles

### Ver eventos procesados recientemente

```sql
SELECT 
  epl.id,
  epl.tenant_id,
  epl.event_id,
  epl.processor_name,
  epl.status,
  epl.started_at,
  epl.completed_at,
  EXTRACT(EPOCH FROM (epl.completed_at - epl.started_at)) as duration_seconds,
  epl.error_details
FROM event_processing_log epl
ORDER BY epl.started_at DESC
LIMIT 50;
```

### Ver eventos fallidos

```sql
SELECT 
  epl.id,
  epl.tenant_id,
  epl.event_id,
  epl.processor_name,
  epl.started_at,
  epl.error_details->>'message' as error_message
FROM event_processing_log epl
WHERE epl.status = 'FAILED'
ORDER BY epl.started_at DESC
LIMIT 20;
```

### Ver estadísticas por procesador

```sql
SELECT 
  processor_name,
  COUNT(*) as total_eventos,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') as completados,
  COUNT(*) FILTER (WHERE status = 'FAILED') as fallidos,
  COUNT(*) FILTER (WHERE status = 'PROCESSING') as en_proceso,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 2) as avg_duration_seconds
FROM event_processing_log
GROUP BY processor_name
ORDER BY total_eventos DESC;
```

### Ver eventos en proceso (posibles colgados)

```sql
SELECT 
  epl.id,
  epl.tenant_id,
  epl.event_id,
  epl.processor_name,
  epl.started_at,
  EXTRACT(EPOCH FROM (NOW() - epl.started_at)) as seconds_processing
FROM event_processing_log epl
WHERE epl.status = 'PROCESSING'
  AND epl.started_at < NOW() - INTERVAL '5 minutes'
ORDER BY epl.started_at ASC;
```

### Ver tasa de éxito por tenant

```sql
SELECT 
  epl.tenant_id,
  ec.razon_social,
  COUNT(*) as total_eventos,
  COUNT(*) FILTER (WHERE epl.status = 'COMPLETED') as completados,
  COUNT(*) FILTER (WHERE epl.status = 'FAILED') as fallidos,
  ROUND(100.0 * COUNT(*) FILTER (WHERE epl.status = 'COMPLETED') / COUNT(*), 2) as tasa_exito
FROM event_processing_log epl
LEFT JOIN empresa_config ec ON ec.tenant_id = epl.tenant_id
WHERE epl.started_at > NOW() - INTERVAL '7 days'
GROUP BY epl.tenant_id, ec.razon_social
ORDER BY total_eventos DESC;
```

### Ver eventos por tipo (últimos 7 días)

```sql
SELECT 
  oe.event_type,
  COUNT(*) as total_eventos,
  COUNT(*) FILTER (WHERE epl.status = 'COMPLETED') as completados,
  COUNT(*) FILTER (WHERE epl.status = 'FAILED') as fallidos,
  ROUND(AVG(EXTRACT(EPOCH FROM (epl.completed_at - epl.started_at))), 2) as avg_duration_seconds
FROM event_processing_log epl
JOIN outbox_events oe ON oe.event_id = epl.event_id::UUID
WHERE epl.started_at > NOW() - INTERVAL '7 days'
GROUP BY oe.event_type
ORDER BY total_eventos DESC;
```

## 🔧 Mantenimiento

### Limpieza de Logs Antiguos

Se recomienda limpiar logs antiguos periódicamente:

```sql
-- Eliminar logs de más de 90 días
DELETE FROM event_processing_log
WHERE started_at < NOW() - INTERVAL '90 days';

-- O archivar en tabla de histórico
INSERT INTO event_processing_log_archive
SELECT * FROM event_processing_log
WHERE started_at < NOW() - INTERVAL '90 days';

DELETE FROM event_processing_log
WHERE started_at < NOW() - INTERVAL '90 days';
```

### Índices Recomendados

```sql
-- Índice por tenant y fecha (para consultas filtradas)
CREATE INDEX IF NOT EXISTS idx_event_processing_log_tenant_started 
ON event_processing_log(tenant_id, started_at DESC);

-- Índice por status (para buscar fallidos o en proceso)
CREATE INDEX IF NOT EXISTS idx_event_processing_log_status 
ON event_processing_log(status, started_at DESC);

-- Índice por procesador (para estadísticas)
CREATE INDEX IF NOT EXISTS idx_event_processing_log_processor 
ON event_processing_log(processor_name, started_at DESC);

-- Índice por event_id (para buscar logs de un evento específico)
CREATE INDEX IF NOT EXISTS idx_event_processing_log_event_id 
ON event_processing_log(event_id);
```

## 🎯 Casos de Uso

### 1. Monitoreo de Salud del Sistema

```sql
-- Ver si hay eventos colgados
SELECT COUNT(*) as eventos_colgados
FROM event_processing_log
WHERE status = 'PROCESSING'
  AND started_at < NOW() - INTERVAL '10 minutes';
```

### 2. Análisis de Performance

```sql
-- Ver procesadores más lentos
SELECT 
  processor_name,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 2) as avg_seconds,
  MAX(EXTRACT(EPOCH FROM (completed_at - started_at))) as max_seconds
FROM event_processing_log
WHERE status = 'COMPLETED'
  AND started_at > NOW() - INTERVAL '24 hours'
GROUP BY processor_name
ORDER BY avg_seconds DESC;
```

### 3. Detección de Problemas

```sql
-- Ver errores recurrentes
SELECT 
  processor_name,
  error_details->>'message' as error_message,
  COUNT(*) as ocurrencias
FROM event_processing_log
WHERE status = 'FAILED'
  AND started_at > NOW() - INTERVAL '24 hours'
GROUP BY processor_name, error_details->>'message'
ORDER BY ocurrencias DESC;
```

### 4. Auditoría de Eventos

```sql
-- Ver historial completo de un evento específico
SELECT 
  epl.id,
  epl.processor_name,
  epl.status,
  epl.started_at,
  epl.completed_at,
  EXTRACT(EPOCH FROM (epl.completed_at - epl.started_at)) as duration_seconds,
  epl.error_details
FROM event_processing_log epl
WHERE epl.event_id = 'uuid-del-evento'
ORDER BY epl.started_at DESC;
```

## 🚨 Alertas Recomendadas

### 1. Eventos Colgados

```sql
-- Alerta si hay eventos procesando por más de 10 minutos
SELECT COUNT(*) as eventos_colgados
FROM event_processing_log
WHERE status = 'PROCESSING'
  AND started_at < NOW() - INTERVAL '10 minutes';
```

**Acción:** Investigar y posiblemente reiniciar el worker

### 2. Tasa de Error Alta

```sql
-- Alerta si más del 20% de eventos fallan en las últimas 24 horas
SELECT 
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'FAILED') / COUNT(*), 2) as tasa_error
FROM event_processing_log
WHERE started_at > NOW() - INTERVAL '24 hours';
```

**Acción:** Revisar configuración o errores recurrentes

### 3. Procesamiento Lento

```sql
-- Alerta si el tiempo promedio de procesamiento supera 30 segundos
SELECT 
  processor_name,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 2) as avg_seconds
FROM event_processing_log
WHERE status = 'COMPLETED'
  AND started_at > NOW() - INTERVAL '1 hour'
GROUP BY processor_name
HAVING AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) > 30;
```

**Acción:** Optimizar el procesador lento

## 📝 Mejores Prácticas

### 1. Siempre Registrar Inicio

```typescript
const { data: logEntry } = await supabase
  .from('event_processing_log')
  .insert({
    tenant_id: tenantId,
    event_id: eventId,
    processor_name: 'MiProcessor',
    started_at: new Date().toISOString(),
    status: 'PROCESSING',
  })
  .select('id')
  .single();

const logId = logEntry?.id;
```

### 2. Actualizar al Finalizar

```typescript
// Éxito
await supabase
  .from('event_processing_log')
  .update({
    completed_at: new Date().toISOString(),
    status: 'COMPLETED',
  })
  .eq('id', logId);

// Error
await supabase
  .from('event_processing_log')
  .update({
    completed_at: new Date().toISOString(),
    status: 'FAILED',
    error_details: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
  })
  .eq('id', logId);
```

### 3. Manejar Errores de Logging

```typescript
try {
  logId = await registrarInicioProcesamiento(evento, tenantId);
} catch (error) {
  // No bloquear el procesamiento si falla el logging
  logger.warn('⚠️ No se pudo registrar en event_processing_log:', error);
}
```

## 🔗 Integración con Otros Sistemas

### Prometheus Metrics

```typescript
// Exportar métricas desde event_processing_log
const metrics = await supabase
  .from('event_processing_log')
  .select('processor_name, status')
  .gte('started_at', new Date(Date.now() - 3600000).toISOString());

// Convertir a métricas de Prometheus
const completedCount = metrics.filter(m => m.status === 'COMPLETED').length;
const failedCount = metrics.filter(m => m.status === 'FAILED').length;
```

### Grafana Dashboard

Crear dashboard con:
- Gráfico de eventos procesados por hora
- Tasa de éxito/error por procesador
- Tiempo promedio de procesamiento
- Alertas de eventos colgados

## 📚 Referencias

- `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts`
- `apps/worker/src/jobs/pos-cpe-retry.job.ts`
- `TABLES.md` - Estructura de tablas
- `TABLAS_RLS_TRIGGERS_FUNCTIONS.md` - RLS y triggers

## ✅ Estado Actual

- ✅ Tabla creada y con RLS habilitado
- ✅ Implementado en ContabilidadEventsListener
- ✅ Implementado en PosCpeRetryWorker
- ✅ Documentación completa
- ⚠️ Pendiente: Agregar a otros workers/listeners según necesidad

## 🎯 Próximos Pasos

1. Agregar logging a otros workers (GRE, SIRE, etc.)
2. Crear dashboard de monitoreo en Grafana
3. Configurar alertas automáticas
4. Implementar limpieza automática de logs antiguos
