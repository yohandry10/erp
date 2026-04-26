-- ============================================================================
-- 268__pos_inventory_aux_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en
-- POS/inventario auxiliar.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_pos_inventory_aux_estado_case_insensitive_runtime(
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
      ('configuracion_caja', 'estado', 'configuracion_caja.estado usa citext'),
      ('detalle_ventas_pos', 'estado', 'detalle_ventas_pos.estado usa citext'),
      ('producto_existencias', 'estado', 'producto_existencias.estado usa citext'),
      ('eventos_pos', 'estado', 'eventos_pos.estado usa citext')
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
      ('normalize_configuracion_caja_estado_266', 'helper configuracion_caja'),
      ('normalize_detalle_ventas_pos_estado_266', 'helper detalle_ventas_pos'),
      ('normalize_producto_existencias_estado_266', 'helper producto_existencias'),
      ('normalize_eventos_pos_estado_266', 'helper eventos_pos')
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
      ('configuracion_caja', 'trg_normalize_configuracion_caja_row', 'normalizacion configuracion_caja'),
      ('detalle_ventas_pos', 'trg_normalize_detalle_ventas_pos_row', 'normalizacion detalle_ventas_pos'),
      ('producto_existencias', 'trg_normalize_producto_existencias_row', 'normalizacion producto_existencias'),
      ('eventos_pos', 'trg_normalize_eventos_pos_row', 'normalizacion eventos_pos'),
      ('configuracion_caja', 'trg_enforce_configuracion_caja_tenant_consistency', 'consistencia tenant configuracion_caja'),
      ('detalle_ventas_pos', 'trg_enforce_detalle_ventas_pos_tenant_consistency', 'consistencia tenant detalle_ventas_pos'),
      ('producto_existencias', 'trg_enforce_producto_existencias_tenant_consistency', 'consistencia tenant producto_existencias'),
      ('eventos_pos', 'trg_enforce_eventos_pos_tenant_consistency', 'consistencia tenant eventos_pos')
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
      ('configuracion_caja', 'ck_configuracion_caja_estado_runtime', 'constraint estado configuracion_caja'),
      ('detalle_ventas_pos', 'ck_detalle_ventas_pos_estado_runtime', 'constraint estado detalle_ventas_pos'),
      ('producto_existencias', 'ck_producto_existencias_estado_runtime', 'constraint estado producto_existencias'),
      ('eventos_pos', 'ck_eventos_pos_estado_runtime', 'constraint estado eventos_pos')
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
      ('configuracion_caja', 'idx_configuracion_caja_tenant_estado_ci_runtime_266', 'indice CI configuracion_caja'),
      ('detalle_ventas_pos', 'idx_detalle_ventas_pos_tenant_estado_ci_runtime_266', 'indice CI detalle_ventas_pos'),
      ('producto_existencias', 'idx_producto_existencias_tenant_estado_ci_runtime_266', 'indice CI producto_existencias'),
      ('eventos_pos', 'idx_eventos_pos_tenant_estado_ci_runtime_266', 'indice CI eventos_pos'),
      ('configuracion_caja', 'idx_configuracion_caja_tenant_caja_estado_runtime', 'indice runtime configuracion_caja'),
      ('detalle_ventas_pos', 'idx_detalle_ventas_pos_tenant_venta_runtime', 'indice runtime detalle_ventas_pos'),
      ('producto_existencias', 'idx_producto_existencias_tenant_producto_stock_runtime', 'indice runtime producto_existencias'),
      ('eventos_pos', 'idx_eventos_pos_tenant_tipo_timestamp_runtime', 'indice runtime eventos_pos')
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
    VALUES ('configuracion_caja'), ('detalle_ventas_pos'), ('producto_existencias'), ('eventos_pos')
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
      (SELECT COUNT(*) FROM public.configuracion_caja c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.configuracion_caja c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'configuracion_caja_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.detalle_ventas_pos d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id) AND d.estado = 'CONFIRMADO')
    - (SELECT COUNT(*) FROM public.detalle_ventas_pos d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id) AND d.estado = 'confirmado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'detalle_ventas_pos_estado_case_insensitive_confirmado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.producto_existencias pe
       WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id) AND pe.estado = 'BLOQUEADO')
    - (SELECT COUNT(*) FROM public.producto_existencias pe
       WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id) AND pe.estado = 'bloqueado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'producto_existencias_estado_case_insensitive_bloqueado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.eventos_pos e
       WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'ANULADO')
    - (SELECT COUNT(*) FROM public.eventos_pos e
       WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'anulado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'eventos_pos_estado_case_insensitive_anulado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_caja c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('activo', 'inactivo', 'bloqueada'));
  RETURN QUERY SELECT 'configuracion_caja_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_ventas_pos d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (d.estado IS NULL OR lower(d.estado::text) NOT IN ('activo', 'inactivo', 'pendiente', 'confirmado', 'anulado', 'devuelto'));
  RETURN QUERY SELECT 'detalle_ventas_pos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.producto_existencias pe
  WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id)
    AND (pe.estado IS NULL OR lower(pe.estado::text) NOT IN ('activo', 'inactivo', 'bloqueado'));
  RETURN QUERY SELECT 'producto_existencias_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.eventos_pos e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (e.estado IS NULL OR lower(e.estado::text) NOT IN ('activo', 'inactivo', 'anulado'));
  RETURN QUERY SELECT 'eventos_pos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_pos_inventory_aux_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_pos_inventory_aux_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
