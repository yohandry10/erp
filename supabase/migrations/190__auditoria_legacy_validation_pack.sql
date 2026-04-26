-- ============================================================================
-- 190__auditoria_legacy_validation_pack.sql
-- Runtime validation pack for:
-- - audit_log_archive
-- - auditoria
-- - auditoria_cotizaciones
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_auditoria_legacy_runtime(
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
  -- Normalize triggers.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('audit_log_archive', 'trg_normalize_audit_log_archive_row', 'normalize audit_log_archive'),
      ('auditoria', 'trg_normalize_auditoria_row', 'normalize auditoria'),
      ('auditoria_cotizaciones', 'trg_normalize_auditoria_cotizaciones_row', 'normalize auditoria_cotizaciones')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ),
    e.detail::text
  FROM expected e;

  -- Enforce triggers.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('audit_log_archive', 'trg_enforce_audit_log_archive_tenant_consistency', 'enforce tenant audit_log_archive'),
      ('auditoria', 'trg_enforce_auditoria_tenant_consistency', 'enforce tenant auditoria'),
      ('auditoria_cotizaciones', 'trg_enforce_auditoria_cotizaciones_tenant_consistency', 'enforce tenant auditoria_cotizaciones')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ),
    e.detail::text
  FROM expected e;

  -- Runtime columns.
  RETURN QUERY
  SELECT
    'audit_log_archive_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'audit_log_archive'
        AND column_name IN ('tenant_id', 'source_table', 'source_id', 'operation', 'actor_user_id', 'actor_email', 'archived_at', 'retention_until', 'payload', 'motivo_archivo')
    ),
    'runtime shape audit_log_archive'::text;

  RETURN QUERY
  SELECT
    'auditoria_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auditoria'
        AND column_name IN ('tenant_id', 'tabla', 'accion', 'registro_id', 'usuario_id', 'ip_address', 'detalles', 'ocurrido_en', 'criticidad')
    ),
    'runtime shape auditoria'::text;

  RETURN QUERY
  SELECT
    'auditoria_cotizaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auditoria_cotizaciones'
        AND column_name IN ('tenant_id', 'cotizacion_id', 'usuario_id', 'accion', 'cambios', 'timestamp', 'ip_address', 'criticidad')
    ),
    'runtime shape auditoria_cotizaciones'::text;

  -- FKs.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('audit_log_archive', 'audit_log_archive_actor_user_id_fkey_runtime', 'FK archive -> usuarios_sistema'),
      ('auditoria', 'auditoria_usuario_id_fkey_runtime', 'FK auditoria -> usuarios_sistema'),
      ('auditoria_cotizaciones', 'auditoria_cotizaciones_usuario_id_fkey_runtime', 'FK auditoria_cotizaciones -> usuarios_sistema'),
      ('auditoria_cotizaciones', 'auditoria_cotizaciones_cotizacion_id_fkey_runtime', 'FK auditoria_cotizaciones -> cotizaciones')
  )
  SELECT
    format('fk_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ),
    e.detail::text
  FROM expected e;

  -- Indexes/uniqueness.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('audit_log_archive', 'idx_audit_log_archive_tenant_archived_at_runtime', 'runtime index archive by archived_at'),
      ('audit_log_archive', 'idx_audit_log_archive_tenant_operation_runtime', 'runtime index archive by operation'),
      ('audit_log_archive', 'ux_audit_log_archive_scope_runtime', 'unique dedupe scope archive'),
      ('auditoria', 'idx_auditoria_tenant_tabla_ocurrido_runtime', 'runtime index auditoria by tabla'),
      ('auditoria', 'idx_auditoria_tenant_usuario_ocurrido_runtime', 'runtime index auditoria by usuario'),
      ('auditoria', 'idx_auditoria_tenant_criticidad_ocurrido_runtime', 'runtime index auditoria by criticidad'),
      ('auditoria_cotizaciones', 'idx_auditoria_cotizaciones_tenant_cotizacion_timestamp_runtime', 'runtime index auditoria_cotizaciones by cotizacion'),
      ('auditoria_cotizaciones', 'idx_auditoria_cotizaciones_tenant_accion_timestamp_runtime', 'runtime index auditoria_cotizaciones by accion'),
      ('auditoria_cotizaciones', 'idx_auditoria_cotizaciones_tenant_criticidad_timestamp_runtime', 'runtime index auditoria_cotizaciones by criticidad')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail::text
  FROM expected e;

  -- RLS enabled + forced.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('audit_log_archive'),
      ('auditoria'),
      ('auditoria_cotizaciones')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Duplicate scope check.
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, source_table, source_id, operation, archived_at, COUNT(*)
    FROM public.audit_log_archive
    WHERE tenant_id IS NOT NULL
      AND source_table IS NOT NULL
      AND archived_at IS NOT NULL
      AND estado <> 'INACTIVO'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, source_table, source_id, operation, archived_at
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'audit_log_archive_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Invalid rows.
  SELECT COUNT(*)
  INTO v_count
  FROM public.audit_log_archive a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.tenant_id IS NULL
      OR a.source_table IS NULL
      OR btrim(a.source_table) = ''
      OR a.operation NOT IN ('INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'ARCHIVE', 'RESTORE', 'LOGIN', 'LOGOUT')
      OR a.archived_at IS NULL
      OR a.retention_until IS NULL
      OR a.retention_until < a.archived_at
      OR a.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
    );
  RETURN QUERY
  SELECT 'audit_log_archive_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auditoria a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.tenant_id IS NULL
      OR a.tabla IS NULL
      OR btrim(a.tabla) = ''
      OR a.accion IS NULL
      OR btrim(a.accion) = ''
      OR a.ocurrido_en IS NULL
      OR a.criticidad NOT IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')
      OR a.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
    );
  RETURN QUERY
  SELECT 'auditoria_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auditoria_cotizaciones ac
  WHERE (p_tenant_id IS NULL OR ac.tenant_id = p_tenant_id)
    AND (
      ac.tenant_id IS NULL
      OR ac.accion IS NULL
      OR btrim(ac.accion) = ''
      OR ac."timestamp" IS NULL
      OR ac.criticidad NOT IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')
      OR ac.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
    );
  RETURN QUERY
  SELECT 'auditoria_cotizaciones_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Tenant mismatch checks.
  SELECT COUNT(*)
  INTO v_count
  FROM public.audit_log_archive a
  JOIN public.usuarios_sistema u ON u.id = a.actor_user_id
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.tenant_id IS DISTINCT FROM u.tenant_id;
  RETURN QUERY
  SELECT 'audit_log_archive_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auditoria a
  JOIN public.usuarios_sistema u ON u.id = a.usuario_id
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.tenant_id IS DISTINCT FROM u.tenant_id;
  RETURN QUERY
  SELECT 'auditoria_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auditoria_cotizaciones ac
  LEFT JOIN public.usuarios_sistema u ON u.id = ac.usuario_id
  LEFT JOIN public.cotizaciones c ON c.id = ac.cotizacion_id
  WHERE (p_tenant_id IS NULL OR ac.tenant_id = p_tenant_id)
    AND (
      (u.id IS NOT NULL AND ac.tenant_id IS DISTINCT FROM u.tenant_id)
      OR (c.id IS NOT NULL AND ac.tenant_id IS DISTINCT FROM c.tenant_id)
    );
  RETURN QUERY
  SELECT 'auditoria_cotizaciones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_auditoria_legacy_runtime_status_actual AS
SELECT *
FROM public.validar_auditoria_legacy_runtime(NULL);

COMMIT;
