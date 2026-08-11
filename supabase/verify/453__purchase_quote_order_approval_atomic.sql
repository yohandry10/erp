\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 453 solo puede ejecutarse en erp_e2e';
  END IF;
END $$;

UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localqaerpephemeralx',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_approver uuid := gen_random_uuid();
  v_other_tenant uuid;
  v_other_actor uuid;
  v_provider uuid;
  v_warehouse uuid;
  v_product uuid;
  v_exempt_product uuid;
  v_quote jsonb;
  v_quote_retry jsonb;
  v_quote_id uuid;
  v_order jsonb;
  v_order_retry jsonb;
  v_order_id uuid;
  v_direct jsonb;
  v_direct_id uuid;
  v_direct_detail uuid;
  v_receipt jsonb;
  v_receipt_id uuid;
  v_collision jsonb;
  v_collision_id uuid;
  v_failed boolean;
BEGIN
  SELECT public.create_demo_tenant('VERIFY PURCHASE 453', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario, password_hash,
    activo, estado, is_super_admin, created_at, updated_at
  ) VALUES (
    v_approver, v_tenant, 'Aprobador', 'Verify 453',
    'approver-453-' || left(v_approver::text, 8) || '@example.invalid',
    'approver453-' || left(v_approver::text, 8),
    extensions.crypt('VERIFY-453', extensions.gen_salt('bf')),
    true, 'ACTIVO', false, now(), now()
  );
  INSERT INTO public.users (id, tenant_id, email, nombre, apellido, activo, estado)
  VALUES (
    v_approver, v_tenant,
    'approver-453-' || left(v_approver::text, 8) || '@example.invalid',
    'Aprobador', 'Verify 453', true, 'ACTIVO'
  );

  SELECT public.create_demo_tenant('VERIFY PURCHASE OTHER 453', 1, 'PE') INTO v_demo;
  v_other_tenant := (v_demo->>'tenant_id')::uuid;
  v_other_actor := (v_demo->>'user_id')::uuid;

  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'PROV-453', 'Proveedor 453', 'Proveedor Verify 453',
    '20' || lpad((floor(random()*999999999))::bigint::text, 9, '0'),
    'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_provider;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-453', 'Almacen 453', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_warehouse;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-453', 'nombre', 'Producto 453', 'categoria', 'VERIFY',
      'precio_venta', 20, 'precio_compra', 10, 'afectacion_igv', '10',
      'es_servicio', false, 'controla_stock', true
    ),
    v_warehouse, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_product;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-453-EXO', 'nombre', 'Producto exonerado 453', 'categoria', 'VERIFY',
      'precio_venta', 25, 'precio_compra', 25, 'afectacion_igv', '20',
      'es_servicio', false, 'controla_stock', true
    ),
    v_warehouse, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_exempt_product;

  v_quote := public.crear_cotizacion_compra_tx(
    v_tenant, v_actor, 'verify-453-quote-main',
    jsonb_build_object(
      'numero', 'COT-COMPRA-453', 'proveedor_id', v_provider,
      'fecha_cotizacion', app.hoy_tenant(v_tenant), 'validez_dias', 30,
      'observaciones', 'cotizacion atomica 453',
      'detalles', jsonb_build_array(
        jsonb_build_object(
          'producto_id', v_product, 'descripcion', 'Producto 453',
          'cantidad', 2.5, 'precio_unitario', 10
        ),
        jsonb_build_object(
          'producto_id', v_exempt_product, 'descripcion', 'Producto exonerado 453',
          'cantidad', 1, 'precio_unitario', 25
        )
      )
    )
  );
  v_quote_id := (v_quote->>'id')::uuid;
  IF v_quote_id IS NULL OR (v_quote->>'idempotent')::boolean
     OR jsonb_array_length(v_quote->'detalles') <> 2
     OR (v_quote->>'subtotal')::numeric <> 50
     OR (v_quote->>'igv')::numeric <> 4.5
     OR (v_quote->>'total')::numeric <> 54.5
     OR (SELECT created_by FROM public.cotizaciones_compra WHERE id=v_quote_id) <> v_actor
     OR (SELECT count(*) FROM public.cotizacion_compra_detalles WHERE cotizacion_id=v_quote_id) <> 2 THEN
    RAISE EXCEPTION 'Alta atomica de cotizacion incompleta: %', v_quote;
  END IF;

  v_quote_retry := public.crear_cotizacion_compra_tx(
    v_tenant, v_actor, 'verify-453-quote-main',
    jsonb_build_object(
      'numero', 'COT-COMPRA-453', 'proveedor_id', v_provider,
      'fecha_cotizacion', app.hoy_tenant(v_tenant), 'validez_dias', 30,
      'observaciones', 'cotizacion atomica 453',
      'detalles', jsonb_build_array(
        jsonb_build_object(
          'producto_id', v_product, 'descripcion', 'Producto 453',
          'cantidad', 2.5, 'precio_unitario', 10
        ),
        jsonb_build_object(
          'producto_id', v_exempt_product, 'descripcion', 'Producto exonerado 453',
          'cantidad', 1, 'precio_unitario', 25
        )
      )
    )
  );
  IF (v_quote_retry->>'id')::uuid <> v_quote_id
     OR NOT (v_quote_retry->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'Retry de cotizacion no fue estable';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_cotizacion_compra_tx(
      v_tenant, v_actor, 'verify-453-quote-main',
      jsonb_build_object(
        'numero', 'COT-COMPRA-453', 'proveedor_id', v_provider,
        'detalles', jsonb_build_array(jsonb_build_object(
          'producto_id', v_product, 'descripcion', 'Producto alterado',
          'cantidad', 99, 'precio_unitario', 10
        ))
      )
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed OR (SELECT count(*) FROM public.cotizaciones_compra WHERE tenant_id=v_tenant) <> 1 THEN
    RAISE EXCEPTION 'La key reutilizada no fue rechazada sin duplicar';
  END IF;

  v_quote := public.actualizar_cotizacion_compra_tx(
    v_quote_id, v_tenant, v_actor,
    jsonb_build_object(
      'observaciones', 'cotizacion editada atomicamente',
      'detalles', jsonb_build_array(
        jsonb_build_object(
          'producto_id', v_product, 'descripcion', 'Producto 453 editado',
          'cantidad', 2.5, 'precio_unitario', 10
        ),
        jsonb_build_object(
          'producto_id', v_exempt_product, 'descripcion', 'Producto exonerado 453',
          'cantidad', 1, 'precio_unitario', 25
        )
      )
    )
  );
  IF jsonb_array_length(v_quote->'detalles') <> 2
     OR (v_quote->>'igv')::numeric <> 4.5
     OR (SELECT metadata->>'revision' FROM public.cotizaciones_compra WHERE id=v_quote_id) <> '2' THEN
    RAISE EXCEPTION 'Edicion atomica de cotizacion no preservo detalles/impuesto/revision';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.actualizar_cotizacion_compra_tx(
      v_quote_id, v_tenant, v_actor, jsonb_build_object('estado', 'APROBADA')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed OR upper((SELECT estado::text FROM public.cotizaciones_compra WHERE id=v_quote_id)) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'PUT de cotizacion acepto una transicion de estado';
  END IF;

  PERFORM public.cambiar_estado_cotizacion_compra_tx(v_quote_id, v_tenant, v_actor, 'ENVIAR', NULL);
  v_failed := false;
  BEGIN
    PERFORM public.cambiar_estado_cotizacion_compra_tx(v_quote_id, v_tenant, v_actor, 'APROBAR', NULL);
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed OR upper((SELECT estado::text FROM public.cotizaciones_compra WHERE id=v_quote_id)) <> 'ENVIADA' THEN
    RAISE EXCEPTION 'La autoaprobacion de cotizacion no fue bloqueada';
  END IF;
  PERFORM public.cambiar_estado_cotizacion_compra_tx(v_quote_id, v_tenant, v_approver, 'APROBAR', NULL);

  v_order := public.convertir_cotizacion_compra_a_oc_tx(
    v_quote_id, v_tenant, v_actor, 'verify-453-convert-main', NULL, NULL
  );
  v_order_id := (v_order->>'id')::uuid;
  IF v_order_id IS NULL
     OR upper((SELECT estado::text FROM public.ordenes_compra WHERE id=v_order_id)) <> 'BORRADOR'
     OR (SELECT cotizacion_id FROM public.ordenes_compra WHERE id=v_order_id) <> v_quote_id
     OR (SELECT orden_compra_id FROM public.cotizaciones_compra WHERE id=v_quote_id) <> v_order_id
     OR (SELECT count(*) FROM public.orden_compra_detalles WHERE orden_id=v_order_id) <> 2
     OR (SELECT igv FROM public.ordenes_compra WHERE id=v_order_id) <> 4.5
     OR NOT ((v_order->>'numero') ~ '^OC-[0-9]{4}-[0-9]{4,}$') THEN
    RAISE EXCEPTION 'Conversion cotizacion->OC inconsistente: %', v_order;
  END IF;
  v_order_retry := public.convertir_cotizacion_compra_a_oc_tx(
    v_quote_id, v_tenant, v_actor, 'otra-key-ignorada-por-link', NULL, NULL
  );
  IF (v_order_retry->>'id')::uuid <> v_order_id
     OR NOT (v_order_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.ordenes_compra WHERE cotizacion_id=v_quote_id) <> 1 THEN
    RAISE EXCEPTION 'Retry de conversion duplico o no devolvio la OC existente';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_orden_compra_tx(
      v_tenant, v_actor, 'verify-453-bypass',
      jsonb_build_object(
        'numero', 'OC-BYPASS-453', 'proveedor_id', v_provider,
        'cotizacion_id', v_quote_id,
        'detalles', jsonb_build_array(jsonb_build_object(
          'producto_id', v_product, 'descripcion', 'Producto 453',
          'cantidad', 1, 'precio_unitario', 10
        ))
      )
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'El alta directa acepto cotizacion_id'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.decidir_orden_compra_tx(v_order_id, v_tenant, v_actor, 'APROBAR', 'auto');
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'La autoaprobacion de OC no fue bloqueada'; END IF;
  PERFORM public.decidir_orden_compra_tx(v_order_id, v_tenant, v_approver, 'APROBAR', 'aprobada');
  IF upper((SELECT estado::text FROM public.ordenes_compra WHERE id=v_order_id)) <> 'APROBADA'
     OR (SELECT count(*) FROM public.oc_aprobaciones WHERE orden_id=v_order_id AND lower(estado::text)='aprobada') <> 1
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='orden.compra.aprobada' AND aggregate_id=v_order_id::text) <> 1 THEN
    RAISE EXCEPTION 'Aprobacion atomica no dejo decision+estado+outbox';
  END IF;
  PERFORM public.decidir_orden_compra_tx(v_order_id, v_tenant, v_approver, 'APROBAR', 'aprobada');
  IF (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='orden.compra.aprobada' AND aggregate_id=v_order_id::text) <> 1 THEN
    RAISE EXCEPTION 'Retry de aprobacion duplico outbox';
  END IF;

  v_direct := public.crear_orden_compra_tx(
    v_tenant, v_actor, 'verify-453-order-cancel',
    jsonb_build_object(
      'numero', 'OC-CANCEL-453', 'proveedor_id', v_provider,
      'fecha_orden', app.hoy_tenant(v_tenant), 'almacen_destino_id', v_warehouse,
      'detalles', jsonb_build_array(jsonb_build_object(
        'producto_id', v_product, 'descripcion', 'Producto 453',
        'cantidad', 1, 'precio_unitario', 10
      ))
    )
  );
  v_direct_id := (v_direct->>'id')::uuid;
  v_order_retry := public.crear_orden_compra_tx(
    v_tenant, v_actor, 'verify-453-order-cancel',
    jsonb_build_object(
      'numero', 'OC-CANCEL-453', 'proveedor_id', v_provider,
      'fecha_orden', app.hoy_tenant(v_tenant), 'almacen_destino_id', v_warehouse,
      'detalles', jsonb_build_array(jsonb_build_object(
        'producto_id', v_product, 'descripcion', 'Producto 453',
        'cantidad', 1, 'precio_unitario', 10
      ))
    )
  );
  IF (v_order_retry->>'id')::uuid <> v_direct_id
     OR NOT (v_order_retry->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'Retry de alta de OC no fue estable';
  END IF;
  v_direct := public.actualizar_orden_compra_tx(
    v_direct_id, v_tenant, v_actor,
    jsonb_build_object(
      'observaciones', 'OC editada atomicamente',
      'detalles', jsonb_build_array(jsonb_build_object(
        'producto_id', v_product, 'descripcion', 'Producto 453 editado',
        'cantidad', 1, 'precio_unitario', 10
      ))
    )
  );
  IF jsonb_array_length(v_direct->'detalles') <> 1
     OR (SELECT metadata->>'revision' FROM public.ordenes_compra WHERE id=v_direct_id) <> '2' THEN
    RAISE EXCEPTION 'Edicion atomica de OC no preservo detalles/revision';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.actualizar_orden_compra_tx(
      v_direct_id, v_tenant, v_actor, jsonb_build_object('estado', 'APROBADA')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed OR upper((SELECT estado::text FROM public.ordenes_compra WHERE id=v_direct_id)) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'PUT de OC acepto una transicion de estado';
  END IF;
  PERFORM public.decidir_orden_compra_tx(v_direct_id, v_tenant, v_approver, 'APROBAR', 'ok');
  SELECT id INTO v_direct_detail FROM public.orden_compra_detalles WHERE orden_id=v_direct_id;
  v_receipt := public.crear_recepcion_tx(
    v_tenant, v_direct_id,
    jsonb_build_array(jsonb_build_object(
      'detalle_id', v_direct_detail, 'cantidad_recibida', 1,
      'calidad', 'OK', 'almacen_id', v_warehouse
    )), 'borrador que debe eliminarse al cancelar', v_actor, 'verify-453-draft-receipt'
  );
  v_receipt_id := (v_receipt->>'id')::uuid;
  PERFORM public.decidir_orden_compra_tx(v_direct_id, v_tenant, v_actor, 'CANCELAR', 'ya no se requiere');
  IF upper((SELECT estado::text FROM public.ordenes_compra WHERE id=v_direct_id)) <> 'ANULADA'
     OR EXISTS (SELECT 1 FROM public.recepciones WHERE id=v_receipt_id)
     OR EXISTS (SELECT 1 FROM public.recepcion_items WHERE recepcion_id=v_receipt_id) THEN
    RAISE EXCEPTION 'Cancelacion no limpio el borrador de recepcion atomicamente';
  END IF;

  v_collision := public.crear_orden_compra_tx(
    v_tenant, v_actor, 'verify-453-order-collision',
    jsonb_build_object(
      'numero', 'OC-COLLISION-453', 'proveedor_id', v_provider,
      'detalles', jsonb_build_array(jsonb_build_object(
        'producto_id', v_product, 'descripcion', 'Producto 453',
        'cantidad', 1, 'precio_unitario', 10
      ))
    )
  );
  v_collision_id := (v_collision->>'id')::uuid;
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status, idempotency_key
  ) VALUES (
    v_tenant, 'orden_compra', gen_random_uuid()::text, 'orden.compra.aprobada',
    jsonb_build_object('fingerprint', 'corrupto'), 'pending',
    'compras.oc.aprobada:' || v_tenant::text || ':' || v_collision_id::text
  );
  v_failed := false;
  BEGIN
    PERFORM public.decidir_orden_compra_tx(v_collision_id, v_tenant, v_approver, 'APROBAR', 'debe rollback');
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed
     OR upper((SELECT estado::text FROM public.ordenes_compra WHERE id=v_collision_id)) <> 'BORRADOR'
     OR EXISTS (SELECT 1 FROM public.oc_aprobaciones WHERE orden_id=v_collision_id) THEN
    RAISE EXCEPTION 'Colision de outbox no revirtio decision y estado';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_orden_compra_tx(
      v_tenant, v_other_actor, 'verify-453-cross-tenant',
      jsonb_build_object(
        'numero', 'OC-CROSS-453', 'proveedor_id', v_provider,
        'detalles', jsonb_build_array(jsonb_build_object(
          'producto_id', v_product, 'descripcion', 'Producto 453',
          'cantidad', 1, 'precio_unitario', 10
        ))
      )
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Actor cross-tenant aceptado'; END IF;

  IF has_table_privilege('authenticated', 'public.cotizaciones_compra', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ordenes_compra', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.oc_aprobaciones', 'INSERT')
     OR has_function_privilege('authenticated', 'public.decidir_orden_compra_tx(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.decidir_orden_compra_tx(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.insert_purchase_order_453(uuid,uuid,text,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.assert_purchase_actor_453(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL 453 no es service-role-only';
  END IF;
END $$;

ROLLBACK;
