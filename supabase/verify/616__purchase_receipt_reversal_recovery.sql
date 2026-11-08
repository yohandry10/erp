\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE verify616_vectors(name text,context jsonb,receipt jsonb,detail jsonb,resolution jsonb);
CREATE FUNCTION pg_temp.reject616(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
 BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE expected||'%' THEN RETURN;END IF;
  RAISE EXCEPTION 'VERIFY616_UNEXPECTED_ERROR % expected %',SQLERRM,expected;
 END;
 RAISE EXCEPTION 'VERIFY616_EXPECTED_REJECTION %',expected;
END $fn$;
DO $verify$
DECLARE j jsonb;t uuid;a uuid;ot uuid;oa uuid;w uuid;s uuid;p uuid;o uuid;d uuid;r uuid;body jsonb;ack jsonb;detail jsonb;resolution jsonb;
 n text;k text;before_moves integer;before_events integer;before_received numeric;day date;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY616_LOCAL_ONLY';END IF;
 j:=public.create_demo_tenant_ready_tx('VERIFY616',14,'PE','verify616-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
 j:=public.create_demo_tenant_ready_tx('VERIFY616OTHER',14,'PE','verify616other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 day:=app.hoy_tenant(t);body:=jsonb_build_object('motivo','Anulación con recibo original','fecha_contable',day::text);
 SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC,id LIMIT 1;
 SELECT id INTO s FROM public.proveedores WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
 FOREACH n IN ARRAY ARRAY['physical','service','zero','abandon'] LOOP
  k:='verify616-'||n;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','V616-'||n,'nombre','Recuperación '||n,'categoria','VERIFICACION',
   'unidad_medida','NIU','precio_venta',10,'precio_compra',4.13,'afectacion_igv','10'),w,0,0,'[]'::jsonb);p:=(j->>'id')::uuid;
  IF n='service' THEN UPDATE public.productos SET es_servicio=true,controla_stock=false,tipo='SERVICIO' WHERE tenant_id=t AND id=p;END IF;
  j:=public.crear_orden_compra_tx(t,a,'verify616-oc-'||n,jsonb_build_object('numero','V616-'||n,'proveedor_id',s,
   'fecha_orden',day,'moneda','PEN','almacen_destino_id',w,'detalles',jsonb_build_array(jsonb_build_object('producto_id',p,'descripcion','Línea '||n,
   'cantidad',5,'precio_unitario',CASE WHEN n='zero' THEN 0 ELSE 4.13 END))));
  o:=coalesce(j->>'id',j#>>'{orden,id}',j->>'orden_id')::uuid;
  -- Fixture controlado, no acredita la aprobación comercial.
  UPDATE public.ordenes_compra SET estado='APROBADA' WHERE tenant_id=t AND id=o;
  SELECT id INTO d FROM public.orden_compra_detalles WHERE tenant_id=t AND orden_id=o LIMIT 1;
  j:=public.crear_recepcion_tx(t,o,jsonb_build_array(jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',0.5,'almacen_id',w,'calidad','OK'),
   jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',0.75,'almacen_id',w,'calidad','OBSERVADO')),NULL,a,'verify616-receipt-'||n);
  r:=(j->>'id')::uuid;PERFORM public.cerrar_recepcion_tx(r,t,a::text,NULL);
  IF public.consultar_reversa_recepcion_616(t,a,r,k) IS NOT NULL THEN RAISE EXCEPTION 'VERIFY616_ABSENCE_NOT_NULL';END IF;
  IF n='abandon' THEN
   SELECT count(*) INTO before_moves FROM public.movimientos_inventario WHERE tenant_id=t;
   SELECT count(*) INTO before_events FROM public.outbox_events WHERE tenant_id=t;
   SELECT cantidad_recibida INTO before_received FROM public.orden_compra_detalles WHERE tenant_id=t AND id=d;
   resolution:=public.resolver_reversa_recepcion_616(t,a,r,body,k);
   IF resolution->>'status'<>'ABANDONED' OR resolution IS DISTINCT FROM public.resolver_reversa_recepcion_616(t,a,r,body,k) THEN
    RAISE EXCEPTION 'VERIFY616_ABANDON_NOT_DURABLE';END IF;
   PERFORM pg_temp.reject616(format('SELECT public.revertir_recepcion_inventario_615(%L,%L,%L,%L,%L)',t,a,r,body,k),'INVENTORY_REVERSAL_ABANDONED');
   PERFORM pg_temp.reject616(format('SELECT public.resolver_reversa_recepcion_616(%L,%L,%L,%L,%L)',t,a,r,body||'{"motivo":"Motivo distinto"}',k),'INVENTORY_REVERSAL_RESOLUTION_CONFLICT');
   IF (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id=t)<>before_moves OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t)<>before_events
    OR (SELECT cantidad_recibida FROM public.orden_compra_detalles WHERE tenant_id=t AND id=d)<>before_received
    OR (SELECT estado FROM public.recepciones WHERE tenant_id=t AND id=r)<>'CERRADA' THEN RAISE EXCEPTION 'VERIFY616_ABANDON_CHANGED_BUSINESS';END IF;
   INSERT INTO verify616_vectors VALUES(n,jsonb_build_object('tenantId',t,'actorId',a,'receiptId',r,'key',k,'body',body),NULL,NULL,resolution);
   CONTINUE;
  END IF;
  ack:=public.revertir_recepcion_inventario_615(t,a,r,body,k);detail:=public.consultar_reversa_recepcion_616(t,a,r,k);
  IF detail#>>'{reversa,id}' IS DISTINCT FROM ack->>'reversa_id' OR detail#>'{reversa,resultado}' IS DISTINCT FROM ack
   OR detail#>>'{recepcion,inventario_reversa_id}' IS DISTINCT FROM ack->>'reversa_id' OR detail#>>'{recepcion,estado}'<>'ANULADA'
   OR jsonb_array_length(detail->'items')<>2 OR detail->'items' IS DISTINCT FROM detail->'items_origen'
   OR jsonb_array_length(detail->'movimientos_origen')<>(CASE WHEN n='service' THEN 0 ELSE 2 END)
   OR jsonb_array_length(detail->'movimientos_reversa')<>jsonb_array_length(detail->'movimientos_origen') THEN RAISE EXCEPTION 'VERIFY616_READ_NOT_COMPLETE';END IF;
  IF public.consultar_reversa_recepcion_616(t,a,r,k||'-missing') IS NOT NULL OR public.consultar_reversa_recepcion_616(ot,oa,r,k) IS NOT NULL THEN
   RAISE EXCEPTION 'VERIFY616_FOREIGN_RECEIPT_EXPOSED';END IF;
  PERFORM pg_temp.reject616(format('SELECT public.consultar_reversa_recepcion_616(%L,%L,%L,%L)',t,oa,r,k),'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT');
  resolution:=public.resolver_reversa_recepcion_616(t,a,r,body,k);
  IF resolution->>'status'<>'COMMITTED' OR resolution->'detail' IS DISTINCT FROM detail OR resolution->'receipt' IS DISTINCT FROM ack||'{"idempotent":true}'::jsonb THEN
   RAISE EXCEPTION 'VERIFY616_COMMITTED_NOT_BOUND';END IF;
  PERFORM pg_temp.reject616(format('SELECT public.resolver_reversa_recepcion_616(%L,%L,%L,%L,%L)',t,a,r,body||'{"motivo":"Motivo distinto"}',k),'INVENTORY_REVERSAL_RESOLUTION_CONFLICT');
  INSERT INTO verify616_vectors VALUES(n,jsonb_build_object('tenantId',t,'actorId',a,'receiptId',r,'key',k,'body',body),ack,detail,resolution);
 END LOOP;
 UPDATE public.usuarios_sistema SET estado='INACTIVO',activo=false WHERE tenant_id=t AND id=a;
 PERFORM pg_temp.reject616(format('SELECT public.consultar_reversa_recepcion_616(%L,%L,%L,%L)',t,a,r,k),'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT');
 PERFORM pg_temp.reject616(format('SELECT public.resolver_reversa_recepcion_616(%L,%L,%L,%L,%L)',t,a,r,body,k),'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT');
 IF has_function_privilege('authenticated','public.consultar_reversa_recepcion_616(uuid,uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('anon','public.resolver_reversa_recepcion_616(uuid,uuid,uuid,jsonb,text)','EXECUTE')
  OR has_table_privilege('service_role','public.inventario_reversa_resoluciones','INSERT') THEN RAISE EXCEPTION 'VERIFY616_PRIVATE_LEDGER_EXPOSED';END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $verify$;
SELECT 'VERIFY616_RECOVERY_OK';
SELECT 'VERIFY616_VECTORS:'||jsonb_agg(jsonb_build_object('name',name,'context',context,'receipt',receipt,'detail',detail,'resolution',resolution) ORDER BY name)::text FROM verify616_vectors;
ROLLBACK;
