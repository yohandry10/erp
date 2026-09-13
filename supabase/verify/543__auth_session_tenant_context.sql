\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  v_demo jsonb; v_other jsonb; v_actor uuid; v_home uuid; v_target uuid;
  v_token text:=repeat('a',64); v_new text:=repeat('b',64); v_result jsonb; v_session uuid;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_543_REQUIERE_ERP_E2E'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  v_demo:=public.create_demo_tenant_ready_tx('VERIFY543-ORIGIN',14,'PE','verify543-'||gen_random_uuid());
  v_other:=public.create_demo_tenant_ready_tx('VERIFY543-TARGET',14,'PE','verify543-'||gen_random_uuid());
  v_actor:=(v_demo->>'user_id')::uuid; v_home:=(v_demo->>'tenant_id')::uuid; v_target:=(v_other->>'tenant_id')::uuid;
  PERFORM public.crear_sesion_login_auth_tx(v_actor,v_token,now()+interval '1 hour');
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.cambiar_contexto_sesion_auth_tx(v_actor,v_token,v_target,v_new);
    RAISE EXCEPTION 'VERIFY543_ORDINARY_USER_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  UPDATE public.usuarios_sistema SET is_super_admin=true WHERE id=v_actor;
  RAISE NOTICE 'VERIFY543 target state: %', (
    SELECT jsonb_build_object('tenant_estado',t.estado,'company_estado',ec.estado,'demo',ec.is_demo,
      'demo_vigente',ec.demo_expires_at>now(),'plan_estado',ec.plan_estado,'plan_vigente',ec.plan_vence_at>now())
    FROM public.tenants t JOIN public.empresa_config ec ON ec.tenant_id=t.id WHERE t.id=v_target
  );
  SET LOCAL ROLE service_role;
  v_result:=public.cambiar_contexto_sesion_auth_tx(v_actor,v_token,v_target,v_new);
  v_session:=(v_result->>'session_id')::uuid;
  IF v_session IS NULL OR v_result#>>'{tenant,id}'<>v_target::text THEN RAISE EXCEPTION 'VERIFY543_SWITCH_FAILED'; END IF;
  IF public.cambiar_contexto_sesion_auth_tx(v_actor,v_token,v_target,v_new)<>v_result THEN RAISE EXCEPTION 'VERIFY543_REPLAY_CHANGED'; END IF;
  IF NOT (public.validar_contexto_sesion_auth_tx(v_new,v_actor,v_target,true)->>'valid')::boolean THEN RAISE EXCEPTION 'VERIFY543_CONTEXT_INVALID'; END IF;
  IF (public.validar_contexto_sesion_auth_tx(v_new,v_actor,v_home,true)->>'valid')::boolean
     OR (public.validar_contexto_sesion_auth_tx(v_new,(v_other->>'user_id')::uuid,v_target,true)->>'valid')::boolean
     OR (public.validar_contexto_sesion_auth_tx(v_new,v_actor,v_target,false)->>'valid')::boolean THEN
    RAISE EXCEPTION 'VERIFY543_CONTEXT_MISMATCH_ACCEPTED';
  END IF;
  IF (SELECT count(*) FROM public.audit_log WHERE record_id=v_session::text AND metadata->>'source'='auth_switch_543')<>1 THEN
    RAISE EXCEPTION 'VERIFY543_AUDIT_NOT_UNIQUE';
  END IF;
  BEGIN
    PERFORM public.cambiar_contexto_sesion_auth_tx(v_actor,v_token,v_home,v_new);
    RAISE EXCEPTION 'VERIFY543_CONFLICT_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  RESET ROLE;
  UPDATE public.tenants SET estado='INACTIVO' WHERE id=v_target;
  SET LOCAL ROLE service_role;
  IF (public.validar_contexto_sesion_auth_tx(v_new,v_actor,v_target,true)->>'valid')::boolean THEN
    RAISE EXCEPTION 'VERIFY543_INACTIVE_TARGET_ACCEPTED';
  END IF;
  BEGIN
    PERFORM public.cambiar_contexto_sesion_auth_tx(v_actor,v_token,v_target,repeat('c',64));
    RAISE EXCEPTION 'VERIFY543_INACTIVE_SWITCH_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE session_token=repeat('c',64)) THEN
    RAISE EXCEPTION 'VERIFY543_FAILED_SWITCH_LEFT_SESSION';
  END IF;
  UPDATE public.tenants SET estado='ACTIVO' WHERE id=v_target;
  UPDATE public.usuarios_sistema SET is_super_admin=false WHERE id=v_actor;
  SET LOCAL ROLE service_role;
  IF (public.validar_contexto_sesion_auth_tx(v_new,v_actor,v_target,true)->>'valid')::boolean THEN
    RAISE EXCEPTION 'VERIFY543_REVOKED_SUPERADMIN_ACCEPTED';
  END IF;
  RESET ROLE;
  IF has_function_privilege('anon','public.cambiar_contexto_sesion_auth_tx(uuid,text,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.validar_contexto_sesion_auth_tx(text,uuid,uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY543_PRIVILEGES_INVALID';
  END IF;
END;
$verify$;
ROLLBACK;
