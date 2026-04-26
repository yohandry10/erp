-- ============================================================================
-- 150__compras_cotizaciones_devoluciones_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para compras:
-- cotizaciones_compra, cotizacion_compra_detalles, oc_aprobaciones,
-- devoluciones_proveedor, devolucion_items.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant y relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.cotizaciones_compra c
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE c.proveedor_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> p.tenant_id);

UPDATE public.cotizaciones_compra c
SET
  tenant_id = oc.tenant_id,
  proveedor_id = COALESCE(c.proveedor_id, oc.proveedor_id)
FROM public.ordenes_compra oc
WHERE c.orden_compra_id = oc.id
  AND (
    c.tenant_id IS NULL
    OR c.tenant_id <> oc.tenant_id
    OR (c.proveedor_id IS NULL AND oc.proveedor_id IS NOT NULL)
  );

UPDATE public.cotizacion_compra_detalles d
SET
  tenant_id = c.tenant_id,
  orden_compra_id = COALESCE(d.orden_compra_id, c.orden_compra_id)
FROM public.cotizaciones_compra c
WHERE d.cotizacion_id = c.id
  AND (
    d.tenant_id IS NULL
    OR d.tenant_id <> c.tenant_id
    OR (d.orden_compra_id IS NULL AND c.orden_compra_id IS NOT NULL)
  );

UPDATE public.oc_aprobaciones oa
SET tenant_id = oc.tenant_id
FROM public.ordenes_compra oc
WHERE oa.orden_id = oc.id
  AND oc.tenant_id IS NOT NULL
  AND (oa.tenant_id IS NULL OR oa.tenant_id <> oc.tenant_id);

UPDATE public.devoluciones_proveedor d
SET
  tenant_id = oc.tenant_id,
  proveedor_id = COALESCE(d.proveedor_id, oc.proveedor_id)
FROM public.ordenes_compra oc
WHERE d.orden_id = oc.id
  AND (
    d.tenant_id IS NULL
    OR d.tenant_id <> oc.tenant_id
    OR (d.proveedor_id IS NULL AND oc.proveedor_id IS NOT NULL)
  );

UPDATE public.devoluciones_proveedor d
SET
  tenant_id = r.tenant_id,
  orden_id = COALESCE(d.orden_id, r.orden_id)
FROM public.recepciones r
WHERE d.recepcion_id = r.id
  AND (
    d.tenant_id IS NULL
    OR d.tenant_id <> r.tenant_id
    OR (d.orden_id IS NULL AND r.orden_id IS NOT NULL)
  );

UPDATE public.devoluciones_proveedor d
SET proveedor_id = oc.proveedor_id
FROM public.ordenes_compra oc
WHERE d.orden_id = oc.id
  AND d.proveedor_id IS NULL
  AND oc.proveedor_id IS NOT NULL;

UPDATE public.devolucion_items di
SET tenant_id = d.tenant_id
FROM public.devoluciones_proveedor d
WHERE di.devolucion_id = d.id
  AND d.tenant_id IS NOT NULL
  AND (di.tenant_id IS NULL OR di.tenant_id <> d.tenant_id);

UPDATE public.devolucion_items di
SET
  tenant_id = COALESCE(di.tenant_id, ri.tenant_id),
  producto_id = COALESCE(di.producto_id, ri.producto_id),
  almacen_id = COALESCE(di.almacen_id, ri.almacen_id)
FROM public.recepcion_items ri
WHERE di.recepcion_item_id = ri.id
  AND (
    di.tenant_id IS NULL
    OR di.producto_id IS NULL
    OR di.almacen_id IS NULL
  );

-- Re-normaliza estados en caso de residuos legacy.
UPDATE public.cotizaciones_compra
SET estado = CASE
  WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('ACTIVO', 'DRAFT') THEN 'BORRADOR'
  WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA') THEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR'))
  ELSE 'BORRADOR'
END;

UPDATE public.oc_aprobaciones
SET estado = CASE
  WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('ACTIVO', 'BORRADOR') THEN 'PENDIENTE'
  WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'APROBADA', 'RECHAZADA') THEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE'))
  ELSE 'PENDIENTE'
END;

UPDATE public.devoluciones_proveedor
SET estado = CASE
  WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('ACTIVO', 'BORRADOR') THEN 'PENDIENTE'
  WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'EMITIDA', 'ANULADA', 'RECHAZADA') THEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE'))
  ELSE 'PENDIENTE'
END;

-- ----------------------------------------------------------------------------
-- FKs operativas para joins/embeds runtime.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'cotizaciones_compra',
  'proveedor_id',
  'proveedores',
  'id',
  'cotizaciones_compra_proveedor_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cotizaciones_compra',
  'orden_compra_id',
  'ordenes_compra',
  'id',
  'cotizaciones_compra_orden_compra_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cotizacion_compra_detalles',
  'cotizacion_id',
  'cotizaciones_compra',
  'id',
  'cotizacion_compra_detalles_cotizacion_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cotizacion_compra_detalles',
  'orden_compra_id',
  'ordenes_compra',
  'id',
  'cotizacion_compra_detalles_orden_compra_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cotizacion_compra_detalles',
  'producto_id',
  'productos',
  'id',
  'cotizacion_compra_detalles_producto_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'oc_aprobaciones',
  'orden_id',
  'ordenes_compra',
  'id',
  'oc_aprobaciones_orden_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devoluciones_proveedor',
  'orden_id',
  'ordenes_compra',
  'id',
  'devoluciones_proveedor_orden_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devoluciones_proveedor',
  'proveedor_id',
  'proveedores',
  'id',
  'devoluciones_proveedor_proveedor_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devoluciones_proveedor',
  'recepcion_id',
  'recepciones',
  'id',
  'devoluciones_proveedor_recepcion_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devolucion_items',
  'devolucion_id',
  'devoluciones_proveedor',
  'id',
  'devolucion_items_devolucion_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devolucion_items',
  'recepcion_item_id',
  'recepcion_items',
  'id',
  'devolucion_items_recepcion_item_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devolucion_items',
  'producto_id',
  'productos',
  'id',
  'devolucion_items_producto_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'devolucion_items',
  'almacen_id',
  'almacenes',
  'id',
  'devolucion_items_almacen_id_fkey_runtime'
);

-- ----------------------------------------------------------------------------
-- Dedupe por scope previo a indices unicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    c.numero,
    row_number() OVER (
      PARTITION BY c.tenant_id, upper(btrim(c.numero))
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cotizaciones_compra c
  WHERE c.tenant_id IS NOT NULL
    AND c.numero IS NOT NULL
    AND btrim(c.numero) <> ''
)
UPDATE public.cotizaciones_compra c
SET numero = format('%s-DUP-%s', upper(btrim(r.numero)), r.rn),
    updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    d.id,
    d.numero,
    row_number() OVER (
      PARTITION BY d.tenant_id, upper(btrim(d.numero))
      ORDER BY COALESCE(d.updated_at, d.created_at, now()) DESC, d.id::text DESC
    ) AS rn
  FROM public.devoluciones_proveedor d
  WHERE d.tenant_id IS NOT NULL
    AND d.numero IS NOT NULL
    AND btrim(d.numero) <> ''
)
UPDATE public.devoluciones_proveedor d
SET numero = format('%s-DUP-%s', upper(btrim(r.numero)), r.rn),
    updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cotizaciones_compra_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_proveedor uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.orden_compra_id := app.to_uuid_or_null(COALESCE(NEW.orden_compra_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));

  IF NEW.orden_compra_id IS NOT NULL THEN
    SELECT oc.tenant_id, oc.proveedor_id
    INTO v_ref_tenant, v_ref_proveedor
    FROM public.ordenes_compra oc
    WHERE oc.id = NEW.orden_compra_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Orden de compra no existe: %s', NEW.orden_compra_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con orden_compra en cotizaciones_compra',
              ERRCODE = '23514';
    END IF;

    IF NEW.proveedor_id IS NULL THEN
      NEW.proveedor_id := v_ref_proveedor;
    ELSIF v_ref_proveedor IS NOT NULL AND NEW.proveedor_id <> v_ref_proveedor THEN
      RAISE EXCEPTION
        USING MESSAGE = 'proveedor_id no coincide con orden_compra en cotizaciones_compra',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_ref_tenant
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con proveedor en cotizaciones_compra',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cotizaciones_compra',
            ERRCODE = '23514';
  END IF;

  IF NEW.proveedor_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'proveedor_id es obligatorio en cotizaciones_compra',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cotizaciones_compra_tenant_consistency ON public.cotizaciones_compra;
CREATE TRIGGER trg_enforce_cotizaciones_compra_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, proveedor_id, orden_compra_id
ON public.cotizaciones_compra
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cotizaciones_compra_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_cotizacion_compra_detalles_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_orden uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.orden_compra_id := app.to_uuid_or_null(COALESCE(NEW.orden_compra_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.cotizacion_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'cotizacion_id es obligatorio en cotizacion_compra_detalles',
            ERRCODE = '23514';
  END IF;

  SELECT c.tenant_id, c.orden_compra_id
  INTO v_ref_tenant, v_ref_orden
  FROM public.cotizaciones_compra c
  WHERE c.id = NEW.cotizacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Cotizacion compra no existe: %s', NEW.cotizacion_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con cotizacion en cotizacion_compra_detalles',
            ERRCODE = '23514';
  END IF;

  IF NEW.orden_compra_id IS NULL AND v_ref_orden IS NOT NULL THEN
    NEW.orden_compra_id := v_ref_orden;
  ELSIF NEW.orden_compra_id IS NOT NULL AND v_ref_orden IS NOT NULL AND NEW.orden_compra_id <> v_ref_orden THEN
    RAISE EXCEPTION
      USING MESSAGE = 'orden_compra_id no coincide con cotizacion parent',
            ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'producto_id es obligatorio en cotizacion_compra_detalles',
            ERRCODE = '23514';
  END IF;

  SELECT p.tenant_id
  INTO v_ref_tenant
  FROM public.productos p
  WHERE p.id = NEW.producto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Producto no existe: %s', NEW.producto_id),
            ERRCODE = '23503';
  END IF;

  IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con producto en cotizacion_compra_detalles',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cotizacion_compra_detalles_tenant_consistency ON public.cotizacion_compra_detalles;
CREATE TRIGGER trg_enforce_cotizacion_compra_detalles_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cotizacion_id, orden_compra_id, producto_id
ON public.cotizacion_compra_detalles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cotizacion_compra_detalles_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_oc_aprobaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_aprobador_uuid uuid;
  v_user_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.aprobador_id := COALESCE(NULLIF(btrim(COALESCE(NEW.aprobador_id, '')), ''), 'SYSTEM');
  NEW.aprobador_nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.aprobador_nombre, '')), ''), 'Sistema');
  NEW.nivel := CASE WHEN COALESCE(NEW.nivel, 0) < 1 THEN 1 ELSE NEW.nivel END;

  IF NEW.orden_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'orden_id es obligatorio en oc_aprobaciones',
            ERRCODE = '23514';
  END IF;

  SELECT oc.tenant_id
  INTO v_ref_tenant
  FROM public.ordenes_compra oc
  WHERE oc.id = NEW.orden_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Orden de compra no existe: %s', NEW.orden_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con orden en oc_aprobaciones',
            ERRCODE = '23514';
  END IF;

  v_aprobador_uuid := app.to_uuid_or_null(COALESCE(NEW.aprobador_id, ''));
  IF v_aprobador_uuid IS NOT NULL THEN
    SELECT u.tenant_id
    INTO v_user_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = v_aprobador_uuid;

    IF FOUND AND v_user_tenant IS NOT NULL AND NEW.tenant_id <> v_user_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con aprobador en oc_aprobaciones',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en oc_aprobaciones',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_oc_aprobaciones_tenant_consistency ON public.oc_aprobaciones;
CREATE TRIGGER trg_enforce_oc_aprobaciones_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, orden_id, aprobador_id, nivel, estado
ON public.oc_aprobaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_oc_aprobaciones_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_devoluciones_proveedor_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_proveedor uuid;
  v_ref_orden uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_id::text, ''));

  IF NEW.orden_id IS NOT NULL THEN
    SELECT oc.tenant_id, oc.proveedor_id
    INTO v_ref_tenant, v_ref_proveedor
    FROM public.ordenes_compra oc
    WHERE oc.id = NEW.orden_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Orden de compra no existe: %s', NEW.orden_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con orden en devoluciones_proveedor',
              ERRCODE = '23514';
    END IF;

    IF NEW.proveedor_id IS NULL THEN
      NEW.proveedor_id := v_ref_proveedor;
    ELSIF v_ref_proveedor IS NOT NULL AND NEW.proveedor_id <> v_ref_proveedor THEN
      RAISE EXCEPTION
        USING MESSAGE = 'proveedor_id no coincide con orden en devoluciones_proveedor',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_ref_tenant
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con proveedor en devoluciones_proveedor',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.recepcion_id IS NOT NULL THEN
    SELECT r.tenant_id, r.orden_id
    INTO v_ref_tenant, v_ref_orden
    FROM public.recepciones r
    WHERE r.id = NEW.recepcion_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Recepcion no existe: %s', NEW.recepcion_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con recepcion en devoluciones_proveedor',
              ERRCODE = '23514';
    END IF;

    IF NEW.orden_id IS NULL THEN
      NEW.orden_id := v_ref_orden;
    ELSIF v_ref_orden IS NOT NULL AND NEW.orden_id <> v_ref_orden THEN
      RAISE EXCEPTION
        USING MESSAGE = 'orden_id no coincide con recepcion en devoluciones_proveedor',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en devoluciones_proveedor',
            ERRCODE = '23514';
  END IF;

  IF NEW.orden_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'orden_id es obligatorio en devoluciones_proveedor',
            ERRCODE = '23514';
  END IF;

  IF NEW.proveedor_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'proveedor_id es obligatorio en devoluciones_proveedor',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_devoluciones_proveedor_tenant_consistency ON public.devoluciones_proveedor;
CREATE TRIGGER trg_enforce_devoluciones_proveedor_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, orden_id, proveedor_id, recepcion_id
ON public.devoluciones_proveedor
FOR EACH ROW
EXECUTE FUNCTION app.enforce_devoluciones_proveedor_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_devolucion_items_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_recepcion uuid;
  v_ref_producto uuid;
  v_ref_almacen uuid;
  v_dev_recepcion uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.devolucion_id := app.to_uuid_or_null(COALESCE(NEW.devolucion_id::text, ''));
  NEW.recepcion_item_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_item_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));

  IF NEW.devolucion_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'devolucion_id es obligatorio en devolucion_items',
            ERRCODE = '23514';
  END IF;

  SELECT d.tenant_id, d.recepcion_id
  INTO v_ref_tenant, v_dev_recepcion
  FROM public.devoluciones_proveedor d
  WHERE d.id = NEW.devolucion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Devolucion no existe: %s', NEW.devolucion_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con devolucion en devolucion_items',
            ERRCODE = '23514';
  END IF;

  IF NEW.recepcion_item_id IS NOT NULL THEN
    SELECT ri.tenant_id, ri.recepcion_id, ri.producto_id, ri.almacen_id
    INTO v_ref_tenant, v_ref_recepcion, v_ref_producto, v_ref_almacen
    FROM public.recepcion_items ri
    WHERE ri.id = NEW.recepcion_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Recepcion item no existe: %s', NEW.recepcion_item_id),
              ERRCODE = '23503';
    END IF;

    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con recepcion_item en devolucion_items',
              ERRCODE = '23514';
    END IF;

    IF v_dev_recepcion IS NOT NULL AND v_ref_recepcion IS NOT NULL AND v_dev_recepcion <> v_ref_recepcion THEN
      RAISE EXCEPTION
        USING MESSAGE = 'recepcion_item_id no pertenece a la recepcion asociada a la devolucion',
              ERRCODE = '23514';
    END IF;

    IF NEW.producto_id IS NULL THEN
      NEW.producto_id := v_ref_producto;
    ELSIF v_ref_producto IS NOT NULL AND NEW.producto_id <> v_ref_producto THEN
      RAISE EXCEPTION
        USING MESSAGE = 'producto_id no coincide con recepcion_item en devolucion_items',
              ERRCODE = '23514';
    END IF;

    IF NEW.almacen_id IS NULL THEN
      NEW.almacen_id := v_ref_almacen;
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en devolucion_items',
            ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'producto_id es obligatorio en devolucion_items',
            ERRCODE = '23514';
  END IF;

  NEW.subtotal := GREATEST(
    COALESCE(NEW.subtotal, NEW.cantidad * NEW.precio_unitario, 0),
    0
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_devolucion_items_tenant_consistency ON public.devolucion_items;
CREATE TRIGGER trg_enforce_devolucion_items_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, devolucion_id, recepcion_item_id, producto_id, almacen_id, cantidad, precio_unitario, subtotal
ON public.devolucion_items
FOR EACH ROW
EXECUTE FUNCTION app.enforce_devolucion_items_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio (idempotentes) + validacion.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizaciones_compra_ids_required'
      AND conrelid = 'public.cotizaciones_compra'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones_compra
      ADD CONSTRAINT ck_cotizaciones_compra_ids_required
      CHECK (tenant_id IS NOT NULL AND proveedor_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizaciones_compra_numero_nonempty'
      AND conrelid = 'public.cotizaciones_compra'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones_compra
      ADD CONSTRAINT ck_cotizaciones_compra_numero_nonempty
      CHECK (numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizaciones_compra_fechas_valid'
      AND conrelid = 'public.cotizaciones_compra'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones_compra
      ADD CONSTRAINT ck_cotizaciones_compra_fechas_valid
      CHECK (
        fecha_cotizacion IS NOT NULL
        AND fecha_vencimiento IS NOT NULL
        AND fecha_vencimiento >= fecha_cotizacion
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizaciones_compra_validez_positive'
      AND conrelid = 'public.cotizaciones_compra'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones_compra
      ADD CONSTRAINT ck_cotizaciones_compra_validez_positive
      CHECK (validez_dias IS NOT NULL AND validez_dias >= 1) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizaciones_compra_totals_nonnegative'
      AND conrelid = 'public.cotizaciones_compra'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones_compra
      ADD CONSTRAINT ck_cotizaciones_compra_totals_nonnegative
      CHECK (subtotal >= 0 AND igv >= 0 AND total >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizaciones_compra_estado_valid'
      AND conrelid = 'public.cotizaciones_compra'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones_compra
      ADD CONSTRAINT ck_cotizaciones_compra_estado_valid
      CHECK (estado IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizacion_compra_detalles_ids_required'
      AND conrelid = 'public.cotizacion_compra_detalles'::regclass
  ) THEN
    ALTER TABLE public.cotizacion_compra_detalles
      ADD CONSTRAINT ck_cotizacion_compra_detalles_ids_required
      CHECK (tenant_id IS NOT NULL AND cotizacion_id IS NOT NULL AND producto_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizacion_compra_detalles_descripcion_nonempty'
      AND conrelid = 'public.cotizacion_compra_detalles'::regclass
  ) THEN
    ALTER TABLE public.cotizacion_compra_detalles
      ADD CONSTRAINT ck_cotizacion_compra_detalles_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cotizacion_compra_detalles_montos_valid'
      AND conrelid = 'public.cotizacion_compra_detalles'::regclass
  ) THEN
    ALTER TABLE public.cotizacion_compra_detalles
      ADD CONSTRAINT ck_cotizacion_compra_detalles_montos_valid
      CHECK (cantidad > 0 AND precio_unitario >= 0 AND subtotal >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_oc_aprobaciones_ids_required'
      AND conrelid = 'public.oc_aprobaciones'::regclass
  ) THEN
    ALTER TABLE public.oc_aprobaciones
      ADD CONSTRAINT ck_oc_aprobaciones_ids_required
      CHECK (tenant_id IS NOT NULL AND orden_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_oc_aprobaciones_aprobador_nonempty'
      AND conrelid = 'public.oc_aprobaciones'::regclass
  ) THEN
    ALTER TABLE public.oc_aprobaciones
      ADD CONSTRAINT ck_oc_aprobaciones_aprobador_nonempty
      CHECK (aprobador_id IS NOT NULL AND btrim(aprobador_id) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_oc_aprobaciones_nivel_positive'
      AND conrelid = 'public.oc_aprobaciones'::regclass
  ) THEN
    ALTER TABLE public.oc_aprobaciones
      ADD CONSTRAINT ck_oc_aprobaciones_nivel_positive
      CHECK (nivel >= 1) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_oc_aprobaciones_estado_valid'
      AND conrelid = 'public.oc_aprobaciones'::regclass
  ) THEN
    ALTER TABLE public.oc_aprobaciones
      ADD CONSTRAINT ck_oc_aprobaciones_estado_valid
      CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_oc_aprobaciones_fecha_consistency'
      AND conrelid = 'public.oc_aprobaciones'::regclass
  ) THEN
    ALTER TABLE public.oc_aprobaciones
      ADD CONSTRAINT ck_oc_aprobaciones_fecha_consistency
      CHECK (estado = 'PENDIENTE' OR fecha_aprobacion IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_ids_required'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_ids_required
      CHECK (tenant_id IS NOT NULL AND orden_id IS NOT NULL AND proveedor_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_numero_nonempty'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_numero_nonempty
      CHECK (numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_fecha_required'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_fecha_required
      CHECK (fecha_devolucion IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_estado_valid'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_estado_valid
      CHECK (estado IN ('PENDIENTE', 'EMITIDA', 'ANULADA', 'RECHAZADA')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_totals_nonnegative'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_totals_nonnegative
      CHECK (subtotal >= 0 AND igv >= 0 AND total >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_moneda_iso3'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_moneda_iso3
      CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devolucion_items_ids_required'
      AND conrelid = 'public.devolucion_items'::regclass
  ) THEN
    ALTER TABLE public.devolucion_items
      ADD CONSTRAINT ck_devolucion_items_ids_required
      CHECK (tenant_id IS NOT NULL AND devolucion_id IS NOT NULL AND producto_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devolucion_items_descripcion_nonempty'
      AND conrelid = 'public.devolucion_items'::regclass
  ) THEN
    ALTER TABLE public.devolucion_items
      ADD CONSTRAINT ck_devolucion_items_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devolucion_items_montos_valid'
      AND conrelid = 'public.devolucion_items'::regclass
  ) THEN
    ALTER TABLE public.devolucion_items
      ADD CONSTRAINT ck_devolucion_items_montos_valid
      CHECK (cantidad > 0 AND precio_unitario >= 0 AND subtotal >= 0) NOT VALID;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.cotizaciones_compra
  VALIDATE CONSTRAINT ck_cotizaciones_compra_ids_required;
ALTER TABLE IF EXISTS public.cotizaciones_compra
  VALIDATE CONSTRAINT ck_cotizaciones_compra_numero_nonempty;
ALTER TABLE IF EXISTS public.cotizaciones_compra
  VALIDATE CONSTRAINT ck_cotizaciones_compra_fechas_valid;
ALTER TABLE IF EXISTS public.cotizaciones_compra
  VALIDATE CONSTRAINT ck_cotizaciones_compra_validez_positive;
ALTER TABLE IF EXISTS public.cotizaciones_compra
  VALIDATE CONSTRAINT ck_cotizaciones_compra_totals_nonnegative;
ALTER TABLE IF EXISTS public.cotizaciones_compra
  VALIDATE CONSTRAINT ck_cotizaciones_compra_estado_valid;

ALTER TABLE IF EXISTS public.cotizacion_compra_detalles
  VALIDATE CONSTRAINT ck_cotizacion_compra_detalles_ids_required;
ALTER TABLE IF EXISTS public.cotizacion_compra_detalles
  VALIDATE CONSTRAINT ck_cotizacion_compra_detalles_descripcion_nonempty;
ALTER TABLE IF EXISTS public.cotizacion_compra_detalles
  VALIDATE CONSTRAINT ck_cotizacion_compra_detalles_montos_valid;

ALTER TABLE IF EXISTS public.oc_aprobaciones
  VALIDATE CONSTRAINT ck_oc_aprobaciones_ids_required;
ALTER TABLE IF EXISTS public.oc_aprobaciones
  VALIDATE CONSTRAINT ck_oc_aprobaciones_aprobador_nonempty;
ALTER TABLE IF EXISTS public.oc_aprobaciones
  VALIDATE CONSTRAINT ck_oc_aprobaciones_nivel_positive;
ALTER TABLE IF EXISTS public.oc_aprobaciones
  VALIDATE CONSTRAINT ck_oc_aprobaciones_estado_valid;
ALTER TABLE IF EXISTS public.oc_aprobaciones
  VALIDATE CONSTRAINT ck_oc_aprobaciones_fecha_consistency;

ALTER TABLE IF EXISTS public.devoluciones_proveedor
  VALIDATE CONSTRAINT ck_devoluciones_proveedor_ids_required;
ALTER TABLE IF EXISTS public.devoluciones_proveedor
  VALIDATE CONSTRAINT ck_devoluciones_proveedor_numero_nonempty;
ALTER TABLE IF EXISTS public.devoluciones_proveedor
  VALIDATE CONSTRAINT ck_devoluciones_proveedor_fecha_required;
ALTER TABLE IF EXISTS public.devoluciones_proveedor
  VALIDATE CONSTRAINT ck_devoluciones_proveedor_estado_valid;
ALTER TABLE IF EXISTS public.devoluciones_proveedor
  VALIDATE CONSTRAINT ck_devoluciones_proveedor_totals_nonnegative;
ALTER TABLE IF EXISTS public.devoluciones_proveedor
  VALIDATE CONSTRAINT ck_devoluciones_proveedor_moneda_iso3;

ALTER TABLE IF EXISTS public.devolucion_items
  VALIDATE CONSTRAINT ck_devolucion_items_ids_required;
ALTER TABLE IF EXISTS public.devolucion_items
  VALIDATE CONSTRAINT ck_devolucion_items_descripcion_nonempty;
ALTER TABLE IF EXISTS public.devolucion_items
  VALIDATE CONSTRAINT ck_devolucion_items_montos_valid;

-- ----------------------------------------------------------------------------
-- Indices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizaciones_compra_tenant_numero_runtime
ON public.cotizaciones_compra (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_devoluciones_proveedor_tenant_numero_runtime
ON public.devoluciones_proveedor (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_oc_aprobaciones_pending_scope_runtime
ON public.oc_aprobaciones (tenant_id, orden_id, nivel, upper(aprobador_id))
WHERE tenant_id IS NOT NULL
  AND orden_id IS NOT NULL
  AND aprobador_id IS NOT NULL
  AND btrim(aprobador_id) <> ''
  AND estado = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_cotizacion_compra_detalles_tenant_producto_runtime
ON public.cotizacion_compra_detalles (tenant_id, producto_id)
WHERE tenant_id IS NOT NULL
  AND producto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devolucion_items_tenant_producto_runtime
ON public.devolucion_items (tenant_id, producto_id)
WHERE tenant_id IS NOT NULL
  AND producto_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cotizaciones_compra');
SELECT app.apply_tenant_policy('public', 'cotizacion_compra_detalles');
SELECT app.apply_tenant_policy('public', 'oc_aprobaciones');
SELECT app.apply_tenant_policy('public', 'devoluciones_proveedor');
SELECT app.apply_tenant_policy('public', 'devolucion_items');

COMMIT;
