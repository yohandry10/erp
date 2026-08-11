\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_482_SOLO_ERP_E2E:%',current_database(); END IF; END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE t uuid:=gen_random_uuid();u uuid:=gen_random_uuid();cc uuid;per uuid;fx uuid;r jsonb;rr jsonb;
BEGIN
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-482-'||left(t::text,8),'Tenant 482','Fixture','PE','test',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
 VALUES(u,t,'Actor','482','actor-'||left(u::text,8)||'@local.invalid','actor482','unused',true,'ACTIVO');
 r:=public.gestionar_maestro_contable_tx(t,u,'COST_CENTER','CREATE',null,'{"codigo":"CC-482","nombre":"Centro"}','verify-482-center-create');cc:=(r->>'id')::uuid;
 PERFORM public.gestionar_maestro_contable_tx(t,u,'COST_CENTER','UPDATE',cc,'{"nombre":"Centro actualizado"}','verify-482-center-update');
 IF (SELECT nombre FROM public.centros_costo WHERE id=cc)<>'Centro actualizado' THEN RAISE EXCEPTION 'VERIFY_482_CENTER_FAILED';END IF;
 r:=public.gestionar_maestro_contable_tx(t,u,'PERIOD','CREATE',null,'{"anio":2027,"mes":1}','verify-482-period-create');per:=(r->>'id')::uuid;
 rr:=public.gestionar_maestro_contable_tx(t,u,'PERIOD','CREATE',null,'{"anio":2027,"mes":1}','verify-482-period-create');
 IF NOT (rr->>'idempotent')::boolean OR (rr->>'id')::uuid<>per THEN RAISE EXCEPTION 'VERIFY_482_PERIOD_RETRY_FAILED';END IF;
 r:=public.gestionar_maestro_contable_tx(t,u,'FX','CREATE',null,'{"moneda_origen":"USD","moneda_destino":"PEN","fecha":"2026-08-11","compra":3.70,"venta":3.75}','verify-482-fx-create');fx:=(r->>'id')::uuid;
 PERFORM public.gestionar_maestro_contable_tx(t,u,'FX','DEACTIVATE',fx,'{}','verify-482-fx-deactivate');
 IF (SELECT activo FROM public.tipos_cambio WHERE id=fx) THEN RAISE EXCEPTION 'VERIFY_482_FX_DEACTIVATE_FAILED';END IF;
 IF has_function_privilege('authenticated','public.gestionar_maestro_contable_tx(uuid,uuid,text,text,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('service_role','app.gestionar_maestro_contable_tx_482(uuid,uuid,text,text,uuid,jsonb,text)','EXECUTE')
 OR has_table_privilege('service_role','public.centros_costo','UPDATE') OR has_table_privilege('service_role','public.tipos_cambio','INSERT')
 THEN RAISE EXCEPTION 'VERIFY_482_ACL_FAILED';END IF;
END $verify$;
ROLLBACK;
