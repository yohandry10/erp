-- ============================================================================
-- 341__transactional_idempotency_coverage_hardening.sql
--
-- Refuerza la idempotencia de las RPC transaccionales 338/339:
-- - cerrar_recepcion_tx: idempotencia por recepcion_item_id, no por producto.
-- - reservar_pedido_stock_tx: valida cobertura completa de reservas existentes
--   antes de retornar skipped=true.
--
-- Si encuentra movimientos legacy ambiguos sin metadata de item/detalle, falla
-- explícitamente para evitar duplicar stock o confirmar reservas parciales.
-- ============================================================================

BEGIN;

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
  v_recepcion record;
  v_item record;
  v_detalle record;
  v_mov_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_nueva_cant numeric;
  v_total_pedido numeric;
  v_total_recibido numeric;
  v_nuevo_estado_orden text;
  v_existe_item integer;
  v_legacy_ambiguo integer;
  v_count_items integer;
BEGIN
  IF p_recepcion_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'recepcion_id y tenant_id son obligatorios';
  END IF;

  SELECT * INTO v_recepcion
  FROM public.recepciones
  WHERE id = p_recepcion_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recepción no encontrada';
  END IF;

  IF v_recepcion.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar recepciones en estado BORRADOR (actual: %)', v_recepcion.estado;
  END IF;

  SELECT COUNT(*) INTO v_count_items
  FROM public.recepcion_items
  WHERE recepcion_id = p_recepcion_id AND tenant_id = p_tenant_id;

  IF v_count_items = 0 THEN
    RAISE EXCEPTION 'La recepción debe tener al menos un item';
  END IF;

  FOR v_item IN
    SELECT * FROM public.recepcion_items
    WHERE recepcion_id = p_recepcion_id AND tenant_id = p_tenant_id
    ORDER BY created_at, id
  LOOP
    SELECT COUNT(*) INTO v_existe_item
    FROM public.movimientos_inventario
    WHERE tenant_id = p_tenant_id
      AND referencia_tipo = 'RECEPCION'
      AND referencia_id = p_recepcion_id
      AND tipo = 'ENTRADA'
      AND metadata->>'recepcion_item_id' = v_item.id::text;

    IF v_existe_item > 0 THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_legacy_ambiguo
    FROM public.movimientos_inventario
    WHERE tenant_id = p_tenant_id
      AND referencia_tipo = 'RECEPCION'
      AND referencia_id = p_recepcion_id
      AND tipo = 'ENTRADA'
      AND producto_id = v_item.producto_id
      AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'recepcion_item_id');

    IF v_legacy_ambiguo > 0 THEN
      RAISE EXCEPTION 'Movimiento legacy ambiguo para recepcion %, producto %. Reconciliar metadata recepcion_item_id antes de reintentar',
        p_recepcion_id, v_item.producto_id;
    END IF;

    IF upper(COALESCE(v_item.calidad, '')) IN ('OK', 'OBSERVADO') THEN
      IF v_item.almacen_id IS NULL THEN
        RAISE EXCEPTION 'El item % no tiene almacen_id; no se puede registrar entrada de stock', v_item.id;
      END IF;
      IF COALESCE(v_item.cantidad_recibida, 0) <= 0 THEN
        RAISE EXCEPTION 'El item % tiene cantidad_recibida inválida (%).', v_item.id, v_item.cantidad_recibida;
      END IF;

      v_mov_id := public.registrar_movimiento_almacen(
        v_item.producto_id,
        v_item.almacen_id,
        'ENTRADA',
        v_item.cantidad_recibida,
        'RECEPCION',
        p_recepcion_id,
        'Recepción ' || COALESCE(v_recepcion.numero, ''),
        v_item.ubicacion_id,
        v_item.lote,
        v_item.fecha_expiracion
      );

      UPDATE public.movimientos_inventario
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'recepcion_item_id', v_item.id::text,
            'orden_detalle_id', COALESCE(v_item.detalle_id::text, ''),
            'atomic_rpc', 'cerrar_recepcion_tx'
          ),
          updated_at = now()
      WHERE id = v_mov_id AND tenant_id = p_tenant_id;

      v_movimientos := v_movimientos || jsonb_build_object(
        'movimiento_id', v_mov_id,
        'recepcion_item_id', v_item.id,
        'detalle_id', v_item.detalle_id,
        'producto_id', v_item.producto_id,
        'almacen_id', v_item.almacen_id,
        'cantidad', v_item.cantidad_recibida
      );
    END IF;

    IF v_item.detalle_id IS NOT NULL THEN
      SELECT * INTO v_detalle
      FROM public.orden_compra_detalles
      WHERE id = v_item.detalle_id AND tenant_id = p_tenant_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Detalle de orden % no encontrado', v_item.detalle_id;
      END IF;

      v_nueva_cant := COALESCE(v_detalle.cantidad_recibida, 0) + COALESCE(v_item.cantidad_recibida, 0);

      IF v_nueva_cant > COALESCE(v_detalle.cantidad, 0) THEN
        RAISE EXCEPTION 'La cantidad recibida acumulada (%) excede la ordenada (%) en el detalle %',
          v_nueva_cant, v_detalle.cantidad, v_item.detalle_id;
      END IF;

      UPDATE public.orden_compra_detalles
      SET cantidad_recibida = v_nueva_cant,
          updated_at = now()
      WHERE id = v_item.detalle_id AND tenant_id = p_tenant_id;
    END IF;
  END LOOP;

  IF v_recepcion.orden_id IS NOT NULL THEN
    SELECT COALESCE(SUM(cantidad), 0),
           COALESCE(SUM(COALESCE(cantidad_recibida, 0)), 0)
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
    SET estado = v_nuevo_estado_orden,
        updated_at = now()
    WHERE id = v_recepcion.orden_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.recepciones
  SET estado = 'CERRADA',
      observaciones = COALESCE(p_observaciones, observaciones),
      cerrado_por = p_user_id,
      cerrado_at = now(),
      updated_at = now()
  WHERE id = p_recepcion_id AND tenant_id = p_tenant_id AND estado = 'BORRADOR';

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

CREATE OR REPLACE FUNCTION public.reservar_pedido_stock_tx(
  p_pedido_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_numero text;
  v_item record;
  v_mov_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_existe integer;
  v_count_items integer;
  v_count_productos integer;
  v_count_productos_unicos integer;
  v_cobertura_ok boolean;
BEGIN
  IF p_pedido_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'pedido_id y tenant_id son obligatorios';
  END IF;

  SELECT numero INTO v_numero
  FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  SELECT COUNT(*) INTO v_count_items
  FROM public.pedidos_venta_detalle
  WHERE pedido_id = p_pedido_id AND tenant_id = p_tenant_id;

  IF v_count_items = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene items para reservar';
  END IF;

  SELECT COUNT(*) INTO v_existe
  FROM public.movimientos_inventario
  WHERE tenant_id = p_tenant_id
    AND referencia_tipo = 'PEDIDO'
    AND referencia_id = p_pedido_id
    AND tipo = 'RESERVA';

  IF v_existe > 0 THEN
    SELECT COUNT(*), COUNT(DISTINCT producto_id)
    INTO v_count_productos, v_count_productos_unicos
    FROM public.pedidos_venta_detalle
    WHERE pedido_id = p_pedido_id AND tenant_id = p_tenant_id;

    IF EXISTS (
      SELECT 1
      FROM public.pedidos_venta_detalle d
      JOIN public.movimientos_inventario mi
        ON mi.tenant_id = d.tenant_id
       AND mi.referencia_tipo = 'PEDIDO'
       AND mi.referencia_id = d.pedido_id
       AND mi.tipo = 'RESERVA'
       AND mi.producto_id = d.producto_id
       AND mi.metadata->>'pedido_detalle_id' = d.id::text
      WHERE d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
      GROUP BY d.id, d.cantidad
      HAVING COALESCE(SUM(mi.cantidad), 0) < COALESCE(d.cantidad, 0)
    ) THEN
      v_cobertura_ok := false;
    ELSE
      SELECT COUNT(*) = v_count_items INTO v_cobertura_ok
      FROM public.pedidos_venta_detalle d
      WHERE d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
        AND EXISTS (
          SELECT 1
          FROM public.movimientos_inventario mi
          WHERE mi.tenant_id = d.tenant_id
            AND mi.referencia_tipo = 'PEDIDO'
            AND mi.referencia_id = d.pedido_id
            AND mi.tipo = 'RESERVA'
            AND mi.producto_id = d.producto_id
            AND mi.metadata->>'pedido_detalle_id' = d.id::text
          GROUP BY mi.producto_id
          HAVING COALESCE(SUM(mi.cantidad), 0) >= COALESCE(d.cantidad, 0)
        );
    END IF;

    IF NOT v_cobertura_ok AND v_count_productos = v_count_productos_unicos THEN
      SELECT COUNT(*) = v_count_items INTO v_cobertura_ok
      FROM public.pedidos_venta_detalle d
      WHERE d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
        AND EXISTS (
          SELECT 1
          FROM public.movimientos_inventario mi
          WHERE mi.tenant_id = d.tenant_id
            AND mi.referencia_tipo = 'PEDIDO'
            AND mi.referencia_id = d.pedido_id
            AND mi.tipo = 'RESERVA'
            AND mi.producto_id = d.producto_id
          GROUP BY mi.producto_id
          HAVING COALESCE(SUM(mi.cantidad), 0) >= COALESCE(d.cantidad, 0)
        );
    END IF;

    IF v_cobertura_ok THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'reservas completas existentes', 'movimientos', '[]'::jsonb);
    END IF;

    RAISE EXCEPTION 'Reservas existentes incompletas o ambiguas para pedido %. Reconciliar antes de confirmar', p_pedido_id;
  END IF;

  FOR v_item IN
    SELECT id, producto_id, cantidad
    FROM public.pedidos_venta_detalle
    WHERE pedido_id = p_pedido_id AND tenant_id = p_tenant_id
    ORDER BY id
  LOOP
    IF v_item.producto_id IS NULL OR COALESCE(v_item.cantidad, 0) <= 0 THEN
      RAISE EXCEPTION 'Item de pedido inválido (producto/cantidad) en pedido %', p_pedido_id;
    END IF;

    v_mov_id := public.reservar_stock_atomico(
      v_item.producto_id,
      v_item.cantidad,
      'PEDIDO',
      p_pedido_id::text,
      'Reserva atómica para pedido ' || COALESCE(v_numero, '')
    );

    UPDATE public.movimientos_inventario
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'pedido_detalle_id', v_item.id::text,
          'atomic_rpc', 'reservar_pedido_stock_tx'
        ),
        updated_at = now()
    WHERE id = v_mov_id AND tenant_id = p_tenant_id;

    v_movimientos := v_movimientos || jsonb_build_object(
      'movimiento_id', v_mov_id,
      'pedido_detalle_id', v_item.id,
      'producto_id', v_item.producto_id,
      'cantidad', v_item.cantidad
    );
  END LOOP;

  RETURN jsonb_build_object('skipped', false, 'movimientos', v_movimientos);
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) IS
  'Cierra una recepción de compra de forma atómica e idempotente por recepcion_item_id. Falla ante movimientos legacy ambiguos sin metadata de item para evitar descuadres silenciosos.';

COMMENT ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) IS
  'Reserva stock de todos los items de un pedido en una transacción. Si ya existen reservas, solo retorna skipped cuando la cobertura completa está verificada; si son parciales o ambiguas, falla.';

COMMIT;
