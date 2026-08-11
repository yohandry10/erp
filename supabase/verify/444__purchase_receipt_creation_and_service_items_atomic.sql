\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 444 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_proveedor_id uuid;
  v_almacen_id uuid;
  v_producto_fisico uuid;
  v_producto_servicio uuid;
  v_producto_no_stock uuid;
  v_orden_id uuid;
  v_detalle_fisico uuid;
  v_detalle_servicio uuid;
  v_detalle_no_stock uuid;
  v_orden_segunda uuid;
  v_detalle_segunda uuid;
  v_recepcion_id uuid;
  v_segunda_recepcion_id uuid;
  v_result jsonb;
  v_retry jsonb;
  v_event jsonb;
  v_count_before bigint;
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_444_REQUIRES_LOCAL_ERP_E2E_DATABASE';
  END IF;

  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localreceiptverifyxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY RECEIPT ATOMIC 444', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, 'PROV-VERIFY-444', 'Proveedor Verify 444',
    'Proveedor Verify 444', '20123456786', 'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_proveedor_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-444', 'Almacén Verify 444',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-FISICO-444', 'nombre', 'Producto físico 444',
      'categoria', 'VERIFICACION', 'precio_venta', 70,
      'precio_compra', 50, 'afectacion_igv', '10',
      'es_servicio', false, 'controla_stock', true
    ),
    v_almacen_id, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_fisico;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'SERVICIO-444', 'nombre', 'Servicio técnico 444',
      'categoria', 'VERIFICACION', 'precio_venta', 100,
      'precio_compra', 100, 'afectacion_igv', '10',
      'es_servicio', true, 'controla_stock', false
    ),
    NULL, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_servicio;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'NOSTOCK-444', 'nombre', 'Consumible sin stock 444',
      'categoria', 'VERIFICACION', 'precio_venta', 30,
      'precio_compra', 30, 'afectacion_igv', '10',
      'es_servicio', false, 'controla_stock', false
    ),
    NULL, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_no_stock;

  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, 'OC-VERIFY-444', 'OC-VERIFY-444', v_proveedor_id,
    current_date, current_date, 'APROBADA', true, 'PEN', 230, 41.4, 271.4,
    'CREDITO', 30
  ) RETURNING id INTO v_orden_id;

  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES
    (v_tenant_id, v_orden_id, v_producto_fisico, 'Producto físico 444', 2, 0, 2, 50, 100),
    (v_tenant_id, v_orden_id, v_producto_servicio, 'Servicio técnico 444', 1, 0, 1, 100, 100),
    (v_tenant_id, v_orden_id, v_producto_no_stock, 'Consumible sin stock 444', 1, 0, 1, 30, 30);

  SELECT id INTO v_detalle_fisico FROM public.orden_compra_detalles
  WHERE orden_id = v_orden_id AND producto_id = v_producto_fisico;
  SELECT id INTO v_detalle_servicio FROM public.orden_compra_detalles
  WHERE orden_id = v_orden_id AND producto_id = v_producto_servicio;
  SELECT id INTO v_detalle_no_stock FROM public.orden_compra_detalles
  WHERE orden_id = v_orden_id AND producto_id = v_producto_no_stock;

  v_result := public.crear_recepcion_tx(
    v_tenant_id,
    v_orden_id,
    jsonb_build_array(
      jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OK', 'almacen_id', v_almacen_id, 'lote', 'LOTE-A'
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id, 'lote', 'LOTE-B'
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_servicio, 'cantidad_recibida', 1,
        'calidad', 'OK', 'almacen_id', v_almacen_id
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_no_stock, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id
      )
    ),
    'Recepción mixta 444',
    v_user_id,
    'verify-444-create-main'
  );
  v_recepcion_id := (v_result->>'id')::uuid;

  IF v_recepcion_id IS NULL
     OR coalesce((v_result->>'idempotent')::boolean, true)
     OR jsonb_array_length(v_result->'items') <> 4
     OR NOT (v_result->>'numero' ~ '^REC-[0-9]{4}-[0-9]{4,}$')
     OR (SELECT count(*) FROM public.recepciones
         WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-444-create-main') <> 1
     OR (SELECT count(*) FROM public.recepcion_items
         WHERE tenant_id = v_tenant_id AND recepcion_id = v_recepcion_id) <> 4
     OR EXISTS (
       SELECT 1
       FROM public.recepcion_items
       WHERE tenant_id = v_tenant_id
         AND recepcion_id = v_recepcion_id
         AND producto_id IN (v_producto_servicio, v_producto_no_stock)
         AND (almacen_id IS NOT NULL OR ubicacion_id IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'La creación atómica devolvió un contrato incompleto: %', v_result;
  END IF;

  v_retry := public.crear_recepcion_tx(
    v_tenant_id,
    v_orden_id,
    jsonb_build_array(
      jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OK', 'almacen_id', v_almacen_id, 'lote', 'LOTE-A'
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id, 'lote', 'LOTE-B'
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_servicio, 'cantidad_recibida', 1,
        'calidad', 'OK', 'almacen_id', v_almacen_id
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_no_stock, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id
      )
    ),
    'Recepción mixta 444',
    v_user_id,
    'verify-444-create-main'
  );
  IF (v_retry->>'id')::uuid IS DISTINCT FROM v_recepcion_id
     OR NOT coalesce((v_retry->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'El retry de creación no reutilizó la recepción';
  END IF;

  BEGIN
    PERFORM public.crear_recepcion_tx(
      v_tenant_id, v_orden_id,
      jsonb_build_array(jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id
      )),
      'Payload distinto', v_user_id, 'verify-444-create-main'
    );
    RAISE EXCEPTION 'El payload distinto con igual clave debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El payload distinto con igual clave debió fallar' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%IDEMPOTENCY_PAYLOAD_MISMATCH%' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_count_before
  FROM public.recepciones WHERE tenant_id = v_tenant_id;
  BEGIN
    PERFORM public.crear_recepcion_tx(
      v_tenant_id, v_orden_id,
      jsonb_build_array(
        jsonb_build_object(
          'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
          'calidad', 'OK', 'almacen_id', v_almacen_id
        ),
        jsonb_build_object(
          'detalle_id', gen_random_uuid(), 'cantidad_recibida', 1,
          'calidad', 'OK', 'almacen_id', v_almacen_id
        )
      ),
      NULL, v_user_id, 'verify-444-invalid-detail'
    );
    RAISE EXCEPTION 'El detalle ajeno debió abortar toda la creación';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El detalle ajeno debió abortar toda la creación' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.recepciones WHERE tenant_id = v_tenant_id) <> v_count_before
     OR EXISTS (
       SELECT 1 FROM public.recepciones
       WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-444-invalid-detail'
     ) THEN
    RAISE EXCEPTION 'El fallo de item dejó una cabecera huérfana';
  END IF;

  -- El catálogo puede cambiar mientras la recepción sigue BORRADOR. El cierre
  -- y su outbox deben respetar la clasificación congelada en cada ítem.
  UPDATE public.productos
  SET es_servicio = false, tipo = 'PRODUCTO', controla_stock = true,
      updated_at = now()
  WHERE id IN (v_producto_servicio, v_producto_no_stock)
    AND tenant_id = v_tenant_id;

  v_result := public.cerrar_recepcion_tx(
    v_recepcion_id, v_tenant_id, v_user_id::text, 'Cierre mixto 444'
  );

  IF jsonb_array_length(v_result->'movimientos') <> 2
     OR (SELECT upper(estado::text) FROM public.recepciones WHERE id = v_recepcion_id) <> 'CERRADA'
     OR (SELECT upper(estado::text) FROM public.ordenes_compra WHERE id = v_orden_id) <> 'RECIBIDA'
     OR EXISTS (
       SELECT 1 FROM public.orden_compra_detalles
       WHERE orden_id = v_orden_id
         AND cantidad_recibida <> CASE WHEN producto_id = v_producto_fisico THEN 2 ELSE 1 END
     )
     OR (SELECT count(*) FROM public.movimientos_inventario mi
         WHERE mi.tenant_id = v_tenant_id
           AND app.to_uuid_or_null(mi.metadata->>'recepcion_id') = v_recepcion_id
           AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'ENTRADA') <> 2 THEN
    RAISE EXCEPTION 'El cierre mixto no separó cumplimiento de movimiento físico: %', v_result;
  END IF;

  SELECT payload INTO v_event
  FROM public.outbox_events
  WHERE tenant_id = v_tenant_id
    AND event_type = 'recepcion.registrada'
    AND aggregate_id = v_recepcion_id::text;

  IF v_event IS NULL
     OR (v_event->>'subtotalParcial')::numeric <> 230
     OR (v_event->>'mercaderiaParcial')::numeric <> 100
     OR (v_event->>'serviciosParcial')::numeric <> 100
     OR (v_event->>'noStockParcial')::numeric <> 30
     OR (v_event->>'igvParcial')::numeric <> 41.4
     OR jsonb_array_length(v_event->'items') <> 4
     OR (SELECT count(*) FROM jsonb_array_elements(v_event->'items') i
         WHERE i->>'clasificacionContable' = 'MERCADERIA'
           AND coalesce((i->>'controlaStock')::boolean, false)) <> 2
     OR (SELECT count(*) FROM jsonb_array_elements(v_event->'items') i
         WHERE i->>'clasificacionContable' = 'SERVICIO'
           AND coalesce((i->>'esServicio')::boolean, false)
           AND i->>'almacenId' IS NULL) <> 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_event->'items') i
         WHERE i->>'clasificacionContable' = 'GASTO_NO_STOCK'
           AND NOT coalesce((i->>'controlaStock')::boolean, true)
           AND i->>'almacenId' IS NULL) <> 1 THEN
    RAISE EXCEPTION 'El outbox no conservó la clasificación contable/física: %', v_event;
  END IF;

  v_retry := public.cerrar_recepcion_tx(
    v_recepcion_id, v_tenant_id, v_user_id::text, NULL
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id
           AND event_type = 'recepcion.registrada'
           AND aggregate_id = v_recepcion_id::text) <> 1
     OR (SELECT count(*) FROM public.movimientos_inventario mi
         WHERE mi.tenant_id = v_tenant_id
           AND app.to_uuid_or_null(mi.metadata->>'recepcion_id') = v_recepcion_id
           AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'ENTRADA') <> 2 THEN
    RAISE EXCEPTION 'El retry de cierre duplicó efectos';
  END IF;

  v_retry := public.crear_recepcion_tx(
    v_tenant_id,
    v_orden_id,
    jsonb_build_array(
      jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OK', 'almacen_id', v_almacen_id, 'lote', 'LOTE-A'
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_fisico, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id, 'lote', 'LOTE-B'
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_servicio, 'cantidad_recibida', 1,
        'calidad', 'OK', 'almacen_id', v_almacen_id
      ),
      jsonb_build_object(
        'detalle_id', v_detalle_no_stock, 'cantidad_recibida', 1,
        'calidad', 'OBSERVADO', 'almacen_id', v_almacen_id
      )
    ),
    'Recepción mixta 444',
    v_user_id,
    'verify-444-create-main'
  );
  IF upper(v_retry->>'estado') <> 'CERRADA'
     OR (v_retry->>'id')::uuid IS DISTINCT FROM v_recepcion_id THEN
    RAISE EXCEPTION 'El retry de creación posterior al cierre perdió identidad/estado';
  END IF;

  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total
  ) VALUES (
    v_tenant_id, 'OC-VERIFY-444-B', 'OC-VERIFY-444-B', v_proveedor_id,
    current_date, current_date, 'APROBADA', true, 'PEN', 10, 1.8, 11.8
  ) RETURNING id INTO v_orden_segunda;
  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES (
    v_tenant_id, v_orden_segunda, v_producto_fisico, 'Segundo producto 444',
    1, 0, 1, 10, 10
  ) RETURNING id INTO v_detalle_segunda;

  v_result := public.crear_recepcion_tx(
    v_tenant_id, v_orden_segunda,
    jsonb_build_array(jsonb_build_object(
      'detalle_id', v_detalle_segunda, 'cantidad_recibida', 1,
      'calidad', 'RECHAZADO'
    )),
    NULL, v_user_id, 'verify-444-create-second'
  );
  v_segunda_recepcion_id := (v_result->>'id')::uuid;
  IF v_segunda_recepcion_id IS NULL
     OR v_result->>'numero' = v_retry->>'numero'
     OR EXISTS (
       SELECT 1 FROM public.recepciones r
       WHERE r.tenant_id = v_tenant_id
       GROUP BY upper(btrim(r.numero)) HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'La numeración de recepción no quedó única';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.crear_recepcion_tx(uuid,uuid,jsonb,text,uuid,text)') IS NULL
     OR has_function_privilege('anon',
       'public.crear_recepcion_tx(uuid,uuid,jsonb,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.crear_recepcion_tx(uuid,uuid,jsonb,text,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.crear_recepcion_tx(uuid,uuid,jsonb,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.cerrar_recepcion_tx(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.cerrar_recepcion_tx(uuid,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.cerrar_recepcion_tx(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.guard_recepcion_identity_444()', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.enqueue_recepcion_cerrada_outbox_440()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Las RPC de recepción no conservan ACL service-only';
  END IF;
END;
$$;

ROLLBACK;
