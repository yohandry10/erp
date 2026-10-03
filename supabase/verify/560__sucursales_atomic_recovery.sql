\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION public.reject_assignment_verify560() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.sucursal_id::text=current_setting('verify560.reject_branch',true) THEN
  RAISE EXCEPTION 'VERIFY560_INSERT_FAILURE';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER reject_assignment_verify560 BEFORE INSERT ON public.usuario_sucursales
 FOR EACH ROW EXECUTE FUNCTION public.reject_assignment_verify560();
DO $verify$
DECLARE
 demo jsonb; other_demo jsonb; t uuid; u uuid; ot uuid; ou uuid;
 denied uuid:=gen_random_uuid(); second_actor uuid:=gen_random_uuid(); admin_role uuid;
 first_result jsonb; replay jsonb; b jsonb; main_id uuid; a_id uuid; b_id uuid;
 failed boolean; audit_before integer; intents_before integer; ids jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY560_LOCAL_ONLY'; END IF;
 UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
 demo:=public.create_demo_tenant('VERIFY 560 LOCAL',1,'PE');
 other_demo:=public.create_demo_tenant('VERIFY 560 FOREIGN',1,'PE');
 t:=(demo->>'tenant_id')::uuid;u:=(demo->>'user_id')::uuid;
 ot:=(other_demo->>'tenant_id')::uuid;ou:=(other_demo->>'user_id')::uuid;
 UPDATE public.usuarios_sistema SET is_super_admin=false WHERE id IN(u,ou);
 SELECT id INTO admin_role FROM public.roles WHERE tenant_id=t AND nombre='ADMIN_DEMO';
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,apellido,activo,estado,is_super_admin)
 VALUES(denied,t,'denied560-'||t::text||'@example.test','Sin','Permiso',true,'ACTIVO',false),
  (second_actor,t,'second560-'||t::text||'@example.test','Otro','Admin',true,'ACTIVO',false);
 INSERT INTO public.user_roles(tenant_id,usuario_sistema_id,role_id) VALUES(t,second_actor,admin_role);
 first_result:=public.mutar_sucursal_tx(t,u,'verify560-create','CREATE',NULL,'{"nombre":"Anexo local SQL"}');
 a_id:=(first_result->'sucursal'->>'id')::uuid;
 replay:=public.mutar_sucursal_tx(t,u,'verify560-create','CREATE',NULL,'{"nombre":"Anexo local SQL"}');
 IF first_result IS DISTINCT FROM replay-'idempotent' OR replay->>'idempotent'<>'true'
  OR (SELECT count(*) FROM public.sucursales WHERE tenant_id=t AND nombre='Anexo local SQL')<>1
  OR (SELECT count(*) FROM public.audit_log WHERE tenant_id=t AND metadata->>'source'='sucursales_560')<>1 THEN
  RAISE EXCEPTION 'VERIFY560_REPLAY_OR_AUDIT_DUPLICATED';
 END IF;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-create','CREATE',NULL,'{"nombre":"Cambio"}');
 EXCEPTION WHEN unique_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_BODY_CONFLICT_ACCEPTED'; END IF;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,second_actor,'verify560-create','CREATE',NULL,'{"nombre":"Anexo local SQL"}');
 EXCEPTION WHEN unique_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_ACTOR_CONFLICT_ACCEPTED'; END IF;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,denied,'verify560-denied','CREATE',NULL,'{"nombre":"Denied"}');
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_MISSING_PERMISSION_ACCEPTED'; END IF;
 UPDATE public.usuarios_sistema SET activo=false,estado='INACTIVO' WHERE id=u;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-create','CREATE',NULL,'{"nombre":"Anexo local SQL"}');
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_INACTIVE_REPLAY_ACCEPTED'; END IF;
 UPDATE public.usuarios_sistema SET activo=true,estado='ACTIVO' WHERE id=u;
 UPDATE public.rol_permisos rp SET concedido=false FROM public.permisos p
  WHERE rp.role_id=admin_role AND rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='configuracion.sucursales.create';
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-create','CREATE',NULL,'{"nombre":"Anexo local SQL"}');
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_REVOKED_REPLAY_ACCEPTED'; END IF;
 UPDATE public.rol_permisos rp SET concedido=true FROM public.permisos p
  WHERE rp.role_id=admin_role AND rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='configuracion.sucursales.create';
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'short','CREATE',NULL,'{"nombre":"Clave inválida"}');
 EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_BAD_KEY_ACCEPTED'; END IF;
 b:=public.mutar_sucursal_tx(t,u,'verify560-create-b','CREATE',NULL,'{"nombre":"Segundo anexo SQL"}');
 b_id:=(b->'sucursal'->>'id')::uuid;
 SELECT id INTO main_id FROM public.sucursales WHERE tenant_id=t AND es_principal;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-main','DEACTIVATE',main_id,'{}');
 EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_MAIN_DEACTIVATED'; END IF;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(ot,ou,'verify560-foreign','UPDATE',a_id,'{"nombre":"Ajena"}');
 EXCEPTION WHEN no_data_found THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_FOREIGN_BRANCH_UPDATED'; END IF;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-code-edit','UPDATE',a_id,'{"codigo_establecimiento":"9999"}');
 EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_CODE_CHANGED'; END IF;
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-foreign-user','ASSIGN',ou,'{"sucursal_ids":[]}');
 EXCEPTION WHEN no_data_found THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_FOREIGN_USER_ASSIGNED'; END IF;
 PERFORM public.mutar_sucursal_tx(t,u,'verify560-assign','ASSIGN',second_actor,jsonb_build_object('sucursal_ids',jsonb_build_array(a_id)));
 SELECT count(*) INTO audit_before FROM public.audit_log WHERE tenant_id=t;
 SELECT count(*) INTO intents_before FROM public.configuration_operation_intents WHERE tenant_id=t;
 PERFORM set_config('verify560.reject_branch',b_id::text,true);
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,u,'verify560-failure','ASSIGN',second_actor,jsonb_build_object('sucursal_ids',jsonb_build_array(b_id)));
 EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='VERIFY560_INSERT_FAILURE'; END;
 IF NOT failed OR (SELECT array_agg(sucursal_id) FROM public.usuario_sucursales WHERE tenant_id=t AND usuario_sistema_id=second_actor) IS DISTINCT FROM ARRAY[a_id]
  OR (SELECT count(*) FROM public.audit_log WHERE tenant_id=t)<>audit_before
  OR (SELECT count(*) FROM public.configuration_operation_intents WHERE tenant_id=t)<>intents_before THEN
  RAISE EXCEPTION 'VERIFY560_FAILED_REPLACEMENT_LOST_SCOPE_OR_LEFT_RESIDUES';
 END IF;
 PERFORM set_config('verify560.reject_branch','',true);
 failed:=false;
 BEGIN PERFORM public.mutar_sucursal_tx(t,second_actor,'verify560-scope','UPDATE',b_id,'{"nombre":"Fuera de alcance"}');
 EXCEPTION WHEN no_data_found THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY560_ASSIGNED_ACTOR_CHANGED_HIDDEN_BRANCH'; END IF;
 IF NOT has_function_privilege('service_role','public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY560_WRITER_ACL_INVALID';
 END IF;
END;
$verify$;
ROLLBACK;
