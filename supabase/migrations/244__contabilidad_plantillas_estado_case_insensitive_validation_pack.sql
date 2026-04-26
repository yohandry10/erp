-- ============================================================================
-- 244__contabilidad_plantillas_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en plantillas
-- contables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_plantillas_estado_case_insensitive_runtime(
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
      ('plantillas_asientos', 'estado', 'plantillas_asientos.estado usa citext'),
      ('plantillas_asientos_detalle', 'estado', 'plantillas_asientos_detalle.estado usa citext'),
      ('plantillas_asientos_historial', 'estado', 'plantillas_asientos_historial.estado usa citext'),
      ('plantillas_asientos_ventas', 'estado', 'plantillas_asientos_ventas.estado usa citext')
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
      ('normalize_plantilla_estado_242', 'helper plantillas estado'),
      ('normalize_plantillas_asientos_historial_estado_242', 'helper historial estado')
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
      ('plantillas_asientos', 'trg_normalize_plantillas_asientos_row', 'trigger normalizacion plantillas_asientos'),
      ('plantillas_asientos_detalle', 'trg_normalize_plantillas_asientos_detalle_row', 'trigger normalizacion detalle'),
      ('plantillas_asientos_historial', 'trg_normalize_plantillas_asientos_historial_row', 'trigger normalizacion historial'),
      ('plantillas_asientos_ventas', 'trg_normalize_plantillas_asientos_ventas_row', 'trigger normalizacion ventas'),
      ('plantillas_asientos_detalle', 'trg_enforce_plantillas_asientos_detalle_tenant_consistency', 'trigger consistencia tenant detalle'),
      ('plantillas_asientos_historial', 'trg_enforce_plantillas_asientos_historial_tenant_consistency', 'trigger consistencia tenant historial'),
      ('plantillas_asientos_ventas', 'trg_enforce_plantillas_asientos_ventas_scope', 'trigger scope ventas')
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
      ('plantillas_asientos', 'ck_plantillas_asientos_runtime', 'constraint runtime plantillas_asientos'),
      ('plantillas_asientos_detalle', 'ck_plantillas_asientos_detalle_runtime', 'constraint runtime detalle'),
      ('plantillas_asientos_historial', 'ck_plantillas_asientos_historial_runtime', 'constraint runtime historial'),
      ('plantillas_asientos_ventas', 'ck_plantillas_asientos_ventas_runtime', 'constraint runtime ventas')
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
      ('plantillas_asientos', 'idx_plantillas_asientos_tenant_estado_ci_runtime_242', 'indice CI plantillas_asientos'),
      ('plantillas_asientos_detalle', 'idx_plantillas_asientos_detalle_tenant_estado_ci_runtime_242', 'indice CI detalle'),
      ('plantillas_asientos_historial', 'idx_plantillas_asientos_historial_tenant_estado_ci_runtime_242', 'indice CI historial'),
      ('plantillas_asientos_ventas', 'idx_plantillas_asientos_ventas_estado_ci_runtime_242', 'indice CI ventas'),
      ('plantillas_asientos', 'ux_plantillas_asientos_tenant_codigo_activo_runtime', 'unicidad plantillas_asientos'),
      ('plantillas_asientos_detalle', 'ux_plantillas_asientos_detalle_plantilla_orden_activo_runtime', 'unicidad detalle'),
      ('plantillas_asientos_ventas', 'ux_plantillas_asientos_ventas_active_pais_tipo_runtime', 'unicidad ventas')
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
      ('plantillas_asientos'),
      ('plantillas_asientos_detalle'),
      ('plantillas_asientos_historial'),
      ('plantillas_asientos_ventas')
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
      (SELECT COUNT(*) FROM public.plantillas_asientos p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
         AND p.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.plantillas_asientos p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
         AND p.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'plantillas_asientos_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.plantillas_asientos_detalle d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.plantillas_asientos_detalle d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'plantillas_asientos_detalle_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.plantillas_asientos_historial h
       WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
         AND h.estado = 'GENERADO')
    - (SELECT COUNT(*) FROM public.plantillas_asientos_historial h
       WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
         AND h.estado = 'generado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'plantillas_asientos_historial_estado_case_insensitive_generado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.plantillas_asientos_ventas pv
       WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id OR pv.tenant_id IS NULL)
         AND pv.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.plantillas_asientos_ventas pv
       WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id OR pv.tenant_id IS NULL)
         AND pv.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'plantillas_asientos_ventas_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (p.estado IS NULL OR lower(p.estado::text) NOT IN ('activo', 'inactivo', 'archivada'));
  RETURN QUERY SELECT 'plantillas_asientos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_detalle d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (d.estado IS NULL OR lower(d.estado::text) NOT IN ('activo', 'inactivo', 'archivada'));
  RETURN QUERY SELECT 'plantillas_asientos_detalle_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_historial h
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (h.estado IS NULL OR lower(h.estado::text) NOT IN ('generado', 'error', 'pendiente', 'anulado'));
  RETURN QUERY SELECT 'plantillas_asientos_historial_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_ventas pv
  WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id OR pv.tenant_id IS NULL)
    AND (pv.estado IS NULL OR lower(pv.estado::text) NOT IN ('activo', 'inactivo', 'archivada'));
  RETURN QUERY SELECT 'plantillas_asientos_ventas_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_plantillas_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_plantillas_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
