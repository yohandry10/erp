-- ============================================================================
-- 301__rebuild_smoke_tests_module_validation_pack.sql
-- Pack de validacion runtime para infraestructura de smoke tests por modulo.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS fn_ref
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn.fn_ref);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn.fn_ref);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn.fn_ref);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.fn_ref);
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.validar_smoke_tests_modulos_runtime(
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
  v_modules bigint;
  v_failed bigint;
  v_failures_view bigint;
  v_failed_summary bigint;
  v_internal_errors bigint;
BEGIN
  v_tenant_id := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());

  RETURN QUERY
  SELECT
    'function_ejecutar_smoke_tests_modulos_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'ejecutar_smoke_tests_modulos_runtime'
    ),
    'función principal de smoke tests por modulo'::text;

  RETURN QUERY
  SELECT
    'function_resumen_smoke_tests_modulos_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'resumen_smoke_tests_modulos_runtime'
    ),
    'función de resumen por modulo'::text;

  RETURN QUERY
  WITH expected(view_name, detail_msg) AS (
    VALUES
      ('v_smoke_tests_modulos_runtime_actual', 'vista de checks por modulo'),
      ('v_smoke_tests_modulos_summary_actual', 'vista resumen por modulo'),
      ('v_smoke_tests_modulos_failures_actual', 'vista de fallas por modulo'),
      ('v_smoke_tests_modulos_global_actual', 'vista global de smoke tests')
  )
  SELECT
    format('view_%s_exists', e.view_name)::text,
    to_regclass(format('public.%s', e.view_name)) IS NOT NULL,
    e.detail_msg::text
  FROM expected e;

  SELECT
    COUNT(*) AS total_checks,
    COUNT(DISTINCT s.module_name) AS modules_covered,
    COUNT(*) FILTER (WHERE NOT s.ok) AS failed_checks
  INTO v_total, v_modules, v_failed
  FROM public.ejecutar_smoke_tests_modulos_runtime(v_tenant_id) s;

  RETURN QUERY
  SELECT
    'smoke_checks_rows_available'::text,
    (v_total > 0),
    format('rows=%s', v_total)::text;

  RETURN QUERY
  SELECT
    'smoke_modules_covered_minimum'::text,
    (v_modules >= 9),
    format('modules=%s (min_expected=9)', v_modules)::text;

  RETURN QUERY
  SELECT
    'smoke_checks_minimum'::text,
    (v_total >= 70),
    format('checks=%s (min_expected=70)', v_total)::text;

  SELECT COUNT(*)
  INTO v_internal_errors
  FROM public.ejecutar_smoke_tests_modulos_runtime(v_tenant_id) s
  WHERE s.check_name IN ('orchestrator_execution_error', 'orchestrator_function_missing');

  RETURN QUERY
  SELECT
    'smoke_internal_execution_errors'::text,
    (v_internal_errors = 0),
    format('rows=%s', v_internal_errors)::text;

  SELECT COUNT(*)
  INTO v_failures_view
  FROM public.ejecutar_smoke_tests_modulos_runtime(v_tenant_id) s
  WHERE NOT s.ok;

  SELECT COALESCE(SUM(r.failed_checks), 0)
  INTO v_failed_summary
  FROM public.resumen_smoke_tests_modulos_runtime(v_tenant_id) r;

  RETURN QUERY
  SELECT
    'smoke_failures_consistency'::text,
    (v_failures_view = v_failed AND v_failed_summary = v_failed),
    format(
      'failed_from_full=%s failed_filtered=%s failed_summary=%s',
      v_failed,
      v_failures_view,
      v_failed_summary
    )::text;

  RETURN QUERY
  SELECT
    'smoke_failures_zero'::text,
    (v_failed = 0),
    format('failed=%s', v_failed)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_smoke_tests_modulos_validation_status_actual AS
SELECT *
FROM public.validar_smoke_tests_modulos_runtime(app.resolve_request_tenant_id());

COMMIT;
