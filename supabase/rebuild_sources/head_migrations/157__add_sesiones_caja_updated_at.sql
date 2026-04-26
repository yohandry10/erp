-- Agrega columna updated_at a sesiones_caja para evitar errores en funciones/transacciones POS
ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN sesiones_caja.updated_at IS 'Marca de tiempo de última actualización de la sesión de caja';
