\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_cash_474', 'erp_e2e') THEN
    RAISE EXCEPTION 'VERIFY_474_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END
$guard$;

-- Sólo dentro de esta transacción local aislada; ROLLBACK restaura el estado.
UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $verify$
DECLARE
  v_missing text[];
  v_table text;
BEGIN
  SELECT array_agg(name) INTO v_missing
  FROM (VALUES
    ('public.crear_caja_tx(uuid,jsonb,uuid,text)'),
    ('public.actualizar_caja_tx(uuid,uuid,jsonb,uuid,text)'),
    ('public.guardar_configuracion_caja_tx(uuid,jsonb,uuid,text)'),
    ('public.obtener_opciones_contables_caja(uuid,uuid)'),
    ('public.registrar_movimiento_manual_caja_tx(uuid,uuid,jsonb,uuid,text)'),
    ('public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text)'),
    ('public.conciliar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text)'),
    ('public.iniciar_cambio_turno_caja_tx(uuid,uuid,uuid,uuid,text)'),
    ('public.completar_cambio_turno_caja_tx(uuid,uuid,jsonb,uuid,text)'),
    ('public.cancelar_cambio_turno_caja_tx(uuid,uuid,text,uuid,text)')
  ) expected(name)
  WHERE to_regprocedure(name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan RPCs Caja 474: %', v_missing;
  END IF;

  IF has_function_privilege('anon', 'public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL service-role-only inválida para retiro 474';
  END IF;
  IF NOT app.is_accounting_event_458('caja.movimiento_manual.registrado')
     OR NOT app.is_accounting_event_458('caja.retiro.registrado')
     OR NOT app.is_accounting_event_458('caja.cambio_turno.completado') THEN
    RAISE EXCEPTION 'El guard contable 458 no reconoce todos los eventos Caja 474';
  END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'cajas','sesiones_caja','configuracion_caja','movimientos_caja',
    'retiros_caja','cambios_turno','cortes_caja','autorizaciones_caja',
    'caja_audit_log','caja_operaciones_474'
  ] LOOP
    IF has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'DELETE')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'TRUNCATE') THEN
      RAISE EXCEPTION 'service_role conserva DML directo sobre %', v_table;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.caja_operaciones_474', 'SELECT')
     OR has_function_privilege(
       'service_role',
       'app.cash_append_movement_474(uuid,uuid,text,numeric,uuid,text,text,text,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.cash_record_operation_474(uuid,text,text,text,uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.cash_outbox_474(uuid,text,uuid,text,uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.registrar_movimiento_caja(uuid,character varying,numeric,character varying,character varying,text,uuid,uuid,inet,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.abrir_caja_tx_451(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.cerrar_caja_tx_451(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.append_cash_movement_452(sesiones_caja,uuid,numeric,text,text,text,text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.hydrate_demo_business_sample_tx(uuid,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'ACL interna 474 permite forjar helper/ancla';
  END IF;
END
$verify$;

SET LOCAL ROLE service_role;
DO $adversarial_acl$
BEGIN
  BEGIN
    UPDATE public.cajas SET updated_at = updated_at WHERE false;
    RAISE EXCEPTION 'SERVICE_ROLE_DIRECT_CASH_DML_WAS_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM app.cash_fingerprint_474('{}'::jsonb);
    RAISE EXCEPTION 'SERVICE_ROLE_INTERNAL_HELPER_WAS_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$adversarial_acl$;
RESET ROLE;

INSERT INTO public.tenants (id, codigo, nombre, ruc, pais, activo, estado)
VALUES (
  '47400000-0000-4000-8000-000000000001', 'QA-CASH-474', 'QA Caja 474',
  '20474000001', 'PE', true, 'ACTIVO'
);

INSERT INTO public.usuarios_sistema (
  id, tenant_id, email, nombre, apellido, activo, estado, is_super_admin
) VALUES
  ('47400000-0000-4000-8000-000000000011', '47400000-0000-4000-8000-000000000001',
   'admin-cash-474@example.invalid', 'Admin', 'Caja', true, 'ACTIVO', true),
  ('47400000-0000-4000-8000-000000000012', '47400000-0000-4000-8000-000000000001',
   'incoming-cash-474@example.invalid', 'Entrante', 'Caja', true, 'ACTIVO', true),
  ('47400000-0000-4000-8000-000000000013', '47400000-0000-4000-8000-000000000001',
   'ordinary-cash-474@example.invalid', 'Sin', 'Permiso', true, 'ACTIVO', false);

INSERT INTO public.almacenes (
  id, tenant_id, nombre, codigo, estado, activo, es_principal
) VALUES (
  '47400000-0000-4000-8000-000000000021', '47400000-0000-4000-8000-000000000001',
  'Almacén QA Caja', 'ALM-CASH-474', 'ACTIVO', true, true
);

INSERT INTO public.plan_cuentas (
  id, tenant_id, codigo, nombre, estado, activo, acepta_movimiento,
  tipo, tipo_cuenta, nivel
) VALUES
  ('47400000-0000-4000-8000-000000000031', '47400000-0000-4000-8000-000000000001',
   '10111', 'Caja', 'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 5),
  ('47400000-0000-4000-8000-000000000032', '47400000-0000-4000-8000-000000000001',
   '10411', 'Banco QA', 'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 5),
  ('47400000-0000-4000-8000-000000000033', '47400000-0000-4000-8000-000000000001',
   '10112', 'Bóveda QA', 'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 5),
  ('47400000-0000-4000-8000-000000000034', '47400000-0000-4000-8000-000000000001',
   '65999', 'Gasto de caja QA', 'ACTIVO', true, true, 'GASTO', 'GASTO', 5),
  ('47400000-0000-4000-8000-000000000035', '47400000-0000-4000-8000-000000000001',
   '75999', 'Ingreso de caja QA', 'ACTIVO', true, true, 'INGRESO', 'INGRESO', 5);

INSERT INTO public.cuentas_bancarias (
  id, tenant_id, nombre, banco, numero_cuenta, tipo_cuenta, moneda,
  estado, activo, activa, saldo, saldo_actual, saldo_contable,
  cuenta_contable_id, created_by
) VALUES (
  '47400000-0000-4000-8000-000000000041', '47400000-0000-4000-8000-000000000001',
  'Cuenta bancaria QA', 'Banco QA', '001-474-0001', 'CORRIENTE', 'PEN',
  'ACTIVO', true, true, 0, 0, 0,
  '47400000-0000-4000-8000-000000000032', '47400000-0000-4000-8000-000000000011'
);

DO $test$
DECLARE
  v_result jsonb;
  v_retry jsonb;
  v_caja_id uuid;
  v_before integer;
BEGIN
  v_result := public.crear_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'nombre', 'Caja QA 474', 'codigo', 'CAJA-QA-474',
      'almacen_id', '47400000-0000-4000-8000-000000000021', 'tipo', 'TIENDA'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-create-474-0001'
  );
  v_caja_id := (v_result->>'caja_id')::uuid;
  IF v_caja_id IS NULL OR coalesce((v_result->>'idempotent')::boolean, true) THEN
    RAISE EXCEPTION 'Crear caja 474 no devolvió resultado durable';
  END IF;
  v_retry := public.crear_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'nombre', 'Caja QA 474', 'codigo', 'CAJA-QA-474',
      'almacen_id', '47400000-0000-4000-8000-000000000021', 'tipo', 'TIENDA'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-create-474-0001'
  );
  IF (v_retry->>'caja_id')::uuid <> v_caja_id
     OR NOT coalesce((v_retry->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'Retry de crear caja no fue idempotente';
  END IF;
  SELECT count(*) INTO v_before FROM public.cajas
  WHERE tenant_id = '47400000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.crear_caja_tx(
      '47400000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'nombre', 'Colisión', 'codigo', 'CAJA-QA-OTRA',
        'almacen_id', '47400000-0000-4000-8000-000000000021', 'tipo', 'TIENDA'
      ),
      '47400000-0000-4000-8000-000000000011', 'cash-create-474-0001'
    );
    RAISE EXCEPTION 'La colisión de fingerprint fue aceptada';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.cajas
      WHERE tenant_id = '47400000-0000-4000-8000-000000000001') <> v_before THEN
    RAISE EXCEPTION 'La colisión dejó mutación parcial';
  END IF;

  PERFORM public.guardar_configuracion_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'caja_id', v_caja_id, 'monto_apertura_min', 0,
      'monto_apertura_max', 5000, 'requiere_supervisor_fuera_rango', true,
      'tolerancia_diferencia_cierre', 10,
      'retiro_max_sin_autorizacion', 5000,
      'saldo_minimo_operativo', 10, 'moneda', 'PEN'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-config-474-0001'
  );

  INSERT INTO public.sesiones_caja (
    id, tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, activo, monto_inicio, monto_inicial,
    monto_esperado, monto_contado, monto_cierre, total_efectivo,
    total_tarjeta, moneda, hora_apertura, fecha_apertura, congelada, metadata
  ) VALUES (
    '47400000-0000-4000-8000-000000000051',
    '47400000-0000-4000-8000-000000000001', v_caja_id,
    '47400000-0000-4000-8000-000000000011',
    '47400000-0000-4000-8000-000000000011',
    '47400000-0000-4000-8000-000000000011',
    '47400000-0000-4000-8000-000000000011',
    'ABIERTA', true, 1000, 1000, 1000, 0, 0, 0, 0,
    'PEN', clock_timestamp(), clock_timestamp(), false, '{}'::jsonb
  );
END
$test$;

DO $test$
DECLARE
  v_result jsonb;
  v_retry jsonb;
  v_count integer;
BEGIN
  BEGIN
    PERFORM public.obtener_opciones_contables_caja(
      '47400000-0000-4000-8000-000000000001',
      '47400000-0000-4000-8000-000000000013'
    );
    RAISE EXCEPTION 'Actor sin permisos pudo leer opciones contables';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_result := public.registrar_movimiento_manual_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    jsonb_build_object(
      'tipo', 'GASTO', 'monto', 25, 'motivo', 'Compra menor QA',
      'cuenta_contrapartida_id', '47400000-0000-4000-8000-000000000034'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-manual-474-0001'
  );
  IF (v_result->>'movimiento_id')::uuid IS NULL OR (v_result->>'event_id')::uuid IS NULL THEN
    RAISE EXCEPTION 'Movimiento manual sin IDs durables';
  END IF;
  v_retry := public.registrar_movimiento_manual_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    jsonb_build_object(
      'tipo', 'GASTO', 'monto', 25, 'motivo', 'Compra menor QA',
      'cuenta_contrapartida_id', '47400000-0000-4000-8000-000000000034'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-manual-474-0001'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR v_retry->>'movimiento_id' <> v_result->>'movimiento_id' THEN
    RAISE EXCEPTION 'Retry manual no fue idempotente';
  END IF;
  SELECT count(*) INTO v_count FROM public.movimientos_caja
  WHERE tenant_id = '47400000-0000-4000-8000-000000000001'
    AND lower(referencia_tipo) = 'manual_474';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Movimiento manual duplicado: %', v_count; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE event_id = (v_result->>'event_id')::uuid
      AND event_type = 'caja.movimiento_manual.registrado'
      AND payload->>'accountingHandledByOutbox' = 'true'
  ) THEN RAISE EXCEPTION 'Movimiento manual sin outbox contable owned'; END IF;

  BEGIN
    PERFORM public.registrar_movimiento_manual_caja_tx(
      '47400000-0000-4000-8000-000000000001',
      '47400000-0000-4000-8000-000000000051',
      jsonb_build_object(
        'tipo', 'GASTO', 'monto', 5, 'motivo', 'Sin cuenta',
        'cuenta_contrapartida_id', '47400000-0000-4000-8000-000000009999'
      ),
      '47400000-0000-4000-8000-000000000011', 'cash-manual-474-missing'
    );
    RAISE EXCEPTION 'Movimiento sin cuenta fue aceptado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.movimientos_caja
      WHERE tenant_id = '47400000-0000-4000-8000-000000000001'
        AND lower(referencia_tipo) = 'manual_474') <> 1 THEN
    RAISE EXCEPTION 'Fallo de cuenta dejó movimiento parcial';
  END IF;
END
$test$;

DO $test$
DECLARE
  v_vault jsonb;
  v_expense jsonb;
  v_bank jsonb;
  v_bank_second jsonb;
  v_bank_balance numeric;
BEGIN
  v_vault := public.solicitar_retiro_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    jsonb_build_object(
      'monto', 100, 'motivo', 'BOVEDA', 'motivo_detalle', 'Traslado interno QA',
      'cuenta_contrapartida_id', '47400000-0000-4000-8000-000000000033'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-withdraw-vault-474-0001'
  );
  v_expense := public.solicitar_retiro_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    jsonb_build_object(
      'monto', 50, 'motivo', 'OTRO', 'motivo_detalle', 'Gasto explícito QA',
      'cuenta_contrapartida_id', '47400000-0000-4000-8000-000000000034'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-withdraw-expense-474-0001'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.outbox_events e
    WHERE e.event_id IN ((v_vault->>'event_id')::uuid, (v_expense->>'event_id')::uuid)
      AND e.event_type = 'caja.retiro.registrado'
    GROUP BY e.tenant_id HAVING count(*) = 2
  ) THEN RAISE EXCEPTION 'Retiros no bancarios sin sus dos eventos contables'; END IF;

  v_bank := public.solicitar_retiro_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    jsonb_build_object(
      'monto', 75, 'motivo', 'DEPOSITO_BANCARIO',
      'foto_comprobante', 'https://evidence.invalid/deposito-474.jpg',
      'cuenta_bancaria_id', '47400000-0000-4000-8000-000000000041'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-withdraw-bank-474-0001'
  );
  SELECT saldo INTO v_bank_balance FROM public.cuentas_bancarias
  WHERE id = '47400000-0000-4000-8000-000000000041';
  IF v_bank_balance <> 75
     OR (v_bank->>'movimiento_bancario_id')::uuid IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE event_id = (v_bank->>'event_id')::uuid
         AND event_type = 'banco.movimiento.registrado'
     ) THEN
    RAISE EXCEPTION 'Depósito no confirmó banco y evento 457 en el mismo resultado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE aggregate_id = (v_bank->>'retiro_id') AND event_type = 'caja.retiro.registrado'
  ) THEN RAISE EXCEPTION 'Depósito bancario generó doble ownership contable'; END IF;

  -- Una nueva intención con payload igual no puede reutilizar el movimiento
  -- bancario de la intención anterior. La idempotencia anidada deriva de la
  -- key exterior, no del payload compartido.
  v_bank_second := public.solicitar_retiro_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    jsonb_build_object(
      'monto', 75, 'motivo', 'DEPOSITO_BANCARIO',
      'foto_comprobante', 'https://evidence.invalid/deposito-474.jpg',
      'cuenta_bancaria_id', '47400000-0000-4000-8000-000000000041'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-withdraw-bank-474-0002'
  );
  SELECT saldo INTO v_bank_balance FROM public.cuentas_bancarias
  WHERE id = '47400000-0000-4000-8000-000000000041';
  IF v_bank_balance <> 150
     OR (v_bank_second->>'movimiento_bancario_id')::uuid =
        (v_bank->>'movimiento_bancario_id')::uuid
     OR (v_bank_second->>'event_id')::uuid = (v_bank->>'event_id')::uuid THEN
    RAISE EXCEPTION 'Dos intenciones bancarias distintas compartieron movimiento/evento';
  END IF;

  PERFORM public.conciliar_retiro_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    (v_bank->>'retiro_id')::uuid,
    jsonb_build_object(
      'numero_operacion', 'OP-474-0001',
      'fecha_conciliacion', clock_timestamp(),
      'comprobante_url', 'https://evidence.invalid/deposito-confirmado-474.jpg'
    ),
    '47400000-0000-4000-8000-000000000011', 'cash-reconcile-bank-474-0001'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.retiros_caja
    WHERE id = (v_bank->>'retiro_id')::uuid
      AND estado_conciliacion::text = 'CONCILIADO'
      AND conciliado_por = '47400000-0000-4000-8000-000000000011'
  ) THEN RAISE EXCEPTION 'Conciliación operativa no quedó trazable'; END IF;
END
$test$;

DO $test$
DECLARE
  v_year integer := extract(year FROM current_date);
  v_month integer := extract(month FROM current_date);
  v_movements integer;
  v_outbox integer;
  v_operations integer;
  v_bank numeric;
BEGIN
  UPDATE public.outbox_events
  SET status='completed', processed_at=clock_timestamp(), updated_at=clock_timestamp()
  WHERE tenant_id='47400000-0000-4000-8000-000000000001';
  PERFORM public.cerrar_periodo_contable_tx(
    '47400000-0000-4000-8000-000000000001', v_year, v_month,
    '47400000-0000-4000-8000-000000000011'
  );
  SELECT count(*) INTO v_movements FROM public.movimientos_caja;
  SELECT count(*) INTO v_outbox FROM public.outbox_events;
  SELECT count(*) INTO v_operations FROM public.caja_operaciones_474;
  SELECT saldo INTO v_bank FROM public.cuentas_bancarias
  WHERE id = '47400000-0000-4000-8000-000000000041';
  BEGIN
    PERFORM public.solicitar_retiro_caja_tx(
      '47400000-0000-4000-8000-000000000001',
      '47400000-0000-4000-8000-000000000051',
      jsonb_build_object(
        'monto', 20, 'motivo', 'DEPOSITO_BANCARIO',
        'foto_comprobante', 'https://evidence.invalid/closed-period.jpg',
        'cuenta_bancaria_id', '47400000-0000-4000-8000-000000000041'
      ),
      '47400000-0000-4000-8000-000000000011', 'cash-closed-period-474-0001'
    );
    RAISE EXCEPTION 'Período cerrado aceptó depósito';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    IF SQLERRM NOT LIKE 'ACCOUNTING_PERIOD_NOT_OPEN:%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.movimientos_caja) <> v_movements
     OR (SELECT count(*) FROM public.outbox_events) <> v_outbox
     OR (SELECT count(*) FROM public.caja_operaciones_474) <> v_operations
     OR (SELECT saldo FROM public.cuentas_bancarias
         WHERE id = '47400000-0000-4000-8000-000000000041') <> v_bank THEN
    RAISE EXCEPTION 'Período cerrado dejó mutación parcial en caja/banco/outbox/op';
  END IF;
  PERFORM public.reabrir_periodo_contable_tx(
    '47400000-0000-4000-8000-000000000001', v_year, v_month,
    '47400000-0000-4000-8000-000000000011'
  );
END
$test$;

DO $test$
DECLARE
  v_start jsonb;
  v_complete jsonb;
  v_balance numeric;
  v_counted numeric;
  v_change_id uuid;
BEGIN
  SELECT round(coalesce(s.monto_inicio,s.monto_inicial,0) + coalesce(sum(m.monto),0),2)
  INTO v_balance
  FROM public.sesiones_caja s
  LEFT JOIN public.movimientos_caja m
    ON m.tenant_id=s.tenant_id AND m.sesion_caja_id=s.id
  WHERE s.id='47400000-0000-4000-8000-000000000051'
  GROUP BY s.id,s.monto_inicio,s.monto_inicial;
  v_start := public.iniciar_cambio_turno_caja_tx(
    '47400000-0000-4000-8000-000000000001',
    '47400000-0000-4000-8000-000000000051',
    '47400000-0000-4000-8000-000000000012',
    '47400000-0000-4000-8000-000000000011', 'cash-shift-start-474-0001'
  );
  v_change_id := (v_start->>'cambio_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.sesiones_caja
    WHERE id='47400000-0000-4000-8000-000000000051' AND congelada
      AND metadata->>'cambio_turno_en_proceso_id'=v_change_id::text
  ) THEN RAISE EXCEPTION 'Inicio de turno no congeló de forma trazable'; END IF;

  v_counted := v_balance + 10;
  v_complete := public.completar_cambio_turno_caja_tx(
    '47400000-0000-4000-8000-000000000001', v_change_id,
    jsonb_build_object(
      'monto_contado', v_counted,
      'denominaciones', jsonb_build_object(
        'billetes', jsonb_build_object('1', v_counted::integer), 'monedas', '{}'::jsonb
      ),
      'foto_arqueo', 'https://evidence.invalid/shift-474.jpg',
      'confirmacion_saliente', 'confirmacion-saliente-474',
      'confirmacion_entrante', 'confirmacion-entrante-474',
      'cuenta_diferencia_id', '47400000-0000-4000-8000-000000000035'
    ),
    '47400000-0000-4000-8000-000000000012', 'cash-shift-complete-474-0001'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.cambios_turno c
    JOIN public.sesiones_caja s ON s.id=c.sesion_caja_id
    WHERE c.id=v_change_id AND c.estado::text='COMPLETADO'
      AND c.diferencia=10 AND c.firma_digital_saliente LIKE 'sha256:%'
      AND c.firma_digital_saliente NOT LIKE '%confirmacion-saliente-474%'
      AND s.usuario_id='47400000-0000-4000-8000-000000000012'
      AND NOT s.congelada
  ) THEN RAISE EXCEPTION 'Completar turno no hizo handoff/hash/diferencia atómicos'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE event_id=(v_complete->>'event_id')::uuid
      AND event_type='caja.cambio_turno.completado'
      AND (payload->>'diferencia')::numeric=10
  ) THEN RAISE EXCEPTION 'Cambio de turno sin evento contable por la diferencia'; END IF;
  IF (SELECT count(*) FROM public.movimientos_caja
      WHERE lower(referencia_tipo)='cambio_turno_474' AND referencia_documento=v_change_id::text) <> 1 THEN
    RAISE EXCEPTION 'Cambio de turno no registró exactamente una diferencia';
  END IF;
  PERFORM public.completar_cambio_turno_caja_tx(
    '47400000-0000-4000-8000-000000000001', v_change_id,
    jsonb_build_object(
      'monto_contado', v_counted,
      'denominaciones', jsonb_build_object(
        'billetes', jsonb_build_object('1', v_counted::integer), 'monedas', '{}'::jsonb
      ),
      'foto_arqueo', 'https://evidence.invalid/shift-474.jpg',
      'confirmacion_saliente', 'confirmacion-saliente-474',
      'confirmacion_entrante', 'confirmacion-entrante-474',
      'cuenta_diferencia_id', '47400000-0000-4000-8000-000000000035'
    ),
    '47400000-0000-4000-8000-000000000012', 'cash-shift-complete-474-0001'
  );
  IF (SELECT count(*) FROM public.movimientos_caja
      WHERE lower(referencia_tipo)='cambio_turno_474' AND referencia_documento=v_change_id::text) <> 1 THEN
    RAISE EXCEPTION 'Retry de turno duplicó la diferencia';
  END IF;
END
$test$;

ROLLBACK;

SELECT '474 cash alternate writers atomic verification passed' AS verification;
