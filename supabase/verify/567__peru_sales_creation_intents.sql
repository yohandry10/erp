\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 v_demo jsonb; v_tenant uuid; v_actor uuid; v_other uuid; v_cliente uuid; v_producto uuid;
 v_first jsonb; v_replay jsonb; v_count integer; v_fp text:=repeat('a',64);
 v_quote regprocedure:=to_regprocedure('public.crear_cotizacion_idempotente_tx_567(uuid,uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,jsonb)');
 v_order regprocedure:=to_regprocedure('public.crear_pedido_idempotente_tx_567(uuid,uuid,text,text,jsonb,jsonb,jsonb)');
 v_replay_fn regprocedure:=to_regprocedure('app.sales_creation_intent_replay_567(uuid,text,uuid,text,text)');
 v_detalle jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_567_LOCAL_ONLY'; END IF;
 IF v_quote IS NULL OR v_order IS NULL OR v_replay_fn IS NULL THEN RAISE EXCEPTION 'VERIFY_567_BOUNDARY_MISSING'; END IF;
 IF NOT has_function_privilege('service_role',v_quote,'EXECUTE') OR NOT has_function_privilege('service_role',v_order,'EXECUTE')
  OR has_function_privilege('anon',v_quote,'EXECUTE') OR has_function_privilege('authenticated',v_quote,'EXECUTE')
  OR has_function_privilege('anon',v_order,'EXECUTE') OR has_function_privilege('authenticated',v_order,'EXECUTE')
  OR has_function_privilege('service_role',v_replay_fn,'EXECUTE') OR has_function_privilege('authenticated',v_replay_fn,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN (v_quote,v_order,v_replay_fn) AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_567_EXECUTE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN (v_quote,v_order,v_replay_fn) AND (NOT prosecdef OR pg_get_userbyid(proowner)<>'postgres')) THEN
  RAISE EXCEPTION 'VERIFY_567_SECURITY_DEFINER_INVALID';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.sales_creation_intents'::regclass AND relrowsecurity AND relforcerowsecurity)
  OR has_table_privilege('anon','public.sales_creation_intents','SELECT') OR has_table_privilege('authenticated','public.sales_creation_intents','SELECT')
  OR has_table_privilege('service_role','public.sales_creation_intents','INSERT') OR has_table_privilege('service_role','public.sales_creation_intents','SELECT')
 THEN RAISE EXCEPTION 'VERIFY_567_INTENT_TABLE_EXPOSED'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='sales_creation_intents')<>1
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_creation_intents' AND policyname='sales_creation_intents_private_567' AND qual='false' AND with_check='false')
 THEN RAISE EXCEPTION 'VERIFY_567_PRIVATE_POLICY_INVALID'; END IF;
 IF NOT has_table_privilege('service_role','public.v_kpis_sunat_multitenant','SELECT') THEN RAISE EXCEPTION 'VERIFY_567_KPI_READ_MISSING'; END IF;

 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
   configured_at=now(),updated_at=now() WHERE singleton;
 v_demo:=public.create_demo_tenant_ready_tx('VERIFY-567-PE',14,'PE','verify-567-pe-'||gen_random_uuid()::text);
 v_tenant:=(v_demo->>'tenant_id')::uuid; v_actor:=(v_demo->>'user_id')::uuid;
 IF v_actor IS NULL THEN SELECT id INTO v_actor FROM public.usuarios_sistema WHERE tenant_id=v_tenant AND activo LIMIT 1; END IF;
 SELECT id INTO v_cliente FROM public.clientes WHERE tenant_id=v_tenant ORDER BY created_at,id LIMIT 1;
 SELECT id INTO v_producto FROM public.productos WHERE tenant_id=v_tenant ORDER BY created_at,id LIMIT 1;
 IF v_actor IS NULL OR v_cliente IS NULL OR v_producto IS NULL THEN RAISE EXCEPTION 'VERIFY_567_FIXTURE_MISSING'; END IF;
 v_detalle:=jsonb_build_array(jsonb_build_object('producto_id',v_producto,'descripcion','Verificador 567','cantidad',1,'precio_unitario',10,'orden',1));

 v_first:=public.crear_cotizacion_idempotente_tx_567(v_tenant,v_actor,'verify-567-quote-key',v_fp,v_cliente,NULL,'Verificador 567','Verificador','PEN',10,1.8,11.8,v_detalle);
 v_replay:=public.crear_cotizacion_idempotente_tx_567(v_tenant,v_actor,'verify-567-quote-key',v_fp,v_cliente,NULL,'Verificador 567','Verificador','PEN',10,1.8,11.8,v_detalle);
 SELECT count(*) INTO v_count FROM public.cotizaciones WHERE tenant_id=v_tenant AND observaciones='Verificador 567';
 IF v_count<>1 OR v_first->'cotizacion'->>'id' IS DISTINCT FROM v_replay->'cotizacion'->>'id' OR (v_replay->>'idempotent')::boolean IS NOT TRUE THEN
  RAISE EXCEPTION 'VERIFY_567_QUOTE_REPLAY_DUPLICATED';
 END IF;
 BEGIN
  PERFORM public.crear_cotizacion_idempotente_tx_567(v_tenant,v_actor,'verify-567-quote-key',repeat('b',64),v_cliente,NULL,'Otra intención','Verificador','PEN',10,1.8,11.8,v_detalle);
  RAISE EXCEPTION 'VERIFY_567_QUOTE_CONFLICT_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 SELECT id INTO v_other FROM public.usuarios_sistema WHERE tenant_id=v_tenant AND id<>v_actor LIMIT 1;
 IF v_other IS NOT NULL THEN
  BEGIN
   PERFORM public.crear_cotizacion_idempotente_tx_567(v_tenant,v_other,'verify-567-quote-key',v_fp,v_cliente,NULL,'Verificador 567','Verificador','PEN',10,1.8,11.8,v_detalle);
   RAISE EXCEPTION 'VERIFY_567_QUOTE_ACTOR_CONFLICT_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
 END IF;

 v_first:=public.crear_pedido_idempotente_tx_567(v_tenant,v_actor,'verify-567-order-key',v_fp,
  jsonb_build_object('tenant_id',v_tenant,'cliente_id',v_cliente,'subtotal',10,'igv',1.8,'total',11.8,'observaciones','Pedido verificador 567','created_by',v_actor),
  jsonb_build_array(jsonb_build_object('producto_id',v_producto,'descripcion','Verificador 567','cantidad',1,'precio_unitario',10,'subtotal',10)),NULL);
 v_replay:=public.crear_pedido_idempotente_tx_567(v_tenant,v_actor,'verify-567-order-key',v_fp,
  jsonb_build_object('tenant_id',v_tenant,'cliente_id',v_cliente,'subtotal',10,'igv',1.8,'total',11.8,'observaciones','Pedido verificador 567','created_by',v_actor),
  jsonb_build_array(jsonb_build_object('producto_id',v_producto,'descripcion','Verificador 567','cantidad',1,'precio_unitario',10,'subtotal',10)),NULL);
 SELECT count(*) INTO v_count FROM public.pedidos_venta WHERE tenant_id=v_tenant AND observaciones='Pedido verificador 567';
 IF v_count<>1 OR v_first->>'pedido_id' IS DISTINCT FROM v_replay->>'pedido_id' OR (v_replay->>'idempotent')::boolean IS NOT TRUE THEN
  RAISE EXCEPTION 'VERIFY_567_ORDER_REPLAY_DUPLICATED';
 END IF;
 BEGIN
  PERFORM public.crear_pedido_idempotente_tx_567(v_tenant,v_actor,'verify-567-order-key',v_fp,
   jsonb_build_object('tenant_id',gen_random_uuid(),'created_by',v_actor),'[]'::jsonb,NULL);
  RAISE EXCEPTION 'VERIFY_567_ORDER_TENANT_MISMATCH_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $verify$;
ROLLBACK;
