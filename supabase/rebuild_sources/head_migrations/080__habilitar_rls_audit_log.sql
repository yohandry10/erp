-- Migration 080: Habilitar RLS en rls_audit_log
-- Fecha: 2025-11-04
-- Descripción: Habilita RLS en tabla de auditoría con políticas que permiten:
--              - Escritura sin restricciones (para triggers)
--              - Lectura solo para service_role
-- Objetivo: Proteger logs de auditoría de acceso no autorizado
-- Referencia: REPORTE_AUDITORIA_TECNICA_EXHAUSTIVA.md - Hallazgo H01

BEGIN;

-- Habilitar RLS
ALTER TABLE rls_audit_log ENABLE ROW LEVEL SECURITY;

-- Política 1: Permitir INSERT sin restricciones (para triggers)
DROP POLICY IF EXISTS rls_audit_log_insert_unrestricted ON rls_audit_log;

CREATE POLICY rls_audit_log_insert_unrestricted
  ON rls_audit_log
  FOR INSERT
  WITH CHECK (true);

COMMENT ON POLICY rls_audit_log_insert_unrestricted ON rls_audit_log IS
  'Permite INSERT sin restricciones para que los triggers puedan escribir logs de auditoría';

-- Política 2: Permitir SELECT solo a service_role (bypass RLS)
-- Los usuarios autenticados accederán a través de vistas
DROP POLICY IF EXISTS rls_audit_log_select_service_role ON rls_audit_log;

CREATE POLICY rls_audit_log_select_service_role
  ON rls_audit_log
  FOR SELECT
  TO service_role
  USING (true);

COMMENT ON POLICY rls_audit_log_select_service_role ON rls_audit_log IS
  'Permite SELECT a service_role para acceso administrativo';

-- Política 3: Prohibir UPDATE (logs son inmutables)
DROP POLICY IF EXISTS rls_audit_log_no_update ON rls_audit_log;

CREATE POLICY rls_audit_log_no_update
  ON rls_audit_log
  FOR UPDATE
  USING (false);

COMMENT ON POLICY rls_audit_log_no_update ON rls_audit_log IS
  'Prohibe UPDATE - los logs de auditoría son inmutables';

-- Política 4: Permitir DELETE solo a service_role
DROP POLICY IF EXISTS rls_audit_log_delete_service_role ON rls_audit_log;

CREATE POLICY rls_audit_log_delete_service_role
  ON rls_audit_log
  FOR DELETE
  TO service_role
  USING (true);

COMMENT ON POLICY rls_audit_log_delete_service_role ON rls_audit_log IS
  'Permite DELETE a service_role para limpieza de logs antiguos';

-- Revocar permisos directos en la tabla
REVOKE ALL ON rls_audit_log FROM PUBLIC;
REVOKE ALL ON rls_audit_log FROM anon;
REVOKE ALL ON rls_audit_log FROM authenticated;

-- Mantener permisos en vistas (las vistas respetarán RLS)
GRANT SELECT ON v_rls_violations_by_table TO authenticated;
GRANT SELECT ON v_rls_violations_recent TO authenticated;
GRANT SELECT ON v_rls_violations_by_user TO authenticated;
GRANT SELECT ON v_rls_violations_hourly TO authenticated;

-- Actualizar función de limpieza con SECURITY DEFINER
CREATE OR REPLACE FUNCTION cleanup_old_rls_audit_logs(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM rls_audit_log
  WHERE timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_rls_audit_logs IS 
  'Elimina registros de auditoría más antiguos que el período de retención especificado';

-- Verificación
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'rls_audit_log'
    AND relnamespace = 'public'::regnamespace;

  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'rls_audit_log';
  
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'RLS no está habilitado en rls_audit_log';
  END IF;
  
  IF v_policy_count < 4 THEN
    RAISE EXCEPTION 'Solo % políticas creadas (esperado: 4)', v_policy_count;
  END IF;
END $$;

-- Actualizar comentario de la tabla
COMMENT ON TABLE rls_audit_log IS 
  'Registro de auditoría de intentos de acceso bloqueados por RLS. 
  RLS HABILITADO con políticas que permiten:
  - INSERT sin restricciones (para triggers)
  - SELECT solo para service_role (usuarios acceden vía vistas)
  - UPDATE prohibido (logs inmutables)
  - DELETE solo para service_role (limpieza)';

COMMIT;
