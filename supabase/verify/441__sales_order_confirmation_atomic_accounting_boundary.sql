\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 441 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_approver_id uuid;
  v_cliente_id uuid;
  v_almacen_id uuid;
  v_producto_1 uuid;
  v_producto_2 uuid;
  v_servicio_id uuid;
  v_pedido_id uuid;
  v_pedido_fallido uuid;
  v_pedido_servicio uuid;
  v_result jsonb;
  v_politica jsonb;
  v_net numeric;
  v_numero text;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY ORDER 441', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;
  INSERT INTO public.usuarios (
    tenant_id, nombre, codigo, email, activo, estado
  ) VALUES (
    v_tenant_id, 'Aprobador Verify 441', 'APR-VERIFY-441',
    'aprobador-441@example.invalid', true, 'ACTIVO'
  ) RETURNING id INTO v_approver_id;

  UPDATE public.empresa_config
  SET usar_flujo_logistica = false,
      monto_maximo_sin_aprobacion = 100,
      aplicar_limite_credito = false
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-441', 'Cliente Verify 441',
    'Cliente Verify 441', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-441', 'Almacén Verify 441',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-441-A', 'nombre', 'Producto 441 A',
      'categoria', 'VERIFICACION', 'precio_venta', 25,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen_id, 10, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_1;
  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-441-B', 'nombre', 'Producto 441 B',
      'categoria', 'VERIFICACION', 'precio_venta', 30,
      'precio_compra', 12, 'afectacion_igv', '10'
    ),
    v_almacen_id, 10, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_2;

  INSERT INTO public.productos (
    tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock,
    precio_venta, precio_compra, afectacion_igv, stock, stock_actual, stock_reservado
  ) VALUES (
    v_tenant_id, 'SERV-441', 'Servicio 441', 'ACTIVO', true, true, false,
    40, 0, '10', 0, 0, 0
  ) RETURNING id INTO v_servicio_id;

  -- El correlativo no puede truncarse al superar cuatro dígitos.
  INSERT INTO public.pedidos_venta (
    tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
    subtotal, igv, total, moneda, created_by
  ) VALUES (
    v_tenant_id, v_cliente_id,
    'PV-' || to_char(app.hoy_tenant(v_tenant_id), 'YYYY') || '-9999',
    app.hoy_tenant(v_tenant_id), app.hoy_tenant(v_tenant_id), 'PENDIENTE',
    1, 0.18, 1.18, 'PEN', v_user_id
  );

  SELECT public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
      'created_by', v_user_id, 'moneda', 'PEN',
      'observaciones', 'Pedido verify 441'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_1, 'descripcion', 'Producto A',
        'cantidad', 2, 'precio_unitario', 25
      ),
      jsonb_build_object(
        'producto_id', v_producto_2, 'descripcion', 'Producto B',
        'cantidad', 3, 'precio_unitario', 30
      )
    )
  ) INTO v_result;
  v_pedido_id := (v_result->>'pedido_id')::uuid;
  SELECT numero INTO v_numero FROM public.pedidos_venta WHERE id = v_pedido_id;
  IF v_numero <> 'PV-' || to_char(app.hoy_tenant(v_tenant_id), 'YYYY') || '-10000'
     OR (SELECT created_by FROM public.pedidos_venta WHERE id = v_pedido_id)
       IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Alta directa perdió correlativo de cinco dígitos o creador: %', v_numero;
  END IF;

  BEGIN
    PERFORM public.crear_pedido_completo(
      jsonb_build_object(
        'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
        'created_by', v_user_id, 'cotizacion_id', gen_random_uuid()
      ),
      jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto_1, 'cantidad', 1, 'precio_unitario', 1
      ))
    );
    RAISE EXCEPTION 'El alta directa no debe enlazar una cotización';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El alta directa no debe enlazar una cotización' THEN RAISE; END IF;
  END;

  -- Simula una reserva parcial histórica que la confirmación debe reconciliar.
  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant_id, v_producto_1, v_almacen_id, 1,
    'PEDIDO', v_pedido_id::text, 'Reserva parcial histórica'
  );

  SELECT public.evaluar_politica_pedido_441(v_pedido_id, v_tenant_id)
    INTO v_politica;
  IF NOT (v_politica->>'requiere_aprobacion')::boolean
     OR v_politica->>'estado_credito' <> 'REVISION'
     OR length(v_politica->>'pedido_fingerprint') <> 64 THEN
    RAISE EXCEPTION 'La política DB no detectó el umbral de aprobación: %', v_politica;
  END IF;

  PERFORM public.solicitar_aprobacion_pedido_tx(
    v_pedido_id, v_tenant_id,
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_politica->'motivos')), '; '),
    v_politica->>'estado_credito'
  );
  BEGIN
    PERFORM public.decidir_aprobacion_pedido_tx(
      v_pedido_id, v_tenant_id, 'APROBADO', 'Autoaprobación',
      v_user_id, NULL
    );
    RAISE EXCEPTION 'El creador no debe autoaprobar su pedido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El creador no debe autoaprobar su pedido' THEN RAISE; END IF;
  END;
  PERFORM public.decidir_aprobacion_pedido_tx(
    v_pedido_id, v_tenant_id, 'APROBADO', 'Monto revisado',
    v_approver_id, 'Aprobación segregada'
  );

  SELECT public.confirmar_pedido_tx(
    v_pedido_id, v_tenant_id, 'IGNORADO', 'LISTO_FACTURAR',
    false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
  ) INTO v_result;
  IF v_result->>'estado' <> 'LISTO_FACTURAR'
     OR v_result->>'estado_credito' <> 'APROBADO'
     OR (SELECT estado_credito FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'APROBADO'
     OR NOT EXISTS (
       SELECT 1 FROM public.pedido_aprobaciones
       WHERE tenant_id = v_tenant_id AND pedido_id = v_pedido_id
         AND decision = 'APROBADO' AND aprobado_por = v_approver_id::text
     ) THEN
    RAISE EXCEPTION 'Confirmación/aprobación segregada no quedó consistente';
  END IF;
  IF (SELECT confirmado_por FROM public.pedidos_venta WHERE id = v_pedido_id)
       IS DISTINCT FROM v_user_id
     OR (SELECT confirmado_en FROM public.pedidos_venta WHERE id = v_pedido_id) IS NULL THEN
    RAISE EXCEPTION 'La confirmación no conservó actor/fecha atómicos';
  END IF;

  SELECT public.confirmar_pedido_tx(
    v_pedido_id, v_tenant_id, 'IGNORADO', 'LISTO_FACTURAR',
    false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
  ) INTO v_result;
  IF NOT coalesce((v_result->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'El retry de confirmación no devolvió el resultado durable';
  END IF;

  SELECT coalesce(sum(CASE
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA' THEN cantidad
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'LIBERACION' THEN -cantidad
    ELSE 0 END), 0)
  INTO v_net
  FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
    AND producto_id = v_producto_1;
  IF v_net <> 2 THEN
    RAISE EXCEPTION 'La reserva parcial del producto A no se reparó: %', v_net;
  END IF;
  SELECT coalesce(sum(CASE
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA' THEN cantidad
    WHEN upper(coalesce(tipo, tipo_movimiento, '')) = 'LIBERACION' THEN -cantidad
    ELSE 0 END), 0)
  INTO v_net
  FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
    AND producto_id = v_producto_2;
  IF v_net <> 3 THEN
    RAISE EXCEPTION 'La confirmación no reservó todo el producto B: %', v_net;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE tenant_id = v_tenant_id AND aggregate_id = v_pedido_id::text
      AND event_type = 'venta.procesada'
  ) THEN
    RAISE EXCEPTION 'Confirmar pedido no debe reconocer venta antes de facturar';
  END IF;

  -- Sin política de aprobación, el stock insuficiente debe revertir todo.
  UPDATE public.empresa_config
  SET monto_maximo_sin_aprobacion = 0, aplicar_limite_credito = false
  WHERE tenant_id = v_tenant_id;
  SELECT public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
      'created_by', v_user_id, 'moneda', 'PEN'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_2, 'descripcion', 'Sin stock',
      'cantidad', 999, 'precio_unitario', 10
    ))
  ) INTO v_result;
  v_pedido_fallido := (v_result->>'pedido_id')::uuid;
  SELECT public.evaluar_politica_pedido_441(v_pedido_fallido, v_tenant_id)
    INTO v_politica;
  BEGIN
    PERFORM public.confirmar_pedido_tx(
      v_pedido_fallido, v_tenant_id, 'OK', 'LISTO_FACTURAR',
      false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
    );
    RAISE EXCEPTION 'La confirmación sin stock debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La confirmación sin stock debió fallar' THEN RAISE; END IF;
  END;
  IF (SELECT upper(estado::text) FROM public.pedidos_venta WHERE id = v_pedido_fallido) <> 'PENDIENTE'
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_fallido
         AND upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA'
     ) THEN
    RAISE EXCEPTION 'El fallo de reserva dejó efectos parciales';
  END IF;

  -- Un pedido sólo de servicios confirma/factura sin tocar inventario.
  SELECT public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
      'created_by', v_user_id, 'moneda', 'PEN'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_servicio_id, 'descripcion', 'Servicio profesional',
      'cantidad', 1.5, 'precio_unitario', 40
    ))
  ) INTO v_result;
  v_pedido_servicio := (v_result->>'pedido_id')::uuid;
  SELECT public.evaluar_politica_pedido_441(v_pedido_servicio, v_tenant_id)
    INTO v_politica;
  SELECT public.confirmar_pedido_tx(
    v_pedido_servicio, v_tenant_id, 'OK', 'LISTO_FACTURAR',
    false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
  ) INTO v_result;
  IF v_result->>'estado' <> 'LISTO_FACTURAR'
     OR NOT coalesce((v_result->'reserva'->>'skipped')::boolean, false)
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_servicio
     ) THEN
    RAISE EXCEPTION 'El pedido sólo-servicio intentó mover inventario: %', v_result;
  END IF;

  -- Un fingerprint evaluado no puede confirmar contenido editado después.
  SELECT public.crear_pedido_completo(
    jsonb_build_object(
      'tenant_id', v_tenant_id, 'cliente_id', v_cliente_id,
      'created_by', v_user_id, 'moneda', 'PEN'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_1, 'cantidad', 1, 'precio_unitario', 10
    ))
  ) INTO v_result;
  v_pedido_fallido := (v_result->>'pedido_id')::uuid;
  SELECT public.evaluar_politica_pedido_441(v_pedido_fallido, v_tenant_id)
    INTO v_politica;
  PERFORM public.actualizar_pedido_venta_tx(
    v_pedido_fallido, v_tenant_id, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_1, 'cantidad', 2, 'precio_unitario', 10
    ))
  );
  BEGIN
    PERFORM public.confirmar_pedido_tx(
      v_pedido_fallido, v_tenant_id, 'OK', 'LISTO_FACTURAR',
      false, false, NULL, NULL, v_politica->>'pedido_fingerprint', v_user_id
    );
    RAISE EXCEPTION 'El fingerprint obsoleto debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El fingerprint obsoleto debió fallar' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('service_role',
       'app.pedido_venta_fingerprint_441(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.enforce_pedido_aprobacion_441()', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.confirmar_pedido_tx(uuid,uuid,text,text,boolean,boolean,uuid,text,text,uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_441_ACL_INTERNA_INCORRECTA';
  END IF;
END;
$$;

ROLLBACK;
