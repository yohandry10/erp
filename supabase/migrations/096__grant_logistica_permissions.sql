-- 096__grant_logistica_permissions.sql
-- Garantiza que cada tenant tenga permisos completos de logística y que roles críticos puedan operarlos.

DO $$
DECLARE
  v_tenant_id UUID;
  v_role RECORD;
  v_permiso RECORD;
  v_system_user UUID;
BEGIN
  FOR v_tenant_id IN SELECT id FROM tenants LOOP
    -- Establecer contexto para auditoría multi-tenant
    SELECT id INTO v_system_user FROM usuarios_sistema WHERE tenant_id = v_tenant_id LIMIT 1;
    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.current_user_id', COALESCE(v_system_user::text, ''), true);

    -- Crear permisos faltantes
    IF NOT EXISTS (
      SELECT 1 FROM permisos
      WHERE tenant_id = v_tenant_id
        AND modulo = 'inventario'
        AND recurso = 'logistica'
        AND accion = 'preparar'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'inventario', 'logistica', 'preparar', 'Preparar pedidos confirmados', true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM permisos
      WHERE tenant_id = v_tenant_id
        AND modulo = 'inventario'
        AND recurso = 'logistica'
        AND accion = 'despachar'
    ) THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (v_tenant_id, 'inventario', 'logistica', 'despachar', 'Confirmar despacho y liberar stock', true);
    END IF;

    -- Asignar a roles ADMIN_EMPRESA, ALMACENERO y VENDEDOR
    FOR v_role IN
      SELECT id
      FROM roles
      WHERE tenant_id = v_tenant_id
        AND nombre IN ('ADMIN_EMPRESA', 'ALMACENERO', 'VENDEDOR')
    LOOP
      FOR v_permiso IN
        SELECT id
        FROM permisos
        WHERE tenant_id = v_tenant_id
          AND modulo = 'inventario'
          AND recurso = 'logistica'
          AND accion IN ('ver', 'preparar', 'despachar')
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM rol_permisos
          WHERE role_id = v_role.id
            AND permiso_id = v_permiso.id
        ) THEN
          INSERT INTO rol_permisos (role_id, permiso_id)
          VALUES (v_role.id, v_permiso.id);
        END IF;
      END LOOP;
    END LOOP;

    -- Limpiar contexto antes de continuar con el siguiente tenant
    PERFORM set_config('app.current_tenant_id', NULL, true);
    PERFORM set_config('app.current_user_id', NULL, true);
  END LOOP;

  RAISE NOTICE 'Permisos de logística creados y asignados correctamente';
END $$;
