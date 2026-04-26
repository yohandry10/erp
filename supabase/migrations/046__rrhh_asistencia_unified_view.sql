-- ============================================================================
-- 046__rrhh_asistencia_unified_view.sql
-- Capa unificada de lectura para asistencia/asistencias.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_asistencia_unificada AS
WITH base AS (
  SELECT
    a.tenant_id,
    a.id_empleado AS empleado_id,
    a.fecha,
    a.hora_entrada,
    a.hora_salida,
    a.horas_trabajadas,
    a.estado,
    a.created_at,
    a.updated_at,
    'asistencia'::text AS source_table
  FROM public.asistencia a

  UNION ALL

  SELECT
    a.tenant_id,
    a.empleado_id,
    a.fecha,
    a.hora_entrada,
    a.hora_salida,
    a.horas_trabajadas,
    a.estado,
    a.created_at,
    a.updated_at,
    'asistencias'::text AS source_table
  FROM public.asistencias a
),
ranked AS (
  SELECT
    b.*,
    row_number() OVER (
      PARTITION BY b.tenant_id, b.empleado_id, b.fecha
      ORDER BY
        CASE WHEN b.source_table = 'asistencia' THEN 0 ELSE 1 END,
        b.updated_at DESC NULLS LAST,
        b.created_at DESC NULLS LAST
    ) AS rn
  FROM base b
  WHERE b.tenant_id IS NOT NULL
    AND b.empleado_id IS NOT NULL
    AND b.fecha IS NOT NULL
)
SELECT
  r.tenant_id,
  r.empleado_id,
  r.fecha,
  r.hora_entrada,
  r.hora_salida,
  COALESCE(r.horas_trabajadas, 0)::numeric(6,2) AS horas_trabajadas,
  r.estado,
  r.created_at,
  r.updated_at,
  r.source_table
FROM ranked r
WHERE r.rn = 1;

CREATE OR REPLACE FUNCTION public.get_asistencia_unificada(
  p_tenant_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  empleado_id uuid,
  fecha date,
  hora_entrada time,
  hora_salida time,
  horas_trabajadas numeric,
  estado text,
  source_table text
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT
    v.tenant_id,
    v.empleado_id,
    v.fecha,
    v.hora_entrada,
    v.hora_salida,
    v.horas_trabajadas,
    v.estado,
    v.source_table
  FROM public.v_asistencia_unificada v
  WHERE v.tenant_id = p_tenant_id
    AND (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
  ORDER BY v.fecha DESC, v.empleado_id;
$$;

COMMIT;

