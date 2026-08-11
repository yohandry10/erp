\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('erp_cpe_476', 'erp_e2e') THEN
    RAISE EXCEPTION 'VERIFY 476 solo puede ejecutarse en una base local efimera';
  END IF;
END;
$$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_foreign_tenant uuid;
  v_foreign_actor uuid;
  v_document uuid := gen_random_uuid();
  v_cpe uuid := gen_random_uuid();
  v_document_pending uuid := gen_random_uuid();
  v_cpe_pending uuid := gen_random_uuid();
  v_claim jsonb;
  v_retry jsonb;
  v_final jsonb;
  v_operation uuid;
  v_token uuid;
  v_old_token uuid;
  v_count bigint;
  v_desktop jsonb;
  v_desktop_payload jsonb;
  v_desktop_cpe jsonb;
  v_desktop_details jsonb;
  v_venta uuid := gen_random_uuid();
  v_pos_document uuid := gen_random_uuid();
  v_pos_cpe_data jsonb;
  v_pos_cpe jsonb;
  v_pos_result jsonb;
  v_pos_xml text := '<Invoice>signed-pos-476</Invoice>';
  v_pos_hash text;
  v_before_inventory bigint;
  v_before_cash bigint;
  v_before_bank bigint;
  v_before_cxc bigint;
BEGIN
  -- El contrato ya no admite el DEV retirado. Este marcador PROD vive solo en
  -- la transaccion de la base local aislada y el ROLLBACK lo restaura.
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq', allow_demo_data = true,
      configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY CPE 476', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY CPE 476 FOREIGN', 1, 'PE') INTO v_demo;
  v_foreign_tenant := (v_demo->>'tenant_id')::uuid;
  v_foreign_actor := (v_demo->>'user_id')::uuid;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE id = v_actor AND tenant_id = v_tenant)
     OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_actor AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'VERIFY_476_DEMO_ACTOR_NOT_MIRRORED';
  END IF;

  -- ACL/RLS: la tabla es un anchor SELECT-only. Incluso service_role escribe
  -- exclusivamente al atravesar wrappers SECURITY DEFINER publicos.
  IF NOT has_table_privilege('service_role', 'public.cpe_operaciones', 'SELECT')
     OR has_table_privilege('service_role', 'public.cpe_operaciones', 'INSERT')
     OR has_table_privilege('service_role', 'public.cpe_operaciones', 'UPDATE')
     OR has_table_privilege('service_role', 'public.cpe_operaciones', 'DELETE')
     OR has_table_privilege('service_role', 'public.cpe_operaciones', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.cpe_operaciones', 'SELECT')
     OR has_table_privilege('anon', 'public.cpe_operaciones', 'SELECT')
     OR has_function_privilege(
       'service_role',
       'app.reserve_cpe_operation_476(text,uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.finalize_cpe_operation_476(text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.reservar_envio_cpe_tx(uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_class
       WHERE oid = 'public.cpe_operaciones'::regclass
         AND relrowsecurity AND relforcerowsecurity
     ) THEN
    RAISE EXCEPTION 'VERIFY_476_ACL_RLS_SINGLE_WRITER_INVALID';
  END IF;

  INSERT INTO public.documentos (
    id, tenant_id, tipo_documento, serie, numero, fecha_emision,
    fecha_vencimiento, moneda, subtotal, impuesto_igv, total,
    total_gravadas, emisor_ruc, emisor_razon_social,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, estado, estado_sunat,
    created_by, updated_by, metadata
  ) VALUES (
    v_document, v_tenant, 'FACTURA', 'F476', '00000001', now(), now(),
    'PEN', 100, 18, 118, 100, '20600000476', 'Empresa Verify 476',
    '6', '20123456789', '20123456789', 'Cliente Verify 476',
    'Cliente Verify 476', 'EMITIDO', 'PENDIENTE', v_actor, v_actor,
    jsonb_build_object('source', 'verify.476')
  );
  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, codigo_producto, descripcion,
    unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item
  ) VALUES (
    v_tenant, v_document, 1, 'ITEM-476', 'Item verify 476',
    'NIU', 1, 118, 0, 100, 18, 0, 118
  );
  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    moneda, total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat, sunat_status,
    hash, hash_firma, xml_firmado, created_by, activo
  ) VALUES (
    v_cpe, v_tenant, v_document, '01', 'F476', '00000001', 1,
    '20600000476', 'Empresa Verify 476', '6', '20123456789',
    'Cliente Verify 476', 'PEN', 100, 18, 118, 118,
    '[{"codigo":"ITEM-476","descripcion":"Item verify 476","cantidad":1,"unidad":"NIU","precio_unitario":118,"valor_venta":100,"igv":18,"precio_venta":118}]'::jsonb,
    now(), 'verify.cpe.476.seed', 'FIRMADO', 'PENDIENTE', 'READY',
    'HASH476', 'HASH476', '<Invoice>signed-476</Invoice>', v_actor, true
  );

  -- Actor cross-tenant falla antes de crear una operacion.
  BEGIN
    PERFORM public.reservar_envio_cpe_tx(
      v_tenant, v_foreign_actor, v_cpe, 'verify.send.476.actor', 'USER'
    );
    RAISE EXCEPTION 'VERIFY_476_EXPECTED_CROSS_TENANT_ACTOR_FAILURE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.cpe_operaciones
    WHERE tenant_id = v_tenant AND idempotency_key = 'verify.send.476.actor'
  ) THEN
    RAISE EXCEPTION 'VERIFY_476_CROSS_TENANT_ACTOR_LEFT_OPERATION';
  END IF;

  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_cpe, 'verify.send.476.main', 'USER'
  ) INTO v_claim;
  v_operation := (v_claim->'operation'->>'id')::uuid;
  v_token := (v_claim->'operation'->>'claim_token')::uuid;
  IF NOT (v_claim->>'claimed')::boolean
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_cpe) <> 'ENVIADO'
     OR (SELECT upper(estado::text) FROM public.documentos WHERE id = v_document) <> 'ENVIADO_SUNAT' THEN
    RAISE EXCEPTION 'VERIFY_476_SEND_RESERVE_NOT_ATOMIC %', v_claim;
  END IF;

  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_cpe, 'verify.send.476.main', 'USER'
  ) INTO v_retry;
  IF (v_retry->>'claimed')::boolean OR v_retry->>'reason' <> 'IN_FLIGHT' THEN
    RAISE EXCEPTION 'VERIFY_476_INFLIGHT_RETRY_RECLAIMED %', v_retry;
  END IF;
  BEGIN
    PERFORM public.reservar_envio_cpe_tx(
      v_tenant, v_actor, v_cpe, 'verify.send.476.other-key', 'USER'
    );
    RAISE EXCEPTION 'VERIFY_476_EXPECTED_DIFFERENT_KEY_FAILURE';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Lease vencida: nuevo token y nuevo intento; el token viejo pierde ownership.
  UPDATE public.cpe_operaciones
  SET lease_expires_at = now() - interval '1 second'
  WHERE id = v_operation;
  v_old_token := v_token;
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_cpe, 'verify.send.476.main', 'WORKER'
  ) INTO v_claim;
  v_token := (v_claim->'operation'->>'claim_token')::uuid;
  IF NOT (v_claim->>'claimed')::boolean OR v_token = v_old_token
     OR (v_claim->'operation'->>'attempt')::integer <> 2 THEN
    RAISE EXCEPTION 'VERIFY_476_STALE_LEASE_NOT_TAKEN_OVER %', v_claim;
  END IF;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, v_operation, v_old_token, 'TECHNICAL_ERROR',
      '98', 'timeout viejo', NULL, NULL, NULL, '{}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_476_EXPECTED_STALE_TOKEN_FAILURE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Un ACCEPTED sin CDR aborta tarde: operacion/CPE/documento conservan claim.
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, v_operation, v_token, 'ACCEPTED',
      '0', 'aceptado sin evidencia', NULL, 'EXT476', 'N476', '{}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_476_EXPECTED_CDR_FAILURE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT state FROM public.cpe_operaciones WHERE id = v_operation) <> 'CLAIMED'
     OR (SELECT upper(sunat_status::text) FROM public.cpe WHERE id = v_cpe) <> 'SENDING'
     OR (SELECT upper(estado_sunat) FROM public.documentos WHERE id = v_document) <> 'ENVIADO' THEN
    RAISE EXCEPTION 'VERIFY_476_CDR_FAILURE_DID_NOT_ROLL_BACK';
  END IF;

  SELECT public.finalizar_envio_cpe_tx(
    v_tenant, v_operation, v_token, 'TECHNICAL_ERROR',
    '98', 'timeout temporal', NULL, NULL, NULL, '{"transport":"timeout"}'::jsonb
  ) INTO v_final;
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_cpe) <> 'ERROR'
     OR (SELECT upper(sunat_status::text) FROM public.cpe WHERE id = v_cpe) <> 'ERROR'
     OR (SELECT upper(estado::text) FROM public.documentos WHERE id = v_document) <> 'EMITIDO'
     OR (SELECT upper(estado_sunat) FROM public.documentos WHERE id = v_document) <> 'ERROR'
     OR (SELECT state FROM public.cpe_operaciones WHERE id = v_operation) <> 'TECHNICAL_ERROR' THEN
    RAISE EXCEPTION 'VERIFY_476_TECHNICAL_ERROR_NOT_RETRYABLE %', v_final;
  END IF;
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, NULL, v_cpe, 'verify.send.476.main', 'SYSTEM'
  ) INTO v_retry;
  IF (v_retry->>'claimed')::boolean OR v_retry->>'reason' <> 'RETRY_LATER' THEN
    RAISE EXCEPTION 'VERIFY_476_BACKOFF_NOT_DURABLE %', v_retry;
  END IF;
  UPDATE public.cpe_operaciones SET next_retry_at = now() - interval '1 second'
  WHERE id = v_operation;
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, NULL, v_cpe, 'verify.send.476.main', 'SYSTEM'
  ) INTO v_claim;
  v_token := (v_claim->'operation'->>'claim_token')::uuid;
  IF NOT (v_claim->>'claimed')::boolean
     OR (v_claim->'operation'->>'attempt')::integer <> 3 THEN
    RAISE EXCEPTION 'VERIFY_476_TECHNICAL_REOPEN_FAILED %', v_claim;
  END IF;
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, v_operation, v_token, 'REJECTED',
    '2010', 'RUC receptor invalido', NULL, NULL, NULL, '{}'::jsonb
  );
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_cpe) <> 'RECHAZADO'
     OR (SELECT upper(sunat_status::text) FROM public.cpe WHERE id = v_cpe) <> 'REJECTED'
     OR (SELECT upper(estado::text) FROM public.documentos WHERE id = v_document) <> 'RECHAZADO'
     OR (SELECT next_retry_at FROM public.cpe WHERE id = v_cpe) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_476_REJECTION_WAS_NOT_DEFINITIVE';
  END IF;
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, NULL, v_cpe, 'verify.send.476.main', 'SYSTEM'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean OR v_retry->>'reason' <> 'TERMINAL' THEN
    RAISE EXCEPTION 'VERIFY_476_TERMINAL_EXACT_RETRY_NOT_IDEMPOTENT %', v_retry;
  END IF;
  BEGIN
    PERFORM public.finalizar_envio_cpe_tx(
      v_tenant, v_operation, v_token, 'REJECTED',
      '2010', 'otra respuesta', NULL, NULL, NULL, '{}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_476_EXPECTED_TERMINAL_COLLISION';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- PENDING y consulta comparten el mismo finalizador documento/CPE.
  INSERT INTO public.documentos (
    id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, subtotal, impuesto_igv, total, total_gravadas,
    emisor_ruc, emisor_razon_social, receptor_tipo_doc, receptor_numero_doc,
    receptor_documento, receptor_razon_social, receptor_nombre,
    estado, estado_sunat, created_by, updated_by
  ) VALUES (
    v_document_pending, v_tenant, 'BOLETA', 'B476', '00000002', now(), now(),
    'PEN', 50, 9, 59, 50, '20600000476', 'Empresa Verify 476', '1',
    '12345678', '12345678', 'Cliente Pending', 'Cliente Pending',
    'EMITIDO', 'PENDIENTE', v_actor, v_actor
  );
  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    ruc_emisor, documento_receptor, razon_social_receptor, moneda,
    total_gravadas, total_igv, total_venta, total, items, fecha_emision,
    idempotency_key, estado, estado_sunat, sunat_status, hash, hash_firma,
    xml_firmado, created_by
  ) VALUES (
    v_cpe_pending, v_tenant, v_document_pending, '03', 'B476', '00000002',
    '20600000476', '12345678', 'Cliente Pending', 'PEN', 50, 9, 59, 59,
    '[{"codigo":"P","descripcion":"Pending","cantidad":1,"unidad":"NIU","precio_unitario":59,"valor_venta":50,"igv":9,"precio_venta":59}]'::jsonb,
    now(), 'verify.cpe.476.pending', 'FIRMADO', 'PENDIENTE', 'READY',
    'HASHPENDING', 'HASHPENDING', '<Invoice>pending-476</Invoice>', v_actor
  );
  SELECT public.reservar_envio_cpe_tx(
    v_tenant, v_actor, v_cpe_pending, 'verify.send.476.pending', 'USER'
  ) INTO v_claim;
  PERFORM public.finalizar_envio_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid,
    (v_claim->'operation'->>'claim_token')::uuid,
    'PENDING', '98', 'ticket recibido', NULL, NULL, 'TICKET-476', '{}'::jsonb
  );
  SELECT public.reservar_consulta_cpe_tx(
    v_tenant, v_actor, v_cpe_pending, 'verify.query.476.pending', 'USER'
  ) INTO v_claim;
  PERFORM public.finalizar_consulta_cpe_tx(
    v_tenant, (v_claim->'operation'->>'id')::uuid,
    (v_claim->'operation'->>'claim_token')::uuid,
    'ACCEPTED', '0', 'aceptado por consulta', '<cdr>476</cdr>',
    'HASH-EXT-476', 'SUNAT-476', '{}'::jsonb
  );
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_cpe_pending) <> 'ACEPTADO'
     OR (SELECT cdr_sunat FROM public.cpe WHERE id = v_cpe_pending) <> '<cdr>476</cdr>'
     OR (SELECT upper(estado::text) FROM public.documentos WHERE id = v_document_pending) <> 'ENVIADO_SUNAT'
     OR (SELECT upper(estado_sunat::text) FROM public.documentos WHERE id = v_document_pending) <> 'ACEPTADO'
     OR (SELECT cdr_content FROM public.documentos WHERE id = v_document_pending) <> '<cdr>476</cdr>' THEN
    RAISE EXCEPTION 'VERIFY_476_QUERY_ACCEPTANCE_NOT_MIRRORED cpe=% cdr=% doc=% doc_cdr=%',
      (SELECT estado FROM public.cpe WHERE id = v_cpe_pending),
      (SELECT cdr_sunat FROM public.cpe WHERE id = v_cpe_pending),
      (SELECT estado FROM public.documentos WHERE id = v_document_pending),
      (SELECT cdr_content FROM public.documentos WHERE id = v_document_pending);
  END IF;

  -- Desktop 01/03 delega en 443, repara lineas y no duplica outbox.
  v_desktop_cpe := jsonb_build_object(
    'tipo_documento', '01', 'serie', 'F476D', 'numero', '00000003',
    'ruc_emisor', '20600000476', 'razon_social_emisor', 'Empresa Verify 476',
    'tipo_documento_receptor', '6', 'documento_receptor', '20111111111',
    'razon_social_receptor', 'Cliente Desktop', 'moneda', 'PEN',
    'total_gravadas', 100, 'total_exoneradas', 0, 'total_inafectas', 0,
    'total_exportacion', 0, 'total_igv', 18, 'total_venta', 118,
    'fecha_emision', current_date, 'fecha_vencimiento', current_date,
    'estado', 'FIRMADO', 'estado_sunat', 'PENDIENTE', 'sunat_status', 'READY',
    'xml_firmado', '<Invoice>desktop-476</Invoice>',
    'hash', 'DESKTOP476', 'hash_firma', 'DESKTOP476',
    'items', '[{"codigo":"D","descripcion":"Desktop","cantidad":1,"unidad":"NIU","precio_unitario":118,"valor_venta":100,"igv":18,"precio_venta":118}]'::jsonb
  );
  v_desktop_details := '[{"orden":1,"codigo_producto":"D","descripcion":"Desktop","unidad_medida":"NIU","cantidad":1,"precio_unitario":118,"descuento_unitario":0,"valor_venta":100,"impuesto_igv":18,"impuesto_isc":0,"total_item":118,"afectacion_igv":"10"}]'::jsonb;
  v_desktop_payload := jsonb_build_object(
    'cpe', v_desktop_cpe,
    'documento', jsonb_build_object('subtotal', 100, 'impuesto_igv', 18, 'impuesto_isc', 0, 'total', 118, 'tipo_cambio', 1),
    'detalles', v_desktop_details
  );
  BEGIN
    PERFORM public.registrar_cpe_desktop_tx(
      v_tenant, v_actor,
      jsonb_set(v_desktop_payload, '{cpe,tipo_documento}', '"07"'::jsonb),
      'verify.desktop.476.note'
    );
    RAISE EXCEPTION 'VERIFY_476_EXPECTED_DESKTOP_NOTE_REJECTION';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  SELECT public.registrar_cpe_desktop_tx(
    v_tenant, v_actor, v_desktop_payload, 'verify.desktop.476.invoice'
  ) INTO v_desktop;
  DELETE FROM public.documento_detalles
  WHERE documento_id = (v_desktop->>'documento_id')::uuid;
  SELECT public.registrar_cpe_desktop_tx(
    v_tenant, v_actor, v_desktop_payload, 'verify.desktop.476.invoice'
  ) INTO v_desktop;
  IF (SELECT count(*) FROM public.documento_detalles WHERE documento_id = (v_desktop->>'documento_id')::uuid) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND idempotency_key = 'verify.desktop.476.invoice') <> 1
     OR (SELECT payload->>'source' FROM public.outbox_events
         WHERE tenant_id = v_tenant AND idempotency_key = 'verify.desktop.476.invoice') <> 'cpe.api.atomic'
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'comprobante.creado'
           AND aggregate_id = (v_desktop->>'cpe_id')) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_476_DESKTOP_REPAIR_OR_OUTBOX_INVALID %', v_desktop;
  END IF;

  -- POS: snapshot, lineas, CPE, venta, documento y un unico evento en un commit.
  v_pos_hash := upper(substr(encode(extensions.digest(convert_to(v_pos_xml, 'UTF8'), 'sha256'), 'hex'), 1, 32));
  INSERT INTO public.documentos (
    id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, subtotal, impuesto_igv, total, total_gravadas,
    emisor_ruc, emisor_razon_social, receptor_tipo_doc, receptor_numero_doc,
    receptor_documento, receptor_razon_social, receptor_nombre,
    estado, estado_sunat, created_by, updated_by, metadata
  ) VALUES (
    v_pos_document, v_tenant, 'BOLETA', 'B476P', '00000004', now(), now(),
    'PEN', 100, 18, 118, 100, '20600000476', 'Empresa Verify 476', '1',
    '12345678', '12345678', 'Cliente POS', 'Cliente POS',
    'EMITIDO', 'PENDIENTE', v_actor, v_actor,
    jsonb_build_object('source', 'pos.atomic.451', 'venta_pos_id', v_venta)
  );
  v_pos_cpe_data := jsonb_build_object(
    'tipo_documento', '03', 'serie', 'B476P', 'numero', 4,
    'idempotency_key', 'verify.pos.cpe.476', 'documento_id', v_pos_document,
    'venta_pos_id', v_venta, 'ruc_emisor', '20600000476',
    'razon_social_emisor', 'Empresa Verify 476', 'tipo_documento_receptor', '1',
    'documento_receptor', '12345678', 'razon_social_receptor', 'Cliente POS',
    'moneda', 'PEN', 'total_gravadas', 100, 'total_exoneradas', 0,
    'total_inafectas', 0, 'total_exportacion', 0, 'total_igv', 18,
    'total_venta', 118,
    'items', '[{"codigo":"POS476","descripcion":"Item POS 476","unidad":"NIU","cantidad":1,"precio_unitario":118,"descuento_unitario":0,"valor_venta":100,"igv":18,"total":118,"precio_venta":118,"afectacion_igv":"10"}]'::jsonb
  );
  INSERT INTO public.ventas_pos (
    id, tenant_id, cliente_documento, cliente_nombre, usuario_id,
    subtotal, impuestos, total, moneda, estado, cpe_pendiente, cpe_data,
    documento_id, tipo_emision, idempotency_key, request_fingerprint,
    accounting_event_id, atomic_result, metadata
  ) VALUES (
    v_venta, v_tenant, '12345678', 'Cliente POS', v_actor,
    100, 18, 118, 'PEN', 'PAGADA', true, v_pos_cpe_data,
    v_pos_document, 'FISCAL_INMEDIATO', 'verify.pos.sale.476',
    repeat('a', 64), gen_random_uuid(), '{"atomic":true}'::jsonb,
    '{"source":"pos.atomic.451"}'::jsonb
  );
  v_pos_cpe := (v_pos_cpe_data - 'documento_id' - 'venta_pos_id') || jsonb_build_object(
    'xml_firmado', v_pos_xml, 'hash', v_pos_hash, 'hash_firma', v_pos_hash,
    'fecha_emision', now(), 'fecha_vencimiento', current_date
  );
  SELECT count(*) INTO v_before_inventory FROM public.movimientos_inventario WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_cash FROM public.movimientos_caja WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_bank FROM public.movimientos_bancarios WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_cxc FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant;

  SELECT public.finalizar_cpe_pos_tx(
    v_tenant, v_actor, v_venta, v_pos_cpe, 'verify.pos.cpe.476'
  ) INTO v_pos_result;
  SELECT public.finalizar_cpe_pos_tx(
    v_tenant, v_actor, v_venta, v_pos_cpe, 'verify.pos.cpe.476'
  ) INTO v_retry;
  IF (SELECT cpe_id FROM public.ventas_pos WHERE id = v_venta) IS DISTINCT FROM (v_pos_result->>'cpe_id')::uuid
     OR (SELECT cpe_pendiente FROM public.ventas_pos WHERE id = v_venta)
     OR (SELECT count(*) FROM public.cpe WHERE tenant_id = v_tenant AND idempotency_key = 'verify.pos.cpe.476') <> 1
     OR (SELECT count(*) FROM public.documento_detalles WHERE documento_id = v_pos_document) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'comprobante.creado'
           AND aggregate_id = (v_pos_result->>'cpe_id')) <> 1
     OR EXISTS (SELECT 1 FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'factura.emitida'
           AND aggregate_id = v_pos_document::text)
     OR (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id = v_tenant) <> v_before_inventory
     OR (SELECT count(*) FROM public.movimientos_caja WHERE tenant_id = v_tenant) <> v_before_cash
     OR (SELECT count(*) FROM public.movimientos_bancarios WHERE tenant_id = v_tenant) <> v_before_bank
     OR (SELECT count(*) FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant) <> v_before_cxc THEN
    RAISE EXCEPTION 'VERIFY_476_POS_ATOMICITY_OR_DUPLICATE_IMPACT % / %', v_pos_result, v_retry;
  END IF;
END;
$$;

ROLLBACK;
