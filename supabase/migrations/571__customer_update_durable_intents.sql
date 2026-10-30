-- Un COMMIT de edición seguido de pérdida del ACK debe repetir el recibo,
-- sin otra UPDATE ni auditoría. No modifica maestros ni intenciones previas.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.customer_update_intents (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  actor_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  intent_fingerprint text NOT NULL CHECK (intent_fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);
ALTER TABLE public.customer_update_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_update_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_update_intents FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY customer_update_intents_private_571 ON public.customer_update_intents
  USING (false) WITH CHECK (false);

CREATE FUNCTION public.actualizar_cliente_idempotente_tx_571(
  p_cliente_id uuid, p_tenant_id uuid, p_actor_id uuid,
  p_cambios jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_previous public.customer_update_intents;
  v_fingerprint text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  IF p_cliente_id IS NULL OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    OR p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' THEN
    RAISE EXCEPTION 'CUSTOMER_UPDATE_INVALID_INTENT' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.fingerprint_comercial_459(jsonb_build_object(
    'customer_id', p_cliente_id, 'changes', p_cambios));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':customer-update:' || p_idempotency_key, 571));
  SELECT * INTO v_previous FROM public.customer_update_intents
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_previous.actor_id IS DISTINCT FROM p_actor_id
      OR v_previous.customer_id IS DISTINCT FROM p_cliente_id
      OR v_previous.intent_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CUSTOMER_UPDATE_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_previous.result;
  END IF;
  v_result := public.actualizar_cliente_maestro_tx(p_cliente_id, p_tenant_id, p_actor_id, p_cambios);
  IF v_result->>'id' IS DISTINCT FROM p_cliente_id::text THEN
    RAISE EXCEPTION 'CUSTOMER_UPDATE_INVALID_RECEIPT' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.customer_update_intents
    (tenant_id, idempotency_key, actor_id, customer_id, intent_fingerprint, result)
    VALUES (p_tenant_id, p_idempotency_key, p_actor_id, p_cliente_id, v_fingerprint, v_result);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
