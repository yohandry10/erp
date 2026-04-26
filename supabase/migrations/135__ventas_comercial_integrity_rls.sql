-- ============================================================================
-- 135__ventas_comercial_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para ventas comercial.
-- Tablas: cotizaciones, cotizacion_detalles, pedidos_venta, pedidos_venta_detalle.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.cotizaciones c
SET tenant_id = cl.tenant_id
FROM public.clientes cl
WHERE c.cliente_id = cl.id
  AND cl.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> cl.tenant_id);

UPDATE public.pedidos_venta p
SET tenant_id = cl.tenant_id
FROM public.clientes cl
WHERE p.cliente_id = cl.id
  AND cl.tenant_id IS NOT NULL
  AND (p.tenant_id IS NULL OR p.tenant_id <> cl.tenant_id);

UPDATE public.pedidos_venta p
SET tenant_id = c.tenant_id
FROM public.cotizaciones c
WHERE p.cotizacion_id = c.id
  AND c.tenant_id IS NOT NULL
  AND p.tenant_id IS NULL;

UPDATE public.cotizacion_detalles cd
SET tenant_id = c.tenant_id
FROM public.cotizaciones c
WHERE cd.cotizacion_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (cd.tenant_id IS NULL OR cd.tenant_id <> c.tenant_id);

UPDATE public.pedidos_venta_detalle pd
SET tenant_id = p.tenant_id
FROM public.pedidos_venta p
WHERE pd.pedido_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (pd.tenant_id IS NULL OR pd.tenant_id <> p.tenant_id);

UPDATE public.cotizaciones c
SET pedido_id = p.id
FROM public.pedidos_venta p
WHERE p.cotizacion_id = c.id
  AND (c.pedido_id IS NULL OR c.pedido_id = p.id);

-- ----------------------------------------------------------------------------
-- FKs para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('cotizaciones', 'cliente_id', 'clientes', 'id', 'cotizaciones_cliente_id_fkey');
SELECT app.add_fk_if_possible('cotizaciones', 'pedido_id', 'pedidos_venta', 'id', 'cotizaciones_pedido_id_fkey');
SELECT app.add_fk_if_possible('cotizacion_detalles', 'cotizacion_id', 'cotizaciones', 'id', 'cotizacion_detalles_cotizacion_id_fkey');
SELECT app.add_fk_if_possible('cotizacion_detalles', 'producto_id', 'productos', 'id', 'cotizacion_detalles_producto_id_fkey');
SELECT app.add_fk_if_possible('pedidos_venta', 'cliente_id', 'clientes', 'id', 'pedidos_venta_cliente_id_fkey');
SELECT app.add_fk_if_possible('pedidos_venta', 'cotizacion_id', 'cotizaciones', 'id', 'pedidos_venta_cotizacion_id_fkey');
SELECT app.add_fk_if_possible('pedidos_venta_detalle', 'pedido_id', 'pedidos_venta', 'id', 'pedidos_venta_detalle_pedido_id_fkey');
SELECT app.add_fk_if_possible('pedidos_venta_detalle', 'producto_id', 'productos', 'id', 'pedidos_venta_detalle_producto_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar índices únicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    c.numero,
    row_number() OVER (
      PARTITION BY c.tenant_id, upper(btrim(c.numero))
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cotizaciones c
  WHERE c.tenant_id IS NOT NULL
    AND c.numero IS NOT NULL
    AND btrim(c.numero) <> ''
)
UPDATE public.cotizaciones c
SET numero = format('%s-DUP-%s', upper(btrim(r.numero)), r.rn),
    updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    p.id,
    p.numero,
    row_number() OVER (
      PARTITION BY p.tenant_id, upper(btrim(p.numero))
      ORDER BY COALESCE(p.updated_at, p.created_at, now()) DESC, p.id::text DESC
    ) AS rn
  FROM public.pedidos_venta p
  WHERE p.tenant_id IS NOT NULL
    AND p.numero IS NOT NULL
    AND btrim(p.numero) <> ''
)
UPDATE public.pedidos_venta p
SET numero = format('%s-DUP-%s', upper(btrim(r.numero)), r.rn),
    updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ordered AS (
  SELECT
    cd.id,
    row_number() OVER (
      PARTITION BY cd.tenant_id, cd.cotizacion_id
      ORDER BY COALESCE(cd.orden, 2147483647), COALESCE(cd.created_at, now()), cd.id::text
    ) AS new_orden
  FROM public.cotizacion_detalles cd
  WHERE cd.tenant_id IS NOT NULL
    AND cd.cotizacion_id IS NOT NULL
)
UPDATE public.cotizacion_detalles cd
SET orden = o.new_orden,
    updated_at = now()
FROM ordered o
WHERE cd.id = o.id
  AND cd.orden IS DISTINCT FROM o.new_orden;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cotizaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant FROM public.clientes c WHERE c.id = NEW.cliente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cliente en cotizaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.pedido_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Pedido no existe: %s', NEW.pedido_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con pedido en cotizaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en cotizaciones', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cotizaciones_tenant_consistency ON public.cotizaciones;
CREATE TRIGGER trg_enforce_cotizaciones_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cliente_id, pedido_id
ON public.cotizaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cotizaciones_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_cotizacion_detalles_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.cotizacion_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'cotizacion_id es obligatorio en cotizacion_detalles', ERRCODE = '23514';
  END IF;

  SELECT c.tenant_id INTO v_ref_tenant FROM public.cotizaciones c WHERE c.id = NEW.cotizacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Cotización no existe: %s', NEW.cotizacion_id), ERRCODE = '23503';
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cotización en cotizacion_detalles', ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant FROM public.productos p WHERE p.id = NEW.producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en cotizacion_detalles', ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cotizacion_detalles_tenant_consistency ON public.cotizacion_detalles;
CREATE TRIGGER trg_enforce_cotizacion_detalles_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cotizacion_id, producto_id
ON public.cotizacion_detalles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cotizacion_detalles_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_pedidos_venta_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant FROM public.clientes c WHERE c.id = NEW.cliente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cliente en pedidos_venta', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cotizacion_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant FROM public.cotizaciones c WHERE c.id = NEW.cotizacion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cotización no existe: %s', NEW.cotizacion_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cotización en pedidos_venta', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en pedidos_venta', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedidos_venta_tenant_consistency ON public.pedidos_venta;
CREATE TRIGGER trg_enforce_pedidos_venta_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cliente_id, cotizacion_id
ON public.pedidos_venta
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedidos_venta_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_pedidos_venta_detalle_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.pedido_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'pedido_id es obligatorio en pedidos_venta_detalle', ERRCODE = '23514';
  END IF;

  SELECT p.tenant_id INTO v_ref_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Pedido no existe: %s', NEW.pedido_id), ERRCODE = '23503';
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con pedido en pedidos_venta_detalle', ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant FROM public.productos p WHERE p.id = NEW.producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en pedidos_venta_detalle', ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedidos_venta_detalle_tenant_consistency ON public.pedidos_venta_detalle;
CREATE TRIGGER trg_enforce_pedidos_venta_detalle_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, producto_id
ON public.pedidos_venta_detalle
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedidos_venta_detalle_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio (idempotentes).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cotizaciones') IS NOT NULL THEN
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_ids_required
      CHECK (tenant_id IS NOT NULL AND cliente_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_numero_nonempty
      CHECK (numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_montos_nonnegative
      CHECK (subtotal >= 0 AND igv >= 0 AND total >= 0) NOT VALID;
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_estado_valid
      CHECK (estado IN ('BORRADOR','ENVIADA','APROBADA','RECHAZADA','CONVERTIDA','VENCIDA')) NOT VALID;
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_moneda_iso3
      CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_probabilidad_range
      CHECK (probabilidad >= 0 AND probabilidad <= 100) NOT VALID;
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT ck_cotizaciones_items_array
      CHECK (items IS NOT NULL AND jsonb_typeof(items) = 'array') NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.cotizacion_detalles') IS NOT NULL THEN
    ALTER TABLE public.cotizacion_detalles
      ADD CONSTRAINT ck_cotizacion_detalles_ids_required
      CHECK (tenant_id IS NOT NULL AND cotizacion_id IS NOT NULL AND producto_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.cotizacion_detalles
      ADD CONSTRAINT ck_cotizacion_detalles_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '') NOT VALID;
    ALTER TABLE public.cotizacion_detalles
      ADD CONSTRAINT ck_cotizacion_detalles_montos_valid
      CHECK (cantidad > 0 AND precio_unitario >= 0 AND subtotal >= 0) NOT VALID;
    ALTER TABLE public.cotizacion_detalles
      ADD CONSTRAINT ck_cotizacion_detalles_orden_positive
      CHECK (orden > 0) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.pedidos_venta') IS NOT NULL THEN
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_ids_required
      CHECK (tenant_id IS NOT NULL AND cliente_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_numero_nonempty
      CHECK (numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_fecha_required
      CHECK (fecha_pedido IS NOT NULL AND fecha IS NOT NULL) NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_montos_nonnegative
      CHECK (subtotal >= 0 AND igv >= 0 AND total >= 0) NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_estado_valid
      CHECK (estado IN ('PENDIENTE','PENDIENTE_APROBACION','CONFIRMADO','EN_PREPARACION','LISTO_DESPACHO','DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO','COMPLETADO_CON_GRE','CANCELADO')) NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_moneda_iso3
      CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_tracking_nonempty
      CHECK (tracking_estado IS NOT NULL AND btrim(tracking_estado) <> '') NOT VALID;
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT ck_pedidos_venta_requiere_aprobacion_consistency
      CHECK (estado <> 'PENDIENTE_APROBACION' OR COALESCE(requiere_aprobacion, false) = true) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.pedidos_venta_detalle') IS NOT NULL THEN
    ALTER TABLE public.pedidos_venta_detalle
      ADD CONSTRAINT ck_pedidos_venta_detalle_ids_required
      CHECK (tenant_id IS NOT NULL AND pedido_id IS NOT NULL AND producto_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.pedidos_venta_detalle
      ADD CONSTRAINT ck_pedidos_venta_detalle_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '') NOT VALID;
    ALTER TABLE public.pedidos_venta_detalle
      ADD CONSTRAINT ck_pedidos_venta_detalle_montos_valid
      CHECK (cantidad > 0 AND precio_unitario >= 0 AND subtotal >= 0) NOT VALID;
    ALTER TABLE public.pedidos_venta_detalle
      ADD CONSTRAINT ck_pedidos_venta_detalle_despachado_range
      CHECK (cantidad_despachada >= 0 AND cantidad_despachada <= cantidad) NOT VALID;
    ALTER TABLE public.pedidos_venta_detalle
      ADD CONSTRAINT ck_pedidos_venta_detalle_facturado_range
      CHECK (cantidad_facturada >= 0 AND cantidad_facturada <= cantidad) NOT VALID;
    ALTER TABLE public.pedidos_venta_detalle
      ADD CONSTRAINT ck_pedidos_venta_detalle_estado_item_valid
      CHECK (estado_item IN ('PENDIENTE','PARCIAL','DESPACHADO','FACTURADO')) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_ids_required;
ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_numero_nonempty;
ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_montos_nonnegative;
ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_estado_valid;
ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_moneda_iso3;
ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_probabilidad_range;
ALTER TABLE IF EXISTS public.cotizaciones VALIDATE CONSTRAINT ck_cotizaciones_items_array;

ALTER TABLE IF EXISTS public.cotizacion_detalles VALIDATE CONSTRAINT ck_cotizacion_detalles_ids_required;
ALTER TABLE IF EXISTS public.cotizacion_detalles VALIDATE CONSTRAINT ck_cotizacion_detalles_descripcion_nonempty;
ALTER TABLE IF EXISTS public.cotizacion_detalles VALIDATE CONSTRAINT ck_cotizacion_detalles_montos_valid;
ALTER TABLE IF EXISTS public.cotizacion_detalles VALIDATE CONSTRAINT ck_cotizacion_detalles_orden_positive;

ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_ids_required;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_numero_nonempty;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_fecha_required;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_montos_nonnegative;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_estado_valid;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_moneda_iso3;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_tracking_nonempty;
ALTER TABLE IF EXISTS public.pedidos_venta VALIDATE CONSTRAINT ck_pedidos_venta_requiere_aprobacion_consistency;

ALTER TABLE IF EXISTS public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_ids_required;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_descripcion_nonempty;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_montos_valid;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_despachado_range;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_facturado_range;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle VALIDATE CONSTRAINT ck_pedidos_venta_detalle_estado_item_valid;

-- ----------------------------------------------------------------------------
-- Índices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizaciones_tenant_numero
ON public.cotizaciones (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_venta_tenant_numero
ON public.pedidos_venta (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizacion_detalles_tenant_cotizacion_orden
ON public.cotizacion_detalles (tenant_id, cotizacion_id, orden)
WHERE tenant_id IS NOT NULL
  AND cotizacion_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cotizaciones');
SELECT app.apply_tenant_policy('public', 'cotizacion_detalles');
SELECT app.apply_tenant_policy('public', 'pedidos_venta');
SELECT app.apply_tenant_policy('public', 'pedidos_venta_detalle');

COMMIT;
