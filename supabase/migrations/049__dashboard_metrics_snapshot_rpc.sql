-- ============================================================================
-- 049__dashboard_metrics_snapshot_rpc.sql
-- RPC de snapshot de métricas clave de dashboard por tenant/período.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_dashboard_metrics_snapshot();
DROP FUNCTION IF EXISTS public.get_dashboard_metrics_snapshot(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_snapshot(
  p_tenant_id uuid,
  p_from date DEFAULT date_trunc('month', now())::date,
  p_to date DEFAULT now()::date
)
RETURNS TABLE (
  ventas_total numeric,
  compras_total numeric,
  total_cpe bigint,
  total_gre bigint,
  total_sire bigint,
  total_usuarios bigint,
  productos_stock_bajo bigint,
  cotizaciones_pendientes bigint,
  movimientos_hoy bigint,
  generated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_from date := COALESCE(p_from, date_trunc('month', now())::date);
  v_to date := COALESCE(p_to, now()::date);
  v_ventas numeric(14,2) := 0;
  v_compras numeric(14,2) := 0;
  v_cpe bigint := 0;
  v_gre bigint := 0;
  v_sire bigint := 0;
  v_users bigint := 0;
  v_stock_bajo bigint := 0;
  v_cot_pend bigint := 0;
  v_mov_hoy bigint := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      0::numeric,
      0::numeric,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      now();
    RETURN;
  END IF;

  SELECT COALESCE(SUM(app.to_numeric_or_zero(v.total::text)), 0)::numeric(14,2)
    INTO v_ventas
  FROM public.ventas_pos v
  WHERE v.tenant_id = p_tenant_id
    AND COALESCE(v.fecha::date, v.created_at::date) BETWEEN v_from AND v_to;

  SELECT COALESCE(SUM(app.to_numeric_or_zero(o.total::text)), 0)::numeric(14,2)
    INTO v_compras
  FROM public.ordenes_compra o
  WHERE o.tenant_id = p_tenant_id
    AND COALESCE(o.fecha_orden::date, o.created_at::date) BETWEEN v_from AND v_to;

  SELECT COUNT(*) INTO v_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND COALESCE(c.fecha_emision::date, c.created_at::date) BETWEEN v_from AND v_to;

  SELECT COUNT(*) INTO v_gre
  FROM public.gre g
  WHERE g.tenant_id = p_tenant_id
    AND COALESCE(g.fecha_emision::date, g.created_at::date) BETWEEN v_from AND v_to;

  SELECT COUNT(*) INTO v_sire
  FROM public.sire_files s
  WHERE s.tenant_id = p_tenant_id
    AND s.created_at::date BETWEEN v_from AND v_to;

  SELECT COUNT(*) INTO v_users
  FROM public.usuarios_sistema u
  WHERE u.tenant_id = p_tenant_id;

  SELECT COUNT(*) INTO v_stock_bajo
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
    AND app.to_numeric_or_zero(p.stock_actual::text) < app.to_numeric_or_zero(p.stock_minimo::text);

  SELECT COUNT(*) INTO v_cot_pend
  FROM public.cotizaciones c
  WHERE c.tenant_id = p_tenant_id
    AND COALESCE(c.estado, 'PENDIENTE') IN ('PENDIENTE', 'ENVIADA');

  SELECT COUNT(*) INTO v_mov_hoy
  FROM public.stock_movimientos m
  WHERE m.tenant_id = p_tenant_id
    AND m.created_at::date = now()::date;

  RETURN QUERY
  SELECT
    v_ventas,
    v_compras,
    v_cpe,
    v_gre,
    v_sire,
    v_users,
    v_stock_bajo,
    v_cot_pend,
    v_mov_hoy,
    now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_snapshot()
RETURNS TABLE (
  ventas_total numeric,
  compras_total numeric,
  total_cpe bigint,
  total_gre bigint,
  total_sire bigint,
  total_usuarios bigint,
  productos_stock_bajo bigint,
  cotizaciones_pendientes bigint,
  movimientos_hoy bigint,
  generated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.get_dashboard_metrics_snapshot(
    app.resolve_request_tenant_id(),
    date_trunc('month', now())::date,
    now()::date
  );
$$;

COMMIT;

