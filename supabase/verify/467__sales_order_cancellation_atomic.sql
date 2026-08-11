\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 467 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.verify_467_fail_late_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.verify_467_fail_outbox', true) = 'on'
     AND NEW.event_type = 'pedido.cancelado' THEN
    RAISE EXCEPTION 'VERIFY_467_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_467_fail_late_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_467_fail_late_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_467_fail_late_outbox();

DO $$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_cliente uuid;
  v_almacen uuid;
  v_producto uuid;
  v_pedido uuid;
  v_despachado uuid;
  v_fallo uuid;
  v_result jsonb;
  v_retry jsonb;
  v_net numeric;
  v_failed boolean;
  v_source_movement uuid;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY ORDER CANCEL 467', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-467', 'Cliente 467', 'Cliente 467', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-467', 'Almacén 467', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-467', 'nombre', 'Producto 467',
      'categoria', 'VERIFICACION', 'precio_venta', 25,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen, 20, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto;

  SELECT (public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant, 'cliente_id', v_cliente,
      'created_by', v_actor, 'moneda', 'PEN',
      'observaciones', 'Pedido cancelable 467'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'descripcion', 'Producto cancelable',
      'cantidad', 2, 'precio_unitario', 25
    ))
  )->>'pedido_id')::uuid INTO v_pedido;

  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant, v_producto, v_almacen, 2,
    'PEDIDO', v_pedido::text, 'Reserva verify cancel 467'
  );

  SELECT public.cancelar_pedido_venta_tx(
    v_pedido, v_tenant, v_actor, 'Cliente desistió antes del despacho',
    'verify:467:cancel:one'
  ) INTO v_result;

  SELECT coalesce(sum(CASE
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA' THEN cantidad
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'LIBERACION' THEN -cantidad
    ELSE 0 END), 0)
  INTO v_net
  FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant AND referencia_id = v_pedido;

  IF v_result->>'estado' <> 'CANCELADO'
     OR (SELECT estado FROM public.pedidos_venta WHERE id = v_pedido) <> 'CANCELADO'
     OR v_net <> 0
     OR EXISTS (
       SELECT 1 FROM public.pedido_backorders
       WHERE tenant_id = v_tenant AND pedido_id = v_pedido
     )
     OR (SELECT count(*) FROM public.pedido_cancelaciones
         WHERE tenant_id = v_tenant AND pedido_id = v_pedido) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'pedido.cancelado'
           AND aggregate_id = v_pedido::text) <> 1 THEN
    RAISE EXCEPTION 'La cancelación 467 no cerró pedido/reserva/operación/outbox: %, neto %',
      v_result, v_net;
  END IF;

  SELECT public.cancelar_pedido_venta_tx(
    v_pedido, v_tenant, v_actor, 'Cliente desistió antes del despacho',
    'verify:467:cancel:one'
  ) INTO v_retry;
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT count(*) FROM public.pedido_cancelaciones
         WHERE tenant_id = v_tenant AND pedido_id = v_pedido) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'pedido.cancelado'
           AND aggregate_id = v_pedido::text) <> 1 THEN
    RAISE EXCEPTION 'Retry exacto 467 duplicó efectos: %', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.cancelar_pedido_venta_tx(
      v_pedido, v_tenant, v_actor, 'Motivo incompatible con la primera intención',
      'verify:467:cancel:other'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%ORDER_ALREADY_CANCELLED_WITH_DIFFERENT_REASON%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'La misma orden aceptó dos intenciones de cancelación incompatibles';
  END IF;

  -- Una salida física no se puede borrar con una cancelación administrativa.
  SELECT (public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant, 'cliente_id', v_cliente,
      'created_by', v_actor, 'moneda', 'PEN'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'descripcion', 'Producto ya despachado',
      'cantidad', 1, 'precio_unitario', 25
    ))
  )->>'pedido_id')::uuid INTO v_despachado;
  UPDATE public.pedidos_venta_detalle
  SET cantidad_despachada = 1, estado_item = 'DESPACHADO'
  WHERE tenant_id = v_tenant AND pedido_id = v_despachado;
  v_failed := false;
  BEGIN
    PERFORM public.cancelar_pedido_venta_tx(
      v_despachado, v_tenant, v_actor, 'Intento posterior a salida física',
      'verify:467:dispatch:block'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%ORDER_CANCELLATION_REQUIRES_PHYSICAL_RETURN%';
  END;
  IF NOT v_failed
     OR (SELECT estado FROM public.pedidos_venta WHERE id = v_despachado) = 'CANCELADO' THEN
    RAISE EXCEPTION '467 borró administrativamente un despacho físico';
  END IF;

  -- Con confirmación explícita del retorno, la misma transacción repone el
  -- almacén, anula el despacho lógico y recién entonces cancela la cabecera.
  v_source_movement := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant,
    p_producto_id := v_producto,
    p_almacen_id := v_almacen,
    p_tipo := 'SALIDA',
    p_cantidad := 1,
    p_referencia_tipo := 'PEDIDO_DESP_VERIFY_467',
    p_referencia_id := v_despachado,
    p_notas := 'Salida física para probar retorno 467',
    p_created_by := v_actor::text,
    p_metadata := jsonb_build_object('costo_unitario', 10)
  );
  SELECT public.cancelar_pedido_venta_tx(
    v_despachado, v_tenant, v_actor,
    'Mercadería retornada físicamente al almacén',
    'verify:467:dispatch:return', true
  ) INTO v_result;
  IF v_result->>'estado' <> 'CANCELADO'
     OR jsonb_array_length(v_result->'movimientos_retorno') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.movimientos_inventario mi
       WHERE mi.tenant_id = v_tenant
         AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'ENTRADA'
         AND mi.referencia_tipo = 'REVERSO_DESPACHO_PEDIDO_467'
         AND mi.referencia_id = v_source_movement
     ) THEN
    RAISE EXCEPTION '467 no cerró el retorno físico explícito: %', v_result;
  END IF;

  -- Actor ajeno/inexistente falla antes de cualquier mutación.
  v_failed := false;
  BEGIN
    PERFORM public.cancelar_pedido_venta_tx(
      v_despachado, v_tenant, gen_random_uuid(), 'Actor inválido',
      'verify:467:actor:invalid'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%ORDER_CANCELLATION_ACTOR_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION '467 aceptó actor ajeno al tenant'; END IF;

  -- Un fallo en el último write (outbox) revierte cabecera, líneas y reservas.
  SELECT (public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant, 'cliente_id', v_cliente,
      'created_by', v_actor, 'moneda', 'PEN'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'descripcion', 'Producto rollback',
      'cantidad', 1, 'precio_unitario', 25
    ))
  )->>'pedido_id')::uuid INTO v_fallo;
  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant, v_producto, v_almacen, 1,
    'PEDIDO', v_fallo::text, 'Reserva rollback verify 467'
  );
  PERFORM set_config('app.verify_467_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.cancelar_pedido_venta_tx(
      v_fallo, v_tenant, v_actor, 'Fallo tardío inducido',
      'verify:467:late:rollback'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%VERIFY_467_LATE_OUTBOX_FAILURE%';
  END;
  PERFORM set_config('app.verify_467_fail_outbox', 'off', true);
  SELECT coalesce(sum(CASE
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA' THEN cantidad
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'LIBERACION' THEN -cantidad
    ELSE 0 END), 0)
  INTO v_net FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant AND referencia_id = v_fallo;
  IF NOT v_failed
     OR (SELECT estado FROM public.pedidos_venta WHERE id = v_fallo) <> 'PENDIENTE'
     OR v_net <> 1
     OR EXISTS (
       SELECT 1 FROM public.pedido_cancelaciones
       WHERE tenant_id = v_tenant AND pedido_id = v_fallo
     ) THEN
    RAISE EXCEPTION 'El fallo tardío no revirtió todo: failed %, neto %', v_failed, v_net;
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege(
       'authenticated',
       'public.cancelar_pedido_venta_tx(uuid,uuid,uuid,text,text,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.cancelar_pedido_venta_tx(uuid,uuid,uuid,text,text,boolean)',
       'EXECUTE'
     )
     OR has_table_privilege('authenticated', 'public.pedido_cancelaciones', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pedido_cancelaciones', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pedido_cancelaciones', 'DELETE') THEN
    RAISE EXCEPTION 'ACL 467 permite saltar la frontera transaccional';
  END IF;
END;
$$;

ROLLBACK;
