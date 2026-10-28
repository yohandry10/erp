\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject575(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY575_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY575_EXPECTED_REJECTION %', expected;
END $fn$;
CREATE FUNCTION pg_temp.prog575(j jsonb, e uuid, campo text) RETURNS numeric LANGUAGE sql AS $fn$
  SELECT (x->>campo)::numeric FROM jsonb_array_elements(j->'programaciones') x WHERE x->>'entrega_id' = e::text
$fn$;
DO $verify$
DECLARE
  t uuid; a uuid; ot uuid; oa uuid; w uuid; pr uuid; np uuid; cl uuid; c uuid; o uuid; e1 uuid; e2 uuid;
  l_pr uuid; l_np uuid; ol_pr uuid; ol_np uuid; p uuid; p2 uuid; d_pr uuid; d_np uuid; pd_pr uuid; pd_np uuid; pd2 uuid;
  lote_a uuid; lote_b uuid; hoy date; j jsonb; r1 jsonb; base jsonb; tab text; n integer; rec uuid;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY575_LOCAL_ONLY'; END IF;
  FOREACH tab IN ARRAY ARRAY['suministro_recepciones','suministro_recepcion_lineas'] LOOP
    IF has_table_privilege('service_role','public.'||tab,'SELECT,INSERT,UPDATE,DELETE')
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY575_ACL %', tab; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.operar_suministro_recepciones_575(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.consultar_suministro_ejecucion_575(uuid,uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'VERIFY575_FUNCTION_ACL'; END IF;

  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY575',14,'PE','verify575-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY575OTHER',14,'PE','verify575other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-575-L','nombre','Medicamento con lote','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-575-N','nombre','Insumo sin lote','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',5,'precio_compra',2,'afectacion_igv','10'),w,50,0,'[]'::jsonb); np:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id IN (pr,np);
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',pr,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'575-lot-policy');
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'ENTRADA',20,'VERIFY575_IN',gen_random_uuid(),'Lote A',NULL,'LA',hoy+300);
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'ENTRADA',30,'VERIFY575_IN',gen_random_uuid(),'Lote B',NULL,'LB',hoy+400);
  SELECT id INTO lote_a FROM public.inventario_lotes WHERE tenant_id=t AND producto_id=pr AND codigo='LA';
  SELECT id INTO lote_b FROM public.inventario_lotes WHERE tenant_id=t AND producto_id=pr AND codigo='LB';

  j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','575','asunto','Suministro con conformidad',
    'moneda','PEN','vigencia_desde',hoy-5,'vigencia_hasta',hoy+400,'responsable_id',a,'lineas',jsonb_build_array(
      jsonb_build_object('producto_id',pr,'cantidad',50,'precio_unitario',10),jsonb_build_object('producto_id',np,'cantidad',50,'precio_unitario',5))),'575-contract');
  c:=(j->>'id')::uuid;
  SELECT id INTO l_pr FROM public.suministro_contrato_lineas WHERE contrato_id=c AND producto_id=pr;
  SELECT id INTO l_np FROM public.suministro_contrato_lineas WHERE contrato_id=c AND producto_id=np;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','575-activate');
  j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC575','fecha_emision',hoy-5,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l_pr,'cantidad',50),jsonb_build_object('contrato_linea_id',l_np,'cantidad',50))),'575-order');
  o:=(j->>'id')::uuid;
  SELECT id INTO ol_pr FROM public.suministro_orden_lineas WHERE orden_cliente_id=o AND contrato_linea_id=l_pr;
  SELECT id INTO ol_np FROM public.suministro_orden_lineas WHERE orden_cliente_id=o AND contrato_linea_id=l_np;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol_pr,'cantidad',40,'fecha_programada',hoy+30,'destino','Hospital, almacén central'),'575-schedule-1'); e1:=(j->>'id')::uuid;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol_np,'cantidad',20,'fecha_programada',hoy+30,'destino','Hospital, almacén central'),'575-schedule-2'); e2:=(j->>'id')::uuid;
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',40,'precio_unitario',10),jsonb_build_object('producto_id',np,'cantidad',20,'precio_unitario',5)));
  p:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd_pr FROM public.pedidos_venta_detalle WHERE pedido_id=p AND producto_id=pr;
  SELECT id INTO pd_np FROM public.pedidos_venta_detalle WHERE pedido_id=p AND producto_id=np;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,jsonb_build_object('motivo','Vincular pedido de la entrega',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd_pr,'entrega_id',e1),
      jsonb_build_object('pedido_detalle_id',pd_np,'entrega_id',e2))),'575-link');
  j:=public.evaluar_politica_pedido_441(p,t);
  PERFORM public.confirmar_pedido_tx(p,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
  UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p;
  PERFORM public.despachar_pedido_parcial_tx(p,t,'575-dispatch',jsonb_build_array(
    jsonb_build_object('detalle_id',pd_pr,'cantidad',30,'almacen_id',w),jsonb_build_object('detalle_id',pd_np,'cantidad',20,'almacen_id',w)),'Primera entrega',a,'{}'::jsonb);
  SELECT id INTO d_pr FROM public.pedido_despachos WHERE pedido_id=p AND detalle_id=pd_pr;
  SELECT id INTO d_np FROM public.pedido_despachos WHERE pedido_id=p AND detalle_id=pd_np;

  -- Trazabilidad: programación → despacho → lotes realmente despachados.
  j:=public.consultar_suministro_ejecucion_575(t,a,c);
  IF pg_temp.prog575(j,e1,'cantidad_despachada')<>30 OR pg_temp.prog575(j,e1,'cantidad_aceptada')<>0
    OR pg_temp.prog575(j,e2,'cantidad_despachada')<>20
    OR (SELECT (x->>'cantidad')::numeric FROM jsonb_array_elements(j->'despachos') d, jsonb_array_elements(d->'lotes') x
        WHERE d->>'despacho_id'=d_pr::text AND x->>'lote'='LA')<>20
    OR (SELECT (x->>'cantidad')::numeric FROM jsonb_array_elements(j->'despachos') d, jsonb_array_elements(d->'lotes') x
        WHERE d->>'despacho_id'=d_pr::text AND x->>'lote'='LB')<>10
  THEN RAISE EXCEPTION 'VERIFY575_TRACE_DISPATCH %', j; END IF;
  -- Marcar entregado no acredita aceptación.
  UPDATE public.pedidos_venta SET tracking_estado='ENTREGADO' WHERE id=p;
  IF pg_temp.prog575(public.consultar_suministro_ejecucion_575(t,a,c),e1,'cantidad_aceptada')<>0 THEN RAISE EXCEPTION 'VERIFY575_TRACKING_IS_NOT_ACCEPTANCE'; END IF;

  base:=jsonb_build_object('pedido_id',p,'fecha_recepcion',hoy,'receptor_nombre','María Quispe','receptor_cargo','Jefa de almacén',
    'guia_referencia','t001-120','pecosa_numero','pec-2026-88','conformidad_numero','conf-41','incidencias','Dos cajas con embalaje dañado');
  r1:=base||jsonb_build_object('lineas',jsonb_build_array(
    jsonb_build_object('despacho_id',d_pr,'lote_id',lote_a,'cantidad_recibida',20,'cantidad_aceptada',18,'cantidad_rechazada',2,'motivo_rechazo','Embalaje dañado'),
    jsonb_build_object('despacho_id',d_pr,'lote_id',lote_b,'cantidad_recibida',10,'cantidad_aceptada',10,'cantidad_rechazada',0),
    jsonb_build_object('despacho_id',d_np,'cantidad_recibida',20,'cantidad_aceptada',20,'cantidad_rechazada',0)));

  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-bad-lot'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_pr,'lote_id',gen_random_uuid(),'cantidad_recibida',1,'cantidad_aceptada',1)))),
    'SUPPLY_RECEPTION_EXCEEDS_DISPATCH');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-no-lot'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_pr,'cantidad_recibida',1,'cantidad_aceptada',1)))),
    'SUPPLY_RECEPTION_EXCEEDS_DISPATCH');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-over'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_pr,'lote_id',lote_a,'cantidad_recibida',21,'cantidad_aceptada',21)))),
    'SUPPLY_RECEPTION_EXCEEDS_DISPATCH');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-sum-bad'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_np,'cantidad_recibida',5,'cantidad_aceptada',4,'cantidad_rechazada',0)))),
    'SUPPLY_RECEPTION_QUANTITY_INVALID');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-reason'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_np,'cantidad_recibida',5,'cantidad_aceptada',4,'cantidad_rechazada',1)))),
    'SUPPLY_RECEPTION_REJECTION_REASON');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-future'')',t,a,c,
    jsonb_set(r1,'{fecha_recepcion}',to_jsonb(hoy+1))),'SUPPLY_RECEPTION_DATE_INVALID');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-before'')',t,a,c,
    jsonb_set(r1,'{fecha_recepcion}',to_jsonb(hoy-1))),'SUPPLY_RECEPTION_DATE_INVALID');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-repeat'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_np,'cantidad_recibida',5,'cantidad_aceptada',5),
      jsonb_build_object('despacho_id',d_np,'cantidad_recibida',5,'cantidad_aceptada',5)))),'SUPPLY_RECEPTION_LINE_REPEATED');
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-unlinked'')',t,a,c,
    jsonb_set(r1,'{pedido_id}',to_jsonb(gen_random_uuid()))),'SUPPLY_RECEPTION_ORDER_NOT_LINKED');

  j:=public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',r1,'575-reception-1'); rec:=(j->>'id')::uuid;
  IF (j->>'numero')::integer<>1 THEN RAISE EXCEPTION 'VERIFY575_NUMBER'; END IF;
  j:=public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',r1,'575-reception-1');
  IF j->>'idempotent'<>'true' OR (SELECT count(*) FROM public.suministro_recepciones WHERE contrato_id=c)<>1 THEN RAISE EXCEPTION 'VERIFY575_REPLAY'; END IF;
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-reception-1'')',t,a,c,
    jsonb_set(r1,'{receptor_nombre}','"Otra persona"')),'SUPPLY_IDEMPOTENCY_CONFLICT');
  j:=public.consultar_suministro_ejecucion_575(t,a,c);
  IF pg_temp.prog575(j,e1,'cantidad_recibida')<>30 OR pg_temp.prog575(j,e1,'cantidad_aceptada')<>28
    OR pg_temp.prog575(j,e1,'cantidad_rechazada')<>2 OR pg_temp.prog575(j,e2,'cantidad_aceptada')<>20
    OR j#>>'{recepciones,0,guia_referencia}'<>'T001-120' OR j#>>'{recepciones,0,pecosa_numero}'<>'PEC-2026-88'
    OR (SELECT count(*) FROM jsonb_array_elements(j#>'{recepciones,0,lineas}'))<>3
  THEN RAISE EXCEPTION 'VERIFY575_TRACE_ACCEPTANCE %', j; END IF;
  -- Lo recibido acumulado no supera lo despachado por lote.
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''REGISTRAR_RECEPCION'',%L,''575-again'')',t,a,c,
    base||jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('despacho_id',d_pr,'lote_id',lote_a,'cantidad_recibida',1,'cantidad_aceptada',1)))),
    'SUPPLY_RECEPTION_EXCEEDS_DISPATCH');

  -- El rechazo libera saldo: se vincula un pedido de reposición por 2 y no por 3.
  IF app.suministro_asignado_572(t,e1)<>38 THEN RAISE EXCEPTION 'VERIFY575_REJECTION_RELEASE'; END IF;
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',3,'precio_unitario',10)));
  p2:=(j->>'pedido_id')::uuid; SELECT id INTO pd2 FROM public.pedidos_venta_detalle WHERE pedido_id=p2;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p2);
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_pedidos_572(%L,%L,%L,''VINCULAR_PEDIDO'',%L,%L,''575-replace-over'')',t,a,c,p2,
    jsonb_build_object('motivo','Reposición excedida','fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd2,'entrega_id',e1)))),
    'SUPPLY_ORDER_EXCEEDS_SCHEDULE');
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',2,'precio_unitario',10)));
  p2:=(j->>'pedido_id')::uuid; SELECT id INTO pd2 FROM public.pedidos_venta_detalle WHERE pedido_id=p2;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p2);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p2,jsonb_build_object('motivo','Reposición del rechazo',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd2,'entrega_id',e1))),'575-replace');
  -- Anular la recepción reocuparía el saldo ya tomado por la reposición.
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''ANULAR_RECEPCION'',%L,''575-annul-blocked'')',t,a,c,
    jsonb_build_object('recepcion_id',rec,'version',1,'motivo','Registro equivocado')),'SUPPLY_RECEPTION_REJECTION_REPLACED');
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'DESVINCULAR_PEDIDO',p2,'{"motivo":"Reposición no requerida"}','575-unlink-replace');

  -- Adjuntar la guía firmada a la recepción.
  j:=public.reservar_suministro_adjunto_573(t,a,c,jsonb_build_object('recurso_tipo','RECEPCION','recurso_id',rec,'nombre','guia-firmada.pdf',
    'mime','application/pdf','bytes',1200,'sha256',repeat('a',64)),'575-attach-guide');
  IF j->>'recurso_tipo'<>'RECEPCION' THEN RAISE EXCEPTION 'VERIFY575_ATTACHMENT_TARGET'; END IF;

  -- Una entrega aceptada no se revierte cancelando el pedido.
  PERFORM pg_temp.reject575(format('UPDATE public.pedido_despachos SET estado=''ANULADO'' WHERE id=%L',d_np),'SUPPLY_DELIVERY_ACCEPTED_BY_CUSTOMER');

  -- Anulación con versión y motivo: conserva el registro y libera lo recibido.
  PERFORM pg_temp.reject575(format('SELECT public.operar_suministro_recepciones_575(%L,%L,%L,''ANULAR_RECEPCION'',%L,''575-annul-stale'')',t,a,c,
    jsonb_build_object('recepcion_id',rec,'version',2,'motivo','Registro equivocado')),'SUPPLY_VERSION_OR_STATE_CONFLICT');
  PERFORM public.operar_suministro_recepciones_575(t,a,c,'ANULAR_RECEPCION',jsonb_build_object('recepcion_id',rec,'version',1,'motivo','Registro equivocado'),'575-annul');
  j:=public.consultar_suministro_ejecucion_575(t,a,c);
  IF pg_temp.prog575(j,e1,'cantidad_aceptada')<>0 OR j#>>'{recepciones,0,estado}'<>'ANULADA' OR app.suministro_asignado_572(t,e1)<>40 THEN
    RAISE EXCEPTION 'VERIFY575_ANNUL'; END IF;
  PERFORM pg_temp.reject575(format('SELECT public.reservar_suministro_adjunto_573(%L,%L,%L,%L,''575-attach-annulled'')',t,a,c,
    jsonb_build_object('recurso_tipo','RECEPCION','recurso_id',rec,'nombre','acta.pdf','mime','application/pdf','bytes',100,'sha256',repeat('b',64))),
    'SUPPLY_ATTACHMENT_TARGET_INVALID');
  j:=public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',r1,'575-reception-2');
  IF (j->>'numero')::integer<>2 THEN RAISE EXCEPTION 'VERIFY575_RENUMBER'; END IF;

  -- Permisos y aislamiento.
  SELECT count(*) INTO n FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos pm ON pm.id=rp.permiso_id
  WHERE r.tenant_id=t AND upper(r.nombre)='VENDEDOR' AND pm.codigo='ventas.contratos.conformar';
  IF n<>0 THEN RAISE EXCEPTION 'VERIFY575_SELLER_CANNOT_CONFORM'; END IF;
  SELECT count(*) INTO n FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos pm ON pm.id=rp.permiso_id
  WHERE r.tenant_id=t AND upper(r.nombre)='ADMIN_DEMO' AND pm.codigo='ventas.contratos.conformar';
  IF n=0 THEN RAISE EXCEPTION 'VERIFY575_ADMIN_CONFORMS'; END IF;
  BEGIN PERFORM public.consultar_suministro_ejecucion_575(ot,oa,c); RAISE EXCEPTION 'VERIFY575_FOREIGN_READ';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN PERFORM public.operar_suministro_recepciones_575(t,oa,c,'REGISTRAR_RECEPCION',r1,'575-foreign'); RAISE EXCEPTION 'VERIFY575_FOREIGN_WRITE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'VERIFY575_OK: despacho por lote, recepción con rechazo, tope acumulado, reposición, anulación, guard de cancelación y aislamiento';
END $verify$;
ROLLBACK;
