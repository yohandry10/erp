\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_479_SOLO_ERP_E2E:%',current_database(); END IF; END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
 a uuid; d uuid; r jsonb; rr jsonb; failed boolean;
BEGIN
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-479-'||left(t::text,8),'Tenant 479','Fixture','PE','test',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
 VALUES(u,t,'Actor','479','actor-'||left(u::text,8)||'@local.invalid','actor479','unused',true,'ACTIVO');
 INSERT INTO public.plan_cuentas(id,tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES
 (c1,t,'18','Servicios anticipados','ACTIVO','ACTIVO',2,true,true,'ACTIVO'),
 (c2,t,'63','Servicios','GASTO','GASTO',2,true,true,'ACTIVO');
 r:=public.gestionar_activo_diferido_tx(t,u,'ASSET','CREATE',null,
  '{"codigo":"AF-479","nombre":"Equipo","fecha_adquisicion":"2026-01-01","valor_adquisicion":1200,"valor_residual":0,"vida_util_meses":12}',
  'verify-479-asset-create'); a:=(r->>'id')::uuid;
 rr:=public.gestionar_activo_diferido_tx(t,u,'ASSET','CREATE',null,
  '{"codigo":"AF-479","nombre":"Equipo","fecha_adquisicion":"2026-01-01","valor_adquisicion":1200,"valor_residual":0,"vida_util_meses":12}',
  'verify-479-asset-create');
 IF NOT (rr->>'idempotent')::boolean OR (rr->>'id')::uuid<>a THEN RAISE EXCEPTION 'VERIFY_479_ASSET_RETRY_FAILED'; END IF;
 PERFORM public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',a,'{"nombre":"Equipo actualizado","valor_residual":100}',
  'verify-479-asset-update');
 IF (SELECT nombre FROM public.activos_fijos WHERE id=a)<>'Equipo actualizado' THEN RAISE EXCEPTION 'VERIFY_479_ASSET_UPDATE_FAILED'; END IF;
 failed:=false; BEGIN PERFORM public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',a,'{"valor_residual":1300}',
  'verify-479-asset-invalid'); EXCEPTION WHEN OTHERS THEN failed:=position('ASSET_RESIDUAL_INVALID' in SQLERRM)>0; END;
 IF NOT failed THEN RAISE EXCEPTION 'VERIFY_479_ASSET_INVALID_NOT_REJECTED'; END IF;

 r:=public.gestionar_activo_diferido_tx(t,u,'DEFERRED','CREATE',null,jsonb_build_object('codigo','DIF-479','nombre','Seguro',
  'tipo','GASTO','cuenta_diferido_id',c1,'cuenta_resultado_id',c2,'monto_total',120,'periodos',12,'fecha_inicio','2026-01-01'),
  'verify-479-deferred-create'); d:=(r->>'id')::uuid;
 PERFORM public.gestionar_activo_diferido_tx(t,u,'DEFERRED','CANCEL',d,'{}','verify-479-deferred-cancel');
 rr:=public.gestionar_activo_diferido_tx(t,u,'DEFERRED','CANCEL',d,'{}','verify-479-deferred-cancel');
 IF (SELECT estado FROM public.diferidos WHERE id=d)<>'CANCELADO' OR NOT (rr->>'idempotent')::boolean THEN
  RAISE EXCEPTION 'VERIFY_479_DEFERRED_CANCEL_FAILED'; END IF;
 IF has_function_privilege('authenticated','public.gestionar_activo_diferido_tx(uuid,uuid,text,text,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('service_role','app.gestionar_activo_diferido_tx_479(uuid,uuid,text,text,uuid,jsonb,text)','EXECUTE')
  OR has_table_privilege('service_role','public.activos_fijos','UPDATE') OR has_table_privilege('service_role','public.diferidos','INSERT') THEN
  RAISE EXCEPTION 'VERIFY_479_ACL_FAILED'; END IF;
END $verify$;
ROLLBACK;
