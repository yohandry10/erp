BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

-- Asigna dos componentes acumulados en centavos, conservando lo ya reconocido
-- y los límites del origen. Devuelve sólo el incremento en moneda funcional.
CREATE OR REPLACE FUNCTION app.rma_allocate_currency_cents_597(
 p_exact numeric[],p_previous numeric[],p_caps numeric[],p_target numeric
) RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
 allocated numeric[]:=ARRAY[0,0]::numeric[];
 assigned boolean[]:=ARRAY[false,false];
 difference integer; selected integer; i integer; n integer;
BEGIN
 IF array_length(p_exact,1) IS DISTINCT FROM 2
  OR array_length(p_previous,1) IS DISTINCT FROM 2
  OR array_length(p_caps,1) IS DISTINCT FROM 2
  OR array_ndims(p_exact)<>1 OR array_ndims(p_previous)<>1 OR array_ndims(p_caps)<>1
  OR array_lower(p_exact,1)<>1 OR array_lower(p_previous,1)<>1 OR array_lower(p_caps,1)<>1
  OR p_target IS NULL OR p_target::text IN ('NaN','Infinity','-Infinity')
  OR p_target<0 OR p_target<>round(p_target)
  OR EXISTS(SELECT 1 FROM unnest(p_exact||p_previous||p_caps) x
   WHERE x IS NULL OR x::text IN ('NaN','Infinity','-Infinity') OR x<0) THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514';
 END IF;
 FOR i IN 1..2 LOOP
  IF p_previous[i]<>round(p_previous[i]) OR p_caps[i]<>round(p_caps[i])
   OR p_previous[i]>p_caps[i] THEN
   RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  allocated[i]:=greatest(p_previous[i],least(p_caps[i],floor(p_exact[i])));
 END LOOP;
 IF p_target<p_previous[1]+p_previous[2] OR p_target>p_caps[1]+p_caps[2]
  OR abs(p_target-allocated[1]-allocated[2])>2 THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 difference:=(p_target-allocated[1]-allocated[2])::integer;
 FOR n IN 1..abs(difference) LOOP
  selected:=NULL;
  IF difference>0 THEN
   SELECT s.i INTO selected FROM generate_series(1,2) s(i)
   WHERE NOT assigned[s.i] AND allocated[s.i]<p_caps[s.i]
   ORDER BY p_exact[s.i]-floor(p_exact[s.i]) DESC,s.i LIMIT 1;
  ELSE
   SELECT s.i INTO selected FROM generate_series(1,2) s(i)
   WHERE NOT assigned[s.i] AND allocated[s.i]>p_previous[s.i]
   ORDER BY p_exact[s.i]-floor(p_exact[s.i]),s.i DESC LIMIT 1;
  END IF;
  IF selected IS NULL THEN
   RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  allocated[selected]:=allocated[selected]+sign(difference);
  assigned[selected]:=true;
 END LOOP;
 RETURN ARRAY[(allocated[1]-p_previous[1])/100,(allocated[2]-p_previous[2])/100];
END;
$fn$;

CREATE OR REPLACE FUNCTION app.rma_currency_credit_597(
 p_tenant uuid,p_document uuid,p_base numeric,p_tax numeric,p_total numeric,
 p_reduction numeric,p_excess numeric,p_rate numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE
 source public.documentos%ROWTYPE;
 prior record; cap_base numeric; cap_tax numeric; cap_total numeric;
 target numeric; components numeric[]; financial numeric[];
BEGIN
 SELECT * INTO STRICT source FROM public.documentos
 WHERE tenant_id=p_tenant AND id=p_document;
 IF p_rate IS NULL OR p_rate::text IN ('NaN','Infinity','-Infinity') OR p_rate<=0
  OR p_rate IS DISTINCT FROM source.tipo_cambio THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 cap_total:=round(source.total*p_rate,2);
 -- Los límites funcionales son las partidas de la venta ya contabilizada.
 -- Una factura histórica registrada en USD nominales como si fueran PEN exige
 -- revisión; no se genera una reversión mayor que su asiento original.
 SELECT coalesce(sum(CASE WHEN pc.codigo LIKE '70%' THEN da.haber-da.debe ELSE 0 END),0),
  coalesce(sum(CASE WHEN pc.codigo LIKE '40%' THEN da.haber-da.debe ELSE 0 END),0)
 INTO cap_base,cap_tax
 FROM public.cpe c
 JOIN public.asientos_contables a ON a.id=app.validar_contabilidad_origen_anulacion_cpe_448(p_tenant,c.id)
  AND a.tenant_id=p_tenant AND upper(a.estado::text)='CONFIRMADO'
 JOIN public.detalle_asientos da ON da.asiento_id=a.id AND da.tenant_id=p_tenant
 JOIN public.plan_cuentas pc ON pc.id=da.cuenta_id AND pc.tenant_id=p_tenant
 WHERE c.documento_id=p_document AND c.tenant_id=p_tenant AND c.tipo_documento IN ('01','03');
 IF cap_base+cap_tax<>cap_total OR cap_base<0 OR cap_tax<0
  OR abs(cap_base-round(source.subtotal*p_rate,2))>.01
  OR abs(cap_tax-round((coalesce(source.impuesto_igv,0)+coalesce(source.impuesto_isc,0))*p_rate,2))>.01
  OR p_base+p_tax<>p_total
  OR p_reduction+p_excess<>p_total THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) AS rows,count(DISTINCT r.id) AS rmas,count(o.id) AS events,
  coalesce(sum(d.subtotal),0) AS base,
  coalesce(sum(coalesce(d.impuesto_igv,0)+coalesce(d.impuesto_isc,0)),0) AS tax,
  coalesce(sum(d.total),0) AS total,
  coalesce(sum((r.metadata->>'cxc_reduction')::numeric),0) AS reduction,
  coalesce(sum((r.metadata->>'customer_credit_balance')::numeric),0) AS excess,
  coalesce(sum((o.payload->>'base_imponible')::numeric),0) AS local_base,
  coalesce(sum((o.payload->>'igv')::numeric),0) AS local_tax,
  coalesce(sum((o.payload->>'total')::numeric),0) AS local_total,
  coalesce(sum((o.payload->>'cxcReduction')::numeric),0) AS local_reduction,
  coalesce(sum((o.payload->>'customerCreditBalance')::numeric),0) AS local_excess,
  coalesce(bool_and(coalesce(d.moneda=source.moneda AND d.tipo_cambio=p_rate
   AND o.payload->>'source'='rma.nota_credito.atomic'
   AND (o.payload->>'tipoCambio')::numeric=p_rate
   AND (o.payload->>'totalDocumento')::numeric=d.total
   AND o.payload ?& ARRAY['base_imponible','igv','total','cxcReduction','customerCreditBalance']
   AND r.metadata ?& ARRAY['cxc_reduction','customer_credit_balance']
   AND jsonb_typeof(o.payload->'base_imponible')='number'
   AND jsonb_typeof(o.payload->'igv')='number'
   AND jsonb_typeof(o.payload->'total')='number'
   AND jsonb_typeof(o.payload->'cxcReduction')='number'
   AND jsonb_typeof(o.payload->'customerCreditBalance')='number',false)),true) AS valid
 INTO prior FROM public.rma_solicitudes r
 JOIN public.documentos d ON d.id=r.nota_credito_documento_id AND d.tenant_id=r.tenant_id
 LEFT JOIN public.rma_operaciones op ON op.rma_id=r.id AND op.tenant_id=r.tenant_id
  AND op.tipo='EMITIR_NOTA_CREDITO'
 LEFT JOIN public.outbox_events o ON o.event_id=op.event_id AND o.tenant_id=r.tenant_id
  AND o.event_type='nota_credito.emitida'
 WHERE r.tenant_id=p_tenant AND r.documento_origen_id=p_document
  AND r.nota_credito_documento_id IS NOT NULL;
 IF prior.rows<>prior.rmas OR prior.rows<>prior.events OR NOT prior.valid
  OR prior.base+prior.tax<>prior.total OR prior.reduction+prior.excess<>prior.total
  OR prior.local_base+prior.local_tax<>prior.local_total
  OR prior.local_reduction+prior.local_excess<>prior.local_total
  OR prior.local_total<>round(prior.total*p_rate,2)
  OR prior.local_reduction<>round(prior.reduction*p_rate,2)
  OR prior.base+p_base>source.subtotal
  OR prior.tax+p_tax>coalesce(source.impuesto_igv,0)+coalesce(source.impuesto_isc,0)
  OR prior.total+p_total>source.total THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 target:=round((prior.total+p_total)*p_rate,2)*100;
 components:=app.rma_allocate_currency_cents_597(
  ARRAY[(prior.base+p_base)*p_rate*100,(prior.tax+p_tax)*p_rate*100],
  ARRAY[prior.local_base*100,prior.local_tax*100],ARRAY[cap_base*100,cap_tax*100],target);
 -- La deuda reconocida conserva su valuación acumulada al tipo de origen.
 -- El resto pertenece al saldo a favor; no puede inventarse otro céntimo de CxC
 -- mientras sólo aumenta la devolución que genera saldo a favor.
 financial:=ARRAY[round((prior.reduction+p_reduction)*p_rate,2)-prior.local_reduction,0];
 financial[2]:=components[1]+components[2]-financial[1];
 IF financial[1]<0 OR financial[2]<0
  OR (p_reduction=0 AND financial[1]<>0)
  OR (p_excess=0 AND financial[2]<>0)
  OR (p_excess>0 AND financial[2]<=0) THEN
  RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('base',components[1],'tax',components[2],
  'total',components[1]+components[2],'reduction',financial[1],'excess',financial[2]);
END;
$fn$;
REVOKE ALL ON FUNCTION app.rma_allocate_currency_cents_597(numeric[],numeric[],numeric[],numeric),
 app.rma_currency_credit_597(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric)
 FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE
 definition text;
 declaration text:='  v_result jsonb;';
 anchor text:='  v_pending_new := round(v_pending - v_reduction, 2);';
 old_local text:=$old$  v_tipo_cambio := coalesce(nullif(v_documento.tipo_cambio, 0), 1);
  v_local_base := round(v_subtotal * v_tipo_cambio, 2);
  v_local_tax := round((v_igv + v_isc) * v_tipo_cambio, 2);
  v_local_total := round(v_total * v_tipo_cambio, 2);
  v_local_reduction := round(v_reduction * v_tipo_cambio, 2);
  v_local_excess := round(v_local_total - v_local_reduction, 2);$old$;
 new_local text:=$new$
  -- cumulative_currency_rounding_597: lock del documento origen ya adquirido.
  v_tipo_cambio := coalesce(nullif(v_documento.tipo_cambio,0),1);
  IF upper(coalesce(v_documento.moneda,'PEN'))<>'PEN' THEN
    v_currency_allocation := app.rma_currency_credit_597(p_tenant_id,v_documento.id,
      v_subtotal,v_igv+v_isc,v_total,v_reduction,v_excess,v_tipo_cambio);
    v_local_base := (v_currency_allocation->>'base')::numeric;
    v_local_tax := (v_currency_allocation->>'tax')::numeric;
    v_local_total := (v_currency_allocation->>'total')::numeric;
    v_local_reduction := (v_currency_allocation->>'reduction')::numeric;
    v_local_excess := (v_currency_allocation->>'excess')::numeric;
  ELSE
    IF v_tipo_cambio<>1 THEN
      RAISE EXCEPTION 'RMA_FX_CREDIT_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
    v_local_base := v_subtotal;
    v_local_tax := v_igv+v_isc;
    v_local_total := v_total;
    v_local_reduction := v_reduction;
    v_local_excess := v_excess;
  END IF;
$new$;
 old_balance text:=$balance$      round(v_excess * coalesce(nullif(v_documento.tipo_cambio, 0), 1), 2),
      round(v_excess * coalesce(nullif(v_documento.tipo_cambio, 0), 1), 2),$balance$;
BEGIN
 definition:=pg_get_functiondef('public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'cumulative_currency_rounding_597')=0 THEN
  IF strpos(definition,'cumulative_credit_rounding_596')=0
   OR (length(definition)-length(replace(definition,declaration,'')))/length(declaration)<>1
   OR (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
   OR (length(definition)-length(replace(definition,old_local,'')))/length(old_local)<>1
   OR (length(definition)-length(replace(definition,old_balance,'')))/length(old_balance)<>1 THEN
   RAISE EXCEPTION 'RMA_597_LEGACY_DEFINITION_UNEXPECTED'; END IF;
  definition:=replace(definition,declaration,declaration||E'\n  v_currency_allocation jsonb;');
  definition:=replace(definition,old_local,'');
  definition:=replace(definition,anchor,anchor||new_local);
  definition:=replace(definition,old_balance,E'      v_local_excess,\n      v_local_excess,');
  EXECUTE definition;
 END IF;
END;
$patch$;
COMMIT;
