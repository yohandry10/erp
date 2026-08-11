-- ============================================================================
-- 452__treasury_collections_payments_atomic.sql
-- Cierre transaccional de cobros CxC, pagos CxP y pagos CxP por lote.
--
-- Garantias:
-- - actor obligatorio, activo y perteneciente al tenant;
-- - idempotencia con huella semantica (una clave no puede cambiar de intento);
-- - efectivo ligado a una sesion abierta y a un movimiento de caja;
-- - banco, saldo documental, evidencia y outbox en el mismo commit;
-- - valuacion de origen/liquidacion y diferencia realizada para divisas;
-- - lotes atomicos que reutilizan el writer individual y no dependen de JS.
-- ============================================================================

BEGIN;

SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

CREATE OR REPLACE FUNCTION app.assert_treasury_actor_452(
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
    FROM public.usuarios u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND u.activo IS TRUE
      AND upper(u.estado::text) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'El actor de tesoreria no pertenece al tenant o esta inactivo'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.treasury_local_currency_452(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT upper(coalesce(
    (
      SELECT nullif(btrim(coalesce(ec.moneda_defecto, ec.moneda, '')), '')
      FROM public.empresa_config ec
      WHERE ec.tenant_id = p_tenant_id
      ORDER BY ec.updated_at DESC NULLS LAST, ec.id
      LIMIT 1
    ),
    CASE upper(coalesce(t.pais, 'PE'))
      WHEN 'AR' THEN 'ARS'
      WHEN 'CO' THEN 'COP'
      ELSE 'PEN'
    END
  ))
  FROM public.tenants t
  WHERE t.id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION app.treasury_valuation_452(
  p_tenant_id uuid,
  p_domain text,
  p_moneda text,
  p_tipo_cambio_origen numeric,
  p_fecha_origen date,
  p_fecha_liquidacion date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_domain text := upper(btrim(coalesce(p_domain, '')));
  v_moneda text := upper(btrim(coalesce(p_moneda, '')));
  v_moneda_local text;
  v_origen numeric(18,6);
  v_liquidacion numeric(18,6);
BEGIN
  IF v_domain NOT IN ('CXC', 'CXP') OR v_moneda !~ '^[A-Z]{3}$'
     OR p_fecha_origen IS NULL OR p_fecha_liquidacion IS NULL THEN
    RAISE EXCEPTION 'Dominio, moneda y fechas de valuacion son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  v_moneda_local := app.treasury_local_currency_452(p_tenant_id);
  IF v_moneda_local IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver la moneda local del tenant'
      USING ERRCODE = '23514';
  END IF;

  IF v_moneda = v_moneda_local THEN
    RETURN jsonb_build_object(
      'moneda_local', v_moneda_local,
      'tipo_cambio_origen', 1,
      'tipo_cambio_liquidacion', 1,
      'origen_preparado', false
    );
  END IF;

  v_origen := CASE
    WHEN p_tipo_cambio_origen IS NOT NULL AND p_tipo_cambio_origen > 0
      THEN round(p_tipo_cambio_origen, 6)
    ELSE NULL
  END;

  IF v_origen IS NULL THEN
    SELECT round(
      CASE WHEN v_domain = 'CXC' THEN tc.compra ELSE tc.venta END,
      6
    )
    INTO v_origen
    FROM public.tipos_cambio tc
    WHERE tc.tenant_id = p_tenant_id
      AND upper(tc.moneda_origen) = v_moneda
      AND upper(tc.moneda_destino) = v_moneda_local
      AND tc.fecha <= p_fecha_origen
      AND coalesce(tc.activo, true)
      AND upper(coalesce(tc.estado::text, 'ACTIVO')) = 'ACTIVO'
      AND CASE WHEN v_domain = 'CXC' THEN tc.compra ELSE tc.venta END > 0
    ORDER BY tc.fecha DESC, tc.updated_at DESC NULLS LAST, tc.id
    LIMIT 1;
  END IF;

  SELECT round(
    CASE WHEN v_domain = 'CXC' THEN tc.compra ELSE tc.venta END,
    6
  )
  INTO v_liquidacion
  FROM public.tipos_cambio tc
  WHERE tc.tenant_id = p_tenant_id
    AND upper(tc.moneda_origen) = v_moneda
    AND upper(tc.moneda_destino) = v_moneda_local
    AND tc.fecha <= p_fecha_liquidacion
    AND coalesce(tc.activo, true)
    AND upper(coalesce(tc.estado::text, 'ACTIVO')) = 'ACTIVO'
    AND CASE WHEN v_domain = 'CXC' THEN tc.compra ELSE tc.venta END > 0
  ORDER BY tc.fecha DESC, tc.updated_at DESC NULLS LAST, tc.id
  LIMIT 1;

  IF v_origen IS NULL THEN
    RAISE EXCEPTION
      'No hay tipo de cambio de origen %/% vigente al %',
      v_moneda, v_moneda_local, p_fecha_origen
      USING ERRCODE = '23514';
  END IF;
  IF v_liquidacion IS NULL THEN
    RAISE EXCEPTION
      'No hay tipo de cambio de liquidacion %/% vigente al %',
      v_moneda, v_moneda_local, p_fecha_liquidacion
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'moneda_local', v_moneda_local,
    'tipo_cambio_origen', v_origen,
    'tipo_cambio_liquidacion', v_liquidacion,
    'origen_preparado', p_tipo_cambio_origen IS NULL OR p_tipo_cambio_origen <= 0
  );
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_treasury_payment_452
ON public.movimientos_caja (
  tenant_id,
  lower(btrim(referencia_tipo)),
  referencia_documento
)
WHERE lower(btrim(coalesce(referencia_tipo, ''))) IN ('cxc_pago', 'cxp_pago')
  AND referencia_documento IS NOT NULL;

CREATE OR REPLACE FUNCTION app.resolve_cash_session_452(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_requested_session_id uuid,
  p_moneda text
)
RETURNS public.sesiones_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_session public.sesiones_caja%ROWTYPE;
  v_count integer;
BEGIN
  IF p_requested_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.sesiones_caja sc
    WHERE sc.id = p_requested_session_id
      AND sc.tenant_id = p_tenant_id
      AND lower(sc.estado::text) = 'abierta'
      AND NOT coalesce(sc.congelada, false)
      AND (
        sc.cajero_id = p_actor_id OR sc.usuario_id = p_actor_id
        OR sc.abierto_por = p_actor_id OR sc.usuario_apertura = p_actor_id
      )
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La sesion de caja solicitada no esta abierta o no pertenece al actor'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT count(*), (array_agg(sc.id ORDER BY sc.id))[1]
    INTO v_count, p_requested_session_id
    FROM public.sesiones_caja sc
    WHERE sc.tenant_id = p_tenant_id
      AND lower(sc.estado::text) = 'abierta'
      AND NOT coalesce(sc.congelada, false)
      AND (
        sc.cajero_id = p_actor_id OR sc.usuario_id = p_actor_id
        OR sc.abierto_por = p_actor_id OR sc.usuario_apertura = p_actor_id
      );
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'El pago en efectivo exige exactamente una sesion de caja abierta del actor (encontradas: %)',
        v_count
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_session
    FROM public.sesiones_caja sc
    WHERE sc.id = p_requested_session_id
      AND sc.tenant_id = p_tenant_id
    FOR UPDATE;
  END IF;

  IF upper(coalesce(v_session.moneda, 'PEN')) <> upper(p_moneda) THEN
    RAISE EXCEPTION 'La moneda de la caja (%) no coincide con el documento (%)',
      v_session.moneda, p_moneda
      USING ERRCODE = '23514';
  END IF;
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION app.append_cash_movement_452(
  p_session public.sesiones_caja,
  p_actor_id uuid,
  p_amount numeric,
  p_direction text,
  p_reference_type text,
  p_reference_document text,
  p_reason text,
  p_metadata jsonb
)
RETURNS public.movimientos_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_last public.movimientos_caja%ROWTYPE;
  v_result public.movimientos_caja%ROWTYPE;
  v_sequence integer;
  v_previous numeric(14,2);
  v_signed numeric(14,2);
BEGIN
  IF upper(p_direction) NOT IN ('IN', 'OUT') OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Direccion e importe de caja invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_last
  FROM public.movimientos_caja mc
  WHERE mc.tenant_id = p_session.tenant_id
    AND mc.sesion_caja_id = p_session.id
  ORDER BY mc.secuencia DESC, mc.created_at DESC, mc.id DESC
  LIMIT 1;

  v_sequence := coalesce(v_last.secuencia, 0) + 1;
  v_previous := round(coalesce(
    v_last.saldo_nuevo,
    p_session.monto_inicial,
    p_session.monto_inicio,
    0
  ), 2);
  v_signed := CASE WHEN upper(p_direction) = 'IN' THEN round(p_amount, 2) ELSE -round(p_amount, 2) END;
  IF upper(p_direction) = 'OUT' AND v_previous + v_signed < 0 THEN
    RAISE EXCEPTION 'Saldo de caja insuficiente' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.movimientos_caja (
    tenant_id, sesion_caja_id, secuencia, tipo_movimiento, monto,
    saldo_anterior, saldo_nuevo, referencia_documento, referencia_tipo,
    motivo, usuario_id, "timestamp", metadata, created_at, updated_at
  ) VALUES (
    p_session.tenant_id, p_session.id, v_sequence,
    CASE WHEN upper(p_direction) = 'IN' THEN 'INGRESO' ELSE 'RETIRO' END,
    v_signed, v_previous, round(v_previous + v_signed, 2),
    p_reference_document, p_reference_type, p_reason, p_actor_id,
    clock_timestamp(), coalesce(p_metadata, '{}'::jsonb), now(), now()
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app.aplicar_pago_cxp_tx(
  p_tenant_id uuid,
  p_cxp_id uuid,
  p_pago jsonb,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
DECLARE
  v_cxp public.cuentas_por_pagar%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_session public.sesiones_caja%ROWTYPE;
  v_movimiento public.movimientos_bancarios%ROWTYPE;
  v_cash_movement public.movimientos_caja%ROWTYPE;
  v_pago_factura public.pagos_facturas%ROWTYPE;
  v_existing_fp text;
  v_pago_id uuid := coalesce(nullif(p_pago->>'pago_id', '')::uuid, gen_random_uuid());
  v_event_id uuid := coalesce(nullif(p_pago->>'event_id', '')::uuid, gen_random_uuid());
  v_key text := nullif(btrim(coalesce(p_pago->>'idempotency_key', '')), '');
  v_cuenta_id uuid := nullif(p_pago->>'cuenta_bancaria_id', '')::uuid;
  v_session_id uuid := nullif(p_pago->>'sesion_caja_id', '')::uuid;
  v_monto numeric(14,2) := round(coalesce(nullif(p_pago->>'monto', '')::numeric, 0), 2);
  v_fecha date := coalesce(nullif(p_pago->>'fecha_pago', '')::date, current_date);
  v_metodo text := upper(btrim(coalesce(p_pago->>'metodo_pago', '')));
  v_referencia text := nullif(btrim(coalesce(p_pago->>'referencia', '')), '');
  v_observaciones text := nullif(btrim(coalesce(p_pago->>'observaciones', '')), '');
  v_fingerprint text;
  v_valuation jsonb;
  v_moneda text;
  v_moneda_local text;
  v_tc_origen numeric(18,6);
  v_tc_liquidacion numeric(18,6);
  v_monto_contabilizado numeric(18,2);
  v_monto_liquidacion numeric(18,2);
  v_diferencia numeric(18,2);
  v_saldo_anterior numeric(14,2);
  v_saldo_nuevo numeric(14,2);
  v_estado_anterior text;
  v_estado_nuevo text;
  v_banco_anterior numeric(14,2);
  v_banco_nuevo numeric(14,2);
  v_requiere_bancarizacion boolean;
  v_proveedor_nombre text;
BEGIN
  PERFORM app.assert_treasury_actor_452(p_tenant_id, p_usuario_id);
  IF p_cxp_id IS NULL OR v_monto <= 0 OR v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'CxP, monto positivo e idempotency_key son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF v_metodo NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA') THEN
    RAISE EXCEPTION 'Metodo de pago no soportado' USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'EFECTIVO' AND v_cuenta_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un pago en efectivo no puede usar cuenta bancaria' USING ERRCODE = '23514';
  ELSIF v_metodo <> 'EFECTIVO' AND (v_cuenta_id IS NULL OR v_referencia IS NULL) THEN
    RAISE EXCEPTION 'Un pago no efectivo exige cuenta bancaria y referencia' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_usuario_id,
    'cxp_id', p_cxp_id, 'monto', v_monto, 'fecha', v_fecha,
    'metodo', v_metodo, 'cuenta_bancaria_id', v_cuenta_id,
    'sesion_caja_id_solicitada', v_session_id, 'referencia', v_referencia,
    'observaciones', v_observaciones
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cxp-payment:' || lower(v_key), 452));

  SELECT * INTO v_movimiento
  FROM public.movimientos_bancarios mb
  WHERE mb.tenant_id = p_tenant_id
    AND lower(btrim(mb.idempotency_key)) = lower(v_key)
  LIMIT 1;
  IF FOUND THEN
    v_existing_fp := nullif(v_movimiento.metadata->>'request_fingerprint', '');
    IF v_movimiento.cxp_id IS DISTINCT FROM p_cxp_id
       OR v_existing_fp IS NULL OR v_existing_fp <> v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_CXP_PAYMENT'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar
    WHERE tenant_id = p_tenant_id AND id = p_cxp_id;
    RETURN jsonb_build_object(
      'idempotent', true, 'cxp', to_jsonb(v_cxp), 'pago', to_jsonb(v_movimiento),
      'movimiento_bancario', to_jsonb(v_movimiento), 'movimiento_caja', NULL,
      'request_fingerprint', v_fingerprint
    );
  END IF;

  SELECT * INTO v_pago_factura
  FROM public.pagos_facturas pf
  WHERE pf.tenant_id = p_tenant_id
    AND lower(btrim(pf.idempotency_key)) = lower(v_key)
  LIMIT 1;
  IF FOUND THEN
    v_existing_fp := nullif(v_pago_factura.metadata->>'request_fingerprint', '');
    IF v_pago_factura.cuenta_por_pagar_id IS DISTINCT FROM p_cxp_id
       OR v_existing_fp IS NULL OR v_existing_fp <> v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_CXP_PAYMENT'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_cxp FROM public.cuentas_por_pagar
    WHERE tenant_id = p_tenant_id AND id = p_cxp_id;
    SELECT * INTO v_cash_movement
    FROM public.movimientos_caja mc
    WHERE mc.tenant_id = p_tenant_id
      AND lower(coalesce(mc.referencia_tipo, '')) = 'cxp_pago'
      AND mc.referencia_documento = v_pago_factura.id::text;
    RETURN jsonb_build_object(
      'idempotent', true, 'cxp', to_jsonb(v_cxp), 'pago', to_jsonb(v_pago_factura),
      'movimiento_bancario', NULL,
      'movimiento_caja', CASE WHEN v_cash_movement.id IS NULL THEN NULL ELSE to_jsonb(v_cash_movement) END,
      'request_fingerprint', v_fingerprint
    );
  END IF;

  SELECT * INTO v_cxp
  FROM public.cuentas_por_pagar
  WHERE tenant_id = p_tenant_id AND id = p_cxp_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar no encontrada' USING ERRCODE = 'P0002';
  END IF;
  v_estado_anterior := upper(v_cxp.estado::text);
  v_saldo_anterior := round(coalesce(v_cxp.saldo, v_cxp.saldo_pendiente, 0), 2);
  IF v_estado_anterior IN ('ANULADA', 'PAGADA') OR v_saldo_anterior <= 0 THEN
    RAISE EXCEPTION 'La cuenta por pagar no admite pagos en estado %', v_estado_anterior
      USING ERRCODE = '23514';
  END IF;
  IF v_monto - v_saldo_anterior > 0.01 THEN
    RAISE EXCEPTION 'El monto del pago supera el saldo pendiente' USING ERRCODE = '23514';
  END IF;
  v_moneda := upper(coalesce(v_cxp.moneda, 'PEN'));
  IF nullif(upper(btrim(coalesce(p_pago->>'moneda', ''))), '') IS NOT NULL
     AND upper(btrim(p_pago->>'moneda')) <> v_moneda THEN
    RAISE EXCEPTION 'La moneda solicitada no coincide con la CxP' USING ERRCODE = '23514';
  END IF;

  v_requiere_bancarizacion :=
    (v_moneda = 'PEN' AND coalesce(v_cxp.total, 0) >= 2000)
    OR (v_moneda = 'USD' AND coalesce(v_cxp.total, 0) >= 500);
  IF v_requiere_bancarizacion AND v_metodo = 'EFECTIVO' THEN
    RAISE EXCEPTION 'Pago sujeto a bancarizacion no admite efectivo' USING ERRCODE = '23514';
  END IF;

  v_valuation := app.treasury_valuation_452(
    p_tenant_id, 'CXP', v_moneda, v_cxp.tipo_cambio_origen,
    coalesce(v_cxp.fecha_emision, v_fecha), v_fecha
  );
  v_moneda_local := v_valuation->>'moneda_local';
  v_tc_origen := (v_valuation->>'tipo_cambio_origen')::numeric;
  v_tc_liquidacion := (v_valuation->>'tipo_cambio_liquidacion')::numeric;
  v_monto_contabilizado := round(v_monto * v_tc_origen, 2);
  v_monto_liquidacion := round(v_monto * v_tc_liquidacion, 2);
  v_diferencia := round(v_monto_contabilizado - v_monto_liquidacion, 2);
  IF v_cxp.tipo_cambio_origen IS NULL AND v_moneda <> v_moneda_local THEN
    UPDATE public.cuentas_por_pagar
    SET tipo_cambio_origen = v_tc_origen, updated_at = now(), updated_by = p_usuario_id
    WHERE tenant_id = p_tenant_id AND id = p_cxp_id;
    v_cxp.tipo_cambio_origen := v_tc_origen;
  END IF;

  SELECT coalesce(p.razon_social, p.nombre, v_cxp.proveedor_id::text)
  INTO v_proveedor_nombre
  FROM public.proveedores p
  WHERE p.tenant_id = p_tenant_id AND p.id = v_cxp.proveedor_id;

  IF v_metodo = 'EFECTIVO' THEN
    v_session := app.resolve_cash_session_452(p_tenant_id, p_usuario_id, v_session_id, v_moneda);
    INSERT INTO public.pagos_facturas (
      id, tenant_id, cuenta_por_pagar_id, proveedor_id, usuario_id,
      fecha_pago, monto, moneda, metodo_pago, referencia, notas,
      event_id, idempotency_key, aplicado_en, estado, activo, metadata
    ) VALUES (
      v_pago_id, p_tenant_id, p_cxp_id, v_cxp.proveedor_id, p_usuario_id,
      v_fecha, v_monto, v_moneda, v_metodo, v_referencia, v_observaciones,
      v_event_id, v_key, clock_timestamp(), 'APLICADO', true,
      jsonb_build_object(
        'request_fingerprint', v_fingerprint, 'fingerprint_version', 1,
        'sesion_caja_id', v_session.id, 'moneda_local', v_moneda_local,
        'tipo_cambio_origen', v_tc_origen, 'tipo_cambio_liquidacion', v_tc_liquidacion,
        'monto_contabilizado', v_monto_contabilizado,
        'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia
      )
    ) RETURNING * INTO v_pago_factura;

    v_cash_movement := app.append_cash_movement_452(
      v_session, p_usuario_id, v_monto, 'OUT', 'cxp_pago', v_pago_id::text,
      format('Pago en efectivo a proveedor %s - Doc: %s',
        coalesce(v_proveedor_nombre, v_cxp.proveedor_id::text),
        coalesce(v_cxp.numero_documento, p_cxp_id::text)),
      jsonb_build_object(
        'request_fingerprint', v_fingerprint, 'cxp_id', p_cxp_id,
        'pago_id', v_pago_id, 'idempotency_key', v_key
      )
    );
  ELSE
    SELECT * INTO v_banco
    FROM public.cuentas_bancarias cb
    WHERE cb.tenant_id = p_tenant_id AND cb.id = v_cuenta_id
    FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_banco.activa, false)
       OR upper(coalesce(v_banco.estado, '')) <> 'ACTIVO' THEN
      RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva' USING ERRCODE = '23514';
    END IF;
    IF upper(coalesce(v_banco.moneda, 'PEN')) <> v_moneda THEN
      RAISE EXCEPTION 'La moneda del banco no coincide con la CxP' USING ERRCODE = '23514';
    END IF;
    v_banco_anterior := round(coalesce(v_banco.saldo, v_banco.saldo_actual, 0), 2);
    v_banco_nuevo := round(v_banco_anterior - v_monto, 2);
    IF NOT coalesce(v_banco.permite_sobregiro, false) AND v_banco_nuevo < 0 THEN
      RAISE EXCEPTION 'Saldo bancario insuficiente' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, cxp_id, proveedor_id, idempotency_key,
      conciliado, saldo_anterior, saldo_nuevo, created_by, metadata
    ) VALUES (
      v_pago_id, p_tenant_id, v_cuenta_id, 'CARGO', v_monto, v_fecha,
      format('Pago a proveedor %s - Doc: %s',
        coalesce(v_proveedor_nombre, v_cxp.proveedor_id::text),
        coalesce(v_cxp.numero_documento, p_cxp_id::text)),
      v_referencia, v_metodo, p_cxp_id, v_cxp.proveedor_id, v_key,
      false, v_banco_anterior, v_banco_nuevo, p_usuario_id,
      jsonb_build_object(
        'request_fingerprint', v_fingerprint, 'fingerprint_version', 1,
        'event_id', v_event_id, 'moneda_local', v_moneda_local,
        'tipo_cambio_origen', v_tc_origen, 'tipo_cambio_liquidacion', v_tc_liquidacion,
        'monto_contabilizado', v_monto_contabilizado,
        'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia
      )
    ) RETURNING * INTO v_movimiento;

    UPDATE public.cuentas_bancarias
    SET saldo = v_banco_nuevo, saldo_actual = v_banco_nuevo,
        saldo_contable = v_banco_nuevo, updated_at = now(), updated_by = p_usuario_id
    WHERE tenant_id = p_tenant_id AND id = v_cuenta_id;
  END IF;

  v_saldo_nuevo := round(greatest(v_saldo_anterior - v_monto, 0), 2);
  v_estado_nuevo := CASE WHEN v_saldo_nuevo <= 0.009 THEN 'PAGADA' ELSE 'PARCIAL' END;
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
      'tenant_id', p_tenant_id, 'tenantId', p_tenant_id,
      'event_id', v_event_id, 'eventId', v_event_id,
      'idempotency_key', v_key, 'idempotencyKey', v_key,
      'requestFingerprint', v_fingerprint,
      'cxp_id', p_cxp_id, 'cxpId', p_cxp_id,
      'pago_id', v_pago_id, 'pagoId', v_pago_id,
      'proveedor_id', v_cxp.proveedor_id, 'proveedorId', v_cxp.proveedor_id,
      'proveedorNombre', v_proveedor_nombre,
      'numeroDocumento', v_cxp.numero_documento,
      'monto', v_monto, 'moneda', v_moneda, 'monedaLocal', v_moneda_local,
      'fecha', v_fecha, 'metodoPago', v_metodo,
      'cuentaBancariaId', v_cuenta_id, 'cuentaBancariaNombre', v_banco.nombre,
      'sesionCajaId', v_session.id, 'referencia', v_referencia,
      'observaciones', v_observaciones,
      'saldoAnterior', v_saldo_anterior, 'saldoNuevo', v_saldo_nuevo,
      'estadoAnterior', v_estado_anterior, 'estadoNuevo', v_estado_nuevo,
      'createdBy', p_usuario_id, 'movimientoBancarioId', v_movimiento.id,
      'movimientoCajaId', v_cash_movement.id,
      'cuentaSaldoAnterior', v_banco_anterior, 'cuentaSaldoNuevo', v_banco_nuevo,
      'tipoCambioOrigen', v_tc_origen,
      'tipoCambioLiquidacion', v_tc_liquidacion,
      'montoContabilizado', v_monto_contabilizado,
      'montoLiquidacion', v_monto_liquidacion,
      'diferenciaCambio', v_diferencia,
      'source', 'app.aplicar_pago_cxp_tx'
    ),
    'pending', 0, v_key, v_event_id, clock_timestamp()
  );

  RETURN jsonb_build_object(
    'idempotent', false, 'cxp', to_jsonb(v_cxp),
    'pago', CASE WHEN v_metodo = 'EFECTIVO' THEN to_jsonb(v_pago_factura) ELSE to_jsonb(v_movimiento) END,
    'movimiento_bancario', CASE WHEN v_movimiento.id IS NULL THEN NULL ELSE to_jsonb(v_movimiento) END,
    'movimiento_caja', CASE WHEN v_cash_movement.id IS NULL THEN NULL ELSE to_jsonb(v_cash_movement) END,
    'request_fingerprint', v_fingerprint,
    'valuacion', jsonb_build_object(
      'moneda_local', v_moneda_local, 'tipo_cambio_origen', v_tc_origen,
      'tipo_cambio_liquidacion', v_tc_liquidacion,
      'monto_contabilizado', v_monto_contabilizado,
      'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia
    )
  );
END;
$$;

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
AS $$
  SELECT app.aplicar_pago_cxp_tx(p_tenant_id, p_cxp_id, p_pago, p_usuario_id)
$$;

CREATE OR REPLACE FUNCTION public.registrar_cxc_pago_tx(
  p_tenant_id uuid,
  p_cuenta_id uuid,
  p_pago jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_session public.sesiones_caja%ROWTYPE;
  v_pago public.cxc_pagos%ROWTYPE;
  v_movimiento public.movimientos_bancarios%ROWTYPE;
  v_cash_movement public.movimientos_caja%ROWTYPE;
  v_monto numeric(14,2) := round(coalesce(nullif(p_pago->>'monto', '')::numeric, 0), 2);
  v_fecha date := coalesce(nullif(p_pago->>'fecha_pago', '')::date, current_date);
  v_tipo text := upper(coalesce(nullif(btrim(p_pago->>'tipo'), ''), 'PAGO'));
  v_referencia text := nullif(btrim(coalesce(p_pago->>'referencia', '')), '');
  v_notas text := nullif(btrim(coalesce(p_pago->>'notas', '')), '');
  v_metodo text;
  v_moneda text;
  v_cuenta_bancaria_id uuid := nullif(p_pago->>'cuenta_bancaria_id', '')::uuid;
  v_session_id uuid := nullif(p_pago->>'sesion_caja_id', '')::uuid;
  v_documento_pago_id uuid := nullif(p_pago->>'documento_pago_id', '')::uuid;
  v_key text := nullif(btrim(coalesce(p_pago->>'idempotency_key', '')), '');
  v_event_id uuid := coalesce(nullif(p_pago->>'event_id', '')::uuid, gen_random_uuid());
  v_fingerprint text;
  v_existing_fp text;
  v_pendiente_anterior numeric(14,2);
  v_pendiente_nuevo numeric(14,2);
  v_estado_anterior text;
  v_estado_nuevo text;
  v_retencion_monto numeric(14,2);
  v_retencion_total numeric(14,2);
  v_percepcion_total numeric(14,2);
  v_detraccion_total numeric(14,2);
  v_anticipo_total numeric(14,2);
  v_banco_anterior numeric(14,2);
  v_banco_nuevo numeric(14,2);
  v_cliente_nombre text;
  v_numero_documento text;
  v_valuation jsonb;
  v_moneda_local text;
  v_tc_origen numeric(18,6);
  v_tc_liquidacion numeric(18,6);
  v_monto_contabilizado numeric(18,2);
  v_monto_liquidacion numeric(18,2);
  v_diferencia numeric(18,2);
  v_is_treasury_payment boolean;
  v_event_type text;
  v_total_nuevo numeric(14,2);
  v_documento_ajuste public.documentos%ROWTYPE;
  v_base_ajuste numeric(14,2) := 0;
  v_igv_ajuste numeric(14,2) := 0;
BEGIN
  PERFORM app.assert_treasury_actor_452(p_tenant_id, p_user_id);
  IF p_cuenta_id IS NULL OR v_monto <= 0 OR v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'CxC, monto positivo e idempotency_key son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF v_tipo NOT IN ('PAGO', 'ANTICIPO', 'DETRACCION', 'PERCEPCION', 'RETENCION', 'NOTA_CREDITO') THEN
    RAISE EXCEPTION 'Tipo de movimiento CxC no soportado' USING ERRCODE = '22023';
  END IF;
  v_is_treasury_payment := v_tipo = 'PAGO';
  v_metodo := CASE WHEN v_is_treasury_payment
    THEN upper(coalesce(nullif(btrim(p_pago->>'metodo_pago'), ''), 'EFECTIVO'))
    ELSE v_tipo
  END;
  v_event_type := CASE WHEN v_is_treasury_payment
    THEN 'cobro.registrado' ELSE 'cxc.ajuste.registrado' END;
  IF v_is_treasury_payment AND v_metodo NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA') THEN
    RAISE EXCEPTION 'Metodo de cobro no soportado' USING ERRCODE = '22023';
  END IF;
  IF v_is_treasury_payment AND v_metodo = 'EFECTIVO' AND v_cuenta_bancaria_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un cobro en efectivo no puede usar cuenta bancaria' USING ERRCODE = '23514';
  ELSIF v_is_treasury_payment AND v_metodo <> 'EFECTIVO'
        AND (v_cuenta_bancaria_id IS NULL OR v_referencia IS NULL) THEN
    RAISE EXCEPTION 'Un cobro no efectivo exige cuenta bancaria y referencia' USING ERRCODE = '23514';
  ELSIF NOT v_is_treasury_payment AND (v_cuenta_bancaria_id IS NOT NULL OR v_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Los ajustes CxC no pueden mover caja o banco' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_user_id,
    'cxc_id', p_cuenta_id, 'monto', v_monto, 'fecha', v_fecha,
    'tipo', v_tipo, 'metodo', v_metodo,
    'cuenta_bancaria_id', v_cuenta_bancaria_id,
    'sesion_caja_id_solicitada', v_session_id,
    'documento_pago_id', v_documento_pago_id,
    'referencia', v_referencia, 'notas', v_notas,
    'aplica_retencion', coalesce((p_pago->>'aplica_retencion')::boolean, false),
    'retencion_monto', round(coalesce(nullif(p_pago->>'retencion_monto', '')::numeric, 0), 2)
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cxc-payment:' || lower(v_key), 452));

  SELECT * INTO v_pago
  FROM public.cxc_pagos cp
  WHERE cp.tenant_id = p_tenant_id
    AND lower(btrim(cp.idempotency_key)) = lower(v_key)
  LIMIT 1;
  IF FOUND THEN
    v_existing_fp := nullif(v_pago.metadata->>'request_fingerprint', '');
    IF v_pago.cuenta_id IS DISTINCT FROM p_cuenta_id
       OR v_existing_fp IS NULL OR v_existing_fp <> v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_CXC_PAYMENT'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar
    WHERE tenant_id = p_tenant_id AND id = p_cuenta_id;
    SELECT * INTO v_movimiento FROM public.movimientos_bancarios mb
    WHERE mb.tenant_id = p_tenant_id
      AND mb.cxc_id = p_cuenta_id
      AND mb.metadata->>'pago_id' = v_pago.id::text;
    SELECT * INTO v_cash_movement FROM public.movimientos_caja mc
    WHERE mc.tenant_id = p_tenant_id
      AND lower(coalesce(mc.referencia_tipo, '')) = 'cxc_pago'
      AND mc.referencia_documento = v_pago.id::text;
    RETURN jsonb_build_object(
      'idempotent', true, 'pago', to_jsonb(v_pago), 'cuenta', to_jsonb(v_cuenta),
      'movimiento_bancario', CASE WHEN v_movimiento.id IS NULL THEN NULL ELSE to_jsonb(v_movimiento) END,
      'movimiento_caja', CASE WHEN v_cash_movement.id IS NULL THEN NULL ELSE to_jsonb(v_cash_movement) END,
      'request_fingerprint', v_fingerprint
    );
  END IF;

  SELECT * INTO v_cuenta
  FROM public.cuentas_por_cobrar cpc
  WHERE cpc.tenant_id = p_tenant_id AND cpc.id = p_cuenta_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_cuenta.estado::text) = 'ANULADA'
     OR (v_tipo <> 'PERCEPCION' AND upper(v_cuenta.estado::text) IN ('CANCELADO', 'PAGADA')) THEN
    RAISE EXCEPTION 'La cuenta por cobrar no admite movimientos en estado %', v_cuenta.estado
      USING ERRCODE = '23514';
  END IF;
  v_pendiente_anterior := round(coalesce(
    v_cuenta.monto_pendiente, v_cuenta.saldo_pendiente, v_cuenta.saldo, 0
  ), 2);
  v_estado_anterior := upper(v_cuenta.estado::text);
  IF v_tipo <> 'PERCEPCION' AND v_monto - v_pendiente_anterior > 0.01 THEN
    RAISE EXCEPTION 'El monto del pago supera el saldo pendiente' USING ERRCODE = '23514';
  END IF;

  IF v_tipo = 'NOTA_CREDITO' THEN
    IF v_documento_pago_id IS NULL THEN
      RAISE EXCEPTION 'La nota de crédito exige documento_pago_id'
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_documento_ajuste
    FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id AND d.id = v_documento_pago_id
    FOR UPDATE;
    IF NOT FOUND OR upper(coalesce(v_documento_ajuste.tipo_documento, '')) <> 'NOTA_CREDITO'
       OR abs(round(coalesce(v_documento_ajuste.total, 0), 2) - v_monto) > 0.01 THEN
      RAISE EXCEPTION 'El documento de nota de crédito no existe o no coincide con el monto'
        USING ERRCODE = '23514';
    END IF;
    v_base_ajuste := round(coalesce(v_documento_ajuste.subtotal, 0), 2);
    v_igv_ajuste := round(coalesce(v_documento_ajuste.impuesto_igv, 0), 2);
    IF abs(v_base_ajuste + v_igv_ajuste - v_monto) > 0.01 THEN
      RAISE EXCEPTION 'La base e IGV de la nota de crédito no cuadran con su total'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_referencia IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cxc_pagos cp
    WHERE cp.tenant_id = p_tenant_id AND cp.cuenta_id = p_cuenta_id
      AND upper(btrim(cp.referencia)) = upper(v_referencia)
  ) THEN
    RAISE EXCEPTION 'Ya existe un movimiento CxC con esa referencia' USING ERRCODE = '23505';
  END IF;

  v_moneda := upper(coalesce(v_cuenta.moneda, 'PEN'));
  IF nullif(upper(btrim(coalesce(p_pago->>'moneda', ''))), '') IS NOT NULL
     AND upper(btrim(p_pago->>'moneda')) <> v_moneda THEN
    RAISE EXCEPTION 'La moneda solicitada no coincide con la CxC' USING ERRCODE = '23514';
  END IF;
  v_valuation := app.treasury_valuation_452(
    p_tenant_id, 'CXC', v_moneda, v_cuenta.tipo_cambio_origen,
    coalesce(v_cuenta.fecha_emision, v_fecha), v_fecha
  );
  v_moneda_local := v_valuation->>'moneda_local';
  v_tc_origen := (v_valuation->>'tipo_cambio_origen')::numeric;
  v_tc_liquidacion := CASE WHEN v_is_treasury_payment
    THEN (v_valuation->>'tipo_cambio_liquidacion')::numeric ELSE v_tc_origen END;
  v_monto_contabilizado := round(v_monto * v_tc_origen, 2);
  v_monto_liquidacion := round(v_monto * v_tc_liquidacion, 2);
  v_diferencia := CASE WHEN v_is_treasury_payment
    THEN round(v_monto_liquidacion - v_monto_contabilizado, 2) ELSE 0 END;
  IF v_cuenta.tipo_cambio_origen IS NULL AND v_moneda <> v_moneda_local THEN
    UPDATE public.cuentas_por_cobrar
    SET tipo_cambio_origen = v_tc_origen, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_cuenta_id;
    v_cuenta.tipo_cambio_origen := v_tc_origen;
  END IF;

  v_retencion_monto := CASE
    WHEN v_tipo = 'NOTA_CREDITO' THEN NULL
    WHEN coalesce((p_pago->>'aplica_retencion')::boolean, false) OR v_tipo = 'RETENCION'
      THEN round(coalesce(nullif(p_pago->>'retencion_monto', '')::numeric, v_monto), 2)
    ELSE NULL
  END;
  IF v_retencion_monto IS NOT NULL AND (v_retencion_monto <= 0 OR v_retencion_monto > v_monto) THEN
    RAISE EXCEPTION 'Monto de retencion invalido' USING ERRCODE = '23514';
  END IF;
  v_retencion_total := round(coalesce(v_cuenta.retencion_total, 0) + coalesce(v_retencion_monto, 0), 2);
  v_percepcion_total := round(coalesce(v_cuenta.percepcion_total, 0) + CASE WHEN v_tipo = 'PERCEPCION' THEN v_monto ELSE 0 END, 2);
  v_detraccion_total := round(coalesce(v_cuenta.detraccion_total, 0) + CASE WHEN v_tipo = 'DETRACCION' THEN v_monto ELSE 0 END, 2);
  v_anticipo_total := round(coalesce(v_cuenta.anticipo_total, 0) + CASE WHEN v_tipo = 'ANTICIPO' THEN v_monto ELSE 0 END, 2);

  INSERT INTO public.cxc_pagos (
    tenant_id, cuenta_id, pedido_id, documento_id, monto, moneda, fecha_pago,
    metodo_pago, referencia, notas, tipo, aplica_retencion, retencion_monto,
    usuario_id, cuenta_bancaria_id, event_id, idempotency_key, source,
    metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_cuenta_id, v_cuenta.pedido_id, v_documento_pago_id,
    v_monto, v_moneda, v_fecha, v_metodo, v_referencia, v_notas, v_tipo,
    v_tipo <> 'NOTA_CREDITO' AND (coalesce((p_pago->>'aplica_retencion')::boolean, false) OR v_tipo = 'RETENCION'),
    v_retencion_monto, p_user_id, v_cuenta_bancaria_id, v_event_id, v_key,
    'finanzas.cxc.atomic',
    jsonb_build_object(
      'request_fingerprint', v_fingerprint, 'fingerprint_version', 1,
      'sesion_caja_id', v_session_id, 'moneda_local', v_moneda_local,
      'tipo_cambio_origen', v_tc_origen, 'tipo_cambio_liquidacion', v_tc_liquidacion,
      'monto_contabilizado', v_monto_contabilizado,
      'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia
    ), now(), now()
  ) RETURNING * INTO v_pago;

  SELECT coalesce(c.razon_social, c.nombre_comercial, v_cuenta.cliente_id::text)
  INTO v_cliente_nombre
  FROM public.clientes c
  WHERE c.tenant_id = p_tenant_id AND c.id = v_cuenta.cliente_id;
  v_numero_documento := coalesce(
    nullif(concat_ws('-', v_cuenta.serie, v_cuenta.numero), ''),
    v_cuenta.numero_documento, v_cuenta.documento_id::text, 'SIN-DOC'
  );

  IF v_is_treasury_payment AND v_metodo = 'EFECTIVO' THEN
    v_session := app.resolve_cash_session_452(p_tenant_id, p_user_id, v_session_id, v_moneda);
    v_cash_movement := app.append_cash_movement_452(
      v_session, p_user_id, v_monto, 'IN', 'cxc_pago', v_pago.id::text,
      format('Cobro en efectivo de cliente %s - Doc: %s',
        coalesce(v_cliente_nombre, v_cuenta.cliente_id::text), v_numero_documento),
      jsonb_build_object(
        'request_fingerprint', v_fingerprint, 'cxc_id', p_cuenta_id,
        'pago_id', v_pago.id, 'idempotency_key', v_key
      )
    );
    UPDATE public.cxc_pagos
    SET metadata = metadata || jsonb_build_object('sesion_caja_id', v_session.id), updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_pago.id
    RETURNING * INTO v_pago;
  ELSIF v_is_treasury_payment THEN
    SELECT * INTO v_banco
    FROM public.cuentas_bancarias cb
    WHERE cb.tenant_id = p_tenant_id AND cb.id = v_cuenta_bancaria_id
    FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_banco.activa, false)
       OR upper(coalesce(v_banco.estado, '')) <> 'ACTIVO' THEN
      RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva' USING ERRCODE = '23514';
    END IF;
    IF upper(coalesce(v_banco.moneda, 'PEN')) <> v_moneda THEN
      RAISE EXCEPTION 'La moneda del banco no coincide con la CxC' USING ERRCODE = '23514';
    END IF;
    v_banco_anterior := round(coalesce(v_banco.saldo, v_banco.saldo_actual, 0), 2);
    v_banco_nuevo := round(v_banco_anterior + v_monto, 2);
    INSERT INTO public.movimientos_bancarios (
      tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, cliente_id, cxc_id, conciliado,
      saldo_anterior, saldo_nuevo, idempotency_key, created_by, metadata
    ) VALUES (
      p_tenant_id, v_cuenta_bancaria_id, 'ABONO', v_monto, v_fecha,
      format('Cobro de cliente %s - Doc: %s',
        coalesce(v_cliente_nombre, v_cuenta.cliente_id::text), v_numero_documento),
      v_referencia, v_metodo, v_cuenta.cliente_id, p_cuenta_id, false,
      v_banco_anterior, v_banco_nuevo, v_key || ':bank', p_user_id,
      jsonb_build_object(
        'request_fingerprint', v_fingerprint, 'fingerprint_version', 1,
        'pago_id', v_pago.id, 'event_id', v_event_id,
        'moneda_local', v_moneda_local, 'tipo_cambio_origen', v_tc_origen,
        'tipo_cambio_liquidacion', v_tc_liquidacion,
        'monto_contabilizado', v_monto_contabilizado,
        'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia
      )
    ) RETURNING * INTO v_movimiento;
    UPDATE public.cuentas_bancarias
    SET saldo = v_banco_nuevo, saldo_actual = v_banco_nuevo,
        saldo_contable = v_banco_nuevo, updated_at = now(), updated_by = p_user_id
    WHERE tenant_id = p_tenant_id AND id = v_cuenta_bancaria_id;
  END IF;

  v_pendiente_nuevo := CASE WHEN v_tipo = 'PERCEPCION'
    THEN round(v_pendiente_anterior + v_monto, 2)
    ELSE round(greatest(v_pendiente_anterior - v_monto, 0), 2)
  END;
  v_total_nuevo := CASE WHEN v_tipo = 'PERCEPCION'
    THEN round(coalesce(v_cuenta.monto_total, v_cuenta.total, 0) + v_monto, 2)
    ELSE round(coalesce(v_cuenta.monto_total, v_cuenta.total, 0), 2)
  END;
  v_estado_nuevo := CASE
    WHEN v_pendiente_nuevo <= 0.009 THEN 'CANCELADO'
    WHEN v_pendiente_nuevo >= v_total_nuevo THEN 'PENDIENTE'
    ELSE 'PARCIAL'
  END;
  UPDATE public.cuentas_por_cobrar
  SET monto_total = v_total_nuevo, total = v_total_nuevo,
      monto_pendiente = v_pendiente_nuevo, saldo_pendiente = v_pendiente_nuevo,
      saldo = v_pendiente_nuevo, estado = v_estado_nuevo,
      dias_mora = CASE WHEN v_pendiente_nuevo > 0
        THEN greatest(current_date - coalesce(fecha_vencimiento, current_date), 0) ELSE 0 END,
      retencion_total = v_retencion_total, percepcion_total = v_percepcion_total,
      detraccion_total = v_detraccion_total, anticipo_total = v_anticipo_total,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_cuenta_id
  RETURNING * INTO v_cuenta;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id,
    CASE WHEN v_is_treasury_payment THEN 'cobro' ELSE 'cxc_ajuste' END,
    v_pago.id::text, v_event_type,
    jsonb_build_object(
      'tenant_id', p_tenant_id, 'tenantId', p_tenant_id,
      'event_id', v_event_id, 'eventId', v_event_id,
      'idempotency_key', v_key, 'idempotencyKey', v_key,
      'requestFingerprint', v_fingerprint,
      'cobro_id', v_pago.id, 'cobroId', v_pago.id,
      'cxc_id', p_cuenta_id, 'cxcId', p_cuenta_id,
      'cliente_id', v_cuenta.cliente_id, 'clienteId', v_cuenta.cliente_id,
      'cliente_nombre', v_cliente_nombre, 'clienteNombre', v_cliente_nombre,
      'documento_id', v_cuenta.documento_id, 'documentoId', v_cuenta.documento_id,
      'numero_documento', v_numero_documento, 'numeroDocumento', v_numero_documento,
      'monto', v_monto, 'moneda', v_moneda, 'monedaLocal', v_moneda_local,
      'baseAjuste', round(v_base_ajuste * v_tc_origen, 2),
      'igvAjuste', round(v_igv_ajuste * v_tc_origen, 2),
      'fecha', v_fecha, 'medio', v_metodo, 'metodo_pago', v_metodo,
      'tipoMovimiento', v_tipo,
      'cuenta_bancaria_id', v_cuenta_bancaria_id, 'cuentaBancariaId', v_cuenta_bancaria_id,
      'sesionCajaId', v_session.id, 'referencia', v_referencia, 'notas', v_notas,
      'saldo_anterior', v_pendiente_anterior, 'saldoAnterior', v_pendiente_anterior,
      'saldo_nuevo', v_pendiente_nuevo, 'saldoNuevo', v_pendiente_nuevo,
      'estado_anterior', v_estado_anterior, 'estadoAnterior', v_estado_anterior
    ) || jsonb_build_object(
      'estado_nuevo', v_estado_nuevo, 'estadoNuevo', v_estado_nuevo,
      'movimiento_bancario_id', v_movimiento.id, 'movimientoBancarioId', v_movimiento.id,
      'movimientoCajaId', v_cash_movement.id,
      'created_by', p_user_id, 'createdBy', p_user_id,
      'tipoCambioOrigen', v_tc_origen,
      'tipoCambioLiquidacion', v_tc_liquidacion,
      'montoContabilizado', v_monto_contabilizado,
      'montoLiquidacion', v_monto_liquidacion,
      'diferenciaCambio', v_diferencia,
      'source', 'public.registrar_cxc_pago_tx', 'timestamp', clock_timestamp()
    ),
    'pending', 0, v_key, v_event_id, clock_timestamp()
  );

  RETURN jsonb_build_object(
    'idempotent', false, 'pago', to_jsonb(v_pago), 'cuenta', to_jsonb(v_cuenta),
    'movimiento_bancario', CASE WHEN v_movimiento.id IS NULL THEN NULL ELSE to_jsonb(v_movimiento) END,
    'movimiento_caja', CASE WHEN v_cash_movement.id IS NULL THEN NULL ELSE to_jsonb(v_cash_movement) END,
    'saldo_anterior', v_pendiente_anterior, 'saldo_nuevo', v_pendiente_nuevo,
    'estado_nuevo', v_estado_nuevo, 'event_id', v_event_id,
    'idempotency_key', v_key, 'request_fingerprint', v_fingerprint,
    'valuacion', jsonb_build_object(
      'moneda_local', v_moneda_local, 'tipo_cambio_origen', v_tc_origen,
      'tipo_cambio_liquidacion', v_tc_liquidacion,
      'monto_contabilizado', v_monto_contabilizado,
      'monto_liquidacion', v_monto_liquidacion, 'diferencia_cambio', v_diferencia
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.procesar_pago_lote(uuid, uuid, date, text, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.procesar_pago_lote(
  p_tenant_id uuid,
  p_cuenta_bancaria_id uuid,
  p_fecha_pago date,
  p_metodo_pago text,
  p_referencia_lote text,
  p_observaciones text,
  p_pagos jsonb,
  p_created_by uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$
DECLARE
  v_method text := upper(btrim(coalesce(p_metodo_pago, '')));
  v_reference text := nullif(btrim(coalesce(p_referencia_lote, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_canonical_items jsonb;
  v_fingerprint text;
  v_existing public.pagos_lote%ROWTYPE;
  v_item record;
  v_child_key text;
  v_child jsonb;
  v_results jsonb := '[]'::jsonb;
  v_total numeric(18,2) := 0;
  v_batch_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  PERFORM app.assert_treasury_actor_452(p_tenant_id, p_created_by);
  IF p_cuenta_bancaria_id IS NULL OR p_fecha_pago IS NULL OR v_reference IS NULL
     OR v_key IS NULL OR length(v_key) > 160
     OR jsonb_typeof(p_pagos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'Banco, fecha, referencia, idempotency_key y pagos son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('TRANSFERENCIA', 'CHEQUE', 'TARJETA') THEN
    RAISE EXCEPTION 'Los pagos por lote exigen un medio bancario' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_pagos) x
    GROUP BY nullif(x->>'cxp_id', '')::uuid
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Una CxP no puede repetirse dentro del lote' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_pagos) x
    WHERE nullif(x->>'cxp_id', '') IS NULL
      OR (nullif(x->>'monto', '') IS NOT NULL AND (x->>'monto')::numeric <= 0)
  ) THEN
    RAISE EXCEPTION 'El lote contiene una CxP o monto invalido' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'ordinal', ord, 'cxp_id', nullif(x->>'cxp_id', '')::uuid,
    'monto', CASE WHEN nullif(x->>'monto', '') IS NULL THEN NULL
      ELSE round((x->>'monto')::numeric, 2) END
  ) ORDER BY ord)
  INTO v_canonical_items
  FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS e(x, ord);

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1, 'tenant_id', p_tenant_id, 'actor_id', p_created_by,
    'cuenta_bancaria_id', p_cuenta_bancaria_id, 'fecha', p_fecha_pago,
    'metodo', v_method, 'referencia', v_reference,
    'observaciones', nullif(btrim(coalesce(p_observaciones, '')), ''),
    'pagos', v_canonical_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cxp-batch:' || lower(v_key), 452));

  SELECT * INTO v_existing
  FROM public.pagos_lote pl
  WHERE pl.tenant_id = p_tenant_id
    AND lower(btrim(pl.metadata->>'idempotency_key')) = lower(v_key)
  LIMIT 1;
  IF FOUND THEN
    IF nullif(v_existing.metadata->>'request_fingerprint', '') IS NULL
       OR v_existing.metadata->>'request_fingerprint' <> v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYMENT_BATCH'
        USING ERRCODE = '23505';
    END IF;
    RETURN coalesce(v_existing.resultado, '{}'::jsonb) || jsonb_build_object('idempotent_replay', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pagos_lote pl
    WHERE pl.tenant_id = p_tenant_id AND pl.referencia_lote = v_reference
  ) THEN
    RAISE EXCEPTION 'La referencia del lote ya fue utilizada por otra intencion'
      USING ERRCODE = '23505';
  END IF;

  FOR v_item IN
    SELECT x, ord
    FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS e(x, ord)
    ORDER BY ord
  LOOP
    v_child_key := 'cxp:lote:' || encode(extensions.digest(convert_to(
      v_key || '|' || v_item.ord::text || '|' || (v_item.x->>'cxp_id'), 'UTF8'
    ), 'sha256'), 'hex');
    v_child := app.aplicar_pago_cxp_tx(
      p_tenant_id,
      (v_item.x->>'cxp_id')::uuid,
      jsonb_build_object(
        'monto', CASE WHEN nullif(v_item.x->>'monto', '') IS NULL THEN (
          SELECT coalesce(cxp.saldo, cxp.saldo_pendiente, 0)
          FROM public.cuentas_por_pagar cxp
          WHERE cxp.tenant_id = p_tenant_id AND cxp.id = (v_item.x->>'cxp_id')::uuid
        ) ELSE (v_item.x->>'monto')::numeric END,
        'fecha_pago', p_fecha_pago, 'metodo_pago', v_method,
        'cuenta_bancaria_id', p_cuenta_bancaria_id,
        'referencia', v_reference, 'observaciones', p_observaciones,
        'idempotency_key', v_child_key, 'pago_id', gen_random_uuid(),
        'event_id', gen_random_uuid()
      ),
      p_created_by
    );
    v_total := v_total + coalesce((v_child->'pago'->>'monto')::numeric, 0);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'cxp_id', v_item.x->>'cxp_id',
      'monto', (v_child->'pago'->>'monto')::numeric,
      'saldo_anterior', v_child->'pago'->>'saldo_anterior',
      'saldo_nuevo', v_child->'pago'->>'saldo_nuevo',
      'estado_nuevo', v_child->'cxp'->>'estado',
      'movimiento_bancario_id', v_child->'movimiento_bancario'->>'id',
      'request_fingerprint', v_child->>'request_fingerprint',
      'valuacion', v_child->'valuacion'
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'success', true, 'idempotent_replay', false, 'lote_id', v_batch_id,
    'referencia_lote', v_reference, 'idempotency_key', v_key,
    'total_procesado', round(v_total, 2), 'monto_total', round(v_total, 2),
    'cantidad_pagos', jsonb_array_length(v_results),
    'total_pagos', jsonb_array_length(v_results),
    'pagos_exitosos', jsonb_array_length(v_results), 'pagos_fallidos', 0,
    'pagos', v_results,
    'cuenta_bancaria', (
      SELECT jsonb_build_object('id', cb.id, 'nombre', cb.nombre,
        'moneda', cb.moneda,
        'saldo_anterior', round(coalesce(cb.saldo, cb.saldo_actual, 0) + v_total, 2),
        'saldo_nuevo', round(coalesce(cb.saldo, cb.saldo_actual, 0), 2))
      FROM public.cuentas_bancarias cb
      WHERE cb.tenant_id = p_tenant_id AND cb.id = p_cuenta_bancaria_id
    )
  );

  INSERT INTO public.pagos_lote (
    id, tenant_id, referencia_lote, cuenta_bancaria_id, fecha_pago,
    metodo_pago, monto_total, pagos, resultado, estado, activo, metadata,
    created_at, updated_at
  ) VALUES (
    v_batch_id, p_tenant_id, v_reference, p_cuenta_bancaria_id, p_fecha_pago,
    v_method, round(v_total, 2), v_canonical_items, v_result, 'PROCESADO', true,
    jsonb_build_object(
      'idempotency_key', v_key, 'request_fingerprint', v_fingerprint,
      'fingerprint_version', 1, 'created_by', p_created_by,
      'observaciones', nullif(btrim(coalesce(p_observaciones, '')), '')
    ), now(), now()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_treasury_actor_452(uuid,uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.treasury_local_currency_452(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.treasury_valuation_452(uuid,text,text,numeric,date,date)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.resolve_cash_session_452(uuid,uuid,uuid,text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.append_cash_movement_452(public.sesiones_caja,uuid,numeric,text,text,text,text,jsonb)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid,text) TO service_role;

COMMENT ON FUNCTION public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid) IS
  'Writer unico CxP: pago, caja/banco, valuacion y outbox atomicos con actor y huella.';
COMMENT ON FUNCTION public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid) IS
  'Writer unico CxC: cobro/ajuste, caja/banco, valuacion y outbox atomicos con actor y huella.';
COMMENT ON FUNCTION public.procesar_pago_lote(uuid,uuid,date,text,text,text,jsonb,uuid,text) IS
  'Lote CxP atomico service-role-only que reutiliza el writer individual y conserva huella semantica.';

COMMIT;

NOTIFY pgrst, 'reload schema';
