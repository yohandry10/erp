\set ON_ERROR_STOP on

BEGIN;

UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_458_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_demo_other jsonb;
  v_tenant uuid;
  v_other_tenant uuid;
  v_actor uuid;
  v_other_actor uuid;
  v_10 uuid := gen_random_uuid();
  v_12 uuid := gen_random_uuid();
  v_40 uuid := gen_random_uuid();
  v_50 uuid := gen_random_uuid();
  v_59 uuid := gen_random_uuid();
  v_63 uuid := gen_random_uuid();
  v_69 uuid := gen_random_uuid();
  v_70 uuid := gen_random_uuid();
  v_89 uuid := gen_random_uuid();
  v_entry jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_report jsonb;
  v_balance jsonb;
  v_row record;
  v_failed boolean;
  v_pending_event uuid := gen_random_uuid();
BEGIN
  IF NOT app.is_accounting_event_458('banco.movimiento.registrado')
     OR NOT app.is_accounting_event_458('banco.transferencia.registrada') THEN
    RAISE EXCEPTION 'VERIFY_458_EVENTOS_BANCARIOS_FUERA_DEL_CANDADO_CONTABLE';
  END IF;

  v_demo := public.create_demo_tenant('VERIFY ACCOUNTING 458', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  v_demo_other := public.create_demo_tenant('VERIFY ACCOUNTING OTHER 458', 1, 'PE');
  v_other_tenant := (v_demo_other->>'tenant_id')::uuid;
  v_other_actor := (v_demo_other->>'user_id')::uuid;

  INSERT INTO public.plan_cuentas (
    id, tenant_id, codigo, nombre, estado, activo, tipo, tipo_cuenta,
    acepta_movimiento, nivel
  ) VALUES
    (v_10, v_tenant, '10', 'Efectivo', 'ACTIVO', true, 'ACTIVO', 'ACTIVO', true, 2),
    (v_12, v_tenant, '12', 'Cuentas por cobrar', 'ACTIVO', true, 'ACTIVO', 'ACTIVO', true, 2),
    (v_40, v_tenant, '40', 'Tributos por pagar', 'ACTIVO', true, 'PASIVO', 'PASIVO', true, 2),
    (v_50, v_tenant, '50', 'Capital', 'ACTIVO', true, 'PATRIMONIO', 'PATRIMONIO', true, 2),
    (v_59, v_tenant, '59', 'Resultados acumulados', 'ACTIVO', true, 'PATRIMONIO', 'PATRIMONIO', true, 2),
    (v_63, v_tenant, '63', 'Servicios de terceros', 'ACTIVO', true, 'GASTO', 'GASTO', true, 2),
    (v_69, v_tenant, '69', 'Costo de ventas', 'ACTIVO', true, 'GASTO', 'GASTO', true, 2),
    (v_70, v_tenant, '70', 'Ventas', 'ACTIVO', true, 'INGRESO', 'INGRESO', true, 2),
    (v_89, v_tenant, '89', 'Determinacion del resultado', 'ACTIVO', true, 'ORDEN', 'ORDEN', true, 2);

  -- Enero: venta 100 + IGV 18. El asiento debe materializar y bloquear el
  -- periodo en la misma transaccion del writer.
  v_entry := public.crear_asiento_con_detalles_tx(
    v_tenant,
    jsonb_build_object(
      'fecha', '2026-01-15T12:00:00Z',
      'concepto', 'Venta enero verify 458',
      'estado', 'CONFIRMADO',
      'source_event_id', gen_random_uuid(),
      'created_by', v_actor,
      'confirmado_por', v_actor
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_12, 'debe', 118, 'haber', 0, 'concepto', 'Cliente'),
      jsonb_build_object('cuenta_id', v_70, 'debe', 0, 'haber', 100, 'concepto', 'Venta'),
      jsonb_build_object('cuenta_id', v_40, 'debe', 0, 'haber', 18, 'concepto', 'IGV')
    )
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.periodos_contables p
    WHERE p.tenant_id = v_tenant AND p.anio = 2026 AND p.mes = 1
      AND upper(p.estado::text) = 'ABIERTO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_458_NO_MATERIALIZO_PERIODO';
  END IF;

  SELECT * INTO v_row
  FROM public.balance_comprobacion_live(v_tenant, 2026, 1)
  WHERE cuenta = '12';
  IF v_row.saldo_inicial <> 0 OR v_row.debe <> 118 OR v_row.haber <> 0 OR v_row.saldo_final <> 118 THEN
    RAISE EXCEPTION 'VERIFY_458_BALANCE_ENERO_INCORRECTO:%', row_to_json(v_row);
  END IF;

  v_report := public.estado_resultados_live(v_tenant, 2026, 1);
  IF (v_report->>'ventas')::numeric <> 100
     OR (v_report->>'utilidad_neta')::numeric <> 100 THEN
    RAISE EXCEPTION 'VERIFY_458_RESULTADO_ENERO_INCORRECTO:%', v_report;
  END IF;

  -- Febrero: cobro y gasto. El saldo inicial de 12 viene de enero, no de un
  -- snapshot materializado, y el P&L es YTD.
  PERFORM public.crear_asiento_con_detalles_tx(
    v_tenant,
    jsonb_build_object(
      'fecha', '2026-02-05T12:00:00Z', 'concepto', 'Cobro febrero',
      'estado', 'CONFIRMADO', 'source_event_id', gen_random_uuid(),
      'created_by', v_actor, 'confirmado_por', v_actor
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_10, 'debe', 118, 'haber', 0, 'concepto', 'Banco'),
      jsonb_build_object('cuenta_id', v_12, 'debe', 0, 'haber', 118, 'concepto', 'Cliente')
    )
  );

  PERFORM public.crear_asiento_con_detalles_tx(
    v_tenant,
    jsonb_build_object(
      'fecha', '2026-02-10T12:00:00Z', 'concepto', 'Servicio febrero',
      'estado', 'CONFIRMADO', 'source_event_id', gen_random_uuid(),
      'created_by', v_actor, 'confirmado_por', v_actor
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_63, 'debe', 30, 'haber', 0, 'concepto', 'Servicio'),
      jsonb_build_object('cuenta_id', v_10, 'debe', 0, 'haber', 30, 'concepto', 'Banco')
    )
  );

  SELECT * INTO v_row
  FROM public.balance_comprobacion_live(v_tenant, 2026, 2)
  WHERE cuenta = '12';
  IF v_row.saldo_inicial <> 118 OR v_row.debe <> 0 OR v_row.haber <> 118 OR v_row.saldo_final <> 0 THEN
    RAISE EXCEPTION 'VERIFY_458_ARRASTRE_FEBRERO_INCORRECTO:%', row_to_json(v_row);
  END IF;

  v_report := public.estado_resultados_live(v_tenant, 2026, 2);
  IF (v_report->>'ventas')::numeric <> 100
     OR (v_report->>'gastos_administrativos')::numeric <> 30
     OR (v_report->>'utilidad_neta')::numeric <> 70 THEN
    RAISE EXCEPTION 'VERIFY_458_RESULTADO_YTD_INCORRECTO:%', v_report;
  END IF;

  v_balance := public.balance_general_live(v_tenant, 2026, 2);
  IF (v_balance->>'efectivo')::numeric <> 88
     OR (v_balance->>'tributos_por_pagar')::numeric <> 18
     OR (v_balance->>'resultado_ejercicio')::numeric <> 70 THEN
    RAISE EXCEPTION 'VERIFY_458_BALANCE_GENERAL_INCORRECTO:%', v_balance;
  END IF;

  PERFORM public.cerrar_periodo_contable_tx(v_tenant, 2026, 1, v_actor);

  -- Un evento de otro tenant no bloquea. Uno contable del tenant si bloquea.
  INSERT INTO public.outbox_events (
    event_id, tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, occurred_at, idempotency_key
  ) VALUES (
    gen_random_uuid(), v_other_tenant, 'factura', gen_random_uuid()::text,
    'factura.emitida', jsonb_build_object('fecha', '2026-02-15'),
    'pending', '2026-02-15T12:00:00Z', 'verify-458-other-event'
  );

  INSERT INTO public.outbox_events (
    event_id, tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, occurred_at, idempotency_key
  ) VALUES (
    v_pending_event, v_tenant, 'factura', gen_random_uuid()::text,
    'factura.emitida', jsonb_build_object('fecha', '2026-02-16'),
    'pending', '2026-02-16T12:00:00Z', 'verify-458-pending-event'
  );

  v_failed := false;
  BEGIN
    PERFORM public.cerrar_periodo_contable_tx(v_tenant, 2026, 2, v_actor);
  EXCEPTION WHEN others THEN
    v_failed := SQLERRM LIKE 'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_458_CIERRE_ACEPTO_EVENTO_PENDIENTE';
  END IF;

  UPDATE public.outbox_events
  SET status = 'completed', processed_at = now(), updated_at = now()
  WHERE event_id = v_pending_event;

  -- Un borrador tambien bloquea, y eliminarlo usa el mismo periodo guardado.
  v_entry := public.crear_asiento_con_detalles_tx(
    v_tenant,
    jsonb_build_object(
      'fecha', '2026-02-20T12:00:00Z', 'concepto', 'Borrador verify',
      'estado', 'BORRADOR', 'created_by', v_actor
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_63, 'debe', 1, 'haber', 0, 'concepto', 'Debe'),
      jsonb_build_object('cuenta_id', v_10, 'debe', 0, 'haber', 1, 'concepto', 'Haber')
    )
  );

  v_failed := false;
  BEGIN
    PERFORM public.cerrar_periodo_contable_tx(v_tenant, 2026, 2, v_actor);
  EXCEPTION WHEN others THEN
    v_failed := SQLERRM LIKE 'ACCOUNTING_PERIOD_HAS_DRAFT_ENTRIES:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_458_CIERRE_ACEPTO_BORRADOR';
  END IF;
  PERFORM public.eliminar_asiento_borrador_tx(v_tenant, (v_entry->>'id')::uuid);

  v_result := public.cerrar_periodo_contable_tx(v_tenant, 2026, 2, v_actor);
  v_retry := public.cerrar_periodo_contable_tx(v_tenant, 2026, 2, v_actor);
  IF COALESCE((v_result->>'idempotent')::boolean, true)
     OR NOT COALESCE((v_retry->>'idempotent')::boolean, false)
     OR v_retry #>> '{periodo,id}' IS DISTINCT FROM v_result #>> '{periodo,id}' THEN
    RAISE EXCEPTION 'VERIFY_458_CIERRE_RETRY_INCORRECTO:%:%', v_result, v_retry;
  END IF;

  -- Ni el writer de asientos ni el outbox pueden cruzar el cierre.
  v_failed := false;
  BEGIN
    PERFORM public.crear_asiento_con_detalles_tx(
      v_tenant,
      jsonb_build_object(
        'fecha', '2026-02-25T12:00:00Z', 'concepto', 'Entrada tardia',
        'estado', 'CONFIRMADO', 'source_event_id', gen_random_uuid(),
        'created_by', v_actor, 'confirmado_por', v_actor
      ),
      jsonb_build_array(
        jsonb_build_object('cuenta_id', v_63, 'debe', 1, 'haber', 0, 'concepto', 'Debe'),
        jsonb_build_object('cuenta_id', v_10, 'debe', 0, 'haber', 1, 'concepto', 'Haber')
      )
    );
  EXCEPTION WHEN others THEN
    v_failed := SQLERRM LIKE 'ACCOUNTING_PERIOD_NOT_OPEN:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_458_WRITER_CRUZO_CIERRE';
  END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.outbox_events (
      event_id, tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, occurred_at, idempotency_key
    ) VALUES (
      gen_random_uuid(), v_tenant, 'factura', gen_random_uuid()::text,
      'factura.emitida', jsonb_build_object('fecha', '2026-02-26'),
      'pending', '2026-02-26T12:00:00Z', 'verify-458-late-event'
    );
  EXCEPTION WHEN others THEN
    v_failed := SQLERRM LIKE 'ACCOUNTING_PERIOD_NOT_OPEN:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_458_OUTBOX_CRUZO_CIERRE';
  END IF;

  v_failed := false;
  BEGIN
    UPDATE public.periodos_contables
    SET estado = 'ABIERTO'
    WHERE tenant_id = v_tenant AND anio = 2026 AND mes = 2;
  EXCEPTION WHEN others THEN
    v_failed := SQLERRM = 'ACCOUNTING_PERIOD_TRANSITION_REQUIRES_RPC';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_458_UPDATE_DIRECTO_PERIODO_PASO';
  END IF;

  v_result := public.reabrir_periodo_contable_tx(v_tenant, 2026, 2, v_actor);
  IF v_result #>> '{periodo,estado}' <> 'ABIERTO' THEN
    RAISE EXCEPTION 'VERIFY_458_REAPERTURA_INCORRECTA:%', v_result;
  END IF;
  PERFORM public.cerrar_periodo_contable_tx(v_tenant, 2026, 2, v_actor);

  -- Diciembre: el cierre anual usa el resultado YTD y lo transfiere una sola
  -- vez a 59. Al quedar confirmado, Balance General no vuelve a sumar el YTD.
  PERFORM public.crear_asiento_con_detalles_tx(
    v_tenant,
    jsonb_build_object(
      'fecha', '2026-12-15T12:00:00Z', 'concepto', 'Venta diciembre',
      'estado', 'CONFIRMADO', 'source_event_id', gen_random_uuid(),
      'created_by', v_actor, 'confirmado_por', v_actor
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_12, 'debe', 50, 'haber', 0, 'concepto', 'Cliente'),
      jsonb_build_object('cuenta_id', v_70, 'debe', 0, 'haber', 50, 'concepto', 'Venta')
    )
  );

  v_result := public.cerrar_periodo_contable_tx(v_tenant, 2026, 12, v_actor);
  IF v_result->>'cierre_asiento_id' IS NULL
     OR (SELECT count(*) FROM public.asientos_contables a
         WHERE a.tenant_id = v_tenant AND upper(a.origen) = 'CIERRE_ANUAL'
           AND upper(a.estado::text) = 'CONFIRMADO') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_458_CIERRE_ANUAL_FALTANTE:%', v_result;
  END IF;

  v_balance := public.balance_general_live(v_tenant, 2026, 12);
  IF (v_balance->>'resultado_ejercicio')::numeric <> 0
     OR (v_balance->>'resultados_acumulados')::numeric <> 120 THEN
    RAISE EXCEPTION 'VERIFY_458_RESULTADO_ANUAL_DUPLICADO:%', v_balance;
  END IF;

  PERFORM public.reabrir_periodo_contable_tx(v_tenant, 2026, 12, v_actor);
  IF (SELECT count(*) FROM public.asientos_contables a
      WHERE a.tenant_id = v_tenant AND upper(a.origen) = 'CIERRE_ANUAL'
        AND upper(a.estado::text) = 'ANULADO') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_458_REAPERTURA_NO_ANULO_CIERRE';
  END IF;

  PERFORM public.cerrar_periodo_contable_tx(v_tenant, 2026, 12, v_actor);
  IF (SELECT count(*) FROM public.asientos_contables a
      WHERE a.tenant_id = v_tenant AND upper(a.origen) = 'CIERRE_ANUAL'
        AND upper(a.estado::text) = 'CONFIRMADO') <> 1
     OR (SELECT count(*) FROM public.asientos_contables a
         WHERE a.tenant_id = v_tenant AND upper(a.origen) = 'CIERRE_ANUAL') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_458_RECLOSE_ANUAL_NO_VERSIONADO';
  END IF;

  -- Aislamiento de lectura y actor ajeno.
  IF EXISTS (SELECT 1 FROM public.balance_comprobacion_live(v_other_tenant, 2026, 12)) THEN
    RAISE EXCEPTION 'VERIFY_458_REPORTE_CROSS_TENANT';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reabrir_periodo_contable_tx(v_tenant, 2026, 12, v_other_actor);
  EXCEPTION WHEN others THEN
    v_failed := SQLERRM = 'ACCOUNTING_ACTOR_NOT_ACTIVE_IN_TENANT';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_458_ACTOR_AJENO_ACEPTADO';
  END IF;

  IF has_function_privilege('authenticated', 'public.cerrar_periodo_contable_tx(uuid,integer,integer,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.balance_general_live(uuid,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.balance_comprobacion_live(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_458_ACL_RPC_INCORRECTO';
  END IF;
END;
$verify$;

ROLLBACK;
