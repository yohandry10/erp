-- 306__pago_lote_locking_fix.sql
-- Corrige el procesamiento de pagos en lote: PostgreSQL no permite FOR UPDATE
-- sobre el lado nullable de un LEFT JOIN. La CxP se bloquea directamente y el
-- proveedor se resuelve por subconsulta para preservar atomicidad.

CREATE OR REPLACE FUNCTION public.procesar_pago_lote(
  p_tenant_id uuid,
  p_cuenta_bancaria_id uuid,
  p_fecha_pago date,
  p_metodo_pago text,
  p_referencia_lote text,
  p_observaciones text,
  p_pagos jsonb,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cuenta record;
  v_pago jsonb;
  v_cxp record;
  v_monto_pago numeric;
  v_monto_total numeric := 0;
  v_saldo_cuenta numeric;
  v_saldo_nuevo numeric;
  v_mov_id uuid;
  v_result_pagos jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF COALESCE(jsonb_typeof(p_pagos), '') <> 'array' OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un pago en el lote';
  END IF;

  IF p_referencia_lote IS NOT NULL THEN
    SELECT resultado INTO v_result
    FROM public.pagos_lote
    WHERE tenant_id = p_tenant_id
      AND referencia_lote = p_referencia_lote
    LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  SELECT
    id,
    nombre,
    moneda,
    COALESCE(saldo, 0) AS saldo,
    COALESCE(permite_sobregiro, false) AS permite_sobregiro,
    COALESCE(activa, true) AS activa
  INTO v_cuenta
  FROM public.cuentas_bancarias
  WHERE id = p_cuenta_bancaria_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_cuenta.activa THEN
    RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva';
  END IF;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    SELECT
      c.id,
      c.proveedor_id,
      COALESCE(c.estado::text, 'PENDIENTE') AS estado,
      COALESCE(c.saldo, c.saldo_pendiente, 0) AS saldo,
      COALESCE(c.total, c.subtotal + c.igv, c.saldo, 0) AS total,
      COALESCE(c.moneda, 'PEN') AS moneda,
      c.numero_documento,
      (
        SELECT p.razon_social
        FROM public.proveedores p
        WHERE p.id = c.proveedor_id
          AND p.tenant_id = c.tenant_id
        LIMIT 1
      ) AS proveedor_nombre
    INTO v_cxp
    FROM public.cuentas_por_pagar c
    WHERE c.id = NULLIF(v_pago->>'cxp_id', '')::uuid
      AND c.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CxP no encontrada: %', v_pago->>'cxp_id';
    END IF;

    IF lower(v_cxp.estado) = 'anulada' THEN
      RAISE EXCEPTION 'No se puede pagar una CxP anulada';
    END IF;

    v_monto_pago := COALESCE((v_pago->>'monto')::numeric, v_cxp.saldo);
    IF v_monto_pago <= 0 OR v_monto_pago > v_cxp.saldo THEN
      RAISE EXCEPTION 'Monto inválido para CxP %', v_cxp.id;
    END IF;

    v_monto_total := v_monto_total + v_monto_pago;
  END LOOP;

  IF NOT v_cuenta.permite_sobregiro AND v_cuenta.saldo < v_monto_total THEN
    RAISE EXCEPTION 'Saldo insuficiente en cuenta bancaria';
  END IF;

  v_saldo_cuenta := v_cuenta.saldo;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    SELECT
      c.id,
      c.proveedor_id,
      COALESCE(c.estado::text, 'PENDIENTE') AS estado,
      COALESCE(c.saldo, c.saldo_pendiente, 0) AS saldo,
      COALESCE(c.total, c.subtotal + c.igv, c.saldo, 0) AS total,
      COALESCE(c.moneda, 'PEN') AS moneda,
      c.numero_documento,
      (
        SELECT p.razon_social
        FROM public.proveedores p
        WHERE p.id = c.proveedor_id
          AND p.tenant_id = c.tenant_id
        LIMIT 1
      ) AS proveedor_nombre
    INTO v_cxp
    FROM public.cuentas_por_pagar c
    WHERE c.id = NULLIF(v_pago->>'cxp_id', '')::uuid
      AND c.tenant_id = p_tenant_id
    FOR UPDATE;

    v_monto_pago := COALESCE((v_pago->>'monto')::numeric, v_cxp.saldo);
    v_saldo_nuevo := round(v_saldo_cuenta - v_monto_pago, 2);

    UPDATE public.cuentas_por_pagar
    SET
      saldo = round(v_cxp.saldo - v_monto_pago, 2),
      saldo_pendiente = round(v_cxp.saldo - v_monto_pago, 2),
      estado = CASE
        WHEN round(v_cxp.saldo - v_monto_pago, 2) <= 0 THEN 'PAGADA'
        ELSE 'PARCIAL'
      END,
      ultimo_pago = p_fecha_pago,
      updated_at = now()
    WHERE id = v_cxp.id
      AND tenant_id = p_tenant_id;

    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
      metodo_pago, cxp_id, proveedor_id, conciliado, saldo_anterior, saldo_nuevo, created_by, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      p_tenant_id,
      p_cuenta_bancaria_id,
      'CARGO',
      v_monto_pago,
      p_fecha_pago,
      COALESCE(p_referencia_lote, 'LOTE') || ' - Pago proveedor',
      p_referencia_lote,
      p_metodo_pago,
      v_cxp.id,
      v_cxp.proveedor_id,
      false,
      v_saldo_cuenta,
      v_saldo_nuevo,
      p_created_by,
      now(),
      now()
    )
    RETURNING id INTO v_mov_id;

    v_result_pagos := v_result_pagos || jsonb_build_object(
      'cxp_id', v_cxp.id,
      'proveedor_id', v_cxp.proveedor_id,
      'proveedor', COALESCE(v_cxp.proveedor_nombre, v_cxp.proveedor_id::text),
      'numero_documento', v_cxp.numero_documento,
      'monto', v_monto_pago,
      'saldo_anterior', v_cxp.saldo,
      'saldo_nuevo', round(v_cxp.saldo - v_monto_pago, 2),
      'estado_anterior', v_cxp.estado,
      'estado_nuevo', CASE WHEN round(v_cxp.saldo - v_monto_pago, 2) <= 0 THEN 'PAGADA' ELSE 'PARCIAL' END,
      'movimiento_bancario_id', v_mov_id
    );

    v_saldo_cuenta := v_saldo_nuevo;
  END LOOP;

  UPDATE public.cuentas_bancarias
  SET saldo = v_saldo_cuenta, saldo_actual = v_saldo_cuenta, updated_at = now()
  WHERE id = p_cuenta_bancaria_id
    AND tenant_id = p_tenant_id;

  v_result := jsonb_build_object(
    'success', true,
    'lote_id', p_referencia_lote,
    'total_pagos', jsonb_array_length(p_pagos),
    'monto_total', round(v_monto_total, 2),
    'pagos_exitosos', jsonb_array_length(v_result_pagos),
    'pagos_fallidos', 0,
    'cuenta_bancaria', jsonb_build_object(
      'id', v_cuenta.id,
      'nombre', v_cuenta.nombre,
      'moneda', v_cuenta.moneda,
      'saldo_anterior', v_cuenta.saldo,
      'saldo_nuevo', v_saldo_cuenta
    ),
    'pagos', v_result_pagos
  );

  INSERT INTO public.pagos_lote (
    id, tenant_id, referencia_lote, cuenta_bancaria_id, fecha_pago, metodo_pago,
    monto_total, pagos, resultado, estado, metadata, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_referencia_lote, p_cuenta_bancaria_id, p_fecha_pago, p_metodo_pago,
    round(v_monto_total, 2), p_pagos, v_result, 'PROCESADO',
    jsonb_build_object('observaciones', p_observaciones, 'created_by', p_created_by),
    now(), now()
  )
  ON CONFLICT (tenant_id, referencia_lote)
  DO UPDATE SET resultado = EXCLUDED.resultado, metadata = EXCLUDED.metadata, updated_at = now();

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_pago_lote(uuid, uuid, date, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.procesar_pago_lote(uuid, uuid, date, text, text, text, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.procesar_pago_lote IS 'Procesa un lote de pagos a proveedores en una transacción atómica con bloqueo directo de CxP y cuenta bancaria';
