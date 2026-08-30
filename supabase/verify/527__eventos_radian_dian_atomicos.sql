\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_527') THEN
    RAISE EXCEPTION 'VERIFY_527_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contracts$
DECLARE
  v_register text;
  v_list text;
  v_retry text;
  v_reserve text;
  v_seal text;
  v_finalize text;
  v_xml_contract text;
  v_seed text;
BEGIN
  IF to_regclass('public.dian_fev_recibidas') IS NULL
     OR to_regprocedure('app.sembrar_permisos_dian_eventos_527(uuid)') IS NULL
     OR to_regprocedure('app.seed_operational_rbac_for_tenant_base_527(uuid,uuid)') IS NULL
     OR to_regprocedure('public.registrar_fev_recibida_dian_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)') IS NULL
     OR to_regprocedure('public.listar_fev_recibidas_dian_tx(uuid,integer)') IS NULL
     OR to_regprocedure('public.obtener_reintento_evento_dian_tx(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.reservar_evento_dian_tx(uuid,uuid,uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.sellar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.finalizar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('app.dian_application_response_contract_valid_527(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_527_CONTRACT_OBJECTS_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dian_fev_recibidas'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ux_dian_fev_recibidas_tenant_cufe_527'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ux_dian_fev_recibidas_tenant_idempotency_527'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dian_fev_recibidas'
      AND column_name = 'idempotency_key' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_527_RECEIVED_FEV_STORAGE_DIVERGED';
  END IF;

  IF has_table_privilege('anon', 'public.dian_fev_recibidas', 'SELECT')
     OR has_table_privilege('authenticated', 'public.dian_fev_recibidas', 'SELECT')
     OR has_table_privilege('service_role', 'public.dian_fev_recibidas', 'SELECT')
     OR has_table_privilege('service_role', 'public.dian_fev_recibidas', 'INSERT') THEN
    RAISE EXCEPTION 'VERIFY_527_DIRECT_FEV_TABLE_ACCESS_EXPOSED';
  END IF;

  IF has_function_privilege('anon', 'public.registrar_fev_recibida_dian_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_fev_recibida_dian_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.listar_fev_recibidas_dian_tx(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.listar_fev_recibidas_dian_tx(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.obtener_reintento_evento_dian_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.obtener_reintento_evento_dian_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reservar_evento_dian_tx(uuid,uuid,uuid,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reservar_evento_dian_tx(uuid,uuid,uuid,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sellar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sellar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finalizar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalizar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_527_CLIENT_EXECUTE_EXPOSED';
  END IF;
  IF has_function_privilege('anon', 'app.sembrar_permisos_dian_eventos_527(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.sembrar_permisos_dian_eventos_527(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.sembrar_permisos_dian_eventos_527(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.dian_application_response_contract_valid_527(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.dian_application_response_contract_valid_527(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.dian_application_response_contract_valid_527(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.seed_operational_rbac_for_tenant(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.seed_operational_rbac_for_tenant(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.seed_operational_rbac_for_tenant(uuid,uuid)', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'app'
         AND p.proname LIKE 'seed_operational_rbac_for_tenant_base_%'
         AND (
           has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OR has_function_privilege('service_role', p.oid, 'EXECUTE')
         )
     ) THEN
    RAISE EXCEPTION 'VERIFY_527_RBAC_SEED_EXECUTE_EXPOSED';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.registrar_fev_recibida_dian_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.listar_fev_recibidas_dian_tx(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.obtener_reintento_evento_dian_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reservar_evento_dian_tx(uuid,uuid,uuid,text,text,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.sellar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.finalizar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_527_SERVICE_ROLE_GRANTS_MISSING';
  END IF;

  SELECT pg_get_functiondef('public.registrar_fev_recibida_dian_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)'::regprocedure) INTO v_register;
  SELECT pg_get_functiondef('public.listar_fev_recibidas_dian_tx(uuid,integer)'::regprocedure) INTO v_list;
  SELECT pg_get_functiondef('public.obtener_reintento_evento_dian_tx(uuid,uuid,uuid,text)'::regprocedure) INTO v_retry;
  SELECT pg_get_functiondef('public.reservar_evento_dian_tx(uuid,uuid,uuid,text,text,jsonb,text)'::regprocedure) INTO v_reserve;
  SELECT pg_get_functiondef('public.sellar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure) INTO v_seal;
  SELECT pg_get_functiondef('public.finalizar_evento_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,text)'::regprocedure) INTO v_finalize;
  SELECT pg_get_functiondef('app.dian_application_response_contract_valid_527(text,text,text,text,text)'::regprocedure) INTO v_xml_contract;
  SELECT pg_get_functiondef('app.seed_operational_rbac_for_tenant(uuid,uuid)'::regprocedure) INTO v_seed;
  IF strpos(v_seed, 'seed_operational_rbac_for_tenant_base_527') = 0
     OR strpos(v_seed, 'sembrar_permisos_dian_eventos_527') = 0
     OR strpos(v_register, 'idempotency_key = v_key') = 0
     OR strpos(v_register, 'verificationDigit') = 0
     OR strpos(v_register, 'signatureVerified') = 0
     OR strpos(v_register, 'authoritySignatureTrusted') = 0
     OR strpos(v_register, '<ds:Signature') = 0
     OR strpos(v_list, 'WHERE d.tenant_id = p_tenant_id') = 0
     OR strpos(v_list, '''operationId'', o.id') = 0
     OR strpos(v_list, '''canRetry'', o.state = ''TECHNICAL_ERROR''') = 0
     OR strpos(v_list, '''authoritySnapshot''') = 0
     OR strpos(v_list, '''invoiceXml'', r.invoice_xml') > 0
     OR strpos(v_list, '''idempotencyKey''') > 0
     OR strpos(v_retry, 'o.tenant_id = p_tenant_id') = 0
     OR strpos(v_retry, 'v_op.state = ''TECHNICAL_ERROR''') = 0
     OR strpos(v_retry, '''idempotencyKey'', v_op.idempotency_key') = 0
     OR strpos(v_reserve, 'result_kind = ''REJECTED''') = 0
     OR strpos(v_reserve, 'receiver_snapshot->>''verificationDigit''') = 0
     OR strpos(v_reserve, 'v_code <> ''034''') = 0
     OR strpos(v_seal, 'DIAN_EVENT_030_REQUIRED') = 0
     OR strpos(v_seal, 'DIAN_EVENT_032_REQUIRED') = 0
     OR strpos(v_seal, 'dian_application_response_contract_valid_527') = 0
     OR strpos(v_seal, 'authoritySignatureTrusted') = 0
     OR strpos(v_finalize, 'GET_STATUS_BY_EVENT_CUDE') = 0
     OR strpos(v_finalize, 'signatureVerified') = 0
     OR strpos(v_finalize, 'authoritySignatureTrusted') = 0
     OR strpos(v_finalize, 'dian_application_response_contract_valid_527') = 0
     OR strpos(v_xml_contract, 'xmlparse(document p_xml)') = 0
     OR strpos(v_xml_contract, 'namespace-uri()') = 0
     OR strpos(v_xml_contract, 'DocumentResponse') = 0
     OR strpos(v_xml_contract, 'ResponseCode') = 0
     OR strpos(v_xml_contract, 'DocumentReference') = 0 THEN
    RAISE EXCEPTION 'VERIFY_527_FUNCTION_DEFINITION_DIVERGED';
  END IF;

  IF strpos(v_retry, ':dian:anchor:') = 0
     OR strpos(v_retry, 'pg_advisory_xact_lock') = 0
     OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[v_reserve, v_seal, v_finalize]) AS lock_defs(definition)
       WHERE strpos(definition, ':dian:anchor:') = 0
          OR strpos(definition, 'pg_advisory_xact_lock') = 0
          OR strpos(definition, 'FOR UPDATE') = 0
          OR strpos(definition, 'pg_advisory_xact_lock') > strpos(definition, 'FOR UPDATE')
     ) THEN
    RAISE EXCEPTION 'VERIFY_527_DIAN_ANCHOR_LOCK_ORDER_DIVERGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.rol_permisos rp ON rp.role_id = r.id AND coalesce(rp.concedido, true)
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE upper(r.nombre) IN ('VENDEDOR', 'CAJERO')
      AND lower(p.codigo) IN (
        'cpe.dian.facturas_recibidas.ver',
        'cpe.dian.facturas_recibidas.gestionar',
        'cpe.dian.eventos_034.emitir'
      )
  ) THEN
    RAISE EXCEPTION 'VERIFY_527_DAILY_SALES_ROLE_OVERPRIVILEGED';
  END IF;
END;
$contracts$;

UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localerpephemeralqax',
    allow_demo_data = true, configured_at = now(), updated_at = now()
WHERE singleton = true;

DO $behavior$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_provider uuid;
  v_received uuid;
  v_cufe text := repeat('A', 96);
  v_other_cufe text := repeat('B', 96);
  v_event_cude text := repeat('C', 96);
  v_event_cude_2 text := repeat('D', 96);
  v_invoice text;
  v_status text;
  v_other_invoice text;
  v_other_status text;
  v_fake_signature_invoice text;
  v_status_events text;
  v_signed_event_xml text;
  v_signed_event_xml_2 text;
  v_signed_event_xml_3 text;
  v_authority_accept_xml text;
  v_authority_accept_xml_2 text;
  v_authority_reject_xml text;
  v_application_evidence jsonb;
  v_invalid_xml text;
  v_snapshot jsonb;
  v_result jsonb;
  v_claim jsonb;
  v_retry_context jsonb;
  v_list_result jsonb;
  v_operation_id uuid;
  v_claim_token uuid;
  v_failed boolean;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-527-' || left(v_tenant::text, 8), 'Tenant verify 527', 'Local', 'CO', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-527-' || left(v_other_tenant::text, 8), 'Otro tenant verify 527', 'Local', 'CO', 'test', true, 'ACTIVO');
  PERFORM app.seed_operational_rbac_for_tenant(v_tenant, NULL);
  PERFORM app.seed_operational_rbac_for_tenant(v_other_tenant, NULL);
  IF (
    SELECT count(*)
    FROM public.roles r
    JOIN public.rol_permisos rp ON rp.role_id = r.id AND coalesce(rp.concedido, true)
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE r.tenant_id = v_tenant
      AND (upper(r.nombre), lower(p.codigo)) IN (
        ('ADMIN', 'cpe.dian.facturas_recibidas.ver'),
        ('ADMIN', 'cpe.dian.facturas_recibidas.gestionar'),
        ('ADMIN', 'cpe.dian.eventos_034.emitir'),
        ('CONTADOR', 'cpe.dian.facturas_recibidas.ver'),
        ('CONTADOR', 'cpe.dian.facturas_recibidas.gestionar'),
        ('CONTADOR', 'cpe.dian.eventos_034.emitir'),
        ('COMPRAS', 'cpe.dian.facturas_recibidas.ver'),
        ('COMPRAS', 'cpe.dian.facturas_recibidas.gestionar'),
        ('AUDITOR', 'cpe.dian.facturas_recibidas.ver')
      )
  ) <> 9 OR EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.rol_permisos rp ON rp.role_id = r.id AND coalesce(rp.concedido, true)
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE r.tenant_id = v_tenant
      AND upper(r.nombre) IN ('VENDEDOR', 'CAJERO')
      AND lower(p.codigo) LIKE 'cpe.dian.%'
  ) THEN
    RAISE EXCEPTION 'VERIFY_527_NEW_TENANT_RBAC_SEED_FAILED';
  END IF;
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario, password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Actor', '527', 'actor-' || left(v_actor::text, 8) || '@local.invalid', 'actor527-' || left(v_actor::text, 8), 'unused', true, 'ACTIVO'),
    (v_other_actor, v_other_tenant, 'Actor', 'Otro 527', 'actor-' || left(v_other_actor::text, 8) || '@local.invalid', 'actor527-' || left(v_other_actor::text, 8), 'unused', true, 'ACTIVO');
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, pais, moneda_defecto,
    estado, configuracion_completa, is_demo, dian_activo
  ) VALUES
    (v_tenant, '900123456-8', 'Adquirente verify 527', 'Bogotá', 'CO', 'COP', 'ACTIVO', true, false, true),
    (v_other_tenant, '901234567-1', 'Otro adquirente verify 527', 'Bogotá', 'CO', 'COP', 'ACTIVO', true, false, true);
  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'PROV-527', 'DIAN proveedor', 'DIAN proveedor',
    '800197268-4', 'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_provider;

  v_invoice := '<Invoice xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><UUID>' || v_cufe || '</UUID><ds:Signature/></Invoice>';
  v_status := '<ApplicationResponse xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><UUID>' || v_cufe || '</UUID><ds:Signature/></ApplicationResponse>';
  v_snapshot := jsonb_build_object(
    'cufe', v_cufe, 'documentTypeCode', '01', 'documentId', 'FV-527-1',
    'issueDate', '2026-08-29', 'currencyCode', 'COP', 'payableAmount', '119.00',
    'issuer', jsonb_build_object('type', '31', 'number', '800197268', 'verificationDigit', '4', 'name', 'DIAN proveedor'),
    'receiver', jsonb_build_object('type', '31', 'number', '900123456', 'verificationDigit', '8', 'name', 'Adquirente verify 527')
  );
  v_result := public.registrar_fev_recibida_dian_tx(
    v_tenant, v_actor, v_cufe, v_provider, NULL, 'verify-527-import-1',
    v_invoice, v_snapshot,
    jsonb_build_object(
      'success', true, 'statusCode', '00', 'documentKey', v_cufe,
      'authorityXmlSha256', encode(extensions.digest(convert_to(v_status, 'UTF8'), 'sha256'), 'hex'),
      'signatureVerified', true, 'authoritySignatureTrusted', true
    ),
    v_status,
    jsonb_build_object(
      'usable', true,
      'invoiceXmlSha256', encode(extensions.digest(convert_to(v_invoice, 'UTF8'), 'sha256'), 'hex'),
      'signatureVerified', true
    )
  );
  v_received := (v_result#>>'{invoice,id}')::uuid;
  IF coalesce((v_result->>'created')::boolean, false) IS NOT TRUE
     OR (SELECT receiver_snapshot->>'number' FROM public.dian_fev_recibidas WHERE id = v_received) <> '900123456'
     OR (SELECT receiver_snapshot->>'verificationDigit' FROM public.dian_fev_recibidas WHERE id = v_received) <> '8' THEN
    RAISE EXCEPTION 'VERIFY_527_RECEIVED_IMPORT_FAILED:%', v_result;
  END IF;

  v_other_invoice := replace(v_invoice, v_cufe, v_other_cufe);
  v_other_status := replace(v_status, v_cufe, v_other_cufe);
  v_fake_signature_invoice := replace(
    replace(
      v_other_invoice,
      'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"',
      'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
    ),
    '<ds:Signature/>', '<cac:Signature/>'
  );
  v_failed := false;
  BEGIN
    PERFORM public.registrar_fev_recibida_dian_tx(
      v_tenant, v_actor, v_other_cufe, v_provider, NULL,
      'verify-527-fake-signature', v_fake_signature_invoice,
      v_snapshot || jsonb_build_object('cufe', v_other_cufe, 'documentId', 'FV-527-FAKE'),
      jsonb_build_object(
        'success', true, 'statusCode', '00', 'documentKey', v_other_cufe,
        'authorityXmlSha256', encode(extensions.digest(convert_to(v_other_status, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true, 'authoritySignatureTrusted', true
      ), v_other_status,
      jsonb_build_object(
        'usable', true,
        'invoiceXmlSha256', encode(extensions.digest(convert_to(v_fake_signature_invoice, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_RECEIVED_INVOICE_AUTHORITY_EVIDENCE_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CAC_SIGNATURE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_fev_recibida_dian_tx(
      v_tenant, v_actor, v_other_cufe, v_provider, NULL,
      'verify-527-untrusted-status', v_other_invoice,
      v_snapshot || jsonb_build_object('cufe', v_other_cufe, 'documentId', 'FV-527-UNTRUSTED'),
      jsonb_build_object(
        'success', true, 'statusCode', '00', 'documentKey', v_other_cufe,
        'authorityXmlSha256', encode(extensions.digest(convert_to(v_other_status, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true
      ), v_other_status,
      jsonb_build_object(
        'usable', true,
        'invoiceXmlSha256', encode(extensions.digest(convert_to(v_other_invoice, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_RECEIVED_INVOICE_AUTHORITY_EVIDENCE_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_UNTRUSTED_STATUS_ACCEPTED'; END IF;

  v_result := public.registrar_fev_recibida_dian_tx(
    v_tenant, v_actor, v_cufe, v_provider, NULL, 'verify-527-import-1',
    v_invoice, v_snapshot,
    jsonb_build_object(
      'success', true, 'statusCode', '00', 'documentKey', v_cufe,
      'authorityXmlSha256', encode(extensions.digest(convert_to(v_status, 'UTF8'), 'sha256'), 'hex'),
      'signatureVerified', true, 'authoritySignatureTrusted', true
    ), v_status,
    jsonb_build_object(
      'usable', true,
      'invoiceXmlSha256', encode(extensions.digest(convert_to(v_invoice, 'UTF8'), 'sha256'), 'hex'),
      'signatureVerified', true
    )
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_527_IMPORT_NOT_IDEMPOTENT:%', v_result;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_fev_recibida_dian_tx(
      v_tenant, v_actor, v_other_cufe, v_provider, NULL, 'verify-527-import-1',
      v_other_invoice, v_snapshot || jsonb_build_object('cufe', v_other_cufe, 'documentId', 'FV-527-2'),
      jsonb_build_object(
        'success', true, 'statusCode', '00', 'documentKey', v_other_cufe,
        'authorityXmlSha256', encode(extensions.digest(convert_to(v_other_status, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true, 'authoritySignatureTrusted', true
      ), v_other_status,
      jsonb_build_object(
        'usable', true,
        'invoiceXmlSha256', encode(extensions.digest(convert_to(v_other_invoice, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true
      )
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM = 'DIAN_RECEIVED_INVOICE_IDEMPOTENCY_COLLISION';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_IMPORT_KEY_COLLISION_NOT_REJECTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_fev_recibida_dian_tx(
      v_other_tenant, v_other_actor, v_cufe, v_provider, NULL, 'verify-527-cross-tenant',
      v_invoice, v_snapshot, '{}'::jsonb, v_status, '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('PROVIDER_NOT_FOUND' in SQLERRM) > 0;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CROSS_TENANT_IMPORT_NOT_REJECTED'; END IF;

  IF jsonb_array_length(public.listar_fev_recibidas_dian_tx(v_tenant, 50)) <> 1
     OR jsonb_array_length(public.listar_fev_recibidas_dian_tx(v_other_tenant, 50)) <> 0
     OR (public.listar_fev_recibidas_dian_tx(v_tenant, 50)->0) ? 'invoice_xml' THEN
    RAISE EXCEPTION 'VERIFY_527_TENANT_SAFE_LIST_FAILED';
  END IF;

  v_claim := public.reservar_evento_dian_tx(
    v_tenant, v_actor, v_received, '030', 'verify-527-event-030-a',
    jsonb_build_object('responsible_person', jsonb_build_object(
      'identity_type', '13', 'identity_number', '1010101010',
      'first_name', 'Ana', 'family_name', 'Pérez', 'job_title', 'Compradora',
      'organization_department', 'Compras'
    )), 'USER'
  );
  IF coalesce((v_claim->>'claimed')::boolean, false) IS NOT TRUE
     OR v_claim#>>'{operation,request_summary,party_role}' <> 'ACQUIRER'
     OR v_claim#>>'{operation,request_summary,sender,number}' <> '9001234568'
     OR v_claim#>>'{operation,request_summary,receiver,number}' <> '8001972684' THEN
    RAISE EXCEPTION 'VERIFY_527_ACQUIRER_NIT_OR_RESERVATION_FAILED:%', v_claim;
  END IF;
  v_operation_id := (v_claim#>>'{operation,id}')::uuid;
  v_claim_token := (v_claim#>>'{operation,claim_token}')::uuid;
  v_signed_event_xml := '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
    || 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
    || 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
    || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#">'
    || '<cbc:UUID>' || v_event_cude || '</cbc:UUID>'
    || '<cac:DocumentResponse><cac:Response><cbc:ResponseCode>030</cbc:ResponseCode></cac:Response>'
    || '<cac:DocumentReference><cbc:UUID>' || v_cufe
    || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse>'
    || '<ds:Signature/></ApplicationResponse>';
  v_authority_accept_xml := '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
    || 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
    || 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
    || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><cac:DocumentResponse>'
    || '<cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response>'
    || '<cac:DocumentReference><cbc:UUID>' || v_event_cude
    || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse><ds:Signature/></ApplicationResponse>';
  v_authority_reject_xml := replace(v_authority_accept_xml, '>02<', '>04<');
  v_application_evidence := jsonb_build_object(
    'rootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
    'signatureCount', 1,
    'referencedDocumentKeys', jsonb_build_array(v_event_cude),
    'responseCodes', jsonb_build_array('02')
  );

  IF NOT app.dian_application_response_contract_valid_527(
       v_signed_event_xml, '030', v_cufe,
       encode(extensions.digest(convert_to(v_signed_event_xml, 'UTF8'), 'sha256'), 'hex'),
       v_event_cude
     )
     OR NOT app.dian_application_response_contract_valid_527(
       v_authority_accept_xml, '02', v_event_cude,
       encode(extensions.digest(convert_to(v_authority_accept_xml, 'UTF8'), 'sha256'), 'hex'),
       NULL
     ) THEN
    RAISE EXCEPTION 'VERIFY_527_STRICT_XML_FIXTURE_REJECTED';
  END IF;
  FOREACH v_invalid_xml IN ARRAY ARRAY[
    '<Envelope>' || v_signed_event_xml || '</Envelope>',
    replace(
      v_signed_event_xml,
      'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'urn:invalid:ApplicationResponse'
    ),
    replace(v_signed_event_xml, '<ds:Signature/>', '<ds:Signature/><ds:Signature/>'),
    replace(v_signed_event_xml, '</cac:DocumentResponse>', '</cac:DocumentResponse><cac:DocumentResponse/>'),
    replace(v_signed_event_xml, '>030<', '>032<'),
    replace(v_signed_event_xml, v_cufe, v_other_cufe),
    replace(v_signed_event_xml, v_event_cude, v_event_cude_2)
  ] LOOP
    IF app.dian_application_response_contract_valid_527(
         v_invalid_xml, '030', v_cufe,
         encode(extensions.digest(convert_to(v_invalid_xml, 'UTF8'), 'sha256'), 'hex'),
         v_event_cude
       ) THEN
      RAISE EXCEPTION 'VERIFY_527_XML_STRUCTURE_BYPASSED';
    END IF;
  END LOOP;
  IF app.dian_application_response_contract_valid_527(
       v_signed_event_xml, '030', v_cufe, repeat('0', 64), v_event_cude
     ) THEN
    RAISE EXCEPTION 'VERIFY_527_XML_HASH_MISMATCH_ACCEPTED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reservar_evento_dian_tx(
      v_other_tenant, v_other_actor, v_received, '030',
      'verify-527-cross-tenant-reserve', '{}'::jsonb, 'USER'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('DIAN_EVENT_ANCHOR_NOT_FOUND' in SQLERRM) > 0;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CROSS_TENANT_RESERVE_NOT_REJECTED'; END IF;
  v_status_events := '<ApplicationResponse xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><UUID>' || repeat('E', 96) || '</UUID><ReferencedCUFE>' || v_cufe || '</ReferencedCUFE><ds:Signature/></ApplicationResponse>';
  v_failed := false;
  BEGIN
    PERFORM public.sellar_evento_dian_tx(
      v_other_tenant, v_operation_id, v_claim_token,
      v_signed_event_xml,
      v_event_cude,
      encode(extensions.digest(convert_to(v_signed_event_xml, 'UTF8'), 'sha256'), 'hex'),
      '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM = 'CPE_OPERATION_CLAIM_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CROSS_TENANT_SEAL_NOT_REJECTED'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.sellar_evento_dian_tx(
      v_tenant, v_operation_id, v_claim_token,
      '<Envelope>' || v_signed_event_xml || '</Envelope>',
      v_event_cude,
      encode(extensions.digest(
        convert_to('<Envelope>' || v_signed_event_xml || '</Envelope>', 'UTF8'),
        'sha256'
      ), 'hex'),
      '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_EVENT_SEAL_XML_CONTRACT_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_NESTED_EVENT_XML_ACCEPTED'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.sellar_evento_dian_tx(
      v_tenant, v_operation_id, v_claim_token,
      v_signed_event_xml,
      v_event_cude,
      encode(extensions.digest(convert_to(v_signed_event_xml, 'UTF8'), 'sha256'), 'hex'),
      jsonb_build_object(
        'countryCode', 'CO', 'invoiceCufe', v_cufe, 'usable', true,
        'statusCode', '00', 'authorityDocumentKey', v_cufe, 'eventCodes', '[]'::jsonb,
        'authorityXml', v_status_events,
        'authorityXmlSha256', encode(extensions.digest(convert_to(v_status_events, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_EVENT_AUTHORITY_SNAPSHOT_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_UNTRUSTED_SEQUENCE_SNAPSHOT_ACCEPTED'; END IF;
  PERFORM public.sellar_evento_dian_tx(
    v_tenant, v_operation_id, v_claim_token,
    v_signed_event_xml,
    v_event_cude,
    encode(extensions.digest(convert_to(v_signed_event_xml, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object(
      'countryCode', 'CO', 'invoiceCufe', v_cufe, 'usable', true,
      'statusCode', '00', 'authorityDocumentKey', v_cufe, 'eventCodes', '[]'::jsonb,
      'authorityXml', v_status_events,
      'authorityXmlSha256', encode(extensions.digest(convert_to(v_status_events, 'UTF8'), 'sha256'), 'hex'),
      'signatureVerified', true, 'authoritySignatureTrusted', true
    )
  );

  PERFORM public.finalizar_evento_dian_tx(
    v_tenant, v_operation_id, v_claim_token, 'TECHNICAL_ERROR',
    'DIAN_TIMEOUT_UNCERTAIN', 'Timeout incierto',
    jsonb_build_object(
      'success', false, 'countryCode', 'CO', 'eventCode', '030',
      'eventCude', v_event_cude, 'uncertain', true
    ), NULL
  );
  v_retry_context := public.obtener_reintento_evento_dian_tx(
    v_tenant, v_actor, v_operation_id, 'RECEIVED_INVOICE'
  );
  IF v_retry_context->>'idempotencyKey' <> 'verify-527-event-030-a'
     OR coalesce((v_retry_context->>'canRetry')::boolean, true) IS TRUE
     OR v_retry_context->>'anchorId' <> v_received::text
     OR v_retry_context#>>'{request,responsiblePerson,identity_type}' <> '13' THEN
    RAISE EXCEPTION 'VERIFY_527_SERVER_RETRY_CONTEXT_INVALID:%', v_retry_context;
  END IF;
  v_list_result := public.listar_fev_recibidas_dian_tx(v_tenant, 50);
  IF v_list_result#>>'{0,events,0,operationId}' <> v_operation_id::text
     OR coalesce((v_list_result#>>'{0,events,0,canRetry}')::boolean, true) IS TRUE
     OR coalesce((v_list_result#>>'{0,events,0,capabilities,retry}')::boolean, false) IS NOT TRUE
     OR (v_list_result#>'{0,events,0}') ? 'idempotencyKey'
     OR (v_list_result#>'{0,events,0,authoritySnapshot}') ? 'xml' THEN
    RAISE EXCEPTION 'VERIFY_527_SAFE_RETRY_LIST_INVALID:%', v_list_result;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.obtener_reintento_evento_dian_tx(
      v_other_tenant, v_other_actor, v_operation_id, 'RECEIVED_INVOICE'
    );
  EXCEPTION WHEN no_data_found THEN
    v_failed := SQLERRM = 'DIAN_EVENT_RETRY_OPERATION_NOT_FOUND';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CROSS_TENANT_RETRY_CONTEXT_EXPOSED'; END IF;

  v_claim := public.reservar_evento_dian_tx(
    v_tenant, v_actor, v_received, '030', 'verify-527-event-030-a',
    jsonb_build_object('responsible_person', jsonb_build_object(
      'identity_type', '13', 'identity_number', '1010101010',
      'first_name', 'Ana', 'family_name', 'Pérez', 'job_title', 'Compradora',
      'organization_department', 'Compras'
    )), 'USER'
  );
  IF v_claim->>'reason' <> 'RETRY_LATER' THEN
    RAISE EXCEPTION 'VERIFY_527_UNCERTAIN_RETRY_NOT_THROTTLED:%', v_claim;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reservar_evento_dian_tx(
      v_tenant, v_actor, v_received, '030', 'verify-527-event-030-new',
      jsonb_build_object('responsible_person', jsonb_build_object(
        'identity_type', '13', 'identity_number', '1010101010',
        'first_name', 'Ana', 'family_name', 'Pérez', 'job_title', 'Compradora',
        'organization_department', 'Compras'
      )), 'USER'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM = 'DIAN_EVENT_RETRY_REQUIRES_ORIGINAL_IDEMPOTENCY_KEY';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_UNCERTAIN_NEW_KEY_NOT_REJECTED'; END IF;

  UPDATE public.cpe_operaciones SET next_retry_at = now() - interval '1 second'
  WHERE id = v_operation_id;
  v_retry_context := public.obtener_reintento_evento_dian_tx(
    v_tenant, v_actor, v_operation_id, 'RECEIVED_INVOICE'
  );
  IF coalesce((v_retry_context->>'canRetry')::boolean, false) IS NOT TRUE
     OR v_retry_context->>'idempotencyKey' <> 'verify-527-event-030-a' THEN
    RAISE EXCEPTION 'VERIFY_527_SERVER_RETRY_NOT_READY:%', v_retry_context;
  END IF;
  v_claim := public.reservar_evento_dian_tx(
    v_tenant, v_actor, v_received, '030', 'verify-527-event-030-a',
    jsonb_build_object('responsible_person', jsonb_build_object(
      'identity_type', '13', 'identity_number', '1010101010',
      'first_name', 'Ana', 'family_name', 'Pérez', 'job_title', 'Compradora',
      'organization_department', 'Compras'
    )), 'USER'
  );
  v_claim_token := (v_claim#>>'{operation,claim_token}')::uuid;
  PERFORM public.finalizar_evento_dian_tx(
    v_tenant, v_operation_id, v_claim_token, 'REJECTED', '99', 'Rechazo fiscal',
    jsonb_build_object(
      'success', false, 'countryCode', 'CO', 'eventCode', '030',
      'eventCude', v_event_cude, 'signatureVerified', true,
      'authoritySignatureTrusted', true, 'authorityDocumentKey', v_event_cude,
      'applicationResponseEvidence', jsonb_build_object(
        'rootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
        'signatureCount', 1,
        'referencedDocumentKeys', jsonb_build_array(v_event_cude),
        'responseCodes', jsonb_build_array('04')
      )
    ),
    v_authority_reject_xml
  );

  v_claim := public.reservar_evento_dian_tx(
    v_tenant, v_actor, v_received, '030', 'verify-527-event-030-corrected',
    jsonb_build_object('responsible_person', jsonb_build_object(
      'identity_type', '13', 'identity_number', '1010101010',
      'first_name', 'Ana', 'family_name', 'Pérez', 'job_title', 'Compradora',
      'organization_department', 'Compras'
    )), 'USER'
  );
  IF coalesce((v_claim->>'claimed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_527_CORRECTED_AFTER_REJECTION_NOT_ALLOWED:%', v_claim;
  END IF;
  v_operation_id := (v_claim#>>'{operation,id}')::uuid;
  v_claim_token := (v_claim#>>'{operation,claim_token}')::uuid;
  v_signed_event_xml_2 := replace(v_signed_event_xml, v_event_cude, v_event_cude_2);
  v_authority_accept_xml_2 := replace(
    v_authority_accept_xml, v_event_cude, v_event_cude_2
  );
  v_application_evidence := jsonb_build_object(
    'rootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
    'signatureCount', 1,
    'referencedDocumentKeys', jsonb_build_array(v_event_cude_2),
    'responseCodes', jsonb_build_array('02')
  );
  PERFORM public.sellar_evento_dian_tx(
    v_tenant, v_operation_id, v_claim_token,
    v_signed_event_xml_2,
    v_event_cude_2,
    encode(extensions.digest(convert_to(v_signed_event_xml_2, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object(
      'countryCode', 'CO', 'invoiceCufe', v_cufe, 'usable', true,
      'statusCode', '00', 'authorityDocumentKey', v_cufe, 'eventCodes', '[]'::jsonb,
      'authorityXml', v_status_events,
      'authorityXmlSha256', encode(extensions.digest(convert_to(v_status_events, 'UTF8'), 'sha256'), 'hex'),
      'signatureVerified', true, 'authoritySignatureTrusted', true
    )
  );
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_evento_dian_tx(
      v_tenant, v_operation_id, v_claim_token, 'REJECTED', '90',
      'GetStatus no encontró el CUDE',
      jsonb_build_object(
        'success', false, 'signatureVerified', true,
        'authoritySignatureTrusted', true, 'countryCode', 'CO',
        'eventCode', '030', 'eventCude', v_event_cude_2,
        'authorityDocumentKey', v_event_cude_2,
        'reconciliation', 'GET_STATUS_BY_EVENT_CUDE',
        'applicationResponseEvidence', jsonb_build_object(
          'rootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
          'signatureCount', 1,
          'referencedDocumentKeys', jsonb_build_array(v_event_cude_2),
          'responseCodes', jsonb_build_array('04')
        )
      ),
      replace(v_authority_accept_xml_2, '>02<', '>04<')
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_EVENT_REJECTION_EVIDENCE_INVALID';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_527_GET_STATUS_NOT_FOUND_MARKED_REJECTED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_evento_dian_tx(
      v_tenant, v_operation_id, v_claim_token, 'ACCEPTED', '00', 'Sin trust',
      jsonb_build_object(
        'success', true, 'signatureVerified', true, 'countryCode', 'CO',
        'eventCode', '030', 'eventCude', v_event_cude_2,
        'authorityDocumentKey', v_event_cude_2,
        'applicationResponseEvidence', v_application_evidence
      ),
      v_authority_accept_xml_2
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_EVENT_AUTHORITY_TRUST_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_UNTRUSTED_TERMINAL_ACCEPTED'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_evento_dian_tx(
      v_tenant, v_operation_id, v_claim_token, 'ACCEPTED', '90', 'Evidencia adulterada',
      jsonb_build_object(
        'success', true, 'signatureVerified', true, 'authoritySignatureTrusted', true,
        'countryCode', 'CO',
        'eventCode', '030', 'eventCude', v_event_cude_2,
        'authorityDocumentKey', repeat('E', 96),
        'applicationResponseEvidence', jsonb_build_object(
          'rootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
          'signatureCount', 1,
          'referencedDocumentKeys', jsonb_build_array(repeat('E', 96)),
          'responseCodes', jsonb_build_array('02')
        )
      ),
      replace(v_authority_accept_xml_2, v_event_cude_2, repeat('E', 96))
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM = 'DIAN_EVENT_AUTHORITY_XML_CONTRACT_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CUDE_STATUS_OR_AR_MISMATCH_ACCEPTED'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_evento_dian_tx(
      v_other_tenant, v_operation_id, v_claim_token, 'ACCEPTED', '00', 'Aceptado',
      jsonb_build_object(
        'success', true, 'signatureVerified', true, 'authoritySignatureTrusted', true,
        'countryCode', 'CO',
        'eventCode', '030', 'eventCude', v_event_cude_2,
        'authorityDocumentKey', v_event_cude_2,
        'applicationResponseEvidence', v_application_evidence
      ),
      v_authority_accept_xml_2
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM = 'CPE_OPERATION_CLAIM_INVALID';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_CROSS_TENANT_FINALIZE_NOT_REJECTED'; END IF;
  PERFORM public.finalizar_evento_dian_tx(
    v_tenant, v_operation_id, v_claim_token, 'ACCEPTED', '00', 'Aceptado',
    jsonb_build_object(
      'success', true, 'signatureVerified', true, 'authoritySignatureTrusted', true,
      'countryCode', 'CO',
      'eventCode', '030', 'eventCude', v_event_cude_2,
      'authorityDocumentKey', v_event_cude_2,
      'applicationResponseEvidence', v_application_evidence
    ),
    v_authority_accept_xml_2
  );

  v_claim := public.reservar_evento_dian_tx(
    v_tenant, v_actor, v_received, '032', 'verify-527-event-032',
    jsonb_build_object('responsible_person', jsonb_build_object(
      'identity_type', '13', 'identity_number', '1010101010',
      'first_name', 'Ana', 'family_name', 'Pérez', 'job_title', 'Compradora',
      'organization_department', 'Compras'
    )), 'USER'
  );
  v_operation_id := (v_claim#>>'{operation,id}')::uuid;
  v_claim_token := (v_claim#>>'{operation,claim_token}')::uuid;
  v_signed_event_xml_3 := replace(
    replace(v_signed_event_xml, v_event_cude, repeat('F', 96)),
    '>030<', '>032<'
  );
  v_failed := false;
  BEGIN
    PERFORM public.sellar_evento_dian_tx(
      v_tenant, v_operation_id, v_claim_token,
      v_signed_event_xml_3,
      repeat('F', 96),
      encode(extensions.digest(convert_to(v_signed_event_xml_3, 'UTF8'), 'sha256'), 'hex'),
      jsonb_build_object(
        'countryCode', 'CO', 'invoiceCufe', v_cufe, 'usable', true,
        'statusCode', '00', 'authorityDocumentKey', v_cufe, 'eventCodes', '[]'::jsonb,
        'authorityXml', v_status_events,
        'authorityXmlSha256', encode(extensions.digest(convert_to(v_status_events, 'UTF8'), 'sha256'), 'hex'),
        'signatureVerified', true, 'authoritySignatureTrusted', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM = 'DIAN_EVENT_030_REQUIRED';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_032_WITHOUT_030_NOT_REJECTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_evento_dian_tx(
      v_tenant, v_actor, v_received, '034', 'verify-527-received-034',
      jsonb_build_object('sworn_confirmation', true), 'USER'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('ACCEPTED_RECEIVED_INVOICE_REQUIRED' in SQLERRM) > 0;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_527_034_ON_RECEIVED_NOT_REJECTED'; END IF;
END;
$behavior$;

ROLLBACK;
