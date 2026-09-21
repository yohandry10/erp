\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 550 sólo puede ejecutarse en la base efímera erp_e2e';
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
  v_key_1 text := 'verify-550-partial-1';
  v_key_2 text := 'verify-550-partial-2';
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

  SELECT public.create_demo_tenant('VERIFY DISPATCH 550', 1, 'PE') INTO v_demo;
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
    v_tenant_id, 'CLI-VERIFY-550', 'Cliente Verify 550',
    'Cliente Verify 550', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-550', 'Almacén Verify 550',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-550', 'nombre', 'Producto 550',
      'categoria', 'VERIFICACION', 'precio_venta', 25,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen_id, 20, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;

  INSERT INTO public.productos (
    tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock,
    precio_venta, precio_compra, afectacion_igv, stock, stock_actual, stock_reservado
  ) VALUES (
    v_tenant_id, 'SERV-550', 'Servicio 550', 'ACTIVO', true, true, false,
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
  v_result := public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'PREPARAR',
    jsonb_build_object('items_preparados',jsonb_build_array(v_detalle_1::text)),'verify-550-picking');
  IF v_result->>'success' <> 'true' OR (SELECT estado FROM public.pedidos_venta WHERE id=v_pedido_id)<>'EN_PREPARACION' THEN
    RAISE EXCEPTION 'VERIFY_550_PREPARATION_FAILED'; END IF;
  v_result := public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'PREPARAR',
    jsonb_build_object('items_preparados',jsonb_build_array(v_detalle_1::text)),'verify-550-picking');
  IF v_result->>'idempotent'<>'true' OR (SELECT count(*) FROM public.logistica_eventos WHERE tenant_id=v_tenant_id AND idempotency_key='verify-550-picking')<>1 THEN
    RAISE EXCEPTION 'VERIFY_550_DUPLICATE'; END IF;
  BEGIN
    PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'PREPARAR','{}','verify-550-picking');
    RAISE EXCEPTION 'VERIFY_550_CONFLICT_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,gen_random_uuid(),'LISTO','{}','verify-550-invalid-actor');
    RAISE EXCEPTION 'VERIFY_550_ACTOR_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'LISTO',
      jsonb_build_object('items_preparados',jsonb_build_array(gen_random_uuid()::text)),'verify-550-bad-item');
    RAISE EXCEPTION 'VERIFY_550_ITEM_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'LOGISTICS_ITEMS_OUTSIDE_ORDER' THEN RAISE; END IF;
  END;
  IF (SELECT estado FROM public.pedidos_venta WHERE id=v_pedido_id)<>'EN_PREPARACION'
    OR EXISTS(SELECT 1 FROM public.logistica_eventos WHERE tenant_id=v_tenant_id AND idempotency_key='verify-550-bad-item') THEN
    RAISE EXCEPTION 'VERIFY_550_PARTIAL_COMMIT'; END IF;
  PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'LISTO','{}','verify-550-packing');
  IF (SELECT estado FROM public.pedidos_venta WHERE id=v_pedido_id)<>'LISTO_DESPACHO' THEN RAISE EXCEPTION 'VERIFY_550_PACKING'; END IF;
  BEGIN
    PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'TRACKING','{"estado":"ENTREGADO"}','verify-550-no-dispatch');
    RAISE EXCEPTION 'VERIFY_550_EARLY_DELIVERY';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'LOGISTICS_TRACKING_REQUIRES_DISPATCH' THEN RAISE; END IF;
  END;
  PERFORM public.despachar_pedido_parcial_tx(v_pedido_id,v_tenant_id,'verify-550-dispatch',
    jsonb_build_array(jsonb_build_object('detalle_id',v_detalle_1,'cantidad',1,'almacen_id',v_almacen_id)),
    'Parcial local',v_user_id,'{}');
  PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'BACKORDER',
    jsonb_build_object('detalle_id',v_detalle_1,'proxima_fecha_compromiso','2026-10-01','prioridad',2,'nota','Local'),
    'verify-550-backorder');
  IF NOT EXISTS(SELECT 1 FROM public.pedido_backorders WHERE pedido_id=v_pedido_id AND detalle_id=v_detalle_1
    AND prioridad=2 AND proxima_fecha_compromiso='2026-10-01') THEN RAISE EXCEPTION 'VERIFY_550_BACKORDER'; END IF;
  PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'TRACKING',
    '{"estado":"INCIDENCIA","notas":"Incidencia local"}','verify-550-tracking');
  PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'EVENTO',
    '{"tipo":"ENTREGA","notas":"Entrega local"}','verify-550-delivery');
  IF (SELECT tracking_estado FROM public.pedidos_venta WHERE id=v_pedido_id)<>'ENTREGADO' THEN
    RAISE EXCEPTION 'VERIFY_550_DELIVERY'; END IF;
  BEGIN
    PERFORM public.operar_logistica_tx(v_tenant_id,v_pedido_id,v_user_id,'TRACKING',
      '{"estado":"EN_TRANSITO"}','verify-550-regression');
    RAISE EXCEPTION 'VERIFY_550_REGRESSION_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'LOGISTICS_DELIVERY_CANNOT_REGRESS' THEN RAISE; END IF;
  END;
  IF has_function_privilege('authenticated','public.operar_logistica_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_550_PERMISSIONS_REOPENED'; END IF;
END $$;
ROLLBACK;
