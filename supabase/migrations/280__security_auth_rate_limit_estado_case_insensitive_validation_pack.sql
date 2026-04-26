-- ============================================================================
-- 280__security_auth_rate_limit_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en
-- seguridad/auth/rate-limit.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_security_auth_rate_limit_estado_case_insensitive_runtime(
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
      ('auth_login_attempts', 'auth_login_attempts.estado usa citext'),
      ('user_sessions', 'user_sessions.estado usa citext'),
      ('trusted_ips', 'trusted_ips.estado usa citext'),
      ('rate_limit_blocks', 'rate_limit_blocks.estado usa citext'),
      ('rate_limit_configs', 'rate_limit_configs.estado usa citext'),
      ('rate_limit_anomalies', 'rate_limit_anomalies.estado usa citext'),
      ('rate_limit_baselines', 'rate_limit_baselines.estado usa citext'),
      ('request_logs', 'request_logs.estado usa citext')
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
    'helper_normalize_security_auth_rate_limit_estado_278_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_security_auth_rate_limit_estado_278'
    ),
    'helper canonico de normalizacion de estado'::text;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail_msg) AS (
    VALUES
      ('auth_login_attempts', 'trg_normalize_auth_login_attempts_row', 'normalizacion auth_login_attempts'),
      ('user_sessions', 'trg_normalize_user_sessions_row', 'normalizacion user_sessions'),
      ('trusted_ips', 'trg_normalize_trusted_ips_row', 'normalizacion trusted_ips'),
      ('rate_limit_blocks', 'trg_normalize_rate_limit_blocks_row', 'normalizacion rate_limit_blocks'),
      ('rate_limit_configs', 'trg_normalize_rate_limit_configs_row', 'normalizacion rate_limit_configs'),
      ('rate_limit_anomalies', 'trg_normalize_rate_limit_anomalies_row', 'normalizacion rate_limit_anomalies'),
      ('rate_limit_baselines', 'trg_normalize_rate_limit_baselines_row_278', 'normalizacion rate_limit_baselines'),
      ('request_logs', 'trg_normalize_request_logs_row_278', 'normalizacion request_logs')
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
      ('auth_login_attempts', 'ck_auth_login_attempts_estado_runtime_278', 'dominio estado auth_login_attempts'),
      ('auth_login_attempts', 'ck_auth_login_attempts_estado_success_consistency_278', 'consistencia estado/success auth_login_attempts'),
      ('user_sessions', 'ck_user_sessions_estado_runtime_278', 'dominio estado user_sessions'),
      ('user_sessions', 'ck_user_sessions_revocation_estado_consistency', 'consistencia estado/revocacion user_sessions'),
      ('trusted_ips', 'ck_trusted_ips_estado_runtime_278', 'dominio estado trusted_ips'),
      ('trusted_ips', 'ck_trusted_ips_estado_active_consistency_278', 'consistencia estado/active trusted_ips'),
      ('rate_limit_blocks', 'ck_rate_limit_blocks_estado_runtime_278', 'dominio estado rate_limit_blocks'),
      ('rate_limit_blocks', 'ck_rate_limit_blocks_estado_release_consistency_278', 'consistencia estado/released_at rate_limit_blocks'),
      ('rate_limit_configs', 'ck_rate_limit_configs_estado_runtime_278', 'dominio estado rate_limit_configs'),
      ('rate_limit_configs', 'ck_rate_limit_configs_estado_enabled_consistency_278', 'consistencia estado/enabled rate_limit_configs'),
      ('rate_limit_anomalies', 'ck_rate_limit_anomalies_estado_runtime_278', 'dominio estado rate_limit_anomalies'),
      ('rate_limit_anomalies', 'ck_rate_limit_anomalies_estado_review_consistency_278', 'consistencia estado/reviewed_at rate_limit_anomalies'),
      ('rate_limit_baselines', 'ck_rate_limit_baselines_estado_runtime_278', 'dominio estado rate_limit_baselines'),
      ('request_logs', 'ck_request_logs_estado_runtime_278', 'dominio estado request_logs')
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
      ('auth_login_attempts', 'idx_auth_login_attempts_tenant_estado_ci_runtime_278', 'indice CI auth_login_attempts'),
      ('user_sessions', 'idx_user_sessions_tenant_estado_ci_runtime_278', 'indice CI user_sessions'),
      ('trusted_ips', 'idx_trusted_ips_scope_estado_ci_runtime_278', 'indice CI trusted_ips'),
      ('rate_limit_blocks', 'idx_rate_limit_blocks_tenant_estado_ci_runtime_278', 'indice CI rate_limit_blocks'),
      ('rate_limit_configs', 'idx_rate_limit_configs_tenant_estado_ci_runtime_278', 'indice CI rate_limit_configs'),
      ('rate_limit_anomalies', 'idx_rate_limit_anomalies_tenant_estado_ci_runtime_278', 'indice CI rate_limit_anomalies'),
      ('rate_limit_baselines', 'idx_rate_limit_baselines_tenant_estado_ci_runtime_278', 'indice CI rate_limit_baselines'),
      ('request_logs', 'idx_request_logs_tenant_estado_ci_runtime_278', 'indice CI request_logs'),
      ('trusted_ips', 'ux_trusted_ips_scope_active', 'unicidad active trusted_ips'),
      ('rate_limit_configs', 'ux_rate_limit_configs_scope_endpoint_enabled', 'unicidad enabled rate_limit_configs')
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
      ('auth_login_attempts'),
      ('user_sessions'),
      ('trusted_ips'),
      ('rate_limit_blocks'),
      ('rate_limit_configs'),
      ('rate_limit_anomalies'),
      ('rate_limit_baselines'),
      ('request_logs')
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
      (SELECT COUNT(*) FROM public.auth_login_attempts a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
         AND a.estado = 'EXITOSO')
    - (SELECT COUNT(*) FROM public.auth_login_attempts a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
         AND a.estado = 'exitoso')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'auth_login_attempts_estado_case_insensitive_exitoso'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.user_sessions s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
         AND s.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.user_sessions s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
         AND s.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'user_sessions_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.trusted_ips t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
         AND t.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.trusted_ips t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
         AND t.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'trusted_ips_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.rate_limit_configs c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id OR c.tenant_id IS NULL)
         AND c.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.rate_limit_configs c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id OR c.tenant_id IS NULL)
         AND c.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'rate_limit_configs_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.auth_login_attempts a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('exitoso', 'fallido', 'bloqueada'));
  RETURN QUERY
  SELECT 'auth_login_attempts_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_sessions s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND (s.estado IS NULL OR lower(s.estado::text) NOT IN ('activo', 'inactivo', 'revocada', 'expirada'));
  RETURN QUERY
  SELECT 'user_sessions_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.trusted_ips t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
    AND (t.estado IS NULL OR lower(t.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'trusted_ips_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_blocks b
  WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND (b.estado IS NULL OR lower(b.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'rate_limit_blocks_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_configs c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id OR c.tenant_id IS NULL)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'rate_limit_configs_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_anomalies a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('activo', 'inactivo', 'revisada'));
  RETURN QUERY
  SELECT 'rate_limit_anomalies_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_baselines b
  WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND (b.estado IS NULL OR lower(b.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'rate_limit_baselines_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.request_logs r
  WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
    AND (r.estado IS NULL OR lower(r.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'request_logs_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.auth_login_attempts a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      (COALESCE(a.success, false) = true AND lower(a.estado::text) <> 'exitoso')
      OR (COALESCE(a.success, false) = false AND lower(a.estado::text) NOT IN ('fallido', 'bloqueada'))
    );
  RETURN QUERY
  SELECT 'auth_login_attempts_success_estado_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_sessions s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND s.revoked_at IS NOT NULL
    AND lower(s.estado::text) NOT IN ('revocada', 'inactivo', 'expirada');
  RETURN QUERY
  SELECT 'user_sessions_revoked_estado_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.trusted_ips t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id OR t.tenant_id IS NULL)
    AND (
      t.active IS NULL
      OR (t.active = true AND lower(t.estado::text) <> 'activo')
      OR (t.active = false AND lower(t.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'trusted_ips_active_estado_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_configs c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id OR c.tenant_id IS NULL)
    AND (
      c.enabled IS NULL
      OR (c.enabled = true AND lower(c.estado::text) <> 'activo')
      OR (c.enabled = false AND lower(c.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'rate_limit_configs_enabled_estado_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_anomalies a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.reviewed_at IS NOT NULL
    AND lower(a.estado::text) NOT IN ('revisada', 'inactivo');
  RETURN QUERY
  SELECT 'rate_limit_anomalies_reviewed_estado_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      t.ip_address,
      COUNT(*) AS c
    FROM public.trusted_ips t
    WHERE t.ip_address IS NOT NULL
      AND lower(t.estado::text) = 'activo'
      AND (
        p_tenant_id IS NULL
        OR t.tenant_id = p_tenant_id
        OR t.tenant_id IS NULL
      )
    GROUP BY COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), t.ip_address
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'trusted_ips_duplicate_active_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(c.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(c.endpoint_pattern) AS endpoint_pattern,
      COUNT(*) AS c
    FROM public.rate_limit_configs c
    WHERE c.endpoint_pattern IS NOT NULL
      AND btrim(c.endpoint_pattern) <> ''
      AND lower(c.estado::text) = 'activo'
      AND (
        p_tenant_id IS NULL
        OR c.tenant_id = p_tenant_id
        OR c.tenant_id IS NULL
      )
    GROUP BY COALESCE(c.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(c.endpoint_pattern)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'rate_limit_configs_duplicate_active_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_security_auth_rate_limit_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_security_auth_rate_limit_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
