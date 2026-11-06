\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_595_LOCAL_ONLY';
 END IF;
END;
$guard$;
DO $verify$
DECLARE
 v_demo jsonb; v_tenant uuid; v_actor uuid; v_key text := 'verify-595-'||gen_random_uuid();
 v_counter bigint; v_next text; v_quote uuid;
BEGIN
 v_demo := public.create_demo_tenant_ready_tx('Verificación 595',14,'PE',v_key,NULL,NULL,NULL,'COMERCIO');
 v_tenant := (v_demo->>'tenant_id')::uuid; v_actor := (v_demo->>'user_id')::uuid;
 SELECT correlativo_actual INTO v_counter FROM public.documento_series
 WHERE tenant_id=v_tenant AND tipo_documento='FACTURA' AND serie='F001';
 IF coalesce(v_counter,0) < 1 THEN RAISE EXCEPTION 'VERIFY_595_SEEDED_INVOICE_NUMBER_NOT_RESERVED:%',v_counter; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cpe WHERE tenant_id=v_tenant AND serie='F001' AND numero='00000001') THEN RAISE EXCEPTION 'VERIFY_595_SEEDED_INVOICE_MISSING'; END IF;
 v_next := public.obtener_siguiente_numero_documento(v_tenant,'FACTURA','F001');
 IF v_next<>'00000002' THEN RAISE EXCEPTION 'VERIFY_595_NEXT_INVOICE_NUMBER_INVALID:%',v_next; END IF;
 SELECT id INTO v_quote FROM public.cotizaciones WHERE tenant_id=v_tenant AND numero='COT-DEMO-001';
 IF (SELECT count(*) FROM public.cotizacion_detalles WHERE cotizacion_id=v_quote AND tenant_id=v_tenant)<>1
   OR (SELECT sum(subtotal) FROM public.cotizacion_detalles WHERE cotizacion_id=v_quote AND tenant_id=v_tenant)<>350
   OR NOT EXISTS(SELECT 1 FROM public.cotizacion_detalles WHERE cotizacion_id=v_quote AND cantidad*precio_unitario=subtotal AND cantidad=4 AND precio_unitario=87.5)
   OR NOT EXISTS(SELECT 1 FROM public.cotizaciones WHERE id=v_quote AND subtotal=350 AND igv=63 AND total=413 AND (items->0->>'precio_unitario')::numeric=87.5) THEN
  RAISE EXCEPTION 'VERIFY_595_QUOTATION_LINES_DO_NOT_RECONCILE';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cuentas_bancarias WHERE tenant_id=v_tenant AND saldo=50000 AND saldo_inicial=50000 AND saldo_actual=50000 AND saldo_contable=50000) THEN
  RAISE EXCEPTION 'VERIFY_595_BANK_OPENING_BALANCE_INVALID';
 END IF;
 -- El replay debe conservar la misma empresa y no recrear las muestras.
 v_demo := public.create_demo_tenant_ready_tx('Verificación 595',14,'PE',v_key,NULL,NULL,NULL,'COMERCIO');
 IF (v_demo->>'tenant_id')::uuid<>v_tenant THEN RAISE EXCEPTION 'VERIFY_595_REPLAY_CHANGED_TENANT'; END IF;
 IF (SELECT count(*) FROM public.cpe WHERE tenant_id=v_tenant AND serie='F001' AND numero='00000001')<>1 THEN RAISE EXCEPTION 'VERIFY_595_SEED_DUPLICATED'; END IF;
 SELECT correlativo_actual INTO v_counter FROM public.documento_series WHERE tenant_id=v_tenant AND tipo_documento='FACTURA' AND serie='F001';
 IF v_counter<>2 THEN RAISE EXCEPTION 'VERIFY_595_REPLAY_REWINDS_COUNTER:%',v_counter; END IF;
 IF (SELECT count(*) FROM public.cotizacion_detalles WHERE cotizacion_id=v_quote AND tenant_id=v_tenant)<>1 THEN RAISE EXCEPTION 'VERIFY_595_REPLAY_DUPLICATES_QUOTATION'; END IF;
 IF EXISTS(SELECT 1 FROM public.cpe WHERE tenant_id=v_tenant AND (upper(estado::text)='ACEPTADO' OR upper(estado_sunat::text)='ACEPTADO' OR upper(sunat_status::text)='ACCEPTED' OR cdr_sunat IS NOT NULL OR fecha_envio IS NOT NULL)) THEN
  RAISE EXCEPTION 'VERIFY_595_DEMO_FALSE_FISCAL_ACCEPTANCE';
 END IF;
END;
$verify$;
SELECT 'PASS 595: alta canónica, siguiente factura2, replay, líneas413, banco50000 y sin aceptación fiscal';
ROLLBACK;
