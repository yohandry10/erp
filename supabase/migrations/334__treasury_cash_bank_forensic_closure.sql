-- ============================================================================
-- 334__treasury_cash_bank_forensic_closure.sql
-- Cierre forense Tesoreria + Caja + Bancos + CxC/CxP + Conciliacion.
-- - CxC cobro/banco/saldo en una sola transaccion.
-- - Conciliacion bancaria sistema/extracto en una sola transaccion.
-- - Reparaciones idempotentes de brechas historicas detectadas.
-- - Validacion runtime para criterio de cierre contable.
-- Nota: los indices, idempotency keys y repair_code internos conservan el
-- sufijo 333 porque esta migracion se aplico inicialmente con ese numero en
-- una BD configurada. Cambiarlos podria duplicar indices o reejecutar backfills.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_forensic_repair_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_code text NOT NULL,
  tenant_id uuid,
  entity_table text NOT NULL,
  entity_id uuid,
  before_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  migration_name text NOT NULL DEFAULT '334__treasury_cash_bank_forensic_closure',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_forensic_repair_log_tenant_code
ON public.financial_forensic_repair_log (tenant_id, repair_code, created_at DESC);

ALTER TABLE IF EXISTS public.ventas_pos
  ADD COLUMN IF NOT EXISTS cxc_pendiente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cxc_error text,
  ADD COLUMN IF NOT EXISTS cxc_reintentos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuenta_por_cobrar_id uuid;

CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_cxc_pendiente_333
ON public.ventas_pos (tenant_id, cxc_pendiente, fecha DESC)
WHERE cxc_pendiente = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_bancarios_tenant_match_once_333
ON public.movimientos_bancarios (tenant_id, movimiento_relacionado_id)
WHERE COALESCE(conciliado, false) = true
  AND movimiento_relacionado_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_venta_pos_once_333
ON public.movimientos_caja (tenant_id, referencia_tipo, referencia_documento)
WHERE referencia_tipo = 'venta_pos'
  AND referencia_documento IS NOT NULL
  AND tipo_movimiento = 'VENTA';

CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_pos_pagos_venta_metodo_ref_once_333
ON public.ventas_pos_pagos (
  tenant_id,
  venta_pos_id,
  lower(btrim(COALESCE(metodo_pago_codigo, ''))),
  lower(btrim(COALESCE(referencia, ''))),
  round(COALESCE(monto, 0), 2)
)
WHERE venta_pos_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_cxc_pago_tx(
  p_tenant_id uuid,
  p_cuenta_id uuid,
  p_pago jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_pago public.cxc_pagos%ROWTYPE;
  v_movimiento public.movimientos_bancarios%ROWTYPE;
  v_monto numeric(14,2);
  v_fecha date;
  v_tipo text;
  v_es_nota_credito boolean;
  v_referencia text;
  v_metodo text;
  v_moneda text;
  v_cuenta_bancaria_id uuid;
  v_documento_pago_id uuid;
  v_idempotency_key text;
  v_event_id uuid;
  v_pendiente_anterior numeric(14,2);
  v_pendiente_nuevo numeric(14,2);
  v_estado_nuevo text;
  v_retencion_monto numeric(14,2);
  v_retencion_total numeric(14,2);
  v_percepcion_total numeric(14,2);
  v_detraccion_total numeric(14,2);
  v_anticipo_total numeric(14,2);
  v_saldo_banco_nuevo numeric(14,2);
  v_cliente_nombre text;
  v_numero_documento text;
  v_payload jsonb;
BEGIN
  v_monto := round(COALESCE(NULLIF(p_pago->>'monto', '')::numeric, 0), 2);
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  v_fecha := COALESCE(NULLIF(p_pago->>'fecha_pago', '')::date, CURRENT_DATE);
  v_tipo := upper(COALESCE(NULLIF(p_pago->>'tipo', ''), 'PAGO'));
  v_es_nota_credito := v_tipo = 'NOTA_CREDITO';
  v_referencia := NULLIF(btrim(COALESCE(p_pago->>'referencia', '')), '');
  v_metodo := CASE WHEN v_es_nota_credito THEN 'NOTA_CREDITO' ELSE NULLIF(btrim(COALESCE(p_pago->>'metodo_pago', '')), '') END;
  v_moneda := upper(COALESCE(NULLIF(p_pago->>'moneda', ''), 'PEN'));
  v_cuenta_bancaria_id := NULLIF(p_pago->>'cuenta_bancaria_id', '')::uuid;
  v_documento_pago_id := NULLIF(p_pago->>'documento_pago_id', '')::uuid;
  v_idempotency_key := NULLIF(btrim(COALESCE(p_pago->>'idempotency_key', '')), '');
  v_event_id := COALESCE(NULLIF(p_pago->>'event_id', '')::uuid, gen_random_uuid());

  IF v_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_pago
    FROM public.cxc_pagos
    WHERE tenant_id = p_tenant_id
      AND lower(btrim(idempotency_key)) = lower(btrim(v_idempotency_key))
    LIMIT 1;

    IF FOUND THEN
      SELECT *
      INTO v_cuenta
      FROM public.cuentas_por_cobrar
      WHERE tenant_id = p_tenant_id
        AND id = p_cuenta_id;

      RETURN jsonb_build_object(
        'idempotent', true,
        'pago', to_jsonb(v_pago),
        'cuenta', to_jsonb(v_cuenta),
        'movimiento_bancario', NULL
      );
    END IF;
  END IF;

  SELECT *
  INTO v_cuenta
  FROM public.cuentas_por_cobrar
  WHERE tenant_id = p_tenant_id
    AND id = p_cuenta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por cobrar no encontrada';
  END IF;

  v_pendiente_anterior := round(COALESCE(v_cuenta.monto_pendiente, v_cuenta.saldo_pendiente, v_cuenta.saldo, 0), 2);
  IF v_monto - v_pendiente_anterior > 0.01 THEN
    RAISE EXCEPTION 'El monto del pago supera el saldo pendiente';
  END IF;

  IF v_referencia IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cxc_pagos
    WHERE tenant_id = p_tenant_id
      AND cuenta_id = p_cuenta_id
      AND referencia = v_referencia
  ) THEN
    RAISE EXCEPTION 'Ya existe un pago registrado con la referencia "%"', v_referencia;
  END IF;

  IF NOT v_es_nota_credito AND v_cuenta_bancaria_id IS NOT NULL THEN
    SELECT *
    INTO v_banco
    FROM public.cuentas_bancarias
    WHERE tenant_id = p_tenant_id
      AND id = v_cuenta_bancaria_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria no encontrada';
    END IF;

    IF COALESCE(v_banco.activa, false) = false THEN
      RAISE EXCEPTION 'No se pueden registrar cobros en una cuenta bancaria inactiva';
    END IF;

    IF upper(COALESCE(v_banco.moneda, 'PEN')) <> v_moneda THEN
      RAISE EXCEPTION 'La moneda de la cuenta bancaria (%) no coincide con la moneda del cobro (%)', v_banco.moneda, v_moneda;
    END IF;
  END IF;

  v_pendiente_nuevo := round(GREATEST(v_pendiente_anterior - v_monto, 0), 2);
  v_estado_nuevo := CASE
    WHEN v_pendiente_nuevo <= 0.009 THEN 'CANCELADO'
    WHEN v_pendiente_nuevo >= round(COALESCE(v_cuenta.monto_total, v_cuenta.total, 0), 2) THEN 'PENDIENTE'
    ELSE 'PARCIAL'
  END;

  v_retencion_monto := CASE
    WHEN v_es_nota_credito THEN NULL
    WHEN COALESCE((p_pago->>'aplica_retencion')::boolean, false) OR v_tipo = 'RETENCION'
      THEN round(COALESCE(NULLIF(p_pago->>'retencion_monto', '')::numeric, v_monto), 2)
    ELSE NULL
  END;
  v_retencion_total := round(COALESCE(v_cuenta.retencion_total, 0) + COALESCE(v_retencion_monto, 0), 2);
  v_percepcion_total := round(COALESCE(v_cuenta.percepcion_total, 0) + CASE WHEN NOT v_es_nota_credito AND v_tipo = 'PERCEPCION' THEN v_monto ELSE 0 END, 2);
  v_detraccion_total := round(COALESCE(v_cuenta.detraccion_total, 0) + CASE WHEN NOT v_es_nota_credito AND v_tipo = 'DETRACCION' THEN v_monto ELSE 0 END, 2);
  v_anticipo_total := round(COALESCE(v_cuenta.anticipo_total, 0) + CASE WHEN NOT v_es_nota_credito AND v_tipo = 'ANTICIPO' THEN v_monto ELSE 0 END, 2);

  INSERT INTO public.cxc_pagos (
    tenant_id,
    cuenta_id,
    pedido_id,
    documento_id,
    monto,
    moneda,
    fecha_pago,
    metodo_pago,
    referencia,
    notas,
    tipo,
    aplica_retencion,
    retencion_monto,
    usuario_id,
    cuenta_bancaria_id,
    event_id,
    idempotency_key,
    source,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_cuenta_id,
    v_cuenta.pedido_id,
    v_documento_pago_id,
    v_monto,
    v_moneda,
    v_fecha,
    COALESCE(v_metodo, 'EFECTIVO'),
    v_referencia,
    NULLIF(p_pago->>'notas', ''),
    v_tipo,
    NOT v_es_nota_credito AND (COALESCE((p_pago->>'aplica_retencion')::boolean, false) OR v_tipo = 'RETENCION'),
    v_retencion_monto,
    p_user_id,
    v_cuenta_bancaria_id,
    v_event_id,
    COALESCE(v_idempotency_key, 'cxc.cobro:' || p_tenant_id::text || ':' || v_event_id::text),
    'finanzas.cxc',
    now(),
    now()
  )
  RETURNING * INTO v_pago;

  IF NOT v_es_nota_credito AND v_cuenta_bancaria_id IS NOT NULL THEN
    SELECT COALESCE(c.razon_social, c.nombre_comercial, v_cuenta.cliente_id::text)
    INTO v_cliente_nombre
    FROM public.clientes c
    WHERE c.tenant_id = p_tenant_id
      AND c.id = v_cuenta.cliente_id;

    v_numero_documento := COALESCE(NULLIF(concat_ws('-', v_cuenta.serie, v_cuenta.numero), ''), v_cuenta.documento_id::text);
    v_saldo_banco_nuevo := round(COALESCE(v_banco.saldo, 0) + v_monto, 2);

    INSERT INTO public.movimientos_bancarios (
      tenant_id,
      cuenta_bancaria_id,
      tipo,
      monto,
      fecha,
      descripcion,
      referencia,
      metodo_pago,
      cliente_id,
      cxc_id,
      conciliado,
      saldo_anterior,
      saldo_nuevo,
      idempotency_key,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      p_tenant_id,
      v_cuenta_bancaria_id,
      'ABONO',
      v_monto,
      v_fecha,
      'Cobro de cliente ' || COALESCE(v_cliente_nombre, v_cuenta.cliente_id::text) || ' - Doc: ' || COALESCE(v_numero_documento, p_cuenta_id::text),
      v_referencia,
      COALESCE(v_metodo, 'EFECTIVO'),
      v_cuenta.cliente_id,
      p_cuenta_id,
      false,
      COALESCE(v_banco.saldo, 0),
      v_saldo_banco_nuevo,
      'cxc.banco:' || p_tenant_id::text || ':' || v_pago.id::text,
      p_user_id,
      now(),
      now()
    )
    RETURNING * INTO v_movimiento;

    UPDATE public.cuentas_bancarias
    SET saldo = v_saldo_banco_nuevo,
        updated_at = now()
    WHERE id = v_cuenta_bancaria_id
      AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.cuentas_por_cobrar
  SET monto_pendiente = v_pendiente_nuevo,
      saldo_pendiente = v_pendiente_nuevo,
      saldo = v_pendiente_nuevo,
      estado = v_estado_nuevo,
      dias_mora = CASE WHEN v_pendiente_nuevo > 0 THEN GREATEST(CURRENT_DATE - COALESCE(fecha_vencimiento, CURRENT_DATE), 0) ELSE 0 END,
      retencion_total = v_retencion_total,
      percepcion_total = v_percepcion_total,
      detraccion_total = v_detraccion_total,
      anticipo_total = v_anticipo_total,
      updated_at = now()
  WHERE id = p_cuenta_id
    AND tenant_id = p_tenant_id;

  SELECT COALESCE(c.razon_social, c.nombre_comercial, v_cuenta.cliente_id::text)
  INTO v_cliente_nombre
  FROM public.clientes c
  WHERE c.tenant_id = p_tenant_id
    AND c.id = v_cuenta.cliente_id;

  v_numero_documento := COALESCE(NULLIF(concat_ws('-', v_cuenta.serie, v_cuenta.numero), ''), v_cuenta.documento_id::text, 'SIN-DOC');
  v_payload := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenantId', p_tenant_id,
    'event_id', v_event_id,
    'eventId', v_event_id,
    'idempotency_key', v_pago.idempotency_key,
    'idempotencyKey', v_pago.idempotency_key,
    'cobro_id', v_pago.id,
    'cobroId', v_pago.id,
    'cxc_id', p_cuenta_id,
    'cxcId', p_cuenta_id,
    'cliente_id', v_cuenta.cliente_id,
    'clienteId', v_cuenta.cliente_id,
    'cliente_nombre', v_cliente_nombre,
    'clienteNombre', v_cliente_nombre,
    'documento_id', v_cuenta.documento_id,
    'documentoId', v_cuenta.documento_id,
    'numero_documento', v_numero_documento,
    'numeroDocumento', v_numero_documento,
    'monto', v_monto,
    'moneda', v_moneda,
    'fecha', v_fecha,
    'medio', COALESCE(v_metodo, 'EFECTIVO'),
    'metodo_pago', COALESCE(v_metodo, 'EFECTIVO'),
    'cuenta_bancaria_id', v_cuenta_bancaria_id,
    'cuentaBancariaId', v_cuenta_bancaria_id,
    'referencia', v_referencia,
    'notas', NULLIF(p_pago->>'notas', ''),
    'saldo_anterior', v_pendiente_anterior,
    'saldoAnterior', v_pendiente_anterior,
    'saldo_nuevo', v_pendiente_nuevo,
    'saldoNuevo', v_pendiente_nuevo,
    'estado_anterior', COALESCE(v_cuenta.estado, 'PENDIENTE'),
    'estadoAnterior', COALESCE(v_cuenta.estado, 'PENDIENTE'),
    'estado_nuevo', v_estado_nuevo,
    'estadoNuevo', v_estado_nuevo,
    'movimiento_bancario_id', v_movimiento.id,
    'movimientoBancarioId', v_movimiento.id,
    'created_by', p_user_id,
    'createdBy', p_user_id,
    'source', 'finanzas.cxc',
    'timestamp', now()
  );

  INSERT INTO public.outbox_events (
    tenant_id,
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    status,
    retry_count,
    idempotency_key,
    event_id,
    occurred_at,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    'cobro',
    v_pago.id::text,
    'cobro.registrado',
    v_payload,
    'pending',
    0,
    v_pago.idempotency_key,
    v_event_id,
    now(),
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'idempotent', false,
    'pago', to_jsonb(v_pago),
    'cuenta_anterior', to_jsonb(v_cuenta),
    'cuenta', (
      SELECT to_jsonb(cpc)
      FROM public.cuentas_por_cobrar cpc
      WHERE cpc.id = p_cuenta_id
    ),
    'movimiento_bancario', CASE WHEN v_movimiento.id IS NULL THEN NULL ELSE to_jsonb(v_movimiento) END,
    'saldo_anterior', v_pendiente_anterior,
    'saldo_nuevo', v_pendiente_nuevo,
    'estado_nuevo', v_estado_nuevo,
    'event_id', v_event_id,
    'idempotency_key', v_pago.idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.conciliar_movimientos_bancarios_tx(
  p_tenant_id uuid,
  p_conciliacion_id uuid,
  p_movimiento_sistema_id uuid,
  p_movimiento_extracto_id uuid,
  p_match_automatico boolean DEFAULT false,
  p_aceptar_diferencia boolean DEFAULT false,
  p_diferencia numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_conc public.conciliaciones_bancarias%ROWTYPE;
  v_sistema public.movimientos_bancarios%ROWTYPE;
  v_extracto public.movimientos_bancarios%ROWTYPE;
  v_diferencia numeric(14,2);
BEGIN
  SELECT *
  INTO v_conc
  FROM public.conciliaciones_bancarias
  WHERE tenant_id = p_tenant_id
    AND id = p_conciliacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conciliacion no encontrada';
  END IF;

  IF upper(COALESCE(v_conc.estado, '')) = 'CERRADA' THEN
    RAISE EXCEPTION 'No se puede conciliar una conciliacion cerrada';
  END IF;

  SELECT *
  INTO v_sistema
  FROM public.movimientos_bancarios
  WHERE tenant_id = p_tenant_id
    AND id = p_movimiento_sistema_id
    AND cuenta_bancaria_id = v_conc.cuenta_bancaria_id
    AND COALESCE(es_extracto, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento del sistema no encontrado o no pertenece a la cuenta';
  END IF;

  SELECT *
  INTO v_extracto
  FROM public.movimientos_bancarios
  WHERE tenant_id = p_tenant_id
    AND id = p_movimiento_extracto_id
    AND cuenta_bancaria_id = v_conc.cuenta_bancaria_id
    AND COALESCE(es_extracto, false) = true
    AND conciliacion_id = p_conciliacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento del extracto no encontrado o no pertenece a la conciliacion';
  END IF;

  IF COALESCE(v_sistema.conciliado, false) OR COALESCE(v_extracto.conciliado, false) THEN
    RAISE EXCEPTION 'Uno de los movimientos ya esta conciliado';
  END IF;

  IF upper(COALESCE(v_sistema.tipo, '')) <> upper(COALESCE(v_extracto.tipo, '')) THEN
    RAISE EXCEPTION 'Los tipos de movimiento no coinciden';
  END IF;

  v_diferencia := round(abs(COALESCE(v_sistema.monto, 0) - COALESCE(v_extracto.monto, 0)), 2);
  IF v_diferencia > 0 AND COALESCE(p_aceptar_diferencia, false) = false THEN
    RAISE EXCEPTION 'Los montos no coinciden; debe autorizar diferencia';
  END IF;

  IF p_diferencia IS NOT NULL AND round(p_diferencia, 2) <> v_diferencia THEN
    RAISE EXCEPTION 'La diferencia informada no coincide con la diferencia real';
  END IF;

  UPDATE public.movimientos_bancarios
  SET conciliado = true,
      conciliacion_id = p_conciliacion_id,
      match_automatico = COALESCE(p_match_automatico, false),
      match_id = p_movimiento_extracto_id,
      diferencia_conciliacion = v_diferencia,
      movimiento_relacionado_id = p_movimiento_extracto_id,
      updated_at = now()
  WHERE id = p_movimiento_sistema_id
    AND tenant_id = p_tenant_id;

  UPDATE public.movimientos_bancarios
  SET conciliado = true,
      conciliacion_id = p_conciliacion_id,
      match_automatico = COALESCE(p_match_automatico, false),
      match_id = p_movimiento_sistema_id,
      diferencia_conciliacion = v_diferencia,
      movimiento_relacionado_id = p_movimiento_sistema_id,
      updated_at = now()
  WHERE id = p_movimiento_extracto_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'conciliacion_id', p_conciliacion_id,
    'movimiento_sistema_id', p_movimiento_sistema_id,
    'movimiento_extracto_id', p_movimiento_extracto_id,
    'match_automatico', COALESCE(p_match_automatico, false),
    'diferencia', v_diferencia
  );
END;
$$;

-- Reparacion idempotente 1: ventas POS con movimiento de caja pero sin fila de pago.
WITH candidates AS (
  SELECT
    v.*,
    mc.id AS movimiento_caja_id,
    mc.monto AS monto_caja,
    row_number() OVER (PARTITION BY v.id ORDER BY mc.created_at ASC NULLS LAST, mc.id ASC) AS rn,
    count(*) OVER (PARTITION BY v.id) AS mov_count
  FROM public.ventas_pos v
  JOIN public.movimientos_caja mc
    ON mc.tenant_id = v.tenant_id
   AND mc.referencia_tipo = 'venta_pos'
   AND mc.referencia_documento = v.id::text
   AND mc.tipo_movimiento = 'VENTA'
  WHERE upper(COALESCE(v.estado, '')) IN ('PAGADA', 'COMPLETADA', 'FACTURADA')
    AND NOT EXISTS (
      SELECT 1
      FROM public.ventas_pos_pagos vp
      WHERE vp.tenant_id = v.tenant_id
        AND vp.venta_pos_id = v.id
    )
),
repair AS (
  SELECT *
  FROM candidates
  WHERE rn = 1
    AND mov_count = 1
),
logged AS (
  INSERT INTO public.financial_forensic_repair_log (
    repair_code,
    tenant_id,
    entity_table,
    entity_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    'POS_PAYMENT_BACKFILL_FROM_CASH_333',
    r.tenant_id,
    'ventas_pos',
    r.id,
    to_jsonb(r),
    jsonb_build_object('monto', COALESCE(r.monto_caja, r.total, 0), 'movimiento_caja_id', r.movimiento_caja_id),
    'Venta POS pagada tenia caja, pero no tenia fila ventas_pos_pagos'
  FROM repair r
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_forensic_repair_log l
    WHERE l.repair_code = 'POS_PAYMENT_BACKFILL_FROM_CASH_333'
      AND l.entity_id = r.id
  )
  RETURNING entity_id
)
INSERT INTO public.ventas_pos_pagos (
  tenant_id,
  venta_pos_id,
  metodo_pago_codigo,
  metodo_pago_tipo,
  monto,
  moneda,
  referencia,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  r.tenant_id,
  r.id,
  COALESCE(NULLIF(r.metodo_pago, ''), 'EFECTIVO'),
  CASE WHEN upper(COALESCE(r.metodo_pago, 'EFECTIVO')) IN ('EFECTIVO', 'CASH') THEN 'CASH' ELSE 'OTRO' END,
  round(COALESCE(r.monto_caja, r.total, 0), 2),
  'PEN',
  COALESCE(r.numero_ticket, r.id::text),
  'ACTIVO',
  jsonb_build_object('repair', '333', 'source', 'movimientos_caja', 'movimiento_caja_id', r.movimiento_caja_id),
  COALESCE(r.created_at, now()),
  now()
FROM repair r
ON CONFLICT DO NOTHING;

-- Reparacion idempotente 2: pagos POS efectivo sin movimiento de caja.
WITH candidates AS (
  SELECT
    v.id AS venta_id,
    v.tenant_id,
    v.sesion_caja_id,
    v.usuario_id,
    v.numero_ticket,
    vp.id AS pago_id,
    vp.monto,
    COALESCE(vp.created_at, v.fecha, now()) AS fecha_movimiento,
    row_number() OVER (PARTITION BY v.sesion_caja_id ORDER BY COALESCE(vp.created_at, v.fecha, now()), vp.id) AS rn_new
  FROM public.ventas_pos v
  JOIN public.ventas_pos_pagos vp
    ON vp.tenant_id = v.tenant_id
   AND vp.venta_pos_id = v.id
  WHERE upper(COALESCE(v.estado, '')) IN ('PAGADA', 'COMPLETADA', 'FACTURADA')
    AND v.sesion_caja_id IS NOT NULL
    AND upper(COALESCE(vp.metodo_pago_tipo, vp.metodo_pago_codigo, '')) IN ('CASH', 'EFECTIVO')
    AND NOT EXISTS (
      SELECT 1
      FROM public.movimientos_caja mc
      WHERE mc.tenant_id = v.tenant_id
        AND mc.sesion_caja_id = v.sesion_caja_id
        AND mc.referencia_tipo = 'venta_pos'
        AND mc.referencia_documento = v.id::text
        AND mc.tipo_movimiento = 'VENTA'
    )
),
base AS (
  SELECT
    c.*,
    COALESCE((
      SELECT max(mc.secuencia)
      FROM public.movimientos_caja mc
      WHERE mc.sesion_caja_id = c.sesion_caja_id
    ), 0) AS max_seq,
    COALESCE((
      SELECT mc.saldo_nuevo
      FROM public.movimientos_caja mc
      WHERE mc.sesion_caja_id = c.sesion_caja_id
      ORDER BY mc.secuencia DESC NULLS LAST, mc.created_at DESC NULLS LAST, mc.id DESC
      LIMIT 1
    ), (
      SELECT COALESCE(sc.monto_inicial, sc.monto_inicio, 0)
      FROM public.sesiones_caja sc
      WHERE sc.id = c.sesion_caja_id
    ), 0) AS saldo_base
  FROM candidates c
),
running AS (
  SELECT
    b.*,
    round(b.saldo_base + COALESCE(sum(b.monto) OVER (
      PARTITION BY b.sesion_caja_id
      ORDER BY b.rn_new
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0), 2) AS saldo_anterior_calc
  FROM base b
),
logged AS (
  INSERT INTO public.financial_forensic_repair_log (
    repair_code,
    tenant_id,
    entity_table,
    entity_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    'POS_CASH_MOVEMENT_BACKFILL_333',
    r.tenant_id,
    'ventas_pos_pagos',
    r.pago_id,
    to_jsonb(r),
    jsonb_build_object('venta_id', r.venta_id, 'sesion_caja_id', r.sesion_caja_id, 'monto', r.monto),
    'Pago POS efectivo no tenia movimiento de caja'
  FROM running r
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_forensic_repair_log l
    WHERE l.repair_code = 'POS_CASH_MOVEMENT_BACKFILL_333'
      AND l.entity_id = r.pago_id
  )
  RETURNING entity_id
)
INSERT INTO public.movimientos_caja (
  tenant_id,
  sesion_caja_id,
  secuencia,
  tipo_movimiento,
  monto,
  saldo_anterior,
  saldo_nuevo,
  referencia_documento,
  referencia_tipo,
  motivo,
  usuario_id,
  "timestamp",
  metadata,
  created_at,
  updated_at
)
SELECT
  r.tenant_id,
  r.sesion_caja_id,
  r.max_seq + r.rn_new,
  'VENTA',
  round(COALESCE(r.monto, 0), 2),
  r.saldo_anterior_calc,
  round(r.saldo_anterior_calc + COALESCE(r.monto, 0), 2),
  r.venta_id::text,
  'venta_pos',
  'Backfill forense de pago POS efectivo sin caja',
  r.usuario_id,
  r.fecha_movimiento,
  jsonb_build_object('repair', '333', 'source', 'ventas_pos_pagos', 'pago_id', r.pago_id, 'numero_ticket', r.numero_ticket),
  now(),
  now()
FROM running r
ON CONFLICT DO NOTHING;

-- Reparacion idempotente 3: CxP saldo distinto a pagos bancarios vinculados.
WITH calc AS (
  SELECT
    cxp.id,
    cxp.tenant_id,
    round(COALESCE(cxp.total, 0), 2) AS total_doc,
    round(COALESCE(cxp.saldo, cxp.saldo_pendiente, 0), 2) AS saldo_actual,
    round(COALESCE((
      SELECT sum(mb.monto)
      FROM public.movimientos_bancarios mb
      WHERE mb.tenant_id = cxp.tenant_id
        AND mb.cxp_id = cxp.id
        AND upper(COALESCE(mb.tipo, '')) = 'CARGO'
    ), 0), 2) AS pagos_banco,
    round(COALESCE((
      SELECT sum(pf.monto)
      FROM public.pagos_facturas pf
      WHERE pf.tenant_id = cxp.tenant_id
        AND pf.cuenta_por_pagar_id = cxp.id
        AND upper(COALESCE(pf.estado, 'APLICADO')) <> 'ANULADO'
    ), 0), 2) AS pagos_facturas
  FROM public.cuentas_por_pagar cxp
),
diffs AS (
  SELECT
    *,
    round(GREATEST(total_doc - pagos_banco - pagos_facturas, 0), 2) AS saldo_calculado
  FROM calc
  WHERE (pagos_banco + pagos_facturas) > 0
    AND abs(saldo_actual - round(GREATEST(total_doc - pagos_banco - pagos_facturas, 0), 2)) > 0.01
),
logged AS (
  INSERT INTO public.financial_forensic_repair_log (
    repair_code,
    tenant_id,
    entity_table,
    entity_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    'CXP_SALDO_SYNC_BANK_PAYMENTS_333',
    d.tenant_id,
    'cuentas_por_pagar',
    d.id,
    jsonb_build_object('saldo_actual', d.saldo_actual, 'total_doc', d.total_doc, 'pagos_banco', d.pagos_banco, 'pagos_facturas', d.pagos_facturas),
    jsonb_build_object('saldo_calculado', d.saldo_calculado),
    'CxP tenia saldo distinto al total menos pagos bancarios vinculados'
  FROM diffs d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_forensic_repair_log l
    WHERE l.repair_code = 'CXP_SALDO_SYNC_BANK_PAYMENTS_333'
      AND l.entity_id = d.id
  )
  RETURNING entity_id
)
UPDATE public.cuentas_por_pagar cxp
SET saldo = d.saldo_calculado,
    saldo_pendiente = d.saldo_calculado,
    estado = CASE WHEN d.saldo_calculado <= 0.009 THEN 'PAGADA' ELSE cxp.estado END,
    updated_at = now()
FROM diffs d
WHERE cxp.id = d.id
  AND cxp.tenant_id = d.tenant_id;

-- Reparacion idempotente 4: CxC canceladas sin registro de cobro/nota.
WITH candidates AS (
  SELECT
    c.*,
    round(COALESCE(c.monto_total, 0), 2) AS monto_regularizacion
  FROM public.cuentas_por_cobrar c
  WHERE round(COALESCE(c.monto_pendiente, c.saldo_pendiente, c.saldo, 0), 2) <= 0.01
    AND round(COALESCE(c.monto_total, 0), 2) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.cxc_pagos p
      WHERE p.tenant_id = c.tenant_id
        AND p.cuenta_id = c.id
    )
),
logged AS (
  INSERT INTO public.financial_forensic_repair_log (
    repair_code,
    tenant_id,
    entity_table,
    entity_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    'CXC_CANCELLED_PAYMENT_BACKFILL_333',
    c.tenant_id,
    'cuentas_por_cobrar',
    c.id,
    to_jsonb(c),
    jsonb_build_object('monto', c.monto_regularizacion, 'metodo_pago', 'REGULARIZACION_FORENSE'),
    'CxC cancelada no tenia cobro/nota que explique saldo cero'
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_forensic_repair_log l
    WHERE l.repair_code = 'CXC_CANCELLED_PAYMENT_BACKFILL_333'
      AND l.entity_id = c.id
  )
  RETURNING entity_id
)
INSERT INTO public.cxc_pagos (
  tenant_id,
  cuenta_id,
  pedido_id,
  documento_id,
  monto,
  moneda,
  fecha_pago,
  metodo_pago,
  referencia,
  notas,
  tipo,
  aplica_retencion,
  retencion_monto,
  event_id,
  idempotency_key,
  source,
  estado,
  activo,
  metadata,
  created_at,
  updated_at
)
SELECT
  c.tenant_id,
  c.id,
  c.pedido_id,
  c.documento_id,
  c.monto_regularizacion,
  COALESCE(c.moneda, 'PEN'),
  COALESCE(c.fecha_emision, c.updated_at::date, CURRENT_DATE),
  'REGULARIZACION_FORENSE',
  'repair-333-' || c.id::text,
  'Backfill forense: CxC cancelada sin cobro historico',
  'PAGO',
  false,
  0,
  gen_random_uuid(),
  'cxc.repair.333:' || c.tenant_id::text || ':' || c.id::text,
  'migration.333',
  'ACTIVO',
  true,
  jsonb_build_object('repair', '333', 'reason', 'cancelled_without_payment'),
  now(),
  now()
FROM candidates c
ON CONFLICT DO NOTHING;

-- Reparacion idempotente 5: CxP parcialmente reducidas sin pago operativo vinculado.
WITH candidates AS (
  SELECT
    cxp.*,
    round(COALESCE(cxp.total, 0) - COALESCE(cxp.saldo, cxp.saldo_pendiente, 0), 2) AS monto_regularizacion
  FROM public.cuentas_por_pagar cxp
  WHERE round(COALESCE(cxp.total, 0), 2) > round(COALESCE(cxp.saldo, cxp.saldo_pendiente, 0), 2)
    AND NOT EXISTS (
      SELECT 1
      FROM public.movimientos_bancarios mb
      WHERE mb.tenant_id = cxp.tenant_id
        AND mb.cxp_id = cxp.id
        AND upper(COALESCE(mb.tipo, '')) = 'CARGO'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pagos_facturas pf
      WHERE pf.tenant_id = cxp.tenant_id
        AND pf.cuenta_por_pagar_id = cxp.id
        AND upper(COALESCE(pf.estado, 'APLICADO')) <> 'ANULADO'
    )
),
logged AS (
  INSERT INTO public.financial_forensic_repair_log (
    repair_code,
    tenant_id,
    entity_table,
    entity_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    'CXP_PAYMENT_BACKFILL_333',
    c.tenant_id,
    'cuentas_por_pagar',
    c.id,
    to_jsonb(c),
    jsonb_build_object('monto', c.monto_regularizacion, 'metodo_pago', 'REGULARIZACION_FORENSE'),
    'CxP tenia saldo reducido sin pago operativo vinculado'
  FROM candidates c
  WHERE c.monto_regularizacion > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.financial_forensic_repair_log l
      WHERE l.repair_code = 'CXP_PAYMENT_BACKFILL_333'
        AND l.entity_id = c.id
    )
  RETURNING entity_id
)
INSERT INTO public.pagos_facturas (
  tenant_id,
  cuenta_por_pagar_id,
  proveedor_id,
  documento_id,
  fecha_pago,
  monto,
  moneda,
  metodo_pago,
  referencia,
  numero_operacion,
  notas,
  event_id,
  idempotency_key,
  estado,
  aplicado_en,
  activo,
  metadata,
  created_at,
  updated_at
)
SELECT
  c.tenant_id,
  c.id,
  c.proveedor_id,
  NULL,
  COALESCE(c.fecha_emision, c.updated_at::date, CURRENT_DATE),
  c.monto_regularizacion,
  COALESCE(c.moneda, 'PEN'),
  'REGULARIZACION_FORENSE',
  'repair-333-' || c.id::text,
  'repair-333-' || c.id::text,
  'Backfill forense: CxP con saldo reducido sin pago historico',
  gen_random_uuid(),
  'cxp.repair.333:' || c.tenant_id::text || ':' || c.id::text,
  'APLICADO',
  now(),
  true,
  jsonb_build_object('repair', '333', 'reason', 'reduced_without_payment'),
  now(),
  now()
FROM candidates c
WHERE c.monto_regularizacion > 0
ON CONFLICT DO NOTHING;

-- Reencolar eventos financieros muertos para que el worker reprocese despues del hardening de cuentas.
WITH dead AS (
  SELECT id, tenant_id
  FROM public.outbox_events
  WHERE lower(COALESCE(status, '')) = 'dead_letter'
    AND event_type IN ('cxc.creada', 'cobro.registrado', 'pago.proveedor.registrado', 'MovimientoBancarioRegistrado', 'venta_pos.registrada')
),
logged AS (
  INSERT INTO public.financial_forensic_repair_log (
    repair_code,
    tenant_id,
    entity_table,
    entity_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    'OUTBOX_FINANCIAL_DEADLETTER_REQUEUE_333',
    oe.tenant_id,
    'outbox_events',
    oe.id,
    to_jsonb(oe),
    jsonb_build_object('status', 'pending', 'retry_count', 0),
    'Evento financiero en dead_letter reencolado para reproceso contable'
  FROM public.outbox_events oe
  JOIN dead d ON d.id = oe.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_forensic_repair_log l
    WHERE l.repair_code = 'OUTBOX_FINANCIAL_DEADLETTER_REQUEUE_333'
      AND l.entity_id = oe.id
  )
  RETURNING entity_id
)
UPDATE public.outbox_events oe
SET status = 'pending',
    retry_count = 0,
    next_retry_at = now(),
    processed_at = NULL,
    error_message = NULL,
    updated_at = now()
FROM dead d
WHERE oe.id = d.id;

CREATE OR REPLACE FUNCTION public.validar_tesoreria_caja_bancos_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  control text,
  severidad text,
  total bigint,
  estado text,
  detalle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH checks AS (
    SELECT
      'asientos_descuadrados'::text AS control,
      'CRITICA'::text AS severidad,
      count(*)::bigint AS total,
      'Debe ser cero'::text AS detalle
    FROM public.asientos_contables ac
    WHERE (p_tenant_id IS NULL OR ac.tenant_id = p_tenant_id)
      AND abs(round(COALESCE(ac.total_debe, 0), 2) - round(COALESCE(ac.total_haber, 0), 2)) > 0.01

    UNION ALL
    SELECT
      'asientos_source_event_id_duplicado',
      'ALTA',
      count(*)::bigint,
      'Debe ser cero'
    FROM (
      SELECT tenant_id, source_event_id
      FROM public.asientos_contables
      WHERE source_event_id IS NOT NULL
        AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      GROUP BY tenant_id, source_event_id
      HAVING count(*) > 1
    ) d

    UNION ALL
    SELECT
      'ventas_pos_sin_pago_tabla',
      'MEDIA',
      count(*)::bigint,
      'Ventas pagadas deben tener detalle de pago'
    FROM public.ventas_pos v
    WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
      AND upper(COALESCE(v.estado, '')) IN ('PAGADA', 'COMPLETADA', 'FACTURADA')
      AND NOT EXISTS (
        SELECT 1 FROM public.ventas_pos_pagos vp
        WHERE vp.tenant_id = v.tenant_id AND vp.venta_pos_id = v.id
      )

    UNION ALL
    SELECT
      'pagos_pos_efectivo_sin_movimiento_caja',
      'ALTA',
      count(*)::bigint,
      'Pago efectivo debe tener movimiento caja VENTA'
    FROM public.ventas_pos v
    JOIN public.ventas_pos_pagos vp
      ON vp.tenant_id = v.tenant_id
     AND vp.venta_pos_id = v.id
    WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
      AND upper(COALESCE(v.estado, '')) IN ('PAGADA', 'COMPLETADA', 'FACTURADA')
      AND upper(COALESCE(vp.metodo_pago_tipo, vp.metodo_pago_codigo, '')) IN ('CASH', 'EFECTIVO')
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_caja mc
        WHERE mc.tenant_id = v.tenant_id
          AND mc.sesion_caja_id = v.sesion_caja_id
          AND mc.referencia_tipo = 'venta_pos'
          AND mc.referencia_documento = v.id::text
          AND mc.tipo_movimiento = 'VENTA'
      )

    UNION ALL
    SELECT
      'cxc_saldo_distinto_total_menos_cobros',
      'ALTA',
      count(*)::bigint,
      'CxC debe cuadrar con pagos/notas'
    FROM (
      SELECT
        c.id,
        round(COALESCE(c.monto_pendiente, c.saldo_pendiente, c.saldo, 0), 2) AS saldo,
        round(GREATEST(COALESCE(c.monto_total, 0) - COALESCE(sum(p.monto), 0), 0), 2) AS saldo_calc
      FROM public.cuentas_por_cobrar c
      LEFT JOIN public.cxc_pagos p
        ON p.tenant_id = c.tenant_id AND p.cuenta_id = c.id
      WHERE p_tenant_id IS NULL OR c.tenant_id = p_tenant_id
      GROUP BY c.id, c.monto_pendiente, c.saldo_pendiente, c.saldo, c.monto_total
    ) x
    WHERE abs(x.saldo - x.saldo_calc) > 0.01

    UNION ALL
    SELECT
      'cxp_saldo_distinto_total_menos_bancos',
      'ALTA',
      count(*)::bigint,
      'CxP debe cuadrar con pagos bancarios vinculados'
    FROM (
      SELECT
        cxp.id,
        round(COALESCE(cxp.saldo, cxp.saldo_pendiente, 0), 2) AS saldo,
        round(GREATEST(
          COALESCE(cxp.total, 0)
          - COALESCE((
              SELECT sum(mb.monto)
              FROM public.movimientos_bancarios mb
              WHERE mb.tenant_id = cxp.tenant_id
                AND mb.cxp_id = cxp.id
                AND upper(COALESCE(mb.tipo, '')) = 'CARGO'
            ), 0)
          - COALESCE((
              SELECT sum(pf.monto)
              FROM public.pagos_facturas pf
              WHERE pf.tenant_id = cxp.tenant_id
                AND pf.cuenta_por_pagar_id = cxp.id
                AND upper(COALESCE(pf.estado, 'APLICADO')) <> 'ANULADO'
            ), 0),
          0
        ), 2) AS saldo_calc
      FROM public.cuentas_por_pagar cxp
      WHERE p_tenant_id IS NULL OR cxp.tenant_id = p_tenant_id
    ) x
    WHERE abs(x.saldo - x.saldo_calc) > 0.01

    UNION ALL
    SELECT
      'conciliaciones_cerradas_con_diferencia',
      'ALTA',
      count(*)::bigint,
      'Conciliacion cerrada debe tener diferencia cero'
    FROM public.conciliaciones_bancarias cb
    WHERE (p_tenant_id IS NULL OR cb.tenant_id = p_tenant_id)
      AND upper(COALESCE(cb.estado, '')) = 'CERRADA'
      AND abs(COALESCE(cb.diferencia, 0)) > 0.01

    UNION ALL
    SELECT
      'movimientos_bancarios_huerfanos_sin_origen',
      'MEDIA',
      count(*)::bigint,
      'Movimiento banco debe tener origen o metadata de manualidad'
    FROM public.movimientos_bancarios mb
    WHERE (p_tenant_id IS NULL OR mb.tenant_id = p_tenant_id)
      AND COALESCE(mb.es_extracto, false) = false
      AND mb.cxp_id IS NULL
      AND mb.cxc_id IS NULL
      AND mb.proveedor_id IS NULL
      AND mb.cliente_id IS NULL
      AND NULLIF(btrim(COALESCE(mb.referencia, '')), '') IS NULL

    UNION ALL
    SELECT
      'eventos_financieros_pendientes_o_fallidos',
      'ALTA',
      count(*)::bigint,
      'No debe haber eventos financieros failed/dead_letter'
    FROM public.outbox_events oe
    WHERE (p_tenant_id IS NULL OR oe.tenant_id = p_tenant_id)
      AND oe.event_type IN ('cxc.creada', 'cobro.registrado', 'pago.proveedor.registrado', 'MovimientoBancarioRegistrado', 'venta_pos.registrada')
      AND lower(COALESCE(oe.status, '')) IN ('failed', 'dead_letter')

    UNION ALL
    SELECT
      'pagos_bancarizables_sin_evidencia',
      'ALTA',
      count(*)::bigint,
      'Bancarizacion requiere medio y referencia'
    FROM public.cuentas_por_pagar cxp
    WHERE (p_tenant_id IS NULL OR cxp.tenant_id = p_tenant_id)
      AND COALESCE(cxp.bancarizacion_requerida, false) = true
      AND (
        COALESCE(cxp.bancarizacion_validada, false) = false
        OR NULLIF(btrim(COALESCE(cxp.bancarizacion_medio_pago, '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(cxp.bancarizacion_referencia, '')), '') IS NULL
      )

    UNION ALL
    SELECT
      'ventas_pos_credito_cxc_pendiente',
      'ALTA',
      count(*)::bigint,
      'Venta POS a credito no debe quedar sin CxC'
    FROM public.ventas_pos v
    WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
      AND COALESCE(v.cxc_pendiente, false) = true
  )
  SELECT
    checks.control,
    checks.severidad,
    checks.total,
    CASE WHEN checks.total = 0 THEN 'OK' ELSE 'FAIL' END AS estado,
    checks.detalle
  FROM checks
  ORDER BY
    CASE checks.severidad
      WHEN 'CRITICA' THEN 1
      WHEN 'ALTA' THEN 2
      WHEN 'MEDIA' THEN 3
      ELSE 4
    END,
    checks.control;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) TO authenticated;

COMMIT;
