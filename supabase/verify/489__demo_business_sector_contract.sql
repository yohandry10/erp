\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_489_SOLO_ERP_E2E:%', current_database();
  END IF;
END $$;

UPDATE app.deployment_environment
SET environment='DEV', project_ref='localerpephemeralqax', allow_demo_data=true,
    configured_at=clock_timestamp(), updated_at=clock_timestamp()
WHERE singleton=true;

DO $verify$
DECLARE
  v_result jsonb;
  v_replay jsonb;
  v_tenant uuid;
  v_rubro text;
BEGIN
  v_result := public.create_demo_tenant_ready_tx(
    'Demo Servicios 489', 14, 'PE', 'verify-489-demo-servicios',
    NULL, NULL, NULL, 'SERVICIOS'
  );
  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE
     OR COALESCE((v_result->>'ready')::boolean, false) IS NOT TRUE
     OR v_result->>'rubro' <> 'SERVICIOS' THEN
    RAISE EXCEPTION 'VERIFY_489_CREATE_FAILED:%', v_result;
  END IF;
  v_tenant := (v_result->>'tenant_id')::uuid;
  SELECT actividad_economica INTO v_rubro
  FROM public.empresa_config WHERE tenant_id=v_tenant;
  IF v_rubro <> 'SERVICIOS' THEN
    RAISE EXCEPTION 'VERIFY_489_SECTOR_NOT_DURABLE:%', v_rubro;
  END IF;
  IF (
    SELECT count(DISTINCT upper(r.nombre)) FROM public.roles r
    WHERE r.tenant_id=v_tenant
      AND upper(r.nombre) IN (
        'ADMIN','GERENCIA','COMPRAS','ALMACEN','VENDEDOR',
        'CAJERO','FINANZAS','CONTADOR','RRHH','AUDITOR'
      )
  ) <> 10 THEN
    RAISE EXCEPTION 'VERIFY_489_STANDARD_ROLES_MISSING';
  END IF;

  v_replay := public.create_demo_tenant_ready_tx(
    'Demo Servicios 489', 14, 'PE', 'verify-489-demo-servicios',
    NULL, NULL, NULL, 'SERVICIOS'
  );
  IF COALESCE((v_replay->>'idempotent')::boolean, false) IS NOT TRUE
     OR v_replay->>'tenant_id' <> v_tenant::text THEN
    RAISE EXCEPTION 'VERIFY_489_REPLAY_FAILED:%', v_replay;
  END IF;

  BEGIN
    PERFORM public.create_demo_tenant_ready_tx(
      'Demo Servicios 489', 14, 'PE', 'verify-489-demo-servicios',
      NULL, NULL, NULL, 'MANUFACTURA'
    );
    RAISE EXCEPTION 'VERIFY_489_SECTOR_KEY_REUSE_WAS_ALLOWED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  IF has_function_privilege(
       'authenticated',
       'public.create_demo_tenant_ready_tx(character varying,integer,character varying,text,bytea,text,timestamptz,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.create_demo_tenant_ready_tx(character varying,integer,character varying,text,bytea,text,timestamptz,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_489_ACL_FAILED';
  END IF;
END $verify$;
ROLLBACK;
