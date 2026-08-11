\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 466 solo puede ejecutarse en la base efimera erp_e2e';
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

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_actor_without_role uuid := gen_random_uuid();
  v_role uuid;
  v_client uuid;
  v_warehouse uuid;
  v_document uuid;
  v_note_document uuid;
  v_cxc uuid;
  v_cpe uuid := gen_random_uuid();
  v_note uuid;
  v_source_event uuid := gen_random_uuid();
  v_entry uuid;
  v_cashbox uuid;
  v_session uuid;
  v_payment uuid;
  v_adjustment_operation uuid;
  v_refund_movement uuid;
  v_rma uuid;
  v_credit uuid;
  v_result jsonb;
  v_retry jsonb;
  v_before numeric;
  v_failed boolean;
  v_count bigint;
BEGIN
  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES (
    v_tenant, 'VERIFY-466-' || left(v_tenant::text, 8),
    'Tenant verify 466', 'Fixture local transaccional',
    'PE', 'test', true, 'ACTIVO'
  );
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
    configuracion_completa, habilitar_rma, serie_nota_credito
  ) VALUES (
    v_tenant, '20600000466', 'Empresa verify 466', 'PE', 'PEN',
    'ACTIVO', true, true, 'FC66'
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Finanzas', 'Verify 466',
     'finanzas-466-' || left(v_actor::text, 8) || '@local.invalid',
     'finanzas466', 'unused-local-hash', true, 'ACTIVO'),
    (v_actor_without_role, v_tenant, 'Sin rol', 'Verify 466',
     'sin-rol-466-' || left(v_actor_without_role::text, 8) || '@local.invalid',
     'sinrol466', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.roles (
    tenant_id, nombre, descripcion, is_system_role, activo
  ) VALUES (
    v_tenant, 'FINANZAS', 'Rol financiero verify 466', true, true
  ) RETURNING id INTO v_role;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  VALUES (v_actor, v_role, v_tenant);

  IF NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE rp.role_id = v_role
      AND lower(p.codigo) = 'finanzas.cxc.cobros.revertir'
      AND rp.concedido
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE rp.role_id = v_role
      AND lower(p.codigo) = 'ventas.rma.revertir_reembolso'
      AND rp.concedido
  ) THEN
    RAISE EXCEPTION 'VERIFY_466_RBAC_SEED_FAILED';
  END IF;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-466', 'Cliente verify 466', 'Cliente verify 466',
    'RUC', '20123456466', true
  ) RETURNING id INTO v_client;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-466', 'Almacén verify 466',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_warehouse;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F466', '1', 'EMITIDO', now(),
    now() + interval '30 days', 'PEN', 1, 100, 18, 118,
    100, 0, 0, 0, v_client, v_actor
  ) RETURNING id INTO v_document;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total,
    monto_original, monto_pendiente, saldo, saldo_pendiente, total,
    retencion_total, percepcion_total, detraccion_total, anticipo_total,
    fecha_emision, fecha_vencimiento, moneda, numero_documento,
    tipo_documento, idempotency_key, event_source, tipo_cambio_origen
  ) VALUES (
    v_tenant, v_client, v_document, 'PENDIENTE', 118, 118, 118, 118,
    118, 118, 0, 0, 0, 0, current_date, current_date + 30, 'PEN',
    'F466-00000001', 'FACTURA', 'verify-466-cxc', 'verify.466', 1
  ) RETURNING id INTO v_cxc;

  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  ) VALUES (
    v_cpe, v_tenant, v_document, '01', 'F466', '1',
    '20600000466', 'Empresa verify 466', 'Lima', '6', '20123456466',
    'Cliente verify 466', 'Lima', v_client, 'PEN', 100, 0, 0, 0, 18,
    118, 118, jsonb_build_array(jsonb_build_object(
      'codigo', 'SERV-466', 'descripcion', 'Servicio verify 466',
      'unidad', 'ZZ', 'cantidad', 1, 'precio_unitario', 100,
      'valor_venta', 100, 'impuesto_igv', 18, 'afectacion_igv', '10'
    )), now(), current_date + 30, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    v_actor, v_source_event, true
  );

  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    v_tenant, now(), 'Venta original verify 466',
    'Venta original verify 466', 'F466-00000001', 118, 118,
    'CONFIRMADO', 'VERIFY_466', v_source_event, v_actor, v_actor::text
  ) RETURNING id INTO v_entry;
  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, nombre, concepto, debe, haber
  ) VALUES
    (v_tenant, v_entry, 'CxC', 'CxC venta', 118, 0),
    (v_tenant, v_entry, 'Ingreso', 'Ingreso venta', 0, 118);

  SELECT public.solicitar_anulacion_cpe_tx(
    v_cpe, v_tenant, v_actor, 'Reembolso integral verify 466',
    '01', 'verify-466-cpe-request'
  ) INTO v_result;
  v_note := (v_result #>> '{nota_credito,id}')::uuid;
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      sunat_status = 'ACCEPTED', cdr_sunat = 'CDR-VERIFY-466'
  WHERE id = v_note AND tenant_id = v_tenant;

  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant, 'CAJA-466', 'Caja verify 466', 'ACTIVO',
    v_warehouse, 'MOSTRADOR', v_actor
  ) RETURNING id INTO v_cashbox;
  INSERT INTO public.sesiones_caja (
    tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, hora_apertura, fecha_apertura,
    monto_inicial, monto_inicio, monto_esperado, monto_contado,
    monto_cierre, total_efectivo, total_tarjeta, moneda
  ) VALUES (
    v_tenant, v_cashbox, v_actor, v_actor, v_actor, v_actor,
    'ABIERTA', now(), now(), 100, 100, 100, 0, 0, 0, 0, 'PEN'
  ) RETURNING id INTO v_session;

  SELECT public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant,
    v_cxc,
    jsonb_build_object(
      'origen', 'CLIENTE',
      'tipo', 'RETENCION',
      'monto', 18,
      'moneda', 'PEN',
      'fecha', current_date,
      'referencia', 'RET-466'
    ),
    v_actor,
    'verify-466-cxc-adjustment'
  ) INTO v_result;
  v_adjustment_operation := (v_result->>'id')::uuid;

  SELECT public.registrar_cxc_pago_tx(
    v_tenant,
    v_cxc,
    jsonb_build_object(
      'monto', 100,
      'fecha_pago', current_date,
      'tipo', 'PAGO',
      'metodo_pago', 'EFECTIVO',
      'sesion_caja_id', v_session,
      'referencia', 'COBRO-466',
      'idempotency_key', 'verify-466-cxc-payment'
    ),
    v_actor
  ) INTO v_result;
  v_payment := (v_result #>> '{pago,id}')::uuid;

  SELECT public.revertir_cobro_cxc_anulacion_tx(
    v_tenant, v_actor, v_cpe, v_payment,
    jsonb_build_object(
      'motivo', 'Reembolso integral verify 466',
      'sesion_caja_id', v_session
    ),
    'verify-466-cxc-refund'
  ) INTO v_result;

  IF v_result #>> '{anulacion,estado}' <> 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA'
     OR (v_result #>> '{anulacion,ajustes_activos_restantes}')::integer <> 1
     OR (v_result->>'monto_reembolsado')::numeric <> 100
     OR (SELECT estado FROM public.cxc_pagos WHERE id = v_payment) <> 'INACTIVO'
     OR (SELECT activo FROM public.cxc_pagos WHERE id = v_payment)
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe) = 'ANULADO'
     OR (SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc) = 'ANULADA'
     OR (SELECT count(*) FROM public.cxc_cobro_reversas
         WHERE tenant_id = v_tenant AND pago_id = v_payment) <> 1
     OR (SELECT count(*) FROM public.movimientos_caja
         WHERE tenant_id = v_tenant
           AND referencia_tipo = 'cxc_pago_reverso'
           AND referencia_documento = v_payment::text
           AND monto = -100) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'cobro.revertido'
           AND aggregate_id = v_payment::text) <> 1
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant AND event_type = 'cpe.anulado'
         AND aggregate_id = v_cpe::text
     ) THEN
    RAISE EXCEPTION 'VERIFY_466_CXC_ADJUSTMENT_BLOCKER_NOT_ENFORCED: %', v_result;
  END IF;

  SELECT public.revertir_ajuste_cxc_anulacion_tx(
    v_tenant, v_actor, v_cpe, v_adjustment_operation,
    jsonb_build_object('motivo', 'Reversa fiscal explícita verify 466'),
    'verify-466-cxc-adjustment-reverse'
  ) INTO v_result;
  IF v_result #>> '{anulacion,estado}' <> 'ANULADO'
     OR (v_result #>> '{ajuste,saldo_restaurado}')::numeric <> 118
     OR coalesce((v_result->>'idempotent')::boolean, true)
     OR (SELECT estado FROM public.operaciones_fiscales_financieras
         WHERE id = v_adjustment_operation) <> 'ANULADO'
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe) <> 'ANULADO'
     OR (SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 'ANULADA'
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'cxc.ajuste.revertido'
           AND aggregate_id = v_adjustment_operation::text
           AND (payload->>'eventoOriginalId')::uuid IS NOT NULL) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'cpe.anulado'
           AND aggregate_id = v_cpe::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_466_CXC_ADJUSTMENT_REVERSAL_FINALIZATION_FAILED: %', v_result;
  END IF;

  SELECT public.revertir_ajuste_cxc_anulacion_tx(
    v_tenant, v_actor, v_cpe, v_adjustment_operation,
    jsonb_build_object('motivo', 'Reversa fiscal explícita verify 466'),
    'verify-466-cxc-adjustment-reverse'
  ) INTO v_retry;
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT count(*) FROM public.reversas_ajustes_fiscales_cxc
         WHERE tenant_id = v_tenant
           AND operacion_id = v_adjustment_operation) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_466_CXC_ADJUSTMENT_RETRY_MUTATED: %', v_retry;
  END IF;

  SELECT public.revertir_cobro_cxc_anulacion_tx(
    v_tenant, v_actor, v_cpe, v_payment,
    jsonb_build_object(
      'motivo', 'Reembolso integral verify 466',
      'sesion_caja_id', v_session
    ),
    'verify-466-cxc-refund'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.cxc_cobro_reversas
         WHERE tenant_id = v_tenant AND pago_id = v_payment) <> 1
     OR (SELECT count(*) FROM public.movimientos_caja
         WHERE tenant_id = v_tenant
           AND referencia_tipo = 'cxc_pago_reverso'
           AND referencia_documento = v_payment::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_466_CXC_REFUND_RETRY_MUTATED: %', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.revertir_cobro_cxc_anulacion_tx(
      v_tenant, v_actor, v_cpe, v_payment,
      jsonb_build_object(
        'motivo', 'Payload distinto verify 466',
        'sesion_caja_id', v_session
      ),
      'verify-466-cxc-refund'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_466_CXC_FINGERPRINT_CONFLICT_NOT_REJECTED';
  END IF;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    moneda, tipo_cambio, subtotal, impuesto_igv, total, cliente_id, created_by
  ) VALUES (
    v_tenant, 'NOTA_CREDITO', 'FC66', '2', 'EMITIDO', now(),
    'PEN', 1, 50, 0, 50, v_client, v_actor
  ) RETURNING id INTO v_note_document;
  INSERT INTO public.rma_solicitudes (
    tenant_id, numero, cliente_id, motivo_general, tipo, estado,
    documento_origen_id, cpe_origen_id, cxc_origen_id,
    nota_credito_documento_id, nota_credito_cpe_id, created_by
  ) VALUES (
    v_tenant, 'RMA-466-00001', v_client, 'Fixture reembolso 466',
    'DEVOLUCION', 'CERRADA', v_document, v_cpe, v_cxc,
    v_note_document, v_note, v_actor
  ) RETURNING id INTO v_rma;
  INSERT INTO public.saldos_favor_clientes (
    tenant_id, cliente_id, rma_id, documento_origen_id,
    nota_credito_documento_id, nota_credito_cpe_id, moneda,
    tipo_cambio_origen, monto_original, monto_disponible,
    monto_local_original, monto_local_disponible, estado, created_by
  ) VALUES (
    v_tenant, v_client, v_rma, v_document, v_note_document, v_note,
    'PEN', 1, 50, 50, 50, 50, 'DISPONIBLE', v_actor
  ) RETURNING id INTO v_credit;
  INSERT INTO public.saldos_favor_movimientos (
    tenant_id, saldo_favor_id, tipo, monto, actor_id,
    idempotency_key, event_id, metadata
  ) VALUES (
    v_tenant, v_credit, 'ORIGEN_NC', 50, v_actor,
    'verify-466-credit-origin', gen_random_uuid(),
    jsonb_build_object('source', 'verify.466')
  );

  SELECT public.reembolsar_saldo_favor_tx(
    v_tenant, v_actor, v_credit,
    jsonb_build_object(
      'monto', 20, 'medio', 'CAJA', 'sesion_caja_id', v_session
    ),
    'verify-466-credit-refund'
  ) INTO v_result;
  v_refund_movement := (v_result->>'movimiento_id')::uuid;

  v_failed := false;
  BEGIN
    PERFORM public.revertir_reembolso_saldo_favor_tx(
      v_tenant, v_actor_without_role, v_credit, v_refund_movement,
      jsonb_build_object(
        'motivo', 'Actor sin permiso verify 466',
        'sesion_caja_id', v_session
      ),
      'verify-466-credit-reverse-forbidden'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_466_RMA_PERMISSION_NOT_ENFORCED';
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables
  SET estado = 'CERRADO'
  WHERE tenant_id = v_tenant
    AND anio = extract(year from app.hoy_tenant(v_tenant))::integer
    AND mes = extract(month from app.hoy_tenant(v_tenant))::integer;
  PERFORM set_config('app.period_transition_458', 'off', true);
  SELECT monto_disponible INTO v_before
  FROM public.saldos_favor_clientes WHERE id = v_credit;
  v_failed := false;
  BEGIN
    PERFORM public.revertir_reembolso_saldo_favor_tx(
      v_tenant, v_actor, v_credit, v_refund_movement,
      jsonb_build_object(
        'motivo', 'Período cerrado verify 466',
        'sesion_caja_id', v_session
      ),
      'verify-466-credit-reverse-closed'
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_failed := true;
  END;
  IF NOT v_failed
     OR (SELECT monto_disponible FROM public.saldos_favor_clientes
         WHERE id = v_credit) <> v_before
     OR EXISTS (
       SELECT 1 FROM public.saldos_favor_movimientos
       WHERE tenant_id = v_tenant
         AND reversa_de_movimiento_id = v_refund_movement
     ) THEN
    RAISE EXCEPTION 'VERIFY_466_CLOSED_PERIOD_DID_NOT_ROLL_BACK';
  END IF;
  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables
  SET estado = 'ABIERTO'
  WHERE tenant_id = v_tenant
    AND anio = extract(year from app.hoy_tenant(v_tenant))::integer
    AND mes = extract(month from app.hoy_tenant(v_tenant))::integer;
  PERFORM set_config('app.period_transition_458', 'off', true);

  SELECT public.revertir_reembolso_saldo_favor_tx(
    v_tenant, v_actor, v_credit, v_refund_movement,
    jsonb_build_object(
      'motivo', 'Reposición de reembolso verify 466',
      'sesion_caja_id', v_session
    ),
    'verify-466-credit-reverse'
  ) INTO v_result;
  IF (v_result->>'saldo_disponible')::numeric <> 50
     OR (v_result->>'monto_repuesto')::numeric <> 20
     OR (SELECT count(*) FROM public.saldos_favor_movimientos
         WHERE tenant_id = v_tenant AND saldo_favor_id = v_credit
           AND tipo = 'REVERSA'
           AND reversa_de_movimiento_id = v_refund_movement) <> 1
     OR (SELECT count(*) FROM public.movimientos_caja
         WHERE tenant_id = v_tenant
           AND referencia_tipo = 'saldo_favor_reembolso_reverso'
           AND referencia_documento = v_refund_movement::text
           AND monto = 20) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant
           AND event_type = 'saldo_favor.reembolso_revertido'
           AND aggregate_id = v_credit::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_466_RMA_REFUND_REVERSAL_FAILED: %', v_result;
  END IF;

  SELECT public.revertir_reembolso_saldo_favor_tx(
    v_tenant, v_actor, v_credit, v_refund_movement,
    jsonb_build_object(
      'motivo', 'Reposición de reembolso verify 466',
      'sesion_caja_id', v_session
    ),
    'verify-466-credit-reverse'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.saldos_favor_movimientos
         WHERE tenant_id = v_tenant
           AND reversa_de_movimiento_id = v_refund_movement) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_466_RMA_RETRY_MUTATED: %', v_retry;
  END IF;

  SELECT count(*) INTO v_count
  FROM (VALUES
    ('public.revertir_cobro_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure),
    ('public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure),
    ('public.revertir_ajuste_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure)
  ) AS f(oid)
  WHERE has_function_privilege('service_role', oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', oid, 'EXECUTE');
  IF v_count <> 3
     OR has_function_privilege('service_role',
       'app.seed_refund_permissions_466(uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.cxc_cobro_reversas', 'INSERT')
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.movimientos_caja'::regclass
         AND tgname = 'trg_publish_pos_cash_refund_466'
         AND tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'VERIFY_466_ACL_OR_POS_TRIGGER_FAILED';
  END IF;
END;
$$;

ROLLBACK;
