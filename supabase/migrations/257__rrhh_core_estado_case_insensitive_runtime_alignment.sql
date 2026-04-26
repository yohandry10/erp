-- ============================================================================
-- 257__rrhh_core_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en RRHH core.
-- Tablas foco:
--   public.departamentos
--   public.contratos
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado por dominio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_departamentos_estado_257(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'activo'));
  IF v = 'activa' OR v = 'vigente' THEN v := 'activo'; END IF;
  IF v = 'inactiva' OR v = 'baja' OR v = 'cesado' OR v = 'anulado' OR v = 'anulada' THEN v := 'inactivo'; END IF;
  IF v NOT IN ('activo', 'inactivo') THEN v := 'activo'; END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_contratos_estado_257(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'vigente'));
  IF v = 'activo' OR v = 'activa' THEN v := 'vigente'; END IF;
  IF v = 'inactivo' OR v = 'inactiva' THEN v := 'finalizado'; END IF;
  IF v = 'cancelado' OR v = 'cancelada' THEN v := 'anulado'; END IF;
  IF v = 'cerrado' OR v = 'cerrada' THEN v := 'terminado'; END IF;
  IF v NOT IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado') THEN
    v := 'vigente';
  END IF;
  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.departamentos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_departamentos_estado_257(estado::text);

ALTER TABLE public.contratos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_contratos_estado_257(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.departamentos
SET estado = app.normalize_departamentos_estado_257(estado::text)
WHERE id IS NOT NULL;

UPDATE public.contratos
SET estado = app.normalize_contratos_estado_257(estado::text)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_departamentos_tenant_estado_ci_runtime_257
ON public.departamentos (tenant_id, estado, nombre, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant_estado_ci_runtime_257
ON public.contratos (tenant_id, estado, fecha_inicio DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant_empleado_estado_ci_runtime_257
ON public.contratos (tenant_id, id_empleado, estado, fecha_inicio DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

COMMIT;
