\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject617(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
 BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE expected||'%' THEN RETURN;END IF;
  RAISE EXCEPTION 'VERIFY617_UNEXPECTED_ERROR % expected %',SQLERRM,expected;
 END;
 RAISE EXCEPTION 'VERIFY617_EXPECTED_REJECTION %',expected;
END $fn$;
CREATE FUNCTION pg_temp.fixture617(t uuid,a uuid,tag text,kind text,currency text DEFAULT 'USD',price numeric DEFAULT 4.13,q1 numeric DEFAULT 0.5,q2 numeric DEFAULT 0.75)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE j jsonb;p uuid;o uuid;d uuid;w uuid;s uuid;r uuid;u uuid;items jsonb;
BEGIN
 SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC,id LIMIT 1;
 SELECT id INTO s FROM public.proveedores WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
 j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','V617-'||tag,'nombre','Recepción '||tag,'categoria','VERIFICACION',
  'unidad_medida','NIU','precio_venta',10,'precio_compra',4.13,'afectacion_igv','10'),w,0,0,'[]'::jsonb);p:=(j->>'id')::uuid;
 IF kind IN('SERVICE','NO_STOCK') THEN UPDATE public.productos SET es_servicio=(kind='SERVICE'),controla_stock=false,
  tipo=CASE WHEN kind='SERVICE' THEN 'SERVICIO' ELSE 'PRODUCTO' END WHERE tenant_id=t AND id=p;END IF;
 IF kind='LOT' THEN
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',p,'controla_lote',true,
   'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'verify617-policy-'||tag);
  j:=public.crear_ubicacion_almacen_maestro_tx(t,a,w,'verify617-location-'||tag,jsonb_build_object('codigo','R617-'||tag,'nombre','Rack original'));
  u:=coalesce(j->>'id',j#>>'{ubicacion,id}')::uuid;
 END IF;
 j:=public.crear_orden_compra_tx(t,a,'verify617-oc-'||tag,jsonb_build_object('numero','V617-'||tag,'proveedor_id',s,
  'fecha_orden',app.hoy_tenant(t),'moneda',currency,'almacen_destino_id',w,'detalles',jsonb_build_array(
   jsonb_build_object('producto_id',p,'descripcion','Línea '||tag,'cantidad',5,'precio_unitario',price))));
 o:=coalesce(j->>'id',j#>>'{orden,id}',j->>'orden_id')::uuid;
 UPDATE public.ordenes_compra SET estado='APROBADA' WHERE tenant_id=t AND id=o;
 SELECT id INTO d FROM public.orden_compra_detalles WHERE tenant_id=t AND orden_id=o LIMIT 1;
 items:=jsonb_build_array(jsonb_build_object('detalle_id',d,'cantidad_recibida',q1,'almacen_id',w,'calidad','OK'),
  jsonb_build_object('detalle_id',d,'cantidad_recibida',q2,'almacen_id',w,'calidad','OBSERVADO'));
 IF kind='LOT' THEN items:=jsonb_build_array(items->0||jsonb_build_object('lote','V617A','fecha_expiracion',app.hoy_tenant(t)+100,'ubicacion_id',u),
   items->1||jsonb_build_object('lote','V617B','fecha_expiracion',app.hoy_tenant(t)+100));END IF;
 j:=public.crear_recepcion_tx(t,o,items,NULL,a,'verify617-receipt-'||tag);r:=(j->>'id')::uuid;
 RETURN jsonb_build_object('receipt',r,'order',o,'detail',d,'product',p,'warehouse',w,'location',u,'supplier',s,'kind',kind,'price',price);
END $fn$;
CREATE FUNCTION pg_temp.state617(t uuid) RETURNS jsonb LANGUAGE sql AS $fn$
 SELECT jsonb_build_object(
  'receipts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recepciones x WHERE tenant_id=t),
  'fulfillment',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.orden_compra_detalles x WHERE tenant_id=t),
  'orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.ordenes_compra x WHERE tenant_id=t),
  'products',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.productos x WHERE tenant_id=t),
  'stock',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.producto_existencias x WHERE tenant_id=t),
  'moves',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos_inventario x WHERE tenant_id=t),
  'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.outbox_events x WHERE tenant_id=t),
  'valuation',(SELECT jsonb_agg(to_jsonb(x) ORDER BY receipt_id) FROM app.receipt_valuation_617 x WHERE tenant_id=t),
  'sources',(SELECT jsonb_agg(to_jsonb(x) ORDER BY receipt_id) FROM app.receipt_source_617 x WHERE tenant_id=t),
  'journals',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.asientos_contables x WHERE tenant_id=t))
$fn$;
CREATE TEMP TABLE verify617_results(kind text,result jsonb);
DO $verify$
DECLARE j jsonb;t uuid;a uuid;f jsonb;r uuid;kind text;fx jsonb;bad jsonb;before_state jsonb;source uuid;token uuid;
 row_id uuid;ack jsonb;replay jsonb;rev jsonb;counter jsonb;original uuid;original_moves jsonb;day date;
BEGIN
 j:=public.create_demo_tenant_ready_tx('VERIFY617',14,'PE','verify617-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;day:=app.hoy_tenant(t);
 fx:='{"moneda":"USD","moneda_base":"PEN","tipo_cambio":"3.7","referencia":"Documento de cambio 617"}';
 f:=pg_temp.fixture617(t,a,'missing-fx','SERVICE');r:=(f->>'receipt')::uuid;before_state:=pg_temp.state617(t);
 PERFORM pg_temp.reject617(format('SELECT public.cerrar_recepcion_tx(%L,%L,%L,NULL)',r,t,a),'RECEIPT_FX_REQUIRED');
 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(fx-'referencia',fx||'{"tipo_cambio":"0"}',fx||'{"tipo_cambio":3.7}',
  fx||'{"tipo_cambio":"1e2"}',fx||'{"tipo_cambio":"-1"}',fx||'{"moneda_base":"USD"}',fx||'{"tipo_cambio":"3.1234567"}',
  fx||'{"referencia":""}',fx||'{"extra":true}')) LOOP
  PERFORM pg_temp.reject617(format('SELECT public.cerrar_recepcion_valuada_617(%L,%L,%L,NULL,%L)',r,t,a,bad),
    CASE WHEN bad->>'tipo_cambio'='0' THEN 'RECEIPT_EXCHANGE_RATE_INVALID' ELSE 'RECEIPT_VALUATION_INPUT_INVALID' END);
 END LOOP;
 IF before_state IS DISTINCT FROM pg_temp.state617(t) THEN RAISE EXCEPTION 'VERIFY617_FAILED_CLOSE_HAS_EFFECT';END IF;
 UPDATE public.empresa_config SET moneda_defecto='USD' WHERE tenant_id=t;
 FOREACH kind IN ARRAY ARRAY['PHYSICAL','SERVICE','NO_STOCK','LOT','ZERO'] LOOP
  f:=pg_temp.fixture617(t,a,lower(kind),CASE WHEN kind='ZERO' THEN 'PHYSICAL' ELSE kind END,'USD',CASE WHEN kind='ZERO' THEN 0 ELSE 4.13 END);
  r:=(f->>'receipt')::uuid;
  IF kind='SERVICE' THEN UPDATE public.recepciones SET fecha_recepcion=(day::text||'T02:15:30.123456Z')::timestamptz WHERE id=r;END IF;
  ack:=public.cerrar_recepcion_valuada_617(r,t,a,'Cierre de prueba617',fx);
  replay:=public.cerrar_recepcion_valuada_617(r,t,a,'Cierre de prueba617',fx);
  IF replay->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY617_CLOSE_REPLAY';END IF;
  before_state:=pg_temp.state617(t);
  PERFORM pg_temp.reject617(format('SELECT public.cerrar_recepcion_valuada_617(%L,%L,%L,%L,%L)',r,t,a,'Cierre de prueba617',fx||'{"tipo_cambio":"3.8"}'),
    'RECEIPT_CLOSE_IDEMPOTENCY_CONFLICT');
  PERFORM pg_temp.reject617(format('UPDATE app.receipt_valuation_617 SET exchange_rate=3.8 WHERE tenant_id=%L AND receipt_id=%L',t,r),'RECEIPT_VALUATION_IMMUTABLE');
  SELECT event_id INTO source FROM public.outbox_events WHERE tenant_id=t AND aggregate_id=r::text AND event_type='recepcion.registrada';
  PERFORM pg_temp.reject617(format('UPDATE public.outbox_events SET payload=payload||''{"moneda":"PEN"}'' WHERE event_id=%L',source),'RECEIPT_SOURCE_EVENT_IMMUTABLE');
  IF before_state IS DISTINCT FROM pg_temp.state617(t) THEN RAISE EXCEPTION 'VERIFY617_REPLAY_CHANGED_SOURCE';END IF;
  IF EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE tenant_id=t AND metadata->>'recepcion_id'=r::text AND
   (kardex_moneda<>'USD' OR kardex_moneda_base<>'PEN' OR kardex_tipo_cambio<>3.7 OR kardex_valuacion_estado<>'CONFIRMADA')) THEN
   RAISE EXCEPTION 'VERIFY617_COMMERCIAL_PREFERENCE_REDEFINED_BOOK_CURRENCY';END IF;
  SELECT jsonb_agg(to_jsonb(x) ORDER BY id) INTO original_moves FROM public.movimientos_inventario x WHERE tenant_id=t AND metadata->>'recepcion_id'=r::text;
  UPDATE public.productos SET precio_compra=999,costo=999 WHERE tenant_id=t AND id=(f->>'product')::uuid;
  PERFORM * FROM public.claim_outbox_events_tx('verify617-original',1000,ARRAY['recepcion.registrada'],NULL,t,3);
  SELECT id,claim_token INTO row_id,token FROM public.outbox_events WHERE tenant_id=t AND event_id=source;
  PERFORM pg_temp.reject617(format('SELECT public.contabilizar_recepcion_617(%L,%L,%L)',t,source,gen_random_uuid()),'RECEIPT_ACCOUNTING_CLAIM_INVALID');
  ack:=public.contabilizar_recepcion_617(t,source,token);replay:=public.contabilizar_recepcion_617(t,source,token);original:=nullif(ack->>'asiento_id','')::uuid;
  IF (kind='ZERO' AND (ack->>'no_monetary_effect'<>'true' OR ack?'asiento_id')) OR (kind<>'ZERO' AND
    (ack->>'total_debe'<>'19.13' OR ack->>'total_haber'<>'19.13' OR replay->>'idempotent'<>'true' OR replay->>'asiento_id'<>original::text)) THEN
   RAISE EXCEPTION 'VERIFY617_ORIGINAL_ACCOUNTING %',ack;END IF;
  IF kind<>'ZERO' AND (SELECT fecha FROM public.asientos_contables WHERE id=original) IS DISTINCT FROM
    (SELECT fecha_recepcion FROM public.recepciones WHERE id=r) THEN RAISE EXCEPTION 'VERIFY617_RECEIPT_INSTANT_NOT_PRESERVED';END IF;
  PERFORM public.complete_outbox_event_tx(row_id,token);
  PERFORM pg_temp.reject617(format('SELECT public.contabilizar_recepcion_617(%L,%L,%L)',t,source,token),'RECEIPT_ACCOUNTING_CLAIM_INVALID');
  rev:=public.revertir_recepcion_inventario_615(t,a,r,jsonb_build_object('motivo','Revertir recepción FX propia','fecha_contable',day),'verify617-reverse-'||kind);
  PERFORM * FROM public.claim_outbox_events_tx('verify617-counter',1000,ARRAY['recepcion.revertida'],NULL,t,3);
  SELECT id,claim_token INTO row_id,token FROM public.outbox_events WHERE tenant_id=t AND event_id=(rev#>>'{contabilidad,event_id}')::uuid;
  counter:=public.contabilizar_reversa_recepcion_615(t,(rev#>>'{contabilidad,event_id}')::uuid,token);
  PERFORM public.complete_outbox_event_tx(row_id,token);
  IF kind<>'ZERO' AND (counter->>'original_asiento_id'<>original::text OR counter->>'total_debe'<>'19.13'
   OR EXISTS(SELECT cuenta_id FROM public.detalle_asientos WHERE tenant_id=t AND asiento_id IN(original,(counter->>'asiento_id')::uuid)
    GROUP BY cuenta_id HAVING sum(debe-haber)<>0)) THEN RAISE EXCEPTION 'VERIFY617_COUNTER_NOT_EXACT';END IF;
  IF original_moves IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos_inventario x
    WHERE tenant_id=t AND referencia_tipo='RECEPCION' AND metadata->>'recepcion_id'=r::text) THEN RAISE EXCEPTION 'VERIFY617_ORIGINAL_MOVEMENTS_CHANGED';END IF;
  INSERT INTO verify617_results VALUES(kind,jsonb_build_object('original',ack,'counter',counter));
 END LOOP;
 f:=pg_temp.fixture617(t,a,'micro','SERVICE','USD',0.01,0.01,0.01);r:=(f->>'receipt')::uuid;before_state:=pg_temp.state617(t);
 PERFORM pg_temp.reject617(format('SELECT public.cerrar_recepcion_valuada_617(%L,%L,%L,NULL,%L)',r,t,a,fx),'RECEIPT_VALUE_OUTSIDE_PRECISION');
 IF before_state IS DISTINCT FROM pg_temp.state617(t) THEN RAISE EXCEPTION 'VERIFY617_MICRO_HAS_EFFECT';END IF;
 f:=pg_temp.fixture617(t,a,'sum-bound','SERVICE','USD',100000000000);r:=(f->>'receipt')::uuid;before_state:=pg_temp.state617(t);
 PERFORM pg_temp.reject617(format('SELECT public.cerrar_recepcion_valuada_617(%L,%L,%L,NULL,%L)',r,t,a,fx||'{"tipo_cambio":"10"}'),'RECEIPT_VALUE_OUTSIDE_PRECISION');
 IF before_state IS DISTINCT FROM pg_temp.state617(t) THEN RAISE EXCEPTION 'VERIFY617_TOTAL_BOUND_HAS_EFFECT';END IF;
 IF EXISTS(SELECT 1 FROM app.receipt_write_617) OR has_table_privilege('service_role','app.receipt_valuation_617','SELECT')
  OR has_table_privilege('service_role','app.receipt_write_617','INSERT')
  OR has_function_privilege('service_role','app.close_receipt_core_617(uuid,uuid,text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.contabilizar_recepcion_617(uuid,uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY617_PRIVATE_AUTHORITY_EXPOSED';END IF;
END $verify$;
SELECT 'VERIFY617_FROZEN_CURRENCY_OK';
SELECT 'VERIFY617_RESULTS:'||jsonb_agg(jsonb_build_object('kind',kind,'result',result) ORDER BY kind)::text FROM verify617_results;
ROLLBACK;
