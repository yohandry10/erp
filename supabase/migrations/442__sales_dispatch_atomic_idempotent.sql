-- ============================================================================
-- 442__sales_dispatch_atomic_idempotent.sql
-- Despacho parcial de pedidos: inventario, detalle, histórico, backorder,
-- tracking y outbox se confirman como una sola unidad idempotente.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, pg_temp;

ALTER TABLE public.logistica_eventos
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.pedido_despachos
  ADD COLUMN IF NOT EXISTS logistica_evento_id uuid;

UPDATE public.logistica_eventos
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_logistica_eventos_idempotency_key_442'
      AND conrelid = 'public.logistica_eventos'::regclass
  ) THEN
    ALTER TABLE public.logistica_eventos
      ADD CONSTRAINT ck_logistica_eventos_idempotency_key_442
      CHECK (
        idempotency_key IS NULL
        OR (length(btrim(idempotency_key)) BETWEEN 8 AND 200)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_despachos_logistica_evento_id_fkey_442'
      AND conrelid = 'public.pedido_despachos'::regclass
  ) THEN
    ALTER TABLE public.pedido_despachos
      ADD CONSTRAINT pedido_despachos_logistica_evento_id_fkey_442
      FOREIGN KEY (logistica_evento_id)
      REFERENCES public.logistica_eventos(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.logistica_eventos
  VALIDATE CONSTRAINT ck_logistica_eventos_idempotency_key_442;
ALTER TABLE public.pedido_despachos
  VALIDATE CONSTRAINT pedido_despachos_logistica_evento_id_fkey_442;

CREATE UNIQUE INDEX IF NOT EXISTS ux_logistica_eventos_dispatch_key_442
  ON public.logistica_eventos (tenant_id, tipo, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_despachos_evento_detalle_442
  ON public.pedido_despachos (logistica_evento_id, detalle_id)
  WHERE logistica_evento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.enforce_pedido_despacho_event_442()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_evento record;
BEGIN
  IF NEW.logistica_evento_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, pedido_id, tipo
    INTO v_evento
  FROM public.logistica_eventos
  WHERE id = NEW.logistica_evento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento logístico no existe: %', NEW.logistica_evento_id
      USING ERRCODE = '23503';
  END IF;
  IF v_evento.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR v_evento.pedido_id IS DISTINCT FROM NEW.pedido_id
     OR upper(v_evento.tipo) <> 'DESPACHO' THEN
    RAISE EXCEPTION 'El histórico de despacho no coincide con su evento logístico'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_despacho_event_442
ON public.pedido_despachos;
CREATE TRIGGER trg_enforce_pedido_despacho_event_442
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, logistica_evento_id
ON public.pedido_despachos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedido_despacho_event_442();

CREATE OR REPLACE FUNCTION app.despachar_pedido_parcial_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_notas text DEFAULT NULL,
  p_registrado_por uuid DEFAULT NULL,
  p_datos_logisticos jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_items_canon jsonb;
  v_datos jsonb := coalesce(p_datos_logisticos, '{}'::jsonb);
  v_fingerprint text;
  v_evento public.logistica_eventos;
  v_evento_transito_id uuid;
  v_pedido public.pedidos_venta;
  v_item record;
  v_plan_count integer;
  v_input_count integer;
  v_input_distinct integer;
  v_usar_flujo boolean;
  v_requiere_ubicacion boolean;
  v_requiere_lote boolean;
  v_cantidad numeric(14,2);
  v_pendiente numeric(14,2);
  v_nuevo_despachado numeric(14,2);
  v_estado_item text;
  v_almacen_id uuid;
  v_ubicacion_id uuid;
  v_lote text;
  v_almacenes_reserva integer;
  v_almacen_reserva uuid;
  v_reserva_almacen numeric(14,2);
  v_reserva_otros numeric(14,2);
  v_liberar numeric(14,2);
  v_movimiento_id uuid;
  v_despacho_id uuid;
  v_outbox_id uuid;
  v_stock_despues numeric(14,2);
  v_stock_antes numeric(14,2);
  v_valor numeric(14,2);
  v_referencia_tipo text;
  v_quedan_pendientes boolean;
  v_nuevo_estado text;
  v_result_items jsonb := '[]'::jsonb;
  v_movimientos jsonb := '[]'::jsonb;
  v_outbox_ids jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF p_pedido_id IS NULL OR p_tenant_id IS NULL OR p_registrado_por IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'pedido_id, tenant_id, actor e idempotency_key (8..200) son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items debe ser un arreglo JSON' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_datos) <> 'object' THEN
    RAISE EXCEPTION 'p_datos_logisticos debe ser un objeto JSON' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR nullif(btrim(e->>'detalle_id'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Cada item debe ser un objeto con detalle_id' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':despacho:' || v_key, 442)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_registrado_por
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor del despacho no pertenece al tenant o está inactivo'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT e->>'detalle_id')
    INTO v_input_count, v_input_distinct
  FROM jsonb_array_elements(v_items) e;
  IF v_input_count <> v_input_distinct THEN
    RAISE EXCEPTION 'No se permiten detalles duplicados en un despacho'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(e ORDER BY e->>'detalle_id'), '[]'::jsonb)
    INTO v_items_canon
  FROM jsonb_array_elements(v_items) e;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'pedido_id', p_pedido_id,
        'items', v_items_canon,
        'notas', nullif(btrim(coalesce(p_notas, '')), ''),
        'datos_logisticos', v_datos,
        'registrado_por', p_registrado_por
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  SELECT * INTO v_evento
  FROM public.logistica_eventos le
  WHERE le.tenant_id = p_tenant_id
    AND upper(le.tipo) = 'DESPACHO'
    AND le.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_evento.pedido_id IS DISTINCT FROM p_pedido_id
       OR v_evento.registrado_por IS DISTINCT FROM p_registrado_por
       OR v_evento.datos->>'fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DISPATCH_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    IF jsonb_typeof(v_evento.datos->'resultado') <> 'object' THEN
      RAISE EXCEPTION 'DISPATCH_IDEMPOTENCY_RECORD_INCOMPLETE'
        USING ERRCODE = '23514';
    END IF;
    RETURN (v_evento.datos->'resultado') || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_pedido.estado::text) NOT IN ('LISTO_DESPACHO', 'DESPACHO_PARCIAL') THEN
    RAISE EXCEPTION 'No se puede despachar un pedido en estado %', v_pedido.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(ec.usar_flujo_logistica, false),
         coalesce(ec.requiere_ubicaciones_inventario, false),
         coalesce(ec.requiere_lotes_series, false)
    INTO v_usar_flujo, v_requiere_ubicacion, v_requiere_lote
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF NOT FOUND OR NOT v_usar_flujo THEN
    RAISE EXCEPTION 'El flujo logístico no está habilitado para este tenant'
      USING ERRCODE = '23514';
  END IF;

  -- Valida de una vez que todos los IDs explícitos pertenecen al pedido y que
  -- corresponden a bienes físicos. Un servicio nunca entra al kardex.
  IF v_input_count > 0 AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) e
    LEFT JOIN public.pedidos_venta_detalle d
      ON d.id = (e->>'detalle_id')::uuid
     AND d.tenant_id = p_tenant_id
     AND d.pedido_id = p_pedido_id
    LEFT JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    WHERE d.id IS NULL
       OR p.id IS NULL
       OR coalesce(p.es_servicio, false)
       OR NOT coalesce(p.controla_stock, true)
  ) THEN
    RAISE EXCEPTION 'El despacho contiene un detalle inexistente, ajeno o sin control de stock'
      USING ERRCODE = '23514';
  END IF;

  -- Todos los detalles se bloquean en el mismo orden que el writer de
  -- inventario para evitar sobre-despacho y deadlocks entre lotes concurrentes.
  PERFORM d.id
  FROM public.pedidos_venta_detalle d
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
  WHERE d.tenant_id = p_tenant_id
    AND d.pedido_id = p_pedido_id
    AND NOT coalesce(p.es_servicio, false)
    AND coalesce(p.controla_stock, true)
    AND (
      v_input_count = 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_items) e
        WHERE e->>'detalle_id' = d.id::text
      )
    )
  ORDER BY d.producto_id, d.id
  FOR UPDATE OF d;

  SELECT count(*) INTO v_plan_count
  FROM public.pedidos_venta_detalle d
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
  WHERE d.tenant_id = p_tenant_id
    AND d.pedido_id = p_pedido_id
    AND coalesce(d.cantidad_despachada, 0) < coalesce(d.cantidad, 0)
    AND NOT coalesce(p.es_servicio, false)
    AND coalesce(p.controla_stock, true)
    AND (
      v_input_count = 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_items) e
        WHERE e->>'detalle_id' = d.id::text
      )
    );

  IF v_plan_count = 0 OR (v_input_count > 0 AND v_plan_count <> v_input_count) THEN
    RAISE EXCEPTION 'No hay detalles físicos pendientes válidos para despachar'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.logistica_eventos (
    tenant_id, pedido_id, tipo, datos, registrado_por, registrado_en,
    idempotency_key, estado, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_pedido_id, 'DESPACHO',
    jsonb_build_object(
      'fingerprint', v_fingerprint,
      'fingerprint_version', 1,
      'request', jsonb_build_object(
        'items', v_items_canon,
        'notas', nullif(btrim(coalesce(p_notas, '')), ''),
        'datos_logisticos', v_datos
      ),
      'atomic_rpc', 'despachar_pedido_parcial_tx'
    ),
    p_registrado_por, now(), v_key, 'ACTIVO', now(), now()
  )
  RETURNING * INTO v_evento;

  FOR v_item IN
    SELECT d.id AS detalle_id,
           d.producto_id,
           d.descripcion,
           round(coalesce(d.cantidad, 0)::numeric, 2) AS cantidad_total,
           round(coalesce(d.cantidad_despachada, 0)::numeric, 2) AS cantidad_despachada,
           coalesce(p.precio_compra, p.costo, 0) AS costo_unitario,
           i.item AS input
    FROM public.pedidos_venta_detalle d
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    LEFT JOIN LATERAL (
      SELECT e AS item
      FROM jsonb_array_elements(v_items) e
      WHERE e->>'detalle_id' = d.id::text
      LIMIT 1
    ) i ON true
    WHERE d.tenant_id = p_tenant_id
      AND d.pedido_id = p_pedido_id
      AND coalesce(d.cantidad_despachada, 0) < coalesce(d.cantidad, 0)
      AND NOT coalesce(p.es_servicio, false)
      AND coalesce(p.controla_stock, true)
      AND (v_input_count = 0 OR i.item IS NOT NULL)
    ORDER BY d.producto_id, d.id
  LOOP
    v_pendiente := round(v_item.cantidad_total - v_item.cantidad_despachada, 2);
    v_cantidad := round(coalesce(
      nullif(v_item.input->>'cantidad', '')::numeric,
      v_pendiente
    ), 2);

    IF v_cantidad <= 0 OR v_cantidad > v_pendiente THEN
      RAISE EXCEPTION 'Cantidad de despacho inválida para detalle %: solicitada %, pendiente %',
        v_item.detalle_id, v_cantidad, v_pendiente USING ERRCODE = '23514';
    END IF;

    v_almacen_id := coalesce(
      nullif(v_item.input->>'almacen_id', '')::uuid,
      nullif(v_datos->>'almacen_id', '')::uuid
    );
    v_ubicacion_id := coalesce(
      nullif(v_item.input->>'ubicacion_id', '')::uuid,
      nullif(v_datos->>'ubicacion_id', '')::uuid
    );
    v_lote := coalesce(
      nullif(btrim(v_item.input->>'lote'), ''),
      nullif(btrim(v_datos->>'lote'), '')
    );

    SELECT count(*), (array_agg(s.almacen_id ORDER BY s.almacen_id))[1]
      INTO v_almacenes_reserva, v_almacen_reserva
    FROM (
      SELECT mi.almacen_id
      FROM public.movimientos_inventario mi
      WHERE mi.tenant_id = p_tenant_id
        AND mi.referencia_id = p_pedido_id
        AND mi.producto_id = v_item.producto_id
        AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
      GROUP BY mi.almacen_id
      HAVING sum(CASE
        WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
        ELSE -mi.cantidad END) > 0
    ) s;

    IF v_almacen_id IS NULL THEN
      IF v_almacenes_reserva = 1 AND v_almacen_reserva IS NOT NULL THEN
        v_almacen_id := v_almacen_reserva;
      ELSIF v_almacenes_reserva > 1 OR (v_almacenes_reserva = 1 AND v_almacen_reserva IS NULL) THEN
        RAISE EXCEPTION 'ORDER_RESERVATION_MULTIWAREHOUSE_UNSUPPORTED: detalle=% almacenes=%',
          v_item.detalle_id, v_almacenes_reserva USING ERRCODE = '23514';
      ELSE
        SELECT (array_agg(a.id ORDER BY a.es_principal DESC, a.id))[1]
          INTO v_almacen_id
        FROM public.almacenes a
        WHERE a.tenant_id = p_tenant_id AND coalesce(a.activo, true)
        HAVING count(*) = 1 OR count(*) FILTER (WHERE coalesce(a.es_principal, false)) = 1;
      END IF;
    END IF;

    IF v_almacen_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.almacenes a
      WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id
        AND coalesce(a.activo, true)
    ) THEN
      RAISE EXCEPTION 'No se pudo resolver un almacén activo del tenant para el detalle %',
        v_item.detalle_id USING ERRCODE = '23514';
    END IF;
    IF v_requiere_ubicacion AND v_ubicacion_id IS NULL THEN
      RAISE EXCEPTION 'Debe indicar una ubicación para el detalle %', v_item.detalle_id
        USING ERRCODE = '23514';
    END IF;
    IF v_requiere_lote AND v_lote IS NULL THEN
      RAISE EXCEPTION 'Debe indicar lote o serie para el detalle %', v_item.detalle_id
        USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(CASE
             WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
             ELSE -mi.cantidad END), 0)
      INTO v_reserva_almacen
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.referencia_id = p_pedido_id
      AND mi.producto_id = v_item.producto_id
      AND mi.almacen_id = v_almacen_id
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION');

    SELECT coalesce(sum(s.cantidad), 0)
      INTO v_reserva_otros
    FROM (
      SELECT mi.almacen_id,
             sum(CASE
               WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
               ELSE -mi.cantidad END) AS cantidad
      FROM public.movimientos_inventario mi
      WHERE mi.tenant_id = p_tenant_id
        AND mi.referencia_id = p_pedido_id
        AND mi.producto_id = v_item.producto_id
        AND mi.almacen_id IS DISTINCT FROM v_almacen_id
        AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
      GROUP BY mi.almacen_id
      HAVING sum(CASE
        WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
        ELSE -mi.cantidad END) > 0
    ) s;

    v_reserva_almacen := greatest(v_reserva_almacen, 0);
    IF v_reserva_almacen < v_cantidad AND v_reserva_otros > 0 THEN
      RAISE EXCEPTION 'La reserva del pedido está en otro almacén para el detalle %',
        v_item.detalle_id USING ERRCODE = '23514';
    END IF;
    v_liberar := least(v_cantidad, v_reserva_almacen);
    v_referencia_tipo := 'PEDIDO_DESP_' || md5(v_key) || '_' || left(v_item.detalle_id::text, 8);

    v_movimiento_id := public.despachar_stock_en_almacen_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_item.producto_id,
      p_almacen_id := v_almacen_id,
      p_cantidad := v_cantidad,
      p_cantidad_reservada := v_liberar,
      p_referencia_tipo := v_referencia_tipo,
      p_referencia_id := p_pedido_id,
      p_notas := coalesce(nullif(btrim(p_notas), ''),
        'Salida por despacho de pedido ' || coalesce(v_pedido.numero, p_pedido_id::text)),
      p_ubicacion_id := v_ubicacion_id,
      p_lote := v_lote,
      p_metadata := jsonb_build_object(
        'pedido_id', p_pedido_id,
        'detalle_id', v_item.detalle_id,
        'logistica_evento_id', v_evento.id,
        'dispatch_idempotency_key', v_key,
        'costo_unitario', coalesce(v_item.costo_unitario, 0),
        'source', 'logistica',
        'atomic_rpc', 'despachar_pedido_parcial_tx'
      )
    );

    SELECT coalesce(nullif(mi.metadata->>'stock_total_actual', '')::numeric, 0),
           coalesce(nullif(mi.metadata->>'valor_total', '')::numeric, 0)
      INTO v_stock_despues, v_valor
    FROM public.movimientos_inventario mi
    WHERE mi.id = v_movimiento_id AND mi.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El writer no devolvió un movimiento verificable'
        USING ERRCODE = '23514';
    END IF;
    v_stock_antes := round(v_stock_despues + v_cantidad, 2);

    v_nuevo_despachado := round(v_item.cantidad_despachada + v_cantidad, 2);
    v_estado_item := CASE
      WHEN v_nuevo_despachado >= v_item.cantidad_total THEN 'DESPACHADO'
      ELSE 'PARCIAL'
    END;

    UPDATE public.pedidos_venta_detalle d
    SET cantidad_despachada = v_nuevo_despachado,
        estado_item = v_estado_item,
        updated_at = now()
    WHERE d.id = v_item.detalle_id
      AND d.tenant_id = p_tenant_id
      AND d.pedido_id = p_pedido_id;

    INSERT INTO public.pedido_despachos (
      tenant_id, pedido_id, detalle_id, producto_id, cantidad,
      registrado_por, registrado_en, notas, almacen_id, ubicacion_id, lote,
      logistica_evento_id, estado, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, p_pedido_id, v_item.detalle_id, v_item.producto_id,
      v_cantidad, p_registrado_por, now(), nullif(btrim(p_notas), ''),
      v_almacen_id, v_ubicacion_id, v_lote, v_evento.id, 'REGISTRADO',
      jsonb_build_object('movimiento_id', v_movimiento_id, 'idempotency_key', v_key),
      now(), now()
    ) RETURNING id INTO v_despacho_id;

    IF v_nuevo_despachado < v_item.cantidad_total THEN
      INSERT INTO public.pedido_backorders (
        tenant_id, pedido_id, detalle_id, producto_id,
        cantidad_comprometida, cantidad_despachada, cantidad_pendiente,
        estado, almacen_id, updated_at
      ) VALUES (
        p_tenant_id, p_pedido_id, v_item.detalle_id, v_item.producto_id,
        v_item.cantidad_total, v_nuevo_despachado,
        round(v_item.cantidad_total - v_nuevo_despachado, 2),
        'PARCIAL', v_almacen_id, now()
      )
      ON CONFLICT (detalle_id) DO UPDATE
      SET cantidad_comprometida = EXCLUDED.cantidad_comprometida,
          cantidad_despachada = EXCLUDED.cantidad_despachada,
          cantidad_pendiente = EXCLUDED.cantidad_pendiente,
          estado = EXCLUDED.estado,
          almacen_id = EXCLUDED.almacen_id,
          updated_at = now();
    ELSE
      DELETE FROM public.pedido_backorders b
      WHERE b.detalle_id = v_item.detalle_id
        AND b.tenant_id = p_tenant_id
        AND b.pedido_id = p_pedido_id;
    END IF;

    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, 'inventario', v_movimiento_id::text, 'stock.movimiento',
      jsonb_build_object(
        'eventId', v_movimiento_id,
        'tenantId', p_tenant_id,
        'idempotencyKey', 'stock.movimiento:' || p_tenant_id || ':' || v_movimiento_id,
        'source', 'logistica',
        'movimientoId', v_movimiento_id,
        'aggregateId', v_movimiento_id,
        'productoId', v_item.producto_id,
        'tipoMovimiento', 'SALIDA',
        'cantidad', v_cantidad,
        'stockAnterior', v_stock_antes,
        'stockNuevo', v_stock_despues,
        'motivo', 'Despacho pedido ' || coalesce(v_pedido.numero, p_pedido_id::text),
        'valor', v_valor,
        'ventaId', p_pedido_id
      ),
      'pending', 0,
      'stock.movimiento:' || p_tenant_id || ':' || v_movimiento_id,
      v_movimiento_id, now(), now(), now()
    ) RETURNING id INTO v_outbox_id;

    v_result_items := v_result_items || jsonb_build_object(
      'detalle_id', v_item.detalle_id,
      'producto_id', v_item.producto_id,
      'cantidad', v_cantidad,
      'total_despachado', v_nuevo_despachado,
      'despacho_id', v_despacho_id,
      'movimiento_id', v_movimiento_id,
      'almacen_id', v_almacen_id
    );
    v_movimientos := v_movimientos || to_jsonb(v_movimiento_id);
    v_outbox_ids := v_outbox_ids || to_jsonb(v_outbox_id);
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.pedidos_venta_detalle d
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant_id
      AND d.pedido_id = p_pedido_id
      AND NOT coalesce(p.es_servicio, false)
      AND coalesce(p.controla_stock, true)
      AND round(coalesce(d.cantidad_despachada, 0)::numeric, 2)
          < round(coalesce(d.cantidad, 0)::numeric, 2)
  ) INTO v_quedan_pendientes;

  v_nuevo_estado := CASE
    WHEN v_quedan_pendientes THEN 'DESPACHO_PARCIAL'
    ELSE 'LISTO_FACTURAR'
  END;

  UPDATE public.pedidos_venta p
  SET estado = v_nuevo_estado,
      tracking_estado = 'EN_TRANSITO',
      tracking_actualizado_en = now(),
      tracking_notas = nullif(btrim(p_notas), ''),
      notas = CASE
        WHEN nullif(btrim(p_notas), '') IS NULL THEN p.notas
        ELSE concat_ws(E'\n', nullif(btrim(coalesce(p.notas, '')), ''), '[DESPACHO] ' || btrim(p_notas))
      END,
      updated_at = now()
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id;

  INSERT INTO public.logistica_eventos (
    tenant_id, pedido_id, tipo, datos, registrado_por, registrado_en,
    idempotency_key, estado, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_pedido_id, 'TRANSITO',
    jsonb_build_object(
      'estado', 'EN_TRANSITO',
      'despacho_evento_id', v_evento.id,
      'dispatch_idempotency_key', v_key,
      'atomic_rpc', 'despachar_pedido_parcial_tx'
    ),
    p_registrado_por, now(), v_key || ':transito', 'ACTIVO', now(), now()
  ) RETURNING id INTO v_evento_transito_id;

  v_result := jsonb_build_object(
    'success', true,
    'pedido_id', p_pedido_id,
    'idempotency_key', v_key,
    'estado', v_nuevo_estado,
    'evento_logistico_id', v_evento.id,
    'evento_transito_id', v_evento_transito_id,
    'items', v_result_items,
    'movimientos', v_movimientos,
    'outbox_ids', v_outbox_ids,
    'idempotent', false
  );

  UPDATE public.logistica_eventos le
  SET datos = le.datos || jsonb_build_object('resultado', v_result),
      updated_at = now()
  WHERE le.id = v_evento.id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.despachar_pedido_parcial_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_notas text DEFAULT NULL,
  p_registrado_por uuid DEFAULT NULL,
  p_datos_logisticos jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.despachar_pedido_parcial_tx(
    p_pedido_id, p_tenant_id, p_idempotency_key, p_items,
    p_notas, p_registrado_por, p_datos_logisticos
  );
$function$;

REVOKE ALL ON FUNCTION app.despachar_pedido_parcial_tx(
  uuid, uuid, text, jsonb, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.despachar_pedido_parcial_tx(
  uuid, uuid, text, jsonb, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.despachar_pedido_parcial_tx(
  uuid, uuid, text, jsonb, text, uuid, jsonb
) TO service_role;

COMMENT ON FUNCTION public.despachar_pedido_parcial_tx(
  uuid, uuid, text, jsonb, text, uuid, jsonb
) IS 'Despacha un lote idempotente en una sola transacción: libera reserva propia, registra salida, histórico, backorder, tracking y outbox.';

COMMIT;

NOTIFY pgrst, 'reload schema';
