\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE v_actor uuid:=gen_random_uuid(); v_demo jsonb; v_token text:=repeat('d',64); v_target_token text:=repeat('e',64); v_result jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY545_REQUIERE_ERP_E2E'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,estado,activo,is_super_admin)
    VALUES(v_actor,NULL,'verify545-'||v_actor||'@example.test','Administrador global local','ACTIVO',true,true);
  v_demo:=public.create_demo_tenant_ready_tx('VERIFY545-TARGET',14,'PE','verify545-'||gen_random_uuid());
  SET LOCAL ROLE service_role;
  v_result:=public.crear_sesion_login_auth_tx(v_actor,v_token,now()+interval '1 hour');
  IF v_result->>'session_id' IS NULL OR v_result->>'tenant_id' IS NOT NULL THEN RAISE EXCEPTION 'VERIFY545_GLOBAL_LOGIN_FAILED'; END IF;
  IF NOT (public.validar_contexto_sesion_auth_tx(v_token,v_actor,NULL,true)->>'valid')::boolean THEN RAISE EXCEPTION 'VERIFY545_GLOBAL_CONTEXT_FAILED'; END IF;
  IF (public.validar_contexto_sesion_auth_tx(v_token,v_actor,(v_demo->>'tenant_id')::uuid,true)->>'valid')::boolean
    OR (public.validar_contexto_sesion_auth_tx(v_token,v_actor,NULL,false)->>'valid')::boolean THEN RAISE EXCEPTION 'VERIFY545_FORGED_CONTEXT_ACCEPTED'; END IF;
  PERFORM public.cambiar_contexto_sesion_auth_tx(v_actor,v_token,(v_demo->>'tenant_id')::uuid,v_target_token);
  IF NOT (public.validar_contexto_sesion_auth_tx(v_target_token,v_actor,(v_demo->>'tenant_id')::uuid,true)->>'valid')::boolean THEN RAISE EXCEPTION 'VERIFY545_TARGET_CONTEXT_FAILED'; END IF;
  PERFORM public.revocar_sesion_auth_tx(v_target_token,v_actor,'VERIFY545_LOGOUT');
  IF (public.validar_contexto_sesion_auth_tx(v_target_token,v_actor,(v_demo->>'tenant_id')::uuid,true)->>'valid')::boolean THEN RAISE EXCEPTION 'VERIFY545_LOGOUT_FAILED'; END IF;
  RESET ROLE;
  UPDATE public.usuarios_sistema SET is_super_admin=false WHERE id=v_actor;
  SET LOCAL ROLE service_role;
  IF (public.validar_sesion_auth_tx(v_token)->>'valid')::boolean THEN RAISE EXCEPTION 'VERIFY545_REMOVED_PRIVILEGE_ACCEPTED'; END IF;
  BEGIN
    PERFORM public.crear_sesion_login_auth_tx(v_actor,repeat('f',64),now()+interval '1 hour');
    RAISE EXCEPTION 'VERIFY545_ORDINARY_GLOBAL_LOGIN_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF has_function_privilege('service_role','app.crear_sesion_login_auth_base_545(uuid,text,timestamptz)','EXECUTE')
    OR has_function_privilege('anon','public.crear_sesion_login_auth_tx(uuid,text,timestamptz)','EXECUTE')
    OR has_function_privilege('authenticated','public.validar_sesion_auth_tx(text)','EXECUTE') THEN RAISE EXCEPTION 'VERIFY545_ACL_FAILED'; END IF;
END;
$verify$;
ROLLBACK;
