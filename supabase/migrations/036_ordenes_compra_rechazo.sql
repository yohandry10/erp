-- Migration 036: Agregar campos de rechazo a ordenes_compra
-- Fecha: 2025-10-24
-- Descripción: Agrega campos necesarios para el flujo de rechazo de órdenes de compra

-- =====================================================
-- AGREGAR CAMPOS DE RECHAZO A ordenes_compra
-- =====================================================

DO $$ 
BEGIN
  -- Agregar rechazado_at si no existe
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
COMMENT ON COLUMN ordenes_compra.rechazado_at IS 'Fecha y hora en que se rechazó la orden';
COMMENT ON COLUMN ordenes_compra.rechazado_by IS 'ID del usuario que rechazó la orden';
COMMENT ON COLUMN ordenes_compra.motivo_rechazo IS 'Motivo del rechazo de la orden';

-- =====================================================
-- ACTUALIZAR ENUM estado_orden_compra
-- =====================================================

-- Agregar estado RECHAZADA si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'RECHAZADA' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'estado_orden_compra')
  ) THEN
    ALTER TYPE estado_orden_compra ADD VALUE 'RECHAZADA';
  END IF;
END $$;

-- =====================================================
-- CREAR ÍNDICE PARA BÚSQUEDAS POR ESTADO RECHAZADA
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_rechazado_at ON ordenes_compra(rechazado_at) 
  WHERE rechazado_at IS NOT NULL;
