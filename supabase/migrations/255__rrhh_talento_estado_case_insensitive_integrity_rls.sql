-- ============================================================================
-- 255__rrhh_talento_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en RRHH talento.
-- Tablas foco:
--   public.vacantes
--   public.candidatos
--   public.solicitudes
--   public.evaluaciones
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.vacantes
SET estado = app.normalize_vacantes_estado_254(estado::text)
WHERE id IS NOT NULL;

UPDATE public.candidatos
SET estado = app.normalize_candidatos_estado_254(estado::text)
WHERE id IS NOT NULL;

UPDATE public.solicitudes
SET estado = app.normalize_solicitudes_estado_254(estado::text)
WHERE id IS NOT NULL;

UPDATE public.evaluaciones
SET estado = app.normalize_evaluaciones_estado_254(estado::text)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vacantes DROP CONSTRAINT IF EXISTS ck_vacantes_estado_runtime;
ALTER TABLE public.vacantes
  ADD CONSTRAINT ck_vacantes_estado_runtime
  CHECK (lower(estado::text) IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador')) NOT VALID;

ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS ck_candidatos_estado_runtime;
ALTER TABLE public.candidatos
  ADD CONSTRAINT ck_candidatos_estado_runtime
  CHECK (lower(estado::text) IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado')) NOT VALID;

ALTER TABLE public.solicitudes DROP CONSTRAINT IF EXISTS ck_solicitudes_estado_runtime;
ALTER TABLE public.solicitudes
  ADD CONSTRAINT ck_solicitudes_estado_runtime
  CHECK (lower(estado::text) IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')) NOT VALID;

ALTER TABLE public.evaluaciones DROP CONSTRAINT IF EXISTS ck_evaluaciones_estado_runtime;
ALTER TABLE public.evaluaciones
  ADD CONSTRAINT ck_evaluaciones_estado_runtime
  CHECK (lower(estado::text) IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual en estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vacantes ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.candidatos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.solicitudes ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.evaluaciones ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Unicidades activas con predicados CI.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_vacantes_tenant_titulo_puesto_activo;
CREATE UNIQUE INDEX ux_vacantes_tenant_titulo_puesto_activo
ON public.vacantes (tenant_id, upper(btrim(titulo)), upper(btrim(puesto_solicitado)))
WHERE tenant_id IS NOT NULL
  AND titulo IS NOT NULL
  AND btrim(titulo) <> ''
  AND puesto_solicitado IS NOT NULL
  AND btrim(puesto_solicitado) <> ''
  AND lower(estado::text) IN ('activa', 'pausada', 'borrador');

DROP INDEX IF EXISTS public.ux_candidatos_tenant_vacante_email;
CREATE UNIQUE INDEX ux_candidatos_tenant_vacante_email
ON public.candidatos (tenant_id, id_vacante, lower(btrim(email)))
WHERE tenant_id IS NOT NULL
  AND id_vacante IS NOT NULL
  AND email IS NOT NULL
  AND btrim(email) <> '';

DROP INDEX IF EXISTS public.ux_solicitudes_tenant_empleado_tipo_rango;
CREATE UNIQUE INDEX ux_solicitudes_tenant_empleado_tipo_rango
ON public.solicitudes (tenant_id, id_empleado, lower(btrim(tipo)), fecha_inicio, fecha_fin)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND tipo IS NOT NULL
  AND btrim(tipo) <> ''
  AND fecha_inicio IS NOT NULL
  AND fecha_fin IS NOT NULL
  AND lower(estado::text) IN ('pendiente', 'aprobada');

DROP INDEX IF EXISTS public.ux_evaluaciones_tenant_empleado_fecha;
CREATE UNIQUE INDEX ux_evaluaciones_tenant_empleado_fecha
ON public.evaluaciones (tenant_id, id_empleado, fecha_evaluacion)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha_evaluacion IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vacantes VALIDATE CONSTRAINT ck_vacantes_estado_runtime;
ALTER TABLE public.candidatos VALIDATE CONSTRAINT ck_candidatos_estado_runtime;
ALTER TABLE public.solicitudes VALIDATE CONSTRAINT ck_solicitudes_estado_runtime;
ALTER TABLE public.evaluaciones VALIDATE CONSTRAINT ck_evaluaciones_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'vacantes');
SELECT app.apply_tenant_policy('public', 'candidatos');
SELECT app.apply_tenant_policy('public', 'solicitudes');
SELECT app.apply_tenant_policy('public', 'evaluaciones');

COMMIT;
