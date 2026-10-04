\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 v_replay regprocedure:=to_regprocedure('public.conciliacion_partidas_replay_569(uuid,uuid,text,text)');
 v_writer regprocedure:=to_regprocedure('public.conciliar_partidas_idempotente_tx_569(uuid,uuid,text,text,uuid,text,numeric,date,text,jsonb,numeric)');
 v_fn regprocedure;
 v_demo jsonb; v_tenant uuid; v_actor uuid; v_other uuid; v_other_actor uuid; v_co uuid;
 v_cuenta uuid; v_banco uuid; v_asiento jsonb; v_d1 uuid; v_d2 uuid; v_result jsonb; v_replayed jsonb;
 v_key text:='verify-569-'||gen_random_uuid()::text; v_huella text:=repeat('a',64); v_apps jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_569_LOCAL_ONLY'; END IF;
 IF v_replay IS NULL OR v_writer IS NULL THEN RAISE EXCEPTION 'VERIFY_569_FUNCTION_MISSING'; END IF;
 FOREACH v_fn IN ARRAY ARRAY[v_replay,v_writer] LOOP
  IF NOT has_function_privilege('service_role',v_fn,'EXECUTE') OR has_function_privilege('anon',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v_fn AND a.grantee=0 AND a.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'VERIFY_569_EXECUTE_INVALID %',v_fn; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_fn AND prosecdef AND pg_get_userbyid(proowner)='postgres') THEN
   RAISE EXCEPTION 'VERIFY_569_SECURITY_DEFINER_INVALID %',v_fn;
  END IF;
 END LOOP;
 IF has_table_privilege('service_role','public.accounting_reconciliation_intents','SELECT')
  OR has_table_privilege('authenticated','public.accounting_reconciliation_intents','SELECT')
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.accounting_reconciliation_intents'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION 'VERIFY_569_INTENTS_NOT_PRIVATE';
 END IF;
 IF NOT has_table_privilege('service_role','public.conciliaciones_partidas','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_569_LIST_READ_MISSING';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.plan_cuentas'::regclass AND tgname='trg_plan_cuentas_conciliable_pe_569' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'VERIFY_569_TRIGGER_MISSING';
 END IF;

 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
   configured_at=now(),updated_at=now() WHERE singleton;
 v_demo:=public.create_demo_tenant_ready_tx('VERIFY-569-PE',14,'PE','verify-569-pe-'||gen_random_uuid()::text);
 v_tenant:=(v_demo->>'tenant_id')::uuid; v_actor:=(v_demo->>'user_id')::uuid;
 v_demo:=public.create_demo_tenant_ready_tx('VERIFY-569-OTRO',14,'PE','verify-569-otro-'||gen_random_uuid()::text);
 v_other:=(v_demo->>'tenant_id')::uuid; v_other_actor:=(v_demo->>'user_id')::uuid;
 v_co:=(public.create_demo_tenant_ready_tx('VERIFY-569-CO',14,'CO','verify-569-co-'||gen_random_uuid()::text)->>'tenant_id')::uuid;

 -- Un tenant PE nuevo nace con sus cuentas de terceros conciliables; uno CO no.
 SELECT id INTO v_cuenta FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='42' AND activo ORDER BY created_at,id LIMIT 1;
 SELECT id INTO v_banco FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='1041' AND activo ORDER BY created_at,id LIMIT 1;
 IF v_cuenta IS NULL OR v_banco IS NULL THEN RAISE EXCEPTION 'VERIFY_569_FIXTURE_MISSING'; END IF;
 IF NOT (SELECT conciliable FROM public.plan_cuentas WHERE id=v_cuenta)
  OR (SELECT conciliable FROM public.plan_cuentas WHERE id=v_banco)
  OR NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='12' AND conciliable) THEN
  RAISE EXCEPTION 'VERIFY_569_PE_ACCOUNTS_NOT_RECONCILABLE';
 END IF;
 IF EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_co AND conciliable) THEN
  RAISE EXCEPTION 'VERIFY_569_CO_ACCOUNTS_MARKED';
 END IF;

 FOR v_asiento IN SELECT * FROM (VALUES
  (jsonb_build_object('fecha',current_date,'concepto','Cargo 42 verificador 569','estado','CONFIRMADO','detalles',jsonb_build_array(
    jsonb_build_object('cuenta_id',v_cuenta,'debe',50,'haber',0,'concepto','Cargo 569'),jsonb_build_object('cuenta_id',v_banco,'debe',0,'haber',50,'concepto','Banco 569')))),
  (jsonb_build_object('fecha',current_date,'concepto','Abono 42 verificador 569','estado','CONFIRMADO','detalles',jsonb_build_array(
    jsonb_build_object('cuenta_id',v_banco,'debe',50,'haber',0,'concepto','Banco 569'),jsonb_build_object('cuenta_id',v_cuenta,'debe',0,'haber',50,'concepto','Abono 569'))))
 ) AS x(p) LOOP
  PERFORM public.crear_asiento_manual_tx(v_tenant,v_actor,v_asiento,'verify-569-asiento-'||gen_random_uuid()::text);
 END LOOP;
 SELECT d.id INTO v_d1 FROM public.detalle_asientos d JOIN public.asientos_contables a ON a.id=d.asiento_id
 WHERE d.tenant_id=v_tenant AND d.cuenta_id=v_cuenta AND d.debe=50 AND a.estado='CONFIRMADO';
 SELECT d.id INTO v_d2 FROM public.detalle_asientos d JOIN public.asientos_contables a ON a.id=d.asiento_id
 WHERE d.tenant_id=v_tenant AND d.cuenta_id=v_cuenta AND d.haber=50 AND a.estado='CONFIRMADO';
 IF v_d1 IS NULL OR v_d2 IS NULL THEN RAISE EXCEPTION 'VERIFY_569_ENTRIES_MISSING'; END IF;
 v_apps:=jsonb_build_array(jsonb_build_object('detalle_id',v_d1,'monto_aplicado',50),jsonb_build_object('detalle_id',v_d2,'monto_aplicado',50));

 v_result:=public.conciliar_partidas_idempotente_tx_569(v_tenant,v_actor,v_key,v_huella,v_cuenta,'TOTAL',50,current_date,'Verificador 569',v_apps,0);
 IF (v_result->>'idempotent')::boolean IS NOT FALSE OR jsonb_array_length(v_result->'lineas')<>2
  OR (SELECT count(*) FROM public.conciliaciones_partidas WHERE tenant_id=v_tenant)<>1
  OR (SELECT sum(monto_conciliado) FROM public.detalle_asientos WHERE id IN (v_d1,v_d2))<>100 THEN
  RAISE EXCEPTION 'VERIFY_569_RECONCILIATION_NOT_PERSISTED';
 END IF;
 -- El reintento con la misma llave devuelve lo mismo y no vuelve a aplicar.
 v_replayed:=public.conciliar_partidas_idempotente_tx_569(v_tenant,v_actor,v_key,v_huella,v_cuenta,'TOTAL',50,current_date,'Verificador 569',v_apps,0);
 IF (v_replayed->>'idempotent')::boolean IS NOT TRUE OR v_replayed->>'id'<>v_result->>'id'
  OR (SELECT count(*) FROM public.conciliaciones_partidas WHERE tenant_id=v_tenant)<>1
  OR (SELECT sum(monto_conciliado) FROM public.detalle_asientos WHERE id IN (v_d1,v_d2))<>100 THEN
  RAISE EXCEPTION 'VERIFY_569_REPLAY_NOT_IDEMPOTENT';
 END IF;
 IF public.conciliacion_partidas_replay_569(v_tenant,v_actor,v_key,v_huella)->>'id'<>v_result->>'id' THEN
  RAISE EXCEPTION 'VERIFY_569_LOOKUP_INVALID';
 END IF;
 BEGIN
  PERFORM public.conciliacion_partidas_replay_569(v_tenant,v_actor,v_key,repeat('b',64));
  RAISE EXCEPTION 'VERIFY_569_FINGERPRINT_CONFLICT_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM public.conciliar_partidas_idempotente_tx_569(v_tenant,v_actor,'verify-569-otra-'||gen_random_uuid()::text,v_huella,v_cuenta,'TOTAL',50,current_date,NULL,v_apps,0);
  RAISE EXCEPTION 'VERIFY_569_DOUBLE_APPLICATION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'CONCILIACION_EXCEDE_SALDO%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.conciliar_partidas_idempotente_tx_569(v_tenant,v_other_actor,'verify-569-actor-'||gen_random_uuid()::text,v_huella,v_cuenta,'TOTAL',50,current_date,NULL,v_apps,0);
  RAISE EXCEPTION 'VERIFY_569_FOREIGN_ACTOR_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.conciliar_partidas_idempotente_tx_569(v_other,v_other_actor,'verify-569-ajeno-'||gen_random_uuid()::text,v_huella,v_cuenta,'TOTAL',50,current_date,NULL,v_apps,0);
  RAISE EXCEPTION 'VERIFY_569_FOREIGN_TENANT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'VERIFY_569_%' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.conciliaciones_partidas WHERE tenant_id=v_other)<>0 THEN
  RAISE EXCEPTION 'VERIFY_569_FOREIGN_TENANT_MUTATED';
 END IF;

 -- service_role lista conciliaciones y no lee las intenciones.
 SET LOCAL ROLE service_role;
 IF (SELECT count(*) FROM public.conciliaciones_partidas WHERE tenant_id=v_tenant)<>1 THEN
  RAISE EXCEPTION 'VERIFY_569_SERVICE_LIST_INVALID';
 END IF;
 BEGIN
  PERFORM 1 FROM public.accounting_reconciliation_intents LIMIT 1;
  RAISE EXCEPTION 'VERIFY_569_INTENTS_READABLE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
END $verify$;
ROLLBACK;
