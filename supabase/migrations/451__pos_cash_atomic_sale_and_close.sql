-- ============================================================================
-- 451__pos_cash_atomic_sale_and_close.sql
-- POS/caja: una venta confirma en el mismo commit su huella idempotente,
-- detalle, pagos, inventario por almacén, efectivo de gaveta, CxC, cola CPE y
-- outbox contable. Apertura y cierre dejan de depender de escrituras parciales.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.ventas_pos
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS accounting_event_id uuid,
  ADD COLUMN IF NOT EXISTS atomic_result jsonb,
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS credito_monto numeric NOT NULL DEFAULT 0;

ALTER TABLE public.detalle_ventas_pos
  ADD COLUMN IF NOT EXISTS movimiento_id uuid,
  ADD COLUMN IF NOT EXISTS es_servicio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controla_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS costo_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS afectacion_igv text;

ALTER TABLE public.sesiones_caja
  ADD COLUMN IF NOT EXISTS close_fingerprint text,
  ADD COLUMN IF NOT EXISTS close_result jsonb,
  ADD COLUMN IF NOT EXISTS close_event_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_pos_documento_fkey_451'
      AND conrelid = 'public.ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ventas_pos_documento_fkey_451
      FOREIGN KEY (documento_id)
      REFERENCES public.documentos(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_pos_cuenta_por_cobrar_fkey_451'
      AND conrelid = 'public.ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ventas_pos_cuenta_por_cobrar_fkey_451
      FOREIGN KEY (cuenta_por_cobrar_id)
      REFERENCES public.cuentas_por_cobrar(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'detalle_ventas_pos_movimiento_fkey_451'
      AND conrelid = 'public.detalle_ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.detalle_ventas_pos
      ADD CONSTRAINT detalle_ventas_pos_movimiento_fkey_451
      FOREIGN KEY (movimiento_id)
      REFERENCES public.movimientos_inventario(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ventas_pos_credito_monto_451'
      AND conrelid = 'public.ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_credito_monto_451
      CHECK (credito_monto >= 0 AND credito_monto <= coalesce(total, 0) + 0.01)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ventas_pos_moneda_451'
      AND conrelid = 'public.ventas_pos'::regclass
  ) THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_moneda_451 CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
  END IF;

  -- El movimiento se crea inmediatamente después del snapshot del detalle,
  -- dentro de la misma transacción. La postcondición de la venta exige el
  -- vínculo antes del COMMIT; el CHECK no puede exigirlo durante ese INSERT
  -- intermedio porque los CHECK de PostgreSQL no son diferibles.
  ALTER TABLE public.detalle_ventas_pos
    DROP CONSTRAINT IF EXISTS ck_detalle_ventas_pos_snapshot_451;
  ALTER TABLE public.detalle_ventas_pos
    ADD CONSTRAINT ck_detalle_ventas_pos_snapshot_451 CHECK (
      costo_unitario >= 0
      AND (NOT es_servicio OR NOT controla_stock)
    ) NOT VALID;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_pos_tenant_accounting_event_451
  ON public.ventas_pos (tenant_id, accounting_event_id)
  WHERE tenant_id IS NOT NULL AND accounting_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sesiones_caja_tenant_close_event_451
  ON public.sesiones_caja (tenant_id, close_event_id)
  WHERE tenant_id IS NOT NULL AND close_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cortes_caja_tenant_sesion_451
  ON public.cortes_caja (tenant_id, sesion_caja_id)
  WHERE tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL;

-- El catálogo anterior no podía expresar crédito: cualquier código desconocido
-- terminaba como EFECTIVO. Crédito es una condición de cobro explícita y crea CxC.
ALTER TABLE public.metodos_pago
  DROP CONSTRAINT IF EXISTS ck_metodos_pago_tipo_taxonomia;
ALTER TABLE public.metodos_pago
  ADD CONSTRAINT ck_metodos_pago_tipo_taxonomia CHECK (
    tipo IS NULL OR upper(tipo) IN (
      'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'BILLETERA_DIGITAL', 'CREDITO'
    )
  );

INSERT INTO public.metodos_pago (
  tenant_id, codigo, nombre, tipo, activo, estado, metadata, created_at, updated_at
)
SELECT NULL, 'credito', 'Crédito', 'CREDITO', true, 'ACTIVO',
       jsonb_build_object('source', 'migration_451', 'genera_cxc', true), now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.metodos_pago mp
  WHERE mp.tenant_id IS NULL AND lower(btrim(coalesce(mp.codigo, ''))) = 'credito'
);

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.ventas_pos, public.detalle_ventas_pos, public.ventas_pos_pagos,
  public.sesiones_caja, public.movimientos_caja, public.cortes_caja
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.assert_pos_actor_451(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
      AND lower(coalesce(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'POS_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.pos_items_canonical_451(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'producto_id', app.to_uuid_or_null(coalesce(x->>'producto_id', '')),
      'cantidad', round(app.to_numeric_or_zero(x->>'cantidad'), 6),
      'precio_unitario', round(app.to_numeric_or_zero(coalesce(x->>'precio_unitario', x->>'precio_original')), 6),
      'descuento_monto', round(app.to_numeric_or_zero(x->>'descuento_monto'), 2),
      'subtotal', round(app.to_numeric_or_zero(x->>'subtotal'), 2),
      'igv', round(app.to_numeric_or_zero(x->>'igv'), 2)
    )
    ORDER BY
      coalesce(x->>'producto_id', ''),
      round(app.to_numeric_or_zero(x->>'cantidad'), 6),
      round(app.to_numeric_or_zero(coalesce(x->>'precio_unitario', x->>'precio_original')), 6),
      round(app.to_numeric_or_zero(x->>'descuento_monto'), 2),
      round(app.to_numeric_or_zero(x->>'subtotal'), 2),
      round(app.to_numeric_or_zero(x->>'igv'), 2)
  ), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
$$;

CREATE OR REPLACE FUNCTION app.pos_payments_canonical_451(p_pagos jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'metodo_pago_id', app.to_uuid_or_null(coalesce(x->>'metodo_pago_id', '')),
      'codigo', lower(btrim(coalesce(x->>'codigo', x->>'metodo_pago', ''))),
      'monto', round(app.to_numeric_or_zero(x->>'monto'), 2),
      'moneda', upper(coalesce(nullif(btrim(x->>'moneda'), ''), 'PEN')),
      'referencia', nullif(btrim(coalesce(x->>'referencia', '')), '')
    )
    ORDER BY
      coalesce(x->>'metodo_pago_id', ''),
      lower(btrim(coalesce(x->>'codigo', x->>'metodo_pago', ''))),
      lower(btrim(coalesce(x->>'referencia', ''))),
      round(app.to_numeric_or_zero(x->>'monto'), 2)
  ), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) x;
$$;

CREATE OR REPLACE FUNCTION app.pos_account_code_for_payment_451(p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(btrim(coalesce(p_tipo, '')))
    WHEN 'EFECTIVO' THEN '10111'
    WHEN 'TARJETA' THEN '10411'
    WHEN 'TRANSFERENCIA' THEN '10412'
    WHEN 'BILLETERA_DIGITAL' THEN '10412'
    WHEN 'CREDITO' THEN '12'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION app.pos_sale_postconditions_451(
  p_venta public.ventas_pos
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_expected_physical integer;
  v_actual_physical integer;
  v_effective numeric;
  v_cash_recorded numeric;
  v_paid numeric;
  v_count integer;
BEGIN
  IF p_venta.request_fingerprint IS NULL
     OR p_venta.atomic_result IS NULL
     OR p_venta.accounting_event_id IS NULL
     OR p_venta.documento_id IS NULL
     OR p_venta.cpe_data IS NULL
     OR NOT coalesce(p_venta.cpe_pendiente, false) AND p_venta.cpe_id IS NULL THEN
    RAISE EXCEPTION 'POS_LEGACY_SALE_REQUIRES_RECONCILIATION' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.outbox_events o
  WHERE o.tenant_id = p_venta.tenant_id
    AND o.event_id = p_venta.accounting_event_id
    AND o.event_type = 'pos.venta.registrada'
    AND o.aggregate_id = p_venta.id::text;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POS_ACCOUNTING_OUTBOX_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT d.producto_id),
         count(DISTINCT d.movimiento_id)
    INTO v_expected_physical, v_actual_physical
  FROM public.detalle_ventas_pos d
  WHERE d.tenant_id = p_venta.tenant_id
    AND coalesce(d.venta_pos_id, d.venta_id) = p_venta.id
    AND d.controla_stock
    AND NOT d.es_servicio;
  IF v_expected_physical <> v_actual_physical THEN
    RAISE EXCEPTION 'POS_INVENTORY_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_count
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
    HAVING m.id IS NULL OR abs(coalesce(m.cantidad, 0) - sum(d.cantidad)) > 0.000001
  ) invalid_inventory;
  IF v_count <> 0 OR EXISTS (
    SELECT 1 FROM public.detalle_ventas_pos d
    WHERE d.tenant_id = p_venta.tenant_id
      AND coalesce(d.venta_pos_id, d.venta_id) = p_venta.id
      AND NOT d.controla_stock AND d.movimiento_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'POS_INVENTORY_REFERENCE_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(p.monto) FILTER (WHERE upper(p.metodo_pago_tipo) = 'EFECTIVO'), 0),
         coalesce(sum(p.monto), 0)
    INTO v_effective, v_paid
  FROM public.ventas_pos_pagos p
  WHERE p.tenant_id = p_venta.tenant_id AND p.venta_pos_id = p_venta.id;
  IF abs(v_paid - p_venta.total) > 0.01 THEN
    RAISE EXCEPTION 'POS_PAYMENT_TOTAL_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;
  SELECT count(*), coalesce(sum(m.monto), 0) INTO v_count, v_cash_recorded
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_venta.tenant_id
    AND m.sesion_caja_id = p_venta.sesion_caja_id
    AND m.referencia_tipo = 'venta_pos'
    AND m.referencia_documento = p_venta.id::text
    AND m.tipo_movimiento = 'VENTA';
  IF (coalesce(v_effective, 0) > 0 AND (v_count <> 1 OR abs(v_cash_recorded - v_effective) > 0.01))
     OR (coalesce(v_effective, 0) = 0 AND v_count <> 0) THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  IF p_venta.credito_monto > 0 THEN
    IF p_venta.cuenta_por_cobrar_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.cuentas_por_cobrar c
      WHERE c.id = p_venta.cuenta_por_cobrar_id
        AND c.tenant_id = p_venta.tenant_id
        AND c.documento_id = p_venta.documento_id
        AND abs(coalesce(c.monto_pendiente, 0) - p_venta.credito_monto) <= 0.01
    ) THEN
      RAISE EXCEPTION 'POS_CXC_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
  ELSIF p_venta.cuenta_por_cobrar_id IS NOT NULL THEN
    RAISE EXCEPTION 'POS_UNEXPECTED_CXC_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = p_venta.documento_id AND d.tenant_id = p_venta.tenant_id
      AND abs(d.total - p_venta.total) <= 0.01
      AND d.serie = (p_venta.cpe_data->>'serie')
      AND d.numero = lpad(p_venta.cpe_data->>'numero', 8, '0')
  ) OR app.to_uuid_or_null(coalesce(p_venta.cpe_data->>'documento_id', ''))
       IS DISTINCT FROM p_venta.documento_id THEN
    RAISE EXCEPTION 'POS_DOCUMENT_CPE_POSTCONDITION_FAILED' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.pos_registrar_venta_atomic_tx_451(
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
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_items jsonb := app.pos_items_canonical_451(p_payload->'items');
  v_pagos_input jsonb := app.pos_payments_canonical_451(p_payload->'pagos');
  v_cpe_request jsonb := coalesce(p_payload->'cpe_data', '{}'::jsonb) - 'numero';
  v_fingerprint text;
  v_existing public.ventas_pos%ROWTYPE;
  v_sesion public.sesiones_caja%ROWTYPE;
  v_caja public.cajas%ROWTYPE;
  v_empresa public.empresa_config%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_item jsonb;
  v_producto public.productos%ROWTYPE;
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
  v_total_gravadas numeric := 0;
  v_total_exoneradas numeric := 0;
  v_total_inafectas numeric := 0;
  v_total_exportacion numeric := 0;
  v_total numeric;
  v_costo_ventas numeric := 0;
  v_tasa_igv numeric;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN'));
  v_ticket_serie text := upper(coalesce(nullif(btrim(p_payload->>'ticket_serie'), ''), 'T001'));
  v_ticket_correlativo text;
  v_ticket text;
  v_tipo_cpe text := btrim(coalesce(v_cpe_request->>'tipo_documento', ''));
  v_serie_cpe text := upper(btrim(coalesce(v_cpe_request->>'serie', '')));
  v_numero_cpe text;
  v_cpe_data jsonb;
  v_venta public.ventas_pos%ROWTYPE;
  v_detalle_id uuid;
  v_item_index integer := 0;
  v_movimiento_id uuid;
  v_cash_movement public.movimientos_caja%ROWTYPE;
  v_efectivo numeric := 0;
  v_credito numeric := 0;
  v_pagos_total numeric := 0;
  v_cxc_id uuid;
  v_documento_id uuid;
  v_cxc_event_id uuid := gen_random_uuid();
  v_accounting_event_id uuid := gen_random_uuid();
  v_accounting_key text;
  v_payment_count integer := 0;
  v_metodo_principal text;
  v_limite_credito numeric;
  v_saldo_cliente numeric;
  v_fecha_vencimiento date;
  v_result jsonb;
  v_items_result jsonb;
  v_cpe_items jsonb := '[]'::jsonb;
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
  IF v_tipo_cpe NOT IN ('01', '03')
     OR v_serie_cpe !~ '^[A-Z0-9]{4}$'
     OR v_serie_cpe ~ '^T' THEN
    RAISE EXCEPTION 'POS_CPE_TYPE_OR_SERIES_INVALID' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'sesion_caja_id', p_sesion_caja_id,
    'cliente_id', app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')),
    'cliente_documento', btrim(coalesce(p_payload->>'cliente_documento', '')),
    'cliente_nombre', btrim(coalesce(p_payload->>'cliente_nombre', '')),
    'items', v_items,
    'pagos', v_pagos_input,
    'metodo_pago', lower(btrim(coalesce(p_payload->>'metodo_pago', ''))),
    'moneda', v_moneda,
    'ticket_serie', v_ticket_serie,
    -- Fechas de emisión/reintento son volátiles y no cambian la intención;
    -- todo el resto del snapshot fiscal sí forma parte de la huella.
    'cpe', v_cpe_request - ARRAY[
      'numero', 'venta_pos_id', 'documento_id', 'idempotency_key',
      'fecha_emision', 'fecha_vencimiento', 'timestamp'
    ]::text[]
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos.sale:' || p_tenant_id::text || ':' || v_key, 451
  ));

  SELECT * INTO v_existing
  FROM public.ventas_pos vp
  WHERE vp.tenant_id = p_tenant_id AND vp.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS NULL THEN
      RAISE EXCEPTION 'POS_LEGACY_SALE_REQUIRES_RECONCILIATION' USING ERRCODE = '23514';
    END IF;
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    PERFORM app.pos_sale_postconditions_451(v_existing);
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
  IF upper(coalesce(v_empresa.pais, 'PE')) = 'PE' AND (
       (v_tipo_cpe = '01' AND v_serie_cpe !~ '^F[A-Z0-9]{3}$')
       OR (v_tipo_cpe = '03' AND v_serie_cpe !~ '^B[A-Z0-9]{3}$')
     ) THEN
    RAISE EXCEPTION 'POS_CPE_SERIES_DOES_NOT_MATCH_TYPE' USING ERRCODE = '23514';
  END IF;
  IF upper(coalesce(v_empresa.moneda_defecto, v_moneda)) <> v_moneda THEN
    RAISE EXCEPTION 'POS_CURRENCY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  v_tasa_igv := greatest(0, coalesce(v_empresa.igv_porcentaje, 18) / 100);

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
       )
       OR v_descuento < 0 OR v_descuento > round(v_cantidad * v_precio, 2)
       OR abs(v_subtotal_item - round(v_cantidad * v_precio - v_descuento, 2)) > 0.01 THEN
      RAISE EXCEPTION 'POS_ITEM_PRICE_OR_TOTAL_INVALID: %', v_producto.id
        USING ERRCODE = '23514';
    END IF;
    -- Desde aquí el precio autorizado es exactamente el elegido de la lista
    -- vigente (venta/mayorista/especial), no un valor libre del navegador.
    v_precio_catalogo := v_precio;
    IF coalesce(v_empresa.requiere_aprobacion_descuento, false)
       AND coalesce(v_empresa.porcentaje_descuento_maximo, 0) >= 0
       AND v_descuento > 0
       AND (v_descuento / nullif(v_cantidad * v_precio_catalogo, 0)) * 100
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
    CASE left(coalesce(v_producto.afectacion_igv, '10'), 1)
      WHEN '1' THEN v_total_gravadas := v_total_gravadas + v_subtotal_item;
      WHEN '2' THEN v_total_exoneradas := v_total_exoneradas + v_subtotal_item;
      WHEN '3' THEN v_total_inafectas := v_total_inafectas + v_subtotal_item;
      WHEN '4' THEN v_total_exportacion := v_total_exportacion + v_subtotal_item;
      ELSE RAISE EXCEPTION 'POS_ITEM_TAX_AFFECTATION_INVALID: producto=%', v_producto.id
        USING ERRCODE = '23514';
    END CASE;
    v_cpe_items := v_cpe_items || jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto.id,
      'codigo', coalesce(v_producto.codigo, 'PROD'),
      'descripcion', coalesce(v_producto.nombre, 'Producto'),
      'unidad', coalesce(v_producto.unidad_medida,
        CASE WHEN coalesce(v_producto.es_servicio, false) THEN 'ZZ' ELSE 'NIU' END),
      'cantidad', v_cantidad,
      -- El XML espera precios unitarios netos y con impuesto, mientras que el
      -- detalle POS conserva por separado precio de lista y descuento de línea.
      'precio_unitario', round(v_subtotal_item / v_cantidad, 6),
      'valor_unitario', round(v_subtotal_item / v_cantidad, 6),
      'precio_venta', round((v_subtotal_item + v_igv_item) / v_cantidad, 6),
      'descuento', v_descuento,
      'descuento_unitario', round(v_descuento / v_cantidad, 6),
      'valor_venta', v_subtotal_item,
      'igv', v_igv_item,
      'impuesto_igv', v_igv_item,
      'total', round(v_subtotal_item + v_igv_item, 2),
      'total_item', round(v_subtotal_item + v_igv_item, 2),
      'afectacion_igv', coalesce(v_producto.afectacion_igv, '10'),
      'tipo_afectacion_igv', coalesce(v_producto.afectacion_igv, '10')
    ));
    IF NOT coalesce(v_producto.es_servicio, false)
       AND coalesce(v_producto.controla_stock, true) THEN
      v_costo_ventas := v_costo_ventas
        + round(v_cantidad * coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0), 2);
    END IF;
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  v_igv := round(v_igv, 2);
  v_total_gravadas := round(v_total_gravadas, 2);
  v_total_exoneradas := round(v_total_exoneradas, 2);
  v_total_inafectas := round(v_total_inafectas, 2);
  v_total_exportacion := round(v_total_exportacion, 2);
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
    SELECT * INTO v_cliente
    FROM public.clientes c
    WHERE c.id = app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', ''))
      AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
      AND upper(coalesce(c.estado::text, 'ACTIVO')) = 'ACTIVO'
    FOR SHARE;
    IF NOT FOUND THEN
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
  ELSIF app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.clientes c
          WHERE c.id = app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', ''))
            AND c.tenant_id = p_tenant_id
        ) THEN
    RAISE EXCEPTION 'POS_CUSTOMER_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;

  IF abs(app.to_numeric_or_zero(v_cpe_request->>'total_venta') - v_total) > 0.01
     OR abs(app.to_numeric_or_zero(v_cpe_request->>'total_igv') - v_igv) > 0.01
     OR (nullif(v_cpe_request->>'ruc_emisor', '') IS NOT NULL
       AND btrim(v_cpe_request->>'ruc_emisor') <> btrim(v_empresa.ruc))
     OR btrim(coalesce(v_cpe_request->>'documento_receptor', ''))
        <> btrim(coalesce(p_payload->>'cliente_documento', '')) THEN
    RAISE EXCEPTION 'POS_CPE_SNAPSHOT_TOTAL_OR_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_ticket_correlativo := public.obtener_siguiente_numero_pos(
    p_tenant_id, v_ticket_serie, 'TICKET', v_caja.id
  );
  v_ticket := v_ticket_serie || '-' || v_ticket_correlativo;
  v_numero_cpe := public.obtener_siguiente_numero_documento(
    p_tenant_id, v_tipo_cpe, v_serie_cpe
  );
  v_cpe_data := (v_cpe_request - 'items') || jsonb_build_object(
    'numero', app.to_numeric_or_zero(v_numero_cpe),
    'tipo_documento', v_tipo_cpe,
    'serie', v_serie_cpe,
    'idempotency_key', 'pos.cpe:' || p_tenant_id::text || ':' || v_key,
    'total_venta', v_total,
    'total_igv', v_igv,
    'total_gravadas', v_total_gravadas,
    'total_exoneradas', v_total_exoneradas,
    'total_inafectas', v_total_inafectas,
    'total_exportacion', v_total_exportacion,
    'items', v_cpe_items,
    'costo_ventas', v_costo_ventas,
    'cliente_id', app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')),
    'condicion_pago', CASE WHEN v_credito > 0 THEN 'CREDITO' ELSE 'CONTADO' END,
    'es_credito', v_credito > 0,
    'venta_pos_id', NULL
  );

  v_metodo_principal := CASE WHEN v_payment_count > 1 THEN 'MIXTO'
    ELSE coalesce(v_pagos_resueltos->0->>'codigo', 'efectivo') END;

  INSERT INTO public.ventas_pos (
    tenant_id, cliente_id, usuario_id, cliente_documento, cliente_nombre,
    metodo_pago, sesion_caja_id, subtotal, impuestos, total, cpe_pendiente,
    cpe_data, estado, numero_ticket, serie, correlativo, idempotency_key,
    request_fingerprint, accounting_event_id, moneda, credito_monto,
    cxc_pendiente, cxc_error, cxc_reintentos, fecha, metadata,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')),
    p_usuario_id, btrim(coalesce(p_payload->>'cliente_documento', '')),
    btrim(coalesce(p_payload->>'cliente_nombre', '')), v_metodo_principal,
    p_sesion_caja_id, v_subtotal, v_igv, v_total, true,
    v_cpe_data, 'PAGADA', v_ticket, v_ticket_serie, v_ticket_correlativo,
    v_key, v_fingerprint, v_accounting_event_id, v_moneda, v_credito,
    false, NULL, 0, now(),
    jsonb_build_object('atomic_rpc', 'pos_registrar_venta_atomic_tx_451',
      'schema_version', 451, 'caja_id', v_caja.id,
      'almacen_id', v_caja.almacen_id), now(), now()
  ) RETURNING * INTO v_venta;

  v_cpe_data := v_cpe_data || jsonb_build_object('venta_pos_id', v_venta.id);

  -- La CxC exige un documento operativo real. Se crea el encabezado fiscal
  -- reservado en el mismo commit y el worker CPE lo adopta por documento_id;
  -- nunca se usa el UUID de ventas_pos como si fuera un documento.
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
    p_tenant_id,
    CASE v_tipo_cpe WHEN '01' THEN 'FACTURA' ELSE 'BOLETA' END,
    v_serie_cpe, lpad(v_numero_cpe, 8, '0'), current_date,
    CASE WHEN v_credito > 0
      THEN (current_date + coalesce(v_empresa.dias_vencimiento_factura, 30))::timestamptz
      ELSE current_date::timestamptz END,
    v_moneda, 1, v_subtotal, 0, v_igv, 0, 0, v_total,
    v_total_gravadas, v_total_exoneradas,
    v_total_inafectas, v_total_exportacion,
    coalesce(nullif(v_cpe_request->>'ruc_emisor', ''), v_empresa.ruc),
    coalesce(nullif(v_cpe_request->>'razon_social_emisor', ''), v_empresa.razon_social),
    v_cpe_request->>'direccion_emisor',
    v_cpe_request->>'tipo_documento_receptor',
    v_cpe_request->>'documento_receptor', v_cpe_request->>'documento_receptor',
    v_cpe_request->>'razon_social_receptor', v_cpe_request->>'razon_social_receptor',
    v_cpe_request->>'direccion_receptor',
    app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')),
    CASE WHEN v_credito > 0 THEN 'CREDITO' ELSE 'CONTADO' END,
    'EMITIDO', 'PENDIENTE',
    'Documento POS reservado atómicamente para ' || v_ticket,
    p_usuario_id, p_usuario_id,
    jsonb_build_object('source', 'pos.atomic.451', 'venta_pos_id', v_venta.id,
      'idempotency_key', v_key, 'cpe_pendiente', true, 'schema_version', 451),
    now(), now()
  ) RETURNING id INTO v_documento_id;

  v_cpe_data := v_cpe_data || jsonb_build_object('documento_id', v_documento_id);
  UPDATE public.ventas_pos
  SET cpe_data = v_cpe_data, documento_id = v_documento_id, updated_at = now()
  WHERE id = v_venta.id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_item_index := v_item_index + 1;
    SELECT * INTO v_producto
    FROM public.productos p
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
      coalesce(v_producto.unidad_medida, CASE WHEN coalesce(v_producto.es_servicio, false) THEN 'ZZ' ELSE 'NIU' END),
      'CONFIRMADO', coalesce(v_producto.es_servicio, false),
      NOT coalesce(v_producto.es_servicio, false) AND coalesce(v_producto.controla_stock, true),
      CASE WHEN NOT coalesce(v_producto.es_servicio, false) AND coalesce(v_producto.controla_stock, true)
        THEN coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0) ELSE 0 END,
      coalesce(v_producto.afectacion_igv, '10'),
      jsonb_build_object('source', 'pos', 'idempotency_key', v_key,
        'classification_snapshot', true, 'schema_version', 451), now(), now()
    ) RETURNING id INTO v_detalle_id;
  END LOOP;

  FOR v_producto IN
    SELECT p.*
    FROM public.productos p
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
      'VENTA_POS', v_venta.id, 'Salida POS por venta ' || v_ticket,
      NULL, NULL, NULL, p_usuario_id::text,
      jsonb_build_object('source', 'pos', 'idempotency_key', v_key,
        'numero_ticket', v_ticket, 'sesion_caja_id', p_sesion_caja_id,
        'caja_id', v_caja.id, 'almacen_id', v_caja.almacen_id,
        'costo_unitario', coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0),
        'schema_version', 451), false
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
      jsonb_build_object('source', 'pos', 'idempotency_key', v_key,
        'cuenta_contable', v_pago->>'cuentaCodigo', 'schema_version', 451),
      now(), now()
    );
  END LOOP;

  IF v_efectivo > 0 THEN
    v_cash_movement := public.registrar_movimiento_caja(
      p_sesion_caja_id, 'VENTA', v_efectivo, v_venta.id::text,
      'venta_pos', 'Venta POS ' || v_ticket, p_usuario_id,
      NULL, NULL, jsonb_build_object('source', 'pos',
        'idempotency_key', v_key, 'pagos_mixtos', v_payment_count > 1,
        'schema_version', 451)
    );
  END IF;

  IF v_credito > 0 THEN
    v_fecha_vencimiento := current_date + coalesce(v_empresa.dias_vencimiento_factura, 30);
    INSERT INTO public.cuentas_por_cobrar (
      tenant_id, cliente_id, documento_id, serie, numero, numero_documento,
      tipo_documento, fecha_emision, fecha_vencimiento, moneda,
      monto_total, monto_original, monto_pendiente, saldo_pendiente, saldo,
      total, estado, activo, dias_mora, retencion_total, percepcion_total,
      detraccion_total, anticipo_total, event_id, idempotency_key, event_source,
      metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_cliente.id, v_documento_id, v_serie_cpe,
      lpad(v_numero_cpe, 8, '0'), v_serie_cpe || '-' || lpad(v_numero_cpe, 8, '0'),
      v_tipo_cpe, current_date, v_fecha_vencimiento, v_moneda,
      v_credito, v_credito, v_credito, v_credito, v_credito,
      v_credito, 'PENDIENTE', true, 0, 0, 0, 0, 0,
      v_cxc_event_id, 'pos.cxc:' || p_tenant_id::text || ':' || v_key,
      'pos.atomic.451', jsonb_build_object('venta_pos_id', v_venta.id,
        'numero_ticket', v_ticket, 'schema_version', 451), now(), now()
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
      'numeroFiscal', v_serie_cpe || '-' || lpad(v_numero_cpe, 8, '0'),
      'clienteId', app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')),
      'clienteNombre', btrim(coalesce(p_payload->>'cliente_nombre', '')),
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
      'cxcCreadaAtomicamente', v_credito = 0 OR v_cxc_id IS NOT NULL,
      'inventarioAplicado', true,
      'cpeEncoladoAtomicamente', true,
      'items', v_items,
      'schemaVersion', 451
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
    'estado', 'PAGADA',
    'subtotal', v_subtotal,
    'impuestos', v_igv,
    'total', v_total,
    'cpe_id', NULL,
    'cpe_pendiente', true,
    'facturacion_pendiente', true,
    'cuenta_por_cobrar_id', v_cxc_id,
    'documento_id', v_documento_id,
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

  PERFORM app.pos_sale_postconditions_451(v_venta);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app.abrir_caja_tx_451(
  p_tenant_id uuid,
  p_caja_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_caja public.cajas%ROWTYPE;
  v_sesion public.sesiones_caja%ROWTYPE;
  v_cajero_id uuid := coalesce(
    app.to_uuid_or_null(coalesce(p_payload->>'cajero_id', '')), p_actor_id
  );
  v_monto numeric := round(app.to_numeric_or_zero(p_payload->>'monto_inicio'), 2);
  v_moneda text := upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN'));
  v_dispositivo text := nullif(btrim(coalesce(p_payload->>'dispositivo', '')), '');
  v_supervisor_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'supervisor_id', ''));
  v_requiere_autorizacion boolean := coalesce((p_payload->>'requirio_autorizacion')::boolean, false);
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  PERFORM app.assert_pos_actor_451(p_tenant_id, v_cajero_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  IF v_monto < 0 OR v_moneda !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'CASH_OPEN_AMOUNT_OR_CURRENCY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_requiere_autorizacion THEN
    PERFORM app.assert_pos_actor_451(p_tenant_id, v_supervisor_id);
    IF nullif(btrim(coalesce(p_payload->>'razon_autorizacion', '')), '') IS NULL THEN
      RAISE EXCEPTION 'CASH_OPEN_AUTHORIZATION_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'cash.open:' || p_tenant_id::text || ':' || p_caja_id::text, 451
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'cash.open.user:' || p_tenant_id::text || ':' || v_cajero_id::text, 451
  ));
  IF v_dispositivo IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'cash.open.device:' || p_tenant_id::text || ':' || lower(v_dispositivo), 451
    ));
  END IF;

  SELECT * INTO v_caja FROM public.cajas c
  WHERE c.id = p_caja_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(v_caja.estado::text, '')) <> 'ACTIVO'
     OR v_caja.almacen_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.almacenes a
       WHERE a.id = v_caja.almacen_id AND a.tenant_id = p_tenant_id
         AND coalesce(a.activo, true)
     ) THEN
    RAISE EXCEPTION 'CASH_REGISTER_NOT_ACTIVE_OR_WITHOUT_WAREHOUSE' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sesiones_caja s
    WHERE s.tenant_id = p_tenant_id AND upper(s.estado::text) = 'ABIERTA'
      AND (s.caja_id = p_caja_id OR s.cajero_id = v_cajero_id
        OR (v_dispositivo IS NOT NULL AND lower(s.dispositivo) = lower(v_dispositivo)))
  ) THEN
    RAISE EXCEPTION 'CASH_OPEN_SESSION_ALREADY_EXISTS' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.sesiones_caja (
    tenant_id, caja_id, cajero_id, usuario_id, abierto_por, usuario_apertura,
    monto_inicio, monto_inicial, monto_esperado, monto_contado, moneda,
    dispositivo, estado, hora_apertura, fecha_apertura,
    requirio_autorizacion, autorizacion_supervisor_id, razon_autorizacion,
    denominaciones_apertura, ip_address, geolocalizacion, foto_apertura,
    user_agent, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_caja_id, v_cajero_id, v_cajero_id, p_actor_id, p_actor_id,
    v_monto, v_monto, v_monto, 0, v_moneda, v_dispositivo, 'ABIERTA', now(), now(),
    v_requiere_autorizacion, v_supervisor_id,
    nullif(btrim(coalesce(p_payload->>'razon_autorizacion', '')), ''),
    p_payload->'denominaciones_apertura',
    nullif(p_payload->>'ip_address', '')::inet,
    coalesce(p_payload->'geolocalizacion', '{}'::jsonb),
    nullif(p_payload->>'foto_apertura', ''), nullif(p_payload->>'user_agent', ''),
    jsonb_build_object('atomic_rpc', 'abrir_caja_tx_451', 'schema_version', 451,
      'almacen_id', v_caja.almacen_id), now(), now()
  ) RETURNING * INTO v_sesion;

  IF v_requiere_autorizacion THEN
    INSERT INTO public.autorizaciones_caja (
      tenant_id, sesion_caja_id, tipo_autorizacion, monto_solicitado,
      monto_min_configurado, monto_max_configurado, supervisor_id,
      solicitante_id, razon_autorizacion, ip_address, dispositivo,
      estado, aprobado_at, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_sesion.id,
      coalesce(nullif(p_payload->>'tipo_autorizacion', ''), 'APERTURA_MONTO_ATIPICO'),
      v_monto, app.to_numeric_or_zero(p_payload->>'monto_min_configurado'),
      app.to_numeric_or_zero(p_payload->>'monto_max_configurado'),
      v_supervisor_id, v_cajero_id, p_payload->>'razon_autorizacion',
      nullif(p_payload->>'ip_address', '')::inet, v_dispositivo,
      'APROBADA', now(), jsonb_build_object('schema_version', 451), now(), now()
    );
  END IF;

  RETURN to_jsonb(v_sesion) || jsonb_build_object('almacen_id', v_caja.almacen_id);
END;
$$;

CREATE OR REPLACE FUNCTION app.cash_session_integrity_hash_451(
  p_tenant_id uuid,
  p_sesion_id uuid,
  p_cierre_at timestamptz,
  p_monto_esperado numeric,
  p_monto_contado numeric,
  p_denominaciones jsonb
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', s.tenant_id,
    'sesion_id', s.id,
    'caja_id', s.caja_id,
    'cajero_id', coalesce(s.cajero_id, s.usuario_id),
    'apertura', coalesce(s.hora_apertura, s.fecha_apertura),
    'monto_inicio', round(coalesce(s.monto_inicio, s.monto_inicial, 0), 2),
    'cierre', p_cierre_at,
    'monto_esperado', round(p_monto_esperado, 2),
    'monto_contado', round(p_monto_contado, 2),
    'denominaciones', coalesce(p_denominaciones, '{}'::jsonb),
    'movimientos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'secuencia', m.secuencia, 'tipo', m.tipo_movimiento,
        'monto', round(m.monto, 2), 'saldo_anterior', round(m.saldo_anterior, 2),
        'saldo_nuevo', round(m.saldo_nuevo, 2), 'timestamp', m."timestamp",
        'referencia_tipo', m.referencia_tipo,
        'referencia_documento', m.referencia_documento
      ) ORDER BY m.secuencia, m.id)
      FROM public.movimientos_caja m
      WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.sesiones_caja s
  WHERE s.id = p_sesion_id AND s.tenant_id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION app.cerrar_caja_tx_451(
  p_tenant_id uuid,
  p_sesion_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
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
    'supervisor_id', app.to_uuid_or_null(coalesce(p_payload->>'supervisor_id', ''))
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

  -- El cierre administrativo resuelve quién cierra una sesión abandonada; no
  -- autoriza omitir un comprobante pendiente o inexistente.
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
      AND (coalesce(v.cpe_pendiente, false) OR v.cpe_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_PENDING_CPE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
      AND (v.accounting_event_id IS NULL OR v.atomic_result IS NULL
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
      'hashIntegridad', v_hash, 'schemaVersion', 451),
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
    jsonb_build_object('atomic_rpc', 'cerrar_caja_tx_451', 'schema_version', 451),
    now(), now()
  );

  v_result := jsonb_build_object(
    'id', p_sesion_id, 'estado', 'CERRADA', 'caja_id', v_sesion.caja_id,
    'monto_inicio', coalesce(v_sesion.monto_inicio, v_sesion.monto_inicial, 0),
    'monto_esperado', v_esperado, 'monto_contado', v_contado,
    'monto_cierre', v_contado, 'diferencia', v_diferencia,
    'hash_integridad', v_hash, 'hora_apertura', coalesce(v_sesion.hora_apertura, v_sesion.fecha_apertura),
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
$$;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_atomic_tx(
  p_tenant_id uuid, p_usuario_id uuid, p_sesion_caja_id uuid,
  p_idempotency_key text, p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.pos_registrar_venta_atomic_tx_451($1, $2, $3, $4, $5); $$;

CREATE OR REPLACE FUNCTION public.abrir_caja_tx(
  p_tenant_id uuid, p_caja_id uuid, p_actor_id uuid, p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.abrir_caja_tx_451($1, $2, $3, $4); $$;

CREATE OR REPLACE FUNCTION public.cerrar_caja_tx(
  p_tenant_id uuid, p_sesion_id uuid, p_actor_id uuid, p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.cerrar_caja_tx_451($1, $2, $3, $4); $$;

CREATE OR REPLACE FUNCTION app.verificar_integridad_caja_451(
  p_tenant_id uuid,
  p_sesion_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_sesion public.sesiones_caja%ROWTYPE;
  v_recalculado text;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  SELECT * INTO v_sesion FROM public.sesiones_caja s
  WHERE s.id = p_sesion_id AND s.tenant_id = p_tenant_id;
  IF NOT FOUND OR upper(v_sesion.estado::text) <> 'CERRADA'
     OR v_sesion.hash_integridad IS NULL OR v_sesion.close_event_id IS NULL THEN
    RETURN false;
  END IF;
  v_recalculado := app.cash_session_integrity_hash_451(
    p_tenant_id, p_sesion_id,
    coalesce(v_sesion.hora_cierre, v_sesion.fecha_cierre),
    v_sesion.monto_esperado, v_sesion.monto_contado,
    coalesce(v_sesion.denominaciones_cierre, '{}'::jsonb)
  );
  RETURN v_recalculado = v_sesion.hash_integridad
    AND v_sesion.close_result->>'hash_integridad' = v_sesion.hash_integridad
    AND EXISTS (
      SELECT 1 FROM public.cortes_caja c
      WHERE c.tenant_id = p_tenant_id AND c.sesion_caja_id = p_sesion_id
        AND c.integridad_hash = v_sesion.hash_integridad
    )
    AND EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.tenant_id = p_tenant_id AND o.event_id = v_sesion.close_event_id
        AND o.event_type = 'caja.cerrada'
        AND o.payload->>'hashIntegridad' = v_sesion.hash_integridad
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.verificar_integridad_caja(
  p_tenant_id uuid, p_sesion_id uuid, p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.verificar_integridad_caja_451($1, $2, $3); $$;

REVOKE ALL ON FUNCTION app.assert_pos_actor_451(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.pos_items_canonical_451(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.pos_payments_canonical_451(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.pos_account_code_for_payment_451(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.pos_sale_postconditions_451(public.ventas_pos) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.abrir_caja_tx_451(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cerrar_caja_tx_451(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.cash_session_integrity_hash_451(uuid,uuid,timestamptz,numeric,numeric,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.verificar_integridad_caja_451(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abrir_caja_tx(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verificar_integridad_caja(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.abrir_caja_tx(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.verificar_integridad_caja(uuid,uuid,uuid) TO service_role;

-- Ningún caller runtime debe volver al puente 327: su retry retorna antes de
-- validar payload y el wrapper puede descontar inventario con el carrito nuevo.
REVOKE EXECUTE ON FUNCTION public.pos_registrar_venta_full_tx(
  uuid,uuid,uuid,text,text,text,jsonb,text,uuid,text,numeric,text,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pos_registrar_venta_tx(
  uuid,uuid,uuid,text,text,text,jsonb,text,uuid,text,numeric,text,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pos_registrar_venta_tx(
  uuid,uuid,uuid,text,text,text,jsonb,text,uuid,text,numeric
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb) IS
  'Venta POS 451: huella, ticket, fiscal queue, detalle, pagos, almacén, caja, CxC y outbox contable en un commit.';
COMMENT ON FUNCTION public.abrir_caja_tx(uuid,uuid,uuid,jsonb) IS
  'Abre caja sin auto-cerrar sesiones previas; serializa caja, cajero y dispositivo.';
COMMENT ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb) IS
  'Cierra caja, verifica ventas/ledger, congela hash y crea corte/outbox en un commit idempotente.';
COMMENT ON FUNCTION public.verificar_integridad_caja(uuid,uuid,uuid) IS
  'Recalcula hash 451 y contrasta sesión, corte y outbox de cierre.';

ALTER TABLE public.ventas_pos VALIDATE CONSTRAINT ck_ventas_pos_credito_monto_451;
ALTER TABLE public.ventas_pos VALIDATE CONSTRAINT ck_ventas_pos_moneda_451;

COMMIT;

NOTIFY pgrst, 'reload schema';
