\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
DO $verify$
DECLARE
  demo jsonb; other_demo jsonb; v_tenant_id uuid; actor_id uuid;
  vacancy jsonb; candidate jsonb; changed jsonb; payload jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY547_REQUIERE_ERP_E2E'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',
    allow_demo_data=true,configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  demo:=public.create_demo_tenant_ready_tx('VERIFY547',14,'PE','verify547-'||gen_random_uuid());
  other_demo:=public.create_demo_tenant_ready_tx('VERIFY547-OTHER',14,'PE','verify547-other-'||gen_random_uuid());
  v_tenant_id:=(demo->>'tenant_id')::uuid; actor_id:=(demo->>'user_id')::uuid;
  SET LOCAL ROLE service_role;
  vacancy:=public.ejecutar_operacion_rrhh_tx(v_tenant_id,actor_id,'VACANCY_CREATE',
    '{"titulo":"Verificación local","puesto_solicitado":"Pruebas"}', 'verify547-vacancy');
  payload:=jsonb_build_object('id_vacante',vacancy->>'id','nombres','Ana','apellidos','Prueba',
    'experiencia_anos',5,'estado_civil','casado');
  candidate:=public.ejecutar_operacion_rrhh_tx(v_tenant_id,actor_id,'CANDIDATE_CREATE',payload,'verify547-create');
  IF candidate->>'estado_civil' IS DISTINCT FROM 'casado' OR (candidate->>'experiencia_anos')::numeric IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'VERIFY547_PROFILE_NOT_PERSISTED:%',candidate->>'id';
  END IF;
  IF public.ejecutar_operacion_rrhh_tx(v_tenant_id,actor_id,'CANDIDATE_CREATE',payload,'verify547-create') IS DISTINCT FROM candidate THEN
    RAISE EXCEPTION 'VERIFY547_REPLAY_CHANGED';
  END IF;
  changed:=public.ejecutar_operacion_rrhh_tx(v_tenant_id,actor_id,'CANDIDATE_UPDATE',
    jsonb_build_object('id',candidate->>'id','experiencia_anos',6,'estado_civil','divorciado'),'verify547-update');
  IF changed->>'estado_civil' IS DISTINCT FROM 'divorciado' OR (changed->>'experiencia_anos')::numeric IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'VERIFY547_UPDATE_NOT_PERSISTED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_log a WHERE a.tenant_id=v_tenant_id AND a.record_id=candidate->>'id'
    AND a.new_values->>'estado_civil'='divorciado' AND a.old_values->>'estado_civil'='casado') THEN
    RAISE EXCEPTION 'VERIFY547_AUDIT_PROFILE_MISSING';
  END IF;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant_id,actor_id,'CANDIDATE_CREATE',
      payload||'{"estado_civil":"soltero"}'::jsonb,'verify547-create');
    RAISE EXCEPTION 'VERIFY547_CONFLICT_NOT_REJECTED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx((other_demo->>'tenant_id')::uuid,(other_demo->>'user_id')::uuid,
      'CANDIDATE_UPDATE',jsonb_build_object('id',candidate->>'id','estado_civil','soltero'),'verify547-cross');
    RAISE EXCEPTION 'VERIFY547_CROSS_TENANT_UPDATE_ALLOWED';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  RESET ROLE;
  IF has_function_privilege('authenticated','public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY547_ACL_REGRESSION';
  END IF;
END;
$verify$;
ROLLBACK;
