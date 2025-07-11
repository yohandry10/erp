-- =============================================
-- MIGRACIÓN PARA ARREGLAR TABLAS FALTANTES DEL MÓDULO RRHH
-- Fecha: 2024-12-30
-- Descripción: Crear tablas faltantes y corregir esquemas
-- =============================================

-- 1. TABLA HISTORIAL PAGOS PLANILLA (faltante)
CREATE TABLE IF NOT EXISTS public.historial_pagos_planilla (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planilla_id UUID REFERENCES public.planillas(id) ON DELETE CASCADE,
    fecha TIMESTAMPTZ NOT NULL,
    metodo VARCHAR(20) NOT NULL, -- efectivo, transferencia
    monto DECIMAL(12,2) NOT NULL DEFAULT 0,
    empleados_count INTEGER NOT NULL DEFAULT 0,
    numero_operacion VARCHAR(50),
    observaciones TEXT,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA RRHH PAGOS (que referenciaba el código)
CREATE TABLE IF NOT EXISTS public.rrhh_pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
    planilla_id UUID REFERENCES public.planillas(id) ON DELETE CASCADE,
    periodo VARCHAR(20) NOT NULL,
    monto_bruto DECIMAL(10,2) NOT NULL DEFAULT 0,
    descuentos DECIMAL(10,2) NOT NULL DEFAULT 0,
    monto_neto DECIMAL(10,2) NOT NULL DEFAULT 0,
    metodo_pago VARCHAR(20) NOT NULL DEFAULT 'transferencia',
    estado VARCHAR(20) NOT NULL DEFAULT 'PROCESADO',
    fecha_pago TIMESTAMPTZ NOT NULL,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA ASIENTOS CONTABLES RRHH (para los asientos contables de planillas)
CREATE TABLE IF NOT EXISTS public.asientos_contables_rrhh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planilla_id UUID REFERENCES public.planillas(id) ON DELETE CASCADE,
    cuenta VARCHAR(10) NOT NULL,
    descripcion TEXT NOT NULL,
    debe DECIMAL(12,2) DEFAULT 0,
    haber DECIMAL(12,2) DEFAULT 0,
    fecha TIMESTAMPTZ NOT NULL,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CORREGIR NOMBRE DE TABLA empleados_planillas -> empleado_planilla
-- Verificar si empleados_planillas existe y migrar datos si es necesario
DO $$
BEGIN
    -- Si existe empleados_planillas pero no empleado_planilla
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empleados_planillas') AND
       NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empleado_planilla') THEN
        
        -- Renombrar la tabla
        ALTER TABLE public.empleados_planillas RENAME TO empleado_planilla;
        RAISE NOTICE '✅ Tabla empleados_planillas renombrada a empleado_planilla';
        
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empleados_planillas') AND
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empleado_planilla') THEN
        
        -- Migrar datos de empleados_planillas a empleado_planilla si ambas existen
        INSERT INTO public.empleado_planilla (
            id, id_planilla, id_empleado, dias_trabajados, horas_extras_25, horas_extras_35,
            tardanzas_minutos, faltas, total_ingresos, total_descuentos, total_aportes, neto_pagar, created_at
        )
        SELECT 
            id, planilla_id, empleado_id, dias_trabajados, horas_extras_25, horas_extras_35,
            tardanzas_minutos, faltas, total_ingresos, total_descuentos, total_aportes, neto_pagar, created_at
        FROM public.empleados_planillas
        ON CONFLICT (id) DO NOTHING;
        
        -- Eliminar tabla antigua
        DROP TABLE public.empleados_planillas;
        RAISE NOTICE '✅ Datos migrados de empleados_planillas a empleado_planilla y tabla antigua eliminada';
    END IF;
END $$;

-- 5. AGREGAR COLUMNAS FALTANTES A TABLAS EXISTENTES

-- Agregar columnas a empleado_planilla si no existen
DO $$
BEGIN
    -- Agregar estado_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'empleado_planilla' AND column_name = 'estado_pago') THEN
        ALTER TABLE public.empleado_planilla ADD COLUMN estado_pago VARCHAR(20) DEFAULT 'pendiente';
    END IF;

    -- Agregar fecha_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'empleado_planilla' AND column_name = 'fecha_pago') THEN
        ALTER TABLE public.empleado_planilla ADD COLUMN fecha_pago TIMESTAMPTZ;
    END IF;

    -- Agregar metodo_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'empleado_planilla' AND column_name = 'metodo_pago') THEN
        ALTER TABLE public.empleado_planilla ADD COLUMN metodo_pago VARCHAR(20);
    END IF;

    -- Agregar numero_operacion si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'empleado_planilla' AND column_name = 'numero_operacion') THEN
        ALTER TABLE public.empleado_planilla ADD COLUMN numero_operacion VARCHAR(50);
    END IF;

    -- Agregar observaciones_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'empleado_planilla' AND column_name = 'observaciones_pago') THEN
        ALTER TABLE public.empleado_planilla ADD COLUMN observaciones_pago TEXT;
    END IF;

    RAISE NOTICE '✅ Columnas agregadas a empleado_planilla';
END $$;

-- Agregar columnas a planillas si no existen
DO $$
BEGIN
    -- Agregar asientos_generados si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'planillas' AND column_name = 'asientos_generados') THEN
        ALTER TABLE public.planillas ADD COLUMN asientos_generados BOOLEAN DEFAULT false;
    END IF;

    -- Agregar fecha_asientos si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'planillas' AND column_name = 'fecha_asientos') THEN
        ALTER TABLE public.planillas ADD COLUMN fecha_asientos TIMESTAMPTZ;
    END IF;

    RAISE NOTICE '✅ Columnas agregadas a planillas';
END $$;

-- 6. CREAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_planilla_id ON public.historial_pagos_planilla(planilla_id);
CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_fecha ON public.historial_pagos_planilla(fecha);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_empleado_id ON public.rrhh_pagos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_planilla_id ON public.rrhh_pagos(planilla_id);
CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_estado ON public.rrhh_pagos(estado);

CREATE INDEX IF NOT EXISTS idx_asientos_rrhh_planilla_id ON public.asientos_contables_rrhh(planilla_id);
CREATE INDEX IF NOT EXISTS idx_asientos_rrhh_fecha ON public.asientos_contables_rrhh(fecha);

CREATE INDEX IF NOT EXISTS idx_empleado_planilla_planilla_id ON public.empleado_planilla(id_planilla);
CREATE INDEX IF NOT EXISTS idx_empleado_planilla_empleado_id ON public.empleado_planilla(id_empleado);
CREATE INDEX IF NOT EXISTS idx_empleado_planilla_estado_pago ON public.empleado_planilla(estado_pago);

-- 7. COMENTARIOS PARA DOCUMENTACIÓN
COMMENT ON TABLE public.historial_pagos_planilla IS 'Historial de pagos realizados por planilla';
COMMENT ON TABLE public.rrhh_pagos IS 'Pagos individuales de empleados por planilla';
COMMENT ON TABLE public.asientos_contables_rrhh IS 'Asientos contables generados por planillas RRHH';

-- 8. INSERTAR DATOS DE PRUEBA BÁSICOS (opcional)
INSERT INTO public.conceptos_planilla (codigo, nombre, tipo, categoria, es_fijo, afecta_cts, afecta_gratificacion, afecta_vacaciones, porcentaje) VALUES
-- Actualizar conceptos existentes con porcentajes si no los tienen
('101', 'AFP - Aporte', 'descuento', 'afp', false, false, false, false, 0.1000),
('102', 'AFP - Comisión', 'descuento', 'afp', false, false, false, false, 0.0125),
('103', 'AFP - Seguro', 'descuento', 'afp', false, false, false, false, 0.0136)
ON CONFLICT (codigo) DO UPDATE SET
    porcentaje = EXCLUDED.porcentaje
WHERE public.conceptos_planilla.porcentaje IS NULL;

-- Fin de migración 