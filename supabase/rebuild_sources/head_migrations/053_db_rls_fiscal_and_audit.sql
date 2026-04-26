-- =====================================================
-- MIGRACIÓN 053: RLS Completo en Tablas Fiscales y Auditoría
-- =====================================================
-- Descripción: Habilita Row Level Security en tablas críticas de cumplimiento fiscal
--              y auditoría que no tenían RLS completo o lo tenían parcial:
--              - cpe (Comprobantes Electrónicos)
--              - gre (Guías de Remisión Electrónicas)
--              - sire_files (Archivos SIRE)
--              - auditoria (Auditoría general)
--              - rls_alert_config (Configuración de alertas RLS)
--              - rls_alert_history (Historial de alertas RLS)
-- Prioridad: CRÍTICA - Bloqueante de producción
-- Fecha: 2025-10-30
-- Sprint: 1 - Seguridad Multi-tenant
-- =====================================================

BEGIN;

-- =====================================================
-- PRE-CHECK: Asegurar columna tenant_id donde falte
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cpe' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE cpe ADD COLUMN tenant_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gre' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gre ADD COLUMN tenant_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sire_files' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE sire_files ADD COLUMN tenant_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auditoria' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE auditoria ADD COLUMN tenant_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rls_alert_config' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE rls_alert_config ADD COLUMN tenant_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rls_alert_history' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE rls_alert_history ADD COLUMN tenant_id UUID;
  END IF;
END $$;

-- =====================================================
-- 1. TABLA CPE (Comprobantes Electrónicos)
-- =====================================================
-- Estado anterior: RLS PARCIAL (solo SELECT, INSERT, UPDATE)
-- Estado nuevo: RLS COMPLETO con política consolidada

-- Habilitar RLS si no está habilitado
ALTER TABLE cpe ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas parciales anteriores para evitar conflictos
DROP POLICY IF EXISTS "Users can insert own tenant CPE" ON cpe;
DROP POLICY IF EXISTS "Users can update own tenant CPE" ON cpe;
DROP POLICY IF EXISTS "Users can view own tenant CPE" ON cpe;

-- Crear política consolidada de aislamiento por tenant (ALL operations)
CREATE POLICY "cpe_tenant_isolation" ON cpe
  FOR ALL USING (
    tenant_id = app.current_tenant_id() 
    OR app.is_superadmin()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR app.is_superadmin()
  );

-- Comentario descriptivo
COMMENT ON POLICY "cpe_tenant_isolation" ON cpe IS 
  'Política RLS completa: Solo permite acceso a CPE del tenant actual. Super-admins tienen acceso global.';

-- =====================================================
-- 2. TABLA GRE (Guías de Remisión Electrónicas)
-- =====================================================
-- Estado anterior: RLS PARCIAL (solo SELECT, INSERT)
-- Estado nuevo: RLS COMPLETO

-- Habilitar RLS
ALTER TABLE gre ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas parciales
DROP POLICY IF EXISTS "Users can insert own tenant GRE" ON gre;
DROP POLICY IF EXISTS "Users can view own tenant GRE" ON gre;

-- Crear política consolidada
CREATE POLICY "gre_tenant_isolation" ON gre
  FOR ALL USING (
    tenant_id = app.current_tenant_id() 
    OR app.is_superadmin()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR app.is_superadmin()
  );

COMMENT ON POLICY "gre_tenant_isolation" ON gre IS 
  'Política RLS completa: Aislamiento de guías de remisión electrónicas por tenant.';

-- =====================================================
-- 3. TABLA SIRE_FILES (Archivos SIRE SUNAT)
-- =====================================================
-- Estado anterior: RLS PARCIAL (solo SELECT)
-- Estado nuevo: RLS COMPLETO

-- Habilitar RLS
ALTER TABLE sire_files ENABLE ROW LEVEL SECURITY;

-- Eliminar política parcial
DROP POLICY IF EXISTS "Users can view own tenant SIRE" ON sire_files;

-- Crear política consolidada
CREATE POLICY "sire_files_tenant_isolation" ON sire_files
  FOR ALL USING (
    tenant_id = app.current_tenant_id() 
    OR app.is_superadmin()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR app.is_superadmin()
  );

COMMENT ON POLICY "sire_files_tenant_isolation" ON sire_files IS 
  'Política RLS completa: Aislamiento de archivos SIRE (reportes fiscales) por tenant.';

-- =====================================================
-- 4. TABLA AUDITORIA (Auditoría General)
-- =====================================================
-- Estado anterior: RLS DESHABILITADO
-- Estado nuevo: RLS COMPLETO
-- Nota: Esta tabla complementa a audit_log que ya tiene RLS

-- Habilitar RLS
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- Crear política de aislamiento por tenant
CREATE POLICY "auditoria_tenant_isolation" ON auditoria
  FOR ALL USING (
    tenant_id = app.current_tenant_id() 
    OR app.is_superadmin()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR app.is_superadmin()
  );

COMMENT ON POLICY "auditoria_tenant_isolation" ON auditoria IS 
  'Política RLS completa: Los logs de auditoría son privados por tenant. Solo super-admins ven todos.';

-- =====================================================
-- 5. TABLA RLS_ALERT_CONFIG (Configuración de Alertas RLS)
-- =====================================================
-- Estado anterior: RLS DESHABILITADO
-- Estado nuevo: RLS HABILITADO con acceso global de lectura

-- Habilitar RLS
ALTER TABLE rls_alert_config ENABLE ROW LEVEL SECURITY;

-- Política 1: Super-admins pueden hacer todo
CREATE POLICY "rls_alert_config_superadmin_all" ON rls_alert_config
  FOR ALL USING (app.is_superadmin())
  WITH CHECK (app.is_superadmin());

-- Política 2: Usuarios autenticados pueden leer configuración de su tenant
CREATE POLICY "rls_alert_config_tenant_read" ON rls_alert_config
  FOR SELECT USING (
    tenant_id = app.current_tenant_id() 
    OR tenant_id IS NULL  -- Configuraciones globales del sistema
  );

COMMENT ON POLICY "rls_alert_config_superadmin_all" ON rls_alert_config IS 
  'Super-admins gestionan toda la configuración de alertas RLS del sistema.';

COMMENT ON POLICY "rls_alert_config_tenant_read" ON rls_alert_config IS 
  'Usuarios pueden ver configuración de alertas de su tenant y configuraciones globales.';

-- =====================================================
-- 6. TABLA RLS_ALERT_HISTORY (Historial de Alertas RLS)
-- =====================================================
-- Estado anterior: RLS DESHABILITADO
-- Estado nuevo: RLS HABILITADO con visibilidad por tenant

-- Habilitar RLS
ALTER TABLE rls_alert_history ENABLE ROW LEVEL SECURITY;

-- Política 1: Super-admins ven todo
CREATE POLICY "rls_alert_history_superadmin_all" ON rls_alert_history
  FOR ALL USING (app.is_superadmin())
  WITH CHECK (app.is_superadmin());

-- Política 2: Sistema puede insertar sin restricciones (triggers)
CREATE POLICY "rls_alert_history_system_insert" ON rls_alert_history
  FOR INSERT WITH CHECK (true);

-- Política 3: Usuarios ven alertas de su tenant
CREATE POLICY "rls_alert_history_tenant_read" ON rls_alert_history
  FOR SELECT USING (
    tenant_id = app.current_tenant_id()
  );

COMMENT ON POLICY "rls_alert_history_superadmin_all" ON rls_alert_history IS 
  'Super-admins monitorean todas las alertas RLS del sistema.';

COMMENT ON POLICY "rls_alert_history_system_insert" ON rls_alert_history IS 
  'El sistema (triggers) puede insertar alertas sin restricciones.';

COMMENT ON POLICY "rls_alert_history_tenant_read" ON rls_alert_history IS 
  'Los usuarios solo ven alertas RLS de su propio tenant.';

-- =====================================================
-- 7. VERIFICACIÓN DE POLÍTICAS APLICADAS
-- =====================================================

-- Verificar que todas las tablas tengan RLS habilitado
DO $$
DECLARE
  v_table text;
  v_rls_enabled boolean;
  v_error_count integer := 0;
BEGIN
  RAISE NOTICE '=== VERIFICACIÓN DE RLS - Migración 053 ===';
  
  FOR v_table IN (VALUES ('cpe'), ('gre'), ('sire_files'), ('auditoria'), ('rls_alert_config'), ('rls_alert_history'))
  LOOP
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class
    WHERE relname = v_table;
    
    IF v_rls_enabled THEN
      RAISE NOTICE '✓ Tabla % tiene RLS habilitado', v_table;
    ELSE
      RAISE WARNING '✗ ERROR: Tabla % NO tiene RLS habilitado', v_table;
      v_error_count := v_error_count + 1;
    END IF;
  END LOOP;
  
  IF v_error_count = 0 THEN
    RAISE NOTICE '=== ✓ TODAS LAS TABLAS TIENEN RLS HABILITADO ===';
  ELSE
    RAISE EXCEPTION 'ERROR: % tablas sin RLS. Abortando migración.', v_error_count;
  END IF;
END $$;

-- =====================================================
-- 8. REGISTRO EN AUDIT LOG
-- =====================================================

-- Registrar la aplicación de esta migración crítica
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
  'RLS_HARDENING',
  gen_random_uuid(),
  jsonb_build_object(
    'migration', '053_db_rls_fiscal_and_audit',
    'tables_updated', ARRAY['cpe', 'gre', 'sire_files', 'auditoria', 'rls_alert_config', 'rls_alert_history'],
    'policies_created', 10,
    'priority', 'CRITICAL',
    'sprint', 'Sprint 1 - Seguridad Multi-tenant'
  ),
  NULL,  -- System migration
  NULL,  -- System-wide
  jsonb_build_object(
    'action', 'ENABLE_RLS_FISCAL_TABLES',
    'compliance', 'PRODUCTION_BLOCKER_RESOLVED',
    'security_impact', 'HIGH'
  ),
  NOW()
);

-- =====================================================
-- 9. COMENTARIOS DE DOCUMENTACIÓN
-- =====================================================

COMMENT ON TABLE cpe IS 'Comprobantes de Pago Electrónicos (Facturas, Boletas, Notas). RLS completo habilitado en migración 053.';
COMMENT ON TABLE gre IS 'Guías de Remisión Electrónicas. RLS completo habilitado en migración 053.';
COMMENT ON TABLE sire_files IS 'Archivos SIRE (Sistema Integrado de Registros Electrónicos - SUNAT). RLS completo habilitado en migración 053.';
COMMENT ON TABLE auditoria IS 'Registro de auditoría general del sistema. RLS habilitado en migración 053.';
COMMENT ON TABLE rls_alert_config IS 'Configuración de alertas de violaciones RLS. RLS habilitado en migración 053.';
COMMENT ON TABLE rls_alert_history IS 'Historial de alertas RLS disparadas. RLS habilitado en migración 053.';

-- =====================================================
-- 10. COMMIT Y FINALIZACIÓN
-- =====================================================

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- TESTING REQUERIDO:
-- 1. Test de aislamiento: Usuario de tenant A no debe ver CPE/GRE de tenant B
-- 2. Test de super-admin: Super-admin debe ver todos los registros
-- 3. Test de inserción: Solo se pueden crear registros en el tenant actual
-- 4. Test de actualización: Solo se pueden modificar registros del tenant actual
-- 5. Test de eliminación: Solo se pueden eliminar registros del tenant actual
--
-- ROLLBACK:
-- En caso de necesitar rollback, ejecutar:
-- DROP POLICY "cpe_tenant_isolation" ON cpe;
-- DROP POLICY "gre_tenant_isolation" ON gre;
-- DROP POLICY "sire_files_tenant_isolation" ON sire_files;
-- DROP POLICY "auditoria_tenant_isolation" ON auditoria;
-- DROP POLICY "rls_alert_config_superadmin_all" ON rls_alert_config;
-- DROP POLICY "rls_alert_config_tenant_read" ON rls_alert_config;
-- DROP POLICY "rls_alert_history_superadmin_all" ON rls_alert_history;
-- DROP POLICY "rls_alert_history_system_insert" ON rls_alert_history;
-- DROP POLICY "rls_alert_history_tenant_read" ON rls_alert_history;
--
-- MONITOREO POST-DEPLOYMENT:
-- - Verificar que dashboard de seguridad no muestre errores RLS
-- - Monitorear tabla rls_audit_log para intentos de acceso bloqueados
-- - Validar que reportes fiscales sigan funcionando correctamente
-- =====================================================

