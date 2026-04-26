-- Migration 034: Configuración de Alertas para Violaciones RLS
-- Fecha: 2025-10-24
-- Descripción: Configura sistema de alertas automáticas para violaciones RLS
-- Parte de: TASK 2.4 - Configurar Auditoría de Accesos (Subtarea: Configurar alertas en logs)
-- Objetivo: Notificar en tiempo real sobre intentos de acceso cross-tenant

BEGIN;

-- =====================================================
-- TABLA DE CONFIGURACIÓN DE ALERTAS
-- =====================================================

CREATE TABLE IF NOT EXISTS rls_alert_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Condiciones de disparo
  severity_threshold TEXT NOT NULL DEFAULT 'CRITICAL',
  violation_types TEXT[] DEFAULT ARRAY['cross_tenant', 'missing_tenant'],
  min_violations_count INTEGER DEFAULT 1,
  time_window_minutes INTEGER DEFAULT 5,
  
  -- Canales de notificación
  notify_postgres BOOLEAN DEFAULT true,
  notify_log BOOLEAN DEFAULT true,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rls_alert_config IS 
  'Configuración de alertas para violaciones RLS';

-- Insertar configuraciones de alertas por defecto
INSERT INTO rls_alert_config (alert_name, severity_threshold, violation_types, min_violations_count, time_window_minutes, description)
VALUES 
  ('critical_cross_tenant', 'CRITICAL', ARRAY['cross_tenant'], 1, 5, 'Alerta inmediata para intentos de acceso cross-tenant'),
  ('missing_tenant_context', 'CRITICAL', ARRAY['missing_tenant'], 1, 5, 'Alerta cuando falta contexto de tenant en la sesión'),
  ('repeated_violations', 'WARNING', ARRAY['cross_tenant', 'missing_tenant'], 5, 15, 'Alerta cuando un usuario tiene múltiples violaciones en corto tiempo'),
  ('table_under_attack', 'CRITICAL', ARRAY['cross_tenant'], 10, 10, 'Alerta cuando una tabla específica recibe múltiples intentos de acceso')
ON CONFLICT (alert_name) DO NOTHING;

-- =====================================================
-- TABLA DE HISTORIAL DE ALERTAS ENVIADAS
-- =====================================================

CREATE TABLE IF NOT EXISTS rls_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_config_id UUID REFERENCES rls_alert_config(id),
  alert_name TEXT NOT NULL,
  
  -- Información de la alerta
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Contexto de la violación
  violation_count INTEGER,
  affected_table TEXT,
  user_email TEXT,
  user_id UUID,
  
  -- Metadata adicional
  details JSONB,
  
  -- Estado de la alerta
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rls_alert_history IS 
  'Historial de alertas enviadas por violaciones RLS';

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_rls_alert_history_triggered_at 
  ON rls_alert_history(triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_rls_alert_history_alert_name 
  ON rls_alert_history(alert_name);

CREATE INDEX IF NOT EXISTS idx_rls_alert_history_severity 
  ON rls_alert_history(severity);

CREATE INDEX IF NOT EXISTS idx_rls_alert_history_acknowledged 
  ON rls_alert_history(acknowledged);

-- =====================================================
-- FUNCIÓN PARA ENVIAR ALERTAS
-- =====================================================

CREATE OR REPLACE FUNCTION send_rls_alert(
  p_alert_name TEXT,
  p_severity TEXT,
  p_message TEXT,
  p_violation_count INTEGER DEFAULT 1,
  p_affected_table TEXT DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL
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
BEGIN
  -- Verificar si la alerta está habilitada
  SELECT id, enabled, notify_postgres, notify_log
  INTO v_config_id, v_enabled, v_notify_postgres, v_notify_log
  FROM rls_alert_config
  WHERE alert_name = p_alert_name;
  
  IF NOT FOUND OR NOT v_enabled THEN
    RETURN NULL;
  END IF;
  
  -- Registrar en historial
  INSERT INTO rls_alert_history (
    alert_config_id,
    alert_name,
    severity,
    message,
    violation_count,
    affected_table,
    user_email,
    user_id,
    details
  ) VALUES (
    v_config_id,
    p_alert_name,
    p_severity,
    p_message,
    p_violation_count,
    p_affected_table,
    p_user_email,
    p_user_id,
    p_details
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
    'timestamp', NOW()
  );
  
  -- Enviar notificación PostgreSQL NOTIFY
  IF v_notify_postgres THEN
    PERFORM pg_notify('rls_alert', v_payload::TEXT);
  END IF;
  
  -- Log en PostgreSQL
  IF v_notify_log THEN
    RAISE WARNING '[RLS ALERT] % - % (Severity: %, Violations: %, Table: %, User: %)',
      p_alert_name,
      p_message,
      p_severity,
      p_violation_count,
      COALESCE(p_affected_table, 'N/A'),
      COALESCE(p_user_email, 'N/A');
  END IF;
  
  RETURN v_alert_id;
END;
$$;

COMMENT ON FUNCTION send_rls_alert IS 
  'Envía una alerta de violación RLS a través de múltiples canales';

-- =====================================================
-- FUNCIÓN TRIGGER PARA ALERTAS AUTOMÁTICAS
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
BEGIN
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
        p_details := jsonb_build_object(
          'time_window', '15 minutes',
          'threshold', 5
        )
      );
    END IF;
  END IF;
  
  -- Verificar si una tabla está bajo ataque (10+ violaciones en 10 minutos)
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
  'Trigger que evalúa condiciones y envía alertas automáticas';

-- Crear trigger en la tabla de auditoría
DROP TRIGGER IF EXISTS trg_rls_alert ON rls_audit_log;
CREATE TRIGGER trg_rls_alert
  AFTER INSERT ON rls_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION trigger_rls_alert();

-- =====================================================
-- VISTAS DE MONITOREO DE ALERTAS
-- =====================================================

CREATE OR REPLACE VIEW v_rls_alerts_recent AS
SELECT 
  ah.triggered_at,
  ah.alert_name,
  ah.severity,
  ah.message,
  ah.violation_count,
  ah.affected_table,
  ah.user_email,
  ah.acknowledged,
  ah.acknowledged_at,
  ac.description AS alert_description
FROM rls_alert_history ah
LEFT JOIN rls_alert_config ac ON ah.alert_config_id = ac.id
WHERE ah.triggered_at > NOW() - INTERVAL '24 hours'
ORDER BY ah.triggered_at DESC;

COMMENT ON VIEW v_rls_alerts_recent IS 
  'Alertas RLS de las últimas 24 horas';

CREATE OR REPLACE VIEW v_rls_alerts_unacknowledged AS
SELECT 
  ah.id,
  ah.triggered_at,
  ah.alert_name,
  ah.severity,
  ah.message,
  ah.violation_count,
  ah.affected_table,
  ah.user_email,
  EXTRACT(EPOCH FROM (NOW() - ah.triggered_at))/60 AS minutes_since_trigger
FROM rls_alert_history ah
WHERE ah.acknowledged = false
ORDER BY ah.triggered_at DESC;

COMMENT ON VIEW v_rls_alerts_unacknowledged IS 
  'Alertas RLS pendientes de reconocimiento';

CREATE OR REPLACE VIEW v_rls_alerts_summary AS
SELECT 
  alert_name,
  COUNT(*) AS total_alerts,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'WARNING') AS warning_count,
  COUNT(*) FILTER (WHERE acknowledged = false) AS unacknowledged_count,
  MAX(triggered_at) AS last_alert,
  MIN(triggered_at) AS first_alert
FROM rls_alert_history
WHERE triggered_at > NOW() - INTERVAL '7 days'
GROUP BY alert_name
ORDER BY total_alerts DESC;

COMMENT ON VIEW v_rls_alerts_summary IS 
  'Resumen de alertas RLS de los últimos 7 días';

-- =====================================================
-- FUNCIONES DE GESTIÓN DE ALERTAS
-- =====================================================

CREATE OR REPLACE FUNCTION acknowledge_rls_alert(
  p_alert_id UUID,
  p_acknowledged_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE rls_alert_history
  SET 
    acknowledged = true,
    acknowledged_at = NOW(),
    acknowledged_by = COALESCE(p_acknowledged_by, auth.uid())
  WHERE id = p_alert_id
    AND acknowledged = false;
  
  v_updated := FOUND;
  
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION acknowledge_rls_alert IS 
  'Marca una alerta como reconocida';

CREATE OR REPLACE FUNCTION enable_rls_alert(p_alert_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE rls_alert_config
  SET enabled = true, updated_at = NOW()
  WHERE alert_name = p_alert_name;
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION enable_rls_alert IS 
  'Habilita una configuración de alerta';

CREATE OR REPLACE FUNCTION disable_rls_alert(p_alert_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE rls_alert_config
  SET enabled = false, updated_at = NOW()
  WHERE alert_name = p_alert_name;
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION disable_rls_alert IS 
  'Deshabilita una configuración de alerta';

CREATE OR REPLACE FUNCTION get_alert_statistics(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  metric TEXT,
  value TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_alerts INTEGER;
  v_critical_alerts INTEGER;
  v_unacknowledged INTEGER;
  v_avg_response_time INTERVAL;
  v_most_common_alert TEXT;
BEGIN
  SELECT COUNT(*) INTO v_total_alerts
  FROM rls_alert_history
  WHERE triggered_at > NOW() - (p_days || ' days')::INTERVAL;
  
  SELECT COUNT(*) INTO v_critical_alerts
  FROM rls_alert_history
  WHERE triggered_at > NOW() - (p_days || ' days')::INTERVAL
    AND severity = 'CRITICAL';
  
  SELECT COUNT(*) INTO v_unacknowledged
  FROM rls_alert_history
  WHERE acknowledged = false;
  
  SELECT AVG(acknowledged_at - triggered_at) INTO v_avg_response_time
  FROM rls_alert_history
  WHERE triggered_at > NOW() - (p_days || ' days')::INTERVAL
    AND acknowledged = true;
  
  SELECT alert_name INTO v_most_common_alert
  FROM rls_alert_history
  WHERE triggered_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY alert_name
  ORDER BY COUNT(*) DESC
  LIMIT 1;
  
  RETURN QUERY
  SELECT 'Período'::TEXT, p_days || ' días'::TEXT
  UNION ALL
  SELECT 'Total de Alertas', COALESCE(v_total_alerts::TEXT, '0')
  UNION ALL
  SELECT 'Alertas Críticas', COALESCE(v_critical_alerts::TEXT, '0')
  UNION ALL
  SELECT 'Alertas Sin Reconocer', COALESCE(v_unacknowledged::TEXT, '0')
  UNION ALL
  SELECT 'Tiempo Promedio de Respuesta', COALESCE(v_avg_response_time::TEXT, 'N/A')
  UNION ALL
  SELECT 'Alerta Más Común', COALESCE(v_most_common_alert, 'N/A');
END;
$$;

COMMENT ON FUNCTION get_alert_statistics IS 
  'Obtiene estadísticas de alertas RLS';

-- =====================================================
-- FUNCIÓN PARA LIMPIAR ALERTAS ANTIGUAS
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_rls_alerts(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM rls_alert_history
  WHERE triggered_at < NOW() - (p_retention_days || ' days')::INTERVAL
    AND acknowledged = true;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_rls_alerts IS 
  'Elimina alertas reconocidas más antiguas que el período de retención';

-- =====================================================
-- CONFIGURACIÓN DE SEGURIDAD Y PERMISOS
-- =====================================================

-- Deshabilitar RLS en tablas de alertas (acceso controlado por permisos)
ALTER TABLE rls_alert_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE rls_alert_history DISABLE ROW LEVEL SECURITY;

-- Revocar acceso público
REVOKE ALL ON rls_alert_config FROM PUBLIC;
REVOKE ALL ON rls_alert_history FROM PUBLIC;

-- Permisos para usuarios autenticados (solo lectura en vistas)
GRANT SELECT ON v_rls_alerts_recent TO authenticated;
GRANT SELECT ON v_rls_alerts_unacknowledged TO authenticated;
GRANT SELECT ON v_rls_alerts_summary TO authenticated;

-- Permisos para funciones de gestión
GRANT EXECUTE ON FUNCTION acknowledge_rls_alert(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_alert_statistics(INTEGER) TO authenticated;

COMMIT;
