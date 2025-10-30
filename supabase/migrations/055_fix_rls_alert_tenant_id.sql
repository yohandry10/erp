-- =====================================================
-- MIGRACIÓN 055: Corrección de tenant_id en Alertas RLS
-- =====================================================
-- Descripción: Asegura que las alertas RLS incluyan tenant_id correctamente
--              para habilitar el aislamiento multi-tenant completo
-- Prioridad: CRÍTICA - Bloqueante de producción (Tarea B2)
-- Fecha: 2025-01-27
-- Sprint: 1 - Seguridad Multi-tenant
-- =====================================================

BEGIN;

-- =====================================================
-- 1. ACTUALIZAR FUNCIÓN send_rls_alert PARA INCLUIR tenant_id
-- =====================================================

-- Eliminar función antigua con firma completa (sin p_tenant_id)
-- Usar CASCADE para eliminar dependencias (triggers) si es necesario
DROP FUNCTION IF EXISTS send_rls_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, UUID, JSONB) CASCADE;

-- Crear nueva función con p_tenant_id
CREATE OR REPLACE FUNCTION send_rls_alert(
  p_alert_name TEXT,
  p_severity TEXT,
  p_message TEXT,
  p_violation_count INTEGER DEFAULT 1,
  p_affected_table TEXT DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL  -- NUEVO PARÁMETRO
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id UUID;
  v_config_id UUID;
  v_enabled BOOLEAN;
  v_notify_postgres BOOLEAN;
  v_notify_log BOOLEAN;
  v_payload JSONB;
  v_tenant_id UUID;
BEGIN
  -- Determinar tenant_id: prioridad al parámetro, luego del contexto actual
  v_tenant_id := COALESCE(
    p_tenant_id,
    (SELECT current_setting('app.current_tenant_id', true)::UUID),
    (SELECT tenant_id FROM usuarios_sistema WHERE id = p_user_id LIMIT 1),
    NULL
  );

  -- Verificar si la alerta está habilitada
  SELECT id, enabled, notify_postgres, notify_log
  INTO v_config_id, v_enabled, v_notify_postgres, v_notify_log
  FROM rls_alert_config
  WHERE alert_name = p_alert_name;
  
  IF NOT FOUND OR NOT v_enabled THEN
    RETURN NULL;
  END IF;
  
  -- Registrar en historial CON tenant_id
  INSERT INTO rls_alert_history (
    alert_config_id,
    alert_name,
    severity,
    message,
    violation_count,
    affected_table,
    user_email,
    user_id,
    details,
    tenant_id  -- NUEVO CAMPO
  ) VALUES (
    v_config_id,
    p_alert_name,
    p_severity,
    p_message,
    p_violation_count,
    p_affected_table,
    p_user_email,
    p_user_id,
    p_details,
    v_tenant_id  -- INCLUIR tenant_id
  )
  RETURNING id INTO v_alert_id;
  
  -- Preparar payload para notificación
  v_payload := jsonb_build_object(
    'alert_id', v_alert_id,
    'alert_name', p_alert_name,
    'severity', p_severity,
    'message', p_message,
    'violation_count', p_violation_count,
    'affected_table', p_affected_table,
    'user_email', p_user_email,
    'tenant_id', v_tenant_id,  -- INCLUIR tenant_id EN PAYLOAD
    'timestamp', NOW()
  );
  
  -- Enviar notificación PostgreSQL NOTIFY
  IF v_notify_postgres THEN
    PERFORM pg_notify('rls_alert', v_payload::TEXT);
  END IF;
  
  -- Log en PostgreSQL
  IF v_notify_log THEN
    RAISE WARNING '[RLS ALERT] % - % (Severity: %, Violations: %, Table: %, User: %, Tenant: %)',
      p_alert_name,
      p_message,
      p_severity,
      p_violation_count,
      COALESCE(p_affected_table, 'N/A'),
      COALESCE(p_user_email, 'N/A'),
      COALESCE(v_tenant_id::TEXT, 'N/A');
  END IF;
  
  RETURN v_alert_id;
END;
$$;

COMMENT ON FUNCTION send_rls_alert IS 
  'Envía una alerta de violación RLS a través de múltiples canales. ACTUALIZADO: Incluye tenant_id para aislamiento multi-tenant.';

-- =====================================================
-- 2. ACTUALIZAR TRIGGER trigger_rls_alert PARA PASAR tenant_id
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_rls_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recent_violations INTEGER;
  v_user_violations INTEGER;
  v_table_violations INTEGER;
  v_tenant_id UUID;
BEGIN
  -- Determinar tenant_id desde el registro de violación
  v_tenant_id := COALESCE(
    NEW.actual_tenant_id,
    NEW.attempted_tenant_id,
    (SELECT current_setting('app.current_tenant_id', true)::UUID),
    NULL
  );

  -- Alerta inmediata para violaciones críticas cross-tenant
  IF NEW.severity = 'CRITICAL' AND NEW.violation_type = 'cross_tenant' THEN
    PERFORM send_rls_alert(
      p_alert_name := 'critical_cross_tenant',
      p_severity := 'CRITICAL',
      p_message := format('Intento de acceso cross-tenant detectado en tabla %s', NEW.table_name),
      p_violation_count := 1,
      p_affected_table := NEW.table_name,
      p_user_email := NEW.user_email,
      p_user_id := NEW.user_id,
      p_tenant_id := v_tenant_id,  -- PASAR tenant_id
      p_details := jsonb_build_object(
        'attempted_tenant_id', NEW.attempted_tenant_id,
        'actual_tenant_id', NEW.actual_tenant_id,
        'operation', NEW.operation,
        'ip_address', NEW.ip_address
      )
    );
  END IF;
  
  -- Alerta para contexto de tenant faltante
  IF NEW.severity = 'CRITICAL' AND NEW.violation_type = 'missing_tenant' THEN
    PERFORM send_rls_alert(
      p_alert_name := 'missing_tenant_context',
      p_severity := 'CRITICAL',
      p_message := format('Operación sin contexto de tenant en tabla %s', NEW.table_name),
      p_violation_count := 1,
      p_affected_table := NEW.table_name,
      p_user_email := NEW.user_email,
      p_user_id := NEW.user_id,
      p_tenant_id := v_tenant_id,  -- PASAR tenant_id
      p_details := jsonb_build_object(
        'operation', NEW.operation,
        'ip_address', NEW.ip_address
      )
    );
  END IF;
  
  -- Verificar violaciones repetidas del mismo usuario (últimos 15 minutos)
  IF NEW.user_id IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_user_violations
    FROM rls_audit_log
    WHERE user_id = NEW.user_id
      AND timestamp > NOW() - INTERVAL '15 minutes';
    
    IF v_user_violations >= 5 THEN
      PERFORM send_rls_alert(
        p_alert_name := 'repeated_violations',
        p_severity := 'WARNING',
        p_message := format('Usuario %s tiene %s violaciones en los últimos 15 minutos', 
          NEW.user_email, v_user_violations),
        p_violation_count := v_user_violations,
        p_affected_table := NULL,
        p_user_email := NEW.user_email,
        p_user_id := NEW.user_id,
        p_tenant_id := v_tenant_id,  -- PASAR tenant_id
        p_details := jsonb_build_object(
          'time_window', '15 minutes',
          'threshold', 5
        )
      );
    END IF;
  END IF;
  
  -- Verificar si una tabla está bajo ataque (10+ violaciones en 10 minutos)
  -- Para esta alerta, el tenant_id puede ser NULL si es un ataque multi-tenant
  SELECT COUNT(*)
  INTO v_table_violations
  FROM rls_audit_log
  WHERE table_name = NEW.table_name
    AND timestamp > NOW() - INTERVAL '10 minutes';
  
  IF v_table_violations >= 10 THEN
    PERFORM send_rls_alert(
      p_alert_name := 'table_under_attack',
      p_severity := 'CRITICAL',
      p_message := format('Tabla %s recibió %s intentos de acceso en los últimos 10 minutos', 
        NEW.table_name, v_table_violations),
      p_violation_count := v_table_violations,
      p_affected_table := NEW.table_name,
      p_user_email := NULL,
      p_user_id := NULL,
      p_tenant_id := v_tenant_id,  -- PASAR tenant_id (puede ser NULL si es multi-tenant)
      p_details := jsonb_build_object(
        'time_window', '10 minutes',
        'threshold', 10
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_rls_alert IS 
  'Trigger que evalúa condiciones y envía alertas automáticas. ACTUALIZADO: Pasa tenant_id a send_rls_alert para aislamiento multi-tenant.';

-- Asegurar que el trigger esté recreado correctamente
DROP TRIGGER IF EXISTS trg_rls_alert ON rls_audit_log;
CREATE TRIGGER trg_rls_alert
  AFTER INSERT ON rls_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION trigger_rls_alert();

-- =====================================================
-- 3. ACTUALIZAR REGISTROS EXISTENTES CON tenant_id NULL
-- =====================================================
-- Intentar poblar tenant_id en registros existentes donde sea posible

UPDATE rls_alert_history ah
SET tenant_id = (
  SELECT COALESCE(
    (SELECT actual_tenant_id FROM rls_audit_log 
     WHERE id = (ah.details->>'log_id')::UUID LIMIT 1),
    (SELECT tenant_id FROM usuarios_sistema WHERE id = ah.user_id LIMIT 1),
    NULL
  )
)
WHERE ah.tenant_id IS NULL
  AND (ah.user_id IS NOT NULL OR ah.details IS NOT NULL);

-- =====================================================
-- 4. VERIFICACIÓN DE POLÍTICAS RLS
-- =====================================================
-- Verificar que las políticas RLS estén correctamente aplicadas

DO $$
DECLARE
  v_rls_enabled boolean;
  v_policies_count integer;
BEGIN
  RAISE NOTICE '=== VERIFICACIÓN DE RLS EN TABLAS DE ALERTAS ===';
  
  -- Verificar rls_alert_config
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'rls_alert_config';
  
  IF v_rls_enabled THEN
    RAISE NOTICE '✓ rls_alert_config tiene RLS habilitado';
  ELSE
    RAISE WARNING '✗ ERROR: rls_alert_config NO tiene RLS habilitado';
  END IF;
  
  SELECT COUNT(*) INTO v_policies_count
  FROM pg_policies
  WHERE tablename = 'rls_alert_config';
  
  RAISE NOTICE '  Políticas RLS: %', v_policies_count;
  
  -- Verificar rls_alert_history
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'rls_alert_history';
  
  IF v_rls_enabled THEN
    RAISE NOTICE '✓ rls_alert_history tiene RLS habilitado';
  ELSE
    RAISE WARNING '✗ ERROR: rls_alert_history NO tiene RLS habilitado';
  END IF;
  
  SELECT COUNT(*) INTO v_policies_count
  FROM pg_policies
  WHERE tablename = 'rls_alert_history';
  
  RAISE NOTICE '  Políticas RLS: %', v_policies_count;
  
  RAISE NOTICE '=== VERIFICACIÓN COMPLETADA ===';
END $$;

-- =====================================================
-- 5. REGISTRO EN AUDIT LOG
-- =====================================================

INSERT INTO audit_log (
  table_name,
  operation,
  record_id,
  new_values,
  user_id,
  tenant_id,
  metadata,
  timestamp
) VALUES (
  'system_migrations',
  'RLS_HARDENING_B2',
  gen_random_uuid(),
  jsonb_build_object(
    'migration', '055_fix_rls_alert_tenant_id',
    'functions_updated', ARRAY['send_rls_alert', 'trigger_rls_alert'],
    'priority', 'CRITICAL',
    'task', 'B2 - Filtros explícitos por tenant_id',
    'sprint', 'Sprint 1 - Seguridad Multi-tenant'
  ),
  NULL,  -- System migration
  NULL,  -- System-wide
  jsonb_build_object(
    'action', 'FIX_RLS_ALERT_TENANT_ISOLATION',
    'compliance', 'PRODUCTION_BLOCKER_RESOLVED',
    'security_impact', 'HIGH'
  ),
  NOW()
);

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- CAMBIOS REALIZADOS:
-- 1. Función send_rls_alert ahora acepta y guarda tenant_id
-- 2. Trigger trigger_rls_alert ahora pasa tenant_id a send_rls_alert
-- 3. Registros existentes con tenant_id NULL se actualizan si es posible
-- 4. Verificación de políticas RLS para confirmar que están activas
--
-- TESTING REQUERIDO:
-- 1. Verificar que alertas nuevas incluyan tenant_id
-- 2. Verificar que usuarios solo vean alertas de su tenant
-- 3. Verificar que super-admins vean todas las alertas
-- 4. Verificar que triggers funcionen correctamente con tenant_id
--
-- ROLLBACK:
-- En caso de necesitar rollback, ejecutar:
-- DROP FUNCTION IF EXISTS send_rls_alert CASCADE;
-- DROP FUNCTION IF EXISTS trigger_rls_alert CASCADE;
-- Luego restaurar versiones anteriores desde backup
-- =====================================================

