-- ============================================================================
-- 298__rebuild_runtime_validation_pack.sql
-- Pack de validacion del orquestador transversal de reconstruccion runtime.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rebuild_orchestrator_runtime(
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
  v_tenant_id uuid;
  v_total bigint;
  v_failed bigint;
  v_packs bigint;
  v_internal_errors bigint;
  v_filtered_failures bigint;
BEGIN
  v_tenant_id := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());

  RETURN QUERY
  SELECT
    'function_validar_rebuild_runtime_orchestrator_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'validar_rebuild_runtime_orchestrator'
    ),
    'función orquestadora presente'::text;

  RETURN QUERY
  SELECT
    'function_validar_rebuild_runtime_summary_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'validar_rebuild_runtime_summary'
    ),
    'función de resumen presente'::text;

  RETURN QUERY
  WITH expected(view_name, detail_msg) AS (
    VALUES
      ('v_rebuild_runtime_checks_actual', 'vista de checks completos'),
      ('v_rebuild_runtime_failures_actual', 'vista de checks fallidos'),
      ('v_rebuild_runtime_summary_actual', 'vista de resumen agregado'),
      ('v_rebuild_runtime_pack_metrics_actual', 'vista de métricas por pack')
  )
  SELECT
    format('view_%s_exists', e.view_name)::text,
    to_regclass(format('public.%s', e.view_name)) IS NOT NULL,
    e.detail_msg::text
  FROM expected e;

  SELECT
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE NOT o.ok) AS failed_checks,
    COUNT(DISTINCT o.pack_name) AS packs_covered
  INTO v_total, v_failed, v_packs
  FROM public.validar_rebuild_runtime_orchestrator(v_tenant_id, false) o;

  RETURN QUERY
  SELECT
    'orchestrator_returns_rows'::text,
    (v_total > 0),
    format('rows=%s', v_total)::text;

  RETURN QUERY
  SELECT
    'orchestrator_packs_covered_minimum'::text,
    (v_packs >= 10),
    format('packs=%s (min_expected=10)', v_packs)::text;

  SELECT COUNT(*)
  INTO v_internal_errors
  FROM public.validar_rebuild_runtime_orchestrator(v_tenant_id, false) o
  WHERE o.check_name IN ('function_execution_error', 'function_signature_not_supported');

  RETURN QUERY
  SELECT
    'orchestrator_internal_errors'::text,
    (v_internal_errors = 0),
    format('rows=%s', v_internal_errors)::text;

  SELECT COUNT(*)
  INTO v_filtered_failures
  FROM public.validar_rebuild_runtime_orchestrator(v_tenant_id, true);

  RETURN QUERY
  SELECT
    'orchestrator_fail_filter_consistency'::text,
    (v_filtered_failures = v_failed),
    format('filtered_failures=%s failed_from_full=%s', v_filtered_failures, v_failed)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rebuild_orchestrator_runtime_status_actual AS
SELECT *
FROM public.validar_rebuild_orchestrator_runtime(app.resolve_request_tenant_id());

COMMIT;
