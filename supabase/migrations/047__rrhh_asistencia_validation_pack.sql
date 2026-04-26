-- ============================================================================
-- 047__rrhh_asistencia_validation_pack.sql
-- Validación operativa de consistencia entre asistencia y asistencias.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_asistencia_consistencia(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());
  v_asistencia_count bigint := 0;
  v_asistencias_count bigint := 0;
  v_gap_asistencia bigint := 0;
  v_gap_asistencias bigint := 0;
  v_dup_asistencia bigint := 0;
  v_dup_asistencias bigint := 0;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar asistencia';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_asistencia_count
  FROM public.asistencia
  WHERE tenant_id = v_tenant_id;

  SELECT COUNT(*) INTO v_asistencias_count
  FROM public.asistencias
  WHERE tenant_id = v_tenant_id;

  WITH a AS (
    SELECT tenant_id, id_empleado AS empleado_id, fecha
    FROM public.asistencia
    WHERE tenant_id = v_tenant_id
  ),
  b AS (
    SELECT tenant_id, empleado_id, fecha
    FROM public.asistencias
    WHERE tenant_id = v_tenant_id
  )
  SELECT COUNT(*) INTO v_gap_asistencia
  FROM a
  LEFT JOIN b USING (tenant_id, empleado_id, fecha)
  WHERE b.tenant_id IS NULL;

  WITH a AS (
    SELECT tenant_id, id_empleado AS empleado_id, fecha
    FROM public.asistencia
    WHERE tenant_id = v_tenant_id
  ),
  b AS (
    SELECT tenant_id, empleado_id, fecha
    FROM public.asistencias
    WHERE tenant_id = v_tenant_id
  )
  SELECT COUNT(*) INTO v_gap_asistencias
  FROM b
  LEFT JOIN a USING (tenant_id, empleado_id, fecha)
  WHERE a.tenant_id IS NULL;

  SELECT COALESCE(SUM(CASE WHEN c > 1 THEN c - 1 ELSE 0 END), 0)::bigint
  INTO v_dup_asistencia
  FROM (
    SELECT COUNT(*) AS c
    FROM public.asistencia
    WHERE tenant_id = v_tenant_id
    GROUP BY tenant_id, id_empleado, fecha
  ) t;

  SELECT COALESCE(SUM(CASE WHEN c > 1 THEN c - 1 ELSE 0 END), 0)::bigint
  INTO v_dup_asistencias
  FROM (
    SELECT COUNT(*) AS c
    FROM public.asistencias
    WHERE tenant_id = v_tenant_id
    GROUP BY tenant_id, empleado_id, fecha
  ) t;

  RETURN QUERY
  SELECT
    'counts',
    true,
    format('asistencia=%s asistencias=%s', v_asistencia_count, v_asistencias_count);

  RETURN QUERY
  SELECT
    'gaps.asistencia_not_in_asistencias',
    (v_gap_asistencia = 0),
    format('missing=%s', v_gap_asistencia);

  RETURN QUERY
  SELECT
    'gaps.asistencias_not_in_asistencia',
    (v_gap_asistencias = 0),
    format('missing=%s', v_gap_asistencias);

  RETURN QUERY
  SELECT
    'duplicates.asistencia',
    (v_dup_asistencia = 0),
    format('duplicate_rows=%s', v_dup_asistencia);

  RETURN QUERY
  SELECT
    'duplicates.asistencias',
    (v_dup_asistencias = 0),
    format('duplicate_rows=%s', v_dup_asistencias);
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_asistencia_validacion_actual AS
SELECT *
FROM public.validar_rrhh_asistencia_consistencia(app.resolve_request_tenant_id());

COMMIT;

