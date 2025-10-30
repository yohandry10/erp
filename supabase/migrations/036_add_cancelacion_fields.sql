-- Migration 036: Add cancellation fields to ordenes_compra
-- Fecha: 2025-10-25
-- Descripción: Agrega campos necesarios para la cancelación de órdenes de compra

-- Agregar campos de cancelación a ordenes_compra
DO $$ 
BEGIN
  -- Agregar cancelado_at si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='cancelado_at') THEN
    ALTER TABLE ordenes_compra ADD COLUMN cancelado_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Agregar cancelado_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='cancelado_by') THEN
    ALTER TABLE ordenes_compra ADD COLUMN cancelado_by UUID;
  END IF;
  
  -- Agregar motivo_cancelacion si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='motivo_cancelacion') THEN
    ALTER TABLE ordenes_compra ADD COLUMN motivo_cancelacion TEXT;
  END IF;
  
  -- Agregar rechazado_at si no existe (para consistencia con rechazar)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='rechazado_at') THEN
    ALTER TABLE ordenes_compra ADD COLUMN rechazado_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Agregar rechazado_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='rechazado_by') THEN
    ALTER TABLE ordenes_compra ADD COLUMN rechazado_by UUID;
  END IF;
  
  -- Agregar motivo_rechazo si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='motivo_rechazo') THEN
    ALTER TABLE ordenes_compra ADD COLUMN motivo_rechazo TEXT;
  END IF;
END $$;

-- Actualizar comentarios
COMMENT ON COLUMN ordenes_compra.cancelado_at IS 'Fecha y hora de cancelación de la orden';
COMMENT ON COLUMN ordenes_compra.cancelado_by IS 'ID del usuario que canceló la orden';
COMMENT ON COLUMN ordenes_compra.motivo_cancelacion IS 'Motivo de la cancelación de la orden';
COMMENT ON COLUMN ordenes_compra.rechazado_at IS 'Fecha y hora de rechazo de la orden';
COMMENT ON COLUMN ordenes_compra.rechazado_by IS 'ID del usuario que rechazó la orden';
COMMENT ON COLUMN ordenes_compra.motivo_rechazo IS 'Motivo del rechazo de la orden';
