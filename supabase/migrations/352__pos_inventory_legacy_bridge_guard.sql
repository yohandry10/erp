-- ============================================================================
-- 352__pos_inventory_legacy_bridge_guard.sql
-- Puente transaccional temporal para la implementacion POS 327:
-- permite su update agregado solo dentro del wrapper SECURITY DEFINER y obliga
-- a completar las existencias canonicas antes del COMMIT.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_product_stock_is_derived_350()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_stock_actual numeric;
  v_stock_reservado numeric;
BEGIN
  -- La funcion legacy está revocada para todos los roles. El único llamador es
  -- pos_registrar_venta_full_tx, que activa esta marca LOCAL y, en la misma
  -- transacción, actualiza producto_existencias con el writer canónico.
  IF current_setting('app.inventory_pos_legacy_bridge', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_stock_actual, v_stock_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = NEW.tenant_id
    AND pe.producto_id = NEW.id;

  IF TG_OP = 'INSERT' THEN
    v_stock_actual := 0;
    v_stock_reservado := 0;
  END IF;

  IF COALESCE(NEW.stock_actual, NEW.stock, 0)::numeric IS DISTINCT FROM v_stock_actual
    OR COALESCE(NEW.stock, NEW.stock_actual, 0)::numeric IS DISTINCT FROM v_stock_actual
    OR COALESCE(NEW.stock_reservado, 0)::numeric IS DISTINCT FROM v_stock_reservado THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_IS_DERIVED: use aplicar_movimiento_inventario_tx';
  END IF;

  IF (COALESCE(NEW.es_servicio, false) OR NOT COALESCE(NEW.controla_stock, true))
    AND (v_stock_actual <> 0 OR v_stock_reservado <> 0) THEN
    RAISE EXCEPTION 'PRODUCT_WITH_PHYSICAL_STOCK_CANNOT_DISABLE_STOCK_CONTROL';
  END IF;

  RETURN NEW;
END;
$$;

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

  SELECT s.* INTO v_sesion
  FROM public.sesiones_caja s
  WHERE s.id = p_sesion_caja_id AND s.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND
    OR lower(COALESCE(v_sesion.estado::text, '')) <> 'abierta'
    OR v_sesion.hora_cierre IS NOT NULL
    OR v_sesion.fecha_cierre IS NOT NULL THEN
    RAISE EXCEPTION 'POS_OPEN_CASH_SESSION_REQUIRED';
  END IF;

  SELECT c.almacen_id INTO v_almacen_id
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

  PERFORM set_config('app.inventory_pos_legacy_bridge', 'on', true);
  BEGIN
    SELECT * INTO v_result
    FROM public.pos_registrar_venta_full_tx_legacy_327(
      p_tenant_id, p_usuario_id, p_cliente_id, p_cliente_documento,
      p_cliente_nombre, p_metodo_pago, p_items, p_serie,
      p_sesion_caja_id, p_vendedor, p_max_descuento_pct,
      p_idempotency_key, p_pagos
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.inventory_pos_legacy_bridge', 'off', true);
    RAISE;
  END;
  PERFORM set_config('app.inventory_pos_legacy_bridge', 'off', true);

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
        'almacen_id', v_almacen_id,
        'legacy_bridge', 'pos_327_atomic'
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

COMMENT ON FUNCTION public.pos_registrar_venta_full_tx(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb
) IS 'POS atomico: puente interno 327 revocado + existencia canonica por almacen; cualquier fallo revierte la venta completa.';

COMMIT;
