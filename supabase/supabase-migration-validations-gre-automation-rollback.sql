-- =====================================================
-- ROLLBACK: SUNAT Validations & GRE Automation
-- Description: Rollback migration for validation system,
--              notifications, wizard progress, and GRE automation
-- Date: 2025-10-18
-- =====================================================

-- =====================================================
-- PART 1: DROP RLS POLICIES
-- =====================================================

-- Drop RLS policies for validaciones_sunat
DROP POLICY IF EXISTS "Users can view validations for their tenant" ON validaciones_sunat;
DROP POLICY IF EXISTS "Users can insert validations for their tenant" ON validaciones_sunat;
DROP POLICY IF EXISTS "Users can update validations for their tenant" ON validaciones_sunat;
DROP POLICY IF EXISTS "Users can delete validations for their tenant" ON validaciones_sunat;

-- Drop RLS policies for notificaciones
DROP POLICY IF EXISTS "Users can view notifications for their tenant" ON notificaciones;
DROP POLICY IF EXISTS "System can insert notifications" ON notificaciones;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notificaciones;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notificaciones;

-- Drop RLS policies for wizard_progress
DROP POLICY IF EXISTS "Users can view wizard progress for their tenant" ON wizard_progress;
DROP POLICY IF EXISTS "Users can insert wizard progress for their tenant" ON wizard_progress;
DROP POLICY IF EXISTS "Users can update wizard progress for their tenant" ON wizard_progress;
DROP POLICY IF EXISTS "Users can delete wizard progress for their tenant" ON wizard_progress;

-- =====================================================
-- PART 2: DROP TRIGGERS AND FUNCTIONS
-- =====================================================

DROP TRIGGER IF EXISTS trigger_update_wizard_progress_timestamp ON wizard_progress;
DROP FUNCTION IF EXISTS update_wizard_progress_timestamp();

-- =====================================================
-- PART 3: DROP INDEXES
-- =====================================================

-- Drop indexes for validaciones_sunat
DROP INDEX IF EXISTS idx_validaciones_tenant;
DROP INDEX IF EXISTS idx_validaciones_tipo;
DROP INDEX IF EXISTS idx_validaciones_created;
DROP INDEX IF EXISTS idx_validaciones_tenant_tipo;

-- Drop indexes for notificaciones
DROP INDEX IF EXISTS idx_notificaciones_tenant;
DROP INDEX IF EXISTS idx_notificaciones_usuario;
DROP INDEX IF EXISTS idx_notificaciones_leida;
DROP INDEX IF EXISTS idx_notificaciones_tenant_leida;
DROP INDEX IF EXISTS idx_notificaciones_created;

-- Drop indexes for wizard_progress
DROP INDEX IF EXISTS idx_wizard_tenant;
DROP INDEX IF EXISTS idx_wizard_completado;

-- Drop indexes for empresa_config
DROP INDEX IF EXISTS idx_empresa_config_validacion;
DROP INDEX IF EXISTS idx_empresa_config_certificado_expira;

-- Drop indexes for gre_guias
DROP INDEX IF EXISTS idx_gre_guias_automatica;
DROP INDEX IF EXISTS idx_gre_guias_venta;
DROP INDEX IF EXISTS idx_gre_guias_movimiento;

-- =====================================================
-- PART 4: DROP NEW TABLES
-- =====================================================

DROP TABLE IF EXISTS validaciones_sunat CASCADE;
DROP TABLE IF EXISTS notificaciones CASCADE;
DROP TABLE IF EXISTS wizard_progress CASCADE;

-- =====================================================
-- PART 5: REMOVE COLUMNS FROM EXISTING TABLES
-- =====================================================

-- Remove columns from empresa_config
ALTER TABLE empresa_config DROP COLUMN IF EXISTS configuracion_completa;
ALTER TABLE empresa_config DROP COLUMN IF EXISTS fecha_validacion_certificado;
ALTER TABLE empresa_config DROP COLUMN IF EXISTS certificado_expira_en;
ALTER TABLE empresa_config DROP COLUMN IF EXISTS umbral_gre_automatico;
ALTER TABLE empresa_config DROP COLUMN IF EXISTS gre_automatico_habilitado;
ALTER TABLE empresa_config DROP COLUMN IF EXISTS ultima_validacion;
ALTER TABLE empresa_config DROP COLUMN IF EXISTS errores_configuracion;

-- Remove columns from gre_guias
ALTER TABLE gre_guias DROP COLUMN IF EXISTS es_automatica;
ALTER TABLE gre_guias DROP COLUMN IF EXISTS venta_id;
ALTER TABLE gre_guias DROP COLUMN IF EXISTS movimiento_inventario_id;
ALTER TABLE gre_guias DROP COLUMN IF EXISTS motivo_creacion;

-- =====================================================
-- ROLLBACK COMPLETE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Rollback completed successfully';
  RAISE NOTICE '🗑️ Dropped tables: validaciones_sunat, notificaciones, wizard_progress';
  RAISE NOTICE '🗑️ Removed columns from: empresa_config, gre_guias';
  RAISE NOTICE '🗑️ Dropped all indexes and RLS policies';
END $$;
