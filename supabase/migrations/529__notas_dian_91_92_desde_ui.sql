BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Una nota DIAN debe conservar el emisor exacto con el que fue creada. El
-- snapshot combina la identidad fiscal persistida en el CPE origen con la
-- configuración de firma vigente, pero nunca guarda certificados ni secretos:
-- sólo sus huellas deterministas.
CREATE OR REPLACE FUNCTION app.dian_note_issuer_snapshot_529(
  p_tenant_id uuid,
  p_source_cpe_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_config public.empresa_config%ROWTYPE;
  v_source public.cpe%ROWTYPE;
  v_metadata jsonb;
  v_tax_id text;
  v_legal_name text;
  v_address text;
  v_municipality text;
  v_department text;
  v_municipality_code text;
  v_department_code text;
  v_tax_regime text;
  v_contributor_type text;
  v_currency text;
  v_certificate_sha256 text;
  v_signing_config_sha256 text;
BEGIN
  IF p_tenant_id IS NULL OR p_source_cpe_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SOURCE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_config
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND
     OR upper(btrim(coalesce(v_config.pais, ''))) <> 'CO'
     OR v_config.is_demo IS DISTINCT FROM false
     OR v_config.dian_activo IS DISTINCT FROM true
     OR v_config.certificado_pfx IS NULL
     OR octet_length(v_config.certificado_pfx) = 0
     OR nullif(v_config.certificado_password, '') IS NULL
     OR nullif(btrim(coalesce(v_config.dian_url, '')), '') IS NULL
     OR nullif(btrim(coalesce(v_config.dian_software_id, '')), '') IS NULL
     OR nullif(v_config.dian_software_pin, '') IS NULL
     OR upper(btrim(coalesce(v_config.dian_environment, '')))
          NOT IN ('HOMOLOGACION', 'PRODUCCION') THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SIGNING_CONFIG_INCOMPLETE'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_source
  FROM public.cpe c
  WHERE c.id = p_source_cpe_id
    AND c.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND
     OR upper(btrim(coalesce(v_source.tipo_documento, ''))) <> '01'
     OR v_source.simulated_origin IS DISTINCT FROM false
     OR upper(btrim(coalesce(v_source.issuer_snapshot->>'country_code', ''))) <> 'CO'
     OR jsonb_typeof(coalesce(v_source.metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SOURCE_INVALID' USING ERRCODE = '23514';
  END IF;

  v_metadata := v_source.metadata;
  v_tax_id := btrim(coalesce(v_source.ruc_emisor, ''));
  v_legal_name := btrim(coalesce(v_source.razon_social_emisor, ''));
  v_address := btrim(coalesce(v_metadata->>'dian_direccion_emisor', ''));
  v_municipality := btrim(coalesce(v_metadata->>'dian_municipio_emisor', ''));
  v_department := btrim(coalesce(v_metadata->>'dian_departamento_emisor', ''));
  v_municipality_code := btrim(coalesce(v_metadata->>'dian_codigo_dane_emisor', ''));
  v_department_code := btrim(coalesce(v_metadata->>'dian_codigo_departamento_emisor', ''));
  v_tax_regime := upper(btrim(coalesce(v_metadata->>'dian_regimen_fiscal', '')));
  v_contributor_type := upper(btrim(coalesce(v_metadata->>'dian_tipo_contribuyente', '')));
  v_currency := upper(btrim(coalesce(v_source.moneda, '')));

  IF nullif(v_tax_id, '') IS NULL
     OR nullif(v_legal_name, '') IS NULL
     OR nullif(v_address, '') IS NULL
     OR nullif(v_municipality, '') IS NULL
     OR nullif(v_department, '') IS NULL
     OR v_municipality_code !~ '^[0-9]{5}$'
     OR v_department_code !~ '^[0-9]{2}$'
     OR v_department_code <> left(v_municipality_code, 2)
     OR nullif(v_tax_regime, '') IS NULL
     OR nullif(v_contributor_type, '') IS NULL
     OR nullif(v_currency, '') IS NULL THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SOURCE_PROFILE_INCOMPLETE'
      USING ERRCODE = '23514';
  END IF;

  -- No se admite completar el emisor histórico con valores actuales. Todo el
  -- perfil del CPE origen debe seguir coincidiendo con la configuración real.
  IF btrim(coalesce(v_source.issuer_snapshot->>'tax_id', '')) IS DISTINCT FROM v_tax_id
     OR btrim(coalesce(v_source.issuer_snapshot->>'legal_name', '')) IS DISTINCT FROM v_legal_name
     OR btrim(coalesce(v_source.issuer_snapshot->>'address', '')) IS DISTINCT FROM v_address
     OR btrim(coalesce(v_config.ruc, '')) IS DISTINCT FROM v_tax_id
     OR btrim(coalesce(v_config.razon_social, '')) IS DISTINCT FROM v_legal_name
     OR btrim(coalesce(v_config.direccion_fiscal, '')) IS DISTINCT FROM v_address
     OR btrim(coalesce(v_config.provincia, '')) IS DISTINCT FROM v_municipality
     OR btrim(coalesce(v_config.departamento, '')) IS DISTINCT FROM v_department
     OR btrim(coalesce(v_config.ubigeo, '')) IS DISTINCT FROM v_municipality_code
     OR left(btrim(coalesce(v_config.ubigeo, '')), 2) IS DISTINCT FROM v_department_code
     OR upper(btrim(coalesce(v_config.dian_regimen_fiscal, ''))) IS DISTINCT FROM v_tax_regime
     OR upper(btrim(coalesce(v_config.dian_tipo_contribuyente, ''))) IS DISTINCT FROM v_contributor_type
     OR (
       nullif(btrim(coalesce(v_source.direccion_emisor, '')), '') IS NOT NULL
       AND btrim(v_source.direccion_emisor) IS DISTINCT FROM v_address
     ) THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SOURCE_CONFIG_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  v_certificate_sha256 := encode(
    extensions.digest(v_config.certificado_pfx, 'sha256'), 'hex'
  );
  v_signing_config_sha256 := encode(extensions.digest(convert_to(
    array_to_string(ARRAY[
      v_certificate_sha256,
      coalesce(v_config.dian_activo, false)::text,
      btrim(coalesce(v_config.dian_url, '')),
      btrim(coalesce(v_config.dian_software_id, '')),
      btrim(coalesce(v_config.dian_test_set_id, '')),
      upper(btrim(coalesce(v_config.dian_environment, ''))),
      btrim(coalesce(v_config.dian_resolucion_numero, '')),
      upper(btrim(coalesce(v_config.dian_resolucion_prefijo, ''))),
      coalesce(v_config.dian_resolucion_desde::text, ''),
      coalesce(v_config.dian_resolucion_hasta::text, ''),
      coalesce(v_config.dian_resolucion_fecha_inicio::text, ''),
      coalesce(v_config.dian_resolucion_fecha_fin::text, ''),
      upper(btrim(coalesce(v_config.dian_habilitacion_estado, '')))
    ], chr(31)),
    'UTF8'
  ), 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'contract_version', 525,
    'source', 'DIAN_REFERENCED_NOTE_529',
    'dian_note_issuer_contract_version', 529,
    'config_identity_contract_version', 529,
    'country_code', 'CO',
    'tax_id', v_tax_id,
    'legal_name', v_legal_name,
    'address', v_address,
    'municipality', v_municipality,
    'department', v_department,
    'municipality_code', v_municipality_code,
    'department_code', v_department_code,
    'tax_regime', v_tax_regime,
    'contributor_type', v_contributor_type,
    'currency_code', v_currency,
    'certificate_sha256', v_certificate_sha256,
    'signing_config_sha256', v_signing_config_sha256
  );
END;
$function$;

-- 525 inicializa issuer_snapshot para todos los CPE. Este guard especializado
-- se ejecuta después por nombre y reemplaza únicamente las notas 529 por el
-- snapshot completo que el writer calculó y que aquí se vuelve a comprobar.
CREATE OR REPLACE FUNCTION app.cpe_dian_note_issuer_guard_529()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_source_cpe_id uuid;
  v_expected jsonb;
BEGIN
  IF upper(btrim(coalesce(NEW.tipo_documento, ''))) NOT IN ('91', '92')
     OR coalesce(NEW.metadata->>'atomic_rpc', '') <> 'crear_nota_referenciada_tx'
     OR coalesce(NEW.metadata->>'dian_note_issuer_contract_version', '') <> '529' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(coalesce(NEW.metadata, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(NEW.metadata->'issuer_snapshot') IS DISTINCT FROM 'object'
     OR coalesce(NEW.metadata->>'source_cpe_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SNAPSHOT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_source_cpe_id := (NEW.metadata->>'source_cpe_id')::uuid;
  v_expected := app.dian_note_issuer_snapshot_529(NEW.tenant_id, v_source_cpe_id);
  IF NEW.metadata->'issuer_snapshot' IS DISTINCT FROM v_expected
     OR btrim(coalesce(NEW.ruc_emisor, '')) IS DISTINCT FROM v_expected->>'tax_id'
     OR btrim(coalesce(NEW.razon_social_emisor, '')) IS DISTINCT FROM v_expected->>'legal_name'
     OR btrim(coalesce(NEW.direccion_emisor, '')) IS DISTINCT FROM v_expected->>'address'
     OR upper(btrim(coalesce(NEW.moneda, ''))) IS DISTINCT FROM v_expected->>'currency_code' THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  NEW.issuer_snapshot := v_expected;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cpe_zz_dian_note_issuer_guard_529 ON public.cpe;
CREATE TRIGGER trg_cpe_zz_dian_note_issuer_guard_529
BEFORE INSERT ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.cpe_dian_note_issuer_guard_529();

-- Colombia no puede reutilizar el writer 472 mediante un simple alias 07/08:
-- ese contrato valida series peruanas y crea primero efectos financieros que
-- 494/524 deben deshacer. Este writer persiste 91/92 desde el inicio y nace
-- neutro hasta que la aceptación fiscal correlacionada aplique el efecto.
CREATE OR REPLACE FUNCTION app.crear_nota_referenciada_co_529(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_documento_origen_id uuid,
  p_tipo_documento text,
  p_codigo_motivo text,
  p_motivo text,
  p_monto_total numeric,
  p_idempotency_key text,
  p_lineas jsonb,
  p_prorrateo_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
  v_codigo text := btrim(coalesce(p_codigo_motivo, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_monto numeric(14,2) := round(coalesce(p_monto_total, 0), 2);
  v_lineas_raw jsonb := coalesce(p_lineas, '[]'::jsonb);
  v_lineas_canonicas jsonb := '[]'::jsonb;
  v_prorrateo_global boolean := coalesce(p_prorrateo_global, false);
  v_requiere_lineas boolean := (
    (v_tipo = '91' AND v_codigo IN ('1', '4'))
    OR (v_tipo = '92' AND v_codigo IN ('1', '2', '4'))
  );
  v_modo_global boolean := v_codigo = '3';
  v_anulacion_total boolean := v_tipo = '91' AND v_codigo = '2';
  v_country text;
  v_is_demo boolean;
  v_canonical jsonb;
  v_fingerprint text;
  v_operation public.notas_referenciadas_operaciones%ROWTYPE;
  v_origin public.documentos%ROWTYPE;
  v_origin_cpe public.cpe%ROWTYPE;
  v_note public.documentos%ROWTYPE;
  v_note_cpe public.cpe%ROWTYPE;
  v_line record;
  v_source_count integer;
  v_source_base numeric(14,2);
  v_source_igv numeric(14,2);
  v_source_isc numeric(14,2);
  v_source_total numeric(14,2);
  v_ratio numeric(24,12);
  v_target_base numeric(14,2);
  v_target_igv numeric(14,2);
  v_target_isc numeric(14,2);
  v_alloc_base numeric(14,2) := 0;
  v_alloc_igv numeric(14,2) := 0;
  v_alloc_isc numeric(14,2) := 0;
  v_line_base numeric(14,2);
  v_line_igv numeric(14,2);
  v_line_isc numeric(14,2);
  v_line_total numeric(14,2);
  v_line_quantity numeric(18,6);
  v_line_input jsonb;
  v_input_quantity numeric(18,6);
  v_input_base numeric(14,2);
  v_input_tax numeric(14,2);
  v_input_total numeric(14,2);
  v_expected_base numeric(14,2);
  v_expected_igv numeric(14,2);
  v_expected_isc numeric(14,2);
  v_remaining_quantity numeric(18,6);
  v_remaining_base numeric(14,2);
  v_remaining_igv numeric(14,2);
  v_remaining_isc numeric(14,2);
  v_remaining_total numeric(14,2);
  v_available_base numeric(14,2);
  v_available_igv numeric(14,2);
  v_available_isc numeric(14,2);
  v_available_total numeric(14,2);
  v_line_credited_total numeric(14,2);
  v_afectacion text;
  v_order integer := 0;
  v_gravadas numeric(14,2) := 0;
  v_exoneradas numeric(14,2) := 0;
  v_inafectas numeric(14,2) := 0;
  v_exportacion numeric(14,2) := 0;
  v_details jsonb := '[]'::jsonb;
  v_cpe_items jsonb := '[]'::jsonb;
  v_credited numeric(14,2) := 0;
  v_series text;
  v_number text;
  v_event_id uuid := gen_random_uuid();
  v_source_evidence jsonb;
  v_source_prefix text;
  v_source_number_exact text;
  v_source_correlative text;
  v_issuer_snapshot jsonb;
  v_result jsonb;
BEGIN
  PERFORM app.assert_nota_actor_472(p_tenant_id, p_actor_id);
  SELECT upper(nullif(btrim(ec.pais), '')), ec.is_demo
  INTO v_country, v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF v_country IS DISTINCT FROM 'CO' OR v_is_demo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_COUNTRY_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF p_documento_origen_id IS NULL
     OR v_tipo NOT IN ('91', '92')
     OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_monto <= 0 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF (v_tipo = '91' AND v_codigo NOT IN ('1', '2', '3', '4', '5'))
     OR (v_tipo = '92' AND v_codigo NOT IN ('1', '2', '3', '4')) THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_REASON_NOT_SUPPORTED:%', v_codigo
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_lineas_raw) <> 'array'
     OR jsonb_array_length(v_lineas_raw) > 100 THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINES_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'source_document_line_id', x.source_document_line_id,
      'cantidad', round(x.cantidad, 6),
      'base', round(x.base, 2),
      'impuesto', round(x.impuesto, 2),
      'total', round(x.total, 2)
    ) ORDER BY x.source_document_line_id::text), '[]'::jsonb)
    INTO v_lineas_canonicas
    FROM jsonb_to_recordset(v_lineas_raw) AS x(
      source_document_line_id uuid,
      cantidad numeric,
      base numeric,
      impuesto numeric,
      total numeric
    );
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINES_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END;
  IF jsonb_array_length(v_lineas_canonicas) <> jsonb_array_length(v_lineas_raw)
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(v_lineas_canonicas) AS x(
         source_document_line_id uuid,
         cantidad numeric,
         base numeric,
         impuesto numeric,
         total numeric
       )
       WHERE x.source_document_line_id IS NULL
          OR x.cantidad <= 0 OR x.base <= 0 OR x.impuesto < 0 OR x.total <= 0
          OR abs(round(x.base + x.impuesto, 2) - x.total) > 0.01
     )
     OR (
       SELECT count(*) <> count(DISTINCT x.source_document_line_id)
       FROM jsonb_to_recordset(v_lineas_canonicas) AS x(source_document_line_id uuid)
     ) THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINES_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;
  IF v_tipo = '91' AND v_codigo = '5' THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_REASON_EXACT_REPRESENTATION_UNSUPPORTED'
      USING ERRCODE = '23514';
  END IF;
  IF v_requiere_lineas AND jsonb_array_length(v_lineas_canonicas) = 0 THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_SELECTION_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
  IF v_requiere_lineas AND v_prorrateo_global THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_MODE_CANNOT_PRORATE'
      USING ERRCODE = '23514';
  END IF;
  IF v_modo_global AND (
       NOT v_prorrateo_global OR jsonb_array_length(v_lineas_canonicas) <> 0
     ) THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_GLOBAL_PRORATION_CONFIRMATION_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
  IF v_anulacion_total AND (
       v_prorrateo_global OR jsonb_array_length(v_lineas_canonicas) <> 0
     ) THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_CANCELLATION_LINES_FORBIDDEN'
      USING ERRCODE = '23514';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 529,
    'actor_id', p_actor_id,
    'documento_origen_id', p_documento_origen_id,
    'tipo_documento', v_tipo,
    'codigo_motivo', v_codigo,
    'motivo', v_motivo,
    'monto_total', v_monto,
    'lineas', v_lineas_canonicas,
    'prorrateo_global', v_prorrateo_global
  );
  v_fingerprint := app.nota_fingerprint_472(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-REFERENCIADA:%s', p_tenant_id, v_key), 472
  ));

  SELECT * INTO v_operation
  FROM public.notas_referenciadas_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'CREAR'
    AND lower(o.idempotency_key) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.actor_id IS DISTINCT FROM p_actor_id
       OR v_operation.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-ORIGEN:%s', p_tenant_id, p_documento_origen_id), 472
  ));
  SELECT * INTO v_origin
  FROM public.documentos d
  WHERE d.id = p_documento_origen_id
    AND d.tenant_id = p_tenant_id
    AND d.tipo_documento = 'FACTURA'
  FOR UPDATE;
  IF NOT FOUND
     OR v_origin.cliente_id IS NULL
     OR coalesce(v_origin.total, 0) <= 0
     OR upper(v_origin.estado::text) IN ('BORRADOR', 'RECHAZADO', 'ANULADO') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_DOCUMENT_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_origin.cliente_id
      AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_CUSTOMER_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_origin_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = v_origin.id
    AND upper(c.tipo_documento) = '01'
  FOR UPDATE;
  IF NOT FOUND
     OR upper(v_origin_cpe.estado::text) <> 'ACEPTADO'
     OR upper(coalesce(v_origin_cpe.estado_sunat::text, '')) <> 'ACEPTADO'
     OR upper(coalesce(v_origin_cpe.sunat_status::text, '')) <> 'ACCEPTED'
     OR v_origin_cpe.cliente_id IS DISTINCT FROM v_origin.cliente_id
     OR upper(coalesce(v_origin_cpe.moneda, 'COP'))
          IS DISTINCT FROM upper(coalesce(v_origin.moneda, 'COP'))
     OR v_origin_cpe.simulated_origin IS DISTINCT FROM false
     OR upper(coalesce(v_origin_cpe.issuer_snapshot->>'country_code', '')) <> 'CO' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_CPE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  v_source_evidence := app.cpe_fiscal_acceptance_evidence_524(
    p_tenant_id, v_origin_cpe.id, v_origin.id
  );
  IF v_source_evidence IS NULL
     OR v_source_evidence->>'country' IS DISTINCT FROM 'CO'
     OR upper(coalesce(v_origin_cpe.fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED'
     OR upper(coalesce(v_origin_cpe.fiscal_authority_evidence->>'authority', '')) <> 'DIAN'
     OR upper(coalesce(v_origin_cpe.fiscal_authority_evidence->>'country_code', '')) <> 'CO'
     OR upper(coalesce(v_origin_cpe.fiscal_authority_evidence->>'code_kind', '')) <> 'CUFE'
     OR upper(coalesce(v_origin_cpe.fiscal_authority_evidence->>'unique_code', ''))
          !~ '^[0-9A-F]{96}$' THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_ACCEPTANCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  -- La referencia legal no se reconstruye desde las columnas operativas. Su
  -- padding existe por compatibilidad interna y no forma parte del número que
  -- DIAN autorizó. CPE y documento deben conservar el mismo snapshot 530.
  IF jsonb_typeof(coalesce(v_origin_cpe.metadata, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(coalesce(v_origin.metadata, '{}'::jsonb)) <> 'object'
     OR NOT (v_origin_cpe.metadata ? 'dian_prefijo_autorizado')
     OR NOT (v_origin_cpe.metadata ? 'numero_fiscal')
     OR NOT (v_origin.metadata ? 'dian_prefijo_autorizado')
     OR NOT (v_origin.metadata ? 'numero_fiscal')
     OR v_origin_cpe.metadata->>'dian_numbering_contract_version' IS DISTINCT FROM '530'
     OR v_origin.metadata->>'dian_numbering_contract_version' IS DISTINCT FROM '530'
     OR nullif(v_origin_cpe.metadata->>'dian_number_reservation_id', '') IS NULL
     OR v_origin.metadata->>'dian_number_reservation_id'
          IS DISTINCT FROM v_origin_cpe.metadata->>'dian_number_reservation_id' THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_IDENTITY_MISSING'
      USING ERRCODE = '23514';
  END IF;
  v_source_prefix := btrim(v_origin_cpe.metadata->>'dian_prefijo_autorizado');
  v_source_number_exact := btrim(v_origin_cpe.metadata->>'numero_fiscal');
  v_source_correlative := regexp_replace(
    btrim(coalesce(v_origin_cpe.numero, '')), '^0+', ''
  );
  IF v_source_prefix IS DISTINCT FROM upper(v_source_prefix)
     OR v_source_prefix !~ '^[A-Z0-9]{0,4}$'
     OR v_source_number_exact IS DISTINCT FROM upper(v_source_number_exact)
     OR btrim(coalesce(v_origin_cpe.numero, '')) !~ '^[0-9]+$'
     OR coalesce(v_source_correlative, '') !~ '^[1-9][0-9]*$'
     OR upper(btrim(coalesce(v_origin_cpe.serie, ''))) IS DISTINCT FROM v_source_prefix
     OR upper(btrim(coalesce(v_origin.serie, ''))) IS DISTINCT FROM v_source_prefix
     OR regexp_replace(btrim(coalesce(v_origin.numero, '')), '^0+', '')
          IS DISTINCT FROM v_source_correlative
     OR v_source_number_exact IS DISTINCT FROM v_source_prefix || v_source_correlative
     OR v_origin.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM v_source_prefix
     OR v_origin.metadata->>'numero_fiscal' IS DISTINCT FROM v_source_number_exact THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_IDENTITY_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_issuer_snapshot := app.dian_note_issuer_snapshot_529(
    p_tenant_id, v_origin_cpe.id
  );
  IF (
       nullif(btrim(coalesce(v_origin.emisor_ruc, '')), '') IS NOT NULL
       AND btrim(v_origin.emisor_ruc) IS DISTINCT FROM v_issuer_snapshot->>'tax_id'
     ) OR (
       nullif(btrim(coalesce(v_origin.emisor_razon_social, '')), '') IS NOT NULL
       AND btrim(v_origin.emisor_razon_social) IS DISTINCT FROM v_issuer_snapshot->>'legal_name'
     ) OR (
       nullif(btrim(coalesce(v_origin.emisor_direccion, '')), '') IS NOT NULL
       AND btrim(v_origin.emisor_direccion) IS DISTINCT FROM v_issuer_snapshot->>'address'
     ) OR upper(btrim(coalesce(v_origin.moneda, '')))
          IS DISTINCT FROM v_issuer_snapshot->>'currency_code' THEN
    RAISE EXCEPTION 'DIAN_NOTE_ISSUER_SOURCE_DOCUMENT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    PERFORM app.validar_contabilidad_origen_anulacion_cpe_448(
      p_tenant_id, v_origin_cpe.id
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ORIGINAL_ACCOUNTING_PENDING_RETRY'
      USING ERRCODE = '40001', DETAIL = SQLERRM;
  END;

  PERFORM 1
  FROM public.documento_detalles dd
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origin.id
  ORDER BY dd.orden, dd.id
  FOR UPDATE;

  -- Las NC todavía pendientes también reservan saldo. Se bloquean junto con
  -- sus líneas para que dos solicitudes concurrentes no consuman el mismo
  -- importe o la misma cantidad del origen.
  PERFORM 1
  FROM public.documentos n
  JOIN public.documento_detalles nd
    ON nd.tenant_id = n.tenant_id AND nd.documento_id = n.id
  WHERE n.tenant_id = p_tenant_id
    AND n.tipo_documento = 'NOTA_CREDITO'
    AND (
      n.documento_origen_id = v_origin.id
      OR n.metadata->>'source_document_id' = v_origin.id::text
    )
    AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO')
  ORDER BY n.id, nd.orden, nd.id
  FOR UPDATE OF n, nd;

  SELECT count(*)::integer,
         round(coalesce(sum(dd.valor_venta), 0), 2),
         round(coalesce(sum(dd.impuesto_igv), 0), 2),
         round(coalesce(sum(dd.impuesto_isc), 0), 2),
         round(coalesce(sum(dd.total_item), 0), 2)
  INTO v_source_count, v_source_base, v_source_igv, v_source_isc, v_source_total
  FROM public.documento_detalles dd
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origin.id;

  IF v_source_count < 1 OR v_source_total <= 0
     OR abs(v_source_total - round(coalesce(v_origin.total, 0), 2)) > 0.01
     OR EXISTS (
       SELECT 1
       FROM public.documento_detalles dd
       WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origin.id
         AND (
           coalesce(dd.cantidad, 0) <= 0
           OR coalesce(dd.valor_venta, 0) <= 0
           OR least(coalesce(dd.impuesto_igv, 0), coalesce(dd.impuesto_isc, 0)) < 0
           OR abs(round(
             coalesce(dd.valor_venta, 0) + coalesce(dd.impuesto_igv, 0)
             + coalesce(dd.impuesto_isc, 0), 2
           ) - round(coalesce(dd.total_item, 0), 2)) > 0.01
         )
     ) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_LINES_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT round(coalesce(sum(n.total), 0), 2)
  INTO v_credited
  FROM public.documentos n
  WHERE n.tenant_id = p_tenant_id
    AND n.tipo_documento = 'NOTA_CREDITO'
    AND (
      n.documento_origen_id = v_origin.id
      OR n.metadata->>'source_document_id' = v_origin.id::text
    )
    AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO');

  SELECT round(coalesce(sum(nd.total_item), 0), 2)
  INTO v_line_credited_total
  FROM public.documentos n
  JOIN public.documento_detalles nd
    ON nd.tenant_id = n.tenant_id AND nd.documento_id = n.id
  JOIN public.documento_detalles source_line
    ON source_line.tenant_id = p_tenant_id
   AND source_line.documento_id = v_origin.id
   AND nd.metadata->>'source_document_line_id' = source_line.id::text
  WHERE n.tenant_id = p_tenant_id
    AND n.tipo_documento = 'NOTA_CREDITO'
    AND (
      n.documento_origen_id = v_origin.id
      OR n.metadata->>'source_document_id' = v_origin.id::text
    )
    AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO');

  IF abs(v_credited - v_line_credited_total) > 0.01 THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_LINE_BALANCE_UNVERIFIABLE'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    round(coalesce(sum(dd.valor_venta - used.base), 0), 2),
    round(coalesce(sum(dd.impuesto_igv - used.igv), 0), 2),
    round(coalesce(sum(dd.impuesto_isc - used.isc), 0), 2),
    round(coalesce(sum(dd.total_item - used.total), 0), 2)
  INTO v_available_base, v_available_igv, v_available_isc, v_available_total
  FROM public.documento_detalles dd
  LEFT JOIN LATERAL (
    SELECT
      coalesce(sum(nd.valor_venta), 0) AS base,
      coalesce(sum(nd.impuesto_igv), 0) AS igv,
      coalesce(sum(nd.impuesto_isc), 0) AS isc,
      coalesce(sum(nd.total_item), 0) AS total
    FROM public.documentos n
    JOIN public.documento_detalles nd
      ON nd.tenant_id = n.tenant_id AND nd.documento_id = n.id
    WHERE n.tenant_id = p_tenant_id
      AND n.tipo_documento = 'NOTA_CREDITO'
      AND (
        n.documento_origen_id = v_origin.id
        OR n.metadata->>'source_document_id' = v_origin.id::text
      )
      AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO')
      AND nd.metadata->>'source_document_line_id' = dd.id::text
  ) used ON true
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origin.id;

  IF least(v_available_base, v_available_igv, v_available_isc, v_available_total) < -0.01
     OR abs(v_available_total - round(v_source_total - v_credited, 2)) > 0.01 THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_LINE_BALANCE_CORRUPT'
      USING ERRCODE = '23514';
  END IF;

  IF v_tipo = '91' THEN
    IF v_monto - v_available_total > 0.01 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_EXCEEDS_SOURCE_BALANCE: available=% requested=%',
        v_available_total, v_monto
        USING ERRCODE = '23514';
    END IF;
    IF v_anulacion_total AND abs(v_monto - v_available_total) > 0.01 THEN
      RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_CANCELLATION_MUST_EQUAL_REMAINING_BALANCE: available=% requested=%',
        v_available_total, v_monto
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_modo_global THEN
    IF v_tipo = '91' THEN
      v_ratio := v_monto / nullif(v_available_total, 0);
      v_target_base := round(v_available_base * v_ratio, 2);
      v_target_igv := round(v_available_igv * v_ratio, 2);
      v_target_isc := round(v_available_isc * v_ratio, 2);
    ELSE
      v_ratio := v_monto / v_source_total;
      v_target_base := round(v_source_base * v_ratio, 2);
      v_target_igv := round(v_source_igv * v_ratio, 2);
      v_target_isc := round(v_source_isc * v_ratio, 2);
    END IF;
    v_target_base := round(
      v_target_base + (v_monto - v_target_base - v_target_igv - v_target_isc), 2
    );
    IF least(v_target_base, v_target_igv, v_target_isc) < 0
       OR abs(v_monto - v_target_base - v_target_igv - v_target_isc) > 0.01 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_ALLOCATION_INVALID'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  FOR v_line IN
    SELECT source.*,
      row_number() OVER (ORDER BY source.orden, source.id) AS rn,
      count(*) OVER () AS n
    FROM (
      SELECT dd.*,
        coalesce(used.quantity, 0) AS used_quantity,
        coalesce(used.base, 0) AS used_base,
        coalesce(used.igv, 0) AS used_igv,
        coalesce(used.isc, 0) AS used_isc,
        coalesce(used.total, 0) AS used_total
      FROM public.documento_detalles dd
      LEFT JOIN LATERAL (
        SELECT
          coalesce(sum(CASE
            WHEN nd.metadata->>'codigo_motivo' IN ('1', '2') THEN nd.cantidad
            ELSE 0 END), 0) AS quantity,
          coalesce(sum(nd.valor_venta), 0) AS base,
          coalesce(sum(nd.impuesto_igv), 0) AS igv,
          coalesce(sum(nd.impuesto_isc), 0) AS isc,
          coalesce(sum(nd.total_item), 0) AS total
        FROM public.documentos n
        JOIN public.documento_detalles nd
          ON nd.tenant_id = n.tenant_id AND nd.documento_id = n.id
        WHERE n.tenant_id = p_tenant_id
          AND n.tipo_documento = 'NOTA_CREDITO'
          AND (
            n.documento_origen_id = v_origin.id
            OR n.metadata->>'source_document_id' = v_origin.id::text
          )
          AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO')
          AND nd.metadata->>'source_document_line_id' = dd.id::text
      ) used ON true
      WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origin.id
        AND (
          v_tipo <> '91' OR NOT v_modo_global
          OR round(dd.total_item - coalesce(used.total, 0), 2) > 0.01
        )
        AND (
          NOT v_requiere_lineas
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_lineas_canonicas) selected(value)
            WHERE selected.value->>'source_document_line_id' = dd.id::text
          )
        )
    ) source
    ORDER BY source.orden, source.id
  LOOP
    v_remaining_quantity := round(v_line.cantidad - v_line.used_quantity, 6);
    v_remaining_base := round(v_line.valor_venta - v_line.used_base, 2);
    v_remaining_igv := round(v_line.impuesto_igv - v_line.used_igv, 2);
    v_remaining_isc := round(v_line.impuesto_isc - v_line.used_isc, 2);
    v_remaining_total := round(v_line.total_item - v_line.used_total, 2);
    IF least(
      v_remaining_quantity, v_remaining_base, v_remaining_igv,
      v_remaining_isc, v_remaining_total
    ) < -0.01 THEN
      RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_LINE_BALANCE_CORRUPT:%', v_line.id
        USING ERRCODE = '23514';
    END IF;
    IF v_tipo = '91' AND v_remaining_total > 0.01
       AND (v_remaining_quantity <= 0 OR v_remaining_base <= 0) THEN
      RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_LINE_BALANCE_UNVERIFIABLE:%', v_line.id
        USING ERRCODE = '23514';
    END IF;

    IF v_anulacion_total THEN
      IF v_remaining_total <= 0.01 THEN CONTINUE; END IF;
      IF v_remaining_quantity <= 0 OR v_remaining_base <= 0 THEN
        RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_LINE_BALANCE_UNVERIFIABLE:%', v_line.id
          USING ERRCODE = '23514';
      END IF;
      v_line_quantity := v_remaining_quantity;
      v_line_base := v_remaining_base;
      v_line_igv := v_remaining_igv;
      v_line_isc := v_remaining_isc;
    ELSIF v_requiere_lineas THEN
      SELECT selected.value INTO v_line_input
      FROM jsonb_array_elements(v_lineas_canonicas) selected(value)
      WHERE selected.value->>'source_document_line_id' = v_line.id::text;
      IF v_line_input IS NULL THEN
        RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_LINE_NOT_FOUND:%', v_line.id
          USING ERRCODE = '23514';
      END IF;
      v_input_quantity := round((v_line_input->>'cantidad')::numeric, 6);
      v_input_base := round((v_line_input->>'base')::numeric, 2);
      v_input_tax := round((v_line_input->>'impuesto')::numeric, 2);
      v_input_total := round((v_line_input->>'total')::numeric, 2);
      IF abs(v_input_total - v_input_base - v_input_tax) > 0.01 THEN
        RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_AMOUNT_MISMATCH:%', v_line.id
          USING ERRCODE = '23514';
      END IF;

      IF v_tipo = '91' THEN
        IF v_input_quantity - v_remaining_quantity > 0.000001
           OR v_input_base - v_remaining_base > 0.01
           OR v_input_total - v_remaining_total > 0.01 THEN
          RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_BALANCE_EXCEEDED:%', v_line.id
            USING ERRCODE = '23514';
        END IF;
        IF v_remaining_quantity <= 0 OR v_remaining_base <= 0 THEN
          RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_BALANCE_EXCEEDED:%', v_line.id
            USING ERRCODE = '23514';
        END IF;
        v_expected_base := round(
          v_remaining_base * v_input_quantity / v_remaining_quantity, 2
        );
        IF v_codigo = '1' AND abs(v_input_base - v_expected_base) > 0.01 THEN
          RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_AMOUNT_MISMATCH:%', v_line.id
            USING ERRCODE = '23514';
        ELSIF v_codigo = '4' AND v_input_base - v_expected_base > 0.01 THEN
          RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_BALANCE_EXCEEDED:%', v_line.id
            USING ERRCODE = '23514';
        END IF;
        v_expected_igv := round(v_remaining_igv * v_input_base / v_remaining_base, 2);
        v_expected_isc := round(v_remaining_isc * v_input_base / v_remaining_base, 2);
      ELSE
        IF v_input_quantity - v_line.cantidad > 0.000001 THEN
          RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_QUANTITY_INVALID:%', v_line.id
            USING ERRCODE = '23514';
        END IF;
        v_expected_igv := round(v_line.impuesto_igv * v_input_base / v_line.valor_venta, 2);
        v_expected_isc := round(v_line.impuesto_isc * v_input_base / v_line.valor_venta, 2);
      END IF;
      IF abs(v_input_tax - v_expected_igv - v_expected_isc) > 0.01 THEN
        RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_LINE_TAX_MISMATCH:%', v_line.id
          USING ERRCODE = '23514';
      END IF;
      v_line_quantity := v_input_quantity;
      v_line_base := v_input_base;
      v_line_igv := v_expected_igv;
      v_line_isc := v_expected_isc;
    ELSIF v_modo_global THEN
      v_line_quantity := CASE WHEN v_tipo = '91'
        THEN v_remaining_quantity ELSE v_line.cantidad END;
      IF v_tipo = '91' AND v_remaining_total <= 0.01 THEN CONTINUE; END IF;
      IF v_line.rn = v_line.n THEN
        v_line_base := round(v_target_base - v_alloc_base, 2);
        v_line_igv := round(v_target_igv - v_alloc_igv, 2);
        v_line_isc := round(v_target_isc - v_alloc_isc, 2);
      ELSIF v_tipo = '91' THEN
        v_line_base := round(v_remaining_base * v_ratio, 2);
        v_line_igv := round(v_remaining_igv * v_ratio, 2);
        v_line_isc := round(v_remaining_isc * v_ratio, 2);
      ELSE
        v_line_base := round(v_line.valor_venta * v_ratio, 2);
        v_line_igv := round(v_line.impuesto_igv * v_ratio, 2);
        v_line_isc := round(v_line.impuesto_isc * v_ratio, 2);
      END IF;
    ELSE
      RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_REASON_EXACT_REPRESENTATION_UNSUPPORTED'
        USING ERRCODE = '23514';
    END IF;
    v_line_total := round(v_line_base + v_line_igv + v_line_isc, 2);
    v_alloc_base := round(v_alloc_base + v_line_base, 2);
    v_alloc_igv := round(v_alloc_igv + v_line_igv, 2);
    v_alloc_isc := round(v_alloc_isc + v_line_isc, 2);
    IF v_line_total <= 0 OR v_line_quantity <= 0 THEN CONTINUE; END IF;
    IF least(v_line_base, v_line_igv, v_line_isc) < 0 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_LINE_ALLOCATION_INVALID'
        USING ERRCODE = '23514';
    END IF;

    v_order := v_order + 1;
    v_afectacion := coalesce(
      nullif(v_line.metadata->>'afectacion_igv', ''),
      CASE WHEN v_line_igv > 0 THEN '10' ELSE '20' END
    );
    IF v_afectacion LIKE '10%' THEN
      v_gravadas := round(v_gravadas + v_line_base, 2);
    ELSIF v_afectacion LIKE '20%' THEN
      v_exoneradas := round(v_exoneradas + v_line_base, 2);
    ELSIF v_afectacion LIKE '40%' THEN
      v_exportacion := round(v_exportacion + v_line_base, 2);
    ELSE
      v_inafectas := round(v_inafectas + v_line_base, 2);
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'orden', v_order,
      'producto_id', v_line.producto_id,
      'codigo_producto', v_line.codigo_producto,
      'descripcion', v_line.descripcion,
      'unidad_medida', coalesce(v_line.unidad_medida, 'NIU'),
      'cantidad', v_line_quantity,
      'precio_unitario', round(v_line_base / nullif(v_line_quantity, 0), 6),
      'valor_venta', v_line_base,
      'impuesto_igv', v_line_igv,
      'impuesto_isc', v_line_isc,
      'total_item', v_line_total,
      'afectacion_igv', v_afectacion,
      'source_document_line_id', v_line.id,
      'codigo_motivo', v_codigo
    ));
    v_cpe_items := v_cpe_items || jsonb_build_array(jsonb_build_object(
      'item', v_order,
      'producto_id', v_line.producto_id,
      'codigo', v_line.codigo_producto,
      'descripcion', v_line.descripcion,
      'unidad_medida', coalesce(v_line.unidad_medida, 'NIU'),
      'cantidad', v_line_quantity,
      'precio_unitario', round(v_line_base / nullif(v_line_quantity, 0), 6),
      'valor_unitario', round(v_line_base / nullif(v_line_quantity, 0), 6),
      'valor_venta', v_line_base,
      'igv', v_line_igv,
      'impuesto_igv', v_line_igv,
      'isc', v_line_isc,
      'impuesto_isc', v_line_isc,
      'total', v_line_total,
      'afectacion_igv', v_afectacion,
      'source_document_line_id', v_line.id,
      'codigo_motivo', v_codigo
    ));
  END LOOP;

  IF v_order < 1
     OR (v_requiere_lineas AND v_order <> jsonb_array_length(v_lineas_canonicas))
     OR abs(v_monto - v_alloc_base - v_alloc_igv - v_alloc_isc) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_FINAL_ALLOCATION_INVALID'
      USING ERRCODE = '23514';
  END IF;
  v_target_base := v_alloc_base;
  v_target_igv := v_alloc_igv;
  v_target_isc := v_alloc_isc;

  v_series := CASE WHEN v_tipo = '91' THEN 'NC01' ELSE 'ND01' END;
  v_number := btrim(public.obtener_siguiente_numero_documento(
    p_tenant_id,
    CASE WHEN v_tipo = '91' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    v_series
  ));
  IF v_number !~ '^[0-9]{1,8}$' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_NUMBER_INVALID' USING ERRCODE = '40001';
  END IF;
  v_number := lpad(v_number, 8, '0');

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, tipo_cambio, subtotal, descuentos, impuesto_igv, impuesto_isc,
    otros_impuestos, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, emisor_ruc, emisor_razon_social,
    emisor_direccion, receptor_tipo_doc, receptor_numero_doc,
    receptor_documento, receptor_razon_social, receptor_nombre,
    receptor_direccion, pedido_id, cliente_id, metodo_pago, estado,
    estado_sunat, observaciones, created_by, updated_by, documento_origen_id,
    idempotency_key, intent_fingerprint, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id,
    CASE WHEN v_tipo = '91' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    v_series, v_number, clock_timestamp(),
    (app.hoy_tenant(p_tenant_id) + 30)::timestamptz,
    upper(coalesce(v_origin.moneda, 'COP')),
    coalesce(nullif(v_origin.tipo_cambio, 0), 1),
    v_target_base, 0, v_target_igv, v_target_isc, 0, v_monto,
    v_gravadas, v_exoneradas, v_inafectas, v_exportacion,
    v_issuer_snapshot->>'tax_id', v_issuer_snapshot->>'legal_name',
    v_issuer_snapshot->>'address',
    v_origin.receptor_tipo_doc,
    coalesce(v_origin.receptor_numero_doc, v_origin.receptor_documento),
    coalesce(v_origin.receptor_documento, v_origin.receptor_numero_doc),
    coalesce(v_origin.receptor_razon_social, v_origin.receptor_nombre),
    coalesce(v_origin.receptor_nombre, v_origin.receptor_razon_social),
    v_origin.receptor_direccion, v_origin.pedido_id, v_origin.cliente_id,
    CASE WHEN v_tipo = '91' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    'EMITIDO', 'PENDIENTE', v_motivo, p_actor_id, p_actor_id,
    v_origin.id, format('nota-ref-doc:%s:%s', p_tenant_id, v_key),
    v_fingerprint,
    jsonb_build_object(
      'source_document_id', v_origin.id,
      'source_cpe_id', v_origin_cpe.id,
      'source_dian_prefijo_autorizado', v_source_prefix,
      'source_numero_fiscal', v_source_number_exact,
      'issuer_snapshot', v_issuer_snapshot,
      'dian_note_issuer_contract_version', 529,
      'dian_direccion_emisor', v_issuer_snapshot->>'address',
      'dian_municipio_emisor', v_issuer_snapshot->>'municipality',
      'dian_departamento_emisor', v_issuer_snapshot->>'department',
      'dian_codigo_dane_emisor', v_issuer_snapshot->>'municipality_code',
      'dian_codigo_departamento_emisor', v_issuer_snapshot->>'department_code',
      'dian_regimen_fiscal', v_issuer_snapshot->>'tax_regime',
      'dian_tipo_contribuyente', v_issuer_snapshot->>'contributor_type',
      'dian_is_demo', false,
      'codigo_motivo', v_codigo,
      'motivo_nota', v_motivo,
      'line_allocation_mode', CASE
        WHEN v_anulacion_total THEN 'EXACT_REMAINING_LINES'
        WHEN v_requiere_lineas THEN 'EXPLICIT_SOURCE_LINES'
        ELSE 'EXPLICIT_GLOBAL_PRORATION' END,
      'emission_fingerprint', v_fingerprint,
      'idempotency_key', v_key,
      'inventory_effect', 'NONE',
      'atomic_rpc', 'crear_nota_referenciada_tx',
      'fiscal_country', 'CO',
      'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
      'financial_effect_contract_version', 529
    ), now(), now()
  ) RETURNING * INTO v_note;

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata,
    created_at, updated_at
  )
  SELECT p_tenant_id, v_note.id, (e->>'orden')::integer,
    nullif(e->>'producto_id', '')::uuid, e->>'codigo_producto',
    e->>'descripcion', e->>'unidad_medida', (e->>'cantidad')::numeric,
    (e->>'precio_unitario')::numeric, 0, (e->>'valor_venta')::numeric,
    (e->>'impuesto_igv')::numeric, (e->>'impuesto_isc')::numeric,
    (e->>'total_item')::numeric,
    jsonb_build_object(
      'afectacion_igv', e->>'afectacion_igv',
      'source_document_line_id', e->>'source_document_line_id',
      'codigo_motivo', e->>'codigo_motivo',
      'inventory_effect', 'NONE',
      'emission_fingerprint', v_fingerprint
    ), now(), now()
  FROM jsonb_array_elements(v_details) e;

  INSERT INTO public.cpe (
    tenant_id, documento_id, documento_referencia_id, tipo_documento,
    serie, numero, numero_comprobante, ruc_emisor, razon_social_emisor,
    direccion_emisor, tipo_documento_receptor, documento_receptor,
    razon_social_receptor, direccion_receptor, cliente_id, moneda,
    total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
    total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
    idempotency_key, event_id, estado, estado_sunat, sunat_status,
    created_by, activo, documento_referencia_tipo,
    documento_referencia_serie, documento_referencia_numero,
    tipo_nota_credito, tipo_nota_debito, motivo_nota, metadata,
    issuer_snapshot,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, v_note.id, v_origin.id, v_tipo, v_series, v_number,
    v_number::integer, v_issuer_snapshot->>'tax_id',
    v_issuer_snapshot->>'legal_name', v_issuer_snapshot->>'address',
    v_origin_cpe.tipo_documento_receptor,
    v_origin_cpe.documento_receptor, v_origin_cpe.razon_social_receptor,
    v_origin_cpe.direccion_receptor, v_origin.cliente_id,
    upper(coalesce(v_origin.moneda, 'COP')), v_gravadas, v_exoneradas,
    v_inafectas, v_exportacion, v_target_igv, v_monto, v_monto, v_cpe_items,
    clock_timestamp(), app.hoy_tenant(p_tenant_id) + 30,
    format('nota-ref-cpe:%s:%s', p_tenant_id, v_key), v_event_id,
    'BORRADOR', 'PENDIENTE', 'NOT_SENT', p_actor_id, true,
    '01', v_source_prefix, v_source_number_exact,
    CASE WHEN v_tipo = '91' THEN v_codigo ELSE NULL END,
    CASE WHEN v_tipo = '92' THEN v_codigo ELSE NULL END,
    v_motivo,
    jsonb_build_object(
      'source_document_id', v_origin.id,
      'source_cpe_id', v_origin_cpe.id,
      'source_dian_prefijo_autorizado', v_source_prefix,
      'source_numero_fiscal', v_source_number_exact,
      'issuer_snapshot', v_issuer_snapshot,
      'dian_note_issuer_contract_version', 529,
      'dian_direccion_emisor', v_issuer_snapshot->>'address',
      'dian_municipio_emisor', v_issuer_snapshot->>'municipality',
      'dian_departamento_emisor', v_issuer_snapshot->>'department',
      'dian_codigo_dane_emisor', v_issuer_snapshot->>'municipality_code',
      'dian_codigo_departamento_emisor', v_issuer_snapshot->>'department_code',
      'dian_regimen_fiscal', v_issuer_snapshot->>'tax_regime',
      'dian_tipo_contribuyente', v_issuer_snapshot->>'contributor_type',
      'dian_is_demo', false,
      'codigo_motivo', v_codigo,
      'motivo_nota', v_motivo,
      'line_allocation_mode', CASE
        WHEN v_anulacion_total THEN 'EXACT_REMAINING_LINES'
        WHEN v_requiere_lineas THEN 'EXPLICIT_SOURCE_LINES'
        ELSE 'EXPLICIT_GLOBAL_PRORATION' END,
      'emission_fingerprint', v_fingerprint,
      'inventory_effect', 'NONE',
      'atomic_rpc', 'crear_nota_referenciada_tx',
      'legal_transmission_status', 'PENDING_CUSTOMER_CREDENTIALS_OR_SIGNATURE',
      'fiscal_country', 'CO',
      'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
      'financial_effect_contract_version', 529
    ), v_issuer_snapshot, now(), now()
  ) RETURNING * INTO v_note_cpe;

  v_result := jsonb_build_object(
    'success', true,
    'documento_id', v_note.id,
    'cpe_id', v_note_cpe.id,
    'documento_origen_id', v_origin.id,
    'tipo_documento', v_tipo,
    'serie', v_series,
    'numero', v_number,
    'total', v_monto,
    'estado', 'BORRADOR',
    'requiere_firma', true,
    'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
    'line_allocation_mode', CASE
      WHEN v_anulacion_total THEN 'EXACT_REMAINING_LINES'
      WHEN v_requiere_lineas THEN 'EXPLICIT_SOURCE_LINES'
      ELSE 'EXPLICIT_GLOBAL_PRORATION' END,
    'line_count', v_order,
    'documento_referencia_serie', v_source_prefix,
    'documento_referencia_numero', v_source_number_exact,
    'cxc_id', NULL,
    'cxc_reduction', 0,
    'saldo_favor_id', NULL,
    'saldo_favor', 0,
    'event_id', v_event_id,
    'idempotent', false
  );
  INSERT INTO public.notas_referenciadas_operaciones (
    tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
    documento_origen_id, nota_documento_id, nota_cpe_id, event_id,
    payload, resultado
  ) VALUES (
    p_tenant_id, p_actor_id, 'CREAR', v_key, v_fingerprint,
    v_origin.id, v_note.id, v_note_cpe.id, v_event_id,
    v_canonical, v_result
  );
  RETURN v_result;
END;
$function$;

-- Alias de rollback: PE/AR conservan byte por byte el router de 524. El alias
-- no queda ejecutable por los roles de runtime; sólo el wrapper canónico nuevo.
ALTER FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) RENAME TO crear_nota_referenciada_router_legacy_529;

CREATE OR REPLACE FUNCTION public.crear_nota_referenciada_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_documento_origen_id uuid,
  p_tipo_documento text,
  p_codigo_motivo text,
  p_motivo text,
  p_monto_total numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text;
BEGIN
  SELECT upper(nullif(btrim(ec.pais), ''))
  INTO v_country
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF v_country IS NULL OR v_country NOT IN ('PE', 'AR', 'CO') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_TENANT_COUNTRY_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF v_country = 'CO' THEN
    RETURN app.crear_nota_referenciada_co_529(
      p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
      p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key,
      '[]'::jsonb, false
    );
  END IF;
  -- El router legado conserva la rama AR completa, incluida la llamada a
  -- app.crear_nota_referenciada_ar_524 y su neutralización posterior.
  RETURN public.crear_nota_referenciada_router_legacy_529(
    p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
    p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key
  );
END;
$function$;

-- Contrato ampliado para Colombia. Se conserva la firma de ocho argumentos
-- para PE/AR y para clientes antiguos; en CO esa firma queda deliberadamente
-- limitada a la anulación total, que no admite líneas manuales.
CREATE OR REPLACE FUNCTION public.crear_nota_referenciada_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_documento_origen_id uuid,
  p_tipo_documento text,
  p_codigo_motivo text,
  p_motivo text,
  p_monto_total numeric,
  p_idempotency_key text,
  p_lineas jsonb,
  p_prorrateo_global boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text;
BEGIN
  SELECT upper(nullif(btrim(ec.pais), ''))
  INTO v_country
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF v_country IS NULL OR v_country NOT IN ('PE', 'AR', 'CO') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_TENANT_COUNTRY_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF v_country = 'CO' THEN
    RETURN app.crear_nota_referenciada_co_529(
      p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
      p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key,
      p_lineas, p_prorrateo_global
    );
  END IF;
  IF coalesce(jsonb_array_length(coalesce(p_lineas, '[]'::jsonb)), 0) <> 0
     OR coalesce(p_prorrateo_global, false) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_LINES_ONLY_SUPPORTED_FOR_CO'
      USING ERRCODE = '22023';
  END IF;
  RETURN public.crear_nota_referenciada_tx(
    p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
    p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key
  );
END;
$function$;

-- La firma previa persiste UBL del mismo país/tipo que el CPE. Durante SEND,
-- DianFiscal vuelve a sellar el UBL exacto con el claim, pero este RPC jamás
-- transmite ni acepta una raíz SUNAT bajo un tipo 91/92.
ALTER FUNCTION public.firmar_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, text
) RENAME TO firmar_nota_referenciada_legacy_529;

CREATE OR REPLACE FUNCTION public.firmar_nota_referenciada_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_xml_firmado text,
  p_hash_firma text,
  p_xml_sha256 text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_type text;
  v_mapped_type text;
  v_result jsonb;
BEGIN
  SELECT upper(c.tipo_documento) INTO v_type
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_type NOT IN ('07', '08', '91', '92') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_type IN ('07', '08') THEN
    RETURN public.firmar_nota_referenciada_legacy_529(
      p_tenant_id, p_actor_id, p_cpe_id, p_xml_firmado, p_hash_firma,
      p_xml_sha256, p_idempotency_key
    );
  END IF;

  IF (v_type = '91' AND p_xml_firmado !~
        '<([[:alnum:]_.-]+:)?CreditNote([[:space:]>])')
     OR (v_type = '92' AND p_xml_firmado !~
        '<([[:alnum:]_.-]+:)?DebitNote([[:space:]>])')
     OR p_xml_firmado !~ '<([[:alnum:]_.-]+:)?Signature([[:space:]>])'
     OR strpos(p_xml_firmado, 'http://www.w3.org/2000/09/xmldsig#') = 0 THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SIGNED_XML_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_mapped_type := CASE v_type WHEN '91' THEN '07' ELSE '08' END;
  UPDATE public.cpe
  SET tipo_documento = v_mapped_type
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;

  v_result := public.firmar_nota_referenciada_legacy_529(
    p_tenant_id, p_actor_id, p_cpe_id, p_xml_firmado, p_hash_firma,
    p_xml_sha256, p_idempotency_key
  );

  UPDATE public.cpe
  SET tipo_documento = v_type,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'signature_contract_version', 529,
        'signed_document_type', v_type,
        'legal_transmission_status', 'READY_FOR_DIAN_DELIVERY_PIPELINE'
      ),
      updated_at = now()
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;

  RETURN v_result || jsonb_build_object('tipo_documento', v_type);
END;
$function$;

-- 525 sella el UBL exacto en cpe antes del I/O DIAN. Las notas creadas por
-- 529 también necesitan que documentos conserve ese mismo XML/SHA; el trigger
-- histórico de sincronización sólo cubre 01/03.
ALTER FUNCTION public.sellar_envio_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) RENAME TO sellar_envio_dian_legacy_529;

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
  v_result jsonb;
  v_cpe_id uuid;
  v_document_id uuid;
  v_document_type text;
  v_xml_hash text;
BEGIN
  SELECT o.cpe_id INTO v_cpe_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'SEND';
  IF NOT FOUND OR v_cpe_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;

  -- Mantiene el orden contractual de 525 también en el wrapper: advisory
  -- tenant+ancla antes de cualquier row lock. El helper legacy vuelve a tomar
  -- el mismo advisory de forma reentrante dentro de esta transacción.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_cpe_id::text, 0)
  );

  v_result := public.sellar_envio_dian_legacy_529(
    p_tenant_id, p_operation_id, p_claim_token, p_xml_firmado,
    p_code_kind, p_unique_code, p_authorization, p_issuer_tax_profile
  );

  SELECT c.documento_id, upper(c.tipo_documento), c.hash_firma
  INTO v_document_id, v_document_type, v_xml_hash
  FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_document_type IN ('91', '92') AND v_document_id IS NOT NULL THEN
    IF v_xml_hash !~ '^[0-9a-f]{64}$'
       OR v_xml_hash IS DISTINCT FROM encode(
         extensions.digest(convert_to(p_xml_firmado, 'UTF8'), 'sha256'), 'hex'
       ) THEN
      RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SEALED_SHA_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.documentos d
    SET xml_content = p_xml_firmado,
        codigo_hash = v_xml_hash,
        metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
          'dian_xml_sha256', v_xml_hash,
          'dian_prepared_operation_id', p_operation_id,
          'signed_document_type', v_document_type,
          'delivery_contract_version', 529
        ),
        updated_at = now()
    WHERE d.id = v_document_id AND d.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_DOCUMENT_SYNC_MISSING'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

-- Reutiliza el efecto financiero probado de 494/524 mediante una proyección
-- transaccional no observable. Al finalizar, toda evidencia durable vuelve a
-- 91/92 y el outbox conserva el tipo DIAN canónico.
CREATE OR REPLACE FUNCTION app.aplicar_efecto_nota_dian_529(
  p_tenant_id uuid,
  p_cpe_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_type text;
  v_mapped_type text;
  v_document_id uuid;
  v_result jsonb;
BEGIN
  SELECT upper(c.tipo_documento), c.documento_id
  INTO v_type, v_document_id
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_type NOT IN ('91', '92') THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_ACCEPTANCE_TYPE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_mapped_type := CASE v_type WHEN '91' THEN '07' ELSE '08' END;
  UPDATE public.cpe
  SET tipo_documento = v_mapped_type
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;

  v_result := app.aplicar_efecto_nota_aceptada_494(p_tenant_id, p_cpe_id);

  UPDATE public.cpe
  SET tipo_documento = v_type,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_contract_version', 529,
        'financial_effect_document_type', v_type
      ),
      updated_at = now()
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;
  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_contract_version', 529,
        'financial_effect_document_type', v_type
      ),
      updated_at = now()
  WHERE id = v_document_id AND tenant_id = p_tenant_id;
  UPDATE public.outbox_events
  SET payload = jsonb_set(payload, '{tipoDocumento}', to_jsonb(v_type), true),
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND aggregate_id = v_document_id::text
    AND event_type = CASE WHEN v_type = '91'
      THEN 'nota_credito.emitida' ELSE 'nota_debito.emitida' END;

  RETURN v_result || jsonb_build_object('tipo_documento', v_type);
END;
$function$;

CREATE OR REPLACE FUNCTION app.enforce_nota_fiscal_effect_494()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF upper(coalesce(NEW.tipo_documento, '')) NOT IN ('07', '08', '91', '92') THEN
    RETURN NEW;
  END IF;
  IF upper(NEW.tipo_documento) IN ('91', '92')
     AND NOT EXISTS (
       SELECT 1
       FROM public.notas_referenciadas_operaciones o
       WHERE o.tenant_id = NEW.tenant_id
         AND o.nota_cpe_id = NEW.id
         AND o.tipo_operacion = 'CREAR'
         AND o.payload->>'version' = '529'
         AND coalesce(
           NEW.metadata->>'financial_effect_contract_version', ''
         ) = '529'
      ) THEN
    -- 91/92 también pueden entrar por importación u otros contratos. Sólo el
    -- flujo referenciado 529 posee el efecto CxC que este trigger materializa.
    RETURN NEW;
  END IF;

  IF upper(NEW.estado::text) = 'ACEPTADO'
     AND upper(coalesce(NEW.sunat_status::text, '')) = 'ACCEPTED'
     AND (
       upper(coalesce(OLD.estado::text, '')) <> 'ACEPTADO'
       OR upper(coalesce(OLD.sunat_status::text, '')) <> 'ACCEPTED'
     ) THEN
    IF upper(NEW.tipo_documento) IN ('91', '92') THEN
      PERFORM app.aplicar_efecto_nota_dian_529(NEW.tenant_id, NEW.id);
    ELSE
      PERFORM app.aplicar_efecto_nota_aceptada_494(NEW.tenant_id, NEW.id);
    END IF;
  ELSIF upper(NEW.estado::text) = 'RECHAZADO'
     AND upper(coalesce(OLD.estado::text, '')) <> 'RECHAZADO' THEN
    IF EXISTS (
      SELECT 1 FROM public.notas_referenciadas_operaciones o
      WHERE o.tenant_id = NEW.tenant_id
        AND o.nota_cpe_id = NEW.id
        AND o.tipo_operacion = 'APLICAR_ACEPTACION'
    ) OR EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.tenant_id = NEW.tenant_id
        AND o.aggregate_id = NEW.documento_id::text
        AND o.event_type IN ('nota_credito.emitida', 'nota_debito.emitida')
    ) THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_REJECTION_HAS_FINANCIAL_EFFECT'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.cpe SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT',
        'financial_effect_contract_version', 529
      ), updated_at = now()
    WHERE id = NEW.id AND tenant_id = NEW.tenant_id;
    UPDATE public.documentos SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT',
        'financial_effect_contract_version', 529
      ), updated_at = now()
    WHERE id = NEW.documento_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_nota_fiscal_effect_494 ON public.cpe;
CREATE TRIGGER trg_enforce_nota_fiscal_effect_494
AFTER UPDATE OF estado, estado_sunat, sunat_status, cdr_sunat
ON public.cpe
FOR EACH ROW
WHEN (upper(NEW.tipo_documento) IN ('07', '08', '91', '92'))
EXECUTE FUNCTION app.enforce_nota_fiscal_effect_494();

-- No hay backfill de datos: antes de 529 el endpoint rechazaba 91/92, por lo
-- que inferir que una nota DIAN legacy nació de este flujo sería falso. Los
-- aliases conservados arriba son el rollback seguro del contrato ejecutable.
REVOKE ALL ON FUNCTION app.crear_nota_referenciada_co_529(
  uuid, uuid, uuid, text, text, text, numeric, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.dian_note_issuer_snapshot_529(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.cpe_dian_note_issuer_guard_529()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.aplicar_efecto_nota_dian_529(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_nota_fiscal_effect_494()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_nota_referenciada_router_legacy_529(
  uuid, uuid, uuid, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.firmar_nota_referenciada_legacy_529(
  uuid, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sellar_envio_dian_legacy_529(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.firmar_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sellar_envio_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text, jsonb, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.firmar_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.sellar_envio_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION app.crear_nota_referenciada_co_529(
  uuid, uuid, uuid, text, text, text, numeric, text, jsonb, boolean
) IS 'Crea notas DIAN 91/92 con líneas/saldos fiscales exactos, idempotentes y financieramente neutras hasta aceptación correlacionada.';
COMMENT ON FUNCTION app.dian_note_issuer_snapshot_529(uuid, uuid)
IS 'Congela y verifica el perfil completo y las huellas de certificado/configuración del emisor de una nota DIAN 91/92.';
COMMENT ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) IS 'Router canónico de notas: PE/AR preservan 07/08; Colombia exige y persiste DIAN 91/92.';
COMMENT ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text, jsonb, boolean
) IS 'Router DIAN ampliado: exige líneas origen exactas o confirmación explícita para los únicos motivos globales prorrateables.';
COMMENT ON FUNCTION public.firmar_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, text
) IS 'Persiste idempotentemente UBL firmado del mismo tipo fiscal 07/08/91/92; no transmite a la autoridad.';
COMMENT ON FUNCTION public.sellar_envio_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb
) IS 'Sella el UBL DIAN exacto antes del I/O y sincroniza atómicamente XML/SHA de notas 91/92 entre cpe y documentos.';
COMMENT ON FUNCTION app.aplicar_efecto_nota_dian_529(uuid, uuid)
IS 'Aplica una sola vez el efecto financiero de una nota DIAN 91/92 únicamente tras aceptación fiscal durable.';

COMMIT;

NOTIFY pgrst, 'reload schema';
