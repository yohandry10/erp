BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Anulación de una CxP con contraasiento de su factura.
--
-- gestionar_cxp_tx (478) anula una CxP sin pagos y emite `cxp.anulada` con
-- accountingHandledByOutbox, pero ningún handler lo procesaba: la CxP quedaba
-- ANULADA y la 42, el IGV y la cuenta de compras de su factura seguían en el
-- libro. El evento caía a dead_letter por handler ausente.
--
-- La CxP es la factura de proveedor: su event_id es el de
-- `factura.proveedor.registrada` (payload.facturaProvId = cxp.id) y el asiento
-- de esa factura lleva source_event_id = cxp.event_id. La anulación invierte ese
-- asiento completo, enlazado con reversion_de_asiento_id (único por original),
-- en la fecha de anulación del país de la empresa.
--
-- Falla cerrado, a la vista, cuando no puede probar el efecto: CxP sin factura
-- contable (apertura de migración), asiento original ya revertido por otra vía
-- u otros asientos vivos ligados a la CxP (ajustes, pagos revertidos). Si el
-- asiento de la factura aún no existe, el error es reintentable.

-- El evento pasa al worker contable y a las guardas de período.
DO $classify$
DECLARE name text;definition text;
BEGIN
 FOREACH name IN ARRAY ARRAY['app.is_accounting_event_458(text)','app.is_accounting_owned_outbox_event_492(text)'] LOOP
  definition:=pg_get_functiondef(name::regprocedure);
  IF (length(definition)-length(replace(definition,'''recepcion.revertida'',','')))/length('''recepcion.revertida'',')<>1 THEN
   RAISE EXCEPTION 'CXP_CANCEL_ACCOUNTING_CLASSIFIER_SOURCE_CHANGED';END IF;
  EXECUTE replace(definition,'''recepcion.revertida'',','''recepcion.revertida'',''cxp.anulada'',');
 END LOOP;
END $classify$;

CREATE FUNCTION public.contabilizar_anulacion_cxp_620(p_tenant_id uuid,p_event_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;source public.outbox_events;debt public.cuentas_por_pagar;
 original public.asientos_contables;counter public.asientos_contables;details jsonb;created jsonb;replayed boolean:=false;
 fecha date;actor uuid;
BEGIN
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant_id AND event_id=p_event_id AND status='processing'
  AND claim_token=p_claim_token AND p_claim_token IS NOT NULL AND event_type='cxp.anulada' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CXP_CANCEL_ACCOUNTING_CLAIM_INVALID' USING ERRCODE='42501';END IF;
 SELECT * INTO debt FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant_id AND id=app.to_uuid_or_null(e.payload->>'cxpId') FOR UPDATE;
 IF debt.id IS NULL OR lower(debt.estado::text)<>'anulada' OR debt.anulado_at IS NULL
  OR e.aggregate_id IS DISTINCT FROM debt.id::text THEN
  RAISE EXCEPTION 'CXP_CANCEL_ACCOUNTING_MISMATCH' USING ERRCODE='23514';END IF;
 IF debt.event_id IS NULL THEN
  -- Apertura de migración u otra deuda sin factura contable propia: no hay
  -- asiento individual que invertir y el ajuste exige revisión contable.
  RAISE EXCEPTION 'CXP_CANCEL_ORIGIN_JOURNAL_UNKNOWN' USING ERRCODE='23514';END IF;
 SELECT * INTO source FROM public.outbox_events WHERE tenant_id=p_tenant_id AND event_id=debt.event_id;
 IF source.id IS NULL OR source.event_type<>'factura.proveedor.registrada'
  OR source.payload->>'facturaProvId' IS DISTINCT FROM debt.id::text THEN
  RAISE EXCEPTION 'CXP_CANCEL_ACCOUNTING_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO original FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND source_event_id=source.event_id FOR UPDATE;
 IF original.id IS NULL THEN RAISE EXCEPTION 'CXP_ORIGINAL_JOURNAL_PENDING' USING ERRCODE='P0002';END IF;
 IF original.estado<>'CONFIRMADO' OR original.total_debe<=0 OR original.total_debe<>original.total_haber THEN
  RAISE EXCEPTION 'CXP_ORIGINAL_JOURNAL_INVALID' USING ERRCODE='23514';END IF;
 PERFORM id FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id ORDER BY id FOR SHARE;
 SELECT * INTO counter FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND source_event_id=e.event_id FOR UPDATE;
 IF counter.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND reversion_de_asiento_id=original.id) THEN
   RAISE EXCEPTION 'CXP_ORIGINAL_JOURNAL_ALREADY_REVERSED' USING ERRCODE='23514';END IF;
  -- Otros asientos vivos de la misma CxP (ajustes fiscales, pagos revertidos)
  -- quedarían descuadrados si sólo se invierte la factura.
  IF EXISTS(SELECT 1 FROM public.outbox_events o JOIN public.asientos_contables a
     ON a.tenant_id=o.tenant_id AND a.source_event_id=o.event_id
    WHERE o.tenant_id=p_tenant_id AND o.event_id NOT IN(source.event_id,e.event_id)
     AND (o.aggregate_id=debt.id::text OR o.payload->>'cxpId'=debt.id::text OR o.payload->>'cxp_id'=debt.id::text
       OR o.payload->>'facturaId'=debt.id::text OR o.payload->>'facturaProvId'=debt.id::text)
     AND NOT EXISTS(SELECT 1 FROM public.asientos_contables r WHERE r.tenant_id=p_tenant_id AND r.reversion_de_asiento_id=a.id)) THEN
   RAISE EXCEPTION 'CXP_CANCEL_LINKED_JOURNALS_REVIEW' USING ERRCODE='23514';END IF;
  fecha:=(debt.anulado_at AT TIME ZONE app.zona_horaria_pais((SELECT t.pais FROM public.tenants t WHERE t.id=p_tenant_id)))::date;
  actor:=coalesce(app.to_uuid_or_null(e.payload->>'actorId'),app.to_uuid_or_null(debt.anulado_by));
  SELECT jsonb_agg(jsonb_build_object('cuenta_id',cuenta_id,'debe',haber,'haber',debe,'centro_costo_id',centro_costo_id,
    'concepto','Reversión: '||coalesce(concepto,'')) ORDER BY id) INTO details
   FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id;
  created:=public.crear_asiento_con_detalles_tx(p_tenant_id,jsonb_build_object('fecha',fecha::text,
    'concepto','Anulación de CxP '||debt.numero_documento,'referencia','REV-'||debt.numero_documento,
    'estado','CONFIRMADO','origen','CXP_ANULACION','source_event_id',e.event_id,'reversion_de_asiento_id',original.id,
    'created_by',actor,'confirmado_por',actor),details);
  SELECT * INTO counter FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND id=(created->>'id')::uuid;
 ELSE replayed:=true;END IF;
 IF counter.reversion_de_asiento_id IS DISTINCT FROM original.id OR counter.estado<>'CONFIRMADO'
  OR counter.total_debe<>original.total_haber OR counter.total_haber<>original.total_debe
  OR EXISTS((SELECT cuenta_id,centro_costo_id,haber,debe FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id)
    EXCEPT ALL (SELECT cuenta_id,centro_costo_id,debe,haber FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=counter.id))
  OR EXISTS((SELECT cuenta_id,centro_costo_id,debe,haber FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=counter.id)
    EXCEPT ALL (SELECT cuenta_id,centro_costo_id,haber,debe FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=original.id)) THEN
  RAISE EXCEPTION 'CXP_COUNTER_JOURNAL_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('success',true,'event_id',e.event_id,'cxp_id',debt.id,'original_event_id',source.event_id,
  'asiento_id',counter.id,'original_asiento_id',original.id,'total_debe',counter.total_debe::text,
  'total_haber',counter.total_haber::text,'idempotent',replayed);
END $fn$;
REVOKE ALL ON FUNCTION public.contabilizar_anulacion_cxp_620(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.contabilizar_anulacion_cxp_620(uuid,uuid,uuid) TO service_role;

COMMIT;
