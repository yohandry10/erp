-- ============================================================================
-- 347__inventory_single_ledger_warehouse_pos.sql
-- Inventario: producto_existencias es la fuente fisica de verdad.
-- POS: el almacen se resuelve exclusivamente desde la caja de la sesion.
-- ============================================================================

BEGIN;

ALTER TABLE public.cajas
  DROP CONSTRAINT IF EXISTS ck_cajas_almacen_required_runtime_347;
ALTER TABLE public.cajas
  ADD CONSTRAINT ck_cajas_almacen_required_runtime_347
  CHECK (almacen_id IS NOT NULL) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_inventario_physical_reference_347
  ON public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, referencia_tipo, referencia_id
  )
  WHERE tenant_id IS NOT NULL
    AND producto_id IS NOT NULL
    AND almacen_id IS NOT NULL
    AND referencia_tipo IS NOT NULL
    AND referencia_id IS NOT NULL
    AND tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION');

CREATE OR REPLACE FUNCTION public.aplicar_movimiento_inventario_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion date DEFAULT NULL,
  p_created_by text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_liberar_reserva boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text := upper(btrim(COALESCE(p_tipo, '')));
  v_referencia_tipo text := upper(NULLIF(btrim(COALESCE(p_referencia_tipo, '')), ''));
  v_producto public.productos;
  v_existencia public.producto_existencias;
  v_movimiento_id uuid;
  v_movimiento_legacy_id uuid;
  v_stock_almacen numeric;
  v_reservado_almacen numeric;
  v_stock_total numeric;
  v_reservado_total numeric;
  v_costo_unitario numeric;
  v_metadata jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_producto_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_IDS_REQUIRED';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_QUANTITY_INVALID';
  END IF;
  IF v_tipo NOT IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION') THEN
    RAISE EXCEPTION 'INVENTORY_TYPE_UNSUPPORTED: %', v_tipo;
  END IF;

  SELECT p.*
    INTO v_producto
  FROM public.productos p
  WHERE p.id = p_producto_id
    AND p.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND_OR_TENANT_MISMATCH: %', p_producto_id;
  END IF;

  IF COALESCE(v_producto.es_servicio, false) OR NOT COALESCE(v_producto.controla_stock, true) THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_DOES_NOT_CONTROL_STOCK: %', p_producto_id;
  END IF;

  PERFORM 1
  FROM public.almacenes a
  WHERE a.id = p_almacen_id
    AND a.tenant_id = p_tenant_id
    AND COALESCE(a.activo, true)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_NOT_FOUND_IN_TENANT: %', p_almacen_id;
  END IF;

  IF p_ubicacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.almacen_ubicaciones au
    WHERE au.id = p_ubicacion_id
      AND au.tenant_id = p_tenant_id
      AND au.almacen_id = p_almacen_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_LOCATION_NOT_IN_WAREHOUSE: %', p_ubicacion_id;
  END IF;

  IF p_referencia_id IS NOT NULL AND v_referencia_tipo IS NOT NULL THEN
    SELECT mi.id
      INTO v_movimiento_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.producto_id = p_producto_id
      AND mi.almacen_id = p_almacen_id
      AND mi.tipo = v_tipo
      AND mi.referencia_tipo = v_referencia_tipo
      AND mi.referencia_id = p_referencia_id
    ORDER BY mi.created_at, mi.id
    LIMIT 1
    FOR UPDATE;

    IF v_movimiento_id IS NOT NULL THEN
      RETURN v_movimiento_id;
    END IF;

    -- Adopta el movimiento que la implementacion POS 327 inserto dentro de la
    -- misma transaccion antes de que este wrapper aplique la existencia fisica.
    SELECT mi.id
      INTO v_movimiento_legacy_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.producto_id = p_producto_id
      AND mi.almacen_id IS NULL
      AND mi.tipo = v_tipo
      AND mi.referencia_tipo = v_referencia_tipo
      AND mi.referencia_id = p_referencia_id
    ORDER BY mi.created_at DESC, mi.id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  SELECT pe.*
    INTO v_existencia
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = p_tenant_id
    AND pe.producto_id = p_producto_id
    AND pe.almacen_id = p_almacen_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_tipo <> 'ENTRADA' THEN
      RAISE EXCEPTION 'INVENTORY_EXISTENCE_REQUIRED: producto=% almacen=%', p_producto_id, p_almacen_id;
    END IF;

    INSERT INTO public.producto_existencias (
      id, tenant_id, producto_id, almacen_id, ubicacion_id, lote,
      fecha_expiracion, stock_actual, stock_reservado, stock_danado,
      estado, metadata, ultimo_movimiento_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_producto_id, p_almacen_id,
      p_ubicacion_id, p_lote, p_fecha_expiracion, 0, 0, 0,
      'ACTIVO', '{}'::jsonb, now(), now(), now()
    )
    ON CONFLICT (tenant_id, producto_id, almacen_id) DO NOTHING;

    SELECT pe.*
      INTO v_existencia
    FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id
      AND pe.producto_id = p_producto_id
      AND pe.almacen_id = p_almacen_id
    FOR UPDATE;
  END IF;

  v_stock_almacen := COALESCE(v_existencia.stock_actual, 0);
  v_reservado_almacen := COALESCE(v_existencia.stock_reservado, 0);

  IF v_tipo = 'ENTRADA' THEN
    v_stock_almacen := v_stock_almacen + p_cantidad;
  ELSIF v_tipo = 'SALIDA' THEN
    IF p_liberar_reserva THEN
      IF v_stock_almacen < p_cantidad OR v_reservado_almacen < p_cantidad THEN
        RAISE EXCEPTION 'INVENTORY_RESERVED_STOCK_INSUFFICIENT: disponible=% reservado=% solicitado=%',
          v_stock_almacen, v_reservado_almacen, p_cantidad;
      END IF;
      v_stock_almacen := v_stock_almacen - p_cantidad;
      v_reservado_almacen := v_reservado_almacen - p_cantidad;
    ELSE
      IF (v_stock_almacen - v_reservado_almacen) < p_cantidad THEN
        RAISE EXCEPTION 'INVENTORY_AVAILABLE_STOCK_INSUFFICIENT: disponible=% solicitado=%',
          v_stock_almacen - v_reservado_almacen, p_cantidad;
      END IF;
      v_stock_almacen := v_stock_almacen - p_cantidad;
    END IF;
  ELSIF v_tipo = 'RESERVA' THEN
    IF (v_stock_almacen - v_reservado_almacen) < p_cantidad THEN
      RAISE EXCEPTION 'INVENTORY_AVAILABLE_STOCK_INSUFFICIENT_FOR_RESERVATION: disponible=% solicitado=%',
        v_stock_almacen - v_reservado_almacen, p_cantidad;
    END IF;
    v_reservado_almacen := v_reservado_almacen + p_cantidad;
  ELSIF v_tipo = 'LIBERACION' THEN
    IF v_reservado_almacen < p_cantidad THEN
      RAISE EXCEPTION 'INVENTORY_RESERVATION_INSUFFICIENT_FOR_RELEASE: reservado=% solicitado=%',
        v_reservado_almacen, p_cantidad;
    END IF;
    v_reservado_almacen := v_reservado_almacen - p_cantidad;
  END IF;

  UPDATE public.producto_existencias pe
  SET stock_actual = v_stock_almacen,
      stock_reservado = v_reservado_almacen,
      ubicacion_id = COALESCE(p_ubicacion_id, pe.ubicacion_id),
      lote = COALESCE(p_lote, pe.lote),
      fecha_expiracion = COALESCE(p_fecha_expiracion, pe.fecha_expiracion),
      ultimo_movimiento_at = now(),
      updated_at = now()
  WHERE pe.id = v_existencia.id;

  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_stock_total, v_reservado_total
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = p_tenant_id
    AND pe.producto_id = p_producto_id;

  UPDATE public.productos p
  SET stock_actual = v_stock_total,
      stock = v_stock_total,
      stock_reservado = v_reservado_total,
      updated_at = now()
  WHERE p.id = p_producto_id
    AND p.tenant_id = p_tenant_id;

  v_costo_unitario := COALESCE(
    NULLIF(app.to_numeric_or_zero(COALESCE(p_metadata, '{}'::jsonb)->>'costo_unitario'), 0),
    NULLIF(v_producto.precio_compra, 0),
    NULLIF(v_producto.costo, 0),
    0
  );
  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'inventory_writer', 'aplicar_movimiento_inventario_tx',
    'almacen_id', p_almacen_id,
    'stock_almacen_actual', v_stock_almacen,
    'stock_almacen_reservado', v_reservado_almacen,
    'stock_total_actual', v_stock_total,
    'stock_total_reservado', v_reservado_total,
    'metodo_costeo', COALESCE(COALESCE(p_metadata, '{}'::jsonb)->>'metodo_costeo', 'ULTIMO_COSTO'),
    'costo_unitario', v_costo_unitario,
    'valor_total', round(p_cantidad * v_costo_unitario, 2)
  );

  IF v_movimiento_legacy_id IS NOT NULL THEN
    UPDATE public.movimientos_inventario mi
    SET almacen_id = p_almacen_id,
        ubicacion_id = COALESCE(p_ubicacion_id, mi.ubicacion_id),
        lote = COALESCE(p_lote, mi.lote),
        fecha_expiracion = COALESCE(p_fecha_expiracion::timestamptz, mi.fecha_expiracion),
        created_by = COALESCE(p_created_by, mi.created_by),
        notas = COALESCE(p_notas, mi.notas),
        stock_actual = v_stock_total::text,
        stock_reservado = v_reservado_total::text,
        metadata = COALESCE(mi.metadata, '{}'::jsonb) || v_metadata,
        updated_at = now()
    WHERE mi.id = v_movimiento_legacy_id
    RETURNING mi.id INTO v_movimiento_id;
  ELSE
    INSERT INTO public.movimientos_inventario (
      id, tenant_id, producto_id, almacen_id, ubicacion_id, lote,
      fecha_expiracion, tipo, tipo_movimiento, cantidad, referencia_tipo,
      referencia_id, created_by, motivo, notas, stock_actual, stock_reservado,
      activo, estado, metadata, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_producto_id, p_almacen_id,
      p_ubicacion_id, p_lote, p_fecha_expiracion::timestamptz,
      v_tipo, v_tipo, p_cantidad, v_referencia_tipo, p_referencia_id,
      p_created_by, COALESCE(p_notas, v_tipo || ' de inventario'), p_notas,
      v_stock_total::text, v_reservado_total::text, true, 'ACTIVO',
      v_metadata, now(), now()
    )
    RETURNING id INTO v_movimiento_id;
  END IF;

  RETURN v_movimiento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_movimiento_inventario_tx(
  uuid, uuid, uuid, text, numeric, text, uuid, text, uuid, text, date, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_movimiento_inventario_tx(
  uuid, uuid, uuid, text, numeric, text, uuid, text, uuid, text, date, text, jsonb, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_almacen(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_referencia_tipo text,
  p_referencia_id uuid,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT p.tenant_id INTO v_tenant_id
  FROM public.productos p
  WHERE p.id = p_producto_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND: %', p_producto_id;
  END IF;

  RETURN public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := p_almacen_id,
    p_tipo := p_tipo,
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := p_referencia_id,
    p_notas := p_notas,
    p_ubicacion_id := p_ubicacion_id,
    p_lote := p_lote,
    p_fecha_expiracion := p_fecha_expiracion,
    p_metadata := jsonb_build_object('compatibility_rpc', 'registrar_movimiento_almacen')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_entrada_stock_atomico(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN public.registrar_movimiento_almacen(
    p_producto_id,
    p_almacen_id,
    'ENTRADA',
    p_cantidad,
    COALESCE(p_referencia_tipo, 'ENTRADA'),
    NULLIF(p_referencia_id, '')::uuid,
    p_notas,
    p_ubicacion_id,
    p_lote,
    p_fecha_expiracion::date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.descontar_stock_y_liberar_reserva_en_almacen(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_liberar_reserva boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := p_almacen_id,
    p_tipo := 'SALIDA',
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := NULLIF(p_referencia_id, '')::uuid,
    p_notas := p_notas,
    p_metadata := jsonb_build_object('compatibility_rpc', 'descontar_stock_y_liberar_reserva_en_almacen'),
    p_liberar_reserva := p_liberar_reserva
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.descontar_stock_y_liberar_reserva(
  p_producto_id uuid,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_almacen_id uuid;
  v_almacenes integer;
  v_liberar_reserva boolean := false;
BEGIN
  SELECT p.tenant_id INTO v_tenant_id
  FROM public.productos p
  WHERE p.id = p_producto_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND: %', p_producto_id;
  END IF;

  IF NULLIF(p_referencia_id, '') IS NOT NULL THEN
    SELECT count(DISTINCT mi.almacen_id),
           (array_agg(DISTINCT mi.almacen_id))[1]
      INTO v_almacenes, v_almacen_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = v_tenant_id
      AND mi.producto_id = p_producto_id
      AND mi.tipo = 'RESERVA'
      AND mi.referencia_tipo = upper(NULLIF(btrim(COALESCE(p_referencia_tipo, '')), ''))
      AND mi.referencia_id = NULLIF(p_referencia_id, '')::uuid
      AND mi.almacen_id IS NOT NULL;
    v_liberar_reserva := COALESCE(v_almacenes, 0) = 1;
  END IF;

  IF COALESCE(v_almacenes, 0) = 0 THEN
    SELECT count(*), (array_agg(pe.almacen_id ORDER BY pe.almacen_id))[1]
      INTO v_almacenes, v_almacen_id
    FROM public.producto_existencias pe
    WHERE pe.tenant_id = v_tenant_id
      AND pe.producto_id = p_producto_id
      AND COALESCE(pe.stock_actual, 0) > 0;
    v_liberar_reserva := false;
  END IF;

  IF v_almacenes <> 1 OR v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_REQUIRED_OR_AMBIGUOUS: producto=% almacenes=%',
      p_producto_id, COALESCE(v_almacenes, 0);
  END IF;

  RETURN public.descontar_stock_y_liberar_reserva_en_almacen(
    p_tenant_id := v_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := v_almacen_id,
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := p_referencia_id,
    p_notas := p_notas,
    p_liberar_reserva := v_liberar_reserva
  );
END;
$$;

-- Conserva la implementacion 327 como detalle interno del wrapper seguro.
ALTER FUNCTION public.pos_registrar_venta_full_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb
) RENAME TO pos_registrar_venta_full_tx_legacy_327;

REVOKE ALL ON FUNCTION public.pos_registrar_venta_full_tx_legacy_327(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_full_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid DEFAULT NULL,
  p_cliente_documento text DEFAULT NULL,
  p_cliente_nombre text DEFAULT NULL,
  p_metodo_pago text DEFAULT 'efectivo',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_serie text DEFAULT 'B001',
  p_sesion_caja_id uuid DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_max_descuento_pct numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_pagos jsonb DEFAULT NULL
)
RETURNS TABLE (
  venta_id uuid,
  numero_ticket text,
  subtotal numeric,
  impuestos numeric,
  total numeric,
  impactos_aplicados boolean,
  caja_movimiento_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_sesion public.sesiones_caja;
  v_almacen_id uuid;
  v_result record;
  v_item record;
BEGIN
  IF p_tenant_id IS NULL OR p_sesion_caja_id IS NULL THEN
    RAISE EXCEPTION 'POS_OPEN_CASH_SESSION_REQUIRED';
  END IF;

  SELECT s.*
    INTO v_sesion
  FROM public.sesiones_caja s
  WHERE s.id = p_sesion_caja_id
    AND s.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND
    OR lower(COALESCE(v_sesion.estado::text, '')) <> 'abierta'
    OR v_sesion.hora_cierre IS NOT NULL
    OR v_sesion.fecha_cierre IS NOT NULL THEN
    RAISE EXCEPTION 'POS_OPEN_CASH_SESSION_REQUIRED';
  END IF;

  SELECT c.almacen_id
    INTO v_almacen_id
  FROM public.cajas c
  JOIN public.almacenes a
    ON a.id = c.almacen_id
   AND a.tenant_id = c.tenant_id
   AND COALESCE(a.activo, true)
  WHERE c.id = v_sesion.caja_id
    AND c.tenant_id = p_tenant_id
    AND lower(COALESCE(c.estado::text, '')) = 'activo'
  FOR SHARE OF c, a;

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'POS_CASH_REGISTER_WAREHOUSE_REQUIRED: caja=%', v_sesion.caja_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) i(value)
    JOIN public.productos p
      ON p.id = NULLIF(i.value->>'producto_id', '')::uuid
     AND p.tenant_id = p_tenant_id
    WHERE NOT COALESCE(p.es_servicio, false)
      AND COALESCE(p.controla_stock, true)
    GROUP BY p.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'POS_DUPLICATE_STOCK_PRODUCT_LINES';
  END IF;

  SELECT * INTO v_result
  FROM public.pos_registrar_venta_full_tx_legacy_327(
    p_tenant_id,
    p_usuario_id,
    p_cliente_id,
    p_cliente_documento,
    p_cliente_nombre,
    p_metodo_pago,
    p_items,
    p_serie,
    p_sesion_caja_id,
    p_vendedor,
    p_max_descuento_pct,
    p_idempotency_key,
    p_pagos
  );

  FOR v_item IN
    SELECT p.id AS producto_id,
           app.to_numeric_or_zero(i.value->>'cantidad') AS cantidad
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) i(value)
    JOIN public.productos p
      ON p.id = NULLIF(i.value->>'producto_id', '')::uuid
     AND p.tenant_id = p_tenant_id
    WHERE NOT COALESCE(p.es_servicio, false)
      AND COALESCE(p.controla_stock, true)
    ORDER BY p.id
  LOOP
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_item.producto_id,
      p_almacen_id := v_almacen_id,
      p_tipo := 'SALIDA',
      p_cantidad := v_item.cantidad,
      p_referencia_tipo := 'VENTA_POS',
      p_referencia_id := v_result.venta_id,
      p_notas := 'Salida POS por venta ' || v_result.numero_ticket,
      p_created_by := p_usuario_id::text,
      p_metadata := jsonb_build_object(
        'source', 'pos',
        'idempotency_key', p_idempotency_key,
        'numero_ticket', v_result.numero_ticket,
        'sesion_caja_id', p_sesion_caja_id,
        'caja_id', v_sesion.caja_id,
        'almacen_id', v_almacen_id
      )
    );
  END LOOP;

  RETURN QUERY SELECT
    v_result.venta_id,
    v_result.numero_ticket,
    v_result.subtotal,
    v_result.impuestos,
    v_result.total,
    true,
    v_result.caja_movimiento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_registrar_venta_full_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_full_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.validar_inventory_single_ledger_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (check_name text, ok boolean, detail text)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.cajas c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND lower(COALESCE(c.estado::text, '')) = 'activo'
    AND c.almacen_id IS NULL;
  RETURN QUERY SELECT 'cajas_activas_con_almacen'::text, v_count = 0,
    format('%s cajas activas sin almacen', v_count)::text;

  WITH existencia AS (
    SELECT pe.tenant_id, pe.producto_id,
           SUM(COALESCE(pe.stock_actual, 0))::numeric AS stock_actual,
           SUM(COALESCE(pe.stock_reservado, 0))::numeric AS stock_reservado
    FROM public.producto_existencias pe
    WHERE p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id
    GROUP BY pe.tenant_id, pe.producto_id
  )
  SELECT count(*) INTO v_count
  FROM public.productos p
  LEFT JOIN existencia e ON e.tenant_id = p.tenant_id AND e.producto_id = p.id
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND NOT COALESCE(p.es_servicio, false)
    AND COALESCE(p.controla_stock, true)
    AND (
      COALESCE(p.stock_actual, p.stock, 0)::numeric IS DISTINCT FROM COALESCE(e.stock_actual, 0)
      OR COALESCE(p.stock_reservado, 0)::numeric IS DISTINCT FROM COALESCE(e.stock_reservado, 0)
    );
  RETURN QUERY SELECT 'productos_derivados_de_existencias'::text, v_count = 0,
    format('%s productos divergen del agregado fisico', v_count)::text;

  SELECT count(*) INTO v_count
  FROM public.producto_existencias pe
  LEFT JOIN public.productos p ON p.id = pe.producto_id AND p.tenant_id = pe.tenant_id
  LEFT JOIN public.almacenes a ON a.id = pe.almacen_id AND a.tenant_id = pe.tenant_id
  WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id)
    AND (
      p.id IS NULL OR a.id IS NULL
      OR COALESCE(pe.stock_actual, 0) < 0
      OR COALESCE(pe.stock_reservado, 0) < 0
      OR COALESCE(pe.stock_reservado, 0) > COALESCE(pe.stock_actual, 0)
    );
  RETURN QUERY SELECT 'existencias_fisicas_validas'::text, v_count = 0,
    format('%s existencias invalidas', v_count)::text;

  SELECT count(*) INTO v_count
  FROM public.movimientos_inventario mi
  WHERE (p_tenant_id IS NULL OR mi.tenant_id = p_tenant_id)
    AND mi.tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION')
    AND (
      mi.almacen_id IS NULL
      OR COALESCE(mi.metadata->>'inventory_writer', '') <> 'aplicar_movimiento_inventario_tx'
    );
  RETURN QUERY SELECT 'movimientos_fisicos_por_writer_canonico'::text, v_count = 0,
    format('%s movimientos fisicos legacy o sin almacen', v_count)::text;

  SELECT count(*) INTO v_count
  FROM public.movimientos_inventario mi
  WHERE (p_tenant_id IS NULL OR mi.tenant_id = p_tenant_id)
    AND mi.tipo IN ('SALIDA', 'ENTRADA')
    AND (
      mi.metadata IS NULL
      OR NOT (mi.metadata ? 'costo_unitario')
      OR NOT (mi.metadata ? 'valor_total')
    );
  RETURN QUERY SELECT 'movimientos_valorizados'::text, v_count = 0,
    format('%s entradas/salidas sin costo trazable', v_count)::text;

  RETURN QUERY SELECT 'pos_resuelve_almacen_y_writer_canonico'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'pos_registrar_venta_full_tx'
        AND pg_get_functiondef(p.oid) ILIKE '%almacen_id%'
        AND pg_get_functiondef(p.oid) ILIKE '%aplicar_movimiento_inventario_tx%'
    ),
    'POS deriva almacen desde caja y usa el writer canonico';
END;
$$;

CREATE OR REPLACE VIEW public.v_inventory_single_ledger_status_actual AS
SELECT * FROM public.validar_inventory_single_ledger_runtime(NULL);

COMMENT ON FUNCTION public.aplicar_movimiento_inventario_tx(
  uuid, uuid, uuid, text, numeric, text, uuid, text, uuid, text, date, text, jsonb, boolean
) IS 'Writer canonico: bloquea producto/existencia, muta stock fisico por almacen, deriva productos y registra kardex idempotente.';
COMMENT ON FUNCTION public.pos_registrar_venta_full_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb
) IS 'POS atomico fail-closed: exige sesion abierta y almacen valido en su caja; aplica inventario mediante el writer canonico.';

COMMIT;
