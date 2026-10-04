-- Conciliación de partidas con intención durable por Idempotency-Key y lectura
-- del listado de conciliaciones. Envuelve conciliar_partidas_tx sin cambiarlo;
-- sin backfill.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_intents (
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,
 actor_id uuid NOT NULL,
 intent_fingerprint text NOT NULL,
 conciliacion_id uuid NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_accounting_reconciliation_intent_key_569 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
 CONSTRAINT ck_accounting_reconciliation_intent_fingerprint_569 CHECK (intent_fingerprint ~ '^[a-f0-9]{64}$'),
 CONSTRAINT ux_accounting_reconciliation_intent_569 UNIQUE (tenant_id, idempotency_key)
);
ALTER TABLE public.accounting_reconciliation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_reconciliation_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.accounting_reconciliation_intents FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY accounting_reconciliation_intents_private_569 ON public.accounting_reconciliation_intents USING (false) WITH CHECK (false);

-- Devuelve la conciliación ya registrada con esa llave o NULL. Una llave
-- reutilizada con otra selección u otro actor es un conflicto.
CREATE OR REPLACE FUNCTION public.conciliacion_partidas_replay_569(
 p_tenant_id uuid, p_actor_id uuid, p_idempotency_key text, p_intent_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE v_row public.accounting_reconciliation_intents;
BEGIN
 IF p_tenant_id IS NULL OR p_actor_id IS NULL
  OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 200
  OR coalesce(p_intent_fingerprint,'') !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'CONCILIACION_INTENCION_INVALIDA' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_row FROM public.accounting_reconciliation_intents
 WHERE tenant_id=p_tenant_id AND idempotency_key=btrim(p_idempotency_key);
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_row.intent_fingerprint IS DISTINCT FROM p_intent_fingerprint OR v_row.actor_id IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'CONCILIACION_IDEMPOTENCIA_CONFLICTO' USING ERRCODE='23505';
 END IF;
 RETURN v_row.result||jsonb_build_object('idempotent',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.conciliacion_partidas_replay_569(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conciliacion_partidas_replay_569(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.conciliar_partidas_idempotente_tx_569(
 p_tenant_id uuid, p_actor_id uuid, p_idempotency_key text, p_intent_fingerprint text,
 p_cuenta_id uuid, p_estado text, p_monto_conciliado numeric, p_fecha date,
 p_observaciones text, p_aplicaciones jsonb, p_saldo_no_conciliado numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE v_result jsonb; v_id uuid;
BEGIN
 PERFORM app.assert_actor_461(p_tenant_id,p_actor_id);
 -- Dos reintentos simultáneos con la misma llave se serializan aquí: el segundo
 -- encuentra la intención del primero y la repite.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':reconciliation:'||btrim(coalesce(p_idempotency_key,'')),569));
 v_result:=public.conciliacion_partidas_replay_569(p_tenant_id,p_actor_id,p_idempotency_key,p_intent_fingerprint);
 IF v_result IS NOT NULL THEN RETURN v_result; END IF;
 v_result:=public.conciliar_partidas_tx(p_tenant_id,p_cuenta_id,p_estado,p_monto_conciliado,p_fecha,p_observaciones,p_actor_id::text,p_aplicaciones);
 v_id:=nullif(v_result->>'id','')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'CONCILIACION_POSTCONDICION' USING ERRCODE='23514'; END IF;
 -- Se guarda la respuesta completa para que el reintento devuelva lo mismo.
 v_result:=v_result||jsonb_build_object(
  'lineas',(SELECT coalesce(jsonb_agg(jsonb_build_object('detalle_asiento_id',e.value->>'detalle_id','monto_aplicado',round((e.value->>'monto_aplicado')::numeric,2)) ORDER BY e.ordinality),'[]'::jsonb)
   FROM jsonb_array_elements(p_aplicaciones) WITH ORDINALITY e),
  'saldo_no_conciliado',p_saldo_no_conciliado);
 INSERT INTO public.accounting_reconciliation_intents(tenant_id,idempotency_key,actor_id,intent_fingerprint,conciliacion_id,result)
 VALUES(p_tenant_id,btrim(p_idempotency_key),p_actor_id,p_intent_fingerprint,v_id,v_result);
 RETURN v_result||jsonb_build_object('idempotent',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.conciliar_partidas_idempotente_tx_569(uuid,uuid,text,text,uuid,text,numeric,date,text,jsonb,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_partidas_idempotente_tx_569(uuid,uuid,text,text,uuid,text,numeric,date,text,jsonb,numeric) TO service_role;

-- La 387 marcó como conciliables las cuentas de terceros del PCGE (12, 16, 42,
-- 46) sólo de los tenants existentes; las sembradas después (556) nacen sin la
-- marca y un cliente nuevo no puede conciliar nada. No hay API que la cambie.
CREATE OR REPLACE FUNCTION app.plan_cuentas_conciliable_pe_569()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
BEGIN
 IF NOT NEW.conciliable AND NEW.codigo ~ '^(12|16|42|46)'
  AND EXISTS (SELECT 1 FROM public.empresa_config c WHERE c.tenant_id=NEW.tenant_id AND upper(btrim(c.pais))='PE') THEN
  NEW.conciliable:=true;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION app.plan_cuentas_conciliable_pe_569() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_plan_cuentas_conciliable_pe_569
BEFORE INSERT ON public.plan_cuentas
FOR EACH ROW EXECUTE FUNCTION app.plan_cuentas_conciliable_pe_569();
-- Backfill con la misma regla de la 387, sólo tenants PE: cambia la marca, no
-- saldos, asientos ni conciliaciones.
UPDATE public.plan_cuentas p SET conciliable=true
WHERE NOT p.conciliable AND p.codigo ~ '^(12|16|42|46)'
 AND EXISTS (SELECT 1 FROM public.empresa_config c WHERE c.tenant_id=p.tenant_id AND upper(btrim(c.pais))='PE');

-- El listado de conciliaciones lee la tabla: ni la cadena canónica ni PROD
-- concedían esta lectura y el endpoint respondía 500.
GRANT SELECT ON public.conciliaciones_partidas TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
