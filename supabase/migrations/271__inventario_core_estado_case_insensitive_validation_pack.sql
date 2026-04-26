-- ============================================================================
-- 271__inventario_core_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en inventario core.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_inventario_core_estado_case_insensitive_runtime(
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
  WITH expected(table_name, column_name, detail) AS (
    VALUES
      ('productos', 'estado', 'productos.estado usa citext'),
      ('almacenes', 'estado', 'almacenes.estado usa citext'),
      ('almacen_ubicaciones', 'estado', 'almacen_ubicaciones.estado usa citext'),
      ('movimientos_inventario', 'estado', 'movimientos_inventario.estado usa citext'),
      ('stock_movimientos', 'estado', 'stock_movimientos.estado usa citext'),
      ('producto_stock_sucursal', 'estado', 'producto_stock_sucursal.estado usa citext')
  )
  SELECT
    format('%s_%s_type_citext', e.table_name, e.column_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
        AND c.udt_name = 'citext'
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(function_name, detail) AS (
    VALUES
      ('normalize_productos_estado_269', 'helper productos'),
      ('normalize_almacenes_estado_269', 'helper almacenes'),
      ('normalize_almacen_ubicaciones_estado_269', 'helper almacen_ubicaciones'),
      ('normalize_movimientos_inventario_estado_269', 'helper movimientos_inventario'),
      ('normalize_stock_movimientos_estado_269', 'helper stock_movimientos'),
      ('normalize_producto_stock_sucursal_estado_269', 'helper producto_stock_sucursal')
  )
  SELECT
    format('helper_%s_exists', e.function_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = e.function_name
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('productos', 'trg_normalize_productos_row', 'normalizacion productos'),
      ('almacenes', 'trg_normalize_almacenes_row', 'normalizacion almacenes'),
      ('almacen_ubicaciones', 'trg_normalize_almacen_ubicaciones_row', 'normalizacion almacen_ubicaciones'),
      ('movimientos_inventario', 'trg_normalize_movimientos_inventario_row', 'normalizacion movimientos_inventario'),
      ('stock_movimientos', 'trg_normalize_stock_movimientos_row', 'normalizacion stock_movimientos'),
      ('producto_stock_sucursal', 'trg_normalize_producto_stock_sucursal_row', 'normalizacion producto_stock_sucursal'),
      ('stock_movimientos', 'trg_sync_movimientos_stock_from_stock_movimientos', 'sync legacy movimientos_stock')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('productos', 'ck_productos_estado_runtime', 'constraint estado productos'),
      ('almacenes', 'ck_almacenes_estado_runtime', 'constraint estado almacenes'),
      ('almacen_ubicaciones', 'ck_almacen_ubicaciones_estado_runtime', 'constraint estado almacen_ubicaciones'),
      ('movimientos_inventario', 'ck_movimientos_inventario_estado_runtime', 'constraint estado movimientos_inventario'),
      ('stock_movimientos', 'ck_stock_movimientos_estado_runtime', 'constraint estado stock_movimientos'),
      ('producto_stock_sucursal', 'ck_producto_stock_sucursal_estado_runtime', 'constraint estado producto_stock_sucursal')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('productos', 'idx_productos_tenant_estado_ci_runtime_269', 'indice CI productos'),
      ('almacenes', 'idx_almacenes_tenant_estado_ci_runtime_269', 'indice CI almacenes'),
      ('almacen_ubicaciones', 'idx_almacen_ubicaciones_tenant_estado_ci_runtime_269', 'indice CI almacen_ubicaciones'),
      ('movimientos_inventario', 'idx_movimientos_inventario_tenant_estado_ci_runtime_269', 'indice CI movimientos_inventario'),
      ('stock_movimientos', 'idx_stock_movimientos_tenant_estado_ci_runtime_269', 'indice CI stock_movimientos'),
      ('producto_stock_sucursal', 'idx_producto_stock_sucursal_tenant_estado_ci_runtime_269', 'indice CI producto_stock_sucursal')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('productos'),
      ('almacenes'),
      ('almacen_ubicaciones'),
      ('movimientos_inventario'),
      ('stock_movimientos'),
      ('producto_stock_sucursal')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.productos p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id) AND p.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.productos p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id) AND p.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'productos_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.movimientos_inventario m
       WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id) AND m.estado = 'APLICADO')
    - (SELECT COUNT(*) FROM public.movimientos_inventario m
       WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id) AND m.estado = 'aplicado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'movimientos_inventario_estado_case_insensitive_aplicado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.productos p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (p.estado IS NULL OR lower(p.estado::text) NOT IN ('activo', 'inactivo', 'bloqueado', 'descontinuado'));
  RETURN QUERY SELECT 'productos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.almacenes a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('activo', 'inactivo', 'mantenimiento', 'bloqueado'));
  RETURN QUERY SELECT 'almacenes_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.almacen_ubicaciones au
  WHERE (p_tenant_id IS NULL OR au.tenant_id = p_tenant_id)
    AND (au.estado IS NULL OR lower(au.estado::text) NOT IN ('activo', 'inactivo', 'bloqueado'));
  RETURN QUERY SELECT 'almacen_ubicaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.movimientos_inventario m
  WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (m.estado IS NULL OR lower(m.estado::text) NOT IN ('activo', 'inactivo', 'pendiente', 'aplicado', 'anulado', 'error'));
  RETURN QUERY SELECT 'movimientos_inventario_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.stock_movimientos sm
  WHERE (p_tenant_id IS NULL OR sm.tenant_id = p_tenant_id)
    AND (sm.estado IS NULL OR lower(sm.estado::text) NOT IN ('activo', 'inactivo', 'pendiente', 'aplicado', 'anulado', 'error'));
  RETURN QUERY SELECT 'stock_movimientos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.producto_stock_sucursal pss
  WHERE (p_tenant_id IS NULL OR pss.tenant_id = p_tenant_id)
    AND (pss.estado IS NULL OR lower(pss.estado::text) NOT IN ('activo', 'inactivo', 'bloqueado'));
  RETURN QUERY SELECT 'producto_stock_sucursal_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_inventario_core_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_inventario_core_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
