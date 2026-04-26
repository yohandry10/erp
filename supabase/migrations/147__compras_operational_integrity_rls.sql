-- ============================================================================
-- 147__compras_operational_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para compras operativo.
-- Tablas: ordenes_compra, orden_compra_detalles, recepciones, recepcion_items, compras.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill de tenant/proveedor por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.orden_compra_detalles d
SET tenant_id = oc.tenant_id
FROM public.ordenes_compra oc
WHERE d.orden_id = oc.id
  AND oc.tenant_id IS NOT NULL
  AND (d.tenant_id IS NULL OR d.tenant_id <> oc.tenant_id);

UPDATE public.recepciones r
SET tenant_id = oc.tenant_id
FROM public.ordenes_compra oc
WHERE r.orden_id = oc.id
  AND oc.tenant_id IS NOT NULL
  AND (r.tenant_id IS NULL OR r.tenant_id <> oc.tenant_id);

UPDATE public.recepcion_items ri
SET tenant_id = r.tenant_id
FROM public.recepciones r
WHERE ri.recepcion_id = r.id
  AND r.tenant_id IS NOT NULL
  AND (ri.tenant_id IS NULL OR ri.tenant_id <> r.tenant_id);

UPDATE public.recepcion_items ri
SET tenant_id = d.tenant_id
FROM public.orden_compra_detalles d
WHERE ri.detalle_id = d.id
  AND d.tenant_id IS NOT NULL
  AND ri.tenant_id IS NULL;

UPDATE public.compras c
SET
  tenant_id = oc.tenant_id,
  proveedor_id = COALESCE(c.proveedor_id, oc.proveedor_id)
FROM public.ordenes_compra oc
WHERE c.id = oc.id
  AND (
    c.tenant_id IS NULL OR c.tenant_id <> oc.tenant_id
    OR (c.proveedor_id IS NULL AND oc.proveedor_id IS NOT NULL)
  );

UPDATE public.ordenes_compra oc
SET
  tenant_id = c.tenant_id,
  proveedor_id = COALESCE(oc.proveedor_id, c.proveedor_id)
FROM public.compras c
WHERE oc.id = c.id
  AND (
    (oc.tenant_id IS NULL AND c.tenant_id IS NOT NULL)
    OR (oc.proveedor_id IS NULL AND c.proveedor_id IS NOT NULL)
  );

-- ----------------------------------------------------------------------------
-- FKs operativas para embeds/joins runtime.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('ordenes_compra', 'cotizacion_id', 'cotizaciones_compra', 'id', 'ordenes_compra_cotizacion_id_fkey');
SELECT app.add_fk_if_possible('ordenes_compra', 'almacen_destino_id', 'almacenes', 'id', 'ordenes_compra_almacen_destino_id_fkey');
SELECT app.add_fk_if_possible('ordenes_compra', 'created_by', 'usuarios_sistema', 'id', 'ordenes_compra_created_by_fkey');
SELECT app.add_fk_if_possible('ordenes_compra', 'updated_by', 'usuarios_sistema', 'id', 'ordenes_compra_updated_by_fkey');
SELECT app.add_fk_if_possible('ordenes_compra', 'aprobado_by', 'usuarios_sistema', 'id', 'ordenes_compra_aprobado_by_fkey');
SELECT app.add_fk_if_possible('ordenes_compra', 'rechazado_by', 'usuarios_sistema', 'id', 'ordenes_compra_rechazado_by_fkey');
SELECT app.add_fk_if_possible('ordenes_compra', 'cancelado_by', 'usuarios_sistema', 'id', 'ordenes_compra_cancelado_by_fkey');

SELECT app.add_fk_if_possible('orden_compra_detalles', 'orden_id', 'ordenes_compra', 'id', 'orden_compra_detalles_orden_id_fkey_runtime');
SELECT app.add_fk_if_possible('orden_compra_detalles', 'producto_id', 'productos', 'id', 'orden_compra_detalles_producto_id_fkey_runtime');

SELECT app.add_fk_if_possible('recepciones', 'orden_id', 'ordenes_compra', 'id', 'recepciones_orden_id_fkey_runtime');
SELECT app.add_fk_if_possible('recepciones', 'created_by', 'usuarios_sistema', 'id', 'recepciones_created_by_fkey_runtime');
SELECT app.add_fk_if_possible('recepciones', 'updated_by', 'usuarios_sistema', 'id', 'recepciones_updated_by_fkey_runtime');

SELECT app.add_fk_if_possible('recepcion_items', 'recepcion_id', 'recepciones', 'id', 'recepcion_items_recepcion_id_fkey_runtime');
SELECT app.add_fk_if_possible('recepcion_items', 'detalle_id', 'orden_compra_detalles', 'id', 'recepcion_items_detalle_id_fkey_runtime');
SELECT app.add_fk_if_possible('recepcion_items', 'producto_id', 'productos', 'id', 'recepcion_items_producto_id_fkey_runtime');

SELECT app.add_fk_if_possible('compras', 'proveedor_id', 'proveedores', 'id', 'compras_proveedor_id_fkey_runtime');

-- ----------------------------------------------------------------------------
-- Dedupe por scope previo a índices únicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, upper(btrim(numero))
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.ordenes_compra
  WHERE tenant_id IS NOT NULL
    AND numero IS NOT NULL
    AND btrim(numero) <> ''
)
UPDATE public.ordenes_compra oc
SET
  numero = oc.numero || '-DUP-' || r.rn::text,
  numero_orden = COALESCE(oc.numero_orden, oc.numero || '-DUP-' || r.rn::text),
  updated_at = now()
FROM ranked r
WHERE oc.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, upper(btrim(numero_documento))
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.compras
  WHERE tenant_id IS NOT NULL
    AND numero_documento IS NOT NULL
    AND btrim(numero_documento) <> ''
)
UPDATE public.compras c
SET
  numero_documento = c.numero_documento || '-DUP-' || r.rn::text,
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_ordenes_compra_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.almacen_destino_id := app.to_uuid_or_null(COALESCE(NEW.almacen_destino_id::text, ''));

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant FROM public.proveedores p WHERE p.id = NEW.proveedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con proveedor en ordenes_compra', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cotizacion_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant FROM public.cotizaciones_compra c WHERE c.id = NEW.cotizacion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cotizacion compra no existe: %s', NEW.cotizacion_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cotizacion en ordenes_compra', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.almacen_destino_id IS NOT NULL THEN
    SELECT a.tenant_id INTO v_ref_tenant FROM public.almacenes a WHERE a.id = NEW.almacen_destino_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Almacen no existe: %s', NEW.almacen_destino_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con almacen en ordenes_compra', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en ordenes_compra', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ordenes_compra_tenant_consistency ON public.ordenes_compra;
CREATE TRIGGER trg_enforce_ordenes_compra_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, proveedor_id, cotizacion_id, almacen_destino_id
ON public.ordenes_compra
FOR EACH ROW
EXECUTE FUNCTION app.enforce_ordenes_compra_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_orden_compra_detalles_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.orden_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'orden_id es obligatorio en orden_compra_detalles', ERRCODE = '23514';
  END IF;

  SELECT oc.tenant_id INTO v_tenant FROM public.ordenes_compra oc WHERE oc.id = NEW.orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Orden no existe: %s', NEW.orden_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant;
  ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con orden en orden_compra_detalles', ERRCODE = '23514';
  END IF;

  NEW.cantidad := COALESCE(NEW.cantidad, 0);
  NEW.cantidad_recibida := COALESCE(NEW.cantidad_recibida, 0);
  NEW.cantidad_pendiente := GREATEST(NEW.cantidad - NEW.cantidad_recibida, 0);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_orden_compra_detalles_tenant_consistency ON public.orden_compra_detalles;
CREATE TRIGGER trg_enforce_orden_compra_detalles_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, orden_id, producto_id, cantidad, cantidad_recibida
ON public.orden_compra_detalles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_orden_compra_detalles_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_recepciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));

  IF NEW.orden_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'orden_id es obligatorio en recepciones', ERRCODE = '23514';
  END IF;

  SELECT oc.tenant_id INTO v_tenant FROM public.ordenes_compra oc WHERE oc.id = NEW.orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Orden no existe: %s', NEW.orden_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant;
  ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con orden en recepciones', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_recepciones_tenant_consistency ON public.recepciones;
CREATE TRIGGER trg_enforce_recepciones_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, orden_id
ON public.recepciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_recepciones_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_recepcion_items_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_recepcion_tenant uuid;
  v_detalle_tenant uuid;
  v_detalle_orden_id uuid;
  v_recepcion_orden_id uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_id::text, ''));
  NEW.detalle_id := app.to_uuid_or_null(COALESCE(NEW.detalle_id::text, ''));

  IF NEW.recepcion_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'recepcion_id es obligatorio en recepcion_items', ERRCODE = '23514';
  END IF;

  SELECT r.tenant_id, r.orden_id INTO v_recepcion_tenant, v_recepcion_orden_id
  FROM public.recepciones r
  WHERE r.id = NEW.recepcion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Recepcion no existe: %s', NEW.recepcion_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_recepcion_tenant;
  ELSIF v_recepcion_tenant IS NOT NULL AND NEW.tenant_id <> v_recepcion_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con recepcion en recepcion_items', ERRCODE = '23514';
  END IF;

  IF NEW.detalle_id IS NOT NULL THEN
    SELECT d.tenant_id, d.orden_id INTO v_detalle_tenant, v_detalle_orden_id
    FROM public.orden_compra_detalles d
    WHERE d.id = NEW.detalle_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Detalle de orden no existe: %s', NEW.detalle_id), ERRCODE = '23503';
    END IF;

    IF v_detalle_tenant IS NOT NULL AND NEW.tenant_id <> v_detalle_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con detalle en recepcion_items', ERRCODE = '23514';
    END IF;
    IF v_recepcion_orden_id IS NOT NULL AND v_detalle_orden_id IS NOT NULL AND v_recepcion_orden_id <> v_detalle_orden_id THEN
      RAISE EXCEPTION USING MESSAGE = 'detalle_id no pertenece a la orden de la recepcion', ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_recepcion_items_tenant_consistency ON public.recepcion_items;
CREATE TRIGGER trg_enforce_recepcion_items_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, recepcion_id, detalle_id
ON public.recepcion_items
FOR EACH ROW
EXECUTE FUNCTION app.enforce_recepcion_items_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_compras_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant FROM public.proveedores p WHERE p.id = NEW.proveedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant;
    ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con proveedor en compras', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en compras', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_compras_tenant_consistency ON public.compras;
CREATE TRIGGER trg_enforce_compras_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, proveedor_id
ON public.compras
FOR EACH ROW
EXECUTE FUNCTION app.enforce_compras_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio + índices únicos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ck_ordenes_compra_estado_valid
    CHECK (estado IN ('BORRADOR','PENDIENTE','APROBACION','APROBADA','PARCIAL','RECIBIDA','ANULADA','RECHAZADA','ENTREGADO','ENTREGADA')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ck_ordenes_compra_totals_nonnegative
    CHECK (subtotal >= 0 AND igv >= 0 AND total >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ck_ordenes_compra_dias_credito_nonnegative
    CHECK (dias_credito >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orden_compra_detalles
    ADD CONSTRAINT ck_orden_compra_detalles_qty_nonnegative
    CHECK (cantidad >= 0 AND cantidad_recibida >= 0 AND cantidad_pendiente >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.recepciones
    ADD CONSTRAINT ck_recepciones_estado_valid
    CHECK (estado IN ('BORRADOR','EN_PROCESO','CERRADA','ANULADA')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.compras
    ADD CONSTRAINT ck_compras_estado_valid
    CHECK (estado IN ('PENDIENTE','ENTREGADA','ANULADA')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.compras
    ADD CONSTRAINT ck_compras_totals_nonnegative
    CHECK (subtotal >= 0 AND igv >= 0 AND total >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.ordenes_compra VALIDATE CONSTRAINT ck_ordenes_compra_estado_valid;
ALTER TABLE IF EXISTS public.ordenes_compra VALIDATE CONSTRAINT ck_ordenes_compra_totals_nonnegative;
ALTER TABLE IF EXISTS public.ordenes_compra VALIDATE CONSTRAINT ck_ordenes_compra_dias_credito_nonnegative;
ALTER TABLE IF EXISTS public.orden_compra_detalles VALIDATE CONSTRAINT ck_orden_compra_detalles_qty_nonnegative;
ALTER TABLE IF EXISTS public.recepciones VALIDATE CONSTRAINT ck_recepciones_estado_valid;
ALTER TABLE IF EXISTS public.compras VALIDATE CONSTRAINT ck_compras_estado_valid;
ALTER TABLE IF EXISTS public.compras VALIDATE CONSTRAINT ck_compras_totals_nonnegative;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_compra_tenant_numero_runtime
ON public.ordenes_compra (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_compras_tenant_numero_documento_runtime
ON public.compras (tenant_id, upper(numero_documento))
WHERE tenant_id IS NOT NULL
  AND numero_documento IS NOT NULL
  AND btrim(numero_documento) <> '';

CREATE INDEX IF NOT EXISTS idx_recepciones_tenant_orden_estado_runtime
ON public.recepciones (tenant_id, orden_id, estado)
WHERE tenant_id IS NOT NULL
  AND orden_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recepcion_items_tenant_recepcion_detalle_runtime
ON public.recepcion_items (tenant_id, recepcion_id, detalle_id)
WHERE tenant_id IS NOT NULL
  AND recepcion_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'ordenes_compra');
SELECT app.apply_tenant_policy('public', 'orden_compra_detalles');
SELECT app.apply_tenant_policy('public', 'recepciones');
SELECT app.apply_tenant_policy('public', 'recepcion_items');
SELECT app.apply_tenant_policy('public', 'compras');

COMMIT;
