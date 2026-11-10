BEGIN;

-- Private evidence captured by the close transaction. No rates are inferred
-- for foreign currency, and no historical receipt or journal is rewritten.
CREATE TABLE app.receipt_valuation_617 (
 tenant_id uuid NOT NULL,receipt_id uuid NOT NULL,order_id uuid NOT NULL,actor_id uuid NOT NULL,
 currency text NOT NULL,base_currency text NOT NULL,exchange_rate numeric(18,6) NOT NULL CHECK(exchange_rate>0),
 rate_reference text,request jsonb NOT NULL,items jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,receipt_id),CHECK(currency ~ '^[A-Z]{3}$' AND base_currency ~ '^[A-Z]{3}$'),
 CHECK((currency=base_currency AND exchange_rate=1) OR (currency<>base_currency AND length(btrim(rate_reference)) BETWEEN 5 AND 200))
);
CREATE TABLE app.receipt_source_617 (
 tenant_id uuid NOT NULL,receipt_id uuid NOT NULL,event_id uuid NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,receipt_id),UNIQUE(tenant_id,event_id),
 FOREIGN KEY(tenant_id,receipt_id) REFERENCES app.receipt_valuation_617(tenant_id,receipt_id)
);
CREATE TABLE app.receipt_write_617 (
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,tenant_id uuid NOT NULL,receipt_id uuid NOT NULL,
 event_id uuid,claim_token uuid,PRIMARY KEY(backend_pid,transaction_id,tenant_id,receipt_id)
);
DO $private$ DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['receipt_valuation_617','receipt_source_617','receipt_write_617'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY private_617 ON app.%I USING(false) WITH CHECK(false)',tab);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,anon,authenticated,service_role',tab);
 END LOOP;
END $private$;
CREATE FUNCTION app.receipt_evidence_immutable_617() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'RECEIPT_VALUATION_IMMUTABLE' USING ERRCODE='23514';END $fn$;
CREATE TRIGGER receipt_valuation_immutable_617 BEFORE UPDATE OR DELETE ON app.receipt_valuation_617
 FOR EACH ROW EXECUTE FUNCTION app.receipt_evidence_immutable_617();
CREATE TRIGGER receipt_source_immutable_617 BEFORE UPDATE OR DELETE ON app.receipt_source_617
 FOR EACH ROW EXECUTE FUNCTION app.receipt_evidence_immutable_617();

ALTER FUNCTION public.cerrar_recepcion_tx(uuid,uuid,text,text) SET SCHEMA app;
ALTER FUNCTION app.cerrar_recepcion_tx(uuid,uuid,text,text) RENAME TO close_receipt_core_617;
REVOKE ALL ON FUNCTION app.close_receipt_core_617(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app.close_receipt_617(p_receipt uuid,p_tenant uuid,p_actor uuid,p_notes text,p_valuation jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE r public.recepciones;o public.ordenes_compra;v app.receipt_valuation_617;e public.outbox_events;
 base text;currency text;rate numeric;reference text;req jsonb;items jsonb;answer jsonb;count_events integer;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 IF p_valuation IS NULL OR jsonb_typeof(p_valuation)<>'object' OR EXISTS(
  SELECT 1 FROM jsonb_object_keys(p_valuation) k WHERE k NOT IN('moneda','moneda_base','tipo_cambio','referencia')) THEN
  RAISE EXCEPTION 'RECEIPT_VALUATION_INPUT_INVALID' USING ERRCODE='22023';END IF;
 req:=jsonb_build_object('actor_id',p_actor,'observaciones',p_notes,'valuacion',p_valuation);
 SELECT * INTO r FROM public.recepciones WHERE id=p_receipt AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_NOT_FOUND' USING ERRCODE='P0002';END IF;
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 SELECT * INTO v FROM app.receipt_valuation_617 WHERE tenant_id=p_tenant AND receipt_id=p_receipt;
 IF upper(r.estado::text)='CERRADA' THEN
  IF v.receipt_id IS NOT NULL AND v.request IS DISTINCT FROM req THEN
   RAISE EXCEPTION 'RECEIPT_CLOSE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';END IF;
  IF v.receipt_id IS NULL AND p_valuation<>'{}'::jsonb THEN
   RAISE EXCEPTION 'RECEIPT_HISTORICAL_VALUATION_UNAVAILABLE' USING ERRCODE='23514';END IF;
  IF v.receipt_id IS NULL AND (SELECT moneda FROM public.ordenes_compra WHERE tenant_id=p_tenant AND id=r.orden_id)
    IS DISTINCT FROM app.treasury_local_currency_452(p_tenant) THEN
   RAISE EXCEPTION 'RECEIPT_HISTORICAL_FX_UNVERIFIABLE' USING ERRCODE='23514';END IF;
  answer:=app.close_receipt_core_617(p_receipt,p_tenant,p_actor::text,p_notes);
  IF v.receipt_id IS NOT NULL THEN answer:=answer||jsonb_build_object('valuacion_cierre',jsonb_build_object(
    'moneda',v.currency,'moneda_base',v.base_currency,'tipo_cambio',v.exchange_rate::text,'referencia',v.rate_reference));END IF;
  RETURN answer;
 END IF;
 IF upper(r.estado::text)<>'BORRADOR' OR v.receipt_id IS NOT NULL THEN
  RAISE EXCEPTION 'RECEIPT_CLOSE_STATE_INVALID' USING ERRCODE='23514';END IF;
 SELECT * INTO o FROM public.ordenes_compra WHERE id=r.orden_id AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_ORDER_REQUIRED' USING ERRCODE='23514';END IF;
 PERFORM id FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt ORDER BY id FOR UPDATE;
 PERFORM d.id FROM public.orden_compra_detalles d JOIN public.recepcion_items i ON i.detalle_id=d.id AND i.tenant_id=d.tenant_id
  WHERE i.tenant_id=p_tenant AND i.recepcion_id=p_receipt ORDER BY d.id FOR UPDATE OF d;
 PERFORM p.id FROM public.productos p WHERE p.tenant_id=p_tenant AND p.id IN(
  SELECT producto_id FROM public.recepcion_items WHERE tenant_id=p_tenant AND recepcion_id=p_receipt) ORDER BY p.id FOR UPDATE;
 PERFORM app.assert_actor_permission_466(p_tenant,p_actor,'compras.recepciones.cerrar');
 base:=app.treasury_local_currency_452(p_tenant);currency:=upper(btrim(o.moneda));
 IF currency IS NULL OR currency !~ '^[A-Z]{3}$' OR base IS NULL OR base !~ '^[A-Z]{3}$' THEN
  RAISE EXCEPTION 'RECEIPT_CURRENCY_REQUIRED' USING ERRCODE='23514';END IF;
 IF p_valuation='{}'::jsonb THEN
  IF currency<>base THEN RAISE EXCEPTION 'RECEIPT_FX_REQUIRED' USING ERRCODE='23514';END IF;
  rate:=1;
 ELSE
  IF (SELECT count(*) FROM jsonb_object_keys(p_valuation))<>4
   OR p_valuation->>'moneda' IS DISTINCT FROM currency OR p_valuation->>'moneda_base' IS DISTINCT FROM base
   OR jsonb_typeof(p_valuation->'tipo_cambio') IS DISTINCT FROM 'string'
   OR p_valuation->>'tipo_cambio' !~ '^(0|[1-9][0-9]{0,9})([.][0-9]{1,6})?$'
   OR jsonb_typeof(p_valuation->'referencia') IS DISTINCT FROM 'string'
   OR length(btrim(p_valuation->>'referencia')) NOT BETWEEN 5 AND 200 THEN
   RAISE EXCEPTION 'RECEIPT_VALUATION_INPUT_INVALID' USING ERRCODE='22023';END IF;
  rate:=(p_valuation->>'tipo_cambio')::numeric;reference:=btrim(p_valuation->>'referencia');
  IF rate<=0 OR (currency=base AND rate<>1) THEN RAISE EXCEPTION 'RECEIPT_EXCHANGE_RATE_INVALID' USING ERRCODE='22023';END IF;
 END IF;
 -- Legacy drafts used the catalog fallback in the original close writer.
 -- Freeze only their absent classification, under product locks, before close.
 UPDATE public.recepcion_items i SET metadata=coalesce(i.metadata,'{}'::jsonb)||jsonb_build_object(
   'es_servicio',coalesce((i.metadata->>'es_servicio')::boolean,coalesce(p.es_servicio,false) OR lower(coalesce(p.tipo,''))='servicio'),
   'controla_stock',NOT coalesce((i.metadata->>'es_servicio')::boolean,coalesce(p.es_servicio,false) OR lower(coalesce(p.tipo,''))='servicio')
     AND coalesce((i.metadata->>'controla_stock')::boolean,p.controla_stock,true)),updated_at=now()
 FROM public.productos p WHERE i.tenant_id=p_tenant AND i.recepcion_id=p_receipt AND p.id=i.producto_id AND p.tenant_id=i.tenant_id
  AND (i.metadata->>'es_servicio' IS NULL OR i.metadata->>'controla_stock' IS NULL);
 IF EXISTS(SELECT 1 FROM public.recepcion_items i JOIN public.orden_compra_detalles d ON d.tenant_id=i.tenant_id AND d.id=i.detalle_id
  WHERE i.tenant_id=p_tenant AND i.recepcion_id=p_receipt AND upper(i.calidad) IN('OK','OBSERVADO') AND
   (d.orden_id<>o.id OR d.producto_id<>i.producto_id OR d.precio_unitario IS NULL OR d.precio_unitario<0
    OR i.metadata->>'es_servicio' IS NULL OR i.metadata->>'es_servicio' NOT IN('true','false')
    OR i.metadata->>'controla_stock' IS NULL OR i.metadata->>'controla_stock' NOT IN('true','false'))) THEN
  RAISE EXCEPTION 'RECEIPT_ITEM_VALUATION_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'detail_id',d.id,'product_id',i.producto_id,
  'quantity',i.cantidad_recibida,'price',d.precio_unitario,'service',(i.metadata->>'es_servicio')::boolean,
  'stock',(i.metadata->>'es_servicio')::boolean=false AND (i.metadata->>'controla_stock')::boolean,
  'native_amount',round(i.cantidad_recibida*d.precio_unitario,2),
  'base_amount',round(round(i.cantidad_recibida*d.precio_unitario,2)*rate,2)) ORDER BY i.id),'[]'::jsonb) INTO items
 FROM public.recepcion_items i JOIN public.orden_compra_detalles d ON d.tenant_id=i.tenant_id AND d.id=i.detalle_id
 WHERE i.tenant_id=p_tenant AND i.recepcion_id=p_receipt AND upper(i.calidad) IN('OK','OBSERVADO');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE (x->>'price')::numeric>0 AND
  ((x->>'native_amount')::numeric<=0 OR (x->>'base_amount')::numeric<=0 OR (x->>'base_amount')::numeric>=1e12))
  OR (SELECT coalesce(sum((x->>'native_amount')::numeric),0)>=1e12
      OR coalesce(sum((x->>'base_amount')::numeric),0)>=1e12 FROM jsonb_array_elements(items) x) THEN
  RAISE EXCEPTION 'RECEIPT_VALUE_OUTSIDE_PRECISION' USING ERRCODE='22003';END IF;
 INSERT INTO app.receipt_write_617 VALUES(pg_backend_pid(),txid_current(),p_tenant,p_receipt,NULL,NULL);
 INSERT INTO app.receipt_valuation_617(tenant_id,receipt_id,order_id,actor_id,currency,base_currency,exchange_rate,rate_reference,request,items)
 VALUES(p_tenant,p_receipt,o.id,p_actor,currency,base,rate,reference,req,items);
 answer:=app.close_receipt_core_617(p_receipt,p_tenant,p_actor::text,p_notes);
 SELECT count(*) INTO count_events FROM public.outbox_events WHERE tenant_id=p_tenant AND aggregate_id=p_receipt::text
  AND event_type IN('recepcion.registrada','RecepcionRegistrada');
 IF (jsonb_array_length(items)>0 AND count_events<>1) OR (jsonb_array_length(items)=0 AND count_events<>0) THEN
  RAISE EXCEPTION 'RECEIPT_CLOSE_SOURCE_EVENT_MISMATCH' USING ERRCODE='23514';END IF;
 IF count_events=1 THEN
  SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant AND aggregate_id=p_receipt::text AND event_type='recepcion.registrada';
  INSERT INTO app.receipt_source_617 VALUES(p_tenant,p_receipt,e.event_id,e.payload);
 END IF;
 DELETE FROM app.receipt_write_617 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND tenant_id=p_tenant AND receipt_id=p_receipt;
 RETURN answer||jsonb_build_object('valuacion_cierre',jsonb_build_object('moneda',currency,'moneda_base',base,'tipo_cambio',rate::text,'referencia',reference));
END $fn$;
CREATE FUNCTION public.cerrar_recepcion_tx(p_recepcion_id uuid,p_tenant_id uuid,p_user_id text DEFAULT NULL,p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
 SELECT app.close_receipt_617(p_recepcion_id,p_tenant_id,app.to_uuid_or_null(p_user_id),p_observaciones,'{}'::jsonb)
$fn$;
CREATE FUNCTION public.cerrar_recepcion_valuada_617(p_recepcion_id uuid,p_tenant_id uuid,p_user_id uuid,p_observaciones text,p_valuacion jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
 SELECT app.close_receipt_617(p_recepcion_id,p_tenant_id,p_user_id,p_observaciones,p_valuacion)
$fn$;

-- This BEFORE trigger runs after the common valuation freeze, before the
-- cost-average AFTER trigger. Its authority is private and transaction-bound.
CREATE FUNCTION app.freeze_receipt_movement_617() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE v app.receipt_valuation_617;x jsonb;receipt uuid;
BEGIN
 IF NEW.referencia_tipo IS DISTINCT FROM 'RECEPCION' OR TG_OP<>'INSERT' THEN RETURN NEW;END IF;
 receipt:=app.to_uuid_or_null(NEW.metadata->>'recepcion_id');
 SELECT * INTO v FROM app.receipt_valuation_617 WHERE tenant_id=NEW.tenant_id AND receipt_id=receipt;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT value INTO x FROM jsonb_array_elements(v.items) WHERE value->>'item_id'=NEW.referencia_id::text;
 IF NOT EXISTS(SELECT 1 FROM app.receipt_write_617 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
  AND tenant_id=NEW.tenant_id AND receipt_id=receipt AND event_id IS NULL)
  OR x IS NULL OR x->>'stock'<>'true' OR NEW.tipo<>'ENTRADA' OR NEW.cantidad IS DISTINCT FROM (x->>'quantity')::numeric
  OR NEW.producto_id::text IS DISTINCT FROM x->>'product_id' OR NEW.metadata->>'recepcion_item_id' IS DISTINCT FROM x->>'item_id'
  OR (NEW.metadata->>'costo_unitario')::numeric IS DISTINCT FROM (x->>'price')::numeric THEN
  RAISE EXCEPTION 'RECEIPT_MOVEMENT_VALUATION_MISMATCH' USING ERRCODE='23514';END IF;
 NEW.metadata:=NEW.metadata||jsonb_build_object('moneda_valorizacion',v.currency,'moneda_base_valorizacion',v.base_currency,
  'tipo_cambio_valorizacion',v.exchange_rate,'receipt_valuation_version',617);
 NEW.kardex_moneda:=v.currency;NEW.kardex_moneda_base:=v.base_currency;NEW.kardex_tipo_cambio:=v.exchange_rate;
 NEW.kardex_costo_unitario:=(x->>'price')::numeric;NEW.kardex_valor_total:=(x->>'native_amount')::numeric;
 NEW.kardex_valuacion_estado:='CONFIRMADA';RETURN NEW;
END $fn$;
CREATE TRIGGER zzz_freeze_receipt_movement_617 BEFORE INSERT ON public.movimientos_inventario
 FOR EACH ROW EXECUTE FUNCTION app.freeze_receipt_movement_617();

CREATE FUNCTION app.bind_receipt_outbox_617() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE v app.receipt_valuation_617;s app.receipt_source_617;
BEGIN
 IF TG_OP='UPDATE' THEN
  SELECT * INTO s FROM app.receipt_source_617 WHERE tenant_id=OLD.tenant_id AND event_id=OLD.event_id;
  IF s.event_id IS NOT NULL AND ROW(NEW.tenant_id,NEW.event_id,NEW.event_type,NEW.aggregate_type,NEW.aggregate_id,NEW.payload,NEW.idempotency_key)
   IS DISTINCT FROM ROW(OLD.tenant_id,OLD.event_id,OLD.event_type,OLD.aggregate_type,OLD.aggregate_id,OLD.payload,OLD.idempotency_key) THEN
   RAISE EXCEPTION 'RECEIPT_SOURCE_EVENT_IMMUTABLE' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 IF NEW.event_type NOT IN('recepcion.registrada','RecepcionRegistrada') THEN RETURN NEW;END IF;
 SELECT * INTO v FROM app.receipt_valuation_617 WHERE tenant_id=NEW.tenant_id AND receipt_id=app.to_uuid_or_null(NEW.aggregate_id);
 IF v.receipt_id IS NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM app.receipt_write_617 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
  AND tenant_id=v.tenant_id AND receipt_id=v.receipt_id AND event_id IS NULL) THEN
  RAISE EXCEPTION 'RECEIPT_SOURCE_EVENT_AUTHORITY_REQUIRED' USING ERRCODE='42501';END IF;
 NEW.payload:=NEW.payload||jsonb_build_object('valuation617',jsonb_build_object('moneda',v.currency,'moneda_base',v.base_currency,
  'tipo_cambio',v.exchange_rate::text,'referencia',v.rate_reference));RETURN NEW;
END $fn$;
CREATE TRIGGER zzz_bind_receipt_outbox_617 BEFORE INSERT OR UPDATE ON public.outbox_events
 FOR EACH ROW EXECUTE FUNCTION app.bind_receipt_outbox_617();

CREATE FUNCTION app.receipt_accounting_basis_617(e public.outbox_events)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE r public.recepciones;v app.receipt_valuation_617;s app.receipt_source_617;x jsonb;items jsonb;
 currency text;base text;rate numeric;native_total numeric:=0;goods numeric:=0;services numeric:=0;no_stock numeric:=0;
 native_goods numeric:=0;native_services numeric:=0;native_no_stock numeric:=0;n numeric;local_value numeric;
BEGIN
 SELECT * INTO r FROM public.recepciones WHERE tenant_id=e.tenant_id AND id=app.to_uuid_or_null(e.payload->>'recepcionId');
 IF r.id IS NULL OR r.estado NOT IN('CERRADA','ANULADA') OR e.event_type NOT IN('recepcion.registrada','RecepcionRegistrada')
  OR e.aggregate_type<>'recepcion' OR e.aggregate_id IS DISTINCT FROM r.id::text
  OR e.payload->>'tenantId' IS DISTINCT FROM e.tenant_id::text OR e.payload->>'ordenId' IS DISTINCT FROM r.orden_id::text
  OR e.payload->>'source' IS DISTINCT FROM 'db.recepcion_cerrada.444'
  OR jsonb_typeof(e.payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(e.payload->'items')=0
  OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=e.tenant_id AND aggregate_id=r.id::text
    AND event_type IN('recepcion.registrada','RecepcionRegistrada'))<>1 THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_SOURCE_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO v FROM app.receipt_valuation_617 WHERE tenant_id=e.tenant_id AND receipt_id=r.id;
 IF v.receipt_id IS NOT NULL THEN
  SELECT * INTO s FROM app.receipt_source_617 WHERE tenant_id=e.tenant_id AND receipt_id=r.id;
  IF s.event_id IS DISTINCT FROM e.event_id OR s.payload IS DISTINCT FROM e.payload THEN
   RAISE EXCEPTION 'RECEIPT_ACCOUNTING_SOURCE_MISMATCH' USING ERRCODE='23514';END IF;
  currency:=v.currency;base:=v.base_currency;rate:=v.exchange_rate;items:=v.items;
 ELSE
  -- Legacy domestic receipts are verified from their canonical source. A
  -- foreign receipt without a close snapshot cannot be repaired using today's rate.
  base:=app.treasury_local_currency_452(e.tenant_id);currency:=e.payload->>'moneda';rate:=1;
  IF currency IS NULL OR currency IS DISTINCT FROM base OR e.payload?'valuation617' THEN
   RAISE EXCEPTION 'RECEIPT_HISTORICAL_FX_UNVERIFIABLE' USING ERRCODE='23514';END IF;
  IF EXISTS(
   (SELECT jsonb_build_object('product',i.producto_id,'quantity',i.cantidad_recibida,'price',d.precio_unitario,
      'service',i.metadata->'es_servicio','stock',(i.metadata->>'es_servicio')::boolean=false AND (i.metadata->>'controla_stock')::boolean)
    FROM public.recepcion_items i JOIN public.orden_compra_detalles d ON d.id=i.detalle_id AND d.tenant_id=i.tenant_id
    WHERE i.tenant_id=e.tenant_id AND i.recepcion_id=r.id AND upper(i.calidad) IN('OK','OBSERVADO'))
   EXCEPT ALL
   (SELECT jsonb_build_object('product',x->'productoId','quantity',x->'cantidadRecibida','price',x->'precioUnitario',
      'service',x->'esServicio','stock',x->'controlaStock') FROM jsonb_array_elements(e.payload->'items') x)
  ) OR (SELECT count(*) FROM public.recepcion_items WHERE tenant_id=e.tenant_id AND recepcion_id=r.id AND upper(calidad) IN('OK','OBSERVADO'))
    <>jsonb_array_length(e.payload->'items') THEN
   RAISE EXCEPTION 'RECEIPT_ACCOUNTING_SOURCE_MISMATCH' USING ERRCODE='23514';END IF;
  SELECT jsonb_agg(jsonb_build_object('product_id',x->'productoId','quantity',x->'cantidadRecibida','price',x->'precioUnitario',
   'service',x->'esServicio','stock',x->'controlaStock','native_amount',x->'subtotal','base_amount',x->'subtotal'))
   INTO items FROM jsonb_array_elements(e.payload->'items') x;
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['quantity','price','native_amount','base_amount']) k WHERE jsonb_typeof(x->k) IS DISTINCT FROM 'number')
   OR jsonb_typeof(x->'service') IS DISTINCT FROM 'boolean' OR jsonb_typeof(x->'stock') IS DISTINCT FROM 'boolean'
   OR (x->>'service')::boolean AND (x->>'stock')::boolean THEN
   RAISE EXCEPTION 'RECEIPT_ITEM_VALUATION_REQUIRED' USING ERRCODE='23514';END IF;
  n:=(x->>'native_amount')::numeric;local_value:=(x->>'base_amount')::numeric;
  IF (x->>'quantity')::numeric<=0 OR (x->>'price')::numeric<0
   OR n IS DISTINCT FROM round((x->>'quantity')::numeric*(x->>'price')::numeric,2)
   OR local_value IS DISTINCT FROM round(n*rate,2) OR n<0 OR local_value<0
   OR ((x->>'price')::numeric>0 AND (n=0 OR local_value=0)) THEN
   RAISE EXCEPTION 'RECEIPT_VALUE_OUTSIDE_PRECISION' USING ERRCODE='22003';END IF;
  native_total:=native_total+n;
  IF (x->>'stock')::boolean THEN goods:=goods+local_value;native_goods:=native_goods+n;
  ELSIF (x->>'service')::boolean THEN services:=services+local_value;native_services:=native_services+n;
  ELSE no_stock:=no_stock+local_value;native_no_stock:=native_no_stock+n;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['subtotalParcial','mercaderiaParcial','serviciosParcial','noStockParcial']) k
  WHERE jsonb_typeof(e.payload->k) IS DISTINCT FROM 'number')
  OR e.payload->>'moneda' IS DISTINCT FROM currency
  OR (e.payload->>'subtotalParcial')::numeric IS DISTINCT FROM native_total
  OR (e.payload->>'mercaderiaParcial')::numeric IS DISTINCT FROM native_goods
  OR (e.payload->>'serviciosParcial')::numeric IS DISTINCT FROM native_services
  OR (e.payload->>'noStockParcial')::numeric IS DISTINCT FROM native_no_stock THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_TOTAL_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('moneda',currency,'moneda_base',base,'tipo_cambio',rate::text,
  'subtotal_origen',native_total::numeric(14,2)::text,'mercaderia',goods::numeric(14,2)::text,
  'servicios',services::numeric(14,2)::text,'no_stock',no_stock::numeric(14,2)::text,
  'total_base',(goods+services+no_stock)::numeric(14,2)::text,'version',CASE WHEN v.receipt_id IS NULL THEN 444 ELSE 617 END);
END $fn$;

CREATE FUNCTION app.assert_receipt_journal_617(e public.outbox_events,b jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE j public.asientos_contables;expected jsonb;goods numeric:=(b->>'mercaderia')::numeric;
 expenses numeric:=(b->>'servicios')::numeric+(b->>'no_stock')::numeric;total numeric:=(b->>'total_base')::numeric;
BEGIN
 IF (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=e.tenant_id AND source_event_id=e.event_id)<>1 THEN
  RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_INVALID' USING ERRCODE='23514';END IF;
 SELECT * INTO j FROM public.asientos_contables WHERE tenant_id=e.tenant_id AND source_event_id=e.event_id;
 IF total<=0 OR j.estado<>'CONFIRMADO' OR j.total_debe<>total OR j.total_haber<>total OR j.reversion_de_asiento_id IS NOT NULL
  OR j.fecha::date IS DISTINCT FROM app.accounting_event_date_458(e.payload,e.occurred_at)
  OR ((b->>'version')::int=617 AND j.metadata->'receipt_valuation' IS DISTINCT FROM b) THEN
  RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_VALUATION_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(jsonb_build_object('code',code,'debit',debit,'credit',credit)) INTO expected
 FROM (VALUES('20',goods,0::numeric),('63',expenses,0::numeric),('4699',0::numeric,total)) a(code,debit,credit) WHERE debit>0 OR credit>0;
 IF EXISTS(
  (SELECT c.codigo,d.debe,d.haber,d.centro_costo_id FROM public.detalle_asientos d JOIN public.plan_cuentas c ON c.id=d.cuenta_id AND c.tenant_id=d.tenant_id
    WHERE d.tenant_id=e.tenant_id AND d.asiento_id=j.id)
  EXCEPT ALL (SELECT x->>'code',(x->>'debit')::numeric,(x->>'credit')::numeric,NULL::uuid FROM jsonb_array_elements(expected) x)
 ) OR EXISTS(
  (SELECT x->>'code',(x->>'debit')::numeric,(x->>'credit')::numeric,NULL::uuid FROM jsonb_array_elements(expected) x)
  EXCEPT ALL (SELECT c.codigo,d.debe,d.haber,d.centro_costo_id FROM public.detalle_asientos d JOIN public.plan_cuentas c ON c.id=d.cuenta_id AND c.tenant_id=d.tenant_id
    WHERE d.tenant_id=e.tenant_id AND d.asiento_id=j.id)
 ) THEN RAISE EXCEPTION 'RECEIPT_ORIGINAL_JOURNAL_LINES_MISMATCH' USING ERRCODE='23514';END IF;
END $fn$;

CREATE FUNCTION app.guard_receipt_journal_617() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;
BEGIN
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=NEW.tenant_id AND event_id=NEW.source_event_id;
 IF e.event_type IN('recepcion.registrada','RecepcionRegistrada') AND NOT EXISTS(
  SELECT 1 FROM app.receipt_write_617 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
   AND tenant_id=e.tenant_id AND receipt_id=app.to_uuid_or_null(e.payload->>'recepcionId') AND event_id=e.event_id
   AND claim_token=e.claim_token AND e.status='processing' AND e.claim_token IS NOT NULL) THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_AUTHORITY_REQUIRED' USING ERRCODE='42501';END IF;
 IF e.event_type IN('recepcion.registrada','RecepcionRegistrada') THEN
  NEW.metadata:=coalesce(NEW.metadata,'{}'::jsonb)||jsonb_build_object('receipt_valuation',app.receipt_accounting_basis_617(e));
 END IF;
 IF TG_OP='UPDATE' AND ROW(OLD.tenant_id,OLD.source_event_id) IS DISTINCT FROM ROW(NEW.tenant_id,NEW.source_event_id) AND EXISTS(
   SELECT 1 FROM public.outbox_events WHERE tenant_id=OLD.tenant_id AND event_id=OLD.source_event_id
    AND event_type IN('recepcion.registrada','RecepcionRegistrada')) THEN
  RAISE EXCEPTION 'RECEIPT_ACCOUNTING_AUTHORITY_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER guard_receipt_journal_617 BEFORE INSERT OR UPDATE ON public.asientos_contables
 FOR EACH ROW EXECUTE FUNCTION app.guard_receipt_journal_617();

CREATE FUNCTION public.contabilizar_recepcion_617(p_tenant_id uuid,p_event_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;r public.recepciones;b jsonb;j public.asientos_contables;details jsonb:='[]';
 c record;goods numeric;expenses numeric;total numeric;created jsonb;replayed boolean:=false;
BEGIN
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=p_tenant_id AND event_id=p_event_id AND status='processing'
  AND claim_token=p_claim_token AND p_claim_token IS NOT NULL AND event_type IN('recepcion.registrada','RecepcionRegistrada') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_ACCOUNTING_CLAIM_INVALID' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.recepciones WHERE tenant_id=p_tenant_id AND id=app.to_uuid_or_null(e.payload->>'recepcionId') FOR UPDATE;
 b:=app.receipt_accounting_basis_617(e);goods:=(b->>'mercaderia')::numeric;expenses:=(b->>'servicios')::numeric+(b->>'no_stock')::numeric;total:=(b->>'total_base')::numeric;
 IF total=0 THEN
  PERFORM app.assert_receipt_zero_effect_615(e);
  RETURN jsonb_build_object('success',true,'no_monetary_effect',true,'event_id',e.event_id,'recepcion_id',r.id,'valuacion',b);
 END IF;
 SELECT * INTO j FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND source_event_id=e.event_id FOR UPDATE;
 IF j.id IS NULL THEN
  FOR c IN SELECT * FROM (VALUES('20',goods,0::numeric),('63',expenses,0::numeric),('4699',0::numeric,total)) a(code,debit,credit)
    WHERE debit>0 OR credit>0 LOOP
   IF (SELECT count(*) FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo=c.code AND acepta_movimiento AND activo)<>1 THEN
    RAISE EXCEPTION 'RECEIPT_ACCOUNTING_ACCOUNT_REQUIRED:%',c.code USING ERRCODE='23514';END IF;
   details:=details||jsonb_build_array(jsonb_build_object('cuenta_id',(SELECT id FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo=c.code),
    'debe',c.debit,'haber',c.credit,'concepto','Recepción '||r.numero));
  END LOOP;
  INSERT INTO app.receipt_write_617 VALUES(pg_backend_pid(),txid_current(),p_tenant_id,r.id,e.event_id,p_claim_token);
  created:=public.crear_asiento_con_detalles_tx(p_tenant_id,jsonb_build_object('fecha',r.fecha_recepcion,
   'concepto','Recepción pendiente de factura','referencia',r.numero,'estado','CONFIRMADO','origen','RECEPCION',
   'source_event_id',e.event_id,'created_by',r.cerrado_por,'confirmado_por',r.cerrado_por,'metadata',jsonb_build_object('receipt_valuation',b)),details);
  DELETE FROM app.receipt_write_617 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND tenant_id=p_tenant_id AND receipt_id=r.id;
  SELECT * INTO j FROM public.asientos_contables WHERE tenant_id=p_tenant_id AND id=(created->>'id')::uuid;
 ELSE replayed:=true;END IF;
 PERFORM app.assert_receipt_journal_617(e,b);
 RETURN jsonb_build_object('success',true,'no_monetary_effect',false,'event_id',e.event_id,'recepcion_id',r.id,'asiento_id',j.id,
  'total_debe',j.total_debe::text,'total_haber',j.total_haber::text,'valuacion',b,'idempotent',replayed);
END $fn$;

-- Business and accounting reversals must also verify the original valuation.
ALTER FUNCTION app.receipt_source_event_615(uuid,uuid) RENAME TO receipt_source_event_core_617;
CREATE FUNCTION app.receipt_source_event_615(p_tenant uuid,p_receipt uuid)
RETURNS public.outbox_events LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE e public.outbox_events;b jsonb;
BEGIN
 e:=app.receipt_source_event_core_617(p_tenant,p_receipt);b:=app.receipt_accounting_basis_617(e);
 IF EXISTS(SELECT 1 FROM public.asientos_contables WHERE tenant_id=p_tenant AND source_event_id=e.event_id) THEN
  PERFORM app.assert_receipt_journal_617(e,b);END IF;
 RETURN e;
END $fn$;
DO $acl$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app' AND (p.proname LIKE '%617' OR p.proname='receipt_source_event_615') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 END LOOP;
END $acl$;
REVOKE ALL ON FUNCTION public.cerrar_recepcion_tx(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.cerrar_recepcion_valuada_617(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.contabilizar_recepcion_617(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_recepcion_tx(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_recepcion_valuada_617(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.contabilizar_recepcion_617(uuid,uuid,uuid) TO service_role;
COMMIT;
