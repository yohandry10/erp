\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  demo jsonb; other_demo jsonb; t uuid; u uuid; other_t uuid; other_u uuid;
  second_actor uuid:=gen_random_uuid(); no_access uuid:=gen_random_uuid();
  admin_role uuid; payroll uuid; other_payroll uuid; body jsonb; changed jsonb;
  first_row public.rrhh_peru_presentaciones_planilla;
  replay public.rrhh_peru_presentaciones_planilla;
  new_row public.rrhh_peru_presentaciones_planilla;
  rejected boolean; count_before integer; intents_before integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_559_LOCAL_ONLY'; END IF;
  UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',
    allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  demo:=public.create_demo_tenant('VERIFY PLAME 559',1,'PE');
  other_demo:=public.create_demo_tenant('VERIFY PLAME 559 OTHER',1,'PE');
  t:=(demo->>'tenant_id')::uuid; u:=(demo->>'user_id')::uuid;
  other_t:=(other_demo->>'tenant_id')::uuid; other_u:=(other_demo->>'user_id')::uuid;
  UPDATE public.usuarios_sistema SET is_super_admin=false WHERE id IN (u,other_u);
  SELECT id INTO admin_role FROM public.roles WHERE tenant_id=t AND upper(nombre)='ADMIN_DEMO';
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,apellido,activo,estado,is_super_admin)
    VALUES(second_actor,t,'second559-'||t::text||'@example.test','Segundo','Local',true,'ACTIVO',false),
      (no_access,t,'denied559-'||t::text||'@example.test','Sin acceso','Local',true,'ACTIVO',false);
  INSERT INTO public.user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(second_actor,admin_role,t);
  payroll:=(public.crear_planilla_tx_495(t,'{"periodo":"2099-12","pais_codigo":"PE","moneda":"PEN"}',u,'verify-559-payroll')->>'id')::uuid;
  other_payroll:=(public.crear_planilla_tx_495(other_t,'{"periodo":"2099-12","pais_codigo":"PE","moneda":"PEN"}',other_u,'verify-559-payroll')->>'id')::uuid;
  body:=jsonb_build_object('planilla_id',payroll,'periodo','2099-12','notas',' Ensayo SQL local ',
    'idempotency_key','verify-559-intent','bloqueos',jsonb_build_array(jsonb_build_object('codigo','LOCAL_SQL_FIXTURE')),
    'fuente_corte_at',clock_timestamp(),'archivos','[]'::jsonb);
  first_row:=public.guardar_rrhh_peru_presentacion_tx(t,u,body);
  changed:=body||jsonb_build_object('fuente_corte_at',clock_timestamp(),'archivos',
    jsonb_build_array(jsonb_build_object('nombre','cambio-local.txt','contenido','otra fuente')));
  replay:=public.guardar_rrhh_peru_presentacion_tx(t,u,changed);
  IF to_jsonb(replay) IS DISTINCT FROM to_jsonb(first_row)
    OR first_row.version<>1 OR first_row.notas<>'Ensayo SQL local'
    OR (SELECT count(*) FROM public.rrhh_peru_presentaciones_planilla WHERE tenant_id=t AND planilla_id=payroll)<>1
    OR (SELECT count(*) FROM public.rrhh_operaciones_475 WHERE tenant_id=t AND operacion='PERU_PACKAGE_CREATE')<>1
    THEN RAISE EXCEPTION 'VERIFY_559_REPLAY_DUPLICATED_OR_SOURCE_CHANGED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,u,body||'{"notas":"Otra intención"}');
    EXCEPTION WHEN unique_violation THEN rejected:=SQLERRM='PLAME_IDEMPOTENCY_CONFLICT'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_CHANGED_NOTES_ACCEPTED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,second_actor,body);
    EXCEPTION WHEN unique_violation THEN rejected:=SQLERRM='PLAME_IDEMPOTENCY_CONFLICT'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_CHANGED_ACTOR_ACCEPTED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,no_access,body);
    EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_NO_PERMISSION_ACCEPTED'; END IF;
  UPDATE public.usuarios_sistema SET activo=false,estado='INACTIVO' WHERE id=u;
  IF (SELECT activo FROM public.usuarios_sistema WHERE id=u) THEN RAISE EXCEPTION 'VERIFY_559_INACTIVE_FIXTURE_INVALID'; END IF;
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,u,body);
    EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_INACTIVE_REPLAY_ACCEPTED'; END IF;
  UPDATE public.usuarios_sistema SET activo=true,estado='ACTIVO' WHERE id=u;
  UPDATE public.rol_permisos rp SET concedido=false FROM public.permisos p
    WHERE rp.role_id=admin_role AND rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='rrhh.planilla_electronica.write';
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,u,body);
    EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_REVOKED_REPLAY_ACCEPTED'; END IF;
  UPDATE public.rol_permisos rp SET concedido=true FROM public.permisos p
    WHERE rp.role_id=admin_role AND rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='rrhh.planilla_electronica.write';
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(other_t,other_u,body);
    EXCEPTION WHEN no_data_found THEN rejected:=SQLERRM='PLAME_PLANILLA_NOT_FOUND'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_FOREIGN_PLANILLA_ACCEPTED'; END IF;
  replay:=public.guardar_rrhh_peru_presentacion_tx(other_t,other_u,body||jsonb_build_object('planilla_id',other_payroll));
  IF replay.id=first_row.id OR replay.tenant_id<>other_t OR replay.version<>1
    THEN RAISE EXCEPTION 'VERIFY_559_TENANT_INTENTS_NOT_ISOLATED'; END IF;
  SELECT count(*) INTO intents_before FROM public.rrhh_operaciones_475 WHERE tenant_id=t AND operacion='PERU_PACKAGE_CREATE';
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,u,body||'{"periodo":"2099-11","idempotency_key":"verify-559-invalid-period"}');
    EXCEPTION WHEN no_data_found THEN rejected:=true; END;
  IF NOT rejected OR (SELECT count(*) FROM public.rrhh_operaciones_475 WHERE tenant_id=t AND operacion='PERU_PACKAGE_CREATE')<>intents_before
    THEN RAISE EXCEPTION 'VERIFY_559_FAILED_WRITE_LEFT_INTENT'; END IF;
  rejected:=false;
  BEGIN PERFORM public.guardar_rrhh_peru_presentacion_tx(t,u,body-'idempotency_key');
    EXCEPTION WHEN invalid_parameter_value THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_559_MISSING_KEY_ACCEPTED'; END IF;
  new_row:=public.guardar_rrhh_peru_presentacion_tx(t,u,changed||'{"idempotency_key":"verify-559-next-intent"}');
  IF new_row.version<>2 OR new_row.id=first_row.id OR new_row.archivos=first_row.archivos
    OR (SELECT count(*) FROM public.rrhh_peru_presentaciones_planilla WHERE tenant_id=t AND planilla_id=payroll AND vigente)<>1
    OR (SELECT archivos FROM public.rrhh_peru_presentaciones_planilla WHERE id=first_row.id) IS DISTINCT FROM first_row.archivos
    THEN RAISE EXCEPTION 'VERIFY_559_NEW_VERSION_OR_OLD_SOURCE_INVALID'; END IF;
  replay:=public.guardar_rrhh_peru_presentacion_tx(t,u,body);
  IF to_jsonb(replay) IS DISTINCT FROM to_jsonb(first_row)
    OR (SELECT count(*) FROM public.rrhh_peru_presentaciones_planilla WHERE tenant_id=t AND planilla_id=payroll)<>2
    THEN RAISE EXCEPTION 'VERIFY_559_OLD_REPLAY_CREATED_VERSION'; END IF;
  IF (SELECT count(*) FROM public.audit_log WHERE tenant_id=t AND metadata->>'accion'='PERU_PACKAGE_CREATE')<>2
    THEN RAISE EXCEPTION 'VERIFY_559_AUDIT_DUPLICATED'; END IF;
  IF has_function_privilege('anon','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_table_privilege('service_role','public.rrhh_operaciones_475','INSERT')
    OR has_table_privilege('authenticated','public.rrhh_operaciones_475','SELECT')
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.rrhh_operaciones_475'::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY_559_PRIVILEGES_INVALID'; END IF;
END;
$verify$;
ROLLBACK;
