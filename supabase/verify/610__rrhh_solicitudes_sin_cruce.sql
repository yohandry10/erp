\set ON_ERROR_STOP on
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $guard$
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_610_LOCAL_ONLY';
 END IF;
 IF has_function_privilege('anon','app.rrhh_solicitud_sin_cruce_610()','EXECUTE')
 OR has_function_privilege('authenticated','app.rrhh_solicitud_sin_cruce_610()','EXECUTE')
 OR has_function_privilege('service_role','app.rrhh_solicitud_sin_cruce_610()','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_solicitudes_sin_cruce_610'
   AND tgrelid='public.solicitudes'::regclass AND NOT tgisinternal AND tgenabled='O') THEN
  RAISE EXCEPTION 'VERIFY_610_TRIGGER_OR_EXECUTE_INVALID';
 END IF;
END;
$guard$;
DO $verify$
DECLARE
 v_demo jsonb; v_tenant uuid; v_actor uuid; v_employee uuid; v_other uuid;
 v_a jsonb; v_replay jsonb; v_b jsonb; v_c jsonb; v_count bigint; v_key text:='verify-610-a-'||gen_random_uuid();
 req jsonb;
BEGIN
 v_demo:=public.create_demo_tenant_ready_tx('Verificación cruce610',14,'PE','verify-610-demo-'||gen_random_uuid(),NULL,NULL,NULL,'COMERCIO');
 v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;
 v_employee:=(public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'EMPLOYEE_CREATE',
  jsonb_build_object('nombres','Prueba','apellidos','Cruce610','tipo_documento','DNI','numero_documento','61000001'),
  'verify-610-employee-'||gen_random_uuid())->>'id')::uuid;
 v_other:=(public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'EMPLOYEE_CREATE',
  jsonb_build_object('nombres','Otra','apellidos','Cruce610','tipo_documento','DNI','numero_documento','61000002'),
  'verify-610-employee-'||gen_random_uuid())->>'id')::uuid;
 req:=jsonb_build_object('id_empleado',v_employee,'tipo','vacaciones','fecha_inicio','2026-12-14','fecha_fin','2026-12-16','motivo','Vacaciones 610');

 -- Alta original y reintento exacto: el replay no vuelve a insertar ni choca consigo mismo.
 v_a:=public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_CREATE',req,v_key);
 v_replay:=public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_CREATE',req,v_key);
 IF v_replay IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'VERIFY_610_REPLAY_CHANGED'; END IF;

 -- Otra alta que se cruza con una pendiente se rechaza sin guardar nada.
 BEGIN
  PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_CREATE',
   req||jsonb_build_object('fecha_inicio','2026-12-16','fecha_fin','2026-12-18','tipo','permiso'),'verify-610-b-'||gen_random_uuid());
  RAISE EXCEPTION 'VERIFY_610_OVERLAP_WITH_PENDING_ACCEPTED';
 EXCEPTION WHEN exclusion_violation THEN
  IF SQLERRM NOT LIKE 'RRHH_REQUEST_OVERLAP: estado=pendiente tipo=vacaciones desde=2026-12-14 hasta=2026-12-16%' THEN RAISE; END IF;
 END;

 -- Aprobar la original y repetir la decisión con la misma clave.
 PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_DECIDE',jsonb_build_object('id',v_a->>'id','decision','aprobada'),'verify-610-decide-a');
 PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_DECIDE',jsonb_build_object('id',v_a->>'id','decision','aprobada'),'verify-610-decide-a');

 -- Una solicitud histórica pendiente que se cruza (anterior a 610) no puede aprobarse.
 ALTER TABLE public.solicitudes DISABLE TRIGGER trg_solicitudes_sin_cruce_610;
 INSERT INTO public.solicitudes(tenant_id,id_empleado,fecha_inicio,fecha_fin,dias,tipo,estado,activo)
 VALUES(v_tenant,v_employee,'2026-12-15','2026-12-17',3,'vacaciones','pendiente',true) RETURNING to_jsonb(solicitudes.*) INTO v_b;
 ALTER TABLE public.solicitudes ENABLE TRIGGER trg_solicitudes_sin_cruce_610;
 BEGIN
  PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_DECIDE',jsonb_build_object('id',v_b->>'id','decision','aprobada'),'verify-610-decide-b');
  RAISE EXCEPTION 'VERIFY_610_OVERLAP_APPROVAL_ACCEPTED';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 -- Rechazarla sí se permite.
 PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_DECIDE',jsonb_build_object('id',v_b->>'id','decision','rechazada','observaciones','Cruce'),'verify-610-reject-b');

 -- Fechas contiguas, otro colaborador y una rechazada no cuentan como cruce.
 v_c:=public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_CREATE',
  req||jsonb_build_object('fecha_inicio','2026-12-17','fecha_fin','2026-12-17','tipo','permiso'),'verify-610-c-'||gen_random_uuid());
 PERFORM public.ejecutar_operacion_rrhh_tx(v_tenant,v_actor,'REQUEST_CREATE',
  req||jsonb_build_object('id_empleado',v_other),'verify-610-d-'||gen_random_uuid());

 SELECT count(*) INTO v_count FROM public.solicitudes WHERE tenant_id=v_tenant;
 IF v_count<>4 OR (SELECT count(*) FROM public.solicitudes WHERE tenant_id=v_tenant AND estado='aprobada')<>1 THEN
  RAISE EXCEPTION 'VERIFY_610_UNEXPECTED_ROWS:%',v_count;
 END IF;
END;
$verify$;
SELECT 'PASS610: replay exacto sin cruce, altas y aprobaciones solapadas rechazadas, rechazo permitido, contiguas y otro colaborador aceptados';
ROLLBACK;
