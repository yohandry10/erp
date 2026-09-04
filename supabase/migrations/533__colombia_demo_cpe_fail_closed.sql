-- Los comprobantes de una demo Colombia son representaciones internas: nunca
-- UBL DIAN, nunca firmados y nunca elegibles para transporte o aceptación.
-- La clasificación se hace en la misma sentencia INSERT para cerrar la carrera
-- entre leer is_demo en el API y convertir el tenant a real antes de persistir.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

-- Ambos locks preceden al preflight. Ningún writer puede crear una operación o
-- cambiar un CPE entre la inspección y la instalación de las barreras.
LOCK TABLE public.cpe, public.cpe_operaciones IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_invalid_cpe bigint;
  v_invalid_artifact bigint;
  v_unsafe_operations bigint;
BEGIN
  IF to_regprocedure('app.cpe_provenance_guard_525()') IS NULL
     OR to_regprocedure('app.cpe_dian_acceptance_guard_528()') IS NULL
     OR to_regclass('public.cpe_operaciones') IS NULL THEN
    RAISE EXCEPTION 'CPE_DEMO_533_BASELINE_REQUIRED'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_invalid_cpe
  FROM public.cpe c
  WHERE c.simulated_origin IS NOT FALSE
    AND upper(coalesce(c.issuer_snapshot->>'country_code', '')) = 'CO'
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
    );
  IF v_invalid_cpe <> 0 THEN
    RAISE EXCEPTION 'CPE_DEMO_533_EXISTING_EXTERNAL_STATE:%', v_invalid_cpe
      USING ERRCODE = '23514',
        DETAIL = 'Remedie explícitamente la evidencia antes de promover; 533 no reescribe historia fiscal.';
  END IF;

  SELECT count(*) INTO v_invalid_artifact
  FROM public.cpe c
  WHERE (
      coalesce(c.metadata, '{}'::jsonb) @> '{"dian_is_demo":true}'::jsonb
      OR coalesce(c.metadata, '{}'::jsonb) @> '{"dian_simulado":true}'::jsonb
      OR coalesce(c.metadata, '{}'::jsonb) ? 'demo_artifact_format'
      OR coalesce(c.metadata, '{}'::jsonb) ? 'demo_artifact_signed'
      OR coalesce(c.xml_firmado, '') ~ '<DemoCpe[[:space:]>]'
    )
    AND NOT (
      upper(coalesce(c.issuer_snapshot->>'country_code', '')) = 'CO'
      AND c.simulated_origin IS TRUE
      AND upper(coalesce(c.fiscal_authority_evidence->>'status', '')) = 'SIMULATED'
      AND coalesce(c.metadata, '{}'::jsonb) @> jsonb_build_object(
        'dian_is_demo', true,
        'dian_simulado', true,
        'dian_fixture_source', 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
        'demo_artifact_format', 'ERP_DEMO_CPE_V1',
        'demo_artifact_signed', false,
        'demo_artifact_integrity', 'SHA-256',
        'fiscal_delivery_eligible', false
      )
      AND coalesce(c.xml_firmado, '') LIKE
        '%<DemoCpe xmlns="urn:erp-suite:demo:cpe:1" country="CO" authority="DIAN" fiscalValidity="NONE">%'
      AND coalesce(c.xml_firmado, '') LIKE
        '%<Notice>MUESTRA DEMO SIN TRANSMISION NI VALIDEZ DIAN</Notice>%'
      AND coalesce(c.xml_firmado, '') !~* '<[^>]*(Signature|Invoice|CreditNote|DebitNote|ApplicationResponse|AttachedDocument)[[:space:]>]'
      AND lower(coalesce(c.hash, '')) = encode(
        extensions.digest(convert_to(coalesce(c.xml_firmado, ''), 'UTF8'), 'sha256'),
        'hex'
      )
      AND lower(coalesce(c.hash_firma, '')) = encode(
        extensions.digest(convert_to(coalesce(c.xml_firmado, ''), 'UTF8'), 'sha256'),
        'hex'
      )
    );
  IF v_invalid_artifact <> 0 THEN
    RAISE EXCEPTION 'CPE_DEMO_533_EXISTING_ARTIFACT_INVALID:%', v_invalid_artifact
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_unsafe_operations
  FROM public.cpe_operaciones o
  JOIN public.cpe c
    ON c.id = o.cpe_id AND c.tenant_id = o.tenant_id
  WHERE o.action IN ('SEND', 'QUERY')
    AND (
      o.state = 'CLAIMED'
      OR upper(coalesce(o.result_kind, '')) IN ('ACCEPTED', 'PENDING', 'REJECTED')
    )
    AND c.simulated_origin IS NOT FALSE
    AND upper(coalesce(c.issuer_snapshot->>'country_code', '')) = 'CO';
  IF v_unsafe_operations <> 0 THEN
    RAISE EXCEPTION 'CPE_DEMO_533_EXISTING_EXTERNAL_OPERATION:%', v_unsafe_operations
      USING ERRCODE = '55000',
        DETAIL = 'Cancele claims activos y revise resultados externos antes de promover 533.';
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
    OR v_metadata ? 'demo_artifact_format'
    OR v_metadata ? 'demo_artifact_signed'
    OR v_xml_text ~ '<DemoCpe[[:space:]>]';

  IF TG_OP = 'UPDATE' THEN
    v_old_is_candidate :=
      coalesce(OLD.metadata, '{}'::jsonb) @> '{"dian_is_demo":true}'::jsonb
      OR coalesce(OLD.metadata, '{}'::jsonb) @> '{"dian_simulado":true}'::jsonb
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
      'dian_is_demo', true,
      'dian_simulado', true,
      'dian_fixture_source', 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
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
  v_country := coalesce((xpath('string(/*/@country)', v_xml))[1]::text, '');
  v_authority := coalesce((xpath('string(/*/@authority)', v_xml))[1]::text, '');
  v_fiscal_validity := coalesce((xpath('string(/*/@fiscalValidity)', v_xml))[1]::text, '');
  v_notice := btrim(coalesce((xpath(
    'string(/*/*[local-name()="Notice" and namespace-uri()="urn:erp-suite:demo:cpe:1"][1])',
    v_xml
  ))[1]::text, ''));
  v_payload := coalesce((xpath(
    'string(/*/*[local-name()="CanonicalPayload" and namespace-uri()="urn:erp-suite:demo:cpe:1" and @encoding="base64-json"][1])',
    v_xml
  ))[1]::text, '');
  v_element_count := coalesce(
    (xpath('count(//*)', v_xml))[1]::text::numeric::integer,
    0
  );
  v_signature_count := coalesce(
    (xpath('count(//*[local-name()="Signature"])', v_xml))[1]::text::numeric::integer,
    0
  );
  v_ubl_count := coalesce(
    (xpath(
      'count(//*[starts-with(namespace-uri(), "urn:oasis:names:specification:ubl")])',
      v_xml
    ))[1]::text::numeric::integer,
    0
  );

  IF v_root_name <> 'DemoCpe'
     OR v_root_namespace <> 'urn:erp-suite:demo:cpe:1'
     OR v_country <> 'CO'
     OR v_authority <> 'DIAN'
     OR v_fiscal_validity <> 'NONE'
     OR v_notice <> 'MUESTRA DEMO SIN TRANSMISION NI VALIDEZ DIAN'
     OR v_element_count <> 3
     OR v_signature_count <> 0
     OR v_ubl_count <> 0
     OR length(v_payload) NOT BETWEEN 4 AND 1572864
     OR length(v_payload) % 4 <> 0
     OR v_payload !~ '^[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_CONTRACT_INVALID'
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
     OR v_payload_json->>'country' IS DISTINCT FROM 'CO'
     OR v_payload_json->>'authority' IS DISTINCT FROM 'DIAN'
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
     OR coalesce(v_payload_json->>'issuerTaxId', '') <>
          coalesce(NEW.ruc_emisor, '')
     OR coalesce(v_payload_json->>'receiverDocument', '') <>
          coalesce(NEW.documento_receptor, '')
     OR jsonb_typeof(v_payload_json->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_PAYLOAD_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  v_hash := encode(
    extensions.digest(convert_to(v_xml_text, 'UTF8'), 'sha256'),
    'hex'
  );
  IF lower(coalesce(NEW.hash, '')) <> v_hash
     OR lower(coalesce(NEW.hash_firma, '')) <> v_hash THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_HASH_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 525 pudo observar is_demo=false si la conversión ocurrió después de que
    -- el API generó el artefacto. El contrato autocontenido prevalece sólo para
    -- degradarlo a simulado; jamás puede promover algo a fiscal real.
    NEW.simulated_origin := true;
    NEW.fiscal_authority_evidence := jsonb_build_object(
      'contract_version', 525,
      'authority', 'DIAN',
      'country_code', 'CO',
      'status', 'SIMULATED',
      'source', 'CPE_DEMO_ARTIFACT_533'
    );
  ELSIF NEW.simulated_origin IS NOT TRUE
        OR upper(coalesce(NEW.issuer_snapshot->>'country_code', '')) <> 'CO'
        OR upper(coalesce(NEW.fiscal_authority_evidence->>'status', '')) <> 'SIMULATED' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_PROVENANCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF upper(coalesce(NEW.issuer_snapshot->>'country_code', '')) <> 'CO' THEN
    RAISE EXCEPTION 'CPE_DEMO_ARTIFACT_COUNTRY_INVALID'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_demo_artifact_guard_533()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_d_cpe_demo_artifact_guard_533 ON public.cpe;
-- Orden léxico PostgreSQL: `trg_cpe...525` clasifica desde empresa_config;
-- luego `trg_d...533` cierra la carrera y antes de `trg_snapshot...526`
-- permite que el perfil receptor reconozca correctamente la procedencia demo.
CREATE TRIGGER trg_d_cpe_demo_artifact_guard_533
BEFORE INSERT OR UPDATE ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.cpe_demo_artifact_guard_533();

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
  IF v_country = 'CO' AND v_simulated IS NOT FALSE THEN
    RAISE EXCEPTION 'CPE_DEMO_EXTERNAL_TRANSPORT_BLOCKED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_demo_transport_guard_533()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zz_cpe_demo_transport_guard_533
ON public.cpe_operaciones;
-- Corre después del guard de país 525 y cubre INSERT y reclaims por UPDATE.
CREATE TRIGGER trg_zz_cpe_demo_transport_guard_533
BEFORE INSERT OR UPDATE ON public.cpe_operaciones
FOR EACH ROW EXECUTE FUNCTION app.cpe_demo_transport_guard_533();

ALTER TABLE public.cpe
  DROP CONSTRAINT IF EXISTS ck_cpe_co_simulated_no_external_state_533;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_co_simulated_no_external_state_533 CHECK (
    NOT (
      simulated_origin IS NOT FALSE
      AND upper(coalesce(issuer_snapshot->>'country_code', '')) = 'CO'
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
      AND lower(coalesce(metadata->>'fiscal_delivery_eligible', 'false')) <> 'true'
    )
  ) NOT VALID;

ALTER TABLE public.cpe
  VALIDATE CONSTRAINT ck_cpe_co_simulated_no_external_state_533;

COMMENT ON FUNCTION app.cpe_demo_artifact_guard_533() IS
  'Reconoce sólo el artefacto interno ERP_DEMO_CPE_V1, valida forma/hash/etiquetas y lo fija como simulado aun si el tenant cambió a real antes del INSERT.';
COMMENT ON FUNCTION app.cpe_demo_transport_guard_533() IS
  'Bloquea toda reserva, consulta o reclaim SEND/QUERY de CPE Colombia nacidos como simulados.';
COMMENT ON CONSTRAINT ck_cpe_co_simulated_no_external_state_533 ON public.cpe IS
  'Un CPE Colombia simulado nunca puede contener evidencia, estado, fecha ni número de transporte/aceptación externa.';

COMMIT;

NOTIFY pgrst, 'reload schema';
