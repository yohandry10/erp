-- ============================================================================
-- 121__observabilidad_validation_pack.sql
-- Pack de validación runtime de observabilidad.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_observabilidad_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  -- Triggers
  RETURN QUERY
  SELECT
    'trigger_normalize_integration_logs_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'integration_logs'
        AND t.tgname = 'trg_normalize_integration_logs_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de integration_logs';

  RETURN QUERY
  SELECT
    'trigger_normalize_notificaciones_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'notificaciones'
        AND t.tgname = 'trg_normalize_notificaciones_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de notificaciones';

  RETURN QUERY
  SELECT
    'trigger_normalize_audit_log_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'audit_log'
        AND t.tgname = 'trg_normalize_audit_log_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de audit_log';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'integration_logs_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'integration_logs'
        AND c.column_name IN (
          'servicio', 'operacion', 'correlacion_id', 'correlacion_tipo',
          'status', 'status_code', 'error_message',
          'request_summary', 'response_summary',
          'duration_ms', 'timestamp', 'payload'
        )
    ),
    'columnas runtime de integration_logs';

  RETURN QUERY
  SELECT
    'notificaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'notificaciones'
        AND c.column_name IN (
          'usuario_id', 'roles_destinatarios',
          'tipo', 'severidad', 'titulo', 'mensaje',
          'action_url', 'action_label',
          'leida', 'leida_at'
        )
    ),
    'columnas runtime de notificaciones';

  RETURN QUERY
  SELECT
    'audit_log_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'audit_log'
        AND c.column_name IN (
          'tenant_id', 'user_id',
          'table_name', 'operation', 'record_id',
          'old_values', 'new_values',
          'changed_fields', 'metadata', 'timestamp'
        )
    ),
    'columnas runtime de audit_log';

  -- Índices de soporte
  RETURN QUERY
  SELECT
    'idx_integration_logs_tenant_timestamp_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'integration_logs'
        AND indexname = 'idx_integration_logs_tenant_timestamp_runtime'
    ),
    'índice por tenant/timestamp en integration_logs';

  RETURN QUERY
  SELECT
    'idx_notificaciones_tenant_usuario_leida_created_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'notificaciones'
        AND indexname = 'idx_notificaciones_tenant_usuario_leida_created_runtime'
    ),
    'índice por tenant/usuario/leída/created_at en notificaciones';

  RETURN QUERY
  SELECT
    'idx_audit_log_tenant_table_timestamp_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'audit_log'
        AND indexname = 'idx_audit_log_tenant_table_timestamp_runtime'
    ),
    'índice por tenant/tabla/timestamp en audit_log';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_integration_logs_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'integration_logs'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en integration_logs';

  RETURN QUERY
  SELECT
    'rls_notificaciones_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'notificaciones'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en notificaciones';

  RETURN QUERY
  SELECT
    'rls_audit_log_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'audit_log'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en audit_log';

  -- Filas inválidas: integration_logs
  SELECT COUNT(*)
  INTO v_count
  FROM public.integration_logs l
  WHERE (
      l.servicio IS NULL OR btrim(l.servicio) = ''
      OR l.operacion IS NULL OR btrim(l.operacion) = ''
      OR l.status IS NULL
      OR l.status NOT IN ('SUCCESS', 'ERROR', 'SKIP', 'PENDING', 'TIMEOUT', 'GENERATED', 'COMPLETED', 'WARNING', 'INFO')
      OR l.timestamp IS NULL
      OR (l.duration_ms IS NOT NULL AND l.duration_ms < 0)
      OR (l.status_code IS NOT NULL AND (l.status_code < 100 OR l.status_code > 599))
    )
    AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'integration_logs_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  -- Filas inválidas: notificaciones
  SELECT COUNT(*)
  INTO v_count
  FROM public.notificaciones n
  WHERE (
      n.tipo IS NULL OR btrim(n.tipo) = ''
      OR n.severidad IS NULL OR n.severidad NOT IN ('info', 'warning', 'error', 'success', 'critical')
      OR n.titulo IS NULL OR btrim(n.titulo) = ''
      OR n.mensaje IS NULL OR btrim(n.mensaje) = ''
      OR n.roles_destinatarios IS NULL
      OR (COALESCE(n.leida, false) = true AND n.leida_at IS NULL)
    )
    AND (p_tenant_id IS NULL OR n.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'notificaciones_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  -- Filas inválidas: audit_log
  SELECT COUNT(*)
  INTO v_count
  FROM public.audit_log a
  WHERE (
      a.table_name IS NULL OR btrim(a.table_name) = ''
      OR a.operation IS NULL
      OR a.operation NOT IN (
        'INSERT', 'UPDATE', 'DELETE',
        'LOGIN', 'LOGOUT',
        'CREATE', 'READ',
        'APPROVE', 'REJECT',
        'ASSIGN', 'UNASSIGN'
      )
      OR a.timestamp IS NULL
      OR (a.changed_fields IS NOT NULL AND jsonb_typeof(a.changed_fields) <> 'array')
    )
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'audit_log_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_observabilidad_runtime_status_actual AS
SELECT *
FROM public.validar_observabilidad_runtime(app.resolve_request_tenant_id());

COMMIT;
