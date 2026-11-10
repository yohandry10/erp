\set ON_ERROR_STOP on
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $guard$
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_609_LOCAL_ONLY';
 END IF;
 IF has_function_privilege('anon','public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text)','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text)'::regprocedure AND prosecdef
   AND 'search_path=pg_catalog, public, app, pg_temp'=ANY(proconfig)) THEN
  RAISE EXCEPTION 'VERIFY_609_EXECUTE_OR_SEARCH_PATH_INVALID';
 END IF;
END;
$guard$;
DO $verify$
DECLARE
 v_country text; v_demo jsonb; v_tenant uuid; v_actor uuid; v_employee uuid;
 v_key text; v_exit_key text; v_entry jsonb; v_exit jsonb; v_replay jsonb;
 v_before timestamp; v_after timestamp; v_mark timestamp; v_count bigint;
BEGIN
 FOREACH v_country IN ARRAY ARRAY['PE','CO','AR'] LOOP
  v_key:='verify-609-entry-'||gen_random_uuid();v_exit_key:='verify-609-exit-'||gen_random_uuid();
  v_demo:=public.create_demo_tenant_ready_tx('Verificación asistencia609',14,v_country,'verify-609-demo-'||gen_random_uuid(),NULL,NULL,NULL,'COMERCIO');
  v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;
  v_employee:=(public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'EMPLOYEE_CREATE',
   jsonb_build_object('nombres','Prueba','apellidos','Asistencia609','tipo_documento','DNI','numero_documento','60900001',
    'cuil',CASE WHEN v_country='AR' THEN '20609000016' ELSE NULL END),'verify-609-employee-'||gen_random_uuid())->>'id')::uuid;
  v_before:=clock_timestamp() AT TIME ZONE app.zona_horaria_pais(v_country);
  v_entry:=public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'entrada',v_key);
  v_after:=clock_timestamp() AT TIME ZONE app.zona_horaria_pais(v_country);
  v_mark:=((v_entry->'data'->>'fecha')||' '||(v_entry->'data'->>'hora_entrada'))::timestamp;
  IF v_entry->'replayed'<>'false'::jsonb OR v_mark<date_trunc('second',v_before) OR v_mark>v_after THEN
   RAISE EXCEPTION 'VERIFY_609_COUNTRY_CLOCK_INVALID:%',v_country;
  END IF;
  PERFORM pg_sleep(1.1);
  v_replay:=public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'entrada',v_key);
  IF v_replay->'replayed'<>'true'::jsonb OR v_replay->'data' IS DISTINCT FROM v_entry->'data' THEN
   RAISE EXCEPTION 'VERIFY_609_ENTRY_REPLAY_CHANGED';
  END IF;
  BEGIN
   PERFORM public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'salida',v_key);
   RAISE EXCEPTION 'VERIFY_609_CHANGED_TYPE_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
   PERFORM public.registrar_asistencia_actual_tx(v_tenant,v_actor,gen_random_uuid(),'entrada',v_key);
   RAISE EXCEPTION 'VERIFY_609_CHANGED_EMPLOYEE_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
   PERFORM public.registrar_asistencia_actual_tx(v_tenant,gen_random_uuid(),v_employee,'entrada',v_key);
   RAISE EXCEPTION 'VERIFY_609_FOREIGN_ACTOR_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   PERFORM public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'entrada','short');
   RAISE EXCEPTION 'VERIFY_609_SHORT_KEY_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
   PERFORM public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'entrada','verify-609-duplicate-'||gen_random_uuid());
   RAISE EXCEPTION 'VERIFY_609_DUPLICATE_ENTRY_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  v_exit:=public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'salida',v_exit_key);
  PERFORM pg_sleep(1.1);
  v_replay:=public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'salida',v_exit_key);
  IF v_exit->'data'->>'id' IS DISTINCT FROM v_entry->'data'->>'id' OR v_replay->'replayed'<>'true'::jsonb
   OR v_replay->'data' IS DISTINCT FROM v_exit->'data' OR (v_exit->'data'->>'hora_salida')::time<=(v_entry->'data'->>'hora_entrada')::time THEN
   RAISE EXCEPTION 'VERIFY_609_EXIT_REPLAY_CHANGED';
  END IF;
  IF public.registrar_asistencia_actual_tx(v_tenant,v_actor,v_employee,'entrada',v_key)->'data' IS DISTINCT FROM v_entry->'data' THEN
   RAISE EXCEPTION 'VERIFY_609_ENTRY_REPLAY_AFTER_EXIT_CHANGED';
  END IF;
  SELECT count(*) INTO v_count FROM public.asistencia WHERE tenant_id=v_tenant AND id_empleado=v_employee;
  IF v_count<>1 OR (SELECT count(*) FROM public.rrhh_operaciones_475 WHERE tenant_id=v_tenant AND idempotency_key IN(v_key,v_exit_key))<>2 THEN
   RAISE EXCEPTION 'VERIFY_609_DUPLICATE_ATTENDANCE_OR_RECEIPT';
  END IF;
 END LOOP;
END;
$verify$;
SELECT 'PASS609: reloj PE/CO/AR, replay entrada/salida, recibo original tras salida, aislamiento, conflicto y EXECUTE sólo service_role';
ROLLBACK;
