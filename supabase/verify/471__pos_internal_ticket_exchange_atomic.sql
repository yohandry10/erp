\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_ticket_471') THEN
    RAISE EXCEPTION 'VERIFY_471_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_471_REQUIERE_POSTGRESQL_16';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localposverifyxxxxxx',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $verify$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_peer_actor uuid := gen_random_uuid();
  v_other_tenant uuid;
  v_other_actor uuid;
  v_cliente uuid;
  v_otro_cliente uuid;
  v_almacen uuid;
  v_caja uuid;
  v_sesion uuid;
  v_producto uuid;
  v_result jsonb;
  v_retry jsonb;
  v_canje jsonb;
  v_request jsonb;
  v_venta uuid;
  v_venta_boleta uuid;
  v_venta_pura uuid;
  v_ticket_documento uuid;
  v_documento_fiscal uuid;
  v_cpe_invoice uuid;
  v_cpe_boleta uuid;
  v_cxc uuid;
  v_cxc_snapshot jsonb;
  v_stock numeric;
  v_count bigint;
  v_cash_count bigint;
  v_cash_amount numeric;
  v_payment_count bigint;
  v_accounting_count bigint;
  v_commission_count bigint;
  v_commission_amount numeric;
  v_fiscal_before integer;
  v_fiscal_after integer;
  v_close jsonb;
BEGIN
  SELECT public.create_demo_tenant('VERIFY POS TICKET 471', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY POS TICKET FOREIGN 471', 1, 'PE') INTO v_other_demo;
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  v_other_actor := (v_other_demo->>'user_id')::uuid;

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, nombre, activo, estado
  ) VALUES (
    v_peer_actor, v_tenant,
    'peer-' || v_peer_actor::text || '@verify-471.local',
    'Actor alterno verify 471', true, 'ACTIVO'
  );

  UPDATE public.empresa_config
  SET ruc = '20600000471',
      razon_social = 'Empresa verify POS Ticket 471',
      direccion_fiscal = 'Lima',
      pais = 'PE',
      moneda_defecto = 'PEN',
      igv_porcentaje = 18,
      serie_factura = 'F001',
      serie_boleta = 'B001',
      requiere_aprobacion_descuento = false,
      aplicar_limite_credito = true,
      dias_vencimiento_factura = 30
  WHERE tenant_id = v_tenant;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc,
    estado, activo, limite_credito, permite_morosidad
  ) VALUES (
    v_tenant, 'CLI-471', 'Cliente factura 471', 'Cliente factura 471 S.A.C.',
    'RUC', '20100070970', 'ACTIVO', true, 5000, false
  ) RETURNING id INTO v_cliente;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc,
    estado, activo, limite_credito, permite_morosidad
  ) VALUES (
    v_tenant, 'CLI-471-OTRO', 'Otro cliente 471', 'Otro cliente 471 S.A.C.',
    'RUC', '20100066603', 'ACTIVO', true, 5000, false
  ) RETURNING id INTO v_otro_cliente;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-471', 'Almacén POS Ticket 471', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen;

  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant, 'CAJA-471', 'Caja POS Ticket 471', 'ACTIVO', v_almacen,
    'MOSTRADOR', v_actor
  ) RETURNING id INTO v_caja;

  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'PROD-471',
    'nombre', 'Producto físico POS Ticket 471',
    'categoria', 'VERIFY',
    'marca', 'MARCA-471',
    'precio_venta', 100,
    'precio_compra', 40,
    'afectacion_igv', '10',
    'es_servicio', false,
    'controla_stock', true
  ), v_almacen, 20, 0, '[]'::jsonb)->>'id')::uuid INTO v_producto;

  PERFORM public.registrar_regla_comision_venta_tx(
    v_tenant, v_actor, 'verify-471-commission', jsonb_build_object(
      'codigo', 'COM-PROD-471',
      'nombre', 'Comisión POS Ticket 471',
      'vendedor_id', v_actor,
      'producto_id', v_producto,
      'porcentaje', 10,
      'prioridad', 100,
      'vigencia_desde', app.hoy_tenant(v_tenant) - 1
    )
  );

  SELECT public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor,
    'monto_inicio', 100,
    'moneda', 'PEN',
    'dispositivo', 'TERM-471'
  )) INTO v_result;
  v_sesion := (v_result->>'id')::uuid;

  SELECT coalesce(max(correlativo_actual), 0) INTO v_fiscal_before
  FROM public.documento_series
  WHERE tenant_id = v_tenant AND tipo_documento = '01' AND serie = 'F001';

  v_request := jsonb_build_object(
    'cliente_id', v_cliente,
    'cliente_documento', '20100070970',
    'cliente_tipo_documento', '6',
    'cliente_nombre', 'Cliente factura 471',
    'cliente_direccion', 'Lima',
    'moneda', 'PEN',
    'ticket_serie', 'T001',
    'emitir_cpe', false,
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto,
      'cantidad', 1,
      'precio_unitario', 100,
      'descuento_monto', 0,
      'subtotal', 100,
      'igv', 18
    )),
    'pagos', jsonb_build_array(
      jsonb_build_object('codigo', 'efectivo', 'monto', 50, 'moneda', 'PEN'),
      jsonb_build_object('codigo', 'credito', 'monto', 68, 'moneda', 'PEN')
    )
  );

  SELECT public.pos_registrar_venta_comercial_tx(
    v_tenant, v_actor, v_sesion, 'verify:pos:ticket:471', v_request
  ) INTO v_result;
  v_venta := (v_result->>'venta_id')::uuid;
  v_ticket_documento := (v_result->>'ticket_documento_id')::uuid;
  v_cxc := (v_result->>'cuenta_por_cobrar_id')::uuid;

  IF v_venta IS NULL OR v_ticket_documento IS NULL OR v_cxc IS NULL
     OR v_result->>'numero_ticket' !~ '^T001-[0-9]{8}$'
     OR v_result->>'tipo_emision' <> 'TICKET'
     OR coalesce((v_result->>'canjeable')::boolean, false) IS NOT TRUE
     OR coalesce((v_result->>'cpe_pendiente')::boolean, true)
     OR v_result->>'cpe_id' IS NOT NULL
     OR (v_result->>'total')::numeric <> 118
     OR (v_result->>'credito_monto')::numeric <> 68 THEN
    RAISE EXCEPTION 'VERIFY_471_TICKET_RESULT_INVALID:%', v_result;
  END IF;

  SELECT coalesce(max(correlativo_actual), 0) INTO v_fiscal_after
  FROM public.documento_series
  WHERE tenant_id = v_tenant AND tipo_documento = '01' AND serie = 'F001';
  IF v_fiscal_after <> v_fiscal_before
     OR (SELECT tipo_documento FROM public.documentos WHERE id = v_ticket_documento) <> 'TICKET'
     OR (SELECT documento_id FROM public.ventas_pos WHERE id = v_venta)
        IS DISTINCT FROM v_ticket_documento
     OR (SELECT cpe_data FROM public.ventas_pos WHERE id = v_venta) IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.documentos d
       WHERE d.tenant_id = v_tenant
         AND d.metadata->>'venta_pos_id' = v_venta::text
         AND d.tipo_documento IN ('FACTURA', 'BOLETA')
     ) THEN
    RAISE EXCEPTION 'VERIFY_471_TICKET_BURNED_FISCAL_DOCUMENT_OR_NUMBER';
  END IF;

  SELECT stock_actual INTO v_stock
  FROM public.producto_existencias
  WHERE tenant_id = v_tenant AND producto_id = v_producto AND almacen_id = v_almacen;
  SELECT count(*), coalesce(sum(monto), 0) INTO v_cash_count, v_cash_amount
  FROM public.movimientos_caja
  WHERE tenant_id = v_tenant AND referencia_tipo = 'venta_pos'
    AND referencia_documento = v_venta::text;
  SELECT count(*) INTO v_payment_count FROM public.ventas_pos_pagos
  WHERE tenant_id = v_tenant AND venta_pos_id = v_venta;
  SELECT count(*) INTO v_accounting_count FROM public.outbox_events
  WHERE tenant_id = v_tenant AND aggregate_id = v_venta::text
    AND event_type = 'pos.venta.registrada';
  SELECT count(*), coalesce(sum(monto), 0)
  INTO v_commission_count, v_commission_amount
  FROM public.comisiones_venta_movimientos
  WHERE tenant_id = v_tenant AND source_type = 'POS'
    AND source_id = v_venta AND tipo = 'DEVENGO';
  SELECT jsonb_build_object(
    'cliente_id', cliente_id,
    'monto_total', monto_total,
    'monto_original', monto_original,
    'monto_pendiente', monto_pendiente,
    'saldo_pendiente', saldo_pendiente,
    'saldo', saldo,
    'total', total,
    'estado', estado,
    'event_id', event_id,
    'idempotency_key', idempotency_key
  ) INTO v_cxc_snapshot
  FROM public.cuentas_por_cobrar WHERE id = v_cxc;

  IF v_stock <> 19 OR v_cash_count <> 1 OR v_cash_amount <> 50
     OR v_payment_count <> 2 OR v_accounting_count <> 1
     OR v_commission_count <> 1 OR v_commission_amount <> 10
     OR (SELECT documento_id FROM public.cuentas_por_cobrar WHERE id = v_cxc)
        IS DISTINCT FROM v_ticket_documento THEN
    RAISE EXCEPTION 'VERIFY_471_TICKET_ECONOMIC_IMPACTS_INVALID';
  END IF;

  SELECT public.pos_registrar_venta_comercial_tx(
    v_tenant, v_actor, v_sesion, 'verify:pos:ticket:471', v_request
  ) INTO v_retry;
  IF (v_retry->>'venta_id')::uuid IS DISTINCT FROM v_venta
     OR coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant AND producto_id = v_producto
           AND almacen_id = v_almacen) <> 19
     OR (SELECT count(*) FROM public.comisiones_venta_movimientos
         WHERE tenant_id = v_tenant AND source_id = v_venta AND tipo = 'DEVENGO') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_471_TICKET_RETRY_MUTATED:%', v_retry;
  END IF;

  BEGIN
    PERFORM public.pos_registrar_venta_comercial_tx(
      v_tenant, v_actor, v_sesion, 'verify:pos:ticket:471',
      jsonb_set(v_request, '{cliente_nombre}', '"Cliente cambiado"'::jsonb)
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_TICKET_PAYLOAD_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.pos_registrar_venta_comercial_tx(
      v_tenant, v_other_actor, v_sesion, 'verify:pos:ticket:foreign:471', v_request
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_FOREIGN_ACTOR_REJECTION';
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN NULL;
  END;

  BEGIN
    PERFORM public.pos_registrar_venta_comercial_tx(
      v_tenant, v_peer_actor, v_sesion, 'verify:pos:ticket:471', v_request
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_TICKET_ACTOR_BINDING';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Un RUC inválido falla antes de reservar F001 y toda la intención revierte.
  BEGIN
    PERFORM public.pos_canjear_ticket_tx(
      v_tenant, v_venta, v_actor, 'verify:pos:canje:invalid:471',
      jsonb_build_object(
        'tipo_documento', '01',
        'serie', 'F001',
        'cliente_id', v_cliente,
        'cliente_tipo_documento', '6',
        'cliente_documento', '20100070971',
        'cliente_nombre', 'Cliente factura 471',
        'cliente_direccion', 'Lima'
      )
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_INVALID_RUC_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.pos_ticket_canjes WHERE venta_pos_id = v_venta)
     OR EXISTS (SELECT 1 FROM public.documentos WHERE tenant_id = v_tenant
       AND metadata->>'venta_pos_id' = v_venta::text
       AND tipo_documento = 'FACTURA')
     OR coalesce((SELECT max(correlativo_actual) FROM public.documento_series
       WHERE tenant_id = v_tenant AND tipo_documento = '01' AND serie = 'F001'), 0)
        <> v_fiscal_before THEN
    RAISE EXCEPTION 'VERIFY_471_INVALID_CANJE_DID_NOT_ROLLBACK';
  END IF;

  -- Una CxC existente no puede cambiar de deudor durante el canje.
  BEGIN
    PERFORM public.pos_canjear_ticket_tx(
      v_tenant, v_venta, v_actor, 'verify:pos:canje:debtor:471',
      jsonb_build_object(
        'tipo_documento', '01',
        'serie', 'F001',
        'cliente_id', v_otro_cliente,
        'cliente_tipo_documento', '6',
        'cliente_documento', '20100066603',
        'cliente_nombre', 'Otro cliente 471',
        'cliente_direccion', 'Lima'
      )
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_DEBTOR_CHANGE_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT public.pos_canjear_ticket_tx(
    v_tenant, v_venta, v_actor, 'verify:pos:canje:invoice:471',
    jsonb_build_object(
      'tipo_documento', '01',
      'serie', 'F001',
      'cliente_id', v_cliente,
      'cliente_tipo_documento', '6',
      'cliente_documento', '20100070970',
      'cliente_nombre', 'Cliente factura 471',
      'cliente_direccion', 'Lima'
    )
  ) INTO v_canje;
  v_documento_fiscal := (v_canje->>'documento_id')::uuid;

  IF v_canje->>'tipo_emision' <> 'TICKET_CANJEADO'
     OR v_canje->>'tipo_documento' <> '01'
     OR v_canje->>'numero_fiscal' !~ '^F001-[0-9]{8}$'
     OR coalesce((v_canje->>'cpe_pendiente')::boolean, false) IS NOT TRUE
     OR coalesce((v_canje->>'impactos_economicos_reaplicados')::boolean, true)
     OR (SELECT tipo_documento FROM public.documentos WHERE id = v_documento_fiscal) <> 'FACTURA'
     OR (SELECT documento_id FROM public.ventas_pos WHERE id = v_venta)
        IS DISTINCT FROM v_documento_fiscal
     OR (SELECT ticket_documento_id FROM public.ventas_pos WHERE id = v_venta)
        IS DISTINCT FROM v_ticket_documento
     OR (SELECT metadata->>'documento_fiscal_id' FROM public.documentos
         WHERE id = v_ticket_documento) IS DISTINCT FROM v_documento_fiscal::text THEN
    RAISE EXCEPTION 'VERIFY_471_INVOICE_EXCHANGE_INVALID:%', v_canje;
  END IF;

  IF (SELECT jsonb_build_object(
        'cliente_id', cliente_id,
        'monto_total', monto_total,
        'monto_original', monto_original,
        'monto_pendiente', monto_pendiente,
        'saldo_pendiente', saldo_pendiente,
        'saldo', saldo,
        'total', total,
        'estado', estado,
        'event_id', event_id,
        'idempotency_key', idempotency_key
      ) FROM public.cuentas_por_cobrar WHERE id = v_cxc) IS DISTINCT FROM v_cxc_snapshot
     OR (SELECT documento_id FROM public.cuentas_por_cobrar WHERE id = v_cxc)
        IS DISTINCT FROM v_documento_fiscal
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant AND producto_id = v_producto
           AND almacen_id = v_almacen) <> v_stock
     OR (SELECT count(*) FROM public.movimientos_caja
         WHERE tenant_id = v_tenant AND referencia_documento = v_venta::text) <> v_cash_count
     OR (SELECT count(*) FROM public.ventas_pos_pagos
         WHERE tenant_id = v_tenant AND venta_pos_id = v_venta) <> v_payment_count
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND aggregate_id = v_venta::text
           AND event_type = 'pos.venta.registrada') <> v_accounting_count
     OR (SELECT count(*) FROM public.comisiones_venta_movimientos
         WHERE tenant_id = v_tenant AND source_id = v_venta AND tipo = 'DEVENGO') <> v_commission_count
     OR (SELECT coalesce(sum(monto), 0) FROM public.comisiones_venta_movimientos
         WHERE tenant_id = v_tenant AND source_id = v_venta AND tipo = 'DEVENGO') <> v_commission_amount THEN
    RAISE EXCEPTION 'VERIFY_471_EXCHANGE_REAPPLIED_ECONOMIC_IMPACT';
  END IF;

  SELECT public.pos_canjear_ticket_tx(
    v_tenant, v_venta, v_actor, 'verify:pos:canje:invoice:471',
    jsonb_build_object(
      'tipo_documento', '01', 'serie', 'F001',
      'cliente_id', v_cliente, 'cliente_tipo_documento', '6',
      'cliente_documento', '20100070970',
      'cliente_nombre', 'Cliente factura 471', 'cliente_direccion', 'Lima'
    )
  ) INTO v_retry;
  IF (v_retry->>'documento_id')::uuid IS DISTINCT FROM v_documento_fiscal
     OR coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.pos_ticket_canjes WHERE venta_pos_id = v_venta) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_471_CANJE_RETRY_INVALID:%', v_retry;
  END IF;

  BEGIN
    PERFORM public.pos_canjear_ticket_tx(
      v_tenant, v_venta, v_peer_actor, 'verify:pos:canje:invoice:471',
      jsonb_build_object(
        'tipo_documento', '01',
        'serie', 'F001',
        'cliente_id', v_cliente,
        'cliente_tipo_documento', '6',
        'cliente_documento', '20100070970',
        'cliente_nombre', 'Cliente factura 471',
        'cliente_direccion', 'Lima'
      )
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_CANJE_ACTOR_BINDING';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.pos_canjear_ticket_tx(
      v_tenant, v_venta, v_actor, 'verify:pos:canje:second:471',
      jsonb_build_object(
        'tipo_documento', '03', 'serie', 'B001',
        'cliente_tipo_documento', '0', 'cliente_documento', '00000000',
        'cliente_nombre', 'Consumidor final'
      )
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_SECOND_CANJE_REJECTION';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.pos_ticket_canjes SET estado = 'RESERVADO'
    WHERE tenant_id = v_tenant AND venta_pos_id = v_venta;
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_IMMUTABLE_HISTORY';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  -- Camino 03 válido por debajo de S/700.
  v_request := jsonb_build_object(
    'cliente_documento', '12345678',
    'cliente_tipo_documento', '1',
    'cliente_nombre', 'Receptor original del ticket',
    'moneda', 'PEN',
    'ticket_serie', 'T001',
    'emitir_cpe', false,
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'cantidad', 1, 'precio_unitario', 100,
      'descuento_monto', 0, 'subtotal', 100, 'igv', 18
    )),
    'pagos', jsonb_build_array(jsonb_build_object(
      'codigo', 'efectivo', 'monto', 118, 'moneda', 'PEN'
    ))
  );
  SELECT public.pos_registrar_venta_comercial_tx(
    v_tenant, v_actor, v_sesion, 'verify:pos:ticket:boleta:471', v_request
  ) INTO v_result;
  v_venta_boleta := (v_result->>'venta_id')::uuid;
  SELECT public.pos_canjear_ticket_tx(
    v_tenant, v_venta_boleta, v_actor, 'verify:pos:canje:boleta:471',
    jsonb_build_object(
      'tipo_documento', '03', 'serie', 'B001',
      'cliente_tipo_documento', '0', 'cliente_documento', '00000000',
      'cliente_nombre', 'Consumidor final'
    )
  ) INTO v_canje;
  IF v_canje->>'tipo_documento' <> '03'
     OR v_canje->>'numero_fiscal' !~ '^B001-[0-9]{8}$'
     OR (SELECT tipo_documento FROM public.documentos
         WHERE id = (v_canje->>'documento_id')::uuid) <> 'BOLETA'
     OR (SELECT cliente_documento FROM public.ventas_pos
         WHERE id = v_venta_boleta) <> '00000000'
     OR (SELECT d.receptor_numero_doc
         FROM public.ventas_pos v
         JOIN public.documentos d ON d.id = v.ticket_documento_id
         WHERE v.id = v_venta_boleta) <> '12345678'
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND aggregate_id = v_venta_boleta::text
           AND event_type = 'pos.venta.registrada') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_471_BOLETA_EXCHANGE_INVALID:%', v_canje;
  END IF;

  -- Ticket > S/700: puede venderse internamente, pero no canjearse a boleta anónima.
  v_request := jsonb_build_object(
    'cliente_documento', '00000000',
    'cliente_tipo_documento', '0',
    'cliente_nombre', 'Consumidor final',
    'moneda', 'PEN',
    'ticket_serie', 'T001',
    'emitir_cpe', false,
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'cantidad', 7, 'precio_unitario', 100,
      'descuento_monto', 0, 'subtotal', 700, 'igv', 126
    )),
    'pagos', jsonb_build_array(jsonb_build_object(
      'codigo', 'efectivo', 'monto', 826, 'moneda', 'PEN'
    ))
  );
  SELECT public.pos_registrar_venta_comercial_tx(
    v_tenant, v_actor, v_sesion, 'verify:pos:ticket:pure:471', v_request
  ) INTO v_result;
  v_venta_pura := (v_result->>'venta_id')::uuid;
  BEGIN
    PERFORM public.pos_canjear_ticket_tx(
      v_tenant, v_venta_pura, v_actor, 'verify:pos:canje:anonymous-high:471',
      jsonb_build_object(
        'tipo_documento', '03', 'serie', 'B001',
        'cliente_tipo_documento', '0', 'cliente_documento', '00000000',
        'cliente_nombre', 'Consumidor final'
      )
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_HIGH_VALUE_ANONYMOUS_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.pos_ticket_canjes WHERE venta_pos_id = v_venta_pura)
     OR (SELECT tipo_emision FROM public.ventas_pos WHERE id = v_venta_pura) <> 'TICKET' THEN
    RAISE EXCEPTION 'VERIFY_471_HIGH_VALUE_REJECTION_MUTATED_TICKET';
  END IF;

  BEGIN
    PERFORM public.cerrar_caja_tx(
      v_tenant, v_sesion, v_actor,
      jsonb_build_object('monto_contado', 1094, 'denominaciones', '{}'::jsonb)
    );
    RAISE EXCEPTION 'VERIFY_471_EXPECTED_PENDING_CPE_CLOSE_BLOCK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Simula la finalización exitosa del worker CPE de los dos canjes. El ticket
  -- puro permanece sin cpe_data/cpe_id y no debe bloquear el corte.
  INSERT INTO public.cpe (
    tenant_id, tipo_documento, serie, numero, ruc_emisor,
    razon_social_emisor, tipo_documento_receptor, documento_receptor,
    razon_social_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  )
  SELECT
    v_tenant, cpe_data->>'tipo_documento', cpe_data->>'serie',
    lpad(cpe_data->>'numero', 8, '0'), cpe_data->>'ruc_emisor',
    cpe_data->>'razon_social_emisor', cpe_data->>'tipo_documento_receptor',
    cpe_data->>'documento_receptor', cpe_data->>'razon_social_receptor',
    v_cliente, cpe_data->>'moneda', app.to_numeric_or_zero(cpe_data->>'total_gravadas'),
    app.to_numeric_or_zero(cpe_data->>'total_exoneradas'),
    app.to_numeric_or_zero(cpe_data->>'total_inafectas'),
    app.to_numeric_or_zero(cpe_data->>'total_exportacion'),
    app.to_numeric_or_zero(cpe_data->>'total_igv'),
    app.to_numeric_or_zero(cpe_data->>'total_venta'),
    app.to_numeric_or_zero(cpe_data->>'total_venta'), cpe_data->'items',
    now(), current_date, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    v_actor, gen_random_uuid(), true
  FROM public.ventas_pos WHERE id = v_venta
  RETURNING id INTO v_cpe_invoice;

  INSERT INTO public.cpe (
    tenant_id, tipo_documento, serie, numero, ruc_emisor,
    razon_social_emisor, tipo_documento_receptor, documento_receptor,
    razon_social_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  )
  SELECT
    v_tenant, cpe_data->>'tipo_documento', cpe_data->>'serie',
    lpad(cpe_data->>'numero', 8, '0'), cpe_data->>'ruc_emisor',
    cpe_data->>'razon_social_emisor', cpe_data->>'tipo_documento_receptor',
    cpe_data->>'documento_receptor', cpe_data->>'razon_social_receptor',
    NULL, cpe_data->>'moneda', app.to_numeric_or_zero(cpe_data->>'total_gravadas'),
    app.to_numeric_or_zero(cpe_data->>'total_exoneradas'),
    app.to_numeric_or_zero(cpe_data->>'total_inafectas'),
    app.to_numeric_or_zero(cpe_data->>'total_exportacion'),
    app.to_numeric_or_zero(cpe_data->>'total_igv'),
    app.to_numeric_or_zero(cpe_data->>'total_venta'),
    app.to_numeric_or_zero(cpe_data->>'total_venta'), cpe_data->'items',
    now(), current_date, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    v_actor, gen_random_uuid(), true
  FROM public.ventas_pos WHERE id = v_venta_boleta
  RETURNING id INTO v_cpe_boleta;

  UPDATE public.ventas_pos
  SET cpe_id = CASE id WHEN v_venta THEN v_cpe_invoice ELSE v_cpe_boleta END,
      cpe_pendiente = false,
      updated_at = now()
  WHERE id IN (v_venta, v_venta_boleta) AND tenant_id = v_tenant;

  SELECT public.cerrar_caja_tx(
    v_tenant, v_sesion, v_actor,
    jsonb_build_object('monto_contado', 1094, 'denominaciones', '{}'::jsonb)
  ) INTO v_close;
  IF v_close->>'estado' <> 'CERRADA'
     OR (SELECT tipo_emision FROM public.ventas_pos WHERE id = v_venta_pura) <> 'TICKET' THEN
    RAISE EXCEPTION 'VERIFY_471_PURE_TICKET_DID_NOT_ALLOW_CASH_CLOSE:%', v_close;
  END IF;

  IF has_function_privilege('anon',
       'public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.pos_canjear_ticket_tx_471(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.seed_operational_rbac_for_tenant(uuid,uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.pos_ticket_canjes', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.pos_ticket_canjes', 'SELECT')
     OR NOT EXISTS (
       SELECT 1 FROM public.permisos p
       WHERE p.tenant_id = v_tenant AND p.codigo = 'pos.ticket.canjear' AND p.activo
     ) THEN
    RAISE EXCEPTION 'VERIFY_471_RBAC_OR_ACL_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    WHERE c.oid = 'public.pos_ticket_canjes'::regclass
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.pos_ticket_canjes'::regclass
      AND p.polname = 'pos_ticket_canjes_tenant_471'
  ) THEN
    RAISE EXCEPTION 'VERIFY_471_RLS_FORCE_MISSING';
  END IF;
END;
$verify$;

ROLLBACK;
