-- ============================================================================
-- 297__rebuild_runtime_validation_views.sql
-- Vistas y resumen operativo sobre el orquestador de validaciones runtime.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rebuild_runtime_summary(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_checks bigint,
  passed_checks bigint,
  failed_checks bigint,
  packs_covered bigint,
  generated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
  SELECT
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE ok) AS passed_checks,
    COUNT(*) FILTER (WHERE NOT ok) AS failed_checks,
    COUNT(DISTINCT pack_name) AS packs_covered,
    now() AS generated_at
  FROM public.validar_rebuild_runtime_orchestrator(
    COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id()),
    false
  );
$$;

CREATE OR REPLACE VIEW public.v_rebuild_runtime_summary_actual AS
SELECT *
FROM public.validar_rebuild_runtime_summary(app.resolve_request_tenant_id());

CREATE OR REPLACE VIEW public.v_rebuild_runtime_failures_actual AS
SELECT *
FROM public.validar_rebuild_runtime_orchestrator(app.resolve_request_tenant_id(), true);

CREATE OR REPLACE VIEW public.v_rebuild_runtime_pack_metrics_actual AS
SELECT
  pack_name,
  COUNT(*) AS total_checks,
  COUNT(*) FILTER (WHERE ok) AS passed_checks,
  COUNT(*) FILTER (WHERE NOT ok) AS failed_checks
FROM public.validar_rebuild_runtime_orchestrator(app.resolve_request_tenant_id(), false)
GROUP BY pack_name
ORDER BY failed_checks DESC, total_checks DESC, pack_name ASC;

COMMIT;
