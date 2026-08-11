-- ============================================================================
-- 456__customer_rma_credit_balance_atomic.sql
-- RMA cliente: solicitud, decision segregada, recepcion/reversa, NC/CPE 07,
-- ajuste CxC y saldo a favor en fronteras atomicas e idempotentes.
-- ============================================================================

BEGIN;

SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

DO $preflight$
BEGIN
  IF to_regclass('public.rma_solicitudes') IS NULL
     OR to_regclass('public.rma_items') IS NULL
     OR to_regclass('public.rma_eventos') IS NULL
     OR to_regclass('public.pedidos_venta') IS NULL
     OR to_regclass('public.pedidos_venta_detalle') IS NULL
     OR to_regclass('public.documentos') IS NULL
     OR to_regclass('public.documento_detalles') IS NULL
     OR to_regclass('public.cpe') IS NULL
     OR to_regclass('public.cuentas_por_cobrar') IS NULL
     OR to_regclass('public.productos') IS NULL
     OR to_regclass('public.movimientos_inventario') IS NULL
     OR to_regclass('public.outbox_events') IS NULL THEN
    RAISE EXCEPTION '456 requiere RMA, ventas, documentos, CPE, CxC, inventario y outbox';
  END IF;
  IF to_regprocedure('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)') IS NULL
     OR to_regprocedure('public.obtener_siguiente_numero_documento(uuid,text,text)') IS NULL
     OR to_regprocedure('app.validar_contabilidad_origen_anulacion_cpe_448(uuid,uuid)') IS NULL
     OR to_regprocedure('app.treasury_valuation_452(uuid,text,text,numeric,date,date)') IS NULL
     OR to_regprocedure('app.resolve_cash_session_452(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('app.append_cash_movement_452(sesiones_caja,uuid,numeric,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '456 requiere writers canonicos de inventario/numeracion, validacion contable 448 y tesoreria 452';
  END IF;
  IF to_regclass('public.ux_cpe_tenant_fiscal_number_443') IS NULL
     OR to_regclass('public.ux_cpe_tenant_documento_443') IS NULL
     OR to_regclass('public.ux_cpe_tenant_event_443') IS NULL THEN
    RAISE EXCEPTION '456 requiere invariantes CPE/documento/evento de 443';
  END IF;
END
$preflight$;

-- RMA es un modulo operativo gobernado por RBAC, no una habilitacion legal.
ALTER TABLE public.empresa_config
  ALTER COLUMN habilitar_rma SET DEFAULT true;
UPDATE public.empresa_config
SET habilitar_rma = true, updated_at = now()
WHERE habilitar_rma IS DISTINCT FROM true;

ALTER TABLE public.rma_solicitudes
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS documento_origen_id uuid,
  ADD COLUMN IF NOT EXISTS cpe_origen_id uuid,
  ADD COLUMN IF NOT EXISTS cxc_origen_id uuid,
  ADD COLUMN IF NOT EXISTS nota_credito_cpe_id uuid;

ALTER TABLE public.rma_items
  ADD COLUMN IF NOT EXISTS documento_detalle_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rma_created_by_456') THEN
    ALTER TABLE public.rma_solicitudes ADD CONSTRAINT fk_rma_created_by_456
      FOREIGN KEY (created_by) REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rma_documento_origen_456') THEN
    ALTER TABLE public.rma_solicitudes ADD CONSTRAINT fk_rma_documento_origen_456
      FOREIGN KEY (documento_origen_id) REFERENCES public.documentos(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rma_cpe_origen_456') THEN
    ALTER TABLE public.rma_solicitudes ADD CONSTRAINT fk_rma_cpe_origen_456
      FOREIGN KEY (cpe_origen_id) REFERENCES public.cpe(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rma_cxc_origen_456') THEN
    ALTER TABLE public.rma_solicitudes ADD CONSTRAINT fk_rma_cxc_origen_456
      FOREIGN KEY (cxc_origen_id) REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rma_nota_cpe_456') THEN
    ALTER TABLE public.rma_solicitudes ADD CONSTRAINT fk_rma_nota_cpe_456
      FOREIGN KEY (nota_credito_cpe_id) REFERENCES public.cpe(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rma_item_documento_detalle_456') THEN
    ALTER TABLE public.rma_items ADD CONSTRAINT fk_rma_item_documento_detalle_456
      FOREIGN KEY (documento_detalle_id) REFERENCES public.documento_detalles(id) ON DELETE RESTRICT;
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rma_tenant_nota_documento_456
  ON public.rma_solicitudes (tenant_id, nota_credito_documento_id)
  WHERE nota_credito_documento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rma_tenant_nota_cpe_456
  ON public.rma_solicitudes (tenant_id, nota_credito_cpe_id)
  WHERE nota_credito_cpe_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rma_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rma_id uuid REFERENCES public.rma_solicitudes(id) ON DELETE RESTRICT,
  saldo_favor_id uuid,
  tipo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb,
  event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rma_operaciones_tipo_456 CHECK (tipo IN (
    'CREAR', 'DECIDIR', 'RECEPCIONAR', 'REVERTIR_RECEPCION',
    'EMITIR_NOTA_CREDITO', 'APLICAR_SALDO', 'REEMBOLSAR_SALDO'
  )),
  CONSTRAINT ck_rma_operaciones_key_456 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ck_rma_operaciones_fingerprint_456 CHECK (
    fingerprint ~ '^[0-9a-f]{64}$'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rma_operacion_idempotency_456
  ON public.rma_operaciones (tenant_id, tipo, lower(idempotency_key));
CREATE INDEX IF NOT EXISTS ix_rma_operacion_rma_456
  ON public.rma_operaciones (tenant_id, rma_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saldos_favor_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  rma_id uuid NOT NULL REFERENCES public.rma_solicitudes(id) ON DELETE RESTRICT,
  documento_origen_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE RESTRICT,
  nota_credito_documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE RESTRICT,
  nota_credito_cpe_id uuid NOT NULL REFERENCES public.cpe(id) ON DELETE RESTRICT,
  moneda text NOT NULL,
  tipo_cambio_origen numeric(18,6) NOT NULL DEFAULT 1,
  monto_original numeric(14,2) NOT NULL,
  monto_disponible numeric(14,2) NOT NULL,
  monto_local_original numeric(14,2) NOT NULL,
  monto_local_disponible numeric(14,2) NOT NULL,
  estado text NOT NULL DEFAULT 'DISPONIBLE',
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_saldo_favor_moneda_456 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_saldo_favor_montos_456 CHECK (
    tipo_cambio_origen > 0 AND monto_original > 0
    AND monto_disponible >= 0 AND monto_disponible <= monto_original
    AND monto_local_original > 0 AND monto_local_disponible >= 0
    AND monto_local_disponible <= monto_local_original
  ),
  CONSTRAINT ck_saldo_favor_estado_456 CHECK (
    estado IN ('DISPONIBLE', 'PARCIAL', 'AGOTADO', 'ANULADO')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_saldo_favor_rma_456
  ON public.saldos_favor_clientes (tenant_id, rma_id);
CREATE INDEX IF NOT EXISTS ix_saldo_favor_cliente_456
  ON public.saldos_favor_clientes (tenant_id, cliente_id, estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saldos_favor_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  saldo_favor_id uuid NOT NULL REFERENCES public.saldos_favor_clientes(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  monto numeric(14,2) NOT NULL,
  cxc_id uuid REFERENCES public.cuentas_por_cobrar(id) ON DELETE RESTRICT,
  movimiento_caja_id uuid REFERENCES public.movimientos_caja(id) ON DELETE RESTRICT,
  movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  event_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_saldo_mov_tipo_456 CHECK (
    tipo IN ('ORIGEN_NC', 'APLICACION_CXC', 'REEMBOLSO_CAJA', 'REEMBOLSO_BANCO', 'REVERSA')
  ),
  CONSTRAINT ck_saldo_mov_monto_456 CHECK (monto > 0),
  CONSTRAINT ck_saldo_mov_key_456 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_saldo_mov_idempotency_456
  ON public.saldos_favor_movimientos (tenant_id, lower(idempotency_key));
CREATE INDEX IF NOT EXISTS ix_saldo_mov_saldo_456
  ON public.saldos_favor_movimientos (tenant_id, saldo_favor_id, created_at);

ALTER TABLE public.rma_operaciones
  DROP CONSTRAINT IF EXISTS fk_rma_operacion_saldo_456;
ALTER TABLE public.rma_operaciones
  ADD CONSTRAINT fk_rma_operacion_saldo_456
  FOREIGN KEY (saldo_favor_id) REFERENCES public.saldos_favor_clientes(id) ON DELETE RESTRICT;

SELECT app.apply_tenant_policy('public', 'rma_operaciones');
SELECT app.apply_tenant_policy('public', 'saldos_favor_clientes');
SELECT app.apply_tenant_policy('public', 'saldos_favor_movimientos');

CREATE OR REPLACE FUNCTION app.assert_rma_actor_456(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND u.activo
      AND lower(u.estado::text) = 'activo'
  ) THEN
    RAISE EXCEPTION 'RMA_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.rma_fingerprint_456(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.rma_insert_event_456(
  p_tenant_id uuid,
  p_rma_id uuid,
  p_actor_id uuid,
  p_tipo text,
  p_descripcion text,
  p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.rma_eventos (
    tenant_id, rma_id, tipo, descripcion, usuario_id, metadata,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, p_rma_id, p_tipo, p_descripcion, p_actor_id,
    coalesce(p_metadata, '{}'::jsonb), now(), now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.rma_insert_outbox_456(
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
  v_existing public.outbox_events%ROWTYPE;
BEGIN
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, p_aggregate_type, p_aggregate_id::text, p_event_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'operationFingerprint', p_fingerprint,
      'accountingHandledByOutbox', p_event_type IN (
        'nota_credito.emitida', 'saldo_favor.aplicado', 'saldo_favor.reembolsado'
      )
    ),
    'pending', 0, p_key, p_event_id, clock_timestamp(), now(), now()
  )
  ON CONFLICT (tenant_id, event_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  SELECT * INTO v_existing
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND o.event_type = p_event_type
    AND o.idempotency_key = p_key
  FOR UPDATE;
  IF NOT FOUND OR v_existing.event_id IS DISTINCT FROM p_event_id
     OR v_existing.aggregate_id IS DISTINCT FROM p_aggregate_id::text
     OR v_existing.payload->>'operationFingerprint' IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'RMA_OUTBOX_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  RETURN v_existing.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
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
  v_pedido_id uuid := nullif(p_payload->>'pedido_id', '')::uuid;
  v_documento_requested uuid := nullif(p_payload->>'documento_origen_id', '')::uuid;
  v_almacen_id uuid := nullif(p_payload->>'almacen_retorno_id', '')::uuid;
  v_motivo text := nullif(btrim(coalesce(p_payload->>'motivo_general', '')), '');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_pedido public.pedidos_venta%ROWTYPE;
  v_documento public.documentos%ROWTYPE;
  v_cpe public.cpe%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_order_item public.pedidos_venta_detalle%ROWTYPE;
  v_doc_item public.documento_detalles%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_item jsonb;
  v_detalle_id uuid;
  v_producto_input uuid;
  v_cantidad numeric;
  v_consumido numeric;
  v_disponible numeric;
  v_base_retornable numeric;
  v_doc_count integer;
  v_cpe_count integer;
  v_cxc_count integer;
  v_dias integer;
  v_year integer := extract(year from app.hoy_tenant(p_tenant_id));
  v_sequence integer;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR v_pedido_id IS NULL OR v_motivo IS NULL OR length(v_motivo) > 1000
     OR jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'RMA_CREATE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR nullif(e->>'detalle_id', '') IS NULL
       OR coalesce(nullif(e->>'cantidad', '')::numeric, 0) <= 0
  ) OR (
    SELECT count(*) FROM jsonb_array_elements(v_items)
  ) <> (
    SELECT count(DISTINCT e->>'detalle_id') FROM jsonb_array_elements(v_items) e
  ) THEN
    RAISE EXCEPTION 'RMA_CREATE_ITEMS_INVALID_OR_DUPLICATED' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(e ORDER BY e->>'detalle_id'), '[]'::jsonb)
  INTO v_items FROM jsonb_array_elements(v_items) e;
  v_canonical := jsonb_build_object(
    'version', 1, 'pedido_id', v_pedido_id,
    'documento_origen_id', v_documento_requested,
    'almacen_retorno_id', v_almacen_id,
    'motivo_general', v_motivo, 'items', v_items
  );
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:RMA:CREAR:%s', p_tenant_id, v_key), 456)
  );
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'CREAR'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RMA_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_venta p
  WHERE p.id = v_pedido_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR lower(v_pedido.estado::text) NOT IN (
    'facturado', 'completado', 'despacho_parcial', 'listo_facturar'
  ) THEN
    RAISE EXCEPTION 'RMA_ORDER_NOT_IN_RETURNABLE_STATE' USING ERRCODE = '23514';
  END IF;

  IF v_documento_requested IS NOT NULL THEN
    SELECT * INTO v_documento FROM public.documentos d
    WHERE d.id = v_documento_requested AND d.tenant_id = p_tenant_id
      AND d.pedido_id = v_pedido_id
      AND d.tipo_documento IN ('FACTURA', 'BOLETA')
      AND lower(d.estado::text) NOT IN ('anulado', 'rechazado')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RMA_SOURCE_DOCUMENT_NOT_FOUND_IN_ORDER' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT count(*), (array_agg(d.id ORDER BY d.created_at DESC, d.id))[1]
    INTO v_doc_count, v_documento_requested
    FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id AND d.pedido_id = v_pedido_id
      AND d.tipo_documento IN ('FACTURA', 'BOLETA')
      AND lower(d.estado::text) NOT IN ('anulado', 'rechazado');
    IF v_doc_count <> 1 THEN
      RAISE EXCEPTION 'RMA_SOURCE_DOCUMENT_REQUIRED_OR_AMBIGUOUS: found=%', v_doc_count
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_documento FROM public.documentos d
    WHERE d.id = v_documento_requested AND d.tenant_id = p_tenant_id FOR UPDATE;
  END IF;
  IF v_documento.cliente_id IS DISTINCT FROM v_pedido.cliente_id THEN
    RAISE EXCEPTION 'RMA_SOURCE_DOCUMENT_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at DESC, c.id))[1]
  INTO v_cpe_count, v_documento_requested
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_documento.id
    AND upper(c.tipo_documento) IN ('01', '03')
    AND lower(c.estado::text) NOT IN ('rechazado', 'anulado', 'error')
    AND lower(c.sunat_status::text) NOT IN ('rejected', 'error');
  IF v_cpe_count <> 1 THEN
    RAISE EXCEPTION 'RMA_SOURCE_CPE_REQUIRED_OR_AMBIGUOUS: found=%', v_cpe_count
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_cpe FROM public.cpe c
  WHERE c.id = v_documento_requested AND c.tenant_id = p_tenant_id FOR UPDATE;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at DESC, c.id))[1]
  INTO v_cxc_count, v_documento_requested
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_documento.id
    AND lower(c.estado::text) NOT IN ('anulada', 'revertida');
  IF v_cxc_count > 1 THEN
    RAISE EXCEPTION 'RMA_SOURCE_RECEIVABLE_AMBIGUOUS' USING ERRCODE = '23514';
  ELSIF v_cxc_count = 1 THEN
    SELECT * INTO v_cxc FROM public.cuentas_por_cobrar c
    WHERE c.id = v_documento_requested AND c.tenant_id = p_tenant_id FOR UPDATE;
  END IF;

  SELECT coalesce(ec.dias_maximos_rma, 30) INTO v_dias
  FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA_CONFIGURATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_dias > 0 AND app.hoy_tenant(p_tenant_id) - v_documento.fecha_emision::date > v_dias THEN
    RAISE EXCEPTION 'RMA_RETURN_WINDOW_EXPIRED' USING ERRCODE = '23514';
  END IF;
  IF v_almacen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacenes a WHERE a.id = v_almacen_id
      AND a.tenant_id = p_tenant_id AND coalesce(a.activo, true)
  ) THEN
    RAISE EXCEPTION 'RMA_RETURN_WAREHOUSE_NOT_IN_TENANT' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:RMA:NUMBER:%s', p_tenant_id, v_year), 456)
  );
  SELECT coalesce(max((regexp_match(r.numero, '([0-9]+)$'))[1]::integer), 0) + 1
  INTO v_sequence FROM public.rma_solicitudes r
  WHERE r.tenant_id = p_tenant_id
    AND r.numero ~ format('^RMA-%s-[0-9]+$', v_year);
  INSERT INTO public.rma_solicitudes (
    tenant_id, pedido_id, cliente_id, numero, codigo, motivo_general,
    tipo, estado, almacen_retorno_id, created_by,
    documento_origen_id, cpe_origen_id, cxc_origen_id, metadata,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, v_pedido.id, v_pedido.cliente_id,
    format('RMA-%s-%s', v_year, lpad(v_sequence::text, 5, '0')),
    format('RMA-%s-%s', v_year, lpad(v_sequence::text, 5, '0')),
    v_motivo, 'DEVOLUCION', 'CREADA', v_almacen_id, p_actor_id,
    v_documento.id, v_cpe.id, v_cxc.id,
    jsonb_build_object('creation_fingerprint', v_fingerprint,
      'creation_idempotency_key', v_key, 'atomic_rpc', 'crear_rma_tx'),
    now(), now()
  ) RETURNING * INTO v_rma;

  FOR v_item IN SELECT e FROM jsonb_array_elements(v_items) e
  LOOP
    v_detalle_id := (v_item->>'detalle_id')::uuid;
    v_producto_input := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := round((v_item->>'cantidad')::numeric, 6);
    SELECT * INTO v_order_item FROM public.pedidos_venta_detalle d
    WHERE d.id = v_detalle_id AND d.tenant_id = p_tenant_id
      AND d.pedido_id = v_pedido.id FOR UPDATE;
    IF NOT FOUND OR v_order_item.producto_id IS NULL
       OR (v_producto_input IS NOT NULL AND v_producto_input IS DISTINCT FROM v_order_item.producto_id) THEN
      RAISE EXCEPTION 'RMA_ORDER_DETAIL_INVALID: %', v_detalle_id USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_producto FROM public.productos p
    WHERE p.id = v_order_item.producto_id AND p.tenant_id = p_tenant_id
      AND coalesce(p.activo, true) FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RMA_ORDER_PRODUCT_NOT_ACTIVE_IN_TENANT: %', v_order_item.producto_id
        USING ERRCODE = '23514';
    END IF;

    WITH order_rank AS (
      SELECT d.id, d.producto_id,
        row_number() OVER (PARTITION BY d.producto_id ORDER BY d.created_at, d.id) AS rn
      FROM public.pedidos_venta_detalle d
      WHERE d.tenant_id = p_tenant_id AND d.pedido_id = v_pedido.id
    ), doc_rank AS (
      SELECT dd.id, dd.producto_id,
        row_number() OVER (PARTITION BY dd.producto_id ORDER BY dd.orden, dd.created_at, dd.id) AS rn
      FROM public.documento_detalles dd
      WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_documento.id
    )
    SELECT dd.* INTO v_doc_item
    FROM order_rank od
    JOIN doc_rank dr ON dr.producto_id = od.producto_id AND dr.rn = od.rn
    JOIN public.documento_detalles dd ON dd.id = dr.id
    WHERE od.id = v_order_item.id;
    IF NOT FOUND OR coalesce(v_doc_item.cantidad, 0) <= 0 THEN
      RAISE EXCEPTION 'RMA_FISCAL_LINE_NOT_MAPPABLE: %', v_detalle_id USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(ri.cantidad_autorizada), 0) INTO v_consumido
    FROM public.rma_items ri
    JOIN public.rma_solicitudes rs ON rs.id = ri.rma_id AND rs.tenant_id = p_tenant_id
    WHERE ri.tenant_id = p_tenant_id AND ri.detalle_id = v_order_item.id
      AND lower(rs.estado::text) NOT IN ('rechazada', 'cancelada', 'inactivo')
      AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo');
    -- Servicios y productos no-stock no pasan por un despacho físico. Para
    -- ellos el comprobante es la fuente de la cantidad entregada; los bienes
    -- stock-controlados conservan el límite adicional de despacho.
    v_base_retornable := CASE
      WHEN coalesce(v_producto.es_servicio, false)
        OR NOT coalesce(v_producto.controla_stock, true)
        THEN v_doc_item.cantidad
      ELSE least(coalesce(v_order_item.cantidad_despachada, 0), v_doc_item.cantidad)
    END;
    v_disponible := v_base_retornable - v_consumido;
    IF v_cantidad <= 0 OR v_cantidad - v_disponible > 0.000001 THEN
      RAISE EXCEPTION 'RMA_QUANTITY_EXCEEDS_RETURNABLE_BALANCE: detail=% available=% requested=%',
        v_detalle_id, greatest(v_disponible, 0), v_cantidad USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.rma_items (
      tenant_id, rma_id, detalle_id, documento_detalle_id, producto_id,
      cantidad_autorizada, cantidad_devuelta, motivo_item, lote,
      fecha_expiracion, estado, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_rma.id, v_order_item.id, v_doc_item.id,
      v_order_item.producto_id, v_cantidad, 0,
      coalesce(nullif(btrim(v_item->>'motivo_item'), ''), v_motivo),
      nullif(btrim(v_item->>'lote'), ''), nullif(v_item->>'fecha_expiracion', '')::date,
      'CREADA', jsonb_build_object(
        'source_document_line_id', v_doc_item.id,
        'es_servicio', coalesce(v_producto.es_servicio, false),
        'controla_stock', coalesce(v_producto.controla_stock, true),
        'afectacion_igv', coalesce(nullif(v_doc_item.metadata->>'afectacion_igv', ''),
          nullif(v_producto.afectacion_igv, '')),
        'precio_compra_snapshot', coalesce(v_producto.precio_compra, 0),
        'classification_snapshot', CASE
          WHEN coalesce(v_producto.es_servicio, false) THEN 'SERVICIO'
          WHEN NOT coalesce(v_producto.controla_stock, true) THEN 'NO_STOCK'
          ELSE 'FISICO_STOCK'
        END
      ), now(), now()
    );
  END LOOP;

  PERFORM app.rma_insert_event_456(p_tenant_id, v_rma.id, p_actor_id,
    'CREADA', 'RMA creada atómicamente', jsonb_build_object(
      'pedido_id', v_pedido.id, 'documento_origen_id', v_documento.id,
      'cpe_origen_id', v_cpe.id, 'idempotency_key', v_key));
  v_event_key := format('rma.creada:%s:%s', p_tenant_id, v_rma.id);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'rma', v_rma.id,
    'rma.creada', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'rmaId', v_rma.id, 'pedidoId', v_pedido.id, 'actorId', p_actor_id,
      'idempotencyKey', v_event_key));
  v_result := jsonb_build_object('success', true, 'rma_id', v_rma.id,
    'numero', v_rma.numero, 'estado', v_rma.estado, 'event_id', v_event_id,
    'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, tipo, idempotency_key, fingerprint, actor_id,
    payload, resultado, event_id
  ) VALUES (p_tenant_id, v_rma.id, 'CREAR', v_key, v_fingerprint,
    p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decidir_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
  p_aprobar boolean,
  p_notas text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_estado text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_rma_id IS NULL OR p_aprobar IS NULL OR v_key IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 200 OR length(coalesce(v_notas, '')) > 2000 THEN
    RAISE EXCEPTION 'RMA_DECISION_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('version', 1, 'rma_id', p_rma_id,
    'aprobar', p_aprobar, 'notas', v_notas);
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:RMA:DECIDIR:%s', p_tenant_id, v_key), 456));
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'DECIDIR'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RMA_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_rma FROM public.rma_solicitudes r
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR lower(v_rma.estado::text) <> 'creada' THEN
    RAISE EXCEPTION 'RMA_NOT_PENDING_DECISION' USING ERRCODE = '23514';
  END IF;
  IF p_aprobar AND v_rma.created_by = p_actor_id THEN
    RAISE EXCEPTION 'RMA_SELF_APPROVAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_estado := CASE WHEN p_aprobar THEN 'APROBADA' ELSE 'RECHAZADA' END;
  UPDATE public.rma_solicitudes
  SET estado = v_estado, aprobado_por = p_actor_id, aprobado_en = now(),
      notas = v_notas,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'decision_fingerprint', v_fingerprint, 'decision_idempotency_key', v_key,
        'atomic_rpc', 'decidir_rma_tx'), updated_at = now()
  WHERE id = p_rma_id AND tenant_id = p_tenant_id RETURNING * INTO v_rma;
  IF NOT p_aprobar THEN
    UPDATE public.rma_items SET estado = 'RECHAZADO', updated_at = now()
    WHERE rma_id = p_rma_id AND tenant_id = p_tenant_id;
  END IF;
  PERFORM app.rma_insert_event_456(p_tenant_id, p_rma_id, p_actor_id,
    'DECISION', format('RMA %s', v_estado), jsonb_build_object(
      'aprobar', p_aprobar, 'notas', v_notas, 'idempotency_key', v_key));
  v_event_key := format('rma.decidida:%s:%s', p_tenant_id, p_rma_id);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'rma', p_rma_id,
    'rma.decidida', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'rmaId', p_rma_id, 'estado', v_estado, 'actorId', p_actor_id,
      'idempotencyKey', v_event_key));
  v_result := jsonb_build_object('success', true, 'rma_id', p_rma_id,
    'estado', v_estado, 'event_id', v_event_id, 'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, tipo, idempotency_key, fingerprint, actor_id,
    payload, resultado, event_id
  ) VALUES (p_tenant_id, p_rma_id, 'DECIDIR', v_key, v_fingerprint,
    p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recepcionar_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
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
  v_default_warehouse uuid := nullif(p_payload->>'almacen_id', '')::uuid;
  v_default_location uuid := nullif(p_payload->>'ubicacion_id', '')::uuid;
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_rma_item public.rma_items%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_movement public.movimientos_inventario%ROWTYPE;
  v_item jsonb;
  v_rma_item_id uuid;
  v_warehouse uuid;
  v_location uuid;
  v_quantity numeric;
  v_pending numeric;
  v_is_physical boolean;
  v_is_service boolean;
  v_controls_stock boolean;
  v_movement_id uuid;
  v_receipt_line_id uuid;
  v_cost numeric := 0;
  v_cost_total numeric := 0;
  v_result_items jsonb := '[]'::jsonb;
  v_complete boolean;
  v_state text;
  v_quality_required boolean;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_rma_id IS NULL OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'RMA_RECEIPT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR nullif(e->>'rma_item_id', '') IS NULL
       OR coalesce(nullif(e->>'cantidad_recibida', '')::numeric, 0) <= 0
  ) OR (SELECT count(*) FROM jsonb_array_elements(v_items)) <>
       (SELECT count(DISTINCT e->>'rma_item_id') FROM jsonb_array_elements(v_items) e) THEN
    RAISE EXCEPTION 'RMA_RECEIPT_ITEMS_INVALID_OR_DUPLICATED' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(e ORDER BY e->>'rma_item_id'), '[]'::jsonb)
  INTO v_items FROM jsonb_array_elements(v_items) e;
  v_canonical := jsonb_build_object('version', 1, 'rma_id', p_rma_id,
    'almacen_id', v_default_warehouse, 'ubicacion_id', v_default_location,
    'lote', nullif(btrim(p_payload->>'lote'), ''), 'items', v_items);
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:RMA:RECEPCIONAR:%s', p_tenant_id, v_key), 456));
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'RECEPCIONAR'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RMA_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_rma FROM public.rma_solicitudes r
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR lower(v_rma.estado::text) NOT IN ('aprobada', 'parcial') THEN
    RAISE EXCEPTION 'RMA_RECEIPT_REQUIRES_APPROVED_OR_PARTIAL_STATE'
      USING ERRCODE = '23514';
  END IF;
  IF v_rma.aprobado_por IS NULL OR v_rma.aprobado_en IS NULL
     OR v_rma.aprobado_por = v_rma.created_by THEN
    RAISE EXCEPTION 'RMA_SEGREGATED_APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(ec.rma_requiere_control_calidad, false)
  INTO v_quality_required FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  FOR v_item IN SELECT e FROM jsonb_array_elements(v_items) e
  LOOP
    v_rma_item_id := (v_item->>'rma_item_id')::uuid;
    v_quantity := round((v_item->>'cantidad_recibida')::numeric, 6);
    SELECT * INTO v_rma_item FROM public.rma_items ri
    WHERE ri.id = v_rma_item_id AND ri.tenant_id = p_tenant_id
      AND ri.rma_id = p_rma_id FOR UPDATE;
    IF NOT FOUND OR lower(v_rma_item.estado::text) IN ('rechazado', 'inactivo', 'cerrado') THEN
      RAISE EXCEPTION 'RMA_RECEIPT_ITEM_NOT_PENDING: %', v_rma_item_id
        USING ERRCODE = '23514';
    END IF;
    v_pending := round(coalesce(v_rma_item.cantidad_autorizada, 0)
      - coalesce(v_rma_item.cantidad_devuelta, 0), 6);
    IF v_quantity <= 0 OR v_quantity - v_pending > 0.000001 THEN
      RAISE EXCEPTION 'RMA_RECEIPT_QUANTITY_EXCEEDS_PENDING: item=% pending=% requested=%',
        v_rma_item_id, greatest(v_pending, 0), v_quantity USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_producto FROM public.productos p
    WHERE p.id = v_rma_item.producto_id AND p.tenant_id = p_tenant_id
      AND coalesce(p.activo, true) FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RMA_RECEIPT_PRODUCT_NOT_FOUND_IN_TENANT'
        USING ERRCODE = '23514';
    END IF;
    -- La clasificación se congela al crear la RMA. El catálogo actual sólo es
    -- fallback para borradores legacy que no tengan snapshot.
    v_is_service := CASE
      WHEN jsonb_typeof(v_rma_item.metadata->'es_servicio') = 'boolean'
        THEN (v_rma_item.metadata->>'es_servicio')::boolean
      ELSE coalesce(v_producto.es_servicio, false)
    END;
    v_controls_stock := CASE
      WHEN jsonb_typeof(v_rma_item.metadata->'controla_stock') = 'boolean'
        THEN (v_rma_item.metadata->>'controla_stock')::boolean
      ELSE coalesce(v_producto.controla_stock, true)
    END;
    v_is_physical := NOT v_is_service AND v_controls_stock;
    v_warehouse := coalesce(nullif(v_item->>'almacen_id', '')::uuid,
      v_default_warehouse, v_rma.almacen_retorno_id);
    v_location := coalesce(nullif(v_item->>'ubicacion_id', '')::uuid,
      v_default_location);
    v_movement_id := NULL;
    v_cost := 0;
    IF v_is_physical THEN
      IF v_warehouse IS NULL THEN
        SELECT a.id INTO v_warehouse FROM public.almacenes a
        WHERE a.tenant_id = p_tenant_id AND coalesce(a.activo, true)
          AND coalesce(a.es_principal, false)
        ORDER BY a.id LIMIT 1;
      END IF;
      IF v_warehouse IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.almacenes a WHERE a.id = v_warehouse
          AND a.tenant_id = p_tenant_id AND coalesce(a.activo, true)
      ) THEN
        RAISE EXCEPTION 'RMA_RECEIPT_WAREHOUSE_REQUIRED_FOR_STOCK_ITEM'
          USING ERRCODE = '23514';
      END IF;
      IF v_quality_required AND v_location IS NULL THEN
        RAISE EXCEPTION 'RMA_QUALITY_LOCATION_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF v_location IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.almacen_ubicaciones u
        WHERE u.id = v_location AND u.tenant_id = p_tenant_id
          AND u.almacen_id = v_warehouse
      ) THEN
        RAISE EXCEPTION 'RMA_RECEIPT_LOCATION_NOT_IN_WAREHOUSE'
          USING ERRCODE = '23514';
      END IF;
      v_receipt_line_id := gen_random_uuid();
      v_movement_id := public.aplicar_movimiento_inventario_tx(
        p_tenant_id := p_tenant_id,
        p_producto_id := v_producto.id,
        p_almacen_id := v_warehouse,
        p_tipo := 'ENTRADA',
        p_cantidad := v_quantity,
        p_referencia_tipo := 'RMA_RECEPCION',
        p_referencia_id := v_receipt_line_id,
        p_notas := format('Recepción RMA %s', v_rma.numero),
        p_ubicacion_id := v_location,
        p_lote := coalesce(nullif(btrim(v_item->>'lote'), ''),
          nullif(btrim(p_payload->>'lote'), ''), v_rma_item.lote),
        p_fecha_expiracion := coalesce(nullif(v_item->>'fecha_expiracion', '')::date,
          v_rma_item.fecha_expiracion),
        p_created_by := p_actor_id::text,
        p_metadata := jsonb_build_object('rma_id', p_rma_id,
          'rma_item_id', v_rma_item.id, 'receipt_idempotency_key', v_key,
          'receipt_line_id', v_receipt_line_id, 'business_movement_type', 'RMA_RETURN'),
        p_liberar_reserva := false
      );
      SELECT * INTO v_movement FROM public.movimientos_inventario mi
      WHERE mi.id = v_movement_id AND mi.tenant_id = p_tenant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RMA_RECEIPT_MOVEMENT_NOT_PERSISTED' USING ERRCODE = '40001';
      END IF;
      v_cost := round(coalesce((v_movement.metadata->>'valor_total')::numeric, 0), 2);
      v_cost_total := round(v_cost_total + v_cost, 2);
    END IF;
    UPDATE public.rma_items
    SET cantidad_devuelta = round(coalesce(cantidad_devuelta, 0) + v_quantity, 6),
        estado = CASE WHEN round(coalesce(cantidad_devuelta, 0) + v_quantity, 6)
          >= round(cantidad_autorizada, 6) THEN 'CERRADO' ELSE 'PARCIAL' END,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_receipt_idempotency_key', v_key,
          'last_movement_id', v_movement_id,
          'physical_stock', v_is_physical,
          'classification', CASE WHEN v_is_service
            THEN 'SERVICIO' WHEN NOT v_controls_stock
            THEN 'NO_STOCK' ELSE 'FISICO_STOCK' END),
        updated_at = now()
    WHERE id = v_rma_item.id AND tenant_id = p_tenant_id;
    v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
      'rma_item_id', v_rma_item.id, 'producto_id', v_producto.id,
      'cantidad_recibida', v_quantity, 'movimiento_id', v_movement_id,
      'almacen_id', CASE WHEN v_is_physical THEN v_warehouse ELSE NULL END,
      'physical_stock', v_is_physical, 'costo_retorno', v_cost));
  END LOOP;

  SELECT bool_and(round(coalesce(ri.cantidad_devuelta, 0), 6)
      >= round(coalesce(ri.cantidad_autorizada, 0), 6))
  INTO v_complete FROM public.rma_items ri
  WHERE ri.tenant_id = p_tenant_id AND ri.rma_id = p_rma_id
    AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo');
  v_state := CASE WHEN coalesce(v_complete, false) THEN 'RECIBIDA' ELSE 'PARCIAL' END;
  UPDATE public.rma_solicitudes
  SET estado = v_state, recibido_por = p_actor_id,
      recibido_en = CASE WHEN v_state = 'RECIBIDA' THEN now() ELSE recibido_en END,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_receipt_fingerprint', v_fingerprint,
        'last_receipt_idempotency_key', v_key, 'atomic_rpc', 'recepcionar_rma_tx'),
      updated_at = now()
  WHERE id = p_rma_id AND tenant_id = p_tenant_id RETURNING * INTO v_rma;
  PERFORM app.rma_insert_event_456(p_tenant_id, p_rma_id, p_actor_id,
    'RECEPCION', format('Recepción RMA: %s', v_state), jsonb_build_object(
      'items', v_result_items, 'costo_retorno', v_cost_total,
      'idempotency_key', v_key));
  v_event_key := format('rma.recepcionada:%s:%s', p_tenant_id, v_key);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'rma', p_rma_id,
    'rma.recepcionada', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'rmaId', p_rma_id, 'estado', v_state, 'items', v_result_items,
      'costoRetorno', v_cost_total, 'actorId', p_actor_id,
      'idempotencyKey', v_event_key, 'accountingOwner', 'nota_credito.emitida'));
  v_result := jsonb_build_object('success', true, 'rma_id', p_rma_id,
    'estado', v_state, 'items', v_result_items, 'costo_retorno', v_cost_total,
    'event_id', v_event_id, 'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, tipo, idempotency_key, fingerprint, actor_id,
    payload, resultado, event_id
  ) VALUES (p_tenant_id, p_rma_id, 'RECEPCIONAR', v_key, v_fingerprint,
    p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revertir_recepcion_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
  p_motivo text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_source public.movimientos_inventario%ROWTYPE;
  v_reverse_id uuid;
  v_reversals jsonb := '[]'::jsonb;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_rma_id IS NULL OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_motivo IS NULL OR length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'RMA_RECEIPT_REVERSAL_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('version', 1, 'rma_id', p_rma_id,
    'motivo', v_motivo);
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:RMA:REVERTIR:%s', p_tenant_id, v_key), 456));
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'REVERTIR_RECEPCION'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RMA_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_rma FROM public.rma_solicitudes r
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR lower(v_rma.estado::text) NOT IN ('parcial', 'recibida')
     OR v_rma.nota_credito_documento_id IS NOT NULL
     OR v_rma.nota_credito_cpe_id IS NOT NULL THEN
    RAISE EXCEPTION 'RMA_RECEIPT_REVERSAL_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;
  FOR v_source IN
    SELECT mi.* FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.tipo = 'ENTRADA'
      AND mi.referencia_tipo = 'RMA_RECEPCION'
      AND mi.metadata->>'rma_id' = p_rma_id::text
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario mr
        WHERE mr.tenant_id = p_tenant_id AND mr.tipo = 'SALIDA'
          AND mr.referencia_tipo = 'RMA_RECEPCION_REVERSA'
          AND mr.metadata->>'source_movement_id' = mi.id::text
      )
    ORDER BY mi.created_at, mi.id FOR UPDATE
  LOOP
    v_reverse_id := public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id, p_producto_id := v_source.producto_id,
      p_almacen_id := v_source.almacen_id, p_tipo := 'SALIDA',
      p_cantidad := v_source.cantidad,
      p_referencia_tipo := 'RMA_RECEPCION_REVERSA',
      p_referencia_id := gen_random_uuid(),
      p_notas := v_motivo, p_ubicacion_id := v_source.ubicacion_id,
      p_lote := v_source.lote, p_fecha_expiracion := v_source.fecha_expiracion::date,
      p_created_by := p_actor_id::text,
      p_metadata := jsonb_build_object('rma_id', p_rma_id,
        'source_movement_id', v_source.id, 'idempotency_key', v_key,
        'business_movement_type', 'RMA_RETURN_REVERSAL'),
      p_liberar_reserva := false);
    v_reversals := v_reversals || jsonb_build_array(jsonb_build_object(
      'source_movement_id', v_source.id, 'reverse_movement_id', v_reverse_id,
      'producto_id', v_source.producto_id, 'cantidad', v_source.cantidad));
  END LOOP;
  UPDATE public.rma_items
  SET cantidad_devuelta = 0, estado = 'CREADA',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'receipt_reversed_by', p_actor_id, 'receipt_reversal_key', v_key,
        'receipt_reversal_reason', v_motivo), updated_at = now()
  WHERE tenant_id = p_tenant_id AND rma_id = p_rma_id
    AND lower(estado::text) NOT IN ('rechazado', 'inactivo');
  UPDATE public.rma_solicitudes
  SET estado = 'APROBADA', recibido_por = NULL, recibido_en = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_receipt_reversal_fingerprint', v_fingerprint,
        'last_receipt_reversal_key', v_key), updated_at = now()
  WHERE id = p_rma_id AND tenant_id = p_tenant_id;
  PERFORM app.rma_insert_event_456(p_tenant_id, p_rma_id, p_actor_id,
    'RECEPCION_REVERSA', 'Recepción RMA revertida', jsonb_build_object(
      'motivo', v_motivo, 'movimientos', v_reversals, 'idempotency_key', v_key));
  v_event_key := format('rma.recepcion.revertida:%s:%s', p_tenant_id, v_key);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'rma', p_rma_id,
    'rma.recepcion.revertida', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'rmaId', p_rma_id, 'motivo', v_motivo, 'movimientos', v_reversals,
      'actorId', p_actor_id, 'idempotencyKey', v_event_key,
      'accountingHandled', false));
  v_result := jsonb_build_object('success', true, 'rma_id', p_rma_id,
    'estado', 'APROBADA', 'movimientos_reversa', v_reversals,
    'event_id', v_event_id, 'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, tipo, idempotency_key, fingerprint, actor_id,
    payload, resultado, event_id
  ) VALUES (p_tenant_id, p_rma_id, 'REVERTIR_RECEPCION', v_key,
    v_fingerprint, p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emitir_nota_credito_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
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
  v_motivo text := coalesce(nullif(btrim(p_payload->>'motivo'), ''),
    'DEVOLUCION DE MERCADERIA');
  v_tipo_nota text := coalesce(nullif(btrim(p_payload->>'tipo_nota_credito'), ''), '07');
  v_serie text := upper(nullif(btrim(p_payload->>'serie'), ''));
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_documento public.documentos%ROWTYPE;
  v_original_cpe public.cpe%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_nota public.documentos%ROWTYPE;
  v_nota_cpe public.cpe%ROWTYPE;
  v_saldo public.saldos_favor_clientes%ROWTYPE;
  v_line record;
  v_numero text;
  v_expected_series text;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_subtotal numeric(14,2) := 0;
  v_igv numeric(14,2) := 0;
  v_isc numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_gravadas numeric(14,2) := 0;
  v_exoneradas numeric(14,2) := 0;
  v_inafectas numeric(14,2) := 0;
  v_exportacion numeric(14,2) := 0;
  v_details jsonb := '[]'::jsonb;
  v_cpe_items jsonb := '[]'::jsonb;
  v_line_value numeric(14,2);
  v_line_igv numeric(14,2);
  v_line_isc numeric(14,2);
  v_line_total numeric(14,2);
  v_afectacion text;
  v_order integer := 0;
  v_pending numeric(14,2) := 0;
  v_reduction numeric(14,2) := 0;
  v_excess numeric(14,2) := 0;
  v_pending_new numeric(14,2) := 0;
  v_cost numeric(14,2) := 0;
  v_tipo_cambio numeric(18,6);
  v_local_base numeric(14,2);
  v_local_tax numeric(14,2);
  v_local_total numeric(14,2);
  v_local_reduction numeric(14,2);
  v_local_excess numeric(14,2);
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_rma_id IS NULL OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     OR length(v_motivo) NOT BETWEEN 3 AND 500 OR v_tipo_nota NOT IN ('06', '07') THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('version', 1, 'rma_id', p_rma_id,
    'motivo', v_motivo, 'tipo_nota_credito', v_tipo_nota, 'serie', v_serie);
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:RMA:NC:%s', p_tenant_id, v_key), 456));
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'EMITIR_NOTA_CREDITO'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RMA_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_rma FROM public.rma_solicitudes r
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR lower(v_rma.estado::text) <> 'recibida'
     OR v_rma.nota_credito_documento_id IS NOT NULL
     OR v_rma.nota_credito_cpe_id IS NOT NULL THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_REQUIRES_UNCREDITED_RECEIVED_STATE'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rma_items ri
    WHERE ri.tenant_id = p_tenant_id AND ri.rma_id = p_rma_id
      AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo')
      AND round(coalesce(ri.cantidad_devuelta, 0), 6)
          < round(coalesce(ri.cantidad_autorizada, 0), 6)
  ) THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_REQUIRES_FULL_AUTHORIZED_RECEIPT'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_documento FROM public.documentos d
  WHERE d.id = v_rma.documento_origen_id AND d.tenant_id = p_tenant_id
    AND d.pedido_id = v_rma.pedido_id AND d.cliente_id = v_rma.cliente_id
    AND d.tipo_documento IN ('FACTURA', 'BOLETA') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA_SOURCE_DOCUMENT_NOT_FOUND' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_original_cpe FROM public.cpe c
  WHERE c.id = v_rma.cpe_origen_id AND c.tenant_id = p_tenant_id
    AND c.documento_id = v_documento.id
    AND upper(c.tipo_documento) IN ('01', '03') FOR UPDATE;
  IF NOT FOUND OR lower(v_original_cpe.estado::text) IN ('rechazado', 'anulado', 'error') THEN
    RAISE EXCEPTION 'RMA_SOURCE_CPE_NOT_CREDITABLE' USING ERRCODE = '23514';
  END IF;
  IF (upper(v_original_cpe.tipo_documento) = '01'
        AND upper(coalesce(v_original_cpe.serie, '')) !~ '^F[A-Z0-9]{3}$')
     OR (upper(v_original_cpe.tipo_documento) = '03'
        AND upper(coalesce(v_original_cpe.serie, '')) !~ '^B[A-Z0-9]{3}$') THEN
    RAISE EXCEPTION 'RMA_SOURCE_CPE_SERIES_INVALID' USING ERRCODE = '23514';
  END IF;
  v_expected_series := CASE WHEN upper(v_original_cpe.tipo_documento) = '01'
      THEN 'FC' ELSE 'BC' END
    || lpad(right(regexp_replace(upper(v_original_cpe.serie), '[^0-9]', '', 'g'), 2), 2, '0');
  IF v_serie IS NOT NULL AND v_serie IS DISTINCT FROM v_expected_series THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_SERIES_INCOMPATIBLE: expected=% received=%',
      v_expected_series, v_serie USING ERRCODE = '23514';
  END IF;
  v_serie := v_expected_series;

  -- Reutiliza la garantía de 448 sin ejecutar su anulación total. Una NC RMA
  -- sólo puede reconocer la reversa cuando el asiento de la venta origen ya
  -- existe; la ausencia es reintentable y no deja ninguna proyección parcial.
  BEGIN
    PERFORM app.validar_contabilidad_origen_anulacion_cpe_448(
      p_tenant_id, v_original_cpe.id
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE EXCEPTION 'RMA_ORIGINAL_ACCOUNTING_PENDING_RETRY'
      USING ERRCODE = '40001', DETAIL = SQLERRM;
  END;
  IF v_rma.cxc_origen_id IS NOT NULL THEN
    SELECT * INTO v_cxc FROM public.cuentas_por_cobrar c
    WHERE c.id = v_rma.cxc_origen_id AND c.tenant_id = p_tenant_id
      AND c.documento_id = v_documento.id FOR UPDATE;
    IF NOT FOUND OR lower(v_cxc.estado::text) IN ('anulada', 'revertida') THEN
      RAISE EXCEPTION 'RMA_SOURCE_RECEIVABLE_NOT_CREDITABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  FOR v_line IN
    SELECT ri.id AS rma_item_id, ri.producto_id, ri.cantidad_devuelta,
      dd.id AS documento_detalle_id, dd.codigo_producto, dd.descripcion,
      dd.unidad_medida, dd.cantidad AS source_quantity,
      dd.precio_unitario, dd.valor_venta AS source_value,
      dd.impuesto_igv AS source_igv, dd.impuesto_isc AS source_isc,
      dd.total_item AS source_total, dd.metadata AS documento_metadata,
      ri.metadata AS rma_metadata,
      p.codigo AS producto_codigo, p.afectacion_igv
    FROM public.rma_items ri
    JOIN public.documento_detalles dd
      ON dd.id = ri.documento_detalle_id AND dd.tenant_id = p_tenant_id
       AND dd.documento_id = v_documento.id
    JOIN public.productos p
      ON p.id = ri.producto_id AND p.tenant_id = p_tenant_id
    WHERE ri.tenant_id = p_tenant_id AND ri.rma_id = p_rma_id
      AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo')
    ORDER BY dd.orden, ri.id
  LOOP
    IF coalesce(v_line.source_quantity, 0) <= 0
       OR coalesce(v_line.cantidad_devuelta, 0) <= 0
       OR v_line.cantidad_devuelta - v_line.source_quantity > 0.000001 THEN
      RAISE EXCEPTION 'RMA_CREDIT_NOTE_SOURCE_LINE_INVALID: %', v_line.rma_item_id
        USING ERRCODE = '23514';
    END IF;
    v_order := v_order + 1;
    v_line_value := round(coalesce(v_line.source_value, 0)
      * v_line.cantidad_devuelta / v_line.source_quantity, 2);
    v_line_igv := round(coalesce(v_line.source_igv, 0)
      * v_line.cantidad_devuelta / v_line.source_quantity, 2);
    v_line_isc := round(coalesce(v_line.source_isc, 0)
      * v_line.cantidad_devuelta / v_line.source_quantity, 2);
    v_line_total := round(v_line_value + v_line_igv + v_line_isc, 2);
    v_afectacion := coalesce(nullif(v_line.documento_metadata->>'afectacion_igv', ''),
      nullif(v_line.rma_metadata->>'afectacion_igv', ''),
      nullif(v_line.afectacion_igv, ''), CASE WHEN v_line_igv > 0 THEN '10' ELSE '20' END);
    v_subtotal := round(v_subtotal + v_line_value, 2);
    v_igv := round(v_igv + v_line_igv, 2);
    v_isc := round(v_isc + v_line_isc, 2);
    v_total := round(v_total + v_line_total, 2);
    IF v_afectacion LIKE '10%' THEN v_gravadas := round(v_gravadas + v_line_value, 2);
    ELSIF v_afectacion LIKE '20%' THEN v_exoneradas := round(v_exoneradas + v_line_value, 2);
    ELSIF v_afectacion LIKE '40%' THEN v_exportacion := round(v_exportacion + v_line_value, 2);
    ELSE v_inafectas := round(v_inafectas + v_line_value, 2);
    END IF;
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'orden', v_order, 'producto_id', v_line.producto_id,
      'codigo_producto', coalesce(v_line.producto_codigo, v_line.codigo_producto),
      'descripcion', v_line.descripcion, 'unidad_medida', v_line.unidad_medida,
      'cantidad', v_line.cantidad_devuelta,
      'precio_unitario', round(v_line_value / v_line.cantidad_devuelta, 6),
      'valor_venta', v_line_value, 'impuesto_igv', v_line_igv,
      'impuesto_isc', v_line_isc, 'total_item', v_line_total,
      'afectacion_igv', v_afectacion,
      'source_document_line_id', v_line.documento_detalle_id,
      'rma_item_id', v_line.rma_item_id));
    v_cpe_items := v_cpe_items || jsonb_build_array(jsonb_build_object(
      'item', v_order, 'producto_id', v_line.producto_id,
      'codigo', coalesce(v_line.producto_codigo, v_line.codigo_producto),
      'descripcion', v_line.descripcion, 'unidad_medida', v_line.unidad_medida,
      'cantidad', v_line.cantidad_devuelta,
      'valor_unitario', round(v_line_value / v_line.cantidad_devuelta, 6),
      'valor_venta', v_line_value, 'igv', v_line_igv, 'isc', v_line_isc,
      'total', v_line_total, 'afectacion_igv', v_afectacion));
  END LOOP;
  IF v_order = 0 OR v_total <= 0
     OR abs(v_total - round(v_subtotal + v_igv + v_isc, 2)) > 0.01 THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_TOTALS_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT round(coalesce(sum((mi.metadata->>'valor_total')::numeric), 0), 2)
  INTO v_cost FROM public.movimientos_inventario mi
  WHERE mi.tenant_id = p_tenant_id AND mi.tipo = 'ENTRADA'
    AND mi.referencia_tipo = 'RMA_RECEPCION'
    AND mi.metadata->>'rma_id' = p_rma_id::text
    AND NOT EXISTS (
      SELECT 1 FROM public.movimientos_inventario mr
      WHERE mr.tenant_id = p_tenant_id AND mr.tipo = 'SALIDA'
        AND mr.referencia_tipo = 'RMA_RECEPCION_REVERSA'
        AND mr.metadata->>'source_movement_id' = mi.id::text
    );
  v_pending := CASE WHEN v_cxc.id IS NULL THEN 0 ELSE round(coalesce(
    v_cxc.monto_pendiente, v_cxc.saldo_pendiente, v_cxc.saldo, 0), 2) END;
  v_reduction := least(v_total, v_pending);
  v_excess := round(v_total - v_reduction, 2);
  v_pending_new := round(v_pending - v_reduction, 2);

  IF v_serie !~ '^(FC|BC)[0-9]{2}$' THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_SERIES_INVALID' USING ERRCODE = '22023';
  END IF;
  v_numero := lpad(public.obtener_siguiente_numero_documento(
    p_tenant_id, 'NOTA_CREDITO', v_serie), 8, '0');
  IF v_numero !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_NUMBER_INVALID' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, tipo_cambio, subtotal, descuentos, impuesto_igv, impuesto_isc,
    otros_impuestos, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, emisor_ruc, emisor_razon_social,
    emisor_direccion, receptor_tipo_doc, receptor_numero_doc,
    receptor_documento, receptor_razon_social, receptor_nombre,
    receptor_direccion, pedido_id, cliente_id, metodo_pago, estado,
    estado_sunat, observaciones, created_by, updated_by, metadata,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, 'NOTA_CREDITO', v_serie, v_numero, clock_timestamp(),
    clock_timestamp(), upper(coalesce(v_documento.moneda, 'PEN')),
    coalesce(nullif(v_documento.tipo_cambio, 0), 1), v_subtotal, 0,
    v_igv, v_isc, 0, v_total, v_gravadas, v_exoneradas, v_inafectas,
    v_exportacion, v_documento.emisor_ruc, v_documento.emisor_razon_social,
    v_documento.emisor_direccion, v_documento.receptor_tipo_doc,
    coalesce(v_documento.receptor_numero_doc, v_documento.receptor_documento),
    coalesce(v_documento.receptor_documento, v_documento.receptor_numero_doc),
    coalesce(v_documento.receptor_razon_social, v_documento.receptor_nombre),
    coalesce(v_documento.receptor_nombre, v_documento.receptor_razon_social),
    v_documento.receptor_direccion, v_rma.pedido_id, v_rma.cliente_id,
    'NOTA_CREDITO', 'EMITIDO', 'PENDIENTE',
    format('NC por RMA %s; modifica %s-%s', v_rma.numero,
      v_documento.serie, v_documento.numero), p_actor_id, p_actor_id,
    jsonb_build_object('rma_id', p_rma_id,
      'source_document_id', v_documento.id, 'source_cpe_id', v_original_cpe.id,
      'tipo_nota_credito', v_tipo_nota, 'motivo_nota', v_motivo,
      'emission_fingerprint', v_fingerprint, 'idempotency_key', v_key,
      'atomic_rpc', 'emitir_nota_credito_rma_tx'), now(), now()
  ) RETURNING * INTO v_nota;

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata,
    created_at, updated_at
  )
  SELECT p_tenant_id, v_nota.id, (e->>'orden')::integer,
    nullif(e->>'producto_id', '')::uuid, e->>'codigo_producto', e->>'descripcion',
    e->>'unidad_medida', (e->>'cantidad')::numeric,
    (e->>'precio_unitario')::numeric, 0, (e->>'valor_venta')::numeric,
    (e->>'impuesto_igv')::numeric, (e->>'impuesto_isc')::numeric,
    (e->>'total_item')::numeric,
    jsonb_build_object('afectacion_igv', e->>'afectacion_igv',
      'rma_item_id', e->>'rma_item_id',
      'source_document_line_id', e->>'source_document_line_id',
      'emission_fingerprint', v_fingerprint), now(), now()
  FROM jsonb_array_elements(v_details) e;

  INSERT INTO public.cpe (
    tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, total_igv, total_venta, total, items,
    fecha_emision, fecha_vencimiento, idempotency_key, event_id, estado,
    estado_sunat, sunat_status, created_by, activo,
    documento_referencia_tipo, documento_referencia_serie,
    documento_referencia_numero, tipo_nota_credito, motivo_nota,
    metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_nota.id, '07', v_serie, v_numero, v_numero::integer,
    v_original_cpe.ruc_emisor, v_original_cpe.razon_social_emisor,
    v_original_cpe.direccion_emisor, v_original_cpe.tipo_documento_receptor,
    v_original_cpe.documento_receptor, v_original_cpe.razon_social_receptor,
    v_original_cpe.direccion_receptor, v_rma.cliente_id,
    upper(coalesce(v_documento.moneda, 'PEN')), v_gravadas, v_exoneradas,
    v_inafectas, v_exportacion, v_igv, v_total, v_total, v_cpe_items,
    clock_timestamp(), clock_timestamp()::date,
    format('rma-nc:%s:%s', p_tenant_id, p_rma_id), v_event_id,
    'BORRADOR', 'PENDIENTE', 'NOT_SENT', p_actor_id, true,
    upper(v_original_cpe.tipo_documento), upper(v_original_cpe.serie),
    lpad(btrim(v_original_cpe.numero), 8, '0'), v_tipo_nota, v_motivo,
    jsonb_build_object('rma_id', p_rma_id,
      'source_document_id', v_documento.id, 'source_cpe_id', v_original_cpe.id,
      'emission_fingerprint', v_fingerprint, 'atomic_rpc', 'emitir_nota_credito_rma_tx',
      'legal_transmission_status', 'PENDING_CUSTOMER_CREDENTIALS_OR_SIGNATURE'),
    now(), now()
  ) RETURNING * INTO v_nota_cpe;

  IF v_reduction > 0 THEN
    INSERT INTO public.cxc_pagos (
      tenant_id, cuenta_id, pedido_id, documento_id, tipo, monto, moneda,
      fecha_pago, metodo_pago, referencia, usuario_id, event_id,
      idempotency_key, source, estado, activo, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_cxc.id, v_rma.pedido_id, v_nota.id, 'NOTA_CREDITO',
      v_reduction, upper(coalesce(v_cxc.moneda, v_documento.moneda, 'PEN')),
      app.hoy_tenant(p_tenant_id), 'NOTA_CREDITO', v_serie || '-' || v_numero,
      p_actor_id, v_event_id, format('rma-nc-adjust:%s:%s', p_tenant_id, p_rma_id),
      'rma.nota_credito.atomic', 'ACTIVO', true,
      jsonb_build_object('rma_id', p_rma_id, 'nota_credito_id', v_nota.id,
        'nota_credito_cpe_id', v_nota_cpe.id, 'accountingOwner', 'nota_credito.emitida',
        'accountingHandled', false, 'request_fingerprint', v_fingerprint), now(), now());
    UPDATE public.cuentas_por_cobrar
    SET monto_pendiente = v_pending_new, saldo_pendiente = v_pending_new,
        saldo = v_pending_new,
        estado = CASE WHEN v_pending_new <= 0.009 THEN 'CANCELADO' ELSE 'PARCIAL' END,
        dias_mora = CASE WHEN v_pending_new > 0
          THEN greatest(app.hoy_tenant(p_tenant_id) - coalesce(fecha_vencimiento,
            app.hoy_tenant(p_tenant_id)), 0) ELSE 0 END,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_rma_credit_note_id', v_nota.id,
          'last_rma_credit_note_amount', v_reduction,
          'last_rma_id', p_rma_id), updated_at = now()
    WHERE id = v_cxc.id AND tenant_id = p_tenant_id RETURNING * INTO v_cxc;
  END IF;

  IF v_excess > 0 THEN
    INSERT INTO public.saldos_favor_clientes (
      tenant_id, cliente_id, rma_id, documento_origen_id,
      nota_credito_documento_id, nota_credito_cpe_id, moneda,
      tipo_cambio_origen, monto_original, monto_disponible,
      monto_local_original, monto_local_disponible,
      estado, created_by, metadata
    ) VALUES (
      p_tenant_id, v_rma.cliente_id, p_rma_id, v_documento.id,
      v_nota.id, v_nota_cpe.id, upper(coalesce(v_documento.moneda, 'PEN')),
      coalesce(nullif(v_documento.tipo_cambio, 0), 1),
      v_excess, v_excess,
      round(v_excess * coalesce(nullif(v_documento.tipo_cambio, 0), 1), 2),
      round(v_excess * coalesce(nullif(v_documento.tipo_cambio, 0), 1), 2),
      'DISPONIBLE', p_actor_id,
      jsonb_build_object('fingerprint', v_fingerprint,
        'account_code', '122', 'atomic_rpc', 'emitir_nota_credito_rma_tx')
    ) RETURNING * INTO v_saldo;
    INSERT INTO public.saldos_favor_movimientos (
      tenant_id, saldo_favor_id, tipo, monto, actor_id, idempotency_key,
      event_id, metadata
    ) VALUES (
      p_tenant_id, v_saldo.id, 'ORIGEN_NC', v_excess, p_actor_id,
      format('rma-nc-balance:%s:%s', p_tenant_id, p_rma_id), v_event_id,
      jsonb_build_object('rma_id', p_rma_id, 'nota_credito_id', v_nota.id,
        'nota_credito_cpe_id', v_nota_cpe.id, 'request_fingerprint', v_fingerprint));
  END IF;

  UPDATE public.rma_solicitudes
  SET nota_credito_documento_id = v_nota.id,
      nota_credito_cpe_id = v_nota_cpe.id, estado = 'CERRADA',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'credit_note_fingerprint', v_fingerprint,
        'credit_note_idempotency_key', v_key,
        'cxc_reduction', v_reduction, 'customer_credit_balance', v_excess,
        'atomic_rpc', 'emitir_nota_credito_rma_tx'), updated_at = now()
  WHERE id = p_rma_id AND tenant_id = p_tenant_id RETURNING * INTO v_rma;

  v_tipo_cambio := coalesce(nullif(v_documento.tipo_cambio, 0), 1);
  v_local_base := round(v_subtotal * v_tipo_cambio, 2);
  v_local_tax := round((v_igv + v_isc) * v_tipo_cambio, 2);
  v_local_total := round(v_total * v_tipo_cambio, 2);
  v_local_reduction := round(v_reduction * v_tipo_cambio, 2);
  v_local_excess := round(v_local_total - v_local_reduction, 2);
  PERFORM app.rma_insert_event_456(p_tenant_id, p_rma_id, p_actor_id,
    'NOTA_CREDITO', 'Nota de crédito emitida desde RMA', jsonb_build_object(
      'documento_id', v_nota.id, 'cpe_id', v_nota_cpe.id,
      'cxc_reduction', v_reduction, 'saldo_favor', v_excess,
      'idempotency_key', v_key));
  v_event_key := format('nota_credito.emitida:%s:%s', p_tenant_id, v_nota.id);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'nota_credito', v_nota.id,
    'nota_credito.emitida', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key, 'rmaId', p_rma_id,
      'notaCreditoId', v_nota.id, 'cpeId', v_nota_cpe.id,
      'documentoOrigenId', v_documento.id, 'cpeOrigenId', v_original_cpe.id,
      'cxcId', v_cxc.id, 'saldoFavorId', v_saldo.id,
      'serie', v_serie, 'numero', v_numero, 'fechaEmision', clock_timestamp(),
      'moneda', upper(coalesce(v_documento.moneda, 'PEN')),
      'tipoCambio', v_tipo_cambio, 'totalDocumento', v_total,
      'base_imponible', v_local_base, 'subtotal', v_local_base,
      'igv', v_local_tax, 'impuestos', v_local_tax, 'total', v_local_total,
      'monto_pendiente', v_local_reduction, 'cxcReduction', v_local_reduction,
      'customerCreditBalance', v_local_excess, 'saldoFavor', v_local_excess,
      'costo_ventas', v_cost, 'costoVentas', v_cost,
      'source', 'rma.nota_credito.atomic', 'accountingOwner', 'nota_credito.emitida',
      'actorId', p_actor_id));
  v_result := jsonb_build_object('success', true, 'rma_id', p_rma_id,
    'estado', 'CERRADA', 'nota_credito_documento_id', v_nota.id,
    'nota_credito_cpe_id', v_nota_cpe.id, 'serie', v_serie,
    'numero', v_numero, 'total', v_total, 'cxc_reduction', v_reduction,
    'saldo_favor_id', v_saldo.id, 'saldo_favor', v_excess,
    'event_id', v_event_id, 'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, saldo_favor_id, tipo, idempotency_key, fingerprint,
    actor_id, payload, resultado, event_id
  ) VALUES (p_tenant_id, p_rma_id, v_saldo.id, 'EMITIR_NOTA_CREDITO',
    v_key, v_fingerprint, p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_saldo_favor_cxc_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_saldo_id uuid,
  p_cxc_id uuid,
  p_monto numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_amount numeric(14,2) := round(coalesce(p_monto, 0), 2);
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_saldo public.saldos_favor_clientes%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_pending numeric(14,2);
  v_pending_new numeric(14,2);
  v_balance_new numeric(14,2);
  v_local_amount numeric(14,2);
  v_local_new numeric(14,2);
  v_cxc_local numeric(14,2);
  v_difference numeric(14,2);
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_movement_id uuid;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_saldo_id IS NULL OR p_cxc_id IS NULL OR v_amount <= 0
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_APPLICATION_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('version', 1, 'saldo_favor_id', p_saldo_id,
    'cxc_id', p_cxc_id, 'monto', v_amount);
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:SALDO:APLICAR:%s', p_tenant_id, v_key), 456));
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'APLICAR_SALDO'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_saldo FROM public.saldos_favor_clientes s
  WHERE s.id = p_saldo_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_saldo.estado NOT IN ('DISPONIBLE', 'PARCIAL')
     OR v_amount - v_saldo.monto_disponible > 0.01 THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_NOT_AVAILABLE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_cxc FROM public.cuentas_por_cobrar c
  WHERE c.id = p_cxc_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  v_pending := round(coalesce(v_cxc.monto_pendiente,
    v_cxc.saldo_pendiente, v_cxc.saldo, 0), 2);
  IF NOT FOUND OR lower(v_cxc.estado::text) NOT IN ('pendiente', 'parcial', 'vencida')
     OR v_cxc.cliente_id IS DISTINCT FROM v_saldo.cliente_id
     OR upper(coalesce(v_cxc.moneda, 'PEN')) <> v_saldo.moneda
     OR v_amount - v_pending > 0.01 THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_TARGET_RECEIVABLE_INVALID' USING ERRCODE = '23514';
  END IF;
  v_balance_new := round(v_saldo.monto_disponible - v_amount, 2);
  v_local_amount := CASE WHEN v_balance_new <= 0.009
    THEN v_saldo.monto_local_disponible
    ELSE round(v_amount * v_saldo.tipo_cambio_origen, 2) END;
  v_local_new := round(v_saldo.monto_local_disponible - v_local_amount, 2);
  v_pending_new := round(v_pending - v_amount, 2);
  v_cxc_local := round(v_amount * coalesce(nullif(v_cxc.tipo_cambio_origen, 0),
    CASE WHEN v_saldo.moneda = 'PEN' THEN 1 ELSE v_saldo.tipo_cambio_origen END), 2);
  v_difference := round(v_cxc_local - v_local_amount, 2);
  UPDATE public.saldos_favor_clientes
  SET monto_disponible = v_balance_new, monto_local_disponible = v_local_new,
      estado = CASE WHEN v_balance_new <= 0.009 THEN 'AGOTADO' ELSE 'PARCIAL' END,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_application_key', v_key, 'last_application_cxc_id', p_cxc_id),
      updated_at = now()
  WHERE id = p_saldo_id AND tenant_id = p_tenant_id RETURNING * INTO v_saldo;
  UPDATE public.cuentas_por_cobrar
  SET monto_pendiente = v_pending_new, saldo_pendiente = v_pending_new,
      saldo = v_pending_new,
      estado = CASE WHEN v_pending_new <= 0.009 THEN 'CANCELADO' ELSE 'PARCIAL' END,
      dias_mora = CASE WHEN v_pending_new > 0
        THEN greatest(app.hoy_tenant(p_tenant_id) - coalesce(fecha_vencimiento,
          app.hoy_tenant(p_tenant_id)), 0) ELSE 0 END,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_customer_credit_id', p_saldo_id,
        'last_customer_credit_amount', v_amount), updated_at = now()
  WHERE id = p_cxc_id AND tenant_id = p_tenant_id RETURNING * INTO v_cxc;
  INSERT INTO public.saldos_favor_movimientos (
    tenant_id, saldo_favor_id, tipo, monto, cxc_id, actor_id,
    idempotency_key, event_id, metadata
  ) VALUES (
    p_tenant_id, p_saldo_id, 'APLICACION_CXC', v_amount, p_cxc_id,
    p_actor_id, v_key, v_event_id,
    jsonb_build_object('request_fingerprint', v_fingerprint,
      'monto_local_pasivo', v_local_amount, 'monto_local_cxc', v_cxc_local,
      'diferencia_cambio', v_difference, 'accountingOwner', 'saldo_favor.aplicado')
  ) RETURNING id INTO v_movement_id;
  v_event_key := format('saldo_favor.aplicado:%s:%s', p_tenant_id, v_movement_id);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'saldo_favor', p_saldo_id,
    'saldo_favor.aplicado', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key, 'saldoFavorId', p_saldo_id,
      'movimientoId', v_movement_id, 'cxcId', p_cxc_id,
      'clienteId', v_saldo.cliente_id, 'moneda', v_saldo.moneda,
      'monto', v_amount, 'montoPasivo', v_local_amount,
      'montoCxc', v_cxc_local, 'diferenciaCambio', v_difference,
      'fecha', clock_timestamp(), 'referencia', format('SALDO-%s', p_saldo_id),
      'accountingOwner', 'saldo_favor.aplicado', 'actorId', p_actor_id));
  v_result := jsonb_build_object('success', true, 'saldo_favor_id', p_saldo_id,
    'movimiento_id', v_movement_id, 'cxc_id', p_cxc_id,
    'monto_aplicado', v_amount, 'saldo_disponible', v_balance_new,
    'cxc_saldo_pendiente', v_pending_new, 'event_id', v_event_id,
    'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, saldo_favor_id, tipo, idempotency_key, fingerprint,
    actor_id, payload, resultado, event_id
  ) VALUES (p_tenant_id, v_saldo.rma_id, p_saldo_id, 'APLICAR_SALDO',
    v_key, v_fingerprint, p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reembolsar_saldo_favor_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_saldo_id uuid,
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
  v_amount numeric(14,2) := round(coalesce(nullif(p_payload->>'monto', '')::numeric, 0), 2);
  v_method text := upper(coalesce(nullif(btrim(p_payload->>'medio'), ''), ''));
  v_session_id uuid := nullif(p_payload->>'sesion_caja_id', '')::uuid;
  v_bank_id uuid := nullif(p_payload->>'cuenta_bancaria_id', '')::uuid;
  v_reference text := nullif(btrim(coalesce(p_payload->>'referencia', '')), '');
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.rma_operaciones%ROWTYPE;
  v_saldo public.saldos_favor_clientes%ROWTYPE;
  v_session public.sesiones_caja%ROWTYPE;
  v_cash public.movimientos_caja%ROWTYPE;
  v_bank public.cuentas_bancarias%ROWTYPE;
  v_bank_movement public.movimientos_bancarios%ROWTYPE;
  v_balance_new numeric(14,2);
  v_local_amount numeric(14,2);
  v_local_new numeric(14,2);
  v_valuation jsonb;
  v_settlement_rate numeric(18,6);
  v_treasury_local numeric(14,2);
  v_difference numeric(14,2);
  v_bank_previous numeric(14,2);
  v_bank_new numeric(14,2);
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_movement_id uuid;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_saldo_id IS NULL OR v_amount <= 0 OR v_method NOT IN ('CAJA', 'BANCO')
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR (v_method = 'CAJA' AND (v_session_id IS NULL OR v_bank_id IS NOT NULL))
     OR (v_method = 'BANCO' AND (v_bank_id IS NULL OR v_session_id IS NOT NULL OR v_reference IS NULL)) THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_canonical := jsonb_build_object('version', 1, 'saldo_favor_id', p_saldo_id,
    'monto', v_amount, 'medio', v_method, 'sesion_caja_id', v_session_id,
    'cuenta_bancaria_id', v_bank_id, 'referencia', v_reference);
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:SALDO:REEMBOLSAR:%s', p_tenant_id, v_key), 456));
  SELECT * INTO v_operacion FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.tipo = 'REEMBOLSAR_SALDO'
    AND lower(o.idempotency_key) = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_saldo FROM public.saldos_favor_clientes s
  WHERE s.id = p_saldo_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_saldo.estado NOT IN ('DISPONIBLE', 'PARCIAL')
     OR v_amount - v_saldo.monto_disponible > 0.01 THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_NOT_AVAILABLE' USING ERRCODE = '23514';
  END IF;
  v_balance_new := round(v_saldo.monto_disponible - v_amount, 2);
  v_local_amount := CASE WHEN v_balance_new <= 0.009
    THEN v_saldo.monto_local_disponible
    ELSE round(v_amount * v_saldo.tipo_cambio_origen, 2) END;
  v_local_new := round(v_saldo.monto_local_disponible - v_local_amount, 2);
  v_valuation := app.treasury_valuation_452(p_tenant_id, 'CXC', v_saldo.moneda,
    v_saldo.tipo_cambio_origen, v_saldo.created_at::date, app.hoy_tenant(p_tenant_id));
  v_settlement_rate := (v_valuation->>'tipo_cambio_liquidacion')::numeric;
  v_treasury_local := round(v_amount * v_settlement_rate, 2);
  v_difference := round(v_treasury_local - v_local_amount, 2);

  IF v_method = 'CAJA' THEN
    v_session := app.resolve_cash_session_452(p_tenant_id, p_actor_id,
      v_session_id, v_saldo.moneda);
    v_cash := app.append_cash_movement_452(v_session, p_actor_id, v_amount,
      'OUT', 'saldo_favor_reembolso', p_saldo_id::text,
      format('Reembolso de saldo a favor del cliente %s', v_saldo.cliente_id),
      jsonb_build_object('saldo_favor_id', p_saldo_id,
        'request_fingerprint', v_fingerprint, 'idempotency_key', v_key));
    v_movement_id := v_cash.id;
  ELSE
    SELECT * INTO v_bank FROM public.cuentas_bancarias b
    WHERE b.id = v_bank_id AND b.tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_bank.activa, v_bank.activo, false)
       OR upper(coalesce(v_bank.estado, '')) <> 'ACTIVO'
       OR upper(coalesce(v_bank.moneda, 'PEN')) <> v_saldo.moneda THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_BANK_INVALID' USING ERRCODE = '23514';
    END IF;
    v_bank_previous := round(coalesce(v_bank.saldo, v_bank.saldo_actual, 0), 2);
    v_bank_new := round(v_bank_previous - v_amount, 2);
    IF v_bank_new < 0 AND NOT coalesce(v_bank.permite_sobregiro, false) THEN
      RAISE EXCEPTION 'CUSTOMER_CREDIT_REFUND_BANK_FUNDS_INSUFFICIENT'
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.movimientos_bancarios (
      tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, cliente_id, conciliado, saldo_anterior,
      saldo_nuevo, idempotency_key, created_by, metadata
    ) VALUES (
      p_tenant_id, v_bank.id, 'CARGO', v_amount, app.hoy_tenant(p_tenant_id),
      format('Reembolso saldo a favor cliente %s', v_saldo.cliente_id),
      v_reference, 'REEMBOLSO_SALDO_FAVOR', v_saldo.cliente_id, false,
      v_bank_previous, v_bank_new, v_key || ':bank', p_actor_id,
      jsonb_build_object('saldo_favor_id', p_saldo_id,
        'request_fingerprint', v_fingerprint, 'event_id', v_event_id)
    ) RETURNING * INTO v_bank_movement;
    UPDATE public.cuentas_bancarias
    SET saldo = v_bank_new, saldo_actual = v_bank_new,
        saldo_contable = v_bank_new, updated_at = now(), updated_by = p_actor_id
    WHERE id = v_bank.id AND tenant_id = p_tenant_id;
    v_movement_id := v_bank_movement.id;
  END IF;

  UPDATE public.saldos_favor_clientes
  SET monto_disponible = v_balance_new, monto_local_disponible = v_local_new,
      estado = CASE WHEN v_balance_new <= 0.009 THEN 'AGOTADO' ELSE 'PARCIAL' END,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_refund_key', v_key, 'last_refund_method', v_method), updated_at = now()
  WHERE id = p_saldo_id AND tenant_id = p_tenant_id RETURNING * INTO v_saldo;
  INSERT INTO public.saldos_favor_movimientos (
    tenant_id, saldo_favor_id, tipo, monto, movimiento_caja_id,
    movimiento_bancario_id, actor_id, idempotency_key, event_id, metadata
  ) VALUES (
    p_tenant_id, p_saldo_id,
    CASE WHEN v_method = 'CAJA' THEN 'REEMBOLSO_CAJA' ELSE 'REEMBOLSO_BANCO' END,
    v_amount, v_cash.id, v_bank_movement.id, p_actor_id, v_key, v_event_id,
    jsonb_build_object('request_fingerprint', v_fingerprint,
      'monto_local_pasivo', v_local_amount, 'monto_local_tesoreria', v_treasury_local,
      'diferencia_cambio', v_difference, 'accountingOwner', 'saldo_favor.reembolsado')
  ) RETURNING id INTO v_movement_id;
  v_event_key := format('saldo_favor.reembolsado:%s:%s', p_tenant_id, v_movement_id);
  PERFORM app.rma_insert_outbox_456(p_tenant_id, 'saldo_favor', p_saldo_id,
    'saldo_favor.reembolsado', v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key, 'saldoFavorId', p_saldo_id,
      'movimientoId', v_movement_id, 'clienteId', v_saldo.cliente_id,
      'medio', v_method, 'sesionCajaId', v_cash.sesion_caja_id,
      'cuentaBancariaId', v_bank.id, 'movimientoTesoreriaId',
        coalesce(v_cash.id, v_bank_movement.id),
      'moneda', v_saldo.moneda, 'monto', v_amount,
      'montoPasivo', v_local_amount, 'montoTesoreria', v_treasury_local,
      'diferenciaCambio', v_difference, 'fecha', clock_timestamp(),
      'referencia', coalesce(v_reference, format('SALDO-%s', p_saldo_id)),
      'accountingOwner', 'saldo_favor.reembolsado', 'actorId', p_actor_id));
  v_result := jsonb_build_object('success', true, 'saldo_favor_id', p_saldo_id,
    'movimiento_id', v_movement_id, 'medio', v_method,
    'movimiento_caja_id', v_cash.id,
    'movimiento_bancario_id', v_bank_movement.id,
    'monto_reembolsado', v_amount, 'saldo_disponible', v_balance_new,
    'event_id', v_event_id, 'idempotent', false);
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, saldo_favor_id, tipo, idempotency_key, fingerprint,
    actor_id, payload, resultado, event_id
  ) VALUES (p_tenant_id, v_saldo.rma_id, p_saldo_id, 'REEMBOLSAR_SALDO',
    v_key, v_fingerprint, p_actor_id, v_canonical, v_result, v_event_id);
  RETURN v_result;
END;
$function$;

-- Solo el backend con service_role puede atravesar las fronteras transaccionales.
REVOKE ALL ON FUNCTION app.assert_rma_actor_456(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.rma_fingerprint_456(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.rma_insert_event_456(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.rma_insert_outbox_456(uuid,text,uuid,text,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_rma_tx(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decidir_rma_tx(uuid,uuid,uuid,boolean,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recepcionar_rma_tx(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_recepcion_rma_tx(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_rma_tx(uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decidir_rma_tx(uuid,uuid,uuid,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recepcionar_rma_tx(uuid,uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_recepcion_rma_tx(uuid,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text) TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.rma_solicitudes, public.rma_items, public.rma_eventos,
  public.rma_operaciones, public.saldos_favor_clientes,
  public.saldos_favor_movimientos
FROM anon, authenticated;

COMMENT ON FUNCTION public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)
IS 'Cierra una RMA recibida creando documento NC, CPE 07, ajuste CxC, saldo a favor y outbox contable en un commit; no transmite legalmente.';
COMMENT ON TABLE public.saldos_favor_clientes
IS 'Pasivo/saldo a favor durable originado por NC cuando la devolución excede la CxC abierta.';

COMMIT;
