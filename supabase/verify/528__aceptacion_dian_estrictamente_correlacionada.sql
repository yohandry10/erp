\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_528') THEN
    RAISE EXCEPTION 'VERIFY_528_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contracts$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.cpe'::regclass
      AND tgname = 'trg_zz_cpe_dian_acceptance_guard_528'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_528_TRIGGER_MISSING';
  END IF;

  SELECT pg_get_functiondef('app.cpe_dian_acceptance_guard_528()'::regprocedure)
  INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'cpe_dian_acceptance_contract_valid_528') = 0
     OR strpos(v_definition, 'DIAN_ACCEPTANCE_AUTHORITY_EVIDENCE_INVALID') = 0 THEN
    RAISE EXCEPTION 'VERIFY_528_FUNCTION_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'app.cpe_dian_acceptance_contract_valid_528(uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'authorityStatusCode') = 0
     OR strpos(v_definition, 'authoritySignatureTrusted') = 0
     OR strpos(v_definition, 'authorityDocumentKey') = 0
     OR strpos(v_definition, 'expectedDianUniqueCode') = 0
     OR strpos(v_definition, 'authorityResponseSha256') = 0
     OR strpos(v_definition, 'authorityApplicationResponseCode') = 0
     OR strpos(v_definition, 'cdrSha256') = 0
     OR strpos(v_definition, 'dianAcceptanceContractVersion') = 0
     OR strpos(v_definition, 'namespace-uri()') = 0
     OR strpos(v_definition, 'DocumentResponse') = 0
     OR strpos(v_definition, 'ResponseCode') = 0
     OR strpos(v_definition, 'DocumentReference') = 0 THEN
    RAISE EXCEPTION 'VERIFY_528_VALIDATOR_DIVERGED:%', v_definition;
  END IF;

  IF has_function_privilege(
       'service_role',
       'app.cpe_dian_acceptance_guard_528()'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_TRIGGER_FUNCTION_EXPOSED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.wizard_progress'::regclass
      AND tgname = 'trg_wizard_progress_sanitize_528'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_528_WIZARD_SANITIZER_TRIGGER_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.configuration_operation_intents'::regclass
      AND tgname = 'trg_configuration_wizard_intent_guard_528'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_528_WIZARD_INTENT_TRIGGER_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'app.wizard_temporary_config_sanitize_528(jsonb)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'regexp_replace') = 0
     OR strpos(v_definition, 'certificateMetadata') = 0
     OR strpos(v_definition, 'dian_software_pin') > 0
     OR strpos(v_definition, 'sunat_password') > 0
     OR strpos(v_definition, 'ose_api_key') > 0 THEN
    RAISE EXCEPTION 'VERIFY_528_WIZARD_SANITIZER_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.guardar_paso_wizard_config_tx(uuid,uuid,text,integer,jsonb)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'wizard_temporary_config_sanitize_528') = 0
     OR strpos(v_definition, 'v_previous.configuracion_temporal') = 0
     OR strpos(v_definition, 'configuration_intent_finish_464') = 0 THEN
    RAISE EXCEPTION 'VERIFY_528_WIZARD_WRITE_CONTRACT_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.registrar_habilitacion_dian_tx(uuid,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'numberingValidated') = 0
     OR strpos(v_definition, 'authorityTrust') = 0
     OR strpos(v_definition, 'authorizedRanges') = 0
     OR strpos(v_definition, 'credentialsValidated') > 0 THEN
    RAISE EXCEPTION 'VERIFY_528_FIRST_ATTESTATION_CONTRACT_DIVERGED:%', v_definition;
  END IF;

  IF has_function_privilege(
       'service_role',
       'app.wizard_scalar_value_valid_528(jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.wizard_certificate_metadata_sanitize_528(jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.wizard_temporary_config_sanitize_528(jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.wizard_progress_sanitize_guard_528()'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.sanitize_wizard_storage_528()'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.configuration_wizard_intent_result_sanitize_528(text,jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.configuration_intent_replay_464(text,text,text,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.configuration_intent_finish_464(uuid,text,text,text,text,text,jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.configuration_wizard_intent_guard_528()'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_WIZARD_INTERNAL_FUNCTION_EXPOSED';
  END IF;
END;
$contracts$;

DO $behavior$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_cpe uuid := gen_random_uuid();
  v_operation uuid := gen_random_uuid();
  v_cufe text := repeat('A', 96);
  v_other_cufe text := repeat('B', 96);
  v_response_xml text;
  v_invalid_response text;
  v_rejected boolean;
BEGIN
  v_response_xml := '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
    || 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
    || 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
    || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#">'
    || '<ds:Signature Id="verify-528"/>'
    || '<cac:DocumentResponse>'
    || '<cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response>'
    || '<cac:DocumentReference><cbc:UUID>' || v_cufe
    || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse>'
    || '</ApplicationResponse>';

  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES (
    v_tenant, 'VERIFY-528-' || left(v_tenant::text, 8),
    'Tenant real verify 528', 'Fixture local transaccional',
    'CO', 'test', true, 'ACTIVO'
  );

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, pais, moneda_defecto,
    estado, configuracion_completa, is_demo,
    dian_resolucion_numero, dian_resolucion_prefijo,
    dian_resolucion_desde, dian_resolucion_hasta,
    dian_resolucion_fecha_inicio, dian_resolucion_fecha_fin,
    dian_software_id, dian_tipo_contribuyente, dian_regimen_fiscal,
    dian_url, dian_software_pin, dian_test_set_id, dian_environment,
    dian_ultima_prueba_estado, dian_ultima_prueba_detalle
  ) VALUES (
    v_tenant, '9015280001', 'Emisor real verify 528', 'Dirección verify 528',
    'CO', 'COP', 'ACTIVO', true, false,
    '187640528', 'FV528', 1, 999999, current_date - 30, current_date + 365,
    'SOFTWARE-VERIFY-528', 'PERSONA_JURIDICA', 'RESPONSABLE_IVA',
    'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
    'PIN-CIFRADO-VERIFY-528', 'TESTSET-VERIFY-528', 'PRODUCCION',
    'INCOMPLETA', '{}'::jsonb
  );

  INSERT INTO public.clientes (
    id, tenant_id, nombre, razon_social, documento_tipo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES (
    v_client, v_tenant, 'Receptor verify 528', 'Receptor verify 528', 'NIT',
    'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
  );

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, metadata, activo
  ) VALUES (
    v_cpe, v_tenant, '01', 'FV528', '00000001',
    '9015280001', 'Emisor real verify 528', '31',
    '9005280001', 'Receptor verify 528', v_client, 'COP',
    100, 19, 119, 119,
    '[{"codigo":"R528","descripcion":"Real 528","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
    now(), 'verify.cpe.528.real', 'FIRMADO', 'PENDIENTE',
    'READY', jsonb_build_object('source', 'verify.528'), true
  );

  INSERT INTO public.cpe_operaciones (
    id, tenant_id, cpe_id, action, idempotency_key,
    request_fingerprint, state, lease_expires_at, attempt, origin,
    request_summary, response_summary, result_kind, response_code,
    terminal_fingerprint, completed_at
  ) VALUES (
    v_operation, v_tenant, v_cpe, 'SEND', 'verify.cpe.528.acceptance',
    repeat('a', 64), 'COMPLETED', NULL, 1, 'SYSTEM',
    jsonb_build_object(
      'country_code', 'CO', 'dian_evidence_kind', 'CUFE',
      'dian_unique_code', v_cufe,
      'authorization', jsonb_build_object(
        'source', 'DIAN_GET_NUMBERING_RANGE', 'environment_id', '2',
        'software_id', 'SOFTWARE-VERIFY-528', 'number', '187640528',
        'prefix', 'FV528', 'range_from', 1, 'range_to', 999999,
        'valid_from', (current_date - 30)::text,
        'valid_to', (current_date + 365)::text,
        'technical_key_sha256', repeat('e', 64)
      ),
      'issuer_tax_profile', jsonb_build_object(
        'contributor_type', 'PERSONA_JURIDICA',
        'fiscal_regime', 'RESPONSABLE_IVA'
      )
    ),
    jsonb_build_object(
      'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
      'dianEvidenceKind', 'CUFE', 'dianUniqueCode', v_cufe,
      'authorityStatusCode', '00', 'authorityDocumentKey', v_cufe,
      'expectedDianUniqueCode', v_cufe, 'hasCdr', true,
      'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
      'authorityResponseCount', 1, 'authorityResponseRoot', 'ApplicationResponse',
      'authorityResponseRootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'authorityResponseSignatureCount', 1,
      'authorityApplicationResponseCode', '02',
      'authorityResponseDocumentKey', v_cufe,
      'authorityResponse', v_response_xml,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_response_xml, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_response_xml, 'UTF8'), 'sha256'), 'hex'
      )
      -- `authoritySignatureTrusted` se omite deliberadamente primero.
    ),
    'ACCEPTED', '00', repeat('c', 64), now()
  );

  IF app.cpe_dian_acceptance_contract_valid_528(
       v_cpe, v_tenant,
       jsonb_build_object('last_delivery_operation_id', v_operation::text),
       v_response_xml
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_WEAK_HISTORICAL_ACCEPTANCE_GRANDFATHERED';
  END IF;

  -- El alias histórico y los espacios no pueden eludir el guard: el trigger
  -- estricto corre después del normalizador y detecta `estado_sunat` solo.
  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET estado_sunat = ' aceptado '
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_EVIDENCE_OPERATION_MISSING' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT upper(btrim(estado_sunat::text)) FROM public.cpe WHERE id = v_cpe)
          = 'ACEPTADO' THEN
    RAISE EXCEPTION 'VERIFY_528_ESTADO_SUNAT_ALIAS_BYPASSED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
        sunat_status = 'ACCEPTED', cdr_sunat = v_response_xml,
        metadata = metadata || jsonb_build_object(
          'last_delivery_operation_id', v_operation::text
        )
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_AUTHORITY_EVIDENCE_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_cpe) <> 'FIRMADO' THEN
    RAISE EXCEPTION 'VERIFY_528_UNTRUSTED_RESPONSE_ACCEPTED';
  END IF;

  UPDATE public.cpe_operaciones
  SET response_summary = response_summary
      || jsonb_build_object(
        'authoritySignatureTrusted', true,
        'authorityDocumentKey', v_other_cufe
      )
  WHERE id = v_operation;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
        sunat_status = 'ACCEPTED', cdr_sunat = v_response_xml,
        metadata = metadata || jsonb_build_object(
          'last_delivery_operation_id', v_operation::text
        )
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_AUTHORITY_EVIDENCE_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_528_MISMATCHED_CUFE_ACCEPTED';
  END IF;

  UPDATE public.cpe_operaciones
  SET response_summary = response_summary
      || jsonb_build_object('authorityDocumentKey', v_cufe)
  WHERE id = v_operation;

  -- Texto coincidente no basta: raíz exterior, anidación, comentario, UUID
  -- fuera del DocumentReference o semántica ResponseCode ambigua deben fallar.
  FOREACH v_invalid_response IN ARRAY ARRAY[
    '<Envelope>' || v_response_xml || '</Envelope>',
    '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">'
      || v_response_xml || '</ApplicationResponse>',
    '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
      || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/><!-- '
      || '<DocumentResponse><DocumentReference><UUID>' || v_cufe
      || '</UUID></DocumentReference></DocumentResponse> --></ApplicationResponse>',
    '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
      || 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
      || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/><cbc:UUID>'
      || v_cufe || '</cbc:UUID></ApplicationResponse>',
    '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
      || 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
      || 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
      || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/>'
      || '<cac:DocumentResponse><cac:DocumentReference><cbc:UUID>' || v_cufe
      || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>',
    replace(
      v_response_xml,
      '<cbc:ResponseCode>02</cbc:ResponseCode>',
      '<cbc:ResponseCode>02</cbc:ResponseCode><cbc:ResponseCode>02</cbc:ResponseCode>'
    ),
    replace(
      v_response_xml,
      '<cbc:ResponseCode>02</cbc:ResponseCode>',
      '<cbc:ResponseCode>04</cbc:ResponseCode>'
    )
  ] LOOP
    UPDATE public.cpe_operaciones
    SET response_summary = response_summary
      || jsonb_build_object(
        'authorityResponse', v_invalid_response,
        'authorityResponseSha256', encode(
          extensions.digest(convert_to(v_invalid_response, 'UTF8'), 'sha256'), 'hex'
        ),
        'cdrSha256', encode(
          extensions.digest(convert_to(v_invalid_response, 'UTF8'), 'sha256'), 'hex'
        )
      )
    WHERE id = v_operation;
    IF app.cpe_dian_acceptance_contract_valid_528(
         v_cpe, v_tenant,
         jsonb_build_object('last_delivery_operation_id', v_operation::text),
         v_invalid_response
       ) THEN
      RAISE EXCEPTION 'VERIFY_528_XML_STRUCTURE_BYPASSED';
    END IF;
  END LOOP;

  UPDATE public.cpe_operaciones
  SET response_summary = response_summary
    || jsonb_build_object(
      'authorityResponse', v_response_xml,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_response_xml, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_response_xml, 'UTF8'), 'sha256'), 'hex'
      )
    )
  WHERE id = v_operation;

  UPDATE public.cpe
  SET estado_sunat = ' aceptado ', cdr_sunat = v_response_xml,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_operation::text
      )
  WHERE id = v_cpe;

  IF NOT app.cpe_dian_acceptance_contract_valid_528(
       v_cpe, v_tenant,
       jsonb_build_object('last_delivery_operation_id', v_operation::text),
       v_response_xml
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_STRICT_CONTRACT_REJECTED';
  END IF;

  IF (SELECT fiscal_authority_evidence->>'status' FROM public.cpe WHERE id = v_cpe)
       <> 'ACCEPTED'
     OR (SELECT fiscal_authority_evidence->>'unique_code' FROM public.cpe WHERE id = v_cpe)
       <> v_cufe
     OR (SELECT fiscal_authority_evidence->>'operation_id' FROM public.cpe WHERE id = v_cpe)
       <> v_operation::text
     OR (SELECT fiscal_authority_evidence->>'cdr_sha256' FROM public.cpe WHERE id = v_cpe)
       <> encode(extensions.digest(convert_to(v_response_xml, 'UTF8'), 'sha256'), 'hex')
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_cpe) <> 'ACEPTADO'
     OR (SELECT upper(estado_sunat::text) FROM public.cpe WHERE id = v_cpe) <> 'ACEPTADO'
     OR (SELECT upper(sunat_status::text) FROM public.cpe WHERE id = v_cpe) <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'VERIFY_528_CORRELATED_ACCEPTANCE_NOT_MATERIALIZED:%', (
      SELECT jsonb_build_object(
        'evidence', fiscal_authority_evidence,
        'estado', estado,
        'estado_sunat', estado_sunat,
        'sunat_status', sunat_status,
        'metadata', metadata
      )
      FROM public.cpe WHERE id = v_cpe
    );
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET metadata = metadata - 'last_delivery_operation_id'
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_EVIDENCE_OPERATION_MISSING' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR NOT app.cpe_dian_acceptance_contract_valid_528(
       v_cpe, v_tenant,
       (SELECT metadata FROM public.cpe WHERE id = v_cpe),
       (SELECT cdr_sunat FROM public.cpe WHERE id = v_cpe)
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_ACCEPTED_OPERATION_LINK_MUTATED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET cdr_sunat = '<tampered-cdr>contenido distinto pero no vacío</tampered-cdr>'
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_AUTHORITY_EVIDENCE_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR NOT app.cpe_dian_acceptance_contract_valid_528(
       v_cpe, v_tenant,
       (SELECT metadata FROM public.cpe WHERE id = v_cpe),
       (SELECT cdr_sunat FROM public.cpe WHERE id = v_cpe)
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_ACCEPTED_CDR_CONTENT_MUTATED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe SET cdr_sunat = NULL WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_AUTHORITY_EVIDENCE_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR NOT app.cpe_dian_acceptance_contract_valid_528(
       v_cpe, v_tenant,
       (SELECT metadata FROM public.cpe WHERE id = v_cpe),
       (SELECT cdr_sunat FROM public.cpe WHERE id = v_cpe)
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_ACCEPTED_CDR_MUTATED';
  END IF;
END;
$behavior$;

DO $wizard_and_first_attestation$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_demo_tenant uuid := gen_random_uuid();
  v_demo_actor uuid := gen_random_uuid();
  v_wizard uuid;
  v_unsafe jsonb;
  v_result jsonb;
  v_rejected boolean := false;
  v_outbox_before integer := 0;
  v_outbox_after integer := 0;
  v_range_case jsonb;
  v_range_case_index integer := 0;
BEGIN
  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES (
    v_tenant, 'VERIFY-528-CFG-' || left(v_tenant::text, 8),
    'Tenant configuración verify 528', 'Fixture local transaccional',
    'CO', 'test', true, 'ACTIVO'
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin
  ) VALUES (
    v_actor, v_tenant, 'Actor', 'Verify 528',
    'actor-528-' || left(v_actor::text, 8) || '@local.invalid',
    'actor528-' || left(v_actor::text, 8),
    'unused-local-hash', true, 'ACTIVO', false
  );

  v_unsafe := jsonb_build_object(
    'pais', 'CO',
    'DIAN_SOFTWARE_PIN', 'HIST_SECRET_528',
    'dianPassword', 'HIST_SECRET_528',
    'sunatPassword', 'HIST_SECRET_528',
    'oseApiKey', 'HIST_SECRET_528',
    'unknownNested', jsonb_build_object('token', 'HIST_SECRET_528'),
    'certificateMetadata', jsonb_build_object(
      'SuBjEcT', 'CN=EMISOR VERIFY 528',
      'apiToken', 'HIST_SECRET_528',
      'nested', jsonb_build_object('password', 'HIST_SECRET_528')
    )
  );

  -- Simula una fila realmente anterior a 528: el trigger permanente se
  -- desactiva sólo dentro de este BEGIN/ROLLBACK para probar el backfill.
  ALTER TABLE public.wizard_progress
    DISABLE TRIGGER trg_wizard_progress_sanitize_528;
  INSERT INTO public.wizard_progress (
    tenant_id, paso_actual, pasos_completados, configuracion_temporal,
    completado, created_at, updated_at
  ) VALUES (
    v_tenant, 2, ARRAY[1, 2], v_unsafe, false, now(), now()
  ) RETURNING id INTO v_wizard;
  ALTER TABLE public.wizard_progress
    ENABLE TRIGGER trg_wizard_progress_sanitize_528;

  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, metadata
  ) VALUES (
    v_tenant, v_actor, 'wizard_progress', 'UPDATE', v_wizard::text,
    jsonb_build_object('configuracion_temporal', v_unsafe),
    jsonb_build_object('configuracion_temporal', v_unsafe),
    jsonb_build_object(
      'accion', 'GUARDAR_PASO_WIZARD',
      'source', 'configuration_464',
      'verify_case', 'VERIFY_528_HISTORICAL_SECRET',
      'fingerprint', repeat('b', 64)
    )
  );

  ALTER TABLE public.configuration_operation_intents
    DISABLE TRIGGER trg_configuration_wizard_intent_guard_528;
  INSERT INTO public.configuration_operation_intents (
    tenant_id, scope_type, scope_id, operation, idempotency_key,
    intent_fingerprint, result
  ) VALUES (
    v_tenant, 'TENANT', v_tenant::text, 'WIZARD_STEP',
    'verify-historical-wizard-528', repeat('a', 64),
    jsonb_build_object(
      'progress', jsonb_build_object('configuracion_temporal', v_unsafe)
    )
  );

  INSERT INTO public.configuration_operation_intents (
    tenant_id, scope_type, scope_id, operation, idempotency_key,
    intent_fingerprint, result
  ) VALUES (
    v_tenant, 'TENANT', v_tenant::text, 'WIZARD_COMPLETE',
    'verify-historical-complete-528', repeat('c', 64),
    jsonb_build_object(
      'legacyMarker', 'complete-528',
      'configuracion', jsonb_build_object(
        'pais', 'CO',
        'razon_social', 'Resultado histórico seguro 528',
        'dian_software_pin', 'HIST_SECRET_528'
      ),
      'progress', jsonb_build_object('configuracion_temporal', v_unsafe),
      'idempotent', false
    )
  );
  ALTER TABLE public.configuration_operation_intents
    ENABLE TRIGGER trg_configuration_wizard_intent_guard_528;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, idempotency_key
  ) VALUES (
    v_tenant, 'empresa_config', v_tenant::text,
    'configuracion.wizard.completado',
    jsonb_build_object('tenant_id', v_tenant, 'actor_id', v_actor),
    'pending', 'wizard-complete-464:verify-historical-complete-528'
  );

  v_result := app.sanitize_wizard_storage_528();
  IF strpos((SELECT configuracion_temporal::text
             FROM public.wizard_progress WHERE id = v_wizard), 'HIST_SECRET_528') > 0
     OR (SELECT configuracion_temporal->>'pais'
         FROM public.wizard_progress WHERE id = v_wizard) <> 'CO'
     OR (SELECT configuracion_temporal#>>'{certificateMetadata,subject}'
         FROM public.wizard_progress WHERE id = v_wizard) <> 'CN=EMISOR VERIFY 528'
     OR EXISTS (
       SELECT 1 FROM public.audit_log a
       WHERE a.tenant_id = v_tenant
          AND a.metadata->>'verify_case' = 'VERIFY_528_HISTORICAL_SECRET'
          AND (
            a.metadata ? 'fingerprint'
            OR strpos(coalesce(a.old_values::text, '') || coalesce(a.new_values::text, ''),
                       'HIST_SECRET_528') > 0
          )
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.configuration_operation_intents i
        WHERE i.tenant_id = v_tenant
          AND i.idempotency_key = 'verify-historical-wizard-528'
          AND i.intent_fingerprint = 'legacy-redacted-v1'
          AND strpos(i.result::text, 'HIST_SECRET_528') = 0
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.configuration_operation_intents i
        WHERE i.tenant_id = v_tenant
          AND i.idempotency_key = 'verify-historical-complete-528'
          AND i.intent_fingerprint = 'legacy-redacted-v1'
          AND i.result->>'legacyMarker' = 'complete-528'
          AND strpos(i.result::text, 'HIST_SECRET_528') = 0
          AND NOT (i.result->'configuracion' ? 'dian_software_pin')
      )
      OR EXISTS (
        SELECT 1 FROM public.configuration_operation_intents i
        WHERE i.tenant_id = v_tenant
          AND i.operation IN ('WIZARD_STEP', 'WIZARD_COMPLETE')
          AND i.intent_fingerprint ~ '^[0-9a-f]{64}$'
      ) THEN
    RAISE EXCEPTION 'VERIFY_528_HISTORICAL_WIZARD_SECRET_SURVIVED:%', v_result;
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.configuration_operation_intents (
      tenant_id, scope_type, scope_id, operation, idempotency_key,
      intent_fingerprint, result
    ) VALUES (
      v_tenant, 'TENANT', v_tenant::text, 'WIZARD_STEP',
      'verify-direct-legacy-insert-528', repeat('9', 64), '{}'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'CONFIGURATION_WIZARD_FINGERPRINT_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_528_DIRECT_LEGACY_INTENT_ACCEPTED';
  END IF;

  v_result := public.guardar_paso_wizard_config_tx(
    v_tenant, v_actor, 'verify-historical-wizard-528', 7,
    jsonb_build_object('razonSocial', 'Payload diferente no reejecutable')
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE
     OR strpos(v_result::text, 'Payload diferente no reejecutable') > 0 THEN
    RAISE EXCEPTION 'VERIFY_528_LEGACY_STEP_REPLAY_BROKEN:%', v_result;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.configuration_intent_finish_464(
      v_tenant, 'TENANT', v_tenant::text, 'WIZARD_STEP',
      'verify-sentinel-insert-528', 'legacy-redacted-v1', '{}'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'CONFIGURATION_WIZARD_FINGERPRINT_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_528_SENTINEL_INSERT_ACCEPTED';
  END IF;

  v_result := public.guardar_paso_wizard_config_tx(
    v_tenant, v_actor, 'verify-wizard-write-528', 3,
    jsonb_build_object(
      'RAZON-SOCIAL', 'EMISOR SEGURO 528',
      'Dian Password', 'WRITE_SECRET_528',
      'certificateMetadata', jsonb_build_object(
        'Issuer', 'CN=CA VERIFY 528',
        'Bearer_Token', 'WRITE_SECRET_528'
      )
    )
  );
  IF strpos(v_result::text, 'WRITE_SECRET_528') > 0
     OR v_result#>>'{progress,configuracion_temporal,razonSocial}'
          <> 'EMISOR SEGURO 528'
     OR v_result#>>'{progress,configuracion_temporal,certificateMetadata,issuer}'
          <> 'CN=CA VERIFY 528'
     OR EXISTS (
       SELECT 1 FROM public.audit_log a
       WHERE a.tenant_id = v_tenant
         AND a.metadata->>'accion' = 'GUARDAR_PASO_WIZARD'
         AND strpos(coalesce(a.old_values::text, '') || coalesce(a.new_values::text, ''),
                    'WRITE_SECRET_528') > 0
     )
     OR EXISTS (
       SELECT 1 FROM public.configuration_operation_intents i
       WHERE i.tenant_id = v_tenant
         AND i.idempotency_key = 'verify-wizard-write-528'
         AND strpos(i.result::text, 'WRITE_SECRET_528') > 0
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.configuration_operation_intents i
       WHERE i.tenant_id = v_tenant
         AND i.idempotency_key = 'verify-wizard-write-528'
         AND i.intent_fingerprint ~ '^step-v1:[0-9a-f]{64}$'
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_NEW_WIZARD_SECRET_PERSISTED:%', v_result;
  END IF;

  -- Estado inicial: prueba alcanzable y con trust. La bandera de numeración ya
  -- es true, pero el rango será deliberadamente distinto; así el negativo
  -- demuestra la comparación completa y no sólo una bandera booleana.
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, pais, moneda_defecto,
    estado, configuracion_completa, is_demo, dian_activo,
    dian_resolucion_numero, dian_resolucion_prefijo,
    dian_resolucion_desde, dian_resolucion_hasta,
    dian_resolucion_fecha_inicio, dian_resolucion_fecha_fin,
    dian_software_id, dian_tipo_contribuyente, dian_regimen_fiscal,
    dian_url, dian_software_pin, dian_test_set_id, dian_environment,
    certificado_pfx, certificado_password,
    dian_ultima_prueba_at, dian_ultima_prueba_estado, dian_ultima_prueba_detalle
  ) VALUES (
    v_tenant, '9015289991', 'Emisor habilitación verify 528',
    'Dirección verify 528', 'CO', 'COP', 'ACTIVO', true, false, true,
    '1876405289', 'FV528', 1, 999999,
    current_date - 30, current_date + 365,
    'SOFTWARE-HABILITACION-528', 'PERSONA_JURIDICA', 'RESPONSABLE_IVA',
    'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
    'PIN-CIFRADO-HABILITACION-528', 'TESTSET-HABILITACION-528', 'PRODUCCION',
    decode('01', 'hex'), 'ENC:CERT-VERIFY-528',
    now(), 'INCOMPLETA', jsonb_build_object(
      'reachable', true,
      'numberingValidated', true,
      'credentialsValidated', false,
      'externalApprovalValidated', false,
      'authorityTrust', jsonb_build_object('ready', true),
      'environment', 'PRODUCCION',
      'authorizedRanges', jsonb_build_array(jsonb_build_object(
        'resolution', 'RANGO-DISCORDANTE-528',
        'prefix', 'BAD528',
        'from', 2,
        'to', 999998,
        'validFrom', (current_date - 29)::text,
        'validTo', (current_date + 364)::text
      ))
    )
  );

  SELECT count(*) INTO v_outbox_before
  FROM public.outbox_events
  WHERE tenant_id = v_tenant
    AND idempotency_key = 'wizard-complete-464:verify-historical-complete-528';
  v_result := public.completar_wizard_config_tx(
    v_tenant, v_actor, 'verify-historical-complete-528',
    jsonb_build_object(
      'razon_social', 'No debe reejecutarse',
      '_intent_fingerprint', 'hmac-v1:' || repeat('d', 64)
    )
  );
  SELECT count(*) INTO v_outbox_after
  FROM public.outbox_events
  WHERE tenant_id = v_tenant
    AND idempotency_key = 'wizard-complete-464:verify-historical-complete-528';
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE
     OR v_result->>'legacyMarker' <> 'complete-528'
     OR strpos(v_result::text, 'No debe reejecutarse') > 0
     OR v_outbox_before <> 1 OR v_outbox_after <> v_outbox_before THEN
    RAISE EXCEPTION 'VERIFY_528_LEGACY_COMPLETE_REPLAY_BROKEN:%:%:%',
      v_result, v_outbox_before, v_outbox_after;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.completar_wizard_config_tx(
      v_tenant, v_actor, 'verify-raw-complete-528',
      jsonb_build_object(
        'razon_social', 'SHA legacy no permitido',
        '_intent_fingerprint', repeat('e', 64)
      )
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'CONFIGURATION_WIZARD_FINGERPRINT_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_528_RAW_COMPLETE_FINGERPRINT_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.completar_wizard_config_tx(
      v_tenant, v_actor, 'verify-missing-complete-528',
      jsonb_build_object('razon_social', 'Sin HMAC no permitido')
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'CONFIGURATION_WIZARD_FINGERPRINT_REQUIRED' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_528_MISSING_COMPLETE_FINGERPRINT_ACCEPTED';
  END IF;

  -- Compatibilidad estricta con el único llamador SQL heredado del seed demo.
  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, ruc, pais, plan, activo, estado
  ) VALUES (
    v_demo_tenant, 'VERIFY-528-DEMO-' || left(v_demo_tenant::text, 8),
    'Tenant demo configuración verify 528', 'Fixture demo transaccional',
    '900123456-8', 'CO', 'test', true, 'ACTIVO'
  );
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin
  ) VALUES (
    v_demo_actor, v_demo_tenant, 'Actor Demo', 'Verify 528',
    'actor-demo-528-' || left(v_demo_actor::text, 8) || '@local.invalid',
    'actordemo528-' || left(v_demo_actor::text, 8),
    'unused-local-hash', true, 'ACTIVO', false
  );
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, pais, pais_id,
    moneda_defecto, estado, configuracion_completa, is_demo, dian_environment
  ) VALUES (
    v_demo_tenant, '900123456-8', 'Empresa Demo Colombia S.A.S.',
    'Carrera 7 # 72-41, Bogotá D.C.', 'CO',
    (SELECT p.id FROM public.paises p
     WHERE upper(p.codigo_iso) = 'CO' AND p.activo LIMIT 1),
    'COP', 'ACTIVO', false, true, 'HOMOLOGACION'
  );
  v_result := public.completar_wizard_config_tx(
    v_demo_tenant, v_demo_actor, 'verify-demo-public-complete-528',
    jsonb_build_object(
      'pais', 'CO',
      'pais_id', (SELECT p.id FROM public.paises p
                  WHERE upper(p.codigo_iso) = 'CO' AND p.activo LIMIT 1),
      'moneda_defecto', 'COP'
    )
  );
  IF coalesce((v_result->>'idempotent')::boolean, true) IS NOT FALSE
     OR NOT EXISTS (
       SELECT 1 FROM public.configuration_operation_intents i
       WHERE i.tenant_id = v_demo_tenant
         AND i.idempotency_key = 'verify-demo-public-complete-528'
         AND i.intent_fingerprint ~ '^db-public-v1:[0-9a-f]{64}$'
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_DEMO_PUBLIC_COMPLETION_BROKEN:%', v_result;
  END IF;

  v_result := public.completar_wizard_config_tx(
    v_tenant, v_actor, 'verify-hmac-complete-528',
    jsonb_build_object(
      'razon_social', 'Emisor HMAC verify 528',
      '_intent_fingerprint', 'hmac-v1:' || repeat('f', 64)
    )
  );
  IF coalesce((v_result->>'idempotent')::boolean, true) IS NOT FALSE
     OR NOT EXISTS (
       SELECT 1 FROM public.configuration_operation_intents i
       WHERE i.tenant_id = v_tenant
         AND i.idempotency_key = 'verify-hmac-complete-528'
         AND i.intent_fingerprint ~ '^hmac-v1:[0-9a-f]{64}$'
     ) THEN
    RAISE EXCEPTION 'VERIFY_528_HMAC_COMPLETION_NOT_PERSISTED:%', v_result;
  END IF;
  v_result := public.completar_wizard_config_tx(
    v_tenant, v_actor, 'verify-hmac-complete-528',
    jsonb_build_object(
      'razon_social', 'Emisor HMAC verify 528',
      '_intent_fingerprint', 'hmac-v1:' || repeat('f', 64)
    )
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_528_HMAC_COMPLETION_NOT_IDEMPOTENT:%', v_result;
  END IF;

  FOR v_range_case IN
    SELECT value
    FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object(
        'resolution', 'BAD-RESOLUTION-528', 'prefix', 'FV528',
        'from', 1, 'to', 999999,
        'validFrom', (current_date - 30)::text,
        'validTo', (current_date + 365)::text
      ),
      jsonb_build_object(
        'resolution', '1876405289', 'prefix', 'BAD528',
        'from', 1, 'to', 999999,
        'validFrom', (current_date - 30)::text,
        'validTo', (current_date + 365)::text
      ),
      jsonb_build_object(
        'resolution', '1876405289', 'prefix', 'FV528',
        'from', 2, 'to', 999999,
        'validFrom', (current_date - 30)::text,
        'validTo', (current_date + 365)::text
      ),
      jsonb_build_object(
        'resolution', '1876405289', 'prefix', 'FV528',
        'from', 1, 'to', 999998,
        'validFrom', (current_date - 30)::text,
        'validTo', (current_date + 365)::text
      ),
      jsonb_build_object(
        'resolution', '1876405289', 'prefix', 'FV528',
        'from', 1, 'to', 999999,
        'validFrom', (current_date - 29)::text,
        'validTo', (current_date + 365)::text
      ),
      jsonb_build_object(
        'resolution', '1876405289', 'prefix', 'FV528',
        'from', 1, 'to', 999999,
        'validFrom', (current_date - 30)::text,
        'validTo', (current_date + 364)::text
      )
    ))
  LOOP
    v_range_case_index := v_range_case_index + 1;
    UPDATE public.empresa_config
    SET dian_ultima_prueba_at = now(),
        dian_ultima_prueba_detalle = jsonb_set(
          dian_ultima_prueba_detalle,
          '{authorizedRanges}', jsonb_build_array(v_range_case), true
        )
    WHERE tenant_id = v_tenant;

    v_rejected := false;
    BEGIN
      PERFORM public.registrar_habilitacion_dian_tx(
        v_tenant, v_actor,
        'verify-range-mismatch-528-' || v_range_case_index::text,
        'Portal DIAN con rango discordante verify 528'
      );
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'DIAN_TECHNICAL_VALIDATION_REQUIRED_BEFORE_PORTAL_ATTESTATION' THEN
        RAISE;
      END IF;
      v_rejected := true;
    END;
    IF NOT v_rejected
       OR (SELECT dian_habilitacion_estado IS NOT NULL
           FROM public.empresa_config WHERE tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'VERIFY_528_RANGE_MISMATCH_ACCEPTED:%:%',
        v_range_case_index, v_range_case;
    END IF;
  END LOOP;

  UPDATE public.empresa_config
  SET dian_ultima_prueba_at = now(),
      dian_ultima_prueba_detalle = jsonb_set(
        dian_ultima_prueba_detalle,
        '{authorizedRanges}',
        jsonb_build_array(jsonb_build_object(
          'resolution', '1876405289',
          'prefix', 'FV528',
          'from', 1,
          'to', 999999,
          'validFrom', (current_date - 30)::text,
          'validTo', (current_date + 365)::text
        )), true
      )
  WHERE tenant_id = v_tenant;

  v_result := public.registrar_habilitacion_dian_tx(
    v_tenant, v_actor, 'verify-first-attestation-good-528',
    'Portal DIAN software Habilitado verify 528'
  );
  IF v_result->>'estado' <> 'HABILITADO'
     OR (SELECT dian_habilitacion_estado FROM public.empresa_config
         WHERE tenant_id = v_tenant) <> 'HABILITADO'
     OR (SELECT dian_habilitacion_evidencia->>'source'
         FROM public.empresa_config WHERE tenant_id = v_tenant)
          <> 'DIAN_PORTAL_HABILITACION'
     OR (SELECT (dian_ultima_prueba_detalle->>'credentialsValidated')::boolean
         FROM public.empresa_config WHERE tenant_id = v_tenant) IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_528_FIRST_ATTESTATION_NOT_PERSISTED:%', v_result;
  END IF;

  v_result := public.registrar_habilitacion_dian_tx(
    v_tenant, v_actor, 'verify-first-attestation-good-528',
    'Portal DIAN software Habilitado verify 528'
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_528_FIRST_ATTESTATION_NOT_IDEMPOTENT:%', v_result;
  END IF;
END;
$wizard_and_first_attestation$;

ROLLBACK;

\echo 'VERIFY_528_OK'
