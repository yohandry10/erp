-- La aplicación de crédito comparte el valor acumulado de la CxC con cobros/NC.
-- Se conserva el valor del pasivo, su tasa y su FX. Sin DML ni backfill.
BEGIN;
DO $patch$
DECLARE definition text; old text; replacement text;
BEGIN
 definition:=pg_get_functiondef('app.cxc_book_reduction_598(uuid,uuid,numeric,numeric,boolean)'::regprocedure);
 IF strpos(definition,'customer_credit_cumulative_603')=0 THEN
  old:=' local_movement numeric; event_payload jsonb; event_count integer; result numeric;';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT_603_DECLARATION_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||E'\n credit_event public.outbox_events%ROWTYPE; credit_entry record; credit_journals integer;');
  old:=' pending:=coalesce(debt.monto_pendiente,debt.saldo_pendiente,debt.saldo);';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT_603_HISTORY_UNEXPECTED'; END IF;
  replacement:=$new$
 -- customer_credit_cumulative_603: aplicaciones durables no son cobros ni caja.
 FOR movement IN SELECT m.*,s.cliente_id AS credit_client,s.moneda AS credit_currency,s.estado AS credit_state
  FROM public.saldos_favor_movimientos m JOIN public.saldos_favor_clientes s
   ON s.tenant_id=m.tenant_id AND s.id=m.saldo_favor_id
  WHERE m.tenant_id=p_tenant AND m.cxc_id=p_cxc AND m.tipo='APLICACION_CXC'
  ORDER BY m.created_at,m.id LOOP
  IF movement.credit_client IS DISTINCT FROM debt.cliente_id
   OR movement.credit_currency IS DISTINCT FROM debt.moneda
   OR movement.credit_state NOT IN('DISPONIBLE','PARCIAL','AGOTADO')
   OR movement.monto IS NULL OR movement.monto<=0 OR movement.monto<>round(movement.monto,2)
   OR movement.movimiento_caja_id IS NOT NULL OR movement.movimiento_bancario_id IS NOT NULL
   OR jsonb_typeof(movement.metadata->'monto_local_cxc') IS DISTINCT FROM 'number'
   OR jsonb_typeof(movement.metadata->'monto_local_pasivo') IS DISTINCT FROM 'number'
   OR jsonb_typeof(movement.metadata->'diferencia_cambio') IS DISTINCT FROM 'number'
   OR movement.metadata->>'accountingOwner' IS DISTINCT FROM 'saldo_favor.aplicado'
   OR coalesce(movement.metadata->>'request_fingerprint','')='' THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  local_movement:=(movement.metadata->>'monto_local_cxc')::numeric;
  IF local_movement IS NULL OR local_movement<0 OR local_movement<>round(local_movement,2)
   OR local_movement::text IN('NaN','Infinity','-Infinity')
   OR (movement.metadata->>'monto_local_pasivo')::numeric<=0
   OR (movement.metadata->>'diferencia_cambio')::numeric IS DISTINCT FROM
    local_movement-(movement.metadata->>'monto_local_pasivo')::numeric THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO event_count FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=movement.event_id;
  IF event_count<>1 THEN RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO credit_event FROM public.outbox_events o WHERE o.tenant_id=p_tenant AND o.event_id=movement.event_id;
  IF credit_event.event_type IS DISTINCT FROM 'saldo_favor.aplicado'
   OR credit_event.status NOT IN('pending','processing','completed')
   OR (credit_event.status='completed' AND credit_event.processed_at IS NULL)
   OR credit_event.payload->>'accountingOwner' IS DISTINCT FROM 'saldo_favor.aplicado'
   OR credit_event.payload->>'tenantId' IS DISTINCT FROM p_tenant::text
   OR credit_event.payload->>'cxcId' IS DISTINCT FROM p_cxc::text
   OR credit_event.payload->>'saldoFavorId' IS DISTINCT FROM movement.saldo_favor_id::text
   OR credit_event.payload->>'movimientoId' IS DISTINCT FROM movement.id::text
   OR credit_event.payload->>'clienteId' IS DISTINCT FROM debt.cliente_id::text
   OR credit_event.payload->>'moneda' IS DISTINCT FROM debt.moneda
   OR credit_event.payload->>'actorId' IS DISTINCT FROM movement.actor_id::text
   OR jsonb_typeof(credit_event.payload->'monto') IS DISTINCT FROM 'number'
   OR jsonb_typeof(credit_event.payload->'montoCxc') IS DISTINCT FROM 'number'
   OR jsonb_typeof(credit_event.payload->'montoPasivo') IS DISTINCT FROM 'number'
   OR jsonb_typeof(credit_event.payload->'diferenciaCambio') IS DISTINCT FROM 'number'
   OR (credit_event.payload->>'monto')::numeric IS DISTINCT FROM movement.monto
   OR (credit_event.payload->>'montoCxc')::numeric IS DISTINCT FROM local_movement
   OR (credit_event.payload->>'montoPasivo')::numeric IS DISTINCT FROM (movement.metadata->>'monto_local_pasivo')::numeric
   OR (credit_event.payload->>'diferenciaCambio')::numeric IS DISTINCT FROM (movement.metadata->>'diferencia_cambio')::numeric
   OR NOT EXISTS(SELECT 1 FROM public.rma_operaciones op WHERE op.tenant_id=p_tenant
    AND op.tipo='APLICAR_SALDO' AND op.saldo_favor_id=movement.saldo_favor_id
    AND op.event_id=movement.event_id AND op.actor_id=movement.actor_id
    AND op.idempotency_key=movement.idempotency_key
    AND op.fingerprint=movement.metadata->>'request_fingerprint'
    AND op.resultado->>'movimiento_id'=movement.id::text
    AND op.resultado->>'cxc_id'=p_cxc::text
    AND (op.resultado->>'monto_aplicado')::numeric=movement.monto) THEN
   RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO credit_journals FROM public.asientos_contables j
   WHERE j.tenant_id=p_tenant AND j.source_event_id=movement.event_id;
  IF credit_journals=0 THEN
   IF credit_event.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF credit_journals=1 THEN
   SELECT count(DISTINCT j.id) AS count,
    sum(d.haber-d.debe) FILTER(WHERE pc.codigo='12' AND d.concepto='Cancelación de cuenta por cobrar con saldo a favor') AS amount,
    sum(d.debe-d.haber) AS difference INTO credit_entry
   FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
   JOIN public.plan_cuentas pc ON pc.tenant_id=d.tenant_id AND pc.id=d.cuenta_id
   WHERE j.tenant_id=p_tenant AND j.source_event_id=movement.event_id AND upper(j.estado::text)='CONFIRMADO';
   IF credit_entry.count<>1 OR credit_entry.amount IS DISTINCT FROM local_movement OR credit_entry.difference IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'CXC_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  used_native:=used_native+movement.monto;used_local:=used_local+local_movement;
 END LOOP;
 pending:=coalesce(debt.monto_pendiente,debt.saldo_pendiente,debt.saldo);$new$;
  definition:=replace(definition,old,replacement);
  EXECUTE definition;
 END IF;
 definition:=pg_get_functiondef('public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text)'::regprocedure);
 IF strpos(definition,'customer_credit_cumulative_603')=0 THEN
  old:=$old$  v_cxc_local := round(v_amount * coalesce(nullif(v_cxc.tipo_cambio_origen, 0),
    CASE WHEN v_saldo.moneda = 'PEN' THEN 1 ELSE v_saldo.tipo_cambio_origen END), 2);$old$;
  replacement:=$new$  -- customer_credit_cumulative_603: destino bloqueado; no usar la tasa del crédito como tasa de la deuda.
  v_cxc_local := CASE WHEN v_saldo.moneda<>app.treasury_local_currency_452(p_tenant_id) THEN
    app.cxc_book_reduction_598(p_tenant_id,p_cxc_id,v_amount,v_cxc.tipo_cambio_origen,false)
    ELSE v_amount END;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CREDIT_603_WRITER_UNEXPECTED'; END IF;
  EXECUTE replace(definition,old,replacement);
 END IF;
END;
$patch$;
COMMIT;
