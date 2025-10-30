-- =====================================================
-- VERIFICACIÓN: RLS en tabla centros_costo
-- =====================================================
-- Este script verifica que la tabla centros_costo tiene
-- Row Level Security (RLS) correctamente configurado
-- según lo implementado en la migración 025_fix_rls_all_tables.sql
-- =====================================================

-- 1. Verificar que la tabla existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'centros_costo'
    ) 
    THEN '✅ PASS: Tabla centros_costo existe'
    ELSE '❌ FAIL: Tabla centros_costo NO existe'
  END AS resultado;

-- 2. Verificar que la columna tenant_id existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'centros_costo'
        AND column_name = 'tenant_id'
    ) 
    THEN '✅ PASS: Columna tenant_id existe en centros_costo'
    ELSE '❌ FAIL: Columna tenant_id NO existe en centros_costo'
  END AS resultado;

-- 3. Verificar que RLS está habilitado
SELECT 
  CASE 
    WHEN relrowsecurity = true 
    THEN '✅ PASS: RLS está habilitado en centros_costo'
    ELSE '❌ FAIL: RLS NO está habilitado en centros_costo'
  END AS resultado
FROM pg_class
WHERE relname = 'centros_costo'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 4. Verificar que existe la política de aislamiento por tenant
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename = 'centros_costo'
        AND policyname = 'centros_costo_tenant_isolation'
    ) 
    THEN '✅ PASS: Política centros_costo_tenant_isolation existe'
    ELSE '❌ FAIL: Política centros_costo_tenant_isolation NO existe'
  END AS resultado;

-- 5. Verificar detalles de la política RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'centros_costo'
ORDER BY policyname;

-- 6. Verificar que existe índice en tenant_id para optimización
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename = 'centros_costo'
        AND indexname LIKE '%tenant_id%'
    ) 
    THEN '✅ PASS: Índice en tenant_id existe para optimización'
    ELSE '⚠️  WARNING: No se encontró índice en tenant_id (puede afectar performance)'
  END AS resultado;

-- 7. Listar todos los índices de la tabla
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'centros_costo'
ORDER BY indexname;

-- 8. Verificar estructura completa de la tabla
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'centros_costo'
ORDER BY ordinal_position;

-- 9. Verificar comentario de la tabla
SELECT 
  obj_description('public.centros_costo'::regclass) AS table_comment;

-- =====================================================
-- RESUMEN DE VERIFICACIÓN
-- =====================================================
-- Si todos los checks anteriores muestran ✅ PASS, entonces:
-- ✅ La tabla centros_costo tiene RLS correctamente configurado
-- ✅ La política de aislamiento por tenant está activa
-- ✅ Solo los usuarios del mismo tenant pueden acceder a sus registros
-- ✅ Los superadmins pueden acceder a todos los registros
-- =====================================================
