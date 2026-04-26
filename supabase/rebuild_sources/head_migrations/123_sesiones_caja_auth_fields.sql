-- Migration 123: Add authorization tracking fields to sesiones_caja
-- Links sessions to supervisor authorizations

ALTER TABLE sesiones_caja
ADD COLUMN IF NOT EXISTS requirio_autorizacion BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS autorizacion_supervisor_id UUID REFERENCES usuarios_sistema(id),
ADD COLUMN IF NOT EXISTS razon_autorizacion TEXT;

-- Index for querying sessions that required authorization
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_autorizacion 
ON sesiones_caja(requirio_autorizacion) 
WHERE requirio_autorizacion = TRUE;

-- Index for supervisor foreign key
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_supervisor 
ON sesiones_caja(autorizacion_supervisor_id)
WHERE autorizacion_supervisor_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN sesiones_caja.requirio_autorizacion IS 
'TRUE si la apertura de esta sesión requirió autorización de supervisor por monto fuera del rango permitido.';

COMMENT ON COLUMN sesiones_caja.autorizacion_supervisor_id IS 
'ID del supervisor que autorizó la apertura con monto atípico. NULL si no requirió autorización.';

COMMENT ON COLUMN sesiones_caja.razon_autorizacion IS 
'Razón proporcionada por el supervisor para justificar el monto atípico de apertura.';

-- Optional: Add constraint to ensure authorization fields are consistent
ALTER TABLE sesiones_caja
ADD CONSTRAINT check_autorizacion_consistente CHECK (
  (requirio_autorizacion = FALSE AND autorizacion_supervisor_id IS NULL AND razon_autorizacion IS NULL) OR
  (requirio_autorizacion = TRUE AND autorizacion_supervisor_id IS NOT NULL AND razon_autorizacion IS NOT NULL)
);

COMMENT ON CONSTRAINT check_autorizacion_consistente ON sesiones_caja IS 
'Garantiza que si requirio_autorizacion es TRUE, debe haber supervisor_id y razón, y viceversa.';
