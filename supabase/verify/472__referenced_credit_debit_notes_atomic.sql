\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 472 solo puede ejecutarse en la base efimera erp_e2e';
  END IF;
END;
$$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION app.verify_472_fail_late_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.verify_472_fail_outbox', true) = 'on'
     AND NEW.event_type = 'nota_debito.emitida' THEN
    RAISE EXCEPTION 'VERIFY_472_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_472_fail_late_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_472_fail_late_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_472_fail_late_outbox();

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_inactive_actor uuid := gen_random_uuid();
  v_foreign_actor uuid := gen_random_uuid();
  v_cliente uuid;
  v_document_credit uuid;
  v_document_debit uuid;
  v_cpe_credit uuid := gen_random_uuid();
  v_cpe_debit uuid := gen_random_uuid();
  v_event_credit uuid := gen_random_uuid();
  v_event_debit uuid := gen_random_uuid();
  v_asiento uuid;
  v_cxc uuid;
  v_note_credit jsonb;
  v_note_debit jsonb;
  v_retry jsonb;
  v_sign jsonb;
  v_note_document uuid;
  v_note_cpe uuid;
  v_note_debit_document uuid;
  v_xml text := '<SignedCreditNote>' || repeat('x', 160) || '</SignedCreditNote>';
  v_sha text;
  v_failed boolean;
  v_before_docs bigint;
  v_before_cxc bigint;
  v_before_inventory bigint;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-472-' || left(v_tenant::text, 8), 'Tenant verify 472',
     'Fixture local transaccional', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-472-' || left(v_other_tenant::text, 8),
     'Tenant ajeno verify 472', 'Fixture aislamiento', 'PE', 'test', true, 'ACTIVO');

  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
    configuracion_completa, serie_nota_credito
  ) VALUES (
    v_tenant, '20600000472', 'Empresa verify 472', 'PE', 'PEN',
    'ACTIVO', true, 'FC72'
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Actor', 'Verify 472',
     'actor-472-' || left(v_actor::text, 8) || '@local.invalid',
     'actor472', 'unused-local-hash', true, 'ACTIVO'),
    (v_inactive_actor, v_tenant, 'Inactivo', 'Verify 472',
     'inactive-472-' || left(v_inactive_actor::text, 8) || '@local.invalid',
     'inactive472', 'unused-local-hash', false, 'INACTIVO'),
    (v_foreign_actor, v_other_tenant, 'Ajeno', 'Verify 472',
     'foreign-472-' || left(v_foreign_actor::text, 8) || '@local.invalid',
     'foreign472', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-472', 'Cliente verify 472', 'Cliente verify 472',
    'RUC', '20123456472', true
  ) RETURNING id INTO v_cliente;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion
  ) VALUES
    (v_tenant, 'FACTURA', 'F472', '00000001', 'EMITIDO', now(),
     now() + interval '30 days', 'PEN', 1, 100, 18, 118,
     100, 0, 0, 0, v_cliente, v_actor,
     '20600000472', 'Empresa verify 472', 'Lima', '6', '20123456472',
     '20123456472', 'Cliente verify 472', 'Cliente verify 472', 'Lima'),
    (v_tenant, 'FACTURA', 'F473', '00000001', 'EMITIDO', now(),
     now() + interval '30 days', 'PEN', 1, 100, 18, 118,
     100, 0, 0, 0, v_cliente, v_actor,
     '20600000472', 'Empresa verify 472', 'Lima', '6', '20123456472',
     '20123456472', 'Cliente verify 472', 'Cliente verify 472', 'Lima');

  SELECT id INTO v_document_credit FROM public.documentos
  WHERE tenant_id = v_tenant AND serie = 'F472' AND numero = '00000001';
  SELECT id INTO v_document_debit FROM public.documentos
  WHERE tenant_id = v_tenant AND serie = 'F473' AND numero = '00000001';

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, codigo_producto, descripcion,
    unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata
  ) VALUES
    (v_tenant, v_document_credit, 1, 'SERV-472-C', 'Servicio origen credito',
     'ZZ', 1, 118, 0, 100, 18, 0, 118,
     jsonb_build_object('afectacion_igv','10')),
    (v_tenant, v_document_debit, 1, 'SERV-472-D', 'Servicio origen debito',
     'ZZ', 1, 118, 0, 100, 18, 0, 118,
     jsonb_build_object('afectacion_igv','10'));

  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  ) VALUES
    (v_cpe_credit, v_tenant, v_document_credit, '01', 'F472', '00000001', 1,
     '20600000472', 'Empresa verify 472', 'Lima', '6', '20123456472',
     'Cliente verify 472', 'Lima', v_cliente, 'PEN', 100, 0, 0, 0,
     18, 118, 118,
     jsonb_build_array(jsonb_build_object('codigo','SERV-472-C','cantidad',1,
       'valor_venta',100,'igv',18,'total',118,'afectacion_igv','10')),
     now(), current_date + 30, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
     v_actor, v_event_credit, true),
    (v_cpe_debit, v_tenant, v_document_debit, '01', 'F473', '00000001', 1,
     '20600000472', 'Empresa verify 472', 'Lima', '6', '20123456472',
     'Cliente verify 472', 'Lima', v_cliente, 'PEN', 100, 0, 0, 0,
     18, 118, 118,
     jsonb_build_array(jsonb_build_object('codigo','SERV-472-D','cantidad',1,
       'valor_venta',100,'igv',18,'total',118,'afectacion_igv','10')),
     now(), current_date + 30, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
     v_actor, v_event_debit, true);

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado,
    monto_total, monto_original, monto_pendiente, saldo, saldo_pendiente,
    total, fecha_emision, fecha_vencimiento, moneda, numero_documento,
    tipo_documento, idempotency_key, event_source, tipo_cambio_origen,
    metadata
  ) VALUES (
    v_tenant, v_cliente, v_document_credit, 'PARCIAL',
    118, 118, 40, 40, 40, 118, current_date, current_date + 30,
    'PEN', 'F472-00000001', 'FACTURA', 'verify-472-source-cxc',
    'verify.472', 1, jsonb_build_object('origen','verify_local')
  ) RETURNING id INTO v_cxc;

  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES
    (v_tenant, now(), 'Venta origen NC verify 472', 'Venta origen NC verify 472',
     'F472-00000001', 118, 118, 'CONFIRMADO', 'VERIFY_472',
     v_event_credit, v_actor, v_actor::text),
    (v_tenant, now(), 'Venta origen ND verify 472', 'Venta origen ND verify 472',
     'F473-00000001', 118, 118, 'CONFIRMADO', 'VERIFY_472',
     v_event_debit, v_actor, v_actor::text);

  FOR v_asiento IN SELECT id FROM public.asientos_contables
    WHERE tenant_id = v_tenant AND source_event_id IN (v_event_credit, v_event_debit)
  LOOP
    INSERT INTO public.detalle_asientos (
      tenant_id, asiento_id, nombre, concepto, debe, haber
    ) VALUES
      (v_tenant, v_asiento, 'Clientes', 'Clientes', 118, 0),
      (v_tenant, v_asiento, 'Venta e IGV', 'Venta e IGV', 0, 118);
  END LOOP;

  SELECT count(*) INTO v_before_inventory FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant;

  -- Actor inválido/cross-tenant debe fallar antes de cualquier writer.
  FOREACH v_asiento IN ARRAY ARRAY[v_inactive_actor, v_foreign_actor]
  LOOP
    v_failed := false;
    BEGIN
      PERFORM public.crear_nota_referenciada_tx(
        v_tenant, v_asiento, v_document_credit, '07', '10',
        'Actor inválido verify', 10, 'verify:472:actor:' || v_asiento::text
      );
    EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
    END;
    IF NOT v_failed THEN
      RAISE EXCEPTION 'VERIFY_472_INVALID_ACTOR_ACCEPTED:%', v_asiento;
    END IF;
  END LOOP;

  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_document_credit, '07', '10',
    'Ajuste comercial parcial verify 472', 60, 'verify:472:credit:main'
  ) INTO v_note_credit;
  v_note_document := (v_note_credit->>'documento_id')::uuid;
  v_note_cpe := (v_note_credit->>'cpe_id')::uuid;

  IF (v_note_credit->>'cxc_reduction')::numeric <> 40
     OR (v_note_credit->>'saldo_favor')::numeric <> 20
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 0
     OR lower((SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc)) <> 'cancelado'
     OR (SELECT count(*) FROM public.cxc_pagos
         WHERE tenant_id = v_tenant AND documento_id = v_note_document
           AND tipo = 'NOTA_CREDITO' AND monto = 40) <> 1
     OR (SELECT count(*) FROM public.saldos_favor_clientes
         WHERE tenant_id = v_tenant AND nota_credito_documento_id = v_note_document
           AND rma_id IS NULL AND monto_disponible = 20) <> 1
     OR (SELECT count(*) FROM public.documento_detalles
         WHERE tenant_id = v_tenant AND documento_id = v_note_document) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'nota_credito.emitida'
           AND aggregate_id = v_note_document::text
           AND (payload->>'cxcReduction')::numeric = 40
           AND (payload->>'customerCreditBalance')::numeric = 20) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_472_CREDIT_NOTE_PROJECTIONS_INVALID:%', v_note_credit;
  END IF;

  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_document_credit, '07', '10',
    'Ajuste comercial parcial verify 472', 60, 'verify:472:credit:main'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->>'documento_id')::uuid <> v_note_document
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant AND documento_referencia_id = v_document_credit
           AND tipo_documento = '07') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_472_CREDIT_RETRY_DUPLICATED:%', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_document_credit, '07', '10',
      'Misma llave distinto importe', 59, 'verify:472:credit:main'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_472_KEY_COLLISION_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_document_credit, '07', '10',
      'Excede comprobante origen', 59, 'verify:472:credit:exceeds'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_472_CUMULATIVE_CREDIT_EXCESS_ACCEPTED'; END IF;

  -- Falla inducida en la última frontera: documento/CPE/CxC deben revertirse.
  SELECT count(*) INTO v_before_docs FROM public.documentos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_cxc FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant;
  PERFORM set_config('app.verify_472_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.crear_nota_referenciada_tx(
      v_tenant, v_actor, v_document_debit, '08', '02',
      'Aumento fallido por outbox', 59, 'verify:472:debit:late-failure'
    );
  EXCEPTION WHEN raise_exception THEN v_failed := true;
  END;
  PERFORM set_config('app.verify_472_fail_outbox', 'off', true);
  IF NOT v_failed
     OR (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant) <> v_before_docs
     OR (SELECT count(*) FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant) <> v_before_cxc THEN
    RAISE EXCEPTION 'VERIFY_472_LATE_FAILURE_DID_NOT_ROLLBACK';
  END IF;

  SELECT public.crear_nota_referenciada_tx(
    v_tenant, v_actor, v_document_debit, '08', '02',
    'Aumento contractual verify 472', 59, 'verify:472:debit:main'
  ) INTO v_note_debit;
  v_note_debit_document := (v_note_debit->>'documento_id')::uuid;
  IF (SELECT count(*) FROM public.cuentas_por_cobrar
      WHERE tenant_id = v_tenant AND documento_id = v_note_debit_document
        AND tipo_documento = 'NOTA_DEBITO' AND monto_pendiente = 59) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'nota_debito.emitida'
           AND aggregate_id = v_note_debit_document::text
           AND (payload->>'total')::numeric = 59) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_472_DEBIT_NOTE_PROJECTIONS_INVALID:%', v_note_debit;
  END IF;

  IF (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id = v_tenant)
       <> v_before_inventory THEN
    RAISE EXCEPTION 'VERIFY_472_MOVED_INVENTORY';
  END IF;

  v_sha := encode(extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'), 'hex');
  SELECT public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_note_cpe, v_xml, 'firma-hash-472', v_sha,
    'verify:472:sign:main'
  ) INTO v_sign;
  IF v_sign->>'estado' <> 'FIRMADO'
     OR (SELECT estado FROM public.cpe WHERE id = v_note_cpe) <> 'FIRMADO'
     OR (SELECT metadata->>'signed_xml_sha256' FROM public.cpe WHERE id = v_note_cpe) <> v_sha THEN
    RAISE EXCEPTION 'VERIFY_472_SIGNATURE_NOT_PERSISTED:%', v_sign;
  END IF;

  -- Una llave distinta no duplica la transición si la intención es idéntica.
  SELECT public.firmar_nota_referenciada_tx(
    v_tenant, v_actor, v_note_cpe, v_xml, 'firma-hash-472', v_sha,
    'verify:472:sign:network-retry'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.notas_referenciadas_operaciones
         WHERE tenant_id = v_tenant AND nota_cpe_id = v_note_cpe
           AND tipo_operacion = 'FIRMAR') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_472_SIGNATURE_RETRY_DUPLICATED:%', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.firmar_nota_referenciada_tx(
      v_tenant, v_actor, v_note_cpe, v_xml || 'different', 'firma-distinta-472',
      encode(extensions.digest(convert_to(v_xml || 'different', 'UTF8'), 'sha256'), 'hex'),
      'verify:472:sign:different'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_472_DIFFERENT_RESIGN_ACCEPTED'; END IF;

  IF NOT app.is_accounting_event_458('nota_debito.emitida')
     OR has_function_privilege('authenticated',
       'public.crear_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,numeric,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.firmar_nota_referenciada_tx(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.notas_referenciadas_operaciones', 'INSERT')
     OR has_table_privilege('service_role', 'public.notas_referenciadas_operaciones', 'INSERT')
     OR has_table_privilege('service_role', 'public.notas_referenciadas_operaciones', 'UPDATE')
     OR has_table_privilege('service_role', 'public.notas_referenciadas_operaciones', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.notas_referenciadas_operaciones', 'SELECT')
     OR has_function_privilege('service_role',
       'app.insert_nota_outbox_472(uuid,uuid,text,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_472_ACL_OR_ACCOUNTING_OWNERSHIP_INVALID';
  END IF;
END;
$$;

ROLLBACK;
