-- ============================================================================
-- 402__cxp_payment_bank_atomic_outbox.sql
-- Aplica un pago CxP, registra su evidencia operativa, actualiza banco y
-- publica el evento contable dentro de una sola transaccion.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.aplicar_pago_cxp_tx(
  p_tenant_id uuid,
  p_cxp_id uuid,
  p_pago jsonb,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cxp public.cuentas_por_pagar%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_movimiento public.movimientos_bancarios%ROWTYPE;
  v_pago_factura public.pagos_facturas%ROWTYPE;
  v_pago_id uuid := COALESCE(NULLIF(p_pago->>'pago_id', '')::uuid, gen_random_uuid());
  v_event_id uuid := COALESCE(NULLIF(p_pago->>'event_id', '')::uuid, gen_random_uuid());
  v_key text := NULLIF(btrim(COALESCE(p_pago->>'idempotency_key', '')), '');
  v_cuenta_id uuid := NULLIF(p_pago->>'cuenta_bancaria_id', '')::uuid;
  v_monto numeric(14,2) := round(COALESCE((p_pago->>'monto')::numeric, 0), 2);
  v_fecha date := COALESCE(NULLIF(p_pago->>'fecha_pago', '')::date, current_date);
  v_metodo text := upper(btrim(COALESCE(p_pago->>'metodo_pago', 'EFECTIVO')));
  v_referencia text := NULLIF(btrim(COALESCE(p_pago->>'referencia', '')), '');
  v_saldo_anterior numeric(14,2);
  v_saldo_nuevo numeric(14,2);
  v_banco_anterior numeric(14,2);
  v_banco_nuevo numeric(14,2);
  v_estado_anterior text;
  v_estado_nuevo text;
  v_requiere_bancarizacion boolean;
  v_proveedor_nombre text;
BEGIN
  IF p_tenant_id IS NULL OR p_cxp_id IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'tenant, CxP y monto positivo son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NULL THEN
    v_key := format('cxp:pago:%s:%s:%s', p_tenant_id, p_cxp_id, v_pago_id);
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  -- Reintento seguro: un pago bancario vive en movimientos; uno no bancario,
  -- en pagos_facturas. Nunca se suman ambas evidencias para el mismo pago.
  SELECT * INTO v_movimiento
  FROM public.movimientos_bancarios mb
  WHERE mb.tenant_id = p_tenant_id
    AND lower(btrim(mb.idempotency_key)) = lower(v_key)
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar
    WHERE tenant_id = p_tenant_id AND id = p_cxp_id;
    RETURN jsonb_build_object('idempotent', true, 'cxp', to_jsonb(v_cxp),
      'pago', to_jsonb(v_movimiento), 'movimiento_bancario', to_jsonb(v_movimiento));
  END IF;
  SELECT * INTO v_pago_factura
  FROM public.pagos_facturas pf
  WHERE pf.tenant_id = p_tenant_id
    AND lower(btrim(pf.idempotency_key)) = lower(v_key)
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar
    WHERE tenant_id = p_tenant_id AND id = p_cxp_id;
    RETURN jsonb_build_object('idempotent', true, 'cxp', to_jsonb(v_cxp),
      'pago', to_jsonb(v_pago_factura), 'movimiento_bancario', NULL);
  END IF;

  SELECT * INTO v_cxp
  FROM public.cuentas_por_pagar
  WHERE tenant_id = p_tenant_id AND id = p_cxp_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar no encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_estado_anterior := upper(v_cxp.estado::text);
  v_saldo_anterior := round(COALESCE(v_cxp.saldo, 0), 2);
  IF v_estado_anterior IN ('ANULADA', 'PAGADA') OR v_saldo_anterior <= 0 THEN
    RAISE EXCEPTION 'La cuenta por pagar no admite pagos en estado %', v_estado_anterior USING ERRCODE = '23514';
  END IF;
  IF v_monto - v_saldo_anterior > 0.01 THEN
    RAISE EXCEPTION 'El monto del pago supera el saldo pendiente' USING ERRCODE = '23514';
  END IF;

  v_requiere_bancarizacion :=
    (upper(COALESCE(v_cxp.moneda, 'PEN')) = 'PEN' AND COALESCE(v_cxp.total, 0) >= 2000)
    OR (upper(COALESCE(v_cxp.moneda, 'PEN')) = 'USD' AND COALESCE(v_cxp.total, 0) >= 500);
  IF v_requiere_bancarizacion AND (
    v_cuenta_id IS NULL OR v_metodo = 'EFECTIVO' OR v_referencia IS NULL
  ) THEN
    RAISE EXCEPTION 'Pago sujeto a bancarizacion requiere cuenta, medio bancario y referencia'
      USING ERRCODE = '23514';
  END IF;

  IF v_cuenta_id IS NOT NULL THEN
    SELECT * INTO v_banco
    FROM public.cuentas_bancarias
    WHERE tenant_id = p_tenant_id AND id = v_cuenta_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria no encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF COALESCE(v_banco.activa, false) IS FALSE OR upper(COALESCE(v_banco.estado, '')) <> 'ACTIVO' THEN
      RAISE EXCEPTION 'Cuenta bancaria inactiva' USING ERRCODE = '23514';
    END IF;
    IF upper(COALESCE(v_banco.moneda, 'PEN')) <> upper(COALESCE(v_cxp.moneda, 'PEN')) THEN
      RAISE EXCEPTION 'La moneda del banco no coincide con la CxP' USING ERRCODE = '23514';
    END IF;
    v_banco_anterior := round(COALESCE(v_banco.saldo, v_banco.saldo_actual, 0), 2);
    v_banco_nuevo := round(v_banco_anterior - v_monto, 2);
    IF NOT COALESCE(v_banco.permite_sobregiro, false) AND v_banco_nuevo < 0 THEN
      RAISE EXCEPTION 'Saldo bancario insuficiente' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_saldo_nuevo := round(GREATEST(v_saldo_anterior - v_monto, 0), 2);
  v_estado_nuevo := CASE WHEN v_saldo_nuevo <= 0.009 THEN 'PAGADA' ELSE 'PARCIAL' END;
  SELECT COALESCE(p.razon_social, p.nombre, v_cxp.proveedor_id::text)
  INTO v_proveedor_nombre
  FROM public.proveedores p
  WHERE p.tenant_id = p_tenant_id AND p.id = v_cxp.proveedor_id;

  IF v_cuenta_id IS NOT NULL THEN
    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, cxp_id, proveedor_id, idempotency_key,
      conciliado, saldo_anterior, saldo_nuevo, created_by
    ) VALUES (
      v_pago_id, p_tenant_id, v_cuenta_id, 'CARGO', v_monto, v_fecha,
      format('Pago a proveedor %s - Doc: %s', v_proveedor_nombre, v_cxp.numero_documento),
      v_referencia, v_metodo, p_cxp_id, v_cxp.proveedor_id, v_key,
      false, v_banco_anterior, v_banco_nuevo, p_usuario_id
    ) RETURNING * INTO v_movimiento;

    UPDATE public.cuentas_bancarias
    SET saldo = v_banco_nuevo, saldo_actual = v_banco_nuevo,
        saldo_contable = v_banco_nuevo, updated_at = now(), updated_by = p_usuario_id
    WHERE tenant_id = p_tenant_id AND id = v_cuenta_id;
  ELSE
    INSERT INTO public.pagos_facturas (
      id, tenant_id, cuenta_por_pagar_id, proveedor_id, usuario_id,
      fecha_pago, monto, moneda, metodo_pago, referencia, notas,
      event_id, idempotency_key, aplicado_en, estado, activo
    ) VALUES (
      v_pago_id, p_tenant_id, p_cxp_id, v_cxp.proveedor_id, p_usuario_id,
      v_fecha, v_monto, upper(COALESCE(v_cxp.moneda, 'PEN')), v_metodo,
      v_referencia, NULLIF(p_pago->>'observaciones', ''), v_event_id, v_key,
      clock_timestamp(), 'APLICADO', true
    ) RETURNING * INTO v_pago_factura;
  END IF;

  UPDATE public.cuentas_por_pagar
  SET saldo = v_saldo_nuevo, saldo_pendiente = v_saldo_nuevo,
      estado = v_estado_nuevo, ultimo_pago = v_fecha, updated_at = now(),
      updated_by = p_usuario_id,
      bancarizacion_requerida = bancarizacion_requerida OR v_requiere_bancarizacion,
      bancarizacion_validada = bancarizacion_validada OR v_requiere_bancarizacion,
      bancarizacion_medio_pago = CASE WHEN v_requiere_bancarizacion THEN v_metodo ELSE bancarizacion_medio_pago END,
      bancarizacion_referencia = CASE WHEN v_requiere_bancarizacion THEN v_referencia ELSE bancarizacion_referencia END
  WHERE tenant_id = p_tenant_id AND id = p_cxp_id
  RETURNING * INTO v_cxp;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'pago_proveedor', v_pago_id::text, 'pago.proveedor.registrado',
    jsonb_build_object(
      'tenantId', p_tenant_id, 'eventId', v_event_id, 'idempotencyKey', v_key,
      'cxpId', p_cxp_id, 'pagoId', v_pago_id, 'proveedorId', v_cxp.proveedor_id,
      'proveedorNombre', v_proveedor_nombre, 'numeroDocumento', v_cxp.numero_documento,
      'monto', v_monto, 'moneda', v_cxp.moneda, 'fecha', v_fecha,
      'metodoPago', v_metodo, 'cuentaBancariaId', v_cuenta_id,
      'cuentaBancariaNombre', v_banco.nombre, 'referencia', v_referencia,
      'observaciones', NULLIF(p_pago->>'observaciones', ''),
      'saldoAnterior', v_saldo_anterior, 'saldoNuevo', v_saldo_nuevo,
      'estadoAnterior', v_estado_anterior, 'estadoNuevo', v_estado_nuevo,
      'createdBy', p_usuario_id, 'movimientoBancarioId', v_movimiento.id,
      'cuentaSaldoAnterior', v_banco_anterior, 'cuentaSaldoNuevo', v_banco_nuevo,
      'source', 'tesoreria.registrarPago'
    ),
    'pending', 0, v_key, v_event_id, clock_timestamp()
  );

  RETURN jsonb_build_object(
    'idempotent', false,
    'cxp', to_jsonb(v_cxp),
    'pago', CASE WHEN v_cuenta_id IS NULL THEN to_jsonb(v_pago_factura) ELSE to_jsonb(v_movimiento) END,
    'movimiento_bancario', CASE WHEN v_cuenta_id IS NULL THEN NULL ELSE to_jsonb(v_movimiento) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_pago_cxp_tx(
  p_tenant_id uuid,
  p_cxp_id uuid,
  p_pago jsonb,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.aplicar_pago_cxp_tx(p_tenant_id, p_cxp_id, p_pago, p_usuario_id);
$function$;

REVOKE ALL ON FUNCTION app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)
TO service_role;

COMMENT ON FUNCTION public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid) IS
  'Aplica pago CxP, evidencia operativa, saldo bancario y outbox contable atomicamente.';

COMMIT;

NOTIFY pgrst, 'reload schema';
