-- =====================================================
-- MIGRACIÓN 130: Tabla de Estado de Rotación de Secrets
-- =====================================================
-- Q57: Soporte para rotación automática de secrets con auditoría
-- =====================================================

-- 1. Tabla para registrar estado de rotación de secrets
CREATE TABLE IF NOT EXISTS secret_rotation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key VARCHAR(100) NOT NULL,
  current_secret_hash VARCHAR(32) NOT NULL, -- Solo hash parcial para verificación
  previous_secret_hash VARCHAR(32),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grace_period_hours INTEGER DEFAULT 24,
  rotated_by VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_secret_rotation_key ON secret_rotation_state(secret_key);
CREATE INDEX IF NOT EXISTS idx_secret_rotation_date ON secret_rotation_state(rotated_at DESC);

-- 2. Tabla para alertas del sistema (si no existe)
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message TEXT NOT NULL,
  metadata JSONB,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_unack ON system_alerts(acknowledged) WHERE acknowledged = FALSE;

-- 3. Vista de secrets que necesitan rotación
CREATE OR REPLACE VIEW v_secrets_rotation_status AS
SELECT 
  secret_key,
  MAX(rotated_at) as last_rotation,
  EXTRACT(DAY FROM NOW() - MAX(rotated_at)) as days_since_rotation,
  CASE 
    WHEN MAX(rotated_at) IS NULL THEN 'NEVER_ROTATED'
    WHEN EXTRACT(DAY FROM NOW() - MAX(rotated_at)) > 90 THEN 'OVERDUE'
    WHEN EXTRACT(DAY FROM NOW() - MAX(rotated_at)) > 83 THEN 'DUE_SOON'
    ELSE 'OK'
  END as status
FROM secret_rotation_state
GROUP BY secret_key;

-- 4. Función para limpiar registros antiguos de rotación
CREATE OR REPLACE FUNCTION cleanup_old_rotation_records(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM secret_rotation_state
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Comentarios
COMMENT ON TABLE secret_rotation_state IS 'Registro de rotación de secrets para auditoría (Q57)';
COMMENT ON TABLE system_alerts IS 'Alertas del sistema incluyendo rotación de secrets';
COMMENT ON VIEW v_secrets_rotation_status IS 'Estado de rotación de secrets con indicador de urgencia';

DO $$
BEGIN
  RAISE NOTICE '✅ Migración 130: Tabla de Estado de Rotación de Secrets completada';
END $$;
