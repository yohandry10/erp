\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE verify615_receipts(name text,context jsonb,result jsonb);
CREATE FUNCTION pg_temp.reject615(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
 BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE expected||'%' THEN RETURN;END IF;
  RAISE EXCEPTION 'VERIFY615_UNEXPECTED_ERROR % expected %',SQLERRM,expected;
 END;
 RAISE EXCEPTION 'VERIFY615_EXPECTED_REJECTION %',expected;
END $fn$;
CREATE FUNCTION pg_temp.fixture615(t uuid,a uuid,tag text,kind text DEFAULT 'PHYSICAL',price numeric DEFAULT 4.13)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE j jsonb;p uuid;o uuid;d uuid;w uuid;s uuid;r uuid;u uuid;first_item jsonb;second_item jsonb;
BEGIN
 SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC,id LIMIT 1;
 SELECT id INTO s FROM public.proveedores WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
 j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','V615-'||tag,'nombre','Recepción '||tag,'categoria','VERIFICACION',
  'unidad_medida','NIU','precio_venta',10,'precio_compra',4.13,'afectacion_igv','10'),w,0,0,'[]'::jsonb);p:=(j->>'id')::uuid;
 IF kind IN('SERVICE','NO_STOCK') THEN UPDATE public.productos SET es_servicio=(kind='SERVICE'),controla_stock=false,
  tipo=CASE WHEN kind='SERVICE' THEN 'SERVICIO' ELSE 'PRODUCTO' END WHERE tenant_id=t AND id=p;END IF;
 IF kind='LOT' THEN
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',p,'controla_lote',true,
   'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'verify615-policy-'||tag);
  j:=public.crear_ubicacion_almacen_maestro_tx(t,a,w,'verify615-location-'||tag,jsonb_build_object('codigo','R615-'||tag,'nombre','Rack original'));
  u:=coalesce(j->>'id',j#>>'{ubicacion,id}')::uuid;
 END IF;
 j:=public.crear_orden_compra_tx(t,a,'verify615-oc-'||tag,jsonb_build_object('numero','V615-'||tag,'proveedor_id',s,
  'fecha_orden',app.hoy_tenant(t),'moneda','PEN','almacen_destino_id',w,'detalles',jsonb_build_array(
   jsonb_build_object('producto_id',p,'descripcion','Línea '||tag,'cantidad',5,'precio_unitario',price))));
 o:=coalesce(j->>'id',j#>>'{orden,id}',j->>'orden_id')::uuid;
 IF o IS NULL THEN RAISE EXCEPTION 'VERIFY615_ORDER_RESULT_REQUIRED';END IF;
 -- Controlled fixture state only: this does not certify the approval workflow.
 UPDATE public.ordenes_compra SET estado='APROBADA' WHERE tenant_id=t AND id=o;
 SELECT id INTO d FROM public.orden_compra_detalles WHERE tenant_id=t AND orden_id=o LIMIT 1;
 first_item:=jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',0.5,'almacen_id',w,'calidad','OK');
 second_item:=jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',0.75,'almacen_id',w,'calidad','OBSERVADO');
 IF kind='LOT' THEN
  first_item:=first_item||jsonb_build_object('lote','V615A','fecha_expiracion',app.hoy_tenant(t)+100,'ubicacion_id',u);
  second_item:=second_item||jsonb_build_object('lote','V615B','fecha_expiracion',app.hoy_tenant(t)+100);
 END IF;
 j:=public.crear_recepcion_tx(t,o,jsonb_build_array(first_item,second_item),NULL,a,'verify615-receipt-'||tag);
 r:=(j->>'id')::uuid;PERFORM public.cerrar_recepcion_tx(r,t,a::text,NULL);
 RETURN jsonb_build_object('receipt',r,'order',o,'detail',d,'product',p,'warehouse',w,'location',u,'supplier',s,'kind',kind,'price',price);
END $fn$;
CREATE FUNCTION pg_temp.state615(t uuid) RETURNS jsonb LANGUAGE sql AS $fn$
 SELECT jsonb_build_object(
  'receipts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recepciones x WHERE tenant_id=t),
  'items',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recepcion_items x WHERE tenant_id=t),
  'orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.ordenes_compra x WHERE tenant_id=t),
  'fulfillment',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.orden_compra_detalles x WHERE tenant_id=t),
  'products',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.productos x WHERE tenant_id=t),
  'stock',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.producto_existencias x WHERE tenant_id=t),
  'movements',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos_inventario x WHERE tenant_id=t),
  'lots',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.inventario_lote_saldos x WHERE tenant_id=t),
  'lotMovements',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos_inventario_lotes x WHERE tenant_id=t),
  'reversals',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.inventario_reversas x WHERE tenant_id=t),
  'outbox',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.outbox_events x WHERE tenant_id=t),
  'invoices',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cuentas_por_pagar x WHERE tenant_id=t),
  'journals',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.asientos_contables x WHERE tenant_id=t),
  'periods',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.periodos_contables x WHERE tenant_id=t))
$fn$;
CREATE FUNCTION pg_temp.fail_second615() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE metadata->>'reversa_id'=NEW.metadata->>'reversa_id') THEN
  RAISE EXCEPTION 'VERIFY615_SECOND_LEG_FAILURE';END IF;RETURN NEW;
END $fn$;
CREATE FUNCTION pg_temp.fail_event615() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'VERIFY615_EVENT_FAILURE';END $fn$;

DO $verify$
DECLARE j jsonb;t uuid;a uuid;ot uuid;oa uuid;f jsonb;r uuid;o uuid;p uuid;w uuid;d uuid;rid uuid;ack jsonb;replay jsonb;
 body jsonb;before_state jsonb;original_moves jsonb;old_receipt jsonb;native_value numeric;kind text;day date;dev jsonb;item uuid;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY615_LOCAL_ONLY';END IF;
 j:=public.create_demo_tenant_ready_tx('VERIFY615',14,'PE','verify615-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
 j:=public.create_demo_tenant_ready_tx('VERIFY615OTHER',14,'PE','verify615other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 day:=app.hoy_tenant(t);body:=jsonb_build_object('motivo','Anulación de recepción original','fecha_contable',day::text);
 f:=pg_temp.fixture615(t,a,'basic');r:=(f->>'receipt')::uuid;o:=(f->>'order')::uuid;d:=(f->>'detail')::uuid;p:=(f->>'product')::uuid;w:=(f->>'warehouse')::uuid;
 SELECT to_jsonb(x) INTO old_receipt FROM public.recepciones x WHERE tenant_id=t AND id=r;
 SELECT jsonb_agg(to_jsonb(x) ORDER BY id),sum(kardex_valor_total) INTO original_moves,native_value FROM public.movimientos_inventario x WHERE tenant_id=t AND metadata->>'recepcion_id'=r::text;
 IF native_value<>5.17 THEN RAISE EXCEPTION 'VERIFY615_SPLIT_ROUNDING_FIXTURE';END IF;
 UPDATE public.productos SET precio_compra=999,costo=999 WHERE tenant_id=t AND id=p;
 UPDATE public.empresa_config SET moneda_defecto='USD' WHERE tenant_id=t;
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-foreign'')',t,oa,r,body),'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT');
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-extra'')',t,a,r,body||'{"cantidad":1}'::jsonb),'RECEIPT_REVERSAL_PAYLOAD_INVALID');
 PERFORM pg_temp.reject615(format('UPDATE public.recepciones SET estado=''ANULADA'' WHERE id=%L',r),'RECEIPT_REVERSAL_SOURCE_MISMATCH');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_REJECTION_CHANGED_STATE';END IF;
 EXECUTE 'CREATE TRIGGER zzz_verify615_second_failure BEFORE INSERT ON public.movimientos_inventario FOR EACH ROW WHEN(NEW.referencia_tipo=''RECEPCION_REVERSA'') EXECUTE FUNCTION pg_temp.fail_second615()';
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-fail-second'')',t,a,r,body),'VERIFY615_SECOND_LEG_FAILURE');
 EXECUTE 'DROP TRIGGER zzz_verify615_second_failure ON public.movimientos_inventario';
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_SECOND_FAILURE_PARTIAL_EFFECT';END IF;
 EXECUTE 'CREATE TRIGGER zzz_verify615_event_failure BEFORE INSERT ON public.outbox_events FOR EACH ROW WHEN(NEW.event_type=''recepcion.revertida'') EXECUTE FUNCTION pg_temp.fail_event615()';
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-fail-event'')',t,a,r,body),'VERIFY615_EVENT_FAILURE');
 EXECUTE 'DROP TRIGGER zzz_verify615_event_failure ON public.outbox_events';
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_EVENT_FAILURE_PARTIAL_EFFECT';END IF;
 ack:=public.revertir_recepcion_inventario_615(t,a,r,body,'verify615-basic');rid:=(ack->>'reversa_id')::uuid;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 replay:=public.revertir_recepcion_inventario_615(t,a,r,body,'verify615-basic');
 IF ack->>'estado'<>'ANULADA' OR ack#>>'{contabilidad,estado}'<>'PENDIENTE' OR replay->>'idempotent'<>'true'
  OR (replay-'idempotent') IS DISTINCT FROM (ack-'idempotent')
  OR (SELECT cantidad_recibida<>0 OR cantidad_pendiente<>5 FROM public.orden_compra_detalles WHERE id=d)
  OR (SELECT upper(estado::text)<>'APROBADA' FROM public.ordenes_compra WHERE id=o)
  OR (SELECT stock_actual<>0 FROM public.producto_existencias WHERE tenant_id=t AND producto_id=p AND almacen_id=w)
  OR (SELECT count(*)<>2 FROM public.movimientos_inventario WHERE tenant_id=t AND metadata->>'reversa_id'=rid::text)
  OR (SELECT count(*)<>1 FROM public.outbox_events WHERE tenant_id=t AND event_type='recepcion.revertida' AND payload->>'reversaId'=rid::text)
  OR original_moves IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos_inventario x WHERE tenant_id=t AND referencia_tipo='RECEPCION' AND metadata->>'recepcion_id'=r::text)
  OR EXISTS(SELECT 1 FROM public.movimientos_inventario x JOIN public.movimientos_inventario src ON src.id=x.referencia_id WHERE x.tenant_id=t AND x.metadata->>'reversa_id'=rid::text
   AND ROW(x.kardex_moneda,x.kardex_moneda_base,x.kardex_tipo_cambio,x.kardex_costo_unitario,x.kardex_valor_total,x.kardex_valuacion_estado)
    IS DISTINCT FROM ROW(src.kardex_moneda,src.kardex_moneda_base,src.kardex_tipo_cambio,src.kardex_costo_unitario,src.kardex_valor_total,src.kardex_valuacion_estado)) THEN
   RAISE EXCEPTION 'VERIFY615_ORIGIN_OR_ATOMIC_RECEIPT_MISMATCH';END IF;
 IF (old_receipt-ARRAY['estado','updated_at','updated_by','anulado_at','anulado_por','motivo_anulacion','inventario_reversa_id']) IS DISTINCT FROM
   (SELECT to_jsonb(x)-ARRAY['estado','updated_at','updated_by','anulado_at','anulado_por','motivo_anulacion','inventario_reversa_id'] FROM public.recepciones x WHERE id=r) THEN
   RAISE EXCEPTION 'VERIFY615_ORIGINAL_FIELDS_CHANGED';END IF;
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-basic'')',t,a,r,body||'{"motivo":"Otro motivo distinto"}'::jsonb),'RECEIPT_REVERSAL_IDEMPOTENCY_CONFLICT');
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-another-key'')',t,a,r,body),'RECEIPT_ALREADY_REVERSED');
 PERFORM pg_temp.reject615(format('UPDATE public.recepciones SET observaciones=''Cambio posterior'' WHERE id=%L',r),'RECEIPT_REVERSAL_SOURCE_IMMUTABLE');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_RETRY_CHANGED_STATE';END IF;
 INSERT INTO verify615_receipts VALUES('basic',jsonb_build_object('tenantId',t,'actorId',a,'receiptId',r,'key','verify615-basic','body',body),ack);
 UPDATE public.empresa_config SET moneda_defecto='PEN' WHERE tenant_id=t;
 FOREACH kind IN ARRAY ARRAY['SERVICE','NO_STOCK','ZERO'] LOOP
  f:=pg_temp.fixture615(t,a,lower(kind),CASE WHEN kind='ZERO' THEN 'PHYSICAL' ELSE kind END,CASE WHEN kind='ZERO' THEN 0 ELSE 6 END);
  r:=(f->>'receipt')::uuid;ack:=public.revertir_recepcion_inventario_615(t,a,r,body,'verify615-'||lower(kind));
  IF jsonb_array_length(ack->'movimientos')<>(CASE WHEN kind='ZERO' THEN 2 ELSE 0 END) THEN RAISE EXCEPTION 'VERIFY615_STOCK_CLASSIFICATION';END IF;
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO verify615_receipts VALUES(lower(kind),jsonb_build_object('tenantId',t,'actorId',a,'receiptId',r,'key','verify615-'||lower(kind),'body',body),ack);
 END LOOP;
 f:=pg_temp.fixture615(t,a,'invoiced');r:=(f->>'receipt')::uuid;
 PERFORM public.crear_factura_proveedor_tx(t,jsonb_build_object('proveedor_id',f->>'supplier','orden_id',f->>'order','recepcion_id',r,'created_by',a,
  'numero_documento','F615-INVOICE','fecha_emision',day,'fecha_vencimiento',day,'condiciones_pago','CONTADO','moneda','PEN',
  'subtotal',1,'igv',0.18,'total',1.18,'saldo',1.18,'estado','PENDIENTE'),gen_random_uuid(),'verify615-invoice');
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-invoiced'')',t,a,r,body),'RECEIPT_REVERSAL_INVOICE_EXISTS');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_INVOICE_REJECTION_CHANGED';END IF;
 f:=pg_temp.fixture615(t,a,'returned');r:=(f->>'receipt')::uuid;
 SELECT id INTO item FROM public.recepcion_items WHERE tenant_id=t AND recepcion_id=r ORDER BY id LIMIT 1;
 dev:=public.crear_devolucion_proveedor_tx(t,jsonb_build_object('recepcion_id',r,'orden_id',f->>'order','proveedor_id',f->>'supplier',
  'motivo','Retorno pendiente propio','items',jsonb_build_array(jsonb_build_object('recepcion_item_id',item,'producto_id',f->>'product','cantidad',0.25,'precio_unitario',4.13))),a,'verify615-pending-return');
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-with-return'')',t,a,r,body),'RECEIPT_REVERSAL_SUPPLIER_RETURN_EXISTS');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_RETURN_REJECTION_CHANGED';END IF;
 f:=pg_temp.fixture615(t,a,'lots','LOT');r:=(f->>'receipt')::uuid;p:=(f->>'product')::uuid;w:=(f->>'warehouse')::uuid;
 ack:=public.revertir_recepcion_inventario_615(t,a,r,body,'verify615-lots');rid:=(ack->>'reversa_id')::uuid;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 IF EXISTS(SELECT 1 FROM public.inventario_lote_saldos WHERE tenant_id=t AND producto_id=p AND (stock_actual<>0 OR stock_reservado<>0))
  OR (SELECT count(*) FROM public.movimientos_inventario_lotes WHERE tenant_id=t AND movimiento_id IN(SELECT id FROM public.movimientos_inventario WHERE metadata->>'reversa_id'=rid::text))<>2 THEN
  RAISE EXCEPTION 'VERIFY615_LOT_OR_LOCATION_NOT_RESTORED';END IF;
 INSERT INTO verify615_receipts VALUES('lots',jsonb_build_object('tenantId',t,'actorId',a,'receiptId',r,'key','verify615-lots','body',body),ack);
 f:=pg_temp.fixture615(t,a,'wrong-lot','LOT');r:=(f->>'receipt')::uuid;p:=(f->>'product')::uuid;w:=(f->>'warehouse')::uuid;
 PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=p,p_almacen_id:=w,p_tipo:='SALIDA',p_cantidad:=0.5,
  p_referencia_tipo:='VERIFY615_LOT_USE',p_referencia_id:=gen_random_uuid(),p_ubicacion_id:=(f->>'location')::uuid,p_lote:='V615A');
 PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=p,p_almacen_id:=w,p_tipo:='ENTRADA',p_cantidad:=0.5,
  p_referencia_tipo:='VERIFY615_OTHER_LOT',p_referencia_id:=gen_random_uuid(),p_ubicacion_id:=(f->>'location')::uuid,p_lote:='V615C',p_fecha_expiracion:=day+200,
  p_metadata:='{"costo_unitario":4.13}');
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-wrong-lot'')',t,a,r,body),'INVENTORY_LOT_AVAILABLE_INSUFFICIENT');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_WRONG_LOT_PARTIAL_EFFECT';END IF;
 f:=pg_temp.fixture615(t,a,'cheap-replacement');r:=(f->>'receipt')::uuid;p:=(f->>'product')::uuid;w:=(f->>'warehouse')::uuid;
 PERFORM public.aplicar_movimiento_inventario_tx(t,p,w,'SALIDA',1.25,'VERIFY615_USE',gen_random_uuid());
 PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=p,p_almacen_id:=w,p_tipo:='ENTRADA',p_cantidad:=1.25,
  p_referencia_tipo:='VERIFY615_CHEAPER',p_referencia_id:=gen_random_uuid(),p_metadata:='{"costo_unitario":1}');
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-cheaper'')',t,a,r,body),'INVENTORY_REVERSAL_WAREHOUSE_VALUATION_REQUIRED');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_CHEAPER_PARTIAL_EFFECT';END IF;
 f:=pg_temp.fixture615(t,a,'closed-period');r:=(f->>'receipt')::uuid;
 INSERT INTO public.periodos_contables(tenant_id,anio,mes,estado) VALUES(t,extract(year FROM day-interval '3 months')::int,extract(month FROM day-interval '3 months')::int,'ABIERTO')
  ON CONFLICT(tenant_id,anio,mes) WHERE tenant_id IS NOT NULL AND anio IS NOT NULL AND mes IS NOT NULL DO NOTHING;
 PERFORM public.cerrar_periodo_contable_tx(t,extract(year FROM day-interval '3 months')::int,extract(month FROM day-interval '3 months')::int,a);
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,''verify615-closed-period'')',t,a,r,
  body||jsonb_build_object('fecha_contable',(day-interval '3 months')::date::text)),'ACCOUNTING_PERIOD_NOT_OPEN');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_CLOSED_PERIOD_PARTIAL_EFFECT';END IF;
 IF has_function_privilege('authenticated','public.revertir_recepcion_inventario_615(uuid,uuid,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('service_role','app.reverse_purchase_receipt_615(uuid,uuid,uuid,jsonb,text)','EXECUTE')
  OR NOT app.is_accounting_event_458('recepcion.revertida') OR NOT app.is_accounting_owned_outbox_event_492('recepcion.revertida') THEN
  RAISE EXCEPTION 'VERIFY615_PRIVATE_AND_ACCOUNTING_OWNERSHIP';END IF;
END $verify$;
CREATE TEMP TABLE verify615_accounting(name text,proof jsonb);
DO $accounting$
DECLARE v record;t uuid;r uuid;rid uuid;event uuid;source uuid;token uuid;source_token uuid;rowid uuid;source_row uuid;
 original uuid;counter uuid;debit uuid;credit uuid;j jsonb;replay jsonb;before_state jsonb;no_effect jsonb;day date;
BEGIN
 SELECT context,result INTO v FROM verify615_receipts WHERE name='basic';t:=(v.context->>'tenantId')::uuid;r:=(v.context->>'receiptId')::uuid;
 rid:=(v.result->>'reversa_id')::uuid;event:=(v.result#>>'{contabilidad,event_id}')::uuid;source:=(v.result#>>'{contabilidad,original_event_id}')::uuid;
 day:=(v.context#>>'{body,fecha_contable}')::date;
 PERFORM * FROM public.claim_outbox_events_tx('verify615-accounting',100,ARRAY['recepcion.revertida'],NULL,t,3);
 SELECT id,claim_token INTO rowid,token FROM public.outbox_events WHERE tenant_id=t AND event_id=event;
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.contabilizar_reversa_recepcion_615(%L,%L,%L)',t,event,gen_random_uuid()),'RECEIPT_ACCOUNTING_CLAIM_INVALID');
 PERFORM pg_temp.reject615(format('SELECT public.contabilizar_reversa_recepcion_615(%L,%L,%L)',t,event,token),'RECEIPT_ORIGINAL_JOURNAL_PENDING');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_PENDING_ACCOUNTING_CHANGED_BUSINESS';END IF;
 SELECT id INTO debit FROM public.plan_cuentas WHERE tenant_id=t AND codigo='20' LIMIT 1;
 SELECT id INTO credit FROM public.plan_cuentas WHERE tenant_id=t AND codigo='4699' LIMIT 1;
 IF debit IS NULL OR credit IS NULL THEN RAISE EXCEPTION 'VERIFY615_LOCAL_ACCOUNTS_REQUIRED';END IF;
 -- Canonical journal RPC, with the exact frozen subtotal of the original
 -- receipt event. This is not a fiscal submission or the Node original worker.
 j:=public.crear_asiento_con_detalles_tx(t,jsonb_build_object('fecha',day,'concepto','Recepción pendiente de factura','source_event_id',source),
  jsonb_build_array(jsonb_build_object('cuenta_id',debit,'debe',5.17,'haber',0,'concepto','Mercadería original'),
    jsonb_build_object('cuenta_id',credit,'debe',0,'haber',5.17,'concepto','Recibido por facturar')));
 original:=(j->>'id')::uuid;
 before_state:=pg_temp.state615(t);
 PERFORM pg_temp.reject615(format('SELECT public.crear_asiento_con_detalles_tx(%L,%L,%L)',t,
  jsonb_build_object('fecha',day,'concepto','Reversa manual ajena','reversion_de_asiento_id',original),
  jsonb_build_array(jsonb_build_object('cuenta_id',debit,'debe',0,'haber',5.17),jsonb_build_object('cuenta_id',credit,'debe',5.17,'haber',0))),
  'RECEIPT_BUSINESS_REVERSAL_REQUIRED');
 PERFORM pg_temp.reject615(format('SELECT public.crear_asiento_con_detalles_tx(%L,%L,%L)',t,
  jsonb_build_object('fecha',day,'concepto','Claim conocido sin autoridad de writer','reversion_de_asiento_id',original,'source_event_id',event),
  jsonb_build_array(jsonb_build_object('cuenta_id',debit,'debe',0,'haber',5.17),jsonb_build_object('cuenta_id',credit,'debe',5.17,'haber',0))),
  'RECEIPT_BUSINESS_REVERSAL_REQUIRED');
 IF before_state<>pg_temp.state615(t) THEN RAISE EXCEPTION 'VERIFY615_MANUAL_REVERSE_CHANGED_STATE';END IF;
 j:=public.contabilizar_reversa_recepcion_615(t,event,token);counter:=(j->>'asiento_id')::uuid;
 replay:=public.contabilizar_reversa_recepcion_615(t,event,token);
 IF j->>'no_monetary_effect'<>'false' OR j->>'original_asiento_id'<>original::text OR counter=original
  OR replay->>'asiento_id'<>counter::text OR replay->>'idempotent'<>'true'
  OR EXISTS(SELECT cuenta_id,centro_costo_id FROM public.detalle_asientos WHERE tenant_id=t AND asiento_id IN(original,counter)
    GROUP BY cuenta_id,centro_costo_id HAVING sum(debe-haber)<>0)
  OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t AND source_event_id=event)<>1 THEN
   RAISE EXCEPTION 'VERIFY615_EXACT_COUNTER_JOURNAL';END IF;
 PERFORM public.complete_outbox_event_tx(rowid,token);
 PERFORM pg_temp.reject615(format('SELECT public.contabilizar_reversa_recepcion_615(%L,%L,%L)',t,event,token),'RECEIPT_ACCOUNTING_CLAIM_INVALID');
 INSERT INTO verify615_accounting VALUES('valued',j);
 SELECT context,result INTO v FROM verify615_receipts WHERE name='zero';r:=(v.context->>'receiptId')::uuid;
 event:=(v.result#>>'{contabilidad,event_id}')::uuid;source:=(v.result#>>'{contabilidad,original_event_id}')::uuid;
 PERFORM * FROM public.claim_outbox_events_tx('verify615-original-zero',100,ARRAY['recepcion.registrada','RecepcionRegistrada'],NULL,t,3);
 SELECT id,claim_token INTO source_row,source_token FROM public.outbox_events WHERE tenant_id=t AND event_id=source;
 no_effect:=public.verificar_recepcion_sin_efecto_615(t,source,source_token);
 IF no_effect->>'no_monetary_effect'<>'true' OR no_effect->>'recepcion_id'<>r::text THEN RAISE EXCEPTION 'VERIFY615_ZERO_ORIGINAL_NOT_CONFIRMED';END IF;
 INSERT INTO verify615_accounting VALUES('original-zero',no_effect);
 PERFORM public.complete_outbox_event_tx(source_row,source_token);
 SELECT id,claim_token INTO rowid,token FROM public.outbox_events WHERE tenant_id=t AND event_id=event;
 j:=public.contabilizar_reversa_recepcion_615(t,event,token);
 IF j->>'no_monetary_effect'<>'true' OR j?'asiento_id' OR j->>'recepcion_id'<>r::text
  OR EXISTS(SELECT 1 FROM public.asientos_contables WHERE tenant_id=t AND source_event_id IN(source,event)) THEN
  RAISE EXCEPTION 'VERIFY615_ZERO_CREATED_FAKE_JOURNAL';END IF;
 PERFORM public.complete_outbox_event_tx(rowid,token);
 IF EXISTS(SELECT 1 FROM public.outbox_events WHERE tenant_id=t AND event_id IN(source,event) AND (status<>'completed' OR processed_at IS NULL)) THEN
  RAISE EXCEPTION 'VERIFY615_ZERO_EVENTS_NOT_COMPLETED';END IF;
 IF EXISTS(SELECT 1 FROM app.receipt_accounting_write_615)
  OR has_table_privilege('service_role','app.receipt_accounting_write_615','SELECT')
  OR has_table_privilege('service_role','app.receipt_accounting_write_615','INSERT') THEN
  RAISE EXCEPTION 'VERIFY615_ACCOUNTING_AUTHORITY_NOT_PRIVATE';END IF;
 INSERT INTO verify615_accounting VALUES('zero',j);
END $accounting$;
SELECT 'VERIFY615_RECEIPT_BUSINESS_OK';
SELECT 'VERIFY615_RECEIPTS:'||jsonb_agg(jsonb_build_object('name',name,'context',context,'result',result) ORDER BY name)::text FROM verify615_receipts;
SELECT 'VERIFY615_ACCOUNTING:'||jsonb_agg(jsonb_build_object('name',name,'proof',proof) ORDER BY name)::text FROM verify615_accounting;
ROLLBACK;
