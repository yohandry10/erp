-- ============================================================================
-- 025__upsert_integrity_inventory_and_rls_helpers.sql
-- Cierra brechas de upsert/runtime en inventario/logística y repone helpers
-- históricos de RLS para administración operacional.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- pedido_backorders: columnas usadas por logística + clave de upsert real
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedido_backorders
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad_comprometida numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_despachada numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS almacen_id uuid;

ALTER TABLE IF EXISTS public.pedido_backorders
  ALTER COLUMN cantidad_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_pendiente::text),
  ALTER COLUMN cantidad_comprometida TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_comprometida::text),
  ALTER COLUMN cantidad_despachada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_despachada::text);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_backorders_detalle_id
ON public.pedido_backorders (detalle_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_tenant_pedido_detalle
ON public.pedido_backorders (tenant_id, pedido_id, detalle_id);

SELECT app.add_fk_if_possible('pedido_backorders', 'pedido_id', 'pedidos_venta', 'id', 'fk_pedido_backorders_pedido_id');
SELECT app.add_fk_if_possible('pedido_backorders', 'detalle_id', 'pedidos_venta_detalle', 'id', 'fk_pedido_backorders_detalle_id');
SELECT app.add_fk_if_possible('pedido_backorders', 'producto_id', 'productos', 'id', 'fk_pedido_backorders_producto_id');
SELECT app.add_fk_if_possible('pedido_backorders', 'almacen_id', 'almacenes', 'id', 'fk_pedido_backorders_almacen_id');

-- ----------------------------------------------------------------------------
-- producto_precios_sucursal: columnas y unicidad para onConflict runtime
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.producto_precios_sucursal
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS precio numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.producto_precios_sucursal
  ALTER COLUMN precio TYPE numeric(14,2) USING app.to_numeric_or_zero(precio::text),
  ALTER COLUMN precio SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_precios_sucursal_producto_sucursal_moneda
ON public.producto_precios_sucursal (producto_id, sucursal_id, moneda) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_producto_precios_sucursal_tenant_producto
ON public.producto_precios_sucursal (tenant_id, producto_id);

SELECT app.add_fk_if_possible('producto_precios_sucursal', 'producto_id', 'productos', 'id', 'fk_producto_precios_sucursal_producto_id');
SELECT app.add_fk_if_possible('producto_precios_sucursal', 'sucursal_id', 'sucursales', 'id', 'fk_producto_precios_sucursal_sucursal_id');

-- ----------------------------------------------------------------------------
-- producto_stock_sucursal: columnas + normalización alias stock/stock_actual
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.producto_stock_sucursal
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid,
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS stock numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_actual numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reservado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.producto_stock_sucursal
  ALTER COLUMN stock TYPE numeric(14,2) USING app.to_numeric_or_zero(stock::text),
  ALTER COLUMN stock_actual TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_actual::text),
  ALTER COLUMN reservado TYPE numeric(14,2) USING app.to_numeric_or_zero(reservado::text),
  ALTER COLUMN minimo TYPE numeric(14,2) USING app.to_numeric_or_zero(minimo::text),
  ALTER COLUMN stock SET DEFAULT 0,
  ALTER COLUMN stock_actual SET DEFAULT 0,
  ALTER COLUMN reservado SET DEFAULT 0,
  ALTER COLUMN minimo SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.producto_stock_sucursal
SET
  stock_actual = COALESCE(stock_actual, stock, 0),
  stock = COALESCE(stock, stock_actual, 0),
  reservado = COALESCE(reservado, 0),
  minimo = COALESCE(minimo, 0)
WHERE
  stock_actual IS NULL
  OR stock IS NULL
  OR reservado IS NULL
  OR minimo IS NULL;

CREATE OR REPLACE FUNCTION app.sync_producto_stock_sucursal_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.stock := COALESCE(NEW.stock, NEW.stock_actual, 0);
  NEW.stock_actual := COALESCE(NEW.stock_actual, NEW.stock, 0);
  NEW.reservado := COALESCE(NEW.reservado, 0);
  NEW.minimo := COALESCE(NEW.minimo, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producto_stock_sucursal_aliases ON public.producto_stock_sucursal;
CREATE TRIGGER trg_sync_producto_stock_sucursal_aliases
BEFORE INSERT OR UPDATE OF stock, stock_actual, reservado, minimo
ON public.producto_stock_sucursal
FOR EACH ROW
EXECUTE FUNCTION app.sync_producto_stock_sucursal_aliases();

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_stock_sucursal_producto_sucursal_almacen
ON public.producto_stock_sucursal (producto_id, sucursal_id, almacen_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_producto_stock_sucursal_tenant_producto_sucursal
ON public.producto_stock_sucursal (tenant_id, producto_id, sucursal_id);

SELECT app.add_fk_if_possible('producto_stock_sucursal', 'producto_id', 'productos', 'id', 'fk_producto_stock_sucursal_producto_id');
SELECT app.add_fk_if_possible('producto_stock_sucursal', 'sucursal_id', 'sucursales', 'id', 'fk_producto_stock_sucursal_sucursal_id');
SELECT app.add_fk_if_possible('producto_stock_sucursal', 'almacen_id', 'almacenes', 'id', 'fk_producto_stock_sucursal_almacen_id');

-- ----------------------------------------------------------------------------
-- configuracion_caja: upsert null-safe para tenant+caja (caja_id puede ser NULL)
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_configuracion_caja_tenant_default;
DROP INDEX IF EXISTS public.ux_configuracion_caja_tenant_caja;

CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_caja_tenant_caja
ON public.configuracion_caja (tenant_id, caja_id) NULLS NOT DISTINCT;

-- ----------------------------------------------------------------------------
-- Helpers históricos (025) para operaciones administrativas de RLS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_tenant_id_if_missing(p_table_name text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_table_exists boolean;
  v_has_tenant_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = p_table_name
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = 'tenant_id'
  ) INTO v_has_tenant_id;

  IF v_has_tenant_id THEN
    RETURN false;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid', p_table_name);

  PERFORM app.add_fk_if_possible(
    p_table_name,
    'tenant_id',
    'tenants',
    'id',
    left(format('fk_%s_tenant_id', p_table_name), 63)
  );

  PERFORM app.add_index_if_possible(
    p_table_name,
    'tenant_id',
    left(format('idx_%s_tenant_id', p_table_name), 63)
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_rls_tenant_isolation(p_table_name text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_table_exists boolean;
  v_has_tenant_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = p_table_name
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = 'tenant_id'
  ) INTO v_has_tenant_id;

  IF NOT v_has_tenant_id THEN
    RETURN false;
  END IF;

  PERFORM app.apply_tenant_policy('public', p_table_name);
  RETURN true;
END;
$$;

COMMIT;
