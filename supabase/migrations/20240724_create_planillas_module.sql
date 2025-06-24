-- Tabla de conceptos de planilla (sueldos, bonos, descuentos, etc.)
CREATE TABLE IF NOT EXISTS public.conceptos_planilla (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL, -- 'ingreso', 'descuento', 'aporte_empleador'
    categoria TEXT NOT NULL, -- 'basico', 'bono', 'afp', 'onp', 'impuesto', 'cts', 'gratificacion'
    es_fijo BOOLEAN DEFAULT false, -- true para conceptos que no cambian (sueldo básico)
    afecta_cts BOOLEAN DEFAULT false,
    afecta_gratificacion BOOLEAN DEFAULT false,
    afecta_vacaciones BOOLEAN DEFAULT false,
    porcentaje DECIMAL(5,4), -- para conceptos que son % del sueldo
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de planillas (períodos de pago)
CREATE TABLE IF NOT EXISTS public.planillas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo VARCHAR(7) NOT NULL, -- YYYY-MM
    tipo TEXT NOT NULL, -- 'mensual', 'cts', 'gratificacion', 'liquidacion'
    estado TEXT DEFAULT 'borrador', -- 'borrador', 'calculada', 'aprobada', 'cerrada'
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_pago DATE,
    total_ingresos DECIMAL(12,2) DEFAULT 0,
    total_descuentos DECIMAL(12,2) DEFAULT 0,
    total_aportes DECIMAL(12,2) DEFAULT 0,
    total_neto DECIMAL(12,2) DEFAULT 0,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de detalle de planilla por empleado
CREATE TABLE IF NOT EXISTS public.empleado_planilla (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_planilla UUID REFERENCES public.planillas(id) ON DELETE CASCADE,
    id_empleado UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
    dias_trabajados INTEGER DEFAULT 30,
    horas_extras_25 DECIMAL(5,2) DEFAULT 0, -- horas extras al 25%
    horas_extras_35 DECIMAL(5,2) DEFAULT 0, -- horas extras al 35%
    tardanzas_minutos INTEGER DEFAULT 0,
    faltas INTEGER DEFAULT 0,
    total_ingresos DECIMAL(10,2) DEFAULT 0,
    total_descuentos DECIMAL(10,2) DEFAULT 0,
    total_aportes DECIMAL(10,2) DEFAULT 0,
    neto_pagar DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de detalle de conceptos por empleado en cada planilla
CREATE TABLE IF NOT EXISTS public.empleado_planilla_conceptos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado_planilla UUID REFERENCES public.empleado_planilla(id) ON DELETE CASCADE,
    id_concepto UUID REFERENCES public.conceptos_planilla(id),
    monto DECIMAL(10,2) NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar conceptos básicos para Perú
INSERT INTO public.conceptos_planilla (codigo, nombre, tipo, categoria, es_fijo, afecta_cts, afecta_gratificacion, afecta_vacaciones) VALUES
-- Ingresos
('001', 'Sueldo Básico', 'ingreso', 'basico', true, true, true, true),
('002', 'Asignación Familiar', 'ingreso', 'bono', true, false, true, true),
('003', 'Horas Extras 25%', 'ingreso', 'bono', false, true, true, true),
('004', 'Horas Extras 35%', 'ingreso', 'bono', false, true, true, true),
('005', 'Bonificación', 'ingreso', 'bono', false, true, true, true),
('006', 'Comisiones', 'ingreso', 'bono', false, true, true, true),
('007', 'Movilidad', 'ingreso', 'bono', false, false, false, false),
('008', 'Refrigerio', 'ingreso', 'bono', false, false, false, false),

-- Descuentos
('101', 'AFP - Aporte', 'descuento', 'afp', false, false, false, false),
('102', 'AFP - Comisión', 'descuento', 'afp', false, false, false, false),
('103', 'AFP - Seguro', 'descuento', 'afp', false, false, false, false),
('104', 'ONP', 'descuento', 'onp', false, false, false, false),
('105', 'Impuesto a la Renta', 'descuento', 'impuesto', false, false, false, false),
('106', 'Tardanzas', 'descuento', 'descuento', false, false, false, false),
('107', 'Faltas', 'descuento', 'descuento', false, false, false, false),
('108', 'Préstamo Personal', 'descuento', 'descuento', false, false, false, false),
('109', 'Adelanto de Sueldo', 'descuento', 'descuento', false, false, false, false),

-- Aportes del empleador
('201', 'ESSALUD', 'aporte_empleador', 'essalud', false, false, false, false),
('202', 'SCTR Salud', 'aporte_empleador', 'sctr', false, false, false, false),
('203', 'SCTR Pensión', 'aporte_empleador', 'sctr', false, false, false, false);

COMMENT ON TABLE public.conceptos_planilla IS 'Conceptos de planilla (ingresos, descuentos, aportes)';
COMMENT ON TABLE public.planillas IS 'Períodos de planilla';
COMMENT ON TABLE public.empleado_planilla IS 'Detalle de planilla por empleado';
COMMENT ON TABLE public.empleado_planilla_conceptos IS 'Conceptos aplicados a cada empleado en planilla'; 