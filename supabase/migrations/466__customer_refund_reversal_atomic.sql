-- ============================================================================
-- 466__customer_refund_reversal_atomic.sql
-- Reversas financieras explícitas para anulación CPE y reembolsos RMA.
--
-- Garantías:
-- - actor activo con permiso específico dentro del tenant;
-- - idempotencia por clave + huella y exclusión por operación original;
-- - locks de cobro/saldo/tesorería y guardia de período contable;
-- - caja/banco, CxC/saldo a favor, auditoría y outbox en el mismo commit;
-- - continuidad automática con el finalizador 448 al revertir el último cobro;
-- - evento contable separado para el egreso POS (sin duplicar la NC).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

DO $preflight$
BEGIN
  IF to_regclass('public.cxc_pagos') IS NULL
     OR to_regclass('public.saldos_favor_movimientos') IS NULL
     OR to_regclass('public.outbox_events') IS NULL
     OR to_regprocedure('app.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('app.resolve_cash_session_452(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('app.append_cash_movement_452(sesiones_caja,uuid,numeric,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('app.ensure_accounting_period_open_458(uuid,date)') IS NULL
     OR to_regprocedure('public.revertir_ajuste_fiscal_cxc_tx(uuid,uuid,jsonb,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'REFUND_REVERSAL_466_DEPENDENCIES_MISSING';
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.cxc_cobro_reversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cpe_id uuid NOT NULL REFERENCES public.cpe(id) ON DELETE RESTRICT,
  nota_credito_id uuid NOT NULL REFERENCES public.cpe(id) ON DELETE RESTRICT,
  cxc_id uuid NOT NULL REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT,
  pago_id uuid NOT NULL REFERENCES public.cxc_pagos(id) ON DELETE RESTRICT,
  medio text NOT NULL,
  monto numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  movimiento_caja_origen_id uuid REFERENCES public.movimientos_caja(id) ON DELETE RESTRICT,
  movimiento_bancario_origen_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  movimiento_caja_reversa_id uuid REFERENCES public.movimientos_caja(id) ON DELETE RESTRICT,
  movimiento_bancario_reversa_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  motivo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  event_id uuid NOT NULL,
  resultado jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cxc_cobro_reversa_medio_466 CHECK (medio IN ('CAJA', 'BANCO')),
  CONSTRAINT ck_cxc_cobro_reversa_monto_466 CHECK (monto > 0),
  CONSTRAINT ck_cxc_cobro_reversa_moneda_466 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_cxc_cobro_reversa_key_466 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ck_cxc_cobro_reversa_fingerprint_466 CHECK (
    fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_cxc_cobro_reversa_treasury_466 CHECK (
    (medio = 'CAJA'
      AND movimiento_caja_origen_id IS NOT NULL
      AND movimiento_caja_reversa_id IS NOT NULL
      AND movimiento_bancario_origen_id IS NULL
      AND movimiento_bancario_reversa_id IS NULL)
    OR
    (medio = 'BANCO'
      AND movimiento_bancario_origen_id IS NOT NULL
      AND movimiento_bancario_reversa_id IS NOT NULL
      AND movimiento_caja_origen_id IS NULL
      AND movimiento_caja_reversa_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_cobro_reversa_pago_466
  ON public.cxc_cobro_reversas (tenant_id, pago_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_cobro_reversa_key_466
  ON public.cxc_cobro_reversas (tenant_id, lower(btrim(idempotency_key)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_cobro_reversa_event_466
  ON public.cxc_cobro_reversas (tenant_id, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_cxc_pago_reversa_466
  ON public.movimientos_caja (tenant_id, lower(btrim(referencia_tipo)), referencia_documento)
  WHERE lower(btrim(coalesce(referencia_tipo, ''))) = 'cxc_pago_reverso'
    AND referencia_documento IS NOT NULL;

ALTER TABLE public.saldos_favor_movimientos
  ADD COLUMN IF NOT EXISTS reversa_de_movimiento_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_saldo_mov_reversa_origen_466'
      AND conrelid = 'public.saldos_favor_movimientos'::regclass
  ) THEN
    ALTER TABLE public.saldos_favor_movimientos
      ADD CONSTRAINT fk_saldo_mov_reversa_origen_466
      FOREIGN KEY (reversa_de_movimiento_id)
      REFERENCES public.saldos_favor_movimientos(id) ON DELETE RESTRICT;
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_saldo_mov_reversa_origen_466
  ON public.saldos_favor_movimientos (tenant_id, reversa_de_movimiento_id)
  WHERE tipo = 'REVERSA' AND reversa_de_movimiento_id IS NOT NULL;

ALTER TABLE public.rma_operaciones
  DROP CONSTRAINT IF EXISTS ck_rma_operaciones_tipo_456;
ALTER TABLE public.rma_operaciones
  ADD CONSTRAINT ck_rma_operaciones_tipo_456 CHECK (tipo IN (
    'CREAR', 'DECIDIR', 'RECEPCIONAR', 'REVERTIR_RECEPCION',
    'EMITIR_NOTA_CREDITO', 'APLICAR_SALDO', 'REEMBOLSAR_SALDO',
    'REVERTIR_REEMBOLSO'
  ));

SELECT app.apply_tenant_policy('public', 'cxc_cobro_reversas');

CREATE OR REPLACE FUNCTION app.refund_fingerprint_466(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION app.assert_actor_permission_466(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_permission text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_super boolean;
BEGIN
  SELECT coalesce(u.is_super_admin, false)
  INTO v_super
  FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id
    AND u.tenant_id = p_tenant_id
    AND coalesce(u.activo, false)
    AND lower(coalesce(u.estado::text, '')) = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT'
      USING ERRCODE = '42501';
  END IF;
  IF v_super THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
     AND r.tenant_id = p_tenant_id
     AND coalesce(r.activo, true)
    JOIN public.rol_permisos rp
      ON rp.role_id = r.id
     AND coalesce(rp.concedido, true)
    JOIN public.permisos p
      ON p.id = rp.permiso_id
     AND p.tenant_id = p_tenant_id
     AND coalesce(p.activo, true)
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND lower(coalesce(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
          = lower(p_permission)
  ) THEN
    RAISE EXCEPTION 'REFUND_REVERSAL_PERMISSION_REQUIRED: %', p_permission
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.insert_refund_outbox_466(
  p_tenant_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_event_id uuid,
  p_key text,
  p_fingerprint text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_event public.outbox_events%ROWTYPE;
BEGIN
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, p_aggregate_type, p_aggregate_id::text, p_event_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'operationFingerprint', p_fingerprint,
      'accountingHandledByOutbox', true,
      'accountingOwner', p_event_type,
      'schemaVersion', 466
    ),
    'pending', 0, p_key, p_event_id, clock_timestamp(), now(), now()
  )
  ON CONFLICT (tenant_id, event_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  SELECT * INTO v_event
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND o.event_type = p_event_type
    AND o.idempotency_key = p_key
  FOR UPDATE;

  IF NOT FOUND
     OR v_event.event_id IS DISTINCT FROM p_event_id
     OR v_event.aggregate_id IS DISTINCT FROM p_aggregate_id::text
     OR v_event.payload->>'operationFingerprint' IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'REFUND_REVERSAL_OUTBOX_IDEMPOTENCY_CONFLICT'
      USING ERRCODE = '23505';
  END IF;
  RETURN v_event.id;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_saldo_reembolso_reversa_466
  ON public.movimientos_caja (tenant_id, lower(btrim(referencia_tipo)), referencia_documento)
  WHERE lower(btrim(coalesce(referencia_tipo, ''))) = 'saldo_favor_reembolso_reverso'
    AND referencia_documento IS NOT NULL;

CREATE OR REPLACE FUNCTION public.revertir_reembolso_saldo_favor_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_saldo_id uuid,
  p_movimiento_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_motivo text := nullif(btrim(coalesce(p_payload->>'motivo', '')), '');
  v_session_id uuid := nullif(p_payload->>'sesion_caja_id', '')::uuid;
  v_saldo public.saldos_favor_clientes%ROWTYPE;
  v_original public.saldos_favor_movimientos%ROWTYPE;
  v_reversal public.saldos_favor_movimientos%ROWTYPE;
  v_operation public.rma_operaciones%ROWTYPE;
  v_origin_cash public.movimientos_caja%ROWTYPE;
  v_origin_bank_movement public.movimientos_bancarios%ROWTYPE;
  v_session public.sesiones_caja%ROWTYPE;
  v_cash public.movimientos_caja%ROWTYPE;
  v_bank public.cuentas_bancarias%ROWTYPE;
  v_bank_movement public.movimientos_bancarios%ROWTYPE;
  v_method text;
  v_amount numeric(14,2);
  v_liability_local numeric(14,2);
  v_treasury_local numeric(14,2);
  v_difference numeric(14,2);
  v_balance_before numeric(14,2);
  v_balance_after numeric(14,2);
  v_local_before numeric(14,2);
  v_local_after numeric(14,2);
  v_bank_before numeric(14,2);
  v_bank_after numeric(14,2);
  v_canonical jsonb;
  v_fingerprint text;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(
    p_tenant_id, p_actor_id, 'ventas.rma.revertir_reembolso'
  );
  IF p_saldo_id IS NULL OR p_movimiento_id IS NULL
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:SALDO:REFUND:REVERSE:%s', p_tenant_id, p_movimiento_id), 466
  ));

  SELECT * INTO v_original
  FROM public.saldos_favor_movimientos m
  WHERE m.id = p_movimiento_id
    AND m.tenant_id = p_tenant_id
    AND m.saldo_favor_id = p_saldo_id
  FOR UPDATE;
  IF NOT FOUND OR v_original.tipo NOT IN ('REEMBOLSO_CAJA', 'REEMBOLSO_BANCO') THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_ORIGIN_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_saldo
  FROM public.saldos_favor_clientes s
  WHERE s.id = p_saldo_id AND s.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_saldo.estado = 'ANULADO' THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_BALANCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_method := CASE
    WHEN v_original.tipo = 'REEMBOLSO_CAJA' THEN 'CAJA'
    ELSE 'BANCO'
  END;
  IF (v_method = 'CAJA' AND v_session_id IS NULL)
     OR (v_method = 'BANCO' AND v_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_TREASURY_TARGET_INVALID'
      USING ERRCODE = '22023';
  END IF;

  v_amount := round(v_original.monto, 2);
  v_liability_local := round(coalesce(
    nullif(v_original.metadata->>'monto_local_pasivo', '')::numeric,
    v_amount * v_saldo.tipo_cambio_origen
  ), 2);
  v_treasury_local := round(coalesce(
    nullif(v_original.metadata->>'monto_local_tesoreria', '')::numeric,
    v_liability_local
  ), 2);
  v_difference := round(coalesce(
    nullif(v_original.metadata->>'diferencia_cambio', '')::numeric,
    v_treasury_local - v_liability_local
  ), 2);
  v_canonical := jsonb_build_object(
    'version', 1,
    'tenant_id', p_tenant_id,
    'actor_id', p_actor_id,
    'saldo_favor_id', p_saldo_id,
    'movimiento_reembolso_id', p_movimiento_id,
    'monto', v_amount,
    'medio', v_method,
    'sesion_caja_id', v_session_id,
    'motivo', v_motivo
  );
  v_fingerprint := app.refund_fingerprint_466(v_canonical);

  SELECT * INTO v_operation
  FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo = 'REVERTIR_REEMBOLSO'
    AND lower(btrim(o.idempotency_key)) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.saldo_favor_id IS DISTINCT FROM p_saldo_id
       OR v_operation.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_reversal
  FROM public.saldos_favor_movimientos m
  WHERE m.tenant_id = p_tenant_id
    AND m.tipo = 'REVERSA'
    AND m.reversa_de_movimiento_id = p_movimiento_id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_ALREADY_REVERSED'
      USING ERRCODE = '23505';
  END IF;

  v_balance_before := round(v_saldo.monto_disponible, 2);
  v_local_before := round(v_saldo.monto_local_disponible, 2);
  v_balance_after := round(v_balance_before + v_amount, 2);
  v_local_after := round(v_local_before + v_liability_local, 2);
  IF v_balance_after - v_saldo.monto_original > 0.01
     OR v_local_after - v_saldo.monto_local_original > 0.01 THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_WOULD_EXCEED_ORIGINAL_BALANCE'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.ensure_accounting_period_open_458(
    p_tenant_id, app.hoy_tenant(p_tenant_id)
  );

  IF v_method = 'CAJA' THEN
    SELECT * INTO v_origin_cash
    FROM public.movimientos_caja m
    WHERE m.id = v_original.movimiento_caja_id
      AND m.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(m.referencia_tipo, ''))) = 'saldo_favor_reembolso'
    FOR UPDATE;
    IF NOT FOUND OR abs(abs(v_origin_cash.monto) - v_amount) > 0.01 THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_CASH_ORIGIN_INVALID'
        USING ERRCODE = '23514';
    END IF;
    v_session := app.resolve_cash_session_452(
      p_tenant_id, p_actor_id, v_session_id, v_saldo.moneda
    );
    v_cash := app.append_cash_movement_452(
      v_session, p_actor_id, v_amount, 'IN',
      'saldo_favor_reembolso_reverso', p_movimiento_id::text,
      format('Reversa de reembolso de saldo a favor: %s', v_motivo),
      jsonb_build_object(
        'saldo_favor_id', p_saldo_id,
        'movimiento_reembolso_id', p_movimiento_id,
        'movimiento_tesoreria_origen_id', v_origin_cash.id,
        'idempotency_key', v_key,
        'request_fingerprint', v_fingerprint,
        'schema_version', 466
      )
    );
  ELSE
    SELECT * INTO v_origin_bank_movement
    FROM public.movimientos_bancarios m
    WHERE m.id = v_original.movimiento_bancario_id
      AND m.tenant_id = p_tenant_id
      AND upper(coalesce(m.tipo, '')) = 'CARGO'
    FOR UPDATE;
    IF NOT FOUND OR abs(v_origin_bank_movement.monto - v_amount) > 0.01 THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_BANK_ORIGIN_INVALID'
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_bank
    FROM public.cuentas_bancarias b
    WHERE b.id = v_origin_bank_movement.cuenta_bancaria_id
      AND b.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_bank.activa, v_bank.activo, false)
       OR upper(coalesce(v_bank.estado, '')) <> 'ACTIVO'
       OR upper(coalesce(v_bank.moneda, 'PEN')) <> v_saldo.moneda THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_REVERSAL_BANK_INVALID'
        USING ERRCODE = '23514';
    END IF;
    v_bank_before := round(coalesce(v_bank.saldo, v_bank.saldo_actual, 0), 2);
    v_bank_after := round(v_bank_before + v_amount, 2);
    INSERT INTO public.movimientos_bancarios (
      tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, cliente_id, conciliado, saldo_anterior,
      saldo_nuevo, idempotency_key, created_by, metadata
    ) VALUES (
      p_tenant_id, v_bank.id, 'ABONO', v_amount, app.hoy_tenant(p_tenant_id),
      format('Reversa reembolso saldo a favor cliente %s', v_saldo.cliente_id),
      format('REV-RMA-%s', left(p_movimiento_id::text, 12)),
      'REVERSA_REEMBOLSO_SALDO_FAVOR', v_saldo.cliente_id, false,
      v_bank_before, v_bank_after, v_key || ':bank', p_actor_id,
      jsonb_build_object(
        'saldo_favor_id', p_saldo_id,
        'movimiento_reembolso_id', p_movimiento_id,
        'movimiento_tesoreria_origen_id', v_origin_bank_movement.id,
        'request_fingerprint', v_fingerprint,
        'event_id', v_event_id,
        'schema_version', 466
      )
    ) RETURNING * INTO v_bank_movement;
    UPDATE public.cuentas_bancarias
    SET saldo = v_bank_after, saldo_actual = v_bank_after,
        saldo_contable = v_bank_after, updated_at = now(), updated_by = p_actor_id
    WHERE id = v_bank.id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.saldos_favor_clientes
  SET monto_disponible = v_balance_after,
      monto_local_disponible = v_local_after,
      estado = CASE
        WHEN v_balance_after >= monto_original - 0.009 THEN 'DISPONIBLE'
        ELSE 'PARCIAL'
      END,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_refund_reversal_key', v_key,
        'last_refund_reversal_origin_id', p_movimiento_id,
        'schema_version_reversa', 466
      ),
      updated_at = now()
  WHERE id = p_saldo_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_saldo;

  INSERT INTO public.saldos_favor_movimientos (
    tenant_id, saldo_favor_id, tipo, monto, movimiento_caja_id,
    movimiento_bancario_id, actor_id, idempotency_key, event_id,
    reversa_de_movimiento_id, metadata
  ) VALUES (
    p_tenant_id, p_saldo_id, 'REVERSA', v_amount, v_cash.id,
    v_bank_movement.id, p_actor_id, v_key, v_event_id, p_movimiento_id,
    jsonb_build_object(
      'request_fingerprint', v_fingerprint,
      'reversa_de_movimiento_id', p_movimiento_id,
      'monto_local_pasivo', v_liability_local,
      'monto_local_tesoreria', v_treasury_local,
      'diferencia_cambio', v_difference,
      'motivo', v_motivo,
      'accountingOwner', 'saldo_favor.reembolso_revertido',
      'schema_version', 466
    )
  ) RETURNING * INTO v_reversal;

  v_event_key := format(
    'saldo_favor.reembolso_revertido:%s:%s', p_tenant_id, p_movimiento_id
  );
  PERFORM app.insert_refund_outbox_466(
    p_tenant_id, 'saldo_favor', p_saldo_id,
    'saldo_favor.reembolso_revertido', v_event_id,
    v_event_key, v_fingerprint,
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key,
      'saldoFavorId', p_saldo_id,
      'movimientoId', v_reversal.id,
      'movimientoReembolsoId', p_movimiento_id,
      'clienteId', v_saldo.cliente_id,
      'medio', v_method,
      'sesionCajaId', v_cash.sesion_caja_id,
      'cuentaBancariaId', v_bank_movement.cuenta_bancaria_id,
      'movimientoTesoreriaId', coalesce(v_cash.id, v_bank_movement.id),
      'movimientoTesoreriaOrigenId', coalesce(
        v_origin_cash.id, v_origin_bank_movement.id
      ),
      'moneda', v_saldo.moneda,
      'monto', v_amount,
      'montoPasivo', v_liability_local,
      'montoTesoreria', v_treasury_local,
      'diferenciaCambio', v_difference,
      'fecha', clock_timestamp(),
      'referencia', format('REV-SALDO-%s', p_movimiento_id),
      'motivo', v_motivo,
      'actorId', p_actor_id,
      'source', 'public.revertir_reembolso_saldo_favor_tx'
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'saldo_favor_id', p_saldo_id,
    'movimiento_reembolso_id', p_movimiento_id,
    'movimiento_reversa_id', v_reversal.id,
    'medio', v_method,
    'monto_repuesto', v_amount,
    'saldo_disponible', v_balance_after,
    'movimiento_caja_id', v_cash.id,
    'movimiento_bancario_id', v_bank_movement.id,
    'event_id', v_event_id,
    'idempotent', false
  );
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, saldo_favor_id, tipo, idempotency_key,
    fingerprint, actor_id, payload, resultado, event_id
  ) VALUES (
    p_tenant_id, v_saldo.rma_id, p_saldo_id, 'REVERTIR_REEMBOLSO',
    v_key, v_fingerprint, p_actor_id, v_canonical, v_result, v_event_id
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revertir_cobro_cxc_anulacion_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_pago_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_motivo text := nullif(btrim(coalesce(p_payload->>'motivo', '')), '');
  v_session_id uuid := nullif(p_payload->>'sesion_caja_id', '')::uuid;
  v_original public.cpe%ROWTYPE;
  v_nota public.cpe%ROWTYPE;
  v_pago public.cxc_pagos%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_existing public.cxc_cobro_reversas%ROWTYPE;
  v_session public.sesiones_caja%ROWTYPE;
  v_cash_origin public.movimientos_caja%ROWTYPE;
  v_cash_reversal public.movimientos_caja%ROWTYPE;
  v_bank_origin public.movimientos_bancarios%ROWTYPE;
  v_bank_reversal public.movimientos_bancarios%ROWTYPE;
  v_bank public.cuentas_bancarias%ROWTYPE;
  v_origin_count integer;
  v_origin_id uuid;
  v_medium text;
  v_currency text;
  v_amount numeric(14,2);
  v_pending_before numeric(14,2);
  v_pending_after numeric(14,2);
  v_total numeric(14,2);
  v_bank_before numeric(14,2);
  v_bank_after numeric(14,2);
  v_local_currency text;
  v_origin_rate numeric(18,6);
  v_settlement_rate numeric(18,6);
  v_accounted_amount numeric(18,2);
  v_settled_amount numeric(18,2);
  v_fx_difference numeric(18,2);
  v_canonical jsonb;
  v_fingerprint text;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_reversal_id uuid := gen_random_uuid();
  v_active_payment_count integer;
  v_active_adjustment_count integer;
  v_finalization jsonb;
  v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(
    p_tenant_id, p_actor_id, 'finanzas.cxc.cobros.revertir'
  );
  IF p_cpe_id IS NULL OR p_pago_id IS NULL
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:CXC:REFUND:%s', p_tenant_id, p_pago_id), 466
  ));

  SELECT * INTO v_original
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(v_original.tipo_documento, '')) NOT IN ('01', '03') THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_CPE_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_nota
  FROM public.cpe c
  WHERE c.id = v_original.nota_credito_id
    AND c.tenant_id = p_tenant_id
    AND upper(coalesce(c.tipo_documento, '')) = '07'
  FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(v_nota.estado::text, '')) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_nota.cdr_sunat, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_ACCEPTED_CREDIT_NOTE_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_pago
  FROM public.cxc_pagos p
  WHERE p.id = p_pago_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_PAYMENT_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;
  IF upper(coalesce(v_pago.tipo, '')) <> 'PAGO' OR coalesce(v_pago.monto, 0) <= 0 THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_ONLY_TREASURY_PAYMENT_SUPPORTED'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cxc
  FROM public.cuentas_por_cobrar c
  WHERE c.id = v_pago.cuenta_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR NOT (
    v_original.documento_id IS NOT NULL
      AND v_cxc.documento_id = v_original.documento_id
    OR EXISTS (
      SELECT 1 FROM public.ventas_pos vp
      WHERE vp.tenant_id = p_tenant_id
        AND vp.cpe_id = v_original.id
        AND vp.cuenta_por_cobrar_id = v_cxc.id
    )
  ) THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_PAYMENT_NOT_LINKED_TO_CPE'
      USING ERRCODE = '23514';
  END IF;

  v_amount := round(v_pago.monto, 2);
  v_currency := upper(coalesce(v_pago.moneda, v_cxc.moneda, 'PEN'));
  v_medium := CASE
    WHEN upper(coalesce(v_pago.metodo_pago, '')) = 'EFECTIVO' THEN 'CAJA'
    WHEN upper(coalesce(v_pago.metodo_pago, '')) IN ('TRANSFERENCIA', 'CHEQUE', 'TARJETA')
      THEN 'BANCO'
    ELSE NULL
  END;
  IF v_medium IS NULL
     OR (v_medium = 'CAJA' AND v_session_id IS NULL)
     OR (v_medium = 'BANCO' AND v_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_TREASURY_TARGET_INVALID'
      USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 1,
    'tenant_id', p_tenant_id,
    'actor_id', p_actor_id,
    'cpe_id', p_cpe_id,
    'nota_credito_id', v_nota.id,
    'pago_id', p_pago_id,
    'cxc_id', v_cxc.id,
    'monto', v_amount,
    'moneda', v_currency,
    'medio', v_medium,
    'sesion_caja_id', v_session_id,
    'motivo', v_motivo
  );
  v_fingerprint := app.refund_fingerprint_466(v_canonical);

  SELECT * INTO v_existing
  FROM public.cxc_cobro_reversas r
  WHERE r.tenant_id = p_tenant_id
    AND lower(btrim(r.idempotency_key)) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.pago_id IS DISTINCT FROM p_pago_id
       OR v_existing.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  IF upper(coalesce(v_original.estado::text, '')) = 'ANULADO' THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_CPE_ALREADY_CANCELLED'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.cxc_cobro_reversas r
  WHERE r.tenant_id = p_tenant_id AND r.pago_id = p_pago_id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_PAYMENT_ALREADY_REVERSED'
      USING ERRCODE = '23505';
  END IF;
  IF NOT coalesce(v_pago.activo, true)
     OR upper(coalesce(v_pago.estado, 'ACTIVO')) <> 'ACTIVO' THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_PAYMENT_NOT_ACTIVE'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.ensure_accounting_period_open_458(
    p_tenant_id, app.hoy_tenant(p_tenant_id)
  );

  IF v_medium = 'CAJA' THEN
    SELECT count(*), (array_agg(mc.id ORDER BY mc.created_at, mc.id))[1]
    INTO v_origin_count, v_origin_id
    FROM public.movimientos_caja mc
    WHERE mc.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(mc.referencia_tipo, ''))) = 'cxc_pago'
      AND mc.referencia_documento = p_pago_id::text
      AND coalesce(mc.monto, 0) > 0;
    IF v_origin_count <> 1 THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_EXPECTED_ONE_CASH_ORIGIN: found=%',
        v_origin_count USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_cash_origin
    FROM public.movimientos_caja mc
    WHERE mc.id = v_origin_id AND mc.tenant_id = p_tenant_id
    FOR UPDATE;
    IF abs(abs(v_cash_origin.monto) - v_amount) > 0.01 THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_CASH_AMOUNT_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
    v_session := app.resolve_cash_session_452(
      p_tenant_id, p_actor_id, v_session_id, v_currency
    );
    v_cash_reversal := app.append_cash_movement_452(
      v_session, p_actor_id, v_amount, 'OUT', 'cxc_pago_reverso', p_pago_id::text,
      format('Reembolso de cobro por anulación %s-%s: %s',
        v_original.serie, v_original.numero, v_motivo),
      jsonb_build_object(
        'pago_id', p_pago_id,
        'cxc_id', v_cxc.id,
        'cpe_id', v_original.id,
        'nota_credito_id', v_nota.id,
        'movimiento_origen_id', v_cash_origin.id,
        'idempotency_key', v_key,
        'request_fingerprint', v_fingerprint,
        'schema_version', 466
      )
    );
  ELSE
    SELECT count(*), (array_agg(mb.id ORDER BY mb.created_at, mb.id))[1]
    INTO v_origin_count, v_origin_id
    FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id
      AND mb.cxc_id = v_cxc.id
      AND mb.metadata->>'pago_id' = p_pago_id::text
      AND upper(coalesce(mb.tipo, '')) = 'ABONO';
    IF v_origin_count <> 1 THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_EXPECTED_ONE_BANK_ORIGIN: found=%',
        v_origin_count USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_bank_origin
    FROM public.movimientos_bancarios mb
    WHERE mb.id = v_origin_id AND mb.tenant_id = p_tenant_id
    FOR UPDATE;
    IF v_bank_origin.cuenta_bancaria_id IS DISTINCT FROM v_pago.cuenta_bancaria_id
       OR abs(v_bank_origin.monto - v_amount) > 0.01 THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_BANK_ORIGIN_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_bank
    FROM public.cuentas_bancarias b
    WHERE b.id = v_bank_origin.cuenta_bancaria_id
      AND b.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_bank.activa, v_bank.activo, false)
       OR upper(coalesce(v_bank.estado, '')) <> 'ACTIVO'
       OR upper(coalesce(v_bank.moneda, 'PEN')) <> v_currency THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_BANK_INVALID'
        USING ERRCODE = '23514';
    END IF;
    v_bank_before := round(coalesce(v_bank.saldo, v_bank.saldo_actual, 0), 2);
    v_bank_after := round(v_bank_before - v_amount, 2);
    IF v_bank_after < 0 AND NOT coalesce(v_bank.permite_sobregiro, false) THEN
      RAISE EXCEPTION 'CXC_REFUND_REVERSAL_BANK_FUNDS_INSUFFICIENT'
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.movimientos_bancarios (
      tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, cliente_id, cxc_id, conciliado,
      saldo_anterior, saldo_nuevo, idempotency_key, created_by, metadata
    ) VALUES (
      p_tenant_id, v_bank.id, 'CARGO', v_amount, app.hoy_tenant(p_tenant_id),
      format('Reembolso de cobro por anulación %s-%s',
        v_original.serie, v_original.numero),
      format('REV-CXC-%s', left(p_pago_id::text, 12)), 'REVERSA_COBRO',
      v_cxc.cliente_id, v_cxc.id, false, v_bank_before, v_bank_after,
      v_key || ':bank', p_actor_id,
      jsonb_build_object(
        'pago_id', p_pago_id,
        'cpe_id', v_original.id,
        'nota_credito_id', v_nota.id,
        'movimiento_origen_id', v_bank_origin.id,
        'request_fingerprint', v_fingerprint,
        'event_id', v_event_id,
        'schema_version', 466
      )
    ) RETURNING * INTO v_bank_reversal;
    UPDATE public.cuentas_bancarias
    SET saldo = v_bank_after, saldo_actual = v_bank_after,
        saldo_contable = v_bank_after, updated_at = now(), updated_by = p_actor_id
    WHERE id = v_bank.id AND tenant_id = p_tenant_id;
  END IF;

  v_pending_before := round(coalesce(
    v_cxc.monto_pendiente, v_cxc.saldo_pendiente, v_cxc.saldo, 0
  ), 2);
  v_total := round(coalesce(v_cxc.monto_total, v_cxc.total, 0), 2);
  v_pending_after := round(v_pending_before + v_amount, 2);
  IF v_pending_after - v_total > 0.01 THEN
    RAISE EXCEPTION 'CXC_REFUND_REVERSAL_RECEIVABLE_WOULD_EXCEED_TOTAL'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.cxc_pagos
  SET estado = 'INACTIVO', activo = false,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'reversa_id', v_reversal_id,
        'reversa_event_id', v_event_id,
        'reversa_key', v_key,
        'revertido_por', p_actor_id,
        'revertido_en', clock_timestamp(),
        'schema_version_reversa', 466
      ),
      updated_at = now()
  WHERE id = p_pago_id AND tenant_id = p_tenant_id;

  UPDATE public.cuentas_por_cobrar
  SET monto_pendiente = v_pending_after,
      saldo_pendiente = v_pending_after,
      saldo = v_pending_after,
      estado = CASE
        WHEN v_pending_after >= v_total - 0.009 THEN 'PENDIENTE'
        ELSE 'PARCIAL'
      END,
      dias_mora = greatest(
        app.hoy_tenant(p_tenant_id) - coalesce(fecha_vencimiento, app.hoy_tenant(p_tenant_id)),
        0
      ),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_payment_reversal_id', v_reversal_id,
        'last_payment_reversal_key', v_key,
        'schema_version_reversa', 466
      ),
      updated_at = now()
  WHERE id = v_cxc.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cxc;

  v_local_currency := coalesce(nullif(v_pago.metadata->>'moneda_local', ''),
    app.treasury_local_currency_452(p_tenant_id));
  v_origin_rate := coalesce(nullif(v_pago.metadata->>'tipo_cambio_origen', '')::numeric, 1);
  v_settlement_rate := coalesce(nullif(v_pago.metadata->>'tipo_cambio_liquidacion', '')::numeric,
    v_origin_rate);
  v_accounted_amount := coalesce(nullif(v_pago.metadata->>'monto_contabilizado', '')::numeric,
    round(v_amount * v_origin_rate, 2));
  v_settled_amount := coalesce(nullif(v_pago.metadata->>'monto_liquidacion', '')::numeric,
    round(v_amount * v_settlement_rate, 2));
  v_fx_difference := coalesce(nullif(v_pago.metadata->>'diferencia_cambio', '')::numeric,
    round(v_settled_amount - v_accounted_amount, 2));

  INSERT INTO public.cxc_cobro_reversas (
    id, tenant_id, cpe_id, nota_credito_id, cxc_id, pago_id,
    medio, monto, moneda, movimiento_caja_origen_id,
    movimiento_bancario_origen_id, movimiento_caja_reversa_id,
    movimiento_bancario_reversa_id, actor_id, motivo,
    idempotency_key, fingerprint, event_id, metadata
  ) VALUES (
    v_reversal_id, p_tenant_id, v_original.id, v_nota.id, v_cxc.id, v_pago.id,
    v_medium, v_amount, v_currency, v_cash_origin.id,
    v_bank_origin.id, v_cash_reversal.id, v_bank_reversal.id,
    p_actor_id, v_motivo, v_key, v_fingerprint, v_event_id,
    jsonb_build_object(
      'moneda_local', v_local_currency,
      'tipo_cambio_origen', v_origin_rate,
      'tipo_cambio_liquidacion', v_settlement_rate,
      'monto_contabilizado', v_accounted_amount,
      'monto_liquidacion', v_settled_amount,
      'diferencia_cambio', v_fx_difference,
      'saldo_cxc_anterior', v_pending_before,
      'saldo_cxc_restaurado', v_pending_after,
      'schema_version', 466
    )
  );

  v_event_key := format('cobro.revertido:%s:%s', p_tenant_id, p_pago_id);
  PERFORM app.insert_refund_outbox_466(
    p_tenant_id, 'cobro', p_pago_id, 'cobro.revertido',
    v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key,
      'reversaId', v_reversal_id,
      'cobroId', p_pago_id,
      'cxcId', v_cxc.id,
      'cpeId', v_original.id,
      'notaCreditoId', v_nota.id,
      'clienteId', v_cxc.cliente_id,
      'medio', v_medium,
      'metodoPago', v_pago.metodo_pago,
      'moneda', v_currency,
      'monedaLocal', v_local_currency,
      'monto', v_amount,
      'montoContabilizado', v_accounted_amount,
      'montoLiquidacion', v_settled_amount,
      'diferenciaCambio', v_fx_difference,
      'tipoCambioOrigen', v_origin_rate,
      'tipoCambioLiquidacion', v_settlement_rate,
      'movimientoTesoreriaId', coalesce(v_cash_reversal.id, v_bank_reversal.id),
      'movimientoOrigenId', coalesce(v_cash_origin.id, v_bank_origin.id),
      'sesionCajaId', v_cash_reversal.sesion_caja_id,
      'cuentaBancariaId', v_bank_reversal.cuenta_bancaria_id,
      'fecha', app.hoy_tenant(p_tenant_id),
      'referencia', format('%s-%s', v_original.serie, v_original.numero),
      'motivo', v_motivo,
      'actorId', p_actor_id,
      'source', 'public.revertir_cobro_cxc_anulacion_tx'
    )
  );

  SELECT
    count(*) FILTER (WHERE upper(coalesce(p.tipo, 'PAGO')) = 'PAGO'),
    count(*) FILTER (WHERE upper(coalesce(p.tipo, 'PAGO')) <> 'PAGO')
  INTO v_active_payment_count, v_active_adjustment_count
  FROM public.cxc_pagos p
  WHERE p.tenant_id = p_tenant_id
    AND p.cuenta_id = v_cxc.id
    AND coalesce(p.activo, true)
    AND upper(coalesce(p.estado, 'ACTIVO')) = 'ACTIVO'
    AND coalesce(p.monto, 0) > 0;

  IF v_active_adjustment_count > 0 THEN
    v_finalization := jsonb_build_object(
      'success', true,
      'participa', true,
      'estado', 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA',
      'cobros_activos_restantes', v_active_payment_count,
      'ajustes_activos_restantes', v_active_adjustment_count,
      'nota_credito_id', v_nota.id
    );
  ELSIF v_active_payment_count = 0 THEN
    v_finalization := app.finalizar_anulacion_cpe_tx(
      v_nota.id,
      p_tenant_id,
      p_actor_id,
      format('cpe.cancel.final:%s:%s', p_tenant_id, v_nota.id)
    );
  ELSE
    v_finalization := jsonb_build_object(
      'success', true,
      'participa', true,
      'estado', 'PENDIENTE_REEMBOLSOS',
      'cobros_activos_restantes', v_active_payment_count,
      'ajustes_activos_restantes', 0,
      'nota_credito_id', v_nota.id
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'reversa_id', v_reversal_id,
    'pago_id', p_pago_id,
    'cxc_id', v_cxc.id,
    'cpe_id', v_original.id,
    'nota_credito_id', v_nota.id,
    'medio', v_medium,
    'monto_reembolsado', v_amount,
    'saldo_cxc_restaurado', v_pending_after,
    'movimiento_caja_id', v_cash_reversal.id,
    'movimiento_bancario_id', v_bank_reversal.id,
    'event_id', v_event_id,
    'anulacion', v_finalization,
    'idempotent', false
  );
  UPDATE public.cxc_cobro_reversas
  SET resultado = v_result, updated_at = now()
  WHERE id = v_reversal_id AND tenant_id = p_tenant_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revertir_ajuste_cxc_anulacion_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_operacion_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_motivo text := nullif(btrim(coalesce(p_payload->>'motivo', '')), '');
  v_original public.cpe%ROWTYPE;
  v_nota public.cpe%ROWTYPE;
  v_operacion public.operaciones_fiscales_financieras%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_ajuste jsonb;
  v_adjustment_idempotent boolean := false;
  v_finalization jsonb;
  v_active_payment_count integer;
  v_active_adjustment_count integer;
BEGIN
  PERFORM app.assert_actor_permission_466(
    p_tenant_id, p_actor_id, 'finanzas.cxc.cobros.revertir'
  );
  IF p_cpe_id IS NULL OR p_operacion_id IS NULL
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:CPE:ADJUSTMENT:REVERSE:%s', p_tenant_id, p_cpe_id), 466
  ));

  SELECT * INTO v_original
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(v_original.tipo_documento, '')) NOT IN ('01', '03') THEN
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_CPE_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_nota
  FROM public.cpe c
  WHERE c.id = v_original.nota_credito_id
    AND c.tenant_id = p_tenant_id
    AND upper(coalesce(c.tipo_documento, '')) = '07'
  FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(v_nota.estado::text, '')) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_nota.cdr_sunat, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_ACCEPTED_CREDIT_NOTE_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_operacion
  FROM public.operaciones_fiscales_financieras o
  WHERE o.id = p_operacion_id
    AND o.tenant_id = p_tenant_id
    AND o.origen = 'CLIENTE'
  FOR UPDATE;
  IF NOT FOUND OR v_operacion.cxc_id IS NULL THEN
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_OPERATION_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_cxc
  FROM public.cuentas_por_cobrar c
  WHERE c.id = v_operacion.cxc_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR NOT (
    v_original.documento_id IS NOT NULL
      AND v_cxc.documento_id = v_original.documento_id
    OR EXISTS (
      SELECT 1 FROM public.ventas_pos vp
      WHERE vp.tenant_id = p_tenant_id
        AND vp.cpe_id = v_original.id
        AND vp.cuenta_por_cobrar_id = v_cxc.id
    )
  ) THEN
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_NOT_LINKED_TO_CPE'
      USING ERRCODE = '23514';
  END IF;
  IF upper(coalesce(v_original.estado::text, '')) = 'ANULADO'
     AND upper(coalesce(v_operacion.estado, '')) <> 'ANULADO' THEN
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_CPE_ALREADY_CANCELLED'
      USING ERRCODE = '23514';
  END IF;

  IF upper(coalesce(v_operacion.estado, '')) = 'ANULADO' THEN
    SELECT r.resultado || jsonb_build_object('idempotent', true)
    INTO v_ajuste
    FROM public.reversas_ajustes_fiscales_cxc r
    WHERE r.tenant_id = p_tenant_id
      AND r.operacion_id = p_operacion_id
    FOR UPDATE;
    IF NOT FOUND OR v_ajuste IS NULL THEN
      RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_DURABLE_EVIDENCE_MISSING'
        USING ERRCODE = '23514';
    END IF;
    v_adjustment_idempotent := true;
  ELSIF upper(coalesce(v_operacion.estado, '')) = 'APLICADO' THEN
    v_ajuste := public.revertir_ajuste_fiscal_cxc_tx(
      p_tenant_id,
      p_operacion_id,
      jsonb_build_object('motivo', v_motivo),
      p_actor_id,
      v_key
    );
    v_adjustment_idempotent := coalesce(
      (v_ajuste->>'idempotent')::boolean, false
    );
  ELSE
    RAISE EXCEPTION 'CXC_ADJUSTMENT_REVERSAL_OPERATION_NOT_ACTIVE'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE upper(coalesce(p.tipo, 'PAGO')) = 'PAGO'),
    count(*) FILTER (WHERE upper(coalesce(p.tipo, 'PAGO')) <> 'PAGO')
  INTO v_active_payment_count, v_active_adjustment_count
  FROM public.cxc_pagos p
  WHERE p.tenant_id = p_tenant_id
    AND p.cuenta_id = v_cxc.id
    AND coalesce(p.activo, true)
    AND upper(coalesce(p.estado, 'ACTIVO')) = 'ACTIVO'
    AND coalesce(p.monto, 0) > 0;

  IF v_active_adjustment_count > 0 THEN
    v_finalization := jsonb_build_object(
      'success', true, 'participa', true,
      'estado', 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA',
      'cobros_activos_restantes', v_active_payment_count,
      'ajustes_activos_restantes', v_active_adjustment_count,
      'nota_credito_id', v_nota.id
    );
  ELSIF v_active_payment_count > 0 THEN
    v_finalization := jsonb_build_object(
      'success', true, 'participa', true,
      'estado', 'PENDIENTE_REEMBOLSOS',
      'cobros_activos_restantes', v_active_payment_count,
      'ajustes_activos_restantes', 0,
      'nota_credito_id', v_nota.id
    );
  ELSE
    v_finalization := app.finalizar_anulacion_cpe_tx(
      v_nota.id,
      p_tenant_id,
      p_actor_id,
      format('cpe.cancel.final:%s:%s', p_tenant_id, v_nota.id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'operacion_id', p_operacion_id,
    'cxc_id', v_cxc.id,
    'cpe_id', v_original.id,
    'nota_credito_id', v_nota.id,
    'ajuste', v_ajuste,
    'anulacion', v_finalization,
    'idempotent', v_adjustment_idempotent
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_refund_permissions_466(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  )
  SELECT p_tenant_id, d.modulo, d.recurso, d.accion, d.codigo,
         d.descripcion, true
  FROM (VALUES
    ('finanzas', 'cxc.cobros', 'revertir', 'finanzas.cxc.cobros.revertir',
      'Revertir cobros aplicados durante la anulación de un CPE'),
    ('ventas', 'rma', 'reembolsar', 'ventas.rma.reembolsar',
      'Reembolsar saldos a favor por caja o banco'),
    ('ventas', 'rma', 'revertir_reembolso', 'ventas.rma.revertir_reembolso',
      'Revertir un reembolso RMA y reponer el saldo a favor')
  ) AS d(modulo, recurso, accion, codigo, descripcion)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.tenant_id = p_tenant_id AND lower(p.codigo) = lower(d.codigo)
  );

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND upper(r.nombre) IN ('ADMIN', 'FINANZAS')
    AND lower(p.codigo) IN (
      'finanzas.cxc.cobros.revertir',
      'ventas.rma.reembolsar',
      'ventas.rma.revertir_reembolso'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_refund_permissions_on_tenant_466()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.seed_refund_permissions_466(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_refund_permissions_on_role_466()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND upper(NEW.nombre) IN ('ADMIN', 'FINANZAS') THEN
    PERFORM app.seed_refund_permissions_466(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_refund_permissions_tenant_466 ON public.tenants;
CREATE TRIGGER trg_seed_refund_permissions_tenant_466
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION app.seed_refund_permissions_on_tenant_466();

DROP TRIGGER IF EXISTS trg_seed_refund_permissions_role_466 ON public.roles;
CREATE TRIGGER trg_seed_refund_permissions_role_466
AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_refund_permissions_on_role_466();

SELECT app.seed_refund_permissions_466(t.id)
FROM public.tenants t;

CREATE OR REPLACE FUNCTION app.publish_pos_cash_refund_466()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_cpe_id uuid;
  v_note_id uuid;
  v_pos_id uuid;
  v_cpe public.cpe%ROWTYPE;
  v_note public.cpe%ROWTYPE;
  v_pos public.ventas_pos%ROWTYPE;
  v_amount numeric(14,2);
  v_currency text;
  v_local_currency text;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_fingerprint text;
BEGIN
  IF lower(btrim(coalesce(NEW.referencia_tipo, ''))) <> 'reverso_venta_pos' THEN
    RETURN NEW;
  END IF;

  v_cpe_id := app.to_uuid_or_null(coalesce(NEW.metadata->>'cpe_id', ''));
  v_note_id := app.to_uuid_or_null(coalesce(NEW.metadata->>'nota_credito_id', ''));
  v_pos_id := app.to_uuid_or_null(coalesce(NEW.metadata->>'venta_pos_id', ''));
  IF v_cpe_id IS NULL OR v_note_id IS NULL OR v_pos_id IS NULL
     OR NEW.usuario_id IS NULL OR coalesce(NEW.monto, 0) >= 0 THEN
    RAISE EXCEPTION 'POS_CASH_REFUND_466_METADATA_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cpe FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = NEW.tenant_id;
  SELECT * INTO v_note FROM public.cpe c
  WHERE c.id = v_note_id AND c.tenant_id = NEW.tenant_id
    AND upper(coalesce(c.tipo_documento, '')) = '07';
  SELECT * INTO v_pos FROM public.ventas_pos p
  WHERE p.id = v_pos_id AND p.tenant_id = NEW.tenant_id
    AND p.cpe_id = v_cpe_id;
  IF v_cpe.id IS NULL OR v_note.id IS NULL OR v_pos.id IS NULL
     OR v_cpe.nota_credito_id IS DISTINCT FROM v_note.id THEN
    RAISE EXCEPTION 'POS_CASH_REFUND_466_ORIGIN_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_amount := round(abs(NEW.monto), 2);
  v_currency := upper(coalesce(v_pos.moneda, v_cpe.moneda, 'PEN'));
  v_local_currency := app.treasury_local_currency_452(NEW.tenant_id);
  IF v_amount <= 0 OR v_currency <> v_local_currency THEN
    RAISE EXCEPTION 'POS_CASH_REFUND_466_LOCAL_AMOUNT_INVALID'
      USING ERRCODE = '23514';
  END IF;
  PERFORM app.ensure_accounting_period_open_458(
    NEW.tenant_id, app.hoy_tenant(NEW.tenant_id)
  );

  v_fingerprint := app.refund_fingerprint_466(jsonb_build_object(
    'version', 1,
    'tenant_id', NEW.tenant_id,
    'movimiento_caja_id', NEW.id,
    'cpe_id', v_cpe.id,
    'nota_credito_id', v_note.id,
    'venta_pos_id', v_pos.id,
    'monto', v_amount,
    'moneda', v_currency,
    'actor_id', NEW.usuario_id
  ));
  v_event_key := format(
    'pos.cobro.revertido:%s:%s', NEW.tenant_id, v_note.id
  );

  PERFORM app.insert_refund_outbox_466(
    NEW.tenant_id, 'venta_pos', v_pos.id, 'cobro.revertido',
    v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', NEW.tenant_id,
      'idempotencyKey', v_event_key,
      'reversaId', NEW.id,
      'cobroId', NEW.id,
      'cpeId', v_cpe.id,
      'notaCreditoId', v_note.id,
      'ventaPosId', v_pos.id,
      'clienteId', v_pos.cliente_id,
      'medio', 'CAJA',
      'metodoPago', 'EFECTIVO',
      'moneda', v_currency,
      'monedaLocal', v_local_currency,
      'monto', v_amount,
      'montoContabilizado', v_amount,
      'montoLiquidacion', v_amount,
      'diferenciaCambio', 0,
      'tipoCambioOrigen', 1,
      'tipoCambioLiquidacion', 1,
      'movimientoTesoreriaId', NEW.id,
      'sesionCajaId', NEW.sesion_caja_id,
      'fecha', app.hoy_tenant(NEW.tenant_id),
      'referencia', format('%s-%s', v_cpe.serie, v_cpe.numero),
      'motivo', NEW.motivo,
      'actorId', NEW.usuario_id,
      'source', 'POS',
      'posRefund', true
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_publish_pos_cash_refund_466 ON public.movimientos_caja;
CREATE TRIGGER trg_publish_pos_cash_refund_466
AFTER INSERT ON public.movimientos_caja
FOR EACH ROW
WHEN (lower(btrim(coalesce(NEW.referencia_tipo, ''))) = 'reverso_venta_pos')
EXECUTE FUNCTION app.publish_pos_cash_refund_466();

REVOKE ALL ON FUNCTION app.refund_fingerprint_466(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_actor_permission_466(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.insert_refund_outbox_466(uuid,text,uuid,text,uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.publish_pos_cash_refund_466()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_refund_permissions_466(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revertir_cobro_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_ajuste_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.revertir_cobro_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_ajuste_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)
  TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.cxc_cobro_reversas
FROM anon, authenticated;

COMMENT ON FUNCTION public.revertir_cobro_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)
IS 'Revierte un cobro CxC contra su caja/banco original, restaura la CxC y entrega el último cobro al finalizador CPE 448 en el mismo commit.';

COMMENT ON FUNCTION public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)
IS 'Revierte un reembolso RMA, repone caja/banco y saldo a favor y publica el asiento inverso en un único commit idempotente.';

COMMENT ON FUNCTION public.revertir_ajuste_cxc_anulacion_tx(uuid,uuid,uuid,uuid,jsonb,text)
IS 'Revierte un ajuste fiscal CxC ligado al CPE y sólo continúa 448 cuando no quedan movimientos activos.';

COMMENT ON TABLE public.cxc_cobro_reversas
IS 'Evidencia durable e inmutable de reembolsos de cobros aplicados durante una anulación CPE.';

COMMIT;

NOTIFY pgrst, 'reload schema';
