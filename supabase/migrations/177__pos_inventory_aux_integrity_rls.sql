-- ============================================================================
-- 177__pos_inventory_aux_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- configuracion_caja, detalle_ventas_pos, producto_existencias, eventos_pos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant + normalizacion defensiva de relaciones.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_caja c
SET tenant_id = cj.tenant_id
FROM public.cajas cj
WHERE c.caja_id = cj.id
  AND cj.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> cj.tenant_id);

UPDATE public.detalle_ventas_pos d
SET
  venta_pos_id = COALESCE(d.venta_pos_id, d.venta_id),
  venta_id = COALESCE(d.venta_id, d.venta_pos_id)
WHERE d.id IS NOT NULL
  AND (d.venta_pos_id IS NULL OR d.venta_id IS NULL);

UPDATE public.detalle_ventas_pos d
SET
  tenant_id = v.tenant_id,
  venta_pos_id = COALESCE(d.venta_pos_id, v.id),
  venta_id = COALESCE(d.venta_id, v.id)
FROM public.ventas_pos v
WHERE COALESCE(d.venta_pos_id, d.venta_id) = v.id
  AND (
    d.tenant_id IS NULL
    OR (v.tenant_id IS NOT NULL AND d.tenant_id <> v.tenant_id)
    OR d.venta_pos_id IS NULL
    OR d.venta_id IS NULL
  );

UPDATE public.detalle_ventas_pos d
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE d.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND d.tenant_id IS NULL;

UPDATE public.producto_existencias pe
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE pe.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (pe.tenant_id IS NULL OR pe.tenant_id <> p.tenant_id);

UPDATE public.producto_existencias pe
SET tenant_id = a.tenant_id
FROM public.almacenes a
WHERE pe.almacen_id = a.id
  AND a.tenant_id IS NOT NULL
  AND (pe.tenant_id IS NULL OR pe.tenant_id <> a.tenant_id);

UPDATE public.producto_existencias pe
SET
  tenant_id = COALESCE(pe.tenant_id, au.tenant_id),
  almacen_id = COALESCE(pe.almacen_id, au.almacen_id)
FROM public.almacen_ubicaciones au
WHERE pe.ubicacion_id = au.id
  AND (
    (au.tenant_id IS NOT NULL AND (pe.tenant_id IS NULL OR pe.tenant_id <> au.tenant_id))
    OR (pe.almacen_id IS NULL AND au.almacen_id IS NOT NULL)
  );

UPDATE public.eventos_pos e
SET tenant_id = s.tenant_id
FROM public.sesiones_caja s
WHERE e.sesion_caja_id = s.id
  AND s.tenant_id IS NOT NULL
  AND (e.tenant_id IS NULL OR e.tenant_id <> s.tenant_id);

UPDATE public.eventos_pos e
SET tenant_id = v.tenant_id
FROM public.ventas_pos v
WHERE e.venta_id = v.id
  AND v.tenant_id IS NOT NULL
  AND e.tenant_id IS NULL;

UPDATE public.eventos_pos e
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE e.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND e.tenant_id IS NULL;

UPDATE public.eventos_pos e
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE e.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND e.tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- Dedupe por scope previo a unicidad.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.caja_id
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.configuracion_caja c
  WHERE c.tenant_id IS NOT NULL
)
DELETE FROM public.configuracion_caja c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ordered AS (
  SELECT
    d.id,
    row_number() OVER (
      PARTITION BY d.tenant_id, COALESCE(d.venta_pos_id, d.venta_id)
      ORDER BY
        CASE WHEN d.item_index IS NULL OR d.item_index < 1 THEN 2147483647 ELSE d.item_index END,
        COALESCE(d.created_at, now()),
        d.id::text
    ) AS rn
  FROM public.detalle_ventas_pos d
  WHERE d.tenant_id IS NOT NULL
    AND COALESCE(d.venta_pos_id, d.venta_id) IS NOT NULL
)
UPDATE public.detalle_ventas_pos d
SET
  item_index = o.rn,
  updated_at = now()
FROM ordered o
WHERE d.id = o.id
  AND COALESCE(d.item_index, 0) <> o.rn;

WITH dups AS (
  SELECT tenant_id, producto_id, almacen_id
  FROM public.producto_existencias
  WHERE tenant_id IS NOT NULL
    AND producto_id IS NOT NULL
    AND almacen_id IS NOT NULL
  GROUP BY tenant_id, producto_id, almacen_id
  HAVING COUNT(*) > 1
),
agg AS (
  SELECT
    pe.tenant_id,
    pe.producto_id,
    pe.almacen_id,
    (array_agg(pe.id ORDER BY COALESCE(pe.updated_at, pe.created_at, now()) DESC, pe.id::text DESC))[1] AS keep_id,
    SUM(COALESCE(pe.stock_actual, 0)) AS stock_actual_sum,
    SUM(COALESCE(pe.stock_reservado, 0)) AS stock_reservado_sum,
    SUM(COALESCE(pe.stock_danado, 0)) AS stock_danado_sum
  FROM public.producto_existencias pe
  JOIN dups d
    ON d.tenant_id = pe.tenant_id
   AND d.producto_id = pe.producto_id
   AND d.almacen_id = pe.almacen_id
  GROUP BY pe.tenant_id, pe.producto_id, pe.almacen_id
),
upd AS (
  UPDATE public.producto_existencias pe
  SET
    stock_actual = GREATEST(a.stock_actual_sum, a.stock_reservado_sum + a.stock_danado_sum),
    stock_reservado = GREATEST(a.stock_reservado_sum, 0),
    stock_danado = GREATEST(a.stock_danado_sum, 0),
    updated_at = now()
  FROM agg a
  WHERE pe.id = a.keep_id
  RETURNING a.tenant_id, a.producto_id, a.almacen_id, a.keep_id
)
DELETE FROM public.producto_existencias pe
USING upd u
WHERE pe.tenant_id = u.tenant_id
  AND pe.producto_id = u.producto_id
  AND pe.almacen_id = u.almacen_id
  AND pe.id <> u.keep_id;

-- ----------------------------------------------------------------------------
-- FKs runtime para embeds/joins.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('configuracion_caja', 'caja_id', 'cajas', 'id', 'configuracion_caja_caja_id_fkey_runtime');
SELECT app.add_fk_if_possible('configuracion_caja', 'updated_by', 'usuarios_sistema', 'id', 'configuracion_caja_updated_by_fkey_runtime');

SELECT app.add_fk_if_possible('detalle_ventas_pos', 'venta_id', 'ventas_pos', 'id', 'fk_detalle_ventas_pos_venta_id');
SELECT app.add_fk_if_possible('detalle_ventas_pos', 'venta_pos_id', 'ventas_pos', 'id', 'detalle_ventas_pos_venta_pos_id_fkey_runtime');
SELECT app.add_fk_if_possible('detalle_ventas_pos', 'producto_id', 'productos', 'id', 'fk_detalle_ventas_pos_producto_id');

SELECT app.add_fk_if_possible('producto_existencias', 'producto_id', 'productos', 'id', 'producto_existencias_producto_id_fkey_runtime');
SELECT app.add_fk_if_possible('producto_existencias', 'almacen_id', 'almacenes', 'id', 'producto_existencias_almacen_id_fkey_runtime');
SELECT app.add_fk_if_possible('producto_existencias', 'ubicacion_id', 'almacen_ubicaciones', 'id', 'producto_existencias_ubicacion_id_fkey_runtime');

SELECT app.add_fk_if_possible('eventos_pos', 'sesion_caja_id', 'sesiones_caja', 'id', 'eventos_pos_sesion_caja_id_fkey_runtime');
SELECT app.add_fk_if_possible('eventos_pos', 'usuario_id', 'usuarios_sistema', 'id', 'eventos_pos_usuario_id_fkey_runtime');
SELECT app.add_fk_if_possible('eventos_pos', 'supervisor_id', 'usuarios_sistema', 'id', 'eventos_pos_supervisor_id_fkey_runtime');
SELECT app.add_fk_if_possible('eventos_pos', 'venta_id', 'ventas_pos', 'id', 'eventos_pos_venta_id_fkey_runtime');
SELECT app.add_fk_if_possible('eventos_pos', 'producto_id', 'productos', 'id', 'eventos_pos_producto_id_fkey_runtime');

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_configuracion_caja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_caja uuid;
  v_tenant_usuario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));

  IF NEW.caja_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_caja FROM public.cajas c WHERE c.id = NEW.caja_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Caja no existe: %s', NEW.caja_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_caja;
    ELSIF v_tenant_caja IS NOT NULL AND NEW.tenant_id <> v_tenant_caja THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con caja en configuracion_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.updated_by IS NOT NULL THEN
    SELECT u.tenant_id INTO v_tenant_usuario FROM public.usuarios_sistema u WHERE u.id = NEW.updated_by;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('updated_by no existe: %s', NEW.updated_by), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_usuario;
    ELSIF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con updated_by en configuracion_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en configuracion_caja', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_configuracion_caja_tenant_consistency ON public.configuracion_caja;
CREATE TRIGGER trg_enforce_configuracion_caja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.configuracion_caja
FOR EACH ROW
EXECUTE FUNCTION app.enforce_configuracion_caja_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_detalle_ventas_pos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_venta uuid;
  v_tenant_producto uuid;
  v_venta uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_pos_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.venta_pos_id::text, '')), app.to_uuid_or_null(COALESCE(NEW.venta_id::text, '')));
  NEW.venta_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.venta_id::text, '')), NEW.venta_pos_id);
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  v_venta := COALESCE(NEW.venta_pos_id, NEW.venta_id);

  IF v_venta IS NOT NULL THEN
    SELECT v.tenant_id INTO v_tenant_venta FROM public.ventas_pos v WHERE v.id = v_venta;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Venta POS no existe: %s', v_venta), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_venta;
    ELSIF v_tenant_venta IS NOT NULL AND NEW.tenant_id <> v_tenant_venta THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con ventas_pos en detalle_ventas_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_producto FROM public.productos p WHERE p.id = NEW.producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_producto;
    ELSIF v_tenant_producto IS NOT NULL AND NEW.tenant_id <> v_tenant_producto THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con productos en detalle_ventas_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en detalle_ventas_pos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_detalle_ventas_pos_tenant_consistency ON public.detalle_ventas_pos;
CREATE TRIGGER trg_enforce_detalle_ventas_pos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.detalle_ventas_pos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_detalle_ventas_pos_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_producto_existencias_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_producto uuid;
  v_tenant_almacen uuid;
  v_tenant_ubicacion uuid;
  v_almacen_ubicacion uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  NEW.ubicacion_id := app.to_uuid_or_null(COALESCE(NEW.ubicacion_id::text, ''));

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_producto FROM public.productos p WHERE p.id = NEW.producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_producto;
    ELSIF v_tenant_producto IS NOT NULL AND NEW.tenant_id <> v_tenant_producto THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con productos en producto_existencias', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.almacen_id IS NOT NULL THEN
    SELECT a.tenant_id INTO v_tenant_almacen FROM public.almacenes a WHERE a.id = NEW.almacen_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Almacen no existe: %s', NEW.almacen_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_almacen;
    ELSIF v_tenant_almacen IS NOT NULL AND NEW.tenant_id <> v_tenant_almacen THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con almacenes en producto_existencias', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.ubicacion_id IS NOT NULL THEN
    SELECT au.tenant_id, au.almacen_id INTO v_tenant_ubicacion, v_almacen_ubicacion
    FROM public.almacen_ubicaciones au
    WHERE au.id = NEW.ubicacion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Ubicacion no existe: %s', NEW.ubicacion_id), ERRCODE = '23503';
    END IF;
    IF NEW.almacen_id IS NULL THEN
      NEW.almacen_id := v_almacen_ubicacion;
    ELSIF v_almacen_ubicacion IS NOT NULL AND NEW.almacen_id <> v_almacen_ubicacion THEN
      RAISE EXCEPTION USING MESSAGE = 'ubicacion_id no pertenece al almacen_id en producto_existencias', ERRCODE = '23514';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_ubicacion;
    ELSIF v_tenant_ubicacion IS NOT NULL AND NEW.tenant_id <> v_tenant_ubicacion THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con almacen_ubicaciones en producto_existencias', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL OR NEW.producto_id IS NULL OR NEW.almacen_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id/producto_id/almacen_id son obligatorios en producto_existencias', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_producto_existencias_tenant_consistency ON public.producto_existencias;
CREATE TRIGGER trg_enforce_producto_existencias_tenant_consistency
BEFORE INSERT OR UPDATE ON public.producto_existencias
FOR EACH ROW
EXECUTE FUNCTION app.enforce_producto_existencias_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_eventos_pos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.supervisor_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT s.tenant_id INTO v_tenant FROM public.sesiones_caja s WHERE s.id = NEW.sesion_caja_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Sesion de caja no existe: %s', NEW.sesion_caja_id), ERRCODE = '23503';
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con sesiones_caja en eventos_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.venta_id IS NOT NULL THEN
    SELECT v.tenant_id INTO v_tenant FROM public.ventas_pos v WHERE v.id = NEW.venta_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Venta POS no existe: %s', NEW.venta_id), ERRCODE = '23503';
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con ventas_pos en eventos_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant FROM public.productos p WHERE p.id = NEW.producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con productos en eventos_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Usuario no existe: %s', NEW.usuario_id), ERRCODE = '23503';
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario_id en eventos_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.supervisor_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.supervisor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Supervisor no existe: %s', NEW.supervisor_id), ERRCODE = '23503';
    END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con supervisor_id en eventos_pos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en eventos_pos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_eventos_pos_tenant_consistency ON public.eventos_pos;
CREATE TRIGGER trg_enforce_eventos_pos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.eventos_pos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_eventos_pos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints + validacion.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_caja DROP CONSTRAINT IF EXISTS ck_configuracion_caja_ids_required_runtime;
ALTER TABLE public.configuracion_caja ADD CONSTRAINT ck_configuracion_caja_ids_required_runtime CHECK (tenant_id IS NOT NULL);
ALTER TABLE public.configuracion_caja DROP CONSTRAINT IF EXISTS ck_configuracion_caja_montos_runtime;
ALTER TABLE public.configuracion_caja ADD CONSTRAINT ck_configuracion_caja_montos_runtime CHECK (
  monto_apertura_min >= 0 AND monto_apertura_max > monto_apertura_min
  AND tolerancia_diferencia_cierre >= 0 AND retiro_max_sin_autorizacion >= 0 AND saldo_minimo_operativo >= 0
);
ALTER TABLE public.configuracion_caja DROP CONSTRAINT IF EXISTS ck_configuracion_caja_moneda_iso_runtime;
ALTER TABLE public.configuracion_caja ADD CONSTRAINT ck_configuracion_caja_moneda_iso_runtime CHECK (moneda ~ '^[A-Z]{3}$');
ALTER TABLE public.configuracion_caja DROP CONSTRAINT IF EXISTS ck_configuracion_caja_estado_runtime;
ALTER TABLE public.configuracion_caja ADD CONSTRAINT ck_configuracion_caja_estado_runtime CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADA'));

ALTER TABLE public.detalle_ventas_pos DROP CONSTRAINT IF EXISTS ck_detalle_ventas_pos_ids_required_runtime;
ALTER TABLE public.detalle_ventas_pos ADD CONSTRAINT ck_detalle_ventas_pos_ids_required_runtime CHECK (tenant_id IS NOT NULL AND COALESCE(venta_pos_id, venta_id) IS NOT NULL);
ALTER TABLE public.detalle_ventas_pos DROP CONSTRAINT IF EXISTS ck_detalle_ventas_pos_item_index_runtime;
ALTER TABLE public.detalle_ventas_pos ADD CONSTRAINT ck_detalle_ventas_pos_item_index_runtime CHECK (item_index IS NULL OR item_index >= 1);
ALTER TABLE public.detalle_ventas_pos DROP CONSTRAINT IF EXISTS ck_detalle_ventas_pos_montos_runtime;
ALTER TABLE public.detalle_ventas_pos ADD CONSTRAINT ck_detalle_ventas_pos_montos_runtime CHECK (
  cantidad > 0 AND precio_unitario >= 0 AND descuento >= 0 AND impuesto >= 0 AND subtotal >= 0 AND total >= 0
);
ALTER TABLE public.detalle_ventas_pos DROP CONSTRAINT IF EXISTS ck_detalle_ventas_pos_estado_runtime;
ALTER TABLE public.detalle_ventas_pos ADD CONSTRAINT ck_detalle_ventas_pos_estado_runtime CHECK (estado IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'CONFIRMADO', 'ANULADO', 'DEVUELTO'));

ALTER TABLE public.producto_existencias DROP CONSTRAINT IF EXISTS ck_producto_existencias_ids_required_runtime;
ALTER TABLE public.producto_existencias ADD CONSTRAINT ck_producto_existencias_ids_required_runtime CHECK (tenant_id IS NOT NULL AND producto_id IS NOT NULL AND almacen_id IS NOT NULL);
ALTER TABLE public.producto_existencias DROP CONSTRAINT IF EXISTS ck_producto_existencias_stocks_runtime;
ALTER TABLE public.producto_existencias ADD CONSTRAINT ck_producto_existencias_stocks_runtime CHECK (
  stock_actual >= 0 AND stock_reservado >= 0 AND stock_danado >= 0 AND stock_minimo >= 0
  AND costo_promedio >= 0 AND stock_reservado + stock_danado <= stock_actual
);
ALTER TABLE public.producto_existencias DROP CONSTRAINT IF EXISTS ck_producto_existencias_estado_runtime;
ALTER TABLE public.producto_existencias ADD CONSTRAINT ck_producto_existencias_estado_runtime CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO'));

ALTER TABLE public.eventos_pos DROP CONSTRAINT IF EXISTS ck_eventos_pos_ids_runtime;
ALTER TABLE public.eventos_pos ADD CONSTRAINT ck_eventos_pos_ids_runtime CHECK (tenant_id IS NOT NULL AND tipo_evento IS NOT NULL AND "timestamp" IS NOT NULL);
ALTER TABLE public.eventos_pos DROP CONSTRAINT IF EXISTS ck_eventos_pos_estado_runtime;
ALTER TABLE public.eventos_pos ADD CONSTRAINT ck_eventos_pos_estado_runtime CHECK (estado IN ('ACTIVO', 'INACTIVO', 'ANULADO'));
ALTER TABLE public.eventos_pos DROP CONSTRAINT IF EXISTS ck_eventos_pos_riesgo_runtime;
ALTER TABLE public.eventos_pos ADD CONSTRAINT ck_eventos_pos_riesgo_runtime CHECK (riesgo_nivel IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO'));
ALTER TABLE public.eventos_pos DROP CONSTRAINT IF EXISTS ck_eventos_pos_alerta_runtime;
ALTER TABLE public.eventos_pos ADD CONSTRAINT ck_eventos_pos_alerta_runtime CHECK (procesado_alerta = false OR alertado_en IS NOT NULL);

ALTER TABLE public.configuracion_caja VALIDATE CONSTRAINT ck_configuracion_caja_ids_required_runtime;
ALTER TABLE public.configuracion_caja VALIDATE CONSTRAINT ck_configuracion_caja_montos_runtime;
ALTER TABLE public.configuracion_caja VALIDATE CONSTRAINT ck_configuracion_caja_moneda_iso_runtime;
ALTER TABLE public.configuracion_caja VALIDATE CONSTRAINT ck_configuracion_caja_estado_runtime;

ALTER TABLE public.detalle_ventas_pos VALIDATE CONSTRAINT ck_detalle_ventas_pos_ids_required_runtime;
ALTER TABLE public.detalle_ventas_pos VALIDATE CONSTRAINT ck_detalle_ventas_pos_item_index_runtime;
ALTER TABLE public.detalle_ventas_pos VALIDATE CONSTRAINT ck_detalle_ventas_pos_montos_runtime;
ALTER TABLE public.detalle_ventas_pos VALIDATE CONSTRAINT ck_detalle_ventas_pos_estado_runtime;

ALTER TABLE public.producto_existencias VALIDATE CONSTRAINT ck_producto_existencias_ids_required_runtime;
ALTER TABLE public.producto_existencias VALIDATE CONSTRAINT ck_producto_existencias_stocks_runtime;
ALTER TABLE public.producto_existencias VALIDATE CONSTRAINT ck_producto_existencias_estado_runtime;

ALTER TABLE public.eventos_pos VALIDATE CONSTRAINT ck_eventos_pos_ids_runtime;
ALTER TABLE public.eventos_pos VALIDATE CONSTRAINT ck_eventos_pos_estado_runtime;
ALTER TABLE public.eventos_pos VALIDATE CONSTRAINT ck_eventos_pos_riesgo_runtime;
ALTER TABLE public.eventos_pos VALIDATE CONSTRAINT ck_eventos_pos_alerta_runtime;

-- ----------------------------------------------------------------------------
-- Unicidad + indices.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_caja_tenant_caja
ON public.configuracion_caja (tenant_id, caja_id) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_detalle_ventas_pos_tenant_venta_item_runtime
ON public.detalle_ventas_pos (tenant_id, (COALESCE(venta_pos_id, venta_id)), item_index)
WHERE tenant_id IS NOT NULL
  AND COALESCE(venta_pos_id, venta_id) IS NOT NULL
  AND item_index IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_existencias_tenant_producto_almacen
ON public.producto_existencias (tenant_id, producto_id, almacen_id)
WHERE tenant_id IS NOT NULL
  AND producto_id IS NOT NULL
  AND almacen_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant_activo_runtime
ON public.configuracion_caja (tenant_id, activo, updated_at DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant_producto_lote_runtime
ON public.producto_existencias (tenant_id, producto_id, lote, fecha_expiracion)
WHERE tenant_id IS NOT NULL
  AND producto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_riesgo_alerta_runtime
ON public.eventos_pos (tenant_id, riesgo_nivel, procesado_alerta, "timestamp" DESC)
WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.configuracion_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.configuracion_caja FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_ventas_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_ventas_pos FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.producto_existencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.producto_existencias FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eventos_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eventos_pos FORCE ROW LEVEL SECURITY;

SELECT app.apply_tenant_policy('public', 'configuracion_caja');
SELECT app.apply_tenant_policy('public', 'detalle_ventas_pos');
SELECT app.apply_tenant_policy('public', 'producto_existencias');
SELECT app.apply_tenant_policy('public', 'eventos_pos');

COMMIT;
