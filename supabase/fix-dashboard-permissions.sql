-- =====================================================
-- Script: Agregar permisos de dashboard para SUPER_ADMIN
-- Descripción: Crea los permisos necesarios para acceder
--              a las estadísticas y actividades del dashboard
-- =====================================================

-- Obtener el tenant_id del superadmin
DO $$
DECLARE
  v_tenant_id UUID;
  v_super_admin_role_id UUID;
  v_permiso_stats_id UUID;
  v_permiso_activities_id UUID;
BEGIN
  -- Obtener el tenant_id del superadmin
  SELECT tenant_id INTO v_tenant_id
  FROM usuarios_sistema
  WHERE email = 'superadmin@neon.com'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el usuario superadmin@neon.com';
  END IF;

  RAISE NOTICE 'Tenant ID encontrado: %', v_tenant_id;

  -- Obtener el rol SUPER_ADMIN
  SELECT id INTO v_super_admin_role_id
  FROM roles
  WHERE nombre = 'SUPER_ADMIN'
    AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_super_admin_role_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el rol SUPER_ADMIN para el tenant %', v_tenant_id;
  END IF;

  RAISE NOTICE 'Rol SUPER_ADMIN encontrado: %', v_super_admin_role_id;

  -- =====================================================
  -- 1. Crear permiso: dashboard.stats.read
  -- =====================================================
  INSERT INTO permisos (
    tenant_id,
    modulo,
    accion,
    recurso,
    descripcion,
    activo,
    created_at
  )
  VALUES (
    v_tenant_id,
    'dashboard',
    'read',
    'stats',
    'Ver estadísticas del dashboard',
    true,
    NOW()
  )
  ON CONFLICT (tenant_id, modulo, accion, recurso) 
  DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true
  RETURNING id INTO v_permiso_stats_id;

  RAISE NOTICE 'Permiso dashboard.stats.read creado/actualizado: %', v_permiso_stats_id;

  -- =====================================================
  -- 2. Crear permiso: dashboard.activities.read
  -- =====================================================
  INSERT INTO permisos (
    tenant_id,
    modulo,
    accion,
    recurso,
    descripcion,
    activo,
    created_at
  )
  VALUES (
    v_tenant_id,
    'dashboard',
    'read',
    'activities',
    'Ver actividades recientes del dashboard',
    true,
    NOW()
  )
  ON CONFLICT (tenant_id, modulo, accion, recurso) 
  DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true
  RETURNING id INTO v_permiso_activities_id;

  RAISE NOTICE 'Permiso dashboard.activities.read creado/actualizado: %', v_permiso_activities_id;

  -- =====================================================
  -- 3. Asignar permisos al rol SUPER_ADMIN
  -- =====================================================
  
  -- Asignar dashboard.stats.read
  INSERT INTO rol_permisos (
    role_id,
    permiso_id,
    concedido,
    created_at
  )
  VALUES (
    v_super_admin_role_id,
    v_permiso_stats_id,
    true,
    NOW()
  )
  ON CONFLICT (role_id, permiso_id) 
  DO UPDATE SET
    concedido = true;

  RAISE NOTICE 'Permiso dashboard.stats.read asignado al rol SUPER_ADMIN';

  -- Asignar dashboard.activities.read
  INSERT INTO rol_permisos (
    role_id,
    permiso_id,
    concedido,
    created_at
  )
  VALUES (
    v_super_admin_role_id,
    v_permiso_activities_id,
    true,
    NOW()
  )
  ON CONFLICT (role_id, permiso_id) 
  DO UPDATE SET
    concedido = true;

  RAISE NOTICE 'Permiso dashboard.activities.read asignado al rol SUPER_ADMIN';

  -- =====================================================
  -- 4. Verificar permisos asignados
  -- =====================================================
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Verificación de permisos del dashboard:';
  RAISE NOTICE '==============================================';
  
  PERFORM 1
  FROM rol_permisos rp
  INNER JOIN permisos p ON p.id = rp.permiso_id
  WHERE rp.role_id = v_super_admin_role_id
    AND p.modulo = 'dashboard'
    AND rp.concedido = true;

  IF FOUND THEN
    RAISE NOTICE '✅ Permisos de dashboard asignados correctamente al rol SUPER_ADMIN';
  ELSE
    RAISE WARNING '⚠️ No se encontraron permisos de dashboard para el rol SUPER_ADMIN';
  END IF;

END $$;

-- =====================================================
-- Consulta de verificación
-- =====================================================
SELECT 
  r.nombre AS rol,
  p.modulo,
  p.accion,
  p.recurso,
  p.descripcion,
  rp.concedido
FROM rol_permisos rp
INNER JOIN roles r ON r.id = rp.role_id
INNER JOIN permisos p ON p.id = rp.permiso_id
WHERE r.nombre = 'SUPER_ADMIN'
  AND p.modulo = 'dashboard'
ORDER BY p.recurso;