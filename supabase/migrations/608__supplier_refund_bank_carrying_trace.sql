-- Admitir sólo reembolsos proveedor verificables al consumir banco extranjero.
-- Conserva liquidación, límites, cuentas compartidas y revisión de otras fuentes.
-- Sin DML/backfill ni cambios de permisos de clientes.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
-- Sólo reembolsos con cadena de crédito606 y recibo bancario457 completos.
CREATE OR REPLACE FUNCTION app.supplier_refund_bank_trace_608(p_tenant uuid,p_bank uuid,p_movement uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE bank public.cuentas_bancarias%ROWTYPE; m public.movimientos_bancarios%ROWTYPE;
 cm public.cxp_credito_proveedor_movimientos%ROWTYPE; op public.operaciones_bancarias%ROWTYPE;
 event public.outbox_events%ROWTYPE; trace jsonb; canonical jsonb; n integer; rate numeric; amount_local numeric;
BEGIN
 SELECT * INTO bank FROM public.cuentas_bancarias WHERE tenant_id=p_tenant AND id=p_bank;
 IF NOT FOUND THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO m FROM public.movimientos_bancarios WHERE tenant_id=p_tenant AND id=p_movement;
 IF NOT FOUND OR m.cuenta_bancaria_id IS DISTINCT FROM p_bank OR m.tipo IS DISTINCT FROM 'ABONO'
  OR m.activo IS NOT TRUE OR m.moneda IS DISTINCT FROM bank.moneda OR m.monto<=0 OR m.monto<>round(m.monto,2)
  OR m.cxc_id IS NOT NULL OR m.cxp_id IS NOT NULL
  OR (m.conciliacion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.conciliaciones_bancarias c
   WHERE c.tenant_id=p_tenant AND c.id=m.conciliacion_id AND c.cuenta_bancaria_id=p_bank))
  OR m.categoria IS DISTINCT FROM 'OTRO_INGRESO' OR m.metodo_pago IS DISTINCT FROM 'TRANSFERENCIA'
  OR m.operacion_bancaria_id IS NULL OR m.saldo_nuevo-m.saldo_anterior IS DISTINCT FROM m.monto THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND movimiento_bancario_id=p_movement;
 IF n<>1 THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO cm FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND movimiento_bancario_id=p_movement;
 IF cm.tipo IS DISTINCT FROM 'REEMBOLSO' OR cm.actor_id IS DISTINCT FROM m.created_by OR cm.moneda IS DISTINCT FROM bank.moneda
  OR cm.monto IS DISTINCT FROM m.monto OR m.idempotency_key IS DISTINCT FROM cm.idempotency_key||':bank' THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 trace:=app.supplier_credit_trace_606(p_tenant,cm.id);rate:=(cm.metadata->>'tipo_cambio_liquidacion')::numeric;
 amount_local:=(trace->>'target')::numeric;
 IF amount_local IS NULL OR amount_local<=0 OR amount_local<>round(amount_local,2)
  OR rate IS NULL OR rate<=0 OR rate::text IN('NaN','Infinity','-Infinity')
  OR m.tipo_cambio IS DISTINCT FROM round(rate,6) OR m.monto_moneda_local IS DISTINCT FROM amount_local
  OR round(m.monto*m.tipo_cambio,2)<>amount_local THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.operaciones_bancarias WHERE tenant_id=p_tenant AND id=m.operacion_bancaria_id;
 IF n<>1 THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO op FROM public.operaciones_bancarias WHERE tenant_id=p_tenant AND id=m.operacion_bancaria_id;
 canonical:=jsonb_build_object('cuenta_bancaria_id',p_bank,'cuenta_contrapartida_id',m.cuenta_contrapartida_id,
  'conciliacion_id',NULL,'tipo',m.tipo,'monto',m.monto,'fecha',m.fecha,'descripcion',m.descripcion,'referencia',m.referencia,
  'metodo_pago',m.metodo_pago,'categoria',m.categoria,'moneda',m.moneda,'tipo_cambio',round(m.tipo_cambio,6));
 IF op.tipo IS DISTINCT FROM 'MOVIMIENTO_MANUAL' OR op.actor_id IS DISTINCT FROM cm.actor_id
  OR op.idempotency_key IS DISTINCT FROM m.idempotency_key OR op.fingerprint IS DISTINCT FROM m.request_fingerprint
  OR op.fingerprint IS DISTINCT FROM app.bank_fingerprint_457(canonical)
  OR op.cuenta_origen_id IS DISTINCT FROM p_bank OR op.cuenta_contrapartida_id IS DISTINCT FROM m.cuenta_contrapartida_id
  OR op.conciliacion_id IS NOT NULL OR op.movimiento_origen_id IS DISTINCT FROM p_movement
  OR op.monto IS DISTINCT FROM m.monto OR op.moneda IS DISTINCT FROM m.moneda OR op.categoria IS DISTINCT FROM m.categoria
  OR op.resultado->'success' IS DISTINCT FROM 'true'::jsonb OR op.resultado->>'operacion_id' IS DISTINCT FROM op.id::text
  OR op.resultado->>'movimiento_id' IS DISTINCT FROM m.id::text OR op.resultado->>'event_id' IS DISTINCT FROM op.event_id::text
  OR op.resultado->>'cuenta_bancaria_id' IS DISTINCT FROM p_bank::text OR op.resultado->>'moneda' IS DISTINCT FROM bank.moneda
  OR (op.resultado->>'saldo_anterior')::numeric IS DISTINCT FROM m.saldo_anterior
  OR (op.resultado->>'saldo_nuevo')::numeric IS DISTINCT FROM m.saldo_nuevo OR (op.resultado->>'monto')::numeric IS DISTINCT FROM m.monto THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=op.event_id;
 IF n<>1 THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO event FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=op.event_id;
 IF event.event_type IS DISTINCT FROM 'banco.movimiento.registrado' OR event.aggregate_id IS DISTINCT FROM op.id::text
  OR event.payload->>'eventId' IS DISTINCT FROM event.event_id::text OR event.payload->>'tenantId' IS DISTINCT FROM p_tenant::text
  OR event.payload->>'operacionId' IS DISTINCT FROM op.id::text OR event.payload->>'movimientoId' IS DISTINCT FROM m.id::text
  OR event.payload->>'actorId' IS DISTINCT FROM cm.actor_id::text OR event.payload->>'cuentaBancariaId' IS DISTINCT FROM p_bank::text
  OR event.payload->>'cuentaBancoId' IS DISTINCT FROM bank.cuenta_contable_id::text
  OR event.payload->>'tipo' IS DISTINCT FROM 'ABONO' OR event.payload->>'categoria' IS DISTINCT FROM m.categoria
  OR event.payload->>'moneda' IS DISTINCT FROM bank.moneda
  OR event.payload->>'monedaLocal' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
  OR event.payload->'accountingHandledByOutbox' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(event.payload->'tipoCambio') IS DISTINCT FROM 'number'
  OR (event.payload->>'tipoCambio')::numeric IS DISTINCT FROM m.tipo_cambio THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 -- La traza606 ya comprobó evento bancario, origen del crédito, recibo de uso y
 -- contraparte422 contabilizada o pendiente. El helper600 comprueba banco/GL.
 RETURN jsonb_build_object('event',event.event_id,'carrying',amount_local,'rate',m.tipo_cambio,'creditMovement',cm.id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN
 RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION app.supplier_refund_bank_trace_608(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$ DECLARE definition text; old text; BEGIN
 definition:=pg_get_functiondef('app.bank_full_consumption_600(uuid,uuid,numeric,text)'::regprocedure);
 IF strpos(definition,'supplier_refund_bank_608')=0 THEN
 old:=$old$ settled numeric; bank_value numeric; posted numeric; difference numeric; rate numeric;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'BANK608_ANCHOR_0'; END IF;
 definition:=replace(definition,old,$new$ settled numeric; bank_value numeric; posted numeric; difference numeric; rate numeric; supplier_refund jsonb;$new$);
old:=$old$  IF m.activo IS NOT TRUE OR m.tipo IS NULL OR m.tipo NOT IN('ABONO','CARGO')$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'BANK608_ANCHOR_1'; END IF;
 definition:=replace(definition,old,$new$  -- supplier_refund_bank_608: sólo recibo457 enlazado al registro inmutable606.
  IF EXISTS(SELECT 1 FROM public.cxp_credito_proveedor_movimientos cm WHERE cm.tenant_id=p_tenant AND cm.movimiento_bancario_id=m.id) THEN
   supplier_refund:=app.supplier_refund_bank_trace_608(p_tenant,p_bank,m.id);
   v_event_uuid:=(supplier_refund->>'event')::uuid;bank_value:=(supplier_refund->>'carrying')::numeric;
   signed:=1;settled:=bank_value;rate:=(supplier_refund->>'rate')::numeric;
   IF v_event_uuid=ANY(sources) THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
   SELECT * INTO event FROM public.outbox_events WHERE tenant_id=p_tenant AND outbox_events.event_id=v_event_uuid;
  ELSE
  IF m.activo IS NOT TRUE OR m.tipo IS NULL OR m.tipo NOT IN('ABONO','CARGO')$new$);
old:=$old$  SELECT count(*) INTO journals FROM public.asientos_contables j WHERE j.tenant_id=p_tenant AND j.source_event_id=v_event_uuid;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'BANK608_ANCHOR_2'; END IF;
 definition:=replace(definition,old,$new$  END IF;
  SELECT count(*) INTO journals FROM public.asientos_contables j WHERE j.tenant_id=p_tenant AND j.source_event_id=v_event_uuid;$new$);
 EXECUTE definition; END IF;
END; $patch$;
COMMIT;
