-- ============================================================================
-- 250__auditoria_legacy_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en auditoria legacy.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_auditoria_legacy_estado_case_insensitive_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_count bigint;
  v_delta bigint;
BEGIN
  RETURN QUERY
  SELECT
    'citext_extension_present'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'extension citext instalada'::text;

  RETURN QUERY
  WITH expected(table_name, column_name, detail) AS (
    VALUES
      ('audit_log_archive', 'estado', 'audit_log_archive.estado usa citext'),
      ('auditoria', 'estado', 'auditoria.estado usa citext'),
      ('auditoria_cotizaciones', 'estado', 'auditoria_cotizaciones.estado usa citext')
  )
  SELECT
    format('%s_%s_type_citext', e.table_name, e.column_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
        AND c.udt_name = 'citext'
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(function_name, detail) AS (
    VALUES
      ('normalize_auditoria_legacy_estado_248', 'helper estado auditoria legacy')
  )
  SELECT
    format('helper_%s_exists', e.function_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = e.function_name
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('audit_log_archive', 'trg_normalize_audit_log_archive_row', 'trigger normalizacion audit_log_archive'),
      ('auditoria', 'trg_normalize_auditoria_row', 'trigger normalizacion auditoria'),
      ('auditoria_cotizaciones', 'trg_normalize_auditoria_cotizaciones_row', 'trigger normalizacion auditoria_cotizaciones'),
      ('audit_log_archive', 'trg_enforce_audit_log_archive_tenant_consistency', 'trigger consistencia tenant audit_log_archive'),
      ('auditoria', 'trg_enforce_auditoria_tenant_consistency', 'trigger consistencia tenant auditoria'),
      ('auditoria_cotizaciones', 'trg_enforce_auditoria_cotizaciones_tenant_consistency', 'trigger consistencia tenant auditoria_cotizaciones')
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

  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('audit_log_archive', 'ck_audit_log_archive_runtime', 'constraint runtime audit_log_archive'),
      ('auditoria', 'ck_auditoria_runtime', 'constraint runtime auditoria'),
      ('auditoria_cotizaciones', 'ck_auditoria_cotizaciones_runtime', 'constraint runtime auditoria_cotizaciones')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
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

  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('audit_log_archive', 'idx_audit_log_archive_tenant_archived_at_runtime', 'indice runtime archived_at'),
      ('audit_log_archive', 'idx_audit_log_archive_tenant_operation_runtime', 'indice runtime operation'),
      ('audit_log_archive', 'ux_audit_log_archive_scope_runtime', 'indice unico runtime scope'),
      ('audit_log_archive', 'idx_audit_log_archive_tenant_estado_ci_runtime_248', 'indice runtime estado CI'),
      ('auditoria', 'idx_auditoria_tenant_tabla_ocurrido_runtime', 'indice runtime tabla'),
      ('auditoria', 'idx_auditoria_tenant_criticidad_ocurrido_runtime', 'indice runtime criticidad'),
      ('auditoria', 'idx_auditoria_tenant_estado_ci_runtime_248', 'indice runtime estado CI'),
      ('auditoria_cotizaciones', 'idx_auditoria_cotizaciones_tenant_cotizacion_timestamp_runtime', 'indice runtime cotizacion'),
      ('auditoria_cotizaciones', 'idx_auditoria_cotizaciones_tenant_criticidad_timestamp_runtime', 'indice runtime criticidad'),
      ('auditoria_cotizaciones', 'idx_auditoria_cotizaciones_tenant_estado_ci_runtime_248', 'indice runtime estado CI')
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

  SELECT ABS(
      (SELECT COUNT(*) FROM public.audit_log_archive a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'ARCHIVADO')
    - (SELECT COUNT(*) FROM public.audit_log_archive a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'archivado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'audit_log_archive_estado_case_insensitive_archivado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.auditoria a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.auditoria a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'auditoria_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.auditoria_cotizaciones ac
       WHERE (p_tenant_id IS NULL OR ac.tenant_id = p_tenant_id) AND ac.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.auditoria_cotizaciones ac
       WHERE (p_tenant_id IS NULL OR ac.tenant_id = p_tenant_id) AND ac.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'auditoria_cotizaciones_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, source_table, source_id, operation, archived_at, COUNT(*)
    FROM public.audit_log_archive
    WHERE tenant_id IS NOT NULL
      AND source_table IS NOT NULL
      AND archived_at IS NOT NULL
      AND lower(estado::text) <> 'inactivo'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, source_table, source_id, operation, archived_at
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'audit_log_archive_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

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
      OR a.estado IS NULL
      OR lower(a.estado::text) NOT IN ('activo', 'inactivo', 'archivado')
    );
  RETURN QUERY SELECT 'audit_log_archive_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

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
      OR a.estado IS NULL
      OR lower(a.estado::text) NOT IN ('activo', 'inactivo', 'archivado')
    );
  RETURN QUERY SELECT 'auditoria_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

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
      OR ac.estado IS NULL
      OR lower(ac.estado::text) NOT IN ('activo', 'inactivo', 'archivado')
    );
  RETURN QUERY SELECT 'auditoria_cotizaciones_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.audit_log_archive a
  JOIN public.usuarios_sistema u ON u.id = a.actor_user_id
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.tenant_id IS DISTINCT FROM u.tenant_id;
  RETURN QUERY SELECT 'audit_log_archive_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auditoria a
  JOIN public.usuarios_sistema u ON u.id = a.usuario_id
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.tenant_id IS DISTINCT FROM u.tenant_id;
  RETURN QUERY SELECT 'auditoria_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

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
  RETURN QUERY SELECT 'auditoria_cotizaciones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_auditoria_legacy_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_auditoria_legacy_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
