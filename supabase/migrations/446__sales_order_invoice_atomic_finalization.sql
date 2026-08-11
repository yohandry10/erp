-- Cierra pedido -> salida/reserva -> documento/CPE -> CxC/outbox en un commit.
-- No envía el comprobante a SUNAT/OSE: la entrega legal continúa siendo un
-- paso posterior que usa las credenciales/configuración del cliente.
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF to_regprocedure('app.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)') IS NULL
     OR to_regprocedure('public.despachar_stock_en_almacen_tx(uuid,uuid,uuid,numeric,numeric,text,uuid,text,uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '446 requiere las fronteras atómicas 348 y 443';
  END IF;
  IF to_regclass('public.pedidos_venta') IS NULL
     OR to_regclass('public.pedidos_venta_detalle') IS NULL
     OR to_regclass('public.productos') IS NULL
     OR to_regclass('public.movimientos_inventario') IS NULL THEN
    RAISE EXCEPTION '446 requiere tablas operativas de pedidos e inventario';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION app.facturar_pedido_venta_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe jsonb,
  p_documento jsonb,
  p_detalles jsonb,
  p_cxc jsonb,
  p_event_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_pedido public.pedidos_venta;
  v_usa_logistica boolean := false;
  v_detalles_pedido integer;
  v_detalles_payload integer;
  v_detalles_distintos integer;
  v_resultado jsonb;
  v_cpe_payload jsonb;
  v_cpe_id uuid;
  v_documento_id uuid;
  v_item record;
  v_almacen_id uuid;
  v_almacenes integer;
  v_reserva numeric(14,2);
  v_movimiento_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_costo_ventas numeric(14,2) := 0;
BEGIN
  IF p_pedido_id IS NULL OR p_tenant_id IS NULL OR p_actor_id IS NULL
     OR p_event_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 255
     OR p_cpe IS NULL OR jsonb_typeof(p_cpe) <> 'object'
     OR p_documento IS NULL OR jsonb_typeof(p_documento) <> 'object'
     OR p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array'
     OR (p_cxc IS NOT NULL AND jsonb_typeof(p_cxc) <> 'object') THEN
    RAISE EXCEPTION 'Pedido, tenant, actor, evento, key y payloads válidos son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(p_documento->>'pedido_id', '')::uuid IS DISTINCT FROM p_pedido_id
     OR nullif(p_cpe->>'created_by', '')::uuid IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'El pedido/actor del payload no coincide con la operación'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':facturar-pedido:' || p_pedido_id::text, 446)
  );

  SELECT p.* INTO v_pedido
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado en el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_pedido.estado::text) NOT IN ('CONFIRMADO', 'LISTO_FACTURAR', 'FACTURADO') THEN
    RAISE EXCEPTION 'El pedido % no puede facturarse desde estado %', p_pedido_id, v_pedido.estado
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor no pertenece al tenant o está inactivo'
      USING ERRCODE = '23514';
  END IF;
  IF nullif(p_cpe->>'cliente_id', '')::uuid IS DISTINCT FROM v_pedido.cliente_id THEN
    RAISE EXCEPTION 'La factura no pertenece al cliente del pedido'
      USING ERRCODE = '23514';
  END IF;

  -- El detalle fiscal debe representar cada línea comercial exactamente una
  -- vez. pedido_detalle_id evita que dos líneas del mismo SKU colisionen o se
  -- facturen parcialmente sin intención explícita.
  SELECT count(*) INTO v_detalles_pedido
  FROM public.pedidos_venta_detalle d
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id;
  SELECT count(*), count(DISTINCT nullif(e->>'pedido_detalle_id', '')::uuid)
    INTO v_detalles_payload, v_detalles_distintos
  FROM jsonb_array_elements(p_detalles) e;

  IF v_detalles_pedido = 0
     OR v_detalles_payload <> v_detalles_pedido
     OR v_detalles_distintos <> v_detalles_pedido
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_detalles) e
       LEFT JOIN public.pedidos_venta_detalle d
         ON d.id = nullif(e->>'pedido_detalle_id', '')::uuid
        AND d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
       WHERE d.id IS NULL
          OR d.producto_id IS DISTINCT FROM nullif(e->>'producto_id', '')::uuid
          OR abs(coalesce(d.cantidad, 0) - coalesce((e->>'cantidad')::numeric, 0)) > 0.0001
          OR abs(coalesce(d.precio_unitario, 0) - coalesce((e->>'precio_unitario')::numeric, 0)) > 0.01
          OR abs(coalesce(d.subtotal, 0) - coalesce((e->>'valor_venta')::numeric, 0)) > 0.01
     ) THEN
    RAISE EXCEPTION 'El detalle fiscal no coincide exactamente con el pedido'
      USING ERRCODE = '23514';
  END IF;

  -- Bloqueo determinista de líneas/productos antes del writer de inventario.
  PERFORM d.id
  FROM public.pedidos_venta_detalle d
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
  ORDER BY d.producto_id, d.id
  FOR UPDATE;
  PERFORM p.id
  FROM public.productos p
  JOIN public.pedidos_venta_detalle d
    ON d.producto_id = p.id AND d.tenant_id = p.tenant_id
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
  ORDER BY p.id
  FOR UPDATE OF p;

  SELECT coalesce(ec.usar_flujo_logistica, false)
    INTO v_usa_logistica
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  v_usa_logistica := coalesce(v_usa_logistica, false);

  SELECT round(coalesce(sum(
      d.cantidad * coalesce(nullif(p.precio_compra, 0), nullif(p.costo, 0), 0)
    ), 0), 2)
    INTO v_costo_ventas
  FROM public.pedidos_venta_detalle d
  JOIN public.productos p ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
    AND NOT coalesce(p.es_servicio, false)
    AND coalesce(p.controla_stock, true);

  v_cpe_payload := p_cpe || jsonb_build_object(
    'created_by', p_actor_id,
    'costo_ventas', v_costo_ventas
  );

  -- 443 corre en la misma transacción; cualquier fallo posterior de stock o
  -- transición revierte también CPE, documento, CxC y ambos eventos outbox.
  v_resultado := app.emitir_factura_cliente_tx(
    p_tenant_id, v_cpe_payload, p_documento, p_detalles, p_cxc,
    p_event_id, v_key
  );
  v_cpe_id := nullif(v_resultado->>'cpe_id', '')::uuid;
  v_documento_id := nullif(v_resultado->>'documento_id', '')::uuid;
  IF v_cpe_id IS NULL OR v_documento_id IS NULL THEN
    RAISE EXCEPTION 'La emisión atómica no devolvió CPE/documento'
      USING ERRCODE = '23514';
  END IF;

  IF upper(v_pedido.estado::text) = 'FACTURADO' THEN
    IF v_pedido.factura_id IS DISTINCT FROM v_cpe_id THEN
      RAISE EXCEPTION 'El pedido ya está facturado con otro comprobante'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_resultado || jsonb_build_object(
      'pedido_id', p_pedido_id,
      'pedido_estado', 'FACTURADO',
      'movimientos', '[]'::jsonb,
      'idempotent', true
    );
  END IF;

  IF v_usa_logistica AND EXISTS (
    SELECT 1
    FROM public.pedidos_venta_detalle d
    JOIN public.productos p ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
      AND NOT coalesce(p.es_servicio, false)
      AND coalesce(p.controla_stock, true)
      AND round(coalesce(d.cantidad_despachada, 0)::numeric, 2)
          < round(coalesce(d.cantidad, 0)::numeric, 2)
  ) THEN
    RAISE EXCEPTION 'El pedido conserva productos físicos pendientes de despacho'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_usa_logistica THEN
    FOR v_item IN
      SELECT d.producto_id,
             round(sum(d.cantidad)::numeric, 2) AS cantidad,
             coalesce(nullif(p.precio_compra, 0), nullif(p.costo, 0), 0) AS costo_unitario
      FROM public.pedidos_venta_detalle d
      JOIN public.productos p ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
      WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
        AND NOT coalesce(p.es_servicio, false)
        AND coalesce(p.controla_stock, true)
      GROUP BY d.producto_id, p.precio_compra, p.costo
      ORDER BY d.producto_id
    LOOP
      SELECT count(*), (array_agg(s.almacen_id ORDER BY s.almacen_id))[1],
             coalesce(sum(s.cantidad), 0)
        INTO v_almacenes, v_almacen_id, v_reserva
      FROM (
        SELECT mi.almacen_id,
               round(sum(CASE
                 WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                   THEN mi.cantidad
                 ELSE -mi.cantidad
               END)::numeric, 2) AS cantidad
        FROM public.movimientos_inventario mi
        WHERE mi.tenant_id = p_tenant_id
          AND mi.referencia_id = p_pedido_id
          AND mi.producto_id = v_item.producto_id
          AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
        GROUP BY mi.almacen_id
        HAVING round(sum(CASE
          WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
            THEN mi.cantidad
          ELSE -mi.cantidad
        END)::numeric, 2) > 0
      ) s;

      IF v_almacenes <> 1 OR v_almacen_id IS NULL
         OR abs(coalesce(v_reserva, 0) - v_item.cantidad) > 0.01 THEN
        RAISE EXCEPTION 'La reserva del pedido no coincide en un único almacén: producto=% requerida=% reservada=% almacenes=%',
          v_item.producto_id, v_item.cantidad, coalesce(v_reserva, 0), v_almacenes
          USING ERRCODE = '23514';
      END IF;

      v_movimiento_id := public.despachar_stock_en_almacen_tx(
        p_tenant_id := p_tenant_id,
        p_producto_id := v_item.producto_id,
        p_almacen_id := v_almacen_id,
        p_cantidad := v_item.cantidad,
        p_cantidad_reservada := v_item.cantidad,
        p_referencia_tipo := 'PEDIDO_FACTURA_446',
        p_referencia_id := p_pedido_id,
        p_notas := 'Salida atómica por factura de pedido ' || coalesce(v_pedido.numero, p_pedido_id::text),
        p_metadata := jsonb_build_object(
          'pedido_id', p_pedido_id,
          'documento_id', v_documento_id,
          'cpe_id', v_cpe_id,
          'invoice_idempotency_key', v_key,
          'costo_unitario', v_item.costo_unitario,
          'source', 'ventas.facturacion',
          'atomic_rpc', 'facturar_pedido_venta_tx'
        )
      );
      v_movimientos := v_movimientos || jsonb_build_object(
        'movimiento_id', v_movimiento_id,
        'producto_id', v_item.producto_id,
        'almacen_id', v_almacen_id,
        'cantidad', v_item.cantidad
      );
    END LOOP;
  END IF;

  UPDATE public.pedidos_venta_detalle d
  SET cantidad_despachada = CASE
        WHEN NOT v_usa_logistica
             AND NOT coalesce(p.es_servicio, false)
             AND coalesce(p.controla_stock, true)
          THEN d.cantidad
        ELSE d.cantidad_despachada
      END,
      cantidad_facturada = d.cantidad,
      estado_item = 'FACTURADO',
      updated_at = now()
  FROM public.productos p
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
    AND p.id = d.producto_id AND p.tenant_id = d.tenant_id;

  DELETE FROM public.pedido_backorders b
  WHERE b.pedido_id = p_pedido_id AND b.tenant_id = p_tenant_id;

  UPDATE public.pedidos_venta p
  SET factura_id = v_cpe_id,
      estado = 'FACTURADO',
      updated_at = now()
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  RETURNING p.* INTO v_pedido;

  RETURN v_resultado || jsonb_build_object(
    'pedido_id', p_pedido_id,
    'pedido_estado', v_pedido.estado,
    'movimientos', v_movimientos,
    'costo_ventas', v_costo_ventas,
    'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.facturar_pedido_venta_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe jsonb,
  p_documento jsonb,
  p_detalles jsonb,
  p_cxc jsonb,
  p_event_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $wrapper$
  SELECT app.facturar_pedido_venta_tx(
    p_pedido_id, p_tenant_id, p_actor_id, p_cpe, p_documento,
    p_detalles, p_cxc, p_event_id, p_idempotency_key
  );
$wrapper$;

REVOKE ALL ON FUNCTION app.facturar_pedido_venta_tx(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.facturar_pedido_venta_tx(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.facturar_pedido_venta_tx(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
) TO service_role;

COMMENT ON FUNCTION public.facturar_pedido_venta_tx(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
) IS 'Finaliza pedido, inventario simplificado, CPE/documento, CxC y outbox en una sola transacción; no envía a autoridad fiscal.';

COMMIT;
