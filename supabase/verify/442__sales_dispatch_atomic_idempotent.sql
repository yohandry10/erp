\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 442 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_cliente_id uuid;
  v_almacen_id uuid;
  v_producto_id uuid;
  v_servicio_id uuid;
  v_pedido_id uuid;
  v_detalle_1 uuid;
  v_detalle_2 uuid;
  v_detalle_servicio uuid;
  v_result jsonb;
  v_politica jsonb;
  v_stock numeric;
  v_reserva numeric;
  v_count integer;
  v_key_1 text := 'verify-442-partial-1';
  v_key_2 text := 'verify-442-partial-2';
  v_pedido_fail uuid;
  v_fail_1 uuid;
  v_fail_2 uuid;
  v_stock_antes numeric;
  v_reserva_antes numeric;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY DISPATCH 442', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  UPDATE public.empresa_config
  SET usar_flujo_logistica = true,
      habilitar_multialmacen = true,
      requiere_ubicaciones_inventario = false,
      requiere_lotes_series = false,
      monto_maximo_sin_aprobacion = 0,
      aplicar_limite_credito = false
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-442', 'Cliente Verify 442',
    'Cliente Verify 442', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-442', 'Almacén Verify 442',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-442', 'nombre', 'Producto 442',
      'categoria', 'VERIFICACION', 'precio_venta', 25,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen_id, 20, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;

  INSERT INTO public.productos (
    tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock,
    precio_venta, precio_compra, afectacion_igv, stock, stock_actual, stock_reservado
  ) VALUES (
    v_tenant_id, 'SERV-442', 'Servicio 442', 'ACTIVO', true, true, false,
    40, 0, '10', 0, 0, 0
  ) RETURNING id INTO v_servicio_id;

  SELECT public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
      'created_by', v_user_id, 'moneda', 'PEN'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_id, 'descripcion', 'Línea física A',
        'cantidad', 3, 'precio_unitario', 25
      ),
      jsonb_build_object(
        'producto_id', v_producto_id, 'descripcion', 'Línea física B',
        'cantidad', 3, 'precio_unitario', 25
      ),
      jsonb_build_object(
        'producto_id', v_servicio_id, 'descripcion', 'Línea servicio',
        'cantidad', 1, 'precio_unitario', 40
      )
    )
  ) INTO v_result;
  v_pedido_id := (v_result->>'pedido_id')::uuid;

  SELECT id INTO v_detalle_1
  FROM public.pedidos_venta_detalle
  WHERE pedido_id = v_pedido_id AND descripcion = 'Línea física A';
  SELECT id INTO v_detalle_2
  FROM public.pedidos_venta_detalle
  WHERE pedido_id = v_pedido_id AND descripcion = 'Línea física B';
  SELECT id INTO v_detalle_servicio
  FROM public.pedidos_venta_detalle
  WHERE pedido_id = v_pedido_id AND descripcion = 'Línea servicio';

  SELECT public.evaluar_politica_pedido_441(v_pedido_id, v_tenant_id)
    INTO v_politica;
  SELECT public.confirmar_pedido_tx(
    v_pedido_id, v_tenant_id, 'IGNORADO', 'CONFIRMADO',
    false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
  ) INTO v_result;
  UPDATE public.pedidos_venta
  SET estado = 'LISTO_DESPACHO', tracking_estado = 'LISTO_DESPACHO'
  WHERE id = v_pedido_id;

  SELECT public.despachar_pedido_parcial_tx(
    v_pedido_id, v_tenant_id, v_key_1,
    jsonb_build_array(
      jsonb_build_object('detalle_id', v_detalle_1, 'cantidad', 1, 'almacen_id', v_almacen_id),
      jsonb_build_object('detalle_id', v_detalle_2, 'cantidad', 1, 'almacen_id', v_almacen_id)
    ),
    'Primer parcial', v_user_id, '{}'::jsonb
  ) INTO v_result;

  SELECT stock_actual, stock_reservado INTO v_stock, v_reserva
  FROM public.producto_existencias
  WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
    AND almacen_id = v_almacen_id;
  IF v_result->>'estado' <> 'DESPACHO_PARCIAL'
     OR v_stock <> 18 OR v_reserva <> 4
     OR (SELECT cantidad_despachada FROM public.pedidos_venta_detalle WHERE id = v_detalle_1) <> 1
     OR (SELECT cantidad_despachada FROM public.pedidos_venta_detalle WHERE id = v_detalle_2) <> 1
     OR (SELECT cantidad_despachada FROM public.pedidos_venta_detalle WHERE id = v_detalle_servicio) <> 0
     OR (SELECT count(*) FROM public.pedido_backorders WHERE pedido_id = v_pedido_id) <> 2
     OR (SELECT count(*) FROM public.pedido_despachos WHERE pedido_id = v_pedido_id) <> 2
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'stock.movimiento'
           AND payload->>'ventaId' = v_pedido_id::text) <> 2 THEN
    RAISE EXCEPTION 'El primer parcial no cerró stock/reserva/detalle/backorder/outbox: %', v_result;
  END IF;

  -- Reintentar la misma intención no vuelve a tocar ninguna proyección.
  SELECT public.despachar_pedido_parcial_tx(
    v_pedido_id, v_tenant_id, v_key_1,
    jsonb_build_array(
      jsonb_build_object('detalle_id', v_detalle_1, 'cantidad', 1, 'almacen_id', v_almacen_id),
      jsonb_build_object('detalle_id', v_detalle_2, 'cantidad', 1, 'almacen_id', v_almacen_id)
    ),
    'Primer parcial', v_user_id, '{}'::jsonb
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.pedido_despachos WHERE pedido_id = v_pedido_id) <> 2 THEN
    RAISE EXCEPTION 'El retry exacto no fue idempotente: %', v_result;
  END IF;

  BEGIN
    PERFORM public.despachar_pedido_parcial_tx(
      v_pedido_id, v_tenant_id, v_key_1,
      jsonb_build_array(
        jsonb_build_object('detalle_id', v_detalle_1, 'cantidad', 2, 'almacen_id', v_almacen_id)
      ),
      'Payload distinto', v_user_id, '{}'::jsonb
    );
    RAISE EXCEPTION 'Reusar la key con otro payload debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DISPATCH_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD%' THEN RAISE; END IF;
  END;

  -- Segundo lote: items vacío significa todo el saldo físico pendiente. Las
  -- dos líneas del mismo SKU deben producir movimientos distintos.
  SELECT public.despachar_pedido_parcial_tx(
    v_pedido_id, v_tenant_id, v_key_2, '[]'::jsonb,
    'Cierre del despacho', v_user_id,
    jsonb_build_object('almacen_id', v_almacen_id)
  ) INTO v_result;

  SELECT stock_actual, stock_reservado INTO v_stock, v_reserva
  FROM public.producto_existencias
  WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
    AND almacen_id = v_almacen_id;
  IF v_result->>'estado' <> 'LISTO_FACTURAR'
     OR v_stock <> 14 OR v_reserva <> 0
     OR (SELECT cantidad_despachada FROM public.pedidos_venta_detalle WHERE id = v_detalle_1) <> 3
     OR (SELECT cantidad_despachada FROM public.pedidos_venta_detalle WHERE id = v_detalle_2) <> 3
     OR EXISTS (SELECT 1 FROM public.pedido_backorders WHERE pedido_id = v_pedido_id)
     OR (SELECT count(*) FROM public.pedido_despachos WHERE pedido_id = v_pedido_id) <> 4
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
           AND upper(coalesce(tipo, tipo_movimiento, '')) = 'SALIDA') <> 4 THEN
    RAISE EXCEPTION 'El cierre de dos líneas del mismo SKU quedó inconsistente: %', v_result;
  END IF;

  -- Un fallo en la segunda línea del lote revierte también la primera.
  SELECT public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
      'created_by', v_user_id, 'moneda', 'PEN'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_id, 'descripcion', 'Rollback A',
        'cantidad', 1, 'precio_unitario', 25
      ),
      jsonb_build_object(
        'producto_id', v_producto_id, 'descripcion', 'Rollback B',
        'cantidad', 1, 'precio_unitario', 25
      )
    )
  ) INTO v_result;
  v_pedido_fail := (v_result->>'pedido_id')::uuid;
  SELECT id INTO v_fail_1 FROM public.pedidos_venta_detalle
  WHERE pedido_id = v_pedido_fail ORDER BY id LIMIT 1;
  SELECT id INTO v_fail_2 FROM public.pedidos_venta_detalle
  WHERE pedido_id = v_pedido_fail ORDER BY id DESC LIMIT 1;
  SELECT public.evaluar_politica_pedido_441(v_pedido_fail, v_tenant_id)
    INTO v_politica;
  PERFORM public.confirmar_pedido_tx(
    v_pedido_fail, v_tenant_id, 'IGNORADO', 'CONFIRMADO',
    false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
  );
  UPDATE public.pedidos_venta SET estado = 'LISTO_DESPACHO'
  WHERE id = v_pedido_fail;
  SELECT stock_actual, stock_reservado INTO v_stock_antes, v_reserva_antes
  FROM public.producto_existencias
  WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
    AND almacen_id = v_almacen_id;

  BEGIN
    PERFORM public.despachar_pedido_parcial_tx(
      v_pedido_fail, v_tenant_id, 'verify-442-rollback',
      jsonb_build_array(
        jsonb_build_object('detalle_id', v_fail_1, 'cantidad', 1, 'almacen_id', v_almacen_id),
        jsonb_build_object('detalle_id', v_fail_2, 'cantidad', 1, 'almacen_id', gen_random_uuid())
      ),
      'Debe revertir', v_user_id, '{}'::jsonb
    );
    RAISE EXCEPTION 'El almacén inválido debió abortar el lote';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El almacén inválido debió abortar el lote' THEN RAISE; END IF;
  END;

  IF (SELECT stock_actual FROM public.producto_existencias
      WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
        AND almacen_id = v_almacen_id) <> v_stock_antes
     OR (SELECT stock_reservado FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> v_reserva_antes
     OR EXISTS (
       SELECT 1 FROM public.pedidos_venta_detalle
       WHERE pedido_id = v_pedido_fail AND cantidad_despachada <> 0
     )
     OR EXISTS (
       SELECT 1 FROM public.logistica_eventos
       WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-442-rollback'
     ) THEN
    RAISE EXCEPTION 'El lote fallido dejó efectos parciales';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.oid = 'public.despachar_pedido_parcial_tx(uuid,uuid,text,jsonb,text,uuid,jsonb)'::regprocedure
    AND n.nspname = 'public';
  IF v_count <> 1
     OR has_function_privilege('authenticated',
       'public.despachar_pedido_parcial_tx(uuid,uuid,text,jsonb,text,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.despachar_pedido_parcial_tx(uuid,uuid,text,jsonb,text,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'La superficie/grants del RPC de despacho no es service-role-only';
  END IF;
END;
$$;

ROLLBACK;
