-- ============================================================================
-- 338__cerrar_recepcion_transaccional.sql
-- C-004: Atomicidad del cierre de recepción de compra.
--
-- Problema (auditoría forense 2026-05-26):
--   `RecepcionesService.cerrarRecepcion` ejecutaba N escrituras secuenciales en
--   JS: por cada item registraba entrada de inventario + actualizaba
--   `orden_compra_detalles.cantidad_recibida`, luego actualizaba estado de la OC
--   y de la recepción. Codex mitigó el doble-cierre (state guard) y la race de
--   cantidad_recibida (optimistic lock), PERO si el proceso fallaba a mitad del
--   loop (p.ej. item 5 de 10) los items 1-4 ya habían movido stock sin rollback,
--   dejando inventario impactado parcialmente y la recepción en BORRADOR.
--
-- Solución:
--   Función transaccional `cerrar_recepcion_tx`. Todo el cierre corre en una
--   sola transacción (la del statement que invoca la función). Reusa
--   `registrar_movimiento_almacen` (no reescribe la lógica de stock) vía llamada
--   directa: al correr dentro de la misma función comparten transacción, sin
--   COMMIT intermedio. Si cualquier paso falla, ROLLBACK total automático.
--
--   La función NO emite eventos (las RPC no pueden publicar al event bus de
--   Node). Retorna la lista de movimientos creados para que el backend emita
--   los eventos POST-COMMIT (orden correcto para el patrón outbox: la data ya
--   está persistida cuando se publica el evento).
--
-- Idempotencia: preserva el comportamiento previo — si ya existe un movimiento
--   ENTRADA para (tenant, recepción, producto), ese item se omite.
--
-- `recepciones.estado` y `ordenes_compra.estado` son `citext` (case-insensitive),
--   por eso las comparaciones de estado no necesitan normalización adicional.
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
  v_existe_mov integer;
  v_count_items integer;
BEGIN
  IF p_recepcion_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'recepcion_id y tenant_id son obligatorios';
  END IF;

  -- Lock de la recepción + validación de estado.
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

  -- Procesar cada item.
  FOR v_item IN
    SELECT * FROM public.recepcion_items
    WHERE recepcion_id = p_recepcion_id AND tenant_id = p_tenant_id
    ORDER BY created_at, id
  LOOP
    -- Idempotencia: si ya hay movimiento ENTRADA para esta recepción+producto,
    -- se omite tanto el inventario como el incremento de cantidad_recibida.
    SELECT COUNT(*) INTO v_existe_mov
    FROM public.movimientos_inventario
    WHERE tenant_id = p_tenant_id
      AND referencia_tipo = 'RECEPCION'
      AND referencia_id = p_recepcion_id
      AND tipo = 'ENTRADA'
      AND producto_id = v_item.producto_id;

    IF v_existe_mov > 0 THEN
      CONTINUE;
    END IF;

    -- Solo se ingresa stock para items con calidad OK u OBSERVADO.
    IF upper(COALESCE(v_item.calidad, '')) IN ('OK', 'OBSERVADO') THEN
      IF v_item.almacen_id IS NULL THEN
        RAISE EXCEPTION 'El item % no tiene almacen_id; no se puede registrar entrada de stock', v_item.id;
      END IF;
      IF COALESCE(v_item.cantidad_recibida, 0) <= 0 THEN
        RAISE EXCEPTION 'El item % tiene cantidad_recibida inválida (%).', v_item.id, v_item.cantidad_recibida;
      END IF;

      -- Reusa la primitiva de stock existente (misma transacción).
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

      v_movimientos := v_movimientos || jsonb_build_object(
        'movimiento_id', v_mov_id,
        'producto_id', v_item.producto_id,
        'almacen_id', v_item.almacen_id,
        'cantidad', v_item.cantidad_recibida
      );
    END IF;

    -- Actualizar cantidad_recibida en el detalle de la OC (con lock).
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

  -- Recalcular estado de la orden de compra a partir de sus detalles.
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

  -- Cerrar la recepción (state guard redundante con el FOR UPDATE, defensa extra).
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

REVOKE ALL ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.cerrar_recepcion_tx(uuid, uuid, text, text) IS
  'Cierra una recepción de compra de forma atómica: ingreso de stock por item (reusa registrar_movimiento_almacen), actualización de cantidad_recibida en detalles de OC, recálculo de estado de OC y cierre de recepción. Todo o nada. Retorna jsonb con movimientos creados para que el backend emita eventos post-commit. Ejecución restringida a service_role.';

COMMIT;
