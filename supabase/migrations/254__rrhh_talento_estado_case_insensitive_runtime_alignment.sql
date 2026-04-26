-- ============================================================================
-- 254__rrhh_talento_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en RRHH talento.
-- Tablas foco:
--   public.vacantes
--   public.candidatos
--   public.solicitudes
--   public.evaluaciones
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado por dominio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_vacantes_estado_254(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activa'));
  IF v = 'activo' THEN v := 'activa'; END IF;
  IF v = 'inactivo' THEN v := 'pausada'; END IF;
  IF v = 'cancelado' OR v = 'anulada' OR v = 'anulado' THEN v := 'cancelada'; END IF;
  IF v = 'cerrado' THEN v := 'cerrada'; END IF;
  IF v NOT IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador') THEN
    v := 'activa';
  END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_candidatos_estado_254(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'postulante'));
  IF v = 'en_entrevista' OR v = 'entrevistado' THEN v := 'entrevista'; END IF;
  IF v = 'seleccionada' THEN v := 'seleccionado'; END IF;
  IF v = 'rechazada' THEN v := 'rechazado'; END IF;
  IF v = 'contratacion' OR v = 'contratada' THEN v := 'contratado'; END IF;
  IF v = 'descartada' THEN v := 'descartado'; END IF;
  IF v NOT IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado') THEN
    v := 'postulante';
  END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_solicitudes_estado_254(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'pendiente'));
  IF v = 'aprobado' THEN v := 'aprobada'; END IF;
  IF v = 'rechazado' THEN v := 'rechazada'; END IF;
  IF v = 'cancelado' OR v = 'anulada' OR v = 'anulado' THEN v := 'cancelada'; END IF;
  IF v NOT IN ('pendiente', 'aprobada', 'rechazada', 'cancelada') THEN
    v := 'pendiente';
  END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_evaluaciones_estado_254(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'borrador'));
  IF v = 'programado' THEN v := 'programada'; END IF;
  IF v = 'completado' THEN v := 'completada'; END IF;
  IF v = 'aprobado' THEN v := 'aprobada'; END IF;
  IF v = 'rechazado' THEN v := 'rechazada'; END IF;
  IF v NOT IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada') THEN
    v := 'borrador';
  END IF;
  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vacantes
  ALTER COLUMN estado TYPE citext
  USING app.normalize_vacantes_estado_254(estado::text);

ALTER TABLE public.candidatos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_candidatos_estado_254(estado::text);

ALTER TABLE public.solicitudes
  ALTER COLUMN estado TYPE citext
  USING app.normalize_solicitudes_estado_254(estado::text);

ALTER TABLE public.evaluaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_evaluaciones_estado_254(estado::text);

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
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vacantes_tenant_estado_ci_runtime_254
ON public.vacantes (tenant_id, estado, fecha_publicacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidatos_tenant_estado_ci_runtime_254
ON public.candidatos (tenant_id, estado, fecha_postulacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_solicitudes_tenant_estado_ci_runtime_254
ON public.solicitudes (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_tenant_estado_ci_runtime_254
ON public.evaluaciones (tenant_id, estado, fecha_evaluacion DESC, created_at DESC);

COMMIT;
