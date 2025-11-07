-- Script de Verificación: RLS en rls_audit_log
-- Ejecutar DESPUÉS de aplicar migración 080

DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
  v_insert_policy BOOLEAN;
  v_select_policy BOOLEAN;
  v_update_policy BOOLEAN;
  v_delete_policy BOOLEAN;
  v_test_passed BOOLEAN := true;
BEGIN
  -- TEST 1: RLS habilitado
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'rls_audit_log'
    AND relnamespace = 'public'::regnamespace;

  IF NOT v_rls_enabled THEN
    RAISE WARNING 'FAIL: RLS NO está habilitado';
    v_test_passed := false;
  END IF;

  -- TEST 2: Cantidad de políticas
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'rls_audit_log';

  IF v_policy_count < 4 THEN
    RAISE WARNING 'FAIL: Solo % políticas (esperado: 4)', v_policy_count;
    v_test_passed := false;
  END IF;

  -- TEST 3: Políticas específicas
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rls_audit_log'
      AND policyname = 'rls_audit_log_insert_unrestricted'
  ) INTO v_insert_policy;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rls_audit_log'
      AND policyname = 'rls_audit_log_select_service_role'
  ) INTO v_select_policy;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rls_audit_log'
      AND policyname = 'rls_audit_log_no_update'
  ) INTO v_update_policy;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rls_audit_log'
      AND policyname = 'rls_audit_log_delete_service_role'
  ) INTO v_delete_policy;

  IF NOT (v_insert_policy AND v_select_policy AND v_update_policy AND v_delete_policy) THEN
    RAISE WARNING 'FAIL: Faltan políticas. INSERT:% SELECT:% UPDATE:% DELETE:%', 
      v_insert_policy, v_select_policy, v_update_policy, v_delete_policy;
    v_test_passed := false;
  END IF;

  -- TEST 4: Permisos revocados
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_name = 'rls_audit_log'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE WARNING 'FAIL: Existen permisos directos en la tabla';
    v_test_passed := false;
  END IF;

  -- TEST 5: Función de limpieza
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_old_rls_audit_logs'
      AND p.prosecdef = true
  ) THEN
    RAISE WARNING 'FAIL: Función cleanup sin SECURITY DEFINER';
    v_test_passed := false;
  END IF;

  -- Resultado
  IF NOT v_test_passed THEN
    RAISE WARNING 'Verificación completada con errores';
  END IF;

END $$;
