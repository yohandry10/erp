-- ============================================================================
-- 465__fiscal_adjustments_advances_atomic.sql
-- Retenciones, percepciones, detracciones y anticipos de clientes/proveedores.
--
-- Garantias:
-- - actor y tenant explicitos; RPCs exclusivos de service_role;
-- - idempotencia semantica con huella y advisory locks;
-- - un anticipo nace de un movimiento bancario real y se consume una sola vez;
-- - los ajustes de CxC reutilizan el writer 452 y los de CxP emiten outbox;
-- - la detraccion de proveedor no mueve banco hasta su deposito posterior;
-- - factura de proveedor, ajustes iniciales y outbox se confirman juntos;
-- - un ajuste CxC se revierte explicitamente, sin simular caja/banco;
-- - QUINTA no se registra como una obligacion de proveedor.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

-- Los registros historicos se conservan, pero ningun alta/modificacion nueva
-- puede seguir modelando renta de quinta categoria como proveedor.
ALTER TABLE IF EXISTS public.libro_retenciones
  DROP CONSTRAINT IF EXISTS ck_libro_retenciones_no_quinta_proveedor_465;
ALTER TABLE IF EXISTS public.libro_retenciones
  ADD CONSTRAINT ck_libro_retenciones_no_quinta_proveedor_465
  CHECK (upper(coalesce(categoria_retencion, '')) <> 'QUINTA') NOT VALID;

CREATE TABLE IF NOT EXISTS public.anticipos_terceros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  origen text NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  monto_original numeric(14,2) NOT NULL,
  monto_aplicado numeric(14,2) NOT NULL DEFAULT 0,
  monto_disponible numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  fecha date NOT NULL,
  referencia text,
  cuenta_bancaria_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  movimiento_bancario_id uuid NOT NULL REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'DISPONIBLE',
  actor_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_anticipos_terceros_party_465 CHECK (
    (origen = 'CLIENTE' AND cliente_id IS NOT NULL AND proveedor_id IS NULL)
    OR (origen = 'PROVEEDOR' AND proveedor_id IS NOT NULL AND cliente_id IS NULL)
  ),
  CONSTRAINT ck_anticipos_terceros_amounts_465 CHECK (
    monto_original > 0 AND monto_aplicado >= 0 AND monto_disponible >= 0
    AND abs(monto_original - monto_aplicado - monto_disponible) <= 0.01
  ),
  CONSTRAINT ck_anticipos_terceros_currency_465 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_anticipos_terceros_state_465 CHECK (
    estado IN ('DISPONIBLE', 'PARCIAL', 'APLICADO', 'ANULADO')
  ),
  CONSTRAINT ck_anticipos_terceros_key_465 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 180
  ),
  CONSTRAINT ck_anticipos_terceros_fingerprint_465 CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS public.operaciones_fiscales_financieras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  origen text NOT NULL,
  tipo text NOT NULL,
  cxc_id uuid REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT,
  cxp_id uuid REFERENCES public.cuentas_por_pagar(id) ON DELETE RESTRICT,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  anticipo_id uuid REFERENCES public.anticipos_terceros(id) ON DELETE RESTRICT,
  base_calculo numeric(14,2),
  tasa numeric(9,6),
  monto numeric(14,2) NOT NULL,
  monto_contabilizado numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  tipo_cambio numeric(18,6) NOT NULL,
  fecha date NOT NULL,
  referencia text,
  notas text,
  estado text NOT NULL,
  cuenta_bancaria_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  source_event_id uuid,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_operaciones_fiscales_owner_465 CHECK (
    (origen = 'CLIENTE' AND cxc_id IS NOT NULL AND cxp_id IS NULL
      AND cliente_id IS NOT NULL AND proveedor_id IS NULL)
    OR (origen = 'PROVEEDOR' AND cxp_id IS NOT NULL AND cxc_id IS NULL
      AND proveedor_id IS NOT NULL AND cliente_id IS NULL)
  ),
  CONSTRAINT ck_operaciones_fiscales_type_465 CHECK (
    tipo IN ('RETENCION', 'PERCEPCION', 'DETRACCION', 'ANTICIPO')
  ),
  CONSTRAINT ck_operaciones_fiscales_advance_465 CHECK (
    (tipo = 'ANTICIPO' AND anticipo_id IS NOT NULL)
    OR (tipo <> 'ANTICIPO' AND anticipo_id IS NULL)
  ),
  CONSTRAINT ck_operaciones_fiscales_amount_465 CHECK (
    monto > 0 AND monto_contabilizado > 0 AND tipo_cambio > 0
    AND (base_calculo IS NULL OR base_calculo > 0)
    AND (tasa IS NULL OR tasa >= 0)
  ),
  CONSTRAINT ck_operaciones_fiscales_currency_465 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_operaciones_fiscales_state_465 CHECK (
    estado IN ('APLICADO', 'PENDIENTE_TESORERIA', 'ANULADO')
  ),
  CONSTRAINT ck_operaciones_fiscales_treasury_465 CHECK (
    (estado = 'PENDIENTE_TESORERIA' AND origen = 'PROVEEDOR'
      AND tipo = 'DETRACCION' AND cuenta_bancaria_id IS NULL
      AND movimiento_bancario_id IS NULL)
    OR estado <> 'PENDIENTE_TESORERIA'
  ),
  CONSTRAINT ck_operaciones_fiscales_key_465 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 220
  ),
  CONSTRAINT ck_operaciones_fiscales_fingerprint_465 CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS public.reversas_ajustes_fiscales_cxc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  operacion_id uuid NOT NULL REFERENCES public.operaciones_fiscales_financieras(id) ON DELETE RESTRICT,
  cxc_id uuid NOT NULL REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT,
  cxc_pago_id uuid NOT NULL REFERENCES public.cxc_pagos(id) ON DELETE RESTRICT,
  anticipo_id uuid REFERENCES public.anticipos_terceros(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  monto numeric(14,2) NOT NULL,
  monto_contabilizado numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  fecha date NOT NULL,
  motivo text NOT NULL,
  actor_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  event_id uuid NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_reversas_ajustes_fiscales_operation_465 UNIQUE (tenant_id, operacion_id),
  CONSTRAINT uq_reversas_ajustes_fiscales_event_465 UNIQUE (tenant_id, event_id),
  CONSTRAINT ck_reversas_ajustes_fiscales_type_465 CHECK (
    tipo IN ('RETENCION', 'PERCEPCION', 'DETRACCION', 'ANTICIPO')
  ),
  CONSTRAINT ck_reversas_ajustes_fiscales_amount_465 CHECK (
    monto > 0 AND monto_contabilizado > 0
  ),
  CONSTRAINT ck_reversas_ajustes_fiscales_currency_465 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_reversas_ajustes_fiscales_reason_465 CHECK (
    length(btrim(motivo)) BETWEEN 3 AND 500
  ),
  CONSTRAINT ck_reversas_ajustes_fiscales_key_465 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ck_reversas_ajustes_fiscales_fingerprint_465 CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_anticipos_terceros_tenant_key_465
  ON public.anticipos_terceros (tenant_id, lower(btrim(idempotency_key)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_anticipos_terceros_tenant_movement_465
  ON public.anticipos_terceros (tenant_id, movimiento_bancario_id);
CREATE INDEX IF NOT EXISTS idx_anticipos_terceros_available_465
  ON public.anticipos_terceros (tenant_id, origen, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_anticipos_terceros_customer_465
  ON public.anticipos_terceros (tenant_id, cliente_id, estado)
  WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anticipos_terceros_supplier_465
  ON public.anticipos_terceros (tenant_id, proveedor_id, estado)
  WHERE proveedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_fiscales_tenant_key_465
  ON public.operaciones_fiscales_financieras (tenant_id, lower(btrim(idempotency_key)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_fiscales_event_465
  ON public.operaciones_fiscales_financieras (tenant_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operaciones_fiscales_document_465
  ON public.operaciones_fiscales_financieras
    (tenant_id, origen, fecha DESC, cxc_id, cxp_id);
CREATE INDEX IF NOT EXISTS idx_operaciones_fiscales_pending_465
  ON public.operaciones_fiscales_financieras (tenant_id, estado, fecha, id)
  WHERE estado = 'PENDIENTE_TESORERIA';
CREATE UNIQUE INDEX IF NOT EXISTS ux_reversas_ajustes_fiscales_tenant_key_465
  ON public.reversas_ajustes_fiscales_cxc (tenant_id, lower(btrim(idempotency_key)));
CREATE INDEX IF NOT EXISTS idx_reversas_ajustes_fiscales_cxc_465
  ON public.reversas_ajustes_fiscales_cxc (tenant_id, cxc_id, created_at DESC);

ALTER TABLE public.anticipos_terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anticipos_terceros FORCE ROW LEVEL SECURITY;
ALTER TABLE public.operaciones_fiscales_financieras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operaciones_fiscales_financieras FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reversas_ajustes_fiscales_cxc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reversas_ajustes_fiscales_cxc FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anticipos_terceros_tenant_select_465 ON public.anticipos_terceros;
CREATE POLICY anticipos_terceros_tenant_select_465
  ON public.anticipos_terceros FOR SELECT TO authenticated
  USING (tenant_id = app.current_tenant_id());
DROP POLICY IF EXISTS operaciones_fiscales_tenant_select_465
  ON public.operaciones_fiscales_financieras;
CREATE POLICY operaciones_fiscales_tenant_select_465
  ON public.operaciones_fiscales_financieras FOR SELECT TO authenticated
  USING (tenant_id = app.current_tenant_id());
DROP POLICY IF EXISTS reversas_ajustes_fiscales_tenant_select_465
  ON public.reversas_ajustes_fiscales_cxc;
CREATE POLICY reversas_ajustes_fiscales_tenant_select_465
  ON public.reversas_ajustes_fiscales_cxc FOR SELECT TO authenticated
  USING (tenant_id = app.current_tenant_id());

REVOKE ALL ON TABLE public.anticipos_terceros FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operaciones_fiscales_financieras FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reversas_ajustes_fiscales_cxc FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.anticipos_terceros TO service_role;
GRANT SELECT ON TABLE public.operaciones_fiscales_financieras TO service_role;
GRANT SELECT ON TABLE public.reversas_ajustes_fiscales_cxc TO service_role;

-- La percepcion incrementa la obligacion por encima del subtotal+IGV. El
-- trigger historico truncaba ese importe a total y escondia la deuda real.
ALTER TABLE public.cuentas_por_pagar
  DROP CONSTRAINT IF EXISTS ck_cuentas_por_pagar_saldo_range;
ALTER TABLE public.cuentas_por_pagar
  ADD CONSTRAINT ck_cuentas_por_pagar_saldo_range CHECK (
    saldo >= 0 AND saldo_pendiente = saldo
    AND saldo <= greatest(
      round(total + coalesce(percepcion_total, 0)
        - coalesce(retencion_total, 0)
        - coalesce(detraccion_total, 0)
        - coalesce(anticipo_total, 0), 2),
      0
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION app.normalize_cuentas_por_pagar_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_estado text;
  v_obligacion numeric(14,2);
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(coalesce(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(coalesce(NEW.proveedor_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(coalesce(NEW.orden_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(coalesce(NEW.recepcion_id::text, ''));
  NEW.referencia_id := app.to_uuid_or_null(coalesce(NEW.referencia_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(coalesce(NEW.event_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(coalesce(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(coalesce(NEW.updated_by::text, ''));

  NEW.numero := upper(nullif(btrim(coalesce(NEW.numero::text, '')), ''));
  NEW.numero_documento := upper(nullif(btrim(coalesce(NEW.numero_documento::text, '')), ''));
  NEW.tipo_documento := upper(coalesce(nullif(btrim(coalesce(NEW.tipo_documento, '')), ''), 'FACTURA'));
  NEW.referencia_tipo := upper(nullif(btrim(coalesce(NEW.referencia_tipo, '')), ''));
  NEW.condiciones_pago := upper(coalesce(nullif(btrim(coalesce(NEW.condiciones_pago, '')), ''), 'CONTADO'));
  NEW.fecha_emision := coalesce(NEW.fecha_emision, current_date);
  NEW.fecha_vencimiento := coalesce(NEW.fecha_vencimiento, NEW.fecha_emision);
  NEW.ultimo_pago := CASE WHEN NEW.ultimo_pago IS NULL THEN NULL ELSE NEW.ultimo_pago::date END;
  NEW.anulado_at := CASE WHEN NEW.anulado_at IS NULL THEN NULL ELSE NEW.anulado_at::timestamptz END;
  NEW.moneda := upper(coalesce(nullif(btrim(coalesce(NEW.moneda, '')), ''), 'PEN'));
  NEW.dias_credito := greatest(coalesce(NEW.dias_credito, 0), 0);
  NEW.subtotal := greatest(coalesce(NEW.subtotal, 0), 0);
  NEW.igv := greatest(coalesce(NEW.igv, 0), 0);
  NEW.total := greatest(coalesce(NEW.total, NEW.subtotal + NEW.igv, 0), 0);
  NEW.retencion_total := greatest(coalesce(NEW.retencion_total, 0), 0);
  NEW.percepcion_total := greatest(coalesce(NEW.percepcion_total, 0), 0);
  NEW.detraccion_total := greatest(coalesce(NEW.detraccion_total, 0), 0);
  NEW.anticipo_total := greatest(coalesce(NEW.anticipo_total, 0), 0);
  v_obligacion := greatest(round(NEW.total + NEW.percepcion_total
    - NEW.retencion_total - NEW.detraccion_total - NEW.anticipo_total, 2), 0);
  NEW.saldo := greatest(coalesce(NEW.saldo, NEW.saldo_pendiente, v_obligacion), 0);
  NEW.saldo := least(NEW.saldo, v_obligacion);
  NEW.saldo_pendiente := NEW.saldo;

  IF NEW.recepcion_id IS NOT NULL AND NEW.referencia_id IS NULL THEN
    NEW.referencia_id := NEW.recepcion_id;
  END IF;
  IF NEW.referencia_id IS NOT NULL AND NEW.referencia_tipo IS NULL THEN
    NEW.referencia_tipo := 'REFERENCIA';
  END IF;
  IF NEW.referencia_tipo = 'RECEPCION' AND NEW.recepcion_id IS NULL AND NEW.referencia_id IS NOT NULL THEN
    NEW.recepcion_id := NEW.referencia_id;
  END IF;
  IF NEW.recepcion_id IS NOT NULL AND (NEW.referencia_tipo IS NULL OR NEW.referencia_tipo = 'REFERENCIA') THEN
    NEW.referencia_tipo := 'RECEPCION';
    NEW.referencia_id := NEW.recepcion_id;
  END IF;

  NEW.discrepancias := coalesce(NEW.discrepancias, '[]'::jsonb);
  IF jsonb_typeof(NEW.discrepancias) <> 'array' THEN NEW.discrepancias := '[]'::jsonb; END IF;
  NEW.estado_comparacion := upper(coalesce(nullif(btrim(coalesce(NEW.estado_comparacion, '')), ''), 'PENDIENTE'));
  IF NEW.estado_comparacion NOT IN ('PENDIENTE', 'OK', 'DESVIACION_CANTIDAD', 'DESVIACION_PRECIO') THEN
    NEW.estado_comparacion := 'PENDIENTE';
  END IF;

  v_estado := upper(coalesce(nullif(btrim(coalesce(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'ABIERTA') THEN v_estado := 'PENDIENTE';
  ELSIF v_estado = 'VENCIDO' THEN v_estado := 'VENCIDA';
  ELSIF v_estado = 'COBRADA' THEN v_estado := 'PAGADA';
  ELSIF v_estado = 'CANCELADA' THEN v_estado := 'ANULADA'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA') THEN
    v_estado := 'PENDIENTE';
  END IF;
  IF v_estado = 'ANULADA' OR NEW.anulado_at IS NOT NULL THEN v_estado := 'ANULADA';
  ELSIF NEW.saldo <= 0 THEN
    v_estado := 'PAGADA'; NEW.saldo := 0; NEW.saldo_pendiente := 0;
  ELSIF NEW.fecha_vencimiento < current_date THEN v_estado := 'VENCIDA';
  ELSIF NEW.saldo < v_obligacion THEN v_estado := 'PARCIAL';
  ELSE v_estado := 'PENDIENTE'; END IF;
  NEW.estado := v_estado;

  NEW.idempotency_key := coalesce(
    nullif(lower(btrim(coalesce(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('cxp.event:%s', NEW.event_id)
      WHEN NEW.referencia_id IS NOT NULL THEN format('cxp.ref:%s:%s:%s',
        coalesce(NEW.tenant_id::text, 'no-tenant'), coalesce(lower(NEW.referencia_tipo), 'ref'), NEW.referencia_id)
      WHEN NEW.proveedor_id IS NOT NULL AND NEW.numero_documento IS NOT NULL THEN format('cxp.doc:%s:%s:%s',
        coalesce(NEW.tenant_id::text, 'no-tenant'), NEW.proveedor_id, lower(NEW.numero_documento))
      ELSE format('cxp.row:%s:%s', coalesce(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );
  NEW.created_at := coalesce(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app.fiscal_fingerprint_465(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.assert_fiscal_actor_465(p_tenant_id uuid, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, false)
      AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'FISCAL_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.ensure_fiscal_account_465(
  p_tenant_id uuid, p_codigo text, p_nombre text, p_tipo text, p_nivel integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:FISCAL-ACCOUNT:%s', p_tenant_id, p_codigo), 465));
  SELECT id INTO v_id FROM public.plan_cuentas
  WHERE tenant_id = p_tenant_id AND codigo = p_codigo
  ORDER BY created_at, id LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.plan_cuentas (
      tenant_id, codigo, nombre, tipo, tipo_cuenta, nivel,
      acepta_movimiento, activo, estado, metadata
    ) VALUES (
      p_tenant_id, p_codigo, p_nombre, p_tipo, p_tipo, p_nivel,
      true, true, 'ACTIVO', jsonb_build_object('source', 'migration_465_fiscal_accounts')
    ) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

DO $seed$
DECLARE t record; c record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    FOR c IN SELECT * FROM (VALUES
      ('1042', 'Cuentas corrientes para fines especificos - detracciones', 'ACTIVO', 4),
      ('122', 'Anticipos de clientes', 'PASIVO', 3),
      ('40113', 'IGV - regimen de percepciones', 'PASIVO', 5),
      ('40114', 'IGV - regimen de retenciones', 'ACTIVO', 5),
      ('421', 'Facturas, boletas y comprobantes por pagar', 'PASIVO', 3),
      ('422', 'Anticipos a proveedores', 'ACTIVO', 3)
    ) AS x(codigo, nombre, tipo, nivel) LOOP
      PERFORM app.ensure_fiscal_account_465(t.id, c.codigo, c.nombre, c.tipo, c.nivel);
    END LOOP;
  END LOOP;
END;
$seed$;

CREATE OR REPLACE FUNCTION app.registrar_anticipo_tercero_tx_465(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_origin text := upper(btrim(coalesce(p_payload->>'origen', '')));
  v_customer_id uuid := nullif(p_payload->>'cliente_id', '')::uuid;
  v_supplier_id uuid := nullif(p_payload->>'proveedor_id', '')::uuid;
  v_bank_id uuid := nullif(p_payload->>'cuenta_bancaria_id', '')::uuid;
  v_amount numeric(14,2) := round(coalesce(nullif(p_payload->>'monto', '')::numeric, 0), 2);
  v_currency text := upper(btrim(coalesce(p_payload->>'moneda', '')));
  v_date date := nullif(p_payload->>'fecha', '')::date;
  v_reference text := nullif(btrim(coalesce(p_payload->>'referencia', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notas', '')), '');
  v_rate numeric(18,6) := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_canonical jsonb;
  v_fingerprint text;
  v_existing public.anticipos_terceros%ROWTYPE;
  v_counter_id uuid;
  v_bank_result jsonb;
  v_advance public.anticipos_terceros%ROWTYPE;
BEGIN
  PERFORM app.assert_fiscal_actor_465(p_tenant_id, p_actor_id);
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_origin NOT IN ('CLIENTE', 'PROVEEDOR') OR v_bank_id IS NULL
     OR v_amount <= 0 OR v_date IS NULL OR v_currency !~ '^[A-Z]{3}$'
     OR (v_origin = 'CLIENTE') IS DISTINCT FROM (v_customer_id IS NOT NULL AND v_supplier_id IS NULL)
     OR (v_origin = 'PROVEEDOR') IS DISTINCT FROM (v_supplier_id IS NOT NULL AND v_customer_id IS NULL)
     OR (v_reference IS NOT NULL AND length(v_reference) > 120)
     OR (v_notes IS NOT NULL AND length(v_notes) > 500) THEN
    RAISE EXCEPTION 'FISCAL_ADVANCE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_currency = app.treasury_local_currency_452(p_tenant_id) THEN
    IF v_rate IS NOT NULL AND round(v_rate, 6) <> 1 THEN
      RAISE EXCEPTION 'FISCAL_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'FISCAL_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE v_rate := round(v_rate, 6); END IF;

  v_canonical := jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_actor_id,
    'origen', v_origin, 'cliente_id', v_customer_id, 'proveedor_id', v_supplier_id,
    'cuenta_bancaria_id', v_bank_id, 'monto', v_amount, 'moneda', v_currency,
    'fecha', v_date, 'referencia', v_reference, 'notas', v_notes, 'tipo_cambio', v_rate
  );
  v_fingerprint := app.fiscal_fingerprint_465(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:FISCAL-ADVANCE:%s', p_tenant_id, v_key), 465));
  SELECT * INTO v_existing FROM public.anticipos_terceros a
  WHERE a.tenant_id = p_tenant_id AND lower(btrim(a.idempotency_key)) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_ADVANCE'
        USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = v_customer_id
      AND c.tenant_id = p_tenant_id AND coalesce(c.activo, true)
  ) THEN RAISE EXCEPTION 'FISCAL_CUSTOMER_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514'; END IF;
  IF v_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proveedores p WHERE p.id = v_supplier_id
      AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
  ) THEN RAISE EXCEPTION 'FISCAL_SUPPLIER_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514'; END IF;

  v_counter_id := CASE WHEN v_origin = 'CLIENTE'
    THEN app.ensure_fiscal_account_465(p_tenant_id, '122', 'Anticipos de clientes', 'PASIVO', 3)
    ELSE app.ensure_fiscal_account_465(p_tenant_id, '422', 'Anticipos a proveedores', 'ACTIVO', 3)
  END;
  v_bank_result := app.registrar_movimiento_bancario_tx_457(
    p_tenant_id,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_id, 'cuenta_contrapartida_id', v_counter_id,
      'tipo', CASE WHEN v_origin = 'CLIENTE' THEN 'ABONO' ELSE 'CARGO' END,
      'monto', v_amount, 'fecha', v_date,
      'descripcion', CASE WHEN v_origin = 'CLIENTE'
        THEN 'Anticipo recibido de cliente' ELSE 'Anticipo entregado a proveedor' END,
      'referencia', v_reference, 'metodo_pago', 'TRANSFERENCIA',
      'categoria', CASE WHEN v_origin = 'CLIENTE' THEN 'OTRO_INGRESO' ELSE 'OTRO_EGRESO' END,
      'moneda', v_currency, 'tipo_cambio', v_rate
    ),
    p_actor_id, v_key || ':bank'
  );
  INSERT INTO public.anticipos_terceros (
    tenant_id, origen, cliente_id, proveedor_id, monto_original, monto_aplicado,
    monto_disponible, moneda, fecha, referencia, cuenta_bancaria_id,
    movimiento_bancario_id, estado, actor_id, idempotency_key,
    request_fingerprint, metadata
  ) VALUES (
    p_tenant_id, v_origin, v_customer_id, v_supplier_id, v_amount, 0,
    v_amount, v_currency, v_date, v_reference, v_bank_id,
    (v_bank_result->>'movimiento_id')::uuid, 'DISPONIBLE', p_actor_id, v_key,
    v_fingerprint, jsonb_build_object(
      'tipo_cambio', v_rate, 'notas', v_notes,
      'operacion_bancaria_id', v_bank_result->>'operacion_id',
      'bank_event_id', v_bank_result->>'event_id'
    )
  ) RETURNING * INTO v_advance;
  RETURN to_jsonb(v_advance) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.registrar_ajuste_fiscal_financiero_tx_465(
  p_tenant_id uuid, p_cuenta_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_origin text := upper(btrim(coalesce(p_payload->>'origen', '')));
  v_type text := upper(btrim(coalesce(p_payload->>'tipo', '')));
  v_amount numeric(14,2) := round(coalesce(nullif(p_payload->>'monto', '')::numeric, 0), 2);
  v_base numeric(14,2) := nullif(p_payload->>'base_calculo', '')::numeric;
  v_tax_rate numeric(9,6) := nullif(p_payload->>'tasa', '')::numeric;
  v_currency text := upper(btrim(coalesce(p_payload->>'moneda', '')));
  v_date date := nullif(p_payload->>'fecha', '')::date;
  v_reference text := nullif(btrim(coalesce(p_payload->>'referencia', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notas', '')), '');
  v_advance_id uuid := nullif(p_payload->>'anticipo_id', '')::uuid;
  v_rate numeric(18,6) := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_local_amount numeric(14,2);
  v_canonical jsonb;
  v_fingerprint text;
  v_existing public.operaciones_fiscales_financieras%ROWTYPE;
  v_advance public.anticipos_terceros%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_cxp public.cuentas_por_pagar%ROWTYPE;
  v_customer_id uuid;
  v_supplier_id uuid;
  v_old_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_new_state text;
  v_retention numeric(14,2);
  v_perception numeric(14,2);
  v_detraction numeric(14,2);
  v_advance_total numeric(14,2);
  v_event_id uuid := gen_random_uuid();
  v_nested jsonb;
  v_operation public.operaciones_fiscales_financieras%ROWTYPE;
BEGIN
  PERFORM app.assert_fiscal_actor_465(p_tenant_id, p_actor_id);
  IF jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR p_cuenta_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_origin NOT IN ('CLIENTE', 'PROVEEDOR')
     OR v_type NOT IN ('RETENCION', 'PERCEPCION', 'DETRACCION', 'ANTICIPO')
     OR v_amount <= 0 OR v_date IS NULL OR v_currency !~ '^[A-Z]{3}$'
     OR (v_type = 'ANTICIPO') IS DISTINCT FROM (v_advance_id IS NOT NULL)
     OR (v_base IS NOT NULL AND v_base <= 0)
     OR (v_tax_rate IS NOT NULL AND v_tax_rate < 0)
     OR (v_base IS NOT NULL AND v_tax_rate IS NOT NULL
       AND abs(round(v_base * v_tax_rate / 100, 2) - v_amount) > 0.01)
     OR (v_reference IS NOT NULL AND length(v_reference) > 120)
     OR (v_notes IS NOT NULL AND length(v_notes) > 500) THEN
    RAISE EXCEPTION 'FISCAL_ADJUSTMENT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_currency = app.treasury_local_currency_452(p_tenant_id) THEN
    IF v_rate IS NOT NULL AND round(v_rate, 6) <> 1 THEN
      RAISE EXCEPTION 'FISCAL_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'FISCAL_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE v_rate := round(v_rate, 6); END IF;
  v_local_amount := round(v_amount * v_rate, 2);

  v_canonical := jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_actor_id,
    'cuenta_id', p_cuenta_id, 'origen', v_origin, 'tipo', v_type,
    'monto', v_amount, 'base_calculo', CASE WHEN v_base IS NULL THEN NULL ELSE round(v_base, 2) END,
    'tasa', CASE WHEN v_tax_rate IS NULL THEN NULL ELSE round(v_tax_rate, 6) END,
    'moneda', v_currency, 'tipo_cambio', v_rate, 'fecha', v_date,
    'referencia', v_reference, 'notas', v_notes, 'anticipo_id', v_advance_id
  );
  v_fingerprint := app.fiscal_fingerprint_465(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:FISCAL-ADJUSTMENT:%s', p_tenant_id, v_key), 465));
  SELECT * INTO v_existing FROM public.operaciones_fiscales_financieras o
  WHERE o.tenant_id = p_tenant_id AND lower(btrim(o.idempotency_key)) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_ADJUSTMENT'
        USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
  END IF;

  IF v_origin = 'CLIENTE' THEN
    SELECT * INTO v_cxc FROM public.cuentas_por_cobrar c
    WHERE c.tenant_id = p_tenant_id AND c.id = p_cuenta_id FOR UPDATE;
    IF NOT FOUND OR upper(v_cxc.estado::text) = 'ANULADA'
       OR (v_type <> 'PERCEPCION' AND upper(v_cxc.estado::text) IN ('PAGADA', 'CANCELADO')) THEN
      RAISE EXCEPTION 'FISCAL_CXC_NOT_FOUND_OR_NOT_ADJUSTABLE' USING ERRCODE = '23514';
    END IF;
    v_customer_id := v_cxc.cliente_id;
    v_old_balance := round(coalesce(v_cxc.monto_pendiente, v_cxc.saldo_pendiente, v_cxc.saldo, 0), 2);
    IF upper(coalesce(v_cxc.moneda, 'PEN')) <> v_currency THEN
      RAISE EXCEPTION 'FISCAL_ADJUSTMENT_CURRENCY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar c
    WHERE c.tenant_id = p_tenant_id AND c.id = p_cuenta_id FOR UPDATE;
    IF NOT FOUND OR upper(v_cxp.estado::text) = 'ANULADA'
       OR (v_type <> 'PERCEPCION' AND upper(v_cxp.estado::text) = 'PAGADA') THEN
      RAISE EXCEPTION 'FISCAL_CXP_NOT_FOUND_OR_NOT_ADJUSTABLE' USING ERRCODE = '23514';
    END IF;
    v_supplier_id := v_cxp.proveedor_id;
    v_old_balance := round(coalesce(v_cxp.saldo, v_cxp.saldo_pendiente, 0), 2);
    IF upper(coalesce(v_cxp.moneda, 'PEN')) <> v_currency THEN
      RAISE EXCEPTION 'FISCAL_ADJUSTMENT_CURRENCY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_type <> 'PERCEPCION' AND v_amount - v_old_balance > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_ADJUSTMENT_EXCEEDS_OUTSTANDING_BALANCE' USING ERRCODE = '23514';
  END IF;

  IF v_advance_id IS NOT NULL THEN
    SELECT * INTO v_advance FROM public.anticipos_terceros a
    WHERE a.tenant_id = p_tenant_id AND a.id = v_advance_id FOR UPDATE;
    IF NOT FOUND OR v_advance.origen <> v_origin OR v_advance.moneda <> v_currency
       OR (v_origin = 'CLIENTE' AND v_advance.cliente_id IS DISTINCT FROM v_customer_id)
       OR (v_origin = 'PROVEEDOR' AND v_advance.proveedor_id IS DISTINCT FROM v_supplier_id)
       OR v_advance.estado NOT IN ('DISPONIBLE', 'PARCIAL')
       OR v_advance.monto_disponible + 0.01 < v_amount THEN
      RAISE EXCEPTION 'FISCAL_ADVANCE_NOT_AVAILABLE_FOR_DOCUMENT' USING ERRCODE = '23514';
    END IF;
    UPDATE public.anticipos_terceros
    SET monto_aplicado = round(monto_aplicado + v_amount, 2),
        monto_disponible = round(monto_disponible - v_amount, 2),
        estado = CASE WHEN monto_disponible - v_amount <= 0.009 THEN 'APLICADO' ELSE 'PARCIAL' END,
        metadata = metadata || jsonb_build_object('ultima_aplicacion_key', v_key),
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_advance_id;
  END IF;

  IF v_origin = 'CLIENTE' THEN
    v_nested := public.registrar_cxc_pago_tx(
      p_tenant_id, p_cuenta_id,
      jsonb_build_object(
        'monto', v_amount, 'fecha_pago', v_date, 'tipo', v_type,
        'metodo_pago', v_type, 'referencia', v_reference, 'notas', v_notes,
        'moneda', v_currency, 'idempotency_key', v_key || ':cxc',
        'event_id', v_event_id,
        'aplica_retencion', v_type = 'RETENCION',
        'retencion_monto', CASE WHEN v_type = 'RETENCION' THEN v_amount ELSE NULL END
      ), p_actor_id
    );
    v_event_id := coalesce(nullif(v_nested->>'event_id', '')::uuid, v_event_id);
    v_new_balance := round(coalesce((v_nested->>'saldo_nuevo')::numeric,
      (v_nested->'cuenta'->>'saldo')::numeric, 0), 2);
    v_new_state := coalesce(v_nested->>'estado_nuevo', v_nested->'cuenta'->>'estado');
  ELSE
    v_retention := round(coalesce(v_cxp.retencion_total, 0)
      + CASE WHEN v_type = 'RETENCION' THEN v_amount ELSE 0 END, 2);
    v_perception := round(coalesce(v_cxp.percepcion_total, 0)
      + CASE WHEN v_type = 'PERCEPCION' THEN v_amount ELSE 0 END, 2);
    v_detraction := round(coalesce(v_cxp.detraccion_total, 0)
      + CASE WHEN v_type = 'DETRACCION' THEN v_amount ELSE 0 END, 2);
    v_advance_total := round(coalesce(v_cxp.anticipo_total, 0)
      + CASE WHEN v_type = 'ANTICIPO' THEN v_amount ELSE 0 END, 2);
    v_new_balance := CASE WHEN v_type = 'PERCEPCION'
      THEN round(v_old_balance + v_amount, 2)
      ELSE round(v_old_balance - v_amount, 2) END;
    UPDATE public.cuentas_por_pagar
    SET saldo = v_new_balance, saldo_pendiente = v_new_balance,
        retencion_total = v_retention, percepcion_total = v_perception,
        detraccion_total = v_detraction, anticipo_total = v_advance_total,
        updated_by = p_actor_id, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = p_cuenta_id
    RETURNING estado, saldo INTO v_new_state, v_new_balance;

    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'cxp_ajuste', p_cuenta_id::text, 'cxp.ajuste.registrado',
      jsonb_build_object(
        'tenantId', p_tenant_id, 'tenant_id', p_tenant_id,
        'eventId', v_event_id, 'event_id', v_event_id,
        'cxpId', p_cuenta_id, 'cxp_id', p_cuenta_id,
        'proveedorId', v_supplier_id, 'proveedor_id', v_supplier_id,
        'tipoMovimiento', v_type, 'tipo_movimiento', v_type,
        'monto', v_amount, 'montoContabilizado', v_local_amount,
        'moneda', v_currency, 'tipoCambio', v_rate, 'fecha', v_date,
        'referencia', coalesce(v_reference, v_cxp.numero_documento),
        'notas', v_notes, 'saldoAnterior', v_old_balance,
        'saldoNuevo', v_new_balance, 'estadoNuevo', v_new_state,
        'actorId', p_actor_id, 'anticipoId', v_advance_id,
        'requestFingerprint', v_fingerprint,
        'accountingHandledByOutbox', true
      ),
      'pending', 0, v_key, v_event_id, clock_timestamp()
    );
  END IF;

  INSERT INTO public.operaciones_fiscales_financieras (
    tenant_id, origen, tipo, cxc_id, cxp_id, cliente_id, proveedor_id,
    anticipo_id, base_calculo, tasa, monto, monto_contabilizado, moneda,
    tipo_cambio, fecha, referencia, notas, estado, actor_id, source_event_id,
    idempotency_key, request_fingerprint, metadata
  ) VALUES (
    p_tenant_id, v_origin, v_type,
    CASE WHEN v_origin = 'CLIENTE' THEN p_cuenta_id END,
    CASE WHEN v_origin = 'PROVEEDOR' THEN p_cuenta_id END,
    v_customer_id, v_supplier_id, v_advance_id,
    CASE WHEN v_base IS NULL THEN NULL ELSE round(v_base, 2) END,
    CASE WHEN v_tax_rate IS NULL THEN NULL ELSE round(v_tax_rate, 6) END,
    v_amount, v_local_amount, v_currency, v_rate, v_date, v_reference, v_notes,
    CASE WHEN v_origin = 'PROVEEDOR' AND v_type = 'DETRACCION'
      THEN 'PENDIENTE_TESORERIA' ELSE 'APLICADO' END,
    p_actor_id, v_event_id, v_key, v_fingerprint,
    jsonb_build_object(
      'saldo_anterior', v_old_balance, 'saldo_nuevo', v_new_balance,
      'estado_documento', v_new_state, 'writer', '465',
      'cxc_pago_id', CASE WHEN v_origin = 'CLIENTE'
        THEN nullif(v_nested->'pago'->>'id', '')::uuid ELSE NULL END
    )
  ) RETURNING * INTO v_operation;
  RETURN to_jsonb(v_operation) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.revertir_ajuste_fiscal_cxc_tx_465(
  p_tenant_id uuid, p_operacion_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_reason text := nullif(btrim(coalesce(p_payload->>'motivo', '')), '');
  v_operation public.operaciones_fiscales_financieras%ROWTYPE;
  v_existing public.reversas_ajustes_fiscales_cxc%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_payment public.cxc_pagos%ROWTYPE;
  v_advance public.anticipos_terceros%ROWTYPE;
  v_payment_count integer;
  v_payment_id uuid;
  v_pending_before numeric(14,2);
  v_pending_after numeric(14,2);
  v_total_before numeric(14,2);
  v_total_after numeric(14,2);
  v_retention_after numeric(14,2);
  v_perception_after numeric(14,2);
  v_detraction_after numeric(14,2);
  v_advance_after numeric(14,2);
  v_state_after text;
  v_date date := app.hoy_tenant(p_tenant_id);
  v_event_id uuid := gen_random_uuid();
  v_reversal_id uuid := gen_random_uuid();
  v_canonical jsonb;
  v_fingerprint text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_fiscal_actor_465(p_tenant_id, p_actor_id);
  IF p_operacion_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:FISCAL-CXC-REVERSAL-KEY:%s', p_tenant_id, v_key), 465
  ));

  SELECT * INTO v_operation
  FROM public.operaciones_fiscales_financieras o
  WHERE o.tenant_id = p_tenant_id AND o.id = p_operacion_id
  FOR UPDATE;
  IF NOT FOUND OR v_operation.origen <> 'CLIENTE'
     OR v_operation.cxc_id IS NULL
     OR v_operation.tipo NOT IN ('RETENCION', 'PERCEPCION', 'DETRACCION', 'ANTICIPO') THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_OPERATION_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_actor_id,
    'operacion_id', v_operation.id, 'cxc_id', v_operation.cxc_id,
    'tipo', v_operation.tipo, 'monto', v_operation.monto,
    'monto_contabilizado', v_operation.monto_contabilizado,
    'moneda', v_operation.moneda, 'motivo', v_reason
  );
  v_fingerprint := app.fiscal_fingerprint_465(v_canonical);

  SELECT * INTO v_existing
  FROM public.reversas_ajustes_fiscales_cxc r
  WHERE r.tenant_id = p_tenant_id
    AND lower(btrim(r.idempotency_key)) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operacion_id IS DISTINCT FROM p_operacion_id
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_existing
  FROM public.reversas_ajustes_fiscales_cxc r
  WHERE r.tenant_id = p_tenant_id AND r.operacion_id = p_operacion_id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_ALREADY_REVERSED'
      USING ERRCODE = '23505';
  END IF;
  IF v_operation.estado <> 'APLICADO' THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_NOT_ACTIVE'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cxc
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id = p_tenant_id AND c.id = v_operation.cxc_id
  FOR UPDATE;
  IF NOT FOUND OR v_cxc.cliente_id IS DISTINCT FROM v_operation.cliente_id
     OR upper(coalesce(v_cxc.estado::text, '')) = 'ANULADA' THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_CXC_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), (array_agg(p.id ORDER BY p.created_at, p.id))[1]
  INTO v_payment_count, v_payment_id
  FROM public.cxc_pagos p
  WHERE p.tenant_id = p_tenant_id
    AND p.cuenta_id = v_operation.cxc_id
    AND (
      p.id = app.to_uuid_or_null(coalesce(v_operation.metadata->>'cxc_pago_id', ''))
      OR (v_operation.source_event_id IS NOT NULL
        AND p.event_id = v_operation.source_event_id)
      OR lower(btrim(coalesce(p.idempotency_key, ''))) =
        lower(btrim(v_operation.idempotency_key)) || ':cxc'
    );
  IF v_payment_count <> 1 THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_EXPECTED_ONE_SOURCE: found=%',
      v_payment_count USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_payment
  FROM public.cxc_pagos p
  WHERE p.tenant_id = p_tenant_id AND p.id = v_payment_id
  FOR UPDATE;
  IF upper(coalesce(v_payment.tipo, '')) <> v_operation.tipo
     OR abs(round(coalesce(v_payment.monto, 0), 2) - v_operation.monto) > 0.01
     OR upper(coalesce(v_payment.moneda, v_operation.moneda)) <> v_operation.moneda
     OR NOT coalesce(v_payment.activo, true)
     OR upper(coalesce(v_payment.estado, 'ACTIVO')) <> 'ACTIVO' THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_SOURCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.ensure_accounting_period_open_458(p_tenant_id, v_date);

  v_pending_before := round(coalesce(
    v_cxc.monto_pendiente, v_cxc.saldo_pendiente, v_cxc.saldo, 0
  ), 2);
  v_total_before := round(coalesce(v_cxc.monto_total, v_cxc.total, 0), 2);
  v_total_after := CASE WHEN v_operation.tipo = 'PERCEPCION'
    THEN round(v_total_before - v_operation.monto, 2)
    ELSE v_total_before END;
  v_pending_after := CASE WHEN v_operation.tipo = 'PERCEPCION'
    THEN round(v_pending_before - v_operation.monto, 2)
    ELSE round(v_pending_before + v_operation.monto, 2) END;
  v_retention_after := round(coalesce(v_cxc.retencion_total, 0)
    - CASE WHEN v_operation.tipo = 'RETENCION' THEN v_operation.monto ELSE 0 END, 2);
  v_perception_after := round(coalesce(v_cxc.percepcion_total, 0)
    - CASE WHEN v_operation.tipo = 'PERCEPCION' THEN v_operation.monto ELSE 0 END, 2);
  v_detraction_after := round(coalesce(v_cxc.detraccion_total, 0)
    - CASE WHEN v_operation.tipo = 'DETRACCION' THEN v_operation.monto ELSE 0 END, 2);
  v_advance_after := round(coalesce(v_cxc.anticipo_total, 0)
    - CASE WHEN v_operation.tipo = 'ANTICIPO' THEN v_operation.monto ELSE 0 END, 2);

  IF v_total_after < -0.01 OR v_pending_after < -0.01
     OR v_pending_after - v_total_after > 0.01
     OR least(v_retention_after, v_perception_after, v_detraction_after, v_advance_after) < -0.01 THEN
    RAISE EXCEPTION 'FISCAL_CXC_ADJUSTMENT_REVERSAL_BALANCE_CONFLICT'
      USING ERRCODE = '23514';
  END IF;
  v_total_after := greatest(v_total_after, 0);
  v_pending_after := greatest(v_pending_after, 0);
  v_retention_after := greatest(v_retention_after, 0);
  v_perception_after := greatest(v_perception_after, 0);
  v_detraction_after := greatest(v_detraction_after, 0);
  v_advance_after := greatest(v_advance_after, 0);
  v_state_after := CASE
    WHEN v_pending_after <= 0.009 THEN 'CANCELADO'
    WHEN v_pending_after >= v_total_after - 0.009 THEN 'PENDIENTE'
    ELSE 'PARCIAL'
  END;

  IF v_operation.tipo = 'ANTICIPO' THEN
    SELECT * INTO v_advance
    FROM public.anticipos_terceros a
    WHERE a.tenant_id = p_tenant_id AND a.id = v_operation.anticipo_id
    FOR UPDATE;
    IF NOT FOUND OR v_advance.origen <> 'CLIENTE'
       OR v_advance.cliente_id IS DISTINCT FROM v_operation.cliente_id
       OR v_advance.moneda <> v_operation.moneda
       OR v_advance.estado = 'ANULADO'
       OR v_advance.monto_aplicado + 0.01 < v_operation.monto
       OR v_advance.monto_disponible + v_operation.monto
          - v_advance.monto_original > 0.01 THEN
      RAISE EXCEPTION 'FISCAL_CXC_ADVANCE_REVERSAL_CONFLICT'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.anticipos_terceros
    SET monto_aplicado = round(monto_aplicado - v_operation.monto, 2),
        monto_disponible = round(monto_disponible + v_operation.monto, 2),
        estado = CASE WHEN monto_aplicado - v_operation.monto <= 0.009
          THEN 'DISPONIBLE' ELSE 'PARCIAL' END,
        metadata = metadata || jsonb_build_object(
          'ultima_reversa_operacion_id', v_reversal_id,
          'ultima_reversa_key', v_key
        ),
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_operation.anticipo_id;
  END IF;

  UPDATE public.cxc_pagos
  SET estado = 'INACTIVO', activo = false,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'reversa_ajuste_id', v_reversal_id,
        'reversa_ajuste_event_id', v_event_id,
        'reversa_ajuste_key', v_key,
        'revertido_por', p_actor_id,
        'revertido_en', clock_timestamp(),
        'schema_version_reversa', 465
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_payment.id;

  UPDATE public.cuentas_por_cobrar
  SET monto_total = v_total_after, total = v_total_after,
      monto_pendiente = v_pending_after, saldo_pendiente = v_pending_after,
      saldo = v_pending_after, estado = v_state_after,
      dias_mora = CASE WHEN v_pending_after > 0
        THEN greatest(v_date - coalesce(fecha_vencimiento, v_date), 0) ELSE 0 END,
      retencion_total = v_retention_after,
      percepcion_total = v_perception_after,
      detraccion_total = v_detraction_after,
      anticipo_total = v_advance_after,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_fiscal_adjustment_reversal_id', v_reversal_id,
        'last_fiscal_adjustment_reversal_key', v_key,
        'schema_version_fiscal_reversal', 465
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_cxc.id
  RETURNING * INTO v_cxc;

  UPDATE public.operaciones_fiscales_financieras
  SET estado = 'ANULADO',
      metadata = metadata || jsonb_build_object(
        'reversa_id', v_reversal_id, 'reversa_event_id', v_event_id,
        'reversa_key', v_key, 'reversa_motivo', v_reason,
        'revertido_por', p_actor_id, 'revertido_en', clock_timestamp()
      ),
      updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = v_operation.id;

  v_result := jsonb_build_object(
    'success', true, 'idempotent', false,
    'reversa_id', v_reversal_id, 'operacion_id', v_operation.id,
    'cxc_pago_id', v_payment.id, 'cxc_id', v_cxc.id,
    'tipo', v_operation.tipo, 'monto', v_operation.monto,
    'saldo_anterior', v_pending_before, 'saldo_restaurado', v_pending_after,
    'estado_operacion', 'ANULADO', 'estado_cxc', v_state_after,
    'event_id', v_event_id
  );

  INSERT INTO public.reversas_ajustes_fiscales_cxc (
    id, tenant_id, operacion_id, cxc_id, cxc_pago_id, anticipo_id,
    tipo, monto, monto_contabilizado, moneda, fecha, motivo, actor_id,
    idempotency_key, request_fingerprint, event_id, resultado
  ) VALUES (
    v_reversal_id, p_tenant_id, v_operation.id, v_cxc.id, v_payment.id,
    v_operation.anticipo_id, v_operation.tipo, v_operation.monto,
    v_operation.monto_contabilizado, v_operation.moneda, v_date, v_reason,
    p_actor_id, v_key, v_fingerprint, v_event_id, v_result
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'cxc_ajuste', v_operation.id::text, 'cxc.ajuste.revertido',
    jsonb_build_object(
      'tenantId', p_tenant_id, 'tenant_id', p_tenant_id,
      'eventId', v_event_id, 'event_id', v_event_id,
      'idempotencyKey', v_key, 'idempotency_key', v_key,
      'requestFingerprint', v_fingerprint,
      'reversaId', v_reversal_id, 'reversa_id', v_reversal_id,
      'operacionId', v_operation.id, 'operacion_id', v_operation.id,
      'cxcPagoId', v_payment.id, 'cxc_pago_id', v_payment.id,
      'cxcId', v_cxc.id, 'cxc_id', v_cxc.id,
      'clienteId', v_cxc.cliente_id, 'cliente_id', v_cxc.cliente_id,
      'tipoMovimiento', v_operation.tipo, 'tipo_movimiento', v_operation.tipo,
      'monto', v_operation.monto,
      'montoContabilizado', v_operation.monto_contabilizado,
      'moneda', v_operation.moneda, 'fecha', v_date,
      'referencia', coalesce(v_operation.referencia, v_cxc.numero_documento),
      'motivo', v_reason, 'actorId', p_actor_id,
      'eventoOriginalId', v_operation.source_event_id,
      'saldoAnterior', v_pending_before, 'saldoRestaurado', v_pending_after,
      'accountingHandledByOutbox', true,
      'source', 'public.revertir_ajuste_fiscal_cxc_tx'
    ),
    'pending', 0, v_key, v_event_id, clock_timestamp()
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.depositar_detraccion_proveedor_tx_465(
  p_tenant_id uuid, p_operacion_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_bank_id uuid := nullif(p_payload->>'cuenta_bancaria_id', '')::uuid;
  v_date date := nullif(p_payload->>'fecha', '')::date;
  v_reference text := nullif(btrim(coalesce(p_payload->>'referencia', '')), '');
  v_rate numeric(18,6) := nullif(p_payload->>'tipo_cambio', '')::numeric;
  v_operation public.operaciones_fiscales_financieras%ROWTYPE;
  v_canonical jsonb;
  v_fingerprint text;
  v_counter_id uuid;
  v_bank_result jsonb;
BEGIN
  PERFORM app.assert_fiscal_actor_465(p_tenant_id, p_actor_id);
  IF p_operacion_id IS NULL OR v_bank_id IS NULL OR v_date IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR (v_reference IS NOT NULL AND length(v_reference) > 120) THEN
    RAISE EXCEPTION 'FISCAL_DETRACTION_DEPOSIT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:FISCAL-DEPOSIT:%s', p_tenant_id, p_operacion_id), 465));
  SELECT * INTO v_operation FROM public.operaciones_fiscales_financieras o
  WHERE o.tenant_id = p_tenant_id AND o.id = p_operacion_id FOR UPDATE;
  IF NOT FOUND OR v_operation.origen <> 'PROVEEDOR' OR v_operation.tipo <> 'DETRACCION'
     OR v_operation.estado = 'ANULADO' THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_DETRACTION_NOT_DEPOSITABLE' USING ERRCODE = '23514';
  END IF;
  IF v_operation.moneda = app.treasury_local_currency_452(p_tenant_id) THEN
    IF v_rate IS NOT NULL AND round(v_rate, 6) <> 1 THEN
      RAISE EXCEPTION 'FISCAL_LOCAL_CURRENCY_RATE_MUST_BE_ONE' USING ERRCODE = '23514';
    END IF;
    v_rate := 1;
  ELSIF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'FISCAL_FOREIGN_CURRENCY_RATE_REQUIRED' USING ERRCODE = '23514';
  ELSE v_rate := round(v_rate, 6); END IF;
  v_canonical := jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_actor_id,
    'operacion_id', p_operacion_id, 'cuenta_bancaria_id', v_bank_id,
    'monto', v_operation.monto, 'moneda', v_operation.moneda,
    'fecha', v_date, 'referencia', v_reference, 'tipo_cambio', v_rate
  );
  v_fingerprint := app.fiscal_fingerprint_465(v_canonical);
  IF v_operation.estado = 'APLICADO' THEN
    IF v_operation.metadata->>'deposit_idempotency_key' <> v_key
       OR v_operation.metadata->>'deposit_fingerprint' <> v_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_DETRACTION_ALREADY_DEPOSITED_WITH_DIFFERENT_REQUEST'
        USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_operation) || jsonb_build_object('idempotent', true);
  END IF;
  v_counter_id := app.ensure_fiscal_account_465(
    p_tenant_id, '421', 'Facturas, boletas y comprobantes por pagar', 'PASIVO', 3
  );
  v_bank_result := app.registrar_movimiento_bancario_tx_457(
    p_tenant_id,
    jsonb_build_object(
      'cuenta_bancaria_id', v_bank_id, 'cuenta_contrapartida_id', v_counter_id,
      'tipo', 'CARGO', 'monto', v_operation.monto, 'fecha', v_date,
      'descripcion', 'Deposito de detraccion de proveedor',
      'referencia', coalesce(v_reference, v_operation.referencia),
      'metodo_pago', 'TRANSFERENCIA', 'categoria', 'IMPUESTO_BANCARIO',
      'moneda', v_operation.moneda, 'tipo_cambio', v_rate
    ), p_actor_id, v_key || ':bank'
  );
  UPDATE public.operaciones_fiscales_financieras
  SET estado = 'APLICADO', cuenta_bancaria_id = v_bank_id,
      movimiento_bancario_id = (v_bank_result->>'movimiento_id')::uuid,
      metadata = metadata || jsonb_build_object(
        'deposit_idempotency_key', v_key, 'deposit_fingerprint', v_fingerprint,
        'deposit_actor_id', p_actor_id, 'deposit_date', v_date,
        'bank_operation_id', v_bank_result->>'operacion_id',
        'bank_event_id', v_bank_result->>'event_id'
      ), updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_operacion_id
  RETURNING * INTO v_operation;
  RETURN to_jsonb(v_operation) || jsonb_build_object('idempotent', false);
END;
$function$;

-- Reemplaza el writer 430 conservando la firma publica usada por CxpService.
CREATE OR REPLACE FUNCTION app.crear_factura_proveedor_tx(
  p_tenant_id uuid, p_cxp jsonb, p_event_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_numero text := upper(btrim(coalesce(p_cxp->>'numero_documento', '')));
  v_supplier_id uuid := nullif(p_cxp->>'proveedor_id', '')::uuid;
  v_order_id uuid := nullif(p_cxp->>'orden_id', '')::uuid;
  v_receipt_id uuid := nullif(p_cxp->>'recepcion_id', '')::uuid;
  v_actor_id uuid := nullif(p_cxp->>'created_by', '')::uuid;
  v_advance_id uuid := coalesce(
    nullif(p_cxp->>'anticipo_id', '')::uuid,
    nullif(p_cxp->'fiscal_metadata'->>'anticipo_id', '')::uuid
  );
  v_type text := upper(btrim(coalesce(p_cxp->>'tipo_documento', 'FACTURA')));
  v_currency text := upper(btrim(coalesce(p_cxp->>'moneda', 'PEN')));
  v_fiscal jsonb := coalesce(p_cxp->'fiscal_metadata', '{}'::jsonb);
  v_subtotal numeric(14,2) := round(coalesce((p_cxp->>'subtotal')::numeric, 0), 2);
  v_igv numeric(14,2) := round(coalesce((p_cxp->>'igv')::numeric, 0), 2);
  v_total numeric(14,2) := round(coalesce((p_cxp->>'total')::numeric, 0), 2);
  v_retention numeric(14,2) := round(coalesce((p_cxp->>'retencion_total')::numeric, 0), 2);
  v_perception numeric(14,2) := round(coalesce((p_cxp->>'percepcion_total')::numeric, 0), 2);
  v_detraction numeric(14,2) := round(coalesce((p_cxp->>'detraccion_total')::numeric, 0), 2);
  v_advance_amount numeric(14,2) := round(coalesce((p_cxp->>'anticipo_total')::numeric, 0), 2);
  v_balance numeric(14,2) := round(coalesce((p_cxp->>'saldo')::numeric, 0), 2);
  v_expected_balance numeric(14,2);
  v_rate numeric(18,6) := coalesce(nullif(v_fiscal->>'tipo_cambio', '')::numeric, 1);
  v_fingerprint text;
  v_existing public.cuentas_por_pagar%ROWTYPE;
  v_cxp public.cuentas_por_pagar%ROWTYPE;
  v_advance public.anticipos_terceros%ROWTYPE;
  v_adjust record;
BEGIN
  PERFORM app.assert_fiscal_actor_465(p_tenant_id, v_actor_id);
  IF p_event_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_supplier_id IS NULL OR v_numero = ''
     OR v_type NOT IN ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'RECIBO_HONORARIOS')
     OR v_currency !~ '^[A-Z]{3}$'
     OR v_retention < 0 OR v_perception < 0
     OR v_detraction < 0 OR v_advance_amount < 0 THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_PAYLOAD_INVALID_465' USING ERRCODE = '22023';
  END IF;
  IF v_currency <> 'PEN' AND v_rate <= 0 THEN
    RAISE EXCEPTION 'Tipo de cambio obligatorio para moneda extranjera' USING ERRCODE = '23514';
  ELSIF v_currency = 'PEN' THEN v_rate := 1; END IF;
  IF v_type = 'NOTA_CREDITO' AND (
    nullif(v_fiscal->>'documento_referencia_tipo', '') IS NULL
    OR nullif(v_fiscal->>'documento_referencia_serie', '') IS NULL
    OR nullif(v_fiscal->>'documento_referencia_numero', '') IS NULL
    OR nullif(v_fiscal->>'documento_referencia_fecha', '') IS NULL
  ) THEN RAISE EXCEPTION 'Nota de credito sin comprobante modificado completo' USING ERRCODE = '23514'; END IF;
  v_expected_balance := round(v_total - v_retention - v_detraction - v_advance_amount + v_perception, 2);
  IF v_total <= 0 OR abs(v_total - round(v_subtotal + v_igv, 2)) > 0.01
     OR v_expected_balance < 0 OR abs(v_balance - v_expected_balance) > 0.01
     OR (v_advance_amount > 0) IS DISTINCT FROM (v_advance_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_AMOUNTS_OR_ADVANCE_INVALID_465' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := app.fiscal_fingerprint_465(jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', v_actor_id,
    'proveedor_id', v_supplier_id, 'numero_documento', v_numero,
    'orden_id', v_order_id, 'recepcion_id', v_receipt_id,
    'tipo_documento', v_type, 'moneda', v_currency, 'tipo_cambio', round(v_rate, 6),
    'subtotal', v_subtotal, 'igv', v_igv, 'total', v_total, 'saldo', v_balance,
    'retencion', v_retention, 'percepcion', v_perception,
    'detraccion', v_detraction, 'anticipo', v_advance_amount, 'anticipo_id', v_advance_id
  ));
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:SUPPLIER-INVOICE:%s', p_tenant_id, v_key), 465));
  SELECT * INTO v_existing FROM public.cuentas_por_pagar c
  WHERE c.tenant_id = p_tenant_id AND lower(btrim(c.idempotency_key)) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.proveedor_id IS DISTINCT FROM v_supplier_id
       OR upper(v_existing.numero_documento) <> v_numero
       OR abs(v_existing.subtotal - v_subtotal) > 0.01
       OR abs(v_existing.igv - v_igv) > 0.01 OR abs(v_existing.total - v_total) > 0.01
       OR abs(v_existing.retencion_total - v_retention) > 0.01
       OR abs(v_existing.percepcion_total - v_perception) > 0.01
       OR abs(v_existing.detraccion_total - v_detraction) > 0.01
       OR abs(v_existing.anticipo_total - v_advance_amount) > 0.01
       OR nullif(v_existing.fiscal_metadata->>'request_fingerprint', '') IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'SUPPLIER_INVOICE_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores p WHERE p.id = v_supplier_id
    AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)) THEN
    RAISE EXCEPTION 'Proveedor no pertenece al tenant o esta inactivo' USING ERRCODE = '23514';
  END IF;
  IF v_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ordenes_compra o
    WHERE o.id = v_order_id AND o.tenant_id = p_tenant_id AND o.proveedor_id = v_supplier_id) THEN
    RAISE EXCEPTION 'Orden no pertenece al tenant o proveedor' USING ERRCODE = '23514';
  END IF;
  IF v_receipt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.recepciones r
    WHERE r.id = v_receipt_id AND r.tenant_id = p_tenant_id
      AND (v_order_id IS NULL OR r.orden_id = v_order_id)) THEN
    RAISE EXCEPTION 'Recepcion no pertenece al tenant u orden' USING ERRCODE = '23514';
  END IF;
  IF v_advance_id IS NOT NULL THEN
    SELECT * INTO v_advance FROM public.anticipos_terceros a
    WHERE a.tenant_id = p_tenant_id AND a.id = v_advance_id FOR UPDATE;
    IF NOT FOUND OR v_advance.origen <> 'PROVEEDOR'
       OR v_advance.proveedor_id IS DISTINCT FROM v_supplier_id
       OR v_advance.moneda <> v_currency OR v_advance.estado NOT IN ('DISPONIBLE', 'PARCIAL')
       OR v_advance.monto_disponible + 0.01 < v_advance_amount THEN
      RAISE EXCEPTION 'FISCAL_ADVANCE_NOT_AVAILABLE_FOR_SUPPLIER_INVOICE' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, orden_id, recepcion_id, numero, numero_documento,
    fecha_emision, fecha_vencimiento, condiciones_pago, dias_credito,
    subtotal, igv, total, saldo, saldo_pendiente,
    retencion_total, percepcion_total, detraccion_total, anticipo_total,
    moneda, tipo_documento, referencia_tipo, referencia_id, fiscal_metadata,
    estado, estado_comparacion, discrepancias, observaciones, created_by,
    event_id, idempotency_key
  ) VALUES (
    p_tenant_id, v_supplier_id, v_order_id, v_receipt_id,
    nullif(p_cxp->>'numero', ''), v_numero,
    (p_cxp->>'fecha_emision')::date, (p_cxp->>'fecha_vencimiento')::date,
    p_cxp->>'condiciones_pago', coalesce((p_cxp->>'dias_credito')::integer, 0),
    v_subtotal, v_igv, v_total, v_balance, v_balance,
    v_retention, v_perception, v_detraction, v_advance_amount,
    v_currency, v_type, nullif(p_cxp->>'referencia_tipo', ''),
    nullif(p_cxp->>'referencia_id', '')::uuid,
    v_fiscal || jsonb_build_object('request_fingerprint', v_fingerprint,
      'fingerprint_version', 1, 'anticipo_id', v_advance_id),
    p_cxp->>'estado', coalesce(nullif(p_cxp->>'estado_comparacion', ''), 'OK'),
    coalesce(p_cxp->'discrepancias', '[]'::jsonb), nullif(p_cxp->>'observaciones', ''),
    v_actor_id, p_event_id, v_key
  ) RETURNING * INTO v_cxp;

  IF v_advance_id IS NOT NULL THEN
    UPDATE public.anticipos_terceros
    SET monto_aplicado = round(monto_aplicado + v_advance_amount, 2),
        monto_disponible = round(monto_disponible - v_advance_amount, 2),
        estado = CASE WHEN monto_disponible - v_advance_amount <= 0.009 THEN 'APLICADO' ELSE 'PARCIAL' END,
        metadata = metadata || jsonb_build_object('ultima_aplicacion_key', v_key || ':anticipo'),
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_advance_id;
  END IF;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'factura_proveedor', v_cxp.id::text, 'factura.proveedor.registrada',
    jsonb_build_object(
      'eventId', p_event_id, 'tenantId', p_tenant_id, 'idempotencyKey', v_key,
      'requestFingerprint', v_fingerprint, 'facturaProvId', v_cxp.id,
      'numeroDocumento', v_cxp.numero_documento, 'serie', v_fiscal->>'serie',
      'ordenId', v_cxp.orden_id, 'recepcionId', v_cxp.recepcion_id,
      'proveedorId', v_cxp.proveedor_id, 'subtotal', v_cxp.subtotal,
      'igv', v_cxp.igv, 'total', v_cxp.total,
      'retencion', v_cxp.retencion_total, 'percepcion', v_cxp.percepcion_total,
      'detraccion', v_cxp.detraccion_total, 'anticipo', v_cxp.anticipo_total,
      'anticipoId', v_advance_id, 'saldoProveedor', v_cxp.saldo,
      'moneda', v_cxp.moneda, 'tipoCambio', v_rate,
      'fechaEmision', v_cxp.fecha_emision, 'fechaVencimiento', v_cxp.fecha_vencimiento,
      'estadoComparacion', v_cxp.estado_comparacion,
      'accountingHandledByOutbox', true, 'emittedAt', clock_timestamp()
    ), 'pending', 0, v_key, p_event_id, clock_timestamp()
  );

  FOR v_adjust IN SELECT * FROM (VALUES
    ('RETENCION', v_retention, NULL::uuid, 'APLICADO'),
    ('PERCEPCION', v_perception, NULL::uuid, 'APLICADO'),
    ('DETRACCION', v_detraction, NULL::uuid, 'PENDIENTE_TESORERIA'),
    ('ANTICIPO', v_advance_amount, v_advance_id, 'APLICADO')
  ) AS x(tipo, monto, anticipo_id, estado) WHERE monto > 0 LOOP
    INSERT INTO public.operaciones_fiscales_financieras (
      tenant_id, origen, tipo, cxp_id, proveedor_id, anticipo_id,
      monto, monto_contabilizado, moneda, tipo_cambio, fecha, referencia,
      estado, actor_id, idempotency_key, request_fingerprint, metadata
    ) VALUES (
      p_tenant_id, 'PROVEEDOR', v_adjust.tipo, v_cxp.id, v_supplier_id,
      v_adjust.anticipo_id, v_adjust.monto, round(v_adjust.monto * v_rate, 2),
      v_currency, v_rate, v_cxp.fecha_emision::date, v_cxp.numero_documento,
      v_adjust.estado, v_actor_id, v_key || ':' || lower(v_adjust.tipo),
      app.fiscal_fingerprint_465(jsonb_build_object(
        'invoice_fingerprint', v_fingerprint, 'tipo', v_adjust.tipo, 'monto', v_adjust.monto
      )), jsonb_build_object('source', 'supplier_invoice_465', 'invoice_event_id', p_event_id)
    );
  END LOOP;
  RETURN to_jsonb(v_cxp) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_anticipo_tercero_tx(
  p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.registrar_anticipo_tercero_tx_465(p_tenant_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.registrar_ajuste_fiscal_financiero_tx(
  p_tenant_id uuid, p_cuenta_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.registrar_ajuste_fiscal_financiero_tx_465(
    p_tenant_id,p_cuenta_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.depositar_detraccion_proveedor_tx(
  p_tenant_id uuid, p_operacion_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.depositar_detraccion_proveedor_tx_465(
    p_tenant_id,p_operacion_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.revertir_ajuste_fiscal_cxc_tx(
  p_tenant_id uuid, p_operacion_id uuid, p_payload jsonb,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.revertir_ajuste_fiscal_cxc_tx_465(
    p_tenant_id,p_operacion_id,p_payload,p_actor_id,p_idempotency_key)
$function$;

REVOKE ALL ON FUNCTION app.fiscal_fingerprint_465(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_fiscal_actor_465(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.ensure_fiscal_account_465(uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.registrar_anticipo_tercero_tx_465(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.registrar_ajuste_fiscal_financiero_tx_465(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.revertir_ajuste_fiscal_cxc_tx_465(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.depositar_detraccion_proveedor_tx_465(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.crear_factura_proveedor_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_anticipo_tercero_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_ajuste_fiscal_financiero_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_ajuste_fiscal_cxc_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.depositar_detraccion_proveedor_tx(uuid,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_anticipo_tercero_tx(uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_fiscal_financiero_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_ajuste_fiscal_cxc_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.depositar_detraccion_proveedor_tx(uuid,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text) TO service_role;

COMMENT ON TABLE public.anticipos_terceros IS
  'Anticipos reales de clientes/proveedores originados por un movimiento bancario atomico.';
COMMENT ON TABLE public.operaciones_fiscales_financieras IS
  'Aplicaciones documentales de retencion, percepcion, detraccion y anticipo; QUINTA pertenece a RRHH.';
COMMENT ON TABLE public.reversas_ajustes_fiscales_cxc IS
  'Evidencia durable e idempotente de la reversa explicita de un ajuste fiscal CxC.';
COMMENT ON FUNCTION public.registrar_ajuste_fiscal_financiero_tx(uuid,uuid,jsonb,uuid,text) IS
  'Writer service-role atomico e idempotente de ajustes CxC/CxP con outbox contable.';
COMMENT ON FUNCTION public.revertir_ajuste_fiscal_cxc_tx(uuid,uuid,jsonb,uuid,text) IS
  'Revierte un ajuste CxC activo sin movimiento de tesoreria, restaura saldos y emite outbox compensatorio.';

COMMIT;

NOTIFY pgrst, 'reload schema';
