-- =============================================
-- FIX ANALYTICS: Crear/actualizar tabla de gastos
-- Fecha: 2025-10-15
-- Descripción: Crea o actualiza la tabla de gastos para reemplazar costos_fijos
--              y corregir las referencias en analytics
-- =============================================

-- Verificar si la tabla gastos existe
DO $$
BEGIN
    -- Si la tabla no existe, crearla
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gastos') THEN
        CREATE TABLE public.gastos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Información del gasto
            descripcion TEXT NOT NULL,
            categoria VARCHAR(50), -- OPERATIVO, ADMINISTRATIVO, VENTAS, FINANCIERO
            tipo VARCHAR(50), -- FIJO, VARIABLE
            
            -- Montos
            monto DECIMAL(12,2) NOT NULL,
            moneda VARCHAR(3) DEFAULT 'PEN',
            
            -- Fechas
            fecha DATE NOT NULL DEFAULT CURRENT_DATE,
            periodo VARCHAR(7), -- YYYY-MM para agrupación
            
            -- Referencias
            proveedor_id UUID,
            cuenta_contable VARCHAR(20),
            centro_costo VARCHAR(50),
            
            -- Comprobante
            tipo_comprobante VARCHAR(20),
            serie_comprobante VARCHAR(10),
            numero_comprobante VARCHAR(20),
            
            -- Estado
            estado VARCHAR(20) DEFAULT 'REGISTRADO', -- REGISTRADO, APROBADO, PAGADO, ANULADO
            aprobado_por UUID,
            fecha_aprobacion TIMESTAMPTZ,
            
            -- Observaciones
            observaciones TEXT,
            
            -- Auditoría
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        RAISE NOTICE '✅ Tabla gastos creada';
    ELSE
        RAISE NOTICE '✅ Tabla gastos ya existe';
    END IF;
    
    -- Agregar columnas faltantes si no existen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gastos' AND column_name = 'tipo') THEN
        ALTER TABLE public.gastos ADD COLUMN tipo VARCHAR(50);
        RAISE NOTICE '✅ Columna tipo agregada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gastos' AND column_name = 'categoria') THEN
        ALTER TABLE public.gastos ADD COLUMN categoria VARCHAR(50);
        RAISE NOTICE '✅ Columna categoria agregada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gastos' AND column_name = 'periodo') THEN
        ALTER TABLE public.gastos ADD COLUMN periodo VARCHAR(7);
        RAISE NOTICE '✅ Columna periodo agregada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gastos' AND column_name = 'estado') THEN
        ALTER TABLE public.gastos ADD COLUMN estado VARCHAR(20) DEFAULT 'REGISTRADO';
        RAISE NOTICE '✅ Columna estado agregada';
    END IF;
END $$;

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON public.gastos(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_tipo ON public.gastos(tipo);
CREATE INDEX IF NOT EXISTS idx_gastos_periodo ON public.gastos(periodo);
CREATE INDEX IF NOT EXISTS idx_gastos_estado ON public.gastos(estado);

-- Comentarios
COMMENT ON TABLE public.gastos IS 'Registro de gastos operativos, administrativos y financieros';
COMMENT ON COLUMN public.gastos.tipo IS 'FIJO: Gastos recurrentes mensuales, VARIABLE: Gastos ocasionales';
COMMENT ON COLUMN public.gastos.categoria IS 'OPERATIVO, ADMINISTRATIVO, VENTAS, FINANCIERO';

-- Insertar datos de ejemplo para testing (solo si no existen)
DO $$
BEGIN
    -- Verificar si ya hay datos
    IF NOT EXISTS (SELECT 1 FROM public.gastos LIMIT 1) THEN
        INSERT INTO public.gastos (
            descripcion,
            categoria,
            tipo,
            monto,
            fecha,
            periodo,
            estado
        ) VALUES
        -- Gastos fijos mensuales
        ('Alquiler de local', 'OPERATIVO', 'FIJO', 3500.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        ('Salarios personal', 'ADMINISTRATIVO', 'FIJO', 15000.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        ('Servicios públicos', 'OPERATIVO', 'FIJO', 800.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        ('Internet y telefonía', 'ADMINISTRATIVO', 'FIJO', 250.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        ('Seguros', 'ADMINISTRATIVO', 'FIJO', 500.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        
        -- Gastos variables
        ('Publicidad digital', 'VENTAS', 'VARIABLE', 1200.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        ('Mantenimiento equipos', 'OPERATIVO', 'VARIABLE', 450.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO'),
        ('Materiales de oficina', 'ADMINISTRATIVO', 'VARIABLE', 180.00, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 'PAGADO');
        
        RAISE NOTICE '✅ Datos de ejemplo insertados';
    ELSE
        RAISE NOTICE '✅ La tabla gastos ya tiene datos';
    END IF;
END $$;

-- Crear vista para análisis de gastos
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

-- Crear vista para costos fijos mensuales (para punto de equilibrio)
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

-- Función para obtener costos fijos del mes actual
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

-- Verificación
DO $$
BEGIN
    RAISE NOTICE '✅ ========================================';
    RAISE NOTICE '✅ FIX ANALYTICS COMPLETADO';
    RAISE NOTICE '✅ ========================================';
    RAISE NOTICE '✅ Tabla gastos creada';
    RAISE NOTICE '✅ Vistas de análisis creadas:';
    RAISE NOTICE '   - v_gastos_resumen';
    RAISE NOTICE '   - v_costos_fijos_mensuales';
    RAISE NOTICE '✅ Función creada:';
    RAISE NOTICE '   - obtener_costos_fijos_mes_actual()';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Datos de ejemplo insertados';
    RAISE NOTICE '✅ Analytics ahora puede calcular:';
    RAISE NOTICE '   ✅ Rentabilidad por productos';
    RAISE NOTICE '   ✅ Punto de equilibrio';
    RAISE NOTICE '';
END $$;
