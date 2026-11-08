\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE verify613_receipts(name text PRIMARY KEY, context jsonb, rpc jsonb, detail jsonb);
CREATE TEMP TABLE verify613_resolutions(name text PRIMARY KEY, context jsonb, resolution jsonb);
-- Prueba del núcleo privado. La aceptación del endpoint/UI y GRE se añade con
-- el writer de negocio; este verificador no los da por implementados.
CREATE FUNCTION pg_temp.reject613(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY613_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY613_EXPECTED_REJECTION %', expected;
END $fn$;

-- PostgreSQL mide caracteres, no unidades UTF-16. Contrastar los límites que
-- también valida la API antes de reservar una intención o llamar al writer.
DO $fn$
DECLARE a uuid := '61300000-0000-4000-8000-000000000001';
  o uuid := '61300000-0000-4000-8000-000000000002';
  body jsonb := '{"motivo":"Anulación Unicode"}';
BEGIN
  PERFORM app.transfer_reversal_request_613(a,o,body,repeat(chr(128512),8));
  PERFORM app.transfer_reversal_request_613(a,o,body,repeat(chr(128512),180));
  PERFORM pg_temp.reject613(format('SELECT app.transfer_reversal_request_613(%L,%L,%L,%L)',a,o,body,repeat(chr(128512),4)),
    'INVENTORY_REVERSAL_PAYLOAD_INVALID');
  PERFORM pg_temp.reject613(format('SELECT app.transfer_reversal_request_613(%L,%L,%L,%L)',a,o,body,repeat(chr(128512),181)),
    'INVENTORY_REVERSAL_PAYLOAD_INVALID');
END $fn$;

CREATE FUNCTION pg_temp.state613(t uuid, pr uuid, include_resolution boolean DEFAULT true) RETURNS text LANGUAGE sql AS $fn$
  SELECT md5(jsonb_build_object(
    'producto',(SELECT to_jsonb(p) FROM public.productos p WHERE p.tenant_id=t AND p.id=pr),
    'existencias',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.producto_existencias p WHERE p.tenant_id=t AND p.producto_id=pr),
    'movimientos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.movimientos_inventario p WHERE p.tenant_id=t AND p.producto_id=pr),
    'lotes',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.inventario_lote_saldos p WHERE p.tenant_id=t AND p.producto_id=pr),
    'ledger',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.movimientos_inventario_lotes p WHERE p.tenant_id=t AND p.producto_id=pr),
    'reversas',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.inventario_reversas p WHERE p.tenant_id=t),
    'operaciones',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.operaciones_inventario p WHERE p.tenant_id=t AND p.producto_id=pr),
    'resoluciones',CASE WHEN include_resolution THEN (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.inventario_reversa_resoluciones p WHERE p.tenant_id=t) ELSE NULL END
  )::text)
$fn$;

CREATE FUNCTION pg_temp.core613(t uuid, a uuid, source_id uuid, k text, override_sources uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE o public.operaciones_inventario; r uuid; p jsonb; s uuid; e uuid;
BEGIN
  SELECT * INTO o FROM public.operaciones_inventario WHERE tenant_id=t AND id=source_id;
  p:=jsonb_build_object('tipo','TRANSFERENCIA','fuente_id',source_id,'actor_id',a,'motivo','Corrección física verificada');
  INSERT INTO public.inventario_reversas(tenant_id,tipo,fuente_id,idempotency_key,fingerprint,actor_id,motivo,payload,movimientos_origen,fuente_snapshot)
  VALUES(t,'TRANSFERENCIA',source_id,k,app.inventory_operation_fingerprint_455(p),a,p->>'motivo',p,
    coalesce(override_sources,ARRAY[o.movimiento_entrada_id,o.movimiento_salida_id]),jsonb_build_object('operacion',to_jsonb(o))) RETURNING id INTO r;
  s:=app.apply_inventory_reversal_movement_613(r,o.movimiento_entrada_id);
  e:=app.apply_inventory_reversal_movement_613(r,o.movimiento_salida_id);
  UPDATE public.inventario_reversas SET resultado=jsonb_build_object('reversa_id',r,'movimiento_salida_id',s,'movimiento_entrada_id',e) WHERE id=r;
  RETURN r;
END $fn$;

CREATE FUNCTION pg_temp.incomplete613(t uuid, a uuid, source_id uuid) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE o public.operaciones_inventario; r uuid; p jsonb;
BEGIN
  SELECT * INTO o FROM public.operaciones_inventario WHERE tenant_id=t AND id=source_id;
  p:=jsonb_build_object('tipo','TRANSFERENCIA','fuente_id',source_id,'actor_id',a,'motivo','Writer interrumpido a mitad');
  INSERT INTO public.inventario_reversas(tenant_id,tipo,fuente_id,idempotency_key,fingerprint,actor_id,motivo,payload,movimientos_origen,fuente_snapshot)
  VALUES(t,'TRANSFERENCIA',source_id,'613-interrupted-half',app.inventory_operation_fingerprint_455(p),a,p->>'motivo',p,
    ARRAY[o.movimiento_entrada_id,o.movimiento_salida_id],jsonb_build_object('operacion',to_jsonb(o))) RETURNING id INTO r;
  PERFORM app.apply_inventory_reversal_movement_613(r,o.movimiento_entrada_id);
  UPDATE public.inventario_reversas SET resultado=jsonb_build_object('reversa_id',r) WHERE id=r;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
END $fn$;
CREATE FUNCTION pg_temp.fail_second613() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'VERIFY613_FORCED_SECOND_FAILURE'; END $fn$;

-- Estado fiscal simulado exclusivamente dentro del rollback local: no hay
-- certificado, firma real, llamada SUNAT ni aceptación de interoperabilidad.
CREATE FUNCTION pg_temp.guide613(t uuid,a uuid,pr uuid,origin_branch uuid,destination_branch uuid,qty numeric,k text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE j jsonb; g uuid;
BEGIN
  j:=public.crear_gre_tx(t,a,jsonb_build_object('destinatario','Fixture local613','direccion_destino','Dirección local de prueba',
    'fecha_traslado',app.hoy_tenant(t)::text||'T10:00:00-05:00','modalidad','TRANSPORTE_PRIVADO',
    'motivo','TRASLADO_ENTRE_ESTABLECIMIENTOS','peso_total',qty,'placa_vehiculo','ABC613',
    'datos_adicionales',jsonb_build_object('partidaSucursalId',origin_branch,'llegadaSucursalId',destination_branch,'scope','LOCAL_VERIFY613')),
    jsonb_build_array(jsonb_build_object('producto_id',pr,'descripcion','Fixture local613','cantidad',qty,'unidad_medida','NIU','peso',qty)),k);
  g:=(j->>'id')::uuid;
  PERFORM public.guardar_firma_gre_tx(t,a,g,'<fixture-ubl613/>','<fixture-signed613/>',repeat('a',64),k||'-fixture-sign');
  RETURN g;
END $fn$;

DO $verify$
DECLARE
  t uuid; a uuid; ot uuid; oa uuid; w uuid; w2 uuid; pr uuid; lp uuid; zp uuid; gp uuid; u uuid;
  j jsonb; o uuid; r uuid; orig jsonb; now_orig jsonb; before_state text; stock_before jsonb;
  old_id uuid; reverse_id uuid; today date; original_result jsonb; replay jsonb;
  branch uuid; original_branch uuid; wa uuid; guide_out uuid; guide_back uuid; guide_out2 uuid; fiscal_before text;
  resolution jsonb; resolution_replay jsonb; captured_context jsonb; captured_rpc jsonb;
BEGIN
  IF current_database()<>'erp_e2e' OR NOT EXISTS(
    SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax'
  ) THEN RAISE EXCEPTION 'VERIFY613_LOCAL_ONLY'; END IF;
  IF has_table_privilege('service_role','public.inventario_reversas','SELECT')
     OR has_table_privilege('service_role','public.inventario_reversas','INSERT')
     OR has_table_privilege('service_role','public.inventario_reversas','UPDATE')
     OR has_table_privilege('service_role','public.inventario_reversas','DELETE')
     OR has_table_privilege('authenticated','public.inventario_reversas','SELECT')
     OR has_table_privilege('anon','public.inventario_reversas','SELECT')
     OR has_function_privilege('service_role','app.apply_inventory_reversal_movement_613(uuid,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.revertir_transferencia_inventario_613(uuid,uuid,uuid,jsonb,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.revertir_transferencia_inventario_613(uuid,uuid,uuid,jsonb,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.revertir_transferencia_inventario_613(uuid,uuid,uuid,jsonb,text)','EXECUTE')
     OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.inventario_reversas'::regclass AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'VERIFY613_PRIVATE_ACL'; END IF;
  j:=public.create_demo_tenant_ready_tx('VERIFY613',14,'PE','verify613-'||gen_random_uuid()::text);
  t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY613OTHER',14,'PE','verify613other-'||gen_random_uuid()::text);
  ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  today:=app.hoy_tenant(t);
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC,id LIMIT 1;
  j:=public.crear_almacen_maestro_tx(t,a,'613-second-warehouse',jsonb_build_object('codigo','ALM613','nombre','Almacén reversas'));
  w2:=coalesce(j->>'id',j#>>'{almacen,id}')::uuid;
  j:=public.crear_ubicacion_almacen_maestro_tx(t,a,w,'613-origin-location',jsonb_build_object('codigo','R613','nombre','Rack reversas'));
  u:=coalesce(j->>'id',j#>>'{ubicacion,id}')::uuid;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD613','nombre','Producto reversa','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb);
  pr:=(j->>'id')::uuid;
  PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=pr,p_almacen_id:=w,p_tipo:='ENTRADA',p_cantidad:=3,
    p_referencia_tipo:='VERIFY613_IN',p_referencia_id:=gen_random_uuid(),p_metadata:='{"costo_unitario":4}');
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',1.125,'motivo','Traslado fraccionario original'),a,'613-transfer-basic');o:=(j->>'operacion_id')::uuid;
  SELECT jsonb_build_object('op',to_jsonb(op),'movimientos',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
    FROM public.movimientos_inventario m WHERE m.id IN(op.movimiento_salida_id,op.movimiento_entrada_id))) INTO orig
  FROM public.operaciones_inventario op WHERE op.id=o;
  before_state:=pg_temp.state613(t,pr);
  PERFORM pg_temp.reject613(format('SELECT pg_temp.core613(%L,%L,%L,''613-cross-actor'')',t,oa,o),'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT');
  PERFORM pg_temp.reject613(format('SELECT pg_temp.core613(%L,%L,%L,''613-cross-source'',ARRAY[%L,%L]::uuid[])',t,a,o,gen_random_uuid(),gen_random_uuid()),'INVENTORY_REVERSAL_SOURCE_MISMATCH');
  IF before_state<>pg_temp.state613(t,pr) THEN RAISE EXCEPTION 'VERIFY613_REJECT_CHANGED_STATE'; END IF;

  -- Ni catálogo editado ni preferencia de moneda pueden revalorizar el reverso.
  UPDATE public.productos SET costo=999,precio_compra=999 WHERE tenant_id=t AND id=pr;
  UPDATE public.empresa_config SET moneda_defecto='USD' WHERE tenant_id=t;
  r:=pg_temp.core613(t,a,o,'613-reverse-basic');
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;
  SELECT jsonb_build_object('op',to_jsonb(op),'movimientos',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
    FROM public.movimientos_inventario m WHERE m.id IN(op.movimiento_salida_id,op.movimiento_entrada_id))) INTO now_orig
  FROM public.operaciones_inventario op WHERE op.id=o;
  IF orig IS DISTINCT FROM now_orig
     OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=t AND producto_id=pr AND almacen_id=w)<>3
     OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=t AND producto_id=pr AND almacen_id=w2)<>0
     OR (SELECT count(*) FROM public.movimientos_inventario WHERE metadata->>'reversa_id'=r::text)<>2
     OR EXISTS(SELECT 1 FROM public.movimientos_inventario m JOIN public.movimientos_inventario s ON s.id=m.referencia_id
       WHERE m.metadata->>'reversa_id'=r::text AND ROW(m.kardex_moneda,m.kardex_moneda_base,m.kardex_tipo_cambio,
         m.kardex_costo_unitario,m.kardex_valor_total,m.kardex_valuacion_estado)
       IS DISTINCT FROM ROW(s.kardex_moneda,s.kardex_moneda_base,s.kardex_tipo_cambio,s.kardex_costo_unitario,s.kardex_valor_total,s.kardex_valuacion_estado))
  THEN RAISE EXCEPTION 'VERIFY613_ORIGINAL_OR_FROZEN_VALUE_CHANGED'; END IF;
  SELECT id INTO reverse_id FROM public.movimientos_inventario WHERE metadata->>'reversa_id'=r::text LIMIT 1;
  PERFORM pg_temp.reject613(format('UPDATE public.movimientos_inventario SET metadata=metadata||''{"source_movement_id":"forged"}''::jsonb WHERE id=%L',reverse_id),'INVENTORY_REVERSAL_MOVEMENT_IMMUTABLE');
  PERFORM pg_temp.reject613(format('DELETE FROM public.movimientos_inventario WHERE id=%L',reverse_id),'INVENTORY_REVERSAL_MOVEMENT_IMMUTABLE');
  PERFORM pg_temp.reject613(format('UPDATE public.inventario_reversas SET motivo=''Otro motivo'' WHERE id=%L',r),'INVENTORY_REVERSAL_RECORD_IMMUTABLE');

  -- Tener unidades de reposición más baratas no permite retirar un valor que
  -- ya fue consumido: no se fabrica una existencia de valor negativo.
  UPDATE public.empresa_config SET moneda_defecto='PEN' WHERE tenant_id=t;
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',1.125,'motivo','Traslado consumido'),a,'613-transfer-consumed');o:=(j->>'operacion_id')::uuid;
  PERFORM public.aplicar_movimiento_inventario_tx(t,pr,w2,'SALIDA',1.125,'VERIFY613_USE',gen_random_uuid());
  PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=pr,p_almacen_id:=w2,p_tipo:='ENTRADA',p_cantidad:=1.125,
    p_referencia_tipo:='VERIFY613_REPLACE',p_referencia_id:=gen_random_uuid(),p_metadata:='{"costo_unitario":1}');
  before_state:=pg_temp.state613(t,pr);
  PERFORM pg_temp.reject613(format('SELECT pg_temp.core613(%L,%L,%L,''613-consumed-reject'')',t,a,o),'INVENTORY_REVERSAL_WAREHOUSE_VALUATION_REQUIRED');
  IF before_state<>pg_temp.state613(t,pr) THEN RAISE EXCEPTION 'VERIFY613_CONSUMED_CHANGED_STATE'; END IF;

  -- Lotes y ubicaciones: el regreso reproduce el reparto original, incluidos
  -- los NULL de ubicación, en lugar de elegir otro lote por FEFO.
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD613L','nombre','Producto reversa lotes','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb);lp:=(j->>'id')::uuid;
  PERFORM public.operar_lotes_inventario_574(t,a,'CONFIGURAR_POLITICA',jsonb_build_object('producto_id',lp,'controla_lote',true,
    'requiere_vencimiento',true,'dias_minimos_vida_util',0,'version',0),'613-lot-policy');
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w,'ENTRADA',1.5,'VERIFY613_LOT',gen_random_uuid(),'Lote A',u,'L613A',today+100);
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w,'ENTRADA',1.5,'VERIFY613_LOT',gen_random_uuid(),'Lote B',NULL,'L613B',today+200);
  SELECT jsonb_agg(jsonb_build_object('lote',s.lote_id,'ubicacion',s.ubicacion_id,'stock',s.stock_actual) ORDER BY s.lote_id,s.ubicacion_id NULLS FIRST)
    INTO stock_before FROM public.inventario_lote_saldos s WHERE s.tenant_id=t AND s.producto_id=lp AND s.almacen_id=w;
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',lp,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',2.25,'motivo','Traslado entre lotes'),a,'613-transfer-lots');o:=(j->>'operacion_id')::uuid;
  r:=pg_temp.core613(t,a,o,'613-reverse-lots');
  IF stock_before IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('lote',s.lote_id,'ubicacion',s.ubicacion_id,'stock',s.stock_actual)
    ORDER BY s.lote_id,s.ubicacion_id NULLS FIRST) FROM public.inventario_lote_saldos s WHERE s.tenant_id=t AND s.producto_id=lp AND s.almacen_id=w)
    OR EXISTS(SELECT 1 FROM public.inventario_lote_saldos WHERE tenant_id=t AND producto_id=lp AND almacen_id=w2 AND (stock_actual<>0 OR stock_reservado<>0))
  THEN RAISE EXCEPTION 'VERIFY613_LOT_LOCATION_CHANGED'; END IF;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;

  -- La cantidad total y el valor alcanzan, pero un lote original fue consumido.
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',lp,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',2.25,'motivo','Traslado con lote consumido'),a,'613-transfer-lot-used');o:=(j->>'operacion_id')::uuid;
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w2,'SALIDA',0.5,'VERIFY613_LOT_USE',gen_random_uuid());
  PERFORM public.aplicar_movimiento_inventario_tx(t,lp,w2,'ENTRADA',0.5,'VERIFY613_OTHER_LOT',gen_random_uuid(),'Otro lote',NULL,'L613C',today+300);
  before_state:=pg_temp.state613(t,lp);
  PERFORM pg_temp.reject613(format('SELECT pg_temp.core613(%L,%L,%L,''613-lot-used-reject'')',t,a,o),'INVENTORY_LOT_AVAILABLE_INSUFFICIENT');
  IF before_state<>pg_temp.state613(t,lp) THEN RAISE EXCEPTION 'VERIFY613_WRONG_LOT_CHANGED_STATE'; END IF;

  -- Costo cero confirmado conserva cero, sin fallback al precio de catálogo.
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD613Z','nombre','Producto sin costo','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb);zp:=(j->>'id')::uuid;
  PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=zp,p_almacen_id:=w,p_tipo:='ENTRADA',p_cantidad:=2,
    p_referencia_tipo:='VERIFY613_ZERO',p_referencia_id:=gen_random_uuid(),p_metadata:='{"costo_unitario":0,"costo_cero_confirmado":true}');
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',zp,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',1,'motivo','Traslado de costo cero'),a,'613-transfer-zero');o:=(j->>'operacion_id')::uuid;
  r:=pg_temp.core613(t,a,o,'613-reverse-zero');
  IF EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE metadata->>'reversa_id'=r::text
    AND (kardex_costo_unitario<>0 OR kardex_valor_total<>0 OR kardex_valuacion_estado<>'CONFIRMADA'))
  THEN RAISE EXCEPTION 'VERIFY613_ZERO_COST_FALLBACK'; END IF;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;

  -- Writer público de negocio: identidad, recuperación y exclusión del segundo
  -- intento quedan enlazadas al traslado original, sin alterar su recibo.
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',zp,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',0.5,'motivo','Traslado para anular por RPC'),a,'613-transfer-rpc');o:=(j->>'operacion_id')::uuid;
  before_state:=pg_temp.state613(t,zp);
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-bad-actor'')',t,oa,o,'{"motivo":"Reversa inválida"}'),
    'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT');
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-wrong-tenant'')',ot,oa,o,'{"motivo":"Reversa inválida"}'),
    'INVENTORY_TRANSFER_NOT_FOUND');
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-invalid-body'')',t,a,o,'[]'),
    'INVENTORY_REVERSAL_PAYLOAD_INVALID');
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-extra-key'')',t,a,o,'{"motivo":"Reversa inválida","cantidad":999}'),
    'INVENTORY_REVERSAL_PAYLOAD_INVALID');
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-bad-guide'')',t,a,o,'{"motivo":"Reversa inválida","guia_remision_id":"no-uuid"}'),
    'INVENTORY_REVERSAL_PAYLOAD_INVALID');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_RPC_REJECTION_CHANGED_STATE'; END IF;
  PERFORM pg_temp.reject613(format('SELECT pg_temp.incomplete613(%L,%L,%L)',t,a,o),'INVENTORY_REVERSAL_INCOMPLETE');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_INCOMPLETE_CHANGED_STATE'; END IF;
  EXECUTE 'CREATE TRIGGER zzz_verify613_second_failure BEFORE INSERT ON public.movimientos_inventario FOR EACH ROW '
    ||'WHEN (NEW.referencia_tipo=''TRANSFERENCIA_REVERSA'' AND NEW.tipo=''ENTRADA'' '
    ||'AND NEW.metadata->>''idempotency_key''=''613-rpc-fail-second'') EXECUTE FUNCTION pg_temp.fail_second613()';
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-fail-second'')',t,a,o,'{"motivo":"Fallo deliberado del segundo movimiento"}'),
    'VERIFY613_FORCED_SECOND_FAILURE');
  DROP TRIGGER zzz_verify613_second_failure ON public.movimientos_inventario;
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_SECOND_FAILURE_CHANGED_STATE'; END IF;
  original_result:=public.revertir_transferencia_inventario_613(t,a,o,'{"motivo":"Anulación enlazada por RPC"}','613-rpc-reversal');
  IF original_result->>'idempotent'<>'false' OR original_result->>'operacion_origen_id'<>o::text
    OR original_result->>'tipo'<>'TRANSFERENCIA_REVERSA' OR original_result->>'actor_id'<>a::text
    OR (original_result->>'cantidad')::numeric<>0.5
    OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=t AND producto_id=zp AND almacen_id=w)<>2
    OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=t AND producto_id=zp AND almacen_id=w2)<>0
  THEN RAISE EXCEPTION 'VERIFY613_RPC_RECEIPT_OR_STOCK'; END IF;
  before_state:=pg_temp.state613(t,zp);
  replay:=public.revertir_transferencia_inventario_613(t,a,o,'{"motivo":"Anulación enlazada por RPC"}','613-rpc-reversal');
  IF replay IS DISTINCT FROM original_result||'{"idempotent":true}'::jsonb
     OR before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_RPC_REPLAY_CHANGED_STATE'; END IF;
  j:=public.consultar_transferencia_inventario_613(t,a,o,'613-rpc-reversal');
  INSERT INTO verify613_receipts VALUES('zero',jsonb_build_object('tenantId',t,'actorId',a,'operationId',o,'key','613-rpc-reversal',
    'body',jsonb_build_object('motivo','Anulación enlazada por RPC')),original_result,j);
  IF j#>>'{reversa,id}' IS DISTINCT FROM original_result->>'reversa_id'
     OR j#>'{reversa,resultado}' IS DISTINCT FROM original_result
     OR j#>>'{reversa,movimiento_salida,referencia_id}' IS DISTINCT FROM j#>>'{movimiento_entrada,id}'
     OR j#>>'{reversa,movimiento_entrada,referencia_id}' IS DISTINCT FROM j#>>'{movimiento_salida,id}'
     OR jsonb_typeof(j->'cantidad') IS DISTINCT FROM 'string'
     OR jsonb_typeof(j#>'{reversa,movimiento_salida,costo_unitario}') IS DISTINCT FROM 'string'
     OR public.consultar_transferencia_inventario_613(t,a,o,'613-no-own-receipt') IS NOT NULL
     OR before_state<>pg_temp.state613(t,zp)
  THEN RAISE EXCEPTION 'VERIFY613_READ_RECEIPT_OR_WRITE_SIDE_EFFECT'; END IF;
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-reversal'')',t,a,o,'{"motivo":"Otro motivo posterior"}'),
    'INVENTORY_REVERSAL_IDEMPOTENCY_CONFLICT');
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-rpc-reversal-second'')',t,a,o,'{"motivo":"Anulación enlazada por RPC"}'),
    'INVENTORY_TRANSFER_ALREADY_REVERSED');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_RPC_DUPLICATE_CHANGED_STATE'; END IF;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;

  -- Recibo con costo no nulo y texto Unicode escapado: contrasta el hash
  -- PostgreSQL con el validador de la API sin reconstruirlo en el fixture.
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',pr,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',0.125,'motivo','Traslado con valor no nulo'),a,'613-transfer-valued');o:=(j->>'operacion_id')::uuid;
  original_result:=public.revertir_transferencia_inventario_613(t,a,o,
    jsonb_build_object('motivo','Corrección ñ, "comillas" y trazabilidad'),'613-reverse-valued');
  INSERT INTO verify613_receipts VALUES('valued-unicode',jsonb_build_object('tenantId',t,'actorId',a,'operationId',o,'key','613-reverse-valued',
    'body',jsonb_build_object('motivo','Corrección ñ, "comillas" y trazabilidad')),original_result,
    public.consultar_transferencia_inventario_613(t,a,o,'613-reverse-valued'));
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;

  -- numeric(18,6) que no cabe exactamente en un float de JavaScript.
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD613G','nombre','Producto decimal grande','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,0,0,'[]'::jsonb);gp:=(j->>'id')::uuid;
  PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=gp,p_almacen_id:=w,p_tipo:='ENTRADA',p_cantidad:=999999999999,
    p_referencia_tipo:='VERIFY613_BIG',p_referencia_id:=gen_random_uuid(),p_metadata:='{"costo_unitario":4}');
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',gp,'almacen_origen_id',w,'almacen_destino_id',w2,
    'cantidad',999999999998.123456::numeric,'motivo','Traslado decimal exacto'),a,'613-transfer-big');o:=(j->>'operacion_id')::uuid;
  original_result:=public.revertir_transferencia_inventario_613(t,a,o,'{"motivo":"Restituir cantidad decimal exacta"}','613-reverse-big');
  j:=public.consultar_transferencia_inventario_613(t,a,o,'613-reverse-big');
  IF j->>'cantidad'<>'999999999998.123456' OR original_result->>'cantidad'<>'999999999998.123456' THEN
    RAISE EXCEPTION 'VERIFY613_BIG_QUANTITY_ROUNDED';
  END IF;
  INSERT INTO verify613_receipts VALUES('large-exact-decimal',jsonb_build_object('tenantId',t,'actorId',a,'operationId',o,'key','613-reverse-big',
    'body',jsonb_build_object('motivo','Restituir cantidad decimal exacta')),original_result,j);
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;

  -- GRE inversa y cupo compartido por movimientos ordinarios y reversas.
  SELECT sucursal_id INTO original_branch FROM public.almacenes WHERE id=w;
  INSERT INTO public.sucursales(tenant_id,nombre) VALUES(t,'Anexo fixture613') RETURNING id INTO branch;
  INSERT INTO public.almacenes(tenant_id,nombre,codigo,sucursal_id,activo,estado)
    VALUES(t,'Anexo reversas613','ANX613',branch,true,'ACTIVO') RETURNING id INTO wa;
  guide_out:=pg_temp.guide613(t,a,zp,original_branch,branch,1,'613-guide-forward');
  guide_back:=pg_temp.guide613(t,a,zp,branch,original_branch,1,'613-guide-return');
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',zp,'almacen_origen_id',w,'almacen_destino_id',wa,
    'cantidad',1,'motivo','Traslado con guía local','guia_remision_id',guide_out),a,'613-transfer-guide');o:=(j->>'operacion_id')::uuid;
  before_state:=pg_temp.state613(t,zp);
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-reverse-guide-missing'')',t,a,o,
    '{"motivo":"Retorno sin guía inversa"}'),'INVENTORY_TRANSFER_REQUIRES_GRE');
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-reverse-guide-same'')',t,a,o,
    jsonb_build_object('motivo','Reutilizar guía de salida','guia_remision_id',guide_out)),'INVENTORY_TRANSFER_REVERSE_GRE_REQUIRED');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_GRE_REJECT_CHANGED_STATE'; END IF;
  SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY g.id)::text) INTO fiscal_before FROM public.gre_guias g WHERE g.tenant_id=t;
  j:=public.revertir_transferencia_inventario_613(t,a,o,jsonb_build_object('motivo','Retorno con guía inversa local','guia_remision_id',guide_back),'613-reverse-guide');
  INSERT INTO verify613_receipts VALUES('guide',jsonb_build_object('tenantId',t,'actorId',a,'operationId',o,'key','613-reverse-guide',
    'body',jsonb_build_object('motivo','Retorno con guía inversa local','guia_remision_id',guide_back)),j,
    public.consultar_transferencia_inventario_613(t,a,o,'613-reverse-guide'));
  IF j#>>'{traslado_entre_establecimientos,guia_remision_id}'<>guide_back::text
    OR fiscal_before IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY g.id)::text) FROM public.gre_guias g WHERE g.tenant_id=t)
  THEN RAISE EXCEPTION 'VERIFY613_GRE_CHANGED_OR_RETURN_ROUTE'; END IF;
  PERFORM public.aplicar_movimiento_inventario_tx(p_tenant_id:=t,p_producto_id:=zp,p_almacen_id:=wa,p_tipo:='ENTRADA',p_cantidad:=0.5,
    p_referencia_tipo:='VERIFY613_GUIDE_STOCK',p_referencia_id:=gen_random_uuid(),p_metadata:='{"costo_unitario":0,"costo_cero_confirmado":true}');
  before_state:=pg_temp.state613(t,zp);
  PERFORM pg_temp.reject613(format('SELECT public.transferir_inventario_tx(%L,%L,%L,''613-forward-consumed-return-guide'')',t,
    jsonb_build_object('producto_id',zp,'almacen_origen_id',wa,'almacen_destino_id',w,'cantidad',0.5,
      'motivo','Cupo usado por reversa','guia_remision_id',guide_back),a),'INVENTORY_TRANSFER_GRE_QUANTITY_EXCEEDED');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_FORWARD_GRE_QUOTA_CHANGED_STATE'; END IF;
  guide_out2:=pg_temp.guide613(t,a,zp,original_branch,branch,0.5,'613-guide-forward-two');
  j:=public.transferir_inventario_tx(t,jsonb_build_object('producto_id',zp,'almacen_origen_id',w,'almacen_destino_id',wa,
    'cantidad',0.5,'motivo','Otro traslado con guía','guia_remision_id',guide_out2),a,'613-transfer-guide-two');o:=(j->>'operacion_id')::uuid;
  before_state:=pg_temp.state613(t,zp);
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-reverse-consumed-return-guide'')',t,a,o,
    jsonb_build_object('motivo','Otra reversa sin cupo','guia_remision_id',guide_back)),'INVENTORY_TRANSFER_GRE_QUANTITY_EXCEEDED');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_REVERSE_GRE_QUOTA_CHANGED_STATE'; END IF;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
  SET CONSTRAINTS assert_inventory_reversal_complete_613 DEFERRED;

  -- Cancelar explícitamente una intención que falló no deja un writer tardío
  -- capaz de ejecutarla después, aunque cambien las existencias o la guía.
  before_state:=pg_temp.state613(t,zp,false);
  resolution:=public.resolver_reversa_transferencia_613(t,a,o,
    jsonb_build_object('motivo','Otra reversa sin cupo','guia_remision_id',guide_back),'613-reverse-consumed-return-guide');
  IF resolution->>'status'<>'ABANDONED' OR resolution#>>'{resolution,source_operation_id}'<>o::text
    OR resolution#>>'{resolution,actor_id}'<>a::text
    OR (SELECT count(*) FROM public.inventario_reversa_resoluciones WHERE tenant_id=t AND idempotency_key='613-reverse-consumed-return-guide')<>1
    OR before_state<>pg_temp.state613(t,zp,false) THEN RAISE EXCEPTION 'VERIFY613_ABANDONMENT_STOCK_OR_PROOF'; END IF;
  INSERT INTO verify613_resolutions VALUES('abandoned',jsonb_build_object('tenantId',t,'actorId',a,'operationId',o,'key','613-reverse-consumed-return-guide',
    'body',jsonb_build_object('motivo','Otra reversa sin cupo','guia_remision_id',guide_back)),resolution);
  before_state:=pg_temp.state613(t,zp);
  resolution_replay:=public.resolver_reversa_transferencia_613(t,a,o,
    jsonb_build_object('motivo','Otra reversa sin cupo','guia_remision_id',guide_back),'613-reverse-consumed-return-guide');
  IF resolution_replay IS DISTINCT FROM resolution OR before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_ABANDONMENT_REPLAY'; END IF;
  PERFORM pg_temp.reject613(format('SELECT public.revertir_transferencia_inventario_613(%L,%L,%L,%L,''613-reverse-consumed-return-guide'')',t,a,o,
    jsonb_build_object('motivo','Otra reversa sin cupo','guia_remision_id',guide_back)),'INVENTORY_REVERSAL_ABANDONED');
  PERFORM pg_temp.reject613(format('SELECT public.resolver_reversa_transferencia_613(%L,%L,%L,%L,''613-reverse-consumed-return-guide'')',t,a,o,
    jsonb_build_object('motivo','Cambiar un motivo ya cerrado','guia_remision_id',guide_back)),'INVENTORY_REVERSAL_RESOLUTION_CONFLICT');
  IF before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_LATE_WRITER_OR_CONFLICT_CHANGED_STATE'; END IF;

  SELECT context,rpc INTO captured_context,captured_rpc FROM verify613_receipts WHERE name='zero';
  before_state:=pg_temp.state613(t,zp);
  resolution:=public.resolver_reversa_transferencia_613(t,a,(captured_context->>'operationId')::uuid,
    captured_context->'body',captured_context->>'key');
  IF resolution->>'status'<>'COMMITTED' OR resolution->'receipt' IS DISTINCT FROM captured_rpc||'{"idempotent":true}'::jsonb
     OR resolution#>>'{detail,reversa,id}' IS DISTINCT FROM captured_rpc->>'reversa_id'
     OR before_state<>pg_temp.state613(t,zp) THEN RAISE EXCEPTION 'VERIFY613_RESOLVE_COMMITTED_NOT_REPEAT'; END IF;
  INSERT INTO verify613_resolutions VALUES('committed',captured_context,resolution);
  SET CONSTRAINTS assert_inventory_reversal_complete_613 IMMEDIATE;
END $verify$;
SELECT 'VERIFY613_PRIVATE_FOUNDATION_OK';
SELECT 'VERIFY613_RECEIPTS:'||jsonb_agg(to_jsonb(r) ORDER BY r.name)::text FROM verify613_receipts r;
SELECT 'VERIFY613_RESOLUTIONS:'||jsonb_agg(to_jsonb(r) ORDER BY r.name)::text FROM verify613_resolutions r;
ROLLBACK;
