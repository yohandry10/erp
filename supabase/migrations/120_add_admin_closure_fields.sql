-- Migration to add administrative closure tracking fields to sesiones_caja

-- Add campos para rastrear cierres administrativos
ALTER TABLE sesiones_caja
ADD COLUMN IF NOT EXISTS es_cierre_administrativo BOOLEAN DEFAULT FALSE;

ALTER TABLE sesiones_caja
ADD COLUMN IF NOT EXISTS razon_cierre_administrativo TEXT;

-- Índice para búsqueda de cierres administrativos en reportes
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_cierre_admin 
ON sesiones_caja(es_cierre_administrativo) 
WHERE es_cierre_administrativo = TRUE;

-- Comentario en tabla
COMMENT ON COLUMN sesiones_caja.es_cierre_administrativo IS 
'Marca si la sesión fue cerrada por un administrador/supervisor debido a sesión colgada. Se usa para auditoría y reportes de sesiones anormales.';

COMMENT ON COLUMN sesiones_caja.razon_cierre_administrativo IS 
'Razón detallada proporcionada por el administrador para el cierre forzoso. Ejemplos: "Corte de luz", "Sistema caído", "Cajero sin cerrar sesión".';
