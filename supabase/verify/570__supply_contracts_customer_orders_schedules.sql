\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  t uuid; a uuid; other_t uuid; other_a uuid; d jsonb; payload jsonb; r jsonb; r2 jsonb;
  c uuid; line uuid; ol uuid; delivery uuid; client uuid; product uuid; foreign_id uuid; tab text; fn regprocedure;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_570_LOCAL_ONLY'; END IF;
  FOREACH tab IN ARRAY ARRAY['suministro_contratos','suministro_contrato_lineas','suministro_ordenes_cliente',
    'suministro_orden_lineas','suministro_entregas_programadas','suministro_historial','suministro_operaciones'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity)
      OR has_table_privilege('service_role','public.'||tab,'INSERT,UPDATE,DELETE,SELECT')
      OR has_table_privilege('authenticated','public.'||tab,'INSERT,UPDATE,DELETE,SELECT')
      OR has_table_privilege('anon','public.'||tab,'INSERT,UPDATE,DELETE,SELECT') THEN
      RAISE EXCEPTION 'VERIFY_570_TABLE_NOT_PRIVATE %',tab;
    END IF;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY[
    'public.operar_suministro_570(uuid,uuid,text,uuid,jsonb,text)'::regprocedure,
    'public.consultar_suministro_570(uuid,uuid,text,uuid,text,integer,integer)'::regprocedure] LOOP
    IF NOT has_function_privilege('service_role',fn,'EXECUTE') OR has_function_privilege('anon',fn,'EXECUTE')
      OR has_function_privilege('authenticated',fn,'EXECUTE')
      OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND prosecdef AND pg_get_userbyid(proowner)='postgres') THEN
      RAISE EXCEPTION 'VERIFY_570_RPC_ACL_INVALID %',fn; END IF;
  END LOOP;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=now(),updated_at=now() WHERE singleton;
  d:=public.create_demo_tenant_ready_tx('VERIFY-570',14,'PE','verify-570-'||gen_random_uuid()::text);
  t:=(d->>'tenant_id')::uuid; a:=(d->>'user_id')::uuid;
  d:=public.create_demo_tenant_ready_tx('VERIFY-570-OTHER',14,'PE','verify-570-other-'||gen_random_uuid()::text);
  other_t:=(d->>'tenant_id')::uuid; other_a:=(d->>'user_id')::uuid;
  SELECT id INTO client FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO product FROM public.productos WHERE tenant_id=t AND activo AND unidad_medida IS NOT NULL ORDER BY id LIMIT 1;
  IF client IS NULL OR product IS NULL THEN RAISE EXCEPTION 'VERIFY_570_FIXTURE_MISSING'; END IF;
  payload:=jsonb_build_object('numero','SUP-001','cliente_id',client,'asunto','Suministro verificador',
    'moneda','PEN','vigencia_desde','2026-01-01','vigencia_hasta','2026-12-31','responsable_id',a,
    'lineas',jsonb_build_array(jsonb_build_object('producto_id',product,'cantidad',100,'precio_unitario',12.345678)));
  r:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,payload,'verify-570-create'); c:=(r->>'id')::uuid;
  r2:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,payload,'verify-570-create');
  IF r2->>'id'<>r->>'id' OR (r2->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'VERIFY_570_REPLAY'; END IF;
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,payload||'{"asunto":"Diferente"}','verify-570-create');
    RAISE EXCEPTION 'VERIFY_570_COLLISION_ALLOWED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.operar_suministro_570(t,other_a,'CREAR_CONTRATO',NULL,payload,'verify-570-foreign-actor');
    RAISE EXCEPTION 'VERIFY_570_FOREIGN_ACTOR_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.consultar_suministro_570(other_t,other_a,'DETALLE',c);
    RAISE EXCEPTION 'VERIFY_570_FOREIGN_READ_ALLOWED';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  SELECT id INTO foreign_id FROM public.clientes WHERE tenant_id=other_t AND activo ORDER BY id LIMIT 1;
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,
      payload||jsonb_build_object('cliente_id',foreign_id,'numero','FOREIGN-CLIENT'),'verify-570-foreign-client');
    RAISE EXCEPTION 'VERIFY_570_FOREIGN_CLIENT_ALLOWED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SUPPLY_PARTY_INVALID' THEN RAISE; END IF; END;
  SELECT id INTO foreign_id FROM public.productos WHERE tenant_id=other_t AND activo ORDER BY id LIMIT 1;
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,payload||jsonb_build_object('numero','FOREIGN-PRODUCT',
      'lineas',jsonb_build_array(jsonb_build_object('producto_id',foreign_id,'cantidad',1,'precio_unitario',1))),'verify-570-foreign-product');
    RAISE EXCEPTION 'VERIFY_570_FOREIGN_PRODUCT_ALLOWED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SUPPLY_PRODUCT_INVALID' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.suministro_contratos WHERE tenant_id=t AND numero IN ('FOREIGN-CLIENT','FOREIGN-PRODUCT')) THEN
    RAISE EXCEPTION 'VERIFY_570_INVALID_CONTRACT_ORPHAN'; END IF;
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'CREAR_OC',c,'{}','verify-570-inactive');
    RAISE EXCEPTION 'VERIFY_570_INACTIVE_ALLOWED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- Editing a draft replaces its lines atomically and preserves a snapshot.
  PERFORM public.operar_suministro_570(t,a,'EDITAR_BORRADOR',c,payload||'{"version":1,"asunto":"Suministro editado"}','verify-570-edit');
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','verify-570-stale');
    RAISE EXCEPTION 'VERIFY_570_STALE_ALLOWED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":2}','verify-570-activate');
  SELECT id INTO line FROM public.suministro_contrato_lineas WHERE contrato_id=c AND tenant_id=t;
  payload:=jsonb_build_object('numero','OC-001','fecha_emision','2026-02-01',
    'lineas',jsonb_build_array(jsonb_build_object('contrato_linea_id',line,'cantidad',60)));
  r:=public.operar_suministro_570(t,a,'CREAR_OC',c,payload,'verify-570-oc');
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC-EXCESS','fecha_emision','2026-02-01',
      'lineas',jsonb_build_array(jsonb_build_object('contrato_linea_id',line,'cantidad',41))),'verify-570-excess');
    RAISE EXCEPTION 'VERIFY_570_EXCESS_ALLOWED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SUPPLY_OC_EXCEEDS_CONTRACT' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.suministro_ordenes_cliente WHERE tenant_id=t AND numero='OC-EXCESS') THEN RAISE EXCEPTION 'VERIFY_570_ORPHAN'; END IF;
  SELECT id INTO ol FROM public.suministro_orden_lineas WHERE tenant_id=t AND orden_cliente_id=(r->>'id')::uuid;
  payload:=jsonb_build_object('orden_linea_id',ol,'cantidad',40,'fecha_programada','2026-03-01','destino','Almacén del cliente');
  r:=public.operar_suministro_570(t,a,'PROGRAMAR',c,payload,'verify-570-schedule'); delivery:=(r->>'id')::uuid;
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'PROGRAMAR',c,payload||'{"cantidad":21}','verify-570-schedule-excess');
    RAISE EXCEPTION 'VERIFY_570_SCHEDULE_EXCESS_ALLOWED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SUPPLY_SCHEDULE_EXCEEDS_OC' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'PROGRAMAR',c,payload||'{"cantidad":1,"fecha_programada":"2027-01-01"}','verify-570-date');
    RAISE EXCEPTION 'VERIFY_570_DATE_ALLOWED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  r:=public.operar_suministro_570(t,a,'REPROGRAMAR',delivery,
    '{"version":1,"fecha_programada":"2026-03-10","destino":"Nuevo almacén","motivo":"Cambio solicitado por el cliente"}','verify-570-reschedule');
  IF NOT EXISTS(SELECT 1 FROM public.suministro_entregas_programadas WHERE id=delivery AND fecha_original='2026-03-01'
    AND fecha_programada='2026-03-10' AND version=2) THEN RAISE EXCEPTION 'VERIFY_570_ORIGINAL_LOST'; END IF;
  PERFORM public.operar_suministro_570(t,a,'ANULAR_ENTREGA',delivery,'{"version":2,"motivo":"Se reemplaza la programación"}','verify-570-cancel');
  -- A lost response can be recovered even after a later transition.
  r2:=public.operar_suministro_570(t,a,'REPROGRAMAR',delivery,
    '{"version":1,"fecha_programada":"2026-03-10","destino":"Nuevo almacén","motivo":"Cambio solicitado por el cliente"}','verify-570-reschedule');
  IF (r2->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'VERIFY_570_LATE_REPLAY'; END IF;
  PERFORM public.operar_suministro_570(t,a,'PROGRAMAR',c,payload||'{"cantidad":60}','verify-570-replace');
  d:=public.consultar_suministro_570(t,a,'DETALLE',c);
  IF (d->'lineas'->0->>'cantidad_en_oc')::numeric<>60
    OR (d->'ordenes'->0->'lineas'->0->>'cantidad_programada')::numeric<>60
    OR jsonb_array_length(d->'historial')<>8 THEN RAISE EXCEPTION 'VERIFY_570_BALANCES_OR_HISTORY'; END IF;
  d:=public.consultar_suministro_570(t,a,'LISTAR',NULL,'SUP-001',1,1);
  IF (d->>'total')::integer<>1 OR jsonb_array_length(d->'items')<>1 THEN RAISE EXCEPTION 'VERIFY_570_LIST'; END IF;
  -- Permission revoked in DB: neither service-role RPC nor a previous key bypass it.
  UPDATE public.rol_permisos rp SET concedido=false FROM public.permisos p
    WHERE rp.permiso_id=p.id AND p.tenant_id=t AND p.codigo='ventas.contratos.gestionar';
  BEGIN
    PERFORM public.operar_suministro_570(t,a,'PROGRAMAR',c,payload,'verify-570-schedule');
    RAISE EXCEPTION 'VERIFY_570_REVOKED_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.consultar_suministro_570(t,a,'DETALLE',c);
END $verify$;
ROLLBACK;
