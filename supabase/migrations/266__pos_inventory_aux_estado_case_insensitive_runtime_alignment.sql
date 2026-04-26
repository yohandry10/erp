-- ============================================================================
-- 266__pos_inventory_aux_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en POS/inventario auxiliar.
-- Tablas foco:
--   public.configuracion_caja
--   public.detalle_ventas_pos
--   public.producto_existencias
--   public.eventos_pos
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado por tabla.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_configuracion_caja_estado_266(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ENABLED', 'OPEN', 'HABILITADO') THEN v := 'ACTIVO'; END IF;
  IF v IN ('DISABLED', 'CLOSED', 'DESHABILITADO', 'CERRADO') THEN v := 'INACTIVO'; END IF;
  IF v IN ('BLOCKED', 'BLOQUEO') THEN v := 'BLOQUEADA'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADA') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_detalle_ventas_pos_estado_266(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v = 'CONFIRMADA' THEN v := 'CONFIRMADO'; END IF;
  IF v = 'CANCELADO' THEN v := 'ANULADO'; END IF;
  IF v = 'DEVUELTA' THEN v := 'DEVUELTO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'CONFIRMADO', 'ANULADO', 'DEVUELTO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_producto_existencias_estado_266(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('BLOQUEADA', 'BLOCKED') THEN v := 'BLOQUEADO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_eventos_pos_estado_266(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v = 'CANCELADO' THEN v := 'ANULADO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'ANULADO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_caja
  ALTER COLUMN estado TYPE citext
  USING app.normalize_configuracion_caja_estado_266(estado::text);

ALTER TABLE public.detalle_ventas_pos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_detalle_ventas_pos_estado_266(estado::text);

ALTER TABLE public.producto_existencias
  ALTER COLUMN estado TYPE citext
  USING app.normalize_producto_existencias_estado_266(estado::text);

ALTER TABLE public.eventos_pos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_eventos_pos_estado_266(estado::text);

-- ----------------------------------------------------------------------------
-- Defaults.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_caja
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.detalle_ventas_pos
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.producto_existencias
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.eventos_pos
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_caja
SET estado = app.normalize_configuracion_caja_estado_266(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.detalle_ventas_pos
SET estado = app.normalize_detalle_ventas_pos_estado_266(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.producto_existencias
SET estado = app.normalize_producto_existencias_estado_266(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.eventos_pos
SET estado = app.normalize_eventos_pos_estado_266(estado::text)
WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime CI por tenant+estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant_estado_ci_runtime_266
ON public.configuracion_caja (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_tenant_estado_ci_runtime_266
ON public.detalle_ventas_pos (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant_estado_ci_runtime_266
ON public.producto_existencias (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_estado_ci_runtime_266
ON public.eventos_pos (tenant_id, estado, "timestamp" DESC);

COMMIT;
