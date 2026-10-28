\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject574(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY574_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY574_EXPECTED_REJECTION %', expected;
END $fn$;
-- Saldo por lote reconstruido desde el ledger, igual al persistido, y nunca
-- por encima del físico del almacén.
CREATE FUNCTION pg_temp.ledger574(t uuid, pr uuid) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (SELECT * FROM public.inventario_lote_saldos WHERE tenant_id=t AND producto_id=pr) s
    FULL JOIN (
      SELECT m.almacen_id, m.lote_id, m.ubicacion_id,
        sum(CASE WHEN m.tipo IN ('ENTRADA','REGULARIZACION') THEN m.cantidad WHEN m.tipo='SALIDA' THEN -m.cantidad ELSE 0 END) AS stock,
        sum(CASE WHEN m.tipo='RESERVA' THEN m.cantidad WHEN m.tipo='LIBERACION' OR m.consume_reserva THEN -m.cantidad ELSE 0 END) AS reservado
      FROM public.movimientos_inventario_lotes m WHERE m.tenant_id=t AND m.producto_id=pr
      GROUP BY m.almacen_id, m.lote_id, m.ubicacion_id
    ) l ON l.almacen_id=s.almacen_id AND l.lote_id=s.lote_id AND l.ubicacion_id IS NOT DISTINCT FROM s.ubicacion_id
    WHERE coalesce(s.stock_actual,0)<>coalesce(l.stock,0) OR coalesce(s.stock_reservado,0)<>coalesce(l.reservado,0)
  ) OR EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    CROSS JOIN LATERAL (SELECT coalesce(sum(s.stock_actual),0) st, coalesce(sum(s.stock_reservado),0) rs
      FROM public.inventario_lote_saldos s WHERE s.tenant_id=pe.tenant_id AND s.producto_id=pe.producto_id AND s.almacen_id=pe.almacen_id) x
    WHERE pe.tenant_id=t AND pe.producto_id=pr AND (x.st>pe.stock_actual OR x.rs<>pe.stock_reservado)
  ) THEN RAISE EXCEPTION 'VERIFY574_LEDGER_INCOHERENT'; END IF;
END $fn$;
CREATE FUNCTION pg_temp.lote574(t uuid, pr uuid, w uuid, p_codigo text, OUT stock numeric, OUT reservado numeric) LANGUAGE sql AS $fn$
  SELECT coalesce(sum(s.stock_actual),0), coalesce(sum(s.stock_reservado),0)
  FROM public.inventario_lote_saldos s JOIN public.inventario_lotes l ON l.id=s.lote_id
  WHERE s.tenant_id=t AND s.producto_id=pr AND s.almacen_id=w AND upper(l.codigo)=upper(p_codigo)
$fn$;
CREATE FUNCTION pg_temp.fisico574(t uuid, pr uuid, w uuid, OUT stock numeric, OUT reservado numeric) LANGUAGE sql AS $fn$
  SELECT coalesce(stock_actual,0), coalesce(stock_reservado,0) FROM public.producto_existencias
  WHERE tenant_id=t AND producto_id=pr AND almacen_id=w
$fn$;
DO $verify$
DECLARE
  t uuid; a uuid; ot uuid; oa uuid; w uuid; w2 uuid; u1 uuid; pr uuid; np uuid; cl uuid;
  c uuid; l uuid; o uuid; ol uuid; e uuid; p uuid; pd uuid; r0 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  lote_a uuid; lote_b uuid; lote_d uuid; hoy date; j jsonb; tab text; kardex_antes integer; sal uuid; n integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY574_LOCAL_ONLY'; END IF;
  FOREACH tab IN ARRAY ARRAY['inventario_lote_politicas','inventario_lotes','inventario_lote_saldos',
    'inventario_lote_operaciones','movimientos_inventario_lotes'] LOOP
    IF has_table_privilege('service_role','public.'||tab,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.'||tab,'SELECT')
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY574_TABLE_ACL %', tab; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.operar_lotes_inventario_574(uuid,uuid,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.consultar_lotes_inventario_574(uuid,uuid,text,uuid,uuid,uuid,text,integer,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.operar_lotes_inventario_574(uuid,uuid,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('service_role','app.lote_aplicar_movimiento_574(uuid,uuid,uuid,text,numeric,uuid,text,uuid,uuid,text,date,jsonb,boolean,text)','EXECUTE')
  THEN RAISE EXCEPTION 'VERIFY574_FUNCTION_ACL'; END IF;

  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY574',14,'PE','verify574-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY574OTHER',14,'PE','verify574other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_almacen_maestro_tx(t,a,'574-warehouse-2',jsonb_build_object('codigo','ALM574','nombre','Almacén de cuarentena'));
  w2:=coalesce(j->>'id',j#>>'{almacen,id}')::uuid;
  j:=public.crear_ubicacion_almacen_maestro_tx(t,a,w,'574-location-1',jsonb_build_object('codigo','R574A','nombre','Rack A'));
  u1:=coalesce(j->>'id',j#>>'{ubicacion,id}')::uuid;
  IF w2 IS NULL OR u1 IS NULL THEN RAISE EXCEPTION 'VERIFY574_FIXTURE_MASTER %', j; END IF;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-574','nombre','Insumo con lote',
    'categoria','VERIFICACION','unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,20,0,'[]'::jsonb);
  pr:=(j->>'id')::uuid;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-574-N','nombre','Insumo sin lote',
    'categoria','VERIFICACION','unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,10,0,'[]'::jsonb);
  np:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id IN (pr,np);

  -- Un producto sin política conserva el writer 347: ni lotes ni ledger.
  PERFORM public.aplicar_movimiento_inventario_tx(t,np,w,'SALIDA',3,'VERIFY574_NP',gen_random_uuid(),'Salida sin lote',NULL,'L-NP');
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario_lotes WHERE tenant_id=t AND producto_id=np)
    OR EXISTS (SELECT 1 FROM public.inventario_lotes WHERE tenant_id=t AND producto_id=np)
    OR (pg_temp.fisico574(t,np,w)).stock<>7
    OR (SELECT lote FROM public.producto_existencias WHERE tenant_id=t AND producto_id=np AND almacen_id=w)<>'L-NP'
  THEN RAISE EXCEPTION 'VERIFY574_NON_LOT_PRODUCT_CHANGED'; END IF;

  -- Activar exige no tener reservas: una reserva sin lote no podría liberarse por lote.
  PERFORM public.reservar_stock_en_almacen_tx(t,pr,w,2,'PEDIDO',r0::text);
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''CONFIGURAR_POLITICA'',%L,''574-policy-reserved'')',t,a,
    jsonb_build_object('producto_id',pr,'controla_lote',true,'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0)),
    'INVENTORY_LOT_CONTROL_REQUIRES_NO_RESERVATIONS');
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'LIBERACION',2,'PEDIDO_CANCELACION',r0);
  j:=public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',pr,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'574-policy-on');
  IF (SELECT version FROM public.inventario_lote_politicas WHERE tenant_id=t AND producto_id=pr)<>1 THEN RAISE EXCEPTION 'VERIFY574_POLICY'; END IF;
  j:=public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',pr,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'574-policy-on');
  IF j->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY574_POLICY_REPLAY'; END IF;
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''CONFIGURAR_POLITICA'',%L,''574-policy-on'')',t,a,
    jsonb_build_object('producto_id',pr,'controla_lote',true,'requiere_vencimiento',false,'dias_minimos_vida_util',0,'version',0)),
    'INVENTORY_LOT_IDEMPOTENCY_CONFLICT');
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''CONFIGURAR_POLITICA'',%L,''574-policy-stale'')',t,a,
    jsonb_build_object('producto_id',pr,'controla_lote',true,'requiere_vencimiento',true,'dias_minimos_vida_util',5,'version',0)),
    'INVENTORY_LOT_VERSION_CONFLICT');

  -- El stock previo queda sin lote y visible.
  j:=public.consultar_lotes_inventario_574(t,a,'PRODUCTO',pr,w);
  IF (j#>>'{almacenes,0,stock_sin_lote}')::numeric<>20 THEN RAISE EXCEPTION 'VERIFY574_UNASSIGNED %', j#>'{almacenes,0}'; END IF;

  -- Dos lotes del mismo producto en el mismo almacén, con ubicación y vencimiento.
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'ENTRADA',30,'VERIFY574_IN',gen_random_uuid(),'Lote A',u1,'LA',hoy+120);
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'ENTRADA',50,'VERIFY574_IN',gen_random_uuid(),'Lote B',NULL,'LB',hoy+300);
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'ENTRADA',5,'VERIFY574_IN',gen_random_uuid(),'Lote C vencido',NULL,'LC',hoy-10);
  PERFORM pg_temp.reject574(format('SELECT public.aplicar_movimiento_inventario_tx(%L,%L,%L,''ENTRADA'',1,''RECEPCION'',%L)',t,pr,w,gen_random_uuid()),'INVENTORY_LOT_REQUIRED');
  PERFORM pg_temp.reject574(format('SELECT public.aplicar_movimiento_inventario_tx(%L,%L,%L,''ENTRADA'',1,''VERIFY574_IN'',%L,NULL,NULL,''LX'')',t,pr,w,gen_random_uuid()),'INVENTORY_LOT_EXPIRY_REQUIRED');
  PERFORM pg_temp.reject574(format('SELECT public.aplicar_movimiento_inventario_tx(%L,%L,%L,''ENTRADA'',1,''VERIFY574_IN'',%L,NULL,NULL,''la'',%L::date)',t,pr,w,gen_random_uuid(),hoy+121),'INVENTORY_LOT_EXPIRY_MISMATCH');
  SELECT id INTO lote_a FROM public.inventario_lotes WHERE tenant_id=t AND producto_id=pr AND codigo='LA';
  SELECT id INTO lote_b FROM public.inventario_lotes WHERE tenant_id=t AND producto_id=pr AND codigo='LB';
  IF (pg_temp.fisico574(t,pr,w)).stock<>105
    OR (pg_temp.lote574(t,pr,w,'LA')).stock<>30 OR (pg_temp.lote574(t,pr,w,'LB')).stock<>50
    OR (SELECT count(*) FROM public.inventario_lote_saldos WHERE tenant_id=t AND producto_id=pr AND almacen_id=w)<>3
    OR (SELECT ubicacion_id FROM public.inventario_lote_saldos WHERE lote_id=lote_a)<>u1
  THEN RAISE EXCEPTION 'VERIFY574_TWO_LOTS'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Regularización explícita del stock sin lote, sin tocar el kardex físico.
  SELECT count(*) INTO kardex_antes FROM public.movimientos_inventario WHERE tenant_id=t AND producto_id=pr;
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''REGULARIZAR'',%L,''574-regularize-excess'')',t,a,
    jsonb_build_object('producto_id',pr,'almacen_id',w,'motivo','Exceso sobre stock sin lote',
      'lineas',jsonb_build_array(jsonb_build_object('lote','LD','fecha_vencimiento',hoy+400,'cantidad',21)))),
    'INVENTORY_LOT_REGULARIZATION_EXCEEDS_UNASSIGNED');
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''REGULARIZAR'',%L,''574-regularize-noreason'')',t,a,
    jsonb_build_object('producto_id',pr,'almacen_id',w,'motivo','',
      'lineas',jsonb_build_array(jsonb_build_object('lote','LD','fecha_vencimiento',hoy+400,'cantidad',5)))),
    'INVENTORY_LOT_REASON_REQUIRED');
  j:=public.operar_lotes_inventario_574(t,a,'REGULARIZAR',jsonb_build_object('producto_id',pr,'almacen_id',w,
    'motivo','Inventario físico con evidencia de lote','lineas',jsonb_build_array(
      jsonb_build_object('lote','LD','fecha_vencimiento',hoy+400,'cantidad',15))),'574-regularize');
  SELECT id INTO lote_d FROM public.inventario_lotes WHERE tenant_id=t AND producto_id=pr AND codigo='LD';
  j:=public.consultar_lotes_inventario_574(t,a,'PRODUCTO',pr,w);
  IF (j#>>'{almacenes,0,stock_sin_lote}')::numeric<>5 OR (pg_temp.lote574(t,pr,w,'LD')).stock<>15
    OR (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id=t AND producto_id=pr)<>kardex_antes
    OR (pg_temp.fisico574(t,pr,w)).stock<>105
  THEN RAISE EXCEPTION 'VERIFY574_REGULARIZATION %', j#>'{almacenes,0}'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Contrato F01 con entrega programada a 150 días: el pedido vinculado no
  -- puede comprometer un lote que vence antes de esa entrega.
  j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','574','asunto','Suministro con lotes','moneda','PEN',
    'vigencia_desde',hoy,'vigencia_hasta',hoy+400,'responsable_id',a,'lineas',jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',10))),'574-contract');
  c:=(j->>'id')::uuid;
  SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','574-activate');
  j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC574','fecha_emision',hoy,'lineas',jsonb_build_array(jsonb_build_object('contrato_linea_id',l,'cantidad',100))),'574-order');
  o:=(j->>'id')::uuid;
  SELECT id INTO ol FROM public.suministro_orden_lineas WHERE orden_cliente_id=o;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',40,'fecha_programada',hoy+150,'destino','Almacén del cliente'),'574-schedule');
  e:=(j->>'id')::uuid;
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',40,'precio_unitario',10)));
  p:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,jsonb_build_object('motivo','Vincular pedido con lotes',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e))),'574-link');
  j:=public.evaluar_politica_pedido_441(p,t);
  PERFORM public.confirmar_pedido_tx(p,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
  -- FEFO contra la entrega: A (hoy+120) y C (vencido) quedan fuera; B cubre.
  IF (pg_temp.lote574(t,pr,w,'LB')).reservado<>40 OR (pg_temp.lote574(t,pr,w,'LA')).reservado<>0
    OR (pg_temp.lote574(t,pr,w,'LC')).reservado<>0 OR (pg_temp.lote574(t,pr,w,'LD')).reservado<>0
    OR (pg_temp.fisico574(t,pr,w)).reservado<>40
  THEN RAISE EXCEPTION 'VERIFY574_CONTRACT_FEFO_RESERVATION'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Sin sobreventa ni doble reserva: el físico disponible (65) no alcanza por
  -- lote porque 5 están sin lote, 5 vencidos y 40 de B ya están comprometidos.
  PERFORM pg_temp.reject574(format('SELECT public.reservar_stock_en_almacen_tx(%L,%L,%L,56,''PEDIDO'',%L)',t,pr,w,gen_random_uuid()),
    'INVENTORY_LOT_AVAILABLE_INSUFFICIENT_FOR_RESERVATION');
  PERFORM pg_temp.reject574(format('SELECT public.aplicar_movimiento_inventario_tx(%L,%L,%L,''RESERVA'',1,''PEDIDO'',%L,NULL,NULL,''LC'')',t,pr,w,gen_random_uuid()),
    'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED');
  PERFORM pg_temp.reject574(format('SELECT public.aplicar_movimiento_inventario_tx(%L,%L,%L,''SALIDA'',56,''VERIFY574_OUT'',%L)',t,pr,w,gen_random_uuid()),
    'INVENTORY_LOT_AVAILABLE_INSUFFICIENT');

  -- Reasignar y dividir la reserva del pedido: misma cantidad, otros lotes.
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''REASIGNAR_RESERVA'',%L,''574-reassign-bad'')',t,a,
    jsonb_build_object('producto_id',pr,'almacen_id',w,'referencia_id',p,'motivo','Cantidad distinta',
      'lineas',jsonb_build_array(jsonb_build_object('lote_id',lote_b,'cantidad',30)))),'INVENTORY_LOT_REASSIGNMENT_MUST_KEEP_QUANTITY');
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''REASIGNAR_RESERVA'',%L,''574-reassign-short'')',t,a,
    jsonb_build_object('producto_id',pr,'almacen_id',w,'referencia_id',p,'motivo','Lote corto para la entrega',
      'lineas',jsonb_build_array(jsonb_build_object('lote_id',lote_a,'ubicacion_id',u1,'cantidad',30),jsonb_build_object('lote_id',lote_b,'cantidad',10)))),
    'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED');
  j:=public.operar_lotes_inventario_574(t,a,'REASIGNAR_RESERVA',jsonb_build_object('producto_id',pr,'almacen_id',w,'referencia_id',p,
    'motivo','Dividir la entrega entre lotes','lineas',jsonb_build_array(
      jsonb_build_object('lote_id',lote_b,'cantidad',25),jsonb_build_object('lote_id',lote_d,'ubicacion_id',NULL,'cantidad',15))),'574-reassign-split');
  IF (pg_temp.lote574(t,pr,w,'LB')).reservado<>25 OR (pg_temp.lote574(t,pr,w,'LD')).reservado<>15
    OR (pg_temp.fisico574(t,pr,w)).reservado<>40
  THEN RAISE EXCEPTION 'VERIFY574_SPLIT_RESERVATION'; END IF;
  j:=public.consultar_lotes_inventario_574(t,a,'PRODUCTO',pr,w);
  IF (SELECT count(*) FROM jsonb_array_elements(j#>'{almacenes,0,reservas}') x WHERE x->>'referencia_id'=p::text)<>2 THEN
    RAISE EXCEPTION 'VERIFY574_RESERVATION_VIEW %', j#>'{almacenes,0,reservas}'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Despacho parcial real del pedido: libera y descuenta lo reservado por lote, FEFO.
  UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p;
  PERFORM public.despachar_pedido_parcial_tx(p,t,'574-partial-dispatch',jsonb_build_array(jsonb_build_object('detalle_id',pd,'cantidad',30,'almacen_id',w)),'Primera parcialidad',a,'{}'::jsonb);
  SELECT mi.id INTO sal FROM public.movimientos_inventario mi WHERE mi.tenant_id=t AND mi.producto_id=pr AND mi.tipo='SALIDA'
    AND mi.referencia_id=p ORDER BY mi.created_at DESC LIMIT 1;
  IF (SELECT sum(cantidad) FROM public.movimientos_inventario_lotes WHERE movimiento_id=sal)<>30
    OR (SELECT sum(cantidad) FROM public.movimientos_inventario_lotes WHERE movimiento_id=sal AND lote_id=lote_b)<>25
    OR (SELECT sum(cantidad) FROM public.movimientos_inventario_lotes WHERE movimiento_id=sal AND lote_id=lote_d)<>5
    OR (pg_temp.lote574(t,pr,w,'LB')).stock<>25 OR (pg_temp.lote574(t,pr,w,'LB')).reservado<>0
    OR (pg_temp.lote574(t,pr,w,'LD')).stock<>10 OR (pg_temp.lote574(t,pr,w,'LD')).reservado<>10
    OR (pg_temp.fisico574(t,pr,w)).stock<>75 OR (pg_temp.fisico574(t,pr,w)).reservado<>10
  THEN RAISE EXCEPTION 'VERIFY574_DISPATCH_RESERVED_LOTS'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Retorno de ese despacho: vuelve a los mismos lotes.
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'ENTRADA',30,'VERIFY574_REVERSO',sal,'Retorno del despacho',
    p_metadata:=jsonb_build_object('source_movement_id',sal));
  IF (pg_temp.lote574(t,pr,w,'LB')).stock<>50 OR (pg_temp.lote574(t,pr,w,'LD')).stock<>15
    OR (pg_temp.fisico574(t,pr,w)).stock<>105
  THEN RAISE EXCEPTION 'VERIFY574_REVERSAL_MIRROR'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Ajuste: un lote vencido se puede dar de baja; sin lote se rechaza.
  j:=public.registrar_ajuste_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_id',w,'delta',-5,
    'motivo','Baja por vencimiento','lote','LC'),a,'574-adjust-expired');
  IF (pg_temp.lote574(t,pr,w,'LC')).stock<>0 THEN RAISE EXCEPTION 'VERIFY574_ADJUST_EXPIRED'; END IF;
  PERFORM pg_temp.reject574(format('SELECT public.registrar_ajuste_inventario_tx(%L,%L,%L,''574-adjust-nolot'')',t,
    jsonb_build_object('producto_id',pr,'almacen_id',w,'delta',2,'motivo','Sobrante sin lote'),a),'INVENTORY_LOT_REQUIRED');
  j:=public.registrar_ajuste_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_id',w,'delta',4,
    'motivo','Sobrante identificado','lote','LB'),a,'574-adjust-surplus');
  IF (pg_temp.lote574(t,pr,w,'LB')).stock<>54 THEN RAISE EXCEPTION 'VERIFY574_ADJUST_SURPLUS'; END IF;

  -- Transferencia real sin lote indicado: FEFO en origen y el destino recibe los mismos lotes.
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',33,'motivo','Traslado a cuarentena'),a,'574-transfer');
  IF (pg_temp.lote574(t,pr,w2,'LA')).stock<>30 OR (pg_temp.lote574(t,pr,w2,'LB')).stock<>3
    OR (pg_temp.lote574(t,pr,w,'LA')).stock<>0 OR (pg_temp.lote574(t,pr,w,'LB')).stock<>51
    OR (pg_temp.fisico574(t,pr,w2)).stock<>33
  THEN RAISE EXCEPTION 'VERIFY574_TRANSFER_LOTS'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Segunda parcialidad: consume los 10 que el pedido mantiene reservados en LD.
  PERFORM public.despachar_pedido_parcial_tx(p,t,'574-partial-dispatch-2',jsonb_build_array(jsonb_build_object('detalle_id',pd,'cantidad',10,'almacen_id',w)),'Segunda parcialidad',a,'{}'::jsonb);
  IF (pg_temp.lote574(t,pr,w,'LD')).reservado<>0 OR (pg_temp.lote574(t,pr,w,'LD')).stock<>5
    OR (pg_temp.fisico574(t,pr,w)).reservado<>0
  THEN RAISE EXCEPTION 'VERIFY574_SECOND_DISPATCH'; END IF;
  PERFORM pg_temp.ledger574(t,pr);

  -- Vida útil mínima de producto: 350 días deja fuera a LB (hoy+300).
  j:=public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',pr,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',350,'version',1),'574-policy-shelf-life');
  PERFORM pg_temp.reject574(format('SELECT public.reservar_stock_en_almacen_tx(%L,%L,%L,6,''PEDIDO'',%L)',t,pr,w,r3),
    'INVENTORY_LOT_AVAILABLE_INSUFFICIENT_FOR_RESERVATION');
  PERFORM public.reservar_stock_en_almacen_tx(t,pr,w,5,'PEDIDO',r3::text);
  IF (pg_temp.lote574(t,pr,w,'LD')).reservado<>5 OR (pg_temp.lote574(t,pr,w,'LB')).reservado<>0 THEN RAISE EXCEPTION 'VERIFY574_SHELF_LIFE_FEFO'; END IF;
  -- Liberación legacy sin referencia: no se adivina qué lote liberar.
  PERFORM pg_temp.reject574(format('SELECT public.decrementar_stock_reservado(%L,1)',pr),'INVENTORY_LOT_RESERVATION_REFERENCE_REQUIRED');
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w,'LIBERACION',5,'PEDIDO_CANCELACION',r3);
  PERFORM pg_temp.ledger574(t,pr);

  -- Desactivar control con stock por lote perdería la evidencia.
  PERFORM pg_temp.reject574(format('SELECT public.operar_lotes_inventario_574(%L,%L,''CONFIGURAR_POLITICA'',%L,''574-policy-off'')',t,a,
    jsonb_build_object('producto_id',pr,'controla_lote',false,'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',2)),
    'INVENTORY_LOT_CONTROL_HAS_LOT_STOCK');

  -- Consultas: kardex por lote con saldo corrido y lotes por vencer.
  j:=public.consultar_lotes_inventario_574(t,a,'MOVIMIENTOS',pr,w,lote_b);
  IF (j#>>'{items,0,saldo_lote}')::numeric<>51 THEN RAISE EXCEPTION 'VERIFY574_LOT_KARDEX %', j#>'{items,0}'; END IF;
  j:=public.consultar_lotes_inventario_574(t,a,'POR_VENCER',NULL,NULL,NULL,'',150);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'items') x WHERE x->>'lote'='LA')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(j->'items') x WHERE x->>'lote' IN ('LB','LD','LC'))
  THEN RAISE EXCEPTION 'VERIFY574_EXPIRING %', j; END IF;
  j:=public.consultar_lotes_inventario_574(t,a,'PRODUCTOS',NULL,NULL,NULL,'PROD-574');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'items') x WHERE x->>'id'=pr::text AND (x->>'controla_lote')::boolean)
  THEN RAISE EXCEPTION 'VERIFY574_PRODUCT_CATALOG'; END IF;

  -- Una ubicación con stock por lote no se desactiva.
  j:=public.registrar_ajuste_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_id',w,'ubicacion_id',u1,'delta',2,
    'motivo','Sobrante en rack','lote','LB'),a,'574-adjust-rack');
  PERFORM pg_temp.reject574(format('UPDATE public.almacen_ubicaciones SET estado=''INACTIVO'' WHERE id=%L',u1),
    'INVENTORY_MASTER_LOCATION_HAS_STOCK_OR_RESERVATIONS');

  -- Permisos y aislamiento entre empresas.
  BEGIN PERFORM public.consultar_lotes_inventario_574(ot,oa,'PRODUCTO',pr); RAISE EXCEPTION 'VERIFY574_FOREIGN_READ';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN PERFORM public.operar_lotes_inventario_574(t,oa,'REGULARIZAR',jsonb_build_object('producto_id',pr),'574-foreign-actor');
    RAISE EXCEPTION 'VERIFY574_FOREIGN_ACTOR';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.operar_lotes_inventario_574(ot,oa,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',pr,'controla_lote',false,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'574-foreign-product'); RAISE EXCEPTION 'VERIFY574_FOREIGN_PRODUCT';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  SELECT count(*) INTO n FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos pm ON pm.id=rp.permiso_id
  WHERE r.tenant_id=t AND upper(r.nombre)='VENDEDOR' AND pm.codigo='inventario.lotes.manage';
  IF n<>0 THEN RAISE EXCEPTION 'VERIFY574_SELLER_CANNOT_MANAGE_LOTS'; END IF;
  SELECT count(*) INTO n FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos pm ON pm.id=rp.permiso_id
  WHERE r.tenant_id=t AND upper(r.nombre) IN ('ALMACEN','ADMIN_DEMO') AND pm.codigo='inventario.lotes.manage';
  IF n=0 THEN RAISE EXCEPTION 'VERIFY574_WAREHOUSE_ROLE_MANAGES_LOTS'; END IF;

  PERFORM pg_temp.ledger574(t,pr);
  RAISE NOTICE 'VERIFY574_OK: dos lotes sin mezcla, FEFO contra la entrega contractual, división, despacho, reverso, ajuste, transferencia, regularización y aislamiento';
END $verify$;
ROLLBACK;
