-- Las demos Argentina y Colombia generan sólo representaciones internas:
-- nunca XML fiscal, nunca firma, nunca CAE/CUFE y nunca transporte externo.
-- Extiende el guard 533 sin relajar el contrato ya vigente para Colombia.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

LOCK TABLE public.cpe, public.cpe_operaciones IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_unsafe_ar_cpe bigint;
  v_unsafe_ar_operations bigint;
BEGIN
  IF to_regprocedure('app.cpe_provenance_guard_525()') IS NULL
     OR to_regprocedure('app.cpe_demo_artifact_guard_533()') IS NULL
     OR to_regprocedure('app.cpe_demo_transport_guard_533()') IS NULL
     OR to_regclass('public.cpe_operaciones') IS NULL THEN
    RAISE EXCEPTION 'CPE_DEMO_536_BASELINE_REQUIRED'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_unsafe_ar_cpe
  FROM public.cpe c
  WHERE c.simulated_origin IS NOT FALSE
    AND upper(coalesce(c.issuer_snapshot->>'country_code', '')) = 'AR'
    AND (
      upper(coalesce(c.fiscal_authority_evidence->>'status', ''))
        NOT IN ('SIMULATED', 'LEGACY_UNVERIFIED')
      OR upper(btrim(coalesce(c.estado::text, '')))
        IN ('ENVIADO', 'ACEPTADO', 'RECHAZADO')
      OR upper(btrim(coalesce(c.estado_sunat::text, '')))
        IN ('ENVIADO', 'ACEPTADO', 'RECHAZADO')
      OR upper(btrim(coalesce(c.sunat_status::text, '')))
        IN ('SENDING', 'ACCEPTED', 'REJECTED')
      OR nullif(btrim(coalesce(c.cdr_sunat, '')), '') IS NOT NULL
      OR nullif(btrim(coalesce(c.numero_comprobante_sunat, '')), '') IS NOT NULL
      OR c.fecha_envio IS NOT NULL
      OR lower(coalesce(c.metadata->>'fiscal_delivery_eligible', 'false')) = 'true'
      OR nullif(btrim(coalesce(c.metadata->>'arca_cae', '')), '') IS NOT NULL
    );
  IF v_unsafe_ar_cpe <> 0 THEN
    RAISE EXCEPTION 'CPE_DEMO_536_EXISTING_EXTERNAL_STATE:%', v_unsafe_ar_cpe
      USING ERRCODE = '23514',
        DETAIL = 'Remedie explícitamente la evidencia antes de promover; 536 no reescribe historia fiscal.';
  END IF;

  SELECT count(*) INTO v_unsafe_ar_operations
  FROM public.cpe_operaciones o
  JOIN public.cpe c
    ON c.id = o.cpe_id AND c.tenant_id = o.tenant_id
  WHERE o.action IN ('SEND', 'QUERY')
    AND (
      o.state = 'CLAIMED'
      OR upper(coalesce(o.result_kind, '')) IN ('ACCEPTED', 'PENDING', 'REJECTED')
    )
    AND c.simulated_origin IS NOT FALSE
    AND upper(coalesce(c.issuer_snapshot->>'country_code', '')) = 'AR';
  IF v_unsafe_ar_operations <> 0 THEN
    RAISE EXCEPTION 'CPE_DEMO_536_EXISTING_EXTERNAL_OPERATION:%', v_unsafe_ar_operations
      USING ERRCODE = '55000';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION app.cpe_demo_artifact_guard_533()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_metadata jsonb := coalesce(NEW.metadata, '{}'::jsonb);
  v_xml_text text := coalesce(NEW.xml_firmado, '');
  v_is_candidate boolean;
  v_old_is_candidate boolean := false;
  v_xml xml;
  v_root_name text;
  v_root_namespace text;
  v_country text;
  v_authority text;
  v_expected_authority text;
  v_expected_notice text;
  v_fiscal_validity text;
  v_notice text;
  v_payload text;
  v_payload_json jsonb;
  v_element_count integer;
  v_signature_count integer;
  v_ubl_count integer;
  v_hash text;
BEGIN
  v_is_candidate :=
    v_metadata @> '{"dian_is_demo":true}'::jsonb
    OR v_metadata @> '{"dian_simulado":true}'::jsonb
    OR v_metadata @> '{"arca_is_demo":true}'::jsonb
    OR v_metadata @> '{"arca_simulado":true}'::jsonb
    OR v_metadata ? 'demo_artifact_format'
    OR v_metadata ? 'demo_artifact_signed'
    OR v_xml_text ~ '<DemoCpe[[:space:]>]';

  IF TG_OP = 'UPDATE' THEN
    v_old_is_candidate :=
      coalesce(OLD.metadata, '{}'::jsonb) @> '{"dian_is_demo":true}'::jsonb
      OR coalesce(OLD.metadata, '{}'::jsonb) @> '{"dian_simulado":true}'::jsonb
      OR coalesce(OLD.metadata, '{}'::jsonb) @> '{"arca_is_demo":true}'::jsonb
      OR coalesce(OLD.metadata, '{}'::jsonb) @> '{"arca_simulado":true}'::jsonb
      OR coalesce(OLD.metadata, '{}'::jsonb) ? 'demo_artifact_format'
      OR coalesce(OLD.metadata, '{}'::jsonb) ? 'demo_artifact_signed'
      OR coalesce(OLD.xml_firmado, '') ~ '<DemoCpe[[:space:]>]';

    IF v_is_candidate IS DISTINCT FROM v_old_is_candidate THEN
      RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT v_is_candidate THEN
    RETURN NEW;
  END IF;

  IF NOT (
    v_metadata @> jsonb_build_object(
      'demo_artifact_format', 'ERP_DEMO_CPE_V1',
      'demo_artifact_signed', false,
      'demo_artifact_integrity', 'SHA-256',
      'fiscal_delivery_eligible', false
    )
  ) THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_METADATA_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF octet_length(v_xml_text) NOT BETWEEN 1 AND 2097152
     OR v_xml_text ~* '<!(DOCTYPE|ENTITY)' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_XML_INVALID'
      USING ERRCODE = '2200N';
  END IF;

  BEGIN
    v_xml := xmlparse(document v_xml_text);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_XML_INVALID'
      USING ERRCODE = '2200N';
  END;

  v_root_name := coalesce((xpath('local-name(/*)', v_xml))[1]::text, '');
  v_root_namespace := coalesce((xpath('namespace-uri(/*)', v_xml))[1]::text, '');
  v_country := upper(coalesce((xpath('string(/*/@country)', v_xml))[1]::text, ''));
  v_authority := upper(coalesce((xpath('string(/*/@authority)', v_xml))[1]::text, ''));
  v_expected_authority := CASE v_country WHEN 'CO' THEN 'DIAN' WHEN 'AR' THEN 'ARCA' ELSE '' END;
  v_expected_notice := 'MUESTRA DEMO SIN TRANSMISION NI VALIDEZ ' || v_expected_authority;
  v_fiscal_validity := coalesce((xpath('string(/*/@fiscalValidity)', v_xml))[1]::text, '');
  v_notice := btrim(coalesce((xpath(
    'string(/*/*[local-name()="Notice" and namespace-uri()="urn:erp-suite:demo:cpe:1"][1])',
    v_xml
  ))[1]::text, ''));
  v_payload := coalesce((xpath(
    'string(/*/*[local-name()="CanonicalPayload" and namespace-uri()="urn:erp-suite:demo:cpe:1" and @encoding="base64-json"][1])',
    v_xml
  ))[1]::text, '');
  v_element_count := coalesce((xpath('count(//*)', v_xml))[1]::text::numeric::integer, 0);
  v_signature_count := coalesce(
    (xpath('count(//*[local-name()="Signature"])', v_xml))[1]::text::numeric::integer,
    0
  );
  v_ubl_count := coalesce((xpath(
    'count(//*[starts-with(namespace-uri(), "urn:oasis:names:specification:ubl")])',
    v_xml
  ))[1]::text::numeric::integer, 0);

  IF v_root_name <> 'DemoCpe'
     OR v_root_namespace <> 'urn:erp-suite:demo:cpe:1'
     OR v_country NOT IN ('CO', 'AR')
     OR v_authority <> v_expected_authority
     OR v_fiscal_validity <> 'NONE'
     OR v_notice <> v_expected_notice
     OR v_element_count <> 3
     OR v_signature_count <> 0
     OR v_ubl_count <> 0
     OR length(v_payload) NOT BETWEEN 4 AND 1572864
     OR length(v_payload) % 4 <> 0
     OR v_payload !~ '^[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_CONTRACT_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF v_country = 'CO' AND NOT (
    v_metadata @> jsonb_build_object(
      'dian_is_demo', true,
      'dian_simulado', true,
      'dian_fixture_source', 'ERP_DEMO_LOCAL_REPRESENTATION_V1'
    )
  ) THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_METADATA_INVALID'
      USING ERRCODE = '23514';
  ELSIF v_country = 'AR' AND NOT (
    v_metadata @> jsonb_build_object(
      'arca_is_demo', true,
      'arca_simulado', true,
      'arca_fixture_source', 'ERP_DEMO_LOCAL_REPRESENTATION_V1'
    )
  ) THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_METADATA_INVALID'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    v_payload_json := convert_from(decode(v_payload, 'base64'), 'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END;

  IF jsonb_typeof(v_payload_json) IS DISTINCT FROM 'object'
     OR v_payload_json->>'version' IS DISTINCT FROM '1'
     OR upper(coalesce(v_payload_json->>'country', '')) <> v_country
     OR upper(coalesce(v_payload_json->>'authority', '')) <> v_expected_authority
     OR v_payload_json->>'fiscalValidity' IS DISTINCT FROM 'NONE'
     OR upper(coalesce(v_payload_json->>'documentType', '')) <>
          upper(btrim(coalesce(NEW.tipo_documento, '')))
     OR upper(coalesce(v_payload_json->>'series', '')) <>
          upper(btrim(coalesce(NEW.serie, '')))
     OR coalesce(v_payload_json->>'number', '') !~ '^[0-9]+$'
     OR btrim(coalesce(NEW.numero, '')) !~ '^[0-9]+$'
     OR (v_payload_json->>'number')::numeric <> btrim(NEW.numero)::numeric
     OR upper(coalesce(v_payload_json->>'currency', '')) <>
          upper(btrim(coalesce(NEW.moneda, '')))
     OR coalesce(v_payload_json->>'issuerTaxId', '') <> coalesce(NEW.ruc_emisor, '')
     OR coalesce(v_payload_json->>'receiverDocument', '') <> coalesce(NEW.documento_receptor, '')
     OR jsonb_typeof(v_payload_json->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_PAYLOAD_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  v_hash := encode(extensions.digest(convert_to(v_xml_text, 'UTF8'), 'sha256'), 'hex');
  IF lower(coalesce(NEW.hash, '')) <> v_hash
     OR lower(coalesce(NEW.hash_firma, '')) <> v_hash THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_HASH_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.simulated_origin := true;
    NEW.fiscal_authority_evidence := jsonb_build_object(
      'contract_version', 525,
      'authority', v_expected_authority,
      'country_code', v_country,
      'status', 'SIMULATED',
      'source', 'CPE_DEMO_ARTIFACT_536'
    );
  ELSIF NEW.simulated_origin IS NOT TRUE
        OR upper(coalesce(NEW.issuer_snapshot->>'country_code', '')) <> v_country
        OR upper(coalesce(NEW.fiscal_authority_evidence->>'status', '')) <> 'SIMULATED'
        OR upper(coalesce(NEW.fiscal_authority_evidence->>'authority', '')) <> v_expected_authority THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_PROVENANCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF upper(coalesce(NEW.issuer_snapshot->>'country_code', '')) <> v_country THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_COUNTRY_INVALID'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cpe_demo_transport_guard_533()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_simulated boolean;
  v_country text;
BEGIN
  IF upper(coalesce(NEW.action, '')) NOT IN ('SEND', 'QUERY') THEN
    RETURN NEW;
  END IF;

  SELECT c.simulated_origin,
         upper(nullif(btrim(c.issuer_snapshot->>'country_code'), ''))
  INTO v_simulated, v_country
  FROM public.cpe c
  WHERE c.id = NEW.cpe_id
    AND c.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_DEMO_TRANSPORT_CPE_NOT_FOUND'
      USING ERRCODE = '23503';
  END IF;
  IF v_country IN ('CO', 'AR') AND v_simulated IS NOT FALSE THEN
    RAISE EXCEPTION 'CPE_DEMO_EXTERNAL_TRANSPORT_BLOCKED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_demo_artifact_guard_533()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.cpe_demo_transport_guard_533()
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.cpe
  DROP CONSTRAINT IF EXISTS ck_cpe_ar_simulated_no_external_state_536;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_ar_simulated_no_external_state_536 CHECK (
    NOT (
      simulated_origin IS NOT FALSE
      AND upper(coalesce(issuer_snapshot->>'country_code', '')) = 'AR'
    )
    OR (
      upper(coalesce(fiscal_authority_evidence->>'status', ''))
        IN ('SIMULATED', 'LEGACY_UNVERIFIED')
      AND (
        coalesce(metadata->>'demo_artifact_format', '') <> 'ERP_DEMO_CPE_V1'
        OR upper(coalesce(fiscal_authority_evidence->>'status', '')) = 'SIMULATED'
      )
      AND upper(btrim(coalesce(estado::text, '')))
        NOT IN ('ENVIADO', 'ACEPTADO', 'RECHAZADO')
      AND upper(btrim(coalesce(estado_sunat::text, '')))
        NOT IN ('ENVIADO', 'ACEPTADO', 'RECHAZADO')
      AND upper(btrim(coalesce(sunat_status::text, '')))
        NOT IN ('SENDING', 'ACCEPTED', 'REJECTED')
      AND nullif(btrim(coalesce(cdr_sunat, '')), '') IS NULL
      AND nullif(btrim(coalesce(numero_comprobante_sunat, '')), '') IS NULL
      AND fecha_envio IS NULL
      AND nullif(btrim(coalesce(metadata->>'arca_cae', '')), '') IS NULL
      AND lower(coalesce(metadata->>'fiscal_delivery_eligible', 'false')) <> 'true'
    )
  ) NOT VALID;

ALTER TABLE public.cpe
  VALIDATE CONSTRAINT ck_cpe_ar_simulated_no_external_state_536;

COMMENT ON FUNCTION app.cpe_demo_artifact_guard_533() IS
  'Valida el artefacto interno ERP_DEMO_CPE_V1 para CO/AR, comprueba forma/hash/etiquetas y fija procedencia simulada aun ante conversión concurrente del tenant.';
COMMENT ON FUNCTION app.cpe_demo_transport_guard_533() IS
  'Bloquea toda reserva, consulta o reclaim SEND/QUERY de CPE CO/AR nacidos como simulados.';
COMMENT ON CONSTRAINT ck_cpe_ar_simulated_no_external_state_536 ON public.cpe IS
  'Un CPE Argentina simulado nunca puede contener CAE, evidencia, estado, fecha ni número de transporte/aceptación externa.';

COMMIT;

NOTIFY pgrst, 'reload schema';
