\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 450 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_tenant_ajeno uuid;
  v_actor_ajeno uuid;
  v_proveedor uuid;
  v_almacen uuid;
  v_producto uuid;
  v_servicio uuid;
  v_no_stock uuid;
  v_orden uuid;
  v_det_1 uuid;
  v_det_2 uuid;
  v_det_3 uuid;
  v_det_serv uuid;
  v_det_no_stock uuid;
  v_recepcion jsonb;
  v_recepcion_id uuid;
  v_ri_1 uuid;
  v_ri_2 uuid;
  v_ri_3 uuid;
  v_ri_serv uuid;
  v_ri_no_stock uuid;
  v_cxp jsonb;
  v_devolucion jsonb;
  v_devolucion_id uuid;
  v_retry jsonb;
  v_pendiente jsonb;
  v_pendiente_id uuid;
  v_key text;
  v_stock numeric;
  v_count bigint;
  v_saldo numeric;
  v_total numeric;
  v_event_payload jsonb;
  v_fake_event uuid := gen_random_uuid();
  v_orden_sin_cxp uuid;
  v_det_sin_cxp uuid;
  v_recepcion_sin_cxp jsonb;
  v_recepcion_sin_cxp_id uuid;
  v_ri_sin_cxp uuid;
  v_dev_sin_cxp jsonb;
  v_dev_sin_cxp_id uuid;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localreturnverifyxxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY SUPPLIER RETURN 450', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY SUPPLIER RETURN FOREIGN 450', 1, 'PE') INTO v_demo;
  v_tenant_ajeno := (v_demo->>'tenant_id')::uuid;
  v_actor_ajeno := (v_demo->>'user_id')::uuid;

  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'PROV-450', 'Proveedor 450', 'Proveedor 450',
    '20123456780', 'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_proveedor;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-450', 'Almacén 450', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen;

  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'PROD-450', 'nombre', 'Producto 450', 'categoria', 'VERIFY',
    'precio_venta', 70, 'precio_compra', 50, 'afectacion_igv', '10',
    'es_servicio', false, 'controla_stock', true
  ), v_almacen, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_producto;
  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'SERV-450', 'nombre', 'Servicio 450', 'categoria', 'VERIFY',
    'precio_venta', 100, 'precio_compra', 100, 'afectacion_igv', '10',
    'es_servicio', true, 'controla_stock', false
  ), NULL, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_servicio;
  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'NOSTOCK-450', 'nombre', 'No stock 450', 'categoria', 'VERIFY',
    'precio_venta', 30, 'precio_compra', 30, 'afectacion_igv', '10',
    'es_servicio', false, 'controla_stock', false
  ), NULL, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_no_stock;

  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'OC-VERIFY-450', 'OC-VERIFY-450', v_proveedor,
    current_date, current_date, 'APROBADA', true, 'PEN',
    280, 50.40, 330.40, 'CREDITO', 30
  ) RETURNING id INTO v_orden;

  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES
    (v_tenant, v_orden, v_producto, 'Producto 450 línea 1', 1, 0, 1, 50, 50),
    (v_tenant, v_orden, v_producto, 'Producto 450 línea 2', 1, 0, 1, 50, 50),
    (v_tenant, v_orden, v_producto, 'Producto 450 línea 3', 1, 0, 1, 50, 50),
    (v_tenant, v_orden, v_servicio, 'Servicio 450', 1, 0, 1, 100, 100),
    (v_tenant, v_orden, v_no_stock, 'No stock 450', 1, 0, 1, 30, 30);
  SELECT id INTO v_det_1 FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Producto 450 línea 1';
  SELECT id INTO v_det_2 FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Producto 450 línea 2';
  SELECT id INTO v_det_3 FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Producto 450 línea 3';
  SELECT id INTO v_det_serv FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Servicio 450';
  SELECT id INTO v_det_no_stock FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='No stock 450';

  SELECT public.crear_recepcion_tx(
    v_tenant, v_orden,
    jsonb_build_array(
      jsonb_build_object('detalle_id',v_det_1,'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen),
      jsonb_build_object('detalle_id',v_det_2,'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen),
      jsonb_build_object('detalle_id',v_det_3,'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen),
      jsonb_build_object('detalle_id',v_det_serv,'cantidad_recibida',1,'calidad','OK'),
      jsonb_build_object('detalle_id',v_det_no_stock,'cantidad_recibida',1,'calidad','OK')
    ), 'Recepción 450', v_actor, 'verify:receipt:450'
  ) INTO v_recepcion;
  v_recepcion_id := (v_recepcion->>'id')::uuid;
  SELECT id INTO v_ri_1 FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_1;
  SELECT id INTO v_ri_2 FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_2;
  SELECT id INTO v_ri_3 FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_3;
  SELECT id INTO v_ri_serv FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_serv;
  SELECT id INTO v_ri_no_stock FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_no_stock;
  PERFORM public.cerrar_recepcion_tx(v_recepcion_id, v_tenant, v_actor::text, 'Cierre 450');

  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  IF v_stock <> 3 THEN RAISE EXCEPTION 'VERIFY_450_RECEIPT_STOCK_EXPECTED_3 got %', v_stock; END IF;

  SELECT public.crear_factura_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'proveedor_id',v_proveedor,'orden_id',v_orden,'recepcion_id',v_recepcion_id,
      'numero','FP-450','numero_documento','F001-450','fecha_emision',current_date,
      'fecha_vencimiento',current_date+30,'condiciones_pago','CREDITO','dias_credito',30,
      'subtotal',280,'igv',50.40,'total',330.40,'saldo',330.40,'moneda','PEN',
      'tipo_documento','FACTURA','referencia_tipo','RECEPCION','referencia_id',v_recepcion_id,
      'fiscal_metadata','{}'::jsonb,'estado','PENDIENTE','estado_comparacion','OK',
      'created_by',v_actor
    ), gen_random_uuid(), 'verify:cxp:450'
  ) INTO v_cxp;

  v_key := 'verify:return:450';
  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'recepcion_id',v_recepcion_id,'orden_id',v_orden,'proveedor_id',v_proveedor,
      'motivo','DEFECTO','observaciones','Verify 450',
      'items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_1,'producto_id',v_producto,'descripcion','Línea 1','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen),
        jsonb_build_object('recepcion_item_id',v_ri_2,'producto_id',v_producto,'descripcion','Línea 2','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen),
        jsonb_build_object('recepcion_item_id',v_ri_serv,'producto_id',v_servicio,'descripcion','Servicio','cantidad',1,'precio_unitario',100),
        jsonb_build_object('recepcion_item_id',v_ri_no_stock,'producto_id',v_no_stock,'descripcion','No stock','cantidad',1,'precio_unitario',30)
      )
    ), v_actor, v_key
  ) INTO v_devolucion;
  v_devolucion_id := (v_devolucion->>'id')::uuid;
  IF (v_devolucion->>'subtotal')::numeric <> 230 OR (v_devolucion->>'total')::numeric <> 271.40 THEN
    RAISE EXCEPTION 'VERIFY_450_CREATE_TOTALS_INVALID %', v_devolucion;
  END IF;

  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'recepcion_id',v_recepcion_id,'orden_id',v_orden,'proveedor_id',v_proveedor,
      'motivo','DEFECTO','observaciones','Verify 450',
      'items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_no_stock,'producto_id',v_no_stock,'descripcion','No stock','cantidad',1,'precio_unitario',30),
        jsonb_build_object('recepcion_item_id',v_ri_serv,'producto_id',v_servicio,'descripcion','Servicio','cantidad',1,'precio_unitario',100),
        jsonb_build_object('recepcion_item_id',v_ri_2,'producto_id',v_producto,'descripcion','Línea 2','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen),
        jsonb_build_object('recepcion_item_id',v_ri_1,'producto_id',v_producto,'descripcion','Línea 1','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen)
      )
    ), v_actor, v_key
  ) INTO v_retry;
  IF (v_retry->>'id')::uuid <> v_devolucion_id OR (v_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_450_CREATE_RETRY_FAILED %', v_retry;
  END IF;

  BEGIN
    PERFORM public.crear_devolucion_proveedor_tx(
      v_tenant,
      jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
        'proveedor_id',v_proveedor,'motivo','OTRO','items',jsonb_build_array(
          jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
            'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
      v_actor, v_key);
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_IDEMPOTENCY_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT public.emitir_devolucion_proveedor_tx(v_devolucion_id,v_tenant,v_actor) INTO v_devolucion;
  IF v_devolucion->>'estado' <> 'EMITIDA' OR jsonb_array_length(v_devolucion->'movimientos') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_450_EMIT_RESULT_INVALID %', v_devolucion;
  END IF;
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  IF v_stock <> 1 THEN RAISE EXCEPTION 'VERIFY_450_STOCK_EXPECTED_1 got %', v_stock; END IF;
  SELECT total,saldo INTO v_total,v_saldo FROM public.cuentas_por_pagar
  WHERE id=(v_cxp->>'id')::uuid;
  IF v_total <> 59 OR v_saldo <> 59 THEN
    RAISE EXCEPTION 'VERIFY_450_CXP_EXPECTED_59 total=% saldo=%',v_total,v_saldo;
  END IF;
  SELECT count(*) INTO v_count FROM public.cxp_ajustes_proveedor
  WHERE tenant_id=v_tenant AND devolucion_id=v_devolucion_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'VERIFY_450_CXP_ADJUSTMENT_COUNT %',v_count; END IF;
  SELECT payload INTO v_event_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='devolucion.proveedor.registrada'
    AND aggregate_id=v_devolucion_id::text;
  IF v_event_payload->>'cuentaPasivo' <> '42'
     OR (v_event_payload->>'mercaderia')::numeric <> 100
     OR (v_event_payload->>'servicios')::numeric <> 100
     OR (v_event_payload->>'noStock')::numeric <> 30
     OR (v_event_payload->>'cxpAjustadaAtomicamente')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_450_EVENT_CLASSIFICATION_INVALID %',v_event_payload;
  END IF;

  SELECT public.emitir_devolucion_proveedor_tx(v_devolucion_id,v_tenant,v_actor) INTO v_retry;
  IF (v_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_450_EMIT_RETRY_NOT_IDEMPOTENT %',v_retry;
  END IF;
  SELECT count(*) INTO v_count FROM public.movimientos_inventario
  WHERE tenant_id=v_tenant AND referencia_tipo='DEVOLUCION_PROVEEDOR_ITEM'
    AND metadata->>'devolucion_id'=v_devolucion_id::text;
  IF v_count <> 2 THEN RAISE EXCEPTION 'VERIFY_450_MOVEMENT_COUNT_AFTER_RETRY %',v_count; END IF;

  -- Sin factura/CxP aún no existe crédito fiscal ni proveedor por revertir:
  -- el asiento debe cancelar 4699 sólo por la base recibida.
  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'OC-VERIFY-450-SIN-CXP', 'OC-VERIFY-450-SIN-CXP', v_proveedor,
    current_date, current_date, 'APROBADA', true, 'PEN', 50, 9, 59, 'CREDITO', 30
  ) RETURNING id INTO v_orden_sin_cxp;
  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES (
    v_tenant, v_orden_sin_cxp, v_producto, 'Producto sin CxP 450', 1, 0, 1, 50, 50
  ) RETURNING id INTO v_det_sin_cxp;
  SELECT public.crear_recepcion_tx(v_tenant,v_orden_sin_cxp,
    jsonb_build_array(jsonb_build_object('detalle_id',v_det_sin_cxp,
      'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen)),
    'Sin CxP',v_actor,'verify:receipt:no-cxp:450') INTO v_recepcion_sin_cxp;
  v_recepcion_sin_cxp_id := (v_recepcion_sin_cxp->>'id')::uuid;
  SELECT id INTO v_ri_sin_cxp FROM public.recepcion_items
  WHERE recepcion_id=v_recepcion_sin_cxp_id AND detalle_id=v_det_sin_cxp;
  PERFORM public.cerrar_recepcion_tx(v_recepcion_sin_cxp_id,v_tenant,v_actor::text,NULL);
  SELECT public.crear_devolucion_proveedor_tx(v_tenant,jsonb_build_object(
    'recepcion_id',v_recepcion_sin_cxp_id,'orden_id',v_orden_sin_cxp,
    'proveedor_id',v_proveedor,'motivo','SIN FACTURA','items',jsonb_build_array(
      jsonb_build_object('recepcion_item_id',v_ri_sin_cxp,'producto_id',v_producto,
        'descripcion','Producto sin CxP 450','cantidad',1,'precio_unitario',50,
        'almacen_id',v_almacen))),v_actor,'verify:return:no-cxp:450') INTO v_dev_sin_cxp;
  v_dev_sin_cxp_id := (v_dev_sin_cxp->>'id')::uuid;
  PERFORM public.emitir_devolucion_proveedor_tx(v_dev_sin_cxp_id,v_tenant,v_actor);
  SELECT payload INTO v_event_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='devolucion.proveedor.registrada'
    AND aggregate_id=v_dev_sin_cxp_id::text;
  IF v_event_payload->>'cuentaPasivo' <> '4699'
     OR (v_event_payload->>'igvContable')::numeric <> 0
     OR (v_event_payload->>'totalContable')::numeric <> 50
     OR (v_event_payload->>'cxpAjustadaAtomicamente')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_450_NO_CXP_EVENT_INVALID %',v_event_payload;
  END IF;

  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
      'proveedor_id',v_proveedor,'motivo','PENDIENTE','items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
          'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
    v_actor,'verify:return:pending:450'
  ) INTO v_pendiente;
  v_pendiente_id := (v_pendiente->>'id')::uuid;
  PERFORM public.anular_devolucion_proveedor_pendiente_tx(v_pendiente_id,v_tenant,v_actor,'No enviar');
  -- La anulación libera la cantidad planificada para una nueva devolución.
  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
      'proveedor_id',v_proveedor,'motivo','REINTENTO','items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
          'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
    v_actor,'verify:return:rollback:450'
  ) INTO v_pendiente;
  v_pendiente_id := (v_pendiente->>'id')::uuid;

  -- Si la devolución supera la deuda aún pendiente, no puede crear un crédito
  -- a proveedor implícito ni retirar stock sin un flujo de reembolso/compensación.
  UPDATE public.cuentas_por_pagar SET saldo=10, saldo_pendiente=10,
    estado='PARCIAL', updated_at=now() WHERE id=(v_cxp->>'id')::uuid;
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  BEGIN
    PERFORM public.emitir_devolucion_proveedor_tx(v_pendiente_id,v_tenant,v_actor);
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_CREDIT_EXCEEDS_OUTSTANDING';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%SUPPLIER_CREDIT_EXCEEDS_OUTSTANDING%' THEN RAISE; END IF;
  END;
  IF (SELECT upper(estado::text) FROM public.devoluciones_proveedor WHERE id=v_pendiente_id) <> 'PENDIENTE'
     OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> v_stock THEN
    RAISE EXCEPTION 'VERIFY_450_CREDIT_EXCESS_DID_NOT_ROLL_BACK';
  END IF;
  UPDATE public.cuentas_por_pagar SET saldo=59, saldo_pendiente=59,
    estado='PENDIENTE', updated_at=now() WHERE id=(v_cxp->>'id')::uuid;

  -- Una colisión al final debe revertir también stock, CxP y estado.
  INSERT INTO public.outbox_events(
    tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,
    idempotency_key,event_id,occurred_at
  ) VALUES (
    v_tenant,'corrupt','corrupt','devolucion.proveedor.registrada','{}','pending',0,
    'devolucion.proveedor.registrada:'||v_tenant::text||':'||v_pendiente_id::text,
    v_fake_event,now()
  );
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  BEGIN
    PERFORM public.emitir_devolucion_proveedor_tx(v_pendiente_id,v_tenant,v_actor);
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_OUTBOX_COLLISION';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT upper(estado::text) FROM public.devoluciones_proveedor WHERE id=v_pendiente_id) <> 'PENDIENTE'
     OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> v_stock THEN
    RAISE EXCEPTION 'VERIFY_450_ROLLBACK_POSTCONDITION_FAILED';
  END IF;
  DELETE FROM public.outbox_events WHERE event_id=v_fake_event;
  PERFORM public.anular_devolucion_proveedor_pendiente_tx(v_pendiente_id,v_tenant,v_actor,'Fin verify');

  BEGIN
    PERFORM public.crear_devolucion_proveedor_tx(
      v_tenant,
      jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
        'proveedor_id',v_proveedor,'motivo','ACTOR','items',jsonb_build_array(
          jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
            'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
      v_actor_ajeno,'verify:return:foreign:450');
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_FOREIGN_ACTOR_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

DO $$
DECLARE
  v_ok boolean := false;
  v_id uuid;
  v_tenant uuid;
BEGIN
  IF has_function_privilege('anon','public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('service_role','app.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('service_role','app.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_450_RPC_ACL_INVALID';
  END IF;
  IF has_table_privilege('anon','public.devoluciones_proveedor','INSERT')
     OR has_table_privilege('authenticated','public.devoluciones_proveedor','UPDATE')
     OR has_table_privilege('anon','public.devolucion_items','DELETE')
     OR has_table_privilege('authenticated','public.cxp_ajustes_proveedor','SELECT') THEN
    RAISE EXCEPTION 'VERIFY_450_TABLE_ACL_INVALID';
  END IF;

  GRANT SELECT, UPDATE ON public.devoluciones_proveedor TO service_role;
  SELECT id, tenant_id INTO v_id, v_tenant
  FROM public.devoluciones_proveedor ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);
  -- Ejecutar sobre una fila garantiza que el rechazo viene del guard, no del ACL.
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.devoluciones_proveedor SET estado=estado
    WHERE id=v_id;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE '%SUPPLIER_RETURN_RPC_REQUIRED%' THEN v_ok := true; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'VERIFY_450_DIRECT_DML_GUARD_NOT_PROVEN'; END IF;
END
$$;

ROLLBACK;
