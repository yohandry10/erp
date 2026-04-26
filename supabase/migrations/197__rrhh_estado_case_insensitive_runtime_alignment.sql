-- ============================================================================
-- 197__rrhh_estado_case_insensitive_runtime_alignment.sql
-- Compatibilidad case-insensitive para estados RRHH en runtime:
-- tablas: empleados, asistencia, asistencias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

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

COMMIT;

