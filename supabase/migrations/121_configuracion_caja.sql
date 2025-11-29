-- Migration 121: Update configuracion_caja table
-- Stores min/max thresholds for cash register opening amounts
-- Note: Table might already exist from migration 119

DO $$ 
BEGIN
  -- 1. Create table if not exists (handled by IF NOT EXISTS, but we need to handle columns)
  CREATE TABLE IF NOT EXISTS configuracion_caja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 2. Add columns if they don't exist
  BEGIN
    ALTER TABLE configuracion_caja ADD COLUMN caja_id UUID REFERENCES cajas(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE configuracion_caja ADD COLUMN monto_apertura_min DECIMAL(10,2) NOT NULL DEFAULT 100.00;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE configuracion_caja ADD COLUMN monto_apertura_max DECIMAL(10,2) NOT NULL DEFAULT 2000.00;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE configuracion_caja ADD COLUMN requiere_supervisor_fuera_rango BOOLEAN NOT NULL DEFAULT TRUE;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  BEGIN
    ALTER TABLE configuracion_caja ADD COLUMN tolerancia_diferencia_cierre DECIMAL(10,2) DEFAULT 10.00;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  -- 3. Add constraints if they don't exist
  BEGIN
    ALTER TABLE configuracion_caja ADD CONSTRAINT monto_min_menor_max CHECK (monto_apertura_min < monto_apertura_max);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE configuracion_caja ADD CONSTRAINT monto_min_positivo CHECK (monto_apertura_min >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE configuracion_caja ADD CONSTRAINT unique_config_per_caja UNIQUE (tenant_id, caja_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

END $$;

-- Indexes (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant ON configuracion_caja(tenant_id);
CREATE INDEX IF NOT EXISTS idx_configuracion_caja_caja ON configuracion_caja(caja_id);

-- Default configuration index (caja_id IS NULL = tenant default)
CREATE INDEX IF NOT EXISTS idx_configuracion_caja_default ON configuracion_caja(tenant_id) 
WHERE caja_id IS NULL;

-- Comments
COMMENT ON TABLE configuracion_caja IS 
'Configuración de parámetros operativos para cajas registradoras. Soporta configuración específica por caja o configuración por defecto a nivel de tenant (caja_id NULL).';

COMMENT ON COLUMN configuracion_caja.caja_id IS 
'NULL = configuración por defecto para todas las cajas del tenant. UUID = configuración específica para una caja.';

COMMENT ON COLUMN configuracion_caja.monto_apertura_min IS 
'Monto mínimo permitido para apertura de caja. Montos menores requieren autorización de supervisor.';

COMMENT ON COLUMN configuracion_caja.monto_apertura_max IS 
'Monto máximo permitido para apertura de caja. Montos mayores requieren autorización de supervisor.';

COMMENT ON COLUMN configuracion_caja.tolerancia_diferencia_cierre IS 
'Diferencia máxima permitida entre efectivo contado y esperado al cierre sin requerir autorización.';

-- RLS Policies
ALTER TABLE configuracion_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS configuracion_caja_tenant_isolation ON configuracion_caja;
CREATE POLICY configuracion_caja_tenant_isolation ON configuracion_caja
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Function to get effective configuration for a caja
CREATE OR REPLACE FUNCTION obtener_configuracion_efectiva_caja(
  p_tenant_id UUID,
  p_caja_id UUID
)
RETURNS configuracion_caja AS $$
DECLARE
  v_config configuracion_caja;
BEGIN
  -- Try to get caja-specific configuration first
  SELECT * INTO v_config
  FROM configuracion_caja
  WHERE tenant_id = p_tenant_id
    AND caja_id = p_caja_id
  LIMIT 1;
  
  -- If not found, get tenant default (caja_id IS NULL)
  IF NOT FOUND THEN
    SELECT * INTO v_config
    FROM configuracion_caja
    WHERE tenant_id = p_tenant_id
      AND caja_id IS NULL
    LIMIT 1;
  END IF;
  
  -- If still not found, return default values
  IF NOT FOUND THEN
    v_config.id := gen_random_uuid();
    v_config.tenant_id := p_tenant_id;
    v_config.caja_id := NULL;
    v_config.monto_apertura_min := 100.00;
    v_config.monto_apertura_max := 2000.00;
    v_config.requiere_supervisor_fuera_rango := TRUE;
    v_config.tolerancia_diferencia_cierre := 10.00;
  END IF;
  
  RETURN v_config;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION obtener_configuracion_efectiva_caja IS 
'Obtiene la configuración efectiva para una caja: primero busca configuración específica, luego tenant default, finalmente valores hardcoded.'; 
