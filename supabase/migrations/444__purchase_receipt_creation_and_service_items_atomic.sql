-- Creación atómica e idempotente de recepciones y cierre compatible con
-- servicios/productos sin control de stock. La recepción reconoce el hecho
-- operativo y contable; la CxP continúa naciendo con la factura del proveedor.

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.recepciones
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS create_fingerprint text;

-- La numeración anterior se calculaba en Node mediante MAX+1. Reparamos sólo
-- colisiones internas antes de imponer la identidad canónica por tenant.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, upper(btrim(numero))
      ORDER BY created_at, id
    ) AS rn
  FROM public.recepciones
  WHERE tenant_id IS NOT NULL
    AND NULLIF(btrim(coalesce(numero, '')), '') IS NOT NULL
)
UPDATE public.recepciones r
SET numero = r.numero || '-DUP-' || substr(r.id::text, 1, 8),
    updated_at = now()
FROM ranked x
WHERE x.id = r.id AND x.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_recepciones_tenant_numero_444
  ON public.recepciones (tenant_id, upper(btrim(numero)))
  WHERE tenant_id IS NOT NULL
    AND NULLIF(btrim(coalesce(numero, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_recepciones_tenant_idempotency_444
  ON public.recepciones (tenant_id, idempotency_key)
  WHERE tenant_id IS NOT NULL
    AND idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION app.guard_recepcion_identity_444()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.create_fingerprint IS DISTINCT FROM OLD.create_fingerprint THEN
    RAISE EXCEPTION 'La identidad de una recepción es inmutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_recepcion_identity_444 ON public.recepciones;
CREATE TRIGGER trg_guard_recepcion_identity_444
BEFORE UPDATE OF tenant_id, numero, idempotency_key, create_fingerprint
ON public.recepciones
FOR EACH ROW
EXECUTE FUNCTION app.guard_recepcion_identity_444();

CREATE OR REPLACE FUNCTION public.crear_recepcion_tx(
  p_tenant_id uuid,
  p_orden_id uuid,
  p_items jsonb,
  p_observaciones text,
  p_created_by uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, extensions, pg_temp
AS $$
DECLARE
  v_orden public.ordenes_compra%ROWTYPE;
  v_recepcion public.recepciones%ROWTYPE;
  v_item jsonb;
  v_group record;
  v_detalle public.orden_compra_detalles%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_detalle_id uuid;
  v_almacen_id uuid;
  v_ubicacion_id uuid;
  v_cantidad numeric;
  v_calidad text;
  v_pendiente numeric;
  v_es_servicio boolean;
  v_controla_stock boolean;
  v_year text := to_char(current_date, 'YYYY');
  v_next bigint;
  v_numero text;
  v_key text := NULLIF(btrim(coalesce(p_idempotency_key, '')), '');
  v_fingerprint text;
  v_items_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_orden_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'tenant, orden y actor son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency_key es obligatoria y admite hasta 200 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La recepción debe contener al menos un item'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_created_by
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor de creación no pertenece al tenant o está inactivo'
      USING ERRCODE = '42501';
  END IF;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'tenant_id', p_tenant_id,
          'orden_id', p_orden_id,
          'items', p_items,
          'observaciones', NULLIF(btrim(coalesce(p_observaciones, '')), '')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- Serializa tanto el retry de la misma identidad como la reserva de número.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('crear_recepcion:' || p_tenant_id::text, 444)
  );

  SELECT * INTO v_recepcion
  FROM public.recepciones r
  WHERE r.tenant_id = p_tenant_id
    AND r.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_recepcion.create_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH: la clave ya pertenece a otra recepción'
        USING ERRCODE = '23505';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(ri) ORDER BY ri.created_at, ri.id), '[]'::jsonb)
      INTO v_items_result
    FROM public.recepcion_items ri
    WHERE ri.tenant_id = p_tenant_id AND ri.recepcion_id = v_recepcion.id;
    RETURN to_jsonb(v_recepcion) || jsonb_build_object(
      'items', v_items_result,
      'idempotent', true
    );
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_compra oc
  WHERE oc.id = p_orden_id AND oc.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de compra no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF upper(coalesce(v_orden.estado::text, '')) NOT IN ('APROBADA', 'PARCIAL') THEN
    RAISE EXCEPTION 'La orden debe estar APROBADA o PARCIAL (actual: %)', v_orden.estado
      USING ERRCODE = '23514';
  END IF;

  -- La OC queda bloqueada y los detalles se bloquean siempre en el mismo orden.
  PERFORM d.id
  FROM public.orden_compra_detalles d
  WHERE d.tenant_id = p_tenant_id
    AND d.orden_id = p_orden_id
    AND d.id IN (
      SELECT app.to_uuid_or_null(coalesce(x->>'detalle_id', ''))
      FROM jsonb_array_elements(p_items) x
    )
  ORDER BY d.id
  FOR UPDATE;

  -- Un detalle puede dividirse en varios lotes/series. La suma aceptada, no
  -- cada renglón por separado, debe caber en la cantidad aún pendiente.
  FOR v_group IN
    SELECT
      app.to_uuid_or_null(coalesce(x->>'detalle_id', '')) AS detalle_id,
      sum(CASE
        WHEN upper(btrim(coalesce(x->>'calidad', ''))) IN ('OK', 'OBSERVADO')
          THEN app.to_numeric_or_zero(x->>'cantidad_recibida')
        ELSE 0
      END) AS cantidad_aceptada
    FROM jsonb_array_elements(p_items) x
    GROUP BY app.to_uuid_or_null(coalesce(x->>'detalle_id', ''))
  LOOP
    SELECT * INTO v_detalle
    FROM public.orden_compra_detalles d
    WHERE d.id = v_group.detalle_id
      AND d.tenant_id = p_tenant_id
      AND d.orden_id = p_orden_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Detalle % no pertenece a la orden', v_group.detalle_id
        USING ERRCODE = '23514';
    END IF;
    v_pendiente := coalesce(v_detalle.cantidad, 0)
      - coalesce(v_detalle.cantidad_recibida, 0);
    IF coalesce(v_group.cantidad_aceptada, 0) > v_pendiente THEN
      RAISE EXCEPTION 'La cantidad aceptada agregada (%) excede la pendiente (%) para detalle %',
        v_group.cantidad_aceptada, v_pendiente, v_group.detalle_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Validación completa antes de insertar cabecera o detalle alguno.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_detalle_id := app.to_uuid_or_null(coalesce(v_item->>'detalle_id', ''));
    v_almacen_id := app.to_uuid_or_null(coalesce(v_item->>'almacen_id', ''));
    v_ubicacion_id := app.to_uuid_or_null(coalesce(v_item->>'ubicacion_id', ''));
    v_cantidad := app.to_numeric_or_zero(v_item->>'cantidad_recibida');
    v_calidad := upper(btrim(coalesce(v_item->>'calidad', '')));

    IF v_detalle_id IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'Cada item requiere detalle_id y cantidad_recibida positiva'
        USING ERRCODE = '22023';
    END IF;
    IF v_calidad NOT IN ('OK', 'OBSERVADO', 'RECHAZADO') THEN
      RAISE EXCEPTION 'Calidad inválida para detalle %: %', v_detalle_id, v_calidad
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_detalle
    FROM public.orden_compra_detalles d
    WHERE d.id = v_detalle_id
      AND d.tenant_id = p_tenant_id
      AND d.orden_id = p_orden_id
    FOR UPDATE;
    IF NOT FOUND OR v_detalle.producto_id IS NULL THEN
      RAISE EXCEPTION 'Detalle % no pertenece a la orden o no tiene producto', v_detalle_id
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_producto
    FROM public.productos p
    WHERE p.id = v_detalle.producto_id AND p.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto de detalle % no pertenece al tenant', v_detalle_id
        USING ERRCODE = '23514';
    END IF;
    v_es_servicio := coalesce(v_producto.es_servicio, false)
      OR lower(coalesce(v_producto.tipo, '')) = 'servicio';
    v_controla_stock := NOT v_es_servicio
      AND coalesce(v_producto.controla_stock, true);

    v_pendiente := coalesce(v_detalle.cantidad, 0)
      - coalesce(v_detalle.cantidad_recibida, 0);
    IF v_calidad IN ('OK', 'OBSERVADO') AND v_cantidad > v_pendiente THEN
      RAISE EXCEPTION 'La cantidad aceptada (%) excede la pendiente (%) para detalle %',
        v_cantidad, v_pendiente, v_detalle_id USING ERRCODE = '23514';
    END IF;

    IF v_calidad IN ('OK', 'OBSERVADO') AND v_controla_stock
       AND v_almacen_id IS NULL THEN
      RAISE EXCEPTION 'El detalle físico % requiere almacen_id', v_detalle_id
        USING ERRCODE = '23514';
    END IF;
    -- Los defaults heredados de almacén pueden llegar aplicados a todos los
    -- renglones de una recepción mixta. Para servicios/no-stock se normalizan
    -- a NULL al insertar; nunca se convierten en destino ni movimiento físico.
    IF v_controla_stock AND v_ubicacion_id IS NOT NULL AND v_almacen_id IS NULL THEN
      RAISE EXCEPTION 'ubicacion_id requiere almacen_id (detalle %)', v_detalle_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT coalesce(max(
    CASE
      WHEN r.numero ~ ('^REC-' || v_year || '-[0-9]+$')
        THEN substring(r.numero from ('^REC-' || v_year || '-([0-9]+)$'))::bigint
      ELSE NULL
    END
  ), 0) + 1
    INTO v_next
  FROM public.recepciones r
  WHERE r.tenant_id = p_tenant_id;

  v_numero := 'REC-' || v_year || '-' || lpad(v_next::text, 4, '0');

  INSERT INTO public.recepciones (
    tenant_id, numero, orden_id, fecha_recepcion, estado, activo,
    observaciones, created_by, idempotency_key, create_fingerprint,
    metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_numero, p_orden_id, now(), 'BORRADOR', true,
    NULLIF(btrim(coalesce(p_observaciones, '')), ''), p_created_by,
    v_key, v_fingerprint,
    jsonb_build_object('atomic_rpc', 'crear_recepcion_tx', 'schema_version', 444),
    now(), now()
  )
  RETURNING * INTO v_recepcion;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_detalle_id := app.to_uuid_or_null(coalesce(v_item->>'detalle_id', ''));
    SELECT * INTO v_detalle
    FROM public.orden_compra_detalles d
    WHERE d.id = v_detalle_id AND d.tenant_id = p_tenant_id;

    SELECT * INTO v_producto
    FROM public.productos p
    WHERE p.id = v_detalle.producto_id AND p.tenant_id = p_tenant_id;
    v_es_servicio := coalesce(v_producto.es_servicio, false)
      OR lower(coalesce(v_producto.tipo, '')) = 'servicio';
    v_controla_stock := NOT v_es_servicio
      AND coalesce(v_producto.controla_stock, true);

    INSERT INTO public.recepcion_items (
      tenant_id, recepcion_id, detalle_id, producto_id,
      cantidad_recibida, calidad, almacen_id, ubicacion_id,
      lote, serie, fecha_expiracion, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_recepcion.id, v_detalle_id, v_detalle.producto_id,
      app.to_numeric_or_zero(v_item->>'cantidad_recibida'),
      upper(btrim(v_item->>'calidad')),
      CASE WHEN v_controla_stock
        THEN app.to_uuid_or_null(coalesce(v_item->>'almacen_id', '')) ELSE NULL END,
      CASE WHEN v_controla_stock
        THEN app.to_uuid_or_null(coalesce(v_item->>'ubicacion_id', '')) ELSE NULL END,
      NULLIF(btrim(coalesce(v_item->>'lote', '')), ''),
      NULLIF(btrim(coalesce(v_item->>'serie', '')), ''),
      CASE WHEN NULLIF(btrim(coalesce(v_item->>'fecha_expiracion', '')), '') IS NULL
        THEN NULL ELSE (v_item->>'fecha_expiracion')::date END,
      jsonb_build_object(
        'observaciones', NULLIF(btrim(coalesce(v_item->>'observaciones', '')), ''),
        'es_servicio', v_es_servicio,
        'controla_stock', v_controla_stock,
        'clasificacion_contable', CASE
          WHEN v_es_servicio THEN 'SERVICIO'
          WHEN NOT v_controla_stock THEN 'GASTO_NO_STOCK'
          ELSE 'MERCADERIA'
        END
      ),
      now(), now()
    );
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(ri) ORDER BY ri.created_at, ri.id), '[]'::jsonb)
    INTO v_items_result
  FROM public.recepcion_items ri
  WHERE ri.tenant_id = p_tenant_id AND ri.recepcion_id = v_recepcion.id;

  RETURN to_jsonb(v_recepcion) || jsonb_build_object(
    'items', v_items_result,
    'idempotent', false
  );
END;
$$;

-- Reemplaza la versión 440 conservando la firma PostgREST. Un item aceptado
-- siempre cumple la OC; sólo un bien físico con controla_stock=true mueve el
-- ledger y exige almacén.
CREATE OR REPLACE FUNCTION public.cerrar_recepcion_tx(
  p_recepcion_id uuid,
  p_tenant_id uuid,
  p_user_id text DEFAULT NULL,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_recepcion public.recepciones%ROWTYPE;
  v_item record;
  v_detalle public.orden_compra_detalles%ROWTYPE;
  v_mov_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_nueva_cant numeric;
  v_total_pedido numeric;
  v_total_recibido numeric;
  v_nuevo_estado_orden text;
  v_count_items integer;
  v_calidad text;
  v_actor_id uuid;
  v_movimientos_previos integer;
  v_estado_orden_actual text;
  v_es_servicio boolean;
  v_controla_stock boolean;
BEGIN
  IF p_recepcion_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'recepcion_id y tenant_id son obligatorios';
  END IF;
  v_actor_id := app.to_uuid_or_null(coalesce(p_user_id, ''));
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor de cierre no pertenece al tenant o está inactivo';
  END IF;

  SELECT * INTO v_recepcion
  FROM public.recepciones
  WHERE id = p_recepcion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;

  IF upper(v_recepcion.estado::text) = 'CERRADA' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'movimiento_id', mi.id,
      'recepcion_item_id', app.to_uuid_or_null(mi.metadata->>'recepcion_item_id'),
      'detalle_id', app.to_uuid_or_null(mi.metadata->>'orden_detalle_id'),
      'producto_id', mi.producto_id,
      'almacen_id', mi.almacen_id,
      'cantidad', mi.cantidad
    ) ORDER BY mi.created_at, mi.id), '[]'::jsonb)
      INTO v_movimientos
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND upper(coalesce(mi.referencia_tipo, '')) = 'RECEPCION'
      AND (
        app.to_uuid_or_null(mi.metadata->>'recepcion_id') = p_recepcion_id
        OR mi.referencia_id = p_recepcion_id
      )
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'ENTRADA';
    RETURN jsonb_build_object(
      'recepcion_id', p_recepcion_id, 'id', p_recepcion_id,
      'numero', v_recepcion.numero, 'estado', 'CERRADA',
      'orden_id', v_recepcion.orden_id, 'idempotent', true,
      'movimientos', v_movimientos
    );
  END IF;
  IF upper(v_recepcion.estado::text) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar recepciones en estado BORRADOR (actual: %)',
      v_recepcion.estado;
  END IF;
  IF v_recepcion.orden_id IS NULL THEN
    RAISE EXCEPTION 'La recepción debe pertenecer a una orden de compra';
  END IF;

  SELECT upper(coalesce(oc.estado::text, '')) INTO v_estado_orden_actual
  FROM public.ordenes_compra oc
  WHERE oc.id = v_recepcion.orden_id AND oc.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF v_estado_orden_actual NOT IN ('APROBADA', 'PARCIAL') THEN
    RAISE EXCEPTION 'No se puede cerrar una recepción para una orden en estado %',
      v_estado_orden_actual;
  END IF;

  SELECT count(*) INTO v_count_items
  FROM public.recepcion_items ri
  WHERE ri.recepcion_id = p_recepcion_id AND ri.tenant_id = p_tenant_id;
  IF v_count_items = 0 THEN
    RAISE EXCEPTION 'La recepción debe tener al menos un item';
  END IF;

  PERFORM ri.id
  FROM public.recepcion_items ri
  WHERE ri.recepcion_id = p_recepcion_id AND ri.tenant_id = p_tenant_id
  ORDER BY ri.id
  FOR UPDATE OF ri;

  PERFORM d.id
  FROM public.orden_compra_detalles d
  JOIN public.recepcion_items ri
    ON ri.detalle_id = d.id AND ri.tenant_id = d.tenant_id
  WHERE ri.recepcion_id = p_recepcion_id AND ri.tenant_id = p_tenant_id
  ORDER BY d.id
  FOR UPDATE OF d;

  FOR v_item IN
    SELECT ri.*
    FROM public.recepcion_items ri
    WHERE ri.recepcion_id = p_recepcion_id AND ri.tenant_id = p_tenant_id
    ORDER BY ri.detalle_id, ri.created_at, ri.id
  LOOP
    v_calidad := upper(coalesce(v_item.calidad, ''));
    IF v_calidad NOT IN ('OK', 'OBSERVADO', 'RECHAZADO') THEN
      RAISE EXCEPTION 'Calidad inválida en item %: %', v_item.id, v_item.calidad;
    END IF;
    IF coalesce(v_item.cantidad_recibida, 0) <= 0 THEN
      RAISE EXCEPTION 'El item % tiene cantidad_recibida inválida (%)',
        v_item.id, v_item.cantidad_recibida;
    END IF;

    SELECT * INTO v_detalle
    FROM public.orden_compra_detalles d
    WHERE d.id = v_item.detalle_id AND d.tenant_id = p_tenant_id
      AND d.orden_id = v_recepcion.orden_id
    FOR UPDATE;
    IF NOT FOUND OR v_detalle.producto_id IS DISTINCT FROM v_item.producto_id THEN
      RAISE EXCEPTION 'El item % no coincide con su detalle de orden', v_item.id;
    END IF;

    -- La clasificación se congela al crear el ítem. El catálogo actual sólo
    -- sirve como fallback para borradores legacy anteriores a la versión 444.
    SELECT
      c.es_servicio,
      NOT c.es_servicio AND c.controla_stock
      INTO v_es_servicio, v_controla_stock
    FROM (
      SELECT
        CASE lower(coalesce(v_item.metadata->>'es_servicio', ''))
          WHEN 'true' THEN true
          WHEN 'false' THEN false
          ELSE coalesce(p.es_servicio, false)
            OR lower(coalesce(p.tipo, '')) = 'servicio'
        END AS es_servicio,
        CASE lower(coalesce(v_item.metadata->>'controla_stock', ''))
          WHEN 'true' THEN true
          WHEN 'false' THEN false
          ELSE coalesce(p.controla_stock, true)
        END AS controla_stock
      FROM public.productos p
      WHERE p.id = v_item.producto_id AND p.tenant_id = p_tenant_id
    ) c;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto del item % no pertenece al tenant', v_item.id;
    END IF;

    IF v_calidad IN ('OK', 'OBSERVADO') THEN
      IF v_controla_stock THEN
        IF v_item.almacen_id IS NULL THEN
          RAISE EXCEPTION 'El item físico % no tiene almacen_id', v_item.id;
        END IF;

        SELECT count(*) INTO v_movimientos_previos
        FROM public.movimientos_inventario mi
        WHERE mi.tenant_id = p_tenant_id
          AND upper(coalesce(mi.referencia_tipo, '')) = 'RECEPCION'
          AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'ENTRADA'
          AND (
            mi.referencia_id = v_item.id
            OR mi.metadata->>'recepcion_item_id' = v_item.id::text
          );
        IF v_movimientos_previos > 0 THEN
          RAISE EXCEPTION 'Ya existe una entrada física para el item % con recepción aún BORRADOR',
            v_item.id;
        END IF;

        v_mov_id := public.aplicar_movimiento_inventario_tx(
          p_tenant_id := p_tenant_id,
          p_producto_id := v_item.producto_id,
          p_almacen_id := v_item.almacen_id,
          p_tipo := 'ENTRADA',
          p_cantidad := v_item.cantidad_recibida,
          p_referencia_tipo := 'RECEPCION',
          p_referencia_id := v_item.id,
          p_notas := 'Recepción ' || coalesce(v_recepcion.numero, ''),
          p_ubicacion_id := v_item.ubicacion_id,
          p_lote := v_item.lote,
          p_fecha_expiracion := v_item.fecha_expiracion::date,
          p_created_by := p_user_id,
          p_metadata := jsonb_build_object(
            'recepcion_id', p_recepcion_id,
            'recepcion_item_id', v_item.id,
            'orden_detalle_id', v_item.detalle_id,
            'atomic_rpc', 'cerrar_recepcion_tx',
            'schema_version', 444,
            'costo_unitario', coalesce(v_detalle.precio_unitario, 0)
          )
        );

        v_movimientos := v_movimientos || jsonb_build_object(
          'movimiento_id', v_mov_id,
          'recepcion_item_id', v_item.id,
          'detalle_id', v_item.detalle_id,
          'producto_id', v_item.producto_id,
          'almacen_id', v_item.almacen_id,
          'cantidad', v_item.cantidad_recibida
        );
      END IF;

      v_nueva_cant := coalesce(v_detalle.cantidad_recibida, 0)
        + v_item.cantidad_recibida;
      IF v_nueva_cant > coalesce(v_detalle.cantidad, 0) THEN
        RAISE EXCEPTION 'La cantidad aceptada acumulada (%) excede la ordenada (%) en detalle %',
          v_nueva_cant, v_detalle.cantidad, v_item.detalle_id;
      END IF;
      UPDATE public.orden_compra_detalles
      SET cantidad_recibida = v_nueva_cant, updated_at = now()
      WHERE id = v_item.detalle_id AND tenant_id = p_tenant_id;
    END IF;
  END LOOP;

  SELECT coalesce(sum(cantidad), 0),
         coalesce(sum(coalesce(cantidad_recibida, 0)), 0)
    INTO v_total_pedido, v_total_recibido
  FROM public.orden_compra_detalles
  WHERE orden_id = v_recepcion.orden_id AND tenant_id = p_tenant_id;

  v_nuevo_estado_orden := 'APROBADA';
  IF v_total_pedido > 0 AND v_total_recibido >= v_total_pedido THEN
    v_nuevo_estado_orden := 'RECIBIDA';
  ELSIF v_total_recibido > 0 THEN
    v_nuevo_estado_orden := 'PARCIAL';
  END IF;

  UPDATE public.ordenes_compra
  SET estado = v_nuevo_estado_orden, updated_at = now()
  WHERE id = v_recepcion.orden_id AND tenant_id = p_tenant_id;

  UPDATE public.recepciones
  SET estado = 'CERRADA',
      observaciones = coalesce(p_observaciones, observaciones),
      cerrado_por = p_user_id,
      cerrado_at = now(),
      updated_at = now()
  WHERE id = p_recepcion_id AND tenant_id = p_tenant_id
    AND upper(estado::text) = 'BORRADOR';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo cerrar la recepción; el estado cambió concurrentemente';
  END IF;

  RETURN jsonb_build_object(
    'recepcion_id', p_recepcion_id,
    'id', p_recepcion_id,
    'numero', v_recepcion.numero,
    'estado', 'CERRADA',
    'orden_id', v_recepcion.orden_id,
    'orden_estado', v_nuevo_estado_orden,
    'idempotent', false,
    'movimientos', v_movimientos
  );
END;
$$;

-- El outbox conserva el costo aceptado por clasificación. Esto permite que el
-- consumidor contable distinga mercadería (20) de servicios/no-stock (63).
CREATE OR REPLACE FUNCTION app.enqueue_recepcion_cerrada_outbox_440()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_orden record;
  v_event_id uuid := gen_random_uuid();
  v_idempotency_key text;
  v_items jsonb;
  v_subtotal_parcial numeric := 0;
  v_igv_parcial numeric := 0;
  v_total_parcial numeric := 0;
  v_mercaderia_parcial numeric := 0;
  v_servicios_parcial numeric := 0;
  v_no_stock_parcial numeric := 0;
  v_tasa numeric := 0;
  v_aceptados integer := 0;
  v_almacenes integer := 0;
  v_almacen_id uuid;
  v_outbox_id uuid;
BEGIN
  IF upper(coalesce(NEW.estado::text, '')) <> 'CERRADA'
     OR upper(coalesce(OLD.estado::text, '')) = 'CERRADA' THEN
    RETURN NEW;
  END IF;

  SELECT oc.*, p.razon_social AS proveedor_nombre, p.ruc AS proveedor_ruc,
         p.condiciones_pago AS proveedor_condiciones_pago,
         p.dias_credito AS proveedor_dias_credito
    INTO v_orden
  FROM public.ordenes_compra oc
  LEFT JOIN public.proveedores p
    ON p.id = oc.proveedor_id AND p.tenant_id = oc.tenant_id
  WHERE oc.id = NEW.orden_id AND oc.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede cerrar recepción % sin orden de compra válida', NEW.id;
  END IF;

  v_tasa := app.tasa_impuesto_tenant(NEW.tenant_id);

  WITH classified AS (
    SELECT
      ri.*,
      ocd.descripcion,
      coalesce(ocd.precio_unitario, 0) AS precio_unitario,
      pr.nombre AS producto_nombre,
      coalesce(nullif(btrim(pr.afectacion_igv), ''), '10') AS afectacion_igv,
      CASE lower(coalesce(ri.metadata->>'es_servicio', ''))
        WHEN 'true' THEN true
        WHEN 'false' THEN false
        ELSE coalesce(pr.es_servicio, false)
          OR lower(coalesce(pr.tipo, '')) = 'servicio'
      END AS es_servicio,
      CASE lower(coalesce(ri.metadata->>'controla_stock', ''))
        WHEN 'true' THEN true
        WHEN 'false' THEN false
        ELSE coalesce(pr.controla_stock, true)
      END AS controla_stock_clasificado,
      round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2)
        AS base_item,
      upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO') AS aceptado
    FROM public.recepcion_items ri
    LEFT JOIN public.orden_compra_detalles ocd
      ON ocd.id = ri.detalle_id AND ocd.tenant_id = ri.tenant_id
    LEFT JOIN public.productos pr
      ON pr.id = ri.producto_id AND pr.tenant_id = ri.tenant_id
    WHERE ri.recepcion_id = NEW.id AND ri.tenant_id = NEW.tenant_id
  ), base AS (
    SELECT classified.*,
           NOT es_servicio AND controla_stock_clasificado AS controla_stock
    FROM classified
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'productoId', producto_id,
        'descripcion', coalesce(descripcion, producto_nombre, 'Producto'),
        'cantidadRecibida', cantidad_recibida,
        'precioUnitario', precio_unitario,
        'subtotal', base_item,
        'igv', CASE WHEN left(afectacion_igv, 1) = '1'
          THEN round(base_item * v_tasa, 2) ELSE 0 END,
        'total', round(base_item + CASE WHEN left(afectacion_igv, 1) = '1'
          THEN round(base_item * v_tasa, 2) ELSE 0 END, 2),
        'calidad', calidad,
        'afectacionIgv', afectacion_igv,
        'esServicio', es_servicio,
        'controlaStock', controla_stock,
        'clasificacionContable', CASE
          WHEN es_servicio THEN 'SERVICIO'
          WHEN NOT controla_stock THEN 'GASTO_NO_STOCK'
          ELSE 'MERCADERIA'
        END,
        'almacenId', CASE WHEN controla_stock THEN almacen_id ELSE NULL END,
        'lote', lote,
        'serie', serie,
        'ubicacionId', CASE WHEN controla_stock THEN ubicacion_id ELSE NULL END
      ) ORDER BY created_at, id
    ) FILTER (WHERE aceptado), '[]'::jsonb),
    round(coalesce(sum(CASE WHEN aceptado THEN base_item ELSE 0 END), 0), 2),
    round(coalesce(sum(CASE
      WHEN aceptado AND left(afectacion_igv, 1) = '1'
        THEN round(base_item * v_tasa, 2) ELSE 0 END), 0), 2),
    round(coalesce(sum(CASE
      WHEN aceptado AND controla_stock THEN base_item ELSE 0 END), 0), 2),
    round(coalesce(sum(CASE
      WHEN aceptado AND es_servicio THEN base_item ELSE 0 END), 0), 2),
    round(coalesce(sum(CASE
      WHEN aceptado AND NOT es_servicio AND NOT controla_stock THEN base_item ELSE 0 END), 0), 2),
    count(*) FILTER (WHERE aceptado),
    count(DISTINCT almacen_id) FILTER (WHERE aceptado AND controla_stock AND almacen_id IS NOT NULL),
    (array_agg(DISTINCT almacen_id ORDER BY almacen_id)
      FILTER (WHERE aceptado AND controla_stock AND almacen_id IS NOT NULL))[1]
  INTO v_items, v_subtotal_parcial, v_igv_parcial,
       v_mercaderia_parcial, v_servicios_parcial, v_no_stock_parcial,
       v_aceptados, v_almacenes, v_almacen_id
  FROM base;

  IF v_aceptados = 0 THEN
    RETURN NEW;
  END IF;
  IF v_almacenes <> 1 THEN v_almacen_id := NULL; END IF;

  v_total_parcial := round(v_subtotal_parcial + v_igv_parcial, 2);
  v_idempotency_key := 'recepcion:' || NEW.tenant_id::text || ':' || NEW.id::text;

  INSERT INTO public.outbox_events (
    event_id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, retry_count, idempotency_key, created_at, updated_at
  ) VALUES (
    v_event_id,
    NEW.tenant_id,
    'recepcion',
    NEW.id::text,
    'recepcion.registrada',
    jsonb_build_object(
      'tenantId', NEW.tenant_id,
      'tenant_id', NEW.tenant_id,
      'eventId', v_event_id,
      'idempotencyKey', v_idempotency_key,
      'idempotency_key', v_idempotency_key,
      'recepcionId', NEW.id,
      'numeroRecepcion', NEW.numero,
      'ordenId', v_orden.id,
      'numeroOrden', coalesce(v_orden.numero, v_orden.numero_orden),
      'proveedorId', v_orden.proveedor_id,
      'proveedorNombre', coalesce(v_orden.proveedor_nombre, 'Proveedor'),
      'proveedorRuc', v_orden.proveedor_ruc,
      'almacenId', v_almacen_id,
      'fechaRecepcion', NEW.fecha_recepcion,
      'subtotal', coalesce(v_orden.subtotal, 0),
      'igv', coalesce(v_orden.igv, 0),
      'total', coalesce(v_orden.total, 0),
      'subtotalParcial', v_subtotal_parcial,
      'igvParcial', v_igv_parcial,
      'totalParcial', v_total_parcial,
      'mercaderiaParcial', v_mercaderia_parcial,
      'serviciosParcial', v_servicios_parcial,
      'noStockParcial', v_no_stock_parcial,
      'moneda', coalesce(v_orden.moneda, 'PEN'),
      'diasCredito', CASE
        WHEN coalesce(v_orden.dias_credito, 0) > 0 THEN v_orden.dias_credito
        ELSE v_orden.proveedor_dias_credito END,
      'condicionesPago', coalesce(v_orden.condiciones_pago, v_orden.proveedor_condiciones_pago),
      'greProveedor', NEW.gre_proveedor,
      'items', v_items,
      'emittedAt', now(),
      'source', 'db.recepcion_cerrada.444'
    ),
    'pending',
    0,
    v_idempotency_key,
    now(),
    now()
  )
  ON CONFLICT (tenant_id, event_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_outbox_id;

  IF v_outbox_id IS NULL THEN
    RAISE EXCEPTION 'OUTBOX_IDEMPOTENCY_CONFLICT: recepción=% clave=%',
      NEW.id, v_idempotency_key;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_recepcion_tx(uuid, uuid, jsonb, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_recepcion_tx(uuid, uuid, jsonb, text, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION app.guard_recepcion_identity_444()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app.enqueue_recepcion_cerrada_outbox_440()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.crear_recepcion_tx(uuid, uuid, jsonb, text, uuid, text) IS
  'Crea cabecera e items de recepción con actor, correlativo e idempotencia en un único commit.';
COMMENT ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) IS
  'Cierra una recepción idempotentemente; sólo bienes físicos controlados mueven stock.';

COMMIT;
