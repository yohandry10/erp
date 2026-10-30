\set ON_ERROR_STOP on

-- Contrato de precisión antes de cualquier efecto; sin fixtures persistentes.
BEGIN;
DO $dispatch_precision570$
DECLARE bad jsonb;valid jsonb;rejected boolean;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'DISPATCH570_LOCAL_ONLY';END IF;
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,"1",0,-1,0.001,1.001,9.999,1000000000000]'::jsonb) LOOP
  rejected:=false;
  BEGIN PERFORM public.despachar_pedido_parcial_tx(gen_random_uuid(),gen_random_uuid(),'precision-570-invalid',jsonb_build_array(jsonb_build_object('detalle_id',gen_random_uuid(),'cantidad',bad)),NULL,gen_random_uuid());
  EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM<>'DISPATCH_QUANTITY_REQUIRES_POSITIVE_NUMBER_WITH_TWO_DECIMALS' THEN RAISE;END IF;rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'DISPATCH570_PRECISION_ACCEPTED:%',bad;END IF;
 END LOOP;
 FOR valid IN SELECT value FROM jsonb_array_elements('[0.01,1,1.23,999999999999.99]'::jsonb) LOOP
  rejected:=false;
  BEGIN PERFORM public.despachar_pedido_parcial_tx(gen_random_uuid(),gen_random_uuid(),'precision-570-valid',jsonb_build_array(jsonb_build_object('detalle_id',gen_random_uuid(),'cantidad',valid)),NULL,gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'El actor del despacho no pertenece al tenant o está inactivo' THEN RAISE;END IF;rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'DISPATCH570_ACTOR_GUARD_MISSING';END IF;
 END LOOP;
 RAISE NOTICE 'DISPATCH_PRECISION570 PASS: null/string/nonpositive/fraction/overflow denied; valid values reach actor guard';
END;$dispatch_precision570$;
ROLLBACK;

-- Reportes configurables: contrato del writer464 ampliado, fixtures aislados.
BEGIN;
CREATE FUNCTION pg_temp.fail_sales_report_audit_570() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.table_name='empresa_config' AND NEW.new_values->>'objetivo_otif'='13.37' THEN
  RAISE EXCEPTION 'FORCED_SALES_REPORT_AUDIT_FAILURE_570';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER verify_sales_report_audit_failure_570 BEFORE INSERT ON public.audit_log
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_sales_report_audit_570();
DO $sales_report_config570$
DECLARE t uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();denied uuid:=gen_random_uuid();foreign_actor uuid:=gen_random_uuid();
 old_protected jsonb;before_row jsonb;result jsonb;replay jsonb;bad jsonb;failed boolean;intent_count integer;event_count integer;audit_count integer;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'SALES_REPORT570_LOCAL_ONLY';END IF;
 -- El gate de preservación compara las demás ACL contra569, incluidos DML
 -- históricos del respaldo. No presupone que ese respaldo carezca de ellos.
 IF NOT has_table_privilege('service_role','public.pedido_despachos','SELECT') THEN RAISE EXCEPTION 'SALES_REPORT570_DISPATCH_READ_REQUIRED';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(t,'SR570-'||left(t::text,8),'Sales report verifier','PE','free',true,'ACTIVO'),(t2,'SRB570-'||left(t2::text,8),'Other report verifier','PE','free',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais,pais_id,moneda,moneda_defecto,razon_social,ruc,estado)
 VALUES(t,'PE',1,'PEN','PEN','Sales report verifier','20100070970','ACTIVO'),(t2,'PE',1,'PEN','PEN','Other report verifier','20100070970','ACTIVO') ON CONFLICT(tenant_id) DO NOTHING;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin)
 VALUES(actor,t,actor||'@sr570.test','Admin reports',true,'ACTIVO',true),(denied,t,denied||'@sr570.test','Denied reports',true,'ACTIVO',false),(foreign_actor,t2,foreign_actor||'@sr570.test','Other admin',true,'ACTIVO',true);
 SELECT to_jsonb(ec)-ARRAY['habilitar_dashboards_otif','habilitar_dashboards_sunat','objetivo_otif','frecuencia_actualizacion_dashboards','updated_at'] INTO old_protected FROM public.empresa_config ec WHERE tenant_id=t;
 result:=public.actualizar_empresa_config_tx(t,actor,'sr570-enable','EMPRESA',jsonb_build_object('habilitar_dashboards_otif',true,'habilitar_dashboards_sunat',false,'objetivo_otif',95.01,'frecuencia_actualizacion_dashboards',1));
 replay:=public.actualizar_empresa_config_tx(t,actor,'sr570-enable','EMPRESA',jsonb_build_object('habilitar_dashboards_otif',true,'habilitar_dashboards_sunat',false,'objetivo_otif',95.01,'frecuencia_actualizacion_dashboards',1));
 IF replay-'idempotent' IS DISTINCT FROM result-'idempotent' OR NOT (replay->>'idempotent')::boolean OR result#>>'{configuracion,habilitar_dashboards_otif}'<>'true' OR result#>>'{configuracion,habilitar_dashboards_sunat}'<>'false' OR (result#>>'{configuracion,objetivo_otif}')::numeric<>95.01 THEN RAISE EXCEPTION 'SALES_REPORT570_REPLAY_OR_MAPPING';END IF;
 PERFORM public.actualizar_empresa_config_tx(t,actor,'sr570-zero','EMPRESA','{"habilitar_dashboards_otif":false,"habilitar_dashboards_sunat":true,"objetivo_otif":0,"frecuencia_actualizacion_dashboards":86400}'::jsonb);
 SELECT to_jsonb(ec) INTO before_row FROM public.empresa_config ec WHERE tenant_id=t;
 IF (before_row->>'habilitar_dashboards_otif')::boolean OR (before_row->>'objetivo_otif')::numeric<>0 THEN RAISE EXCEPTION 'SALES_REPORT570_FALSE_ZERO';END IF;
 IF before_row-ARRAY['habilitar_dashboards_otif','habilitar_dashboards_sunat','objetivo_otif','frecuencia_actualizacion_dashboards','updated_at'] IS DISTINCT FROM old_protected THEN RAISE EXCEPTION 'SALES_REPORT570_PROTECTED_CHANGED';END IF;
 SELECT count(*) INTO intent_count FROM public.configuration_operation_intents WHERE tenant_id=t;
 SELECT count(*) INTO event_count FROM public.outbox_events WHERE tenant_id=t AND event_type='configuracion.empresa.actualizada';
 SELECT count(*) INTO audit_count FROM public.audit_log WHERE tenant_id=t AND table_name='empresa_config' AND operation='UPDATE';
 IF intent_count<>2 OR event_count<>2 OR audit_count<>2 THEN RAISE EXCEPTION 'SALES_REPORT570_DUPLICATE_SIDE_EFFECTS';END IF;
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"habilitar_dashboards_otif":"true"},{"habilitar_dashboards_sunat":null},{"objetivo_otif":-1},{"objetivo_otif":100.01},{"objetivo_otif":95.001},{"objetivo_otif":null},{"frecuencia_actualizacion_dashboards":0},{"frecuencia_actualizacion_dashboards":86401},{"frecuencia_actualizacion_dashboards":1.5},{"frecuencia_actualizacion_dashboards":"60"}]'::jsonb)
 LOOP
  failed:=false;BEGIN PERFORM public.actualizar_empresa_config_tx(t,actor,'sr570-bad-'||md5(bad::text),'EMPRESA',bad);EXCEPTION WHEN invalid_parameter_value THEN failed:=true;END;
  IF NOT failed THEN RAISE EXCEPTION 'SALES_REPORT570_INVALID_ACCEPTED:%',bad;END IF;
 END LOOP;
 failed:=false;BEGIN PERFORM public.actualizar_empresa_config_tx(t,denied,'sr570-denied','EMPRESA','{"habilitar_dashboards_otif":true}'::jsonb);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'SALES_REPORT570_PERMISSION_BYPASS';END IF;
 failed:=false;BEGIN PERFORM public.actualizar_empresa_config_tx(t,foreign_actor,'sr570-cross','EMPRESA','{"habilitar_dashboards_otif":true}'::jsonb);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'SALES_REPORT570_TENANT_BYPASS';END IF;
 failed:=false;BEGIN PERFORM public.actualizar_empresa_config_tx(t,actor,'sr570-enable','EMPRESA','{"objetivo_otif":50}'::jsonb);EXCEPTION WHEN unique_violation THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'SALES_REPORT570_KEY_BODY_CONFLICT';END IF;
 failed:=false;BEGIN PERFORM public.actualizar_empresa_config_tx(t,actor,'sr570-audit-fail','EMPRESA','{"objetivo_otif":13.37}'::jsonb);EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORCED_SALES_REPORT_AUDIT_FAILURE_570' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed OR before_row IS DISTINCT FROM (SELECT to_jsonb(ec) FROM public.empresa_config ec WHERE tenant_id=t)
 OR intent_count<>(SELECT count(*) FROM public.configuration_operation_intents WHERE tenant_id=t)
 OR event_count<>(SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='configuracion.empresa.actualizada')
 OR audit_count<>(SELECT count(*) FROM public.audit_log WHERE tenant_id=t AND table_name='empresa_config' AND operation='UPDATE') THEN RAISE EXCEPTION 'SALES_REPORT570_FAILED_WRITE_RESIDUE';END IF;
 IF has_function_privilege('anon','public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'SALES_REPORT570_WRITER_ACL';END IF;
 RAISE NOTICE 'SALES_REPORT_CONFIG570 PASS: true/false/zero/95.01, replay, protected fields, ten invalid values, RBAC/tenant, conflict, audit rollback, ACL';
END;$sales_report_config570$;
ROLLBACK;

-- Compras: entradas de más de dos decimales nunca dejan dinero calculado
-- sobre una cantidad distinta de la almacenada. Fixtures locales con rollback.
BEGIN;
DO $purchase_precision570$
DECLARE t uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();checker uuid:=gen_random_uuid();provider uuid;product uuid;warehouse uuid;
payload jsonb;bad jsonb;quote jsonb;ord jsonb;retry jsonb;before_quote jsonb;before_order jsonb;failed boolean;qty numeric;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_LOCAL_ONLY';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(t,'PQ570-'||left(t::text,8),'Purchase precision verifier','PE','free',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc) VALUES(t,'PE','PEN','Purchase precision verifier','20100070970') ON CONFLICT(tenant_id) DO NOTHING;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(actor,t,actor||'@pq570.test','Actor PQ570',true,'ACTIVO',true),(checker,t,checker||'@pq570.test','Checker PQ570',true,'ACTIVO',true);
 INSERT INTO public.proveedores(tenant_id,codigo,nombre,razon_social,ruc,estado,activo) VALUES(t,'PQ570','Proveedor','Proveedor PQ570','20123456786','ACTIVO',true) RETURNING id INTO provider;
 SELECT (public.crear_almacen_maestro_tx(t,actor,'pq570-almacen',jsonb_build_object('codigo','PQ570','nombre','Almacen PQ570','tipo','PRINCIPAL','estado','ACTIVO','es_principal',true,'sucursal_id',app.casa_matriz_de(t)))->>'id')::uuid INTO warehouse;
 SELECT (public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PQ570','nombre','Producto PQ570','categoria','VERIFY','unidad_medida','KGM','precio_venta',40,'precio_compra',24,'afectacion_igv','10','es_servicio',false,'controla_stock',true),warehouse,0,0,'[]'::jsonb)->>'id')::uuid INTO product;
 payload:=jsonb_build_object('numero','COT-PQ570','proveedor_id',provider,'fecha_cotizacion',app.hoy_tenant(t),'validez_dias',30,'detalles',jsonb_build_array(jsonb_build_object('producto_id',product,'descripcion','Producto PQ570','cantidad',0.12,'precio_unitario',24)));
 FOREACH qty IN ARRAY ARRAY[0.125,0.875,0.000001]::numeric[] LOOP
  bad:=jsonb_set(payload,'{detalles,0,cantidad}',to_jsonb(qty));failed:=false;
  BEGIN PERFORM public.crear_cotizacion_compra_tx(t,actor,'pq570-bad-'||qty,bad);EXCEPTION WHEN raise_exception THEN failed:=true;END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.cotizaciones_compra WHERE tenant_id=t) THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_CREATE_ROUNDED:%',qty;END IF;
 END LOOP;
 quote:=public.crear_cotizacion_compra_tx(t,actor,'pq570-quote',payload);
 IF (quote->>'total')::numeric<>3.40 OR (quote->'detalles'->0->>'cantidad')::numeric<>0.12 THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_EXACT:%',quote;END IF;
 before_quote:=app.purchase_quote_result_453((quote->>'id')::uuid,t);
 bad:=jsonb_set(payload,'{detalles,0,precio_unitario}','0.125');failed:=false;
 BEGIN PERFORM public.crear_cotizacion_compra_tx(t,actor,'pq570-bad-price',bad);EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR (SELECT count(*) FROM public.cotizaciones_compra WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_PRICE_ROUNDED';END IF;
 bad:=jsonb_build_object('detalles',jsonb_set(payload->'detalles','{0,cantidad}','0.125'));
 failed:=false;BEGIN PERFORM public.actualizar_cotizacion_compra_tx((quote->>'id')::uuid,t,actor,bad);EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR app.purchase_quote_result_453((quote->>'id')::uuid,t) IS DISTINCT FROM before_quote THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_UPDATE_PARTIAL';END IF;
 payload:=(payload-'fecha_cotizacion'-'validez_dias')||jsonb_build_object('numero','OC-PQ570','fecha_orden',app.hoy_tenant(t),'almacen_destino_id',warehouse,'condiciones_pago','CONTADO','dias_credito',0);
 bad:=jsonb_set(payload,'{detalles,0,cantidad}','0.125');failed:=false;
 BEGIN PERFORM public.crear_orden_compra_tx(t,actor,'pq570-bad-order',bad);EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.ordenes_compra WHERE tenant_id=t) THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_ORDER_ROUNDED';END IF;
 ord:=public.crear_orden_compra_tx(t,actor,'pq570-order',payload);before_order:=app.purchase_order_result_453((ord->>'id')::uuid,t);
 bad:=jsonb_set(payload,'{detalles,0,precio_unitario}','0.125');failed:=false;
 BEGIN PERFORM public.crear_orden_compra_tx(t,actor,'pq570-bad-order-price',bad);EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR (SELECT count(*) FROM public.ordenes_compra WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_ORDER_PRICE_ROUNDED';END IF;
 failed:=false;BEGIN PERFORM public.actualizar_orden_compra_tx((ord->>'id')::uuid,t,actor,jsonb_build_object('detalles',bad->'detalles'));EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR app.purchase_order_result_453((ord->>'id')::uuid,t) IS DISTINCT FROM before_order THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_ORDER_PRICE_UPDATE_PARTIAL';END IF;
 bad:=jsonb_set(payload,'{detalles,0,cantidad}','0.125');
 failed:=false;BEGIN PERFORM public.actualizar_orden_compra_tx((ord->>'id')::uuid,t,actor,jsonb_build_object('detalles',bad->'detalles'));EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR app.purchase_order_result_453((ord->>'id')::uuid,t) IS DISTINCT FROM before_order THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_ORDER_UPDATE_PARTIAL';END IF;
 PERFORM public.cambiar_estado_cotizacion_compra_tx((quote->>'id')::uuid,t,actor,'ENVIAR');
 PERFORM public.cambiar_estado_cotizacion_compra_tx((quote->>'id')::uuid,t,checker,'APROBAR');
 -- Emular sólo aquí un legado inconsistente, sin tocar operaciones UAT.
 UPDATE public.cotizacion_compra_detalles SET subtotal=3 WHERE cotizacion_id=(quote->>'id')::uuid AND tenant_id=t;
 failed:=false;BEGIN PERFORM public.convertir_cotizacion_compra_a_oc_tx((quote->>'id')::uuid,t,actor,'pq570-convert');EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed OR (SELECT orden_compra_id FROM public.cotizaciones_compra WHERE id=(quote->>'id')::uuid) IS NOT NULL OR (SELECT count(*) FROM public.ordenes_compra WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_LEGACY_CONVERTED';END IF;
 UPDATE public.cotizacion_compra_detalles SET subtotal=2.88 WHERE cotizacion_id=(quote->>'id')::uuid AND tenant_id=t;
 ord:=public.convertir_cotizacion_compra_a_oc_tx((quote->>'id')::uuid,t,actor,'pq570-convert');retry:=public.convertir_cotizacion_compra_a_oc_tx((quote->>'id')::uuid,t,actor,'pq570-convert');
 IF ord->>'id' IS DISTINCT FROM retry->>'id' OR NOT (retry->>'idempotent')::boolean OR (ord->>'total')::numeric<>3.40 OR (ord->'detalles'->0->>'cantidad')::numeric<>0.12 THEN RAISE EXCEPTION 'PURCHASE_PRECISION570_CONVERSION_RETRY:%',ord;END IF;
 RAISE NOTICE 'PURCHASE_PRECISION570 PASS: supported quantity, create/update quote/order rejected atomically, inconsistent legacy blocked, exact conversion/retry';
END $purchase_precision570$;
ROLLBACK;
BEGIN;
DO $verify$
DECLARE
 v_t uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
 v_actor uuid:=gen_random_uuid(); v_actor2 uuid:=gen_random_uuid();
 v_role uuid:=gen_random_uuid(); v_wh uuid; v_wh2 uuid; v_p uuid; v_usd uuid; v_zero uuid;
 v_branch uuid; v_main uuid; v_bank uuid; v_bank_account uuid:=gen_random_uuid(); v_recon uuid; v_replay uuid;
 v_employee uuid:=gen_random_uuid(); v_contract uuid:=gen_random_uuid();
 v_liq uuid; v_liq_second uuid; v_liq2 uuid; v_json jsonb; v_payload jsonb; v_result jsonb;
 v_gre uuid:=gen_random_uuid(); v_bad_gre uuid:=gen_random_uuid();
 v_total numeric; v_stock numeric; v_cost numeric; v_count integer; v_fn regprocedure;
 v_code text; v_accounts jsonb:='{}'; v_id uuid; v_system uuid; v_extract uuid;
 v_today date; v_until date; v_from date; v_period text;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_570_LOCAL_ONLY'; END IF;
 IF NOT has_table_privilege('service_role','public.pagos_facturas','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_570_SUPPLIER_PAYMENT_HISTORY_ACL';
 END IF;
 -- Las concesiones DML históricas varían entre fresh y restore: el gate de
 -- preservación compara ACL antes/después y rechaza toda ampliación excepto SELECT.
 IF NOT has_table_privilege('service_role','public.plantillas_asientos_detalle','SELECT')
  OR NOT has_table_privilege('service_role','public.plantillas_asientos_historial','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_570_TEMPLATE_BACKEND_READ_ACL';
 END IF;
 IF NOT has_table_privilege('service_role','public.depreciaciones','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_570_DEPRECIATION_BACKEND_READ_ACL';
 END IF;
 IF NOT has_table_privilege('service_role','public.knowledge_base','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_570_HELP_BACKEND_READ_ACL';
 END IF;
 FOREACH v_fn IN ARRAY ARRAY[
  'public.crear_almacen_maestro_tx(uuid,uuid,text,jsonb)'::regprocedure,
  'public.actualizar_almacen_maestro_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure,
  'public.registrar_serie_establecimiento_tx(uuid,uuid,uuid,text,text,text)'::regprocedure,
  'public.vincular_cxc_cpe_contado_tx_570(uuid,uuid,uuid,uuid,text)'::regprocedure,
  'public.cerrar_conciliacion_bancaria_tx(uuid,uuid,uuid,text)'::regprocedure] LOOP
  IF NOT has_function_privilege('service_role',v_fn,'EXECUTE')
   OR has_function_privilege('anon',v_fn,'EXECUTE') OR has_function_privilege('authenticated',v_fn,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=v_fn AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
   RAISE EXCEPTION 'VERIFY_570_WRITER_ACL %',v_fn;
  END IF;
 END LOOP;
 IF has_function_privilege('service_role','app.costo_inventario_base_570(uuid,uuid,numeric)','EXECUTE')
  OR has_function_privilege('authenticated','app.costo_promedio_movimiento_570()','EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY_570_COST_INTERNAL_EXPOSED';
 END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES
  (v_t,'V570-'||left(v_t::text,8),'Verificador 570','PE','free',true,'ACTIVO'),
  (v_other,'V570-O-'||left(v_other::text,8),'Otro 570','PE','free',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc)
 VALUES(v_t,'PE','PEN','Verificador 570','20100070970') ON CONFLICT(tenant_id) DO UPDATE SET pais='PE',moneda='PEN';
 IF (SELECT count(*) FROM public.plan_cuentas WHERE tenant_id=v_t AND codigo IN('50','10411','10412','6391') AND activo AND acepta_movimiento)<>4 THEN RAISE EXCEPTION 'VERIFY_570_TREASURY_ACCOUNTS_NOT_SEEDED'; END IF;
 PERFORM app.seed_peru_capital_account_570(v_t);
 IF (SELECT count(*) FROM public.plan_cuentas WHERE tenant_id=v_t AND codigo IN('50','10411','10412','6391'))<>4 THEN RAISE EXCEPTION 'VERIFY_570_TREASURY_ACCOUNTS_DUPLICATED'; END IF;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES
  (v_actor,v_t,v_actor||'@verify570.local','Calculador 570',true,'ACTIVO',true),
  (v_actor2,v_t,v_actor2||'@verify570.local','Segundo actor 570',true,'ACTIVO',true);
 INSERT INTO public.roles(id,tenant_id,nombre,activo,is_system_role) VALUES(v_role,v_t,'ADMIN',true,true);
 INSERT INTO public.user_roles(tenant_id,usuario_sistema_id,role_id) VALUES(v_t,v_actor,v_role),(v_t,v_actor2,v_role);
 v_main:=app.casa_matriz_de(v_t); IF v_main IS NULL THEN RAISE EXCEPTION 'VERIFY_570_MAIN_MISSING'; END IF;
 INSERT INTO public.sucursales(tenant_id,codigo,nombre,direccion,ubigeo,activo)
 VALUES(v_t,'0001','Anexo 570','Direccion de prueba','040101',true) RETURNING id INTO v_branch;
 v_json:=public.crear_almacen_maestro_tx(v_t,v_actor,'verify570-warehouse',jsonb_build_object('codigo','V570','nombre','Almacen 570','es_principal',true,'sucursal_id',v_branch));
 v_wh:=(v_json->>'id')::uuid;
 IF (SELECT sucursal_id FROM public.almacenes WHERE id=v_wh)<>v_branch THEN RAISE EXCEPTION 'VERIFY_570_BRANCH_NOT_STORED'; END IF;
 BEGIN
  PERFORM public.crear_almacen_maestro_tx(v_t,v_actor,'verify570-warehouse',jsonb_build_object('codigo','V570','nombre','Almacen 570','es_principal',true,'sucursal_id',v_main));
  RAISE EXCEPTION 'VERIFY_570_BRANCH_REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM public.actualizar_almacen_maestro_tx(v_other,v_actor,v_wh,'verify570-foreign',jsonb_build_object('nombre','Ajeno'));
  RAISE EXCEPTION 'VERIFY_570_FOREIGN_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'VERIFY_570_%' THEN RAISE; END IF; END;
 PERFORM public.crear_categoria_producto_maestro_tx(v_t,v_actor,'verify570-category',jsonb_build_object('codigo','CAT570','nombre','Categoria 570'));
 v_json:=public.crear_producto_maestro_tx(v_t,v_actor,'verify570-product',jsonb_build_object('codigo','V570-P','nombre','Promedio 570','categoria','CAT570','unidad_medida','NIU','precio_venta',3,'precio_compra',1,'stock_inicial',0,'almacen_id',v_wh));
 v_p:=(v_json->>'id')::uuid;
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'ENTRADA',100,'VERIFY570',gen_random_uuid(),NULL,NULL,NULL,NULL,v_actor::text,jsonb_build_object('costo_unitario',1),false);
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'ENTRADA',100,'VERIFY570',gen_random_uuid(),NULL,NULL,NULL,NULL,v_actor::text,jsonb_build_object('costo_unitario',1.01),false);
 SELECT costo_promedio_base INTO v_cost FROM public.productos WHERE id=v_p;
 IF v_cost<>1.005 THEN RAISE EXCEPTION 'VERIFY_570_AVERAGE_PRECISION %',v_cost; END IF;
 v_replay:=gen_random_uuid();
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'SALIDA',100,'VERIFY570',v_replay,NULL,NULL,NULL,NULL,v_actor::text,'{}',false);
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'SALIDA',100,'VERIFY570',v_replay,NULL,NULL,NULL,NULL,v_actor::text,'{}',false);
 SELECT sum(valor_firmado_base),sum(cantidad_firmada) INTO v_total,v_stock FROM public.vw_kardex_valorizado WHERE tenant_id=v_t AND producto_id=v_p;
 IF v_total<>100.5 OR v_stock<>100 OR (SELECT costo_promedio_base FROM public.productos WHERE id=v_p)<>1.005 THEN
  RAISE EXCEPTION 'VERIFY_570_COST_LEDGER_DIVERGED %, %',v_total,v_stock;
 END IF;
 BEGIN
  PERFORM public.actualizar_almacen_maestro_tx(v_t,v_actor,v_wh,'verify570-reassign',jsonb_build_object('sucursal_id',v_main));
  RAISE EXCEPTION 'VERIFY_570_HISTORY_REASSIGNED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_WAREHOUSE_BRANCH_LOCKED_BY_HISTORY' THEN RAISE; END IF; END;
 v_json:=public.crear_producto_maestro_tx(v_t,v_actor,'verify570-usd',jsonb_build_object('codigo','V570-USD','nombre','USD 570','categoria','CAT570','unidad_medida','NIU','precio_venta',10,'precio_compra',2,'stock_inicial',0,'almacen_id',v_wh));
 v_usd:=(v_json->>'id')::uuid;
 BEGIN
  PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_usd,v_wh,'ENTRADA',10,'VERIFY570',gen_random_uuid(),NULL,NULL,NULL,NULL,v_actor::text,jsonb_build_object('costo_unitario',2,'moneda','USD'),false);
  RAISE EXCEPTION 'VERIFY_570_PENDING_TC_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_VALUATION_REQUIRED' THEN RAISE; END IF; END;
 IF (SELECT stock_actual FROM public.productos WHERE id=v_usd)<>0 OR EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE producto_id=v_usd) THEN
  RAISE EXCEPTION 'VERIFY_570_PENDING_LEFT_RESIDUE'; END IF;
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_usd,v_wh,'ENTRADA',10,'VERIFY570',gen_random_uuid(),NULL,NULL,NULL,NULL,v_actor::text,jsonb_build_object('costo_unitario',2,'moneda','USD','tipo_cambio',3.8),false);
 IF (SELECT costo_promedio_base FROM public.productos WHERE id=v_usd)<>7.6 THEN RAISE EXCEPTION 'VERIFY_570_CURRENCY_MIXED'; END IF;
 v_json:=public.crear_producto_maestro_tx(v_t,v_actor,'verify570-zero',jsonb_build_object('codigo','V570-Z','nombre','Cero confirmado','categoria','CAT570','unidad_medida','NIU','precio_venta',3,'precio_compra',9,'stock_inicial',0,'almacen_id',v_wh));
 v_zero:=(v_json->>'id')::uuid;
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_zero,v_wh,'ENTRADA',2,'VERIFY570',gen_random_uuid(),NULL,NULL,NULL,NULL,v_actor::text,jsonb_build_object('costo_unitario',0,'costo_cero_confirmado',true),false);
 PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_zero,v_wh,'SALIDA',1,'VERIFY570',gen_random_uuid(),NULL,NULL,NULL,NULL,v_actor::text,'{}',false);
 IF (SELECT costo_promedio_base FROM public.productos WHERE id=v_zero)<>0 OR (SELECT sum(valor_firmado_base) FROM public.vw_kardex_valorizado WHERE producto_id=v_zero)<>0 THEN RAISE EXCEPTION 'VERIFY_570_ZERO_REPLACED'; END IF;

 v_json:=public.crear_almacen_maestro_tx(v_t,v_actor,'verify570-warehouse2',jsonb_build_object('codigo','V570-2','nombre','Almacen destino','sucursal_id',v_main));
 v_wh2:=(v_json->>'id')::uuid;
 v_payload:=jsonb_build_object('producto_id',v_p,'almacen_origen_id',v_wh,'almacen_destino_id',v_wh2,'cantidad',100,'motivo','Traslado completo');
 -- Identidad, estado y establecimientos se validan antes de tocar existencias.
 INSERT INTO public.gre_guias(id,tenant_id,numero,estado,motivo,datos_adicionales) VALUES
  (v_bad_gre,v_other,'V570-FOREIGN','FIRMADO','TRASLADO_ENTRE_ESTABLECIMIENTOS',jsonb_build_object('partidaSucursalId',v_branch,'llegadaSucursalId',v_main)),
  (v_gre,v_t,'V570-OWN','BORRADOR','TRASLADO_ENTRE_ESTABLECIMIENTOS',jsonb_build_object('partidaSucursalId',v_branch,'llegadaSucursalId',v_main));
 BEGIN
  PERFORM public.transferir_inventario_tx(v_t,v_payload||jsonb_build_object('guia_remision_id',v_bad_gre),v_actor,'verify570-gre-foreign');
  RAISE EXCEPTION 'VERIFY_570_FOREIGN_GRE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_TRANSFER_GRE_INVALID' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.transferir_inventario_tx(v_t,v_payload||jsonb_build_object('guia_remision_id',v_gre),v_actor,'verify570-gre-draft');
  RAISE EXCEPTION 'VERIFY_570_DRAFT_GRE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_TRANSFER_GRE_INVALID' THEN RAISE; END IF; END;
 PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
 UPDATE public.gre_guias SET estado='FIRMADO',datos_adicionales=jsonb_build_object('partidaSucursalId',v_main,'llegadaSucursalId',v_branch) WHERE id=v_gre;
 BEGIN
  PERFORM public.transferir_inventario_tx(v_t,v_payload||jsonb_build_object('guia_remision_id',v_gre),v_actor,'verify570-gre-reversed');
  RAISE EXCEPTION 'VERIFY_570_REVERSED_GRE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_TRANSFER_GRE_INVALID' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.operaciones_inventario WHERE tenant_id=v_t AND idempotency_key LIKE 'verify570-gre-%')
  OR (SELECT stock_actual FROM public.producto_existencias WHERE producto_id=v_p AND almacen_id=v_wh)<>100 THEN RAISE EXCEPTION 'VERIFY_570_GRE_REJECTION_LEFT_RESIDUE'; END IF;
 UPDATE public.gre_guias SET datos_adicionales=jsonb_build_object('partidaSucursalId',v_branch,'llegadaSucursalId',v_main) WHERE id=v_gre;
 INSERT INTO public.gre_detalles(tenant_id,gre_id,producto_id,descripcion,cantidad,unidad_medida)
 VALUES(v_t,v_gre,v_p,'Promedio 570',100,'NIU');
 BEGIN
  PERFORM public.transferir_inventario_tx(v_t,v_payload||jsonb_build_object('guia_remision_id',v_gre,'producto_id',v_zero,'cantidad',1),v_actor,'verify570-gre-product');
  RAISE EXCEPTION 'VERIFY_570_GRE_OTHER_PRODUCT_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_TRANSFER_GRE_PRODUCT_MISMATCH' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.transferir_inventario_tx(v_t,v_payload||jsonb_build_object('guia_remision_id',v_gre,'cantidad',101),v_actor,'verify570-gre-excess');
  RAISE EXCEPTION 'VERIFY_570_GRE_EXCESS_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_TRANSFER_GRE_QUANTITY_EXCEEDED' THEN RAISE; END IF; END;
 v_payload:=v_payload||jsonb_build_object('guia_remision_id',v_gre);
 v_json:=public.transferir_inventario_tx(v_t,v_payload,v_actor,'verify570-transfer');
 v_json:=public.transferir_inventario_tx(v_t,v_payload,v_actor,'verify570-transfer');
 IF NOT (v_json->>'idempotent')::boolean OR (SELECT costo_promedio_base FROM public.productos WHERE id=v_p)<>1.005
  OR (SELECT sum(valor_firmado_base) FROM public.vw_kardex_valorizado WHERE producto_id=v_p)<>100.5
  OR (SELECT stock_actual FROM public.producto_existencias WHERE producto_id=v_p AND almacen_id=v_wh2)<>100 THEN RAISE EXCEPTION 'VERIFY_570_FULL_TRANSFER_LOST_COST'; END IF;
 BEGIN
  PERFORM public.transferir_inventario_tx(v_t,v_payload||jsonb_build_object('cantidad',1),v_actor,'verify570-gre-reused');
  RAISE EXCEPTION 'VERIFY_570_GRE_CAPACITY_REUSED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_TRANSFER_GRE_QUANTITY_EXCEEDED' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id=v_t AND metadata->'traslado_entre_establecimientos'->>'guia_remision_id'=v_gre::text)<>2
    OR (SELECT count(*) FROM public.operaciones_inventario WHERE tenant_id=v_t AND idempotency_key LIKE 'verify570-gre-%')<>0 THEN
   RAISE EXCEPTION 'VERIFY_570_GRE_INVALID_TRANSFER_LEFT_RESIDUE';
 END IF;

 -- Guardía temporal: incluso sin extracto el mes actual se rechaza antes de
 -- cualquier cambio, y un mes terminado sigue alcanzando el writer vigente.
 v_today:=app.hoy_tenant(v_t); v_from:=date_trunc('month',v_today)::date; v_until:=(v_from+interval '1 month'-interval '1 day')::date;
 INSERT INTO public.plan_cuentas(id,tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES(v_bank_account,v_t,'104570','Banco570','ACTIVO','ACTIVO',6,true,true,'ACTIVO');
 INSERT INTO public.cuentas_bancarias(tenant_id,nombre,codigo,banco,numero_cuenta,tipo_cuenta,moneda,estado,activa,activo,saldo,saldo_actual,saldo_contable,created_by,updated_by,cuenta_contable_id)
 VALUES(v_t,'Banco 570','BANK570','Prueba','570-1','CORRIENTE','PEN','ACTIVO',true,true,0,0,0,v_actor,v_actor,v_bank_account) RETURNING id INTO v_bank;
 v_json:=public.crear_conciliacion_bancaria_tx(v_t,jsonb_build_object('cuenta_bancaria_id',v_bank,'periodo',to_char(v_from,'YYYY-MM'),'fecha_desde',v_from,'fecha_hasta',v_until),v_actor,'verify570-recon-current');
 v_recon:=(v_json->'conciliacion'->>'id')::uuid;
 BEGIN
  PERFORM public.cerrar_conciliacion_bancaria_tx(v_t,v_recon,v_actor,'verify570-close-current');
  RAISE EXCEPTION 'VERIFY_570_CURRENT_MONTH_CLOSED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'BANK_RECONCILIATION_PERIOD_NOT_ENDED' THEN RAISE; END IF; END;
 IF (SELECT upper(estado::text) FROM public.conciliaciones_bancarias WHERE id=v_recon)='CERRADA' THEN RAISE EXCEPTION 'VERIFY_570_RECON_CLOSE_RESIDUE'; END IF;

 -- Mes terminado: movimiento → extracto → match → cierre y replay.
 v_until:=v_from-1;v_from:=date_trunc('month',v_until)::date;
 SELECT id INTO v_id FROM public.plan_cuentas WHERE tenant_id=v_t AND codigo='50';
 v_json:=public.registrar_movimiento_bancario_tx(v_t,jsonb_build_object('cuenta_bancaria_id',v_bank,'cuenta_contrapartida_id',v_id,'tipo','ABONO','monto',10,'moneda','PEN','fecha',v_from,'descripcion','Deposito570','referencia','MATCH570','categoria','OTRO_INGRESO'),v_actor,'verify570-bank-deposit');
 v_system:=(v_json->>'movimiento_id')::uuid;
 v_json:=public.crear_conciliacion_bancaria_tx(v_t,jsonb_build_object('cuenta_bancaria_id',v_bank,'periodo',to_char(v_from,'YYYY-MM'),'fecha_desde',v_from,'fecha_hasta',v_until),v_actor,'verify570-recon-past');
 v_recon:=(v_json->'conciliacion'->>'id')::uuid;
 PERFORM public.importar_extracto_bancario_tx(v_t,v_recon,jsonb_build_object('banco','GENERICO','saldo_banco_inicial',0,'saldo_banco_final',10,'movimientos',jsonb_build_array(jsonb_build_object('fecha',v_from,'tipo','ABONO','monto',10,'descripcion','Deposito570','referencia','MATCH570'))),v_actor,'verify570-statement');
 SELECT id INTO v_extract FROM public.movimientos_bancarios WHERE tenant_id=v_t AND conciliacion_id=v_recon AND es_extracto;
 PERFORM public.conciliar_movimiento_bancario_v2_tx(v_t,v_recon,v_system,v_extract,v_actor,'verify570-match');
 v_json:=public.cerrar_conciliacion_bancaria_tx(v_t,v_recon,v_actor,'verify570-close-past');
 IF v_json->'conciliacion'->>'estado'<>'CERRADA' OR (v_json->'conciliacion'->>'saldo_libro')::numeric<>10 THEN RAISE EXCEPTION 'VERIFY_570_PAST_CLOSE_FAILED'; END IF;
 v_json:=public.cerrar_conciliacion_bancaria_tx(v_t,v_recon,v_actor,'verify570-close-past');
 IF NOT (v_json->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_570_PAST_CLOSE_REPLAY'; END IF;

 -- Reporte real sobre asiento confirmado: clase4deudor, 3no33, pasivo45 y
 -- contraactivo39 quedan visibles; un inventario acreedor conserva su signo.
 FOREACH v_code IN ARRAY ARRAY['13','22','34','39','45','50'] LOOP
  INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado)
  SELECT v_t,v_code,'Verify570 '||v_code,CASE WHEN v_code='50' THEN 'PATRIMONIO' WHEN v_code='45' THEN 'PASIVO' ELSE 'ACTIVO' END,CASE WHEN v_code='50' THEN 'PATRIMONIO' WHEN v_code='45' THEN 'PASIVO' ELSE 'ACTIVO' END,2,true,true,'ACTIVO' WHERE NOT EXISTS(SELECT 1 FROM public.plan_cuentas pc WHERE pc.tenant_id=v_t AND pc.codigo=v_code);
  SELECT id INTO v_id FROM public.plan_cuentas WHERE tenant_id=v_t AND codigo=v_code;
  v_accounts:=v_accounts||jsonb_build_object(v_code,v_id);
 END LOOP;
 PERFORM public.crear_asiento_con_detalles_tx(v_t,jsonb_build_object('fecha','2026-01-10T12:00:00Z','concepto','Balance570','estado','CONFIRMADO','source_event_id',gen_random_uuid(),'created_by',v_actor,'confirmado_por',v_actor),jsonb_build_array(
  jsonb_build_object('cuenta_id',v_accounts->>'13','debe',50,'haber',0),
  jsonb_build_object('cuenta_id',v_accounts->>'22','debe',80,'haber',0),
  jsonb_build_object('cuenta_id',v_accounts->>'34','debe',20,'haber',0),
  jsonb_build_object('cuenta_id',v_accounts->>'39','debe',0,'haber',10),
  jsonb_build_object('cuenta_id',v_accounts->>'45','debe',0,'haber',60),
  jsonb_build_object('cuenta_id',v_accounts->>'50','debe',0,'haber',80)));
 v_json:=public.balance_general_live(v_t,2026,1);
 IF (v_json->>'otros_activos_corrientes')::numeric<>50 OR (v_json->>'inventarios')::numeric<>80 OR (v_json->>'otros_activos_no_corrientes')::numeric<>20 OR (v_json->>'depreciacion_acumulada')::numeric<>10 OR (v_json->>'deudas_largo_plazo')::numeric<>60 OR (v_json->>'capital')::numeric<>80 THEN RAISE EXCEPTION 'VERIFY_570_BALANCE_OMITTED_BALANCE'; END IF;
 PERFORM public.crear_asiento_con_detalles_tx(v_t,jsonb_build_object('fecha','2026-02-10T12:00:00Z','concepto','Signo570','estado','CONFIRMADO','source_event_id',gen_random_uuid(),'created_by',v_actor,'confirmado_por',v_actor),jsonb_build_array(jsonb_build_object('cuenta_id',v_accounts->>'13','debe',100,'haber',0),jsonb_build_object('cuenta_id',v_accounts->>'22','debe',0,'haber',100)));
 v_json:=public.balance_general_live(v_t,2026,2);
 IF (v_json->>'inventarios')::numeric<>-20 OR (v_json->>'otros_activos_corrientes')::numeric<>150 THEN RAISE EXCEPTION 'VERIFY_570_BALANCE_NEGATIVE_HIDDEN'; END IF;

 INSERT INTO public.empleados(id,tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
 VALUES(v_employee,v_t,'Empleado 570','Empleado','570','EMP570','DNI','57000001','activo',true,'2026-01-01','PE');
 INSERT INTO public.contratos(id,tenant_id,id_empleado,empleado_id,tipo_contrato,fecha_inicio,estado,activo,sueldo_bruto,salario,moneda,regimen_pensionario,jornada_laboral)
 VALUES(v_contract,v_t,v_employee,v_employee,'indefinido','2026-01-01','vigente',true,1500,1500,'PEN','ONP','tiempo_completo');
 v_payload:=jsonb_build_object('id_empleado',v_employee,'motivo_terminacion','renuncia','fecha_terminacion','2026-10-05','monto_cts',100,'vacaciones_pendientes',0,'indemnizacion',0,'dias_cts',30,'total_liquidacion',100,'pais_codigo','PE','moneda','PEN');
 v_json:=public.guardar_liquidacion_calculada_tx(v_t,v_payload,v_actor); v_liq:=(v_json->'data'->>'id')::uuid;
 v_json:=public.guardar_liquidacion_calculada_tx(v_t,v_payload||jsonb_build_object('total_liquidacion',110),v_actor); v_liq2:=(v_json->'data'->>'id')::uuid;
 IF v_liq=v_liq2 OR (SELECT estado FROM public.liquidaciones WHERE id=v_liq)<>'anulada'
  OR (SELECT metadata->>'anulada_por_recalculo' FROM public.liquidaciones WHERE id=v_liq)<>v_actor::text THEN RAISE EXCEPTION 'VERIFY_570_RECALC_NOT_TRACED'; END IF;
 v_json:=public.guardar_liquidacion_calculada_tx(v_t,v_payload||jsonb_build_object('total_liquidacion',110),v_actor);
 IF NOT (v_json->>'idempotent')::boolean OR v_json->'data'->>'id'<>v_liq2::text THEN RAISE EXCEPTION 'VERIFY_570_RECALC_REPLAY_DUPLICATED'; END IF;
 BEGIN
  PERFORM public.guardar_liquidacion_calculada_tx(v_t,v_payload||jsonb_build_object('total_liquidacion',120),v_actor2);
  RAISE EXCEPTION 'VERIFY_570_RECALC_OTHER_ACTOR_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.liquidaciones WHERE tenant_id=v_t AND estado='calculada')<>1 THEN RAISE EXCEPTION 'VERIFY_570_RECALC_RESIDUE'; END IF;
 -- Un fallo posterior al anulado revierte también el borrador anterior.
 EXECUTE $ddl$CREATE FUNCTION pg_temp.verify_570_liq_failure() RETURNS trigger LANGUAGE plpgsql AS $body$BEGIN IF current_setting('app.verify_570_liq_fail',true)='on' THEN RAISE EXCEPTION 'VERIFY_570_LIQ_INSERT_FAILURE'; END IF; RETURN NEW; END;$body$ $ddl$;
 EXECUTE 'CREATE TRIGGER verify_570_liq_failure BEFORE INSERT ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION pg_temp.verify_570_liq_failure()';
 PERFORM set_config('app.verify_570_liq_fail','on',true);
 BEGIN
  PERFORM public.guardar_liquidacion_calculada_tx(v_t,v_payload||jsonb_build_object('total_liquidacion',130),v_actor);
  RAISE EXCEPTION 'VERIFY_570_RECALC_FAILURE_NOT_INJECTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'VERIFY_570_LIQ_INSERT_FAILURE' THEN RAISE; END IF; END;
 PERFORM set_config('app.verify_570_liq_fail','off',true);
 IF (SELECT estado FROM public.liquidaciones WHERE id=v_liq2)<>'calculada' THEN RAISE EXCEPTION 'VERIFY_570_RECALC_FAILURE_ANNULLED_OLD'; END IF;
 BEGIN
  PERFORM public.confirmar_liquidacion_tx(v_t,v_liq2,v_actor);
  RAISE EXCEPTION 'VERIFY_570_MAKER_APPROVED_OWN_CALC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 v_json:=public.guardar_liquidacion_calculada_tx(v_t,v_payload||jsonb_build_object('fecha_terminacion','2026-10-20'),v_actor);
 v_liq_second:=(v_json->'data'->>'id')::uuid;
 PERFORM public.confirmar_liquidacion_tx(v_t,v_liq2,v_actor2);
 BEGIN
  PERFORM public.confirmar_liquidacion_tx(v_t,v_liq_second,v_actor2);
  RAISE EXCEPTION 'VERIFY_570_SECOND_CESE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'RRHH_LIQUIDACION_CONTRACT_SNAPSHOT_REQUIRED' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_t AND event_type='liquidacion.confirmada')>1 THEN RAISE EXCEPTION 'VERIFY_570_SECOND_CESE_EMITTED'; END IF;
 INSERT INTO public.contratos(tenant_id,id_empleado,empleado_id,tipo_contrato,fecha_inicio,estado,activo,sueldo_bruto,salario,moneda,regimen_pensionario,jornada_laboral)
 VALUES(v_t,v_employee,v_employee,'indefinido','2026-10-10','vigente',true,1500,1500,'PEN','ONP','tiempo_completo');
 BEGIN
  PERFORM public.confirmar_liquidacion_tx(v_t,v_liq_second,v_actor2);
  RAISE EXCEPTION 'VERIFY_570_OLD_DRAFT_CLOSED_NEW_CONTRACT';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'RRHH_LIQUIDACION_CONTRACT_SNAPSHOT_REQUIRED' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.contratos WHERE tenant_id=v_t AND estado='vigente')<>1 THEN RAISE EXCEPTION 'VERIFY_570_REHIRE_CONTRACT_CHANGED'; END IF;

END $verify$;
ROLLBACK;

-- RCE + NC recibida para devolución: real SQL y rollback independiente.
\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 450 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_rce jsonb;
  v_fiscal_row public.cuentas_por_pagar;
  v_original jsonb;
  v_rejected boolean;
  v_final_return jsonb;
  v_nc_payload jsonb;
  v_nc jsonb;
  v_outbox_count bigint;
  v_tenant uuid;
  v_actor uuid;
  v_tenant_ajeno uuid;
  v_actor_ajeno uuid;
  v_proveedor uuid;
  v_almacen uuid;
  v_producto uuid;
  v_servicio uuid;
  v_no_stock uuid;
  v_orden uuid;
  v_det_1 uuid;
  v_det_2 uuid;
  v_det_3 uuid;
  v_det_serv uuid;
  v_det_no_stock uuid;
  v_recepcion jsonb;
  v_recepcion_id uuid;
  v_ri_1 uuid;
  v_ri_2 uuid;
  v_ri_3 uuid;
  v_ri_serv uuid;
  v_ri_no_stock uuid;
  v_cxp jsonb;
  v_devolucion jsonb;
  v_devolucion_id uuid;
  v_retry jsonb;
  v_pendiente jsonb;
  v_pendiente_id uuid;
  v_key text;
  v_stock numeric;
  v_count bigint;
  v_saldo numeric;
  v_total numeric;
  v_event_payload jsonb;
  v_fake_event uuid := gen_random_uuid();
  v_orden_sin_cxp uuid;
  v_det_sin_cxp uuid;
  v_recepcion_sin_cxp jsonb;
  v_recepcion_sin_cxp_id uuid;
  v_ri_sin_cxp uuid;
  v_dev_sin_cxp jsonb;
  v_dev_sin_cxp_id uuid;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localreturnverifyxxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY SUPPLIER RETURN 450', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY SUPPLIER RETURN FOREIGN 450', 1, 'PE') INTO v_demo;
  v_tenant_ajeno := (v_demo->>'tenant_id')::uuid;
  v_actor_ajeno := (v_demo->>'user_id')::uuid;

  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'PROV-450', 'Proveedor 450', 'Proveedor 450',
    '20123456780', 'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_proveedor;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-450', 'Almacén 450', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen;

  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'PROD-450', 'nombre', 'Producto 450', 'categoria', 'VERIFY',
    'precio_venta', 70, 'precio_compra', 50, 'afectacion_igv', '10',
    'es_servicio', false, 'controla_stock', true
  ), v_almacen, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_producto;
  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'SERV-450', 'nombre', 'Servicio 450', 'categoria', 'VERIFY',
    'precio_venta', 100, 'precio_compra', 100, 'afectacion_igv', '10',
    'es_servicio', true, 'controla_stock', false
  ), NULL, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_servicio;
  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'NOSTOCK-450', 'nombre', 'No stock 450', 'categoria', 'VERIFY',
    'precio_venta', 30, 'precio_compra', 30, 'afectacion_igv', '10',
    'es_servicio', false, 'controla_stock', false
  ), NULL, 0, 0, '[]'::jsonb)->>'id')::uuid INTO v_no_stock;

  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'OC-VERIFY-450', 'OC-VERIFY-450', v_proveedor,
    current_date, current_date, 'APROBADA', true, 'PEN',
    280, 50.40, 330.40, 'CREDITO', 30
  ) RETURNING id INTO v_orden;

  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES
    (v_tenant, v_orden, v_producto, 'Producto 450 línea 1', 1, 0, 1, 50, 50),
    (v_tenant, v_orden, v_producto, 'Producto 450 línea 2', 1, 0, 1, 50, 50),
    (v_tenant, v_orden, v_producto, 'Producto 450 línea 3', 1, 0, 1, 50, 50),
    (v_tenant, v_orden, v_servicio, 'Servicio 450', 1, 0, 1, 100, 100),
    (v_tenant, v_orden, v_no_stock, 'No stock 450', 1, 0, 1, 30, 30);
  SELECT id INTO v_det_1 FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Producto 450 línea 1';
  SELECT id INTO v_det_2 FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Producto 450 línea 2';
  SELECT id INTO v_det_3 FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Producto 450 línea 3';
  SELECT id INTO v_det_serv FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='Servicio 450';
  SELECT id INTO v_det_no_stock FROM public.orden_compra_detalles WHERE orden_id=v_orden AND descripcion='No stock 450';

  SELECT public.crear_recepcion_tx(
    v_tenant, v_orden,
    jsonb_build_array(
      jsonb_build_object('detalle_id',v_det_1,'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen),
      jsonb_build_object('detalle_id',v_det_2,'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen),
      jsonb_build_object('detalle_id',v_det_3,'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen),
      jsonb_build_object('detalle_id',v_det_serv,'cantidad_recibida',1,'calidad','OK'),
      jsonb_build_object('detalle_id',v_det_no_stock,'cantidad_recibida',1,'calidad','OK')
    ), 'Recepción 450', v_actor, 'verify:receipt:450'
  ) INTO v_recepcion;
  v_recepcion_id := (v_recepcion->>'id')::uuid;
  SELECT id INTO v_ri_1 FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_1;
  SELECT id INTO v_ri_2 FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_2;
  SELECT id INTO v_ri_3 FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_3;
  SELECT id INTO v_ri_serv FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_serv;
  SELECT id INTO v_ri_no_stock FROM public.recepcion_items WHERE recepcion_id=v_recepcion_id AND detalle_id=v_det_no_stock;
  PERFORM public.cerrar_recepcion_tx(v_recepcion_id, v_tenant, v_actor::text, 'Cierre 450');

  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  IF v_stock <> 3 THEN RAISE EXCEPTION 'VERIFY_450_RECEIPT_STOCK_EXPECTED_3 got %', v_stock; END IF;

  SELECT public.crear_factura_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'proveedor_id',v_proveedor,'orden_id',v_orden,'recepcion_id',v_recepcion_id,
      'numero','FP-450','numero_documento','F001-450','fecha_emision',current_date,
      'fecha_vencimiento',current_date+30,'condiciones_pago','CREDITO','dias_credito',30,
      'subtotal',280,'igv',50.40,'total',330.40,'saldo',330.40,'moneda','PEN',
      'tipo_documento','FACTURA','referencia_tipo','RECEPCION','referencia_id',v_recepcion_id,
      'fiscal_metadata','{}'::jsonb,'estado','PENDIENTE','estado_comparacion','OK',
      'created_by',v_actor
    ), gen_random_uuid(), 'verify:cxp:450'
  ) INTO v_cxp;

  v_key := 'verify:return:450';
  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'recepcion_id',v_recepcion_id,'orden_id',v_orden,'proveedor_id',v_proveedor,
      'motivo','DEFECTO','observaciones','Verify 450',
      'items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_1,'producto_id',v_producto,'descripcion','Línea 1','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen),
        jsonb_build_object('recepcion_item_id',v_ri_2,'producto_id',v_producto,'descripcion','Línea 2','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen),
        jsonb_build_object('recepcion_item_id',v_ri_serv,'producto_id',v_servicio,'descripcion','Servicio','cantidad',1,'precio_unitario',100),
        jsonb_build_object('recepcion_item_id',v_ri_no_stock,'producto_id',v_no_stock,'descripcion','No stock','cantidad',1,'precio_unitario',30)
      )
    ), v_actor, v_key
  ) INTO v_devolucion;
  v_devolucion_id := (v_devolucion->>'id')::uuid;
  IF (v_devolucion->>'subtotal')::numeric <> 230 OR (v_devolucion->>'total')::numeric <> 271.40 THEN
    RAISE EXCEPTION 'VERIFY_450_CREATE_TOTALS_INVALID %', v_devolucion;
  END IF;

  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object(
      'recepcion_id',v_recepcion_id,'orden_id',v_orden,'proveedor_id',v_proveedor,
      'motivo','DEFECTO','observaciones','Verify 450',
      'items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_no_stock,'producto_id',v_no_stock,'descripcion','No stock','cantidad',1,'precio_unitario',30),
        jsonb_build_object('recepcion_item_id',v_ri_serv,'producto_id',v_servicio,'descripcion','Servicio','cantidad',1,'precio_unitario',100),
        jsonb_build_object('recepcion_item_id',v_ri_2,'producto_id',v_producto,'descripcion','Línea 2','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen),
        jsonb_build_object('recepcion_item_id',v_ri_1,'producto_id',v_producto,'descripcion','Línea 1','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen)
      )
    ), v_actor, v_key
  ) INTO v_retry;
  IF (v_retry->>'id')::uuid <> v_devolucion_id OR (v_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_450_CREATE_RETRY_FAILED %', v_retry;
  END IF;

  BEGIN
    PERFORM public.crear_devolucion_proveedor_tx(
      v_tenant,
      jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
        'proveedor_id',v_proveedor,'motivo','OTRO','items',jsonb_build_array(
          jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
            'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
      v_actor, v_key);
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_IDEMPOTENCY_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT public.emitir_devolucion_proveedor_tx(v_devolucion_id,v_tenant,v_actor) INTO v_devolucion;
  IF v_devolucion->>'estado' <> 'EMITIDA' OR jsonb_array_length(v_devolucion->'movimientos') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_450_EMIT_RESULT_INVALID %', v_devolucion;
  END IF;
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  IF v_stock <> 1 THEN RAISE EXCEPTION 'VERIFY_450_STOCK_EXPECTED_1 got %', v_stock; END IF;
  SELECT total,saldo INTO v_total,v_saldo FROM public.cuentas_por_pagar
  WHERE id=(v_cxp->>'id')::uuid;
  IF v_total <> 59 OR v_saldo <> 59 THEN
    RAISE EXCEPTION 'VERIFY_450_CXP_EXPECTED_59 total=% saldo=%',v_total,v_saldo;
  END IF;
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}'::jsonb);
  IF (v_rce->'totals'->>'base')::numeric<>280
    OR (v_rce->'totals'->>'igv')::numeric<>50.40
    OR (v_rce->'totals'->>'total')::numeric<>330.40
    OR (v_rce->>'total_registros')::integer<>1 THEN
    RAISE EXCEPTION 'VERIFY_570_RCE_INVOICE_WAS_REDUCED_BY_RETURN';
  END IF;
  SELECT * INTO STRICT v_fiscal_row FROM public.cuentas_por_pagar WHERE id=(v_cxp->>'id')::uuid;
  IF (v_fiscal_row.original_fiscal_amounts->>'total')::numeric<>330.40 THEN
    RAISE EXCEPTION 'VERIFY_570_RCE_MISSING_IMMUTABLE_ORIGINAL';
  END IF;
  -- Resolver legacy acepta únicamente el evento original y la cadena completa.
  v_fiscal_row.original_fiscal_amounts:=NULL;
  v_original:=app.cxp_original_fiscal_amounts_570(v_fiscal_row);
  IF (v_original->>'subtotal')::numeric<>280 OR (v_original->>'total')::numeric<>330.40 THEN
    RAISE EXCEPTION 'VERIFY_570_RCE_LEGACY_ORIGINAL_NOT_VERIFIED';
  END IF;
  v_rejected:=false;
  v_fiscal_row.subtotal:=v_fiscal_row.subtotal+1;
  BEGIN
    PERFORM app.cxp_original_fiscal_amounts_570(v_fiscal_row);
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_570_RCE_LEGACY_INCONSISTENCY_ACCEPTED'; END IF;
  v_rejected:=false;
  BEGIN
    UPDATE public.cuentas_por_pagar SET original_fiscal_amounts='{}'::jsonb
    WHERE id=(v_cxp->>'id')::uuid;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='CXP_ORIGINAL_FISCAL_AMOUNTS_READ_ONLY' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_570_RCE_ORIGINAL_MUTABLE'; END IF;
  SELECT count(*) INTO v_outbox_count FROM public.outbox_events WHERE tenant_id=v_tenant;
  v_nc_payload:=jsonb_build_object('proveedor_id',v_proveedor,'tipo_documento','NOTA_CREDITO',
    'numero_documento','FC01-570','serie','FC01','fecha_emision',current_date,
    'subtotal',230,'igv',41.40,'total',271.40,'moneda','PEN','tipo_cambio',1,
    'documento_referencia_tipo','FACTURA','documento_referencia_serie','F001',
    'documento_referencia_numero','450','documento_referencia_fecha',current_date);
  v_nc:=public.registrar_nota_credito_proveedor_devolucion_tx(
    v_tenant,v_actor,v_devolucion_id,v_nc_payload,'verify:nc-return:570');
  IF (v_nc->>'saldo')::numeric<>0 OR (v_nc->'metadata'->>'registro_fiscal_sin_obligacion')::boolean IS NOT TRUE
    OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_cxp->>'id')::uuid)<>59
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant)<>v_outbox_count THEN
    RAISE EXCEPTION 'VERIFY_570_SUPPLIER_NC_DUPLICATES_DEBT_OR_ACCOUNTING';
  END IF;
  v_retry:=public.registrar_nota_credito_proveedor_devolucion_tx(
    v_tenant,v_actor,v_devolucion_id,v_nc_payload,'verify:nc-return:570');
  IF v_retry->>'id'<>v_nc->>'id' OR (v_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_570_SUPPLIER_NC_RETRY_FAILED';
  END IF;
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_devolucion_tx(v_tenant,v_actor,v_devolucion_id,
      v_nc_payload||jsonb_build_object('total',1),'verify:nc-return:570');
    RAISE EXCEPTION 'VERIFY_570_SUPPLIER_NC_CONFLICT_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_devolucion_tx(v_tenant,v_actor,v_devolucion_id,
      v_nc_payload||jsonb_build_object('total',1),'verify:nc-return:bad:570');
    RAISE EXCEPTION 'VERIFY_570_SUPPLIER_NC_WRONG_AMOUNT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SUPPLIER_RETURN_NC_AMOUNTS_MISMATCH' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_devolucion_tx(v_tenant_ajeno,v_actor_ajeno,
      v_devolucion_id,v_nc_payload,'verify:nc-return:foreign:570');
    RAISE EXCEPTION 'VERIFY_570_SUPPLIER_NC_FOREIGN_RETURN_ACCEPTED';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.crear_factura_proveedor_tx(v_tenant,v_nc_payload,gen_random_uuid(),'verify:nc:unsafe:570');
    RAISE EXCEPTION 'VERIFY_570_SUPPLIER_NC_CREATES_POSITIVE_INVOICE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SUPPLIER_CREDIT_NOTE_USE_RETURN_WRITER' THEN RAISE; END IF;
  END;
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}'::jsonb);
  IF (v_rce->>'total_registros')::integer<>2 OR (v_rce->'totals'->>'total')::numeric<>59 THEN
    RAISE EXCEPTION 'VERIFY_570_RCE_SUPPLIER_NC_NOT_SEPARATE_OR_DOUBLE_SUBTRACTED';
  END IF;
  SELECT count(*) INTO v_count FROM public.cxp_ajustes_proveedor
  WHERE tenant_id=v_tenant AND devolucion_id=v_devolucion_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'VERIFY_450_CXP_ADJUSTMENT_COUNT %',v_count; END IF;
  SELECT payload INTO v_event_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='devolucion.proveedor.registrada'
    AND aggregate_id=v_devolucion_id::text;
  IF v_event_payload->>'cuentaPasivo' <> '42'
     OR (v_event_payload->>'mercaderia')::numeric <> 100
     OR (v_event_payload->>'servicios')::numeric <> 100
     OR (v_event_payload->>'noStock')::numeric <> 30
     OR (v_event_payload->>'cxpAjustadaAtomicamente')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_450_EVENT_CLASSIFICATION_INVALID %',v_event_payload;
  END IF;

  SELECT public.emitir_devolucion_proveedor_tx(v_devolucion_id,v_tenant,v_actor) INTO v_retry;
  IF (v_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_450_EMIT_RETRY_NOT_IDEMPOTENT %',v_retry;
  END IF;
  SELECT count(*) INTO v_count FROM public.movimientos_inventario
  WHERE tenant_id=v_tenant AND referencia_tipo='DEVOLUCION_PROVEEDOR_ITEM'
    AND metadata->>'devolucion_id'=v_devolucion_id::text;
  IF v_count <> 2 THEN RAISE EXCEPTION 'VERIFY_450_MOVEMENT_COUNT_AFTER_RETRY %',v_count; END IF;

  -- Sin factura/CxP aún no existe crédito fiscal ni proveedor por revertir:
  -- el asiento debe cancelar 4699 sólo por la base recibida.
  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant, 'OC-VERIFY-450-SIN-CXP', 'OC-VERIFY-450-SIN-CXP', v_proveedor,
    current_date, current_date, 'APROBADA', true, 'PEN', 50, 9, 59, 'CREDITO', 30
  ) RETURNING id INTO v_orden_sin_cxp;
  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES (
    v_tenant, v_orden_sin_cxp, v_producto, 'Producto sin CxP 450', 1, 0, 1, 50, 50
  ) RETURNING id INTO v_det_sin_cxp;
  SELECT public.crear_recepcion_tx(v_tenant,v_orden_sin_cxp,
    jsonb_build_array(jsonb_build_object('detalle_id',v_det_sin_cxp,
      'cantidad_recibida',1,'calidad','OK','almacen_id',v_almacen)),
    'Sin CxP',v_actor,'verify:receipt:no-cxp:450') INTO v_recepcion_sin_cxp;
  v_recepcion_sin_cxp_id := (v_recepcion_sin_cxp->>'id')::uuid;
  SELECT id INTO v_ri_sin_cxp FROM public.recepcion_items
  WHERE recepcion_id=v_recepcion_sin_cxp_id AND detalle_id=v_det_sin_cxp;
  PERFORM public.cerrar_recepcion_tx(v_recepcion_sin_cxp_id,v_tenant,v_actor::text,NULL);
  SELECT public.crear_devolucion_proveedor_tx(v_tenant,jsonb_build_object(
    'recepcion_id',v_recepcion_sin_cxp_id,'orden_id',v_orden_sin_cxp,
    'proveedor_id',v_proveedor,'motivo','SIN FACTURA','items',jsonb_build_array(
      jsonb_build_object('recepcion_item_id',v_ri_sin_cxp,'producto_id',v_producto,
        'descripcion','Producto sin CxP 450','cantidad',1,'precio_unitario',50,
        'almacen_id',v_almacen))),v_actor,'verify:return:no-cxp:450') INTO v_dev_sin_cxp;
  v_dev_sin_cxp_id := (v_dev_sin_cxp->>'id')::uuid;
  PERFORM public.emitir_devolucion_proveedor_tx(v_dev_sin_cxp_id,v_tenant,v_actor);
  SELECT payload INTO v_event_payload FROM public.outbox_events
  WHERE tenant_id=v_tenant AND event_type='devolucion.proveedor.registrada'
    AND aggregate_id=v_dev_sin_cxp_id::text;
  IF v_event_payload->>'cuentaPasivo' <> '4699'
     OR (v_event_payload->>'igvContable')::numeric <> 0
     OR (v_event_payload->>'totalContable')::numeric <> 50
     OR (v_event_payload->>'cxpAjustadaAtomicamente')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_450_NO_CXP_EVENT_INVALID %',v_event_payload;
  END IF;

  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
      'proveedor_id',v_proveedor,'motivo','PENDIENTE','items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
          'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
    v_actor,'verify:return:pending:450'
  ) INTO v_pendiente;
  v_pendiente_id := (v_pendiente->>'id')::uuid;
  PERFORM public.anular_devolucion_proveedor_pendiente_tx(v_pendiente_id,v_tenant,v_actor,'No enviar');
  -- La anulación libera la cantidad planificada para una nueva devolución.
  SELECT public.crear_devolucion_proveedor_tx(
    v_tenant,
    jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
      'proveedor_id',v_proveedor,'motivo','REINTENTO','items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
          'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
    v_actor,'verify:return:rollback:450'
  ) INTO v_pendiente;
  v_pendiente_id := (v_pendiente->>'id')::uuid;

  -- Si la devolución supera la deuda aún pendiente, no puede crear un crédito
  -- a proveedor implícito ni retirar stock sin un flujo de reembolso/compensación.
  UPDATE public.cuentas_por_pagar SET saldo=10, saldo_pendiente=10,
    estado='PARCIAL', updated_at=now() WHERE id=(v_cxp->>'id')::uuid;
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  BEGIN
    PERFORM public.emitir_devolucion_proveedor_tx(v_pendiente_id,v_tenant,v_actor);
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_CREDIT_EXCEEDS_OUTSTANDING';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%SUPPLIER_CREDIT_EXCEEDS_OUTSTANDING%' THEN RAISE; END IF;
  END;
  IF (SELECT upper(estado::text) FROM public.devoluciones_proveedor WHERE id=v_pendiente_id) <> 'PENDIENTE'
     OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> v_stock THEN
    RAISE EXCEPTION 'VERIFY_450_CREDIT_EXCESS_DID_NOT_ROLL_BACK';
  END IF;
  UPDATE public.cuentas_por_pagar SET saldo=59, saldo_pendiente=59,
    estado='PENDIENTE', updated_at=now() WHERE id=(v_cxp->>'id')::uuid;

  -- Una colisión al final debe revertir también stock, CxP y estado.
  INSERT INTO public.outbox_events(
    tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,
    idempotency_key,event_id,occurred_at
  ) VALUES (
    v_tenant,'corrupt','corrupt','devolucion.proveedor.registrada','{}','pending',0,
    'devolucion.proveedor.registrada:'||v_tenant::text||':'||v_pendiente_id::text,
    v_fake_event,now()
  );
  SELECT stock_actual INTO v_stock FROM public.producto_existencias
  WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen;
  BEGIN
    PERFORM public.emitir_devolucion_proveedor_tx(v_pendiente_id,v_tenant,v_actor);
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_OUTBOX_COLLISION';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT upper(estado::text) FROM public.devoluciones_proveedor WHERE id=v_pendiente_id) <> 'PENDIENTE'
     OR (SELECT stock_actual FROM public.producto_existencias WHERE tenant_id=v_tenant AND producto_id=v_producto AND almacen_id=v_almacen) <> v_stock THEN
    RAISE EXCEPTION 'VERIFY_450_ROLLBACK_POSTCONDITION_FAILED';
  END IF;
  DELETE FROM public.outbox_events WHERE event_id=v_fake_event;
  PERFORM public.anular_devolucion_proveedor_pendiente_tx(v_pendiente_id,v_tenant,v_actor,'Fin verify');

  BEGIN
    PERFORM public.crear_devolucion_proveedor_tx(
      v_tenant,
      jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
        'proveedor_id',v_proveedor,'motivo','ACTOR','items',jsonb_build_array(
          jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
            'descripcion','Línea 3','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
      v_actor_ajeno,'verify:return:foreign:450');
    RAISE EXCEPTION 'VERIFY_450_EXPECTED_FOREIGN_ACTOR_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Completar la devolución total de la última línea. Se cancela la obligación,
  -- pero la factura original conserva su fila fiscal y el importe del documento.
  v_final_return:=public.crear_devolucion_proveedor_tx(v_tenant,
    jsonb_build_object('recepcion_id',v_recepcion_id,'orden_id',v_orden,
      'proveedor_id',v_proveedor,'motivo','DEFECTO','items',jsonb_build_array(
        jsonb_build_object('recepcion_item_id',v_ri_3,'producto_id',v_producto,
          'descripcion','Última línea','cantidad',1,'precio_unitario',50,'almacen_id',v_almacen))),
    v_actor,'verify:return:final:rce570');
  PERFORM public.emitir_devolucion_proveedor_tx((v_final_return->>'id')::uuid,v_tenant,v_actor);
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}'::jsonb);
  IF (v_rce->>'total_registros')::integer<>2 OR (v_rce->'totals'->>'total')::numeric<>59 THEN
    RAISE EXCEPTION 'VERIFY_570_RCE_TOTAL_RETURN_REMOVED_ORIGINAL_INVOICE';
  END IF;
  RAISE NOTICE 'VERIFY 570 RCE: partial/total return, immutable original, separate NC, retries, tenant isolation and no duplicate accounting PASS';
END
$$;

DO $$
DECLARE
  v_ok boolean := false;
  v_id uuid;
  v_tenant uuid;
BEGIN
  IF has_function_privilege('anon','public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('service_role','app.crear_devolucion_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
     OR has_function_privilege('service_role','app.emitir_devolucion_proveedor_tx(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_450_RPC_ACL_INVALID';
  END IF;
  IF has_table_privilege('anon','public.devoluciones_proveedor','INSERT')
     OR has_table_privilege('authenticated','public.devoluciones_proveedor','UPDATE')
     OR has_table_privilege('anon','public.devolucion_items','DELETE')
     OR has_table_privilege('authenticated','public.cxp_ajustes_proveedor','SELECT') THEN
    RAISE EXCEPTION 'VERIFY_450_TABLE_ACL_INVALID';
  END IF;

  GRANT SELECT, UPDATE ON public.devoluciones_proveedor TO service_role;
  SELECT id, tenant_id INTO v_id, v_tenant
  FROM public.devoluciones_proveedor ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);
  -- Ejecutar sobre una fila garantiza que el rechazo viene del guard, no del ACL.
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.devoluciones_proveedor SET estado=estado
    WHERE id=v_id;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE '%SUPPLIER_RETURN_RPC_REQUIRED%' THEN v_ok := true; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'VERIFY_450_DIRECT_DML_GUARD_NOT_PROVEN'; END IF;
END
$$;

ROLLBACK;


-- NC sin devolución, crédito, aplicación y reembolso: SQL real.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'Sólo base local efímera erp_e2e'; END IF; END $$;
DO $test$
DECLARE
  v_demo jsonb; v_tenant uuid; v_actor uuid; v_provider uuid; v_bank uuid; v_counter uuid; v_bank_ledger uuid;
  v_invoice jsonb; v_target jsonb; v_note jsonb; v_payload jsonb; v_result jsonb; v_retry jsonb; v_final jsonb;
  v_count bigint; v_rce jsonb; v_before numeric; v_id uuid;
BEGIN
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localreturnverifyxxx',allow_demo_data=true,
    configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  v_demo:=public.create_demo_tenant('VERIFY SUPPLIER CREDIT 570',1,'PE');
  v_tenant:=(v_demo->>'tenant_id')::uuid; v_actor:=(v_demo->>'user_id')::uuid;
  INSERT INTO public.proveedores(tenant_id,codigo,nombre,razon_social,ruc,estado,activo,condiciones_pago,dias_credito)
  VALUES(v_tenant,'PROV-CREDIT-570','Proveedor crédito','Proveedor crédito','20123456780','ACTIVO',true,'CREDITO',30)
    RETURNING id INTO v_provider;
  SELECT id INTO STRICT v_bank_ledger FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='1041';
  SELECT id INTO STRICT v_counter FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='63';
  INSERT INTO public.cuentas_bancarias(tenant_id,nombre,codigo,banco,numero_cuenta,tipo_cuenta,
    moneda,saldo,saldo_actual,saldo_contable,activa,activo,estado,permite_sobregiro,cuenta_contable_id)
  VALUES(v_tenant,'Banco crédito','BANK-CREDIT-570','Banco local','570-CREDIT','CORRIENTE','PEN',5000,5000,5000,
    true,true,'ACTIVO',false,v_bank_ledger) RETURNING id INTO v_bank;
  v_payload:=jsonb_build_object('proveedor_id',v_provider,'numero','F002-570','numero_documento','F002-570',
    'fecha_emision',current_date,'fecha_vencimiento',current_date+30,'condiciones_pago','CREDITO','dias_credito',30,
    'subtotal',1000,'igv',180,'total',1180,'saldo',1180,'moneda','PEN','tipo_documento','FACTURA',
    'fiscal_metadata',jsonb_build_object('serie','F002','tipo_cambio',1),'estado','PENDIENTE','estado_comparacion','OK',
    'created_by',v_actor,'updated_by',v_actor,'tipo_cambio_origen',1);
  v_invoice:=public.crear_factura_proveedor_tx(v_tenant,v_payload,gen_random_uuid(),'verify:credit:invoice:570');
  v_target:=public.crear_factura_proveedor_tx(v_tenant,v_payload||jsonb_build_object('numero','F002-571',
    'numero_documento','F002-571','subtotal',500,'igv',90,'total',590,'saldo',590),gen_random_uuid(),'verify:credit:target:570');
  PERFORM public.aplicar_pago_cxp_tx(v_tenant,(v_invoice->>'id')::uuid,jsonb_build_object(
    'monto',1180,'fecha_pago',current_date,'metodo_pago','TRANSFERENCIA','cuenta_bancaria_id',v_bank,
    'referencia','PAGO-CREDIT-570','idempotency_key','verify:credit:payment:570'),v_actor);
  v_payload:=jsonb_build_object('proveedor_id',v_provider,'tipo_documento','NOTA_CREDITO','numero_documento','FC02-570',
    'serie','FC02','fecha_emision',current_date,'subtotal',200,'igv',36,'total',236,'moneda','PEN','tipo_cambio',1,
    'motivo_nota_credito','DESCUENTO','cuenta_ajuste_id',v_counter,'documento_referencia_tipo','FACTURA',
    'documento_referencia_serie','F002','documento_referencia_numero','570','documento_referencia_fecha',current_date);
  v_note:=public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_invoice->>'id')::uuid,v_payload,'verify:credit:nc:570');
  IF (v_note->>'saldo_credito_proveedor')::numeric<>236 OR (v_note->>'saldo')::numeric<>0
    OR (SELECT total FROM public.cuentas_por_pagar WHERE id=(v_invoice->>'id')::uuid)<>944
    OR (SELECT original_fiscal_amounts->>'total' FROM public.cuentas_por_pagar WHERE id=(v_invoice->>'id')::uuid)::numeric<>1180
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='nota_credito.proveedor.registrada')<>1 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_PAID_INVOICE_INVALID'; END IF;
  v_retry:=public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_invoice->>'id')::uuid,v_payload,'verify:credit:nc:570');
  IF v_retry->>'id'<>v_note->>'id' OR NOT (v_retry->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_NC_REPLAY_FAILED'; END IF;
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_invoice->>'id')::uuid,
      v_payload||jsonb_build_object('subtotal',201,'total',237),'verify:credit:nc:570');
    RAISE EXCEPTION 'VERIFY_570_CREDIT_NC_CHANGED_REPLAY_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  v_payload:=jsonb_build_object('accion','APLICACION','monto',118,'fecha',current_date,'factura_id',(v_target->>'id')::uuid);
  v_result:=public.aplicar_credito_proveedor_tx(v_tenant,v_actor,(v_note->>'id')::uuid,v_payload,'verify:credit:apply:570');
  IF (v_result->'nota'->>'saldo_credito_proveedor')::numeric<>118
    OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_target->>'id')::uuid)<>472 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_APPLICATION_INVALID'; END IF;
  v_retry:=public.aplicar_credito_proveedor_tx(v_tenant,v_actor,(v_note->>'id')::uuid,v_payload,'verify:credit:apply:570');
  IF NOT (v_retry->>'idempotent')::boolean OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_target->>'id')::uuid)<>472 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_APPLICATION_DUPLICATED'; END IF;
  BEGIN
    PERFORM public.aplicar_credito_proveedor_tx(v_tenant,v_actor,(v_note->>'id')::uuid,
      v_payload||jsonb_build_object('monto',119),'verify:credit:excess:570');
    RAISE EXCEPTION 'VERIFY_570_CREDIT_EXCESS_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SUPPLIER_CREDIT_AVAILABLE_BALANCE_EXCEEDED' THEN RAISE; END IF;
  END;
  v_payload:=jsonb_build_object('accion','REEMBOLSO','monto',118,'fecha',current_date,
    'cuenta_bancaria_id',v_bank,'tipo_cambio',1,'referencia','REFUND-CREDIT-570');
  v_result:=public.aplicar_credito_proveedor_tx(v_tenant,v_actor,(v_note->>'id')::uuid,v_payload,'verify:credit:refund:570');
  IF (v_result->'nota'->>'saldo_credito_proveedor')::numeric<>0
    OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank)<>3938
    OR (SELECT count(*) FROM public.movimientos_bancarios WHERE cuenta_bancaria_id=v_bank AND tipo='ABONO')<>1 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_REFUND_INVALID'; END IF;
  v_retry:=public.aplicar_credito_proveedor_tx(v_tenant,v_actor,(v_note->>'id')::uuid,v_payload,'verify:credit:refund:570');
  IF NOT (v_retry->>'idempotent')::boolean OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank)<>3938 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_REFUND_DUPLICATED'; END IF;
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}');
  IF (v_rce->>'total_registros')::integer<>3 OR (v_rce->'totals'->>'total')::numeric<>1534 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_FISCAL_DOUBLE_DISCOUNT'; END IF;
  v_payload:=jsonb_build_object('proveedor_id',v_provider,'tipo_documento','NOTA_CREDITO','numero_documento','FC02-571',
    'serie','FC02','fecha_emision',current_date,'subtotal',800,'igv',144,'total',944,'moneda','PEN','tipo_cambio',1,
    'motivo_nota_credito','ANULACION','cuenta_ajuste_id',v_counter,'documento_referencia_tipo','FACTURA',
    'documento_referencia_serie','F002','documento_referencia_numero','570','documento_referencia_fecha',current_date);
  v_final:=public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_invoice->>'id')::uuid,v_payload,'verify:credit:full:570');
  IF (v_final->>'saldo_credito_proveedor')::numeric<>944
    OR (SELECT estado FROM public.cuentas_por_pagar WHERE id=(v_invoice->>'id')::uuid)<>'ANULADA' THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_CANCELLATION_INVALID'; END IF;
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}');
  IF (v_rce->>'total_registros')::integer<>4 OR (v_rce->'totals'->>'total')::numeric<>590 THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_CANCELLATION_REMOVES_ORIGINAL'; END IF;
  IF EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE tenant_id=v_tenant
    AND referencia_id IN ((v_note->>'id')::uuid,(v_final->>'id')::uuid)) THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_IMPLICIT_INVENTORY_MOVEMENT'; END IF;
  BEGIN UPDATE public.cuentas_por_pagar SET saldo_credito_proveedor=1 WHERE id=(v_note->>'id')::uuid;
    RAISE EXCEPTION 'VERIFY_570_CREDIT_DIRECT_MUTATION_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('authenticated','public.registrar_nota_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text)','EXECUTE')
    OR has_table_privilege('service_role','public.cxp_credito_proveedor_movimientos','UPDATE')
    OR NOT app.is_accounting_event_458('nota_credito.proveedor.registrada')
    OR NOT app.is_accounting_owned_outbox_event_492('credito.proveedor.aplicado') THEN
    RAISE EXCEPTION 'VERIFY_570_CREDIT_ACL_OR_WORKER_OWNERSHIP_INVALID'; END IF;
  RAISE NOTICE 'VERIFY 570 supplier credit: paid invoice, immutable fiscal original, NC retry/conflict, apply/refund retry, complete cancellation, inventory isolation PASS';
END;
$test$;
ROLLBACK;

-- Ajustes tributarios del proveedor: reversión pendiente y NC sin borrar pagos.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'Sólo base local efímera erp_e2e'; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.reject_credit_outbox_570() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.idempotency_key IN ('supplier-credit:nc:verify:atomic:nc:570',
    'supplier-credit:refund:verify:atomic:refund:570') THEN
    RAISE EXCEPTION 'VERIFY_570_INJECTED_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verify_credit_outbox_failure_570 BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_credit_outbox_570();
DO $test$
DECLARE
  v_demo jsonb; v_foreign jsonb; v_tenant uuid; v_actor uuid; v_provider uuid; v_bank uuid; v_counter uuid; v_bank_ledger uuid;
  v_invoice jsonb; v_tax_invoice jsonb; v_perception_invoice jsonb; v_note jsonb; v_payload jsonb; v_result jsonb; v_retry jsonb;
  v_adjust jsonb; v_original_payload jsonb; v_note_payload jsonb; v_count bigint; v_rce jsonb; v_before numeric;
BEGIN
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localtaxcreditverify',allow_demo_data=true,
    configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  v_demo:=public.create_demo_tenant('VERIFY SUPPLIER TAX CREDIT 570',1,'PE');
  v_tenant:=(v_demo->>'tenant_id')::uuid; v_actor:=(v_demo->>'user_id')::uuid;
  INSERT INTO public.proveedores(tenant_id,codigo,nombre,razon_social,ruc,estado,activo,condiciones_pago,dias_credito)
  VALUES(v_tenant,'PROV-TAX-570','Proveedor tributario','Proveedor tributario','20123456780','ACTIVO',true,'CREDITO',30)
    RETURNING id INTO v_provider;
  SELECT id INTO STRICT v_bank_ledger FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='1041';
  SELECT id INTO STRICT v_counter FROM public.plan_cuentas WHERE tenant_id=v_tenant AND codigo='63';
  INSERT INTO public.cuentas_bancarias(tenant_id,nombre,codigo,banco,numero_cuenta,tipo_cuenta,
    moneda,saldo,saldo_actual,saldo_contable,activa,activo,estado,permite_sobregiro,cuenta_contable_id)
  VALUES(v_tenant,'Banco tributario','BANK-TAX-570','Banco local','570-TAX','CORRIENTE','PEN',2500,2500,2500,
    true,true,'ACTIVO',false,v_bank_ledger) RETURNING id INTO v_bank;
  v_original_payload:=jsonb_build_object('proveedor_id',v_provider,'numero','F003-570','numero_documento','F003-570',
    'fecha_emision',current_date,'fecha_vencimiento',current_date+30,'condiciones_pago','CREDITO','dias_credito',30,
    'subtotal',1000,'igv',180,'total',1180,'saldo',1180,'moneda','PEN','tipo_documento','FACTURA',
    'fiscal_metadata',jsonb_build_object('serie','F003','tipo_cambio',1),'estado','PENDIENTE','estado_comparacion','OK',
    'created_by',v_actor,'updated_by',v_actor,'tipo_cambio_origen',1);
  v_invoice:=public.crear_factura_proveedor_tx(v_tenant,v_original_payload,gen_random_uuid(),'verify:tax:invoice:570');
  v_adjust:=public.registrar_ajuste_fiscal_financiero_tx(v_tenant,(v_invoice->>'id')::uuid,
    jsonb_build_object('origen','PROVEEDOR','tipo','DETRACCION','monto',118,'moneda','PEN','fecha',current_date,
      'referencia','DETR-PENDING-570'),v_actor,'verify:tax:pending:570');
  IF v_adjust->>'estado'<>'PENDIENTE_TESORERIA'
    OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_invoice->>'id')::uuid)<>1062 THEN
    RAISE EXCEPTION 'VERIFY_570_PENDING_DETRACTION_INVALID'; END IF;
  v_note_payload:=jsonb_build_object('proveedor_id',v_provider,'tipo_documento','NOTA_CREDITO','numero_documento','FC03-570',
    'serie','FC03','fecha_emision',current_date,'subtotal',100,'igv',18,'total',118,'moneda','PEN','tipo_cambio',1,
    'motivo_nota_credito','DESCUENTO','cuenta_ajuste_id',v_counter,'documento_referencia_tipo','FACTURA',
    'documento_referencia_serie','F003','documento_referencia_numero','570','documento_referencia_fecha',current_date);
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_invoice->>'id')::uuid,
      v_note_payload,'verify:tax:nc:blocked:570');
    RAISE EXCEPTION 'VERIFY_570_PENDING_DETRACTION_NC_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SUPPLIER_CREDIT_PENDING_DETRACTION_REQUIRES_REVERSAL' THEN RAISE; END IF;
  END;
  v_payload:=jsonb_build_object('fecha',current_date,'motivo','Corrección por NC recibida');
  v_result:=public.revertir_detraccion_proveedor_pendiente_tx(v_tenant,v_actor,(v_adjust->>'id')::uuid,
    v_payload,'verify:tax:reverse:570');
  IF v_result->>'estado'<>'ANULADO' OR (v_result->'cxp'->>'saldo')::numeric<>1180
    OR (v_result->'cxp'->>'detraccion_total')::numeric<>0
    OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank)<>2500
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant AND event_type='cxp.ajuste.revertido')<>1 THEN
    RAISE EXCEPTION 'VERIFY_570_PENDING_DETRACTION_REVERSAL_INVALID'; END IF;
  v_retry:=public.revertir_detraccion_proveedor_pendiente_tx(v_tenant,v_actor,(v_adjust->>'id')::uuid,
    v_payload,'verify:tax:reverse:570');
  IF NOT (v_retry->>'idempotent')::boolean
    OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_invoice->>'id')::uuid)<>1180 THEN
    RAISE EXCEPTION 'VERIFY_570_DETRACTION_REVERSAL_DUPLICATED'; END IF;
  BEGIN
    PERFORM public.revertir_detraccion_proveedor_pendiente_tx(v_tenant,v_actor,(v_adjust->>'id')::uuid,
      v_payload||jsonb_build_object('motivo','Otra corrección'),'verify:tax:reverse:570');
    RAISE EXCEPTION 'VERIFY_570_DETRACTION_REVERSAL_CHANGED_REPLAY_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.depositar_detraccion_proveedor_tx(v_tenant,(v_adjust->>'id')::uuid,
      jsonb_build_object('cuenta_bancaria_id',v_bank,'fecha',current_date,'referencia','BAD-DEPOSIT'),v_actor,'verify:tax:deposit:reversed');
    RAISE EXCEPTION 'VERIFY_570_REVERSED_DETRACTION_DEPOSIT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_note:=public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_invoice->>'id')::uuid,
    v_note_payload,'verify:tax:nc:570');
  IF (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_invoice->>'id')::uuid)<>1062 THEN
    RAISE EXCEPTION 'VERIFY_570_NC_AFTER_DETRACTION_REVERSAL_INVALID'; END IF;
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}');
  IF (v_rce->>'total_registros')::integer<>2 OR (v_rce->'totals'->>'total')::numeric<>1062 THEN
    RAISE EXCEPTION 'VERIFY_570_NC_AFTER_DETRACTION_FISCAL_INVALID'; END IF;

  v_tax_invoice:=public.crear_factura_proveedor_tx(v_tenant,v_original_payload||jsonb_build_object(
    'numero','F003-571','numero_documento','F003-571'),gen_random_uuid(),'verify:tax:performed:invoice');
  PERFORM public.registrar_ajuste_fiscal_financiero_tx(v_tenant,(v_tax_invoice->>'id')::uuid,
    jsonb_build_object('origen','PROVEEDOR','tipo','RETENCION','monto',30,'moneda','PEN','fecha',current_date),
    v_actor,'verify:tax:retention:570');
  PERFORM public.registrar_ajuste_fiscal_financiero_tx(v_tenant,(v_tax_invoice->>'id')::uuid,
    jsonb_build_object('origen','PROVEEDOR','tipo','PERCEPCION','monto',20,'moneda','PEN','fecha',current_date),
    v_actor,'verify:tax:perception:570');
  v_adjust:=public.registrar_ajuste_fiscal_financiero_tx(v_tenant,(v_tax_invoice->>'id')::uuid,
    jsonb_build_object('origen','PROVEEDOR','tipo','DETRACCION','monto',50,'moneda','PEN','fecha',current_date),
    v_actor,'verify:tax:performed:detraction');
  PERFORM public.depositar_detraccion_proveedor_tx(v_tenant,(v_adjust->>'id')::uuid,
    jsonb_build_object('cuenta_bancaria_id',v_bank,'fecha',current_date,'referencia','DEPOSIT-570'),v_actor,'verify:tax:deposit:570');
  BEGIN
    PERFORM public.revertir_detraccion_proveedor_pendiente_tx(v_tenant,v_actor,(v_adjust->>'id')::uuid,
      v_payload,'verify:tax:reverse:deposited');
    RAISE EXCEPTION 'VERIFY_570_SETTLED_DETRACTION_REVERSED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SUPPLIER_DETRACTION_ALREADY_SETTLED_OR_REVERSED' THEN RAISE; END IF;
  END;
  v_note_payload:=v_note_payload||jsonb_build_object('numero_documento','FC03-571','subtotal',1000,'igv',180,
    'total',1180,'motivo_nota_credito','ANULACION','documento_referencia_numero','571');
  v_note:=public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_tax_invoice->>'id')::uuid,
    v_note_payload,'verify:tax:nc:performed');
  IF (v_note->>'saldo_credito_proveedor')::numeric<>60
    OR (SELECT retencion_total FROM public.cuentas_por_pagar WHERE id=(v_tax_invoice->>'id')::uuid)<>30
    OR (SELECT percepcion_total FROM public.cuentas_por_pagar WHERE id=(v_tax_invoice->>'id')::uuid)<>20
    OR (SELECT detraccion_total FROM public.cuentas_por_pagar WHERE id=(v_tax_invoice->>'id')::uuid)<>50
    OR (SELECT count(*) FROM public.operaciones_fiscales_financieras WHERE cxp_id=(v_tax_invoice->>'id')::uuid AND estado='APLICADO')<>3
    OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank)<>2450 THEN
    RAISE EXCEPTION 'VERIFY_570_NC_ALTERED_PERFORMED_TAXES'; END IF;
  v_count:=(SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant);
  BEGIN
    PERFORM public.aplicar_credito_proveedor_tx(v_tenant,v_actor,(v_note->>'id')::uuid,
      jsonb_build_object('accion','REEMBOLSO','monto',30,'fecha',current_date,'cuenta_bancaria_id',v_bank,
        'tipo_cambio',1,'referencia','LATE-FAIL-570'),'verify:atomic:refund:570');
    RAISE EXCEPTION 'VERIFY_570_REFUND_INJECTED_FAILURE_NOT_RAISED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'VERIFY_570_INJECTED_OUTBOX_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank)<>2450
    OR (SELECT saldo_credito_proveedor FROM public.cuentas_por_pagar WHERE id=(v_note->>'id')::uuid)<>60
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant)<>v_count
    OR EXISTS(SELECT 1 FROM public.movimientos_bancarios WHERE tenant_id=v_tenant AND referencia='LATE-FAIL-570') THEN
    RAISE EXCEPTION 'VERIFY_570_REFUND_LATE_FAILURE_NOT_ATOMIC'; END IF;
  v_foreign:=public.create_demo_tenant('VERIFY FOREIGN CREDIT 570',1,'PE');
  BEGIN
    PERFORM public.aplicar_credito_proveedor_tx(v_tenant,(v_foreign->>'user_id')::uuid,(v_note->>'id')::uuid,
      jsonb_build_object('accion','REEMBOLSO','monto',30,'fecha',current_date,'cuenta_bancaria_id',v_bank,
        'tipo_cambio',1,'referencia','FOREIGN-ACTOR-570'),'verify:foreign:actor:570');
    RAISE EXCEPTION 'VERIFY_570_FOREIGN_CREDIT_ACTOR_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.aplicar_credito_proveedor_tx((v_foreign->>'tenant_id')::uuid,(v_foreign->>'user_id')::uuid,
      (v_note->>'id')::uuid,jsonb_build_object('accion','REEMBOLSO','monto',30,'fecha',current_date,
        'cuenta_bancaria_id',v_bank,'tipo_cambio',1),'verify:foreign:note:570');
    RAISE EXCEPTION 'VERIFY_570_FOREIGN_NOTE_ACCEPTED';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM set_config('app.current_tenant_id',v_tenant::text,true);

  v_perception_invoice:=public.crear_factura_proveedor_tx(v_tenant,v_original_payload||jsonb_build_object(
    'numero','F003-572','numero_documento','F003-572'),gen_random_uuid(),'verify:tax:surcharge:invoice');
  PERFORM public.registrar_ajuste_fiscal_financiero_tx(v_tenant,(v_perception_invoice->>'id')::uuid,
    jsonb_build_object('origen','PROVEEDOR','tipo','PERCEPCION','monto',20,'moneda','PEN','fecha',current_date),
    v_actor,'verify:tax:surcharge:570');
  v_note_payload:=v_note_payload||jsonb_build_object('numero_documento','FC03-572','documento_referencia_numero','572');
  v_before:=(SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_perception_invoice->>'id')::uuid);
  v_count:=(SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant);
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_perception_invoice->>'id')::uuid,
      v_note_payload,'verify:atomic:nc:570');
    RAISE EXCEPTION 'VERIFY_570_INJECTED_FAILURE_NOT_RAISED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'VERIFY_570_INJECTED_OUTBOX_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_perception_invoice->>'id')::uuid)<>v_before
    OR (SELECT original_fiscal_amounts FROM public.cuentas_por_pagar WHERE id=(v_perception_invoice->>'id')::uuid) IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.cuentas_por_pagar WHERE tenant_id=v_tenant AND numero_documento='FC03-572')
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant)<>v_count THEN
    RAISE EXCEPTION 'VERIFY_570_NC_LATE_FAILURE_NOT_ATOMIC'; END IF;
  v_note:=public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_perception_invoice->>'id')::uuid,
    v_note_payload,'verify:tax:nc:surcharge');
  IF (SELECT saldo FROM public.cuentas_por_pagar WHERE id=(v_perception_invoice->>'id')::uuid)<>20
    OR (SELECT estado FROM public.cuentas_por_pagar WHERE id=(v_perception_invoice->>'id')::uuid)='ANULADA'
    OR (v_note->>'saldo_credito_proveedor')::numeric<>0 THEN
    RAISE EXCEPTION 'VERIFY_570_NC_ERASED_PERCEPTION_SURCHARGE'; END IF;
  BEGIN
    PERFORM public.registrar_nota_credito_proveedor_tx(v_tenant,v_actor,(v_perception_invoice->>'id')::uuid,
      v_note_payload||jsonb_build_object('numero_documento','FC03-573'),'verify:tax:double:cancel');
    RAISE EXCEPTION 'VERIFY_570_NC_DOUBLE_CANCELLATION_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_rce:=app.build_sire_snapshot_463(v_tenant,'REG_COM',to_char(current_date,'YYYY-MM'),'{}');
  IF (v_rce->>'total_registros')::integer<>6 OR (v_rce->'totals'->>'total')::numeric<>1062 THEN
    RAISE EXCEPTION 'VERIFY_570_TAX_CREDIT_FISCAL_DOUBLE_DISCOUNT'; END IF;
  IF has_function_privilege('authenticated','public.revertir_detraccion_proveedor_pendiente_tx(uuid,uuid,uuid,jsonb,text)','EXECUTE')
    OR NOT app.is_accounting_event_458('cxp.ajuste.revertido')
    OR NOT app.is_accounting_owned_outbox_event_492('cxp.ajuste.revertido') THEN
    RAISE EXCEPTION 'VERIFY_570_TAX_CREDIT_ACL_OR_OWNERSHIP_INVALID'; END IF;
  RAISE NOTICE 'VERIFY 570 tax credit: pending detraction reversal/replay, deposited refusal, preserved performed retention/perception/detraction, surcharge, late outbox rollback, RCE signs PASS';
END;
$test$;
ROLLBACK;

-- Gratificación: fuente histórica/external durable y atomicidad.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'Gratification verifier permits local ephemeral erp_e2e only'; END IF;
  IF NOT has_function_privilege('service_role','public.guardar_calculo_planilla_gratificacion_tx_570(uuid,uuid,jsonb,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.guardar_calculo_planilla_gratificacion_tx_570(uuid,uuid,jsonb,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.guardar_calculo_planilla_gratificacion_tx_570(uuid,uuid,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Gratification writer ACL invalid'; END IF;
END $$;
CREATE FUNCTION pg_temp.verify_grat_source_failure_570() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.metadata->'base_gratificacion_ordinaria'->>'referencia'='VERIFY-GRAT-FAIL' THEN
    RAISE EXCEPTION 'VERIFY_GRAT_METADATA_FAILURE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verify_grat_source_failure_570 AFTER UPDATE OF metadata ON public.empleado_planilla
FOR EACH ROW EXECUTE FUNCTION pg_temp.verify_grat_source_failure_570();
DO $$
DECLARE
  v_demo jsonb;v_foreign jsonb;v_tenant uuid;v_actor uuid;v_emp uuid;v_planilla uuid;v_failed uuid;
  v_contract uuid:=gen_random_uuid();v_hist_planilla uuid;v_hist_source jsonb;v_hist_rows jsonb;
  v_c001 uuid;v_c006 uuid;v_c007 uuid;v_c104 uuid;v_c201 uuid;v_result jsonb;v_rows jsonb;v_bad jsonb;v_source jsonb;v_message text;
BEGIN
  UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',
    allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  v_demo:=public.create_demo_tenant('VERIFY GRAT570',1,'PE');
  v_foreign:=public.create_demo_tenant('VERIFY GRAT570 FOREIGN',1,'PE');
  v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;
  INSERT INTO public.empleados(tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
    VALUES(v_tenant,'Grat Verify','Grat','Verify','GRAT-570','DNI','57157157','activo',true,'2026-01-01','PE') RETURNING id INTO v_emp;
  INSERT INTO public.contratos(id,tenant_id,id_empleado,empleado_id,tipo_contrato,fecha_inicio,estado,activo,
    sueldo_bruto,salario,moneda,regimen_pensionario,jornada_laboral)
    VALUES(v_contract,v_tenant,v_emp,v_emp,'indefinido','2026-01-01','vigente',true,1200,1200,'PEN','ONP','tiempo_completo');
  SELECT id INTO v_c001 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='001' AND activo;
  SELECT id INTO v_c006 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='006' AND activo;
  SELECT id INTO v_c007 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='007' AND activo;
  SELECT id INTO v_c104 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='104' AND activo;
  SELECT id INTO v_c201 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='201' AND activo;
  IF v_c001 IS NULL OR v_c006 IS NULL OR v_c007 IS NULL OR v_c104 IS NULL OR v_c201 IS NULL THEN
    RAISE EXCEPTION 'Grat fixture concepts missing'; END IF;
  v_source:=jsonb_build_object('periodo','2026-06','monto',1200,'fuente','FUENTE_EXTERNA_DECLARADA',
    'declarado_por',v_actor,'referencia','VERIFY-GRAT-JUNE');
  v_rows:=jsonb_build_array(jsonb_build_object('empleado_id',v_emp,'dias_trabajados',30,'horas_extras_25',0,'horas_extras_35',0,
    'tardanzas_minutos',0,'faltas',0,'total_ingresos',2508,'total_descuentos',156,'total_aportes',108,'neto_pagar',2352,
    'metadata',jsonb_build_object('base_gratificacion_ordinaria',v_source),
    'conceptos',jsonb_build_array(jsonb_build_object('concepto_id',v_c001,'monto',1200),
      jsonb_build_object('concepto_id',v_c006,'monto',1200),jsonb_build_object('concepto_id',v_c007,'monto',108),
      jsonb_build_object('concepto_id',v_c104,'monto',156),jsonb_build_object('concepto_id',v_c201,'monto',108))));
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo','2026-07','pais_codigo','PE','moneda','PEN'),v_actor,'verify-grat570');
  v_planilla:=(v_result->>'id')::uuid;
  BEGIN
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_planilla,v_rows,(v_foreign->>'user_id')::uuid);
    RAISE EXCEPTION 'Foreign gratuity actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    v_bad:=jsonb_set(v_rows,'{0,metadata,base_gratificacion_ordinaria,periodo}','"2026-07"');
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_planilla,v_bad,v_actor);
    RAISE EXCEPTION 'Wrong source period accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    v_bad:=jsonb_set(v_rows,'{0,metadata,base_gratificacion_ordinaria,referencia}','" "');
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_planilla,v_bad,v_actor);
    RAISE EXCEPTION 'Unauditable external base accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_planilla,v_rows,v_actor);
  IF (SELECT metadata->'base_gratificacion_ordinaria' FROM public.empleado_planilla WHERE planilla_id=v_planilla AND empleado_id=v_emp)
    IS DISTINCT FROM v_source THEN RAISE EXCEPTION 'Auditable source metadata not durable'; END IF;
  v_result:=public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_planilla,v_rows,v_actor);
  IF COALESCE((v_result->>'idempotent')::boolean,false)=false
    OR (SELECT count(*) FROM public.empleado_planilla WHERE planilla_id=v_planilla)<>1 THEN
    RAISE EXCEPTION 'Gratification source retry not idempotent'; END IF;
  BEGIN
    v_bad:=jsonb_set(v_rows,'{0,metadata,base_gratificacion_ordinaria,monto}','1300');
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_planilla,v_bad,v_actor);
    RAISE EXCEPTION 'Changed historical base accepted as same calculation intent';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo','2026-12','pais_codigo','PE','moneda','PEN'),v_actor,'verify-grat570-fail');
  v_failed:=(v_result->>'id')::uuid;
  v_bad:=jsonb_set(jsonb_set(v_rows,'{0,metadata,base_gratificacion_ordinaria,periodo}','"2026-11"'),
    '{0,metadata,base_gratificacion_ordinaria,referencia}','"VERIFY-GRAT-FAIL"');
  BEGIN
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_failed,v_bad,v_actor);
    RAISE EXCEPTION 'Late source failure did not occur';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message<>'VERIFY_GRAT_METADATA_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT lower(estado::text) FROM public.planillas WHERE id=v_failed)<>'borrador'
    OR EXISTS(SELECT 1 FROM public.empleado_planilla WHERE planilla_id=v_failed)
    OR EXISTS(SELECT 1 FROM public.outbox_events WHERE aggregate_id=v_failed::text) THEN
    RAISE EXCEPTION 'Late gratuity metadata failure persisted partial effects'; END IF;

  -- La fuente de contrato debe pertenecer al empleado y cubrir el corte,
  -- con el salario persistido; no basta un UUID o importe proporcionado.
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo','2027-07','pais_codigo','PE','moneda','PEN'),v_actor,'verify-grat570-historical');
  v_hist_planilla:=(v_result->>'id')::uuid;
  v_hist_source:=jsonb_build_object('periodo','2027-06','monto',1200,'fuente','CONTRATO_HISTORICO',
    'declarado_por',v_actor,'contrato_id',v_contract,'sueldo_bruto',1200,'asignacion_familiar',0);
  v_hist_rows:=jsonb_set(v_rows,'{0,metadata,base_gratificacion_ordinaria}',v_hist_source);
  BEGIN
    v_bad:=jsonb_set(v_hist_rows,'{0,metadata,base_gratificacion_ordinaria,contrato_id}',to_jsonb(gen_random_uuid()));
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_hist_planilla,v_bad,v_actor);
    RAISE EXCEPTION 'Unknown historical contract accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'GRATIFICACION_CONTRACT_SOURCE_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    v_bad:=jsonb_set(jsonb_set(v_hist_rows,'{0,metadata,base_gratificacion_ordinaria,sueldo_bruto}','1201'),
      '{0,metadata,base_gratificacion_ordinaria,monto}','1201');
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_hist_planilla,v_bad,v_actor);
    RAISE EXCEPTION 'Invented historical salary accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'GRATIFICACION_CONTRACT_SOURCE_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.contratos SET fecha_fin='2027-06-29' WHERE id=v_contract;
    PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_hist_planilla,v_hist_rows,v_actor);
    RAISE EXCEPTION 'Contract not covering source cutoff accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'GRATIFICACION_CONTRACT_SOURCE_INVALID' THEN RAISE; END IF;
  END;
  PERFORM public.guardar_calculo_planilla_gratificacion_tx_570(v_tenant,v_hist_planilla,v_hist_rows,v_actor);
  IF (SELECT metadata->'base_gratificacion_ordinaria' FROM public.empleado_planilla
      WHERE planilla_id=v_hist_planilla AND empleado_id=v_emp) IS DISTINCT FROM v_hist_source THEN
    RAISE EXCEPTION 'Historical contract source not durable'; END IF;
  RAISE NOTICE 'GRAT570 PASS: external and historical sources durable, tenant/actor, cutoff/salary/period/reference validation, retry, changed intention rejection, late metadata rollback';
END $$;
ROLLBACK;

-- EPS: snapshot y atomicidad del cálculo real.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'EPS verifier only permits local ephemeral erp_e2e'; END IF;
  IF NOT has_function_privilege('service_role','public.guardar_calculo_planilla_eps_tx_570(uuid,uuid,jsonb,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.guardar_calculo_planilla_eps_tx_570(uuid,uuid,jsonb,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.guardar_calculo_planilla_eps_tx_570(uuid,uuid,jsonb,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'EPS writer ACL invalid';
  END IF;
END $$;
CREATE FUNCTION pg_temp.verify_eps_snapshot_fail_570() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.metadata->'eps_cobertura'->>'referencia'='VERIFY-EPS-570-FAIL' THEN
    RAISE EXCEPTION 'VERIFY_EPS_SNAPSHOT_FAILURE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verify_eps_snapshot_fail_570 AFTER UPDATE OF metadata ON public.planillas
FOR EACH ROW EXECUTE FUNCTION pg_temp.verify_eps_snapshot_fail_570();
CREATE FUNCTION pg_temp.verify_eps_outbox_fail_570() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.aggregate_id=current_setting('app.verify_eps570_fail_outbox',true) THEN
    RAISE EXCEPTION 'VERIFY_EPS_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verify_eps_outbox_fail_570 AFTER INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.verify_eps_outbox_fail_570();
DO $$
DECLARE
  v_demo jsonb;v_other jsonb;v_tenant uuid;v_actor uuid;v_foreign uuid;v_approver uuid:=gen_random_uuid();
  v_denied uuid:=gen_random_uuid();v_admin_role uuid;v_emp uuid;v_c201 uuid;v_c001 uuid;
  v_planilla uuid;v_duplicate uuid;v_fail uuid;v_eps jsonb;v_rows jsonb;v_bad jsonb;v_result jsonb;
  v_carry_rows jsonb;v_carry_snapshot jsonb;
  v_period text:=to_char(clock_timestamp() AT TIME ZONE 'America/Lima','YYYY-MM');v_message text;
  v_duplicate_period text:=to_char((clock_timestamp() AT TIME ZONE 'America/Lima')-interval '2 months','YYYY-MM');
  v_fail_period text:=to_char((clock_timestamp() AT TIME ZONE 'America/Lima')-interval '1 month','YYYY-MM');
BEGIN
  UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',
    allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  v_demo:=public.create_demo_tenant('VERIFY EPS570',1,'PE');
  v_other:=public.create_demo_tenant('VERIFY EPS570 OTHER',1,'PE');
  v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;v_foreign:=(v_other->>'user_id')::uuid;
  SELECT id INTO v_admin_role FROM public.roles WHERE tenant_id=v_tenant AND upper(nombre)='ADMIN_DEMO';
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,apellido,nombres,apellidos,activo,estado,is_super_admin)
  VALUES(v_approver,v_tenant,'eps-approve-'||v_tenant||'@example.test','EPS','Approver','EPS','Approver',true,'ACTIVO',false),
        (v_denied,v_tenant,'eps-denied-'||v_tenant||'@example.test','EPS','Denied','EPS','Denied',true,'ACTIVO',false);
  INSERT INTO public.user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(v_approver,v_admin_role,v_tenant);
  SELECT id INTO v_emp FROM public.empleados WHERE tenant_id=v_tenant AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  IF v_emp IS NULL THEN
    INSERT INTO public.empleados(tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
    VALUES(v_tenant,'EPS Verify','EPS','Verify','EPS-570','DNI','57057057','activo',true,'2026-01-01','PE') RETURNING id INTO v_emp;
  END IF;
  SELECT id INTO v_c201 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='201' AND activo;
  SELECT id INTO v_c001 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='001' AND activo;
  IF v_c201 IS NULL OR v_c001 IS NULL THEN RAISE EXCEPTION 'EPS fixture concepts missing'; END IF;
  INSERT INTO public.rrhh_peru_fichas_laborales(tenant_id,empleado_id,regimen_salud_codigo,eps_servicios_propios_codigo)
    VALUES(v_tenant,v_emp,'01','3') ON CONFLICT(tenant_id,empleado_id)
    DO UPDATE SET regimen_salud_codigo='01',eps_servicios_propios_codigo='3',activo=true;
  v_eps:=jsonb_build_object('periodo_aplicacion',v_period,'periodo_cobertura',v_period,
    'fuente','FUENTE_EXTERNA_DECLARADA','declarado_por',v_actor,'monto_pagado',100,
    'fecha_pago',v_period||'-01','referencia','VERIFY-EPS-570-PAID','pago_oportuno',true,
    'aporte_essalud_origen',108,'trabajadores_cubiertos_origen',1,'uit_origen',5500,
    'limite_25_por_ciento',27,'limite_10_uit',550,'credito_generado',27,'credito_arrastre_declarado',0,
    'referencia_arrastre',NULL,'credito_aplicado',27,'credito_saldo',0,'aporte_essalud_bruto',108,'aporte_essalud_neto',81);
  v_rows:=jsonb_build_array(jsonb_build_object('empleado_id',v_emp,'dias_trabajados',30,
    'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,
    'total_ingresos',1200,'total_descuentos',156,'total_aportes',81,'neto_pagar',1044,
    'conceptos',jsonb_build_array(jsonb_build_object('concepto_id',v_c201,'monto',81,'observaciones','EsSalud bruto108;EPS27;neto81'),
       jsonb_build_object('concepto_id',v_c001,'monto',1200)),
    'metadata',jsonb_build_object('eps_cobertura_snapshot',v_eps,'essalud',jsonb_build_object('bruto',108,'credito_eps',27,'neto',81))));
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo',v_period,'pais_codigo','PE','moneda','PEN'),v_actor,'verify-eps570');
  v_planilla:=(v_result->>'id')::uuid;
  BEGIN
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_foreign,v_eps);
    RAISE EXCEPTION 'Foreign actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_denied,v_eps);
    RAISE EXCEPTION 'Actor without permission accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    v_bad:=jsonb_set(v_eps,'{credito_generado}','28');
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Credit above legal bound accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    v_bad:=jsonb_set(v_eps,'{monto_pagado}','null');
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Null EPS amount accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    v_bad:=jsonb_set(v_eps,'{fecha_pago}',to_jsonb(to_char((clock_timestamp() AT TIME ZONE 'America/Lima')::date+1,'YYYY-MM-DD')));
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Future EPS payment accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT lower(estado::text) FROM public.planillas WHERE id=v_planilla)<>'borrador'
     OR EXISTS(SELECT 1 FROM public.empleado_planilla WHERE planilla_id=v_planilla) THEN
    RAISE EXCEPTION 'Invalid EPS attempt persisted partial effects'; END IF;
  v_result:=public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_actor,v_eps);
  IF (SELECT total_aportes FROM public.planillas WHERE id=v_planilla)<>81
     OR (SELECT metadata->'eps_cobertura' FROM public.planillas WHERE id=v_planilla) IS DISTINCT FROM v_eps
     OR (SELECT metadata->'essalud' FROM public.empleado_planilla WHERE planilla_id=v_planilla AND empleado_id=v_emp)
          IS DISTINCT FROM jsonb_build_object('bruto',108,'credito_eps',27,'neto',81) THEN
    RAISE EXCEPTION 'EPS net/header/employee snapshot not durable'; END IF;
  v_result:=public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_rows,v_actor,v_eps);
  IF COALESCE((v_result->>'idempotent')::boolean,false)=false
     OR (SELECT count(*) FROM public.empleado_planilla WHERE planilla_id=v_planilla)<>1 THEN
    RAISE EXCEPTION 'EPS retry duplicated employee calculation'; END IF;
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo',v_duplicate_period,'pais_codigo','PE','moneda','PEN'),v_actor,'verify-eps570-dupe');
  v_duplicate:=(v_result->>'id')::uuid;
  BEGIN
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_duplicate,v_rows,v_actor,v_eps);
    RAISE EXCEPTION 'EPS payment credited in another application period';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT lower(estado::text) FROM public.planillas WHERE id=v_duplicate)<>'borrador' THEN
    RAISE EXCEPTION 'Duplicate source changed header'; END IF;
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo',v_fail_period,'pais_codigo','PE','moneda','PEN'),v_actor,'verify-eps570-fail');
  v_fail:=(v_result->>'id')::uuid;
  v_bad:=v_eps||jsonb_build_object('periodo_aplicacion',v_fail_period,'periodo_cobertura',v_fail_period,
    'fecha_pago',v_fail_period||'-01','referencia','VERIFY-EPS-570-FAIL');
  v_rows:=jsonb_set(v_rows,'{0,metadata,eps_cobertura_snapshot}',v_bad);
  BEGIN
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_fail,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Forced snapshot failure did not occur';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message<>'VERIFY_EPS_SNAPSHOT_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT lower(estado::text) FROM public.planillas WHERE id=v_fail)<>'borrador'
     OR EXISTS(SELECT 1 FROM public.empleado_planilla WHERE planilla_id=v_fail)
     OR EXISTS(SELECT 1 FROM public.outbox_events WHERE aggregate_id=v_fail::text) THEN
    RAISE EXCEPTION 'Late EPS snapshot failure did not roll back complete calculation'; END IF;
  PERFORM set_config('app.verify_eps570_fail_outbox',v_planilla::text,true);
  BEGIN
    PERFORM public.aprobar_planilla_tx(v_tenant,v_planilla,v_approver::text);
    RAISE EXCEPTION 'Forced approval outbox failure did not occur';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message<>'VERIFY_EPS_OUTBOX_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT lower(estado::text) FROM public.planillas WHERE id=v_planilla)<>'calculada'
     OR EXISTS(SELECT 1 FROM public.outbox_events WHERE aggregate_id=v_planilla::text)
     OR (SELECT metadata->'eps_cobertura' FROM public.planillas WHERE id=v_planilla) IS DISTINCT FROM v_eps THEN
    RAISE EXCEPTION 'Approval/outbox failure changed frozen EPS calculation'; END IF;
  -- Pago tardío de cobertura anterior genera saldo real: base original1080,
  -- crédito270, aporte actual108, saldo162. Se conserva y sólo consume una vez.
  v_carry_snapshot:=v_eps||jsonb_build_object('periodo_aplicacion',v_duplicate_period,
    'periodo_cobertura',to_char(to_date(v_duplicate_period||'-01','YYYY-MM-DD')-interval '1 month','YYYY-MM'),
    'fecha_pago',v_duplicate_period||'-01','referencia','VERIFY-EPS-CARRY-ORIGIN','pago_oportuno',false,
    'monto_pagado',1000,'aporte_essalud_origen',1080,'limite_25_por_ciento',270,'credito_generado',270,
    'credito_aplicado',108,'credito_saldo',162,'aporte_essalud_neto',0);
  v_carry_rows:=jsonb_set(v_rows,'{0,metadata}',jsonb_build_object('eps_cobertura_snapshot',v_carry_snapshot,
    'essalud',jsonb_build_object('bruto',108,'credito_eps',108,'neto',0)));
  v_carry_rows:=jsonb_set(jsonb_set(v_carry_rows,'{0,total_aportes}','0'),'{0,conceptos,0,monto}','0');
  PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_duplicate,v_carry_rows,v_actor,v_carry_snapshot);
  IF (SELECT (metadata->'eps_cobertura'->>'credito_saldo')::numeric FROM public.planillas WHERE id=v_duplicate)<>162 THEN
    RAISE EXCEPTION 'Prior-period EPS surplus not persisted'; END IF;
  v_carry_snapshot:=v_eps||jsonb_build_object('periodo_aplicacion',v_fail_period,'periodo_cobertura',v_fail_period,
    'fecha_pago',v_fail_period||'-01','referencia','VERIFY-EPS-CARRY-NEXT','monto_pagado',0,
    'trabajadores_cubiertos_origen',0,'aporte_essalud_origen',0,'limite_25_por_ciento',0,'limite_10_uit',0,
    'credito_generado',0,'credito_aplicado',108,'credito_saldo',54,'credito_arrastre_declarado',162,
    'planilla_arrastre_id',v_duplicate,'referencia_arrastre','Saldo planilla origen verificado','aporte_essalud_neto',0);
  v_carry_rows:=jsonb_set(v_carry_rows,'{0,metadata,eps_cobertura_snapshot}',v_carry_snapshot);
  BEGIN
    v_bad:=v_carry_snapshot||jsonb_build_object('credito_arrastre_declarado',0,'credito_aplicado',0,
      'credito_saldo',0,'aporte_essalud_neto',108,'planilla_arrastre_id',NULL,
      'trabajadores_cubiertos_origen',1,'aporte_essalud_origen',108,'limite_25_por_ciento',27,'limite_10_uit',550);
    v_rows:=jsonb_set(v_carry_rows,'{0,metadata}',jsonb_build_object('eps_cobertura_snapshot',v_bad,
      'essalud',jsonb_build_object('bruto',108,'credito_eps',0,'neto',108)));
    v_rows:=jsonb_set(jsonb_set(v_rows,'{0,total_aportes}','108'),'{0,conceptos,0,monto}','108');
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_fail,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Mandatory prior EPS carry omitted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message NOT LIKE 'Existe saldo EPS previo disponible:%' THEN RAISE; END IF;
  END;
  BEGIN
    v_bad:=v_carry_snapshot||jsonb_build_object('planilla_arrastre_id',NULL,'referencia_arrastre','Externo sin fuente ERP');
    v_rows:=jsonb_set(v_carry_rows,'{0,metadata,eps_cobertura_snapshot}',v_bad);
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_fail,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Zero coverage accepted with unverified external carry';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'EPS_ZERO_COVERAGE_REQUIRES_ERP_CARRY' THEN RAISE; END IF;
  END;
  BEGIN
    v_bad:=jsonb_set(v_carry_snapshot,'{planilla_arrastre_id}',to_jsonb(v_planilla));
    v_rows:=jsonb_set(v_carry_rows,'{0,metadata,eps_cobertura_snapshot}',v_bad);
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_fail,v_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Foreign-period carry origin accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message NOT LIKE 'Existe saldo EPS previo disponible:%' THEN RAISE; END IF;
  END;
  PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_fail,v_carry_rows,v_actor,v_carry_snapshot);
  IF (SELECT total_aportes FROM public.planillas WHERE id=v_fail)<>0
    OR (SELECT (metadata->'eps_cobertura'->>'credito_saldo')::numeric FROM public.planillas WHERE id=v_fail)<>54 THEN
    RAISE EXCEPTION 'Carried EPS credit did not preserve54 remaining'; END IF;
  BEGIN
    v_bad:=v_carry_snapshot||jsonb_build_object('periodo_aplicacion',v_period,'periodo_cobertura',v_period,
      'fecha_pago',v_period||'-01','referencia','VERIFY-EPS-CARRY-DUPLICATE');
    v_carry_rows:=jsonb_set(v_carry_rows,'{0,metadata,eps_cobertura_snapshot}',v_bad);
    PERFORM public.guardar_calculo_planilla_eps_tx_570(v_tenant,v_planilla,v_carry_rows,v_actor,v_bad);
    RAISE EXCEPTION 'Prior EPS carry consumed twice';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'EPS570 PASS: caps/net snapshot, tenant+RBAC, idempotency, application period, amount/date validation, late snapshot/outbox rollback, verified carry-only without payment/coverage conservation162->54, external/duplicate rejection';
END $$;
ROLLBACK;




-- POS: saldo nominal/físico y faltante con redondeo, controles originales.
\set ON_ERROR_STOP on

-- Contrato real 518. Todo ocurre en erp_e2e y termina en ROLLBACK.
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 518 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_supervisor uuid := gen_random_uuid();
  v_sin_rol uuid := gen_random_uuid();
  v_almacen uuid;
  v_caja uuid;
  v_otra_caja uuid;
  v_sesion_redondeo uuid;
  v_sesion_sin_evidencia uuid;
  v_sesion_supervisor uuid;
  v_sesion_cajero_supervisor uuid;
  v_rol_supervisor uuid;
  v_producto uuid := gen_random_uuid();
  v_metodo_efectivo uuid;
  v_result jsonb;
  v_retry jsonb;
  v_rechazo jsonb;
  v_payload jsonb;
  v_def text;
  v_close_event uuid;
  v_count bigint;
  v_security_definer boolean;
  v_config text[];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Regla pura: exige evidencia coincidente; el acumulado puede superar .09.
  ---------------------------------------------------------------------------
  IF to_regprocedure('app.es_redondeo_efectivo_legal_518(numeric,text,text,numeric)') IS NULL
     OR to_regprocedure('app.cierre_caja_requiere_supervisor_518(numeric,numeric,text,text,numeric)') IS NULL
     OR to_regprocedure('app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('app.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)') IS NULL
     OR to_regprocedure('public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('app.resolver_tolerancia_cierre_caja_518(uuid,uuid)') IS NULL
     OR to_regprocedure('public.resolver_tolerancia_cierre_caja_518(uuid,uuid)') IS NULL
     OR to_regprocedure('app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_518: faltan funciones del contrato';
  END IF;

  IF app.cierre_caja_requiere_supervisor_518(-0.01, 0, 'PE', 'PEN', 0.01)
     OR app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'PEN', 0.04)
     OR app.cierre_caja_requiere_supervisor_518(-0.13, 0, 'PER', 'PEN', 0.13) THEN
    RAISE EXCEPTION 'VERIFY_518: el redondeo legal sigue exigiendo supervisor';
  END IF;
  IF NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'PEN', 0)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'PEN', 0.03)
     OR NOT app.cierre_caja_requiere_supervisor_518(0.04, 0, 'PE', 'PEN', 0.04)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'AR', 'ARS', 0.04)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'CO', 'COP', 0.04)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'USD', 0.04) THEN
    RAISE EXCEPTION 'VERIFY_518: diferencia casual/sobrante/otro país/moneda fue perdonada';
  END IF;
  IF app.cierre_caja_requiere_supervisor_518(2, 2, 'AR', 'ARS', 0)
     OR app.cierre_caja_requiere_supervisor_518(-2, 2, 'CO', 'COP', 0)
     OR NOT app.cierre_caja_requiere_supervisor_518(2.01, 2, 'PE', 'PEN', 0) THEN
    RAISE EXCEPTION 'VERIFY_518: tolerancia configurable rota';
  END IF;
  IF app.pos_intencion_comercial_469('{}'::jsonb)
       IS DISTINCT FROM app.pos_intencion_comercial_469(
         '{"redondeo_efectivo_legal":false}'::jsonb)
     OR app.pos_intencion_comercial_469('{}'::jsonb)
       IS NOT DISTINCT FROM app.pos_intencion_comercial_469(
         '{"redondeo_efectivo_legal":true}'::jsonb) THEN
    RAISE EXCEPTION 'VERIFY_518: compatibilidad de huella comercial pre-518 rota';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Fixture local y precedencia específica > global.
  ---------------------------------------------------------------------------
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localcashverifyxxxxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY CASH CLOSE 518', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  UPDATE public.tenants SET pais = 'PE' WHERE id = v_tenant;
  UPDATE public.empresa_config
  SET pais = 'PE', moneda_defecto = 'PEN', ruc = '20600000518',
      razon_social = 'Empresa verify cierre 518'
  WHERE tenant_id = v_tenant;

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, nombre, password_hash, estado, activo
  ) VALUES
    (v_supervisor, v_tenant, 'supervisor-518@verify.local', 'Supervisor 518', 'x', 'ACTIVO', true),
    (v_sin_rol, v_tenant, 'sin-rol-518@verify.local', 'Sin rol 518', 'x', 'ACTIVO', true);

  SELECT id INTO v_rol_supervisor FROM public.roles
  WHERE tenant_id = v_tenant AND upper(btrim(nombre)) = 'SUPERVISOR'
  ORDER BY id LIMIT 1;
  IF v_rol_supervisor IS NULL THEN
    INSERT INTO public.roles (tenant_id, nombre, descripcion, activo)
    VALUES (v_tenant, 'SUPERVISOR', 'Rol verify 518', true)
    RETURNING id INTO v_rol_supervisor;
  END IF;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  VALUES (v_supervisor, v_rol_supervisor, v_tenant)
  ON CONFLICT DO NOTHING;
  BEGIN
    PERFORM public.registrar_pin_supervisor_caja_tx_518(
      v_tenant, v_sin_rol, v_supervisor, '481590', 'pin-unauthorized-518'
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_USERS_MANAGE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_result := public.registrar_pin_supervisor_caja_tx_518(
    v_tenant, v_actor, v_supervisor, '481590', 'pin-supervisor-518'
  );
  IF (v_result->>'supervisor_id')::uuid <> v_supervisor
     OR (v_result->>'pin_version')::integer <> 1
     OR v_result ? 'pin' OR v_result ? 'hash_pin'
     OR EXISTS (
       SELECT 1 FROM public.supervisor_pins sp
       WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor
         AND (sp.hash_pin = '481590' OR sp.hash_pin NOT LIKE '$2%')
     ) THEN
    RAISE EXCEPTION 'VERIFY_518: alta PIN no es segura %', v_result;
  END IF;
  v_retry := public.registrar_pin_supervisor_caja_tx_518(
    v_tenant, v_actor, v_supervisor, '481590', 'pin-supervisor-518'
  );
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_retry->>'pin_version')::integer <> 1
     OR (SELECT count(*) FROM public.supervisor_pins sp
         WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor) <> 1
     OR (SELECT count(*) FROM public.supervisor_pin_rotaciones_518 op
         WHERE op.tenant_id = v_tenant
           AND op.idempotency_key = 'pin-supervisor-518') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: retry de rotación PIN duplicó la versión %', v_retry;
  END IF;
  BEGIN
    PERFORM public.registrar_pin_supervisor_caja_tx_518(
      v_tenant, v_actor, v_supervisor, '846209', 'pin-supervisor-518'
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PIN_IDEMPOTENCY_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.supervisor_pin_rotaciones_518
    SET resultado = resultado || '{"alterado":true}'::jsonb
    WHERE tenant_id = v_tenant AND idempotency_key = 'pin-supervisor-518';
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PIN_OPERATION_IMMUTABLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- El actor demo también es administrador/supervisor; se le registra PIN para
  -- demostrar que el selector lo excluye aunque tenga credencial válida.
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  VALUES (v_actor, v_rol_supervisor, v_tenant)
  ON CONFLICT DO NOTHING;
  PERFORM public.registrar_pin_supervisor_caja_tx_518(
    v_tenant, v_actor, v_actor, '864209', 'pin-actor-518'
  );
  PERFORM public.registrar_pin_supervisor_tx(v_tenant, v_actor, v_sin_rol, '736284');

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (v_tenant, 'ALM-518', 'Almacén 518', 'ACTIVO', true, true, 'PE')
  RETURNING id INTO v_almacen;
  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (v_tenant, 'CAJA-518', 'Caja 518', 'ACTIVO', v_almacen, 'MOSTRADOR', v_actor)
  RETURNING id INTO v_caja;
  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (v_tenant, 'CAJA-518-B', 'Caja 518 B', 'ACTIVO', v_almacen, 'MOSTRADOR', v_actor)
  RETURNING id INTO v_otra_caja;

  SELECT id INTO v_metodo_efectivo
  FROM public.metodos_pago
  WHERE tenant_id IS NULL AND lower(btrim(codigo)) = 'efectivo'
    AND upper(coalesce(tipo, '')) = 'EFECTIVO'
  ORDER BY id LIMIT 1;
  INSERT INTO public.productos (
    id, tenant_id, codigo, nombre, estado, activo, es_servicio,
    controla_stock, precio, precio_venta, precio_unitario, precio_compra,
    costo, stock_actual, stock, stock_reservado, unidad_medida,
    afectacion_igv, impuesto
  ) VALUES (
    v_producto, v_tenant, 'PROD-518', 'Servicio redondeo 518', 'ACTIVO', true,
    true, false, 8.51, 8.51, 8.51, 1, 1, 0, 0, 0, 'ZZ', '10', 18
  );

  DELETE FROM public.configuracion_caja WHERE tenant_id = v_tenant;
  INSERT INTO public.configuracion_caja (
    tenant_id, caja_id, tolerancia_diferencia_cierre, estado, activo, updated_by
  ) VALUES
    (v_tenant, NULL, 2, 'ACTIVO', true, v_actor),
    (v_tenant, v_caja, 1, 'ACTIVO', true, v_actor),
    (v_tenant, v_otra_caja, 9, 'ACTIVO', true, v_actor);

  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 1
     OR public.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: específica no ganó a global';
  END IF;
  UPDATE public.configuracion_caja SET activo = false, estado = 'INACTIVO'
  WHERE tenant_id = v_tenant AND caja_id = v_caja;
  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_518: específica inactiva no cayó a global';
  END IF;
  UPDATE public.configuracion_caja SET activo = false, estado = 'INACTIVO'
  WHERE tenant_id = v_tenant AND caja_id IS NULL;
  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_518: sin fila activa no cayó a cero';
  END IF;
  UPDATE public.configuracion_caja
  SET activo = true, estado = 'ACTIVO', tolerancia_diferencia_cierre = 0
  WHERE tenant_id = v_tenant AND (caja_id = v_caja OR caja_id IS NULL);
  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_518: múltiples filas/otra caja alteraron precedencia';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Sin evidencia no hay perdón; tres ventas documentadas acumulan .11.
  ---------------------------------------------------------------------------
  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 203.84, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-SIN-EVIDENCIA', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_sin_evidencia;
  UPDATE public.supervisor_pins
  SET estado = 'BLOQUEADO', activo = false,
      bloqueado_hasta = now() + interval '5 minutes'
  WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
    AND lower(estado::text) = 'activo';
  IF EXISTS (
    SELECT 1
    FROM public.listar_supervisores_autorizados_caja_518(
      v_tenant, v_actor, v_sesion_sin_evidencia
    ) s
    WHERE s.id = v_supervisor
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: selector expuso supervisor con bloqueo vigente';
  END IF;
  UPDATE public.supervisor_pins
  SET bloqueado_hasta = now() - interval '1 second'
  WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
    AND lower(estado::text) = 'bloqueado';
  IF NOT EXISTS (
    SELECT 1
    FROM public.listar_supervisores_autorizados_caja_518(
      v_tenant, v_actor, v_sesion_sin_evidencia
    ) s
    WHERE s.id = v_supervisor
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: selector no reactivó bloqueo vencido; pin=%',
      (SELECT to_jsonb(sp) FROM public.supervisor_pins sp
       WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor
       ORDER BY sp.pin_version DESC LIMIT 1);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.listar_supervisores_autorizados_caja_518(
      v_tenant, v_actor, v_sesion_sin_evidencia
    ) s
    WHERE s.id = v_actor
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: selector expuso actor/cajero responsable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supervisor_pins sp
    WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor
      AND (lower(sp.estado::text) <> 'activo' OR NOT sp.activo
           OR sp.bloqueado_hasta IS NOT NULL OR sp.intentos_fallidos <> 0)
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: reactivación no normalizó la credencial';
  END IF;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_sin_evidencia, v_actor,
      jsonb_build_object('monto_contado', 203.80, 'denominaciones', '{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_UNDOCUMENTED_DIFFERENCE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion_sin_evidencia)
       <> 'ABIERTA' THEN
    RAISE EXCEPTION 'VERIFY_518: diferencia casual cerró la sesión';
  END IF;
  v_result := public.cerrar_caja_tx(
    v_tenant, v_sesion_sin_evidencia, v_actor,
    jsonb_build_object('monto_contado', 203.80, 'denominaciones', '{}'::jsonb,
      'supervisor_id', v_supervisor, 'codigo_autorizacion', '481590')
  );
  IF v_result->>'tipo_diferencia' <> 'FALTANTE'
     OR coalesce((v_result->>'redondeo_efectivo_legal')::boolean, false) THEN
    RAISE EXCEPTION 'VERIFY_518: diferencia casual fue reclasificada %', v_result;
  END IF;

  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 200, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-A', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_redondeo;

  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-a',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 8.51, 'precio_original', 8.51,
        'descuento_monto', 0, 'subtotal', 8.51, 'igv', 1.53)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 10.00, 'moneda', 'PEN'))
    )
  );
  IF coalesce((v_result->>'redondeo_efectivo_legal')::boolean, false) IS NOT TRUE
     OR (v_result->>'total')::numeric <> 10.04
     OR (v_result->>'monto_efectivo_cobrado')::numeric <> 10.00
     OR (v_result->>'monto_ajuste_redondeo')::numeric <> 0.04 THEN
    RAISE EXCEPTION 'VERIFY_518: primera venta no documentó ajuste %', v_result;
  END IF;

  v_retry := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-a',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 8.51, 'precio_original', 8.51,
        'descuento_monto', 0, 'subtotal', 8.51, 'igv', 1.53)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 10.00, 'moneda', 'PEN'))
    )
  );
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_retry->>'monto_ajuste_redondeo')::numeric <> 0.04
     OR (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant
           AND a.sesion_caja_id = v_sesion_redondeo) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: replay POS duplicó o perdió evidencia %', v_retry;
  END IF;

  UPDATE public.productos
  SET precio = 8.50, precio_venta = 8.50, precio_unitario = 8.50,
      updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;
  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-b',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 8.50, 'precio_original', 8.50,
        'descuento_monto', 0, 'subtotal', 8.50, 'igv', 1.53)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 10.00, 'moneda', 'PEN'))
    )
  );
  IF (v_result->>'total')::numeric <> 10.03
     OR (v_result->>'monto_ajuste_redondeo')::numeric <> 0.03 THEN
    RAISE EXCEPTION 'VERIFY_518: segunda venta no documentó ajuste %', v_result;
  END IF;

  IF (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
      WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 2
     OR (SELECT round(sum(a.monto_ajuste), 2)
         FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 0.07
     OR EXISTS (
       SELECT 1 FROM public.ajustes_redondeo_efectivo_pos a
       LEFT JOIN public.ventas_pos v ON v.id = a.venta_pos_id AND v.tenant_id = a.tenant_id
       LEFT JOIN public.ventas_pos_pagos p ON p.id = a.pago_pos_id AND p.tenant_id = a.tenant_id
       LEFT JOIN public.movimientos_caja m ON m.id = a.movimiento_caja_id AND m.tenant_id = a.tenant_id
       WHERE a.tenant_id = v_tenant AND (v.id IS NULL OR p.id IS NULL OR m.id IS NULL
         OR v.sesion_caja_id <> a.sesion_caja_id OR m.sesion_caja_id <> a.sesion_caja_id
         OR upper(p.metodo_pago_tipo) <> 'EFECTIVO'
         OR a.evidencia_fingerprint !~ '^[0-9a-f]{64}$')
     ) THEN
    RAISE EXCEPTION 'VERIFY_518: ledger de ajustes acumulados inconsistente';
  END IF;

  BEGIN
    UPDATE public.ajustes_redondeo_efectivo_pos SET monto_ajuste = 0.01
    WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo;
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_IMMUTABLE_UPDATE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.ajustes_redondeo_efectivo_pos
    WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo;
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_IMMUTABLE_DELETE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-invalid',
      jsonb_build_object(
        'emitir_cpe', false, 'redondeo_efectivo_legal', true,
        'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
        'moneda', 'PEN', 'ticket_serie', 'T518',
        'items', jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto, 'cantidad', 1,
          'precio_unitario', 8.50, 'precio_original', 8.50,
          'descuento_monto', 0, 'subtotal', 8.50, 'igv', 1.53)),
        'pagos', jsonb_build_array(jsonb_build_object(
          'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
          'monto', 9.90, 'moneda', 'PEN'))
      )
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PER_SALE_LIMIT_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.ventas_pos v
      WHERE v.tenant_id = v_tenant AND v.idempotency_key = 'rounding-sale-518-invalid') <> 0
     OR (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_518: rechazo de ajuste inválido dejó impactos parciales';
  END IF;

  -- Un total menor a S/ 0,10 puede redondearse legalmente a cero. El writer
  -- interno recibe el total contable, mientras el ledger conserva efectivo=0.
  UPDATE public.productos
  SET precio = 0.03, precio_venta = 0.03, precio_unitario = 0.03,
      updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;
  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-zero',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 0.03, 'precio_original', 0.03,
        'descuento_monto', 0, 'subtotal', 0.03, 'igv', 0.01)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 0, 'moneda', 'PEN'))
    )
  );
  IF (v_result->>'total')::numeric <> 0.04
     OR (v_result->>'monto_efectivo_cobrado')::numeric <> 0
     OR (v_result->>'monto_ajuste_redondeo')::numeric <> 0.04
     OR (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 3
     OR (SELECT round(sum(a.monto_ajuste), 2)
         FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 0.11 THEN
    RAISE EXCEPTION 'VERIFY_518: total sub-S/0.10 no quedó documentado %', v_result;
  END IF;

  -- 570: un faltante real 20 junto a redondeo documental0.11 exige
  -- supervisor por20 y no produce gasto/faltante20.11.
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant,v_sesion_redondeo,v_actor,jsonb_build_object('monto_contado',200,'denominaciones','{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_570_CASH_MIXED_SUPERVISOR_NOT_REQUIRED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    v_result:=public.cerrar_caja_tx(v_tenant,v_sesion_redondeo,v_actor,jsonb_build_object('monto_contado',200,'denominaciones','{}'::jsonb,'supervisor_id',v_supervisor,'codigo_autorizacion','481590','notas','Faltante y redondeo'));
    IF NOT (v_result->>'success')::boolean OR (v_result->>'diferencia')::numeric<>-20 OR (v_result->>'diferencia_nominal')::numeric<>-20.11
      OR (v_result->>'monto_esperado')::numeric<>220 OR (v_result->>'redondeo_efectivo_documentado')::numeric<>0.11 OR v_result->>'tipo_diferencia'<>'FALTANTE' THEN
      RAISE EXCEPTION 'VERIFY_570_CASH_MIXED_WRONG_FINANCIAL_RESULT'; END IF;
    SELECT payload INTO v_payload FROM public.outbox_events WHERE tenant_id=v_tenant AND event_id=(v_result->>'close_event_id')::uuid;
    IF (v_payload->>'diferenciaOperativa')::numeric<>-20 OR (v_payload->>'diferenciaNominal')::numeric<>-20.11 OR (v_payload->>'redondeoEfectivoDocumentado')::numeric<>0.11 THEN RAISE EXCEPTION 'VERIFY_570_CASH_MIXED_WRONG_OUTBOX'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.autorizaciones_caja WHERE tenant_id=v_tenant AND sesion_caja_id=v_sesion_redondeo AND monto_solicitado=20) THEN RAISE EXCEPTION 'VERIFY_570_CASH_MIXED_WRONG_AUTH_AMOUNT'; END IF;
    RAISE EXCEPTION 'VERIFY_570_ROLLBACK_MIXED_CASE';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VERIFY_570_ROLLBACK_MIXED_CASE' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.outbox_events WHERE tenant_id=v_tenant AND aggregate_id=v_sesion_redondeo::text AND event_type='caja.cerrada') THEN RAISE EXCEPTION 'VERIFY_570_MIXED_CASE_ROLLBACK_RESIDUE'; END IF;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_actor,
    jsonb_build_object('monto_contado', 220.00, 'denominaciones', '{}'::jsonb,
      'notas', 'Arqueo con redondeo legal 518')) INTO v_result;
  v_close_event := (v_result->>'close_event_id')::uuid;
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR v_result->>'estado' <> 'CERRADA'
     OR (v_result->>'diferencia')::numeric <> 0 OR (v_result->>'diferencia_nominal')::numeric<>-0.11 OR (v_result->>'monto_esperado')::numeric<>220
     OR v_result->>'tipo_diferencia' <> 'REDONDEO_EFECTIVO_LEGAL'
     OR coalesce((v_result->>'redondeo_efectivo_legal')::boolean, false) IS NOT TRUE
     OR (v_result->>'redondeo_efectivo_documentado')::numeric <> 0.11
     OR (v_result->>'redondeo_efectivo_cantidad')::integer <> 3
     OR v_result->>'supervisor_id' IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_518: cierre legal real inválido %', v_result;
  END IF;

  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id = v_tenant AND event_id = v_close_event;
  IF v_payload->>'tipoDiferencia' <> 'REDONDEO_EFECTIVO_LEGAL'
     OR coalesce((v_payload->>'redondeoEfectivoLegal')::boolean, false) IS NOT TRUE
     OR (v_payload->>'diferencia')::numeric <> 0 OR (v_payload->>'diferenciaNominal')::numeric<>-0.11 OR (v_payload->>'montoEsperadoFisico')::numeric<>220
     OR (v_payload->>'redondeoEfectivoDocumentado')::numeric <> 0.11
     OR (v_payload->>'redondeoEfectivoCantidad')::integer <> 3
     OR (v_payload->>'schemaVersion')::integer <> 570 THEN
    RAISE EXCEPTION 'VERIFY_518: outbox no congeló clase contable %', v_payload;
  END IF;
  IF (SELECT count(*) FROM public.cortes_caja
      WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'caja.cerrada'
           AND aggregate_id = v_sesion_redondeo::text) <> 1
     OR EXISTS (SELECT 1 FROM public.autorizaciones_caja
                WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo)
     OR NOT public.verificar_integridad_caja(v_tenant, v_sesion_redondeo, v_actor) THEN
    RAISE EXCEPTION 'VERIFY_518: postcondiciones del cierre legal inválidas';
  END IF;

  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_sin_rol,
      jsonb_build_object('monto_contado', 220.00, 'denominaciones', '{}'::jsonb,
        'notas', 'Arqueo con redondeo legal 518'));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_REPLAY_ACTOR_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_actor,
    jsonb_build_object('monto_contado', 220.00, 'denominaciones', '{}'::jsonb,
      'notas', 'Arqueo con redondeo legal 518')) INTO v_retry;
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_retry->>'close_event_id')::uuid <> v_close_event
     OR (SELECT count(*) FROM public.cortes_caja
         WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'caja.cerrada'
           AND aggregate_id = v_sesion_redondeo::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: replay duplicó efectos %', v_retry;
  END IF;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_actor,
      jsonb_build_object('monto_contado', 219.90, 'denominaciones', '{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PAYLOAD_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  ---------------------------------------------------------------------------
  -- 4. -0.10 exige otro actor, rol y PIN; evidencia durable no revela PIN.
  ---------------------------------------------------------------------------
  SELECT (public.abrir_caja_tx(v_tenant, v_otra_caja, v_actor, jsonb_build_object(
    'cajero_id', v_supervisor, 'monto_inicio', 100, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-CAJERO-SUP', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_cajero_supervisor;
  BEGIN
    PERFORM public.cerrar_caja_tx(
      v_tenant, v_sesion_cajero_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
        'supervisor_id', v_supervisor, 'codigo_autorizacion', '481590')
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_CASHIER_AUTHORIZATION_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion_cajero_supervisor)
       <> 'ABIERTA' THEN
    RAISE EXCEPTION 'VERIFY_518: el cajero responsable se autoautorizó';
  END IF;

  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 100, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-B', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_supervisor;

  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_SUPERVISOR_REQUIRED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
        'supervisor_id', v_actor, 'codigo_autorizacion', '481590'));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_SELF_AUTHORIZATION_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
        'supervisor_id', v_sin_rol, 'codigo_autorizacion', '736284'));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_ROLE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
    jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
      'supervisor_id', v_supervisor, 'codigo_autorizacion', '999111'))
  INTO v_rechazo;
  IF coalesce((v_rechazo->>'success')::boolean, true) IS NOT FALSE
     OR v_rechazo->>'error_code' <> 'SUPERVISOR_PIN_INVALID'
     OR (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion_supervisor) <> 'ABIERTA'
     OR (SELECT intentos_fallidos FROM public.supervisor_pins
         WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
           AND lower(estado::text) IN ('activo', 'bloqueado')) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: PIN erróneo autorizó/cerró/no contó %', v_rechazo;
  END IF;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
    jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
      'notas', 'Diferencia autorizada 518', 'supervisor_id', v_supervisor,
      'codigo_autorizacion', '481590')) INTO v_result;
  v_close_event := (v_result->>'close_event_id')::uuid;
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR v_result->>'tipo_diferencia' <> 'FALTANTE'
     OR (v_result->>'supervisor_id')::uuid <> v_supervisor
     OR length(v_result->>'supervisor_authorization_fingerprint') <> 64
     OR (SELECT supervisor_cierre_id FROM public.sesiones_caja
         WHERE id = v_sesion_supervisor) <> v_supervisor THEN
    RAISE EXCEPTION 'VERIFY_518: autorización válida sin evidencia %', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.autorizaciones_caja a
  WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_supervisor
    AND a.supervisor_id = v_supervisor AND a.solicitante_id = v_actor
    AND a.tipo_autorizacion = 'CIERRE_DIFERENCIA_ALTA' AND a.estado = 'APROBADO'
    AND a.firma_digital = v_result->>'supervisor_authorization_fingerprint'
    AND a.metadata->>'close_fingerprint' = (
      SELECT close_fingerprint FROM public.sesiones_caja WHERE id = v_sesion_supervisor)
    AND a.metadata->>'pin_version' IS NOT NULL
    AND a.firma_digital <> '481590' AND a.metadata::text NOT LIKE '%481590%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: evidencia PIN/sesión/huella ausente o recuperable';
  END IF;
  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id = v_tenant AND event_id = v_close_event;
  IF v_payload->>'supervisorAuthorizationFingerprint'
       <> v_result->>'supervisor_authorization_fingerprint'
     OR (v_payload->>'supervisorId')::uuid <> v_supervisor THEN
    RAISE EXCEPTION 'VERIFY_518: outbox perdió evidencia %', v_payload;
  END IF;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
    jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
      'notas', 'Diferencia autorizada 518', 'supervisor_id', v_supervisor,
      'codigo_autorizacion', '481590')) INTO v_retry;
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.cortes_caja
         WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_supervisor) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'caja.cerrada'
           AND aggregate_id = v_sesion_supervisor::text) <> 1
     OR (SELECT count(*) FROM public.autorizaciones_caja
         WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_supervisor) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: replay supervisor duplicó efectos %', v_retry;
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Locks, atributos, RLS y ACL.
  ---------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)'::regprocedure)
  INTO v_def;
  IF v_def !~ 'app[.]cerrar_caja_tx_518' THEN
    RAISE EXCEPTION 'VERIFY_518: wrapper no apunta a 518';
  END IF;
  SELECT pg_get_functiondef('app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)'::regprocedure)
  INTO v_def;
  IF v_def !~ 'FOR UPDATE'
     OR v_def !~ 'resolver_tolerancia_cierre_caja_518'
     OR v_def !~ 'verificar_pin_supervisor_tx'
     OR v_def !~ 'CASH_CLOSE_SELF_AUTHORIZATION_FORBIDDEN'
     OR v_def !~ 'CASH_CLOSE_CASHIER_AUTHORIZATION_FORBIDDEN'
     OR v_def !~ 'CASH_CLOSE_REPLAY_ACTOR_MISMATCH'
     OR v_def !~ '''actor_id'', p_actor_id'
     OR v_def !~ 'cash_actor_is_supervisor_474'
     OR v_def !~ 'FOR UPDATE OF ur, r'
     OR v_def !~ 'resumen_redondeo_documentado_cierre_caja_518'
     OR v_def !~ 'INSERT INTO public[.]autorizaciones_caja'
     OR v_def !~ 'supervisorAuthorizationFingerprint'
     OR v_def !~ 'redondeoEfectivoLegal'
     OR v_def !~ 'REDONDEO_EFECTIVO_LEGAL'
     OR v_def !~ 'schemaVersion.*, 570' THEN
    RAISE EXCEPTION 'VERIFY_518: writer perdió lock/autorización/evidencia/clase';
  END IF;
  SELECT pg_get_functiondef(
    'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'app[.]pos_registrar_venta_atomic_tx_518' THEN
    RAISE EXCEPTION 'VERIFY_518: dispatcher POS no apunta al writer de evidencia';
  END IF;
  SELECT pg_get_functiondef(
    'app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'ajustes_redondeo_efectivo_pos'
     OR v_def !~ 'POS_CASH_ROUNDING_REQUIRES_CASH_ONLY'
     OR v_def !~ 'v_ajuste NOT BETWEEN 0[.]01 AND 0[.]09'
     OR v_def !~ 'pg_advisory_xact_lock'
     OR v_def !~ 'pos[.]sale:'
     OR v_def !~ 'FOR UPDATE' THEN
    RAISE EXCEPTION 'VERIFY_518: writer POS perdió evidencia/límite/lock';
  END IF;
  SELECT pg_get_functiondef(
    'app.resolver_tolerancia_cierre_caja_518(uuid,uuid)'::regprocedure) INTO v_def;
  IF v_def !~ 'NULLS LAST' OR v_def !~ 'cc[.]id DESC'
     OR v_def !~ 'cc[.]caja_id = p_caja_id' OR v_def !~ 'cc[.]caja_id IS NULL' THEN
    RAISE EXCEPTION 'VERIFY_518: resolver no es determinista';
  END IF;
  SELECT pg_get_functiondef(
    'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'supervisor_pin_rotaciones_518'
     OR v_def !~ 'pg_advisory_xact_lock'
     OR v_def !~ 'FOR UPDATE OF ur, r'
     OR v_def !~ 'FOR UPDATE OF rp, p'
     OR v_def !~ 'assert_admin_actor_462'
     OR v_def !~ 'SUPERVISOR_PIN_IDEMPOTENCY_MISMATCH' THEN
    RAISE EXCEPTION 'VERIFY_518: rotación PIN perdió idempotencia/locks/RBAC';
  END IF;
  SELECT pg_get_functiondef(
    'public.listar_supervisores_autorizados_caja_518(uuid,uuid,uuid)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'u[.]id <> p_actor_id'
     OR v_def !~ 'u[.]id IS DISTINCT FROM v_cajero_id'
     OR v_def !~ 'reactivar_bloqueos_supervisor_vencidos_518' THEN
    RAISE EXCEPTION 'VERIFY_518: selector perdió exclusiones/reactivación';
  END IF;

  SELECT p.prosecdef, p.proconfig INTO v_security_definer, v_config
  FROM pg_proc p
  WHERE p.oid = 'app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)'::regprocedure;
  IF v_security_definer IS NOT TRUE
     OR array_to_string(v_config, ',') !~ 'search_path=pg_catalog' THEN
    RAISE EXCEPTION 'VERIFY_518: atributos seguros incorrectos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'autorizaciones_caja'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: autorizaciones_caja sin RLS forzada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ajustes_redondeo_efectivo_pos'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'SELECT')
     OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'INSERT')
     OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'UPDATE')
     OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_518: ledger de redondeo no es privado/RLS forzado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'supervisor_pin_rotaciones_518'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'SELECT')
     OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'INSERT')
     OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'UPDATE')
     OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_518: operaciones PIN no son privadas/RLS forzado';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'ajustes_redondeo_efectivo_pos',
        'supervisor_pin_rotaciones_518'
      )
      AND p.polname = 'service_only_no_direct_access_518'
      AND p.polcmd = '*'
      AND pg_get_expr(p.polqual, p.polrelid) = 'false'
      AND pg_get_expr(p.polwithcheck, p.polrelid) = 'false'
  ) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_518: tablas privadas sin política deny-all explícita';
  END IF;
  IF has_function_privilege('anon', 'public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.listar_supervisores_autorizados_caja_518(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_518: ACL incorrecta';
  END IF;

  RAISE NOTICE 'VERIFY_518 OK';
END;
$verify$;


-- Contratos de deuda/cobro directo; fixtures efímeros, no aceptaciónUI.
DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_cliente_id uuid;
  v_items jsonb;
  v_detalles jsonb;
  v_cpe jsonb;
  v_documento jsonb;
  v_cxc jsonb;
  v_result jsonb;
  v_cpe_id uuid;
  v_documento_id uuid;
  v_cxc_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_event_retry uuid := gen_random_uuid();
  v_cash_event uuid := gen_random_uuid();
  v_collision_event uuid := gen_random_uuid();
  v_legacy_cpe_id uuid;
  v_count integer; v_limited uuid:=gen_random_uuid(); v_before integer; v_cxc_first uuid;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY CPE RECEIVABLE 570', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-443', 'Cliente Verify 443',
    'Cliente Verify 443', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'codigo', 'ITEM-G', 'descripcion', 'Línea gravada', 'cantidad', 1,
      'unidad', 'NIU', 'precio_unitario', 118, 'valor_venta', 100,
      'igv', 18, 'precio_venta', 118, 'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'codigo', 'ITEM-E', 'descripcion', 'Línea exonerada', 'cantidad', 1,
      'unidad', 'NIU', 'precio_unitario', 100, 'valor_venta', 100,
      'igv', 0, 'precio_venta', 100, 'afectacion_igv', '20'
    )
  );
  v_detalles := jsonb_build_array(
    jsonb_build_object(
      'orden', 1, 'codigo_producto', 'ITEM-G', 'descripcion', 'Línea gravada',
      'unidad_medida', 'NIU', 'cantidad', 1, 'precio_unitario', 118,
      'descuento_unitario', 0, 'valor_venta', 100,
      'impuesto_igv', 18, 'impuesto_isc', 0, 'total_item', 118,
      'afectacion_igv', '10'
    ),
    jsonb_build_object(
      'orden', 2, 'codigo_producto', 'ITEM-E', 'descripcion', 'Línea exonerada',
      'unidad_medida', 'NIU', 'cantidad', 1, 'precio_unitario', 100,
      'descuento_unitario', 0, 'valor_venta', 100,
      'impuesto_igv', 0, 'impuesto_isc', 0, 'total_item', 100,
      'afectacion_igv', '20'
    )
  );
  v_cpe := jsonb_build_object(
    'tipo_documento', '01', 'serie', 'F570', 'numero', 1,
    'ruc_emisor', '20600000013', 'razon_social_emisor', 'Empresa Verify 443',
    'direccion_emisor', 'Lima', 'tipo_documento_receptor', 'RUC',
    'documento_receptor', '20123456786',
    'razon_social_receptor', 'Cliente Verify 443',
    'direccion_receptor', 'Lima', 'cliente_id', v_cliente_id,
    'moneda', 'PEN', 'total_gravadas', 100, 'total_exoneradas', 100,
    'total_inafectas', 0, 'total_exportacion', 0,
    'total_igv', 18, 'total_venta', 218, 'items', v_items,
    'fecha_emision', '2026-08-09',
    'fecha_vencimiento', '2026-08-09', 'condicion_pago','CONTADO','plazo_pago_dias',0,
    'estado', 'FIRMADO', 'sunat_status', 'READY',
    'xml_firmado', '<Invoice>signed-443</Invoice>',
    'hash', 'hash-443', 'hash_firma', 'hash-443',
    'created_by', v_user_id, 'costo_ventas', 50
  );
  v_documento := jsonb_build_object(
    'subtotal', 200, 'impuesto_igv', 18, 'impuesto_isc', 0,
    'total', 218, 'tipo_cambio', 1
  );
  v_cxc := jsonb_build_object(
    'cliente_id', v_cliente_id, 'monto_total', 218,
    'monto_pendiente', 218, 'retencion_total', 0,
    'percepcion_total', 0, 'detraccion_total', 0, 'anticipo_total', 0
  );

  v_result:=public.emitir_cpe_directo_peru_tx(v_tenant_id,v_user_id,repeat('a',64),v_cpe,v_documento,v_detalles,v_cxc,v_event_id,'verify-570-contado-master');
  v_cpe_id:=(v_result->>'cpe_id')::uuid;v_documento_id:=(v_result->>'documento_id')::uuid;v_cxc_first:=(v_result->>'cxc_id')::uuid;
  IF v_cxc_first IS NULL OR (SELECT metodo_pago FROM public.documentos WHERE id=v_documento_id)<>'CONTADO'
    OR (SELECT saldo FROM public.cuentas_por_cobrar WHERE id=v_cxc_first)<>218 THEN RAISE EXCEPTION 'VERIFY_570_CONTADO_DEBT_NOT_ATOMIC';END IF;
  -- Fixture de deuda ya liquidada: sólo soporte SQL; el cobro real se prueba desdeUI.
  UPDATE public.cuentas_por_cobrar SET saldo=0,saldo_pendiente=0,monto_pendiente=0,estado='CANCELADO' WHERE id=v_cxc_first;
  v_result:=public.emitir_cpe_directo_peru_tx(v_tenant_id,v_user_id,repeat('a',64),v_cpe,v_documento,v_detalles,v_cxc,gen_random_uuid(),'verify-570-contado-master');
  IF NOT (v_result->>'idempotent')::boolean OR (v_result->>'cxc_id')::uuid<>v_cxc_first
   OR (SELECT saldo FROM public.cuentas_por_cobrar WHERE id=v_cxc_first)<>0 THEN RAISE EXCEPTION 'VERIFY_570_CONTADO_REPLAY_AFTER_PAYMENT';END IF;
  v_result:=public.emitir_cpe_directo_peru_tx(v_tenant_id,v_user_id,repeat('b',64),v_cpe||jsonb_build_object('numero',2,'cliente_id',NULL),v_documento,v_detalles,NULL,v_cash_event,'verify-570-contado-manual');
  v_legacy_cpe_id:=(v_result->>'cpe_id')::uuid;v_documento_id:=(v_result->>'documento_id')::uuid;
  PERFORM public.crear_asiento_con_detalles_tx(v_tenant_id,jsonb_build_object('fecha','2026-08-09T12:00:00Z','concepto','Venta fixture recibible570','estado','CONFIRMADO','source_event_id',v_cash_event,'created_by',v_user_id,'confirmado_por',v_user_id),jsonb_build_array(
   jsonb_build_object('cuenta_id',(SELECT id FROM public.plan_cuentas WHERE tenant_id=v_tenant_id AND codigo='12'),'debe',218,'haber',0),
   jsonb_build_object('cuenta_id',(SELECT id FROM public.plan_cuentas WHERE tenant_id=v_tenant_id AND codigo='70'),'debe',0,'haber',200),
   jsonb_build_object('cuenta_id',(SELECT id FROM public.plan_cuentas WHERE tenant_id=v_tenant_id AND codigo='40'),'debe',0,'haber',18)));
  SELECT count(*) INTO v_before FROM public.outbox_events WHERE tenant_id=v_tenant_id;
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(v_limited,v_tenant_id,v_limited||'@verify570.local','Sin permiso de cobro',true,'ACTIVO',false);
  BEGIN
   PERFORM public.vincular_cxc_cpe_contado_tx_570(v_tenant_id,v_limited,v_legacy_cpe_id,v_cliente_id,'verify570-link-no-permission');
   RAISE EXCEPTION 'VERIFY_570_LINK_NO_PERMISSION_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'CPE_RECEIVABLE_PERMISSION_REQUIRED' THEN RAISE;END IF;END;
  BEGIN
   PERFORM public.vincular_cxc_cpe_contado_tx_570(v_tenant_id,v_user_id,v_legacy_cpe_id,gen_random_uuid(),'verify570-link-wrong-client');
   RAISE EXCEPTION 'VERIFY_570_LINK_WRONG_CLIENT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'CPE_RECEIVABLE_RECEIVER_MISMATCH' THEN RAISE;END IF;END;
  v_result:=public.vincular_cxc_cpe_contado_tx_570(v_tenant_id,v_user_id,v_legacy_cpe_id,v_cliente_id,'verify570-link-original');v_cxc_id:=(v_result->>'cxc_id')::uuid;
  v_result:=public.vincular_cxc_cpe_contado_tx_570(v_tenant_id,v_user_id,v_legacy_cpe_id,v_cliente_id,'verify570-link-original');
  IF v_cxc_id IS NULL OR NOT (v_result->>'idempotent')::boolean OR (v_result->>'cxc_id')::uuid<>v_cxc_id
   OR (SELECT count(*) FROM public.cuentas_por_cobrar WHERE tenant_id=v_tenant_id AND documento_id=v_documento_id)<>1
   OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant_id)<>v_before THEN RAISE EXCEPTION 'VERIFY_570_LINK_DUPLICATED_DEBT_OR_EVENT';END IF;
  BEGIN
   PERFORM public.vincular_cxc_cpe_contado_tx_570(v_tenant_id,v_user_id,v_legacy_cpe_id,v_cliente_id,'verify570-link-different-intent');
   RAISE EXCEPTION 'VERIFY_570_LINK_CHANGED_INTENT_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'CPE_RECEIVABLE_LINK_CONFLICT' THEN RAISE;END IF;END;
END $$;

ROLLBACK;

\set ON_ERROR_STOP on
BEGIN;
DO $verify_quantity$
DECLARE
  v_t uuid:=gen_random_uuid(); v_actor uuid:=gen_random_uuid(); v_role uuid:=gen_random_uuid();
  v_wh uuid; v_wh2 uuid; v_p uuid; v_result jsonb; v_payload jsonb; v_m uuid; i integer;
  v_columns integer; v_before jsonb; v_after jsonb;
  v_security_before jsonb; v_security_after jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_QUANTITY_LOCAL_ONLY'; END IF;
  SELECT count(*) INTO v_columns FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.numeric_precision=18 AND c.numeric_scale=6
    AND (c.table_name,c.column_name) IN (
      ('productos','stock'),('productos','stock_actual'),('productos','stock_reservado'),('productos','stock_minimo'),
      ('producto_existencias','stock_actual'),('producto_existencias','stock_reservado'),('producto_existencias','stock_danado'),('producto_existencias','stock_minimo'),
      ('movimientos_inventario','cantidad'));
  IF v_columns<>9 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_COLUMNS_NOT_SIX_DECIMALS'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
    AND c.table_name='movimientos_inventario' AND c.column_name='kardex_valor_total' AND c.numeric_scale<>2) THEN
    RAISE EXCEPTION 'VERIFY_QUANTITY_MONETARY_SCALE_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN ('public.stock_por_sucursal'::regclass,'public.vista_pos_productos'::regclass,'public.vw_kardex_valorizado'::regclass)
    AND c.reloptions IS DISTINCT FROM ARRAY['security_invoker=true']::text[]) THEN RAISE EXCEPTION 'VERIFY_QUANTITY_VIEW_SECURITY_CHANGED'; END IF;
  IF NOT has_table_privilege('service_role','public.vista_pos_productos','SELECT')
    OR NOT has_table_privilege('service_role','public.vw_kardex_valorizado','SELECT') THEN RAISE EXCEPTION 'VERIFY_QUANTITY_BACKEND_READ_PRIVILEGE_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN ('public.productos'::regclass,'public.producto_existencias'::regclass,'public.movimientos_inventario'::regclass)
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) THEN RAISE EXCEPTION 'VERIFY_QUANTITY_UNDERLYING_RLS_MISSING'; END IF;
  -- Los grants históricos del respaldo pueden diferir del fresh. La migración
  -- y el preservation gate comparan su baseline ANTES/después por semántica ACL.
  -- No se presume que authenticated carecía de SELECT ni se revoca lo histórico.
  -- Aquí se congela seguridad antes de los flujos y se comprueba que no crecen
  -- permisos por operar: grantor/grantee/privilege/grantable, sin orden ACL.
  SELECT jsonb_build_object('views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'options',c.reloptions,
      'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',a.grantor,'grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable)
        ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)) ORDER BY c.relname)
    FROM pg_class c WHERE c.oid IN ('public.stock_por_sucursal'::regclass,'public.vista_pos_productos'::regclass,'public.vw_kardex_valorizado'::regclass)),
    'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) ORDER BY c.relname)
      FROM pg_class c WHERE c.oid IN ('public.productos'::regclass,'public.producto_existencias'::regclass,'public.movimientos_inventario'::regclass))) INTO v_security_before;

  INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(v_t,'QTY-'||left(v_t::text,8),'Verificador fracciones','PE','free',true,'ACTIVO');
  INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc) VALUES(v_t,'PE','PEN','Verificador fracciones','20100070970') ON CONFLICT(tenant_id) DO UPDATE SET pais='PE',moneda='PEN';
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(v_actor,v_t,v_actor||'@verify-qty.local','Actor fracciones',true,'ACTIVO',true);
  INSERT INTO public.roles(id,tenant_id,nombre,activo,is_system_role) VALUES(v_role,v_t,'ADMIN',true,true);
  INSERT INTO public.user_roles(tenant_id,usuario_sistema_id,role_id) VALUES(v_t,v_actor,v_role);
  v_result:=public.crear_almacen_maestro_tx(v_t,v_actor,'qty-warehouse',jsonb_build_object('codigo','QTY','nombre','Almacen fracciones','sucursal_id',app.casa_matriz_de(v_t),'es_principal',true)); v_wh:=(v_result->>'id')::uuid;
  v_result:=public.crear_almacen_maestro_tx(v_t,v_actor,'qty-warehouse-two',jsonb_build_object('codigo','QTY2','nombre','Almacen secundario fracciones','sucursal_id',app.casa_matriz_de(v_t))); v_wh2:=(v_result->>'id')::uuid;
  PERFORM public.crear_categoria_producto_maestro_tx(v_t,v_actor,'qty-category',jsonb_build_object('codigo','QTY','nombre','Fracciones'));
  v_result:=public.crear_producto_maestro_tx(v_t,v_actor,'qty-product',jsonb_build_object('codigo','QTY-P','nombre','Cantidad seis decimales','categoria','QTY','unidad_medida','KGM','precio_venta',1.18,'precio_compra',0,'costo_cero_confirmado',true,'stock_inicial',3.000001,'stock_minimo',0.123456,'almacen_id',v_wh)); v_p:=(v_result->>'id')::uuid;
  IF (SELECT stock_actual FROM public.productos WHERE id=v_p)<>3.000001 OR (SELECT stock_minimo FROM public.productos WHERE id=v_p)<>0.123456
    OR (SELECT stock_actual FROM public.vista_pos_productos WHERE id=v_p)<>3.000001
    OR (SELECT stock_minimo FROM public.vista_pos_productos WHERE id=v_p)<>0.123456
    OR (SELECT cantidad_firmada FROM public.vw_kardex_valorizado WHERE producto_id=v_p)<>3.000001 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_OPENING_OR_VIEWS_ROUNDED'; END IF;
  v_payload:=jsonb_build_object('producto_id',v_p,'almacen_id',v_wh,'delta',0.125,'motivo','Conteo fraccionario');
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload,v_actor,'qty-adjust-plus');
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('delta',-0.375),v_actor,'qty-adjust-minus');
  IF (SELECT stock_actual FROM public.productos WHERE id=v_p)<>2.750001 OR (SELECT sum(cantidad_firmada) FROM public.vw_kardex_valorizado WHERE producto_id=v_p)<>2.750001 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_ADJUSTMENT_CONSERVATION'; END IF;

  v_m:=public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'RESERVA',0.123456,'VERIFY_QTY',gen_random_uuid(),p_created_by:=v_actor::text);
  IF (SELECT stock_reservado FROM public.productos WHERE id=v_p)<>0.123456 OR (SELECT stock_reservado FROM public.producto_existencias WHERE producto_id=v_p AND almacen_id=v_wh)<>0.123456
    OR (SELECT stock_disponible FROM public.vista_pos_productos WHERE id=v_p)<>2.626545 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_RESERVATION_ROUNDED'; END IF;
  PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'LIBERACION',0.123456,'VERIFY_QTY',gen_random_uuid(),p_created_by:=v_actor::text);
  IF (SELECT stock_reservado FROM public.productos WHERE id=v_p)<>0 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_RELEASE_FAILED'; END IF;

  v_result:=public.transferir_inventario_tx(v_t,jsonb_build_object('producto_id',v_p,'almacen_origen_id',v_wh,'almacen_destino_id',v_wh2,'cantidad',0.123456,'motivo','Traslado interno fraccionario'),v_actor,'qty-transfer');
  IF (SELECT stock_actual FROM public.producto_existencias WHERE producto_id=v_p AND almacen_id=v_wh)<>2.626545
    OR (SELECT stock_actual FROM public.producto_existencias WHERE producto_id=v_p AND almacen_id=v_wh2)<>0.123456
    OR (SELECT stock_actual FROM public.stock_por_sucursal WHERE producto_id=v_p)<>2.750001
    OR (SELECT sum(cantidad_firmada) FROM public.vw_kardex_valorizado WHERE producto_id=v_p)<>2.750001 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_TRANSFER_CONSERVATION'; END IF;

  -- El sexto decimal sobrevive una secuencia acumulada; nunca se redondea a 0.
  FOR i IN 1..100 LOOP
    PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'ENTRADA',0.000001,'VERIFY_QTY',gen_random_uuid(),p_created_by:=v_actor::text);
  END LOOP;
  IF (SELECT stock_actual FROM public.productos WHERE id=v_p)<>2.750101 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_CUMULATIVE_INPUT'; END IF;
  FOR i IN 1..100 LOOP
    PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'SALIDA',0.000001,'VERIFY_QTY',gen_random_uuid(),p_created_by:=v_actor::text);
  END LOOP;
  IF (SELECT stock_actual FROM public.productos WHERE id=v_p)<>2.750001
    OR (SELECT sum(cantidad_firmada) FROM public.vw_kardex_valorizado WHERE producto_id=v_p)<>2.750001
    OR (SELECT sum(valor_firmado_base) FROM public.vw_kardex_valorizado WHERE producto_id=v_p)<>0
    OR EXISTS(SELECT 1 FROM public.vw_kardex_valorizado WHERE producto_id=v_p AND valuacion_estado<>'CONFIRMADA') THEN RAISE EXCEPTION 'VERIFY_QUANTITY_CUMULATIVE_CONSERVATION'; END IF;
  IF EXISTS(SELECT 1 FROM public.validar_inventory_stock_reconciliation_runtime(v_t)
    WHERE check_name='productos_vs_existencias_reconciliado' AND NOT ok) THEN RAISE EXCEPTION 'VERIFY_QUANTITY_RECONCILIATION_FALSE_FAILURE'; END IF;
  SELECT jsonb_build_object('p',(SELECT to_jsonb(p) FROM public.productos p WHERE p.id=v_p),'m',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.movimientos_inventario m WHERE m.producto_id=v_p)) INTO v_before;
  BEGIN
    PERFORM public.aplicar_movimiento_inventario_tx(v_t,v_p,v_wh,'ENTRADA',0.0000001,'VERIFY_QTY',gen_random_uuid(),p_created_by:=v_actor::text);
    RAISE EXCEPTION 'VERIFY_QUANTITY_OVER_PRECISION_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVENTORY_QUANTITY_INVALID' THEN RAISE; END IF; END;
  SELECT jsonb_build_object('p',(SELECT to_jsonb(p) FROM public.productos p WHERE p.id=v_p),'m',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.movimientos_inventario m WHERE m.producto_id=v_p)) INTO v_after;
  IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REJECTED_WRITE_RESIDUE'; END IF;
  SELECT jsonb_build_object('views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'options',c.reloptions,
      'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',a.grantor,'grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable)
        ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)) ORDER BY c.relname)
    FROM pg_class c WHERE c.oid IN ('public.stock_por_sucursal'::regclass,'public.vista_pos_productos'::regclass,'public.vw_kardex_valorizado'::regclass)),
    'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) ORDER BY c.relname)
      FROM pg_class c WHERE c.oid IN ('public.productos'::regclass,'public.producto_existencias'::regclass,'public.movimientos_inventario'::regclass))) INTO v_security_after;
  IF v_security_after IS DISTINCT FROM v_security_before THEN RAISE EXCEPTION 'VERIFY_QUANTITY_OPERATION_SECURITY_CHANGED'; END IF;
  RAISE NOTICE 'VERIFY_QUANTITY_570 PASS: physical six decimals, POS/kardex/sucursal views, zero-cost fractions, reservation/release, internal transfer, 100 micro-in/out, overprecision fail-closed';
END $verify_quantity$;
ROLLBACK;

\set ON_ERROR_STOP on
BEGIN;
DO $verify_quantity_report$
DECLARE
  v_t uuid:=gen_random_uuid(); v_actor uuid:=gen_random_uuid(); v_role uuid:=gen_random_uuid();
  v_wh uuid; v_p uuid; v_paid uuid; v_result jsonb; v_report jsonb; v_payload jsonb;
  v_line jsonb; v_expected numeric; v_future date;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_LOCAL_ONLY'; END IF;
  INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(v_t,'QREPORT-'||left(v_t::text,8),'Verificador reporte fracciones','PE','free',true,'ACTIVO');
  INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc) VALUES(v_t,'PE','PEN','Verificador reporte fracciones','20100070970') ON CONFLICT(tenant_id) DO UPDATE SET pais='PE',moneda='PEN';
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(v_actor,v_t,v_actor||'@verify-qreport.local','Actor reporte fracciones',true,'ACTIVO',true);
  INSERT INTO public.roles(id,tenant_id,nombre,activo,is_system_role) VALUES(v_role,v_t,'ADMIN',true,true);
  INSERT INTO public.user_roles(tenant_id,usuario_sistema_id,role_id) VALUES(v_t,v_actor,v_role);
  v_result:=public.crear_almacen_maestro_tx(v_t,v_actor,'qreport-warehouse',jsonb_build_object('codigo','QREPORT','nombre','Almacen reporte','sucursal_id',app.casa_matriz_de(v_t),'es_principal',true)); v_wh:=(v_result->>'id')::uuid;
  PERFORM public.crear_categoria_producto_maestro_tx(v_t,v_actor,'qreport-category',jsonb_build_object('codigo','QREPORT','nombre','Reporte fracciones'));
  v_result:=public.crear_producto_maestro_tx(v_t,v_actor,'qreport-product',jsonb_build_object('codigo','QREPORT-ZERO','nombre','Reporte seis decimales','categoria','QREPORT','unidad_medida','KGM','precio_venta',1.18,'precio_compra',0,'costo_cero_confirmado',true,'stock_inicial',3.000001,'almacen_id',v_wh)); v_p:=(v_result->>'id')::uuid;
  v_payload:=jsonb_build_object('producto_id',v_p,'almacen_id',v_wh,'delta',0.125,'motivo','Conteo fraccionario de reporte');
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload,v_actor,'qreport-plus');
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('delta',-0.375),v_actor,'qreport-minus');
  v_report:=public.reporte_kardex_valorizado_470(v_t,v_p,v_wh,NULL,NULL,250);
  IF (v_report#>>'{resumen,saldoCantidad}')::numeric<>2.750001
    OR (v_report#>>'{resumen,totalEntradas}')::numeric<>3.125001
    OR (v_report#>>'{resumen,totalSalidas}')::numeric<>0.375
    OR (v_report#>>'{resumen,totalAjustes}')::numeric<>-0.25
    OR (v_report#>>'{resumen,movimientoNetoCantidad}')::numeric<>2.750001
    OR (v_report#>>'{resumen,saldoValorizadoBase}')::numeric<>0 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_SUMMARY_ROUNDED'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_report->'data') LOOP
    SELECT saldo INTO v_expected FROM (
      SELECT movimiento_id,sum(cantidad_firmada) OVER (PARTITION BY producto_id,almacen_id ORDER BY fecha_recepcion,movimiento_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo
      FROM public.vw_kardex_valorizado WHERE tenant_id=v_t AND producto_id=v_p AND almacen_id=v_wh
    ) exacto WHERE movimiento_id=(v_line->>'id')::uuid;
    IF (v_line->>'saldoCantidadPosterior')::numeric IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_RUNNING_BALANCE_ROUNDED'; END IF;
  END LOOP;
  v_report:=public.reporte_kardex_valorizado_470(v_t,v_p,v_wh,NULL,NULL,1);
  IF jsonb_array_length(v_report->'data')<>1 OR (v_report#>>'{resumen,saldoCantidad}')::numeric<>2.750001
    OR (v_report#>>'{data,0,saldoCantidadPosterior}')::numeric<>2.750001 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_LIMIT_LOST_BALANCE'; END IF;
  v_future:=app.hoy_tenant(v_t)+1;
  v_report:=public.reporte_kardex_valorizado_470(v_t,v_p,v_wh,v_future,NULL,250);
  IF jsonb_array_length(v_report->'data')<>0 OR (v_report#>>'{resumen,saldoInicialCantidad}')::numeric<>2.750001
    OR (v_report#>>'{resumen,saldoCantidad}')::numeric<>2.750001
    OR (v_report#>>'{resumen,movimientoNetoCantidad}')::numeric<>0 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_RANGE_OPENING_ROUNDED'; END IF;

  v_result:=public.crear_producto_maestro_tx(v_t,v_actor,'qreport-priced',jsonb_build_object('codigo','QREPORT-PAID','nombre','Reporte importe monetario','categoria','QREPORT','unidad_medida','KGM','precio_venta',2.36,'precio_compra',1.04,'stock_inicial',2.5,'almacen_id',v_wh)); v_paid:=(v_result->>'id')::uuid;
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('producto_id',v_paid),v_actor,'qreport-paid-plus');
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('producto_id',v_paid,'delta',-0.375),v_actor,'qreport-paid-minus');
  v_report:=public.reporte_kardex_valorizado_470(v_t,v_paid,v_wh,NULL,NULL,250);
  IF (v_report#>>'{resumen,saldoCantidad}')::numeric<>2.25 OR (v_report#>>'{resumen,saldoValorizadoBase}')::numeric<>2.34 THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_MONETARY_CONTRACT_CHANGED'; END IF;
  v_report:=public.reporte_kardex_valorizado_470(v_t,NULL,v_wh,NULL,NULL,250);
  IF v_report#>'{resumen,saldoCantidad}' IS DISTINCT FROM 'null'::jsonb
    OR (v_report#>>'{resumen,cantidadAgregable}')::boolean THEN RAISE EXCEPTION 'VERIFY_QUANTITY_REPORT_MIXED_PRODUCTS_AGGREGATED'; END IF;
  RAISE NOTICE 'VERIFY_QUANTITY_REPORT_570 PASS: six-decimal detail/running/summary, range opening, detail limit, monetary cents, heterogeneous products not aggregated';
END $verify_quantity_report$;

DO $verify_zero$
DECLARE
  v_t uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid(); v_actor uuid:=gen_random_uuid();
  v_role uuid:=gen_random_uuid(); v_wh uuid; v_zero uuid; v_paid uuid; v_empty uuid;
  v_payload jsonb; v_result jsonb; v_first jsonb; v_stock numeric; v_count integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_ZERO_LOCAL_ONLY'; END IF;
  INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES
    (v_t,'ZERO-'||left(v_t::text,8),'Verificador cero','PE','free',true,'ACTIVO'),
    (v_other,'ZEROO-'||left(v_other::text,8),'Otro cero','PE','free',true,'ACTIVO');
  INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc)
    VALUES(v_t,'PE','PEN','Verificador cero','20100070970') ON CONFLICT(tenant_id) DO UPDATE SET pais='PE',moneda='PEN';
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin)
    VALUES(v_actor,v_t,v_actor||'@verify-zero.local','Actor cero',true,'ACTIVO',true);
  INSERT INTO public.roles(id,tenant_id,nombre,activo,is_system_role) VALUES(v_role,v_t,'ADMIN',true,true);
  INSERT INTO public.user_roles(tenant_id,usuario_sistema_id,role_id) VALUES(v_t,v_actor,v_role);
  v_result:=public.crear_almacen_maestro_tx(v_t,v_actor,'zero-warehouse',jsonb_build_object('codigo','ZERO','nombre','Almacen cero','sucursal_id',app.casa_matriz_de(v_t),'es_principal',true));
  v_wh:=(v_result->>'id')::uuid;
  PERFORM public.crear_categoria_producto_maestro_tx(v_t,v_actor,'zero-category',jsonb_build_object('codigo','ZERO','nombre','Cero'));
  v_payload:=jsonb_build_object('codigo','ZERO-P','nombre','Cero físico','categoria','ZERO','unidad_medida','KGM','precio_venta',1.18,'precio_compra',0,'stock_inicial',2.5,'stock_minimo',0.25,'almacen_id',v_wh);
  BEGIN
    PERFORM public.crear_producto_maestro_tx(v_t,v_actor,'zero-no-confirm',v_payload);
    RAISE EXCEPTION 'VERIFY_ZERO_MISSING_CONFIRMATION_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_VALUATION_REQUIRED' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.productos WHERE tenant_id=v_t AND codigo='ZERO-P') THEN RAISE EXCEPTION 'VERIFY_ZERO_FAILED_CREATE_LEFT_PRODUCT'; END IF;
  BEGIN
    PERFORM public.crear_producto_maestro_tx(v_t,v_actor,'zero-invalid-confirm',v_payload||jsonb_build_object('costo_cero_confirmado','true'));
    RAISE EXCEPTION 'VERIFY_ZERO_STRING_CONFIRMATION_ACCEPTED';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'INVENTORY_ZERO_COST_CONFIRMATION_INVALID' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.crear_producto_maestro_tx(v_t,v_actor,'zero-conflicting-cost',v_payload||jsonb_build_object('precio_compra',1,'costo_cero_confirmado',true));
    RAISE EXCEPTION 'VERIFY_ZERO_POSITIVE_COST_OVERRIDDEN';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_ZERO_COST_CONFIRMATION_CONTRADICTS_COST' THEN RAISE; END IF; END;
  v_first:=public.crear_producto_maestro_tx(v_t,v_actor,'zero-create',v_payload||jsonb_build_object('costo_cero_confirmado',true));
  v_zero:=(v_first->>'id')::uuid;
  v_result:=public.crear_producto_maestro_tx(v_t,v_actor,'zero-create',v_payload||jsonb_build_object('costo_cero_confirmado',true));
  IF (v_result->>'id')::uuid<>v_zero OR NOT(v_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_ZERO_CREATE_REPLAY'; END IF;
  BEGIN
    PERFORM public.crear_producto_maestro_tx(v_t,v_actor,'zero-create',v_payload);
    RAISE EXCEPTION 'VERIFY_ZERO_FINGERPRINT_UNPROTECTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (SELECT costo_promedio_base FROM public.productos WHERE id=v_zero)<>0
    OR (SELECT stock_actual FROM public.productos WHERE id=v_zero)<>2.5
    OR (SELECT count(*) FROM public.movimientos_inventario WHERE producto_id=v_zero)<>1
    OR NOT EXISTS(SELECT 1 FROM public.vw_kardex_valorizado WHERE producto_id=v_zero AND valuacion_estado='CONFIRMADA' AND valor_firmado_base=0) THEN
    RAISE EXCEPTION 'VERIFY_ZERO_OPENING_NOT_CONFIRMED'; END IF;
  v_payload:=jsonb_build_object('producto_id',v_zero,'almacen_id',v_wh,'delta',0.125,'motivo','Conteo cero fraccionario');
  v_first:=public.registrar_ajuste_inventario_tx(v_t,v_payload,v_actor,'zero-adjust');
  v_result:=public.registrar_ajuste_inventario_tx(v_t,v_payload,v_actor,'zero-adjust');
  IF v_result->>'operacion_id'<>v_first->>'operacion_id' OR NOT(v_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'VERIFY_ZERO_ADJUST_REPLAY'; END IF;
  PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('delta',-0.375),v_actor,'zero-shortage');
  IF (SELECT stock_actual FROM public.productos WHERE id=v_zero)<>2.25
    OR (SELECT sum(cantidad_firmada) FROM public.vw_kardex_valorizado WHERE producto_id=v_zero)<>2.25
    OR (SELECT sum(valor_firmado_base) FROM public.vw_kardex_valorizado WHERE producto_id=v_zero)<>0
    OR (SELECT count(*) FROM public.operaciones_inventario WHERE producto_id=v_zero)<>2
    OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_t AND payload->>'productoId'=v_zero::text AND payload->>'costoCeroConfirmado'='true' AND payload->>'schemaVersion'='570' AND (payload->>'valor')::numeric=0)<>2 THEN
    RAISE EXCEPTION 'VERIFY_ZERO_ADJUSTMENTS_NOT_ATOMIC'; END IF;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('delta',0.25),v_actor,'zero-adjust');
    RAISE EXCEPTION 'VERIFY_ZERO_ADJUST_FINGERPRINT_UNPROTECTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(v_other,v_payload,v_actor,'zero-foreign');
    RAISE EXCEPTION 'VERIFY_ZERO_CROSS_TENANT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'VERIFY_ZERO_%' THEN RAISE; END IF; END;
  v_result:=public.crear_producto_maestro_tx(v_t,v_actor,'zero-empty',jsonb_build_object('codigo','ZERO-EMPTY','nombre','Sin valoración','categoria','ZERO','unidad_medida','KGM','precio_venta',1,'precio_compra',0,'stock_inicial',0,'almacen_id',v_wh));
  v_empty:=(v_result->>'id')::uuid;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('producto_id',v_empty),v_actor,'zero-empty-adjust');
    RAISE EXCEPTION 'VERIFY_ZERO_UNKNOWN_COST_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'INVENTORY_ADJUSTMENT_UNIT_COST_REQUIRED' THEN RAISE; END IF; END;
  v_result:=public.crear_producto_maestro_tx(v_t,v_actor,'zero-priced',jsonb_build_object('codigo','ZERO-PAID','nombre','Costo positivo','categoria','ZERO','unidad_medida','KGM','precio_venta',2,'precio_compra',1.04,'stock_inicial',2.5,'almacen_id',v_wh));
  v_paid:=(v_result->>'id')::uuid;
  v_result:=public.registrar_ajuste_inventario_tx(v_t,v_payload||jsonb_build_object('producto_id',v_paid),v_actor,'zero-priced-adjust');
  IF (v_result->>'valor')::numeric<>0.13 OR (v_result->>'costo_unitario')::numeric<>1.04
    OR (SELECT costo_promedio_base FROM public.productos WHERE id=v_paid)<>1.04 THEN RAISE EXCEPTION 'VERIFY_ZERO_POSITIVE_COST_CHANGED'; END IF;
  -- Fallo tardío de outbox conserva la fotografía física previa (subtransacción).
  v_stock:=(SELECT stock_actual FROM public.productos WHERE id=v_zero);
  v_count:=(SELECT count(*) FROM public.movimientos_inventario WHERE producto_id=v_zero);
  PERFORM set_config('verify.zero_fail_tenant',v_t::text,true);
  EXECUTE $ddl$CREATE FUNCTION pg_temp.verify_zero_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN IF NEW.tenant_id::text=current_setting('verify.zero_fail_tenant',true) AND NEW.event_type='ajuste.inventario.aplicado' THEN RAISE EXCEPTION 'VERIFY_ZERO_LATE_FAIL'; END IF; RETURN NEW; END; $fn$$ddl$;
  EXECUTE 'CREATE TRIGGER verify_zero_late_fail BEFORE INSERT ON public.outbox_events FOR EACH ROW EXECUTE FUNCTION pg_temp.verify_zero_fail_outbox()';
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(v_t,v_payload,v_actor,'zero-late-fail');
    RAISE EXCEPTION 'VERIFY_ZERO_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'VERIFY_ZERO_LATE_FAIL' THEN RAISE; END IF; END;
  IF (SELECT stock_actual FROM public.productos WHERE id=v_zero)<>v_stock
    OR (SELECT count(*) FROM public.movimientos_inventario WHERE producto_id=v_zero)<>v_count
    OR EXISTS(SELECT 1 FROM public.operaciones_inventario WHERE tenant_id=v_t AND idempotency_key='zero-late-fail') THEN
    RAISE EXCEPTION 'VERIFY_ZERO_LATE_FAILURE_LEFT_RESIDUE'; END IF;
  EXECUTE 'DROP TRIGGER verify_zero_late_fail ON public.outbox_events';
END $verify_zero$;
ROLLBACK;

\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'Sólo infraestructura local efímera erp_e2e'; END IF;
END;$guard$;
UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true WHERE singleton;
CREATE FUNCTION app.verify_norm_audit_fail_570() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NEW.table_name='normativa_peru_periodos' AND NEW.new_values->'fuente'->>'referencia'='FORCED_AUDIT_FAILURE' THEN
   RAISE EXCEPTION 'FORCED_NORM_AUDIT_FAILURE';
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER verify_norm_audit_fail_570 BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION app.verify_norm_audit_fail_570();
DO $test$
DECLARE
 v_demo jsonb;v_other jsonb;v_tenant uuid;v_actor uuid;v_foreign uuid;
 v_admin_role uuid;v_perm uuid;v_role uuid;v_nonadmin uuid:=gen_random_uuid();
 v_payload jsonb;v_response jsonb;v_retry jsonb;v_first uuid;v_second uuid;
 v_failed boolean;v_global_before jsonb;v_employee uuid;v_planilla uuid;v_calculos jsonb;
BEGIN
 IF has_function_privilege('anon','public.guardar_normativa_peru_periodo_tx_570(uuid,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.guardar_normativa_peru_periodo_tx_570(uuid,uuid,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.guardar_normativa_peru_periodo_tx_570(uuid,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('service_role','app.guardar_calculo_planilla_normativa_base_570(uuid,uuid,jsonb,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'NORM570_ACL_INVALID';
 END IF;
 SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) INTO v_global_before FROM public.normativa_peru_periodos n WHERE tenant_id IS NULL;
 v_demo:=public.create_demo_tenant('VERIFY NORM570',1,'PE');v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;
 v_other:=public.create_demo_tenant('VERIFY NORM570 OTHER',1,'PE');v_foreign:=(v_other->>'user_id')::uuid;
 SELECT id INTO v_admin_role FROM public.roles WHERE tenant_id=v_tenant AND nombre='ADMIN';
 IF v_admin_role IS NULL THEN INSERT INTO public.roles(tenant_id,nombre,activo) VALUES(v_tenant,'ADMIN',true) RETURNING id INTO v_admin_role;END IF;
 INSERT INTO public.user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(v_actor,v_admin_role,v_tenant) ON CONFLICT DO NOTHING;
 SELECT id INTO v_perm FROM public.permisos WHERE tenant_id=v_tenant AND lower(codigo)='configuracion.write';
 IF v_perm IS NULL THEN INSERT INTO public.permisos(tenant_id,modulo,accion,recurso,codigo,activo)
 VALUES(v_tenant,'configuracion','write',NULL,'configuracion.write',true) RETURNING id INTO v_perm; END IF;
 INSERT INTO public.rol_permisos(role_id,permiso_id,concedido) VALUES(v_admin_role,v_perm,true)
 ON CONFLICT DO NOTHING;
 INSERT INTO public.roles(tenant_id,nombre,activo) VALUES(v_tenant,'OPERADOR_CONFIG',true) RETURNING id INTO v_role;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,nombres,apellido,apellidos,activo,estado,is_super_admin)
 VALUES(v_nonadmin,v_tenant,'norm-'||v_nonadmin||'@example.test','Operador','Operador','Norm','Norm',true,'ACTIVO',false);
 INSERT INTO public.user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(v_nonadmin,v_role,v_tenant);
 INSERT INTO public.rol_permisos(role_id,permiso_id,concedido) VALUES(v_role,v_perm,true);
 v_payload:=jsonb_build_object('periodo','2025-12','uit',5350,'rmv',1130,'asignacion_familiar',113,
   'afp_aporte',0.1,'afp_prima_seguro',0.0137,'afp_comision_flujo_default',0.0155,'onp_aporte',0.13,
   'essalud_aporte',0.09,'quinta_deduccion_uit',7,'bancarizacion_pen_min',2000,'bancarizacion_usd_min',500,'igv_tasa',0.18,
   'afp_remuneracion_max_asegurable',12178.56,'referencia','FUENTE OFICIAL 2025');
 v_response:=public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload,'norm570-create-202512');v_first:=(v_response->'data'->>'id')::uuid;
 v_retry:=public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload,'norm570-create-202512');
 IF v_retry IS DISTINCT FROM v_response OR (SELECT count(*) FROM public.normativa_peru_periodos WHERE tenant_id=v_tenant AND periodo='2025-12')<>1
 THEN RAISE EXCEPTION 'NORM570_EXACT_RETRY_DUPLICATED'; END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"uit":5360}', 'norm570-create-202512');
 EXCEPTION WHEN unique_violation THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_REUSED_KEY_ACCEPTED';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_foreign,v_payload,'norm570-foreign-actor');
 EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_FOREIGN_ACTOR_ACCEPTED';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_nonadmin,v_payload,'norm570-nonadmin-with-permission');
 EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_NONADMIN_WITH_PERMISSION_ACCEPTED';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"asignacion_familiar":114}','norm570-invalid-family');
 EXCEPTION WHEN check_violation THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_FAMILY_RATE_INVALID';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"afp_aporte":1.1}','norm570-invalid-rate');
 EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_RATE_RANGE_INVALID';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"afp_remuneracion_max_asegurable":0}','norm570-invalid-afp-cap');
 EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_AFP_CAP_RANGE_INVALID';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"referencia":"FORCED_AUDIT_FAILURE"}','norm570-late-audit');
 EXCEPTION WHEN raise_exception THEN v_failed:=SQLERRM='FORCED_NORM_AUDIT_FAILURE';END;
 IF NOT v_failed OR EXISTS(SELECT 1 FROM public.rrhh_operaciones_475 WHERE tenant_id=v_tenant AND idempotency_key='norm570-late-audit')
 OR NOT (SELECT activo FROM public.normativa_peru_periodos WHERE id=v_first)
 OR (SELECT count(*) FROM public.normativa_peru_periodos WHERE tenant_id=v_tenant AND periodo='2025-12')<>1
 THEN RAISE EXCEPTION 'NORM570_LATE_FAILURE_NOT_ATOMIC';END IF;
 v_response:=public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"referencia":"FUENTE OFICIAL REVISADA"}','norm570-version2');
 v_second:=(v_response->'data'->>'id')::uuid;
 IF v_second=v_first OR (SELECT activo FROM public.normativa_peru_periodos WHERE id=v_first)
 OR (v_response->'data'->'fuente'->>'version')::integer<>2
 OR (SELECT count(*) FROM public.audit_log WHERE tenant_id=v_tenant AND table_name='normativa_peru_periodos')<>2
 THEN RAISE EXCEPTION 'NORM570_HISTORY_NOT_AUDITED';END IF;
 SELECT id INTO v_employee FROM public.empleados WHERE tenant_id=v_tenant AND lower(estado::text)='activo' LIMIT 1;
 IF v_employee IS NULL THEN INSERT INTO public.empleados(tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
 VALUES(v_tenant,'Norm Test','Norm','Test','NORM570','DNI','57057057','activo',true,'2025-01-01','PE') RETURNING id INTO v_employee;END IF;
 v_response:=public.crear_planilla_tx_495(v_tenant,'{"periodo":"2025-12","pais_codigo":"PE","moneda":"PEN"}',v_actor,'norm570-payroll');v_planilla:=(v_response->>'id')::uuid;
 v_calculos:=jsonb_build_array(jsonb_build_object('empleado_id',v_employee,'dias_trabajados',30,'horas_extras_25',0,'horas_extras_35',0,
   'tardanzas_minutos',0,'faltas',0,'total_ingresos',1000,'total_descuentos',100,'total_aportes',90,'neto_pagar',900,'conceptos','[]'::jsonb,
   'metadata',jsonb_build_object('normativa_periodo_id',v_first)));
 v_failed:=false;
 BEGIN PERFORM public.guardar_calculo_planilla_tx(v_tenant,v_planilla,v_calculos,v_actor);
 EXCEPTION WHEN serialization_failure THEN v_failed:=true;END;
 IF NOT v_failed OR (SELECT estado FROM public.planillas WHERE id=v_planilla)<>'borrador'
 OR EXISTS(SELECT 1 FROM public.empleado_planilla WHERE planilla_id=v_planilla)
 THEN RAISE EXCEPTION 'NORM570_STALE_VERSION_PERSISTED';END IF;
 v_calculos:=jsonb_set(v_calculos,'{0,metadata,normativa_periodo_id}',to_jsonb(v_second));
 PERFORM public.guardar_calculo_planilla_tx(v_tenant,v_planilla,v_calculos,v_actor);
 IF (SELECT metadata->'normativa_usada'->0->>'id' FROM public.planillas WHERE id=v_planilla) IS DISTINCT FROM v_second::text
 THEN RAISE EXCEPTION 'NORM570_CALC_SOURCE_NOT_PERSISTED';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload,'norm570-after-calculation');
 EXCEPTION WHEN check_violation THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_CALCULATED_PERIOD_MODIFIED';END IF;
 v_failed:=false;
 BEGIN PERFORM public.guardar_normativa_peru_periodo_tx_570(v_tenant,v_actor,v_payload||'{"periodo":"2025-11"}','norm570-grat-base-modified');
 EXCEPTION WHEN check_violation THEN v_failed:=true;END;
 IF NOT v_failed THEN RAISE EXCEPTION 'NORM570_GRAT_BASE_NOT_FROZEN';END IF;
 IF v_global_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.normativa_peru_periodos n WHERE tenant_id IS NULL)
 THEN RAISE EXCEPTION 'NORM570_GLOBAL_MODIFIED';END IF;
 RAISE NOTICE 'NORM570 PASS: actor, tenant, role, ACL, numeric ranges, versions, exact retry, late failure, stale calc, calculated freeze, globals';
END;$test$;
ROLLBACK;

BEGIN;
DO $close570$
DECLARE t uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();p uuid:=gen_random_uuid();prior uuid:=gen_random_uuid();event uuid:=gen_random_uuid();v jsonb;draft jsonb;failed boolean;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'CLOSE570_LOCAL_ONLY';END IF;
 IF has_function_privilege('anon','public.validar_cierre_periodo_contable_570(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.validar_cierre_periodo_contable_570(uuid,uuid,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.validar_cierre_periodo_contable_570(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','app.accounting_close_conditions_570(uuid,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'CLOSE570_ACL';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(t,'CL570-'||left(t::text,8),'Cierre verifier570','PE','free',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc) VALUES(t,'PE','PEN','Cierre verifier570','20100070970') ON CONFLICT(tenant_id) DO NOTHING;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(actor,t,actor||'@close570.test','Actor verifier570',true,'ACTIVO',true);
 INSERT INTO public.periodos_contables(id,tenant_id,anio,mes,estado) VALUES(p,t,2025,9,'ABIERTO');
 v:=public.validar_cierre_periodo_contable_570(t,p,actor);
 IF NOT (v->>'puedeCerrar')::boolean THEN RAISE EXCEPTION 'CLOSE570_EMPTY_BLOCKED:%',v;END IF;
 IF public.validar_cierre_periodo_contable_570(t,gen_random_uuid(),actor) IS NOT NULL THEN RAISE EXCEPTION 'CLOSE570_FOREIGN_PERIOD';END IF;
 failed:=false;BEGIN PERFORM public.validar_cierre_periodo_contable_570(t,p,gen_random_uuid());EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLOSE570_FOREIGN_ACTOR';END IF;
 INSERT INTO public.periodos_contables(id,tenant_id,anio,mes,estado) VALUES(prior,t,2025,8,'ABIERTO');
 v:=public.validar_cierre_periodo_contable_570(t,p,actor);
 IF (v->>'puedeCerrar')::boolean OR (v->'previos'->>'valido')::boolean OR jsonb_array_length(v->'previos'->'periodos')<>1 THEN RAISE EXCEPTION 'CLOSE570_PRIOR_GREEN';END IF;
 failed:=false;BEGIN PERFORM public.cerrar_periodo_contable_tx(t,2025,9,actor);EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'ACCOUNTING_PRIOR_PERIODS_MUST_BE_CLOSED' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLOSE570_WRITER_PRIOR';END IF;
 PERFORM public.cerrar_periodo_contable_tx(t,2025,8,actor);
 INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at) VALUES(t,'fixture','fixture','banco.movimiento.registrado','{"fecha":"2025-09-15"}','pending',0,event::text,event,'2026-10-08T12:00:00Z');
 v:=public.validar_cierre_periodo_contable_570(t,p,actor);
 IF (v->>'puedeCerrar')::boolean OR (v->'eventos'->>'eventosPendientes')::integer<>1 THEN RAISE EXCEPTION 'CLOSE570_BACKDATED_EVENT_GREEN';END IF;
 failed:=false;BEGIN PERFORM public.cerrar_periodo_contable_tx(t,2025,9,actor);EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:1' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLOSE570_WRITER_EVENT';END IF;
 UPDATE public.outbox_events SET status='completed',processed_at=clock_timestamp() WHERE event_id=event;
 INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at) VALUES(t,'fixture','fixture','configuracion.empresa.actualizada','{"fecha":"2025-09-15"}','pending',0,gen_random_uuid()::text,gen_random_uuid(),'2025-09-15T12:00:00Z');
 draft:=public.crear_asiento_con_detalles_tx(t,jsonb_build_object('fecha','2025-09-15T12:00:00Z','concepto','Draft close570','estado','BORRADOR','source_event_id',gen_random_uuid(),'created_by',actor),jsonb_build_array(jsonb_build_object('cuenta_id',(SELECT id FROM public.plan_cuentas WHERE tenant_id=t AND codigo='6391'),'debe',1,'haber',0),jsonb_build_object('cuenta_id',(SELECT id FROM public.plan_cuentas WHERE tenant_id=t AND codigo='50'),'debe',0,'haber',1)));
 v:=public.validar_cierre_periodo_contable_570(t,p,actor);
 IF (v->>'puedeCerrar')::boolean OR (v->'borradores'->>'cantidad')::integer<>1 OR NOT (v->'eventos'->>'valido')::boolean THEN RAISE EXCEPTION 'CLOSE570_DRAFT_OR_NONACCOUNTING:%',v;END IF;
 failed:=false;BEGIN PERFORM public.cerrar_periodo_contable_tx(t,2025,9,actor);EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'ACCOUNTING_PERIOD_HAS_DRAFT_ENTRIES:1' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CLOSE570_WRITER_DRAFT';END IF;
 PERFORM public.eliminar_asiento_borrador_tx(t,(draft->>'id')::uuid);
 v:=public.validar_cierre_periodo_contable_570(t,p,actor);
 IF NOT (v->>'puedeCerrar')::boolean THEN RAISE EXCEPTION 'CLOSE570_RECOVERY:%',v;END IF;
 PERFORM public.cerrar_periodo_contable_tx(t,2025,9,actor);
 v:=public.validar_cierre_periodo_contable_570(t,p,actor);
 IF (v->>'puedeCerrar')::boolean OR (v->'estado'->>'valido')::boolean THEN RAISE EXCEPTION 'CLOSE570_CLOSED_GREEN';END IF;
 RAISE NOTICE 'CLOSE570 PASS: ACL, actor, tenant, prior, backdated event, nonaccounting exclusion, draft, shared writer, recovery, closed';
END;$close570$;
ROLLBACK;

-- Balance histórico: resultados anteriores sin cierre, cierre/reapertura y tenant.
BEGIN;
DO $history570$
DECLARE t uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();accounts jsonb:='{}';c text;id uuid;v jsonb;row jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'HISTORY570_LOCAL_ONLY';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(t,'BG570-'||left(t::text,8),'Balance history verifier','PE','free',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc) VALUES(t,'PE','PEN','Balance history verifier','20100070970') ON CONFLICT(tenant_id) DO NOTHING;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(actor,t,actor||'@history570.test','Actor history570',true,'ACTIVO',true);
 FOREACH c IN ARRAY ARRAY['10111','7011','6211','50','89','59'] LOOP
  INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado)
  SELECT t,c,'History570 '||c,CASE WHEN c LIKE '1%' THEN 'ACTIVO' WHEN c LIKE '5%' THEN 'PATRIMONIO' WHEN c LIKE '6%' THEN 'GASTO' ELSE 'INGRESO' END,CASE WHEN c LIKE '1%' THEN 'ACTIVO' WHEN c LIKE '5%' THEN 'PATRIMONIO' WHEN c LIKE '6%' THEN 'GASTO' ELSE 'INGRESO' END,2,true,true,'ACTIVO' WHERE NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=t AND codigo=c);
  SELECT p.id INTO id FROM public.plan_cuentas p WHERE p.tenant_id=t AND p.codigo=c;accounts:=accounts||jsonb_build_object(c,id);
 END LOOP;
 FOR row IN SELECT value FROM jsonb_array_elements('[{"date":"2024-12-01","debit":"10111","credit":"50","amount":100},{"date":"2024-12-02","debit":"10111","credit":"7011","amount":100},{"date":"2024-12-03","debit":"6211","credit":"10111","amount":10},{"date":"2025-12-03","debit":"6211","credit":"10111","amount":20},{"date":"2026-10-03","debit":"10111","credit":"7011","amount":5},{"date":"2027-01-03","debit":"6211","credit":"10111","amount":1000}]') LOOP
  PERFORM public.crear_asiento_con_detalles_tx(t,jsonb_build_object('fecha',row->>'date','concepto','History570 fixture','estado','CONFIRMADO','source_event_id',gen_random_uuid(),'created_by',actor,'confirmado_por',actor),jsonb_build_array(jsonb_build_object('cuenta_id',accounts->>(row->>'debit'),'debe',row->'amount','haber',0),jsonb_build_object('cuenta_id',accounts->>(row->>'credit'),'debe',0,'haber',row->'amount')));
 END LOOP;
 v:=public.balance_general_live(t,2026,10);
 IF (v->>'efectivo')::numeric<>175 OR (v->>'capital')::numeric<>100 OR (v->>'resultados_acumulados')::numeric<>70 OR (v->>'resultado_ejercicio')::numeric<>5 THEN RAISE EXCEPTION 'HISTORY570_PRIOR_PROFIT_LOSS_FUTURE:%',v;END IF;
 PERFORM public.cerrar_periodo_contable_tx(t,2024,12,actor);
 v:=public.balance_general_live(t,2026,10);IF (v->>'resultados_acumulados')::numeric<>70 THEN RAISE EXCEPTION 'HISTORY570_CLOSED_PROFIT_COUNTED_TWICE:%',v;END IF;
 PERFORM public.cerrar_periodo_contable_tx(t,2025,12,actor);
 v:=public.balance_general_live(t,2026,10);IF (v->>'resultados_acumulados')::numeric<>70 THEN RAISE EXCEPTION 'HISTORY570_CLOSED_LOSS_COUNTED_TWICE:%',v;END IF;
 PERFORM public.reabrir_periodo_contable_tx(t,2025,12,actor);
 v:=public.balance_general_live(t,2026,10);IF (v->>'resultados_acumulados')::numeric<>70 THEN RAISE EXCEPTION 'HISTORY570_REOPEN_PRIOR_LOST_RESULT:%',v;END IF;
 PERFORM public.cerrar_periodo_contable_tx(t,2025,12,actor);
 PERFORM public.cerrar_periodo_contable_tx(t,2026,10,actor);
 INSERT INTO public.periodos_contables(tenant_id,anio,mes,estado) VALUES(t,2026,12,'ABIERTO');
 PERFORM public.cerrar_periodo_contable_tx(t,2026,12,actor);
 v:=public.balance_general_live(t,2026,12);IF (v->>'resultados_acumulados')::numeric<>75 OR (v->>'resultado_ejercicio')::numeric<>0 THEN RAISE EXCEPTION 'HISTORY570_CURRENT_CLOSE_COUNTED_TWICE:%',v;END IF;
 PERFORM public.reabrir_periodo_contable_tx(t,2026,12,actor);
 v:=public.balance_general_live(t,2026,12);IF (v->>'resultados_acumulados')::numeric<>70 OR (v->>'resultado_ejercicio')::numeric<>5 THEN RAISE EXCEPTION 'HISTORY570_CURRENT_REOPEN_LOST_RESULT:%',v;END IF;
 IF (public.balance_general_live(gen_random_uuid(),2026,10)->>'resultados_acumulados')::numeric<>0 THEN RAISE EXCEPTION 'HISTORY570_TENANT_LEAK';END IF;
 RAISE NOTICE 'HISTORY570 PASS: prior profit/loss, future exclusion, annual close/reopen without double counting, tenant isolation';
END;$history570$;
ROLLBACK;

-- Revaluación real en infraestructura aislada: snapshot, libro, recibo y reversa.
BEGIN;
DO $fx570$
DECLARE t uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();supplier uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();
 payable uuid;receivable uuid;v jsonb;r jsonb;retry jsonb;reversal jsonb;journal_id uuid;c text;failed boolean;amount numeric;
 fiscal_note uuid;fiscal_document uuid;fiscal_cpe uuid;fiscal_row record;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'FX570_LOCAL_ONLY';END IF;
 IF has_function_privilege('anon','public.registrar_revaluacion_tx_570(uuid,uuid,date,jsonb,text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.registrar_revaluacion_tx_570(uuid,uuid,date,jsonb,text,text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.registrar_revaluacion_tx_570(uuid,uuid,date,jsonb,text,text)','EXECUTE')
  OR has_function_privilege('service_role','app.revaluacion_simulacion_570(uuid,date)','EXECUTE') THEN RAISE EXCEPTION 'FX570_ACL';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado) VALUES(t,'FX570-'||left(t::text,8),'FX570 verifier','PE','free',true,'ACTIVO');
 INSERT INTO public.empresa_config(tenant_id,pais,moneda,razon_social,ruc) VALUES(t,'PE','PEN','FX570 verifier','20100070970') ON CONFLICT(tenant_id) DO NOTHING;
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(actor,t,actor||'@fx570.test','Actor FX570',true,'ACTIVO',true);
 failed:=false;BEGIN
  PERFORM public.gestionar_maestro_contable_tx(t,actor,'FX','CREATE',NULL,
   '{"moneda_origen":"EUR","moneda_destino":"PEN","fecha":"2026-10-06","compra":4.1234567,"venta":4.15}', 'fx570-overprecision');
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FX_VALUES_INVALID' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.tipos_cambio WHERE tenant_id=t)
  OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t) THEN RAISE EXCEPTION 'FX570_PRECISION_PARTIAL_WRITE';END IF;
 INSERT INTO public.proveedores(id,tenant_id,ruc,razon_social,nombre,activo,estado) VALUES(supplier,t,'20123456786','Supplier FX570','Supplier FX570',true,'ACTIVO');
 INSERT INTO public.clientes(id,tenant_id,documento_tipo,ruc,nombre,razon_social,activo,estado) VALUES(customer,t,'RUC','20100070970','Customer FX570','Customer FX570',true,'ACTIVO');
 INSERT INTO public.periodos_contables(tenant_id,anio,mes,estado) SELECT t,2026,10,'ABIERTO' WHERE NOT EXISTS(SELECT 1 FROM public.periodos_contables WHERE tenant_id=t AND anio=2026 AND mes=10);
 FOREACH c IN ARRAY ARRAY['12','42','676','776'] LOOP
  INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado)
   SELECT t,c,'FX570 '||c,CASE WHEN c='12' THEN 'ACTIVO' WHEN c='42' THEN 'PASIVO' WHEN c='676' THEN 'GASTO' ELSE 'INGRESO' END,
    CASE WHEN c='12' THEN 'ACTIVO' WHEN c='42' THEN 'PASIVO' WHEN c='676' THEN 'GASTO' ELSE 'INGRESO' END,2,true,true,'ACTIVO'
   WHERE NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=t AND codigo=c);
 END LOOP;
 INSERT INTO public.tipos_cambio(tenant_id,moneda_origen,moneda_destino,fecha,compra,venta,fuente,activo,estado)
  VALUES(t,'USD','PEN','2026-10-07',3.8,3.760001,'MANUAL',true,'ACTIVO');
 INSERT INTO public.cuentas_por_pagar(tenant_id,proveedor_id,numero_documento,fecha_emision,fecha_vencimiento,moneda,subtotal,igv,total,saldo,saldo_pendiente,estado,condiciones_pago,tipo_cambio_origen)
  VALUES(t,supplier,'FX570-USD','2026-10-08','2026-11-08','USD',10,1.8,11.8,11.8,11.8,'PENDIENTE','CREDITO',3.75) RETURNING id INTO payable;
 UPDATE public.cuentas_por_pagar SET tipo_documento='FACTURA',fiscal_metadata='{"tipo_cambio":3.75}',metadata='{"tipo_cambio_pago":3.760001}' WHERE id=payable;
 INSERT INTO public.cuentas_por_pagar(tenant_id,proveedor_id,tipo_documento,numero_documento,fecha_emision,fecha_vencimiento,moneda,subtotal,igv,total,saldo,saldo_pendiente,estado,condiciones_pago,tipo_cambio_origen)
  VALUES(t,supplier,'NOTA_CREDITO','FX570-NC','2026-10-08','2026-11-08','USD',2,.36,2.36,2.36,2.36,'PENDIENTE','CREDITO',3.75) RETURNING id INTO fiscal_note;
 v:=app.build_sire_snapshot_463(t,'REG_COM','2026-10','{}');
 IF v->'totals'<>'{"base":30,"igv":5.4,"total":35.4}'::jsonb OR (v->>'total_registros')::integer<>2
  OR position('|37.50|6.75|44.25|USD|3.75|' IN v->>'contenido')=0
  OR position('|-7.50|-1.35|-8.85|USD|3.750000|' IN v->>'contenido')=0 THEN RAISE EXCEPTION 'FX570_RCE_CURRENCY_SIGN:%',v;END IF;
 DELETE FROM public.cuentas_por_pagar WHERE id=fiscal_note;
 FOR fiscal_row IN SELECT * FROM (VALUES ('FACTURA','F570',10::numeric,1.8::numeric,11.8::numeric),('NOTA_CREDITO','FC57',2::numeric,.36::numeric,2.36::numeric)) x(tipo,serie,base,igv,total) LOOP
  INSERT INTO public.documentos(tenant_id,tipo_documento,serie,numero,estado,fecha_emision,fecha_vencimiento,moneda,tipo_cambio,subtotal,impuesto_igv,total,total_gravadas,cliente_id,created_by)
   VALUES(t,fiscal_row.tipo,fiscal_row.serie,'1','EMITIDO','2026-10-08','2026-11-08','USD',3.75,fiscal_row.base,fiscal_row.igv,fiscal_row.total,fiscal_row.base,customer,actor) RETURNING id INTO fiscal_document;
  INSERT INTO public.cpe(tenant_id,documento_id,tipo_documento,serie,numero,estado,sunat_status,fecha_emision,moneda,total_gravadas,total_igv,total_venta,total)
   VALUES(t,fiscal_document,fiscal_row.tipo,fiscal_row.serie,'00000001','ACEPTADO','ACCEPTED','2026-10-08 12:00:00-05','USD',fiscal_row.base,fiscal_row.igv,fiscal_row.total,fiscal_row.total);
 END LOOP;
 v:=app.build_sire_snapshot_463(t,'REG_VEN','2026-10','{}');
 IF v->'totals'<>'{"base":30,"igv":5.4,"total":35.4}'::jsonb OR (v->>'total_registros')::integer<>2
  OR position('|-7.50|-1.35|-8.85|USD|3.750000' IN v->>'contenido')=0 THEN RAISE EXCEPTION 'FX570_RVIE_CURRENCY_SIGN:%',v;END IF;
 INSERT INTO public.cpe(tenant_id,tipo_documento,serie,numero,estado,sunat_status,fecha_emision,moneda,total)
  VALUES(t,'FACTURA','F570','00000002','ACEPTADO','ACCEPTED','2026-10-08 12:00:00-05','USD',1) RETURNING id INTO fiscal_cpe;
 failed:=false;BEGIN PERFORM app.build_sire_snapshot_463(t,'REG_VEN','2026-10','{}');
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SIRE_RVIE_EXCHANGE_RATE_REQUIRED' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'FX570_RVIE_MISSING_RATE';END IF;
 DELETE FROM public.cpe WHERE tenant_id=t;
 DELETE FROM public.documentos WHERE tenant_id=t;
 RAISE NOTICE 'FX570 FISCAL PASS: RCE/RVIE national currency, frozen documentary rate, NC signs, per-document rounding, missing foreign rate rejection';
 INSERT INTO public.cuentas_por_cobrar(tenant_id,cliente_id,estado,monto_total,monto_original,monto_pendiente,saldo,saldo_pendiente,total,fecha_emision,fecha_vencimiento,moneda,numero_documento,serie,numero,tipo_documento,idempotency_key,event_source,tipo_cambio_origen,metadata)
  VALUES(t,customer,'PENDIENTE',100,100,100,100,100,100,'2026-10-08','2026-11-08','USD','FX570-CXC','FX570','1','FACTURA','fx570-fixture','verify.fx570',3.7,jsonb_build_object('origen','migracion_apertura')) RETURNING id INTO receivable;
 IF jsonb_array_length(app.revaluacion_simulacion_570(t,'2026-10-07')->'posiciones')<>0 THEN RAISE EXCEPTION 'FX570_FUTURE_DOCUMENT';END IF;
 v:=app.revaluacion_simulacion_570(t,'2026-10-08');
 IF jsonb_array_length(v->'posiciones')<>2 OR (v->>'total_ganancia')::numeric<>10 OR (v->>'total_perdida')::numeric<>.12 OR (v->>'diferencia_neta')::numeric<>9.88 THEN RAISE EXCEPTION 'FX570_SIGN_SIDE_ROUNDING:%',v;END IF;
 IF jsonb_array_length(app.revaluacion_simulacion_570(gen_random_uuid(),'2026-10-08')->'posiciones')<>0 THEN RAISE EXCEPTION 'FX570_TENANT_LEAK';END IF;
 failed:=false;BEGIN PERFORM public.registrar_revaluacion_tx_570(t,gen_random_uuid(),'2026-10-08',v,NULL,'fx570-wrong-actor');EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'FX570_WRONG_ACTOR';END IF;
 UPDATE public.tipos_cambio SET venta=3.77 WHERE tenant_id=t;
 failed:=false;BEGIN PERFORM public.registrar_revaluacion_tx_570(t,actor,'2026-10-08',v,NULL,'fx570-stale-rate');EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.asientos_contables WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t AND operation_type='FX_REVALUATION') THEN RAISE EXCEPTION 'FX570_STALE_SNAPSHOT_OR_PARTIAL_WRITE';END IF;
 UPDATE public.tipos_cambio SET venta=3.760001 WHERE tenant_id=t;
 r:=public.registrar_revaluacion_tx_570(t,actor,'2026-10-08',v,NULL,'fx570-create-intent');journal_id:=(r->>'asiento_id')::uuid;
 retry:=public.registrar_revaluacion_tx_570(t,actor,'2026-10-08',v,NULL,'fx570-create-intent');IF retry IS DISTINCT FROM r THEN RAISE EXCEPTION 'FX570_ACK_RETRY_CHANGED';END IF;
 IF (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t)<>1 OR (SELECT count(*) FROM public.financial_master_operations WHERE tenant_id=t AND operation_type='FX_REVALUATION')<>1 THEN RAISE EXCEPTION 'FX570_DUPLICATE';END IF;
 SELECT sum(d.debe-d.haber) INTO amount FROM public.detalle_asientos d JOIN public.plan_cuentas p ON p.id=d.cuenta_id WHERE d.asiento_id=journal_id AND p.codigo='42';
 IF amount<>-.12 OR NOT EXISTS(SELECT 1 FROM public.asientos_contables a WHERE a.id=journal_id AND total_debe=10.12 AND total_haber=10.12) THEN RAISE EXCEPTION 'FX570_LEDGER';END IF;
 failed:=false;BEGIN PERFORM public.registrar_revaluacion_tx_570(t,actor,'2026-10-09',app.revaluacion_simulacion_570(t,'2026-10-09'),NULL,'fx570-next-cut');EXCEPTION WHEN object_not_in_prerequisite_state THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'FX570_DOUBLE_UNREALIZED';END IF;
 failed:=false;BEGIN UPDATE public.cuentas_por_pagar SET saldo=0,saldo_pendiente=0,estado='PAGADA' WHERE id=payable;EXCEPTION WHEN object_not_in_prerequisite_state THEN failed:=true;END;
 IF NOT failed OR (SELECT saldo FROM public.cuentas_por_pagar WHERE id=payable)<>11.8 THEN RAISE EXCEPTION 'FX570_SETTLEMENT_REQUIRES_REVERSAL';END IF;
 failed:=false;BEGIN PERFORM public.registrar_revaluacion_tx_570(t,actor,'2026-10-08',v,'Changed','fx570-create-intent');EXCEPTION WHEN unique_violation THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'FX570_KEY_REUSED';END IF;
 reversal:=public.crear_asiento_con_detalles_tx(t,jsonb_build_object('fecha','2026-10-08T00:00:00Z','concepto','FX570 reversal','estado','CONFIRMADO','reversion_de_asiento_id',journal_id,'created_by',actor,'confirmado_por',actor),
  (SELECT jsonb_agg(jsonb_build_object('cuenta_id',cuenta_id,'debe',haber,'haber',debe,'concepto','FX570 reversal')) FROM public.detalle_asientos WHERE asiento_id=journal_id));
 r:=public.registrar_revaluacion_tx_570(t,actor,'2026-10-08',v,NULL,'fx570-corrected-cut');
 IF r->>'asiento_id'=journal_id::text THEN RAISE EXCEPTION 'FX570_REVERSED_CUT_CANNOT_BE_CORRECTED';END IF;
 journal_id:=(r->>'asiento_id')::uuid;
 PERFORM public.crear_asiento_con_detalles_tx(t,jsonb_build_object('fecha','2026-10-08T00:00:00Z','concepto','FX570 final reversal','estado','CONFIRMADO','reversion_de_asiento_id',journal_id,'created_by',actor,'confirmado_por',actor),
  (SELECT jsonb_agg(jsonb_build_object('cuenta_id',cuenta_id,'debe',haber,'haber',debe,'concepto','FX570 final reversal')) FROM public.detalle_asientos WHERE asiento_id=journal_id));
 UPDATE public.cuentas_por_pagar SET saldo=0,saldo_pendiente=0,estado='PAGADA' WHERE id=payable;
 IF jsonb_array_length(app.revaluacion_simulacion_570(t,'2026-10-08')->'posiciones')<>1 THEN RAISE EXCEPTION 'FX570_PAID_EXCLUSION';END IF;
 UPDATE public.tipos_cambio SET activo=false,estado='INACTIVO' WHERE tenant_id=t;
 v:=app.revaluacion_simulacion_570(t,'2026-10-08');IF jsonb_array_length(v->'posiciones')<>0 OR jsonb_array_length(v->'excluidas')<>1 THEN RAISE EXCEPTION 'FX570_INACTIVE_RATE';END IF;
 RAISE NOTICE 'FX570 PASS: ACL, tenant/actor, cutoff, signs/sides/rounding, stale snapshot rollback, lost ACK receipt, journal uniqueness, double cut, settlement guard, conflict, reversal and corrected cut, paid exclusion, inactive quote';
END;$fx570$;
DO $commercial_review570$
DECLARE v_demo jsonb;t uuid;actor uuid;customer uuid;product uuid;list_id uuid;
 reviewed jsonb;fresh jsonb;r jsonb;replay jsonb;quote_id uuid;order_id uuid;
 before_count integer;failed boolean;signature text;helper regprocedure;before_quote jsonb;before_order jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_LOCAL_ONLY';END IF;
 helper:='app.assert_reviewed_commercial_prices_570(jsonb,jsonb)'::regprocedure;
 IF has_function_privilege('service_role',helper,'EXECUTE') OR has_function_privilege('anon',helper,'EXECUTE')
  OR has_function_privilege('authenticated',helper,'EXECUTE') OR EXISTS(
   SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=helper AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_HELPER_EXPOSED';END IF;
 FOREACH signature IN ARRAY ARRAY[
  'public.crear_cotizacion_comercial_tx(uuid,uuid,uuid,date,text,text,text,numeric,numeric,numeric,jsonb)',
  'public.actualizar_cotizacion_comercial_tx(uuid,uuid,jsonb,jsonb)',
  'public.crear_pedido_comercial_tx(jsonb,jsonb)',
  'public.actualizar_pedido_comercial_legacy_531(uuid,uuid,jsonb,jsonb)'
 ] LOOP
  IF strpos(pg_get_functiondef(signature::regprocedure),'PERFORM app.assert_reviewed_commercial_prices_570(p_detalle, v_detalle);')=0
   THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_WRITER_UNGUARDED:%',signature;END IF;
 END LOOP;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 v_demo:=public.create_demo_tenant_ready_tx('VERIFY-PRICE-REVIEW570',14,'PE','verify-price-review570-'||gen_random_uuid());
 t:=(v_demo->>'tenant_id')::uuid;actor:=(v_demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1;END IF;
 SELECT id INTO customer FROM clientes WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
 SELECT id INTO product FROM productos WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
 INSERT INTO listas_precios_venta(tenant_id,codigo,nombre,moneda,cliente_id,prioridad,vigencia_desde,created_by)
  VALUES(t,'REVIEW570','Precio revisado570','PEN',customer,100,app.hoy_tenant(t),actor) RETURNING id INTO list_id;
 INSERT INTO lista_precios_venta_detalles(tenant_id,lista_id,producto_id,cantidad_minima,precio_unitario) VALUES(t,list_id,product,0,31);
 reviewed:=jsonb_build_array(jsonb_build_object('producto_id',product,'descripcion','Review570','cantidad',1,'precio_unitario',40,'orden',1));
 fresh:=jsonb_set(reviewed,'{0,precio_unitario}','31'::jsonb);
 SELECT count(*) INTO before_count FROM cotizaciones WHERE tenant_id=t;
 failed:=false;BEGIN
  PERFORM public.crear_cotizacion_idempotente_tx_567(t,actor,'review570-quote',repeat('a',64),customer,NULL,'Review570','Verifier','PEN',40,7.2,47.2,reviewed);
 EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed OR (SELECT count(*) FROM cotizaciones WHERE tenant_id=t)<>before_count
  OR EXISTS(SELECT 1 FROM sales_creation_intents WHERE tenant_id=t AND idempotency_key='review570-quote')
 THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_QUOTE_CREATED_STALE';END IF;
 r:=public.crear_cotizacion_idempotente_tx_567(t,actor,'review570-quote',repeat('b',64),customer,NULL,'Review570','Verifier','PEN',31,5.58,36.58,fresh);
 quote_id:=(r#>>'{cotizacion,id}')::uuid;
 SELECT count(*) INTO before_count FROM pedidos_venta WHERE tenant_id=t;
 failed:=false;BEGIN
  PERFORM public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',actor,'cliente_id',customer,'moneda','PEN'),reviewed);
 EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed OR (SELECT count(*) FROM pedidos_venta WHERE tenant_id=t)<>before_count THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_ORDER_CREATED_STALE';END IF;
 r:=public.crear_pedido_comercial_tx(jsonb_build_object('tenant_id',t,'created_by',actor,'cliente_id',customer,'moneda','PEN'),fresh);
 order_id:=(r->>'pedido_id')::uuid;
 -- El catálogo demo mezcla afectaciones IGV: congelar la fila calculada en
 -- vez de asumir 18% para un producto elegido entre UUID aleatorios.
 SELECT to_jsonb(c) INTO before_quote FROM cotizaciones c WHERE id=quote_id;
 SELECT to_jsonb(p) INTO before_order FROM pedidos_venta p WHERE id=order_id;
 UPDATE lista_precios_venta_detalles SET precio_unitario=50 WHERE lista_id=list_id;
 failed:=false;BEGIN PERFORM public.actualizar_cotizacion_comercial_tx(quote_id,t,'{}',fresh);EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed OR (SELECT to_jsonb(c) FROM cotizaciones c WHERE id=quote_id) IS DISTINCT FROM before_quote THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_QUOTE_UPDATED_STALE';END IF;
 failed:=false;BEGIN PERFORM public.actualizar_pedido_comercial_tx(order_id,t,'{}',fresh);EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed OR (SELECT to_jsonb(p) FROM pedidos_venta p WHERE id=order_id) IS DISTINCT FROM before_order THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_ORDER_UPDATED_STALE';END IF;
 replay:=public.crear_cotizacion_idempotente_tx_567(t,actor,'review570-quote',repeat('b',64),customer,NULL,'Review570','Verifier','PEN',31,5.58,36.58,fresh);
 IF replay#>>'{cotizacion,id}'<>quote_id::text OR NOT (replay->>'idempotent')::boolean THEN RAISE EXCEPTION 'COMMERCIAL_REVIEW570_REPLAY_REPRICED';END IF;
 RAISE NOTICE 'COMMERCIAL_REVIEW570 PASS: four atomic writers, stale create/update rollback, current-price create, no failed receipt, committed replay preserved';
END;$commercial_review570$;
ROLLBACK;

BEGIN READ ONLY;
DO $document_files570$
BEGIN
 IF NOT has_table_privilege('service_role','public.documento_archivos','SELECT') THEN
  RAISE EXCEPTION 'DOCUMENT_FILES570_BACKEND_SELECT_MISSING';
 END IF;
 -- El preservation gate congela el resto de ACL, owner, RLS y policies.
 RAISE NOTICE 'DOCUMENT_FILES570 PASS: backend detail read, remaining security preserved';
END;$document_files570$;
SET LOCAL ROLE service_role;
SELECT d.id, f.id FROM public.documentos d
LEFT JOIN public.documento_archivos f ON f.documento_id=d.id AND f.tenant_id=d.tenant_id
WHERE false;
ROLLBACK;

BEGIN READ ONLY;
DO $cpe_cancellation_read570$
BEGIN
 IF NOT has_table_privilege('service_role','public.cxc_cobro_reversas','SELECT') THEN
  RAISE EXCEPTION 'CPE_CANCELLATION_READ570_BACKEND_SELECT_MISSING';
 END IF;
 -- No se revocan permisos históricos: el snapshot de preservación compara
 -- todo el ACL salvo este SELECT no delegable, incluidos los DML preexistentes.
 IF EXISTS(SELECT 1 FROM pg_class c,
   LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid='public.cxc_cobro_reversas'::regclass AND a.grantee='service_role'::regrole
   AND a.privilege_type='SELECT' AND a.is_grantable) THEN
  RAISE EXCEPTION 'CPE_CANCELLATION_READ570_SELECT_GRANT_OPTION';
 END IF;
 RAISE NOTICE 'CPE_CANCELLATION_READ570 PASS: backend SELECT added; remaining security preserved by full snapshot';
END;$cpe_cancellation_read570$;
SET LOCAL ROLE service_role;
SELECT id FROM public.cxc_cobro_reversas WHERE false;
ROLLBACK;

BEGIN;
DO $provision570_verify$
DECLARE t uuid; actor uuid; customer uuid; cxc uuid; period_id uuid; demo jsonb;
 first_result jsonb; replay jsonb; rejected boolean; balance numeric; item jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'PROVISION570_LOCAL_ONLY'; END IF;
 IF NOT has_function_privilege('service_role','public.provisionar_cobranza_dudosa_tx_570(uuid,text,uuid,integer,text)','EXECUTE')
  OR has_function_privilege('anon','public.provisionar_cobranza_dudosa_tx_570(uuid,text,uuid,integer,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.provisionar_cobranza_dudosa_tx_570(uuid,text,uuid,integer,text)','EXECUTE')
 THEN
  RAISE EXCEPTION 'PROVISION570_RPC_ACL';
 END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant_ready_tx('VERIFY-PROVISION570',14,'PE','verify-provision570-'||gen_random_uuid());
 t:=(demo->>'tenant_id')::uuid; actor:=(demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM public.usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1; END IF;
 INSERT INTO public.periodos_contables(tenant_id,anio,mes,codigo,nombre,estado)
 VALUES(t,2026,8,'2026-08','Verifier provision570','ABIERTO') ON CONFLICT DO NOTHING;
 SELECT id INTO period_id FROM public.periodos_contables WHERE tenant_id=t AND anio=2026 AND mes=8;
 INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado)
 VALUES(t,'68','Provision','GASTO','GASTO',2,true,true,'ACTIVO'),
       (t,'19','Estimacion','ACTIVO','ACTIVO',2,true,true,'ACTIVO') ON CONFLICT DO NOTHING;
 SELECT id,round(coalesce(saldo_pendiente,saldo,0),2) INTO cxc,balance
  FROM public.cuentas_por_cobrar WHERE tenant_id=t AND coalesce(saldo_pendiente,saldo,0)>0 ORDER BY id LIMIT 1;
 IF cxc IS NULL THEN RAISE EXCEPTION 'PROVISION570_FIXTURE_NO_DEBT'; END IF;
 first_result:=public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,360,'provision570-zero');
 IF (first_result->>'documentos')::integer<>0 OR first_result->'asiento'<>'null'::jsonb
  OR first_result->'detalles'<>'[]'::jsonb OR first_result->'provisiones'<>'[]'::jsonb THEN
  RAISE EXCEPTION 'PROVISION570_ZERO_RECEIPT';
 END IF;
 UPDATE public.cuentas_por_cobrar SET fecha_emision='2024-01-10',fecha_vencimiento='2024-02-10' WHERE id=cxc;
 replay:=public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,360,'provision570-zero');
 IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' OR NOT (replay->>'idempotent')::boolean
  OR EXISTS(SELECT 1 FROM public.provisiones_cobranza_dudosa WHERE tenant_id=t) THEN
  RAISE EXCEPTION 'PROVISION570_ZERO_REPLAY_REEVALUATED';
 END IF;
 rejected:=false; BEGIN PERFORM public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,1,'provision570-zero');
 EXCEPTION WHEN invalid_parameter_value THEN rejected:=SQLERRM='PROVISION570_IDEMPOTENCY_CONFLICT'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'PROVISION570_CONFLICT_NOT_REJECTED'; END IF;
 rejected:=false; BEGIN PERFORM public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',gen_random_uuid(),360,'provision570-denied');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'PROVISION570_ACTOR_NOT_REJECTED'; END IF;
 UPDATE public.cuentas_por_cobrar SET moneda='USD' WHERE id=cxc;
 rejected:=false; BEGIN PERFORM public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,360,'provision570-currency');
 EXCEPTION WHEN invalid_parameter_value THEN rejected:=SQLERRM='PROVISION570_CURRENCY_REQUIRES_CONVERSION'; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t AND idempotency_key='provision570-currency') THEN
  RAISE EXCEPTION 'PROVISION570_CURRENCY_NOT_ATOMIC';
 END IF;
 UPDATE public.cuentas_por_cobrar SET moneda='PEN' WHERE id=cxc;
 first_result:=public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,360,'provision570-positive');
 IF (first_result->>'documentos')::integer<>1 OR (first_result->>'monto_provisionado')::numeric<>balance
  OR first_result#>>'{asiento,estado}'<>'CONFIRMADO' OR jsonb_array_length(first_result->'detalles')<>2
  OR jsonb_array_length(first_result->'provisiones')<>1 OR first_result->>'tenant_id'<>t::text
  OR first_result->>'actor_id'<>actor::text OR first_result->>'periodo_id'<>period_id::text THEN
  RAISE EXCEPTION 'PROVISION570_POSITIVE_RECEIPT';
 END IF;
 -- Un replay recupera el recibo original aunque el período se cierre después.
 PERFORM set_config('app.period_transition_458','on',true);
 UPDATE public.periodos_contables SET estado='CERRADO' WHERE id=period_id;
 PERFORM set_config('app.period_transition_458','off',true);
 replay:=public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,360,'provision570-positive');
 IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' OR NOT (replay->>'idempotent')::boolean
  OR (SELECT count(*) FROM public.provisiones_cobranza_dudosa WHERE tenant_id=t)<>1
  OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t AND origen='PROVISION_COBRANZA_DUDOSA')<>1 THEN
  RAISE EXCEPTION 'PROVISION570_POSITIVE_REPLAY_DUPLICATED';
 END IF;
 rejected:=false; BEGIN PERFORM public.provisionar_cobranza_dudosa_tx_570(t,'2026-08',actor,360,'provision570-closed');
 EXCEPTION WHEN check_violation THEN rejected:=SQLERRM='PROVISION570_PERIOD_NOT_OPEN'; END;
 IF NOT rejected OR (SELECT count(*) FROM public.financial_master_operations WHERE tenant_id=t AND operation_type='ACCOUNTING_BAD_DEBT_PROVISION')<>2 THEN
  RAISE EXCEPTION 'PROVISION570_CLOSED_OPERATION_CREATED';
 END IF;
 RAISE NOTICE 'PROVISION570 PASS: server-only RPC, actor, currency/closed rollback, frozen zero replay, full positive replay after close, one journal and detail';
END;
$provision570_verify$;
ROLLBACK;

BEGIN;
DO $budget570_verify$
DECLARE t uuid;actor uuid;center_id uuid;account_id uuid;period_id uuid;demo jsonb;payload jsonb;
 first_result jsonb;replay jsonb;rejected boolean;rid uuid;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'BUDGET570_LOCAL_ONLY';END IF;
 IF NOT has_function_privilege('service_role','public.crear_presupuesto_tx_570(uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('anon','public.crear_presupuesto_tx_570(uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.crear_presupuesto_tx_570(uuid,uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'BUDGET570_RPC_ACL';END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant_ready_tx('VERIFY-BUDGET570',14,'PE','verify-budget570-'||gen_random_uuid());t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM public.usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1;END IF;
 INSERT INTO public.centros_costo(tenant_id,codigo,nombre) VALUES(t,'BUD570','Centro presupuesto verifier') RETURNING id INTO center_id;
 INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES(t,'6391570','Cuenta presupuesto verifier','GASTO','GASTO',7,true,true,'ACTIVO') RETURNING id INTO account_id;
 INSERT INTO public.periodos_contables(tenant_id,anio,mes,codigo,nombre,estado) VALUES(t,2028,11,'2028-11','Período presupuesto verifier','ABIERTO') RETURNING id INTO period_id;
 payload:=jsonb_build_object('centro_costo_id',center_id,'cuenta_id',account_id,'periodo_contable_id',period_id,'monto_presupuestado',3.17,'notas','Alta presupuesto verifier','estado','ACTIVO');
 first_result:=public.crear_presupuesto_tx_570(t,actor,payload,'budget570-positive');rid:=(first_result->>'id')::uuid;
 IF first_result->>'success'<>'true' OR first_result->>'action'<>'CREATE' OR first_result->>'tenant_id'<>t::text OR first_result->>'actor_id'<>actor::text OR first_result->>'idempotency_key'<>'budget570-positive' OR first_result->'payload' IS DISTINCT FROM payload OR first_result#>>'{record,id}'<>rid::text OR (first_result#>>'{record,monto_presupuestado}')::numeric<>3.17 OR (first_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET570_FULL_RECEIPT';END IF;
 IF (SELECT result FROM public.financial_master_operations WHERE id=(first_result->>'operation_id')::uuid) IS DISTINCT FROM first_result THEN RAISE EXCEPTION 'BUDGET570_RECEIPT_NOT_FROZEN';END IF;
 replay:=public.crear_presupuesto_tx_570(t,actor,payload,'budget570-positive');IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' OR NOT(replay->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET570_REPLAY';END IF;
 rejected:=false;BEGIN PERFORM public.crear_presupuesto_tx_570(t,actor,payload,'budget570-duplicate');EXCEPTION WHEN unique_violation THEN rejected:=true;END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t AND idempotency_key='budget570-duplicate') THEN RAISE EXCEPTION 'BUDGET570_DUPLICATE_NOT_ATOMIC';END IF;
 rejected:=false;BEGIN PERFORM public.crear_presupuesto_tx_570(t,gen_random_uuid(),payload,'budget570-actor');EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET570_ACTOR_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.crear_presupuesto_tx_570(t,actor,payload||jsonb_build_object('monto_presupuestado',3.171),'budget570-precision');EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t AND idempotency_key='budget570-precision') THEN RAISE EXCEPTION 'BUDGET570_PRECISION_NOT_ATOMIC';END IF;
 rejected:=false;BEGIN PERFORM public.crear_presupuesto_tx_570(t,actor,payload||jsonb_build_object('monto_presupuestado',4.44),'budget570-positive');EXCEPTION WHEN invalid_parameter_value THEN rejected:=SQLERRM='BUDGET570_IDEMPOTENCY_CONFLICT';END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET570_CONFLICT_ALLOWED';END IF;
 PERFORM public.gestionar_presupuesto_tx(t,actor,'UPDATE',rid,jsonb_build_object('monto_presupuestado',8.29),'budget570-fixture-update');
 replay:=public.crear_presupuesto_tx_570(t,actor,payload,'budget570-positive');IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' THEN RAISE EXCEPTION 'BUDGET570_REPLAY_CURRENT_ROW';END IF;
 PERFORM public.gestionar_presupuesto_tx(t,actor,'DELETE',rid,'{}'::jsonb,'budget570-fixture-delete');
 PERFORM set_config('app.period_transition_458','on',true);UPDATE public.periodos_contables SET estado='BLOQUEADO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 replay:=public.crear_presupuesto_tx_570(t,actor,payload,'budget570-positive');IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' OR NOT(replay->>'idempotent')::boolean OR EXISTS(SELECT 1 FROM public.presupuestos WHERE id=rid) THEN RAISE EXCEPTION 'BUDGET570_REPLAY_AFTER_DELETE_BLOCK';END IF;
 rejected:=false;BEGIN PERFORM public.crear_presupuesto_tx_570(t,actor,payload,'budget570-blocked');EXCEPTION WHEN check_violation THEN rejected:=SQLERRM='BUDGET570_PERIOD_NOT_OPEN';END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t AND idempotency_key='budget570-blocked') OR (SELECT count(*) FROM public.financial_master_operations WHERE tenant_id=t AND operation_type='BUDGET_CREATE')<>1 THEN RAISE EXCEPTION 'BUDGET570_BLOCKED_WRITE';END IF;
 RAISE NOTICE 'BUDGET570 PASS: actor/permission, full frozen receipt, same-key replay after row edit/delete and blocked period, precision/conflict/duplicate rollback';
END $budget570_verify$;
ROLLBACK;

BEGIN;
DO $budget_update570_verify$
DECLARE t uuid;actor uuid;center_id uuid;account_id uuid;period_id uuid;demo jsonb;payload jsonb;snapshot jsonb;rid uuid;
 first_result jsonb;replay jsonb;rejected boolean;denied_actor uuid;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'BUDGET_UPDATE570_LOCAL_ONLY';END IF;
 IF NOT has_function_privilege('service_role','public.actualizar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('anon','public.actualizar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.actualizar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'BUDGET_UPDATE570_RPC_ACL';END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant_ready_tx('VERIFY-BUDGET-UPDATE570',14,'PE','verify-budget-update570-'||gen_random_uuid());t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM public.usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1;END IF;
 INSERT INTO public.centros_costo(tenant_id,codigo,nombre) VALUES(t,'BU570','Centro edición presupuesto verifier') RETURNING id INTO center_id;
 INSERT INTO public.plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES(t,'6391571','Cuenta edición presupuesto verifier','GASTO','GASTO',7,true,true,'ACTIVO') RETURNING id INTO account_id;
 INSERT INTO public.periodos_contables(tenant_id,anio,mes,codigo,nombre,estado) VALUES(t,2028,11,'2028-11','Período edición verifier','ABIERTO') RETURNING id INTO period_id;
 first_result:=public.crear_presupuesto_tx_570(t,actor,jsonb_build_object('centro_costo_id',center_id,'cuenta_id',account_id,'periodo_contable_id',period_id,'monto_presupuestado',3.17,'notas','Alta fixture edición','estado','ACTIVO'),'budget-update570-fixture-create');rid:=(first_result->>'id')::uuid;snapshot:=first_result->'record';
 payload:=jsonb_build_object('monto_presupuestado',3.29,'notas','Edición fixture','estado','ACTIVO','expected_snapshot',snapshot);
 denied_actor:=gen_random_uuid();INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(denied_actor,t,denied_actor||'@verify.local','Actor sin roles',true,'ACTIVO',false);
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,denied_actor,rid,payload,'budget-update570-no-permission');EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_UPDATE570_PERMISSION_ALLOWED';END IF;
 PERFORM set_config('app.period_transition_458','on',true);UPDATE public.periodos_contables SET estado='BLOQUEADO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,actor,rid,payload,'budget-update570-blocked');EXCEPTION WHEN check_violation THEN rejected:=SQLERRM='BUDGET_UPDATE570_PERIOD_NOT_OPEN';END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM financial_master_operations WHERE tenant_id=t AND idempotency_key='budget-update570-blocked') THEN RAISE EXCEPTION 'BUDGET_UPDATE570_BLOCKED_NOT_ATOMIC';END IF;
 PERFORM set_config('app.period_transition_458','on',true);UPDATE public.periodos_contables SET estado='ABIERTO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 first_result:=public.actualizar_presupuesto_tx_570(t,actor,rid,payload,'budget-update570-positive');
 IF first_result->>'success'<>'true' OR first_result->>'action'<>'UPDATE' OR first_result->>'id'<>rid::text OR first_result->>'actor_id'<>actor::text OR first_result->>'tenant_id'<>t::text OR first_result->'payload' IS DISTINCT FROM payload OR first_result#>>'{record,id}'<>rid::text OR (first_result#>>'{record,monto_presupuestado}')::numeric<>3.29 OR (first_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET_UPDATE570_FULL_RECEIPT';END IF;
 IF (SELECT result FROM financial_master_operations WHERE id=(first_result->>'operation_id')::uuid) IS DISTINCT FROM first_result THEN RAISE EXCEPTION 'BUDGET_UPDATE570_NOT_FROZEN';END IF;
 replay:=public.actualizar_presupuesto_tx_570(t,actor,rid,payload,'budget-update570-positive');IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' OR NOT(replay->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET_UPDATE570_REPLAY';END IF;
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,actor,rid,payload,'budget-update570-stale');EXCEPTION WHEN serialization_failure THEN rejected:=SQLERRM='BUDGET_UPDATE570_SNAPSHOT_CHANGED';END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM financial_master_operations WHERE tenant_id=t AND idempotency_key='budget-update570-stale') OR (SELECT monto_presupuestado FROM presupuestos WHERE id=rid)<>3.29 THEN RAISE EXCEPTION 'BUDGET_UPDATE570_STALE_NOT_ATOMIC';END IF;
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,actor,rid,payload||jsonb_build_object('monto_presupuestado',4.11),'budget-update570-positive');EXCEPTION WHEN invalid_parameter_value THEN rejected:=SQLERRM='BUDGET_UPDATE570_IDEMPOTENCY_CONFLICT';END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_UPDATE570_CONFLICT_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,gen_random_uuid(),rid,payload,'budget-update570-actor');EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_UPDATE570_ACTOR_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,actor,rid,payload||jsonb_build_object('monto_presupuestado',3.291),'budget-update570-precision');EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_UPDATE570_PRECISION_ALLOWED';END IF;
 PERFORM public.gestionar_presupuesto_tx(t,actor,'UPDATE',rid,jsonb_build_object('monto_presupuestado',8.29),'budget-update570-fixture-edit');
 replay:=public.actualizar_presupuesto_tx_570(t,actor,rid,payload,'budget-update570-positive');IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' THEN RAISE EXCEPTION 'BUDGET_UPDATE570_REPLAY_CURRENT_ROW';END IF;
 PERFORM public.gestionar_presupuesto_tx(t,actor,'DELETE',rid,'{}'::jsonb,'budget-update570-fixture-delete');
 PERFORM set_config('app.period_transition_458','on',true);UPDATE public.periodos_contables SET estado='BLOQUEADO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 replay:=public.actualizar_presupuesto_tx_570(t,actor,rid,payload,'budget-update570-positive');IF replay-'idempotent' IS DISTINCT FROM first_result-'idempotent' OR NOT(replay->>'idempotent')::boolean OR EXISTS(SELECT 1 FROM presupuestos WHERE id=rid) THEN RAISE EXCEPTION 'BUDGET_UPDATE570_REPLAY_AFTER_DELETE';END IF;
 IF (SELECT count(*) FROM financial_master_operations WHERE tenant_id=t AND idempotency_key='budget-update570-positive')<>1 THEN RAISE EXCEPTION 'BUDGET_UPDATE570_DUPLICATE_LEDGER';END IF;
 RAISE NOTICE 'BUDGET_UPDATE570 PASS: actor/permission, frozen full receipt, same-key replay after later edit/delete/block; stale/precision/conflict atomic rollback';
END $budget_update570_verify$;
ROLLBACK;

BEGIN;
DO $delivery570_verify$
DECLARE t uuid;actor uuid;demo jsonb;client_id uuid;product_id uuid;rid uuid;snapshot jsonb;payload jsonb;r jsonb;again jsonb;created jsonb;denied boolean;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'DELIVERY570_LOCAL_ONLY';END IF;
 IF NOT has_function_privilege('service_role','public.registrar_entrega_pedido_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('anon','public.registrar_entrega_pedido_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.registrar_entrega_pedido_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'DELIVERY570_ACL';END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant_ready_tx('VERIFY-DELIVERY570',14,'PE','verify-delivery570-'||gen_random_uuid());t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1;END IF;
 INSERT INTO clientes(tenant_id,codigo,nombre,razon_social,documento_tipo,ruc,activo) VALUES(t,'DV570','Cliente entrega verifier','Cliente entrega verifier','RUC','20123456786',true) RETURNING id INTO client_id;
 INSERT INTO productos(tenant_id,codigo,nombre,estado,activo,es_servicio,controla_stock,precio_venta,precio_compra,afectacion_igv,stock,stock_actual,stock_reservado) VALUES(t,'DV570','Servicio entrega verifier','ACTIVO',true,true,false,3,0,'10',0,0,0) RETURNING id INTO product_id;
 created:=public.crear_pedido_completo(jsonb_build_object('tenant_id',t,'cliente_id',client_id,'created_by',actor,'moneda','PEN'),jsonb_build_array(jsonb_build_object('producto_id',product_id,'descripcion','Línea entrega verifier','cantidad',1,'precio_unitario',3)));rid:=(created->>'pedido_id')::uuid;
 UPDATE pedidos_venta SET estado='FACTURADO',tracking_estado='EN_TRANSITO' WHERE id=rid AND tenant_id=t;
 SELECT to_jsonb(p) INTO snapshot FROM pedidos_venta p WHERE id=rid AND tenant_id=t;
 payload:=jsonb_build_object('estado','ENTREGADO','notas','Entrega verifier','expected_snapshot',snapshot);
 denied:=false;BEGIN PERFORM public.registrar_entrega_pedido_tx_570(t,gen_random_uuid(),rid,payload,'delivery570-invalid-actor');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'DELIVERY570_ACTOR_ALLOWED';END IF;
 denied:=false;BEGIN PERFORM public.registrar_entrega_pedido_tx_570(t,actor,rid,payload||jsonb_build_object('expected_snapshot',snapshot||jsonb_build_object('total',7.08)),'delivery570-stale');EXCEPTION WHEN serialization_failure THEN denied:=true;END;IF NOT denied OR EXISTS(SELECT 1 FROM logistica_eventos WHERE tenant_id=t AND pedido_id=rid) THEN RAISE EXCEPTION 'DELIVERY570_STALE_NOT_ATOMIC';END IF;
 r:=public.registrar_entrega_pedido_tx_570(t,actor,rid,payload,'delivery570-positive');
 IF r->>'success'<>'true' OR r#>>'{pedido,estado}'<>'COMPLETADO' OR r#>>'{pedido,tracking_estado}'<>'ENTREGADO' OR r#>>'{evento,registrado_por}'<>actor::text OR r#>>'{auditoria,user_id}'<>actor::text OR r->'payload' IS DISTINCT FROM payload OR (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'DELIVERY570_FULL_RECEIPT';END IF;
 IF (SELECT datos->'resultado' FROM logistica_eventos WHERE id=(r#>>'{evento,id}')::uuid) IS DISTINCT FROM r THEN RAISE EXCEPTION 'DELIVERY570_NOT_FROZEN';END IF;
 again:=public.registrar_entrega_pedido_tx_570(t,actor,rid,payload,'delivery570-positive');IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR NOT(again->>'idempotent')::boolean THEN RAISE EXCEPTION 'DELIVERY570_REPLAY';END IF;
 denied:=false;BEGIN PERFORM public.registrar_entrega_pedido_tx_570(t,actor,rid,payload||jsonb_build_object('notas','Other body'),'delivery570-positive');EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'DELIVERY570_CONFLICT_ALLOWED';END IF;
 SELECT to_jsonb(p) INTO snapshot FROM pedidos_venta p WHERE id=rid AND tenant_id=t;
 denied:=false;BEGIN PERFORM public.registrar_entrega_pedido_tx_570(t,actor,rid,payload||jsonb_build_object('expected_snapshot',snapshot),'delivery570-second-key');EXCEPTION WHEN check_violation THEN denied:=SQLERRM='DELIVERY570_ALREADY_REGISTERED';END;IF NOT denied THEN RAISE EXCEPTION 'DELIVERY570_DUPLICATE_DELIVERY_ALLOWED';END IF;
 UPDATE pedidos_venta SET notas='Cambio posterior aislado' WHERE id=rid;
 again:=public.registrar_entrega_pedido_tx_570(t,actor,rid,payload,'delivery570-positive');IF again-'idempotent' IS DISTINCT FROM r-'idempotent' THEN RAISE EXCEPTION 'DELIVERY570_REPLAY_REBUILT';END IF;
 IF (SELECT count(*) FROM logistica_eventos WHERE tenant_id=t AND pedido_id=rid AND tipo='ENTREGA')<>1 OR (SELECT count(*) FROM audit_log WHERE tenant_id=t AND record_id=rid::text AND metadata->>'source'='operar_logistica_tx')<>1 THEN RAISE EXCEPTION 'DELIVERY570_DUPLICATED_EFFECT';END IF;
 RAISE NOTICE 'DELIVERY570 PASS: actor/scope, full original order/detail/event/audit, frozen replay after later change, stale/conflict rollback, second-key delivery blocked';
END $delivery570_verify$;
ROLLBACK;


BEGIN;
DO $budget_delete570_verify$
DECLARE t uuid;actor uuid;demo jsonb;center_id uuid;account_id uuid;period_id uuid;rid uuid;snapshot jsonb;payload jsonb;r jsonb;again jsonb;rejected boolean;k text:=gen_random_uuid()::text;denied_actor uuid;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'BUDGET_DELETE570_LOCAL_ONLY';END IF;
 IF NOT has_function_privilege('service_role','public.eliminar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('anon','public.eliminar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.eliminar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'BUDGET_DELETE570_ACL';END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant_ready_tx('VERIFY-BUDGET-DELETE570',14,'PE','verify-budget-delete570-'||gen_random_uuid());t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1;END IF;
 INSERT INTO centros_costo(tenant_id,codigo,nombre,estado,activo) VALUES(t,'BD570','Centro baja verifier','ACTIVO',true) RETURNING id INTO center_id;
 INSERT INTO plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES(t,'6391572','Cuenta baja verifier','GASTO','GASTO',7,true,true,'ACTIVO') RETURNING id INTO account_id;
 INSERT INTO periodos_contables(tenant_id,anio,mes,codigo,nombre,estado) VALUES(t,2028,12,'2028-12','Período baja verifier','ABIERTO') RETURNING id INTO period_id;
 r:=public.crear_presupuesto_tx_570(t,actor,jsonb_build_object('centro_costo_id',center_id,'cuenta_id',account_id,'periodo_contable_id',period_id,'monto_presupuestado',3.17,'notas','Alta fixture baja','estado','ACTIVO'),'budget-delete570-fixture-create');rid:=(r->>'id')::uuid;snapshot:=r->'record';payload:=jsonb_build_object('expected_snapshot',snapshot);
 denied_actor:=gen_random_uuid();INSERT INTO usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES(denied_actor,t,denied_actor||'@verify.local','Actor sin roles',true,'ACTIVO',false);
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,denied_actor,rid,payload,gen_random_uuid()::text);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_DELETE570_PERMISSION_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,actor,rid,payload||jsonb_build_object('extra',true),gen_random_uuid()::text);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_DELETE570_EXTRA_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,actor,rid,jsonb_build_object('expected_snapshot',snapshot||jsonb_build_object('tenant_id',gen_random_uuid())),gen_random_uuid()::text);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_DELETE570_FOREIGN_SNAPSHOT_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,actor,rid,jsonb_build_object('expected_snapshot',snapshot||jsonb_build_object('monto_presupuestado',9)),gen_random_uuid()::text);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected OR NOT EXISTS(SELECT 1 FROM presupuestos WHERE tenant_id=t AND id=rid) OR EXISTS(SELECT 1 FROM financial_master_operations WHERE tenant_id=t AND operation_type='BUDGET_DELETE') THEN RAISE EXCEPTION 'BUDGET_DELETE570_STALE_NOT_ATOMIC';END IF;
 PERFORM set_config('app.period_transition_458','on',true);UPDATE periodos_contables SET estado='BLOQUEADO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,actor,rid,payload,gen_random_uuid()::text);EXCEPTION WHEN check_violation THEN rejected:=SQLERRM='BUDGET_DELETE570_PERIOD_NOT_OPEN';END;IF NOT rejected OR NOT EXISTS(SELECT 1 FROM presupuestos WHERE tenant_id=t AND id=rid) THEN RAISE EXCEPTION 'BUDGET_DELETE570_CLOSED_ALLOWED';END IF;
 PERFORM set_config('app.period_transition_458','on',true);UPDATE periodos_contables SET estado='ABIERTO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 r:=public.eliminar_presupuesto_tx_570(t,actor,rid,payload,k);
 IF r->>'success'<>'true' OR r->>'action'<>'DELETE' OR r->>'id'<>rid::text OR r->'record' IS DISTINCT FROM snapshot OR r->'payload' IS DISTINCT FROM payload OR r->>'tenant_id'<>t::text OR r->>'actor_id'<>actor::text OR r->>'idempotency_key'<>k OR (r->>'idempotent')::boolean OR EXISTS(SELECT 1 FROM presupuestos WHERE tenant_id=t AND id=rid) THEN RAISE EXCEPTION 'BUDGET_DELETE570_FULL_RECEIPT';END IF;
 IF (SELECT result FROM financial_master_operations WHERE id=(r->>'operation_id')::uuid) IS DISTINCT FROM r THEN RAISE EXCEPTION 'BUDGET_DELETE570_NOT_FROZEN';END IF;
 PERFORM set_config('app.period_transition_458','on',true);UPDATE periodos_contables SET estado='BLOQUEADO' WHERE id=period_id;PERFORM set_config('app.period_transition_458','off',true);
 again:=public.eliminar_presupuesto_tx_570(t,actor,rid,payload,k);IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR NOT(again->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET_DELETE570_REPLAY_REBUILT';END IF;
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,actor,rid,jsonb_build_object('expected_snapshot',snapshot||jsonb_build_object('notas','another')),k);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_DELETE570_KEY_CONFLICT_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.eliminar_presupuesto_tx_570(t,actor,rid,payload,gen_random_uuid()::text);EXCEPTION WHEN no_data_found THEN rejected:=true;END;IF NOT rejected OR (SELECT count(*) FROM financial_master_operations WHERE tenant_id=t AND operation_type='BUDGET_DELETE')<>1 THEN RAISE EXCEPTION 'BUDGET_DELETE570_DUPLICATED_EFFECT';END IF;
 RAISE NOTICE 'BUDGET_DELETE570 PASS: actor/permission,full frozen original snapshot,same-key replay after deletion/period block,stale/body conflict rollback,one ledger,no repeated deletion';
END $budget_delete570_verify$;
ROLLBACK;


BEGIN;
DO $budget_resolution570_verify$
DECLARE t uuid;actor uuid;demo jsonb;center_id uuid;account_id uuid;period_id uuid;rid uuid;
 snapshot jsonb;payload jsonb;r jsonb;again jsonb;before_row jsonb;rejected boolean;k text:=gen_random_uuid()::text;k2 text:=gen_random_uuid()::text;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_LOCAL_ONLY';END IF;
 IF NOT has_function_privilege('service_role','public.resolver_edicion_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('anon','public.resolver_edicion_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.resolver_edicion_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_ACL';END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant_ready_tx('VERIFY-BUDGET-RESOLVE570',14,'PE','verify-budget-resolve570-'||gen_random_uuid());t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 IF actor IS NULL THEN SELECT id INTO actor FROM usuarios_sistema WHERE tenant_id=t AND activo LIMIT 1;END IF;
 INSERT INTO centros_costo(tenant_id,codigo,nombre,estado,activo) VALUES(t,'BR570','Centro resolución verifier','ACTIVO',true) RETURNING id INTO center_id;
 INSERT INTO plan_cuentas(tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES(t,'6391573','Cuenta resolución verifier','GASTO','GASTO',7,true,true,'ACTIVO') RETURNING id INTO account_id;
 INSERT INTO periodos_contables(tenant_id,anio,mes,codigo,nombre,estado) VALUES(t,2028,12,'2028-12','Período resolución verifier','ABIERTO') RETURNING id INTO period_id;
 r:=public.crear_presupuesto_tx_570(t,actor,jsonb_build_object('centro_costo_id',center_id,'cuenta_id',account_id,'periodo_contable_id',period_id,'monto_presupuestado',3.17,'notas','Original','estado','ACTIVO'),gen_random_uuid()::text);rid:=(r->>'id')::uuid;snapshot:=r->'record';
 payload:=jsonb_build_object('monto_presupuestado',3.29,'notas','Editar','estado','ACTIVO','expected_snapshot',snapshot);
 before_row:=snapshot;
 rejected:=false;BEGIN PERFORM public.resolver_edicion_presupuesto_tx_570(t,gen_random_uuid(),rid,payload,k);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_ACTOR_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_edicion_presupuesto_tx_570(t,actor,rid,payload||jsonb_build_object('expected_snapshot',snapshot||jsonb_build_object('tenant_id',gen_random_uuid())),k);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_SCOPE_ALLOWED';END IF;
 -- An absent operation is fenced atomically even if this snapshot would permit an edit.
 r:=public.resolver_edicion_presupuesto_tx_570(t,actor,rid,payload,k);
 IF r->>'success'<>'true' OR r->>'action'<>'ABANDON_UPDATE' OR r->'payload' IS DISTINCT FROM payload OR r->>'id'<>rid::text OR r->>'actor_id'<>actor::text OR r->>'tenant_id'<>t::text OR r->>'idempotency_key'<>k OR (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_ABANDON_RECEIPT';END IF;
 IF (SELECT to_jsonb(p) FROM presupuestos p WHERE id=rid) IS DISTINCT FROM before_row OR (SELECT result FROM financial_master_operations WHERE id=(r->>'operation_id')::uuid) IS DISTINCT FROM r THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_ABANDON_CHANGED_BUDGET';END IF;
 again:=public.resolver_edicion_presupuesto_tx_570(t,actor,rid,payload,k);IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR NOT (again->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_ABANDON_REPLAY';END IF;
 rejected:=false;BEGIN PERFORM public.actualizar_presupuesto_tx_570(t,actor,rid,payload,k);EXCEPTION WHEN serialization_failure THEN rejected:=SQLERRM='BUDGET_UPDATE570_ABANDONED';END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_LATE_UPDATE_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_edicion_presupuesto_tx_570(t,actor,rid,payload||jsonb_build_object('notas','Otra edición'),k);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_KEY_REPLACED';END IF;
 -- A different explicit key and fresh snapshot can be used; its commit always wins subsequent resolution.
 r:=public.actualizar_presupuesto_tx_570(t,actor,rid,payload,k2);
 again:=public.resolver_edicion_presupuesto_tx_570(t,actor,rid,payload,k2);
 IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR again->>'action'<>'UPDATE' OR NOT (again->>'idempotent')::boolean THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_COMMIT_REPLAY';END IF;
 DELETE FROM presupuestos WHERE tenant_id=t AND id=rid;
 again:=public.resolver_edicion_presupuesto_tx_570(t,actor,rid,payload,k2);IF again-'idempotent' IS DISTINCT FROM r-'idempotent' THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_RECEIPT_REBUILT';END IF;
 IF (SELECT count(*) FROM financial_master_operations WHERE tenant_id=t AND operation_type='BUDGET_UPDATE')<>2 THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_DUPLICATE';END IF;
 RAISE NOTICE 'BUDGET_RESOLVE570 PASS: scope/permission, durable atomic fence, late update denied, full abandonment replay, existing commit preserved after deletion, no replacement';
END $budget_resolution570_verify$;
ROLLBACK;


BEGIN;
CREATE FUNCTION pg_temp.fail_calculation_ledger_570() RETURNS trigger LANGUAGE plpgsql AS $fault$
BEGIN IF NEW.request->>'verify_fail'='true' OR NEW.request->'empleados'->0->>'bonos_adicionales'='1570' THEN RAISE EXCEPTION 'VERIFY_CALCULATION570_LEDGER_FAIL';END IF;RETURN NEW;END $fault$;
CREATE TRIGGER verify_calculation_ledger_fail_570 BEFORE INSERT ON app.rrhh_calculation_operations_570
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_calculation_ledger_570();
DO $verify_calculation570$
DECLARE demo jsonb;t uuid;actor uuid;emp uuid;p uuid;p2 uuid;p3 uuid;key uuid:=gen_random_uuid();abandon_key uuid:=gen_random_uuid();
 req jsonb;rows jsonb;r jsonb;again jsonb;bad jsonb;before_outbox bigint;cid uuid;rejected boolean;approver uuid:=gen_random_uuid();role_id uuid;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'CALCULATION570_VERIFY_LOCAL_ONLY';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='app.rrhh_calculation_operations_570'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='postgres'::regrole)
  OR has_table_privilege('service_role','app.rrhh_calculation_operations_570','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','app.rrhh_calculation_operations_570','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon','app.rrhh_calculation_operations_570','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'CALCULATION570_TABLE_ACL';END IF;
 FOREACH bad IN ARRAY ARRAY[to_jsonb('public.leer_recibo_calculo_planilla_570(uuid,uuid,uuid,uuid,jsonb)'::text),to_jsonb('public.guardar_calculo_planilla_operacion_tx_570(uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb)'::text),to_jsonb('public.resolver_calculo_planilla_tx_570(uuid,uuid,uuid,uuid,jsonb)'::text)] LOOP
  IF NOT has_function_privilege('service_role',bad#>>'{}','EXECUTE') OR has_function_privilege('anon',bad#>>'{}','EXECUTE') OR has_function_privilege('authenticated',bad#>>'{}','EXECUTE') THEN RAISE EXCEPTION 'CALCULATION570_RPC_ACL';END IF;
 END LOOP;
 UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant('VERIFY CALCULATION570',1,'PE');t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 INSERT INTO empleados(tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
 VALUES(t,'Calc Verify','Calc','Verify','CALC-570','DNI','57575701','activo',true,'2026-01-01','PE') RETURNING id INTO emp;
 SELECT id INTO cid FROM conceptos_planilla WHERE tenant_id=t AND codigo='001' AND activo;
 req:=jsonb_build_object('empleados',jsonb_build_array(jsonb_build_object('empleado_id',emp,'dias_trabajados',21,'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,'bonos_adicionales',0)));
 rows:=jsonb_build_array(jsonb_build_object('empleado_id',emp,'dias_trabajados',21,'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,
  'total_ingresos',1200,'total_descuentos',0,'total_aportes',0,'neto_pagar',1200,'conceptos',jsonb_build_array(jsonb_build_object('concepto_id',cid,'monto',1200))));
 r:=public.crear_planilla_tx_495(t,jsonb_build_object('periodo','2028-05','pais_codigo','PE','moneda','PEN'),actor,gen_random_uuid()::text);p:=(r->>'id')::uuid;
 r:=public.crear_planilla_tx_495(t,jsonb_build_object('periodo','2028-06','pais_codigo','PE','moneda','PEN'),actor,gen_random_uuid()::text);p2:=(r->>'id')::uuid;
 r:=public.crear_planilla_tx_495(t,jsonb_build_object('periodo','2028-07','pais_codigo','PE','moneda','PEN'),actor,gen_random_uuid()::text);p3:=(r->>'id')::uuid;
 IF public.leer_recibo_calculo_planilla_570(t,actor,p,key,req) IS NOT NULL OR EXISTS(SELECT 1 FROM app.rrhh_calculation_operations_570 WHERE tenant_id=t) THEN RAISE EXCEPTION 'CALCULATION570_LOOKUP_WRITES';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,gen_random_uuid(),p,key,req,rows,'ORDINARY');EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_ACTOR';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,key,req,jsonb_set(rows,'{0,total_ingresos}','null'),'ORDINARY');EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_UNKNOWN_MONEY';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,key,req,jsonb_set(rows,'{0,dias_trabajados}','30'),'ORDINARY');EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_ORIGINAL_INPUT_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,key,req,jsonb_set(rows,'{0,empleado_id}',to_jsonb(gen_random_uuid())),'ORDINARY');EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_EMPLOYEE_SCOPE';END IF;
 r:=public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,key,req,rows,'ORDINARY');
 IF r->>'success'<>'true' OR r->>'planillaId'<>p::text OR r->'calculation_operation'->>'action'<>'CALCULATE'
  OR r->'calculation_operation'->'request' IS DISTINCT FROM req OR r->'calculation_operation'->'calculated_employees' IS DISTINCT FROM rows
  OR r->'calculation_operation'->>'idempotency_key'<>key::text OR r->'calculation_operation'->>'actor_id'<>actor::text
  OR (SELECT result FROM app.rrhh_calculation_operations_570 WHERE tenant_id=t AND idempotency_key=key) IS DISTINCT FROM r THEN RAISE EXCEPTION 'CALCULATION570_FROZEN_RECEIPT';END IF;
 SELECT id INTO role_id FROM roles WHERE tenant_id=t AND upper(nombre)='ADMIN_DEMO';
 INSERT INTO usuarios_sistema(id,tenant_id,email,nombre,apellido,nombres,apellidos,activo,estado,is_super_admin)
 VALUES(approver,t,'calc-approve-'||t||'@example.test','Calc','Approver','Calc','Approver',true,'ACTIVO',false);
 INSERT INTO user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(approver,role_id,t);
 PERFORM public.aprobar_planilla_tx(t,p,approver::text);
 UPDATE empleados SET nombres='Changed after calculation' WHERE id=emp;
 again:=public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,key,req,'null','INVALID','null');
 IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR NOT(again->>'idempotent')::boolean THEN RAISE EXCEPTION 'CALCULATION570_REPLAY_REBUILT';END IF;
 again:=public.resolver_calculo_planilla_tx_570(t,actor,p,key,req);IF again-'idempotent' IS DISTINCT FROM r-'idempotent' THEN RAISE EXCEPTION 'CALCULATION570_RESOLUTION_REBUILT';END IF;
 rejected:=false;BEGIN PERFORM public.leer_recibo_calculo_planilla_570(t,actor,p,key,jsonb_set(req,'{empleados,0,dias_trabajados}','30'));EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_CHANGED_BODY';END IF;
 rejected:=false;BEGIN PERFORM public.leer_recibo_calculo_planilla_570(t,approver,p,key,req);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_CHANGED_ACTOR';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,gen_random_uuid(),req,rows,'ORDINARY');EXCEPTION WHEN check_violation THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_NEW_KEY_CLAIMED_OLD';END IF;
 r:=public.resolver_calculo_planilla_tx_570(t,actor,p2,abandon_key,req);
 IF r->'calculation_operation'->>'action'<>'ABANDON_CALCULATION' OR (SELECT lower(estado::text) FROM planillas WHERE id=p2)<>'borrador' OR EXISTS(SELECT 1 FROM empleado_planilla WHERE planilla_id=p2) THEN RAISE EXCEPTION 'CALCULATION570_ABANDON_CALCULATED';END IF;
 again:=public.resolver_calculo_planilla_tx_570(t,actor,p2,abandon_key,req);IF again-'idempotent' IS DISTINCT FROM r-'idempotent' THEN RAISE EXCEPTION 'CALCULATION570_ABANDON_REPLAY';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p2,abandon_key,req,rows,'ORDINARY');EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'CALCULATION570_LATE_WRITE';END IF;
 before_outbox:=(SELECT count(*) FROM outbox_events WHERE tenant_id=t);
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p3,gen_random_uuid(),jsonb_set(req,'{empleados,0,bonos_adicionales}','1570'),rows,'ORDINARY');EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='VERIFY_CALCULATION570_LEDGER_FAIL';END;
 IF NOT rejected OR (SELECT lower(estado::text) FROM planillas WHERE id=p3)<>'borrador' OR EXISTS(SELECT 1 FROM empleado_planilla WHERE planilla_id=p3)
  OR EXISTS(SELECT 1 FROM app.rrhh_calculation_operations_570 WHERE planilla_id=p3) OR (SELECT count(*) FROM outbox_events WHERE tenant_id=t)<>before_outbox THEN RAISE EXCEPTION 'CALCULATION570_ATOMIC_ROLLBACK';END IF;
 -- Gratification dispatch preserves its actual declared source snapshot.
 rows:=jsonb_set(rows,'{0,metadata}',jsonb_build_object('base_gratificacion_ordinaria',jsonb_build_object('periodo','2028-06','monto',1200,'fuente','FUENTE_EXTERNA_DECLARADA','declarado_por',actor,'referencia','VERIFY-CALC-GRAT')));
 req:=jsonb_set(req,'{empleados,0,remuneracion_gratificacion_previa}',rows->0->'metadata'->'base_gratificacion_ordinaria');
 r:=public.guardar_calculo_planilla_operacion_tx_570(t,actor,p3,gen_random_uuid(),req,rows,'GRATIFICATION');
 IF r->'calculation_operation'->>'rpc_kind'<>'GRATIFICATION' OR (SELECT metadata->'base_gratificacion_ordinaria' FROM empleado_planilla WHERE planilla_id=p3) IS DISTINCT FROM rows->0->'metadata'->'base_gratificacion_ordinaria' THEN RAISE EXCEPTION 'CALCULATION570_GRAT_SOURCE';END IF;
 IF (SELECT count(*) FROM app.rrhh_calculation_operations_570 WHERE tenant_id=t)<>3 OR (SELECT count(*) FROM empleado_planilla WHERE tenant_id=t AND planilla_id IN(p,p2,p3))<>2 THEN RAISE EXCEPTION 'CALCULATION570_DUPLICATES';END IF;
 RAISE NOTICE 'CALCULATION570 PASS: private ledger, permission, original body/UUID/actor, atomic ordinary/gratification snapshot, replay after approval/source change, conflict, abandonment fence, late write denied, full rollback';
END $verify_calculation570$;
ROLLBACK;


BEGIN;
DO $$
DECLARE
  v_demo jsonb;v_other jsonb;v_tenant uuid;v_actor uuid;v_foreign uuid;v_approver uuid:=gen_random_uuid();
  v_denied uuid:=gen_random_uuid();v_admin_role uuid;v_emp uuid;v_c201 uuid;v_c001 uuid;
  v_planilla uuid;v_duplicate uuid;v_fail uuid;v_eps jsonb;v_rows jsonb;v_bad jsonb;v_result jsonb;
  v_carry_rows jsonb;v_carry_snapshot jsonb;
  v_period text:=to_char(clock_timestamp() AT TIME ZONE 'America/Lima','YYYY-MM');v_message text;v_key uuid:=gen_random_uuid();v_request jsonb;v_receipt jsonb;v_replay jsonb;
  v_duplicate_period text:=to_char((clock_timestamp() AT TIME ZONE 'America/Lima')-interval '2 months','YYYY-MM');
  v_fail_period text:=to_char((clock_timestamp() AT TIME ZONE 'America/Lima')-interval '1 month','YYYY-MM');
BEGIN
  UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',
    allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  v_demo:=public.create_demo_tenant('VERIFY EPS570',1,'PE');
  v_other:=public.create_demo_tenant('VERIFY EPS570 OTHER',1,'PE');
  v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;v_foreign:=(v_other->>'user_id')::uuid;
  SELECT id INTO v_admin_role FROM public.roles WHERE tenant_id=v_tenant AND upper(nombre)='ADMIN_DEMO';
  INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,apellido,nombres,apellidos,activo,estado,is_super_admin)
  VALUES(v_approver,v_tenant,'eps-approve-'||v_tenant||'@example.test','EPS','Approver','EPS','Approver',true,'ACTIVO',false),
        (v_denied,v_tenant,'eps-denied-'||v_tenant||'@example.test','EPS','Denied','EPS','Denied',true,'ACTIVO',false);
  INSERT INTO public.user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(v_approver,v_admin_role,v_tenant);
  SELECT id INTO v_emp FROM public.empleados WHERE tenant_id=v_tenant AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  IF v_emp IS NULL THEN
    INSERT INTO public.empleados(tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
    VALUES(v_tenant,'EPS Verify','EPS','Verify','EPS-570','DNI','57057057','activo',true,'2026-01-01','PE') RETURNING id INTO v_emp;
  END IF;
  SELECT id INTO v_c201 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='201' AND activo;
  SELECT id INTO v_c001 FROM public.conceptos_planilla WHERE tenant_id=v_tenant AND codigo='001' AND activo;
  IF v_c201 IS NULL OR v_c001 IS NULL THEN RAISE EXCEPTION 'EPS fixture concepts missing'; END IF;
  INSERT INTO public.rrhh_peru_fichas_laborales(tenant_id,empleado_id,regimen_salud_codigo,eps_servicios_propios_codigo)
    VALUES(v_tenant,v_emp,'01','3') ON CONFLICT(tenant_id,empleado_id)
    DO UPDATE SET regimen_salud_codigo='01',eps_servicios_propios_codigo='3',activo=true;
  v_eps:=jsonb_build_object('periodo_aplicacion',v_period,'periodo_cobertura',v_period,
    'fuente','FUENTE_EXTERNA_DECLARADA','declarado_por',v_actor,'monto_pagado',100,
    'fecha_pago',v_period||'-01','referencia','VERIFY-EPS-570-PAID','pago_oportuno',true,
    'aporte_essalud_origen',108,'trabajadores_cubiertos_origen',1,'uit_origen',5500,
    'limite_25_por_ciento',27,'limite_10_uit',550,'credito_generado',27,'credito_arrastre_declarado',0,
    'referencia_arrastre',NULL,'credito_aplicado',27,'credito_saldo',0,'aporte_essalud_bruto',108,'aporte_essalud_neto',81);
  v_rows:=jsonb_build_array(jsonb_build_object('empleado_id',v_emp,'dias_trabajados',30,
    'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,
    'total_ingresos',1200,'total_descuentos',156,'total_aportes',81,'neto_pagar',1044,
    'conceptos',jsonb_build_array(jsonb_build_object('concepto_id',v_c201,'monto',81,'observaciones','EsSalud bruto108;EPS27;neto81'),
       jsonb_build_object('concepto_id',v_c001,'monto',1200)),
    'metadata',jsonb_build_object('eps_cobertura_snapshot',v_eps,'essalud',jsonb_build_object('bruto',108,'credito_eps',27,'neto',81))));
  v_result:=public.crear_planilla_tx_495(v_tenant,jsonb_build_object('periodo',v_period,'pais_codigo','PE','moneda','PEN'),v_actor,'verify-eps570');
  v_planilla:=(v_result->>'id')::uuid;

  v_request:=jsonb_build_object('empleados',jsonb_build_array(jsonb_build_object('empleado_id',v_emp,'dias_trabajados',30,'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,'bonos_adicionales',0)),
   'eps_cobertura',jsonb_build_object('periodo_cobertura',v_period,'monto_pagado',100,'fecha_pago',v_period||'-01','referencia','VERIFY-EPS-570-PAID','pago_oportuno',true));
  v_receipt:=public.guardar_calculo_planilla_operacion_tx_570(v_tenant,v_actor,v_planilla,v_key,v_request,v_rows,'EPS',v_eps);
  IF v_receipt->'calculation_operation'->>'rpc_kind'<>'EPS' OR v_receipt->'calculation_operation'->'eps_snapshot' IS DISTINCT FROM v_eps
   OR v_receipt->'calculation_operation'->'request' IS DISTINCT FROM v_request OR (v_receipt->>'totalAportes')::numeric<>81 THEN RAISE EXCEPTION 'CALCULATION570_EPS_FROZEN_SOURCE';END IF;
  PERFORM public.aprobar_planilla_tx(v_tenant,v_planilla,v_approver::text);
  UPDATE rrhh_peru_fichas_laborales SET activo=false WHERE tenant_id=v_tenant AND empleado_id=v_emp;
  v_replay:=public.guardar_calculo_planilla_operacion_tx_570(v_tenant,v_actor,v_planilla,v_key,v_request,'null','EPS',NULL);
  IF v_replay-'idempotent' IS DISTINCT FROM v_receipt-'idempotent' OR NOT(v_replay->>'idempotent')::boolean THEN RAISE EXCEPTION 'CALCULATION570_EPS_REPLAY_REBUILT';END IF;
  v_replay:=public.resolver_calculo_planilla_tx_570(v_tenant,v_actor,v_planilla,v_key,v_request);
  IF v_replay-'idempotent' IS DISTINCT FROM v_receipt-'idempotent' OR (SELECT count(*) FROM app.rrhh_calculation_operations_570 WHERE tenant_id=v_tenant)<>1
   OR (SELECT count(*) FROM empleado_planilla WHERE planilla_id=v_planilla)<>1 THEN RAISE EXCEPTION 'CALCULATION570_EPS_DUPLICATED';END IF;
  RAISE NOTICE 'CALCULATION570 EPS PASS: original source/UUID and computed credit81 frozen atomically, replay and resolution after approval and source deactivation, no second calculation';
END $$;
ROLLBACK;


BEGIN;
CREATE FUNCTION pg_temp.fail_payroll_creation_ledger_570() RETURNS trigger LANGUAGE plpgsql AS $fault$
BEGIN IF NEW.request->>'observaciones'='VERIFY-PAYROLL-CREATION570-FAIL' THEN RAISE EXCEPTION 'VERIFY_PAYROLL_CREATION570_LEDGER_FAIL';END IF;RETURN NEW;END $fault$;
CREATE TRIGGER verify_payroll_creation_ledger_fail_570 BEFORE INSERT ON app.rrhh_payroll_creation_operations_570
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_payroll_creation_ledger_570();
DO $verify_payroll_creation570$
DECLARE demo jsonb;t uuid;actor uuid;approver uuid:=gen_random_uuid();v_role uuid;emp uuid;cid uuid;
 key uuid:=gen_random_uuid();child uuid:=gen_random_uuid();key2 uuid:=gen_random_uuid();child2 uuid:=gen_random_uuid();key3 uuid:=gen_random_uuid();child3 uuid:=gen_random_uuid();
 req jsonb;req2 jsonb;req3 jsonb;normalized jsonb;normalized2 jsonb;normalized3 jsonb;rows jsonb;r jsonb;r3 jsonb;again jsonb;calculated jsonb;
 p uuid;p_other uuid;p3 uuid;rejected boolean;before_outbox bigint;failed_key uuid:=gen_random_uuid();failed_child uuid:=gen_random_uuid();bad jsonb;signature text;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'PAYROLL_CREATION570_VERIFY_LOCAL_ONLY';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='app.rrhh_payroll_creation_operations_570'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='postgres'::regrole)
  OR has_table_privilege('service_role','app.rrhh_payroll_creation_operations_570','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','app.rrhh_payroll_creation_operations_570','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon','app.rrhh_payroll_creation_operations_570','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'PAYROLL_CREATION570_PRIVATE_ACL';END IF;
 FOREACH signature IN ARRAY ARRAY['public.leer_recibo_alta_planilla_570(uuid,uuid,uuid,jsonb)','public.crear_planilla_operacion_tx_570(uuid,uuid,uuid,jsonb,jsonb)','public.resolver_alta_planilla_tx_570(uuid,uuid,uuid,jsonb)'] LOOP
  IF NOT has_function_privilege('service_role',signature,'EXECUTE') OR has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') THEN RAISE EXCEPTION 'PAYROLL_CREATION570_RPC_ACL';END IF;
 END LOOP;
 UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant('VERIFY PAYROLL CREATION570',1,'PE');t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 INSERT INTO empleados(tenant_id,nombre,nombres,apellidos,codigo,tipo_documento,numero_documento,estado,activo,fecha_ingreso,pais)
 VALUES(t,'Create Verify','Create','Verify','CREATE-570','DNI','57575703','activo',true,'2026-01-01','PE') RETURNING id INTO emp;
 SELECT id INTO cid FROM conceptos_planilla WHERE tenant_id=t AND codigo='001' AND activo;
 req:=jsonb_build_object('periodo','2030-10','pais_codigo','PE','moneda','PEN','observaciones',chr(9)||chr(160)||chr(65279)||'Original whole request'||chr(8239)||chr(13),
  'idempotency_key',key,'calculo_idempotency_key',child,'calculo_original',jsonb_build_object('empleados',jsonb_build_array(jsonb_build_object('empleado_id',emp,'dias_trabajados',21,'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,'bonos_adicionales',0))));
 normalized:=jsonb_build_object('periodo','2030-10','pais_codigo','PE','moneda','PEN','metadata',jsonb_build_object('observaciones','Original whole request'));
 req2:=req||jsonb_build_object('periodo','2030-11','idempotency_key',key2,'calculo_idempotency_key',child2);normalized2:=normalized||jsonb_build_object('periodo','2030-11');
 req3:=req||jsonb_build_object('periodo','2030-12','idempotency_key',key3,'calculo_idempotency_key',child3);normalized3:=normalized||jsonb_build_object('periodo','2030-12');
 rows:=jsonb_build_array(jsonb_build_object('empleado_id',emp,'dias_trabajados',21,'horas_extras_25',0,'horas_extras_35',0,'tardanzas_minutos',0,'faltas',0,
  'total_ingresos',1200,'total_descuentos',0,'total_aportes',0,'neto_pagar',1200,'conceptos',jsonb_build_array(jsonb_build_object('concepto_id',cid,'monto',1200))));
 IF public.leer_recibo_alta_planilla_570(t,actor,key,req) IS NOT NULL OR EXISTS(SELECT 1 FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=t) THEN RAISE EXCEPTION 'PAYROLL_CREATION570_LOOKUP_WRITES';END IF;
 rejected:=false;BEGIN PERFORM public.crear_planilla_operacion_tx_570(t,gen_random_uuid(),key,req,normalized);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_FOREIGN_ACTOR';END IF;
 rejected:=false;BEGIN PERFORM public.crear_planilla_operacion_tx_570(t,actor,key,req,normalized||jsonb_build_object('moneda','USD'));EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_NORMALIZED_INPUT';END IF;
 r:=public.crear_planilla_operacion_tx_570(t,actor,key,req,normalized);p:=(r->>'id')::uuid;
 IF r->>'success'<>'true' OR r->>'estado'<>'borrador' OR r->'creation_operation'->>'action'<>'CREATE_WITH_CALCULATION'
  OR r->'creation_operation'->'request' IS DISTINCT FROM req OR r->'creation_operation'->'normalized_planilla' IS DISTINCT FROM normalized
  OR r->'creation_operation'->>'calculation_key'<>child::text OR r->'creation_operation'->>'actor_id'<>actor::text
  OR (SELECT result FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=t AND idempotency_key=key) IS DISTINCT FROM r
  OR EXISTS(SELECT 1 FROM empleado_planilla WHERE planilla_id=p) OR EXISTS(SELECT 1 FROM app.rrhh_calculation_operations_570 WHERE tenant_id=t) THEN RAISE EXCEPTION 'PAYROLL_CREATION570_RECEIPT_OR_AUTO_CALCULATION';END IF;
 again:=public.resolver_alta_planilla_tx_570(t,actor,key,req);IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR NOT(again->>'idempotent')::boolean THEN RAISE EXCEPTION 'PAYROLL_CREATION570_RESOLVE_REBUILT';END IF;
 rejected:=false;BEGIN PERFORM public.leer_recibo_alta_planilla_570(t,actor,key,jsonb_set(req,'{calculo_original,empleados,0,dias_trabajados}','30'));EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_CHANGED_WHOLE_BODY';END IF;
 rejected:=false;BEGIN PERFORM public.leer_recibo_alta_planilla_570(t,actor,key2,req2||jsonb_build_object('calculo_idempotency_key',child));EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_REUSED_CHILD_KEY';END IF;
 again:=public.crear_planilla_tx_495(t,jsonb_build_object('periodo','2030-08','pais_codigo','PE','moneda','PEN'),actor,gen_random_uuid()::text);p_other:=(again->>'id')::uuid;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p_other,child,req->'calculo_original',rows,'ORDINARY');EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_CHILD_OTHER_PAYROLL';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,child,jsonb_set(req->'calculo_original','{empleados,0,dias_trabajados}','30'),rows,'ORDINARY');EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_CHILD_OTHER_BODY';END IF;
 SELECT id INTO v_role FROM roles WHERE tenant_id=t AND upper(nombre)='ADMIN_DEMO';
 INSERT INTO usuarios_sistema(id,tenant_id,email,nombre,apellido,nombres,apellidos,activo,estado,is_super_admin)
 VALUES(approver,t,'create-approve-'||t||'@example.test','Create','Approver','Create','Approver',true,'ACTIVO',false);
 INSERT INTO user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(approver,v_role,t);
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,approver,p,child,req->'calculo_original',rows,'ORDINARY');EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_CHILD_OTHER_ACTOR';END IF;
 calculated:=public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,child,req->'calculo_original',rows,'ORDINARY');
 IF calculated->'calculation_operation'->'request' IS DISTINCT FROM req->'calculo_original' OR (SELECT count(*) FROM empleado_planilla WHERE planilla_id=p)<>1 THEN RAISE EXCEPTION 'PAYROLL_CREATION570_BOUND_CHILD';END IF;
 PERFORM public.aprobar_planilla_tx(t,p,approver::text);
 UPDATE empleados SET nombres='Changed after bound calculation' WHERE id=emp;
 again:=public.crear_planilla_operacion_tx_570(t,actor,key,req,'null');IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR again->>'estado'<>'borrador' THEN RAISE EXCEPTION 'PAYROLL_CREATION570_ORIGINAL_REPLAY_AFTER_APPROVAL';END IF;
 again:=public.guardar_calculo_planilla_operacion_tx_570(t,actor,p,child,req->'calculo_original','null','INVALID',NULL);IF again-'idempotent' IS DISTINCT FROM calculated-'idempotent' THEN RAISE EXCEPTION 'PAYROLL_CREATION570_CHILD_REPLAY_REBUILT';END IF;
 again:=public.resolver_alta_planilla_tx_570(t,actor,key2,req2);IF again->'creation_operation'->>'action'<>'ABANDON_CREATION' OR EXISTS(SELECT 1 FROM planillas WHERE tenant_id=t AND periodo='2030-11') THEN RAISE EXCEPTION 'PAYROLL_CREATION570_ABANDON_CREATED_HEADER';END IF;
 rejected:=false;BEGIN PERFORM public.crear_planilla_operacion_tx_570(t,actor,key2,req2,normalized2);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_LATE_PARENT_ALLOWED';END IF;
 rejected:=false;BEGIN PERFORM public.crear_planilla_tx_495(t,normalized2,actor,key2::text);EXCEPTION WHEN serialization_failure THEN rejected:=SQLERRM='PAYROLL_CREATION570_ABANDONED';END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_LEGACY_LATE_BYPASS';END IF;
 rejected:=false;BEGIN PERFORM public.guardar_calculo_planilla_operacion_tx_570(t,actor,p_other,child2,req2->'calculo_original',rows,'ORDINARY');EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_ABANDONED_PARENT_CHILD_ALLOWED';END IF;
 before_outbox:=(SELECT count(*) FROM outbox_events WHERE tenant_id=t);
 bad:=req||jsonb_build_object('periodo','2030-09','idempotency_key',failed_key,'calculo_idempotency_key',failed_child,'observaciones','VERIFY-PAYROLL-CREATION570-FAIL');
 rejected:=false;BEGIN PERFORM public.crear_planilla_operacion_tx_570(t,actor,failed_key,bad,jsonb_build_object('periodo','2030-09','pais_codigo','PE','moneda','PEN','metadata',jsonb_build_object('observaciones','VERIFY-PAYROLL-CREATION570-FAIL')));EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='VERIFY_PAYROLL_CREATION570_LEDGER_FAIL';END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM planillas WHERE tenant_id=t AND periodo='2030-09') OR EXISTS(SELECT 1 FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=t AND idempotency_key=failed_key)
  OR EXISTS(SELECT 1 FROM rrhh_planilla_operaciones_495 WHERE tenant_id=t AND tipo='CREAR' AND idempotency_key=failed_key::text) OR (SELECT count(*) FROM outbox_events WHERE tenant_id=t)<>before_outbox THEN RAISE EXCEPTION 'PAYROLL_CREATION570_ATOMIC_ROLLBACK';END IF;
 r3:=public.crear_planilla_operacion_tx_570(t,actor,key3,req3,normalized3);p3:=(r3->>'id')::uuid;
 PERFORM public.eliminar_planilla_borrador_tx_495(t,p3,actor,gen_random_uuid()::text);
 again:=public.resolver_calculo_planilla_tx_570(t,actor,p3,child3,req3->'calculo_original');
 IF again->'calculation_operation'->>'action'<>'ABANDON_CALCULATION' OR EXISTS(SELECT 1 FROM planillas WHERE id=p3) THEN RAISE EXCEPTION 'PAYROLL_CREATION570_DELETED_PARENT_CHILD_FENCE';END IF;
 again:=public.resolver_alta_planilla_tx_570(t,actor,key3,req3);IF again-'idempotent' IS DISTINCT FROM r3-'idempotent' OR again->>'id'<>p3::text THEN RAISE EXCEPTION 'PAYROLL_CREATION570_DELETED_PARENT_RECEIPT_REBUILT';END IF;
 IF (SELECT count(*) FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=t)<>3 OR (SELECT count(*) FROM app.rrhh_calculation_operations_570 WHERE tenant_id=t)<>2 THEN RAISE EXCEPTION 'PAYROLL_CREATION570_DUPLICATED_EFFECTS';END IF;
 -- A current calculate permission is required even to recover the original whole intention.
 UPDATE rol_permisos rp SET concedido=false FROM permisos perm WHERE perm.id=rp.permiso_id AND perm.tenant_id=t AND lower(perm.codigo)='rrhh.planillas.calculate' AND rp.role_id=v_role;
 rejected:=false;BEGIN PERFORM public.leer_recibo_alta_planilla_570(t,actor,key,req);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_MISSING_CALCULATE_PERMISSION';END IF;
 RAISE NOTICE 'PAYROLL_CREATION570 PASS: private ledger,whole parent+child UUID/body,one header without automatic calculation,scope/child conflicts,frozen replay after approval/source change,abandonment denies legacy latePOST and reserved child,atomic rollback,deleted draft child fence,create+calculate permission';
END $verify_payroll_creation570$;
ROLLBACK;

BEGIN;
CREATE FUNCTION pg_temp.fail_inventory_abandonment_570() RETURNS trigger LANGUAGE plpgsql AS $fault$
BEGIN IF NEW.request_payload->>'motivo'='VERIFY-FENCE570-FAIL' THEN RAISE EXCEPTION 'VERIFY_FENCE570_FAIL';END IF;RETURN NEW;END $fault$;
CREATE TRIGGER verify_inventory_abandonment_fail_570 BEFORE INSERT ON app.inventory_operation_abandonments_570
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_inventory_abandonment_570();
DO $verify_inventory_abandonment570$
DECLARE demo jsonb;t uuid;actor uuid;other_actor uuid:=gen_random_uuid();role_id uuid;origin uuid;dest uuid;product uuid;
 p jsonb;q jsonb;absent_p jsonb;absent_q jsonb;canonical jsonb;r jsonb;again jsonb;written jsonb;stored jsonb;
 k text:='verify-adjust-'||gen_random_uuid();kt text:='verify-transfer-'||gen_random_uuid();ka text:='verify-abandon-adjust-'||gen_random_uuid();kat text:='verify-abandon-transfer-'||gen_random_uuid();
 rejected boolean;before_data jsonb;after_data jsonb;sig text;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'INVENTORY_FENCE570_VERIFY_LOCAL_ONLY';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='app.inventory_operation_abandonments_570'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='postgres'::regrole)
  OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='app' AND tablename='inventory_operation_abandonments_570') THEN RAISE EXCEPTION 'INVENTORY_FENCE570_PRIVATE_RLS';END IF;
 FOREACH sig IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(sig,'app.inventory_operation_abandonments_570','SELECT,INSERT,UPDATE,DELETE')
   OR has_function_privilege(sig,'app.inventory_operation_request_570(text,jsonb)','EXECUTE')
   OR has_function_privilege(sig,'app.guard_inventory_operation_key_570(uuid,uuid,text,text,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'INVENTORY_FENCE570_PRIVATE_ACL';END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role','public.resolver_operacion_inventario_tx_570(uuid,uuid,text,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.resolver_operacion_inventario_tx_570(uuid,uuid,text,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.resolver_operacion_inventario_tx_570(uuid,uuid,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'INVENTORY_FENCE570_RPC_ACL';END IF;
 UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true WHERE singleton;
 demo:=public.create_demo_tenant('VERIFY INVENTORY FENCE570',1,'PE');t:=(demo->>'tenant_id')::uuid;actor:=(demo->>'user_id')::uuid;
 INSERT INTO almacenes(tenant_id,codigo,nombre,estado,activo,es_principal,pais,sucursal_id)
 VALUES(t,'FENCE-ORIGIN','Fence origin','ACTIVO',true,true,'PE',app.casa_matriz_de(t)) RETURNING id INTO origin;
 INSERT INTO almacenes(tenant_id,codigo,nombre,estado,activo,es_principal,pais,sucursal_id)
 SELECT t,'FENCE-DEST','Fence destination','ACTIVO',true,false,'PE',sucursal_id FROM almacenes WHERE id=origin RETURNING id INTO dest;
 SELECT (public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','FENCE570','nombre','Fence570 decimal','categoria','VERIFICACION',
  'precio_venta',3,'precio_compra',2,'costo',2,'afectacion_igv','10','es_servicio',false,'controla_stock',true),origin,10.5,0,'[]')->>'id')::uuid INTO product;
 SELECT id INTO role_id FROM roles WHERE tenant_id=t AND upper(nombre)='ADMIN_DEMO';
 INSERT INTO usuarios_sistema(id,tenant_id,email,nombre,apellido,nombres,apellidos,activo,estado,is_super_admin)
 VALUES(other_actor,t,'fence-other-'||t||'@example.test','Other','Actor','Other','Actor',true,'ACTIVO',false);
 INSERT INTO user_roles(usuario_sistema_id,role_id,tenant_id) VALUES(other_actor,role_id,t);
 p:=jsonb_build_object('producto_id',product,'almacen_id',origin,'delta',0.2500004,'motivo','  Fence original adjustment  ');
 q:=jsonb_build_object('producto_id',product,'almacen_origen_id',origin,'almacen_destino_id',dest,'cantidad',0.1250004,'motivo','  Fence original transfer  ','lote','  original lot  ','fecha_expiracion','2030-12-31');
 written:=public.registrar_ajuste_inventario_tx(t,p,actor,k);
 SELECT resultado,metadata->'payload' INTO stored,canonical FROM operaciones_inventario WHERE tenant_id=t AND tipo='AJUSTE' AND idempotency_key=k;
 IF canonical IS DISTINCT FROM app.inventory_operation_request_570('AJUSTE',p) THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ADJUST_CANONICAL_CHANGED';END IF;
 r:=public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',k,p);
 IF r->>'resolution'<>'COMMITTED' OR (r->'receipt')-'idempotent' IS DISTINCT FROM stored-'idempotent' OR r#>>'{receipt,idempotent}'<>'true'
  OR EXISTS(SELECT 1 FROM app.inventory_operation_abandonments_570 WHERE tenant_id=t) THEN RAISE EXCEPTION 'INVENTORY_FENCE570_COMMITTED_ADJUST_REBUILT';END IF;
 written:=public.transferir_inventario_tx(t,q,actor,kt);
 SELECT resultado,metadata->'payload' INTO stored,canonical FROM operaciones_inventario WHERE tenant_id=t AND tipo='TRANSFERENCIA' AND idempotency_key=kt;
 IF canonical IS DISTINCT FROM app.inventory_operation_request_570('TRANSFERENCIA',q) THEN RAISE EXCEPTION 'INVENTORY_FENCE570_TRANSFER_CANONICAL_CHANGED';END IF;
 UPDATE productos SET activo=false WHERE id=product;UPDATE almacenes SET activo=false WHERE id IN(origin,dest);
 r:=public.resolver_operacion_inventario_tx_570(t,actor,'TRANSFERENCIA',kt,q);
 IF r->>'resolution'<>'COMMITTED' OR (r->'receipt')-'idempotent' IS DISTINCT FROM stored-'idempotent' THEN RAISE EXCEPTION 'INVENTORY_FENCE570_REPLAY_CURRENT_CATALOG';END IF;
 again:=public.transferir_inventario_tx(t,q,actor,kt);IF again-'idempotent' IS DISTINCT FROM stored-'idempotent' OR again->>'idempotent'<>'true' THEN RAISE EXCEPTION 'INVENTORY_FENCE570_LEGACY_REPLAY_CHANGED';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,other_actor,'AJUSTE',k,p);EXCEPTION WHEN serialization_failure THEN rejected:=SQLERRM='INVENTORY_RESOLUTION570_KEY_CONFLICT';END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_COMMITTED_FOREIGN_ACTOR';END IF;
 rejected:=false;BEGIN PERFORM public.registrar_ajuste_inventario_tx(t,p,other_actor,k);EXCEPTION WHEN serialization_failure THEN rejected:=SQLERRM='INVENTORY_RESOLUTION570_KEY_CONFLICT';END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_LEGACY_FOREIGN_ACTOR';END IF;
 absent_p:=p||jsonb_build_object('producto_id',gen_random_uuid(),'almacen_id',gen_random_uuid(),'delta',-0.000001,'motivo','Original absent adjustment');
 absent_q:=q||jsonb_build_object('producto_id',gen_random_uuid(),'almacen_origen_id',gen_random_uuid(),'almacen_destino_id',gen_random_uuid(),'motivo','Original absent transfer','guia_remision_id',gen_random_uuid());
 SELECT jsonb_build_object('products',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM productos x WHERE tenant_id=t),
  'existences',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM producto_existencias x WHERE tenant_id=t),
  'movements',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM movimientos_inventario x WHERE tenant_id=t),
  'operations',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM operaciones_inventario x WHERE tenant_id=t),
  'outbox',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM outbox_events x WHERE tenant_id=t)) INTO before_data;
 r:=public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE','  '||ka||'  ',absent_p);
 IF r->>'resolution'<>'ABANDONED' OR r->>'idempotent'<>'false' OR r#>>'{operation_identity,action}'<>'ABANDON_INVENTORY'
  OR r#>'{operation_identity,request_payload}' IS DISTINCT FROM app.inventory_operation_request_570('AJUSTE',absent_p)
  OR r#>>'{operation_identity,idempotency_key}'<>ka OR r#>>'{operation_identity,tenant_id}'<>t::text OR r#>>'{operation_identity,actor_id}'<>actor::text THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ABANDON_NOT_BOUND';END IF;
 again:=public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',ka,absent_p);
 IF again-'idempotent' IS DISTINCT FROM r-'idempotent' OR again->>'idempotent'<>'true' THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ABANDON_REPLAY_CHANGED';END IF;
 r:=public.resolver_operacion_inventario_tx_570(t,actor,'TRANSFERENCIA',kat,absent_q);
 IF r->>'resolution'<>'ABANDONED' OR r#>'{operation_identity,request_payload}' IS DISTINCT FROM app.inventory_operation_request_570('TRANSFERENCIA',absent_q) THEN RAISE EXCEPTION 'INVENTORY_FENCE570_TRANSFER_ABANDON_NOT_BOUND';END IF;
 FOREACH sig IN ARRAY ARRAY['public.registrar_ajuste_inventario_tx','app.registrar_ajuste_inventario_tx_455','public.transferir_inventario_tx','app.transferir_inventario_tx_455'] LOOP
  rejected:=false;BEGIN
   IF sig LIKE '%ajuste%' THEN EXECUTE 'SELECT '||sig||'($1,$2,$3,$4)' USING t,absent_p,actor,ka;
   ELSE EXECUTE 'SELECT '||sig||'($1,$2,$3,$4)' USING t,absent_q,actor,kat;END IF;
  EXCEPTION WHEN serialization_failure THEN rejected:=SQLERRM='INVENTORY_RESOLUTION570_ABANDONED';END;
  IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_LATE_WRITER_BYPASS:%',sig;END IF;
 END LOOP;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',ka,absent_p||jsonb_build_object('delta',-2));EXCEPTION WHEN serialization_failure THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_CHANGED_BODY';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,other_actor,'AJUSTE',ka,absent_p);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ABANDON_FOREIGN_ACTOR';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(gen_random_uuid(),actor,'AJUSTE',ka,absent_p);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_FOREIGN_TENANT';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',ka,p||jsonb_build_object('extra',true));EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_EXTRA_BODY_FIELD';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',ka,p||jsonb_build_object('ubicacion_id','bad'));EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_BAD_OPTIONAL_UUID';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',ka,p||jsonb_build_object('delta',0.0000004));EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ROUNDS_TO_ZERO';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'TRANSFERENCIA',kat,q||jsonb_build_object('fecha_expiracion','2030-02-31'));EXCEPTION WHEN datetime_field_overflow THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_BAD_DATE';END IF;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE','verify-fault-'||gen_random_uuid(),absent_p||jsonb_build_object('motivo','VERIFY-FENCE570-FAIL'));EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='VERIFY_FENCE570_FAIL';END;
 IF NOT rejected OR (SELECT count(*) FROM app.inventory_operation_abandonments_570 WHERE tenant_id=t)<>2 THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ATOMIC_FENCE_ROLLBACK';END IF;
 stored:=(SELECT result FROM app.inventory_operation_abandonments_570 WHERE tenant_id=t AND type='AJUSTE' AND idempotency_key=ka);
 UPDATE app.inventory_operation_abandonments_570 SET result=jsonb_set(result,'{operation_identity,actor_id}',to_jsonb(other_actor)) WHERE tenant_id=t AND type='AJUSTE' AND idempotency_key=ka;
 rejected:=false;BEGIN PERFORM public.resolver_operacion_inventario_tx_570(t,actor,'AJUSTE',ka,absent_p);EXCEPTION WHEN check_violation THEN rejected:=SQLERRM='INVENTORY_RESOLUTION570_ABANDON_RECEIPT_INVALID';END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVENTORY_FENCE570_CORRUPT_RECEIPT';END IF;
 UPDATE app.inventory_operation_abandonments_570 SET result=stored WHERE tenant_id=t AND type='AJUSTE' AND idempotency_key=ka;
 SELECT jsonb_build_object('products',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM productos x WHERE tenant_id=t),
  'existences',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM producto_existencias x WHERE tenant_id=t),
  'movements',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM movimientos_inventario x WHERE tenant_id=t),
  'operations',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM operaciones_inventario x WHERE tenant_id=t),
  'outbox',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM outbox_events x WHERE tenant_id=t)) INTO after_data;
 IF before_data IS DISTINCT FROM after_data THEN RAISE EXCEPTION 'INVENTORY_FENCE570_ABANDON_MUTATED_BUSINESS_ROWS';END IF;
 RAISE NOTICE 'INVENTORY_FENCE570 PASS: private ACL/RLS, originalcanonical6/GRE/date/lot, immutablecommittedreplaywithoutcatalog, durableboundabandonment,4legacywritersdenied, actor/company/bodyconflicts, invalidrequest, atomicrollback, corruptedreceipt, zerostock/outboxeffects';
END $verify_inventory_abandonment570$;
ROLLBACK;
-- Isolated transactional fixtures only; never execute business tests on preserved UAT.
BEGIN;
CREATE FUNCTION pg_temp.fail_depreciation_batch_570() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.event_type='depreciacion.generada' AND NEW.payload->>'activoId'=current_setting('uat.depreciation.fail_asset',true) THEN
  RAISE EXCEPTION 'VERIFY_DEPRECIATION570_SECOND_OUTBOX_FAILURE';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER verify_depreciation_batch_570 BEFORE INSERT ON public.outbox_events
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_depreciation_batch_570();
DO $depreciation_batch_verify570$
DECLARE t uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();denied uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();k uuid:=gen_random_uuid();
 req jsonb:='{"anio":2026,"mes":10}';plan jsonb;fresh_plan jsonb;r jsonb;replay jsonb;failed boolean;before_rows jsonb;security jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'DEPRECIATION570_LOCAL_ONLY';END IF;
 SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
  'unsafe',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE x.grantee IN(0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='app' AND tablename=c.relname)) INTO security
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='asset_depreciation_batches_570';
 IF security IS DISTINCT FROM '{"owner":"postgres","rls":true,"force":true,"unsafe":false,"policies":0}'::jsonb THEN RAISE EXCEPTION 'DEPRECIATION570_LEDGER_UNSAFE:%',security;END IF;
 IF EXISTS(SELECT 1 FROM app.asset_depreciation_batches_570) THEN RAISE EXCEPTION 'DEPRECIATION570_NO_BACKFILL';END IF;
 IF has_function_privilege('authenticated','public.registrar_lote_depreciacion_tx_570(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.leer_lote_depreciacion_570(uuid,uuid,uuid,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.registrar_lote_depreciacion_tx_570(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'DEPRECIATION570_RPC_ACL';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,activo,estado) VALUES(t,'DB570-'||left(t::text,8),'Depreciation batch verifier','PE',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES
 (actor,t,actor||'@db570.test','Batch admin',true,'ACTIVO',true),(denied,t,denied||'@db570.test','Denied batch',true,'ACTIVO',false);
 INSERT INTO public.activos_fijos(id,tenant_id,codigo,nombre,fecha_adquisicion,valor_adquisicion,valor_residual,depreciacion_acumulada,vida_util,vida_util_meses,fecha_inicio_depreciacion,metodo_depreciacion,situacion,moneda,estado,activo,created_by)
 VALUES(a,t,'A','First','2026-10-01',1200,0,0,12,12,'2026-10-01','LINEAL','ACTIVO','PEN','ACTIVO',true,actor::text),
 (b,t,'B','Second','2026-10-01',1200,0,0,12,12,'2026-10-01','LINEAL','ACTIVO','PEN','ACTIVO',true,actor::text);
 SELECT jsonb_agg(jsonb_build_object('source',jsonb_build_object('id',x.id,'tenant_id',x.tenant_id,'codigo',x.codigo,'valor_adquisicion',x.valor_adquisicion,'valor_residual',x.valor_residual,'vida_util_meses',x.vida_util_meses,'depreciacion_acumulada',x.depreciacion_acumulada,'fecha_inicio_depreciacion',x.fecha_inicio_depreciacion,'centro_costo_id',x.centro_costo_id),'cuota',100,'acumulada',100,'valor_neto',1100) ORDER BY x.id) INTO plan FROM public.activos_fijos x WHERE tenant_id=t;
 IF public.leer_lote_depreciacion_570(t,actor,k,req) IS NOT NULL THEN RAISE EXCEPTION 'DEPRECIATION570_FALSE_PREVIOUS';END IF;
 failed:=false;BEGIN PERFORM public.registrar_lote_depreciacion_tx_570(t,denied,k,req,plan);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'DEPRECIATION570_DENIED_ACTOR_ACCEPTED';END IF;
 failed:=false;BEGIN PERFORM public.registrar_lote_depreciacion_tx_570(t,actor,k,req,jsonb_set(plan,'{0,cuota}','99'));EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'DEPRECIATION570_WRONG_COMPUTATION_ACCEPTED';END IF;
 -- Same cardinality but changed financial snapshot must fail before first installment.
 UPDATE public.activos_fijos SET valor_residual=1 WHERE id=a;
 failed:=false;BEGIN PERFORM public.registrar_lote_depreciacion_tx_570(t,actor,k,req,plan);EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'DEPRECIATION570_CHANGED_SNAPSHOT_ACCEPTED';END IF;
 UPDATE public.activos_fijos SET valor_residual=0 WHERE id=a;
 PERFORM set_config('uat.depreciation.fail_asset',plan->1->'source'->>'id',true);
 failed:=false;BEGIN PERFORM public.registrar_lote_depreciacion_tx_570(t,actor,k,req,plan);EXCEPTION WHEN raise_exception THEN
 IF SQLERRM<>'VERIFY_DEPRECIATION570_SECOND_OUTBOX_FAILURE' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.depreciaciones WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM public.outbox_events WHERE tenant_id=t)
  OR EXISTS(SELECT 1 FROM app.asset_depreciation_batches_570 WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM public.activos_fijos WHERE tenant_id=t AND depreciacion_acumulada<>0) THEN
  RAISE EXCEPTION 'DEPRECIATION570_PARTIAL_COMMIT';END IF;
 PERFORM set_config('uat.depreciation.fail_asset','',true);
 r:=public.registrar_lote_depreciacion_tx_570(t,actor,k,req,plan);
 IF r->'success' IS DISTINCT FROM 'true'::jsonb OR r->'complete' IS DISTINCT FROM 'true'::jsonb OR r#>>'{data,activos_depreciados}'<>'2'
  OR (r#>>'{data,total_depreciado}')::numeric<>200 OR jsonb_array_length(r#>'{data,cuotas}')<>2 OR r#>>'{operation,actor_id}'<>actor::text THEN RAISE EXCEPTION 'DEPRECIATION570_INCOMPLETE_RECEIPT';END IF;
 SELECT jsonb_agg(to_jsonb(d) ORDER BY id) INTO before_rows FROM public.depreciaciones d WHERE tenant_id=t;
 replay:=public.registrar_lote_depreciacion_tx_570(t,actor,k,req,'[]');
 IF replay-'idempotent' IS DISTINCT FROM r-'idempotent' OR replay->'idempotent' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'DEPRECIATION570_RETRY_CHANGED_ORIGINAL';END IF;
 failed:=false;BEGIN PERFORM public.leer_lote_depreciacion_570(t,actor,k,'{"anio":2026,"mes":11}');EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'DEPRECIATION570_KEY_PERIOD_CHANGED';END IF;
 fresh_plan:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(plan,'{0,source,depreciacion_acumulada}','100'),'{1,source,depreciacion_acumulada}','100'),'{0,acumulada}','200'),'{1,acumulada}','200');
 fresh_plan:=jsonb_set(jsonb_set(fresh_plan,'{0,valor_neto}','1000'),'{1,valor_neto}','1000');
 replay:=public.registrar_lote_depreciacion_tx_570(t,actor,gen_random_uuid(),req,fresh_plan);
 IF replay#>>'{data,activos_depreciados}'<>'0' OR jsonb_array_length(replay#>'{data,omitidos}')<>2
  OR (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.depreciaciones d WHERE tenant_id=t) IS DISTINCT FROM before_rows
  OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t)<>2 THEN RAISE EXCEPTION 'DEPRECIATION570_REPEATED_ORIGINAL_ROWS_CHANGED';END IF;
 RAISE NOTICE 'DEPRECIATION_BATCH570 PASS: private ledger/ACL, actor, computed/source conflict, second-row rollback, full original receipt, response-loss retry, changed-period conflict, historical installments untouched';
END $depreciation_batch_verify570$;
ROLLBACK;
BEGIN;
CREATE FUNCTION pg_temp.fail_asset_original_ledger_570() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('uat.asset.lifecycle.fail_ledger',true)='on' THEN RAISE EXCEPTION 'VERIFY_ASSET_ORIGINAL570_LEDGER_FAILURE';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER verify_asset_original_ledger_failure_570 BEFORE INSERT ON app.asset_lifecycle_operations_570
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_asset_original_ledger_570();
DO $asset_original_verify570$
DECLARE t uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();denied uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
 ku uuid:=gen_random_uuid();kr uuid:=gen_random_uuid();kv uuid:=gen_random_uuid();request jsonb;original_request jsonb;retire_request jsonb;
 r jsonb;replay jsonb;snapshot jsonb;before_asset jsonb;failed boolean;asset_row public.activos_fijos%ROWTYPE;
 c33 uuid:=gen_random_uuid();c65 uuid:=gen_random_uuid();c12 uuid:=gen_random_uuid();c75 uuid:=gen_random_uuid();asiento jsonb;details jsonb;baja jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_LOCAL_ONLY';END IF;
 IF EXISTS(SELECT 1 FROM app.asset_lifecycle_operations_570) THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_HISTORICAL_BACKFILL';END IF;
 IF has_table_privilege('service_role','app.asset_lifecycle_operations_570','SELECT') OR has_table_privilege('authenticated','app.asset_lifecycle_operations_570','INSERT')
  OR has_function_privilege('authenticated','public.guardar_operacion_activo_tx_570(uuid,uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
  OR has_function_privilege('service_role','app.asset_original_snapshot_570(public.activos_fijos)','EXECUTE') THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_PRIVATE_CONTRACT';END IF;
 INSERT INTO public.tenants(id,codigo,nombre,pais,activo,estado) VALUES(t,'AL570-'||left(t::text,8),'Asset original verifier','PE',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,email,nombre,activo,estado,is_super_admin) VALUES
 (actor,t,actor||'@al570.test','Original admin',true,'ACTIVO',true),(denied,t,denied||'@al570.test','Denied original',true,'ACTIVO',false);
 INSERT INTO public.plan_cuentas(id,tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado) VALUES
 (c33,t,'335701','Activo','ACTIVO','ACTIVO',2,true,true,'ACTIVO'),(c65,t,'655701','Costo','GASTO','GASTO',2,true,true,'ACTIVO'),
 (c12,t,'125701','Por cobrar','ACTIVO','ACTIVO',2,true,true,'ACTIVO'),(c75,t,'755701','Ingreso','INGRESO','INGRESO',2,true,true,'ACTIVO');
 INSERT INTO public.activos_fijos(id,tenant_id,codigo,nombre,fecha_adquisicion,valor_adquisicion,valor_residual,depreciacion_acumulada,vida_util,vida_util_meses,fecha_inicio_depreciacion,metodo_depreciacion,situacion,moneda,estado,activo,created_by)
 VALUES(a,t,'AL-A','Asset A','2026-01-01',1200,0,0,12,12,'2026-01-01','LINEAL','ACTIVO','PEN','ACTIVO',true,actor::text),
 (b,t,'AL-B','Asset B','2026-01-01',1200,0,0,12,12,'2026-01-01','LINEAL','ACTIVO','PEN','ACTIVO',true,actor::text);
 SELECT * INTO asset_row FROM public.activos_fijos WHERE id=a;snapshot:=app.asset_original_snapshot_570(asset_row);before_asset:=to_jsonb(asset_row);
 request:=jsonb_build_object('expected',snapshot,'original',jsonb_build_object('nombre','Original updated','descripcion','Changed','vida_util_meses',24,'valor_residual',100));original_request:=request;
 IF public.leer_operacion_activo_570(t,actor,a,'UPDATE',ku,request) IS NOT NULL THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_FALSE_PREVIOUS';END IF;
 failed:=false;BEGIN PERFORM public.guardar_operacion_activo_tx_570(t,denied,a,'UPDATE',ku,request);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_DENIED_ACTOR';END IF;
 UPDATE public.activos_fijos SET nombre='Concurrent' WHERE id=a;
 failed:=false;BEGIN PERFORM public.guardar_operacion_activo_tx_570(t,actor,a,'UPDATE',ku,request);EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_STALE_SOURCE';END IF;
 UPDATE public.activos_fijos SET nombre='Asset A' WHERE id=a;
 PERFORM set_config('uat.asset.lifecycle.fail_ledger','on',true);
 failed:=false;BEGIN PERFORM public.guardar_operacion_activo_tx_570(t,actor,a,'UPDATE',ku,request);EXCEPTION WHEN raise_exception THEN
 IF SQLERRM<>'VERIFY_ASSET_ORIGINAL570_LEDGER_FAILURE' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM app.asset_lifecycle_operations_570 WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM public.financial_master_operations WHERE tenant_id=t)
  OR (SELECT to_jsonb(x) FROM public.activos_fijos x WHERE id=a) IS DISTINCT FROM before_asset THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_UPDATE_PARTIAL_COMMIT';END IF;
 PERFORM set_config('uat.asset.lifecycle.fail_ledger','off',true);r:=public.guardar_operacion_activo_tx_570(t,actor,a,'UPDATE',ku,request);
 IF r->'complete' IS DISTINCT FROM 'true'::jsonb OR r#>>'{data,nombre}'<>'Original updated' OR (r#>>'{data,valor_residual}')::numeric<>100 OR r->'journal'<>'null'::jsonb THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_UPDATE_RECEIPT';END IF;
 PERFORM public.gestionar_activo_diferido_tx(t,actor,'ASSET','UPDATE',a,'{"nombre":"Later updated"}',gen_random_uuid()::text);
 replay:=public.guardar_operacion_activo_tx_570(t,actor,a,'UPDATE',ku,request);
 IF replay-'idempotent' IS DISTINCT FROM r-'idempotent' OR replay->'idempotent' IS DISTINCT FROM 'true'::jsonb OR replay#>>'{data,nombre}'<>'Original updated' THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_UPDATE_ORIGINAL_LOST';END IF;
 failed:=false;BEGIN PERFORM public.leer_operacion_activo_570(t,actor,a,'UPDATE',ku,jsonb_set(request,'{original,nombre}','"Changed key body"'));EXCEPTION WHEN serialization_failure THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_KEY_BODY_CONFLICT';END IF;
 SELECT * INTO asset_row FROM public.activos_fijos WHERE id=a;
 retire_request:=jsonb_build_object('expected',app.asset_original_snapshot_570(asset_row),'original',jsonb_build_object('fecha','2026-10-15','tipo','BAJA','motivo','Original retirement'));
 asiento:=jsonb_build_object('fecha','2026-10-15T00:00:00Z','concepto','Original retirement','referencia','AF-AL-A','tipo_asiento','AJUSTE','origen','BAJA_ACTIVO_FIJO','source_event_id',gen_random_uuid(),'estado','CONFIRMADO','created_by',actor,'confirmado_por',actor,'confirmado_en',clock_timestamp());
 details:=jsonb_build_array(jsonb_build_object('cuenta_id',c65,'debe',1200,'haber',0,'concepto','Costo'),jsonb_build_object('cuenta_id',c33,'debe',0,'haber',1200,'concepto','Retiro'));
 baja:=jsonb_build_object('situacion','BAJA','fecha_baja','2026-10-15','motivo_baja','Original retirement','valor_venta',NULL,'valor_adquisicion_esperado',1200,'depreciacion_acumulada_esperada',0);
 PERFORM set_config('uat.asset.lifecycle.fail_ledger','on',true);failed:=false;
 BEGIN PERFORM public.guardar_operacion_activo_tx_570(t,actor,a,'RETIRE',kr,retire_request,asiento,details,baja);EXCEPTION WHEN raise_exception THEN
 IF SQLERRM<>'VERIFY_ASSET_ORIGINAL570_LEDGER_FAILURE' THEN RAISE;END IF;failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.asientos_contables WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM public.detalle_asientos WHERE tenant_id=t)
  OR EXISTS(SELECT 1 FROM app.asset_lifecycle_operations_570 WHERE tenant_id=t AND action='RETIRE') OR (SELECT situacion FROM public.activos_fijos WHERE id=a)<>'ACTIVO' THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_RETIRE_PARTIAL_COMMIT';END IF;
 PERFORM set_config('uat.asset.lifecycle.fail_ledger','off',true);r:=public.guardar_operacion_activo_tx_570(t,actor,a,'RETIRE',kr,retire_request,asiento,details,baja);
 IF r#>>'{data,situacion}'<>'BAJA' OR r#>>'{data,asiento_baja_id}' IS DISTINCT FROM r#>>'{journal,id}' OR jsonb_array_length(r#>'{journal,detalles}')<>2 OR r#>>'{operation,actor_id}'<>actor::text THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_RETIRE_RECEIPT';END IF;
 PERFORM set_config('app.period_transition_458','on',true);UPDATE public.periodos_contables SET estado='BLOQUEADO' WHERE tenant_id=t AND anio=2026 AND mes=10;PERFORM set_config('app.period_transition_458','off',true);
 replay:=public.guardar_operacion_activo_tx_570(t,actor,a,'RETIRE',kr,retire_request);
 IF replay-'idempotent' IS DISTINCT FROM r-'idempotent' OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_RETIRE_REPLAY_AFTER_STATE_PERIOD';END IF;
 replay:=public.leer_operacion_activo_570(t,actor,a,'UPDATE',ku,original_request);
 IF replay#>>'{data,nombre}'<>'Original updated' OR replay#>>'{data,situacion}'<>'ACTIVO' THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_EDIT_SNAPSHOT_AFTER_RETIRE';END IF;
 -- Separate sale retains its exact positive income and complete four-line journal.
 SELECT * INTO asset_row FROM public.activos_fijos WHERE id=b;request:=jsonb_build_object('expected',app.asset_original_snapshot_570(asset_row),'original',jsonb_build_object('fecha','2026-11-01','tipo','VENTA','valor_venta',100,'motivo','Original sale'));
 asiento:=asiento||jsonb_build_object('fecha','2026-11-01T00:00:00Z','source_event_id',gen_random_uuid(),'concepto','Original sale');
 details:=details||jsonb_build_array(jsonb_build_object('cuenta_id',c12,'debe',100,'haber',0,'concepto','Por cobrar'),jsonb_build_object('cuenta_id',c75,'debe',0,'haber',100,'concepto','Venta'));
 baja:=baja||jsonb_build_object('situacion','VENDIDO','fecha_baja','2026-11-01','motivo_baja','Original sale','valor_venta',100);
 r:=public.guardar_operacion_activo_tx_570(t,actor,b,'RETIRE',kv,request,asiento,details,baja);
 IF r#>>'{data,situacion}'<>'VENDIDO' OR (r#>>'{data,valor_venta}')::numeric<>100 OR jsonb_array_length(r#>'{journal,detalles}')<>4 THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_SALE_RECEIPT';END IF;
 replay:=public.guardar_operacion_activo_tx_570(t,actor,b,'RETIRE',kv,request);
 IF replay-'idempotent' IS DISTINCT FROM r-'idempotent' OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t)<>2 OR (SELECT count(*) FROM app.asset_lifecycle_operations_570 WHERE tenant_id=t)<>3 THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_SALE_RETRY_DUPLICATED';END IF;
 RAISE NOTICE 'ASSET_ORIGINAL570 PASS: private empty ledger/ACL, actor, stale snapshot, UPDATE rollback+frozen replay after later update/retirement, body conflict, retirement full rollback, confirmed journal/details, replay after blocked period/state, separate sale+same original retry';
END $asset_original_verify570$;
ROLLBACK;

BEGIN;
DO $product_branch_runtime_read570$
DECLARE source text;
BEGIN
 FOREACH source IN ARRAY ARRAY['producto_precios_sucursal','producto_stock_sucursal'] LOOP
  IF NOT has_table_privilege('service_role','public.'||source,'SELECT') THEN
   RAISE EXCEPTION 'PRODUCT_BRANCH570_RUNTIME_SELECT_MISSING:%',source;
  END IF;
  IF has_table_privilege('service_role','public.'||source,'SELECT WITH GRANT OPTION') THEN
   RAISE EXCEPTION 'PRODUCT_BRANCH570_READ_DELEGATION:%',source;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||source)::regclass AND relrowsecurity AND relforcerowsecurity) THEN
   RAISE EXCEPTION 'PRODUCT_BRANCH570_RLS_MISSING:%',source;
  END IF;
 END LOOP;
END $product_branch_runtime_read570$;
ROLLBACK;

BEGIN READ ONLY;
DO $analytic_runtime_read570$
BEGIN
 IF NOT has_table_privilege('service_role','public.distribucion_analitica','SELECT')
  OR has_table_privilege('service_role','public.distribucion_analitica','SELECT WITH GRANT OPTION') THEN
  RAISE EXCEPTION 'ANALYTIC570_BACKEND_READ_ACL';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.distribucion_analitica'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION 'ANALYTIC570_RLS_MISSING';
 END IF;
 RAISE NOTICE 'ANALYTIC570 PASS: backend SELECT, no delegation, RLS preserved';
END $analytic_runtime_read570$;
SET LOCAL ROLE service_role;
SELECT id FROM public.distribucion_analitica WHERE false;
ROLLBACK;
