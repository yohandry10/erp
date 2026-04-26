-- ============================================================================
-- 214__compras_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en Compras.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_compras_estado_case_insensitive_runtime(
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
BEGIN
  -- Extension citext.
  RETURN QUERY
  SELECT
    'extension_citext_installed'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'Extension citext instalada'::text;

  -- Columnas estado en citext.
  RETURN QUERY
  WITH expected(table_name, column_name) AS (
    VALUES
      ('ordenes_compra', 'estado'),
      ('recepciones', 'estado'),
      ('compras', 'estado'),
      ('cotizaciones_compra', 'estado'),
      ('oc_aprobaciones', 'estado'),
      ('devoluciones_proveedor', 'estado')
  )
  SELECT
    format('column_%s_%s_is_citext', e.table_name, e.column_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
        AND c.data_type = 'USER-DEFINED'
        AND c.udt_name = 'citext'
    ) AS ok,
    format('tipo citext en %s.%s', e.table_name, e.column_name)::text
  FROM expected e;

  -- Helpers esperados.
  RETURN QUERY
  WITH expected(func_name, detail) AS (
    VALUES
      ('normalize_ordenes_compra_estado_212', 'helper estado ordenes_compra'),
      ('normalize_recepciones_estado_212', 'helper estado recepciones'),
      ('normalize_compras_estado_212', 'helper estado compras alias'),
      ('normalize_cotizaciones_compra_estado_212', 'helper estado cotizaciones compra'),
      ('normalize_oc_aprobaciones_estado_212', 'helper estado aprobaciones'),
      ('normalize_devoluciones_proveedor_estado_212', 'helper estado devoluciones proveedor'),
      ('normalize_ordenes_compra_estado_row_212', 'trigger function estado ordenes_compra'),
      ('normalize_recepciones_estado_row_212', 'trigger function estado recepciones')
  )
  SELECT
    format('function_%s_exists', e.func_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = e.func_name
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Triggers nuevos esperados.
  RETURN QUERY
  WITH expected(tablename, triggername, detail) AS (
    VALUES
      ('ordenes_compra', 'trg_normalize_ordenes_compra_estado_row_212', 'normalización estado ordenes_compra'),
      ('recepciones', 'trg_normalize_recepciones_estado_row_212', 'normalización estado recepciones')
  )
  SELECT
    format('trigger_%s_exists', e.triggername)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.tablename
        AND tg.tgname = e.triggername
        AND NOT tg.tgisinternal
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Constraints críticas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('ordenes_compra', 'ck_ordenes_compra_estado_valid', 'dominio estado ordenes_compra'),
      ('recepciones', 'ck_recepciones_estado_valid', 'dominio estado recepciones'),
      ('compras', 'ck_compras_estado_valid', 'dominio estado compras alias'),
      ('cotizaciones_compra', 'ck_cotizaciones_compra_estado_valid', 'dominio estado cotizaciones compra'),
      ('oc_aprobaciones', 'ck_oc_aprobaciones_estado_valid', 'dominio estado aprobaciones'),
      ('oc_aprobaciones', 'ck_oc_aprobaciones_fecha_consistency', 'consistencia fecha aprobaciones'),
      ('devoluciones_proveedor', 'ck_devoluciones_proveedor_estado_valid', 'dominio estado devoluciones')
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
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Índices esperados.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('ordenes_compra', 'idx_ordenes_compra_tenant_estado_ci_runtime_212', 'indice tenant+estado ordenes_compra'),
      ('recepciones', 'idx_recepciones_tenant_estado_ci_runtime_212', 'indice tenant+estado recepciones'),
      ('compras', 'idx_compras_tenant_estado_ci_runtime_212', 'indice tenant+estado compras'),
      ('cotizaciones_compra', 'idx_cotizaciones_compra_tenant_estado_ci_runtime_212', 'indice tenant+estado cotizaciones'),
      ('oc_aprobaciones', 'idx_oc_aprobaciones_tenant_estado_ci_runtime_212', 'indice tenant+estado aprobaciones'),
      ('devoluciones_proveedor', 'idx_devoluciones_proveedor_tenant_estado_ci_runtime_212', 'indice tenant+estado devoluciones'),
      ('oc_aprobaciones', 'ux_oc_aprobaciones_pending_scope_runtime', 'unique pending por scope aprobaciones')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- RLS enabled + forced.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('ordenes_compra'),
      ('recepciones'),
      ('compras'),
      ('cotizaciones_compra'),
      ('oc_aprobaciones'),
      ('devoluciones_proveedor')
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
    ) AS ok,
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Contratos case-insensitive de filtros.
  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.ordenes_compra t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'PENDIENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.ordenes_compra t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'pendiente') AS lower_count
  ) x;
  RETURN QUERY SELECT 'ordenes_compra_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.recepciones t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'CERRADA') AS upper_count,
      (SELECT COUNT(*) FROM public.recepciones t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'cerrada') AS lower_count
  ) x;
  RETURN QUERY SELECT 'recepciones_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.cotizaciones_compra t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'BORRADOR') AS upper_count,
      (SELECT COUNT(*) FROM public.cotizaciones_compra t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'borrador') AS lower_count
  ) x;
  RETURN QUERY SELECT 'cotizaciones_compra_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.oc_aprobaciones t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'PENDIENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.oc_aprobaciones t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'pendiente') AS lower_count
  ) x;
  RETURN QUERY SELECT 'oc_aprobaciones_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.devoluciones_proveedor t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'PENDIENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.devoluciones_proveedor t WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id) AND t.estado = 'pendiente') AS lower_count
  ) x;
  RETURN QUERY SELECT 'devoluciones_proveedor_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  -- Filas inválidas por dominio.
  SELECT COUNT(*) INTO v_count
  FROM public.ordenes_compra t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (t.estado IS NULL OR lower(t.estado::text) NOT IN ('borrador','pendiente','aprobacion','aprobada','parcial','recibida','anulada','rechazada','entregado','entregada'));
  RETURN QUERY SELECT 'ordenes_compra_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.recepciones t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (t.estado IS NULL OR lower(t.estado::text) NOT IN ('borrador','en_proceso','cerrada','anulada'));
  RETURN QUERY SELECT 'recepciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.compras t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (t.estado IS NULL OR lower(t.estado::text) NOT IN ('pendiente','entregada','anulada'));
  RETURN QUERY SELECT 'compras_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.cotizaciones_compra t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (t.estado IS NULL OR lower(t.estado::text) NOT IN ('borrador','enviada','aprobada','rechazada','vencida'));
  RETURN QUERY SELECT 'cotizaciones_compra_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.oc_aprobaciones t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      t.estado IS NULL
      OR lower(t.estado::text) NOT IN ('pendiente','aprobada','rechazada')
      OR (lower(t.estado::text) <> 'pendiente' AND t.fecha_aprobacion IS NULL)
    );
  RETURN QUERY SELECT 'oc_aprobaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.devoluciones_proveedor t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (t.estado IS NULL OR lower(t.estado::text) NOT IN ('pendiente','emitida','anulada','rechazada'));
  RETURN QUERY SELECT 'devoluciones_proveedor_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_compras_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_compras_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
