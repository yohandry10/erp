-- Migration 002: Agregar campo stock_reservado a tabla productos
-- Fecha: 2025-01-18
-- Descripción: Agrega el campo stock_reservado para control de reservas de inventario

-- =====================================================
-- AGREGAR CAMPO stock_reservado A TABLA productos
-- =====================================================

DO $$ 
BEGIN
  -- Verificar si el campo stock_reservado ya existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='productos' AND column_name='stock_reservado'
  ) THEN
    -- Agregar el campo
    ALTER TABLE productos 
    ADD COLUMN stock_reservado NUMERIC(12,2) DEFAULT 0 NOT NULL;
    
    -- Agregar constraint para que no sea negativo
    ALTER TABLE productos 
    ADD CONSTRAINT chk_stock_reservado_no_negativo 
    CHECK (stock_reservado >= 0);
    
    RAISE NOTICE 'Campo stock_reservado agregado exitosamente a tabla productos';
  ELSE
    RAISE NOTICE 'Campo stock_reservado ya existe en tabla productos';
  END IF;
END $$;

-- Crear índice para consultas de stock
-- NOTA: La tabla productos usa el campo 'stock' (INTEGER, no 'stock_actual')
CREATE INDEX IF NOT EXISTS idx_productos_stock_reservado 
  ON productos(stock, stock_reservado);

-- Comentario explicativo
COMMENT ON COLUMN productos.stock_reservado IS 'Stock reservado por pedidos confirmados. Stock disponible = stock - stock_reservado';
