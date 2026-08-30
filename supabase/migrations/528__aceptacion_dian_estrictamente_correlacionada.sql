BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Un HTTP 200 o IsValid aislado no constituye aceptación fiscal. El cambio a
-- ACEPTADO debe estar respaldado por el ApplicationResponse exacto, firmado y
-- validado contra el trust store operativo, con código 00 y la misma clave
-- CUFE/CUDE que quedó sellada antes del I/O externo.
CREATE OR REPLACE FUNCTION app.cpe_dian_acceptance_contract_valid_528(
  p_cpe_id uuid,
  p_tenant_id uuid,
  p_metadata jsonb,
  p_cdr text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation public.cpe_operaciones;
  v_operation_id uuid;
  v_expected_code text;
  v_response_code text;
  v_response_xml text;
  v_response_hash text;
  v_cdr_hash text;
  v_response_doc xml;
  v_root_name text;
  v_root_namespace text;
  v_signature_count integer;
  v_document_response_count integer;
  v_response_count integer;
  v_response_code_count integer;
  v_application_response_code text;
  v_document_reference_count integer;
  v_reference_uuid_count integer;
  v_reference_code text;
  v_existing_evidence jsonb;
BEGIN
  IF coalesce(p_metadata->>'last_delivery_operation_id', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_operation_id := (p_metadata->>'last_delivery_operation_id')::uuid;

  SELECT * INTO v_operation
  FROM public.cpe_operaciones o
  WHERE o.id = v_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.cpe_id = p_cpe_id
    AND o.action IN ('SEND', 'QUERY');

  IF NOT FOUND
     OR v_operation.state <> 'COMPLETED'
     OR v_operation.result_kind <> 'ACCEPTED'
     OR btrim(coalesce(v_operation.response_code, '')) <> '00' THEN
    RETURN false;
  END IF;

  v_expected_code := upper(btrim(coalesce(
    v_operation.request_summary->>'dian_unique_code', ''
  )));
  v_response_code := upper(btrim(coalesce(
    v_operation.response_summary->>'authorityDocumentKey', ''
  )));
  v_response_xml := coalesce(v_operation.response_summary->>'authorityResponse', '');
  v_response_hash := lower(btrim(coalesce(
    v_operation.response_summary->>'authorityResponseSha256', ''
  )));
  v_cdr_hash := lower(btrim(coalesce(
    v_operation.response_summary->>'cdrSha256', ''
  )));
  SELECT c.fiscal_authority_evidence INTO v_existing_evidence
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF nullif(btrim(v_response_xml), '') IS NULL
     OR octet_length(v_response_xml) > 8388608
     OR v_response_xml ~* '<!(DOCTYPE|ENTITY)' THEN
    RETURN false;
  END IF;

  BEGIN
    v_response_doc := xmlparse(document v_response_xml);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  v_root_name := coalesce((xpath('local-name(/*)', v_response_doc))[1]::text, '');
  v_root_namespace := coalesce((xpath('namespace-uri(/*)', v_response_doc))[1]::text, '');
  v_signature_count := coalesce(
    (xpath(
      'count(/*//*[local-name()="Signature" and namespace-uri()="http://www.w3.org/2000/09/xmldsig#"])',
      v_response_doc
    ))[1]::text::numeric::integer,
    0
  );
  v_document_response_count := coalesce(
    (xpath(
      'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"])',
      v_response_doc
    ))[1]::text::numeric::integer,
    0
  );
  v_response_count := coalesce(
    (xpath(
      'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="Response" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"])',
      v_response_doc
    ))[1]::text::numeric::integer,
    0
  );
  v_response_code_count := coalesce(
    (xpath(
      'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="Response" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="ResponseCode" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"])',
      v_response_doc
    ))[1]::text::numeric::integer,
    0
  );
  v_application_response_code := btrim(coalesce(
    (xpath(
      'string(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="Response" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="ResponseCode" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"][1])',
      v_response_doc
    ))[1]::text,
    ''
  ));
  v_document_reference_count := coalesce(
    (xpath(
      'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="DocumentReference" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"])',
      v_response_doc
    ))[1]::text::numeric::integer,
    0
  );
  v_reference_uuid_count := coalesce(
    (xpath(
      'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="DocumentReference" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="UUID" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"])',
      v_response_doc
    ))[1]::text::numeric::integer,
    0
  );
  v_reference_code := upper(btrim(coalesce(
    (xpath(
      'string(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="DocumentReference" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="UUID" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"][1])',
      v_response_doc
    ))[1]::text,
    ''
  )));

  RETURN NOT (
    upper(coalesce(v_operation.request_summary->>'country_code', '')) <> 'CO'
    OR upper(coalesce(v_operation.request_summary->>'dian_evidence_kind', ''))
         NOT IN ('CUFE', 'CUDE')
    OR jsonb_typeof(v_operation.request_summary->'authorization') <> 'object'
    OR nullif(btrim(v_operation.request_summary#>>'{authorization,software_id}'), '') IS NULL
    OR nullif(btrim(v_operation.request_summary#>>'{authorization,environment_id}'), '') IS NULL
    OR (
      upper(v_operation.request_summary->>'dian_evidence_kind') = 'CUFE'
      AND (
        v_operation.request_summary#>>'{authorization,source}' <> 'DIAN_GET_NUMBERING_RANGE'
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,number}'), '') IS NULL
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,prefix}'), '') IS NULL
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,range_from}'), '') IS NULL
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,range_to}'), '') IS NULL
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,valid_from}'), '') IS NULL
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,valid_to}'), '') IS NULL
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,technical_key_sha256}'), '') IS NULL
      )
    )
    OR (
      upper(v_operation.request_summary->>'dian_evidence_kind') = 'CUDE'
      AND (
        v_operation.request_summary#>>'{authorization,source}' <> 'DIAN_SOFTWARE_CATALOG'
        OR nullif(btrim(v_operation.request_summary#>>'{authorization,document_series}'), '') IS NULL
      )
    )
    OR v_expected_code !~ '^[0-9A-F]{96}$'
    OR upper(coalesce(v_operation.response_summary->>'countryCode', '')) <> 'CO'
    OR upper(coalesce(v_operation.response_summary->>'authority', '')) <> 'DIAN'
    OR coalesce(v_operation.response_summary->>'dianAcceptanceContractVersion', '') <> '528'
    OR lower(coalesce(v_operation.response_summary->>'success', '')) <> 'true'
    OR upper(coalesce(v_operation.response_summary->>'resultKind', '')) <> 'ACCEPTED'
    OR coalesce(v_operation.response_summary->>'authorityStatusCode', '') <> '00'
    OR lower(coalesce(v_operation.response_summary->>'authoritySignatureTrusted', '')) <> 'true'
    OR lower(coalesce(v_operation.response_summary->>'hasCdr', '')) <> 'true'
    OR coalesce(v_operation.response_summary->>'authorityResponseCount', '') <> '1'
    OR upper(coalesce(v_operation.response_summary->>'authorityResponseRoot', ''))
         <> 'APPLICATIONRESPONSE'
    OR coalesce(v_operation.response_summary->>'authorityResponseRootNamespace', '')
         <> 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2'
    OR coalesce(v_operation.response_summary->>'authorityResponseSignatureCount', '') <> '1'
    OR upper(coalesce(v_operation.response_summary->>'authorityResponseDocumentKey', ''))
         IS DISTINCT FROM v_expected_code
    OR coalesce(v_operation.response_summary->>'authorityApplicationResponseCode', '') <> '02'
    OR upper(coalesce(v_operation.response_summary->>'expectedDianUniqueCode', ''))
         IS DISTINCT FROM v_expected_code
    OR upper(coalesce(v_operation.response_summary->>'dianUniqueCode', ''))
         IS DISTINCT FROM v_expected_code
    OR v_response_code IS DISTINCT FROM v_expected_code
    OR upper(coalesce(v_operation.response_summary->>'dianEvidenceKind', ''))
         IS DISTINCT FROM upper(v_operation.request_summary->>'dian_evidence_kind')
    OR v_root_name <> 'ApplicationResponse'
    OR v_root_namespace <> 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2'
    OR v_signature_count <> 1
    OR v_document_response_count <> 1
    OR v_response_count <> 1
    OR v_response_code_count <> 1
    OR v_application_response_code <> '02'
    OR v_document_reference_count <> 1
    OR v_reference_uuid_count <> 1
    OR v_reference_code IS DISTINCT FROM v_expected_code
    OR v_response_hash !~ '^[0-9a-f]{64}$'
    OR encode(extensions.digest(convert_to(v_response_xml, 'UTF8'), 'sha256'), 'hex')
         IS DISTINCT FROM v_response_hash
    OR nullif(btrim(coalesce(p_cdr, '')), '') IS NULL
    OR v_cdr_hash !~ '^[0-9a-f]{64}$'
    OR encode(extensions.digest(convert_to(p_cdr, 'UTF8'), 'sha256'), 'hex')
         IS DISTINCT FROM v_cdr_hash
    OR (
      upper(coalesce(v_existing_evidence->>'status', '')) = 'ACCEPTED'
      AND (
        lower(coalesce(v_existing_evidence->>'cdr_sha256', '')) !~ '^[0-9a-f]{64}$'
        OR lower(v_existing_evidence->>'cdr_sha256') IS DISTINCT FROM v_cdr_hash
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_dian_acceptance_contract_valid_528(
  uuid, uuid, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app.cpe_dian_acceptance_guard_528()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation_id uuid;
  v_operation public.cpe_operaciones;
  v_kind text;
  v_unique_code text;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD.simulated_origin IS NOT FALSE
     OR upper(coalesce(OLD.issuer_snapshot->>'country_code', '')) <> 'CO'
     OR NOT (
       upper(coalesce(OLD.fiscal_authority_evidence->>'status', '')) = 'ACCEPTED'
       OR
       upper(btrim(coalesce(NEW.estado::text, ''))) = 'ACEPTADO'
       OR upper(btrim(coalesce(NEW.estado_sunat::text, ''))) = 'ACEPTADO'
       OR upper(btrim(coalesce(NEW.sunat_status::text, ''))) = 'ACCEPTED'
     ) THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.metadata->>'last_delivery_operation_id', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'DIAN_ACCEPTANCE_EVIDENCE_OPERATION_MISSING'
      USING ERRCODE = '23514';
  END IF;
  v_operation_id := (NEW.metadata->>'last_delivery_operation_id')::uuid;

  IF upper(coalesce(OLD.fiscal_authority_evidence->>'status', '')) = 'ACCEPTED'
     AND NOT (
       upper(btrim(coalesce(NEW.estado::text, ''))) = 'ACEPTADO'
       OR upper(btrim(coalesce(NEW.estado_sunat::text, ''))) = 'ACEPTADO'
       OR upper(btrim(coalesce(NEW.sunat_status::text, ''))) = 'ACCEPTED'
     ) THEN
    RAISE EXCEPTION 'DIAN_ACCEPTANCE_STATE_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF NOT app.cpe_dian_acceptance_contract_valid_528(
    NEW.id, NEW.tenant_id, NEW.metadata, NEW.cdr_sunat
  ) THEN
    RAISE EXCEPTION 'DIAN_ACCEPTANCE_AUTHORITY_EVIDENCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  -- El normalizador 218 puede consumir un alias legado antes del guard 525.
  -- 528 corre al final y, sólo después de validar toda la evidencia estricta,
  -- materializa de forma atómica el estado y la procedencia fiscal canónicos.
  IF upper(coalesce(OLD.fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED' THEN
    SELECT * INTO STRICT v_operation
    FROM public.cpe_operaciones o
    WHERE o.id = v_operation_id
      AND o.tenant_id = NEW.tenant_id
      AND o.cpe_id = NEW.id;
    v_kind := upper(v_operation.request_summary->>'dian_evidence_kind');
    v_unique_code := upper(v_operation.request_summary->>'dian_unique_code');
    NEW.fiscal_authority_evidence := jsonb_build_object(
      'contract_version', 525,
      'authority', 'DIAN',
      'country_code', 'CO',
      'status', 'ACCEPTED',
      'code_kind', v_kind,
      'unique_code', v_unique_code,
      'operation_id', v_operation.id,
      'accepted_at', coalesce(v_operation.completed_at, now()),
      'authorization', v_operation.request_summary->'authorization',
      'issuer_tax_profile', coalesce(
        v_operation.request_summary->'issuer_tax_profile', '{}'::jsonb
      ),
      'cdr_sha256', lower(v_operation.response_summary->>'cdrSha256'),
      'source', 'DIAN_ACCEPTED_OPERATION_528'
    );
  END IF;
  NEW.estado := 'ACEPTADO';
  NEW.estado_sunat := 'ACEPTADO';
  NEW.sunat_status := 'ACCEPTED';

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_dian_acceptance_guard_528()
FROM PUBLIC, anon, authenticated, service_role;

-- Una promoción 525 -> 528 no puede grandfatherizar aceptaciones débiles.
-- Si existe una fila real CO ya aceptada sin el contrato estricto completo,
-- se aborta la migración para investigarla/remediarla antes del despliegue.
-- El lock cierra la ventana TOCTOU: ningún writer puede confirmar una
-- aceptación bajo 525 entre el preflight y la instalación del trigger 528.
LOCK TABLE public.cpe IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_invalid_cpe uuid;
BEGIN
  SELECT c.id INTO v_invalid_cpe
  FROM public.cpe c
  WHERE c.simulated_origin IS FALSE
    AND upper(coalesce(c.issuer_snapshot->>'country_code', '')) = 'CO'
    AND (
      upper(btrim(coalesce(c.estado::text, ''))) = 'ACEPTADO'
      OR upper(btrim(coalesce(c.estado_sunat::text, ''))) = 'ACEPTADO'
      OR upper(btrim(coalesce(c.sunat_status::text, ''))) = 'ACCEPTED'
      OR upper(coalesce(c.fiscal_authority_evidence->>'status', '')) = 'ACCEPTED'
    )
    AND NOT app.cpe_dian_acceptance_contract_valid_528(
      c.id, c.tenant_id, c.metadata, c.cdr_sunat
    )
  LIMIT 1;

  IF v_invalid_cpe IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_528_EXISTING_DIAN_ACCEPTANCE_UNVERIFIED:%',
      v_invalid_cpe USING ERRCODE = '23514';
  END IF;
END;
$preflight$;

DROP TRIGGER IF EXISTS trg_cpe_dian_acceptance_guard_528 ON public.cpe;
DROP TRIGGER IF EXISTS trg_zz_cpe_dian_acceptance_guard_528 ON public.cpe;
-- El prefijo `zz` es deliberado: PostgreSQL ejecuta triggers del mismo tipo
-- por nombre. Debe correr después del normalizador 218 y del guard 525 para
-- validar el estado canónico/materializado y aun así abortar toda la fila si
-- falta la evidencia DIAN estricta.
CREATE TRIGGER trg_zz_cpe_dian_acceptance_guard_528
BEFORE UPDATE OF estado, estado_sunat, sunat_status, metadata, cdr_sunat
ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.cpe_dian_acceptance_guard_528();

COMMENT ON FUNCTION app.cpe_dian_acceptance_guard_528() IS
  'Impide aceptar o degradar evidencia de CPE CO reales sin código DIAN 00, ApplicationResponse único, firma de autoridad confiable y CUFE/CUDE exactamente correlacionado con el XML sellado.';

-- El progreso del wizard es estado visual, no una bóveda. La API aplica la
-- misma allowlist, pero la frontera SQL también debe sanear tanto entradas
-- nuevas como JSON histórico antes de mezclarlo, devolverlo o auditarlo.
CREATE OR REPLACE FUNCTION app.wizard_scalar_value_valid_528(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT CASE jsonb_typeof(p_value)
    WHEN 'null' THEN true
    WHEN 'string' THEN true
    WHEN 'number' THEN true
    WHEN 'boolean' THEN true
    WHEN 'array' THEN NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_value) AS item(value)
      WHERE jsonb_typeof(item.value) NOT IN ('null', 'string', 'number', 'boolean')
    )
    ELSE false
  END
$function$;

CREATE OR REPLACE FUNCTION app.wizard_certificate_metadata_sanitize_528(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, app, pg_temp
AS $function$
  WITH allowed(normalized_key, canonical_key) AS (
    VALUES
      ('isvalid', 'isValid'),
      ('isconfigured', 'isConfigured'),
      ('subject', 'subject'),
      ('issuer', 'issuer'),
      ('serialnumber', 'serialNumber'),
      ('validfrom', 'validFrom'),
      ('validto', 'validTo'),
      ('expiresat', 'expiresAt'),
      ('daysuntilexpiration', 'daysUntilExpiration'),
      ('rucemisor', 'rucEmisor'),
      ('rucsencertificado', 'rucsEnCertificado'),
      ('pertenecealemisor', 'perteneceAlEmisor'),
      ('motivotitularidad', 'motivoTitularidad'),
      ('errors', 'errors'),
      ('warnings', 'warnings')
  ), entries AS (
    SELECT a.canonical_key, e.value
    FROM jsonb_each(
      CASE WHEN jsonb_typeof(p_value) = 'object' THEN p_value ELSE '{}'::jsonb END
    ) AS e(key, value)
    JOIN allowed a
      ON regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') = a.normalized_key
    WHERE app.wizard_scalar_value_valid_528(e.value)
  )
  SELECT coalesce(jsonb_object_agg(canonical_key, value), '{}'::jsonb)
  FROM entries
$function$;

CREATE OR REPLACE FUNCTION app.wizard_temporary_config_sanitize_528(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, app, pg_temp
AS $function$
  WITH allowed(normalized_key, canonical_key, metadata_object) AS (
    VALUES
      ('stepid', 'stepId', false),
      ('pais', 'pais', false),
      ('paisid', 'pais_id', false),
      ('ruc', 'ruc', false),
      ('razonsocial', 'razonSocial', false),
      ('direccion', 'direccion', false),
      ('ubigeo', 'ubigeo', false),
      ('departamento', 'departamento', false),
      ('provincia', 'provincia', false),
      ('distrito', 'distrito', false),
      ('tipoempresa', 'tipo_empresa', false),
      ('usarflujologistica', 'usar_flujo_logistica', false),
      ('greobligatorio', 'gre_obligatorio', false),
      ('greautomaticohabilitado', 'gre_automatico_habilitado', false),
      ('umbralgreautomatico', 'umbral_gre_automatico', false),
      ('regimentributario', 'regimen_tributario', false),
      ('igvporcentaje', 'igv_porcentaje', false),
      ('retencionrentaporcentaje', 'retencion_renta_porcentaje', false),
      ('seriefactura', 'serie_factura', false),
      ('serieboleta', 'serie_boleta', false),
      ('serienotacredito', 'serie_nota_credito', false),
      ('serieguiaremision', 'serie_guia_remision', false),
      ('emisioncpemodo', 'emision_cpe_modo', false),
      ('sunatenvironment', 'sunat_environment', false),
      ('sunatusername', 'sunat_username', false),
      ('sunatcpeurl', 'sunat_cpe_url', false),
      ('sunatsummaryurl', 'sunat_summary_url', false),
      ('sunatqueryurl', 'sunat_query_url', false),
      ('sunatgreurl', 'sunat_gre_url', false),
      ('sunatgretransport', 'sunat_gre_transport', false),
      ('sunatgrerestbaseurl', 'sunat_gre_rest_base_url', false),
      ('sunatgreauthurl', 'sunat_gre_auth_url', false),
      ('sunatgreclientid', 'sunat_gre_client_id', false),
      ('sireactivo', 'sire_activo', false),
      ('sunatcertexpectedruc', 'sunat_cert_expected_ruc', false),
      ('sunatcertrucmismatchconfirmed', 'sunat_cert_ruc_mismatch_confirmed', false),
      ('sunatcertrucmismatchreason', 'sunat_cert_ruc_mismatch_reason', false),
      ('oseurl', 'ose_url', false),
      ('osestatusurl', 'ose_status_url', false),
      ('oseusername', 'ose_username', false),
      ('oseauthtipo', 'ose_auth_tipo', false),
      ('oseapiheader', 'ose_api_header', false),
      ('oseactivo', 'ose_activo', false),
      ('dianactivo', 'dian_activo', false),
      ('dianurl', 'dian_url', false),
      ('dianusuario', 'dian_usuario', false),
      ('diansoftwareid', 'dian_software_id', false),
      ('diantestsetid', 'dian_test_set_id', false),
      ('dianenvironment', 'dian_environment', false),
      ('dianregimenfiscal', 'dian_regimen_fiscal', false),
      ('diantipocontribuyente', 'dian_tipo_contribuyente', false),
      ('dianresolucionnumero', 'dian_resolucion_numero', false),
      ('dianresolucionprefijo', 'dian_resolucion_prefijo', false),
      ('dianresoluciondesde', 'dian_resolucion_desde', false),
      ('dianresolucionhasta', 'dian_resolucion_hasta', false),
      ('dianresolucionfechainicio', 'dian_resolucion_fecha_inicio', false),
      ('dianresolucionfechafin', 'dian_resolucion_fecha_fin', false),
      ('arcaactivo', 'arca_activo', false),
      ('arcaenvironment', 'arca_environment', false),
      ('arcawsaaurl', 'arca_wsaa_url', false),
      ('arcawsfeurl', 'arca_wsfe_url', false),
      ('arcacuitrepresentada', 'arca_cuit_representada', false),
      ('arcapuntoventa', 'arca_punto_venta', false),
      ('arcacondicioniva', 'arca_condicion_iva', false),
      ('ingresosbrutos', 'ingresos_brutos', false),
      ('fechainicioactividades', 'fecha_inicio_actividades', false),
      ('provinciafiscal', 'provincia_fiscal', false),
      ('certificatevalid', 'certificateValid', false),
      ('certificateconfigured', 'certificateConfigured', false),
      ('rucvalid', 'rucValid', false),
      ('validatedat', 'validatedAt', false),
      ('certificatemetadata', 'certificateMetadata', true)
  ), entries AS (
    SELECT a.canonical_key,
      CASE WHEN a.metadata_object
        THEN app.wizard_certificate_metadata_sanitize_528(e.value)
        ELSE e.value
      END AS value
    FROM jsonb_each(
      CASE WHEN jsonb_typeof(p_value) = 'object' THEN p_value ELSE '{}'::jsonb END
    ) AS e(key, value)
    JOIN allowed a
      ON regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') = a.normalized_key
    WHERE (a.metadata_object AND jsonb_typeof(e.value) = 'object')
       OR (NOT a.metadata_object AND app.wizard_scalar_value_valid_528(e.value))
  )
  SELECT coalesce(jsonb_object_agg(canonical_key, value), '{}'::jsonb)
  FROM entries
$function$;

-- La barrera permanente también cubre writers internos legacy que pudieran
-- haber cargado la versión 464 del RPC mientras esta migración esperaba el
-- lock de tabla. CREATE TRIGGER toma SHARE ROW EXCLUSIVE hasta COMMIT: los
-- writers anteriores terminan antes del backfill y los posteriores ya pasan
-- por este saneo, cerrando la ventana TOCTOU del despliegue.
CREATE OR REPLACE FUNCTION app.wizard_progress_sanitize_guard_528()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  NEW.configuracion_temporal := app.wizard_temporary_config_sanitize_528(
    NEW.configuracion_temporal
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_wizard_progress_sanitize_528
ON public.wizard_progress;
CREATE TRIGGER trg_wizard_progress_sanitize_528
BEFORE INSERT OR UPDATE OF configuracion_temporal
ON public.wizard_progress
FOR EACH ROW EXECUTE FUNCTION app.wizard_progress_sanitize_guard_528();

CREATE OR REPLACE FUNCTION app.sanitize_wizard_storage_528()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_progress integer := 0;
  v_audit integer := 0;
  v_intents integer := 0;
BEGIN
  UPDATE public.wizard_progress wp
  SET configuracion_temporal = app.wizard_temporary_config_sanitize_528(
        wp.configuracion_temporal
      ),
      updated_at = now()
  WHERE wp.configuracion_temporal IS DISTINCT FROM
        app.wizard_temporary_config_sanitize_528(wp.configuracion_temporal);
  GET DIAGNOSTICS v_progress = ROW_COUNT;

  UPDATE public.audit_log a
  SET old_values = CASE
        WHEN jsonb_typeof(a.old_values) = 'object'
         AND jsonb_typeof(a.old_values->'configuracion_temporal') = 'object'
        THEN jsonb_set(
          a.old_values, '{configuracion_temporal}',
          app.wizard_temporary_config_sanitize_528(
            a.old_values->'configuracion_temporal'
          ), false
        )
        ELSE a.old_values
      END,
      new_values = CASE
        WHEN jsonb_typeof(a.new_values) = 'object'
         AND jsonb_typeof(a.new_values->'configuracion_temporal') = 'object'
        THEN jsonb_set(
          a.new_values, '{configuracion_temporal}',
          app.wizard_temporary_config_sanitize_528(
            a.new_values->'configuracion_temporal'
          ), false
        )
        ELSE a.new_values
      END
  WHERE a.table_name = 'wizard_progress'
    AND (
      (jsonb_typeof(a.old_values->'configuracion_temporal') = 'object'
       AND a.old_values->'configuracion_temporal' IS DISTINCT FROM
         app.wizard_temporary_config_sanitize_528(
           a.old_values->'configuracion_temporal'
         ))
      OR
      (jsonb_typeof(a.new_values->'configuracion_temporal') = 'object'
       AND a.new_values->'configuracion_temporal' IS DISTINCT FROM
         app.wizard_temporary_config_sanitize_528(
           a.new_values->'configuracion_temporal'
         ))
    );
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  UPDATE public.configuration_operation_intents i
  SET result = jsonb_set(
        i.result, '{progress,configuracion_temporal}',
        app.wizard_temporary_config_sanitize_528(
          i.result#>'{progress,configuracion_temporal}'
        ), false
      ),
      updated_at = now()
  WHERE i.operation = 'WIZARD_STEP'
    AND jsonb_typeof(i.result#>'{progress,configuracion_temporal}') = 'object'
    AND i.result#>'{progress,configuracion_temporal}' IS DISTINCT FROM
      app.wizard_temporary_config_sanitize_528(
        i.result#>'{progress,configuracion_temporal}'
      );
  GET DIAGNOSTICS v_intents = ROW_COUNT;

  RETURN jsonb_build_object(
    'wizard_progress', v_progress,
    'audit_log', v_audit,
    'configuration_operation_intents', v_intents
  );
END;
$function$;

SELECT app.sanitize_wizard_storage_528();

CREATE OR REPLACE FUNCTION public.guardar_paso_wizard_config_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_paso_actual integer,
  p_configuracion_temporal jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_configuration jsonb;
  v_previous public.wizard_progress;
  v_row public.wizard_progress;
  v_result jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF p_paso_actual NOT BETWEEN 1 AND 7
     OR jsonb_typeof(coalesce(p_configuracion_temporal, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CONFIGURATION_WIZARD_STEP_INVALID' USING ERRCODE = '22023';
  END IF;
  v_configuration := app.wizard_temporary_config_sanitize_528(
    coalesce(p_configuracion_temporal, '{}'::jsonb)
  );
  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'step', p_paso_actual, 'configuration', v_configuration
  ));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'WIZARD_STEP', p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('configuration:wizard:' || p_tenant_id::text, 464)
  );
  SELECT * INTO v_previous
  FROM public.wizard_progress wp
  WHERE wp.tenant_id = p_tenant_id
  FOR UPDATE;
  IF FOUND THEN
    v_previous.configuracion_temporal := app.wizard_temporary_config_sanitize_528(
      v_previous.configuracion_temporal
    );
    v_old := to_jsonb(v_previous);
  END IF;

  INSERT INTO public.wizard_progress (
    tenant_id, paso_actual, pasos_completados, configuracion_temporal,
    completado, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_paso_actual, ARRAY[p_paso_actual],
    v_configuration, false, now(), now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET paso_actual = EXCLUDED.paso_actual,
      pasos_completados = ARRAY(
        SELECT DISTINCT x FROM unnest(
          coalesce(public.wizard_progress.pasos_completados, '{}'::integer[])
            || ARRAY[p_paso_actual]
        ) x ORDER BY x
      ),
      configuracion_temporal = app.wizard_temporary_config_sanitize_528(
          public.wizard_progress.configuracion_temporal
        ) || coalesce(EXCLUDED.configuracion_temporal, '{}'::jsonb),
      updated_at = now()
  RETURNING * INTO v_row;

  v_result := jsonb_build_object('progress', to_jsonb(v_row), 'idempotent', false);
  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'wizard_progress',
    CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_row.id::text, v_old, to_jsonb(v_row), 'GUARDAR_PASO_WIZARD',
    jsonb_build_object(
      'idempotency_key', lower(btrim(p_idempotency_key)),
      'fingerprint', v_fingerprint,
      'contract_version', 528
    )
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text, 'WIZARD_STEP',
    p_idempotency_key, v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION app.wizard_scalar_value_valid_528(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.wizard_certificate_metadata_sanitize_528(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.wizard_temporary_config_sanitize_528(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.wizard_progress_sanitize_guard_528()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.sanitize_wizard_storage_528()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guardar_paso_wizard_config_tx(
  uuid, uuid, text, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_paso_wizard_config_tx(
  uuid, uuid, text, integer, jsonb
) TO service_role;

-- Registrar la primera constancia del portal no puede depender de una bandera
-- que sólo existe después de registrar esa misma constancia. La prueba previa
-- sí debe demostrar transporte, trust store y un rango oficial que coincida
-- exactamente con la configuración vigente.
CREATE OR REPLACE FUNCTION public.registrar_habilitacion_dian_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_reference text := btrim(coalesce(p_reference, ''));
  v_fingerprint text;
  v_replay jsonb;
  v_old jsonb;
  v_new jsonb;
  v_row public.empresa_config;
  v_evidence jsonb;
  v_result jsonb;
  v_expected_environment text;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF length(v_reference) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'DIAN_PORTAL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'actor_id', p_actor_id,
    'portal_status', 'HABILITADO',
    'reference', v_reference
  ));
  v_replay := app.configuration_intent_replay_464(
    'TENANT', p_tenant_id::text, 'REGISTRAR_HABILITACION_DIAN',
    p_idempotency_key, v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('configuration:dian-habilitacion:' || p_tenant_id::text, 525)
  );
  SELECT * INTO v_row
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIGURATION_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.is_demo
     OR upper(coalesce(v_row.pais, '')) <> 'CO'
     OR v_row.dian_activo IS NOT TRUE
     OR nullif(btrim(coalesce(v_row.ruc, '')), '') IS NULL
     OR v_row.certificado_pfx IS NULL
     OR octet_length(v_row.certificado_pfx) = 0
     OR nullif(btrim(coalesce(v_row.certificado_password, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_software_id, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_software_pin, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_test_set_id, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_resolucion_numero, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_resolucion_prefijo, '')), '') IS NULL
     OR v_row.dian_resolucion_desde IS NULL
     OR v_row.dian_resolucion_hasta IS NULL
     OR v_row.dian_resolucion_desde > v_row.dian_resolucion_hasta
     OR v_row.dian_resolucion_fecha_inicio IS NULL
     OR v_row.dian_resolucion_fecha_fin IS NULL
     OR v_row.dian_resolucion_fecha_inicio > v_row.dian_resolucion_fecha_fin THEN
    RAISE EXCEPTION 'DIAN_HABILITACION_TENANT_CONFIGURATION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  v_expected_environment := CASE
    WHEN upper(coalesce(v_row.dian_environment, '')) = 'PRODUCCION'
      THEN 'PRODUCCION'
    ELSE 'HABILITACION'
  END;
  IF v_row.dian_ultima_prueba_at IS NULL
     OR v_row.dian_ultima_prueba_at < now() - interval '24 hours'
     OR coalesce((v_row.dian_ultima_prueba_detalle->>'reachable')::boolean, false) IS NOT TRUE
     OR coalesce((v_row.dian_ultima_prueba_detalle->>'numberingValidated')::boolean, false) IS NOT TRUE
     OR coalesce((v_row.dian_ultima_prueba_detalle#>>'{authorityTrust,ready}')::boolean, false) IS NOT TRUE
     OR upper(coalesce(v_row.dian_ultima_prueba_detalle->>'environment', ''))
          IS DISTINCT FROM v_expected_environment
     OR jsonb_typeof(v_row.dian_ultima_prueba_detalle->'authorizedRanges') <> 'array'
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(
         v_row.dian_ultima_prueba_detalle->'authorizedRanges'
       ) AS ranges(item)
       WHERE btrim(ranges.item->>'resolution') = btrim(v_row.dian_resolucion_numero)
         AND upper(btrim(ranges.item->>'prefix')) = upper(btrim(v_row.dian_resolucion_prefijo))
         AND (ranges.item->>'from')::numeric = v_row.dian_resolucion_desde
         AND (ranges.item->>'to')::numeric = v_row.dian_resolucion_hasta
         AND (ranges.item->>'validFrom')::date = v_row.dian_resolucion_fecha_inicio
         AND (ranges.item->>'validTo')::date = v_row.dian_resolucion_fecha_fin
         AND current_date BETWEEN (ranges.item->>'validFrom')::date
                              AND (ranges.item->>'validTo')::date
     ) THEN
    RAISE EXCEPTION 'DIAN_TECHNICAL_VALIDATION_REQUIRED_BEFORE_PORTAL_ATTESTATION'
      USING ERRCODE = '23514';
  END IF;

  v_old := app.safe_empresa_config_464(to_jsonb(v_row));
  v_evidence := jsonb_build_object(
    'contract_version', 525,
    'source', 'DIAN_PORTAL_HABILITACION',
    'portal_status', 'HABILITADO',
    'nit', btrim(v_row.ruc),
    'software_id', btrim(v_row.dian_software_id),
    'test_set_id_sha256', encode(
      extensions.digest(convert_to(btrim(v_row.dian_test_set_id), 'UTF8'), 'sha256'),
      'hex'
    ),
    'reference', v_reference,
    'confirmed_by', p_actor_id,
    'confirmed_at', now()
  );
  UPDATE public.empresa_config
  SET dian_habilitacion_estado = 'HABILITADO',
      dian_habilitacion_at = now(),
      dian_habilitacion_evidencia = v_evidence,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
  RETURNING * INTO v_row;
  v_new := app.safe_empresa_config_464(to_jsonb(v_row));

  PERFORM app.audit_configuration_464(
    p_tenant_id, p_actor_id, 'empresa_config', 'UPDATE', p_tenant_id::text,
    v_old, v_new, 'REGISTRAR_HABILITACION_DIAN',
    jsonb_build_object(
      'idempotency_key', lower(btrim(p_idempotency_key)),
      'fingerprint', v_fingerprint,
      'source', 'DIAN_PORTAL_HABILITACION',
      'contract_version', 528
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, idempotency_key
  ) VALUES (
    p_tenant_id, 'empresa_config', p_tenant_id::text,
    'configuracion.dian.habilitada',
    jsonb_build_object('tenant_id', p_tenant_id, 'actor_id', p_actor_id),
    'pending', 'dian-habilitacion-525:' || left(lower(btrim(p_idempotency_key)), 210)
  );
  v_result := jsonb_build_object(
    'estado', 'HABILITADO',
    'habilitado_at', v_row.dian_habilitacion_at,
    'reference', v_reference,
    'idempotent', false
  );
  PERFORM app.configuration_intent_finish_464(
    p_tenant_id, 'TENANT', p_tenant_id::text,
    'REGISTRAR_HABILITACION_DIAN', p_idempotency_key,
    v_fingerprint, v_result
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_habilitacion_dian_tx(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_habilitacion_dian_tx(
  uuid, uuid, text, text
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
