\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
  platform_user uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
  payload jsonb; first_result jsonb; replay jsonb; rejected boolean; before_count integer;
  original_zone text:=current_setting('TimeZone');
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_557_LOCAL_ONLY'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=now(),updated_at=now() WHERE singleton;
  INSERT INTO tenants(id,codigo,nombre,pais,plan,activo,estado)
    VALUES(t,'VERIFY-557-'||left(t::text,8),'Empresa local 557','PE','test',true,'ACTIVO');
  INSERT INTO usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado) VALUES
    (u,t,'Actor','557','actor557-'||u::text||'@local.invalid','actor557','unused',true,'ACTIVO'),
    (other_user,t,'Otro','557','otro557-'||other_user::text||'@local.invalid','otro557','unused',true,'ACTIVO');
  INSERT INTO usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado,is_super_admin)
    VALUES(platform_user,NULL,'Plataforma','557','platform557-'||platform_user::text||'@local.invalid',
      'platform557-'||left(platform_user::text,8),'unused',true,'ACTIVO',true);
  INSERT INTO plan_cuentas(id,tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES
    (c1,t,'63','Gasto','GASTO','GASTO',2,true,true,'ACTIVO'),
    (c2,t,'1041','Banco','ACTIVO','ACTIVO',2,true,true,'ACTIVO');
  INSERT INTO periodos_contables(tenant_id,anio,mes,estado) VALUES(t,2026,9,'ABIERTO');
  payload:=jsonb_build_object('fecha','2026-09-30T00:00:00.000Z','concepto','Asiento local','estado','BORRADOR',
    'detalles',jsonb_build_array(jsonb_build_object('cuenta_id',c1,'debe',10,'haber',0,'concepto','Gasto'),
      jsonb_build_object('cuenta_id',c2,'debe',0,'haber',10,'concepto','Banco')));
  first_result:=public.crear_asiento_manual_tx(t,u,payload,'verify-557-intent');
  replay:=public.crear_asiento_manual_tx(t,u,payload,'verify-557-intent');
  IF replay->>'asiento_id' IS DISTINCT FROM first_result->>'asiento_id' OR NOT (replay->>'idempotent')::boolean
    OR (SELECT count(*) FROM asientos_contables WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'VERIFY_557_REPLAY_DUPLICATED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.crear_asiento_manual_tx(t,u,payload||'{"concepto":"Otro"}', 'verify-557-intent');
    EXCEPTION WHEN OTHERS THEN rejected:=position('IDEMPOTENCY_CONFLICT' IN SQLERRM)>0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_557_CHANGED_PAYLOAD_ACCEPTED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.crear_asiento_manual_tx(t,other_user,payload,'verify-557-intent');
    EXCEPTION WHEN OTHERS THEN rejected:=position('IDEMPOTENCY_CONFLICT' IN SQLERRM)>0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_557_OTHER_ACTOR_ACCEPTED'; END IF;
  -- Fixture negativa de período. No acredita el proceso de cierre por API.
  PERFORM set_config('app.period_transition_458','on',true);
  UPDATE periodos_contables SET estado='CERRADO' WHERE tenant_id=t AND anio=2026 AND mes=9;
  PERFORM set_config('app.period_transition_458','off',true);
  replay:=public.crear_asiento_manual_tx(t,u,payload,'verify-557-intent');
  IF replay->>'asiento_id' IS DISTINCT FROM first_result->>'asiento_id' THEN RAISE EXCEPTION 'VERIFY_557_CLOSED_REPLAY_FAILED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.crear_asiento_manual_tx(t,u,payload,'verify-557-closed-new');
    EXCEPTION WHEN OTHERS THEN rejected:=position('PERIOD_NOT_OPEN' IN SQLERRM)>0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_557_CLOSED_PERIOD_ACCEPTED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.reabrir_periodo_contable_admin_tx(t,2026,9,u);
    EXCEPTION WHEN OTHERS THEN rejected:=position('CONFIGURATION_ACTOR_INVALID' IN SQLERRM)>0; END;
  IF NOT rejected OR (SELECT estado FROM periodos_contables WHERE tenant_id=t AND anio=2026 AND mes=9)<>'CERRADO'
    THEN RAISE EXCEPTION 'VERIFY_557_SCOPED_ACTOR_REOPENED'; END IF;
  replay:=public.reabrir_periodo_contable_admin_tx(t,2026,9,platform_user);
  IF replay #>> '{periodo,estado}' <> 'ABIERTO' THEN RAISE EXCEPTION 'VERIFY_557_PLATFORM_REOPEN_FAILED'; END IF;
  replay:=public.reabrir_periodo_contable_admin_tx(t,2026,9,platform_user);
  IF NOT (replay->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_557_REOPEN_REPLAY_FAILED'; END IF;
  PERFORM set_config('app.period_transition_458','on',true);
  UPDATE periodos_contables SET estado='ABIERTO' WHERE tenant_id=t AND anio=2026 AND mes=9;
  PERFORM set_config('app.period_transition_458','off',true);
  SELECT count(*) INTO before_count FROM financial_master_operations WHERE tenant_id=t;
  rejected:=false;
  BEGIN PERFORM public.crear_asiento_manual_tx(t,u,jsonb_set(payload,'{detalles,1,haber}','9'), 'verify-557-unbalanced');
    EXCEPTION WHEN OTHERS THEN rejected:=position('ASIENTO_NO_CUADRA' IN SQLERRM)>0; END;
  IF NOT rejected OR (SELECT count(*) FROM financial_master_operations WHERE tenant_id=t)<>before_count
    OR (SELECT count(*) FROM asientos_contables WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'VERIFY_557_FAILED_WRITE_LEFT_RESIDUE'; END IF;
  -- Instante 01/10 UTC pertenece a septiembre en Lima; octubre no está creado.
  PERFORM public.crear_asiento_manual_tx(t,u,payload||'{"fecha":"2026-10-01T02:30:00Z"}', 'verify-557-lima-boundary');
  IF current_setting('TimeZone') IS DISTINCT FROM original_zone THEN RAISE EXCEPTION 'VERIFY_557_SESSION_ZONE_LEAKED'; END IF;
  rejected:=false;
  BEGIN PERFORM public.crear_asiento_manual_tx(t,u,payload||'{"fecha":"2026-10-01T00:00:00Z"}', 'verify-557-calendar-boundary');
    EXCEPTION WHEN OTHERS THEN rejected:=position('PERIOD_NOT_OPEN' IN SQLERRM)>0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'VERIFY_557_CALENDAR_SHIFTED'; END IF;
  IF has_function_privilege('anon','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('service_role','app.crear_asiento_manual_tx_557(uuid,uuid,jsonb,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('anon','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_557_PRIVILEGES_INVALID';
  END IF;
END;
$verify$;
ROLLBACK;
