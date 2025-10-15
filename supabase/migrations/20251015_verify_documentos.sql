-- =============================================
-- SCRIPT DE VERIFICACIÓN: MÓDULO DE DOCUMENTOS
-- Fecha: 2025-10-15
-- Descripción: Verifica que todas las tablas y columnas
--              del módulo de documentos se crearon correctamente
-- =============================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN DEL MÓDULO DE DOCUMENTOS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    -- Verificar tabla documentos
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documentos';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Tabla documentos: OK';
    ELSE
        RAISE NOTICE '❌ Tabla documentos: NO EXISTE';
    END IF;
    
    -- Verificar tabla documento_detalles
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documento_detalles';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Tabla documento_detalles: OK';
        
        -- Verificar columna tipo_afectacion_igv
        SELECT COUNT(*) INTO v_count
        FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'documento_detalles' 
            AND column_name = 'tipo_afectacion_igv';
        
        IF v_count > 0 THEN
            RAISE NOTICE '   ✅ Columna tipo_afectacion_igv: OK';
        ELSE
            RAISE NOTICE '   ❌ Columna tipo_afectacion_igv: NO EXISTE';
        END IF;
    ELSE
        RAISE NOTICE '❌ Tabla documento_detalles: NO EXISTE';
    END IF;
    
    -- Verificar tabla documento_archivos
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documento_archivos';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Tabla documento_archivos: OK';
    ELSE
        RAISE NOTICE '❌ Tabla documento_archivos: NO EXISTE';
    END IF;
    
    -- Verificar tabla documento_series
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documento_series';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Tabla documento_series: OK';
    ELSE
        RAISE NOTICE '❌ Tabla documento_series: NO EXISTE';
    END IF;
    
    -- Verificar tabla documento_auditoria
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documento_auditoria';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Tabla documento_auditoria: OK';
    ELSE
        RAISE NOTICE '❌ Tabla documento_auditoria: NO EXISTE';
    END IF;
    
    -- Verificar tabla fe_configuracion
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fe_configuracion';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Tabla fe_configuracion: OK';
    ELSE
        RAISE NOTICE '❌ Tabla fe_configuracion: NO EXISTE';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN DE FUNCIONES';
    RAISE NOTICE '========================================';
    
    -- Verificar función update_updated_at_column
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Función update_updated_at_column: OK';
    ELSE
        RAISE NOTICE '❌ Función update_updated_at_column: NO EXISTE';
    END IF;
    
    -- Verificar función registrar_auditoria_documento
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'registrar_auditoria_documento';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Función registrar_auditoria_documento: OK';
    ELSE
        RAISE NOTICE '❌ Función registrar_auditoria_documento: NO EXISTE';
    END IF;
    
    -- Verificar función obtener_siguiente_numero_serie
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'obtener_siguiente_numero_serie';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Función obtener_siguiente_numero_serie: OK';
    ELSE
        RAISE NOTICE '❌ Función obtener_siguiente_numero_serie: NO EXISTE';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN DE VISTAS';
    RAISE NOTICE '========================================';
    
    -- Verificar vista v_documentos_completos
    SELECT COUNT(*) INTO v_count
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_documentos_completos';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Vista v_documentos_completos: OK';
    ELSE
        RAISE NOTICE '❌ Vista v_documentos_completos: NO EXISTE';
    END IF;
    
    -- Verificar vista v_documentos_pendientes_sunat
    SELECT COUNT(*) INTO v_count
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_documentos_pendientes_sunat';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Vista v_documentos_pendientes_sunat: OK';
    ELSE
        RAISE NOTICE '❌ Vista v_documentos_pendientes_sunat: NO EXISTE';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN COMPLETADA';
    RAISE NOTICE '========================================';
END $$;
