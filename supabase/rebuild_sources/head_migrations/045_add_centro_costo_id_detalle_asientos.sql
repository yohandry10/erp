-- Migration: Add centro_costo_id to detalle_asientos
-- Description: Adds centro_costo_id column to track cost center for each accounting entry detail line
-- This allows for cost center reporting and analysis at the detail level
-- Date: 2025-10-27

-- Add centro_costo_id column to detalle_asientos table
-- This column will reference the centros_costo table to track which cost center this entry belongs to
-- Using uuid type to match centros_costo.id
ALTER TABLE detalle_asientos 
ADD COLUMN IF NOT EXISTS centro_costo_id uuid;

-- Add foreign key constraint to centros_costo table
-- ON DELETE SET NULL: if a cost center is deleted, the entries remain but lose the cost center reference
ALTER TABLE detalle_asientos
ADD CONSTRAINT fk_detalle_asientos_centro_costo
FOREIGN KEY (centro_costo_id) 
REFERENCES centros_costo(id) 
ON DELETE SET NULL;

-- Create index for faster lookups when filtering by cost center
-- This will improve performance for cost center reports
CREATE INDEX IF NOT EXISTS idx_detalle_asientos_centro_costo_id 
ON detalle_asientos(centro_costo_id) 
WHERE centro_costo_id IS NOT NULL;

-- Add comment to document the purpose of this column
COMMENT ON COLUMN detalle_asientos.centro_costo_id IS 
'References the centros_costo.id to track which cost center this accounting entry detail belongs to. Used for cost center reporting and analysis. NULL if not assigned to a specific cost center.';
