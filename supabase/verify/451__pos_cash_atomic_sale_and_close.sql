\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 451 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_foreign_tenant uuid;
  v_foreign_actor uuid;
  v_cliente uuid;
  v_almacen uuid;
  v_caja uuid;
  v_sesion uuid;
  v_producto uuid;
  v_servicio uuid;
  v_no_stock uuid;
  v_result jsonb;
  v_retry jsonb;
  v_venta uuid;
  v_cpe uuid := gen_random_uuid();
  v_stock numeric;
  v_count bigint;
  v_monto numeric;
  v_payload jsonb;
  v_request jsonb;
  v_close jsonb;
  v_close_retry jsonb;
  v_hash text;
  v_dummy_event uuid := gen_random_uuid();
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localposverifyxxxxxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY POS CASH 451', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY POS CASH FOREIGN 451', 1, 'PE') INTO v_demo;
  v_foreign_tenant := (v_demo->>'tenant_id')::uuid;
  v_foreign_actor := (v_demo->>'user_id')::uuid;

  UPDATE public.empresa_config
  SET ruc = '20600000451', razon_social = 'Empresa verify POS 451',
      moneda_defecto = 'PEN', igv_porcentaje = 18,
      requiere_aprobacion_descuento = false,
      aplicar_limite_credito = true, dias_vencimiento_factura = 30
  WHERE tenant_id = v_tenant;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc,
    estado, activo, limite_credito, permite_morosidad
  ) VALUES (
    v_tenant, 'CLI-451', 'Cliente POS 451', 'Cliente POS 451',
    'RUC', '20123456451', 'ACTIVO', true, 1000, false
  ) RETURNING id INTO v_cliente;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-451', 'Almacén POS 451', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen;

  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant, 'CAJA-451', 'Caja POS 451', 'ACTIVO', v_almacen,
    'MOSTRADOR', v_actor
  ) RETURNING id INTO v_caja;

  -- El contrato final 518 decide supervisor con la configuración activa de la
  -- caja. Este verificador histórico prueba el cierre/idempotencia con S/ 1 de
  -- diferencia, por lo que congela explícitamente esa tolerancia en su fixture.
  INSERT INTO public.configuracion_caja (
    tenant_id, caja_id, tolerancia_diferencia_cierre, estado, activo, updated_by
  ) VALUES (v_tenant, v_caja, 1, 'ACTIVO', true, v_actor);

  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'PROD-451', 'nombre', 'Producto físico POS 451',
    'categoria', 'VERIFY', 'precio_venta', 10, 'precio_compra', 4,
    'afectacion_igv', '10', 'es_servicio', false, 'controla_stock', true
  ), v_almacen, 10, 0, '[]'::jsonb)->>'id')::uuid INTO v_producto;
  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'SERV-451', 'nombre', 'Servicio POS 451',
    'categoria', 'VERIFY', 'precio_venta', 20, 'precio_compra', 0,
    'afectacion_igv', '10', 'es_servicio', true, 'controla_stock', false
  ), NULL, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_servicio;
  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'NOSTOCK-451', 'nombre', 'Producto sin stock POS 451',
    'categoria', 'VERIFY', 'precio_venta', 5, 'precio_compra', 0,
    'afectacion_igv', '10', 'es_servicio', false, 'controla_stock', false
  ), NULL, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_no_stock;

  SELECT public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 100, 'moneda', 'PEN',
    'dispositivo', 'TERM-451',
    'denominaciones_apertura', jsonb_build_object('billetes', jsonb_build_object('100', 1))
  )) INTO v_result;
  v_sesion := (v_result->>'id')::uuid;
  IF v_sesion IS NULL OR v_result->>'estado' <> 'ABIERTA'
     OR (v_result->>'almacen_id')::uuid <> v_almacen THEN
    RAISE EXCEPTION 'VERIFY_451_OPEN_RESULT_INVALID %', v_result;
  END IF;

  BEGIN
    PERFORM public.abrir_caja_tx(v_tenant, v_caja, v_actor,
      jsonb_build_object('monto_inicio', 100, 'moneda', 'PEN', 'dispositivo', 'TERM-451'));
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_OPEN_CONFLICT';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion) <> 'ABIERTA' THEN
    RAISE EXCEPTION 'VERIFY_451_OPEN_CONFLICT_MUTATED_EXISTING_SESSION';
  END IF;

  v_request := jsonb_build_object(
    'cliente_id', v_cliente,
    'cliente_documento', '20123456451',
    'cliente_nombre', 'Cliente POS 451',
    'moneda', 'PEN',
    'ticket_serie', 'T001',
    'items', jsonb_build_array(
      jsonb_build_object('producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 10, 'descuento_monto', 0, 'subtotal', 10, 'igv', 1.80),
      jsonb_build_object('producto_id', v_servicio, 'cantidad', 1,
        'precio_unitario', 20, 'descuento_monto', 0, 'subtotal', 20, 'igv', 3.60),
      jsonb_build_object('producto_id', v_producto, 'cantidad', 2,
        'precio_unitario', 10, 'descuento_monto', 0, 'subtotal', 20, 'igv', 3.60),
      jsonb_build_object('producto_id', v_no_stock, 'cantidad', 1,
        'precio_unitario', 5, 'descuento_monto', 0, 'subtotal', 5, 'igv', 0.90)
    ),
    'pagos', jsonb_build_array(
      jsonb_build_object('codigo', 'efectivo', 'monto', 20, 'moneda', 'PEN'),
      jsonb_build_object('codigo', 'tarjeta', 'monto', 20, 'moneda', 'PEN', 'referencia', 'VISA-451'),
      jsonb_build_object('codigo', 'credito', 'monto', 24.90, 'moneda', 'PEN')
    ),
    'cpe_data', jsonb_build_object(
      'tipo_documento', '03', 'serie', 'B001',
      'ruc_emisor', '20600000451', 'razon_social_emisor', 'Empresa verify POS 451',
      'tipo_documento_receptor', '6', 'documento_receptor', '20123456451',
      'razon_social_receptor', 'Cliente POS 451', 'moneda', 'PEN',
      'total_gravadas', 55, 'total_exoneradas', 0, 'total_inafectas', 0,
      'total_igv', 9.90, 'total_venta', 64.90
    )
  );

  -- La serie interna del ticket nunca puede consumir la numeración fiscal.
  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion, 'verify:pos:451:invalid-cpe-series',
      jsonb_set(v_request, '{cpe_data,serie}', '"T001"'::jsonb)
    );
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_INTERNAL_SERIES_REJECTION';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion, 'verify:pos:451:wrong-fiscal-prefix',
      jsonb_set(v_request, '{cpe_data,serie}', '"F001"'::jsonb)
    );
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_CPE_SERIES_TYPE_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion, 'verify:pos:451', v_request
  ) INTO v_result;
  v_venta := (v_result->>'venta_id')::uuid;
  IF v_venta IS NULL OR v_result->>'numero_ticket' !~ '^T001-[0-9]{8}$'
     OR (v_result->>'total')::numeric <> 64.90
     OR (v_result->>'credito_monto')::numeric <> 24.90
     OR (v_result->>'impactos_aplicados')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_451_SALE_RESULT_INVALID %', v_result;
  END IF;

  SELECT stock_actual INTO v_stock
  FROM public.producto_existencias
  WHERE tenant_id = v_tenant AND producto_id = v_producto AND almacen_id = v_almacen;
  IF v_stock <> 7 THEN
    RAISE EXCEPTION 'VERIFY_451_PHYSICAL_STOCK_EXPECTED_7 got %', v_stock;
  END IF;
  SELECT count(*) INTO v_count FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant AND referencia_tipo = 'VENTA_POS'
    AND referencia_id = v_venta AND producto_id = v_producto
    AND almacen_id = v_almacen AND tipo = 'SALIDA' AND cantidad = 3;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_451_DUPLICATE_SKU_MOVEMENT_EXPECTED_1 got %', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.detalle_ventas_pos d
    WHERE d.tenant_id = v_tenant AND d.venta_pos_id = v_venta
      AND ((d.producto_id = v_producto AND d.movimiento_id IS NULL)
        OR (d.producto_id IN (v_servicio, v_no_stock) AND d.movimiento_id IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'VERIFY_451_SERVICE_OR_STOCK_CLASSIFICATION_INVALID';
  END IF;

  SELECT count(*), coalesce(sum(monto), 0) INTO v_count, v_monto
  FROM public.movimientos_caja
  WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion
    AND referencia_tipo = 'venta_pos' AND referencia_documento = v_venta::text;
  IF v_count <> 1 OR v_monto <> 20 THEN
    RAISE EXCEPTION 'VERIFY_451_CASH_PORTION_INVALID count=% monto=%', v_count, v_monto;
  END IF;
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar
      WHERE id = (v_result->>'cuenta_por_cobrar_id')::uuid) <> 24.90 THEN
    RAISE EXCEPTION 'VERIFY_451_CREDIT_CXC_INVALID';
  END IF;
  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id = v_tenant AND event_id = (v_result->>'accounting_event_id')::uuid;
  IF v_payload->>'source' <> 'pos.venta.registrada'
     OR jsonb_array_length(v_payload->'pagos') <> 3
     OR (v_payload->>'montoCredito')::numeric <> 24.90
     OR (v_payload->>'cxcCreadaAtomicamente')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_451_ACCOUNTING_PAYLOAD_INVALID %', v_payload;
  END IF;
  IF (SELECT cpe_data->>'numero' FROM public.ventas_pos WHERE id = v_venta) IS NULL
     OR (SELECT cpe_data->>'serie' FROM public.ventas_pos WHERE id = v_venta) <> 'B001'
     OR NOT (SELECT cpe_pendiente FROM public.ventas_pos WHERE id = v_venta) THEN
    RAISE EXCEPTION 'VERIFY_451_CPE_QUEUE_NOT_DURABLE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.ventas_pos v,
         jsonb_array_elements(v.cpe_data->'items') item
    WHERE v.id = v_venta
      AND (
        item->>'precio_venta' IS NULL OR item->>'valor_unitario' IS NULL
        OR abs(app.to_numeric_or_zero(item->>'precio_venta')
             * app.to_numeric_or_zero(item->>'cantidad')
             - app.to_numeric_or_zero(item->>'total_item')) > 0.02
      )
  ) THEN
    RAISE EXCEPTION 'VERIFY_451_CPE_ITEM_UNIT_PRICES_INVALID';
  END IF;

  -- El orden de líneas/pagos no cambia la huella; el retry no vuelve a mutar.
  SELECT public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion, 'verify:pos:451',
    jsonb_set(jsonb_set(v_request, '{items}', (
      SELECT jsonb_agg(value ORDER BY ord DESC)
      FROM jsonb_array_elements(v_request->'items') WITH ORDINALITY a(value, ord)
    )), '{pagos}', (
      SELECT jsonb_agg(value ORDER BY ord DESC)
      FROM jsonb_array_elements(v_request->'pagos') WITH ORDINALITY a(value, ord)
    ))
  ) INTO v_retry;
  IF (v_retry->>'venta_id')::uuid <> v_venta OR (v_retry->>'idempotent')::boolean IS NOT TRUE
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> 7
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id=v_tenant AND aggregate_id=v_venta::text
           AND event_type='pos.venta.registrada') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_451_IDEMPOTENT_RETRY_MUTATED %', v_retry;
  END IF;

  -- Key igual con carrito distinto debe fallar antes de cualquier efecto.
  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion, 'verify:pos:451',
      jsonb_set(v_request,
        '{items}', jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto, 'cantidad', 1, 'precio_unitario', 10,
          'descuento_monto', 0, 'subtotal', 10, 'igv', 1.80)))
    );
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_SALE_PAYLOAD_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT stock_actual FROM public.producto_existencias
      WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> 7 THEN
    RAISE EXCEPTION 'VERIFY_451_MISMATCH_RETRY_CHANGED_STOCK';
  END IF;

  -- Una colisión de outbox aborta venta, stock, caja y numeración como unidad.
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status,
    retry_count, idempotency_key, event_id, occurred_at, created_at, updated_at
  ) VALUES (
    v_tenant, 'verify', v_dummy_event::text, 'pos.venta.registrada', '{}'::jsonb,
    'pending', 0, 'pos.accounting:' || v_tenant::text || ':verify:collision:451',
    v_dummy_event, now(), now(), now()
  );
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion, 'verify:collision:451',
      (SELECT jsonb_build_object(
        'cliente_id', v_cliente, 'cliente_documento', '20123456451',
        'cliente_nombre', 'Cliente POS 451', 'moneda', 'PEN', 'ticket_serie', 'T001',
        'items', jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto, 'cantidad', 1, 'precio_unitario', 10,
          'descuento_monto', 0, 'subtotal', 10, 'igv', 1.80)),
        'pagos', jsonb_build_array(jsonb_build_object('codigo','efectivo','monto',11.80,'moneda','PEN')),
        'cpe_data', jsonb_build_object('tipo_documento','03','serie','B001',
          'documento_receptor','20123456451','tipo_documento_receptor','6',
          'razon_social_receptor','Cliente POS 451','total_gravadas',10,
          'total_igv',1.80,'total_venta',11.80)
      ))
    );
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_OUTBOX_COLLISION';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.ventas_pos
             WHERE tenant_id=v_tenant AND idempotency_key='verify:collision:451')
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> v_stock THEN
    RAISE EXCEPTION 'VERIFY_451_OUTBOX_COLLISION_DID_NOT_ROLLBACK';
  END IF;

  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion, v_actor,
      jsonb_build_object('monto_contado',121,'denominaciones','{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_PENDING_CPE_CLOSE_BLOCK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion, v_actor,
      jsonb_build_object(
        'monto_contado', 121, 'denominaciones', '{}'::jsonb,
        'cierre_administrativo', true,
        'razon_cierre_administrativo', 'Sesión abandonada verificada 451'
      ));
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_ADMIN_PENDING_CPE_CLOSE_BLOCK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero, ruc_emisor,
    razon_social_emisor, tipo_documento_receptor, documento_receptor,
    razon_social_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  ) VALUES (
    v_cpe, v_tenant, '03', 'B001',
    (SELECT lpad(cpe_data->>'numero',8,'0') FROM public.ventas_pos WHERE id=v_venta),
    '20600000451', 'Empresa verify POS 451', '6', '20123456451',
    'Cliente POS 451', v_cliente, 'PEN', 55, 0, 0, 0, 9.90,
    64.90, 64.90, '[]'::jsonb, now(), current_date,
    'ACEPTADO', 'ACEPTADO', 'ACCEPTED', v_actor, gen_random_uuid(), true
  );
  UPDATE public.ventas_pos
  SET cpe_id=v_cpe, cpe_pendiente=false, updated_at=now()
  WHERE id=v_venta AND tenant_id=v_tenant;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion, v_actor,
    jsonb_build_object('monto_contado',121,'denominaciones','{}'::jsonb))
    INTO v_close;
  v_hash := v_close->>'hash_integridad';
  IF v_close->>'estado' <> 'CERRADA' OR (v_close->>'monto_esperado')::numeric <> 120
     OR (v_close->>'diferencia')::numeric <> 1 OR length(v_hash) <> 64
     OR (SELECT hash_integridad FROM public.sesiones_caja WHERE id=v_sesion) <> v_hash
     OR (SELECT integridad_hash FROM public.cortes_caja WHERE sesion_caja_id=v_sesion) <> v_hash
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id=v_tenant AND event_type='caja.cerrada'
           AND aggregate_id=v_sesion::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_451_CLOSE_RESULT_INVALID %', v_close;
  END IF;
  IF NOT public.verificar_integridad_caja(v_tenant, v_sesion, v_actor) THEN
    RAISE EXCEPTION 'VERIFY_451_CLOSE_INTEGRITY_RECALCULATION_FAILED';
  END IF;
  SELECT public.cerrar_caja_tx(v_tenant, v_sesion, v_actor,
    jsonb_build_object('monto_contado',121,'denominaciones','{}'::jsonb))
    INTO v_close_retry;
  IF (v_close_retry->>'idempotent')::boolean IS NOT TRUE
     OR v_close_retry->>'hash_integridad' <> v_hash
     OR (SELECT count(*) FROM public.cortes_caja WHERE sesion_caja_id=v_sesion) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_451_CLOSE_RETRY_INVALID %', v_close_retry;
  END IF;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion, v_actor,
      jsonb_build_object('monto_contado',122,'denominaciones','{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_CLOSE_PAYLOAD_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion, 'verify:closed:451', v_request);
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_CLOSED_SESSION_REJECTION';
  EXCEPTION WHEN invalid_parameter_value OR check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.abrir_caja_tx(v_tenant, v_caja, v_foreign_actor,
      jsonb_build_object('monto_inicio',100,'moneda','PEN'));
    RAISE EXCEPTION 'VERIFY_451_EXPECTED_FOREIGN_ACTOR_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF has_function_privilege('anon', 'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.verificar_integridad_caja(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.verificar_integridad_caja(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.pos_registrar_venta_full_tx(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,text,numeric,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.pos_registrar_venta_tx(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,text,numeric,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_451_RPC_ACL_INVALID';
  END IF;
END
$$;

ROLLBACK;
