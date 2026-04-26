-- ============================================================================
-- 041__finanzas_rpc_validation_pack.sql
-- Validacion operativa de RPC financieras y de estadisticas contables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rpc_finanzas_runtime(
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
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id());
  v_count bigint;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar RPC financieras';
    RETURN;
  END IF;

  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.get_resumen_financiero_mensual(v_tenant_id, 12);

    RETURN QUERY
    SELECT
      'get_resumen_financiero_mensual'::text,
      (v_count >= 1),
      format('rows=%s (esperado >= 1)', v_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'get_resumen_financiero_mensual'::text,
        false,
        SQLERRM;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.get_kpis_financieros(v_tenant_id);

    RETURN QUERY
    SELECT
      'get_kpis_financieros'::text,
      (v_count = 1),
      format('rows=%s (esperado = 1)', v_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'get_kpis_financieros'::text,
        false,
        SQLERRM;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.get_analisis_crecimiento(v_tenant_id, 30);

    RETURN QUERY
    SELECT
      'get_analisis_crecimiento'::text,
      (v_count = 1),
      format('rows=%s (esperado = 1)', v_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'get_analisis_crecimiento'::text,
        false,
        SQLERRM;
  END;

  BEGIN
    PERFORM 1
    FROM public.get_asientos_por_tipo(v_tenant_id)
    LIMIT 1;

    RETURN QUERY
    SELECT
      'get_asientos_por_tipo'::text,
      true,
      'OK (ejecucion exitosa)';
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'get_asientos_por_tipo'::text,
        false,
        SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE VIEW public.v_finanzas_rpc_status_actual AS
SELECT *
FROM public.validar_rpc_finanzas_runtime(app.resolve_request_tenant_id());

COMMIT;

