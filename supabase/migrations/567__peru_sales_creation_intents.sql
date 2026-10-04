-- Altas de cotización y pedido con intención durable por Idempotency-Key.
-- Envuelve los writers vigentes sin cambiarlos; sin backfill.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE TABLE IF NOT EXISTS public.sales_creation_intents (
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 operation text NOT NULL,
 idempotency_key text NOT NULL,
 actor_id uuid NOT NULL,
 intent_fingerprint text NOT NULL,
 resource_id uuid NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_sales_creation_intent_operation_567 CHECK (operation IN ('COTIZACION','PEDIDO')),
 CONSTRAINT ck_sales_creation_intent_key_567 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
 CONSTRAINT ck_sales_creation_intent_fingerprint_567 CHECK (intent_fingerprint ~ '^[a-f0-9]{64}$'),
 CONSTRAINT ux_sales_creation_intent_567 UNIQUE (tenant_id, operation, idempotency_key)
);
ALTER TABLE public.sales_creation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_creation_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_creation_intents FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY sales_creation_intents_private_567 ON public.sales_creation_intents USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION app.sales_creation_intent_replay_567(
 p_tenant_id uuid, p_operation text, p_actor_id uuid, p_key text, p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE v_row public.sales_creation_intents;
BEGIN
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_operation NOT IN ('COTIZACION','PEDIDO')
  OR length(btrim(coalesce(p_key,''))) NOT BETWEEN 8 AND 200 OR coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'SALES_CREATION_INTENT_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':sales-create:'||p_operation||':'||btrim(p_key),567));
 SELECT * INTO v_row FROM public.sales_creation_intents
 WHERE tenant_id=p_tenant_id AND operation=p_operation AND idempotency_key=btrim(p_key) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_row.intent_fingerprint IS DISTINCT FROM p_fingerprint OR v_row.actor_id IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'SALES_CREATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
 END IF;
 RETURN v_row.result||jsonb_build_object('idempotent',true);
END;
$function$;
REVOKE ALL ON FUNCTION app.sales_creation_intent_replay_567(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crear_cotizacion_idempotente_tx_567(
 p_tenant_id uuid, p_actor_id uuid, p_idempotency_key text, p_intent_fingerprint text,
 p_cliente_id uuid, p_fecha_vencimiento date, p_observaciones text, p_vendedor text, p_moneda text,
 p_subtotal numeric, p_igv numeric, p_total numeric, p_detalle jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE v_result jsonb; v_id uuid;
BEGIN
 v_result:=app.sales_creation_intent_replay_567(p_tenant_id,'COTIZACION',p_actor_id,p_idempotency_key,p_intent_fingerprint);
 IF v_result IS NOT NULL THEN RETURN v_result; END IF;
 v_result:=public.crear_cotizacion_comercial_tx(
  p_tenant_id=>p_tenant_id,p_created_by=>p_actor_id,p_cliente_id=>p_cliente_id,p_fecha_vencimiento=>p_fecha_vencimiento,
  p_observaciones=>p_observaciones,p_vendedor=>p_vendedor,p_moneda=>p_moneda,p_subtotal=>p_subtotal,p_igv=>p_igv,
  p_total=>p_total,p_detalle=>p_detalle);
 v_id:=nullif(v_result->'cotizacion'->>'id','')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'SALES_CREATION_POSTCONDITION_FAILED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.sales_creation_intents(tenant_id,operation,idempotency_key,actor_id,intent_fingerprint,resource_id,result)
 VALUES(p_tenant_id,'COTIZACION',btrim(p_idempotency_key),p_actor_id,p_intent_fingerprint,v_id,v_result);
 RETURN v_result||jsonb_build_object('idempotent',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_cotizacion_idempotente_tx_567(uuid,uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cotizacion_idempotente_tx_567(uuid,uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.crear_pedido_idempotente_tx_567(
 p_tenant_id uuid, p_actor_id uuid, p_idempotency_key text, p_intent_fingerprint text,
 p_pedido jsonb, p_detalle jsonb, p_payment_intent jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE v_result jsonb; v_id uuid;
BEGIN
 IF p_pedido->>'tenant_id' IS DISTINCT FROM p_tenant_id::text OR p_pedido->>'created_by' IS DISTINCT FROM p_actor_id::text THEN
  RAISE EXCEPTION 'SALES_CREATION_INTENT_INVALID' USING ERRCODE='22023';
 END IF;
 v_result:=app.sales_creation_intent_replay_567(p_tenant_id,'PEDIDO',p_actor_id,p_idempotency_key,p_intent_fingerprint);
 IF v_result IS NOT NULL THEN RETURN v_result; END IF;
 v_result:=public.crear_pedido_comercial_pago_tx_531(p_pedido,p_detalle,p_payment_intent);
 v_id:=nullif(v_result->>'pedido_id','')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'SALES_CREATION_POSTCONDITION_FAILED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.sales_creation_intents(tenant_id,operation,idempotency_key,actor_id,intent_fingerprint,resource_id,result)
 VALUES(p_tenant_id,'PEDIDO',btrim(p_idempotency_key),p_actor_id,p_intent_fingerprint,v_id,v_result);
 RETURN v_result||jsonb_build_object('idempotent',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_pedido_idempotente_tx_567(uuid,uuid,text,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pedido_idempotente_tx_567(uuid,uuid,text,text,jsonb,jsonb,jsonb) TO service_role;

-- La cadena canónica nunca concedió esta lectura; PROD ya la tiene.
GRANT SELECT ON public.v_kpis_sunat_multitenant TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
