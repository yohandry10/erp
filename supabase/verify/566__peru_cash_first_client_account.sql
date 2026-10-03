\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 v_tenant uuid; v_other uuid; v_before jsonb; v_after jsonb;
 v_fn regprocedure:=to_regprocedure('app.seed_peru_cash_account_config_566()');
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_566_LOCAL_ONLY'; END IF;
 IF v_fn IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_fn AND prosecdef AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=pg_catalog, public, app, pg_temp']) THEN
  RAISE EXCEPTION 'VERIFY_566_PRIVATE_TRIGGER_SECURITY_INVALID';
 END IF;
 IF has_function_privilege('service_role',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE') OR has_function_privilege('anon',v_fn,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v_fn AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY_566_PRIVATE_WRITER_EXPOSED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.empresa_config'::regclass AND tgname='seed_peru_cash_account_config_566' AND tgenabled='O' AND tgfoid=v_fn) THEN
  RAISE EXCEPTION 'VERIFY_566_TRIGGER_MISSING';
 END IF;
 IF NOT has_table_privilege('service_role','public.cambios_turno','SELECT') OR NOT has_table_privilege('service_role','public.retiros_caja','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_566_READ_GRANTS_MISSING';
 END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
   configured_at=now(),updated_at=now() WHERE singleton;
 v_tenant:=(public.create_demo_tenant_ready_tx('VERIFY-566-PE',14,'PE','verify-566-pe-'||gen_random_uuid()::text)->>'tenant_id')::uuid;
 IF (SELECT count(*) FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='10111' AND activo AND acepta_movimiento AND estado='ACTIVO' AND tipo='ACTIVO')<>1 THEN
  RAISE EXCEPTION 'VERIFY_566_NEW_PE_ACCOUNT_MISSING';
 END IF;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_before FROM public.plan_cuentas t WHERE tenant_id=v_tenant;
 UPDATE public.empresa_config SET pais='PE' WHERE tenant_id=v_tenant;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_after FROM public.plan_cuentas t WHERE tenant_id=v_tenant;
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_566_REPLAY_CHANGED_ACCOUNTS'; END IF;
 UPDATE public.plan_cuentas SET nombre='Configurada por contador',activo=false,acepta_movimiento=false,estado='INACTIVO' WHERE tenant_id=v_tenant AND codigo='10111';
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_before FROM public.plan_cuentas t WHERE tenant_id=v_tenant;
 UPDATE public.empresa_config SET pais='PE' WHERE tenant_id=v_tenant;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_after FROM public.plan_cuentas t WHERE tenant_id=v_tenant;
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_566_ACCOUNT_CONFIGURATION_OVERWRITTEN'; END IF;
 v_other:=(public.create_demo_tenant_ready_tx('VERIFY-566-AR',14,'AR','verify-566-ar-'||gen_random_uuid()::text)->>'tenant_id')::uuid;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_before FROM public.plan_cuentas t WHERE tenant_id=v_other;
 UPDATE public.empresa_config SET pais='AR' WHERE tenant_id=v_other;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_after FROM public.plan_cuentas t WHERE tenant_id=v_other;
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'VERIFY_566_OTHER_COUNTRY_MUTATED'; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_other AND codigo='10111' AND metadata->>'source'='migration_465_fiscal_accounts') THEN
  RAISE EXCEPTION 'VERIFY_566_OTHER_COUNTRY_SEEDED';
 END IF;
END $verify$;
ROLLBACK;
