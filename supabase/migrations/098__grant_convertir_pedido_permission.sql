-- 098__grant_convertir_pedido_permission.sql
-- Asegura que todos los tenants tengan el permiso ventas.cotizaciones.convertir_pedido
-- y que los roles clave (ADMIN, ADMIN_EMPRESA, VENDEDOR) puedan convertir cotizaciones.

DO $$
DECLARE
  v_tenant_id UUID;
  v_role RECORD;
  v_permiso_id UUID;
  v_system_user UUID;
BEGIN
  FOR v_tenant_id IN SELECT id FROM tenants LOOP
    -- Tomar un usuario del tenant para mantener auditorías coherentes
    SELECT id INTO v_system_user
    FROM usuarios_sistema
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at
    LIMIT 1;

    PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);
    PERFORM set_config('app.current_user_id', COALESCE(v_system_user::text, ''), true);

    -- Crear u obtener el permiso convertir_pedido
    SELECT id INTO v_permiso_id
    FROM permisos
    WHERE tenant_id = v_tenant_id
      AND modulo = 'ventas'
      AND recurso = 'cotizaciones'
      AND accion = 'convertir_pedido'
    LIMIT 1;

    IF v_permiso_id IS NULL THEN
      INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
      VALUES (
        v_tenant_id,
        'ventas',
        'cotizaciones',
        'convertir_pedido',
        'Convertir cotizaciones a pedidos de venta',
        true
      )
      RETURNING id INTO v_permiso_id;
    END IF;

    -- Asignar el permiso a los roles con capacidad comercial
    FOR v_role IN
      SELECT id
      FROM roles
      WHERE tenant_id = v_tenant_id
        AND nombre IN ('ADMIN', 'ADMIN_EMPRESA', 'VENDEDOR')
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM rol_permisos
        WHERE role_id = v_role.id
          AND permiso_id = v_permiso_id
      ) THEN
        INSERT INTO rol_permisos (role_id, permiso_id)
        VALUES (v_role.id, v_permiso_id);
      END IF;
    END LOOP;

    -- Limpiar contexto
    PERFORM set_config('app.current_tenant_id', NULL, true);
    PERFORM set_config('app.current_user_id', NULL, true);
  END LOOP;

  RAISE NOTICE 'Permiso ventas.cotizaciones.convertir_pedido asegurado para todos los tenants';
END $$;
