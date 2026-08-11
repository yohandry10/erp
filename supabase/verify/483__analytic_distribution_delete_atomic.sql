\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_483_SOLO_ERP_E2E:%', current_database();
  END IF;
END $$;

UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localerpephemeralqax',
    allow_demo_data = true,
    configured_at = clock_timestamp(),
    updated_at = clock_timestamp()
WHERE singleton = true;

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_asiento_borrador uuid := gen_random_uuid();
  v_asiento_confirmado uuid := gen_random_uuid();
  v_detalle_borrador uuid := gen_random_uuid();
  v_detalle_confirmado uuid := gen_random_uuid();
  v_centro uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
  VALUES(v_tenant,'VERIFY-483-'||left(v_tenant::text,8),'Tenant 483','Fixture','PE','test',true,'ACTIVO');
  INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
  VALUES(v_actor,v_tenant,'Actor','483','actor-'||left(v_actor::text,8)||'@local.invalid','actor483','unused',true,'ACTIVO');
  INSERT INTO public.centros_costo(id,tenant_id,codigo,nombre,eje,activo)
  VALUES(v_centro,v_tenant,'CC-483','Centro 483','CENTRO_COSTO',true);
  INSERT INTO public.asientos_contables(id,tenant_id,codigo,nombre,estado,fecha,total_debe,total_haber)
  VALUES
    (v_asiento_borrador,v_tenant,'A-483-B','Borrador','BORRADOR',now(),100,100),
    (v_asiento_confirmado,v_tenant,'A-483-C','Confirmado','CONFIRMADO',now(),100,100);
  INSERT INTO public.detalle_asientos(id,tenant_id,asiento_id,codigo,nombre,debe,haber)
  VALUES
    (v_detalle_borrador,v_tenant,v_asiento_borrador,'D-483-B','Detalle borrador',100,0),
    (v_detalle_confirmado,v_tenant,v_asiento_confirmado,'D-483-C','Detalle confirmado',100,0);
  INSERT INTO public.distribucion_analitica(tenant_id,detalle_asiento_id,centro_costo_id,eje,porcentaje,monto,created_by)
  VALUES
    (v_tenant,v_detalle_borrador,v_centro,'CENTRO_COSTO',100,100,v_actor::text),
    (v_tenant,v_detalle_confirmado,v_centro,'CENTRO_COSTO',100,100,v_actor::text);

  v_result := public.eliminar_distribucion_analitica_tx(
    v_tenant,v_actor,v_detalle_borrador,'CENTRO_COSTO','verify-483-delete-borrador'
  );
  IF (v_result->>'removed')::integer <> 1 OR EXISTS (
    SELECT 1 FROM public.distribucion_analitica WHERE detalle_asiento_id=v_detalle_borrador
  ) THEN
    RAISE EXCEPTION 'VERIFY_483_DELETE_FAILED';
  END IF;
  v_result := public.eliminar_distribucion_analitica_tx(
    v_tenant,v_actor,v_detalle_borrador,'CENTRO_COSTO','verify-483-delete-borrador'
  );
  IF NOT (v_result->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'VERIFY_483_RETRY_FAILED';
  END IF;

  BEGIN
    PERFORM public.eliminar_distribucion_analitica_tx(
      v_tenant,v_actor,v_detalle_confirmado,'CENTRO_COSTO','verify-483-delete-confirmado'
    );
    RAISE EXCEPTION 'VERIFY_483_POSTED_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ANALYTIC_POSTED_ENTRY_IMMUTABLE%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.distribucion_analitica WHERE detalle_asiento_id=v_detalle_confirmado) THEN
    RAISE EXCEPTION 'VERIFY_483_POSTED_MUTATED';
  END IF;

  IF has_function_privilege('authenticated','public.eliminar_distribucion_analitica_tx(uuid,uuid,uuid,text,text)','EXECUTE')
     OR has_function_privilege('service_role','app.eliminar_distribucion_analitica_tx_483(uuid,uuid,uuid,text,text)','EXECUTE')
     OR has_table_privilege('service_role','public.distribucion_analitica','DELETE')
     OR NOT has_function_privilege('service_role','public.eliminar_distribucion_analitica_tx(uuid,uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_483_ACL_FAILED';
  END IF;
END $verify$;

ROLLBACK;
