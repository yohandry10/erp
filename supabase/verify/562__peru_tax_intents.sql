\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 demo jsonb; other_demo jsonb; t uuid; u uuid; other_t uuid; other_u uuid;
 second_actor uuid:=gen_random_uuid(); denied_actor uuid:=gen_random_uuid(); admin_role uuid;
 request jsonb:='{"periodo":"2025-09","notas":"LOCAL_SQL"}';
 payload jsonb:='{"periodo":"2025-09","regimen":"MYPE","warnings":[]}';
 first_row jsonb; replay jsonb; next_row jsonb; presented jsonb; annual jsonb;
 receipt jsonb:='{"constancia":"LOCAL-SQL-SIMULADA-NO-ENVIADA","fecha_presentacion":null}';
 rejected boolean; intents_before integer; monthly_before integer;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_562_LOCAL_ONLY'; END IF;
 UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',
   allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
 demo:=public.create_demo_tenant('VERIFY TAX 562',1,'PE');
 other_demo:=public.create_demo_tenant('VERIFY TAX 562 OTHER',1,'PE');
 t:=(demo->>'tenant_id')::uuid;u:=(demo->>'user_id')::uuid;
 other_t:=(other_demo->>'tenant_id')::uuid;other_u:=(other_demo->>'user_id')::uuid;
 UPDATE public.usuarios_sistema SET is_super_admin=false WHERE id IN(u,other_u);
 SELECT id INTO admin_role FROM public.roles WHERE tenant_id=t AND upper(nombre)='ADMIN_DEMO';
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,apellido,activo,estado,is_super_admin)
 VALUES(second_actor,t,'second562-'||t::text||'@example.test','Segundo','Local',true,'ACTIVO',false),
 (denied_actor,t,'denied562-'||t::text||'@example.test','Sin acceso','Local',true,'ACTIVO',false);
 INSERT INTO public.user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(second_actor,admin_role,t);
 replay:=public.mutar_tributo_peru_tx(t,u,'verify-562-monthly','MONTHLY_SAVE',null,request,null);
 IF replay<> '{"pending":true}'::jsonb OR EXISTS(SELECT 1 FROM tributos_operaciones_562 WHERE tenant_id=t)
 THEN RAISE EXCEPTION 'VERIFY_562_LOOKUP_WROTE_DATA'; END IF;
 first_row:=public.mutar_tributo_peru_tx(t,u,'verify-562-monthly','MONTHLY_SAVE',null,request,payload);
 replay:=public.mutar_tributo_peru_tx(t,u,'verify-562-monthly','MONTHLY_SAVE',null,request,payload||'{"saldo_favor_anterior":50}');
 IF replay IS DISTINCT FROM first_row OR (first_row->>'version')::integer<>1
 OR (SELECT count(*) FROM tributos_declaraciones_mensuales WHERE tenant_id=t)<>1
 THEN RAISE EXCEPTION 'VERIFY_562_REPLAY_NOT_FROZEN'; END IF;
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(t,u,'verify-562-monthly','MONTHLY_SAVE',null,request||'{"notas":"changed"}',null);
 EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_562_CHANGED_BODY_ACCEPTED'; END IF;
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(t,second_actor,'verify-562-monthly','MONTHLY_SAVE',null,request,null);
 EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_562_CHANGED_ACTOR_ACCEPTED'; END IF;
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(t,denied_actor,'verify-562-monthly','MONTHLY_SAVE',null,request,null);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_562_NO_PERMISSION_ACCEPTED'; END IF;
 UPDATE public.usuarios_sistema SET activo=false,estado='INACTIVO' WHERE id=u;
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(t,u,'verify-562-monthly','MONTHLY_SAVE',null,request,null);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_562_INACTIVE_REPLAY_ACCEPTED'; END IF;
 UPDATE public.usuarios_sistema SET activo=true,estado='ACTIVO' WHERE id=u;
 UPDATE public.rol_permisos rp SET concedido=false FROM public.permisos p
 WHERE rp.role_id=admin_role AND rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='contabilidad.reportes.actualizar';
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(t,u,'verify-562-monthly','MONTHLY_SAVE',null,request,null);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_562_REVOKED_REPLAY_ACCEPTED'; END IF;
 UPDATE public.rol_permisos rp SET concedido=true FROM public.permisos p
 WHERE rp.role_id=admin_role AND rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='contabilidad.reportes.actualizar';
 presented:=public.mutar_tributo_peru_tx(t,u,'verify-562-receipt','MONTHLY_RECEIPT',(first_row->>'id')::uuid,receipt,'{}');
 IF presented->>'estado'<>'PRESENTADA' OR public.mutar_tributo_peru_tx(t,u,'verify-562-receipt','MONTHLY_RECEIPT',(first_row->>'id')::uuid,receipt,null) IS DISTINCT FROM presented
 THEN RAISE EXCEPTION 'VERIFY_562_RECEIPT_REPLAY_INVALID'; END IF;
 next_row:=public.mutar_tributo_peru_tx(t,u,'verify-562-next','MONTHLY_SAVE',null,request,payload);
 IF (SELECT estado FROM tributos_declaraciones_mensuales WHERE id=(first_row->>'id')::uuid)<>'PRESENTADA'
 OR (next_row->>'version')::integer<>2 THEN RAISE EXCEPTION 'VERIFY_562_PREMATURE_RECTIFICATION'; END IF;
 PERFORM public.mutar_tributo_peru_tx(t,u,'verify-562-receipt-next','MONTHLY_RECEIPT',(next_row->>'id')::uuid,receipt,'{}');
 IF (SELECT estado FROM tributos_declaraciones_mensuales WHERE id=(first_row->>'id')::uuid)<>'RECTIFICADA'
 OR public.mutar_tributo_peru_tx(t,u,'verify-562-receipt','MONTHLY_RECEIPT',(first_row->>'id')::uuid,receipt,null) IS DISTINCT FROM presented
 THEN RAISE EXCEPTION 'VERIFY_562_RECTIFICATION_OR_OLD_REPLAY_INVALID'; END IF;
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(other_t,other_u,'verify-562-foreign','MONTHLY_RECEIPT',(first_row->>'id')::uuid,receipt,'{}');
 EXCEPTION WHEN no_data_found THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_562_FOREIGN_RECEIPT_ACCEPTED'; END IF;
 replay:=public.mutar_tributo_peru_tx(other_t,other_u,'verify-562-monthly','MONTHLY_SAVE',null,request,payload);
 IF replay->>'tenant_id'<>other_t::text OR replay->>'id'=first_row->>'id' OR (replay->>'version')::integer<>1
 THEN RAISE EXCEPTION 'VERIFY_562_TENANTS_NOT_ISOLATED'; END IF;
 SELECT count(*) INTO intents_before FROM tributos_operaciones_562 WHERE tenant_id=t;
 SELECT count(*) INTO monthly_before FROM tributos_declaraciones_mensuales WHERE tenant_id=t;
 rejected:=false;
 BEGIN PERFORM public.mutar_tributo_peru_tx(t,u,'verify-562-bad-write','MONTHLY_SAVE',null,request,payload||'{"regimen":"INVALID"}');
 EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected OR (SELECT count(*) FROM tributos_operaciones_562 WHERE tenant_id=t)<>intents_before
 OR (SELECT count(*) FROM tributos_declaraciones_mensuales WHERE tenant_id=t)<>monthly_before
 THEN RAISE EXCEPTION 'VERIFY_562_FAILED_WRITE_LEFT_INTENT'; END IF;
 annual:=public.mutar_tributo_peru_tx(t,u,'verify-562-annual','ANNUAL_SAVE',null,'{"ejercicio":2025}',
 '{"ejercicio":2025,"regimen":"MYPE","formulario":"FV710_SIMPLIFICADO","uit":5350,"warnings":[]}');
 presented:=public.mutar_tributo_peru_tx(t,u,'verify-562-annual-receipt','ANNUAL_RECEIPT',(annual->>'id')::uuid,receipt,'{}');
 IF public.mutar_tributo_peru_tx(t,u,'verify-562-annual-receipt','ANNUAL_RECEIPT',(annual->>'id')::uuid,receipt,null) IS DISTINCT FROM presented
 THEN RAISE EXCEPTION 'VERIFY_562_ANNUAL_RECEIPT_REPLAY_INVALID'; END IF;
 IF has_table_privilege('service_role','public.tributos_operaciones_562','SELECT')
 OR has_table_privilege('service_role','public.tributos_operaciones_562','INSERT')
 OR has_table_privilege('authenticated','public.tributos_operaciones_562','SELECT')
 OR has_function_privilege('anon','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.tributos_operaciones_562'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'VERIFY_562_PRIVILEGES_INVALID'; END IF;
END;
$verify$;
ROLLBACK;
