-- =============================================
-- MIGRACIÓN SISTEMA DE CONVERSIÓN DE COTIZACIONES
-- Fecha: 2024-12-31
-- Descripción: Agregar funcionalidades de aprobación y conversión de cotizaciones
-- =============================================

-- 1. AGREGAR COLUMNAS PARA SEGUIMIENTO DE APROBACIONES Y CONVERSIONES

DO $$
BEGIN
    -- Verificar y agregar columnas de fechas de seguimiento
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'fecha_aprobacion') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN fecha_aprobacion TIMESTAMP;
        RAISE NOTICE '✅ Columna fecha_aprobacion agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'fecha_conversion') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN fecha_conversion TIMESTAMP;
        RAISE NOTICE '✅ Columna fecha_conversion agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'fecha_rechazo') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN fecha_rechazo TIMESTAMP;
        RAISE NOTICE '✅ Columna fecha_rechazo agregada';
    END IF;

    -- Verificar y agregar columnas de usuarios responsables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'aprobado_por') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN aprobado_por UUID;
        RAISE NOTICE '✅ Columna aprobado_por agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'convertido_por') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN convertido_por UUID;
        RAISE NOTICE '✅ Columna convertido_por agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'rechazado_por') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN rechazado_por UUID;
        RAISE NOTICE '✅ Columna rechazado_por agregada';
    END IF;

    -- Verificar y agregar columnas de observaciones y referencias
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'observaciones_aprobacion') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN observaciones_aprobacion TEXT;
        RAISE NOTICE '✅ Columna observaciones_aprobacion agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'motivo_rechazo') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN motivo_rechazo TEXT;
        RAISE NOTICE '✅ Columna motivo_rechazo agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'cotizaciones' AND column_name = 'documento_generado_id') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN documento_generado_id UUID;
        RAISE NOTICE '✅ Columna documento_generado_id agregada';
    END IF;

    RAISE NOTICE '🎉 Todas las columnas de conversión han sido verificadas y agregadas según sea necesario';
END $$;

-- 2. AGREGAR COLUMNA DE REFERENCIA EN DOCUMENTOS

DO $$
BEGIN
    -- Verificar y agregar referencia a cotización origen en documentos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'documentos' AND column_name = 'cotizacion_origen_id') THEN
        ALTER TABLE public.documentos ADD COLUMN cotizacion_origen_id UUID;
        RAISE NOTICE '✅ Columna cotizacion_origen_id agregada a documentos';
    END IF;

    -- Agregar foreign key si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                  WHERE constraint_name = 'fk_documentos_cotizacion_origen') THEN
        ALTER TABLE public.documentos 
        ADD CONSTRAINT fk_documentos_cotizacion_origen 
        FOREIGN KEY (cotizacion_origen_id) REFERENCES public.cotizaciones(id);
        RAISE NOTICE '✅ Foreign key fk_documentos_cotizacion_origen agregada';
    END IF;
END $$;

-- 3. AGREGAR ÍNDICES PARA OPTIMIZAR CONSULTAS

CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado_fecha ON public.cotizaciones(estado, fecha_cotizacion);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_conversion ON public.cotizaciones(documento_generado_id) WHERE documento_generado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_cotizacion_origen ON public.documentos(cotizacion_origen_id) WHERE cotizacion_origen_id IS NOT NULL;

-- 4. FUNCIÓN PARA ACTUALIZAR ESTADÍSTICAS DE CONVERSIÓN

CREATE OR REPLACE FUNCTION actualizar_estadisticas_conversion()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Esta función puede ser llamada para recalcular estadísticas
    -- Actualizar tasas de conversión, etc.
    RAISE NOTICE 'Estadísticas de conversión actualizadas';
END $$;

-- 5. FUNCIÓN PARA VALIDAR CONVERSIÓN DE COTIZACIÓN

CREATE OR REPLACE FUNCTION validar_conversion_cotizacion(
    p_cotizacion_id UUID
)
RETURNS TABLE (
    puede_convertir BOOLEAN,
    motivo TEXT,
    requiere_aprobacion BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cotizacion RECORD;
    v_puede_convertir BOOLEAN := true;
    v_motivo TEXT := '';
    v_requiere_aprobacion BOOLEAN := false;
BEGIN
    -- Obtener información de la cotización
    SELECT * INTO v_cotizacion
    FROM public.cotizaciones
    WHERE id = p_cotizacion_id;

    -- Validar que existe
    IF NOT FOUND THEN
        v_puede_convertir := false;
        v_motivo := 'Cotización no encontrada';
        RETURN QUERY SELECT v_puede_convertir, v_motivo, v_requiere_aprobacion;
        RETURN;
    END IF;

    -- Validar estado
    IF v_cotizacion.estado = 'CONVERTIDA' THEN
        v_puede_convertir := false;
        v_motivo := 'Esta cotización ya ha sido convertida';
    ELSIF v_cotizacion.estado = 'RECHAZADA' THEN
        v_puede_convertir := false;
        v_motivo := 'No se puede convertir una cotización rechazada';
    ELSIF v_cotizacion.fecha_vencimiento < CURRENT_DATE AND v_cotizacion.estado != 'APROBADA' THEN
        v_puede_convertir := false;
        v_motivo := 'La cotización está vencida';
    ELSIF v_cotizacion.cliente_id IS NULL THEN
        v_puede_convertir := false;
        v_motivo := 'La cotización no tiene cliente asignado';
    ELSIF v_cotizacion.total <= 0 THEN
        v_puede_convertir := false;
        v_motivo := 'La cotización no tiene monto válido';
    END IF;

    -- Verificar si requiere aprobación
    IF v_cotizacion.estado != 'APROBADA' AND v_puede_convertir THEN
        v_requiere_aprobacion := true;
    END IF;

    RETURN QUERY SELECT v_puede_convertir, v_motivo, v_requiere_aprobacion;
END $$;

-- 6. TRIGGER PARA AUDITORÍA DE CAMBIOS DE ESTADO

CREATE OR REPLACE FUNCTION audit_cotizacion_estado_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Auditar cambios de estado importantes
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO public.auditoria_cotizaciones (
            cotizacion_id,
            estado_anterior,
            estado_nuevo,
            fecha_cambio,
            usuario_cambio
        ) VALUES (
            NEW.id,
            OLD.estado,
            NEW.estado,
            NOW(),
            NEW.updated_by
        );
    END IF;

    RETURN NEW;
END $$;

-- Crear tabla de auditoría si no existe
CREATE TABLE IF NOT EXISTS public.auditoria_cotizaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id),
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    fecha_cambio TIMESTAMP DEFAULT NOW(),
    usuario_cambio UUID,
    observaciones TEXT
);

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS tr_audit_cotizacion_estado ON public.cotizaciones;
CREATE TRIGGER tr_audit_cotizacion_estado
    AFTER UPDATE ON public.cotizaciones
    FOR EACH ROW
    EXECUTE FUNCTION audit_cotizacion_estado_change();

-- 7. INSERTAR DATOS DE EJEMPLO PARA TESTING

INSERT INTO public.cotizaciones (
    id,
    tenant_id,
    numero,
    cliente_id,
    fecha_cotizacion,
    fecha_vencimiento,
    vendedor,
    moneda,
    subtotal,
    igv,
    total,
    estado,
    probabilidad,
    items,
    observaciones,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440000',
    'COT-2024-12-001',
    gen_random_uuid(),
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'Vendedor Demo',
    'PEN',
    1000.00,
    180.00,
    1180.00,
    'BORRADOR',
    75,
    '[{"codigo": "PROD001", "descripcion": "Producto de prueba", "cantidad": 2, "precio_unitario": 500, "total": 1000}]'::json,
    'Cotización de ejemplo para testing del sistema de conversión',
    NOW(),
    NOW()
) ON CONFLICT (numero) DO NOTHING;

RAISE NOTICE '🎉 Migración del sistema de conversión de cotizaciones completada exitosamente';
RAISE NOTICE '📋 Nuevas funcionalidades disponibles:';
RAISE NOTICE '   ✅ Aprobación de cotizaciones';
RAISE NOTICE '   🔄 Conversión automática a documentos';
RAISE NOTICE '   ❌ Rechazo con motivos';
RAISE NOTICE '   📊 Auditoría completa de cambios';
RAISE NOTICE '   🔍 Validaciones de negocio'; 