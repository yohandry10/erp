-- Eventos DIAN/RADIAN 030-034 sobre un CPE colombiano aceptado.
--
-- El contrato separa tres momentos para no duplicar efectos externos:
--   1. reservar: valida tenant, rol legal, secuencia e idempotencia;
--   2. sellar: persiste el ApplicationResponse firmado y su CUDE antes del I/O;
--   3. finalizar: registra el resultado DIAN sin alterar la aceptación del CPE.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

-- Permisos separados del envío comercial ordinario: los eventos del
-- adquirente son responsabilidad de Compras/Contabilidad y el 034 es una
-- declaración fiscal del facturador. VENDEDOR/CAJERO no los reciben. La
-- función se integra al sembrador canónico para cubrir también tenants que se
-- creen después de aplicar esta migración.
CREATE OR REPLACE FUNCTION app.sembrar_permisos_dian_eventos_527(
  p_tenant_id uuid
)
RETURNS TABLE(permisos_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  permisos_seeded := 0;
  role_permissions_seeded := 0;
  -- El sembrador canónico puede ejecutarse dentro del alta del tenant y bajo
  -- contextos FORCE RLS donde una consulta previa no ve todavía la fila. La FK
  -- de `permisos.tenant_id` es la autoridad de existencia; aquí sólo se evita
  -- aceptar NULL. Exigir visibilidad/activo rompía el alta demo transaccional.
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_EVENT_RBAC_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  WITH permission_defs(codigo, modulo, recurso, accion, descripcion) AS (
    VALUES
      ('cpe.dian.facturas_recibidas.ver', 'cpe', 'dian.facturas_recibidas', 'ver',
        'Consultar FEV recibidas y eventos DIAN'),
      ('cpe.dian.facturas_recibidas.gestionar', 'cpe', 'dian.facturas_recibidas', 'gestionar',
        'Importar FEV recibidas y emitir eventos DIAN 030-033'),
      ('cpe.dian.eventos_034.emitir', 'cpe', 'dian.eventos_034', 'emitir',
        'Emitir aceptación tácita DIAN 034 como facturador')
  )
  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  )
  SELECT p_tenant_id, d.modulo, d.recurso, d.accion, d.codigo, d.descripcion, true
  FROM permission_defs d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.tenant_id = p_tenant_id AND lower(p.codigo) = lower(d.codigo)
  );
  GET DIAGNOSTICS permisos_seeded = ROW_COUNT;

  WITH role_permission(nombre, codigo) AS (
    VALUES
      ('ADMIN', 'cpe.dian.facturas_recibidas.ver'),
      ('ADMIN', 'cpe.dian.facturas_recibidas.gestionar'),
      ('ADMIN', 'cpe.dian.eventos_034.emitir'),
      ('CONTADOR', 'cpe.dian.facturas_recibidas.ver'),
      ('CONTADOR', 'cpe.dian.facturas_recibidas.gestionar'),
      ('CONTADOR', 'cpe.dian.eventos_034.emitir'),
      ('COMPRAS', 'cpe.dian.facturas_recibidas.ver'),
      ('COMPRAS', 'cpe.dian.facturas_recibidas.gestionar'),
      ('AUDITOR', 'cpe.dian.facturas_recibidas.ver')
  )
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM role_permission rp
  JOIN public.roles r ON r.tenant_id = p_tenant_id
    AND upper(r.nombre) = rp.nombre AND coalesce(r.activo, true)
  JOIN public.permisos p ON p.tenant_id = p_tenant_id
    AND lower(p.codigo) = lower(rp.codigo)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rol_permisos existing
    WHERE existing.role_id = r.id AND existing.permiso_id = p.id
  );
  GET DIAGNOSTICS role_permissions_seeded = ROW_COUNT;
  RETURN NEXT;
END;
$function$;

DO $wrap_seed$
BEGIN
  IF to_regprocedure('app.seed_operational_rbac_for_tenant_base_527(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
      RENAME TO seed_operational_rbac_for_tenant_base_527;
  END IF;
END;
$wrap_seed$;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid,
  p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
  v_dian record;
BEGIN
  SELECT * INTO v_base
  FROM app.seed_operational_rbac_for_tenant_base_527(
    p_tenant_id, p_source_tenant_id
  );
  SELECT * INTO v_dian
  FROM app.sembrar_permisos_dian_eventos_527(p_tenant_id);
  permisos_seeded := coalesce(v_base.permisos_seeded, 0)
    + coalesce(v_dian.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0)
    + coalesce(v_dian.role_permissions_seeded, 0);
  RETURN NEXT;
END;
$function$;

DO $seed_existing$
DECLARE
  v_tenant_id uuid;
BEGIN
  FOR v_tenant_id IN
    SELECT t.id FROM public.tenants t WHERE coalesce(t.activo, true)
  LOOP
    PERFORM app.sembrar_permisos_dian_eventos_527(v_tenant_id);
  END LOOP;
END;
$seed_existing$;

REVOKE ALL ON FUNCTION app.sembrar_permisos_dian_eventos_527(uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

-- Ambas funciones viven en `app` y sólo son bloques internos de funciones
-- SECURITY DEFINER/operaciones de migración. Exponerlas directamente al rol
-- del API rompería el límite RBAC sellado desde 471.
DO $revoke_internal_seed_chain$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.proname LIKE 'seed_operational_rbac_for_tenant_base_%'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_function
    );
  END LOOP;
END;
$revoke_internal_seed_chain$;

CREATE TABLE IF NOT EXISTS public.dian_fev_recibidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cufe text NOT NULL,
  idempotency_key text NOT NULL,
  import_fingerprint text NOT NULL,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  cuenta_por_pagar_id uuid REFERENCES public.cuentas_por_pagar(id) ON DELETE SET NULL,
  document_id text NOT NULL,
  issue_date date NOT NULL,
  currency_code text NOT NULL,
  payable_amount numeric(18,2) NOT NULL CHECK (payable_amount >= 0),
  issuer_snapshot jsonb NOT NULL,
  receiver_snapshot jsonb NOT NULL,
  invoice_xml text NOT NULL,
  invoice_xml_sha256 text NOT NULL,
  authority_status_snapshot jsonb NOT NULL,
  authority_status_xml text NOT NULL,
  authority_status_xml_sha256 text NOT NULL,
  get_xml_snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'ACCEPTED' CHECK (state = 'ACCEPTED'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_dian_fev_recibidas_tenant_cufe_527 UNIQUE (tenant_id, cufe),
  CONSTRAINT ux_dian_fev_recibidas_tenant_idempotency_527
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_dian_fev_recibidas_cufe_527 CHECK (upper(cufe) ~ '^[0-9A-F]{96}$'),
  CONSTRAINT ck_dian_fev_recibidas_hashes_527 CHECK (
    import_fingerprint ~ '^[0-9a-f]{64}$'
    AND invoice_xml_sha256 ~ '^[0-9a-f]{64}$'
    AND authority_status_xml_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_dian_fev_recibidas_idempotency_527 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 255
  ),
  CONSTRAINT ck_dian_fev_recibidas_snapshots_527 CHECK (
    jsonb_typeof(issuer_snapshot) = 'object'
    AND jsonb_typeof(receiver_snapshot) = 'object'
    AND jsonb_typeof(authority_status_snapshot) = 'object'
    AND jsonb_typeof(get_xml_snapshot) = 'object'
  )
);

ALTER TABLE public.dian_fev_recibidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dian_fev_recibidas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_only_no_direct_access_527 ON public.dian_fev_recibidas;
CREATE POLICY service_only_no_direct_access_527 ON public.dian_fev_recibidas
  FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.dian_fev_recibidas FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app.dian_fev_recibida_immutable_527()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.cufe IS DISTINCT FROM OLD.cufe
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.import_fingerprint IS DISTINCT FROM OLD.import_fingerprint
     OR NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id
     OR NEW.cuenta_por_pagar_id IS DISTINCT FROM OLD.cuenta_por_pagar_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.payable_amount IS DISTINCT FROM OLD.payable_amount
     OR NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot
     OR NEW.receiver_snapshot IS DISTINCT FROM OLD.receiver_snapshot
     OR NEW.invoice_xml IS DISTINCT FROM OLD.invoice_xml
     OR NEW.invoice_xml_sha256 IS DISTINCT FROM OLD.invoice_xml_sha256
     OR NEW.authority_status_snapshot IS DISTINCT FROM OLD.authority_status_snapshot
     OR NEW.authority_status_xml IS DISTINCT FROM OLD.authority_status_xml
     OR NEW.authority_status_xml_sha256 IS DISTINCT FROM OLD.authority_status_xml_sha256
     OR NEW.get_xml_snapshot IS DISTINCT FROM OLD.get_xml_snapshot
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_EVIDENCE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dian_fev_recibida_immutable_527 ON public.dian_fev_recibidas;
CREATE TRIGGER trg_dian_fev_recibida_immutable_527
BEFORE UPDATE ON public.dian_fev_recibidas
FOR EACH ROW EXECUTE FUNCTION app.dian_fev_recibida_immutable_527();

CREATE OR REPLACE FUNCTION public.registrar_fev_recibida_dian_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cufe text,
  p_proveedor_id uuid,
  p_cuenta_por_pagar_id uuid,
  p_idempotency_key text,
  p_invoice_xml text,
  p_invoice_snapshot jsonb,
  p_authority_status_snapshot jsonb,
  p_authority_status_xml text,
  p_get_xml_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_cufe text := upper(btrim(coalesce(p_cufe, '')));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_invoice jsonb := coalesce(p_invoice_snapshot, '{}'::jsonb);
  v_status jsonb := coalesce(p_authority_status_snapshot, '{}'::jsonb);
  v_get_xml jsonb := coalesce(p_get_xml_snapshot, '{}'::jsonb);
  v_config public.empresa_config;
  v_provider public.proveedores;
  v_cxp public.cuentas_por_pagar;
  v_existing public.dian_fev_recibidas;
  v_row public.dian_fev_recibidas;
  v_tenant_nit text;
  v_issuer_nit text;
  v_issuer_dv text;
  v_receiver_nit text;
  v_receiver_dv text;
  v_provider_nit text;
  v_invoice_hash text;
  v_status_hash text;
  v_fingerprint text;
BEGIN
  IF v_cufe !~ '^[0-9A-F]{96}$' OR length(v_key) NOT BETWEEN 8 AND 255
     OR p_proveedor_id IS NULL
     OR jsonb_typeof(v_invoice) <> 'object'
     OR jsonb_typeof(v_status) <> 'object'
     OR jsonb_typeof(v_get_xml) <> 'object'
     OR nullif(btrim(coalesce(p_invoice_xml, '')), '') IS NULL
     OR octet_length(p_invoice_xml) > 8388608
     OR nullif(btrim(coalesce(p_authority_status_xml, '')), '') IS NULL
     OR octet_length(p_authority_status_xml) > 8388608
     OR p_invoice_xml ~ '<!(DOCTYPE|ENTITY)'
     OR p_authority_status_xml ~ '<!(DOCTYPE|ENTITY)' THEN
    RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, 'USER');
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:received:' || v_cufe, 527)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:received:key:' || v_key, 527)
  );

  SELECT * INTO v_config FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  IF NOT FOUND OR upper(coalesce(v_config.pais, '')) <> 'CO'
     OR coalesce(v_config.is_demo, true) OR v_config.dian_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_TENANT_NOT_READY' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_provider FROM public.proveedores p
  WHERE p.id = p_proveedor_id AND p.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_PROVIDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_cuenta_por_pagar_id IS NOT NULL THEN
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar c
    WHERE c.id = p_cuenta_por_pagar_id AND c.tenant_id = p_tenant_id
      AND c.proveedor_id = p_proveedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_CXP_MISMATCH' USING ERRCODE = '23503';
    END IF;
  END IF;

  v_tenant_nit := regexp_replace(coalesce(v_config.ruc, ''), '[^0-9]', '', 'g');
  v_issuer_nit := regexp_replace(coalesce(v_invoice#>>'{issuer,number}', ''), '[^0-9]', '', 'g');
  v_issuer_dv := regexp_replace(coalesce(v_invoice#>>'{issuer,verificationDigit}', ''), '[^0-9]', '', 'g');
  v_receiver_nit := regexp_replace(coalesce(v_invoice#>>'{receiver,number}', ''), '[^0-9]', '', 'g');
  v_receiver_dv := regexp_replace(coalesce(v_invoice#>>'{receiver,verificationDigit}', ''), '[^0-9]', '', 'g');
  v_provider_nit := regexp_replace(coalesce(v_provider.ruc, v_provider.numero_documento::text, ''), '[^0-9]', '', 'g');
  v_invoice_hash := encode(extensions.digest(convert_to(p_invoice_xml, 'UTF8'), 'sha256'), 'hex');
  v_status_hash := encode(extensions.digest(convert_to(p_authority_status_xml, 'UTF8'), 'sha256'), 'hex');

  IF v_tenant_nit = '' OR v_receiver_nit = '' OR v_receiver_dv !~ '^\d$'
     OR v_tenant_nit IS DISTINCT FROM v_receiver_nit || v_receiver_dv
     OR v_issuer_nit = '' OR v_issuer_dv !~ '^\d$'
     OR v_provider_nit IS DISTINCT FROM v_issuer_nit || v_issuer_dv
     OR coalesce(v_invoice#>>'{issuer,type}', '') <> '31'
     OR coalesce(v_invoice#>>'{receiver,type}', '') <> '31'
     OR coalesce(v_invoice->>'documentTypeCode', '') <> '01'
     OR upper(coalesce(v_invoice->>'cufe', '')) IS DISTINCT FROM v_cufe
     OR nullif(btrim(v_invoice->>'documentId'), '') IS NULL
     OR coalesce(v_invoice->>'issueDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
     OR coalesce(v_invoice->>'currencyCode', '') !~ '^[A-Z]{3}$'
     OR coalesce(v_invoice->>'payableAmount', '') !~ '^\d+(\.\d{1,2})?$'
     OR p_invoice_xml !~ '<([[:alnum:]_]+:)?Invoice([[:space:]>])'
     OR position('<ds:Signature' IN p_invoice_xml) = 0
     OR position(v_cufe IN upper(p_invoice_xml)) = 0
     OR lower(coalesce(v_get_xml->>'invoiceXmlSha256', '')) IS DISTINCT FROM v_invoice_hash
     OR lower(coalesce(v_get_xml->>'usable', '')) <> 'true'
     OR lower(coalesce(v_get_xml->>'signatureVerified', '')) <> 'true'
     OR lower(coalesce(v_status->>'success', '')) <> 'true'
     OR lower(coalesce(v_status->>'signatureVerified', '')) <> 'true'
     OR lower(coalesce(v_status->>'authoritySignatureTrusted', '')) <> 'true'
     OR coalesce(v_status->>'statusCode', '') <> '00'
     OR upper(coalesce(v_status->>'documentKey', '')) IS DISTINCT FROM v_cufe
     OR lower(coalesce(v_status->>'authorityXmlSha256', '')) IS DISTINCT FROM v_status_hash
     OR p_authority_status_xml !~ '<([[:alnum:]_]+:)?ApplicationResponse([[:space:]>])'
     OR position('http://www.w3.org/2000/09/xmldsig#' IN p_authority_status_xml) = 0
     OR position('http://www.w3.org/2000/09/xmldsig#' IN p_invoice_xml) = 0
     OR position('<ds:Signature' IN p_authority_status_xml) = 0
     OR position(v_cufe IN upper(p_authority_status_xml)) = 0 THEN
    RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_AUTHORITY_EVIDENCE_INVALID' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := app.cpe_fingerprint_476(jsonb_build_object(
    'tenant_id', p_tenant_id, 'cufe', v_cufe, 'provider_id', p_proveedor_id,
    'cxp_id', p_cuenta_por_pagar_id, 'invoice_hash', v_invoice_hash,
    'status_hash', v_status_hash, 'idempotency_key', v_key
  ));
  SELECT * INTO v_existing FROM public.dian_fev_recibidas r
  WHERE r.tenant_id = p_tenant_id
    AND (r.cufe = v_cufe OR r.idempotency_key = v_key)
  ORDER BY CASE WHEN r.idempotency_key = v_key THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.cufe IS DISTINCT FROM v_cufe
       OR v_existing.idempotency_key IS DISTINCT FROM v_key
       OR v_existing.import_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_IDEMPOTENCY_COLLISION' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('created', false, 'idempotent', true, 'invoice', to_jsonb(v_existing));
  END IF;

  INSERT INTO public.dian_fev_recibidas (
    tenant_id, cufe, idempotency_key, import_fingerprint,
    proveedor_id, cuenta_por_pagar_id,
    document_id, issue_date, currency_code, payable_amount,
    issuer_snapshot, receiver_snapshot, invoice_xml, invoice_xml_sha256,
    authority_status_snapshot, authority_status_xml, authority_status_xml_sha256,
    get_xml_snapshot, created_by
  ) VALUES (
    p_tenant_id, v_cufe, v_key, v_fingerprint,
    p_proveedor_id, p_cuenta_por_pagar_id,
    btrim(v_invoice->>'documentId'), (v_invoice->>'issueDate')::date,
    upper(v_invoice->>'currencyCode'), (v_invoice->>'payableAmount')::numeric,
    v_invoice->'issuer', v_invoice->'receiver', p_invoice_xml, v_invoice_hash,
    v_status, p_authority_status_xml, v_status_hash, v_get_xml, p_actor_id
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, record_id, operation,
    old_values, new_values, changed_fields, metadata, "timestamp"
  ) VALUES (
    p_tenant_id, p_actor_id, 'dian_fev_recibidas', v_row.id::text, 'INSERT', NULL,
    jsonb_build_object('cufe', v_cufe, 'proveedor_id', p_proveedor_id,
      'cuenta_por_pagar_id', p_cuenta_por_pagar_id, 'invoice_xml_sha256', v_invoice_hash),
    jsonb_build_array('cufe', 'proveedor_id', 'invoice_xml_sha256'),
    jsonb_build_object('contract_version', 527, 'authority', 'DIAN'), now()
  );
  RETURN jsonb_build_object('created', true, 'idempotent', false, 'invoice', to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_fev_recibidas_dian_tx(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'DIAN_RECEIVED_INVOICE_LIST_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'cufe', r.cufe,
      'documentId', r.document_id,
      'issueDate', r.issue_date,
      'currencyCode', r.currency_code,
      'payableAmount', r.payable_amount,
      'issuer', r.issuer_snapshot,
      'receiver', r.receiver_snapshot,
      'state', r.state,
      'proveedorId', r.proveedor_id,
      'cuentaPorPagarId', r.cuenta_por_pagar_id,
      'invoiceXmlSha256', r.invoice_xml_sha256,
      'createdAt', r.created_at,
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'operationId', o.id,
          'eventCode', o.request_summary->>'event_code',
          'eventCude', o.request_summary->>'event_cude',
          'state', o.state,
          'resultKind', o.result_kind,
          'responseCode', o.response_code,
          'error', o.error_message,
          'retryAt', o.next_retry_at,
          'canRetry', o.state = 'TECHNICAL_ERROR'
            AND o.result_kind = 'TECHNICAL_ERROR'
            AND coalesce(o.next_retry_at, '-infinity'::timestamptz) <= now(),
          'capabilities', jsonb_build_object(
            'retry', o.state = 'TECHNICAL_ERROR' AND o.result_kind = 'TECHNICAL_ERROR',
            'reconcile', o.state = 'TECHNICAL_ERROR' AND o.result_kind = 'TECHNICAL_ERROR'
              AND nullif(btrim(o.request_summary->>'event_cude'), '') IS NOT NULL
          ),
          'authoritySnapshot', jsonb_strip_nulls(jsonb_build_object(
            'statusCode', o.request_summary#>>'{authority_event_snapshot,statusCode}',
            'documentKey', o.request_summary#>>'{authority_event_snapshot,authorityDocumentKey}',
            'eventCodes', o.request_summary#>'{authority_event_snapshot,eventCodes}',
            'signatureTrusted', o.request_summary#>>'{authority_event_snapshot,authoritySignatureTrusted}',
            'xmlSha256', o.request_summary#>>'{authority_event_snapshot,authorityXmlSha256}'
          )),
          'attempt', o.attempt,
          'createdAt', o.created_at,
          'completedAt', o.completed_at
        ) ORDER BY o.created_at), '[]'::jsonb)
        FROM public.cpe_operaciones o
        WHERE o.tenant_id = p_tenant_id
          AND o.dian_fev_recibida_id = r.id
          AND o.action = 'EVENT'
      )
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT * FROM public.dian_fev_recibidas d
    WHERE d.tenant_id = p_tenant_id
    ORDER BY d.created_at DESC
    LIMIT p_limit
  ) r;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_reintento_evento_dian_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_operation_id uuid,
  p_expected_anchor_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_op public.cpe_operaciones;
  v_kind text := upper(btrim(coalesce(p_expected_anchor_kind, '')));
  v_actual_kind text;
  v_anchor_id uuid;
  v_can_retry boolean;
BEGIN
  IF p_operation_id IS NULL
     OR v_kind NOT IN ('RECEIVED_INVOICE', 'ISSUED_CPE') THEN
    RAISE EXCEPTION 'DIAN_EVENT_RETRY_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, 'USER');

  SELECT coalesce(o.dian_fev_recibida_id, o.cpe_id) INTO v_anchor_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'EVENT';
  IF NOT FOUND OR v_anchor_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_EVENT_RETRY_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_anchor_id::text, 0)
  );
  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'EVENT'
    AND coalesce(o.dian_fev_recibida_id, o.cpe_id) = v_anchor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIAN_EVENT_RETRY_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_actual_kind := CASE WHEN v_op.dian_fev_recibida_id IS NOT NULL
    THEN 'RECEIVED_INVOICE' ELSE 'ISSUED_CPE' END;
  v_anchor_id := coalesce(v_op.dian_fev_recibida_id, v_op.cpe_id);
  IF v_actual_kind IS DISTINCT FROM v_kind OR v_anchor_id IS NULL THEN
    RAISE EXCEPTION 'DIAN_EVENT_RETRY_ANCHOR_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_can_retry := v_op.state = 'TECHNICAL_ERROR'
    AND v_op.result_kind = 'TECHNICAL_ERROR'
    AND coalesce(v_op.next_retry_at, '-infinity'::timestamptz) <= now();
  RETURN jsonb_build_object(
    'operationId', v_op.id,
    'anchorId', v_anchor_id,
    'anchorKind', v_actual_kind,
    'eventCode', v_op.request_summary->>'event_code',
    'idempotencyKey', v_op.idempotency_key,
    'canRetry', v_can_retry,
    'retryAt', v_op.next_retry_at,
    'attempt', v_op.attempt,
    'request', jsonb_strip_nulls(jsonb_build_object(
      'responsiblePerson', v_op.request_summary->'responsible_person',
      'claimReason', v_op.request_summary->'claim_reason',
      'swornConfirmation', v_op.request_summary->'sworn_confirmation'
    ))
  );
END;
$function$;

ALTER TABLE public.cpe_operaciones ALTER COLUMN cpe_id DROP NOT NULL;
ALTER TABLE public.cpe_operaciones
  ADD COLUMN IF NOT EXISTS dian_fev_recibida_id uuid;
ALTER TABLE public.cpe_operaciones
  DROP CONSTRAINT IF EXISTS fk_cpe_operaciones_dian_fev_recibida_527;
ALTER TABLE public.cpe_operaciones
  ADD CONSTRAINT fk_cpe_operaciones_dian_fev_recibida_527
  FOREIGN KEY (dian_fev_recibida_id) REFERENCES public.dian_fev_recibidas(id) ON DELETE CASCADE;

ALTER TABLE public.cpe_operaciones
  DROP CONSTRAINT IF EXISTS ck_cpe_operaciones_action_476;
ALTER TABLE public.cpe_operaciones
  ADD CONSTRAINT ck_cpe_operaciones_action_476
  CHECK (action IN ('SEND', 'QUERY', 'EVENT'));
ALTER TABLE public.cpe_operaciones
  DROP CONSTRAINT IF EXISTS ck_cpe_operaciones_anchor_527;
ALTER TABLE public.cpe_operaciones
  ADD CONSTRAINT ck_cpe_operaciones_anchor_527 CHECK (
    (action IN ('SEND', 'QUERY') AND cpe_id IS NOT NULL AND dian_fev_recibida_id IS NULL)
    OR (action = 'EVENT' AND num_nonnulls(cpe_id, dian_fev_recibida_id) = 1)
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_evento_dian_aceptado_527
  ON public.cpe_operaciones (
    tenant_id,
    cpe_id,
    (upper(request_summary->>'event_code'))
  )
  WHERE action = 'EVENT' AND cpe_id IS NOT NULL
    AND state = 'COMPLETED' AND result_kind = 'ACCEPTED';
CREATE UNIQUE INDEX IF NOT EXISTS ux_fev_recibida_evento_dian_aceptado_527
  ON public.cpe_operaciones (
    tenant_id,
    dian_fev_recibida_id,
    (upper(request_summary->>'event_code'))
  )
  WHERE action = 'EVENT' AND dian_fev_recibida_id IS NOT NULL
    AND state = 'COMPLETED' AND result_kind = 'ACCEPTED';
CREATE UNIQUE INDEX IF NOT EXISTS ux_fev_recibida_evento_dian_activo_527
  ON public.cpe_operaciones (tenant_id, dian_fev_recibida_id, action)
  WHERE action = 'EVENT' AND dian_fev_recibida_id IS NOT NULL AND state = 'CLAIMED';

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
  IF upper(coalesce(NEW.action, '')) NOT IN ('SEND', 'QUERY', 'EVENT')
     OR upper(coalesce(NEW.state, '')) <> 'CLAIMED' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.action, '')) = 'EVENT'
     AND NEW.dian_fev_recibida_id IS NOT NULL THEN
    SELECT 'CO', upper(nullif(btrim(ec.pais), ''))
    INTO v_snapshot_country, v_current_country
    FROM public.dian_fev_recibidas r
    JOIN public.empresa_config ec ON ec.tenant_id = r.tenant_id
    WHERE r.id = NEW.dian_fev_recibida_id AND r.tenant_id = NEW.tenant_id;
  ELSE
    SELECT upper(nullif(btrim(c.issuer_snapshot->>'country_code'), '')),
           upper(nullif(btrim(ec.pais), ''))
    INTO v_snapshot_country, v_current_country
    FROM public.cpe c
    JOIN public.empresa_config ec ON ec.tenant_id = c.tenant_id
    WHERE c.id = NEW.cpe_id AND c.tenant_id = NEW.tenant_id;
  END IF;

  IF v_snapshot_country IS NULL OR v_current_country IS NULL
     OR v_snapshot_country IS DISTINCT FROM v_current_country THEN
    RAISE EXCEPTION 'CPE_FISCAL_COUNTRY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF upper(coalesce(NEW.action, '')) = 'EVENT' AND v_snapshot_country <> 'CO' THEN
    RAISE EXCEPTION 'DIAN_EVENT_CO_CPE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_evento_dian_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_event_code text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_origin text DEFAULT 'USER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_code text := btrim(coalesce(p_event_code, ''));
  v_origin text := upper(btrim(coalesce(p_origin, '')));
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_cpe public.cpe;
  v_received public.dian_fev_recibidas;
  v_is_received boolean := false;
  v_config public.empresa_config;
  v_op public.cpe_operaciones;
  v_prior public.cpe_operaciones;
  v_claim uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_fp text;
  v_tenant_tax_id text;
  v_issuer_tax_id text;
  v_receiver_tax_id text;
  v_description text;
  v_event_id text;
  v_bogota timestamp;
  v_issue_date text;
  v_issue_time text;
  v_reference_id text;
  v_party_role text;
  v_request jsonb;
  v_package_year integer;
  v_package_sequence bigint;
BEGIN
  IF v_code NOT IN ('030', '031', '032', '033', '034')
     OR length(coalesce(v_key, '')) NOT BETWEEN 8 AND 255
     OR jsonb_typeof(v_payload) <> 'object'
     OR v_origin NOT IN ('USER', 'WORKER', 'SYSTEM') THEN
    RAISE EXCEPTION 'DIAN_EVENT_REQUEST_INVALID' USING ERRCODE = '22023';
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
    SELECT * INTO v_received
    FROM public.dian_fev_recibidas r
    WHERE r.id = p_cpe_id AND r.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DIAN_EVENT_ANCHOR_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    v_is_received := true;
  END IF;

  SELECT * INTO v_config
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  IF NOT FOUND
     OR upper(coalesce(v_config.pais, '')) <> 'CO'
     OR coalesce(v_config.is_demo, true)
     OR v_config.dian_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'DIAN_EVENT_TENANT_NOT_READY' USING ERRCODE = '55000';
  END IF;
  IF v_is_received THEN
    IF v_received.state <> 'ACCEPTED'
       OR upper(coalesce(v_received.cufe, '')) !~ '^[0-9A-F]{96}$'
       OR v_code = '034' THEN
      RAISE EXCEPTION 'DIAN_EVENT_ACCEPTED_RECEIVED_INVOICE_REQUIRED' USING ERRCODE = '55000';
    END IF;
  ELSIF v_cpe.simulated_origin IS NOT FALSE
       OR upper(coalesce(v_cpe.issuer_snapshot->>'country_code', '')) <> 'CO'
       OR upper(coalesce(v_cpe.tipo_documento, '')) <> '01'
       OR upper(coalesce(v_cpe.estado, '')) <> 'ACEPTADO'
       OR upper(coalesce(v_cpe.fiscal_authority_evidence->>'authority', '')) <> 'DIAN'
       OR upper(coalesce(v_cpe.fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED'
       OR upper(coalesce(v_cpe.fiscal_authority_evidence->>'code_kind', '')) <> 'CUFE'
       OR upper(coalesce(v_cpe.fiscal_authority_evidence->>'unique_code', ''))
            !~ '^[0-9A-F]{96}$'
       OR v_code <> '034' THEN
    RAISE EXCEPTION 'DIAN_EVENT_ACCEPTED_ISSUED_INVOICE_REQUIRED' USING ERRCODE = '55000';
  END IF;

  v_tenant_tax_id := regexp_replace(coalesce(v_config.ruc, ''), '[^0-9]', '', 'g');
  v_issuer_tax_id := regexp_replace(coalesce(
    CASE WHEN v_is_received THEN
      coalesce(v_received.issuer_snapshot->>'number', '')
        || coalesce(v_received.issuer_snapshot->>'verificationDigit', '')
      ELSE v_cpe.issuer_snapshot->>'tax_id' END, ''
  ), '[^0-9]', '', 'g');
  v_receiver_tax_id := regexp_replace(coalesce(
    CASE WHEN v_is_received THEN
      coalesce(v_received.receiver_snapshot->>'number', '')
        || coalesce(v_received.receiver_snapshot->>'verificationDigit', '')
      ELSE v_cpe.documento_receptor END, ''
  ), '[^0-9]', '', 'g');
  IF v_tenant_tax_id = '' OR v_issuer_tax_id = '' OR v_receiver_tax_id = '' THEN
    RAISE EXCEPTION 'DIAN_EVENT_PARTY_IDENTITY_MISSING' USING ERRCODE = '23514';
  END IF;

  -- 030-033 son actos del adquirente. 034 es la declaración del facturador.
  -- El tenant nunca puede escoger el rol en el payload.
  IF v_is_received THEN
    IF v_tenant_tax_id IS DISTINCT FROM v_receiver_tax_id THEN
      RAISE EXCEPTION 'DIAN_EVENT_ACQUIRER_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    v_party_role := 'ACQUIRER';
  ELSE
    IF v_tenant_tax_id IS DISTINCT FROM v_issuer_tax_id THEN
      RAISE EXCEPTION 'DIAN_EVENT_ISSUER_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    v_party_role := 'ISSUER';
  END IF;

  IF v_code IN ('030', '032') AND (
       jsonb_typeof(v_payload->'responsible_person') <> 'object'
       OR nullif(btrim(v_payload#>>'{responsible_person,identity_type}'), '') IS NULL
       OR nullif(btrim(v_payload#>>'{responsible_person,identity_number}'), '') IS NULL
       OR nullif(btrim(v_payload#>>'{responsible_person,first_name}'), '') IS NULL
       OR nullif(btrim(v_payload#>>'{responsible_person,family_name}'), '') IS NULL
       OR nullif(btrim(v_payload#>>'{responsible_person,job_title}'), '') IS NULL
       OR nullif(btrim(v_payload#>>'{responsible_person,organization_department}'), '') IS NULL
     ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_RESPONSIBLE_PERSON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_code = '031' AND (
       jsonb_typeof(v_payload->'claim_reason') <> 'object'
       OR btrim(v_payload#>>'{claim_reason,list_id}') NOT IN ('01', '02', '03', '04')
       OR nullif(btrim(v_payload#>>'{claim_reason,name}'), '') IS NULL
     ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_CLAIM_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_code = '034'
     AND lower(coalesce(v_payload->>'sworn_confirmation', '')) <> 'true' THEN
    RAISE EXCEPTION 'DIAN_EVENT_SWORN_CONFIRMATION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- La secuencia se valida contra GetStatusEvent inmediatamente antes de
  -- sellar. Una fila local no sustituye la inscripción efectiva en DIAN.

  v_description := CASE v_code
    WHEN '030' THEN 'Acuse de recibo de Factura Electronica de Venta'
    WHEN '031' THEN 'Reclamo de la Factura Electronica de Venta'
    WHEN '032' THEN 'Recibo del bien y/o prestacion del servicio'
    WHEN '033' THEN 'Aceptacion expresa'
    WHEN '034' THEN 'Aceptacion tacita'
  END;
  v_bogota := current_timestamp AT TIME ZONE 'America/Bogota';
  v_issue_date := to_char(v_bogota, 'YYYY-MM-DD');
  v_issue_time := to_char(v_bogota, 'HH24:MI:SS') || '-05:00';
  v_event_id := 'AR' || substr(replace(v_operation_id::text, '-', ''), 1, 30);
  v_reference_id := CASE WHEN v_is_received THEN v_received.document_id
    ELSE upper(btrim(coalesce(v_cpe.serie, ''))) || btrim(coalesce(v_cpe.numero, '')) END;

  v_request := jsonb_strip_nulls(jsonb_build_object(
    'contract_version', 527,
    'country_code', 'CO',
    'authority', 'DIAN',
    'event_code', v_code,
    'event_description', v_description,
    'event_id', v_event_id,
    'issue_date', v_issue_date,
    'issue_time', v_issue_time,
    'anchor_kind', CASE WHEN v_is_received THEN 'RECEIVED_INVOICE' ELSE 'ISSUED_CPE' END,
    'dian_fev_recibida_id', CASE WHEN v_is_received THEN v_received.id ELSE NULL END,
    'cpe_id', CASE WHEN v_is_received THEN NULL ELSE v_cpe.id END,
    'party_role', v_party_role,
    'referenced_document_id', v_reference_id,
    'referenced_document_type_code', '01',
    'referenced_document_uuid', CASE WHEN v_is_received THEN upper(v_received.cufe)
      ELSE upper(v_cpe.fiscal_authority_evidence->>'unique_code') END,
    'sender', CASE WHEN NOT v_is_received THEN jsonb_build_object(
      'type', '31', 'number', v_cpe.issuer_snapshot->>'tax_id',
      'name', v_cpe.issuer_snapshot->>'legal_name'
    ) ELSE jsonb_build_object(
      'type', coalesce(nullif(btrim(v_received.receiver_snapshot->>'type'), ''), '31'),
      'number', coalesce(v_received.receiver_snapshot->>'number', '')
        || coalesce(v_received.receiver_snapshot->>'verificationDigit', ''),
      'name', v_received.receiver_snapshot->>'name'
    ) END,
    'receiver', CASE WHEN NOT v_is_received THEN jsonb_build_object(
      'type', '31', 'number', '8001972684',
      'name', 'Unidad Administrativa Especial Dirección de Impuestos y Aduanas Nacionales'
    ) ELSE jsonb_build_object(
      'type', coalesce(nullif(btrim(v_received.issuer_snapshot->>'type'), ''), '31'),
      'number', coalesce(v_received.issuer_snapshot->>'number', '')
        || coalesce(v_received.issuer_snapshot->>'verificationDigit', ''),
      'name', v_received.issuer_snapshot->>'name'
    ) END,
    'responsible_person', v_payload->'responsible_person',
    'claim_reason', v_payload->'claim_reason',
    'sworn_confirmation', CASE WHEN v_code = '034' THEN true ELSE NULL END,
    'sworn_statement', CASE WHEN v_code = '034' THEN
      'Bajo la gravedad de juramento se manifiesta que transcurrieron 3 días hábiles desde el recibo de los bienes o servicios sin rechazo ni reclamo.'
      ELSE NULL END,
    'timing_validation', CASE WHEN v_code IN ('033', '034') THEN 'DIAN_AUTHORITATIVE' ELSE NULL END,
    'source_acceptance_operation_id', CASE WHEN v_is_received THEN NULL
      ELSE v_cpe.fiscal_authority_evidence->>'operation_id' END,
    'received_invoice_xml_sha256', CASE WHEN v_is_received
      THEN v_received.invoice_xml_sha256 ELSE NULL END
  ));

  v_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'action', 'EVENT', 'tenant_id', p_tenant_id, 'anchor_id', p_cpe_id,
    'anchor_kind', CASE WHEN v_is_received THEN 'RECEIVED_INVOICE' ELSE 'ISSUED_CPE' END,
    'event_code', v_code, 'party_role', v_party_role,
    'referenced_document_uuid', v_request->>'referenced_document_uuid',
    'responsible_person', v_request->'responsible_person',
    'claim_reason', v_request->'claim_reason',
    'sworn_confirmation', v_request->'sworn_confirmation'
  ));

  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF (
         (v_is_received AND (
           v_op.dian_fev_recibida_id IS DISTINCT FROM p_cpe_id OR v_op.cpe_id IS NOT NULL
         ))
         OR (NOT v_is_received AND (
           v_op.cpe_id IS DISTINCT FROM p_cpe_id OR v_op.dian_fev_recibida_id IS NOT NULL
         ))
       ) OR v_op.action <> 'EVENT'
       OR v_op.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'CPE_OPERATION_IDEMPOTENCY_COLLISION' USING ERRCODE = '23505';
    END IF;
    IF v_op.state = 'COMPLETED' THEN
      RETURN jsonb_build_object('claimed', false, 'idempotent', true,
        'reason', 'TERMINAL', 'operation', to_jsonb(v_op),
        'cpe', CASE WHEN v_is_received THEN NULL ELSE to_jsonb(v_cpe) END,
        'received_invoice', CASE WHEN v_is_received THEN to_jsonb(v_received) ELSE NULL END);
    END IF;
    IF v_op.state = 'CLAIMED' AND v_op.lease_expires_at > now() THEN
      RETURN jsonb_build_object('claimed', false, 'idempotent', true,
        'reason', 'IN_FLIGHT', 'operation', to_jsonb(v_op),
        'cpe', CASE WHEN v_is_received THEN NULL ELSE to_jsonb(v_cpe) END,
        'received_invoice', CASE WHEN v_is_received THEN to_jsonb(v_received) ELSE NULL END);
    END IF;
    IF v_op.state = 'TECHNICAL_ERROR' AND v_op.next_retry_at > now() THEN
      RETURN jsonb_build_object('claimed', false, 'idempotent', true,
        'reason', 'RETRY_LATER', 'retry_at', v_op.next_retry_at,
        'operation', to_jsonb(v_op),
        'cpe', CASE WHEN v_is_received THEN NULL ELSE to_jsonb(v_cpe) END,
        'received_invoice', CASE WHEN v_is_received THEN to_jsonb(v_received) ELSE NULL END);
    END IF;
    UPDATE public.cpe_operaciones
    SET state = 'CLAIMED', claim_token = v_claim,
        lease_expires_at = now() + interval '5 minutes', attempt = attempt + 1,
        actor_id = p_actor_id, origin = v_origin, result_kind = NULL,
        response_summary = NULL, response_code = NULL, error_message = NULL,
        terminal_fingerprint = NULL, next_retry_at = NULL,
        completed_at = NULL, updated_at = now()
    WHERE id = v_op.id
    RETURNING * INTO v_op;
  ELSE
    SELECT * INTO v_prior
    FROM public.cpe_operaciones o
    WHERE o.tenant_id = p_tenant_id
      AND ((v_is_received AND o.dian_fev_recibida_id = p_cpe_id)
        OR (NOT v_is_received AND o.cpe_id = p_cpe_id))
      AND o.action = 'EVENT' AND o.request_summary->>'event_code' = v_code
    ORDER BY o.created_at DESC
    LIMIT 1
    FOR UPDATE;
    IF FOUND THEN
      IF v_prior.state = 'COMPLETED' AND v_prior.result_kind = 'ACCEPTED' THEN
        RETURN jsonb_build_object('claimed', false, 'idempotent', true,
          'reason', 'EVENT_ALREADY_ACCEPTED', 'operation', to_jsonb(v_prior),
          'cpe', CASE WHEN v_is_received THEN NULL ELSE to_jsonb(v_cpe) END,
          'received_invoice', CASE WHEN v_is_received THEN to_jsonb(v_received) ELSE NULL END);
      END IF;
      -- Un rechazo fiscal inequívoco es terminal para esa intención/clave,
      -- pero no debe bloquear para siempre un dato corregido. Sólo una clave
      -- nueva puede crear otra operación; incertidumbre técnica conserva la
      -- obligación de reusar la clave original y reconciliar el CUDE sellado.
      IF NOT (v_prior.state = 'COMPLETED' AND v_prior.result_kind = 'REJECTED') THEN
        RAISE EXCEPTION 'DIAN_EVENT_RETRY_REQUIRES_ORIGINAL_IDEMPOTENCY_KEY'
          USING ERRCODE = '23505';
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.cpe_operaciones o
      WHERE o.tenant_id = p_tenant_id
        AND ((v_is_received AND o.dian_fev_recibida_id = p_cpe_id)
          OR (NOT v_is_received AND o.cpe_id = p_cpe_id))
        AND o.action = 'EVENT' AND o.state = 'CLAIMED'
        AND o.lease_expires_at > now()
    ) THEN
      RAISE EXCEPTION 'CPE_OPERATION_ALREADY_IN_FLIGHT' USING ERRCODE = '55P03';
    END IF;
    v_package_year := extract(
      year FROM current_timestamp AT TIME ZONE 'America/Bogota'
    )::integer;
    INSERT INTO public.dian_package_counters (
      tenant_id, package_year, last_sequence, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_package_year, 1, now(), now()
    )
    ON CONFLICT (tenant_id, package_year) DO UPDATE
    SET last_sequence = public.dian_package_counters.last_sequence + 1,
        updated_at = now()
    WHERE public.dian_package_counters.last_sequence < 4294967295
    RETURNING last_sequence INTO v_package_sequence;
    IF v_package_sequence IS NULL THEN
      RAISE EXCEPTION 'DIAN_PACKAGE_SEQUENCE_EXHAUSTED' USING ERRCODE = '22003';
    END IF;
    v_request := v_request || jsonb_build_object(
      'dian_package_year', v_package_year,
      'dian_package_sequence', v_package_sequence,
      'dian_package_sequence_hex', lpad(upper(to_hex(v_package_sequence)), 8, '0'),
      'dian_provider_code', '000'
    );
    INSERT INTO public.cpe_operaciones (
      id, tenant_id, cpe_id, dian_fev_recibida_id,
      action, idempotency_key, request_fingerprint,
      state, claim_token, lease_expires_at, attempt, actor_id, origin, request_summary
    ) VALUES (
      v_operation_id, p_tenant_id,
      CASE WHEN v_is_received THEN NULL ELSE p_cpe_id END,
      CASE WHEN v_is_received THEN p_cpe_id ELSE NULL END,
      'EVENT', v_key, v_fp,
      'CLAIMED', v_claim, now() + interval '5 minutes', 1,
      p_actor_id, v_origin, v_request
    ) RETURNING * INTO v_op;
  END IF;

  IF v_is_received THEN
    UPDATE public.dian_fev_recibidas
    SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_dian_event_operation_id', v_op.id,
          'last_dian_event_code', v_code,
          'dian_event_contract_version', 527
        )
    WHERE id = p_cpe_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_received;
  ELSE
    UPDATE public.cpe
    SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_dian_event_operation_id', v_op.id,
          'last_dian_event_code', v_code,
          'dian_event_contract_version', 527
        ),
        updated_at = now()
    WHERE id = p_cpe_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_cpe;
  END IF;

  RETURN jsonb_build_object(
    'claimed', true, 'idempotent', v_op.attempt > 1,
    'operation', to_jsonb(v_op),
    'cpe', CASE WHEN v_is_received THEN NULL ELSE to_jsonb(v_cpe) END,
    'received_invoice', CASE WHEN v_is_received THEN to_jsonb(v_received) ELSE NULL END
  );
END;
$function$;

-- Valida la forma UBL mínima de un ApplicationResponse sin confiar en los
-- booleanos calculados por la capa HTTP. El mismo contrato sirve para el XML
-- del evento (030-034, CUDE en cabecera y CUFE referenciado) y para la
-- respuesta de autoridad (02/04 y CUDE del evento referenciado).
CREATE OR REPLACE FUNCTION app.dian_application_response_contract_valid_527(
  p_xml text,
  p_expected_response_code text,
  p_expected_reference_uuid text,
  p_expected_xml_sha256 text,
  p_expected_root_uuid text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_document xml;
  v_expected_response_code text := btrim(coalesce(p_expected_response_code, ''));
  v_expected_reference_uuid text := upper(btrim(coalesce(p_expected_reference_uuid, '')));
  v_expected_root_uuid text := upper(nullif(btrim(coalesce(p_expected_root_uuid, '')), ''));
  v_expected_hash text := lower(btrim(coalesce(p_expected_xml_sha256, '')));
  v_root_name text;
  v_root_namespace text;
  v_signature_count integer;
  v_root_uuid_count integer;
  v_root_uuid text;
  v_document_response_count integer;
  v_response_count integer;
  v_response_code_count integer;
  v_response_code text;
  v_document_reference_count integer;
  v_reference_uuid_count integer;
  v_reference_uuid text;
BEGIN
  IF nullif(btrim(coalesce(p_xml, '')), '') IS NULL
     OR octet_length(p_xml) > 8388608
     OR p_xml ~* '<!(DOCTYPE|ENTITY)'
     OR v_expected_response_code = ''
     OR v_expected_reference_uuid !~ '^[0-9A-F]{96}$'
     OR v_expected_hash !~ '^[0-9a-f]{64}$'
     OR (
       v_expected_root_uuid IS NOT NULL
       AND v_expected_root_uuid !~ '^[0-9A-F]{96}$'
     )
     OR encode(
       extensions.digest(convert_to(p_xml, 'UTF8'), 'sha256'), 'hex'
     ) IS DISTINCT FROM v_expected_hash THEN
    RETURN false;
  END IF;

  BEGIN
    v_document := xmlparse(document p_xml);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  v_root_name := coalesce((xpath('local-name(/*)', v_document))[1]::text, '');
  v_root_namespace := coalesce((xpath('namespace-uri(/*)', v_document))[1]::text, '');
  v_signature_count := coalesce((xpath(
    'count(/*//*[local-name()="Signature" and namespace-uri()="http://www.w3.org/2000/09/xmldsig#"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_root_uuid_count := coalesce((xpath(
    'count(/*/*[local-name()="UUID" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_root_uuid := upper(btrim(coalesce((xpath(
    'string(/*/*[local-name()="UUID" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"][1])',
    v_document
  ))[1]::text, '')));
  v_document_response_count := coalesce((xpath(
    'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_response_count := coalesce((xpath(
    'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="Response" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_response_code_count := coalesce((xpath(
    'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="Response" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="ResponseCode" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_response_code := btrim(coalesce((xpath(
    'string(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="Response" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="ResponseCode" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"][1])',
    v_document
  ))[1]::text, ''));
  v_document_reference_count := coalesce((xpath(
    'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="DocumentReference" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_reference_uuid_count := coalesce((xpath(
    'count(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="DocumentReference" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="UUID" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"])',
    v_document
  ))[1]::text::numeric::integer, 0);
  v_reference_uuid := upper(btrim(coalesce((xpath(
    'string(/*/*[local-name()="DocumentResponse" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="DocumentReference" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"]/*[local-name()="UUID" and namespace-uri()="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"][1])',
    v_document
  ))[1]::text, '')));

  RETURN v_root_name = 'ApplicationResponse'
    AND v_root_namespace = 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2'
    AND v_signature_count = 1
    AND v_document_response_count = 1
    AND v_response_count = 1
    AND v_response_code_count = 1
    AND v_response_code = v_expected_response_code
    AND v_document_reference_count = 1
    AND v_reference_uuid_count = 1
    AND v_reference_uuid = v_expected_reference_uuid
    AND (
      v_expected_root_uuid IS NULL
      OR (v_root_uuid_count = 1 AND v_root_uuid = v_expected_root_uuid)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sellar_evento_dian_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_signed_application_response text,
  p_event_cude text,
  p_xml_sha256 text,
  p_authority_event_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_op public.cpe_operaciones;
  v_cude text := upper(btrim(coalesce(p_event_cude, '')));
  v_hash text := lower(btrim(coalesce(p_xml_sha256, '')));
  v_existing_xml text;
  v_snapshot jsonb := coalesce(p_authority_event_snapshot, '{}'::jsonb);
  v_reference_cufe text;
  v_event_code text;
  v_event_codes text[];
  v_anchor_id uuid;
BEGIN
  IF p_claim_token IS NULL OR v_cude !~ '^[0-9A-F]{96}$'
     OR v_hash !~ '^[0-9a-f]{64}$'
     OR nullif(btrim(coalesce(p_signed_application_response, '')), '') IS NULL
     OR octet_length(p_signed_application_response) > 4194304
     OR p_signed_application_response ~* '<!(DOCTYPE|ENTITY)' THEN
    RAISE EXCEPTION 'DIAN_EVENT_SEAL_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(o.dian_fev_recibida_id, o.cpe_id) INTO v_anchor_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'EVENT';
  IF NOT FOUND OR v_anchor_id IS NULL THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_anchor_id::text, 0)
  );

  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id AND o.action = 'EVENT'
    AND coalesce(o.dian_fev_recibida_id, o.cpe_id) = v_anchor_id
  FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token
     OR v_op.state <> 'CLAIMED' THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_op.request_summary->>'contract_version', '') <> '527'
     OR v_op.request_summary->>'event_code' NOT IN ('030', '031', '032', '033', '034') THEN
    RAISE EXCEPTION 'DIAN_EVENT_REQUEST_SNAPSHOT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_reference_cufe := upper(v_op.request_summary->>'referenced_document_uuid');
  v_event_code := v_op.request_summary->>'event_code';
  IF NOT app.dian_application_response_contract_valid_527(
    p_signed_application_response,
    v_event_code,
    v_reference_cufe,
    v_hash,
    v_cude
  ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_SEAL_XML_CONTRACT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(v_snapshot) <> 'object'
     OR upper(coalesce(v_snapshot->>'countryCode', '')) <> 'CO'
     OR upper(coalesce(v_snapshot->>'invoiceCufe', '')) IS DISTINCT FROM v_reference_cufe
     OR lower(coalesce(v_snapshot->>'usable', '')) <> 'true'
     OR lower(coalesce(v_snapshot->>'signatureVerified', '')) <> 'true'
     OR lower(coalesce(v_snapshot->>'authoritySignatureTrusted', '')) <> 'true'
     OR coalesce(v_snapshot->>'statusCode', '') <> '00'
     OR upper(coalesce(v_snapshot->>'authorityDocumentKey', '')) IS DISTINCT FROM v_reference_cufe
     OR jsonb_typeof(v_snapshot->'eventCodes') <> 'array'
     OR nullif(btrim(coalesce(v_snapshot->>'authorityXml', '')), '') IS NULL
     OR octet_length(v_snapshot->>'authorityXml') > 8388608
     OR (v_snapshot->>'authorityXml') !~ '<([[:alnum:]_]+:)?ApplicationResponse([[:space:]>])'
     OR position('http://www.w3.org/2000/09/xmldsig#' IN (v_snapshot->>'authorityXml')) = 0
     OR position('<ds:Signature' IN (v_snapshot->>'authorityXml')) = 0
     OR (v_snapshot->>'authorityXml') ~ '<!(DOCTYPE|ENTITY)'
     OR lower(coalesce(v_snapshot->>'authorityXmlSha256', '')) !~ '^[0-9a-f]{64}$'
     OR encode(extensions.digest(
          convert_to(v_snapshot->>'authorityXml', 'UTF8'), 'sha256'
        ), 'hex') IS DISTINCT FROM lower(v_snapshot->>'authorityXmlSha256') THEN
    RAISE EXCEPTION 'DIAN_EVENT_AUTHORITY_SNAPSHOT_INVALID' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(array_agg(upper(value)), ARRAY[]::text[])
  INTO v_event_codes
  FROM jsonb_array_elements_text(v_snapshot->'eventCodes') AS values(value);
  IF EXISTS (SELECT 1 FROM unnest(v_event_codes) code WHERE code NOT IN ('030','031','032','033','034'))
     OR v_event_code = ANY(v_event_codes) THEN
    RAISE EXCEPTION 'DIAN_EVENT_ALREADY_REGISTERED' USING ERRCODE = '55000';
  END IF;
  IF v_event_code IN ('031','032','033','034') AND NOT ('030' = ANY(v_event_codes)) THEN
    RAISE EXCEPTION 'DIAN_EVENT_030_REQUIRED' USING ERRCODE = '55000';
  END IF;
  IF v_event_code IN ('031','033','034') AND NOT ('032' = ANY(v_event_codes)) THEN
    RAISE EXCEPTION 'DIAN_EVENT_032_REQUIRED' USING ERRCODE = '55000';
  END IF;
  IF (v_event_code = '031' AND ('033' = ANY(v_event_codes) OR '034' = ANY(v_event_codes)))
     OR (v_event_code = '033' AND ('031' = ANY(v_event_codes) OR '034' = ANY(v_event_codes)))
     OR (v_event_code = '034' AND ('031' = ANY(v_event_codes) OR '033' = ANY(v_event_codes))) THEN
    RAISE EXCEPTION 'DIAN_EVENT_LEGAL_SEQUENCE_CONFLICT' USING ERRCODE = '55000';
  END IF;

  v_existing_xml := v_op.request_summary->>'signed_application_response';
  IF nullif(btrim(coalesce(v_existing_xml, '')), '') IS NOT NULL THEN
    IF v_existing_xml IS DISTINCT FROM p_signed_application_response
       OR upper(v_op.request_summary->>'event_cude') IS DISTINCT FROM v_cude
       OR lower(v_op.request_summary->>'signed_xml_sha256') IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'DIAN_EVENT_SEAL_COLLISION' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('sealed', true, 'idempotent', true,
      'operation', to_jsonb(v_op));
  END IF;

  UPDATE public.cpe_operaciones
  SET request_summary = request_summary || jsonb_build_object(
        'signed_application_response', p_signed_application_response,
        'event_cude', v_cude,
        'signed_xml_sha256', v_hash,
        'authority_event_snapshot', v_snapshot,
        'sealed_at', now()
      ),
      updated_at = now()
  WHERE id = v_op.id
  RETURNING * INTO v_op;

  RETURN jsonb_build_object('sealed', true, 'idempotent', false,
    'operation', to_jsonb(v_op));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_evento_dian_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_result_kind text,
  p_response_code text,
  p_description text,
  p_response_summary jsonb DEFAULT '{}'::jsonb,
  p_authority_response text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_kind text := upper(btrim(coalesce(p_result_kind, '')));
  v_code text := nullif(btrim(coalesce(p_response_code, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_summary jsonb := coalesce(p_response_summary, '{}'::jsonb);
  v_op public.cpe_operaciones;
  v_cpe public.cpe;
  v_received public.dian_fev_recibidas;
  v_terminal_fp text;
  v_next_retry timestamptz;
  v_authority_hash text;
  v_expected_authority_response_code text;
  v_application_response_evidence jsonb;
  v_anchor_id uuid;
BEGIN
  IF p_claim_token IS NULL
     OR v_kind NOT IN ('ACCEPTED', 'PENDING', 'REJECTED', 'TECHNICAL_ERROR')
     OR v_code IS NULL OR v_description IS NULL OR jsonb_typeof(v_summary) <> 'object'
     OR octet_length(coalesce(p_authority_response, '')) > 8388608
     OR coalesce(p_authority_response, '') ~ '<!(DOCTYPE|ENTITY)' THEN
    RAISE EXCEPTION 'DIAN_EVENT_FINALIZATION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(o.dian_fev_recibida_id, o.cpe_id) INTO v_anchor_id
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.action = 'EVENT';
  IF NOT FOUND OR v_anchor_id IS NULL THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  -- Reserva, sellado, reconciliación y finalización usan la misma llave antes
  -- de bloquear operación/ancla; así un retry no puede cerrar el ciclo op↔ancla.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian:anchor:' || v_anchor_id::text, 0)
  );

  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id AND o.action = 'EVENT'
    AND coalesce(o.dian_fev_recibida_id, o.cpe_id) = v_anchor_id
  FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  IF upper(coalesce(v_summary->>'countryCode', '')) <> 'CO'
     OR upper(coalesce(v_summary->>'eventCode', ''))
          IS DISTINCT FROM upper(v_op.request_summary->>'event_code')
     OR (
       v_kind <> 'TECHNICAL_ERROR' AND (
         nullif(btrim(v_op.request_summary->>'signed_application_response'), '') IS NULL
         OR upper(coalesce(v_op.request_summary->>'event_cude', '')) !~ '^[0-9A-F]{96}$'
         OR lower(coalesce(v_op.request_summary->>'signed_xml_sha256', '')) !~ '^[0-9a-f]{64}$'
         OR upper(coalesce(v_summary->>'eventCude', ''))
              IS DISTINCT FROM upper(v_op.request_summary->>'event_cude')
       )
     )
     OR (
       v_kind = 'TECHNICAL_ERROR'
       AND nullif(btrim(coalesce(v_op.request_summary->>'event_cude', '')), '') IS NOT NULL
       AND upper(coalesce(v_summary->>'eventCude', ''))
            IS DISTINCT FROM upper(v_op.request_summary->>'event_cude')
     ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_FINALIZATION_EVIDENCE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_kind IN ('ACCEPTED', 'REJECTED') AND (
       lower(coalesce(v_summary->>'signatureVerified', '')) <> 'true'
       OR lower(coalesce(v_summary->>'authoritySignatureTrusted', '')) <> 'true'
     ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_AUTHORITY_TRUST_INVALID' USING ERRCODE = '23514';
  END IF;
  IF v_kind IN ('ACCEPTED', 'REJECTED') THEN
    v_authority_hash := encode(
      extensions.digest(convert_to(p_authority_response, 'UTF8'), 'sha256'), 'hex'
    );
    v_expected_authority_response_code := CASE
      WHEN v_kind = 'ACCEPTED' THEN '02'
      ELSE '04'
    END;
    v_application_response_evidence := v_summary->'applicationResponseEvidence';
    IF NOT app.dian_application_response_contract_valid_527(
         p_authority_response,
         v_expected_authority_response_code,
         v_op.request_summary->>'event_cude',
         v_authority_hash,
         NULL
       )
       OR jsonb_typeof(v_application_response_evidence) <> 'object'
       OR v_application_response_evidence->>'rootNamespace'
            IS DISTINCT FROM 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2'
       OR coalesce(v_application_response_evidence->>'signatureCount', '') <> '1' THEN
      RAISE EXCEPTION 'DIAN_EVENT_AUTHORITY_XML_CONTRACT_INVALID' USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(v_application_response_evidence->'referencedDocumentKeys') <> 'array'
       OR jsonb_typeof(v_application_response_evidence->'responseCodes') <> 'array' THEN
      RAISE EXCEPTION 'DIAN_EVENT_AUTHORITY_XML_CONTRACT_INVALID' USING ERRCODE = '23514';
    END IF;
    IF jsonb_array_length(v_application_response_evidence->'referencedDocumentKeys') <> 1
       OR upper(coalesce(v_application_response_evidence#>>'{referencedDocumentKeys,0}', ''))
            IS DISTINCT FROM upper(v_op.request_summary->>'event_cude')
       OR jsonb_array_length(v_application_response_evidence->'responseCodes') <> 1
       OR coalesce(v_application_response_evidence#>>'{responseCodes,0}', '')
            IS DISTINCT FROM v_expected_authority_response_code THEN
      RAISE EXCEPTION 'DIAN_EVENT_AUTHORITY_XML_CONTRACT_INVALID' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_kind = 'ACCEPTED' AND (
       lower(coalesce(v_summary->>'success', '')) <> 'true'
       OR v_code <> '00'
       OR (
         coalesce(v_summary->>'reconciliation', '') = 'GET_STATUS_BY_EVENT_CUDE'
         AND (
           upper(coalesce(v_summary->>'authorityDocumentKey', ''))
             IS DISTINCT FROM upper(v_op.request_summary->>'event_cude')
           OR coalesce(v_summary->>'eventStatusCode', '') <> '00'
         )
       )
       OR (
         coalesce(v_summary->>'reconciliation', '') <> 'GET_STATUS_BY_EVENT_CUDE'
         AND upper(coalesce(v_summary->>'authorityDocumentKey', ''))
           IS DISTINCT FROM upper(v_op.request_summary->>'event_cude')
       )
      ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_ACCEPTANCE_EVIDENCE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF v_kind = 'REJECTED' AND (
       lower(coalesce(v_summary->>'success', '')) <> 'false'
       OR v_code NOT IN ('66', '90', '99')
       OR nullif(btrim(coalesce(v_summary->>'reconciliation', '')), '') IS NOT NULL
       OR upper(coalesce(v_summary->>'authorityDocumentKey', ''))
             IS DISTINCT FROM upper(v_op.request_summary->>'event_cude')
      ) THEN
    RAISE EXCEPTION 'DIAN_EVENT_REJECTION_EVIDENCE_INVALID' USING ERRCODE = '23514';
  END IF;

  v_terminal_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'result_kind', v_kind, 'response_code', v_code,
    'description', v_description, 'response_summary', v_summary,
    'authority_response_sha256', CASE
      WHEN nullif(btrim(coalesce(p_authority_response, '')), '') IS NULL THEN NULL
      ELSE encode(extensions.digest(convert_to(p_authority_response, 'UTF8'), 'sha256'), 'hex')
    END
  ));
  IF v_op.state <> 'CLAIMED' THEN
    IF v_op.terminal_fingerprint IS DISTINCT FROM v_terminal_fp THEN
      RAISE EXCEPTION 'CPE_OPERATION_TERMINAL_COLLISION' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_cpe FROM public.cpe c
    WHERE c.id = v_op.cpe_id AND c.tenant_id = p_tenant_id;
    SELECT * INTO v_received FROM public.dian_fev_recibidas r
    WHERE r.id = v_op.dian_fev_recibida_id AND r.tenant_id = p_tenant_id;
    RETURN jsonb_build_object('idempotent', true, 'operation', to_jsonb(v_op),
      'cpe', to_jsonb(v_cpe), 'received_invoice', to_jsonb(v_received));
  END IF;

  IF v_kind = 'TECHNICAL_ERROR' THEN
    v_next_retry := now() + make_interval(
      mins => least(60, greatest(1, power(2, least(v_op.attempt, 6))::integer))
    );
  END IF;
  UPDATE public.cpe_operaciones
  SET state = CASE WHEN v_kind = 'TECHNICAL_ERROR' THEN 'TECHNICAL_ERROR' ELSE 'COMPLETED' END,
      result_kind = v_kind,
      response_code = left(v_code, 100),
      error_message = CASE WHEN v_kind IN ('REJECTED', 'TECHNICAL_ERROR')
        THEN left(v_description, 1000) ELSE NULL END,
      response_summary = v_summary || jsonb_build_object(
        'authorityResponse', CASE
          WHEN nullif(btrim(coalesce(p_authority_response, '')), '') IS NULL THEN NULL
          ELSE p_authority_response
        END,
        'authorityResponseSha256', CASE
          WHEN nullif(btrim(coalesce(p_authority_response, '')), '') IS NULL THEN NULL
          ELSE encode(extensions.digest(convert_to(p_authority_response, 'UTF8'), 'sha256'), 'hex')
        END
      ),
      terminal_fingerprint = v_terminal_fp,
      lease_expires_at = NULL, next_retry_at = v_next_retry,
      completed_at = now(), updated_at = now()
  WHERE id = v_op.id
  RETURNING * INTO v_op;

  IF v_op.dian_fev_recibida_id IS NOT NULL THEN
    UPDATE public.dian_fev_recibidas
    SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_dian_event_operation_id', v_op.id,
          'last_dian_event_code', v_op.request_summary->>'event_code',
          'last_dian_event_result', v_kind,
          'dian_event_contract_version', 527
        )
    WHERE id = v_op.dian_fev_recibida_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_received;
  ELSE
    UPDATE public.cpe
    SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_dian_event_operation_id', v_op.id,
          'last_dian_event_code', v_op.request_summary->>'event_code',
          'last_dian_event_result', v_kind,
          'dian_event_contract_version', 527
        ),
        updated_at = now()
    WHERE id = v_op.cpe_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_cpe;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.tenant_id = p_tenant_id AND a.table_name = 'cpe_operaciones'
      AND a.record_id = v_op.id::text AND a.operation = 'UPDATE'
      AND a.metadata->>'contract_version' = '527'
      AND a.metadata->>'result_kind' = v_kind
  ) THEN
    INSERT INTO public.audit_log (
      tenant_id, user_id, table_name, record_id, operation,
      old_values, new_values, changed_fields, metadata, "timestamp"
    ) VALUES (
      p_tenant_id, v_op.actor_id, 'cpe_operaciones', v_op.id::text, 'UPDATE',
      NULL,
      jsonb_build_object(
        'cpe_id', v_op.cpe_id,
        'dian_fev_recibida_id', v_op.dian_fev_recibida_id,
        'event_code', v_op.request_summary->>'event_code',
        'event_cude', v_op.request_summary->>'event_cude',
        'result_kind', v_kind,
        'response_code', v_code
      ),
      jsonb_build_array('state', 'result_kind', 'response_code'),
      jsonb_build_object('contract_version', 527, 'result_kind', v_kind),
      now()
    );
  END IF;

  RETURN jsonb_build_object('idempotent', false, 'operation', to_jsonb(v_op),
    'cpe', to_jsonb(v_cpe), 'received_invoice', to_jsonb(v_received));
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_evento_dian_tx(
  uuid, uuid, uuid, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_fev_recibida_dian_tx(
  uuid, uuid, text, uuid, uuid, text, text, jsonb, jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.listar_fev_recibidas_dian_tx(uuid, integer)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.obtener_reintento_evento_dian_tx(uuid, uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.dian_fev_recibida_immutable_527()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.dian_application_response_contract_valid_527(
  text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sellar_evento_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalizar_evento_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reservar_evento_dian_tx(
  uuid, uuid, uuid, text, text, jsonb, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.sellar_evento_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_evento_dian_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_fev_recibida_dian_tx(
  uuid, uuid, text, uuid, uuid, text, text, jsonb, jsonb, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.listar_fev_recibidas_dian_tx(uuid, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reintento_evento_dian_tx(uuid, uuid, uuid, text)
TO service_role;

COMMENT ON FUNCTION public.reservar_evento_dian_tx(uuid, uuid, uuid, text, text, jsonb, text) IS
  'Reserva tenant-safe e idempotente: 030-033 sobre FEV recibida DIAN y 034 sobre CPE emitido aceptado; contrato 527.';
COMMENT ON FUNCTION public.registrar_fev_recibida_dian_tx(uuid, uuid, text, uuid, uuid, text, text, jsonb, jsonb, text, jsonb) IS
  'Registra evidencia inmutable de una FEV recibida validada por GetStatus y GetXmlByDocumentKey, vinculada a proveedor/CxP; contrato 527.';
COMMENT ON FUNCTION public.sellar_evento_dian_tx(uuid, uuid, uuid, text, text, text, jsonb) IS
  'Sella el ApplicationResponse firmado y CUDE exactos antes del I/O DIAN; contrato 527.';
COMMENT ON FUNCTION public.finalizar_evento_dian_tx(uuid, uuid, uuid, text, text, text, jsonb, text) IS
  'Finaliza y audita un evento DIAN sin reescribir el estado fiscal de la factura; contrato 527.';
COMMENT ON FUNCTION public.listar_fev_recibidas_dian_tx(uuid, integer) IS
  'Lista FEV recibidas/eventos por tenant sin exponer XML ni credenciales; sólo service_role; contrato 527.';
COMMENT ON FUNCTION public.obtener_reintento_evento_dian_tx(uuid, uuid, uuid, text) IS
  'Recupera en servidor la intención y clave idempotente original de un evento DIAN técnico para reconciliar/reintentar por operationId; sólo service_role; contrato 527.';

COMMIT;
