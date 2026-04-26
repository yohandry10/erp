-- ============================================================================
-- 289__security_secrets_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en
-- secretos/alertas/PII.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_security_secrets_estado_case_insensitive_runtime(
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
  WITH expected(table_name, detail_msg) AS (
    VALUES
      ('secret_rotation_state', 'secret_rotation_state.estado usa citext'),
      ('system_alerts', 'system_alerts.estado usa citext'),
      ('pii_encryption_log', 'pii_encryption_log.estado usa citext')
  )
  SELECT
    format('%s_estado_type_citext', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  SELECT
    'helper_normalize_security_secrets_estado_287_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_security_secrets_estado_287'
    ),
    'helper canonico de normalizacion de estado'::text;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail_msg) AS (
    VALUES
      ('secret_rotation_state', 'trg_normalize_secret_rotation_state_row', 'normalizacion secret_rotation_state'),
      ('system_alerts', 'trg_normalize_system_alerts_row', 'normalizacion system_alerts'),
      ('pii_encryption_log', 'trg_normalize_pii_encryption_log_row', 'normalizacion pii_encryption_log')
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
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(relname, conname, detail_msg) AS (
    VALUES
      ('secret_rotation_state', 'ck_secret_rotation_state_estado_valid_287', 'dominio estado secret_rotation_state'),
      ('system_alerts', 'ck_system_alerts_estado_valid_287', 'dominio estado system_alerts'),
      ('system_alerts', 'ck_system_alerts_estado_resolved_sync_287', 'consistencia estado/resolved_at system_alerts'),
      ('pii_encryption_log', 'ck_pii_encryption_log_estado_valid_287', 'dominio estado pii_encryption_log'),
      ('pii_encryption_log', 'ck_pii_encryption_log_estado_success_sync_287', 'consistencia estado/success pii_encryption_log')
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
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(tablename, indexname, detail_msg) AS (
    VALUES
      ('secret_rotation_state', 'idx_secret_rotation_state_tenant_estado_ci_runtime_287', 'indice CI secret_rotation_state'),
      ('system_alerts', 'idx_system_alerts_tenant_estado_ci_runtime_287', 'indice CI system_alerts'),
      ('pii_encryption_log', 'idx_pii_encryption_log_tenant_estado_ci_runtime_287', 'indice CI pii_encryption_log'),
      ('secret_rotation_state', 'ux_secret_rotation_state_scope_secret_rotated_at', 'unicidad scope+secret+rotated_at'),
      ('system_alerts', 'ux_system_alerts_scope_alert_key_unresolved', 'unicidad activa de alert_key no resuelta')
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
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('secret_rotation_state'),
      ('system_alerts'),
      ('pii_encryption_log')
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
      (SELECT COUNT(*) FROM public.secret_rotation_state s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id OR s.tenant_id IS NULL)
         AND s.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.secret_rotation_state s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id OR s.tenant_id IS NULL)
         AND s.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'secret_rotation_state_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.system_alerts a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id OR a.tenant_id IS NULL)
         AND a.estado = 'INACTIVO')
    - (SELECT COUNT(*) FROM public.system_alerts a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id OR a.tenant_id IS NULL)
         AND a.estado = 'inactivo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'system_alerts_estado_case_insensitive_inactivo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.pii_encryption_log p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
         AND p.estado = 'ERROR')
    - (SELECT COUNT(*) FROM public.pii_encryption_log p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
         AND p.estado = 'error')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'pii_encryption_log_estado_case_insensitive_error'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.secret_rotation_state s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id OR s.tenant_id IS NULL)
    AND (s.estado IS NULL OR lower(s.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'secret_rotation_state_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.system_alerts a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id OR a.tenant_id IS NULL)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'system_alerts_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pii_encryption_log p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (p.estado IS NULL OR lower(p.estado::text) NOT IN ('activo', 'error'));
  RETURN QUERY
  SELECT 'pii_encryption_log_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.system_alerts a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id OR a.tenant_id IS NULL)
    AND (
      (a.resolved_at IS NULL AND lower(a.estado::text) <> 'activo')
      OR (a.resolved_at IS NOT NULL AND lower(a.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'system_alerts_estado_resolved_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pii_encryption_log p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      (COALESCE(p.success, true) = true AND lower(p.estado::text) <> 'activo')
      OR (COALESCE(p.success, true) = false AND lower(p.estado::text) <> 'error')
    );
  RETURN QUERY
  SELECT 'pii_encryption_log_estado_success_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(s.secret_key) AS secret_key_norm,
      s.rotated_at,
      COUNT(*) AS c
    FROM public.secret_rotation_state s
    WHERE s.secret_key IS NOT NULL
      AND btrim(s.secret_key) <> ''
      AND s.rotated_at IS NOT NULL
      AND (
        p_tenant_id IS NULL
        OR s.tenant_id = p_tenant_id
        OR s.tenant_id IS NULL
      )
    GROUP BY COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(s.secret_key), s.rotated_at
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'duplicate_secret_rotation_scope_secret_rotated_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(a.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(a.alert_key) AS alert_key_norm,
      COUNT(*) AS c
    FROM public.system_alerts a
    WHERE a.alert_key IS NOT NULL
      AND btrim(a.alert_key) <> ''
      AND a.resolved_at IS NULL
      AND lower(a.estado::text) = 'activo'
      AND (
        p_tenant_id IS NULL
        OR a.tenant_id = p_tenant_id
        OR a.tenant_id IS NULL
      )
    GROUP BY COALESCE(a.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(a.alert_key)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'duplicate_system_alerts_active_alert_key_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_security_secrets_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_security_secrets_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
