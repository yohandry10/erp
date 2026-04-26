-- =====================================================
-- MIGRACIÓN 063: Rotación Automática de Logs de Auditoría
-- =====================================================
-- Descripción: Implementa rotación automática de logs de auditoría moviendo logs
--              antiguos (> 1 año) a una tabla de archivo para mantener el rendimiento
--              y controlar el tamaño de la base de datos
-- Prioridad: BAJA - Tarea 15: Rotación automática de logs
-- Fecha: 2025-01-XX
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CREAR TABLA DE ARCHIVO audit_log_archive
-- =====================================================
-- Tabla idéntica a audit_log para almacenar logs antiguos
-- Incluye todas las columnas de audit_log más archived_at

CREATE TABLE IF NOT EXISTS audit_log_archive (
  id UUID PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  tenant_id UUID,
  timestamp TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  resource_id UUID,
  action_description TEXT,
  record_id UUID,
  changed_fields TEXT[],
  metadata JSONB,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para la tabla de archivo (optimizados para consultas históricas)
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_timestamp 
  ON audit_log_archive(tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_table_timestamp 
  ON audit_log_archive(table_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_user_timestamp 
  ON audit_log_archive(user_id, timestamp DESC) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_record 
  ON audit_log_archive(tenant_id, table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_archived_at 
  ON audit_log_archive(archived_at DESC);

COMMENT ON TABLE audit_log_archive IS 
  'Tabla de archivo para logs de auditoría antiguos (> 1 año). Los logs se mueven aquí automáticamente para mantener el rendimiento de audit_log.';

COMMENT ON COLUMN audit_log_archive.archived_at IS 
  'Fecha y hora en que el registro fue archivado (movido desde audit_log)';

-- =====================================================
-- 2. FUNCIÓN: rotar_logs_auditoria
-- =====================================================
-- Mueve logs más antiguos que el período de retención (por defecto 1 año) 
-- a la tabla de archivo

CREATE OR REPLACE FUNCTION rotar_logs_auditoria(
  p_retention_days INTEGER DEFAULT 365
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_moved_count INTEGER;
  v_start_time TIMESTAMPTZ := NOW();
  v_end_time TIMESTAMPTZ;
  v_duration INTERVAL;
BEGIN
  -- Calcular fecha de corte
  v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;

  RAISE NOTICE '📦 Iniciando rotación de logs de auditoría anteriores a %', v_cutoff_date;

  -- Mover logs antiguos a tabla de archivo
  INSERT INTO audit_log_archive (
    id,
    table_name,
    operation,
    old_values,
    new_values,
    user_id,
    tenant_id,
    timestamp,
    ip_address,
    user_agent,
    resource_id,
    action_description,
    record_id,
    changed_fields,
    metadata,
    archived_at
  )
  SELECT 
    id,
    table_name,
    operation,
    old_values,
    new_values,
    user_id,
    tenant_id,
    timestamp,
    ip_address,
    user_agent,
    resource_id,
    action_description,
    record_id,
    changed_fields,
    metadata,
    NOW()  -- archived_at
  FROM audit_log
  WHERE timestamp < v_cutoff_date;

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  -- Eliminar logs movidos de la tabla principal
  DELETE FROM audit_log
  WHERE timestamp < v_cutoff_date;

  v_end_time := NOW();
  v_duration := v_end_time - v_start_time;

  RAISE NOTICE '✅ Rotación completada: % registros movidos a archivo en %', 
    v_moved_count, v_duration;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'records_moved', v_moved_count,
    'cutoff_date', v_cutoff_date,
    'duration_seconds', EXTRACT(EPOCH FROM v_duration),
    'start_time', v_start_time,
    'end_time', v_end_time
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error en rotación de logs de auditoría: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION rotar_logs_auditoria IS 
  'Mueve logs de auditoría más antiguos que el período de retención (por defecto 365 días) a la tabla audit_log_archive.';

-- =====================================================
-- 3. FUNCIÓN: obtener_estadisticas_logs_auditoria
-- =====================================================
-- Retorna estadísticas sobre el tamaño y distribución de logs

CREATE OR REPLACE FUNCTION obtener_estadisticas_logs_auditoria()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'audit_log', jsonb_build_object(
      'total_records', (SELECT COUNT(*) FROM audit_log),
      'table_size_bytes', (SELECT pg_total_relation_size('audit_log')),
      'table_size_pretty', pg_size_pretty(pg_total_relation_size('audit_log')),
      'oldest_record', (SELECT MIN(timestamp) FROM audit_log),
      'newest_record', (SELECT MAX(timestamp) FROM audit_log),
      'records_older_than_1_year', (
        SELECT COUNT(*) FROM audit_log 
        WHERE timestamp < NOW() - INTERVAL '1 year'
      )
    ),
    'audit_log_archive', jsonb_build_object(
      'total_records', (SELECT COUNT(*) FROM audit_log_archive),
      'table_size_bytes', (SELECT pg_total_relation_size('audit_log_archive')),
      'table_size_pretty', pg_size_pretty(pg_total_relation_size('audit_log_archive')),
      'oldest_record', (SELECT MIN(timestamp) FROM audit_log_archive),
      'newest_record', (SELECT MAX(timestamp) FROM audit_log_archive),
      'oldest_archived', (SELECT MIN(archived_at) FROM audit_log_archive)
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION obtener_estadisticas_logs_auditoria IS 
  'Retorna estadísticas sobre el tamaño y distribución de logs de auditoría y archivo.';

-- =====================================================
-- 4. GRANT PERMISOS
-- =====================================================

GRANT SELECT, INSERT, DELETE ON audit_log_archive TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rotar_logs_auditoria(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION obtener_estadisticas_logs_auditoria() TO authenticated, service_role;

-- =====================================================
-- 5. JOB AUTOMÁTICO (si pg_cron está disponible)
-- =====================================================
-- Programar rotación automática mensual (día 1 de cada mes a las 2 AM)

-- Nota: pg_cron puede no estar disponible en todos los entornos de Supabase
-- En ese caso, se debe ejecutar manualmente o usar un worker externo
DO $$
DECLARE
  v_job_id INTEGER;
BEGIN
  -- Intentar crear el job si pg_cron está disponible
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Eliminar job existente si existe
    BEGIN
      SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'rotar_logs_auditoria_mensual';
      IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule('rotar_logs_auditoria_mensual');
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        NULL; -- Ignorar si no existe
    END;
    
    -- Crear nuevo job
    BEGIN
      PERFORM cron.schedule(
        'rotar_logs_auditoria_mensual',
        '0 2 1 * *',  -- Día 1 de cada mes a las 2:00 AM
        'SELECT rotar_logs_auditoria(365);'
      );
      
      RAISE NOTICE '✅ Job automático de rotación de logs programado para ejecutarse mensualmente';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '⚠️ No se pudo crear job automático: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '⚠️ pg_cron no está disponible. La rotación debe ejecutarse manualmente o mediante worker externo.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Error verificando pg_cron: %. La rotación debe ejecutarse manualmente.', SQLERRM;
END $$;

-- =====================================================
-- 6. VERIFICACIÓN DE FUNCIONES CREADAS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'rotar_logs_auditoria'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: Función rotar_logs_auditoria no fue creada correctamente';
  ELSE
    RAISE NOTICE '✅ Función rotar_logs_auditoria creada exitosamente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'obtener_estadisticas_logs_auditoria'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: Función obtener_estadisticas_logs_auditoria no fue creada correctamente';
  ELSE
    RAISE NOTICE '✅ Función obtener_estadisticas_logs_auditoria creada exitosamente';
  END IF;
END $$;

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- CARACTERÍSTICAS DE LA IMPLEMENTACIÓN:
-- 1. Tabla audit_log_archive con estructura idéntica a audit_log
-- 2. Función rotar_logs_auditoria() para mover logs antiguos
-- 3. Función obtener_estadisticas_logs_auditoria() para monitoreo
-- 4. Job automático mensual (si pg_cron está disponible)
-- 5. Índices optimizados para consultas históricas
--
-- USO MANUAL:
-- SELECT rotar_logs_auditoria(365);  -- Mover logs > 1 año
-- SELECT obtener_estadisticas_logs_auditoria();  -- Ver estadísticas
--
-- EJECUCIÓN RECOMENDADA:
-- - Automática: Mensualmente (día 1 de cada mes)
-- - Manual: Cuando sea necesario liberar espacio
-- - Worker externo: Si pg_cron no está disponible
--
-- RETENCIÓN POR DEFECTO:
-- - audit_log: Últimos 365 días (1 año)
-- - audit_log_archive: Permanente (se puede limpiar manualmente si es necesario)
--
-- ROLLBACK:
-- DROP TABLE IF EXISTS audit_log_archive CASCADE;
-- DROP FUNCTION IF EXISTS rotar_logs_auditoria(INTEGER);
-- DROP FUNCTION IF EXISTS obtener_estadisticas_logs_auditoria();
-- SELECT cron.unschedule('rotar_logs_auditoria_mensual');
-- =====================================================

