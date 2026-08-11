\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 446 sólo puede ejecutarse en la base efímera erp_e2e';
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
  v_producto_2 uuid;
  v_servicio_id uuid;
  v_pedido_id uuid;
  v_pedido_fallido uuid;
  v_detalle_1 uuid;
  v_detalle_2 uuid;
  v_detalle_servicio uuid;
  v_fallo_detalle_1 uuid;
  v_fallo_detalle_2 uuid;
  v_result jsonb;
  v_cpe jsonb;
  v_documento jsonb;
  v_detalles jsonb;
  v_cxc jsonb;
  v_event_id uuid := gen_random_uuid();
  v_reservado_primero uuid;
  v_sin_reserva_segundo uuid;
  v_reservado_detalle uuid;
  v_sin_reserva_detalle uuid;
  v_stock_antes numeric;
  v_reserva_antes numeric;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY INVOICE ORDER 446', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;
  UPDATE public.empresa_config
  SET usar_flujo_logistica = false
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-446', 'Cliente Verify 446',
    'Cliente Verify 446', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-446', 'Almacén Verify 446',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-446-A', 'nombre', 'Producto 446 A',
      'categoria', 'VERIFICACION', 'precio_venta', 100,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen_id, 10, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-446-B', 'nombre', 'Producto 446 B',
      'categoria', 'VERIFICACION', 'precio_venta', 10,
      'precio_compra', 4, 'afectacion_igv', '10'
    ),
    v_almacen_id, 5, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_2;

  INSERT INTO public.productos (
    tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock,
    precio_venta, precio_compra, afectacion_igv, stock, stock_actual, stock_reservado
  ) VALUES (
    v_tenant_id, 'SERV-446', 'Servicio 446', 'ACTIVO', true, true, false,
    50, 0, '10', 0, 0, 0
  ) RETURNING id INTO v_servicio_id;

  INSERT INTO public.pedidos_venta (
    tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
    subtotal, igv, total, moneda, created_by
  ) VALUES (
    v_tenant_id, v_cliente_id, 'PV-VERIFY-446-1',
    app.hoy_tenant(v_tenant_id), app.hoy_tenant(v_tenant_id), 'LISTO_FACTURAR',
    350, 63, 413, 'PEN', v_user_id
  ) RETURNING id INTO v_pedido_id;

  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada, cantidad_facturada
  ) VALUES (
    v_tenant_id, v_pedido_id, v_producto_id, 'Producto A línea 1', 1,
    100, 100, 'PENDIENTE', 0, 0
  ) RETURNING id INTO v_detalle_1;
  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada, cantidad_facturada
  ) VALUES (
    v_tenant_id, v_pedido_id, v_producto_id, 'Producto A línea 2', 2,
    100, 200, 'PENDIENTE', 0, 0
  ) RETURNING id INTO v_detalle_2;
  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada, cantidad_facturada
  ) VALUES (
    v_tenant_id, v_pedido_id, v_servicio_id, 'Servicio', 1,
    50, 50, 'PENDIENTE', 0, 0
  ) RETURNING id INTO v_detalle_servicio;

  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant_id, v_producto_id, v_almacen_id, 3,
    'PEDIDO', v_pedido_id::text, 'Reserva verify 446'
  );

  v_detalles := jsonb_build_array(
    jsonb_build_object(
      'orden', 1, 'pedido_detalle_id', v_detalle_1, 'producto_id', v_producto_id,
      'codigo_producto', 'PROD-446-A', 'descripcion', 'Producto A línea 1',
      'unidad_medida', 'NIU', 'cantidad', 1, 'precio_unitario', 100,
      'descuento_unitario', 0, 'valor_venta', 100,
      'impuesto_igv', 18, 'impuesto_isc', 0, 'total_item', 118,
      'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'orden', 2, 'pedido_detalle_id', v_detalle_2, 'producto_id', v_producto_id,
      'codigo_producto', 'PROD-446-A', 'descripcion', 'Producto A línea 2',
      'unidad_medida', 'NIU', 'cantidad', 2, 'precio_unitario', 100,
      'descuento_unitario', 0, 'valor_venta', 200,
      'impuesto_igv', 36, 'impuesto_isc', 0, 'total_item', 236,
      'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'orden', 3, 'pedido_detalle_id', v_detalle_servicio, 'producto_id', v_servicio_id,
      'codigo_producto', 'SERV-446', 'descripcion', 'Servicio',
      'unidad_medida', 'ZZ', 'cantidad', 1, 'precio_unitario', 50,
      'descuento_unitario', 0, 'valor_venta', 50,
      'impuesto_igv', 9, 'impuesto_isc', 0, 'total_item', 59,
      'afectacion_igv', '10'
    )
  );
  v_cpe := jsonb_build_object(
    'tipo_documento', '01', 'serie', 'F446', 'numero', 1,
    'ruc_emisor', '20600000013', 'razon_social_emisor', 'Empresa Verify 446',
    'direccion_emisor', 'Lima', 'tipo_documento_receptor', '6',
    'documento_receptor', '20123456786',
    'razon_social_receptor', 'Cliente Verify 446',
    'direccion_receptor', 'Lima', 'cliente_id', v_cliente_id,
    'moneda', 'PEN', 'total_gravadas', 350, 'total_exoneradas', 0,
    'total_inafectas', 0, 'total_exportacion', 0,
    'total_igv', 63, 'total_venta', 413,
    'items', v_detalles, 'fecha_emision', '2026-08-09T10:00:00-05:00',
    'fecha_vencimiento', '2026-09-08', 'estado', 'FIRMADO',
    'sunat_status', 'READY', 'xml_firmado', '<Invoice>signed-446</Invoice>',
    'hash', 'hash-446', 'hash_firma', 'hash-446', 'created_by', v_user_id
  );
  v_documento := jsonb_build_object(
    'pedido_id', v_pedido_id, 'subtotal', 350, 'impuesto_igv', 63,
    'impuesto_isc', 0, 'total', 413, 'tipo_cambio', 1
  );
  v_cxc := jsonb_build_object(
    'cliente_id', v_cliente_id, 'monto_total', 413, 'monto_pendiente', 413,
    'retencion_total', 0, 'percepcion_total', 0,
    'detraccion_total', 0, 'anticipo_total', 0
  );

  SELECT public.facturar_pedido_venta_tx(
    v_pedido_id, v_tenant_id, v_user_id, v_cpe, v_documento,
    v_detalles, v_cxc, v_event_id, 'verify-446-order-invoice'
  ) INTO v_result;

  IF v_result->>'pedido_estado' <> 'FACTURADO'
     OR (SELECT estado::text FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'FACTURADO'
     OR (SELECT factura_id FROM public.pedidos_venta WHERE id = v_pedido_id)
        IS DISTINCT FROM (v_result->>'cpe_id')::uuid
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 7
     OR (SELECT stock_reservado FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 0
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
           AND producto_id = v_producto_id AND tipo = 'SALIDA'
           AND referencia_tipo = 'PEDIDO_FACTURA_446') <> 1
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
         AND producto_id = v_servicio_id
     )
     OR EXISTS (
       SELECT 1 FROM public.pedidos_venta_detalle
       WHERE pedido_id = v_pedido_id
         AND (cantidad_facturada <> cantidad OR estado_item::text <> 'FACTURADO')
     )
     OR (SELECT (payload->>'costoVentas')::numeric FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'factura.emitida'
           AND idempotency_key = 'verify-446-order-invoice') <> 30
     OR NOT EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar
       WHERE tenant_id = v_tenant_id
         AND documento_id = (v_result->>'documento_id')::uuid
     ) THEN
    RAISE EXCEPTION 'La factura de pedido no cerró stock/detalle/CPE/CxC/outbox: %', v_result;
  END IF;

  -- Retry exacto no vuelve a sacar stock ni crea proyecciones.
  SELECT public.facturar_pedido_venta_tx(
    v_pedido_id, v_tenant_id, v_user_id, v_cpe, v_documento,
    v_detalles, v_cxc, gen_random_uuid(), 'verify-446-order-invoice'
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 7
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
           AND tipo = 'SALIDA') <> 1 THEN
    RAISE EXCEPTION 'El retry de factura volvió a mutar stock: %', v_result;
  END IF;

  -- El producto con UUID menor se procesa primero. Se reserva sólo ese y se
  -- deja el segundo sin reserva para forzar un fallo después de la primera
  -- salida; la subtransacción debe revertir también esa salida y el CPE.
  IF v_producto_id::text < v_producto_2::text THEN
    v_reservado_primero := v_producto_id;
    v_sin_reserva_segundo := v_producto_2;
  ELSE
    v_reservado_primero := v_producto_2;
    v_sin_reserva_segundo := v_producto_id;
  END IF;

  INSERT INTO public.pedidos_venta (
    tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
    subtotal, igv, total, moneda, created_by
  ) VALUES (
    v_tenant_id, v_cliente_id, 'PV-VERIFY-446-ROLLBACK',
    app.hoy_tenant(v_tenant_id), app.hoy_tenant(v_tenant_id), 'LISTO_FACTURAR',
    20, 3.60, 23.60, 'PEN', v_user_id
  ) RETURNING id INTO v_pedido_fallido;
  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada, cantidad_facturada
  ) VALUES (
    v_tenant_id, v_pedido_fallido, v_reservado_primero, 'Primero reservado', 1,
    10, 10, 'PENDIENTE', 0, 0
  ) RETURNING id INTO v_reservado_detalle;
  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada, cantidad_facturada
  ) VALUES (
    v_tenant_id, v_pedido_fallido, v_sin_reserva_segundo, 'Segundo sin reserva', 1,
    10, 10, 'PENDIENTE', 0, 0
  ) RETURNING id INTO v_sin_reserva_detalle;
  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant_id, v_reservado_primero, v_almacen_id, 1,
    'PEDIDO', v_pedido_fallido::text, 'Reserva rollback 446'
  );
  SELECT stock_actual, stock_reservado INTO v_stock_antes, v_reserva_antes
  FROM public.producto_existencias
  WHERE tenant_id = v_tenant_id AND producto_id = v_reservado_primero
    AND almacen_id = v_almacen_id;

  v_detalles := jsonb_build_array(
    jsonb_build_object(
      'orden', 1, 'pedido_detalle_id', v_reservado_detalle,
      'producto_id', v_reservado_primero, 'codigo_producto', 'FIRST',
      'descripcion', 'Primero reservado', 'unidad_medida', 'NIU',
      'cantidad', 1, 'precio_unitario', 10, 'descuento_unitario', 0,
      'valor_venta', 10, 'impuesto_igv', 1.80, 'impuesto_isc', 0,
      'total_item', 11.80, 'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'orden', 2, 'pedido_detalle_id', v_sin_reserva_detalle,
      'producto_id', v_sin_reserva_segundo, 'codigo_producto', 'SECOND',
      'descripcion', 'Segundo sin reserva', 'unidad_medida', 'NIU',
      'cantidad', 1, 'precio_unitario', 10, 'descuento_unitario', 0,
      'valor_venta', 10, 'impuesto_igv', 1.80, 'impuesto_isc', 0,
      'total_item', 11.80, 'afectacion_igv', '10'
    )
  );
  BEGIN
    PERFORM public.facturar_pedido_venta_tx(
      v_pedido_fallido, v_tenant_id, v_user_id,
      v_cpe || jsonb_build_object(
        'serie', 'F446', 'numero', 2, 'total_gravadas', 20,
        'total_igv', 3.60, 'total_venta', 23.60, 'items', v_detalles,
        'hash', 'hash-446-rollback', 'hash_firma', 'hash-446-rollback',
        'xml_firmado', '<Invoice>rollback-446</Invoice>'
      ),
      jsonb_build_object(
        'pedido_id', v_pedido_fallido, 'subtotal', 20,
        'impuesto_igv', 3.60, 'impuesto_isc', 0, 'total', 23.60,
        'tipo_cambio', 1
      ),
      v_detalles,
      jsonb_build_object(
        'cliente_id', v_cliente_id, 'monto_total', 23.60,
        'monto_pendiente', 23.60, 'retencion_total', 0,
        'percepcion_total', 0, 'detraccion_total', 0, 'anticipo_total', 0
      ),
      gen_random_uuid(), 'verify-446-rollback'
    );
    RAISE EXCEPTION 'La falta de reserva del segundo producto debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La falta de reserva del segundo producto debió fallar' THEN RAISE; END IF;
  END;
  IF (SELECT stock_actual FROM public.producto_existencias
      WHERE tenant_id = v_tenant_id AND producto_id = v_reservado_primero
        AND almacen_id = v_almacen_id) IS DISTINCT FROM v_stock_antes
     OR (SELECT stock_reservado FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_reservado_primero
           AND almacen_id = v_almacen_id) IS DISTINCT FROM v_reserva_antes
     OR EXISTS (
       SELECT 1 FROM public.cpe
       WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-446-rollback'
     )
     OR (SELECT estado::text FROM public.pedidos_venta WHERE id = v_pedido_fallido)
        <> 'LISTO_FACTURAR' THEN
    RAISE EXCEPTION 'El fallo intermedio dejó stock/CPE/pedido parcial';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.facturar_pedido_venta_tx(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.facturar_pedido_venta_tx(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'La superficie 446 no es service-role-only';
  END IF;
END;
$$;

ROLLBACK;
