\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_524') THEN
    RAISE EXCEPTION 'VERIFY_524_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contracts$
DECLARE
  v_finalize_def text;
BEGIN
  IF has_function_privilege('anon', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_524_CLIENT_WRITER_EXPOSED_TO_JWT_ROLE';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.finalizar_envio_cpe_tx(uuid,uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_524_SERVICE_ROLE_WRITER_GRANT_MISSING';
  END IF;
  IF has_function_privilege('service_role', 'app.finalize_cpe_operation_524(text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.crear_nota_referenciada_ar_524(uuid,uuid,uuid,text,text,text,numeric,text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.hydrate_demo_foundation_464(uuid,uuid,text,bytea,text,timestamp with time zone)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.hydrate_demo_foundation_464_legacy_524(uuid,uuid,text,bytea,text,timestamp with time zone)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_fiscal_acceptance_evidence_524(uuid,uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_524_INTERNAL_WRITER_EXPOSED';
  END IF;

  SELECT pg_get_functiondef(
    'app.finalize_cpe_operation_524(text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
  ) INTO v_finalize_def;
  IF strpos(v_finalize_def, 'hashtextextended(p_tenant_id::text || '':cpe:''') = 0
     OR strpos(v_finalize_def, ', 476)') = 0
     OR strpos(v_finalize_def, 'PERFORM pg_advisory_xact_lock') >
        strpos(v_finalize_def, 'SELECT * INTO v_cpe')
     OR strpos(v_finalize_def, 'SELECT * INTO v_cpe') >
        strpos(v_finalize_def, 'SELECT * INTO v_op') THEN
    RAISE EXCEPTION 'VERIFY_524_LOCK_ORDER_DIVERGED_FROM_476';
  END IF;
  IF v_finalize_def LIKE '%''country'', v_country,%response_summary%' THEN
    RAISE EXCEPTION 'VERIFY_524_TERMINAL_FINGERPRINT_BREAKS_476_REPLAY';
  END IF;
  IF strpos(
       pg_get_functiondef('public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)'::regprocedure),
       'app.crear_nota_referenciada_ar_524'
     ) = 0
     OR strpos(
       pg_get_functiondef('app.aplicar_efecto_nota_aceptada_494(uuid,uuid)'::regprocedure),
       'app.cpe_fiscal_acceptance_evidence_524'
     ) = 0 THEN
    RAISE EXCEPTION 'VERIFY_524_REFERENCED_NOTE_COUNTRY_GATE_MISSING';
  END IF;
END;
$contracts$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_customer jsonb;
  v_legacy_customer jsonb;
  v_customer_id uuid;
  v_document uuid := gen_random_uuid();
  v_cpe uuid := gen_random_uuid();
  v_source_event uuid := gen_random_uuid();
  v_original_entry uuid;
  v_source_cxc uuid;
  v_claim jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_evidence jsonb;
  v_failed boolean;
  v_note jsonb;
  v_note_document uuid;
  v_note_cpe uuid;
  v_note_number text;
  v_xml text := '<SignedArcaCreditNote>' || repeat('x', 180) || '</SignedArcaCreditNote>';
  v_sha text;
  v_query_document uuid := gen_random_uuid();
  v_query_cpe uuid := gen_random_uuid();
  v_query_claim jsonb;
  v_query_operation uuid;
  v_query_token uuid;
  v_country text;
  v_country_document uuid;
  v_country_cpe uuid;
  v_country_claim jsonb;
  v_num integer := 100;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY ARCA 524', 1, 'AR');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);
  UPDATE public.empresa_config
  SET pais = 'AR', ruc = '30710158229', razon_social = 'Empresa AR 524',
      moneda_defecto = 'ARS', arca_punto_venta = 12,
      arca_condicion_iva = 'RESPONSABLE_INSCRIPTO',
      -- Este verificador ejercita aceptación CAE real. Desde 536 las demos AR
      -- fallan cerrado antes de reservar SEND, por lo que el fixture debe
      -- declarar explícitamente la conversión que su escenario siempre asumió.
      is_demo = false, demo_extended = false, demo_expires_at = NULL
  WHERE tenant_id = v_tenant;

  v_failed := false;
  BEGIN
    UPDATE public.empresa_config SET arca_punto_venta = 99999 WHERE tenant_id = v_tenant;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_ARCA_POINT_99999_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    UPDATE public.empresa_config SET arca_condicion_iva = 'CONSUMIDOR_FINAL' WHERE tenant_id = v_tenant;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_ISSUER_VAT_UNSUPPORTED_ACCEPTED'; END IF;

  -- El rollout es DB-first: el runtime anterior todavía no enviaba la
  -- condición IVA. El writer debe aceptar temporalmente ese alta, dejar NULL
  -- y permitir que la frontera fiscal nueva la bloquee antes de ARCA.
  v_legacy_customer := public.crear_cliente_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object('tipo', 'PERSONA', 'documento_tipo', 'CUIL',
      'documento_numero', '20222222223', 'razon_social', 'Cliente rollout sin IVA')
  );
  IF v_legacy_customer->>'arca_condicion_iva' IS NOT NULL
     OR (SELECT arca_condicion_iva FROM public.clientes
         WHERE id = (v_legacy_customer->>'id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_524_DB_FIRST_COMPATIBILITY_DIVERGED:%', v_legacy_customer;
  END IF;

  v_customer := public.crear_cliente_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object('tipo', 'PERSONA', 'documento_tipo', 'CUIL',
      'documento_numero', '20123456786', 'razon_social', 'Cliente AR 524',
      'arca_condicion_iva', 'MONOTRIBUTO')
  );
  v_customer_id := (v_customer->>'id')::uuid;
  IF v_customer->>'arca_condicion_iva' <> 'MONOTRIBUTO'
     OR (SELECT arca_condicion_iva FROM public.clientes WHERE id = v_customer_id) <> 'MONOTRIBUTO' THEN
    RAISE EXCEPTION 'VERIFY_524_CONDICION_IVA_NO_PERSISTIDA:%', v_customer;
  END IF;

  IF app.arca_valid_yyyymmdd_524('20260230') OR app.arca_valid_yyyymmdd_524('99999999') THEN
    RAISE EXCEPTION 'VERIFY_524_INVALID_ARCA_DATE_ACCEPTED';
  END IF;
  FOREACH v_country IN ARRAY ARRAY['019', '051'] LOOP
    v_failed := false;
    BEGIN
      PERFORM app.arca_expected_cbte_type_524(v_country, 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO');
    EXCEPTION WHEN check_violation THEN
      v_failed := SQLERRM LIKE '%ARCA_DOCUMENT_TYPE_NOT_ENABLED%';
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_UNENABLED_ARCA_TYPE_ACCEPTED:%', v_country; END IF;
  END LOOP;

  INSERT INTO public.documentos (
    id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, tipo_cambio, subtotal, impuesto_igv, total, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, cliente_id,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion,
    estado, estado_sunat, created_by, updated_by
  ) VALUES (
    v_document, v_tenant, 'FACTURA', '00012', '00000037', now(), now() + interval '30 days',
    'ARS', 1, 100, 21, 121, 100, 0, 0, 0, v_customer_id,
    '30710158229', 'Empresa AR 524', 'Buenos Aires', '86',
    '20123456786', '20123456786', 'Cliente AR 524', 'Cliente AR 524',
    'Buenos Aires', 'EMITIDO', 'PENDIENTE', v_actor, v_actor
  );
  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, codigo_producto, descripcion,
    unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata
  ) VALUES (
    v_tenant, v_document, 1, 'AR524', 'Servicio AR 524', 'ZZ',
    1, 121, 0, 100, 21, 0, 121, jsonb_build_object('afectacion_igv', '10')
  );
  INSERT INTO public.cpe (
    id, tenant_id, documento_id, cliente_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, moneda, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat, sunat_status,
    hash, hash_firma, xml_firmado, created_by, event_id, activo, metadata
  ) VALUES (
    v_cpe, v_tenant, v_document, v_customer_id, '01', '00012',
    '00000037', 37, '30710158229', 'Empresa AR 524', 'Buenos Aires',
    '86', '20123456786', 'Cliente AR 524', 'Buenos Aires', 'ARS',
    100, 0, 0, 0, 21, 121, 121,
    '[{"codigo":"AR524","descripcion":"Servicio","cantidad":1,"unidad":"ZZ","precio_unitario":121,"valor_venta":100,"igv":21,"total":121,"afectacion_igv":"10"}]'::jsonb,
    now(), 'verify.arca.524', 'FIRMADO', 'PENDIENTE', 'READY',
    'LOCAL-HASH-524', 'LOCAL-HASH-524', '<ArcaComprobante/>',
    v_actor, v_source_event, true,
    jsonb_build_object('arca_punto_venta', 12,
      'arca_condicion_iva_emisor', 'RESPONSABLE_INSCRIPTO',
      'arca_condicion_iva_receptor', 'MONOTRIBUTO')
  );
  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, total, fecha_emision,
    fecha_vencimiento, moneda, numero_documento, tipo_documento,
    idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES (
    v_tenant, v_customer_id, v_document, 'PENDIENTE', 121, 121, 121, 121,
    121, 121, current_date, current_date + 30, 'ARS', '00012-00000037',
    'FACTURA', 'verify-524-source-cxc', 'verify.524', 1,
    jsonb_build_object('origen', 'verify_local')
  ) RETURNING id INTO v_source_cxc;
  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    v_tenant, now(), 'Venta origen verify 524', 'Venta origen verify 524',
    '00012-00000037', 121, 121, 'CONFIRMADO', 'VERIFY_524',
    v_source_event, v_actor, v_actor::text
  ) RETURNING id INTO v_original_entry;
  INSERT INTO public.detalle_asientos (tenant_id, asiento_id, nombre, concepto, debe, haber)
  VALUES
    (v_tenant, v_original_entry, 'Clientes', 'Clientes', 121, 0),
    (v_tenant, v_original_entry, 'Venta e IVA', 'Venta e IVA', 0, 121);

  v_claim := public.reservar_envio_cpe_tx(v_tenant, v_actor, v_cpe, 'verify.send.arca.524', 'USER');

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
      'ACCEPTED', 'A', 'CAE corto', NULL, '1234567890123', '00012-00000037',
      jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
        'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
        'numeroComprobante', '00012-00000037', 'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO',
        'condicionIvaReceptorId', 6)
    );
  EXCEPTION WHEN check_violation THEN v_failed := SQLERRM LIKE '%ARCA_ACCEPTANCE_EVIDENCE_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_SHORT_CAE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
      'ACCEPTED', 'A', 'Fecha imposible', NULL, '70417054367476', '00012-00000037',
      jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
        'caeVencimiento', '20260230', 'puntoVenta', 12, 'tipoComprobante', 1,
        'numeroComprobante', '00012-00000037', 'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO',
        'condicionIvaReceptorId', 6)
    );
  EXCEPTION WHEN check_violation THEN v_failed := SQLERRM LIKE '%ARCA_ACCEPTANCE_EVIDENCE_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_INVALID_CAE_DATE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
      'ACCEPTED', 'A', 'País cruzado', NULL, '70417054367476', '00012-00000037',
      jsonb_build_object('success', true, 'countryCode', 'PE', 'resultKind', 'ACCEPTED',
        'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
        'numeroComprobante', '00012-00000037', 'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO',
        'condicionIvaReceptorId', 6)
    );
  EXCEPTION WHEN check_violation THEN v_failed := SQLERRM LIKE '%CPE_ACCEPTANCE_COUNTRY_OR_RESULT_MISMATCH%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_CROSS_COUNTRY_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
      'ACCEPTED', 'A', 'Tipo E no habilitado', NULL, '70417054367476', '00012-00000037',
      jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
        'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 19,
        'numeroComprobante', '00012-00000037', 'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO',
        'condicionIvaReceptorId', 6)
    );
  EXCEPTION WHEN check_violation THEN v_failed := SQLERRM LIKE '%ARCA_AUTHORIZED_IDENTITY_MISMATCH%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_WRONG_ARCA_TYPE_ACCEPTED'; END IF;

  v_result := public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
    'ACCEPTED', 'A', 'Autorizado por ARCA', NULL, '70417054367476', '00012-00000037',
    jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
      'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
      'numeroComprobante', '00012-00000037', 'qrUrl', 'https://www.arca.gob.ar/fe/qr/?p=verify524',
      'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO', 'condicionIvaReceptorId', 6)
  );
  IF v_result->'cpe'->>'estado' <> 'ACEPTADO'
     OR (SELECT cdr_sunat FROM public.cpe WHERE id = v_cpe) IS NOT NULL
     OR (SELECT hash FROM public.cpe WHERE id = v_cpe) <> '70417054367476'
     OR (SELECT metadata->>'arca_cae_vencimiento' FROM public.cpe WHERE id = v_cpe) <> '20260908'
     OR (SELECT (metadata->>'arca_punto_venta')::integer FROM public.cpe WHERE id = v_cpe) <> 12
     OR (SELECT (metadata->>'arca_cbte_tipo')::integer FROM public.cpe WHERE id = v_cpe) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_524_ARCA_CAE_NO_FINALIZO:%', v_result;
  END IF;

  v_retry := public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
    'ACCEPTED', 'A', 'Autorizado por ARCA', NULL, '70417054367476', '00012-00000037',
    jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
      'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
      'numeroComprobante', '00012-00000037', 'qrUrl', 'https://www.arca.gob.ar/fe/qr/?p=verify524',
      'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO', 'condicionIvaReceptorId', 6)
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'VERIFY_524_476_COMPATIBLE_REPLAY_FAILED:%', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
      'ACCEPTED', 'A', 'Autorizado por ARCA', NULL, '70417054367479', '00012-00000037',
      jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
        'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
        'numeroComprobante', '00012-00000037', 'qrUrl', 'https://www.arca.gob.ar/fe/qr/?p=verify524',
        'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO', 'condicionIvaReceptorId', 6)
    );
  EXCEPTION WHEN unique_violation THEN v_failed := SQLERRM LIKE '%CPE_OPERATION_TERMINAL_COLLISION%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_TERMINAL_COLLISION_NOT_REJECTED'; END IF;

  v_evidence := app.cpe_fiscal_acceptance_evidence_524(v_tenant, v_cpe, v_document);
  IF v_evidence->>'kind' <> 'ARCA_CAE' OR v_evidence->>'cae' <> '70417054367476'
     OR coalesce(v_evidence->>'sha256', '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'VERIFY_524_ARCA_DURABLE_EVIDENCE_INVALID:%', v_evidence;
  END IF;

  v_note := public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_document, '07', '10',
    'Bonificación ARCA verificada', 10, 'verify:524:arca:credit'
  );
  v_note_document := (v_note->>'documento_id')::uuid;
  v_note_cpe := (v_note->>'cpe_id')::uuid;
  v_note_number := v_note->>'numero';
  IF v_note->>'serie' <> '00012'
     OR (SELECT serie FROM public.documentos WHERE id = v_note_document) <> '00012'
     OR (SELECT serie FROM public.cpe WHERE id = v_note_cpe) <> '00012'
     OR (SELECT metadata->>'financial_effect_status' FROM public.cpe WHERE id = v_note_cpe) <> 'PENDING_FISCAL_ACCEPTANCE'
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_524_ARCA_NOTE_DRAFT_IDENTITY_OR_NEUTRALITY_INVALID:%', v_note;
  END IF;

  v_sha := encode(extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'), 'hex');
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_note_cpe, v_xml, 'HASH-ARCA-NC-524', v_sha, 'verify:524:arca:sign'
  );
  v_claim := public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_note_cpe, 'verify:524:arca:note:send', 'USER'
  );
  v_result := public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
    'ACCEPTED', 'A', 'NC autorizada por ARCA', NULL,
    '70417054367478', '00012-' || v_note_number,
    jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
      'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 3,
      'numeroComprobante', '00012-' || v_note_number,
      'condicionIvaEmisor', 'RESPONSABLE_INSCRIPTO', 'condicionIvaReceptorId', 6)
  );
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 111
     OR (SELECT count(*) FROM public.cxc_pagos WHERE documento_id = v_note_document) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_note_document::text
           AND payload->>'fiscalAcceptanceKind' = 'ARCA_CAE'
           AND payload->>'fiscalAcceptanceCdrSha256' IS NULL) <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_note_cpe AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1
     OR (SELECT cdr_sunat FROM public.cpe WHERE id = v_note_cpe) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_524_ARCA_NOTE_ACCEPTANCE_EFFECT_INVALID:%', v_result;
  END IF;

  INSERT INTO public.documentos (
    id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, subtotal, impuesto_igv, total, total_gravadas, cliente_id,
    emisor_ruc, emisor_razon_social, receptor_tipo_doc, receptor_numero_doc,
    receptor_documento, receptor_razon_social, receptor_nombre,
    estado, estado_sunat, created_by, updated_by
  ) VALUES (
    v_query_document, v_tenant, 'FACTURA', '00012', '00000038', now(), now(),
    'ARS', 100, 21, 121, 100, v_customer_id, '30710158229', 'Empresa AR 524',
    '86', '20123456786', '20123456786', 'Cliente AR 524', 'Cliente AR 524',
    'EMITIDO', 'PENDIENTE', v_actor, v_actor
  );
  INSERT INTO public.cpe (
    id, tenant_id, documento_id, cliente_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    moneda, total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat, sunat_status,
    hash, hash_firma, xml_firmado, created_by, activo, metadata
  ) VALUES (
    v_query_cpe, v_tenant, v_query_document, v_customer_id, '01', '00012',
    '00000038', 38, '30710158229', 'Empresa AR 524', '86', '20123456786',
    'Cliente AR 524', 'ARS', 100, 21, 121, 121,
    '[{"codigo":"ARQ","cantidad":1,"valor_venta":100,"igv":21,"total":121}]'::jsonb,
    now(), 'verify.arca.query.524', 'FIRMADO', 'PENDIENTE', 'READY',
    'LOCAL-QUERY-524', 'LOCAL-QUERY-524', '<ArcaQuery/>', v_actor, true,
    jsonb_build_object('arca_punto_venta', 12,
      'arca_condicion_iva_emisor', 'RESPONSABLE_INSCRIPTO',
      'arca_condicion_iva_receptor', 'MONOTRIBUTO')
  );
  v_claim := public.reservar_envio_cpe_tx(v_tenant, v_actor, v_query_cpe, 'verify:524:query:send', 'USER');
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid, (v_claim->'operation'->>'claim_token')::uuid,
    'PENDING', 'P', 'Pendiente ARCA', NULL, NULL, NULL, '{}'::jsonb
  );
  v_query_claim := public.reservar_consulta_cpe_tx(
    v_tenant, v_actor, v_query_cpe, 'verify:524:query:claim', 'USER'
  );
  v_query_operation := (v_query_claim->'operation'->>'id')::uuid;
  v_query_token := (v_query_claim->'operation'->>'claim_token')::uuid;
  UPDATE public.cpe_operaciones SET request_summary = request_summary || jsonb_build_object('serie', '99999')
  WHERE id = v_query_operation;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_consulta_cpe_tx(
      v_tenant, v_query_operation, v_query_token, 'ACCEPTED', 'A',
      'Consulta con identidad adulterada', NULL, '70417054367477', '00012-00000038',
      jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
        'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
        'numeroComprobante', '00012-00000038')
    );
  EXCEPTION WHEN check_violation THEN v_failed := SQLERRM LIKE '%ARCA_QUERY_PRIOR_IDENTITY_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_QUERY_WITHOUT_PRIOR_IDENTITY_ACCEPTED'; END IF;
  UPDATE public.cpe_operaciones SET request_summary = request_summary || jsonb_build_object('serie', '00012')
  WHERE id = v_query_operation;
  PERFORM public.finalizar_consulta_cpe_tx(
    v_tenant, v_query_operation, v_query_token, 'ACCEPTED', 'A', 'Consulta ARCA autorizada',
    NULL, '70417054367477', '00012-00000038',
    jsonb_build_object('success', true, 'countryCode', 'AR', 'resultKind', 'ACCEPTED',
      'caeVencimiento', '20260908', 'puntoVenta', 12, 'tipoComprobante', 1,
      'numeroComprobante', '00012-00000038')
  );
  IF (SELECT estado FROM public.cpe WHERE id = v_query_cpe) <> 'ACEPTADO' THEN
    RAISE EXCEPTION 'VERIFY_524_ARCA_QUERY_DID_NOT_FINALIZE';
  END IF;

  -- Colombia ya no puede reutilizar este fixture demo para simular una
  -- aceptación externa: 528 prueba la correlación DIAN real y 533 demuestra
  -- que todo transporte de un CPE demo CO se rechaza. Aquí sólo conservamos
  -- el contraste no-ARCA de Perú que corresponde al alcance original de 524.
  FOREACH v_country IN ARRAY ARRAY['PE'] LOOP
    -- 525 vuelve inmutable el país de un tenant que ya tiene CPE reales. El
    -- contraste debe usar su propio contribuyente, no mutar el emisor ARCA que
    -- acaba de recibir CAE en este mismo verificador.
    v_demo := public.create_demo_tenant('VERIFY SUNAT 524', 1, v_country);
    v_tenant := (v_demo->>'tenant_id')::uuid;
    v_actor := (v_demo->>'user_id')::uuid;
    PERFORM set_config('app.current_tenant_id', v_tenant::text, true);
    UPDATE public.empresa_config
    SET pais = v_country, ruc = '20600000524', razon_social = 'Empresa ' || v_country,
        moneda_defecto = 'PEN', is_demo = false,
        demo_extended = false, demo_expires_at = NULL
    WHERE tenant_id = v_tenant;
    v_country_document := gen_random_uuid();
    v_country_cpe := gen_random_uuid();
    v_num := v_num + 1;
    INSERT INTO public.documentos (
      id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
      moneda, subtotal, impuesto_igv, total, total_gravadas,
      emisor_ruc, emisor_razon_social, receptor_tipo_doc, receptor_numero_doc,
      receptor_documento, receptor_razon_social, receptor_nombre,
      estado, estado_sunat, created_by, updated_by
    ) VALUES (
      v_country_document, v_tenant, 'FACTURA', 'F001', lpad(v_num::text, 8, '0'),
      now(), now(), 'PEN', 100, 18, 118, 100, '20600000524',
      'Empresa ' || v_country, '6', '20123456789', '20123456789',
      'Cliente ' || v_country, 'Cliente ' || v_country,
      'EMITIDO', 'PENDIENTE', v_actor, v_actor
    );
    INSERT INTO public.cpe (
      id, tenant_id, documento_id, tipo_documento, serie, numero,
      numero_comprobante, ruc_emisor, razon_social_emisor,
      tipo_documento_receptor, documento_receptor, razon_social_receptor,
      moneda, total_gravadas, total_igv, total_venta, total, items,
      fecha_emision, idempotency_key, estado, estado_sunat, sunat_status,
      hash, hash_firma, xml_firmado, created_by, activo
    ) VALUES (
      v_country_cpe, v_tenant, v_country_document, '01', 'F001',
      lpad(v_num::text, 8, '0'), v_num, '20600000524', 'Empresa ' || v_country,
      '6', '20123456789', 'Cliente ' || v_country, 'PEN', 100, 18, 118, 118,
      '[{"codigo":"CDR","cantidad":1,"valor_venta":100,"igv":18,"total":118}]'::jsonb,
      now(), 'verify.' || lower(v_country) || '.524.' || v_num,
      'FIRMADO', 'PENDIENTE', 'READY', 'LOCAL-' || v_country,
      'LOCAL-' || v_country, '<Signed/>', v_actor, true
    );
    v_country_claim := public.reservar_envio_cpe_tx(
      v_tenant, v_actor, v_country_cpe, 'verify:524:' || lower(v_country) || ':send', 'USER'
    );
    v_failed := false;
    BEGIN
      PERFORM public.finalizar_envio_cpe_tx(
        v_tenant, (v_country_claim->'operation'->>'id')::uuid,
        (v_country_claim->'operation'->>'claim_token')::uuid,
        'ACCEPTED', '0', 'Sin CDR', NULL, 'HASH-' || v_country,
        'F001-' || lpad(v_num::text, 8, '0'), '{}'::jsonb
      );
    EXCEPTION WHEN check_violation THEN v_failed := SQLERRM LIKE '%CPE_ACCEPTANCE_REQUIRES_CDR%';
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_524_COUNTRY_WITHOUT_CDR_ACCEPTED:%', v_country; END IF;
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, (v_country_claim->'operation'->>'id')::uuid,
      (v_country_claim->'operation'->>'claim_token')::uuid,
      'ACCEPTED', '0', 'Con CDR', '<cdr>' || v_country || '-524</cdr>',
      'HASH-' || v_country, 'F001-' || lpad(v_num::text, 8, '0'), '{}'::jsonb
    );
    IF (SELECT cdr_sunat FROM public.cpe WHERE id = v_country_cpe)
       <> '<cdr>' || v_country || '-524</cdr>' THEN
      RAISE EXCEPTION 'VERIFY_524_COUNTRY_CDR_NOT_PERSISTED:%', v_country;
    END IF;
  END LOOP;
END;
$verify$;

ROLLBACK;
