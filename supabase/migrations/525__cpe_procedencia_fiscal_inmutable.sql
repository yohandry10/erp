-- Procedencia fiscal inmutable por CPE y evidencia DIAN separada del hash XML.
-- Los CPE existentes se clasifican de forma conservadora como simulados: no
-- existe evidencia histórica suficiente para convertirlos retroactivamente en
-- representaciones oficiales.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

-- La prueba técnica distingue conectividad incompleta, credenciales válidas
-- para TestSet y configuración de producción validada. Una respuesta ACCEPTED
-- de un documento NO equivale al estado Habilitado del software en el portal
-- DIAN. Esa habilitación se registra separadamente y queda ligada a la
-- identidad exacta del emisor, Software ID y TestSet.
ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_config_dian_ultima_prueba_estado;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_dian_ultima_prueba_estado
  CHECK (dian_ultima_prueba_estado IS NULL OR dian_ultima_prueba_estado IN (
    'SIMULADA', 'TRANSPORTE_OK', 'INCOMPLETA', 'ERROR',
    'LISTA_PARA_TESTSET', 'VALIDADA'
  ));

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS dian_habilitacion_estado text,
  ADD COLUMN IF NOT EXISTS dian_habilitacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS dian_habilitacion_evidencia jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_config_dian_habilitacion_525;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_dian_habilitacion_525 CHECK (
    (
      dian_habilitacion_estado IS NULL
      AND dian_habilitacion_at IS NULL
      AND dian_habilitacion_evidencia = '{}'::jsonb
    )
    OR (
      dian_habilitacion_estado = 'HABILITADO'
      AND dian_habilitacion_at IS NOT NULL
      AND jsonb_typeof(dian_habilitacion_evidencia) = 'object'
      AND dian_habilitacion_evidencia->>'source' = 'DIAN_PORTAL_HABILITACION'
      AND dian_habilitacion_evidencia->>'portal_status' = 'HABILITADO'
      AND dian_habilitacion_evidencia->>'nit' = btrim(ruc)
      AND dian_habilitacion_evidencia->>'software_id' = btrim(dian_software_id)
      AND dian_habilitacion_evidencia->>'test_set_id_sha256' = encode(
        extensions.digest(convert_to(btrim(dian_test_set_id), 'UTF8'), 'sha256'),
        'hex'
      )
      AND coalesce(dian_habilitacion_evidencia->>'confirmed_by', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND length(btrim(coalesce(dian_habilitacion_evidencia->>'reference', ''))) BETWEEN 8 AND 500
    )
  );

CREATE OR REPLACE FUNCTION app.invalidate_dian_habilitacion_525()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF upper(coalesce(NEW.pais, '')) IS DISTINCT FROM upper(coalesce(OLD.pais, ''))
     OR btrim(coalesce(NEW.ruc, '')) IS DISTINCT FROM btrim(coalesce(OLD.ruc, ''))
     OR NEW.certificado_pfx IS DISTINCT FROM OLD.certificado_pfx
     OR NEW.certificado_password IS DISTINCT FROM OLD.certificado_password
     OR btrim(coalesce(NEW.dian_url, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_url, ''))
     OR btrim(coalesce(NEW.dian_software_id, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_software_id, ''))
     OR NEW.dian_software_pin IS DISTINCT FROM OLD.dian_software_pin
     OR btrim(coalesce(NEW.dian_test_set_id, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_test_set_id, ''))
     OR upper(coalesce(NEW.dian_environment, '')) IS DISTINCT FROM upper(coalesce(OLD.dian_environment, ''))
     OR btrim(coalesce(NEW.dian_resolucion_numero, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_resolucion_numero, ''))
     OR btrim(coalesce(NEW.dian_resolucion_prefijo, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_resolucion_prefijo, ''))
     OR NEW.dian_resolucion_desde IS DISTINCT FROM OLD.dian_resolucion_desde
     OR NEW.dian_resolucion_hasta IS DISTINCT FROM OLD.dian_resolucion_hasta
     OR NEW.dian_resolucion_fecha_inicio IS DISTINCT FROM OLD.dian_resolucion_fecha_inicio
     OR NEW.dian_resolucion_fecha_fin IS DISTINCT FROM OLD.dian_resolucion_fecha_fin
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    NEW.dian_ultima_prueba_at := NULL;
    NEW.dian_ultima_prueba_estado := 'INCOMPLETA';
    NEW.dian_ultima_prueba_detalle := jsonb_build_object(
      'invalidated', true,
      'reason', 'DIAN_CONFIGURATION_CHANGED',
      'contract_version', 525
    );
  END IF;

  IF upper(coalesce(NEW.pais, '')) IS DISTINCT FROM upper(coalesce(OLD.pais, ''))
     OR btrim(coalesce(NEW.ruc, '')) IS DISTINCT FROM btrim(coalesce(OLD.ruc, ''))
     OR btrim(coalesce(NEW.dian_software_id, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_software_id, ''))
     OR btrim(coalesce(NEW.dian_test_set_id, '')) IS DISTINCT FROM btrim(coalesce(OLD.dian_test_set_id, ''))
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    NEW.dian_habilitacion_estado := NULL;
    NEW.dian_habilitacion_at := NULL;
    NEW.dian_habilitacion_evidencia := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.invalidate_dian_habilitacion_525()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_invalidate_dian_habilitacion_525 ON public.empresa_config;
CREATE TRIGGER trg_invalidate_dian_habilitacion_525
BEFORE UPDATE OF pais, ruc, certificado_pfx, certificado_password,
  dian_url, dian_software_id, dian_software_pin, dian_test_set_id,
  dian_environment, dian_resolucion_numero, dian_resolucion_prefijo,
  dian_resolucion_desde, dian_resolucion_hasta,
  dian_resolucion_fecha_inicio, dian_resolucion_fecha_fin, is_demo
ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.invalidate_dian_habilitacion_525();

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
     OR nullif(btrim(coalesce(v_row.ruc, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_software_id, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_row.dian_test_set_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'DIAN_HABILITACION_TENANT_CONFIGURATION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  IF v_row.dian_ultima_prueba_at IS NULL
     OR v_row.dian_ultima_prueba_at < now() - interval '24 hours'
     OR coalesce((v_row.dian_ultima_prueba_detalle->>'reachable')::boolean, false) IS NOT TRUE
     OR coalesce((v_row.dian_ultima_prueba_detalle->>'credentialsValidated')::boolean, false) IS NOT TRUE THEN
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
      'source', 'DIAN_PORTAL_HABILITACION'
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

REVOKE ALL ON FUNCTION public.registrar_habilitacion_dian_tx(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_habilitacion_dian_tx(uuid, uuid, text, text)
TO service_role;

ALTER TABLE public.cpe
  ADD COLUMN IF NOT EXISTS simulated_origin boolean,
  ADD COLUMN IF NOT EXISTS issuer_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS fiscal_authority_evidence jsonb;

UPDATE public.cpe c
SET simulated_origin = true,
    issuer_snapshot = jsonb_strip_nulls(jsonb_build_object(
      'contract_version', 525,
      'country_code', upper(coalesce(nullif(btrim(c.pais), ''), nullif(btrim(ec.pais), ''), 'PE')),
      'tax_id', coalesce(nullif(btrim(c.ruc_emisor), ''), nullif(btrim(ec.ruc), ''), 'NO_CONSIGNADO'),
      'legal_name', coalesce(nullif(btrim(c.razon_social_emisor), ''), nullif(btrim(ec.razon_social), ''), 'NO_CONSIGNADO'),
      'address', nullif(btrim(ec.direccion_fiscal), ''),
      'source', 'LEGACY_BACKFILL'
    )),
    fiscal_authority_evidence = jsonb_build_object(
      'contract_version', 525,
      'status', 'LEGACY_UNVERIFIED',
      'source', 'LEGACY_BACKFILL'
    )
FROM public.empresa_config ec
WHERE ec.tenant_id = c.tenant_id
  AND (c.simulated_origin IS NULL OR c.issuer_snapshot IS NULL OR c.fiscal_authority_evidence IS NULL);

UPDATE public.cpe c
SET simulated_origin = coalesce(c.simulated_origin, true),
    issuer_snapshot = coalesce(c.issuer_snapshot, jsonb_build_object(
      'contract_version', 525,
      'country_code', upper(coalesce(nullif(btrim(c.pais), ''), 'PE')),
      'tax_id', coalesce(nullif(btrim(c.ruc_emisor), ''), 'NO_CONSIGNADO'),
      'legal_name', coalesce(nullif(btrim(c.razon_social_emisor), ''), 'NO_CONSIGNADO'),
      'source', 'LEGACY_BACKFILL_NO_CONFIG'
    )),
    fiscal_authority_evidence = coalesce(c.fiscal_authority_evidence, jsonb_build_object(
      'contract_version', 525,
      'status', 'LEGACY_UNVERIFIED',
      'source', 'LEGACY_BACKFILL_NO_CONFIG'
    ))
WHERE c.simulated_origin IS NULL OR c.issuer_snapshot IS NULL OR c.fiscal_authority_evidence IS NULL;

ALTER TABLE public.cpe
  ALTER COLUMN simulated_origin SET DEFAULT true,
  ALTER COLUMN simulated_origin SET NOT NULL,
  ALTER COLUMN issuer_snapshot SET DEFAULT '{}'::jsonb,
  ALTER COLUMN issuer_snapshot SET NOT NULL,
  ALTER COLUMN fiscal_authority_evidence SET DEFAULT '{}'::jsonb,
  ALTER COLUMN fiscal_authority_evidence SET NOT NULL;

-- Una consulta DIAN puede confirmar expresamente que el CUFE/CUDE todavía no
-- existe. Es distinto de un fault SOAP o un timeout: sólo ese resultado permite
-- volver a intentar el mismo XML sin arriesgar una duplicidad.
ALTER TABLE public.cpe_operaciones
  DROP CONSTRAINT IF EXISTS ck_cpe_operaciones_result_476;
ALTER TABLE public.cpe_operaciones
  ADD CONSTRAINT ck_cpe_operaciones_result_476 CHECK (
    result_kind IS NULL OR result_kind IN (
      'ACCEPTED', 'PENDING', 'TECHNICAL_ERROR', 'REJECTED', 'NOT_FOUND'
    )
  );

-- DIAN exige que cada ZIP use una secuencia hexadecimal anual, monotónica y
-- única por emisor. La reserva queda ligada a la operación SEND: reintentar el
-- mismo XML reutiliza el número y nunca consume/genera otro nombre de paquete.
CREATE TABLE IF NOT EXISTS public.dian_package_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_year integer NOT NULL CHECK (package_year BETWEEN 2000 AND 9999),
  last_sequence bigint NOT NULL CHECK (last_sequence BETWEEN 1 AND 4294967295),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, package_year)
);

ALTER TABLE public.dian_package_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dian_package_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_only_no_direct_access_525
  ON public.dian_package_counters;
CREATE POLICY service_only_no_direct_access_525
  ON public.dian_package_counters
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON TABLE public.dian_package_counters FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_issuer_snapshot_525;
ALTER TABLE public.cpe ADD CONSTRAINT ck_cpe_issuer_snapshot_525 CHECK (
  jsonb_typeof(issuer_snapshot) = 'object'
  AND coalesce(issuer_snapshot->>'contract_version', '') = '525'
  AND nullif(btrim(issuer_snapshot->>'country_code'), '') IS NOT NULL
  AND nullif(btrim(issuer_snapshot->>'tax_id'), '') IS NOT NULL
  AND nullif(btrim(issuer_snapshot->>'legal_name'), '') IS NOT NULL
);

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_fiscal_authority_evidence_525;
ALTER TABLE public.cpe ADD CONSTRAINT ck_cpe_fiscal_authority_evidence_525 CHECK (
  jsonb_typeof(fiscal_authority_evidence) = 'object'
  AND coalesce(fiscal_authority_evidence->>'contract_version', '') = '525'
  AND upper(coalesce(fiscal_authority_evidence->>'status', '')) IN (
    'SIMULATED', 'LEGACY_UNVERIFIED', 'PENDING', 'ACCEPTED'
  )
  AND (
    simulated_origin
    OR upper(coalesce(fiscal_authority_evidence->>'status', '')) IN ('PENDING', 'ACCEPTED')
  )
  AND (
    upper(coalesce(fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED'
    OR (
      upper(coalesce(fiscal_authority_evidence->>'authority', '')) = 'DIAN'
      AND upper(coalesce(fiscal_authority_evidence->>'country_code', '')) = 'CO'
      AND upper(coalesce(fiscal_authority_evidence->>'code_kind', '')) IN ('CUFE', 'CUDE')
      AND upper(coalesce(fiscal_authority_evidence->>'unique_code', '')) ~ '^[0-9A-F]{96}$'
      AND jsonb_typeof(fiscal_authority_evidence->'authorization') = 'object'
    )
  )
);

CREATE OR REPLACE FUNCTION app.cpe_provenance_guard_525()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_config public.empresa_config;
  v_country text;
  v_authority text;
  v_operation public.cpe_operaciones;
  v_operation_id uuid;
  v_kind text;
  v_unique_code text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_config
    FROM public.empresa_config ec
    WHERE ec.tenant_id = NEW.tenant_id;

    v_country := upper(coalesce(
      nullif(btrim(v_config.pais), ''), nullif(btrim(NEW.pais), ''), 'PE'
    ));
    v_authority := CASE v_country WHEN 'CO' THEN 'DIAN' WHEN 'AR' THEN 'ARCA' ELSE 'SUNAT' END;
    NEW.simulated_origin := coalesce(v_config.is_demo, true);
    NEW.issuer_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'contract_version', 525,
      'country_code', v_country,
      'tax_id', coalesce(nullif(btrim(NEW.ruc_emisor), ''), nullif(btrim(v_config.ruc), ''), 'NO_CONSIGNADO'),
      'legal_name', coalesce(nullif(btrim(NEW.razon_social_emisor), ''), nullif(btrim(v_config.razon_social), ''), 'NO_CONSIGNADO'),
      'address', nullif(btrim(v_config.direccion_fiscal), ''),
      'source', 'CPE_CREATION'
    ));
    NEW.fiscal_authority_evidence := jsonb_build_object(
      'contract_version', 525,
      'authority', v_authority,
      'country_code', v_country,
      'status', CASE WHEN NEW.simulated_origin THEN 'SIMULATED' ELSE 'PENDING' END,
      'source', 'CPE_CREATION'
    );
    IF NOT NEW.simulated_origin AND v_country = 'CO'
       AND (upper(btrim(coalesce(NEW.estado::text, ''))) = 'ACEPTADO'
         OR upper(btrim(coalesce(NEW.estado_sunat::text, ''))) = 'ACEPTADO'
         OR upper(btrim(coalesce(NEW.sunat_status::text, ''))) = 'ACCEPTED') THEN
      RAISE EXCEPTION 'CPE_DIAN_ACCEPTANCE_REQUIRES_CANONICAL_FINALIZATION'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.simulated_origin IS DISTINCT FROM OLD.simulated_origin
     OR NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot
     OR NEW.fiscal_authority_evidence IS DISTINCT FROM OLD.fiscal_authority_evidence THEN
    RAISE EXCEPTION 'CPE_FISCAL_PROVENANCE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  NEW.simulated_origin := OLD.simulated_origin;
  NEW.issuer_snapshot := OLD.issuer_snapshot;
  NEW.fiscal_authority_evidence := OLD.fiscal_authority_evidence;
  v_country := upper(coalesce(OLD.issuer_snapshot->>'country_code', 'PE'));

  IF nullif(btrim(coalesce(NEW.metadata->>'fiscal_country', '')), '') IS NOT NULL
     AND upper(NEW.metadata->>'fiscal_country') IS DISTINCT FROM v_country THEN
    RAISE EXCEPTION 'CPE_FISCAL_COUNTRY_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF coalesce(NEW.metadata->>'last_delivery_operation_id', '')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_operation_id := (NEW.metadata->>'last_delivery_operation_id')::uuid;
    SELECT * INTO v_operation
    FROM public.cpe_operaciones o
    WHERE o.id = v_operation_id
      AND o.tenant_id = NEW.tenant_id
      AND o.cpe_id = NEW.id;
    IF FOUND
       AND nullif(btrim(coalesce(v_operation.response_summary->>'countryCode', '')), '') IS NOT NULL
       AND upper(v_operation.response_summary->>'countryCode') IS DISTINCT FROM v_country THEN
      RAISE EXCEPTION 'CPE_FISCAL_COUNTRY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Una conversión demo -> real nunca cambia un comprobante histórico.
  IF OLD.simulated_origin THEN
    RETURN NEW;
  END IF;

  IF v_country = 'CO'
     AND upper(coalesce(OLD.fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED'
     AND (upper(btrim(coalesce(NEW.estado::text, ''))) = 'ACEPTADO'
       OR upper(btrim(coalesce(NEW.estado_sunat::text, ''))) = 'ACEPTADO'
       OR upper(btrim(coalesce(NEW.sunat_status::text, ''))) = 'ACCEPTED') THEN
    IF coalesce(NEW.metadata->>'last_delivery_operation_id', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'DIAN_ACCEPTANCE_EVIDENCE_OPERATION_MISSING' USING ERRCODE = '23514';
    END IF;
    v_operation_id := (NEW.metadata->>'last_delivery_operation_id')::uuid;
    SELECT * INTO v_operation
    FROM public.cpe_operaciones o
    WHERE o.id = v_operation_id
      AND o.tenant_id = NEW.tenant_id
      AND o.cpe_id = NEW.id
      AND o.result_kind = 'ACCEPTED'
      AND o.state = 'COMPLETED';
    IF NOT FOUND
       OR upper(coalesce(v_operation.response_summary->>'countryCode', '')) <> 'CO'
       OR coalesce((v_operation.response_summary->>'success')::boolean, false) IS NOT TRUE
       OR upper(coalesce(v_operation.response_summary->>'resultKind', '')) <> 'ACCEPTED'
       OR nullif(btrim(coalesce(NEW.cdr_sunat, '')), '') IS NULL THEN
      RAISE EXCEPTION 'DIAN_ACCEPTANCE_EVIDENCE_INVALID' USING ERRCODE = '23514';
    END IF;

    v_kind := upper(nullif(btrim(v_operation.response_summary->>'dianEvidenceKind'), ''));
    v_unique_code := upper(nullif(btrim(v_operation.response_summary->>'dianUniqueCode'), ''));
    IF v_kind NOT IN ('CUFE', 'CUDE') OR v_unique_code !~ '^[0-9A-F]{96}$' THEN
      RAISE EXCEPTION 'DIAN_UNIQUE_CODE_EVIDENCE_INVALID' USING ERRCODE = '23514';
    END IF;
    -- La autorización que sustenta el CUFE/CUDE se sella antes del I/O
    -- externo. Nunca se vuelve a leer la configuración mutable al aceptar.
    IF jsonb_typeof(v_operation.request_summary->'authorization') <> 'object'
       OR nullif(btrim(v_operation.request_summary#>>'{authorization,software_id}'), '') IS NULL
       OR nullif(btrim(v_operation.request_summary#>>'{authorization,environment_id}'), '') IS NULL
       OR (
         v_kind = 'CUFE' AND (
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
         v_kind = 'CUDE' AND (
           v_operation.request_summary#>>'{authorization,source}' <> 'DIAN_SOFTWARE_CATALOG'
           OR nullif(btrim(v_operation.request_summary#>>'{authorization,document_series}'), '') IS NULL
         )
       ) THEN
      RAISE EXCEPTION 'DIAN_AUTHORIZATION_SNAPSHOT_INCOMPLETE' USING ERRCODE = '23514';
    END IF;

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
      'source', 'DIAN_ACCEPTED_OPERATION'
    );
    -- Los tres alias históricos quedan sincronizados en la misma fila; así un
    -- writer legado que sólo actualice uno no deja evidencia DIAN aceptada con
    -- estado operativo contradictorio.
    NEW.estado := 'ACEPTADO';
    NEW.estado_sunat := 'ACEPTADO';
    NEW.sunat_status := 'ACCEPTED';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_provenance_guard_525() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_cpe_provenance_guard_525 ON public.cpe;
CREATE TRIGGER trg_cpe_provenance_guard_525
BEFORE INSERT OR UPDATE ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.cpe_provenance_guard_525();

CREATE OR REPLACE FUNCTION app.cpe_operation_country_guard_525()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_snapshot_country text;
  v_current_country text;
BEGIN
  IF upper(coalesce(NEW.action, '')) NOT IN ('SEND', 'QUERY')
     OR upper(coalesce(NEW.state, '')) <> 'CLAIMED' THEN
    RETURN NEW;
  END IF;

  SELECT upper(nullif(btrim(c.issuer_snapshot->>'country_code'), '')),
         upper(nullif(btrim(ec.pais), ''))
  INTO v_snapshot_country, v_current_country
  FROM public.cpe c
  JOIN public.empresa_config ec ON ec.tenant_id = c.tenant_id
  WHERE c.id = NEW.cpe_id AND c.tenant_id = NEW.tenant_id;

  IF v_snapshot_country IS NULL OR v_current_country IS NULL
     OR v_snapshot_country IS DISTINCT FROM v_current_country THEN
    RAISE EXCEPTION 'CPE_FISCAL_COUNTRY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.cpe_operation_country_guard_525()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_cpe_operation_country_guard_525 ON public.cpe_operaciones;
CREATE TRIGGER trg_cpe_operation_country_guard_525
BEFORE INSERT OR UPDATE ON public.cpe_operaciones
FOR EACH ROW EXECUTE FUNCTION app.cpe_operation_country_guard_525();

CREATE OR REPLACE FUNCTION app.empresa_country_guard_525()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF upper(nullif(btrim(NEW.pais), '')) IS NOT DISTINCT FROM
     upper(nullif(btrim(OLD.pais), '')) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cpe c
    WHERE c.tenant_id = OLD.tenant_id AND c.simulated_origin IS FALSE
  ) THEN
    RAISE EXCEPTION 'EMPRESA_FISCAL_COUNTRY_IMMUTABLE_WITH_REAL_CPE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.empresa_country_guard_525()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_empresa_country_guard_525 ON public.empresa_config;
CREATE TRIGGER trg_empresa_country_guard_525
BEFORE UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.empresa_country_guard_525();

CREATE OR REPLACE FUNCTION public.reservar_paquete_dian_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_package_year integer,
  p_provider_code text DEFAULT '000'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation public.cpe_operaciones;
  v_cpe public.cpe;
  v_cpe_id uuid;
  v_provider_code text := btrim(coalesce(p_provider_code, ''));
  v_sequence bigint;
  v_existing_year integer;
  v_existing_sequence bigint;
  v_existing_provider text;
BEGIN
  IF p_claim_token IS NULL
     OR p_package_year NOT BETWEEN 2000 AND 9999
     OR p_package_year IS DISTINCT FROM
          extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer
     OR v_provider_code !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'DIAN_PACKAGE_RESERVATION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.cpe_id INTO v_cpe_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'SEND';
  IF NOT FOUND OR v_cpe_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;

  -- Todos los pasos DIAN del mismo CPE se serializan antes de tomar filas.
  -- La prelectura sólo descubre el ancla; la operación se revalida bajo lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_cpe_id::text, 0)
  );
  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_cpe.simulated_origin IS NOT FALSE
     OR upper(coalesce(v_cpe.issuer_snapshot->>'country_code', '')) <> 'CO' THEN
    RAISE EXCEPTION 'DIAN_REAL_CO_CPE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_operation
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'SEND'
    AND o.cpe_id = v_cpe_id
  FOR UPDATE;
  IF NOT FOUND OR v_operation.state <> 'CLAIMED'
     OR v_operation.claim_token IS DISTINCT FROM p_claim_token
     OR v_operation.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'DIAN_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_operation.request_summary->>'dian_package_sequence', '') ~ '^[0-9]+$' THEN
    v_existing_year := nullif(v_operation.request_summary->>'dian_package_year', '')::integer;
    v_existing_sequence := (v_operation.request_summary->>'dian_package_sequence')::bigint;
    v_existing_provider := v_operation.request_summary->>'dian_provider_code';
    IF v_existing_year IS DISTINCT FROM p_package_year
       OR v_existing_sequence NOT BETWEEN 1 AND 4294967295
       OR v_existing_provider IS DISTINCT FROM v_provider_code THEN
      RAISE EXCEPTION 'DIAN_PACKAGE_RESERVATION_COLLISION' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'reserved', true,
      'idempotent', true,
      'package_year', v_existing_year,
      'package_sequence', v_existing_sequence,
      'package_sequence_hex', lpad(upper(to_hex(v_existing_sequence)), 8, '0'),
      'provider_code', v_existing_provider,
      'operation', to_jsonb(v_operation)
    );
  END IF;

  INSERT INTO public.dian_package_counters (
    tenant_id, package_year, last_sequence, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_package_year, 1, now(), now()
  )
  ON CONFLICT (tenant_id, package_year) DO UPDATE
  SET last_sequence = public.dian_package_counters.last_sequence + 1,
      updated_at = now()
  WHERE public.dian_package_counters.last_sequence < 4294967295
  RETURNING last_sequence INTO v_sequence;

  IF v_sequence IS NULL THEN
    RAISE EXCEPTION 'DIAN_PACKAGE_SEQUENCE_EXHAUSTED' USING ERRCODE = '22003';
  END IF;

  UPDATE public.cpe_operaciones
  SET request_summary = coalesce(request_summary, '{}'::jsonb) || jsonb_build_object(
        'country_code', 'CO',
        'dian_package_year', p_package_year,
        'dian_package_sequence', v_sequence,
        'dian_package_sequence_hex', lpad(upper(to_hex(v_sequence)), 8, '0'),
        'dian_provider_code', v_provider_code,
        'dian_package_reserved_at', now(),
        'contract_version', 525
      ),
      updated_at = now()
  WHERE id = v_operation.id
  RETURNING * INTO v_operation;

  RETURN jsonb_build_object(
    'reserved', true,
    'idempotent', false,
    'package_year', p_package_year,
    'package_sequence', v_sequence,
    'package_sequence_hex', lpad(upper(to_hex(v_sequence)), 8, '0'),
    'provider_code', v_provider_code,
    'operation', to_jsonb(v_operation)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_paquete_dian_tx(
  uuid, uuid, uuid, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_paquete_dian_tx(
  uuid, uuid, uuid, integer, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.sellar_envio_dian_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_xml_firmado text,
  p_code_kind text,
  p_unique_code text,
  p_authorization jsonb,
  p_issuer_tax_profile jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation public.cpe_operaciones;
  v_cpe public.cpe;
  v_cpe_id uuid;
  v_kind text := upper(nullif(btrim(coalesce(p_code_kind, '')), ''));
  v_code text := upper(nullif(btrim(coalesce(p_unique_code, '')), ''));
  v_authorization jsonb := coalesce(p_authorization, '{}'::jsonb);
  v_profile jsonb := coalesce(p_issuer_tax_profile, '{}'::jsonb);
  v_xml_hash text;
  v_number bigint;
  v_from bigint;
  v_to bigint;
  v_issue_date date;
  v_valid_from date;
  v_valid_to date;
  v_prefix text;
  v_fp text;
BEGIN
  IF p_claim_token IS NULL
     OR nullif(btrim(coalesce(p_xml_firmado, '')), '') IS NULL
     OR octet_length(p_xml_firmado) > 15728640
     OR v_kind NOT IN ('CUFE', 'CUDE')
     OR v_code !~ '^[0-9A-F]{96}$'
     OR jsonb_typeof(v_authorization) <> 'object'
     OR jsonb_typeof(v_profile) <> 'object'
     OR coalesce(v_authorization->>'environment_id', '') NOT IN ('1', '2')
     OR nullif(btrim(v_authorization->>'software_id'), '') IS NULL
     OR (
       v_kind = 'CUFE' AND (
         coalesce(v_authorization->>'source', '') <> 'DIAN_GET_NUMBERING_RANGE'
         OR nullif(btrim(v_authorization->>'number'), '') IS NULL
         OR nullif(btrim(v_authorization->>'prefix'), '') IS NULL
         OR coalesce(v_authorization->>'range_from', '') !~ '^[0-9]+$'
         OR coalesce(v_authorization->>'range_to', '') !~ '^[0-9]+$'
         OR coalesce(v_authorization->>'valid_from', '') !~ '^\d{4}-\d{2}-\d{2}$'
         OR coalesce(v_authorization->>'valid_to', '') !~ '^\d{4}-\d{2}-\d{2}$'
         OR coalesce(v_authorization->>'technical_key_sha256', '') !~ '^[0-9a-f]{64}$'
       )
     )
     OR (
       v_kind = 'CUDE' AND (
         coalesce(v_authorization->>'source', '') <> 'DIAN_SOFTWARE_CATALOG'
         OR nullif(btrim(v_authorization->>'document_series'), '') IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'DIAN_SEALED_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.cpe_id INTO v_cpe_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'SEND';
  IF NOT FOUND OR v_cpe_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_cpe_id::text, 0)
  );
  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_cpe.simulated_origin IS NOT FALSE
     OR upper(coalesce(v_cpe.issuer_snapshot->>'country_code', '')) <> 'CO' THEN
    RAISE EXCEPTION 'DIAN_REAL_CO_CPE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_operation
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'SEND'
    AND o.cpe_id = v_cpe_id
  FOR UPDATE;
  IF NOT FOUND OR v_operation.state <> 'CLAIMED'
     OR v_operation.claim_token IS DISTINCT FROM p_claim_token
     OR v_operation.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'DIAN_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_operation.request_summary->>'dian_package_year', '') !~ '^[0-9]{4}$'
     OR coalesce(v_operation.request_summary->>'dian_package_sequence', '') !~ '^[0-9]+$'
     OR coalesce(v_operation.request_summary->>'dian_package_sequence_hex', '') !~ '^[0-9A-F]{8}$'
     OR coalesce(v_operation.request_summary->>'dian_provider_code', '') !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'DIAN_PACKAGE_RESERVATION_MISSING' USING ERRCODE = '23514';
  END IF;
  IF (v_operation.request_summary->>'dian_package_sequence')::bigint NOT BETWEEN 1 AND 4294967295
     OR (v_operation.request_summary->>'dian_package_year')::integer IS DISTINCT FROM
          extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer
     OR lpad(upper(to_hex((v_operation.request_summary->>'dian_package_sequence')::bigint)), 8, '0')
          IS DISTINCT FROM v_operation.request_summary->>'dian_package_sequence_hex' THEN
    RAISE EXCEPTION 'DIAN_PACKAGE_RESERVATION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF (v_kind = 'CUFE' AND v_cpe.tipo_documento <> '01')
     OR (v_kind = 'CUDE' AND v_cpe.tipo_documento NOT IN ('91', '92')) THEN
    RAISE EXCEPTION 'DIAN_UNIQUE_CODE_KIND_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF v_kind = 'CUFE' THEN
    v_prefix := upper(btrim(v_authorization->>'prefix'));
    v_from := (v_authorization->>'range_from')::bigint;
    v_to := (v_authorization->>'range_to')::bigint;
    v_valid_from := (v_authorization->>'valid_from')::date;
    v_valid_to := (v_authorization->>'valid_to')::date;
    v_number := nullif(regexp_replace(coalesce(v_cpe.numero, ''), '[^0-9]', '', 'g'), '')::bigint;
    v_issue_date := (v_cpe.fecha_emision AT TIME ZONE 'America/Bogota')::date;
    IF upper(btrim(coalesce(v_cpe.serie, ''))) <> v_prefix
       OR v_number IS NULL OR v_number NOT BETWEEN v_from AND v_to
       OR v_issue_date NOT BETWEEN v_valid_from AND v_valid_to
       OR v_to < v_from OR v_valid_to < v_valid_from THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_RANGE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF upper(btrim(coalesce(v_cpe.serie, ''))) <>
      upper(btrim(v_authorization->>'document_series')) THEN
    RAISE EXCEPTION 'DIAN_DOCUMENT_SERIES_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_xml_hash := encode(extensions.digest(convert_to(p_xml_firmado, 'UTF8'), 'sha256'), 'hex');
  UPDATE public.cpe
  SET xml_firmado = p_xml_firmado,
      hash_firma = v_xml_hash,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'dian_prepared_operation_id', v_operation.id,
        'dian_unique_code_kind', v_kind,
        'dian_unique_code', lower(v_code),
        'dian_xml_sha256', v_xml_hash,
        'fiscal_country', 'CO',
        'delivery_contract_version', 525
      )
  WHERE id = v_cpe.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cpe;

  v_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'action', 'SEND',
    'cpe_id', v_cpe.id,
    'documento_id', v_cpe.documento_id,
    'tipo_documento', upper(btrim(coalesce(v_cpe.tipo_documento, ''))),
    'serie', upper(btrim(coalesce(v_cpe.serie, ''))),
    'numero', lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0'),
    'xml_sha256', v_xml_hash,
    'hash', nullif(btrim(coalesce(v_cpe.hash_firma, v_cpe.hash, '')), '')
  ));

  UPDATE public.cpe_operaciones
  SET request_fingerprint = v_fp,
      request_summary = coalesce(request_summary, '{}'::jsonb) || jsonb_build_object(
        'country_code', 'CO',
        'dian_evidence_kind', v_kind,
        'dian_unique_code', v_code,
        'xml_sha256', v_xml_hash,
        'authorization', v_authorization,
        'issuer_tax_profile', v_profile,
        'prepared_at', now(),
        'contract_version', 525
      ),
      updated_at = now()
  WHERE id = v_operation.id
  RETURNING * INTO v_operation;

  RETURN jsonb_build_object(
    'sealed', true,
    'operation', to_jsonb(v_operation),
    'cpe', to_jsonb(v_cpe)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sellar_envio_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sellar_envio_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.reservar_recuperacion_dian_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_idempotency_key text,
  p_origin text DEFAULT 'USER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_origin text := upper(btrim(coalesce(p_origin, '')));
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cpe public.cpe;
  v_send public.cpe_operaciones;
  v_query public.cpe_operaciones;
  v_claim uuid := gen_random_uuid();
  v_code text;
  v_kind text;
  v_query_kind text;
  v_query_key text;
  v_fp text;
BEGIN
  IF length(coalesce(v_key, '')) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'CPE_OPERATION_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, v_origin);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || p_cpe_id::text, 0)
  );

  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_cpe.simulated_origin IS NOT FALSE
     OR upper(coalesce(v_cpe.issuer_snapshot->>'country_code', '')) <> 'CO'
     OR upper(v_cpe.estado::text) IN ('ACEPTADO', 'ANULADO', 'MIGRADO', 'RECHAZADO') THEN
    RAISE EXCEPTION 'DIAN_RECOVERY_NOT_ALLOWED' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_send
  FROM public.cpe_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.cpe_id = p_cpe_id
    AND o.action = 'SEND'
    AND upper(coalesce(o.request_summary->>'country_code', '')) = 'CO'
    AND upper(coalesce(o.request_summary->>'dian_evidence_kind', '')) IN ('CUFE', 'CUDE')
    AND upper(coalesce(o.request_summary->>'dian_unique_code', '')) ~ '^[0-9A-F]{96}$'
    AND (
      (
        upper(coalesce(o.response_summary->>'dianQueryKind', '')) = 'CUFE_CUDE'
        AND upper(coalesce(o.response_summary->>'dianQueryKey', ''))
              = upper(coalesce(o.request_summary->>'dian_unique_code', ''))
      )
      OR (
        upper(coalesce(o.response_summary->>'dianQueryKind', '')) = 'ZIP_TRACK_ID'
        AND (
          coalesce(o.response_summary->>'dianQueryKey', '') ~ '^[A-Fa-f0-9]{64,128}$'
          OR coalesce(o.response_summary->>'dianQueryKey', '')
                ~* '^[0-9a-f]{8}-[0-9a-f-]{27,}$'
        )
      )
    )
    AND (
      o.state = 'TECHNICAL_ERROR'
      OR (o.state = 'CLAIMED' AND o.lease_expires_at <= now())
      OR (o.state = 'COMPLETED' AND o.result_kind = 'PENDING')
    )
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIAN_RECOVERY_EVIDENCE_MISSING' USING ERRCODE = '55000';
  END IF;

  v_code := upper(v_send.request_summary->>'dian_unique_code');
  v_kind := upper(v_send.request_summary->>'dian_evidence_kind');
  v_query_kind := upper(v_send.response_summary->>'dianQueryKind');
  v_query_key := btrim(v_send.response_summary->>'dianQueryKey');
  v_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'action', 'QUERY', 'cpe_id', v_cpe.id,
    'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key,
    'dian_unique_code', v_code, 'source_send_operation_id', v_send.id
  ));

  SELECT * INTO v_query
  FROM public.cpe_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_query.cpe_id IS DISTINCT FROM p_cpe_id
       OR v_query.action <> 'QUERY'
       OR v_query.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'CPE_OPERATION_IDEMPOTENCY_COLLISION' USING ERRCODE = '23505';
    END IF;
    IF v_query.state = 'COMPLETED' THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', true, 'reason', 'TERMINAL',
        'operation', to_jsonb(v_query), 'cpe', to_jsonb(v_cpe),
        'dian_unique_code', v_code, 'dian_evidence_kind', v_kind,
        'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key
      );
    END IF;
    IF v_query.state = 'CLAIMED' AND v_query.lease_expires_at > now() THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', true, 'reason', 'IN_FLIGHT',
        'operation', to_jsonb(v_query), 'cpe', to_jsonb(v_cpe),
        'dian_unique_code', v_code, 'dian_evidence_kind', v_kind,
        'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key
      );
    END IF;
    IF v_query.state = 'TECHNICAL_ERROR'
       AND v_query.next_retry_at IS NOT NULL AND v_query.next_retry_at > now() THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', true, 'reason', 'RETRY_LATER',
        'retry_at', v_query.next_retry_at,
        'operation', to_jsonb(v_query), 'cpe', to_jsonb(v_cpe),
        'dian_unique_code', v_code, 'dian_evidence_kind', v_kind,
        'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key
      );
    END IF;
    UPDATE public.cpe_operaciones
    SET state = 'CLAIMED', claim_token = v_claim,
        lease_expires_at = now() + interval '5 minutes', attempt = attempt + 1,
        actor_id = p_actor_id, origin = v_origin, result_kind = NULL,
        response_summary = NULL, response_code = NULL, error_message = NULL,
        terminal_fingerprint = NULL, next_retry_at = NULL,
        completed_at = NULL, updated_at = now(),
        request_summary = v_send.request_summary || jsonb_build_object(
          'source_send_operation_id', v_send.id, 'recovery', true,
          'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key
        )
    WHERE id = v_query.id
    RETURNING * INTO v_query;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.cpe_operaciones o
      WHERE o.tenant_id = p_tenant_id AND o.cpe_id = p_cpe_id
        AND o.action = 'QUERY' AND o.state = 'CLAIMED'
        AND o.lease_expires_at > now()
    ) THEN
      RAISE EXCEPTION 'CPE_OPERATION_ALREADY_IN_FLIGHT' USING ERRCODE = '55P03';
    END IF;
    INSERT INTO public.cpe_operaciones (
      tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
      state, claim_token, lease_expires_at, attempt, actor_id, origin,
      request_summary
    ) VALUES (
      p_tenant_id, p_cpe_id, 'QUERY', v_key, v_fp,
      'CLAIMED', v_claim, now() + interval '5 minutes', 1,
      p_actor_id, v_origin,
      v_send.request_summary || jsonb_build_object(
        'source_send_operation_id', v_send.id, 'recovery', true,
        'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key
      )
    ) RETURNING * INTO v_query;
  END IF;

  UPDATE public.cpe
  SET estado = 'ENVIADO', estado_sunat = 'ENVIADO', sunat_status = 'SENDING',
      error_message = NULL, next_retry_at = NULL, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_delivery_operation_id', v_query.id,
        'last_delivery_origin', v_origin,
        'dian_recovery_source_operation_id', v_send.id,
        'delivery_contract_version', 525
      )
  WHERE id = v_cpe.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cpe;

  RETURN jsonb_build_object(
    'claimed', true, 'idempotent', v_query.attempt > 1,
    'operation', to_jsonb(v_query), 'cpe', to_jsonb(v_cpe),
    'dian_unique_code', v_code, 'dian_evidence_kind', v_kind,
    'dian_query_kind', v_query_kind, 'dian_query_key', v_query_key
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_recuperacion_dian_tx(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_recuperacion_dian_tx(
  uuid, uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalizar_recuperacion_dian_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_result_kind text,
  p_response_code text,
  p_description text,
  p_cdr text DEFAULT NULL,
  p_response_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_kind text := upper(btrim(coalesce(p_result_kind, '')));
  v_operation public.cpe_operaciones;
  v_cpe public.cpe;
  v_document public.documentos;
  v_terminal_fp text;
  v_source_send_id uuid;
  v_cpe_id uuid;
BEGIN
  SELECT o.cpe_id INTO v_cpe_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'QUERY';
  IF NOT FOUND OR v_cpe_id IS NULL THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_cpe_id::text, 0)
  );

  IF v_kind <> 'NOT_FOUND' THEN
    RETURN app.finalize_cpe_operation_476(
      'QUERY', p_tenant_id, p_operation_id, p_claim_token, v_kind,
      p_response_code, p_description, p_cdr, NULL, NULL,
      coalesce(p_response_summary, '{}'::jsonb)
    );
  END IF;
  IF p_claim_token IS NULL
     OR upper(btrim(coalesce(p_response_code, ''))) <> 'DIAN_NOT_FOUND'
     OR nullif(btrim(coalesce(p_description, '')), '') IS NULL
     OR jsonb_typeof(coalesce(p_response_summary, '{}'::jsonb)) <> 'object'
     OR upper(coalesce(p_response_summary->>'countryCode', '')) <> 'CO'
     OR lower(coalesce(p_response_summary->>'explicitNotFound', '')) <> 'true'
     OR lower(coalesce(p_response_summary->>'authorityResponse', '')) <> 'true'
     OR lower(coalesce(p_response_summary->>'technical', '')) <> 'false'
     OR lower(coalesce(p_response_summary->>'uncertain', '')) <> 'false' THEN
    RAISE EXCEPTION 'DIAN_NOT_FOUND_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_cpe.simulated_origin IS NOT FALSE
     OR upper(coalesce(v_cpe.issuer_snapshot->>'country_code', '')) <> 'CO' THEN
    RAISE EXCEPTION 'DIAN_REAL_CO_CPE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_operation
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'QUERY'
    AND o.cpe_id = v_cpe_id
  FOR UPDATE;
  IF NOT FOUND OR v_operation.state <> 'CLAIMED'
     OR v_operation.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  IF upper(coalesce(v_operation.request_summary->>'country_code', '')) <> 'CO'
     OR upper(coalesce(v_operation.request_summary->>'dian_unique_code', '')) !~ '^[0-9A-F]{96}$'
     OR upper(coalesce(v_operation.request_summary->>'dian_query_kind', ''))
          NOT IN ('CUFE_CUDE', 'ZIP_TRACK_ID')
     OR (
       upper(v_operation.request_summary->>'dian_query_kind') = 'CUFE_CUDE'
       AND upper(coalesce(v_operation.request_summary->>'dian_query_key', ''))
             <> upper(coalesce(v_operation.request_summary->>'dian_unique_code', ''))
     )
     OR (
       upper(v_operation.request_summary->>'dian_query_kind') = 'ZIP_TRACK_ID'
       AND coalesce(v_operation.request_summary->>'dian_query_key', '')
             !~ '^[A-Fa-f0-9]{64,128}$'
       AND coalesce(v_operation.request_summary->>'dian_query_key', '')
             !~* '^[0-9a-f]{8}-[0-9a-f-]{27,}$'
     )
     OR coalesce(v_operation.request_summary->>'source_send_operation_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'DIAN_RECOVERY_EVIDENCE_MISSING' USING ERRCODE = '23514';
  END IF;
  IF upper(coalesce(p_response_summary->>'dianQueryKind', ''))
       IS DISTINCT FROM upper(v_operation.request_summary->>'dian_query_kind')
     OR btrim(coalesce(p_response_summary->>'dianQueryKey', ''))
       IS DISTINCT FROM btrim(v_operation.request_summary->>'dian_query_key')
     OR btrim(coalesce(p_response_summary->>'authorityStatusCode', ''))
       IS DISTINCT FROM (
         CASE
         WHEN upper(v_operation.request_summary->>'dian_query_kind') = 'CUFE_CUDE'
           THEN '66'
         WHEN upper(v_operation.request_summary->>'dian_query_kind') = 'ZIP_TRACK_ID'
           THEN '90'
         ELSE ''
         END
       ) THEN
    RAISE EXCEPTION 'DIAN_RECOVERY_QUERY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  v_source_send_id := (v_operation.request_summary->>'source_send_operation_id')::uuid;

  v_terminal_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'result_kind', 'NOT_FOUND',
    'response_code', p_response_code,
    'description', p_description,
    'response_summary', coalesce(p_response_summary, '{}'::jsonb)
  ));
  UPDATE public.cpe_operaciones
  SET state = 'COMPLETED', result_kind = 'NOT_FOUND',
      response_code = left(btrim(p_response_code), 100),
      error_message = NULL,
      response_summary = coalesce(p_response_summary, '{}'::jsonb),
      terminal_fingerprint = v_terminal_fp,
      lease_expires_at = NULL, next_retry_at = NULL,
      completed_at = now(), updated_at = now()
  WHERE id = v_operation.id
  RETURNING * INTO v_operation;

  UPDATE public.cpe_operaciones
  SET next_retry_at = NULL, updated_at = now()
  WHERE id = v_source_send_id AND tenant_id = p_tenant_id
    AND cpe_id = v_cpe.id AND action = 'SEND' AND state = 'TECHNICAL_ERROR';

  UPDATE public.cpe
  SET estado = 'FIRMADO', estado_sunat = 'PENDIENTE', sunat_status = 'READY',
      error_message = NULL, next_retry_at = NULL, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_delivery_operation_id', v_operation.id,
        'last_delivery_result', 'NOT_FOUND',
        'dian_resubmit_authorized_from_query', true,
        'delivery_contract_version', 525
      )
  WHERE id = v_cpe.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cpe;

  IF v_cpe.documento_id IS NOT NULL THEN
    UPDATE public.documentos
    SET estado = 'EMITIDO', estado_sunat = 'PENDIENTE', error_sunat = NULL,
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_cpe_operation_id', v_operation.id,
          'last_fiscal_result', 'NOT_FOUND',
          'fiscal_contract_version', 525
        )
    WHERE id = v_cpe.documento_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_document;
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false,
    'operation', to_jsonb(v_operation),
    'cpe', to_jsonb(v_cpe),
    'documento', CASE WHEN v_document.id IS NULL THEN NULL ELSE to_jsonb(v_document) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalizar_recuperacion_dian_tx(
  uuid, uuid, uuid, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_recuperacion_dian_tx(
  uuid, uuid, uuid, text, text, text, text, jsonb
) TO service_role;

COMMENT ON COLUMN public.cpe.simulated_origin IS
  'Procedencia inmutable: true si el CPE nació en demo o es legado sin evidencia verificable.';
COMMENT ON COLUMN public.cpe.issuer_snapshot IS
  'Snapshot inmutable del país e identidad mínima del emisor al crear el CPE.';
COMMENT ON COLUMN public.cpe.fiscal_authority_evidence IS
  'Evidencia fiscal separada del hash XML; DIAN ACCEPTED requiere CUFE/CUDE dedicado y operación terminal.';
COMMENT ON COLUMN public.empresa_config.dian_habilitacion_evidencia IS
  'Constancia administrativa del estado Habilitado visto en el portal DIAN; se liga al NIT, Software ID y hash del TestSet vigentes.';
COMMENT ON TABLE public.dian_package_counters IS
  'Contador anual y atómico de nombres ZIP DIAN; sólo se opera mediante reservar_paquete_dian_tx.';
COMMENT ON FUNCTION public.reservar_paquete_dian_tx(uuid, uuid, uuid, integer, text) IS
  'Reserva una secuencia hexadecimal anual por tenant y la inmoviliza en la operación SEND.';
COMMENT ON FUNCTION public.sellar_envio_dian_tx(uuid, uuid, uuid, text, text, text, jsonb, jsonb) IS
  'Persiste XML firmado y CUFE/CUDE antes del I/O DIAN; guarda sólo la huella de la clave técnica.';
COMMENT ON FUNCTION public.reservar_recuperacion_dian_tx(uuid, uuid, uuid, text, text) IS
  'Reserva consulta por CUFE/CUDE tras resultado incierto; nunca reenvía a ciegas.';
COMMENT ON FUNCTION public.finalizar_recuperacion_dian_tx(uuid, uuid, uuid, text, text, text, text, jsonb) IS
  'Finaliza recuperación DIAN; sólo NOT_FOUND explícito vuelve a habilitar el mismo XML para reenvío.';
COMMENT ON FUNCTION public.registrar_habilitacion_dian_tx(uuid, uuid, text, text) IS
  'Registra de forma auditada la constancia del portal DIAN y nunca la infiere de un documento ACCEPTED.';

COMMIT;

NOTIFY pgrst, 'reload schema';
