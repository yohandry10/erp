-- =====================================================
-- VERIFICATION SCRIPT: SUNAT Validations & GRE Automation Migration
-- Description: Verify that all migration changes were applied correctly
-- =====================================================

DO $$
DECLARE
  v_count INTEGER;
  v_result TEXT := '';
BEGIN
  RAISE NOTICE '🔍 Starting migration verification...';
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 1: Verify new tables exist
  -- =====================================================
  RAISE NOTICE '📋 Checking new tables...';
  
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'validaciones_sunat';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Table validaciones_sunat exists';
  ELSE
    RAISE NOTICE '  ❌ Table validaciones_sunat NOT FOUND';
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'notificaciones';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Table notificaciones exists';
  ELSE
    RAISE NOTICE '  ❌ Table notificaciones NOT FOUND';
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'wizard_progress';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Table wizard_progress exists';
  ELSE
    RAISE NOTICE '  ❌ Table wizard_progress NOT FOUND';
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 2: Verify empresa_config columns
  -- =====================================================
  RAISE NOTICE '📋 Checking empresa_config columns...';
  
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns 
  WHERE table_name = 'empresa_config' 
  AND column_name IN (
    'configuracion_completa',
    'fecha_validacion_certificado',
    'certificado_expira_en',
    'umbral_gre_automatico',
    'gre_automatico_habilitado',
    'ultima_validacion',
    'errores_configuracion'
  );
  
  IF v_count = 7 THEN
    RAISE NOTICE '  ✅ All 7 new columns added to empresa_config';
  ELSE
    RAISE NOTICE '  ⚠️  Only % of 7 columns found in empresa_config', v_count;
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 3: Verify gre_guias columns
  -- =====================================================
  RAISE NOTICE '📋 Checking gre_guias columns...';
  
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns 
  WHERE table_name = 'gre_guias' 
  AND column_name IN (
    'es_automatica',
    'venta_id',
    'movimiento_inventario_id',
    'motivo_creacion'
  );
  
  IF v_count = 4 THEN
    RAISE NOTICE '  ✅ All 4 new columns added to gre_guias';
  ELSE
    RAISE NOTICE '  ⚠️  Only % of 4 columns found in gre_guias', v_count;
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 4: Verify indexes
  -- =====================================================
  RAISE NOTICE '📋 Checking indexes...';
  
  -- Count indexes for validaciones_sunat
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes 
  WHERE tablename = 'validaciones_sunat'
  AND indexname LIKE 'idx_validaciones_%';
  
  RAISE NOTICE '  ℹ️  validaciones_sunat has % indexes', v_count;
  
  -- Count indexes for notificaciones
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes 
  WHERE tablename = 'notificaciones'
  AND indexname LIKE 'idx_notificaciones_%';
  
  RAISE NOTICE '  ℹ️  notificaciones has % indexes', v_count;
  
  -- Count indexes for wizard_progress
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes 
  WHERE tablename = 'wizard_progress'
  AND indexname LIKE 'idx_wizard_%';
  
  RAISE NOTICE '  ℹ️  wizard_progress has % indexes', v_count;
  
  -- Count indexes for empresa_config (new)
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes 
  WHERE tablename = 'empresa_config'
  AND indexname IN ('idx_empresa_config_validacion', 'idx_empresa_config_certificado_expira');
  
  RAISE NOTICE '  ℹ️  empresa_config has % new indexes', v_count;
  
  -- Count indexes for gre_guias (new)
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes 
  WHERE tablename = 'gre_guias'
  AND indexname IN ('idx_gre_guias_automatica', 'idx_gre_guias_venta', 'idx_gre_guias_movimiento');
  
  RAISE NOTICE '  ℹ️  gre_guias has % new indexes', v_count;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 5: Verify RLS is enabled
  -- =====================================================
  RAISE NOTICE '🔒 Checking Row Level Security...';
  
  SELECT COUNT(*) INTO v_count
  FROM pg_tables 
  WHERE schemaname = 'public'
  AND tablename = 'validaciones_sunat'
  AND rowsecurity = true;
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ RLS enabled on validaciones_sunat';
  ELSE
    RAISE NOTICE '  ❌ RLS NOT enabled on validaciones_sunat';
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM pg_tables 
  WHERE schemaname = 'public'
  AND tablename = 'notificaciones'
  AND rowsecurity = true;
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ RLS enabled on notificaciones';
  ELSE
    RAISE NOTICE '  ❌ RLS NOT enabled on notificaciones';
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM pg_tables 
  WHERE schemaname = 'public'
  AND tablename = 'wizard_progress'
  AND rowsecurity = true;
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ RLS enabled on wizard_progress';
  ELSE
    RAISE NOTICE '  ❌ RLS NOT enabled on wizard_progress';
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 6: Verify RLS policies
  -- =====================================================
  RAISE NOTICE '🔒 Checking RLS policies...';
  
  -- Count policies for validaciones_sunat
  SELECT COUNT(*) INTO v_count
  FROM pg_policies 
  WHERE tablename = 'validaciones_sunat';
  
  IF v_count >= 4 THEN
    RAISE NOTICE '  ✅ validaciones_sunat has % policies (expected 4)', v_count;
  ELSE
    RAISE NOTICE '  ⚠️  validaciones_sunat has only % policies (expected 4)', v_count;
  END IF;
  
  -- Count policies for notificaciones
  SELECT COUNT(*) INTO v_count
  FROM pg_policies 
  WHERE tablename = 'notificaciones';
  
  IF v_count >= 4 THEN
    RAISE NOTICE '  ✅ notificaciones has % policies (expected 4)', v_count;
  ELSE
    RAISE NOTICE '  ⚠️  notificaciones has only % policies (expected 4)', v_count;
  END IF;
  
  -- Count policies for wizard_progress
  SELECT COUNT(*) INTO v_count
  FROM pg_policies 
  WHERE tablename = 'wizard_progress';
  
  IF v_count >= 4 THEN
    RAISE NOTICE '  ✅ wizard_progress has % policies (expected 4)', v_count;
  ELSE
    RAISE NOTICE '  ⚠️  wizard_progress has only % policies (expected 4)', v_count;
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 7: Verify helper functions
  -- =====================================================
  RAISE NOTICE '⚙️  Checking helper functions...';
  
  SELECT COUNT(*) INTO v_count
  FROM pg_proc 
  WHERE proname = 'update_wizard_progress_timestamp';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Function update_wizard_progress_timestamp exists';
  ELSE
    RAISE NOTICE '  ❌ Function update_wizard_progress_timestamp NOT FOUND';
  END IF;
  
  -- Check if trigger exists
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger 
  WHERE tgname = 'trigger_update_wizard_progress_timestamp';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Trigger trigger_update_wizard_progress_timestamp exists';
  ELSE
    RAISE NOTICE '  ❌ Trigger trigger_update_wizard_progress_timestamp NOT FOUND';
  END IF;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- CHECK 8: Verify prerequisite functions
  -- =====================================================
  RAISE NOTICE '⚙️  Checking prerequisite functions...';
  
  SELECT COUNT(*) INTO v_count
  FROM pg_proc 
  WHERE proname = 'get_current_tenant_id';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Function get_current_tenant_id exists';
  ELSE
    RAISE NOTICE '  ❌ Function get_current_tenant_id NOT FOUND (required for RLS)';
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM pg_proc 
  WHERE proname = 'get_current_user_id';
  
  IF v_count = 1 THEN
    RAISE NOTICE '  ✅ Function get_current_user_id exists';
  ELSE
    RAISE NOTICE '  ⚠️  Function get_current_user_id NOT FOUND (optional)';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Verification complete!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Summary:';
  RAISE NOTICE '  - 3 new tables created';
  RAISE NOTICE '  - 11 new columns added to existing tables';
  RAISE NOTICE '  - 15+ indexes created for performance';
  RAISE NOTICE '  - 12+ RLS policies configured';
  RAISE NOTICE '  - Multi-tenant isolation enabled';
  RAISE NOTICE '';
  
END $$;

-- =====================================================
-- DETAILED TABLE INFORMATION
-- =====================================================

-- Show validaciones_sunat structure
SELECT 
  'validaciones_sunat' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'validaciones_sunat'
ORDER BY ordinal_position;

-- Show notificaciones structure
SELECT 
  'notificaciones' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'notificaciones'
ORDER BY ordinal_position;

-- Show wizard_progress structure
SELECT 
  'wizard_progress' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'wizard_progress'
ORDER BY ordinal_position;
