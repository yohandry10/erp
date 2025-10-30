-- Migración: Agregar campos para manejar facturación pendiente en ventas POS
-- Tarea 12: SI FALLA GENERACIÓN DE CPE EN POS, VENTA PUEDE QUEDAR SIN FACTURAR

DO $$
BEGIN
  -- Agregar campo para indicar si el CPE está pendiente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ventas_pos' AND column_name = 'cpe_pendiente'
  ) THEN
    ALTER TABLE ventas_pos ADD COLUMN cpe_pendiente BOOLEAN DEFAULT false;
    COMMENT ON COLUMN ventas_pos.cpe_pendiente IS 'Indica si la venta POS tiene facturación pendiente';
  END IF;

  -- Agregar campo para contar intentos de facturación
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ventas_pos' AND column_name = 'intentos_facturacion'
  ) THEN
    ALTER TABLE ventas_pos ADD COLUMN intentos_facturacion INTEGER DEFAULT 0;
    COMMENT ON COLUMN ventas_pos.intentos_facturacion IS 'Número de intentos de facturación realizados';
  END IF;

  -- Agregar campo para almacenar fecha del último intento
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ventas_pos' AND column_name = 'ultimo_intento_facturacion'
  ) THEN
    ALTER TABLE ventas_pos ADD COLUMN ultimo_intento_facturacion TIMESTAMPTZ;
    COMMENT ON COLUMN ventas_pos.ultimo_intento_facturacion IS 'Fecha del último intento de facturación';
  END IF;

  -- Agregar campo para almacenar error de facturación
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ventas_pos' AND column_name = 'error_facturacion'
  ) THEN
    ALTER TABLE ventas_pos ADD COLUMN error_facturacion TEXT;
    COMMENT ON COLUMN ventas_pos.error_facturacion IS 'Mensaje de error del último intento de facturación';
  END IF;

  -- Agregar campo para almacenar datos CPE para reintentos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ventas_pos' AND column_name = 'cpe_data'
  ) THEN
    ALTER TABLE ventas_pos ADD COLUMN cpe_data JSONB;
    COMMENT ON COLUMN ventas_pos.cpe_data IS 'Datos del CPE para reintentar facturación';
  END IF;
END $$;

-- Crear índice para búsqueda eficiente de ventas pendientes de facturación
CREATE INDEX IF NOT EXISTS idx_ventas_pos_cpe_pendiente 
ON ventas_pos(tenant_id, cpe_pendiente, ultimo_intento_facturacion) 
WHERE cpe_pendiente = true;

COMMENT ON INDEX idx_ventas_pos_cpe_pendiente IS 'Índice para búsqueda eficiente de ventas POS pendientes de facturación';

