-- ====================================================================
-- MIGRACIÓN: Fix stock_movimientos usuario_id constraint
-- Fecha: 2024-12-30
-- Descripción: Eliminar foreign key constraint de usuario_id en stock_movimientos
-- ====================================================================

-- 1. Eliminar foreign key constraint si existe
DO $$
BEGIN
    -- Verificar y eliminar constraint stock_movimientos_usuario_id_fkey
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'stock_movimientos_usuario_id_fkey' 
        AND table_name = 'stock_movimientos'
    ) THEN
        ALTER TABLE public.stock_movimientos 
        DROP CONSTRAINT stock_movimientos_usuario_id_fkey;
        RAISE NOTICE '✅ Foreign key constraint stock_movimientos_usuario_id_fkey eliminada';
    ELSE
        RAISE NOTICE '⚠️ Foreign key constraint stock_movimientos_usuario_id_fkey no existe';
    END IF;
END $$;

-- 2. Asegurar que usuario_id es VARCHAR, no UUID
DO $$
BEGIN
    -- Verificar el tipo de dato actual de usuario_id
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'stock_movimientos' 
        AND column_name = 'usuario_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Cambiar de UUID a VARCHAR
        ALTER TABLE public.stock_movimientos 
        ALTER COLUMN usuario_id TYPE VARCHAR(255);
        RAISE NOTICE '✅ Columna usuario_id cambiada a VARCHAR(255)';
    ELSE
        RAISE NOTICE '⚠️ Columna usuario_id ya es VARCHAR o no existe';
    END IF;
END $$;

-- 3. Actualizar registros existentes que tengan UUIDs
UPDATE public.stock_movimientos 
SET usuario_id = 'sistema' 
WHERE usuario_id = '550e8400-e29b-41d4-a716-446655440000';

-- 4. Agregar comentario
COMMENT ON COLUMN public.stock_movimientos.usuario_id IS 'ID del usuario (VARCHAR sin foreign key)';

COMMIT; 