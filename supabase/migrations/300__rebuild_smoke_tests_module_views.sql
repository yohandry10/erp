-- ============================================================================
-- 300__rebuild_smoke_tests_module_views.sql
-- Vistas y resumen operativo de smoke tests por modulo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.resumen_smoke_tests_modulos_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  module_name text,
  total_checks bigint,
  passed_checks bigint,
  failed_checks bigint,
  pass_rate numeric(6,2),
  generated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
  SELECT
    s.module_name,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE s.ok) AS passed_checks,
    COUNT(*) FILTER (WHERE NOT s.ok) AS failed_checks,
    CASE
      WHEN COUNT(*) = 0 THEN 0::numeric
      ELSE round((COUNT(*) FILTER (WHERE s.ok)::numeric * 100.0) / COUNT(*)::numeric, 2)
    END AS pass_rate,
    now() AS generated_at
  FROM public.ejecutar_smoke_tests_modulos_runtime(
    COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id())
  ) s
  GROUP BY s.module_name
  ORDER BY failed_checks DESC, total_checks DESC, s.module_name ASC;
$$;

CREATE OR REPLACE VIEW public.v_smoke_tests_modulos_runtime_actual AS
SELECT *
FROM public.ejecutar_smoke_tests_modulos_runtime(app.resolve_request_tenant_id());

CREATE OR REPLACE VIEW public.v_smoke_tests_modulos_summary_actual AS
SELECT *
FROM public.resumen_smoke_tests_modulos_runtime(app.resolve_request_tenant_id());

CREATE OR REPLACE VIEW public.v_smoke_tests_modulos_failures_actual AS
SELECT *
FROM public.ejecutar_smoke_tests_modulos_runtime(app.resolve_request_tenant_id())
WHERE NOT ok;

CREATE OR REPLACE VIEW public.v_smoke_tests_modulos_global_actual AS
SELECT
  COUNT(*) AS total_checks,
  COUNT(*) FILTER (WHERE ok) AS passed_checks,
  COUNT(*) FILTER (WHERE NOT ok) AS failed_checks,
  CASE
    WHEN COUNT(*) = 0 THEN 0::numeric
    ELSE round((COUNT(*) FILTER (WHERE ok)::numeric * 100.0) / COUNT(*)::numeric, 2)
  END AS pass_rate,
  now() AS generated_at
FROM public.ejecutar_smoke_tests_modulos_runtime(app.resolve_request_tenant_id());

COMMIT;
