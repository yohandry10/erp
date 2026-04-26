# Guía de Alertas RLS

## Descripción General

El sistema de alertas RLS proporciona notificaciones en tiempo real sobre intentos de violación de seguridad multi-tenant. Las alertas se activan automáticamente cuando se detectan patrones sospechosos de acceso a datos.

## Tipos de Alertas Configuradas

### 1. Critical Cross-Tenant
**Severidad:** CRÍTICA  
**Condición:** Intento de acceso a datos de otro tenant  
**Acción:** Alerta inmediata

```sql
-- Ejemplo de violación que dispara esta alerta
-- Usuario del tenant A intenta acceder a datos del tenant B
```

### 2. Missing Tenant Context
**Severidad:** CRÍTICA  
**Condición:** Operación sin contexto de tenant en la sesión  
**Acción:** Alerta inmediata

### 3. Repeated Violations
**Severidad:** WARNING  
**Condición:** 5+ violaciones del mismo usuario en 15 minutos  
**Acción:** Alerta de patrón sospechoso

### 4. Table Under Attack
**Severidad:** CRÍTICA  
**Condición:** 10+ intentos de acceso a una tabla en 10 minutos  
**Acción:** Alerta de posible ataque

## Canales de Notificación

### PostgreSQL NOTIFY
Las alertas se envían a través del canal `rls_alert` de PostgreSQL.

**Escuchar alertas en tiempo real:**
```sql
LISTEN rls_alert;
```

**Payload de notificación:**
```json
{
  "alert_id": "uuid",
  "alert_name": "critical_cross_tenant",
  "severity": "CRITICAL",
  "message": "Intento de acceso cross-tenant detectado en tabla cuentas_por_pagar",
  "violation_count": 1,
  "affected_table": "cuentas_por_pagar",
  "user_email": "usuario@ejemplo.com",
  "timestamp": "2025-10-24T10:30:00Z"
}
```

### PostgreSQL Logs
Las alertas también se registran en los logs de PostgreSQL con nivel WARNING:

```
[RLS ALERT] critical_cross_tenant - Intento de acceso cross-tenant detectado en tabla cuentas_por_pagar (Severity: CRITICAL, Violations: 1, Table: cuentas_por_pagar, User: usuario@ejemplo.com)
```

## Vistas de Monitoreo

### Alertas Recientes (24 horas)
```sql
SELECT * FROM v_rls_alerts_recent;
```

**Columnas:**
- `triggered_at`: Momento de la alerta
- `alert_name`: Nombre de la alerta
- `severity`: Nivel de severidad
- `message`: Mensaje descriptivo
- `violation_count`: Número de violaciones
- `affected_table`: Tabla afectada
- `user_email`: Usuario involucrado
- `acknowledged`: Si fue reconocida

### Alertas Sin Reconocer
```sql
SELECT * FROM v_rls_alerts_unacknowledged;
```

**Columnas adicionales:**
- `minutes_since_trigger`: Tiempo transcurrido desde la alerta

### Resumen de Alertas (7 días)
```sql
SELECT * FROM v_rls_alerts_summary;
```

**Métricas por tipo de alerta:**
- Total de alertas
- Alertas críticas
- Alertas warning
- Alertas sin reconocer
- Primera y última alerta

## Gestión de Alertas

### Reconocer una Alerta
```sql
SELECT acknowledge_rls_alert('alert-uuid');
```

Marca una alerta como reconocida y registra quién y cuándo la reconoció.

### Habilitar/Deshabilitar Alertas
```sql
-- Deshabilitar temporalmente una alerta
SELECT disable_rls_alert('repeated_violations');

-- Habilitar nuevamente
SELECT enable_rls_alert('repeated_violations');
```

### Obtener Estadísticas
```sql
-- Estadísticas de los últimos 7 días
SELECT * FROM get_alert_statistics(7);

-- Estadísticas de los últimos 30 días
SELECT * FROM get_alert_statistics(30);
```

**Métricas incluidas:**
- Total de alertas
- Alertas críticas
- Alertas sin reconocer
- Tiempo promedio de respuesta
- Alerta más común

## Integración con Aplicaciones

### Node.js / TypeScript

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

// Escuchar alertas en tiempo real
const channel = supabase
  .channel('rls-alerts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'rls_alert_history'
  }, (payload) => {
    console.error('🚨 RLS Alert:', payload.new);
    
    // Enviar a sistema de monitoreo externo
    sendToMonitoring(payload.new);
    
    // Notificar a administradores
    notifyAdmins(payload.new);
  })
  .subscribe();

// Consultar alertas sin reconocer
async function checkUnacknowledgedAlerts() {
  const { data, error } = await supabase
    .from('v_rls_alerts_unacknowledged')
    .select('*')
    .order('triggered_at', { ascending: false });
  
  if (data && data.length > 0) {
    console.warn(`⚠️ ${data.length} alertas sin reconocer`);
  }
}

// Reconocer alerta
async function acknowledgeAlert(alertId: string) {
  const { data, error } = await supabase
    .rpc('acknowledge_rls_alert', { p_alert_id: alertId });
  
  if (error) {
    console.error('Error al reconocer alerta:', error);
  }
}
```

### Python

```python
from supabase import create_client

supabase = create_client(url, key)

# Consultar alertas recientes
def get_recent_alerts():
    response = supabase.table('v_rls_alerts_recent').select('*').execute()
    return response.data

# Reconocer alerta
def acknowledge_alert(alert_id):
    response = supabase.rpc('acknowledge_rls_alert', {
        'p_alert_id': alert_id
    }).execute()
    return response.data
```

## Dashboard de Monitoreo

### Consulta para Dashboard en Tiempo Real

```sql
-- Alertas de la última hora
SELECT 
  DATE_TRUNC('minute', triggered_at) AS minute,
  COUNT(*) AS alert_count,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count
FROM rls_alert_history
WHERE triggered_at > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', triggered_at)
ORDER BY minute DESC;

-- Top usuarios con más alertas
SELECT 
  user_email,
  COUNT(*) AS total_alerts,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_alerts,
  MAX(triggered_at) AS last_alert
FROM rls_alert_history
WHERE triggered_at > NOW() - INTERVAL '24 hours'
  AND user_email IS NOT NULL
GROUP BY user_email
ORDER BY total_alerts DESC
LIMIT 10;

-- Tablas más atacadas
SELECT 
  affected_table,
  COUNT(*) AS attack_count,
  MAX(triggered_at) AS last_attack
FROM rls_alert_history
WHERE triggered_at > NOW() - INTERVAL '24 hours'
  AND affected_table IS NOT NULL
GROUP BY affected_table
ORDER BY attack_count DESC
LIMIT 10;
```

## Mantenimiento

### Limpieza de Alertas Antiguas

```sql
-- Eliminar alertas reconocidas más antiguas que 90 días
SELECT cleanup_old_rls_alerts(90);

-- Eliminar alertas reconocidas más antiguas que 30 días
SELECT cleanup_old_rls_alerts(30);
```

**Recomendación:** Ejecutar mensualmente mediante un job programado.

### Configurar Job de Limpieza Automática

```sql
-- Usando pg_cron (si está disponible)
SELECT cron.schedule(
  'cleanup-old-rls-alerts',
  '0 2 1 * *', -- Primer día de cada mes a las 2 AM
  $$SELECT cleanup_old_rls_alerts(90);$$
);
```

## Troubleshooting

### No se reciben alertas

1. **Verificar que las alertas estén habilitadas:**
```sql
SELECT alert_name, enabled FROM rls_alert_config;
```

2. **Verificar que el trigger esté activo:**
```sql
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trg_rls_alert';
```

3. **Verificar logs de PostgreSQL:**
```bash
# Buscar alertas en logs
grep "RLS ALERT" /var/log/postgresql/postgresql.log
```

### Demasiadas alertas (falsos positivos)

1. **Ajustar umbrales de alertas:**
```sql
UPDATE rls_alert_config
SET min_violations_count = 10,
    time_window_minutes = 30
WHERE alert_name = 'repeated_violations';
```

2. **Deshabilitar temporalmente alertas específicas:**
```sql
SELECT disable_rls_alert('repeated_violations');
```

### Alertas no se reconocen

Verificar permisos:
```sql
GRANT EXECUTE ON FUNCTION acknowledge_rls_alert(UUID, UUID) TO authenticated;
```

## Mejores Prácticas

1. **Revisar alertas diariamente:** Consultar `v_rls_alerts_unacknowledged` al inicio del día
2. **Investigar patrones:** Usar `v_rls_alerts_summary` para identificar tendencias
3. **Responder rápidamente:** Reconocer alertas críticas en menos de 1 hora
4. **Ajustar umbrales:** Modificar configuraciones según el comportamiento real del sistema
5. **Integrar con monitoreo:** Enviar alertas críticas a sistemas como Datadog, New Relic, etc.
6. **Documentar incidentes:** Agregar notas en el campo `details` al investigar alertas

## Métricas de Éxito

- **Tiempo de respuesta:** < 1 hora para alertas críticas
- **Tasa de reconocimiento:** > 95% de alertas reconocidas en 24 horas
- **Falsos positivos:** < 5% del total de alertas
- **Cobertura:** 100% de tablas críticas monitoreadas

## Soporte

Para reportar problemas o sugerir mejoras al sistema de alertas:
1. Revisar logs de PostgreSQL
2. Consultar `v_rls_alerts_summary` para contexto
3. Documentar el comportamiento esperado vs actual
4. Contactar al equipo de seguridad
