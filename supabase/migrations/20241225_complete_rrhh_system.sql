-- ========================================
-- MIGRACIÓN COMPLETA PARA SISTEMA RRHH
-- Completando el ciclo "Hire-to-Retire"
-- ========================================

-- 1. VACANTES Y RECLUTAMIENTO
CREATE TABLE IF NOT EXISTS public.vacantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    id_departamento UUID REFERENCES public.departamentos(id),
    puesto_solicitado TEXT NOT NULL,
    salario_min DECIMAL(10,2),
    salario_max DECIMAL(10,2),
    requisitos TEXT,
    estado TEXT DEFAULT 'abierta', -- abierta, cerrada, pausada
    fecha_publicacion DATE DEFAULT CURRENT_DATE,
    fecha_cierre DATE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CANDIDATOS
CREATE TABLE IF NOT EXISTS public.candidatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_vacante UUID REFERENCES public.vacantes(id),
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    cv_url TEXT,
    estado TEXT DEFAULT 'postulado', -- postulado, entrevista, contratado, rechazado
    puntaje INTEGER DEFAULT 0,
    observaciones TEXT,
    fecha_postulacion DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ASISTENCIA Y TIEMPO
CREATE TABLE IF NOT EXISTS public.asistencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    fecha DATE NOT NULL,
    hora_entrada TIME,
    hora_salida TIME,
    horas_trabajadas DECIMAL(4,2) DEFAULT 0,
    horas_extras DECIMAL(4,2) DEFAULT 0,
    tardanza_minutos INTEGER DEFAULT 0,
    tipo_dia TEXT DEFAULT 'normal', -- normal, feriado, descanso
    estado TEXT DEFAULT 'presente', -- presente, ausente, licencia, vacaciones
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(id_empleado, fecha)
);

-- 4. SOLICITUDES (Vacaciones, Licencias, etc.)
CREATE TABLE IF NOT EXISTS public.solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    tipo_solicitud TEXT NOT NULL, -- vacaciones, licencia_medica, permiso, adelanto_sueldo
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    dias_solicitados INTEGER DEFAULT 1,
    motivo TEXT,
    estado TEXT DEFAULT 'pendiente', -- pendiente, aprobada, rechazada
    aprobado_por UUID,
    fecha_aprobacion DATE,
    observaciones_aprobacion TEXT,
    archivo_adjunto TEXT, -- URL del archivo si es necesario
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BENEFICIOS
CREATE TABLE IF NOT EXISTS public.beneficios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT NOT NULL, -- salud, vida, vale_alimentacion, transporte
    cobertura TEXT, -- individual, familiar
    costo_empleado DECIMAL(10,2) DEFAULT 0,
    costo_empresa DECIMAL(10,2) DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. EMPLEADO BENEFICIOS
CREATE TABLE IF NOT EXISTS public.empleado_beneficios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    id_beneficio UUID REFERENCES public.beneficios(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    estado TEXT DEFAULT 'activo', -- activo, suspendido, cancelado
    monto_descuento DECIMAL(10,2) DEFAULT 0,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. EVALUACIONES DE DESEMPEÑO
CREATE TABLE IF NOT EXISTS public.evaluaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    periodo TEXT NOT NULL, -- 2024-Q1, 2024-ANUAL
    evaluador_id UUID,
    puntuacion_total DECIMAL(5,2),
    puntuacion_maxima DECIMAL(5,2) DEFAULT 100,
    objetivos_cumplidos INTEGER DEFAULT 0,
    objetivos_totales INTEGER DEFAULT 0,
    fortalezas TEXT,
    areas_mejora TEXT,
    comentarios_evaluador TEXT,
    comentarios_empleado TEXT,
    plan_desarrollo TEXT,
    fecha_evaluacion DATE DEFAULT CURRENT_DATE,
    estado TEXT DEFAULT 'borrador', -- borrador, completada, aprobada
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. CAPACITACIONES
CREATE TABLE IF NOT EXISTS public.capacitaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT NOT NULL, -- presencial, virtual, mixto
    duracion_horas INTEGER,
    fecha_inicio DATE,
    fecha_fin DATE,
    instructor TEXT,
    costo DECIMAL(10,2) DEFAULT 0,
    certificacion BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EMPLEADO CAPACITACIONES
CREATE TABLE IF NOT EXISTS public.empleado_capacitaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    id_capacitacion UUID REFERENCES public.capacitaciones(id),
    fecha_inscripcion DATE DEFAULT CURRENT_DATE,
    fecha_completada DATE,
    puntuacion DECIMAL(5,2),
    certificado_url TEXT,
    estado TEXT DEFAULT 'inscrito', -- inscrito, en_progreso, completado, abandonado
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. LIQUIDACIONES (Terminación)
CREATE TABLE IF NOT EXISTS public.liquidaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    motivo_terminacion TEXT NOT NULL, -- renuncia, despido, jubilacion, vencimiento_contrato
    fecha_terminacion DATE NOT NULL,
    ultimo_dia_trabajado DATE NOT NULL,
    vacaciones_pendientes INTEGER DEFAULT 0,
    dias_cts DECIMAL(8,2) DEFAULT 0,
    monto_cts DECIMAL(10,2) DEFAULT 0,
    gratificacion_pendiente DECIMAL(10,2) DEFAULT 0,
    indemnizacion DECIMAL(10,2) DEFAULT 0,
    descuentos DECIMAL(10,2) DEFAULT 0,
    total_liquidacion DECIMAL(10,2) DEFAULT 0,
    estado TEXT DEFAULT 'calculada', -- calculada, pagada
    observaciones TEXT,
    processed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. EXPEDIENTE DIGITAL (Documentos del empleado)
CREATE TABLE IF NOT EXISTS public.expediente_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    tipo_documento TEXT NOT NULL, -- cv, contrato, certificados, evaluaciones
    nombre_archivo TEXT NOT NULL,
    archivo_url TEXT NOT NULL,
    fecha_subida DATE DEFAULT CURRENT_DATE,
    version INTEGER DEFAULT 1,
    activo BOOLEAN DEFAULT true,
    subido_por UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. CALENDARIO EMPRESA (Feriados, eventos)
CREATE TABLE IF NOT EXISTS public.calendario_empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    fecha DATE NOT NULL,
    tipo TEXT NOT NULL, -- feriado, evento_empresa, capacitacion
    descripcion TEXT,
    es_laborable BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. HORARIOS DE TRABAJO
CREATE TABLE IF NOT EXISTS public.horarios_trabajo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL, -- "Administrativo", "Operativo", "Turno Noche"
    hora_entrada TIME NOT NULL,
    hora_salida TIME NOT NULL,
    hora_almuerzo_inicio TIME,
    hora_almuerzo_fin TIME,
    horas_semanales DECIMAL(4,2) DEFAULT 48,
    lunes BOOLEAN DEFAULT true,
    martes BOOLEAN DEFAULT true,
    miercoles BOOLEAN DEFAULT true,
    jueves BOOLEAN DEFAULT true,
    viernes BOOLEAN DEFAULT true,
    sabado BOOLEAN DEFAULT false,
    domingo BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. EMPLEADO HORARIOS
CREATE TABLE IF NOT EXISTS public.empleado_horarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id),
    id_horario UUID REFERENCES public.horarios_trabajo(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA ADICIONAL PARA PAGOS MASIVOS
-- =============================================

-- Tabla para pagos individuales de empleados (generados por planillas)
CREATE TABLE IF NOT EXISTS public.pagos_empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
    planilla_id UUID REFERENCES public.planillas(id) ON DELETE CASCADE,
    periodo VARCHAR(20) NOT NULL,
    sueldo_bruto DECIMAL(10,2) NOT NULL DEFAULT 0,
    descuentos DECIMAL(10,2) NOT NULL DEFAULT 0,
    monto_neto DECIMAL(10,2) NOT NULL DEFAULT 0,
    metodo_pago VARCHAR(20) NOT NULL DEFAULT 'transferencia', -- efectivo, transferencia
    estado VARCHAR(20) NOT NULL DEFAULT 'PROCESADO',
    fecha_pago TIMESTAMPTZ NOT NULL,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar columnas faltantes a planillas si no existen
DO $$
BEGIN
    -- Agregar estado_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'planillas' AND column_name = 'estado_pago') THEN
        ALTER TABLE public.planillas ADD COLUMN estado_pago VARCHAR(20) DEFAULT 'PENDIENTE';
    END IF;

    -- Agregar fecha_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'planillas' AND column_name = 'fecha_pago') THEN
        ALTER TABLE public.planillas ADD COLUMN fecha_pago TIMESTAMPTZ;
    END IF;

    -- Agregar metodo_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'planillas' AND column_name = 'metodo_pago') THEN
        ALTER TABLE public.planillas ADD COLUMN metodo_pago VARCHAR(20);
    END IF;

    -- Agregar total_pagado si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'planillas' AND column_name = 'total_pagado') THEN
        ALTER TABLE public.planillas ADD COLUMN total_pagado DECIMAL(12,2) DEFAULT 0;
    END IF;
END $$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pagos_empleados_empleado ON public.pagos_empleados(empleado_id);
CREATE INDEX IF NOT EXISTS idx_pagos_empleados_planilla ON public.pagos_empleados(planilla_id);
CREATE INDEX IF NOT EXISTS idx_pagos_empleados_periodo ON public.pagos_empleados(periodo);
CREATE INDEX IF NOT EXISTS idx_pagos_empleados_estado ON public.pagos_empleados(estado);

-- ========================================
-- MEJORAS A TABLAS EXISTENTES
-- ========================================

-- Agregar campos faltantes a empleados
ALTER TABLE public.empleados 
ADD COLUMN IF NOT EXISTS hijos INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS estado_civil TEXT DEFAULT 'soltero',
ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre TEXT,
ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono TEXT,
ADD COLUMN IF NOT EXISTS cuenta_bancaria TEXT,
ADD COLUMN IF NOT EXISTS cci TEXT,
ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Agregar campos a contratos para liquidaciones
ALTER TABLE public.contratos
ADD COLUMN IF NOT EXISTS vacaciones_anuales INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS cts_incluido BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS gratificacion_incluida BOOLEAN DEFAULT true;

-- ========================================
-- INSERTAR DATOS BÁSICOS
-- ========================================

-- Beneficios básicos
INSERT INTO public.beneficios (nombre, descripcion, tipo, cobertura, costo_empleado, costo_empresa) VALUES
('Seguro de Salud EPS', 'Seguro complementario de salud', 'salud', 'individual', 50.00, 150.00),
('Seguro de Vida', 'Seguro de vida ley', 'vida', 'individual', 0.00, 25.00),
('Vale de Alimentación', 'Vales de alimentación mensual', 'vale_alimentacion', 'individual', 0.00, 350.00),
('Movilidad', 'Subsidio de transporte', 'transporte', 'individual', 0.00, 200.00)
ON CONFLICT DO NOTHING;

-- Horarios de trabajo básicos
INSERT INTO public.horarios_trabajo (nombre, hora_entrada, hora_salida, hora_almuerzo_inicio, hora_almuerzo_fin, horas_semanales) VALUES
('Administrativo', '08:00', '17:00', '12:00', '13:00', 40.00),
('Operativo', '07:00', '16:00', '12:00', '13:00', 45.00),
('Turno Tarde', '14:00', '22:00', '18:00', '19:00', 40.00)
ON CONFLICT DO NOTHING;

-- Feriados 2024 Perú
INSERT INTO public.calendario_empresa (nombre, fecha, tipo, descripcion, es_laborable) VALUES
('Año Nuevo', '2024-01-01', 'feriado', 'Año Nuevo', false),
('Jueves Santo', '2024-03-28', 'feriado', 'Jueves Santo', false),
('Viernes Santo', '2024-03-29', 'feriado', 'Viernes Santo', false),
('Día del Trabajo', '2024-05-01', 'feriado', 'Día del Trabajador', false),
('San Pedro y San Pablo', '2024-06-29', 'feriado', 'San Pedro y San Pablo', false),
('Fiestas Patrias', '2024-07-28', 'feriado', 'Independencia del Perú', false),
('Fiestas Patrias', '2024-07-29', 'feriado', 'Independencia del Perú', false),
('Santa Rosa de Lima', '2024-08-30', 'feriado', 'Santa Rosa de Lima', false),
('Combate de Angamos', '2024-10-08', 'feriado', 'Combate de Angamos', false),
('Todos los Santos', '2024-11-01', 'feriado', 'Todos los Santos', false),
('Inmaculada Concepción', '2024-12-08', 'feriado', 'Inmaculada Concepción', false),
('Navidad', '2024-12-25', 'feriado', 'Navidad', false)
ON CONFLICT DO NOTHING;

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_asistencia_empleado_fecha ON public.asistencia(id_empleado, fecha);
CREATE INDEX IF NOT EXISTS idx_solicitudes_empleado_estado ON public.solicitudes(id_empleado, estado);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_empleado_periodo ON public.evaluaciones(id_empleado, periodo);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_empleado ON public.liquidaciones(id_empleado);

-- ========================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- ========================================

COMMENT ON TABLE public.vacantes IS 'Gestión de vacantes y reclutamiento';
COMMENT ON TABLE public.candidatos IS 'Candidatos para las vacantes';
COMMENT ON TABLE public.asistencia IS 'Control de asistencia diaria de empleados';
COMMENT ON TABLE public.solicitudes IS 'Solicitudes de vacaciones, licencias y permisos';
COMMENT ON TABLE public.beneficios IS 'Catálogo de beneficios de la empresa';
COMMENT ON TABLE public.empleado_beneficios IS 'Beneficios asignados a cada empleado';
COMMENT ON TABLE public.evaluaciones IS 'Evaluaciones de desempeño de empleados';
COMMENT ON TABLE public.capacitaciones IS 'Catálogo de capacitaciones disponibles';
COMMENT ON TABLE public.empleado_capacitaciones IS 'Capacitaciones tomadas por cada empleado';
COMMENT ON TABLE public.liquidaciones IS 'Liquidaciones por terminación de contrato';
COMMENT ON TABLE public.expediente_documentos IS 'Expediente digital de documentos por empleado';
COMMENT ON TABLE public.calendario_empresa IS 'Calendario de feriados y eventos de la empresa';
COMMENT ON TABLE public.horarios_trabajo IS 'Horarios de trabajo configurables';
COMMENT ON TABLE public.empleado_horarios IS 'Horarios asignados a cada empleado'; 