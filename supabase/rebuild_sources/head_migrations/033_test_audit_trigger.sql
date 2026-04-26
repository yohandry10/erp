-- Script de Prueba para Auditoría RLS
-- Ejecutar DESPUÉS de aplicar la migración 033
-- Este script NO es una migración, es solo para testing

-- =====================================================
-- TEST 1: Verificar que la tabla de auditoría existe
-- =====================================================

DO $
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'rls_audit_log'
  ) THEN
    RAISE NOTICE '✓ TEST 1 PASSED: Tabla rls_audit_log existe';
  ELSE
    RAISE EXCEPTION '✗ TEST 1 FAILED: Tabla rls_audit_log NO existe';
  END IF;
END;
$;

-- =====================================================
-- TEST 2: Verificar que los índices fueron creados
-- =====================================================

DO $
DECLARE
  v_index_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE tablename = 'rls_audit_log'
    AND schemaname = 'public';
  
  IF v_index_count >= 7 THEN
    RAISE NOTICE '✓ TEST 2 PASSED: % índices creados en rls_audit_log', v_index_count;
  ELSE
    RAISE WARNING '✗ TEST 2 FAILED: Solo % índices encontrados (esperados: 7)', v_index_count;
  END IF;
END;
$;

-- =====================================================
-- TEST 3: Verificar que las funciones existen
-- =====================================================

DO $
BEGIN
  -- Verificar log_rls_violation
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'log_rls_violation'
  ) THEN
    RAISE NOTICE '✓ TEST 3.1 PASSED: Función log_rls_violation existe';
  ELSE
    RAISE EXCEPTION '✗ TEST 3.1 FAILED: Función log_rls_violation NO existe';
  END IF;
  
  -- Verificar audit_rls_access
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'audit_rls_access'
  ) THEN
    RAISE NOTICE '✓ TEST 3.2 PASSED: Función audit_rls_access existe';
  ELSE
    RAISE EXCEPTION '✗ TEST 3.2 FAILED: Función audit_rls_access NO existe';
  END IF;
  
  -- Verificar add_rls_audit_trigger
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'add_rls_audit_trigger'
  ) THEN
    RAISE NOTICE '✓ TEST 3.3 PASSED: Función add_rls_audit_trigger existe';
  ELSE
    RAISE EXCEPTION '✗ TEST 3.3 FAILED: Función add_rls_audit_trigger NO existe';
  END IF;
  
  -- Verificar cleanup_old_rls_audit_logs
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'cleanup_old_rls_audit_logs'
  ) THEN
    RAISE NOTICE '✓ TEST 3.4 PASSED: Función cleanup_old_rls_audit_logs existe';
  ELSE
    RAISE EXCEPTION '✗ TEST 3.4 FAILED: Función cleanup_old_rls_audit_logs NO existe';
  END IF;
  
  -- Verificar generate_rls_security_report
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'generate_rls_security_report'
  ) THEN
    RAISE NOTICE '✓ TEST 3.5 PASSED: Función generate_rls_security_report existe';
  ELSE
    RAISE EXCEPTION '✗ TEST 3.5 FAILED: Función generate_rls_security_report NO existe';
  END IF;
END;
$;

-- =====================================================
-- TEST 4: Verificar que las vistas existen
-- =====================================================

DO $
BEGIN
  -- v_rls_violations_by_table
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_rls_violations_by_table'
  ) THEN
    RAISE NOTICE '✓ TEST 4.1 PASSED: Vista v_rls_violations_by_table existe';
  ELSE
    RAISE WARNING '✗ TEST 4.1 FAILED: Vista v_rls_violations_by_table NO existe';
  END IF;
  
  -- v_rls_violations_recent
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_rls_violations_recent'
  ) THEN
    RAISE NOTICE '✓ TEST 4.2 PASSED: Vista v_rls_violations_recent existe';
  ELSE
    RAISE WARNING '✗ TEST 4.2 FAILED: Vista v_rls_violations_recent NO existe';
  END IF;
  
  -- v_rls_violations_by_user
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_rls_violations_by_user'
  ) THEN
    RAISE NOTICE '✓ TEST 4.3 PASSED: Vista v_rls_violations_by_user existe';
  ELSE
    RAISE WARNING '✗ TEST 4.3 FAILED: Vista v_rls_violations_by_user NO existe';
  END IF;
  
  -- v_rls_violations_hourly
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'v_rls_violations_hourly'
  ) THEN
    RAISE NOTICE '✓ TEST 4.4 PASSED: Vista v_rls_violations_hourly existe';
  ELSE
    RAISE WARNING '✗ TEST 4.4 FAILED: Vista v_rls_violations_hourly NO existe';
  END IF;
END;
$;

-- =====================================================
-- TEST 5: Verificar que los triggers fueron creados
-- =====================================================

DO $
DECLARE
  v_trigger_count INTEGER;
  v_expected_triggers INTEGER := 45; -- 45 tablas con RLS
BEGIN
  SELECT COUNT(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE trigger_name LIKE 'audit_rls_%'
    AND trigger_schema = 'public';
  
  IF v_trigger_count = v_expected_triggers THEN
    RAISE NOTICE '✓ TEST 5 PASSED: % triggers de auditoría creados (esperados: %)', 
      v_trigger_count, v_expected_triggers;
  ELSIF v_trigger_count > 0 THEN
    RAISE WARNING '✗ TEST 5 PARTIAL: % triggers creados (esperados: %)', 
      v_trigger_count, v_expected_triggers;
    RAISE NOTICE 'Algunas tablas pueden no existir aún';
  ELSE
    RAISE WARNING '✗ TEST 5 FAILED: No se encontraron triggers de auditoría';
  END IF;
END;
$;

-- =====================================================
-- TEST 6: Probar función log_rls_violation
-- =====================================================

DO $
DECLARE
  v_log_id UUID;
  v_record_count INTEGER;
BEGIN
  -- Registrar una violación de prueba
  SELECT log_rls_violation(
    p_table_name := 'test_table',
    p_operation := 'SELECT',
    p_attempted_tenant_id := gen_random_uuid(),
    p_violation_type := 'cross_tenant',
    p_severity := 'WARNING',
    p_metadata := '{"test": true}'::jsonb
  ) INTO v_log_id;
  
  IF v_log_id IS NOT NULL THEN
    RAISE NOTICE '✓ TEST 6.1 PASSED: Violación registrada con ID: %', v_log_id;
    
    -- Verificar que el registro existe
    SELECT COUNT(*) INTO v_record_count
    FROM rls_audit_log
    WHERE id = v_log_id;
    
    IF v_record_count = 1 THEN
      RAISE NOTICE '✓ TEST 6.2 PASSED: Registro encontrado en rls_audit_log';
      
      -- Limpiar registro de prueba
      DELETE FROM rls_audit_log WHERE id = v_log_id;
      RAISE NOTICE '✓ TEST 6.3 PASSED: Registro de prueba eliminado';
    ELSE
      RAISE WARNING '✗ TEST 6.2 FAILED: Registro no encontrado en rls_audit_log';
    END IF;
  ELSE
    RAISE EXCEPTION '✗ TEST 6.1 FAILED: No se pudo registrar violación';
  END IF;
END;
$;

-- =====================================================
-- TEST 7: Probar vistas (deben ejecutarse sin error)
-- =====================================================

DO $
DECLARE
  v_count INTEGER;
BEGIN
  -- Probar v_rls_violations_by_table
  SELECT COUNT(*) INTO v_count FROM v_rls_violations_by_table;
  RAISE NOTICE '✓ TEST 7.1 PASSED: Vista v_rls_violations_by_table ejecutada (% filas)', v_count;
  
  -- Probar v_rls_violations_recent
  SELECT COUNT(*) INTO v_count FROM v_rls_violations_recent;
  RAISE NOTICE '✓ TEST 7.2 PASSED: Vista v_rls_violations_recent ejecutada (% filas)', v_count;
  
  -- Probar v_rls_violations_by_user
  SELECT COUNT(*) INTO v_count FROM v_rls_violations_by_user;
  RAISE NOTICE '✓ TEST 7.3 PASSED: Vista v_rls_violations_by_user ejecutada (% filas)', v_count;
  
  -- Probar v_rls_violations_hourly
  SELECT COUNT(*) INTO v_count FROM v_rls_violations_hourly;
  RAISE NOTICE '✓ TEST 7.4 PASSED: Vista v_rls_violations_hourly ejecutada (% filas)', v_count;
END;
$;

-- =====================================================
-- TEST 8: Probar función generate_rls_security_report
-- =====================================================

DO $
DECLARE
  v_report RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_report IN 
    SELECT * FROM generate_rls_security_report(7)
  LOOP
    v_count := v_count + 1;
  END LOOP;
  
  IF v_count > 0 THEN
    RAISE NOTICE '✓ TEST 8 PASSED: Reporte de seguridad generado (% métricas)', v_count;
  ELSE
    RAISE WARNING '✗ TEST 8 FAILED: Reporte de seguridad vacío';
  END IF;
END;
$;

-- =====================================================
-- TEST 9: Listar triggers creados por tabla
-- =====================================================

SELECT 
  trigger_name,
  event_object_table AS tabla,
  action_timing AS timing,
  string_agg(event_manipulation, ', ') AS eventos
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_rls_%'
  AND trigger_schema = 'public'
GROUP BY trigger_name, event_object_table, action_timing
ORDER BY event_object_table
LIMIT 10;

-- =====================================================
-- RESUMEN FINAL
-- =====================================================

DO $
DECLARE
  v_table_exists BOOLEAN;
  v_function_count INTEGER;
  v_view_count INTEGER;
  v_trigger_count INTEGER;
  v_index_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESUMEN DE TESTS - AUDITORÍA RLS';
  RAISE NOTICE '========================================';
  
  -- Tabla
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rls_audit_log'
  ) INTO v_table_exists;
  RAISE NOTICE 'Tabla rls_audit_log: %', CASE WHEN v_table_exists THEN '✓' ELSE '✗' END;
  
  -- Funciones
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc
  WHERE proname IN (
    'log_rls_violation',
    'audit_rls_access',
    'add_rls_audit_trigger',
    'cleanup_old_rls_audit_logs',
    'generate_rls_security_report'
  );
  RAISE NOTICE 'Funciones creadas: % de 5', v_function_count;
  
  -- Vistas
  SELECT COUNT(*) INTO v_view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name LIKE 'v_rls_violations%';
  RAISE NOTICE 'Vistas creadas: % de 4', v_view_count;
  
  -- Triggers
  SELECT COUNT(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE trigger_name LIKE 'audit_rls_%'
    AND trigger_schema = 'public';
  RAISE NOTICE 'Triggers creados: % (esperados: 45)', v_trigger_count;
  
  -- Índices
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE tablename = 'rls_audit_log'
    AND schemaname = 'public';
  RAISE NOTICE 'Índices creados: % de 7', v_index_count;
  
  RAISE NOTICE '========================================';
  
  IF v_table_exists AND v_function_count = 5 AND v_view_count = 4 AND v_index_count >= 7 THEN
    RAISE NOTICE '✓ TODOS LOS TESTS PRINCIPALES PASARON';
    RAISE NOTICE 'Sistema de auditoría RLS instalado correctamente';
  ELSE
    RAISE WARNING '✗ ALGUNOS TESTS FALLARON - Revisar logs arriba';
  END IF;
  
  RAISE NOTICE '========================================';
END;
$;
