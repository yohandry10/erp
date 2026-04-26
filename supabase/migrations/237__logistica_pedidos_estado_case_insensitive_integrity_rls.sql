-- ============================================================================
-- 237__logistica_pedidos_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en Logistica.
-- Tablas foco:
--   public.logistica_eventos
--   public.pedido_backorders
--   public.pedido_despachos
--   public.pedido_gres
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.logistica_eventos DROP CONSTRAINT IF EXISTS ck_logistica_eventos_estado_not_blank_runtime_236;
ALTER TABLE public.logistica_eventos
  ADD CONSTRAINT ck_logistica_eventos_estado_not_blank_runtime_236
  CHECK (estado IS NOT NULL AND btrim(estado::text) <> '') NOT VALID;

ALTER TABLE public.pedido_backorders DROP CONSTRAINT IF EXISTS ck_pedido_backorders_estado_valid;
ALTER TABLE public.pedido_backorders
  ADD CONSTRAINT ck_pedido_backorders_estado_valid
  CHECK (lower(estado::text) IN ('pendiente', 'parcial', 'cerrado')) NOT VALID;

ALTER TABLE public.pedido_despachos DROP CONSTRAINT IF EXISTS ck_pedido_despachos_estado_valid;
ALTER TABLE public.pedido_despachos
  ADD CONSTRAINT ck_pedido_despachos_estado_valid
  CHECK (lower(estado::text) IN ('registrado', 'anulado')) NOT VALID;

ALTER TABLE public.pedido_gres DROP CONSTRAINT IF EXISTS ck_pedido_gres_estado_valid;
ALTER TABLE public.pedido_gres
  ADD CONSTRAINT ck_pedido_gres_estado_valid
  CHECK (lower(estado::text) IN ('borrador', 'enviado', 'aceptado', 'rechazado', 'anulado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual para estados.
-- ----------------------------------------------------------------------------
ALTER TABLE public.logistica_eventos
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.pedido_backorders
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.pedido_despachos
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.pedido_gres
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.logistica_eventos VALIDATE CONSTRAINT ck_logistica_eventos_estado_not_blank_runtime_236;
ALTER TABLE public.pedido_backorders VALIDATE CONSTRAINT ck_pedido_backorders_estado_valid;
ALTER TABLE public.pedido_despachos VALIDATE CONSTRAINT ck_pedido_despachos_estado_valid;
ALTER TABLE public.pedido_gres VALIDATE CONSTRAINT ck_pedido_gres_estado_valid;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'logistica_eventos');
SELECT app.apply_tenant_policy('public', 'pedido_backorders');
SELECT app.apply_tenant_policy('public', 'pedido_despachos');
SELECT app.apply_tenant_policy('public', 'pedido_gres');

COMMIT;
