-- ============================================================================
-- 215__ventas_comercial_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados del vertical Ventas comercial:
-- cotizaciones, pedidos_venta, pedidos_venta_detalle.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cotizaciones_estado_215(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));
  IF v_estado = 'PENDIENTE' THEN v_estado := 'ENVIADA'; END IF;
  IF v_estado IN ('ACEPTADA', 'APROBADO') THEN v_estado := 'APROBADA'; END IF;
  IF v_estado = 'RECHAZADO' THEN v_estado := 'RECHAZADA'; END IF;
  IF v_estado = 'CONVERTIDO' THEN v_estado := 'CONVERTIDA'; END IF;
  IF v_estado = 'VENCIDO' THEN v_estado := 'VENCIDA'; END IF;
  IF v_estado NOT IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'CONVERTIDA', 'VENCIDA') THEN
    v_estado := 'BORRADOR';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_pedidos_venta_estado_215(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'BORRADOR' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'APROBADO' THEN v_estado := 'CONFIRMADO'; END IF;
  IF v_estado IN ('RECHAZADO', 'ANULADO') THEN v_estado := 'CANCELADO'; END IF;
  IF v_estado = 'DESPACHADO' THEN v_estado := 'LISTO_FACTURAR'; END IF;
  IF v_estado = 'COMPLETO' THEN v_estado := 'COMPLETADO'; END IF;
  IF v_estado NOT IN (
    'PENDIENTE', 'PENDIENTE_APROBACION', 'CONFIRMADO', 'EN_PREPARACION',
    'LISTO_DESPACHO', 'DESPACHO_PARCIAL', 'LISTO_FACTURAR', 'FACTURADO',
    'COMPLETADO', 'COMPLETADO_CON_GRE', 'CANCELADO'
  ) THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_pedidos_venta_detalle_estado_item_215(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'COMPLETADO' THEN v_estado := 'FACTURADO'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'DESPACHADO', 'FACTURADO') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cotizaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_cotizaciones_estado_215(estado::text);

ALTER TABLE public.pedidos_venta
  ALTER COLUMN estado TYPE citext
  USING app.normalize_pedidos_venta_estado_215(estado::text);

ALTER TABLE public.pedidos_venta_detalle
  ALTER COLUMN estado_item TYPE citext
  USING app.normalize_pedidos_venta_detalle_estado_item_215(estado_item::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo posterior a cambio de tipo.
-- ----------------------------------------------------------------------------
UPDATE public.cotizaciones t
SET estado = app.normalize_cotizaciones_estado_215(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.pedidos_venta t
SET estado = app.normalize_pedidos_venta_estado_215(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.pedidos_venta_detalle t
SET estado_item = app.normalize_pedidos_venta_detalle_estado_item_215(t.estado_item::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices de soporte por estado case-insensitive.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_estado_ci_runtime_215
ON public.cotizaciones (tenant_id, estado, fecha_cotizacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_estado_ci_runtime_215
ON public.pedidos_venta (tenant_id, estado, fecha_pedido DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_tenant_estado_item_ci_runtime_215
ON public.pedidos_venta_detalle (tenant_id, estado_item, pedido_id, created_at DESC);

COMMIT;
