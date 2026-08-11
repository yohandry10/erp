-- Bancos y conciliacion: escritores atomicos, idempotentes y contables.
--
-- No crea datos operativos. Las escrituras quedan reservadas a service_role y
-- todos los actores se validan contra el tenant dentro de la transaccion.

BEGIN;

SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS saldo_inicial numeric(14,2),
  ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid REFERENCES public.plan_cuentas(id) ON DELETE RESTRICT;

-- El saldo inicial historico es la parte del saldo actual que no se explica por
-- el ledger. Se congela una vez y permite reconstruir cualquier corte posterior.
UPDATE public.cuentas_bancarias cb
SET saldo_inicial = round(
  coalesce(cb.saldo, 0) - coalesce((
    SELECT sum(CASE mb.tipo WHEN 'ABONO' THEN mb.monto ELSE -mb.monto END)
    FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = cb.tenant_id
      AND mb.cuenta_bancaria_id = cb.id
      AND coalesce(mb.es_extracto, false) = false
  ), 0),
  2
)
WHERE cb.saldo_inicial IS NULL;

ALTER TABLE public.cuentas_bancarias
  ALTER COLUMN saldo_inicial SET DEFAULT 0;

ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS moneda text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS cuenta_contrapartida_id uuid REFERENCES public.plan_cuentas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS operacion_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS movimiento_par_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS monto_moneda_local numeric(14,2),
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(18,6);

ALTER TABLE public.conciliaciones_bancarias
  ADD COLUMN IF NOT EXISTS saldo_inicial numeric(14,2),
  ADD COLUMN IF NOT EXISTS saldo_banco_inicial numeric(14,2),
  ADD COLUMN IF NOT EXISTS extracto_importado_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_conciliaciones_cuenta_periodo_457
  ON public.conciliaciones_bancarias (tenant_id, cuenta_bancaria_id, periodo);

CREATE UNIQUE INDEX IF NOT EXISTS ux_conciliaciones_create_key_457
  ON public.conciliaciones_bancarias (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.operaciones_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  cuenta_origen_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  cuenta_destino_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  cuenta_contrapartida_id uuid REFERENCES public.plan_cuentas(id) ON DELETE RESTRICT,
  conciliacion_id uuid REFERENCES public.conciliaciones_bancarias(id) ON DELETE RESTRICT,
  movimiento_origen_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  movimiento_destino_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  monto numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  categoria text NOT NULL,
  event_id uuid,
  resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_operaciones_bancarias_tipo_457 CHECK (
    tipo IN ('MOVIMIENTO_MANUAL', 'TRANSFERENCIA_INTERNA', 'AJUSTE_CONCILIACION')
  ),
  CONSTRAINT ck_operaciones_bancarias_key_457 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 180
  ),
  CONSTRAINT ck_operaciones_bancarias_monto_457 CHECK (monto > 0),
  CONSTRAINT ck_operaciones_bancarias_moneda_457 CHECK (moneda ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_bancarias_key_457
  ON public.operaciones_bancarias (tenant_id, tipo, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_bancarias_event_457
  ON public.operaciones_bancarias (event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_bancarias_mov_origen_457
  ON public.operaciones_bancarias (tenant_id, movimiento_origen_id)
  WHERE movimiento_origen_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_bancarias_mov_destino_457
  ON public.operaciones_bancarias (tenant_id, movimiento_destino_id)
  WHERE movimiento_destino_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.conciliacion_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conciliacion_id uuid NOT NULL REFERENCES public.conciliaciones_bancarias(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_conciliacion_operaciones_tipo_457 CHECK (
    tipo IN ('IMPORTAR', 'MATCH_MANUAL', 'MATCH_LOTE', 'MATCH_AUTO', 'CERRAR')
  ),
  CONSTRAINT ck_conciliacion_operaciones_key_457 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 180
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_conciliacion_operaciones_key_457
  ON public.conciliacion_operaciones (tenant_id, tipo, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_conciliacion_extracto_unico_457
  ON public.conciliacion_operaciones (tenant_id, conciliacion_id, tipo)
  WHERE tipo = 'IMPORTAR';

SELECT app.apply_tenant_policy('public', 'operaciones_bancarias');
ALTER TABLE public.operaciones_bancarias FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'conciliacion_operaciones');
ALTER TABLE public.conciliacion_operaciones FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.bank_fingerprint_457(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.transferir_entre_cuentas_bancarias_tx_457(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_source_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_origen_id', ''));
  v_destination_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_destino_id', ''));
  v_amount numeric := nullif(p_payload->>'monto', '')::numeric;
  v_date date := nullif(p_payload->>'fecha', '')::date;
  v_description text := nullif(btrim(coalesce(p_payload->>'descripcion', '')), '');
  v_reference text := nullif(btrim(coalesce(p_payload->>'referencia', '')), '');
  v_currency text := upper(btrim(coalesce(p_payload->>'moneda', '')));
  v_rate numeric := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_source public.cuentas_bancarias%ROWTYPE;
  v_destination public.cuentas_bancarias%ROWTYPE;
  v_locked public.cuentas_bancarias%ROWTYPE;
  v_source_ledger public.plan_cuentas%ROWTYPE;
  v_destination_ledger public.plan_cuentas%ROWTYPE;
  v_local_currency text;
  v_local_amount numeric(14,2);
  v_source_old numeric(14,2);
  v_source_new numeric(14,2);
  v_destination_old numeric(14,2);
  v_destination_new numeric(14,2);
  v_operation_id uuid := gen_random_uuid();
  v_source_movement public.movimientos_bancarios%ROWTYPE;
  v_destination_movement public.movimientos_bancarios%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_source_id IS NULL OR v_destination_id IS NULL OR v_source_id = v_destination_id
     OR v_amount IS NULL OR v_amount <= 0 OR v_amount > 999999999999::numeric
     OR v_date IS NULL OR v_description IS NULL OR length(v_description) > 300
     OR v_currency !~ '^[A-Z]{3}$'
     OR (v_reference IS NOT NULL AND length(v_reference) > 120) THEN
    RAISE EXCEPTION 'BANK_TRANSFER_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_amount := round(v_amount, 2);
  v_canonical := jsonb_build_object(
    'cuenta_origen_id', v_source_id, 'cuenta_destino_id', v_destination_id,
    'monto', v_amount, 'fecha', v_date, 'descripcion', v_description,
    'referencia', v_reference, 'moneda', v_currency,
    'tipo_cambio', CASE WHEN v_rate IS NULL THEN NULL ELSE round(v_rate, 6) END
  );
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:TRANSFER:%s', p_tenant_id, v_key), 0));
  v_existing := app.bank_operation_existing_457(p_tenant_id, 'TRANSFERENCIA_INTERNA', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- Orden estable de locks: dos transferencias inversas no pueden interbloquearse.
  FOR v_locked IN
    SELECT * FROM public.cuentas_bancarias cb
    WHERE cb.tenant_id = p_tenant_id AND cb.id IN (v_source_id, v_destination_id)
    ORDER BY cb.id
    FOR UPDATE
  LOOP
    IF v_locked.id = v_source_id THEN v_source := v_locked; END IF;
    IF v_locked.id = v_destination_id THEN v_destination := v_locked; END IF;
  END LOOP;
  IF v_source.id IS NULL OR v_destination.id IS NULL
     OR NOT coalesce(v_source.activa, false) OR NOT coalesce(v_destination.activa, false)
     OR lower(coalesce(v_source.estado, 'activo')) <> 'activo'
     OR lower(coalesce(v_destination.estado, 'activo')) <> 'activo' THEN
    RAISE EXCEPTION 'BANK_TRANSFER_ACCOUNT_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_source.moneda) IS DISTINCT FROM v_currency
     OR upper(v_destination.moneda) IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'BANK_TRANSFER_REQUIRES_SAME_ACCOUNT_CURRENCY' USING ERRCODE = '23514';
  END IF;
  v_source_ledger := app.assert_postable_account_457(p_tenant_id, v_source.cuenta_contable_id, 'SOURCE');
  v_destination_ledger := app.assert_postable_account_457(p_tenant_id, v_destination.cuenta_contable_id, 'DESTINATION');
  IF v_source_ledger.id = v_destination_ledger.id THEN
    RAISE EXCEPTION 'BANK_TRANSFER_REQUIRES_DISTINCT_LEDGER_ACCOUNTS' USING ERRCODE = '23514';
  END IF;

  v_local_currency := app.bank_local_currency_457(p_tenant_id);
  IF v_currency = v_local_currency THEN
    IF v_rate IS NOT NULL AND round(v_rate, 6) <> 1 THEN
      RAISE EXCEPTION 'BANK_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'BANK_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE
    v_rate := round(v_rate, 6);
  END IF;
  v_local_amount := round(v_amount * v_rate, 2);
  v_source_old := round(coalesce(v_source.saldo, 0), 2);
  v_source_new := round(v_source_old - v_amount, 2);
  v_destination_old := round(coalesce(v_destination.saldo, 0), 2);
  v_destination_new := round(v_destination_old + v_amount, 2);
  IF v_source_new < 0 AND NOT coalesce(v_source.permite_sobregiro, false) THEN
    RAISE EXCEPTION 'BANK_INSUFFICIENT_FUNDS' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.movimientos_bancarios (
    tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
    metodo_pago, conciliado, es_extracto, saldo_anterior, saldo_nuevo, created_by,
    idempotency_key, moneda, categoria, operacion_bancaria_id,
    request_fingerprint, monto_moneda_local, tipo_cambio, activo, estado
  ) VALUES (
    p_tenant_id, v_source_id, 'CARGO', v_amount, v_date, v_description, v_reference,
    'TRANSFERENCIA', false, false, v_source_old, v_source_new, p_actor_id,
    v_key || ':OUT', v_currency, 'TRANSFERENCIA_INTERNA', v_operation_id,
    v_fingerprint, v_local_amount, v_rate, true, 'ACTIVO'
  ) RETURNING * INTO v_source_movement;
  INSERT INTO public.movimientos_bancarios (
    tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
    metodo_pago, conciliado, es_extracto, saldo_anterior, saldo_nuevo, created_by,
    idempotency_key, moneda, categoria, operacion_bancaria_id,
    request_fingerprint, monto_moneda_local, tipo_cambio, movimiento_par_id,
    activo, estado
  ) VALUES (
    p_tenant_id, v_destination_id, 'ABONO', v_amount, v_date, v_description, v_reference,
    'TRANSFERENCIA', false, false, v_destination_old, v_destination_new, p_actor_id,
    v_key || ':IN', v_currency, 'TRANSFERENCIA_INTERNA', v_operation_id,
    v_fingerprint, v_local_amount, v_rate, v_source_movement.id, true, 'ACTIVO'
  ) RETURNING * INTO v_destination_movement;
  UPDATE public.movimientos_bancarios
  SET movimiento_par_id = v_destination_movement.id, updated_at = clock_timestamp()
  WHERE id = v_source_movement.id AND tenant_id = p_tenant_id;

  UPDATE public.cuentas_bancarias
  SET saldo = CASE id WHEN v_source_id THEN v_source_new ELSE v_destination_new END,
      saldo_actual = CASE id WHEN v_source_id THEN v_source_new ELSE v_destination_new END,
      saldo_contable = CASE id WHEN v_source_id THEN v_source_new ELSE v_destination_new END,
      updated_by = p_actor_id, updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id IN (v_source_id, v_destination_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_TRANSFER_BALANCE_UPDATE_LOST' USING ERRCODE = '40001'; END IF;

  v_event_key := format('banco.transferencia.registrada:%s:%s', p_tenant_id, v_operation_id);
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'operacion_id', v_operation_id,
    'movimiento_origen_id', v_source_movement.id,
    'movimiento_destino_id', v_destination_movement.id,
    'event_id', v_event_id, 'monto', v_amount, 'moneda', v_currency,
    'saldo_origen_nuevo', v_source_new, 'saldo_destino_nuevo', v_destination_new
  );
  INSERT INTO public.operaciones_bancarias (
    id, tenant_id, tipo, idempotency_key, fingerprint, actor_id,
    cuenta_origen_id, cuenta_destino_id, movimiento_origen_id,
    movimiento_destino_id, monto, moneda, categoria, event_id, resultado
  ) VALUES (
    v_operation_id, p_tenant_id, 'TRANSFERENCIA_INTERNA', v_key, v_fingerprint, p_actor_id,
    v_source_id, v_destination_id, v_source_movement.id,
    v_destination_movement.id, v_amount, v_currency, 'TRANSFERENCIA_INTERNA', v_event_id, v_result
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'operacion_bancaria', v_operation_id::text,
    'banco.transferencia.registrada',
    jsonb_build_object(
      'eventId', v_event_id, 'tenantId', p_tenant_id,
      'operacionId', v_operation_id,
      'movimientoOrigenId', v_source_movement.id,
      'movimientoDestinoId', v_destination_movement.id,
      'cuentaOrigenId', v_source_id, 'cuentaDestinoId', v_destination_id,
      'cuentaOrigenContableId', v_source_ledger.id,
      'cuentaOrigenCodigo', v_source_ledger.codigo,
      'cuentaDestinoContableId', v_destination_ledger.id,
      'cuentaDestinoCodigo', v_destination_ledger.codigo,
      'monto', v_local_amount, 'montoOrigen', v_amount,
      'moneda', v_currency, 'monedaLocal', v_local_currency,
      'tipoCambio', v_rate, 'fecha', v_date,
      'descripcion', v_description,
      'referencia', coalesce(v_reference, format('TRANSFER:%s', v_operation_id)),
      'actorId', p_actor_id, 'accountingHandledByOutbox', true
    ),
    'pending', 0, v_event_key, v_event_id, clock_timestamp()
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.match_bank_pair_457(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_sistema_id uuid,
  p_extracto_id uuid,
  p_actor_id uuid,
  p_automatico boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_reconciliation public.conciliaciones_bancarias%ROWTYPE;
  v_system public.movimientos_bancarios%ROWTYPE;
  v_statement public.movimientos_bancarios%ROWTYPE;
BEGIN
  SELECT * INTO v_reconciliation FROM public.conciliaciones_bancarias c
  WHERE c.id = p_conciliacion_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_RECONCILIATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_reconciliation.estado::text) = 'cerrada' THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_ALREADY_CLOSED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_system FROM public.movimientos_bancarios mb
  WHERE mb.id = p_sistema_id AND mb.tenant_id = p_tenant_id
    AND mb.cuenta_bancaria_id = v_reconciliation.cuenta_bancaria_id
    AND coalesce(mb.es_extracto, false) = false
    AND mb.fecha BETWEEN v_reconciliation.fecha_desde AND v_reconciliation.fecha_hasta
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_SYSTEM_MOVEMENT_NOT_IN_RECONCILIATION_PERIOD' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_statement FROM public.movimientos_bancarios mb
  WHERE mb.id = p_extracto_id AND mb.tenant_id = p_tenant_id
    AND mb.cuenta_bancaria_id = v_reconciliation.cuenta_bancaria_id
    AND coalesce(mb.es_extracto, false) = true
    AND mb.conciliacion_id = p_conciliacion_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_STATEMENT_MOVEMENT_NOT_IN_RECONCILIATION' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(v_system.conciliado, false) OR coalesce(v_statement.conciliado, false) THEN
    RAISE EXCEPTION 'BANK_MOVEMENT_ALREADY_MATCHED' USING ERRCODE = '23505';
  END IF;
  IF v_system.tipo IS DISTINCT FROM v_statement.tipo
     OR round(v_system.monto, 2) IS DISTINCT FROM round(v_statement.monto, 2) THEN
    RAISE EXCEPTION 'BANK_MATCH_REQUIRES_EXACT_TYPE_AND_AMOUNT;_REGISTER_EXPLICIT_ADJUSTMENT_FIRST'
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.movimientos_bancarios
  SET conciliado = true, conciliacion_id = p_conciliacion_id,
      match_automatico = p_automatico, match_id = v_statement.id,
      movimiento_relacionado_id = v_statement.id, diferencia_conciliacion = 0,
      updated_by = p_actor_id, updated_at = clock_timestamp()
  WHERE id = v_system.id AND tenant_id = p_tenant_id;
  UPDATE public.movimientos_bancarios
  SET conciliado = true, match_automatico = p_automatico, match_id = v_system.id,
      movimiento_relacionado_id = v_system.id, diferencia_conciliacion = 0,
      updated_by = p_actor_id, updated_at = clock_timestamp()
  WHERE id = v_statement.id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object(
    'movimiento_sistema_id', v_system.id,
    'movimiento_extracto_id', v_statement.id,
    'match_automatico', p_automatico, 'diferencia', 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.conciliar_movimiento_bancario_tx_457(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_movimiento_sistema_id uuid,
  p_movimiento_extracto_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 180 OR p_conciliacion_id IS NULL
     OR p_movimiento_sistema_id IS NULL OR p_movimiento_extracto_id IS NULL THEN
    RAISE EXCEPTION 'BANK_MATCH_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'conciliacion_id', p_conciliacion_id,
    'movimiento_sistema_id', p_movimiento_sistema_id,
    'movimiento_extracto_id', p_movimiento_extracto_id
  );
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECON_MATCH:%s', p_tenant_id, v_key), 0));
  v_existing := app.conciliation_operation_existing_457(p_tenant_id, 'MATCH_MANUAL', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  v_result := app.match_bank_pair_457(
    p_tenant_id, p_conciliacion_id, p_movimiento_sistema_id,
    p_movimiento_extracto_id, p_actor_id, false
  ) || jsonb_build_object('success', true, 'idempotent', false);
  INSERT INTO public.conciliacion_operaciones (
    tenant_id, conciliacion_id, tipo, idempotency_key, fingerprint, actor_id, resultado
  ) VALUES (
    p_tenant_id, p_conciliacion_id, 'MATCH_MANUAL', v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.conciliar_lote_bancario_tx_457(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_pares jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_pair record;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 180 OR p_conciliacion_id IS NULL
     OR jsonb_typeof(coalesce(p_pares, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_pares) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'BANK_MATCH_BATCH_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_pares) x(movimiento_sistema_id uuid, movimiento_extracto_id uuid)
    GROUP BY movimiento_sistema_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_pares) x(movimiento_sistema_id uuid, movimiento_extracto_id uuid)
    GROUP BY movimiento_extracto_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'BANK_MATCH_BATCH_CONTAINS_DUPLICATE_MOVEMENTS' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'movimiento_sistema_id', x.movimiento_sistema_id,
    'movimiento_extracto_id', x.movimiento_extracto_id
  ) ORDER BY x.movimiento_sistema_id, x.movimiento_extracto_id), '[]'::jsonb)
  INTO v_canonical
  FROM jsonb_to_recordset(p_pares) x(movimiento_sistema_id uuid, movimiento_extracto_id uuid);
  v_canonical := jsonb_build_object('conciliacion_id', p_conciliacion_id, 'pares', v_canonical);
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECON_BATCH:%s', p_tenant_id, v_key), 0));
  v_existing := app.conciliation_operation_existing_457(p_tenant_id, 'MATCH_LOTE', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  FOR v_pair IN
    SELECT * FROM jsonb_to_recordset(p_pares)
      x(movimiento_sistema_id uuid, movimiento_extracto_id uuid)
    ORDER BY movimiento_sistema_id, movimiento_extracto_id
  LOOP
    v_results := v_results || jsonb_build_array(app.match_bank_pair_457(
      p_tenant_id, p_conciliacion_id, v_pair.movimiento_sistema_id,
      v_pair.movimiento_extracto_id, p_actor_id, false
    ));
  END LOOP;
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false,
    'matches_realizados', jsonb_array_length(v_results), 'matches', v_results
  );
  INSERT INTO public.conciliacion_operaciones (
    tenant_id, conciliacion_id, tipo, idempotency_key, fingerprint, actor_id, resultado
  ) VALUES (
    p_tenant_id, p_conciliacion_id, 'MATCH_LOTE', v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.conciliar_automaticamente_tx_457(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_tolerancia_dias integer,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_tolerance integer := coalesce(p_tolerancia_dias, 2);
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_reconciliation public.conciliaciones_bancarias%ROWTYPE;
  v_statement public.movimientos_bancarios%ROWTYPE;
  v_system public.movimientos_bancarios%ROWTYPE;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 180 OR p_conciliacion_id IS NULL
     OR v_tolerance NOT BETWEEN 0 AND 7 THEN
    RAISE EXCEPTION 'BANK_AUTO_MATCH_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'conciliacion_id', p_conciliacion_id, 'tolerancia_dias', v_tolerance
  );
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECON_AUTO:%s', p_tenant_id, v_key), 0));
  v_existing := app.conciliation_operation_existing_457(p_tenant_id, 'MATCH_AUTO', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_reconciliation FROM public.conciliaciones_bancarias c
  WHERE c.id = p_conciliacion_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_RECONCILIATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_reconciliation.estado::text) = 'cerrada' THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_ALREADY_CLOSED' USING ERRCODE = '23514';
  END IF;

  -- Las filas se toman en un orden total. Referencia exacta gana; si no existe,
  -- monto/tipo exactos y la fecha mas cercana resuelven el candidato.
  FOR v_statement IN
    SELECT * FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id AND mb.conciliacion_id = p_conciliacion_id
      AND coalesce(mb.es_extracto, false) AND NOT coalesce(mb.conciliado, false)
    ORDER BY mb.fecha, mb.id
    FOR UPDATE
  LOOP
    v_system.id := NULL;
    SELECT * INTO v_system FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id
      AND mb.cuenta_bancaria_id = v_reconciliation.cuenta_bancaria_id
      AND coalesce(mb.es_extracto, false) = false
      AND NOT coalesce(mb.conciliado, false)
      AND mb.fecha BETWEEN v_reconciliation.fecha_desde AND v_reconciliation.fecha_hasta
      AND mb.tipo = v_statement.tipo AND round(mb.monto, 2) = round(v_statement.monto, 2)
      AND abs(mb.fecha - v_statement.fecha) <= v_tolerance
    ORDER BY
      CASE WHEN v_statement.referencia IS NOT NULL
             AND mb.referencia = v_statement.referencia THEN 0 ELSE 1 END,
      abs(mb.fecha - v_statement.fecha), mb.fecha, mb.id
    LIMIT 1 FOR UPDATE;
    IF v_system.id IS NOT NULL THEN
      v_results := v_results || jsonb_build_array(app.match_bank_pair_457(
        p_tenant_id, p_conciliacion_id, v_system.id, v_statement.id, p_actor_id, true
      ));
    END IF;
  END LOOP;
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false,
    'matches_realizados', jsonb_array_length(v_results), 'matches', v_results
  );
  INSERT INTO public.conciliacion_operaciones (
    tenant_id, conciliacion_id, tipo, idempotency_key, fingerprint, actor_id, resultado
  ) VALUES (
    p_tenant_id, p_conciliacion_id, 'MATCH_AUTO', v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cerrar_conciliacion_bancaria_tx_457(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_reconciliation public.conciliaciones_bancarias%ROWTYPE;
  v_account public.cuentas_bancarias%ROWTYPE;
  v_opening numeric(14,2);
  v_closing numeric(14,2);
  v_pending_system integer;
  v_pending_statement integer;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 180 OR p_conciliacion_id IS NULL THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_CLOSE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('conciliacion_id', p_conciliacion_id);
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECON_CLOSE:%s', p_tenant_id, v_key), 0));
  v_existing := app.conciliation_operation_existing_457(p_tenant_id, 'CERRAR', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_reconciliation FROM public.conciliaciones_bancarias c
  WHERE c.id = p_conciliacion_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_RECONCILIATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_reconciliation.estado::text) = 'cerrada' THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_CLOSED_WITH_DIFFERENT_KEY' USING ERRCODE = '23505';
  END IF;
  IF v_reconciliation.extracto_importado_at IS NULL THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_REQUIRES_IMPORTED_STATEMENT' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_account FROM public.cuentas_bancarias cb
  WHERE cb.id = v_reconciliation.cuenta_bancaria_id AND cb.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Bloquea todos los items antes de contar para impedir un match o movimiento
  -- concurrente entre la validacion y el cierre.
  PERFORM 1 FROM public.movimientos_bancarios mb
  WHERE mb.tenant_id = p_tenant_id AND mb.cuenta_bancaria_id = v_account.id
    AND (
      (coalesce(mb.es_extracto, false) AND mb.conciliacion_id = p_conciliacion_id)
      OR (coalesce(mb.es_extracto, false) = false
          AND mb.fecha BETWEEN v_reconciliation.fecha_desde AND v_reconciliation.fecha_hasta)
    )
  ORDER BY mb.id FOR UPDATE;

  SELECT count(*) INTO v_pending_statement FROM public.movimientos_bancarios mb
  WHERE mb.tenant_id = p_tenant_id AND mb.conciliacion_id = p_conciliacion_id
    AND coalesce(mb.es_extracto, false) AND NOT coalesce(mb.conciliado, false);
  SELECT count(*) INTO v_pending_system FROM public.movimientos_bancarios mb
  WHERE mb.tenant_id = p_tenant_id AND mb.cuenta_bancaria_id = v_account.id
    AND coalesce(mb.es_extracto, false) = false
    AND mb.fecha BETWEEN v_reconciliation.fecha_desde AND v_reconciliation.fecha_hasta
    AND (NOT coalesce(mb.conciliado, false) OR mb.conciliacion_id IS DISTINCT FROM p_conciliacion_id);
  IF v_pending_statement > 0 OR v_pending_system > 0 THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_HAS_PENDING_ITEMS_SYSTEM_%_STATEMENT_%',
      v_pending_system, v_pending_statement USING ERRCODE = '23514';
  END IF;

  v_opening := round(coalesce(v_account.saldo_inicial, 0) + coalesce((
    SELECT sum(CASE mb.tipo WHEN 'ABONO' THEN mb.monto ELSE -mb.monto END)
    FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id AND mb.cuenta_bancaria_id = v_account.id
      AND coalesce(mb.es_extracto, false) = false AND mb.fecha < v_reconciliation.fecha_desde
  ), 0), 2);
  v_closing := round(coalesce(v_account.saldo_inicial, 0) + coalesce((
    SELECT sum(CASE mb.tipo WHEN 'ABONO' THEN mb.monto ELSE -mb.monto END)
    FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id AND mb.cuenta_bancaria_id = v_account.id
      AND coalesce(mb.es_extracto, false) = false AND mb.fecha <= v_reconciliation.fecha_hasta
  ), 0), 2);
  IF v_opening IS DISTINCT FROM round(v_reconciliation.saldo_banco_inicial, 2)
     OR v_closing IS DISTINCT FROM round(v_reconciliation.saldo_banco, 2) THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_DIFFERENCE_REQUIRES_EXPLICIT_ACCOUNTED_ADJUSTMENT'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.conciliaciones_bancarias
  SET saldo_inicial = v_opening, saldo_libro = v_closing,
      diferencia = 0, estado = 'CERRADA', cerrado_at = clock_timestamp(),
      cerrado_by = p_actor_id, updated_by = p_actor_id, updated_at = clock_timestamp()
  WHERE id = p_conciliacion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_reconciliation;
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false,
    'conciliacion', to_jsonb(v_reconciliation),
    'pendientes_sistema', 0, 'pendientes_extracto', 0
  );
  INSERT INTO public.conciliacion_operaciones (
    tenant_id, conciliacion_id, tipo, idempotency_key, fingerprint, actor_id, resultado
  ) VALUES (
    p_tenant_id, p_conciliacion_id, 'CERRAR', v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.prevent_closed_bank_reconciliation_mutation_457()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old_reconciliation_id uuid;
  v_new_reconciliation_id uuid;
  v_period public.conciliaciones_bancarias%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_reconciliation_id := OLD.conciliacion_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_reconciliation_id := NEW.conciliacion_id;
  END IF;

  IF v_old_reconciliation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conciliaciones_bancarias c
    WHERE c.id = v_old_reconciliation_id AND c.tenant_id = OLD.tenant_id
      AND lower(c.estado::text) = 'cerrada'
  ) THEN
    RAISE EXCEPTION 'BANK_CLOSED_RECONCILIATION_ITEMS_ARE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF v_new_reconciliation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conciliaciones_bancarias c
    WHERE c.id = v_new_reconciliation_id AND c.tenant_id = NEW.tenant_id
      AND lower(c.estado::text) = 'cerrada'
  ) THEN
    RAISE EXCEPTION 'BANK_CLOSED_RECONCILIATION_ITEMS_ARE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  -- Un movimiento del sistema sin conciliacion_id tambien afecta el libro del
  -- periodo. FOR SHARE lo serializa contra cerrar(...), que toma FOR UPDATE:
  -- o el cierre ve el movimiento confirmado, o la escritura ve el cierre y falla.
  IF TG_OP <> 'INSERT' AND coalesce(OLD.es_extracto, false) = false THEN
    SELECT * INTO v_period
    FROM public.conciliaciones_bancarias c
    WHERE c.tenant_id = OLD.tenant_id
      AND c.cuenta_bancaria_id = OLD.cuenta_bancaria_id
      AND OLD.fecha BETWEEN c.fecha_desde AND c.fecha_hasta
    ORDER BY c.fecha_desde, c.id
    LIMIT 1
    FOR SHARE;
    IF FOUND AND lower(v_period.estado::text) = 'cerrada' THEN
      RAISE EXCEPTION 'BANK_CLOSED_RECONCILIATION_PERIOD_IS_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND coalesce(NEW.es_extracto, false) = false THEN
    v_period.id := NULL;
    SELECT * INTO v_period
    FROM public.conciliaciones_bancarias c
    WHERE c.tenant_id = NEW.tenant_id
      AND c.cuenta_bancaria_id = NEW.cuenta_bancaria_id
      AND NEW.fecha BETWEEN c.fecha_desde AND c.fecha_hasta
    ORDER BY c.fecha_desde, c.id
    LIMIT 1
    FOR SHARE;
    IF FOUND AND lower(v_period.estado::text) = 'cerrada' THEN
      RAISE EXCEPTION 'BANK_CLOSED_RECONCILIATION_PERIOD_IS_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_closed_bank_items_immutable_457 ON public.movimientos_bancarios;
CREATE TRIGGER trg_closed_bank_items_immutable_457
BEFORE INSERT OR UPDATE OR DELETE ON public.movimientos_bancarios
FOR EACH ROW EXECUTE FUNCTION app.prevent_closed_bank_reconciliation_mutation_457();

CREATE OR REPLACE FUNCTION app.prevent_closed_bank_reconciliation_row_457()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF lower(OLD.estado::text) = 'cerrada' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'BANK_CLOSED_RECONCILIATION_IS_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_closed_bank_reconciliation_immutable_457 ON public.conciliaciones_bancarias;
CREATE TRIGGER trg_closed_bank_reconciliation_immutable_457
BEFORE UPDATE ON public.conciliaciones_bancarias
FOR EACH ROW EXECUTE FUNCTION app.prevent_closed_bank_reconciliation_row_457();

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.operaciones_bancarias, public.conciliacion_operaciones,
  public.movimientos_bancarios, public.conciliaciones_bancarias
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.conciliation_operation_existing_457(
  p_tenant_id uuid,
  p_tipo text,
  p_key text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_operation public.conciliacion_operaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_operation
  FROM public.conciliacion_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = p_tipo
    AND o.idempotency_key = p_key
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_operation.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
      USING ERRCODE = '23505';
  END IF;
  IF v_operation.resultado IS NULL THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_OPERATION_INCOMPLETE_RETRY'
      USING ERRCODE = '40001';
  END IF;
  RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
END;
$function$;

CREATE OR REPLACE FUNCTION app.crear_conciliacion_bancaria_tx_457(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_account_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_bancaria_id', ''));
  v_period text := btrim(coalesce(p_payload->>'periodo', ''));
  v_from date := nullif(p_payload->>'fecha_desde', '')::date;
  v_to date := nullif(p_payload->>'fecha_hasta', '')::date;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing public.conciliaciones_bancarias%ROWTYPE;
  v_account public.cuentas_bancarias%ROWTYPE;
  v_opening numeric(14,2);
  v_closing numeric(14,2);
  v_reconciliation public.conciliaciones_bancarias%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180 OR v_account_id IS NULL
     OR v_period !~ '^\d{4}-(0[1-9]|1[0-2])$' OR v_from IS NULL OR v_to IS NULL
     OR to_char(v_from, 'YYYY-MM') <> v_period
     OR v_from <> date_trunc('month', v_from)::date
     OR v_to <> (date_trunc('month', v_from) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_PERIOD_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'cuenta_bancaria_id', v_account_id, 'periodo', v_period,
    'fecha_desde', v_from, 'fecha_hasta', v_to
  );
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECON_CREATE:%s', p_tenant_id, v_key), 0));
  SELECT * INTO v_existing FROM public.conciliaciones_bancarias c
  WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'BANK_RECONCILIATION_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'conciliacion', to_jsonb(v_existing));
  END IF;

  SELECT * INTO v_account FROM public.cuentas_bancarias cb
  WHERE cb.id = v_account_id AND cb.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(v_account.activa, false) THEN
    RAISE EXCEPTION 'BANK_ACCOUNT_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app.assert_postable_account_457(p_tenant_id, v_account.cuenta_contable_id, 'LEDGER');

  v_opening := round(coalesce(v_account.saldo_inicial, 0) + coalesce((
    SELECT sum(CASE mb.tipo WHEN 'ABONO' THEN mb.monto ELSE -mb.monto END)
    FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id AND mb.cuenta_bancaria_id = v_account_id
      AND coalesce(mb.es_extracto, false) = false AND mb.fecha < v_from
  ), 0), 2);
  v_closing := round(coalesce(v_account.saldo_inicial, 0) + coalesce((
    SELECT sum(CASE mb.tipo WHEN 'ABONO' THEN mb.monto ELSE -mb.monto END)
    FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id AND mb.cuenta_bancaria_id = v_account_id
      AND coalesce(mb.es_extracto, false) = false AND mb.fecha <= v_to
  ), 0), 2);

  INSERT INTO public.conciliaciones_bancarias (
    tenant_id, cuenta_bancaria_id, periodo, fecha_desde, fecha_hasta,
    saldo_inicial, saldo_libro, saldo_banco, diferencia, estado,
    moneda, banco, numero_cuenta, nombre, created_by, updated_by,
    idempotency_key, request_fingerprint
  ) VALUES (
    p_tenant_id, v_account_id, v_period, v_from, v_to,
    v_opening, v_closing, v_closing, 0, 'ABIERTA',
    upper(v_account.moneda), v_account.banco, v_account.numero_cuenta,
    format('Conciliacion %s - %s', v_period, v_account.nombre),
    p_actor_id, p_actor_id, v_key, v_fingerprint
  ) RETURNING * INTO v_reconciliation;
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'conciliacion', to_jsonb(v_reconciliation)
  );
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  IF EXISTS (
    SELECT 1 FROM public.conciliaciones_bancarias c
    WHERE c.tenant_id = p_tenant_id AND c.cuenta_bancaria_id = v_account_id
      AND c.periodo = v_period
  ) THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_ALREADY_EXISTS_FOR_ACCOUNT_PERIOD'
      USING ERRCODE = '23505';
  END IF;
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION app.importar_extracto_bancario_tx_457(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_items jsonb := coalesce(p_payload->'movimientos', 'null'::jsonb);
  v_bank_opening numeric := nullif(p_payload->>'saldo_banco_inicial', '')::numeric;
  v_bank_closing numeric := nullif(p_payload->>'saldo_banco_final', '')::numeric;
  v_bank text := upper(btrim(coalesce(p_payload->>'banco', 'GENERICO')));
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_reconciliation public.conciliaciones_bancarias%ROWTYPE;
  v_item jsonb;
  v_index integer := 0;
  v_count integer;
  v_date date;
  v_type text;
  v_amount numeric;
  v_description text;
  v_reference text;
  v_net numeric(14,2) := 0;
  v_result jsonb;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 180 OR p_conciliacion_id IS NULL
     OR jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 10000
     OR v_bank_opening IS NULL OR v_bank_closing IS NULL THEN
    RAISE EXCEPTION 'BANK_STATEMENT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_bank_opening := round(v_bank_opening, 2);
  v_bank_closing := round(v_bank_closing, 2);
  v_canonical := jsonb_build_object(
    'conciliacion_id', p_conciliacion_id, 'banco', v_bank,
    'saldo_banco_inicial', v_bank_opening, 'saldo_banco_final', v_bank_closing,
    'movimientos', v_items
  );
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECON_IMPORT:%s', p_tenant_id, v_key), 0));
  v_existing := app.conciliation_operation_existing_457(p_tenant_id, 'IMPORTAR', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_reconciliation FROM public.conciliaciones_bancarias c
  WHERE c.id = p_conciliacion_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_RECONCILIATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_reconciliation.estado::text) = 'cerrada' THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_ALREADY_CLOSED' USING ERRCODE = '23514';
  END IF;
  IF v_reconciliation.extracto_importado_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.conciliacion_operaciones o
    WHERE o.tenant_id = p_tenant_id AND o.conciliacion_id = p_conciliacion_id
      AND o.tipo = 'IMPORTAR'
  ) THEN
    RAISE EXCEPTION 'BANK_STATEMENT_ALREADY_IMPORTED' USING ERRCODE = '23505';
  END IF;
  IF v_bank_opening IS DISTINCT FROM round(v_reconciliation.saldo_inicial, 2) THEN
    RAISE EXCEPTION 'BANK_STATEMENT_OPENING_BALANCE_MISMATCH_REQUIRES_PRIOR_PERIOD'
      USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_index := v_index + 1;
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'BANK_STATEMENT_ITEM_INVALID_AT_%', v_index USING ERRCODE = '22023';
    END IF;
    v_date := nullif(v_item->>'fecha', '')::date;
    v_type := upper(btrim(coalesce(v_item->>'tipo', '')));
    v_amount := nullif(v_item->>'monto', '')::numeric;
    v_description := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
    v_reference := nullif(btrim(coalesce(v_item->>'referencia', '')), '');
    IF v_date IS NULL OR v_date < v_reconciliation.fecha_desde OR v_date > v_reconciliation.fecha_hasta
       OR v_type NOT IN ('ABONO', 'CARGO') OR v_amount IS NULL OR v_amount <= 0
       OR v_description IS NULL OR length(v_description) > 300
       OR (v_reference IS NOT NULL AND length(v_reference) > 120) THEN
      RAISE EXCEPTION 'BANK_STATEMENT_ITEM_INVALID_AT_%', v_index USING ERRCODE = '22023';
    END IF;
    v_amount := round(v_amount, 2);
    v_net := round(v_net + CASE WHEN v_type = 'ABONO' THEN v_amount ELSE -v_amount END, 2);
  END LOOP;
  IF round(v_bank_opening + v_net, 2) IS DISTINCT FROM v_bank_closing THEN
    RAISE EXCEPTION 'BANK_STATEMENT_BALANCE_DOES_NOT_MATCH_ITEMS' USING ERRCODE = '23514';
  END IF;

  v_index := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_index := v_index + 1;
    INSERT INTO public.movimientos_bancarios (
      tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
      conciliacion_id, conciliado, es_extracto, match_automatico,
      created_by, idempotency_key, moneda, categoria, request_fingerprint,
      activo, estado
    ) VALUES (
      p_tenant_id, v_reconciliation.cuenta_bancaria_id,
      upper(btrim(v_item->>'tipo')), round((v_item->>'monto')::numeric, 2),
      (v_item->>'fecha')::date, btrim(v_item->>'descripcion'),
      nullif(btrim(coalesce(v_item->>'referencia', '')), ''),
      p_conciliacion_id, false, true, false, p_actor_id,
      format('%s:%s', v_key, lpad(v_index::text, 5, '0')),
      v_reconciliation.moneda, 'EXTRACTO_BANCARIO', v_fingerprint,
      true, 'ACTIVO'
    );
  END LOOP;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.conciliaciones_bancarias
  SET saldo_banco_inicial = v_bank_opening,
      saldo_banco = v_bank_closing,
      diferencia = round(saldo_libro - v_bank_closing, 2),
      estado = 'EN_PROCESO', extracto_importado_at = clock_timestamp(),
      updated_by = p_actor_id, updated_at = clock_timestamp()
  WHERE id = p_conciliacion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_reconciliation;

  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'conciliacion_id', p_conciliacion_id,
    'movimientos_importados', jsonb_array_length(v_items),
    'saldo_banco_inicial', v_bank_opening, 'saldo_banco_final', v_bank_closing,
    'total_abonos', round(coalesce((SELECT sum((x->>'monto')::numeric) FROM jsonb_array_elements(v_items) x WHERE upper(x->>'tipo') = 'ABONO'), 0), 2),
    'total_cargos', round(coalesce((SELECT sum((x->>'monto')::numeric) FROM jsonb_array_elements(v_items) x WHERE upper(x->>'tipo') = 'CARGO'), 0), 2),
    'diferencia', v_reconciliation.diferencia
  );
  INSERT INTO public.conciliacion_operaciones (
    tenant_id, conciliacion_id, tipo, idempotency_key, fingerprint,
    actor_id, resultado
  ) VALUES (
    p_tenant_id, p_conciliacion_id, 'IMPORTAR', v_key, v_fingerprint,
    p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.assert_bank_actor_457(p_tenant_id uuid, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, false)
      AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'BANK_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.assert_postable_account_457(
  p_tenant_id uuid,
  p_account_id uuid,
  p_label text
)
RETURNS public.plan_cuentas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_account public.plan_cuentas%ROWTYPE;
BEGIN
  SELECT * INTO v_account
  FROM public.plan_cuentas pc
  WHERE pc.id = p_account_id
    AND pc.tenant_id = p_tenant_id
    AND coalesce(pc.acepta_movimiento, false)
    AND lower(coalesce(pc.estado::text, 'activo')) = 'activo'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_%_ACCOUNT_NOT_POSTABLE_IN_TENANT', upper(p_label)
      USING ERRCODE = '23514';
  END IF;
  RETURN v_account;
END;
$function$;

CREATE OR REPLACE FUNCTION app.bank_local_currency_457(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT CASE
    WHEN to_regprocedure('app.treasury_local_currency_452(uuid)') IS NOT NULL
      THEN app.treasury_local_currency_452(p_tenant_id)
    ELSE upper(coalesce((
      SELECT nullif(btrim(coalesce(ec.moneda_defecto, ec.moneda, '')), '')
      FROM public.empresa_config ec
      WHERE ec.tenant_id = p_tenant_id
      ORDER BY ec.updated_at DESC NULLS LAST, ec.id LIMIT 1
    ), 'PEN'))
  END
$function$;

CREATE OR REPLACE FUNCTION app.bank_operation_existing_457(
  p_tenant_id uuid,
  p_tipo text,
  p_key text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_operation public.operaciones_bancarias%ROWTYPE;
BEGIN
  SELECT * INTO v_operation
  FROM public.operaciones_bancarias o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = p_tipo
    AND o.idempotency_key = p_key
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_operation.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'BANK_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
      USING ERRCODE = '23505';
  END IF;
  IF v_operation.resultado IS NULL THEN
    RAISE EXCEPTION 'BANK_OPERATION_INCOMPLETE_RETRY' USING ERRCODE = '40001';
  END IF;
  RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
END;
$function$;

CREATE OR REPLACE FUNCTION app.registrar_movimiento_bancario_tx_457(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_account_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_bancaria_id', ''));
  v_counter_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_contrapartida_id', ''));
  v_reconciliation_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'conciliacion_id', ''));
  v_type text := upper(btrim(coalesce(p_payload->>'tipo', '')));
  v_amount numeric := nullif(p_payload->>'monto', '')::numeric;
  v_date date := nullif(p_payload->>'fecha', '')::date;
  v_description text := nullif(btrim(coalesce(p_payload->>'descripcion', '')), '');
  v_reference text := nullif(btrim(coalesce(p_payload->>'referencia', '')), '');
  v_method text := nullif(upper(btrim(coalesce(p_payload->>'metodo_pago', ''))), '');
  v_category text := upper(btrim(coalesce(p_payload->>'categoria', '')));
  v_currency text := upper(btrim(coalesce(p_payload->>'moneda', '')));
  v_rate numeric := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_account public.cuentas_bancarias%ROWTYPE;
  v_bank_ledger public.plan_cuentas%ROWTYPE;
  v_counter public.plan_cuentas%ROWTYPE;
  v_local_currency text;
  v_local_amount numeric(14,2);
  v_old numeric(14,2);
  v_new numeric(14,2);
  v_operation_id uuid := gen_random_uuid();
  v_movement public.movimientos_bancarios%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
  v_operation_type text;
  v_reconciliation public.conciliaciones_bancarias%ROWTYPE;
BEGIN
  PERFORM app.assert_bank_actor_457(p_tenant_id, p_actor_id);
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_account_id IS NULL OR v_counter_id IS NULL
     OR v_type NOT IN ('ABONO', 'CARGO')
     OR v_amount IS NULL OR v_amount <= 0 OR v_amount > 999999999999::numeric
     OR v_date IS NULL OR v_description IS NULL OR length(v_description) > 300
     OR v_category NOT IN (
       'APORTE_CAPITAL', 'PRESTAMO', 'COMISION_BANCARIA', 'INTERES_BANCARIO',
       'IMPUESTO_BANCARIO', 'OTRO_INGRESO', 'OTRO_EGRESO', 'AJUSTE_CONCILIACION'
     ) OR v_currency !~ '^[A-Z]{3}$'
     OR (v_reference IS NOT NULL AND length(v_reference) > 120) THEN
    RAISE EXCEPTION 'BANK_MANUAL_MOVEMENT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_amount := round(v_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'BANK_MANUAL_MOVEMENT_AMOUNT_TOO_SMALL' USING ERRCODE = '22023';
  END IF;
  IF (v_category = 'AJUSTE_CONCILIACION') IS DISTINCT FROM (v_reconciliation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_ADJUSTMENT_REQUIRES_RECONCILIATION_ID'
      USING ERRCODE = '22023';
  END IF;
  v_operation_type := CASE WHEN v_category = 'AJUSTE_CONCILIACION'
    THEN 'AJUSTE_CONCILIACION' ELSE 'MOVIMIENTO_MANUAL' END;
  v_canonical := jsonb_build_object(
    'cuenta_bancaria_id', v_account_id, 'cuenta_contrapartida_id', v_counter_id,
    'conciliacion_id', v_reconciliation_id,
    'tipo', v_type, 'monto', v_amount, 'fecha', v_date,
    'descripcion', v_description, 'referencia', v_reference,
    'metodo_pago', v_method, 'categoria', v_category,
    'moneda', v_currency, 'tipo_cambio', CASE WHEN v_rate IS NULL THEN NULL ELSE round(v_rate, 6) END
  );
  v_fingerprint := app.bank_fingerprint_457(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:BANK:%s', p_tenant_id, v_key), 0));
  v_existing := app.bank_operation_existing_457(p_tenant_id, v_operation_type, v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF v_reconciliation_id IS NOT NULL THEN
    SELECT * INTO v_reconciliation FROM public.conciliaciones_bancarias c
    WHERE c.id = v_reconciliation_id AND c.tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND OR lower(v_reconciliation.estado::text) = 'cerrada'
       OR v_reconciliation.cuenta_bancaria_id IS DISTINCT FROM v_account_id
       OR v_date NOT BETWEEN v_reconciliation.fecha_desde AND v_reconciliation.fecha_hasta THEN
      RAISE EXCEPTION 'BANK_RECONCILIATION_ADJUSTMENT_OUTSIDE_OPEN_RECONCILIATION'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT * INTO v_account FROM public.cuentas_bancarias cb
  WHERE cb.id = v_account_id AND cb.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(v_account.activa, false)
     OR lower(coalesce(v_account.estado, 'activo')) <> 'activo' THEN
    RAISE EXCEPTION 'BANK_ACCOUNT_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_account.moneda) IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'BANK_MOVEMENT_CURRENCY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  v_bank_ledger := app.assert_postable_account_457(p_tenant_id, v_account.cuenta_contable_id, 'LEDGER');
  v_counter := app.assert_postable_account_457(p_tenant_id, v_counter_id, 'COUNTERPART');
  IF v_bank_ledger.id = v_counter.id THEN
    RAISE EXCEPTION 'BANK_COUNTERPART_MUST_DIFFER_FROM_BANK_LEDGER' USING ERRCODE = '23514';
  END IF;

  v_local_currency := app.bank_local_currency_457(p_tenant_id);
  IF v_currency = v_local_currency THEN
    IF v_rate IS NOT NULL AND round(v_rate, 6) <> 1 THEN
      RAISE EXCEPTION 'BANK_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'BANK_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE
    v_rate := round(v_rate, 6);
  END IF;
  v_local_amount := round(v_amount * v_rate, 2);
  IF v_local_amount <= 0 THEN
    RAISE EXCEPTION 'BANK_LOCAL_AMOUNT_INVALID' USING ERRCODE = '23514';
  END IF;

  v_old := round(coalesce(v_account.saldo, 0), 2);
  v_new := round(v_old + CASE WHEN v_type = 'ABONO' THEN v_amount ELSE -v_amount END, 2);
  IF v_new < 0 AND NOT coalesce(v_account.permite_sobregiro, false) THEN
    RAISE EXCEPTION 'BANK_INSUFFICIENT_FUNDS' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.movimientos_bancarios (
    tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
    metodo_pago, conciliado, es_extracto, saldo_anterior, saldo_nuevo, created_by,
    idempotency_key, moneda, categoria, cuenta_contrapartida_id,
    operacion_bancaria_id, request_fingerprint, monto_moneda_local, tipo_cambio,
    activo, estado
  ) VALUES (
    p_tenant_id, v_account_id, v_type, v_amount, v_date, v_description, v_reference,
    v_method, false, false, v_old, v_new, p_actor_id,
    v_key, v_currency, v_category, v_counter_id,
    v_operation_id, v_fingerprint, v_local_amount, v_rate, true, 'ACTIVO'
  ) RETURNING * INTO v_movement;

  UPDATE public.cuentas_bancarias
  SET saldo = v_new, saldo_actual = v_new, saldo_contable = v_new,
      updated_by = p_actor_id, updated_at = clock_timestamp()
  WHERE id = v_account_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_BALANCE_UPDATE_LOST' USING ERRCODE = '40001';
  END IF;
  IF v_reconciliation_id IS NOT NULL THEN
    UPDATE public.conciliaciones_bancarias
    SET saldo_libro = round(saldo_libro + CASE WHEN v_type = 'ABONO' THEN v_amount ELSE -v_amount END, 2),
        diferencia = round(
          saldo_libro + CASE WHEN v_type = 'ABONO' THEN v_amount ELSE -v_amount END - saldo_banco,
          2
        ),
        updated_by = p_actor_id, updated_at = clock_timestamp()
    WHERE id = v_reconciliation_id AND tenant_id = p_tenant_id;
  END IF;

  v_event_key := format('banco.movimiento.registrado:%s:%s', p_tenant_id, v_operation_id);
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'operacion_id', v_operation_id,
    'movimiento_id', v_movement.id, 'event_id', v_event_id,
    'cuenta_bancaria_id', v_account_id, 'saldo_anterior', v_old,
    'saldo_nuevo', v_new, 'moneda', v_currency, 'monto', v_amount
  );
  INSERT INTO public.operaciones_bancarias (
    id, tenant_id, tipo, idempotency_key, fingerprint, actor_id,
    cuenta_origen_id, cuenta_contrapartida_id, conciliacion_id, movimiento_origen_id,
    monto, moneda, categoria, event_id, resultado
  ) VALUES (
    v_operation_id, p_tenant_id, v_operation_type, v_key, v_fingerprint, p_actor_id,
    v_account_id, v_counter_id, v_reconciliation_id, v_movement.id,
    v_amount, v_currency, v_category, v_event_id, v_result
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'operacion_bancaria', v_operation_id::text,
    'banco.movimiento.registrado',
    jsonb_build_object(
      'eventId', v_event_id, 'tenantId', p_tenant_id,
      'operacionId', v_operation_id, 'movimientoId', v_movement.id,
      'cuentaBancariaId', v_account_id, 'cuentaBancoId', v_bank_ledger.id,
      'cuentaBancoCodigo', v_bank_ledger.codigo,
      'cuentaContrapartidaId', v_counter.id,
      'cuentaContrapartidaCodigo', v_counter.codigo,
      'tipo', v_type, 'categoria', v_category, 'monto', v_local_amount,
      'montoOrigen', v_amount, 'moneda', v_currency,
      'monedaLocal', v_local_currency, 'tipoCambio', v_rate,
      'fecha', v_date, 'descripcion', v_description,
      'referencia', coalesce(v_reference, format('BANCO:%s', v_operation_id)),
      'actorId', p_actor_id, 'accountingHandledByOutbox', true
    ),
    'pending', 0, v_event_key, v_event_id, clock_timestamp()
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_bancario_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.registrar_movimiento_bancario_tx_457(p_tenant_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.transferir_entre_cuentas_bancarias_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.transferir_entre_cuentas_bancarias_tx_457(p_tenant_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.crear_conciliacion_bancaria_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.crear_conciliacion_bancaria_tx_457(p_tenant_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.importar_extracto_bancario_tx(
  p_tenant_id uuid, p_conciliacion_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.importar_extracto_bancario_tx_457(
    p_tenant_id,p_conciliacion_id,p_payload,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.conciliar_movimiento_bancario_v2_tx(
  p_tenant_id uuid, p_conciliacion_id uuid, p_movimiento_sistema_id uuid,
  p_movimiento_extracto_id uuid, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.conciliar_movimiento_bancario_tx_457(
    p_tenant_id,p_conciliacion_id,p_movimiento_sistema_id,
    p_movimiento_extracto_id,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.conciliar_lote_bancario_tx(
  p_tenant_id uuid, p_conciliacion_id uuid, p_pares jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.conciliar_lote_bancario_tx_457(
    p_tenant_id,p_conciliacion_id,p_pares,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.conciliar_automaticamente_bancario_tx(
  p_tenant_id uuid, p_conciliacion_id uuid, p_tolerancia_dias integer,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.conciliar_automaticamente_tx_457(
    p_tenant_id,p_conciliacion_id,p_tolerancia_dias,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_conciliacion_bancaria_tx(
  p_tenant_id uuid, p_conciliacion_id uuid, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.cerrar_conciliacion_bancaria_tx_457(
    p_tenant_id,p_conciliacion_id,p_actor_id,p_idempotency_key
  )
$function$;

REVOKE ALL ON FUNCTION app.registrar_movimiento_bancario_tx_457(uuid,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.transferir_entre_cuentas_bancarias_tx_457(uuid,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.crear_conciliacion_bancaria_tx_457(uuid,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.importar_extracto_bancario_tx_457(uuid,uuid,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.conciliar_movimiento_bancario_tx_457(uuid,uuid,uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.conciliar_lote_bancario_tx_457(uuid,uuid,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.conciliar_automaticamente_tx_457(uuid,uuid,integer,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.cerrar_conciliacion_bancaria_tx_457(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_movimiento_bancario_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transferir_entre_cuentas_bancarias_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_conciliacion_bancaria_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.importar_extracto_bancario_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conciliar_movimiento_bancario_v2_tx(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conciliar_lote_bancario_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conciliar_automaticamente_bancario_tx(uuid,uuid,integer,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cerrar_conciliacion_bancaria_tx(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento_bancario_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transferir_entre_cuentas_bancarias_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_conciliacion_bancaria_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.importar_extracto_bancario_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.conciliar_movimiento_bancario_v2_tx(uuid,uuid,uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.conciliar_lote_bancario_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.conciliar_automaticamente_bancario_tx(uuid,uuid,integer,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_conciliacion_bancaria_tx(uuid,uuid,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
