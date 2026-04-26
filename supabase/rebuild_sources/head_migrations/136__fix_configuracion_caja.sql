-- Migration 136: Fix configuracion_caja function and set sensible defaults
-- La función no se creó correctamente, la recreamos

-- Drop existing function first to allow return type change
DROP FUNCTION IF EXISTS obtener_configuracion_efectiva_caja(UUID, UUID);

-- Recrear la función con parámetros en orden correcto
CREATE OR REPLACE FUNCTION obtener_configuracion_efectiva_caja(
  p_tenant_id UUID,
  p_caja_id UUID
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  caja_id UUID,
  monto_apertura_min DECIMAL(10,2),
  monto_apertura_max DECIMAL(10,2),
  requiere_supervisor_fuera_rango BOOLEAN,
  tolerancia_diferencia_cierre DECIMAL(10,2)
) AS $$
BEGIN
  -- Try to get caja-specific configuration first
  RETURN QUERY
  SELECT 
    c.id,
    c.tenant_id,
    c.caja_id,
    c.monto_apertura_min,
    c.monto_apertura_max,
    c.requiere_supervisor_fuera_rango,
    c.tolerancia_diferencia_cierre
  FROM configuracion_caja c
  WHERE c.tenant_id = p_tenant_id
    AND c.caja_id = p_caja_id
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Try tenant default (caja_id IS NULL)
    RETURN QUERY
    SELECT 
      c.id,
      c.tenant_id,
      c.caja_id,
      c.monto_apertura_min,
      c.monto_apertura_max,
      c.requiere_supervisor_fuera_rango,
      c.tolerancia_diferencia_cierre
    FROM configuracion_caja c
    WHERE c.tenant_id = p_tenant_id
      AND c.caja_id IS NULL
    LIMIT 1;
  END IF;
  
  IF NOT FOUND THEN
    -- Return default values - monto_min = 0 para permitir cualquier apertura
    RETURN QUERY
    SELECT 
      gen_random_uuid() as id,
      p_tenant_id as tenant_id,
      NULL::UUID as caja_id,
      0.00::DECIMAL(10,2) as monto_apertura_min,
      50000.00::DECIMAL(10,2) as monto_apertura_max,
      FALSE as requiere_supervisor_fuera_rango,
      10.00::DECIMAL(10,2) as tolerancia_diferencia_cierre;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Insertar configuración por defecto para todos los tenants (monto_min = 0)
INSERT INTO configuracion_caja (tenant_id, caja_id, monto_apertura_min, monto_apertura_max, requiere_supervisor_fuera_rango)
SELECT 
  ec.tenant_id,
  NULL,
  0.00,
  50000.00,
  FALSE
FROM empresa_config ec
WHERE NOT EXISTS (
  SELECT 1 FROM configuracion_caja c WHERE c.tenant_id = ec.tenant_id AND c.caja_id IS NULL
);

COMMENT ON FUNCTION obtener_configuracion_efectiva_caja IS 
'Obtiene la configuración efectiva para una caja. Monto mínimo por defecto es 0 para permitir cualquier apertura.';
