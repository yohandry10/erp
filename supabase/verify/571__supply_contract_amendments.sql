\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.supply_reject(t uuid,a uuid,accion text,id uuid,payload jsonb,k text,expected text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    PERFORM public.operar_suministro_570(t,a,accion,id,payload,k);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM=expected THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'VERIFY_571_REJECTION_MISSING %',expected;
END $fn$;
DO $verify$
DECLARE
  t uuid; a uuid; ot uuid; oa uuid; cl uuid; pr uuid; pr2 uuid; c uuid; l uuid; l2 uuid; oc uuid; ol uuid; e uuid;
  d jsonb; p jsonb; amendment jsonb; change_oc jsonb; r jsonb; before_state jsonb; n integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_571_LOCAL_ONLY'; END IF;
  IF has_table_privilege('service_role','public.suministro_orden_lineas','UPDATE,SELECT')
    OR has_function_privilege('authenticated','public.operar_suministro_570(uuid,uuid,text,uuid,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_571_PRIVATE_BOUNDARY'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
    configured_at=now(),updated_at=now() WHERE singleton;
  d:=public.create_demo_tenant_ready_tx('VERIFY-571',14,'PE','verify-571-'||gen_random_uuid()::text);
  t:=(d->>'tenant_id')::uuid; a:=(d->>'user_id')::uuid;
  d:=public.create_demo_tenant_ready_tx('VERIFY-571-OTHER',14,'PE','verify-571-other-'||gen_random_uuid()::text);
  ot:=(d->>'tenant_id')::uuid; oa:=(d->>'user_id')::uuid;
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO pr FROM public.productos WHERE tenant_id=t AND activo AND unidad_medida IS NOT NULL ORDER BY id LIMIT 1;
  SELECT id INTO pr2 FROM public.productos WHERE tenant_id=t AND activo AND unidad_medida IS NOT NULL AND id<>pr ORDER BY id LIMIT 1;
  p:=jsonb_build_object('numero','SUP-571','cliente_id',cl,'asunto','Suministro con revisiones','moneda','PEN',
    'vigencia_desde','2026-01-01','vigencia_hasta','2026-12-31','responsable_id',a,
    'lineas',jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',12.345678)));
  r:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,p,'571-create'); c:=(r->>'id')::uuid;
  SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','571-activate');
  p:=jsonb_build_object('numero','OC-571','fecha_emision','2026-02-01','lineas',
    jsonb_build_array(jsonb_build_object('contrato_linea_id',l,'cantidad',60)));
  r:=public.operar_suministro_570(t,a,'CREAR_OC',c,p,'571-oc-create'); oc:=(r->>'id')::uuid;
  SELECT id INTO ol FROM public.suministro_orden_lineas WHERE orden_cliente_id=oc;
  r:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',40,
    'fecha_programada','2026-08-01','destino','Almacen cliente'),'571-schedule'); e:=(r->>'id')::uuid;
  amendment:=jsonb_build_object('version',2,'referencia','AD-001','motivo','Ampliacion acordada','asunto','Suministro ampliado',
    'vigencia_hasta','2027-03-31','responsable_id',a,'lineas',jsonb_build_array(
      jsonb_build_object('id',l,'producto_id',pr,'cantidad',120,'precio_unitario',20.123456),
      jsonb_build_object('producto_id',pr2,'cantidad',50,'precio_unitario',5)));
  before_state:=app.suministro_detalle_570(t,c);
  PERFORM pg_temp.supply_reject(t,a,'ADENDAR',c,amendment||jsonb_build_object('lineas',jsonb_build_array(
    jsonb_build_object('id',l,'producto_id',pr,'cantidad',59,'precio_unitario',20))),'571-too-small','SUPPLY_OC_EXCEEDS_CONTRACT');
  PERFORM pg_temp.supply_reject(t,a,'ADENDAR',c,amendment||'{"vigencia_hasta":"2026-07-31"}','571-shrink-date','SUPPLY_REVISION_DATE_CONFLICT');
  PERFORM pg_temp.supply_reject(t,a,'ADENDAR',c,amendment||'{"motivo":""}','571-no-reason','SUPPLY_REVISION_REQUIRED');
  PERFORM pg_temp.supply_reject(t,a,'ADENDAR',c,amendment||jsonb_build_object('lineas',jsonb_build_array(
    jsonb_build_object('id',l,'producto_id',pr2,'cantidad',120,'precio_unitario',20))),'571-swap-product','SUPPLY_REVISION_LINE_CONFLICT');
  IF before_state IS DISTINCT FROM app.suministro_detalle_570(t,c) THEN RAISE EXCEPTION 'VERIFY_571_REJECTED_CHANGED_STATE'; END IF;
  PERFORM public.operar_suministro_570(t,a,'ADENDAR',c,amendment,'571-amend');
  r:=public.operar_suministro_570(t,a,'ADENDAR',c,amendment,'571-amend');
  IF r->>'idempotent'<>'true' OR (SELECT precio_unitario FROM public.suministro_orden_lineas WHERE id=ol)<>12.345678
    OR (SELECT version FROM public.suministro_contratos WHERE id=c)<>3 THEN RAISE EXCEPTION 'VERIFY_571_AMEND_OR_PRICE'; END IF;
  PERFORM pg_temp.supply_reject(t,a,'ADENDAR',c,amendment,'571-stale','SUPPLY_VERSION_OR_STATE_CONFLICT');
  -- Misma referencia, aun con nueva clave y versión, revierte todo atómicamente.
  PERFORM pg_temp.supply_reject(t,a,'ADENDAR',c,amendment||'{"version":3}','571-duplicate-ref',
    'duplicate key value violates unique constraint "suministro_revision_referencia_571"');
  SELECT id INTO l2 FROM public.suministro_contrato_lineas WHERE contrato_id=c AND producto_id=pr2;
  change_oc:=jsonb_build_object('version',1,'referencia','MOD-001','motivo','Ajuste pedido cliente','numero','OC-571-R1',
    'fecha_emision','2026-02-02','lineas',jsonb_build_array(jsonb_build_object('contrato_linea_id',l,'cantidad',50),
      jsonb_build_object('contrato_linea_id',l2,'cantidad',10)));
  PERFORM pg_temp.supply_reject(t,a,'MODIFICAR_OC',oc,change_oc||jsonb_build_object('lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l,'cantidad',39))),'571-reduce-scheduled','SUPPLY_SCHEDULE_EXCEEDS_OC');
  PERFORM pg_temp.supply_reject(t,a,'MODIFICAR_OC',oc,change_oc||'{"fecha_emision":"2026-09-01"}',
    '571-move-after-schedule','SUPPLY_REVISION_DATE_CONFLICT');
  PERFORM pg_temp.supply_reject(t,a,'MODIFICAR_OC',oc,change_oc||jsonb_build_object('lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l2,'cantidad',1))),'571-remove-referenced','SUPPLY_REFERENCED_LINE');
  PERFORM public.operar_suministro_570(t,a,'MODIFICAR_OC',oc,change_oc,'571-modify');
  IF (SELECT cantidad FROM public.suministro_orden_lineas WHERE id=ol)<>50
    OR (SELECT precio_unitario FROM public.suministro_orden_lineas WHERE id=ol)<>12.345678
    OR (SELECT precio_unitario FROM public.suministro_orden_lineas WHERE orden_cliente_id=oc AND contrato_linea_id=l2)<>5 THEN
    RAISE EXCEPTION 'VERIFY_571_OC_IDENTITY_PRICE'; END IF;
  PERFORM pg_temp.supply_reject(t,a,'ANULAR_OC',oc,'{"version":2,"referencia":"AN-001","motivo":"Solicitud de cliente"}',
    '571-cancel-active-schedule','SUPPLY_OC_HAS_SCHEDULES');
  PERFORM public.operar_suministro_570(t,a,'ANULAR_ENTREGA',e,'{"version":1,"motivo":"Cliente cancelo entrega"}','571-cancel-delivery');
  -- Incluso la programación anulada debe conservarse referenciada.
  PERFORM pg_temp.supply_reject(t,a,'MODIFICAR_OC',oc,change_oc||jsonb_build_object('version',2,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l2,'cantidad',1))),'571-remove-cancelled-history','SUPPLY_REFERENCED_LINE');
  PERFORM public.operar_suministro_570(t,a,'ANULAR_OC',oc,'{"version":2,"referencia":"AN-001","motivo":"Solicitud de cliente"}','571-cancel-oc');
  d:=public.consultar_suministro_570(t,a,'DETALLE',c);
  IF d#>>'{lineas,0,cantidad_en_oc}'<>'0' OR (SELECT estado FROM public.suministro_ordenes_cliente WHERE id=oc)<>'ANULADA' THEN
    RAISE EXCEPTION 'VERIFY_571_CANCEL_BALANCE'; END IF;
  PERFORM pg_temp.supply_reject(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',1,
    'fecha_programada','2026-09-01','destino','Almacen cliente'),'571-schedule-cancelled-oc','SUPPLY_VERSION_OR_STATE_CONFLICT');
  -- El saldo liberado permite otra OC, al nuevo precio de la adenda.
  r:=public.operar_suministro_570(t,a,'CREAR_OC',c,p||'{"numero":"OC-571-NEW"}','571-oc-new-price');
  IF (SELECT precio_unitario FROM public.suministro_orden_lineas WHERE orden_cliente_id=(r->>'id')::uuid)<>20.123456 THEN
    RAISE EXCEPTION 'VERIFY_571_NEW_OC_PRICE'; END IF;
  r:=public.operar_suministro_570(t,a,'MODIFICAR_OC',oc,change_oc,'571-modify');
  IF r->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY_571_REPLAY_AFTER_CANCEL'; END IF;
  BEGIN
    PERFORM public.operar_suministro_570(ot,oa,'MODIFICAR_OC',oc,change_oc,'571-foreign-oc');
    RAISE EXCEPTION 'VERIFY_571_FOREIGN_OC';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.operar_suministro_570(t,oa,'ADENDAR',c,amendment,'571-foreign-actor');
    RAISE EXCEPTION 'VERIFY_571_FOREIGN_ACTOR';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM public.suministro_historial WHERE contrato_id=c AND referencia IS NOT NULL;
  IF n<>3 OR EXISTS(SELECT 1 FROM public.suministro_historial WHERE contrato_id=c AND referencia IS NOT NULL
    AND (anterior IS NULL OR actual IS NULL OR motivo IS NULL)) THEN RAISE EXCEPTION 'VERIFY_571_REVISION_HISTORY'; END IF;
  RAISE NOTICE 'VERIFY_571_OK: adendas, precios, OC, saldos, historial, aislamiento, rollback y replay';
END $verify$;
ROLLBACK;
