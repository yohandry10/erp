\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_487_SOLO_ERP_E2E:%',current_database();END IF;END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE t uuid:=gen_random_uuid();r uuid:=gen_random_uuid();p uuid:=gen_random_uuid();rp uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-487-'||left(t::text,8),'Tenant 487','Fixture','PE','test',true,'ACTIVO');
 INSERT INTO public.roles(id,tenant_id,nombre,descripcion,activo,is_system_role)
 VALUES(r,t,'ROL_487','Fixture',true,false);
 INSERT INTO public.permissions(id,tenant_id,modulo,recurso,accion,codigo,descripcion,activo)
 VALUES(p,t,'verify','runtime','read','verify.runtime.read','Fixture',true);
 INSERT INTO public.role_permissions(id,role_id,permission_id,tenant_id,concedido)
 VALUES(rp,r,p,t,true);
 IF NOT EXISTS(SELECT 1 FROM public.rol_permisos WHERE id=rp AND role_id=r AND permiso_id=p) THEN RAISE EXCEPTION 'VERIFY_487_MIRROR_FAILED';END IF;
 IF NOT has_function_privilege('service_role','public.acquire_pos_lock(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.acquire_pos_lock(uuid,text)','EXECUTE')
 OR has_function_privilege('service_role','app.sync_role_permissions_deferred_487()','EXECUTE') THEN RAISE EXCEPTION 'VERIFY_487_GRANTS_FAILED';END IF;
END $verify$;
ROLLBACK;
