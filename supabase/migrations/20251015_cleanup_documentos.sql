-- =============================================
-- SCRIPT DE LIMPIEZA: MÓDULO DE DOCUMENTOS
-- Fecha: 2025-10-15
-- Descripción: Elimina todas las tablas del módulo de documentos
--              para permitir una instalación limpia
-- =============================================

-- Eliminar triggers primero
DROP TRIGGER IF EXISTS trigger_auditoria_documento ON public.documentos CASCADE;
DROP TRIGGER IF EXISTS update_documentos_updated_at ON public.documentos CASCADE;
DROP TRIGGER IF EXISTS update_fe_configuracion_updated_at ON public.fe_configuracion CASCADE;

-- Eliminar vistas
DROP VIEW IF EXISTS v_documentos_completos CASCADE;
DROP VIEW IF EXISTS v_documentos_pendientes_sunat CASCADE;

-- Eliminar tablas en orden inverso de dependencias
DROP TABLE IF EXISTS public.documento_auditoria CASCADE;
DROP TABLE IF EXISTS public.documento_archivos CASCADE;
DROP TABLE IF EXISTS public.documento_detalles CASCADE;
DROP TABLE IF EXISTS public.documento_series CASCADE;
DROP TABLE IF EXISTS public.fe_configuracion CASCADE;
DROP TABLE IF EXISTS public.documentos CASCADE;

-- Eliminar funciones
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS registrar_auditoria_documento() CASCADE;
DROP FUNCTION IF EXISTS obtener_siguiente_numero_serie(UUID, VARCHAR, VARCHAR) CASCADE;

-- Verificar que se eliminaron correctamente
DO $$
BEGIN
    RAISE NOTICE '✅ Limpieza completada';
    RAISE NOTICE '✅ Todas las tablas del módulo de documentos han sido eliminadas';
    RAISE NOTICE '✅ Ahora puedes ejecutar el script 20251015_create_documentos_module_complete.sql';
END $$;
