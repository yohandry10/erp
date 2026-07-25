-- ============================================================================
-- 349__inventory_order_reservation_release_tx.sql
-- Libera todas las reservas pendientes de un pedido en una sola transaccion.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.liberar_reservas_pedido_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_referencia_tipo text DEFAULT 'PEDIDO_CANCELACION',
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_reserva record;
  v_liberado numeric;
  v_pendiente numeric;
  v_movimiento_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
BEGIN
  IF p_pedido_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'pedido_id y tenant_id son obligatorios';
  END IF;

  PERFORM 1
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id
    AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  FOR v_reserva IN
    SELECT mi.id, mi.producto_id, mi.almacen_id, mi.cantidad
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.referencia_tipo = 'PEDIDO'
      AND mi.referencia_id = p_pedido_id
      AND mi.tipo = 'RESERVA'
    ORDER BY mi.producto_id, mi.almacen_id, mi.id
    FOR UPDATE
  LOOP
    IF v_reserva.almacen_id IS NULL THEN
      RAISE EXCEPTION 'Reserva legacy sin almacen: %', v_reserva.id;
    END IF;

    SELECT COALESCE(SUM(mi.cantidad), 0)
      INTO v_liberado
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.producto_id = v_reserva.producto_id
      AND mi.almacen_id = v_reserva.almacen_id
      AND mi.referencia_id = p_pedido_id
      AND mi.tipo = 'LIBERACION';

    v_pendiente := GREATEST(COALESCE(v_reserva.cantidad, 0) - v_liberado, 0);
    IF v_pendiente = 0 THEN
      CONTINUE;
    END IF;

    v_movimiento_id := public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_reserva.producto_id,
      p_almacen_id := v_reserva.almacen_id,
      p_tipo := 'LIBERACION',
      p_cantidad := v_pendiente,
      p_referencia_tipo := upper(COALESCE(NULLIF(btrim(p_referencia_tipo), ''), 'PEDIDO_CANCELACION')),
      p_referencia_id := p_pedido_id,
      p_notas := p_notas,
      p_metadata := jsonb_build_object(
        'atomic_rpc', 'liberar_reservas_pedido_tx',
        'reserva_movimiento_id', v_reserva.id
      )
    );

    v_movimientos := v_movimientos || jsonb_build_object(
      'movimiento_id', v_movimiento_id,
      'reserva_movimiento_id', v_reserva.id,
      'producto_id', v_reserva.producto_id,
      'almacen_id', v_reserva.almacen_id,
      'cantidad', v_pendiente
    );
  END LOOP;

  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'movimientos', v_movimientos);
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_reservas_pedido_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reservas_pedido_tx(uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.liberar_reservas_pedido_tx(uuid, uuid, text, text) IS
  'Libera de forma atomica, idempotente y por almacen el saldo pendiente de todas las reservas fisicas de un pedido.';

COMMIT;

