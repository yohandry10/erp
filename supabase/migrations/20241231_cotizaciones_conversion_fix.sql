-- =============================================
-- MIGRACIÓN SIMPLE - SISTEMA DE CONVERSIÓN DE COTIZACIONES
-- Fecha: 2024-12-31
-- Descripción: Agregar columnas para aprobación y conversión (SIN ERRORES)
-- =============================================

-- 1. AGREGAR COLUMNAS PARA SEGUIMIENTO DE CONVERSIONES
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMP;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_conversion TIMESTAMP;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_rechazo TIMESTAMP;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS aprobado_por UUID;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS convertido_por UUID;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS rechazado_por UUID;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS observaciones_aprobacion TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS documento_generado_id UUID;

-- 2. AGREGAR COLUMNA DE REFERENCIA EN DOCUMENTOS
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS cotizacion_origen_id UUID;

-- 3. CREAR TABLA DE AUDITORÍA
CREATE TABLE IF NOT EXISTS public.auditoria_cotizaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cotizacion_id UUID NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    fecha_cambio TIMESTAMP DEFAULT NOW(),
    usuario_cambio UUID,
    observaciones TEXT
);

-- 4. AGREGAR ÍNDICES PARA OPTIMIZAR CONSULTAS
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON public.cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha ON public.cotizaciones(fecha_cotizacion);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_conversion ON public.cotizaciones(documento_generado_id); 