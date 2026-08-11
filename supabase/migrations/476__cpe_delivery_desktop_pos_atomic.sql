-- CPE/SUNAT/POS: claims durables, finalizacion fiscal y alta POS/desktop atomicas.
-- Esta migracion no habilita legalmente el envio: certificados y credenciales
-- siguen siendo una precondicion fail-closed del backend/desktop.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE OR REPLACE FUNCTION app.assert_cpe_actor_476(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_origin text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_origin text := upper(btrim(coalesce(p_origin, '')));
BEGIN
  IF p_tenant_id IS NULL OR v_origin NOT IN ('USER', 'WORKER', 'SYSTEM') THEN
    RAISE EXCEPTION 'CPE_ACTOR_CONTEXT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_origin = 'SYSTEM' AND p_actor_id IS NULL THEN
    RETURN;
  END IF;

  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, false)
      AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'CPE_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cpe_fingerprint_476(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION app.cpe_xml_hash_matches_476(p_xml text, p_hash text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT nullif(btrim(coalesce(p_xml, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(p_hash, '')), '') IS NOT NULL
     AND upper(btrim(p_hash)) IN (
       upper(encode(extensions.digest(convert_to(p_xml, 'UTF8'), 'sha256'), 'hex')),
       upper(substr(encode(extensions.digest(convert_to(p_xml, 'UTF8'), 'sha256'), 'hex'), 1, 32)),
       upper(regexp_replace(encode(extensions.digest(convert_to(p_xml, 'UTF8'), 'sha256'), 'base64'), E'\\s+', '', 'g'))
     )
$function$;

CREATE OR REPLACE FUNCTION app.cpe_pos_items_476(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'orden', e.ordinality::integer,
    'producto_id', nullif(e.item->>'producto_id', ''),
    'codigo_producto', coalesce(nullif(e.item->>'codigo_producto', ''), nullif(e.item->>'codigo', ''), 'ITEM-' || e.ordinality),
    'descripcion', btrim(coalesce(e.item->>'descripcion', e.item->>'nombre', '')),
    'unidad_medida', upper(coalesce(nullif(e.item->>'unidad_medida', ''), nullif(e.item->>'unidad', ''), 'NIU')),
    'cantidad', round(app.to_numeric_or_zero(e.item->>'cantidad'), 6),
    'precio_unitario', round(app.to_numeric_or_zero(coalesce(e.item->>'precio_unitario', e.item->>'valor_unitario')), 6),
    'descuento_unitario', round(app.to_numeric_or_zero(coalesce(e.item->>'descuento_unitario', e.item->>'descuento')), 6),
    'valor_venta', round(app.to_numeric_or_zero(e.item->>'valor_venta'), 2),
    'impuesto_igv', round(app.to_numeric_or_zero(coalesce(e.item->>'impuesto_igv', e.item->>'igv')), 2),
    'impuesto_isc', round(app.to_numeric_or_zero(e.item->>'impuesto_isc'), 2),
    'total_item', round(app.to_numeric_or_zero(coalesce(e.item->>'total_item', e.item->>'total', e.item->>'precio_venta')), 2),
    'afectacion_igv', coalesce(nullif(e.item->>'afectacion_igv', ''), nullif(e.item->>'tipo_afectacion_igv', ''), '10')
  )) ORDER BY e.ordinality), '[]'::jsonb)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(item, ordinality)
$function$;

CREATE TABLE IF NOT EXISTS public.cpe_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cpe_id uuid NOT NULL REFERENCES public.cpe(id) ON DELETE CASCADE,
  action text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'CLAIMED',
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_expires_at timestamptz,
  attempt integer NOT NULL DEFAULT 1,
  actor_id uuid,
  origin text NOT NULL,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb,
  result_kind text,
  response_code text,
  error_message text,
  terminal_fingerprint text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_cpe_operaciones_action_476 CHECK (action IN ('SEND', 'QUERY')),
  CONSTRAINT ck_cpe_operaciones_state_476 CHECK (state IN ('CLAIMED', 'COMPLETED', 'TECHNICAL_ERROR')),
  CONSTRAINT ck_cpe_operaciones_origin_476 CHECK (origin IN ('USER', 'WORKER', 'SYSTEM')),
  CONSTRAINT ck_cpe_operaciones_result_476 CHECK (
    result_kind IS NULL OR result_kind IN ('ACCEPTED', 'PENDING', 'TECHNICAL_ERROR', 'REJECTED')
  ),
  CONSTRAINT ck_cpe_operaciones_attempt_476 CHECK (attempt > 0),
  CONSTRAINT ck_cpe_operaciones_key_476 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 255),
  CONSTRAINT ck_cpe_operaciones_fp_476 CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_cpe_operaciones_lease_476 CHECK (
    (state = 'CLAIMED' AND lease_expires_at IS NOT NULL)
    OR (state <> 'CLAIMED' AND lease_expires_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_operaciones_tenant_key_476
  ON public.cpe_operaciones (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_operaciones_active_476
  ON public.cpe_operaciones (tenant_id, cpe_id, action)
  WHERE state = 'CLAIMED';
CREATE INDEX IF NOT EXISTS ix_cpe_operaciones_cpe_created_476
  ON public.cpe_operaciones (tenant_id, cpe_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_cpe_operaciones_expired_lease_476
  ON public.cpe_operaciones (lease_expires_at)
  WHERE state = 'CLAIMED';

ALTER TABLE public.cpe_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpe_operaciones FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'cpe_operaciones');

CREATE OR REPLACE FUNCTION app.reserve_cpe_operation_476(
  p_action text,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_idempotency_key text,
  p_origin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_origin text := upper(btrim(coalesce(p_origin, '')));
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cpe public.cpe;
  v_op public.cpe_operaciones;
  v_document public.documentos;
  v_fp text;
  v_claim uuid := gen_random_uuid();
  v_attempt integer;
BEGIN
  IF v_action NOT IN ('SEND', 'QUERY') OR length(coalesce(v_key, '')) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'CPE_OPERATION_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, v_origin);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cpe:' || lower(v_action) || ':' || p_cpe_id::text, 476)
  );

  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'action', v_action,
    'cpe_id', v_cpe.id,
    'documento_id', v_cpe.documento_id,
    'tipo_documento', upper(btrim(coalesce(v_cpe.tipo_documento, ''))),
    'serie', upper(btrim(coalesce(v_cpe.serie, ''))),
    'numero', lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0'),
    'xml_sha256', CASE WHEN nullif(btrim(coalesce(v_cpe.xml_firmado, '')), '') IS NULL THEN NULL
      ELSE encode(extensions.digest(convert_to(v_cpe.xml_firmado, 'UTF8'), 'sha256'), 'hex') END,
    'hash', nullif(btrim(coalesce(v_cpe.hash_firma, v_cpe.hash, '')), '')
  ));

  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_op.cpe_id IS DISTINCT FROM p_cpe_id
       OR v_op.action IS DISTINCT FROM v_action
       OR v_op.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'CPE_OPERATION_IDEMPOTENCY_COLLISION' USING ERRCODE = '23505';
    END IF;

    IF v_op.state = 'COMPLETED' THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', true, 'reason', 'TERMINAL',
        'operation', to_jsonb(v_op), 'cpe', to_jsonb(v_cpe)
      );
    END IF;

    IF v_op.state = 'CLAIMED' AND v_op.lease_expires_at > now() THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', true, 'reason', 'IN_FLIGHT',
        'operation', to_jsonb(v_op), 'cpe', to_jsonb(v_cpe)
      );
    END IF;

    IF v_op.state = 'TECHNICAL_ERROR'
       AND v_op.next_retry_at IS NOT NULL AND v_op.next_retry_at > now() THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', true, 'reason', 'RETRY_LATER',
        'retry_at', v_op.next_retry_at,
        'operation', to_jsonb(v_op), 'cpe', to_jsonb(v_cpe)
      );
    END IF;

    IF upper(v_cpe.estado::text) IN ('ACEPTADO', 'ANULADO', 'MIGRADO', 'RECHAZADO') THEN
      RAISE EXCEPTION 'CPE_TERMINAL_NOT_CLAIMABLE' USING ERRCODE = '55000';
    END IF;

    UPDATE public.cpe_operaciones
    SET state = 'CLAIMED', claim_token = v_claim,
        lease_expires_at = now() + interval '5 minutes',
        attempt = attempt + 1, actor_id = p_actor_id, origin = v_origin,
        result_kind = NULL, response_summary = NULL, response_code = NULL,
        error_message = NULL, terminal_fingerprint = NULL,
        next_retry_at = NULL, completed_at = NULL, updated_at = now()
    WHERE id = v_op.id
    RETURNING * INTO v_op;
  ELSE
    IF v_action = 'SEND' AND EXISTS (
      SELECT 1 FROM public.cpe_operaciones o
      WHERE o.tenant_id = p_tenant_id AND o.cpe_id = p_cpe_id AND o.action = 'SEND'
    ) THEN
      RAISE EXCEPTION 'CPE_SEND_IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.cpe_operaciones o
      WHERE o.tenant_id = p_tenant_id AND o.cpe_id = p_cpe_id
        AND o.action = v_action AND o.state = 'CLAIMED'
    ) THEN
      RAISE EXCEPTION 'CPE_OPERATION_ALREADY_IN_FLIGHT' USING ERRCODE = '55P03';
    END IF;

    IF upper(v_cpe.estado::text) IN ('ACEPTADO', 'ANULADO', 'MIGRADO', 'RECHAZADO') THEN
      RAISE EXCEPTION 'CPE_TERMINAL_NOT_CLAIMABLE' USING ERRCODE = '55000';
    END IF;
    IF v_action = 'SEND' AND (
      upper(v_cpe.estado::text) NOT IN ('FIRMADO', 'ERROR', 'ENVIADO')
      OR upper(v_cpe.sunat_status::text) NOT IN ('READY', 'ERROR', 'SENDING')
      OR nullif(btrim(coalesce(v_cpe.xml_firmado, '')), '') IS NULL
      OR nullif(btrim(coalesce(v_cpe.hash_firma, v_cpe.hash, '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'CPE_NOT_READY_TO_SEND' USING ERRCODE = '55000';
    END IF;
    IF v_action = 'QUERY' AND (
      upper(v_cpe.estado::text) <> 'ENVIADO'
      OR upper(v_cpe.sunat_status::text) <> 'SENDING'
    ) THEN
      RAISE EXCEPTION 'CPE_NOT_QUERYABLE' USING ERRCODE = '55000';
    END IF;

    v_attempt := greatest(coalesce(v_cpe.retry_count, 0) + 1, 1);
    INSERT INTO public.cpe_operaciones (
      tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
      state, claim_token, lease_expires_at, attempt, actor_id, origin,
      request_summary
    ) VALUES (
      p_tenant_id, p_cpe_id, v_action, v_key, v_fp,
      'CLAIMED', v_claim, now() + interval '5 minutes', v_attempt,
      p_actor_id, v_origin,
      jsonb_build_object(
        'tipo_documento', v_cpe.tipo_documento, 'serie', v_cpe.serie,
        'numero', v_cpe.numero, 'hash', coalesce(v_cpe.hash_firma, v_cpe.hash),
        'origin', v_origin
      )
    ) RETURNING * INTO v_op;
  END IF;

  IF v_action = 'SEND' THEN
    UPDATE public.cpe
    SET estado = 'ENVIADO', estado_sunat = 'ENVIADO', sunat_status = 'SENDING',
        error_message = NULL, next_retry_at = NULL, fecha_envio = now(), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_delivery_operation_id', v_op.id, 'last_delivery_origin', v_origin,
          'delivery_contract_version', 476
        )
    WHERE id = v_cpe.id AND tenant_id = p_tenant_id
    RETURNING * INTO v_cpe;

    IF v_cpe.documento_id IS NOT NULL THEN
      UPDATE public.documentos
      SET estado = 'ENVIADO_SUNAT', estado_sunat = 'ENVIADO', error_sunat = NULL,
          updated_by = coalesce(p_actor_id, updated_by), updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'last_cpe_operation_id', v_op.id, 'fiscal_contract_version', 476
          )
      WHERE id = v_cpe.documento_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_document;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'claimed', true, 'idempotent', v_op.attempt > 1,
    'operation', to_jsonb(v_op), 'cpe', to_jsonb(v_cpe),
    'documento', CASE WHEN v_document.id IS NULL THEN NULL ELSE to_jsonb(v_document) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.finalize_cpe_operation_476(
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
  v_terminal_fp text;
  v_next_retry timestamptz;
  v_cpe_estado text;
  v_sunat_status text;
  v_estado_sunat text;
  v_document_estado text;
  v_document_sunat text;
BEGIN
  IF v_action NOT IN ('SEND', 'QUERY')
     OR v_kind NOT IN ('ACCEPTED', 'PENDING', 'TECHNICAL_ERROR', 'REJECTED')
     OR p_claim_token IS NULL OR v_code IS NULL OR v_description IS NULL
     OR jsonb_typeof(coalesce(p_response_summary, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CPE_FINALIZATION_EVIDENCE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'ACCEPTED' AND nullif(btrim(coalesce(p_cdr, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CPE_ACCEPTANCE_REQUIRES_CDR' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_op
  FROM public.cpe_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id AND o.action = v_action
  FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'CPE_OPERATION_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cpe:' || lower(v_action) || ':' || v_op.cpe_id::text, 476)
  );
  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = v_op.cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_terminal_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'result_kind', v_kind, 'response_code', v_code, 'description', v_description,
    'cdr_sha256', CASE WHEN nullif(btrim(coalesce(p_cdr, '')), '') IS NULL THEN NULL
      ELSE encode(extensions.digest(convert_to(p_cdr, 'UTF8'), 'sha256'), 'hex') END,
    'external_hash', nullif(btrim(coalesce(p_external_hash, '')), ''),
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

  CASE v_kind
    WHEN 'ACCEPTED' THEN
      v_cpe_estado := 'ACEPTADO'; v_sunat_status := 'ACCEPTED'; v_estado_sunat := 'ACEPTADO';
      -- documentos.estado conserva el vocabulario operativo canónico; el
      -- resultado fiscal terminal vive inequívocamente en estado_sunat.
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
      cdr_sunat = CASE WHEN v_kind = 'ACCEPTED' THEN p_cdr ELSE cdr_sunat END,
      hash = coalesce(nullif(btrim(p_external_hash), ''), hash),
      numero_comprobante_sunat = coalesce(nullif(btrim(p_external_number), ''), numero_comprobante_sunat),
      error_message = CASE WHEN v_kind IN ('TECHNICAL_ERROR', 'REJECTED')
        THEN left(v_code || ': ' || v_description, 1000) ELSE NULL END,
      retry_count = CASE WHEN v_kind = 'TECHNICAL_ERROR'
        THEN greatest(coalesce(retry_count, 0), v_op.attempt) ELSE retry_count END,
      next_retry_at = v_next_retry, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_delivery_operation_id', v_op.id, 'last_delivery_result', v_kind,
        'delivery_contract_version', 476
      )
  WHERE id = v_op.cpe_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cpe;

  IF v_cpe.documento_id IS NOT NULL THEN
    UPDATE public.documentos
    SET estado = v_document_estado, estado_sunat = v_document_sunat,
        cdr_content = CASE WHEN v_kind = 'ACCEPTED' THEN p_cdr ELSE cdr_content END,
        codigo_hash = coalesce(nullif(btrim(p_external_hash), ''), codigo_hash),
        error_sunat = CASE WHEN v_kind IN ('TECHNICAL_ERROR', 'REJECTED')
          THEN left(v_code || ': ' || v_description, 1000) ELSE NULL END,
        updated_by = coalesce(v_op.actor_id, updated_by), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_cpe_operation_id', v_op.id, 'last_fiscal_result', v_kind,
          'fiscal_contract_version', 476
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
        jsonb_build_object('cpe_operation_id', v_op.id, 'contract_version', 476),
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

CREATE OR REPLACE FUNCTION public.reservar_envio_cpe_tx(
  p_tenant_id uuid, p_actor_id uuid, p_cpe_id uuid,
  p_idempotency_key text, p_origin text DEFAULT 'USER'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.reserve_cpe_operation_476('SEND', p_tenant_id, p_actor_id, p_cpe_id, p_idempotency_key, p_origin)
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
  SELECT app.finalize_cpe_operation_476(
    'SEND', p_tenant_id, p_operation_id, p_claim_token, p_result_kind,
    p_response_code, p_description, p_cdr, p_external_hash,
    p_external_number, p_response_summary
  )
$function$;

CREATE OR REPLACE FUNCTION public.reservar_consulta_cpe_tx(
  p_tenant_id uuid, p_actor_id uuid, p_cpe_id uuid,
  p_idempotency_key text, p_origin text DEFAULT 'USER'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.reserve_cpe_operation_476('QUERY', p_tenant_id, p_actor_id, p_cpe_id, p_idempotency_key, p_origin)
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
  SELECT app.finalize_cpe_operation_476(
    'QUERY', p_tenant_id, p_operation_id, p_claim_token, p_result_kind,
    p_response_code, p_description, p_cdr, p_external_hash,
    p_external_number, p_response_summary
  )
$function$;

CREATE OR REPLACE FUNCTION public.registrar_cpe_desktop_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cpe jsonb := coalesce(p_payload->'cpe', '{}'::jsonb);
  v_document jsonb := coalesce(p_payload->'documento', '{}'::jsonb);
  v_details jsonb := coalesce(p_payload->'detalles', '[]'::jsonb);
BEGIN
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, 'USER');
  IF upper(btrim(coalesce(v_cpe->>'tipo_documento', ''))) IN ('07', '08') THEN
    RAISE EXCEPTION 'CPE_DESKTOP_NOTE_REQUIRES_REFERENCED_NOTES_472' USING ERRCODE = '22023';
  END IF;
  IF upper(btrim(coalesce(v_cpe->>'tipo_documento', ''))) NOT IN ('01', '03')
     OR jsonb_typeof(v_details) <> 'array' OR jsonb_array_length(v_details) = 0 THEN
    RAISE EXCEPTION 'CPE_DESKTOP_PAYLOAD_INVALID' USING ERRCODE = '23514';
  END IF;

  v_cpe := v_cpe || jsonb_build_object('created_by', p_actor_id);
  v_document := v_document || jsonb_build_object(
    'metadata', coalesce(v_document->'metadata', '{}'::jsonb) || jsonb_build_object(
      'source', 'cpe.api.atomic', 'desktop_offline', true, 'atomic_rpc', 'registrar_cpe_desktop_tx',
      'schema_version', 476
    )
  );

  RETURN app.emitir_factura_cliente_tx(
    p_tenant_id, v_cpe, v_document, v_details, NULL,
    gen_random_uuid(), p_idempotency_key
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_cpe_pos_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_venta_id uuid,
  p_cpe jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_venta public.ventas_pos;
  v_document public.documentos;
  v_cpe public.cpe;
  v_items jsonb;
  v_passed_items jsonb;
  v_item record;
  v_existing_detail public.documento_detalles;
  v_count integer;
  v_subtotal numeric;
  v_igv numeric;
  v_isc numeric;
  v_total numeric;
  v_fp text;
  v_event_id uuid;
  v_outbox public.outbox_events;
  v_repaired boolean := false;
  v_tipo text;
  v_serie text;
  v_numero text;
BEGIN
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, 'WORKER');
  IF length(coalesce(v_key, '')) NOT BETWEEN 8 AND 255
     OR jsonb_typeof(coalesce(p_cpe, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'POS_CPE_FINALIZE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':pos:cpe:' || p_venta_id::text, 476)
  );

  SELECT * INTO v_venta
  FROM public.ventas_pos v
  WHERE v.id = p_venta_id AND v.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SALE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF upper(coalesce(v_venta.estado, '')) <> 'PAGADA'
     OR coalesce(v_venta.tipo_emision, '') = 'TICKET'
     OR v_venta.documento_id IS NULL OR v_venta.cpe_data IS NULL
     OR v_venta.accounting_event_id IS NULL OR v_venta.atomic_result IS NULL THEN
    RAISE EXCEPTION 'POS_SALE_NOT_READY_FOR_CPE' USING ERRCODE = '23514';
  END IF;
  IF p_actor_id IS DISTINCT FROM v_venta.usuario_id THEN
    RAISE EXCEPTION 'POS_CPE_ACTOR_MUST_OWN_SALE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_document
  FROM public.documentos d
  WHERE d.id = v_venta.documento_id AND d.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_RESERVED_DOCUMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_tipo := upper(btrim(coalesce(v_venta.cpe_data->>'tipo_documento', '')));
  v_serie := upper(btrim(coalesce(v_venta.cpe_data->>'serie', '')));
  v_numero := lpad(btrim(coalesce(v_venta.cpe_data->>'numero', '')), 8, '0');
  v_items := app.cpe_pos_items_476(v_venta.cpe_data->'items');
  v_passed_items := app.cpe_pos_items_476(p_cpe->'items');
  SELECT count(*), coalesce(round(sum((e->>'valor_venta')::numeric), 2), 0),
         coalesce(round(sum((e->>'impuesto_igv')::numeric), 2), 0),
         coalesce(round(sum((e->>'impuesto_isc')::numeric), 2), 0),
         coalesce(round(sum((e->>'total_item')::numeric), 2), 0)
    INTO v_count, v_subtotal, v_igv, v_isc, v_total
  FROM jsonb_array_elements(v_items) e;

  IF v_tipo NOT IN ('01', '03') OR v_serie = '' OR v_numero !~ '^[0-9]{8}$'
     OR v_count < 1 OR v_items IS DISTINCT FROM v_passed_items
     OR v_venta.cpe_data->>'documento_id' IS DISTINCT FROM v_document.id::text
     OR v_venta.cpe_data->>'venta_pos_id' IS DISTINCT FROM v_venta.id::text
     OR v_venta.cpe_data->>'idempotency_key' IS DISTINCT FROM v_key
     OR upper(btrim(coalesce(p_cpe->>'tipo_documento', ''))) IS DISTINCT FROM v_tipo
     OR upper(btrim(coalesce(p_cpe->>'serie', ''))) IS DISTINCT FROM v_serie
     OR lpad(btrim(coalesce(p_cpe->>'numero', '')), 8, '0') IS DISTINCT FROM v_numero
     OR btrim(coalesce(p_cpe->>'documento_receptor', ''))
        IS DISTINCT FROM btrim(coalesce(v_venta.cliente_documento, ''))
     OR abs(app.to_numeric_or_zero(p_cpe->>'total_venta') - coalesce(v_venta.total, 0)) > 0.01
     OR abs(v_total - coalesce(v_venta.total, 0)) > 0.01
     OR abs(v_igv - coalesce(v_venta.impuestos, 0)) > 0.01
     OR abs(v_subtotal - coalesce(v_document.subtotal, 0)) > 0.01
     OR NOT app.cpe_xml_hash_matches_476(p_cpe->>'xml_firmado', coalesce(p_cpe->>'hash_firma', p_cpe->>'hash')) THEN
    RAISE EXCEPTION 'POS_CPE_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e
    WHERE btrim(coalesce(e->>'descripcion', '')) = ''
       OR (e->>'cantidad')::numeric <= 0
       OR least((e->>'precio_unitario')::numeric, (e->>'valor_venta')::numeric,
                (e->>'impuesto_igv')::numeric, (e->>'impuesto_isc')::numeric,
                (e->>'total_item')::numeric) < 0
       OR abs((e->>'total_item')::numeric - ((e->>'valor_venta')::numeric
          + (e->>'impuesto_igv')::numeric + (e->>'impuesto_isc')::numeric)) > 0.01
       OR (nullif(e->>'producto_id', '') IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.productos p
          WHERE p.id = (e->>'producto_id')::uuid AND p.tenant_id = p_tenant_id
       ))
  ) THEN
    RAISE EXCEPTION 'POS_CPE_ITEMS_INVALID' USING ERRCODE = '23514';
  END IF;

  v_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'venta_id', v_venta.id, 'documento_id', v_document.id, 'key', v_key,
    'tipo', v_tipo, 'serie', v_serie, 'numero', v_numero,
    'receptor', btrim(coalesce(v_venta.cliente_documento, '')),
    'moneda', v_venta.moneda, 'subtotal', v_subtotal, 'igv', v_igv,
    'isc', v_isc, 'total', v_total, 'items', v_items,
    'xml_sha256', encode(extensions.digest(convert_to(p_cpe->>'xml_firmado', 'UTF8'), 'sha256'), 'hex')
  ));

  IF v_venta.cpe_id IS NOT NULL THEN
    SELECT * INTO v_cpe FROM public.cpe c
    WHERE c.id = v_venta.cpe_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  ELSE
    SELECT * INTO v_cpe FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key FOR UPDATE;
  END IF;

  IF FOUND THEN
    IF v_cpe.documento_id IS DISTINCT FROM v_document.id
       OR upper(coalesce(v_cpe.tipo_documento, '')) IS DISTINCT FROM v_tipo
       OR upper(coalesce(v_cpe.serie, '')) IS DISTINCT FROM v_serie
       OR lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0') IS DISTINCT FROM v_numero
       OR v_cpe.idempotency_key IS DISTINCT FROM v_key
       OR coalesce(v_cpe.metadata->>'pos_finalization_fingerprint', v_fp) IS DISTINCT FROM v_fp
       OR v_cpe.xml_firmado IS DISTINCT FROM p_cpe->>'xml_firmado' THEN
      RAISE EXCEPTION 'POS_CPE_EXISTING_COLLISION' USING ERRCODE = '23505';
    END IF;
    v_repaired := v_venta.cpe_id IS NULL OR coalesce(v_venta.cpe_pendiente, false);
  ELSE
    v_event_id := gen_random_uuid();
    INSERT INTO public.cpe (
      tenant_id, documento_id, tipo_documento, serie, numero, numero_comprobante,
      ruc_emisor, razon_social_emisor, direccion_emisor,
      tipo_documento_receptor, documento_receptor, razon_social_receptor,
      direccion_receptor, cliente_id, moneda,
      total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
      total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
      idempotency_key, event_id, estado, estado_sunat, sunat_status,
      hash, hash_firma, xml_firmado, created_by, activo, metadata,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, v_document.id, v_tipo, v_serie, v_numero, v_numero::integer,
      p_cpe->>'ruc_emisor', p_cpe->>'razon_social_emisor', p_cpe->>'direccion_emisor',
      p_cpe->>'tipo_documento_receptor', p_cpe->>'documento_receptor',
      p_cpe->>'razon_social_receptor', p_cpe->>'direccion_receptor',
      v_venta.cliente_id, upper(coalesce(nullif(p_cpe->>'moneda', ''), v_venta.moneda)),
      app.to_numeric_or_zero(p_cpe->>'total_gravadas'),
      app.to_numeric_or_zero(p_cpe->>'total_exoneradas'),
      app.to_numeric_or_zero(p_cpe->>'total_inafectas'),
      app.to_numeric_or_zero(p_cpe->>'total_exportacion'),
      v_igv, v_total, v_total, p_cpe->'items',
      coalesce(nullif(p_cpe->>'fecha_emision', '')::timestamptz, v_document.fecha_emision),
      coalesce(nullif(p_cpe->>'fecha_vencimiento', '')::date, v_document.fecha_vencimiento::date),
      v_key, v_event_id, 'FIRMADO', 'PENDIENTE', 'READY',
      coalesce(p_cpe->>'hash', p_cpe->>'hash_firma'),
      coalesce(p_cpe->>'hash_firma', p_cpe->>'hash'), p_cpe->>'xml_firmado',
      p_actor_id, true, jsonb_build_object(
        'source', 'pos.atomic.476', 'venta_pos_id', v_venta.id,
        'pos_finalization_fingerprint', v_fp, 'atomic_rpc', 'finalizar_cpe_pos_tx',
        'schema_version', 476
      ), now(), now()
    ) RETURNING * INTO v_cpe;
  END IF;

  FOR v_item IN SELECT e AS item FROM jsonb_array_elements(v_items) e
  LOOP
    SELECT * INTO v_existing_detail
    FROM public.documento_detalles dd
    WHERE dd.documento_id = v_document.id AND dd.orden = (v_item.item->>'orden')::integer
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing_detail.producto_id IS DISTINCT FROM nullif(v_item.item->>'producto_id', '')::uuid
         OR btrim(coalesce(v_existing_detail.descripcion, '')) IS DISTINCT FROM v_item.item->>'descripcion'
         OR abs(coalesce(v_existing_detail.cantidad, 0) - (v_item.item->>'cantidad')::numeric) > 0.0001
         OR abs(coalesce(v_existing_detail.valor_venta, 0) - (v_item.item->>'valor_venta')::numeric) > 0.01
         OR abs(coalesce(v_existing_detail.impuesto_igv, 0) - (v_item.item->>'impuesto_igv')::numeric) > 0.01
         OR abs(coalesce(v_existing_detail.total_item, 0) - (v_item.item->>'total_item')::numeric) > 0.01 THEN
        RAISE EXCEPTION 'POS_DOCUMENT_DETAIL_COLLISION' USING ERRCODE = '23505';
      END IF;
    ELSE
      INSERT INTO public.documento_detalles (
        tenant_id, documento_id, orden, producto_id, codigo_producto,
        descripcion, unidad_medida, cantidad, precio_unitario,
        descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
        total_item, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_document.id, (v_item.item->>'orden')::integer,
        nullif(v_item.item->>'producto_id', '')::uuid,
        v_item.item->>'codigo_producto', v_item.item->>'descripcion',
        v_item.item->>'unidad_medida', (v_item.item->>'cantidad')::numeric,
        (v_item.item->>'precio_unitario')::numeric,
        (v_item.item->>'descuento_unitario')::numeric,
        (v_item.item->>'valor_venta')::numeric,
        (v_item.item->>'impuesto_igv')::numeric,
        (v_item.item->>'impuesto_isc')::numeric,
        (v_item.item->>'total_item')::numeric,
        jsonb_build_object('source', 'pos.atomic.476', 'pos_finalization_fingerprint', v_fp),
        now(), now()
      );
      v_repaired := true;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.documento_detalles dd WHERE dd.documento_id = v_document.id) <> v_count THEN
    RAISE EXCEPTION 'POS_DOCUMENT_DETAIL_COUNT_COLLISION' USING ERRCODE = '23505';
  END IF;

  UPDATE public.documentos
  SET estado = 'EMITIDO', estado_sunat = 'PENDIENTE',
      xml_content = p_cpe->>'xml_firmado', codigo_hash = coalesce(p_cpe->>'hash_firma', p_cpe->>'hash'),
      error_sunat = NULL, updated_by = p_actor_id, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'pos.atomic.476', 'venta_pos_id', v_venta.id, 'cpe_id', v_cpe.id,
        'cpe_pendiente', false, 'pos_finalization_fingerprint', v_fp,
        'atomic_rpc', 'finalizar_cpe_pos_tx', 'schema_version', 476
      )
  WHERE id = v_document.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_document;

  UPDATE public.ventas_pos
  SET cpe_id = v_cpe.id, cpe_pendiente = false, error_facturacion = NULL,
      ultimo_intento_facturacion = now(), updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cpe_finalized_by', 'finalizar_cpe_pos_tx', 'cpe_finalization_fingerprint', v_fp,
        'cpe_finalized_at', now(), 'schema_version', 476
      )
  WHERE id = v_venta.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_venta;

  SELECT * INTO v_outbox
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id AND o.event_type = 'comprobante.creado'
    AND o.idempotency_key = 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_outbox.aggregate_id IS DISTINCT FROM v_cpe.id::text
       OR v_outbox.payload->>'ventaId' IS DISTINCT FROM v_venta.id::text
       OR v_outbox.payload->>'facturaId' IS DISTINCT FROM v_document.id::text THEN
      RAISE EXCEPTION 'POS_CPE_OUTBOX_COLLISION' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_event_id := coalesce(v_cpe.event_id, gen_random_uuid());
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, 'cpe', v_cpe.id::text, 'comprobante.creado',
      jsonb_build_object(
        'eventId', v_event_id, 'tenantId', p_tenant_id,
        'idempotencyKey', 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id,
        'cpeId', v_cpe.id, 'facturaId', v_document.id,
        'tipoDocumento', v_tipo, 'serie', v_serie, 'numero', v_numero::integer,
        'clienteId', coalesce(v_venta.cliente_id::text, v_venta.cliente_documento),
        'total', v_total, 'esCredito', v_venta.credito_monto > 0,
        'ventaId', v_venta.id, 'requiereTransporte', false,
        'moneda', v_venta.moneda, 'source', 'pos.atomic.476'
      ),
      'pending', 0, 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id,
      v_event_id, now(), now(), now()
    );
  END IF;

  RETURN jsonb_build_object(
    'cpe', to_jsonb(v_cpe), 'cpe_id', v_cpe.id,
    'documento_id', v_document.id, 'venta', to_jsonb(v_venta),
    'idempotent', NOT v_repaired, 'repaired', v_repaired
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_fallo_cpe_pos_tx(
  p_tenant_id uuid,
  p_venta_id uuid,
  p_error_message text,
  p_failure_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_venta public.ventas_pos;
  v_key text := nullif(btrim(coalesce(p_failure_key, '')), '');
BEGIN
  IF length(coalesce(v_key, '')) NOT BETWEEN 8 AND 255
     OR nullif(btrim(coalesce(p_error_message, '')), '') IS NULL THEN
    RAISE EXCEPTION 'POS_CPE_FAILURE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':pos:cpe:' || p_venta_id::text, 476));
  SELECT * INTO v_venta FROM public.ventas_pos
  WHERE id = p_venta_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_venta.cpe_id IS NOT NULL OR NOT coalesce(v_venta.cpe_pendiente, false) THEN
    RETURN jsonb_build_object('idempotent', true, 'venta', to_jsonb(v_venta));
  END IF;
  IF v_venta.metadata->>'last_cpe_failure_key' = v_key THEN
    RETURN jsonb_build_object('idempotent', true, 'venta', to_jsonb(v_venta));
  END IF;
  UPDATE public.ventas_pos
  SET intentos_facturacion = coalesce(intentos_facturacion, 0) + 1,
      ultimo_intento_facturacion = now(), error_facturacion = left(p_error_message, 500),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_cpe_failure_key', v_key, 'last_cpe_failure_at', now(),
        'cpe_failure_contract_version', 476
      ), updated_at = now()
  WHERE id = p_venta_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_venta;
  RETURN jsonb_build_object('idempotent', false, 'venta', to_jsonb(v_venta));
END;
$function$;

REVOKE ALL ON TABLE public.cpe_operaciones FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.cpe_operaciones FROM service_role;
GRANT SELECT ON TABLE public.cpe_operaciones TO service_role;

REVOKE ALL ON FUNCTION app.assert_cpe_actor_476(uuid, uuid, text),
  app.cpe_fingerprint_476(jsonb), app.cpe_xml_hash_matches_476(text, text),
  app.cpe_pos_items_476(jsonb),
  app.reserve_cpe_operation_476(text, uuid, uuid, uuid, text, text),
  app.finalize_cpe_operation_476(text, uuid, uuid, uuid, text, text, text, text, text, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.reservar_envio_cpe_tx(uuid, uuid, uuid, text, text),
  public.finalizar_envio_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  public.reservar_consulta_cpe_tx(uuid, uuid, uuid, text, text),
  public.finalizar_consulta_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  public.registrar_cpe_desktop_tx(uuid, uuid, jsonb, text),
  public.finalizar_cpe_pos_tx(uuid, uuid, uuid, jsonb, text),
  public.registrar_fallo_cpe_pos_tx(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reservar_envio_cpe_tx(uuid, uuid, uuid, text, text),
  public.finalizar_envio_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  public.reservar_consulta_cpe_tx(uuid, uuid, uuid, text, text),
  public.finalizar_consulta_cpe_tx(uuid, uuid, uuid, text, text, text, text, text, text, jsonb),
  public.registrar_cpe_desktop_tx(uuid, uuid, jsonb, text),
  public.finalizar_cpe_pos_tx(uuid, uuid, uuid, jsonb, text),
  public.registrar_fallo_cpe_pos_tx(uuid, uuid, text, text)
TO service_role;

COMMENT ON TABLE public.cpe_operaciones IS
  'Claims durables e idempotentes de envio/consulta CPE. No almacena credenciales ni certificados.';
COMMENT ON FUNCTION public.finalizar_cpe_pos_tx(uuid, uuid, uuid, jsonb, text) IS
  'Finaliza snapshot fiscal POS, lineas, CPE, documento, venta y un comprobante.creado en un commit; no repite efectos de caja/stock/CxC.';

NOTIFY pgrst, 'reload schema';

COMMIT;
