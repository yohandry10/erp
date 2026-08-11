-- Una recepción cerrada y su evento contable deben confirmarse en el mismo
-- commit. Esta fila es la única fuente durable para reintentos; Node no vuelve
-- a persistir el evento después del cierre.

BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_recepcion_items_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_recepcion_tenant uuid;
  v_recepcion_orden_id uuid;
  v_recepcion_estado text;
  v_detalle_tenant uuid;
  v_detalle_orden_id uuid;
  v_detalle_producto_id uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(coalesce(NEW.tenant_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(coalesce(NEW.recepcion_id::text, ''));
  NEW.detalle_id := app.to_uuid_or_null(coalesce(NEW.detalle_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(coalesce(NEW.producto_id::text, ''));

  IF TG_OP = 'UPDATE' AND (
    NEW.recepcion_id IS DISTINCT FROM OLD.recepcion_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Un item de recepción no puede cambiar de recepción ni tenant',
      ERRCODE = '23514';
  END IF;

  IF NEW.recepcion_id IS NULL OR NEW.producto_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'recepcion_id y producto_id son obligatorios en recepcion_items',
      ERRCODE = '23514';
  END IF;

  SELECT r.tenant_id, r.orden_id, upper(coalesce(r.estado::text, ''))
    INTO v_recepcion_tenant, v_recepcion_orden_id, v_recepcion_estado
  FROM public.recepciones r
  WHERE r.id = NEW.recepcion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Recepción no existe: %s', NEW.recepcion_id),
      ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_recepcion_tenant;
  ELSIF NEW.tenant_id IS DISTINCT FROM v_recepcion_tenant THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con recepción en recepcion_items',
      ERRCODE = '23514';
  END IF;
  IF v_recepcion_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Los items de una recepción sólo pueden cambiar mientras está BORRADOR',
      ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = NEW.producto_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'producto_id no pertenece al tenant de la recepción',
      ERRCODE = '23514';
  END IF;

  IF v_recepcion_orden_id IS NOT NULL AND NEW.detalle_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'detalle_id es obligatorio para una recepción ligada a orden de compra',
      ERRCODE = '23514';
  END IF;

  IF NEW.detalle_id IS NOT NULL THEN
    SELECT d.tenant_id, d.orden_id, d.producto_id
      INTO v_detalle_tenant, v_detalle_orden_id, v_detalle_producto_id
    FROM public.orden_compra_detalles d
    WHERE d.id = NEW.detalle_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Detalle de orden no existe: %s', NEW.detalle_id),
        ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM v_detalle_tenant
       OR v_recepcion_orden_id IS DISTINCT FROM v_detalle_orden_id THEN
      RAISE EXCEPTION USING
        MESSAGE = 'detalle_id no pertenece a la orden/tenant de la recepción',
        ERRCODE = '23514';
    END IF;
    IF NEW.producto_id IS DISTINCT FROM v_detalle_producto_id THEN
      RAISE EXCEPTION USING
        MESSAGE = 'producto_id no coincide con el producto del detalle de compra',
        ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.almacen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = NEW.almacen_id AND a.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'almacen_id no pertenece al tenant de la recepción',
      ERRCODE = '23514';
  END IF;
  IF NEW.ubicacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = NEW.ubicacion_id AND u.tenant_id = NEW.tenant_id
      AND u.almacen_id = NEW.almacen_id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'ubicacion_id no pertenece al almacén de la recepción',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_recepcion_items_tenant_consistency
  ON public.recepcion_items;
CREATE TRIGGER trg_enforce_recepcion_items_tenant_consistency
BEFORE INSERT OR UPDATE
ON public.recepcion_items
FOR EACH ROW
EXECUTE FUNCTION app.enforce_recepcion_items_tenant_consistency();

CREATE OR REPLACE FUNCTION app.prevent_recepcion_item_delete_440()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT upper(coalesce(r.estado::text, '')) INTO v_estado
  FROM public.recepciones r
  WHERE r.id = OLD.recepcion_id
  FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'Los items de una recepción sólo pueden eliminarse mientras está BORRADOR';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_recepcion_item_delete_440
  ON public.recepcion_items;
CREATE TRIGGER trg_prevent_recepcion_item_delete_440
BEFORE DELETE ON public.recepcion_items
FOR EACH ROW
EXECUTE FUNCTION app.prevent_recepcion_item_delete_440();

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
      'recepcion_id', p_recepcion_id, 'numero', v_recepcion.numero,
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

  -- Todos los cierres toman detalles en el mismo orden para evitar deadlocks
  -- entre recepciones concurrentes de una misma orden.
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

    -- RECHAZADO registra la inspección, pero no ingresa inventario ni cumple la
    -- cantidad ordenada. El proveedor aún debe reponer esa cantidad.
    IF v_calidad IN ('OK', 'OBSERVADO') THEN
      IF v_item.almacen_id IS NULL THEN
        RAISE EXCEPTION 'El item % no tiene almacen_id', v_item.id;
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
    'numero', v_recepcion.numero,
    'orden_id', v_recepcion.orden_id,
    'orden_estado', v_nuevo_estado_orden,
    'movimientos', v_movimientos
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_recepcion_close_440()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_rpc_owner name;
BEGIN
  IF upper(coalesce(OLD.estado::text, '')) = 'CERRADA'
     AND upper(coalesce(NEW.estado::text, '')) <> 'CERRADA' THEN
    RAISE EXCEPTION 'CERRADA es un estado terminal; use una reversa explícita para corregir la recepción';
  END IF;
  IF upper(coalesce(NEW.estado::text, '')) = 'CERRADA'
     AND upper(coalesce(OLD.estado::text, '')) <> 'CERRADA' THEN
    SELECT r.rolname INTO v_rpc_owner
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.oid = 'public.cerrar_recepcion_tx(uuid,uuid,text,text)'::regprocedure;

    -- Dentro de la RPC SECURITY DEFINER, current_user es su propietario. Una
    -- actualización directa desde service_role conserva current_user y falla.
    IF v_rpc_owner IS NULL OR current_user <> v_rpc_owner THEN
      RAISE EXCEPTION 'La recepción sólo puede cerrarse mediante cerrar_recepcion_tx';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_recepcion_close_440 ON public.recepciones;
CREATE TRIGGER trg_guard_recepcion_close_440
BEFORE UPDATE OF estado ON public.recepciones
FOR EACH ROW
EXECUTE FUNCTION app.guard_recepcion_close_440();

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

  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'productoId', ri.producto_id,
        'descripcion', coalesce(ocd.descripcion, pr.nombre, 'Producto'),
        'cantidadRecibida', ri.cantidad_recibida,
        'precioUnitario', coalesce(ocd.precio_unitario, 0),
        'subtotal', round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2),
        'igv', CASE
          WHEN left(coalesce(nullif(btrim(pr.afectacion_igv), ''), '10'), 1) = '1'
            THEN round(round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2) * v_tasa, 2)
          ELSE 0 END,
        'total', round(
          round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2)
          + CASE
              WHEN left(coalesce(nullif(btrim(pr.afectacion_igv), ''), '10'), 1) = '1'
                THEN round(round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2) * v_tasa, 2)
              ELSE 0 END,
          2
        ),
        'calidad', ri.calidad,
        'afectacionIgv', coalesce(nullif(btrim(pr.afectacion_igv), ''), '10'),
        'almacenId', ri.almacen_id,
        'lote', ri.lote,
        'serie', ri.serie,
        'ubicacionId', ri.ubicacion_id
      ) ORDER BY ri.created_at, ri.id
    ) FILTER (WHERE upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO')), '[]'::jsonb),
    round(coalesce(sum(
      CASE WHEN upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO')
           THEN round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2)
           ELSE 0 END
    ), 0), 2),
    round(coalesce(sum(CASE
      WHEN upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO')
       AND left(coalesce(nullif(btrim(pr.afectacion_igv), ''), '10'), 1) = '1'
        THEN round(round(coalesce(ri.cantidad_recibida, 0) * coalesce(ocd.precio_unitario, 0), 2) * v_tasa, 2)
      ELSE 0 END), 0), 2),
    count(*) FILTER (WHERE upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO')),
    count(DISTINCT ri.almacen_id) FILTER (
      WHERE upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO')
        AND ri.almacen_id IS NOT NULL
    ),
    (array_agg(DISTINCT ri.almacen_id ORDER BY ri.almacen_id) FILTER (
      WHERE upper(coalesce(ri.calidad, '')) IN ('OK', 'OBSERVADO')
        AND ri.almacen_id IS NOT NULL
    ))[1]
  INTO v_items, v_subtotal_parcial, v_igv_parcial, v_aceptados,
       v_almacenes, v_almacen_id
  FROM public.recepcion_items ri
  LEFT JOIN public.orden_compra_detalles ocd
    ON ocd.id = ri.detalle_id AND ocd.tenant_id = ri.tenant_id
  LEFT JOIN public.productos pr
    ON pr.id = ri.producto_id AND pr.tenant_id = ri.tenant_id
  WHERE ri.recepcion_id = NEW.id AND ri.tenant_id = NEW.tenant_id;

  -- Una inspección 100% rechazada cierra el acta operativa, pero no reconoce
  -- inventario ni costo contable y por tanto no crea evento financiero.
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
      'moneda', coalesce(v_orden.moneda, 'PEN'),
      'diasCredito', CASE
        WHEN coalesce(v_orden.dias_credito, 0) > 0 THEN v_orden.dias_credito
        ELSE v_orden.proveedor_dias_credito END,
      'condicionesPago', coalesce(v_orden.condiciones_pago, v_orden.proveedor_condiciones_pago),
      'greProveedor', NEW.gre_proveedor,
      'items', v_items,
      'emittedAt', now(),
      'source', 'db.recepcion_cerrada.440'
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

DROP TRIGGER IF EXISTS trg_recepciones_outbox_cerrada_440 ON public.recepciones;
CREATE TRIGGER trg_recepciones_outbox_cerrada_440
AFTER UPDATE OF estado ON public.recepciones
FOR EACH ROW
EXECUTE FUNCTION app.enqueue_recepcion_cerrada_outbox_440();

REVOKE ALL ON FUNCTION app.enqueue_recepcion_cerrada_outbox_440()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.enqueue_recepcion_cerrada_outbox_440()
  TO service_role;

COMMENT ON FUNCTION app.enqueue_recepcion_cerrada_outbox_440() IS
  'Inserta recepcion.registrada en outbox dentro del mismo commit que cierra la recepción.';

REVOKE ALL ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION app.enforce_recepcion_items_tenant_consistency()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.enforce_recepcion_items_tenant_consistency()
  TO service_role;
REVOKE ALL ON FUNCTION app.prevent_recepcion_item_delete_440()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.prevent_recepcion_item_delete_440()
  TO service_role;
REVOKE ALL ON FUNCTION app.guard_recepcion_close_440()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.guard_recepcion_close_440()
  TO service_role;

COMMENT ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) IS
  'Cierra una recepción atómicamente: sólo calidad aceptada ingresa stock/cumple la OC; cada item tiene identidad física y el trigger durable queda en el mismo commit.';

-- Las entradas nuevas usan recepcion_item.id como referencia física para que
-- dos líneas del mismo SKU no colisionen. La recepción padre queda en metadata;
-- esta vista conserva compatibilidad con movimientos históricos que usaban la
-- recepción directamente como referencia_id.
CREATE OR REPLACE VIEW public.vw_kardex_valorizado
WITH (security_invoker = true) AS
SELECT
  coalesce(app.to_uuid_or_null(mov.metadata->>'recepcion_item_id'), mov.id)
    AS recepcion_item_id,
  ref.recepcion_id,
  mov.tenant_id,
  coalesce(
    nullif(btrim(rec.numero), ''),
    nullif(btrim(rec.codigo), ''),
    nullif(btrim(mov.referencia_tipo), ''),
    'MOVIMIENTO'
  ) AS recepcion_numero,
  mov.created_at AS fecha_recepcion,
  coalesce(nullif(btrim(rec.estado::text), ''), 'REGISTRADO') AS recepcion_estado,
  mov.producto_id,
  coalesce(
    nullif(btrim(prod.codigo), ''),
    nullif(btrim(prod.sku), ''),
    mov.producto_id::text
  ) AS producto_codigo,
  coalesce(nullif(btrim(prod.nombre), ''), 'Producto') AS producto_nombre,
  nullif(btrim(prod.sku), '') AS producto_sku,
  app.to_numeric_or_zero(coalesce(mov.cantidad, 0)::text)::numeric(14, 2)
    AS cantidad_recibida,
  costo.costo_unitario,
  (app.to_numeric_or_zero(coalesce(mov.cantidad, 0)::text) * costo.costo_unitario)::numeric(14, 2)
    AS valor_total,
  mov.almacen_id,
  alm.nombre AS almacen_nombre,
  mov.ubicacion_id,
  ubi.codigo AS ubicacion_codigo,
  mov.lote,
  NULL::text AS serie,
  mov.fecha_expiracion::date AS fecha_expiracion,
  'PEN'::text AS moneda_detalle
FROM public.movimientos_inventario mov
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN upper(coalesce(mov.referencia_tipo, '')) = 'RECEPCION'
      THEN coalesce(
        app.to_uuid_or_null(mov.metadata->>'recepcion_id'),
        mov.referencia_id
      )
    ELSE NULL::uuid
  END AS recepcion_id
) ref ON true
LEFT JOIN public.recepciones rec
  ON rec.id = ref.recepcion_id AND rec.tenant_id = mov.tenant_id
LEFT JOIN public.productos prod
  ON prod.id = mov.producto_id AND prod.tenant_id = mov.tenant_id
LEFT JOIN public.almacenes alm
  ON alm.id = mov.almacen_id AND alm.tenant_id = mov.tenant_id
LEFT JOIN public.almacen_ubicaciones ubi
  ON ubi.id = mov.ubicacion_id AND ubi.tenant_id = mov.tenant_id
LEFT JOIN LATERAL (
  SELECT coalesce(
    app.to_numeric_or_zero(mov.metadata ->> 'costo_unitario'),
    app.to_numeric_or_zero(prod.precio_compra::text),
    0
  )::numeric(14, 2) AS costo_unitario
) costo ON true
WHERE upper(coalesce(mov.tipo, mov.tipo_movimiento, '')) = 'ENTRADA';

COMMENT ON VIEW public.vw_kardex_valorizado IS
  'Entradas valorizadas; recepciones nuevas preservan identidad por item y recepción padre en metadata.';

-- El kardex se consulta por el backend, que aplica permisos funcionales. No
-- debe recuperar privilegios directos de clientes al reemplazar la vista.
REVOKE ALL ON TABLE public.vw_kardex_valorizado
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_kardex_valorizado
  TO service_role;

COMMIT;
