-- 524: evidencia terminal ARCA y condición IVA del receptor.
--
-- PE/CO continúan exigiendo CDR para ACCEPTED. Argentina no emite CDR: la
-- evidencia terminal es CAE + vencimiento + punto/tipo/número autorizado.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS empresa_config_arca_punto_venta_check;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT empresa_config_arca_punto_venta_check CHECK (
    arca_punto_venta IS NULL OR arca_punto_venta BETWEEN 1 AND 99998
  );

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS empresa_config_arca_condicion_iva_524_check;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT empresa_config_arca_condicion_iva_524_check CHECK (
    arca_condicion_iva IS NULL OR arca_condicion_iva IN (
      'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'
    )
  );

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS arca_condicion_iva text;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_arca_condicion_iva_524_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_arca_condicion_iva_524_check CHECK (
    arca_condicion_iva IS NULL OR arca_condicion_iva IN (
      'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL',
      'SUJETO_NO_CATEGORIZADO', 'PROVEEDOR_EXTERIOR', 'CLIENTE_EXTERIOR',
      'IVA_LIBERADO', 'MONOTRIBUTISTA_SOCIAL', 'IVA_NO_ALCANZADO',
      'MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO'
    )
  );

-- La hidratación 464 antecede a la condición IVA del receptor y sus clientes
-- demo AR no la traen en el JSON histórico. La envolvemos sin modificar la
-- migración histórica: sólo durante esa hidratación interna, y sólo si el
-- tenant sigue marcado como demo, el writer puede completar una condición
-- determinista (DNI -> consumidor final; CUIT -> responsable inscripto).
-- Una llamada normal al writer continúa fallando si no declara la condición.
DO $rename_demo_hydrator_524$
BEGIN
  IF to_regprocedure(
    'app.hydrate_demo_foundation_464_legacy_524(uuid,uuid,text,bytea,text,timestamp with time zone)'
  ) IS NULL THEN
    ALTER FUNCTION app.hydrate_demo_foundation_464(
      uuid, uuid, text, bytea, text, timestamp with time zone
    ) RENAME TO hydrate_demo_foundation_464_legacy_524;
  END IF;
END
$rename_demo_hydrator_524$;

CREATE OR REPLACE FUNCTION app.hydrate_demo_foundation_464(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_country text,
  p_certificado_pfx bytea DEFAULT NULL,
  p_certificado_password text DEFAULT NULL,
  p_certificado_expira_en timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM pg_catalog.set_config(
    'app.demo_hydration_country_524', upper(btrim(coalesce(p_country, ''))), true
  );
  v_result := app.hydrate_demo_foundation_464_legacy_524(
    p_tenant_id, p_actor_id, p_country,
    p_certificado_pfx, p_certificado_password, p_certificado_expira_en
  );
  PERFORM pg_catalog.set_config('app.demo_hydration_country_524', '', true);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION app.hydrate_demo_foundation_464(
  uuid, uuid, text, bytea, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.hydrate_demo_foundation_464_legacy_524(
  uuid, uuid, text, bytea, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

-- Conserva el writer 459 detrás de una frontera 524. La llamada sigue siendo
-- una sola transacción: cualquier error de la condición IVA revierte también
-- el alta/edición que realizó la implementación anterior.
DO $rename_459$
BEGIN
  IF to_regprocedure('public.crear_cliente_maestro_tx_459(uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.crear_cliente_maestro_tx(uuid, uuid, jsonb)
      RENAME TO crear_cliente_maestro_tx_459;
  END IF;
  IF to_regprocedure('public.actualizar_cliente_maestro_tx_459(uuid,uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.actualizar_cliente_maestro_tx(uuid, uuid, uuid, jsonb)
      RENAME TO actualizar_cliente_maestro_tx_459;
  END IF;
END
$rename_459$;

REVOKE ALL ON FUNCTION public.crear_cliente_maestro_tx_459(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.actualizar_cliente_maestro_tx_459(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crear_cliente_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cliente jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_country text;
  v_is_demo boolean := false;
  v_demo_hydration_country text := upper(nullif(btrim(
    current_setting('app.demo_hydration_country_524', true)
  ), ''));
  v_condition text := upper(nullif(btrim(p_cliente->>'arca_condicion_iva'), ''));
  v_result jsonb;
  v_id uuid;
BEGIN
  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE')), coalesce(ec.is_demo, false)
  INTO v_country, v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  IF v_country = 'AR' AND v_condition IS NULL
     AND v_is_demo AND v_demo_hydration_country = 'AR' THEN
    v_condition := CASE upper(nullif(btrim(p_cliente->>'documento_tipo'), ''))
      WHEN 'DNI' THEN 'CONSUMIDOR_FINAL'
      WHEN 'CUIT' THEN 'RESPONSABLE_INSCRIPTO'
      ELSE NULL
    END;
  END IF;
  -- Compatibilidad DB-first: el runtime anterior a 524 no enviaba este campo.
  -- Se permite persistir NULL durante la ventana de despliegue; el runtime 524
  -- y la frontera ARCA lo exigen antes de intentar una autorización fiscal.
  v_result := public.crear_cliente_maestro_tx_459(p_tenant_id, p_actor_id, p_cliente);
  v_id := (v_result->>'id')::uuid;
  UPDATE public.clientes c
  SET arca_condicion_iva = v_condition,
      updated_at = CASE WHEN c.arca_condicion_iva IS DISTINCT FROM v_condition THEN now() ELSE c.updated_at END
  WHERE c.id = v_id AND c.tenant_id = p_tenant_id;
  RETURN v_result || jsonb_build_object('arca_condicion_iva', v_condition);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_cliente_maestro_tx(
  p_cliente_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_country text;
  v_condition text;
  v_result jsonb;
BEGIN
  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE'))
  INTO v_country FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  SELECT CASE WHEN p_cambios ? 'arca_condicion_iva'
    THEN upper(nullif(btrim(p_cambios->>'arca_condicion_iva'), ''))
    ELSE c.arca_condicion_iva END
  INTO v_condition
  FROM public.clientes c
  WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant_id;
  -- Igual que en el alta, una edición del runtime anterior puede conservar
  -- NULL durante el rollout DB-first. Ningún envío ARCA acepta ese estado.
  v_result := public.actualizar_cliente_maestro_tx_459(
    p_cliente_id, p_tenant_id, p_actor_id, p_cambios
  );
  UPDATE public.clientes c
  SET arca_condicion_iva = v_condition,
      updated_at = CASE WHEN c.arca_condicion_iva IS DISTINCT FROM v_condition THEN now() ELSE c.updated_at END
  WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant_id;
  RETURN v_result || jsonb_build_object('arca_condicion_iva', v_condition);
END;
$function$;

CREATE OR REPLACE FUNCTION app.arca_vat_condition_id_524(p_condition text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT CASE upper(nullif(btrim(coalesce(p_condition, '')), ''))
    WHEN 'RESPONSABLE_INSCRIPTO' THEN 1
    WHEN 'IVA_RESPONSABLE_INSCRIPTO' THEN 1
    WHEN 'EXENTO' THEN 4
    WHEN 'IVA_EXENTO' THEN 4
    WHEN 'CONSUMIDOR_FINAL' THEN 5
    WHEN 'MONOTRIBUTO' THEN 6
    WHEN 'MONOTRIBUTISTA' THEN 6
    WHEN 'RESPONSABLE_MONOTRIBUTO' THEN 6
    WHEN 'SUJETO_NO_CATEGORIZADO' THEN 7
    WHEN 'PROVEEDOR_EXTERIOR' THEN 8
    WHEN 'CLIENTE_EXTERIOR' THEN 9
    WHEN 'IVA_LIBERADO' THEN 10
    WHEN 'MONOTRIBUTISTA_SOCIAL' THEN 13
    WHEN 'IVA_NO_ALCANZADO' THEN 15
    WHEN 'MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO' THEN 16
    ELSE CASE WHEN coalesce(p_condition, '') ~ '^[0-9]{1,2}$'
      THEN p_condition::integer ELSE NULL END
  END
$function$;

CREATE OR REPLACE FUNCTION app.arca_vat_condition_name_524(p_condition text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, app, pg_temp
AS $function$
  SELECT CASE app.arca_vat_condition_id_524(p_condition)
    WHEN 1 THEN 'RESPONSABLE_INSCRIPTO'
    WHEN 4 THEN 'EXENTO'
    WHEN 5 THEN 'CONSUMIDOR_FINAL'
    WHEN 6 THEN 'MONOTRIBUTO'
    WHEN 7 THEN 'SUJETO_NO_CATEGORIZADO'
    WHEN 8 THEN 'PROVEEDOR_EXTERIOR'
    WHEN 9 THEN 'CLIENTE_EXTERIOR'
    WHEN 10 THEN 'IVA_LIBERADO'
    WHEN 13 THEN 'MONOTRIBUTISTA_SOCIAL'
    WHEN 15 THEN 'IVA_NO_ALCANZADO'
    WHEN 16 THEN 'MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO'
    ELSE NULL
  END
$function$;

CREATE OR REPLACE FUNCTION app.arca_expected_cbte_type_524(
  p_document_type text,
  p_issuer_condition text,
  p_receiver_condition text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_type text := upper(nullif(btrim(coalesce(p_document_type, '')), ''));
  v_issuer integer := app.arca_vat_condition_id_524(p_issuer_condition);
  v_receiver integer := app.arca_vat_condition_id_524(p_receiver_condition);
  v_nature text;
  v_explicit integer;
  v_expected integer;
BEGIN
  CASE v_type
    WHEN '01', '03' THEN v_nature := 'FACTURA';
    WHEN '07' THEN v_nature := 'NOTA_CREDITO';
    WHEN '08' THEN v_nature := 'NOTA_DEBITO';
    WHEN '001' THEN v_nature := 'FACTURA'; v_explicit := 1;
    WHEN '002' THEN v_nature := 'NOTA_DEBITO'; v_explicit := 2;
    WHEN '003' THEN v_nature := 'NOTA_CREDITO'; v_explicit := 3;
    WHEN '006' THEN v_nature := 'FACTURA'; v_explicit := 6;
    WHEN '007' THEN v_nature := 'NOTA_DEBITO'; v_explicit := 7;
    WHEN '008' THEN v_nature := 'NOTA_CREDITO'; v_explicit := 8;
    WHEN '011' THEN v_nature := 'FACTURA'; v_explicit := 11;
    WHEN '012' THEN v_nature := 'NOTA_DEBITO'; v_explicit := 12;
    WHEN '013' THEN v_nature := 'NOTA_CREDITO'; v_explicit := 13;
    ELSE
      RAISE EXCEPTION 'ARCA_DOCUMENT_TYPE_NOT_ENABLED:%', v_type USING ERRCODE = '23514';
  END CASE;

  IF v_issuer NOT IN (1, 4, 6) OR v_receiver IS NULL THEN
    RAISE EXCEPTION 'ARCA_VAT_CONDITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_issuer = 1 THEN
    IF v_receiver IN (1, 6, 13, 16) THEN
      v_expected := CASE v_nature WHEN 'FACTURA' THEN 1 WHEN 'NOTA_DEBITO' THEN 2 ELSE 3 END;
    ELSE
      v_expected := CASE v_nature WHEN 'FACTURA' THEN 6 WHEN 'NOTA_DEBITO' THEN 7 ELSE 8 END;
    END IF;
  ELSE
    v_expected := CASE v_nature WHEN 'FACTURA' THEN 11 WHEN 'NOTA_DEBITO' THEN 12 ELSE 13 END;
  END IF;

  IF v_explicit IS NOT NULL AND v_explicit IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'ARCA_DOCUMENT_CLASS_MISMATCH:%:%', v_explicit, v_expected
      USING ERRCODE = '23514';
  END IF;
  RETURN v_expected;
END;
$function$;

CREATE OR REPLACE FUNCTION app.arca_valid_yyyymmdd_524(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_date date;
BEGIN
  IF coalesce(p_value, '') !~ '^[0-9]{8}$' THEN RETURN false; END IF;
  v_date := make_date(
    substring(p_value, 1, 4)::integer,
    substring(p_value, 5, 2)::integer,
    substring(p_value, 7, 2)::integer
  );
  RETURN to_char(v_date, 'YYYYMMDD') = p_value;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cpe_fiscal_acceptance_evidence_524(
  p_tenant_id uuid,
  p_cpe_id uuid,
  p_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_row record;
  v_country text;
  v_cae text;
  v_evidence jsonb;
  v_expected_number text;
  v_expected_type integer;
  v_receiver_id integer;
  v_issuer_condition text;
  v_receiver_condition text;
BEGIN
  SELECT c.*, d.estado_sunat AS document_estado_sunat,
         d.cdr_content AS document_cdr_content,
         d.codigo_hash AS document_hash,
         d.metadata AS document_metadata,
         ec.pais AS tenant_country,
         ec.arca_punto_venta AS configured_point,
         ec.arca_condicion_iva AS issuer_vat_condition,
         cl.arca_condicion_iva AS receiver_vat_condition
  INTO v_row
  FROM public.cpe c
  LEFT JOIN public.documentos d
    ON d.id = coalesce(p_document_id, c.documento_id) AND d.tenant_id = c.tenant_id
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = c.tenant_id
  LEFT JOIN public.clientes cl ON cl.id = c.cliente_id AND cl.tenant_id = c.tenant_id
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id;

  IF NOT FOUND
     OR upper(coalesce(v_row.estado::text, '')) <> 'ACEPTADO'
     OR upper(coalesce(v_row.sunat_status::text, '')) <> 'ACCEPTED'
     OR upper(coalesce(v_row.estado_sunat::text, '')) <> 'ACEPTADO'
     OR (
       p_document_id IS NOT NULL
       AND upper(coalesce(v_row.document_estado_sunat::text, '')) <> 'ACEPTADO'
     ) THEN
    RETURN NULL;
  END IF;

  v_country := upper(coalesce(
    nullif(btrim(v_row.metadata->>'fiscal_country'), ''),
    nullif(btrim(v_row.document_metadata->>'fiscal_country'), ''),
    nullif(btrim(v_row.tenant_country), '')
  ));
  IF v_country = 'AR' THEN
    v_cae := nullif(btrim(v_row.metadata->>'arca_cae'), '');
    v_issuer_condition := app.arca_vat_condition_name_524(
      v_row.metadata->>'arca_condicion_iva_emisor'
    );
    v_receiver_condition := app.arca_vat_condition_name_524(
      v_row.metadata->>'arca_condicion_iva_receptor'
    );
    IF coalesce(v_row.serie, '') !~ '^[0-9]{5}$'
       OR coalesce(v_row.numero, '') !~ '^[0-9]{1,8}$'
       OR v_row.numero::numeric NOT BETWEEN 1 AND 99999999 THEN
      RETURN NULL;
    END IF;
    v_expected_number := lpad(v_row.serie, 5, '0') || '-' || lpad(v_row.numero, 8, '0');
    v_receiver_id := app.arca_vat_condition_id_524(v_receiver_condition);
    BEGIN
      v_expected_type := app.arca_expected_cbte_type_524(
        v_row.tipo_documento, v_issuer_condition, v_receiver_condition
      );
    EXCEPTION WHEN check_violation THEN
      RETURN NULL;
    END;
    IF coalesce(v_row.metadata->>'fiscal_country', '') <> 'AR'
       OR v_cae !~ '^[0-9]{14}$'
       OR v_row.hash IS DISTINCT FROM v_cae
       OR nullif(btrim(coalesce(v_row.cdr_sunat, '')), '') IS NOT NULL
       OR NOT app.arca_valid_yyyymmdd_524(v_row.metadata->>'arca_cae_vencimiento')
       OR coalesce(v_row.metadata->>'arca_punto_venta', '') !~ '^[0-9]{1,5}$'
       OR (v_row.metadata->>'arca_punto_venta')::integer NOT BETWEEN 1 AND 99998
       OR (v_row.metadata->>'arca_punto_venta')::integer IS DISTINCT FROM v_row.serie::integer
       OR coalesce(v_row.metadata->>'arca_cbte_tipo', '') !~ '^[0-9]{1,2}$'
       OR (v_row.metadata->>'arca_cbte_tipo')::integer IS DISTINCT FROM v_expected_type
       OR v_row.metadata->>'arca_cbte_numero' IS DISTINCT FROM lpad(v_row.numero, 8, '0')
       OR v_row.numero_comprobante_sunat IS DISTINCT FROM v_expected_number
       OR coalesce(v_row.metadata->>'arca_condicion_iva_emisor', '') IS DISTINCT FROM v_issuer_condition
       OR coalesce(v_row.metadata->>'arca_condicion_iva_receptor', '') IS DISTINCT FROM v_receiver_condition
       OR coalesce(v_row.metadata->>'arca_condicion_iva_receptor_id', '') !~ '^[0-9]{1,2}$'
       OR (v_row.metadata->>'arca_condicion_iva_receptor_id')::integer IS DISTINCT FROM v_receiver_id THEN
      RETURN NULL;
    END IF;
    IF p_document_id IS NOT NULL AND (
         v_row.document_hash IS DISTINCT FROM v_cae
         OR nullif(btrim(coalesce(v_row.document_cdr_content, '')), '') IS NOT NULL
         OR v_row.document_metadata->>'fiscal_country' IS DISTINCT FROM 'AR'
         OR v_row.document_metadata->>'arca_cae' IS DISTINCT FROM v_cae
         OR v_row.document_metadata->>'arca_punto_venta' IS DISTINCT FROM v_row.metadata->>'arca_punto_venta'
         OR v_row.document_metadata->>'arca_cbte_tipo' IS DISTINCT FROM v_row.metadata->>'arca_cbte_tipo'
         OR v_row.document_metadata->>'arca_cbte_numero' IS DISTINCT FROM v_row.metadata->>'arca_cbte_numero'
       ) THEN
      RETURN NULL;
    END IF;
    v_evidence := jsonb_build_object(
      'country', 'AR', 'kind', 'ARCA_CAE', 'cae', v_cae,
      'expiry', v_row.metadata->>'arca_cae_vencimiento',
      'point', (v_row.metadata->>'arca_punto_venta')::integer,
      'type', (v_row.metadata->>'arca_cbte_tipo')::integer,
      'number', v_row.metadata->>'arca_cbte_numero'
    );
  ELSIF v_country IN ('PE', 'CO') THEN
    IF nullif(btrim(coalesce(v_row.cdr_sunat, '')), '') IS NULL
       OR (
         p_document_id IS NOT NULL
         AND v_row.document_cdr_content IS DISTINCT FROM v_row.cdr_sunat
       ) THEN
      RETURN NULL;
    END IF;
    v_evidence := jsonb_build_object(
      'country', v_country, 'kind', 'CDR',
      'sha256', encode(extensions.digest(convert_to(v_row.cdr_sunat, 'UTF8'), 'sha256'), 'hex')
    );
  ELSE
    RETURN NULL;
  END IF;

  RETURN v_evidence || jsonb_build_object(
    'sha256', app.cpe_fingerprint_476(v_evidence)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.crear_nota_referenciada_ar_524(
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
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
  v_codigo text := btrim(coalesce(p_codigo_motivo, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_monto numeric(14,2) := round(coalesce(p_monto_total, 0), 2);
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.notas_referenciadas_operaciones%ROWTYPE;
  v_origen public.documentos%ROWTYPE;
  v_origen_cpe public.cpe%ROWTYPE;
  v_source_evidence jsonb;
  v_country text;
  v_configured_point integer;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_nota_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_nota public.documentos%ROWTYPE;
  v_nota_cpe public.cpe%ROWTYPE;
  v_saldo public.saldos_favor_clientes%ROWTYPE;
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
  v_afectacion text;
  v_order integer := 0;
  v_gravadas numeric(14,2) := 0;
  v_exoneradas numeric(14,2) := 0;
  v_inafectas numeric(14,2) := 0;
  v_exportacion numeric(14,2) := 0;
  v_details jsonb := '[]'::jsonb;
  v_cpe_items jsonb := '[]'::jsonb;
  v_credited numeric(14,2) := 0;
  v_pending numeric(14,2) := 0;
  v_reduction numeric(14,2) := 0;
  v_excess numeric(14,2) := 0;
  v_pending_new numeric(14,2) := 0;
  v_serie text;
  v_numero text;
  v_digits text;
  v_event_id uuid := gen_random_uuid();
  v_event_type text;
  v_event_key text;
  v_tipo_cambio numeric(18,6);
  v_local_base numeric(14,2);
  v_local_igv numeric(14,2);
  v_local_total numeric(14,2);
  v_result jsonb;
BEGIN
  PERFORM app.assert_nota_actor_472(p_tenant_id, p_actor_id);
  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE')), ec.arca_punto_venta
  INTO v_country, v_configured_point
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  IF v_country IS DISTINCT FROM 'AR'
     OR v_configured_point NOT BETWEEN 1 AND 99998 THEN
    RAISE EXCEPTION 'ARCA_REFERENCED_NOTE_CONFIGURATION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF p_documento_origen_id IS NULL
     OR v_tipo NOT IN ('07', '08')
     OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_monto <= 0 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF (v_tipo = '07' AND v_codigo NOT IN ('04','05','08','09','10','11','12','13'))
     OR (v_tipo = '08' AND v_codigo NOT IN ('01','02','03')) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_REASON_NOT_SUPPORTED:%', v_codigo
      USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 1,
    'actor_id', p_actor_id,
    'documento_origen_id', p_documento_origen_id,
    'tipo_documento', v_tipo,
    'codigo_motivo', v_codigo,
    'motivo', v_motivo,
    'monto_total', v_monto
  );
  v_fingerprint := app.nota_fingerprint_472(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-REFERENCIADA:%s', p_tenant_id, v_key), 472));

  SELECT * INTO v_operacion
  FROM public.notas_referenciadas_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'CREAR'
    AND lower(o.idempotency_key) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.actor_id IS DISTINCT FROM p_actor_id
       OR v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-ORIGEN:%s', p_tenant_id, p_documento_origen_id), 472));
  SELECT * INTO v_origen
  FROM public.documentos d
  WHERE d.id = p_documento_origen_id
    AND d.tenant_id = p_tenant_id
    AND d.tipo_documento IN ('FACTURA', 'BOLETA')
  FOR UPDATE;
  IF NOT FOUND
     OR v_origen.cliente_id IS NULL
     OR coalesce(v_origen.total, 0) <= 0
     OR upper(v_origen.estado::text) IN ('BORRADOR','RECHAZADO','ANULADO') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_DOCUMENT_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_origen.cliente_id AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_CUSTOMER_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_origen_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = v_origen.id
    AND upper(c.tipo_documento) IN ('01','03')
  FOR UPDATE;
  IF NOT FOUND
     OR upper(v_origen_cpe.estado::text) IN ('BORRADOR','RECHAZADO','ANULADO','ERROR')
     OR v_origen_cpe.nota_credito_id IS NOT NULL
     OR v_origen_cpe.cliente_id IS DISTINCT FROM v_origen.cliente_id
     OR upper(coalesce(v_origen_cpe.moneda, 'PEN')) IS DISTINCT FROM upper(coalesce(v_origen.moneda, 'PEN')) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_CPE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  v_source_evidence := app.cpe_fiscal_acceptance_evidence_524(
    p_tenant_id, v_origen_cpe.id, v_origen.id
  );
  IF v_source_evidence IS NULL
     OR v_source_evidence->>'country' IS DISTINCT FROM 'AR'
     OR coalesce(v_origen_cpe.serie, '') !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_ARCA_IDENTITY_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF v_origen_cpe.serie::integer IS DISTINCT FROM v_configured_point THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_ARCA_IDENTITY_INVALID'
      USING ERRCODE = '23514';
  END IF;

  -- La nota no debe reconocer una reversa ni un ingreso adicional antes de
  -- que exista el asiento único de la venta origen. La ausencia es reintentable.
  BEGIN
    PERFORM app.validar_contabilidad_origen_anulacion_cpe_448(
      p_tenant_id, v_origen_cpe.id
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ORIGINAL_ACCOUNTING_PENDING_RETRY'
      USING ERRCODE = '40001', DETAIL = SQLERRM;
  END;

  PERFORM 1
  FROM public.documento_detalles dd
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origen.id
  ORDER BY dd.orden, dd.id
  FOR UPDATE;

  SELECT count(*)::integer,
         round(coalesce(sum(dd.valor_venta), 0), 2),
         round(coalesce(sum(dd.impuesto_igv), 0), 2),
         round(coalesce(sum(dd.impuesto_isc), 0), 2),
         round(coalesce(sum(dd.total_item), 0), 2)
  INTO v_source_count, v_source_base, v_source_igv, v_source_isc, v_source_total
  FROM public.documento_detalles dd
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origen.id;

  IF v_source_count < 1 OR v_source_total <= 0
     OR abs(v_source_total - round(coalesce(v_origen.total, 0), 2)) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_LINES_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF v_tipo = '07' THEN
    SELECT round(coalesce(sum(d.total), 0), 2)
    INTO v_credited
    FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id
      AND d.tipo_documento = 'NOTA_CREDITO'
      AND (
        d.documento_origen_id = v_origen.id
        OR d.metadata->>'source_document_id' = v_origen.id::text
      )
      AND upper(d.estado::text) NOT IN ('RECHAZADO','ANULADO');
    IF round(v_credited + v_monto, 2) - v_source_total > 0.01 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_EXCEEDS_SOURCE_BALANCE: available=% requested=%',
        round(v_source_total - v_credited, 2), v_monto
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_ratio := v_monto / v_source_total;
  v_target_base := round(v_source_base * v_ratio, 2);
  v_target_igv := round(v_source_igv * v_ratio, 2);
  v_target_isc := round(v_source_isc * v_ratio, 2);
  v_target_base := round(v_target_base + (v_monto - v_target_base - v_target_igv - v_target_isc), 2);
  IF least(v_target_base, v_target_igv, v_target_isc) < 0
     OR abs(v_monto - v_target_base - v_target_igv - v_target_isc) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ALLOCATION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT dd.*,
      row_number() OVER (ORDER BY dd.orden, dd.id) AS rn,
      count(*) OVER () AS n
    FROM public.documento_detalles dd
    WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origen.id
    ORDER BY dd.orden, dd.id
  LOOP
    IF v_line.rn = v_line.n THEN
      v_line_base := round(v_target_base - v_alloc_base, 2);
      v_line_igv := round(v_target_igv - v_alloc_igv, 2);
      v_line_isc := round(v_target_isc - v_alloc_isc, 2);
    ELSE
      v_line_base := round(coalesce(v_line.valor_venta, 0) * v_ratio, 2);
      v_line_igv := round(coalesce(v_line.impuesto_igv, 0) * v_ratio, 2);
      v_line_isc := round(coalesce(v_line.impuesto_isc, 0) * v_ratio, 2);
    END IF;
    v_line_total := round(v_line_base + v_line_igv + v_line_isc, 2);
    v_alloc_base := round(v_alloc_base + v_line_base, 2);
    v_alloc_igv := round(v_alloc_igv + v_line_igv, 2);
    v_alloc_isc := round(v_alloc_isc + v_line_isc, 2);
    IF v_line_total <= 0 THEN CONTINUE; END IF;
    IF least(v_line_base, v_line_igv, v_line_isc) < 0 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_LINE_ALLOCATION_INVALID'
        USING ERRCODE = '23514';
    END IF;

    v_order := v_order + 1;
    v_afectacion := coalesce(nullif(v_line.metadata->>'afectacion_igv', ''),
      CASE WHEN v_line_igv > 0 THEN '10' ELSE '20' END);
    IF v_afectacion LIKE '10%' THEN v_gravadas := round(v_gravadas + v_line_base, 2);
    ELSIF v_afectacion LIKE '20%' THEN v_exoneradas := round(v_exoneradas + v_line_base, 2);
    ELSIF v_afectacion LIKE '40%' THEN v_exportacion := round(v_exportacion + v_line_base, 2);
    ELSE v_inafectas := round(v_inafectas + v_line_base, 2);
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'orden', v_order,
      'producto_id', v_line.producto_id,
      'codigo_producto', v_line.codigo_producto,
      'descripcion', v_line.descripcion,
      'unidad_medida', coalesce(v_line.unidad_medida, 'NIU'),
      'cantidad', v_line.cantidad,
      'precio_unitario', round(v_line_base / nullif(v_line.cantidad, 0), 6),
      'valor_venta', v_line_base,
      'impuesto_igv', v_line_igv,
      'impuesto_isc', v_line_isc,
      'total_item', v_line_total,
      'afectacion_igv', v_afectacion,
      'source_document_line_id', v_line.id
    ));
    v_cpe_items := v_cpe_items || jsonb_build_array(jsonb_build_object(
      'item', v_order,
      'producto_id', v_line.producto_id,
      'codigo', v_line.codigo_producto,
      'descripcion', v_line.descripcion,
      'unidad_medida', coalesce(v_line.unidad_medida, 'NIU'),
      'cantidad', v_line.cantidad,
      'precio_unitario', round(v_line_base / nullif(v_line.cantidad, 0), 6),
      'valor_unitario', round(v_line_base / nullif(v_line.cantidad, 0), 6),
      'valor_venta', v_line_base,
      'igv', v_line_igv,
      'impuesto_igv', v_line_igv,
      'isc', v_line_isc,
      'impuesto_isc', v_line_isc,
      'total', v_line_total,
      'afectacion_igv', v_afectacion
    ));
  END LOOP;

  IF v_order < 1 OR abs(v_monto - v_alloc_base - v_alloc_igv - v_alloc_isc) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_FINAL_ALLOCATION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  -- ARCA numera por tipo de comprobante y punto de venta. La serie durable
  -- nunca se degrada al alias peruano FC/BC/FD/BD.
  v_serie := lpad(v_configured_point::text, 5, '0');
  v_numero := btrim(public.obtener_siguiente_numero_documento(
    p_tenant_id,
    CASE WHEN v_tipo = '07' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    v_serie
  ));
  IF v_numero !~ '^[0-9]{1,8}$' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_NUMBER_INVALID' USING ERRCODE = '40001';
  END IF;
  v_numero := lpad(v_numero, 8, '0');

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
    CASE WHEN v_tipo = '07' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    v_serie, v_numero, clock_timestamp(),
    (app.hoy_tenant(p_tenant_id) + 30)::timestamptz,
    upper(coalesce(v_origen.moneda, 'PEN')),
    coalesce(nullif(v_origen.tipo_cambio, 0), 1),
    v_target_base, 0, v_target_igv, v_target_isc, 0, v_monto,
    v_gravadas, v_exoneradas, v_inafectas, v_exportacion,
    v_origen.emisor_ruc, v_origen.emisor_razon_social, v_origen.emisor_direccion,
    v_origen.receptor_tipo_doc,
    coalesce(v_origen.receptor_numero_doc, v_origen.receptor_documento),
    coalesce(v_origen.receptor_documento, v_origen.receptor_numero_doc),
    coalesce(v_origen.receptor_razon_social, v_origen.receptor_nombre),
    coalesce(v_origen.receptor_nombre, v_origen.receptor_razon_social),
    v_origen.receptor_direccion, v_origen.pedido_id, v_origen.cliente_id,
    CASE WHEN v_tipo = '07' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    'EMITIDO', 'PENDIENTE', v_motivo, p_actor_id, p_actor_id,
    v_origen.id, format('nota-ref-doc:%s:%s', p_tenant_id, v_key),
    v_fingerprint,
    jsonb_build_object(
      'source_document_id', v_origen.id,
      'source_cpe_id', v_origen_cpe.id,
      'codigo_motivo', v_codigo,
      'motivo_nota', v_motivo,
      'emission_fingerprint', v_fingerprint,
      'idempotency_key', v_key,
      'inventory_effect', 'NONE',
      'atomic_rpc', 'crear_nota_referenciada_tx',
      'fiscal_country', 'AR',
      'arca_punto_venta', v_configured_point,
      'arca_condicion_iva_emisor', v_origen_cpe.metadata->>'arca_condicion_iva_emisor',
      'arca_condicion_iva_receptor', v_origen_cpe.metadata->>'arca_condicion_iva_receptor'
    ), now(), now()
  ) RETURNING * INTO v_nota;

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata,
    created_at, updated_at
  )
  SELECT p_tenant_id, v_nota.id, (e->>'orden')::integer,
    nullif(e->>'producto_id', '')::uuid, e->>'codigo_producto',
    e->>'descripcion', e->>'unidad_medida', (e->>'cantidad')::numeric,
    (e->>'precio_unitario')::numeric, 0, (e->>'valor_venta')::numeric,
    (e->>'impuesto_igv')::numeric, (e->>'impuesto_isc')::numeric,
    (e->>'total_item')::numeric,
    jsonb_build_object(
      'afectacion_igv', e->>'afectacion_igv',
      'source_document_line_id', e->>'source_document_line_id',
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
    created_at, updated_at
  ) VALUES (
    p_tenant_id, v_nota.id, v_origen.id, v_tipo, v_serie, v_numero,
    v_numero::integer, v_origen_cpe.ruc_emisor, v_origen_cpe.razon_social_emisor,
    v_origen_cpe.direccion_emisor, v_origen_cpe.tipo_documento_receptor,
    v_origen_cpe.documento_receptor, v_origen_cpe.razon_social_receptor,
    v_origen_cpe.direccion_receptor, v_origen.cliente_id,
    upper(coalesce(v_origen.moneda, 'PEN')), v_gravadas, v_exoneradas,
    v_inafectas, v_exportacion, v_target_igv, v_monto, v_monto, v_cpe_items,
    clock_timestamp(), app.hoy_tenant(p_tenant_id) + 30,
    format('nota-ref-cpe:%s:%s', p_tenant_id, v_key), v_event_id,
    'BORRADOR', 'PENDIENTE', 'NOT_SENT', p_actor_id, true,
    upper(v_origen_cpe.tipo_documento), upper(v_origen_cpe.serie),
    lpad(btrim(v_origen_cpe.numero), 8, '0'),
    CASE WHEN v_tipo = '07' THEN v_codigo ELSE NULL END,
    CASE WHEN v_tipo = '08' THEN v_codigo ELSE NULL END,
    v_motivo,
    jsonb_build_object(
      'source_document_id', v_origen.id,
      'source_cpe_id', v_origen_cpe.id,
      'codigo_motivo', v_codigo,
      'emission_fingerprint', v_fingerprint,
      'inventory_effect', 'NONE',
      'atomic_rpc', 'crear_nota_referenciada_tx',
      'legal_transmission_status', 'PENDING_CUSTOMER_CREDENTIALS_OR_SIGNATURE',
      'fiscal_country', 'AR',
      'arca_punto_venta', v_configured_point,
      'arca_condicion_iva_emisor', v_origen_cpe.metadata->>'arca_condicion_iva_emisor',
      'arca_condicion_iva_receptor', v_origen_cpe.metadata->>'arca_condicion_iva_receptor'
    ), now(), now()
  ) RETURNING * INTO v_nota_cpe;

  SELECT * INTO v_cxc
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = v_origen.id
    AND lower(c.estado::text) NOT IN ('anulada','revertida')
  FOR UPDATE;

  IF v_tipo = '07' THEN
    v_pending := CASE WHEN v_cxc.id IS NULL THEN 0 ELSE round(coalesce(
      v_cxc.monto_pendiente, v_cxc.saldo_pendiente, v_cxc.saldo, 0), 2) END;
    v_reduction := least(v_monto, v_pending);
    v_excess := round(v_monto - v_reduction, 2);
    v_pending_new := round(v_pending - v_reduction, 2);

    IF v_reduction > 0 THEN
      INSERT INTO public.cxc_pagos (
        tenant_id, cuenta_id, pedido_id, documento_id, tipo, monto, moneda,
        fecha_pago, metodo_pago, referencia, usuario_id, event_id,
        idempotency_key, source, estado, activo, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_cxc.id, v_origen.pedido_id, v_nota.id, 'NOTA_CREDITO',
        v_reduction, upper(coalesce(v_cxc.moneda, v_origen.moneda, 'PEN')),
        app.hoy_tenant(p_tenant_id), 'NOTA_CREDITO', v_serie || '-' || v_numero,
        p_actor_id, v_event_id, format('nota-ref-cxc:%s:%s', p_tenant_id, v_key),
        'cpe.nota_referenciada.atomic', 'ACTIVO', true,
        jsonb_build_object(
          'nota_credito_documento_id', v_nota.id,
          'nota_credito_cpe_id', v_nota_cpe.id,
          'source_document_id', v_origen.id,
          'accountingOwner', 'nota_credito.emitida',
          'request_fingerprint', v_fingerprint
        ), now(), now()
      );
      UPDATE public.cuentas_por_cobrar
      SET monto_pendiente = v_pending_new,
          saldo_pendiente = v_pending_new,
          saldo = v_pending_new,
          estado = CASE WHEN v_pending_new <= 0.009 THEN 'CANCELADO' ELSE 'PARCIAL' END,
          dias_mora = CASE WHEN v_pending_new > 0 THEN greatest(
            app.hoy_tenant(p_tenant_id) - coalesce(fecha_vencimiento, app.hoy_tenant(p_tenant_id)), 0
          ) ELSE 0 END,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'last_credit_note_id', v_nota.id,
            'last_credit_note_amount', v_reduction,
            'last_credit_note_fingerprint', v_fingerprint
          ),
          updated_at = now()
      WHERE id = v_cxc.id AND tenant_id = p_tenant_id
      RETURNING * INTO v_cxc;
    END IF;

    IF v_excess > 0 THEN
      INSERT INTO public.saldos_favor_clientes (
        tenant_id, cliente_id, rma_id, documento_origen_id,
        nota_credito_documento_id, nota_credito_cpe_id, moneda,
        tipo_cambio_origen, monto_original, monto_disponible,
        monto_local_original, monto_local_disponible,
        estado, created_by, metadata
      ) VALUES (
        p_tenant_id, v_origen.cliente_id, NULL, v_origen.id,
        v_nota.id, v_nota_cpe.id, upper(coalesce(v_origen.moneda, 'PEN')),
        coalesce(nullif(v_origen.tipo_cambio, 0), 1), v_excess, v_excess,
        round(v_excess * coalesce(nullif(v_origen.tipo_cambio, 0), 1), 2),
        round(v_excess * coalesce(nullif(v_origen.tipo_cambio, 0), 1), 2),
        'DISPONIBLE', p_actor_id,
        jsonb_build_object(
          'source', 'cpe.nota_referenciada.atomic',
          'fingerprint', v_fingerprint,
          'account_code', '122'
        )
      ) RETURNING * INTO v_saldo;
      INSERT INTO public.saldos_favor_movimientos (
        tenant_id, saldo_favor_id, tipo, monto, actor_id, idempotency_key,
        event_id, metadata
      ) VALUES (
        p_tenant_id, v_saldo.id, 'ORIGEN_NC', v_excess, p_actor_id,
        format('nota-ref-balance:%s:%s', p_tenant_id, v_key), v_event_id,
        jsonb_build_object(
          'nota_credito_documento_id', v_nota.id,
          'nota_credito_cpe_id', v_nota_cpe.id,
          'source_document_id', v_origen.id,
          'request_fingerprint', v_fingerprint
        )
      );
    END IF;
  ELSE
    INSERT INTO public.cuentas_por_cobrar (
      tenant_id, cliente_id, pedido_id, documento_id,
      serie, numero, numero_documento, tipo_documento,
      fecha_emision, fecha_vencimiento, moneda, tipo_cambio_origen,
      monto_total, monto_original, total, monto_pendiente, saldo,
      saldo_pendiente, estado, dias_mora,
      retencion_total, percepcion_total, detraccion_total, anticipo_total,
      event_id, idempotency_key, event_source, activo, metadata,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, v_origen.cliente_id, v_origen.pedido_id, v_nota.id,
      v_serie, v_numero, v_serie || '-' || v_numero, 'NOTA_DEBITO',
      app.hoy_tenant(p_tenant_id), app.hoy_tenant(p_tenant_id) + 30,
      upper(coalesce(v_origen.moneda, 'PEN')),
      coalesce(nullif(v_origen.tipo_cambio, 0), 1),
      v_monto, v_monto, v_monto, v_monto, v_monto, v_monto,
      'PENDIENTE', 0, 0, 0, 0, 0, v_event_id,
      format('nota-ref-debit-cxc:%s:%s', p_tenant_id, v_key),
      'cpe.nota_debito.atomic', true,
      jsonb_build_object(
        'cpe_id', v_nota_cpe.id,
        'source_document_id', v_origen.id,
        'emission_fingerprint', v_fingerprint,
        'atomic_rpc', 'crear_nota_referenciada_tx'
      ), now(), now()
    ) RETURNING * INTO v_nota_cxc;
  END IF;

  v_tipo_cambio := coalesce(nullif(v_origen.tipo_cambio, 0), 1);
  v_local_base := round(v_target_base * v_tipo_cambio, 2);
  v_local_igv := round((v_target_igv + v_target_isc) * v_tipo_cambio, 2);
  v_local_total := round(v_monto * v_tipo_cambio, 2);
  v_event_type := CASE WHEN v_tipo = '07'
    THEN 'nota_credito.emitida' ELSE 'nota_debito.emitida' END;
  v_event_key := format('%s:%s:%s', v_event_type, p_tenant_id, v_nota.id);
  PERFORM app.insert_nota_outbox_472(
    p_tenant_id, v_nota.id, v_event_type, v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key,
      'notaDocumentoId', v_nota.id,
      'cpeId', v_nota_cpe.id,
      'documentoOrigenId', v_origen.id,
      'cpeOrigenId', v_origen_cpe.id,
      'cxcId', CASE WHEN v_tipo = '07' THEN v_cxc.id ELSE v_nota_cxc.id END,
      'saldoFavorId', v_saldo.id,
      'tipoDocumento', v_tipo,
      'codigoMotivo', v_codigo,
      'motivo', v_motivo,
      'serie', v_serie,
      'numero', v_numero,
      'fechaEmision', clock_timestamp(),
      'moneda', upper(coalesce(v_origen.moneda, 'PEN')),
      'tipoCambio', v_tipo_cambio,
      'base_imponible', v_local_base,
      'subtotal', v_local_base,
      'igv', v_local_igv,
      'impuestos', v_local_igv,
      'total', v_local_total,
      'monto_pendiente', CASE WHEN v_tipo = '07'
        THEN round(v_reduction * v_tipo_cambio, 2) ELSE v_local_total END,
      'cxcReduction', round(v_reduction * v_tipo_cambio, 2),
      'customerCreditBalance', round(v_excess * v_tipo_cambio, 2),
      'costo_ventas', 0,
      'inventoryEffect', 'NONE',
      'source', 'cpe.nota_referenciada.atomic',
      'accountingOwner', v_event_type,
      'actorId', p_actor_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'documento_id', v_nota.id,
    'cpe_id', v_nota_cpe.id,
    'documento_origen_id', v_origen.id,
    'tipo_documento', v_tipo,
    'serie', v_serie,
    'numero', v_numero,
    'total', v_monto,
    'estado', 'BORRADOR',
    'requiere_firma', true,
    'cxc_id', CASE WHEN v_tipo = '07' THEN v_cxc.id ELSE v_nota_cxc.id END,
    'cxc_reduction', v_reduction,
    'saldo_favor_id', v_saldo.id,
    'saldo_favor', v_excess,
    'event_id', v_event_id,
    'idempotent', false
  );
  INSERT INTO public.notas_referenciadas_operaciones (
    tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
    documento_origen_id, nota_documento_id, nota_cpe_id, event_id,
    payload, resultado
  ) VALUES (
    p_tenant_id, p_actor_id, 'CREAR', v_key, v_fingerprint,
    v_origen.id, v_nota.id, v_nota_cpe.id, v_event_id,
    v_canonical, v_result
  );
  RETURN v_result;
END;
$function$;

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
  v_result jsonb;
  v_source_cxc jsonb;
  v_note_document_id uuid;
  v_note_cpe_id uuid;
  v_origin_cpe public.cpe%ROWTYPE;
  v_origin_evidence jsonb;
  v_note_event_id uuid;
  v_country text;
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
BEGIN
  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE'))
  INTO v_country
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  v_country := coalesce(v_country, 'PE');

  -- La instantánea permite neutralizar exactamente el comportamiento heredado
  -- de 472 dentro del mismo commit, sin adivinar el estado anterior de CxC.
  SELECT to_jsonb(c) INTO v_source_cxc
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = p_documento_origen_id
    AND lower(c.estado::text) NOT IN ('anulada', 'revertida')
  ORDER BY c.created_at DESC, c.id
  LIMIT 1
  FOR UPDATE;

  IF v_country = 'AR' THEN
    v_result := app.crear_nota_referenciada_ar_524(
      p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
      p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key
    );
  ELSE
    v_result := public.crear_nota_referenciada_legacy_494(
      p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
      p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key
    );
  END IF;

  -- Un retry exacto devuelve el resultado ya neutralizado almacenado por este
  -- wrapper. No vuelve a evaluar un origen cuyo estado pudo cambiar después.
  IF coalesce((v_result->>'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_origin_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = p_documento_origen_id
    AND upper(c.tipo_documento) IN ('01', '03')
  FOR UPDATE;

  v_origin_evidence := CASE WHEN v_origin_cpe.id IS NULL THEN NULL
    ELSE app.cpe_fiscal_acceptance_evidence_524(
      p_tenant_id, v_origin_cpe.id, p_documento_origen_id
    ) END;
  IF v_origin_evidence IS NULL THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_NOT_FISCALLY_ACCEPTED'
      USING ERRCODE = '23514';
  END IF;

  v_note_document_id := nullif(v_result->>'documento_id', '')::uuid;
  v_note_cpe_id := nullif(v_result->>'cpe_id', '')::uuid;
  SELECT event_id INTO v_note_event_id
  FROM public.cpe
  WHERE id = v_note_cpe_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  -- El evento insertado por 472 todavía no es observable fuera de esta
  -- transacción. Se elimina antes de devolver el borrador.
  DELETE FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND o.aggregate_id = v_note_document_id::text
    AND o.event_type IN ('nota_credito.emitida', 'nota_debito.emitida');

  IF v_tipo = '07' THEN
    DELETE FROM public.cxc_pagos p
    WHERE p.tenant_id = p_tenant_id
      AND p.documento_id = v_note_document_id
      AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO';

    DELETE FROM public.saldos_favor_movimientos m
    USING public.saldos_favor_clientes s
    WHERE s.tenant_id = p_tenant_id
      AND s.nota_credito_documento_id = v_note_document_id
      AND m.tenant_id = s.tenant_id
      AND m.saldo_favor_id = s.id;
    DELETE FROM public.saldos_favor_clientes s
    WHERE s.tenant_id = p_tenant_id
      AND s.nota_credito_documento_id = v_note_document_id;

    IF v_source_cxc IS NOT NULL THEN
      UPDATE public.cuentas_por_cobrar c
      SET monto_pendiente = (v_source_cxc->>'monto_pendiente')::numeric,
          saldo_pendiente = (v_source_cxc->>'saldo_pendiente')::numeric,
          saldo = (v_source_cxc->>'saldo')::numeric,
          estado = v_source_cxc->>'estado',
          dias_mora = nullif(v_source_cxc->>'dias_mora', '')::integer,
          metadata = coalesce(v_source_cxc->'metadata', '{}'::jsonb),
          updated_at = coalesce(
            nullif(v_source_cxc->>'updated_at', '')::timestamptz, now()
          )
      WHERE c.id = (v_source_cxc->>'id')::uuid
        AND c.tenant_id = p_tenant_id;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.cxc_pagos p
      JOIN public.cuentas_por_cobrar c ON c.id = p.cuenta_id
      WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_note_document_id
    ) THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_DRAFT_DEBIT_ALREADY_COLLECTED'
        USING ERRCODE = '23514';
    END IF;
    DELETE FROM public.cuentas_por_cobrar c
    WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_note_document_id;
  END IF;

  UPDATE public.cpe
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 524,
        'financial_effect_event_id', v_note_event_id
      ),
      updated_at = now()
  WHERE id = v_note_cpe_id AND tenant_id = p_tenant_id;

  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 524
      ),
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = v_note_document_id AND tenant_id = p_tenant_id;

  v_result := v_result || jsonb_build_object(
    'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
    'cxc_reduction', 0,
    'saldo_favor', 0,
    'saldo_favor_id', NULL,
    'cxc_id', NULL
  );
  UPDATE public.notas_referenciadas_operaciones
  SET resultado = v_result,
      payload = payload || jsonb_build_object(
        'financial_effect_contract_version', 524,
        'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE'
      )
  WHERE tenant_id = p_tenant_id
    AND tipo_operacion = 'CREAR'
    AND nota_cpe_id = v_note_cpe_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.aplicar_efecto_nota_aceptada_494(
  p_tenant_id uuid,
  p_cpe_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_cpe public.cpe%ROWTYPE;
  v_note public.documentos%ROWTYPE;
  v_origin public.documentos%ROWTYPE;
  v_origin_cpe public.cpe%ROWTYPE;
  v_source_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_debit_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_balance public.saldos_favor_clientes%ROWTYPE;
  v_operation public.notas_referenciadas_operaciones%ROWTYPE;
  v_actor uuid;
  v_event_id uuid;
  v_type text;
  v_event_type text;
  v_event_key text;
  v_fingerprint text;
  v_amount numeric(14,2);
  v_pending numeric(14,2) := 0;
  v_reduction numeric(14,2) := 0;
  v_excess numeric(14,2) := 0;
  v_new_pending numeric(14,2) := 0;
  v_previous_accepted numeric(14,2) := 0;
  v_exchange numeric(18,6);
  v_base_local numeric(14,2);
  v_tax_local numeric(14,2);
  v_total_local numeric(14,2);
  v_note_evidence jsonb;
  v_origin_evidence jsonb;
  v_result jsonb;
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-ACEPTADA:%s', p_tenant_id, p_cpe_id), 494
  ));

  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
    AND upper(c.tipo_documento) IN ('07', '08')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTANCE_EVIDENCE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  -- El trigger corre después de actualizar el CPE y antes de actualizar su
  -- documento en la misma transacción. Por eso la nota valida aquí la evidencia
  -- durable del CPE; el UPDATE posterior del documento debe completar o todo
  -- este efecto se revierte atómicamente.
  v_note_evidence := app.cpe_fiscal_acceptance_evidence_524(
    p_tenant_id, p_cpe_id, NULL
  );
  IF v_note_evidence IS NULL THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTANCE_EVIDENCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_note FROM public.documentos d
  WHERE d.id = v_cpe.documento_id AND d.tenant_id = p_tenant_id
  FOR UPDATE;
  SELECT * INTO v_origin FROM public.documentos d
  WHERE d.id = coalesce(v_cpe.documento_referencia_id, v_note.documento_origen_id)
    AND d.tenant_id = p_tenant_id
  FOR UPDATE;
  SELECT * INTO v_origin_cpe FROM public.cpe c
  WHERE c.documento_id = v_origin.id AND c.tenant_id = p_tenant_id
    AND upper(c.tipo_documento) IN ('01', '03')
  FOR UPDATE;

  IF v_note.id IS NULL OR v_origin.id IS NULL OR v_origin_cpe.id IS NULL THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTED_SOURCE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  v_origin_evidence := app.cpe_fiscal_acceptance_evidence_524(
    p_tenant_id, v_origin_cpe.id, v_origin.id
  );
  IF v_origin_evidence IS NULL THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTED_SOURCE_DOCUMENT_INVALID'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-ORIGEN:%s', p_tenant_id, v_origin.id), 494
  ));
  SELECT * INTO v_operation
  FROM public.notas_referenciadas_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'APLICAR_ACEPTACION'
    AND o.nota_cpe_id = p_cpe_id
  FOR UPDATE;
  IF FOUND THEN
    RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT coalesce(o.actor_id, v_cpe.created_by) INTO v_actor
  FROM public.cpe_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.cpe_id = p_cpe_id
    AND o.result_kind = 'ACCEPTED'
  ORDER BY o.completed_at DESC NULLS LAST, o.created_at DESC
  LIMIT 1;
  v_actor := coalesce(v_actor, v_cpe.created_by, v_note.created_by);
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
    WHERE u.id = v_actor AND u.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTANCE_ACTOR_INVALID'
      USING ERRCODE = '42501';
  END IF;

  v_type := upper(v_cpe.tipo_documento);
  v_amount := round(coalesce(v_note.total, v_cpe.total_venta, v_cpe.total, 0), 2);
  v_event_id := coalesce(v_cpe.event_id, gen_random_uuid());
  v_exchange := coalesce(nullif(v_note.tipo_cambio, 0), 1);
  v_fingerprint := app.nota_fingerprint_472(jsonb_build_object(
    'version', 524,
    'tenant_id', p_tenant_id,
    'cpe_id', p_cpe_id,
    'documento_id', v_note.id,
    'documento_origen_id', v_origin.id,
    'tipo_documento', v_type,
    'monto', v_amount,
    'fiscal_evidence_kind', v_note_evidence->>'kind',
    'fiscal_evidence_sha256', v_note_evidence->>'sha256',
    'origin_fiscal_evidence_sha256', v_origin_evidence->>'sha256'
  ));

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTED_AMOUNT_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF v_type = '07' THEN
    SELECT round(coalesce(sum(d.total), 0), 2) INTO v_previous_accepted
    FROM public.documentos d
    JOIN public.cpe c ON c.documento_id = d.id AND c.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant_id
      AND d.tipo_documento = 'NOTA_CREDITO'
      AND d.documento_origen_id = v_origin.id
      AND c.id <> p_cpe_id
      AND upper(c.estado::text) = 'ACEPTADO'
      AND upper(coalesce(c.sunat_status::text, '')) = 'ACCEPTED';
    IF round(v_previous_accepted + v_amount, 2) - round(v_origin.total, 2) > 0.01 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTED_CREDIT_EXCEEDS_SOURCE'
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_source_cxc
    FROM public.cuentas_por_cobrar c
    WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_origin.id
      AND lower(c.estado::text) NOT IN ('anulada', 'revertida')
    ORDER BY c.created_at DESC, c.id
    LIMIT 1 FOR UPDATE;
    v_pending := CASE WHEN v_source_cxc.id IS NULL THEN 0 ELSE round(coalesce(
      v_source_cxc.monto_pendiente, v_source_cxc.saldo_pendiente,
      v_source_cxc.saldo, 0
    ), 2) END;
    v_reduction := least(v_amount, v_pending);
    v_excess := round(v_amount - v_reduction, 2);
    v_new_pending := round(v_pending - v_reduction, 2);

    IF v_reduction > 0 THEN
      INSERT INTO public.cxc_pagos (
        tenant_id, cuenta_id, pedido_id, documento_id, tipo, monto, moneda,
        fecha_pago, metodo_pago, referencia, usuario_id, event_id,
        idempotency_key, source, estado, activo, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_source_cxc.id, v_origin.pedido_id, v_note.id,
        'NOTA_CREDITO', v_reduction,
        upper(coalesce(v_source_cxc.moneda, v_origin.moneda, 'PEN')),
        app.hoy_tenant(p_tenant_id), 'NOTA_CREDITO',
        v_note.serie || '-' || v_note.numero, v_actor, v_event_id,
        format('nota-accepted-cxc:%s:%s', p_tenant_id, p_cpe_id),
        'cpe.nota_referenciada.accepted.494', 'ACTIVO', true,
        jsonb_build_object(
          'nota_credito_documento_id', v_note.id,
          'nota_credito_cpe_id', p_cpe_id,
          'source_document_id', v_origin.id,
          'accountingOwner', 'nota_credito.emitida',
          'acceptance_fingerprint', v_fingerprint
        ), now(), now()
      );
      UPDATE public.cuentas_por_cobrar
      SET monto_pendiente = v_new_pending,
          saldo_pendiente = v_new_pending,
          saldo = v_new_pending,
          estado = CASE WHEN v_new_pending <= 0.009 THEN 'CANCELADO' ELSE 'PARCIAL' END,
          dias_mora = CASE WHEN v_new_pending > 0 THEN greatest(
            app.hoy_tenant(p_tenant_id) - coalesce(
              fecha_vencimiento, app.hoy_tenant(p_tenant_id)
            ), 0
          ) ELSE 0 END,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'last_credit_note_id', v_note.id,
            'last_credit_note_amount', v_reduction,
            'last_credit_note_fingerprint', v_fingerprint,
            'financial_effect_contract_version', 524
          ),
          updated_at = now()
      WHERE id = v_source_cxc.id AND tenant_id = p_tenant_id
      RETURNING * INTO v_source_cxc;
    END IF;

    IF v_excess > 0 THEN
      INSERT INTO public.saldos_favor_clientes (
        tenant_id, cliente_id, rma_id, documento_origen_id,
        nota_credito_documento_id, nota_credito_cpe_id, moneda,
        tipo_cambio_origen, monto_original, monto_disponible,
        monto_local_original, monto_local_disponible, estado, created_by, metadata
      ) VALUES (
        p_tenant_id, v_origin.cliente_id, NULL, v_origin.id,
        v_note.id, p_cpe_id, upper(coalesce(v_origin.moneda, 'PEN')),
        v_exchange, v_excess, v_excess,
        round(v_excess * v_exchange, 2), round(v_excess * v_exchange, 2),
        'DISPONIBLE', v_actor,
        jsonb_build_object(
          'source', 'cpe.nota_referenciada.accepted.494',
          'fingerprint', v_fingerprint, 'account_code', '122'
        )
      ) RETURNING * INTO v_balance;
      INSERT INTO public.saldos_favor_movimientos (
        tenant_id, saldo_favor_id, tipo, monto, actor_id, idempotency_key,
        event_id, metadata
      ) VALUES (
        p_tenant_id, v_balance.id, 'ORIGEN_NC', v_excess, v_actor,
        format('nota-accepted-balance:%s:%s', p_tenant_id, p_cpe_id),
        v_event_id,
        jsonb_build_object(
          'nota_credito_documento_id', v_note.id,
          'nota_credito_cpe_id', p_cpe_id,
          'source_document_id', v_origin.id,
          'acceptance_fingerprint', v_fingerprint
        )
      );
    END IF;
  ELSE
    INSERT INTO public.cuentas_por_cobrar (
      tenant_id, cliente_id, pedido_id, documento_id, serie, numero,
      numero_documento, tipo_documento, fecha_emision, fecha_vencimiento,
      moneda, tipo_cambio_origen, monto_total, monto_original, total,
      monto_pendiente, saldo, saldo_pendiente, estado, dias_mora,
      retencion_total, percepcion_total, detraccion_total, anticipo_total,
      event_id, idempotency_key, event_source, activo, metadata,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, v_origin.cliente_id, v_origin.pedido_id, v_note.id,
      v_note.serie, v_note.numero, v_note.serie || '-' || v_note.numero,
      'NOTA_DEBITO', app.hoy_tenant(p_tenant_id),
      app.hoy_tenant(p_tenant_id) + 30, upper(coalesce(v_origin.moneda, 'PEN')),
      v_exchange, v_amount, v_amount, v_amount, v_amount, v_amount, v_amount,
      'PENDIENTE', 0, 0, 0, 0, 0, v_event_id,
      format('nota-accepted-debit:%s:%s', p_tenant_id, p_cpe_id),
      'cpe.nota_debito.accepted.494', true,
      jsonb_build_object(
        'cpe_id', p_cpe_id, 'source_document_id', v_origin.id,
        'acceptance_fingerprint', v_fingerprint,
        'financial_effect_contract_version', 524
      ), now(), now()
    ) RETURNING * INTO v_debit_cxc;
  END IF;

  v_base_local := round(coalesce(v_note.subtotal, 0) * v_exchange, 2);
  v_tax_local := round((coalesce(v_note.impuesto_igv, 0) +
    coalesce(v_note.impuesto_isc, 0)) * v_exchange, 2);
  v_total_local := round(v_amount * v_exchange, 2);
  v_event_type := CASE WHEN v_type = '07'
    THEN 'nota_credito.emitida' ELSE 'nota_debito.emitida' END;
  v_event_key := format('%s:%s:%s', v_event_type, p_tenant_id, v_note.id);
  PERFORM app.insert_nota_outbox_472(
    p_tenant_id, v_note.id, v_event_type, v_event_id, v_event_key,
    v_fingerprint,
    jsonb_build_object(
      'eventId', v_event_id, 'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key, 'notaDocumentoId', v_note.id,
      'cpeId', p_cpe_id, 'documentoOrigenId', v_origin.id,
      'cpeOrigenId', v_origin_cpe.id,
      'cxcId', CASE WHEN v_type = '07' THEN v_source_cxc.id ELSE v_debit_cxc.id END,
      'saldoFavorId', v_balance.id, 'tipoDocumento', v_type,
      'codigoMotivo', coalesce(v_cpe.tipo_nota_credito, v_cpe.tipo_nota_debito),
      'motivo', v_cpe.motivo_nota, 'serie', v_note.serie,
      'numero', v_note.numero, 'fechaEmision', clock_timestamp(),
      'moneda', upper(coalesce(v_origin.moneda, 'PEN')),
      'tipoCambio', v_exchange, 'base_imponible', v_base_local,
      'subtotal', v_base_local, 'igv', v_tax_local, 'impuestos', v_tax_local,
      'total', v_total_local,
      'monto_pendiente', CASE WHEN v_type = '07'
        THEN round(v_reduction * v_exchange, 2) ELSE v_total_local END,
      'cxcReduction', round(v_reduction * v_exchange, 2),
      'customerCreditBalance', round(v_excess * v_exchange, 2),
      'costo_ventas', 0, 'inventoryEffect', 'NONE',
      'source', 'cpe.nota_referenciada.accepted.494',
      'accountingOwner', v_event_type, 'actorId', v_actor,
      'fiscalAcceptanceRequired', true,
      'fiscalAcceptanceKind', v_note_evidence->>'kind',
      'fiscalAcceptanceSha256', v_note_evidence->>'sha256',
      'fiscalAcceptanceCdrSha256', CASE
        WHEN v_note_evidence->>'kind' = 'CDR' THEN v_note_evidence->>'sha256'
        ELSE NULL
      END
    )
  );

  UPDATE public.cpe
  SET event_id = v_event_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'APPLIED_ON_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 524,
        'financial_effect_fingerprint', v_fingerprint,
        'financial_effect_applied_at', clock_timestamp()
      ),
      updated_at = now()
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;
  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'APPLIED_ON_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 524,
        'financial_effect_fingerprint', v_fingerprint
      ),
      updated_by = v_actor, updated_at = now()
  WHERE id = v_note.id AND tenant_id = p_tenant_id;

  v_result := jsonb_build_object(
    'success', true, 'cpe_id', p_cpe_id, 'documento_id', v_note.id,
    'documento_origen_id', v_origin.id,
    'financial_effect_status', 'APPLIED_ON_FISCAL_ACCEPTANCE',
    'cxc_id', CASE WHEN v_type = '07' THEN v_source_cxc.id ELSE v_debit_cxc.id END,
    'cxc_reduction', v_reduction, 'saldo_favor_id', v_balance.id,
    'saldo_favor', v_excess, 'event_id', v_event_id,
    'idempotent', false
  );
  INSERT INTO public.notas_referenciadas_operaciones (
    tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
    documento_origen_id, nota_documento_id, nota_cpe_id, event_id,
    payload, resultado
  ) VALUES (
    p_tenant_id, v_actor, 'APLICAR_ACEPTACION',
    format('nota-accepted:%s', p_cpe_id), v_fingerprint,
    v_origin.id, v_note.id, p_cpe_id, v_event_id,
    jsonb_build_object(
      'contract_version', 524,
      'fiscal_evidence_kind', v_note_evidence->>'kind',
      'fiscal_evidence_sha256', v_note_evidence->>'sha256',
      'origin_fiscal_evidence_sha256', v_origin_evidence->>'sha256'
    ), v_result
  );
  RETURN v_result;
END;
$function$;


CREATE OR REPLACE FUNCTION app.finalize_cpe_operation_524(
  p_action text,
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_result_kind text,
  p_response_code text,
  p_description text,
  p_cdr text,
  p_external_hash text,
  p_external_number text,
  p_response_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_kind text := upper(btrim(coalesce(p_result_kind, '')));
  v_code text := nullif(btrim(coalesce(p_response_code, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_op public.cpe_operaciones;
  v_cpe public.cpe;
  v_document public.documentos;
  v_cpe_id uuid;
  v_country text;
  v_response_country text;
  v_configured_point integer;
  v_issuer_condition text;
  v_receiver_condition text;
  v_receiver_condition_id integer;
  v_cae text := nullif(btrim(coalesce(p_external_hash, '')), '');
  v_cae_expiry text := nullif(btrim(coalesce(p_response_summary->>'caeVencimiento', '')), '');
  v_point integer;
  v_cbte_type integer;
  v_expected_cbte_type integer;
  v_expected_external_number text;
  v_terminal_fp text;
  v_next_retry timestamptz;
  v_cpe_estado text;
  v_sunat_status text;
  v_estado_sunat text;
  v_document_estado text;
  v_document_sunat text;
  v_arca_evidence jsonb := '{}'::jsonb;
BEGIN
  IF v_action NOT IN ('SEND', 'QUERY')
     OR v_kind NOT IN ('ACCEPTED', 'PENDING', 'TECHNICAL_ERROR', 'REJECTED')
     OR p_claim_token IS NULL OR v_code IS NULL OR v_description IS NULL
     OR jsonb_typeof(coalesce(p_response_summary, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CPE_FINALIZATION_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;

  -- El reservador 476 toma advisory(CPE) -> fila CPE -> operación. Finalizar
  -- conserva exactamente ese orden para que reserva/retry concurrente no forme
  -- un ciclo operación -> advisory contra advisory -> operación.
  SELECT o.cpe_id INTO v_cpe_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id AND o.action = v_action;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cpe:' || lower(v_action) || ':' || v_cpe_id::text, 476)
  );
  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id
    AND o.action = v_action AND o.cpe_id = v_cpe.id
  FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;

  SELECT upper(coalesce(nullif(btrim(ec.pais), ''), 'PE')),
         ec.arca_punto_venta, upper(nullif(btrim(ec.arca_condicion_iva), ''))
  INTO v_country, v_configured_point, v_issuer_condition
  FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  v_country := coalesce(v_country, 'PE');
  v_issuer_condition := app.arca_vat_condition_name_524(v_issuer_condition);
  v_response_country := upper(nullif(btrim(p_response_summary->>'countryCode'), ''));

  -- La huella se conserva byte por byte compatible con 476. Así una operación
  -- ya terminal antes del despliegue sigue siendo idempotente al reintentarse.
  v_terminal_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'result_kind', v_kind, 'response_code', v_code, 'description', v_description,
    'cdr_sha256', CASE WHEN nullif(btrim(coalesce(p_cdr, '')), '') IS NULL THEN NULL
      ELSE encode(extensions.digest(convert_to(p_cdr, 'UTF8'), 'sha256'), 'hex') END,
    'external_hash', v_cae,
    'external_number', nullif(btrim(coalesce(p_external_number, '')), ''),
    'response_summary', coalesce(p_response_summary, '{}'::jsonb)
  ));

  IF v_op.state <> 'CLAIMED' THEN
    IF v_op.terminal_fingerprint IS DISTINCT FROM v_terminal_fp THEN
      RAISE EXCEPTION 'CPE_OPERATION_TERMINAL_COLLISION' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'idempotent', true, 'operation', to_jsonb(v_op), 'cpe', to_jsonb(v_cpe)
    );
  END IF;

  IF v_kind = 'ACCEPTED' THEN
    IF (
         nullif(btrim(v_cpe.metadata->>'fiscal_country'), '') IS NOT NULL
         AND upper(v_cpe.metadata->>'fiscal_country') IS DISTINCT FROM v_country
       ) THEN
      RAISE EXCEPTION 'CPE_ACCEPTANCE_COUNTRY_OR_RESULT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF v_country = 'AR' THEN
      IF v_response_country IS DISTINCT FROM 'AR'
         OR coalesce((p_response_summary->>'success')::boolean, false) IS NOT TRUE
         OR upper(coalesce(p_response_summary->>'resultKind', '')) <> 'ACCEPTED' THEN
        RAISE EXCEPTION 'CPE_ACCEPTANCE_COUNTRY_OR_RESULT_MISMATCH' USING ERRCODE = '23514';
      END IF;
      SELECT upper(nullif(btrim(coalesce(cl.arca_condicion_iva, v_cpe.metadata->>'arca_condicion_iva_receptor')), ''))
      INTO v_receiver_condition
      FROM public.clientes cl
      WHERE cl.id = v_cpe.cliente_id AND cl.tenant_id = p_tenant_id;
      v_receiver_condition := app.arca_vat_condition_name_524(coalesce(
        v_receiver_condition,
        upper(nullif(btrim(v_cpe.metadata->>'arca_condicion_iva_receptor'), ''))
      ));
      v_receiver_condition_id := app.arca_vat_condition_id_524(v_receiver_condition);
      v_expected_cbte_type := app.arca_expected_cbte_type_524(
        v_cpe.tipo_documento, v_issuer_condition, v_receiver_condition
      );
      IF v_cae IS NULL OR v_cae !~ '^[0-9]{14}$'
         OR NOT app.arca_valid_yyyymmdd_524(v_cae_expiry)
         OR coalesce(p_response_summary->>'puntoVenta', '') !~ '^[0-9]{1,5}$'
         OR coalesce(p_response_summary->>'tipoComprobante', '') !~ '^[0-9]{1,2}$'
          OR (
            v_action = 'SEND'
            AND coalesce(p_response_summary->>'condicionIvaReceptorId', '') !~ '^[0-9]{1,2}$'
          )
         OR nullif(btrim(coalesce(p_cdr, '')), '') IS NOT NULL
         OR coalesce(v_cpe.ruc_emisor, '') !~ '^[0-9]{11}$' THEN
        RAISE EXCEPTION 'ARCA_ACCEPTANCE_EVIDENCE_INVALID' USING ERRCODE = '23514';
      END IF;
      IF to_date(v_cae_expiry, 'YYYYMMDD') < v_cpe.fecha_emision::date THEN
        RAISE EXCEPTION 'ARCA_CAE_EXPIRY_PRECEDES_ISSUE_DATE' USING ERRCODE = '23514';
      END IF;
      v_point := (p_response_summary->>'puntoVenta')::integer;
      v_cbte_type := (p_response_summary->>'tipoComprobante')::integer;
      v_expected_external_number := lpad(v_point::text, 5, '0') || '-'
        || lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0');
      IF v_point NOT BETWEEN 1 AND 99998
         OR v_cbte_type IS DISTINCT FROM v_expected_cbte_type
         OR v_configured_point IS DISTINCT FROM v_point
         OR coalesce(v_cpe.serie, '') !~ '^[0-9]{5}$'
         OR v_cpe.serie::integer IS DISTINCT FROM v_point
         OR coalesce(v_cpe.numero, '') !~ '^[0-9]{1,8}$'
         OR v_cpe.numero::numeric NOT BETWEEN 1 AND 99999999
         OR (
           v_action = 'SEND'
           AND upper(coalesce(p_response_summary->>'condicionIvaEmisor', '')) IS DISTINCT FROM v_issuer_condition
         )
         OR (
           v_action = 'SEND'
           AND (p_response_summary->>'condicionIvaReceptorId')::integer IS DISTINCT FROM v_receiver_condition_id
         )
         OR (
           nullif(btrim(v_cpe.metadata->>'arca_punto_venta'), '') IS NOT NULL
           AND (v_cpe.metadata->>'arca_punto_venta')::integer IS DISTINCT FROM v_point
         ) THEN
        RAISE EXCEPTION 'ARCA_AUTHORIZED_IDENTITY_MISMATCH' USING ERRCODE = '23514';
      END IF;
      IF nullif(btrim(coalesce(p_external_number, '')), '') IS DISTINCT FROM v_expected_external_number
         OR nullif(btrim(coalesce(p_response_summary->>'numeroComprobante', '')), '')
           IS DISTINCT FROM v_expected_external_number THEN
        RAISE EXCEPTION 'ARCA_AUTHORIZED_NUMBER_MISMATCH' USING ERRCODE = '23514';
      END IF;
      IF v_action = 'QUERY' AND (
           coalesce(v_op.request_summary->>'tipo_documento', '') IS DISTINCT FROM coalesce(v_cpe.tipo_documento, '')
           OR coalesce(v_op.request_summary->>'serie', '') IS DISTINCT FROM coalesce(v_cpe.serie, '')
           OR coalesce(v_op.request_summary->>'numero', '') IS DISTINCT FROM coalesce(v_cpe.numero, '')
           OR nullif(btrim(v_op.request_summary->>'hash'), '')
             IS DISTINCT FROM nullif(btrim(coalesce(v_cpe.hash_firma, v_cpe.hash, '')), '')
         ) THEN
        RAISE EXCEPTION 'ARCA_QUERY_PRIOR_IDENTITY_INVALID' USING ERRCODE = '23514';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(
        v_cpe.ruc_emisor || ':arca:cae:' || v_cae, 524
      ));
      IF EXISTS (
        SELECT 1 FROM public.cpe other
        WHERE other.id <> v_cpe.id
          AND other.ruc_emisor = v_cpe.ruc_emisor
          AND other.metadata->>'arca_cae' = v_cae
      ) THEN
        RAISE EXCEPTION 'ARCA_CAE_ALREADY_ASSIGNED' USING ERRCODE = '23505';
      END IF;
      v_arca_evidence := jsonb_strip_nulls(jsonb_build_object(
        'arca_cae', v_cae,
        'arca_cae_vencimiento', v_cae_expiry,
        'arca_punto_venta', v_point,
        'arca_cbte_tipo', v_cbte_type,
        'arca_cbte_numero', lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0'),
        'arca_qr_url', nullif(btrim(coalesce(p_response_summary->>'qrUrl', '')), ''),
        'arca_condicion_iva_emisor', v_issuer_condition,
        'arca_condicion_iva_receptor', v_receiver_condition,
        'arca_condicion_iva_receptor_id', v_receiver_condition_id
      ));
    ELSIF v_country IN ('PE', 'CO') THEN
      IF nullif(btrim(coalesce(p_cdr, '')), '') IS NULL THEN
        RAISE EXCEPTION 'CPE_ACCEPTANCE_REQUIRES_CDR' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'CPE_ACCEPTANCE_COUNTRY_NOT_ENABLED:%', v_country USING ERRCODE = '23514';
    END IF;
  END IF;

  CASE v_kind
    WHEN 'ACCEPTED' THEN
      v_cpe_estado := 'ACEPTADO'; v_sunat_status := 'ACCEPTED'; v_estado_sunat := 'ACEPTADO';
      v_document_estado := 'ENVIADO_SUNAT'; v_document_sunat := 'ACEPTADO';
    WHEN 'PENDING' THEN
      v_cpe_estado := 'ENVIADO'; v_sunat_status := 'SENDING'; v_estado_sunat := 'ENVIADO';
      v_document_estado := 'ENVIADO_SUNAT'; v_document_sunat := 'ENVIADO';
    WHEN 'TECHNICAL_ERROR' THEN
      v_cpe_estado := 'ERROR'; v_sunat_status := 'ERROR'; v_estado_sunat := 'ERROR';
      v_document_estado := 'EMITIDO'; v_document_sunat := 'ERROR';
      v_next_retry := now() + make_interval(
        mins => least(60, greatest(1, power(2, least(v_op.attempt, 6))::integer))
      );
    WHEN 'REJECTED' THEN
      v_cpe_estado := 'RECHAZADO'; v_sunat_status := 'REJECTED'; v_estado_sunat := 'RECHAZADO';
      v_document_estado := 'RECHAZADO'; v_document_sunat := 'RECHAZADO';
  END CASE;

  UPDATE public.cpe_operaciones
  SET state = CASE WHEN v_kind = 'TECHNICAL_ERROR' THEN 'TECHNICAL_ERROR' ELSE 'COMPLETED' END,
      result_kind = v_kind, response_code = left(v_code, 100),
      error_message = CASE WHEN v_kind IN ('TECHNICAL_ERROR', 'REJECTED')
        THEN left(v_description, 1000) ELSE NULL END,
      response_summary = coalesce(p_response_summary, '{}'::jsonb),
      terminal_fingerprint = v_terminal_fp, lease_expires_at = NULL,
      next_retry_at = v_next_retry, completed_at = now(), updated_at = now()
  WHERE id = v_op.id
  RETURNING * INTO v_op;

  UPDATE public.cpe
  SET estado = v_cpe_estado, sunat_status = v_sunat_status, estado_sunat = v_estado_sunat,
      cdr_sunat = CASE WHEN v_kind = 'ACCEPTED' AND nullif(btrim(coalesce(p_cdr, '')), '') IS NOT NULL
        THEN p_cdr ELSE cdr_sunat END,
      hash = coalesce(v_cae, hash),
      numero_comprobante_sunat = coalesce(nullif(btrim(p_external_number), ''), numero_comprobante_sunat),
      error_message = CASE WHEN v_kind IN ('TECHNICAL_ERROR', 'REJECTED')
        THEN left(v_code || ': ' || v_description, 1000) ELSE NULL END,
      retry_count = CASE WHEN v_kind = 'TECHNICAL_ERROR'
        THEN greatest(coalesce(retry_count, 0), v_op.attempt) ELSE retry_count END,
      next_retry_at = v_next_retry, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || v_arca_evidence || jsonb_build_object(
        'last_delivery_operation_id', v_op.id, 'last_delivery_result', v_kind,
        'delivery_contract_version', 524, 'fiscal_country', v_country
      )
  WHERE id = v_op.cpe_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cpe;

  IF v_cpe.documento_id IS NOT NULL THEN
    UPDATE public.documentos
    SET estado = v_document_estado, estado_sunat = v_document_sunat,
        cdr_content = CASE WHEN v_kind = 'ACCEPTED' AND nullif(btrim(coalesce(p_cdr, '')), '') IS NOT NULL
          THEN p_cdr ELSE cdr_content END,
        codigo_hash = coalesce(v_cae, codigo_hash),
        error_sunat = CASE WHEN v_kind IN ('TECHNICAL_ERROR', 'REJECTED')
          THEN left(v_code || ': ' || v_description, 1000) ELSE NULL END,
        updated_by = coalesce(v_op.actor_id, updated_by), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || v_arca_evidence || jsonb_build_object(
          'last_cpe_operation_id', v_op.id, 'last_fiscal_result', v_kind,
          'fiscal_contract_version', 524, 'fiscal_country', v_country
        )
    WHERE id = v_cpe.documento_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_document;

    IF v_document.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.documento_auditoria da
      WHERE da.tenant_id = p_tenant_id AND da.documento_id = v_document.id
        AND da.metadata->>'cpe_operation_id' = v_op.id::text
        AND da.accion = 'FINALIZACION_FISCAL'
    ) THEN
      INSERT INTO public.documento_auditoria (
        tenant_id, documento_id, accion, detalles_cambio, usuario_id, metadata,
        created_at, updated_at, timestamp
      ) VALUES (
        p_tenant_id, v_document.id, 'FINALIZACION_FISCAL',
        v_action || ':' || v_kind || ':' || v_code, v_op.actor_id,
        jsonb_build_object('cpe_operation_id', v_op.id, 'contract_version', 524, 'country', v_country),
        now(), now(), now()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false, 'operation', to_jsonb(v_op), 'cpe', to_jsonb(v_cpe),
    'documento', CASE WHEN v_document.id IS NULL THEN NULL ELSE to_jsonb(v_document) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_envio_cpe_tx(
  p_tenant_id uuid, p_operation_id uuid, p_claim_token uuid,
  p_result_kind text, p_response_code text, p_description text,
  p_cdr text DEFAULT NULL, p_external_hash text DEFAULT NULL,
  p_external_number text DEFAULT NULL, p_response_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.finalize_cpe_operation_524(
    'SEND', p_tenant_id, p_operation_id, p_claim_token, p_result_kind,
    p_response_code, p_description, p_cdr, p_external_hash,
    p_external_number, p_response_summary
  )
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_consulta_cpe_tx(
  p_tenant_id uuid, p_operation_id uuid, p_claim_token uuid,
  p_result_kind text, p_response_code text, p_description text,
  p_cdr text DEFAULT NULL, p_external_hash text DEFAULT NULL,
  p_external_number text DEFAULT NULL, p_response_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.finalize_cpe_operation_524(
    'QUERY', p_tenant_id, p_operation_id, p_claim_token, p_result_kind,
    p_response_code, p_description, p_cdr, p_external_hash,
    p_external_number, p_response_summary
  )
$function$;

REVOKE ALL ON FUNCTION public.crear_cliente_maestro_tx(uuid, uuid, jsonb),
  public.actualizar_cliente_maestro_tx(uuid, uuid, uuid, jsonb),
  public.crear_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, numeric, text),
  public.finalizar_envio_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  public.finalizar_consulta_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_cliente_maestro_tx(uuid, uuid, jsonb),
  public.actualizar_cliente_maestro_tx(uuid, uuid, uuid, jsonb),
  public.crear_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, numeric, text),
  public.finalizar_envio_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  public.finalizar_consulta_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb)
TO service_role;

REVOKE ALL ON FUNCTION
  app.arca_vat_condition_id_524(text),
  app.arca_vat_condition_name_524(text),
  app.arca_expected_cbte_type_524(text, text, text),
  app.arca_valid_yyyymmdd_524(text),
  app.cpe_fiscal_acceptance_evidence_524(uuid, uuid, uuid),
  app.crear_nota_referenciada_ar_524(uuid, uuid, uuid, text, text, text, numeric, text),
  app.finalize_cpe_operation_524(text, uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  app.aplicar_efecto_nota_aceptada_494(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app.finalize_cpe_operation_524(text, uuid, uuid, uuid, text, text, text, text, text, text, jsonb)
IS 'Finaliza CPE: PE/CO exigen CDR; AR exige CAE y evidencia autorizada sin inventar CDR.';

COMMENT ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) IS 'Crea una NC/ND neutra; el efecto financiero nace sólo con evidencia fiscal durable: CDR PE/CO o CAE AR.';
COMMENT ON FUNCTION app.aplicar_efecto_nota_aceptada_494(uuid, uuid)
IS 'Writer interno idempotente de notas: valida CDR PE/CO o CAE AR antes de crear efectos financieros.';

NOTIFY pgrst, 'reload schema';

COMMIT;
