-- ============================================================================
-- 259__rrhh_core_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en RRHH core.
-- Tablas foco:
--   public.departamentos
--   public.empleados
--   public.contratos
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_core_estado_case_insensitive_runtime(
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
      ('departamentos', 'estado', 'departamentos.estado usa citext'),
      ('empleados', 'estado', 'empleados.estado usa citext'),
      ('contratos', 'estado', 'contratos.estado usa citext')
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
      ('normalize_departamentos_estado_257', 'helper departamentos'),
      ('normalize_contratos_estado_257', 'helper contratos')
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
      ('departamentos', 'trg_normalize_departamentos_row', 'normalizacion departamentos'),
      ('empleados', 'trg_normalize_empleados_row', 'normalizacion empleados'),
      ('contratos', 'trg_normalize_contratos_row', 'normalizacion contratos'),
      ('empleados', 'trg_enforce_empleados_tenant_consistency', 'consistencia tenant empleados'),
      ('contratos', 'trg_enforce_contratos_tenant_consistency', 'consistencia tenant contratos')
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
      ('departamentos', 'ck_departamentos_estado_runtime', 'constraint estado departamentos'),
      ('empleados', 'ck_empleados_estado_runtime', 'constraint estado empleados'),
      ('contratos', 'ck_contratos_estado_runtime', 'constraint estado contratos')
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
      ('departamentos', 'idx_departamentos_tenant_estado_ci_runtime_257', 'indice CI departamentos'),
      ('contratos', 'idx_contratos_tenant_estado_ci_runtime_257', 'indice CI contratos'),
      ('contratos', 'idx_contratos_tenant_empleado_estado_ci_runtime_257', 'indice CI contratos por empleado'),
      ('departamentos', 'ux_departamentos_tenant_nombre_activo', 'unicidad departamentos activos'),
      ('contratos', 'ux_contratos_tenant_empleado_fecha_tipo_activo', 'unicidad contratos activos')
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
    VALUES ('departamentos'), ('empleados'), ('contratos')
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
      (SELECT COUNT(*) FROM public.departamentos d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id) AND d.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.departamentos d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id) AND d.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'departamentos_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.empleados e
       WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.empleados e
       WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'empleados_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.contratos c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'VIGENTE')
    - (SELECT COUNT(*) FROM public.contratos c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'vigente')
  ) INTO v_delta;
  RETURN QUERY SELECT 'contratos_estado_case_insensitive_vigente'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(nombre)) AS nombre_norm, COUNT(*) AS cnt
    FROM public.departamentos
    WHERE tenant_id IS NOT NULL
      AND nombre IS NOT NULL
      AND btrim(nombre) <> ''
      AND lower(estado::text) = 'activo'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(nombre))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_departamentos_tenant_nombre_activo'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, fecha_inicio, tipo_contrato, COUNT(*) AS cnt
    FROM public.contratos
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND fecha_inicio IS NOT NULL
      AND tipo_contrato IS NOT NULL
      AND lower(estado::text) IN ('vigente', 'renovado', 'en_periodo_prueba', 'vencido')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, fecha_inicio, tipo_contrato
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_contratos_tenant_empleado_fecha_tipo_activo'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.departamentos d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (d.estado IS NULL OR lower(d.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY SELECT 'departamentos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleados e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (e.estado IS NULL OR lower(e.estado::text) NOT IN ('activo', 'inactivo', 'suspendido', 'cesado'));
  RETURN QUERY SELECT 'empleados_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.contratos c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado'));
  RETURN QUERY SELECT 'contratos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_core_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_core_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
