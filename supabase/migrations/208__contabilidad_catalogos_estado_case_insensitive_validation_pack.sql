-- ============================================================================
-- 208__contabilidad_catalogos_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para catalogos contables case-insensitive.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_catalogos_estado_case_insensitive_runtime(
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

  -- Tipos de columna esperados (estado en citext).
  RETURN QUERY
  WITH expected(table_name, column_name) AS (
    VALUES
      ('periodos_contables', 'estado'),
      ('centros_costo', 'estado'),
      ('presupuestos', 'estado'),
      ('plan_cuentas', 'estado')
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

  RETURN QUERY
  SELECT
    'column_plan_cuentas_acepta_movimiento_is_boolean'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'plan_cuentas'
        AND c.column_name = 'acepta_movimiento'
        AND c.data_type = 'boolean'
    ),
    'plan_cuentas.acepta_movimiento en tipo boolean';

  -- Funciones esperadas.
  RETURN QUERY
  WITH expected(func_schema, func_name, detail) AS (
    VALUES
      ('app', 'normalize_periodos_estado_206', 'helper de normalizacion de estado periodos'),
      ('app', 'normalize_presupuestos_estado_206', 'helper de normalizacion de estado presupuestos'),
      ('app', 'normalize_activo_inactivo_estado_206', 'helper de normalizacion activo/inactivo'),
      ('app', 'normalize_plan_cuentas_row_206', 'trigger function de normalizacion plan_cuentas'),
      ('app', 'enforce_plan_cuentas_tenant_consistency_206', 'trigger function de consistencia tenant plan_cuentas')
  )
  SELECT
    format('function_%s_exists', e.func_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = e.func_schema
        AND p.proname = e.func_name
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Triggers esperados.
  RETURN QUERY
  WITH expected(tablename, triggername, detail) AS (
    VALUES
      ('plan_cuentas', 'trg_normalize_plan_cuentas_estado_row_206', 'normalizacion plan_cuentas'),
      ('plan_cuentas', 'trg_enforce_plan_cuentas_tenant_consistency_206', 'consistencia tenant plan_cuentas')
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

  -- Constraints esperadas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('periodos_contables', 'ck_periodos_contables_estado_ci_runtime_206', 'dominio estado periodos'),
      ('periodos_contables', 'ck_periodos_contables_cierre_ci_runtime_206', 'consistencia cierre periodos'),
      ('centros_costo', 'ck_centros_costo_estado_ci_runtime_206', 'dominio estado centros'),
      ('centros_costo', 'ck_centros_costo_estado_activo_ci_runtime_206', 'consistencia estado/activo centros'),
      ('presupuestos', 'ck_presupuestos_estado_ci_runtime_206', 'dominio estado presupuestos'),
      ('plan_cuentas', 'ck_plan_cuentas_estado_ci_runtime_206', 'dominio estado plan_cuentas'),
      ('plan_cuentas', 'ck_plan_cuentas_estado_activo_ci_runtime_206', 'consistencia estado/activo plan_cuentas'),
      ('plan_cuentas', 'ck_plan_cuentas_tipo_sync_runtime_206', 'sincronia tipo/tipo_cuenta plan_cuentas'),
      ('plan_cuentas', 'ck_plan_cuentas_acepta_movimiento_not_null_runtime_206', 'acepta_movimiento not null')
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

  -- Indices esperados.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('periodos_contables', 'idx_periodos_contables_tenant_estado_ci_runtime_206', 'indice tenant+estado periodos'),
      ('centros_costo', 'idx_centros_costo_tenant_estado_ci_runtime_206', 'indice tenant+estado centros'),
      ('presupuestos', 'idx_presupuestos_tenant_estado_ci_runtime_206', 'indice tenant+estado presupuestos'),
      ('plan_cuentas', 'idx_plan_cuentas_tenant_estado_ci_runtime_206', 'indice tenant+estado plan_cuentas')
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
      ('periodos_contables'),
      ('centros_costo'),
      ('presupuestos'),
      ('plan_cuentas')
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

  -- Contratos case-insensitive.
  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.periodos_contables p WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id) AND p.estado = 'ABIERTO') AS upper_count,
      (SELECT COUNT(*) FROM public.periodos_contables p WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id) AND p.estado = 'abierto') AS lower_count
  ) x;
  RETURN QUERY
  SELECT 'periodos_contables_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.presupuestos p WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id) AND p.estado = 'ACTIVO') AS upper_count,
      (SELECT COUNT(*) FROM public.presupuestos p WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id) AND p.estado = 'activo') AS lower_count
  ) x;
  RETURN QUERY
  SELECT 'presupuestos_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.centros_costo c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'ACTIVO') AS upper_count,
      (SELECT COUNT(*) FROM public.centros_costo c WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'activo') AS lower_count
  ) x;
  RETURN QUERY
  SELECT 'centros_costo_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.plan_cuentas pc WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id) AND pc.estado = 'ACTIVO') AS upper_count,
      (SELECT COUNT(*) FROM public.plan_cuentas pc WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id) AND pc.estado = 'activo') AS lower_count
  ) x;
  RETURN QUERY
  SELECT 'plan_cuentas_estado_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  -- Filas invalidas por reglas de negocio.
  SELECT COUNT(*) INTO v_count
  FROM public.periodos_contables p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      p.estado IS NULL
      OR lower(p.estado::text) NOT IN ('abierto', 'cerrado', 'bloqueado')
      OR (lower(p.estado::text) = 'cerrado' AND p.fecha_cierre IS NULL)
      OR (lower(p.estado::text) <> 'cerrado' AND (p.fecha_cierre IS NOT NULL OR p.cerrado_por IS NOT NULL))
    );
  RETURN QUERY
  SELECT 'periodos_contables_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.centros_costo c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.estado IS NULL
      OR lower(c.estado::text) NOT IN ('activo', 'inactivo')
      OR COALESCE(c.activo, false) <> (lower(c.estado::text) = 'activo')
    );
  RETURN QUERY
  SELECT 'centros_costo_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.presupuestos p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      p.estado IS NULL
      OR lower(p.estado::text) NOT IN ('activo', 'bloqueado', 'cerrado')
    );
  RETURN QUERY
  SELECT 'presupuestos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.plan_cuentas pc
  WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
    AND (
      pc.estado IS NULL
      OR lower(pc.estado::text) NOT IN ('activo', 'inactivo')
      OR pc.acepta_movimiento IS NULL
      OR COALESCE(pc.activo, false) <> (lower(pc.estado::text) = 'activo')
      OR (
        (pc.tipo IS NULL AND pc.tipo_cuenta IS NOT NULL)
        OR (pc.tipo IS NOT NULL AND pc.tipo_cuenta IS NULL)
        OR (
          pc.tipo IS NOT NULL
          AND pc.tipo_cuenta IS NOT NULL
          AND (
            upper(pc.tipo) NOT IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'ORDEN')
            OR upper(pc.tipo_cuenta) NOT IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'ORDEN')
            OR upper(pc.tipo) <> upper(pc.tipo_cuenta)
          )
        )
      )
    );
  RETURN QUERY
  SELECT 'plan_cuentas_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  -- Integridad de jerarquia plan_cuentas.
  SELECT COUNT(*) INTO v_count
  FROM public.plan_cuentas child
  LEFT JOIN public.plan_cuentas parent ON parent.id = child.cuenta_id
  WHERE (p_tenant_id IS NULL OR child.tenant_id = p_tenant_id)
    AND child.cuenta_id IS NOT NULL
    AND parent.id IS NULL;
  RETURN QUERY
  SELECT 'plan_cuentas_orphan_parent_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.plan_cuentas child
  JOIN public.plan_cuentas parent ON parent.id = child.cuenta_id
  WHERE (p_tenant_id IS NULL OR child.tenant_id = p_tenant_id)
    AND child.tenant_id IS NOT NULL
    AND parent.tenant_id IS NOT NULL
    AND child.tenant_id IS DISTINCT FROM parent.tenant_id;
  RETURN QUERY
  SELECT 'plan_cuentas_parent_tenant_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_catalogos_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_catalogos_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
