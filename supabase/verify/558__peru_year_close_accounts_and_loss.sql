\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_other uuid;
  v_actor uuid;
  v_before jsonb;
  v_after jsonb;
  v_bank uuid;
  v_59 uuid;
  v_balance jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_558_LOCAL_ONLY'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=now(),updated_at=now() WHERE singleton;
  v_demo := public.create_demo_tenant_ready_tx('VERIFY-558-PE',14,'PE','verify-558-pe-'||gen_random_uuid()::text);
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_before FROM public.plan_cuentas pc
    WHERE tenant_id=v_tenant AND codigo NOT IN ('59','89');
  DELETE FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo IN ('59','89');
  PERFORM app.seed_peru_year_close_accounts_558(v_tenant);
  IF (SELECT count(*) FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo IN ('59','89')
    AND activo AND acepta_movimiento AND estado='ACTIVO' AND nivel=2)<>2 THEN
    RAISE EXCEPTION 'VERIFY_558_CLOSING_ACCOUNTS_MISSING';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='59' AND tipo_cuenta='PATRIMONIO')
    OR NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='89' AND tipo_cuenta='ORDEN') THEN
    RAISE EXCEPTION 'VERIFY_558_CLASSIFICATION_INVALID';
  END IF;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_after FROM public.plan_cuentas pc
    WHERE tenant_id=v_tenant AND codigo NOT IN ('59','89');
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_558_PREVIOUS_ACCOUNTS_MUTATED'; END IF;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_before FROM public.plan_cuentas pc WHERE tenant_id=v_tenant;
  PERFORM app.seed_peru_year_close_accounts_558(v_tenant);
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_after FROM public.plan_cuentas pc WHERE tenant_id=v_tenant;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_558_REPLAY_MUTATED'; END IF;
  UPDATE public.plan_cuentas SET nombre='Definido por contador',activo=false,estado='INACTIVO',acepta_movimiento=false
    WHERE tenant_id=v_tenant AND codigo IN ('59','89');
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_before FROM public.plan_cuentas pc WHERE tenant_id=v_tenant;
  UPDATE public.empresa_config SET pais='PE' WHERE tenant_id=v_tenant;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_after FROM public.plan_cuentas pc WHERE tenant_id=v_tenant;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_558_CUSTOM_INACTIVE_ACCOUNT_CHANGED'; END IF;
  v_other := (public.create_demo_tenant_ready_tx('VERIFY-558-AR',14,'AR','verify-558-ar-'||gen_random_uuid()::text)->>'tenant_id')::uuid;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_before FROM public.plan_cuentas pc WHERE tenant_id=v_other;
  PERFORM app.seed_peru_year_close_accounts_558(v_other);
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_after FROM public.plan_cuentas pc WHERE tenant_id=v_other;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_558_NON_PE_CHANGED'; END IF;
  IF has_function_privilege('service_role','app.seed_peru_year_close_accounts_558(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','app.seed_peru_year_close_accounts_558(uuid)','EXECUTE')
    OR has_function_privilege('anon','app.seed_peru_year_close_accounts_558(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_558_SEEDER_EXECUTE_LEAKED';
  END IF;
  IF NOT has_function_privilege('service_role','public.balance_general_live(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.balance_general_live(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.balance_general_live(uuid,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_558_REPORT_EXECUTE_CHANGED';
  END IF;
  UPDATE public.plan_cuentas SET activo=true,estado='ACTIVO',acepta_movimiento=true WHERE tenant_id=v_tenant AND codigo='59';
  SELECT id INTO v_bank FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='1041';
  SELECT id INTO v_59 FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='59';
  IF v_actor IS NULL THEN SELECT id INTO v_actor FROM public.usuarios_sistema WHERE tenant_id=v_tenant AND activo LIMIT 1; END IF;
  PERFORM public.crear_asiento_con_detalles_tx(v_tenant,
    jsonb_build_object('fecha','2025-12-31','concepto','Perdida acumulada local','estado','CONFIRMADO','creado_por',v_actor),
    jsonb_build_array(jsonb_build_object('cuenta_id',v_59,'debe',7,'haber',0,'concepto','Resultado acumulado'),
      jsonb_build_object('cuenta_id',v_bank,'debe',0,'haber',7,'concepto','Banco')));
  v_balance := public.balance_general_live(v_tenant,2026,1);
  IF (v_balance->>'resultados_acumulados')::numeric <> -7
    OR (v_balance->>'otros_pasivos_corrientes')::numeric <> 7 THEN
    RAISE EXCEPTION 'VERIFY_558_ACCUMULATED_LOSS_SIGN_MISSING:%',v_balance;
  END IF;
END;
$verify$;
ROLLBACK;
