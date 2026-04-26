-- Migration 033: Auditoría de Violaciones RLS
-- Fecha: 2025-10-24
-- Descripción: Implementa sistema de auditoría para intentos de acceso bloqueados por RLS
-- Parte de: TASK 2.4 - Configurar Auditoría de Accesos
-- Objetivo: Detectar y registrar intentos de acceso cross-tenant

BEGIN;

-- =====================================================
-- TABLA DE AUDITORÍA DE VIOLACIONES RLS
-- =====================================================

-- Crear tabla para registrar intentos de acceso bloqueados
-- IMPORTANTE: Esta tabla NO tiene RLS habilitado intencionalmente
-- para permitir que los triggers escriban sin restricciones
CREATE TABLE IF NOT EXISTS rls_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Información del usuario
  user_id UUID,
  user_email TEXT,
  user_role TEXT,
  
  -- Información del tenant
  attempted_tenant_id UUID,
  actual_tenant_id UUID,
  
  -- Información de la operación
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  query_text TEXT,
  
  -- Información de la sesión
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  
  -- Contexto adicional
  application_name TEXT,
  backend_pid INTEGER,
  
  -- Severidad y clasificación
  severity TEXT DEFAULT 'WARNING',
  violation_type TEXT,
  
  -- Metadata adicional
  metadata JSONB,
  
  -- Índices para búsqueda rápida
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rls_audit_log IS 
  'Registro de auditoría de intentos de acceso bloqueados por RLS. NOTA: Esta tabla NO tiene RLS habilitado para permitir que los triggers escriban sin restricciones. El acceso debe ser controlado mediante permisos de PostgreSQL.';

-- Crear índices para optimizar consultas de auditoría
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_timestamp 
  ON rls_audit_log(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_user_id 
  ON rls_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_table_name 
  ON rls_audit_log(table_name);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_severity 
  ON rls_audit_log(severity);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_violation_type 
  ON rls_audit_log(violation_type);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_attempted_tenant 
  ON rls_audit_log(attempted_tenant_id);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_composite 
  ON rls_audit_log(timestamp DESC, severity, table_name);

COMMENT ON COLUMN rls_audit_log.attempted_tenant_id IS 
  'Tenant ID que el usuario intentó acceder';

COMMENT ON COLUMN rls_audit_log.actual_tenant_id IS 
  'Tenant ID real del usuario autenticado';

COMMENT ON COLUMN rls_audit_log.violation_type IS 
  'Tipo de violación: cross_tenant, missing_tenant, invalid_tenant';

-- =====================================================
-- FUNCIÓN PARA REGISTRAR VIOLACIONES RLS
-- =====================================================

CREATE OR REPLACE FUNCTION log_rls_violation(
  p_table_name TEXT,
  p_operation TEXT,
  p_attempted_tenant_id UUID DEFAULT NULL,
  p_violation_type TEXT DEFAULT 'cross_tenant',
  p_severity TEXT DEFAULT 'WARNING',
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role TEXT;
  v_actual_tenant_id UUID;
  v_session_id TEXT;
  v_ip_address INET;
BEGIN
  BEGIN
    v_user_id := auth.uid();
    v_user_email := auth.email();
    v_user_role := auth.role();
  EXCEPTION
    WHEN OTHERS THEN
      v_user_id := NULL;
      v_user_email := 'unknown';
      v_user_role := 'unknown';
  END;
  
  BEGIN
    v_actual_tenant_id := current_setting('app.current_tenant_id', true)::UUID;
  EXCEPTION
    WHEN OTHERS THEN
      v_actual_tenant_id := NULL;
  END;
  
  BEGIN
    v_session_id := current_setting('application_name', true);
  EXCEPTION
    WHEN OTHERS THEN
      v_session_id := NULL;
  END;
  
  BEGIN
    v_ip_address := inet_client_addr();
  EXCEPTION
    WHEN OTHERS THEN
      v_ip_address := NULL;
  END;
  
  INSERT INTO rls_audit_log (
    user_id,
    user_email,
    user_role,
    attempted_tenant_id,
    actual_tenant_id,
    table_name,
    operation,
    session_id,
    ip_address,
    severity,
    violation_type,
    backend_pid,
    metadata
  ) VALUES (
    v_user_id,
    v_user_email,
    v_user_role,
    p_attempted_tenant_id,
    v_actual_tenant_id,
    p_table_name,
    p_operation,
    v_session_id,
    v_ip_address,
    p_severity,
    p_violation_type,
    pg_backend_pid(),
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_rls_violation IS 
  'Registra un intento de violación de RLS en la tabla de auditoría';

-- =====================================================
-- TRIGGER FUNCTION PARA AUDITORÍA AUTOMÁTICA
-- =====================================================

CREATE OR REPLACE FUNCTION audit_rls_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_tenant_id UUID;
  v_row_tenant_id UUID;
  v_operation TEXT;
BEGIN
  BEGIN
    v_current_tenant_id := current_setting('app.current_tenant_id', true)::UUID;
  EXCEPTION
    WHEN OTHERS THEN
      v_current_tenant_id := NULL;
  END;
  
  v_operation := TG_OP;
  
  IF TG_OP = 'DELETE' THEN
    v_row_tenant_id := OLD.tenant_id;
  ELSE
    v_row_tenant_id := NEW.tenant_id;
  END IF;
  
  IF v_current_tenant_id IS NULL THEN
    PERFORM log_rls_violation(
      p_table_name := TG_TABLE_NAME,
      p_operation := v_operation,
      p_attempted_tenant_id := v_row_tenant_id,
      p_violation_type := 'missing_tenant',
      p_severity := 'CRITICAL',
      p_metadata := jsonb_build_object(
        'trigger', TG_NAME,
        'when', TG_WHEN,
        'level', TG_LEVEL
      )
    );
  ELSIF v_row_tenant_id IS NOT NULL AND v_row_tenant_id != v_current_tenant_id THEN
    PERFORM log_rls_violation(
      p_table_name := TG_TABLE_NAME,
      p_operation := v_operation,
      p_attempted_tenant_id := v_row_tenant_id,
      p_violation_type := 'cross_tenant',
      p_severity := 'CRITICAL',
      p_metadata := jsonb_build_object(
        'trigger', TG_NAME,
        'when', TG_WHEN,
        'level', TG_LEVEL,
        'row_tenant_id', v_row_tenant_id,
        'session_tenant_id', v_current_tenant_id
      )
    );
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION audit_rls_access IS 
  'Trigger function que audita intentos de acceso antes de que RLS los bloquee';

-- =====================================================
-- FUNCIÓN HELPER PARA AGREGAR AUDITORÍA A UNA TABLA
-- =====================================================

CREATE OR REPLACE FUNCTION add_rls_audit_trigger(p_table_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trigger_name TEXT;
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = p_table_name
  ) INTO v_table_exists;
  
  IF NOT v_table_exists THEN
    RAISE WARNING 'La tabla % no existe. Saltando...', p_table_name;
    RETURN;
  END IF;
  
  v_trigger_name := 'audit_rls_' || p_table_name;
  
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON %I',
    v_trigger_name,
    p_table_name
  );
  
  EXECUTE format(
    'CREATE TRIGGER %I
     BEFORE INSERT OR UPDATE OR DELETE ON %I
     FOR EACH ROW
     EXECUTE FUNCTION audit_rls_access()',
    v_trigger_name,
    p_table_name
  );
  
  RAISE NOTICE 'Trigger de auditoría creado para tabla: %', p_table_name;
END;
$$;

COMMENT ON FUNCTION add_rls_audit_trigger IS 
  'Agrega trigger de auditoría RLS a una tabla específica';

-- =====================================================
-- APLICAR TRIGGERS A TABLAS CRÍTICAS
-- =====================================================

DO $$
DECLARE
  v_table_name TEXT;
  v_tables TEXT[] := ARRAY[
    'cuentas_por_pagar',
    'cuentas_bancarias',
    'conciliaciones_bancarias',
    'cobranzas',
    'gestiones_cobranza',
    'egresos',
    'gastos',
    'pagos_empleados',
    'pagos_facturas',
    'periodos_contables',
    'saldos_iniciales_cuentas',
    'centros_costo',
    'asignacion_costos',
    'libro_retenciones',
    'libros_electronicos_sunat',
    'inventarios_permanentes',
    'planillas',
    'departamentos',
    'horarios_trabajo',
    'vacantes',
    'candidatos',
    'beneficios',
    'capacitaciones',
    'evaluaciones',
    'solicitudes',
    'liquidaciones',
    'conceptos_planilla',
    'empleado_beneficios',
    'empleado_capacitaciones',
    'empleado_horarios',
    'empleado_planilla_conceptos',
    'expediente_documentos',
    'activos_fijos',
    'depreciaciones',
    'cajas',
    'registro_consignaciones',
    'movimientos_consignacion',
    'calendario_empresa',
    'configuracion_retenciones',
    'detalle_retenciones_categoria',
    'usuario_configuracion',
    'event_processing_log',
    'usuarios_sistemas'
  ];
BEGIN
  RAISE NOTICE '=== AGREGANDO TRIGGERS DE AUDITORÍA A 45 TABLAS ===';
  
  FOREACH v_table_name IN ARRAY v_tables
  LOOP
    PERFORM add_rls_audit_trigger(v_table_name);
  END LOOP;
  
  RAISE NOTICE '=== TRIGGERS DE AUDITORÍA AGREGADOS EXITOSAMENTE ===';
END;
$$;

-- =====================================================
-- VISTAS DE MONITOREO Y REPORTES
-- =====================================================

CREATE OR REPLACE VIEW v_rls_violations_by_table AS
SELECT 
  table_name,
  COUNT(*) AS total_violations,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'WARNING') AS warning_count,
  COUNT(*) FILTER (WHERE violation_type = 'cross_tenant') AS cross_tenant_count,
  COUNT(*) FILTER (WHERE violation_type = 'missing_tenant') AS missing_tenant_count,
  MAX(timestamp) AS last_violation,
  MIN(timestamp) AS first_violation
FROM rls_audit_log
GROUP BY table_name
ORDER BY total_violations DESC;

COMMENT ON VIEW v_rls_violations_by_table IS 
  'Resumen de violaciones RLS agrupadas por tabla';

CREATE OR REPLACE VIEW v_rls_violations_recent AS
SELECT 
  timestamp,
  table_name,
  operation,
  user_email,
  violation_type,
  severity,
  attempted_tenant_id,
  actual_tenant_id,
  ip_address
FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 100;

COMMENT ON VIEW v_rls_violations_recent IS 
  'Violaciones RLS de las últimas 24 horas';

CREATE OR REPLACE VIEW v_rls_violations_by_user AS
SELECT 
  user_email,
  user_id,
  COUNT(*) AS total_violations,
  COUNT(DISTINCT table_name) AS tables_affected,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_violations,
  MAX(timestamp) AS last_violation,
  ARRAY_AGG(DISTINCT table_name) AS affected_tables
FROM rls_audit_log
WHERE user_email IS NOT NULL
GROUP BY user_email, user_id
ORDER BY total_violations DESC;

COMMENT ON VIEW v_rls_violations_by_user IS 
  'Usuarios con más intentos de violación RLS';

CREATE OR REPLACE VIEW v_rls_violations_hourly AS
SELECT 
  DATE_TRUNC('hour', timestamp) AS hour,
  COUNT(*) AS violations,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT table_name) AS tables_affected,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count
FROM rls_audit_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;

COMMENT ON VIEW v_rls_violations_hourly IS 
  'Tendencia de violaciones RLS por hora (últimos 7 días)';

-- =====================================================
-- FUNCIÓN PARA LIMPIAR LOGS ANTIGUOS
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_rls_audit_logs(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM rls_audit_log
  WHERE timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Eliminados % registros de auditoría más antiguos que % días', 
    v_deleted_count, p_retention_days;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_rls_audit_logs IS 
  'Elimina registros de auditoría más antiguos que el período de retención especificado';

-- =====================================================
-- FUNCIÓN PARA GENERAR REPORTE DE SEGURIDAD
-- =====================================================

CREATE OR REPLACE FUNCTION generate_rls_security_report(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  metric TEXT,
  value TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_violations INTEGER;
  v_critical_violations INTEGER;
  v_unique_users INTEGER;
  v_tables_affected INTEGER;
  v_most_targeted_table TEXT;
  v_most_active_user TEXT;
BEGIN
  SELECT COUNT(*) INTO v_total_violations
  FROM rls_audit_log
  WHERE timestamp > NOW() - (p_days || ' days')::INTERVAL;
  
  SELECT COUNT(*) INTO v_critical_violations
  FROM rls_audit_log
  WHERE timestamp > NOW() - (p_days || ' days')::INTERVAL
    AND severity = 'CRITICAL';
  
  SELECT COUNT(DISTINCT user_id) INTO v_unique_users
  FROM rls_audit_log
  WHERE timestamp > NOW() - (p_days || ' days')::INTERVAL;
  
  SELECT COUNT(DISTINCT table_name) INTO v_tables_affected
  FROM rls_audit_log
  WHERE timestamp > NOW() - (p_days || ' days')::INTERVAL;
  
  SELECT table_name INTO v_most_targeted_table
  FROM rls_audit_log
  WHERE timestamp > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY table_name
  ORDER BY COUNT(*) DESC
  LIMIT 1;
  
  SELECT user_email INTO v_most_active_user
  FROM rls_audit_log
  WHERE timestamp > NOW() - (p_days || ' days')::INTERVAL
    AND user_email IS NOT NULL
  GROUP BY user_email
  ORDER BY COUNT(*) DESC
  LIMIT 1;
  
  RETURN QUERY
  SELECT 'Período'::TEXT, p_days || ' días'::TEXT
  UNION ALL
  SELECT 'Total de Violaciones', COALESCE(v_total_violations::TEXT, '0')
  UNION ALL
  SELECT 'Violaciones Críticas', COALESCE(v_critical_violations::TEXT, '0')
  UNION ALL
  SELECT 'Usuarios Únicos', COALESCE(v_unique_users::TEXT, '0')
  UNION ALL
  SELECT 'Tablas Afectadas', COALESCE(v_tables_affected::TEXT, '0')
  UNION ALL
  SELECT 'Tabla Más Atacada', COALESCE(v_most_targeted_table, 'N/A')
  UNION ALL
  SELECT 'Usuario Más Activo', COALESCE(v_most_active_user, 'N/A');
END;
$$;

COMMENT ON FUNCTION generate_rls_security_report IS 
  'Genera un reporte de seguridad con métricas de violaciones RLS';

-- =====================================================
-- CONFIGURACIÓN DE SEGURIDAD Y PERMISOS
-- =====================================================

ALTER TABLE rls_audit_log DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON rls_audit_log FROM PUBLIC;
REVOKE ALL ON rls_audit_log FROM anon;
REVOKE ALL ON rls_audit_log FROM authenticated;

GRANT SELECT ON v_rls_violations_by_table TO authenticated;
GRANT SELECT ON v_rls_violations_recent TO authenticated;
GRANT SELECT ON v_rls_violations_by_user TO authenticated;
GRANT SELECT ON v_rls_violations_hourly TO authenticated;

GRANT EXECUTE ON FUNCTION generate_rls_security_report(INTEGER) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '=== CONFIGURACIÓN DE SEGURIDAD APLICADA ===';
  RAISE NOTICE 'Tabla rls_audit_log: RLS DESHABILITADO (intencional)';
  RAISE NOTICE 'Acceso público: REVOCADO';
  RAISE NOTICE 'Vistas de monitoreo: Accesibles para usuarios autenticados';
END;
$$;

COMMIT;
