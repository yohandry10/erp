-- ============================================================================
-- 050__dashboard_rpc_validation_pack.sql
-- Validación operativa de RPC de dashboard.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_dashboard_rpc_runtime(
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
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());
  v_count bigint;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar RPC dashboard';
    RETURN;
  END IF;

  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.get_dashboard_recent_activity(v_tenant_id, now() - interval '24 hours', 20);

    RETURN QUERY
    SELECT
      'get_dashboard_recent_activity'::text,
      true,
      format('rows=%s (limite<=20)', v_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'get_dashboard_recent_activity'::text,
        false,
        SQLERRM;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.get_dashboard_metrics_snapshot(v_tenant_id, date_trunc('month', now())::date, now()::date);

    RETURN QUERY
    SELECT
      'get_dashboard_metrics_snapshot'::text,
      (v_count = 1),
      format('rows=%s (esperado=1)', v_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'get_dashboard_metrics_snapshot'::text,
        false,
        SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE VIEW public.v_dashboard_rpc_status_actual AS
SELECT *
FROM public.validar_dashboard_rpc_runtime(app.resolve_request_tenant_id());

COMMIT;

