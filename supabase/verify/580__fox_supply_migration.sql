\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject580(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY580_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY580_EXPECTED_REJECTION %', expected;
END $fn$;
DO $verify$
DECLARE
  t uuid; a uuid; b uuid; ot uuid; oa uuid; w uuid; s uuid; pr uuid; lp uuid; doc text; hoy date; j jsonb; c uuid;
  run_c uuid; run_s uuid; contrato jsonb; oc jsonb; n integer; outbox_antes integer; asientos_antes integer;
  control jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY580_LOCAL_ONLY'; END IF;
  IF has_table_privilege('service_role','public.migracion_correspondencias','SELECT,INSERT,UPDATE,DELETE')
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.migracion_correspondencias'::regclass AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'VERIFY580_ACL'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY580',14,'PE','verify580-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY580OTHER',14,'PE','verify580other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  SELECT id INTO b FROM public.usuarios_sistema WHERE tenant_id=t AND id<>a AND coalesce(activo,false) AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  -- Fixture: la migración pertenece a ADMIN (la demo la clona en ADMIN_DEMO).
  PERFORM app.sembrar_permisos_migracion_554(t);
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE tenant_id=t AND upper(nombre)='ADMIN') THEN
    INSERT INTO public.roles (tenant_id, nombre, descripcion) VALUES (t, 'ADMIN', 'Administrador');
    PERFORM app.sembrar_permisos_migracion_554(t);
  END IF;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT a, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='ADMIN';
  IF NOT EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=t AND upper(r.nombre)='ADMIN' AND p.codigo='migration.suministro.import')
    OR EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=t AND upper(r.nombre) NOT IN ('ADMIN','ADMIN_DEMO') AND p.codigo='migration.suministro.import')
  THEN RAISE EXCEPTION 'VERIFY580_PERMISSION_SCOPE'; END IF;

  hoy:=app.hoy_tenant(t);
  -- Fixture: el cliente ya llegó con el importador de clientes (external_id = código FOX).
  doc:='FOX-CLI-1';
  UPDATE public.clientes SET external_id=doc WHERE id=(SELECT id FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1);
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  SELECT id INTO s FROM public.sucursales WHERE tenant_id=t AND lower(coalesce(estado,'activo'))='activo' ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','FOX-1','nombre','Insumo migrado','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','FOX-L','nombre','Medicamento migrado','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',20,'precio_compra',8,'afectacion_igv','10'),w,0,0,'[]'::jsonb); lp:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id IN (pr,lp);
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',lp,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'580-lot-policy');

  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t, 'contratos_suministro', a, 6) RETURNING id INTO run_c;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t, 'stock_inicial', a, 6) RETURNING id INTO run_s;
  PERFORM pg_temp.reject580(format('INSERT INTO public.migration_runs (tenant_id, run_type, started_by) VALUES (%L, ''pedidos'', %L)', t, a),
    'new row for relation "migration_runs" violates check constraint');
  SELECT count(*) INTO outbox_antes FROM public.outbox_events WHERE tenant_id=t;
  SELECT count(*) INTO asientos_antes FROM public.asientos_contables WHERE tenant_id=t;

  -- Ensayo completo: mismo lote, errores por registro y conciliación, sin persistir nada.
  j:=public.ensayar_migracion_fox_580(t,a,jsonb_build_object(
    'contratos',jsonb_build_array(jsonb_build_object('id_origen','C-100','fila',2,'payload',jsonb_build_object('numero','FOX-100',
      'cliente_codigo',doc,'asunto','Suministro anual migrado','moneda','PEN','vigencia_desde',hoy-200,'vigencia_hasta',hoy+200,
      'estado','VIGENTE','lineas',jsonb_build_array(
        jsonb_build_object('id_origen','1','producto_codigo','FOX-1','cantidad_original',1000,'cantidad_ejecutada',600,'precio_unitario',10),
        jsonb_build_object('id_origen','2','producto_codigo','fox-l','cantidad_original',50,'cantidad_ejecutada',50,'precio_unitario',20))))),
    'oc',jsonb_build_array(jsonb_build_object('id_origen','OC-9','fila',2,'payload',jsonb_build_object('contrato_id_origen','C-100',
      'numero','OC-FOX-9','fecha_emision',hoy-30,'lineas',jsonb_build_array(
        jsonb_build_object('id_origen','1','contrato_linea_id_origen','1','cantidad_original',300,'cantidad_entregada',100))))),
    'entregas',jsonb_build_array(
      jsonb_build_object('id_origen','E-1','fila',2,'payload',jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1',
        'cantidad',120,'cantidad_entregada',0,'fecha_programada',hoy+10,'destino','Hospital regional')),
      jsonb_build_object('id_origen','E-2','fila',3,'payload',jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1',
        'cantidad',80,'cantidad_entregada',30,'fecha_programada',hoy-5,'destino','Hospital regional')),
      jsonb_build_object('id_origen','E-3','fila',4,'payload',jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1',
        'cantidad',100,'fecha_programada',hoy+20,'destino','Hospital'))),
    'stock',jsonb_build_array(
      jsonb_build_object('external_id','stock:FOX-1:'||w||':'||hoy,'fila',2,'stock',jsonb_build_object('producto_codigo','FOX-1',
        'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',70,'costo_unitario',4)),
      jsonb_build_object('external_id','stock:FOX-L:L1:'||w||':'||hoy,'fila',3,'stock',jsonb_build_object('producto_codigo','FOX-L',
        'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',5,'costo_unitario',8,'lote','l1','fecha_vencimiento',hoy+60)),
      jsonb_build_object('external_id','stock:FOX-L:L0:'||w||':'||hoy,'fila',4,'stock',jsonb_build_object('producto_codigo','FOX-L',
        'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',3,'costo_unitario',8,'lote','L0','fecha_vencimiento',hoy-10)),
      jsonb_build_object('external_id','stock:FOX-L:sin-lote','fila',5,'stock',jsonb_build_object('producto_codigo','FOX-L',
        'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',1,'costo_unitario',8)))),
    jsonb_build_object('contratos',jsonb_build_object('registros',1,'lineas',1,'cantidad',400,'valor',4000),
      'oc',jsonb_build_object('registros',1,'lineas',1,'cantidad',200,'valor',2000),
      'entregas',jsonb_build_object('registros',2,'cantidad',170),
      'stock',jsonb_build_object('registros',3,'lotes',2,'cantidad',78,'valor',344)));
  IF j->>'ensayo'<>'true' OR (j->>'errores')::integer<>2 OR j#>>'{conciliacion,cuadra}'<>'true'
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'registros') x WHERE x->>'id_origen'='E-3' AND x->>'error' LIKE 'SUPPLY_SCHEDULE_EXCEEDS_OC%'
      AND (x->>'fila')::integer=4)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'registros') x WHERE x->>'entidad'='STOCK' AND x->>'error' LIKE 'MIGRATION_STOCK_LOT_REQUIRED%')
  THEN RAISE EXCEPTION 'VERIFY580_REHEARSAL %', j; END IF;
  IF EXISTS (SELECT 1 FROM public.migracion_correspondencias WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.suministro_contratos WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.migration_row_operations WHERE tenant_id=t AND operation_type='STOCK_INICIAL')
    OR EXISTS (SELECT 1 FROM public.inventario_lote_saldos WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.suministro_operaciones WHERE tenant_id=t AND idempotency_key LIKE 'fox:%')
  THEN RAISE EXCEPTION 'VERIFY580_REHEARSAL_PERSISTED'; END IF;

  -- Contrato: sólo lo no ejecutado; la línea agotada no se migra.
  contrato:=jsonb_build_object('numero','FOX-100','cliente_codigo',doc,'asunto','Suministro anual migrado','moneda','PEN',
    'vigencia_desde',hoy-200,'vigencia_hasta',hoy+200,'estado','VIGENTE','lineas',jsonb_build_array(
      jsonb_build_object('id_origen','1','producto_codigo','FOX-1','cantidad_original',1000,'cantidad_ejecutada',600,'precio_unitario',10),
      jsonb_build_object('id_origen','2','producto_codigo','fox-l','cantidad_original',50,'cantidad_ejecutada',50,'precio_unitario',20)));
  j:=public.importar_suministro_fox_580(t,a,run_c,'CONTRATO','C-100',contrato);
  c:=(j->>'id')::uuid;
  IF j->>'action'<>'CREATED' OR (j->>'lineas')::integer<>1 OR (j->>'lineas_cerradas')::integer<>1
    OR (SELECT estado FROM public.suministro_contratos WHERE id=c)<>'ACTIVO'
    OR (SELECT cantidad FROM public.suministro_contrato_lineas WHERE contrato_id=c)<>400
    OR app.fox_par_580(t,'CONTRATO_LINEA','C-100#1') IS NULL OR app.fox_par_580(t,'CONTRATO_LINEA','C-100#2') IS NOT NULL
  THEN RAISE EXCEPTION 'VERIFY580_CONTRACT %', j; END IF;
  j:=public.importar_suministro_fox_580(t,a,run_c,'CONTRATO','C-100',contrato);
  IF j->>'action'<>'IDEMPOTENT' OR j->>'id'<>c::text OR (SELECT count(*) FROM public.suministro_contratos WHERE tenant_id=t)<>1 THEN
    RAISE EXCEPTION 'VERIFY580_CONTRACT_REPLAY'; END IF;
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''CONTRATO'',''C-100'',%L)',t,a,run_c,
    jsonb_set(contrato,'{lineas,0,cantidad_ejecutada}','500')),'MIGRATION_FOX_SOURCE_CHANGED');
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''CONTRATO'',''C-200'',%L)',t,a,run_c,
    jsonb_set(jsonb_set(contrato,'{numero}','"FOX-200"'),'{lineas,0,producto_codigo}','"NO-EXISTE"')),'MIGRATION_FOX_PRODUCT_NOT_FOUND');
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''CONTRATO'',''C-300'',%L)',t,a,run_c,
    jsonb_set(jsonb_set(contrato,'{numero}','"FOX-300"'),'{lineas,0,cantidad_ejecutada}','1000')),'MIGRATION_FOX_NOTHING_OPEN');
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''CONTRATO'',''C-400'',%L)',t,a,run_c,
    jsonb_set(jsonb_set(contrato,'{numero}','"FOX-400"'),'{cliente_codigo}','"00000000"')),'MIGRATION_FOX_CLIENT_NOT_FOUND');
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''CONTRATO'',''C-500'',%L)',t,a,run_c,
    jsonb_set(jsonb_set(contrato,'{numero}','"FOX-500"'),'{lineas,0,cantidad_ejecutada}','1200')),'MIGRATION_FOX_QUANTITY_INVALID');

  -- OC abierta: lo pendiente de entregar.
  oc:=jsonb_build_object('contrato_id_origen','C-100','numero','OC-FOX-9','fecha_emision',hoy-30,'lineas',jsonb_build_array(
    jsonb_build_object('id_origen','1','contrato_linea_id_origen','1','cantidad_original',300,'cantidad_entregada',100)));
  j:=public.importar_suministro_fox_580(t,a,run_c,'OC','OC-9',oc);
  IF j->>'action'<>'CREATED' OR (SELECT sum(cantidad) FROM public.suministro_orden_lineas WHERE orden_cliente_id=(j->>'id')::uuid)<>200
    OR app.fox_par_580(t,'OC_LINEA','OC-9#1') IS NULL THEN RAISE EXCEPTION 'VERIFY580_ORDER %', j; END IF;
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''OC'',''OC-X'',%L)',t,a,run_c,
    jsonb_set(oc,'{contrato_id_origen}','"C-999"')),'MIGRATION_FOX_PARENT_NOT_FOUND');
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''OC'',''OC-D'',%L)',t,a,run_c,
    jsonb_set(jsonb_set(oc,'{numero}','"OC-FOX-D"'),'{lineas}',(oc->'lineas')||jsonb_build_array(
      jsonb_build_object('id_origen','2','contrato_linea_id_origen','1','cantidad_original',10,'cantidad_entregada',0)))),
    'MIGRATION_FOX_DUPLICATE_LINE');

  -- Cronograma: sólo pendientes, también uno ya vencido.
  j:=public.importar_suministro_fox_580(t,a,run_c,'ENTREGA','E-1',jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1',
    'cantidad',120,'cantidad_entregada',0,'fecha_programada',hoy+10,'destino','Hospital regional'));
  j:=public.importar_suministro_fox_580(t,a,run_c,'ENTREGA','E-2',jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1',
    'cantidad',80,'cantidad_entregada',30,'fecha_programada',hoy-5,'destino','Hospital regional'));
  IF (SELECT cantidad FROM public.suministro_entregas_programadas WHERE id=(j->>'id')::uuid)<>50 THEN RAISE EXCEPTION 'VERIFY580_SCHEDULE'; END IF;
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''ENTREGA'',''E-3'',%L)',t,a,run_c,
    jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1','cantidad',100,'fecha_programada',hoy+20,'destino','Hospital')),
    'SUPPLY_SCHEDULE_EXCEEDS_OC');
  PERFORM pg_temp.reject580(format('SELECT public.importar_suministro_fox_580(%L,%L,%L,''ENTREGA'',''E-4'',%L)',t,a,run_c,
    jsonb_build_object('oc_id_origen','OC-9','oc_linea_id_origen','1','cantidad',10,'fecha_programada','2026-02-30','destino','Hospital')),
    'MIGRATION_FOX_INPUT_INVALID');

  -- Los saldos migrados no generan pedidos, despachos, cobranza, asientos ni eventos.
  IF (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t)<>outbox_antes
    OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t)<>asientos_antes
    OR EXISTS (SELECT 1 FROM public.suministro_pedidos WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.cuentas_por_cobrar WHERE tenant_id=t AND pedido_id IS NOT NULL
      AND created_at >= (SELECT started_at FROM public.migration_runs WHERE id=run_c))
  THEN RAISE EXCEPTION 'VERIFY580_SIDE_EFFECTS'; END IF;

  -- Stock inicial con lotes, vencido incluido.
  j:=public.importar_stock_inicial_tx(t,a,run_s,'stock:FOX-1:'||w||':'||hoy,jsonb_build_object('producto_id',pr,'almacen_id',w,
    'sucursal_id',s,'fecha_corte',hoy,'cantidad',70,'costo_unitario',4));
  j:=public.importar_stock_inicial_tx(t,a,run_s,'stock:FOX-L:L1:'||w||':'||hoy,jsonb_build_object('producto_id',lp,'almacen_id',w,
    'sucursal_id',s,'fecha_corte',hoy,'cantidad',5,'costo_unitario',8,'lote','l1','fecha_vencimiento',hoy+60));
  j:=public.importar_stock_inicial_tx(t,a,run_s,'stock:FOX-L:L0:'||w||':'||hoy,jsonb_build_object('producto_id',lp,'almacen_id',w,
    'sucursal_id',s,'fecha_corte',hoy,'cantidad',3,'costo_unitario',8,'lote','L0','fecha_vencimiento',hoy-10));
  j:=public.importar_stock_inicial_tx(t,a,run_s,'stock:FOX-L:L1:'||w||':'||hoy,jsonb_build_object('producto_id',lp,'almacen_id',w,
    'sucursal_id',s,'fecha_corte',hoy,'cantidad',5,'costo_unitario',8,'lote','l1','fecha_vencimiento',hoy+60));
  IF j->>'action'<>'IDEMPOTENT' THEN RAISE EXCEPTION 'VERIFY580_STOCK_REPLAY'; END IF;
  IF coalesce((SELECT sum(x.stock_actual) FROM public.inventario_lote_saldos x JOIN public.inventario_lotes l ON l.id=x.lote_id
      WHERE x.tenant_id=t AND x.producto_id=lp AND l.codigo='L1' AND l.fecha_vencimiento=hoy+60),0)<>5
    OR coalesce((SELECT sum(x.stock_actual) FROM public.inventario_lote_saldos x JOIN public.inventario_lotes l ON l.id=x.lote_id
      WHERE x.tenant_id=t AND x.producto_id=lp AND l.codigo='L0' AND l.fecha_vencimiento=hoy-10),0)<>3
    OR coalesce((SELECT sum(stock_actual) FROM public.producto_existencias WHERE tenant_id=t AND producto_id=lp),0)<>8
    OR coalesce((SELECT sum(stock_actual) FROM public.producto_existencias WHERE tenant_id=t AND producto_id=pr),0)<>70
  THEN RAISE EXCEPTION 'VERIFY580_STOCK_LOTS'; END IF;
  PERFORM pg_temp.reject580(format('SELECT public.importar_stock_inicial_tx(%L,%L,%L,''stock:x1'',%L)',t,a,run_s,
    jsonb_build_object('producto_id',lp,'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',1,'costo_unitario',8)),
    'MIGRATION_STOCK_LOT_REQUIRED');
  PERFORM pg_temp.reject580(format('SELECT public.importar_stock_inicial_tx(%L,%L,%L,''stock:x2'',%L)',t,a,run_s,
    jsonb_build_object('producto_id',pr,'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',1,'costo_unitario',4,'lote','X')),
    'MIGRATION_STOCK_LOT_NOT_CONTROLLED');
  PERFORM pg_temp.reject580(format('SELECT public.importar_stock_inicial_tx(%L,%L,%L,''stock:x3'',%L)',t,a,run_s,
    jsonb_build_object('producto_id',lp,'almacen_id',w,'sucursal_id',s,'fecha_corte',hoy,'cantidad',1,'costo_unitario',8,'lote','L9')),
    'MIGRATION_STOCK_EXPIRY_REQUIRED');

  -- Conciliación contra los totales de control del extracto.
  control:=jsonb_build_object('contratos',jsonb_build_object('registros',1,'lineas',1,'cantidad',400,'valor',4000),
    'oc',jsonb_build_object('registros',1,'lineas',1,'cantidad',200,'valor',2000),
    'entregas',jsonb_build_object('registros',2,'cantidad',170),
    'stock',jsonb_build_object('registros',3,'lotes',2,'cantidad',78,'valor',344));
  j:=public.conciliar_migracion_fox_580(t,a,control);
  IF j->>'cuadra'<>'true' THEN RAISE EXCEPTION 'VERIFY580_RECONCILE %', j; END IF;
  j:=public.conciliar_migracion_fox_580(t,a,jsonb_set(control,'{contratos,cantidad}','500'));
  IF j->>'cuadra'<>'false' OR (SELECT (x#>>'{diferencias,cantidad}')::numeric FROM jsonb_array_elements(j->'entidades') x
      WHERE x->>'entidad'='contratos')<>-100 THEN RAISE EXCEPTION 'VERIFY580_RECONCILE_DIFF %', j; END IF;
  PERFORM pg_temp.reject580(format('SELECT public.conciliar_migracion_fox_580(%L,%L,%L)',t,a,'{"nomina":{}}'),'MIGRATION_FOX_CONTROL_INVALID');

  PERFORM pg_temp.reject580(format('UPDATE public.migracion_correspondencias SET erp_id=gen_random_uuid() WHERE tenant_id=%L',t),
    'MIGRATION_FOX_CORRESPONDENCE_IMMUTABLE');
  -- Fixture: b queda sólo como VENDEDOR, sin permisos de migración.
  DELETE FROM public.user_roles WHERE usuario_sistema_id=b;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT b, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='VENDEDOR';
  BEGIN PERFORM public.importar_suministro_fox_580(t,b,NULL,'CONTRATO','C-600',contrato); RAISE EXCEPTION 'VERIFY580_PERMISSION';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.importar_suministro_fox_580(t,oa,NULL,'CONTRATO','C-700',contrato); RAISE EXCEPTION 'VERIFY580_FOREIGN_ACTOR';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM = 'VERIFY580_FOREIGN_ACTOR' THEN RAISE; END IF;
  END;
  BEGIN PERFORM public.conciliar_migracion_fox_580(t,oa,control); RAISE EXCEPTION 'VERIFY580_FOREIGN_RECONCILE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM public.migracion_correspondencias WHERE tenant_id=t;
  -- Contrato, su línea abierta, OC, su línea y dos entregas.
  IF n<>6 THEN RAISE EXCEPTION 'VERIFY580_CORRESPONDENCES %', n; END IF;
  RAISE NOTICE 'VERIFY580_OK: saldos abiertos FOX con correspondencias e idempotencia, errores por registro, lotes y vencimientos, conciliación y sin efectos';
END $verify$;
ROLLBACK;
