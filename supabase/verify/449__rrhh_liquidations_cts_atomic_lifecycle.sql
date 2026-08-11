\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 449 solo puede ejecutarse en la base efimera erp_e2e';
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
  v_function text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'liquidaciones', 'pagos_liquidaciones', 'depositos_cts',
    'empleados', 'contratos', 'cuentas_bancarias',
    'movimientos_bancarios', 'outbox_events'
  ] LOOP
    IF has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'TRUNCATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'REFERENCES')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'TRIGGER')
       OR has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'DELETE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'TRUNCATE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'REFERENCES')
       OR has_table_privilege('anon', format('public.%I', v_table), 'TRIGGER') THEN
      RAISE EXCEPTION 'anon/authenticated conserva DML directo en %', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = format('public.%I', v_table)::regclass
        AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION '% no tiene RLS/FORCE RLS', v_table;
    END IF;
    IF v_table IN ('liquidaciones', 'pagos_liquidaciones', 'depositos_cts')
       AND (
         NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
         OR has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
         OR has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
         OR has_table_privilege('service_role', format('public.%I', v_table), 'DELETE')
         OR has_table_privilege('service_role', format('public.%I', v_table), 'TRUNCATE')
       ) THEN
      RAISE EXCEPTION 'service_role conserva DML directo o perdió lectura en %', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.guardar_liquidacion_calculada_tx(uuid,jsonb,uuid)',
    'public.confirmar_liquidacion_tx(uuid,uuid,uuid)',
    'public.pagar_liquidacion_tx(uuid,uuid,jsonb,uuid)',
    'public.revertir_pago_liquidacion_tx(uuid,uuid,text,uuid)',
    'public.guardar_depositos_cts_calculados_tx(uuid,text,jsonb,uuid)',
    'public.depositar_cts_tx(uuid,uuid,jsonb,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL incorrecta para %', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege('service_role', 'app.assert_rrhh_actor_449(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.pagar_liquidacion_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.depositar_cts_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role conserva acceso a implementaciones internas 449';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pagos_liquidaciones'::regclass
      AND tgname = 'trg_pagos_liquidaciones_tenant_449'
      AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.depositos_cts'::regclass
      AND tgname = 'trg_depositos_cts_tenant_449'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Faltan triggers de consistencia tenant para pagos/CTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.liquidaciones
    WHERE lower(estado::text) <> 'pagada'
      AND fecha_pago IS NULL AND pagado_por IS NULL
      AND metodo_pago IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Persisten liquidaciones sin pago con medio inventado';
  END IF;
END;
$$;

DO $$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant_id uuid;
  v_other_tenant_id uuid;
  v_user_id uuid;
  v_other_user_id uuid;
  v_empleado_id uuid := gen_random_uuid();
  v_empleado_cts_id uuid := gen_random_uuid();
  v_contrato_id uuid := gen_random_uuid();
  v_contrato_cts_id uuid := gen_random_uuid();
  v_banco_id uuid := gen_random_uuid();
  v_other_banco_id uuid := gen_random_uuid();
  v_liquidacion_id uuid;
  v_liquidacion_rollback_id uuid;
  v_deposito_pendiente_id uuid;
  v_deposito_cts_id uuid;
  v_pago_id uuid;
  v_pago_event_id uuid;
  v_reversion_event_id uuid;
  v_movimiento_pago_id uuid;
  v_result jsonb;
  v_saldo numeric(14,2);
  v_count integer;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY RRHH 449', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY RRHH 449 OTRO', 1, 'PE') INTO v_other_demo;
  v_other_tenant_id := (v_other_demo->>'tenant_id')::uuid;
  v_other_user_id := (v_other_demo->>'user_id')::uuid;

  INSERT INTO public.empleados (
    id, tenant_id, nombre, nombres, apellidos, codigo, tipo_documento,
    numero_documento, estado, activo, fecha_ingreso, pais
  ) VALUES
    (v_empleado_id, v_tenant_id, 'Empleado Liquidacion 449', 'Empleado', 'Liquidacion 449',
     'EMP-LIQ-449', 'DNI', '44900001', 'activo', true, '2024-01-01', 'PE'),
    (v_empleado_cts_id, v_tenant_id, 'Empleado CTS 449', 'Empleado', 'CTS 449',
     'EMP-CTS-449', 'DNI', '44900002', 'activo', true, '2024-05-01', 'PE');

  INSERT INTO public.contratos (
    id, tenant_id, id_empleado, empleado_id, tipo_contrato,
    fecha_inicio, estado, activo, sueldo_bruto, salario, moneda,
    regimen_pensionario, jornada_laboral
  ) VALUES
    (v_contrato_id, v_tenant_id, v_empleado_id, v_empleado_id, 'indefinido',
     '2024-01-01', 'en_periodo_prueba', true, 3000, 3000, 'PEN', 'ONP', 'tiempo_completo'),
    (v_contrato_cts_id, v_tenant_id, v_empleado_cts_id, v_empleado_cts_id, 'indefinido',
     '2024-05-01', 'vigente', true, 2500, 2500, 'PEN', 'ONP', 'tiempo_completo');

  INSERT INTO public.cuentas_bancarias (
    id, tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, estado, activa, activo, saldo, saldo_actual, saldo_contable,
    permite_sobregiro, created_by, updated_by
  ) VALUES (
    v_banco_id, v_tenant_id, 'Banco Verify 449', 'BANCO-449', 'Banco Verify',
    '449-000001', 'CORRIENTE', 'PEN', 'ACTIVO', true, true,
    10000, 10000, 10000, false, v_user_id, v_user_id
  );
  INSERT INTO public.cuentas_bancarias (
    id, tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, estado, activa, activo, saldo, saldo_actual, saldo_contable,
    permite_sobregiro, created_by, updated_by
  ) VALUES (
    v_other_banco_id, v_other_tenant_id, 'Banco Otro Verify 449',
    'BANCO-449-OTRO', 'Banco Verify', '449-999999', 'CORRIENTE',
    'PEN', 'ACTIVO', true, true, 5000, 5000, 5000, false,
    v_other_user_id, v_other_user_id
  );

  UPDATE public.usuarios_sistema
  SET activo = false, estado = 'INACTIVO'
  WHERE id = v_user_id;
  BEGIN
    PERFORM public.guardar_depositos_cts_calculados_tx(
      v_tenant_id,
      '2026-05',
      jsonb_build_array(jsonb_build_object(
        'empleado_id', v_empleado_id,
        'semestre_inicio', '2025-11-01', 'semestre_fin', '2026-04-30',
        'remuneracion_computable', 3500, 'meses_computables', 6,
        'dias_computables', 0, 'monto', 500, 'moneda', 'PEN'
      )),
      v_user_id
    );
    RAISE EXCEPTION 'Un actor inactivo no debio operar RRHH';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Un actor inactivo no debio operar RRHH' THEN RAISE; END IF;
  END;
  UPDATE public.usuarios_sistema
  SET activo = true, estado = 'ACTIVO'
  WHERE id = v_user_id;

  -- Un deposito calculado pendiente se incluye en la liquidacion y debe quedar
  -- consumido al confirmar, evitando el doble pago posterior.
  SELECT public.guardar_depositos_cts_calculados_tx(
    v_tenant_id,
    '2026-05',
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_empleado_id,
      'semestre_inicio', '2025-11-01', 'semestre_fin', '2026-04-30',
      'remuneracion_computable', 3500, 'meses_computables', 6,
      'dias_computables', 0, 'monto', 500, 'moneda', 'PEN',
      'metadata', '{}'::jsonb
    )),
    v_user_id
  ) INTO v_result;
  v_deposito_pendiente_id := (v_result->'depositosIds'->>0)::uuid;

  BEGIN
    UPDATE public.depositos_cts
    SET cuenta_bancaria_id = v_other_banco_id
    WHERE id = v_deposito_pendiente_id;
    RAISE EXCEPTION 'CTS acepto una cuenta bancaria de otro tenant';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'CTS acepto una cuenta bancaria de otro tenant' THEN RAISE; END IF;
  END;

  SELECT public.guardar_liquidacion_calculada_tx(
    v_tenant_id,
    jsonb_build_object(
      'id_empleado', v_empleado_id, 'motivo_terminacion', 'renuncia',
      'fecha_terminacion', '2026-08-09', 'monto_cts', 500,
      'vacaciones_pendientes', 10, 'indemnizacion', 0, 'dias_cts', 180,
      'total_liquidacion', 1500, 'pais_codigo', 'PE', 'moneda', 'PEN',
      'metadata', jsonb_build_object('monto_cts_semestres_pendientes', 500)
    ),
    v_user_id
  ) INTO v_result;
  v_liquidacion_id := (v_result->'data'->>'id')::uuid;

  IF (SELECT metodo_pago FROM public.liquidaciones WHERE id = v_liquidacion_id) IS NOT NULL
     OR lower((SELECT estado::text FROM public.empleados WHERE id = v_empleado_id)) <> 'activo'
     OR lower((SELECT estado::text FROM public.contratos WHERE id = v_contrato_id)) <> 'en_periodo_prueba' THEN
    RAISE EXCEPTION 'Calcular/inicializar una liquidacion altero cese o invento medio de pago';
  END IF;

  SELECT public.guardar_liquidacion_calculada_tx(
    v_tenant_id,
    jsonb_build_object(
      'id_empleado', v_empleado_id, 'motivo_terminacion', 'renuncia',
      'fecha_terminacion', '2026-08-09', 'monto_cts', 500,
      'vacaciones_pendientes', 10, 'indemnizacion', 0, 'dias_cts', 180,
      'total_liquidacion', 1500, 'pais_codigo', 'PE', 'moneda', 'PEN',
      'metadata', jsonb_build_object('monto_cts_semestres_pendientes', 500)
    ),
    v_user_id
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->'data'->>'id')::uuid IS DISTINCT FROM v_liquidacion_id
     OR (SELECT count(*) FROM public.liquidaciones
         WHERE tenant_id = v_tenant_id AND id_empleado = v_empleado_id) <> 1 THEN
    RAISE EXCEPTION 'El retry de calculo duplico la liquidacion: %', v_result;
  END IF;

  BEGIN
    PERFORM public.guardar_liquidacion_calculada_tx(
      v_tenant_id,
      jsonb_build_object(
        'id_empleado', v_empleado_id, 'motivo_terminacion', 'renuncia',
        'fecha_terminacion', '2026-08-09', 'monto_cts', 500,
        'vacaciones_pendientes', 10, 'indemnizacion', 0, 'dias_cts', 180,
        'total_liquidacion', 1501, 'pais_codigo', 'PE', 'moneda', 'PEN',
        'metadata', jsonb_build_object('monto_cts_semestres_pendientes', 500)
      ),
      v_user_id
    );
    RAISE EXCEPTION 'El retry de calculo con payload distinto debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El retry de calculo con payload distinto debio fallar' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.confirmar_liquidacion_tx(v_tenant_id, v_liquidacion_id, NULL);
    RAISE EXCEPTION 'La confirmacion sin actor debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La confirmacion sin actor debio fallar' THEN RAISE; END IF;
  END;

  SELECT public.confirmar_liquidacion_tx(
    v_tenant_id, v_liquidacion_id, v_user_id
  ) INTO v_result;
  IF lower((SELECT estado::text FROM public.liquidaciones WHERE id = v_liquidacion_id)) <> 'aprobada'
     OR (SELECT aprobado_por FROM public.liquidaciones WHERE id = v_liquidacion_id) IS DISTINCT FROM v_user_id
     OR lower((SELECT estado::text FROM public.empleados WHERE id = v_empleado_id)) <> 'inactivo'
     OR lower((SELECT estado::text FROM public.contratos WHERE id = v_contrato_id)) <> 'terminado'
     OR (SELECT fecha_fin FROM public.contratos WHERE id = v_contrato_id) <> DATE '2026-08-09'
     OR upper((SELECT estado FROM public.depositos_cts WHERE id = v_deposito_pendiente_id)) <> 'ANULADO'
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'liquidacion.aprobada'
           AND aggregate_id = v_liquidacion_id::text) <> 1
     OR NOT COALESCE((SELECT (payload->>'accountingHandledByOutbox')::boolean
                      FROM public.outbox_events
                      WHERE tenant_id = v_tenant_id AND event_type = 'liquidacion.aprobada'
                        AND aggregate_id = v_liquidacion_id::text), false) THEN
    RAISE EXCEPTION 'La confirmacion no cerro cese/CTS/outbox atomicamente: %', v_result;
  END IF;

  SELECT public.confirmar_liquidacion_tx(
    v_tenant_id, v_liquidacion_id, v_user_id
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'liquidacion.aprobada'
           AND aggregate_id = v_liquidacion_id::text) <> 1 THEN
    RAISE EXCEPTION 'El retry de confirmacion duplico efectos: %', v_result;
  END IF;

  BEGIN
    UPDATE public.liquidaciones SET estado = 'pagada' WHERE id = v_liquidacion_id;
    RAISE EXCEPTION 'El update directo de estado debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El update directo de estado debio fallar' THEN RAISE; END IF;
  END;

  SELECT public.pagar_liquidacion_tx(
    v_tenant_id, v_liquidacion_id,
    jsonb_build_object(
      'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco_id,
      'referencia', 'OP-VERIFY-449', 'fecha_pago', '2026-08-10T12:00:00Z'
    ),
    v_user_id
  ) INTO v_result;
  v_pago_id := (v_result->>'pagoId')::uuid;
  v_pago_event_id := (v_result->>'eventId')::uuid;
  v_movimiento_pago_id := (v_result->>'movimientoBancarioId')::uuid;
  SELECT saldo INTO v_saldo FROM public.cuentas_bancarias WHERE id = v_banco_id;

  IF lower((SELECT estado::text FROM public.liquidaciones WHERE id = v_liquidacion_id)) <> 'pagada'
     OR v_saldo <> 8500
     OR (SELECT count(*) FROM public.pagos_liquidaciones
         WHERE tenant_id = v_tenant_id AND liquidacion_id = v_liquidacion_id
           AND estado = 'APLICADO') <> 1
     OR (SELECT tipo FROM public.movimientos_bancarios WHERE id = v_movimiento_pago_id) <> 'CARGO'
     OR (SELECT count(*) FROM public.outbox_events
         WHERE event_id = v_pago_event_id AND event_type = 'liquidacion.pagada') <> 1
     OR NOT COALESCE((SELECT (payload->>'accountingHandledByOutbox')::boolean
                      FROM public.outbox_events WHERE event_id = v_pago_event_id), false) THEN
    RAISE EXCEPTION 'El pago no sincronizo liquidacion/evidencia/tesoreria/outbox: %', v_result;
  END IF;

  BEGIN
    UPDATE public.pagos_liquidaciones
    SET cuenta_bancaria_id = v_other_banco_id
    WHERE id = v_pago_id;
    RAISE EXCEPTION 'El pago acepto una cuenta bancaria de otro tenant';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El pago acepto una cuenta bancaria de otro tenant' THEN RAISE; END IF;
  END;

  SELECT public.pagar_liquidacion_tx(
    v_tenant_id, v_liquidacion_id,
    jsonb_build_object(
      'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco_id,
      'referencia', 'OP-VERIFY-449', 'fecha_pago', '2026-08-10T12:00:00Z'
    ),
    v_user_id
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'pagoId')::uuid IS DISTINCT FROM v_pago_id
     OR (SELECT count(*) FROM public.movimientos_bancarios
         WHERE tenant_id = v_tenant_id
           AND metadata->>'liquidacion_id' = v_liquidacion_id::text) <> 1 THEN
    RAISE EXCEPTION 'El retry de pago duplico evidencia o tesoreria: %', v_result;
  END IF;

  BEGIN
    PERFORM public.pagar_liquidacion_tx(
      v_tenant_id, v_liquidacion_id,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco_id,
        'referencia', 'OTRA-OPERACION', 'fecha_pago', '2026-08-10T12:00:00Z'
      ),
      v_user_id
    );
    RAISE EXCEPTION 'El retry de pago con payload distinto debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El retry de pago con payload distinto debio fallar' THEN RAISE; END IF;
  END;

  SELECT public.revertir_pago_liquidacion_tx(
    v_tenant_id, v_liquidacion_id, 'Transferencia rechazada', v_user_id
  ) INTO v_result;
  v_reversion_event_id := (v_result->>'eventId')::uuid;
  SELECT saldo INTO v_saldo FROM public.cuentas_bancarias WHERE id = v_banco_id;
  IF lower((SELECT estado::text FROM public.liquidaciones WHERE id = v_liquidacion_id)) <> 'aprobada'
     OR (SELECT metodo_pago FROM public.liquidaciones WHERE id = v_liquidacion_id) IS NOT NULL
     OR v_saldo <> 10000
     OR (SELECT estado FROM public.pagos_liquidaciones WHERE id = v_pago_id) <> 'REVERTIDO'
     OR (SELECT movimiento_relacionado_id FROM public.movimientos_bancarios
         WHERE id = (v_result->>'movimientoBancarioId')::uuid) IS DISTINCT FROM v_movimiento_pago_id
     OR (SELECT count(*) FROM public.outbox_events
         WHERE event_id = v_reversion_event_id AND event_type = 'liquidacion.pago.revertido') <> 1 THEN
    RAISE EXCEPTION 'La reversa no restauro obligacion/tesoreria/outbox: %', v_result;
  END IF;

  SELECT public.revertir_pago_liquidacion_tx(
    v_tenant_id, v_liquidacion_id, 'Transferencia rechazada', v_user_id
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'eventId')::uuid IS DISTINCT FROM v_reversion_event_id
     OR (SELECT count(*) FROM public.outbox_events
         WHERE event_id = v_reversion_event_id) <> 1 THEN
    RAISE EXCEPTION 'El retry de reversa duplico efectos: %', v_result;
  END IF;

  BEGIN
    PERFORM public.revertir_pago_liquidacion_tx(
      v_tenant_id, v_liquidacion_id, 'Motivo diferente', v_user_id
    );
    RAISE EXCEPTION 'El retry de reversa con motivo distinto debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El retry de reversa con motivo distinto debio fallar' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.pagar_liquidacion_tx(
      v_tenant_id, v_liquidacion_id,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco_id,
        'referencia', 'OP-VERIFY-449', 'fecha_pago', '2026-08-10T12:00:00Z'
      ),
      v_user_id
    );
    RAISE EXCEPTION 'Un retry tardio no debio reabrir un pago ya revertido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Un retry tardio no debio reabrir un pago ya revertido' THEN RAISE; END IF;
  END;
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_id) <> 10000
     OR (SELECT count(*) FROM public.pagos_liquidaciones
         WHERE tenant_id = v_tenant_id AND liquidacion_id = v_liquidacion_id) <> 1 THEN
    RAISE EXCEPTION 'El retry tardio altero tesoreria o evidencia revertida';
  END IF;

  -- La misma liquidacion puede volver a pagarse tras una reversa. En efectivo
  -- crea otra evidencia sin inventar un movimiento bancario.
  SELECT public.pagar_liquidacion_tx(
    v_tenant_id, v_liquidacion_id,
    jsonb_build_object(
      'metodo_pago', 'efectivo', 'fecha_pago', '2026-08-12T12:00:00Z'
    ),
    v_user_id
  ) INTO v_result;
  IF (v_result->>'movimientoBancarioId') IS NOT NULL
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_id) <> 10000
     OR (SELECT count(*) FROM public.pagos_liquidaciones
         WHERE tenant_id = v_tenant_id AND liquidacion_id = v_liquidacion_id) <> 2 THEN
    RAISE EXCEPTION 'El repago en efectivo afecto tesoreria o no conservo historial: %', v_result;
  END IF;
  PERFORM public.revertir_pago_liquidacion_tx(
    v_tenant_id, v_liquidacion_id, 'Pago en efectivo anulado', v_user_id
  );
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_id) <> 10000
     OR lower((SELECT estado::text FROM public.liquidaciones WHERE id = v_liquidacion_id)) <> 'aprobada'
     OR (SELECT count(*) FROM public.pagos_liquidaciones
         WHERE tenant_id = v_tenant_id AND liquidacion_id = v_liquidacion_id
           AND estado = 'REVERTIDO') <> 2 THEN
    RAISE EXCEPTION 'La reversa del pago efectivo no conservo historial o altero banco';
  END IF;

  -- CTS independiente: calculo atomico, deposito bancario, outbox e
  -- imposibilidad de recalcular lo ya depositado.
  SELECT public.guardar_depositos_cts_calculados_tx(
    v_tenant_id,
    '2026-11',
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_empleado_cts_id,
      'semestre_inicio', '2026-05-01', 'semestre_fin', '2026-10-31',
      'remuneracion_computable', 3000, 'meses_computables', 6,
      'dias_computables', 0, 'monto', 400, 'moneda', 'PEN',
      'metadata', '{}'::jsonb
    )),
    v_user_id
  ) INTO v_result;
  v_deposito_cts_id := (v_result->'depositosIds'->>0)::uuid;

  SELECT public.depositar_cts_tx(
    v_tenant_id, v_deposito_cts_id,
    jsonb_build_object(
      'cuenta_bancaria_id', v_banco_id, 'referencia', 'CTS-VERIFY-449',
      'fecha_deposito', '2026-11-15'
    ),
    v_user_id
  ) INTO v_result;
  SELECT saldo INTO v_saldo FROM public.cuentas_bancarias WHERE id = v_banco_id;
  IF upper((SELECT estado FROM public.depositos_cts WHERE id = v_deposito_cts_id)) <> 'DEPOSITADO'
     OR v_saldo <> 9600
     OR (SELECT count(*) FROM public.movimientos_bancarios
         WHERE id = (v_result->>'movimientoBancarioId')::uuid AND tipo = 'CARGO') <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE event_id = (v_result->>'eventId')::uuid AND event_type = 'cts.depositado') <> 1 THEN
    RAISE EXCEPTION 'El deposito CTS no sincronizo libro/tesoreria/outbox: %', v_result;
  END IF;

  SELECT public.depositar_cts_tx(
    v_tenant_id, v_deposito_cts_id,
    jsonb_build_object(
      'cuenta_bancaria_id', v_banco_id, 'referencia', 'CTS-VERIFY-449',
      'fecha_deposito', '2026-11-15'
    ),
    v_user_id
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean OR
     (SELECT count(*) FROM public.outbox_events
      WHERE tenant_id = v_tenant_id AND event_type = 'cts.depositado'
        AND aggregate_id = v_deposito_cts_id::text) <> 1 THEN
    RAISE EXCEPTION 'El retry del deposito CTS duplico efectos: %', v_result;
  END IF;

  BEGIN
    PERFORM public.guardar_depositos_cts_calculados_tx(
      v_tenant_id,
      '2026-11',
      jsonb_build_array(jsonb_build_object(
        'empleado_id', v_empleado_cts_id,
        'semestre_inicio', '2026-05-01', 'semestre_fin', '2026-10-31',
        'remuneracion_computable', 3000, 'meses_computables', 6,
        'dias_computables', 0, 'monto', 450, 'moneda', 'PEN'
      )),
      v_user_id
    );
    RAISE EXCEPTION 'Recalcular CTS depositada debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Recalcular CTS depositada debio fallar' THEN RAISE; END IF;
  END;

  -- Si tesoreria rechaza el segundo pago, no queda evidencia, outbox ni cambio
  -- de estado parcial.
  SELECT public.guardar_liquidacion_calculada_tx(
    v_tenant_id,
    jsonb_build_object(
      'id_empleado', v_empleado_cts_id, 'motivo_terminacion', 'renuncia',
      'fecha_terminacion', '2026-12-01', 'monto_cts', 0,
      'vacaciones_pendientes', 0, 'indemnizacion', 0, 'dias_cts', 0,
      'total_liquidacion', 20000, 'pais_codigo', 'PE', 'moneda', 'PEN',
      'metadata', jsonb_build_object('monto_cts_semestres_pendientes', 0)
    ),
    v_user_id
  ) INTO v_result;
  v_liquidacion_rollback_id := (v_result->'data'->>'id')::uuid;
  PERFORM public.confirmar_liquidacion_tx(
    v_tenant_id, v_liquidacion_rollback_id, v_user_id
  );
  BEGIN
    PERFORM public.pagar_liquidacion_tx(
      v_tenant_id, v_liquidacion_rollback_id,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco_id,
        'referencia', 'SIN-FONDOS', 'fecha_pago', '2026-12-02T12:00:00Z'
      ),
      v_user_id
    );
    RAISE EXCEPTION 'El pago sin saldo debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El pago sin saldo debio fallar' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_count FROM public.pagos_liquidaciones
  WHERE tenant_id = v_tenant_id AND liquidacion_id = v_liquidacion_rollback_id;
  IF v_count <> 0
     OR lower((SELECT estado::text FROM public.liquidaciones
               WHERE id = v_liquidacion_rollback_id)) <> 'aprobada'
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'liquidacion.pagada'
           AND payload->>'liquidacionId' = v_liquidacion_rollback_id::text) <> 0
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_id) <> 9600 THEN
    RAISE EXCEPTION 'El rollback de pago insuficiente dejo estado parcial';
  END IF;
END;
$$;

ROLLBACK;
