\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  v_demo jsonb; v_other jsonb; v_tenant uuid; v_actor uuid;
  v_id uuid := gen_random_uuid(); v_integration uuid := gen_random_uuid();
  v_bad uuid := gen_random_uuid(); v_event jsonb; v_result jsonb;
BEGIN
  IF current_database() <> 'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_542_REQUIERE_BASE_EFIMERA_ERP_E2E'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  v_demo := public.create_demo_tenant_ready_tx('VERIFY-542-PE',14,'PE','verify542-'||gen_random_uuid());
  v_other := public.create_demo_tenant_ready_tx('VERIFY-542-OTHER',14,'PE','verify542-'||gen_random_uuid());
  v_tenant := (v_demo->>'tenant_id')::uuid; v_actor := (v_demo->>'user_id')::uuid;
  v_event := jsonb_build_object('table_name','recepciones','operation','UPDATE','user_id',v_actor,
    'record_id',v_id,'new_values',jsonb_build_object('estado','CERRADA','nested',jsonb_build_object('clientSecret','private-test')),
    'changed_fields',jsonb_build_array('estado'),'metadata',jsonb_build_object('source','spoofed'));
  IF NOT has_function_privilege('service_role','public.registrar_auditoria_backend_tx(uuid,uuid,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.registrar_auditoria_backend_tx(uuid,uuid,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.registrar_auditoria_backend_tx(uuid,uuid,text,jsonb)','EXECUTE')
    OR has_table_privilege('service_role','public.audit_log','INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('service_role','public.integration_logs','INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'VERIFY_542_PRIVILEGES_INVALID';
  END IF;
  SET LOCAL ROLE service_role;
  v_result := public.registrar_auditoria_backend_tx(v_tenant,v_id,'audit',v_event);
  IF (v_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_542_FIRST_NOT_CREATED'; END IF;
  v_result := public.registrar_auditoria_backend_tx(v_tenant,v_id,'audit',v_event);
  IF NOT (v_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_542_REPLAY_NOT_IDEMPOTENT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE id=v_id AND tenant_id=v_tenant AND user_id=v_actor
    AND new_values#>>'{nested,clientSecret}'='[REDACTED]' AND metadata->>'source'='backend_audit_542'
    AND metadata->>'actor_type'='USER' AND timestamp IS NOT NULL) THEN
    RAISE EXCEPTION 'VERIFY_542_TRACE_OR_REDACTION_INVALID';
  END IF;
  BEGIN
    PERFORM public.registrar_auditoria_backend_tx(v_tenant,v_id,'audit',v_event||'{"operation":"DELETE"}');
    RAISE EXCEPTION 'VERIFY_542_CONFLICT_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.registrar_auditoria_backend_tx((v_other->>'tenant_id')::uuid,v_bad,'audit',v_event);
    RAISE EXCEPTION 'VERIFY_542_FOREIGN_ACTOR_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.registrar_auditoria_backend_tx(v_tenant,v_bad,'audit',v_event||'{"changed_fields":{}}');
    RAISE EXCEPTION 'VERIFY_542_INVALID_FIELDS_ACCEPTED';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.audit_log WHERE id=v_bad) THEN RAISE EXCEPTION 'VERIFY_542_PARTIAL_WRITE'; END IF;
  v_event := '{"servicio":"SUNAT","operacion":"send","status":"SUCCESS","status_code":200,"request_summary":{"certificadoPfx":"private-test"}}';
  PERFORM public.registrar_auditoria_backend_tx(v_tenant,v_integration,'integration',v_event);
  v_result := public.registrar_auditoria_backend_tx(v_tenant,v_integration,'integration',v_event);
  IF NOT (v_result->>'idempotent')::boolean OR NOT EXISTS (
    SELECT 1 FROM public.integration_logs WHERE id=v_integration AND request_summary->>'certificadoPfx'='[REDACTED]'
  ) THEN RAISE EXCEPTION 'VERIFY_542_INTEGRATION_INVALID'; END IF;
  BEGIN
    PERFORM public.registrar_auditoria_backend_tx((v_other->>'tenant_id')::uuid,v_integration,'integration',v_event);
    RAISE EXCEPTION 'VERIFY_542_FOREIGN_EVENT_REPLAY';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM id FROM public.auth_login_attempts LIMIT 1;
  RESET ROLE;
END;
$verify$;
ROLLBACK;
