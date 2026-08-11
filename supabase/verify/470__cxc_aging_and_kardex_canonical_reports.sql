\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_470_SOLO_ERP_E2E:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_470_REQUIERE_POSTGRESQL_16';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $catalog$
DECLARE
  v_column text;
BEGIN
  FOREACH v_column IN ARRAY ARRAY[
    'kardex_moneda', 'kardex_moneda_base', 'kardex_tipo_cambio', 'kardex_costo_unitario',
    'kardex_valor_total', 'kardex_valuacion_estado'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'movimientos_inventario'
        AND column_name = v_column
    ) THEN
      RAISE EXCEPTION 'VERIFY_470_COLUMN_MISSING:%', v_column;
    END IF;
  END LOOP;

  IF NOT coalesce((
    SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vw_kardex_valorizado'
      AND c.relkind = 'v'
  ), ARRAY[]::text[]) @> ARRAY['security_invoker=true'] THEN
    RAISE EXCEPTION 'VERIFY_470_KARDEX_VIEW_NOT_SECURITY_INVOKER';
  END IF;

  IF has_function_privilege('anon',
       'public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.reporte_cxc_aging_470(uuid,date,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.reporte_cxc_aging_470(uuid,date,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.reporte_cxc_aging_470(uuid,date,text,integer)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.vw_kardex_valorizado', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vw_kardex_valorizado', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.vw_kardex_valorizado', 'SELECT') THEN
    RAISE EXCEPTION 'VERIFY_470_REPORT_ACL_INVALID';
  END IF;
END;
$catalog$;

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_client uuid;
  v_warehouse_a uuid := gen_random_uuid();
  v_warehouse_b uuid := gen_random_uuid();
  v_product uuid;
  v_old_pen uuid;
  v_usd uuid;
  v_eur uuid;
  v_paid uuid;
  v_doc_old uuid;
  v_doc_usd uuid;
  v_doc_eur uuid;
  v_doc_paid uuid;
  v_credit_doc uuid;
  v_credit_cxc uuid;
  v_credit_rma uuid;
  v_credit_cpe uuid;
  v_credit_balance uuid;
  v_today date;
  v_result jsonb;
  v_historical jsonb;
  v_adjustment jsonb;
  v_ambiguous_return uuid;
  v_zero_cost uuid;
  v_new_base_movement uuid;
  v_immutable_blocked boolean := false;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, pais, plan, activo, estado)
  VALUES (v_tenant, 'VERIFY-470-' || left(v_tenant::text, 8),
    'Verify reports 470', 'PE', 'test', true, 'ACTIVO');

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado, configuracion_completa
  ) VALUES (
    v_tenant, '20600000470', 'Empresa verify 470', 'PE', 'PEN', 'ACTIVO', true
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES (
    v_actor, v_tenant, 'Actor', 'Verify 470',
    'actor-470-' || left(v_actor::text, 8) || '@local.invalid',
    'actor470', 'unused-local-hash', true, 'ACTIVO'
  );

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-470', 'Cliente 470', 'Cliente antiguo 470',
    'RUC', '20123450470', true
  ) RETURNING id INTO v_client;

  v_today := app.hoy_tenant(v_tenant);

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F470', '1', 'EMITIDO', v_today - 400,
    v_today - 365, 'PEN', 1, 84.75, 15.25, 100, 84.75, 0, 0, 0,
    v_client, v_actor
  ) RETURNING id INTO v_doc_old;
  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F470', '2', 'EMITIDO', v_today - 120,
    v_today - 90, 'USD', 3.5, 42.37, 7.63, 50, 42.37, 0, 0, 0,
    v_client, v_actor
  ) RETURNING id INTO v_doc_usd;
  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F470', '3', 'EMITIDO', v_today - 60,
    v_today - 30, 'PEN', 1, 21.19, 3.81, 25, 21.19, 0, 0, 0,
    v_client, v_actor
  ) RETURNING id INTO v_doc_eur;
  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F470', '4', 'EMITIDO', v_today - 30,
    v_today - 20, 'PEN', 1, 67.80, 12.20, 80, 67.80, 0, 0, 0,
    v_client, v_actor
  ) RETURNING id INTO v_doc_paid;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, total, fecha_emision,
    fecha_vencimiento, moneda, numero_documento, tipo_documento,
    idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES
    (v_tenant, v_client, v_doc_old, 'VENCIDA', 100, 100, 100, 100, 100, 100,
     v_today - 400, v_today - 365, 'PEN', 'F001-47001', 'FACTURA',
     'verify-470-old-pen', 'verify.470', 1, '{}'::jsonb),
    (v_tenant, v_client, v_doc_usd, 'VENCIDA', 50, 50, 50, 50, 50, 50,
     v_today - 120, v_today - 90, 'USD', 'F001-47002', 'FACTURA',
     'verify-470-usd', 'verify.470', NULL, '{}'::jsonb),
    (v_tenant, v_client, v_doc_eur, 'VENCIDA', 25, 25, 25, 25, 25, 25,
     v_today - 60, v_today - 30, 'EUR', 'F001-47003', 'FACTURA',
     'verify-470-eur', 'verify.470', NULL, '{}'::jsonb),
    (v_tenant, v_client, v_doc_paid, 'CANCELADO', 80, 80, 0, 0, 0, 80,
     v_today - 30, v_today - 20, 'PEN', 'F001-47004', 'FACTURA',
     'verify-470-paid', 'verify.470', 1, '{}'::jsonb);

  SELECT id INTO v_old_pen FROM public.cuentas_por_cobrar
    WHERE tenant_id = v_tenant AND numero_documento = 'F001-47001';
  SELECT id INTO v_usd FROM public.cuentas_por_cobrar
    WHERE tenant_id = v_tenant AND numero_documento = 'F001-47002';
  SELECT id INTO v_eur FROM public.cuentas_por_cobrar
    WHERE tenant_id = v_tenant AND numero_documento = 'F001-47003';
  SELECT id INTO v_paid FROM public.cuentas_por_cobrar
    WHERE tenant_id = v_tenant AND numero_documento = 'F001-47004';

  INSERT INTO public.cxc_pagos (
    tenant_id, cuenta_id, monto, moneda, fecha_pago, metodo_pago, tipo,
    referencia, idempotency_key, source, estado, activo, metadata
  ) VALUES (
    v_tenant, v_paid, 80, 'PEN', v_today - 5, 'TRANSFERENCIA', 'PAGO',
    'PAY-470', 'verify-470-paid-operation', 'verify.470', 'ACTIVO', true, '{}'::jsonb
  );

  v_result := public.reporte_cxc_aging_470(v_tenant, NULL, NULL, 500);
  IF (v_result->>'fechaCorte')::date <> v_today
     OR (v_result #>> '{resumen,cuentasAnalizadas}')::integer <> 3
     OR (v_result #>> '{resumen,totalPendienteBase}')::numeric <> 275
     OR (v_result #>> '{resumen,cuentasSinValuacion}')::integer <> 1
     OR (v_result #>> '{resumen,totalPendientePorMoneda,PEN}')::numeric <> 100
     OR (v_result #>> '{resumen,totalPendientePorMoneda,USD}')::numeric <> 50
     OR (v_result #>> '{resumen,totalPendientePorMoneda,EUR}')::numeric <> 25
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_result->'detalle') item
       WHERE item->>'id' = v_old_pen::text
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_result->'detalle') item
       WHERE item->>'id' = v_paid::text
     ) THEN
    RAISE EXCEPTION 'VERIFY_470_CXC_CURRENT_WRONG:%', v_result;
  END IF;

  -- Un corte histórico reconstruye la cuenta pagada después del corte. No se
  -- basa en el estado/saldo actual ni la pierde por su fecha de emisión.
  v_historical := public.reporte_cxc_aging_470(v_tenant, v_today - 10, 'antiguo', 500);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_historical->'detalle') item
    WHERE item->>'id' = v_paid::text
      AND (item->>'montoOrigen')::numeric = 80
      AND item->>'estado' = 'VENCIDA'
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_CXC_HISTORICAL_NOT_RECONSTRUCTED:%', v_historical;
  END IF;

  -- La aplicación de saldo a favor también reduce CxC, aunque su ledger no es
  -- cxc_pagos. El aging histórico debe incluirla desde su fecha efectiva.
  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F470', '5', 'EMITIDO', v_today - 30,
    v_today - 20, 'PEN', 1, 33.90, 6.10, 40, 33.90, 0, 0, 0,
    v_client, v_actor
  ) RETURNING id INTO v_credit_doc;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, total, fecha_emision,
    fecha_vencimiento, moneda, numero_documento, tipo_documento,
    idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES (
    v_tenant, v_client, v_credit_doc, 'CANCELADO', 40, 40, 0, 0, 0, 40,
    v_today - 30, v_today - 20, 'PEN', 'F001-47005', 'FACTURA',
    'verify-470-credit-application', 'verify.470', 1, '{}'::jsonb
  ) RETURNING id INTO v_credit_cxc;

  INSERT INTO public.cpe (
    tenant_id, documento_id, estado, sunat_status, serie, numero,
    tipo_documento, moneda, total, activo, idempotency_key, event_id
  ) VALUES (
    v_tenant, v_credit_doc, 'BORRADOR', 'NOT_SENT', 'BC70', '00000001',
    '07', 'PEN', 40, true, 'verify-470-credit-cpe', gen_random_uuid()
  ) RETURNING id INTO v_credit_cpe;

  INSERT INTO public.rma_solicitudes (
    tenant_id, cliente_id, estado, numero, tipo, created_by,
    documento_origen_id, cpe_origen_id, cxc_origen_id
  ) VALUES (
    v_tenant, v_client, 'CERRADA', 'RMA-470-CREDIT', 'DEVOLUCION', v_actor,
    v_credit_doc, v_credit_cpe, v_credit_cxc
  ) RETURNING id INTO v_credit_rma;

  INSERT INTO public.saldos_favor_clientes (
    tenant_id, cliente_id, rma_id, documento_origen_id,
    nota_credito_documento_id, nota_credito_cpe_id, moneda,
    tipo_cambio_origen, monto_original, monto_disponible,
    monto_local_original, monto_local_disponible, estado, created_by
  ) VALUES (
    v_tenant, v_client, v_credit_rma, v_credit_doc,
    v_credit_doc, v_credit_cpe, 'PEN', 1, 40, 0, 40, 0, 'AGOTADO', v_actor
  ) RETURNING id INTO v_credit_balance;

  INSERT INTO public.saldos_favor_movimientos (
    tenant_id, saldo_favor_id, tipo, monto, cxc_id, actor_id,
    idempotency_key, event_id, created_at
  ) VALUES (
    v_tenant, v_credit_balance, 'APLICACION_CXC', 40, v_credit_cxc, v_actor,
    'verify-470-credit-applied', gen_random_uuid(),
    ((v_today - 10)::timestamp + interval '12 hours') AT TIME ZONE 'America/Lima'
  );

  v_historical := public.reporte_cxc_aging_470(v_tenant, v_today - 5, NULL, 500);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_historical->'detalle') item
    WHERE item->>'id' = v_credit_cxc::text
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_CREDIT_APPLICATION_NOT_APPLIED_AT_CUTOFF:%', v_historical;
  END IF;

  v_historical := public.reporte_cxc_aging_470(v_tenant, v_today - 15, NULL, 500);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_historical->'detalle') item
    WHERE item->>'id' = v_credit_cxc::text
      AND (item->>'montoOrigen')::numeric = 40
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_CREDIT_APPLICATION_APPLIED_BEFORE_EVENT:%', v_historical;
  END IF;

  -- Una reversa legacy sin timestamp no permite saber si el pago era vigente
  -- al corte: debe señalar reconstrucción pendiente, nunca asumirlo inactivo.
  INSERT INTO public.cxc_pagos (
    tenant_id, cuenta_id, monto, moneda, fecha_pago, metodo_pago, tipo,
    referencia, idempotency_key, source, estado, activo, metadata
  ) VALUES (
    v_tenant, v_old_pen, 10, 'PEN', v_today - 20, 'TRANSFERENCIA', 'PAGO',
    'UNKNOWN-REVERSAL-470', 'verify-470-unknown-reversal', 'verify.470',
    'INACTIVO', false, '{}'::jsonb
  );
  v_historical := public.reporte_cxc_aging_470(v_tenant, v_today - 5, NULL, 500);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_historical->'detalle') item
    WHERE item->>'id' = v_old_pen::text
      AND item->>'valuacionEstado' = 'PENDIENTE_RECONSTRUCCION'
      AND item->'montoOrigen' = 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_UNKNOWN_PAYMENT_REVERSAL_WAS_GUESSED:%', v_historical;
  END IF;

  -- Un ledger de cobro en una moneda distinta a la CxC no se resta
  -- nominalmente, aunque el tipo sea conocido.
  INSERT INTO public.cxc_pagos (
    tenant_id, cuenta_id, monto, moneda, fecha_pago, metodo_pago, tipo,
    referencia, idempotency_key, source, estado, activo, metadata
  ) VALUES (
    v_tenant, v_paid, 1, 'USD', v_today - 4, 'TRANSFERENCIA', 'PAGO',
    'WRONG-CURRENCY-470', 'verify-470-wrong-payment-currency', 'verify.470',
    'ACTIVO', true, '{}'::jsonb
  );
  v_historical := public.reporte_cxc_aging_470(v_tenant, v_today - 3, NULL, 500);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_historical->'detalle') item
    WHERE item->>'id' = v_paid::text
      AND item->>'valuacionEstado' = 'PENDIENTE_RECONSTRUCCION'
      AND item->'montoOrigen' = 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_PAYMENT_CURRENCIES_WERE_MIXED:%', v_historical;
  END IF;

  INSERT INTO public.almacenes (
    id, tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES
    (v_warehouse_a, v_tenant, 'V470-A', 'Almacén A 470', 'ACTIVO', true, true, 'PE'),
    (v_warehouse_b, v_tenant, 'V470-B', 'Almacén B 470', 'ACTIVO', true, false, 'PE');

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-470', 'nombre', 'Producto kardex 470',
      'categoria', 'VERIFICACION', 'precio_venta', 30,
      'precio_compra', 20, 'afectacion_igv', '10',
      'es_servicio', false, 'controla_stock', true
    ),
    v_warehouse_a, 10, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_product;

  v_adjustment := public.registrar_ajuste_inventario_tx(
    v_tenant, jsonb_build_object(
      'producto_id', v_product, 'almacen_id', v_warehouse_a,
      'delta', 2, 'motivo', 'Sobrante verify 470'
    ), v_actor, 'verify-470-adjust-in'
  );
  v_adjustment := public.registrar_ajuste_inventario_tx(
    v_tenant, jsonb_build_object(
      'producto_id', v_product, 'almacen_id', v_warehouse_a,
      'delta', -1, 'motivo', 'Faltante verify 470'
    ), v_actor, 'verify-470-adjust-out'
  );
  PERFORM public.transferir_inventario_tx(
    v_tenant, jsonb_build_object(
      'producto_id', v_product, 'almacen_origen_id', v_warehouse_a,
      'almacen_destino_id', v_warehouse_b, 'cantidad', 1,
      'motivo', 'Transferencia verify 470'
    ), v_actor, 'verify-470-transfer'
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant, p_producto_id := v_product,
    p_almacen_id := v_warehouse_a, p_tipo := 'SALIDA', p_cantidad := 1,
    p_referencia_tipo := 'DEVOLUCION_PROVEEDOR_ITEM',
    p_referencia_id := gen_random_uuid(), p_notas := 'Devolución verify 470',
    p_created_by := v_actor::text,
    p_metadata := jsonb_build_object('costo_unitario', 20)
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant, p_producto_id := v_product,
    p_almacen_id := v_warehouse_b, p_tipo := 'ENTRADA', p_cantidad := 1,
    p_referencia_tipo := 'IMPORTACION_USD_470',
    p_referencia_id := gen_random_uuid(), p_notas := 'Costo USD sin TC',
    p_created_by := v_actor::text,
    p_metadata := jsonb_build_object('costo_unitario', 5, 'moneda', 'USD')
  );

  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, v_warehouse_a, NULL, NULL, 2
  );
  IF jsonb_array_length(v_result->'data') <> 2
     OR (v_result #>> '{resumen,totalMovimientos}')::integer <> 5
     OR (v_result #>> '{resumen,totalEntradas}')::numeric <> 12
     OR (v_result #>> '{resumen,totalSalidas}')::numeric <> 3
     OR (v_result #>> '{resumen,saldoCantidad}')::numeric <> 9
     OR (v_result #>> '{resumen,saldoValorizadoBase}')::numeric <> 180
     OR (v_result #>> '{resumen,pendientesValorizacion}')::integer <> 0
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_result->'data') item
       WHERE item #>> '{almacen,id}' IS DISTINCT FROM v_warehouse_a::text
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.vw_kardex_valorizado k
       WHERE k.tenant_id = v_tenant AND k.producto_id = v_product
         AND k.almacen_id = v_warehouse_a AND k.tipo = 'DEVOLUCION'
         AND k.sentido = 'SALIDA' AND k.cantidad_firmada = -1
     )
     OR (SELECT count(*) FROM public.vw_kardex_valorizado k
       WHERE k.tenant_id = v_tenant AND k.producto_id = v_product
         AND k.tipo = 'AJUSTE') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_470_KARDEX_WAREHOUSE_OR_SIGNS_WRONG:%', v_result;
  END IF;

  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, NULL, NULL, NULL, 500
  );
  IF (v_result #>> '{resumen,totalMovimientos}')::integer <> 7
     OR (v_result #>> '{resumen,pendientesValorizacion}')::integer <> 1
     OR (v_result #>> '{resumen,saldoValorizadoBase}') IS NOT NULL
     OR (v_result #>> '{resumen,valorPorMoneda,USD}')::numeric <> 5
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_result->'data') item
       WHERE item->>'valuacionEstado' = 'PENDIENTE_TIPO_CAMBIO'
         AND item->>'moneda' = 'USD'
     ) THEN
    RAISE EXCEPTION 'VERIFY_470_KARDEX_FAIL_CLOSED_WRONG:%', v_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = v_tenant
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN (
        'ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION'
      )
      AND mi.kardex_valuacion_estado IS NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_NEW_MOVEMENT_WITHOUT_DURABLE_VALUATION_STATE';
  END IF;

  -- Una devolución genérica sin dirección no se adivina. Sigue apareciendo en
  -- el kardex, pero invalida el saldo de cantidad hasta que se clasifique.
  INSERT INTO public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
    referencia_tipo, referencia_id, metadata, activo, estado
  ) VALUES (
    v_tenant, v_product, v_warehouse_b, 'DEVOLUCION', 'DEVOLUCION', 1,
    'DEVOLUCION_GENERICA_470', gen_random_uuid(),
    jsonb_build_object('costo_unitario', 20), true, 'ACTIVO'
  ) RETURNING id INTO v_ambiguous_return;

  IF NOT EXISTS (
    SELECT 1 FROM public.vw_kardex_valorizado k
    WHERE k.movimiento_id = v_ambiguous_return
      AND k.tipo = 'DEVOLUCION' AND k.sentido = 'PENDIENTE'
      AND k.cantidad_firmada IS NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_AMBIGUOUS_RETURN_WAS_GUESSED';
  END IF;

  -- Un cero legacy no es costo confirmado sin evidencia explícita.
  INSERT INTO public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
    referencia_tipo, referencia_id, metadata, activo, estado
  ) VALUES (
    v_tenant, v_product, v_warehouse_b, 'ENTRADA', 'ENTRADA', 1,
    'ZERO_COST_470', gen_random_uuid(),
    jsonb_build_object('costo_unitario', 0), true, 'ACTIVO'
  ) RETURNING id INTO v_zero_cost;

  IF NOT EXISTS (
    SELECT 1 FROM public.movimientos_inventario mi
    WHERE mi.id = v_zero_cost
      AND mi.kardex_valuacion_estado = 'PENDIENTE_COSTO'
      AND mi.kardex_costo_unitario IS NULL AND mi.kardex_valor_total IS NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_ZERO_COST_WAS_INVENTED';
  END IF;

  BEGIN
    UPDATE public.movimientos_inventario
    SET cantidad = 2
    WHERE id = v_ambiguous_return;
  EXCEPTION WHEN check_violation THEN
    v_immutable_blocked := true;
  END;
  IF NOT v_immutable_blocked THEN
    RAISE EXCEPTION 'VERIFY_470_CONFIRMED_SNAPSHOT_NOT_IMMUTABLE';
  END IF;

  -- Los campos que determinan signo, almacén y documento forman parte del
  -- snapshot económico aunque no cambien la cantidad física.
  v_immutable_blocked := false;
  BEGIN
    UPDATE public.movimientos_inventario
    SET metadata = jsonb_set(metadata, '{sentido}', '"SALIDA"'::jsonb, true)
    WHERE id = v_ambiguous_return;
  EXCEPTION WHEN check_violation THEN
    v_immutable_blocked := true;
  END;
  IF NOT v_immutable_blocked THEN
    RAISE EXCEPTION 'VERIFY_470_CONFIRMED_DIRECTION_NOT_IMMUTABLE';
  END IF;

  v_immutable_blocked := false;
  BEGIN
    UPDATE public.movimientos_inventario
    SET almacen_id = v_warehouse_a,
        referencia_tipo = 'RMA_RETURN_470',
        referencia_id = gen_random_uuid()
    WHERE id = v_ambiguous_return;
  EXCEPTION WHEN check_violation THEN
    v_immutable_blocked := true;
  END;
  IF NOT v_immutable_blocked THEN
    RAISE EXCEPTION 'VERIFY_470_CONFIRMED_REFERENCE_NOT_IMMUTABLE';
  END IF;

  -- Una escritura directa sobre columnas de valorización tampoco puede
  -- reemplazar el snapshot confirmado: el trigger restaura su valor original.
  UPDATE public.movimientos_inventario
  SET kardex_moneda = 'USD', kardex_tipo_cambio = 99
  WHERE id = v_ambiguous_return;
  IF NOT EXISTS (
    SELECT 1 FROM public.movimientos_inventario mi
    WHERE mi.id = v_ambiguous_return
      AND mi.kardex_moneda = 'PEN' AND mi.kardex_tipo_cambio = 1
  ) THEN
    RAISE EXCEPTION 'VERIFY_470_CONFIRMED_VALUATION_COLUMNS_MUTATED';
  END IF;

  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, NULL, NULL, NULL, 500
  );
  IF (v_result #>> '{resumen,pendientesSentido}')::integer <> 1
     OR (v_result #>> '{resumen,pendientesValorizacion}')::integer <> 2
     OR (v_result #>> '{resumen,saldoCantidad}') IS NOT NULL
     OR (v_result #>> '{resumen,saldoValorizadoBase}') IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_470_PENDING_MOVEMENTS_NOT_FAIL_CLOSED:%', v_result;
  END IF;

  -- Si la empresa cambia de moneda base, los snapshots anteriores no se
  -- relabelan ni se suman nominalmente con los nuevos.
  UPDATE public.empresa_config SET moneda_defecto = 'USD'
  WHERE tenant_id = v_tenant;
  INSERT INTO public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
    referencia_tipo, referencia_id, metadata, activo, estado
  ) VALUES (
    v_tenant, v_product, v_warehouse_b, 'ENTRADA', 'ENTRADA', 1,
    'NEW_BASE_USD_470', gen_random_uuid(),
    jsonb_build_object('costo_unitario', 20), true, 'ACTIVO'
  ) RETURNING id INTO v_new_base_movement;

  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, NULL, NULL, NULL, 500
  );
  IF (v_result #>> '{resumen,multiplesMonedasBase}')::boolean IS DISTINCT FROM true
     OR (v_result #>> '{resumen,monedaBase}') IS NOT NULL
     OR (v_result #>> '{resumen,saldoValorizadoBase}') IS NOT NULL
     OR (v_result #>> '{resumen,valorBasePorMoneda,PEN}') IS NULL
     OR (v_result #>> '{resumen,valorBasePorMoneda,USD}')::numeric <> 20
     OR NOT EXISTS (
       SELECT 1 FROM public.movimientos_inventario mi
       WHERE mi.id = v_new_base_movement AND mi.kardex_moneda_base = 'USD'
     ) THEN
    RAISE EXCEPTION 'VERIFY_470_BASE_CURRENCIES_WERE_MIXED:%', v_result;
  END IF;
END;
$verify$;

SET LOCAL ROLE service_role;
DO $service_role_execution$
DECLARE
  v_tenant uuid;
  v_kardex jsonb;
  v_aging jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants
  WHERE codigo LIKE 'VERIFY-470-%'
  ORDER BY created_at DESC, id DESC LIMIT 1;
  v_kardex := public.reporte_kardex_valorizado_470(v_tenant, NULL, NULL, NULL, NULL, 10);
  v_aging := public.reporte_cxc_aging_470(v_tenant, NULL, NULL, 10);
  IF coalesce((v_kardex->>'success')::boolean, false) IS DISTINCT FROM true
     OR jsonb_typeof(v_aging->'detalle') <> 'array' THEN
    RAISE EXCEPTION 'VERIFY_470_SERVICE_ROLE_EXECUTION_FAILED';
  END IF;
END;
$service_role_execution$;
RESET ROLE;

ROLLBACK;
