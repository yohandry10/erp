-- ============================================================================
-- 209__finanzas_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en finanzas:
-- cuentas_por_cobrar, cuentas_por_pagar y conciliaciones_bancarias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cxc_estado_209(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('ACTIVO', 'EMITIDO', 'PENDIENTE') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;

  IF v IN ('PARCIAL', 'PAGO_PARCIAL') THEN
    RETURN 'PARCIAL'::citext;
  END IF;

  IF v IN ('CANCELADO', 'CANCELADA', 'COBRADA', 'PAGADA') THEN
    RETURN 'CANCELADO'::citext;
  END IF;

  IF v IN ('VENCIDA', 'VENCIDO', 'MOROSA') THEN
    RETURN 'VENCIDA'::citext;
  END IF;

  IF v IN ('ANULADA', 'ANULADO') THEN
    RETURN 'ANULADA'::citext;
  END IF;

  IF v IN ('REVERTIDA', 'REVERTIDO', 'REVERSADA', 'REVERSADO') THEN
    RETURN 'REVERTIDA'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_cxp_estado_209(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('ACTIVO', 'ABIERTA', 'EMITIDO', 'PENDIENTE') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;

  IF v IN ('PARCIAL', 'PAGO_PARCIAL') THEN
    RETURN 'PARCIAL'::citext;
  END IF;

  IF v IN ('PAGADA', 'CANCELADO', 'CANCELADA', 'COBRADA') THEN
    RETURN 'PAGADA'::citext;
  END IF;

  IF v IN ('VENCIDA', 'VENCIDO', 'MOROSA') THEN
    RETURN 'VENCIDA'::citext;
  END IF;

  IF v IN ('ANULADA', 'ANULADO') THEN
    RETURN 'ANULADA'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_cxp_estado_comparacion_209(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('PENDIENTE', 'PENDING') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;
  IF v IN ('OK', 'MATCH', 'COINCIDE') THEN
    RETURN 'OK'::citext;
  END IF;
  IF v IN ('DESVIACION_CANTIDAD', 'DIFERENCIA_CANTIDAD') THEN
    RETURN 'DESVIACION_CANTIDAD'::citext;
  END IF;
  IF v IN ('DESVIACION_PRECIO', 'DIFERENCIA_PRECIO') THEN
    RETURN 'DESVIACION_PRECIO'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_conciliacion_estado_209(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'ABIERTA'));
BEGIN
  IF v IN ('ABIERTA', 'ABIERTO', 'OPEN') THEN
    RETURN 'ABIERTA'::citext;
  END IF;

  IF v IN ('EN_PROCESO', 'EN PROCESO', 'PROCESANDO', 'IN_PROGRESS') THEN
    RETURN 'EN_PROCESO'::citext;
  END IF;

  IF v IN ('CERRADA', 'CERRADO', 'CLOSED', 'FINALIZADA', 'FINALIZADO') THEN
    RETURN 'CERRADA'::citext;
  END IF;

  RETURN 'ABIERTA'::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Alineacion de tipos a citext para filtros case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ALTER COLUMN estado TYPE citext USING app.normalize_cxc_estado_209(estado::text),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext;

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ALTER COLUMN estado TYPE citext USING app.normalize_cxp_estado_209(estado::text),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext,
  ALTER COLUMN estado_comparacion TYPE citext USING app.normalize_cxp_estado_comparacion_209(estado_comparacion::text),
  ALTER COLUMN estado_comparacion SET DEFAULT 'PENDIENTE'::citext;

ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  ALTER COLUMN estado TYPE citext USING app.normalize_conciliacion_estado_209(estado::text),
  ALTER COLUMN estado SET DEFAULT 'ABIERTA'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo para consolidar estados.
-- ----------------------------------------------------------------------------
UPDATE public.cuentas_por_cobrar c
SET
  estado = app.normalize_cxc_estado_209(c.estado::text),
  updated_at = now()
WHERE c.id IS NOT NULL;

UPDATE public.cuentas_por_pagar c
SET
  estado = app.normalize_cxp_estado_209(c.estado::text),
  estado_comparacion = app.normalize_cxp_estado_comparacion_209(c.estado_comparacion::text),
  updated_at = now()
WHERE c.id IS NOT NULL;

UPDATE public.conciliaciones_bancarias c
SET
  estado = app.normalize_conciliacion_estado_209(c.estado::text),
  updated_at = now()
WHERE c.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime de soporte para filtros por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cxc_tenant_estado_ci_runtime_209
ON public.cuentas_por_cobrar (tenant_id, estado, fecha_vencimiento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cxp_tenant_estado_ci_runtime_209
ON public.cuentas_por_pagar (tenant_id, estado, fecha_vencimiento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cxp_tenant_estado_comparacion_ci_runtime_209
ON public.cuentas_por_pagar (tenant_id, estado_comparacion, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_tenant_estado_ci_runtime_209
ON public.conciliaciones_bancarias (tenant_id, estado, periodo, created_at DESC);

COMMIT;
