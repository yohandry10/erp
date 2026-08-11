\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_481_SOLO_ERP_E2E:%',current_database(); END IF; END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v_id uuid; r jsonb; rr jsonb; failed boolean;
BEGIN
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-481-'||left(t::text,8),'Tenant 481','Fixture','PE','test',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
 VALUES(u,t,'Actor','481','actor-'||left(u::text,8)||'@local.invalid','actor481','unused',true,'ACTIVO');
 r:=public.gestionar_consignacion_tx(t,u,'CREATE',null,
  '{"numero":"CON-481","fecha_registro":"2026-08-11","consignatario_nombre":"Cliente QA","cantidad":3,"valor_unitario":10.125,"moneda":"PEN"}',
  'verify-481-consignment-create'); v_id:=(r->>'id')::uuid;
 rr:=public.gestionar_consignacion_tx(t,u,'CREATE',null,
  '{"numero":"CON-481","fecha_registro":"2026-08-11","consignatario_nombre":"Cliente QA","cantidad":3,"valor_unitario":10.125,"moneda":"PEN"}',
  'verify-481-consignment-create');
 IF NOT (rr->>'idempotent')::boolean OR (SELECT valor_total FROM public.registro_consignaciones WHERE id=v_id)<>30.38 THEN
  RAISE EXCEPTION 'VERIFY_481_CREATE_FAILED'; END IF;
 PERFORM public.gestionar_consignacion_tx(t,u,'TRANSITION',v_id,'{"estado":"VENDIDA"}','verify-481-consignment-sold');
 PERFORM public.gestionar_consignacion_tx(t,u,'TRANSITION',v_id,'{"estado":"CERRADA"}','verify-481-consignment-close');
 failed:=false; BEGIN PERFORM public.gestionar_consignacion_tx(t,u,'TRANSITION',v_id,'{"estado":"PENDIENTE"}','verify-481-consignment-reopen');
 EXCEPTION WHEN OTHERS THEN failed:=position('TRANSITION_INVALID' in SQLERRM)>0; END;
 IF NOT failed OR (SELECT estado FROM public.registro_consignaciones WHERE registro_consignaciones.id=v_id)<>'CERRADA' THEN
  RAISE EXCEPTION 'VERIFY_481_TERMINAL_STATE_FAILED'; END IF;
 IF has_function_privilege('authenticated','public.gestionar_consignacion_tx(uuid,uuid,text,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('service_role','app.gestionar_consignacion_tx_481(uuid,uuid,text,uuid,jsonb,text)','EXECUTE')
  OR has_table_privilege('service_role','public.registro_consignaciones','UPDATE') THEN RAISE EXCEPTION 'VERIFY_481_ACL_FAILED'; END IF;
END $verify$;
ROLLBACK;
