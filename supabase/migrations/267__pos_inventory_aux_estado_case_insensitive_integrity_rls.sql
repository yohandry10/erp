-- ============================================================================
-- 267__pos_inventory_aux_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en
-- POS/inventario auxiliar.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints de estado en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_caja DROP CONSTRAINT IF EXISTS ck_configuracion_caja_estado_runtime;
ALTER TABLE public.configuracion_caja
  ADD CONSTRAINT ck_configuracion_caja_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'bloqueada')) NOT VALID;

ALTER TABLE public.detalle_ventas_pos DROP CONSTRAINT IF EXISTS ck_detalle_ventas_pos_estado_runtime;
ALTER TABLE public.detalle_ventas_pos
  ADD CONSTRAINT ck_detalle_ventas_pos_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'pendiente', 'confirmado', 'anulado', 'devuelto')) NOT VALID;

ALTER TABLE public.producto_existencias DROP CONSTRAINT IF EXISTS ck_producto_existencias_estado_runtime;
ALTER TABLE public.producto_existencias
  ADD CONSTRAINT ck_producto_existencias_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'bloqueado')) NOT VALID;

ALTER TABLE public.eventos_pos DROP CONSTRAINT IF EXISTS ck_eventos_pos_estado_runtime;
ALTER TABLE public.eventos_pos
  ADD CONSTRAINT ck_eventos_pos_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'anulado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_caja ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.detalle_ventas_pos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.producto_existencias ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.eventos_pos ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_caja VALIDATE CONSTRAINT ck_configuracion_caja_estado_runtime;
ALTER TABLE public.detalle_ventas_pos VALIDATE CONSTRAINT ck_detalle_ventas_pos_estado_runtime;
ALTER TABLE public.producto_existencias VALIDATE CONSTRAINT ck_producto_existencias_estado_runtime;
ALTER TABLE public.eventos_pos VALIDATE CONSTRAINT ck_eventos_pos_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'configuracion_caja');
SELECT app.apply_tenant_policy('public', 'detalle_ventas_pos');
SELECT app.apply_tenant_policy('public', 'producto_existencias');
SELECT app.apply_tenant_policy('public', 'eventos_pos');

COMMIT;
