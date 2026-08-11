\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 443 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_cliente_id uuid;
  v_items jsonb;
  v_detalles jsonb;
  v_cpe jsonb;
  v_documento jsonb;
  v_cxc jsonb;
  v_result jsonb;
  v_cpe_id uuid;
  v_documento_id uuid;
  v_cxc_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_event_retry uuid := gen_random_uuid();
  v_cash_event uuid := gen_random_uuid();
  v_collision_event uuid := gen_random_uuid();
  v_legacy_cpe_id uuid;
  v_count integer;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY CPE 443', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-443', 'Cliente Verify 443',
    'Cliente Verify 443', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'codigo', 'ITEM-G', 'descripcion', 'Línea gravada', 'cantidad', 1,
      'unidad', 'NIU', 'precio_unitario', 118, 'valor_venta', 100,
      'igv', 18, 'precio_venta', 118, 'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'codigo', 'ITEM-E', 'descripcion', 'Línea exonerada', 'cantidad', 1,
      'unidad', 'NIU', 'precio_unitario', 100, 'valor_venta', 100,
      'igv', 0, 'precio_venta', 100, 'afectacion_igv', '20'
    )
  );
  v_detalles := jsonb_build_array(
    jsonb_build_object(
      'orden', 1, 'codigo_producto', 'ITEM-G', 'descripcion', 'Línea gravada',
      'unidad_medida', 'NIU', 'cantidad', 1, 'precio_unitario', 118,
      'descuento_unitario', 0, 'valor_venta', 100,
      'impuesto_igv', 18, 'impuesto_isc', 0, 'total_item', 118,
      'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'orden', 2, 'codigo_producto', 'ITEM-E', 'descripcion', 'Línea exonerada',
      'unidad_medida', 'NIU', 'cantidad', 1, 'precio_unitario', 100,
      'descuento_unitario', 0, 'valor_venta', 100,
      'impuesto_igv', 0, 'impuesto_isc', 0, 'total_item', 100,
      'afectacion_igv', '20'
    )
  );
  v_cpe := jsonb_build_object(
    'tipo_documento', '01', 'serie', 'F443', 'numero', 1,
    'ruc_emisor', '20600000013', 'razon_social_emisor', 'Empresa Verify 443',
    'direccion_emisor', 'Lima', 'tipo_documento_receptor', 'RUC',
    'documento_receptor', '20123456786',
    'razon_social_receptor', 'Cliente Verify 443',
    'direccion_receptor', 'Lima', 'cliente_id', v_cliente_id,
    'moneda', 'PEN', 'total_gravadas', 100, 'total_exoneradas', 100,
    'total_inafectas', 0, 'total_exportacion', 0,
    'total_igv', 18, 'total_venta', 218, 'items', v_items,
    'fecha_emision', '2026-08-09T10:00:00-05:00',
    'fecha_vencimiento', '2026-09-08',
    'estado', 'FIRMADO', 'sunat_status', 'READY',
    'xml_firmado', '<Invoice>signed-443</Invoice>',
    'hash', 'hash-443', 'hash_firma', 'hash-443',
    'created_by', v_user_id, 'costo_ventas', 50
  );
  v_documento := jsonb_build_object(
    'subtotal', 200, 'impuesto_igv', 18, 'impuesto_isc', 0,
    'total', 218, 'tipo_cambio', 1
  );
  v_cxc := jsonb_build_object(
    'cliente_id', v_cliente_id, 'monto_total', 218,
    'monto_pendiente', 218, 'retencion_total', 0,
    'percepcion_total', 0, 'detraccion_total', 0, 'anticipo_total', 0
  );

  SELECT public.emitir_factura_cliente_tx(
    v_tenant_id, v_cpe, v_documento, v_detalles, v_cxc,
    v_event_id, 'verify-443-credit'
  ) INTO v_result;
  v_cpe_id := (v_result->>'cpe_id')::uuid;
  v_documento_id := (v_result->>'documento_id')::uuid;
  v_cxc_id := (v_result->>'cxc_id')::uuid;

  IF v_cpe_id IS NULL OR v_documento_id IS NULL OR v_cxc_id IS NULL
     OR (SELECT documento_id FROM public.cpe WHERE id = v_cpe_id)
        IS DISTINCT FROM v_documento_id
     OR (SELECT count(*) FROM public.documento_detalles
         WHERE documento_id = v_documento_id) <> 2
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar
         WHERE id = v_cxc_id) <> 218
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id
           AND event_type IN ('factura.emitida', 'comprobante.creado')
           AND aggregate_id IN (v_documento_id::text, v_cpe_id::text)) <> 2
     OR (SELECT (payload->>'subtotal')::numeric FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'factura.emitida'
           AND idempotency_key = 'verify-443-credit') <> 200 THEN
    RAISE EXCEPTION 'La factura crédito no cerró CPE/documento/líneas/CxC/outbox: %', v_result;
  END IF;

  -- Retry con UUID nuevo adopta el event_id persistido y no duplica nada.
  SELECT public.emitir_factura_cliente_tx(
    v_tenant_id, v_cpe, v_documento, v_detalles, v_cxc,
    v_event_retry, 'verify-443-credit'
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'factura_event_id')::uuid IS DISTINCT FROM v_event_id
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-443-credit') <> 1
     OR (SELECT count(*) FROM public.documentos WHERE id = v_documento_id) <> 1
     OR (SELECT count(*) FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 1 THEN
    RAISE EXCEPTION 'El retry no fue idempotente/reparador: %', v_result;
  END IF;

  BEGIN
    PERFORM public.emitir_factura_cliente_tx(
      v_tenant_id,
      v_cpe || jsonb_build_object('total_venta', 219),
      v_documento || jsonb_build_object('total', 219),
      v_detalles, v_cxc || jsonb_build_object('monto_total', 219),
      gen_random_uuid(), 'verify-443-credit'
    );
    RAISE EXCEPTION 'La misma key con otro payload debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La misma key con otro payload debió fallar' THEN RAISE; END IF;
  END;

  -- Contado crea todo salvo CxC.
  SELECT public.emitir_factura_cliente_tx(
    v_tenant_id,
    v_cpe || jsonb_build_object('serie', 'B443', 'numero', 2, 'tipo_documento', '03'),
    v_documento, v_detalles, NULL,
    v_cash_event, 'verify-443-cash'
  ) INTO v_result;
  IF v_result->>'cxc_id' IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar
       WHERE tenant_id = v_tenant_id
         AND documento_id = (v_result->>'documento_id')::uuid
     )
     OR (SELECT (payload->>'esCredito')::boolean FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'factura.emitida'
           AND idempotency_key = 'verify-443-cash') THEN
    RAISE EXCEPTION 'La venta contado generó CxC o evento crédito';
  END IF;

  -- Una colisión al final del outbox debe revertir todas las proyecciones de
  -- esa intención, no sólo el evento.
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, idempotency_key, event_id, occurred_at
  ) VALUES (
    v_tenant_id, 'verify', gen_random_uuid()::text, 'verify.collision',
    '{}'::jsonb, 'pending', 'verify-443-preexisting', v_collision_event, now()
  );
  BEGIN
    PERFORM public.emitir_factura_cliente_tx(
      v_tenant_id,
      v_cpe || jsonb_build_object('serie', 'F444', 'numero', 3),
      v_documento, v_detalles, v_cxc,
      v_collision_event, 'verify-443-collision'
    );
    RAISE EXCEPTION 'La colisión de event_id debió abortar la emisión';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La colisión de event_id debió abortar la emisión' THEN RAISE; END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.cpe
    WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-443-collision'
  ) OR EXISTS (
    SELECT 1 FROM public.documentos
    WHERE tenant_id = v_tenant_id AND serie = 'F444' AND numero = '00000003'
  ) OR EXISTS (
    SELECT 1 FROM public.cuentas_por_cobrar
    WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-443-collision'
  ) THEN
    RAISE EXCEPTION 'La colisión outbox dejó proyecciones parciales';
  END IF;

  -- Caracteriza el hueco histórico: CPE FIRMADO existente sin documento. El
  -- retry debe completar las cinco proyecciones faltantes.
  INSERT INTO public.cpe (
    tenant_id, tipo_documento, serie, numero, numero_comprobante,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
    total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
    idempotency_key, event_id, estado, estado_sunat, sunat_status,
    hash, hash_firma, xml_firmado, created_by, activo, metadata
  ) VALUES (
    v_tenant_id, '01', 'F445', '00000004', 4,
    '20600000013', 'Empresa Verify 443', 'RUC', '20123456786',
    'Cliente Verify 443', v_cliente_id, 'PEN',
    100, 100, 0, 0, 18, 218, 218, v_items,
    '2026-08-09T10:00:00-05:00', '2026-09-08',
    'verify-443-repair', gen_random_uuid(), 'FIRMADO', 'PENDIENTE', 'READY',
    'hash-repair', 'hash-repair', '<Invoice>repair</Invoice>',
    v_user_id, true, '{}'::jsonb
  ) RETURNING id INTO v_legacy_cpe_id;

  SELECT public.emitir_factura_cliente_tx(
    v_tenant_id,
    v_cpe || jsonb_build_object(
      'serie', 'F445', 'numero', 4,
      'xml_firmado', '<Invoice>repair</Invoice>',
      'hash', 'hash-repair', 'hash_firma', 'hash-repair'
    ),
    v_documento, v_detalles, v_cxc,
    gen_random_uuid(), 'verify-443-repair'
  ) INTO v_result;
  IF (v_result->>'cpe_id')::uuid IS DISTINCT FROM v_legacy_cpe_id
     OR NOT (v_result->>'repaired')::boolean
     OR (SELECT documento_id FROM public.cpe WHERE id = v_legacy_cpe_id) IS NULL
     OR (SELECT count(*) FROM public.documento_detalles
         WHERE documento_id = (v_result->>'documento_id')::uuid) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar
       WHERE documento_id = (v_result->>'documento_id')::uuid
     ) THEN
    RAISE EXCEPTION 'El retry no reparó el CPE histórico: %', v_result;
  END IF;

  BEGIN
    PERFORM public.emitir_factura_cliente_tx(
      v_tenant_id,
      v_cpe || jsonb_build_object('serie', 'F446', 'numero', 5, 'moneda', 'USD'),
      v_documento || jsonb_build_object('tipo_cambio', 0),
      v_detalles, NULL, gen_random_uuid(), 'verify-443-usd-no-tc'
    );
    RAISE EXCEPTION 'USD sin tipo de cambio debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'USD sin tipo de cambio debió fallar' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  WHERE p.oid = 'public.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)'::regprocedure;
  IF v_count <> 1
     OR has_function_privilege('authenticated',
       'public.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'La superficie/grants del RPC de factura no es service-role-only';
  END IF;
END;
$$;

ROLLBACK;
