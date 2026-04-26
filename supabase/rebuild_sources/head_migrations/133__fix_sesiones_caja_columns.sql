-- Migration: Fix sesiones_caja column names
-- El código usa hora_apertura/hora_cierre pero la tabla tiene fecha_apertura/fecha_cierre
-- Agregamos las columnas esperadas por el código

-- Opción 1: Agregar columnas nuevas que copian los valores de las existentes
-- (Más seguro, no rompe nada existente)

-- Verificar si las columnas ya existen antes de agregarlas
DO $$
BEGIN
    -- Agregar hora_apertura si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'hora_apertura'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN hora_apertura TIMESTAMPTZ;
        
        -- Copiar datos existentes
        UPDATE public.sesiones_caja 
        SET hora_apertura = fecha_apertura 
        WHERE hora_apertura IS NULL AND fecha_apertura IS NOT NULL;
        
        RAISE NOTICE 'Columna hora_apertura agregada a sesiones_caja';
    END IF;

    -- Agregar hora_cierre si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'hora_cierre'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN hora_cierre TIMESTAMPTZ;
        
        -- Copiar datos existentes
        UPDATE public.sesiones_caja 
        SET hora_cierre = fecha_cierre 
        WHERE hora_cierre IS NULL AND fecha_cierre IS NOT NULL;
        
        RAISE NOTICE 'Columna hora_cierre agregada a sesiones_caja';
    END IF;

    -- Agregar otras columnas que el código espera
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'cajero_id'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN cajero_id UUID;
        
        -- Copiar de usuario_id si existe
        UPDATE public.sesiones_caja 
        SET cajero_id = usuario_id 
        WHERE cajero_id IS NULL AND usuario_id IS NOT NULL;
        
        RAISE NOTICE 'Columna cajero_id agregada a sesiones_caja';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'monto_inicio'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN monto_inicio NUMERIC(12,2);
        
        -- Copiar de monto_inicial si existe
        UPDATE public.sesiones_caja 
        SET monto_inicio = monto_inicial 
        WHERE monto_inicio IS NULL AND monto_inicial IS NOT NULL;
        
        RAISE NOTICE 'Columna monto_inicio agregada a sesiones_caja';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'abierto_por'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN abierto_por UUID;
        RAISE NOTICE 'Columna abierto_por agregada a sesiones_caja';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'cerrado_por'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN cerrado_por UUID;
        RAISE NOTICE 'Columna cerrado_por agregada a sesiones_caja';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'dispositivo'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN dispositivo VARCHAR(100);
        RAISE NOTICE 'Columna dispositivo agregada a sesiones_caja';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sesiones_caja' 
        AND column_name = 'hash_integridad'
    ) THEN
        ALTER TABLE public.sesiones_caja 
        ADD COLUMN hash_integridad VARCHAR(64);
        RAISE NOTICE 'Columna hash_integridad agregada a sesiones_caja';
    END IF;

END $$;

-- Crear trigger para mantener sincronizadas las columnas
CREATE OR REPLACE FUNCTION sync_sesiones_caja_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Sincronizar hora_apertura con fecha_apertura
    IF NEW.fecha_apertura IS NOT NULL AND NEW.hora_apertura IS NULL THEN
        NEW.hora_apertura := NEW.fecha_apertura;
    ELSIF NEW.hora_apertura IS NOT NULL AND NEW.fecha_apertura IS NULL THEN
        NEW.fecha_apertura := NEW.hora_apertura;
    END IF;

    -- Sincronizar hora_cierre con fecha_cierre
    IF NEW.fecha_cierre IS NOT NULL AND NEW.hora_cierre IS NULL THEN
        NEW.hora_cierre := NEW.fecha_cierre;
    ELSIF NEW.hora_cierre IS NOT NULL AND NEW.fecha_cierre IS NULL THEN
        NEW.fecha_cierre := NEW.hora_cierre;
    END IF;

    -- Sincronizar cajero_id con usuario_id
    IF NEW.usuario_id IS NOT NULL AND NEW.cajero_id IS NULL THEN
        NEW.cajero_id := NEW.usuario_id;
    ELSIF NEW.cajero_id IS NOT NULL AND NEW.usuario_id IS NULL THEN
        NEW.usuario_id := NEW.cajero_id;
    END IF;

    -- Sincronizar monto_inicio con monto_inicial
    IF NEW.monto_inicial IS NOT NULL AND NEW.monto_inicio IS NULL THEN
        NEW.monto_inicio := NEW.monto_inicial;
    ELSIF NEW.monto_inicio IS NOT NULL AND NEW.monto_inicial IS NULL THEN
        NEW.monto_inicial := NEW.monto_inicio;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe y recrearlo
DROP TRIGGER IF EXISTS trg_sync_sesiones_caja ON public.sesiones_caja;
CREATE TRIGGER trg_sync_sesiones_caja
    BEFORE INSERT OR UPDATE ON public.sesiones_caja
    FOR EACH ROW
    EXECUTE FUNCTION sync_sesiones_caja_columns();

-- Índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_hora_apertura 
    ON public.sesiones_caja(hora_apertura DESC);
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_cajero_id 
    ON public.sesiones_caja(cajero_id);

COMMENT ON COLUMN public.sesiones_caja.hora_apertura IS 'Alias de fecha_apertura para compatibilidad con código';
COMMENT ON COLUMN public.sesiones_caja.hora_cierre IS 'Alias de fecha_cierre para compatibilidad con código';
COMMENT ON COLUMN public.sesiones_caja.cajero_id IS 'Alias de usuario_id para compatibilidad con código';
COMMENT ON COLUMN public.sesiones_caja.monto_inicio IS 'Alias de monto_inicial para compatibilidad con código';
