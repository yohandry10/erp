-- ============================================================================
-- 097__security_rate_limit_validation_pack.sql
-- Pack de validación runtime para security / adaptive rate limiting.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_security_rate_limit_runtime(
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
  RETURN QUERY
  SELECT
    'trigger_normalize_trusted_ips_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'trusted_ips'
        AND t.tgname = 'trg_normalize_trusted_ips_row'
        AND NOT t.tgisinternal
    ),
    'normalización de trusted_ips';

  RETURN QUERY
  SELECT
    'trigger_normalize_rate_limit_blocks_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rate_limit_blocks'
        AND t.tgname = 'trg_normalize_rate_limit_blocks_row'
        AND NOT t.tgisinternal
    ),
    'normalización de rate_limit_blocks';

  RETURN QUERY
  SELECT
    'trigger_normalize_rate_limit_configs_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rate_limit_configs'
        AND t.tgname = 'trg_normalize_rate_limit_configs_row'
        AND NOT t.tgisinternal
    ),
    'normalización de rate_limit_configs';

  RETURN QUERY
  SELECT
    'trigger_normalize_rate_limit_anomalies_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rate_limit_anomalies'
        AND t.tgname = 'trg_normalize_rate_limit_anomalies_row'
        AND NOT t.tgisinternal
    ),
    'normalización de rate_limit_anomalies';

  RETURN QUERY
  SELECT
    'trusted_ips_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 3
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'trusted_ips'
        AND c.column_name IN ('ip_address', 'description', 'active')
    ),
    'columnas usadas por AdaptiveRateLimitService';

  RETURN QUERY
  SELECT
    'rate_limit_blocks_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 3
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'rate_limit_blocks'
        AND c.column_name IN ('user_id', 'reason', 'expires_at')
    ),
    'columnas usadas para bloqueos';

  RETURN QUERY
  SELECT
    'rate_limit_configs_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'rate_limit_configs'
        AND c.column_name IN (
          'endpoint_pattern',
          'base_limit',
          'window_ms',
          'adaptive_multiplier',
          'burst_multiplier',
          'enabled'
        )
    ),
    'columnas runtime para configuración por endpoint';

  RETURN QUERY
  SELECT
    'ux_trusted_ips_scope_active_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'trusted_ips'
        AND indexname = 'ux_trusted_ips_scope_active'
    ),
    'unicidad de trusted ips activas por alcance';

  RETURN QUERY
  SELECT
    'ux_rate_limit_configs_scope_endpoint_enabled_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'rate_limit_configs'
        AND indexname = 'ux_rate_limit_configs_scope_endpoint_enabled'
    ),
    'unicidad de configuraciones activas por endpoint';

  SELECT COUNT(*)
  INTO v_count
  FROM public.trusted_ips t
  WHERE (
      t.ip_address IS NULL
      OR t.description IS NULL
      OR btrim(t.description) = ''
      OR (t.expires_at IS NOT NULL AND t.expires_at <= t.created_at)
    )
    AND (
      p_tenant_id IS NULL
      OR t.tenant_id = p_tenant_id
      OR t.tenant_id IS NULL
    );

  RETURN QUERY
  SELECT
    'trusted_ips_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_blocks b
  WHERE (
      b.reason IS NULL
      OR btrim(b.reason) = ''
      OR b.request_count < 0
      OR (b.expires_at IS NOT NULL AND b.expires_at <= b.created_at)
    )
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rate_limit_blocks_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_configs c
  WHERE (
      c.endpoint_pattern IS NULL
      OR btrim(c.endpoint_pattern) = ''
      OR c.base_limit <= 0
      OR c.window_ms <= 0
      OR c.adaptive_multiplier <= 0
      OR c.burst_multiplier < 1
    )
    AND (
      p_tenant_id IS NULL
      OR c.tenant_id = p_tenant_id
      OR c.tenant_id IS NULL
    );

  RETURN QUERY
  SELECT
    'rate_limit_configs_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_baselines b
  WHERE (
      COALESCE(b.avg_requests_per_hour, 0) < 0
      OR COALESCE(b.max_requests_per_hour, 0) < 0
      OR COALESCE(b.std_deviation, 0) < 0
      OR COALESCE(b.sample_count, 0) < 0
    )
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rate_limit_baselines_invalid_metrics'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.request_logs r
  WHERE (
      (r.status_code IS NOT NULL AND (r.status_code < 100 OR r.status_code > 599))
      OR (r.response_time_ms IS NOT NULL AND r.response_time_ms < 0)
      OR (r.request_size IS NOT NULL AND r.request_size < 0)
      OR (r.response_size IS NOT NULL AND r.response_size < 0)
    )
    AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'request_logs_invalid_metrics'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_anomalies a
  WHERE (
      a.severity NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
      OR a.anomaly_type NOT IN ('BURST', 'SUSTAINED', 'PATTERN', 'GEOGRAPHIC')
      OR COALESCE(a.request_count, 0) < 0
    )
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rate_limit_anomalies_invalid_values'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      t.ip_address,
      COUNT(*) AS c
    FROM public.trusted_ips t
    WHERE t.ip_address IS NOT NULL
      AND COALESCE(t.active, true) = true
      AND (
        p_tenant_id IS NULL
        OR t.tenant_id = p_tenant_id
        OR t.tenant_id IS NULL
      )
    GROUP BY COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), t.ip_address
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_trusted_ips_active_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

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
      AND COALESCE(c.enabled, true) = true
      AND (
        p_tenant_id IS NULL
        OR c.tenant_id = p_tenant_id
        OR c.tenant_id IS NULL
      )
    GROUP BY COALESCE(c.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(c.endpoint_pattern)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_rate_limit_configs_enabled_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_security_rate_limit_runtime_status_actual AS
SELECT *
FROM public.validar_security_rate_limit_runtime(app.resolve_request_tenant_id());

COMMIT;
