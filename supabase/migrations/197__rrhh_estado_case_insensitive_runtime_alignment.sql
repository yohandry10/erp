-- ============================================================================
-- 197__rrhh_estado_case_insensitive_runtime_alignment.sql
-- Compatibilidad case-insensitive para estados RRHH en runtime:
-- tablas: empleados, asistencia, asistencias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

DROP FUNCTION IF EXISTS public.get_asistencia_unificada(uuid, date, date);
DROP VIEW IF EXISTS public.v_asistencia_unificada;

-- ----------------------------------------------------------------------------
-- empleados.estado -> citext (compatibilidad ACTIVO/activo en filtros runtime).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleados
  ALTER COLUMN estado TYPE citext
  USING (
    CASE
      WHEN lower(COALESCE(NULLIF(btrim(estado::text), ''), 'activo')) IN ('activo', 'inactivo', 'suspendido', 'cesado')
        THEN lower(COALESCE(NULLIF(btrim(estado::text), ''), 'activo'))
      WHEN lower(COALESCE(NULLIF(btrim(estado::text), ''), 'activo')) IN ('activa', 'vigente')
        THEN 'activo'
      WHEN lower(COALESCE(NULLIF(btrim(estado::text), ''), 'activo')) IN ('baja', 'retirado', 'terminado', 'finalizado')
        THEN 'cesado'
      WHEN lower(COALESCE(NULLIF(btrim(estado::text), ''), 'activo')) = 'inactiva'
        THEN 'inactivo'
      ELSE 'activo'
    END
  )::citext;

UPDATE public.empleados e
SET
  estado = (
    CASE
      WHEN lower(COALESCE(NULLIF(btrim(e.estado::text), ''), 'activo')) IN ('activo', 'inactivo', 'suspendido', 'cesado')
        THEN lower(COALESCE(NULLIF(btrim(e.estado::text), ''), 'activo'))
      WHEN lower(COALESCE(NULLIF(btrim(e.estado::text), ''), 'activo')) IN ('activa', 'vigente')
        THEN 'activo'
      WHEN lower(COALESCE(NULLIF(btrim(e.estado::text), ''), 'activo')) IN ('baja', 'retirado', 'terminado', 'finalizado')
        THEN 'cesado'
      WHEN lower(COALESCE(NULLIF(btrim(e.estado::text), ''), 'activo')) = 'inactiva'
        THEN 'inactivo'
      ELSE 'activo'
    END
  )::citext,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.estado::text), ''), 'activo')) IN ('inactivo', 'inactiva', 'cesado', 'baja', 'retirado', 'terminado', 'finalizado')
      THEN false
    ELSE COALESCE(e.activo, true)
  END,
  updated_at = now()
WHERE e.id IS NOT NULL;

ALTER TABLE IF EXISTS public.empleados
  ALTER COLUMN estado SET DEFAULT 'activo'::citext;

-- ----------------------------------------------------------------------------
-- asistencia.estado -> citext.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asistencia
  ALTER COLUMN estado TYPE citext
  USING app.normalize_asistencia_estado(estado::text)::citext;

UPDATE public.asistencia a
SET
  estado = app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(a.estado::text, '')), ''),
      CASE
        WHEN a.hora_entrada IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  )::citext,
  updated_at = now()
WHERE a.id IS NOT NULL;

ALTER TABLE IF EXISTS public.asistencia
  ALTER COLUMN estado SET DEFAULT 'presente'::citext;

-- ----------------------------------------------------------------------------
-- asistencias.estado -> citext.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asistencias
  ALTER COLUMN estado TYPE citext
  USING app.normalize_asistencia_estado(estado::text)::citext;

UPDATE public.asistencias a
SET
  estado = app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(a.estado::text, '')), ''),
      CASE
        WHEN a.hora_entrada IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  )::citext,
  updated_at = now()
WHERE a.id IS NOT NULL;

ALTER TABLE IF EXISTS public.asistencias
  ALTER COLUMN estado SET DEFAULT 'presente'::citext;

-- ----------------------------------------------------------------------------
-- Índices runtime para filtros por estado (ahora case-insensitive por tipo).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_empleados_tenant_estado_ci_runtime
ON public.empleados (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_estado_ci_runtime
ON public.asistencia (tenant_id, estado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asistencias_tenant_estado_ci_runtime
ON public.asistencias (tenant_id, estado, fecha DESC, created_at DESC);

CREATE OR REPLACE VIEW public.v_asistencia_unificada AS
WITH base AS (
  SELECT
    a.tenant_id,
    a.id_empleado AS empleado_id,
    a.fecha,
    a.hora_entrada,
    a.hora_salida,
    a.horas_trabajadas,
    a.estado::text AS estado,
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
    a.estado::text AS estado,
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
