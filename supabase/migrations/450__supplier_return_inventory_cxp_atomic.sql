-- ============================================================================
-- 450__supplier_return_inventory_cxp_atomic.sql
-- Devolución a proveedor: creación, emisión, inventario, ajuste de CxP y
-- outbox contable comparten una frontera transaccional e idempotente.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.devoluciones_proveedor
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS create_fingerprint text,
  ADD COLUMN IF NOT EXISTS emit_fingerprint text,
  ADD COLUMN IF NOT EXISTS emit_event_id uuid,
  ADD COLUMN IF NOT EXISTS emitted_result jsonb,
  ADD COLUMN IF NOT EXISTS cuenta_por_pagar_id uuid,
  ADD COLUMN IF NOT EXISTS ajuste_cxp_total numeric NOT NULL DEFAULT 0;

ALTER TABLE public.devolucion_items
  ADD COLUMN IF NOT EXISTS movimiento_id uuid,
  ADD COLUMN IF NOT EXISTS es_servicio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controla_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clasificacion_contable text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devoluciones_proveedor_cxp_id_fkey_450'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT devoluciones_proveedor_cxp_id_fkey_450
      FOREIGN KEY (cuenta_por_pagar_id)
      REFERENCES public.cuentas_por_pagar(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devolucion_items_movimiento_id_fkey_450'
      AND conrelid = 'public.devolucion_items'::regclass
  ) THEN
    ALTER TABLE public.devolucion_items
      ADD CONSTRAINT devolucion_items_movimiento_id_fkey_450
      FOREIGN KEY (movimiento_id)
      REFERENCES public.movimientos_inventario(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devolucion_items_clasificacion_450'
      AND conrelid = 'public.devolucion_items'::regclass
  ) THEN
    ALTER TABLE public.devolucion_items
      ADD CONSTRAINT ck_devolucion_items_clasificacion_450
      CHECK (clasificacion_contable IN ('MERCADERIA', 'SERVICIO', 'GASTO_NO_STOCK'))
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devoluciones_proveedor_ajuste_cxp_450'
      AND conrelid = 'public.devoluciones_proveedor'::regclass
  ) THEN
    ALTER TABLE public.devoluciones_proveedor
      ADD CONSTRAINT ck_devoluciones_proveedor_ajuste_cxp_450
      CHECK (ajuste_cxp_total >= 0) NOT VALID;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_devoluciones_proveedor_tenant_idempotency_450
  ON public.devoluciones_proveedor (tenant_id, idempotency_key)
  WHERE tenant_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_devoluciones_proveedor_tenant_emit_event_450
  ON public.devoluciones_proveedor (tenant_id, emit_event_id)
  WHERE tenant_id IS NOT NULL AND emit_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_devolucion_items_tenant_recepcion_item_450
  ON public.devolucion_items (tenant_id, devolucion_id, recepcion_item_id)
  WHERE tenant_id IS NOT NULL AND devolucion_id IS NOT NULL
    AND recepcion_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cxp_ajustes_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cuenta_por_pagar_id uuid NOT NULL REFERENCES public.cuentas_por_pagar(id) ON DELETE RESTRICT,
  devolucion_id uuid NOT NULL REFERENCES public.devoluciones_proveedor(id) ON DELETE RESTRICT,
  tipo text NOT NULL DEFAULT 'DEVOLUCION_PROVEEDOR',
  subtotal numeric NOT NULL,
  igv numeric NOT NULL,
  total numeric NOT NULL,
  total_anterior numeric NOT NULL,
  saldo_anterior numeric NOT NULL,
  total_nuevo numeric NOT NULL,
  saldo_nuevo numeric NOT NULL,
  moneda text NOT NULL,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cxp_ajustes_proveedor_montos_450 CHECK (
    subtotal >= 0 AND igv >= 0 AND total > 0
    AND total_anterior > 0 AND saldo_anterior >= 0
    AND total_nuevo >= 0 AND saldo_nuevo >= 0
  ),
  CONSTRAINT ck_cxp_ajustes_proveedor_moneda_450 CHECK (moneda ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxp_ajustes_proveedor_devolucion_450
  ON public.cxp_ajustes_proveedor (tenant_id, devolucion_id);
CREATE INDEX IF NOT EXISTS idx_cxp_ajustes_proveedor_cxp_450
  ON public.cxp_ajustes_proveedor (tenant_id, cuenta_por_pagar_id, created_at DESC);

ALTER TABLE public.cxp_ajustes_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cxp_ajustes_proveedor FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cxp_ajustes_proveedor FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.devoluciones_proveedor, public.devolucion_items
  FROM PUBLIC, anon, authenticated;

-- Los borradores creados por el flujo legado deben poder emitirse con la
-- misma clasificación que tuvo el item de recepción. No inventamos
-- movimientos ni resultados para devoluciones ya EMITIDAS: esas requieren
-- conciliación explícita al reintentar.
SELECT set_config('app.supplier_return_writer_450', 'on', true);
UPDATE public.devolucion_items di
SET es_servicio = coalesce(
      CASE WHEN ri.metadata ? 'es_servicio' THEN (ri.metadata->>'es_servicio')::boolean END,
      coalesce(p.es_servicio, false) OR lower(coalesce(p.tipo, '')) = 'servicio'
    ),
    controla_stock = coalesce(
      CASE WHEN ri.metadata ? 'controla_stock' THEN (ri.metadata->>'controla_stock')::boolean END,
      NOT (coalesce(p.es_servicio, false) OR lower(coalesce(p.tipo, '')) = 'servicio')
        AND coalesce(p.controla_stock, true)
    ),
    clasificacion_contable = coalesce(
      nullif(ri.metadata->>'clasificacion_contable', ''),
      CASE
        WHEN coalesce(p.es_servicio, false) OR lower(coalesce(p.tipo, '')) = 'servicio'
          THEN 'SERVICIO'
        WHEN NOT coalesce(p.controla_stock, true) THEN 'GASTO_NO_STOCK'
        ELSE 'MERCADERIA'
      END
    ),
    almacen_id = CASE
      WHEN coalesce(
        CASE WHEN ri.metadata ? 'controla_stock' THEN (ri.metadata->>'controla_stock')::boolean END,
        NOT (coalesce(p.es_servicio, false) OR lower(coalesce(p.tipo, '')) = 'servicio')
          AND coalesce(p.controla_stock, true)
      ) THEN coalesce(di.almacen_id, ri.almacen_id)
      ELSE NULL
    END,
    updated_at = now()
FROM public.recepcion_items ri
JOIN public.productos p ON p.id = ri.producto_id AND p.tenant_id = ri.tenant_id
WHERE di.recepcion_item_id = ri.id
  AND di.tenant_id = ri.tenant_id
  AND (di.clasificacion_contable IS NULL OR di.metadata->>'clasificacion_snapshot' IS NULL);
SELECT set_config('app.supplier_return_writer_450', 'off', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.devolucion_items di
    WHERE di.clasificacion_contable IS NULL
       OR (di.clasificacion_contable = 'MERCADERIA'
           AND (NOT di.controla_stock OR di.almacen_id IS NULL))
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_LEGACY_PREFLIGHT_FAILED: items sin clasificación/almacén reconciliable';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_devolucion_items_classification_required_450'
      AND conrelid = 'public.devolucion_items'::regclass
  ) THEN
    ALTER TABLE public.devolucion_items
      ADD CONSTRAINT ck_devolucion_items_classification_required_450
      CHECK (
        clasificacion_contable IS NOT NULL
        AND (clasificacion_contable <> 'MERCADERIA'
             OR (controla_stock AND almacen_id IS NOT NULL))
      ) NOT VALID;
  END IF;
  ALTER TABLE public.devolucion_items
    VALIDATE CONSTRAINT ck_devolucion_items_clasificacion_450;
  ALTER TABLE public.devolucion_items
    VALIDATE CONSTRAINT ck_devolucion_items_classification_required_450;
END
$$;

CREATE OR REPLACE FUNCTION app.guard_supplier_return_450()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.supplier_return_writer_450', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_RPC_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.numero IS DISTINCT FROM OLD.numero
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.create_fingerprint IS DISTINCT FROM OLD.create_fingerprint
  ) THEN
    RAISE EXCEPTION 'La identidad de la devolución a proveedor es inmutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supplier_return_450 ON public.devoluciones_proveedor;
CREATE TRIGGER trg_guard_supplier_return_450
BEFORE INSERT OR UPDATE OR DELETE ON public.devoluciones_proveedor
FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_return_450();

CREATE OR REPLACE FUNCTION app.guard_supplier_return_item_450()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.supplier_return_writer_450', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_ITEM_RPC_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_supplier_return_item_450 ON public.devolucion_items;
CREATE TRIGGER trg_guard_supplier_return_item_450
BEFORE INSERT OR UPDATE OR DELETE ON public.devolucion_items
FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_return_item_450();

CREATE OR REPLACE FUNCTION app.assert_supplier_return_actor_450(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor no pertenece al tenant o está inactivo'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.supplier_return_items_canonical_450(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'recepcion_item_id', app.to_uuid_or_null(coalesce(x->>'recepcion_item_id', '')),
    'producto_id', app.to_uuid_or_null(coalesce(x->>'producto_id', '')),
    'descripcion', btrim(coalesce(x->>'descripcion', '')),
    'cantidad', round(app.to_numeric_or_zero(x->>'cantidad'), 6),
    'precio_unitario', round(app.to_numeric_or_zero(x->>'precio_unitario'), 6),
    'almacen_id', app.to_uuid_or_null(coalesce(x->>'almacen_id', '')),
    'lote', nullif(btrim(coalesce(x->>'lote', '')), ''),
    'serie', nullif(btrim(coalesce(x->>'serie', '')), ''),
    'motivo_detalle', nullif(btrim(coalesce(x->>'motivo_detalle', '')), '')
  ) ORDER BY coalesce(x->>'recepcion_item_id', ''), coalesce(x->>'producto_id', '')), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
$$;

CREATE OR REPLACE FUNCTION app.crear_devolucion_proveedor_tx(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_items jsonb := app.supplier_return_items_canonical_450(p_payload->'items');
  v_fingerprint text;
  v_existing public.devoluciones_proveedor%ROWTYPE;
  v_recepcion public.recepciones%ROWTYPE;
  v_orden public.ordenes_compra%ROWTYPE;
  v_item jsonb;
  v_source record;
  v_recepcion_item_id uuid;
  v_producto_id uuid;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric := 0;
  v_tasa numeric := 0;
  v_devuelto numeric;
  v_clasificacion text;
  v_es_servicio boolean;
  v_controla_stock boolean;
  v_moneda text;
  v_numero text;
  v_next bigint;
  v_year text := to_char(current_date, 'YYYY');
  v_devolucion public.devoluciones_proveedor%ROWTYPE;
  v_items_result jsonb;
BEGIN
  PERFORM set_config('app.supplier_return_writer_450', 'off', true);
  PERFORM app.assert_supplier_return_actor_450(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency_key es obligatoria y admite hasta 200 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'items', 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'La devolución debe contener al menos un item'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(p_payload->>'motivo', '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de devolución es obligatorio' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT x->>'recepcion_item_id')
    FROM jsonb_array_elements(v_items) x
  ) THEN
    RAISE EXCEPTION 'Cada item de recepción sólo puede aparecer una vez en la devolución'
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'recepcion_id', p_payload->>'recepcion_id',
    'orden_id', p_payload->>'orden_id',
    'proveedor_id', p_payload->>'proveedor_id',
    'motivo', btrim(p_payload->>'motivo'),
    'observaciones', nullif(btrim(coalesce(p_payload->>'observaciones', '')), ''),
    'items', v_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'supplier_return_create:' || p_tenant_id::text, 450
  ));

  SELECT * INTO v_existing
  FROM public.devoluciones_proveedor d
  WHERE d.tenant_id = p_tenant_id AND d.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.create_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH: la clave pertenece a otra devolución'
        USING ERRCODE = '23505';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(di) ORDER BY di.created_at, di.id), '[]'::jsonb)
      INTO v_items_result
    FROM public.devolucion_items di
    WHERE di.tenant_id = p_tenant_id AND di.devolucion_id = v_existing.id;
    PERFORM set_config('app.supplier_return_writer_450', 'off', true);
    RETURN to_jsonb(v_existing) || jsonb_build_object('items', v_items_result, 'idempotent', true);
  END IF;

  SELECT * INTO v_recepcion
  FROM public.recepciones r
  WHERE r.id = app.to_uuid_or_null(coalesce(p_payload->>'recepcion_id', ''))
    AND r.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recepción no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF upper(coalesce(v_recepcion.estado::text, '')) <> 'CERRADA' THEN
    RAISE EXCEPTION 'Sólo se devuelven items de una recepción CERRADA'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_compra oc
  WHERE oc.id = app.to_uuid_or_null(coalesce(p_payload->>'orden_id', ''))
    AND oc.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND OR v_recepcion.orden_id IS DISTINCT FROM v_orden.id THEN
    RAISE EXCEPTION 'La recepción no pertenece a la orden indicada' USING ERRCODE = '23514';
  END IF;
  IF v_orden.proveedor_id IS DISTINCT FROM app.to_uuid_or_null(coalesce(p_payload->>'proveedor_id', '')) THEN
    RAISE EXCEPTION 'El proveedor no coincide con la orden' USING ERRCODE = '23514';
  END IF;

  PERFORM ri.id
  FROM public.recepcion_items ri
  WHERE ri.tenant_id = p_tenant_id AND ri.recepcion_id = v_recepcion.id
    AND ri.id IN (
      SELECT app.to_uuid_or_null(coalesce(x->>'recepcion_item_id', ''))
      FROM jsonb_array_elements(v_items) x
    )
  ORDER BY ri.id
  FOR UPDATE;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_recepcion_item_id := app.to_uuid_or_null(coalesce(v_item->>'recepcion_item_id', ''));
    v_producto_id := app.to_uuid_or_null(coalesce(v_item->>'producto_id', ''));
    v_cantidad := app.to_numeric_or_zero(v_item->>'cantidad');
    SELECT ri.*, od.precio_unitario AS precio_origen,
           p.es_servicio AS producto_es_servicio,
           p.controla_stock AS producto_controla_stock,
           p.tipo AS producto_tipo
      INTO v_source
    FROM public.recepcion_items ri
    JOIN public.orden_compra_detalles od
      ON od.id = ri.detalle_id AND od.tenant_id = ri.tenant_id
    JOIN public.productos p
      ON p.id = ri.producto_id AND p.tenant_id = ri.tenant_id
    WHERE ri.id = v_recepcion_item_id
      AND ri.tenant_id = p_tenant_id AND ri.recepcion_id = v_recepcion.id;
    IF NOT FOUND OR v_recepcion_item_id IS NULL OR v_producto_id IS NULL
       OR v_source.producto_id IS DISTINCT FROM v_producto_id THEN
      RAISE EXCEPTION 'Item de devolución no pertenece a la recepción o producto'
        USING ERRCODE = '23514';
    END IF;
    IF upper(coalesce(v_source.calidad, '')) NOT IN ('OK', 'OBSERVADO') THEN
      RAISE EXCEPTION 'Un item RECHAZADO no ingresó inventario ni costo y no se emite como devolución'
        USING ERRCODE = '23514';
    END IF;
    IF v_cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad devuelta debe ser positiva' USING ERRCODE = '22023';
    END IF;
    v_precio := round(coalesce(v_source.precio_origen, 0), 6);
    IF abs(v_precio - app.to_numeric_or_zero(v_item->>'precio_unitario')) > 0.01 THEN
      RAISE EXCEPTION 'El precio del item no coincide con la orden de compra'
        USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum(di.cantidad), 0) INTO v_devuelto
    FROM public.devolucion_items di
    JOIN public.devoluciones_proveedor d ON d.id = di.devolucion_id
    WHERE di.tenant_id = p_tenant_id
      AND di.recepcion_item_id = v_recepcion_item_id
      AND upper(coalesce(d.estado::text, '')) <> 'ANULADA';
    IF v_cantidad > coalesce(v_source.cantidad_recibida, 0) - v_devuelto THEN
      RAISE EXCEPTION 'La cantidad devuelta excede el saldo aceptado del item de recepción'
        USING ERRCODE = '23514';
    END IF;
    v_subtotal := v_subtotal + round(v_cantidad * v_precio, 2);
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'La devolución debe tener importe positivo' USING ERRCODE = '23514';
  END IF;
  v_tasa := CASE WHEN coalesce(v_orden.subtotal, 0) > 0
    THEN greatest(0, least(1, coalesce(v_orden.igv, 0) / v_orden.subtotal)) ELSE 0 END;
  v_igv := round(v_subtotal * v_tasa, 2);
  v_total := round(v_subtotal + v_igv, 2);
  v_moneda := upper(coalesce(nullif(btrim(v_orden.moneda), ''), 'PEN'));

  SELECT coalesce(max(CASE
    WHEN d.numero ~ ('^DEV-' || v_year || '-[0-9]+$')
      THEN substring(d.numero from ('^DEV-' || v_year || '-([0-9]+)$'))::bigint
    ELSE NULL END), 0) + 1
    INTO v_next
  FROM public.devoluciones_proveedor d WHERE d.tenant_id = p_tenant_id;
  v_numero := 'DEV-' || v_year || '-' || lpad(v_next::text, greatest(4, length(v_next::text)), '0');

  PERFORM set_config('app.supplier_return_writer_450', 'on', true);
  INSERT INTO public.devoluciones_proveedor (
    tenant_id, numero, recepcion_id, orden_id, proveedor_id, fecha_devolucion,
    estado, motivo, subtotal, igv, total, moneda, observaciones, created_by,
    idempotency_key, create_fingerprint, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_numero, v_recepcion.id, v_orden.id, v_orden.proveedor_id,
    current_date, 'PENDIENTE', btrim(p_payload->>'motivo'), v_subtotal, v_igv,
    v_total, v_moneda, nullif(btrim(coalesce(p_payload->>'observaciones', '')), ''),
    p_actor_id, v_key, v_fingerprint,
    jsonb_build_object('atomic_rpc', 'crear_devolucion_proveedor_tx',
      'schema_version', 450, 'tasa_impuesto_origen', v_tasa), now(), now()
  ) RETURNING * INTO v_devolucion;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_recepcion_item_id := app.to_uuid_or_null(coalesce(v_item->>'recepcion_item_id', ''));
    SELECT ri.*, od.precio_unitario AS precio_origen,
           p.es_servicio AS producto_es_servicio,
           p.controla_stock AS producto_controla_stock,
           p.tipo AS producto_tipo
      INTO v_source
    FROM public.recepcion_items ri
    JOIN public.orden_compra_detalles od ON od.id = ri.detalle_id AND od.tenant_id = ri.tenant_id
    JOIN public.productos p ON p.id = ri.producto_id AND p.tenant_id = ri.tenant_id
    WHERE ri.id = v_recepcion_item_id AND ri.tenant_id = p_tenant_id;
    v_es_servicio := coalesce((v_source.metadata->>'es_servicio')::boolean,
      coalesce(v_source.producto_es_servicio, false)
      OR lower(coalesce(v_source.producto_tipo, '')) = 'servicio');
    v_controla_stock := coalesce((v_source.metadata->>'controla_stock')::boolean,
      NOT v_es_servicio AND coalesce(v_source.producto_controla_stock, true));
    v_clasificacion := coalesce(nullif(v_source.metadata->>'clasificacion_contable', ''),
      CASE WHEN v_es_servicio THEN 'SERVICIO'
        WHEN NOT v_controla_stock THEN 'GASTO_NO_STOCK' ELSE 'MERCADERIA' END);
    INSERT INTO public.devolucion_items (
      tenant_id, devolucion_id, recepcion_item_id, producto_id, descripcion,
      cantidad, precio_unitario, subtotal, almacen_id, lote, serie,
      motivo_detalle, es_servicio, controla_stock, clasificacion_contable,
      metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_devolucion.id, v_recepcion_item_id, v_source.producto_id,
      coalesce(nullif(btrim(v_item->>'descripcion'), ''), v_source.nombre, 'Producto recibido'),
      app.to_numeric_or_zero(v_item->>'cantidad'), round(v_source.precio_origen, 6),
      round(app.to_numeric_or_zero(v_item->>'cantidad') * v_source.precio_origen, 2),
      CASE WHEN v_controla_stock THEN v_source.almacen_id ELSE NULL END,
      coalesce(nullif(v_item->>'lote', ''), v_source.lote),
      coalesce(nullif(v_item->>'serie', ''), v_source.serie),
      nullif(btrim(coalesce(v_item->>'motivo_detalle', '')), ''),
      v_es_servicio, v_controla_stock, v_clasificacion,
      jsonb_build_object('recepcion_calidad', v_source.calidad,
        'clasificacion_snapshot', true), now(), now()
    );
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(di) ORDER BY di.created_at, di.id), '[]'::jsonb)
    INTO v_items_result
  FROM public.devolucion_items di
  WHERE di.tenant_id = p_tenant_id AND di.devolucion_id = v_devolucion.id;
  PERFORM set_config('app.supplier_return_writer_450', 'off', true);
  RETURN to_jsonb(v_devolucion) || jsonb_build_object('items', v_items_result, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION app.emitir_devolucion_proveedor_tx(
  p_devolucion_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
DECLARE
  v_dev public.devoluciones_proveedor%ROWTYPE;
  v_item public.devolucion_items%ROWTYPE;
  v_ri public.recepcion_items%ROWTYPE;
  v_mov_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_devuelto_otro numeric;
  v_mercaderia numeric := 0;
  v_servicios numeric := 0;
  v_no_stock numeric := 0;
  v_cxp public.cuentas_por_pagar%ROWTYPE;
  v_cxp_count integer := 0;
  v_total_anterior numeric;
  v_saldo_anterior numeric;
  v_total_nuevo numeric;
  v_saldo_nuevo numeric;
  v_subtotal_nuevo numeric;
  v_igv_nuevo numeric;
  v_estado_nuevo text;
  v_cuenta_pasivo text := '4699';
  v_igv_contable numeric := 0;
  v_total_contable numeric;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_payload jsonb;
  v_result jsonb;
  v_fingerprint text;
  v_physical_count integer;
  v_outbox_count integer;
BEGIN
  PERFORM set_config('app.supplier_return_writer_450', 'off', true);
  PERFORM app.assert_supplier_return_actor_450(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  IF p_devolucion_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'devolucion_id y tenant_id son obligatorios' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dev FROM public.devoluciones_proveedor d
  WHERE d.id = p_devolucion_id AND d.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolución no encontrada' USING ERRCODE = 'P0002'; END IF;

  IF upper(v_dev.estado::text) = 'EMITIDA' THEN
    IF v_dev.emitted_result IS NULL OR v_dev.emit_event_id IS NULL THEN
      RAISE EXCEPTION 'LEGACY_EMITTED_RETURN_REQUIRES_RECONCILIATION' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO v_outbox_count FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id AND o.event_id = v_dev.emit_event_id
      AND o.event_type = 'devolucion.proveedor.registrada'
      AND o.aggregate_id = v_dev.id::text;
    IF v_outbox_count <> 1 THEN
      RAISE EXCEPTION 'SUPPLIER_RETURN_OUTBOX_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
    PERFORM set_config('app.supplier_return_writer_450', 'off', true);
    RETURN v_dev.emitted_result || jsonb_build_object('idempotent', true);
  END IF;
  IF upper(v_dev.estado::text) <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Sólo una devolución PENDIENTE puede emitirse (actual: %)', v_dev.estado
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.recepciones r
  WHERE r.id = v_dev.recepcion_id AND r.tenant_id = p_tenant_id
    AND upper(r.estado::text) = 'CERRADA' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recepción de origen debe permanecer CERRADA' USING ERRCODE = '23514';
  END IF;

  PERFORM di.id FROM public.devolucion_items di
  WHERE di.tenant_id = p_tenant_id AND di.devolucion_id = v_dev.id
  ORDER BY di.producto_id, di.almacen_id NULLS LAST, di.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La devolución no tiene items' USING ERRCODE = '23514'; END IF;

  FOR v_item IN
    SELECT * FROM public.devolucion_items di
    WHERE di.tenant_id = p_tenant_id AND di.devolucion_id = v_dev.id
    ORDER BY di.producto_id, di.almacen_id NULLS LAST, di.id
  LOOP
    SELECT * INTO v_ri FROM public.recepcion_items ri
    WHERE ri.id = v_item.recepcion_item_id AND ri.tenant_id = p_tenant_id
      AND ri.recepcion_id = v_dev.recepcion_id FOR UPDATE;
    IF NOT FOUND OR v_ri.producto_id IS DISTINCT FROM v_item.producto_id
       OR upper(coalesce(v_ri.calidad, '')) NOT IN ('OK', 'OBSERVADO') THEN
      RAISE EXCEPTION 'El item de origen dejó de ser válido para devolución'
        USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum(di.cantidad), 0) INTO v_devuelto_otro
    FROM public.devolucion_items di
    JOIN public.devoluciones_proveedor d ON d.id = di.devolucion_id
    WHERE di.tenant_id = p_tenant_id AND di.recepcion_item_id = v_item.recepcion_item_id
      AND di.devolucion_id <> v_dev.id AND upper(coalesce(d.estado::text, '')) <> 'ANULADA';
    IF v_item.cantidad > coalesce(v_ri.cantidad_recibida, 0) - v_devuelto_otro THEN
      RAISE EXCEPTION 'La cantidad emitida excede el saldo aceptado del item de recepción'
        USING ERRCODE = '23514';
    END IF;

    IF v_item.clasificacion_contable = 'MERCADERIA' THEN
      IF NOT v_item.controla_stock OR v_item.almacen_id IS NULL THEN
        RAISE EXCEPTION 'La mercadería devuelta requiere almacén y control de stock'
          USING ERRCODE = '23514';
      END IF;
      v_mov_id := public.aplicar_movimiento_inventario_tx(
        p_tenant_id, v_item.producto_id, v_item.almacen_id, 'SALIDA', v_item.cantidad,
        'DEVOLUCION_PROVEEDOR_ITEM', v_item.id,
        'Devolución a proveedor ' || v_dev.numero, NULL, v_item.lote, NULL,
        p_actor_id::text,
        jsonb_build_object('devolucion_id', v_dev.id,
          'devolucion_item_id', v_item.id, 'recepcion_item_id', v_item.recepcion_item_id,
          'costo_unitario', v_item.precio_unitario, 'schema_version', 450), false
      );
      v_movimientos := v_movimientos || jsonb_build_array(jsonb_build_object(
        'movimiento_id', v_mov_id, 'devolucion_item_id', v_item.id,
        'producto_id', v_item.producto_id, 'almacen_id', v_item.almacen_id,
        'cantidad', v_item.cantidad));
      v_mercaderia := v_mercaderia + v_item.subtotal;
      PERFORM set_config('app.supplier_return_writer_450', 'on', true);
      UPDATE public.devolucion_items SET movimiento_id = v_mov_id, updated_at = now()
      WHERE id = v_item.id;
    ELSIF v_item.clasificacion_contable = 'SERVICIO' THEN
      v_servicios := v_servicios + v_item.subtotal;
    ELSIF v_item.clasificacion_contable = 'GASTO_NO_STOCK' THEN
      v_no_stock := v_no_stock + v_item.subtotal;
    ELSE
      RAISE EXCEPTION 'Clasificación contable inválida en devolución' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(*) INTO v_cxp_count
  FROM public.cuentas_por_pagar c
  WHERE c.tenant_id = p_tenant_id AND (
    c.recepcion_id = v_dev.recepcion_id OR
    (upper(coalesce(c.referencia_tipo, '')) = 'RECEPCION' AND c.referencia_id = v_dev.recepcion_id)
  ) AND upper(c.estado::text) <> 'ANULADA';
  IF v_cxp_count > 1 THEN
    RAISE EXCEPTION 'Más de una CxP activa está vinculada a la recepción; se requiere conciliación'
      USING ERRCODE = '23514';
  END IF;
  IF v_cxp_count = 1 THEN
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar c
    WHERE c.tenant_id = p_tenant_id AND (
      c.recepcion_id = v_dev.recepcion_id OR
      (upper(coalesce(c.referencia_tipo, '')) = 'RECEPCION' AND c.referencia_id = v_dev.recepcion_id)
    ) AND upper(c.estado::text) <> 'ANULADA'
    ORDER BY c.created_at, c.id LIMIT 1 FOR UPDATE;
    IF upper(coalesce(v_cxp.moneda, 'PEN')) <> upper(coalesce(v_dev.moneda, 'PEN')) THEN
      RAISE EXCEPTION 'La moneda de la CxP no coincide con la devolución' USING ERRCODE = '23514';
    END IF;
    v_total_anterior := round(coalesce(v_cxp.total, 0), 2);
    v_saldo_anterior := round(coalesce(v_cxp.saldo, 0), 2);
    IF v_dev.total > v_saldo_anterior + 0.01 THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_EXCEEDS_OUTSTANDING: devolución=% saldo=%',
        v_dev.total, v_saldo_anterior USING ERRCODE = '23514';
    END IF;
    v_total_nuevo := round(greatest(v_total_anterior - v_dev.total, 0), 2);
    v_saldo_nuevo := round(greatest(v_saldo_anterior - v_dev.total, 0), 2);
    v_subtotal_nuevo := round(greatest(coalesce(v_cxp.subtotal, 0) - v_dev.subtotal, 0), 2);
    v_igv_nuevo := round(greatest(coalesce(v_cxp.igv, 0) - v_dev.igv, 0), 2);
    IF v_total_nuevo <= 0.01 THEN
      v_estado_nuevo := 'ANULADA';
      UPDATE public.cuentas_por_pagar SET estado = v_estado_nuevo, saldo = 0,
        saldo_pendiente = 0, anulada = 'SI', anulado_at = now(),
        anulado_by = p_actor_id::text, updated_by = p_actor_id,
        observaciones = concat_ws(E'\n', nullif(observaciones, ''),
          'ANULADA POR DEVOLUCIÓN ' || v_dev.numero || ' (' || v_dev.id || ')'),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'ultima_devolucion_id', v_dev.id, 'ultima_devolucion_total', v_dev.total)
      WHERE id = v_cxp.id;
    ELSE
      v_estado_nuevo := CASE
        WHEN v_saldo_nuevo <= 0.01 THEN 'PAGADA'
        WHEN v_saldo_nuevo < v_total_nuevo THEN 'PARCIAL'
        WHEN upper(v_cxp.estado::text) = 'VENCIDA' THEN 'VENCIDA'
        ELSE 'PENDIENTE' END;
      UPDATE public.cuentas_por_pagar SET subtotal = v_subtotal_nuevo,
        igv = v_igv_nuevo, total = v_total_nuevo, saldo = v_saldo_nuevo,
        saldo_pendiente = v_saldo_nuevo, estado = v_estado_nuevo,
        updated_by = p_actor_id, updated_at = now(),
        observaciones = concat_ws(E'\n', nullif(observaciones, ''),
          'AJUSTE POR DEVOLUCIÓN ' || v_dev.numero || ' (' || v_dev.id || ') -' || v_dev.total || ' ' || v_dev.moneda),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'ultima_devolucion_id', v_dev.id, 'ultima_devolucion_total', v_dev.total)
      WHERE id = v_cxp.id;
    END IF;
    INSERT INTO public.cxp_ajustes_proveedor (
      tenant_id, cuenta_por_pagar_id, devolucion_id, subtotal, igv, total,
      total_anterior, saldo_anterior, total_nuevo, saldo_nuevo, moneda,
      created_by, metadata
    ) VALUES (
      p_tenant_id, v_cxp.id, v_dev.id, v_dev.subtotal, v_dev.igv, v_dev.total,
      v_total_anterior, v_saldo_anterior, v_total_nuevo, v_saldo_nuevo,
      v_dev.moneda, p_actor_id,
      jsonb_build_object('estado_anterior', v_cxp.estado, 'estado_nuevo', v_estado_nuevo,
        'schema_version', 450)
    );
    v_cuenta_pasivo := '42';
    v_igv_contable := v_dev.igv;
  END IF;

  v_total_contable := round(v_dev.subtotal + v_igv_contable, 2);
  v_event_key := 'devolucion.proveedor.registrada:' || p_tenant_id::text || ':' || v_dev.id::text;
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'devolucion_id', v_dev.id, 'create_fingerprint', v_dev.create_fingerprint,
    'cuenta_por_pagar_id', v_cxp.id, 'mercaderia', round(v_mercaderia, 2),
    'servicios', round(v_servicios, 2), 'no_stock', round(v_no_stock, 2),
    'cuenta_pasivo', v_cuenta_pasivo, 'total_contable', v_total_contable
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_payload := jsonb_build_object(
    'eventId', v_event_id, 'tenantId', p_tenant_id, 'idempotencyKey', v_event_key,
    'devolucionId', v_dev.id, 'numeroDevolucion', v_dev.numero,
    'ordenId', v_dev.orden_id, 'recepcionId', v_dev.recepcion_id,
    'proveedorId', v_dev.proveedor_id, 'fechaDevolucion', v_dev.fecha_devolucion,
    'motivo', v_dev.motivo, 'subtotal', v_dev.subtotal, 'igv', v_dev.igv,
    'total', v_dev.total, 'moneda', v_dev.moneda,
    'mercaderia', round(v_mercaderia, 2), 'servicios', round(v_servicios, 2),
    'noStock', round(v_no_stock, 2), 'subtotalContable', round(v_dev.subtotal, 2),
    'igvContable', v_igv_contable, 'totalContable', v_total_contable,
    'cuentaPasivo', v_cuenta_pasivo, 'cuentaPorPagarId', v_cxp.id,
    'cxpAjustadaAtomicamente', (v_cxp.id IS NOT NULL),
    'movimientos', v_movimientos, 'emitidoPor', p_actor_id,
    'emitidoEn', clock_timestamp(), 'schemaVersion', 450
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status,
    retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'devolucion_proveedor', v_dev.id::text,
    'devolucion.proveedor.registrada', v_payload, 'pending', 0,
    v_event_key, v_event_id, clock_timestamp()
  );

  v_result := jsonb_build_object(
    'id', v_dev.id, 'numero', v_dev.numero, 'estado', 'EMITIDA',
    'emit_event_id', v_event_id, 'cuenta_por_pagar_id', v_cxp.id,
    'ajuste_cxp_total', CASE WHEN v_cxp.id IS NULL THEN 0 ELSE v_dev.total END,
    'movimientos', v_movimientos, 'idempotent', false
  );
  PERFORM set_config('app.supplier_return_writer_450', 'on', true);
  UPDATE public.devoluciones_proveedor SET estado = 'EMITIDA',
    emitido_por = p_actor_id, emitido_at = now(), updated_by = p_actor_id,
    updated_at = now(), cuenta_por_pagar_id = v_cxp.id,
    ajuste_cxp_total = CASE WHEN v_cxp.id IS NULL THEN 0 ELSE v_dev.total END,
    emit_event_id = v_event_id, emit_fingerprint = v_fingerprint,
    emitted_result = v_result,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'emit_atomic_rpc', 'emitir_devolucion_proveedor_tx',
      'cuenta_pasivo', v_cuenta_pasivo, 'schema_version', 450)
  WHERE id = v_dev.id;

  SELECT count(*) INTO v_physical_count FROM public.devolucion_items di
  WHERE di.tenant_id = p_tenant_id AND di.devolucion_id = v_dev.id
    AND di.clasificacion_contable = 'MERCADERIA' AND di.movimiento_id IS NOT NULL;
  IF v_physical_count <> (
    SELECT count(*) FROM public.devolucion_items di
    WHERE di.tenant_id = p_tenant_id AND di.devolucion_id = v_dev.id
      AND di.clasificacion_contable = 'MERCADERIA'
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_INVENTORY_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.supplier_return_writer_450', 'off', true);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app.anular_devolucion_proveedor_pendiente_tx(
  p_devolucion_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE v_dev public.devoluciones_proveedor%ROWTYPE;
BEGIN
  PERFORM set_config('app.supplier_return_writer_450', 'off', true);
  PERFORM app.assert_supplier_return_actor_450(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  SELECT * INTO v_dev FROM public.devoluciones_proveedor d
  WHERE d.id = p_devolucion_id AND d.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolución no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF upper(v_dev.estado::text) = 'ANULADA' THEN
    PERFORM set_config('app.supplier_return_writer_450', 'off', true);
    RETURN to_jsonb(v_dev) || jsonb_build_object('idempotent', true);
  END IF;
  IF upper(v_dev.estado::text) <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Sólo una devolución PENDIENTE puede anularse sin reversa'
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.supplier_return_writer_450', 'on', true);
  UPDATE public.devoluciones_proveedor SET estado = 'ANULADA', updated_by = p_actor_id,
    updated_at = now(), metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'anulada_por', p_actor_id, 'anulada_en', clock_timestamp(),
      'motivo_anulacion', nullif(btrim(coalesce(p_motivo, '')), ''), 'schema_version', 450)
  WHERE id = p_devolucion_id RETURNING * INTO v_dev;
  PERFORM set_config('app.supplier_return_writer_450', 'off', true);
  RETURN to_jsonb(v_dev) || jsonb_build_object('idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_devolucion_proveedor_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.crear_devolucion_proveedor_tx($1, $2, $3, $4); $$;

CREATE OR REPLACE FUNCTION public.emitir_devolucion_proveedor_tx(
  p_devolucion_id uuid, p_tenant_id uuid, p_actor_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.emitir_devolucion_proveedor_tx($1, $2, $3); $$;

CREATE OR REPLACE FUNCTION public.anular_devolucion_proveedor_pendiente_tx(
  p_devolucion_id uuid, p_tenant_id uuid, p_actor_id uuid, p_motivo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.anular_devolucion_proveedor_pendiente_tx($1, $2, $3, $4); $$;

REVOKE ALL ON FUNCTION app.assert_supplier_return_actor_450(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.emitir_devolucion_proveedor_tx(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.anular_devolucion_proveedor_pendiente_tx(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.anular_devolucion_proveedor_pendiente_tx(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.anular_devolucion_proveedor_pendiente_tx(uuid,uuid,uuid,text) TO service_role;

COMMENT ON FUNCTION public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text) IS
  'Crea cabecera e items de devolución a proveedor con actor, correlativo e idempotencia atómicos.';
COMMENT ON FUNCTION public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid) IS
  'Emite devolución, stock, ajuste CxP y outbox contable en una sola transacción.';
COMMENT ON FUNCTION public.anular_devolucion_proveedor_pendiente_tx(uuid,uuid,uuid,text) IS
  'Anula sólo un borrador pendiente; una devolución emitida requiere un flujo de reversa separado.';

COMMIT;

NOTIFY pgrst, 'reload schema';
