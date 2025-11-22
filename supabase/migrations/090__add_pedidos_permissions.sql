-- =====================================================
-- Migration: Add Pedidos Permissions
-- Description: Agrega permisos para el módulo de pedidos de venta
-- Author: System
-- Date: 2025-11-14
-- =====================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_permiso_record RECORD;
  v_role_record RECORD;
  v_system_user_id UUID;
BEGIN
  -- Obtener todos los tenants
  FOR v_tenant_id IN SELECT id FROM tenants LOOP
    
    -- Obtener un usuario del sistema para este tenant (el primero disponible)
    SELECT id INTO v_system_user_id 
    FROM usuarios_sistema 
    WHERE tenant_id = v_tenant_id 
    LIMIT 1;
    
    -- Si no hay usuario, usar NULL (sin auditoría)
    IF v_system_user_id IS NULL THEN
      v_system_user_id := NULL;
    END IF;
    
    -- Establecer contexto de tenant
    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.current_user_id', COALESCE(v_system_user_id::text, ''), true);
    
    -- Insertar permisos para pedidos de venta
    -- Ver pedidos
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'ver'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'ver', 'Ver pedidos de venta', true);
    END IF;

    -- Crear pedidos
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'crear'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'crear', 'Crear pedidos de venta', true);
    END IF;

    -- Editar pedidos
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'editar'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'editar', 'Editar pedidos de venta', true);
    END IF;

    -- Eliminar pedidos
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'eliminar'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'eliminar', 'Eliminar pedidos de venta', true);
    END IF;

    -- Confirmar pedidos
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'confirmar'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'confirmar', 'Confirmar pedidos de venta', true);
    END IF;

    -- Cancelar pedidos
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'cancelar'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'cancelar', 'Cancelar pedidos de venta', true);
    END IF;

    -- Generar factura
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'generar_factura'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'generar_factura', 'Generar factura desde pedido', true);
    END IF;

    -- Ver historial
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'ver_historial'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'ver_historial', 'Ver historial de cambios del pedido', true);
    END IF;

    -- Ver GRE
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos' 
        AND accion = 'ver_gre'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos', 'ver_gre', 'Ver guías de remisión del pedido', true);
    END IF;

    -- Ver logística (para backorders)
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'inventario' 
        AND recurso = 'logistica' 
        AND accion = 'ver'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'inventario', 'logistica', 'ver', 'Ver información de logística', true);
    END IF;

    -- Ver aprobaciones
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos_aprobaciones' 
        AND accion = 'ver'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos_aprobaciones', 'ver', 'Ver pedidos pendientes de aprobación', true);
    END IF;

    -- Resolver aprobaciones
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = v_tenant_id 
        AND modulo = 'ventas' 
        AND recurso = 'pedidos_aprobaciones' 
        AND accion = 'resolver'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'ventas', 'pedidos_aprobaciones', 'resolver', 'Aprobar o rechazar pedidos', true);
    END IF;

    -- Asignar permisos a roles
    -- ADMIN_EMPRESA: todos los permisos
    FOR v_role_record IN 
      SELECT id FROM roles WHERE tenant_id = v_tenant_id AND nombre = 'ADMIN_EMPRESA'
    LOOP
      FOR v_permiso_record IN 
        SELECT id FROM permisos 
        WHERE tenant_id = v_tenant_id 
          AND ((modulo = 'ventas' AND recurso IN ('pedidos', 'pedidos_aprobaciones'))
            OR (modulo = 'inventario' AND recurso = 'logistica'))
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM rol_permisos 
          WHERE role_id = v_role_record.id 
            AND permiso_id = v_permiso_record.id
        ) THEN
          INSERT INTO rol_permisos (role_id, permiso_id)
          VALUES (v_role_record.id, v_permiso_record.id);
        END IF;
      END LOOP;
    END LOOP;

    -- VENDEDOR: ver, crear, editar, confirmar, generar_factura, ver_historial, ver_gre
    FOR v_role_record IN 
      SELECT id FROM roles WHERE tenant_id = v_tenant_id AND nombre = 'VENDEDOR'
    LOOP
      FOR v_permiso_record IN 
        SELECT id FROM permisos 
        WHERE tenant_id = v_tenant_id 
          AND modulo = 'ventas' 
          AND recurso = 'pedidos'
          AND accion IN ('ver', 'crear', 'editar', 'confirmar', 'generar_factura', 'ver_historial', 'ver_gre')
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM rol_permisos 
          WHERE role_id = v_role_record.id 
            AND permiso_id = v_permiso_record.id
        ) THEN
          INSERT INTO rol_permisos (role_id, permiso_id)
          VALUES (v_role_record.id, v_permiso_record.id);
        END IF;
      END LOOP;
    END LOOP;

    -- CONTADOR: ver, ver_historial
    FOR v_role_record IN 
      SELECT id FROM roles WHERE tenant_id = v_tenant_id AND nombre = 'CONTADOR'
    LOOP
      FOR v_permiso_record IN 
        SELECT id FROM permisos 
        WHERE tenant_id = v_tenant_id 
          AND modulo = 'ventas' 
          AND recurso = 'pedidos'
          AND accion IN ('ver', 'ver_historial')
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM rol_permisos 
          WHERE role_id = v_role_record.id 
            AND permiso_id = v_permiso_record.id
        ) THEN
          INSERT INTO rol_permisos (role_id, permiso_id)
          VALUES (v_role_record.id, v_permiso_record.id);
        END IF;
      END LOOP;
    END LOOP;

    -- ALMACENERO: ver, confirmar, ver_historial, ver_gre
    FOR v_role_record IN 
      SELECT id FROM roles WHERE tenant_id = v_tenant_id AND nombre = 'ALMACENERO'
    LOOP
      FOR v_permiso_record IN 
        SELECT id FROM permisos 
        WHERE tenant_id = v_tenant_id 
          AND modulo = 'ventas' 
          AND recurso = 'pedidos'
          AND accion IN ('ver', 'confirmar', 'ver_historial', 'ver_gre')
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM rol_permisos 
          WHERE role_id = v_role_record.id 
            AND permiso_id = v_permiso_record.id
        ) THEN
          INSERT INTO rol_permisos (role_id, permiso_id)
          VALUES (v_role_record.id, v_permiso_record.id);
        END IF;
      END LOOP;
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Permisos de pedidos agregados exitosamente para todos los tenants';
END $$;
