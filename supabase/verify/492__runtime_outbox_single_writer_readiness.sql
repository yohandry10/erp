\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_runtime_492') THEN
    RAISE EXCEPTION 'VERIFY_492_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_492_REQUIERE_POSTGRESQL_16';
  END IF;
END
$guard$;

-- La instancia efímera no usa necesariamente `supabase db push`; se crea el
-- mismo catálogo mínimo que consulta readiness y todo se revierte al final.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[] NOT NULL DEFAULT '{}'::text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations(version, statements, name)
VALUES ('492', ARRAY['verify local 492'], '_runtime_outbox_single_writer_readiness')
ON CONFLICT (version) DO NOTHING;

UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localerpephemeralqax', allow_demo_data = true,
    configured_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE singleton = true;

CREATE TEMP TABLE verify_492_context (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  other_tenant_id uuid NOT NULL,
  other_actor_id uuid NOT NULL,
  recent_event_id uuid,
  event_id uuid,
  event_row_id uuid,
  claim_token uuid,
  planilla_id uuid,
  planilla_event_id uuid,
  health jsonb
) ON COMMIT DROP;
GRANT ALL ON TABLE verify_492_context TO service_role;

CREATE TEMP TABLE verify_492_treasury_expected (
  row_id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  kind text NOT NULL,
  expected_account_id uuid,
  expected_account_code text NOT NULL,
  seen boolean NOT NULL DEFAULT false
) ON COMMIT DROP;
GRANT ALL ON TABLE verify_492_treasury_expected TO service_role;

DO $fixture$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_other_tenant uuid;
  v_planilla_id uuid := gen_random_uuid();
  v_planilla_event_id uuid := gen_random_uuid();
  v_recent_event_id uuid;
  v_run_key text := 'verify-492-' || txid_current()::text;
BEGIN
  v_demo := public.create_demo_tenant_ready_tx(
    'Verify Runtime 492', 14, 'PE', v_run_key || '-runtime', NULL, NULL, NULL, 'COMERCIO'
  );
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_other_demo := public.create_demo_tenant_ready_tx(
    'Verify Runtime 492 Other', 14, 'PE', v_run_key || '-runtime-other',
    NULL, NULL, NULL, 'COMERCIO'
  );
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  INSERT INTO verify_492_context(
    tenant_id, actor_id, other_tenant_id, other_actor_id,
    planilla_id, planilla_event_id
  ) VALUES (
    v_tenant, (v_demo->>'user_id')::uuid,
    v_other_tenant, (v_other_demo->>'user_id')::uuid,
    v_planilla_id, v_planilla_event_id
  );

  INSERT INTO public.periodos_contables(tenant_id, nombre, codigo, estado, anio, mes)
  VALUES
  (
    v_tenant, 'Verify 492', 'VERIFY-492', 'ABIERTO',
    extract(year FROM current_date)::integer,
    extract(month FROM current_date)::integer
  ),
  (
    v_other_tenant, 'Verify 492 Other', 'VERIFY-492-OTHER', 'ABIERTO',
    extract(year FROM current_date)::integer,
    extract(month FROM current_date)::integer
  )
  ON CONFLICT (tenant_id, anio, mes) WHERE tenant_id IS NOT NULL AND anio IS NOT NULL AND mes IS NOT NULL
  DO UPDATE SET estado = 'ABIERTO', fecha_cierre = NULL, cerrado_por = NULL;
  INSERT INTO public.planillas(id, tenant_id, nombre, codigo, estado, estado_pago, periodo)
  VALUES (
    v_planilla_id, v_tenant, 'Planilla Verify 492', 'PLAN-VERIFY-492',
    'aprobada', 'pendiente', to_char(current_date, 'YYYY-MM')
  );
  INSERT INTO public.asientos_contables(
    tenant_id, estado, fecha, concepto, total_debe, total_haber, source_event_id
  ) VALUES (
    v_tenant, 'CONFIRMADO', current_date, 'Verify proyección planilla 492',
    100, 100, v_planilla_event_id
  );

  INSERT INTO public.outbox_events(
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, error_message, event_id, idempotency_key,
    created_at, updated_at
  )
  SELECT
    v_tenant, 'verify', 'recent-' || g::text, 'CobroRegistrado', '{}'::jsonb,
    'failed', 1, 'recent-' || g::text, gen_random_uuid(),
    'verify-492-recent-' || g::text,
    clock_timestamp() + interval '1 day' + make_interval(secs => g),
    clock_timestamp()
  FROM generate_series(1, 11) AS g;
  SELECT event_id INTO v_recent_event_id
  FROM public.outbox_events
  WHERE tenant_id = v_tenant AND idempotency_key = 'verify-492-recent-11';
  UPDATE verify_492_context SET recent_event_id = v_recent_event_id;
END
$fixture$;

DO $treasury_fixture$
DECLARE
  v_tenant uuid;
  v_actor uuid;
  v_planilla uuid;
  v_cash_account uuid := gen_random_uuid();
  v_bank_account_a uuid := gen_random_uuid();
  v_bank_account_b uuid := gen_random_uuid();
  v_bank_a uuid := gen_random_uuid();
  v_bank_b uuid := gen_random_uuid();
  v_bank_unmapped uuid := gen_random_uuid();
  v_unmapped_movement uuid := gen_random_uuid();
  v_bank_movement_a uuid := gen_random_uuid();
  v_bank_movement_b uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_cashbox uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_cash_movement uuid := gen_random_uuid();
  v_legacy_movement uuid := gen_random_uuid();
  v_legacy_row uuid := gen_random_uuid();
  v_legacy_event uuid := gen_random_uuid();
  v_ambiguous_movement uuid := gen_random_uuid();
  v_ambiguous_row uuid := gen_random_uuid();
  v_ambiguous_event uuid := gen_random_uuid();
  v_processing_row uuid := gen_random_uuid();
  v_processing_event uuid := gen_random_uuid();
  v_liquidacion uuid := gen_random_uuid();
  v_employee uuid;
  v_cash_sequence integer;
  v_cash_previous numeric(14,2);
  v_row uuid;
  v_event uuid;
  v_fp_a text := repeat('a', 64);
  v_fp_b text := repeat('b', 64);
  v_fp_cash text := repeat('c', 64);
  v_fp_legacy text := repeat('e', 64);
BEGIN
  SELECT tenant_id, actor_id, planilla_id INTO v_tenant, v_actor, v_planilla
  FROM verify_492_context;

  INSERT INTO public.plan_cuentas(
    id, tenant_id, codigo, nombre, estado, activo, acepta_movimiento,
    tipo, tipo_cuenta, nivel
  ) VALUES
    (v_cash_account, v_tenant, '10111', 'Caja laboral verify 492',
     'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 5),
    (v_bank_account_a, v_tenant, '104101', 'Banco laboral A verify 492',
     'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 6),
    (v_bank_account_b, v_tenant, '104102', 'Banco laboral B verify 492',
     'ACTIVO', true, true, 'ACTIVO', 'ACTIVO', 6);

  INSERT INTO public.cuentas_bancarias(
    id, tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, estado, activa, activo, saldo, saldo_actual, saldo_contable,
    permite_sobregiro, cuenta_contable_id, created_by, updated_by
  ) VALUES
    (v_bank_a, v_tenant, 'Banco A Verify 492', 'BANK-A-492', 'Banco A',
     '492-000001', 'CORRIENTE', 'PEN', 'ACTIVO', true, true,
     1000, 1000, 1000, false, v_bank_account_a, v_actor, v_actor),
    (v_bank_b, v_tenant, 'Banco B Verify 492', 'BANK-B-492', 'Banco B',
     '492-000002', 'CORRIENTE', 'PEN', 'ACTIVO', true, true,
     1000, 1000, 1000, false, v_bank_account_b, v_actor, v_actor),
    (v_bank_unmapped, v_tenant, 'Banco sin cuenta Verify 492', 'BANK-NO-LEDGER-492',
     'Banco sin mapping', '492-000003', 'CORRIENTE', 'PEN', 'ACTIVO', true, true,
     1000, 1000, 1000, false, NULL, v_actor, v_actor);

  BEGIN
    INSERT INTO public.movimientos_bancarios(
      id, tenant_id, cuenta_bancaria_id, tipo, monto, monto_moneda_local,
      moneda, fecha, descripcion, referencia, metodo_pago, idempotency_key,
      conciliado, saldo_anterior, saldo_nuevo, created_by, metadata
    ) VALUES (
      v_unmapped_movement, v_tenant, v_bank_unmapped, 'CARGO', 100, 100,
      'PEN', current_date, 'Debe fallar antes del débito RRHH 492',
      'NO-LEDGER-492', 'TRANSFERENCIA', 'verify-492-unmapped-bank', false,
      1000, 900, v_actor,
      jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
        'planilla_id', v_planilla, 'fingerprint', repeat('d', 64))
    );
    RAISE EXCEPTION 'VERIFY_492_RRHH_BANK_WITHOUT_LEDGER_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.movimientos_bancarios WHERE id = v_unmapped_movement) THEN
    RAISE EXCEPTION 'VERIFY_492_RRHH_BANK_WITHOUT_LEDGER_PERSISTED';
  END IF;

  INSERT INTO public.movimientos_bancarios(
    id, tenant_id, cuenta_bancaria_id, tipo, monto, monto_moneda_local,
    moneda, fecha, descripcion, referencia, metodo_pago, idempotency_key,
    conciliado, saldo_anterior, saldo_nuevo, created_by, metadata
  ) VALUES
    (v_bank_movement_a, v_tenant, v_bank_a, 'CARGO', 100, 100, 'PEN', current_date,
     'Pago planilla banco A verify 492', 'PLAN-A-492', 'TRANSFERENCIA',
     'verify-492-plan-bank-a', false, 1000, 900, v_actor,
     jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
       'planilla_id', v_planilla, 'fingerprint', v_fp_a)),
    (v_bank_movement_b, v_tenant, v_bank_b, 'CARGO', 100, 100, 'PEN', current_date,
     'Pago planilla banco B verify 492', 'PLAN-B-492', 'TRANSFERENCIA',
     'verify-492-plan-bank-b', false, 1000, 900, v_actor,
     jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
       'planilla_id', v_planilla, 'fingerprint', v_fp_b));

  IF app.to_uuid_or_null((SELECT metadata->>'cuenta_contable_id'
                          FROM public.movimientos_bancarios WHERE id = v_bank_movement_a))
       IS DISTINCT FROM v_bank_account_a
     OR (SELECT metadata->>'ledger_frozen_by'
         FROM public.movimientos_bancarios WHERE id = v_bank_movement_a) <> '492' THEN
    RAISE EXCEPTION 'VERIFY_492_BANK_LEDGER_SNAPSHOT_NOT_FROZEN';
  END IF;

  -- El pago ya quedó comprometido con la cuenta A. Una reconfiguración entre
  -- el commit y el worker no puede mover el asiento a B ni atascar el evento.
  UPDATE public.cuentas_bancarias
  SET cuenta_contable_id = v_bank_account_b,
      activa = false, activo = false, estado = 'INACTIVO'
  WHERE id = v_bank_a AND tenant_id = v_tenant;
  UPDATE public.plan_cuentas
  SET activo = false, estado = 'INACTIVO', acepta_movimiento = false
  WHERE id = v_bank_account_a AND tenant_id = v_tenant;

  SELECT a.id INTO v_warehouse
  FROM public.almacenes a
  WHERE a.tenant_id = v_tenant AND coalesce(a.activo, true)
  ORDER BY coalesce(a.es_principal, false) DESC, a.created_at, a.id
  LIMIT 1;
  IF v_warehouse IS NULL THEN
    v_warehouse := gen_random_uuid();
    INSERT INTO public.almacenes(id, tenant_id, codigo, nombre, estado, activo, es_principal, pais)
    VALUES (v_warehouse, v_tenant, 'ALM-TREAS-492', 'Almacén tesorería 492',
            'ACTIVO', true, true, 'PE');
  END IF;
  SELECT s.id INTO v_session
  FROM public.sesiones_caja s
  WHERE s.tenant_id = v_tenant AND s.cajero_id = v_actor
    AND lower(s.estado::text) = 'abierta'
  ORDER BY s.created_at, s.id LIMIT 1;
  IF v_session IS NULL THEN
    v_session := gen_random_uuid();
    INSERT INTO public.cajas(id, tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por)
    VALUES (v_cashbox, v_tenant, 'CAJA-TREAS-492', 'Caja tesorería 492',
            'ACTIVO', v_warehouse, 'MOSTRADOR', v_actor);
    INSERT INTO public.sesiones_caja(
      id, tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
      usuario_apertura, estado, hora_apertura, fecha_apertura,
      monto_inicial, monto_inicio, monto_esperado, monto_contado,
      monto_cierre, total_efectivo, total_tarjeta, moneda
    ) VALUES (
      v_session, v_tenant, v_cashbox, v_actor, v_actor, v_actor, v_actor,
      'ABIERTA', now(), now(), 1000, 1000, 1000, 0, 0, 1000, 0, 'PEN'
    );
  END IF;
  SELECT coalesce(max(mc.secuencia), 0) + 1 INTO v_cash_sequence
  FROM public.movimientos_caja mc
  WHERE mc.tenant_id = v_tenant AND mc.sesion_caja_id = v_session;
  SELECT coalesce(
    (SELECT mc.saldo_nuevo FROM public.movimientos_caja mc
     WHERE mc.tenant_id = v_tenant AND mc.sesion_caja_id = v_session
     ORDER BY mc.secuencia DESC, mc.created_at DESC LIMIT 1),
    (SELECT coalesce(s.monto_inicial, s.monto_inicio, 1000)
     FROM public.sesiones_caja s WHERE s.id = v_session),
    1000
  ) INTO v_cash_previous;
  INSERT INTO public.movimientos_caja(
    id, tenant_id, sesion_caja_id, secuencia, tipo_movimiento, monto,
    saldo_anterior, saldo_nuevo, referencia_documento, referencia_tipo,
    motivo, usuario_id, "timestamp", metadata
  ) VALUES (
    v_cash_movement, v_tenant, v_session, v_cash_sequence, 'RETIRO', -100,
    v_cash_previous, v_cash_previous - 100, v_planilla::text, 'rrhh_planilla_pago',
    'Pago planilla caja verify 492', v_actor, now(),
    jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
      'planilla_id', v_planilla, 'fingerprint', v_fp_cash)
  );

  -- Dos bancos distintos y efectivo deben producir tres cuentas distintas.
  FOREACH v_event IN ARRAY ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] LOOP
    v_row := gen_random_uuid();
    IF NOT EXISTS (SELECT 1 FROM verify_492_treasury_expected) THEN
      INSERT INTO public.outbox_events(
        id, event_id, tenant_id, aggregate_type, aggregate_id, event_type,
        payload, status, retry_count, idempotency_key, occurred_at
      ) VALUES (
        v_row, v_event, v_tenant, 'planilla', v_planilla::text, 'planilla.pagada',
        jsonb_build_object(
          'eventId', v_event, 'tenantId', v_tenant, 'planillaId', v_planilla,
          'totalPagado', 100, 'metodoPago', 'transferencia', 'moneda', 'PEN',
          'cuentaBancariaId', v_bank_a, 'movimientoBancarioId', v_bank_movement_a,
          'treasuryFingerprint', v_fp_a, 'accountingHandledByOutbox', true
        ), 'pending', 0, 'verify-492-treasury-bank-a', now()
      );
      INSERT INTO verify_492_treasury_expected VALUES
        (v_row, v_event, 'bank-a', v_bank_account_a, '104101', false);
    ELSIF (SELECT count(*) FROM verify_492_treasury_expected) = 1 THEN
      INSERT INTO public.outbox_events(
        id, event_id, tenant_id, aggregate_type, aggregate_id, event_type,
        payload, status, retry_count, idempotency_key, occurred_at
      ) VALUES (
        v_row, v_event, v_tenant, 'planilla', v_planilla::text, 'planilla.pagada',
        jsonb_build_object(
          'eventId', v_event, 'tenantId', v_tenant, 'planillaId', v_planilla,
          'totalPagado', 100, 'metodoPago', 'transferencia', 'moneda', 'PEN',
          'cuentaBancariaId', v_bank_b, 'movimientoBancarioId', v_bank_movement_b,
          'treasuryFingerprint', v_fp_b, 'accountingHandledByOutbox', true
        ), 'pending', 0, 'verify-492-treasury-bank-b', now() + interval '1 millisecond'
      );
      INSERT INTO verify_492_treasury_expected VALUES
        (v_row, v_event, 'bank-b', v_bank_account_b, '104102', false);
    ELSE
      INSERT INTO public.outbox_events(
        id, event_id, tenant_id, aggregate_type, aggregate_id, event_type,
        payload, status, retry_count, idempotency_key, occurred_at
      ) VALUES (
        v_row, v_event, v_tenant, 'planilla', v_planilla::text, 'planilla.pagada',
        jsonb_build_object(
          'eventId', v_event, 'tenantId', v_tenant, 'planillaId', v_planilla,
          'totalPagado', 100, 'metodoPago', 'efectivo', 'moneda', 'PEN',
          'sesionCajaId', v_session, 'movimientoCajaId', v_cash_movement,
          'treasuryFingerprint', v_fp_cash, 'accountingHandledByOutbox', true
        ), 'pending', 0, 'verify-492-treasury-cash', now() + interval '2 milliseconds'
      );
      INSERT INTO verify_492_treasury_expected VALUES
        (v_row, v_event, 'cash', v_cash_account, '10111', false);
    END IF;
  END LOOP;

  -- Simula exactamente el corte de upgrade: movimiento y outbox existían antes
  -- de 492, por lo que no pasaron por el trigger que congela la cuenta.
  ALTER TABLE public.movimientos_bancarios
    DISABLE TRIGGER trg_freeze_rrhh_bank_ledger_492;
  INSERT INTO public.movimientos_bancarios(
    id, tenant_id, cuenta_bancaria_id, tipo, monto, monto_moneda_local,
    moneda, fecha, descripcion, referencia, metodo_pago, idempotency_key,
    conciliado, saldo_anterior, saldo_nuevo, created_by, metadata
  ) VALUES (
    v_legacy_movement, v_tenant, v_bank_b, 'CARGO', 75, 75, 'PEN', current_date,
    'Pago planilla legacy pre-492', 'PLAN-LEGACY-492', 'TRANSFERENCIA',
    'verify-492-plan-bank-legacy', false, 900, 825, v_actor,
    jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
      'planilla_id', v_planilla, 'fingerprint', v_fp_legacy,
      'cuenta_contable_id', v_bank_account_b,
      'cuenta_contable_codigo', '104102')
  );
  ALTER TABLE public.movimientos_bancarios
    ENABLE TRIGGER trg_freeze_rrhh_bank_ledger_492;
  INSERT INTO public.outbox_events(
    id, event_id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, retry_count, idempotency_key, occurred_at
  ) VALUES (
    v_legacy_row, v_legacy_event, v_tenant, 'planilla', v_planilla::text,
    'planilla.pagada', jsonb_build_object(
      'eventId', v_legacy_event, 'tenantId', v_tenant, 'planillaId', v_planilla,
      'totalPagado', 75, 'metodoPago', 'transferencia', 'moneda', 'PEN',
      'cuentaBancariaId', v_bank_b, 'movimientoBancarioId', v_legacy_movement,
      'paymentFingerprint', v_fp_legacy, 'accountingHandledByOutbox', true
    ), 'pending', 0, 'verify-492-treasury-bank-legacy', now() + interval '3 milliseconds'
  );
  INSERT INTO verify_492_treasury_expected VALUES
    (v_legacy_row, v_legacy_event, 'bank-legacy', v_bank_account_b, '104102', false);

  -- Un claim heredado processing también debe recibir el snapshot de
  -- componentes sin perder su token/estado.
  SELECT e.id INTO v_employee
  FROM public.empleados e
  WHERE e.tenant_id = v_tenant
  ORDER BY e.created_at, e.id LIMIT 1;
  INSERT INTO public.liquidaciones(
    id, tenant_id, nombre, codigo, estado, id_empleado, fecha_terminacion,
    monto_cts, vacaciones_pendientes, indemnizacion, dias_cts,
    total_liquidacion, pais_codigo, moneda, metadata
  ) VALUES (
    v_liquidacion, v_tenant, 'Liquidación upgrade 492', 'LIQ-UPGRADE-492',
    'aprobada', v_employee, current_date, 20, 0, 10, 0, 100, 'PE', 'PEN', '{}'::jsonb
  );
  ALTER TABLE public.outbox_events
    DISABLE TRIGGER trg_freeze_liquidacion_components_492;
  INSERT INTO public.outbox_events(
    id, event_id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, retry_count, idempotency_key, occurred_at,
    claimed_by, claim_token, claimed_at, last_heartbeat_at
  ) VALUES (
    v_processing_row, v_processing_event, v_tenant, 'liquidacion',
    v_liquidacion::text, 'liquidacion.aprobada', jsonb_build_object(
      'eventId', v_processing_event, 'tenantId', v_tenant,
      'liquidacionId', v_liquidacion, 'totalLiquidacion', 100,
      'accountingHandledByOutbox', true
    ), 'processing', 0, 'verify-492-components-processing', now(),
    'legacy-worker', gen_random_uuid(), now(), now()
  );
  ALTER TABLE public.outbox_events
    ENABLE TRIGGER trg_freeze_liquidacion_components_492;

  PERFORM app.backfill_labor_outbox_492();
  IF app.to_uuid_or_null((SELECT metadata->>'cuenta_contable_id'
                          FROM public.movimientos_bancarios WHERE id = v_legacy_movement))
       IS DISTINCT FROM v_bank_account_b
     OR (SELECT metadata->>'ledger_frozen_by'
         FROM public.movimientos_bancarios WHERE id = v_legacy_movement) <> '492'
     OR (SELECT payload->>'treasuryFingerprint'
         FROM public.outbox_events WHERE id = v_legacy_row) <> v_fp_legacy
     OR coalesce((SELECT (payload->>'accountingHandledByOutbox')::boolean
                  FROM public.outbox_events WHERE id = v_legacy_row), false) IS DISTINCT FROM true
     OR (SELECT status FROM public.outbox_events WHERE id = v_processing_row) <> 'processing'
     OR (SELECT payload #>> '{componentesLiquidacion,version}'
         FROM public.outbox_events WHERE id = v_processing_row) <> '492'
     OR (SELECT payload #>> '{componentesLiquidacion,beneficiosSociales}'
         FROM public.outbox_events WHERE id = v_processing_row) <> '30.00' THEN
    RAISE EXCEPTION 'VERIFY_492_UPGRADE_BACKFILL_INCOMPLETE';
  END IF;

  -- Un movimiento sin snapshot no autoriza usar el mapping bancario actual:
  -- éste puede haber cambiado después del pago y exige regularización humana.
  ALTER TABLE public.movimientos_bancarios
    DISABLE TRIGGER trg_freeze_rrhh_bank_ledger_492;
  INSERT INTO public.movimientos_bancarios(
    id, tenant_id, cuenta_bancaria_id, tipo, monto, monto_moneda_local,
    moneda, fecha, descripcion, referencia, metodo_pago, idempotency_key,
    conciliado, saldo_anterior, saldo_nuevo, created_by, metadata
  ) VALUES (
    v_ambiguous_movement, v_tenant, v_bank_b, 'CARGO', 60, 60, 'PEN', current_date,
    'Pago sin snapshot pre-492', 'PLAN-AMBIGUOUS-492', 'TRANSFERENCIA',
    'verify-492-plan-bank-ambiguous', false, 825, 765, v_actor,
    jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
      'planilla_id', v_planilla, 'fingerprint', repeat('f', 64))
  );
  ALTER TABLE public.movimientos_bancarios
    ENABLE TRIGGER trg_freeze_rrhh_bank_ledger_492;
  INSERT INTO public.outbox_events(
    id, event_id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, retry_count, idempotency_key, occurred_at
  ) VALUES (
    v_ambiguous_row, v_ambiguous_event, v_tenant, 'planilla', v_planilla::text,
    'planilla.pagada', jsonb_build_object(
      'eventId', v_ambiguous_event, 'tenantId', v_tenant, 'planillaId', v_planilla,
      'totalPagado', 60, 'metodoPago', 'transferencia', 'moneda', 'PEN',
      'cuentaBancariaId', v_bank_b, 'movimientoBancarioId', v_ambiguous_movement,
      'paymentFingerprint', repeat('f', 64), 'accountingHandledByOutbox', true
    ), 'pending', 0, 'verify-492-treasury-bank-ambiguous', now()
  );
  BEGIN
    PERFORM app.backfill_labor_outbox_492();
    RAISE EXCEPTION 'VERIFY_492_AMBIGUOUS_UPGRADE_WAS_GUESSED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'OUTBOX_492_BACKFILL_BANK_REGULARIZATION_REQUIRED:%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT metadata ? 'ledger_frozen_by'
      FROM public.movimientos_bancarios WHERE id = v_ambiguous_movement) THEN
    RAISE EXCEPTION 'VERIFY_492_AMBIGUOUS_UPGRADE_LEFT_PARTIAL_SNAPSHOT';
  END IF;
  DELETE FROM public.outbox_events WHERE id = v_ambiguous_row;
  DELETE FROM public.movimientos_bancarios WHERE id = v_ambiguous_movement;
END
$treasury_fixture$;

DO $acl$
DECLARE
  v_signature text;
BEGIN
  IF NOT has_table_privilege('service_role', 'public.outbox_events', 'SELECT')
     OR has_table_privilege('service_role', 'public.outbox_events', 'INSERT')
     OR has_table_privilege('service_role', 'public.outbox_events', 'UPDATE')
     OR has_table_privilege('service_role', 'public.outbox_events', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_492_OUTBOX_TABLE_ACL_INVALID';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.notificaciones', 'SELECT')
     OR has_table_privilege('service_role', 'public.notificaciones', 'INSERT')
     OR has_table_privilege('service_role', 'public.notificaciones', 'UPDATE')
     OR has_table_privilege('service_role', 'public.notificaciones', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_492_NOTIFICATIONS_TABLE_ACL_INVALID';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.enqueue_outbox_event_tx(jsonb)',
    'public.claim_outbox_events_tx(text,integer,text[],text[],uuid,integer)',
    'public.heartbeat_outbox_event_tx(uuid,uuid)',
    'public.complete_outbox_event_tx(uuid,uuid)',
    'public.fail_outbox_event_tx(uuid,uuid,text,timestamptz,integer)',
    'public.dead_letter_outbox_event_tx(uuid,uuid,text)',
    'public.reset_stuck_outbox_events_tx(timestamptz,integer)',
    'public.reset_outbox_event_tx(uuid,uuid,uuid,text,integer)',
    'public.list_outbox_events_492(uuid,text[],text,uuid,integer,integer)',
    'public.list_tenant_outbox_events_492(uuid,uuid,text[],integer)',
    'public.outbox_tenant_stats_492(uuid,uuid)',
    'public.marcar_planilla_contabilizada_tx_492(uuid,uuid,uuid,uuid)',
    'public.resolver_cuenta_tesoreria_laboral_492(uuid,uuid,uuid)',
    'public.outbox_runtime_health_492(integer,integer,integer,integer,integer)',
    'public.gestionar_notificacion_tx(uuid,uuid,text,jsonb)'
  ] LOOP
    IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE')
       OR has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'VERIFY_492_RPC_ACL_INVALID:%', v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('service_role', 'public.mark_outbox_event_processing(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.mark_outbox_event_completed(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.mark_outbox_event_failed(uuid,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_492_LEGACY_WRITER_STILL_EXPOSED';
  END IF;
  IF has_function_privilege('service_role', 'app.freeze_rrhh_bank_ledger_492()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.freeze_rrhh_cash_ledger_492()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.freeze_rrhh_liquidation_cash_ledger_492()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.freeze_liquidacion_components_492()', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.freeze_legacy_bank_movement_492(uuid,uuid,uuid,text,numeric,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.freeze_legacy_cash_movement_492(uuid,uuid,uuid,uuid,text,numeric,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.assert_outbox_tenant_actor_492(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.is_accounting_owned_outbox_event_492(text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.backfill_labor_outbox_492()', 'EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.movimientos_bancarios'::regclass
         AND tgname = 'trg_freeze_rrhh_bank_ledger_492'
         AND tgenabled <> 'D'
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.movimientos_caja'::regclass
         AND tgname = 'trg_freeze_rrhh_cash_ledger_492'
         AND tgenabled <> 'D'
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.pagos_liquidaciones'::regclass
         AND tgname = 'trg_freeze_rrhh_liquidation_cash_ledger_492'
         AND tgenabled <> 'D'
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.outbox_events'::regclass
         AND tgname = 'trg_freeze_liquidacion_components_492'
         AND tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'VERIFY_492_RRHH_BANK_LEDGER_GUARD_INVALID';
  END IF;
END
$acl$;

SET LOCAL ROLE service_role;

DO $runtime$
DECLARE
  v_tenant uuid;
  v_actor uuid;
  v_other_tenant uuid;
  v_other_actor uuid;
  v_enqueued jsonb;
  v_other_enqueued jsonb;
  v_non_accounting_enqueued jsonb;
  v_recent_event_id uuid;
  v_claim public.outbox_events%ROWTYPE;
  v_claim_again public.outbox_events%ROWTYPE;
  v_result jsonb;
  v_notification jsonb;
  v_before text;
  v_after text;
  v_health jsonb;
  v_unready_health jsonb;
  v_count integer;
  v_planilla_id uuid;
  v_planilla_event_id uuid;
  v_planilla_event jsonb;
  v_planilla_claim public.outbox_events%ROWTYPE;
  v_treasury_claim public.outbox_events%ROWTYPE;
  v_treasury_result jsonb;
  v_treasury_expected record;
  v_treasury_iteration integer;
BEGIN
  SELECT tenant_id, actor_id, other_tenant_id, other_actor_id,
         planilla_id, planilla_event_id, recent_event_id
  INTO v_tenant, v_actor, v_other_tenant, v_other_actor,
       v_planilla_id, v_planilla_event_id, v_recent_event_id
  FROM verify_492_context;

  v_enqueued := public.enqueue_outbox_event_tx(jsonb_build_object(
    'tenant_id', v_tenant,
    'event_type', 'verify.runtime.492',
    'aggregate_type', 'verify',
    'aggregate_id', 'primary',
    'idempotency_key', 'verify-492-primary',
    'payload', jsonb_build_object('actor_id', v_actor)
  ));
  UPDATE verify_492_context
  SET event_id = (v_enqueued->>'event_id')::uuid,
      event_row_id = (v_enqueued->>'id')::uuid;

  -- La superficie administrativa nunca mezcla empresas y revalida al actor
  -- incluso cuando el caller tecnico usa service_role.
  v_other_enqueued := public.enqueue_outbox_event_tx(jsonb_build_object(
    'tenant_id', v_other_tenant,
    'event_type', 'FacturaEmitida',
    'aggregate_type', 'verify',
    'aggregate_id', 'other-tenant',
    'idempotency_key', 'verify-492-other-tenant',
    'payload', jsonb_build_object('actor_id', v_other_actor)
  ));
  SELECT * INTO v_claim FROM public.claim_outbox_events_tx(
    'verify-worker-other', 1, ARRAY['FacturaEmitida'], NULL, v_other_tenant, 1
  );
  v_result := public.fail_outbox_event_tx(
    v_claim.id, v_claim.claim_token, 'other tenant terminal', NULL, 1
  );
  IF v_result->>'status' <> 'dead_letter' THEN
    RAISE EXCEPTION 'VERIFY_492_OTHER_TENANT_FIXTURE_FAILED:%', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_tenant_outbox_events_492(
      v_tenant, v_actor, ARRAY['pending','failed','dead_letter','completed'], 1000
    ) e WHERE e.event_id = (v_other_enqueued->>'event_id')::uuid
  ) OR (public.outbox_tenant_stats_492(v_tenant, v_actor)->'por_tipo')
         ? 'FacturaEmitida' THEN
    RAISE EXCEPTION 'VERIFY_492_TENANT_READ_LEAKED_OTHER_COMPANY';
  END IF;
  BEGIN
    PERFORM 1 FROM public.list_tenant_outbox_events_492(
      v_tenant, v_other_actor, ARRAY['pending'], 10
    );
    RAISE EXCEPTION 'VERIFY_492_CROSS_TENANT_ACTOR_READ_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Un evento sensible de otro worker dentro de la misma empresa tampoco se
  -- expone ni se puede reactivar desde el permiso contable.
  v_non_accounting_enqueued := public.enqueue_outbox_event_tx(jsonb_build_object(
    'tenant_id', v_tenant,
    'event_type', 'email.send',
    'aggregate_type', 'email',
    'aggregate_id', 'sensitive-message',
    'idempotency_key', 'verify-492-sensitive-email',
    'payload', jsonb_build_object(
      'to', 'sensitive@temp.local',
      'html', '<p>contenido privado</p>',
      'attachments', jsonb_build_array(jsonb_build_object('content', 'BASE64-SENSITIVE'))
    )
  ));
  SELECT * INTO v_claim
  FROM public.claim_outbox_events_tx(
    'verify-worker-email', 100, ARRAY['email.send'], NULL, v_tenant, 1
  ) AS claimed
  WHERE claimed.id = (v_non_accounting_enqueued->>'id')::uuid;
  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION 'VERIFY_492_EMAIL_FIXTURE_NOT_CLAIMED';
  END IF;
  v_result := public.fail_outbox_event_tx(
    v_claim.id, v_claim.claim_token, 'email terminal', NULL, 1
  );
  IF EXISTS (
    SELECT 1 FROM public.list_tenant_outbox_events_492(
      v_tenant, v_actor, ARRAY['dead_letter'], 1000
    ) e WHERE e.event_id = (v_non_accounting_enqueued->>'event_id')::uuid
  ) OR (public.outbox_tenant_stats_492(v_tenant, v_actor)->'por_tipo')
         ? 'email.send' THEN
    RAISE EXCEPTION 'VERIFY_492_NON_ACCOUNTING_EVENT_EXPOSED';
  END IF;
  v_result := public.reset_outbox_event_tx(
    v_tenant, v_actor, (v_non_accounting_enqueued->>'event_id')::uuid,
    'forbidden email retry', 3
  );
  IF coalesce((v_result->>'updated')::boolean, true)
     OR NOT EXISTS (
       SELECT 1 FROM public.list_outbox_events_492(
         v_tenant, ARRAY['dead_letter'], NULL,
         (v_non_accounting_enqueued->>'event_id')::uuid, 1, NULL
       ) e
       WHERE e.id = (v_non_accounting_enqueued->>'id')::uuid
     ) THEN
    RAISE EXCEPTION 'VERIFY_492_NON_ACCOUNTING_RESET_MUTATED_EVENT:%',
      v_result || jsonb_build_object(
        'enqueued', v_non_accounting_enqueued,
        'stored_status', (
          SELECT e.status FROM public.list_outbox_events_492(
            v_tenant, ARRAY['pending','failed','dead_letter','completed'], NULL,
            (v_non_accounting_enqueued->>'event_id')::uuid, 1, NULL
          ) e
          WHERE e.id = (v_non_accounting_enqueued->>'id')::uuid
        )
      );
  END IF;

  -- Repetir la misma intención no duplica; cambiar identidad con la misma key sí falla.
  IF (public.enqueue_outbox_event_tx(jsonb_build_object(
    'tenant_id', v_tenant, 'event_type', 'verify.runtime.492',
    'aggregate_type', 'verify', 'aggregate_id', 'primary',
    'idempotency_key', 'verify-492-primary', 'payload', '{}'::jsonb
  ))->>'idempotent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_492_ENQUEUE_NOT_IDEMPOTENT';
  END IF;

  SELECT * INTO v_claim FROM public.claim_outbox_events_tx(
    'verify-worker-a', 1, ARRAY['verify.runtime.492'], NULL, v_tenant, 3
  );
  IF v_claim.id IS NULL OR v_claim.claim_token IS NULL OR v_claim.claimed_by <> 'verify-worker-a' THEN
    RAISE EXCEPTION 'VERIFY_492_CLAIM_INCOMPLETE';
  END IF;
  UPDATE verify_492_context SET claim_token = v_claim.claim_token;

  SELECT * INTO v_claim_again FROM public.claim_outbox_events_tx(
    'verify-worker-b', 1, ARRAY['verify.runtime.492'], NULL, v_tenant, 3
  );
  IF v_claim_again.id IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_492_DOUBLE_CLAIM_ALLOWED';
  END IF;
  IF public.complete_outbox_event_tx(v_claim.id, gen_random_uuid()) THEN
    RAISE EXCEPTION 'VERIFY_492_WRONG_TOKEN_COMPLETED';
  END IF;

  v_result := public.fail_outbox_event_tx(
    v_claim.id, v_claim.claim_token, 'verify p_error 492', clock_timestamp(), 3
  );
  IF v_result->>'status' <> 'failed' OR (v_result->>'retry_count')::integer <> 1 THEN
    RAISE EXCEPTION 'VERIFY_492_FAIL_TRANSITION_INVALID:%', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_outbox_events_492(
      v_tenant, ARRAY['failed'], NULL, v_claim.event_id, 1, NULL
    ) e
    WHERE e.id = v_claim.id
      AND e.error_message = 'verify p_error 492' AND e.retry_count = 1
  ) THEN
    RAISE EXCEPTION 'VERIFY_492_P_ERROR_NOT_PERSISTED';
  END IF;

  SELECT * INTO v_claim FROM public.claim_outbox_events_tx(
    'verify-worker-c', 1, ARRAY['verify.runtime.492'], NULL, v_tenant, 3
  );
  IF NOT public.complete_outbox_event_tx(v_claim.id, v_claim.claim_token) THEN
    RAISE EXCEPTION 'VERIFY_492_COMPLETE_FAILED';
  END IF;
  v_result := public.fail_outbox_event_tx(
    v_claim.id, v_claim.claim_token, 'late failure', clock_timestamp(), 3
  );
  IF coalesce((v_result->>'updated')::boolean, true) THEN
    RAISE EXCEPTION 'VERIFY_492_LATE_FAILURE_DOWNGRADED_COMPLETED';
  END IF;

  -- Reset de claim vencido sin escrituras DML desde el worker.
  v_enqueued := public.enqueue_outbox_event_tx(jsonb_build_object(
    'tenant_id', v_tenant, 'event_type', 'verify.runtime.stuck',
    'aggregate_type', 'verify', 'aggregate_id', 'stuck',
    'idempotency_key', 'verify-492-stuck', 'payload', '{}'::jsonb
  ));
  SELECT * INTO v_claim FROM public.claim_outbox_events_tx(
    'verify-worker-stuck', 1, ARRAY['verify.runtime.stuck'], NULL, v_tenant, 3
  );
  IF public.reset_stuck_outbox_events_tx(clock_timestamp() + interval '1 minute', 10) < 1 THEN
    RAISE EXCEPTION 'VERIFY_492_STUCK_RESET_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_outbox_events_492(
      v_tenant, ARRAY['pending'], NULL, v_claim.event_id, 1, NULL
    ) e WHERE e.id = v_claim.id
  ) THEN
    RAISE EXCEPTION 'VERIFY_492_STUCK_NOT_PENDING';
  END IF;

  -- Dead-letter y reset manual acotado.
  v_enqueued := public.enqueue_outbox_event_tx(jsonb_build_object(
    'tenant_id', v_tenant, 'event_type', 'stock.movimiento',
    'aggregate_type', 'verify', 'aggregate_id', 'manual',
    'idempotency_key', 'verify-492-manual', 'payload', '{}'::jsonb
  ));
  SELECT * INTO v_claim FROM public.claim_outbox_events_tx(
    'verify-worker-manual', 1, ARRAY['stock.movimiento'], NULL, v_tenant, 1
  );
  v_result := public.fail_outbox_event_tx(
    v_claim.id, v_claim.claim_token, 'terminal', NULL, 1
  );
  IF v_result->>'status' <> 'dead_letter' THEN
    RAISE EXCEPTION 'VERIFY_492_DEAD_LETTER_FAILED:%', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_tenant_outbox_events_492(
      v_tenant, v_actor, ARRAY['dead_letter'], 1000
    ) e WHERE e.event_id = (v_enqueued->>'event_id')::uuid
  ) THEN
    RAISE EXCEPTION 'VERIFY_492_ACCOUNTING_OWNED_OPERATIONAL_EVENT_HIDDEN';
  END IF;
  v_result := public.reset_outbox_event_tx(
    v_other_tenant, v_other_actor, (v_enqueued->>'event_id')::uuid,
    'cross tenant retry', 3
  );
  IF coalesce((v_result->>'updated')::boolean, true)
     OR NOT EXISTS (
       SELECT 1 FROM public.list_outbox_events_492(
         v_tenant, ARRAY['dead_letter'], NULL,
         (v_enqueued->>'event_id')::uuid, 1, NULL
       ) e WHERE e.id = (v_enqueued->>'id')::uuid
     ) THEN
    RAISE EXCEPTION 'VERIFY_492_CROSS_TENANT_RESET_MUTATED_EVENT:%', v_result;
  END IF;
  BEGIN
    PERFORM public.reset_outbox_event_tx(
      v_tenant, v_other_actor, (v_enqueued->>'event_id')::uuid,
      'wrong actor retry', 3
    );
    RAISE EXCEPTION 'VERIFY_492_CROSS_TENANT_ACTOR_RESET_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_result := public.reset_outbox_event_tx(
    v_tenant, v_actor, (v_enqueued->>'event_id')::uuid,
    'verify manual retry', 3
  );
  IF coalesce((v_result->>'updated')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_492_MANUAL_RESET_FAILED:%', v_result;
  END IF;

  -- El monitor devuelve primero la incidencia mas reciente antes de aplicar
  -- LIMIT; ordenar luego en la UI no puede recuperar una fila ya recortada.
  IF v_recent_event_id IS DISTINCT FROM (
    SELECT e.event_id FROM public.list_tenant_outbox_events_492(
      v_tenant, v_actor, ARRAY['failed'], 1
    ) e
  ) THEN
    RAISE EXCEPTION 'VERIFY_492_MONITOR_DID_NOT_RETURN_NEWEST_EVENT';
  END IF;

  -- Writer de notificaciones: create/read/delete, sin DML directo.
  v_notification := public.gestionar_notificacion_tx(
    v_tenant, v_actor, 'CREATE', jsonb_build_object(
      'usuario_id', v_actor, 'tipo', 'system', 'severidad', 'info',
      'titulo', 'Verify 492', 'mensaje', 'Writer único'
    )
  );
  v_notification := public.gestionar_notificacion_tx(
    v_tenant, v_actor, 'MARK_READ',
    jsonb_build_object('notification_id', v_notification->>'id')
  );
  IF coalesce((v_notification->>'leida')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_492_NOTIFICATION_MARK_READ_FAILED';
  END IF;
  PERFORM public.gestionar_notificacion_tx(
    v_tenant, v_actor, 'DELETE',
    jsonb_build_object('notification_id', v_notification->>'id')
  );

  -- La proyección de nómina requiere claim y asiento durable; service_role no
  -- puede sustituirla por UPDATE directo sobre planillas.
  v_planilla_event := public.enqueue_outbox_event_tx(jsonb_build_object(
    'event_id', v_planilla_event_id,
    'tenant_id', v_tenant, 'event_type', 'planilla.liquidada',
    'aggregate_type', 'planilla', 'aggregate_id', v_planilla_id,
    'idempotency_key', 'verify-492-planilla-projection',
    'payload', jsonb_build_object(
      'planillaId', v_planilla_id, 'fecha', current_date,
      'totalIngresos', 100, 'totalDescuentos', 20,
      'totalAportes', 10, 'totalNeto', 80
    )
  ));
  SELECT * INTO v_planilla_claim FROM public.claim_outbox_events_tx(
    'verify-worker-planilla', 1, ARRAY['planilla.liquidada'], NULL, v_tenant, 3
  );
  v_result := public.marcar_planilla_contabilizada_tx_492(
    v_tenant, v_planilla_id, (v_planilla_event->>'event_id')::uuid,
    v_planilla_claim.claim_token
  );
  IF coalesce((v_result->>'updated')::boolean, false) IS DISTINCT FROM true
     OR NOT EXISTS (
       SELECT 1 FROM public.planillas
       WHERE id = v_planilla_id AND asientos_generados = 'true' AND fecha_asientos IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'VERIFY_492_PAYROLL_PROJECTION_FAILED:%', v_result;
  END IF;
  BEGIN
    PERFORM public.marcar_planilla_contabilizada_tx_492(
      v_tenant, v_planilla_id, (v_planilla_event->>'event_id')::uuid, gen_random_uuid()
    );
    RAISE EXCEPTION 'VERIFY_492_PAYROLL_PROJECTION_ACCEPTED_WRONG_CLAIM';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Dos bancos con mappings distintos y efectivo conservan exactamente su
  -- cuenta; el resolver sólo admite la fila bajo su claim vigente.
  FOR v_treasury_iteration IN 1..4 LOOP
    SELECT * INTO v_treasury_claim FROM public.claim_outbox_events_tx(
      'verify-worker-treasury', 1, ARRAY['planilla.pagada'], NULL, v_tenant, 3
    );
    IF v_treasury_claim.id IS NULL OR v_treasury_claim.claim_token IS NULL THEN
      RAISE EXCEPTION 'VERIFY_492_TREASURY_CLAIM_MISSING:%', v_treasury_iteration;
    END IF;
    SELECT * INTO v_treasury_expected
    FROM verify_492_treasury_expected e WHERE e.row_id = v_treasury_claim.id;
    IF v_treasury_expected.row_id IS NULL THEN
      RAISE EXCEPTION 'VERIFY_492_TREASURY_UNEXPECTED_ROW:%', v_treasury_claim.id;
    END IF;

    v_treasury_result := public.resolver_cuenta_tesoreria_laboral_492(
      v_tenant, v_treasury_claim.id, v_treasury_claim.claim_token
    );
    IF nullif(v_treasury_result->>'cuenta_tesoreria_id', '')::uuid
         IS DISTINCT FROM v_treasury_expected.expected_account_id
       OR v_treasury_result->>'cuenta_tesoreria_codigo'
          IS DISTINCT FROM v_treasury_expected.expected_account_code
       OR (v_treasury_expected.kind = 'cash' AND v_treasury_result->>'metodo_pago' <> 'efectivo')
       OR (v_treasury_expected.kind <> 'cash' AND v_treasury_result->>'metodo_pago' <> 'transferencia') THEN
      RAISE EXCEPTION 'VERIFY_492_TREASURY_LEDGER_NOT_PRESERVED:%:%',
        v_treasury_expected.kind, v_treasury_result;
    END IF;
    BEGIN
      PERFORM public.resolver_cuenta_tesoreria_laboral_492(
        v_tenant, v_treasury_claim.id, gen_random_uuid()
      );
      RAISE EXCEPTION 'VERIFY_492_TREASURY_WRONG_CLAIM_ACCEPTED';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF NOT public.complete_outbox_event_tx(v_treasury_claim.id, v_treasury_claim.claim_token) THEN
      RAISE EXCEPTION 'VERIFY_492_TREASURY_COMPLETE_FAILED:%', v_treasury_claim.id;
    END IF;
    UPDATE verify_492_treasury_expected SET seen = true WHERE row_id = v_treasury_claim.id;
  END LOOP;
  IF (SELECT count(*) FROM verify_492_treasury_expected WHERE seen) <> 4
     OR (SELECT count(DISTINCT expected_account_id) FROM verify_492_treasury_expected) <> 3 THEN
    RAISE EXCEPTION 'VERIFY_492_TREASURY_MATRIX_INCOMPLETE';
  END IF;

  -- Readiness es pasivo: mismo conjunto, estado y updated_at antes/después.
  SELECT md5(coalesce(string_agg(
    id::text || ':' || status::text || ':' || updated_at::text, ',' ORDER BY id
  ), '')) INTO v_before
  FROM public.list_outbox_events_492(
    v_tenant, ARRAY['pending','processing','completed','failed','dead_letter'],
    NULL, NULL, 500, NULL
  );
  v_health := public.outbox_runtime_health_492(5000, 900, 100, 900, 492);
  v_unready_health := public.outbox_runtime_health_492(5000, 900, 100, 900, 999999);
  SELECT md5(coalesce(string_agg(
    id::text || ':' || status::text || ':' || updated_at::text, ',' ORDER BY id
  ), '')) INTO v_after
  FROM public.list_outbox_events_492(
    v_tenant, ARRAY['pending','processing','completed','failed','dead_letter'],
    NULL, NULL, 500, NULL
  );
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'VERIFY_492_READINESS_MUTATED_OUTBOX';
  END IF;
  IF v_health->>'database' <> 'ok'
     OR coalesce((v_health #>> '{contract,outbox_rpcs}')::boolean, false) IS DISTINCT FROM true
     OR coalesce((v_health #>> '{contract,required_schema_applied}')::boolean, false) IS DISTINCT FROM true
     OR coalesce((v_unready_health->>'ready')::boolean, true) IS DISTINCT FROM false
     OR coalesce((v_unready_health #>> '{contract,required_schema_applied}')::boolean, true) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'VERIFY_492_READINESS_CONTRACT_FAILED:%', v_health;
  END IF;
  UPDATE verify_492_context SET health = v_health;

  BEGIN
    INSERT INTO public.outbox_events(tenant_id, event_type) VALUES (v_tenant, 'forbidden');
    RAISE EXCEPTION 'VERIFY_492_DIRECT_OUTBOX_INSERT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.notificaciones SET leida = true WHERE tenant_id = v_tenant;
    RAISE EXCEPTION 'VERIFY_492_DIRECT_NOTIFICATION_UPDATE_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_count FROM public.list_outbox_events_492(
    v_tenant, ARRAY['pending','completed','failed','dead_letter'], NULL, NULL, 100, NULL
  );
  IF v_count < 3 THEN
    RAISE EXCEPTION 'VERIFY_492_PASSIVE_LIST_INCOMPLETE:%', v_count;
  END IF;
END
$runtime$;

RESET ROLE;

DO $read_matrix$
DECLARE
  v_health jsonb;
BEGIN
  SELECT health INTO v_health FROM verify_492_context;
  IF coalesce((v_health #>> '{contract,service_role_reads}')::boolean, false) IS DISTINCT FROM true
     OR coalesce(v_health->'contract'->'missing_service_role_reads', '[]'::jsonb) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_492_SERVICE_READ_MATRIX_INCOMPLETE:%', v_health;
  END IF;
END
$read_matrix$;

ROLLBACK;
