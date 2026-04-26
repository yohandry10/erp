# Sistema de Auditoría RLS

## Descripción General

El sistema de auditoría RLS registra automáticamente todos los intentos de acceso bloqueados por las políticas de Row Level Security (RLS) en la base de datos. Esto permite detectar intentos de acceso cross-tenant, identificar patrones de ataque y mantener un registro completo de seguridad.

## Componentes

### 1. Tabla de Auditoría: `rls_audit_log`

Almacena todos los registros de intentos de violación RLS.

**Campos principales:**
- `id`: UUID único del registro
- `timestamp`: Fecha y hora del intento
- `user_id`, `user_email`, `user_role`: Información del usuario
- `attempted_tenant_id`: Tenant que se intentó acceder
- `actual_tenant_id`: Tenant real del usuario
- `table_name`: Tabla afectada
- `operation`: Tipo de operación (SELECT, INSERT, UPDATE, DELETE)
- `violation_type`: Tipo de violación (cross_tenant, missing_tenant, invalid_tenant)
- `severity`: Nivel de severidad (INFO, WARNING, CRITICAL)
- `ip_address`: Dirección IP del cliente
- `metadata`: Información adicional en formato JSON

### 2. Funciones

#### `log_rls_violation()`
Registra manualmente una violación RLS.

```sql
SELECT log_rls_violation(
  p_table_name := 'cuentas_por_pagar',
  p_operation := 'SELECT',
  p_attempted_tenant_id := 'uuid-tenant-2',
  p_violation_type := 'cross_tenant',
  p_severity := 'CRITICAL',
  p_metadata := '{"source": "api"}'::jsonb
);
```

#### `audit_rls_access()`
Trigger function que se ejecuta automáticamente antes de cada operación en tablas protegidas.

#### `add_rls_audit_trigger()`
Agrega el trigger de auditoría a una tabla específica.

```sql
SELECT add_rls_audit_trigger('nueva_tabla');
```

#### `cleanup_old_rls_audit_logs()`
Elimina registros de auditoría antiguos.

```sql
-- Eliminar registros más antiguos que 90 días
SELECT cleanup_old_rls_audit_logs(90);
```

#### `generate_rls_security_report()`
Genera un reporte de seguridad con métricas clave.

```sql
-- Reporte de los últimos 7 días
SELECT * FROM generate_rls_security_report(7);
```

### 3. Vistas de Monitoreo

#### `v_rls_violations_by_table`
Resumen de violaciones agrupadas por tabla.

```sql
SELECT * FROM v_rls_violations_by_table;
```

**Columnas:**
- `table_name`: Nombre de la tabla
- `total_violations`: Total de violaciones
- `unique_users`: Usuarios únicos involucrados
- `critical_count`: Violaciones críticas
- `warning_count`: Violaciones de advertencia
- `cross_tenant_count`: Intentos cross-tenant
- `missing_tenant_count`: Intentos sin tenant_id
- `last_violation`: Última violación registrada
- `first_violation`: Primera violación registrada

#### `v_rls_violations_recent`
Violaciones de las últimas 24 horas (límite 100 registros).

```sql
SELECT * FROM v_rls_violations_recent;
```

#### `v_rls_violations_by_user`
Usuarios con más intentos de violación.

```sql
SELECT * FROM v_rls_violations_by_user;
```

#### `v_rls_violations_hourly`
Tendencia de violaciones por hora (últimos 7 días).

```sql
SELECT * FROM v_rls_violations_hourly;
```

## Uso Común

### Monitoreo Diario

```sql
-- Ver violaciones del día
SELECT 
  timestamp,
  table_name,
  user_email,
  violation_type,
  severity
FROM rls_audit_log
WHERE timestamp > CURRENT_DATE
ORDER BY timestamp DESC;
```

### Detectar Ataques

```sql
-- Usuarios con múltiples intentos en corto tiempo
SELECT 
  user_email,
  COUNT(*) as attempts,
  MIN(timestamp) as first_attempt,
  MAX(timestamp) as last_attempt,
  ARRAY_AGG(DISTINCT table_name) as tables_targeted
FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND severity = 'CRITICAL'
GROUP BY user_email
HAVING COUNT(*) > 5
ORDER BY attempts DESC;
```

### Análisis de Seguridad

```sql
-- Tablas más atacadas
SELECT 
  table_name,
  COUNT(*) as total_attempts,
  COUNT(DISTINCT user_id) as unique_attackers,
  MAX(timestamp) as last_attempt
FROM rls_audit_log
WHERE severity = 'CRITICAL'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY table_name
ORDER BY total_attempts DESC
LIMIT 10;
```

### Investigar Usuario Específico

```sql
-- Historial completo de un usuario
SELECT 
  timestamp,
  table_name,
  operation,
  violation_type,
  severity,
  attempted_tenant_id,
  actual_tenant_id,
  ip_address
FROM rls_audit_log
WHERE user_email = 'usuario@ejemplo.com'
ORDER BY timestamp DESC;
```

## Alertas y Notificaciones

### Configurar Alerta Básica

```sql
-- Ejecutar periódicamente (cada hora)
DO $
DECLARE
  v_critical_count INTEGER;
  v_threshold INTEGER := 10;
BEGIN
  SELECT COUNT(*) INTO v_critical_count
  FROM rls_audit_log
  WHERE severity = 'CRITICAL'
    AND timestamp > NOW() - INTERVAL '1 hour';
  
  IF v_critical_count > v_threshold THEN
    RAISE WARNING 'ALERTA DE SEGURIDAD: % violaciones críticas en la última hora (umbral: %)', 
      v_critical_count, v_threshold;
    
    -- Aquí integrar con sistema de notificaciones
    -- Ejemplo: enviar email, Slack, PagerDuty, etc.
  END IF;
END;
$;
```

### Integración con pg_cron

```sql
-- Instalar pg_cron si no está instalado
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Programar limpieza automática (cada domingo a las 2 AM)
SELECT cron.schedule(
  'cleanup-rls-audit-logs',
  '0 2 * * 0',
  'SELECT cleanup_old_rls_audit_logs(90);'
);

-- Programar alerta de seguridad (cada hora)
SELECT cron.schedule(
  'rls-security-alert',
  '0 * * * *',
  $$
  DO $
  DECLARE
    v_critical_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_critical_count
    FROM rls_audit_log
    WHERE severity = 'CRITICAL'
      AND timestamp > NOW() - INTERVAL '1 hour';
    
    IF v_critical_count > 10 THEN
      RAISE WARNING 'ALERTA: % violaciones críticas detectadas', v_critical_count;
    END IF;
  END;
  $;
  $$
);
```

## Mantenimiento

### Limpieza Regular

```sql
-- Eliminar registros más antiguos que 90 días
SELECT cleanup_old_rls_audit_logs(90);
```

### Verificar Tamaño de la Tabla

```sql
SELECT 
  pg_size_pretty(pg_total_relation_size('rls_audit_log')) AS table_size,
  COUNT(*) AS total_records,
  MIN(timestamp) AS oldest_record,
  MAX(timestamp) AS newest_record
FROM rls_audit_log;
```

### Archivar Logs Antiguos

```sql
-- Crear tabla de archivo
CREATE TABLE rls_audit_log_archive (LIKE rls_audit_log INCLUDING ALL);

-- Mover registros antiguos
INSERT INTO rls_audit_log_archive
SELECT * FROM rls_audit_log
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Eliminar de la tabla principal
DELETE FROM rls_audit_log
WHERE timestamp < NOW() - INTERVAL '1 year';

-- Verificar
SELECT 
  'rls_audit_log' as table_name,
  COUNT(*) as records,
  pg_size_pretty(pg_total_relation_size('rls_audit_log')) as size
FROM rls_audit_log
UNION ALL
SELECT 
  'rls_audit_log_archive',
  COUNT(*),
  pg_size_pretty(pg_total_relation_size('rls_audit_log_archive'))
FROM rls_audit_log_archive;
```

## Dashboard de Seguridad

### Métricas Clave (Últimos 7 Días)

```sql
SELECT * FROM generate_rls_security_report(7);
```

### Gráfico de Tendencias

```sql
-- Violaciones por día (últimos 30 días)
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as total_violations,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical,
  COUNT(*) FILTER (WHERE severity = 'WARNING') as warning,
  COUNT(DISTINCT user_id) as unique_users
FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date;
```

### Top 10 Usuarios Sospechosos

```sql
SELECT 
  user_email,
  COUNT(*) as total_violations,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_violations,
  COUNT(DISTINCT table_name) as tables_targeted,
  COUNT(DISTINCT attempted_tenant_id) as tenants_targeted,
  MAX(timestamp) as last_violation
FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY user_email
ORDER BY critical_violations DESC, total_violations DESC
LIMIT 10;
```

### Mapa de Calor (Violaciones por Hora del Día)

```sql
SELECT 
  EXTRACT(HOUR FROM timestamp) as hour_of_day,
  COUNT(*) as violations,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical
FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM timestamp)
ORDER BY hour_of_day;
```

## Troubleshooting

### Problema: No se registran violaciones

**Verificar que los triggers están activos:**
```sql
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_rls_%'
ORDER BY event_object_table;
```

**Verificar que las funciones existen:**
```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('log_rls_violation', 'audit_rls_access');
```

**Probar manualmente:**
```sql
SELECT log_rls_violation('test_table', 'SELECT');
SELECT * FROM rls_audit_log WHERE table_name = 'test_table';
```

### Problema: Demasiados registros

**Ajustar período de retención:**
```sql
-- Retener solo 30 días en lugar de 90
SELECT cleanup_old_rls_audit_logs(30);
```

**Considerar particionamiento:**
```sql
-- Particionar por mes para mejor performance
-- (Requiere PostgreSQL 10+)
```

### Problema: Performance degradado

**Verificar índices:**
```sql
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'rls_audit_log';
```

**Analizar queries lentas:**
```sql
EXPLAIN ANALYZE
SELECT * FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '7 days'
  AND severity = 'CRITICAL';
```

## Seguridad

### Consideraciones Importantes

1. **La tabla `rls_audit_log` NO tiene RLS habilitado** - Esto es intencional para que los triggers puedan escribir sin restricciones.

2. **Acceso restringido** - Solo superadmin debe tener acceso directo a esta tabla.

3. **Datos sensibles** - Considerar encriptar campos como `ip_address` y `user_agent` si es necesario.

4. **SECURITY DEFINER** - Las funciones usan `SECURITY DEFINER` para poder escribir en la tabla de auditoría.

### Permisos Recomendados

```sql
-- Revocar acceso público
REVOKE ALL ON rls_audit_log FROM PUBLIC;

-- Permitir solo a superadmin
GRANT SELECT, INSERT, UPDATE, DELETE ON rls_audit_log TO superadmin;

-- Permitir solo lectura a auditores
GRANT SELECT ON rls_audit_log TO auditor_role;

-- Permitir solo lectura de vistas a usuarios normales (opcional)
GRANT SELECT ON v_rls_violations_recent TO authenticated;
```

## Integración con la Aplicación

### Backend (Node.js/TypeScript)

```typescript
// Consultar violaciones recientes
async function getRecentViolations() {
  const { data, error } = await supabase
    .from('v_rls_violations_recent')
    .select('*')
    .limit(50);
  
  return data;
}

// Generar reporte de seguridad
async function getSecurityReport(days: number = 7) {
  const { data, error } = await supabase
    .rpc('generate_rls_security_report', { p_days: days });
  
  return data;
}

// Registrar violación manual
async function logViolation(
  tableName: string,
  operation: string,
  attemptedTenantId: string
) {
  const { data, error } = await supabase
    .rpc('log_rls_violation', {
      p_table_name: tableName,
      p_operation: operation,
      p_attempted_tenant_id: attemptedTenantId,
      p_violation_type: 'cross_tenant',
      p_severity: 'CRITICAL'
    });
  
  return data;
}
```

### Frontend (React)

```typescript
// Hook para dashboard de seguridad
function useSecurityDashboard() {
  const [violations, setViolations] = useState([]);
  const [report, setReport] = useState(null);
  
  useEffect(() => {
    async function loadData() {
      const [violationsData, reportData] = await Promise.all([
        getRecentViolations(),
        getSecurityReport(7)
      ]);
      
      setViolations(violationsData);
      setReport(reportData);
    }
    
    loadData();
    
    // Actualizar cada 5 minutos
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  return { violations, report };
}
```

## Referencias

- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Triggers](https://www.postgresql.org/docs/current/trigger-definition.html)
- [pg_cron Extension](https://github.com/citusdata/pg_cron)

## Changelog

- **2025-10-24**: Versión inicial del sistema de auditoría RLS
  - Tabla `rls_audit_log` creada
  - 5 funciones implementadas
  - 4 vistas de monitoreo
  - 45 triggers en tablas críticas
