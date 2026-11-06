-- Consumir el valor contable verificable cuando un pago agota el banco en divisa.
-- No cambia liquidación, cotizaciones ni históricos. Historias no demostrables
-- requieren revisión antes de mover deuda/banco. Sin DML ni backfill.
BEGIN;
CREATE OR REPLACE FUNCTION app.bank_full_consumption_600(p_tenant uuid,p_bank uuid,p_amount numeric,p_local text)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $fn$
DECLARE
 bank public.cuentas_bancarias%ROWTYPE; m public.movimientos_bancarios%ROWTYPE;
 event public.outbox_events%ROWTYPE; v_event_uuid uuid; sources uuid[]:=ARRAY[]::uuid[];
 n integer; journals integer; signed integer; native numeric:=0; carrying numeric:=0;
 settled numeric; bank_value numeric; posted numeric; difference numeric; rate numeric;
BEGIN
 SELECT * INTO bank FROM public.cuentas_bancarias WHERE tenant_id=p_tenant AND id=p_bank FOR UPDATE;
 IF NOT FOUND OR p_amount IS NULL OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount<>round(p_amount,2)
  OR p_amount IS DISTINCT FROM bank.saldo OR bank.saldo IS DISTINCT FROM bank.saldo_actual
  OR bank.moneda=p_local OR p_local IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
  OR coalesce(bank.saldo_inicial,0)<>0 OR bank.cuenta_contable_id IS NULL THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 -- Sin identificador de banco en el detalle no es demostrable un mayor compartido.
 SELECT count(*) INTO n FROM public.cuentas_bancarias
 WHERE tenant_id=p_tenant AND cuenta_contable_id=bank.cuenta_contable_id;
 IF n<>1 THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR m IN SELECT * FROM public.movimientos_bancarios
  WHERE tenant_id=p_tenant AND cuenta_bancaria_id=p_bank ORDER BY created_at,id LOOP
  IF m.activo IS NOT TRUE OR m.tipo IS NULL OR m.tipo NOT IN('ABONO','CARGO') OR m.monto IS NULL OR m.monto::text IN('NaN','Infinity','-Infinity') OR m.monto<=0
   OR m.metadata->>'moneda_local' IS DISTINCT FROM p_local
   OR jsonb_typeof(m.metadata->'monto_liquidacion') IS DISTINCT FROM 'number'
   OR jsonb_typeof(m.metadata->'tipo_cambio_liquidacion') IS DISTINCT FROM 'number'
   OR coalesce(m.metadata->>'event_id','') !~ '^[a-f0-9-]{36}$' THEN
   RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  v_event_uuid:=(m.metadata->>'event_id')::uuid; settled:=(m.metadata->>'monto_liquidacion')::numeric;
  rate:=(m.metadata->>'tipo_cambio_liquidacion')::numeric;
  bank_value:=coalesce((m.metadata->>'monto_contable_banco')::numeric,settled);
  signed:=CASE m.tipo WHEN 'ABONO' THEN 1 ELSE -1 END;
  IF settled<=0 OR settled<>round(settled,2) OR rate<=0 OR settled<>round(m.monto*rate,2)
   OR bank_value<=0 OR bank_value<>round(bank_value,2) OR v_event_uuid=ANY(sources) THEN
   RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND outbox_events.event_id=v_event_uuid;
  IF n<>1 THEN RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO event FROM public.outbox_events WHERE tenant_id=p_tenant AND outbox_events.event_id=v_event_uuid;
  IF event.event_type IS DISTINCT FROM (CASE m.tipo WHEN 'ABONO' THEN 'cobro.registrado' ELSE 'pago.proveedor.registrado' END)
   OR event.status NOT IN('pending','processing','completed')
   OR (event.status='completed' AND event.processed_at IS NULL)
   OR event.payload->>'cuentaBancariaId' IS DISTINCT FROM p_bank::text
   OR event.payload->>'moneda' IS DISTINCT FROM bank.moneda
   OR event.payload->>'monedaLocal' IS DISTINCT FROM p_local
   OR jsonb_typeof(event.payload->'monto') IS DISTINCT FROM 'number'
   OR jsonb_typeof(event.payload->'montoLiquidacion') IS DISTINCT FROM 'number'
   OR jsonb_typeof(event.payload->'montoContabilizado') IS DISTINCT FROM 'number'
   OR jsonb_typeof(m.metadata->'monto_contabilizado') IS DISTINCT FROM 'number'
   OR (event.payload->>'monto')::numeric IS DISTINCT FROM m.monto
   OR (event.payload->>'montoLiquidacion')::numeric IS DISTINCT FROM settled
   OR coalesce((event.payload->>'montoContableBanco')::numeric,settled) IS DISTINCT FROM bank_value
   OR (event.payload->>'montoContabilizado')::numeric IS DISTINCT FROM (m.metadata->>'monto_contabilizado')::numeric
   OR (bank_value<>settled AND (event.payload->>'bankValuationVersion' IS DISTINCT FROM '600'
     OR m.tipo<>'CARGO' OR (event.payload->>'cuentaSaldoNuevo')::numeric IS DISTINCT FROM 0)) THEN
   RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO journals FROM public.asientos_contables j WHERE j.tenant_id=p_tenant AND j.source_event_id=v_event_uuid;
  IF journals=0 THEN
   -- Snapshot durable: no depender del orden del consumidor de outbox.
   IF event.status NOT IN('pending','processing') THEN
    RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSIF journals=1 THEN
   SELECT sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=bank.cuenta_contable_id),sum(d.debe-d.haber)
   INTO posted,difference FROM public.asientos_contables j
   JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
   WHERE j.tenant_id=p_tenant AND j.source_event_id=v_event_uuid AND upper(j.estado::text)='CONFIRMADO';
   IF posted IS DISTINCT FROM signed*bank_value OR difference IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  native:=native+signed*m.monto; carrying:=carrying+signed*bank_value;
  sources:=array_append(sources,v_event_uuid);
 END LOOP;
 IF native IS DISTINCT FROM bank.saldo OR carrying<=0 OR EXISTS(
  SELECT 1 FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND d.cuenta_id=bank.cuenta_contable_id AND upper(j.estado::text)='CONFIRMADO'
   AND (j.source_event_id IS NULL OR NOT(j.source_event_id=ANY(sources)))) THEN
  RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN round(carrying,2);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'BANK_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END;
$fn$;
REVOKE ALL ON FUNCTION app.bank_full_consumption_600(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE definition text; old text; replacement text;
BEGIN
 definition:=pg_get_functiondef('app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)'::regprocedure);
 IF strpos(definition,'bank_full_consumption_600')=0 THEN
  old:='  v_diferencia numeric(18,2);';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'BANK_600_DECLARATION_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||E'\n  v_monto_contable_banco numeric(18,2);\n  v_ajuste_banco numeric(18,2) := 0;');
  old:=$old$    INSERT INTO public.movimientos_bancarios ($old$;
  replacement:=$new$    -- bank_full_consumption_600: banco bloqueado; liquidación original intacta.
    IF v_moneda<>v_moneda_local AND v_banco_nuevo=0 THEN
      v_monto_contable_banco:=app.bank_full_consumption_600(p_tenant_id,v_cuenta_id,v_monto,v_moneda_local);
      v_ajuste_banco:=round(v_monto_contable_banco-v_monto_liquidacion,2);
    END IF;

    INSERT INTO public.movimientos_bancarios ($new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'BANK_600_WRITER_UNEXPECTED'; END IF;
  definition:=replace(definition,old,replacement);
  old:=$old$'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>3 THEN RAISE EXCEPTION 'BANK_600_METADATA_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||$new$,
        'monto_contable_banco', v_monto_contable_banco, 'ajuste_valor_banco', v_ajuste_banco$new$);
  old:=$old$'montoLiquidacion', v_monto_liquidacion,$old$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'BANK_600_EVENT_UNEXPECTED'; END IF;
  definition:=replace(definition,old,old||$new$
      'montoContableBanco', v_monto_contable_banco, 'ajusteValorBanco', v_ajuste_banco,
      'bankValuationVersion', CASE WHEN v_monto_contable_banco IS NOT NULL THEN 600 ELSE NULL END,$new$);
  EXECUTE definition;
 END IF;
END;
$patch$;
COMMIT;
