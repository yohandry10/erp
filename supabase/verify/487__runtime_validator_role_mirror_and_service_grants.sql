\set ON_ERROR_STOP on
-- Este verificador probaba dos cosas: que una insercion en el modelo legado
-- `permissions`/`role_permissions` se reflejaba en `rol_permisos`, y que ciertas
-- funciones internas no eran ejecutables por `service_role`.
--
-- La migracion 502 retiro el modelo legado --era un espejo exacto que nadie leia y
-- que obligaba a auditar el RBAC por duplicado-- asi que la primera mitad ya no
-- puede existir. En su lugar se comprueba lo que si sigue siendo un contrato: que
-- el modelo canonico acepta la concesion y que su guardian de tenant esta puesto.
--
-- La tercera comprobacion de privilegios nombraba `app.sync_role_permissions_`
-- `deferred_487()`, una de las funciones del espejo. Se sustituye por el
-- invariante que aquella instancia representaba: ninguna funcion de sincronizacion
-- del esquema `app` es ejecutable por `service_role`. Escrito asi no depende de
-- que exista una funcion concreta.
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_487_SOLO_ERP_E2E:%',current_database();END IF;END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE
  t uuid := gen_random_uuid();
  r uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  v_ejecutables text;
BEGIN
  INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
  VALUES(t,'VERIFY-487-'||left(t::text,8),'Tenant 487','Fixture','PE','test',true,'ACTIVO');
  INSERT INTO public.roles(id,tenant_id,nombre,descripcion,activo,is_system_role)
  VALUES(r,t,'ROL_487','Fixture',true,false);
  INSERT INTO public.permisos(id,tenant_id,modulo,recurso,accion,codigo,descripcion,activo)
  VALUES(p,t,'verify','runtime','read','verify.runtime.read','Fixture',true);
  INSERT INTO public.rol_permisos(role_id,permiso_id,concedido)
  VALUES(r,p,true);

  IF NOT EXISTS (
    SELECT 1 FROM public.rol_permisos WHERE role_id = r AND permiso_id = p AND COALESCE(concedido,true)
  ) THEN
    RAISE EXCEPTION 'VERIFY_487_CONCESION_NO_PERSISTIDA';
  END IF;

  -- El guardian de tenant del modelo canonico sigue puesto.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT tg.tgisinternal AND n.nspname='public'
      AND c.relname='rol_permisos' AND tg.tgname='trg_enforce_tenant_rol_permisos'
  ) THEN
    RAISE EXCEPTION 'VERIFY_487_SIN_GUARDIAN_DE_TENANT';
  END IF;

  IF NOT has_function_privilege('service_role','public.acquire_pos_lock(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.acquire_pos_lock(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_487_GRANTS_FAILED';
  END IF;

  -- Las seis funciones del espejo tienen que seguir sin existir. Generalizar
  -- esto a "todo app.sync_*" seria falso: hay 22 sincronizadores de alias de otras
  -- tablas --asistencia, compras, cpe, gre, usuarios-- que si son ejecutables por
  -- service_role a proposito.
  SELECT string_agg(n.nspname||'.'||pr.proname, ', ')
    INTO v_ejecutables
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'app'
    AND pr.proname IN (
      'sync_permissions_from_permisos',
      'sync_permisos_from_permissions',
      'sync_rol_permisos_from_role_permissions',
      'sync_role_permissions_from_rol_permisos',
      'sync_legacy_role_permissions_immediate_487',
      'sync_role_permissions_deferred_487'
    );

  IF v_ejecutables IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_487_ESPEJO_REVIVIDO: %', v_ejecutables;
  END IF;
END $verify$;
ROLLBACK;
