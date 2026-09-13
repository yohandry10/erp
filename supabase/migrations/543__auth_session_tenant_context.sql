-- Sesión, identidad y contexto empresarial se validan juntos. El cambio de
-- empresa no modifica la pertenencia del usuario ni eleva permisos ordinarios.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.validar_contexto_sesion_auth_tx(
  p_session_token text, p_usuario_id uuid, p_tenant_id uuid, p_super_admin boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE v_validation jsonb; v_user public.usuarios_sistema; v_context uuid;
BEGIN
  v_validation := public.validar_sesion_auth_tx(p_session_token);
  IF NOT COALESCE((v_validation->>'valid')::boolean, false) THEN RETURN v_validation; END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema WHERE id=p_usuario_id;
  SELECT CASE WHEN metadata->>'source'='auth_switch_543' THEN (metadata->>'context_tenant_id')::uuid
    ELSE tenant_id END INTO v_context FROM public.user_sessions WHERE id=(v_validation->>'session_id')::uuid;
  IF v_user.id IS NULL
     OR (v_validation->>'usuario_id')::uuid IS DISTINCT FROM p_usuario_id
     OR v_context IS DISTINCT FROM p_tenant_id
     OR COALESCE(v_user.is_super_admin,false) IS DISTINCT FROM COALESCE(p_super_admin,false)
     OR (NOT COALESCE(v_user.is_super_admin,false) AND v_user.tenant_id IS DISTINCT FROM p_tenant_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t JOIN public.empresa_config ec ON ec.tenant_id=t.id
       WHERE t.id=p_tenant_id AND (upper(t.estado)='ACTIVO' OR
         (upper(t.estado)='PRUEBA' AND ec.is_demo AND ec.demo_expires_at>now())) AND (
         (lower(COALESCE(ec.estado,'activo'))='activo' AND
           (ec.plan_estado IS NULL OR (upper(ec.plan_estado)='ACTIVO' AND ec.plan_vence_at>now())))
         OR (lower(COALESCE(ec.estado,''))='prueba' AND COALESCE(ec.is_demo,false) AND ec.demo_expires_at>now())
       )
     ) THEN
    RETURN jsonb_build_object('valid',false,'reason','SESSION_CONTEXT_INVALID');
  END IF;
  RETURN v_validation || jsonb_build_object('tenant_id',v_context);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cambiar_contexto_sesion_auth_tx(
  p_usuario_id uuid, p_session_token text, p_target_tenant_id uuid, p_new_session_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_validation jsonb; v_user public.usuarios_sistema; v_company public.empresa_config;
  v_tenant public.tenants; v_session public.user_sessions; v_existing public.user_sessions; v_origin uuid;
BEGIN
  IF p_new_session_token IS NULL OR p_new_session_token !~ '^[0-9a-f]{64}$'
     OR p_new_session_token=p_session_token THEN
    RAISE EXCEPTION 'AUTH_SESSION_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  v_validation := public.validar_sesion_auth_tx(p_session_token);
  IF NOT COALESCE((v_validation->>'valid')::boolean,false)
     OR (v_validation->>'usuario_id')::uuid IS DISTINCT FROM p_usuario_id THEN
    RAISE EXCEPTION 'AUTH_SESSION_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema WHERE id=p_usuario_id FOR SHARE;
  SELECT COALESCE((metadata->>'context_tenant_id')::uuid,tenant_id) INTO v_origin
  FROM public.user_sessions WHERE id=(v_validation->>'session_id')::uuid;
  IF NOT COALESCE(v_user.is_super_admin,false) OR NOT COALESCE(v_user.activo,false)
     OR lower(v_user.estado)<>'activo' THEN
    RAISE EXCEPTION 'AUTH_SUPERADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id=p_target_tenant_id FOR SHARE;
  SELECT * INTO v_company FROM public.empresa_config WHERE tenant_id=p_target_tenant_id FOR SHARE;
  IF v_tenant.id IS NULL OR v_company.tenant_id IS NULL OR NOT COALESCE((
    upper(v_tenant.estado)='ACTIVO' OR
    (upper(v_tenant.estado)='PRUEBA' AND v_company.is_demo AND v_company.demo_expires_at>now())
  ),false) OR NOT COALESCE((
    (lower(COALESCE(v_company.estado,'activo'))='activo' AND
      (v_company.plan_estado IS NULL OR (upper(v_company.plan_estado)='ACTIVO' AND v_company.plan_vence_at>now())))
    OR (lower(COALESCE(v_company.estado,''))='prueba' AND COALESCE(v_company.is_demo,false) AND v_company.demo_expires_at>now())
  ),false) THEN
    RAISE EXCEPTION 'AUTH_TARGET_TENANT_INACTIVE' USING ERRCODE='42501';
  END IF;
  -- tenant_id conserva la pertenencia original exigida por normalize_user_sessions_row.
  -- Sólo este writer registra el contexto del superadministrador en metadata.
  INSERT INTO public.user_sessions(tenant_id,usuario_sistema_id,session_token,estado,expires_at,last_activity,metadata)
  VALUES(v_user.tenant_id,p_usuario_id,p_new_session_token,'ACTIVO',
    (v_validation->>'expires_at')::timestamptz,now(),jsonb_build_object('source','auth_switch_543',
      'origin_session_id',v_validation->>'session_id','context_tenant_id',p_target_tenant_id))
  ON CONFLICT (session_token) WHERE session_token IS NOT NULL DO NOTHING RETURNING * INTO v_session;
  IF v_session.id IS NULL THEN
    SELECT * INTO v_existing FROM public.user_sessions WHERE session_token=p_new_session_token;
    IF v_existing.usuario_sistema_id IS DISTINCT FROM p_usuario_id
       OR v_existing.metadata->>'context_tenant_id' IS DISTINCT FROM p_target_tenant_id::text
       OR v_existing.metadata->>'origin_session_id' IS DISTINCT FROM v_validation->>'session_id'
       OR v_existing.revoked_at IS NOT NULL OR upper(v_existing.estado)<>'ACTIVO' OR v_existing.expires_at<=now() THEN
      RAISE EXCEPTION 'AUTH_SESSION_INTENT_CONFLICT' USING ERRCODE='23505';
    END IF;
    v_session := v_existing;
  ELSE
    INSERT INTO public.audit_log(tenant_id,table_name,operation,record_id,user_id,old_values,new_values,metadata)
    VALUES(p_target_tenant_id,'user_sessions','INSERT',v_session.id::text,p_usuario_id,
      jsonb_build_object('tenant_id',v_origin),jsonb_build_object('tenant_id',p_target_tenant_id),
      jsonb_build_object('source','auth_switch_543','actor_type','SUPER_ADMIN'));
  END IF;
  RETURN jsonb_build_object('session_id',v_session.id,'tenant',jsonb_build_object('id',v_tenant.id,'nombre',v_tenant.nombre));
END;
$fn$;

REVOKE ALL ON FUNCTION public.validar_contexto_sesion_auth_tx(text,uuid,uuid,boolean),
  public.cambiar_contexto_sesion_auth_tx(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validar_contexto_sesion_auth_tx(text,uuid,uuid,boolean),
  public.cambiar_contexto_sesion_auth_tx(uuid,text,uuid,text) TO service_role;
-- Sin backfill, nuevas tablas ni cambios de RLS/DML. Rollback: detener el
-- runtime 543 antes de retirar estas funciones; conservar sesiones/auditoría.
COMMIT;
