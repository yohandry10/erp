-- Migration 125: Agregar campos forenses a sesiones_caja
-- Q13: Trazabilidad completa de apertura con geolocalización y foto
-- ============================================

-- Agregar campos de trazabilidad forense
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS geolocalizacion JSONB;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS foto_apertura TEXT;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS foto_cierre TEXT;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Comentarios descriptivos
COMMENT ON COLUMN sesiones_caja.ip_address IS 'Dirección IP desde donde se abrió la caja';
COMMENT ON COLUMN sesiones_caja.geolocalizacion IS 'Coordenadas GPS {lat, lng, accuracy, timestamp} capturadas al abrir';
COMMENT ON COLUMN sesiones_caja.foto_apertura IS 'URL de foto del conteo inicial de efectivo';
COMMENT ON COLUMN sesiones_caja.foto_cierre IS 'URL de foto del arqueo final';
COMMENT ON COLUMN sesiones_caja.user_agent IS 'User agent del dispositivo/navegador';

-- Índice para búsquedas por IP (detección de fraude)
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_ip ON sesiones_caja(ip_address) 
WHERE ip_address IS NOT NULL;

-- Función para validar estructura de geolocalización
CREATE OR REPLACE FUNCTION validar_geolocalizacion(geo JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  IF geo IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Validar que tenga lat y lng
  IF NOT (geo ? 'lat' AND geo ? 'lng') THEN
    RETURN FALSE;
  END IF;
  
  -- Validar rangos válidos
  IF (geo->>'lat')::NUMERIC < -90 OR (geo->>'lat')::NUMERIC > 90 THEN
    RETURN FALSE;
  END IF;
  
  IF (geo->>'lng')::NUMERIC < -180 OR (geo->>'lng')::NUMERIC > 180 THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Constraint para validar geolocalización
ALTER TABLE sesiones_caja DROP CONSTRAINT IF EXISTS chk_geolocalizacion_valida;
ALTER TABLE sesiones_caja ADD CONSTRAINT chk_geolocalizacion_valida 
  CHECK (validar_geolocalizacion(geolocalizacion));

COMMENT ON FUNCTION validar_geolocalizacion IS 'Valida que la geolocalización tenga lat/lng en rangos válidos';
