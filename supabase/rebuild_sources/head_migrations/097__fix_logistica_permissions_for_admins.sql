-- 097__fix_logistica_permissions_for_admins.sql
-- Reasigna los permisos de logística a los roles ADMIN/ADMIN_EMPRESA/ALMACENERO/VENDEDOR
-- para todos los tenants existentes, asegurando que el flujo de preparación/despacho funcione.

DO $$
DECLARE
  v_tenant_id UUID;
  v_role RECORD;
  v_permiso RECORD;
  v_system_user UUID;
BEGIN
  FOR v_tenant_id IN SELECT id FROM tenants LOOP
    -- Establecer contexto para disparar auditorías multi-tenant
    SELECT id INTO v_system_user
    FROM usuarios_sistema
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at
    LIMIT 1;

    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.current_user_id', COALESCE(v_system_user::text, ''), true);

    -- Garantizar permisos base (por si algún tenant quedó sin seed)
    FOR v_permiso IN
      SELECT unnest(ARRAY['ver', 'preparar', 'despachar']) AS accion
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM permisos
        WHERE tenant_id = v_tenant_id
          AND modulo = 'inventario'
          AND recurso = 'logistica'
          AND accion = v_permiso.accion
      ) THEN
        INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
        VALUES (
          v_tenant_id,
          'inventario',
          'logistica',
          v_permiso.accion,
          CASE v_permiso.accion
            WHEN 'ver' THEN 'Ver órdenes pendientes en logística'
            WHEN 'preparar' THEN 'Preparar pedidos confirmados'
            ELSE 'Confirmar despacho y liberar stock'
          END,
          true
        );
      END IF;
    END LOOP;

    -- Asignar permisos a los roles estándar del tenant
    FOR v_role IN
      SELECT id
      FROM roles
      WHERE tenant_id = v_tenant_id
        AND nombre IN ('ADMIN', 'ADMIN_EMPRESA', 'ALMACENERO', 'VENDEDOR')
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
          SELECT 1 FROM rol_permisos
          WHERE role_id = v_role.id
            AND permiso_id = v_permiso.id
        ) THEN
          INSERT INTO rol_permisos (role_id, permiso_id)
          VALUES (v_role.id, v_permiso.id);
        END IF;
      END LOOP;
    END LOOP;

    -- Limpiar contexto
    PERFORM set_config('app.current_tenant_id', NULL, true);
    PERFORM set_config('app.current_user_id', NULL, true);
  END LOOP;

  RAISE NOTICE 'Permisos de logística asignados a roles ADMIN/ALMACENERO/VENDEDOR en todos los tenants';
END $$;
