-- Migration 009: Refuerzo de aislamiento multi-tenant y funciones de stock
-- Fecha: 2025-10-21
-- Descripción:
--   * Crea funciones utilitarias para obtener tenant/usuario desde headers
--   * Implementa funciones RPC de inventario con validación de tenant
--   * Actualiza políticas RLS clave para utilizar la nueva función app.current_tenant_id()

BEGIN;

-- =====================================================
-- SCHEMA Y FUNCIONES DE CONTEXTO
-- =====================================================

CREATE SCHEMA IF NOT EXISTS app;

-- Otorgar permisos de uso del esquema app (SOLO usuarios autenticados, NO anon)
GRANT USAGE ON SCHEMA app TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_headers jsonb;
  v_tenant text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_tenant := COALESCE(
      v_headers ->> 'x-tenant-id',
      v_headers ->> 'x-tenant'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_tenant := NULL;
  END;

  IF v_tenant IS NULL OR v_tenant = '' THEN
    BEGIN
      v_tenant := current_setting('app.current_tenant_id', true);
    EXCEPTION
      WHEN OTHERS THEN
        v_tenant := NULL;
    END;
  END IF;

  IF v_tenant IS NULL OR v_tenant = '' THEN
    RAISE EXCEPTION 'Tenant context is missing';
  END IF;

  RETURN v_tenant::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_headers jsonb;
  v_user text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user := COALESCE(
      v_headers ->> 'x-user-id',
      v_headers ->> 'x-user'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_user := NULL;
  END;

  IF v_user IS NULL OR v_user = '' THEN
    BEGIN
      v_user := current_setting('app.current_user_id', true);
    EXCEPTION
      WHEN OTHERS THEN
        v_user := NULL;
    END;
  END IF;

  IF v_user IS NULL OR v_user = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_user::uuid;
END;
$$;

COMMENT ON FUNCTION app.current_tenant_id IS 'Obtiene el tenant_id actual a partir de cabeceras o GUC app.current_tenant_id';
COMMENT ON FUNCTION app.current_user_id IS 'Obtiene el user_id actual a partir de cabeceras o GUC app.current_user_id';

-- Función SAFE que no lanza excepción (para consultas administrativas)
CREATE OR REPLACE FUNCTION app.current_tenant_id_safe()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $
DECLARE
  v_headers jsonb;
  v_tenant text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_tenant := COALESCE(
      v_headers ->> 'x-tenant-id',
      v_headers ->> 'x-tenant'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_tenant := NULL;
  END;

  IF v_tenant IS NULL OR v_tenant = '' THEN
    BEGIN
      v_tenant := current_setting('app.current_tenant_id', true);
    EXCEPTION
      WHEN OTHERS THEN
        v_tenant := NULL;
    END;
  END IF;

  IF v_tenant IS NULL OR v_tenant = '' THEN
    RETURN NULL;  -- Retorna NULL en lugar de lanzar excepción
  END IF;

  RETURN v_tenant::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$;

COMMENT ON FUNCTION app.current_tenant_id_safe IS 'Versión segura que retorna NULL si no hay tenant context en lugar de lanzar excepción';

-- Función para verificar si hay contexto de tenant
CREATE OR REPLACE FUNCTION app.has_tenant_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $
BEGIN
  RETURN app.current_tenant_id_safe() IS NOT NULL;
END;
$;

COMMENT ON FUNCTION app.has_tenant_context IS 'Verifica si existe un contexto de tenant válido';

-- Función para verificar si el usuario actual es superadmin
CREATE OR REPLACE FUNCTION app.is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $
DECLARE
  v_user_id uuid;
  v_is_super boolean;
BEGIN
  v_user_id := app.current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verificar el campo is_super_admin en usuarios_sistema
  SELECT COALESCE(is_super_admin, false)
  INTO v_is_super
  FROM usuarios_sistema
  WHERE id = v_user_id
  AND activo = true;
  
  RETURN COALESCE(v_is_super, false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$;

COMMENT ON FUNCTION app.is_superadmin IS 'Verifica si el usuario actual tiene rol SUPERADMIN';

-- Función para logging de acceso sin tenant context
CREATE OR REPLACE FUNCTION app.log_no_tenant_access(
  p_table_name text,
  p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := app.current_user_id();
  
  INSERT INTO audit_log (
    tenant_id,
    user_id,
    table_name,
    operation,
    old_data,
    new_data,
    changed_at
  ) VALUES (
    NULL,  -- Sin tenant
    v_user_id,
    p_table_name,
    p_operation,
    jsonb_build_object('warning', 'Access without tenant context'),
    jsonb_build_object('is_superadmin', app.is_superadmin()),
    NOW()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Si falla el logging, no interrumpir la operación
    NULL;
END;
$;

COMMENT ON FUNCTION app.log_no_tenant_access IS 'Registra accesos a datos sin contexto de tenant para auditoría';

-- Otorgar permisos de ejecución de las funciones (SOLO usuarios autenticados)
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_tenant_id_safe() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.has_tenant_context() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_superadmin() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.log_no_tenant_access(text, text) TO postgres, authenticated, service_role;

-- =====================================================
-- FUNCIONES RPC DE INVENTARIO
-- =====================================================

CREATE OR REPLACE FUNCTION incrementar_stock_reservado(
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant uuid := app.current_tenant_id();
BEGIN
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %', p_cantidad;
  END IF;

  UPDATE productos
  SET
    stock_reservado = COALESCE(stock_reservado, 0) + p_cantidad,
    updated_at = NOW()
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no pertenece al tenant actual', p_producto_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION decrementar_stock_reservado(
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant uuid := app.current_tenant_id();
BEGIN
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %', p_cantidad;
  END IF;

  UPDATE productos
  SET
    stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0),
    updated_at = NOW()
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no pertenece al tenant actual', p_producto_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION descontar_stock_y_liberar_reserva(
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant uuid := app.current_tenant_id();
  v_cantidad numeric;
BEGIN
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %', p_cantidad;
  END IF;

  v_cantidad := p_cantidad;

  UPDATE productos
  SET
    stock = GREATEST(COALESCE(stock, 0) - v_cantidad::integer, 0),
    stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - v_cantidad, 0),
    updated_at = NOW()
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no pertenece al tenant actual', p_producto_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION incrementar_stock_reservado IS 'Incrementa el stock reservado validando tenant actual';
COMMENT ON FUNCTION decrementar_stock_reservado IS 'Decrementa el stock reservado validando tenant actual';
COMMENT ON FUNCTION descontar_stock_y_liberar_reserva IS 'Descuenta stock real y libera reserva validando tenant actual';

-- =====================================================
-- ACTUALIZACIÓN DE POLÍTICAS RLS (VENTAS + INVENTARIO)
-- =====================================================

-- Pedidos de venta
ALTER POLICY "Users can view their tenant's pedidos_venta"
  ON pedidos_venta
  USING (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can insert their tenant's pedidos_venta"
  ON pedidos_venta
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can update their tenant's pedidos_venta"
  ON pedidos_venta
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can delete their tenant's pedidos_venta"
  ON pedidos_venta
  USING (tenant_id = app.current_tenant_id());

-- Detalle de pedidos
ALTER POLICY "Users can view their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle
  USING (
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  );

ALTER POLICY "Users can insert their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  );

ALTER POLICY "Users can update their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle
  USING (
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  );

ALTER POLICY "Users can delete their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle
  USING (
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  );

-- Movimientos de inventario
ALTER POLICY "Users can view their tenant's movimientos_inventario"
  ON movimientos_inventario
  USING (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can insert their tenant's movimientos_inventario"
  ON movimientos_inventario
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Clientes
ALTER POLICY clientes_tenant_isolation
  ON clientes
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Cotizaciones
ALTER POLICY cotizaciones_tenant_isolation
  ON cotizaciones
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY cotizacion_detalles_tenant_isolation
  ON cotizacion_detalles
  USING (
    EXISTS (
      SELECT 1
      FROM cotizaciones
      WHERE cotizaciones.id = cotizacion_detalles.cotizacion_id
        AND cotizaciones.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM cotizaciones
      WHERE cotizaciones.id = cotizacion_detalles.cotizacion_id
        AND cotizaciones.tenant_id = app.current_tenant_id()
    )
  );

-- Productos
ALTER POLICY productos_tenant_isolation
  ON productos
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Empresa config
ALTER POLICY empresa_config_tenant_isolation
  ON empresa_config
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Documentos
ALTER POLICY documentos_tenant_isolation
  ON documentos
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY documento_detalles_tenant_isolation
  ON documento_detalles
  USING (
    EXISTS (
      SELECT 1
      FROM documentos
      WHERE documentos.id = documento_detalles.documento_id
        AND documentos.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM documentos
      WHERE documentos.id = documento_detalles.documento_id
        AND documentos.tenant_id = app.current_tenant_id()
    )
  );

ALTER POLICY documento_archivos_tenant_isolation
  ON documento_archivos
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY documento_auditoria_tenant_isolation
  ON documento_auditoria
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Notificaciones
ALTER POLICY "Users can view notifications for their tenant"
  ON notificaciones
  USING (
    tenant_id = app.current_tenant_id()
    AND (usuario_id IS NULL OR usuario_id = COALESCE(app.current_user_id(), usuario_id))
  );

ALTER POLICY "Users can insert wizard progress for their tenant"
  ON wizard_progress
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can update wizard progress for their tenant"
  ON wizard_progress
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can view wizard progress for their tenant"
  ON wizard_progress
  USING (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can delete wizard progress for their tenant"
  ON wizard_progress
  USING (tenant_id = app.current_tenant_id());

-- Validaciones SUNAT
ALTER POLICY "Users can view validations for their tenant"
  ON validaciones_sunat
  USING (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can insert validations for their tenant"
  ON validaciones_sunat
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can update validations for their tenant"
  ON validaciones_sunat
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER POLICY "Users can delete validations for their tenant"
  ON validaciones_sunat
  USING (tenant_id = app.current_tenant_id());

CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_user_id();
$$;

COMMIT;


