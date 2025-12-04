-- Asegurar columnas consistentes en sesiones_caja para apertura/cierre
ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS monto_cierre NUMERIC(18,2);

ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS monto_inicio NUMERIC(18,2) DEFAULT 0;

-- Normalizar estado/hora_cierre para cierres atómicos
ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS hora_cierre TIMESTAMPTZ;

-- Comentarios para claridad
COMMENT ON COLUMN sesiones_caja.monto_cierre IS 'Monto contado al cierre de la sesión de caja';
COMMENT ON COLUMN sesiones_caja.monto_inicio IS 'Monto contado al inicio de la sesión de caja';
COMMENT ON COLUMN sesiones_caja.hora_cierre IS 'Fecha/hora de cierre de la sesión de caja';
