-- ============================================================================
-- 198__rrhh_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para contrato case-insensitive de estados RRHH:
-- tablas: empleados, asistencia, asistencias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill de consistencia estado/activo.
-- ----------------------------------------------------------------------------
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

UPDATE public.asistencia a
SET
  estado = app.normalize_asistencia_estado(a.estado::text)::citext,
  updated_at = now()
WHERE a.id IS NOT NULL;

UPDATE public.asistencias a
SET
  estado = app.normalize_asistencia_estado(a.estado::text)::citext,
  updated_at = now()
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de negocio (expresados en lower(...) para blindar contrato).
-- ----------------------------------------------------------------------------
ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_estado_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'suspendido', 'cesado'));

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_estado_activo_consistency_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_estado_activo_consistency_runtime
  CHECK (
    (
      lower(COALESCE(estado::text, 'activo')) = 'activo'
      AND COALESCE(activo, false) = true
    )
    OR (
      lower(COALESCE(estado::text, 'activo')) IN ('inactivo', 'cesado')
      AND COALESCE(activo, false) = false
    )
    OR (
      lower(COALESCE(estado::text, 'activo')) = 'suspendido'
    )
  );

ALTER TABLE public.asistencia DROP CONSTRAINT IF EXISTS ck_asistencia_estado_runtime;
ALTER TABLE public.asistencia
  ADD CONSTRAINT ck_asistencia_estado_runtime
  CHECK (lower(estado::text) IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones'));

ALTER TABLE public.asistencias DROP CONSTRAINT IF EXISTS ck_asistencias_estado_runtime;
ALTER TABLE public.asistencias
  ADD CONSTRAINT ck_asistencias_estado_runtime
  CHECK (lower(estado::text) IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones'));

ALTER TABLE public.empleados ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.asistencia ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.asistencias ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_estado_runtime;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_estado_activo_consistency_runtime;
ALTER TABLE public.asistencia VALIDATE CONSTRAINT ck_asistencia_estado_runtime;
ALTER TABLE public.asistencias VALIDATE CONSTRAINT ck_asistencias_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicar políticas RLS por endurecimiento explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'empleados');
SELECT app.apply_tenant_policy('public', 'asistencia');
SELECT app.apply_tenant_policy('public', 'asistencias');

COMMIT;
