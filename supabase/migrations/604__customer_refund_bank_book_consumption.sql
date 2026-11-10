-- Reembolso bancario: consumir valor demostrable al agotar la divisa y
-- conservar liquidación/tasa separadas. La reversa repone ese mismo valor.
-- Extiende el helper600 compartido con CxP; sin DML, backfill ni cambios de ACL.
BEGIN;
DO $patch$
DECLARE definition text; old text; replacement text;
BEGIN
 definition:=pg_get_functiondef('app.bank_full_consumption_600(uuid,uuid,numeric,text)'::regprocedure);
 IF strpos(definition,'customer_refund_bank_604')=0 THEN
  old:='OR p_amount IS DISTINCT FROM bank.saldo';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_BANK_AMOUNT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,'OR p_amount>bank.saldo OR bank.saldo<=0');
  old:=' RETURN round(carrying,2);';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_BANK_ALLOCATION_UNEXPECTED'; END IF;
  definition:=replace(definition,old,$new$ -- Los reembolsos parciales consumen valor proporcional, nunca la cotización actual del saldo retenido.
 bank_value:=CASE WHEN p_amount=bank.saldo THEN round(carrying,2) ELSE round(carrying*p_amount/bank.saldo,2) END;
 IF bank_value<=0 OR bank_value>carrying THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN bank_value;$new$);
  old:=$old$  IF event.event_type IS DISTINCT FROM (CASE m.tipo WHEN 'ABONO' THEN 'cobro.registrado' ELSE 'pago.proveedor.registrado' END)$old$;
  replacement:=$new$  -- customer_refund_bank_604: cada clase adicional exige su traza de crédito.
  IF (m.tipo='ABONO' AND event.event_type NOT IN('cobro.registrado','saldo_favor.reembolso_revertido'))
   OR (m.tipo='CARGO' AND event.event_type NOT IN('pago.proveedor.registrado','saldo_favor.reembolsado'))$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_BANK_EVENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,replacement);
  old:=$old$   OR (bank_value<>settled AND (event.payload->>'bankValuationVersion' IS DISTINCT FROM '600'
     OR m.tipo<>'CARGO' OR (event.payload->>'cuentaSaldoNuevo')::numeric IS DISTINCT FROM 0)) THEN$old$;
  replacement:=$new$   OR bank_value::text IN('NaN','Infinity','-Infinity')
   OR (m.metadata->>'monto_contable_banco' IS NOT NULL AND jsonb_typeof(m.metadata->'monto_contable_banco')<>'number')
   OR (bank_value<>settled AND (
    (m.tipo='CARGO' AND event.payload->>'bankValuationVersion'='600' AND (event.payload->>'cuentaSaldoNuevo')::numeric=0)
    OR (m.tipo='CARGO' AND event.event_type='saldo_favor.reembolsado' AND event.payload->>'bankValuationVersion'='604'
      AND (event.payload->>'cuentaSaldoNuevo')::numeric=m.saldo_nuevo)
    OR (m.tipo='ABONO' AND event.event_type='saldo_favor.reembolso_revertido' AND event.payload->>'bankValuationVersion'='604')) IS NOT TRUE) THEN$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_BANK_VALUE_UNEXPECTED'; END IF;
  definition:=replace(definition,old,replacement);
  old:=$old$  SELECT count(*) INTO journals FROM public.asientos_contables j WHERE j.tenant_id=p_tenant AND j.source_event_id=v_event_uuid;$old$;
  replacement:=$new$  IF event.event_type IN('saldo_favor.reembolsado','saldo_favor.reembolso_revertido') AND NOT EXISTS(
   SELECT 1 FROM public.saldos_favor_movimientos sm
   JOIN public.saldos_favor_clientes sc ON sc.tenant_id=sm.tenant_id AND sc.id=sm.saldo_favor_id
   JOIN public.rma_operaciones op ON op.tenant_id=sm.tenant_id AND op.event_id=sm.event_id
    AND op.saldo_favor_id=sm.saldo_favor_id AND op.actor_id=sm.actor_id
    AND op.idempotency_key=sm.idempotency_key AND op.fingerprint=sm.metadata->>'request_fingerprint'
   WHERE sm.tenant_id=p_tenant AND sm.event_id=v_event_uuid AND sm.movimiento_bancario_id=m.id
    AND sm.movimiento_caja_id IS NULL AND sm.monto=m.monto AND sc.moneda=bank.moneda
    AND sc.cliente_id=m.cliente_id AND sm.actor_id=m.created_by
    AND event.payload->>'saldoFavorId'=sc.id::text AND event.payload->>'clienteId'=sc.cliente_id::text
    AND event.payload->>'movimientoId'=sm.id::text AND event.payload->>'movimientoTesoreriaId'=m.id::text
    AND event.payload->>'actorId'=sm.actor_id::text
    AND m.metadata->>'refundValuationVersion'='604' AND event.payload->>'refundValuationVersion'='604'
    AND m.metadata->>'request_fingerprint'=sm.metadata->>'request_fingerprint'
    AND jsonb_typeof(sm.metadata->'monto_local_pasivo')='number'
    AND jsonb_typeof(sm.metadata->'monto_local_tesoreria')='number'
    AND jsonb_typeof(sm.metadata->'diferencia_cambio')='number'
    AND jsonb_typeof(event.payload->'montoPasivo')='number'
    AND jsonb_typeof(event.payload->'montoTesoreria')='number'
    AND jsonb_typeof(event.payload->'diferenciaCambio')='number'
    AND (sm.metadata->>'monto_local_pasivo')::numeric=(m.metadata->>'monto_contabilizado')::numeric
    AND (sm.metadata->>'monto_local_tesoreria')::numeric=bank_value
    AND (event.payload->>'montoPasivo')::numeric=(m.metadata->>'monto_contabilizado')::numeric
    AND (event.payload->>'montoTesoreria')::numeric=bank_value
    AND (event.payload->>'diferenciaCambio')::numeric=bank_value-(m.metadata->>'monto_contabilizado')::numeric
    AND (sm.metadata->>'diferencia_cambio')::numeric=(event.payload->>'diferenciaCambio')::numeric
    AND ((event.event_type='saldo_favor.reembolsado' AND m.tipo='CARGO' AND sm.tipo='REEMBOLSO_BANCO'
      AND op.tipo='REEMBOLSAR_SALDO' AND op.resultado->>'movimiento_id'=sm.id::text
      AND app.rma_fingerprint_456(op.payload)=op.fingerprint
      AND (op.resultado->>'monto_reembolsado')::numeric=sm.monto
      AND event.payload->>'accountingOwner'='saldo_favor.reembolsado')
     OR (event.event_type='saldo_favor.reembolso_revertido' AND m.tipo='ABONO' AND sm.tipo='REVERSA'
      AND op.tipo='REVERTIR_REEMBOLSO' AND op.resultado->>'movimiento_reversa_id'=sm.id::text
      AND app.refund_fingerprint_466(op.payload)=op.fingerprint
      AND (op.resultado->>'monto_repuesto')::numeric=sm.monto
      AND event.payload->>'source'='public.revertir_reembolso_saldo_favor_tx'
      AND EXISTS(SELECT 1 FROM public.saldos_favor_movimientos original
       JOIN public.movimientos_bancarios bm ON bm.tenant_id=original.tenant_id AND bm.id=original.movimiento_bancario_id
       WHERE original.tenant_id=p_tenant AND original.id=sm.reversa_de_movimiento_id
        AND original.saldo_favor_id=sm.saldo_favor_id AND original.tipo='REEMBOLSO_BANCO'
        AND original.monto=sm.monto AND bm.cuenta_bancaria_id=p_bank
        AND (original.metadata->>'monto_local_tesoreria')::numeric=bank_value
        AND event.payload->>'movimientoReembolsoId'=original.id::text
        AND event.payload->>'movimientoTesoreriaOrigenId'=bm.id::text)))) THEN
   RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO journals FROM public.asientos_contables j WHERE j.tenant_id=p_tenant AND j.source_event_id=v_event_uuid;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_BANK_TRACE_UNEXPECTED'; END IF;
  definition:=replace(definition,old,replacement);
  EXECUTE definition;
 END IF;

 definition:=pg_get_functiondef('public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'customer_refund_bank_604')=0 THEN
  old:='  v_result jsonb;';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_DECLARATION_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||E'\n  v_bank_book numeric(14,2);\n  v_bank_adjust numeric(14,2) := 0;');
  old:='    INSERT INTO public.movimientos_bancarios (';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_WRITER_UNEXPECTED'; END IF;
  definition:=replace(definition,old,$new$    -- customer_refund_bank_604: banco bloqueado, valor del pasivo intacto.
    IF v_saldo.moneda<>v_valuation->>'moneda_local' THEN
      v_bank_book:=app.bank_full_consumption_600(p_tenant_id,v_bank.id,v_amount,v_valuation->>'moneda_local');
      v_bank_adjust:=round(v_bank_book-v_treasury_local,2);
    END IF;
    INSERT INTO public.movimientos_bancarios ($new$);
  old:=$old$'request_fingerprint', v_fingerprint, 'event_id', v_event_id)$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_MOVEMENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,$new$'request_fingerprint', v_fingerprint, 'event_id', v_event_id,
        'moneda_local',v_valuation->>'moneda_local','tipo_cambio_liquidacion',v_settlement_rate,
        'monto_contabilizado',v_local_amount,'monto_liquidacion',v_treasury_local,
        'monto_contable_banco',v_bank_book,'ajuste_valor_banco',v_bank_adjust,
        'diferencia_cambio_liquidacion',v_difference,'refundValuationVersion',604)$new$);
  old:=$old$'monto_local_pasivo', v_local_amount, 'monto_local_tesoreria', v_treasury_local,
      'diferencia_cambio', v_difference, 'accountingOwner', 'saldo_favor.reembolsado')$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_CREDIT_METADATA_UNEXPECTED'; END IF;
  definition:=replace(definition,old,$new$'monto_local_pasivo',v_local_amount,'monto_local_tesoreria',coalesce(v_bank_book,v_treasury_local),
      'diferencia_cambio',round(coalesce(v_bank_book,v_treasury_local)-v_local_amount,2),
      'monto_liquidacion',v_treasury_local,'tipo_cambio_liquidacion',v_settlement_rate,
      'diferencia_cambio_liquidacion',v_difference,'monto_contable_banco',v_bank_book,'ajuste_valor_banco',v_bank_adjust,
      'refundValuationVersion',CASE WHEN v_method='BANCO' THEN 604 END,'accountingOwner','saldo_favor.reembolsado')$new$);
  old:=$old$'montoPasivo', v_local_amount, 'montoTesoreria', v_treasury_local,
      'diferenciaCambio', v_difference, 'fecha', clock_timestamp(),$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_604_EVENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,$new$'montoPasivo',v_local_amount,'montoTesoreria',coalesce(v_bank_book,v_treasury_local),
      'diferenciaCambio',round(coalesce(v_bank_book,v_treasury_local)-v_local_amount,2),
      'montoContabilizado',v_local_amount,'montoLiquidacion',v_treasury_local,
      'tipoCambioLiquidacion',v_settlement_rate,'monedaLocal',v_valuation->>'moneda_local',
      'montoContableBanco',v_bank_book,'ajusteValorBanco',v_bank_adjust,
      'bankValuationVersion',CASE WHEN v_bank_book IS NOT NULL THEN 604 END,
      'refundValuationVersion',CASE WHEN v_method='BANCO' THEN 604 END,
      'cuentaSaldoNuevo',v_bank_new,'diferenciaCambioLiquidacion',v_difference,'fecha',clock_timestamp(),$new$);
  EXECUTE definition;
 END IF;

 definition:=pg_get_functiondef('public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'customer_refund_bank_604')=0 THEN
  old:='  v_result jsonb;';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_REV_604_DECLARATION_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||E'\n  v_snapshot_604 boolean := false;\n  v_origin_event public.outbox_events%ROWTYPE;\n  v_origin_journals integer;\n  v_origin_entry record;');
  old:='    v_bank_before := round(coalesce(v_bank.saldo, v_bank.saldo_actual, 0), 2);';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_REV_604_GUARD_UNEXPECTED'; END IF;
  replacement:=$new$    -- customer_refund_bank_604: reversa del valor registrado, nunca a una tasa nueva.
    v_snapshot_604:=coalesce(v_origin_bank_movement.metadata->>'refundValuationVersion','')='604';
    IF v_snapshot_604 THEN
      SELECT * INTO v_origin_event FROM public.outbox_events
       WHERE tenant_id=p_tenant_id AND event_id=v_original.event_id;
      IF NOT FOUND OR v_origin_event.event_type<>'saldo_favor.reembolsado'
       OR v_origin_event.status NOT IN('pending','processing','completed')
       OR (v_origin_event.status='completed' AND v_origin_event.processed_at IS NULL)
       OR v_liability_local<=0 OR v_treasury_local<=0
       OR v_liability_local::text IN('NaN','Infinity','-Infinity')
       OR v_treasury_local::text IN('NaN','Infinity','-Infinity')
       OR v_difference::text IN('NaN','Infinity','-Infinity')
       OR v_original.monto IS DISTINCT FROM v_origin_bank_movement.monto
       OR v_liability_local IS DISTINCT FROM (v_origin_bank_movement.metadata->>'monto_contabilizado')::numeric
       OR v_treasury_local IS DISTINCT FROM coalesce((v_origin_bank_movement.metadata->>'monto_contable_banco')::numeric,
          (v_origin_bank_movement.metadata->>'monto_liquidacion')::numeric)
       OR v_difference IS DISTINCT FROM v_treasury_local-v_liability_local
       OR jsonb_typeof(v_origin_bank_movement.metadata->'monto_liquidacion') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_origin_bank_movement.metadata->'tipo_cambio_liquidacion') IS DISTINCT FROM 'number'
       OR (v_origin_bank_movement.metadata->>'tipo_cambio_liquidacion')::numeric<=0
       OR jsonb_typeof(v_origin_event.payload->'montoPasivo') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_origin_event.payload->'montoTesoreria') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_origin_event.payload->'diferenciaCambio') IS DISTINCT FROM 'number'
       OR v_origin_bank_movement.metadata->>'moneda_local' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant_id)
       OR (v_origin_bank_movement.metadata->>'monto_liquidacion')::numeric IS DISTINCT FROM
          round(v_amount*(v_origin_bank_movement.metadata->>'tipo_cambio_liquidacion')::numeric,2)
       OR v_origin_event.payload->>'saldoFavorId' IS DISTINCT FROM p_saldo_id::text
       OR v_origin_event.payload->>'tenantId' IS DISTINCT FROM p_tenant_id::text
       OR v_origin_event.payload->>'clienteId' IS DISTINCT FROM v_saldo.cliente_id::text
       OR v_origin_event.payload->>'moneda' IS DISTINCT FROM v_saldo.moneda
       OR v_origin_event.payload->>'accountingOwner' IS DISTINCT FROM 'saldo_favor.reembolsado'
       OR v_origin_event.payload->>'movimientoId' IS DISTINCT FROM p_movimiento_id::text
       OR v_origin_event.payload->>'movimientoTesoreriaId' IS DISTINCT FROM v_origin_bank_movement.id::text
       OR v_origin_event.payload->>'cuentaBancariaId' IS DISTINCT FROM v_bank.id::text
       OR (v_origin_event.payload->>'montoPasivo')::numeric IS DISTINCT FROM v_liability_local
       OR (v_origin_event.payload->>'montoTesoreria')::numeric IS DISTINCT FROM v_treasury_local
       OR (v_origin_event.payload->>'diferenciaCambio')::numeric IS DISTINCT FROM v_difference THEN
        RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
      SELECT count(*) INTO v_origin_journals FROM public.asientos_contables j
       WHERE j.tenant_id=p_tenant_id AND j.source_event_id=v_original.event_id;
      IF v_origin_journals=0 THEN
        IF v_origin_event.status NOT IN('pending','processing') THEN
          RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
      ELSIF v_origin_journals=1 THEN
        SELECT sum(d.haber-d.debe) FILTER(WHERE d.cuenta_id=v_bank.cuenta_contable_id) AS treasury,
         sum(d.debe-d.haber) AS difference INTO v_origin_entry
        FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
        WHERE j.tenant_id=p_tenant_id AND j.source_event_id=v_original.event_id AND upper(j.estado::text)='CONFIRMADO';
        IF v_origin_entry.treasury IS DISTINCT FROM v_treasury_local OR v_origin_entry.difference IS DISTINCT FROM 0 THEN
          RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
      ELSE RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
    END IF;
    v_bank_before := round(coalesce(v_bank.saldo, v_bank.saldo_actual, 0), 2);$new$;
  definition:=replace(definition,old,replacement);
  old:=$old$'event_id', v_event_id,
        'schema_version', 466$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_REV_604_MOVEMENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,$new$'event_id',v_event_id,
        'moneda_local',CASE WHEN v_snapshot_604 THEN v_origin_bank_movement.metadata->>'moneda_local' END,
        'monto_liquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'monto_liquidacion')::numeric END,
        'tipo_cambio_liquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'tipo_cambio_liquidacion')::numeric END,
        'monto_contabilizado',v_liability_local,'monto_contable_banco',CASE WHEN v_snapshot_604 THEN v_treasury_local END,
        'refundValuationVersion',CASE WHEN v_snapshot_604 THEN 604 END,'schema_version',466$new$);
  old:=$old$'montoTesoreria', v_treasury_local,
      'diferenciaCambio', v_difference,$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'REFUND_REV_604_EVENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||$new$
      'monedaLocal',CASE WHEN v_snapshot_604 THEN v_origin_bank_movement.metadata->>'moneda_local' END,
      'montoLiquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'monto_liquidacion')::numeric END,
      'tipoCambioLiquidacion',CASE WHEN v_snapshot_604 THEN (v_origin_bank_movement.metadata->>'tipo_cambio_liquidacion')::numeric END,
      'montoContabilizado',v_liability_local,'montoContableBanco',CASE WHEN v_snapshot_604 THEN v_treasury_local END,
      'bankValuationVersion',CASE WHEN v_snapshot_604 THEN 604 END,
      'refundValuationVersion',CASE WHEN v_snapshot_604 THEN 604 END,'cuentaSaldoNuevo',v_bank_after,$new$);
  EXECUTE definition;
 END IF;
END;
$patch$;
COMMIT;
