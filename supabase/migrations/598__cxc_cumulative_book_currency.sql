-- Conserva el valor reconocido de la CxC al fraccionar cobros/ajustes/NC RMA.
-- No revalúa ni reescribe historia; una traza incompatible exige revisión.
BEGIN;
SET LOCAL search_path=pg_catalog,public,app,extensions,pg_temp;

CREATE OR REPLACE FUNCTION app.cxc_book_reduction_598(
 p_tenant uuid,p_cxc uuid,p_amount numeric,p_rate numeric,p_increase boolean DEFAULT false
) RETURNS numeric LANGUAGE plpgsql
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE
 debt public.cuentas_por_cobrar%ROWTYPE; origin jsonb; origin_status text; entry record; movement record;
 initial_native numeric; initial_local numeric; pending numeric;
 cap_native numeric; cap_local numeric; used_native numeric:=0; used_local numeric:=0;
 local_movement numeric; event_payload jsonb; event_count integer; result numeric;
BEGIN
 IF p_amount IS NULL OR p_rate IS NULL OR p_increase IS NULL
  OR p_amount::text IN ('NaN','Infinity','-Infinity')
  OR p_rate::text IN ('NaN','Infinity','-Infinity')
  OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_rate<=0 THEN
  RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT debt FROM public.cuentas_por_cobrar
 WHERE tenant_id=p_tenant AND id=p_cxc;
 IF debt.tipo_cambio_origen IS NOT NULL AND debt.tipo_cambio_origen<>p_rate THEN
  RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF debt.event_id IS NULL AND debt.metadata->>'origen'='migracion_apertura' THEN
  -- Contrato de apertura452: importe original y TC de origen, sin CPE propio.
  -- No se renombra una apertura como factura ni se fabrica un asiento de origen.
  initial_native:=debt.monto_original;
  initial_local:=round(initial_native*p_rate,2);
  IF initial_native IS NULL OR initial_native<0 OR initial_native<>round(initial_native,2) THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
 SELECT count(*) AS count,min(o.payload::text)::jsonb AS payload,min(o.status::text) AS status INTO entry
 FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=debt.event_id
  AND o.event_type='factura.emitida';
 origin:=entry.payload;origin_status:=entry.status;
 IF entry.count<>1 OR origin->>'source' IS DISTINCT FROM 'cpe.api.atomic'
  OR NOT origin ?& ARRAY['total','subtotal','impuestos','moneda','tipoCambio','facturaId']
  OR origin->>'facturaId' IS DISTINCT FROM debt.documento_id::text
  OR (origin->>'total')::numeric IS DISTINCT FROM debt.monto_original
  OR (origin->>'total')::numeric IS DISTINCT FROM (origin->>'subtotal')::numeric+(origin->>'impuestos')::numeric
  OR (origin->>'tipoCambio')::numeric IS DISTINCT FROM p_rate
  OR origin->>'moneda' IS DISTINCT FROM debt.moneda THEN
  RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 initial_native:=(origin->>'total')::numeric
  -coalesce((origin->'ajustes'->>'retencion')::numeric,0)
  -coalesce((origin->'ajustes'->>'detraccion')::numeric,0)
  -coalesce((origin->'ajustes'->>'anticipo')::numeric,0)
  +coalesce((origin->'ajustes'->>'percepcion')::numeric,0);
 SELECT count(DISTINCT a.id) AS count,
  coalesce(sum(CASE WHEN pc.codigo LIKE '12%' AND d.concepto='Clientes - Venta'
    THEN d.debe-d.haber ELSE 0 END),0) AS amount
 INTO entry FROM public.asientos_contables a
 JOIN public.detalle_asientos d ON d.tenant_id=a.tenant_id AND d.asiento_id=a.id
 JOIN public.plan_cuentas pc ON pc.tenant_id=d.tenant_id AND pc.id=d.cuenta_id
 WHERE a.tenant_id=p_tenant AND a.source_event_id=debt.event_id
  AND upper(a.estado::text)='CONFIRMADO';
 initial_local:=entry.amount;
 -- La emisión y sus cobros comparten outbox. No exigir que el consumidor haya
 -- terminado antes de aceptar un cobro: usar el snapshot durable verificado.
 -- Un asiento existente incompatible o un origen fallido nunca se proyectan.
 IF entry.count=0 AND origin_status IN ('pending','processing')
  AND NOT EXISTS(SELECT 1 FROM public.asientos_contables a
    WHERE a.tenant_id=p_tenant AND a.source_event_id=debt.event_id) THEN
  initial_local:=round(initial_native*p_rate,2);
 ELSIF entry.count<>1 THEN
  RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF initial_native IS NULL OR initial_native<0 OR initial_native<>round(initial_native,2)
  OR initial_local<>round(initial_native*p_rate,2) THEN
  RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 cap_native:=initial_native;cap_local:=initial_local;
 FOR movement IN SELECT * FROM public.cxc_pagos
  WHERE tenant_id=p_tenant AND cuenta_id=p_cxc ORDER BY created_at,id LOOP
  IF movement.estado<>'ACTIVO' OR movement.activo IS NOT TRUE
   OR movement.moneda IS DISTINCT FROM debt.moneda THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  -- Los ajustes automáticos ya forman parte de la deuda reconocida al emitir.
  IF movement.source='cpe.api.atomic' THEN CONTINUE; END IF;
  SELECT count(*),min(o.payload::text)::jsonb INTO event_count,event_payload
  FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=movement.event_id;
  IF event_count<>1 OR coalesce(event_payload->>'cxcId',event_payload->>'cxc_id')
   IS DISTINCT FROM p_cxc::text THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  IF movement.source='finanzas.cxc.atomic' THEN
   local_movement:=(movement.metadata->>'monto_contabilizado')::numeric;
   IF jsonb_typeof(movement.metadata->'monto_contabilizado') IS DISTINCT FROM 'number'
    OR (event_payload->>'montoContabilizado')::numeric IS DISTINCT FROM local_movement
    OR (event_payload->>'monto')::numeric IS DISTINCT FROM movement.monto
    OR (event_payload->>'tipoCambioOrigen')::numeric IS DISTINCT FROM p_rate THEN
    RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF movement.source='rma.nota_credito.atomic' AND movement.tipo='NOTA_CREDITO' THEN
   local_movement:=(event_payload->>'cxcReduction')::numeric;
   IF event_payload->>'source' IS DISTINCT FROM 'rma.nota_credito.atomic'
    OR (event_payload->>'tipoCambio')::numeric IS DISTINCT FROM p_rate
    OR NOT EXISTS(SELECT 1 FROM public.rma_solicitudes r WHERE r.tenant_id=p_tenant
      AND r.id=(movement.metadata->>'rma_id')::uuid
      AND r.documento_origen_id=debt.documento_id
      AND r.nota_credito_documento_id=movement.documento_id
      AND (r.metadata->>'cxc_reduction')::numeric=movement.monto) THEN
    RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF local_movement IS NULL OR local_movement<0 OR local_movement<>round(local_movement,2) THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  IF movement.tipo='PERCEPCION' THEN
   cap_native:=cap_native+movement.monto;cap_local:=cap_local+local_movement;
  ELSE
   used_native:=used_native+movement.monto;used_local:=used_local+local_movement;
  END IF;
 END LOOP;
 pending:=coalesce(debt.monto_pendiente,debt.saldo_pendiente,debt.saldo);
 IF pending IS NULL OR pending<0 OR cap_native-used_native<>pending
  OR cap_local<>round(cap_native*p_rate,2)
  OR used_local<>round(used_native*p_rate,2) OR used_local>cap_local THEN
  RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF p_increase THEN
  result:=round(p_amount*p_rate,2);
  IF cap_local+result<>round((cap_native+p_amount)*p_rate,2) THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  IF p_amount>pending THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  result:=round((used_native+p_amount)*p_rate,2)-used_local;
  IF result<0 OR result>cap_local-used_local THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION app.cxc_book_reduction_598(uuid,uuid,numeric,numeric,boolean)
 FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE definition text; old text; replacement text;
BEGIN
 definition:=pg_get_functiondef('public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid)'::regprocedure);
 IF strpos(definition,'cumulative_cxc_book_598')=0 THEN
  old:='  v_monto_contabilizado := round(v_monto * v_tc_origen, 2);';
  replacement:=$new$  -- cumulative_cxc_book_598: CxC bloqueada antes de consultar la traza.
  v_monto_contabilizado := CASE WHEN v_moneda<>v_moneda_local THEN
    app.cxc_book_reduction_598(p_tenant_id,p_cuenta_id,v_monto,v_tc_origen,v_tipo='PERCEPCION')
    ELSE round(v_monto * v_tc_origen,2) END;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
   RAISE EXCEPTION 'CXC_598_WRITER_UNEXPECTED'; END IF;
  EXECUTE replace(definition,old,replacement);
 END IF;
 definition:=pg_get_functiondef('app.rma_currency_credit_597(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure);
 IF strpos(definition,'cumulative_cxc_book_598')=0 THEN
  old:=' financial:=ARRAY[round((prior.reduction+p_reduction)*p_rate,2)-prior.local_reduction,0];';
  replacement:=$new$ -- cumulative_cxc_book_598: comparte los céntimos consumidos por cobros y NC.
 financial:=ARRAY[coalesce((SELECT app.cxc_book_reduction_598(p_tenant,cx.id,p_reduction,p_rate,false)
   FROM public.cuentas_por_cobrar cx WHERE cx.tenant_id=p_tenant AND cx.documento_id=p_document
    AND upper(cx.estado::text)<>'ANULADA'),0),0];
 IF p_reduction>0 AND financial[1]<=0 THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
   OR strpos(definition,'  OR prior.local_reduction<>round(prior.reduction*p_rate,2)')=0 THEN
   RAISE EXCEPTION 'CXC_598_RMA_UNEXPECTED'; END IF;
  definition:=replace(definition,'  OR prior.local_reduction<>round(prior.reduction*p_rate,2)','');
  EXECUTE replace(definition,old,replacement);
 END IF;
END;
$patch$;
COMMIT;
