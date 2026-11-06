-- Reembolso de efectivo: cuenta operativa, valor proporcional de sesión y reversa exacta.
-- Sin DML ni backfill. Conserva contratos bancario604 y CxP602.
BEGIN;
CREATE OR REPLACE FUNCTION app.cash_refund_trace_605(p_tenant uuid,p_session uuid,p_movement uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE m public.movimientos_caja%ROWTYPE; sm public.saldos_favor_movimientos%ROWTYPE;
 sc public.saldos_favor_clientes%ROWTYPE; op public.rma_operaciones%ROWTYPE;
 e public.outbox_events%ROWTYPE; original public.saldos_favor_movimientos%ROWTYPE;
 session public.sesiones_caja%ROWTYPE; book numeric; liability numeric; settled numeric; rate numeric;
 local_currency text; account_id uuid; signed integer; n integer; posted numeric; difference numeric;
BEGIN
 -- customer_refund_cash_605: una traza durable por movimiento, sin inferir historia antigua.
 SELECT * INTO m FROM public.movimientos_caja WHERE tenant_id=p_tenant AND id=p_movement AND sesion_caja_id=p_session;
 IF NOT FOUND OR m.estado<>'ACTIVO' OR m.referencia_tipo NOT IN('saldo_favor_reembolso','saldo_favor_reembolso_reverso') THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO session FROM public.sesiones_caja WHERE tenant_id=p_tenant AND id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.saldos_favor_movimientos WHERE tenant_id=p_tenant AND movimiento_caja_id=m.id;
 IF n<>1 THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO sm FROM public.saldos_favor_movimientos WHERE tenant_id=p_tenant AND movimiento_caja_id=m.id;
 SELECT * INTO sc FROM public.saldos_favor_clientes WHERE tenant_id=p_tenant AND id=sm.saldo_favor_id;
 IF NOT FOUND OR sc.moneda IS DISTINCT FROM session.moneda OR sm.movimiento_bancario_id IS NOT NULL
  OR sm.monto IS DISTINCT FROM abs(m.monto) OR sm.actor_id IS DISTINCT FROM m.usuario_id
  OR sm.idempotency_key IS DISTINCT FROM m.metadata->>'idempotency_key'
  OR sm.metadata->>'request_fingerprint' IS DISTINCT FROM m.metadata->>'request_fingerprint'
  OR sm.metadata->>'refundValuationVersion' IS DISTINCT FROM '605' THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.rma_operaciones WHERE tenant_id=p_tenant AND event_id=sm.event_id;
 IF n<>1 THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO op FROM public.rma_operaciones WHERE tenant_id=p_tenant AND event_id=sm.event_id;
 IF op.saldo_favor_id IS DISTINCT FROM sc.id OR op.actor_id IS DISTINCT FROM sm.actor_id
  OR op.idempotency_key IS DISTINCT FROM sm.idempotency_key OR op.fingerprint IS DISTINCT FROM sm.metadata->>'request_fingerprint' THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 signed:=CASE m.referencia_tipo WHEN 'saldo_favor_reembolso' THEN -1 ELSE 1 END;
 IF (signed=-1 AND (sm.tipo<>'REEMBOLSO_CAJA' OR m.tipo_movimiento<>'RETIRO' OR m.monto>=0
   OR m.referencia_documento IS DISTINCT FROM sc.id::text OR op.tipo<>'REEMBOLSAR_SALDO'
   OR op.fingerprint IS DISTINCT FROM app.rma_fingerprint_456(op.payload)
   OR op.resultado->>'movimiento_id' IS DISTINCT FROM sm.id::text
   OR (op.resultado->>'monto_reembolsado')::numeric IS DISTINCT FROM sm.monto))
  OR (signed=1 AND (sm.tipo<>'REVERSA' OR m.tipo_movimiento<>'INGRESO' OR m.monto<=0
   OR m.referencia_documento IS DISTINCT FROM sm.reversa_de_movimiento_id::text OR op.tipo<>'REVERTIR_REEMBOLSO'
   OR op.fingerprint IS DISTINCT FROM app.refund_fingerprint_466(op.payload)
   OR op.resultado->>'movimiento_reversa_id' IS DISTINCT FROM sm.id::text
   OR (op.resultado->>'monto_repuesto')::numeric IS DISTINCT FROM sm.monto)) THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(sm.metadata->'monto_local_tesoreria') IS DISTINCT FROM 'number'
  OR jsonb_typeof(sm.metadata->'monto_local_pasivo') IS DISTINCT FROM 'number'
  OR jsonb_typeof(sm.metadata->'monto_liquidacion') IS DISTINCT FROM 'number'
  OR jsonb_typeof(sm.metadata->'tipo_cambio_liquidacion') IS DISTINCT FROM 'number'
  OR jsonb_typeof(sm.metadata->'diferencia_cambio') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 book:=(sm.metadata->>'monto_local_tesoreria')::numeric; liability:=(sm.metadata->>'monto_local_pasivo')::numeric;
 settled:=(sm.metadata->>'monto_liquidacion')::numeric;rate:=(sm.metadata->>'tipo_cambio_liquidacion')::numeric;
 local_currency:=app.treasury_local_currency_452(p_tenant);
 IF book::text IN('NaN','Infinity','-Infinity') OR liability::text IN('NaN','Infinity','-Infinity')
  OR settled::text IN('NaN','Infinity','-Infinity') OR rate::text IN('NaN','Infinity','-Infinity')
  OR book<=0 OR liability<=0 OR settled<=0 OR rate<=0 OR book<>round(book,2) OR liability<>round(liability,2)
  OR settled<>round(sm.monto*rate,2) OR (sm.metadata->>'diferencia_cambio')::numeric IS DISTINCT FROM book-liability
  OR sm.metadata->>'moneda_local' IS DISTINCT FROM local_currency THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=sm.event_id;
 IF n<>1 THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=sm.event_id;
 IF e.event_type IS DISTINCT FROM (CASE signed WHEN -1 THEN 'saldo_favor.reembolsado' ELSE 'saldo_favor.reembolso_revertido' END)
  OR e.status NOT IN('pending','processing','completed') OR (e.status='completed' AND e.processed_at IS NULL)
  OR e.payload->>'tenantId' IS DISTINCT FROM p_tenant::text OR e.payload->>'saldoFavorId' IS DISTINCT FROM sc.id::text
  OR e.payload->>'clienteId' IS DISTINCT FROM sc.cliente_id::text OR e.payload->>'movimientoId' IS DISTINCT FROM sm.id::text
  OR e.payload->>'movimientoTesoreriaId' IS DISTINCT FROM m.id::text OR e.payload->>'actorId' IS DISTINCT FROM sm.actor_id::text
  OR e.payload->>'medio' IS DISTINCT FROM 'CAJA' OR e.payload->>'sesionCajaId' IS DISTINCT FROM p_session::text
  OR e.payload->>'cuentaBancariaId' IS NOT NULL OR e.payload->>'moneda' IS DISTINCT FROM sc.moneda
  OR e.payload->>'monedaLocal' IS DISTINCT FROM local_currency OR e.payload->>'refundValuationVersion' IS DISTINCT FROM '605'
  OR e.payload->>'cashValuationVersion' IS DISTINCT FROM '605'
  OR jsonb_typeof(e.payload->'montoTesoreria') IS DISTINCT FROM 'number'
  OR jsonb_typeof(e.payload->'montoPasivo') IS DISTINCT FROM 'number'
  OR (e.payload->>'monto')::numeric IS DISTINCT FROM sm.monto
  OR (e.payload->>'montoTesoreria')::numeric IS DISTINCT FROM book OR (e.payload->>'montoContableCaja')::numeric IS DISTINCT FROM book
  OR (e.payload->>'montoPasivo')::numeric IS DISTINCT FROM liability OR (e.payload->>'montoContabilizado')::numeric IS DISTINCT FROM liability
  OR (e.payload->>'montoLiquidacion')::numeric IS DISTINCT FROM settled OR (e.payload->>'tipoCambioLiquidacion')::numeric IS DISTINCT FROM rate
  OR (e.payload->>'saldoCajaNuevo')::numeric IS DISTINCT FROM m.saldo_nuevo
  OR (e.payload->>'diferenciaCambio')::numeric IS DISTINCT FROM book-liability THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 IF signed=1 THEN
  SELECT * INTO original FROM public.saldos_favor_movimientos WHERE tenant_id=p_tenant AND id=sm.reversa_de_movimiento_id;
  IF NOT FOUND OR original.saldo_favor_id IS DISTINCT FROM sc.id OR original.tipo<>'REEMBOLSO_CAJA'
   OR original.monto IS DISTINCT FROM sm.monto OR original.metadata->>'refundValuationVersion' IS DISTINCT FROM '605'
   OR (original.metadata->>'monto_local_tesoreria')::numeric IS DISTINCT FROM book
   OR (original.metadata->>'monto_local_pasivo')::numeric IS DISTINCT FROM liability
   OR e.payload->>'movimientoReembolsoId' IS DISTINCT FROM original.id::text
   OR e.payload->>'movimientoTesoreriaOrigenId' IS DISTINCT FROM original.movimiento_caja_id::text
   OR NOT EXISTS(SELECT 1 FROM public.movimientos_caja WHERE tenant_id=p_tenant AND id=original.movimiento_caja_id AND sesion_caja_id=p_session) THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT p.id INTO account_id FROM public.plan_cuentas p JOIN public.empresa_config ec ON ec.tenant_id=p.tenant_id
 WHERE p.tenant_id=p_tenant AND p.codigo=CASE ec.pais WHEN 'PE' THEN '10111' WHEN 'AR' THEN '10' WHEN 'CO' THEN '10' END
  AND p.acepta_movimiento AND p.estado::text<>'INACTIVO';
 IF account_id IS NULL THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=sm.event_id;
 IF n=0 THEN
  IF e.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF n=1 THEN
  SELECT sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=account_id),sum(d.debe-d.haber) INTO posted,difference
  FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND j.source_event_id=sm.event_id AND upper(j.estado::text)='CONFIRMADO';
  IF posted IS DISTINCT FROM signed*book OR difference IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('id',sm.id,'event_id',sm.event_id,'event_type',e.event_type,'monto',sm.monto,'moneda',sc.moneda,'idempotency_key',sm.idempotency_key,
  'metadata',sm.metadata||jsonb_build_object('monto_contabilizado',liability,'monto_contable_caja',book,'ajuste_valor_caja',book-settled));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION app.cash_refund_trace_605(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.cash_full_consumption_602(p_tenant uuid,p_session uuid,p_amount numeric,p_local text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE
 session public.sesiones_caja%ROWTYPE; m public.movimientos_caja%ROWTYPE;
 event public.outbox_events%ROWTYPE; payment record; account_id uuid; country text;
 sources uuid[]:=ARRAY[]::uuid[]; n integer; journals integer; seq bigint:=0; signed integer;
 native numeric:=0; carrying numeric:=0; settled numeric; value numeric; rate numeric;
 posted numeric; difference numeric; item text; is_refund boolean; trace jsonb;
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
   OR m.referencia_tipo IS NULL OR m.referencia_tipo NOT IN('cxc_pago','cxp_pago','saldo_favor_reembolso','saldo_favor_reembolso_reverso')
   OR coalesce(m.referencia_documento,'') !~ '^[a-f0-9-]{36}$'
   OR m.monto IS NULL OR m.monto::text IN('NaN','Infinity','-Infinity') OR m.monto=0
   OR m.monto<>round(m.monto,2) OR m.saldo_anterior IS DISTINCT FROM native
   OR m.saldo_nuevo IS DISTINCT FROM native+m.monto OR m.saldo_nuevo<0 THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  is_refund:=m.referencia_tipo IN('saldo_favor_reembolso','saldo_favor_reembolso_reverso');
  signed:=CASE WHEN m.referencia_tipo IN('cxc_pago','saldo_favor_reembolso_reverso') THEN 1 ELSE -1 END;
  IF (signed=1 AND (m.tipo_movimiento<>'INGRESO' OR m.monto<=0))
   OR (signed=-1 AND (m.tipo_movimiento<>'RETIRO' OR m.monto>=0)) THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  -- customer_refund_cash_605: normalización sólo después de verificar crédito/operación/evento/asiento.
  IF is_refund THEN
   trace:=app.cash_refund_trace_605(p_tenant,p_session,m.id);
   SELECT (trace->>'id')::uuid AS id,(trace->>'event_id')::uuid AS event_id,(trace->>'monto')::numeric AS monto,
    trace->>'moneda' AS moneda,trace->'metadata' AS metadata,'EFECTIVO'::text AS metodo_pago,NULL::uuid AS cuenta_bancaria_id,
    trace->>'idempotency_key' AS idempotency_key,true AS supported INTO payment;
  ELSIF signed=1 THEN
   SELECT p.id,p.event_id,p.monto,p.moneda,p.metadata,p.metodo_pago,p.cuenta_bancaria_id,p.idempotency_key,
    p.activo AND p.estado='ACTIVO' AND p.source='finanzas.cxc.atomic' AND p.tipo='PAGO' AS supported
   INTO payment FROM public.cxc_pagos p WHERE p.tenant_id=p_tenant AND p.id=m.referencia_documento::uuid;
  ELSE
   SELECT p.id,p.event_id,p.monto,p.moneda,p.metadata,p.metodo_pago,p.cuenta_bancaria_id,p.idempotency_key,
    p.activo AND p.estado::text='APLICADO' AS supported
   INTO payment FROM public.pagos_facturas p WHERE p.tenant_id=p_tenant AND p.id=m.referencia_documento::uuid;
  END IF;
  IF NOT is_refund THEN
  IF NOT FOUND OR payment.supported IS NOT TRUE OR payment.metodo_pago<>'EFECTIVO'
   OR payment.cuenta_bancaria_id IS NOT NULL OR payment.moneda IS DISTINCT FROM session.moneda
   OR payment.monto IS DISTINCT FROM abs(m.monto) OR payment.event_id IS NULL
   OR payment.event_id=ANY(sources) OR payment.metadata->>'moneda_local' IS DISTINCT FROM p_local
   OR m.metadata->>'pago_id' IS DISTINCT FROM payment.id::text
   OR m.metadata->>'idempotency_key' IS DISTINCT FROM payment.idempotency_key
   OR coalesce(m.metadata->>'request_fingerprint','')=''
   OR m.metadata->>'request_fingerprint' IS DISTINCT FROM payment.metadata->>'request_fingerprint' THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  FOREACH item IN ARRAY ARRAY['monto_liquidacion','tipo_cambio_liquidacion','monto_contabilizado'] LOOP
   IF jsonb_typeof(payment.metadata->item) IS DISTINCT FROM 'number'
    OR (payment.metadata->>item)::numeric::text IN('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  END LOOP;
  settled:=(payment.metadata->>'monto_liquidacion')::numeric;
  rate:=(payment.metadata->>'tipo_cambio_liquidacion')::numeric;
  value:=coalesce((payment.metadata->>'monto_contable_caja')::numeric,settled);
  IF rate<=0 OR settled<=0 OR settled<>round(abs(m.monto)*rate,2)
   OR value::text IN('NaN','Infinity','-Infinity') OR value<=0 OR value<>round(value,2) THEN
   RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=payment.event_id;
  IF n<>1 THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO event FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=payment.event_id;
  IF NOT is_refund THEN
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
 IF native<p_amount OR native<=0 OR carrying<=0 OR EXISTS(
  SELECT 1 FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND d.cuenta_id=account_id AND upper(j.estado::text)='CONFIRMADO'
   AND (j.source_event_id IS NULL OR (NOT(j.source_event_id=ANY(sources)) AND NOT EXISTS(
    SELECT 1 FROM public.outbox_events o JOIN public.movimientos_caja mc ON mc.tenant_id=o.tenant_id AND mc.id::text=coalesce(o.payload->>'movimientoCajaId',o.payload->>'movimientoTesoreriaId')
    JOIN public.sesiones_caja sc ON sc.tenant_id=mc.tenant_id AND sc.id=mc.sesion_caja_id
    WHERE o.tenant_id=p_tenant AND o.event_id=j.source_event_id AND mc.sesion_caja_id<>p_session
     AND o.payload->>'sesionCajaId'=sc.id::text AND (
      (o.event_type IN('cobro.registrado','pago.proveedor.registrado') AND coalesce(o.payload->>'metodoPago',o.payload->>'metodo_pago')='EFECTIVO')
      OR (o.event_type IN('saldo_favor.reembolsado','saldo_favor.reembolso_revertido') AND o.payload->>'refundValuationVersion'='605'
       AND o.payload->>'medio'='CAJA' AND EXISTS(SELECT 1 FROM public.saldos_favor_movimientos sm WHERE sm.tenant_id=o.tenant_id AND sm.event_id=o.event_id AND sm.movimiento_caja_id=mc.id)))) AND NOT EXISTS(
    SELECT 1 FROM public.ventas_pos v JOIN public.outbox_events o ON o.tenant_id=v.tenant_id AND o.event_id=v.accounting_event_id
    JOIN public.movimientos_caja mc ON mc.tenant_id=v.tenant_id AND mc.id::text=v.atomic_result->>'caja_movimiento_id'
    WHERE v.tenant_id=p_tenant AND v.accounting_event_id=j.source_event_id AND o.event_type='pos.venta.registrada'
     AND o.payload->>'source'='pos.venta.registrada' AND o.payload->>'ventaId'=v.id::text
     AND v.sesion_caja_id<>p_session AND mc.sesion_caja_id=v.sesion_caja_id
     AND mc.referencia_documento=v.id::text AND mc.monto>0)))) THEN
  RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 value:=CASE WHEN p_amount=native THEN round(carrying,2) ELSE round(carrying*p_amount/native,2) END;
 IF value<=0 OR value>carrying THEN RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN value;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END;
$fn$;
REVOKE ALL ON FUNCTION app.cash_full_consumption_602(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'customer_refund_cash_605')=0 THEN
 old:=$old$  v_bank_book numeric(14,2);$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_0'; END IF;
 definition:=replace(definition,old,$new$  v_bank_book numeric(14,2);
  v_cash_book numeric(14,2);$new$);
 old:=$old$      v_session_id, v_saldo.moneda);
    v_cash :=$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_1'; END IF;
 definition:=replace(definition,old,$new$      v_session_id, v_saldo.moneda);
    -- customer_refund_cash_605: sesión bloqueada antes de asignar valor proporcional.
    IF v_saldo.moneda<>v_valuation->>'moneda_local' THEN
      v_cash_book:=app.cash_full_consumption_602(p_tenant_id,v_session.id,v_amount,v_valuation->>'moneda_local');
    END IF;
    v_cash :=$new$);
 old:=$old$'monto_local_tesoreria',coalesce(v_bank_book,v_treasury_local)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_2'; END IF;
 definition:=replace(definition,old,$new$'monto_local_tesoreria',coalesce(v_bank_book,v_cash_book,v_treasury_local)$new$);
 old:=$old$'diferencia_cambio',round(coalesce(v_bank_book,v_treasury_local)-v_local_amount,2)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_3'; END IF;
 definition:=replace(definition,old,$new$'diferencia_cambio',round(coalesce(v_bank_book,v_cash_book,v_treasury_local)-v_local_amount,2)$new$);
 old:=$old$'montoTesoreria',coalesce(v_bank_book,v_treasury_local)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_4'; END IF;
 definition:=replace(definition,old,$new$'montoTesoreria',coalesce(v_bank_book,v_cash_book,v_treasury_local)$new$);
 old:=$old$'diferenciaCambio',round(coalesce(v_bank_book,v_treasury_local)-v_local_amount,2)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_5'; END IF;
 definition:=replace(definition,old,$new$'diferenciaCambio',round(coalesce(v_bank_book,v_cash_book,v_treasury_local)-v_local_amount,2)$new$);
 old:=$old$'refundValuationVersion',CASE WHEN v_method='BANCO' THEN 604 END,'accountingOwner'$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_6'; END IF;
 definition:=replace(definition,old,$new$'moneda_local',v_valuation->>'moneda_local','monto_contable_caja',v_cash_book,
      'refundValuationVersion',CASE WHEN v_method='BANCO' THEN 604 ELSE 605 END,'accountingOwner'$new$);
 old:=$old$'refundValuationVersion',CASE WHEN v_method='BANCO' THEN 604 END,$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_0_7'; END IF;
 definition:=replace(definition,old,$new$'refundValuationVersion',CASE WHEN v_method='BANCO' THEN 604 ELSE 605 END,
      'montoContableCaja',CASE WHEN v_method='CAJA' THEN coalesce(v_cash_book,v_treasury_local) END,
      'cashValuationVersion',CASE WHEN v_method='CAJA' THEN 605 END,'saldoCajaNuevo',v_cash.saldo_nuevo,$new$);
 EXECUTE definition; END IF;
 definition:=pg_get_functiondef('public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'customer_refund_cash_605')=0 THEN
 old:=$old$  v_snapshot_604 boolean := false;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_0'; END IF;
 definition:=replace(definition,old,$new$  v_snapshot_604 boolean := false;
  v_snapshot_605 boolean := false;
  v_trace_605 jsonb;$new$);
 old:=$old$    v_cash := app.append_cash_movement_452(
      v_session,$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_1'; END IF;
 definition:=replace(definition,old,$new$    -- customer_refund_cash_605: restituir el valor original en su misma sesión.
    v_snapshot_605:=coalesce(v_original.metadata->>'refundValuationVersion','')='605';
    IF v_snapshot_605 THEN
      IF v_session.id IS DISTINCT FROM v_origin_cash.sesion_caja_id THEN
       RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
      v_trace_605:=app.cash_refund_trace_605(p_tenant_id,v_session.id,v_origin_cash.id);
      IF (v_trace_605->'metadata'->>'monto_local_tesoreria')::numeric IS DISTINCT FROM v_treasury_local
       OR (v_trace_605->'metadata'->>'monto_local_pasivo')::numeric IS DISTINCT FROM v_liability_local THEN
       RAISE EXCEPTION 'CASH_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
    END IF;
    v_cash := app.append_cash_movement_452(
      v_session,$new$);
 old:=$old$      'monto_local_pasivo', v_liability_local,$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_2'; END IF;
 definition:=replace(definition,old,$new$      'moneda_local',CASE WHEN v_snapshot_605 THEN v_trace_605->'metadata'->>'moneda_local' END,
      'monto_liquidacion',CASE WHEN v_snapshot_605 THEN (v_trace_605->'metadata'->>'monto_liquidacion')::numeric END,
      'tipo_cambio_liquidacion',CASE WHEN v_snapshot_605 THEN (v_trace_605->'metadata'->>'tipo_cambio_liquidacion')::numeric END,
      'refundValuationVersion',CASE WHEN v_snapshot_605 THEN 605 END,
      'monto_local_pasivo', v_liability_local,$new$);
 old:=$old$'monedaLocal',CASE WHEN v_snapshot_604 THEN v_origin_bank_movement.metadata->>'moneda_local' END$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_3'; END IF;
 definition:=replace(definition,old,$new$'monedaLocal',CASE WHEN v_snapshot_604 THEN v_origin_bank_movement.metadata->>'moneda_local' WHEN v_snapshot_605 THEN v_trace_605->'metadata'->>'moneda_local' END$new$);
 old:=$old$'montoLiquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'monto_liquidacion')::numeric END$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_4'; END IF;
 definition:=replace(definition,old,$new$'montoLiquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'monto_liquidacion')::numeric WHEN v_snapshot_605 THEN (v_trace_605->'metadata'->>'monto_liquidacion')::numeric END$new$);
 old:=$old$'tipoCambioLiquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'tipo_cambio_liquidacion')::numeric END$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_5'; END IF;
 definition:=replace(definition,old,$new$'tipoCambioLiquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'tipo_cambio_liquidacion')::numeric WHEN v_snapshot_605 THEN (v_trace_605->'metadata'->>'tipo_cambio_liquidacion')::numeric END$new$);
 old:=$old$'refundValuationVersion',CASE WHEN v_snapshot_604 THEN 604 END,'cuentaSaldoNuevo'$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CASH605_ANCHOR_1_6'; END IF;
 definition:=replace(definition,old,$new$'refundValuationVersion',CASE WHEN v_snapshot_604 THEN 604 WHEN v_snapshot_605 THEN 605 END,
      'montoContableCaja',CASE WHEN v_snapshot_605 THEN v_treasury_local END,
      'cashValuationVersion',CASE WHEN v_snapshot_605 THEN 605 END,'saldoCajaNuevo',v_cash.saldo_nuevo,'cuentaSaldoNuevo'$new$);
 EXECUTE definition; END IF;
END; $patch$;
COMMIT;
