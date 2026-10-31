\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject579(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY579_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY579_EXPECTED_REJECTION %', expected;
END $fn$;
DO $verify$
DECLARE
  t uuid; a uuid; b uuid; ot uuid; oa uuid; w uuid; pr uuid; lp uuid; cl uuid; c uuid; l1 uuid; l2 uuid; o uuid; ol1 uuid; ol2 uuid;
  e1 uuid; e2 uuid; e3 uuid; p uuid; pd uuid; hoy date; j jsonb; r jsonb; vivo jsonb; corte jsonb; k uuid; rol uuid; n integer;
  tab text; cred uuid; dig text := encode(extensions.digest('erpbi_0a1b2c3d_verify579secret', 'sha256'), 'hex');
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY579_LOCAL_ONLY'; END IF;
  FOREACH tab IN ARRAY ARRAY['tablero_cortes','bi_credenciales','bi_accesos'] LOOP
    IF has_table_privilege('service_role','public.'||tab,'SELECT,INSERT,UPDATE,DELETE')
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY579_ACL %', tab; END IF;
  END LOOP;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY579',14,'PE','verify579-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY579OTHER',14,'PE','verify579other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  SELECT id INTO b FROM public.usuarios_sistema WHERE tenant_id=t AND id<>a AND coalesce(activo,false) AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-579','nombre','Insumo de tablero','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,70,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-579-L','nombre','Medicamento de tablero','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',20,'precio_compra',8,'afectacion_igv','10'),w,0,0,'[]'::jsonb); lp:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id IN (pr,lp);
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',lp,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'579-lot-policy');
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w,'ENTRADA',5,'VERIFY579_IN',gen_random_uuid(),'Lote corto',NULL,'LV',hoy+15);
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w,'ENTRADA',3,'VERIFY579_IN',gen_random_uuid(),'Lote viejo',NULL,'LX',hoy+3);
  -- Fixture: el lote LX venció hace dos días.
  UPDATE public.inventario_lotes SET fecha_vencimiento=hoy-2 WHERE tenant_id=t AND producto_id=lp AND codigo='LX';

  -- Contrato con dos líneas; OC de 60 + 20; tres entregas: a tiempo, atrasada y en plazo.
  j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','579','asunto','Suministro con tablero',
    'moneda','PEN','vigencia_desde',hoy-90,'vigencia_hasta',hoy+300,'responsable_id',a,'lineas',jsonb_build_array(
      jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',10),jsonb_build_object('producto_id',lp,'cantidad',20,'precio_unitario',20))),
    '579-contract');
  c:=(j->>'id')::uuid;
  SELECT id INTO l1 FROM public.suministro_contrato_lineas WHERE contrato_id=c AND producto_id=pr;
  SELECT id INTO l2 FROM public.suministro_contrato_lineas WHERE contrato_id=c AND producto_id=lp;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','579-activate');
  j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC579','fecha_emision',hoy-60,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l1,'cantidad',60),jsonb_build_object('contrato_linea_id',l2,'cantidad',20))),'579-order'); o:=(j->>'id')::uuid;
  SELECT id INTO ol1 FROM public.suministro_orden_lineas WHERE orden_cliente_id=o AND contrato_linea_id=l1;
  SELECT id INTO ol2 FROM public.suministro_orden_lineas WHERE orden_cliente_id=o AND contrato_linea_id=l2;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol1,'cantidad',40,'fecha_programada',hoy-30,'destino','Hospital'),'579-schedule-1'); e1:=(j->>'id')::uuid;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol1,'cantidad',20,'fecha_programada',hoy-10,'destino','Hospital'),'579-schedule-2'); e2:=(j->>'id')::uuid;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol2,'cantidad',10,'fecha_programada',hoy+10,'destino','Hospital'),'579-schedule-3'); e3:=(j->>'id')::uuid;
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',40,'precio_unitario',10))); p:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,jsonb_build_object('motivo','Entrega uno',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e1))),'579-link');
  j:=public.evaluar_politica_pedido_441(p,t);
  PERFORM public.confirmar_pedido_tx(p,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
  UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p;
  PERFORM public.despachar_pedido_parcial_tx(p,t,'579-dispatch',jsonb_build_array(jsonb_build_object('detalle_id',pd,'cantidad',40,'almacen_id',w)),'Entrega',a,'{}'::jsonb);
  -- Fixture: despacho y aceptación anteriores a la fecha programada de e1.
  UPDATE public.pedido_despachos SET registrado_en=(hoy-32)::timestamptz + interval '12 hours' WHERE pedido_id=p;
  PERFORM public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',jsonb_build_object('pedido_id',p,'fecha_recepcion',hoy-31,
    'receptor_nombre','Almacén del hospital','lineas',jsonb_build_array(jsonb_build_object('despacho_id',
      (SELECT id FROM public.pedido_despachos WHERE pedido_id=p),'cantidad_recibida',40,'cantidad_aceptada',40,'cantidad_rechazada',0))),'579-reception');
  INSERT INTO public.cuentas_por_cobrar (tenant_id, cliente_id, pedido_id, numero_documento, serie, numero, tipo_documento,
    fecha_emision, fecha_vencimiento, moneda, monto_total, total, monto_original, monto_pendiente, saldo_pendiente, saldo,
    dias_mora, estado, activo, event_source, idempotency_key, metadata)
  VALUES (t, cl, p, 'F579-1', 'F579', '1', '01', hoy-31, hoy-5, 'PEN', 472, 472, 472, 472, 472, 472, 0, 'PENDIENTE', true,
    'verify579', 'verify579-cxc', '{"origen":"migracion_apertura"}');
  PERFORM public.operar_penalidades_578(t,a,c,'GUARDAR_REGLA',jsonb_build_object('nombre','Uno por ciento diario','metodo','PORCENTAJE_DIARIO',
    'base_calculo','VALOR_ENTREGA','tasa',1,'motivo','Cláusula de penalidad'),'579-rule');
  PERFORM public.operar_penalidades_578(t,a,c,'CALCULAR',jsonb_build_object('fecha_corte',hoy),'579-calc');

  -- Tablero en vivo: cada indicador desde sus filas.
  vivo:=public.consultar_tablero_suministro_579(t,a,NULL,'{}');
  r:=vivo->'resumen';
  IF (r#>>'{cumplimiento,porcentaje}')::numeric<>50 OR (r#>>'{entregas,exigibles}')::integer<>2
    OR (r#>>'{entregas,a_tiempo_completas}')::integer<>1 OR (r#>>'{entregas,atrasadas}')::integer<>1
    OR (r#>>'{entregas,en_plazo}')::integer<>1 OR (r#>>'{entregas,porcentaje}')::numeric<>50
    OR (r#>>'{entregas,dias_atraso_promedio}')::numeric<>10
  THEN RAISE EXCEPTION 'VERIFY579_DELIVERY_KPI %', r; END IF;
  IF (r#>>'{stock,productos}')::integer<>2 OR (r#>>'{stock,sin_cobertura}')::integer<>1
    OR (r#>>'{vencimientos,vencidos}')::integer<>1 OR (r#>>'{vencimientos,por_vencer}')::integer<>1
    OR (r#>>'{facturacion,0,por_facturar}')::numeric<>400 OR (r#>>'{cobranza,0,saldo}')::numeric<>472
    OR (r#>>'{cobranza,0,vencido}')::numeric<>472 OR (r#>>'{penalidades,0,pendiente}')::numeric<>20
  THEN RAISE EXCEPTION 'VERIFY579_MONEY_STOCK_KPI %', r; END IF;
  -- Cada fila llega a su documento origen.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(vivo#>'{datasets,entregas}') x WHERE x->>'entrega_id'=e2::text
      AND x->>'cumplimiento'='ATRASADA' AND (x->>'dias_atraso')::integer=10 AND x->>'contrato_id'=c::text)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(vivo#>'{datasets,entregas}') x WHERE x->>'entrega_id'=e1::text
      AND x->>'cumplimiento'='A_TIEMPO_COMPLETA' AND x->>'recepciones'='1' AND x->>'pedidos' IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(vivo#>'{datasets,cobranza}') x WHERE x->>'documento'='F579-1'
      AND x->>'situacion'='VENCIDO' AND (x->>'dias_vencido')::integer=5 AND x->>'pedido_id'=p::text)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(vivo#>'{datasets,stock}') x WHERE x->>'producto_id'=lp::text
      AND x->>'estado'='SIN_COBERTURA' AND (x->>'stock_vencido')::numeric=3 AND (x->>'cobertura_pct')::numeric=50)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(vivo#>'{datasets,penalidades}') x WHERE x->>'entrega_id'=e2::text
      AND (x->>'monto_estimado')::numeric=20 AND x->>'calculo_id' IS NOT NULL)
  THEN RAISE EXCEPTION 'VERIFY579_DRILLDOWN'; END IF;

  -- Filtros por fecha, contrato y validación.
  j:=public.consultar_tablero_suministro_579(t,a,NULL,jsonb_build_object('desde',hoy));
  IF jsonb_array_length(j#>'{datasets,entregas}')<>1 OR (j#>>'{resumen,entregas,exigibles}')::integer<>0
    OR jsonb_array_length(j#>'{datasets,stock}')<>2 THEN RAISE EXCEPTION 'VERIFY579_DATE_FILTER'; END IF;
  j:=public.consultar_tablero_suministro_579(t,a,NULL,jsonb_build_object('contrato_id',gen_random_uuid()));
  IF EXISTS (SELECT 1 FROM jsonb_each(j->'datasets') d WHERE jsonb_array_length(d.value)>0) THEN
    RAISE EXCEPTION 'VERIFY579_CONTRACT_FILTER'; END IF;
  PERFORM pg_temp.reject579(format('SELECT public.consultar_tablero_suministro_579(%L,%L,NULL,%L)',t,a,'{"estado":"X"}'),'DASHBOARD_FILTER_INVALID');
  PERFORM pg_temp.reject579(format('SELECT public.consultar_tablero_suministro_579(%L,%L,NULL,%L)',t,a,'{"desde":"2026-02-30"}'),'DASHBOARD_FILTER_INVALID');

  -- Un corte registrado concilia con el tablero en vivo del mismo momento y no cambia después.
  corte:=public.registrar_corte_tablero_579(t,a,'579-export');
  k:=(corte->>'id')::uuid;
  IF corte->>'hash'<>vivo#>>'{corte,hash}' THEN RAISE EXCEPTION 'VERIFY579_CUTOFF_HASH'; END IF;
  j:=public.registrar_corte_tablero_579(t,a,'579-export');
  IF j->>'idempotent'<>'true' OR j->>'id'<>k::text THEN RAISE EXCEPTION 'VERIFY579_CUTOFF_REPLAY'; END IF;
  j:=public.consultar_tablero_suministro_579(t,a,k,'{}');
  IF j->'resumen'<>vivo->'resumen' OR j->'datasets'<>vivo->'datasets' OR j#>>'{corte,origen}'<>'EXPORTACION' THEN
    RAISE EXCEPTION 'VERIFY579_CUTOFF_RECONCILES'; END IF;
  PERFORM public.operar_suministro_570(t,a,'REPROGRAMAR',e2,jsonb_build_object('version',1,'fecha_programada',hoy+5,'destino','Hospital',
    'motivo','El cliente amplía el plazo'),'579-reschedule');
  IF (public.consultar_tablero_suministro_579(t,a,NULL,'{}')#>>'{resumen,entregas,atrasadas}')::integer<>0
    OR public.consultar_tablero_suministro_579(t,a,k,'{}')->'resumen'<>vivo->'resumen' THEN
    RAISE EXCEPTION 'VERIFY579_CUTOFF_FROZEN'; END IF;
  PERFORM pg_temp.reject579(format('UPDATE public.tablero_cortes SET hash=repeat(''0'',64) WHERE id=%L',k),'DASHBOARD_RECORD_IMMUTABLE');
  PERFORM pg_temp.reject579(format('DELETE FROM public.tablero_cortes WHERE id=%L',k),'DASHBOARD_RECORD_IMMUTABLE');
  BEGIN PERFORM public.consultar_tablero_suministro_579(ot,oa,k,'{}'); RAISE EXCEPTION 'VERIFY579_FOREIGN_CUTOFF';
  EXCEPTION WHEN no_data_found THEN NULL; END;

  -- Corte automático: uno por empresa y día.
  PERFORM public.registrar_cortes_automaticos_579();
  PERFORM public.registrar_cortes_automaticos_579();
  IF (SELECT count(*) FROM public.tablero_cortes WHERE tenant_id=t AND origen='AUTOMATICO' AND fecha_corte=hoy)<>1 THEN
    RAISE EXCEPTION 'VERIFY579_AUTOMATIC_CUTOFF'; END IF;

  -- Permisos: cada conjunto exige el permiso de su módulo origen.
  INSERT INTO public.roles (tenant_id, nombre, descripcion) VALUES (t, 'TABLERO579', 'Sólo tablero y cobranza') RETURNING id INTO rol;
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT rol, id, true FROM public.permisos WHERE tenant_id=t AND codigo IN ('reports.suministro.read','finanzas.cxc.read');
  DELETE FROM public.user_roles WHERE usuario_sistema_id=b;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id) VALUES (b, rol, t);
  j:=public.consultar_tablero_suministro_579(t,b,k,'{}');
  IF (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(j->'datasets') x)<>ARRAY['cobranza']
    OR jsonb_array_length(j->'ocultos')<>5 OR j->'resumen' ? 'entregas' OR NOT j->'resumen' ? 'cobranza' THEN
    RAISE EXCEPTION 'VERIFY579_DATASET_PERMISSIONS %', j->'ocultos'; END IF;
  BEGIN PERFORM public.registrar_corte_tablero_579(t,b,'579-export-b'); RAISE EXCEPTION 'VERIFY579_EXPORT_PERMISSION';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos pm ON pm.id=rp.permiso_id
  WHERE r.tenant_id=t AND upper(r.nombre) IN ('VENDEDOR','GERENCIA') AND pm.codigo='integraciones.bi.gestionar';
  IF n<>0 THEN RAISE EXCEPTION 'VERIFY579_BI_ROLE_SCOPE'; END IF;

  -- Credencial BI: hash del token, alcance, vencimiento y reintento.
  PERFORM pg_temp.reject579(format('SELECT public.operar_credenciales_bi_579(%L,%L,''CREAR'',%L,''579-bi-far'')',t,a,
    jsonb_build_object('nombre','Power BI','datasets',jsonb_build_array('entregas'),'expira_en',hoy+400,'token_digest',dig,'prefijo','0a1b2c3d')),
    'BI_EXPIRY_INVALID');
  PERFORM pg_temp.reject579(format('SELECT public.operar_credenciales_bi_579(%L,%L,''CREAR'',%L,''579-bi-unknown'')',t,a,
    jsonb_build_object('nombre','Power BI','datasets',jsonb_build_array('nomina'),'expira_en',hoy+30,'token_digest',dig,'prefijo','0a1b2c3d')),
    'BI_INPUT_INVALID');
  j:=public.operar_credenciales_bi_579(t,a,'CREAR',jsonb_build_object('nombre','Power BI gerencia','datasets',jsonb_build_array('entregas','cobranza'),
    'expira_en',hoy+30,'token_digest',dig,'prefijo','0a1b2c3d'),'579-bi-create');
  cred:=(j->>'id')::uuid;
  j:=public.operar_credenciales_bi_579(t,a,'CREAR',jsonb_build_object('nombre','Power BI gerencia','datasets',jsonb_build_array('entregas','cobranza'),
    'expira_en',hoy+30,'token_digest',repeat('f',64),'prefijo','ffffffff'),'579-bi-create');
  IF j->>'idempotent'<>'true' OR j->>'id'<>cred::text OR (SELECT count(*) FROM public.bi_credenciales WHERE tenant_id=t)<>1 THEN
    RAISE EXCEPTION 'VERIFY579_BI_REPLAY'; END IF;
  BEGIN PERFORM public.operar_credenciales_bi_579(t,b,'CREAR',jsonb_build_object('nombre','Ajena','datasets',jsonb_build_array('cobranza'),
      'expira_en',hoy+30,'token_digest',repeat('e',64),'prefijo','eeeeeeee'),'579-bi-b'); RAISE EXCEPTION 'VERIFY579_BI_MANAGE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Lectura BI: mismas filas que el corte, más su identificación.
  j:=public.leer_dataset_bi_579(dig,'entregas','ultimo','{}','{"ip":"127.0.0.1","agente":"Microsoft.Data.Mashup"}');
  SELECT * INTO corte FROM (SELECT to_jsonb(x) FROM public.tablero_cortes x WHERE tenant_id=t ORDER BY generado_en DESC, id LIMIT 1) s;
  IF j->>'resultado'<>'OK' OR j#>>'{corte,id}'<>corte->>'id' OR (j->>'total')::integer<>3
    OR (SELECT jsonb_agg(x - 'corte_id' - 'fecha_corte') FROM jsonb_array_elements(j->'filas') x)<>corte#>'{datos,entregas}'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(j->'filas') x WHERE x->>'corte_id'<>corte->>'id')
  THEN RAISE EXCEPTION 'VERIFY579_BI_RECONCILES'; END IF;
  j:=public.leer_dataset_bi_579(dig,'cobranza',k::text,jsonb_build_object('contrato_id',c),'{}');
  IF j->>'resultado'<>'OK' OR j#>>'{filas,0,documento}'<>'F579-1' OR j#>>'{corte,hash}'<>vivo#>>'{corte,hash}' THEN
    RAISE EXCEPTION 'VERIFY579_BI_CUTOFF'; END IF;
  IF public.leer_dataset_bi_579(dig,'stock','ultimo','{}','{}')->>'resultado'<>'DATASET_NO_PERMITIDO'
    OR public.leer_dataset_bi_579(dig,'entregas',public.registrar_corte_tablero_579(ot,oa,'579-foreign-cutoff')->>'id','{}','{}')->>'resultado'
      <>'CORTE_NO_ENCONTRADO'
    OR public.leer_dataset_bi_579(dig,'entregas',gen_random_uuid()::text,'{}','{}')->>'resultado'<>'CORTE_NO_ENCONTRADO'
    OR public.leer_dataset_bi_579(repeat('0',64),'entregas','ultimo','{}','{}')->>'resultado'<>'CREDENCIAL_INVALIDA'
  THEN RAISE EXCEPTION 'VERIFY579_BI_REJECTIONS'; END IF;
  PERFORM public.operar_credenciales_bi_579(t,a,'REVOCAR',jsonb_build_object('credencial_id',cred,'motivo','Rotación trimestral'),'579-bi-revoke');
  IF public.leer_dataset_bi_579(dig,'entregas','ultimo','{}','{}')->>'resultado'<>'CREDENCIAL_INACTIVA' THEN
    RAISE EXCEPTION 'VERIFY579_BI_REVOKED'; END IF;
  PERFORM pg_temp.reject579(format('UPDATE public.bi_credenciales SET datasets=ARRAY[''stock''] WHERE id=%L',cred),'DASHBOARD_RECORD_IMMUTABLE');
  PERFORM pg_temp.reject579(format('UPDATE public.bi_credenciales SET revocado_en=NULL,revocado_por=NULL,motivo_revocacion=NULL WHERE id=%L',cred),
    'DASHBOARD_RECORD_IMMUTABLE');
  j:=public.consultar_credenciales_bi_579(t,a);
  IF j#>>'{credenciales,0,estado}'<>'REVOCADA' OR j#>>'{credenciales,0,ultimo_uso_en}' IS NULL
    OR (SELECT count(*) FROM jsonb_array_elements(j->'accesos'))<>6 OR j::text LIKE '%'||dig||'%'
    OR (SELECT count(*) FROM public.bi_accesos WHERE credencial_id=cred AND resultado='OK')<>2
  THEN RAISE EXCEPTION 'VERIFY579_BI_TRACE %', j->'accesos'; END IF;
  RAISE NOTICE 'VERIFY579_OK: indicadores con origen, filtros, corte conciliado e inmutable, permisos por conjunto y lectura BI trazable';
END $verify$;
ROLLBACK;
