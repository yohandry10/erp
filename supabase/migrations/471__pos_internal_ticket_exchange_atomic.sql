-- ============================================================================
-- 471__pos_internal_ticket_exchange_atomic.sql
-- Venta POS como ticket interno real y canje fiscal posterior 01/03.
-- El ticket reconoce inventario, cobro/CxC, caja y contabilidad una sola vez.
-- El canje sólo reserva documento/CPE fiscal y relinkea la referencia de CxC.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)') IS NULL
     OR to_regprocedure('app.es_precio_pos_comercial_valido_469(uuid,uuid,uuid,text,jsonb,date)') IS NULL THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_REQUIRES_451_AND_469';
  END IF;
END;
$preflight$;

ALTER TABLE public.ventas_pos
  ADD COLUMN IF NOT EXISTS ticket_documento_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_emision text,
  ADD COLUMN IF NOT EXISTS canjeado_at timestamptz;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_pos_ticket_documento_fkey_471'
      AND conrelid = 'public.ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ventas_pos_ticket_documento_fkey_471
      FOREIGN KEY (ticket_documento_id)
      REFERENCES public.documentos(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ventas_pos_tipo_emision_471'
      AND conrelid = 'public.ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_tipo_emision_471 CHECK (
        tipo_emision IS NULL OR tipo_emision IN (
          'TICKET', 'FISCAL_INMEDIATO', 'TICKET_CANJEADO'
        )
      ) NOT VALID;
  END IF;
END;
$constraints$;

UPDATE public.ventas_pos v
SET tipo_emision = CASE
  WHEN v.cpe_data IS NULL
    AND v.cpe_id IS NULL
    AND NOT coalesce(v.cpe_pendiente, false)
    AND EXISTS (
      SELECT 1
      FROM public.documentos d
      WHERE d.id = v.documento_id
        AND d.tenant_id = v.tenant_id
        AND upper(coalesce(d.tipo_documento, '')) = 'TICKET'
    ) THEN 'TICKET'
  ELSE 'FISCAL_INMEDIATO'
END
WHERE v.tipo_emision IS NULL;

UPDATE public.ventas_pos v
SET ticket_documento_id = v.documento_id
FROM public.documentos d
WHERE v.ticket_documento_id IS NULL
  AND d.id = v.documento_id
  AND d.tenant_id = v.tenant_id
  AND upper(coalesce(d.tipo_documento, '')) = 'TICKET';

CREATE TABLE IF NOT EXISTS public.pos_ticket_canjes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  venta_pos_id uuid NOT NULL REFERENCES public.ventas_pos(id) ON DELETE RESTRICT,
  ticket_documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE RESTRICT,
  documento_fiscal_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE RESTRICT,
  tipo_documento text NOT NULL,
  serie text NOT NULL,
  numero text NOT NULL,
  receptor_cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  receptor_tipo_documento text NOT NULL,
  receptor_documento text NOT NULL,
  receptor_nombre text NOT NULL,
  receptor_direccion text,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  resultado jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'RESERVADO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_pos_ticket_canje_sale_471 UNIQUE (tenant_id, venta_pos_id),
  CONSTRAINT ux_pos_ticket_canje_key_471 UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ux_pos_ticket_canje_documento_471 UNIQUE (tenant_id, documento_fiscal_id),
  CONSTRAINT ux_pos_ticket_canje_numero_471 UNIQUE (tenant_id, tipo_documento, serie, numero),
  CONSTRAINT ck_pos_ticket_canje_type_471 CHECK (tipo_documento IN ('01', '03')),
  CONSTRAINT ck_pos_ticket_canje_series_471 CHECK (
    (tipo_documento = '01' AND serie ~ '^F[A-Z0-9]{3}$') OR
    (tipo_documento = '03' AND serie ~ '^B[A-Z0-9]{3}$')
  ),
  CONSTRAINT ck_pos_ticket_canje_number_471 CHECK (numero ~ '^[0-9]{8}$'),
  CONSTRAINT ck_pos_ticket_canje_state_471 CHECK (estado IN ('RESERVADO')),
  CONSTRAINT ck_pos_ticket_canje_identity_471 CHECK (
    length(btrim(idempotency_key)) BETWEEN 1 AND 200
    AND request_fingerprint ~ '^[0-9a-f]{64}$'
    AND length(btrim(receptor_nombre)) BETWEEN 1 AND 300
  )
);

CREATE INDEX IF NOT EXISTS idx_pos_ticket_canjes_ticket_471
  ON public.pos_ticket_canjes (tenant_id, ticket_documento_id);

ALTER TABLE public.pos_ticket_canjes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_ticket_canjes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_ticket_canjes_tenant_471 ON public.pos_ticket_canjes;
CREATE POLICY pos_ticket_canjes_tenant_471
ON public.pos_ticket_canjes
USING (
  tenant_id = app.current_tenant_id()
)
WITH CHECK (
  tenant_id = app.current_tenant_id()
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ventas_pos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_ticket_canjes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pos_ticket_canjes TO service_role;

CREATE OR REPLACE FUNCTION app.validar_ruc_peru_471(p_ruc text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_ruc text := btrim(p_ruc);
  v_factores integer[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
  v_suma integer := 0;
  v_resto integer;
  v_digito integer;
  i integer;
BEGIN
  IF v_ruc !~ '^[0-9]{11}$' OR left(v_ruc, 2) NOT IN ('10','15','17','20') THEN
    RETURN false;
  END IF;
  FOR i IN 1..10 LOOP
    v_suma := v_suma + substring(v_ruc, i, 1)::integer * v_factores[i];
  END LOOP;
  v_resto := 11 - (v_suma % 11);
  v_digito := CASE WHEN v_resto = 10 THEN 0 WHEN v_resto = 11 THEN 1 ELSE v_resto END;
  RETURN v_digito = right(v_ruc, 1)::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION app.pos_ticket_receiver_valid_471(
  p_tipo_documento text,
  p_numero text,
  p_total numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT CASE upper(btrim(coalesce(p_tipo_documento, '')))
    WHEN '6' THEN app.validar_ruc_peru_471(btrim(coalesce(p_numero, '')))
    WHEN '1' THEN btrim(coalesce(p_numero, '')) ~ '^[0-9]{8}$'
    WHEN '4' THEN upper(btrim(coalesce(p_numero, ''))) ~ '^[A-Z0-9]{8,12}$'
    WHEN '7' THEN upper(btrim(coalesce(p_numero, ''))) ~ '^[A-Z0-9]{6,12}$'
    WHEN '0' THEN coalesce(p_total, 0) <= 700
      AND btrim(coalesce(p_numero, '')) IN ('-', '00000000')
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION app.pos_ticket_items_cpe_471(p_venta_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', d.producto_id,
    'codigo', coalesce(d.codigo_producto, 'PROD'),
    'descripcion', coalesce(d.nombre_producto, 'Producto'),
    'unidad', coalesce(d.unidad_medida, 'NIU'),
    'cantidad', round(d.cantidad, 6),
    'precio_unitario', round(d.subtotal / nullif(d.cantidad, 0), 6),
    'valor_unitario', round(d.subtotal / nullif(d.cantidad, 0), 6),
    'precio_venta', round(d.total / nullif(d.cantidad, 0), 6),
    'descuento', round(coalesce(d.descuento, 0), 2),
    'descuento_unitario', round(coalesce(d.descuento, 0) / nullif(d.cantidad, 0), 6),
    'valor_venta', round(d.subtotal, 2),
    'igv', round(coalesce(d.impuesto, 0), 2),
    'impuesto_igv', round(coalesce(d.impuesto, 0), 2),
    'total', round(d.total, 2),
    'total_item', round(d.total, 2),
    'afectacion_igv', coalesce(d.afectacion_igv, '10'),
    'tipo_afectacion_igv', coalesce(d.afectacion_igv, '10')
  ) ORDER BY d.item_index, d.id), '[]'::jsonb)
  FROM public.detalle_ventas_pos d
  WHERE d.tenant_id = p_tenant_id
    AND coalesce(d.venta_pos_id, d.venta_id) = p_venta_id;
$function$;

CREATE OR REPLACE FUNCTION app.pos_ticket_sale_postconditions_471(
  p_venta public.ventas_pos
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_count integer;
  v_expected_physical integer;
  v_actual_physical integer;
  v_paid numeric;
  v_cash_paid numeric;
  v_cash_recorded numeric;
  v_canje public.pos_ticket_canjes%ROWTYPE;
BEGIN
  IF p_venta.request_fingerprint IS NULL
     OR p_venta.atomic_result IS NULL
     OR p_venta.accounting_event_id IS NULL
     OR p_venta.ticket_documento_id IS NULL
     OR p_venta.documento_id IS NULL
     OR p_venta.tipo_emision NOT IN ('TICKET', 'TICKET_CANJEADO') THEN
    RAISE EXCEPTION 'POS_TICKET_SALE_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = p_venta.ticket_documento_id
      AND d.tenant_id = p_venta.tenant_id
      AND upper(coalesce(d.tipo_documento, '')) = 'TICKET'
      AND d.serie = p_venta.serie
      AND d.numero = lpad(p_venta.correlativo, 8, '0')
      AND abs(coalesce(d.total, 0) - coalesce(p_venta.total, 0)) <= 0.01
  ) THEN
    RAISE EXCEPTION 'POS_TICKET_DOCUMENT_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_canje
  FROM public.pos_ticket_canjes c
  WHERE c.tenant_id = p_venta.tenant_id AND c.venta_pos_id = p_venta.id;

  IF p_venta.tipo_emision = 'TICKET' THEN
    IF FOUND OR p_venta.documento_id IS DISTINCT FROM p_venta.ticket_documento_id
       OR p_venta.cpe_data IS NOT NULL OR coalesce(p_venta.cpe_pendiente, false)
       OR p_venta.cpe_id IS NOT NULL OR p_venta.canjeado_at IS NOT NULL THEN
      RAISE EXCEPTION 'POS_TICKET_PRE_EXCHANGE_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT FOUND
       OR p_venta.documento_id IS DISTINCT FROM v_canje.documento_fiscal_id
       OR v_canje.ticket_documento_id IS DISTINCT FROM p_venta.ticket_documento_id
       OR app.to_uuid_or_null(coalesce(p_venta.cpe_data->>'documento_id', ''))
          IS DISTINCT FROM v_canje.documento_fiscal_id
       OR p_venta.cpe_data->>'tipo_documento' IS DISTINCT FROM v_canje.tipo_documento
       OR p_venta.cpe_data->>'serie' IS DISTINCT FROM v_canje.serie
       OR lpad(coalesce(p_venta.cpe_data->>'numero', ''), 8, '0') <> v_canje.numero
       OR p_venta.cliente_id IS DISTINCT FROM v_canje.receptor_cliente_id
       OR btrim(coalesce(p_venta.cliente_documento, ''))
          IS DISTINCT FROM v_canje.receptor_documento
       OR btrim(coalesce(p_venta.cliente_nombre, ''))
          IS DISTINCT FROM v_canje.receptor_nombre
       OR (p_venta.cpe_id IS NULL AND NOT coalesce(p_venta.cpe_pendiente, false))
       OR p_venta.canjeado_at IS NULL THEN
      RAISE EXCEPTION 'POS_TICKET_EXCHANGE_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.documentos d
      WHERE d.id = p_venta.ticket_documento_id
        AND d.tenant_id = p_venta.tenant_id
        AND app.to_uuid_or_null(coalesce(d.metadata->>'documento_fiscal_id', ''))
            IS NOT DISTINCT FROM v_canje.documento_fiscal_id
        AND app.to_uuid_or_null(coalesce(d.metadata->>'canje_id', ''))
            IS NOT DISTINCT FROM v_canje.id
    ) THEN
      RAISE EXCEPTION 'POS_TICKET_TRACEABILITY_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.outbox_events o
  WHERE o.tenant_id = p_venta.tenant_id
    AND o.event_id = p_venta.accounting_event_id
    AND o.event_type = 'pos.venta.registrada'
    AND o.aggregate_id = p_venta.id::text;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POS_TICKET_ACCOUNTING_OUTBOX_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT d.producto_id), count(DISTINCT d.movimiento_id)
    INTO v_expected_physical, v_actual_physical
  FROM public.detalle_ventas_pos d
  WHERE d.tenant_id = p_venta.tenant_id
    AND coalesce(d.venta_pos_id, d.venta_id) = p_venta.id
    AND d.controla_stock AND NOT d.es_servicio;
  IF v_expected_physical <> v_actual_physical OR EXISTS (
    SELECT 1
    FROM (
      SELECT d.producto_id
      FROM public.detalle_ventas_pos d
      LEFT JOIN public.movimientos_inventario m
        ON m.id = d.movimiento_id
       AND m.tenant_id = d.tenant_id
       AND m.producto_id = d.producto_id
       AND m.referencia_id = p_venta.id
       AND m.referencia_tipo = 'VENTA_POS'
       AND m.tipo = 'SALIDA'
      WHERE d.tenant_id = p_venta.tenant_id
        AND coalesce(d.venta_pos_id, d.venta_id) = p_venta.id
        AND d.controla_stock AND NOT d.es_servicio
      GROUP BY d.producto_id, m.id, m.cantidad
      HAVING m.id IS NULL
        OR abs(coalesce(m.cantidad, 0) - sum(d.cantidad)) > 0.000001
    ) invalid_inventory
  ) OR EXISTS (
    SELECT 1 FROM public.detalle_ventas_pos d
    WHERE d.tenant_id = p_venta.tenant_id
      AND coalesce(d.venta_pos_id, d.venta_id) = p_venta.id
      AND NOT d.controla_stock AND d.movimiento_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'POS_TICKET_INVENTORY_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(p.monto), 0),
         coalesce(sum(p.monto) FILTER (WHERE upper(p.metodo_pago_tipo) = 'EFECTIVO'), 0)
    INTO v_paid, v_cash_paid
  FROM public.ventas_pos_pagos p
  WHERE p.tenant_id = p_venta.tenant_id AND p.venta_pos_id = p_venta.id;
  IF abs(v_paid - p_venta.total) > 0.01 THEN
    RAISE EXCEPTION 'POS_TICKET_PAYMENT_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), coalesce(sum(m.monto), 0)
    INTO v_count, v_cash_recorded
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_venta.tenant_id
    AND m.sesion_caja_id = p_venta.sesion_caja_id
    AND m.referencia_tipo = 'venta_pos'
    AND m.referencia_documento = p_venta.id::text
    AND m.tipo_movimiento = 'VENTA';
  IF (v_cash_paid > 0 AND (v_count <> 1 OR abs(v_cash_recorded - v_cash_paid) > 0.01))
     OR (v_cash_paid = 0 AND v_count <> 0) THEN
    RAISE EXCEPTION 'POS_TICKET_CASH_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  IF p_venta.credito_monto > 0 THEN
    IF p_venta.cuenta_por_cobrar_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.cuentas_por_cobrar c
      WHERE c.id = p_venta.cuenta_por_cobrar_id
        AND c.tenant_id = p_venta.tenant_id
        AND c.documento_id = p_venta.documento_id
        AND abs(coalesce(c.monto_pendiente, 0) - p_venta.credito_monto) <= 0.01
    ) THEN
      RAISE EXCEPTION 'POS_TICKET_CXC_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
  ELSIF p_venta.cuenta_por_cobrar_id IS NOT NULL THEN
    RAISE EXCEPTION 'POS_TICKET_UNEXPECTED_CXC_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.pos_registrar_ticket_atomic_tx_471(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_items jsonb := app.pos_items_canonical_451(p_payload->'items');
  v_pagos_input jsonb := app.pos_payments_canonical_451(p_payload->'pagos');
  v_fingerprint text;
  v_existing public.ventas_pos%ROWTYPE;
  v_sesion public.sesiones_caja%ROWTYPE;
  v_caja public.cajas%ROWTYPE;
  v_empresa public.empresa_config%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_item jsonb;
  v_pago jsonb;
  v_metodo public.metodos_pago%ROWTYPE;
  v_pagos_resueltos jsonb := '[]'::jsonb;
  v_cantidad numeric;
  v_precio numeric;
  v_precio_catalogo numeric;
  v_descuento numeric;
  v_subtotal_item numeric;
  v_igv_item numeric;
  v_igv_esperado numeric;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric;
  v_costo_ventas numeric := 0;
  v_tasa_igv numeric;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN'));
  v_ticket_serie text := upper(coalesce(nullif(btrim(p_payload->>'ticket_serie'), ''), 'T001'));
  v_ticket_correlativo text;
  v_ticket text;
  v_venta public.ventas_pos%ROWTYPE;
  v_documento_id uuid;
  v_detalle_id uuid;
  v_item_index integer := 0;
  v_movimiento_id uuid;
  v_cash_movement public.movimientos_caja%ROWTYPE;
  v_efectivo numeric := 0;
  v_credito numeric := 0;
  v_pagos_total numeric := 0;
  v_cxc_id uuid;
  v_cxc_event_id uuid := gen_random_uuid();
  v_accounting_event_id uuid := gen_random_uuid();
  v_accounting_key text;
  v_payment_count integer := 0;
  v_metodo_principal text;
  v_limite_credito numeric;
  v_saldo_cliente numeric;
  v_fecha date := app.hoy_tenant(p_tenant_id);
  v_fecha_vencimiento date;
  v_result jsonb;
  v_items_result jsonb;
  v_cliente_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', ''));
  v_cliente_documento text := btrim(coalesce(p_payload->>'cliente_documento', ''));
  v_cliente_nombre text := btrim(coalesce(p_payload->>'cliente_nombre', ''));
  v_cliente_tipo text := upper(btrim(coalesce(p_payload->>'cliente_tipo_documento', '')));
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_usuario_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'POS_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'items', 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'POS_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_items) > 999 THEN
    RAISE EXCEPTION 'POS_ITEMS_LIMIT_EXCEEDED' USING ERRCODE = '22023';
  END IF;
  IF v_moneda !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'POS_CURRENCY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_ticket_serie !~ '^T[A-Z0-9]{3}$' THEN
    RAISE EXCEPTION 'POS_INTERNAL_TICKET_SERIES_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_cliente_documento = '' OR v_cliente_nombre = '' THEN
    RAISE EXCEPTION 'POS_TICKET_CUSTOMER_SNAPSHOT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_cliente_tipo = '' THEN
    v_cliente_tipo := CASE
      WHEN app.validar_ruc_peru_471(v_cliente_documento) THEN '6'
      WHEN v_cliente_documento ~ '^[0-9]{8}$' THEN '1'
      ELSE '0'
    END;
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'actor_id', p_usuario_id,
    'sesion_caja_id', p_sesion_caja_id,
    'cliente_id', v_cliente_id,
    'cliente_documento', v_cliente_documento,
    'cliente_tipo_documento', v_cliente_tipo,
    'cliente_nombre', v_cliente_nombre,
    'items', v_items,
    'pagos', v_pagos_input,
    'metodo_pago', lower(btrim(coalesce(p_payload->>'metodo_pago', ''))),
    'moneda', v_moneda,
    'ticket_serie', v_ticket_serie,
    'emitir_cpe', false
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos.sale:' || p_tenant_id::text || ':' || v_key, 451
  ));

  SELECT * INTO v_existing
  FROM public.ventas_pos vp
  WHERE vp.tenant_id = p_tenant_id AND vp.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.usuario_id IS DISTINCT FROM p_usuario_id
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    PERFORM app.pos_ticket_sale_postconditions_471(v_existing);
    RETURN v_existing.atomic_result || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_caja s
  WHERE s.id = p_sesion_caja_id AND s.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND
     OR upper(coalesce(v_sesion.estado::text, '')) <> 'ABIERTA'
     OR v_sesion.hora_cierre IS NOT NULL
     OR v_sesion.fecha_cierre IS NOT NULL
     OR coalesce(v_sesion.congelada, false) THEN
    RAISE EXCEPTION 'POS_OPEN_CASH_SESSION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_sesion.cajero_id, v_sesion.usuario_id) IS DISTINCT FROM p_usuario_id THEN
    RAISE EXCEPTION 'POS_CASH_SESSION_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caja
  FROM public.cajas c
  WHERE c.id = v_sesion.caja_id
    AND c.tenant_id = p_tenant_id
    AND upper(coalesce(c.estado::text, '')) = 'ACTIVO'
  FOR SHARE;
  IF NOT FOUND OR v_caja.almacen_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_caja.almacen_id AND a.tenant_id = p_tenant_id
      AND coalesce(a.activo, true)
  ) THEN
    RAISE EXCEPTION 'POS_CASH_REGISTER_WAREHOUSE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_empresa
  FROM public.empresa_config e
  WHERE e.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND OR nullif(btrim(v_empresa.ruc), '') IS NULL
     OR nullif(btrim(v_empresa.razon_social), '') IS NULL THEN
    RAISE EXCEPTION 'POS_COMPANY_CONFIGURATION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  IF upper(coalesce(v_empresa.moneda_defecto, v_moneda)) <> v_moneda THEN
    RAISE EXCEPTION 'POS_CURRENCY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  v_tasa_igv := greatest(0, coalesce(v_empresa.igv_porcentaje, 18) / 100);

  IF v_cliente_id IS NOT NULL THEN
    SELECT * INTO v_cliente FROM public.clientes c
    WHERE c.id = v_cliente_id AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
      AND upper(coalesce(c.estado::text, 'ACTIVO')) = 'ACTIVO'
    FOR SHARE;
    IF NOT FOUND OR nullif(v_cliente.documento_identidad, '') IS DISTINCT FROM v_cliente_documento THEN
      RAISE EXCEPTION 'POS_CUSTOMER_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  PERFORM p.id
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND p.id IN (
      SELECT app.to_uuid_or_null(coalesce(x->>'producto_id', ''))
      FROM jsonb_array_elements(v_items) x
    )
  ORDER BY p.id
  FOR UPDATE;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    SELECT * INTO v_producto
    FROM public.productos p
    WHERE p.id = app.to_uuid_or_null(coalesce(v_item->>'producto_id', ''))
      AND p.tenant_id = p_tenant_id;
    IF NOT FOUND OR NOT coalesce(v_producto.activo, true)
       OR upper(coalesce(v_producto.estado::text, 'ACTIVO')) = 'INACTIVO' THEN
      RAISE EXCEPTION 'POS_PRODUCT_NOT_ACTIVE_IN_TENANT: %', v_item->>'producto_id'
        USING ERRCODE = '23514';
    END IF;

    v_cantidad := round(app.to_numeric_or_zero(v_item->>'cantidad'), 6);
    v_precio := round(app.to_numeric_or_zero(v_item->>'precio_unitario'), 6);
    v_precio_catalogo := round(coalesce(
      nullif(v_producto.precio_venta, 0), nullif(v_producto.precio, 0),
      nullif(v_producto.precio_unitario, 0), 0
    ), 6);
    v_descuento := round(app.to_numeric_or_zero(v_item->>'descuento_monto'), 2);
    v_subtotal_item := round(app.to_numeric_or_zero(v_item->>'subtotal'), 2);
    v_igv_item := round(app.to_numeric_or_zero(v_item->>'igv'), 2);

    IF v_cantidad <= 0 OR v_precio <= 0
       OR NOT (
         abs(v_precio - v_precio_catalogo) <= 0.01
         OR (coalesce(v_producto.precio_mayorista, 0) > 0
           AND abs(v_precio - v_producto.precio_mayorista) <= 0.01)
         OR (coalesce(v_producto.precio_especial, 0) > 0
           AND abs(v_precio - v_producto.precio_especial) <= 0.01)
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_payload->'items') original(item)
           WHERE app.to_uuid_or_null(coalesce(original.item->>'producto_id', '')) = v_producto.id
             AND abs(app.to_numeric_or_zero(original.item->>'cantidad') - v_cantidad) <= 0.000001
             AND abs(app.to_numeric_or_zero(coalesce(original.item->>'precio_unitario', original.item->>'precio_original')) - v_precio) <= 0.000001
             AND app.es_precio_pos_comercial_valido_469(
               p_tenant_id, p_usuario_id, v_cliente_id, v_moneda,
               original.item, v_fecha
             )
         )
       )
       OR v_descuento < 0 OR v_descuento > round(v_cantidad * v_precio, 2)
       OR abs(v_subtotal_item - round(v_cantidad * v_precio - v_descuento, 2)) > 0.01 THEN
      RAISE EXCEPTION 'POS_ITEM_PRICE_OR_TOTAL_INVALID: %', v_producto.id
        USING ERRCODE = '23514';
    END IF;

    IF coalesce(v_empresa.requiere_aprobacion_descuento, false)
       AND coalesce(v_empresa.porcentaje_descuento_maximo, 0) >= 0
       AND v_descuento > 0
       AND (v_descuento / nullif(v_cantidad * v_precio, 0)) * 100
           > coalesce(v_empresa.porcentaje_descuento_maximo, 0) + 0.0001 THEN
      RAISE EXCEPTION 'POS_DISCOUNT_REQUIRES_APPROVAL: producto=%', v_producto.id
        USING ERRCODE = '23514';
    END IF;

    v_igv_esperado := CASE
      WHEN left(coalesce(v_producto.afectacion_igv, '10'), 1) = '1'
        THEN round(v_subtotal_item * v_tasa_igv, 2)
      ELSE 0 END;
    IF abs(v_igv_item - v_igv_esperado) > 0.02 THEN
      RAISE EXCEPTION 'POS_ITEM_TAX_INVALID: producto=% esperado=% recibido=%',
        v_producto.id, v_igv_esperado, v_igv_item USING ERRCODE = '23514';
    END IF;

    v_subtotal := v_subtotal + v_subtotal_item;
    v_igv := v_igv + v_igv_item;
    IF NOT coalesce(v_producto.es_servicio, false)
       AND coalesce(v_producto.controla_stock, true) THEN
      v_costo_ventas := v_costo_ventas
        + round(v_cantidad * coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0), 2);
    END IF;
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  v_igv := round(v_igv, 2);
  v_total := round(v_subtotal + v_igv, 2);
  v_costo_ventas := round(v_costo_ventas, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'POS_TOTAL_MUST_BE_POSITIVE' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(coalesce(p_payload->'pagos', 'null'::jsonb)) = 'array'
     AND jsonb_array_length(v_pagos_input) > 0 THEN
    FOR v_pago IN SELECT value FROM jsonb_array_elements(v_pagos_input)
    LOOP
      SELECT * INTO v_metodo
      FROM public.metodos_pago mp
      WHERE (mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
        AND coalesce(mp.activo, true)
        AND upper(coalesce(mp.estado::text, 'ACTIVO')) = 'ACTIVO'
        AND (
          (app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', '')) IS NOT NULL
           AND mp.id = app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', ''))
           AND (nullif(v_pago->>'codigo', '') IS NULL
             OR lower(btrim(mp.codigo)) = lower(btrim(v_pago->>'codigo'))))
          OR (app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', '')) IS NULL
              AND nullif(v_pago->>'codigo', '') IS NOT NULL
              AND lower(btrim(mp.codigo)) = lower(btrim(v_pago->>'codigo')))
        )
      ORDER BY (mp.tenant_id IS NULL), mp.id
      LIMIT 1;
      IF NOT FOUND OR app.pos_account_code_for_payment_451(v_metodo.tipo) IS NULL THEN
        RAISE EXCEPTION 'POS_PAYMENT_METHOD_INVALID' USING ERRCODE = '23514';
      END IF;
      IF app.to_numeric_or_zero(v_pago->>'monto') <= 0
         OR upper(v_pago->>'moneda') <> v_moneda THEN
        RAISE EXCEPTION 'POS_PAYMENT_AMOUNT_OR_CURRENCY_INVALID' USING ERRCODE = '23514';
      END IF;
      v_pagos_resueltos := v_pagos_resueltos || jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo.id,
        'codigo', lower(v_metodo.codigo),
        'tipo', upper(v_metodo.tipo),
        'monto', round(app.to_numeric_or_zero(v_pago->>'monto'), 2),
        'moneda', v_moneda,
        'referencia', nullif(v_pago->>'referencia', ''),
        'cuentaCodigo', app.pos_account_code_for_payment_451(v_metodo.tipo)
      ));
      v_pagos_total := v_pagos_total + round(app.to_numeric_or_zero(v_pago->>'monto'), 2);
      v_payment_count := v_payment_count + 1;
      IF upper(v_metodo.tipo) = 'EFECTIVO' THEN
        v_efectivo := v_efectivo + round(app.to_numeric_or_zero(v_pago->>'monto'), 2);
      ELSIF upper(v_metodo.tipo) = 'CREDITO' THEN
        v_credito := v_credito + round(app.to_numeric_or_zero(v_pago->>'monto'), 2);
      END IF;
    END LOOP;
  ELSE
    SELECT * INTO v_metodo
    FROM public.metodos_pago mp
    WHERE (mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
      AND coalesce(mp.activo, true)
      AND upper(coalesce(mp.estado::text, 'ACTIVO')) = 'ACTIVO'
      AND (
        mp.id = app.to_uuid_or_null(coalesce(p_payload->>'metodo_pago', ''))
        OR lower(btrim(mp.codigo)) = lower(btrim(coalesce(p_payload->>'metodo_pago', 'efectivo')))
      )
    ORDER BY (mp.tenant_id IS NULL), mp.id
    LIMIT 1;
    IF NOT FOUND OR app.pos_account_code_for_payment_451(v_metodo.tipo) IS NULL THEN
      RAISE EXCEPTION 'POS_PAYMENT_METHOD_INVALID' USING ERRCODE = '23514';
    END IF;
    v_pagos_resueltos := jsonb_build_array(jsonb_build_object(
      'metodo_pago_id', v_metodo.id, 'codigo', lower(v_metodo.codigo),
      'tipo', upper(v_metodo.tipo), 'monto', v_total, 'moneda', v_moneda,
      'referencia', nullif(btrim(coalesce(p_payload->>'referencia_pago', '')), ''),
      'cuentaCodigo', app.pos_account_code_for_payment_451(v_metodo.tipo)
    ));
    v_pagos_total := v_total;
    v_payment_count := 1;
    IF upper(v_metodo.tipo) = 'EFECTIVO' THEN v_efectivo := v_total; END IF;
    IF upper(v_metodo.tipo) = 'CREDITO' THEN v_credito := v_total; END IF;
  END IF;

  v_pagos_total := round(v_pagos_total, 2);
  v_efectivo := round(v_efectivo, 2);
  v_credito := round(v_credito, 2);
  IF abs(v_pagos_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'POS_PAYMENTS_DO_NOT_MATCH_TOTAL: pagos=% total=%', v_pagos_total, v_total
      USING ERRCODE = '23514';
  END IF;

  IF v_credito > 0 THEN
    IF v_cliente_id IS NULL OR v_cliente.id IS NULL THEN
      RAISE EXCEPTION 'POS_CREDIT_REQUIRES_ACTIVE_CUSTOMER' USING ERRCODE = '23514';
    END IF;
    IF coalesce(v_empresa.aplicar_limite_credito, false)
       AND coalesce(v_cliente.limite_credito, 0) > 0
       AND NOT coalesce(v_cliente.permite_morosidad, false) THEN
      SELECT coalesce(sum(coalesce(c.monto_pendiente, c.saldo_pendiente, 0)), 0)
        INTO v_saldo_cliente
      FROM public.cuentas_por_cobrar c
      WHERE c.tenant_id = p_tenant_id AND c.cliente_id = v_cliente.id
        AND upper(c.estado::text) NOT IN ('CANCELADO', 'PAGADA', 'ANULADA', 'REVERTIDA');
      v_limite_credito := coalesce(v_cliente.limite_credito, 0);
      IF v_saldo_cliente + v_credito > v_limite_credito + 0.01 THEN
        RAISE EXCEPTION 'POS_CUSTOMER_CREDIT_LIMIT_EXCEEDED' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  v_ticket_correlativo := public.obtener_siguiente_numero_pos(
    p_tenant_id, v_ticket_serie, 'TICKET', v_caja.id
  );
  v_ticket := v_ticket_serie || '-' || v_ticket_correlativo;
  v_metodo_principal := CASE WHEN v_payment_count > 1 THEN 'MIXTO'
    ELSE coalesce(v_pagos_resueltos->0->>'codigo', 'efectivo') END;

  INSERT INTO public.ventas_pos (
    tenant_id, cliente_id, usuario_id, cliente_documento, cliente_nombre,
    metodo_pago, sesion_caja_id, subtotal, impuestos, total, cpe_pendiente,
    cpe_data, estado, numero_ticket, serie, correlativo, idempotency_key,
    request_fingerprint, accounting_event_id, moneda, credito_monto,
    cxc_pendiente, cxc_error, cxc_reintentos, fecha, metadata,
    tipo_emision, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_cliente_id, p_usuario_id, v_cliente_documento,
    v_cliente_nombre, v_metodo_principal, p_sesion_caja_id,
    v_subtotal, v_igv, v_total, false, NULL, 'PAGADA', v_ticket,
    v_ticket_serie, v_ticket_correlativo, v_key, v_fingerprint,
    v_accounting_event_id, v_moneda, v_credito,
    false, NULL, 0, now(),
    jsonb_build_object('atomic_rpc', 'pos_registrar_ticket_atomic_tx_471',
      'schema_version', 471, 'caja_id', v_caja.id,
      'almacen_id', v_caja.almacen_id, 'document_kind', 'TICKET'),
    'TICKET', now(), now()
  ) RETURNING * INTO v_venta;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, descuentos,
    impuesto_igv, impuesto_isc, otros_impuestos, total,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion,
    cliente_id, metodo_pago, estado, estado_sunat,
    observaciones, created_by, updated_by, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, 'TICKET', v_ticket_serie, lpad(v_ticket_correlativo, 8, '0'),
    v_fecha, CASE WHEN v_credito > 0
      THEN (v_fecha + coalesce(v_empresa.dias_vencimiento_factura, 30))::timestamptz
      ELSE v_fecha::timestamptz END,
    v_moneda, 1, v_subtotal, 0, v_igv, 0, 0, v_total,
    v_empresa.ruc, v_empresa.razon_social, v_empresa.direccion_fiscal,
    v_cliente_tipo, v_cliente_documento, v_cliente_documento,
    v_cliente_nombre, v_cliente_nombre, p_payload->>'cliente_direccion',
    v_cliente_id, CASE WHEN v_credito > 0 THEN 'CREDITO' ELSE 'CONTADO' END,
    'EMITIDO', 'NO_APLICA', 'Ticket interno POS; no es CPE fiscal',
    p_usuario_id, p_usuario_id,
    jsonb_build_object('source', 'pos.ticket.471', 'venta_pos_id', v_venta.id,
      'idempotency_key', v_key, 'fiscal', false, 'schema_version', 471),
    now(), now()
  ) RETURNING id INTO v_documento_id;

  UPDATE public.ventas_pos
  SET documento_id = v_documento_id,
      ticket_documento_id = v_documento_id,
      updated_at = now()
  WHERE id = v_venta.id AND tenant_id = p_tenant_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_item_index := v_item_index + 1;
    SELECT * INTO v_producto FROM public.productos p
    WHERE p.id = app.to_uuid_or_null(coalesce(v_item->>'producto_id', ''))
      AND p.tenant_id = p_tenant_id;
    INSERT INTO public.detalle_ventas_pos (
      tenant_id, venta_id, venta_pos_id, producto_id, item_index, cantidad,
      precio_unitario, descuento, impuesto, subtotal, total, nombre_producto,
      codigo_producto, unidad_medida, estado, es_servicio, controla_stock,
      costo_unitario, afectacion_igv, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_venta.id, v_venta.id, v_producto.id, v_item_index,
      app.to_numeric_or_zero(v_item->>'cantidad'),
      app.to_numeric_or_zero(v_item->>'precio_unitario'),
      app.to_numeric_or_zero(v_item->>'descuento_monto'),
      app.to_numeric_or_zero(v_item->>'igv'),
      app.to_numeric_or_zero(v_item->>'subtotal'),
      round(app.to_numeric_or_zero(v_item->>'subtotal') + app.to_numeric_or_zero(v_item->>'igv'), 2),
      coalesce(v_producto.nombre, 'Producto'), coalesce(v_producto.codigo, 'PROD'),
      coalesce(v_producto.unidad_medida,
        CASE WHEN coalesce(v_producto.es_servicio, false) THEN 'ZZ' ELSE 'NIU' END),
      'CONFIRMADO', coalesce(v_producto.es_servicio, false),
      NOT coalesce(v_producto.es_servicio, false) AND coalesce(v_producto.controla_stock, true),
      CASE WHEN NOT coalesce(v_producto.es_servicio, false) AND coalesce(v_producto.controla_stock, true)
        THEN coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0) ELSE 0 END,
      coalesce(v_producto.afectacion_igv, '10'),
      jsonb_build_object('source', 'pos.ticket.471', 'idempotency_key', v_key,
        'classification_snapshot', true, 'schema_version', 471), now(), now()
    ) RETURNING id INTO v_detalle_id;
  END LOOP;

  FOR v_producto IN
    SELECT p.* FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND NOT coalesce(p.es_servicio, false)
      AND coalesce(p.controla_stock, true)
      AND p.id IN (
        SELECT app.to_uuid_or_null(coalesce(x->>'producto_id', ''))
        FROM jsonb_array_elements(v_items) x
      )
    ORDER BY p.id
  LOOP
    SELECT sum(app.to_numeric_or_zero(x->>'cantidad')) INTO v_cantidad
    FROM jsonb_array_elements(v_items) x
    WHERE app.to_uuid_or_null(coalesce(x->>'producto_id', '')) = v_producto.id;
    v_movimiento_id := public.aplicar_movimiento_inventario_tx(
      p_tenant_id, v_producto.id, v_caja.almacen_id, 'SALIDA', v_cantidad,
      'VENTA_POS', v_venta.id, 'Salida POS por ticket ' || v_ticket,
      NULL, NULL, NULL, p_usuario_id::text,
      jsonb_build_object('source', 'pos.ticket.471', 'idempotency_key', v_key,
        'numero_ticket', v_ticket, 'sesion_caja_id', p_sesion_caja_id,
        'caja_id', v_caja.id, 'almacen_id', v_caja.almacen_id,
        'costo_unitario', coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0),
        'schema_version', 471), false
    );
    UPDATE public.detalle_ventas_pos
    SET movimiento_id = v_movimiento_id, updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND coalesce(venta_pos_id, venta_id) = v_venta.id
      AND producto_id = v_producto.id;
  END LOOP;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(v_pagos_resueltos)
  LOOP
    INSERT INTO public.ventas_pos_pagos (
      tenant_id, venta_pos_id, metodo_pago_id, metodo_pago_codigo,
      metodo_pago_tipo, monto, moneda, referencia, estado, metadata,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, v_venta.id,
      app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', '')),
      v_pago->>'codigo', v_pago->>'tipo', app.to_numeric_or_zero(v_pago->>'monto'),
      v_pago->>'moneda', nullif(v_pago->>'referencia', ''), 'ACTIVO',
      jsonb_build_object('source', 'pos.ticket.471', 'idempotency_key', v_key,
        'cuenta_contable', v_pago->>'cuentaCodigo', 'schema_version', 471),
      now(), now()
    );
  END LOOP;

  IF v_efectivo > 0 THEN
    v_cash_movement := public.registrar_movimiento_caja(
      p_sesion_caja_id, 'VENTA', v_efectivo, v_venta.id::text,
      'venta_pos', 'Venta POS ' || v_ticket, p_usuario_id,
      NULL, NULL, jsonb_build_object('source', 'pos.ticket.471',
        'idempotency_key', v_key, 'pagos_mixtos', v_payment_count > 1,
        'schema_version', 471)
    );
  END IF;

  IF v_credito > 0 THEN
    v_fecha_vencimiento := v_fecha + coalesce(v_empresa.dias_vencimiento_factura, 30);
    INSERT INTO public.cuentas_por_cobrar (
      tenant_id, cliente_id, documento_id, serie, numero, numero_documento,
      tipo_documento, fecha_emision, fecha_vencimiento, moneda,
      monto_total, monto_original, monto_pendiente, saldo_pendiente, saldo,
      total, estado, activo, dias_mora, retencion_total, percepcion_total,
      detraccion_total, anticipo_total, event_id, idempotency_key, event_source,
      metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_cliente.id, v_documento_id, v_ticket_serie,
      lpad(v_ticket_correlativo, 8, '0'), v_ticket,
      'TICKET', v_fecha, v_fecha_vencimiento, v_moneda,
      v_credito, v_credito, v_credito, v_credito, v_credito,
      v_credito, 'PENDIENTE', true, 0, 0, 0, 0, 0,
      v_cxc_event_id, 'pos.cxc:' || p_tenant_id::text || ':' || v_key,
      'pos.ticket.471', jsonb_build_object('venta_pos_id', v_venta.id,
        'ticket_documento_id', v_documento_id,
        'numero_ticket', v_ticket, 'schema_version', 471), now(), now()
    ) RETURNING id INTO v_cxc_id;
    UPDATE public.ventas_pos
    SET cuenta_por_cobrar_id = v_cxc_id, updated_at = now()
    WHERE id = v_venta.id;
  END IF;

  v_accounting_key := 'pos.accounting:' || p_tenant_id::text || ':' || v_key;
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status,
    retry_count, idempotency_key, event_id, occurred_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, 'venta_pos', v_venta.id::text, 'pos.venta.registrada',
    jsonb_build_object(
      'eventId', v_accounting_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', v_accounting_key,
      'source', 'pos.venta.registrada',
      'ventaId', v_venta.id,
      'numeroTicket', v_ticket,
      'numeroFiscal', NULL,
      'tipoDocumento', 'TICKET',
      'clienteId', v_cliente_id,
      'clienteNombre', v_cliente_nombre,
      'metodoPago', v_metodo_principal,
      'subtotal', v_subtotal,
      'impuestos', v_igv,
      'total', v_total,
      'costo_ventas', v_costo_ventas,
      'pagos', v_pagos_resueltos,
      'montoInmediato', round(v_total - v_credito, 2),
      'montoCredito', v_credito,
      'cuentaPorCobrarId', v_cxc_id,
      'documentoId', v_documento_id,
      'ticketDocumentoId', v_documento_id,
      'cxcCreadaAtomicamente', v_credito = 0 OR v_cxc_id IS NOT NULL,
      'inventarioAplicado', true,
      'cpeEncoladoAtomicamente', false,
      'items', v_items,
      'schemaVersion', 471
    ), 'pending', 0, v_accounting_key, v_accounting_event_id,
    clock_timestamp(), now(), now()
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', d.producto_id,
    'movimiento_id', d.movimiento_id,
    'stock_actual', p.stock_actual,
    'stock_disponible', coalesce(p.stock_actual, p.stock, 0) - coalesce(p.stock_reservado, 0)
  ) ORDER BY d.item_index), '[]'::jsonb)
    INTO v_items_result
  FROM public.detalle_ventas_pos d
  JOIN public.productos p ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
  WHERE d.tenant_id = p_tenant_id AND d.venta_pos_id = v_venta.id;

  v_result := jsonb_build_object(
    'venta_id', v_venta.id,
    'numero_ticket', v_ticket,
    'tipo_emision', 'TICKET',
    'estado', 'PAGADA',
    'subtotal', v_subtotal,
    'impuestos', v_igv,
    'total', v_total,
    'cpe_id', NULL,
    'cpe_pendiente', false,
    'facturacion_pendiente', false,
    'canjeable', true,
    'cuenta_por_cobrar_id', v_cxc_id,
    'documento_id', v_documento_id,
    'ticket_documento_id', v_documento_id,
    'credito_monto', v_credito,
    'caja_movimiento_id', v_cash_movement.id,
    'accounting_event_id', v_accounting_event_id,
    'items_actualizados', v_items_result,
    'impactos_aplicados', true,
    'idempotent', false
  );

  UPDATE public.ventas_pos
  SET atomic_result = v_result, updated_at = now()
  WHERE id = v_venta.id
  RETURNING * INTO v_venta;

  PERFORM app.pos_ticket_sale_postconditions_471(v_venta);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.pos_canjear_ticket_tx_471(
  p_tenant_id uuid,
  p_venta_pos_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_tipo text := btrim(coalesce(p_payload->>'tipo_documento', ''));
  v_serie text := upper(btrim(coalesce(p_payload->>'serie', '')));
  v_cliente_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', ''));
  v_receptor_tipo text := upper(btrim(coalesce(p_payload->>'cliente_tipo_documento', '')));
  v_receptor_documento text := btrim(coalesce(p_payload->>'cliente_documento', ''));
  v_receptor_nombre text := btrim(coalesce(p_payload->>'cliente_nombre', ''));
  v_receptor_direccion text := nullif(btrim(coalesce(p_payload->>'cliente_direccion', '')), '');
  v_fingerprint text;
  v_venta public.ventas_pos%ROWTYPE;
  v_empresa public.empresa_config%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_existing public.pos_ticket_canjes%ROWTYPE;
  v_ticket_doc public.documentos%ROWTYPE;
  v_numero text;
  v_documento_id uuid;
  v_canje_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_fecha date := app.hoy_tenant(p_tenant_id);
  v_items jsonb;
  v_total_gravadas numeric;
  v_total_exoneradas numeric;
  v_total_inafectas numeric;
  v_total_exportacion numeric;
  v_costo_ventas numeric;
  v_cpe_data jsonb;
  v_result jsonb;
  v_rows integer;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  IF p_venta_pos_id IS NULL OR v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_IDENTITY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_tipo NOT IN ('01', '03') THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_receptor_tipo = '' OR v_receptor_documento = '' OR v_receptor_nombre = '' THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_RECEIVER_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'actor_id', p_actor_id,
    'venta_pos_id', p_venta_pos_id,
    'tipo_documento', v_tipo,
    'serie', nullif(v_serie, ''),
    'cliente_id', v_cliente_id,
    'cliente_tipo_documento', v_receptor_tipo,
    'cliente_documento', v_receptor_documento,
    'cliente_nombre', v_receptor_nombre,
    'cliente_direccion', v_receptor_direccion
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos.ticket.exchange:' || p_tenant_id::text || ':' || p_venta_pos_id::text, 471
  ));

  SELECT * INTO v_venta
  FROM public.ventas_pos v
  WHERE v.id = p_venta_pos_id AND v.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_TICKET_SALE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.pos_ticket_canjes c
  WHERE c.tenant_id = p_tenant_id
    AND (c.venta_pos_id = p_venta_pos_id OR c.idempotency_key = v_key)
  ORDER BY (c.venta_pos_id = p_venta_pos_id) DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.venta_pos_id IS DISTINCT FROM p_venta_pos_id
       OR v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.idempotency_key IS DISTINCT FROM v_key
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_TICKET_EXCHANGE_IDEMPOTENCY_MISMATCH' USING ERRCODE = '23505';
    END IF;
    PERFORM app.pos_ticket_sale_postconditions_471(v_venta);
    RETURN v_existing.resultado || jsonb_build_object(
      'idempotent', true,
      'cpe_id', v_venta.cpe_id,
      'cpe_pendiente', coalesce(v_venta.cpe_pendiente, false)
    );
  END IF;

  IF v_venta.tipo_emision <> 'TICKET'
     OR v_venta.ticket_documento_id IS NULL
     OR v_venta.documento_id IS DISTINCT FROM v_venta.ticket_documento_id
     OR v_venta.cpe_data IS NOT NULL
     OR coalesce(v_venta.cpe_pendiente, false)
     OR v_venta.cpe_id IS NOT NULL
     OR upper(coalesce(v_venta.estado, '')) NOT IN ('PAGADA', 'CONFIRMADA', 'COMPLETADA') THEN
    RAISE EXCEPTION 'POS_SALE_IS_NOT_EXCHANGEABLE_TICKET' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_ticket_doc FROM public.documentos d
  WHERE d.id = v_venta.ticket_documento_id
    AND d.tenant_id = p_tenant_id
    AND upper(coalesce(d.tipo_documento, '')) = 'TICKET'
  FOR SHARE;
  IF NOT FOUND OR v_ticket_doc.serie IS NULL THEN
    RAISE EXCEPTION 'POS_INTERNAL_TICKET_DOCUMENT_NOT_FOUND' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_empresa FROM public.empresa_config e
  WHERE e.tenant_id = p_tenant_id FOR SHARE;
  IF NOT FOUND OR upper(coalesce(v_empresa.pais, 'PE')) <> 'PE' THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_ONLY_SUPPORTS_PE_01_03' USING ERRCODE = '23514';
  END IF;
  IF nullif(btrim(v_empresa.ruc), '') IS NULL
     OR nullif(btrim(v_empresa.razon_social), '') IS NULL THEN
    RAISE EXCEPTION 'POS_COMPANY_CONFIGURATION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  IF v_serie = '' THEN
    v_serie := upper(btrim(coalesce(
      CASE WHEN v_tipo = '01' THEN v_empresa.serie_factura ELSE v_empresa.serie_boleta END,
      CASE WHEN v_tipo = '01' THEN 'F001' ELSE 'B001' END
    )));
  END IF;
  IF (v_tipo = '01' AND v_serie !~ '^F[A-Z0-9]{3}$')
     OR (v_tipo = '03' AND v_serie !~ '^B[A-Z0-9]{3}$') THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_SERIES_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_tipo = '01' AND (
       v_cliente_id IS NULL OR v_receptor_tipo <> '6'
       OR NOT app.validar_ruc_peru_471(v_receptor_documento)
     ) THEN
    RAISE EXCEPTION 'POS_TICKET_INVOICE_REQUIRES_VALID_RUC_CUSTOMER' USING ERRCODE = '23514';
  END IF;
  IF NOT app.pos_ticket_receiver_valid_471(
    v_receptor_tipo, v_receptor_documento, v_venta.total
  ) THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_RECEIVER_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_cliente_id IS NOT NULL THEN
    SELECT * INTO v_cliente FROM public.clientes c
    WHERE c.id = v_cliente_id AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
      AND upper(coalesce(c.estado::text, 'ACTIVO')) = 'ACTIVO'
    FOR SHARE;
    IF NOT FOUND
       OR nullif(v_cliente.documento_identidad, '') IS DISTINCT FROM v_receptor_documento THEN
      RAISE EXCEPTION 'POS_TICKET_EXCHANGE_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_venta.cuenta_por_cobrar_id IS NOT NULL
     AND v_cliente_id IS DISTINCT FROM v_venta.cliente_id THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_CANNOT_CHANGE_DEBTOR' USING ERRCODE = '23514';
  END IF;

  SELECT
    round(coalesce(sum(d.subtotal) FILTER (
      WHERE left(coalesce(d.afectacion_igv, '10'), 1) = '1'), 0), 2),
    round(coalesce(sum(d.subtotal) FILTER (
      WHERE left(coalesce(d.afectacion_igv, '10'), 1) = '2'), 0), 2),
    round(coalesce(sum(d.subtotal) FILTER (
      WHERE left(coalesce(d.afectacion_igv, '10'), 1) = '3'), 0), 2),
    round(coalesce(sum(d.subtotal) FILTER (
      WHERE left(coalesce(d.afectacion_igv, '10'), 1) = '4'), 0), 2),
    round(coalesce(sum(CASE WHEN d.controla_stock AND NOT d.es_servicio
      THEN d.cantidad * d.costo_unitario ELSE 0 END), 0), 2)
  INTO v_total_gravadas, v_total_exoneradas, v_total_inafectas,
       v_total_exportacion, v_costo_ventas
  FROM public.detalle_ventas_pos d
  WHERE d.tenant_id = p_tenant_id
    AND coalesce(d.venta_pos_id, d.venta_id) = p_venta_pos_id;
  v_items := app.pos_ticket_items_cpe_471(p_venta_pos_id, p_tenant_id);
  IF jsonb_array_length(v_items) = 0
     OR abs(v_total_gravadas + v_total_exoneradas + v_total_inafectas
       + v_total_exportacion - v_venta.subtotal) > 0.01 THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_SNAPSHOT_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  v_numero := public.obtener_siguiente_numero_documento(
    p_tenant_id, v_tipo, v_serie
  );

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, descuentos,
    impuesto_igv, impuesto_isc, otros_impuestos, total,
    total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion,
    cliente_id, metodo_pago, estado, estado_sunat,
    observaciones, created_by, updated_by, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, CASE v_tipo WHEN '01' THEN 'FACTURA' ELSE 'BOLETA' END,
    v_serie, lpad(v_numero, 8, '0'), v_fecha, v_ticket_doc.fecha_vencimiento,
    v_venta.moneda, 1, v_venta.subtotal, 0, v_venta.impuestos, 0, 0, v_venta.total,
    v_total_gravadas, v_total_exoneradas, v_total_inafectas, v_total_exportacion,
    v_empresa.ruc, v_empresa.razon_social, v_empresa.direccion_fiscal,
    v_receptor_tipo, v_receptor_documento, v_receptor_documento,
    v_receptor_nombre, v_receptor_nombre, v_receptor_direccion,
    v_cliente_id, CASE WHEN v_venta.credito_monto > 0 THEN 'CREDITO' ELSE 'CONTADO' END,
    'EMITIDO', 'PENDIENTE',
    'Canje fiscal del ticket ' || v_venta.numero_ticket,
    p_actor_id, p_actor_id,
    jsonb_build_object('source', 'pos.ticket.exchange.471',
      'venta_pos_id', p_venta_pos_id,
      'ticket_documento_id', v_venta.ticket_documento_id,
      'numero_ticket', v_venta.numero_ticket,
      'idempotency_key', v_key,
      'genera_asiento', false,
      'schema_version', 471), now(), now()
  ) RETURNING id INTO v_documento_id;

  v_cpe_data := jsonb_build_object(
    'tipo_documento', v_tipo,
    'serie', v_serie,
    'numero', app.to_numeric_or_zero(v_numero),
    'idempotency_key', 'pos.cpe:' || p_tenant_id::text || ':canje:' || v_key,
    'fecha_emision', v_fecha::text,
    'fecha_vencimiento', v_ticket_doc.fecha_vencimiento,
    'ruc_emisor', v_empresa.ruc,
    'razon_social_emisor', v_empresa.razon_social,
    'direccion_emisor', v_empresa.direccion_fiscal,
    'tipo_documento_receptor', v_receptor_tipo,
    'documento_receptor', v_receptor_documento,
    'razon_social_receptor', v_receptor_nombre,
    'direccion_receptor', v_receptor_direccion,
    'moneda', v_venta.moneda,
    'total_gravadas', v_total_gravadas,
    'total_exoneradas', v_total_exoneradas,
    'total_inafectas', v_total_inafectas,
    'total_exportacion', v_total_exportacion,
    'total_igv', v_venta.impuestos,
    'total_venta', v_venta.total,
    'items', v_items,
    'costo_ventas', v_costo_ventas,
    'cliente_id', v_cliente_id,
    'condicion_pago', CASE WHEN v_venta.credito_monto > 0 THEN 'CREDITO' ELSE 'CONTADO' END,
    'es_credito', v_venta.credito_monto > 0,
    'venta_pos_id', p_venta_pos_id,
    'documento_id', v_documento_id,
    'ticket_documento_id', v_venta.ticket_documento_id,
    'numero_ticket_origen', v_venta.numero_ticket,
    'canje_id', v_canje_id,
    'genera_asiento', false
  );

  v_result := jsonb_build_object(
    'canje_id', v_canje_id,
    'venta_id', p_venta_pos_id,
    'numero_ticket', v_venta.numero_ticket,
    'tipo_emision', 'TICKET_CANJEADO',
    'tipo_documento', v_tipo,
    'serie', v_serie,
    'numero', lpad(v_numero, 8, '0'),
    'numero_fiscal', v_serie || '-' || lpad(v_numero, 8, '0'),
    'ticket_documento_id', v_venta.ticket_documento_id,
    'documento_id', v_documento_id,
    'cpe_id', NULL,
    'cpe_pendiente', true,
    'facturacion_pendiente', true,
    'canjeable', false,
    'impactos_economicos_reaplicados', false,
    'idempotent', false
  );

  INSERT INTO public.pos_ticket_canjes (
    id, tenant_id, venta_pos_id, ticket_documento_id, documento_fiscal_id,
    tipo_documento, serie, numero, receptor_cliente_id,
    receptor_tipo_documento, receptor_documento, receptor_nombre,
    receptor_direccion, actor_id, idempotency_key, request_fingerprint,
    resultado, estado, metadata, created_at, updated_at
  ) VALUES (
    v_canje_id, p_tenant_id, p_venta_pos_id, v_venta.ticket_documento_id,
    v_documento_id, v_tipo, v_serie, lpad(v_numero, 8, '0'), v_cliente_id,
    v_receptor_tipo, v_receptor_documento, v_receptor_nombre,
    v_receptor_direccion, p_actor_id, v_key, v_fingerprint,
    v_result, 'RESERVADO',
    jsonb_build_object('schema_version', 471, 'genera_asiento', false),
    now(), now()
  );

  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'canje_id', v_canje_id,
        'documento_fiscal_id', v_documento_id,
        'numero_fiscal', v_serie || '-' || lpad(v_numero, 8, '0'),
        'canjeado_at', clock_timestamp(),
        'schema_version', 471
      ),
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = v_venta.ticket_documento_id
    AND tenant_id = p_tenant_id
    AND upper(coalesce(tipo_documento, '')) = 'TICKET';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'POS_TICKET_TRACEABILITY_UPDATE_FAILED' USING ERRCODE = '23514';
  END IF;

  IF v_venta.cuenta_por_cobrar_id IS NOT NULL THEN
    UPDATE public.cuentas_por_cobrar c
    SET documento_id = v_documento_id,
        serie = v_serie,
        numero = lpad(v_numero, 8, '0'),
        numero_documento = v_serie || '-' || lpad(v_numero, 8, '0'),
        tipo_documento = v_tipo,
        metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
          'ticket_documento_id', v_venta.ticket_documento_id,
          'canje_id', v_canje_id,
          'relinked_only', true,
          'schema_version', 471),
        updated_at = now()
    WHERE c.id = v_venta.cuenta_por_cobrar_id
      AND c.tenant_id = p_tenant_id
      AND c.documento_id = v_venta.ticket_documento_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'POS_TICKET_EXCHANGE_CXC_RELINK_FAILED' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.ventas_pos
  SET cliente_id = v_cliente_id,
      cliente_documento = v_receptor_documento,
      cliente_nombre = v_receptor_nombre,
      documento_id = v_documento_id,
      cpe_data = v_cpe_data,
      cpe_pendiente = true,
      tipo_emision = 'TICKET_CANJEADO',
      canjeado_at = clock_timestamp(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'ticket_cliente_id_original', v_venta.cliente_id,
        'ticket_cliente_documento_original', v_venta.cliente_documento,
        'ticket_cliente_nombre_original', v_venta.cliente_nombre,
        'fiscal_receptor_cliente_id', v_cliente_id,
        'fiscal_receptor_documento', v_receptor_documento,
        'fiscal_receptor_nombre', v_receptor_nombre,
        'receptor_actualizado_solo_para_cpe', true,
        'schema_version', 471
      ),
      atomic_result = coalesce(atomic_result, '{}'::jsonb) || jsonb_build_object(
        'tipo_emision', 'TICKET_CANJEADO',
        'documento_id', v_documento_id,
        'ticket_documento_id', ticket_documento_id,
        'cpe_id', NULL,
        'cpe_pendiente', true,
        'facturacion_pendiente', true,
        'canjeable', false,
        'canje_id', v_canje_id,
        'numero_fiscal', v_serie || '-' || lpad(v_numero, 8, '0')
      ),
      updated_at = now()
  WHERE id = p_venta_pos_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_venta;

  v_event_key := 'pos.ticket.canje:' || p_tenant_id::text || ':' || v_canje_id::text;
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status,
    retry_count, idempotency_key, event_id, occurred_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, 'venta_pos', p_venta_pos_id::text, 'pos.ticket.canje.reservado',
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'ventaId', p_venta_pos_id,
      'canjeId', v_canje_id,
      'ticketDocumentoId', v_venta.ticket_documento_id,
      'documentoFiscalId', v_documento_id,
      'tipoDocumento', v_tipo,
      'serie', v_serie,
      'numero', lpad(v_numero, 8, '0'),
      'generaAsiento', false,
      'reaplicaInventario', false,
      'reaplicaTesoreria', false,
      'reaplicaCxc', false,
      'schemaVersion', 471
    ), 'pending', 0, v_event_key, v_event_id,
    clock_timestamp(), now(), now()
  );

  PERFORM app.pos_ticket_sale_postconditions_471(v_venta);

  IF (SELECT count(*) FROM public.outbox_events o
      WHERE o.tenant_id = p_tenant_id
        AND o.aggregate_id = p_venta_pos_id::text
        AND o.event_type = 'pos.venta.registrada') <> 1 THEN
    RAISE EXCEPTION 'POS_TICKET_EXCHANGE_DUPLICATED_ACCOUNTING_EVENT' USING ERRCODE = '23514';
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_atomic_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_result jsonb;
  v_venta_id uuid;
BEGIN
  IF coalesce((p_payload->>'emitir_cpe')::boolean, true) THEN
    v_result := app.pos_registrar_venta_atomic_tx_451(
      p_tenant_id, p_usuario_id, p_sesion_caja_id,
      p_idempotency_key, p_payload - 'emitir_cpe'
    );
    v_venta_id := app.to_uuid_or_null(coalesce(v_result->>'venta_id', ''));
    IF v_venta_id IS NULL THEN
      RAISE EXCEPTION 'POS_FISCAL_WRITER_DID_NOT_RETURN_SALE' USING ERRCODE = '23514';
    END IF;
    v_result := v_result || jsonb_build_object(
      'tipo_emision', 'FISCAL_INMEDIATO',
      'canjeable', false
    );
    UPDATE public.ventas_pos
    SET tipo_emision = 'FISCAL_INMEDIATO',
        atomic_result = v_result,
        updated_at = now()
    WHERE id = v_venta_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS_FISCAL_SALE_NOT_FOUND_AFTER_WRITE' USING ERRCODE = '23514';
    END IF;
    RETURN v_result;
  END IF;
  RETURN app.pos_registrar_ticket_atomic_tx_471(
    p_tenant_id, p_usuario_id, p_sesion_caja_id,
    p_idempotency_key, p_payload
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_canjear_ticket_tx(
  p_tenant_id uuid,
  p_venta_pos_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.pos_canjear_ticket_tx_471($1, $2, $3, $4, $5);
$function$;

CREATE OR REPLACE FUNCTION app.cerrar_caja_tx_471(
  p_tenant_id uuid,
  p_sesion_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_sesion public.sesiones_caja%ROWTYPE;
  v_cierre_at timestamptz := clock_timestamp();
  v_contado numeric := round(app.to_numeric_or_zero(p_payload->>'monto_contado'), 2);
  v_esperado numeric;
  v_diferencia numeric;
  v_admin boolean := coalesce((p_payload->>'cierre_administrativo')::boolean, false);
  v_razon text := nullif(btrim(coalesce(p_payload->>'razon_cierre_administrativo', '')), '');
  v_denominaciones jsonb := coalesce(p_payload->'denominaciones', '{}'::jsonb);
  v_fingerprint text;
  v_hash text;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
  v_total_ventas numeric;
  v_total_impuestos numeric;
  v_total_documentos integer;
  v_metodos jsonb;
  v_fiscal jsonb;
  v_expected_seq integer;
  v_actual_seq integer;
  v_actual_count integer;
  v_supervisor_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'supervisor_id', ''));
  v_tolerancia numeric := 0;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  IF v_contado < 0 THEN
    RAISE EXCEPTION 'CASH_CLOSE_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_admin AND (v_razon IS NULL OR length(v_razon) < 10) THEN
    RAISE EXCEPTION 'CASH_ADMIN_CLOSE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_caja s
  WHERE s.id = p_sesion_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id, 'sesion_id', p_sesion_id,
    'monto_contado', v_contado, 'denominaciones', v_denominaciones,
    'notas', nullif(btrim(coalesce(p_payload->>'notas', '')), ''),
    'cierre_administrativo', v_admin, 'razon', v_razon,
    'supervisor_id', v_supervisor_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  IF upper(v_sesion.estado::text) = 'CERRADA' THEN
    IF v_sesion.close_fingerprint IS NULL OR v_sesion.close_result IS NULL THEN
      RAISE EXCEPTION 'CASH_LEGACY_CLOSE_REQUIRES_RECONCILIATION' USING ERRCODE = '23514';
    END IF;
    IF v_sesion.close_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CASH_CLOSE_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.cortes_caja c
      WHERE c.tenant_id = p_tenant_id AND c.sesion_caja_id = p_sesion_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.tenant_id = p_tenant_id AND o.event_id = v_sesion.close_event_id
        AND o.event_type = 'caja.cerrada'
    ) THEN
      RAISE EXCEPTION 'CASH_CLOSE_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
    RETURN v_sesion.close_result || jsonb_build_object('idempotent', true);
  END IF;
  IF upper(v_sesion.estado::text) <> 'ABIERTA' OR coalesce(v_sesion.congelada, false) THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_OPEN' USING ERRCODE = '23514';
  END IF;

  -- Sólo una intención fiscal reservada bloquea el cierre. Un Txxx interno no
  -- es un CPE faltante y puede permanecer canjeable después del corte.
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
      AND coalesce(v.cpe_pendiente, false)
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_PENDING_CPE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
      AND (v.accounting_event_id IS NULL OR v.atomic_result IS NULL
        OR v.documento_id IS NULL
        OR (v.credito_monto > 0 AND v.cuenta_por_cobrar_id IS NULL)
        OR NOT EXISTS (
          SELECT 1 FROM public.outbox_events o
          WHERE o.tenant_id = v.tenant_id AND o.event_id = v.accounting_event_id
            AND o.event_type = 'pos.venta.registrada'
        ))
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_INCOMPLETE_POS_SALE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cambios_turno c
    WHERE c.tenant_id = p_tenant_id AND c.sesion_caja_id = p_sesion_id
      AND upper(coalesce(c.estado::text, '')) = 'EN_PROCESO'
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_PENDING_SHIFT_CHANGE' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(m.secuencia), 0), count(*)
    INTO v_expected_seq, v_actual_count
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id;
  SELECT count(*) INTO v_actual_seq
  FROM (
    SELECT m.secuencia,
           lag(m.saldo_nuevo) OVER (ORDER BY m.secuencia) AS saldo_previo,
           m.saldo_anterior, m.saldo_nuevo, m.monto
    FROM public.movimientos_caja m
    WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id
  ) q
  WHERE q.secuencia < 1
     OR (q.saldo_previo IS NOT NULL AND abs(q.saldo_anterior - q.saldo_previo) > 0.01)
     OR abs(q.saldo_nuevo - q.saldo_anterior - q.monto) > 0.01;
  IF v_expected_seq <> v_actual_count OR v_actual_seq <> 0 THEN
    RAISE EXCEPTION 'CASH_MOVEMENT_LEDGER_INTEGRITY_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce((
    SELECT m.saldo_nuevo FROM public.movimientos_caja m
    WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id
    ORDER BY m.secuencia DESC LIMIT 1
  ), coalesce(v_sesion.monto_inicio, v_sesion.monto_inicial, 0))
  INTO v_esperado;
  v_esperado := round(v_esperado, 2);
  v_diferencia := round(v_contado - v_esperado, 2);
  SELECT coalesce(cc.tolerancia_diferencia_cierre, 0)
    INTO v_tolerancia
  FROM public.configuracion_caja cc
  WHERE cc.tenant_id = p_tenant_id
    AND coalesce(cc.activo, true)
    AND (cc.caja_id = v_sesion.caja_id OR cc.caja_id IS NULL)
  ORDER BY (cc.caja_id = v_sesion.caja_id) DESC, cc.updated_at DESC
  LIMIT 1;
  v_tolerancia := coalesce(v_tolerancia, 0);
  IF abs(v_diferencia) > v_tolerancia + 0.001 THEN
    IF v_supervisor_id IS NULL THEN
      RAISE EXCEPTION 'CASH_CLOSE_SUPERVISOR_REQUIRED: diferencia=% tolerancia=%',
        v_diferencia, v_tolerancia USING ERRCODE = '42501';
    END IF;
    PERFORM app.assert_pos_actor_451(p_tenant_id, v_supervisor_id);
  ELSIF v_supervisor_id IS NOT NULL THEN
    PERFORM app.assert_pos_actor_451(p_tenant_id, v_supervisor_id);
  END IF;
  v_hash := app.cash_session_integrity_hash_451(
    p_tenant_id, p_sesion_id, v_cierre_at, v_esperado, v_contado, v_denominaciones
  );

  SELECT round(coalesce(sum(v.total), 0), 2),
         round(coalesce(sum(v.impuestos), 0), 2), count(*)
    INTO v_total_ventas, v_total_impuestos, v_total_documentos
  FROM public.ventas_pos v
  WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
    AND upper(coalesce(v.estado, '')) <> 'ANULADA';

  SELECT coalesce(jsonb_object_agg(tipo, monto), '{}'::jsonb)
    INTO v_metodos
  FROM (
    SELECT upper(p.metodo_pago_tipo) AS tipo, round(sum(p.monto), 2) AS monto
    FROM public.ventas_pos_pagos p
    JOIN public.ventas_pos v ON v.id = p.venta_pos_id AND v.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
    GROUP BY upper(p.metodo_pago_tipo)
  ) x;
  v_fiscal := jsonb_build_object(
    'base_imponible', round(v_total_ventas - v_total_impuestos, 2),
    'igv', v_total_impuestos, 'total', v_total_ventas,
    'cantidad_documentos', v_total_documentos
  );

  v_event_key := 'caja.cerrada:' || p_tenant_id::text || ':' || p_sesion_id::text;
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status,
    retry_count, idempotency_key, event_id, occurred_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, 'sesion_caja', p_sesion_id::text, 'caja.cerrada',
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'sesionCajaId', p_sesion_id, 'cajaId', v_sesion.caja_id,
      'montoEsperado', v_esperado, 'montoContado', v_contado,
      'diferencia', v_diferencia, 'cierreAdministrativo', v_admin,
      'supervisorId', v_supervisor_id,
      'fecha', v_cierre_at,
      'referencia', 'CIERRE-CAJA-' || p_sesion_id::text,
      'cuentaCajaCodigo', '10111',
      'hashIntegridad', v_hash, 'schemaVersion', 471),
    'pending', 0, v_event_key, v_event_id, v_cierre_at, now(), now()
  );

  INSERT INTO public.cortes_caja (
    tenant_id, sesion_caja_id, caja_id, fecha_corte, cajero_id, moneda,
    total_ventas, total_impuestos, total_neto, total_documentos,
    resumen_metodos_pago, resumen_fiscal, integridad_hash,
    estado, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_sesion_id, v_sesion.caja_id, v_cierre_at,
    coalesce(v_sesion.cajero_id, v_sesion.usuario_id),
    coalesce(v_sesion.moneda, 'PEN'), v_total_ventas, v_total_impuestos,
    round(v_total_ventas - v_total_impuestos, 2), v_total_documentos,
    v_metodos, v_fiscal, v_hash, 'ACTIVO',
    jsonb_build_object('atomic_rpc', 'cerrar_caja_tx_471', 'schema_version', 471),
    now(), now()
  );

  v_result := jsonb_build_object(
    'id', p_sesion_id, 'estado', 'CERRADA', 'caja_id', v_sesion.caja_id,
    'monto_inicio', coalesce(v_sesion.monto_inicio, v_sesion.monto_inicial, 0),
    'monto_esperado', v_esperado, 'monto_contado', v_contado,
    'monto_cierre', v_contado, 'diferencia', v_diferencia,
    'hash_integridad', v_hash,
    'hora_apertura', coalesce(v_sesion.hora_apertura, v_sesion.fecha_apertura),
    'hora_cierre', v_cierre_at, 'denominaciones_cierre', v_denominaciones,
    'cierre_administrativo', v_admin, 'close_event_id', v_event_id,
    'idempotent', false
  );

  UPDATE public.sesiones_caja SET
    estado = 'CERRADA', hora_cierre = v_cierre_at, fecha_cierre = v_cierre_at,
    cerrado_por = p_actor_id::text, usuario_cierre = p_actor_id::text,
    monto_esperado = v_esperado, monto_contado = v_contado,
    monto_cierre = v_contado, diferencia = v_diferencia,
    denominaciones_cierre = v_denominaciones,
    supervisor_cierre_id = v_supervisor_id,
    cierre_administrativo = v_admin,
    razon_cierre_administrativo = CASE WHEN v_admin THEN v_razon ELSE NULL END,
    hash_integridad = v_hash,
    notas = nullif(btrim(coalesce(p_payload->>'notas', '')), ''),
    resumen = coalesce(p_payload->'resumen', v_fiscal),
    close_fingerprint = v_fingerprint, close_result = v_result,
    close_event_id = v_event_id, updated_at = now()
  WHERE id = p_sesion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_sesion;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_caja_tx(
  p_tenant_id uuid, p_sesion_id uuid, p_actor_id uuid, p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.cerrar_caja_tx_471($1, $2, $3, $4);
$function$;

CREATE OR REPLACE FUNCTION app.pos_ticket_canjes_immutable_471()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'POS_TICKET_EXCHANGE_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_pos_ticket_canjes_immutable_471 ON public.pos_ticket_canjes;
CREATE TRIGGER trg_pos_ticket_canjes_immutable_471
BEFORE UPDATE OR DELETE ON public.pos_ticket_canjes
FOR EACH ROW EXECUTE FUNCTION app.pos_ticket_canjes_immutable_471();

CREATE OR REPLACE FUNCTION app.sembrar_permiso_pos_canje_471(p_tenant_id uuid)
RETURNS TABLE(permisos_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_permiso_id uuid;
BEGIN
  permisos_seeded := 0;
  role_permissions_seeded := 0;
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'POS_TICKET_RBAC_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT p.id INTO v_permiso_id
  FROM public.permisos p
  WHERE p.tenant_id = p_tenant_id AND lower(p.codigo) = 'pos.ticket.canjear';
  IF v_permiso_id IS NULL THEN
    INSERT INTO public.permisos (
      tenant_id, modulo, recurso, accion, codigo, descripcion, activo
    ) VALUES (
      p_tenant_id, 'pos', 'ticket', 'canjear', 'pos.ticket.canjear',
      'Canjear un ticket interno POS por factura o boleta sin reaplicar impactos', true
    ) RETURNING id INTO v_permiso_id;
    permisos_seeded := 1;
  END IF;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, v_permiso_id, true
  FROM public.roles r
  WHERE r.tenant_id = p_tenant_id
    AND upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO', 'CAJERO', 'VENDEDOR')
    AND coalesce(r.activo, true)
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id = r.id AND rp.permiso_id = v_permiso_id
    );
  GET DIAGNOSTICS role_permissions_seeded = ROW_COUNT;
  RETURN NEXT;
END;
$function$;

DO $wrap$
BEGIN
  IF to_regprocedure('app.seed_operational_rbac_for_tenant_base_471(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
      RENAME TO seed_operational_rbac_for_tenant_base_471;
  END IF;
END;
$wrap$;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid,
  p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
  v_pos record;
BEGIN
  SELECT * INTO v_base
  FROM app.seed_operational_rbac_for_tenant_base_471(
    p_tenant_id, p_source_tenant_id
  );
  SELECT * INTO v_pos FROM app.sembrar_permiso_pos_canje_471(p_tenant_id);
  permisos_seeded := coalesce(v_base.permisos_seeded, 0)
    + coalesce(v_pos.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0)
    + coalesce(v_pos.role_permissions_seeded, 0);
  RETURN NEXT;
END;
$function$;

DO $seed_existing$
DECLARE
  v_tenant_id uuid;
BEGIN
  FOR v_tenant_id IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permiso_pos_canje_471(v_tenant_id);
  END LOOP;
END;
$seed_existing$;

REVOKE ALL ON FUNCTION app.validar_ruc_peru_471(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pos_ticket_receiver_valid_471(text,text,numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pos_ticket_items_cpe_471(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pos_ticket_sale_postconditions_471(public.ventas_pos) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pos_registrar_ticket_atomic_tx_471(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pos_canjear_ticket_tx_471(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.cerrar_caja_tx_471(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.sembrar_permiso_pos_canje_471(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb) TO service_role;

COMMENT ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb) IS
  'POS 471: emitir_cpe=false crea Txxx interno sin correlativo/CPE fiscal; true conserva emisión inmediata 451.';
COMMENT ON FUNCTION public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb) IS
  'Canje 471: reserva 01/03 y relinkea CxC sin repetir stock, pagos, caja, ingreso, costo ni comisión.';
COMMENT ON TABLE public.pos_ticket_canjes IS
  'Historial inmutable del único canje fiscal permitido por venta POS Txxx.';

ALTER TABLE public.ventas_pos VALIDATE CONSTRAINT ck_ventas_pos_tipo_emision_471;

COMMIT;

NOTIFY pgrst, 'reload schema';
