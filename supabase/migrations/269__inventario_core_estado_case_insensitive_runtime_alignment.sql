-- ============================================================================
-- 269__inventario_core_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en inventario core.
-- Tablas foco:
--   public.productos
--   public.almacenes
--   public.almacen_ubicaciones
--   public.movimientos_inventario
--   public.stock_movimientos
--   public.producto_stock_sucursal
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion por tabla.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_productos_estado_269(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE') THEN v := 'ACTIVO'; END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'BAJA') THEN v := 'INACTIVO'; END IF;
  IF v IN ('BLOCKED', 'BLOQUEADA') THEN v := 'BLOQUEADO'; END IF;
  IF v = 'DISCONTINUED' THEN v := 'DESCONTINUADO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'DESCONTINUADO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_almacenes_estado_269(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ENABLED', 'HABILITADO') THEN v := 'ACTIVO'; END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'CERRADO') THEN v := 'INACTIVO'; END IF;
  IF v IN ('BLOCKED', 'BLOQUEADA') THEN v := 'BLOQUEADO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'MANTENIMIENTO', 'BLOQUEADO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_almacen_ubicaciones_estado_269(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ENABLED', 'HABILITADO') THEN v := 'ACTIVO'; END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'CERRADO') THEN v := 'INACTIVO'; END IF;
  IF v IN ('BLOCKED', 'BLOQUEADA') THEN v := 'BLOQUEADO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_movimientos_inventario_estado_269(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('PENDING', 'EN_COLA') THEN v := 'PENDIENTE'; END IF;
  IF v IN ('APPLIED', 'COMPLETADO') THEN v := 'APLICADO'; END IF;
  IF v IN ('CANCELADO') THEN v := 'ANULADO'; END IF;
  IF v = 'FAILED' THEN v := 'ERROR'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'APLICADO', 'ANULADO', 'ERROR') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_stock_movimientos_estado_269(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('PENDING', 'EN_COLA') THEN v := 'PENDIENTE'; END IF;
  IF v IN ('APPLIED', 'COMPLETADO') THEN v := 'APLICADO'; END IF;
  IF v IN ('CANCELADO') THEN v := 'ANULADO'; END IF;
  IF v = 'FAILED' THEN v := 'ERROR'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'APLICADO', 'ANULADO', 'ERROR') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_producto_stock_sucursal_estado_269(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ENABLED', 'HABILITADO') THEN v := 'ACTIVO'; END IF;
  IF v IN ('DISABLED', 'DESHABILITADO') THEN v := 'INACTIVO'; END IF;
  IF v IN ('BLOCKED', 'BLOQUEADA') THEN v := 'BLOQUEADO'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Triggers de normalizacion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_productos_row_269()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_productos_estado_269(NEW.estado::text);
  IF NEW.activo IS NULL THEN
    NEW.activo := (lower(NEW.estado::text) = 'activo');
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_almacenes_row_269()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_almacenes_estado_269(NEW.estado::text);
  IF NEW.activo IS NULL THEN
    NEW.activo := (lower(NEW.estado::text) = 'activo');
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_almacen_ubicaciones_row_269()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_almacen_ubicaciones_estado_269(NEW.estado::text);
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_movimientos_inventario_row_269()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_movimientos_inventario_estado_269(NEW.estado::text);
  IF NEW.activo IS NULL THEN
    NEW.activo := (lower(NEW.estado::text) IN ('activo', 'aplicado', 'pendiente'));
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_stock_movimientos_row_269()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_stock_movimientos_estado_269(NEW.estado::text);
  IF NEW.activo IS NULL THEN
    NEW.activo := (lower(NEW.estado::text) IN ('activo', 'aplicado', 'pendiente'));
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_producto_stock_sucursal_row_269()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_producto_stock_sucursal_estado_269(NEW.estado::text);
  IF NEW.activo IS NULL THEN
    NEW.activo := (lower(NEW.estado::text) = 'activo');
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion a citext.
-- ----------------------------------------------------------------------------
ALTER TABLE public.productos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_productos_estado_269(estado::text);

ALTER TABLE public.almacenes
  ALTER COLUMN estado TYPE citext
  USING app.normalize_almacenes_estado_269(estado::text);

ALTER TABLE public.almacen_ubicaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_almacen_ubicaciones_estado_269(estado::text);

ALTER TABLE public.movimientos_inventario
  ALTER COLUMN estado TYPE citext
  USING app.normalize_movimientos_inventario_estado_269(estado::text);

ALTER TABLE public.stock_movimientos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_stock_movimientos_estado_269(estado::text);

ALTER TABLE public.producto_stock_sucursal
  ALTER COLUMN estado TYPE citext
  USING app.normalize_producto_stock_sucursal_estado_269(estado::text);

-- ----------------------------------------------------------------------------
-- Defaults de estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.productos ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;
ALTER TABLE public.almacenes ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;
ALTER TABLE public.almacen_ubicaciones ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;
ALTER TABLE public.movimientos_inventario ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;
ALTER TABLE public.stock_movimientos ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;
ALTER TABLE public.producto_stock_sucursal ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

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
-- Activar triggers de normalizacion.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_normalize_productos_row ON public.productos;
CREATE TRIGGER trg_normalize_productos_row
BEFORE INSERT OR UPDATE ON public.productos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_productos_row_269();

DROP TRIGGER IF EXISTS trg_normalize_almacenes_row ON public.almacenes;
CREATE TRIGGER trg_normalize_almacenes_row
BEFORE INSERT OR UPDATE ON public.almacenes
FOR EACH ROW
EXECUTE FUNCTION app.normalize_almacenes_row_269();

DROP TRIGGER IF EXISTS trg_normalize_almacen_ubicaciones_row ON public.almacen_ubicaciones;
CREATE TRIGGER trg_normalize_almacen_ubicaciones_row
BEFORE INSERT OR UPDATE ON public.almacen_ubicaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_almacen_ubicaciones_row_269();

DROP TRIGGER IF EXISTS trg_normalize_movimientos_inventario_row ON public.movimientos_inventario;
CREATE TRIGGER trg_normalize_movimientos_inventario_row
BEFORE INSERT OR UPDATE ON public.movimientos_inventario
FOR EACH ROW
EXECUTE FUNCTION app.normalize_movimientos_inventario_row_269();

DROP TRIGGER IF EXISTS trg_normalize_stock_movimientos_row ON public.stock_movimientos;
CREATE TRIGGER trg_normalize_stock_movimientos_row
BEFORE INSERT OR UPDATE ON public.stock_movimientos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_stock_movimientos_row_269();

DROP TRIGGER IF EXISTS trg_normalize_producto_stock_sucursal_row ON public.producto_stock_sucursal;
CREATE TRIGGER trg_normalize_producto_stock_sucursal_row
BEFORE INSERT OR UPDATE ON public.producto_stock_sucursal
FOR EACH ROW
EXECUTE FUNCTION app.normalize_producto_stock_sucursal_row_269();

-- ----------------------------------------------------------------------------
-- Indices runtime CI por tenant+estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_productos_tenant_estado_ci_runtime_269
ON public.productos (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_almacenes_tenant_estado_ci_runtime_269
ON public.almacenes (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_almacen_ubicaciones_tenant_estado_ci_runtime_269
ON public.almacen_ubicaciones (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tenant_estado_ci_runtime_269
ON public.movimientos_inventario (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movimientos_tenant_estado_ci_runtime_269
ON public.stock_movimientos (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_producto_stock_sucursal_tenant_estado_ci_runtime_269
ON public.producto_stock_sucursal (tenant_id, estado, updated_at DESC);

COMMIT;
