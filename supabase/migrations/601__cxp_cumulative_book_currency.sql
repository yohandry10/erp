-- Valor de origen acumulado de CxP; no revalúa pagos ni reescribe históricos.
BEGIN;
CREATE OR REPLACE FUNCTION app.cxp_book_reduction_601(p_tenant uuid,p_cxp uuid,p_amount numeric,p_rate numeric)
RETURNS numeric LANGUAGE plpgsql
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE
 debt public.cuentas_por_pagar%ROWTYPE; origin public.outbox_events%ROWTYPE;
 entry record; movement record; payment_event public.outbox_events%ROWTYPE;
 initial_native numeric; initial_local numeric; pending numeric; projected numeric;
 used_native numeric:=0; used_local numeric:=0; local_movement numeric; result numeric;
 event_count integer; journals integer; item text;
BEGIN
 IF p_amount IS NULL OR p_rate IS NULL OR p_amount::text IN('NaN','Infinity','-Infinity')
  OR p_rate::text IN('NaN','Infinity','-Infinity') OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_rate<=0 THEN
  RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO debt FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=p_cxp;
 IF NOT FOUND OR (debt.tipo_cambio_origen IS NOT NULL AND debt.tipo_cambio_origen<>p_rate) THEN
  RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF debt.event_id IS NULL AND debt.metadata->>'origen'='migracion_apertura' THEN
  -- La apertura conserva total/TC originales; no se fabrica una factura/asiento.
  initial_native:=debt.total-coalesce(debt.retencion_total,0)-coalesce(debt.detraccion_total,0)
   -coalesce(debt.anticipo_total,0)+coalesce(debt.percepcion_total,0);
  initial_local:=round(initial_native*p_rate,2);
 ELSE
  SELECT count(*) INTO event_count FROM public.outbox_events o
  WHERE o.tenant_id=p_tenant AND o.event_id=debt.event_id AND o.event_type='factura.proveedor.registrada';
  IF event_count<>1 THEN RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO origin FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=debt.event_id;
  IF origin.payload->>'tenantId' IS DISTINCT FROM p_tenant::text
   OR origin.payload->>'facturaProvId' IS DISTINCT FROM p_cxp::text
   OR origin.payload->>'proveedorId' IS DISTINCT FROM debt.proveedor_id::text
   OR origin.payload->>'moneda' IS DISTINCT FROM debt.moneda
   OR origin.payload->'accountingHandledByOutbox' IS DISTINCT FROM 'true'::jsonb
   OR jsonb_typeof(origin.payload->'tipoCambio') IS DISTINCT FROM 'number'
   OR (origin.payload->>'tipoCambio')::numeric IS DISTINCT FROM p_rate
   OR origin.status NOT IN('pending','processing','completed')
   OR (origin.status='completed' AND origin.processed_at IS NULL) THEN
   RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  FOREACH item IN ARRAY ARRAY['total','subtotal','igv','retencion','percepcion','detraccion','anticipo','saldoProveedor'] LOOP
   IF jsonb_typeof(origin.payload->item) IS DISTINCT FROM 'number'
    OR (origin.payload->>item)::numeric<0
    OR (origin.payload->>item)::numeric<>round((origin.payload->>item)::numeric,2) THEN
    RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (origin.payload->>'total')::numeric IS DISTINCT FROM debt.total
   OR (origin.payload->>'subtotal')::numeric IS DISTINCT FROM debt.subtotal
   OR (origin.payload->>'igv')::numeric IS DISTINCT FROM debt.igv
   OR (origin.payload->>'retencion')::numeric IS DISTINCT FROM coalesce(debt.retencion_total,0)
   OR (origin.payload->>'percepcion')::numeric IS DISTINCT FROM coalesce(debt.percepcion_total,0)
   OR (origin.payload->>'detraccion')::numeric IS DISTINCT FROM coalesce(debt.detraccion_total,0)
   OR (origin.payload->>'anticipo')::numeric IS DISTINCT FROM coalesce(debt.anticipo_total,0)
   OR (origin.payload->>'subtotal')::numeric+(origin.payload->>'igv')::numeric<>(origin.payload->>'total')::numeric THEN
   RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  initial_native:=(origin.payload->>'saldoProveedor')::numeric;
  IF initial_native<>(origin.payload->>'total')::numeric-(origin.payload->>'retencion')::numeric
    -(origin.payload->>'detraccion')::numeric-(origin.payload->>'anticipo')::numeric+(origin.payload->>'percepcion')::numeric THEN
   RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(DISTINCT j.id) AS count,coalesce(sum(d.haber-d.debe)
    FILTER(WHERE pc.codigo LIKE '42%' AND d.concepto='Proveedores - saldo neto'),0) AS amount,
    coalesce(sum(d.debe-d.haber),0) AS difference INTO entry
  FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  JOIN public.plan_cuentas pc ON pc.tenant_id=d.tenant_id AND pc.id=d.cuenta_id
  WHERE j.tenant_id=p_tenant AND j.source_event_id=debt.event_id AND upper(j.estado::text)='CONFIRMADO';
  SELECT count(*) INTO journals FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=debt.event_id;
  IF journals=0 AND origin.status IN('pending','processing') THEN
   -- Proyectar el mismo snapshot redondeado que usará el listener de proveedor.
   projected:=round((origin.payload->>'subtotal')::numeric*p_rate,2)+round((origin.payload->>'igv')::numeric*p_rate,2)
    +round((origin.payload->>'percepcion')::numeric*p_rate,2)-round((origin.payload->>'retencion')::numeric*p_rate,2)
    -round((origin.payload->>'detraccion')::numeric*p_rate,2)-round((origin.payload->>'anticipo')::numeric*p_rate,2);
   initial_local:=round(initial_native*p_rate,2);
   IF projected<>initial_local THEN RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF journals=1 AND entry.count=1 AND entry.difference=0 THEN initial_local:=entry.amount;
  ELSE RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF initial_native IS NULL OR initial_native<=0 OR initial_native<>round(initial_native,2)
  OR initial_local IS NULL OR initial_local<>round(initial_native*p_rate,2) THEN
  RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR movement IN
  SELECT m.id,m.monto,m.metadata,m.activo,(m.metadata->>'event_id')::uuid AS event_id,
   m.created_at,m.tipo='CARGO' AS supported,'BANK' AS kind,m.cuenta_bancaria_id AS bank_id,
   coalesce(m.moneda,debt.moneda) AS payment_currency
  FROM public.movimientos_bancarios m WHERE m.tenant_id=p_tenant AND m.cxp_id=p_cxp
  UNION ALL
  SELECT pf.id,pf.monto,pf.metadata,pf.activo,pf.event_id,pf.created_at,upper(pf.estado::text)='APLICADO','CASH',NULL::uuid,pf.moneda
  FROM public.pagos_facturas pf WHERE pf.tenant_id=p_tenant AND pf.cuenta_por_pagar_id=p_cxp
 LOOP
  IF movement.activo IS NOT TRUE OR movement.supported IS NOT TRUE OR movement.payment_currency IS DISTINCT FROM debt.moneda OR movement.monto IS NULL OR movement.monto<=0
   OR movement.monto::text IN('NaN','Infinity','-Infinity')
   OR jsonb_typeof(movement.metadata->'monto_contabilizado') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  local_movement:=(movement.metadata->>'monto_contabilizado')::numeric;
  SELECT count(*) INTO event_count FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=movement.event_id;
  IF event_count<>1 THEN RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO payment_event FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=movement.event_id;
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
  SELECT count(*) INTO journals FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=movement.event_id;
  IF journals=0 THEN
   IF payment_event.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF journals=1 THEN
   SELECT count(DISTINCT j.id) AS count,coalesce(sum(d.debe-d.haber)
     FILTER(WHERE pc.codigo LIKE '42%' AND d.concepto='Proveedores'),0) AS amount,
     coalesce(sum(d.debe-d.haber),0) AS difference INTO entry
   FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
   JOIN public.plan_cuentas pc ON pc.tenant_id=d.tenant_id AND pc.id=d.cuenta_id
   WHERE j.tenant_id=p_tenant AND j.source_event_id=movement.event_id AND upper(j.estado::text)='CONFIRMADO';
   IF entry.count<>1 OR entry.amount<>local_movement OR entry.difference<>0 THEN
    RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  used_native:=used_native+movement.monto;used_local:=used_local+local_movement;
 END LOOP;
 pending:=coalesce(debt.saldo,debt.saldo_pendiente);
 IF pending IS NULL OR pending<0 OR debt.saldo IS DISTINCT FROM debt.saldo_pendiente
  OR initial_native-used_native<>pending OR used_local<>round(used_native*p_rate,2)
  OR used_local>initial_local OR p_amount>pending THEN
  RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 result:=round((used_native+p_amount)*p_rate,2)-used_local;
 IF result<0 OR result>initial_local-used_local THEN RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CXP_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END;
$fn$;
REVOKE ALL ON FUNCTION app.cxp_book_reduction_601(uuid,uuid,numeric,numeric) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE definition text; old text; replacement text;
BEGIN
 definition:=pg_get_functiondef('app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)'::regprocedure);
 IF strpos(definition,'cumulative_cxp_book_601')=0 THEN
  old:='  v_monto_contabilizado := round(v_monto * v_tc_origen, 2);';
  replacement:=$new$  -- cumulative_cxp_book_601: CxP bloqueada antes de consumir la traza.
  v_monto_contabilizado := CASE WHEN v_moneda<>v_moneda_local THEN
    app.cxp_book_reduction_601(p_tenant_id,p_cxp_id,v_monto,v_tc_origen)
    ELSE round(v_monto*v_tc_origen,2) END;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CXP_601_WRITER_UNEXPECTED'; END IF;
  EXECUTE replace(definition,old,replacement);
 END IF;
END;
$patch$;
COMMIT;
