-- ============================================================================
-- 195__rrhh_asistencia_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para asistencia RRHH:
-- tablas: asistencia, asistencias.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant y aliases por relacion con empleados.
-- ----------------------------------------------------------------------------
UPDATE public.asistencia a
SET
  id_empleado = COALESCE(a.id_empleado, a.empleado_id, e.id),
  empleado_id = COALESCE(a.empleado_id, a.id_empleado, e.id),
  tenant_id = COALESCE(a.tenant_id, e.tenant_id)
FROM public.empleados e
WHERE COALESCE(a.id_empleado, a.empleado_id) = e.id
  AND (
    a.id_empleado IS NULL
    OR a.empleado_id IS NULL
    OR a.tenant_id IS NULL
    OR (e.tenant_id IS NOT NULL AND a.tenant_id <> e.tenant_id)
  );

UPDATE public.asistencias a
SET
  empleado_id = COALESCE(a.empleado_id, a.id_empleado, e.id),
  id_empleado = COALESCE(a.id_empleado, a.empleado_id, e.id),
  tenant_id = COALESCE(a.tenant_id, e.tenant_id)
FROM public.empleados e
WHERE COALESCE(a.empleado_id, a.id_empleado) = e.id
  AND (
    a.empleado_id IS NULL
    OR a.id_empleado IS NULL
    OR a.tenant_id IS NULL
    OR (e.tenant_id IS NOT NULL AND a.tenant_id <> e.tenant_id)
  );

-- ----------------------------------------------------------------------------
-- FKs runtime no ambiguas (una por relacion para evitar embeds ambiguos).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      t.relname AS table_name,
      c.conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = ref.relnamespace
    WHERE n.nspname = 'public'
      AND rn.nspname = 'public'
      AND t.relname IN ('asistencia', 'asistencias')
      AND ref.relname = 'empleados'
      AND c.contype = 'f'
      AND c.conname NOT IN ('asistencia_id_empleado_fkey_runtime', 'asistencias_empleado_id_fkey_runtime')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
  END LOOP;
END
$$;

SELECT app.add_fk_if_possible('asistencia', 'id_empleado', 'empleados', 'id', 'asistencia_id_empleado_fkey_runtime');
SELECT app.add_fk_if_possible('asistencias', 'empleado_id', 'empleados', 'id', 'asistencias_empleado_id_fkey_runtime');

-- ----------------------------------------------------------------------------
-- Dedupe operativo por llave funcional tenant+empleado+fecha.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    a.id,
    row_number() OVER (
      PARTITION BY a.tenant_id, a.id_empleado, a.fecha
      ORDER BY COALESCE(a.updated_at, a.created_at, now()) DESC, a.id::text DESC
    ) AS rn
  FROM public.asistencia a
  WHERE a.tenant_id IS NOT NULL
    AND a.id_empleado IS NOT NULL
    AND a.fecha IS NOT NULL
)
DELETE FROM public.asistencia a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    a.id,
    row_number() OVER (
      PARTITION BY a.tenant_id, a.empleado_id, a.fecha
      ORDER BY COALESCE(a.updated_at, a.created_at, now()) DESC, a.id::text DESC
    ) AS rn
  FROM public.asistencias a
  WHERE a.tenant_id IS NOT NULL
    AND a.empleado_id IS NOT NULL
    AND a.fecha IS NOT NULL
)
DELETE FROM public.asistencias a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant por relacion con empleados.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_asistencia_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, NEW.empleado_id::text, ''));
  NEW.empleado_id := NEW.id_empleado;

  IF NEW.id_empleado IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'id_empleado es obligatorio en asistencia', ERRCODE = '23514';
  END IF;

  IF NEW.fecha IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'fecha es obligatoria en asistencia', ERRCODE = '23514';
  END IF;

  SELECT e.tenant_id
  INTO v_tenant
  FROM public.empleados e
  WHERE e.id = NEW.id_empleado;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Empleado no existe para asistencia: %s', NEW.id_empleado), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant;
  ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en asistencia', ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en asistencia', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_asistencia_tenant_consistency ON public.asistencia;
CREATE TRIGGER trg_enforce_asistencia_tenant_consistency
BEFORE INSERT OR UPDATE ON public.asistencia
FOR EACH ROW
EXECUTE FUNCTION app.enforce_asistencia_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_asistencias_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.empleado_id := app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, NEW.id_empleado::text, ''));
  NEW.id_empleado := NEW.empleado_id;

  IF NEW.empleado_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'empleado_id es obligatorio en asistencias', ERRCODE = '23514';
  END IF;

  IF NEW.fecha IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'fecha es obligatoria en asistencias', ERRCODE = '23514';
  END IF;

  SELECT e.tenant_id
  INTO v_tenant
  FROM public.empleados e
  WHERE e.id = NEW.empleado_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Empleado no existe para asistencias: %s', NEW.empleado_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant;
  ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en asistencias', ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en asistencias', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_asistencias_tenant_consistency ON public.asistencias;
CREATE TRIGGER trg_enforce_asistencias_tenant_consistency
BEFORE INSERT OR UPDATE ON public.asistencias
FOR EACH ROW
EXECUTE FUNCTION app.enforce_asistencias_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.asistencia DROP CONSTRAINT IF EXISTS ck_asistencia_estado_runtime;
ALTER TABLE public.asistencia
  ADD CONSTRAINT ck_asistencia_estado_runtime
  CHECK (estado IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones'));

ALTER TABLE public.asistencia DROP CONSTRAINT IF EXISTS ck_asistencia_metricas_runtime;
ALTER TABLE public.asistencia
  ADD CONSTRAINT ck_asistencia_metricas_runtime
  CHECK (
    horas_trabajadas >= 0
    AND horas_trabajadas <= 24
    AND tardanza_minutos >= 0
    AND tardanza_minutos <= 1440
    AND (hora_salida IS NULL OR hora_entrada IS NOT NULL)
    AND (turno IS NULL OR turno IN ('manana', 'tarde', 'noche', 'mixto'))
    AND (origen IS NULL OR origen IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema'))
  );

ALTER TABLE public.asistencias DROP CONSTRAINT IF EXISTS ck_asistencias_estado_runtime;
ALTER TABLE public.asistencias
  ADD CONSTRAINT ck_asistencias_estado_runtime
  CHECK (estado IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones'));

ALTER TABLE public.asistencias DROP CONSTRAINT IF EXISTS ck_asistencias_metricas_runtime;
ALTER TABLE public.asistencias
  ADD CONSTRAINT ck_asistencias_metricas_runtime
  CHECK (
    horas_trabajadas >= 0
    AND horas_trabajadas <= 24
    AND tardanza_minutos >= 0
    AND tardanza_minutos <= 1440
    AND (hora_salida IS NULL OR hora_entrada IS NOT NULL)
    AND (turno IS NULL OR turno IN ('manana', 'tarde', 'noche', 'mixto'))
    AND (origen IS NULL OR origen IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema'))
  );

ALTER TABLE public.asistencia VALIDATE CONSTRAINT ck_asistencia_estado_runtime;
ALTER TABLE public.asistencia VALIDATE CONSTRAINT ck_asistencia_metricas_runtime;
ALTER TABLE public.asistencias VALIDATE CONSTRAINT ck_asistencias_estado_runtime;
ALTER TABLE public.asistencias VALIDATE CONSTRAINT ck_asistencias_metricas_runtime;

-- ----------------------------------------------------------------------------
-- Unicidades operativas por scope.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_asistencia_tenant_empleado_fecha;
DROP INDEX IF EXISTS public.ux_asistencias_tenant_empleado_fecha;

CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencia_tenant_empleado_fecha_runtime
ON public.asistencia (tenant_id, id_empleado, fecha)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencias_tenant_empleado_fecha_runtime
ON public.asistencias (tenant_id, empleado_id, fecha)
WHERE tenant_id IS NOT NULL
  AND empleado_id IS NOT NULL
  AND fecha IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'asistencia');
SELECT app.apply_tenant_policy('public', 'asistencias');

COMMIT;

