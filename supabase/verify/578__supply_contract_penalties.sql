\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject578(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY578_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY578_EXPECTED_REJECTION %', expected;
END $fn$;
DO $verify$
DECLARE
  t uuid; a uuid; b uuid; ot uuid; oa uuid; w uuid; pr uuid; cl uuid; c uuid; l uuid; o uuid; ol uuid; e1 uuid; e2 uuid;
  p uuid; pd uuid; hoy date; j jsonb; g1 uuid; g2 uuid; calc1 uuid; calc2 uuid; n integer; tab text; r1 uuid;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY578_LOCAL_ONLY'; END IF;
  FOREACH tab IN ARRAY ARRAY['penalidad_reglas','penalidad_excepciones','penalidad_calculos','penalidad_revisiones'] LOOP
    IF has_table_privilege('service_role','public.'||tab,'SELECT,INSERT,UPDATE,DELETE')
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY578_ACL %', tab; END IF;
  END LOOP;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY578',14,'PE','verify578-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY578OTHER',14,'PE','verify578other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  SELECT id INTO b FROM public.usuarios_sistema WHERE tenant_id=t AND id<>a AND coalesce(activo,false) AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  -- b aprueba como gerencia (fixture de rol).
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT b, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='GERENCIA'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.usuario_sistema_id=b AND ur.role_id=r.id);
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-578','nombre','Insumo con plazo','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,100,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id=pr;
  -- Contrato de 1000 unidades a 10 (monto 10 000); OC emitida hace 60 días.
  j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','578','asunto','Suministro con penalidades',
    'moneda','PEN','vigencia_desde',hoy-90,'vigencia_hasta',hoy+300,'responsable_id',a,'lineas',jsonb_build_array(
      jsonb_build_object('producto_id',pr,'cantidad',1000,'precio_unitario',10))),'578-contract');
  c:=(j->>'id')::uuid; SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','578-activate');
  j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC578','fecha_emision',hoy-60,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l,'cantidad',100))),'578-order'); o:=(j->>'id')::uuid;
  SELECT id INTO ol FROM public.suministro_orden_lineas WHERE orden_cliente_id=o;
  -- Entrega 1: 40 a los 30 días de la OC; entrega 2: 20 hace 10 días, sin entregar.
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',40,'fecha_programada',hoy-30,'destino','Hospital'),'578-schedule-1'); e1:=(j->>'id')::uuid;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',20,'fecha_programada',hoy-10,'destino','Hospital'),'578-schedule-2'); e2:=(j->>'id')::uuid;
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',40,'precio_unitario',10))); p:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,jsonb_build_object('motivo','Entrega uno',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e1))),'578-link');
  j:=public.evaluar_politica_pedido_441(p,t);
  PERFORM public.confirmar_pedido_tx(p,t,'IGNORADO','CONFIRMADO',false,false,NULL,NULL,j->>'pedido_fingerprint',a);
  UPDATE public.pedidos_venta SET estado='LISTO_DESPACHO',tracking_estado='LISTO_DESPACHO' WHERE id=p;
  PERFORM public.despachar_pedido_parcial_tx(p,t,'578-dispatch',jsonb_build_array(jsonb_build_object('detalle_id',pd,'cantidad',40,'almacen_id',w)),'Entrega',a,'{}'::jsonb);
  -- Fixture: el despacho ocurrió hace 21 días para poder registrar su recepción pasada.
  UPDATE public.pedido_despachos SET registrado_en = (hoy-21)::timestamptz + interval '12 hours' WHERE pedido_id=p;
  PERFORM public.operar_suministro_recepciones_575(t,a,c,'REGISTRAR_RECEPCION',jsonb_build_object('pedido_id',p,'fecha_recepcion',hoy-20,
    'receptor_nombre','Almacén del hospital','lineas',jsonb_build_array(jsonb_build_object('despacho_id',
      (SELECT id FROM public.pedido_despachos WHERE pedido_id=p),'cantidad_recibida',40,'cantidad_aceptada',40,'cantidad_rechazada',0))),'578-reception');

  -- Reglas.
  PERFORM pg_temp.reject578(format('SELECT public.operar_penalidades_578(%L,%L,%L,''GUARDAR_REGLA'',%L,''578-rule-bad'')',t,a,c,
    jsonb_build_object('nombre','Mora sin factor','metodo','MORA_OSCE','base_calculo','VALOR_ENTREGA','plazo_modo','OC_A_ENTREGA','motivo','Regla incompleta')),
    'PENALTY_RULE_INVALID');
  j:=public.operar_penalidades_578(t,a,c,'GUARDAR_REGLA',jsonb_build_object('nombre','Mora por entrega tardía','metodo','MORA_OSCE',
    'base_calculo','VALOR_ENTREGA','factor_f',0.40,'plazo_modo','OC_A_ENTREGA','tolerancia_dias',2,'calendario','CALENDARIO',
    'tope_porcentaje',10,'tope_base','CONTRATO','motivo','Cláusula de penalidad del contrato'),'578-rule-osce');
  g1:=(j->>'grupo_id')::uuid; r1:=(j->>'id')::uuid;
  j:=public.operar_penalidades_578(t,a,c,'GUARDAR_REGLA',jsonb_build_object('nombre','Porcentaje diario sobre lo no aceptado',
    'metodo','PORCENTAJE_DIARIO','base_calculo','VALOR_NO_ACEPTADO','tasa',0.5,'motivo','Penalidad pactada por saldo pendiente'),'578-rule-percent');
  g2:=(j->>'grupo_id')::uuid;

  PERFORM pg_temp.reject578(format('SELECT public.operar_penalidades_578(%L,%L,%L,''CALCULAR'',%L,''578-future'')',t,a,c,
    jsonb_build_object('fecha_corte',hoy+1)),'PENALTY_CUTOFF_IN_FUTURE');
  j:=public.operar_penalidades_578(t,a,c,'CALCULAR',jsonb_build_object('fecha_corte',hoy-1),'578-calc-1');
  -- OSCE: e1 atraso 8 días (límite hoy-28, aceptación hoy-20); e2 bajo % diario: 9 días al corte hoy-1.
  SELECT id INTO calc1 FROM public.penalidad_calculos WHERE regla_id=r1 AND entrega_id=e1;
  IF calc1 IS NULL OR (SELECT dias_atraso FROM public.penalidad_calculos WHERE id=calc1)<>8
    OR (SELECT monto_estimado FROM public.penalidad_calculos WHERE id=calc1)<>26.67
    OR (SELECT entradas->>'plazo_dias' FROM public.penalidad_calculos WHERE id=calc1)<>'30'
    OR (SELECT explicacion FROM public.penalidad_calculos WHERE id=calc1) NOT LIKE '%0.10 × 400.00 / (0.4000 × 30 días) = 3.3333; × 8 días = 26.67%'
    OR EXISTS (SELECT 1 FROM public.penalidad_calculos pc JOIN public.penalidad_reglas pr2 ON pr2.id=pc.regla_id WHERE pr2.grupo_id=g1 AND pc.entrega_id=e2 AND pc.fecha_corte=hoy-1 AND pc.dias_atraso=0)
  THEN RAISE EXCEPTION 'VERIFY578_OSCE_EXAMPLE %', (SELECT explicacion FROM public.penalidad_calculos WHERE id=calc1); END IF;
  IF (SELECT monto_estimado FROM public.penalidad_calculos pc JOIN public.penalidad_reglas pr2 ON pr2.id=pc.regla_id
      WHERE pr2.grupo_id=g2 AND pc.entrega_id=e2 AND pc.fecha_corte=hoy-1)<>9.00 THEN
    RAISE EXCEPTION 'VERIFY578_PERCENT_ONGOING'; END IF;
  j:=public.operar_penalidades_578(t,a,c,'CALCULAR',jsonb_build_object('fecha_corte',hoy-1),'578-calc-1');
  IF j->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY578_CALC_REPLAY'; END IF;
  j:=public.operar_penalidades_578(t,a,c,'CALCULAR',jsonb_build_object('fecha_corte',hoy-1),'578-calc-1-again');
  IF (j->>'calculos')::integer<>0 THEN RAISE EXCEPTION 'VERIFY578_SAME_CUTOFF_DUPLICATED'; END IF;

  -- Una ampliación de plazo (excepción) y una nueva versión no reescriben el histórico.
  PERFORM public.operar_penalidades_578(t,a,c,'REGISTRAR_EXCEPCION',jsonb_build_object('entrega_id',e1,'grupo_id',g1,'dias_excluidos',3,
    'motivo','Ampliación aprobada por el cliente','referencia','CARTA-12'),'578-exception');
  PERFORM public.operar_penalidades_578(t,a,c,'CALCULAR',jsonb_build_object('fecha_corte',hoy),'578-calc-2');
  SELECT id INTO calc2 FROM public.penalidad_calculos WHERE regla_id=r1 AND entrega_id=e1 AND fecha_corte=hoy;
  IF (SELECT dias_atraso FROM public.penalidad_calculos WHERE id=calc2)<>5 OR (SELECT monto_estimado FROM public.penalidad_calculos WHERE id=calc2)<>16.67
    OR (SELECT monto_estimado FROM public.penalidad_calculos WHERE id=calc1)<>26.67 THEN
    RAISE EXCEPTION 'VERIFY578_EXCEPTION_HISTORY'; END IF;
  PERFORM pg_temp.reject578(format('SELECT public.operar_penalidades_578(%L,%L,%L,''GUARDAR_REGLA'',%L,''578-rule-stale'')',t,a,c,
    jsonb_build_object('grupo_id',g1,'version',2,'nombre','Mora','metodo','MORA_OSCE','base_calculo','VALOR_ENTREGA','factor_f',0.25,
      'plazo_modo','OC_A_ENTREGA','motivo','Versión inexistente')),'PENALTY_VERSION_CONFLICT');
  j:=public.operar_penalidades_578(t,a,c,'GUARDAR_REGLA',jsonb_build_object('grupo_id',g1,'version',1,'nombre','Mora por entrega tardía',
    'metodo','MORA_OSCE','base_calculo','VALOR_ENTREGA','factor_f',0.25,'plazo_modo','OC_A_ENTREGA','tolerancia_dias',2,
    'calendario','CALENDARIO','tope_porcentaje',10,'tope_base','CONTRATO','motivo','Adenda: plazo mayor a 60 días'),'578-rule-v2');
  -- La versión 1 conserva sus cuatro cálculos (e1 y e2 en dos cortes).
  IF (j->>'version')::integer<>2 OR (SELECT estado FROM public.penalidad_reglas WHERE id=r1)<>'REEMPLAZADA'
    OR (SELECT count(*) FROM public.penalidad_calculos WHERE regla_id=r1)<>4 THEN RAISE EXCEPTION 'VERIFY578_RULE_VERSION'; END IF;
  PERFORM pg_temp.reject578(format('UPDATE public.penalidad_reglas SET factor_f=0.30 WHERE id=%L',r1),'PENALTY_RULE_VERSION_IMMUTABLE');
  PERFORM pg_temp.reject578(format('UPDATE public.penalidad_calculos SET monto_estimado=0 WHERE id=%L',calc1),'PENALTY_CALCULATION_IMMUTABLE');
  PERFORM pg_temp.reject578(format('DELETE FROM public.penalidad_calculos WHERE id=%L',calc1),'PENALTY_CALCULATION_IMMUTABLE');

  -- Revisión: quien calcula no aprueba; el monto aprobado no supera lo estimado.
  PERFORM public.operar_penalidades_578(t,a,c,'REVISAR_CALCULO',jsonb_build_object('calculo_id',calc2,'version',1,'accion','REVISAR',
    'comentario','Se revisa contra actas de conformidad'),'578-review');
  PERFORM pg_temp.reject578(format('SELECT public.operar_penalidades_578(%L,%L,%L,''REVISAR_CALCULO'',%L,''578-self-approve'')',t,a,c,
    jsonb_build_object('calculo_id',calc2,'version',2,'accion','APROBAR','monto_aprobado',16.67,'comentario','Aprobación propia')),
    'PENALTY_SEGREGATION_REQUIRED');
  PERFORM pg_temp.reject578(format('SELECT public.operar_penalidades_578(%L,%L,%L,''REVISAR_CALCULO'',%L,''578-over-approve'')',t,b,c,
    jsonb_build_object('calculo_id',calc2,'version',2,'accion','APROBAR','monto_aprobado',20,'comentario','Monto mayor al estimado')),
    'PENALTY_APPROVED_AMOUNT_INVALID');
  PERFORM public.operar_penalidades_578(t,b,c,'REVISAR_CALCULO',jsonb_build_object('calculo_id',calc2,'version',2,'accion','APROBAR',
    'monto_aprobado',16.67,'comentario','Conforme con la cláusula'),'578-approve');
  IF (SELECT estado FROM public.penalidad_calculos WHERE id=calc2)<>'APROBADO' OR (SELECT monto_aprobado FROM public.penalidad_calculos WHERE id=calc2)<>16.67
    OR (SELECT count(*) FROM public.penalidad_revisiones WHERE calculo_id=calc2)<>2 THEN RAISE EXCEPTION 'VERIFY578_APPROVAL'; END IF;
  PERFORM pg_temp.reject578(format('SELECT public.operar_penalidades_578(%L,%L,%L,''REVISAR_CALCULO'',%L,''578-after-approve'')',t,b,c,
    jsonb_build_object('calculo_id',calc2,'version',3,'accion','CONTROVERSIA','comentario','Disputa posterior')),'PENALTY_REVIEW_INVALID');
  PERFORM public.operar_penalidades_578(t,b,c,'REVISAR_CALCULO',jsonb_build_object('calculo_id',calc1,'version',1,'accion','CONTROVERSIA',
    'comentario','El cliente objeta el primer corte'),'578-dispute');
  -- La aprobación no crea efectos contables ni de cobranza.
  IF EXISTS (SELECT 1 FROM public.outbox_events WHERE tenant_id=t AND aggregate_type ILIKE '%penal%')
    OR EXISTS (SELECT 1 FROM public.cxc_pagos WHERE tenant_id=t AND tipo ILIKE '%PENAL%') THEN
    RAISE EXCEPTION 'VERIFY578_APPROVAL_HAS_FINANCIAL_EFFECT'; END IF;

  j:=public.consultar_penalidades_578(t,a,c);
  IF jsonb_array_length(j->'reglas')<>3 OR (j#>>'{resumen,0,aprobado}')::numeric<>16.67 THEN RAISE EXCEPTION 'VERIFY578_QUERY %', j->'resumen'; END IF;

  SELECT count(*) INTO n FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos pm ON pm.id=rp.permiso_id
  WHERE r.tenant_id=t AND upper(r.nombre)='VENDEDOR' AND pm.codigo LIKE 'ventas.penalidades.%';
  IF n<>0 THEN RAISE EXCEPTION 'VERIFY578_SELLER_PENALTIES'; END IF;
  BEGIN PERFORM public.consultar_penalidades_578(ot,oa,c); RAISE EXCEPTION 'VERIFY578_FOREIGN_READ';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN PERFORM public.operar_penalidades_578(t,oa,c,'CALCULAR','{}','578-foreign-calc'); RAISE EXCEPTION 'VERIFY578_FOREIGN_WRITE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'VERIFY578_OK: ejemplo de mora OSCE, porcentaje diario en curso, excepción y versión sin reescribir histórico, inmutabilidad, segregación y aislamiento';
END $verify$;
ROLLBACK;
