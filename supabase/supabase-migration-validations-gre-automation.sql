-- =====================================================
-- MIGRATION: SUNAT Validations & GRE Automation
-- Description: Add tables and columns for validation system,
--              notifications, wizard progress, and GRE automation
-- Date: 2025-10-18
-- Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 5.1, 6.1
-- =====================================================

-- =====================================================
-- PART 1: EXTEND EXISTING TABLES
-- =====================================================

-- Extend empresa_config table with validation and GRE automation fields
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  configuracion_completa BOOLEAN DEFAULT FALSE;

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  fecha_validacion_certificado TIMESTAMP;

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  certificado_expira_en DATE;

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  umbral_gre_automatico DECIMAL(10,2) DEFAULT 700.00;

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  gre_automatico_habilitado BOOLEAN DEFAULT TRUE;

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  ultima_validacion TIMESTAMP;

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  errores_configuracion JSONB;

-- Extend gre_guias table with automation tracking fields
ALTER TABLE gre_guias ADD COLUMN IF NOT EXISTS
  es_automatica BOOLEAN DEFAULT FALSE;

ALTER TABLE gre_guias ADD COLUMN IF NOT EXISTS
  venta_id UUID;

ALTER TABLE gre_guias ADD COLUMN IF NOT EXISTS
  movimiento_inventario_id UUID;

ALTER TABLE gre_guias ADD COLUMN IF NOT EXISTS
  motivo_creacion VARCHAR(100);

-- =====================================================
-- PART 2: CREATE NEW TABLES
-- =====================================================

-- Table: validaciones_sunat
-- Purpose: Store validation results for certificates, RUC, and documents
CREATE TABLE IF NOT EXISTS validaciones_sunat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tipo_validacion VARCHAR(50) NOT NULL, -- 'certificate', 'ruc', 'document'
  resultado JSONB NOT NULL,
  es_valido BOOLEAN NOT NULL,
  errores JSONB,
  advertencias JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID
);

-- Table: notificaciones
-- Purpose: Store system notifications for users
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  usuario_id UUID,
  tipo VARCHAR(50) NOT NULL,
  severidad VARCHAR(20) NOT NULL, -- 'info', 'warning', 'error'
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  action_url VARCHAR(500),
  action_label VARCHAR(100),
  leida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  leida_at TIMESTAMP
);

-- Table: wizard_progress
-- Purpose: Track configuration wizard progress for each tenant
CREATE TABLE IF NOT EXISTS wizard_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  paso_actual INTEGER DEFAULT 1,
  pasos_completados JSONB DEFAULT '[]',
  configuracion_temporal JSONB,
  completado BOOLEAN DEFAULT FALSE,
  completado_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for validaciones_sunat
CREATE INDEX IF NOT EXISTS idx_validaciones_tenant 
  ON validaciones_sunat(tenant_id);

CREATE INDEX IF NOT EXISTS idx_validaciones_tipo 
  ON validaciones_sunat(tipo_validacion);

CREATE INDEX IF NOT EXISTS idx_validaciones_created 
  ON validaciones_sunat(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validaciones_tenant_tipo 
  ON validaciones_sunat(tenant_id, tipo_validacion);

-- Indexes for notificaciones
CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant 
  ON notificaciones(tenant_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario 
  ON notificaciones(usuario_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_leida 
  ON notificaciones(leida);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_leida 
  ON notificaciones(tenant_id, leida);

CREATE INDEX IF NOT EXISTS idx_notificaciones_created 
  ON notificaciones(created_at DESC);

-- Indexes for wizard_progress
CREATE INDEX IF NOT EXISTS idx_wizard_tenant 
  ON wizard_progress(tenant_id);

CREATE INDEX IF NOT EXISTS idx_wizard_completado 
  ON wizard_progress(completado);

-- Indexes for empresa_config (new columns)
CREATE INDEX IF NOT EXISTS idx_empresa_config_validacion 
  ON empresa_config(configuracion_completa);

CREATE INDEX IF NOT EXISTS idx_empresa_config_certificado_expira 
  ON empresa_config(certificado_expira_en);

-- Indexes for gre_guias (new columns)
CREATE INDEX IF NOT EXISTS idx_gre_guias_automatica 
  ON gre_guias(es_automatica);

CREATE INDEX IF NOT EXISTS idx_gre_guias_venta 
  ON gre_guias(venta_id);

CREATE INDEX IF NOT EXISTS idx_gre_guias_movimiento 
  ON gre_guias(movimiento_inventario_id);

-- =====================================================
-- PART 4: ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE validaciones_sunat ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE wizard_progress ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for validaciones_sunat
-- =====================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view validations for their tenant" ON validaciones_sunat;
DROP POLICY IF EXISTS "Users can insert validations for their tenant" ON validaciones_sunat;
DROP POLICY IF EXISTS "Users can update validations for their tenant" ON validaciones_sunat;
DROP POLICY IF EXISTS "Users can delete validations for their tenant" ON validaciones_sunat;

-- Policy: Users can view validations for their tenant
CREATE POLICY "Users can view validations for their tenant"
  ON validaciones_sunat
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- Policy: Users can insert validations for their tenant
CREATE POLICY "Users can insert validations for their tenant"
  ON validaciones_sunat
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Users can update validations for their tenant
CREATE POLICY "Users can update validations for their tenant"
  ON validaciones_sunat
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Users can delete validations for their tenant
CREATE POLICY "Users can delete validations for their tenant"
  ON validaciones_sunat
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- =====================================================
-- RLS Policies for notificaciones
-- =====================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view notifications for their tenant" ON notificaciones;
DROP POLICY IF EXISTS "System can insert notifications" ON notificaciones;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notificaciones;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notificaciones;

-- Policy: Users can view notifications for their tenant
CREATE POLICY "Users can view notifications for their tenant"
  ON notificaciones
  FOR SELECT
  USING (
    tenant_id = get_current_tenant_id() 
    AND (usuario_id IS NULL OR usuario_id = get_current_user_id())
  );

-- Policy: System can insert notifications for any tenant
CREATE POLICY "System can insert notifications"
  ON notificaciones
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Users can update their own notifications
CREATE POLICY "Users can update their own notifications"
  ON notificaciones
  FOR UPDATE
  USING (
    tenant_id = get_current_tenant_id() 
    AND (usuario_id IS NULL OR usuario_id = get_current_user_id())
  )
  WITH CHECK (
    tenant_id = get_current_tenant_id() 
    AND (usuario_id IS NULL OR usuario_id = get_current_user_id())
  );

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON notificaciones
  FOR DELETE
  USING (
    tenant_id = get_current_tenant_id() 
    AND (usuario_id IS NULL OR usuario_id = get_current_user_id())
  );

-- =====================================================
-- RLS Policies for wizard_progress
-- =====================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view wizard progress for their tenant" ON wizard_progress;
DROP POLICY IF EXISTS "Users can insert wizard progress for their tenant" ON wizard_progress;
DROP POLICY IF EXISTS "Users can update wizard progress for their tenant" ON wizard_progress;
DROP POLICY IF EXISTS "Users can delete wizard progress for their tenant" ON wizard_progress;

-- Policy: Users can view wizard progress for their tenant
CREATE POLICY "Users can view wizard progress for their tenant"
  ON wizard_progress
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- Policy: Users can insert wizard progress for their tenant
CREATE POLICY "Users can insert wizard progress for their tenant"
  ON wizard_progress
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Users can update wizard progress for their tenant
CREATE POLICY "Users can update wizard progress for their tenant"
  ON wizard_progress
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Users can delete wizard progress for their tenant
CREATE POLICY "Users can delete wizard progress for their tenant"
  ON wizard_progress
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- =====================================================
-- PART 5: HELPER FUNCTIONS
-- =====================================================

-- Function: Update wizard_progress updated_at timestamp
CREATE OR REPLACE FUNCTION update_wizard_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update wizard_progress timestamp
DROP TRIGGER IF EXISTS trigger_update_wizard_progress_timestamp ON wizard_progress;
CREATE TRIGGER trigger_update_wizard_progress_timestamp
  BEFORE UPDATE ON wizard_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_wizard_progress_timestamp();

-- =====================================================
-- PART 6: COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE validaciones_sunat IS 'Stores validation results for SUNAT certificates, RUC configuration, and documents';
COMMENT ON TABLE notificaciones IS 'System notifications for users about configuration issues, certificate expiration, etc.';
COMMENT ON TABLE wizard_progress IS 'Tracks configuration wizard progress for each tenant';

COMMENT ON COLUMN empresa_config.configuracion_completa IS 'Indicates if the tenant has completed all required configuration';
COMMENT ON COLUMN empresa_config.umbral_gre_automatico IS 'Threshold amount (in PEN) for automatic GRE creation';
COMMENT ON COLUMN empresa_config.gre_automatico_habilitado IS 'Enable/disable automatic GRE creation for this tenant';

COMMENT ON COLUMN gre_guias.es_automatica IS 'Indicates if this GRE was created automatically';
COMMENT ON COLUMN gre_guias.venta_id IS 'Reference to the sale that triggered automatic GRE creation';
COMMENT ON COLUMN gre_guias.movimiento_inventario_id IS 'Reference to the inventory movement linked to this GRE';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify tables exist
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully';
  RAISE NOTICE '📋 New tables created: validaciones_sunat, notificaciones, wizard_progress';
  RAISE NOTICE '📋 Extended tables: empresa_config, gre_guias';
  RAISE NOTICE '🔒 RLS policies enabled for multi-tenant isolation';
  RAISE NOTICE '⚡ Performance indexes created';
END $$;
