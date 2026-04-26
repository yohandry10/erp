-- ============================================================================
-- 199__rrhh_estado_case_insensitive_validation_pack.sql
-- Validacion runtime para contrato case-insensitive de estados RRHH:
-- tablas: empleados, asistencia, asistencias.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_estado_case_insensitive_runtime(
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

  -- Tipo de columnas esperado.
  RETURN QUERY
  WITH expected(table_name, column_name) AS (
    VALUES
      ('empleados', 'estado'),
      ('asistencia', 'estado'),
      ('asistencias', 'estado')
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
      ('empleados', 'ck_empleados_estado_runtime', 'estados permitidos de empleados'),
      ('empleados', 'ck_empleados_estado_activo_consistency_runtime', 'consistencia estado/activo en empleados'),
      ('asistencia', 'ck_asistencia_estado_runtime', 'estados permitidos de asistencia'),
      ('asistencias', 'ck_asistencias_estado_runtime', 'estados permitidos de asistencias')
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
      ('empleados', 'idx_empleados_tenant_estado_ci_runtime', 'indice CI empleados por estado'),
      ('asistencia', 'idx_asistencia_tenant_estado_ci_runtime', 'indice CI asistencia por estado'),
      ('asistencias', 'idx_asistencias_tenant_estado_ci_runtime', 'indice CI asistencias por estado')
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
      ('empleados'),
      ('asistencia'),
      ('asistencias')
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

  -- Contrato de compatibilidad: filtros con ACTIVO/activo deben devolver el mismo conteo.
  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.empleados e WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'ACTIVO') AS upper_count,
      (SELECT COUNT(*) FROM public.empleados e WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'activo') AS lower_count
  ) x;
  RETURN QUERY SELECT 'empleados_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.asistencia a WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'AUSENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.asistencia a WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'ausente') AS lower_count
  ) x;
  RETURN QUERY SELECT 'asistencia_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (SELECT COUNT(*) FROM public.asistencias a WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'AUSENTE') AS upper_count,
      (SELECT COUNT(*) FROM public.asistencias a WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'ausente') AS lower_count
  ) x;
  RETURN QUERY SELECT 'asistencias_case_insensitive_filter_contract'::text, (v_count = 0), format('delta=%s', v_count)::text;

  -- Filas inválidas por estado.
  SELECT COUNT(*) INTO v_count
  FROM public.empleados e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (
      e.estado IS NULL
      OR lower(e.estado::text) NOT IN ('activo', 'inactivo', 'suspendido', 'cesado')
    );
  RETURN QUERY SELECT 'empleados_invalid_estado_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asistencia a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.estado IS NULL
      OR lower(a.estado::text) NOT IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones')
    );
  RETURN QUERY SELECT 'asistencia_invalid_estado_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asistencias a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.estado IS NULL
      OR lower(a.estado::text) NOT IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones')
    );
  RETURN QUERY SELECT 'asistencias_invalid_estado_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_estado_case_insensitive_runtime(app.current_tenant_id());

COMMIT;

