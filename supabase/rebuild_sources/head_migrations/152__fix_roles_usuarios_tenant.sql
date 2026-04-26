-- =====================================================
-- MIGRACIÓN 152: Fix Roles y Usuarios del Tenant
-- =====================================================
-- Descripción: 
--   1. Ejecuta seed de roles para todos los tenants existentes
--   2. Asigna rol ADMIN al usuario admin de cada tenant
--   3. Crea permisos faltantes
-- Fecha: 2025-11-29
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 1: Crear roles para todos los tenants existentes
-- =====================================================
DO $$
DECLARE
  v_tenant RECORD;
  v_count INTEGER;
BEGIN
  RAISE NOTICE '=== INICIANDO SEED DE ROLES PARA TENANTS EXISTENTES ===';
  
  FOR v_tenant IN 
    SELECT DISTINCT tenant_id 
    FROM empresa_config 
    WHERE tenant_id IS NOT NULL
  LOOP
    RAISE NOTICE 'Procesando tenant: %', v_tenant.tenant_id;
    
    -- Crear permisos si no existen
    BEGIN
      PERFORM seed_permisos_tenant(v_tenant.tenant_id);
      RAISE NOTICE '  ✓ Permisos creados/verificados';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  ⚠ Error en permisos: %', SQLERRM;
    END;
    
    -- Crear roles si no existen
    BEGIN
      PERFORM seed_roles_tenant(v_tenant.tenant_id);
      RAISE NOTICE '  ✓ Roles creados/verificados';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  ⚠ Error en roles: %', SQLERRM;
    END;
    
    -- Asignar permisos a roles
    BEGIN
      PERFORM seed_rol_permisos_tenant(v_tenant.tenant_id);
      RAISE NOTICE '  ✓ Permisos asignados a roles';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  ⚠ Error en asignación: %', SQLERRM;
    END;
    
  END LOOP;
  
  RAISE NOTICE '=== SEED DE ROLES COMPLETADO ===';
END $$;

-- =====================================================
-- PASO 2: Asignar rol ADMIN a usuarios admin sin rol
-- =====================================================
DO $$
DECLARE
  v_usuario RECORD;
  v_admin_role_id UUID;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== ASIGNANDO ROL ADMIN A USUARIOS SIN ROL ===';
  
  -- Buscar usuarios que no tienen ningún rol asignado
  FOR v_usuario IN 
    SELECT u.id, u.tenant_id, u.nombre, u.email
    FROM usuarios_sistema u
    WHERE u.estado = 'ACTIVO'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.usuario_sistema_id = u.id
      )
  LOOP
    -- Obtener el rol ADMIN del tenant
    SELECT id INTO v_admin_role_id 
    FROM roles 
    WHERE tenant_id = v_usuario.tenant_id 
      AND nombre = 'ADMIN'
    LIMIT 1;
    
    IF v_admin_role_id IS NOT NULL THEN
      -- Asignar rol ADMIN al usuario
      INSERT INTO user_roles (usuario_sistema_id, role_id, created_at)
      VALUES (v_usuario.id, v_admin_role_id, NOW())
      ON CONFLICT DO NOTHING;
      
      v_count := v_count + 1;
      RAISE NOTICE '  ✓ Rol ADMIN asignado a: % (%)', v_usuario.nombre, v_usuario.email;
    ELSE
      -- Si no existe el rol ADMIN, crearlo primero
      RAISE NOTICE '  ⚠ Creando rol ADMIN para tenant: %', v_usuario.tenant_id;
      
      INSERT INTO roles (tenant_id, nombre, descripcion, is_system_role, created_at, updated_at)
      VALUES (v_usuario.tenant_id, 'ADMIN', 'Administrador del tenant con acceso completo', true, NOW(), NOW())
      RETURNING id INTO v_admin_role_id;
      
      -- Ahora asignar el rol
      INSERT INTO user_roles (usuario_sistema_id, role_id, created_at)
      VALUES (v_usuario.id, v_admin_role_id, NOW())
      ON CONFLICT DO NOTHING;
      
      v_count := v_count + 1;
      RAISE NOTICE '  ✓ Rol ADMIN creado y asignado a: % (%)', v_usuario.nombre, v_usuario.email;
    END IF;
  END LOOP;
  
  RAISE NOTICE '=== ASIGNACIÓN DE ROLES COMPLETADA: % usuarios actualizados ===', v_count;
END $$;

-- =====================================================
-- PASO 3: Verificar y reportar estado final
-- =====================================================
DO $$
DECLARE
  v_total_roles INTEGER;
  v_total_permisos INTEGER;
  v_total_asignaciones INTEGER;
  v_usuarios_sin_rol INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_roles FROM roles;
  SELECT COUNT(*) INTO v_total_permisos FROM permisos;
  SELECT COUNT(*) INTO v_total_asignaciones FROM user_roles;
  
  SELECT COUNT(*) INTO v_usuarios_sin_rol
  FROM usuarios_sistema u
  WHERE u.estado = 'ACTIVO'
    AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.usuario_sistema_id = u.id);
  
  RAISE NOTICE '';
  RAISE NOTICE '=== RESUMEN FINAL ===';
  RAISE NOTICE 'Total roles: %', v_total_roles;
  RAISE NOTICE 'Total permisos: %', v_total_permisos;
  RAISE NOTICE 'Total asignaciones usuario-rol: %', v_total_asignaciones;
  RAISE NOTICE 'Usuarios activos sin rol: %', v_usuarios_sin_rol;
  
  IF v_usuarios_sin_rol > 0 THEN
    RAISE WARNING '⚠ Hay % usuarios activos sin rol asignado', v_usuarios_sin_rol;
  ELSE
    RAISE NOTICE '✓ Todos los usuarios activos tienen rol asignado';
  END IF;
END $$;

COMMIT;
