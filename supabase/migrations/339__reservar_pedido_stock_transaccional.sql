-- ============================================================================
-- 339__reservar_pedido_stock_transaccional.sql
-- H-003: Atomicidad de la reserva de stock al confirmar un pedido.
--
-- Problema (auditoría forense 2026-05-26, verificado en código 2026-05-27):
--   `PedidosService.confirmarPedido` reservaba stock en un loop por item con
--   ROLLBACK MANUAL en try/catch (liberar reservas + borrar movimientos). Si el
--   rollback manual fallaba, las reservas previas quedaban. Combinado con el
--   guard `saltarReserva` (que en un reintento detecta reservas existentes y
--   omite crear nuevas), un pedido podía quedar CONFIRMADO con reserva PARCIAL
--   (items 1-2 reservados, item 3 no), corrompiendo la disponibilidad de stock.
--
-- Solución:
--   Función transaccional `reservar_pedido_stock_tx` que reserva TODOS los items
--   del pedido en una sola transacción, reusando la primitiva existente
--   `reservar_stock_atomico` (que valida stock y lanza si es insuficiente). Si
--   cualquier item falla, la excepción aborta el statement y Postgres hace
--   ROLLBACK total — liberando automáticamente las reservas ya creadas, sin
--   rollback manual frágil.
--
-- Idempotencia: si ya existen reservas (tipo RESERVA) para el pedido, no se
--   re-reserva (equivalente al guard `saltarReserva` del servicio). Retorna
--   `skipped: true` para que el backend continúe la confirmación.
-- ============================================================================

BEGIN;

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

  -- Idempotencia: reservas ya registradas para el pedido → no re-reservar.
  SELECT COUNT(*) INTO v_existe
  FROM public.movimientos_inventario
  WHERE tenant_id = p_tenant_id
    AND referencia_tipo = 'PEDIDO'
    AND referencia_id = p_pedido_id
    AND tipo = 'RESERVA';

  IF v_existe > 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'reservas ya existentes', 'movimientos', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO v_count_items
  FROM public.pedidos_venta_detalle
  WHERE pedido_id = p_pedido_id AND tenant_id = p_tenant_id;

  IF v_count_items = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene items para reservar';
  END IF;

  -- Reserva atómica de todos los items. reservar_stock_atomico lanza
  -- 'Stock insuficiente' si no hay disponibilidad; la excepción propaga y
  -- aborta toda la transacción (ROLLBACK de las reservas ya creadas).
  FOR v_item IN
    SELECT producto_id, cantidad
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

    v_movimientos := v_movimientos || jsonb_build_object(
      'movimiento_id', v_mov_id,
      'producto_id', v_item.producto_id,
      'cantidad', v_item.cantidad
    );
  END LOOP;

  RETURN jsonb_build_object('skipped', false, 'movimientos', v_movimientos);
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid) IS
  'Reserva el stock de TODOS los items de un pedido en una sola transacción (reusa reservar_stock_atomico). Si un item no tiene stock, ROLLBACK total — sin rollback manual. Idempotente: si ya hay reservas para el pedido, retorna skipped=true. Ejecución restringida a service_role.';

COMMIT;
