-- ============================================================================
-- 251__rrhh_personal_operativo_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en RRHH personal operativo.
-- Tablas foco:
--   public.beneficios
--   public.capacitaciones
--   public.horarios_trabajo
--   public.empleado_beneficios
--   public.empleado_capacitaciones
--   public.empleado_horarios
--   public.expediente_documentos
--   public.liquidaciones
--   public.historial_pagos_planilla
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado por dominio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_beneficios_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v = 'vigente' THEN v := 'activo'; END IF;
  IF v = 'anulado' OR v = 'anulada' THEN v := 'inactivo'; END IF;
  IF v NOT IN ('activo', 'inactivo', 'archivado') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_capacitaciones_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v = 'terminada' THEN v := 'completada'; END IF;
  IF v = 'anulado' OR v = 'anulada' THEN v := 'cancelada'; END IF;
  IF v NOT IN ('activo', 'inactivo', 'completada', 'cancelada') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_horarios_trabajo_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v = 'archivado' THEN v := 'inactivo'; END IF;
  IF v NOT IN ('activo', 'inactivo') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_empleado_beneficios_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v = 'vigente' THEN v := 'activo'; END IF;
  IF v = 'anulado' OR v = 'anulada' THEN v := 'inactivo'; END IF;
  IF v NOT IN ('activo', 'inactivo', 'suspendido', 'vencido') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_empleado_capacitaciones_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'inscrito'));
  IF v = 'en progreso' THEN v := 'en_progreso'; END IF;
  IF v = 'finalizado' OR v = 'terminado' THEN v := 'completado'; END IF;
  IF v = 'cancelada' THEN v := 'cancelado'; END IF;
  IF v NOT IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado') THEN
    v := 'inscrito';
  END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_empleado_horarios_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v NOT IN ('activo', 'inactivo', 'suspendido') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_expediente_documentos_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v = 'inactivo' THEN v := 'archivado'; END IF;
  IF v = 'anulado' OR v = 'anulada' THEN v := 'eliminado'; END IF;
  IF v NOT IN ('activo', 'archivado', 'eliminado') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_liquidaciones_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'calculada'));
  IF v = 'activo' THEN v := 'calculada'; END IF;
  IF v = 'inactivo' THEN v := 'anulada'; END IF;
  IF v = 'cerrada' THEN v := 'pagada'; END IF;
  IF v NOT IN ('calculada', 'aprobada', 'pagada', 'anulada') THEN v := 'calculada'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_historial_pagos_planilla_estado_251(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'registrado'));
  IF v = 'activo' THEN v := 'registrado'; END IF;
  IF v = 'inactivo' THEN v := 'anulado'; END IF;
  IF v = 'reconciliado' THEN v := 'conciliado'; END IF;
  IF v NOT IN ('registrado', 'anulado', 'conciliado') THEN v := 'registrado'; END IF;
  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipo a citext para columnas estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.beneficios
  ALTER COLUMN estado TYPE citext
  USING app.normalize_beneficios_estado_251(estado::text);

ALTER TABLE public.capacitaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_capacitaciones_estado_251(estado::text);

ALTER TABLE public.horarios_trabajo
  ALTER COLUMN estado TYPE citext
  USING app.normalize_horarios_trabajo_estado_251(estado::text);

ALTER TABLE public.empleado_beneficios
  ALTER COLUMN estado TYPE citext
  USING app.normalize_empleado_beneficios_estado_251(estado::text);

ALTER TABLE public.empleado_capacitaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_empleado_capacitaciones_estado_251(estado::text);

ALTER TABLE public.empleado_horarios
  ALTER COLUMN estado TYPE citext
  USING app.normalize_empleado_horarios_estado_251(estado::text);

ALTER TABLE public.expediente_documentos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_expediente_documentos_estado_251(estado::text);

ALTER TABLE public.liquidaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_liquidaciones_estado_251(estado::text);

ALTER TABLE public.historial_pagos_planilla
  ALTER COLUMN estado TYPE citext
  USING app.normalize_historial_pagos_planilla_estado_251(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.beneficios
SET estado = app.normalize_beneficios_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.capacitaciones
SET estado = app.normalize_capacitaciones_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.horarios_trabajo
SET estado = app.normalize_horarios_trabajo_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.empleado_beneficios
SET estado = app.normalize_empleado_beneficios_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.empleado_capacitaciones
SET estado = app.normalize_empleado_capacitaciones_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.empleado_horarios
SET estado = app.normalize_empleado_horarios_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.expediente_documentos
SET estado = app.normalize_expediente_documentos_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.liquidaciones
SET estado = app.normalize_liquidaciones_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.historial_pagos_planilla
SET estado = app.normalize_historial_pagos_planilla_estado_251(estado::text)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_beneficios_tenant_estado_ci_runtime_251
ON public.beneficios (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capacitaciones_tenant_estado_ci_runtime_251
ON public.capacitaciones (tenant_id, estado, fecha_inicio DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_horarios_trabajo_tenant_estado_ci_runtime_251
ON public.horarios_trabajo (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_empleado_beneficios_tenant_estado_ci_runtime_251
ON public.empleado_beneficios (tenant_id, id_empleado, estado, fecha_inicio DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_capacitaciones_tenant_estado_ci_runtime_251
ON public.empleado_capacitaciones (tenant_id, id_empleado, estado, fecha_inscripcion DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_horarios_tenant_estado_ci_runtime_251
ON public.empleado_horarios (tenant_id, id_empleado, estado, fecha_inicio DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expediente_documentos_tenant_estado_ci_runtime_251
ON public.expediente_documentos (tenant_id, id_empleado, estado, fecha_subida DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidaciones_tenant_estado_ci_runtime_251
ON public.liquidaciones (tenant_id, estado, fecha_terminacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_tenant_estado_ci_runtime_251
ON public.historial_pagos_planilla (tenant_id, estado, fecha DESC, created_at DESC);

COMMIT;
