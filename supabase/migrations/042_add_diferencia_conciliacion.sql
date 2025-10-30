-- Migration 042: Agregar columna diferencia_conciliacion
-- Fecha: 2025-10-26
-- Descripción: Agrega columna para registrar diferencias en conciliación manual

DO $$
BEGIN
  -- Agregar diferencia_conciliacion si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='diferencia_conciliacion') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN diferencia_conciliacion NUMERIC(12,2) DEFAULT 0;
    RAISE NOTICE 'Agregado: diferencia_conciliacion';
  END IF;

  -- Agregar movimiento_relacionado_id para vincular el par de movimientos conciliados
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='movimiento_relacionado_id') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN movimiento_relacionado_id UUID REFERENCES movimientos_bancarios(id) ON DELETE SET NULL;
    RAISE NOTICE 'Agregado: movimiento_relacionado_id';
  END IF;

  RAISE NOTICE '✓ Migración 042 completada: columnas de diferencia agregadas';
  
END $$;

-- Actualizar comentarios
COMMENT ON COLUMN movimientos_bancarios.diferencia_conciliacion IS 'Diferencia de monto detectada durante conciliación manual (monto_extracto - monto_sistema)';
COMMENT ON COLUMN movimientos_bancarios.movimiento_relacionado_id IS 'ID del movimiento con el que fue conciliado (sistema ↔ extracto)';

-- Crear índice para movimiento_relacionado_id
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_relacionado ON movimientos_bancarios(movimiento_relacionado_id);
