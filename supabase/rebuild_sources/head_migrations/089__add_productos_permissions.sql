-- =====================================================
-- MIGRACIÓN 089: Agregar Permisos de Productos
-- =====================================================
-- Descripción: 
--   Agrega permisos para gestión de productos en inventario
-- Fecha: 2025-11-13
-- =====================================================

BEGIN;

-- =====================================================
-- 1. INSERTAR PERMISOS DE PRODUCTOS
-- =====================================================

-- Verificar si ya existen los permisos antes de insertarlos
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Obtener el primer tenant_id disponible (o usar NULL si no hay tenants)
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  
  -- Permiso de lectura de productos
  IF NOT EXISTS (
    SELECT 1 FROM permisos 
    WHERE modulo = 'inventario' 
      AND recurso = 'productos' 
      AND accion = 'read'
  ) THEN
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (
      v_tenant_id,
      'inventario',
      'productos',
      'read',
      'Permite ver el listado y detalle de productos',
      true
    );
    RAISE NOTICE '✓ Permiso inventario.productos.read creado';
  ELSE
    RAISE NOTICE '⚠ Permiso inventario.productos.read ya existe';
  END IF;

  -- Permiso de creación de productos
  IF NOT EXISTS (
    SELECT 1 FROM permisos 
    WHERE modulo = 'inventario' 
      AND recurso = 'productos' 
      AND accion = 'create'
  ) THEN
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (
      v_tenant_id,
      'inventario',
      'productos',
      'create',
      'Permite crear nuevos productos en el inventario',
      true
    );
    RAISE NOTICE '✓ Permiso inventario.productos.create creado';
  ELSE
    RAISE NOTICE '⚠ Permiso inventario.productos.create ya existe';
  END IF;

  -- Permiso de actualización de productos
  IF NOT EXISTS (
    SELECT 1 FROM permisos 
    WHERE modulo = 'inventario' 
      AND recurso = 'productos' 
      AND accion = 'update'
  ) THEN
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (
      v_tenant_id,
      'inventario',
      'productos',
      'update',
      'Permite modificar información de productos existentes',
      true
    );
    RAISE NOTICE '✓ Permiso inventario.productos.update creado';
  ELSE
    RAISE NOTICE '⚠ Permiso inventario.productos.update ya existe';
  END IF;

  -- Permiso de eliminación de productos
  IF NOT EXISTS (
    SELECT 1 FROM permisos 
    WHERE modulo = 'inventario' 
      AND recurso = 'productos' 
      AND accion = 'delete'
  ) THEN
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (
      v_tenant_id,
      'inventario',
      'productos',
      'delete',
      'Permite eliminar o desactivar productos del inventario',
      true
    );
    RAISE NOTICE '✓ Permiso inventario.productos.delete creado';
  ELSE
    RAISE NOTICE '⚠ Permiso inventario.productos.delete ya existe';
  END IF;
END $$;

-- =====================================================
-- 2. ASIGNAR PERMISOS AL ROL ADMIN
-- =====================================================

-- Asignar todos los permisos de productos al rol admin de cada tenant
DO $$
DECLARE
  v_role_record RECORD;
  v_permiso_record RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Iterar sobre todos los roles admin
  FOR v_role_record IN 
    SELECT id, tenant_id, nombre 
    FROM roles 
    WHERE nombre = 'admin'
  LOOP
    -- Asignar cada permiso de productos
    FOR v_permiso_record IN
      SELECT id, modulo, recurso, accion
      FROM permisos
      WHERE modulo = 'inventario' 
        AND recurso = 'productos'
    LOOP
      -- Verificar si ya existe la asignación
      IF NOT EXISTS (
        SELECT 1 
        FROM rol_permisos 
        WHERE role_id = v_role_record.id 
          AND permiso_id = v_permiso_record.id
      ) THEN
        INSERT INTO rol_permisos (role_id, permiso_id)
        VALUES (v_role_record.id, v_permiso_record.id);
        
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '✓ % permisos de productos asignados a roles admin', v_count;
END $$;

-- =====================================================
-- 3. VERIFICACIÓN FINAL
-- =====================================================

DO $$
DECLARE
  v_permisos_count INTEGER;
  v_asignaciones_count INTEGER;
BEGIN
  -- Contar permisos de productos
  SELECT COUNT(*) INTO v_permisos_count
  FROM permisos
  WHERE modulo = 'inventario' 
    AND recurso = 'productos';
  
  IF v_permisos_count < 4 THEN
    RAISE EXCEPTION 'ERROR: No se crearon todos los permisos de productos (esperado: 4, encontrado: %)', v_permisos_count;
  END IF;
  
  -- Contar asignaciones a roles admin
  SELECT COUNT(*) INTO v_asignaciones_count
  FROM rol_permisos rp
  INNER JOIN permisos p ON p.id = rp.permiso_id
  INNER JOIN roles r ON r.id = rp.role_id
  WHERE p.modulo = 'inventario'
    AND p.recurso = 'productos'
    AND r.nombre = 'admin';
  
  RAISE NOTICE '✓ % permisos de productos creados', v_permisos_count;
  RAISE NOTICE '✓ % asignaciones a roles admin', v_asignaciones_count;
  RAISE NOTICE '✓ Migración 089 completada exitosamente';
END $$;

COMMIT;

-- =====================================================
-- NOTAS:
-- =====================================================
-- 
-- Esta migración agrega 4 permisos para gestión de productos:
-- 1. inventario.productos.read - Ver productos
-- 2. inventario.productos.create - Crear productos
-- 3. inventario.productos.update - Editar productos
-- 4. inventario.productos.delete - Eliminar productos
--
-- Los permisos se asignan automáticamente a todos los roles 'admin'
-- existentes en el sistema.
--
-- ESTRUCTURA DE PERMISOS:
-- - modulo: 'inventario'
-- - recurso: 'productos'
-- - accion: 'read', 'create', 'update', 'delete'
--
