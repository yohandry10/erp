-- Salida total de efectivo en divisa: consumir sólo el valor demostrable de
-- esa sesión. No reconstruye aperturas ni modifica movimientos/asientos previos.
BEGIN;
CREATE OR REPLACE FUNCTION app.cash_full_consumption_602(p_tenant uuid,p_session uuid,p_amount numeric,p_local text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE
 session public.sesiones_caja%ROWTYPE; m public.movimientos_caja%ROWTYPE;
 event public.outbox_events%ROWTYPE; payment record; account_id uuid; country text;
 sources uuid[]:=ARRAY[]::uuid[]; n integer; journals integer; seq bigint:=0; signed integer;
 native numeric:=0; carrying numeric:=0; settled numeric; value numeric; rate numeric;
 posted numeric; difference numeric; item text;
BEGIN
 SELECT * INTO session FROM public.sesiones_caja WHERE tenant_id=p_tenant AND id=p_session FOR UPDATE;
 IF NOT FOUND OR p_amount IS NULL OR p_amount::text IN('NaN','Infinity','-Infinity')
  OR p_amount<=0 OR p_amount<>round(p_amount,2) OR session.estado::text<>'ABIERTA'
  OR coalesce(session.congelada,false) OR session.moneda IS NULL OR session.moneda=p_local
  OR session.monto_inicial IS DISTINCT FROM 0 OR session.monto_inicio IS DISTINCT FROM 0
  OR p_local IS DISTINCT FROM app.treasury_local_currency_452(p_tenant) THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT pais INTO country FROM public.empresa_config WHERE tenant_id=p_tenant;
 SELECT id INTO account_id FROM public.plan_cuentas WHERE tenant_id=p_tenant
  AND codigo=CASE country WHEN 'PE' THEN '10111' WHEN 'AR' THEN '10' WHEN 'CO' THEN '10' END
  AND acepta_movimiento AND estado::text<>'INACTIVO';
 IF account_id IS NULL THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR m IN SELECT * FROM public.movimientos_caja WHERE tenant_id=p_tenant AND sesion_caja_id=p_session
  ORDER BY secuencia,created_at,id LOOP
  seq:=seq+1;
  IF m.secuencia IS DISTINCT FROM seq OR m.estado IS DISTINCT FROM 'ACTIVO'
   OR m.referencia_tipo IS NULL OR m.referencia_tipo NOT IN('cxc_pago','cxp_pago')
   OR coalesce(m.referencia_documento,'') !~ '^[a-f0-9-]{36}$'
   OR m.monto IS NULL OR m.monto::text IN('NaN','Infinity','-Infinity') OR m.monto=0
   OR m.monto<>round(m.monto,2) OR m.saldo_anterior IS DISTINCT FROM native
   OR m.saldo_nuevo IS DISTINCT FROM native+m.monto OR m.saldo_nuevo<0 THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  signed:=CASE m.referencia_tipo WHEN 'cxc_pago' THEN 1 ELSE -1 END;
  IF (signed=1 AND (m.tipo_movimiento<>'INGRESO' OR m.monto<=0))
   OR (signed=-1 AND (m.tipo_movimiento<>'RETIRO' OR m.monto>=0)) THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  IF signed=1 THEN
   SELECT p.id,p.event_id,p.monto,p.moneda,p.metadata,p.metodo_pago,p.cuenta_bancaria_id,p.idempotency_key,
    p.activo AND p.estado='ACTIVO' AND p.source='finanzas.cxc.atomic' AND p.tipo='PAGO' AS supported
   INTO payment FROM public.cxc_pagos p WHERE p.tenant_id=p_tenant AND p.id=m.referencia_documento::uuid;
  ELSE
   SELECT p.id,p.event_id,p.monto,p.moneda,p.metadata,p.metodo_pago,p.cuenta_bancaria_id,p.idempotency_key,
    p.activo AND p.estado::text='APLICADO' AS supported
   INTO payment FROM public.pagos_facturas p WHERE p.tenant_id=p_tenant AND p.id=m.referencia_documento::uuid;
  END IF;
  IF NOT FOUND OR payment.supported IS NOT TRUE OR payment.metodo_pago<>'EFECTIVO'
   OR payment.cuenta_bancaria_id IS NOT NULL OR payment.moneda IS DISTINCT FROM session.moneda
   OR payment.monto IS DISTINCT FROM abs(m.monto) OR payment.event_id IS NULL
   OR payment.event_id=ANY(sources) OR payment.metadata->>'moneda_local' IS DISTINCT FROM p_local
   OR m.metadata->>'pago_id' IS DISTINCT FROM payment.id::text
   OR m.metadata->>'idempotency_key' IS DISTINCT FROM payment.idempotency_key
   OR coalesce(m.metadata->>'request_fingerprint','')=''
   OR m.metadata->>'request_fingerprint' IS DISTINCT FROM payment.metadata->>'request_fingerprint' THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  FOREACH item IN ARRAY ARRAY['monto_liquidacion','tipo_cambio_liquidacion','monto_contabilizado'] LOOP
   IF jsonb_typeof(payment.metadata->item) IS DISTINCT FROM 'number'
    OR (payment.metadata->>item)::numeric::text IN('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END LOOP;
  settled:=(payment.metadata->>'monto_liquidacion')::numeric;
  rate:=(payment.metadata->>'tipo_cambio_liquidacion')::numeric;
  value:=coalesce((payment.metadata->>'monto_contable_caja')::numeric,settled);
  IF rate<=0 OR settled<=0 OR settled<>round(abs(m.monto)*rate,2)
   OR value<=0 OR value<>round(value,2) THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=payment.event_id;
  IF n<>1 THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO event FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=payment.event_id;
  IF event.event_type IS DISTINCT FROM (CASE WHEN signed=1 THEN 'cobro.registrado' ELSE 'pago.proveedor.registrado' END)
   OR event.status NOT IN('pending','processing','completed') OR (event.status='completed' AND event.processed_at IS NULL)
   OR event.payload->>'source' IS DISTINCT FROM (CASE WHEN signed=1 THEN 'public.registrar_cxc_pago_tx' ELSE 'app.aplicar_pago_cxp_tx' END)
   OR event.payload->>'tenantId' IS DISTINCT FROM p_tenant::text
   OR event.payload->>'sesionCajaId' IS DISTINCT FROM p_session::text
   OR event.payload->>'movimientoCajaId' IS DISTINCT FROM m.id::text
   OR coalesce(event.payload->>'metodoPago',event.payload->>'metodo_pago') IS DISTINCT FROM 'EFECTIVO'
   OR coalesce(event.payload->>'cuentaBancariaId',event.payload->>'cuenta_bancaria_id') IS NOT NULL
   OR coalesce(event.payload->>'pagoId',event.payload->>'cobroId') IS DISTINCT FROM payment.id::text
   OR event.payload->>'requestFingerprint' IS DISTINCT FROM payment.metadata->>'request_fingerprint'
   OR event.payload->>'moneda' IS DISTINCT FROM session.moneda OR event.payload->>'monedaLocal' IS DISTINCT FROM p_local
   OR jsonb_typeof(event.payload->'monto') IS DISTINCT FROM 'number'
   OR jsonb_typeof(event.payload->'montoLiquidacion') IS DISTINCT FROM 'number'
   OR jsonb_typeof(event.payload->'montoContabilizado') IS DISTINCT FROM 'number'
   OR (event.payload->>'monto')::numeric IS DISTINCT FROM abs(m.monto)
   OR (event.payload->>'montoLiquidacion')::numeric IS DISTINCT FROM settled
   OR (event.payload->>'tipoCambioLiquidacion')::numeric IS DISTINCT FROM rate
   OR (event.payload->>'montoContabilizado')::numeric IS DISTINCT FROM (payment.metadata->>'monto_contabilizado')::numeric
   OR coalesce((event.payload->>'montoContableCaja')::numeric,settled) IS DISTINCT FROM value THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  IF value<>settled OR payment.metadata->>'monto_contable_caja' IS NOT NULL THEN
   IF signed<>-1 OR m.saldo_nuevo<>0 OR event.payload->>'cashValuationVersion' IS DISTINCT FROM '602'
    OR (event.payload->>'saldoCajaNuevo')::numeric IS DISTINCT FROM 0
    OR (event.payload->>'ajusteValorCaja')::numeric IS DISTINCT FROM value-settled
    OR (payment.metadata->>'ajuste_valor_caja')::numeric IS DISTINCT FROM value-settled THEN
    RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT count(*) INTO journals FROM public.asientos_contables j WHERE j.tenant_id=p_tenant AND j.source_event_id=payment.event_id;
  IF journals=0 THEN
   IF event.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF journals=1 THEN
   SELECT sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=account_id),sum(d.debe-d.haber)
   INTO posted,difference FROM public.asientos_contables j
   JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
   WHERE j.tenant_id=p_tenant AND j.source_event_id=payment.event_id AND upper(j.estado::text)='CONFIRMADO';
   IF posted IS DISTINCT FROM signed*value OR difference IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  native:=native+m.monto; carrying:=carrying+signed*value; sources:=array_append(sources,payment.event_id);
 END LOOP;
 -- La cuenta es compartida por cajas: no consumir el saldo de otra sesión.
 -- Entradas manuales o sin asignación demostrable impiden reconstruir su valor.
 IF native IS DISTINCT FROM p_amount OR carrying<=0 OR EXISTS(
  SELECT 1 FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND d.cuenta_id=account_id AND upper(j.estado::text)='CONFIRMADO'
   AND (j.source_event_id IS NULL OR (NOT(j.source_event_id=ANY(sources)) AND NOT EXISTS(
    SELECT 1 FROM public.outbox_events o JOIN public.movimientos_caja mc ON mc.tenant_id=o.tenant_id AND mc.id::text=o.payload->>'movimientoCajaId'
    JOIN public.sesiones_caja sc ON sc.tenant_id=mc.tenant_id AND sc.id=mc.sesion_caja_id
    WHERE o.tenant_id=p_tenant AND o.event_id=j.source_event_id AND mc.sesion_caja_id<>p_session
     AND o.payload->>'sesionCajaId'=sc.id::text AND o.event_type IN('cobro.registrado','pago.proveedor.registrado')
     AND coalesce(o.payload->>'metodoPago',o.payload->>'metodo_pago')='EFECTIVO') AND NOT EXISTS(
    SELECT 1 FROM public.ventas_pos v JOIN public.outbox_events o ON o.tenant_id=v.tenant_id AND o.event_id=v.accounting_event_id
    JOIN public.movimientos_caja mc ON mc.tenant_id=v.tenant_id AND mc.id::text=v.atomic_result->>'caja_movimiento_id'
    WHERE v.tenant_id=p_tenant AND v.accounting_event_id=j.source_event_id AND o.event_type='pos.venta.registrada'
     AND o.payload->>'source'='pos.venta.registrada' AND o.payload->>'ventaId'=v.id::text
     AND v.sesion_caja_id<>p_session AND mc.sesion_caja_id=v.sesion_caja_id
     AND mc.referencia_documento=v.id::text AND mc.monto>0)))) THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN round(carrying,2);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END;
$fn$;
REVOKE ALL ON FUNCTION app.cash_full_consumption_602(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE definition text; old text;
BEGIN
 definition:=pg_get_functiondef('app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)'::regprocedure);
 IF strpos(definition,'cash_full_consumption_602')=0 THEN
  old:='  v_diferencia numeric(18,2);';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH_602_DECLARATION_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||E'\n  v_monto_contable_caja numeric(18,2);\n  v_ajuste_caja numeric(18,2) := 0;\n  v_caja_saldo numeric(18,2);');
  old:='    v_session := app.resolve_cash_session_452(p_tenant_id, p_usuario_id, v_session_id, v_moneda);';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH_602_WRITER_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||$new$
    SELECT saldo_nuevo INTO v_caja_saldo FROM public.movimientos_caja
    WHERE tenant_id=p_tenant_id AND sesion_caja_id=v_session.id ORDER BY secuencia DESC,created_at DESC,id DESC LIMIT 1;
    v_caja_saldo:=coalesce(v_caja_saldo,v_session.monto_inicial,v_session.monto_inicio);
    IF v_moneda<>v_moneda_local AND v_monto=v_caja_saldo THEN
      v_monto_contable_caja:=app.cash_full_consumption_602(p_tenant_id,v_session.id,v_monto,v_moneda_local);
      v_ajuste_caja:=round(v_monto_contable_caja-v_monto_liquidacion,2);
    END IF;$new$);
  old:=$old$'monto_contable_banco', v_monto_contable_banco, 'ajuste_valor_banco', v_ajuste_banco$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>3 THEN RAISE EXCEPTION 'CASH_602_METADATA_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||$new$,
        'monto_contable_caja', v_monto_contable_caja, 'ajuste_valor_caja', v_ajuste_caja$new$);
  old:=$old$'montoLiquidacion', v_monto_liquidacion,$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH_602_EVENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||$new$
      'montoContableCaja', v_monto_contable_caja, 'ajusteValorCaja', v_ajuste_caja,
      'cashValuationVersion', CASE WHEN v_monto_contable_caja IS NOT NULL THEN 602 ELSE NULL END,
      'saldoCajaNuevo', v_cash_movement.saldo_nuevo,$new$);
  EXECUTE definition;
 END IF;
END;
$patch$;
COMMIT;
