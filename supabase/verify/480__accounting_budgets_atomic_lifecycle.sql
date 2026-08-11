\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_480_SOLO_ERP_E2E:%',current_database(); END IF; END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); cc uuid:=gen_random_uuid(); pc uuid:=gen_random_uuid();
 per uuid:=gen_random_uuid(); b uuid; r jsonb; rr jsonb; failed boolean;
BEGIN
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-480-'||left(t::text,8),'Tenant 480','Fixture','PE','test',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
 VALUES(u,t,'Actor','480','actor-'||left(u::text,8)||'@local.invalid','actor480','unused',true,'ACTIVO');
 INSERT INTO public.centros_costo(id,tenant_id,codigo,nombre,estado,activo) VALUES(cc,t,'CC-480','Centro 480','ACTIVO',true);
 INSERT INTO public.plan_cuentas(id,tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado)
 VALUES(pc,t,'63','Gastos','GASTO','GASTO',2,true,true,'ACTIVO');
 INSERT INTO public.periodos_contables(id,tenant_id,codigo,nombre,anio,mes,estado)
 VALUES(per,t,'2026-08','Agosto 2026',2026,8,'ABIERTO');
 r:=public.gestionar_presupuesto_tx(t,u,'CREATE',null,jsonb_build_object('centro_costo_id',cc,'cuenta_id',pc,
  'periodo_contable_id',per,'monto_presupuestado',1000,'notas','Inicial'),'verify-480-budget-create'); b:=(r->>'id')::uuid;
 rr:=public.gestionar_presupuesto_tx(t,u,'CREATE',null,jsonb_build_object('centro_costo_id',cc,'cuenta_id',pc,
  'periodo_contable_id',per,'monto_presupuestado',1000,'notas','Inicial'),'verify-480-budget-create');
 IF NOT (rr->>'idempotent')::boolean OR (rr->>'id')::uuid<>b THEN RAISE EXCEPTION 'VERIFY_480_RETRY_FAILED'; END IF;
 PERFORM public.gestionar_presupuesto_tx(t,u,'UPDATE',b,'{"monto_presupuestado":1200,"estado":"ACTIVO"}','verify-480-budget-update');
 IF (SELECT monto_presupuestado FROM public.presupuestos WHERE id=b)<>1200 THEN RAISE EXCEPTION 'VERIFY_480_UPDATE_FAILED'; END IF;
 PERFORM set_config('app.period_transition_458','on',true);
 UPDATE public.periodos_contables SET estado='CERRADO' WHERE id=per;
 failed:=false; BEGIN PERFORM public.gestionar_presupuesto_tx(t,u,'DELETE',b,'{}','verify-480-budget-delete-closed');
 EXCEPTION WHEN OTHERS THEN failed:=position('BUDGET_PERIOD_NOT_OPEN' in SQLERRM)>0; END;
 IF NOT failed OR NOT EXISTS(SELECT 1 FROM public.presupuestos WHERE id=b) THEN RAISE EXCEPTION 'VERIFY_480_CLOSED_PERIOD_NOT_PROTECTED'; END IF;
 UPDATE public.periodos_contables SET estado='ABIERTO' WHERE id=per;
 PERFORM set_config('app.period_transition_458','off',true);
 r:=public.gestionar_presupuesto_tx(t,u,'DELETE',b,'{}','verify-480-budget-delete');
 rr:=public.gestionar_presupuesto_tx(t,u,'DELETE',b,'{}','verify-480-budget-delete');
 IF EXISTS(SELECT 1 FROM public.presupuestos WHERE id=b) OR NOT (rr->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_480_DELETE_FAILED'; END IF;
 IF has_function_privilege('authenticated','public.gestionar_presupuesto_tx(uuid,uuid,text,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('service_role','app.gestionar_presupuesto_tx_480(uuid,uuid,text,uuid,jsonb,text)','EXECUTE')
  OR has_table_privilege('service_role','public.presupuestos','INSERT') THEN RAISE EXCEPTION 'VERIFY_480_ACL_FAILED'; END IF;
END $verify$;
ROLLBACK;
