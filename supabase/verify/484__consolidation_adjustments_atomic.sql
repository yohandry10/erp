\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_484_SOLO_ERP_E2E:%',current_database();END IF;END $$;
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;
DO $verify$
DECLARE c uuid:=gen_random_uuid();m uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g uuid:=gen_random_uuid();r jsonb;rr jsonb;
BEGIN
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado) VALUES
 (c,'VERIFY-484-C-'||left(c::text,6),'Controladora','Fixture','PE','test',true,'ACTIVO'),
 (m,'VERIFY-484-M-'||left(m::text,6),'Miembro','Fixture','PE','test',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
 VALUES(u,c,'Actor','484','actor-'||left(u::text,8)||'@local.invalid','actor484','unused',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais_id,moneda_defecto,nombre) VALUES(c,1,'PEN','Controladora'),(m,1,'USD','Miembro');
 INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo) VALUES
 (c,'1212','Cuenta destino','ACTIVO','ACTIVO',4,true,true),(m,'1101','Cuenta origen','ACTIVO','ACTIVO',4,true,true);
 INSERT INTO public.grupos_consolidacion(id,tenant_id,codigo,nombre,moneda_presentacion,created_by)
 VALUES(g,c,'G-484','Grupo 484','PEN',u::text);
 INSERT INTO public.grupos_consolidacion_miembros(grupo_id,tenant_id,estado,es_controladora,aceptado_por,aceptado_en) VALUES
 (g,c,'ACTIVO',true,u::text,now()),(g,m,'ACTIVO',false,u::text,now());
 r:=public.gestionar_consolidacion_tx(c,u,g,'RATE',jsonb_build_object('tenant_miembro_id',m,'fecha','2026-08-11','tipo','CIERRE','factor_conversion',3.75),'verify-484-rate');
 rr:=public.gestionar_consolidacion_tx(c,u,g,'RATE',jsonb_build_object('tenant_miembro_id',m,'fecha','2026-08-11','tipo','CIERRE','factor_conversion',3.75),'verify-484-rate');
 IF NOT (rr->>'idempotent')::boolean OR (SELECT count(*) FROM public.tipos_cambio_consolidacion WHERE grupo_id=g)<>1 THEN RAISE EXCEPTION 'VERIFY_484_RATE_RETRY_FAILED';END IF;
 PERFORM public.gestionar_consolidacion_tx(c,u,g,'ACCOUNT_MAP',jsonb_build_object('tenant_miembro_id',m,'cuenta_codigo_origen','1101','cuenta_codigo_destino','1212'),'verify-484-map');
 IF (SELECT cuenta_codigo_destino FROM public.mapeos_cuentas_consolidacion WHERE grupo_id=g)<>'1212' THEN RAISE EXCEPTION 'VERIFY_484_MAP_FAILED';END IF;
 PERFORM public.gestionar_consolidacion_tx(c,u,g,'ADJUSTMENT',jsonb_build_object('fecha','2026-08-11','tipo','ELIMINACION','cuenta_codigo','1212','descripcion','Eliminación 484','debe',25,'haber',0),'verify-484-adjustment');
 IF (SELECT count(*) FROM public.ajustes_consolidacion WHERE grupo_id=g)<>1 THEN RAISE EXCEPTION 'VERIFY_484_ADJUSTMENT_FAILED';END IF;
 BEGIN
  PERFORM public.gestionar_consolidacion_tx(c,u,g,'ADJUSTMENT',jsonb_build_object('fecha','2026-08-11','tipo','ELIMINACION','cuenta_codigo','1212','descripcion','Distinto','debe',30,'haber',0),'verify-484-adjustment');
  RAISE EXCEPTION 'VERIFY_484_CONFLICT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%CONSOLIDATION_IDEMPOTENCY_CONFLICT%' THEN RAISE;END IF;END;
 IF has_function_privilege('authenticated','public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('service_role','app.gestionar_consolidacion_tx_484(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
 OR has_table_privilege('service_role','public.ajustes_consolidacion','INSERT')
 OR NOT has_function_privilege('service_role','public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'VERIFY_484_ACL_FAILED';END IF;
END $verify$;
ROLLBACK;
