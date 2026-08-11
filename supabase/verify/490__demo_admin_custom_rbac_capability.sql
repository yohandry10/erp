\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_490_SOLO_ERP_E2E:%',current_database();
  END IF;
END $$;
UPDATE app.deployment_environment
SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=clock_timestamp(),updated_at=clock_timestamp()
WHERE singleton=true;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_permission uuid;
  v_restricted_permission uuid;
  v_role jsonb;
BEGIN
  v_demo:=public.create_demo_tenant_ready_tx(
    'Demo RBAC 490',14,'PE','verify-490-demo-rbac',NULL,NULL,NULL,'COMERCIO'
  );
  v_tenant:=(v_demo->>'tenant_id')::uuid;
  v_actor:=(v_demo->>'user_id')::uuid;

  IF NOT EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=v_tenant
    JOIN public.rol_permisos rp ON rp.role_id=r.id AND COALESCE(rp.concedido,true)
    JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=v_tenant
    WHERE ur.usuario_sistema_id=v_actor
      AND upper(r.nombre)='ADMIN_DEMO'
      AND lower(COALESCE(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))='users.manage'
  ) THEN
    RAISE EXCEPTION 'VERIFY_490_DEMO_CANNOT_MANAGE_RBAC';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=v_tenant
    JOIN public.rol_permisos rp ON rp.role_id=r.id AND COALESCE(rp.concedido,true)
    JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=v_tenant
    WHERE ur.usuario_sistema_id=v_actor
      AND lower(COALESCE(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))
        IN ('tenants.manage','system.debug','security.audit.read','documentos.audit.read')
  ) THEN
    RAISE EXCEPTION 'VERIFY_490_DEMO_RECEIVED_GLOBAL_PERMISSION';
  END IF;

  SELECT p.id INTO v_permission FROM public.permisos p
  WHERE p.tenant_id=v_tenant
    AND lower(COALESCE(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))='ventas.pedidos.ver'
  LIMIT 1;
  IF v_permission IS NULL THEN
    SELECT p.id INTO v_permission FROM public.permisos p
    WHERE p.tenant_id=v_tenant AND COALESCE(p.activo,true)
      AND lower(COALESCE(p.codigo,'')) NOT IN ('tenants.manage','system.debug','security.audit.read','documentos.audit.read')
    ORDER BY p.id LIMIT 1;
  END IF;

  v_role:=public.crear_rol_rbac_tx(
    v_tenant,v_actor,'verify-490-custom-role',
    jsonb_build_object('nombre','VENDEDOR DE PRUEBA','descripcion','Rol creado desde la demo'),
    ARRAY[v_permission]
  );
  IF v_role->>'nombre'<>'VENDEDOR DE PRUEBA'
     OR COALESCE((v_role->>'idempotent')::boolean,true) THEN
    RAISE EXCEPTION 'VERIFY_490_CUSTOM_ROLE_CREATE_FAILED:%',v_role;
  END IF;

  SELECT p.id INTO v_restricted_permission
  FROM public.permisos p
  WHERE p.tenant_id=v_tenant
    AND lower(COALESCE(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))='tenants.manage'
  LIMIT 1;
  IF v_restricted_permission IS NOT NULL THEN
    BEGIN
      PERFORM public.crear_rol_rbac_tx(
        v_tenant,v_actor,'verify-490-privilege-escalation',
        jsonb_build_object('nombre','SUPERADMIN FALSO'),ARRAY[v_restricted_permission]
      );
      RAISE EXCEPTION 'VERIFY_490_DEMO_PRIVILEGE_ESCALATION_ALLOWED';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%RESTRICTED%' THEN RAISE; END IF;
    END;
  END IF;

  IF has_function_privilege('service_role','app.grant_demo_admin_rbac_490()','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_490_HELPER_EXPOSED';
  END IF;
END $verify$;
ROLLBACK;
