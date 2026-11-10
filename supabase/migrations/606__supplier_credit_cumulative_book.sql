-- Crédito proveedor: consumo acumulado compartido con CxP; reembolso preserva liquidación.
-- Sin DML, backfill ni permisos nuevos para clientes.
BEGIN;
CREATE OR REPLACE FUNCTION app.supplier_credit_trace_606(p_tenant uuid,p_movement uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE m public.cxp_credito_proveedor_movimientos%ROWTYPE; note public.cuentas_por_pagar%ROWTYPE;
 target public.cuentas_por_pagar%ROWTYPE; e public.outbox_events%ROWTYPE; op public.financial_master_operations%ROWTYPE;
 bank_move public.movimientos_bancarios%ROWTYPE; bank_event public.outbox_events%ROWTYPE;
 local_credit numeric; local_target numeric; rate numeric; credit_rate numeric; local_currency text;
 credit_account uuid; target_account uuid; bank_account uuid; n integer; posted numeric; diff numeric;
BEGIN
 -- supplier_credit_cumulative_606: ambas caras de la aplicación y el crédito del reembolso son durables.
 SELECT * INTO m FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND id=p_movement;
 IF NOT FOUND OR m.tipo NOT IN('APLICACION','REEMBOLSO') OR m.monto<=0 OR m.monto<>round(m.monto,2)
  OR m.metadata->>'creditValuationVersion' IS DISTINCT FROM '606' THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO note FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=m.nota_credito_id;
 IF NOT FOUND OR note.metadata->>'source' IS DISTINCT FROM 'SUPPLIER_CREDIT_NC_570' OR note.moneda IS DISTINCT FROM m.moneda THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 local_currency:=app.treasury_local_currency_452(p_tenant);credit_rate:=(note.metadata->>'tipo_cambio_credito')::numeric;
 SELECT id INTO credit_account FROM public.plan_cuentas WHERE tenant_id=p_tenant AND codigo='422' AND acepta_movimiento;
 IF credit_account IS NULL OR credit_rate<=0 OR credit_rate::text IN('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(m.metadata->'monto_credito_local') IS DISTINCT FROM 'number'
  OR jsonb_typeof(m.metadata->'monto_destino_local') IS DISTINCT FROM 'number'
  OR jsonb_typeof(m.metadata->'request_payload') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 local_credit:=(m.metadata->>'monto_credito_local')::numeric;local_target:=(m.metadata->>'monto_destino_local')::numeric;
 IF local_credit<0 OR local_target<0 OR local_credit<>round(local_credit,2) OR local_target<>round(local_target,2)
  OR local_credit::text IN('NaN','Infinity','-Infinity') OR local_target::text IN('NaN','Infinity','-Infinity')
  OR (m.metadata->>'tipo_cambio_credito')::numeric IS DISTINCT FROM credit_rate
  OR m.metadata->>'moneda_local' IS DISTINCT FROM local_currency OR m.saldo_anterior-m.monto IS DISTINCT FROM m.saldo_nuevo THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.financial_master_operations WHERE tenant_id=p_tenant AND operation_type='SUPPLIER_CREDIT_USE' AND idempotency_key=m.idempotency_key;
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant AND operation_type='SUPPLIER_CREDIT_USE' AND idempotency_key=m.idempotency_key;
 IF op.actor_id IS DISTINCT FROM m.actor_id OR op.record_id IS DISTINCT FROM note.id
  OR op.result->'movimiento_credito'->>'id' IS DISTINCT FROM m.id::text
  OR op.request_fingerprint IS DISTINCT FROM app.financial_master_fingerprint_477(m.metadata->'request_payload'||jsonb_build_object('nota_id',note.id))
  OR m.metadata->'request_payload'->>'accion' IS DISTINCT FROM m.tipo
  OR (m.metadata->'request_payload'->>'monto')::numeric IS DISTINCT FROM m.monto THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=m.event_id;
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=m.event_id;
 IF e.event_type IS DISTINCT FROM (CASE m.tipo WHEN 'APLICACION' THEN 'credito.proveedor.aplicado' ELSE 'credito.proveedor.reembolsado' END)
  OR e.status NOT IN('pending','processing','completed') OR (e.status='completed' AND e.processed_at IS NULL)
  OR e.payload->>'creditValuationVersion' IS DISTINCT FROM '606' OR e.payload->>'tenantId' IS DISTINCT FROM p_tenant::text
  OR e.payload->>'notaCreditoId' IS DISTINCT FROM note.id::text OR e.payload->>'cuentaCreditoId' IS DISTINCT FROM credit_account::text
  OR e.payload->>'monedaLocal' IS DISTINCT FROM local_currency
  OR jsonb_typeof(e.payload->'montoCreditoLocal') IS DISTINCT FROM 'number'
  OR jsonb_typeof(e.payload->'montoDestinoLocal') IS DISTINCT FROM 'number'
  OR (e.payload->>'monto')::numeric IS DISTINCT FROM m.monto
  OR (e.payload->>'tipoCambioCredito')::numeric IS DISTINCT FROM credit_rate
  OR (e.payload->>'montoCreditoLocal')::numeric IS DISTINCT FROM local_credit
  OR (e.payload->>'montoDestinoLocal')::numeric IS DISTINCT FROM local_target THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF m.tipo='APLICACION' THEN
  SELECT * INTO target FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=m.factura_id;
  IF NOT FOUND OR target.proveedor_id IS DISTINCT FROM note.proveedor_id OR target.moneda IS DISTINCT FROM note.moneda
   OR e.payload->>'facturaId' IS DISTINCT FROM target.id::text OR m.movimiento_bancario_id IS NOT NULL
   OR m.metadata->'request_payload'->>'factura_id' IS DISTINCT FROM target.id::text THEN
   RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  rate:=CASE WHEN target.moneda=local_currency THEN 1 ELSE target.tipo_cambio_origen END;
  SELECT id INTO target_account FROM public.plan_cuentas WHERE tenant_id=p_tenant AND codigo='42' AND acepta_movimiento;
  IF target_account IS NULL OR rate<=0 OR rate::text IN('NaN','Infinity','-Infinity')
   OR (e.payload->>'tipoCambioFactura')::numeric IS DISTINCT FROM rate
   OR (m.metadata->>'tipo_cambio_factura')::numeric IS DISTINCT FROM rate
   OR e.payload->>'cuentaProveedorId' IS DISTINCT FROM target_account::text THEN
   RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO bank_move FROM public.movimientos_bancarios WHERE tenant_id=p_tenant AND id=m.movimiento_bancario_id;
  rate:=(m.metadata->>'tipo_cambio_liquidacion')::numeric;
  IF NOT FOUND OR m.factura_id IS NOT NULL OR bank_move.tipo<>'ABONO' OR bank_move.activo IS NOT TRUE
   OR bank_move.monto IS DISTINCT FROM m.monto OR bank_move.moneda IS DISTINCT FROM note.moneda
   OR bank_move.cuenta_contrapartida_id IS DISTINCT FROM credit_account OR rate<=0 OR rate::text IN('NaN','Infinity','-Infinity')
   OR bank_move.monto_moneda_local IS DISTINCT FROM local_target OR local_target<>round(m.monto*rate,2)
   OR e.payload->>'movimientoBancarioId' IS DISTINCT FROM bank_move.id::text
   OR (e.payload->>'tipoCambioLiquidacion')::numeric IS DISTINCT FROM rate
   OR m.metadata->'request_payload'->>'cuenta_bancaria_id' IS DISTINCT FROM bank_move.cuenta_bancaria_id::text THEN
   RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT cuenta_contable_id INTO bank_account FROM public.cuentas_bancarias WHERE tenant_id=p_tenant AND id=bank_move.cuenta_bancaria_id;
  SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_type='banco.movimiento.registrado' AND payload->>'movimientoId'=bank_move.id::text;
  IF n<>1 OR bank_account IS NULL THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO bank_event FROM public.outbox_events WHERE tenant_id=p_tenant AND event_type='banco.movimiento.registrado' AND payload->>'movimientoId'=bank_move.id::text;
  IF bank_event.status NOT IN('pending','processing','completed') OR (bank_event.status='completed' AND bank_event.processed_at IS NULL)
   OR (bank_event.payload->>'monto')::numeric IS DISTINCT FROM local_target
   OR (bank_event.payload->>'montoOrigen')::numeric IS DISTINCT FROM m.monto
   OR bank_event.payload->>'cuentaContrapartidaId' IS DISTINCT FROM credit_account::text
   OR bank_event.payload->>'cuentaBancoId' IS DISTINCT FROM bank_account::text THEN
   RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=bank_event.event_id;
  IF n=0 THEN
   IF bank_event.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF n=1 THEN
   SELECT sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=credit_account),sum(d.debe-d.haber) INTO posted,diff
   FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
   WHERE j.tenant_id=p_tenant AND j.source_event_id=bank_event.event_id AND upper(j.estado::text)='CONFIRMADO';
   IF posted IS DISTINCT FROM -local_target OR diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT count(*) INTO n FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=m.event_id;
 IF n=0 THEN
  IF e.status NOT IN('pending','processing') AND NOT(m.tipo='REEMBOLSO' AND local_target=local_credit AND e.status='completed' AND e.processed_at IS NOT NULL) THEN
   RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF n=1 THEN
  SELECT sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=credit_account),sum(d.debe-d.haber) INTO posted,diff
  FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND j.source_event_id=m.event_id AND upper(j.estado::text)='CONFIRMADO';
  IF posted IS DISTINCT FROM (CASE m.tipo WHEN 'APLICACION' THEN -local_credit ELSE local_target-local_credit END) OR diff IS DISTINCT FROM 0 THEN
   RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  IF m.tipo='APLICACION' THEN
   SELECT sum(d.debe-d.haber) INTO posted FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
   WHERE j.tenant_id=p_tenant AND j.source_event_id=m.event_id AND upper(j.estado::text)='CONFIRMADO' AND d.cuenta_id=target_account;
   IF posted IS DISTINCT FROM local_target THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('credit',local_credit,'target',local_target,'rate',rate,'event',m.event_id,'metadata',jsonb_build_object('monto_contabilizado',local_target,'tipo_cambio_origen',rate,'moneda_local',local_currency));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION app.supplier_credit_trace_606(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.supplier_credit_book_606(p_tenant uuid,p_note uuid,p_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE note public.cuentas_por_pagar%ROWTYPE; origin public.outbox_events%ROWTYPE; m public.cxp_credito_proveedor_movimientos%ROWTYPE;
 created public.cxp_credito_proveedor_movimientos%ROWTYPE; op public.financial_master_operations%ROWTYPE;
 rate numeric; initial_native numeric; initial_local numeric; used_native numeric:=0; used_local numeric:=0; trace jsonb;
 result numeric; n integer; credit_account uuid; posted numeric; diff numeric;
BEGIN
 -- supplier_credit_cumulative_606: conservar origen aun cuando el consumidor no haya contabilizado.
 IF p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_amount::text IN('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO note FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=p_note;
 IF NOT FOUND OR note.tipo_documento<>'NOTA_CREDITO' OR note.metadata->>'source' IS DISTINCT FROM 'SUPPLIER_CREDIT_NC_570' THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 rate:=(note.metadata->>'tipo_cambio_credito')::numeric;
 IF rate IS NULL OR rate<=0 OR rate::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND nota_credito_id=p_note AND tipo='ORIGEN';
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO created FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND nota_credito_id=p_note AND tipo='ORIGEN';
 initial_native:=created.monto;initial_local:=round(initial_native*rate,2);
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=created.event_id;
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO origin FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=created.event_id;
 SELECT id INTO credit_account FROM public.plan_cuentas WHERE tenant_id=p_tenant AND codigo='422' AND acepta_movimiento;
 IF initial_native<=0 OR initial_local<=0 OR initial_native<>round(initial_native,2) OR created.saldo_anterior<>0 OR created.saldo_nuevo<>initial_native
  OR created.moneda IS DISTINCT FROM note.moneda OR created.factura_id::text IS DISTINCT FROM note.metadata->>'factura_proveedor_id'
  OR created.event_id::text IS DISTINCT FROM note.metadata->>'accounting_event_id' OR credit_account IS NULL
  OR origin.event_type<>'nota_credito.proveedor.registrada' OR origin.status NOT IN('pending','processing','completed')
  OR (origin.status='completed' AND origin.processed_at IS NULL)
  OR origin.payload->>'tenantId' IS DISTINCT FROM p_tenant::text OR origin.payload->>'notaCreditoId' IS DISTINCT FROM p_note::text
  OR origin.payload->>'facturaId' IS DISTINCT FROM created.factura_id::text OR origin.payload->>'proveedorId' IS DISTINCT FROM note.proveedor_id::text
  OR origin.payload->>'cuentaCreditoId' IS DISTINCT FROM credit_account::text OR origin.payload->>'moneda' IS DISTINCT FROM note.moneda
  OR (origin.payload->>'tipoCambio')::numeric IS DISTINCT FROM rate OR (origin.payload->>'creditoCreado')::numeric IS DISTINCT FROM initial_native THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.financial_master_operations WHERE tenant_id=p_tenant AND operation_type='SUPPLIER_CREDIT_NC' AND record_id=p_note;
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant AND operation_type='SUPPLIER_CREDIT_NC' AND record_id=p_note;
 IF op.idempotency_key IS DISTINCT FROM created.idempotency_key OR op.actor_id IS DISTINCT FROM created.actor_id
  OR op.result->>'id' IS DISTINCT FROM p_note::text OR (op.result->>'saldo_credito_proveedor')::numeric IS DISTINCT FROM initial_native THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=origin.event_id;
 IF n=0 THEN
  IF origin.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF n=1 THEN
  SELECT sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=credit_account),sum(d.debe-d.haber) INTO posted,diff
  FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND j.source_event_id=origin.event_id AND upper(j.estado::text)='CONFIRMADO';
  IF posted IS DISTINCT FROM initial_local OR diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR m IN SELECT * FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND nota_credito_id=p_note AND tipo<>'ORIGEN' LOOP
  trace:=app.supplier_credit_trace_606(p_tenant,m.id);used_native:=used_native+m.monto;used_local:=used_local+(trace->>'credit')::numeric;
 END LOOP;
 IF note.saldo_credito_proveedor IS DISTINCT FROM initial_native-used_native OR used_local<>round(used_native*rate,2)
  OR used_local>initial_local OR p_amount>note.saldo_credito_proveedor THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 result:=round((used_native+p_amount)*rate,2)-used_local;
 IF result<0 OR result>initial_local-used_local THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION app.supplier_credit_book_606(uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('public.aplicar_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'supplier_credit_cumulative_606')=0 THEN
 old:=$old$  v_event uuid:=gen_random_uuid();$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_0'; END IF;
 definition:=replace(definition,old,$new$  v_credit_local numeric; v_target_local numeric;
  v_event uuid:=gen_random_uuid();$new$);
 old:=$old$  v_credit_rate:=(v_note.metadata->>'tipo_cambio_credito')::numeric;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_1'; END IF;
 definition:=replace(definition,old,$new$  -- supplier_credit_cumulative_606: nota bloqueada; consumo de origen acumulado.
  v_credit_local:=app.supplier_credit_book_606(p_tenant_id,p_nota_credito_id,v_amount);
  v_credit_rate:=(v_note.metadata->>'tipo_cambio_credito')::numeric;$new$);
 old:=$old$    UPDATE public.cuentas_por_pagar SET saldo=saldo-v_amount,saldo_pendiente=saldo-v_amount,$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_2'; END IF;
 definition:=replace(definition,old,$new$    v_target_local:=app.cxp_book_reduction_601(p_tenant_id,v_invoice.id,v_amount,v_target_rate);
    UPDATE public.cuentas_por_pagar SET saldo=saldo-v_amount,saldo_pendiente=saldo-v_amount,$new$);
 old:=$old$'cuentaProveedorId',v_payable.id,'cuentaCreditoId',v_credit_account.id)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_3'; END IF;
 definition:=replace(definition,old,$new$'cuentaProveedorId',v_payable.id,'cuentaCreditoId',v_credit_account.id,
        'montoCreditoLocal',v_credit_local,'montoDestinoLocal',v_target_local,
        'monedaLocal',app.treasury_local_currency_452(p_tenant_id),'creditValuationVersion',606)$new$);
 old:=$old$    v_bank_result:=app.registrar_movimiento_bancario_tx_457$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_4'; END IF;
 definition:=replace(definition,old,$new$    v_target_local:=round(v_amount*v_refund_rate,2);
    v_bank_result:=app.registrar_movimiento_bancario_tx_457$new$);
 old:=$old$'cuentaCreditoId',v_credit_account.id,'movimientoBancarioId',v_bank_result->>'movimiento_id')$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_5'; END IF;
 definition:=replace(definition,old,$new$'cuentaCreditoId',v_credit_account.id,'movimientoBancarioId',v_bank_result->>'movimiento_id',
        'montoCreditoLocal',v_credit_local,'montoDestinoLocal',v_target_local,
        'monedaLocal',app.treasury_local_currency_452(p_tenant_id),'creditValuationVersion',606)$new$);
 old:=$old$jsonb_build_object('tipo_cambio_credito',v_credit_rate,'tipo_cambio_factura',v_target_rate,'tipo_cambio_liquidacion',v_refund_rate)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_0_6'; END IF;
 definition:=replace(definition,old,$new$jsonb_build_object('tipo_cambio_credito',v_credit_rate,'tipo_cambio_factura',v_target_rate,'tipo_cambio_liquidacion',v_refund_rate,
      'monto_credito_local',v_credit_local,'monto_destino_local',v_target_local,
      'moneda_local',app.treasury_local_currency_452(p_tenant_id),'creditValuationVersion',606,'request_payload',p_payload)$new$);
 EXECUTE definition; END IF;
 definition:=pg_get_functiondef('app.cxp_book_reduction_601(uuid,uuid,numeric,numeric)'::regprocedure);
 IF strpos(definition,'supplier_credit_cumulative_606')=0 THEN
 old:=$old$  FROM public.pagos_facturas pf WHERE pf.tenant_id=p_tenant AND pf.cuenta_por_pagar_id=p_cxp$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_1_0'; END IF;
 definition:=replace(definition,old,$new$  FROM public.pagos_facturas pf WHERE pf.tenant_id=p_tenant AND pf.cuenta_por_pagar_id=p_cxp
  UNION ALL
  -- supplier_credit_cumulative_606: comparte CxP con los pagos de caja/banco.
  SELECT cm.id,cm.monto,trace.value->'metadata',true,cm.event_id,cm.created_at,true,'CREDIT',NULL::uuid,cm.moneda
  FROM public.cxp_credito_proveedor_movimientos cm
  CROSS JOIN LATERAL(SELECT app.supplier_credit_trace_606(p_tenant,cm.id) AS value)trace
  WHERE cm.tenant_id=p_tenant AND cm.factura_id=p_cxp AND cm.tipo='APLICACION'$new$);
 old:=$old$  IF payment_event.event_type<>'pago.proveedor.registrado'
   OR payment_event.status NOT IN('pending','processing','completed')
   OR (payment_event.status='completed' AND payment_event.processed_at IS NULL)
   OR payment_event.payload->>'source' IS DISTINCT FROM 'app.aplicar_pago_cxp_tx'
   OR payment_event.payload->>'cxpId' IS DISTINCT FROM p_cxp::text
   OR payment_event.payload->>'pagoId' IS DISTINCT FROM movement.id::text
   OR (movement.kind='BANK' AND (movement.bank_id IS NULL
     OR payment_event.payload->>'movimientoBancarioId' IS DISTINCT FROM movement.id::text
     OR payment_event.payload->>'cuentaBancariaId' IS DISTINCT FROM movement.bank_id::text
     OR payment_event.payload->>'metodoPago' NOT IN('TRANSFERENCIA','CHEQUE','TARJETA')))
   OR (movement.kind='CASH' AND payment_event.payload->>'metodoPago' IS DISTINCT FROM 'EFECTIVO')
   OR payment_event.payload->>'moneda' IS DISTINCT FROM debt.moneda
   OR payment_event.payload->>'monedaLocal' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
   OR (payment_event.payload->>'tipoCambioOrigen')::numeric IS DISTINCT FROM p_rate
   OR (payment_event.payload->>'monto')::numeric IS DISTINCT FROM movement.monto
   OR (payment_event.payload->>'montoContabilizado')::numeric IS DISTINCT FROM local_movement
   OR jsonb_typeof(payment_event.payload->'monto') IS DISTINCT FROM 'number'
   OR jsonb_typeof(payment_event.payload->'montoContabilizado') IS DISTINCT FROM 'number'
   OR (movement.metadata->>'tipo_cambio_origen')::numeric IS DISTINCT FROM p_rate
   OR movement.metadata->>'moneda_local' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
   OR local_movement<0 OR local_movement<>round(local_movement,2) THEN
   RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_1_1'; END IF;
 definition:=replace(definition,old,$new$  IF movement.kind<>'CREDIT' THEN
  IF payment_event.event_type<>'pago.proveedor.registrado'
   OR payment_event.status NOT IN('pending','processing','completed')
   OR (payment_event.status='completed' AND payment_event.processed_at IS NULL)
   OR payment_event.payload->>'source' IS DISTINCT FROM 'app.aplicar_pago_cxp_tx'
   OR payment_event.payload->>'cxpId' IS DISTINCT FROM p_cxp::text
   OR payment_event.payload->>'pagoId' IS DISTINCT FROM movement.id::text
   OR (movement.kind='BANK' AND (movement.bank_id IS NULL
     OR payment_event.payload->>'movimientoBancarioId' IS DISTINCT FROM movement.id::text
     OR payment_event.payload->>'cuentaBancariaId' IS DISTINCT FROM movement.bank_id::text
     OR payment_event.payload->>'metodoPago' NOT IN('TRANSFERENCIA','CHEQUE','TARJETA')))
   OR (movement.kind='CASH' AND payment_event.payload->>'metodoPago' IS DISTINCT FROM 'EFECTIVO')
   OR payment_event.payload->>'moneda' IS DISTINCT FROM debt.moneda
   OR payment_event.payload->>'monedaLocal' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
   OR (payment_event.payload->>'tipoCambioOrigen')::numeric IS DISTINCT FROM p_rate
   OR (payment_event.payload->>'monto')::numeric IS DISTINCT FROM movement.monto
   OR (payment_event.payload->>'montoContabilizado')::numeric IS DISTINCT FROM local_movement
   OR jsonb_typeof(payment_event.payload->'monto') IS DISTINCT FROM 'number'
   OR jsonb_typeof(payment_event.payload->'montoContabilizado') IS DISTINCT FROM 'number'
   OR (movement.metadata->>'tipo_cambio_origen')::numeric IS DISTINCT FROM p_rate
   OR movement.metadata->>'moneda_local' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
   OR local_movement<0 OR local_movement<>round(local_movement,2) THEN
   RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
$new$);
 old:=$old$FILTER(WHERE pc.codigo LIKE '42%' AND d.concepto='Proveedores'),0) AS amount,$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT606_ANCHOR_1_2'; END IF;
 definition:=replace(definition,old,$new$FILTER(WHERE pc.codigo LIKE '42%' AND d.concepto=CASE movement.kind WHEN 'CREDIT' THEN 'Aplicación a deuda del proveedor' ELSE 'Proveedores' END),0) AS amount,$new$);
 EXECUTE definition; END IF;
END; $patch$;
COMMIT;
