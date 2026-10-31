\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject572(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'VERIFY572_EXPECTED_REJECTION %',expected; END $fn$;
DO $verify$
DECLARE t uuid; a uuid; ot uuid; oa uuid; cl uuid; pr uuid; c uuid; l uuid; o uuid; ol uuid; e uuid; p uuid; p2 uuid; pd uuid;
 j jsonb; payload jsonb; mapping jsonb; r jsonb; before_count integer; tab text; warehouse uuid; multi uuid; multi_map jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY572_LOCAL_ONLY'; END IF;
 FOREACH tab IN ARRAY ARRAY['suministro_pedidos','suministro_pedido_lineas'] LOOP
  IF has_table_privilege('service_role','public.'||tab,'SELECT,INSERT,UPDATE,DELETE')
   OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'VERIFY572_ACL'; END IF;
 END LOOP;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
 j:=public.create_demo_tenant_ready_tx('VERIFY572',14,'PE','verify572-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
 j:=public.create_demo_tenant_ready_tx('VERIFY572OTHER',14,'PE','verify572other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
 SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
 SELECT id INTO warehouse FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
 j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-572','nombre','Producto contractual operativo',
  'categoria','VERIFICACION','unidad_medida','NIU','precio_venta',2.5,'precio_compra',1,'afectacion_igv','10'),warehouse,200,0,'[]'::jsonb);
 pr:=(j->>'id')::uuid;
 UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id=pr;
 j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','572','asunto','Contrato operativo','moneda','PEN','vigencia_desde','2026-01-01','vigencia_hasta','2027-12-31','responsable_id',a,'lineas',jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',2.5))),'572-contract');c:=(j->>'id')::uuid;
 SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
 PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','572-activate');
 j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC572','fecha_emision','2026-01-01','lineas',jsonb_build_array(jsonb_build_object('contrato_linea_id',l,'cantidad',100))),'572-order');o:=(j->>'id')::uuid;
 SELECT id INTO ol FROM public.suministro_orden_lineas WHERE orden_cliente_id=o;
 j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',60,'fecha_programada','2026-11-01','destino','Almacen cliente'),'572-schedule');e:=(j->>'id')::uuid;
 payload:=jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN');
 j:=public.crear_pedido_comercial_tx(payload,jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',40,'precio_unitario',2.5)));p:=(j->>'pedido_id')::uuid;
 SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p;
 j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
 mapping:=jsonb_build_object('motivo','Vincular compromiso comercial','fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e)));
 PERFORM pg_temp.reject572(format('SELECT public.operar_suministro_pedidos_572(%L,%L,%L,%L,%L,%L,%L)',t,a,c,'VINCULAR_PEDIDO',p,mapping||'{"fingerprint":"stale"}','572-stale'),'SUPPLY_VERSION_OR_STATE_CONFLICT');
 r:=public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,mapping,'572-link-order');
 j:=public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,mapping,'572-link-order');
 IF j->>'idempotent'<>'true' OR app.suministro_asignado_572(t,e)<>40 THEN RAISE EXCEPTION 'VERIFY572_LINK_REPLAY'; END IF;
 j:=public.consultar_origen_suministro_572(t,a,p);
 IF j#>>'{0,contrato_id}'<>c::text OR j#>>'{0,lineas,0,oc_numero}'<>'OC572' THEN RAISE EXCEPTION 'VERIFY572_BIDIRECTIONAL_ORIGIN'; END IF;
 BEGIN PERFORM public.consultar_origen_suministro_572(ot,oa,p); RAISE EXCEPTION 'VERIFY572_FOREIGN_ORIGIN'; EXCEPTION WHEN no_data_found THEN NULL; END;
 IF has_function_privilege('anon','public.consultar_origen_suministro_572(uuid,uuid,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.consultar_origen_suministro_572(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'VERIFY572_ORIGIN_ACL'; END IF;
 PERFORM pg_temp.reject572(format('UPDATE public.pedidos_venta_detalle SET cantidad=39 WHERE id=%L',pd),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 PERFORM pg_temp.reject572(format('DELETE FROM public.pedidos_venta_detalle WHERE id=%L',pd),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 PERFORM pg_temp.reject572(format('UPDATE public.pedidos_venta SET moneda=''USD'' WHERE id=%L',p),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 PERFORM pg_temp.reject572(format('UPDATE public.pedidos_venta SET total=0 WHERE id=%L',p),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 PERFORM pg_temp.reject572(format('SELECT public.operar_suministro_570(%L,%L,''ANULAR_ENTREGA'',%L,''{"version":1,"motivo":"Cambio solicitado"}'',''572-cancel-schedule'')',t,a,e),'SUPPLY_SCHEDULE_HAS_ORDERS');
 -- El tracking y los contadores operativos siguen actualizándose.
 UPDATE public.pedidos_venta_detalle SET cantidad_despachada=10 WHERE id=pd;
 PERFORM pg_temp.reject572(format('SELECT public.operar_suministro_pedidos_572(%L,%L,%L,%L,%L,%L,%L)',t,a,c,'DESVINCULAR_PEDIDO',p,'{"motivo":"No liberar cantidades ejecutadas"}','572-unlink-executed'),'SUPPLY_ORDER_MISMATCH');
 j:=public.consultar_suministro_pedidos_572(t,a,c,'LISTAR');
 IF j#>>'{0,lineas,0,cantidad_despachada}'<>'10.0000' AND (j#>>'{0,lineas,0,cantidad_despachada}')::numeric<>10 THEN RAISE EXCEPTION 'VERIFY572_PROGRESS'; END IF;
 UPDATE public.pedidos_venta_detalle SET cantidad_despachada=0 WHERE id=pd;
 j:=public.crear_pedido_comercial_tx(payload,jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',30,'precio_unitario',2.5)));p2:=(j->>'pedido_id')::uuid;
 j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p2);
 SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p2;
 PERFORM pg_temp.reject572(format('UPDATE public.pedidos_venta_detalle SET pedido_id=%L WHERE id=%L',p,pd),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 mapping:=jsonb_build_object('motivo','Vincular segunda parcialidad','fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e)));
 SELECT count(*) INTO before_count FROM public.suministro_pedidos WHERE contrato_id=c;
 PERFORM pg_temp.reject572(format('SELECT public.operar_suministro_pedidos_572(%L,%L,%L,%L,%L,%L,%L)',t,a,c,'VINCULAR_PEDIDO',p2,mapping,'572-overflow'),'SUPPLY_ORDER_EXCEEDS_SCHEDULE');
 IF (SELECT count(*) FROM public.suministro_pedidos WHERE contrato_id=c)<>before_count THEN RAISE EXCEPTION 'VERIFY572_ORPHAN'; END IF;
 -- El writer legacy admite líneas repetidas; también debe respetar el saldo acumulado.
 j:=public.crear_pedido_completo(payload,jsonb_build_array(
  jsonb_build_object('producto_id',pr,'descripcion','Parcial A','cantidad',15,'precio_unitario',2.5),
  jsonb_build_object('producto_id',pr,'descripcion','Parcial B','cantidad',15,'precio_unitario',2.5)));multi:=(j->>'pedido_id')::uuid;
 j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',multi);
 SELECT jsonb_build_object('motivo','Dos lineas consumen mismo saldo','fingerprint',j->>'fingerprint','lineas',
  jsonb_agg(jsonb_build_object('pedido_detalle_id',d.id,'entrega_id',e))) INTO multi_map FROM public.pedidos_venta_detalle d WHERE pedido_id=multi;
 PERFORM pg_temp.reject572(format('SELECT public.operar_suministro_pedidos_572(%L,%L,%L,%L,%L,%L,%L)',t,a,c,'VINCULAR_PEDIDO',multi,multi_map,'572-same-order-overflow'),'SUPPLY_ORDER_EXCEEDS_SCHEDULE');
 IF EXISTS(SELECT 1 FROM public.suministro_pedidos WHERE pedido_id=multi) THEN RAISE EXCEPTION 'VERIFY572_MULTI_ORPHAN'; END IF;
 PERFORM public.operar_suministro_pedidos_572(t,a,c,'DESVINCULAR_PEDIDO',p,'{"motivo":"Corregir pedido pendiente"}','572-unlink');
 UPDATE public.pedidos_venta_detalle SET descripcion='Descripcion editable tras desvincular' WHERE pedido_id=p;
 PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p2,mapping,'572-link-second');
 -- Usa cancelación operativa real, que libera asignación sin borrar historia.
 PERFORM public.cancelar_pedido_venta_tx(p2,t,a,'Cliente cancela pedido','572-cancel-pedido',false);
 IF app.suministro_asignado_572(t,e)<>0 THEN RAISE EXCEPTION 'VERIFY572_CANCEL_BALANCE'; END IF;
 PERFORM pg_temp.reject572(format('UPDATE public.pedidos_venta SET estado=''PENDIENTE'' WHERE id=%L',p2),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 -- El primer pedido se vuelve a vincular y cruza los writers reales de reserva y
 -- despacho parcial; el contrato ve sus cantidades sin crear otro movimiento.
 j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
 SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p;
 mapping:=jsonb_build_object('motivo','Ejecutar compromiso contractual','fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e)));
 PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,mapping,'572-relink-operational');
 j:=public.evaluar_politica_pedido_441(p,t);
 PERFORM public.confirmar_pedido_tx(p,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
 PERFORM pg_temp.reject572(format('UPDATE public.pedidos_venta SET estado=''PENDIENTE'' WHERE id=%L',p),'SUPPLY_LINKED_ORDER_IMMUTABLE');
 PERFORM pg_temp.reject572(format('SELECT public.operar_suministro_pedidos_572(%L,%L,%L,%L,%L,%L,%L)',t,a,c,'DESVINCULAR_PEDIDO',p,'{"motivo":"No permitir tras confirmar"}','572-unlink-confirmed'),'SUPPLY_VERSION_OR_STATE_CONFLICT');
 UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p;
 PERFORM public.despachar_pedido_parcial_tx(p,t,'572-partial-dispatch',jsonb_build_array(jsonb_build_object('detalle_id',pd,'cantidad',10,'almacen_id',warehouse)),'Parcial contractual',a,'{}'::jsonb);
 IF (SELECT cantidad_despachada FROM public.pedidos_venta_detalle WHERE id=pd)<>10 OR app.suministro_asignado_572(t,e)<>40 THEN RAISE EXCEPTION 'VERIFY572_OPERATIONAL_DISPATCH'; END IF;
 BEGIN PERFORM public.consultar_suministro_pedidos_572(ot,oa,c,'LISTAR'); RAISE EXCEPTION 'VERIFY572_FOREIGN_READ'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.operar_suministro_pedidos_572(t,oa,c,'DESVINCULAR_PEDIDO',p,'{"motivo":"Intento ajeno"}','572-foreign'); RAISE EXCEPTION 'VERIFY572_FOREIGN_WRITE'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'VERIFY572_OK: vínculo, replay, saldos, conservación, cancelación operativa y aislamiento';
END $verify$;
ROLLBACK;
