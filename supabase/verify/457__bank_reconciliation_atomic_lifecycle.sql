\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_457_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

-- 464 bloquea altas sintéticas si el entorno no está declarado. Este
-- verificador sólo corre en `erp_e2e` y revierte la marca con sus fixtures.
UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localqaerpephemeralx',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION app.verify_457_fail_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF current_setting('app.verify_457_fail_outbox', true) = 'on'
     AND NEW.event_type IN ('banco.movimiento.registrado', 'banco.transferencia.registrada') THEN
    RAISE EXCEPTION 'VERIFY_457_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_verify_457_fail_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_457_fail_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_457_fail_outbox();

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_bank_ledger_a uuid := gen_random_uuid();
  v_bank_ledger_b uuid := gen_random_uuid();
  v_counter_income uuid := gen_random_uuid();
  v_counter_expense uuid := gen_random_uuid();
  v_bank_a uuid := gen_random_uuid();
  v_bank_b uuid := gen_random_uuid();
  v_bank_rollback uuid := gen_random_uuid();
  v_result jsonb;
  v_retry jsonb;
  v_reconciliation uuid;
  v_statement_ids uuid[];
  v_system_a uuid;
  v_system_b uuid;
  v_system_auto uuid;
  v_adjustment uuid;
  v_failed boolean;
  v_before numeric;
  v_count bigint;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-457-' || left(v_tenant::text, 8), 'Tenant verify 457',
     'Fixture local bancos', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-457-' || left(v_other_tenant::text, 8), 'Tenant ajeno 457',
     'Fixture local ajeno', 'PE', 'test', true, 'ACTIVO');

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado, configuracion_completa
  ) VALUES (
    v_tenant, '20600000457', 'Empresa verify 457', 'PE', 'PEN', 'ACTIVO', true
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Actor', 'Verify 457',
     'actor-457-' || left(v_actor::text, 8) || '@local.invalid',
     'actor457', 'unused-local-hash', true, 'ACTIVO'),
    (v_other_actor, v_other_tenant, 'Otro', 'Actor 457',
     'other-457-' || left(v_other_actor::text, 8) || '@local.invalid',
     'other457', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.plan_cuentas (
    id, tenant_id, codigo, nombre, tipo, tipo_cuenta,
    nivel, acepta_movimiento, activo, estado
  ) VALUES
    (v_bank_ledger_a, v_tenant, '104101', 'Banco A verify 457', 'ACTIVO', 'ACTIVO', 6, true, true, 'ACTIVO'),
    (v_bank_ledger_b, v_tenant, '104102', 'Banco B verify 457', 'ACTIVO', 'ACTIVO', 6, true, true, 'ACTIVO'),
    (v_counter_income, v_tenant, '759101', 'Otros ingresos verify 457', 'INGRESO', 'INGRESO', 6, true, true, 'ACTIVO'),
    (v_counter_expense, v_tenant, '659101', 'Gastos bancarios verify 457', 'GASTO', 'GASTO', 6, true, true, 'ACTIVO');

  INSERT INTO public.cuentas_bancarias (
    id, tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, saldo_inicial, saldo, saldo_actual, saldo_contable,
    cuenta_contable_id, activa, activo, estado, permite_sobregiro
  ) VALUES
    (v_bank_a, v_tenant, 'Banco A 457', 'BANK-A-457', 'Banco local', '457-A', 'CORRIENTE',
     'PEN', 1000, 1000, 1000, 1000, v_bank_ledger_a, true, true, 'ACTIVO', false),
    (v_bank_b, v_tenant, 'Banco B 457', 'BANK-B-457', 'Banco local', '457-B', 'CORRIENTE',
     'PEN', 200, 200, 200, 200, v_bank_ledger_b, true, true, 'ACTIVO', false),
    (v_bank_rollback, v_tenant, 'Banco rollback 457', 'BANK-R-457', 'Banco local', '457-R', 'CORRIENTE',
     'PEN', 500, 500, 500, 500, v_bank_ledger_a, true, true, 'ACTIVO', false);

  -- Movimiento manual atomico y durable.
  v_result := public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_expense,
      'tipo', 'CARGO', 'monto', 100, 'moneda', 'PEN', 'fecha', '2026-08-03',
      'descripcion', 'Pago exacto A', 'referencia', 'REF-A',
      'metodo_pago', 'TRANSFERENCIA', 'categoria', 'OTRO_EGRESO'
    ),
    v_actor, 'verify-457-manual-a'
  );
  v_system_a := (v_result->>'movimiento_id')::uuid;
  IF coalesce((v_result->>'idempotent')::boolean, true)
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_a) <> 900
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events o
       WHERE o.event_id = (v_result->>'event_id')::uuid
         AND o.event_type = 'banco.movimiento.registrado'
         AND o.payload->>'cuentaBancoCodigo' = '104101'
         AND o.payload->>'cuentaContrapartidaCodigo' = '659101'
         AND (o.payload->>'monto')::numeric = 100
     ) THEN
    RAISE EXCEPTION 'VERIFY_457_MANUAL_NOT_ATOMIC:%', v_result;
  END IF;

  v_retry := public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_expense,
      'tipo', 'CARGO', 'monto', 100, 'moneda', 'PEN', 'fecha', '2026-08-03',
      'descripcion', 'Pago exacto A', 'referencia', 'REF-A',
      'metodo_pago', 'TRANSFERENCIA', 'categoria', 'OTRO_EGRESO'
    ),
    v_actor, 'verify-457-manual-a'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR v_retry->>'movimiento_id' IS DISTINCT FROM v_result->>'movimiento_id'
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_a) <> 900 THEN
    RAISE EXCEPTION 'VERIFY_457_MANUAL_RETRY_NOT_EXACT:%', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_movimiento_bancario_tx(
      v_tenant,
      jsonb_build_object(
        'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_expense,
        'tipo', 'CARGO', 'monto', 101, 'moneda', 'PEN', 'fecha', '2026-08-03',
        'descripcion', 'Cambio no permitido', 'categoria', 'OTRO_EGRESO'
      ),
      v_actor, 'verify-457-manual-a'
    );
  EXCEPTION WHEN SQLSTATE '23505' THEN
    v_failed := position('DIFFERENT_PAYLOAD' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_457_KEY_COLLISION_NOT_REJECTED'; END IF;

  -- Mismo payload con clave distinta es una nueva intencion real.
  PERFORM public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_rollback, 'cuenta_contrapartida_id', v_counter_income,
      'tipo', 'ABONO', 'monto', 10, 'moneda', 'PEN', 'fecha', '2026-07-01',
      'descripcion', 'Intencion uno', 'categoria', 'OTRO_INGRESO'
    ),
    v_actor, 'verify-457-distinct-1'
  );
  PERFORM public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_rollback, 'cuenta_contrapartida_id', v_counter_income,
      'tipo', 'ABONO', 'monto', 10, 'moneda', 'PEN', 'fecha', '2026-07-01',
      'descripcion', 'Intencion uno', 'categoria', 'OTRO_INGRESO'
    ),
    v_actor, 'verify-457-distinct-2'
  );
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_rollback) <> 520 THEN
    RAISE EXCEPTION 'VERIFY_457_DISTINCT_KEYS_NOT_DISTINCT_INTENTS';
  END IF;

  -- Actor cruzado falla antes de tocar saldo.
  v_before := (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_a);
  v_failed := false;
  BEGIN
    PERFORM public.registrar_movimiento_bancario_tx(
      v_tenant,
      jsonb_build_object(
        'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_income,
        'tipo', 'ABONO', 'monto', 1, 'moneda', 'PEN', 'fecha', '2026-08-01',
        'descripcion', 'Actor ajeno', 'categoria', 'OTRO_INGRESO'
      ),
      v_other_actor, 'verify-457-cross-actor'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_a) <> v_before THEN
    RAISE EXCEPTION 'VERIFY_457_CROSS_TENANT_ACTOR_NOT_REJECTED';
  END IF;

  -- Fallo tardio del outbox revierte movimiento, saldo y anchor.
  v_before := (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_rollback);
  PERFORM set_config('app.verify_457_fail_outbox', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.registrar_movimiento_bancario_tx(
      v_tenant,
      jsonb_build_object(
        'cuenta_bancaria_id', v_bank_rollback, 'cuenta_contrapartida_id', v_counter_expense,
        'tipo', 'CARGO', 'monto', 20, 'moneda', 'PEN', 'fecha', '2026-07-02',
        'descripcion', 'Debe revertir', 'categoria', 'OTRO_EGRESO'
      ),
      v_actor, 'verify-457-late-outbox'
    );
  EXCEPTION WHEN OTHERS THEN v_failed := position('VERIFY_457_LATE_OUTBOX_FAILURE' IN SQLERRM) > 0;
  END;
  PERFORM set_config('app.verify_457_fail_outbox', 'off', true);
  IF NOT v_failed OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_rollback) <> v_before
     OR EXISTS (
       SELECT 1 FROM public.operaciones_bancarias
       WHERE tenant_id = v_tenant AND idempotency_key = 'verify-457-late-outbox'
     ) THEN
    RAISE EXCEPTION 'VERIFY_457_LATE_COLLISION_DID_NOT_ROLLBACK';
  END IF;

  -- Transferencia: dos saldos y dos movimientos o ninguno.
  v_result := public.transferir_entre_cuentas_bancarias_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_origen_id', v_bank_a, 'cuenta_destino_id', v_bank_b,
      'monto', 50, 'moneda', 'PEN', 'fecha', '2026-09-15',
      'descripcion', 'Transferencia interna', 'referencia', 'TR-457'
    ),
    v_actor, 'verify-457-transfer'
  );
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_a) <> 850
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_b) <> 250
     OR NOT EXISTS (
       SELECT 1 FROM public.movimientos_bancarios a
       JOIN public.movimientos_bancarios b ON b.id = a.movimiento_par_id
       WHERE a.id = (v_result->>'movimiento_origen_id')::uuid
         AND b.id = (v_result->>'movimiento_destino_id')::uuid
         AND b.movimiento_par_id = a.id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events o
       WHERE o.event_id = (v_result->>'event_id')::uuid
         AND o.event_type = 'banco.transferencia.registrada'
     ) THEN
    RAISE EXCEPTION 'VERIFY_457_TRANSFER_NOT_PAIRED:%', v_result;
  END IF;
  v_retry := public.transferir_entre_cuentas_bancarias_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_origen_id', v_bank_a, 'cuenta_destino_id', v_bank_b,
      'monto', 50, 'moneda', 'PEN', 'fecha', '2026-09-15',
      'descripcion', 'Transferencia interna', 'referencia', 'TR-457'
    ),
    v_actor, 'verify-457-transfer'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_a) <> 850
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_bank_b) <> 250 THEN
    RAISE EXCEPTION 'VERIFY_457_TRANSFER_RETRY_NOT_EXACT';
  END IF;

  -- Dos movimientos adicionales del periodo que alimentan los tres modos de match.
  v_result := public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_income,
      'tipo', 'ABONO', 'monto', 25, 'moneda', 'PEN', 'fecha', '2026-08-05',
      'descripcion', 'Ingreso B', 'referencia', 'REF-B', 'categoria', 'OTRO_INGRESO'
    ), v_actor, 'verify-457-system-b'
  );
  v_system_b := (v_result->>'movimiento_id')::uuid;
  v_result := public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_expense,
      'tipo', 'CARGO', 'monto', 10, 'moneda', 'PEN', 'fecha', '2026-08-07',
      'descripcion', 'Cargo automatico', 'referencia', 'REF-AUTO', 'categoria', 'OTRO_EGRESO'
    ), v_actor, 'verify-457-system-auto'
  );
  v_system_auto := (v_result->>'movimiento_id')::uuid;

  v_result := public.crear_conciliacion_bancaria_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'periodo', '2026-08',
      'fecha_desde', '2026-08-01', 'fecha_hasta', '2026-08-31'
    ),
    v_actor, 'verify-457-reconciliation-create'
  );
  v_reconciliation := (v_result->'conciliacion'->>'id')::uuid;
  IF (v_result->'conciliacion'->>'saldo_inicial')::numeric <> 1000
     OR (v_result->'conciliacion'->>'saldo_libro')::numeric <> 915 THEN
    RAISE EXCEPTION 'VERIFY_457_BOOK_BALANCES_NOT_EXACT:%', v_result;
  END IF;
  v_retry := public.crear_conciliacion_bancaria_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'periodo', '2026-08',
      'fecha_desde', '2026-08-01', 'fecha_hasta', '2026-08-31'
    ),
    v_actor, 'verify-457-reconciliation-create'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (v_retry->'conciliacion'->>'id')::uuid <> v_reconciliation THEN
    RAISE EXCEPTION 'VERIFY_457_RECON_CREATE_RETRY_NOT_EXACT';
  END IF;

  v_result := public.importar_extracto_bancario_tx(
    v_tenant, v_reconciliation,
    jsonb_build_object(
      'banco', 'GENERICO', 'saldo_banco_inicial', 1000, 'saldo_banco_final', 910,
      'movimientos', jsonb_build_array(
        jsonb_build_object('fecha','2026-08-03','tipo','CARGO','monto',100,'descripcion','Pago exacto A','referencia','REF-A'),
        jsonb_build_object('fecha','2026-08-05','tipo','ABONO','monto',25,'descripcion','Ingreso B','referencia','REF-B'),
        jsonb_build_object('fecha','2026-08-07','tipo','CARGO','monto',10,'descripcion','Cargo automatico','referencia','REF-AUTO'),
        jsonb_build_object('fecha','2026-08-09','tipo','CARGO','monto',5,'descripcion','Comision bancaria','referencia','REF-COM')
      )
    ),
    v_actor, 'verify-457-statement-import'
  );
  SELECT array_agg(id ORDER BY referencia) INTO v_statement_ids
  FROM public.movimientos_bancarios
  WHERE tenant_id = v_tenant AND conciliacion_id = v_reconciliation AND es_extracto;
  IF array_length(v_statement_ids, 1) <> 4
     OR (v_result->>'diferencia')::numeric <> 5 THEN
    RAISE EXCEPTION 'VERIFY_457_STATEMENT_BATCH_NOT_EXACT:%', v_result;
  END IF;
  v_retry := public.importar_extracto_bancario_tx(
    v_tenant, v_reconciliation,
    jsonb_build_object(
      'banco', 'GENERICO', 'saldo_banco_inicial', 1000, 'saldo_banco_final', 910,
      'movimientos', jsonb_build_array(
        jsonb_build_object('fecha','2026-08-03','tipo','CARGO','monto',100,'descripcion','Pago exacto A','referencia','REF-A'),
        jsonb_build_object('fecha','2026-08-05','tipo','ABONO','monto',25,'descripcion','Ingreso B','referencia','REF-B'),
        jsonb_build_object('fecha','2026-08-07','tipo','CARGO','monto',10,'descripcion','Cargo automatico','referencia','REF-AUTO'),
        jsonb_build_object('fecha','2026-08-09','tipo','CARGO','monto',5,'descripcion','Comision bancaria','referencia','REF-COM')
      )
    ),
    v_actor, 'verify-457-statement-import'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (SELECT count(*) FROM public.movimientos_bancarios
         WHERE tenant_id = v_tenant AND conciliacion_id = v_reconciliation AND es_extracto) <> 4 THEN
    RAISE EXCEPTION 'VERIFY_457_IMPORT_RETRY_NOT_EXACT';
  END IF;

  -- IDs por referencia evitan depender del orden físico del lote.
  v_result := public.conciliar_movimiento_bancario_v2_tx(
    v_tenant, v_reconciliation, v_system_a,
    (SELECT id FROM public.movimientos_bancarios WHERE conciliacion_id=v_reconciliation AND referencia='REF-A' AND es_extracto),
    v_actor, 'verify-457-match-manual-a'
  );
  IF (v_result->>'diferencia')::numeric <> 0 THEN RAISE EXCEPTION 'VERIFY_457_MANUAL_MATCH_NOT_EXACT'; END IF;

  v_result := public.conciliar_lote_bancario_tx(
    v_tenant, v_reconciliation,
    jsonb_build_array(jsonb_build_object(
      'movimiento_sistema_id', v_system_b,
      'movimiento_extracto_id', (SELECT id FROM public.movimientos_bancarios WHERE conciliacion_id=v_reconciliation AND referencia='REF-B' AND es_extracto)
    )),
    v_actor, 'verify-457-match-batch'
  );
  IF (v_result->>'matches_realizados')::integer <> 1 THEN RAISE EXCEPTION 'VERIFY_457_BATCH_MATCH_NOT_ATOMIC'; END IF;

  v_result := public.conciliar_automaticamente_bancario_tx(
    v_tenant, v_reconciliation, 2, v_actor, 'verify-457-match-auto'
  );
  IF (v_result->>'matches_realizados')::integer <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.movimientos_bancarios
       WHERE id=v_system_auto AND conciliado AND match_automatico
     ) THEN
    RAISE EXCEPTION 'VERIFY_457_AUTO_MATCH_NOT_DETERMINISTIC:%', v_result;
  END IF;

  -- La diferencia se resuelve con movimiento explicito + outbox, nunca al cerrar.
  v_result := public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_a, 'cuenta_contrapartida_id', v_counter_expense,
      'conciliacion_id', v_reconciliation,
      'tipo', 'CARGO', 'monto', 5, 'moneda', 'PEN', 'fecha', '2026-08-09',
      'descripcion', 'Comision bancaria', 'referencia', 'REF-COM',
      'categoria', 'AJUSTE_CONCILIACION'
    ), v_actor, 'verify-457-adjustment'
  );
  v_adjustment := (v_result->>'movimiento_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.operaciones_bancarias o
    JOIN public.outbox_events e ON e.event_id=o.event_id
    WHERE o.id=(v_result->>'operacion_id')::uuid
      AND o.tipo='AJUSTE_CONCILIACION' AND o.conciliacion_id=v_reconciliation
      AND e.event_type='banco.movimiento.registrado'
      AND e.payload->>'categoria'='AJUSTE_CONCILIACION'
  ) OR (SELECT diferencia FROM public.conciliaciones_bancarias WHERE id=v_reconciliation) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_457_ADJUSTMENT_NOT_ACCOUNTED:%', v_result;
  END IF;
  PERFORM public.conciliar_movimiento_bancario_v2_tx(
    v_tenant, v_reconciliation, v_adjustment,
    (SELECT id FROM public.movimientos_bancarios WHERE conciliacion_id=v_reconciliation AND referencia='REF-COM' AND es_extracto),
    v_actor, 'verify-457-match-adjustment'
  );

  v_result := public.cerrar_conciliacion_bancaria_tx(
    v_tenant, v_reconciliation, v_actor, 'verify-457-close'
  );
  IF v_result->'conciliacion'->>'estado' <> 'CERRADA'
     OR (v_result->'conciliacion'->>'saldo_libro')::numeric <> 910
     OR (v_result->'conciliacion'->>'saldo_banco')::numeric <> 910 THEN
    RAISE EXCEPTION 'VERIFY_457_CLOSE_NOT_EXACT:%', v_result;
  END IF;
  v_retry := public.cerrar_conciliacion_bancaria_tx(
    v_tenant, v_reconciliation, v_actor, 'verify-457-close'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'VERIFY_457_CLOSE_RETRY_NOT_EXACT';
  END IF;

  v_failed := false;
  BEGIN
    UPDATE public.movimientos_bancarios SET descripcion='No mutable'
    WHERE id=v_system_a;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_457_CLOSED_ITEMS_MUTABLE'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_movimiento_bancario_tx(
      v_tenant,
      jsonb_build_object(
        'cuenta_bancaria_id', v_bank_a,
        'cuenta_contrapartida_id', v_counter_income,
        'tipo', 'ABONO', 'monto', 1, 'moneda', 'PEN',
        'fecha', '2026-08-20', 'descripcion', 'Movimiento tardio',
        'referencia', 'REF-LATE-CLOSED', 'categoria', 'OTRO_INGRESO'
      ),
      v_actor, 'verify-457-closed-period-late-write'
    );
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_failed := true;
  END;
  IF NOT v_failed
     OR EXISTS (
       SELECT 1 FROM public.movimientos_bancarios
       WHERE tenant_id=v_tenant AND referencia='REF-LATE-CLOSED'
     ) THEN
    RAISE EXCEPTION 'VERIFY_457_CLOSED_PERIOD_ACCEPTED_LATE_MOVEMENT';
  END IF;

  -- Evidencia de exclusión mutua: cuenta/conciliación con FOR UPDATE y locks
  -- de transferencia en orden total, equivalente al ensayo de dos sesiones.
  IF position('FOR UPDATE' IN upper(pg_get_functiondef(
       'app.registrar_movimiento_bancario_tx_457(uuid,jsonb,uuid,text)'::regprocedure
     ))) = 0
     OR position('ORDER BY CB.ID' IN upper(pg_get_functiondef(
       'app.transferir_entre_cuentas_bancarias_tx_457(uuid,jsonb,uuid,text)'::regprocedure
     ))) = 0
     OR position('FOR UPDATE' IN upper(pg_get_functiondef(
       'app.cerrar_conciliacion_bancaria_tx_457(uuid,uuid,uuid,text)'::regprocedure
     ))) = 0 THEN
    RAISE EXCEPTION 'VERIFY_457_LOCK_EVIDENCE_MISSING';
  END IF;

  IF has_function_privilege('anon', 'public.registrar_movimiento_bancario_tx(uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cerrar_conciliacion_bancaria_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.conciliar_lote_bancario_tx(uuid,uuid,jsonb,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_457_RPC_ACL_INCORRECT';
  END IF;
  IF has_function_privilege('service_role', 'app.registrar_movimiento_bancario_tx_457(uuid,jsonb,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cerrar_conciliacion_bancaria_tx_457(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_457_INTERNAL_RPC_EXPOSED';
  END IF;
END;
$verify$;

ROLLBACK;
