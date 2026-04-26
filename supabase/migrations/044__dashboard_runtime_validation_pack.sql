-- ============================================================================
-- 044__dashboard_runtime_validation_pack.sql
-- Validación operativa de dependencias de dashboard y sincronización de stock.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_dashboard_runtime(
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
  v_stock_count bigint := 0;
  v_legacy_count bigint := 0;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar dashboard';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'required_table.ventas_pos',
    (to_regclass('public.ventas_pos') IS NOT NULL),
    COALESCE(to_regclass('public.ventas_pos')::text, 'missing');

  RETURN QUERY
  SELECT
    'required_table.ordenes_compra',
    (to_regclass('public.ordenes_compra') IS NOT NULL),
    COALESCE(to_regclass('public.ordenes_compra')::text, 'missing');

  RETURN QUERY
  SELECT
    'required_table.cotizaciones',
    (to_regclass('public.cotizaciones') IS NOT NULL),
    COALESCE(to_regclass('public.cotizaciones')::text, 'missing');

  RETURN QUERY
  SELECT
    'required_table.movimientos_stock',
    (to_regclass('public.movimientos_stock') IS NOT NULL),
    COALESCE(to_regclass('public.movimientos_stock')::text, 'missing');

  RETURN QUERY
  SELECT
    'required_table.stock_movimientos',
    (to_regclass('public.stock_movimientos') IS NOT NULL),
    COALESCE(to_regclass('public.stock_movimientos')::text, 'missing');

  RETURN QUERY
  SELECT
    'required_trigger.stock_to_legacy_sync',
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'stock_movimientos'
        AND t.tgname = 'trg_sync_movimientos_stock_from_stock_movimientos'
        AND NOT t.tgisinternal
    ),
    'trigger=trg_sync_movimientos_stock_from_stock_movimientos';

  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.ventas_pos
    WHERE tenant_id = v_tenant_id;

    RETURN QUERY
    SELECT
      'query.ventas_pos_by_tenant',
      true,
      format('rows=%s', v_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'query.ventas_pos_by_tenant',
        false,
        SQLERRM;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_stock_count
    FROM public.stock_movimientos
    WHERE tenant_id = v_tenant_id;

    SELECT COUNT(*) INTO v_legacy_count
    FROM public.movimientos_stock
    WHERE tenant_id = v_tenant_id;

    RETURN QUERY
    SELECT
      'stock_sync.coverage',
      (v_legacy_count >= v_stock_count),
      format('stock_movimientos=%s movimientos_stock=%s', v_stock_count, v_legacy_count);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        'stock_sync.coverage',
        false,
        SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE VIEW public.v_dashboard_runtime_status_actual AS
SELECT *
FROM public.validar_dashboard_runtime(app.resolve_request_tenant_id());

CREATE OR REPLACE VIEW public.v_dashboard_stock_sync_gap AS
WITH stock AS (
  SELECT tenant_id, COUNT(*)::bigint AS stock_count
  FROM public.stock_movimientos
  GROUP BY tenant_id
),
legacy AS (
  SELECT tenant_id, COUNT(*)::bigint AS legacy_count
  FROM public.movimientos_stock
  GROUP BY tenant_id
)
SELECT
  COALESCE(s.tenant_id, l.tenant_id) AS tenant_id,
  COALESCE(s.stock_count, 0) AS stock_movimientos_count,
  COALESCE(l.legacy_count, 0) AS movimientos_stock_count,
  (COALESCE(l.legacy_count, 0) - COALESCE(s.stock_count, 0)) AS delta
FROM stock s
FULL OUTER JOIN legacy l ON l.tenant_id = s.tenant_id;

COMMIT;

