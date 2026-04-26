-- Migration 038: Agregar columnas para CxC y Cliente en movimientos_bancarios
-- Fecha: 2025-10-25
-- Descripción: Agrega columnas cliente_id y cxc_id a movimientos_bancarios para soportar cobros de clientes

-- Agregar columnas para cobros de clientes
DO $$ 
BEGIN
  -- Agregar cliente_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='cliente_id') THEN
    ALTER TABLE movimientos_bancarios 
    ADD COLUMN cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN movimientos_bancarios.cliente_id IS 'Cliente relacionado (para cobros)';
  END IF;
  
  -- Agregar cxc_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='cxc_id') THEN
    ALTER TABLE movimientos_bancarios 
    ADD COLUMN cxc_id UUID REFERENCES cuentas_por_cobrar(id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN movimientos_bancarios.cxc_id IS 'Cuenta por cobrar relacionada (si aplica)';
  END IF;
END $$;

-- Crear índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_cliente ON movimientos_bancarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_cxc ON movimientos_bancarios(cxc_id);

-- Agregar comentario actualizado a la tabla
COMMENT ON TABLE movimientos_bancarios IS 'Movimientos bancarios de ingresos (cobros) y egresos (pagos)';
