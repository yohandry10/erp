\set ON_ERROR_STOP on

BEGIN;

UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 452 solo puede ejecutarse en la base efimera erp_e2e';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.verify_452_fail_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.verify_452_fail_outbox', true) = 'on'
     AND NEW.event_type IN ('pago.proveedor.registrado', 'cobro.registrado', 'cxc.ajuste.registrado') THEN
    RAISE EXCEPTION 'VERIFY_452_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_452_fail_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_452_fail_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_452_fail_outbox();

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_provider uuid;
  v_client uuid;
  v_bank_pen uuid;
  v_bank_usd uuid;
  v_warehouse uuid;
  v_cashbox uuid;
  v_session uuid;
  v_cxp_bank uuid;
  v_cxp_cash uuid;
  v_cxp_fx uuid;
  v_cxp_batch_1 uuid;
  v_cxp_batch_2 uuid;
  v_cxp_batch_bad uuid;
  v_cxp_fail uuid;
  v_cxc_bank uuid;
  v_cxc_cash uuid;
  v_cxc_fx uuid;
  v_cxc_adjust uuid;
  v_nc_document uuid;
  v_result jsonb;
  v_retry jsonb;
  v_batch jsonb;
  v_failed boolean;
  v_before numeric;
  v_count bigint;
  v_payload jsonb;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-452-' || left(v_tenant::text, 8), 'Tenant verify 452',
     'Fixture local transaccional', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-452-' || left(v_other_tenant::text, 8), 'Tenant ajeno 452',
     'Fixture local transaccional', 'PE', 'test', true, 'ACTIVO');

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado, configuracion_completa
  ) VALUES (
    v_tenant, '20600000452', 'Empresa verify 452', 'PE', 'PEN', 'ACTIVO', true
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Actor', 'Verify 452',
     'actor-452-' || left(v_actor::text, 8) || '@local.invalid',
     'actor452', 'unused-local-hash', true, 'ACTIVO'),
    (v_other_actor, v_other_tenant, 'Otro', 'Actor 452',
     'other-452-' || left(v_other_actor::text, 8) || '@local.invalid',
     'other452', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'PROV-452', 'Proveedor 452', 'Proveedor 452',
    '20123456783', 'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_provider;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-452', 'Cliente 452', 'Cliente 452', 'RUC', '20123456784', true
  ) RETURNING id INTO v_client;

  INSERT INTO public.cuentas_bancarias (
    tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, saldo, saldo_actual, saldo_contable, activa, activo,
    estado, permite_sobregiro
  ) VALUES
    (v_tenant, 'Banco PEN 452', 'BANK-PEN-452', 'Banco local', '452-PEN',
     'CORRIENTE', 'PEN', 5000, 5000, 5000, true, true, 'ACTIVO', false),
    (v_tenant, 'Banco USD 452', 'BANK-USD-452', 'Banco local', '452-USD',
     'CORRIENTE', 'USD', 1000, 1000, 1000, true, true, 'ACTIVO', false)
  ;
  SELECT id INTO v_bank_pen FROM public.cuentas_bancarias
  WHERE tenant_id = v_tenant AND codigo = 'BANK-PEN-452';
  SELECT id INTO v_bank_usd FROM public.cuentas_bancarias
  WHERE tenant_id = v_tenant AND codigo = 'BANK-USD-452';

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-452', 'Almacen verify 452', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_warehouse;

  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant, 'CAJA-452', 'Caja verify 452', 'ACTIVO', v_warehouse, 'MOSTRADOR', v_actor
  ) RETURNING id INTO v_cashbox;

  INSERT INTO public.sesiones_caja (
    tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, hora_apertura, fecha_apertura,
    monto_inicial, monto_inicio, monto_esperado, monto_contado,
    monto_cierre, total_efectivo, total_tarjeta, moneda
  ) VALUES (
    v_tenant, v_cashbox, v_actor, v_actor, v_actor, v_actor,
    'ABIERTA', now(), now(), 500, 500, 500, 0, 0, 0, 0, 'PEN'
  ) RETURNING id INTO v_session;

  INSERT INTO public.tipos_cambio (
    tenant_id, codigo, nombre, moneda_origen, moneda_destino,
    fecha, compra, venta, fuente, estado, activo
  ) VALUES
    (v_tenant, 'USD-PEN-' || current_date::text, 'USD/PEN verify 452',
     'USD', 'PEN', current_date, 3.75, 3.80, 'VERIFY_452', 'ACTIVO', true);

  -- No se inventan cotizaciones: una moneda sin fuente vigente falla cerrado.
  v_failed := false;
  BEGIN
    PERFORM app.treasury_valuation_452(
      v_tenant, 'CXP', 'EUR', NULL, current_date, current_date
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_452_MISSING_FX_NOT_REJECTED'; END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, fecha_emision,
    fecha_vencimiento, moneda, subtotal, igv, total, saldo,
    saldo_pendiente, estado, condiciones_pago, dias_credito, tipo_cambio_origen
  ) VALUES
    (v_tenant, v_provider, 'FP-452-BANK', current_date, current_date + 30,
     'PEN', 100, 18, 118, 118, 118, 'PENDIENTE', 'CREDITO', 30, 1),
    (v_tenant, v_provider, 'FP-452-CASH', current_date, current_date + 30,
     'PEN', 80, 14.40, 94.40, 94.40, 94.40, 'PENDIENTE', 'CREDITO', 30, 1),
    (v_tenant, v_provider, 'FP-452-FX', current_date, current_date + 30,
     'USD', 100, 0, 100, 100, 100, 'PENDIENTE', 'CREDITO', 30, 3.70),
    (v_tenant, v_provider, 'FP-452-B1', current_date, current_date + 30,
     'PEN', 40, 0, 40, 40, 40, 'PENDIENTE', 'CREDITO', 30, 1),
    (v_tenant, v_provider, 'FP-452-B2', current_date, current_date + 30,
     'PEN', 60, 0, 60, 60, 60, 'PENDIENTE', 'CREDITO', 30, 1),
    (v_tenant, v_provider, 'FP-452-BAD', current_date, current_date + 30,
     'PEN', 25, 0, 25, 25, 25, 'PENDIENTE', 'CREDITO', 30, 1),
    (v_tenant, v_provider, 'FP-452-FAIL', current_date, current_date + 30,
     'PEN', 50, 0, 50, 50, 50, 'PENDIENTE', 'CREDITO', 30, 1);
  SELECT id INTO v_cxp_bank FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-BANK';
  SELECT id INTO v_cxp_cash FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-CASH';
  SELECT id INTO v_cxp_fx FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-FX';
  SELECT id INTO v_cxp_batch_1 FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-B1';
  SELECT id INTO v_cxp_batch_2 FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-B2';
  SELECT id INTO v_cxp_batch_bad FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-BAD';
  SELECT id INTO v_cxp_fail FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FP-452-FAIL';

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, estado, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, total, fecha_emision,
    fecha_vencimiento, moneda, numero_documento, tipo_documento,
    idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES
    (v_tenant, v_client, 'PENDIENTE', 120, 120, 120, 120, 120, 120,
     current_date, current_date + 30, 'PEN', 'FC-452-BANK', 'FACTURA',
     'verify-452-cxc-bank', 'verify.452', 1, jsonb_build_object('origen','migracion_apertura')),
    (v_tenant, v_client, 'PENDIENTE', 90, 90, 90, 90, 90, 90,
     current_date, current_date + 30, 'PEN', 'FC-452-CASH', 'FACTURA',
     'verify-452-cxc-cash', 'verify.452', 1, jsonb_build_object('origen','migracion_apertura')),
    (v_tenant, v_client, 'PENDIENTE', 100, 100, 100, 100, 100, 100,
     current_date, current_date + 30, 'USD', 'FC-452-FX', 'FACTURA',
     'verify-452-cxc-fx', 'verify.452', 3.70, jsonb_build_object('origen','migracion_apertura')),
    (v_tenant, v_client, 'PENDIENTE', 200, 200, 200, 200, 200, 200,
     current_date, current_date + 30, 'PEN', 'FC-452-ADJUST', 'FACTURA',
     'verify-452-cxc-adjust', 'verify.452', 1, jsonb_build_object('origen','migracion_apertura'));
  SELECT id INTO v_cxc_bank FROM public.cuentas_por_cobrar WHERE tenant_id=v_tenant AND numero_documento='FC-452-BANK';
  SELECT id INTO v_cxc_cash FROM public.cuentas_por_cobrar WHERE tenant_id=v_tenant AND numero_documento='FC-452-CASH';
  SELECT id INTO v_cxc_fx FROM public.cuentas_por_cobrar WHERE tenant_id=v_tenant AND numero_documento='FC-452-FX';
  SELECT id INTO v_cxc_adjust FROM public.cuentas_por_cobrar WHERE tenant_id=v_tenant AND numero_documento='FC-452-ADJUST';

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'NOTA_CREDITO', 'FC01', '452', 'EMITIDO', now(),
    now(), 'PEN', 1, 100, 18, 118, 100, 0, 0, 0, v_client, v_actor
  ) RETURNING id INTO v_nc_document;

  -- CxP bancaria: una intencion, una mutacion y un outbox durable.
  SELECT public.aplicar_pago_cxp_tx(v_tenant, v_cxp_bank, jsonb_build_object(
    'monto', 18, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
    'cuenta_bancaria_id', v_bank_pen, 'referencia', 'OP-452-CXP-BANK',
    'idempotency_key', 'verify:452:cxp:bank'
  ), v_actor) INTO v_result;
  IF (v_result->>'idempotent')::boolean
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=v_cxp_bank) <> 100
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank_pen) <> 4982
     OR (SELECT count(*) FROM public.movimientos_bancarios WHERE tenant_id=v_tenant AND cxp_id=v_cxp_bank) <> 1
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='pago.proveedor.registrado' AND idempotency_key='verify:452:cxp:bank') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_452_CXP_BANK_ATOMIC_FAILED';
  END IF;
  SELECT public.aplicar_pago_cxp_tx(v_tenant, v_cxp_bank, jsonb_build_object(
    'monto', 18, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
    'cuenta_bancaria_id', v_bank_pen, 'referencia', 'OP-452-CXP-BANK',
    'idempotency_key', 'verify:452:cxp:bank'
  ), v_actor) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank_pen) <> 4982 THEN
    RAISE EXCEPTION 'VERIFY_452_CXP_BANK_REPLAY_FAILED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.aplicar_pago_cxp_tx(v_tenant, v_cxp_bank, jsonb_build_object(
      'monto', 19, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
      'cuenta_bancaria_id', v_bank_pen, 'referencia', 'OP-452-CXP-BANK',
      'idempotency_key', 'verify:452:cxp:bank'
    ), v_actor);
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_452_CXP_COLLISION_NOT_REJECTED'; END IF;

  -- Actor ajeno nunca puede aplicar una operacion del tenant.
  v_failed := false;
  BEGIN
    PERFORM public.aplicar_pago_cxp_tx(v_tenant, v_cxp_cash, jsonb_build_object(
      'monto', 10, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO',
      'idempotency_key', 'verify:452:foreign-actor'
    ), v_other_actor);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_452_FOREIGN_ACTOR_NOT_REJECTED'; END IF;

  -- Incluso dentro del tenant, un actor inactivo no puede mutar tesoreria.
  v_failed := false;
  BEGIN
    UPDATE public.usuarios SET activo = false, estado = 'INACTIVO' WHERE id = v_actor;
    PERFORM public.aplicar_pago_cxp_tx(v_tenant, v_cxp_cash, jsonb_build_object(
      'monto', 10, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO',
      'idempotency_key', 'verify:452:inactive-actor'
    ), v_actor);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_452_INACTIVE_ACTOR_NOT_REJECTED'; END IF;

  -- CxP efectivo: evidencia de pago y egreso de la unica caja del actor.
  SELECT public.aplicar_pago_cxp_tx(v_tenant, v_cxp_cash, jsonb_build_object(
    'monto', 40, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO',
    'idempotency_key', 'verify:452:cxp:cash'
  ), v_actor) INTO v_result;
  IF (v_result #>> '{movimiento_caja,tipo_movimiento}') <> 'RETIRO'
     OR (v_result #>> '{movimiento_caja,monto}')::numeric <> -40
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=v_cxp_cash) <> 54.40
     OR (SELECT count(*) FROM public.pagos_facturas WHERE tenant_id=v_tenant AND cuenta_por_pagar_id=v_cxp_cash) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_452_CXP_CASH_FAILED';
  END IF;

  -- CxP USD: banco nominal y payload contable en moneda local.
  SELECT public.aplicar_pago_cxp_tx(v_tenant, v_cxp_fx, jsonb_build_object(
    'monto', 100, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
    'cuenta_bancaria_id', v_bank_usd, 'referencia', 'OP-452-CXP-FX',
    'idempotency_key', 'verify:452:cxp:fx'
  ), v_actor) INTO v_result;
  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='pago.proveedor.registrado'
    AND idempotency_key='verify:452:cxp:fx';
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank_usd) <> 900
     OR (v_payload->>'montoContabilizado')::numeric <> 370
     OR (v_payload->>'montoLiquidacion')::numeric <> 380
     OR (v_payload->>'diferenciaCambio')::numeric <> -10 THEN
    RAISE EXCEPTION 'VERIFY_452_CXP_FX_FAILED payload=%', v_payload;
  END IF;

  -- CxC bancaria y efectivo: saldo, tesoreria y outbox en el mismo commit.
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_bank, jsonb_build_object(
    'monto', 20, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
    'cuenta_bancaria_id', v_bank_pen, 'referencia', 'OP-452-CXC-BANK',
    'idempotency_key', 'verify:452:cxc:bank'
  ), v_actor) INTO v_result;
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc_bank) <> 100
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank_pen) <> 5002
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id=v_tenant AND cuenta_id=v_cxc_bank) <> 1
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='cobro.registrado' AND idempotency_key='verify:452:cxc:bank') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_BANK_FAILED';
  END IF;
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_cash, jsonb_build_object(
    'monto', 30, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO',
    'idempotency_key', 'verify:452:cxc:cash'
  ), v_actor) INTO v_result;
  IF (v_result #>> '{movimiento_caja,tipo_movimiento}') <> 'INGRESO'
     OR (v_result #>> '{movimiento_caja,monto}')::numeric <> 30
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc_cash) <> 60 THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_CASH_FAILED';
  END IF;
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_cash, jsonb_build_object(
    'monto', 30, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO',
    'idempotency_key', 'verify:452:cxc:cash'
  ), v_actor) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.movimientos_caja WHERE tenant_id=v_tenant AND referencia_tipo='cxc_pago') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_CASH_REPLAY_FAILED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.registrar_cxc_pago_tx(v_tenant, v_cxc_cash, jsonb_build_object(
      'monto', 31, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO',
      'idempotency_key', 'verify:452:cxc:cash'
    ), v_actor);
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_452_CXC_COLLISION_NOT_REJECTED'; END IF;

  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_fx, jsonb_build_object(
    'monto', 100, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
    'cuenta_bancaria_id', v_bank_usd, 'referencia', 'OP-452-CXC-FX',
    'idempotency_key', 'verify:452:cxc:fx'
  ), v_actor) INTO v_result;
  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='cobro.registrado'
    AND idempotency_key='verify:452:cxc:fx';
  IF (v_payload->>'montoContabilizado')::numeric <> 370
     OR (v_payload->>'montoLiquidacion')::numeric <> 375
     OR (v_payload->>'diferenciaCambio')::numeric <> 5 THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_FX_FAILED payload=%', v_payload;
  END IF;

  -- Ajustes CxC: no mueven tesorería, usan evento propio y percepción aumenta saldo/total.
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
    'monto', 20, 'fecha_pago', current_date, 'tipo', 'RETENCION',
    'metodo_pago', 'RETENCION', 'idempotency_key', 'verify:452:cxc:retencion'
  ), v_actor) INTO v_result;
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
    'monto', 30, 'fecha_pago', current_date, 'tipo', 'DETRACCION',
    'metodo_pago', 'DETRACCION', 'idempotency_key', 'verify:452:cxc:detraccion'
  ), v_actor) INTO v_result;
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
    'monto', 10, 'fecha_pago', current_date, 'tipo', 'ANTICIPO',
    'metodo_pago', 'ANTICIPO', 'idempotency_key', 'verify:452:cxc:anticipo'
  ), v_actor) INTO v_result;
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
    'monto', 15, 'fecha_pago', current_date, 'tipo', 'PERCEPCION',
    'idempotency_key', 'verify:452:cxc:percepcion'
  ), v_actor) INTO v_result;
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 155
     OR (SELECT monto_total FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 215
     OR (SELECT retencion_total FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 20
     OR (SELECT detraccion_total FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 30
     OR (SELECT anticipo_total FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 10
     OR (SELECT percepcion_total FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 15
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant
          AND event_type='cxc.ajuste.registrado' AND aggregate_type='cxc_ajuste') <> 4
     OR EXISTS (SELECT 1 FROM public.movimientos_bancarios WHERE tenant_id=v_tenant AND cxc_id=v_cxc_adjust)
     OR EXISTS (SELECT 1 FROM public.movimientos_caja WHERE tenant_id=v_tenant
          AND referencia_tipo='cxc_pago' AND metadata->>'cxc_id'=v_cxc_adjust::text) THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_ADJUSTMENTS_FAILED';
  END IF;

  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
    'monto', 118, 'fecha_pago', current_date, 'tipo', 'NOTA_CREDITO',
    'documento_pago_id', v_nc_document,
    'idempotency_key', 'verify:452:cxc:nota-credito'
  ), v_actor) INTO v_result;
  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='cxc.ajuste.registrado'
    AND idempotency_key='verify:452:cxc:nota-credito';
  IF (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 37
     OR (v_payload->>'baseAjuste')::numeric <> 100
     OR (v_payload->>'igvAjuste')::numeric <> 18
     OR v_payload->>'tipoMovimiento' <> 'NOTA_CREDITO' THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_CREDIT_NOTE_FAILED payload=%', v_payload;
  END IF;
  SELECT public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
    'monto', 118, 'fecha_pago', current_date, 'tipo', 'NOTA_CREDITO',
    'documento_pago_id', v_nc_document,
    'idempotency_key', 'verify:452:cxc:nota-credito'
  ), v_actor) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id=v_tenant
          AND cuenta_id=v_cxc_adjust AND tipo='NOTA_CREDITO') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_CREDIT_NOTE_REPLAY_FAILED';
  END IF;

  SELECT count(*) INTO v_count FROM public.cxc_pagos
  WHERE tenant_id=v_tenant AND cuenta_id=v_cxc_adjust;
  PERFORM set_config('app.verify_452_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.registrar_cxc_pago_tx(v_tenant, v_cxc_adjust, jsonb_build_object(
      'monto', 1, 'fecha_pago', current_date, 'tipo', 'RETENCION',
      'idempotency_key', 'verify:452:cxc:adjust-late-failure'
    ), v_actor);
  EXCEPTION WHEN others THEN
    IF sqlerrm LIKE '%VERIFY_452_LATE_OUTBOX_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_452_fail_outbox', 'off', true);
  IF NOT v_failed
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc_adjust) <> 37
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id=v_tenant AND cuenta_id=v_cxc_adjust) <> v_count
     OR EXISTS (SELECT 1 FROM public.outbox_events WHERE tenant_id=v_tenant
          AND idempotency_key='verify:452:cxc:adjust-late-failure') THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_ADJUSTMENT_LATE_FAILURE_DID_NOT_ROLLBACK';
  END IF;

  -- El outbox no es best effort: un fallo tardio revierte saldo y banco.
  SELECT saldo INTO v_before FROM public.cuentas_bancarias WHERE id=v_bank_pen;
  PERFORM set_config('app.verify_452_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.aplicar_pago_cxp_tx(v_tenant, v_cxp_fail, jsonb_build_object(
      'monto', 10, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
      'cuenta_bancaria_id', v_bank_pen, 'referencia', 'OP-452-FAIL',
      'idempotency_key', 'verify:452:late-failure'
    ), v_actor);
  EXCEPTION WHEN others THEN
    IF sqlerrm LIKE '%VERIFY_452_LATE_OUTBOX_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_452_fail_outbox', 'off', true);
  IF NOT v_failed
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=v_cxp_fail) <> 50
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank_pen) <> v_before
     OR EXISTS (SELECT 1 FROM public.movimientos_bancarios WHERE tenant_id=v_tenant AND cxp_id=v_cxp_fail) THEN
    RAISE EXCEPTION 'VERIFY_452_LATE_FAILURE_DID_NOT_ROLLBACK';
  END IF;

  -- El mismo contrato fail-closed aplica al cobro CxC.
  SELECT saldo INTO v_before FROM public.cuentas_bancarias WHERE id=v_bank_pen;
  SELECT count(*) INTO v_count FROM public.cxc_pagos
  WHERE tenant_id=v_tenant AND cuenta_id=v_cxc_bank;
  PERFORM set_config('app.verify_452_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.registrar_cxc_pago_tx(v_tenant, v_cxc_bank, jsonb_build_object(
      'monto', 10, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
      'cuenta_bancaria_id', v_bank_pen, 'referencia', 'OP-452-CXC-FAIL',
      'idempotency_key', 'verify:452:cxc:late-failure'
    ), v_actor);
  EXCEPTION WHEN others THEN
    IF sqlerrm LIKE '%VERIFY_452_LATE_OUTBOX_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_452_fail_outbox', 'off', true);
  IF NOT v_failed
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc_bank) <> 100
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank_pen) <> v_before
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id=v_tenant AND cuenta_id=v_cxc_bank) <> v_count
     OR EXISTS (SELECT 1 FROM public.movimientos_bancarios
       WHERE tenant_id=v_tenant AND cxc_id=v_cxc_bank AND referencia='OP-452-CXC-FAIL') THEN
    RAISE EXCEPTION 'VERIFY_452_CXC_LATE_FAILURE_DID_NOT_ROLLBACK';
  END IF;

  -- Lote: dos writers individuales, dos outbox, una cabecera y replay exacto.
  SELECT public.procesar_pago_lote(
    v_tenant, v_bank_pen, current_date, 'TRANSFERENCIA', 'LOTE-452-OK',
    'Verify batch 452', jsonb_build_array(
      jsonb_build_object('cxp_id', v_cxp_batch_1, 'monto', 40),
      jsonb_build_object('cxp_id', v_cxp_batch_2, 'monto', 60)
    ), v_actor, 'verify:452:batch:ok'
  ) INTO v_batch;
  IF (v_batch->>'cantidad_pagos')::integer <> 2
     OR (v_batch->>'total_procesado')::numeric <> 100
     OR (v_batch #>> '{cuenta_bancaria,saldo_anterior}')::numeric <> 5002
     OR (v_batch #>> '{cuenta_bancaria,saldo_nuevo}')::numeric <> 4902
     OR (SELECT count(*) FROM public.pagos_lote WHERE tenant_id=v_tenant AND referencia_lote='LOTE-452-OK') <> 1
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='pago.proveedor.registrado' AND payload->>'referencia'='LOTE-452-OK') <> 2
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=v_cxp_batch_1) <> 0
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=v_cxp_batch_2) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_452_BATCH_FAILED result=%', v_batch;
  END IF;
  SELECT public.procesar_pago_lote(
    v_tenant, v_bank_pen, current_date, 'TRANSFERENCIA', 'LOTE-452-OK',
    'Verify batch 452', jsonb_build_array(
      jsonb_build_object('cxp_id', v_cxp_batch_1, 'monto', 40),
      jsonb_build_object('cxp_id', v_cxp_batch_2, 'monto', 60)
    ), v_actor, 'verify:452:batch:ok'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent_replay')::boolean THEN
    RAISE EXCEPTION 'VERIFY_452_BATCH_REPLAY_FAILED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.procesar_pago_lote(
      v_tenant, v_bank_pen, current_date, 'TRANSFERENCIA', 'LOTE-452-OK',
      'Verify batch 452 changed', jsonb_build_array(
        jsonb_build_object('cxp_id', v_cxp_batch_1, 'monto', 39),
        jsonb_build_object('cxp_id', v_cxp_batch_2, 'monto', 60)
      ), v_actor, 'verify:452:batch:ok'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_452_BATCH_COLLISION_NOT_REJECTED'; END IF;

  -- Si el segundo item falla, el primero tampoco queda aplicado.
  v_failed := false;
  BEGIN
    PERFORM public.procesar_pago_lote(
      v_tenant, v_bank_pen, current_date, 'TRANSFERENCIA', 'LOTE-452-ROLLBACK',
      NULL, jsonb_build_array(
        jsonb_build_object('cxp_id', v_cxp_batch_bad, 'monto', 10),
        jsonb_build_object('cxp_id', gen_random_uuid(), 'monto', 10)
      ), v_actor, 'verify:452:batch:rollback'
    );
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  IF NOT v_failed
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=v_cxp_batch_bad) <> 25
     OR EXISTS (SELECT 1 FROM public.pagos_lote WHERE tenant_id=v_tenant AND referencia_lote='LOTE-452-ROLLBACK') THEN
    RAISE EXCEPTION 'VERIFY_452_BATCH_ATOMIC_ROLLBACK_FAILED';
  END IF;

  -- ACL: ninguna RPC sensible queda expuesta a clientes PostgREST.
  IF has_function_privilege('anon', 'public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_452_RPC_EXPOSED_TO_CLIENT_ROLE';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid,text)', 'EXECUTE')
     OR to_regprocedure('public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_452_SERVICE_ROLE_OR_LEGACY_SIGNATURE_INVALID';
  END IF;
END;
$$;

ROLLBACK;
