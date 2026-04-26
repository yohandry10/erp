-- Migration 140: Corregir función pos_registrar_venta_tx para insertar en ventas_pos
DROP FUNCTION IF EXISTS pos_registrar_venta_tx CASCADE;

CREATE OR REPLACE FUNCTION pos_registrar_venta_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid,
  p_cliente_documento text,
  p_cliente_nombre text,
  p_metodo_pago text,
  p_items jsonb,
  p_serie text DEFAULT 'B001',
  p_sesion_caja_id uuid DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_max_descuento_pct numeric DEFAULT 0.5
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_correlativo bigint;
  v_impuesto_rate numeric := 0.18;
  v_subtotal numeric := 0;
  v_impuestos numeric := 0;
  v_total numeric := 0;
  v_numero text;
  v_venta_id bigint;
  v_event_payload jsonb;
  v_stock_actual numeric;
  v_item record;
  v_event_uuid uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id requerido';
  END IF;

  IF p_serie IS NULL OR p_serie !~ '^[A-Z0-9]{1,4}$' THEN
    RAISE EXCEPTION 'Serie inválida';
  END IF;

  -- Correlativo
  INSERT INTO pos_numeracion (tenant_id, serie, correlativo)
  VALUES (p_tenant_id, p_serie, 1)
  ON CONFLICT (tenant_id, serie)
  DO UPDATE SET correlativo = pos_numeracion.correlativo + 1
  RETURNING correlativo INTO v_correlativo;

  v_numero := p_serie || '-' || lpad(v_correlativo::text, 8, '0');

  -- Tasa impuesto
  BEGIN
    v_impuesto_rate := app.obtener_impuesto_principal_porcentaje(p_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    v_impuesto_rate := 0.18;
  END;

  -- Validar stock y calcular subtotal
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    producto_id uuid, cantidad numeric, precio_unitario numeric, descuento_monto numeric
  )
  LOOP
    SELECT stock INTO v_stock_actual
    FROM productos WHERE id = v_item.producto_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_stock_actual IS NULL THEN
      RAISE EXCEPTION 'Producto % no encontrado', v_item.producto_id;
    END IF;
    IF v_stock_actual < v_item.cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', v_item.producto_id;
    END IF;

    v_subtotal := v_subtotal + (v_item.cantidad * v_item.precio_unitario) - COALESCE(v_item.descuento_monto, 0);
  END LOOP;

  v_impuestos := round(v_subtotal * v_impuesto_rate, 2);
  v_total := round(v_subtotal + v_impuestos, 2);

  -- INSERTAR EN ventas_pos
  INSERT INTO ventas_pos (
    tenant_id, usuario_id, numero_venta, numero_ticket,
    cliente_id, cliente_nombre, cliente_documento,
    subtotal, impuestos, total, metodo_pago, estado,
    vendedor, cpe_pendiente, intentos_facturacion, fecha
  ) VALUES (
    p_tenant_id, p_usuario_id::text, v_numero, v_numero,
    p_cliente_id, p_cliente_nombre, p_cliente_documento,
    v_subtotal, v_impuestos, v_total, p_metodo_pago, 'PAGADA',
    p_vendedor, false, 0, NOW()
  ) RETURNING id INTO v_venta_id;

  -- Detalles y stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    producto_id uuid, cantidad numeric, precio_unitario numeric, descuento_monto numeric
  )
  LOOP
    INSERT INTO detalle_ventas_pos (
      venta_id, tenant_id, producto_id, codigo_producto, nombre_producto,
      cantidad, precio_unitario, descuento, total_parcial
    )
    SELECT v_venta_id, p_tenant_id, v_item.producto_id, p.codigo, p.nombre,
      v_item.cantidad, v_item.precio_unitario, COALESCE(v_item.descuento_monto, 0),
      (v_item.cantidad * v_item.precio_unitario) - COALESCE(v_item.descuento_monto, 0)
    FROM productos p WHERE p.id = v_item.producto_id AND p.tenant_id = p_tenant_id;

    UPDATE productos SET stock = stock - v_item.cantidad
    WHERE id = v_item.producto_id AND tenant_id = p_tenant_id;

    INSERT INTO stock_movimientos (id, tenant_id, producto_id, tipo_movimiento, cantidad, motivo, referencia, usuario_id, created_at)
    VALUES (gen_random_uuid(), p_tenant_id, v_item.producto_id, 'SALIDA', v_item.cantidad, 'Venta POS ' || v_numero, v_numero, p_usuario_id::text, NOW());
  END LOOP;

  -- Sesión caja
  IF p_sesion_caja_id IS NOT NULL THEN
    UPDATE sesiones_caja SET
      total_ventas = COALESCE(total_ventas, 0) + v_total,
      total_efectivo = COALESCE(total_efectivo, 0) + v_total,
      cantidad_ventas = COALESCE(cantidad_ventas, 0) + 1,
      updated_at = NOW()
    WHERE id = p_sesion_caja_id AND tenant_id = p_tenant_id;
  END IF;

  -- Outbox event (todas las columnas requeridas como varchar)
  v_event_uuid := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'tenantId', p_tenant_id, 'ventaId', v_venta_id, 'numeroTicket', v_numero,
    'subtotal', v_subtotal, 'impuestos', v_impuestos, 'total', v_total, 'metodoPago', p_metodo_pago
  );

  INSERT INTO outbox_events (
    id, event_id, correlation_id, aggregate_type, aggregate_id, 
    event_type, event_data, event_version, status, retry_count, 
    created_at, tenant_id
  ) VALUES (
    v_event_uuid,
    v_event_uuid::text,
    v_event_uuid::text,
    'venta_pos',
    v_venta_id::text,
    'pos.venta.registrada',
    v_event_payload,
    1,
    'pending',
    0,
    NOW(),
    p_tenant_id
  );

  RETURN jsonb_build_array(jsonb_build_object(
    'venta_id', v_venta_id, 'numero_ticket', v_numero,
    'subtotal', v_subtotal, 'impuestos', v_impuestos, 'total', v_total, 'success', true
  ));
END;
$fn$;

COMMENT ON FUNCTION pos_registrar_venta_tx IS 'Registra venta POS en ventas_pos (CORREGIDO)';
