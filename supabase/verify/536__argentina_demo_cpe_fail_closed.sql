\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_536') THEN
    RAISE EXCEPTION 'VERIFY_536_SOLO_BASE_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contract$
DECLARE
  v_validated boolean;
  v_function text;
BEGIN
  SELECT pg_get_functiondef('app.cpe_demo_artifact_guard_533()'::regprocedure)
  INTO v_function;
  IF position('v_country NOT IN (''CO'', ''AR'')' IN v_function) = 0
     OR position('CPE_DEMO_ARTIFACT_536' IN v_function) = 0 THEN
    RAISE EXCEPTION 'VERIFY_536_ARTIFACT_GUARD_NOT_GENERALIZED';
  END IF;

  SELECT pg_get_functiondef('app.cpe_demo_transport_guard_533()'::regprocedure)
  INTO v_function;
  IF position('v_country IN (''CO'', ''AR'')' IN v_function) = 0 THEN
    RAISE EXCEPTION 'VERIFY_536_TRANSPORT_GUARD_NOT_GENERALIZED';
  END IF;

  IF has_function_privilege('anon', 'app.cpe_demo_artifact_guard_533()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_demo_artifact_guard_533()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cpe_demo_artifact_guard_533()', 'EXECUTE')
     OR has_function_privilege('anon', 'app.cpe_demo_transport_guard_533()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_demo_transport_guard_533()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cpe_demo_transport_guard_533()', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_536_INTERNAL_FUNCTION_ACL_EXPOSED';
  END IF;

  SELECT convalidated INTO v_validated
  FROM pg_constraint
  WHERE conrelid = 'public.cpe'::regclass
    AND conname = 'ck_cpe_ar_simulated_no_external_state_536';
  IF v_validated IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_536_AR_STATE_CONSTRAINT_NOT_VALIDATED';
  END IF;
END;
$contract$;

DO $behavior$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_demo_cpe uuid := gen_random_uuid();
  v_real_cpe uuid := gen_random_uuid();
  v_xml text;
  v_real_xml text := '<ComprobanteInterno><ID>00001-2</ID></ComprobanteInterno>';
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

  v_demo := public.create_demo_tenant('VERIFY CPE DEMO AR 536', 1, 'AR');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  v_payload := jsonb_build_object(
    'version', 1,
    'country', 'AR',
    'authority', 'ARCA',
    'fiscalValidity', 'NONE',
    'documentType', '01',
    'series', '00001',
    'number', 1,
    'issueDate', current_date::text,
    'currency', 'ARS',
    'issuerTaxId', '30710158229',
    'receiverDocument', '30123456',
    'taxable', 1000,
    'exempt', 0,
    'excluded', 0,
    'taxes', 210,
    'payable', 1210,
    'items', jsonb_build_array(jsonb_build_object(
      'code', 'AR536', 'description', 'Muestra Argentina 536', 'quantity', 1,
      'unitPrice', 1000, 'lineValue', 1000, 'vat', 210, 'affectation', '10'
    ))
  );
  v_xml := '<?xml version="1.0" encoding="UTF-8"?>'
    || '<DemoCpe xmlns="urn:erp-suite:demo:cpe:1" country="AR" authority="ARCA" fiscalValidity="NONE">'
    || '<Notice>MUESTRA DEMO SIN TRANSMISION NI VALIDEZ ARCA</Notice>'
    || '<CanonicalPayload encoding="base64-json">'
    || regexp_replace(encode(convert_to(v_payload::text, 'UTF8'), 'base64'), '[[:space:]]', '', 'g')
    || '</CanonicalPayload></DemoCpe>';
  v_hash := encode(extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'), 'hex');

  -- Reproduce la carrera demo -> real. El artefacto autocontenido sólo puede
  -- degradarse a simulado; jamás puede adquirir procedencia fiscal real.
  UPDATE public.empresa_config
  SET is_demo = false,
      demo_extended = false,
      demo_expires_at = NULL,
      pais = 'AR',
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
    v_demo_cpe, v_tenant, '01', '00001', '00000001',
    '30710158229', 'Emisor demo Argentina 536', '96',
    '30123456', 'Consumidor final Argentina 536', 'ARS',
    1000, 210, 1210, 1210,
    '[{"codigo":"AR536","descripcion":"Muestra Argentina 536","cantidad":1,"valor_venta":1000,"igv":210,"total":1210}]'::jsonb,
    now(), 'verify.cpe.536.demo-race', 'FIRMADO', 'PENDIENTE',
    'READY', v_xml, v_hash, v_hash,
    jsonb_build_object(
      'pais', 'AR',
      'arca_is_demo', true,
      'arca_simulado', true,
      'arca_fixture_source', 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
      'demo_artifact_format', 'ERP_DEMO_CPE_V1',
      'demo_artifact_signed', false,
      'demo_artifact_integrity', 'SHA-256',
      'fiscal_delivery_eligible', false
    ),
    true
  );

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_demo_cpe) IS NOT TRUE
     OR (SELECT issuer_snapshot->>'country_code' FROM public.cpe WHERE id = v_demo_cpe) <> 'AR'
     OR (SELECT fiscal_authority_evidence->>'authority' FROM public.cpe WHERE id = v_demo_cpe) <> 'ARCA'
     OR (SELECT fiscal_authority_evidence->>'status' FROM public.cpe WHERE id = v_demo_cpe) <> 'SIMULATED'
     OR (SELECT metadata->'demo_artifact_signed' FROM public.cpe WHERE id = v_demo_cpe) <> 'false'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_536_AR_DEMO_RACE_NOT_CLOSED';
  END IF;

  FOREACH v_message IN ARRAY ARRAY['SEND', 'QUERY'] LOOP
    v_rejected := false;
    BEGIN
      INSERT INTO public.cpe_operaciones (
        tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
        state, lease_expires_at, attempt, actor_id, origin, request_summary
      ) VALUES (
        v_tenant, v_demo_cpe, v_message,
        'verify.cpe.536.' || lower(v_message), repeat('a', 64),
        'CLAIMED', now() + interval '5 minutes', 1, v_actor, 'SYSTEM', '{}'::jsonb
      );
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = MESSAGE_TEXT;
      IF v_constraint <> 'CPE_DEMO_EXTERNAL_TRANSPORT_BLOCKED' THEN RAISE; END IF;
      v_rejected := true;
    END;
    IF NOT v_rejected OR EXISTS (
      SELECT 1 FROM public.cpe_operaciones
      WHERE cpe_id = v_demo_cpe AND action = v_message
    ) THEN
      RAISE EXCEPTION 'VERIFY_536_AR_DEMO_OPERATION_NOT_BLOCKED:%', v_message;
    END IF;
  END LOOP;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
        sunat_status = 'ACCEPTED',
        metadata = metadata || jsonb_build_object('arca_cae', '70417054367476')
    WHERE id = v_demo_cpe;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ck_cpe_ar_simulated_no_external_state_536' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT estado::text FROM public.cpe WHERE id = v_demo_cpe) = 'ACEPTADO' THEN
    RAISE EXCEPTION 'VERIFY_536_AR_DEMO_ACCEPTANCE_NOT_BLOCKED';
  END IF;

  -- Control positivo: el guard no degrada ni bloquea un CPE Argentina real.
  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, xml_firmado, hash, hash_firma, metadata, activo
  ) VALUES (
    v_real_cpe, v_tenant, '01', '00001', '00000002',
    '30710158229', 'Emisor real Argentina 536', '96',
    '30123456', 'Consumidor final Argentina 536', 'ARS',
    1000, 210, 1210, 1210,
    '[{"codigo":"AR536R","descripcion":"Control real 536","cantidad":1,"valor_venta":1000,"igv":210,"total":1210}]'::jsonb,
    now(), 'verify.cpe.536.real', 'FIRMADO', 'PENDIENTE',
    'READY', v_real_xml,
    encode(extensions.digest(convert_to(v_real_xml, 'UTF8'), 'sha256'), 'hex'),
    encode(extensions.digest(convert_to(v_real_xml, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('pais', 'AR', 'arca_is_demo', false, 'source', 'verify.536.real'),
    true
  );

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_real_cpe) IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_536_REAL_AR_WAS_DOWNGRADED';
  END IF;

  INSERT INTO public.cpe_operaciones (
    tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
    state, lease_expires_at, attempt, actor_id, origin, request_summary
  ) VALUES (
    v_tenant, v_real_cpe, 'SEND', 'verify.cpe.536.real.send', repeat('b', 64),
    'CLAIMED', now() + interval '5 minutes', 1, v_actor, 'SYSTEM', '{}'::jsonb
  );
END;
$behavior$;

ROLLBACK;

\echo 'VERIFY_536_OK'
