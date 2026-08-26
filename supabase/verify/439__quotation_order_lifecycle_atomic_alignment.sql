\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 439 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_approver_id uuid;
  v_cliente_id uuid;
  v_producto_id uuid;
  v_almacen_id uuid;
  v_almacen_2 uuid;
  v_stock_reservado numeric;
  v_result jsonb;
  v_cotizacion_id uuid;
  v_pedido_id uuid;
  v_delete_id uuid;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD',
      project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true,
      configured_at = now(),
      updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY QUOTE 439', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;
  INSERT INTO public.usuarios (
    tenant_id, nombre, codigo, email, activo, estado
  ) VALUES (
    v_tenant_id, 'Aprobador Verify 439', 'APR-VERIFY-439',
    'aprobador-439@example.invalid', true, 'ACTIVO'
  ) RETURNING id INTO v_approver_id;
  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-439', 'Cliente Verify 439',
    'Cliente Verify 439', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-439', 'Almacén Verify 439',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-439-B', 'Almacén Verify 439 B',
    'ACTIVO', true, false, 'PE'
  ) RETURNING id INTO v_almacen_2;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-VERIFY-439',
      'nombre', 'Producto Verify 439',
      'categoria', 'VERIFICACION',
      'precio_venta', 25,
      'precio_compra', 10,
      'afectacion_igv', '10'
    ),
    v_almacen_id,
    10,
    0,
    '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;
  SELECT stock_reservado INTO v_stock_reservado
  FROM public.productos WHERE id = v_producto_id;

  IF v_cliente_id IS NULL OR v_producto_id IS NULL THEN
    RAISE EXCEPTION 'La demo no contiene cliente/producto para verificar cotizaciones';
  END IF;

  SELECT public.crear_cotizacion_tx(
    v_tenant_id,
    v_user_id,
    v_cliente_id,
    current_date + 10,
    'Cotización de verificación',
    'Verificador',
    'PEN',
    20,
    3.60,
    23.60,
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_id,
      'descripcion', 'Producto de verificación',
      'cantidad', 1,
      'precio_unitario', 20,
      'orden', 1
    ))
  ) INTO v_result;
  v_cotizacion_id := (v_result->'cotizacion'->>'id')::uuid;

  IF v_cotizacion_id IS NULL
     OR jsonb_array_length(v_result->'detalle') <> 1 THEN
    RAISE EXCEPTION 'La creación atómica no devolvió cabecera y detalle';
  END IF;
  IF (SELECT created_by FROM public.cotizaciones WHERE id = v_cotizacion_id)
     IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'La cotización no conservó al creador tenant';
  END IF;
  IF (SELECT fecha FROM public.cotizaciones WHERE id = v_cotizacion_id)
       <> app.hoy_tenant(v_tenant_id)
     OR (SELECT numero FROM public.cotizaciones WHERE id = v_cotizacion_id)
       NOT LIKE 'COT-' || to_char(app.hoy_tenant(v_tenant_id), 'YYYY') || '-%' THEN
    RAISE EXCEPTION 'La cotización no usa la fecha local del tenant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario
    WHERE tenant_id = v_tenant_id
      AND referencia_id = v_cotizacion_id
      AND upper(coalesce(referencia_tipo, '')) = 'COTIZACION'
  ) THEN
    RAISE EXCEPTION 'Una cotización nueva no debe reservar inventario';
  END IF;
  IF (SELECT stock_reservado FROM public.productos WHERE id = v_producto_id)
     IS DISTINCT FROM v_stock_reservado THEN
    RAISE EXCEPTION 'Crear cotización alteró stock_reservado';
  END IF;

  BEGIN
    PERFORM public.actualizar_cotizacion_tx(
      v_cotizacion_id, v_tenant_id, jsonb_build_object('estado', 'CONVERTIDA'), NULL
    );
    RAISE EXCEPTION 'El update genérico no debe poder simular una conversión';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El update genérico no debe poder simular una conversión' THEN RAISE; END IF;
  END;
  IF (SELECT upper(estado::text) FROM public.cotizaciones WHERE id = v_cotizacion_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'El intento de transición inválida alteró la cotización';
  END IF;

  -- Una reserva histórica podía estar repartida entre almacenes. La limpieza
  -- debe liberar ambos saldos sin depender de un almacén único implícito.
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant_id, p_producto_id := v_producto_id,
    p_almacen_id := v_almacen_2, p_tipo := 'ENTRADA', p_cantidad := 5,
    p_referencia_tipo := 'VERIFY_439', p_referencia_id := v_cotizacion_id
  );
  BEGIN
    PERFORM public.reservar_stock_en_almacen_tx(
      v_tenant_id, v_producto_id, v_almacen_id, 1,
      'COTIZACION', v_cotizacion_id::text, 'Reserva prohibida'
    );
    RAISE EXCEPTION 'El guard permanente debió rechazar una nueva reserva de cotización';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Las cotizaciones no pueden reservar inventario%' THEN RAISE; END IF;
  END;

  -- Sólo el verificador deshabilita el guard para caracterizar y reparar el
  -- histórico anterior a 439. El ROLLBACK final revierte también este DDL.
  ALTER TABLE public.movimientos_inventario
    DISABLE TRIGGER trg_prevent_cotizacion_reservation_439;
  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant_id, v_producto_id, v_almacen_id, 1,
    'COTIZACION', v_cotizacion_id::text, 'Reserva histórica A'
  );
  PERFORM public.reservar_stock_en_almacen_tx(
    v_tenant_id, v_producto_id, v_almacen_2, 1,
    'COTIZACION', v_cotizacion_id::text, 'Reserva histórica B'
  );
  ALTER TABLE public.movimientos_inventario
    ENABLE TRIGGER trg_prevent_cotizacion_reservation_439;
  PERFORM public.liberar_stock_cotizacion(v_cotizacion_id, v_tenant_id);
  IF EXISTS (
    SELECT 1
    FROM public.producto_existencias
    WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
      AND stock_reservado <> 0
  ) THEN
    RAISE EXCEPTION 'La limpieza multi-almacén dejó reservas históricas';
  END IF;

  PERFORM public.actualizar_cotizacion_tx(
    v_cotizacion_id,
    v_tenant_id,
    jsonb_build_object(
      'observaciones', 'Cotización editada',
      'subtotal', 25,
      'igv', 4.50,
      'total', 29.50
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_id,
      'descripcion', 'Producto editado',
      'cantidad', 1,
      'precio_unitario', 25,
      'orden', 1
    ))
  );

  IF (SELECT count(*) FROM public.cotizacion_detalles
      WHERE tenant_id = v_tenant_id AND cotizacion_id = v_cotizacion_id) <> 1
     OR (SELECT total FROM public.cotizaciones WHERE id = v_cotizacion_id) <> 29.50 THEN
    RAISE EXCEPTION 'La actualización atómica no dejó un documento coherente';
  END IF;

  -- La política vigente permite autoaprobar únicamente a ADMIN/ADMIN_DEMO con
  -- permiso explícito. Para conservar la prueba de segregación original, el
  -- autocreador de este caso es el actor operativo sin rol administrativo.
  UPDATE public.cotizaciones
  SET created_by = v_approver_id
  WHERE id = v_cotizacion_id AND tenant_id = v_tenant_id;
  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_id, v_tenant_id, 'APROBADA', v_approver_id, 'Autoaprobación'
    );
    RAISE EXCEPTION 'El creador no debe autoaprobar su cotización';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El creador no debe autoaprobar su cotización' THEN RAISE; END IF;
    IF SQLERRM <> 'La cotización requiere un aprobador distinto del creador' THEN
      RAISE EXCEPTION 'La segregación falló por una causa inesperada: %', SQLERRM;
    END IF;
  END;
  UPDATE public.cotizaciones
  SET created_by = v_user_id
  WHERE id = v_cotizacion_id AND tenant_id = v_tenant_id;
  PERFORM public.cambiar_estado_cotizacion_tx(
    v_cotizacion_id, v_tenant_id, 'ENVIADA', v_user_id, NULL
  );
  PERFORM public.cambiar_estado_cotizacion_tx(
    v_cotizacion_id, v_tenant_id, 'APROBADA', v_approver_id, 'Precios aprobados'
  );
  IF (SELECT aprobado_por FROM public.cotizaciones WHERE id = v_cotizacion_id)
     IS DISTINCT FROM v_approver_id THEN
    RAISE EXCEPTION 'La aprobación segregada no conservó al actor';
  END IF;

  SELECT public.convertir_cotizacion_a_pedido(
    v_cotizacion_id, v_tenant_id, v_user_id, NULL
  ) INTO v_result;
  v_pedido_id := (v_result->>'pedido_id')::uuid;

  IF v_pedido_id IS NULL
     OR (SELECT upper(estado::text) FROM public.cotizaciones WHERE id = v_cotizacion_id) <> 'CONVERTIDA'
     OR (SELECT upper(estado::text) FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'PENDIENTE'
     OR (SELECT moneda FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'PEN' THEN
    RAISE EXCEPTION 'La conversión atómica no preservó estado o moneda';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario
    WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
      AND upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA'
  ) THEN
    RAISE EXCEPTION 'Convertir a pedido no debe reservar antes de confirmarlo';
  END IF;

  PERFORM public.reservar_pedido_stock_tx(v_pedido_id, v_tenant_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.movimientos_inventario
    WHERE tenant_id = v_tenant_id AND referencia_id = v_pedido_id
      AND upper(coalesce(referencia_tipo, '')) = 'PEDIDO'
      AND upper(coalesce(tipo, tipo_movimiento, '')) = 'RESERVA'
  ) THEN
    RAISE EXCEPTION 'Confirmar el pedido no generó la reserva esperada';
  END IF;

  SELECT public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, NULL, NULL, 'Verificador', 'PEN',
    10, 1.80, 11.80,
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_id,
      'descripcion', 'Cotización a eliminar',
      'cantidad', 1,
      'precio_unitario', 10,
      'orden', 1
    ))
  ) INTO v_result;
  v_delete_id := (v_result->'cotizacion'->>'id')::uuid;
  PERFORM public.eliminar_cotizacion_tx(v_delete_id, v_tenant_id);

  IF EXISTS (SELECT 1 FROM public.cotizaciones WHERE id = v_delete_id)
     OR EXISTS (SELECT 1 FROM public.cotizacion_detalles WHERE cotizacion_id = v_delete_id) THEN
    RAISE EXCEPTION 'La eliminación atómica dejó registros parciales';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('service_role', 'app.tasa_impuesto_tenant(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.crear_cotizacion_tx(uuid,uuid,uuid,date,text,text,text,numeric,numeric,numeric,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_439_ACL_INTERNA_INCORRECTA';
  END IF;
END;
$$;

ROLLBACK;
