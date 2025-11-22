-- =====================================================
-- MIGRACIÓN 088: Fix RLS Permisos - Solución Simple
-- =====================================================
-- Descripción: 
--   Simplifica las políticas RLS para permisos y rol_permisos
--   permitiendo acceso a través de service_role sin restricciones
-- Problema: Las políticas anteriores usan app.current_user_id() que
--   puede no estar disponible en el contexto del backend
-- Prioridad: CRÍTICA - Bloqueante de funcionalidad
-- Fecha: 2025-11-12
-- =====================================================

BEGIN;

-- =====================================================
-- 1. RECREAR POLÍTICAS PARA permisos
-- =====================================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "permisos_allow_read" ON public.permisos;
DROP POLICY IF EXISTS "permisos_superadmin_write" ON public.permisos;

-- Política para SELECT: Permitir a service_role (backend) y usuarios autenticados
-- El backend se encarga de filtrar por tenant_id
CREATE POLICY "permisos_service_role_read" ON public.permisos
  FOR SELECT
  TO service_role, postgres
  USING (true);

-- Política para usuarios autenticados: solo permisos de su tenant
CREATE POLICY "permisos_authenticated_read" ON public.permisos
  FOR SELECT
  TO authenticated
  USING (
    -- Permitir si es del mismo tenant que el usuario
    EXISTS (
      SELECT 1 
      FROM usuarios_sistema u
      WHERE u.id = auth.uid()
        AND u.tenant_id = permisos.tenant_id
    )
  );

-- Política para INSERT/UPDATE/DELETE: Solo service_role
CREATE POLICY "permisos_service_role_write" ON public.permisos
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "permisos_service_role_read" ON public.permisos IS 
  'Permite lectura completa a service_role (backend)';

COMMENT ON POLICY "permisos_authenticated_read" ON public.permisos IS 
  'Permite lectura de permisos del mismo tenant al usuario autenticado';

COMMENT ON POLICY "permisos_service_role_write" ON public.permisos IS 
  'Solo service_role puede modificar permisos';

-- =====================================================
-- 2. RECREAR POLÍTICAS PARA rol_permisos
-- =====================================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "rol_permisos_allow_read" ON public.rol_permisos;
DROP POLICY IF EXISTS "rol_permisos_superadmin_write" ON public.rol_permisos;

-- Política para SELECT: Permitir a service_role (backend)
CREATE POLICY "rol_permisos_service_role_read" ON public.rol_permisos
  FOR SELECT
  TO service_role, postgres
  USING (true);

-- Política para usuarios autenticados: solo asignaciones de roles de su tenant
CREATE POLICY "rol_permisos_authenticated_read" ON public.rol_permisos
  FOR SELECT
  TO authenticated
  USING (
    -- Permitir si el rol pertenece al mismo tenant que el usuario
    EXISTS (
      SELECT 1 
      FROM usuarios_sistema u
      INNER JOIN roles r ON r.tenant_id = u.tenant_id
      WHERE u.id = auth.uid()
        AND r.id = rol_permisos.role_id
    )
  );

-- Política para INSERT/UPDATE/DELETE: Solo service_role
CREATE POLICY "rol_permisos_service_role_write" ON public.rol_permisos
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "rol_permisos_service_role_read" ON public.rol_permisos IS 
  'Permite lectura completa a service_role (backend)';

COMMENT ON POLICY "rol_permisos_authenticated_read" ON public.rol_permisos IS 
  'Permite lectura de asignaciones de roles del mismo tenant al usuario autenticado';

COMMENT ON POLICY "rol_permisos_service_role_write" ON public.rol_permisos IS 
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
  
  IF v_policy_count < 3 THEN
    RAISE EXCEPTION 'ERROR: permisos no tiene suficientes políticas RLS (esperado: 3, encontrado: %)', v_policy_count;
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
  
  IF v_policy_count < 3 THEN
    RAISE EXCEPTION 'ERROR: rol_permisos no tiene suficientes políticas RLS (esperado: 3, encontrado: %)', v_policy_count;
  END IF;
  
  RAISE NOTICE '✓ RLS configurado correctamente en permisos y rol_permisos';
  RAISE NOTICE '✓ Service role tiene acceso completo';
  RAISE NOTICE '✓ Usuarios autenticados tienen acceso filtrado por tenant';
END $$;

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- CAMBIO DE ESTRATEGIA:
-- En lugar de usar app.current_user_id() que puede no estar disponible,
-- usamos auth.uid() que es la función nativa de Supabase para obtener
-- el ID del usuario autenticado.
-- 
-- El backend usa service_role que tiene acceso completo y se encarga
-- de filtrar por tenant_id en las queries.
-- 
-- Los usuarios autenticados (si acceden directamente desde el cliente)
-- solo pueden ver permisos de su propio tenant.
--
