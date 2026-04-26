-- ============================================================================
-- 262__ventas_historicas_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en ventas historicas.
-- Tablas foco:
--   public.ventas
--   public.venta_detalles
--   public.pagos_ventas
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_ventas_historicas_estado_case_insensitive_runtime(
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
      ('ventas', 'estado', 'ventas.estado usa citext'),
      ('venta_detalles', 'estado', 'venta_detalles.estado usa citext'),
      ('pagos_ventas', 'estado', 'pagos_ventas.estado usa citext')
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
      ('normalize_ventas_estado_260', 'helper ventas'),
      ('normalize_venta_detalles_estado_260', 'helper venta_detalles'),
      ('normalize_pagos_ventas_estado_260', 'helper pagos_ventas')
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
      ('ventas', 'trg_normalize_ventas_row', 'normalizacion ventas'),
      ('venta_detalles', 'trg_normalize_venta_detalles_row', 'normalizacion venta_detalles'),
      ('pagos_ventas', 'trg_normalize_pagos_ventas_row', 'normalizacion pagos_ventas'),
      ('ventas', 'trg_enforce_ventas_tenant_consistency', 'consistencia tenant ventas'),
      ('venta_detalles', 'trg_enforce_venta_detalles_tenant_consistency', 'consistencia tenant venta_detalles'),
      ('pagos_ventas', 'trg_enforce_pagos_ventas_tenant_consistency', 'consistencia tenant pagos_ventas')
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
      ('ventas', 'ck_ventas_estado_runtime', 'constraint estado ventas'),
      ('venta_detalles', 'ck_venta_detalles_estado_runtime', 'constraint estado venta_detalles'),
      ('pagos_ventas', 'ck_pagos_ventas_estado_runtime', 'constraint estado pagos_ventas'),
      ('pagos_ventas', 'ck_pagos_ventas_aplicado_runtime', 'constraint aplicado_en pagos_ventas')
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
      ('ventas', 'idx_ventas_tenant_estado_ci_runtime_260', 'indice CI ventas'),
      ('venta_detalles', 'idx_venta_detalles_tenant_estado_ci_runtime_260', 'indice CI venta_detalles'),
      ('pagos_ventas', 'idx_pagos_ventas_tenant_estado_ci_runtime_260', 'indice CI pagos_ventas'),
      ('ventas', 'ux_ventas_tenant_tipo_numero', 'unicidad ventas por documento'),
      ('pagos_ventas', 'ux_pagos_ventas_tenant_referencia', 'unicidad pagos_ventas referencia'),
      ('pagos_ventas', 'ux_pagos_ventas_tenant_idempotency', 'unicidad pagos_ventas idempotency'),
      ('pagos_ventas', 'ux_pagos_ventas_tenant_event_id', 'unicidad pagos_ventas event_id')
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
    VALUES ('ventas'), ('venta_detalles'), ('pagos_ventas')
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
      (SELECT COUNT(*) FROM public.ventas v
       WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id) AND v.estado = 'PAGADA')
    - (SELECT COUNT(*) FROM public.ventas v
       WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id) AND v.estado = 'pagada')
  ) INTO v_delta;
  RETURN QUERY SELECT 'ventas_estado_case_insensitive_pagada'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.venta_detalles vd
       WHERE (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id) AND vd.estado = 'REGISTRADO')
    - (SELECT COUNT(*) FROM public.venta_detalles vd
       WHERE (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id) AND vd.estado = 'registrado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'venta_detalles_estado_case_insensitive_registrado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.pagos_ventas pv
       WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id) AND pv.estado = 'APLICADO')
    - (SELECT COUNT(*) FROM public.pagos_ventas pv
       WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id) AND pv.estado = 'aplicado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'pagos_ventas_estado_case_insensitive_aplicado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(tipo_documento)) AS tipo_norm, upper(btrim(numero_documento)) AS numero_norm, COUNT(*) AS cnt
    FROM public.ventas
    WHERE tenant_id IS NOT NULL
      AND tipo_documento IS NOT NULL
      AND btrim(tipo_documento) <> ''
      AND numero_documento IS NOT NULL
      AND btrim(numero_documento) <> ''
      AND lower(estado::text) <> 'anulada'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_ventas_tenant_tipo_numero'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.ventas v
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (v.estado IS NULL OR lower(v.estado::text) NOT IN ('borrador', 'emitida', 'pagada', 'confirmada', 'anulada'));
  RETURN QUERY SELECT 'ventas_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.venta_detalles vd
  WHERE (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id)
    AND (vd.estado IS NULL OR lower(vd.estado::text) NOT IN ('registrado', 'anulado'));
  RETURN QUERY SELECT 'venta_detalles_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_ventas pv
  WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id)
    AND (pv.estado IS NULL OR lower(pv.estado::text) NOT IN ('registrado', 'aplicado', 'anulado'));
  RETURN QUERY SELECT 'pagos_ventas_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_ventas_historicas_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_ventas_historicas_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
