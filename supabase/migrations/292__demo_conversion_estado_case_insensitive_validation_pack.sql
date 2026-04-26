-- ============================================================================
-- 292__demo_conversion_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en
-- conversion demo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_demo_conversion_estado_case_insensitive_runtime(
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
  SELECT
    'demo_conversiones_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'demo_conversiones_pendientes'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'demo_conversiones_pendientes.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'helper_normalize_demo_conversion_estado_290_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_demo_conversion_estado_290'
    ),
    'helper canonico de normalizacion de estado demo'::text;

  RETURN QUERY
  SELECT
    'trigger_trg_normalize_demo_conversiones_pendientes_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'demo_conversiones_pendientes'
        AND t.tgname = 'trg_normalize_demo_conversiones_pendientes_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion runtime de demo_conversiones_pendientes'::text;

  RETURN QUERY
  WITH expected(conname, detail_msg) AS (
    VALUES
      ('ck_demo_conv_estado_valid', 'dominio estado demo_conversiones_pendientes'),
      ('ck_demo_conv_completed_requires_timestamp', 'consistencia completada/completed_at'),
      ('ck_demo_conv_pending_requires_session', 'consistencia pendiente/stripe_session_id'),
      ('ck_demo_conv_failed_states_require_failed_at_291', 'consistencia estados fallidos/failed_at')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'demo_conversiones_pendientes'
        AND c.conname = e.conname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(indexname, detail_msg) AS (
    VALUES
      ('idx_demo_conv_tenant_estado_ci_runtime_290', 'indice CI tenant+estado'),
      ('idx_demo_conv_session_estado_ci_runtime_290', 'indice CI session+estado'),
      ('ux_demo_conv_stripe_session', 'unicidad stripe_session_id'),
      ('ux_demo_conv_tenant_pending', 'unicidad pendiente por tenant')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = 'demo_conversiones_pendientes'
        AND i.indexname = e.indexname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  SELECT
    'rls_demo_conversiones_enabled_forced'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'demo_conversiones_pendientes'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS enabled+forced en demo_conversiones_pendientes'::text;

  RETURN QUERY
  SELECT
    'rls_demo_conversiones_policy_superadmin_only'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'demo_conversiones_pendientes'
        AND p.policyname = 'demo_conversiones_superadmin_only'
    ),
    'policy superadmin-only presente'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.demo_conversiones_pendientes d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'PENDIENTE')
    - (SELECT COUNT(*) FROM public.demo_conversiones_pendientes d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'pendiente')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'demo_conversion_estado_case_insensitive_pendiente'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.demo_conversiones_pendientes d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (d.estado IS NULL OR lower(d.estado::text) NOT IN ('pendiente', 'completada', 'fallida', 'cancelada', 'expirada'));
  RETURN QUERY
  SELECT 'demo_conversion_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.demo_conversiones_pendientes d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND lower(d.estado::text) = 'pendiente'
    AND (d.stripe_session_id IS NULL OR btrim(d.stripe_session_id) = '');
  RETURN QUERY
  SELECT 'demo_conversion_pending_without_session_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.demo_conversiones_pendientes d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND lower(d.estado::text) = 'completada'
    AND d.completed_at IS NULL;
  RETURN QUERY
  SELECT 'demo_conversion_completed_without_timestamp_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.demo_conversiones_pendientes d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND lower(d.estado::text) IN ('fallida', 'cancelada', 'expirada')
    AND d.failed_at IS NULL;
  RETURN QUERY
  SELECT 'demo_conversion_failed_states_without_failed_at_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      upper(d.stripe_session_id) AS session_norm,
      COUNT(*) AS c
    FROM public.demo_conversiones_pendientes d
    WHERE d.stripe_session_id IS NOT NULL
      AND btrim(d.stripe_session_id) <> ''
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    GROUP BY upper(d.stripe_session_id)
    HAVING COUNT(*) > 1
  ) dup;
  RETURN QUERY
  SELECT 'duplicate_demo_conversion_session_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      d.tenant_id,
      COUNT(*) AS c
    FROM public.demo_conversiones_pendientes d
    WHERE lower(d.estado::text) = 'pendiente'
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    GROUP BY d.tenant_id
    HAVING COUNT(*) > 1
  ) dup;
  RETURN QUERY
  SELECT 'duplicate_demo_conversion_pending_by_tenant_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_demo_conversion_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_demo_conversion_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
