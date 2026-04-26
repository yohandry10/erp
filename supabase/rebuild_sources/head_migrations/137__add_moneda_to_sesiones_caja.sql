-- Migration 137: Agregar columna moneda a sesiones_caja si no existe
-- La columna moneda es requerida por el servicio de cajas

ALTER TABLE sesiones_caja 
ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'PEN';

COMMENT ON COLUMN sesiones_caja.moneda IS 'Moneda de la sesión de caja (PEN, USD, etc.)';
