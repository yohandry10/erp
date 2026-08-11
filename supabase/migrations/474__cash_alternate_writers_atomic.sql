-- Caja 474: cierra writers alternos de retiros, movimientos manuales,
-- cambios de turno, maestros y configuración detrás de RPCs atómicas.
-- Los depósitos bancarios reutilizan la frontera 457 para que banco, caja y
-- outbox contable se confirmen (o reviertan) juntos.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS public.caja_operaciones_474 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  aggregate_id uuid,
  event_id uuid,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_caja_operaciones_474_tipo CHECK (tipo IN (
    'CREAR_CAJA','ACTUALIZAR_CAJA','CONFIGURAR_CAJA','MOVIMIENTO_MANUAL',
    'RETIRO','CONCILIAR_RETIRO','INICIAR_CAMBIO','COMPLETAR_CAMBIO','CANCELAR_CAMBIO',
    'AUDITORIA'
  )),
  CONSTRAINT ck_caja_operaciones_474_key CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 180
  ),
  CONSTRAINT ck_caja_operaciones_474_fingerprint CHECK (
    fingerprint ~ '^[0-9a-f]{64}$'
  )
);

-- Permite reaplicar la migración durante QA local sin conservar una versión
-- anterior del CHECK cuando se amplía el catálogo 474.
ALTER TABLE public.caja_operaciones_474
  DROP CONSTRAINT IF EXISTS ck_caja_operaciones_474_tipo;
ALTER TABLE public.caja_operaciones_474
  ADD CONSTRAINT ck_caja_operaciones_474_tipo CHECK (tipo IN (
    'CREAR_CAJA','ACTUALIZAR_CAJA','CONFIGURAR_CAJA','MOVIMIENTO_MANUAL',
    'RETIRO','CONCILIAR_RETIRO','INICIAR_CAMBIO','COMPLETAR_CAMBIO','CANCELAR_CAMBIO',
    'AUDITORIA'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_operaciones_474_key
  ON public.caja_operaciones_474 (tenant_id, tipo, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_operaciones_474_event
  ON public.caja_operaciones_474 (event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.caja_operaciones_474 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_operaciones_474 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.caja_operaciones_474 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.caja_operaciones_474 FROM service_role;
GRANT SELECT ON TABLE public.caja_operaciones_474 TO service_role;

ALTER TABLE public.retiros_caja
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS movimiento_bancario_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_contrapartida_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text,
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(18,6),
  ADD COLUMN IF NOT EXISTS monto_moneda_local numeric(14,2),
  ADD COLUMN IF NOT EXISTS conciliado_por uuid;

ALTER TABLE public.cambios_turno
  ADD COLUMN IF NOT EXISTS cuenta_diferencia_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text,
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(18,6),
  ADD COLUMN IF NOT EXISTS monto_moneda_local numeric(14,2),
  ADD COLUMN IF NOT EXISTS completado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_retiro_banco_474') THEN
    ALTER TABLE public.retiros_caja ADD CONSTRAINT fk_retiro_banco_474
      FOREIGN KEY (cuenta_bancaria_id) REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_retiro_mov_banco_474') THEN
    ALTER TABLE public.retiros_caja ADD CONSTRAINT fk_retiro_mov_banco_474
      FOREIGN KEY (movimiento_bancario_id) REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_retiro_contrapartida_474') THEN
    ALTER TABLE public.retiros_caja ADD CONSTRAINT fk_retiro_contrapartida_474
      FOREIGN KEY (cuenta_contrapartida_id) REFERENCES public.plan_cuentas(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_retiro_conciliado_por_474') THEN
    ALTER TABLE public.retiros_caja ADD CONSTRAINT fk_retiro_conciliado_por_474
      FOREIGN KEY (conciliado_por) REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cambio_cuenta_diferencia_474') THEN
    ALTER TABLE public.cambios_turno ADD CONSTRAINT fk_cambio_cuenta_diferencia_474
      FOREIGN KEY (cuenta_diferencia_id) REFERENCES public.plan_cuentas(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cambio_completado_por_474') THEN
    ALTER TABLE public.cambios_turno ADD CONSTRAINT fk_cambio_completado_por_474
      FOREIGN KEY (completado_por) REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cambio_cancelado_por_474') THEN
    ALTER TABLE public.cambios_turno ADD CONSTRAINT fk_cambio_cancelado_por_474
      FOREIGN KEY (cancelado_por) REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT;
  END IF;
END
$do$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_retiros_caja_key_474
  ON public.retiros_caja (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_retiros_caja_event_474
  ON public.retiros_caja (event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cambios_turno_en_proceso_474
  ON public.cambios_turno (tenant_id, sesion_caja_id)
  WHERE lower(estado::text) = 'en_proceso';

CREATE OR REPLACE FUNCTION app.cash_fingerprint_474(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.cash_actor_is_supervisor_474(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, false)
      AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
      AND (
        coalesce(u.is_super_admin, false)
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.usuario_sistema_id = u.id
            AND ur.tenant_id = p_tenant_id
            AND r.tenant_id = p_tenant_id
            AND coalesce(r.activo, false)
            AND upper(btrim(r.nombre)) IN ('ADMIN','ADMINISTRADOR','SUPERADMIN','SUPERVISOR')
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION app.assert_cash_permission_474(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_permission text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_actor public.usuarios_sistema%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR btrim(coalesce(p_permission, '')) = '' THEN
    RAISE EXCEPTION 'CASH_ACTOR_PERMISSION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor
  FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id
    AND u.tenant_id = p_tenant_id
    AND coalesce(u.activo, false)
    AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_actor.is_super_admin, false) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND r.tenant_id = p_tenant_id
      AND coalesce(r.activo, false)
      AND upper(btrim(r.nombre)) IN ('ADMIN','ADMINISTRADOR','SUPERADMIN')
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.tenant_id = p_tenant_id
    JOIN public.rol_permisos rp ON rp.role_id = r.id AND coalesce(rp.concedido, true)
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND coalesce(r.activo, false)
      AND coalesce(p.activo, false)
      AND (p.tenant_id IS NULL OR p.tenant_id = p_tenant_id)
      AND lower(btrim(coalesce(p.codigo, ''))) = lower(btrim(p_permission))
  ) THEN
    RAISE EXCEPTION 'CASH_PERMISSION_DENIED:%', p_permission USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_operation_existing_474(
  p_tenant_id uuid,
  p_type text,
  p_key text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_operation public.caja_operaciones_474%ROWTYPE;
BEGIN
  SELECT * INTO v_operation
  FROM public.caja_operaciones_474 o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo = p_type
    AND o.idempotency_key = p_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_operation.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'CASH_IDEMPOTENCY_COLLISION:%', p_type USING ERRCODE = '23505';
  END IF;
  RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_record_operation_474(
  p_tenant_id uuid,
  p_type text,
  p_key text,
  p_fingerprint text,
  p_actor_id uuid,
  p_aggregate_id uuid,
  p_event_id uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  INSERT INTO public.caja_operaciones_474 (
    tenant_id, tipo, idempotency_key, fingerprint, actor_id,
    aggregate_id, event_id, resultado
  ) VALUES (
    p_tenant_id, p_type, p_key, p_fingerprint, p_actor_id,
    p_aggregate_id, p_event_id, p_result
  )
$function$;

CREATE OR REPLACE FUNCTION app.cash_local_currency_474(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT upper(coalesce(
    (SELECT ec.moneda_defecto FROM public.empresa_config ec
      WHERE ec.tenant_id = p_tenant_id LIMIT 1),
    (SELECT cc.moneda FROM public.configuracion_caja cc
      WHERE cc.tenant_id = p_tenant_id AND cc.caja_id IS NULL
      ORDER BY cc.updated_at DESC LIMIT 1),
    'PEN'
  ))
$function$;

CREATE OR REPLACE FUNCTION app.cash_postable_account_474(
  p_tenant_id uuid,
  p_account_id uuid,
  p_kind text
)
RETURNS public.plan_cuentas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_account public.plan_cuentas%ROWTYPE;
  v_kind text := upper(btrim(coalesce(p_kind, 'ANY')));
  v_type text;
BEGIN
  SELECT * INTO v_account
  FROM public.plan_cuentas pc
  WHERE pc.id = p_account_id
    AND pc.tenant_id = p_tenant_id
    AND coalesce(pc.acepta_movimiento, false)
    AND coalesce(pc.activo, true)
    AND lower(coalesce(pc.estado::text, 'activo')) = 'activo'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_ACCOUNT_NOT_POSTABLE_IN_TENANT:%', v_kind USING ERRCODE = '23514';
  END IF;

  v_type := upper(btrim(coalesce(v_account.tipo, v_account.tipo_cuenta, '')));
  IF v_kind = 'CASH' AND btrim(v_account.codigo) <> '10111' THEN
    RAISE EXCEPTION 'CASH_LEDGER_ACCOUNT_10111_REQUIRED' USING ERRCODE = '23514';
  ELSIF v_kind = 'EXPENSE'
    AND NOT (v_type IN ('GASTO','EGRESO','EXPENSE') OR btrim(v_account.codigo) ~ '^6') THEN
    RAISE EXCEPTION 'CASH_EXPENSE_ACCOUNT_REQUIRED' USING ERRCODE = '23514';
  ELSIF v_kind = 'INCOME'
    AND NOT (v_type IN ('INGRESO','REVENUE','INCOME') OR btrim(v_account.codigo) ~ '^7') THEN
    RAISE EXCEPTION 'CASH_INCOME_ACCOUNT_REQUIRED' USING ERRCODE = '23514';
  ELSIF v_kind = 'VAULT'
    AND NOT (
      (v_type IN ('ACTIVO','ASSET') OR btrim(v_account.codigo) ~ '^10')
      AND btrim(v_account.codigo) <> '10111'
    ) THEN
    RAISE EXCEPTION 'CASH_VAULT_OR_TRANSFER_ACCOUNT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN v_account;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_account_10111_474(p_tenant_id uuid)
RETURNS public.plan_cuentas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT pc.id INTO v_id
  FROM public.plan_cuentas pc
  WHERE pc.tenant_id = p_tenant_id
    AND btrim(pc.codigo) = '10111'
    AND coalesce(pc.acepta_movimiento, false)
    AND coalesce(pc.activo, true)
    AND lower(coalesce(pc.estado::text, 'activo')) = 'activo'
  ORDER BY pc.created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'CASH_LEDGER_ACCOUNT_10111_NOT_CONFIGURED' USING ERRCODE = '23514';
  END IF;
  RETURN app.cash_postable_account_474(p_tenant_id, v_id, 'CASH');
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_append_movement_474(
  p_tenant_id uuid,
  p_session_id uuid,
  p_type text,
  p_amount numeric,
  p_actor_id uuid,
  p_reason text,
  p_reference_type text,
  p_reference_document text,
  p_supervisor_id uuid DEFAULT NULL
)
RETURNS public.movimientos_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_session public.sesiones_caja%ROWTYPE;
  v_sequence integer;
  v_previous numeric(14,2);
  v_new numeric(14,2);
  v_movement public.movimientos_caja%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.sesiones_caja s
  WHERE s.id = p_session_id AND s.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_session.estado::text) <> 'abierta' THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_OPEN' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_session.congelada, false) AND p_type <> 'CAMBIO_TURNO' THEN
    RAISE EXCEPTION 'CASH_SESSION_FROZEN' USING ERRCODE = '23514';
  END IF;
  IF p_type NOT IN ('RETIRO','INGRESO','AJUSTE','CAMBIO_TURNO')
     OR p_amount IS NULL OR round(p_amount, 2) = 0
     OR btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'CASH_MOVEMENT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(m.secuencia), 0) + 1,
         round(coalesce(v_session.monto_inicio, v_session.monto_inicial, 0)
           + coalesce(sum(m.monto), 0), 2)
    INTO v_sequence, v_previous
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_session_id;
  v_new := round(v_previous + p_amount, 2);
  IF v_new < 0 THEN
    RAISE EXCEPTION 'CASH_INSUFFICIENT_FUNDS' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.movimientos_caja (
    tenant_id, sesion_caja_id, secuencia, tipo_movimiento, monto,
    saldo_anterior, saldo_nuevo, motivo, usuario_id, supervisor_id,
    referencia_tipo, referencia_documento, "timestamp", estado
  ) VALUES (
    p_tenant_id, p_session_id, v_sequence, p_type, round(p_amount, 2),
    v_previous, v_new, btrim(p_reason), p_actor_id, p_supervisor_id,
    p_reference_type, p_reference_document, clock_timestamp(), 'ACTIVO'
  ) RETURNING * INTO v_movement;
  RETURN v_movement;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_denominations_total_474(p_denominations jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_group text;
  v_item record;
  v_denom numeric;
  v_count numeric;
  v_total numeric := 0;
BEGIN
  IF jsonb_typeof(coalesce(p_denominations, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'CASH_DENOMINATIONS_OBJECT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  FOREACH v_group IN ARRAY ARRAY['billetes','monedas'] LOOP
    IF jsonb_typeof(coalesce(p_denominations->v_group, '{}'::jsonb)) <> 'object' THEN
      RAISE EXCEPTION 'CASH_DENOMINATIONS_GROUP_INVALID:%', v_group USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_each_text(coalesce(p_denominations->v_group, '{}'::jsonb)) LOOP
      BEGIN
        v_denom := v_item.key::numeric;
        v_count := v_item.value::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'CASH_DENOMINATION_VALUE_INVALID' USING ERRCODE = '22023';
      END;
      IF v_denom <= 0 OR v_count < 0 OR trunc(v_count) <> v_count THEN
        RAISE EXCEPTION 'CASH_DENOMINATION_VALUE_INVALID' USING ERRCODE = '22023';
      END IF;
      v_total := v_total + (v_denom * v_count);
    END LOOP;
  END LOOP;
  RETURN round(v_total, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_audit_474(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_session_id uuid,
  p_event text,
  p_parameters jsonb,
  p_result text,
  p_risk text DEFAULT 'BAJO'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.caja_audit_log (
    tenant_id, evento, usuario_id, sesion_caja_id, parametros,
    resultado, riesgo, "timestamp"
  ) VALUES (
    p_tenant_id, p_event, p_actor_id, p_session_id,
    coalesce(p_parameters, '{}'::jsonb), p_result, p_risk, clock_timestamp()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cash_outbox_474(
  p_tenant_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_event_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, p_aggregate_type, p_aggregate_id::text, p_event_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'eventId', p_event_id, 'tenantId', p_tenant_id,
      'accountingHandledByOutbox', true
    ),
    'pending', 0,
    format('%s:%s:%s', p_event_type, p_tenant_id, p_aggregate_id),
    p_event_id, clock_timestamp()
  )
$function$;

CREATE OR REPLACE FUNCTION app.crear_caja_tx_474(
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
  v_name text := nullif(btrim(coalesce(p_payload->>'nombre', '')), '');
  v_description text := nullif(btrim(coalesce(p_payload->>'descripcion', '')), '');
  v_warehouse_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'almacen_id', ''));
  v_branch_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'sucursal_id', ''));
  v_device text := nullif(btrim(coalesce(p_payload->>'dispositivo', '')), '');
  v_type text := upper(btrim(coalesce(p_payload->>'tipo', 'TIENDA')));
  v_id uuid := gen_random_uuid();
  v_code text;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_cash public.cajas%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.crear');
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_name IS NULL OR length(v_name) > 160
     OR v_warehouse_id IS NULL
     OR v_type NOT IN ('TIENDA','MOSTRADOR','KIOSKO')
     OR (v_description IS NOT NULL AND length(v_description) > 500)
     OR (v_device IS NOT NULL AND length(v_device) > 120) THEN
    RAISE EXCEPTION 'CASH_MASTER_CREATE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_code := upper(coalesce(
    nullif(btrim(p_payload->>'codigo'), ''),
    'CAJA-' || substr(replace(v_id::text, '-', ''), 1, 10)
  ));
  IF length(v_code) > 60 THEN
    RAISE EXCEPTION 'CASH_MASTER_CODE_INVALID' USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_strip_nulls(jsonb_build_object(
    'nombre', v_name, 'descripcion', v_description, 'almacen_id', v_warehouse_id,
    'sucursal_id', v_branch_id, 'dispositivo', v_device, 'tipo', v_type,
    'codigo_solicitado', nullif(btrim(coalesce(p_payload->>'codigo', '')), '')
  ));
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:CREATE:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'CREAR_CAJA', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_warehouse_id AND a.tenant_id = p_tenant_id
      AND coalesce(a.activo, true)
      AND lower(coalesce(a.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'CASH_WAREHOUSE_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514';
  END IF;
  IF v_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sucursales s
    WHERE s.id = v_branch_id AND s.tenant_id = p_tenant_id
      AND lower(coalesce(s.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'CASH_BRANCH_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.cajas (
    id, tenant_id, nombre, codigo, descripcion, sucursal_id, almacen_id,
    dispositivo, tipo, estado, creado_por, metadata
  ) VALUES (
    v_id, p_tenant_id, v_name, v_code, v_description, v_branch_id, v_warehouse_id,
    v_device, v_type, 'ACTIVO', p_actor_id,
    jsonb_build_object('writer', 'crear_caja_tx_474')
  ) RETURNING * INTO v_cash;

  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, NULL, 'CAJA_CREADA',
    jsonb_build_object('caja_id', v_cash.id, 'codigo', v_cash.codigo), 'COMPLETADO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'caja', to_jsonb(v_cash), 'caja_id', v_cash.id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'CREAR_CAJA', v_key, v_fingerprint, p_actor_id,
    v_cash.id, NULL, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.actualizar_caja_tx_474(
  p_tenant_id uuid,
  p_caja_id uuid,
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
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_before public.cajas%ROWTYPE;
  v_after public.cajas%ROWTYPE;
  v_warehouse_id uuid;
  v_branch_id uuid;
  v_name text;
  v_type text;
  v_state text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.editar');
  IF p_caja_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR p_payload = '{}'::jsonb
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) k
       WHERE k NOT IN ('nombre','descripcion','sucursal_id','almacen_id','dispositivo','tipo','estado')
     ) THEN
    RAISE EXCEPTION 'CASH_MASTER_UPDATE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('caja_id', p_caja_id, 'cambios', p_payload);
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:UPDATE:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'ACTUALIZAR_CAJA', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_before FROM public.cajas c
  WHERE c.id = p_caja_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_MASTER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_name := CASE WHEN p_payload ? 'nombre' THEN nullif(btrim(p_payload->>'nombre'), '') ELSE v_before.nombre END;
  v_type := CASE WHEN p_payload ? 'tipo' THEN upper(btrim(p_payload->>'tipo')) ELSE v_before.tipo END;
  v_state := CASE WHEN p_payload ? 'estado' THEN upper(btrim(p_payload->>'estado')) ELSE upper(v_before.estado::text) END;
  v_warehouse_id := CASE WHEN p_payload ? 'almacen_id'
    THEN app.to_uuid_or_null(coalesce(p_payload->>'almacen_id', '')) ELSE v_before.almacen_id END;
  v_branch_id := CASE WHEN p_payload ? 'sucursal_id'
    THEN app.to_uuid_or_null(coalesce(p_payload->>'sucursal_id', '')) ELSE v_before.sucursal_id END;
  IF v_name IS NULL OR length(v_name) > 160
     OR v_type NOT IN ('TIENDA','MOSTRADOR','KIOSKO')
     OR v_state NOT IN ('ACTIVO','INACTIVO','MANTENIMIENTO','BLOQUEADA')
     OR v_warehouse_id IS NULL
     OR (p_payload ? 'descripcion' AND length(coalesce(p_payload->>'descripcion', '')) > 500)
     OR (p_payload ? 'dispositivo' AND length(coalesce(p_payload->>'dispositivo', '')) > 120) THEN
    RAISE EXCEPTION 'CASH_MASTER_UPDATE_VALUES_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_warehouse_id AND a.tenant_id = p_tenant_id
      AND coalesce(a.activo, true)
      AND lower(coalesce(a.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'CASH_WAREHOUSE_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514';
  END IF;
  IF v_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sucursales s
    WHERE s.id = v_branch_id AND s.tenant_id = p_tenant_id
      AND lower(coalesce(s.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'CASH_BRANCH_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sesiones_caja s
    WHERE s.tenant_id = p_tenant_id AND s.caja_id = p_caja_id
      AND lower(s.estado::text) = 'abierta'
  ) AND (v_warehouse_id IS DISTINCT FROM v_before.almacen_id OR v_state <> 'ACTIVO') THEN
    RAISE EXCEPTION 'CASH_MASTER_OPEN_SESSION_BLOCKS_CRITICAL_CHANGE' USING ERRCODE = '23514';
  END IF;

  UPDATE public.cajas
  SET nombre = v_name,
      descripcion = CASE WHEN p_payload ? 'descripcion' THEN nullif(btrim(p_payload->>'descripcion'), '') ELSE descripcion END,
      sucursal_id = v_branch_id,
      almacen_id = v_warehouse_id,
      dispositivo = CASE WHEN p_payload ? 'dispositivo' THEN nullif(btrim(p_payload->>'dispositivo'), '') ELSE dispositivo END,
      tipo = v_type,
      estado = v_state,
      updated_at = clock_timestamp(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_writer', 'actualizar_caja_tx_474')
  WHERE id = p_caja_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_after;

  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, NULL, 'CAJA_ACTUALIZADA',
    jsonb_build_object('caja_id', p_caja_id, 'antes', to_jsonb(v_before), 'despues', to_jsonb(v_after)),
    'COMPLETADO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'caja', to_jsonb(v_after), 'caja_id', v_after.id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'ACTUALIZAR_CAJA', v_key, v_fingerprint, p_actor_id,
    v_after.id, NULL, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.guardar_configuracion_caja_tx_474(
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
  v_caja_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'caja_id', ''));
  v_min numeric := nullif(p_payload->>'monto_apertura_min', '')::numeric;
  v_max numeric := nullif(p_payload->>'monto_apertura_max', '')::numeric;
  v_tolerance numeric := coalesce(nullif(p_payload->>'tolerancia_diferencia_cierre', '')::numeric, 10);
  v_withdrawal_limit numeric := coalesce(nullif(p_payload->>'retiro_max_sin_autorizacion', '')::numeric, 500);
  v_minimum_balance numeric := coalesce(nullif(p_payload->>'saldo_minimo_operativo', '')::numeric, 50);
  v_currency text := upper(btrim(coalesce(p_payload->>'moneda', app.cash_local_currency_474(p_tenant_id))));
  v_requires_supervisor boolean := coalesce((p_payload->>'requiere_supervisor_fuera_rango')::boolean, true);
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_config public.configuracion_caja%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.editar');
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_min IS NULL OR v_max IS NULL OR v_min < 0 OR v_max <= v_min
     OR v_tolerance < 0 OR v_withdrawal_limit < 0 OR v_minimum_balance < 0
     OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'CASH_CONFIGURATION_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'caja_id', v_caja_id, 'monto_apertura_min', round(v_min,2),
    'monto_apertura_max', round(v_max,2),
    'requiere_supervisor_fuera_rango', v_requires_supervisor,
    'tolerancia_diferencia_cierre', round(v_tolerance,2),
    'retiro_max_sin_autorizacion', round(v_withdrawal_limit,2),
    'saldo_minimo_operativo', round(v_minimum_balance,2), 'moneda', v_currency
  );
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:CONFIG:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'CONFIGURAR_CAJA', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  IF v_caja_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cajas c WHERE c.id = v_caja_id AND c.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'CASH_CONFIGURATION_CASH_REGISTER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.configuracion_caja (
    tenant_id, caja_id, monto_apertura_min, monto_apertura_max,
    requiere_supervisor_fuera_rango, tolerancia_diferencia_cierre,
    retiro_max_sin_autorizacion, saldo_minimo_operativo,
    moneda, activo, estado, updated_by, updated_at, metadata
  ) VALUES (
    p_tenant_id, v_caja_id, round(v_min,2), round(v_max,2),
    v_requires_supervisor, round(v_tolerance,2), round(v_withdrawal_limit,2),
    round(v_minimum_balance,2), v_currency, true, 'ACTIVO', p_actor_id,
    clock_timestamp(), jsonb_build_object('writer', 'guardar_configuracion_caja_tx_474')
  )
  ON CONFLICT (tenant_id, caja_id) DO UPDATE SET
    monto_apertura_min = EXCLUDED.monto_apertura_min,
    monto_apertura_max = EXCLUDED.monto_apertura_max,
    requiere_supervisor_fuera_rango = EXCLUDED.requiere_supervisor_fuera_rango,
    tolerancia_diferencia_cierre = EXCLUDED.tolerancia_diferencia_cierre,
    retiro_max_sin_autorizacion = EXCLUDED.retiro_max_sin_autorizacion,
    saldo_minimo_operativo = EXCLUDED.saldo_minimo_operativo,
    moneda = EXCLUDED.moneda,
    activo = true,
    estado = 'ACTIVO',
    updated_by = p_actor_id,
    updated_at = clock_timestamp(),
    metadata = coalesce(public.configuracion_caja.metadata, '{}'::jsonb)
      || jsonb_build_object('last_writer', 'guardar_configuracion_caja_tx_474')
  RETURNING * INTO v_config;

  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, NULL, 'CONFIGURACION_CAJA_GUARDADA',
    jsonb_build_object('configuracion_id', v_config.id, 'caja_id', v_caja_id), 'COMPLETADO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false,
    'configuracion', to_jsonb(v_config), 'configuracion_id', v_config.id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'CONFIGURAR_CAJA', v_key, v_fingerprint, p_actor_id,
    v_config.id, NULL, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.opciones_contables_caja_474(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cash public.plan_cuentas%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.ver');
  v_cash := app.cash_account_10111_474(p_tenant_id);
  SELECT jsonb_build_object(
    'moneda_local', app.cash_local_currency_474(p_tenant_id),
    'cuenta_caja', jsonb_build_object('id', v_cash.id, 'codigo', v_cash.codigo, 'nombre', v_cash.nombre),
    'cuentas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id, 'codigo', pc.codigo, 'nombre', pc.nombre,
        'tipo', coalesce(pc.tipo, pc.tipo_cuenta),
        'aplicable_a', jsonb_strip_nulls(jsonb_build_object(
          'boveda', CASE WHEN ((upper(coalesce(pc.tipo,pc.tipo_cuenta,'')) IN ('ACTIVO','ASSET') OR btrim(pc.codigo) ~ '^10') AND btrim(pc.codigo) <> '10111') THEN true END,
          'gasto', CASE WHEN (upper(coalesce(pc.tipo,pc.tipo_cuenta,'')) IN ('GASTO','EGRESO','EXPENSE') OR btrim(pc.codigo) ~ '^6') THEN true END,
          'ingreso', CASE WHEN (upper(coalesce(pc.tipo,pc.tipo_cuenta,'')) IN ('INGRESO','REVENUE','INCOME') OR btrim(pc.codigo) ~ '^7') THEN true END
        ))
      ) ORDER BY pc.codigo)
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id
        AND coalesce(pc.acepta_movimiento, false)
        AND coalesce(pc.activo, true)
        AND lower(coalesce(pc.estado::text, 'activo')) = 'activo'
        AND pc.id <> v_cash.id
    ), '[]'::jsonb),
    'cuentas_bancarias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cb.id, 'banco', cb.banco, 'nombre', cb.nombre,
        'numero_cuenta', cb.numero_cuenta, 'moneda', upper(cb.moneda),
        'cuenta_contable_id', cb.cuenta_contable_id
      ) ORDER BY cb.banco, cb.numero_cuenta)
      FROM public.cuentas_bancarias cb
      JOIN public.plan_cuentas pc ON pc.id = cb.cuenta_contable_id
        AND pc.tenant_id = p_tenant_id AND coalesce(pc.acepta_movimiento, false)
        AND lower(coalesce(pc.estado::text, 'activo')) = 'activo'
      WHERE cb.tenant_id = p_tenant_id
        AND coalesce(cb.activa, false)
        AND lower(coalesce(cb.estado, 'activo')) = 'activo'
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.registrar_auditoria_caja_tx_474(
  p_tenant_id uuid,
  p_event text,
  p_actor_id uuid,
  p_session_id uuid,
  p_metadata jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_event text := upper(btrim(coalesce(p_event, '')));
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_audit_id uuid;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.ver');
  IF v_event = '' OR length(v_event) > 120
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     OR (p_session_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.sesiones_caja s
       WHERE s.id = p_session_id AND s.tenant_id = p_tenant_id
     )) THEN
    RAISE EXCEPTION 'CASH_AUDIT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'evento', v_event, 'actor_id', p_actor_id, 'sesion_id', p_session_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:AUDIT:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'AUDITORIA', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_audit_id := app.cash_audit_474(
    p_tenant_id, p_actor_id, p_session_id, v_event,
    coalesce(p_metadata->'parametros', '{}'::jsonb),
    coalesce(nullif(p_metadata->>'resultado', ''), 'REGISTRADO'),
    coalesce(nullif(upper(p_metadata->>'riesgo'), ''), 'BAJO')
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'audit_id', v_audit_id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'AUDITORIA', v_key, v_fingerprint, p_actor_id,
    coalesce(p_session_id, v_audit_id), NULL, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.registrar_movimiento_manual_caja_tx_474(
  p_tenant_id uuid,
  p_session_id uuid,
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
  v_type text := upper(btrim(coalesce(p_payload->>'tipo', '')));
  v_amount numeric := nullif(p_payload->>'monto', '')::numeric;
  v_reason text := nullif(btrim(coalesce(p_payload->>'motivo', '')), '');
  v_counter_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_contrapartida_id', ''));
  v_rate numeric := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_session public.sesiones_caja%ROWTYPE;
  v_cash public.plan_cuentas%ROWTYPE;
  v_counter public.plan_cuentas%ROWTYPE;
  v_movement public.movimientos_caja%ROWTYPE;
  v_currency text;
  v_local_currency text;
  v_local_amount numeric(14,2);
  v_event_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.movimientos.manual');
  IF p_session_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_type NOT IN ('INGRESO','GASTO')
     OR v_amount IS NULL OR v_amount <= 0 OR v_amount > 999999999999::numeric
     OR v_reason IS NULL OR length(v_reason) > 300
     OR v_counter_id IS NULL THEN
    RAISE EXCEPTION 'CASH_MANUAL_MOVEMENT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_amount := round(v_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'CASH_MANUAL_MOVEMENT_AMOUNT_TOO_SMALL' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'sesion_id', p_session_id, 'tipo', v_type, 'monto', v_amount,
    'motivo', v_reason, 'cuenta_contrapartida_id', v_counter_id,
    'tipo_cambio', CASE WHEN v_rate IS NULL THEN NULL ELSE round(v_rate, 6) END
  );
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:MANUAL:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'MOVIMIENTO_MANUAL', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_session FROM public.sesiones_caja s
  WHERE s.id = p_session_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_session.estado::text) <> 'abierta' OR coalesce(v_session.congelada, false) THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_AVAILABLE' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_session.usuario_id, v_session.cajero_id) IS DISTINCT FROM p_actor_id
     AND NOT app.cash_actor_is_supervisor_474(p_tenant_id, p_actor_id) THEN
    RAISE EXCEPTION 'CASH_SESSION_ACTOR_NOT_OWNER_OR_SUPERVISOR' USING ERRCODE = '42501';
  END IF;

  v_cash := app.cash_account_10111_474(p_tenant_id);
  v_counter := app.cash_postable_account_474(
    p_tenant_id, v_counter_id, CASE WHEN v_type = 'INGRESO' THEN 'INCOME' ELSE 'EXPENSE' END
  );
  IF v_cash.id = v_counter.id THEN
    RAISE EXCEPTION 'CASH_COUNTERPART_MUST_DIFFER_FROM_CASH' USING ERRCODE = '23514';
  END IF;
  v_currency := upper(coalesce(v_session.moneda, app.cash_local_currency_474(p_tenant_id)));
  v_local_currency := app.cash_local_currency_474(p_tenant_id);
  IF v_currency = v_local_currency THEN
    IF v_rate IS NOT NULL AND round(v_rate,6) <> 1 THEN
      RAISE EXCEPTION 'CASH_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'CASH_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE
    v_rate := round(v_rate, 6);
  END IF;
  v_local_amount := round(v_amount * v_rate, 2);
  IF v_local_amount <= 0 THEN
    RAISE EXCEPTION 'CASH_LOCAL_AMOUNT_INVALID' USING ERRCODE = '23514';
  END IF;

  v_movement := app.cash_append_movement_474(
    p_tenant_id, p_session_id,
    CASE WHEN v_type = 'INGRESO' THEN 'INGRESO' ELSE 'AJUSTE' END,
    CASE WHEN v_type = 'INGRESO' THEN v_amount ELSE -v_amount END,
    p_actor_id, format('%s: %s', v_type, v_reason), 'MANUAL_474', v_key, NULL
  );
  PERFORM app.cash_outbox_474(
    p_tenant_id, 'movimiento_caja', v_movement.id,
    'caja.movimiento_manual.registrado', v_event_id,
    jsonb_build_object(
      'movimientoId', v_movement.id, 'sesionCajaId', p_session_id,
      'tipo', v_type, 'monto', v_local_amount, 'montoOrigen', v_amount,
      'moneda', v_currency, 'monedaLocal', v_local_currency, 'tipoCambio', v_rate,
      'fecha', current_date, 'descripcion', v_reason,
      'referencia', format('CAJA-MANUAL-%s', v_movement.id),
      'cuentaCajaId', v_cash.id, 'cuentaCajaCodigo', v_cash.codigo,
      'cuentaContrapartidaId', v_counter.id,
      'cuentaContrapartidaCodigo', v_counter.codigo,
      'actorId', p_actor_id
    )
  );
  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, p_session_id, 'MOVIMIENTO_MANUAL_REGISTRADO',
    jsonb_build_object(
      'movimiento_id', v_movement.id, 'tipo', v_type, 'monto', v_amount,
      'cuenta_contrapartida_id', v_counter.id, 'saldo_nuevo', v_movement.saldo_nuevo
    ), 'COMPLETADO', 'MEDIO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'movimiento', to_jsonb(v_movement),
    'movimiento_id', v_movement.id, 'event_id', v_event_id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'MOVIMIENTO_MANUAL', v_key, v_fingerprint, p_actor_id,
    v_movement.id, v_event_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.solicitar_retiro_caja_tx_474(
  p_tenant_id uuid,
  p_session_id uuid,
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
  v_amount numeric := nullif(p_payload->>'monto', '')::numeric;
  v_reason text := upper(btrim(coalesce(p_payload->>'motivo', '')));
  v_detail text := nullif(btrim(coalesce(p_payload->>'motivo_detalle', '')), '');
  v_photo text := nullif(btrim(coalesce(p_payload->>'foto_comprobante', '')), '');
  v_bank_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_bancaria_id', ''));
  v_counter_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_contrapartida_id', ''));
  v_rate numeric := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_session public.sesiones_caja%ROWTYPE;
  v_config public.configuracion_caja%ROWTYPE;
  v_cash public.plan_cuentas%ROWTYPE;
  v_counter public.plan_cuentas%ROWTYPE;
  v_bank public.cuentas_bancarias%ROWTYPE;
  v_movement public.movimientos_caja%ROWTYPE;
  v_retiro public.retiros_caja%ROWTYPE;
  v_bank_result jsonb;
  v_bank_movement_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_currency text;
  v_local_currency text;
  v_local_amount numeric(14,2);
  v_balance numeric(14,2);
  v_minimum_balance numeric(14,2);
  v_limit numeric(14,2);
  v_authorized_by uuid;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.retiros.crear');
  IF v_reason = 'BÓVEDA' THEN v_reason := 'BOVEDA'; END IF;
  IF p_session_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_amount IS NULL OR v_amount <= 0 OR v_amount > 999999999999::numeric
     OR v_reason NOT IN ('DEPOSITO_BANCARIO','COMPRA_EMERGENCIA','BOVEDA','OTRO')
     OR (v_detail IS NOT NULL AND length(v_detail) > 300)
     OR (v_photo IS NOT NULL AND length(v_photo) > 2000)
     OR (v_reason = 'OTRO' AND v_detail IS NULL)
     OR (v_reason = 'DEPOSITO_BANCARIO' AND (v_bank_id IS NULL OR v_photo IS NULL))
     OR (v_reason <> 'DEPOSITO_BANCARIO' AND v_counter_id IS NULL) THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_PAYLOAD_INVALID_OR_DESTINATION_MISSING' USING ERRCODE = '22023';
  END IF;
  v_amount := round(v_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_AMOUNT_TOO_SMALL' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_strip_nulls(jsonb_build_object(
    'sesion_id', p_session_id, 'monto', v_amount, 'motivo', v_reason,
    'motivo_detalle', v_detail, 'foto_comprobante', v_photo,
    'cuenta_bancaria_id', v_bank_id, 'cuenta_contrapartida_id', v_counter_id,
    'tipo_cambio', CASE WHEN v_rate IS NULL THEN NULL ELSE round(v_rate, 6) END
  ));
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:WITHDRAW:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'RETIRO', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_session FROM public.sesiones_caja s
  WHERE s.id = p_session_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_session.estado::text) <> 'abierta' OR coalesce(v_session.congelada, false) THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_AVAILABLE' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_session.usuario_id, v_session.cajero_id) IS DISTINCT FROM p_actor_id
     AND NOT app.cash_actor_is_supervisor_474(p_tenant_id, p_actor_id) THEN
    RAISE EXCEPTION 'CASH_SESSION_ACTOR_NOT_OWNER_OR_SUPERVISOR' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config
  FROM public.configuracion_caja cc
  WHERE cc.tenant_id = p_tenant_id
    AND (cc.caja_id = v_session.caja_id OR cc.caja_id IS NULL)
    AND coalesce(cc.activo, true)
    AND lower(coalesce(cc.estado::text, 'activo')) = 'activo'
  ORDER BY (cc.caja_id = v_session.caja_id) DESC, cc.updated_at DESC
  LIMIT 1 FOR SHARE;
  v_minimum_balance := round(coalesce(v_config.saldo_minimo_operativo, 50), 2);
  v_limit := round(coalesce(v_config.retiro_max_sin_autorizacion, 500), 2);
  IF v_amount > v_limit THEN
    IF NOT app.cash_actor_is_supervisor_474(p_tenant_id, p_actor_id) THEN
      RAISE EXCEPTION 'CASH_HIGH_WITHDRAWAL_REQUIRES_AUTHENTICATED_SUPERVISOR' USING ERRCODE = '42501';
    END IF;
    v_authorized_by := p_actor_id;
  END IF;

  SELECT round(coalesce(v_session.monto_inicio, v_session.monto_inicial, 0)
      + coalesce(sum(m.monto), 0), 2)
    INTO v_balance
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_session_id;
  IF v_balance - v_amount < v_minimum_balance THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_VIOLATES_MINIMUM_BALANCE' USING ERRCODE = '23514';
  END IF;

  v_cash := app.cash_account_10111_474(p_tenant_id);
  v_currency := upper(coalesce(v_session.moneda, app.cash_local_currency_474(p_tenant_id)));
  v_local_currency := app.cash_local_currency_474(p_tenant_id);
  IF v_currency = v_local_currency THEN
    IF v_rate IS NOT NULL AND round(v_rate,6) <> 1 THEN
      RAISE EXCEPTION 'CASH_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'CASH_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE
    v_rate := round(v_rate, 6);
  END IF;
  v_local_amount := round(v_amount * v_rate, 2);

  IF v_reason = 'DEPOSITO_BANCARIO' THEN
    SELECT * INTO v_bank FROM public.cuentas_bancarias cb
    WHERE cb.id = v_bank_id AND cb.tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_bank.activa, false)
       OR lower(coalesce(v_bank.estado, 'activo')) <> 'activo'
       OR upper(coalesce(v_bank.moneda, '')) <> v_currency THEN
      RAISE EXCEPTION 'CASH_BANK_DESTINATION_NOT_ACTIVE_OR_CURRENCY_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_bank_result := app.registrar_movimiento_bancario_tx_457(
      p_tenant_id,
      jsonb_build_object(
        'cuenta_bancaria_id', v_bank.id,
        'cuenta_contrapartida_id', v_cash.id,
        'tipo', 'ABONO', 'monto', v_amount, 'fecha', current_date,
        'descripcion', format('Depósito de efectivo desde sesión de caja %s', p_session_id),
        'referencia', format('RETIRO-CAJA:%s', v_key),
        'metodo_pago', 'EFECTIVO', 'categoria', 'OTRO_INGRESO',
        'moneda', v_currency, 'tipo_cambio', v_rate
      ),
      p_actor_id,
      'cash474-bank:' || app.cash_fingerprint_474(jsonb_build_object(
        'tenant_id', p_tenant_id, 'retiro_idempotency_key', v_key
      ))
    );
    v_bank_movement_id := app.to_uuid_or_null(v_bank_result->>'movimiento_id');
    v_event_id := app.to_uuid_or_null(v_bank_result->>'event_id');
    IF v_bank_movement_id IS NULL OR v_event_id IS NULL THEN
      RAISE EXCEPTION 'CASH_BANK_DEPOSIT_DID_NOT_RETURN_DURABLE_EVENT' USING ERRCODE = '23514';
    END IF;
    v_counter_id := v_cash.id;
  ELSIF v_reason = 'BOVEDA' THEN
    v_counter := app.cash_postable_account_474(p_tenant_id, v_counter_id, 'VAULT');
    IF v_counter.id = v_cash.id THEN
      RAISE EXCEPTION 'CASH_VAULT_ACCOUNT_MUST_DIFFER_FROM_CASH' USING ERRCODE = '23514';
    END IF;
  ELSE
    v_counter := app.cash_postable_account_474(p_tenant_id, v_counter_id, 'EXPENSE');
  END IF;

  v_movement := app.cash_append_movement_474(
    p_tenant_id, p_session_id, 'RETIRO', -v_amount, p_actor_id,
    format('RETIRO %s: %s', v_reason, coalesce(v_detail, 'sin detalle')),
    'RETIRO_CAJA_474', v_key, v_authorized_by
  );
  INSERT INTO public.retiros_caja (
    tenant_id, sesion_caja_id, caja_id, movimiento_caja_id, monto, motivo,
    motivo_detalle, autorizado_por, codigo_autorizacion, foto_comprobante,
    estado_conciliacion, banco_destino, numero_operacion,
    cuenta_bancaria_id, movimiento_bancario_id, cuenta_contrapartida_id,
    idempotency_key, request_fingerprint, event_id, moneda, tipo_cambio,
    monto_moneda_local, estado, metadata
  ) VALUES (
    p_tenant_id, p_session_id, v_session.caja_id, v_movement.id, v_amount, v_reason,
    v_detail, v_authorized_by, NULL, v_photo, 'PENDIENTE',
    CASE WHEN v_reason = 'DEPOSITO_BANCARIO' THEN coalesce(v_bank.banco, v_bank.nombre) END,
    NULL, v_bank_id, v_bank_movement_id, v_counter_id,
    v_key, v_fingerprint, v_event_id, v_currency, v_rate,
    v_local_amount, 'ACTIVO', jsonb_build_object('writer', 'solicitar_retiro_caja_tx_474')
  ) RETURNING * INTO v_retiro;

  IF v_reason <> 'DEPOSITO_BANCARIO' THEN
    PERFORM app.cash_outbox_474(
      p_tenant_id, 'retiro_caja', v_retiro.id,
      'caja.retiro.registrado', v_event_id,
      jsonb_build_object(
        'retiroId', v_retiro.id, 'movimientoId', v_movement.id,
        'sesionCajaId', p_session_id, 'motivo', v_reason,
        'monto', v_local_amount, 'montoOrigen', v_amount,
        'moneda', v_currency, 'monedaLocal', v_local_currency, 'tipoCambio', v_rate,
        'fecha', current_date, 'descripcion', coalesce(v_detail, v_reason),
        'referencia', format('RETIRO-CAJA-%s', v_retiro.id),
        'cuentaCajaId', v_cash.id, 'cuentaCajaCodigo', v_cash.codigo,
        'cuentaContrapartidaId', v_counter.id,
        'cuentaContrapartidaCodigo', v_counter.codigo,
        'actorId', p_actor_id
      )
    );
  END IF;
  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, p_session_id, 'RETIRO_AUTORIZADO',
    jsonb_build_object(
      'retiro_id', v_retiro.id, 'movimiento_id', v_movement.id,
      'motivo', v_reason, 'monto', v_amount,
      'saldo_antes', v_balance, 'saldo_despues', v_movement.saldo_nuevo,
      'cuenta_bancaria_id', v_bank_id, 'cuenta_contrapartida_id', v_counter_id
    ), 'APROBADO', CASE WHEN v_amount > v_limit THEN 'ALTO' ELSE 'MEDIO' END
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'retiro', to_jsonb(v_retiro),
    'retiro_id', v_retiro.id, 'movimiento_id', v_movement.id,
    'movimiento_bancario_id', v_bank_movement_id, 'event_id', v_event_id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'RETIRO', v_key, v_fingerprint, p_actor_id,
    v_retiro.id, v_event_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.conciliar_retiro_caja_tx_474(
  p_tenant_id uuid,
  p_retiro_id uuid,
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
  v_operation_number text := nullif(btrim(coalesce(p_payload->>'numero_operacion', '')), '');
  v_date timestamptz := nullif(p_payload->>'fecha_conciliacion', '')::timestamptz;
  v_evidence text := nullif(btrim(coalesce(p_payload->>'comprobante_url', '')), '');
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_retiro public.retiros_caja%ROWTYPE;
  v_bank public.cuentas_bancarias%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.retiros.conciliar');
  IF p_retiro_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_operation_number IS NULL OR length(v_operation_number) > 120
     OR v_date IS NULL
     OR (v_evidence IS NOT NULL AND length(v_evidence) > 2000) THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_RECONCILIATION_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_strip_nulls(jsonb_build_object(
    'retiro_id', p_retiro_id, 'numero_operacion', v_operation_number,
    'fecha_conciliacion', v_date, 'comprobante_url', v_evidence
  ));
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:RECON:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'CONCILIAR_RETIRO', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_retiro FROM public.retiros_caja r
  WHERE r.id = p_retiro_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASH_WITHDRAWAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_retiro.motivo <> 'DEPOSITO_BANCARIO'
     OR v_retiro.cuenta_bancaria_id IS NULL
     OR v_retiro.movimiento_bancario_id IS NULL THEN
    RAISE EXCEPTION 'CASH_ONLY_DURABLE_BANK_DEPOSIT_CAN_BE_RECONCILED' USING ERRCODE = '23514';
  END IF;
  IF lower(v_retiro.estado_conciliacion::text) <> 'pendiente' THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_NOT_PENDING' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_bank FROM public.cuentas_bancarias cb
  WHERE cb.id = v_retiro.cuenta_bancaria_id AND cb.tenant_id = p_tenant_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_BANK_DESTINATION_LOST' USING ERRCODE = '23514';
  END IF;
  IF v_evidence IS NULL AND nullif(btrim(coalesce(v_retiro.foto_comprobante, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CASH_WITHDRAWAL_RECONCILIATION_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  UPDATE public.retiros_caja
  SET estado_conciliacion = 'CONCILIADO', fecha_conciliacion = v_date,
      banco_destino = coalesce(v_bank.banco, v_bank.nombre),
      numero_operacion = v_operation_number,
      foto_comprobante = coalesce(v_evidence, foto_comprobante),
      comprobante_url = coalesce(v_evidence, comprobante_url, foto_comprobante),
      conciliado_por = p_actor_id, updated_at = clock_timestamp(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'conciliacion_writer', 'conciliar_retiro_caja_tx_474',
        'nota', 'Evidencia operativa; el match de extracto permanece bajo conciliación bancaria 457'
      )
  WHERE id = p_retiro_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_retiro;

  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, v_retiro.sesion_caja_id, 'RETIRO_CONCILIADO',
    jsonb_build_object(
      'retiro_id', v_retiro.id, 'cuenta_bancaria_id', v_retiro.cuenta_bancaria_id,
      'movimiento_bancario_id', v_retiro.movimiento_bancario_id,
      'numero_operacion', v_operation_number
    ), 'CONCILIADO', 'MEDIO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'retiro', to_jsonb(v_retiro),
    'retiro_id', v_retiro.id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'CONCILIAR_RETIRO', v_key, v_fingerprint, p_actor_id,
    v_retiro.id, NULL, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.iniciar_cambio_turno_caja_tx_474(
  p_tenant_id uuid,
  p_session_id uuid,
  p_incoming_user_id uuid,
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
  v_session public.sesiones_caja%ROWTYPE;
  v_change public.cambios_turno%ROWTYPE;
  v_balance numeric(14,2);
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.cambios_turno.iniciar');
  IF p_session_id IS NULL OR p_incoming_user_id IS NULL
     OR p_incoming_user_id = p_actor_id
     OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'CASH_SHIFT_START_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object(
    'sesion_id', p_session_id, 'usuario_entrante_id', p_incoming_user_id
  );
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:SHIFT-START:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'INICIAR_CAMBIO', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_session FROM public.sesiones_caja s
  WHERE s.id = p_session_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_session.estado::text) <> 'abierta' OR coalesce(v_session.congelada, false) THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_AVAILABLE_FOR_SHIFT' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_session.usuario_id, v_session.cajero_id) IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'CASH_SHIFT_OUTGOING_ACTOR_MUST_OWN_SESSION' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
    WHERE u.id = p_incoming_user_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, false)
      AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'CASH_SHIFT_INCOMING_USER_NOT_ACTIVE' USING ERRCODE = '23514';
  END IF;

  SELECT round(coalesce(v_session.monto_inicio, v_session.monto_inicial, 0)
      + coalesce(sum(m.monto), 0), 2)
    INTO v_balance
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_session_id;

  INSERT INTO public.cambios_turno (
    tenant_id, sesion_caja_id, usuario_saliente_id, usuario_entrante_id,
    saldo_sistema, saldo_contado, diferencia, denominaciones,
    timestamp_inicio, timestamp_fin, estado, metadata
  ) VALUES (
    p_tenant_id, p_session_id, p_actor_id, p_incoming_user_id,
    v_balance, 0, 0, jsonb_build_object('billetes','{}'::jsonb,'monedas','{}'::jsonb),
    clock_timestamp(), NULL, 'EN_PROCESO',
    jsonb_build_object('writer', 'iniciar_cambio_turno_caja_tx_474')
  ) RETURNING * INTO v_change;

  UPDATE public.sesiones_caja
  SET congelada = true, updated_at = clock_timestamp(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('cambio_turno_en_proceso_id', v_change.id)
  WHERE id = p_session_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SHIFT_SESSION_FREEZE_LOST' USING ERRCODE = '40001';
  END IF;

  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, p_session_id, 'CAMBIO_TURNO_INICIADO',
    jsonb_build_object(
      'cambio_turno_id', v_change.id, 'usuario_entrante_id', p_incoming_user_id,
      'saldo_sistema', v_balance
    ), 'INICIADO', 'MEDIO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'cambio', to_jsonb(v_change),
    'cambio_id', v_change.id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'INICIAR_CAMBIO', v_key, v_fingerprint, p_actor_id,
    v_change.id, NULL, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.completar_cambio_turno_caja_tx_474(
  p_tenant_id uuid,
  p_change_id uuid,
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
  v_counted numeric := nullif(p_payload->>'monto_contado', '')::numeric;
  v_denominations jsonb := p_payload->'denominaciones';
  v_photo text := nullif(btrim(coalesce(p_payload->>'foto_arqueo', '')), '');
  v_outgoing_confirmation text := nullif(btrim(coalesce(p_payload->>'confirmacion_saliente', '')), '');
  v_incoming_confirmation text := nullif(btrim(coalesce(p_payload->>'confirmacion_entrante', '')), '');
  v_difference_account_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cuenta_diferencia_id', ''));
  v_rate numeric := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_change public.cambios_turno%ROWTYPE;
  v_session public.sesiones_caja%ROWTYPE;
  v_cash public.plan_cuentas%ROWTYPE;
  v_counter public.plan_cuentas%ROWTYPE;
  v_movement public.movimientos_caja%ROWTYPE;
  v_total numeric(14,2);
  v_difference numeric(14,2);
  v_currency text;
  v_local_currency text;
  v_local_amount numeric(14,2);
  v_event_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.cambios_turno.completar');
  IF p_change_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_counted IS NULL OR v_counted < 0 OR v_counted > 999999999999::numeric
     OR v_denominations IS NULL
     OR v_photo IS NULL OR length(v_photo) > 2000
     OR v_outgoing_confirmation IS NULL OR length(v_outgoing_confirmation) NOT BETWEEN 4 AND 200
     OR v_incoming_confirmation IS NULL OR length(v_incoming_confirmation) NOT BETWEEN 4 AND 200 THEN
    RAISE EXCEPTION 'CASH_SHIFT_COMPLETE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_counted := round(v_counted, 2);
  v_total := app.cash_denominations_total_474(v_denominations);
  IF abs(v_total - v_counted) > 0.01 THEN
    RAISE EXCEPTION 'CASH_SHIFT_DENOMINATIONS_DO_NOT_MATCH_COUNTED_BALANCE' USING ERRCODE = '23514';
  END IF;
  v_canonical := jsonb_build_object(
    'cambio_id', p_change_id, 'monto_contado', v_counted,
    'denominaciones', v_denominations, 'foto_arqueo', v_photo,
    'confirmacion_saliente_hash', app.cash_fingerprint_474(to_jsonb(v_outgoing_confirmation)),
    'confirmacion_entrante_hash', app.cash_fingerprint_474(to_jsonb(v_incoming_confirmation)),
    'cuenta_diferencia_id', v_difference_account_id,
    'tipo_cambio', CASE WHEN v_rate IS NULL THEN NULL ELSE round(v_rate, 6) END
  );
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:SHIFT-COMPLETE:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'COMPLETAR_CAMBIO', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_change FROM public.cambios_turno c
  WHERE c.id = p_change_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASH_SHIFT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_change.estado::text) <> 'en_proceso' THEN
    RAISE EXCEPTION 'CASH_SHIFT_NOT_IN_PROGRESS' USING ERRCODE = '23514';
  END IF;
  IF v_change.usuario_entrante_id IS DISTINCT FROM p_actor_id
     AND NOT app.cash_actor_is_supervisor_474(p_tenant_id, p_actor_id) THEN
    RAISE EXCEPTION 'CASH_SHIFT_COMPLETE_REQUIRES_INCOMING_USER_OR_SUPERVISOR' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_session FROM public.sesiones_caja s
  WHERE s.id = v_change.sesion_caja_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR lower(v_session.estado::text) <> 'abierta'
     OR NOT coalesce(v_session.congelada, false)
     OR coalesce(v_session.metadata->>'cambio_turno_en_proceso_id', '') <> p_change_id::text THEN
    RAISE EXCEPTION 'CASH_SHIFT_SESSION_NOT_FROZEN_BY_THIS_CHANGE' USING ERRCODE = '23514';
  END IF;

  v_difference := round(v_counted - v_change.saldo_sistema, 2);
  v_cash := app.cash_account_10111_474(p_tenant_id);
  v_currency := upper(coalesce(v_session.moneda, app.cash_local_currency_474(p_tenant_id)));
  v_local_currency := app.cash_local_currency_474(p_tenant_id);
  IF v_currency = v_local_currency THEN
    IF v_rate IS NOT NULL AND round(v_rate,6) <> 1 THEN
      RAISE EXCEPTION 'CASH_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'CASH_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE
    v_rate := round(v_rate, 6);
  END IF;
  v_local_amount := round(abs(v_difference) * v_rate, 2);
  IF abs(v_difference) >= 0.01 THEN
    IF v_difference_account_id IS NULL THEN
      RAISE EXCEPTION 'CASH_SHIFT_DIFFERENCE_ACCOUNT_REQUIRED' USING ERRCODE = '23514';
    END IF;
    v_counter := app.cash_postable_account_474(
      p_tenant_id, v_difference_account_id,
      CASE WHEN v_difference > 0 THEN 'INCOME' ELSE 'EXPENSE' END
    );
    IF v_counter.id = v_cash.id THEN
      RAISE EXCEPTION 'CASH_SHIFT_COUNTERPART_MUST_DIFFER_FROM_CASH' USING ERRCODE = '23514';
    END IF;
    v_movement := app.cash_append_movement_474(
      p_tenant_id, v_session.id, 'CAMBIO_TURNO', v_difference,
      p_actor_id,
      format('Diferencia de cambio de turno %s (%s)', p_change_id,
        CASE WHEN v_difference > 0 THEN 'SOBRANTE' ELSE 'FALTANTE' END),
      'CAMBIO_TURNO_474', p_change_id::text,
      CASE WHEN app.cash_actor_is_supervisor_474(p_tenant_id, p_actor_id) THEN p_actor_id ELSE NULL END
    );
  END IF;

  UPDATE public.cambios_turno
  SET saldo_contado = v_counted, diferencia = v_difference,
      denominaciones = v_denominations, foto_arqueo = v_photo,
      firma_digital_saliente = 'sha256:' || encode(extensions.digest(
        convert_to(v_outgoing_confirmation || ':' || p_change_id || ':' || v_key, 'UTF8'), 'sha256'), 'hex'),
      firma_digital_entrante = 'sha256:' || encode(extensions.digest(
        convert_to(v_incoming_confirmation || ':' || p_change_id || ':' || v_key, 'UTF8'), 'sha256'), 'hex'),
      timestamp_fin = clock_timestamp(), estado = 'COMPLETADO',
      cuenta_diferencia_id = v_difference_account_id, event_id = v_event_id,
      moneda = v_currency, tipo_cambio = v_rate,
      monto_moneda_local = v_local_amount, completado_por = p_actor_id,
      updated_at = clock_timestamp(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_writer', 'completar_cambio_turno_caja_tx_474',
        'confirmaciones', 'hash_sha256_no_firma_legal'
      )
  WHERE id = p_change_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_change;

  UPDATE public.sesiones_caja
  SET usuario_id = v_change.usuario_entrante_id,
      cajero_id = v_change.usuario_entrante_id,
      congelada = false,
      updated_at = clock_timestamp(),
      metadata = (coalesce(metadata, '{}'::jsonb) - 'cambio_turno_en_proceso_id')
        || jsonb_build_object('ultimo_cambio_turno_id', p_change_id)
  WHERE id = v_session.id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SHIFT_SESSION_HANDOFF_LOST' USING ERRCODE = '40001';
  END IF;

  PERFORM app.cash_outbox_474(
    p_tenant_id, 'cambio_turno', p_change_id,
    'caja.cambio_turno.completado', v_event_id,
    jsonb_strip_nulls(jsonb_build_object(
      'cambioTurnoId', p_change_id, 'sesionCajaId', v_session.id,
      'movimientoId', v_movement.id, 'diferencia', round(v_difference * v_rate, 2),
      'diferenciaOrigen', v_difference, 'monto', v_local_amount,
      'montoOrigen', abs(v_difference),
      'moneda', v_currency, 'monedaLocal', v_local_currency, 'tipoCambio', v_rate,
      'fecha', current_date,
      'descripcion', CASE WHEN abs(v_difference) < 0.01 THEN 'Cambio de turno sin diferencia'
        WHEN v_difference > 0 THEN 'Sobrante en cambio de turno'
        ELSE 'Faltante en cambio de turno' END,
      'referencia', format('CAMBIO-TURNO-%s', p_change_id),
      'cuentaCajaId', v_cash.id, 'cuentaCajaCodigo', v_cash.codigo,
      'cuentaContrapartidaId', v_counter.id,
      'cuentaContrapartidaCodigo', v_counter.codigo,
      'actorId', p_actor_id
    ))
  );
  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, v_session.id, 'CAMBIO_TURNO_COMPLETADO',
    jsonb_build_object(
      'cambio_turno_id', p_change_id, 'usuario_saliente_id', v_change.usuario_saliente_id,
      'usuario_entrante_id', v_change.usuario_entrante_id,
      'saldo_sistema', v_change.saldo_sistema, 'saldo_contado', v_counted,
      'diferencia', v_difference, 'movimiento_id', v_movement.id
    ), 'COMPLETADO', CASE WHEN abs(v_difference) >= 0.01 THEN 'ALTO' ELSE 'MEDIO' END
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'cambio', to_jsonb(v_change),
    'cambio_id', p_change_id, 'movimiento_id', v_movement.id,
    'event_id', v_event_id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'COMPLETAR_CAMBIO', v_key, v_fingerprint, p_actor_id,
    p_change_id, v_event_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cancelar_cambio_turno_caja_tx_474(
  p_tenant_id uuid,
  p_change_id uuid,
  p_reason text,
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
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_canonical jsonb;
  v_fingerprint text;
  v_existing jsonb;
  v_change public.cambios_turno%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_cash_permission_474(p_tenant_id, p_actor_id, 'cajas.cambios_turno.cancelar');
  IF p_change_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 8 AND 300 THEN
    RAISE EXCEPTION 'CASH_SHIFT_CANCEL_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('cambio_id', p_change_id, 'razon', v_reason);
  v_fingerprint := app.cash_fingerprint_474(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:CASH:SHIFT-CANCEL:%s', p_tenant_id, v_key), 0));
  v_existing := app.cash_operation_existing_474(p_tenant_id, 'CANCELAR_CAMBIO', v_key, v_fingerprint);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_change FROM public.cambios_turno c
  WHERE c.id = p_change_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASH_SHIFT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_change.estado::text) <> 'en_proceso' THEN
    RAISE EXCEPTION 'CASH_SHIFT_NOT_IN_PROGRESS' USING ERRCODE = '23514';
  END IF;
  IF v_change.usuario_saliente_id IS DISTINCT FROM p_actor_id
     AND NOT app.cash_actor_is_supervisor_474(p_tenant_id, p_actor_id) THEN
    RAISE EXCEPTION 'CASH_SHIFT_CANCEL_REQUIRES_OUTGOING_USER_OR_SUPERVISOR' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sesiones_caja
  SET congelada = false, updated_at = clock_timestamp(),
      metadata = (coalesce(metadata, '{}'::jsonb) - 'cambio_turno_en_proceso_id')
        || jsonb_build_object('cambio_turno_cancelado_id', p_change_id)
  WHERE id = v_change.sesion_caja_id AND tenant_id = p_tenant_id
    AND lower(estado::text) = 'abierta'
    AND coalesce(congelada, false)
    AND coalesce(metadata->>'cambio_turno_en_proceso_id', '') = p_change_id::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SHIFT_CANCEL_SESSION_STATE_MISMATCH' USING ERRCODE = '40001';
  END IF;

  UPDATE public.cambios_turno
  SET estado = 'CANCELADO', timestamp_fin = clock_timestamp(),
      razon_cancelacion = v_reason, cancelado_por = p_actor_id,
      updated_at = clock_timestamp(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_writer', 'cancelar_cambio_turno_caja_tx_474')
  WHERE id = p_change_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_change;

  PERFORM app.cash_audit_474(
    p_tenant_id, p_actor_id, v_change.sesion_caja_id, 'CAMBIO_TURNO_CANCELADO',
    jsonb_build_object('cambio_turno_id', p_change_id, 'razon', v_reason),
    'CANCELADO', 'MEDIO'
  );
  v_result := jsonb_build_object(
    'success', true, 'idempotent', false, 'cambio', to_jsonb(v_change),
    'cambio_id', p_change_id
  );
  PERFORM app.cash_record_operation_474(
    p_tenant_id, 'CANCELAR_CAMBIO', v_key, v_fingerprint, p_actor_id,
    p_change_id, NULL, v_result
  );
  RETURN v_result;
END;
$function$;

-- La protección de períodos 458 debe conocer cada evento contable nuevo. Se
-- conserva íntegro el allowlist vigente en 472 y sólo se agregan los tres tipos
-- de Caja 474; los depósitos usan banco.movimiento.registrado de 457.
CREATE OR REPLACE FUNCTION app.is_accounting_event_458(p_event_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT lower(COALESCE(btrim(p_event_type), '')) = ANY (ARRAY[
    'venta.procesada','ventafacturada','pos.venta.registrada','caja.cerrada',
    'caja.movimiento_manual.registrado','caja.retiro.registrado',
    'caja.cambio_turno.completado',
    'banco.movimiento.registrado','banco.transferencia.registrada',
    'cobro.registrado','cobroregistrado','cobro.revertido',
    'cxc.ajuste.registrado','cxcajusteregistrado','cxc.ajuste.revertido',
    'cxp.ajuste.registrado','nota_credito.emitida','nota_debito.emitida',
    'saldo_favor.aplicado','saldo_favor.reembolsado',
    'saldo_favor.reembolso_revertido','recepcion.registrada',
    'recepcionregistrada','factura.proveedor.registrada',
    'facturaproveedorregistrada','devolucion.proveedor.registrada',
    'devolucionproveedoremitida','cxc.creada','cuentaporcobrarcreada',
    'pago.proveedor.registrado','pagoproveedorregistrado',
    'ajuste.inventario.aplicado','ajusteinventarioaplicado',
    'planilla.liquidada','planillaliquidada','planilla.pagada','planillapagada',
    'liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido',
    'cts.depositado','depreciacion.generada','depreciaciongenerada',
    'cpe.anulado','cpeanulado','factura.emitida','facturaemitida'
  ]::text[])
$function$;

CREATE OR REPLACE FUNCTION public.crear_caja_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.crear_caja_tx_474(p_tenant_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_caja_tx(
  p_tenant_id uuid, p_caja_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.actualizar_caja_tx_474(p_tenant_id,p_caja_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.guardar_configuracion_caja_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.guardar_configuracion_caja_tx_474(p_tenant_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.obtener_opciones_contables_caja(
  p_tenant_id uuid, p_actor_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.opciones_contables_caja_474(p_tenant_id,p_actor_id)
$function$;

CREATE OR REPLACE FUNCTION public.registrar_auditoria_caja_tx(
  p_tenant_id uuid, p_event text, p_actor_id uuid, p_session_id uuid,
  p_metadata jsonb, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.registrar_auditoria_caja_tx_474(
    p_tenant_id,p_event,p_actor_id,p_session_id,p_metadata,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_manual_caja_tx(
  p_tenant_id uuid, p_session_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.registrar_movimiento_manual_caja_tx_474(
    p_tenant_id,p_session_id,p_payload,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.solicitar_retiro_caja_tx(
  p_tenant_id uuid, p_session_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.solicitar_retiro_caja_tx_474(
    p_tenant_id,p_session_id,p_payload,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.conciliar_retiro_caja_tx(
  p_tenant_id uuid, p_retiro_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.conciliar_retiro_caja_tx_474(
    p_tenant_id,p_retiro_id,p_payload,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.iniciar_cambio_turno_caja_tx(
  p_tenant_id uuid, p_session_id uuid, p_incoming_user_id uuid,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.iniciar_cambio_turno_caja_tx_474(
    p_tenant_id,p_session_id,p_incoming_user_id,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.completar_cambio_turno_caja_tx(
  p_tenant_id uuid, p_change_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.completar_cambio_turno_caja_tx_474(
    p_tenant_id,p_change_id,p_payload,p_actor_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_cambio_turno_caja_tx(
  p_tenant_id uuid, p_change_id uuid, p_reason text,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.cancelar_cambio_turno_caja_tx_474(
    p_tenant_id,p_change_id,p_reason,p_actor_id,p_idempotency_key
  )
$function$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.cajas, public.sesiones_caja, public.configuracion_caja,
  public.movimientos_caja, public.retiros_caja, public.cambios_turno,
  public.cortes_caja, public.autorizaciones_caja, public.caja_audit_log
FROM PUBLIC, anon, authenticated, service_role;

-- Cierra puentes legados e implementaciones app que quedaron ejecutables por
-- el default privilege histórico de la migración 303. Los wrappers públicos
-- atómicos siguen siendo la única entrada runtime; los SECURITY DEFINER pueden
-- invocar estos helpers como owner dentro de su propia transacción.
REVOKE ALL ON FUNCTION public.registrar_movimiento_caja(
  uuid,character varying,numeric,character varying,character varying,text,
  uuid,uuid,inet,jsonb
) FROM service_role;
REVOKE ALL ON FUNCTION app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.abrir_caja_tx_451(uuid,uuid,uuid,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.cerrar_caja_tx_451(uuid,uuid,uuid,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.append_cash_movement_452(public.sesiones_caja,uuid,numeric,text,text,text,text,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid) FROM service_role;
REVOKE ALL ON FUNCTION app.hydrate_demo_business_sample_tx(uuid,uuid) FROM service_role;

REVOKE ALL ON FUNCTION app.cash_fingerprint_474(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_actor_is_supervisor_474(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.assert_cash_permission_474(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_operation_existing_474(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_record_operation_474(uuid,text,text,text,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_local_currency_474(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_postable_account_474(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_account_10111_474(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_append_movement_474(uuid,uuid,text,numeric,uuid,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_denominations_total_474(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_audit_474(uuid,uuid,uuid,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_outbox_474(uuid,text,uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.crear_caja_tx_474(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.actualizar_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.guardar_configuracion_caja_tx_474(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.opciones_contables_caja_474(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.registrar_auditoria_caja_tx_474(uuid,text,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.registrar_movimiento_manual_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.solicitar_retiro_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.conciliar_retiro_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.iniciar_cambio_turno_caja_tx_474(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.completar_cambio_turno_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cancelar_cambio_turno_caja_tx_474(uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;

-- service_role sólo puede entrar por wrappers public. Los SECURITY DEFINER
-- internos y las anclas no son una API alternativa forjable.
REVOKE ALL ON FUNCTION app.cash_fingerprint_474(jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_actor_is_supervisor_474(uuid,uuid) FROM service_role;
REVOKE ALL ON FUNCTION app.assert_cash_permission_474(uuid,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_operation_existing_474(uuid,text,text,text) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_record_operation_474(uuid,text,text,text,uuid,uuid,uuid,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_local_currency_474(uuid) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_postable_account_474(uuid,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_account_10111_474(uuid) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_append_movement_474(uuid,uuid,text,numeric,uuid,text,text,text,uuid) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_denominations_total_474(jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_audit_474(uuid,uuid,uuid,text,jsonb,text,text) FROM service_role;
REVOKE ALL ON FUNCTION app.cash_outbox_474(uuid,text,uuid,text,uuid,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION app.crear_caja_tx_474(uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.actualizar_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.guardar_configuracion_caja_tx_474(uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.opciones_contables_caja_474(uuid,uuid) FROM service_role;
REVOKE ALL ON FUNCTION app.registrar_auditoria_caja_tx_474(uuid,text,uuid,uuid,jsonb,text) FROM service_role;
REVOKE ALL ON FUNCTION app.registrar_movimiento_manual_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.solicitar_retiro_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.conciliar_retiro_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.iniciar_cambio_turno_caja_tx_474(uuid,uuid,uuid,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.completar_cambio_turno_caja_tx_474(uuid,uuid,jsonb,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION app.cancelar_cambio_turno_caja_tx_474(uuid,uuid,text,uuid,text) FROM service_role;

REVOKE ALL ON FUNCTION public.crear_caja_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_caja_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_configuracion_caja_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_opciones_contables_caja(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_auditoria_caja_tx(uuid,text,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimiento_manual_caja_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conciliar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iniciar_cambio_turno_caja_tx(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.completar_cambio_turno_caja_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancelar_cambio_turno_caja_tx(uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_caja_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_caja_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_configuracion_caja_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_opciones_contables_caja(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria_caja_tx(uuid,text,uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_manual_caja_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.conciliar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.iniciar_cambio_turno_caja_tx(uuid,uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.completar_cambio_turno_caja_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_cambio_turno_caja_tx(uuid,uuid,text,uuid,text) TO service_role;

COMMENT ON FUNCTION public.solicitar_retiro_caja_tx(uuid,uuid,jsonb,uuid,text)
IS 'Retiro 474: valida destino contable antes de mutar caja; depósito usa banco 457 en el mismo commit.';
COMMENT ON FUNCTION public.completar_cambio_turno_caja_tx(uuid,uuid,jsonb,uuid,text)
IS 'Cambio 474: arqueo, diferencia, movimiento, handoff, auditoría y outbox en una sola transacción.';

COMMIT;
