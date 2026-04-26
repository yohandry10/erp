-- ============================================================================
-- 211__finanzas_estado_case_insensitive_validation_pack.sql
-- Pack de validación runtime para estados case-insensitive en finanzas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_finanzas_estado_case_insensitive_runtime(
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

  -- Tipos de columnas de estado.
  RETURN QUERY
  WITH expected(table_name, column_name) AS (
    VALUES
      ('cuentas_por_cobrar', 'estado'),
      ('cuentas_por_pagar', 'estado'),
      ('cuentas_por_pagar', 'estado_comparacion'),
      ('conciliaciones_bancarias', 'estado')
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

  -- Funciones helper.
  RETURN QUERY
  WITH expected(func_name, detail) AS (
    VALUES
      ('normalize_cxc_estado_209', 'helper de estado CxC'),
      ('normalize_cxp_estado_209', 'helper de estado CxP'),
      ('normalize_cxp_estado_comparacion_209', 'helper de comparación CxP'),
      ('normalize_conciliacion_estado_209', 'helper de estado de conciliaciones')
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

  -- Indices runtime esperados.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('cuentas_por_cobrar', 'idx_cxc_tenant_estado_ci_runtime_209', 'indice tenant+estado CxC'),
      ('cuentas_por_pagar', 'idx_cxp_tenant_estado_ci_runtime_209', 'indice tenant+estado CxP'),
      ('cuentas_por_pagar', 'idx_cxp_tenant_estado_comparacion_ci_runtime_209', 'indice tenant+estado_comparacion CxP'),
      ('conciliaciones_bancarias', 'idx_conciliaciones_bancarias_tenant_estado_ci_runtime_209', 'indice tenant+estado conciliaciones')
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

  -- Constraints críticas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('cuentas_por_cobrar', 'ck_cuentas_por_cobrar_estado_valid', 'dominio estado CxC'),
      ('cuentas_por_cobrar', 'ck_cuentas_por_cobrar_estado_saldo_consistency', 'consistencia estado/saldo CxC'),
      ('cuentas_por_pagar', 'ck_cuentas_por_pagar_estado_valid', 'dominio estado CxP'),
      ('cuentas_por_pagar', 'ck_cuentas_por_pagar_estado_saldo_consistency', 'consistencia estado/saldo CxP'),
      ('cuentas_por_pagar', 'ck_cuentas_por_pagar_estado_comparacion_valid', 'dominio estado_comparacion CxP'),
      ('conciliaciones_bancarias', 'ck_conciliaciones_bancarias_estado_valid', 'dominio estado conciliaciones'),
      ('conciliaciones_bancarias', 'ck_conciliaciones_bancarias_cierre_consistency', 'consistencia cierre conciliaciones')
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

  -- RLS enabled + forced.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('cuentas_por_cobrar'),
      ('cuentas_por_pagar'),
      ('conciliaciones_bancarias')
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

  -- Contrato case-insensitive en filtros.
  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.cuentas_por_cobrar c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'PENDIENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.cuentas_por_cobrar c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'pendiente') AS lower_count
  ) x;
  RETURN QUERY
  SELECT
    'cxc_estado_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.cuentas_por_pagar c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'PENDIENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.cuentas_por_pagar c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'pendiente') AS lower_count
  ) x;
  RETURN QUERY
  SELECT
    'cxp_estado_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.conciliaciones_bancarias c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'ABIERTA') AS upper_count,
      (SELECT COUNT(*) FROM public.conciliaciones_bancarias c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'abierta') AS lower_count
  ) x;
  RETURN QUERY
  SELECT
    'conciliaciones_estado_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  -- Filas inválidas por dominio.
  SELECT COUNT(*) INTO v_count
  FROM public.cuentas_por_cobrar c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.estado IS NULL
      OR lower(c.estado::text) NOT IN ('pendiente', 'parcial', 'cancelado', 'vencida', 'anulada', 'revertida')
      OR (
        lower(c.estado::text) IN ('cancelado', 'anulada', 'revertida')
        AND c.monto_pendiente <> 0
      )
      OR (
        lower(c.estado::text) IN ('pendiente', 'parcial', 'vencida')
        AND c.monto_pendiente <= 0
      )
    );
  RETURN QUERY
  SELECT 'cxc_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.cuentas_por_pagar c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.estado IS NULL
      OR lower(c.estado::text) NOT IN ('pendiente', 'parcial', 'pagada', 'vencida', 'anulada')
      OR c.estado_comparacion IS NULL
      OR lower(c.estado_comparacion::text) NOT IN ('pendiente', 'ok', 'desviacion_cantidad', 'desviacion_precio')
      OR (
        lower(c.estado::text) = 'pagada'
        AND COALESCE(c.saldo, 0) <> 0
      )
    );
  RETURN QUERY
  SELECT 'cxp_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.conciliaciones_bancarias c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.estado IS NULL
      OR lower(c.estado::text) NOT IN ('abierta', 'en_proceso', 'cerrada')
      OR (
        lower(c.estado::text) = 'cerrada'
        AND c.cerrado_at IS NULL
      )
      OR (
        lower(c.estado::text) <> 'cerrada'
        AND (c.cerrado_at IS NOT NULL OR c.cerrado_by IS NOT NULL)
      )
    );
  RETURN QUERY
  SELECT 'conciliaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_finanzas_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_finanzas_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
