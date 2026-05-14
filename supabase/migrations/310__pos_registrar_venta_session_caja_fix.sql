-- ============================================================================
-- 310__pos_registrar_venta_session_caja_fix.sql
-- Corrige POS transaccional: p_sesion_caja_id debe usarse como sesion en ventas,
-- pero la numeracion POS se agrupa por caja_id. El RPC anterior pasaba la sesion
-- como caja y fallaba con CAJA_NOT_FOUND.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_tx(
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
  total numeric
)
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_igv numeric := 0;
  v_correlativo text;
  v_ticket text;
  v_venta_id uuid;
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'B001'));
  v_caja_id uuid := NULL;
BEGIN
  IF p_sesion_caja_id IS NOT NULL THEN
    SELECT sc.caja_id
    INTO v_caja_id
    FROM public.sesiones_caja sc
    WHERE sc.id = p_sesion_caja_id
      AND sc.tenant_id = p_tenant_id
    LIMIT 1;

    IF v_caja_id IS NULL THEN
      RAISE EXCEPTION 'SESION_CAJA_NOT_FOUND: %', p_sesion_caja_id;
    END IF;
  END IF;

  SELECT COALESCE(SUM(app.to_numeric_or_zero(i->>'subtotal')), 0)
  INTO v_subtotal
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i;

  v_igv := round(v_subtotal * 0.18, 2);
  v_total := round(v_subtotal + v_igv, 2);
  v_correlativo := public.obtener_siguiente_numero_pos(p_tenant_id, v_serie, 'TICKET', v_caja_id);
  v_ticket := v_serie || '-' || v_correlativo;

  INSERT INTO public.ventas_pos(
    id, tenant_id, cliente_id, usuario_id, cliente_documento, cliente_nombre,
    metodo_pago, sesion_caja_id, subtotal, impuestos, total, cpe_pendiente,
    estado, numero_ticket, serie, correlativo, idempotency_key, fecha, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, p_cliente_id, p_usuario_id, p_cliente_documento,
    p_cliente_nombre, p_metodo_pago, p_sesion_caja_id, v_subtotal, v_igv, v_total,
    true, 'PAGADA', v_ticket, v_serie, v_correlativo,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''), now(), now(), now()
  )
  RETURNING id INTO v_venta_id;

  INSERT INTO public.outbox_events(
    id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, idempotency_key, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, 'venta_pos', v_venta_id::text, 'venta_pos.registrada',
    jsonb_build_object(
      'ventaId', v_venta_id,
      'tenantId', p_tenant_id,
      'usuarioId', p_usuario_id,
      'clienteId', p_cliente_id,
      'total', v_total,
      'numeroTicket', v_ticket,
      'items', COALESCE(p_items, '[]'::jsonb)
    ),
    'pending', NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''), now(), now()
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_venta_id, v_ticket, v_subtotal, v_igv, v_total;
END;
$$;

COMMIT;
