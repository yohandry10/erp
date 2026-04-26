-- Migration: Add transaction support for batch payments
-- Description: Creates a PostgreSQL function to process batch payments atomically

-- Function to process batch payments in a single transaction
CREATE OR REPLACE FUNCTION procesar_pago_lote(
  p_tenant_id UUID,
  p_cuenta_bancaria_id UUID,
  p_fecha_pago DATE,
  p_metodo_pago TEXT,
  p_referencia_lote TEXT,
  p_observaciones TEXT,
  p_pagos JSONB,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cuenta_bancaria RECORD;
  v_cxp RECORD;
  v_pago JSONB;
  v_monto_total NUMERIC := 0;
  v_monto_pago NUMERIC;
  v_nuevo_saldo_cxp NUMERIC;
  v_nuevo_estado_cxp TEXT;
  v_nuevo_saldo_banco NUMERIC;
  v_movimiento_id UUID;
  v_pagos_resultado JSONB := '[]'::JSONB;
  v_pagos_exitosos INTEGER := 0;
  v_evento_payload JSONB;
BEGIN
  -- 1. Validar que hay al menos un pago
  IF jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un pago en el lote';
  END IF;

  -- 2. Obtener y validar cuenta bancaria
  SELECT id, nombre, saldo, moneda, permite_sobregiro
  INTO v_cuenta_bancaria
  FROM cuentas_bancarias
  WHERE tenant_id = p_tenant_id
    AND id = p_cuenta_bancaria_id
    AND activa = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva';
  END IF;

  -- 3. Validar cada CxP y calcular monto total
  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    -- Obtener CxP
    SELECT 
      id, estado, saldo, total, moneda, proveedor_id, numero_documento,
      (SELECT razon_social FROM proveedores WHERE id = cuentas_por_pagar.proveedor_id) as proveedor_nombre
    INTO v_cxp
    FROM cuentas_por_pagar
    WHERE tenant_id = p_tenant_id
      AND id = (v_pago->>'cxp_id')::UUID;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta por pagar % no encontrada', v_pago->>'cxp_id';
    END IF;

    -- Validar estado
    IF v_cxp.estado = 'ANULADA' THEN
      RAISE EXCEPTION 'No se puede aplicar pago a la CxP % porque está anulada', v_cxp.numero_documento;
    END IF;

    IF v_cxp.estado = 'PAGADA' OR v_cxp.saldo <= 0 THEN
      RAISE EXCEPTION 'La CxP % ya está completamente pagada', v_cxp.numero_documento;
    END IF;

    -- Validar moneda
    IF v_cxp.moneda != v_cuenta_bancaria.moneda THEN
      RAISE EXCEPTION 'La moneda de la CxP % (%) no coincide con la moneda de la cuenta bancaria (%)',
        v_cxp.numero_documento, v_cxp.moneda, v_cuenta_bancaria.moneda;
    END IF;

    -- Determinar monto a pagar
    v_monto_pago := COALESCE((v_pago->>'monto')::NUMERIC, v_cxp.saldo);

    -- Validar monto
    IF v_monto_pago <= 0 THEN
      RAISE EXCEPTION 'El monto del pago para la CxP % debe ser mayor a 0', v_cxp.numero_documento;
    END IF;

    IF v_monto_pago > v_cxp.saldo THEN
      RAISE EXCEPTION 'El monto del pago para la CxP % (%) no puede ser mayor al saldo pendiente (%)',
        v_cxp.numero_documento, v_monto_pago, v_cxp.saldo;
    END IF;

    -- Acumular monto total
    v_monto_total := v_monto_total + v_monto_pago;
  END LOOP;

  -- Redondear monto total
  v_monto_total := ROUND(v_monto_total, 2);

  -- 4. Validar saldo suficiente en cuenta bancaria
  IF NOT v_cuenta_bancaria.permite_sobregiro AND v_cuenta_bancaria.saldo < v_monto_total THEN
    RAISE EXCEPTION 'Saldo insuficiente en la cuenta bancaria. Saldo disponible: %, Monto requerido: %',
      v_cuenta_bancaria.saldo, v_monto_total;
  END IF;

  -- 5. Procesar cada pago (todo en una transacción)
  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    -- Obtener CxP nuevamente (con datos actualizados)
    SELECT id, estado, saldo, total, moneda, proveedor_id, numero_documento,
      (SELECT razon_social FROM proveedores WHERE id = cuentas_por_pagar.proveedor_id) as proveedor_nombre
    INTO v_cxp
    FROM cuentas_por_pagar
    WHERE tenant_id = p_tenant_id
      AND id = (v_pago->>'cxp_id')::UUID;

    -- Determinar monto a pagar
    v_monto_pago := COALESCE((v_pago->>'monto')::NUMERIC, v_cxp.saldo);
    v_monto_pago := ROUND(v_monto_pago, 2);

    -- Calcular nuevo saldo de la CxP
    v_nuevo_saldo_cxp := ROUND(v_cxp.saldo - v_monto_pago, 2);

    -- Determinar nuevo estado de la CxP
    IF v_nuevo_saldo_cxp = 0 THEN
      v_nuevo_estado_cxp := 'PAGADA';
    ELSIF v_nuevo_saldo_cxp < v_cxp.total THEN
      v_nuevo_estado_cxp := 'PARCIAL';
    ELSE
      v_nuevo_estado_cxp := v_cxp.estado;
    END IF;

    -- Actualizar la CxP
    UPDATE cuentas_por_pagar
    SET 
      saldo = v_nuevo_saldo_cxp,
      estado = v_nuevo_estado_cxp,
      ultimo_pago = p_fecha_pago,
      updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND id = v_cxp.id;

    -- Crear movimiento bancario
    INSERT INTO movimientos_bancarios (
      tenant_id,
      cuenta_bancaria_id,
      tipo,
      monto,
      fecha,
      descripcion,
      referencia,
      metodo_pago,
      cxp_id,
      proveedor_id,
      conciliado,
      created_by,
      created_at
    ) VALUES (
      p_tenant_id,
      p_cuenta_bancaria_id,
      'CARGO',
      v_monto_pago,
      p_fecha_pago,
      p_referencia_lote || ' - Pago a ' || COALESCE(v_cxp.proveedor_nombre, v_cxp.proveedor_id::TEXT) || ' - Doc: ' || v_cxp.numero_documento,
      p_referencia_lote,
      p_metodo_pago,
      v_cxp.id,
      v_cxp.proveedor_id,
      false,
      p_created_by,
      NOW()
    )
    RETURNING id INTO v_movimiento_id;

    -- Insertar evento en outbox
    v_evento_payload := jsonb_build_object(
      'tenant_id', p_tenant_id,
      'lote_id', p_referencia_lote,
      'cxp_id', v_cxp.id,
      'proveedor_id', v_cxp.proveedor_id,
      'proveedor_nombre', v_cxp.proveedor_nombre,
      'numero_documento', v_cxp.numero_documento,
      'monto', v_monto_pago,
      'moneda', v_cxp.moneda,
      'fecha_pago', p_fecha_pago,
      'metodo_pago', p_metodo_pago,
      'cuenta_bancaria_id', p_cuenta_bancaria_id,
      'referencia', p_referencia_lote,
      'observaciones', p_observaciones,
      'saldo_anterior', v_cxp.saldo,
      'saldo_nuevo', v_nuevo_saldo_cxp,
      'estado_anterior', v_cxp.estado,
      'estado_nuevo', v_nuevo_estado_cxp,
      'movimiento_bancario_id', v_movimiento_id,
      'created_by', p_created_by
    );

    INSERT INTO outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      event_data,
      status,
      retry_count,
      created_at
    ) VALUES (
      'PagoProveedorRegistrado',
      'CuentaPorPagar',
      v_cxp.id,
      v_evento_payload,
      'pending',
      0,
      NOW()
    );

    -- Agregar al resultado
    v_pagos_resultado := v_pagos_resultado || jsonb_build_object(
      'cxp_id', v_cxp.id,
      'proveedor', COALESCE(v_cxp.proveedor_nombre, v_cxp.proveedor_id::TEXT),
      'numero_documento', v_cxp.numero_documento,
      'monto', v_monto_pago,
      'saldo_anterior', v_cxp.saldo,
      'saldo_nuevo', v_nuevo_saldo_cxp,
      'estado_anterior', v_cxp.estado,
      'estado_nuevo', v_nuevo_estado_cxp,
      'movimiento_bancario_id', v_movimiento_id
    );

    v_pagos_exitosos := v_pagos_exitosos + 1;
  END LOOP;

  -- 6. Actualizar saldo de la cuenta bancaria
  v_nuevo_saldo_banco := ROUND(v_cuenta_bancaria.saldo - v_monto_total, 2);
  
  UPDATE cuentas_bancarias
  SET 
    saldo = v_nuevo_saldo_banco,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND id = p_cuenta_bancaria_id;

  -- 7. Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'lote_id', p_referencia_lote,
    'total_pagos', jsonb_array_length(p_pagos),
    'monto_total', v_monto_total,
    'pagos_exitosos', v_pagos_exitosos,
    'pagos_fallidos', 0,
    'cuenta_bancaria', jsonb_build_object(
      'id', v_cuenta_bancaria.id,
      'nombre', v_cuenta_bancaria.nombre,
      'saldo_anterior', v_cuenta_bancaria.saldo,
      'saldo_nuevo', v_nuevo_saldo_banco
    ),
    'pagos', v_pagos_resultado
  );

EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, la transacción se revierte automáticamente
    RAISE EXCEPTION 'Error procesando lote de pagos: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION procesar_pago_lote TO authenticated;

-- Add comment
COMMENT ON FUNCTION procesar_pago_lote IS 'Procesa un lote de pagos a proveedores en una transacción atómica';
