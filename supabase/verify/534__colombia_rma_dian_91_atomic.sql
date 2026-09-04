\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_534') THEN
    RAISE EXCEPTION 'VERIFY_534_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contract$
DECLARE
  v_create_rma text;
  v_create_note text;
  v_router text;
  v_effect text;
  v_trigger text;
BEGIN
  IF to_regprocedure('public.crear_rma_tx(uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure('public.crear_rma_legacy_534(uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure(
       'app.crear_nota_credito_rma_dian_534(uuid,uuid,uuid,jsonb,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)'
     ) IS NULL
     OR to_regprocedure('app.aplicar_efecto_nota_dian_529(uuid,uuid)') IS NULL
     OR to_regprocedure('app.enforce_nota_fiscal_effect_494()') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_534_CANONICAL_FUNCTION_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'public.crear_rma_tx(uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_create_rma;
  IF v_create_rma NOT ILIKE '%v_country = ''CO'' AND v_is_demo IS FALSE%'
     OR v_create_rma NOT ILIKE '%RMA_FISCAL_DEMO_STATE_UNAVAILABLE%'
     OR v_create_rma NOT ILIKE '%RMA_DIAN_LINE_LIMIT_EXCEEDED%'
     OR v_create_rma NOT ILIKE '%RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE%'
     OR v_create_rma NOT ILIKE '%simulated_origin IS DISTINCT FROM false%'
     OR v_create_rma NOT ILIKE '%fiscal_authority_evidence%'
     OR v_create_rma NOT ILIKE '%FOR SHARE%'
     OR v_create_rma NOT ILIKE '%v_result := public.crear_rma_legacy_534%'
     OR v_create_rma NOT ILIKE
          '%AND NOT coalesce((v_result->>''idempotent'')::boolean, false)%'
     OR v_create_rma NOT ILIKE '%JOIN public.cpe c%'
     OR v_create_rma NOT ILIKE '%FOR UPDATE OF c%'
     OR v_create_rma NOT ILIKE '%RMA_DIAN_FISCAL_LINE_BALANCE_UNVERIFIABLE%'
     OR v_create_rma NOT ILIKE '%RMA_DIAN_FISCAL_LINE_BALANCE_EXCEEDED:%'
     OR v_create_rma NOT ILIKE '%source_document_line_id%'
     OR v_create_rma NOT ILIKE '%codigo_motivo%IN (''1'', ''2'')%'
     OR v_create_rma NOT ILIKE '%public.crear_rma_legacy_534%' THEN
    RAISE EXCEPTION 'VERIFY_534_CREATE_RMA_CONTRACT_DIVERGED:%', v_create_rma;
  END IF;

  SELECT pg_get_functiondef(
    'app.crear_nota_credito_rma_dian_534(uuid,uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_create_note;
  IF v_create_note NOT ILIKE '%RMA_DIAN_NOTE_REQUIRES_RECEIVED_STATE%'
     OR v_create_note NOT ILIKE '%RMA_DIAN_LINES_NOT_FULLY_RECEIVED%'
     OR v_create_note NOT ILIKE '%documento_detalle_id%'
     OR v_create_note NOT ILIKE '%crear_nota_referenciada_co_529%'
     OR v_create_note NOT ILIKE '%''91'', ''1''%'
     OR v_create_note NOT ILIKE '%PENDING_FISCAL_ACCEPTANCE%'
     OR v_create_note NOT ILIKE '%v_active_item_count > 100%'
     OR v_create_note NOT ILIKE '%v_note_key := ''rma534:''%'
     OR v_create_note NOT ILIKE '%lower(o.idempotency_key) = v_note_key%'
     OR v_create_note NOT ILIKE '%RMA_DIAN_NOTE_DOCUMENT_CORRELATION_MISSING%'
     OR v_create_note NOT ILIKE '%RMA_DIAN_NOTE_CPE_CORRELATION_MISSING%'
     OR v_create_note NOT ILIKE '%RMA_DIAN_NOTE_RMA_CORRELATION_MISSING%'
     OR v_create_note NOT ILIKE '%FOR UPDATE%'
     OR v_create_note NOT ILIKE '%pg_advisory_xact_lock%'
     OR v_create_note ILIKE '%aplicar_efecto_nota_dian_529%'
     OR v_create_note ILIKE '%rma_insert_outbox_456%' THEN
    RAISE EXCEPTION 'VERIFY_534_CREATE_NOTE_CONTRACT_DIVERGED:%', v_create_note;
  END IF;

  SELECT pg_get_functiondef(
    'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_router;
  IF v_router NOT ILIKE '%v_country = ''CO''%'
     OR v_router NOT ILIKE '%v_is_demo IS DISTINCT FROM false%'
     OR v_router NOT ILIKE '%RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW%'
     OR v_router NOT ILIKE '%crear_nota_credito_rma_dian_534%'
     OR v_router NOT ILIKE '%emitir_nota_credito_rma_legacy_532%'
     OR v_router NOT ILIKE '%RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW%' THEN
    RAISE EXCEPTION 'VERIFY_534_ROUTER_CONTRACT_DIVERGED:%', v_router;
  END IF;

  SELECT pg_get_functiondef(
    'app.aplicar_efecto_nota_dian_529(uuid,uuid)'::regprocedure
  ) INTO v_effect;
  IF v_effect NOT ILIKE '%aplicar_efecto_nota_aceptada_494%'
     OR v_effect NOT ILIKE '%public.cxc_pagos%'
     OR v_effect NOT ILIKE '%public.saldos_favor_clientes%'
     OR v_effect NOT ILIKE '%''rma_id'', v_rma.id%'
     OR v_effect NOT ILIKE '%estado = ''CERRADA''%'
     OR v_effect ILIKE '%rma_insert_outbox_456%' THEN
    RAISE EXCEPTION 'VERIFY_534_ACCEPTANCE_EFFECT_DIVERGED:%', v_effect;
  END IF;

  SELECT pg_get_functiondef(
    'app.enforce_nota_fiscal_effect_494()'::regprocedure
  ) INTO v_trigger;
  IF v_trigger NOT ILIKE '%REJECTED_NO_FINANCIAL_EFFECT%'
     OR v_trigger NOT ILIKE '%nota_credito_documento_id = NULL%'
     OR v_trigger NOT ILIKE '%nota_credito_cpe_id = NULL%'
     OR v_trigger NOT ILIKE '%NOTA_DIAN_RECHAZADA%'
     OR v_trigger ILIKE '%rma_insert_outbox_456%' THEN
    RAISE EXCEPTION 'VERIFY_534_REJECTION_CONTRACT_DIVERGED:%', v_trigger;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'cpe'
      AND t.tgname = 'trg_enforce_nota_fiscal_effect_494'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_534_FISCAL_EFFECT_TRIGGER_MISSING';
  END IF;

  IF NOT has_function_privilege(
       'service_role', 'public.crear_rma_tx(uuid,uuid,jsonb,text)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.crear_rma_tx(uuid,uuid,jsonb,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.crear_rma_legacy_534(uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.crear_nota_credito_rma_dian_534(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.aplicar_efecto_nota_dian_529(uuid,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_FUNCTION_ACL_INVALID';
  END IF;
END;
$contract$;

-- La demo puede enseñar la devolución física, pero la puerta fiscal debe
-- detenerse antes de crear una nota o cualquiera de sus proyecciones.
DO $demo$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_documents bigint;
  v_cpe bigint;
  v_payments bigint;
  v_balances bigint;
  v_note_operations bigint;
  v_rma_operations bigint;
  v_outbox bigint;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY RMA DIAN 534 DEMO', 1, 'CO');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  SELECT count(*) INTO v_documents FROM public.documentos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_cpe FROM public.cpe WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_payments FROM public.cxc_pagos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_balances FROM public.saldos_favor_clientes WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_note_operations
  FROM public.notas_referenciadas_operaciones WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_rma_operations
  FROM public.rma_operaciones WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_outbox FROM public.outbox_events WHERE tenant_id = v_tenant;

  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(
      v_tenant, v_actor, gen_random_uuid(),
      jsonb_build_object('motivo', 'Devolución demo sin efecto fiscal'),
      'verify:534:demo:blocked'
    );
    RAISE EXCEPTION 'VERIFY_534_DEMO_CREATED_DIAN_NOTE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW' THEN
      RAISE;
    END IF;
  END;

  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant) <> v_documents
     OR (SELECT count(*) FROM public.cpe WHERE tenant_id = v_tenant) <> v_cpe
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id = v_tenant) <> v_payments
     OR (SELECT count(*) FROM public.saldos_favor_clientes WHERE tenant_id = v_tenant) <> v_balances
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE tenant_id = v_tenant) <> v_note_operations
     OR (SELECT count(*) FROM public.rma_operaciones
         WHERE tenant_id = v_tenant) <> v_rma_operations
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant) <> v_outbox THEN
    RAISE EXCEPTION 'VERIFY_534_DEMO_GUARD_LEFT_PARTIAL_EFFECT';
  END IF;
END;
$demo$;

-- Falla controlada para probar que una correlación que no actualiza exactamente
-- un documento aborta toda la creación. Sólo actúa cuando el DO runtime la arma.
CREATE FUNCTION app.verify_534_skip_document_correlation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF current_setting('app.verify_534_skip_document_correlation', true) = 'on'
     AND NEW.metadata->>'rma_dian_contract_version' = '534' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_verify_534_skip_document_correlation
BEFORE UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION app.verify_534_skip_document_correlation();

-- Simula una mutación permitida por los guards previos después de que el
-- writer legado insertó la RMA: la procedencia y aceptación DIAN quedan
-- intactas, pero el tipo fiscal deja de ser factura 01. La postvalidación 534
-- debe rechazar el origen y revertir toda la escritura sin debilitar 528.
CREATE FUNCTION app.verify_534_invalidate_source_after_rma()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF current_setting('app.verify_534_invalidate_source_after_rma', true) = 'on'
     AND NEW.cpe_origen_id IS NOT NULL THEN
    UPDATE public.cpe
    SET tipo_documento = '03',
        updated_at = now()
    WHERE id = NEW.cpe_origen_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_verify_534_invalidate_source_after_rma
AFTER INSERT ON public.rma_solicitudes
FOR EACH ROW EXECUTE FUNCTION app.verify_534_invalidate_source_after_rma();

DO $runtime$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_creator uuid := gen_random_uuid();
  v_approver uuid := gen_random_uuid();
  v_customer uuid;
  v_product_accept uuid := gen_random_uuid();
  v_product_reject uuid := gen_random_uuid();
  v_order uuid;
  v_order_line_accept uuid := gen_random_uuid();
  v_order_line_reject uuid := gen_random_uuid();
  v_source_document uuid;
  v_source_line_accept uuid := gen_random_uuid();
  v_source_line_reject uuid := gen_random_uuid();
  v_source_cpe uuid := gen_random_uuid();
  v_source_operation uuid := gen_random_uuid();
  v_source_event uuid := gen_random_uuid();
  v_source_reservation uuid := gen_random_uuid();
  v_source_cxc uuid;
  v_source_entry uuid;
  v_source_cufe text := repeat('A', 96);
  v_source_response text;
  v_rma_accept uuid;
  v_rma_reject uuid;
  v_rma_item_accept uuid;
  v_rma_item_reject uuid;
  v_result jsonb;
  v_note_document uuid;
  v_note_cpe uuid;
  v_note_claim jsonb;
  v_note_operation uuid;
  v_note_token uuid;
  v_note_cude text := repeat('C', 96);
  v_note_response text;
  v_same_retry jsonb;
  v_note_xml text := '<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('a', 180) || '</ds:Signature></CreditNote>';
  v_note_sealed_xml text := '<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('b', 180) || '</ds:Signature></CreditNote>';
  v_rejected_document uuid;
  v_rejected_cpe uuid;
  v_rejected_claim jsonb;
  v_rejected_operation uuid;
  v_rejected_token uuid;
  v_rejected_cude text := repeat('D', 96);
  v_rejected_xml text := '<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('c', 180) || '</ds:Signature></CreditNote>';
  v_rejected_sealed_xml text := '<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('d', 180) || '</ds:Signature></CreditNote>';
  v_retry jsonb;
  v_retry_document uuid;
  v_retry_cpe uuid;
  v_many_items jsonb;
  v_internal_note_key text;
  v_sha text;
  v_failed boolean;
  v_rma_count bigint;
  v_document_count bigint;
  v_cpe_count bigint;
  v_note_operation_count bigint;
  v_payment_count bigint;
  v_balance_count bigint;
  v_effect_outbox_count bigint;
BEGIN
  v_source_response := '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/><cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>'
    || v_source_cufe
    || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>';
  v_note_response := replace(v_source_response, v_source_cufe, v_note_cude);

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES (
    v_tenant, 'VERIFY-534-' || left(v_tenant::text, 8),
    'Tenant Colombia verify 534', 'Fixture local transaccional RMA DIAN 91',
    'CO', 'test', true, 'ACTIVO'
  );
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, departamento, provincia,
    ubigeo, pais, pais_id, moneda_defecto, estado, configuracion_completa,
    is_demo, habilitar_rma, dias_maximos_rma, rma_requiere_control_calidad,
    serie_nota_credito, dian_activo, dian_url, dian_software_id,
    dian_software_pin, dian_test_set_id, dian_environment,
    dian_regimen_fiscal, dian_tipo_contribuyente, certificado_pfx,
    certificado_password, dian_resolucion_numero, dian_resolucion_prefijo,
    dian_resolucion_desde, dian_resolucion_hasta,
    dian_resolucion_fecha_inicio, dian_resolucion_fecha_fin
  ) VALUES (
    v_tenant, '900123456-8', 'Emisor Colombia verify 534',
    'Carrera 7 # 10-20', 'Bogotá D.C.', 'Bogotá D.C.', '11001', 'CO',
    (SELECT id FROM public.paises WHERE codigo_iso = 'CO' AND activo LIMIT 1),
    'COP', 'ACTIVO', true, false, true, 30, false, 'NC01', true,
    'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    'SOFTWARE-VERIFY-534', 'PIN-VERIFY-534', 'TEST-SET-VERIFY-534',
    'HOMOLOGACION', 'O-13', '1', convert_to('pfx-verify-534', 'UTF8'),
    'cert-pass-verify-534', '187640534', 'FV', 1, 999999,
    current_date - 30, current_date + 365
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (
      v_creator, v_tenant, 'Creador', 'Verify 534',
      'creator-534-' || left(v_creator::text, 8) || '@local.invalid',
      'creator534' || left(v_creator::text, 4),
      'unused-local-hash', true, 'ACTIVO'
    ),
    (
      v_approver, v_tenant, 'Aprobador', 'Verify 534',
      'approver-534-' || left(v_approver::text, 8) || '@local.invalid',
      'approver534' || left(v_approver::text, 4),
      'unused-local-hash', true, 'ACTIVO'
    );

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES (
    v_tenant, 'CLI-534', 'Cliente Colombia verify 534',
    'Cliente Colombia verify 534', 'NIT', '9005341001', true,
    'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
  ) RETURNING id INTO v_customer;

  INSERT INTO public.productos (
    id, tenant_id, codigo, nombre, estado, activo, es_servicio,
    controla_stock, precio_venta, precio_compra, afectacion_igv,
    stock, stock_actual, stock_reservado
  ) VALUES
    (
      v_product_accept, v_tenant, 'SERV-534-ACEPTAR',
      'Servicio devuelto con aceptación DIAN', 'ACTIVO', true, true, false,
      59.50, 0, '10', 0, 0, 0
    ),
    (
      v_product_reject, v_tenant, 'SERV-534-RECHAZAR',
      'Servicio devuelto con rechazo DIAN', 'ACTIVO', true, true, false,
      59.50, 0, '10', 0, 0, 0
    );

  INSERT INTO public.pedidos_venta (
    tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
    subtotal, igv, total, moneda, created_by
  ) VALUES (
    v_tenant, v_customer, 'PV-534-1', current_date, current_date,
    'FACTURADO', 100, 19, 119, 'COP', v_creator
  ) RETURNING id INTO v_order;

  INSERT INTO public.pedidos_venta_detalle (
    id, tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada,
    cantidad_facturada, created_at
  ) VALUES
    (
      v_order_line_accept, v_tenant, v_order, v_product_accept,
      'Servicio aceptación 534', 1, 59.50, 59.50, 'FACTURADO', 0, 1,
      now() - interval '2 seconds'
    ),
    (
      v_order_line_reject, v_tenant, v_order, v_product_reject,
      'Servicio rechazo 534', 1, 59.50, 59.50, 'FACTURADO', 0, 1,
      now() - interval '1 second'
    );

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, estado_sunat,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal,
    impuesto_igv, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, pedido_id, cliente_id, created_by,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion,
    cdr_content, metadata
  ) VALUES (
    v_tenant, 'FACTURA', 'FV', '00000134', 'EMITIDO', 'PENDIENTE',
    now(), now() + interval '30 days', 'COP', 1, 100, 19, 119,
    100, 0, 0, 0, v_order, v_customer, v_creator,
    '900123456-8', 'Emisor Colombia verify 534', 'Carrera 7 # 10-20',
    '31', '9005341001', '9005341001', 'Cliente Colombia verify 534',
    'Cliente Colombia verify 534', 'Bogotá', NULL,
    jsonb_build_object(
      'fiscal_country', 'CO',
      'dian_number_reservation_id', v_source_reservation,
      'dian_prefijo_autorizado', 'FV',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', 'FV134'
    )
  ) RETURNING id INTO v_source_document;

  INSERT INTO public.documento_detalles (
    id, tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario,
    descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
    total_item, metadata
  ) VALUES
    (
      v_source_line_accept, v_tenant, v_source_document, 1,
      v_product_accept, 'SERV-534-ACEPTAR', 'Servicio aceptación 534',
      'NIU', 1, 59.50, 0, 50, 9.50, 0, 59.50,
      jsonb_build_object('afectacion_igv', '10')
    ),
    (
      v_source_line_reject, v_tenant, v_source_document, 2,
      v_product_reject, 'SERV-534-RECHAZAR', 'Servicio rechazo 534',
      'NIU', 1, 59.50, 0, 50, 9.50, 0, 59.50,
      jsonb_build_object('afectacion_igv', '10')
    );

  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, cdr_sunat, created_by, event_id,
    metadata, activo
  ) VALUES (
    v_source_cpe, v_tenant, v_source_document, '01', 'FV', '00000134', 134,
    '900123456-8', 'Emisor Colombia verify 534', 'Carrera 7 # 10-20',
    '31', '9005341001', 'Cliente Colombia verify 534', 'Bogotá',
    v_customer, 'COP', 100, 0, 0, 0, 19, 119, 119,
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_product_accept, 'codigo', 'SERV-534-ACEPTAR',
        'descripcion', 'Servicio aceptación 534', 'cantidad', 1,
        'precio_unitario', 59.50, 'valor_venta', 50, 'igv', 9.50,
        'total', 59.50, 'afectacion_igv', '10',
        'source_document_line_id', v_source_line_accept
      ),
      jsonb_build_object(
        'producto_id', v_product_reject, 'codigo', 'SERV-534-RECHAZAR',
        'descripcion', 'Servicio rechazo 534', 'cantidad', 1,
        'precio_unitario', 59.50, 'valor_venta', 50, 'igv', 9.50,
        'total', 59.50, 'afectacion_igv', '10',
        'source_document_line_id', v_source_line_reject
      )
    ),
    now(), current_date + 30, 'FIRMADO', 'PENDIENTE', 'READY', NULL,
    v_creator, v_source_event,
    jsonb_build_object(
      'fiscal_country', 'CO',
      'dian_number_reservation_id', v_source_reservation,
      'dian_prefijo_autorizado', 'FV',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', 'FV134',
      'dian_direccion_emisor', 'Carrera 7 # 10-20',
      'dian_municipio_emisor', 'Bogotá D.C.',
      'dian_departamento_emisor', 'Bogotá D.C.',
      'dian_codigo_dane_emisor', '11001',
      'dian_codigo_departamento_emisor', '11',
      'dian_regimen_fiscal', 'O-13',
      'dian_tipo_contribuyente', '1'
    ), true
  );

  INSERT INTO public.cpe_operaciones (
    id, tenant_id, cpe_id, action, idempotency_key,
    request_fingerprint, state, attempt, origin, request_summary,
    response_summary, result_kind, response_code, terminal_fingerprint,
    completed_at
  ) VALUES (
    v_source_operation, v_tenant, v_source_cpe, 'SEND',
    'verify:534:source:accepted', repeat('1', 64), 'COMPLETED', 1, 'SYSTEM',
    jsonb_build_object(
      'country_code', 'CO', 'dian_evidence_kind', 'CUFE',
      'dian_unique_code', v_source_cufe,
      'authorization', jsonb_build_object(
        'source', 'DIAN_GET_NUMBERING_RANGE', 'environment_id', '2',
        'software_id', 'SOFTWARE-VERIFY-534', 'number', '187640534',
        'prefix', 'FV', 'range_from', 1, 'range_to', 999999,
        'valid_from', (current_date - 30)::text,
        'valid_to', (current_date + 365)::text,
        'technical_key_sha256', repeat('e', 64)
      )
    ),
    jsonb_build_object(
      'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
      'dianEvidenceKind', 'CUFE', 'dianUniqueCode', v_source_cufe,
      'authorityStatusCode', '00', 'authorityDocumentKey', v_source_cufe,
      'expectedDianUniqueCode', v_source_cufe, 'hasCdr', true,
      'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
      'authoritySignatureTrusted', true, 'authorityResponseCount', 1,
      'authorityResponseRoot', 'ApplicationResponse',
      'authorityResponseRootNamespace',
        'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'authorityResponseSignatureCount', 1,
      'authorityApplicationResponseCode', '02',
      'authorityResponseDocumentKey', v_source_cufe,
      'authorityResponse', v_source_response,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_source_response, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_source_response, 'UTF8'), 'sha256'), 'hex'
      )
    ),
    'ACCEPTED', '00', repeat('2', 64), now()
  );

  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      sunat_status = 'ACCEPTED', cdr_sunat = v_source_response,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_source_operation::text
      )
  WHERE id = v_source_cpe AND tenant_id = v_tenant;
  UPDATE public.documentos
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      cdr_content = v_source_response
  WHERE id = v_source_document AND tenant_id = v_tenant;
  UPDATE public.pedidos_venta
  SET factura_id = v_source_cpe
  WHERE id = v_order AND tenant_id = v_tenant;

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_source_cpe)
       IS DISTINCT FROM false
     OR (SELECT issuer_snapshot->>'country_code' FROM public.cpe
         WHERE id = v_source_cpe) IS DISTINCT FROM 'CO'
     OR (SELECT fiscal_authority_evidence->>'status' FROM public.cpe
         WHERE id = v_source_cpe) IS DISTINCT FROM 'ACCEPTED'
     OR (SELECT fiscal_authority_evidence->>'code_kind' FROM public.cpe
         WHERE id = v_source_cpe) IS DISTINCT FROM 'CUFE' THEN
    RAISE EXCEPTION 'VERIFY_534_SOURCE_NOT_REAL_DIAN_ACCEPTED';
  END IF;

  -- Reproduce el TOCTOU dentro de la misma escritura: el origen cambia justo
  -- después del INSERT legado y la postvalidación debe abortar sin residuos.
  SELECT count(*) INTO v_rma_count
  FROM public.rma_solicitudes WHERE tenant_id = v_tenant;
  PERFORM set_config('app.verify_534_invalidate_source_after_rma', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.crear_rma_tx(
      v_tenant, v_creator,
      jsonb_build_object(
        'pedido_id', v_order, 'documento_origen_id', v_source_document,
        'motivo_general', 'Origen cambia durante la creación',
        'items', jsonb_build_array(jsonb_build_object(
          'detalle_id', v_order_line_accept, 'cantidad', 1,
          'motivo_item', 'Debe revertir toda la RMA'
        ))
      ),
      'verify:534:source-toctou:blocked'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM = 'RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  PERFORM set_config('app.verify_534_invalidate_source_after_rma', 'off', true);
  IF NOT v_failed
     OR (SELECT count(*) FROM public.rma_solicitudes
         WHERE tenant_id = v_tenant) <> v_rma_count
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_source_cpe)
          <> 'ACEPTADO'
     OR (SELECT upper(coalesce(estado_sunat::text, '')) FROM public.cpe
         WHERE id = v_source_cpe) <> 'ACEPTADO'
     OR (SELECT upper(coalesce(sunat_status::text, '')) FROM public.cpe
         WHERE id = v_source_cpe) <> 'ACCEPTED'
     OR (SELECT upper(coalesce(tipo_documento, '')) FROM public.cpe
         WHERE id = v_source_cpe) <> '01'
     OR EXISTS (
       SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id = v_tenant
         AND lower(idempotency_key) = 'verify:534:source-toctou:blocked'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_SOURCE_POSTVALIDATION_NOT_ATOMIC';
  END IF;

  -- El estado demo desconocido debe cerrar la frontera fiscal, no caer en el
  -- writer legado. La subtransacción también prueba que no deja una RMA parcial.
  SELECT count(*) INTO v_rma_count
  FROM public.rma_solicitudes WHERE tenant_id = v_tenant;
  UPDATE public.empresa_config SET is_demo = NULL WHERE tenant_id = v_tenant;
  v_failed := false;
  BEGIN
    PERFORM public.crear_rma_tx(
      v_tenant, v_creator,
      jsonb_build_object(
        'pedido_id', v_order, 'documento_origen_id', v_source_document,
        'motivo_general', 'Estado demo desconocido debe bloquear',
        'items', jsonb_build_array(jsonb_build_object(
          'detalle_id', v_order_line_accept, 'cantidad', 1,
          'motivo_item', 'No debe persistir'
        ))
      ),
      'verify:534:null-demo:blocked'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM = 'RMA_FISCAL_DEMO_STATE_UNAVAILABLE' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_failed
     OR (SELECT count(*) FROM public.rma_solicitudes
         WHERE tenant_id = v_tenant) <> v_rma_count
     OR EXISTS (
       SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id = v_tenant
         AND lower(idempotency_key) = 'verify:534:null-demo:blocked'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_NULL_DEMO_NOT_FAIL_CLOSED_ATOMICALLY';
  END IF;
  UPDATE public.empresa_config SET is_demo = false WHERE tenant_id = v_tenant;

  -- El límite se aplica antes del writer RMA legado. Duplicar el detalle aquí
  -- es deliberado: sin el guard 534, otro error ocultaría el riesgo de payload.
  SELECT jsonb_agg(jsonb_build_object(
      'detalle_id', v_order_line_accept,
      'cantidad', 1,
      'motivo_item', 'Línea de límite ' || n::text
    ) ORDER BY n)
  INTO v_many_items
  FROM generate_series(1, 101) AS n;
  v_failed := false;
  BEGIN
    PERFORM public.crear_rma_tx(
      v_tenant, v_creator,
      jsonb_build_object(
        'pedido_id', v_order, 'documento_origen_id', v_source_document,
        'motivo_general', 'Payload fuera del límite DIAN',
        'items', v_many_items
      ),
      'verify:534:line-limit:blocked'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM = 'RMA_DIAN_LINE_LIMIT_EXCEEDED: max=100' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_failed
     OR (SELECT count(*) FROM public.rma_solicitudes
         WHERE tenant_id = v_tenant) <> v_rma_count
     OR EXISTS (
       SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id = v_tenant
         AND lower(idempotency_key) = 'verify:534:line-limit:blocked'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_LINE_LIMIT_NOT_FAIL_CLOSED_ATOMICALLY';
  END IF;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, pedido_id, estado, monto_total,
    monto_original, monto_pendiente, saldo, saldo_pendiente, total,
    fecha_emision, fecha_vencimiento, moneda, numero_documento,
    tipo_documento, idempotency_key, event_source, tipo_cambio_origen,
    metadata
  ) VALUES (
    v_tenant, v_customer, v_source_document, v_order, 'PARCIAL',
    119, 119, 30, 30, 30, 119, current_date, current_date + 30, 'COP',
    'FV134', 'FACTURA', 'verify:534:source:cxc', 'verify.534', 1,
    jsonb_build_object(
      'origen', 'verify_local',
      'dian_number_reservation_id', v_source_reservation,
      'dian_prefijo_autorizado', 'FV',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', 'FV134'
    )
  ) RETURNING id INTO v_source_cxc;

  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    v_tenant, now(), 'Venta origen verify 534', 'Venta origen verify 534',
    'FV134', 119, 119, 'CONFIRMADO', 'VERIFY_534',
    v_source_event, v_creator, v_creator::text
  ) RETURNING id INTO v_source_entry;
  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, nombre, concepto, debe, haber
  ) VALUES
    (v_tenant, v_source_entry, 'Clientes', 'Clientes', 119, 0),
    (v_tenant, v_source_entry, 'Venta e IVA', 'Venta e IVA', 0, 119);

  -- Una NC previa puede consumir el importe de una línea sin pasar por RMA.
  -- La nueva RMA debe fallar al nacer (y revertir íntegra), no después de ser
  -- aprobada y recibida. La subtransacción revierte también la NC de fixture.
  SELECT count(*) INTO v_rma_count
  FROM public.rma_solicitudes WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_document_count
  FROM public.documentos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_cpe_count
  FROM public.cpe WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_note_operation_count
  FROM public.notas_referenciadas_operaciones WHERE tenant_id = v_tenant;
  v_failed := false;
  BEGIN
    PERFORM app.crear_nota_referenciada_co_529(
      v_tenant, v_creator, v_source_document,
      '91', '1', 'Crédito parcial previo a la devolución', 29.75,
      'verify:534:prior-line-credit',
      jsonb_build_array(jsonb_build_object(
        'source_document_line_id', v_source_line_accept,
        'cantidad', 0.5, 'base', 25, 'impuesto', 4.75, 'total', 29.75
      )), false
    );
    PERFORM public.crear_rma_tx(
      v_tenant, v_creator,
      jsonb_build_object(
        'pedido_id', v_order, 'documento_origen_id', v_source_document,
        'motivo_general', 'Saldo fiscal previo debe bloquear',
        'items', jsonb_build_array(jsonb_build_object(
          'detalle_id', v_order_line_accept, 'cantidad', 1,
          'motivo_item', 'No debe superar el saldo fiscal restante'
        ))
      ),
      'verify:534:prior-line-credit:blocked'
    );
    RAISE EXCEPTION 'VERIFY_534_PRIOR_LINE_CREDIT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM = 'RMA_DIAN_FISCAL_LINE_BALANCE_EXCEEDED:'
         || v_source_line_accept::text THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_failed
     OR (SELECT count(*) FROM public.rma_solicitudes
         WHERE tenant_id = v_tenant) <> v_rma_count
     OR (SELECT count(*) FROM public.documentos
         WHERE tenant_id = v_tenant) <> v_document_count
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant) <> v_cpe_count
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE tenant_id = v_tenant) <> v_note_operation_count
     OR EXISTS (
       SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id = v_tenant
         AND lower(idempotency_key) =
           'verify:534:prior-line-credit:blocked'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_PRIOR_LINE_CREDIT_NOT_FAIL_EARLY_ATOMIC';
  END IF;

  SELECT public.crear_rma_tx(
    v_tenant, v_creator,
    jsonb_build_object(
      'pedido_id', v_order, 'documento_origen_id', v_source_document,
      'motivo_general', 'Devolución que DIAN aceptará',
      'items', jsonb_build_array(jsonb_build_object(
        'detalle_id', v_order_line_accept, 'cantidad', 1,
        'motivo_item', 'Servicio no conforme'
      ))
    ),
    'verify:534:rma:accept:create'
  ) INTO v_result;
  v_rma_accept := (v_result->>'rma_id')::uuid;

  SELECT public.crear_rma_tx(
    v_tenant, v_creator,
    jsonb_build_object(
      'pedido_id', v_order, 'documento_origen_id', v_source_document,
      'motivo_general', 'Devolución que DIAN aceptará',
      'items', jsonb_build_array(jsonb_build_object(
        'detalle_id', v_order_line_accept, 'cantidad', 1,
        'motivo_item', 'Servicio no conforme'
      ))
    ),
    'verify:534:rma:accept:create'
  ) INTO v_same_retry;
  IF coalesce((v_same_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_same_retry->>'rma_id')::uuid IS DISTINCT FROM v_rma_accept THEN
    RAISE EXCEPTION 'VERIFY_534_CREATE_RMA_REPLAY_NOT_IDEMPOTENT:%', v_same_retry;
  END IF;

  SELECT public.crear_rma_tx(
    v_tenant, v_creator,
    jsonb_build_object(
      'pedido_id', v_order, 'documento_origen_id', v_source_document,
      'motivo_general', 'Devolución que DIAN rechazará',
      'items', jsonb_build_array(jsonb_build_object(
        'detalle_id', v_order_line_reject, 'cantidad', 1,
        'motivo_item', 'Servicio no conforme'
      ))
    ),
    'verify:534:rma:reject:create'
  ) INTO v_result;
  v_rma_reject := (v_result->>'rma_id')::uuid;

  IF v_rma_accept IS NULL OR v_rma_reject IS NULL
     OR v_rma_accept = v_rma_reject
     OR (SELECT cpe_origen_id FROM public.rma_solicitudes
         WHERE id = v_rma_accept) IS DISTINCT FROM v_source_cpe
     OR (SELECT cpe_origen_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS DISTINCT FROM v_source_cpe THEN
    RAISE EXCEPTION 'VERIFY_534_RMA_SOURCE_LINK_INVALID';
  END IF;

  SELECT id INTO v_rma_item_accept
  FROM public.rma_items
  WHERE tenant_id = v_tenant AND rma_id = v_rma_accept;
  SELECT id INTO v_rma_item_reject
  FROM public.rma_items
  WHERE tenant_id = v_tenant AND rma_id = v_rma_reject;

  PERFORM public.decidir_rma_tx(
    v_tenant, v_approver, v_rma_accept, true,
    'Aprobación segregada', 'verify:534:rma:accept:approve'
  );
  PERFORM public.decidir_rma_tx(
    v_tenant, v_approver, v_rma_reject, true,
    'Aprobación segregada', 'verify:534:rma:reject:approve'
  );
  PERFORM public.recepcionar_rma_tx(
    v_tenant, v_approver, v_rma_accept,
    jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'rma_item_id', v_rma_item_accept, 'cantidad_recibida', 1
    ))),
    'verify:534:rma:accept:receive'
  );
  PERFORM public.recepcionar_rma_tx(
    v_tenant, v_approver, v_rma_reject,
    jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'rma_item_id', v_rma_item_reject, 'cantidad_recibida', 1
    ))),
    'verify:534:rma:reject:receive'
  );

  IF (SELECT estado FROM public.rma_solicitudes WHERE id = v_rma_accept)
       <> 'RECIBIDA'
     OR (SELECT estado FROM public.rma_solicitudes WHERE id = v_rma_reject)
       <> 'RECIBIDA'
     OR (SELECT documento_detalle_id FROM public.rma_items
         WHERE id = v_rma_item_accept) IS DISTINCT FROM v_source_line_accept
     OR (SELECT documento_detalle_id FROM public.rma_items
         WHERE id = v_rma_item_reject) IS DISTINCT FROM v_source_line_reject THEN
    RAISE EXCEPTION 'VERIFY_534_RMA_RECEIPT_OR_LINE_MAPPING_INVALID';
  END IF;

  SELECT count(*) INTO v_document_count
  FROM public.documentos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_cpe_count
  FROM public.cpe WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_note_operation_count
  FROM public.notas_referenciadas_operaciones WHERE tenant_id = v_tenant;
  PERFORM set_config('app.verify_534_skip_document_correlation', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(
      v_tenant, v_approver, v_rma_accept,
      jsonb_build_object('motivo', 'Correlación de documento bloqueada'),
      'verify:534:rma:accept:correlation-blocked'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN
    IF SQLERRM = 'RMA_DIAN_NOTE_DOCUMENT_CORRELATION_MISSING' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  PERFORM set_config('app.verify_534_skip_document_correlation', 'off', true);
  IF NOT v_failed
     OR (SELECT count(*) FROM public.documentos
         WHERE tenant_id = v_tenant) <> v_document_count
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant) <> v_cpe_count
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE tenant_id = v_tenant) <> v_note_operation_count
     OR EXISTS (
       SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id = v_tenant
         AND lower(idempotency_key) =
           'verify:534:rma:accept:correlation-blocked'
     )
     OR (SELECT nota_credito_documento_id FROM public.rma_solicitudes
         WHERE id = v_rma_accept) IS NOT NULL
     OR (SELECT nota_credito_cpe_id FROM public.rma_solicitudes
         WHERE id = v_rma_accept) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_534_DOCUMENT_CORRELATION_NOT_ATOMIC';
  END IF;

  -- Una clave de cliente puede existir en el writer genérico de notas por una
  -- operación comercial distinta. La RMA debe derivar su propia clave interna.
  INSERT INTO public.notas_referenciadas_operaciones (
    tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
    documento_origen_id, payload, resultado
  ) VALUES (
    v_tenant, v_approver, 'CREAR', 'verify:534:rma:accept:note', repeat('f', 64),
    v_source_document,
    jsonb_build_object('fixture', 'generic-key-collision'),
    jsonb_build_object('fixture', 'generic-key-collision')
  );

  SELECT public.emitir_nota_credito_rma_tx(
    v_tenant, v_approver, v_rma_accept,
    jsonb_build_object('motivo', 'Devolución de servicio no conforme'),
    'verify:534:rma:accept:note'
  ) INTO v_result;
  v_note_document := (v_result->>'documento_id')::uuid;
  v_note_cpe := (v_result->>'cpe_id')::uuid;
  SELECT idempotency_key INTO v_internal_note_key
  FROM public.notas_referenciadas_operaciones
  WHERE tenant_id = v_tenant
    AND tipo_operacion = 'CREAR'
    AND nota_documento_id = v_note_document
    AND nota_cpe_id = v_note_cpe;

  IF v_result->>'tipo_documento' IS DISTINCT FROM '91'
     OR v_result->>'financial_effect_status'
          IS DISTINCT FROM 'PENDING_FISCAL_ACCEPTANCE'
     OR v_result->>'estado_rma' IS DISTINCT FROM 'RECIBIDA'
     OR (SELECT tipo_documento FROM public.cpe WHERE id = v_note_cpe) <> '91'
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_note_cpe)
          <> 'BORRADOR'
     OR (SELECT nota_credito_documento_id FROM public.rma_solicitudes
         WHERE id = v_rma_accept) IS DISTINCT FROM v_note_document
     OR (SELECT nota_credito_cpe_id FROM public.rma_solicitudes
         WHERE id = v_rma_accept) IS DISTINCT FROM v_note_cpe
     OR (SELECT metadata->>'rma_id' FROM public.cpe WHERE id = v_note_cpe)
           IS DISTINCT FROM v_rma_accept::text
     OR v_internal_note_key !~ '^rma534:[0-9a-f]{64}$'
     OR lower(v_internal_note_key) = 'verify:534:rma:accept:note'
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE tenant_id = v_tenant AND tipo_operacion = 'CREAR'
           AND lower(idempotency_key) = 'verify:534:rma:accept:note'
           AND nota_documento_id IS NULL AND nota_cpe_id IS NULL) <> 1
     OR (SELECT count(*) FROM public.rma_operaciones
         WHERE tenant_id = v_tenant AND rma_id = v_rma_accept
           AND tipo = 'EMITIR_NOTA_CREDITO'
           AND lower(idempotency_key) = 'verify:534:rma:accept:note') <> 1
     OR (SELECT count(*) FROM public.documento_detalles
         WHERE tenant_id = v_tenant AND documento_id = v_note_document
           AND metadata->>'source_document_line_id' = v_source_line_accept::text
           AND cantidad = 1 AND valor_venta = 50
           AND impuesto_igv = 9.50 AND total_item = 59.50) <> 1
     OR EXISTS (
       SELECT 1 FROM public.cxc_pagos
       WHERE tenant_id = v_tenant AND documento_id = v_note_document
     )
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE tenant_id = v_tenant
         AND nota_credito_documento_id = v_note_document
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant
         AND aggregate_id = v_note_document::text
         AND event_type = 'nota_credito.emitida'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_PENDING_NOTE_NOT_NEUTRAL:%', v_result;
  END IF;

  SELECT public.emitir_nota_credito_rma_tx(
    v_tenant, v_approver, v_rma_accept,
    jsonb_build_object('motivo', 'Devolución de servicio no conforme'),
    'verify:534:rma:accept:note'
  ) INTO v_same_retry;
  IF coalesce((v_same_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_same_retry->>'documento_id')::uuid IS DISTINCT FROM v_note_document
     OR (v_same_retry->>'cpe_id')::uuid IS DISTINCT FROM v_note_cpe THEN
    RAISE EXCEPTION 'VERIFY_534_PENDING_NOTE_REPLAY_NOT_IDEMPOTENT:%', v_same_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.revertir_recepcion_rma_tx(
      v_tenant, v_approver, v_rma_accept,
      'No se puede revertir con nota DIAN pendiente',
      'verify:534:rma:accept:reverse:blocked'
    );
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'RMA_RECEIPT_REVERSAL_NOT_ALLOWED' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_failed
     OR (SELECT estado FROM public.rma_solicitudes WHERE id = v_rma_accept)
          <> 'RECIBIDA'
     OR (SELECT cantidad_devuelta FROM public.rma_items
         WHERE id = v_rma_item_accept) <> 1
     OR EXISTS (
       SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id = v_tenant
         AND idempotency_key = 'verify:534:rma:accept:reverse:blocked'
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_PENDING_NOTE_DID_NOT_BLOCK_REVERSAL_ATOMICALLY';
  END IF;

  v_sha := encode(
    extensions.digest(convert_to(v_note_xml, 'UTF8'), 'sha256'), 'hex'
  );
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_approver, v_note_cpe, v_note_xml,
    'HASH-VERIFY-534-ACCEPT', v_sha, 'verify:534:rma:accept:sign'
  );
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_approver, v_note_cpe,
    'verify:534:rma:accept:send', 'USER'
  ) INTO v_note_claim;
  v_note_operation := (v_note_claim->'operation'->>'id')::uuid;
  v_note_token := (v_note_claim->'operation'->>'claim_token')::uuid;
  PERFORM public.reservar_paquete_dian_tx(
    v_tenant, v_note_operation, v_note_token,
    extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer,
    '000'
  );
  PERFORM public.sellar_envio_dian_tx(
    v_tenant, v_note_operation, v_note_token, v_note_sealed_xml,
    'CUDE', v_note_cude,
    jsonb_build_object(
      'source', 'DIAN_SOFTWARE_CATALOG', 'environment_id', '2',
      'software_id', 'SOFTWARE-VERIFY-534', 'document_series', 'NC01'
    ),
    jsonb_build_object(
      'contributor_type', 'PERSONA_JURIDICA',
      'fiscal_regime', 'RESPONSABLE_IVA'
    )
  );

  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, v_note_operation, v_note_token, 'ACCEPTED', '00',
    'Nota crédito DIAN 91 aceptada', v_note_response,
    repeat('3', 64), v_note_cude,
    jsonb_build_object(
      'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
      'dianEvidenceKind', 'CUDE', 'dianUniqueCode', v_note_cude,
      'authorityStatusCode', '00', 'authorityDocumentKey', v_note_cude,
      'expectedDianUniqueCode', v_note_cude, 'hasCdr', true,
      'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
      'authoritySignatureTrusted', true, 'authorityResponseCount', 1,
      'authorityResponseRoot', 'ApplicationResponse',
      'authorityResponseRootNamespace',
        'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'authorityResponseSignatureCount', 1,
      'authorityApplicationResponseCode', '02',
      'authorityResponseDocumentKey', v_note_cude,
      'authorityResponse', v_note_response,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_note_response, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_note_response, 'UTF8'), 'sha256'), 'hex'
      )
    )
  );

  IF (SELECT estado FROM public.rma_solicitudes WHERE id = v_rma_accept)
       <> 'CERRADA'
     OR (SELECT metadata->>'dian_note_status' FROM public.rma_solicitudes
         WHERE id = v_rma_accept) IS DISTINCT FROM 'ACEPTADA'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar
         WHERE id = v_source_cxc) <> 0
     OR (SELECT count(*) FROM public.cxc_pagos
         WHERE tenant_id = v_tenant AND documento_id = v_note_document
           AND monto = 30
           AND metadata->>'rma_id' = v_rma_accept::text
           AND metadata->>'rma_dian_contract_version' = '534') <> 1
     OR (SELECT count(*) FROM public.saldos_favor_clientes
         WHERE tenant_id = v_tenant
           AND nota_credito_documento_id = v_note_document
           AND nota_credito_cpe_id = v_note_cpe
           AND rma_id = v_rma_accept
           AND monto_disponible = 29.50) <> 1
     OR (SELECT count(*) FROM public.saldos_favor_movimientos
         WHERE tenant_id = v_tenant
           AND metadata->>'nota_credito_cpe_id' = v_note_cpe::text
           AND metadata->>'rma_id' = v_rma_accept::text
           AND metadata->>'rma_dian_contract_version' = '534') <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant
           AND aggregate_id = v_note_document::text
           AND event_type = 'nota_credito.emitida'
           AND payload->>'tipoDocumento' = '91'
           AND payload->>'rmaId' = v_rma_accept::text) <> 1
     OR (SELECT count(*) FROM public.rma_eventos
         WHERE tenant_id = v_tenant AND rma_id = v_rma_accept
           AND tipo = 'NOTA_DIAN_ACEPTADA') <> 1
     OR (SELECT resultado->>'rma_id'
         FROM public.notas_referenciadas_operaciones
         WHERE tenant_id = v_tenant AND nota_cpe_id = v_note_cpe
           AND tipo_operacion = 'APLICAR_ACEPTACION')
          IS DISTINCT FROM v_rma_accept::text THEN
    RAISE EXCEPTION 'VERIFY_534_ACCEPTANCE_DID_NOT_CLOSE_AND_LINK_EFFECTS';
  END IF;

  SELECT count(*) INTO v_payment_count
  FROM public.cxc_pagos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_balance_count
  FROM public.saldos_favor_clientes WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_effect_outbox_count
  FROM public.outbox_events
  WHERE tenant_id = v_tenant
    AND event_type = 'nota_credito.emitida';
  SELECT public.emitir_nota_credito_rma_tx(
    v_tenant, v_approver, v_rma_accept,
    jsonb_build_object('motivo', 'Devolución de servicio no conforme'),
    'verify:534:rma:accept:note'
  ) INTO v_same_retry;
  IF coalesce((v_same_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_same_retry->>'documento_id')::uuid IS DISTINCT FROM v_note_document
     OR (v_same_retry->>'cpe_id')::uuid IS DISTINCT FROM v_note_cpe THEN
    RAISE EXCEPTION 'VERIFY_534_CLOSED_RMA_REPLAY_NOT_IDEMPOTENT:%', v_same_retry;
  END IF;
  PERFORM app.aplicar_efecto_nota_dian_529(v_tenant, v_note_cpe);
  IF (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id = v_tenant)
       <> v_payment_count
     OR (SELECT count(*) FROM public.saldos_favor_clientes
         WHERE tenant_id = v_tenant) <> v_balance_count
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant
           AND event_type = 'nota_credito.emitida')
          <> v_effect_outbox_count THEN
    RAISE EXCEPTION 'VERIFY_534_ACCEPTANCE_RETRY_DUPLICATED_EFFECT';
  END IF;

  SELECT public.emitir_nota_credito_rma_tx(
    v_tenant, v_approver, v_rma_reject,
    jsonb_build_object('motivo', 'Devolución rechazada por DIAN'),
    'verify:534:rma:reject:note'
  ) INTO v_result;
  v_rejected_document := (v_result->>'documento_id')::uuid;
  v_rejected_cpe := (v_result->>'cpe_id')::uuid;

  IF v_result->>'financial_effect_status'
       IS DISTINCT FROM 'PENDING_FISCAL_ACCEPTANCE'
     OR (SELECT nota_credito_documento_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS DISTINCT FROM v_rejected_document
     OR EXISTS (
       SELECT 1 FROM public.cxc_pagos
       WHERE tenant_id = v_tenant AND documento_id = v_rejected_document
     )
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE tenant_id = v_tenant
         AND nota_credito_documento_id = v_rejected_document
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_REJECTION_CASE_NOT_PENDING_AND_NEUTRAL';
  END IF;

  v_sha := encode(
    extensions.digest(convert_to(v_rejected_xml, 'UTF8'), 'sha256'), 'hex'
  );
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_approver, v_rejected_cpe, v_rejected_xml,
    'HASH-VERIFY-534-REJECT', v_sha, 'verify:534:rma:reject:sign'
  );
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_approver, v_rejected_cpe,
    'verify:534:rma:reject:send', 'USER'
  ) INTO v_rejected_claim;
  v_rejected_operation := (v_rejected_claim->'operation'->>'id')::uuid;
  v_rejected_token := (v_rejected_claim->'operation'->>'claim_token')::uuid;
  PERFORM public.reservar_paquete_dian_tx(
    v_tenant, v_rejected_operation, v_rejected_token,
    extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer,
    '001'
  );
  PERFORM public.sellar_envio_dian_tx(
    v_tenant, v_rejected_operation, v_rejected_token, v_rejected_sealed_xml,
    'CUDE', v_rejected_cude,
    jsonb_build_object(
      'source', 'DIAN_SOFTWARE_CATALOG', 'environment_id', '2',
      'software_id', 'SOFTWARE-VERIFY-534', 'document_series', 'NC01'
    ),
    jsonb_build_object(
      'contributor_type', 'PERSONA_JURIDICA',
      'fiscal_regime', 'RESPONSABLE_IVA'
    )
  );
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, v_rejected_operation, v_rejected_token,
    'REJECTED', '99', 'Nota crédito rechazada por DIAN',
    NULL, NULL, v_rejected_cude,
    jsonb_build_object(
      'countryCode', 'CO', 'success', false, 'resultKind', 'REJECTED',
      'dianEvidenceKind', 'CUDE', 'dianUniqueCode', v_rejected_cude,
      'authorityStatusCode', '99', 'authority', 'DIAN'
    )
  );

  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_rejected_cpe)
       <> 'RECHAZADO'
     OR (SELECT upper(estado::text) FROM public.documentos
         WHERE id = v_rejected_document) <> 'RECHAZADO'
     OR (SELECT metadata->>'financial_effect_status' FROM public.cpe
         WHERE id = v_rejected_cpe)
          IS DISTINCT FROM 'REJECTED_NO_FINANCIAL_EFFECT'
     OR (SELECT estado FROM public.rma_solicitudes WHERE id = v_rma_reject)
          <> 'RECIBIDA'
     OR (SELECT nota_credito_documento_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS NOT NULL
     OR (SELECT nota_credito_cpe_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS NOT NULL
     OR (SELECT metadata->>'last_rejected_dian_note_document_id'
         FROM public.rma_solicitudes WHERE id = v_rma_reject)
          IS DISTINCT FROM v_rejected_document::text
     OR (SELECT metadata->>'last_rejected_dian_note_cpe_id'
         FROM public.rma_solicitudes WHERE id = v_rma_reject)
          IS DISTINCT FROM v_rejected_cpe::text
     OR EXISTS (
       SELECT 1 FROM public.cxc_pagos
       WHERE tenant_id = v_tenant AND documento_id = v_rejected_document
     )
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE tenant_id = v_tenant
         AND nota_credito_documento_id = v_rejected_document
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant
         AND aggregate_id = v_rejected_document::text
         AND event_type = 'nota_credito.emitida'
     )
     OR (SELECT count(*) FROM public.rma_eventos
         WHERE tenant_id = v_tenant AND rma_id = v_rma_reject
           AND tipo = 'NOTA_DIAN_RECHAZADA') <> 1
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id = v_tenant)
          <> v_payment_count
     OR (SELECT count(*) FROM public.saldos_favor_clientes
         WHERE tenant_id = v_tenant) <> v_balance_count THEN
    RAISE EXCEPTION 'VERIFY_534_REJECTION_APPLIED_EFFECT_OR_DID_NOT_RELEASE_RMA';
  END IF;

  SELECT public.emitir_nota_credito_rma_tx(
    v_tenant, v_approver, v_rma_reject,
    jsonb_build_object('motivo', 'Devolución rechazada por DIAN'),
    'verify:534:rma:reject:note'
  ) INTO v_same_retry;
  IF coalesce((v_same_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_same_retry->>'documento_id')::uuid IS DISTINCT FROM v_rejected_document
     OR (v_same_retry->>'cpe_id')::uuid IS DISTINCT FROM v_rejected_cpe
     OR (SELECT nota_credito_documento_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS NOT NULL
     OR (SELECT nota_credito_cpe_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_534_REJECTED_NOTE_REPLAY_REBOUND_RMA:%', v_same_retry;
  END IF;

  SELECT public.emitir_nota_credito_rma_tx(
    v_tenant, v_approver, v_rma_reject,
    jsonb_build_object('motivo', 'Devolución corregida para reintento'),
    'verify:534:rma:reject:retry-note'
  ) INTO v_retry;
  v_retry_document := (v_retry->>'documento_id')::uuid;
  v_retry_cpe := (v_retry->>'cpe_id')::uuid;

  IF v_retry_document IS NULL OR v_retry_cpe IS NULL
     OR v_retry_document = v_rejected_document
     OR v_retry_cpe = v_rejected_cpe
     OR v_retry->>'financial_effect_status'
          IS DISTINCT FROM 'PENDING_FISCAL_ACCEPTANCE'
     OR v_retry->>'estado_rma' IS DISTINCT FROM 'RECIBIDA'
     OR (SELECT nota_credito_documento_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS DISTINCT FROM v_retry_document
     OR (SELECT nota_credito_cpe_id FROM public.rma_solicitudes
         WHERE id = v_rma_reject) IS DISTINCT FROM v_retry_cpe
     OR EXISTS (
       SELECT 1 FROM public.cxc_pagos
       WHERE tenant_id = v_tenant AND documento_id = v_retry_document
     )
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE tenant_id = v_tenant
         AND nota_credito_documento_id = v_retry_document
     ) THEN
    RAISE EXCEPTION 'VERIFY_534_REJECTED_RMA_NOT_RETRYABLE:%', v_retry;
  END IF;
END;
$runtime$;

SELECT 'VERIFY_534_OK' AS resultado;

ROLLBACK;
