\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_465_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

-- El harness local se declara de forma transaccional; nunca apunta a un ref
-- remoto y el ROLLBACK final restaura la configuración previa.
UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localerpephemeralqax',
    allow_demo_data = true, configured_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION app.verify_465_fail_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF current_setting('app.verify_465_fail_outbox', true) = 'on'
     AND NEW.event_type IN (
       'cxp.ajuste.registrado', 'cxc.ajuste.revertido',
       'factura.proveedor.registrada'
     ) THEN
    RAISE EXCEPTION 'VERIFY_465_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_verify_465_fail_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_465_fail_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_465_fail_outbox();

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_provider uuid;
  v_client uuid;
  v_bank_ledger uuid := gen_random_uuid();
  v_bank uuid;
  v_cxp uuid;
  v_cxc uuid;
  v_customer_advance uuid;
  v_supplier_advance uuid;
  v_detraction uuid;
  v_invoice uuid;
  v_operation uuid;
  v_source_payment uuid;
  v_case record;
  v_result jsonb;
  v_retry jsonb;
  v_failed boolean;
  v_before numeric;
  v_count bigint;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES (v_tenant, 'VERIFY-465-' || left(v_tenant::text, 8), 'Tenant verify 465',
    'Fixture local ajustes fiscales', 'PE', 'test', true, 'ACTIVO');
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado, configuracion_completa
  ) VALUES (v_tenant, '20600000465', 'Empresa verify 465', 'PE', 'PEN', 'ACTIVO', true);
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES (v_actor, v_tenant, 'Actor', 'Verify 465',
    'actor-465-' || left(v_actor::text, 8) || '@local.invalid',
    'actor465', 'unused-local-hash', true, 'ACTIVO');
  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (v_tenant, 'PROV-465', 'Proveedor 465', 'Proveedor 465',
    '20123456465', 'ACTIVO', true, 'CREDITO', 30)
  RETURNING id INTO v_provider;
  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (v_tenant, 'CLI-465', 'Cliente 465', 'Cliente 465',
    'RUC', '20123457465', true)
  RETURNING id INTO v_client;
  INSERT INTO public.plan_cuentas (
    id, tenant_id, codigo, nombre, tipo, tipo_cuenta,
    nivel, acepta_movimiento, activo, estado
  ) VALUES (v_bank_ledger, v_tenant, '104165', 'Banco verify 465',
    'ACTIVO', 'ACTIVO', 6, true, true, 'ACTIVO');
  INSERT INTO public.cuentas_bancarias (
    tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, saldo_inicial, saldo, saldo_actual, saldo_contable,
    cuenta_contable_id, activa, activo, estado, permite_sobregiro
  ) VALUES (v_tenant, 'Banco 465', 'BANK-465', 'Banco local', '465-PEN',
    'CORRIENTE', 'PEN', 1000, 1000, 1000, 1000,
    v_bank_ledger, true, true, 'ACTIVO', false)
  RETURNING id INTO v_bank;

  -- Las cuentas fiscales se crean una sola vez por tenant y son postables.
  PERFORM app.ensure_fiscal_account_465(v_tenant, '1042', 'Detracciones', 'ACTIVO', 4);
  PERFORM app.ensure_fiscal_account_465(v_tenant, '122', 'Anticipos de clientes', 'PASIVO', 3);
  PERFORM app.ensure_fiscal_account_465(v_tenant, '40113', 'Percepciones', 'PASIVO', 5);
  PERFORM app.ensure_fiscal_account_465(v_tenant, '40114', 'Retenciones', 'ACTIVO', 5);
  PERFORM app.ensure_fiscal_account_465(v_tenant, '421', 'Comprobantes por pagar', 'PASIVO', 3);
  PERFORM app.ensure_fiscal_account_465(v_tenant, '422', 'Anticipos a proveedores', 'ACTIVO', 3);

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, fecha_emision, fecha_vencimiento,
    moneda, subtotal, igv, total, saldo, saldo_pendiente, estado,
    condiciones_pago, dias_credito, tipo_cambio_origen
  ) VALUES (v_tenant, v_provider, 'FP-465-ADJUST', current_date, current_date + 30,
    'PEN', 100, 18, 118, 118, 118, 'PENDIENTE', 'CREDITO', 30, 1)
  RETURNING id INTO v_cxp;
  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, estado, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, total, fecha_emision,
    fecha_vencimiento, moneda, numero_documento, tipo_documento,
    idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES (v_tenant, v_client, 'PENDIENTE', 100, 100, 100, 100, 100, 100,
    current_date, current_date + 30, 'PEN', 'FC-465-ADJUST', 'FACTURA',
    'verify-465-cxc-adjust', 'verify.465', 1,
    jsonb_build_object('origen', 'migracion_apertura'))
  RETURNING id INTO v_cxc;

  -- Cliente: el anticipo incrementa banco y crea exactamente un outbox bancario.
  v_result := public.registrar_anticipo_tercero_tx(
    v_tenant, jsonb_build_object(
      'origen', 'CLIENTE', 'cliente_id', v_client,
      'cuenta_bancaria_id', v_bank, 'monto', 50, 'moneda', 'PEN',
      'fecha', current_date, 'referencia', 'ANT-CLI-465', 'tipo_cambio', 1
    ), v_actor, 'verify-465-advance-customer'
  );
  v_customer_advance := (v_result->>'id')::uuid;
  IF coalesce((v_result->>'idempotent')::boolean, true)
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 1050
     OR (SELECT monto_disponible FROM public.anticipos_terceros WHERE id = v_customer_advance) <> 50
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'banco.movimiento.registrado'
           AND idempotency_key LIKE 'banco.movimiento.registrado:%') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_465_CUSTOMER_ADVANCE_NOT_ATOMIC:%', v_result;
  END IF;
  v_retry := public.registrar_anticipo_tercero_tx(
    v_tenant, jsonb_build_object(
      'origen', 'CLIENTE', 'cliente_id', v_client,
      'cuenta_bancaria_id', v_bank, 'monto', 50, 'moneda', 'PEN',
      'fecha', current_date, 'referencia', 'ANT-CLI-465', 'tipo_cambio', 1
    ), v_actor, 'verify-465-advance-customer'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 1050 THEN
    RAISE EXCEPTION 'VERIFY_465_ADVANCE_RETRY_NOT_EXACT';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.registrar_anticipo_tercero_tx(
      v_tenant, jsonb_build_object(
        'origen', 'CLIENTE', 'cliente_id', v_client,
        'cuenta_bancaria_id', v_bank, 'monto', 51, 'moneda', 'PEN',
        'fecha', current_date, 'referencia', 'ANT-CLI-465', 'tipo_cambio', 1
      ), v_actor, 'verify-465-advance-customer'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_465_ADVANCE_FINGERPRINT_NOT_ENFORCED'; END IF;

  -- Proveedor: el anticipo disminuye banco; la aplicacion posterior no lo mueve otra vez.
  v_result := public.registrar_anticipo_tercero_tx(
    v_tenant, jsonb_build_object(
      'origen', 'PROVEEDOR', 'proveedor_id', v_provider,
      'cuenta_bancaria_id', v_bank, 'monto', 100, 'moneda', 'PEN',
      'fecha', current_date, 'referencia', 'ANT-PROV-465', 'tipo_cambio', 1
    ), v_actor, 'verify-465-advance-supplier'
  );
  v_supplier_advance := (v_result->>'id')::uuid;
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 950 THEN
    RAISE EXCEPTION 'VERIFY_465_SUPPLIER_ADVANCE_DID_NOT_DEBIT_BANK';
  END IF;

  v_result := public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant, v_cxc, jsonb_build_object(
      'origen', 'CLIENTE', 'tipo', 'ANTICIPO', 'anticipo_id', v_customer_advance,
      'monto', 20, 'moneda', 'PEN', 'fecha', current_date, 'referencia', 'APP-CLI-465'
    ), v_actor, 'verify-465-apply-customer-advance'
  );
  v_operation := (v_result->>'id')::uuid;
  IF (SELECT saldo FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 80
     OR (SELECT monto_disponible FROM public.anticipos_terceros WHERE id = v_customer_advance) <> 30
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 950
     OR NOT EXISTS (SELECT 1 FROM public.outbox_events
       WHERE event_id = (v_result->>'source_event_id')::uuid AND event_type = 'cxc.ajuste.registrado') THEN
    RAISE EXCEPTION 'VERIFY_465_CUSTOMER_ADVANCE_APPLICATION_INCONSISTENT:%', v_result;
  END IF;

  -- La reversa CxC es explícita: no toca banco, inactiva el ajuste 452,
  -- restaura el saldo del anticipo y emite una única intención compensatoria.
  v_result := public.revertir_ajuste_fiscal_cxc_tx(
    v_tenant, v_operation,
    jsonb_build_object('motivo', 'Anulacion aceptada; se libera el anticipo'),
    v_actor, 'verify-465-reverse-customer-advance'
  );
  v_source_payment := (v_result->>'cxc_pago_id')::uuid;
  IF (SELECT saldo FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 100
     OR (SELECT anticipo_total FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 0
     OR (SELECT monto_disponible FROM public.anticipos_terceros WHERE id = v_customer_advance) <> 50
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 950
     OR (SELECT estado FROM public.operaciones_fiscales_financieras WHERE id = v_operation) <> 'ANULADO'
     OR EXISTS (SELECT 1 FROM public.cxc_pagos
       WHERE id = v_source_payment AND (coalesce(activo, true) OR estado <> 'INACTIVO'))
     OR NOT EXISTS (SELECT 1 FROM public.outbox_events
       WHERE event_id = (v_result->>'event_id')::uuid
         AND event_type = 'cxc.ajuste.revertido'
         AND (payload->>'eventoOriginalId')::uuid IS NOT NULL) THEN
    RAISE EXCEPTION 'VERIFY_465_CUSTOMER_ADVANCE_REVERSAL_INCONSISTENT:%', v_result;
  END IF;
  v_retry := public.revertir_ajuste_fiscal_cxc_tx(
    v_tenant, v_operation,
    jsonb_build_object('motivo', 'Anulacion aceptada; se libera el anticipo'),
    v_actor, 'verify-465-reverse-customer-advance'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT count(*) FROM public.reversas_ajustes_fiscales_cxc
       WHERE tenant_id = v_tenant AND operacion_id = v_operation) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_465_CXC_REVERSAL_RETRY_NOT_EXACT';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.revertir_ajuste_fiscal_cxc_tx(
      v_tenant, v_operation,
      jsonb_build_object('motivo', 'Motivo diferente con la misma clave'),
      v_actor, 'verify-465-reverse-customer-advance'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_465_CXC_REVERSAL_FINGERPRINT_NOT_ENFORCED';
  END IF;

  -- Matriz contable/saldo: cada reversa deja nuevamente la CxC base en 100.
  FOR v_case IN SELECT * FROM (VALUES
    ('RETENCION', 10::numeric, 90::numeric, 100::numeric),
    ('PERCEPCION', 5::numeric, 105::numeric, 105::numeric),
    ('DETRACCION', 8::numeric, 92::numeric, 100::numeric)
  ) AS x(tipo, monto, saldo_aplicado, total_aplicado) LOOP
    v_result := public.registrar_ajuste_fiscal_financiero_tx(
      v_tenant, v_cxc, jsonb_build_object(
        'origen', 'CLIENTE', 'tipo', v_case.tipo, 'monto', v_case.monto,
        'moneda', 'PEN', 'fecha', current_date,
        'referencia', format('%s-CLI-465', left(v_case.tipo, 3))
      ), v_actor, format('verify-465-cxc-%s', lower(v_case.tipo))
    );
    v_operation := (v_result->>'id')::uuid;
    IF (SELECT saldo FROM public.cuentas_por_cobrar WHERE id = v_cxc)
         <> v_case.saldo_aplicado
       OR (SELECT total FROM public.cuentas_por_cobrar WHERE id = v_cxc)
         <> v_case.total_aplicado THEN
      RAISE EXCEPTION 'VERIFY_465_CXC_%_APPLICATION_WRONG', v_case.tipo;
    END IF;
    v_result := public.revertir_ajuste_fiscal_cxc_tx(
      v_tenant, v_operation,
      jsonb_build_object('motivo', format('Reversa verificada %s', v_case.tipo)),
      v_actor, format('verify-465-cxc-reverse-%s', lower(v_case.tipo))
    );
    IF (SELECT saldo FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 100
       OR (SELECT total FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 100
       OR (SELECT coalesce(retencion_total, 0) + coalesce(percepcion_total, 0)
            + coalesce(detraccion_total, 0) + coalesce(anticipo_total, 0)
           FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> 0
       OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 950 THEN
      RAISE EXCEPTION 'VERIFY_465_CXC_%_REVERSAL_WRONG:%', v_case.tipo, v_result;
    END IF;
  END LOOP;

  v_result := public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant, v_cxp, jsonb_build_object(
      'origen', 'PROVEEDOR', 'tipo', 'ANTICIPO', 'anticipo_id', v_supplier_advance,
      'monto', 40, 'moneda', 'PEN', 'fecha', current_date, 'referencia', 'APP-PROV-465'
    ), v_actor, 'verify-465-apply-supplier-advance'
  );
  IF (SELECT saldo FROM public.cuentas_por_pagar WHERE id = v_cxp) <> 78
     OR (SELECT anticipo_total FROM public.cuentas_por_pagar WHERE id = v_cxp) <> 40
     OR (SELECT monto_disponible FROM public.anticipos_terceros WHERE id = v_supplier_advance) <> 60
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 950
     OR NOT EXISTS (SELECT 1 FROM public.outbox_events
       WHERE event_id = (v_result->>'source_event_id')::uuid
         AND event_type = 'cxp.ajuste.registrado'
         AND payload->>'tipoMovimiento' = 'ANTICIPO') THEN
    RAISE EXCEPTION 'VERIFY_465_SUPPLIER_ADVANCE_APPLICATION_INCONSISTENT:%', v_result;
  END IF;

  -- Ajustes CxP: una sola mutacion documental y un outbox por intencion.
  PERFORM public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant, v_cxp, jsonb_build_object(
      'origen', 'PROVEEDOR', 'tipo', 'RETENCION', 'monto', 10,
      'base_calculo', 100, 'tasa', 10, 'moneda', 'PEN',
      'fecha', current_date, 'referencia', 'RET-PROV-465'
    ), v_actor, 'verify-465-supplier-retention'
  );
  PERFORM public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant, v_cxp, jsonb_build_object(
      'origen', 'PROVEEDOR', 'tipo', 'PERCEPCION', 'monto', 2,
      'moneda', 'PEN', 'fecha', current_date, 'referencia', 'PER-PROV-465'
    ), v_actor, 'verify-465-supplier-perception'
  );
  v_result := public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant, v_cxp, jsonb_build_object(
      'origen', 'PROVEEDOR', 'tipo', 'DETRACCION', 'monto', 20,
      'moneda', 'PEN', 'fecha', current_date, 'referencia', 'DET-PROV-465'
    ), v_actor, 'verify-465-supplier-detraction'
  );
  v_detraction := (v_result->>'id')::uuid;
  IF (SELECT saldo FROM public.cuentas_por_pagar WHERE id = v_cxp) <> 50
     OR (SELECT estado FROM public.operaciones_fiscales_financieras WHERE id = v_detraction) <> 'PENDIENTE_TESORERIA'
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 950 THEN
    RAISE EXCEPTION 'VERIFY_465_SUPPLIER_ADJUSTMENT_BALANCE_OR_STATE_WRONG';
  END IF;

  v_result := public.depositar_detraccion_proveedor_tx(
    v_tenant, v_detraction, jsonb_build_object(
      'cuenta_bancaria_id', v_bank, 'fecha', current_date,
      'referencia', 'DEP-DET-465', 'tipo_cambio', 1
    ), v_actor, 'verify-465-deposit-detraction'
  );
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 930
     OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id = v_cxp) <> 50
     OR v_result->>'estado' <> 'APLICADO'
     OR NOT EXISTS (SELECT 1 FROM public.outbox_events e
       WHERE e.event_type = 'banco.movimiento.registrado'
         AND e.event_id = (v_result->'metadata'->>'bank_event_id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_465_DETRACTION_DEPOSIT_NOT_ATOMIC:%', v_result;
  END IF;
  v_retry := public.depositar_detraccion_proveedor_tx(
    v_tenant, v_detraction, jsonb_build_object(
      'cuenta_bancaria_id', v_bank, 'fecha', current_date,
      'referencia', 'DEP-DET-465', 'tipo_cambio', 1
    ), v_actor, 'verify-465-deposit-detraction'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank) <> 930 THEN
    RAISE EXCEPTION 'VERIFY_465_DETRACTION_DEPOSIT_RETRY_NOT_EXACT';
  END IF;

  -- La factura inicial compone todas las contrapartidas en un solo evento.
  v_result := public.crear_factura_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'proveedor_id', v_provider, 'numero_documento', 'FP-465-COMPOSITE',
      'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30,
      'condiciones_pago', 'CREDITO', 'dias_credito', 30,
      'subtotal', 100, 'igv', 18, 'total', 118, 'saldo', 87,
      'retencion_total', 3, 'percepcion_total', 2,
      'detraccion_total', 10, 'anticipo_total', 20,
      'anticipo_id', v_supplier_advance, 'moneda', 'PEN',
      'tipo_documento', 'FACTURA', 'estado', 'PARCIAL',
      'estado_comparacion', 'OK', 'discrepancias', '[]'::jsonb,
      'created_by', v_actor,
      'fiscal_metadata', jsonb_build_object('serie', 'F001', 'tipo_cambio', 1)
    ), gen_random_uuid(), 'verify-465-supplier-invoice-composite'
  );
  v_invoice := (v_result->>'id')::uuid;
  SELECT count(*) INTO v_count FROM public.operaciones_fiscales_financieras
  WHERE tenant_id = v_tenant AND cxp_id = v_invoice;
  IF (v_result->>'saldo')::numeric <> 87 OR v_count <> 4
     OR (SELECT monto_disponible FROM public.anticipos_terceros WHERE id = v_supplier_advance) <> 40
     OR (SELECT count(*) FROM public.outbox_events
       WHERE tenant_id = v_tenant AND aggregate_id = v_invoice::text
         AND event_type = 'factura.proveedor.registrada') <> 1
     OR EXISTS (SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant AND aggregate_id = v_invoice::text
         AND event_type = 'cxp.ajuste.registrado') THEN
    RAISE EXCEPTION 'VERIFY_465_SUPPLIER_INVOICE_NOT_COMPOSITE:%/%', v_result, v_count;
  END IF;

  -- Si el outbox compensatorio falla tarde, no queda media reversa.
  v_result := public.registrar_ajuste_fiscal_financiero_tx(
    v_tenant, v_cxc, jsonb_build_object(
      'origen', 'CLIENTE', 'tipo', 'RETENCION', 'monto', 7,
      'moneda', 'PEN', 'fecha', current_date, 'referencia', 'RET-FAIL-REV-465'
    ), v_actor, 'verify-465-cxc-reversal-late-failure-source'
  );
  v_operation := (v_result->>'id')::uuid;
  v_source_payment := (v_result->'metadata'->>'cxc_pago_id')::uuid;
  SELECT saldo INTO v_before FROM public.cuentas_por_cobrar WHERE id = v_cxc;
  PERFORM set_config('app.verify_465_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.revertir_ajuste_fiscal_cxc_tx(
      v_tenant, v_operation, jsonb_build_object('motivo', 'Fallo tardio controlado'),
      v_actor, 'verify-465-cxc-reversal-late-failure'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VERIFY_465_LATE_OUTBOX_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_465_fail_outbox', 'off', true);
  IF NOT v_failed
     OR (SELECT saldo FROM public.cuentas_por_cobrar WHERE id = v_cxc) <> v_before
     OR (SELECT estado FROM public.operaciones_fiscales_financieras WHERE id = v_operation) <> 'APLICADO'
     OR NOT EXISTS (SELECT 1 FROM public.cxc_pagos
       WHERE id = v_source_payment AND coalesce(activo, true) AND estado = 'ACTIVO')
     OR EXISTS (SELECT 1 FROM public.reversas_ajustes_fiscales_cxc
       WHERE tenant_id = v_tenant AND operacion_id = v_operation) THEN
    RAISE EXCEPTION 'VERIFY_465_CXC_REVERSAL_LATE_FAILURE_NOT_ROLLED_BACK';
  END IF;
  PERFORM public.revertir_ajuste_fiscal_cxc_tx(
    v_tenant, v_operation, jsonb_build_object('motivo', 'Reintento luego de outbox disponible'),
    v_actor, 'verify-465-cxc-reversal-after-late-failure'
  );

  -- Un fallo tardio de outbox revierte CxP y evidencia fiscal.
  SELECT saldo INTO v_before FROM public.cuentas_por_pagar WHERE id = v_cxp;
  PERFORM set_config('app.verify_465_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.registrar_ajuste_fiscal_financiero_tx(
      v_tenant, v_cxp, jsonb_build_object(
        'origen', 'PROVEEDOR', 'tipo', 'RETENCION', 'monto', 5,
        'moneda', 'PEN', 'fecha', current_date, 'referencia', 'FAIL-465'
      ), v_actor, 'verify-465-late-outbox-failure'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VERIFY_465_LATE_OUTBOX_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_465_fail_outbox', 'off', true);
  IF NOT v_failed OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id = v_cxp) <> v_before
     OR EXISTS (SELECT 1 FROM public.operaciones_fiscales_financieras
       WHERE tenant_id = v_tenant AND idempotency_key = 'verify-465-late-outbox-failure') THEN
    RAISE EXCEPTION 'VERIFY_465_LATE_OUTBOX_FAILURE_NOT_ROLLED_BACK';
  END IF;

  IF position('PG_ADVISORY_XACT_LOCK' IN upper(pg_get_functiondef(
       'app.registrar_ajuste_fiscal_financiero_tx_465(uuid,uuid,jsonb,uuid,text)'::regprocedure))) = 0
     OR position('REQUEST_FINGERPRINT' IN upper(pg_get_functiondef(
       'app.registrar_ajuste_fiscal_financiero_tx_465(uuid,uuid,jsonb,uuid,text)'::regprocedure))) = 0
     OR position('FOR UPDATE' IN upper(pg_get_functiondef(
       'app.depositar_detraccion_proveedor_tx_465(uuid,uuid,jsonb,uuid,text)'::regprocedure))) = 0
     OR position('PG_ADVISORY_XACT_LOCK' IN upper(pg_get_functiondef(
       'app.revertir_ajuste_fiscal_cxc_tx_465(uuid,uuid,jsonb,uuid,text)'::regprocedure))) = 0
     OR position('FOR UPDATE' IN upper(pg_get_functiondef(
       'app.revertir_ajuste_fiscal_cxc_tx_465(uuid,uuid,jsonb,uuid,text)'::regprocedure))) = 0 THEN
    RAISE EXCEPTION 'VERIFY_465_LOCK_OR_FINGERPRINT_EVIDENCE_MISSING';
  END IF;
  IF has_function_privilege('anon',
       'public.registrar_ajuste_fiscal_financiero_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.registrar_anticipo_tercero_tx(uuid,jsonb,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.depositar_detraccion_proveedor_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.revertir_ajuste_fiscal_cxc_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.revertir_ajuste_fiscal_cxc_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.registrar_ajuste_fiscal_financiero_tx_465(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.revertir_ajuste_fiscal_cxc_tx_465(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.anticipos_terceros', 'INSERT')
     OR has_table_privilege('authenticated', 'public.operaciones_fiscales_financieras', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.reversas_ajustes_fiscales_cxc', 'INSERT') THEN
    RAISE EXCEPTION 'VERIFY_465_ACL_INCORRECT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.libro_retenciones'::regclass
      AND conname = 'ck_libro_retenciones_no_quinta_proveedor_465'
      AND NOT convalidated
      AND upper(pg_get_constraintdef(oid)) LIKE '%QUINTA%') THEN
    RAISE EXCEPTION 'VERIFY_465_QUINTA_SUPPLIER_GUARD_MISSING';
  END IF;
END;
$verify$;

ROLLBACK;
