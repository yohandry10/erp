\set ON_ERROR_STOP on

BEGIN;

DO $verify$
DECLARE
  v_creator text;
  v_router text;
  v_signer text;
  v_sealer text;
  v_effect text;
  v_trigger text;
  v_issuer text;
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_529') THEN
    RAISE EXCEPTION 'VERIFY_529_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;

  IF to_regprocedure(
       'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean)'
     ) IS NULL
     OR to_regprocedure(
       'app.crear_nota_referenciada_co_529(uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean)'
     ) IS NULL
     OR to_regprocedure(
       'public.firmar_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'
     ) IS NULL
     OR to_regprocedure('app.dian_note_issuer_snapshot_529(uuid,uuid)') IS NULL
     OR to_regprocedure('app.aplicar_efecto_nota_dian_529(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_529_CANONICAL_FUNCTION_MISSING';
  END IF;

  IF to_regprocedure(
       'public.crear_nota_referenciada_router_legacy_529(uuid,uuid,uuid,text,text,text,numeric,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.firmar_nota_referenciada_legacy_529(uuid,uuid,uuid,text,text,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.sellar_envio_dian_legacy_529(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'VERIFY_529_ROLLBACK_ALIAS_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'app.crear_nota_referenciada_co_529(uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean)'::regprocedure
  ) INTO v_creator;
  IF strpos(v_creator, 'v_tipo NOT IN (''91'', ''92'')') = 0
     OR strpos(v_creator, 'v_codigo NOT IN (''1'', ''2'', ''3'', ''4'', ''5'')') = 0
     OR strpos(v_creator, 'v_codigo NOT IN (''1'', ''2'', ''3'', ''4'')') = 0
     OR strpos(v_creator, '''NC01''') = 0
     OR strpos(v_creator, '''ND01''') = 0
     OR strpos(v_creator, '''PENDING_FISCAL_ACCEPTANCE''') = 0
     OR strpos(v_creator, '''financial_effect_contract_version'', 529') = 0
     OR strpos(v_creator, 'fiscal_authority_evidence') = 0
     OR strpos(v_creator, '''numero_fiscal''') = 0
     OR strpos(v_creator, '''dian_prefijo_autorizado''') = 0
     OR strpos(v_creator, 'v_source_prefix, v_source_number_exact') = 0
     OR strpos(v_creator, 'DIAN_REFERENCED_NOTE_SOURCE_IDENTITY_INVALID') = 0
     OR strpos(v_creator, 'v_is_demo IS DISTINCT FROM false') = 0
     OR strpos(v_creator, 'v_origin_cpe.simulated_origin IS DISTINCT FROM false') = 0
     OR strpos(v_creator, 'dian_note_issuer_snapshot_529') = 0
     OR strpos(v_creator, '''issuer_snapshot'', v_issuer_snapshot') = 0
     OR strpos(v_creator, 'DIAN_REFERENCED_NOTE_LINE_SELECTION_REQUIRED') = 0
     OR strpos(v_creator, 'DIAN_REFERENCED_NOTE_CANCELLATION_MUST_EQUAL_REMAINING_BALANCE') = 0
     OR strpos(v_creator, 'DIAN_REFERENCED_NOTE_GLOBAL_PRORATION_CONFIRMATION_REQUIRED') = 0
     OR strpos(v_creator, '''source_document_line_id''') = 0
     OR strpos(v_creator, '''line_allocation_mode''') = 0
     OR strpos(v_creator, 'pg_advisory_xact_lock') = 0
     OR strpos(v_creator, 'FOR UPDATE') = 0
     OR strpos(v_creator, 'cuentas_por_cobrar') > 0
     OR strpos(v_creator, 'insert_nota_outbox_472') > 0 THEN
    RAISE EXCEPTION 'VERIFY_529_CO_WRITER_DIVERGED:%', v_creator;
  END IF;

  SELECT pg_get_functiondef('app.dian_note_issuer_snapshot_529(uuid,uuid)'::regprocedure)
  INTO v_issuer;
  IF strpos(v_issuer, '''DIAN_REFERENCED_NOTE_529''') = 0
     OR strpos(v_issuer, '''certificate_sha256''') = 0
     OR strpos(v_issuer, '''signing_config_sha256''') = 0
     OR strpos(v_issuer, 'certificado_pfx') = 0
     OR strpos(v_issuer, 'dian_regimen_fiscal') = 0
     OR strpos(v_issuer, 'FOR SHARE') = 0 THEN
    RAISE EXCEPTION 'VERIFY_529_ISSUER_SNAPSHOT_DIVERGED:%', v_issuer;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'cpe'
      AND t.tgname = 'trg_cpe_zz_dian_note_issuer_guard_529'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_529_ISSUER_SNAPSHOT_TRIGGER_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)'::regprocedure
  ) INTO v_router;
  IF strpos(v_router, 'v_country = ''CO''') = 0
     OR strpos(v_router, 'crear_nota_referenciada_co_529') = 0
     OR strpos(v_router, 'crear_nota_referenciada_router_legacy_529') = 0
     OR strpos(v_router, 'v_country NOT IN (''PE'', ''AR'', ''CO'')') = 0
     OR strpos(v_router, 'coalesce(v_country, ''PE'')') > 0 THEN
    RAISE EXCEPTION 'VERIFY_529_ROUTER_DIVERGED:%', v_router;
  END IF;

  SELECT pg_get_functiondef(
    'public.firmar_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,text)'::regprocedure
  ) INTO v_signer;
  IF strpos(v_signer, '''07'', ''08'', ''91'', ''92''') = 0
     OR strpos(v_signer, 'WHEN ''91'' THEN ''07''') = 0
     OR strpos(v_signer, 'firmar_nota_referenciada_legacy_529') = 0
     OR strpos(v_signer, '''READY_FOR_DIAN_DELIVERY_PIPELINE''') = 0
     OR strpos(v_signer, 'CreditNote') = 0
     OR strpos(v_signer, 'DebitNote') = 0
     OR strpos(v_signer, 'http://www.w3.org/2000/09/xmldsig#') = 0 THEN
    RAISE EXCEPTION 'VERIFY_529_SIGNATURE_ROUTER_DIVERGED:%', v_signer;
  END IF;

  SELECT pg_get_functiondef(
    'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure
  ) INTO v_sealer;
  IF strpos(v_sealer, 'sellar_envio_dian_legacy_529') = 0
     OR strpos(v_sealer, 'v_document_type IN (''91'', ''92'')') = 0
     OR strpos(v_sealer, 'xml_content = p_xml_firmado') = 0
     OR strpos(v_sealer, 'codigo_hash = v_xml_hash') = 0
     OR strpos(v_sealer, '''dian_xml_sha256'', v_xml_hash') = 0
     OR strpos(v_sealer, 'DIAN_REFERENCED_NOTE_SEALED_SHA_MISMATCH') = 0 THEN
    RAISE EXCEPTION 'VERIFY_529_DIAN_SEAL_SYNC_DIVERGED:%', v_sealer;
  END IF;

  SELECT pg_get_functiondef(
    'app.aplicar_efecto_nota_dian_529(uuid,uuid)'::regprocedure
  ) INTO v_effect;
  IF strpos(v_effect, 'v_type NOT IN (''91'', ''92'')') = 0
     OR strpos(v_effect, 'aplicar_efecto_nota_aceptada_494') = 0
     OR strpos(v_effect, '''financial_effect_contract_version'', 529') = 0
     OR strpos(v_effect, '''{tipoDocumento}''') = 0 THEN
    RAISE EXCEPTION 'VERIFY_529_ACCEPTANCE_EFFECT_DIVERGED:%', v_effect;
  END IF;

  SELECT pg_get_functiondef('app.enforce_nota_fiscal_effect_494()'::regprocedure)
  INTO v_trigger;
  IF strpos(v_trigger, '''07'', ''08'', ''91'', ''92''') = 0
     OR strpos(v_trigger, 'aplicar_efecto_nota_dian_529') = 0
     OR strpos(v_trigger, 'o.tipo_operacion = ''CREAR''') = 0
     OR strpos(
       regexp_replace(v_trigger, '[[:space:]]+', '', 'g'),
       'o.payload->>''version''=''529'''
     ) = 0
     OR strpos(v_trigger, 'financial_effect_contract_version') = 0
     OR strpos(v_trigger, 'pg_trigger_depth') > 0 THEN
    RAISE EXCEPTION 'VERIFY_529_TRIGGER_FUNCTION_DIVERGED:%', v_trigger;
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
    RAISE EXCEPTION 'VERIFY_529_TRIGGER_MISSING';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.firmar_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.crear_nota_referenciada_co_529(uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.crear_nota_referenciada_router_legacy_529(uuid,uuid,uuid,text,text,text,numeric,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.firmar_nota_referenciada_legacy_529(uuid,uuid,uuid,text,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.sellar_envio_dian_legacy_529(uuid,uuid,uuid,text,text,text,jsonb,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_529_FUNCTION_PRIVILEGES_INVALID';
  END IF;

  -- Un backfill automático de 91/92 anteriores a este contrato atribuiría un
  -- origen de UI que el runtime previo no podía producir. 529 sólo cambia el
  -- contrato ejecutable y deja esas filas legacy fail-closed.
  IF strpos(v_creator, 'UPDATE public.cpe') > 0
     OR strpos(v_creator, 'UPDATE public.documentos') > 0 THEN
    RAISE EXCEPTION 'VERIFY_529_CREATOR_MUTATES_EXISTING_DOCUMENTS';
  END IF;
END;
$verify$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $runtime$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_demo_tenant uuid := gen_random_uuid();
  v_demo_actor uuid := gen_random_uuid();
  v_customer uuid;
  v_source_document uuid;
  v_source_cpe uuid := gen_random_uuid();
  v_source_operation uuid := gen_random_uuid();
  v_source_event uuid := gen_random_uuid();
  v_source_reservation uuid := gen_random_uuid();
  v_source_cxc uuid;
  v_source_entry uuid;
  v_source_line_taxed uuid := gen_random_uuid();
  v_source_line_exempt uuid := gen_random_uuid();
  v_credit jsonb;
  v_credit_retry jsonb;
  v_debit jsonb;
  v_credit_document uuid;
  v_credit_cpe uuid;
  v_debit_document uuid;
  v_debit_cpe uuid;
  v_credit_claim jsonb;
  v_debit_claim jsonb;
  v_credit_operation uuid;
  v_debit_operation uuid;
  v_credit_token uuid;
  v_debit_token uuid;
  v_source_cufe text := repeat('A', 96);
  v_credit_cude text := repeat('C', 96);
  v_debit_cude text := repeat('D', 96);
  v_source_response text;
  v_credit_response text;
  v_debit_response text;
  v_xml text := '<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('a', 180) || '</ds:Signature></CreditNote>';
  v_debit_xml text := '<?xml version="1.0"?><DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('b', 180) || '</ds:Signature></DebitNote>';
  v_credit_sealed_xml text := '<?xml version="1.0"?><CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('c', 180) || '</ds:Signature></CreditNote>';
  v_debit_sealed_xml text := '<?xml version="1.0"?><DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature>'
    || repeat('d', 180) || '</ds:Signature></DebitNote>';
  v_sha text;
  v_document_count bigint;
BEGIN
  v_source_response := '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/><cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response><cac:DocumentReference><cbc:UUID>'
    || v_source_cufe || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>';
  v_credit_response := replace(v_source_response, v_source_cufe, v_credit_cude);
  v_debit_response := replace(v_source_response, v_source_cufe, v_debit_cude);

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES (
    v_tenant, 'VERIFY-529-' || left(v_tenant::text, 8),
    'Tenant Colombia verify 529', 'Fixture local transaccional',
    'CO', 'test', true, 'ACTIVO'
  );
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, departamento, provincia,
    ubigeo, pais, pais_id, moneda_defecto, estado, configuracion_completa,
    is_demo, dian_activo, dian_url, dian_software_id, dian_software_pin,
    dian_test_set_id, dian_environment, dian_regimen_fiscal,
    dian_tipo_contribuyente, certificado_pfx, certificado_password,
    dian_resolucion_numero, dian_resolucion_prefijo, dian_resolucion_desde,
    dian_resolucion_hasta, dian_resolucion_fecha_inicio,
    dian_resolucion_fecha_fin
  ) VALUES (
    v_tenant, '900123456-8', 'Emisor Colombia verify 529',
    'Carrera 7 # 10-20', 'Bogotá D.C.', 'Bogotá D.C.', '11001', 'CO',
    (SELECT id FROM public.paises WHERE codigo_iso = 'CO' AND activo LIMIT 1),
    'COP', 'ACTIVO', true, false, true,
    'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    'SOFTWARE-VERIFY-529', 'PIN-VERIFY-529', 'TEST-SET-VERIFY-529',
    'HOMOLOGACION', 'O-13', '1', convert_to('pfx-verify-529', 'UTF8'),
    'cert-pass-verify-529', '187640529', 'FV', 1, 999999,
    current_date - 30, current_date + 365
  );
  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES (
    v_demo_tenant, 'VERIFY-529-DEMO-' || left(v_demo_tenant::text, 8),
    'Tenant demo Colombia verify 529', 'Control rojo demo local',
    'CO', 'test', true, 'ACTIVO'
  );
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, pais_id, moneda_defecto, estado,
    configuracion_completa, is_demo, dian_environment
  ) VALUES (
    v_demo_tenant, '900123456-8', 'Demo Colombia verify 529', 'CO',
    (SELECT id FROM public.paises WHERE codigo_iso = 'CO' AND activo LIMIT 1),
    'COP', 'ACTIVO', true, true, 'HOMOLOGACION'
  );
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES (
    v_actor, v_tenant, 'Actor', 'Verify 529',
    'actor-529-' || left(v_actor::text, 8) || '@local.invalid',
    'actor529' || left(v_actor::text, 4), 'unused-local-hash', true, 'ACTIVO'
  );
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES (
    v_demo_actor, v_demo_tenant, 'Actor demo', 'Verify 529',
    'actor-demo-529-' || left(v_demo_actor::text, 8) || '@local.invalid',
    'actordemo529' || left(v_demo_actor::text, 4),
    'unused-local-hash', true, 'ACTIVO'
  );
  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES (
    v_tenant, 'CLI-529', 'Cliente Colombia verify 529',
    'Cliente Colombia verify 529', 'NIT', '9005291001', true,
    'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
  ) RETURNING id INTO v_customer;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, estado_sunat,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal,
    impuesto_igv, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, cliente_id, created_by,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion,
    cdr_content, metadata
  ) VALUES (
    v_tenant, 'FACTURA', 'FV', '00000125', 'EMITIDO', 'PENDIENTE',
    now(), now() + interval '30 days', 'COP', 1, 109.50, 9.50, 119,
    50, 59.50, 0, 0, v_customer, v_actor, '900123456-8',
    'Emisor Colombia verify 529', 'Carrera 7 # 10-20', '31', '9005291001',
    '9005291001', 'Cliente Colombia verify 529',
    'Cliente Colombia verify 529', 'Bogotá', NULL,
    jsonb_build_object(
      'fiscal_country', 'CO',
      'dian_number_reservation_id', v_source_reservation,
      'dian_prefijo_autorizado', 'FV',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', 'FV125'
    )
  ) RETURNING id INTO v_source_document;
  INSERT INTO public.documento_detalles (
    id, tenant_id, documento_id, orden, codigo_producto, descripcion,
    unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata
  ) VALUES
    (
      v_source_line_taxed, v_tenant, v_source_document, 1,
      'SERV-529-GRAVADO', 'Servicio gravado origen DIAN 529',
      'NIU', 1, 50, 0, 50, 9.50, 0, 59.50,
      jsonb_build_object('afectacion_igv', '10')
    ),
    (
      v_source_line_exempt, v_tenant, v_source_document, 2,
      'SERV-529-EXENTO', 'Servicio exento origen DIAN 529',
      'NIU', 1, 59.50, 0, 59.50, 0, 0, 59.50,
      jsonb_build_object('afectacion_igv', '20')
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
    v_source_cpe, v_tenant, v_source_document, '01', 'FV', '00000125', 125,
    '900123456-8', 'Emisor Colombia verify 529', 'Carrera 7 # 10-20', '31',
    '9005291001', 'Cliente Colombia verify 529', 'Bogotá', v_customer,
    'COP', 50, 59.50, 0, 0, 9.50, 119, 119,
    jsonb_build_array(
      jsonb_build_object(
        'codigo', 'SERV-529-GRAVADO',
        'descripcion', 'Servicio gravado origen DIAN 529',
        'cantidad', 1, 'precio_unitario', 50, 'valor_venta', 50,
        'igv', 9.50, 'total', 59.50, 'afectacion_igv', '10',
        'source_document_line_id', v_source_line_taxed
      ),
      jsonb_build_object(
        'codigo', 'SERV-529-EXENTO',
        'descripcion', 'Servicio exento origen DIAN 529',
        'cantidad', 1, 'precio_unitario', 59.50, 'valor_venta', 59.50,
        'igv', 0, 'total', 59.50, 'afectacion_igv', '20',
        'source_document_line_id', v_source_line_exempt
      )
    ), now(), current_date + 30, 'FIRMADO', 'PENDIENTE', 'READY',
    NULL, v_actor, v_source_event,
    jsonb_build_object(
      'fiscal_country', 'CO',
      'dian_number_reservation_id', v_source_reservation,
      'dian_prefijo_autorizado', 'FV',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', 'FV125',
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
    'verify:529:source:accepted', repeat('1', 64), 'COMPLETED', 1, 'SYSTEM',
    jsonb_build_object(
      'country_code', 'CO', 'dian_evidence_kind', 'CUFE',
      'dian_unique_code', v_source_cufe,
      'authorization', jsonb_build_object(
        'source', 'DIAN_GET_NUMBERING_RANGE', 'environment_id', '2',
        'software_id', 'SOFTWARE-VERIFY-529', 'number', '187640529',
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
      'authoritySignatureTrusted', true,
      'authorityResponseCount', 1,
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
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
      cdr_sunat = v_source_response,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_source_operation::text
      )
  WHERE id = v_source_cpe AND tenant_id = v_tenant;
  UPDATE public.documentos
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', cdr_content = v_source_response
  WHERE id = v_source_document AND tenant_id = v_tenant;
  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_source_cpe) IS DISTINCT FROM false
     OR (SELECT fiscal_authority_evidence->>'status' FROM public.cpe
         WHERE id = v_source_cpe) <> 'ACCEPTED'
     OR (SELECT fiscal_authority_evidence->>'code_kind' FROM public.cpe
         WHERE id = v_source_cpe) <> 'CUFE' THEN
    RAISE EXCEPTION 'VERIFY_529_SOURCE_IS_NOT_REAL_DIAN_ACCEPTANCE';
  END IF;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total,
    monto_original, monto_pendiente, saldo, saldo_pendiente, total,
    fecha_emision, fecha_vencimiento, moneda, numero_documento,
    tipo_documento, idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES (
    v_tenant, v_customer, v_source_document, 'PENDIENTE', 119, 119,
    119, 119, 119, 119, current_date, current_date + 30, 'COP',
    'FV125', 'FACTURA', 'verify-529-source-cxc', 'verify.529', 1,
    jsonb_build_object(
      'origen', 'verify_local',
      'dian_number_reservation_id', v_source_reservation,
      'dian_prefijo_autorizado', 'FV',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', 'FV125'
    )
  ) RETURNING id INTO v_source_cxc;
  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    v_tenant, now(), 'Venta origen verify 529', 'Venta origen verify 529',
    'FV125', 119, 119, 'CONFIRMADO', 'VERIFY_529',
    v_source_event, v_actor, v_actor::text
  ) RETURNING id INTO v_source_entry;
  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, nombre, concepto, debe, haber
  ) VALUES
    (v_tenant, v_source_entry, 'Clientes', 'Clientes', 119, 0),
    (v_tenant, v_source_entry, 'Venta e IVA', 'Venta e IVA', 0, 119);

  SELECT count(*) INTO v_document_count
  FROM public.documentos WHERE tenant_id = v_demo_tenant;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_demo_tenant, v_demo_actor, v_source_document, '91', '1',
      'Demo no puede usar una aceptación real previa', 10,
      'verify:529:demo:must-fail'
    );
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_DEMO_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_demo_tenant)
       <> v_document_count THEN
    RAISE EXCEPTION 'VERIFY_529_DEMO_REJECTION_LEFT_PARTIAL_DOCUMENT';
  END IF;

  -- Ni el padding de la columna operativa ni un alias interno pueden ocupar
  -- el lugar del numero_fiscal exacto sellado por la reserva 530.
  SELECT count(*) INTO v_document_count
  FROM public.documentos WHERE tenant_id = v_tenant;
  BEGIN
    UPDATE public.cpe
    SET metadata = metadata || jsonb_build_object('numero_fiscal', 'FV00000125')
    WHERE id = v_source_cpe AND tenant_id = v_tenant;
    UPDATE public.documentos
    SET metadata = metadata || jsonb_build_object('numero_fiscal', 'FV00000125')
    WHERE id = v_source_document AND tenant_id = v_tenant;
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_source_document, '91', '1',
      'Padding operativo no es identidad fiscal', 11.90,
      'verify:529:padded-reference',
      jsonb_build_array(jsonb_build_object(
        'source_document_line_id', v_source_line_taxed,
        'cantidad', 1, 'base', 10, 'impuesto', 1.90, 'total', 11.90
      )), false
    );
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_PADDED_REFERENCE_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DIAN_REFERENCED_NOTE_SOURCE_IDENTITY_INVALID%' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.cpe
    SET metadata = metadata || jsonb_build_object(
      'dian_prefijo_autorizado', 'DABC', 'numero_fiscal', 'DABC125'
    )
    WHERE id = v_source_cpe AND tenant_id = v_tenant;
    UPDATE public.documentos
    SET metadata = metadata || jsonb_build_object(
      'dian_prefijo_autorizado', 'DABC', 'numero_fiscal', 'DABC125'
    )
    WHERE id = v_source_document AND tenant_id = v_tenant;
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_source_document, '91', '1',
      'Alias interno no es prefijo autorizado', 11.90,
      'verify:529:alias-reference',
      jsonb_build_array(jsonb_build_object(
        'source_document_line_id', v_source_line_taxed,
        'cantidad', 1, 'base', 10, 'impuesto', 1.90, 'total', 11.90
      )), false
    );
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_ALIAS_REFERENCE_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DIAN_REFERENCED_NOTE_SOURCE_IDENTITY_INVALID%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant)
       <> v_document_count THEN
    RAISE EXCEPTION 'VERIFY_529_INVALID_REFERENCE_LEFT_PARTIAL_DOCUMENT';
  END IF;

  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_source_document, '91', '1',
    'Devolución parcial de bienes', 59.50, 'verify:529:credit:create',
    jsonb_build_array(jsonb_build_object(
      'source_document_line_id', v_source_line_taxed,
      'cantidad', 1, 'base', 50, 'impuesto', 9.50, 'total', 59.50
    )), false
  ) INTO v_credit;
  v_credit_document := (v_credit->>'documento_id')::uuid;
  v_credit_cpe := (v_credit->>'cpe_id')::uuid;
  IF v_credit->>'tipo_documento' <> '91'
     OR v_credit->>'serie' <> 'NC01'
     OR v_credit->>'financial_effect_status' <> 'PENDING_FISCAL_ACCEPTANCE'
     OR (SELECT tipo_documento FROM public.cpe WHERE id = v_credit_cpe) <> '91'
     OR (SELECT tipo_nota_credito FROM public.cpe WHERE id = v_credit_cpe) <> '1'
     OR (SELECT documento_referencia_tipo FROM public.cpe WHERE id = v_credit_cpe) <> '01'
     OR (SELECT documento_referencia_serie FROM public.cpe WHERE id = v_credit_cpe)
          IS DISTINCT FROM 'FV'
     OR (SELECT documento_referencia_numero FROM public.cpe WHERE id = v_credit_cpe)
          IS DISTINCT FROM 'FV125'
     OR (SELECT issuer_snapshot->>'source' FROM public.cpe WHERE id = v_credit_cpe)
          IS DISTINCT FROM 'DIAN_REFERENCED_NOTE_529'
     OR (SELECT issuer_snapshot->>'dian_note_issuer_contract_version'
         FROM public.cpe WHERE id = v_credit_cpe) IS DISTINCT FROM '529'
     OR (SELECT issuer_snapshot->>'certificate_sha256'
         FROM public.cpe WHERE id = v_credit_cpe) !~ '^[0-9a-f]{64}$'
     OR (SELECT issuer_snapshot->>'signing_config_sha256'
         FROM public.cpe WHERE id = v_credit_cpe) !~ '^[0-9a-f]{64}$'
     OR (SELECT metadata->'issuer_snapshot' IS DISTINCT FROM issuer_snapshot
         FROM public.cpe WHERE id = v_credit_cpe)
     OR (SELECT issuer_snapshot->>'municipality_code'
         FROM public.cpe WHERE id = v_credit_cpe) IS DISTINCT FROM '11001'
     OR (SELECT issuer_snapshot->>'tax_regime'
         FROM public.cpe WHERE id = v_credit_cpe) IS DISTINCT FROM 'O-13'
     OR v_credit->>'documento_referencia_serie' IS DISTINCT FROM 'FV'
     OR v_credit->>'documento_referencia_numero' IS DISTINCT FROM 'FV125'
     OR v_credit->>'line_allocation_mode' IS DISTINCT FROM 'EXPLICIT_SOURCE_LINES'
     OR (v_credit->>'line_count')::integer <> 1
     OR (SELECT count(*) FROM public.documento_detalles
         WHERE tenant_id = v_tenant AND documento_id = v_credit_document) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.documento_detalles dd
       WHERE dd.tenant_id = v_tenant
         AND dd.documento_id = v_credit_document
         AND dd.metadata->>'source_document_line_id' = v_source_line_taxed::text
         AND dd.metadata->>'codigo_motivo' = '1'
         AND dd.cantidad = 1
         AND dd.valor_venta = 50
         AND dd.impuesto_igv = 9.50
         AND dd.impuesto_isc = 0
         AND dd.total_item = 59.50
     )
     OR EXISTS (
       SELECT 1
       FROM public.documento_detalles dd
       WHERE dd.tenant_id = v_tenant
         AND dd.documento_id = v_credit_document
         AND dd.metadata->>'source_document_line_id' = v_source_line_exempt::text
     )
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 119
     OR EXISTS (SELECT 1 FROM public.cxc_pagos WHERE documento_id = v_credit_document)
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE nota_credito_documento_id = v_credit_document
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE aggregate_id = v_credit_document::text
     ) THEN
    RAISE EXCEPTION 'VERIFY_529_CREDIT_NOT_CANONICAL_OR_NEUTRAL:%', v_credit;
  END IF;

  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_source_document, '91', '1',
    'Devolución parcial de bienes', 59.50, 'verify:529:credit:create',
    jsonb_build_array(jsonb_build_object(
      'source_document_line_id', v_source_line_taxed,
      'cantidad', 1, 'base', 50, 'impuesto', 9.50, 'total', 59.50
    )), false
  ) INTO v_credit_retry;
  IF coalesce((v_credit_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR v_credit_retry->>'cpe_id' IS DISTINCT FROM v_credit->>'cpe_id'
     OR v_credit_retry->>'documento_referencia_serie' IS DISTINCT FROM 'FV'
     OR v_credit_retry->>'documento_referencia_numero' IS DISTINCT FROM 'FV125'
     OR (SELECT documento_referencia_numero FROM public.cpe WHERE id = v_credit_cpe)
          IS DISTINCT FROM 'FV125' THEN
    RAISE EXCEPTION 'VERIFY_529_CREATE_RETRY_BROKEN:%', v_credit_retry;
  END IF;

  -- El motivo 2 no admite una anulación parcial ni un prorrateo implícito.
  -- Debe copiar exactamente las líneas y saldos restantes del comprobante.
  SELECT count(*) INTO v_document_count
  FROM public.documentos WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_source_document, '91', '2',
      'Anulación parcial inválida', 30,
      'verify:529:partial-cancellation:must-fail', '[]'::jsonb, false
    );
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_PARTIAL_CANCELLATION_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DIAN_REFERENCED_NOTE_CANCELLATION_MUST_EQUAL_REMAINING_BALANCE%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant)
       <> v_document_count THEN
    RAISE EXCEPTION 'VERIFY_529_PARTIAL_CANCELLATION_LEFT_PARTIAL_DOCUMENT';
  END IF;

  v_sha := encode(extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'), 'hex');
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_credit_cpe, v_xml, 'HASH-VERIFY-529', v_sha,
    'verify:529:credit:sign'
  );
  IF (SELECT tipo_documento FROM public.cpe WHERE id = v_credit_cpe) <> '91'
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_credit_cpe) <> 'FIRMADO'
     OR (SELECT metadata->>'signed_document_type' FROM public.cpe WHERE id = v_credit_cpe) <> '91'
     OR (SELECT xml_firmado FROM public.cpe WHERE id = v_credit_cpe) IS DISTINCT FROM v_xml
     OR (SELECT xml_content FROM public.documentos WHERE id = v_credit_document) IS DISTINCT FROM v_xml
     OR (SELECT metadata->>'signed_xml_sha256' FROM public.cpe WHERE id = v_credit_cpe)
          IS DISTINCT FROM v_sha
     OR (SELECT metadata->>'signed_xml_sha256' FROM public.documentos WHERE id = v_credit_document)
          IS DISTINCT FROM v_sha
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE aggregate_id = v_credit_document::text
     ) THEN
    RAISE EXCEPTION 'VERIFY_529_SIGNATURE_XML_SHA_OR_TYPE_DIVERGED';
  END IF;

  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_credit_cpe, 'verify:529:credit:send', 'USER'
  ) INTO v_credit_claim;
  v_credit_operation := (v_credit_claim->'operation'->>'id')::uuid;
  v_credit_token := (v_credit_claim->'operation'->>'claim_token')::uuid;
  PERFORM public.reservar_paquete_dian_tx(
    v_tenant, v_credit_operation, v_credit_token,
    extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer,
    '000'
  );
  PERFORM public.sellar_envio_dian_tx(
    v_tenant, v_credit_operation, v_credit_token, v_credit_sealed_xml,
    'CUDE', v_credit_cude,
    jsonb_build_object(
      'source', 'DIAN_SOFTWARE_CATALOG', 'environment_id', '2',
      'software_id', 'SOFTWARE-VERIFY-529', 'document_series', 'NC01'
    ),
    jsonb_build_object(
      'contributor_type', 'PERSONA_JURIDICA',
      'fiscal_regime', 'RESPONSABLE_IVA'
    )
  );
  v_sha := encode(
    extensions.digest(convert_to(v_credit_sealed_xml, 'UTF8'), 'sha256'), 'hex'
  );
  IF (SELECT xml_firmado FROM public.cpe WHERE id = v_credit_cpe)
       IS DISTINCT FROM v_credit_sealed_xml
     OR (SELECT hash_firma FROM public.cpe WHERE id = v_credit_cpe)
       IS DISTINCT FROM v_sha
     OR (SELECT xml_content FROM public.documentos WHERE id = v_credit_document)
       IS DISTINCT FROM v_credit_sealed_xml
     OR (SELECT codigo_hash FROM public.documentos WHERE id = v_credit_document)
       IS DISTINCT FROM v_sha
     OR (SELECT metadata->>'dian_xml_sha256' FROM public.documentos
         WHERE id = v_credit_document) IS DISTINCT FROM v_sha THEN
    RAISE EXCEPTION 'VERIFY_529_CREDIT_SEALED_XML_SHA_NOT_SYNCHRONIZED';
  END IF;
  UPDATE public.cpe_operaciones
  SET state = 'COMPLETED', result_kind = 'ACCEPTED', response_code = '00',
      response_summary = jsonb_build_object(
        'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
        'dianEvidenceKind', 'CUDE', 'dianUniqueCode', v_credit_cude,
        'authorityStatusCode', '00', 'authorityDocumentKey', v_credit_cude,
        'expectedDianUniqueCode', v_credit_cude, 'hasCdr', true,
        'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
        'authoritySignatureTrusted', true, 'authorityResponseCount', 1,
        'authorityResponseRoot', 'ApplicationResponse',
        'authorityResponseRootNamespace',
          'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
        'authorityResponseSignatureCount', 1,
        'authorityApplicationResponseCode', '02',
        'authorityResponseDocumentKey', v_credit_cude,
        'authorityResponse', v_credit_response,
        'authorityResponseSha256', encode(
          extensions.digest(convert_to(v_credit_response, 'UTF8'), 'sha256'), 'hex'
        ),
        'cdrSha256', encode(
          extensions.digest(convert_to(v_credit_response, 'UTF8'), 'sha256'), 'hex'
        )
      ),
      terminal_fingerprint = repeat('3', 64), completed_at = now(),
      lease_expires_at = NULL
  WHERE id = v_credit_operation AND tenant_id = v_tenant;
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
      cdr_sunat = v_credit_response,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_credit_operation::text
      )
  WHERE id = v_credit_cpe AND tenant_id = v_tenant;
  IF (SELECT tipo_documento FROM public.cpe WHERE id = v_credit_cpe) <> '91'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 59.50
     OR (SELECT count(*) FROM public.cxc_pagos
         WHERE documento_id = v_credit_document AND monto = 59.50) <> 1
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE nota_credito_documento_id = v_credit_document
     )
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_credit_document::text
           AND event_type = 'nota_credito.emitida'
           AND payload->>'tipoDocumento' = '91') <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_credit_cpe
           AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1
     OR (SELECT metadata->>'financial_effect_status' FROM public.cpe
         WHERE id = v_credit_cpe) <> 'APPLIED_ON_FISCAL_ACCEPTANCE'
     OR (SELECT metadata->>'financial_effect_contract_version' FROM public.cpe
         WHERE id = v_credit_cpe) <> '529'
     OR (SELECT metadata->>'financial_effect_contract_version' FROM public.documentos
         WHERE id = v_credit_document) <> '529' THEN
    RAISE EXCEPTION 'VERIFY_529_CREDIT_ACCEPTANCE_EFFECT_INVALID';
  END IF;

  -- Una actualización repetida y una llamada directa simulan retries/race:
  -- ambas deben observar la misma operación financiera ya materializada.
  UPDATE public.cpe
  SET cdr_sunat = v_credit_response
  WHERE id = v_credit_cpe AND tenant_id = v_tenant;
  PERFORM app.aplicar_efecto_nota_dian_529(v_tenant, v_credit_cpe);
  IF (SELECT count(*) FROM public.cxc_pagos
      WHERE documento_id = v_credit_document) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_credit_document::text) <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_credit_cpe
           AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_529_CREDIT_ACCEPTANCE_RETRY_DUPLICATED';
  END IF;

  BEGIN
    UPDATE public.cpe
    SET estado = 'RECHAZADO', estado_sunat = 'RECHAZADO', sunat_status = 'REJECTED'
    WHERE id = v_credit_cpe AND tenant_id = v_tenant;
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_REJECTION_AFTER_EFFECT_FAILURE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_credit_cpe) <> 'ACEPTADO'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 59.50 THEN
    RAISE EXCEPTION 'VERIFY_529_REJECTION_AFTER_EFFECT_MUTATED_STATE';
  END IF;

  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_source_document, '92', '2',
    'Gastos adicionales por cobrar', 11.90, 'verify:529:debit:create',
    jsonb_build_array(jsonb_build_object(
      'source_document_line_id', v_source_line_taxed,
      'cantidad', 1, 'base', 10, 'impuesto', 1.90, 'total', 11.90
    )), false
  ) INTO v_debit;
  v_debit_document := (v_debit->>'documento_id')::uuid;
  v_debit_cpe := (v_debit->>'cpe_id')::uuid;
  IF v_debit->>'tipo_documento' <> '92'
     OR v_debit->>'serie' <> 'ND01'
     OR (SELECT tipo_documento FROM public.cpe WHERE id = v_debit_cpe) <> '92'
     OR (SELECT tipo_nota_debito FROM public.cpe WHERE id = v_debit_cpe) <> '2'
     OR v_debit->>'line_allocation_mode' IS DISTINCT FROM 'EXPLICIT_SOURCE_LINES'
     OR (v_debit->>'line_count')::integer <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.documento_detalles dd
       WHERE dd.tenant_id = v_tenant
         AND dd.documento_id = v_debit_document
         AND dd.metadata->>'source_document_line_id' = v_source_line_taxed::text
         AND dd.metadata->>'codigo_motivo' = '2'
         AND dd.valor_venta = 10
         AND dd.impuesto_igv = 1.90
         AND dd.total_item = 11.90
     )
     OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar
       WHERE tenant_id = v_tenant AND documento_id = v_debit_document
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE aggregate_id = v_debit_document::text
     ) THEN
    RAISE EXCEPTION 'VERIFY_529_DEBIT_NOT_CANONICAL_OR_NEUTRAL:%', v_debit;
  END IF;

  v_sha := encode(
    extensions.digest(convert_to(v_debit_xml, 'UTF8'), 'sha256'), 'hex'
  );
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_debit_cpe, v_debit_xml, 'HASH-VERIFY-529-DEBIT', v_sha,
    'verify:529:debit:sign'
  );
  IF (SELECT tipo_documento FROM public.cpe WHERE id = v_debit_cpe) <> '92'
     OR (SELECT xml_firmado FROM public.cpe WHERE id = v_debit_cpe)
          IS DISTINCT FROM v_debit_xml
     OR (SELECT xml_content FROM public.documentos WHERE id = v_debit_document)
          IS DISTINCT FROM v_debit_xml
     OR (SELECT codigo_hash FROM public.documentos WHERE id = v_debit_document)
          IS DISTINCT FROM 'HASH-VERIFY-529-DEBIT'
     OR (SELECT metadata->>'signed_xml_sha256' FROM public.documentos
         WHERE id = v_debit_document) IS DISTINCT FROM v_sha THEN
    RAISE EXCEPTION 'VERIFY_529_DEBIT_SIGNATURE_XML_SHA_OR_TYPE_DIVERGED';
  END IF;

  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_debit_cpe, 'verify:529:debit:send', 'USER'
  ) INTO v_debit_claim;
  v_debit_operation := (v_debit_claim->'operation'->>'id')::uuid;
  v_debit_token := (v_debit_claim->'operation'->>'claim_token')::uuid;
  PERFORM public.reservar_paquete_dian_tx(
    v_tenant, v_debit_operation, v_debit_token,
    extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer,
    '000'
  );
  PERFORM public.sellar_envio_dian_tx(
    v_tenant, v_debit_operation, v_debit_token, v_debit_sealed_xml,
    'CUDE', v_debit_cude,
    jsonb_build_object(
      'source', 'DIAN_SOFTWARE_CATALOG', 'environment_id', '2',
      'software_id', 'SOFTWARE-VERIFY-529', 'document_series', 'ND01'
    ),
    jsonb_build_object(
      'contributor_type', 'PERSONA_JURIDICA',
      'fiscal_regime', 'RESPONSABLE_IVA'
    )
  );
  v_sha := encode(
    extensions.digest(convert_to(v_debit_sealed_xml, 'UTF8'), 'sha256'), 'hex'
  );
  IF (SELECT xml_firmado FROM public.cpe WHERE id = v_debit_cpe)
       IS DISTINCT FROM v_debit_sealed_xml
     OR (SELECT hash_firma FROM public.cpe WHERE id = v_debit_cpe)
       IS DISTINCT FROM v_sha
     OR (SELECT xml_content FROM public.documentos WHERE id = v_debit_document)
       IS DISTINCT FROM v_debit_sealed_xml
     OR (SELECT codigo_hash FROM public.documentos WHERE id = v_debit_document)
       IS DISTINCT FROM v_sha
     OR (SELECT metadata->>'dian_xml_sha256' FROM public.documentos
         WHERE id = v_debit_document) IS DISTINCT FROM v_sha THEN
    RAISE EXCEPTION 'VERIFY_529_DEBIT_SEALED_XML_SHA_NOT_SYNCHRONIZED';
  END IF;
  UPDATE public.cpe_operaciones
  SET state = 'COMPLETED', result_kind = 'ACCEPTED', response_code = '00',
      response_summary = jsonb_build_object(
        'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
        'dianEvidenceKind', 'CUDE', 'dianUniqueCode', v_debit_cude,
        'authorityStatusCode', '00', 'authorityDocumentKey', v_debit_cude,
        'expectedDianUniqueCode', v_debit_cude, 'hasCdr', true,
        'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
        'authoritySignatureTrusted', true, 'authorityResponseCount', 1,
        'authorityResponseRoot', 'ApplicationResponse',
        'authorityResponseRootNamespace',
          'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
        'authorityResponseSignatureCount', 1,
        'authorityApplicationResponseCode', '02',
        'authorityResponseDocumentKey', v_debit_cude,
        'authorityResponse', v_debit_response,
        'authorityResponseSha256', encode(
          extensions.digest(convert_to(v_debit_response, 'UTF8'), 'sha256'), 'hex'
        ),
        'cdrSha256', encode(
          extensions.digest(convert_to(v_debit_response, 'UTF8'), 'sha256'), 'hex'
        )
      ),
      terminal_fingerprint = repeat('4', 64), completed_at = now(),
      lease_expires_at = NULL
  WHERE id = v_debit_operation AND tenant_id = v_tenant;
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
      cdr_sunat = v_debit_response,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_debit_operation::text
      )
  WHERE id = v_debit_cpe AND tenant_id = v_tenant;
  IF (SELECT tipo_documento FROM public.cpe WHERE id = v_debit_cpe) <> '92'
     OR (SELECT count(*) FROM public.cuentas_por_cobrar
         WHERE tenant_id = v_tenant AND documento_id = v_debit_document
           AND monto_pendiente = 11.90 AND tipo_documento = 'NOTA_DEBITO') <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_debit_document::text
           AND event_type = 'nota_debito.emitida'
           AND payload->>'tipoDocumento' = '92') <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_debit_cpe
           AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1
     OR (SELECT metadata->>'financial_effect_contract_version' FROM public.cpe
         WHERE id = v_debit_cpe) <> '529'
     OR (SELECT metadata->>'financial_effect_contract_version' FROM public.documentos
         WHERE id = v_debit_document) <> '529' THEN
    RAISE EXCEPTION 'VERIFY_529_DEBIT_ACCEPTANCE_EFFECT_INVALID';
  END IF;

  PERFORM app.aplicar_efecto_nota_dian_529(v_tenant, v_debit_cpe);
  IF (SELECT count(*) FROM public.cuentas_por_cobrar
      WHERE tenant_id = v_tenant AND documento_id = v_debit_document) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_debit_document::text) <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_debit_cpe
           AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_529_DEBIT_ACCEPTANCE_RETRY_DUPLICATED';
  END IF;

  BEGIN
    UPDATE public.cpe
    SET estado = 'RECHAZADO', estado_sunat = 'RECHAZADO', sunat_status = 'REJECTED'
    WHERE id = v_debit_cpe AND tenant_id = v_tenant;
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_DEBIT_REJECTION_AFTER_EFFECT_FAILURE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_debit_cpe) <> 'ACEPTADO' THEN
    RAISE EXCEPTION 'VERIFY_529_DEBIT_REJECTION_AFTER_EFFECT_MUTATED_STATE';
  END IF;

  SELECT count(*) INTO v_document_count
  FROM public.documentos WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_source_document, '07', '04',
      'Código peruano prohibido en Colombia', 10, 'verify:529:co-reject-07'
    );
    RAISE EXCEPTION 'VERIFY_529_EXPECTED_CO_07_REJECTION';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant)
       <> v_document_count THEN
    RAISE EXCEPTION 'VERIFY_529_REJECTED_TYPE_LEFT_PARTIAL_DOCUMENT';
  END IF;
END;
$runtime$;

ROLLBACK;

\echo 'VERIFY_529_OK'
