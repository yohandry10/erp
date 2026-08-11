\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_477_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$$;

UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localqaerpephemeralx', allow_demo_data = true,
    configured_at = now(), updated_at = now()
WHERE singleton = true;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_ledger uuid;
  v_result jsonb;
  v_retry jsonb;
  v_account uuid;
  v_failed boolean := false;
BEGIN
  SELECT public.create_demo_tenant('VERIFY FINANCE MASTER 477', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  SELECT id INTO v_actor FROM public.usuarios_sistema
  WHERE tenant_id = v_tenant AND activo ORDER BY created_at LIMIT 1;
  SELECT id INTO v_ledger FROM public.plan_cuentas
  WHERE tenant_id = v_tenant AND activo AND coalesce(acepta_movimiento, true)
  ORDER BY codigo LIMIT 1;
  IF v_actor IS NULL OR v_ledger IS NULL THEN
    RAISE EXCEPTION 'VERIFY_477_FIXTURE_INCOMPLETE';
  END IF;

  SELECT public.gestionar_cuenta_bancaria_tx(
    v_tenant, v_actor, NULL,
    jsonb_build_object(
      'cuenta_contable_id', v_ledger, 'nombre', 'Cuenta verify 477',
      'banco', 'BCP', 'numero_cuenta', 'VERIFY-477-001', 'moneda', 'PEN', 'saldo', 0
    ), 'verify-477-bank-create'
  ) INTO v_result;
  v_account := (v_result->'cuenta'->>'id')::uuid;
  IF v_account IS NULL OR (v_result->>'idempotent')::boolean
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_account) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_477_CREATE_FAILED:%', v_result;
  END IF;

  SELECT public.gestionar_cuenta_bancaria_tx(
    v_tenant, v_actor, NULL,
    jsonb_build_object(
      'cuenta_contable_id', v_ledger, 'nombre', 'Cuenta verify 477',
      'banco', 'BCP', 'numero_cuenta', 'VERIFY-477-001', 'moneda', 'PEN', 'saldo', 0
    ), 'verify-477-bank-create'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->'cuenta'->>'id')::uuid <> v_account THEN
    RAISE EXCEPTION 'VERIFY_477_RETRY_FAILED:%', v_retry;
  END IF;

  BEGIN
    PERFORM public.gestionar_cuenta_bancaria_tx(
      v_tenant, v_actor, NULL,
      jsonb_build_object(
        'cuenta_contable_id', v_ledger, 'nombre', 'Distinta',
        'banco', 'BCP', 'numero_cuenta', 'VERIFY-477-002', 'saldo', 0
      ), 'verify-477-bank-create'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('IDEMPOTENCY_CONFLICT' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_477_KEY_CONFLICT_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.gestionar_cuenta_bancaria_tx(
      v_tenant, v_actor, NULL,
      jsonb_build_object(
        'cuenta_contable_id', v_ledger, 'nombre', 'Saldo ilegal',
        'banco', 'BCP', 'numero_cuenta', 'VERIFY-477-003', 'saldo', 10
      ), 'verify-477-balance'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('OPENING_BALANCE_REQUIRES_LEDGER_FLOW' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_477_OPENING_BALANCE_ACCEPTED'; END IF;

  SELECT public.gestionar_cuenta_bancaria_tx(
    v_tenant, v_actor, v_account,
    jsonb_build_object('cuenta_contable_id', v_ledger, 'nombre', 'Cuenta actualizada'),
    'verify-477-bank-update'
  ) INTO v_result;
  IF v_result->'cuenta'->>'nombre' <> 'Cuenta actualizada' THEN
    RAISE EXCEPTION 'VERIFY_477_UPDATE_FAILED:%', v_result;
  END IF;

  IF NOT has_function_privilege('service_role',
       'public.gestionar_cuenta_bancaria_tx(uuid,uuid,uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.gestionar_cuenta_bancaria_tx(uuid,uuid,uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.gestionar_cuenta_bancaria_tx_477(uuid,uuid,uuid,jsonb,text)', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.cuentas_bancarias', 'INSERT')
     OR has_table_privilege('service_role', 'public.cuentas_bancarias', 'UPDATE') THEN
    RAISE EXCEPTION 'VERIFY_477_ACL_FAILED';
  END IF;
END;
$$;

ROLLBACK;
