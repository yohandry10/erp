-- =============================================
-- MIGRACIÓN FOREIGN KEYS
-- Fecha: 2024-12-30
-- Descripción: Agregar foreign keys después de crear todas las tablas
-- =============================================

-- Agregar foreign key de cobranzas a cuentas_por_cobrar
-- (Solo si ambas tablas existen)
DO $$
BEGIN
    -- Verificar si ambas tablas existen
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cobranzas') 
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cuentas_por_cobrar') THEN
        
        -- Agregar foreign key constraint
        ALTER TABLE public.cobranzas 
        ADD CONSTRAINT fk_cobranzas_cuenta_por_cobrar 
        FOREIGN KEY (cuenta_por_cobrar_id) 
        REFERENCES public.cuentas_por_cobrar(id);
        
        RAISE NOTICE '✅ Foreign key agregada: cobranzas -> cuentas_por_cobrar';
    ELSE
        RAISE NOTICE '⚠️ No se pudo agregar FK - faltan tablas';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE '⚠️ Foreign key ya existe';
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error agregando foreign key: %', SQLERRM;
END $$;

-- Log de finalización
DO $$
BEGIN
    RAISE NOTICE '✅ Migración de foreign keys completada';
END $$; 