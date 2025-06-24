-- Creación de la tabla de departamentos
CREATE TABLE IF NOT EXISTS public.departamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.departamentos IS 'Almacena los departamentos de la empresa.';

-- Creación de la tabla de empleados
CREATE TABLE IF NOT EXISTS public.empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    tipo_documento TEXT NOT NULL, -- DNI, CE, Pasaporte
    numero_documento TEXT NOT NULL UNIQUE,
    fecha_nacimiento DATE,
    direccion TEXT,
    telefono TEXT,
    email TEXT UNIQUE,
    puesto TEXT,
    id_departamento UUID REFERENCES public.departamentos(id),
    fecha_ingreso DATE,
    estado TEXT DEFAULT 'activo', -- activo, inactivo
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.empleados IS 'Información de los empleados de la empresa.';

-- Creación de la tabla de contratos
CREATE TABLE IF NOT EXISTS public.contratos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empleado UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
    tipo_contrato TEXT, -- Indefinido, Plazo Fijo, Practicante
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    sueldo_bruto NUMERIC(10, 2),
    regimen_laboral TEXT, -- General, MYPE
    regimen_pensionario TEXT, -- AFP, ONP
    nombre_afp TEXT,
    cuspp TEXT,
    estado TEXT DEFAULT 'vigente', -- vigente, terminado
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.contratos IS 'Contratos laborales de los empleados.'; 