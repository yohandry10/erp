-- Migration 074: Hardening Tesorería/CxP payment events and movements
BEGIN;

ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS saldo_nuevo NUMERIC(12,2);

COMMENT ON COLUMN movimientos_bancarios.saldo_anterior IS 'Saldo antes del movimiento (para auditoría)';
COMMENT ON COLUMN movimientos_bancarios.saldo_nuevo IS 'Saldo después del movimiento (para auditoría)';

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
  v_saldo_cuenta_actual NUMERIC;
  v_saldo_nuevo_cuenta NUMERIC;
  v_movimiento_id UUID;
  v_pagos_resultado JSONB := '[]'::JSONB;
  v_pagos_exitosos INTEGER := 0;
BEGIN
  IF jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un pago en el lote';
  END IF;

  SELECT id, nombre, saldo, moneda, permite_sobregiro
  INTO v_cuenta_bancaria
  FROM cuentas_bancarias
  WHERE tenant_id = p_tenant_id
    AND id = p_cuenta_bancaria_id
    AND activa = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva';
  END IF;

  v_saldo_cuenta_actual := v_cuenta_bancaria.saldo;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
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

    IF v_cxp.estado = 'ANULADA' THEN
      RAISE EXCEPTION 'No se puede aplicar pago a la CxP % porque está anulada', v_cxp.numero_documento;
    END IF;

    IF v_cxp.estado = 'PAGADA' OR v_cxp.saldo <= 0 THEN
      RAISE EXCEPTION 'La CxP % ya está completamente pagada', v_cxp.numero_documento;
    END IF;

    IF v_cxp.moneda != v_cuenta_bancaria.moneda THEN
      RAISE EXCEPTION 'La moneda de la CxP % (%) no coincide con la moneda de la cuenta bancaria (%)',
        v_cxp.numero_documento, v_cxp.moneda, v_cuenta_bancaria.moneda;
    END IF;

    v_monto_pago := COALESCE((v_pago->>'monto')::NUMERIC, v_cxp.saldo);

    IF v_monto_pago <= 0 THEN
      RAISE EXCEPTION 'El monto del pago para la CxP % debe ser mayor a 0', v_cxp.numero_documento;
    END IF;

    IF v_monto_pago > v_cxp.saldo THEN
      RAISE EXCEPTION 'El monto del pago para la CxP % (%) no puede ser mayor al saldo pendiente (%)',
        v_cxp.numero_documento, v_monto_pago, v_cxp.saldo;
    END IF;

    v_monto_total := v_monto_total + v_monto_pago;
  END LOOP;

  v_monto_total := ROUND(v_monto_total, 2);

  IF NOT v_cuenta_bancaria.permite_sobregiro AND v_cuenta_bancaria.saldo < v_monto_total THEN
    RAISE EXCEPTION 'Saldo insuficiente en la cuenta bancaria. Saldo disponible: %, Monto requerido: %',
      v_cuenta_bancaria.saldo, v_monto_total;
  END IF;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    SELECT id, estado, saldo, total, moneda, proveedor_id, numero_documento,
      (SELECT razon_social FROM proveedores WHERE id = cuentas_por_pagar.proveedor_id) as proveedor_nombre
    INTO v_cxp
    FROM cuentas_por_pagar
    WHERE tenant_id = p_tenant_id
      AND id = (v_pago->>'cxp_id')::UUID;

    v_monto_pago := COALESCE((v_pago->>'monto')::NUMERIC, v_cxp.saldo);
    v_monto_pago := ROUND(v_monto_pago, 2);

    v_nuevo_saldo_cxp := ROUND(v_cxp.saldo - v_monto_pago, 2);

    IF v_nuevo_saldo_cxp = 0 THEN
      v_nuevo_estado_cxp := 'PAGADA';
    ELSIF v_nuevo_saldo_cxp < v_cxp.total THEN
      v_nuevo_estado_cxp := 'PARCIAL';
    ELSE
      v_nuevo_estado_cxp := v_cxp.estado;
    END IF;

    UPDATE cuentas_por_pagar
    SET
      saldo = v_nuevo_saldo_cxp,
      estado = v_nuevo_estado_cxp,
      ultimo_pago = p_fecha_pago,
      updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND id = v_cxp.id;

    v_saldo_cuenta_actual := COALESCE(v_saldo_cuenta_actual, v_cuenta_bancaria.saldo);
    v_saldo_nuevo_cuenta := ROUND(v_saldo_cuenta_actual - v_monto_pago, 2);

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
      saldo_anterior,
      saldo_nuevo,
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
      v_saldo_cuenta_actual,
      v_saldo_nuevo_cuenta,
      p_created_by,
      NOW()
    )
    RETURNING id INTO v_movimiento_id;

    v_pagos_resultado := v_pagos_resultado || jsonb_build_object(
      'cxp_id', v_cxp.id,
      'proveedor_id', v_cxp.proveedor_id,
      'proveedor', COALESCE(v_cxp.proveedor_nombre, v_cxp.proveedor_id::TEXT),
      'numero_documento', v_cxp.numero_documento,
      'moneda', v_cxp.moneda,
      'monto', v_monto_pago,
      'saldo_anterior', v_cxp.saldo,
      'saldo_nuevo', v_nuevo_saldo_cxp,
      'estado_anterior', v_cxp.estado,
      'estado_nuevo', v_nuevo_estado_cxp,
      'movimiento_bancario_id', v_movimiento_id,
      'cuenta_saldo_anterior', v_saldo_cuenta_actual,
      'cuenta_saldo_nuevo', v_saldo_nuevo_cuenta
    );

    v_saldo_cuenta_actual := v_saldo_nuevo_cuenta;
    v_pagos_exitosos := v_pagos_exitosos + 1;
  END LOOP;

  UPDATE cuentas_bancarias
  SET
    saldo = v_saldo_cuenta_actual,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND id = p_cuenta_bancaria_id;

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
      'moneda', v_cuenta_bancaria.moneda,
      'saldo_anterior', v_cuenta_bancaria.saldo,
      'saldo_nuevo', v_saldo_cuenta_actual
    ),
    'pagos', v_pagos_resultado
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error procesando lote de pagos: %', SQLERRM;
END;
$$;

COMMIT;
