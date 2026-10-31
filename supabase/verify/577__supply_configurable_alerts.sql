\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject577(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY577_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY577_EXPECTED_REJECTION %', expected;
END $fn$;
CREATE FUNCTION pg_temp.regla577(t uuid, a uuid, tipo text, dias integer, dest uuid[], esc uuid[], dias_esc integer,
  responsable boolean, correo boolean, version integer, key text) RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT public.configurar_regla_alerta_577(t, a, jsonb_build_object('tipo', tipo, 'activa', true, 'dias_anticipacion', dias,
    'dias_escalamiento', dias_esc, 'destinatarios', to_jsonb(dest), 'escalar_a', to_jsonb(esc),
    'incluir_responsable', responsable, 'enviar_correo', correo, 'version', version), key)
$fn$;
DO $verify$
DECLARE
  t uuid; a uuid; b uuid; ot uuid; oa uuid; w uuid; pr uuid; lp uuid; cl uuid; c uuid; l uuid; l2 uuid; o uuid; ol uuid; ol2 uuid;
  e1 uuid; e2 uuid; p uuid; pd uuid; hoy date; j jsonb; tab text; n integer; al uuid; correos integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY577_LOCAL_ONLY'; END IF;
  FOREACH tab IN ARRAY ARRAY['alertas_reglas','alertas_eventos','alertas_destinatarios','alertas_ejecuciones'] LOOP
    IF has_table_privilege('service_role','public.'||tab,'SELECT,INSERT,UPDATE,DELETE')
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||tab)::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY577_ACL %', tab; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.evaluar_alertas_suministro_577(uuid,date)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.reconocer_alerta_577(uuid,uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'VERIFY577_FUNCTION_ACL'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY577',14,'PE','verify577-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY577OTHER',14,'PE','verify577other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  SELECT id INTO b FROM public.usuarios_sistema WHERE tenant_id=t AND id<>a AND coalesce(activo,false) AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  IF b IS NULL THEN RAISE EXCEPTION 'VERIFY577_FIXTURE_SECOND_USER'; END IF;
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-577','nombre','Insumo programado','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,50,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-577-L','nombre','Medicamento con lote','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb); lp:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id IN (pr,lp);

  -- Reglas: validación, destinatarios del tenant, escalamiento completo y replay.
  PERFORM pg_temp.reject577(format('SELECT pg_temp.regla577(%L,%L,''ENTREGA_PROXIMA'',7,%L,''{}'',NULL,false,false,0,''577-rule-foreign'')',t,a,ARRAY[oa]),
    'ALERTS_RECIPIENT_INVALID');
  PERFORM pg_temp.reject577(format('SELECT pg_temp.regla577(%L,%L,''ENTREGA_ATRASADA'',0,%L,''{}'',2,false,false,0,''577-rule-escalation'')',t,a,ARRAY[b]),
    'ALERTS_ESCALATION_INCOMPLETE');
  PERFORM pg_temp.reject577(format('SELECT pg_temp.regla577(%L,%L,''ENTREGA_ATRASADA'',0,''{}'',''{}'',NULL,false,false,0,''577-rule-nobody'')',t,a),
    'ALERTS_RECIPIENT_REQUIRED');
  j:=pg_temp.regla577(t,a,'ENTREGA_PROXIMA',7,ARRAY[b],'{}',NULL,true,true,0,'577-rule-next');
  j:=pg_temp.regla577(t,a,'ENTREGA_PROXIMA',7,ARRAY[b],'{}',NULL,true,true,0,'577-rule-next');
  IF j->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY577_RULE_REPLAY'; END IF;
  PERFORM pg_temp.reject577(format('SELECT pg_temp.regla577(%L,%L,''ENTREGA_PROXIMA'',9,%L,''{}'',NULL,true,true,0,''577-rule-next'')',t,a,ARRAY[b]),
    'ALERTS_IDEMPOTENCY_CONFLICT');
  PERFORM pg_temp.reject577(format('SELECT pg_temp.regla577(%L,%L,''ENTREGA_PROXIMA'',9,%L,''{}'',NULL,true,true,0,''577-rule-stale'')',t,a,ARRAY[b]),
    'ALERTS_VERSION_CONFLICT');
  PERFORM pg_temp.regla577(t,a,'ENTREGA_ATRASADA',0,ARRAY[b],ARRAY[a],2,false,false,0,'577-rule-late');
  PERFORM pg_temp.regla577(t,a,'LOTE_POR_VENCER',30,ARRAY[a],'{}',NULL,false,false,0,'577-rule-lot');
  PERFORM pg_temp.regla577(t,a,'COBRANZA_VENCIDA',0,ARRAY[a],'{}',NULL,false,false,0,'577-rule-cxc');

  -- Contrato con dos entregas: hoy+5 y hoy+20.
  j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','577','asunto','Suministro con alertas',
    'moneda','PEN','vigencia_desde',hoy-5,'vigencia_hasta',hoy+400,'responsable_id',a,'lineas',jsonb_build_array(
      jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',10))),'577-contract');
  c:=(j->>'id')::uuid; SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
  PERFORM public.operar_suministro_570(t,a,'ACTIVAR',c,'{"version":1}','577-activate');
  j:=public.operar_suministro_570(t,a,'CREAR_OC',c,jsonb_build_object('numero','OC577','fecha_emision',hoy-5,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l,'cantidad',100))),'577-order'); o:=(j->>'id')::uuid;
  SELECT id INTO ol FROM public.suministro_orden_lineas WHERE orden_cliente_id=o;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',10,'fecha_programada',hoy+5,'destino','Hospital norte'),'577-schedule-1'); e1:=(j->>'id')::uuid;
  j:=public.operar_suministro_570(t,a,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',ol,'cantidad',10,'fecha_programada',hoy+20,'destino','Hospital sur'),'577-schedule-2'); e2:=(j->>'id')::uuid;

  -- Lote que vence en 15 días.
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',lp,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'577-lot-policy');
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w,'ENTRADA',5,'VERIFY577_IN',gen_random_uuid(),'Lote corto',NULL,'LV',hoy+15);

  -- Cobranza vencida de un pedido vinculado a la segunda entrega.
  j:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',a,'cliente_id',cl,'moneda','PEN'),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',10,'precio_unitario',10))); p:=(j->>'pedido_id')::uuid;
  SELECT id INTO pd FROM public.pedidos_venta_detalle WHERE pedido_id=p;
  j:=public.consultar_suministro_pedidos_572(t,a,c,'CANDIDATO',p);
  PERFORM public.operar_suministro_pedidos_572(t,a,c,'VINCULAR_PEDIDO',p,jsonb_build_object('motivo','Pedido de la segunda entrega',
    'fingerprint',j->>'fingerprint','lineas',jsonb_build_array(jsonb_build_object('pedido_detalle_id',pd,'entrega_id',e2))),'577-link');
  -- CxC de apertura (sin documento) para no depender de la emisión fiscal.
  INSERT INTO public.cuentas_por_cobrar (tenant_id, cliente_id, pedido_id, numero_documento, serie, numero, tipo_documento,
    fecha_emision, fecha_vencimiento, moneda, monto_total, total, monto_original, monto_pendiente, saldo_pendiente, saldo,
    dias_mora, estado, activo, event_source, idempotency_key, metadata)
  VALUES (t, cl, p, 'F577-1', 'F577', '1', '01', hoy-40, hoy-10, 'PEN', 118, 118, 118, 118, 118, 118, 0, 'PENDIENTE', true,
    'verify577', 'verify577-cxc', '{"origen":"migracion_apertura"}');

  -- Primera evaluación: entrega próxima (e1), lote por vencer y cobranza vencida.
  j:=public.evaluar_alertas_suministro_577(t,hoy);
  IF (j->>'creadas')::integer<>3 OR (SELECT count(*) FROM public.alertas_eventos WHERE tenant_id=t AND estado='ABIERTA')<>3
    OR NOT EXISTS (SELECT 1 FROM public.alertas_eventos WHERE tenant_id=t AND tipo='ENTREGA_PROXIMA' AND objeto_id=e1)
    OR EXISTS (SELECT 1 FROM public.alertas_eventos WHERE tenant_id=t AND objeto_id=e2)
  THEN RAISE EXCEPTION 'VERIFY577_FIRST_EVALUATION %', j; END IF;
  SELECT id INTO al FROM public.alertas_eventos WHERE tenant_id=t AND tipo='ENTREGA_PROXIMA' AND objeto_id=e1;
  -- Destinatario configurado y responsable del contrato, cada uno con su aviso.
  IF (SELECT count(*) FROM public.alertas_destinatarios WHERE alerta_id=al)<>2
    OR (SELECT count(*) FROM public.notificaciones n JOIN public.alertas_destinatarios d ON d.notificacion_id=n.id
        WHERE d.alerta_id=al AND n.usuario_id=d.usuario_id AND NOT n.leida)<>2
  THEN RAISE EXCEPTION 'VERIFY577_RECIPIENTS'; END IF;
  SELECT count(*) INTO correos FROM public.alertas_destinatarios d JOIN public.usuarios_sistema u ON u.id=d.usuario_id
  WHERE d.alerta_id=al AND nullif(btrim(coalesce(u.email,'')),'') IS NOT NULL;
  IF (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='email.send' AND aggregate_id=al::text)<>correos THEN
    RAISE EXCEPTION 'VERIFY577_EMAIL_QUEUE'; END IF;

  -- Reintentar la evaluación no duplica alertas, avisos ni correos.
  j:=public.evaluar_alertas_suministro_577(t,hoy);
  IF (j->>'creadas')::integer<>0 OR (j->>'notificaciones')::integer<>0
    OR (SELECT count(*) FROM public.alertas_eventos WHERE tenant_id=t)<>3
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='email.send' AND aggregate_id=al::text)<>correos
  THEN RAISE EXCEPTION 'VERIFY577_RETRY_DUPLICATED %', j; END IF;

  -- Reprogramación autorizada: resuelve la alerta anterior, abre la nueva y conserva ambas.
  PERFORM public.operar_suministro_570(t,a,'REPROGRAMAR',e1,jsonb_build_object('version',1,'fecha_programada',hoy+6,
    'destino','Hospital norte','motivo','Cambio solicitado por el cliente'),'577-reschedule');
  j:=public.evaluar_alertas_suministro_577(t,hoy);
  IF (SELECT motivo_resolucion FROM public.alertas_eventos WHERE id=al)<>'REPROGRAMADA'
    OR (SELECT count(*) FROM public.alertas_eventos WHERE tenant_id=t AND objeto_id=e1)<>2
    OR NOT EXISTS (SELECT 1 FROM public.alertas_eventos WHERE tenant_id=t AND objeto_id=e1 AND estado='ABIERTA' AND fecha_objetivo=hoy+6)
  THEN RAISE EXCEPTION 'VERIFY577_RESCHEDULE'; END IF;

  -- Diez días después la entrega está atrasada: la próxima se supera y la atrasada es crítica.
  j:=public.evaluar_alertas_suministro_577(t,hoy+10);
  SELECT id INTO al FROM public.alertas_eventos WHERE tenant_id=t AND tipo='ENTREGA_ATRASADA' AND objeto_id=e1 AND estado='ABIERTA';
  IF al IS NULL OR (SELECT severidad FROM public.alertas_eventos WHERE id=al)<>'CRITICA'
    OR EXISTS (SELECT 1 FROM public.alertas_eventos WHERE tenant_id=t AND tipo='ENTREGA_PROXIMA' AND estado='ABIERTA' AND objeto_id=e1)
    OR (SELECT count(*) FROM public.alertas_destinatarios WHERE alerta_id=al AND nivel='INICIAL')<>1
  THEN RAISE EXCEPTION 'VERIFY577_LATE %', j; END IF;

  -- Sin reconocimiento en dos días se escala una sola vez.
  j:=public.evaluar_alertas_suministro_577(t,hoy+12);
  IF (j->>'escaladas')::integer<>1 OR NOT EXISTS (SELECT 1 FROM public.alertas_destinatarios WHERE alerta_id=al AND usuario_id=a AND nivel='ESCALAMIENTO')
  THEN RAISE EXCEPTION 'VERIFY577_ESCALATION %', j; END IF;
  j:=public.evaluar_alertas_suministro_577(t,hoy+12);
  IF (j->>'escaladas')::integer<>0 OR (SELECT count(*) FROM public.alertas_destinatarios WHERE alerta_id=al)<>2 THEN
    RAISE EXCEPTION 'VERIFY577_ESCALATION_REPEATED'; END IF;

  -- Reconocimiento por usuario: b reconoce, a sigue pendiente; reintentar no cambia la fecha.
  PERFORM public.reconocer_alerta_577(t,b,al);
  PERFORM public.reconocer_alerta_577(t,b,al);
  IF (SELECT reconocido_at FROM public.alertas_destinatarios WHERE alerta_id=al AND usuario_id=b) IS NULL
    OR (SELECT reconocido_at FROM public.alertas_destinatarios WHERE alerta_id=al AND usuario_id=a) IS NOT NULL
    OR NOT (SELECT n.leida FROM public.notificaciones n JOIN public.alertas_destinatarios d ON d.notificacion_id=n.id WHERE d.alerta_id=al AND d.usuario_id=b)
    OR (SELECT n.leida FROM public.notificaciones n JOIN public.alertas_destinatarios d ON d.notificacion_id=n.id WHERE d.alerta_id=al AND d.usuario_id=a)
  THEN RAISE EXCEPTION 'VERIFY577_PER_USER_ACK'; END IF;
  j:=public.consultar_alertas_577(t,b,'MIAS','ABIERTA');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'items') x WHERE x->>'id'=al::text AND (x->>'reconocida_por_mi')::boolean) THEN
    RAISE EXCEPTION 'VERIFY577_MY_ALERTS %', j; END IF;
  PERFORM pg_temp.reject577(format('SELECT public.reconocer_alerta_577(%L,%L,%L)',t,b,
    (SELECT id FROM public.alertas_eventos WHERE tenant_id=t AND tipo='LOTE_POR_VENCER')),'ALERTS_NOT_FOUND');

  -- El lote sin stock deja de alertar; desactivar una regla resuelve sus alertas.
  PERFORM public.registrar_ajuste_inventario_tx(t,jsonb_build_object('producto_id',lp,'almacen_id',w,'delta',-5,'motivo','Baja del lote','lote','LV'),a,'577-lot-out');
  PERFORM public.configurar_regla_alerta_577(t,a,jsonb_build_object('tipo','COBRANZA_VENCIDA','activa',false,'dias_anticipacion',0,
    'dias_escalamiento',NULL,'destinatarios',jsonb_build_array(a),'escalar_a','[]'::jsonb,'incluir_responsable',false,'enviar_correo',false,'version',1),'577-rule-cxc-off');
  j:=public.evaluar_alertas_suministro_577(t,hoy+12);
  IF (SELECT motivo_resolucion FROM public.alertas_eventos WHERE tenant_id=t AND tipo='LOTE_POR_VENCER')<>'CONDICION_SUPERADA'
    OR (SELECT motivo_resolucion FROM public.alertas_eventos WHERE tenant_id=t AND tipo='COBRANZA_VENCIDA')<>'REGLA_DESACTIVADA'
  THEN RAISE EXCEPTION 'VERIFY577_RESOLUTION'; END IF;
  IF (SELECT count(*) FROM public.alertas_ejecuciones WHERE tenant_id=t)<>7 THEN RAISE EXCEPTION 'VERIFY577_RUN_LOG'; END IF;

  -- Aislamiento y permisos.
  BEGIN PERFORM public.configurar_regla_alerta_577(t,oa,jsonb_build_object('tipo','LOTE_POR_VENCER'),'577-foreign-rule');
    RAISE EXCEPTION 'VERIFY577_FOREIGN_WRITE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.reconocer_alerta_577(ot,oa,al); RAISE EXCEPTION 'VERIFY577_FOREIGN_ACK';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  j:=public.consultar_alertas_577(ot,oa,'TODAS','TODAS');
  IF jsonb_array_length(j->'items')<>0 THEN RAISE EXCEPTION 'VERIFY577_FOREIGN_READ'; END IF;
  RAISE NOTICE 'VERIFY577_OK: reglas, deduplicación, reprogramación con historial, atraso, escalamiento único, reconocimiento por usuario, resolución y aislamiento';
END $verify$;
ROLLBACK;
