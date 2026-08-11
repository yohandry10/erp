BEGIN;

SET lock_timeout = '10s';
SET statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.financial_master_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  actor_id uuid NOT NULL,
  record_id uuid,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_financial_master_key_477 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_master_operation_key_477
  ON public.financial_master_operations (tenant_id, operation_type, idempotency_key);

ALTER TABLE public.financial_master_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_master_operations FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'financial_master_operations');

CREATE OR REPLACE FUNCTION app.assert_financial_master_actor_477(
  p_tenant_id uuid, p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_MASTER_ACTOR_INVALID';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.financial_master_fingerprint_477(p_payload jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION app.gestionar_cuenta_bancaria_tx_477(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cuenta_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_type text := CASE WHEN p_cuenta_id IS NULL THEN 'BANK_ACCOUNT_CREATE' ELSE 'BANK_ACCOUNT_UPDATE' END;
  v_fingerprint text;
  v_existing public.financial_master_operations%ROWTYPE;
  v_account public.cuentas_bancarias%ROWTYPE;
  v_account_id uuid := coalesce(p_cuenta_id, gen_random_uuid());
  v_number text := nullif(btrim(p_payload->>'numero_cuenta'), '');
  v_currency text := upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN'));
  v_ledger_id uuid := app.to_uuid_or_null(p_payload->>'cuenta_contable_id');
  v_overdraft boolean := coalesce((p_payload->>'permite_sobregiro')::boolean, false);
  v_active boolean := coalesce((p_payload->>'activa')::boolean, true);
  v_result jsonb;
BEGIN
  PERFORM app.assert_financial_master_actor_477(p_tenant_id, p_actor_id);
  IF length(v_key) < 8 OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'FINANCIAL_MASTER_IDEMPOTENCY_KEY_INVALID';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'FINANCIAL_MASTER_PAYLOAD_INVALID';
  END IF;

  v_fingerprint := app.financial_master_fingerprint_477(jsonb_build_object(
    'type', v_type, 'record_id', p_cuenta_id, 'payload', p_payload
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':bank:' || v_key, 0));

  SELECT * INTO v_existing
  FROM public.financial_master_operations
  WHERE tenant_id = p_tenant_id AND operation_type = v_type AND idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> v_fingerprint OR v_existing.actor_id <> p_actor_id THEN
      RAISE EXCEPTION 'FINANCIAL_MASTER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('idempotent', true);
  END IF;

  IF p_cuenta_id IS NOT NULL THEN
    SELECT * INTO v_account FROM public.cuentas_bancarias
    WHERE id = p_cuenta_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNT_NOT_FOUND'; END IF;
    v_ledger_id := coalesce(v_ledger_id, v_account.cuenta_contable_id);
    IF NOT (p_payload ? 'permite_sobregiro') THEN
      v_overdraft := coalesce(v_account.permite_sobregiro, false);
    END IF;
    IF NOT (p_payload ? 'activa') THEN
      v_active := coalesce(v_account.activa, true);
    END IF;
  END IF;

  IF v_ledger_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.plan_cuentas c
    WHERE c.id = v_ledger_id AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true) AND coalesce(c.acepta_movimiento, true)
  ) THEN
    RAISE EXCEPTION 'BANK_ACCOUNT_LEDGER_INVALID';
  END IF;

  IF p_cuenta_id IS NULL THEN
    IF nullif(btrim(p_payload->>'nombre'), '') IS NULL
       OR nullif(btrim(p_payload->>'banco'), '') IS NULL
       OR v_number IS NULL THEN
      RAISE EXCEPTION 'BANK_ACCOUNT_REQUIRED_FIELDS_MISSING';
    END IF;
    IF coalesce((p_payload->>'saldo')::numeric, 0) <> 0 THEN
      RAISE EXCEPTION 'BANK_ACCOUNT_OPENING_BALANCE_REQUIRES_LEDGER_FLOW';
    END IF;
    IF v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'BANK_ACCOUNT_CURRENCY_INVALID'; END IF;

    INSERT INTO public.cuentas_bancarias (
      id, tenant_id, nombre, banco, numero_cuenta, tipo_cuenta, moneda,
      saldo, saldo_inicial, saldo_actual, saldo_contable, cuenta_contable_id,
      permite_sobregiro, activa, activo, estado, created_by, updated_by, created_at, updated_at
    ) VALUES (
      v_account_id, p_tenant_id, btrim(p_payload->>'nombre'), btrim(p_payload->>'banco'),
      v_number, upper(coalesce(nullif(btrim(p_payload->>'tipo_cuenta'), ''), 'CORRIENTE')),
      v_currency, 0, 0, 0, 0, v_ledger_id, v_overdraft, v_active, v_active,
      CASE WHEN v_active THEN 'ACTIVO' ELSE 'INACTIVO' END,
      p_actor_id, p_actor_id, now(), now()
    ) RETURNING * INTO v_account;
  ELSE
    IF p_payload ?| ARRAY['saldo','saldo_inicial','saldo_actual','saldo_contable','moneda'] THEN
      RAISE EXCEPTION 'BANK_ACCOUNT_FINANCIAL_FIELDS_IMMUTABLE';
    END IF;
    IF NOT v_overdraft AND coalesce(v_account.saldo, v_account.saldo_actual, 0) < 0 THEN
      RAISE EXCEPTION 'BANK_ACCOUNT_NEGATIVE_BALANCE';
    END IF;

    UPDATE public.cuentas_bancarias
    SET nombre = coalesce(nullif(btrim(p_payload->>'nombre'), ''), nombre),
        banco = coalesce(nullif(btrim(p_payload->>'banco'), ''), banco),
        numero_cuenta = coalesce(v_number, numero_cuenta),
        tipo_cuenta = upper(coalesce(nullif(btrim(p_payload->>'tipo_cuenta'), ''), tipo_cuenta)),
        cuenta_contable_id = v_ledger_id,
        permite_sobregiro = v_overdraft,
        activa = v_active,
        activo = v_active,
        estado = CASE WHEN v_active THEN 'ACTIVO' ELSE 'INACTIVO' END,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = p_cuenta_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_account;
  END IF;

  v_result := jsonb_build_object('cuenta', to_jsonb(v_account), 'idempotent', false);
  INSERT INTO public.financial_master_operations (
    tenant_id, operation_type, idempotency_key, request_fingerprint,
    actor_id, record_id, result
  ) VALUES (p_tenant_id, v_type, v_key, v_fingerprint, p_actor_id, v_account.id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gestionar_cuenta_bancaria_tx(
  p_tenant_id uuid, p_actor_id uuid, p_cuenta_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.gestionar_cuenta_bancaria_tx_477($1, $2, $3, $4, $5);
$function$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cuentas_bancarias
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.financial_master_operations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.financial_master_operations TO service_role;
REVOKE ALL ON FUNCTION app.assert_financial_master_actor_477(uuid,uuid),
  app.financial_master_fingerprint_477(jsonb),
  app.gestionar_cuenta_bancaria_tx_477(uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gestionar_cuenta_bancaria_tx(uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_cuenta_bancaria_tx(uuid,uuid,uuid,jsonb,text)
  TO service_role;

COMMENT ON FUNCTION public.gestionar_cuenta_bancaria_tx(uuid,uuid,uuid,jsonb,text) IS
  'Alta/edición idempotente de maestro bancario; saldo inicial sólo mediante flujo contable explícito.';

COMMIT;
NOTIFY pgrst, 'reload schema';
