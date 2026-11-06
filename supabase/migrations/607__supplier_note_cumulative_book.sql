-- NC proveedor: distribución acumulada desde factura y consumo de créditos nuevos.
-- Sin DML/backfill, cambios RLS ni permisos nuevos de clientes.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
-- La traza no llama al calculador CxP: también se usa al validar sus consumos.
CREATE OR REPLACE FUNCTION app.supplier_note_trace_607(p_tenant uuid,p_note uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE
 note public.cuentas_por_pagar%ROWTYPE; invoice public.cuentas_por_pagar%ROWTYPE;
 e public.outbox_events%ROWTYPE; op public.financial_master_operations%ROWTYPE; m public.cxp_credito_proveedor_movimientos%ROWTYPE;
 v jsonb; field text; n integer; payable uuid; credit_account uuid; tax_account uuid; counter uuid;
 debt_local numeric; credit_local numeric; base_local numeric; tax_local numeric; total_local numeric;
 debt_native numeric; credit_native numeric; rate numeric; posted record;
BEGIN
 SELECT * INTO note FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=p_note;
 IF NOT FOUND OR note.tipo_documento<>'NOTA_CREDITO' OR note.metadata->>'source' IS DISTINCT FROM 'SUPPLIER_CREDIT_NC_570'
  OR note.metadata->>'noteValuationVersion' IS DISTINCT FROM '607' THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO invoice FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=(note.metadata->>'factura_proveedor_id')::uuid;
 IF NOT FOUND OR invoice.proveedor_id IS DISTINCT FROM note.proveedor_id OR invoice.moneda IS DISTINCT FROM note.moneda THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=(note.metadata->>'accounting_event_id')::uuid;
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=(note.metadata->>'accounting_event_id')::uuid;
 v:=e.payload;rate:=CASE WHEN invoice.moneda=app.treasury_local_currency_452(p_tenant) THEN 1 ELSE invoice.tipo_cambio_origen END;
 SELECT id INTO payable FROM public.plan_cuentas WHERE tenant_id=p_tenant AND codigo='42' AND acepta_movimiento;
 SELECT id INTO credit_account FROM public.plan_cuentas WHERE tenant_id=p_tenant AND codigo='422' AND acepta_movimiento;
 SELECT id INTO tax_account FROM public.plan_cuentas WHERE tenant_id=p_tenant AND codigo='40' AND acepta_movimiento;
 SELECT id INTO counter FROM public.plan_cuentas WHERE tenant_id=p_tenant AND id=(note.metadata->>'cuenta_ajuste_id')::uuid
  AND codigo=v->>'cuentaAjusteCodigo' AND acepta_movimiento;
 IF payable IS NULL OR credit_account IS NULL OR counter IS NULL OR rate IS NULL OR rate<=0
  OR e.event_type IS DISTINCT FROM 'nota_credito.proveedor.registrada' OR e.aggregate_id IS DISTINCT FROM note.id::text
  OR e.status NOT IN('pending','processing','completed') OR (e.status='completed' AND e.processed_at IS NULL)
  OR v->>'noteValuationVersion' IS DISTINCT FROM '607' OR v->>'tenantId' IS DISTINCT FROM p_tenant::text
  OR v->>'eventId' IS DISTINCT FROM e.event_id::text OR v->>'notaCreditoId' IS DISTINCT FROM note.id::text
  OR v->>'facturaId' IS DISTINCT FROM invoice.id::text OR v->>'proveedorId' IS DISTINCT FROM note.proveedor_id::text
  OR v->>'moneda' IS DISTINCT FROM note.moneda OR v->>'monedaLocal' IS DISTINCT FROM app.treasury_local_currency_452(p_tenant)
  OR v->>'cuentaProveedorId' IS DISTINCT FROM payable::text OR v->>'cuentaCreditoId' IS DISTINCT FROM credit_account::text
  OR v->>'cuentaAjusteId' IS DISTINCT FROM counter::text OR (note.igv>0 AND v->>'cuentaIgvId' IS DISTINCT FROM tax_account::text)
  OR (v->>'tipoCambio')::numeric IS DISTINCT FROM rate OR (note.metadata->>'tipo_cambio_credito')::numeric IS DISTINCT FROM rate
  OR (v->>'subtotal')::numeric IS DISTINCT FROM note.subtotal OR (v->>'igv')::numeric IS DISTINCT FROM note.igv
  OR (v->>'total')::numeric IS DISTINCT FROM note.total OR note.subtotal+note.igv<>note.total THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY ARRAY['subtotal','igv','total','deudaReducida','creditoCreado','subtotalLocal','igvLocal','totalLocal','deudaReducidaLocal','creditoCreadoLocal'] LOOP
  IF jsonb_typeof(v->field) IS DISTINCT FROM 'number' OR (v->>field)::numeric<0
   OR (v->>field)::numeric::text IN('NaN','Infinity','-Infinity') OR (v->>field)::numeric<>round((v->>field)::numeric,2) THEN
   RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END LOOP;
 debt_native:=(v->>'deudaReducida')::numeric;credit_native:=(v->>'creditoCreado')::numeric;
 debt_local:=(v->>'deudaReducidaLocal')::numeric;credit_local:=(v->>'creditoCreadoLocal')::numeric;
 base_local:=(v->>'subtotalLocal')::numeric;tax_local:=(v->>'igvLocal')::numeric;total_local:=(v->>'totalLocal')::numeric;
 IF debt_native+credit_native<>note.total OR debt_local+credit_local<>total_local OR base_local+tax_local<>total_local
  OR total_local<=0 OR (debt_native=0 AND debt_local<>0) OR (credit_native=0 AND credit_local<>0)
  OR (note.subtotal=0 AND base_local<>0) OR (note.igv=0 AND tax_local<>0)
  OR note.metadata->'valuation_snapshot' IS DISTINCT FROM jsonb_build_object('base',base_local,'tax',tax_local,
    'total',total_local,'debt',debt_local,'credit',credit_local) THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.financial_master_operations WHERE tenant_id=p_tenant AND operation_type='SUPPLIER_CREDIT_NC' AND record_id=p_note;
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant AND operation_type='SUPPLIER_CREDIT_NC' AND record_id=p_note;
 IF op.actor_id IS DISTINCT FROM note.created_by OR op.idempotency_key IS DISTINCT FROM note.idempotency_key
  OR op.result->>'id' IS DISTINCT FROM p_note::text OR op.result->'metadata' IS DISTINCT FROM note.metadata
  OR (op.result->>'subtotal')::numeric IS DISTINCT FROM note.subtotal OR (op.result->>'igv')::numeric IS DISTINCT FROM note.igv
  OR (op.result->>'total')::numeric IS DISTINCT FROM note.total OR (op.result->>'saldo_credito_proveedor')::numeric IS DISTINCT FROM credit_native
  OR jsonb_typeof(note.metadata->'request_payload') IS DISTINCT FROM 'object'
  OR op.request_fingerprint IS DISTINCT FROM app.financial_master_fingerprint_477(note.metadata->'request_payload')
  OR note.metadata->'request_payload'->>'factura_id' IS DISTINCT FROM invoice.id::text
  OR note.metadata->'request_payload'->>'proveedor_id' IS DISTINCT FROM invoice.proveedor_id::text
  OR (note.metadata->'request_payload'->>'subtotal')::numeric IS DISTINCT FROM note.subtotal
  OR (note.metadata->'request_payload'->>'igv')::numeric IS DISTINCT FROM note.igv
  OR (note.metadata->'request_payload'->>'total')::numeric IS DISTINCT FROM note.total THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND nota_credito_id=p_note AND tipo='ORIGEN';
 IF credit_native=0 THEN
  IF n<>0 THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO m FROM public.cxp_credito_proveedor_movimientos WHERE tenant_id=p_tenant AND nota_credito_id=p_note AND tipo='ORIGEN';
  IF m.factura_id IS DISTINCT FROM invoice.id OR m.event_id IS DISTINCT FROM e.event_id OR m.actor_id IS DISTINCT FROM op.actor_id
   OR m.idempotency_key IS DISTINCT FROM op.idempotency_key OR m.moneda IS DISTINCT FROM note.moneda
   OR m.monto IS DISTINCT FROM credit_native OR m.saldo_anterior<>0 OR m.saldo_nuevo IS DISTINCT FROM credit_native THEN
   RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT count(*) INTO n FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=e.event_id;
 IF n=0 THEN
  IF e.status NOT IN('pending','processing') THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF n=1 THEN
  SELECT count(DISTINCT j.id) AS journals,coalesce(sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=payable),0) AS debt,
   coalesce(sum(d.debe-d.haber) FILTER(WHERE d.cuenta_id=credit_account),0) AS credit,
   coalesce(sum(d.haber-d.debe) FILTER(WHERE d.cuenta_id=counter),0) AS base,
   coalesce(sum(d.haber-d.debe) FILTER(WHERE d.cuenta_id=tax_account),0) AS tax,sum(d.debe-d.haber) AS difference INTO posted
  FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND j.source_event_id=e.event_id AND upper(j.estado::text)='CONFIRMADO';
  IF posted.journals<>1 OR posted.debt IS DISTINCT FROM debt_local OR posted.credit IS DISTINCT FROM credit_local
   OR posted.base IS DISTINCT FROM base_local OR posted.tax IS DISTINCT FROM tax_local OR posted.difference IS DISTINCT FROM 0 THEN
   RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('base',note.subtotal,'tax',note.igv,'total',note.total,'debt',debt_native,'credit',credit_native,
  'localBase',base_local,'localTax',tax_local,'localTotal',total_local,'localDebt',debt_local,'localCredit',credit_local,
  'cancel',note.metadata->'origin_cancelled','event',e.event_id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION app.supplier_note_trace_607(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.supplier_note_history_607(p_tenant uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE r record; trace jsonb; result jsonb:='{"base":0,"tax":0,"total":0,"debt":0,"credit":0,"localBase":0,"localTax":0,"localTotal":0,"localDebt":0,"localCredit":0,"keptBase":0,"keptTax":0,"keptTotal":0}'::jsonb; field text; cancelled boolean:=false;
BEGIN
 FOR r IN SELECT id FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND tipo_documento='NOTA_CREDITO'
  AND metadata->>'factura_proveedor_id'=p_invoice::text ORDER BY created_at,id LOOP
  IF cancelled THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  trace:=app.supplier_note_trace_607(p_tenant,r.id);
  FOREACH field IN ARRAY ARRAY['base','tax','total','debt','credit','localBase','localTax','localTotal','localDebt','localCredit'] LOOP
   result:=jsonb_set(result,ARRAY[field],to_jsonb((result->>field)::numeric+(trace->>field)::numeric));
  END LOOP;
  IF trace->'cancel'='true'::jsonb THEN
   cancelled:=true;result:=result||jsonb_build_object('keptBase',trace->'base','keptTax',trace->'tax','keptTotal',trace->'total');
  ELSIF trace->'cancel' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN result||jsonb_build_object('cancelled',cancelled);
END; $fn$;
REVOKE ALL ON FUNCTION app.supplier_note_history_607(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.supplier_note_book_607(p_tenant uuid,p_invoice uuid,p_base numeric,p_tax numeric,p_total numeric,p_debt numeric,p_credit numeric,p_rate numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE invoice public.cuentas_por_pagar%ROWTYPE; origin public.outbox_events%ROWTYPE; history jsonb;
 cap_base numeric; cap_tax numeric; cap_total numeric; debt_local numeric; credit_local numeric; total_local numeric; components numeric[]; posted record; n integer; field text;
BEGIN
 IF p_base IS NULL OR p_tax IS NULL OR p_total IS NULL OR p_debt IS NULL OR p_credit IS NULL OR p_rate IS NULL
  OR p_base<0 OR p_tax<0 OR p_total<=0 OR p_debt<0 OR p_credit<0 OR p_rate<=0
  OR p_base+p_tax<>p_total OR p_debt+p_credit<>p_total
  OR EXISTS(SELECT 1 FROM unnest(ARRAY[p_base,p_tax,p_total,p_debt,p_credit]) x WHERE x<>round(x,2) OR x::text IN('NaN','Infinity','-Infinity'))
  OR p_rate::text IN('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO invoice FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant AND id=p_invoice;
 -- En moneda funcional no hay conversión ni céntimos que redistribuir. Conserva
 -- el contrato nativo, incluidos ajustes tributarios posteriores a la factura.
 IF invoice.moneda=app.treasury_local_currency_452(p_tenant) THEN
  IF p_rate<>1 THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('base',p_base,'tax',p_tax,'total',p_total,'debt',p_debt,'credit',p_credit);
 END IF;
 SELECT count(*) INTO n FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=invoice.event_id AND event_type='factura.proveedor.registrada';
 IF n<>1 THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO origin FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=invoice.event_id;
 -- Ajustes fiscales y aperturas sin factura requieren su propia distribución verificable.
 FOREACH field IN ARRAY ARRAY['retencion','percepcion','detraccion','anticipo'] LOOP
  IF jsonb_typeof(origin.payload->field) IS DISTINCT FROM 'number' OR (origin.payload->>field)::numeric<>0 THEN
   RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END LOOP;
 history:=app.supplier_note_history_607(p_tenant,p_invoice);
 IF (history->>'cancelled')::boolean OR (history->>'base')::numeric+p_base>(origin.payload->>'subtotal')::numeric
  OR (history->>'tax')::numeric+p_tax>(origin.payload->>'igv')::numeric
  OR (history->>'total')::numeric+p_total>(origin.payload->>'total')::numeric THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 -- Esta llamada valida también origen, cabecera mutable y todos los pagos/notas previos.
 debt_local:=app.cxp_book_reduction_601(p_tenant,p_invoice,p_debt,p_rate);
 cap_base:=round((origin.payload->>'subtotal')::numeric*p_rate,2);cap_tax:=round((origin.payload->>'igv')::numeric*p_rate,2);cap_total:=round((origin.payload->>'total')::numeric*p_rate,2);
 IF cap_base+cap_tax<>cap_total THEN RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=origin.event_id;
 IF n>0 THEN
  SELECT coalesce(sum(d.debe-d.haber) FILTER(WHERE d.concepto IN('Mercaderías','Aplicación de mercadería recibida por facturar')),0) AS base,
   coalesce(sum(d.debe-d.haber) FILTER(WHERE d.concepto='IGV Crédito Fiscal'),0) AS tax INTO posted
  FROM public.asientos_contables j JOIN public.detalle_asientos d ON d.tenant_id=j.tenant_id AND d.asiento_id=j.id
  WHERE j.tenant_id=p_tenant AND j.source_event_id=origin.event_id AND upper(j.estado::text)='CONFIRMADO';
  IF posted.base IS DISTINCT FROM cap_base OR posted.tax IS DISTINCT FROM cap_tax THEN
   RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 -- Mientras sólo baja deuda, comparte el acumulador con pagos. Al crear crédito,
 -- el resto de la reversión documental absorbe la diferencia de redondeo.
 total_local:=CASE WHEN p_credit=0 THEN debt_local ELSE round(((history->>'total')::numeric+p_total)*p_rate,2)-(history->>'localTotal')::numeric END;
 credit_local:=total_local-debt_local;
 components:=app.rma_allocate_currency_cents_597(
  ARRAY[((history->>'base')::numeric+p_base)*p_rate*100,((history->>'tax')::numeric+p_tax)*p_rate*100],
  ARRAY[(history->>'localBase')::numeric*100,(history->>'localTax')::numeric*100],ARRAY[cap_base*100,cap_tax*100],((history->>'localTotal')::numeric+total_local)*100);
 IF total_local<=0 OR credit_local<0 OR components[1]+components[2]<>total_local
  OR (p_credit=0 AND credit_local<>0) OR (p_debt=0 AND debt_local<>0)
  OR (p_base=0 AND components[1]<>0) OR (p_tax=0 AND components[2]<>0) THEN
  RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('base',components[1],'tax',components[2],'total',total_local,'debt',debt_local,'credit',credit_local);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514';
END; $fn$;
REVOKE ALL ON FUNCTION app.supplier_note_book_607(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$ DECLARE definition text; old text; BEGIN
definition:=pg_get_functiondef('public.registrar_nota_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure);
IF strpos(definition,'supplier_note_cumulative_607')=0 THEN
 old:=$old$  v_original_rate numeric;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_0_0'; END IF;
 definition:=replace(definition,old,$new$  v_original_rate numeric; v_valuation jsonb;$new$);
 old:=$old$  PERFORM set_config('app.supplier_credit_writer_570','on',true);$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_0_1'; END IF;
 definition:=replace(definition,old,$new$  -- supplier_note_cumulative_607: invoice FOR UPDATE ya adquirido.
  v_valuation:=app.supplier_note_book_607(p_tenant_id,v_invoice.id,v_base,v_tax_amount,v_total,least(v_old_balance,v_total),v_credit,v_original_rate);
  PERFORM set_config('app.supplier_credit_writer_570','on',true);$new$);
 old:=$old$'tipo_cambio_credito',v_original_rate,'accounting_event_id',v_event)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_0_2'; END IF;
 definition:=replace(definition,old,$new$'tipo_cambio_credito',v_original_rate,'accounting_event_id',v_event,
      'noteValuationVersion',607,'valuation_snapshot',v_valuation,'request_payload',v_payload,'origin_cancelled',v_cancel)$new$);
 old:=$old$'cuentaProveedorId',v_payable.id,'cuentaCreditoId',v_advance.id,'cuentaIgvId',v_tax.id)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_0_3'; END IF;
 definition:=replace(definition,old,$new$'cuentaProveedorId',v_payable.id,'cuentaCreditoId',v_advance.id,'cuentaIgvId',v_tax.id,
      'noteValuationVersion',607,'monedaLocal',app.treasury_local_currency_452(p_tenant_id),
      'subtotalLocal',(v_valuation->>'base')::numeric,'igvLocal',(v_valuation->>'tax')::numeric,
      'totalLocal',(v_valuation->>'total')::numeric,'deudaReducidaLocal',(v_valuation->>'debt')::numeric,
      'creditoCreadoLocal',(v_valuation->>'credit')::numeric)$new$);
 EXECUTE definition; END IF;
definition:=pg_get_functiondef('app.cxp_book_reduction_601(uuid,uuid,numeric,numeric)'::regprocedure);
IF strpos(definition,'supplier_note_cumulative_607')=0 THEN
 old:=$old$ event_count integer; journals integer; item text;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_1_0'; END IF;
 definition:=replace(definition,old,$new$ event_count integer; journals integer; item text; note_history jsonb;$new$);
 old:=$old$  IF (origin.payload->>'total')::numeric IS DISTINCT FROM debt.total
   OR (origin.payload->>'subtotal')::numeric IS DISTINCT FROM debt.subtotal
   OR (origin.payload->>'igv')::numeric IS DISTINCT FROM debt.igv$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_1_1'; END IF;
 definition:=replace(definition,old,$new$  -- supplier_note_cumulative_607: sólo una cadena de NC verificable explica cambios de cabecera.
  note_history:=app.supplier_note_history_607(p_tenant,p_cxp);
  IF (origin.payload->>'total')::numeric-(note_history->>'total')::numeric+(note_history->>'keptTotal')::numeric IS DISTINCT FROM debt.total
   OR (origin.payload->>'subtotal')::numeric-(note_history->>'base')::numeric+(note_history->>'keptBase')::numeric IS DISTINCT FROM debt.subtotal
   OR (origin.payload->>'igv')::numeric-(note_history->>'tax')::numeric+(note_history->>'keptTax')::numeric IS DISTINCT FROM debt.igv
   OR (note_history->>'cancelled')::boolean IS DISTINCT FROM coalesce((debt.metadata->>'cancelada_por_nota_credito')::boolean,false)$new$);
 old:=$old$ pending:=coalesce(debt.saldo,debt.saldo_pendiente);$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_1_2'; END IF;
 definition:=replace(definition,old,$new$ used_native:=used_native+coalesce((note_history->>'debt')::numeric,0);
 used_local:=used_local+coalesce((note_history->>'localDebt')::numeric,0);
 pending:=coalesce(debt.saldo,debt.saldo_pendiente);$new$);
 EXECUTE definition; END IF;
definition:=pg_get_functiondef('app.supplier_credit_book_606(uuid,uuid,numeric)'::regprocedure);
IF strpos(definition,'supplier_note_cumulative_607')=0 THEN
 old:=$old$ initial_native:=created.monto;initial_local:=round(initial_native*rate,2);$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_2_0'; END IF;
 definition:=replace(definition,old,$new$ initial_native:=created.monto;initial_local:=round(initial_native*rate,2);
 -- supplier_note_cumulative_607: el nuevo origen puede llevar otro céntimo asignado.
 IF note.metadata->>'noteValuationVersion'='607' THEN
  trace:=app.supplier_note_trace_607(p_tenant,p_note);initial_local:=(trace->>'localCredit')::numeric;
 END IF;$new$);
 old:=$old$ SELECT * INTO origin FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=created.event_id;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_2_1'; END IF;
 definition:=replace(definition,old,$new$ SELECT * INTO origin FROM public.outbox_events WHERE tenant_id=p_tenant AND event_id=created.event_id;
 IF (origin.payload ? 'noteValuationVersion' OR note.metadata ? 'noteValuationVersion')
  AND (origin.payload->>'noteValuationVersion' IS DISTINCT FROM '607' OR note.metadata->>'noteValuationVersion' IS DISTINCT FROM '607') THEN
  RAISE EXCEPTION 'SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;$new$);
 old:=$old$ IF op.idempotency_key IS DISTINCT FROM created.idempotency_key OR op.actor_id IS DISTINCT FROM created.actor_id$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_2_2'; END IF;
 definition:=replace(definition,old,$new$ IF op.result->'metadata'->>'noteValuationVersion' IS DISTINCT FROM note.metadata->>'noteValuationVersion'
  OR op.idempotency_key IS DISTINCT FROM created.idempotency_key OR op.actor_id IS DISTINCT FROM created.actor_id$new$);
 old:=$old$OR used_local<>round(used_native*rate,2)$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_2_3'; END IF;
 definition:=replace(definition,old,$new$OR used_local<>(CASE WHEN note.metadata->>'noteValuationVersion'='607' THEN round(used_native*initial_local/initial_native,2) ELSE round(used_native*rate,2) END)$new$);
 old:=$old$ result:=round((used_native+p_amount)*rate,2)-used_local;$old$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'NOTE607_ANCHOR_2_4'; END IF;
 definition:=replace(definition,old,$new$ result:=CASE WHEN used_native+p_amount=initial_native THEN initial_local WHEN note.metadata->>'noteValuationVersion'='607' THEN round((used_native+p_amount)*initial_local/initial_native,2) ELSE round((used_native+p_amount)*rate,2) END-used_local;$new$);
 EXECUTE definition; END IF;
END; $patch$;
COMMIT;
