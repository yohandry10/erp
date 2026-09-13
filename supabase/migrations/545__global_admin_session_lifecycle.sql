-- La UI admite administradores globales sin empresa propia. Conservan una
-- sesión revocable global y sólo adquieren contexto mediante el writer 543.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

DO $migration$
BEGIN
  IF to_regprocedure('app.crear_sesion_login_auth_base_545(uuid,text,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.crear_sesion_login_auth_tx(uuid,text,timestamptz) RENAME TO crear_sesion_login_auth_base_545;
    ALTER FUNCTION public.crear_sesion_login_auth_base_545(uuid,text,timestamptz) SET SCHEMA app;
  END IF;
  IF to_regprocedure('app.validar_sesion_auth_base_545(text)') IS NULL THEN
    ALTER FUNCTION public.validar_sesion_auth_tx(text) RENAME TO validar_sesion_auth_base_545;
    ALTER FUNCTION public.validar_sesion_auth_base_545(text) SET SCHEMA app;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.crear_sesion_login_auth_tx(
  p_usuario_id uuid,p_session_token text,p_expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE v_user public.usuarios_sistema; v_session public.user_sessions;
BEGIN
  SELECT * INTO v_user FROM public.usuarios_sistema WHERE id=p_usuario_id FOR UPDATE;
  IF v_user.id IS NULL OR v_user.tenant_id IS NOT NULL OR NOT COALESCE(v_user.is_super_admin,false) THEN
    RETURN app.crear_sesion_login_auth_base_545(p_usuario_id,p_session_token,p_expires_at);
  END IF;
  IF NOT COALESCE(v_user.activo,false) OR lower(v_user.estado)<>'activo' THEN
    RAISE EXCEPTION 'AUTH_USER_INACTIVE_OR_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(p_session_token),'') IS NULL OR p_expires_at IS NULL OR p_expires_at<=now() THEN
    RAISE EXCEPTION 'AUTH_SESSION_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  UPDATE public.usuarios_sistema SET failed_login_attempts=0,locked_until=NULL,fecha_ultimo_acceso=now(),updated_at=now()
    WHERE id=p_usuario_id;
  INSERT INTO public.user_sessions(tenant_id,usuario_sistema_id,session_token,estado,expires_at,last_activity)
    VALUES(NULL,p_usuario_id,btrim(p_session_token),'ACTIVO',p_expires_at,now()) RETURNING * INTO v_session;
  RETURN jsonb_build_object('session_id',v_session.id,'session_token',v_session.session_token,
    'usuario_id',p_usuario_id,'tenant_id',NULL,'expires_at',v_session.expires_at);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.validar_sesion_auth_tx(p_session_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE v_session public.user_sessions; v_user public.usuarios_sistema; v_reason text;
BEGIN
  SELECT * INTO v_session FROM public.user_sessions WHERE session_token=btrim(COALESCE(p_session_token,'')) FOR UPDATE;
  SELECT * INTO v_user FROM public.usuarios_sistema WHERE id=v_session.usuario_sistema_id;
  IF v_session.id IS NULL OR v_session.tenant_id IS NOT NULL OR v_user.tenant_id IS NOT NULL
     OR NOT COALESCE(v_user.is_super_admin,false) THEN
    RETURN app.validar_sesion_auth_base_545(p_session_token);
  END IF;
  IF v_session.revoked_at IS NOT NULL OR upper(COALESCE(v_session.estado,''))<>'ACTIVO' THEN v_reason:='SESSION_REVOKED';
  ELSIF v_session.expires_at IS NULL OR v_session.expires_at<=now() THEN v_reason:='SESSION_EXPIRED';
  ELSIF NOT COALESCE(v_user.activo,false) OR lower(COALESCE(v_user.estado,''))<>'activo' THEN v_reason:='USER_INACTIVE';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.user_sessions SET estado='REVOCADA',revoked_at=COALESCE(revoked_at,now()),
      revocation_reason=COALESCE(revocation_reason,v_reason),updated_at=now() WHERE id=v_session.id;
    RETURN jsonb_build_object('valid',false,'reason',v_reason);
  END IF;
  UPDATE public.user_sessions SET last_activity=now(),updated_at=now() WHERE id=v_session.id;
  RETURN jsonb_build_object('valid',true,'session_id',v_session.id,'usuario_id',v_user.id,
    'tenant_id',NULL,'expires_at',v_session.expires_at);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.validar_contexto_sesion_auth_tx(
  p_session_token text,p_usuario_id uuid,p_tenant_id uuid,p_super_admin boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE v_validation jsonb; v_user public.usuarios_sistema; v_context uuid;
BEGIN
  v_validation:=public.validar_sesion_auth_tx(p_session_token);
  IF NOT COALESCE((v_validation->>'valid')::boolean,false) THEN RETURN v_validation; END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema WHERE id=p_usuario_id;
  SELECT CASE WHEN metadata->>'source'='auth_switch_543' THEN (metadata->>'context_tenant_id')::uuid
    ELSE tenant_id END INTO v_context FROM public.user_sessions WHERE id=(v_validation->>'session_id')::uuid;
  IF v_user.id IS NULL OR (v_validation->>'usuario_id')::uuid IS DISTINCT FROM p_usuario_id
     OR v_context IS DISTINCT FROM p_tenant_id
     OR COALESCE(v_user.is_super_admin,false) IS DISTINCT FROM COALESCE(p_super_admin,false)
     OR (p_tenant_id IS NULL AND (v_user.tenant_id IS NOT NULL OR NOT COALESCE(v_user.is_super_admin,false)))
     OR (NOT COALESCE(v_user.is_super_admin,false) AND v_user.tenant_id IS DISTINCT FROM p_tenant_id)
     OR (p_tenant_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.tenants t JOIN public.empresa_config ec ON ec.tenant_id=t.id
       WHERE t.id=p_tenant_id AND (upper(t.estado)='ACTIVO' OR
         (upper(t.estado)='PRUEBA' AND ec.is_demo AND ec.demo_expires_at>now())) AND (
         (lower(COALESCE(ec.estado,'activo'))='activo' AND
           (ec.plan_estado IS NULL OR (upper(ec.plan_estado)='ACTIVO' AND ec.plan_vence_at>now())))
         OR (lower(COALESCE(ec.estado,''))='prueba' AND COALESCE(ec.is_demo,false) AND ec.demo_expires_at>now())
       )
     )) THEN
    RETURN jsonb_build_object('valid',false,'reason','SESSION_CONTEXT_INVALID');
  END IF;
  RETURN v_validation||jsonb_build_object('tenant_id',v_context);
END;
$fn$;

REVOKE ALL ON FUNCTION app.crear_sesion_login_auth_base_545(uuid,text,timestamptz),app.validar_sesion_auth_base_545(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crear_sesion_login_auth_tx(uuid,text,timestamptz),public.validar_sesion_auth_tx(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crear_sesion_login_auth_tx(uuid,text,timestamptz),public.validar_sesion_auth_tx(text) TO service_role;
-- Sin backfill ni cambios a RLS o al guard de pertenencia de sesiones. Para
-- rollback, detener runtime global, revocar sus sesiones y restaurar wrappers
-- anteriores; conservar evidencia. Las funciones base quedan privadas.
COMMIT;
