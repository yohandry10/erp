-- ============================================================================
-- 270__inventario_core_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS de estado case-insensitive en inventario core.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.productos
SET estado = app.normalize_productos_estado_269(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.almacenes
SET estado = app.normalize_almacenes_estado_269(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.almacen_ubicaciones
SET estado = app.normalize_almacen_ubicaciones_estado_269(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.movimientos_inventario
SET estado = app.normalize_movimientos_inventario_estado_269(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.stock_movimientos
SET estado = app.normalize_stock_movimientos_estado_269(estado::text)
WHERE tenant_id IS NOT NULL;

UPDATE public.producto_stock_sucursal
SET estado = app.normalize_producto_stock_sucursal_estado_269(estado::text)
WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de estado en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS ck_productos_estado_runtime;
ALTER TABLE public.productos
  ADD CONSTRAINT ck_productos_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'bloqueado', 'descontinuado')) NOT VALID;

ALTER TABLE public.almacenes DROP CONSTRAINT IF EXISTS ck_almacenes_estado_runtime;
ALTER TABLE public.almacenes
  ADD CONSTRAINT ck_almacenes_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'mantenimiento', 'bloqueado')) NOT VALID;

ALTER TABLE public.almacen_ubicaciones DROP CONSTRAINT IF EXISTS ck_almacen_ubicaciones_estado_runtime;
ALTER TABLE public.almacen_ubicaciones
  ADD CONSTRAINT ck_almacen_ubicaciones_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'bloqueado')) NOT VALID;

ALTER TABLE public.movimientos_inventario DROP CONSTRAINT IF EXISTS ck_movimientos_inventario_estado_runtime;
ALTER TABLE public.movimientos_inventario
  ADD CONSTRAINT ck_movimientos_inventario_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'pendiente', 'aplicado', 'anulado', 'error')) NOT VALID;

ALTER TABLE public.stock_movimientos DROP CONSTRAINT IF EXISTS ck_stock_movimientos_estado_runtime;
ALTER TABLE public.stock_movimientos
  ADD CONSTRAINT ck_stock_movimientos_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'pendiente', 'aplicado', 'anulado', 'error')) NOT VALID;

ALTER TABLE public.producto_stock_sucursal DROP CONSTRAINT IF EXISTS ck_producto_stock_sucursal_estado_runtime;
ALTER TABLE public.producto_stock_sucursal
  ADD CONSTRAINT ck_producto_stock_sucursal_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'bloqueado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual.
-- ----------------------------------------------------------------------------
ALTER TABLE public.productos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.almacenes ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.almacen_ubicaciones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.movimientos_inventario ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.stock_movimientos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.producto_stock_sucursal ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.productos VALIDATE CONSTRAINT ck_productos_estado_runtime;
ALTER TABLE public.almacenes VALIDATE CONSTRAINT ck_almacenes_estado_runtime;
ALTER TABLE public.almacen_ubicaciones VALIDATE CONSTRAINT ck_almacen_ubicaciones_estado_runtime;
ALTER TABLE public.movimientos_inventario VALIDATE CONSTRAINT ck_movimientos_inventario_estado_runtime;
ALTER TABLE public.stock_movimientos VALIDATE CONSTRAINT ck_stock_movimientos_estado_runtime;
ALTER TABLE public.producto_stock_sucursal VALIDATE CONSTRAINT ck_producto_stock_sucursal_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'productos');
SELECT app.apply_tenant_policy('public', 'almacenes');
SELECT app.apply_tenant_policy('public', 'almacen_ubicaciones');
SELECT app.apply_tenant_policy('public', 'movimientos_inventario');
SELECT app.apply_tenant_policy('public', 'stock_movimientos');
SELECT app.apply_tenant_policy('public', 'producto_stock_sucursal');

COMMIT;
