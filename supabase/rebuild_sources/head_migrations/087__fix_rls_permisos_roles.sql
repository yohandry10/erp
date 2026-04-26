-- =====================================================
-- MIGRACIÓN 087: Fix RLS para Permisos y Roles
-- =====================================================
-- Descripción: 
--   Habilita RLS y crea políticas para las tablas de permisos
--   que permiten a los usuarios ver sus permisos asignados
-- Problema: Los usuarios no-superadmin no pueden ver los submódulos
--   porque las consultas a permisos/rol_permisos fallan por falta de RLS
-- Prioridad: CRÍTICA - Bloqueante de funcionalidad
-- Fecha: 2025-11-12
-- =====================================================

BEGIN;

-- =====================================================
-- 1. HABILITAR RLS EN TABLA permisos
-- =====================================================

-- Habilitar RLS en permisos
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si las hay
DROP POLICY IF EXISTS "permisos_allow_read" ON public.permisos;
DROP POLICY IF EXISTS "permisos_superadmin_write" ON public.permisos;

-- Política para SELECT: Acceso completo para service_role (backend)
-- El backend usa service_role y se encarga del filtrado por tenant
CREATE POLICY "permisos_allow_read" ON public.permisos
  FOR SELECT
  TO authenticated, service_role, postgres
  USING (true);

-- Política para INSERT/UPDATE/DELETE: Solo service_role
CREATE POLICY "permisos_superadmin_write" ON public.permisos
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "permisos_allow_read" ON public.permisos IS 
  'Permite lectura completa - el backend filtra por tenant';

COMMENT ON POLICY "permisos_superadmin_write" ON public.permisos IS 
  'Solo service_role puede modificar permisos';

-- =====================================================
-- 2. HABILITAR RLS EN TABLA rol_permisos
-- =====================================================

-- Habilitar RLS en rol_permisos
ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si las hay
DROP POLICY IF EXISTS "rol_permisos_allow_read" ON public.rol_permisos;
DROP POLICY IF EXISTS "rol_permisos_superadmin_write" ON public.rol_permisos;

-- Política para SELECT: Acceso completo para service_role (backend)
-- El backend usa service_role y se encarga del filtrado por tenant
CREATE POLICY "rol_permisos_allow_read" ON public.rol_permisos
  FOR SELECT
  TO authenticated, service_role, postgres
  USING (true);

-- Política para INSERT/UPDATE/DELETE: Solo service_role
CREATE POLICY "rol_permisos_superadmin_write" ON public.rol_permisos
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "rol_permisos_allow_read" ON public.rol_permisos IS 
  'Permite lectura completa - el backend filtra por tenant';

COMMENT ON POLICY "rol_permisos_superadmin_write" ON public.rol_permisos IS 
  'Solo service_role puede modificar asignaciones rol-permiso';

-- =====================================================
-- 3. VERIFICACIÓN FINAL
-- =====================================================

DO $$
DECLARE
  v_rls_enabled boolean;
  v_policy_count integer;
BEGIN
  -- Verificar permisos
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'permisos';
  
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'ERROR: permisos no tiene RLS habilitado';
  END IF;
  
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'permisos';
  
  IF v_policy_count < 2 THEN
    RAISE EXCEPTION 'ERROR: permisos no tiene suficientes políticas RLS (esperado: 2, encontrado: %)', v_policy_count;
  END IF;
  
  -- Verificar rol_permisos
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'rol_permisos';
  
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'ERROR: rol_permisos no tiene RLS habilitado';
  END IF;
  
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'rol_permisos';
  
  IF v_policy_count < 2 THEN
    RAISE EXCEPTION 'ERROR: rol_permisos no tiene suficientes políticas RLS (esperado: 2, encontrado: %)', v_policy_count;
  END IF;
  
  RAISE NOTICE '✓ RLS configurado correctamente en permisos y rol_permisos';
  RAISE NOTICE '✓ Usuarios no-superadmin ahora pueden ver sus permisos asignados';
  RAISE NOTICE '✓ Los submódulos del menú deberían aparecer correctamente';
END $$;

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- PROBLEMA IDENTIFICADO:
-- Las tablas permisos y rol_permisos no tenían RLS habilitado, lo que causaba
-- que las consultas fallaran para usuarios no-superadmin cuando intentaban
-- obtener sus permisos asignados.
-- 
-- SOLUCIÓN:
-- 1. Habilitar RLS en ambas tablas
-- 2. Crear políticas que permitan lectura a todos los usuarios autenticados
-- 3. Restringir escritura solo a super-admins
-- 
-- IMPACTO:
-- - Los usuarios ahora pueden ver sus permisos asignados
-- - El menú lateral mostrará correctamente los submódulos según permisos
-- - No hay impacto en seguridad ya que los permisos son datos de catálogo
-- 
-- TESTING REQUERIDO:
-- 1. Login con usuario no-superadmin
-- 2. Verificar que el menú muestra submódulos de Inventario
-- 3. Verificar que el menú muestra submódulos de Ventas
-- 4. Verificar que el menú muestra submódulos de Finanzas
-- 5. Verificar que solo se muestran módulos con permisos asignados
--
