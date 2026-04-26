-- ============================================================================
-- 165__rrhh_talento_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- vacantes, candidatos, solicitudes, evaluaciones.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.vacantes v
SET tenant_id = d.tenant_id
FROM public.departamentos d
WHERE v.departamento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND (v.tenant_id IS NULL OR v.tenant_id <> d.tenant_id);

UPDATE public.candidatos c
SET
  tenant_id = v.tenant_id,
  id_vacante = COALESCE(c.id_vacante, c.vacante_id, v.id),
  vacante_id = COALESCE(c.vacante_id, c.id_vacante, v.id)
FROM public.vacantes v
WHERE (c.id_vacante = v.id OR c.vacante_id = v.id)
  AND v.tenant_id IS NOT NULL
  AND (
    c.tenant_id IS NULL
    OR c.tenant_id <> v.tenant_id
    OR c.id_vacante IS NULL
    OR c.vacante_id IS NULL
  );

UPDATE public.solicitudes s
SET tenant_id = e.tenant_id
FROM public.empleados e
WHERE s.id_empleado = e.id
  AND e.tenant_id IS NOT NULL
  AND (s.tenant_id IS NULL OR s.tenant_id <> e.tenant_id);

UPDATE public.evaluaciones ev
SET tenant_id = e.tenant_id
FROM public.empleados e
WHERE ev.id_empleado = e.id
  AND e.tenant_id IS NOT NULL
  AND (ev.tenant_id IS NULL OR ev.tenant_id <> e.tenant_id);

UPDATE public.solicitudes s
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE s.aprobado_por = u.id
  AND u.tenant_id IS NOT NULL
  AND s.tenant_id IS NULL;

UPDATE public.evaluaciones ev
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE ev.evaluador_id = u.id
  AND u.tenant_id IS NOT NULL
  AND ev.tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- FKs runtime para joins/embeds.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('vacantes', 'departamento_id', 'departamentos', 'id', 'vacantes_departamento_id_fkey');

SELECT app.add_fk_if_possible('candidatos', 'id_vacante', 'vacantes', 'id', 'candidatos_id_vacante_fkey');
SELECT app.add_fk_if_possible('candidatos', 'vacante_id', 'vacantes', 'id', 'candidatos_vacante_id_fkey');

SELECT app.add_fk_if_possible('solicitudes', 'id_empleado', 'empleados', 'id', 'solicitudes_id_empleado_fkey');
SELECT app.add_fk_if_possible('solicitudes', 'aprobado_por', 'usuarios_sistema', 'id', 'solicitudes_aprobado_por_fkey');

SELECT app.add_fk_if_possible('evaluaciones', 'id_empleado', 'empleados', 'id', 'evaluaciones_id_empleado_fkey');
SELECT app.add_fk_if_possible('evaluaciones', 'evaluador_id', 'usuarios_sistema', 'id', 'evaluaciones_evaluador_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar unicidades.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    v.id,
    row_number() OVER (
      PARTITION BY v.tenant_id, upper(btrim(v.titulo)), upper(btrim(v.puesto_solicitado))
      ORDER BY COALESCE(v.updated_at, v.created_at, now()) DESC, v.id::text DESC
    ) AS rn
  FROM public.vacantes v
  WHERE v.tenant_id IS NOT NULL
    AND v.titulo IS NOT NULL
    AND btrim(v.titulo) <> ''
    AND v.puesto_solicitado IS NOT NULL
    AND btrim(v.puesto_solicitado) <> ''
    AND v.estado IN ('activa', 'pausada', 'borrador')
)
UPDATE public.vacantes v
SET
  titulo = format('%s DUP %s', btrim(v.titulo), r.rn),
  updated_at = now()
FROM ranked r
WHERE v.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.id_vacante, lower(btrim(c.email))
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.candidatos c
  WHERE c.tenant_id IS NOT NULL
    AND c.id_vacante IS NOT NULL
    AND c.email IS NOT NULL
    AND btrim(c.email) <> ''
)
UPDATE public.candidatos c
SET
  email = format('dup+%s-%s@local.invalid', r.rn, left(replace(c.id::text, '-', ''), 12)),
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.tenant_id, s.id_empleado, lower(btrim(s.tipo)), s.fecha_inicio, s.fecha_fin
      ORDER BY COALESCE(s.updated_at, s.created_at, now()) DESC, s.id::text DESC
    ) AS rn
  FROM public.solicitudes s
  WHERE s.tenant_id IS NOT NULL
    AND s.id_empleado IS NOT NULL
    AND s.tipo IS NOT NULL
    AND btrim(s.tipo) <> ''
    AND s.fecha_inicio IS NOT NULL
    AND s.fecha_fin IS NOT NULL
    AND s.estado IN ('pendiente', 'aprobada')
)
UPDATE public.solicitudes s
SET
  fecha_fin = s.fecha_fin + (r.rn - 1),
  dias = GREATEST((s.fecha_fin + (r.rn - 1) - s.fecha_inicio) + 1, 0),
  updated_at = now()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    e.id,
    row_number() OVER (
      PARTITION BY e.tenant_id, e.id_empleado, e.fecha_evaluacion
      ORDER BY COALESCE(e.updated_at, e.created_at, now()) DESC, e.id::text DESC
    ) AS rn
  FROM public.evaluaciones e
  WHERE e.tenant_id IS NOT NULL
    AND e.id_empleado IS NOT NULL
    AND e.fecha_evaluacion IS NOT NULL
)
UPDATE public.evaluaciones e
SET
  fecha_evaluacion = e.fecha_evaluacion + (r.rn - 1),
  updated_at = now()
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: vacantes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_vacantes_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.departamento_id := app.to_uuid_or_null(COALESCE(NEW.departamento_id::text, ''));

  IF NEW.departamento_id IS NOT NULL THEN
    SELECT d.tenant_id INTO v_ref_tenant
    FROM public.departamentos d
    WHERE d.id = NEW.departamento_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Departamento no existe: %s', NEW.departamento_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con departamento de vacantes', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en vacantes', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vacantes_tenant_consistency ON public.vacantes;
CREATE TRIGGER trg_enforce_vacantes_tenant_consistency
BEFORE INSERT OR UPDATE ON public.vacantes
FOR EACH ROW
EXECUTE FUNCTION app.enforce_vacantes_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: candidatos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_candidatos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_vacante := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_vacante::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.vacante_id::text, ''))
  );
  NEW.vacante_id := NEW.id_vacante;

  IF NEW.id_vacante IS NOT NULL THEN
    SELECT v.tenant_id INTO v_ref_tenant
    FROM public.vacantes v
    WHERE v.id = NEW.id_vacante;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Vacante no existe: %s', NEW.id_vacante), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con vacante en candidatos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en candidatos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_candidatos_tenant_consistency ON public.candidatos;
CREATE TRIGGER trg_enforce_candidatos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.candidatos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_candidatos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: solicitudes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_solicitudes_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, ''));
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_ref_tenant
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en solicitudes', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.aprobado_por IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.aprobado_por;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Usuario aprobador no existe: %s', NEW.aprobado_por), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con aprobador en solicitudes', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en solicitudes', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_solicitudes_tenant_consistency ON public.solicitudes;
CREATE TRIGGER trg_enforce_solicitudes_tenant_consistency
BEFORE INSERT OR UPDATE ON public.solicitudes
FOR EACH ROW
EXECUTE FUNCTION app.enforce_solicitudes_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: evaluaciones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_evaluaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, ''));
  NEW.evaluador_id := app.to_uuid_or_null(COALESCE(NEW.evaluador_id::text, ''));

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_ref_tenant
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en evaluaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.evaluador_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.evaluador_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Evaluador no existe: %s', NEW.evaluador_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con evaluador en evaluaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en evaluaciones', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_evaluaciones_tenant_consistency ON public.evaluaciones;
CREATE TRIGGER trg_enforce_evaluaciones_tenant_consistency
BEFORE INSERT OR UPDATE ON public.evaluaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_evaluaciones_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vacantes DROP CONSTRAINT IF EXISTS ck_vacantes_salarios_runtime;
ALTER TABLE public.vacantes
  ADD CONSTRAINT ck_vacantes_salarios_runtime
  CHECK (
    salario_minimo >= 0
    AND salario_maximo >= 0
    AND salario_maximo >= salario_minimo
    AND salario_min >= 0
    AND salario_max >= 0
    AND salario_max >= salario_min
  );

ALTER TABLE public.vacantes DROP CONSTRAINT IF EXISTS ck_vacantes_estado_runtime;
ALTER TABLE public.vacantes
  ADD CONSTRAINT ck_vacantes_estado_runtime
  CHECK (estado IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador'));

ALTER TABLE public.vacantes DROP CONSTRAINT IF EXISTS ck_vacantes_tipo_contrato_runtime;
ALTER TABLE public.vacantes
  ADD CONSTRAINT ck_vacantes_tipo_contrato_runtime
  CHECK (tipo_contrato IN ('tiempo_completo', 'medio_tiempo', 'contrato', 'pasantia', 'freelance'));

ALTER TABLE public.vacantes DROP CONSTRAINT IF EXISTS ck_vacantes_fechas_runtime;
ALTER TABLE public.vacantes
  ADD CONSTRAINT ck_vacantes_fechas_runtime
  CHECK (
    (fecha_publicacion IS NULL OR fecha_limite IS NULL OR fecha_limite >= fecha_publicacion)
    AND (fecha_publicacion IS NULL OR fecha_cierre IS NULL OR fecha_cierre >= fecha_publicacion)
  );

ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS ck_candidatos_estado_runtime;
ALTER TABLE public.candidatos
  ADD CONSTRAINT ck_candidatos_estado_runtime
  CHECK (estado IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado'));

ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS ck_candidatos_scores_runtime;
ALTER TABLE public.candidatos
  ADD CONSTRAINT ck_candidatos_scores_runtime
  CHECK (
    experiencia_anos >= 0
    AND pretension_salarial >= 0
    AND puntuacion_cv >= 0
    AND puntuacion_cv <= 100
  );

ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS ck_candidatos_modalidad_runtime;
ALTER TABLE public.candidatos
  ADD CONSTRAINT ck_candidatos_modalidad_runtime
  CHECK (modalidad_trabajo_preferida IN ('presencial', 'remoto', 'hibrido'));

ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS ck_candidatos_email_runtime;
ALTER TABLE public.candidatos
  ADD CONSTRAINT ck_candidatos_email_runtime
  CHECK (email IS NULL OR position('@' IN email) > 1);

ALTER TABLE public.solicitudes DROP CONSTRAINT IF EXISTS ck_solicitudes_estado_runtime;
ALTER TABLE public.solicitudes
  ADD CONSTRAINT ck_solicitudes_estado_runtime
  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada'));

ALTER TABLE public.solicitudes DROP CONSTRAINT IF EXISTS ck_solicitudes_tipo_runtime;
ALTER TABLE public.solicitudes
  ADD CONSTRAINT ck_solicitudes_tipo_runtime
  CHECK (tipo IN ('vacaciones', 'licencia', 'permiso', 'descanso_medico', 'compensacion', 'otro'));

ALTER TABLE public.solicitudes DROP CONSTRAINT IF EXISTS ck_solicitudes_fechas_dias_runtime;
ALTER TABLE public.solicitudes
  ADD CONSTRAINT ck_solicitudes_fechas_dias_runtime
  CHECK (
    dias >= 0
    AND (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
  );

ALTER TABLE public.solicitudes DROP CONSTRAINT IF EXISTS ck_solicitudes_aprobacion_runtime;
ALTER TABLE public.solicitudes
  ADD CONSTRAINT ck_solicitudes_aprobacion_runtime
  CHECK (estado NOT IN ('aprobada', 'rechazada') OR fecha_aprobacion IS NOT NULL);

ALTER TABLE public.evaluaciones DROP CONSTRAINT IF EXISTS ck_evaluaciones_estado_runtime;
ALTER TABLE public.evaluaciones
  ADD CONSTRAINT ck_evaluaciones_estado_runtime
  CHECK (estado IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada'));

ALTER TABLE public.evaluaciones DROP CONSTRAINT IF EXISTS ck_evaluaciones_tipo_runtime;
ALTER TABLE public.evaluaciones
  ADD CONSTRAINT ck_evaluaciones_tipo_runtime
  CHECK (tipo IN ('desempeno', 'periodica', 'prueba', '360', 'objetivos', 'otro'));

ALTER TABLE public.evaluaciones DROP CONSTRAINT IF EXISTS ck_evaluaciones_puntaje_runtime;
ALTER TABLE public.evaluaciones
  ADD CONSTRAINT ck_evaluaciones_puntaje_runtime
  CHECK (puntaje_total >= 0 AND puntaje_total <= 100);

ALTER TABLE public.evaluaciones DROP CONSTRAINT IF EXISTS ck_evaluaciones_fechas_runtime;
ALTER TABLE public.evaluaciones
  ADD CONSTRAINT ck_evaluaciones_fechas_runtime
  CHECK (proxima_evaluacion IS NULL OR fecha_evaluacion IS NULL OR proxima_evaluacion >= fecha_evaluacion);

ALTER TABLE public.vacantes VALIDATE CONSTRAINT ck_vacantes_salarios_runtime;
ALTER TABLE public.vacantes VALIDATE CONSTRAINT ck_vacantes_estado_runtime;
ALTER TABLE public.vacantes VALIDATE CONSTRAINT ck_vacantes_tipo_contrato_runtime;
ALTER TABLE public.vacantes VALIDATE CONSTRAINT ck_vacantes_fechas_runtime;

ALTER TABLE public.candidatos VALIDATE CONSTRAINT ck_candidatos_estado_runtime;
ALTER TABLE public.candidatos VALIDATE CONSTRAINT ck_candidatos_scores_runtime;
ALTER TABLE public.candidatos VALIDATE CONSTRAINT ck_candidatos_modalidad_runtime;
ALTER TABLE public.candidatos VALIDATE CONSTRAINT ck_candidatos_email_runtime;

ALTER TABLE public.solicitudes VALIDATE CONSTRAINT ck_solicitudes_estado_runtime;
ALTER TABLE public.solicitudes VALIDATE CONSTRAINT ck_solicitudes_tipo_runtime;
ALTER TABLE public.solicitudes VALIDATE CONSTRAINT ck_solicitudes_fechas_dias_runtime;
ALTER TABLE public.solicitudes VALIDATE CONSTRAINT ck_solicitudes_aprobacion_runtime;

ALTER TABLE public.evaluaciones VALIDATE CONSTRAINT ck_evaluaciones_estado_runtime;
ALTER TABLE public.evaluaciones VALIDATE CONSTRAINT ck_evaluaciones_tipo_runtime;
ALTER TABLE public.evaluaciones VALIDATE CONSTRAINT ck_evaluaciones_puntaje_runtime;
ALTER TABLE public.evaluaciones VALIDATE CONSTRAINT ck_evaluaciones_fechas_runtime;

-- ----------------------------------------------------------------------------
-- Unicidades operativas.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_vacantes_tenant_titulo_puesto_activo
ON public.vacantes (tenant_id, upper(btrim(titulo)), upper(btrim(puesto_solicitado)))
WHERE tenant_id IS NOT NULL
  AND titulo IS NOT NULL
  AND btrim(titulo) <> ''
  AND puesto_solicitado IS NOT NULL
  AND btrim(puesto_solicitado) <> ''
  AND estado IN ('activa', 'pausada', 'borrador');

CREATE UNIQUE INDEX IF NOT EXISTS ux_candidatos_tenant_vacante_email
ON public.candidatos (tenant_id, id_vacante, lower(btrim(email)))
WHERE tenant_id IS NOT NULL
  AND id_vacante IS NOT NULL
  AND email IS NOT NULL
  AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_solicitudes_tenant_empleado_tipo_rango
ON public.solicitudes (tenant_id, id_empleado, lower(btrim(tipo)), fecha_inicio, fecha_fin)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND tipo IS NOT NULL
  AND btrim(tipo) <> ''
  AND fecha_inicio IS NOT NULL
  AND fecha_fin IS NOT NULL
  AND estado IN ('pendiente', 'aprobada');

CREATE UNIQUE INDEX IF NOT EXISTS ux_evaluaciones_tenant_empleado_fecha
ON public.evaluaciones (tenant_id, id_empleado, fecha_evaluacion)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha_evaluacion IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'vacantes');
SELECT app.apply_tenant_policy('public', 'candidatos');
SELECT app.apply_tenant_policy('public', 'solicitudes');
SELECT app.apply_tenant_policy('public', 'evaluaciones');

COMMIT;
