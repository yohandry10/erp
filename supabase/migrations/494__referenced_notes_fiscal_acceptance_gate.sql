BEGIN;

SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

DO $preflight$
BEGIN
  IF to_regprocedure('public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)') IS NULL
     OR to_regprocedure('app.finalize_cpe_operation_476(text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regclass('public.notas_referenciadas_operaciones') IS NULL
     OR to_regclass('public.cpe_operaciones') IS NULL THEN
    RAISE EXCEPTION '494 requiere los contratos de notas 472 y entrega fiscal 476';
  END IF;
END
$preflight$;

-- Una nota referenciada es primero un documento fiscal pendiente. Su efecto
-- financiero nace únicamente de la aceptación fiscal durable con CDR.
ALTER TABLE public.notas_referenciadas_operaciones
  DROP CONSTRAINT IF EXISTS ck_nota_ref_operacion_tipo_472;
ALTER TABLE public.notas_referenciadas_operaciones
  DROP CONSTRAINT IF EXISTS ck_nota_ref_operacion_tipo_494;
ALTER TABLE public.notas_referenciadas_operaciones
  ADD CONSTRAINT ck_nota_ref_operacion_tipo_494 CHECK (
    tipo_operacion IN ('CREAR', 'FIRMAR', 'APLICAR_ACEPTACION')
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_nota_ref_acceptance_cpe_494
  ON public.notas_referenciadas_operaciones (tenant_id, nota_cpe_id)
  WHERE tipo_operacion = 'APLICAR_ACEPTACION' AND nota_cpe_id IS NOT NULL;

-- Conservamos 472 como evidencia histórica y colocamos delante un wrapper.
-- El rename es condicional para que una reconstrucción interrumpida falle de
-- manera determinista y no encadene wrappers múltiples.
DO $rename_legacy$
BEGIN
  IF to_regprocedure('public.crear_nota_referenciada_legacy_494(uuid,uuid,uuid,text,text,text,numeric,text)') IS NULL THEN
    ALTER FUNCTION public.crear_nota_referenciada_tx(
      uuid, uuid, uuid, text, text, text, numeric, text
    ) RENAME TO crear_nota_referenciada_legacy_494;
  END IF;
END
$rename_legacy$;

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
  v_note_event_id uuid;
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
BEGIN
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

  v_result := public.crear_nota_referenciada_legacy_494(
    p_tenant_id, p_actor_id, p_documento_origen_id, p_tipo_documento,
    p_codigo_motivo, p_motivo, p_monto_total, p_idempotency_key
  );

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

  IF NOT FOUND
     OR upper(v_origin_cpe.estado::text) <> 'ACEPTADO'
     OR upper(coalesce(v_origin_cpe.sunat_status::text, '')) <> 'ACCEPTED'
     OR upper(coalesce(v_origin_cpe.estado_sunat::text, '')) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_origin_cpe.cdr_sunat, '')), '') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.documentos d
       WHERE d.id = p_documento_origen_id AND d.tenant_id = p_tenant_id
         AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
         AND nullif(btrim(coalesce(d.cdr_content, '')), '') IS NOT NULL
     ) THEN
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
        'financial_effect_contract_version', 494,
        'financial_effect_event_id', v_note_event_id
      ),
      updated_at = now()
  WHERE id = v_note_cpe_id AND tenant_id = p_tenant_id;

  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 494
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
        'financial_effect_contract_version', 494,
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
  IF NOT FOUND
     OR upper(v_cpe.estado::text) <> 'ACEPTADO'
     OR upper(coalesce(v_cpe.sunat_status::text, '')) <> 'ACCEPTED'
     OR upper(coalesce(v_cpe.estado_sunat::text, '')) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_cpe.cdr_sunat, '')), '') IS NULL THEN
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

  IF v_note.id IS NULL OR v_origin.id IS NULL OR v_origin_cpe.id IS NULL
     OR upper(v_origin_cpe.estado::text) <> 'ACEPTADO'
     OR upper(coalesce(v_origin_cpe.sunat_status::text, '')) <> 'ACCEPTED'
     OR upper(coalesce(v_origin_cpe.estado_sunat::text, '')) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_origin_cpe.cdr_sunat, '')), '') IS NULL THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACCEPTED_SOURCE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF upper(coalesce(v_origin.estado_sunat::text, '')) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_origin.cdr_content, '')), '') IS NULL THEN
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
    'version', 494,
    'tenant_id', p_tenant_id,
    'cpe_id', p_cpe_id,
    'documento_id', v_note.id,
    'documento_origen_id', v_origin.id,
    'tipo_documento', v_type,
    'monto', v_amount,
    'cdr_sha256', encode(extensions.digest(
      convert_to(v_cpe.cdr_sunat, 'UTF8'), 'sha256'
    ), 'hex')
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
            'financial_effect_contract_version', 494
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
        'financial_effect_contract_version', 494
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
      'fiscalAcceptanceCdrSha256', encode(extensions.digest(
        convert_to(v_cpe.cdr_sunat, 'UTF8'), 'sha256'
      ), 'hex')
    )
  );

  UPDATE public.cpe
  SET event_id = v_event_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'APPLIED_ON_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 494,
        'financial_effect_fingerprint', v_fingerprint,
        'financial_effect_applied_at', clock_timestamp()
      ),
      updated_at = now()
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;
  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'APPLIED_ON_FISCAL_ACCEPTANCE',
        'financial_effect_contract_version', 494,
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
      'contract_version', 494, 'cdr_sha256', encode(extensions.digest(
        convert_to(v_cpe.cdr_sunat, 'UTF8'), 'sha256'
      ), 'hex')
    ), v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.enforce_nota_fiscal_effect_494()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF upper(coalesce(NEW.tipo_documento, '')) NOT IN ('07', '08') THEN
    RETURN NEW;
  END IF;

  IF upper(NEW.estado::text) = 'ACEPTADO'
     AND upper(coalesce(NEW.sunat_status::text, '')) = 'ACCEPTED'
     AND (
       upper(coalesce(OLD.estado::text, '')) <> 'ACEPTADO'
       OR upper(coalesce(OLD.sunat_status::text, '')) <> 'ACCEPTED'
     ) THEN
    PERFORM app.aplicar_efecto_nota_aceptada_494(NEW.tenant_id, NEW.id);
  ELSIF upper(NEW.estado::text) = 'RECHAZADO'
     AND upper(coalesce(OLD.estado::text, '')) <> 'RECHAZADO' THEN
    IF EXISTS (
      SELECT 1 FROM public.notas_referenciadas_operaciones o
      WHERE o.tenant_id = NEW.tenant_id AND o.nota_cpe_id = NEW.id
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
        'financial_effect_contract_version', 494
      ), updated_at = now()
    WHERE id = NEW.id AND tenant_id = NEW.tenant_id;
    UPDATE public.documentos SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT',
        'financial_effect_contract_version', 494
      ), updated_at = now()
    WHERE id = NEW.documento_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill seguro. Los efectos todavía no procesados se retiran y se vuelven
-- a aplicar por el trigger sólo si llega un CDR aceptado. Si el legado ya fue
-- contabilizado o consumido, se aborta: una migración no inventa compensaciones.
CREATE OR REPLACE FUNCTION app.reparar_notas_referenciadas_legacy_494()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $backfill$
DECLARE
  r record;
  v_outbox_ids uuid[];
  v_payment numeric(14,2);
  v_balance numeric(14,2);
  v_current numeric(14,2);
  v_new numeric(14,2);
  v_note_total numeric(14,2);
  v_event_id uuid;
  v_actor uuid;
  v_fingerprint text;
  v_result jsonb;
BEGIN
  FOR r IN
    SELECT c.*, d.documento_origen_id, d.total AS note_total,
           d.created_by AS document_actor,
           d.estado_sunat AS document_estado_sunat,
           d.cdr_content AS document_cdr_content
    FROM public.cpe c
    JOIN public.documentos d ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    WHERE upper(c.tipo_documento) IN ('07', '08')
      AND (
        c.metadata->>'atomic_rpc' = 'crear_nota_referenciada_tx'
        OR d.metadata->>'atomic_rpc' = 'crear_nota_referenciada_tx'
      )
      AND coalesce(
        c.metadata->>'financial_effect_contract_version',
        d.metadata->>'financial_effect_contract_version',
        '0'
      ) <> '494'
      AND NOT EXISTS (
        SELECT 1 FROM public.notas_referenciadas_operaciones applied
        WHERE applied.tenant_id = c.tenant_id
          AND applied.nota_cpe_id = c.id
          AND applied.tipo_operacion = 'APLICAR_ACEPTACION'
      )
    ORDER BY c.tenant_id, c.created_at, c.id
    FOR UPDATE OF c, d
  LOOP
    SELECT coalesce(array_agg(o.id), ARRAY[]::uuid[]) INTO v_outbox_ids
    FROM public.outbox_events o
    WHERE o.tenant_id = r.tenant_id AND o.aggregate_id = r.documento_id::text
      AND o.event_type IN ('nota_credito.emitida', 'nota_debito.emitida');
    v_event_id := coalesce(r.event_id, gen_random_uuid());
    v_note_total := round(coalesce(r.note_total, r.total_venta, r.total, 0), 2);

    IF (
         upper(r.estado::text) = 'ACEPTADO'
         OR upper(coalesce(r.sunat_status::text, '')) = 'ACCEPTED'
         OR upper(coalesce(r.estado_sunat::text, '')) = 'ACEPTADO'
       ) AND NOT (
         upper(r.estado::text) = 'ACEPTADO'
         AND upper(coalesce(r.sunat_status::text, '')) = 'ACCEPTED'
         AND upper(coalesce(r.estado_sunat::text, '')) = 'ACEPTADO'
         AND nullif(btrim(coalesce(r.cdr_sunat, '')), '') IS NOT NULL
         AND upper(coalesce(r.document_estado_sunat::text, '')) = 'ACEPTADO'
         AND nullif(btrim(coalesce(r.document_cdr_content, '')), '') IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'LEGACY_REFERENCED_NOTE_ACCEPTED_EVIDENCE_INCOMPLETE:%', r.id
        USING ERRCODE = '23514';
    END IF;

    IF upper(r.estado::text) = 'ACEPTADO'
       AND upper(coalesce(r.sunat_status::text, '')) = 'ACCEPTED'
       AND upper(coalesce(r.estado_sunat::text, '')) = 'ACEPTADO'
       AND nullif(btrim(coalesce(r.cdr_sunat, '')), '') IS NOT NULL
       AND upper(coalesce(r.document_estado_sunat::text, '')) = 'ACEPTADO'
       AND nullif(btrim(coalesce(r.document_cdr_content, '')), '') IS NOT NULL THEN
      SELECT coalesce(sum(p.monto), 0) INTO v_payment
      FROM public.cxc_pagos p
      WHERE p.tenant_id = r.tenant_id AND p.documento_id = r.documento_id
        AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO';
      SELECT coalesce(sum(s.monto_original), 0) INTO v_balance
      FROM public.saldos_favor_clientes s
      WHERE s.tenant_id = r.tenant_id
        AND s.nota_credito_documento_id = r.documento_id;

      IF upper(r.tipo_documento) = '07'
         AND cardinality(v_outbox_ids) > 0
         AND abs(round(v_payment + v_balance, 2) - v_note_total) <= 0.01 THEN
        NULL;
      ELSIF upper(r.tipo_documento) = '08'
         AND cardinality(v_outbox_ids) > 0
         AND EXISTS (
           SELECT 1 FROM public.cuentas_por_cobrar c
           WHERE c.tenant_id = r.tenant_id AND c.documento_id = r.documento_id
             AND abs(round(c.monto_total, 2) - v_note_total) <= 0.01
         ) THEN
        NULL;
      ELSIF cardinality(v_outbox_ids) = 0 AND v_payment = 0 AND v_balance = 0
         AND NOT EXISTS (
           SELECT 1 FROM public.cuentas_por_cobrar c
           WHERE c.tenant_id = r.tenant_id AND c.documento_id = r.documento_id
         ) THEN
        PERFORM app.aplicar_efecto_nota_aceptada_494(r.tenant_id, r.id);
        CONTINUE;
      ELSE
        RAISE EXCEPTION 'LEGACY_REFERENCED_NOTE_ACCEPTED_PARTIAL_EFFECT:%', r.id
          USING ERRCODE = '23514';
      END IF;

      v_actor := coalesce(r.created_by, r.document_actor);
      v_fingerprint := app.nota_fingerprint_472(jsonb_build_object(
        'version', 494, 'legacy', true, 'cpe_id', r.id,
        'event_id', v_event_id, 'total', v_note_total
      ));
      v_result := jsonb_build_object(
        'success', true, 'cpe_id', r.id, 'documento_id', r.documento_id,
        'financial_effect_status', 'LEGACY_EFFECT_CONFIRMED_ACCEPTED',
        'event_id', v_event_id, 'idempotent', false
      );
      INSERT INTO public.notas_referenciadas_operaciones (
        tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
        documento_origen_id, nota_documento_id, nota_cpe_id, event_id,
        payload, resultado
      ) VALUES (
        r.tenant_id, v_actor, 'APLICAR_ACEPTACION',
        format('nota-accepted:%s', r.id), v_fingerprint,
        r.documento_origen_id, r.documento_id, r.id, v_event_id,
        jsonb_build_object('contract_version', 494, 'legacy', true), v_result
      ) ON CONFLICT (tenant_id, nota_cpe_id)
        WHERE tipo_operacion = 'APLICAR_ACEPTACION' AND nota_cpe_id IS NOT NULL
        DO NOTHING;
      UPDATE public.cpe SET event_id = v_event_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'financial_effect_status', 'LEGACY_EFFECT_CONFIRMED_ACCEPTED',
          'financial_effect_contract_version', 494
        ), updated_at = now()
      WHERE id = r.id AND tenant_id = r.tenant_id;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.id = ANY(v_outbox_ids)
        AND (o.processed_at IS NOT NULL OR lower(coalesce(o.status, '')) IN ('processing', 'completed'))
    ) OR EXISTS (
      SELECT 1 FROM public.asientos_contables a
      WHERE a.tenant_id = r.tenant_id
        AND a.source_event_id = ANY(v_outbox_ids || ARRAY[v_event_id])
    ) THEN
      RAISE EXCEPTION 'LEGACY_REFERENCED_NOTE_REQUIRES_MANUAL_RECONCILIATION:%', r.id
        USING ERRCODE = '23514';
    END IF;

    IF upper(r.tipo_documento) = '07' THEN
      IF EXISTS (
        SELECT 1 FROM public.saldos_favor_movimientos m
        JOIN public.saldos_favor_clientes s ON s.id = m.saldo_favor_id
        WHERE s.tenant_id = r.tenant_id
          AND s.nota_credito_documento_id = r.documento_id
          AND m.tipo <> 'ORIGEN_NC'
      ) THEN
        RAISE EXCEPTION 'LEGACY_REFERENCED_NOTE_BALANCE_ALREADY_CONSUMED:%', r.id
          USING ERRCODE = '23514';
      END IF;
      SELECT coalesce(sum(p.monto), 0) INTO v_payment
      FROM public.cxc_pagos p
      WHERE p.tenant_id = r.tenant_id AND p.documento_id = r.documento_id
        AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO';
      IF v_payment > 0 THEN
        SELECT round(coalesce(c.monto_pendiente, c.saldo_pendiente, c.saldo, 0), 2)
        INTO v_current
        FROM public.cxc_pagos p
        JOIN public.cuentas_por_cobrar c ON c.id = p.cuenta_id
        WHERE p.tenant_id = r.tenant_id AND p.documento_id = r.documento_id
          AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO'
        ORDER BY p.created_at LIMIT 1 FOR UPDATE OF c;
        v_new := round(coalesce(v_current, 0) + v_payment, 2);
        UPDATE public.cuentas_por_cobrar c SET
          monto_pendiente = v_new, saldo_pendiente = v_new, saldo = v_new,
          estado = CASE WHEN v_new + 0.01 < coalesce(c.monto_original, c.monto_total, c.total, v_new)
            THEN 'PARCIAL' ELSE 'PENDIENTE' END,
          metadata = coalesce(c.metadata, '{}'::jsonb)
            - 'last_credit_note_id' - 'last_credit_note_amount'
            - 'last_credit_note_fingerprint',
          updated_at = now()
        WHERE c.id IN (
          SELECT p.cuenta_id FROM public.cxc_pagos p
          WHERE p.tenant_id = r.tenant_id AND p.documento_id = r.documento_id
            AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO'
        );
      END IF;
      DELETE FROM public.cxc_pagos p
      WHERE p.tenant_id = r.tenant_id AND p.documento_id = r.documento_id
        AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO';
      DELETE FROM public.saldos_favor_movimientos m
      USING public.saldos_favor_clientes s
      WHERE s.tenant_id = r.tenant_id
        AND s.nota_credito_documento_id = r.documento_id
        AND m.tenant_id = s.tenant_id AND m.saldo_favor_id = s.id;
      DELETE FROM public.saldos_favor_clientes s
      WHERE s.tenant_id = r.tenant_id
        AND s.nota_credito_documento_id = r.documento_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.cxc_pagos p
        JOIN public.cuentas_por_cobrar c ON c.id = p.cuenta_id
        WHERE c.tenant_id = r.tenant_id AND c.documento_id = r.documento_id
      ) THEN
        RAISE EXCEPTION 'LEGACY_REFERENCED_NOTE_DEBIT_ALREADY_COLLECTED:%', r.id
          USING ERRCODE = '23514';
      END IF;
      DELETE FROM public.cuentas_por_cobrar c
      WHERE c.tenant_id = r.tenant_id AND c.documento_id = r.documento_id;
    END IF;
    DELETE FROM public.outbox_events o WHERE o.id = ANY(v_outbox_ids);

    UPDATE public.cpe SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'financial_effect_status', CASE WHEN upper(r.estado::text) = 'RECHAZADO'
        THEN 'REJECTED_NO_FINANCIAL_EFFECT' ELSE 'PENDING_FISCAL_ACCEPTANCE' END,
      'financial_effect_contract_version', 494,
      'legacy_premature_effect_repaired', true
    ), updated_at = now()
    WHERE id = r.id AND tenant_id = r.tenant_id;
    UPDATE public.documentos SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'financial_effect_status', CASE WHEN upper(r.estado::text) = 'RECHAZADO'
        THEN 'REJECTED_NO_FINANCIAL_EFFECT' ELSE 'PENDING_FISCAL_ACCEPTANCE' END,
      'financial_effect_contract_version', 494,
      'legacy_premature_effect_repaired', true
    ), updated_at = now()
    WHERE id = r.documento_id AND tenant_id = r.tenant_id;
    UPDATE public.notas_referenciadas_operaciones SET
      resultado = resultado || jsonb_build_object(
        'financial_effect_status', CASE WHEN upper(r.estado::text) = 'RECHAZADO'
          THEN 'REJECTED_NO_FINANCIAL_EFFECT' ELSE 'PENDING_FISCAL_ACCEPTANCE' END,
        'cxc_reduction', 0, 'saldo_favor', 0,
        'saldo_favor_id', NULL, 'cxc_id', NULL
      )
    WHERE tenant_id = r.tenant_id AND nota_cpe_id = r.id
      AND tipo_operacion = 'CREAR';
  END LOOP;
END
$backfill$;

SELECT app.reparar_notas_referenciadas_legacy_494();

DROP TRIGGER IF EXISTS trg_enforce_nota_fiscal_effect_494 ON public.cpe;
CREATE TRIGGER trg_enforce_nota_fiscal_effect_494
AFTER UPDATE OF estado, estado_sunat, sunat_status, cdr_sunat ON public.cpe
FOR EACH ROW
WHEN (upper(NEW.tipo_documento) IN ('07', '08'))
EXECUTE FUNCTION app.enforce_nota_fiscal_effect_494();

REVOKE ALL ON FUNCTION public.crear_nota_referenciada_legacy_494(
  uuid, uuid, uuid, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) TO service_role;
REVOKE ALL ON FUNCTION app.aplicar_efecto_nota_aceptada_494(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_nota_fiscal_effect_494()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.reparar_notas_referenciadas_legacy_494()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.crear_nota_referenciada_tx(
  uuid, uuid, uuid, text, text, text, numeric, text
) IS 'Crea una NC/ND referenciada fiscalmente neutra. CxC, saldo y outbox nacen sólo al aceptar el CPE con CDR.';
COMMENT ON FUNCTION app.aplicar_efecto_nota_aceptada_494(uuid, uuid)
IS 'Writer interno, idempotente y tenant-scoped del efecto financiero de una 07/08 ya aceptada con CDR.';

COMMIT;
