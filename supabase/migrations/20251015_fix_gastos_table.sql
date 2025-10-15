-- =============================================
-- FIX: Actualizar tabla gastos con columnas faltantes
-- Fecha: 2025-10-15
-- Descripción: Agrega las columnas necesarias a la tabla gastos existente
-- =============================================

-- Mostrar estructura actual
DO $$
DECLARE
    v_columns TEXT;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ESTRUCTURA ACTUAL DE TABLA GASTOS';
    RAISE NOTICE '========================================';
    
    SELECT string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY ordinal_position)
    INTO v_columns
    FROM information_schema.columns
    WHERE table_name = 'gastos';
    
    RAISE NOTICE 'Columnas actuales: %', v_columns;
    RAISE NOTICE '';
END $$;

-- Agregar columnas faltantes una por una
DO $$
BEGIN
    RAISE NOTICE 'AGREGANDO COLUMNAS FALTANTES...';
    RAISE NOTICE '----------------------------------------';
    
    -- Columna: descripcion (si no existe, pero existe detalle, crear alias)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'descripcion'
    ) THEN
        -- Verificar si existe 'detalle'
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'gastos' AND column_name = 'detalle'
        ) THEN
            RAISE NOTICE '✅ Columna detalle existe (se usará como descripcion)';
        ELSE
            ALTER TABLE public.gastos ADD COLUMN descripcion TEXT;
            RAISE NOTICE '✅ Columna descripcion agregada';
        END IF;
    ELSE
        RAISE NOTICE '✅ Columna descripcion ya existe';
    END IF;
    
    -- Columna: tipo
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'tipo'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN tipo VARCHAR(50);
        RAISE NOTICE '✅ Columna tipo agregada';
    ELSE
        RAISE NOTICE '✅ Columna tipo ya existe';
    END IF;
    
    -- Columna: categoria
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'categoria'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN categoria VARCHAR(50);
        RAISE NOTICE '✅ Columna categoria agregada';
    ELSE
        RAISE NOTICE '✅ Columna categoria ya existe';
    END IF;
    
    -- Columna: periodo
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'periodo'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN periodo VARCHAR(7);
        RAISE NOTICE '✅ Columna periodo agregada';
    ELSE
        RAISE NOTICE '✅ Columna periodo ya existe';
    END IF;
    
    -- Columna: estado
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'estado'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN estado VARCHAR(20) DEFAULT 'REGISTRADO';
        RAISE NOTICE '✅ Columna estado agregada';
    ELSE
        RAISE NOTICE '✅ Columna estado ya existe';
    END IF;
    
    -- Columna: moneda
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'moneda'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN moneda VARCHAR(3) DEFAULT 'PEN';
        RAISE NOTICE '✅ Columna moneda agregada';
    ELSE
        RAISE NOTICE '✅ Columna moneda ya existe';
    END IF;
    
    -- Columna: proveedor_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'proveedor_id'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN proveedor_id UUID;
        RAISE NOTICE '✅ Columna proveedor_id agregada';
    ELSE
        RAISE NOTICE '✅ Columna proveedor_id ya existe';
    END IF;
    
    -- Columna: cuenta_contable
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'cuenta_contable'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN cuenta_contable VARCHAR(20);
        RAISE NOTICE '✅ Columna cuenta_contable agregada';
    ELSE
        RAISE NOTICE '✅ Columna cuenta_contable ya existe';
    END IF;
    
    -- Columna: centro_costo
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'centro_costo'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN centro_costo VARCHAR(50);
        RAISE NOTICE '✅ Columna centro_costo agregada';
    ELSE
        RAISE NOTICE '✅ Columna centro_costo ya existe';
    END IF;
    
    -- Columna: tipo_comprobante
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'tipo_comprobante'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN tipo_comprobante VARCHAR(20);
        RAISE NOTICE '✅ Columna tipo_comprobante agregada';
    ELSE
        RAISE NOTICE '✅ Columna tipo_comprobante ya existe';
    END IF;
    
    -- Columna: serie_comprobante
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'serie_comprobante'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN serie_comprobante VARCHAR(10);
        RAISE NOTICE '✅ Columna serie_comprobante agregada';
    ELSE
        RAISE NOTICE '✅ Columna serie_comprobante ya existe';
    END IF;
    
    -- Columna: numero_comprobante
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'numero_comprobante'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN numero_comprobante VARCHAR(20);
        RAISE NOTICE '✅ Columna numero_comprobante agregada';
    ELSE
        RAISE NOTICE '✅ Columna numero_comprobante ya existe';
    END IF;
    
    -- Columna: aprobado_por
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'aprobado_por'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN aprobado_por UUID;
        RAISE NOTICE '✅ Columna aprobado_por agregada';
    ELSE
        RAISE NOTICE '✅ Columna aprobado_por ya existe';
    END IF;
    
    -- Columna: fecha_aprobacion
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'fecha_aprobacion'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN fecha_aprobacion TIMESTAMPTZ;
        RAISE NOTICE '✅ Columna fecha_aprobacion agregada';
    ELSE
        RAISE NOTICE '✅ Columna fecha_aprobacion ya existe';
    END IF;
    
    -- Columna: observaciones
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'observaciones'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN observaciones TEXT;
        RAISE NOTICE '✅ Columna observaciones agregada';
    ELSE
        RAISE NOTICE '✅ Columna observaciones ya existe';
    END IF;
    
    -- Columna: created_by
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN created_by UUID;
        RAISE NOTICE '✅ Columna created_by agregada';
    ELSE
        RAISE NOTICE '✅ Columna created_by ya existe';
    END IF;
    
    -- Columna: updated_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.gastos ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE '✅ Columna updated_at agregada';
    ELSE
        RAISE NOTICE '✅ Columna updated_at ya existe';
    END IF;
    
    RAISE NOTICE '';
END $$;

-- Actualizar registros existentes con valores por defecto
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    RAISE NOTICE 'ACTUALIZANDO REGISTROS EXISTENTES...';
    RAISE NOTICE '----------------------------------------';
    
    -- Actualizar tipo a FIJO por defecto si es NULL
    UPDATE public.gastos 
    SET tipo = 'FIJO' 
    WHERE tipo IS NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ % registros actualizados con tipo = FIJO', v_count;
    END IF;
    
    -- Actualizar categoria a OPERATIVO por defecto si es NULL
    UPDATE public.gastos 
    SET categoria = 'OPERATIVO' 
    WHERE categoria IS NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ % registros actualizados con categoria = OPERATIVO', v_count;
    END IF;
    
    -- Actualizar periodo basado en fecha si es NULL
    UPDATE public.gastos 
    SET periodo = TO_CHAR(fecha, 'YYYY-MM') 
    WHERE periodo IS NULL AND fecha IS NOT NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ % registros actualizados con periodo calculado', v_count;
    END IF;
    
    -- Actualizar estado a REGISTRADO por defecto si es NULL
    UPDATE public.gastos 
    SET estado = 'REGISTRADO' 
    WHERE estado IS NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ % registros actualizados con estado = REGISTRADO', v_count;
    END IF;
    
    RAISE NOTICE '';
END $$;

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON public.gastos(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_tipo ON public.gastos(tipo);
CREATE INDEX IF NOT EXISTS idx_gastos_periodo ON public.gastos(periodo);
CREATE INDEX IF NOT EXISTS idx_gastos_estado ON public.gastos(estado);

-- Agregar comentarios
COMMENT ON TABLE public.gastos IS 'Registro de gastos operativos, administrativos y financieros';
COMMENT ON COLUMN public.gastos.tipo IS 'FIJO: Gastos recurrentes mensuales, VARIABLE: Gastos ocasionales';
COMMENT ON COLUMN public.gastos.categoria IS 'OPERATIVO, ADMINISTRATIVO, VENTAS, FINANCIERO';
COMMENT ON COLUMN public.gastos.periodo IS 'Período en formato YYYY-MM para agrupación';
COMMENT ON COLUMN public.gastos.estado IS 'REGISTRADO, APROBADO, PAGADO, ANULADO';

-- Insertar datos de ejemplo si no hay registros
DO $$
DECLARE
    v_count INTEGER;
    v_has_descripcion BOOLEAN;
    v_has_detalle BOOLEAN;
    v_col_name TEXT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.gastos;
    
    -- Detectar si existe columna descripcion o detalle
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'descripcion'
    ) INTO v_has_descripcion;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gastos' AND column_name = 'detalle'
    ) INTO v_has_detalle;
    
    -- Determinar qué columna usar
    IF v_has_descripcion THEN
        v_col_name := 'descripcion';
    ELSIF v_has_detalle THEN
        v_col_name := 'detalle';
    ELSE
        RAISE NOTICE '⚠️ No se encontró columna descripcion ni detalle';
        RETURN;
    END IF;
    
    IF v_count = 0 THEN
        RAISE NOTICE 'INSERTANDO DATOS DE EJEMPLO...';
        RAISE NOTICE '----------------------------------------';
        RAISE NOTICE 'Usando columna: %', v_col_name;
        
        -- Insertar usando la columna correcta
        IF v_col_name = 'descripcion' THEN
            INSERT INTO public.gastos (
                descripcion, categoria, tipo, monto, fecha, periodo, estado
            ) VALUES
            ('Alquiler de local', 'OPERATIVO', 'FIJO', 3500.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Salarios personal', 'ADMINISTRATIVO', 'FIJO', 15000.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Servicios públicos', 'OPERATIVO', 'FIJO', 800.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Internet y telefonía', 'ADMINISTRATIVO', 'FIJO', 250.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Seguros', 'ADMINISTRATIVO', 'FIJO', 500.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Publicidad digital', 'VENTAS', 'VARIABLE', 1200.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Mantenimiento equipos', 'OPERATIVO', 'VARIABLE', 450.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Materiales de oficina', 'ADMINISTRATIVO', 'VARIABLE', 180.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO');
        ELSE
            INSERT INTO public.gastos (
                detalle, categoria, tipo, monto, fecha, periodo, estado
            ) VALUES
            ('Alquiler de local', 'OPERATIVO', 'FIJO', 3500.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Salarios personal', 'ADMINISTRATIVO', 'FIJO', 15000.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Servicios públicos', 'OPERATIVO', 'FIJO', 800.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Internet y telefonía', 'ADMINISTRATIVO', 'FIJO', 250.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Seguros', 'ADMINISTRATIVO', 'FIJO', 500.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Publicidad digital', 'VENTAS', 'VARIABLE', 1200.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Mantenimiento equipos', 'OPERATIVO', 'VARIABLE', 450.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
            ('Materiales de oficina', 'ADMINISTRATIVO', 'VARIABLE', 180.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO');
        END IF;
        
        RAISE NOTICE '✅ 8 registros de ejemplo insertados';
    ELSE
        RAISE NOTICE '✅ La tabla ya tiene % registros', v_count;
    END IF;
    
    RAISE NOTICE '';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Error insertando datos: %', SQLERRM;
END $$;

-- Crear vistas
CREATE OR REPLACE VIEW v_gastos_resumen AS
SELECT 
    periodo,
    categoria,
    tipo,
    COUNT(*) as cantidad_gastos,
    SUM(monto) as total_monto,
    AVG(monto) as promedio_monto,
    MIN(monto) as monto_minimo,
    MAX(monto) as monto_maximo
FROM public.gastos
WHERE estado IS NULL OR estado != 'ANULADO'
GROUP BY periodo, categoria, tipo
ORDER BY periodo DESC, categoria, tipo;

CREATE OR REPLACE VIEW v_costos_fijos_mensuales AS
SELECT 
    periodo,
    SUM(CASE WHEN tipo = 'FIJO' THEN monto ELSE 0 END) as costos_fijos,
    SUM(CASE WHEN tipo = 'VARIABLE' THEN monto ELSE 0 END) as costos_variables,
    SUM(monto) as total_gastos
FROM public.gastos
WHERE estado IS NULL OR estado != 'ANULADO'
GROUP BY periodo
ORDER BY periodo DESC;

-- Crear función
CREATE OR REPLACE FUNCTION obtener_costos_fijos_mes_actual()
RETURNS DECIMAL AS $$
DECLARE
    total_costos_fijos DECIMAL;
BEGIN
    SELECT COALESCE(SUM(monto), 0)
    INTO total_costos_fijos
    FROM public.gastos
    WHERE tipo = 'FIJO'
        AND periodo = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
        AND (estado IS NULL OR estado != 'ANULADO');
    
    RETURN total_costos_fijos;
END;
$$ LANGUAGE plpgsql;

-- Verificación final
DO $$
DECLARE
    v_count INTEGER;
    v_total DECIMAL;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN FINAL';
    RAISE NOTICE '========================================';
    
    SELECT COUNT(*) INTO v_count FROM gastos;
    RAISE NOTICE '📊 Total registros en gastos: %', v_count;
    
    SELECT COUNT(*) INTO v_count FROM gastos WHERE tipo = 'FIJO';
    RAISE NOTICE '📊 Gastos fijos: %', v_count;
    
    SELECT COUNT(*) INTO v_count FROM gastos WHERE tipo = 'VARIABLE';
    RAISE NOTICE '📊 Gastos variables: %', v_count;
    
    SELECT obtener_costos_fijos_mes_actual() INTO v_total;
    RAISE NOTICE '💰 Costos fijos mes actual: S/ %', v_total;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ TABLA GASTOS ACTUALIZADA CORRECTAMENTE';
    RAISE NOTICE '✅ Analytics ahora puede funcionar correctamente';
    RAISE NOTICE '';
END $$;
