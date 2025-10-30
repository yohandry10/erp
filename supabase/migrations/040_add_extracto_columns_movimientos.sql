-- Migration 040: Agregar columnas para extractos bancarios en movimientos_bancarios
-- Fecha: 2025-10-26
-- Descripción: Agrega columnas es_extracto y conciliacion_id para soportar importación de extractos

DO $$
BEGIN
  -- Agregar es_extracto si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='es_extracto') THEN
    ALTER TABLE movimientos_bancarios 
    ADD COLUMN es_extracto BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN movimientos_bancarios.es_extracto IS 'Indica si el movimiento proviene de un extracto bancario importado';
  END IF;
  
  -- Agregar conciliacion_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='conciliacion_id') THEN
    ALTER TABLE movimientos_bancarios 
    ADD COLUMN conciliacion_id UUID REFERENCES conciliaciones_bancarias(id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN movimientos_bancarios.conciliacion_id IS 'Conciliación bancaria asociada (para movimientos de extracto)';
  END IF;
END $$;

-- Crear índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_extracto ON movimientos_bancarios(tenant_id, es_extracto);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_conciliacion ON movimientos_bancarios(conciliacion_id);

-- Actualizar comentario de la tabla
COMMENT ON TABLE movimientos_bancarios IS 'Movimientos bancarios de ingresos (cobros), egresos (pagos) y extractos importados';
