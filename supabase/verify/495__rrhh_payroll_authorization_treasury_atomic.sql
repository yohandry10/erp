\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 495 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
  v_function text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'rrhh_planilla_operaciones_495', 'planillas', 'empleado_planilla',
    'empleado_planilla_conceptos', 'pagos_empleados', 'rrhh_pagos',
    'historial_pagos_planilla'
  ] LOOP
    IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'ACL RRHH 495 incorrecta en %', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.crear_planilla_tx_495(uuid,jsonb,uuid,text)',
    'public.actualizar_planilla_borrador_tx_495(uuid,uuid,jsonb,uuid,text)',
    'public.eliminar_planilla_borrador_tx_495(uuid,uuid,uuid,text)',
    'public.guardar_calculo_planilla_tx(uuid,uuid,jsonb,uuid)',
    'public.aprobar_planilla_tx(uuid,uuid,text)',
    'public.pagar_planilla_con_tesoreria_tx_495(uuid,uuid,jsonb,uuid)',
    'public.guardar_liquidacion_calculada_tx(uuid,jsonb,uuid)',
    'public.confirmar_liquidacion_tx(uuid,uuid,uuid)',
    'public.pagar_liquidacion_tx(uuid,uuid,jsonb,uuid)',
    'public.revertir_pago_liquidacion_tx(uuid,uuid,text,uuid)',
    'public.guardar_depositos_cts_calculados_tx(uuid,text,jsonb,uuid)',
    'public.depositar_cts_tx(uuid,uuid,jsonb,uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR has_function_privilege('anon', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL incorrecta para %', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'service_role', 'public.guardar_calculo_planilla_tx(uuid,uuid,jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.pagar_planilla_completa_tx(uuid,uuid,text,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.pagar_planilla_completa_tx(uuid,uuid,text,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.guardar_liquidacion_calculada_tx(uuid,jsonb,uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.confirmar_liquidacion_tx(uuid,uuid,uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.pagar_liquidacion_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.revertir_pago_liquidacion_tx(uuid,uuid,text,uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.guardar_depositos_cts_calculados_tx(uuid,text,jsonb,uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.depositar_cts_tx(uuid,uuid,jsonb,uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role conserva un bypass legado de planilla';
  END IF;
END;
$$;

DO $$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_other_tenant uuid;
  v_calculador uuid;
  v_aprobador uuid := gen_random_uuid();
  v_otro_aprobador uuid := gen_random_uuid();
  v_pagador uuid := gen_random_uuid();
  v_other_actor uuid;
  v_admin_role uuid;
  v_custom_role uuid;
  v_empleado uuid;
  v_planilla uuid;
  v_planilla_cash uuid;
  v_planilla_rollback uuid;
  v_liq_empleado uuid := gen_random_uuid();
  v_liq_contrato uuid := gen_random_uuid();
  v_liquidacion uuid;
  v_liquidacion_cash_legacy uuid := gen_random_uuid();
  v_pago_cash_legacy uuid := gen_random_uuid();
  v_pago_cash_legacy_event uuid := gen_random_uuid();
  v_liq_payment_movement uuid;
  v_liq_reversal_movement uuid;
  v_liq_reversion_event uuid;
  v_cts_empleado uuid := gen_random_uuid();
  v_cts_contrato uuid := gen_random_uuid();
  v_cts_deposito uuid;
  v_banco uuid := gen_random_uuid();
  v_banco_sin_cuenta uuid := gen_random_uuid();
  v_cuenta_banco uuid := gen_random_uuid();
  v_cuenta_caja uuid := gen_random_uuid();
  v_almacen uuid;
  v_caja uuid := gen_random_uuid();
  v_sesion uuid := gen_random_uuid();
  v_result jsonb;
  v_bank_before numeric(14,2);
  v_bank_after numeric(14,2);
  v_unmapped_bank_before numeric(14,2);
  v_count integer;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY RRHH 495', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_calculador := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY RRHH 495 OTRO', 1, 'PE') INTO v_other_demo;
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  v_other_actor := (v_other_demo->>'user_id')::uuid;

  SELECT id INTO v_admin_role FROM public.roles
  WHERE tenant_id = v_tenant AND upper(nombre) = 'ADMIN_DEMO';
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, nombre, apellido, nombres, apellidos,
    activo, estado, is_super_admin
  ) VALUES
    (v_aprobador, v_tenant, format('aprobador-495-%s@example.test', v_tenant),
      'Aprobador', '495', 'Aprobador', '495', true, 'ACTIVO', false),
    (v_pagador, v_tenant, format('pagador-495-%s@example.test', v_tenant),
      'Pagador', '495', 'Pagador', '495', true, 'ACTIVO', false),
    (v_otro_aprobador, v_tenant, format('otro-aprobador-495-%s@example.test', v_tenant),
      'Otro aprobador', '495', 'Otro aprobador', '495', true, 'ACTIVO', false);
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  VALUES
    (v_aprobador, v_admin_role, v_tenant),
    (v_pagador, v_admin_role, v_tenant),
    (v_otro_aprobador, v_admin_role, v_tenant);

  SELECT (public.crear_rol_rbac_tx(
    v_tenant,
    v_calculador,
    'verify-495-custom-tesoreria',
    jsonb_build_object(
      'nombre', 'TESORERIA',
      'descripcion', 'Rol custom sin permisos implícitos'
    ),
    '{}'::uuid[]
  )->>'id')::uuid INTO v_custom_role;
  IF EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE rp.role_id = v_custom_role
      AND COALESCE(rp.concedido, true)
      AND lower(COALESCE(p.codigo, '')) IN (
        'rrhh.planillas.pay', 'rrhh.liquidaciones.pay',
        'rrhh.liquidaciones.reverse', 'rrhh.cts.deposit'
      )
  ) THEN
    RAISE EXCEPTION 'Un rol custom TESORERIA recibió permisos financieros implícitos';
  END IF;

  SELECT id INTO v_empleado FROM public.empleados
  WHERE tenant_id = v_tenant AND lower(estado::text) = 'activo'
  ORDER BY created_at, id LIMIT 1;
  IF v_empleado IS NULL THEN
    INSERT INTO public.empleados (
      tenant_id, nombre, nombres, apellidos, codigo, tipo_documento,
      numero_documento, estado, activo, fecha_ingreso, pais
    ) VALUES (
      v_tenant, 'Empleado Verify 495', 'Empleado', 'Verify 495',
      'EMP-VERIFY-495', 'DNI', '49549549', 'activo', true,
      current_date - 365, 'PE'
    ) RETURNING id INTO v_empleado;
  END IF;

  SELECT public.crear_planilla_tx_495(
    v_tenant,
    jsonb_build_object('periodo', '2095-01', 'pais_codigo', 'PE', 'moneda', 'PEN'),
    v_calculador,
    '495-create-primary'
  ) INTO v_result;
  v_planilla := (v_result->>'id')::uuid;
  IF (v_result->>'estado') <> 'borrador' THEN
    RAISE EXCEPTION 'El alta no creó un borrador: %', v_result;
  END IF;
  SELECT public.crear_planilla_tx_495(
    v_tenant,
    jsonb_build_object('periodo', '2095-01', 'pais_codigo', 'PE', 'moneda', 'PEN'),
    v_calculador,
    '495-create-primary'
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean OR (v_result->>'id')::uuid <> v_planilla THEN
    RAISE EXCEPTION 'El retry de alta no fue idempotente: %', v_result;
  END IF;

  BEGIN
    PERFORM public.crear_planilla_tx_495(
      v_tenant,
      jsonb_build_object('periodo', '2095-02', 'pais_codigo', 'PE', 'moneda', 'PEN'),
      v_aprobador,
      '495-create-primary'
    );
    RAISE EXCEPTION 'La toma de clave por otro actor debió fallar';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT public.guardar_calculo_planilla_tx(
    v_tenant,
    v_planilla,
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_empleado, 'dias_trabajados', 30,
      'horas_extras_25', 0, 'horas_extras_35', 0,
      'tardanzas_minutos', 0, 'faltas', 0,
      'total_ingresos', 1000, 'total_descuentos', 100,
      'total_aportes', 90, 'neto_pagar', 900, 'conceptos', '[]'::jsonb
    )),
    v_calculador
  ) INTO v_result;
  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla)) <> 'calculada'
     OR app.to_uuid_or_null((SELECT metadata->>'calculada_por' FROM public.planillas WHERE id = v_planilla)) <> v_calculador THEN
    RAISE EXCEPTION 'El cálculo no dejó actor durable: %', v_result;
  END IF;

  BEGIN
    PERFORM public.aprobar_planilla_tx(v_tenant, v_planilla, v_calculador::text);
    RAISE EXCEPTION 'La autoaprobación de planilla debió fallar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT public.aprobar_planilla_tx(v_tenant, v_planilla, v_aprobador::text) INTO v_result;
  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla)) <> 'aprobada'
     OR app.to_uuid_or_null((SELECT metadata->>'aprobada_por' FROM public.planillas WHERE id = v_planilla)) <> v_aprobador THEN
    RAISE EXCEPTION 'La aprobación segregada no quedó durable: %', v_result;
  END IF;
  BEGIN
    PERFORM public.aprobar_planilla_tx(v_tenant, v_planilla, v_otro_aprobador::text);
    RAISE EXCEPTION 'Un retry de aprobación por otro actor debió fallar';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF app.to_uuid_or_null((SELECT metadata->>'aprobada_por' FROM public.planillas
      WHERE id = v_planilla)) IS DISTINCT FROM v_aprobador THEN
    RAISE EXCEPTION 'El retry cambió el aprobador durable de la planilla';
  END IF;

  -- Una fecha residual en una planilla aún no pagada no puede gobernar el
  -- pago real: el writer 495 debe alinear nómina, tesorería y outbox al día de
  -- la intención nueva.
  PERFORM set_config('app.planilla_transition', format('pagar:%s', v_planilla), true);
  UPDATE public.planillas
  SET fecha_pago = TIMESTAMPTZ '2094-12-31 12:00:00+00'
  WHERE id = v_planilla AND tenant_id = v_tenant;
  PERFORM set_config('app.planilla_transition', '', true);

  INSERT INTO public.plan_cuentas(
    id, tenant_id, codigo, nombre, estado, activo, acepta_movimiento,
    tipo, tipo_cuenta, nivel
  ) VALUES
  (
    v_cuenta_banco, v_tenant, '104951', 'Banco laboral Verify 495',
    'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 6
  ),
  (
    v_cuenta_caja, v_tenant, '10111', 'Caja laboral Verify 495',
    'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 5
  );
  INSERT INTO public.cuentas_bancarias (
    id, tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, estado, activa, activo, saldo, saldo_actual, saldo_contable,
    permite_sobregiro, cuenta_contable_id, created_by, updated_by
  ) VALUES (
    v_banco, v_tenant, 'Banco Verify 495', 'BANK-495', 'VERIFY',
    '495-0001', 'CORRIENTE', 'PEN', 'ACTIVO', true, true,
    5000, 5000, 5000, false, v_cuenta_banco, v_pagador, v_pagador
  );
  INSERT INTO public.cuentas_bancarias (
    id, tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, estado, activa, activo, saldo, saldo_actual, saldo_contable,
    permite_sobregiro, cuenta_contable_id, created_by, updated_by
  ) VALUES (
    v_banco_sin_cuenta, v_tenant, 'Banco sin cuenta Verify 495',
    'BANK-NO-LEDGER-495', 'VERIFY', '495-0002', 'CORRIENTE', 'PEN',
    'ACTIVO', true, true, 5000, 5000, 5000, false, NULL, v_pagador, v_pagador
  );
  SELECT saldo INTO v_bank_before FROM public.cuentas_bancarias WHERE id = v_banco;
  SELECT saldo INTO v_unmapped_bank_before
  FROM public.cuentas_bancarias WHERE id = v_banco_sin_cuenta;

  SELECT id INTO v_almacen FROM public.almacenes
  WHERE tenant_id = v_tenant AND activo
  ORDER BY es_principal DESC, created_at, id LIMIT 1;
  IF v_almacen IS NULL THEN
    INSERT INTO public.almacenes (
      tenant_id, codigo, nombre, estado, activo, es_principal, pais
    ) VALUES (
      v_tenant, 'ALM-495', 'Almacén Verify 495', 'ACTIVO', true, true, 'PE'
    ) RETURNING id INTO v_almacen;
  END IF;
  INSERT INTO public.cajas (
    id, tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_caja, v_tenant, 'CAJA-495', 'Caja Verify 495', 'ACTIVO',
    v_almacen, 'MOSTRADOR', v_pagador
  );
  INSERT INTO public.sesiones_caja (
    id, tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, hora_apertura, fecha_apertura,
    monto_inicial, monto_inicio, monto_esperado, monto_contado,
    monto_cierre, total_efectivo, total_tarjeta, moneda
  ) VALUES (
    v_sesion, v_tenant, v_caja, v_pagador, v_pagador, v_pagador,
    v_pagador, 'ABIERTA', now(), now(), 5000, 5000, 5000, 0,
    0, 0, 0, 'PEN'
  );

  BEGIN
    PERFORM public.pagar_planilla_con_tesoreria_tx_495(
      v_tenant, v_planilla,
      jsonb_build_object(
        'metodo_pago', 'efectivo', 'sesion_caja_id', v_sesion,
        'fecha_pago', '2095-01-31', 'idempotency_key', '495-cash-historical-date'
      ),
      v_pagador
    );
    RAISE EXCEPTION 'El efectivo con fecha distinta al día local debió fallar';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%fecha local vigente%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.pagar_planilla_con_tesoreria_tx_495(
      v_tenant, v_planilla,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
        'sesion_caja_id', gen_random_uuid(), 'referencia', 'INVALID-MIXED-TREASURY',
        'idempotency_key', '495-bank-with-cash-session'
      ),
      v_pagador
    );
    RAISE EXCEPTION 'La transferencia con sesión de caja debió fallar';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%sin sesión de caja%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.pagar_planilla_con_tesoreria_tx_495(
      v_tenant, v_planilla,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
        'referencia', 'OP-495-SELF', 'fecha_pago', '2095-01-31',
        'idempotency_key', '495-pay-self'
      ),
      v_aprobador
    );
    RAISE EXCEPTION 'El aprobador no debió pagar la misma planilla';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- La precondición contable ocurre dentro de la misma intención y antes de
  -- que sobreviva cualquier débito, cambio de estado u outbox.
  BEGIN
    PERFORM public.pagar_planilla_con_tesoreria_tx_495(
      v_tenant, v_planilla,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco_sin_cuenta,
        'referencia', 'OP-495-NO-LEDGER', 'fecha_pago', '2095-01-31',
        'idempotency_key', '495-pay-no-ledger'
      ),
      v_pagador
    );
    RAISE EXCEPTION 'El pago con banco sin cuenta contable debió fallar';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'RRHH_BANK_LEDGER_NOT_CONFIGURED' THEN RAISE; END IF;
  END;
  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla)) <> 'aprobada'
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_sin_cuenta)
          IS DISTINCT FROM v_unmapped_bank_before
     OR EXISTS (
       SELECT 1 FROM public.movimientos_bancarios
       WHERE tenant_id = v_tenant AND cuenta_bancaria_id = v_banco_sin_cuenta
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant AND idempotency_key = '495-pay-no-ledger'
     ) THEN
    RAISE EXCEPTION 'El banco sin cuenta dejó efectos parciales en planilla/tesorería/outbox';
  END IF;

  SELECT public.pagar_planilla_con_tesoreria_tx_495(
    v_tenant, v_planilla,
    jsonb_build_object(
      'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
      'referencia', 'OP-495-1', 'fecha_pago', '2095-01-31',
      'idempotency_key', '495-pay-primary'
    ),
    v_pagador
  ) INTO v_result;
  SELECT saldo INTO v_bank_after FROM public.cuentas_bancarias WHERE id = v_banco;

  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla)) <> 'pagada'
     OR v_bank_before - v_bank_after <> 900
     OR (SELECT count(*) FROM public.movimientos_bancarios
         WHERE tenant_id = v_tenant AND id = (v_result->>'movimientoBancarioId')::uuid) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'planilla.pagada'
           AND aggregate_id = v_planilla::text) <> 1
     OR (SELECT count(*) FROM public.rrhh_planilla_operaciones_495
         WHERE tenant_id = v_tenant AND tipo = 'PAGAR' AND planilla_id = v_planilla) <> 1
     OR (SELECT fecha_pago::date FROM public.planillas WHERE id = v_planilla) <> DATE '2095-01-31'
     OR (SELECT fecha_pago::date FROM public.pagos_empleados
         WHERE tenant_id = v_tenant AND planilla_id = v_planilla LIMIT 1) <> DATE '2095-01-31'
     OR (SELECT fecha FROM public.historial_pagos_planilla
         WHERE tenant_id = v_tenant AND planilla_id = v_planilla) <> DATE '2095-01-31'
     OR (SELECT (payload->>'fechaPago')::timestamptz::date FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'planilla.pagada'
           AND aggregate_id = v_planilla::text) <> DATE '2095-01-31' THEN
    RAISE EXCEPTION 'Pago planilla/tesorería/outbox no fue atómico: %', v_result;
  END IF;

  SELECT public.pagar_planilla_con_tesoreria_tx_495(
    v_tenant, v_planilla,
    jsonb_build_object(
      'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
      'referencia', 'OP-495-1',
      'idempotency_key', '495-pay-primary'
    ),
    v_pagador
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'fechaPago')::date <> DATE '2095-01-31'
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco) <> v_bank_after
     OR (SELECT count(*) FROM public.movimientos_bancarios
         WHERE tenant_id = v_tenant AND metadata->>'source' = 'pagar_planilla_con_tesoreria_tx_495') <> 1 THEN
    RAISE EXCEPTION 'Retry de pago duplicó tesorería: %', v_result;
  END IF;

  BEGIN
    PERFORM public.pagar_planilla_con_tesoreria_tx_495(
      v_tenant, v_planilla,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
        'referencia', 'OTRA-REFERENCIA', 'fecha_pago', '2095-01-31',
        'idempotency_key', '495-pay-primary'
      ),
      v_pagador
    );
    RAISE EXCEPTION 'La colisión de payload de pago debió fallar';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT public.crear_planilla_tx_495(
    v_tenant,
    jsonb_build_object('periodo', '2095-05', 'pais_codigo', 'PE', 'moneda', 'PEN'),
    v_calculador,
    '495-create-cash'
  ) INTO v_result;
  v_planilla_cash := (v_result->>'id')::uuid;
  PERFORM public.guardar_calculo_planilla_tx(
    v_tenant, v_planilla_cash,
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_empleado, 'dias_trabajados', 30,
      'horas_extras_25', 0, 'horas_extras_35', 0,
      'tardanzas_minutos', 0, 'faltas', 0,
      'total_ingresos', 1000, 'total_descuentos', 100,
      'total_aportes', 90, 'neto_pagar', 900, 'conceptos', '[]'::jsonb
    )), v_calculador
  );
  PERFORM public.aprobar_planilla_tx(v_tenant, v_planilla_cash, v_aprobador::text);
  SELECT public.pagar_planilla_con_tesoreria_tx_495(
    v_tenant, v_planilla_cash,
    jsonb_build_object(
      'metodo_pago', 'efectivo', 'sesion_caja_id', v_sesion,
      'fecha_pago', app.hoy_tenant(v_tenant),
      'idempotency_key', '495-pay-cash-current-date'
    ),
    v_pagador
  ) INTO v_result;
  IF (v_result->>'movimientoCajaId')::uuid IS NULL
     OR (SELECT count(*) FROM public.movimientos_caja
         WHERE id = (v_result->>'movimientoCajaId')::uuid
           AND tenant_id = v_tenant AND sesion_caja_id = v_sesion
           AND monto = -900 AND upper(tipo_movimiento) = 'RETIRO') <> 1
     OR (SELECT fecha_pago::date FROM public.planillas
         WHERE id = v_planilla_cash) <> app.hoy_tenant(v_tenant)
     OR lower((SELECT estado::text FROM public.planillas
         WHERE id = v_planilla_cash)) <> 'pagada' THEN
    RAISE EXCEPTION 'El pago efectivo actual no cerró nómina+caja en un solo commit: %', v_result;
  END IF;

  INSERT INTO public.empleados (
    id, tenant_id, nombre, nombres, apellidos, codigo, tipo_documento,
    numero_documento, estado, activo, fecha_ingreso, pais
  ) VALUES
    (v_liq_empleado, v_tenant, 'Liquidación Verify 495', 'Liquidación', 'Verify 495',
     'LIQ-495', 'DNI', '49510001', 'activo', true, '2094-01-01', 'PE'),
    (v_cts_empleado, v_tenant, 'CTS Verify 495', 'CTS', 'Verify 495',
     'CTS-495', 'DNI', '49510002', 'activo', true, '2094-05-01', 'PE');
  INSERT INTO public.contratos (
    id, tenant_id, id_empleado, empleado_id, tipo_contrato, fecha_inicio,
    estado, activo, sueldo_bruto, salario, moneda, regimen_pensionario,
    jornada_laboral
  ) VALUES
    (v_liq_contrato, v_tenant, v_liq_empleado, v_liq_empleado, 'indefinido',
     '2094-01-01', 'vigente', true, 3000, 3000, 'PEN', 'ONP', 'tiempo_completo'),
    (v_cts_contrato, v_tenant, v_cts_empleado, v_cts_empleado, 'indefinido',
     '2094-05-01', 'vigente', true, 2500, 2500, 'PEN', 'ONP', 'tiempo_completo');

  SELECT public.guardar_liquidacion_calculada_tx(
    v_tenant,
    jsonb_build_object(
      'id_empleado', v_liq_empleado, 'motivo_terminacion', 'renuncia',
      'fecha_terminacion', '2095-02-28', 'monto_cts', 0,
      'vacaciones_pendientes', 0, 'indemnizacion', 0, 'dias_cts', 0,
      'total_liquidacion', 500, 'pais_codigo', 'PE', 'moneda', 'PEN',
      'metadata', jsonb_build_object('monto_cts_semestres_pendientes', 0)
    ),
    v_calculador
  ) INTO v_result;
  v_liquidacion := (v_result->'data'->>'id')::uuid;
  BEGIN
    PERFORM public.guardar_liquidacion_calculada_tx(
      v_tenant,
      jsonb_build_object(
        'id_empleado', v_liq_empleado, 'motivo_terminacion', 'renuncia',
        'fecha_terminacion', '2095-02-28', 'monto_cts', 0,
        'vacaciones_pendientes', 0, 'indemnizacion', 0, 'dias_cts', 0,
        'total_liquidacion', 500, 'pais_codigo', 'PE', 'moneda', 'PEN',
        'metadata', jsonb_build_object('monto_cts_semestres_pendientes', 0)
      ),
      v_aprobador
    );
    RAISE EXCEPTION 'Otro actor tomó el replay de cálculo de liquidación';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.confirmar_liquidacion_tx(v_tenant, v_liquidacion, v_aprobador);
  BEGIN
    PERFORM public.confirmar_liquidacion_tx(v_tenant, v_liquidacion, v_otro_aprobador);
    RAISE EXCEPTION 'Otro actor tomó el replay de aprobación de liquidación';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT public.pagar_liquidacion_tx(
    v_tenant, v_liquidacion,
    jsonb_build_object(
      'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
      'referencia', 'LIQ-495-PAY', 'fecha_pago', '2095-03-01T12:00:00Z'
    ),
    v_pagador
  ) INTO v_result;
  v_liq_payment_movement := (v_result->>'movimientoBancarioId')::uuid;
  SELECT public.pagar_liquidacion_tx(
    v_tenant, v_liquidacion,
    jsonb_build_object(
      'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
      'referencia', 'LIQ-495-PAY'
    ),
    v_pagador
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'El retry de liquidación sin fecha no reutilizó la fecha durable: %', v_result;
  END IF;
  BEGIN
    PERFORM public.pagar_liquidacion_tx(
      v_tenant, v_liquidacion,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
        'referencia', 'LIQ-495-PAY'
      ),
      v_calculador
    );
    RAISE EXCEPTION 'Otro actor tomó el replay de pago de liquidación';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.cuentas_bancarias
  SET activa = false, activo = false, estado = 'INACTIVO'
  WHERE id = v_banco AND tenant_id = v_tenant;
  UPDATE public.plan_cuentas
  SET activo = false, estado = 'INACTIVO', acepta_movimiento = false
  WHERE id = v_cuenta_banco AND tenant_id = v_tenant;
  SELECT public.revertir_pago_liquidacion_tx(
    v_tenant, v_liquidacion, 'Reversa verify 495', v_otro_aprobador
  ) INTO v_result;
  v_liq_reversion_event := (v_result->>'eventId')::uuid;
  v_liq_reversal_movement := (v_result->>'movimientoBancarioId')::uuid;
  IF app.to_uuid_or_null((SELECT metadata->>'cuenta_contable_id'
                          FROM public.movimientos_bancarios
                          WHERE id = v_liq_reversal_movement))
       IS DISTINCT FROM v_cuenta_banco
     OR (SELECT metadata->>'cuenta_contable_codigo'
         FROM public.movimientos_bancarios
         WHERE id = v_liq_reversal_movement) <> '104951'
     OR (SELECT movimiento_relacionado_id FROM public.movimientos_bancarios
         WHERE id = v_liq_reversal_movement) IS DISTINCT FROM v_liq_payment_movement
     OR (SELECT activo FROM public.plan_cuentas WHERE id = v_cuenta_banco)
          IS DISTINCT FROM false
     OR (SELECT activo FROM public.cuentas_bancarias WHERE id = v_banco)
          IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'La reversa cambió o revalidó el snapshot tesorero desactivado: %', v_result;
  END IF;
  SELECT public.revertir_pago_liquidacion_tx(
    v_tenant, v_liquidacion, 'Reversa verify 495', v_otro_aprobador
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'eventId')::uuid IS DISTINCT FROM v_liq_reversion_event THEN
    RAISE EXCEPTION 'El retry de reversa de liquidación no fue idempotente: %', v_result;
  END IF;
  BEGIN
    PERFORM public.revertir_pago_liquidacion_tx(
      v_tenant, v_liquidacion, 'Reversa verify 495', v_aprobador
    );
    RAISE EXCEPTION 'Otro actor tomó una reversa de liquidación existente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.revertir_pago_liquidacion_tx(
      v_tenant, v_liquidacion, 'Motivo diferente 495', v_otro_aprobador
    );
    RAISE EXCEPTION 'Un retry de reversa con motivo distinto debió fallar';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.plan_cuentas
  SET activo = true, estado = 'ACTIVO', acepta_movimiento = true
  WHERE id = v_cuenta_banco AND tenant_id = v_tenant;
  UPDATE public.cuentas_bancarias
  SET activa = true, activo = true, estado = 'ACTIVO',
      cuenta_contable_id = v_cuenta_banco
  WHERE id = v_banco AND tenant_id = v_tenant;

  -- Un pago efectivo histórico sin movimiento/sesión de caja no se puede
  -- "restituir" inventando tesorería. El wrapper debe fallar antes de cambiar
  -- estado, publicar outbox o crear un movimiento bancario.
  INSERT INTO public.liquidaciones(
    id, tenant_id, nombre, codigo, estado, id_empleado, fecha_terminacion,
    monto_cts, vacaciones_pendientes, indemnizacion, dias_cts,
    total_liquidacion, fecha_pago, metodo_pago, pagado_por,
    pais_codigo, moneda, metadata
  ) VALUES (
    v_liquidacion_cash_legacy, v_tenant, 'Liquidación efectivo legacy 495',
    'LIQ-CASH-LEGACY-495', 'pagada', v_liq_empleado, '2095-03-15',
    0, 0, 0, 0, 125, now(), 'efectivo', v_pagador, 'PE', 'PEN', '{}'::jsonb
  );
  ALTER TABLE public.pagos_liquidaciones
    DISABLE TRIGGER trg_freeze_rrhh_liquidation_cash_ledger_492;
  INSERT INTO public.pagos_liquidaciones(
    id, tenant_id, liquidacion_id, monto, moneda, metodo_pago, estado,
    referencia, fecha_pago, pagado_por, event_id, idempotency_key,
    fingerprint, metadata
  ) VALUES (
    v_pago_cash_legacy, v_tenant, v_liquidacion_cash_legacy, 125, 'PEN',
    'efectivo', 'APLICADO', 'CASH-LEGACY-495', now(), v_pagador,
    v_pago_cash_legacy_event, 'verify-495-cash-legacy-payment',
    repeat('9', 64), '{}'::jsonb
  );
  ALTER TABLE public.pagos_liquidaciones
    ENABLE TRIGGER trg_freeze_rrhh_liquidation_cash_ledger_492;
  SELECT count(*) INTO v_count FROM public.movimientos_bancarios
  WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.revertir_pago_liquidacion_tx(
      v_tenant, v_liquidacion_cash_legacy,
      'Reversa efectivo legacy bloqueada', v_otro_aprobador
    );
    RAISE EXCEPTION 'La reversa efectivo legacy sin tesorería debió fallar';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'LIQUIDATION_PAYMENT_TREASURY_REGULARIZATION_REQUIRED' THEN RAISE; END IF;
  END;
  IF lower((SELECT estado::text FROM public.liquidaciones
            WHERE id = v_liquidacion_cash_legacy)) <> 'pagada'
     OR (SELECT estado FROM public.pagos_liquidaciones
         WHERE id = v_pago_cash_legacy) <> 'APLICADO'
     OR (SELECT reversion_event_id FROM public.pagos_liquidaciones
         WHERE id = v_pago_cash_legacy) IS NOT NULL
     OR (SELECT count(*) FROM public.movimientos_bancarios
         WHERE tenant_id = v_tenant) <> v_count
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant
         AND event_type = 'liquidacion.pago.revertido'
         AND aggregate_id = v_pago_cash_legacy::text
     ) THEN
    RAISE EXCEPTION 'La reversa efectivo legacy dejó efectos parciales';
  END IF;

  SELECT public.guardar_depositos_cts_calculados_tx(
    v_tenant, '2095-11',
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_cts_empleado,
      'semestre_inicio', '2095-05-01', 'semestre_fin', '2095-10-31',
      'remuneracion_computable', 2500, 'meses_computables', 6,
      'dias_computables', 0, 'monto', 400, 'moneda', 'PEN'
    )),
    v_calculador
  ) INTO v_result;
  v_cts_deposito := (v_result->'depositosIds'->>0)::uuid;
  BEGIN
    PERFORM public.guardar_depositos_cts_calculados_tx(
      v_tenant, '2095-11',
      jsonb_build_array(jsonb_build_object(
        'empleado_id', v_cts_empleado,
        'semestre_inicio', '2095-05-01', 'semestre_fin', '2095-10-31',
        'remuneracion_computable', 2500, 'meses_computables', 6,
        'dias_computables', 0, 'monto', 400, 'moneda', 'PEN'
      )),
      v_aprobador
    );
    RAISE EXCEPTION 'Otro actor reatribuyó el cálculo CTS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF app.to_uuid_or_null((SELECT metadata->>'calculado_por'
      FROM public.depositos_cts WHERE id = v_cts_deposito)) IS DISTINCT FROM v_calculador THEN
    RAISE EXCEPTION 'El maker CTS durable fue alterado';
  END IF;
  SELECT public.guardar_depositos_cts_calculados_tx(
    v_tenant, '2095-11',
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_cts_empleado,
      'semestre_inicio', '2095-05-01', 'semestre_fin', '2095-10-31',
      'remuneracion_computable', 2500, 'meses_computables', 6,
      'dias_computables', 0, 'monto', 400, 'moneda', 'PEN'
    )),
    v_calculador
  ) INTO v_result;
  SELECT public.depositar_cts_tx(
    v_tenant, v_cts_deposito,
    jsonb_build_object(
      'cuenta_bancaria_id', v_banco, 'referencia', 'CTS-495-DEPOSIT',
      'fecha_deposito', '2095-11-15'
    ),
    v_pagador
  ) INTO v_result;
  SELECT public.depositar_cts_tx(
    v_tenant, v_cts_deposito,
    jsonb_build_object(
      'cuenta_bancaria_id', v_banco, 'referencia', 'CTS-495-DEPOSIT'
    ),
    v_pagador
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'El retry CTS sin fecha no reutilizó la fecha durable: %', v_result;
  END IF;
  BEGIN
    PERFORM public.depositar_cts_tx(
      v_tenant, v_cts_deposito,
      jsonb_build_object(
        'cuenta_bancaria_id', v_banco, 'referencia', 'CTS-495-DEPOSIT'
      ),
      v_aprobador
    );
    RAISE EXCEPTION 'Otro actor tomó el replay del depósito CTS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF upper((SELECT estado FROM public.depositos_cts WHERE id = v_cts_deposito)) <> 'DEPOSITADO' THEN
    RAISE EXCEPTION 'El depósito CTS segregado no se completó';
  END IF;

  BEGIN
    PERFORM public.crear_planilla_tx_495(
      v_tenant,
      jsonb_build_object('periodo', '2095-03', 'pais_codigo', 'PE', 'moneda', 'PEN'),
      v_other_actor,
      '495-cross-tenant'
    );
    RAISE EXCEPTION 'Actor cross-tenant debió ser rechazado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.crear_planilla_tx_495(
    v_tenant,
    jsonb_build_object('periodo', '2095-04', 'pais_codigo', 'PE', 'moneda', 'PEN'),
    v_calculador,
    '495-create-rollback'
  ) INTO v_result;
  v_planilla_rollback := (v_result->>'id')::uuid;
  PERFORM public.guardar_calculo_planilla_tx(
    v_tenant, v_planilla_rollback,
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_empleado, 'dias_trabajados', 30,
      'horas_extras_25', 0, 'horas_extras_35', 0,
      'tardanzas_minutos', 0, 'faltas', 0,
      'total_ingresos', 1000, 'total_descuentos', 100,
      'total_aportes', 90, 'neto_pagar', 900, 'conceptos', '[]'::jsonb
    )), v_calculador
  );
  PERFORM public.aprobar_planilla_tx(v_tenant, v_planilla_rollback, v_aprobador::text);

  CREATE OR REPLACE FUNCTION pg_temp.fail_late_495() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW.idempotency_key = '495-pay-rollback' THEN
      RAISE EXCEPTION 'Fallo tardío inducido 495' USING ERRCODE = 'P0495';
    END IF;
    RETURN NEW;
  END
  $fn$;
  CREATE TRIGGER zz_fail_late_495
  BEFORE INSERT ON public.rrhh_planilla_operaciones_495
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_late_495();

  SELECT saldo INTO v_bank_before FROM public.cuentas_bancarias WHERE id = v_banco;
  BEGIN
    PERFORM public.pagar_planilla_con_tesoreria_tx_495(
      v_tenant, v_planilla_rollback,
      jsonb_build_object(
        'metodo_pago', 'transferencia', 'cuenta_bancaria_id', v_banco,
        'referencia', 'OP-495-ROLLBACK', 'fecha_pago', '2095-04-30',
        'idempotency_key', '495-pay-rollback'
      ), v_pagador
    );
    RAISE EXCEPTION 'El fallo tardío inducido debió abortar';
  EXCEPTION WHEN SQLSTATE 'P0495' THEN
    NULL;
  END;
  DROP TRIGGER zz_fail_late_495 ON public.rrhh_planilla_operaciones_495;

  SELECT count(*) INTO v_count FROM public.movimientos_bancarios
  WHERE tenant_id = v_tenant AND referencia = 'OP-495-ROLLBACK';
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco) <> v_bank_before
     OR lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla_rollback)) <> 'aprobada'
     OR v_count <> 0
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant AND event_type = 'planilla.pagada'
         AND aggregate_id = v_planilla_rollback::text
     ) THEN
    RAISE EXCEPTION 'El fallo tardío dejó efectos parciales de nómina/tesorería';
  END IF;
END;
$$;

ROLLBACK;
