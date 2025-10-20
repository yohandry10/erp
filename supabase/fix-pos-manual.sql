-- =====================================================
-- FIX MANUAL PARA POS - AGREGAR COLUMNAS FALTANTES
-- Ejecutar este script directamente en tu base de datos
-- =====================================================

-- 1. Agregar columna usuario_apertura si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'usuario_apertura'
    ) THEN
        ALTER TABLE public.sesiones_caja ADD COLUMN usuario_apertura VARCHAR(100);
        RAISE NOTICE '✅ Columna usuario_apertura agregada';
    ELSE
        RAISE NOTICE '⚠️  Columna usuario_apertura ya existe';
    END IF;
END $$;

-- 2. Agregar columna usuario_cierre si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'usuario_cierre'
    ) THEN
        ALTER TABLE public.sesiones_caja ADD COLUMN usuario_cierre VARCHAR(100);
        RAISE NOTICE '✅ Columna usuario_cierre agregada';
    ELSE
        RAISE NOTICE '⚠️  Columna usuario_cierre ya existe';
    END IF;
END $$;

-- 3. Verificar estructura completa de la tabla
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'sesiones_caja'
ORDER BY ordinal_position;

-- 4. Mostrar sesiones existentes
SELECT 
    id,
    fecha_apertura,
    fecha_cierre,
    estado,
    monto_inicial,
    usuario_apertura,
    usuario_cierre
FROM public.sesiones_caja
ORDER BY fecha_apertura DESC
LIMIT 5;
