-- ============================================================================
-- 236__logistica_pedidos_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en Logistica de pedidos.
-- Tablas foco:
--   public.logistica_eventos
--   public.pedido_backorders
--   public.pedido_despachos
--   public.pedido_gres
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_logistica_eventos_estado_236(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));

  IF v_estado IN ('INACTIVA', 'DISABLED', 'CERRADO', 'CERRADA') THEN v_estado := 'INACTIVO'; END IF;
  IF v_estado IN ('ACTIVA', 'EN_CURSO') THEN v_estado := 'ACTIVO'; END IF;

  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_pedido_backorders_estado_236(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));

  IF v_estado IN ('ACTIVO', 'ABIERTO') THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado IN ('DESPACHADO', 'COMPLETADO') THEN v_estado := 'CERRADO'; END IF;
  IF v_estado = 'PENDIENTE_PARCIAL' THEN v_estado := 'PARCIAL'; END IF;

  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'CERRADO') THEN
    v_estado := 'PENDIENTE';
  END IF;

  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_pedido_despachos_estado_236(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'REGISTRADO'));

  IF v_estado IN ('ACTIVO', 'CONFIRMADO') THEN v_estado := 'REGISTRADO'; END IF;
  IF v_estado IN ('CANCELADO', 'CANCELADA') THEN v_estado := 'ANULADO'; END IF;

  IF v_estado NOT IN ('REGISTRADO', 'ANULADO') THEN
    v_estado := 'REGISTRADO';
  END IF;

  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_pedido_gres_estado_236(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));

  IF v_estado IN ('ACTIVO', 'RELACIONADO', 'PENDIENTE') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado = 'ERROR' THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado = 'CANCELADO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado = 'EMITIDO' THEN v_estado := 'ENVIADO'; END IF;

  IF v_estado NOT IN ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN
    v_estado := 'BORRADOR';
  END IF;

  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.logistica_eventos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_logistica_eventos_estado_236(estado::text);

ALTER TABLE public.pedido_backorders
  ALTER COLUMN estado TYPE citext
  USING app.normalize_pedido_backorders_estado_236(estado::text);

ALTER TABLE public.pedido_despachos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_pedido_despachos_estado_236(estado::text);

ALTER TABLE public.pedido_gres
  ALTER COLUMN estado TYPE citext
  USING app.normalize_pedido_gres_estado_236(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.logistica_eventos le
SET estado = app.normalize_logistica_eventos_estado_236(le.estado::text)
WHERE le.id IS NOT NULL;

UPDATE public.pedido_backorders pb
SET estado = app.normalize_pedido_backorders_estado_236(pb.estado::text)
WHERE pb.id IS NOT NULL;

UPDATE public.pedido_despachos pd
SET estado = app.normalize_pedido_despachos_estado_236(pd.estado::text)
WHERE pd.id IS NOT NULL;

UPDATE public.pedido_gres pg
SET estado = app.normalize_pedido_gres_estado_236(pg.estado::text)
WHERE pg.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado (CI).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_logistica_eventos_tenant_estado_ci_runtime_236
ON public.logistica_eventos (tenant_id, estado, registrado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_tenant_estado_ci_runtime_236
ON public.pedido_backorders (tenant_id, estado, prioridad, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_despachos_tenant_estado_ci_runtime_236
ON public.pedido_despachos (tenant_id, estado, registrado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_gres_tenant_estado_ci_runtime_236
ON public.pedido_gres (tenant_id, estado, creado_en DESC);

COMMIT;
