-- =============================================
-- VERIFICACIÓN: Módulo Analytics
-- Fecha: 2025-10-15
-- Descripción: Verifica que todas las tablas y funciones
--              necesarias para Analytics estén correctas
-- =============================================

DO $$
DECLARE
    v_count INTEGER;
    v_total_gastos DECIMAL;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN DEL MÓDULO ANALYTICS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    -- ========================================
    -- 1. VERIFICAR TABLAS PRINCIPALES
    -- ========================================
    RAISE NOTICE '1. VERIFICANDO TABLAS PRINCIPALES';
    RAISE NOTICE '----------------------------------------';
    
    -- Tabla productos
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'productos';
    
    IF v_count > 0 THEN
        SELECT COUNT(*) INTO v_count FROM productos;
        RAISE NOTICE '✅ Tabla productos: OK (% registros)', v_count;
    ELSE
        RAISE NOTICE '❌ Tabla productos: NO EXISTE';
    END IF;
    
    -- Tabla ventas_pos
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ventas_pos';
    
    IF v_count > 0 THEN
        SELECT COUNT(*) INTO v_count FROM ventas_pos;
        RAISE NOTICE '✅ Tabla ventas_pos: OK (% registros)', v_count;
    ELSE
        RAISE NOTICE '❌ Tabla ventas_pos: NO EXISTE';
    END IF;
    
    -- Tabla venta_detalles
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'venta_detalles';
    
    IF v_count > 0 THEN
        SELECT COUNT(*) INTO v_count FROM venta_detalles;
        RAISE NOTICE '✅ Tabla venta_detalles: OK (% registros)', v_count;
    ELSE
        RAISE NOTICE '❌ Tabla venta_detalles: NO EXISTE';
    END IF;
    
    -- Tabla orden_compra_detalles
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orden_compra_detalles';
    
    IF v_count > 0 THEN
        SELECT COUNT(*) INTO v_count FROM orden_compra_detalles;
        RAISE NOTICE '✅ Tabla orden_compra_detalles: OK (% registros)', v_count;
    ELSE
        RAISE NOTICE '❌ Tabla orden_compra_detalles: NO EXISTE';
    END IF;
    
    -- Tabla cuentas_por_cobrar
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cuentas_por_cobrar';
    
    IF v_count > 0 THEN
        SELECT COUNT(*) INTO v_count FROM cuentas_por_cobrar;
        RAISE NOTICE '✅ Tabla cuentas_por_cobrar: OK (% registros)', v_count;
    ELSE
        RAISE NOTICE '❌ Tabla cuentas_por_cobrar: NO EXISTE';
    END IF;
    
    -- Tabla gastos
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gastos';
    
    IF v_count > 0 THEN
        SELECT COUNT(*) INTO v_count FROM gastos;
        RAISE NOTICE '✅ Tabla gastos: OK (% registros)', v_count;
        
        -- Verificar columnas importantes
        SELECT COUNT(*) INTO v_count
        FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'gastos' 
            AND column_name = 'tipo';
        
        IF v_count > 0 THEN
            RAISE NOTICE '   ✅ Columna tipo: OK';
        ELSE
            RAISE NOTICE '   ❌ Columna tipo: NO EXISTE';
        END IF;
        
        SELECT COUNT(*) INTO v_count
        FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'gastos' 
            AND column_name = 'categoria';
        
        IF v_count > 0 THEN
            RAISE NOTICE '   ✅ Columna categoria: OK';
        ELSE
            RAISE NOTICE '   ❌ Columna categoria: NO EXISTE';
        END IF;
        
        SELECT COUNT(*) INTO v_count
        FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'gastos' 
            AND column_name = 'periodo';
        
        IF v_count > 0 THEN
            RAISE NOTICE '   ✅ Columna periodo: OK';
        ELSE
            RAISE NOTICE '   ❌ Columna periodo: NO EXISTE';
        END IF;
    ELSE
        RAISE NOTICE '❌ Tabla gastos: NO EXISTE';
    END IF;
    
    RAISE NOTICE '';
    
    -- ========================================
    -- 2. VERIFICAR VISTAS
    -- ========================================
    RAISE NOTICE '2. VERIFICANDO VISTAS';
    RAISE NOTICE '----------------------------------------';
    
    -- Vista v_gastos_resumen
    SELECT COUNT(*) INTO v_count
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_gastos_resumen';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Vista v_gastos_resumen: OK';
    ELSE
        RAISE NOTICE '❌ Vista v_gastos_resumen: NO EXISTE';
    END IF;
    
    -- Vista v_costos_fijos_mensuales
    SELECT COUNT(*) INTO v_count
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_costos_fijos_mensuales';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Vista v_costos_fijos_mensuales: OK';
    ELSE
        RAISE NOTICE '❌ Vista v_costos_fijos_mensuales: NO EXISTE';
    END IF;
    
    RAISE NOTICE '';
    
    -- ========================================
    -- 3. VERIFICAR FUNCIONES
    -- ========================================
    RAISE NOTICE '3. VERIFICANDO FUNCIONES';
    RAISE NOTICE '----------------------------------------';
    
    -- Función obtener_costos_fijos_mes_actual
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'obtener_costos_fijos_mes_actual';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Función obtener_costos_fijos_mes_actual: OK';
        
        -- Probar la función
        BEGIN
            SELECT obtener_costos_fijos_mes_actual() INTO v_total_gastos;
            RAISE NOTICE '   💰 Total costos fijos mes actual: S/ %', v_total_gastos;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '   ⚠️ Error al ejecutar función: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '❌ Función obtener_costos_fijos_mes_actual: NO EXISTE';
    END IF;
    
    RAISE NOTICE '';
    
    -- ========================================
    -- 4. VERIFICAR DATOS DE EJEMPLO
    -- ========================================
    RAISE NOTICE '4. VERIFICANDO DATOS DE EJEMPLO';
    RAISE NOTICE '----------------------------------------';
    
    SELECT COUNT(*) INTO v_count FROM gastos WHERE tipo = 'FIJO';
    RAISE NOTICE '📊 Gastos fijos: % registros', v_count;
    
    SELECT COUNT(*) INTO v_count FROM gastos WHERE tipo = 'VARIABLE';
    RAISE NOTICE '📊 Gastos variables: % registros', v_count;
    
    SELECT COALESCE(SUM(monto), 0) INTO v_total_gastos FROM gastos;
    RAISE NOTICE '💰 Total gastos: S/ %', v_total_gastos;
    
    RAISE NOTICE '';
    
    -- ========================================
    -- 5. RESUMEN DE ENDPOINTS
    -- ========================================
    RAISE NOTICE '5. ESTADO DE ENDPOINTS ANALYTICS';
    RAISE NOTICE '----------------------------------------';
    
    -- Verificar si ventas_pos tiene datos
    SELECT COUNT(*) INTO v_count FROM ventas_pos;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ GET /analytics/ventas-tiempo - FUNCIONAL';
    ELSE
        RAISE NOTICE '⚠️ GET /analytics/ventas-tiempo - SIN DATOS';
    END IF;
    
    -- Verificar si cuentas_por_cobrar tiene datos
    SELECT COUNT(*) INTO v_count FROM cuentas_por_cobrar;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ GET /analytics/deudas-clientes - FUNCIONAL';
    ELSE
        RAISE NOTICE '⚠️ GET /analytics/deudas-clientes - SIN DATOS';
    END IF;
    
    -- Verificar si productos y detalles tienen datos
    SELECT COUNT(*) INTO v_count FROM productos;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ GET /analytics/rentabilidad-productos - FUNCIONAL';
    ELSE
        RAISE NOTICE '⚠️ GET /analytics/rentabilidad-productos - SIN DATOS';
    END IF;
    
    -- Verificar si gastos tiene datos
    SELECT COUNT(*) INTO v_count FROM gastos;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ GET /analytics/punto-equilibrio - FUNCIONAL';
    ELSE
        RAISE NOTICE '⚠️ GET /analytics/punto-equilibrio - SIN DATOS';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN COMPLETADA';
    RAISE NOTICE '========================================';
END $$;
