-- =====================================================
-- Migración 142: Soporte para Tenants Demo
-- =====================================================

-- PASO 1: MODIFICAR TABLA EMPRESA_CONFIG
ALTER TABLE empresa_config 
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_extended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_conversion_attempted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_seed_version VARCHAR(10),
  ADD COLUMN IF NOT EXISTS demo_seed_completed_at TIMESTAMPTZ;

-- PASO 2: MODIFICAR TABLA USUARIOS_SISTEMA
ALTER TABLE usuarios_sistema
  ADD COLUMN IF NOT EXISTS is_demo_user BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_email_temp VARCHAR;

-- PASO 3: CREAR ÍNDICES
CREATE INDEX IF NOT EXISTS idx_empresa_config_demo 
  ON empresa_config(is_demo, demo_expires_at) 
  WHERE is_demo = true;

CREATE INDEX IF NOT EXISTS idx_usuarios_demo 
  ON usuarios_sistema(tenant_id, is_demo_user) 
  WHERE is_demo_user = true;

-- PASO 4: FUNCIÓN DE LIMPIEZA
CREATE OR REPLACE FUNCTION cleanup_expired_demo_tenants()
RETURNS TABLE(
  tenants_desactivados INTEGER,
  tenants_eliminados INTEGER
) AS $$
DECLARE
  v_desactivados INTEGER := 0;
  v_eliminados INTEGER := 0;
  v_tenant_id UUID;
BEGIN
  UPDATE empresa_config 
  SET estado = 'INACTIVO', updated_at = NOW()
  WHERE is_demo = true 
    AND demo_expires_at < NOW() 
    AND estado != 'INACTIVO'
    AND demo_expires_at > NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_desactivados = ROW_COUNT;
  
  FOR v_tenant_id IN 
    SELECT tenant_id 
    FROM empresa_config
    WHERE is_demo = true AND demo_expires_at < NOW() - INTERVAL '30 days'
  LOOP
    DELETE FROM empresa_config WHERE tenant_id = v_tenant_id;
    v_eliminados := v_eliminados + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_desactivados, v_eliminados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 5: FUNCIONES DE UTILIDAD
CREATE OR REPLACE FUNCTION is_demo_expired(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_demo BOOLEAN;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT is_demo, demo_expires_at 
  INTO v_is_demo, v_expires_at
  FROM empresa_config
  WHERE tenant_id = p_tenant_id;
  
  IF NOT v_is_demo OR v_expires_at IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_expires_at < NOW();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_demo_days_remaining(p_tenant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_is_demo BOOLEAN;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT is_demo, demo_expires_at 
  INTO v_is_demo, v_expires_at
  FROM empresa_config
  WHERE tenant_id = p_tenant_id;
  
  IF NOT v_is_demo OR v_expires_at IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN EXTRACT(DAY FROM (v_expires_at - NOW()))::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- PASO 6: VISTA DASHBOARD
CREATE OR REPLACE VIEW vw_demo_dashboard AS
SELECT 
  ec.tenant_id,
  ec.razon_social AS tenant_nombre,
  ec.ruc,
  ec.email,
  ec.demo_created_at,
  ec.demo_expires_at,
  EXTRACT(DAY FROM (ec.demo_expires_at - NOW()))::INTEGER AS dias_restantes,
  ec.demo_extended,
  ec.demo_conversion_attempted,
  ec.estado,
  CASE 
    WHEN ec.demo_expires_at < NOW() THEN 'EXPIRADO'
    WHEN ec.demo_expires_at < NOW() + INTERVAL '3 days' THEN 'POR_EXPIRAR'
    ELSE 'ACTIVO'
  END AS estado_demo,
  u.id AS usuario_id,
  u.email AS usuario_email,
  u.nombre AS usuario_nombre,
  u.demo_email_temp,
  ec.demo_seed_version,
  ec.demo_seed_completed_at,
  ec.configuracion_completa,
  ec.created_at,
  ec.updated_at
FROM empresa_config ec
LEFT JOIN usuarios_sistema u ON u.tenant_id = ec.tenant_id AND u.is_demo_user = true
WHERE ec.is_demo = true
ORDER BY ec.demo_created_at DESC;

-- PASO 7: CONSTRAINT
ALTER TABLE empresa_config
  DROP CONSTRAINT IF EXISTS check_demo_has_expiration;

ALTER TABLE empresa_config
  ADD CONSTRAINT check_demo_has_expiration
  CHECK ((is_demo = false) OR (is_demo = true AND demo_expires_at IS NOT NULL));

-- PASO 8: GRANTS
GRANT EXECUTE ON FUNCTION cleanup_expired_demo_tenants() TO postgres;
GRANT EXECUTE ON FUNCTION is_demo_expired(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_demo_days_remaining(UUID) TO authenticated;
GRANT SELECT ON vw_demo_dashboard TO authenticated;
