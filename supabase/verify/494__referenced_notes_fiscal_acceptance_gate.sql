\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 494 solo puede ejecutarse en la base efimera erp_e2e';
  END IF;
END;
$$;

UPDATE app.deployment_environment
SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true, configured_at = now(), updated_at = now()
WHERE singleton = true;

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_customer uuid;
  v_source_document uuid;
  v_source_cpe uuid := gen_random_uuid();
  v_source_event uuid := gen_random_uuid();
  v_source_cxc uuid;
  v_original_entry uuid;
  v_note_rejected jsonb;
  v_note_accepted jsonb;
  v_note_debit jsonb;
  v_legacy jsonb;
  v_legacy_incomplete jsonb;
  v_legacy_unsafe jsonb;
  v_legacy_cpe uuid;
  v_legacy_document uuid;
  v_legacy_incomplete_cpe uuid;
  v_legacy_incomplete_document uuid;
  v_note_cpe uuid;
  v_note_document uuid;
  v_claim jsonb;
  v_final jsonb;
  v_retry jsonb;
  v_operation uuid;
  v_token uuid;
  v_xml text := '<SignedCreditNote>' || repeat('x', 180) || '</SignedCreditNote>';
  v_sha text;
  v_before_docs bigint;
  v_before_inventory bigint;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES (
    v_tenant, 'VERIFY-494-' || left(v_tenant::text, 8), 'Tenant verify 494',
    'Fixture local transaccional', 'PE', 'test', true, 'ACTIVO'
  );
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
    configuracion_completa, serie_nota_credito
  ) VALUES (
    v_tenant, '20600000494', 'Empresa verify 494', 'PE', 'PEN',
    'ACTIVO', true, 'FC94'
  );
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES (
    v_actor, v_tenant, 'Actor', 'Verify 494',
    'actor-494-' || left(v_actor::text, 8) || '@local.invalid',
    'actor494', 'unused-local-hash', true, 'ACTIVO'
  );
  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-494', 'Cliente verify 494', 'Cliente verify 494',
    'RUC', '20123456494', true
  ) RETURNING id INTO v_customer;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, estado_sunat,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal,
    impuesto_igv, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, cliente_id, created_by,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion, cdr_content
  ) VALUES (
    v_tenant, 'FACTURA', 'F494', '00000001', 'ENVIADO_SUNAT', 'ACEPTADO',
    now(), now() + interval '30 days', 'PEN', 1, 100, 18, 118,
    100, 0, 0, 0, v_customer, v_actor, '20600000494',
    'Empresa verify 494', 'Lima', '6', '20123456494', '20123456494',
    'Cliente verify 494', 'Cliente verify 494', 'Lima', '<cdr>source-494</cdr>'
  ) RETURNING id INTO v_source_document;
  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, codigo_producto, descripcion,
    unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata
  ) VALUES (
    v_tenant, v_source_document, 1, 'SERV-494', 'Servicio origen 494',
    'ZZ', 1, 118, 0, 100, 18, 0, 118,
    jsonb_build_object('afectacion_igv', '10')
  );
  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, cdr_sunat, created_by, event_id, activo
  ) VALUES (
    v_source_cpe, v_tenant, v_source_document, '01', 'F494', '00000001', 1,
    '20600000494', 'Empresa verify 494', 'Lima', '6', '20123456494',
    'Cliente verify 494', 'Lima', v_customer, 'PEN', 100, 0, 0, 0, 18,
    118, 118,
    jsonb_build_array(jsonb_build_object(
      'codigo', 'SERV-494', 'cantidad', 1, 'valor_venta', 100,
      'igv', 18, 'total', 118, 'afectacion_igv', '10'
    )), now(), current_date + 30, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    '<cdr>source-494</cdr>', v_actor, v_source_event, true
  );
  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total,
    monto_original, monto_pendiente, saldo, saldo_pendiente, total,
    fecha_emision, fecha_vencimiento, moneda, numero_documento,
    tipo_documento, idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES (
    v_tenant, v_customer, v_source_document, 'PARCIAL', 118, 118, 40, 40, 40,
    118, current_date, current_date + 30, 'PEN', 'F494-00000001',
    'FACTURA', 'verify-494-source-cxc', 'verify.494', 1,
    jsonb_build_object('origen', 'verify_local')
  ) RETURNING id INTO v_source_cxc;
  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    v_tenant, now(), 'Venta origen verify 494', 'Venta origen verify 494',
    'F494-00000001', 118, 118, 'CONFIRMADO', 'VERIFY_494',
    v_source_event, v_actor, v_actor::text
  ) RETURNING id INTO v_original_entry;
  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, nombre, concepto, debe, haber
  ) VALUES
    (v_tenant, v_original_entry, 'Clientes', 'Clientes', 118, 0),
    (v_tenant, v_original_entry, 'Venta e IGV', 'Venta e IGV', 0, 118);

  SELECT count(*) INTO v_before_inventory
  FROM public.movimientos_inventario WHERE tenant_id = v_tenant;

  -- Sin CDR aceptado en el origen, ni siquiera queda un borrador parcial.
  UPDATE public.cpe SET cdr_sunat = NULL WHERE id = v_source_cpe;
  UPDATE public.documentos SET cdr_content = NULL WHERE id = v_source_document;
  SELECT count(*) INTO v_before_docs FROM public.documentos WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_source_document, '07', '10',
      'Origen sin CDR no válido', 10, 'verify:494:no-source-cdr'
    );
    RAISE EXCEPTION 'VERIFY_494_EXPECTED_SOURCE_CDR_FAILURE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant) <> v_before_docs THEN
    RAISE EXCEPTION 'VERIFY_494_SOURCE_FAILURE_LEFT_PARTIAL_NOTE';
  END IF;
  UPDATE public.cpe SET cdr_sunat = '<cdr>source-494</cdr>' WHERE id = v_source_cpe;
  UPDATE public.documentos SET cdr_content = '<cdr>source-494</cdr>' WHERE id = v_source_document;

  -- Crear no requiere certificado y deja todas las proyecciones intactas.
  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_source_document, '07', '10',
    'Nota que será rechazada', 10, 'verify:494:credit:rejected'
  ) INTO v_note_rejected;
  v_note_cpe := (v_note_rejected->>'cpe_id')::uuid;
  v_note_document := (v_note_rejected->>'documento_id')::uuid;
  IF v_note_rejected->>'financial_effect_status' <> 'PENDING_FISCAL_ACCEPTANCE'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 40
     OR EXISTS (SELECT 1 FROM public.cxc_pagos WHERE documento_id = v_note_document)
     OR EXISTS (SELECT 1 FROM public.saldos_favor_clientes WHERE nota_credito_documento_id = v_note_document)
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_494_DRAFT_WAS_NOT_FINANCIALLY_NEUTRAL:%', v_note_rejected;
  END IF;

  -- Firma inválida falla tarde pero no deja XML ni efecto financiero.
  BEGIN
    PERFORM public.firmar_nota_referenciada_tx(
      v_tenant, v_actor, v_note_cpe, v_xml, 'HASH-VERIFY-494', repeat('0', 64),
      'verify:494:sign:bad-hash'
    );
    RAISE EXCEPTION 'VERIFY_494_EXPECTED_SIGNATURE_HASH_FAILURE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_note_cpe) <> 'BORRADOR'
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_494_SIGNATURE_FAILURE_LEFT_EFFECT';
  END IF;

  v_sha := encode(extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'), 'hex');
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_note_cpe, v_xml, 'HASH-VERIFY-494', v_sha,
    'verify:494:sign:rejected'
  );
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 40
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_494_SIGNATURE_APPLIED_PREMATURE_EFFECT';
  END IF;

  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_note_cpe, 'verify:494:send:rejected', 'USER'
  ) INTO v_claim;
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid,
    (v_claim->'operation'->>'claim_token')::uuid,
    'REJECTED', '2010', 'Receptor inválido', NULL, NULL, NULL, '{}'::jsonb
  );
  IF (SELECT metadata->>'financial_effect_status' FROM public.cpe WHERE id = v_note_cpe)
       <> 'REJECTED_NO_FINANCIAL_EFFECT'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 40
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_494_REJECTION_WAS_NOT_NEUTRAL';
  END IF;

  -- Error técnico no aplica nada; el retry aceptado con CDR lo aplica una vez.
  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_source_document, '07', '10',
    'Nota aceptada tras retry', 60, 'verify:494:credit:accepted'
  ) INTO v_note_accepted;
  v_note_cpe := (v_note_accepted->>'cpe_id')::uuid;
  v_note_document := (v_note_accepted->>'documento_id')::uuid;
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_note_cpe, v_xml || 'accepted',
    'HASH-VERIFY-494-ACCEPTED',
    encode(extensions.digest(convert_to(v_xml || 'accepted', 'UTF8'), 'sha256'), 'hex'),
    'verify:494:sign:accepted'
  );
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_note_cpe, 'verify:494:send:accepted', 'USER'
  ) INTO v_claim;
  v_operation := (v_claim->'operation'->>'id')::uuid;
  v_token := (v_claim->'operation'->>'claim_token')::uuid;
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, v_operation, v_token, 'TECHNICAL_ERROR', '98',
    'Timeout transitorio', NULL, NULL, NULL, '{}'::jsonb
  );
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 40
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_494_TECHNICAL_ERROR_APPLIED_EFFECT';
  END IF;
  UPDATE public.cpe_operaciones SET next_retry_at = now() - interval '1 second'
  WHERE id = v_operation;
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_note_cpe, 'verify:494:send:accepted', 'USER'
  ) INTO v_claim;
  v_token := (v_claim->'operation'->>'claim_token')::uuid;
  SELECT public.finalizar_envio_cpe_tx(
    v_tenant, v_operation, v_token, 'ACCEPTED', '0', 'Aceptado',
    '<cdr>note-494-accepted</cdr>', 'EXT-HASH-494', 'SUNAT-494', '{}'::jsonb
  ) INTO v_final;
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_source_cxc) <> 0
     OR (SELECT count(*) FROM public.cxc_pagos
         WHERE documento_id = v_note_document AND monto = 40) <> 1
     OR (SELECT count(*) FROM public.saldos_favor_clientes
         WHERE nota_credito_documento_id = v_note_document AND monto_disponible = 20) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_note_document::text
           AND event_type = 'nota_credito.emitida') <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_note_cpe AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_494_ACCEPTANCE_EFFECT_INCOMPLETE:%', v_final;
  END IF;

  -- Retry exacto y una segunda invocación del writer simulan contendientes:
  -- el lock por origen y el índice parcial conservan un solo efecto.
  SELECT public.finalizar_envio_cpe_tx(
    v_tenant, v_operation, v_token, 'ACCEPTED', '0', 'Aceptado',
    '<cdr>note-494-accepted</cdr>', 'EXT-HASH-494', 'SUNAT-494', '{}'::jsonb
  ) INTO v_retry;
  PERFORM app.aplicar_efecto_nota_aceptada_494(v_tenant, v_note_cpe);
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.cxc_pagos WHERE documento_id = v_note_document) <> 1
     OR (SELECT count(*) FROM public.outbox_events WHERE aggregate_id = v_note_document::text) <> 1
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE nota_cpe_id = v_note_cpe AND tipo_operacion = 'APLICAR_ACEPTACION') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_494_ACCEPTANCE_RETRY_DUPLICATED:%', v_retry;
  END IF;

  -- ND: PENDING de envío sigue neutro; aceptación por consulta crea su CxC.
  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_source_document, '08', '02',
    'Aumento contractual aceptado', 30, 'verify:494:debit:accepted'
  ) INTO v_note_debit;
  v_note_cpe := (v_note_debit->>'cpe_id')::uuid;
  v_note_document := (v_note_debit->>'documento_id')::uuid;
  PERFORM public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_note_cpe, v_xml || 'debit', 'HASH-VERIFY-494-DEBIT',
    encode(extensions.digest(convert_to(v_xml || 'debit', 'UTF8'), 'sha256'), 'hex'),
    'verify:494:sign:debit'
  );
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_note_cpe, 'verify:494:send:debit', 'USER'
  ) INTO v_claim;
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid,
    (v_claim->'operation'->>'claim_token')::uuid,
    'PENDING', '98', 'Ticket recibido', NULL, NULL, 'TICKET-494', '{}'::jsonb
  );
  IF EXISTS (SELECT 1 FROM public.cuentas_por_cobrar WHERE documento_id = v_note_document)
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_note_document::text) THEN
    RAISE EXCEPTION 'VERIFY_494_PENDING_DEBIT_APPLIED_EFFECT';
  END IF;
  SELECT public.reservar_consulta_cpe_tx(
    v_tenant, v_actor, v_note_cpe, 'verify:494:query:debit', 'USER'
  ) INTO v_claim;
  PERFORM public.finalizar_consulta_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid,
    (v_claim->'operation'->>'claim_token')::uuid,
    'ACCEPTED', '0', 'Aceptado por consulta', '<cdr>debit-494</cdr>',
    'EXT-DEBIT-494', 'SUNAT-DEBIT-494', '{}'::jsonb
  );
  IF (SELECT count(*) FROM public.cuentas_por_cobrar
      WHERE documento_id = v_note_document AND monto_pendiente = 30) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE aggregate_id = v_note_document::text
           AND event_type = 'nota_debito.emitida') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_494_ACCEPTED_DEBIT_EFFECT_INVALID';
  END IF;

  -- Upgrade legacy: un BORRADOR creado por 472 trae saldo/outbox prematuros.
  -- El reparador los elimina; si el outbox ya fue procesado, falla cerrado.
  SELECT public.crear_nota_referenciada_legacy_494(
    v_tenant, v_actor, v_source_document, '07', '10',
    'Legado reparable verify 494', 5, 'verify:494:legacy:safe'
  ) INTO v_legacy;
  v_legacy_cpe := (v_legacy->>'cpe_id')::uuid;
  v_legacy_document := (v_legacy->>'documento_id')::uuid;
  IF NOT EXISTS (
       SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_legacy_document::text
     ) OR NOT EXISTS (
       SELECT 1 FROM public.saldos_favor_clientes
       WHERE nota_credito_documento_id = v_legacy_document
     ) THEN
    RAISE EXCEPTION 'VERIFY_494_LEGACY_FIXTURE_DID_NOT_REPRODUCE_PREMATURE_EFFECT';
  END IF;
  PERFORM app.reparar_notas_referenciadas_legacy_494();
  PERFORM app.reparar_notas_referenciadas_legacy_494();
  IF EXISTS (SELECT 1 FROM public.outbox_events WHERE aggregate_id = v_legacy_document::text)
     OR EXISTS (SELECT 1 FROM public.saldos_favor_clientes
       WHERE nota_credito_documento_id = v_legacy_document)
     OR (SELECT metadata->>'legacy_premature_effect_repaired'
         FROM public.cpe WHERE id = v_legacy_cpe) <> 'true' THEN
    RAISE EXCEPTION 'VERIFY_494_SAFE_LEGACY_BACKFILL_FAILED';
  END IF;

  -- Un legado marcado terminal sin CDR completo no puede heredarse como
  -- aceptado: exige conciliación en lugar de inventar evidencia fiscal.
  SELECT public.crear_nota_referenciada_legacy_494(
    v_tenant, v_actor, v_source_document, '07', '10',
    'Legado aceptado sin CDR fail closed', 5, 'verify:494:legacy:missing-cdr'
  ) INTO v_legacy_incomplete;
  v_legacy_incomplete_cpe := (v_legacy_incomplete->>'cpe_id')::uuid;
  v_legacy_incomplete_document := (v_legacy_incomplete->>'documento_id')::uuid;
  ALTER TABLE public.cpe DISABLE TRIGGER trg_enforce_nota_fiscal_effect_494;
  UPDATE public.cpe SET
    estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
    cdr_sunat = NULL
  WHERE id = v_legacy_incomplete_cpe;
  UPDATE public.documentos SET estado_sunat = 'ACEPTADO', cdr_content = NULL
  WHERE id = v_legacy_incomplete_document;
  ALTER TABLE public.cpe ENABLE TRIGGER trg_enforce_nota_fiscal_effect_494;
  BEGIN
    PERFORM app.reparar_notas_referenciadas_legacy_494();
    RAISE EXCEPTION 'VERIFY_494_EXPECTED_INCOMPLETE_ACCEPTANCE_FAILURE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'LEGACY_REFERENCED_NOTE_ACCEPTED_EVIDENCE_INCOMPLETE:%' THEN
      RAISE;
    END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE aggregate_id = v_legacy_incomplete_document::text
  ) THEN
    RAISE EXCEPTION 'VERIFY_494_INCOMPLETE_ACCEPTANCE_WAS_SILENTLY_REPAIRED';
  END IF;
  -- La fixture ya probó el fail-closed; se excluye de la siguiente invocación
  -- para que el caso de outbox procesado demuestre su propia guarda.
  UPDATE public.cpe SET metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('financial_effect_contract_version', 494)
  WHERE id = v_legacy_incomplete_cpe;

  SELECT public.crear_nota_referenciada_legacy_494(
    v_tenant, v_actor, v_source_document, '07', '10',
    'Legado contabilizado fail closed', 5, 'verify:494:legacy:unsafe'
  ) INTO v_legacy_unsafe;
  v_legacy_document := (v_legacy_unsafe->>'documento_id')::uuid;
  UPDATE public.outbox_events
  SET status = 'completed', processed_at = now()
  WHERE aggregate_id = v_legacy_document::text;
  BEGIN
    PERFORM app.reparar_notas_referenciadas_legacy_494();
    RAISE EXCEPTION 'VERIFY_494_EXPECTED_UNSAFE_LEGACY_FAILURE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE aggregate_id = v_legacy_document::text AND processed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_494_UNSAFE_LEGACY_WAS_SILENTLY_REMOVED';
  END IF;

  IF (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id = v_tenant)
       <> v_before_inventory
     OR NOT EXISTS (
       SELECT 1 FROM pg_index i
       WHERE i.indexrelid = 'public.ux_nota_ref_acceptance_cpe_494'::regclass
         AND i.indisunique AND i.indisvalid
     )
     OR position('pg_advisory_xact_lock' in pg_get_functiondef(
       'app.aplicar_efecto_nota_aceptada_494(uuid,uuid)'::regprocedure
     )) = 0 THEN
    RAISE EXCEPTION 'VERIFY_494_CONCURRENCY_OR_INVENTORY_GUARD_INVALID';
  END IF;

  IF has_function_privilege(
       'service_role', 'app.aplicar_efecto_nota_aceptada_494(uuid,uuid)', 'EXECUTE'
     ) OR has_function_privilege(
       'service_role',
       'public.crear_nota_referenciada_legacy_494(uuid,uuid,uuid,text,text,text,numeric,text)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role',
       'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_494_ACL_INVALID';
  END IF;
END;
$verify$;

ROLLBACK;
