-- ============================================================================
-- 138__logistica_pedidos_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para logística de pedidos.
-- Tablas: logistica_eventos, pedido_backorders, pedido_despachos, pedido_gres.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.pedido_backorders pb
SET
  tenant_id = pvd.tenant_id,
  pedido_id = COALESCE(pb.pedido_id, pvd.pedido_id),
  producto_id = COALESCE(pb.producto_id, pvd.producto_id)
FROM public.pedidos_venta_detalle pvd
WHERE pb.detalle_id = pvd.id
  AND (
    pb.tenant_id IS NULL OR pb.tenant_id <> pvd.tenant_id
    OR pb.pedido_id IS NULL
    OR pb.producto_id IS NULL
  );

UPDATE public.pedido_backorders pb
SET tenant_id = p.tenant_id
FROM public.pedidos_venta p
WHERE pb.pedido_id = p.id
  AND p.tenant_id IS NOT NULL
  AND pb.tenant_id IS NULL;

UPDATE public.pedido_despachos pd
SET
  tenant_id = pvd.tenant_id,
  pedido_id = COALESCE(pd.pedido_id, pvd.pedido_id),
  producto_id = COALESCE(pd.producto_id, pvd.producto_id)
FROM public.pedidos_venta_detalle pvd
WHERE pd.detalle_id = pvd.id
  AND (
    pd.tenant_id IS NULL OR pd.tenant_id <> pvd.tenant_id
    OR pd.pedido_id IS NULL
    OR pd.producto_id IS NULL
  );

UPDATE public.pedido_despachos pd
SET tenant_id = p.tenant_id
FROM public.pedidos_venta p
WHERE pd.pedido_id = p.id
  AND p.tenant_id IS NOT NULL
  AND pd.tenant_id IS NULL;

UPDATE public.pedido_gres pg
SET tenant_id = p.tenant_id
FROM public.pedidos_venta p
WHERE pg.pedido_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (pg.tenant_id IS NULL OR pg.tenant_id <> p.tenant_id);

UPDATE public.pedido_gres pg
SET tenant_id = g.tenant_id
FROM public.gre_guias g
WHERE pg.gre_id = g.id
  AND g.tenant_id IS NOT NULL
  AND pg.tenant_id IS NULL;

UPDATE public.logistica_eventos le
SET tenant_id = p.tenant_id
FROM public.pedidos_venta p
WHERE le.pedido_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (le.tenant_id IS NULL OR le.tenant_id <> p.tenant_id);

-- ----------------------------------------------------------------------------
-- FKs para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('pedido_backorders', 'pedido_id', 'pedidos_venta', 'id', 'fk_pedido_backorders_pedido_id');
SELECT app.add_fk_if_possible('pedido_backorders', 'detalle_id', 'pedidos_venta_detalle', 'id', 'fk_pedido_backorders_detalle_id');
SELECT app.add_fk_if_possible('pedido_backorders', 'producto_id', 'productos', 'id', 'fk_pedido_backorders_producto_id');
SELECT app.add_fk_if_possible('pedido_backorders', 'almacen_id', 'almacenes', 'id', 'fk_pedido_backorders_almacen_id');

SELECT app.add_fk_if_possible('pedido_despachos', 'pedido_id', 'pedidos_venta', 'id', 'pedido_despachos_pedido_id_fkey');
SELECT app.add_fk_if_possible('pedido_despachos', 'detalle_id', 'pedidos_venta_detalle', 'id', 'pedido_despachos_detalle_id_fkey');
SELECT app.add_fk_if_possible('pedido_despachos', 'producto_id', 'productos', 'id', 'pedido_despachos_producto_id_fkey');
SELECT app.add_fk_if_possible('pedido_despachos', 'almacen_id', 'almacenes', 'id', 'pedido_despachos_almacen_id_fkey');
SELECT app.add_fk_if_possible('pedido_despachos', 'ubicacion_id', 'almacen_ubicaciones', 'id', 'pedido_despachos_ubicacion_id_fkey');

SELECT app.add_fk_if_possible('pedido_gres', 'pedido_id', 'pedidos_venta', 'id', 'pedido_gres_pedido_id_fkey');
SELECT app.add_fk_if_possible('pedido_gres', 'gre_id', 'gre_guias', 'id', 'pedido_gres_gre_id_fkey');

SELECT app.add_fk_if_possible('logistica_eventos', 'pedido_id', 'pedidos_venta', 'id', 'logistica_eventos_pedido_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar unicidad tenant+pedido+gre.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    pg.id,
    row_number() OVER (
      PARTITION BY pg.tenant_id, pg.pedido_id, pg.gre_id
      ORDER BY COALESCE(pg.updated_at, pg.creado_en, pg.created_at, now()) DESC, pg.id::text DESC
    ) AS rn
  FROM public.pedido_gres pg
  WHERE pg.tenant_id IS NOT NULL
    AND pg.pedido_id IS NOT NULL
    AND pg.gre_id IS NOT NULL
)
DELETE FROM public.pedido_gres pg
USING ranked r
WHERE pg.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_pedido_backorders_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_pedido_id uuid;
  v_producto_id uuid;
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.detalle_id := app.to_uuid_or_null(COALESCE(NEW.detalle_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));

  IF NEW.detalle_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'detalle_id es obligatorio en pedido_backorders', ERRCODE = '23514';
  END IF;

  SELECT d.tenant_id, d.pedido_id, d.producto_id
  INTO v_tenant, v_pedido_id, v_producto_id
  FROM public.pedidos_venta_detalle d
  WHERE d.id = NEW.detalle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Detalle de pedido no existe: %s', NEW.detalle_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant;
  ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con detalle en pedido_backorders', ERRCODE = '23514';
  END IF;

  IF NEW.pedido_id IS NULL THEN
    NEW.pedido_id := v_pedido_id;
  ELSIF v_pedido_id IS NOT NULL AND NEW.pedido_id <> v_pedido_id THEN
    RAISE EXCEPTION USING MESSAGE = 'pedido_id no coincide con detalle en pedido_backorders', ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NULL THEN
    NEW.producto_id := v_producto_id;
  ELSIF v_producto_id IS NOT NULL AND NEW.producto_id <> v_producto_id THEN
    RAISE EXCEPTION USING MESSAGE = 'producto_id no coincide con detalle en pedido_backorders', ERRCODE = '23514';
  END IF;

  IF NEW.pedido_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Pedido no existe: %s', NEW.pedido_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con pedido en pedido_backorders', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.almacen_id IS NOT NULL THEN
    SELECT a.tenant_id INTO v_ref_tenant FROM public.almacenes a WHERE a.id = NEW.almacen_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Almacén no existe: %s', NEW.almacen_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con almacén en pedido_backorders', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en pedido_backorders', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_backorders_tenant_consistency ON public.pedido_backorders;
CREATE TRIGGER trg_enforce_pedido_backorders_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, detalle_id, producto_id, almacen_id
ON public.pedido_backorders
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedido_backorders_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_pedido_despachos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_pedido_id uuid;
  v_producto_id uuid;
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.detalle_id := app.to_uuid_or_null(COALESCE(NEW.detalle_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  NEW.ubicacion_id := app.to_uuid_or_null(COALESCE(NEW.ubicacion_id::text, ''));

  IF NEW.detalle_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'detalle_id es obligatorio en pedido_despachos', ERRCODE = '23514';
  END IF;

  SELECT d.tenant_id, d.pedido_id, d.producto_id
  INTO v_tenant, v_pedido_id, v_producto_id
  FROM public.pedidos_venta_detalle d
  WHERE d.id = NEW.detalle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Detalle de pedido no existe: %s', NEW.detalle_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant;
  ELSIF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con detalle en pedido_despachos', ERRCODE = '23514';
  END IF;

  IF NEW.pedido_id IS NULL THEN
    NEW.pedido_id := v_pedido_id;
  ELSIF v_pedido_id IS NOT NULL AND NEW.pedido_id <> v_pedido_id THEN
    RAISE EXCEPTION USING MESSAGE = 'pedido_id no coincide con detalle en pedido_despachos', ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NULL THEN
    NEW.producto_id := v_producto_id;
  ELSIF v_producto_id IS NOT NULL AND NEW.producto_id <> v_producto_id THEN
    RAISE EXCEPTION USING MESSAGE = 'producto_id no coincide con detalle en pedido_despachos', ERRCODE = '23514';
  END IF;

  IF NEW.pedido_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Pedido no existe: %s', NEW.pedido_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con pedido en pedido_despachos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.almacen_id IS NOT NULL THEN
    SELECT a.tenant_id INTO v_ref_tenant FROM public.almacenes a WHERE a.id = NEW.almacen_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Almacén no existe: %s', NEW.almacen_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con almacén en pedido_despachos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.ubicacion_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.almacen_ubicaciones u WHERE u.id = NEW.ubicacion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Ubicación no existe: %s', NEW.ubicacion_id), ERRCODE = '23503';
    END IF;
    IF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con ubicación en pedido_despachos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en pedido_despachos', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_despachos_tenant_consistency ON public.pedido_despachos;
CREATE TRIGGER trg_enforce_pedido_despachos_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, detalle_id, producto_id, almacen_id, ubicacion_id
ON public.pedido_despachos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedido_despachos_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_pedido_gres_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido_tenant uuid;
  v_gre_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.gre_id := app.to_uuid_or_null(COALESCE(NEW.gre_id::text, ''));

  IF NEW.pedido_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'pedido_id es obligatorio en pedido_gres', ERRCODE = '23514';
  END IF;
  IF NEW.gre_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'gre_id es obligatorio en pedido_gres', ERRCODE = '23514';
  END IF;

  SELECT p.tenant_id INTO v_pedido_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Pedido no existe: %s', NEW.pedido_id), ERRCODE = '23503';
  END IF;

  SELECT g.tenant_id INTO v_gre_tenant FROM public.gre_guias g WHERE g.id = NEW.gre_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('GRE no existe: %s', NEW.gre_id), ERRCODE = '23503';
  END IF;

  IF v_pedido_tenant IS NOT NULL AND v_gre_tenant IS NOT NULL AND v_pedido_tenant <> v_gre_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide entre pedido y GRE en pedido_gres', ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := COALESCE(v_pedido_tenant, v_gre_tenant);
  END IF;

  IF v_pedido_tenant IS NOT NULL AND NEW.tenant_id <> v_pedido_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con pedido en pedido_gres', ERRCODE = '23514';
  END IF;
  IF v_gre_tenant IS NOT NULL AND NEW.tenant_id <> v_gre_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con GRE en pedido_gres', ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en pedido_gres', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_gres_tenant_consistency ON public.pedido_gres;
CREATE TRIGGER trg_enforce_pedido_gres_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, gre_id
ON public.pedido_gres
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedido_gres_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_logistica_eventos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.registrado_por := app.to_uuid_or_null(COALESCE(NEW.registrado_por::text, ''));

  IF NEW.pedido_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'pedido_id es obligatorio en logistica_eventos', ERRCODE = '23514';
  END IF;

  SELECT p.tenant_id INTO v_pedido_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Pedido no existe: %s', NEW.pedido_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_pedido_tenant;
  ELSIF v_pedido_tenant IS NOT NULL AND NEW.tenant_id <> v_pedido_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con pedido en logistica_eventos', ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en logistica_eventos', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_logistica_eventos_tenant_consistency ON public.logistica_eventos;
CREATE TRIGGER trg_enforce_logistica_eventos_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, registrado_por
ON public.logistica_eventos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_logistica_eventos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio (idempotentes).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.pedido_backorders') IS NOT NULL THEN
    ALTER TABLE public.pedido_backorders
      ADD CONSTRAINT ck_pedido_backorders_ids_required
      CHECK (tenant_id IS NOT NULL AND pedido_id IS NOT NULL AND detalle_id IS NOT NULL AND producto_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.pedido_backorders
      ADD CONSTRAINT ck_pedido_backorders_cantidades_valid
      CHECK (
        cantidad_comprometida >= 0
        AND cantidad_despachada >= 0
        AND cantidad_pendiente >= 0
        AND cantidad_despachada <= cantidad_comprometida
      ) NOT VALID;
    ALTER TABLE public.pedido_backorders
      ADD CONSTRAINT ck_pedido_backorders_pendiente_consistente
      CHECK (round((cantidad_comprometida - cantidad_despachada)::numeric, 2) = round(cantidad_pendiente::numeric, 2)) NOT VALID;
    ALTER TABLE public.pedido_backorders
      ADD CONSTRAINT ck_pedido_backorders_estado_valid
      CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'CERRADO')) NOT VALID;
    ALTER TABLE public.pedido_backorders
      ADD CONSTRAINT ck_pedido_backorders_prioridad_range
      CHECK (prioridad BETWEEN 1 AND 5) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.pedido_despachos') IS NOT NULL THEN
    ALTER TABLE public.pedido_despachos
      ADD CONSTRAINT ck_pedido_despachos_ids_required
      CHECK (tenant_id IS NOT NULL AND pedido_id IS NOT NULL AND detalle_id IS NOT NULL AND producto_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.pedido_despachos
      ADD CONSTRAINT ck_pedido_despachos_cantidad_positive
      CHECK (cantidad > 0) NOT VALID;
    ALTER TABLE public.pedido_despachos
      ADD CONSTRAINT ck_pedido_despachos_estado_valid
      CHECK (estado IN ('REGISTRADO', 'ANULADO')) NOT VALID;
    ALTER TABLE public.pedido_despachos
      ADD CONSTRAINT ck_pedido_despachos_lote_length
      CHECK (lote IS NULL OR length(lote) <= 80) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.pedido_gres') IS NOT NULL THEN
    ALTER TABLE public.pedido_gres
      ADD CONSTRAINT ck_pedido_gres_ids_required
      CHECK (tenant_id IS NOT NULL AND pedido_id IS NOT NULL AND gre_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.pedido_gres
      ADD CONSTRAINT ck_pedido_gres_estado_valid
      CHECK (estado IN ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO')) NOT VALID;
    ALTER TABLE public.pedido_gres
      ADD CONSTRAINT ck_pedido_gres_creado_en_required
      CHECK (creado_en IS NOT NULL) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.logistica_eventos') IS NOT NULL THEN
    ALTER TABLE public.logistica_eventos
      ADD CONSTRAINT ck_logistica_eventos_ids_required
      CHECK (tenant_id IS NOT NULL AND pedido_id IS NOT NULL AND tipo IS NOT NULL) NOT VALID;
    ALTER TABLE public.logistica_eventos
      ADD CONSTRAINT ck_logistica_eventos_tipo_valid
      CHECK (tipo IN ('PICKING', 'PACKING', 'DESPACHO', 'TRANSITO', 'ENTREGA', 'BACKORDER')) NOT VALID;
    ALTER TABLE public.logistica_eventos
      ADD CONSTRAINT ck_logistica_eventos_datos_object
      CHECK (datos IS NULL OR jsonb_typeof(datos) = 'object') NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE IF EXISTS public.pedido_backorders VALIDATE CONSTRAINT ck_pedido_backorders_ids_required;
ALTER TABLE IF EXISTS public.pedido_backorders VALIDATE CONSTRAINT ck_pedido_backorders_cantidades_valid;
ALTER TABLE IF EXISTS public.pedido_backorders VALIDATE CONSTRAINT ck_pedido_backorders_pendiente_consistente;
ALTER TABLE IF EXISTS public.pedido_backorders VALIDATE CONSTRAINT ck_pedido_backorders_estado_valid;
ALTER TABLE IF EXISTS public.pedido_backorders VALIDATE CONSTRAINT ck_pedido_backorders_prioridad_range;

ALTER TABLE IF EXISTS public.pedido_despachos VALIDATE CONSTRAINT ck_pedido_despachos_ids_required;
ALTER TABLE IF EXISTS public.pedido_despachos VALIDATE CONSTRAINT ck_pedido_despachos_cantidad_positive;
ALTER TABLE IF EXISTS public.pedido_despachos VALIDATE CONSTRAINT ck_pedido_despachos_estado_valid;
ALTER TABLE IF EXISTS public.pedido_despachos VALIDATE CONSTRAINT ck_pedido_despachos_lote_length;

ALTER TABLE IF EXISTS public.pedido_gres VALIDATE CONSTRAINT ck_pedido_gres_ids_required;
ALTER TABLE IF EXISTS public.pedido_gres VALIDATE CONSTRAINT ck_pedido_gres_estado_valid;
ALTER TABLE IF EXISTS public.pedido_gres VALIDATE CONSTRAINT ck_pedido_gres_creado_en_required;

ALTER TABLE IF EXISTS public.logistica_eventos VALIDATE CONSTRAINT ck_logistica_eventos_ids_required;
ALTER TABLE IF EXISTS public.logistica_eventos VALIDATE CONSTRAINT ck_logistica_eventos_tipo_valid;
ALTER TABLE IF EXISTS public.logistica_eventos VALIDATE CONSTRAINT ck_logistica_eventos_datos_object;

-- ----------------------------------------------------------------------------
-- Índices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS pedido_gres_unique
ON public.pedido_gres (tenant_id, pedido_id, gre_id)
WHERE tenant_id IS NOT NULL
  AND pedido_id IS NOT NULL
  AND gre_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_tenant_detalle_scope
ON public.pedido_backorders (tenant_id, detalle_id)
WHERE tenant_id IS NOT NULL
  AND detalle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logistica_eventos_tenant_tipo_scope
ON public.logistica_eventos (tenant_id, tipo, registrado_en DESC)
WHERE tenant_id IS NOT NULL
  AND tipo IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'logistica_eventos');
SELECT app.apply_tenant_policy('public', 'pedido_backorders');
SELECT app.apply_tenant_policy('public', 'pedido_despachos');
SELECT app.apply_tenant_policy('public', 'pedido_gres');

COMMIT;
