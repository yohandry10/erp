\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 v_fn regprocedure:=to_regprocedure('public.actualizar_recepcion_tx_568(uuid,uuid,uuid,text)');
 v_demo jsonb; v_tenant uuid; v_actor uuid; v_other uuid; v_orden uuid; v_recepcion uuid:=gen_random_uuid(); v_result jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_568_LOCAL_ONLY'; END IF;
 IF v_fn IS NULL THEN RAISE EXCEPTION 'VERIFY_568_WRITER_MISSING'; END IF;
 IF NOT has_function_privilege('service_role',v_fn,'EXECUTE') OR has_function_privilege('anon',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v_fn AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_568_EXECUTE_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_fn AND prosecdef AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=pg_catalog, public, app, pg_temp']) THEN
  RAISE EXCEPTION 'VERIFY_568_SECURITY_DEFINER_INVALID';
 END IF;

 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
   configured_at=now(),updated_at=now() WHERE singleton;
 v_demo:=public.create_demo_tenant_ready_tx('VERIFY-568-PE',14,'PE','verify-568-pe-'||gen_random_uuid()::text);
 v_tenant:=(v_demo->>'tenant_id')::uuid; v_actor:=(v_demo->>'user_id')::uuid;
 IF v_actor IS NULL THEN SELECT id INTO v_actor FROM public.usuarios_sistema WHERE tenant_id=v_tenant AND activo LIMIT 1; END IF;
 v_other:=(public.create_demo_tenant_ready_tx('VERIFY-568-OTRO',14,'PE','verify-568-otro-'||gen_random_uuid()::text)->>'tenant_id')::uuid;
 SELECT id INTO v_orden FROM public.ordenes_compra WHERE tenant_id=v_tenant ORDER BY created_at,id LIMIT 1;
 IF v_orden IS NULL THEN RAISE EXCEPTION 'VERIFY_568_FIXTURE_MISSING'; END IF;
 INSERT INTO public.recepciones(id,tenant_id,orden_id,estado,numero,observaciones,created_by)
 VALUES(v_recepcion,v_tenant,v_orden,'BORRADOR','REC-VERIFY-568','Original',v_actor);

 v_result:=public.actualizar_recepcion_tx_568(v_tenant,v_actor,v_recepcion,'Editada por verificador 568');
 IF (v_result->>'idempotent')::boolean IS NOT FALSE
  OR NOT EXISTS(SELECT 1 FROM public.recepciones WHERE id=v_recepcion AND observaciones='Editada por verificador 568' AND updated_by=v_actor) THEN
  RAISE EXCEPTION 'VERIFY_568_UPDATE_NOT_PERSISTED';
 END IF;
 v_result:=public.actualizar_recepcion_tx_568(v_tenant,v_actor,v_recepcion,'Editada por verificador 568');
 IF (v_result->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'VERIFY_568_REPLAY_NOT_IDEMPOTENT'; END IF;
 BEGIN
  PERFORM public.actualizar_recepcion_tx_568(v_other,v_actor,v_recepcion,'Ajeno');
  RAISE EXCEPTION 'VERIFY_568_FOREIGN_TENANT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'VERIFY_568_%' THEN RAISE; END IF;
 END;
 IF NOT EXISTS(SELECT 1 FROM public.recepciones WHERE id=v_recepcion AND observaciones='Editada por verificador 568') THEN
  RAISE EXCEPTION 'VERIFY_568_FOREIGN_TENANT_MUTATED';
 END IF;
 UPDATE public.recepciones SET estado='CERRADA' WHERE id=v_recepcion;
 BEGIN
  PERFORM public.actualizar_recepcion_tx_568(v_tenant,v_actor,v_recepcion,'Tras cierre');
  RAISE EXCEPTION 'VERIFY_568_CLOSED_EDIT_ACCEPTED';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $verify$;
ROLLBACK;
