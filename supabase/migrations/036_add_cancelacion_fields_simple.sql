-- Migration 036: Add cancellation fields to ordenes_compra
-- Run this in Supabase SQL Editor

ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS cancelado_by UUID;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS rechazado_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS rechazado_by UUID;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
