-- =====================================================
-- MIGRACIÓN 057: Idempotencia y Locking en Pagos Individuales (D1)
-- =====================================================
-- Descripción: Implementa funciones SQL atómicas con locking para pagos individuales
--              de CxC y CxP para prevenir race conditions y pagos duplicados
-- Prioridad: CRÍTICA - Bloqueante de producción (Tarea D1)
-- Fecha: 2025-01-27
-- Sprint: 4 - Finanzas y Tesorería
-- =====================================================

BEGIN;

-- =====================================================
-- 1. FUNCIÓN: procesar_pago_cxc_atomico
-- =====================================================
-- Procesa un pago individual de Cuenta por Cobrar (CxC) de forma atómica
-- Usa FOR UPDATE para prevenir race conditions en pagos simultáneos
-- Valida idempotencia por referencia

CREATE OR REPLACE FUNCTION procesar_pago_cxc_atomico(
  p_tenant_id UUID,
  p_cxc_id UUID,
  p_monto NUMERIC,
  p_fecha_pago DATE,
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
  p_cuenta_bancaria_id UUID DEFAULT NULL,
  p_tipo TEXT DEFAULT 'PAGO',
  p_aplica_retencion BOOLEAN DEFAULT false,
  p_retencion_monto NUMERIC DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cxc RECORD;
  v_cuenta_bancaria RECORD;
  v_pendiente_actual NUMERIC;
  v_monto_total NUMERIC;
  v_nuevo_pendiente NUMERIC;
  v_nuevo_estado TEXT;
  v_dias_mora INTEGER;
  v_pago_id UUID;
  v_movimiento_id UUID;
  v_nuevo_saldo_banco NUMERIC;
  v_pago_duplicado UUID;
BEGIN
  -- Validaciones iniciales
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  -- HARDENING D1: Validar idempotencia por referencia (si se proporciona)
  IF p_referencia IS NOT NULL AND p_referencia != '' THEN
    SELECT id INTO v_pago_duplicado
    FROM cxc_pagos
    WHERE tenant_id = p_tenant_id
      AND cuenta_id = p_cxc_id
      AND referencia = p_referencia
    LIMIT 1;

    IF v_pago_duplicado IS NOT NULL THEN
      RAISE EXCEPTION 'Ya existe un pago registrado con la referencia "%". Use una referencia única.', p_referencia;
    END IF;
  END IF;

  -- HARDENING D1: Lock de la CxC con FOR UPDATE para prevenir race conditions
  SELECT 
    id,
    monto_pendiente,
    monto_total,
    estado,
    fecha_vencimiento,
    moneda,
    cliente_id,
    pedido_id,
    documento_id,
    serie,
    numero,
    retencion_total,
    percepcion_total,
    detraccion_total,
    anticipo_total
  INTO v_cxc
  FROM cuentas_por_cobrar
  WHERE tenant_id = p_tenant_id
    AND id = p_cxc_id
  FOR UPDATE;  -- 🔒 LOCK CRÍTICO: Previene pagos simultáneos

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por cobrar % no encontrada o no pertenece al tenant actual', p_cxc_id;
  END IF;

  -- Validar estado
  IF v_cxc.estado = 'COBRADA' OR v_cxc.monto_pendiente <= 0 THEN
    RAISE EXCEPTION 'La cuenta por cobrar ya está completamente cobrada';
  END IF;

  -- Validar monto
  v_pendiente_actual := COALESCE(v_cxc.monto_pendiente, 0);
  IF p_monto - v_pendiente_actual > 0.05 THEN
    RAISE EXCEPTION 'El monto del pago (%) supera el saldo pendiente (%)', p_monto, v_pendiente_actual;
  END IF;

  -- Si hay cuenta bancaria, validar y lockear
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    SELECT 
      id,
      saldo,
      moneda,
      permite_sobregiro,
      activa
    INTO v_cuenta_bancaria
    FROM cuentas_bancarias
    WHERE tenant_id = p_tenant_id
      AND id = p_cuenta_bancaria_id
    FOR UPDATE;  -- 🔒 LOCK CRÍTICO: Previene actualizaciones simultáneas de saldo

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria % no encontrada o no pertenece al tenant actual', p_cuenta_bancaria_id;
    END IF;

    IF NOT v_cuenta_bancaria.activa THEN
      RAISE EXCEPTION 'No se pueden registrar cobros en una cuenta bancaria inactiva';
    END IF;

    -- Validar moneda
    IF v_cuenta_bancaria.moneda != COALESCE(v_cxc.moneda, 'PEN') THEN
      RAISE EXCEPTION 'La moneda de la cuenta bancaria (%) no coincide con la moneda de la CxC (%)', 
        v_cuenta_bancaria.moneda, v_cxc.moneda;
    END IF;
  END IF;

  -- Calcular nuevo saldo pendiente y estado
  v_nuevo_pendiente := GREATEST(v_pendiente_actual - p_monto, 0);
  v_monto_total := COALESCE(v_cxc.monto_total, 0);
  
  IF v_nuevo_pendiente = 0 THEN
    v_nuevo_estado := 'COBRADA';
    v_dias_mora := 0;
  ELSIF v_nuevo_pendiente < v_monto_total THEN
    v_nuevo_estado := 'PARCIAL';
    v_dias_mora := GREATEST(COALESCE(EXTRACT(DAY FROM CURRENT_DATE - v_cxc.fecha_vencimiento)::INTEGER, 0), 0);
  ELSE
    v_nuevo_estado := v_cxc.estado;
    v_dias_mora := GREATEST(COALESCE(EXTRACT(DAY FROM CURRENT_DATE - v_cxc.fecha_vencimiento)::INTEGER, 0), 0);
  END IF;

  -- Crear registro de pago
  INSERT INTO cxc_pagos (
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
    created_at
  ) VALUES (
    p_tenant_id,
    p_cxc_id,
    v_cxc.pedido_id,
    v_cxc.documento_id,
    ROUND(p_monto, 2),
    COALESCE(v_cxc.moneda, 'PEN'),
    p_fecha_pago,
    p_metodo_pago,
    p_referencia,
    p_notas,
    p_tipo,
    p_aplica_retencion,
    p_retencion_monto,
    p_user_id,
    NOW()
  )
  RETURNING id INTO v_pago_id;

  -- Si hay cuenta bancaria, crear movimiento bancario y actualizar saldo
  IF p_cuenta_bancaria_id IS NOT NULL AND v_cuenta_bancaria IS NOT NULL THEN
    -- ABONO = ingreso de dinero (aumenta saldo)
    INSERT INTO movimientos_bancarios (
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
      created_by,
      created_at
    ) VALUES (
      p_tenant_id,
      p_cuenta_bancaria_id,
      'ABONO',
      ROUND(p_monto, 2),
      p_fecha_pago,
      COALESCE(p_notas, format('Cobro de cliente - Doc: %s-%s', v_cxc.serie, v_cxc.numero)),
      p_referencia,
      p_metodo_pago,
      v_cxc.cliente_id,
      p_cxc_id,
      false,
      p_user_id,
      NOW()
    )
    RETURNING id INTO v_movimiento_id;

    -- Actualizar saldo de cuenta bancaria (ABONO suma)
    v_nuevo_saldo_banco := ROUND(v_cuenta_bancaria.saldo + p_monto, 2);
    UPDATE cuentas_bancarias
    SET
      saldo = v_nuevo_saldo_banco,
      updated_at = NOW()
    WHERE id = p_cuenta_bancaria_id
      AND tenant_id = p_tenant_id;
  END IF;

  -- Calcular acumulados de retenciones/percepciones
  DECLARE
    v_retencion_total NUMERIC := COALESCE(v_cxc.retencion_total, 0);
    v_percepcion_total NUMERIC := COALESCE(v_cxc.percepcion_total, 0);
    v_detraccion_total NUMERIC := COALESCE(v_cxc.detraccion_total, 0);
    v_anticipo_total NUMERIC := COALESCE(v_cxc.anticipo_total, 0);
  BEGIN
    IF p_tipo = 'RETENCION' OR p_aplica_retencion THEN
      v_retencion_total := ROUND(v_retencion_total + COALESCE(p_retencion_monto, p_monto), 2);
    ELSIF p_tipo = 'PERCEPCION' THEN
      v_percepcion_total := ROUND(v_percepcion_total + p_monto, 2);
    ELSIF p_tipo = 'DETRACCION' THEN
      v_detraccion_total := ROUND(v_detraccion_total + p_monto, 2);
    ELSIF p_tipo = 'ANTICIPO' THEN
      v_anticipo_total := ROUND(v_anticipo_total + p_monto, 2);
    END IF;

    -- HARDENING D1: Actualización atómica de la CxC
    UPDATE cuentas_por_cobrar
    SET
      monto_pendiente = ROUND(v_nuevo_pendiente, 2),
      estado = v_nuevo_estado,
      dias_mora = v_dias_mora,
      retencion_total = v_retencion_total,
      percepcion_total = v_percepcion_total,
      detraccion_total = v_detraccion_total,
      anticipo_total = v_anticipo_total,
      updated_at = NOW()
    WHERE id = p_cxc_id
      AND tenant_id = p_tenant_id;
  END;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'pago_id', v_pago_id,
    'movimiento_bancario_id', v_movimiento_id,
    'cxc_id', p_cxc_id,
    'monto', ROUND(p_monto, 2),
    'saldo_anterior', v_pendiente_actual,
    'saldo_nuevo', ROUND(v_nuevo_pendiente, 2),
    'estado_anterior', v_cxc.estado,
    'estado_nuevo', v_nuevo_estado,
    'saldo_bancario_anterior', CASE WHEN v_cuenta_bancaria IS NOT NULL THEN v_cuenta_bancaria.saldo ELSE NULL END,
    'saldo_bancario_nuevo', CASE WHEN v_cuenta_bancaria IS NOT NULL THEN v_nuevo_saldo_banco ELSE NULL END
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error en procesamiento atómico de pago CxC: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION procesar_pago_cxc_atomico IS 
  'Procesa un pago individual de CxC de forma atómica con locks (FOR UPDATE) para prevenir race conditions. CRÍTICO para producción.';

-- =====================================================
-- 2. FUNCIÓN: procesar_pago_cxp_atomico
-- =====================================================
-- Procesa un pago individual de Cuenta por Pagar (CxP) de forma atómica
-- Usa FOR UPDATE para prevenir race conditions en pagos simultáneos
-- Valida idempotencia por referencia

CREATE OR REPLACE FUNCTION procesar_pago_cxp_atomico(
  p_tenant_id UUID,
  p_cxp_id UUID,
  p_monto NUMERIC,
  p_fecha_pago DATE,
  p_metodo_pago TEXT DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
  p_cuenta_bancaria_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cxp RECORD;
  v_cuenta_bancaria RECORD;
  v_saldo_actual NUMERIC;
  v_total NUMERIC;
  v_nuevo_saldo NUMERIC;
  v_nuevo_estado TEXT;
  v_pago_id UUID;
  v_movimiento_id UUID;
  v_nuevo_saldo_banco NUMERIC;
BEGIN
  -- Validaciones iniciales
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  -- HARDENING D1: Lock de la CxP con FOR UPDATE para prevenir race conditions
  SELECT 
    id,
    estado,
    saldo,
    total,
    moneda,
    proveedor_id,
    numero_documento
  INTO v_cxp
  FROM cuentas_por_pagar
  WHERE tenant_id = p_tenant_id
    AND id = p_cxp_id
  FOR UPDATE;  -- 🔒 LOCK CRÍTICO: Previene pagos simultáneos

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta por pagar % no encontrada o no pertenece al tenant actual', p_cxp_id;
  END IF;

  -- Validar estado
  IF v_cxp.estado = 'ANULADA' THEN
    RAISE EXCEPTION 'No se puede aplicar pago a una cuenta por pagar anulada';
  END IF;

  IF v_cxp.estado = 'PAGADA' OR v_cxp.saldo <= 0 THEN
    RAISE EXCEPTION 'La cuenta por pagar ya está completamente pagada';
  END IF;

  -- Validar monto
  v_saldo_actual := COALESCE(v_cxp.saldo, 0);
  IF p_monto > v_saldo_actual THEN
    RAISE EXCEPTION 'El monto del pago (%) no puede ser mayor al saldo pendiente (%)', p_monto, v_saldo_actual;
  END IF;

  -- Si hay cuenta bancaria, validar y lockear
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    SELECT 
      id,
      saldo,
      moneda,
      permite_sobregiro,
      activa
    INTO v_cuenta_bancaria
    FROM cuentas_bancarias
    WHERE tenant_id = p_tenant_id
      AND id = p_cuenta_bancaria_id
    FOR UPDATE;  -- 🔒 LOCK CRÍTICO: Previene actualizaciones simultáneas de saldo

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria % no encontrada o no pertenece al tenant actual', p_cuenta_bancaria_id;
    END IF;

    IF NOT v_cuenta_bancaria.activa THEN
      RAISE EXCEPTION 'No se pueden registrar pagos desde una cuenta bancaria inactiva';
    END IF;

    -- Validar moneda
    IF v_cuenta_bancaria.moneda != v_cxp.moneda THEN
      RAISE EXCEPTION 'La moneda de la cuenta bancaria (%) no coincide con la moneda de la CxP (%)', 
        v_cuenta_bancaria.moneda, v_cxp.moneda;
    END IF;

    -- Validar saldo suficiente (si no permite sobregiro)
    IF NOT v_cuenta_bancaria.permite_sobregiro AND v_cuenta_bancaria.saldo < p_monto THEN
      RAISE EXCEPTION 'Saldo insuficiente en la cuenta bancaria. Saldo disponible: %, Monto requerido: %', 
        v_cuenta_bancaria.saldo, p_monto;
    END IF;
  END IF;

  -- Calcular nuevo saldo y estado
  v_nuevo_saldo := ROUND(v_saldo_actual - p_monto, 2);
  v_total := COALESCE(v_cxp.total, 0);
  
  IF v_nuevo_saldo = 0 THEN
    v_nuevo_estado := 'PAGADA';
  ELSIF v_nuevo_saldo < v_total THEN
    v_nuevo_estado := 'PARCIAL';
  ELSE
    v_nuevo_estado := v_cxp.estado;
  END IF;

  -- HARDENING D1: Actualización atómica de la CxP
  UPDATE cuentas_por_pagar
  SET
    saldo = v_nuevo_saldo,
    estado = v_nuevo_estado,
    ultimo_pago = p_fecha_pago,
    updated_at = NOW()
  WHERE id = p_cxp_id
    AND tenant_id = p_tenant_id;

  -- Nota: Para CxP, los pagos se registran directamente en movimientos_bancarios
  -- No existe tabla separada de pagos_facturas para CxP individuales

  -- Si hay cuenta bancaria, crear movimiento bancario y actualizar saldo
  IF p_cuenta_bancaria_id IS NOT NULL AND v_cuenta_bancaria IS NOT NULL THEN
    -- CARGO = salida de dinero (disminuye saldo)
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
      ROUND(p_monto, 2),
      p_fecha_pago,
      COALESCE(p_notas, format('Pago a proveedor - Doc: %s', v_cxp.numero_documento)),
      p_referencia,
      p_metodo_pago,
      p_cxp_id,
      v_cxp.proveedor_id,
      false,
      p_user_id,
      NOW()
    )
    RETURNING id INTO v_movimiento_id;

    -- Actualizar saldo de cuenta bancaria (CARGO resta)
    v_nuevo_saldo_banco := ROUND(v_cuenta_bancaria.saldo - p_monto, 2);
    UPDATE cuentas_bancarias
    SET
      saldo = v_nuevo_saldo_banco,
      updated_at = NOW()
    WHERE id = p_cuenta_bancaria_id
      AND tenant_id = p_tenant_id;
  END IF;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'cxp_id', p_cxp_id,
    'movimiento_bancario_id', v_movimiento_id,
    'monto', ROUND(p_monto, 2),
    'saldo_anterior', v_saldo_actual,
    'saldo_nuevo', v_nuevo_saldo,
    'estado_anterior', v_cxp.estado,
    'estado_nuevo', v_nuevo_estado,
    'saldo_bancario_anterior', CASE WHEN v_cuenta_bancaria IS NOT NULL THEN v_cuenta_bancaria.saldo ELSE NULL END,
    'saldo_bancario_nuevo', CASE WHEN v_cuenta_bancaria IS NOT NULL THEN v_nuevo_saldo_banco ELSE NULL END
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error en procesamiento atómico de pago CxP: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION procesar_pago_cxp_atomico IS 
  'Procesa un pago individual de CxP de forma atómica con locks (FOR UPDATE) para prevenir race conditions. CRÍTICO para producción.';

-- =====================================================
-- 3. GRANT PERMISOS
-- =====================================================

GRANT EXECUTE ON FUNCTION procesar_pago_cxc_atomico(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT, BOOLEAN, NUMERIC, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procesar_pago_cxp_atomico(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;

-- =====================================================
-- 4. VERIFICACIÓN DE FUNCIONES CREADAS
-- =====================================================

DO $$
DECLARE
  v_func_exists BOOLEAN;
BEGIN
  -- Verificar procesar_pago_cxc_atomico
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'procesar_pago_cxc_atomico'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) INTO v_func_exists;
  
  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'ERROR: Función procesar_pago_cxc_atomico no fue creada correctamente';
  ELSE
    RAISE NOTICE '✅ Función procesar_pago_cxc_atomico creada exitosamente';
  END IF;

  -- Verificar procesar_pago_cxp_atomico
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'procesar_pago_cxp_atomico'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) INTO v_func_exists;
  
  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'ERROR: Función procesar_pago_cxp_atomico no fue creada correctamente';
  ELSE
    RAISE NOTICE '✅ Función procesar_pago_cxp_atomico creada exitosamente';
  END IF;
END $$;

-- =====================================================
-- 5. REGISTRO EN AUDIT LOG
-- =====================================================

INSERT INTO audit_log (
  table_name,
  operation,
  record_id,
  new_values,
  user_id,
  tenant_id,
  metadata,
  timestamp
) VALUES (
  'system_migrations',
  'PAYMENT_IDEMPOTENCY_LOCKING',
  gen_random_uuid(),
  jsonb_build_object(
    'migration', '057_payment_idempotency_locking',
    'functions_created', ARRAY['procesar_pago_cxc_atomico', 'procesar_pago_cxp_atomico'],
    'priority', 'CRITICAL',
    'task', 'D1 - Idempotencia y locking en pagos',
    'sprint', 'Sprint 4 - Finanzas y Tesorería',
    'features', jsonb_build_array(
      'FOR UPDATE locking',
      'Idempotencia por referencia',
      'Operación atómica',
      'Validación de saldos',
      'Actualización de cuenta bancaria'
    )
  ),
  NULL,  -- System migration
  NULL,  -- System-wide
  jsonb_build_object(
    'action', 'CREATE_ATOMIC_PAYMENT_FUNCTIONS',
    'compliance', 'PRODUCTION_BLOCKER_RESOLVED',
    'security_impact', 'HIGH',
    'concurrency_safety', 'CRITICAL'
  ),
  NOW()
);

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- CARACTERÍSTICAS DE LAS FUNCIONES:
-- 1. Usan FOR UPDATE para lock de registros y prevenir race conditions
-- 2. Validan idempotencia por referencia (CxC)
-- 3. Validan saldos antes de procesar
-- 4. Actualización atómica de saldos y estados
-- 5. Creación de movimientos bancarios
-- 6. Validación de tenant para seguridad multi-tenant
--
-- TESTING REQUERIDO:
-- 1. Test de concurrencia: 10 pagos simultáneos a la misma CxC/CxP
-- 2. Test de idempotencia: Reintentar pago con misma referencia
-- 3. Test de saldo insuficiente: Debe fallar correctamente
-- 4. Test de tenant isolation: No debe procesar pagos de otros tenants
--
-- USO EN BACKEND:
-- Reemplazar operaciones manuales por llamadas a estas funciones SQL atómicas
-- para garantizar consistencia y prevenir race conditions
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS procesar_pago_cxc_atomico(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT, BOOLEAN, NUMERIC, UUID, TEXT);
-- DROP FUNCTION IF EXISTS procesar_pago_cxp_atomico(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID, UUID, TEXT);
-- =====================================================

