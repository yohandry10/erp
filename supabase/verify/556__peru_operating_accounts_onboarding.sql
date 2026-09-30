\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_code text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF current_database() <> 'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_556_LOCAL_ONLY'; END IF;
  UPDATE app.deployment_environment SET environment='DEV', project_ref='localerpephemeralqax',
    allow_demo_data=true, configured_at=now(), updated_at=now() WHERE singleton;
  v_tenant := (public.create_demo_tenant_ready_tx('VERIFY-556-PE',14,'PE',
    'verify-556-pe-' || gen_random_uuid()::text)->>'tenant_id')::uuid;
  FOREACH v_code IN ARRAY ARRAY['421','422','4699','629','19','10','1041','1042','12','122','18','20','33','39','63','65','75','40','40113','40114','42','49','68','676','69','70','76','776','403','407','411','621','627']::text[] LOOP
    IF (SELECT count(*) FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo=v_code
      AND activo AND acepta_movimiento AND estado='ACTIVO') <> 1 THEN
      RAISE EXCEPTION 'VERIFY_556_MISSING_OPERATIONAL_ACCOUNT_%',v_code;
    END IF;
  END LOOP;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_before FROM public.plan_cuentas pc WHERE tenant_id=v_tenant;
  PERFORM app.seed_peru_operating_accounts_556(v_tenant);
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_after FROM public.plan_cuentas pc WHERE tenant_id=v_tenant;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_556_REPLAY_MUTATED_ACCOUNTS'; END IF;
  UPDATE public.plan_cuentas SET nombre='Configurado por contador',acepta_movimiento=false,activo=false,estado='INACTIVO'
    WHERE tenant_id=v_tenant AND codigo='76';
  UPDATE public.empresa_config SET pais='PE' WHERE tenant_id=v_tenant;
  IF NOT EXISTS (SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='76'
    AND nombre='Configurado por contador' AND NOT acepta_movimiento AND NOT activo AND estado='INACTIVO') THEN
    RAISE EXCEPTION 'VERIFY_556_CONFIGURED_ACCOUNT_OVERWRITTEN';
  END IF;
  v_other := (public.create_demo_tenant_ready_tx('VERIFY-556-AR',14,'AR',
    'verify-556-ar-' || gen_random_uuid()::text)->>'tenant_id')::uuid;
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_before FROM public.plan_cuentas pc WHERE tenant_id=v_other;
  PERFORM app.seed_peru_operating_accounts_556(v_other);
  SELECT jsonb_agg(to_jsonb(pc) ORDER BY id) INTO v_after FROM public.plan_cuentas pc WHERE tenant_id=v_other;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_556_OTHER_COUNTRY_MUTATED'; END IF;
  IF has_function_privilege('service_role','app.seed_peru_operating_accounts_556(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','app.seed_peru_operating_accounts_556(uuid)','EXECUTE')
    OR has_function_privilege('anon','app.seed_peru_operating_accounts_556(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_556_HIDDEN_RUNTIME_WRITER_REOPENED';
  END IF;
END;
$verify$;
ROLLBACK;
