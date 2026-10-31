\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject576(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY576_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY576_EXPECTED_REJECTION %', expected;
END $fn$;
-- Factura un pedido vinculado con el writer canónico 446.
CREATE FUNCTION pg_temp.facturar576(t uuid, a uuid, p uuid, cl uuid, pd uuid, pr uuid, q numeric, serie text, key text)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE det jsonb; base numeric := q * 10; igv numeric := round(q * 10 * 0.18, 2);
BEGIN
  det := jsonb_build_array(jsonb_build_object('orden', 1, 'pedido_detalle_id', pd, 'producto_id', pr,
    'codigo_producto', 'PROD-576', 'descripcion', 'Insumo contractual', 'unidad_medida', 'NIU', 'cantidad', q,
    'precio_unitario', 10, 'descuento_unitario', 0, 'valor_venta', base, 'impuesto_igv', igv, 'impuesto_isc', 0,
    'total_item', base + igv, 'afectacion_igv', '10'));
  RETURN public.facturar_pedido_venta_tx(p, t, a,
    jsonb_build_object('tipo_documento', '01', 'serie', serie, 'numero', 1, 'ruc_emisor', '20600000013',
      'razon_social_emisor', 'Empresa Verify 576', 'direccion_emisor', 'Lima', 'tipo_documento_receptor', '6',
      'documento_receptor', '20123456786', 'razon_social_receptor', 'Hospital Verify 576', 'direccion_receptor', 'Lima',
      'cliente_id', cl, 'moneda', 'PEN', 'total_gravadas', base, 'total_exoneradas', 0, 'total_inafectas', 0,
      'total_exportacion', 0, 'total_igv', igv, 'total_venta', base + igv, 'items', det,
      'fecha_emision', now(), 'fecha_vencimiento', (current_date + 30)::text, 'estado', 'FIRMADO',
      'sunat_status', 'READY', 'xml_firmado', '<Invoice>576</Invoice>', 'hash', 'hash-' || serie,
      'hash_firma', 'hash-' || serie, 'created_by', a),
    jsonb_build_object('pedido_id', p, 'subtotal', base, 'impuesto_igv', igv, 'impuesto_isc', 0, 'total', base + igv, 'tipo_cambio', 1),
    det,
    jsonb_build_object('cliente_id', cl, 'monto_total', base + igv, 'monto_pendiente', base + igv,
      'retencion_total', 0, 'percepcion_total', 0, 'detraccion_total', 0, 'anticipo_total', 0),
    gen_random_uuid(), key);
END $fn$;
DO $verify$
DECLARE
  t uuid; a uuid; ot uuid; oa uuid; w uuid; pr uuid; cl uuid; c uuid; l uuid; o uuid; ol uuid; e1 uuid; e2 uuid;
  p1 uuid; p2 uuid; pd1 uuid; pd2 uuid; rec uuid; cxc uuid; bank uuid; hoy date; j jsonb; ver integer; doc jsonb; lin jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY576_LOCAL_ONLY'; END IF;
  IF has_function_privilege('anon','public.consultar_suministro_estado_cuenta_576(uuid,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.configurar_facturacion_suministro_576(uuid,uuid,uuid,jsonb,text)','EXECUTE')
  THEN RAISE EXCEPTION 'VERIFY576_ACL'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY576',14,'PE','verify576-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY576OTHER',14,'PE','verify576other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  SELECT id INTO bank FROM public.cuentas_bancarias WHERE tenant_id=t AND coalesce(activo,true) AND upper(coalesce(moneda,'PEN'))='PEN' ORDER BY id LIMIT 1;
  IF bank IS NULL THEN RAISE EXCEPTION 'VERIFY576_FIXTURE_BANK'; END IF;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-576','nombre','Insumo contractual','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,100,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id=pr;

  j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','576','asunto','Suministro con facturación por conformidad',
    'moneda','PEN','vigencia_desde',hoy-5,'vigencia_hasta',hoy+400,'responsable_id',a,'lineas',jsonb_build_array(
      jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',10))),'576-contract');
  c:=(j->>'id')::uuid; SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
  PERFORM pg_temp.reject576(format('SELECT public.configurar_facturacion_suministro_576(%L,%L,%L,%L,''576-billing-bad'')',t,a,c,
    jsonb_build_object('base_facturacion','HITO','version',1,'motivo','Base no admitida')),'SUPPLY_INPUT_INVALID');
  PERFORM public.configurar_facturacion_suministro_576(t,a,c,jsonb_build_object('base_facturacion','CONFORMIDAD','version',1,
    'motivo','El cliente paga contra conformidad'),'576-billing');
  SELECT version INTO ver FROM public.suministro_contratos WHERE id=c;
  IF (SELECT base_facturacion FROM public.suministro_contratos WHERE id=c)<>'CONFORMIDAD' OR ver<>2 THEN RAISE EXCEPTION 'VERIFY576_POLICY'; END IF;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,jsonb_build_object('version',ver),'576-activate');
  j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC576','fecha_emision',hoy-5,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l,'cantidad',100))),'576-order'); o:=(j->>'id')::uuid;
  SELECT id INTO ol FROM public.suministro_orden_lineas WHERE orden_cliente_id=o;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',40,'fecha_programada',hoy+10,'destino','Hospital central'),'576-schedule-1'); e1:=(j->>'id')::uuid;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',30,'fecha_programada',hoy+40,'destino','Hospital central'),'576-schedule-2'); e2:=(j->>'id')::uuid;

  -- Primera entrega: pedido de 40, despacho completo y conformidad parcial.
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',40,'precio_unitario',10))); p1:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd1 FROM public.pedidos_venta_detalle WHERE pedido_id=p1;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p1);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p1,jsonb_build_object('motivo','Primera entrega',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd1,'entrega_id',e1))),'576-link-1');
  j:=public.evaluar_politica_pedido_441(p1,t);
  PERFORM public.confirmar_pedido_tx(p1,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
  UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p1;
  PERFORM public.despachar_pedido_parcial_tx(p1,t,'576-dispatch-1',jsonb_build_array(jsonb_build_object('detalle_id',pd1,'cantidad',40,'almacen_id',w)),'Entrega 1',a,'{}'::jsonb);
  j:=public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',jsonb_build_object('pedido_id',p1,'fecha_recepcion',hoy,
    'receptor_nombre','Jefe de almacén','lineas',jsonb_build_array(jsonb_build_object('despacho_id',
      (SELECT id FROM public.pedido_despachos WHERE pedido_id=p1),'cantidad_recibida',40,'cantidad_aceptada',38,
      'cantidad_rechazada',2,'motivo_rechazo','Cajas abolladas'))),'576-reception-partial');
  rec:=(j->>'id')::uuid;
  IF (SELECT upper(estado::text) FROM public.pedidos_venta WHERE id=p1) NOT IN ('LISTO_FACTURAR','CONFIRMADO','FACTURADO') THEN
    UPDATE public.pedidos_venta SET estado='LISTO_FACTURAR' WHERE id=p1;
  END IF;
  -- Con conformidad parcial no se factura la entrega.
  PERFORM pg_temp.reject576(format('SELECT pg_temp.facturar576(%L,%L,%L,%L,%L,%L,40,''F576'',''576-invoice-early'')',t,a,p1,cl,pd1,pr),
    'SUPPLY_INVOICE_REQUIRES_CONFORMITY');
  IF (SELECT factura_id FROM public.pedidos_venta WHERE id=p1) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.cuentas_por_cobrar WHERE tenant_id=t AND pedido_id=p1) THEN
    RAISE EXCEPTION 'VERIFY576_REJECTED_INVOICE_LEFT_EFFECTS'; END IF;
  j:=public.consultar_suministro_estado_cuenta_576(t,a,c);
  lin:=j#>'{lineas,0}';
  IF (lin->>'despachado')::numeric<>40 OR (lin->>'aceptado')::numeric<>38 OR (lin->>'facturado')::numeric<>0
    OR (lin->>'por_facturar')::numeric<>38 OR (lin->>'por_facturar_valor')::numeric<>380 THEN
    RAISE EXCEPTION 'VERIFY576_STATEMENT_BEFORE_INVOICE %', lin; END IF;

  -- Corregida la conformidad (aceptación total), la entrega se factura una vez.
  PERFORM public.operar_suministro_recepciones_575(t,a,c,'ANULAR_RECEPCION',jsonb_build_object('recepcion_id',rec,'version',1,
    'motivo','El cliente reemplazó el acta'),'576-reception-annul');
  PERFORM public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',jsonb_build_object('pedido_id',p1,'fecha_recepcion',hoy,
    'receptor_nombre','Jefe de almacén','conformidad_numero','CONF-576','lineas',jsonb_build_array(jsonb_build_object('despacho_id',
      (SELECT id FROM public.pedido_despachos WHERE pedido_id=p1),'cantidad_recibida',40,'cantidad_aceptada',40,
      'cantidad_rechazada',0))),'576-reception-full');
  j:=pg_temp.facturar576(t,a,p1,cl,pd1,pr,40,'F576','576-invoice-1');
  IF upper(j->>'pedido_estado')<>'FACTURADO' THEN RAISE EXCEPTION 'VERIFY576_INVOICE %', j; END IF;
  SELECT id INTO cxc FROM public.cuentas_por_cobrar WHERE tenant_id=t AND pedido_id=p1 AND coalesce(activo,true);
  IF cxc IS NULL THEN RAISE EXCEPTION 'VERIFY576_CXC_MISSING'; END IF;

  -- Segunda entrega parcial: 20 de 30 despachados y aceptados, sin facturar.
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',30,'precio_unitario',10))); p2:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd2 FROM public.pedidos_venta_detalle WHERE pedido_id=p2;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p2);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p2,jsonb_build_object('motivo','Segunda entrega',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd2,'entrega_id',e2))),'576-link-2');
  j:=public.evaluar_politica_pedido_441(p2,t);
  PERFORM public.confirmar_pedido_tx(p2,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
  UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p2;
  PERFORM public.despachar_pedido_parcial_tx(p2,t,'576-dispatch-2',jsonb_build_array(jsonb_build_object('detalle_id',pd2,'cantidad',20,'almacen_id',w)),'Entrega 2 parcial',a,'{}'::jsonb);
  PERFORM public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',jsonb_build_object('pedido_id',p2,'fecha_recepcion',hoy,
    'receptor_nombre','Jefe de almacén','lineas',jsonb_build_array(jsonb_build_object('despacho_id',
      (SELECT id FROM public.pedido_despachos WHERE pedido_id=p2),'cantidad_recibida',20,'cantidad_aceptada',20,'cantidad_rechazada',0))),'576-reception-2');

  -- Cobro parcial real y el efecto de una nota de crédito referenciada.
  PERFORM public.registrar_cxc_pago_tx(t,cxc,jsonb_build_object('monto',200,'fecha_pago',current_date,'metodo_pago','TRANSFERENCIA',
    'cuenta_bancaria_id',bank,'referencia','OP-576-1','idempotency_key','verify:576:cobro:1'),a);
  -- Efecto financiero de una nota aceptada (mismo registro que escribe 494).
  INSERT INTO public.cxc_pagos (tenant_id, cuenta_id, pedido_id, tipo, monto, moneda, fecha_pago, metodo_pago, referencia,
    usuario_id, idempotency_key, source, estado, activo, metadata)
  VALUES (t, cxc, p1, 'NOTA_CREDITO', 23.6, 'PEN', current_date, 'NOTA_CREDITO', 'FC01-1', a,
    'verify:576:nota', 'cpe.nota_referenciada.atomic', 'ACTIVO', true, '{"simulado":"efecto 494"}');
  UPDATE public.cuentas_por_cobrar SET monto_pendiente = monto_pendiente - 23.6, saldo_pendiente = saldo_pendiente - 23.6,
    saldo = coalesce(saldo, monto_total) - 23.6 WHERE id = cxc;

  j:=public.consultar_suministro_estado_cuenta_576(t,a,c);
  lin:=j#>'{lineas,0}'; doc:=j#>'{documentos,0}';
  IF (lin->>'contratado')::numeric<>100 OR (lin->>'en_oc')::numeric<>100 OR (lin->>'programado')::numeric<>70
    OR (lin->>'en_pedidos')::numeric<>70 OR (lin->>'despachado')::numeric<>60 OR (lin->>'aceptado')::numeric<>60
    OR (lin->>'facturado')::numeric<>40 OR (lin->>'facturado_valor')::numeric<>400
    OR (lin->>'por_facturar')::numeric<>20 OR (lin->>'por_facturar_valor')::numeric<>200
  THEN RAISE EXCEPTION 'VERIFY576_STATEMENT_LINES %', lin; END IF;
  IF jsonb_array_length(j->'documentos')<>1 OR (doc->>'total')::numeric<>472 OR (doc->>'cobrado')::numeric<>200
    OR (doc->>'notas_credito')::numeric<>23.6 OR (doc->>'saldo')::numeric<>248.4 OR (doc->>'cuadra')::boolean IS NOT TRUE
    OR doc->>'pedido_id'<>p1::text
  THEN RAISE EXCEPTION 'VERIFY576_STATEMENT_DOCUMENTS %', j->'documentos'; END IF;
  IF (j#>>'{totales,0,moneda}')<>'PEN' OR (j#>>'{totales,0,neto}')::numeric<>448.4 OR (j#>>'{totales,0,saldo}')::numeric<>248.4
    OR (j#>>'{ordenes,0,facturado_valor}')::numeric<>400 OR (j#>>'{ordenes,0,por_facturar_valor}')::numeric<>200
  THEN RAISE EXCEPTION 'VERIFY576_STATEMENT_TOTALS %', j; END IF;

  -- Un descuadre entre documento y CxC queda visible.
  UPDATE public.cuentas_por_cobrar SET monto_pendiente = monto_pendiente + 1 WHERE id = cxc;
  IF (public.consultar_suministro_estado_cuenta_576(t,a,c)#>>'{documentos,0,cuadra}')::boolean THEN
    RAISE EXCEPTION 'VERIFY576_MISMATCH_HIDDEN'; END IF;
  UPDATE public.cuentas_por_cobrar SET monto_pendiente = monto_pendiente - 1 WHERE id = cxc;

  BEGIN PERFORM public.consultar_suministro_estado_cuenta_576(ot,oa,c); RAISE EXCEPTION 'VERIFY576_FOREIGN_READ';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN PERFORM public.configurar_facturacion_suministro_576(t,oa,c,jsonb_build_object('base_facturacion','DESPACHO','version',3,'motivo','Intento ajeno'),'576-foreign');
    RAISE EXCEPTION 'VERIFY576_FOREIGN_WRITE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'VERIFY576_OK: conformidad exigida, factura única por entrega, por facturar, cobro, nota, cuadre y aislamiento';
END $verify$;
ROLLBACK;
