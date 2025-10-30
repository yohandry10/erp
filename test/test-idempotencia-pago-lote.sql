-- Test script for batch payment idempotency at database level
-- This script tests the procesar_pago_lote function with duplicate requests

-- Setup: Create test data
DO $$
DECLARE
  v_tenant_id UUID := 'd4b8e19c-5c91-4d5e-8f3a-2e1b3c4d5e6f';
  v_proveedor_id UUID;
  v_cuenta_bancaria_id UUID;
  v_cxp1_id UUID;
  v_cxp2_id UUID;
  v_cxp3_id UUID;
  v_lote_referencia TEXT := 'LOTE-TEST-IDEMP-' || extract(epoch from now())::text;
  v_resultado1 JSONB;
  v_resultado2 JSONB;
  v_pagos JSONB;
BEGIN
  RAISE NOTICE '=== TEST: Idempotencia de Pago en Lote ===';
  RAISE NOTICE '';

  -- 1. Get or create proveedor
  SELECT id INTO v_proveedor_id
  FROM proveedores
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  IF v_proveedor_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún proveedor para el tenant';
  END IF;

  RAISE NOTICE '1. Proveedor obtenido: %', v_proveedor_id;

  -- 2. Get or create cuenta bancaria
  SELECT id INTO v_cuenta_bancaria_id
  FROM cuentas_bancarias
  WHERE tenant_id = v_tenant_id
    AND activa = true
    AND moneda = 'PEN'
  LIMIT 1;

  IF v_cuenta_bancaria_id IS NULL THEN
    -- Create test cuenta bancaria
    INSERT INTO cuentas_bancarias (
      tenant_id, nombre, banco, numero_cuenta, moneda, saldo, activa, permite_sobregiro
    ) VALUES (
      v_tenant_id, 'Cuenta Test Idempotencia', 'BCP', '19100000000001', 'PEN', 50000.00, true, false
    )
    RETURNING id INTO v_cuenta_bancaria_id;
    
    RAISE NOTICE '2. Cuenta bancaria creada: %', v_cuenta_bancaria_id;
  ELSE
    -- Update saldo to ensure we have enough
    UPDATE cuentas_bancarias
    SET saldo = 50000.00
    WHERE id = v_cuenta_bancaria_id;
    
    RAISE NOTICE '2. Cuenta bancaria obtenida: %', v_cuenta_bancaria_id;
  END IF;

  -- 3. Create test CxP records
  INSERT INTO cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, fecha_emision, fecha_vencimiento,
    total, saldo, moneda, estado, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, v_proveedor_id, 'TEST-IDEMP-1-' || extract(epoch from now())::text,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    1000.00, 1000.00, 'PEN', 'PENDIENTE', '30 días', 30
  )
  RETURNING id INTO v_cxp1_id;

  INSERT INTO cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, fecha_emision, fecha_vencimiento,
    total, saldo, moneda, estado, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, v_proveedor_id, 'TEST-IDEMP-2-' || extract(epoch from now())::text,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    2000.00, 2000.00, 'PEN', 'PENDIENTE', '30 días', 30
  )
  RETURNING id INTO v_cxp2_id;

  INSERT INTO cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, fecha_emision, fecha_vencimiento,
    total, saldo, moneda, estado, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, v_proveedor_id, 'TEST-IDEMP-3-' || extract(epoch from now())::text,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    3000.00, 3000.00, 'PEN', 'PENDIENTE', '30 días', 30
  )
  RETURNING id INTO v_cxp3_id;

  RAISE NOTICE '3. CxP creadas: %, %, %', v_cxp1_id, v_cxp2_id, v_cxp3_id;

  -- 4. Prepare pagos array
  v_pagos := jsonb_build_array(
    jsonb_build_object('cxp_id', v_cxp1_id, 'monto', 1000.00),
    jsonb_build_object('cxp_id', v_cxp2_id, 'monto', 2000.00),
    jsonb_build_object('cxp_id', v_cxp3_id, 'monto', 3000.00)
  );

  RAISE NOTICE '4. Lote referencia: %', v_lote_referencia;
  RAISE NOTICE '';

  -- 5. First batch payment request
  RAISE NOTICE '5. Procesando PRIMER lote de pagos...';
  v_resultado1 := procesar_pago_lote(
    p_tenant_id := v_tenant_id,
    p_cuenta_bancaria_id := v_cuenta_bancaria_id,
    p_fecha_pago := CURRENT_DATE,
    p_metodo_pago := 'TRANSFERENCIA',
    p_referencia_lote := v_lote_referencia,
    p_observaciones := 'Test de idempotencia - Primera ejecución',
    p_pagos := v_pagos,
    p_created_by := NULL
  );

  RAISE NOTICE '   ✓ Primer lote procesado exitosamente';
  RAISE NOTICE '   Lote ID: %', v_resultado1->>'lote_id';
  RAISE NOTICE '   Monto total: %', v_resultado1->>'monto_total';
  RAISE NOTICE '   Pagos exitosos: %', v_resultado1->>'pagos_exitosos';
  RAISE NOTICE '   Idempotente: %', v_resultado1->>'idempotent';
  RAISE NOTICE '';

  -- 6. Verify CxP were updated
  RAISE NOTICE '6. Verificando CxP actualizadas...';
  DECLARE
    v_cxp RECORD;
  BEGIN
    FOR v_cxp IN 
      SELECT numero_documento, estado, saldo
      FROM cuentas_por_pagar
      WHERE id IN (v_cxp1_id, v_cxp2_id, v_cxp3_id)
      ORDER BY numero_documento
    LOOP
      RAISE NOTICE '   CxP %: Estado=%, Saldo=%', v_cxp.numero_documento, v_cxp.estado, v_cxp.saldo;
    END LOOP;
  END;
  RAISE NOTICE '';

  -- 7. Verify bank account balance
  RAISE NOTICE '7. Verificando saldo de cuenta bancaria...';
  DECLARE
    v_saldo NUMERIC;
  BEGIN
    SELECT saldo INTO v_saldo
    FROM cuentas_bancarias
    WHERE id = v_cuenta_bancaria_id;
    
    RAISE NOTICE '   Saldo actual: %', v_saldo;
    RAISE NOTICE '   Saldo esperado: 44000.00 (50000 - 6000)';
    
    IF v_saldo = 44000.00 THEN
      RAISE NOTICE '   ✓ Saldo correcto';
    ELSE
      RAISE NOTICE '   ✗ Saldo incorrecto';
    END IF;
  END;
  RAISE NOTICE '';

  -- 8. Second batch payment request (DUPLICATE - should be idempotent)
  RAISE NOTICE '8. Procesando SEGUNDO lote con la MISMA referencia (test idempotencia)...';
  RAISE NOTICE '   Referencia: %', v_lote_referencia;
  
  v_resultado2 := procesar_pago_lote(
    p_tenant_id := v_tenant_id,
    p_cuenta_bancaria_id := v_cuenta_bancaria_id,
    p_fecha_pago := CURRENT_DATE,
    p_metodo_pago := 'TRANSFERENCIA',
    p_referencia_lote := v_lote_referencia,
    p_observaciones := 'Test de idempotencia - Segunda ejecución (duplicada)',
    p_pagos := v_pagos,
    p_created_by := NULL
  );

  RAISE NOTICE '   ✓ Segundo lote procesado (idempotente)';
  RAISE NOTICE '   Lote ID: %', v_resultado2->>'lote_id';
  RAISE NOTICE '   Monto total: %', v_resultado2->>'monto_total';
  RAISE NOTICE '   Pagos exitosos: %', v_resultado2->>'pagos_exitosos';
  RAISE NOTICE '   Idempotente: %', v_resultado2->>'idempotent';
  RAISE NOTICE '';

  -- 9. Verify idempotency
  IF (v_resultado2->>'idempotent')::boolean = true THEN
    RAISE NOTICE '✓✓✓ IDEMPOTENCIA VERIFICADA ✓✓✓';
    RAISE NOTICE '   El segundo request retornó el resultado del primero sin reprocesar';
  ELSE
    RAISE NOTICE '✗✗✗ FALLO DE IDEMPOTENCIA ✗✗✗';
    RAISE NOTICE '   El segundo request procesó el lote nuevamente (no debería)';
  END IF;
  RAISE NOTICE '';

  -- 10. Compare results
  RAISE NOTICE '10. Comparando resultados...';
  
  IF v_resultado1->>'lote_id' = v_resultado2->>'lote_id' THEN
    RAISE NOTICE '   ✓ Lote ID coincide';
  ELSE
    RAISE NOTICE '   ✗ Lote ID NO coincide';
  END IF;
  
  IF v_resultado1->>'monto_total' = v_resultado2->>'monto_total' THEN
    RAISE NOTICE '   ✓ Monto total coincide';
  ELSE
    RAISE NOTICE '   ✗ Monto total NO coincide';
  END IF;
  
  IF v_resultado1->>'pagos_exitosos' = v_resultado2->>'pagos_exitosos' THEN
    RAISE NOTICE '   ✓ Pagos exitosos coincide';
  ELSE
    RAISE NOTICE '   ✗ Pagos exitosos NO coincide';
  END IF;
  RAISE NOTICE '';

  -- 11. Verify CxP were NOT updated again
  RAISE NOTICE '11. Verificando que las CxP NO fueron actualizadas nuevamente...';
  DECLARE
    v_cxp RECORD;
  BEGIN
    FOR v_cxp IN 
      SELECT numero_documento, estado, saldo
      FROM cuentas_por_pagar
      WHERE id IN (v_cxp1_id, v_cxp2_id, v_cxp3_id)
      ORDER BY numero_documento
    LOOP
      RAISE NOTICE '   CxP %: Estado=%, Saldo=%', v_cxp.numero_documento, v_cxp.estado, v_cxp.saldo;
      
      IF v_cxp.saldo = 0 THEN
        RAISE NOTICE '      ✓ Saldo correcto (0 - no se reprocesó)';
      ELSE
        RAISE NOTICE '      ✗ Saldo incorrecto (debería ser 0)';
      END IF;
    END LOOP;
  END;
  RAISE NOTICE '';

  -- 12. Verify bank account balance was NOT updated again
  RAISE NOTICE '12. Verificando que el saldo bancario NO cambió...';
  DECLARE
    v_saldo NUMERIC;
  BEGIN
    SELECT saldo INTO v_saldo
    FROM cuentas_bancarias
    WHERE id = v_cuenta_bancaria_id;
    
    RAISE NOTICE '   Saldo actual: %', v_saldo;
    RAISE NOTICE '   Saldo esperado: 44000.00 (sin cambios)';
    
    IF v_saldo = 44000.00 THEN
      RAISE NOTICE '   ✓ Saldo correcto (no se reprocesó)';
    ELSE
      RAISE NOTICE '   ✗ Saldo incorrecto (se reprocesó cuando no debía)';
    END IF;
  END;
  RAISE NOTICE '';

  -- 13. Verify pagos_lote table
  RAISE NOTICE '13. Verificando tabla pagos_lote...';
  DECLARE
    v_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pagos_lote
    WHERE tenant_id = v_tenant_id
      AND referencia_lote = v_lote_referencia;
    
    RAISE NOTICE '   Registros en pagos_lote: %', v_count;
    
    IF v_count = 1 THEN
      RAISE NOTICE '   ✓ Solo hay 1 registro (correcto)';
    ELSE
      RAISE NOTICE '   ✗ Hay % registros (debería ser 1)', v_count;
    END IF;
  END;
  RAISE NOTICE '';

  RAISE NOTICE '=== TEST COMPLETADO ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Resumen:';
  RAISE NOTICE '- Se procesó un lote de pagos con referencia única';
  RAISE NOTICE '- Se intentó procesar el mismo lote nuevamente';
  RAISE NOTICE '- El sistema debería haber detectado la duplicación y retornado el resultado original';
  RAISE NOTICE '- Las CxP y la cuenta bancaria NO deberían haberse actualizado en el segundo intento';
  RAISE NOTICE '- Solo debería haber 1 registro en la tabla pagos_lote';

END $$;

