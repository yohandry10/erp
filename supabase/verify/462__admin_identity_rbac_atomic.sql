\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_462_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localqaerpephemeralx',
    allow_demo_data = true, configured_at = now(), updated_at = now()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION app.verify_fail_admin_audit_462()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.metadata->>'idempotency_key' = 'verify-user-fail-462' THEN
    RAISE EXCEPTION 'VERIFY_462_FORCED_LATE_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_verify_fail_admin_audit_462
BEFORE INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION app.verify_fail_admin_audit_462();

DO $verify$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_other_tenant uuid;
  v_other_actor uuid;
  v_permission uuid;
  v_permission_2 uuid;
  v_other_permission uuid;
  v_role jsonb;
  v_role_retry jsonb;
  v_role_2 jsonb;
  v_user jsonb;
  v_user_retry jsonb;
  v_updated jsonb;
  v_failed boolean;
BEGIN
  v_demo := public.create_demo_tenant('VERIFY ADMIN 462', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  v_other_demo := public.create_demo_tenant('VERIFY ADMIN OTHER 462', 1, 'PE');
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  v_other_actor := (v_other_demo->>'user_id')::uuid;

  SELECT id INTO v_permission FROM public.permisos
  WHERE tenant_id = v_tenant AND activo ORDER BY id LIMIT 1;
  SELECT id INTO v_permission_2 FROM public.permisos
  WHERE tenant_id = v_tenant AND activo AND id <> v_permission ORDER BY id LIMIT 1;
  SELECT id INTO v_other_permission FROM public.permisos
  WHERE tenant_id = v_other_tenant AND activo ORDER BY id LIMIT 1;
  IF v_permission IS NULL OR v_permission_2 IS NULL OR v_other_permission IS NULL THEN
    RAISE EXCEPTION 'VERIFY_462_PERMISSION_FIXTURE_MISSING';
  END IF;

  v_role := public.crear_rol_rbac_tx(
    v_tenant, v_actor, 'verify-role-462',
    jsonb_build_object('nombre', 'OPERADOR VERIFY 462', 'descripcion', 'Rol transaccional'),
    ARRAY[v_permission]
  );
  v_role_retry := public.crear_rol_rbac_tx(
    v_tenant, v_actor, 'verify-role-462',
    jsonb_build_object('nombre', 'OPERADOR VERIFY 462', 'descripcion', 'Rol transaccional'),
    ARRAY[v_permission]
  );
  IF v_role->>'id' IS DISTINCT FROM v_role_retry->>'id'
     OR COALESCE((v_role_retry->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_462_ROLE_RETRY_DUPLICATED';
  END IF;
  IF (SELECT count(*) FROM public.rol_permisos WHERE role_id = (v_role->>'id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_462_ROLE_PERMISSION_NOT_ATOMIC';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_rol_rbac_tx(
      v_tenant, v_actor, 'verify-role-462',
      jsonb_build_object('nombre', 'OPERADOR VERIFY ALTERADO'), ARRAY[v_permission]
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_ROLE_KEY_REUSE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_rol_rbac_tx(
      v_tenant, v_actor, 'verify-role-cross-462',
      jsonb_build_object('nombre', 'ROL CROSS TENANT'), ARRAY[v_other_permission]
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_CROSS_TENANT_PERMISSION_ACCEPTED'; END IF;

  v_role_2 := public.crear_rol_rbac_tx(
    v_tenant, v_actor, 'verify-role-2-462',
    jsonb_build_object('nombre', 'SUPERVISOR VERIFY 462'), ARRAY[v_permission_2]
  );

  v_user := public.crear_usuario_rbac_tx(
    v_tenant, v_actor, 'verify-user-462',
    jsonb_build_object(
      'email', 'Admin.Verify.462@Example.com', 'nombre', 'Usuario Verify',
      'telefono', '999999999', 'password_hash', '$2b$10$verifyhash', 'estado', 'ACTIVO'
    ), ARRAY[(v_role->>'id')::uuid]
  );
  v_user_retry := public.crear_usuario_rbac_tx(
    v_tenant, v_actor, 'verify-user-462',
    jsonb_build_object(
      'email', 'ADMIN.VERIFY.462@example.com', 'nombre', 'Usuario Verify',
      'telefono', '999999999', 'password_hash', '$2b$10$different-salt-same-attempt', 'estado', 'ACTIVO'
    ), ARRAY[(v_role->>'id')::uuid]
  );
  IF v_user->>'id' IS DISTINCT FROM v_user_retry->>'id'
     OR COALESCE((v_user_retry->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_462_USER_RETRY_DUPLICATED';
  END IF;
  IF v_user ? 'password_hash' OR v_user ? 'password_reset_token'
     OR (SELECT email FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid) <> 'admin.verify.462@example.com'
     OR (SELECT count(*) FROM public.user_roles WHERE usuario_sistema_id = (v_user->>'id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_462_USER_SAFE_OR_ATOMIC_CONTRACT_FAILED';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_usuario_rbac_tx(
      v_tenant, v_actor, 'verify-user-other-key-462',
      jsonb_build_object(
        'email', 'admin.verify.462@example.com', 'nombre', 'Usuario Verify',
        'password_hash', '$2b$10$other', 'estado', 'ACTIVO'
      ), ARRAY[(v_role->>'id')::uuid]
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_USER_EMAIL_REUSE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.actualizar_usuario_rbac_tx(
      (v_user->>'id')::uuid, v_tenant, v_other_actor,
      jsonb_build_object('nombre', 'Ataque'), NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;

  v_updated := public.actualizar_usuario_rbac_tx(
    (v_user->>'id')::uuid, v_tenant, v_actor,
    jsonb_build_object('nombre', 'Usuario Editado 462', 'cargo', 'Supervisor'),
    ARRAY[(v_role_2->>'id')::uuid]
  );
  IF v_updated->>'nombre' <> 'Usuario Editado 462'
     OR (SELECT role_id FROM public.user_roles WHERE usuario_sistema_id = (v_user->>'id')::uuid) <> (v_role_2->>'id')::uuid THEN
    RAISE EXCEPTION 'VERIFY_462_USER_UPDATE_ROLE_REPLACE_FAILED';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.asignar_roles_usuario_rbac_tx(
      (v_user->>'id')::uuid, v_tenant, v_actor, ARRAY[(v_role_2->>'id')::uuid], 'REMOVE'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_ACTIVE_USER_WITHOUT_ROLE_ACCEPTED'; END IF;

  INSERT INTO public.user_sessions (
    tenant_id, usuario_sistema_id, session_token, estado, expires_at, last_activity
  ) VALUES (
    v_tenant, (v_user->>'id')::uuid, 'verify-session-462', 'ACTIVO', now() + interval '1 hour', now()
  );
  PERFORM public.cambiar_estado_usuario_rbac_tx((v_user->>'id')::uuid, v_tenant, v_actor, 'SUSPENDIDO');
  IF (SELECT activo FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid)
     OR (SELECT revoked_at IS NULL FROM public.user_sessions WHERE session_token = 'verify-session-462') THEN
    RAISE EXCEPTION 'VERIFY_462_DISABLE_DID_NOT_REVOKE_SESSION';
  END IF;
  PERFORM public.cambiar_estado_usuario_rbac_tx((v_user->>'id')::uuid, v_tenant, v_actor, 'ACTIVO');

  v_failed := false;
  BEGIN
    PERFORM public.cambiar_estado_usuario_rbac_tx(v_actor, v_tenant, v_actor, 'INACTIVO');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_SELF_DEACTIVATION_ACCEPTED'; END IF;

  PERFORM public.registrar_reset_usuario_rbac_tx(
    (v_user->>'id')::uuid, v_tenant, v_actor, '$2b$10$resettokenhash', now() + interval '1 hour'
  );
  IF (SELECT password_reset_token FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid) IS NULL THEN
    RAISE EXCEPTION 'VERIFY_462_RESET_NOT_PERSISTED';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    PERFORM public.increment_failed_login_attempts((v_user->>'id')::uuid, 5, 15);
  END LOOP;
  IF (SELECT failed_login_attempts <> 5 OR locked_until <= now()
      FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_462_FAILED_LOGIN_LOCK_NOT_ATOMIC';
  END IF;
  PERFORM public.registrar_login_exitoso_auth_tx((v_user->>'id')::uuid);
  IF (SELECT fecha_ultimo_acceso IS NULL OR failed_login_attempts <> 0
      FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_462_LOGIN_SUCCESS_STATE_NOT_ATOMIC';
  END IF;
  PERFORM public.registrar_intento_login_auth_tx(
    ' VERIFY462@EXAMPLE.COM ', '127.0.0.1', 'verify-462', false,
    'INVALID_PASSWORD', v_tenant
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_login_attempts a
    WHERE a.tenant_id = v_tenant
      AND a.user_email = 'verify462@example.com'
      AND split_part(a.ip_address::text, '/', 1) = '127.0.0.1'
      AND a.success IS FALSE
      AND upper(a.estado::text) = 'FALLIDO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_462_LOGIN_ATTEMPT_RPC_FAILED';
  END IF;
  PERFORM public.crear_sesion_login_auth_tx(
    (v_user->>'id')::uuid, 'verify-login-session-462', now() + interval '1 hour'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.user_sessions s
    WHERE s.usuario_sistema_id = (v_user->>'id')::uuid
      AND s.tenant_id = v_tenant
      AND s.session_token = 'verify-login-session-462'
      AND s.revoked_at IS NULL
      AND upper(s.estado::text) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_462_LOGIN_SESSION_NOT_ATOMIC';
  END IF;
  UPDATE public.user_sessions
  SET last_activity = now() - interval '1 hour'
  WHERE session_token = 'verify-login-session-462';
  v_failed := public.tocar_sesion_auth_tx('verify-login-session-462');
  IF v_failed IS NOT TRUE OR NOT EXISTS (
       SELECT 1 FROM public.user_sessions s
       WHERE s.session_token = 'verify-login-session-462'
         AND s.last_activity > now() - interval '1 minute'
     ) THEN
    RAISE EXCEPTION 'VERIFY_462_SESSION_TOUCH_RPC_FAILED';
  END IF;
  IF public.revocar_sesion_auth_tx('verify-login-session-462', v_actor, 'CROSS_USER_ATTACK')
     OR EXISTS (
       SELECT 1 FROM public.user_sessions
       WHERE session_token = 'verify-login-session-462' AND revoked_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'VERIFY_462_SESSION_CROSS_USER_REVOKE_ACCEPTED';
  END IF;
  v_failed := public.revocar_sesion_auth_tx(
    'verify-login-session-462', (v_user->>'id')::uuid, 'LOGOUT'
  );
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_462_SESSION_SELF_REVOKE_RETURNED_FALSE';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.user_sessions
       WHERE session_token = 'verify-login-session-462'
         AND revoked_at IS NOT NULL AND upper(estado::text) = 'REVOCADA'
     ) THEN
    RAISE EXCEPTION 'VERIFY_462_SESSION_SELF_REVOKE_STATE_FAILED';
  END IF;
  UPDATE public.empresa_config SET estado = 'INACTIVO' WHERE tenant_id = v_tenant;
  v_failed := false;
  BEGIN
    PERFORM public.crear_sesion_login_auth_tx(
      (v_user->>'id')::uuid, 'verify-inactive-tenant-session-462', now() + interval '1 hour'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  UPDATE public.empresa_config SET estado = 'PRUEBA' WHERE tenant_id = v_tenant;
  IF NOT v_failed OR EXISTS (
    SELECT 1 FROM public.user_sessions WHERE session_token = 'verify-inactive-tenant-session-462'
  ) THEN
    RAISE EXCEPTION 'VERIFY_462_INACTIVE_TENANT_LOGIN_ACCEPTED';
  END IF;
  PERFORM public.registrar_solicitud_reset_auth_tx(
    (v_user->>'id')::uuid, '$2b$10$self-service-token', now() + interval '1 hour'
  );
  INSERT INTO public.user_sessions (
    tenant_id, usuario_sistema_id, session_token, estado, expires_at, last_activity
  ) VALUES (
    v_tenant, (v_user->>'id')::uuid, 'verify-reset-session-462', 'ACTIVO', now() + interval '1 hour', now()
  );
  PERFORM public.consumir_reset_password_auth_tx(
    (v_user->>'id')::uuid, '$2b$10$self-service-token', '$2b$10$new-password-hash'
  );
  IF (SELECT password_hash <> '$2b$10$new-password-hash' OR password_reset_token IS NOT NULL
      FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid)
     OR (SELECT revoked_at IS NULL FROM public.user_sessions WHERE session_token = 'verify-reset-session-462') THEN
    RAISE EXCEPTION 'VERIFY_462_RESET_CONSUME_NOT_ATOMIC';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.consumir_reset_password_auth_tx(
      (v_user->>'id')::uuid, '$2b$10$self-service-token', '$2b$10$replay'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_RESET_TOKEN_REPLAY_ACCEPTED'; END IF;

  INSERT INTO public.user_sessions (
    tenant_id, usuario_sistema_id, session_token, estado, expires_at, last_activity
  ) VALUES (
    v_tenant, (v_user->>'id')::uuid, 'verify-demo-session-462', 'ACTIVO', now() + interval '1 hour', now()
  );
  v_failed := false;
  BEGIN
    PERFORM public.actualizar_credencial_demo_usuario_rbac_tx(
      (v_user->>'id')::uuid, v_tenant, v_other_actor,
      '$2b$10$cross-tenant-demo', jsonb_build_object('nombre', 'Ataque demo')
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_DEMO_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;

  PERFORM public.actualizar_credencial_demo_usuario_rbac_tx(
    (v_user->>'id')::uuid, v_tenant, v_actor,
    '$2b$10$demo-password-rotated', jsonb_build_object('nombre', 'Usuario Demo 462')
  );
  IF NOT (SELECT COALESCE(is_demo_user, false) FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid)
     OR (SELECT password_hash FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid) <> '$2b$10$demo-password-rotated'
     OR (SELECT revoked_at IS NULL FROM public.user_sessions WHERE session_token = 'verify-demo-session-462') THEN
    RAISE EXCEPTION 'VERIFY_462_DEMO_ROTATION_NOT_ATOMIC';
  END IF;
  PERFORM public.desmarcar_usuarios_demo_rbac_tx(v_tenant, v_actor);
  IF (SELECT COALESCE(is_demo_user, false) OR demo_email_temp IS NOT NULL
      FROM public.usuarios_sistema WHERE id = (v_user->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_462_DEMO_CLEAR_NOT_ATOMIC';
  END IF;

  PERFORM public.asignar_permisos_rol_rbac_tx(
    (v_role->>'id')::uuid, v_tenant, v_actor, ARRAY[v_permission_2], 'ADD'
  );
  IF (SELECT count(*) FROM public.rol_permisos WHERE role_id = (v_role->>'id')::uuid AND concedido) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_462_PERMISSION_ADD_FAILED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.asignar_permisos_rol_rbac_tx(
      (v_role->>'id')::uuid, v_tenant, v_actor, ARRAY[v_other_permission], 'ADD'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed OR (SELECT count(*) FROM public.rol_permisos WHERE role_id = (v_role->>'id')::uuid AND concedido) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_462_PERMISSION_CROSS_TENANT_PARTIAL_EFFECT';
  END IF;

  IF (SELECT count(*) FROM public.audit_log a
      WHERE a.tenant_id = v_tenant AND a.metadata->>'source' = 'admin_rbac_462') < 9 THEN
    RAISE EXCEPTION 'VERIFY_462_AUDIT_INCOMPLETE';
  END IF;
END;
$verify$;

DROP TRIGGER trg_verify_fail_admin_audit_462 ON public.audit_log;

DO $late_rollback$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_role uuid;
  v_failed boolean := false;
BEGIN
  v_demo := public.create_demo_tenant('VERIFY ADMIN ROLLBACK 462', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT id INTO v_role FROM public.roles WHERE tenant_id = v_tenant AND activo ORDER BY id LIMIT 1;

  CREATE TRIGGER trg_verify_fail_admin_audit_462
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.verify_fail_admin_audit_462();
  BEGIN
    PERFORM public.crear_usuario_rbac_tx(
      v_tenant, v_actor, 'verify-user-fail-462',
      jsonb_build_object(
        'email', 'rollback.verify.462@example.com', 'nombre', 'Debe Revertir',
        'password_hash', '$2b$10$rollback', 'estado', 'ACTIVO'
      ), ARRAY[v_role]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VERIFY_462_FORCED_LATE_AUDIT_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  DROP TRIGGER trg_verify_fail_admin_audit_462 ON public.audit_log;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_462_FORCED_FAILURE_NOT_REACHED'; END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE lower(email) = 'rollback.verify.462@example.com') THEN
    RAISE EXCEPTION 'VERIFY_462_LATE_FAILURE_LEFT_USER';
  END IF;
END;
$late_rollback$;

DO $bootstrap$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_seed_user uuid;
  v_admin_role uuid;
  v_first jsonb;
  v_retry jsonb;
BEGIN
  v_demo := public.create_demo_tenant('VERIFY ADMIN BOOTSTRAP 462', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_seed_user := (v_demo->>'user_id')::uuid;
  SELECT id INTO v_admin_role FROM public.roles
  WHERE tenant_id = v_tenant AND upper(nombre) IN ('ADMIN', 'SUPER_ADMIN', 'ADMINISTRADOR') AND activo
  ORDER BY CASE upper(nombre) WHEN 'ADMIN' THEN 0 ELSE 1 END, id LIMIT 1;
  IF v_admin_role IS NULL THEN RAISE EXCEPTION 'VERIFY_462_BOOTSTRAP_ADMIN_ROLE_MISSING'; END IF;
  DELETE FROM public.usuarios_sistema WHERE id = v_seed_user AND tenant_id = v_tenant;

  v_first := public.crear_primer_admin_tenant_tx(
    v_tenant, 'verify-first-admin-462',
    jsonb_build_object(
      'email', 'first.admin.462@example.com', 'nombre', 'Primer Admin',
      'password_hash', '$2b$10$bootstrap'
    ), v_admin_role
  );
  v_retry := public.crear_primer_admin_tenant_tx(
    v_tenant, 'verify-first-admin-462',
    jsonb_build_object(
      'email', 'first.admin.462@example.com', 'nombre', 'Primer Admin',
      'password_hash', '$2b$10$bootstrap-retry'
    ), v_admin_role
  );
  IF v_first->>'id' IS DISTINCT FROM v_retry->>'id'
     OR COALESCE((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR NOT (SELECT is_super_admin FROM public.usuarios_sistema WHERE id = (v_first->>'id')::uuid)
     OR (SELECT count(*) FROM public.user_roles WHERE usuario_sistema_id = (v_first->>'id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_462_BOOTSTRAP_NOT_ATOMIC_OR_IDEMPOTENT';
  END IF;
END;
$bootstrap$;

DO $acl$
BEGIN
  IF has_table_privilege('authenticated', 'public.usuarios_sistema', 'SELECT')
     OR has_table_privilege('authenticated', 'public.usuarios_sistema', 'INSERT')
     OR has_table_privilege('authenticated', 'public.usuarios_sistema', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.roles', 'DELETE')
     OR has_table_privilege('authenticated', 'public.auth_login_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.auth_login_attempts', 'INSERT')
     OR has_table_privilege('anon', 'public.user_roles', 'INSERT')
     OR has_function_privilege('authenticated', 'public.crear_usuario_rbac_tx(uuid,uuid,text,jsonb,uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.actualizar_credencial_demo_usuario_rbac_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.desmarcar_usuarios_demo_rbac_tx(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_sesion_login_auth_tx(uuid,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_intento_login_auth_tx(text,text,text,boolean,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tocar_sesion_auth_tx(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.increment_failed_login_attempts(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.revocar_sesion_auth_tx(text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.revocar_sesiones_usuario_auth_tx(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.revoke_user_session(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cleanup_expired_user_sessions(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_rol_rbac_tx(uuid,uuid,text,jsonb,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_462_CLIENT_MUTATION_EXPOSED';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_usuario_rbac_tx(uuid,uuid,text,jsonb,uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.actualizar_usuario_rbac_tx(uuid,uuid,uuid,jsonb,uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_primer_admin_tenant_tx(uuid,text,jsonb,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.consumir_reset_password_auth_tx(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_sesion_login_auth_tx(uuid,text,timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.registrar_intento_login_auth_tx(text,text,text,boolean,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.tocar_sesion_auth_tx(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.increment_failed_login_attempts(uuid,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.revocar_sesion_auth_tx(text,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.revocar_sesiones_usuario_auth_tx(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.actualizar_credencial_demo_usuario_rbac_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.desmarcar_usuarios_demo_rbac_tx(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_rol_rbac_tx(uuid,uuid,text,jsonb,uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.asignar_permisos_rol_rbac_tx(uuid,uuid,uuid,uuid[],text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_462_SERVICE_ROLE_CONTRACT_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.usuarios_sistema','public.roles','public.permisos','public.user_roles',
      'public.rol_permisos','public.user_sessions','public.auth_login_attempts'
    ]) AS t(tabla)
    WHERE has_table_privilege('service_role', t.tabla, 'INSERT')
       OR has_table_privilege('service_role', t.tabla, 'UPDATE')
       OR has_table_privilege('service_role', t.tabla, 'DELETE')
       OR has_table_privilege('service_role', t.tabla, 'TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'VERIFY_462_SERVICE_ROLE_DIRECT_DML_EXPOSED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.usuarios_sistema','public.roles','public.permisos','public.user_roles',
      'public.rol_permisos','public.user_sessions','public.auth_login_attempts'
    ]) AS t(tabla)
    WHERE NOT has_table_privilege('service_role', t.tabla, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'VERIFY_462_SERVICE_ROLE_READ_CONTRACT_MISSING';
  END IF;
  IF has_function_privilege('service_role', 'app.assert_admin_actor_462(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.audit_admin_462(uuid,uuid,text,text,uuid,jsonb,jsonb,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.safe_user_462(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_462_INTERNAL_HELPER_EXPOSED';
  END IF;
END;
$acl$;

ROLLBACK;
