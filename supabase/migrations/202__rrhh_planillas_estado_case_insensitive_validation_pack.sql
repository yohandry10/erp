-- ============================================================================
-- 202__rrhh_planillas_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para contrato case-insensitive de planillas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_planillas_estado_case_insensitive_runtime(
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
  -- Extensión citext.
  RETURN QUERY
  SELECT
    'extension_citext_installed'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'Extension citext instalada'::text;

  -- Tipado esperado para columnas de estado.
  RETURN QUERY
  WITH expected(table_name, column_name) AS (
    VALUES
      ('planillas', 'estado'),
      ('planillas', 'estado_pago'),
      ('detalle_planillas', 'estado')
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

  -- Constraints esperadas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('planillas', 'ck_planillas_estado_runtime_200', 'dominio de planillas.estado'),
      ('planillas', 'ck_planillas_estado_pago_runtime_200', 'dominio de planillas.estado_pago'),
      ('planillas', 'ck_planillas_estado_pago_consistency_runtime_200', 'consistencia planillas estado vs estado_pago'),
      ('detalle_planillas', 'ck_detalle_planillas_estado_runtime_200', 'dominio de detalle_planillas.estado')
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

  -- Triggers esperados.
  RETURN QUERY
  WITH expected(tablename, triggername, detail) AS (
    VALUES
      ('planillas', 'trg_normalize_planillas_estado_row', 'normalización estado planillas'),
      ('detalle_planillas', 'trg_normalize_detalle_planillas_estado_row', 'normalización estado detalle_planillas'),
      ('detalle_planillas', 'trg_enforce_tenant_detalle_planillas', 'consistencia tenant en detalle_planillas'),
      ('empleado_planilla', 'trg_sync_detalle_planillas_from_empleado_planilla', 'sync legacy detalle_planillas')
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

  -- Índices runtime esperados.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('planillas', 'idx_planillas_tenant_estado_ci_runtime_200', 'indice CI estado de planillas'),
      ('planillas', 'idx_planillas_tenant_estado_pago_ci_runtime_200', 'indice CI estado_pago de planillas'),
      ('detalle_planillas', 'idx_detalle_planillas_tenant_estado_ci_runtime_200', 'indice CI estado de detalle_planillas')
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
      ('planillas'),
      ('detalle_planillas')
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

  -- Contrato case-insensitive de filtros (estado y estado_pago).
  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (
        SELECT COUNT(*)
        FROM public.planillas p
        WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
          AND p.estado = 'PAGADA'
      ) AS upper_count,
      (
        SELECT COUNT(*)
        FROM public.planillas p
        WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
          AND p.estado = 'pagada'
      ) AS lower_count
  ) x;
  RETURN QUERY
  SELECT
    'planillas_estado_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (
        SELECT COUNT(*)
        FROM public.planillas p
        WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
          AND p.estado_pago = 'PAGADO'
      ) AS upper_count,
      (
        SELECT COUNT(*)
        FROM public.planillas p
        WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
          AND p.estado_pago = 'pagado'
      ) AS lower_count
  ) x;
  RETURN QUERY
  SELECT
    'planillas_estado_pago_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (
        SELECT COUNT(*)
        FROM public.detalle_planillas dp
        WHERE (p_tenant_id IS NULL OR dp.tenant_id = p_tenant_id)
          AND dp.estado = 'PAGADO'
      ) AS upper_count,
      (
        SELECT COUNT(*)
        FROM public.detalle_planillas dp
        WHERE (p_tenant_id IS NULL OR dp.tenant_id = p_tenant_id)
          AND dp.estado = 'pagado'
      ) AS lower_count
  ) x;
  RETURN QUERY
  SELECT
    'detalle_planillas_estado_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  -- Contrato funcional: planillas pagadas deben estar sincronizadas con estado_pago.
  SELECT COUNT(*) INTO v_count
  FROM public.planillas p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND lower(COALESCE(p.estado_pago::text, '')) = 'pagado'
    AND lower(COALESCE(p.estado::text, '')) <> 'pagada';

  RETURN QUERY
  SELECT
    'planillas_pagado_vs_estado_sync'::text,
    (v_count = 0),
    format('mismatch_rows=%s', v_count)::text;

  -- Filas inválidas por dominio.
  SELECT COUNT(*) INTO v_count
  FROM public.planillas p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      p.estado IS NULL
      OR lower(p.estado::text) NOT IN ('borrador', 'calculada', 'pagada', 'anulada')
    );

  RETURN QUERY
  SELECT
    'planillas_invalid_estado_rows'::text,
    (v_count = 0),
    format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.planillas p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      p.estado_pago IS NULL
      OR lower(p.estado_pago::text) NOT IN ('pendiente', 'parcial', 'pagado', 'anulado')
    );

  RETURN QUERY
  SELECT
    'planillas_invalid_estado_pago_rows'::text,
    (v_count = 0),
    format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.detalle_planillas dp
  WHERE (p_tenant_id IS NULL OR dp.tenant_id = p_tenant_id)
    AND (
      dp.estado IS NULL
      OR lower(dp.estado::text) NOT IN ('pendiente', 'parcial', 'pagado', 'anulado')
    );

  RETURN QUERY
  SELECT
    'detalle_planillas_invalid_estado_rows'::text,
    (v_count = 0),
    format('filas invalidas: %s', v_count)::text;

  -- Tenant mismatch y huérfanos del alias legacy detalle_planillas.
  SELECT COUNT(*) INTO v_count
  FROM public.detalle_planillas dp
  LEFT JOIN public.planillas p ON p.id = dp.planilla_id
  LEFT JOIN public.empleados e ON e.id = dp.empleado_id
  WHERE (p_tenant_id IS NULL OR dp.tenant_id = p_tenant_id)
    AND (
      (dp.planilla_id IS NOT NULL AND p.id IS NULL)
      OR (dp.empleado_id IS NOT NULL AND e.id IS NULL)
      OR (p.id IS NOT NULL AND dp.tenant_id IS DISTINCT FROM p.tenant_id)
      OR (e.id IS NOT NULL AND dp.tenant_id IS DISTINCT FROM e.tenant_id)
      OR (p.id IS NOT NULL AND e.id IS NOT NULL AND p.tenant_id IS DISTINCT FROM e.tenant_id)
    );

  RETURN QUERY
  SELECT
    'detalle_planillas_tenant_orphan_mismatch_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  -- Gap de sincronización empleado_planilla -> detalle_planillas (por id).
  SELECT COUNT(*) INTO v_count
  FROM public.empleado_planilla ep
  WHERE (p_tenant_id IS NULL OR ep.tenant_id = p_tenant_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.detalle_planillas dp
      WHERE dp.id = ep.id
    );

  RETURN QUERY
  SELECT
    'detalle_planillas_sync_gap_from_empleado_planilla'::text,
    (v_count = 0),
    format('missing_rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_planillas_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_planillas_estado_case_insensitive_runtime(app.current_tenant_id());

COMMIT;
