\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_533') THEN
    RAISE EXCEPTION 'VERIFY_533_SOLO_BASE_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contract$
DECLARE
  v_count integer;
  v_validated boolean;
BEGIN
  IF to_regprocedure('app.cpe_demo_artifact_guard_533()') IS NULL
     OR to_regprocedure('app.cpe_demo_transport_guard_533()') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_533_FUNCTIONS_MISSING';
  END IF;

  IF has_function_privilege('anon', 'app.cpe_demo_artifact_guard_533()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_demo_artifact_guard_533()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cpe_demo_artifact_guard_533()', 'EXECUTE')
     OR has_function_privilege('anon', 'app.cpe_demo_transport_guard_533()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_demo_transport_guard_533()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cpe_demo_transport_guard_533()', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_533_INTERNAL_FUNCTION_ACL_EXPOSED';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'public.cpe'::regclass
    AND tgname = 'trg_d_cpe_demo_artifact_guard_533'
    AND NOT tgisinternal
    AND tgenabled = 'O';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_533_ARTIFACT_TRIGGER_MISSING:%', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'public.cpe_operaciones'::regclass
    AND tgname = 'trg_zz_cpe_demo_transport_guard_533'
    AND NOT tgisinternal
    AND tgenabled = 'O';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_533_TRANSPORT_TRIGGER_MISSING:%', v_count;
  END IF;

  IF NOT (
    'trg_cpe_provenance_guard_525' < 'trg_d_cpe_demo_artifact_guard_533'
    AND 'trg_d_cpe_demo_artifact_guard_533' < 'trg_snapshot_dian_receiver_profile_526'
    AND 'trg_d_cpe_demo_artifact_guard_533' < 'trg_zz_cpe_dian_acceptance_guard_528'
  ) THEN
    RAISE EXCEPTION 'VERIFY_533_ARTIFACT_TRIGGER_ORDER_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cpe'::regclass
      AND tgname = 'trg_cpe_provenance_guard_525'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cpe'::regclass
      AND tgname = 'trg_snapshot_dian_receiver_profile_526'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cpe'::regclass
      AND tgname = 'trg_zz_cpe_dian_acceptance_guard_528'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_533_ORDERED_BASELINE_TRIGGER_MISSING';
  END IF;

  SELECT convalidated INTO v_validated
  FROM pg_constraint
  WHERE conrelid = 'public.cpe'::regclass
    AND conname = 'ck_cpe_co_simulated_no_external_state_533';
  IF v_validated IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_533_STATE_CONSTRAINT_NOT_VALIDATED';
  END IF;
END;
$contract$;

DO $behavior$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_cpe uuid := gen_random_uuid();
  v_real_cpe uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_xml text;
  v_real_xml text := '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>FV533-2</ID></Invoice>';
  v_hash text;
  v_payload jsonb;
  v_rejected boolean;
  v_constraint text;
  v_message text;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY CPE DEMO CO 533', 1, 'CO');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  v_payload := jsonb_build_object(
    'version', 1,
    'country', 'CO',
    'authority', 'DIAN',
    'fiscalValidity', 'NONE',
    'documentType', '01',
    'series', 'FV53',
    'number', 1,
    'issueDate', current_date::text,
    'currency', 'COP',
    'issuerTaxId', '9015330001',
    'receiverDocument', '222222222222',
    'taxable', 100,
    'exempt', 0,
    'excluded', 0,
    'taxes', 19,
    'payable', 119,
    'items', jsonb_build_array(jsonb_build_object(
      'code', 'D533', 'description', 'Demo 533', 'quantity', 1,
      'unitPrice', 100, 'lineValue', 100, 'vat', 19, 'affectation', '10'
    ))
  );
  v_xml := '<?xml version="1.0" encoding="UTF-8"?>'
    || '<DemoCpe xmlns="urn:erp-suite:demo:cpe:1" country="CO" authority="DIAN" fiscalValidity="NONE">'
    || '<Notice>MUESTRA DEMO SIN TRANSMISION NI VALIDEZ DIAN</Notice>'
    || '<CanonicalPayload encoding="base64-json">'
    || regexp_replace(
         encode(convert_to(v_payload::text, 'UTF8'), 'base64'),
         '[[:space:]]', '', 'g'
       )
    || '</CanonicalPayload></DemoCpe>';
  v_hash := encode(extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'), 'hex');

  -- Carrera reproducida: el API ya construyó el artefacto, pero el tenant fue
  -- convertido a real antes del INSERT. 525 observará false y 533 debe degradar
  -- atómicamente el artefacto a simulated_origin=true antes del snapshot 526.
  UPDATE public.empresa_config
  SET is_demo = false,
      demo_extended = false,
      demo_expires_at = NULL,
      pais = 'CO',
      updated_at = now()
  WHERE tenant_id = v_tenant;

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, xml_firmado, hash, hash_firma, metadata, activo
  ) VALUES (
    v_cpe, v_tenant, '01', 'FV53', '00000001',
    '9015330001', 'Emisor demo verify 533', '13',
    '222222222222', 'Consumidor demo verify 533', 'COP',
    100, 19, 119, 119,
    '[{"codigo":"D533","descripcion":"Demo 533","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
    now(), 'verify.cpe.533.demo-race', 'FIRMADO', 'PENDIENTE',
    'READY', v_xml, v_hash, v_hash,
    jsonb_build_object(
      'dian_is_demo', true,
      'dian_simulado', true,
      'dian_fixture_source', 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
      'demo_artifact_format', 'ERP_DEMO_CPE_V1',
      'demo_artifact_signed', false,
      'demo_artifact_integrity', 'SHA-256',
      'fiscal_delivery_eligible', false
    ),
    true
  );

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_cpe) IS NOT TRUE
     OR (SELECT issuer_snapshot->>'country_code' FROM public.cpe WHERE id = v_cpe) <> 'CO'
     OR (SELECT fiscal_authority_evidence->>'status' FROM public.cpe WHERE id = v_cpe) <> 'SIMULATED'
     OR (SELECT metadata->'demo_artifact_signed' FROM public.cpe WHERE id = v_cpe) <> 'false'::jsonb
     OR (SELECT metadata->'fiscal_delivery_eligible' FROM public.cpe WHERE id = v_cpe) <> 'false'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_533_DEMO_RACE_NOT_CLOSED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.reservar_envio_cpe_tx(
      v_tenant, v_actor, v_cpe, 'verify.cpe.533.send', 'USER'
    );
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'CPE_DEMO_EXTERNAL_TRANSPORT_BLOCKED' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected OR EXISTS (
    SELECT 1 FROM public.cpe_operaciones WHERE cpe_id = v_cpe AND action = 'SEND'
  ) THEN
    RAISE EXCEPTION 'VERIFY_533_DEMO_SEND_NOT_BLOCKED';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.cpe_operaciones (
      tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
      state, lease_expires_at, attempt, actor_id, origin, request_summary
    ) VALUES (
      v_tenant, v_cpe, 'QUERY', 'verify.cpe.533.query', repeat('a', 64),
      'CLAIMED', now() + interval '5 minutes', 1, v_actor, 'SYSTEM', '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'CPE_DEMO_EXTERNAL_TRANSPORT_BLOCKED' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected OR EXISTS (
    SELECT 1 FROM public.cpe_operaciones WHERE cpe_id = v_cpe AND action = 'QUERY'
  ) THEN
    RAISE EXCEPTION 'VERIFY_533_DEMO_QUERY_NOT_BLOCKED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
        sunat_status = 'ACCEPTED', cdr_sunat = '<ApplicationResponse>falso</ApplicationResponse>'
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ck_cpe_co_simulated_no_external_state_533' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe) = 'ACEPTADO' THEN
    RAISE EXCEPTION 'VERIFY_533_DIRECT_ACCEPTANCE_NOT_BLOCKED';
  END IF;

  -- Control positivo: un CPE CO que realmente nació después de la conversión
  -- conserva simulated_origin=false y puede crear una operación SEND normal.
  INSERT INTO public.clientes (
    id, tenant_id, nombre, razon_social, documento_tipo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES (
    v_client, v_tenant, 'Receptor real verify 533', 'Receptor real verify 533',
    'NIT', 'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
  );

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, xml_firmado, hash, hash_firma, metadata, activo
  ) VALUES (
    v_real_cpe, v_tenant, '01', 'FV53', '00000002',
    '9015330001', 'Emisor real verify 533', '31',
    '9005330001', 'Receptor real verify 533', v_client, 'COP',
    100, 19, 119, 119,
    '[{"codigo":"R533","descripcion":"Real 533","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
    now(), 'verify.cpe.533.real', 'FIRMADO', 'PENDIENTE',
    'READY', v_real_xml,
    encode(extensions.digest(convert_to(v_real_xml, 'UTF8'), 'sha256'), 'hex'),
    encode(extensions.digest(convert_to(v_real_xml, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('dian_is_demo', false, 'source', 'verify.533.real'),
    true
  );

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_real_cpe) IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_533_REAL_CO_WAS_DOWNGRADED';
  END IF;

  INSERT INTO public.cpe_operaciones (
    tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
    state, lease_expires_at, attempt, actor_id, origin, request_summary
  ) VALUES (
    v_tenant, v_real_cpe, 'SEND', 'verify.cpe.533.real.send', repeat('b', 64),
    'CLAIMED', now() + interval '5 minutes', 1, v_actor, 'SYSTEM', '{}'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.cpe_operaciones
    WHERE cpe_id = v_real_cpe AND action = 'SEND' AND state = 'CLAIMED'
  ) THEN
    RAISE EXCEPTION 'VERIFY_533_REAL_CO_OPERATION_BLOCKED';
  END IF;
END;
$behavior$;

ROLLBACK;

\echo 'VERIFY_533_OK'
