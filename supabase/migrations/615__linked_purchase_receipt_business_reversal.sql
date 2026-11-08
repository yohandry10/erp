-- Anulación empresarial: cumplimiento, stock y outbox comparten el commit.
-- La contabilidad conserva el asiento original y crea su opuesto enlazado.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.recepciones
  ADD COLUMN anulado_at timestamptz,
  ADD COLUMN anulado_por uuid REFERENCES public.usuarios_sistema(id),
  ADD COLUMN motivo_anulacion text,
  ADD COLUMN inventario_reversa_id uuid REFERENCES public.inventario_reversas(id);

CREATE FUNCTION app.receipt_reversal_request_615(p_actor uuid,p_receipt uuid,p_payload jsonb,p_key text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE m text:=btrim(coalesce(p_payload->>'motivo',''));d date;
BEGIN
 IF p_actor IS NULL OR p_receipt IS NULL OR length(btrim(coalesce(p_key,''))) NOT BETWEEN 8 AND 180
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string' OR length(m) NOT BETWEEN 5 AND 500 OR m!~'[^[:space:]]'
  OR jsonb_typeof(p_payload->'fecha_contable') IS DISTINCT FROM 'string'
  OR coalesce(p_payload->>'fecha_contable','')!~'^\d{4}-\d{2}-\d{2}$'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('motivo','fecha_contable')) THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_PAYLOAD_INVALID' USING ERRCODE='22023';
 END IF;
 BEGIN d:=(p_payload->>'fecha_contable')::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_DATE_INVALID' USING ERRCODE='22023';END;
 RETURN jsonb_build_object('tipo','RECEPCION','fuente_id',p_receipt,'actor_id',p_actor,'motivo',m,'fecha_contable',d::text);
END $fn$;

CREATE FUNCTION app.receipt_source_event_615(p_tenant uuid,p_receipt uuid)
RETURNS public.outbox_events LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;n integer;r public.recepciones;
BEGIN
 SELECT * INTO r FROM public.recepciones WHERE tenant_id=p_tenant AND id=p_receipt;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant
  AND event_type IN('recepcion.registrada','RecepcionRegistrada') AND aggregate_id=p_receipt::text;
 IF n<>1 THEN RAISE EXCEPTION 'RECEIPT_ACCOUNTING_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant
  AND event_type IN('recepcion.registrada','RecepcionRegistrada') AND aggregate_id=p_receipt::text;
 IF e.aggregate_type<>'recepcion' OR e.payload->>'recepcionId' IS DISTINCT FROM p_receipt::text
  OR e.payload->>'tenantId' IS DISTINCT FROM p_tenant::text OR e.payload->>'ordenId' IS DISTINCT FROM r.orden_id::text
  OR (e.payload?'tenant_id' AND e.payload->>'tenant_id' IS DISTINCT FROM p_tenant::text)
  OR jsonb_typeof(e.payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(e.payload->'items')=0 THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_SOURCE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN e;
END $fn$;

CREATE OR REPLACE FUNCTION app.guard_recepcion_close_440()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE v_rpc_owner name;r public.inventario_reversas;
BEGIN
 IF OLD.inventario_reversa_id IS NOT NULL AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_SOURCE_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF upper(coalesce(OLD.estado::text,''))='CERRADA' AND upper(coalesce(NEW.estado::text,''))<>'CERRADA' THEN
  IF upper(NEW.estado::text)<>'ANULADA' THEN RAISE EXCEPTION 'RECEIPT_BUSINESS_REVERSAL_REQUIRED' USING ERRCODE='23514';END IF;
  SELECT pg_get_userbyid(proowner) INTO v_rpc_owner FROM pg_proc
   WHERE oid='public.revertir_recepcion_inventario_615(uuid,uuid,uuid,jsonb,text)'::regprocedure;
  IF current_user IS DISTINCT FROM v_rpc_owner THEN RAISE EXCEPTION 'RECEIPT_BUSINESS_REVERSAL_REQUIRED' USING ERRCODE='23514';END IF;
  SELECT * INTO r FROM public.inventario_reversas WHERE tenant_id=OLD.tenant_id AND tipo='RECEPCION' AND fuente_id=OLD.id;
  IF r.id IS NULL OR r.resultado IS NOT NULL OR r.fuente_snapshot->'recepcion' IS DISTINCT FROM to_jsonb(OLD)
    OR NEW.inventario_reversa_id IS DISTINCT FROM r.id OR NEW.anulado_por IS DISTINCT FROM r.actor_id
    OR NEW.motivo_anulacion IS DISTINCT FROM r.motivo OR NEW.anulado_at IS DISTINCT FROM r.created_at
    OR NEW.updated_by IS DISTINCT FROM r.actor_id
    OR (to_jsonb(NEW)-ARRAY['estado','updated_at','updated_by','anulado_at','anulado_por','motivo_anulacion','inventario_reversa_id'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','updated_at','updated_by','anulado_at','anulado_por','motivo_anulacion','inventario_reversa_id']) THEN
    RAISE EXCEPTION 'RECEIPT_REVERSAL_SOURCE_MISMATCH' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 IF upper(coalesce(NEW.estado::text,''))='CERRADA' AND upper(coalesce(OLD.estado::text,''))<>'CERRADA' THEN
  SELECT pg_get_userbyid(proowner) INTO v_rpc_owner FROM pg_proc WHERE oid='public.cerrar_recepcion_tx(uuid,uuid,text,text)'::regprocedure;
  IF v_rpc_owner IS NULL OR current_user<>v_rpc_owner THEN RAISE EXCEPTION 'La recepción sólo puede cerrarse mediante cerrar_recepcion_tx';END IF;
 END IF;
 RETURN NEW;
END $fn$;

DROP TRIGGER trg_guard_recepcion_close_440 ON public.recepciones;
CREATE TRIGGER trg_guard_recepcion_close_440 BEFORE UPDATE ON public.recepciones
FOR EACH ROW EXECUTE FUNCTION app.guard_recepcion_close_440();

CREATE FUNCTION app.reverse_purchase_receipt_615(p_tenant uuid,p_actor uuid,p_receipt uuid,p_payload jsonb,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE k text:=btrim(coalesce(p_key,''));v_payload jsonb;fp text;r public.recepciones;o public.ordenes_compra;
 rev public.inventario_reversas;e public.outbox_events;ri record;m public.movimientos_inventario;
 sources uuid[]:='{}';new_moves jsonb:='[]';items jsonb;fulfillment jsonb;rid uuid;eid uuid:=gen_random_uuid();new_id uuid;
 total_order numeric;total_received numeric;new_state text;stamp timestamptz;date_accounting date;n integer;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 v_payload:=app.receipt_reversal_request_615(p_actor,p_receipt,p_payload,k);fp:=app.inventory_operation_fingerprint_455(v_payload);
 date_accounting:=(v_payload->>'fecha_contable')::date;
 PERFORM set_config('app.current_tenant_id',p_tenant::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECEPCION_REVERSA:%s',p_tenant,k),0));
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 IF EXISTS(SELECT 1 FROM public.inventario_reversa_resoluciones WHERE tenant_id=p_tenant AND tipo='RECEPCION' AND idempotency_key=k) THEN
  RAISE EXCEPTION 'INVENTORY_REVERSAL_ABANDONED' USING ERRCODE='40001';END IF;
 SELECT * INTO rev FROM public.inventario_reversas WHERE tenant_id=p_tenant AND tipo='RECEPCION' AND idempotency_key=k FOR UPDATE;
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 IF rev.id IS NOT NULL THEN
  IF rev.fingerprint IS DISTINCT FROM fp THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';END IF;
  IF rev.resultado IS NULL THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_INCOMPLETE' USING ERRCODE='40001';END IF;
  RETURN rev.resultado||'{"idempotent":true}'::jsonb;
 END IF;
 SELECT * INTO r FROM public.recepciones WHERE tenant_id=p_tenant AND id=p_receipt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_NOT_FOUND' USING ERRCODE='P0002';END IF;
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 IF EXISTS(SELECT 1 FROM public.inventario_reversas WHERE tenant_id=p_tenant AND tipo='RECEPCION' AND fuente_id=p_receipt) THEN
  RAISE EXCEPTION 'RECEIPT_ALREADY_REVERSED' USING ERRCODE='23505';END IF;
 IF upper(r.estado::text)<>'CERRADA' THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_SOURCE_NOT_CLOSED' USING ERRCODE='23514';END IF;
 IF date_accounting>app.hoy_tenant(p_tenant) THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_FUTURE_DATE' USING ERRCODE='22023';END IF;
 PERFORM app.ensure_accounting_period_open_458(p_tenant,date_accounting);
 SELECT * INTO o FROM public.ordenes_compra WHERE tenant_id=p_tenant AND id=r.orden_id FOR UPDATE;
 IF NOT FOUND OR upper(o.estado::text) NOT IN('APROBADA','PARCIAL','RECIBIDA') THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_ORDER_STATE_INVALID' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM public.cuentas_por_pagar c WHERE c.tenant_id=p_tenant AND (c.recepcion_id=p_receipt OR c.referencia_id=p_receipt)) THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_INVOICE_EXISTS' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM public.devoluciones_proveedor d WHERE d.tenant_id=p_tenant AND d.recepcion_id=p_receipt
   AND upper(d.estado::text) NOT IN('ANULADA','RECHAZADA')) THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_SUPPLIER_RETURN_EXISTS' USING ERRCODE='23514';END IF;
 e:=app.receipt_source_event_615(p_tenant,p_receipt);
 IF e.payload->>'proveedorId' IS DISTINCT FROM o.proveedor_id::text THEN RAISE EXCEPTION 'RECEIPT_ACCOUNTING_SOURCE_MISMATCH' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM public.asientos_contables a JOIN public.asientos_contables reversed ON reversed.reversion_de_asiento_id=a.id
   WHERE a.tenant_id=p_tenant AND a.source_event_id=e.event_id) THEN
  RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_ALREADY_REVERSED' USING ERRCODE='23514';END IF;
 PERFORM id FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt) THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_ITEMS_REQUIRED' USING ERRCODE='23514';END IF;
 PERFORM d.id FROM public.orden_compra_detalles d JOIN public.recepcion_items i ON i.detalle_id=d.id AND i.tenant_id=d.tenant_id
  WHERE i.tenant_id=p_tenant AND i.recepcion_id=p_receipt ORDER BY d.id FOR UPDATE OF d;
 PERFORM p.id FROM public.productos p WHERE p.tenant_id=p_tenant AND p.id IN(SELECT producto_id FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt) ORDER BY p.id FOR UPDATE;
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) INTO items FROM public.recepcion_items i WHERE tenant_id=p_tenant AND recepcion_id=p_receipt;
 SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) INTO fulfillment FROM public.orden_compra_detalles d
  WHERE d.tenant_id=p_tenant AND d.orden_id=o.id;
 FOR ri IN SELECT * FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt ORDER BY producto_id,id LOOP
  IF ri.cantidad_recibida<=0 OR upper(ri.calidad) NOT IN('OK','OBSERVADO','RECHAZADO')
    OR ri.metadata->>'es_servicio' NOT IN('true','false') OR ri.metadata->>'controla_stock' NOT IN('true','false')
    OR ri.metadata->>'es_servicio' IS NULL OR ri.metadata->>'controla_stock' IS NULL THEN
    RAISE EXCEPTION 'RECEIPT_REVERSAL_ITEM_EVIDENCE_REQUIRED' USING ERRCODE='23514';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orden_compra_detalles WHERE tenant_id=p_tenant AND orden_id=o.id AND id=ri.detalle_id AND producto_id=ri.producto_id) THEN
    RAISE EXCEPTION 'RECEIPT_REVERSAL_ORDER_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
  SELECT count(*) INTO n FROM public.movimientos_inventario x WHERE x.tenant_id=p_tenant AND x.referencia_tipo='RECEPCION'
   AND (x.referencia_id=ri.id OR x.metadata->>'recepcion_item_id'=ri.id::text);
  IF upper(ri.calidad) IN('OK','OBSERVADO') AND ri.metadata->>'es_servicio'='false' AND ri.metadata->>'controla_stock'='true' THEN
   IF n<>1 THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_MOVEMENT_EVIDENCE_REQUIRED' USING ERRCODE='23514';END IF;
   SELECT * INTO m FROM public.movimientos_inventario x WHERE x.tenant_id=p_tenant AND x.referencia_tipo='RECEPCION'
    AND (x.referencia_id=ri.id OR x.metadata->>'recepcion_item_id'=ri.id::text);
   IF m.tipo<>'ENTRADA' OR m.activo IS DISTINCT FROM true OR m.estado<>'ACTIVO' OR m.referencia_id<>ri.id
    OR m.metadata->>'recepcion_id' IS DISTINCT FROM p_receipt::text OR m.producto_id<>ri.producto_id
    OR m.almacen_id IS DISTINCT FROM ri.almacen_id OR m.ubicacion_id IS DISTINCT FROM ri.ubicacion_id
    OR m.cantidad<>ri.cantidad_recibida OR m.kardex_valuacion_estado IS DISTINCT FROM 'CONFIRMADA' THEN
    RAISE EXCEPTION 'RECEIPT_REVERSAL_MOVEMENT_EVIDENCE_REQUIRED' USING ERRCODE='23514';END IF;
   sources:=array_append(sources,m.id);
  ELSIF n<>0 THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_UNEXPECTED_MOVEMENT' USING ERRCODE='23514';END IF;
 END LOOP;
 INSERT INTO public.inventario_reversas(tenant_id,tipo,fuente_id,idempotency_key,fingerprint,actor_id,motivo,payload,movimientos_origen,fuente_snapshot)
 VALUES(p_tenant,'RECEPCION',p_receipt,k,fp,p_actor,v_payload->>'motivo',v_payload,sources,
  jsonb_build_object('recepcion',to_jsonb(r),'items',items,'orden',to_jsonb(o),'cumplimiento',fulfillment,'evento_origen',to_jsonb(e))) RETURNING id,created_at INTO rid,stamp;
 FOREACH new_id IN ARRAY sources LOOP
  SELECT * INTO m FROM public.movimientos_inventario WHERE id=new_id AND tenant_id=p_tenant;
  new_id:=app.apply_inventory_reversal_movement_613(rid,new_id,jsonb_build_object('recepcion_id',p_receipt,'schema_version',615));
  new_moves:=new_moves||jsonb_build_array(jsonb_build_object('id',new_id,'source_movement_id',m.id,'producto_id',m.producto_id,
   'almacen_id',m.almacen_id,'ubicacion_id',m.ubicacion_id,'cantidad',m.cantidad::text));
 END LOOP;
 FOR ri IN SELECT detalle_id,sum(cantidad_recibida) AS quantity FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt
   AND upper(calidad) IN('OK','OBSERVADO') GROUP BY detalle_id ORDER BY detalle_id LOOP
  UPDATE public.orden_compra_detalles SET cantidad_recibida=cantidad_recibida-ri.quantity,updated_at=now()
   WHERE tenant_id=p_tenant AND orden_id=o.id AND id=ri.detalle_id AND cantidad_recibida>=ri.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_FULFILLMENT_INCONSISTENT' USING ERRCODE='23514';END IF;
 END LOOP;
 SELECT sum(cantidad),sum(coalesce(cantidad_recibida,0)) INTO total_order,total_received FROM public.orden_compra_detalles WHERE tenant_id=p_tenant AND orden_id=o.id;
 new_state:=CASE WHEN total_order>0 AND total_received>=total_order THEN 'RECIBIDA' WHEN total_received>0 THEN 'PARCIAL' ELSE 'APROBADA' END;
 UPDATE public.ordenes_compra SET estado=new_state,updated_at=now() WHERE tenant_id=p_tenant AND id=o.id;
 UPDATE public.recepciones SET estado='ANULADA',anulado_at=stamp,anulado_por=p_actor,motivo_anulacion=v_payload->>'motivo',
   inventario_reversa_id=rid,updated_by=p_actor,updated_at=now() WHERE tenant_id=p_tenant AND id=p_receipt;
 INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,event_id,idempotency_key,payload,status,retry_count,occurred_at)
 VALUES(p_tenant,'recepcion',p_receipt::text,'recepcion.revertida',eid,'recepcion-reversa:'||rid,
  jsonb_build_object('tenantId',p_tenant,'tenant_id',p_tenant,'recepcionId',p_receipt,'reversaId',rid,'originalEventId',e.event_id,
   'eventId',eid,'fechaContable',date_accounting::text,'actorId',p_actor,'motivo',v_payload->>'motivo','schemaVersion',615,'accountingHandledByOutbox',true),
  'pending',0,stamp);
 UPDATE public.inventario_reversas SET resultado=jsonb_build_object('success',true,'estado','ANULADA','tipo','RECEPCION_REVERSA','reversa_id',rid,
  'tenant_id',p_tenant,'actor_id',p_actor,'recepcion_id',p_receipt,'orden_id',o.id,'orden_estado',new_state,'idempotency_key',k,
  'request_fingerprint',fp,'payload',v_payload,'motivo',v_payload->>'motivo','fecha_contable',date_accounting::text,'created_at',stamp,
  'movimientos',new_moves,'contabilidad',jsonb_build_object('estado','PENDIENTE','event_id',eid,'original_event_id',e.event_id),'idempotent',false)
 WHERE id=rid RETURNING * INTO rev;
 RETURN rev.resultado;
END $fn$;
CREATE FUNCTION public.revertir_recepcion_inventario_615(p_tenant_id uuid,p_actor_id uuid,p_recepcion_id uuid,p_payload jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
 SELECT app.reverse_purchase_receipt_615(p_tenant_id,p_actor_id,p_recepcion_id,p_payload,p_idempotency_key)
$fn$;
REVOKE ALL ON FUNCTION public.revertir_recepcion_inventario_615(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.revertir_recepcion_inventario_615(uuid,uuid,uuid,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION app.reverse_purchase_receipt_615(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.receipt_reversal_request_615(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.receipt_source_event_615(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- El evento inverso pertenece al mismo worker y a las mismas guardas de período.
DO $classify$
DECLARE name text;definition text;
BEGIN
 FOREACH name IN ARRAY ARRAY['app.is_accounting_event_458(text)','app.is_accounting_owned_outbox_event_492(text)'] LOOP
  definition:=pg_get_functiondef(name::regprocedure);
  IF (length(definition)-length(replace(definition,'''recepcion.registrada'',','')))/length('''recepcion.registrada'',')<>1 THEN
   RAISE EXCEPTION 'RECEIPT_ACCOUNTING_CLASSIFIER_SOURCE_CHANGED';END IF;
  EXECUTE replace(definition,'''recepcion.registrada'',','''recepcion.registrada'',''recepcion.revertida'',');
 END LOOP;
END $classify$;

CREATE FUNCTION app.assert_receipt_zero_effect_615(e public.outbox_events)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE receipt uuid:=app.to_uuid_or_null(e.payload->>'recepcionId');source public.outbox_events;n integer;
BEGIN
 source:=app.receipt_source_event_615(e.tenant_id,receipt);
 IF source.event_id IS DISTINCT FROM e.event_id OR source.payload IS DISTINCT FROM e.payload
  OR e.payload->>'source' IS DISTINCT FROM 'db.recepcion_cerrada.444'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['subtotalParcial','mercaderiaParcial','serviciosParcial','noStockParcial']) k
    WHERE jsonb_typeof(e.payload->k) IS DISTINCT FROM 'number' OR (e.payload->>k)::numeric<>0)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.payload->'items') x WHERE
    jsonb_typeof(x->'cantidadRecibida') IS DISTINCT FROM 'number' OR (x->>'cantidadRecibida')::numeric<=0
    OR jsonb_typeof(x->'precioUnitario') IS DISTINCT FROM 'number' OR (x->>'precioUnitario')::numeric<>0
    OR jsonb_typeof(x->'subtotal') IS DISTINCT FROM 'number' OR (x->>'subtotal')::numeric<>0
    OR jsonb_typeof(x->'total') IS DISTINCT FROM 'number' OR (x->>'total')::numeric<>0)
  OR EXISTS(SELECT 1 FROM public.asientos_contables WHERE tenant_id=e.tenant_id AND source_event_id=e.event_id) THEN
  RAISE EXCEPTION 'RECEIPT_ZERO_EFFECT_NOT_PROVEN' USING ERRCODE='23514';END IF;
 SELECT count(*) INTO n FROM public.recepcion_items WHERE tenant_id=e.tenant_id AND recepcion_id=receipt AND upper(calidad) IN('OK','OBSERVADO');
 IF n<>jsonb_array_length(e.payload->'items') OR EXISTS(
   SELECT 1 FROM public.recepcion_items i JOIN public.orden_compra_detalles d ON d.tenant_id=i.tenant_id AND d.id=i.detalle_id
   WHERE i.tenant_id=e.tenant_id AND i.recepcion_id=receipt AND upper(i.calidad) IN('OK','OBSERVADO')
     AND (d.precio_unitario IS NULL OR d.precio_unitario<>0 OR i.metadata->>'es_servicio' IS NULL OR i.metadata->>'controla_stock' IS NULL)) THEN
  RAISE EXCEPTION 'RECEIPT_ZERO_EFFECT_NOT_PROVEN' USING ERRCODE='23514';END IF;
 IF EXISTS(
   (SELECT jsonb_build_object('product',i.producto_id,'quantity',i.cantidad_recibida,'service',i.metadata->'es_servicio','stock',i.metadata->'controla_stock')
     FROM public.recepcion_items i WHERE tenant_id=e.tenant_id AND recepcion_id=receipt AND upper(calidad) IN('OK','OBSERVADO'))
   EXCEPT ALL
   (SELECT jsonb_build_object('product',x->'productoId','quantity',x->'cantidadRecibida','service',x->'esServicio','stock',x->'controlaStock') FROM jsonb_array_elements(e.payload->'items') x)
 ) THEN RAISE EXCEPTION 'RECEIPT_ZERO_EFFECT_NOT_PROVEN' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM public.recepcion_items i WHERE i.tenant_id=e.tenant_id AND i.recepcion_id=receipt AND upper(i.calidad) IN('OK','OBSERVADO')
   AND i.metadata->>'es_servicio'='false' AND i.metadata->>'controla_stock'='true' AND (
    SELECT count(*) FROM public.movimientos_inventario m WHERE m.tenant_id=e.tenant_id AND m.referencia_tipo='RECEPCION'
     AND m.referencia_id=i.id AND m.tipo='ENTRADA' AND m.cantidad=i.cantidad_recibida AND m.producto_id=i.producto_id
     AND m.almacen_id IS NOT DISTINCT FROM i.almacen_id AND m.ubicacion_id IS NOT DISTINCT FROM i.ubicacion_id
     AND m.kardex_valuacion_estado='CONFIRMADA' AND m.kardex_costo_unitario=0 AND m.kardex_valor_total=0)<>1) THEN
  RAISE EXCEPTION 'RECEIPT_ZERO_EFFECT_NOT_PROVEN' USING ERRCODE='23514';END IF;
END $fn$;

CREATE FUNCTION public.verificar_recepcion_sin_efecto_615(p_tenant_id uuid,p_event_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;
BEGIN
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant_id AND event_id=p_event_id AND status='processing'
  AND claim_token=p_claim_token AND p_claim_token IS NOT NULL AND event_type IN('recepcion.registrada','RecepcionRegistrada') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_ACCOUNTING_CLAIM_INVALID' USING ERRCODE='42501';END IF;
 PERFORM app.assert_receipt_zero_effect_615(e);
 RETURN jsonb_build_object('success',true,'no_monetary_effect',true,'event_id',e.event_id,'recepcion_id',e.payload->>'recepcionId');
END $fn$;

CREATE FUNCTION app.guard_receipt_journal_reversal_615()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE original public.asientos_contables;source public.outbox_events;counter public.outbox_events;r public.inventario_reversas;receipt public.recepciones;
BEGIN
 IF NEW.reversion_de_asiento_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO original FROM public.asientos_contables WHERE id=NEW.reversion_de_asiento_id;
 SELECT * INTO source FROM public.outbox_events WHERE tenant_id=original.tenant_id AND event_id=original.source_event_id;
 IF source.event_type NOT IN('recepcion.registrada','RecepcionRegistrada','recepcion.revertida') OR source.id IS NULL THEN RETURN NEW;END IF;
 IF source.event_type='recepcion.revertida' THEN RAISE EXCEPTION 'RECEIPT_BUSINESS_REVERSAL_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO receipt FROM public.recepciones WHERE tenant_id=NEW.tenant_id AND id=app.to_uuid_or_null(source.payload->>'recepcionId') FOR UPDATE;
 PERFORM id FROM public.asientos_contables WHERE id=original.id AND tenant_id=NEW.tenant_id FOR UPDATE;
 SELECT * INTO r FROM public.inventario_reversas WHERE tenant_id=NEW.tenant_id AND tipo='RECEPCION' AND fuente_id=receipt.id;
 SELECT * INTO counter FROM public.outbox_events WHERE tenant_id=NEW.tenant_id AND event_id=NEW.source_event_id;
 IF receipt.inventario_reversa_id IS DISTINCT FROM r.id OR r.id IS NULL OR receipt.estado<>'ANULADA'
  OR counter.event_type IS DISTINCT FROM 'recepcion.revertida' OR counter.status IS DISTINCT FROM 'processing' OR counter.claim_token IS NULL
  OR counter.payload->>'originalEventId' IS DISTINCT FROM source.event_id::text OR counter.payload->>'reversaId' IS DISTINCT FROM r.id::text
  OR r.resultado#>>'{contabilidad,event_id}' IS DISTINCT FROM counter.event_id::text
  OR NOT EXISTS(SELECT 1 FROM app.receipt_accounting_write_615 auth WHERE auth.backend_pid=pg_backend_pid()
    AND auth.transaction_id=txid_current() AND auth.event_id=counter.event_id AND auth.original_journal_id=original.id
    AND auth.claim_token=counter.claim_token) THEN
  RAISE EXCEPTION 'RECEIPT_BUSINESS_REVERSAL_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $fn$;
CREATE TABLE app.receipt_accounting_write_615(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,event_id uuid NOT NULL,original_journal_id uuid NOT NULL,claim_token uuid NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id,event_id)
);
ALTER TABLE app.receipt_accounting_write_615 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.receipt_accounting_write_615 FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_accounting_write_private_615 ON app.receipt_accounting_write_615 USING(false) WITH CHECK(false);
REVOKE ALL ON app.receipt_accounting_write_615 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_receipt_journal_reversal_615 BEFORE INSERT OR UPDATE OF reversion_de_asiento_id,source_event_id ON public.asientos_contables
FOR EACH ROW EXECUTE FUNCTION app.guard_receipt_journal_reversal_615();

CREATE FUNCTION public.contabilizar_reversa_recepcion_615(p_tenant_id uuid,p_event_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;source public.outbox_events;r public.inventario_reversas;original public.asientos_contables;counter public.asientos_contables;
 receipt public.recepciones;details jsonb;created jsonb;replayed boolean:=false;
BEGIN
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant_id AND event_id=p_event_id AND status='processing'
  AND claim_token=p_claim_token AND p_claim_token IS NOT NULL AND event_type='recepcion.revertida' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_ACCOUNTING_CLAIM_INVALID' USING ERRCODE='42501';END IF;
 SELECT * INTO receipt FROM public.recepciones WHERE tenant_id=p_tenant_id AND id=app.to_uuid_or_null(e.payload->>'recepcionId') FOR UPDATE;
 SELECT * INTO r FROM public.inventario_reversas WHERE tenant_id=p_tenant_id AND tipo='RECEPCION' AND id=app.to_uuid_or_null(e.payload->>'reversaId');
 IF r.id IS NULL OR receipt.inventario_reversa_id IS DISTINCT FROM r.id OR receipt.estado<>'ANULADA'
  OR r.fuente_id IS DISTINCT FROM receipt.id OR r.resultado#>>'{contabilidad,event_id}' IS DISTINCT FROM e.event_id::text
  OR e.payload->>'fechaContable' IS DISTINCT FROM r.payload->>'fecha_contable' THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_REVERSAL_MISMATCH' USING ERRCODE='23514';END IF;
 source:=app.receipt_source_event_615(p_tenant_id,receipt.id);
 IF e.payload->>'originalEventId' IS DISTINCT FROM source.event_id::text OR r.resultado#>>'{contabilidad,original_event_id}' IS DISTINCT FROM source.event_id::text THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_REVERSAL_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO original FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND source_event_id=source.event_id FOR UPDATE;
 IF original.id IS NULL THEN
  IF jsonb_typeof(source.payload->'subtotalParcial')='number' AND (source.payload->>'subtotalParcial')::numeric=0 THEN
   PERFORM app.assert_receipt_zero_effect_615(source);
   RETURN jsonb_build_object('success',true,'no_monetary_effect',true,'event_id',e.event_id,'reversa_id',r.id,'recepcion_id',receipt.id,'original_event_id',source.event_id);
  END IF;
  RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_PENDING' USING ERRCODE='P0002';
 END IF;
 IF original.estado<>'CONFIRMADO' OR original.total_debe<=0 OR original.total_debe<>original.total_haber THEN
  RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_INVALID' USING ERRCODE='23514';END IF;
 PERFORM id FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id ORDER BY id FOR SHARE;
 SELECT * INTO counter FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND source_event_id=e.event_id FOR UPDATE;
 IF counter.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.asientos_contables WHERE reversion_de_asiento_id=original.id) THEN
   RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_ALREADY_REVERSED' USING ERRCODE='23514';END IF;
  SELECT jsonb_agg(jsonb_build_object('cuenta_id',cuenta_id,'debe',haber,'haber',debe,'centro_costo_id',centro_costo_id,
    'concepto','Reversión: '||coalesce(concepto,'')) ORDER BY id) INTO details FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id;
  INSERT INTO app.receipt_accounting_write_615 VALUES(pg_backend_pid(),txid_current(),e.event_id,original.id,p_claim_token);
  created:=public.crear_asiento_con_detalles_tx(p_tenant_id,jsonb_build_object('fecha',e.payload->>'fechaContable',
    'concepto','Anulación de recepción '||receipt.numero,'referencia','REV-'||receipt.numero,'estado','CONFIRMADO','origen','RECEPCION_REVERSA',
    'source_event_id',e.event_id,'reversion_de_asiento_id',original.id,'created_by',r.actor_id,'confirmado_por',r.actor_id),details);
  DELETE FROM app.receipt_accounting_write_615 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND event_id=e.event_id;
  SELECT * INTO counter FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND id=(created->>'id')::uuid;
 ELSE replayed:=true;END IF;
 IF counter.reversion_de_asiento_id IS DISTINCT FROM original.id OR counter.estado<>'CONFIRMADO' OR counter.total_debe<>original.total_haber OR counter.total_haber<>original.total_debe
  OR EXISTS((SELECT cuenta_id,centro_costo_id,haber,debe FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id)
    EXCEPT ALL (SELECT cuenta_id,centro_costo_id,debe,haber FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=counter.id))
  OR EXISTS((SELECT cuenta_id,centro_costo_id,debe,haber FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=counter.id)
    EXCEPT ALL (SELECT cuenta_id,centro_costo_id,haber,debe FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id)) THEN
  RAISE EXCEPTION 'RECEIPT_COUNTER_JOURNAL_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('success',true,'no_monetary_effect',false,'event_id',e.event_id,'reversa_id',r.id,'recepcion_id',receipt.id,
  'original_event_id',source.event_id,'asiento_id',counter.id,'original_asiento_id',original.id,'total_debe',counter.total_debe::text,'total_haber',counter.total_haber::text,'idempotent',replayed);
END $fn$;
REVOKE ALL ON FUNCTION app.assert_receipt_zero_effect_615(public.outbox_events) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.guard_receipt_journal_reversal_615() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.verificar_recepcion_sin_efecto_615(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.contabilizar_reversa_recepcion_615(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.verificar_recepcion_sin_efecto_615(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.contabilizar_reversa_recepcion_615(uuid,uuid,uuid) TO service_role;
COMMIT;
