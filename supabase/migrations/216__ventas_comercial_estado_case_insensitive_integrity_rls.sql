-- ============================================================================
-- 216__ventas_comercial_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en Ventas comercial.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
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
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS ck_cotizaciones_estado_valid;
ALTER TABLE public.cotizaciones
  ADD CONSTRAINT ck_cotizaciones_estado_valid
  CHECK (lower(estado::text) IN ('borrador', 'enviada', 'aprobada', 'rechazada', 'convertida', 'vencida')) NOT VALID;

ALTER TABLE public.pedidos_venta DROP CONSTRAINT IF EXISTS ck_pedidos_venta_estado_valid;
ALTER TABLE public.pedidos_venta
  ADD CONSTRAINT ck_pedidos_venta_estado_valid
  CHECK (
    lower(estado::text) IN (
      'pendiente', 'pendiente_aprobacion', 'confirmado', 'en_preparacion',
      'listo_despacho', 'despacho_parcial', 'listo_facturar',
      'facturado', 'completado', 'completado_con_gre', 'cancelado'
    )
  ) NOT VALID;

ALTER TABLE public.pedidos_venta DROP CONSTRAINT IF EXISTS ck_pedidos_venta_requiere_aprobacion_consistency;
ALTER TABLE public.pedidos_venta
  ADD CONSTRAINT ck_pedidos_venta_requiere_aprobacion_consistency
  CHECK (lower(estado::text) <> 'pendiente_aprobacion' OR COALESCE(requiere_aprobacion, false) = true) NOT VALID;

ALTER TABLE public.pedidos_venta_detalle DROP CONSTRAINT IF EXISTS ck_pedidos_venta_detalle_estado_item_valid;
ALTER TABLE public.pedidos_venta_detalle
  ADD CONSTRAINT ck_pedidos_venta_detalle_estado_item_valid
  CHECK (lower(estado_item::text) IN ('pendiente', 'parcial', 'despachado', 'facturado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual en columnas de estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cotizaciones
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.pedidos_venta
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.pedidos_venta_detalle
  ALTER COLUMN estado_item SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_estado_valid;
ALTER TABLE public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_estado_valid;
ALTER TABLE public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_requiere_aprobacion_consistency;
ALTER TABLE public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_estado_item_valid;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cotizaciones');
SELECT app.apply_tenant_policy('public', 'cotizacion_detalles');
SELECT app.apply_tenant_policy('public', 'pedidos_venta');
SELECT app.apply_tenant_policy('public', 'pedidos_venta_detalle');

COMMIT;
