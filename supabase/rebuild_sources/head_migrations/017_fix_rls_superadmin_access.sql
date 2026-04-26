-- Migration 017: Corregir políticas RLS para permitir acceso a superadmin
-- Fecha: 2025-10-23
-- Descripción: Actualiza políticas RLS para permitir acceso a superadmins en todas las tablas multi-tenant

BEGIN;

-- =====================================================
-- ACTUALIZAR POLÍTICAS MULTI-TENANT
-- =====================================================

-- CLIENTES
DROP POLICY IF EXISTS clientes_tenant_isolation ON clientes;
CREATE POLICY clientes_tenant_isolation ON clientes
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- PRODUCTOS
DROP POLICY IF EXISTS productos_tenant_isolation ON productos;
CREATE POLICY productos_tenant_isolation ON productos
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- COTIZACIONES
DROP POLICY IF EXISTS cotizaciones_tenant_isolation ON cotizaciones;
CREATE POLICY cotizaciones_tenant_isolation ON cotizaciones
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- COTIZACION_DETALLES (sin tenant_id directo, usa relación)
DROP POLICY IF EXISTS cotizacion_detalles_tenant_isolation ON cotizacion_detalles;
CREATE POLICY cotizacion_detalles_tenant_isolation ON cotizacion_detalles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM cotizaciones
      WHERE cotizaciones.id = cotizacion_detalles.cotizacion_id
        AND (cotizaciones.tenant_id = app.current_tenant_id() OR app.is_superadmin())
    )
    OR app.is_superadmin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM cotizaciones
      WHERE cotizaciones.id = cotizacion_detalles.cotizacion_id
        AND (cotizaciones.tenant_id = app.current_tenant_id() OR app.is_superadmin())
    )
    OR app.is_superadmin()
  );

-- PEDIDOS DE VENTA
DROP POLICY IF EXISTS "Users can view their tenant's pedidos_venta" ON pedidos_venta;
DROP POLICY IF EXISTS "Users can insert their tenant's pedidos_venta" ON pedidos_venta;
DROP POLICY IF EXISTS "Users can update their tenant's pedidos_venta" ON pedidos_venta;
DROP POLICY IF EXISTS "Users can delete their tenant's pedidos_venta" ON pedidos_venta;

CREATE POLICY pedidos_venta_tenant_isolation ON pedidos_venta
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- PEDIDOS VENTA DETALLE (sin tenant_id directo)
DROP POLICY IF EXISTS "Users can view their tenant's pedidos_venta_detalle" ON pedidos_venta_detalle;
DROP POLICY IF EXISTS "Users can insert their tenant's pedidos_venta_detalle" ON pedidos_venta_detalle;
DROP POLICY IF EXISTS "Users can update their tenant's pedidos_venta_detalle" ON pedidos_venta_detalle;
DROP POLICY IF EXISTS "Users can delete their tenant's pedidos_venta_detalle" ON pedidos_venta_detalle;

CREATE POLICY pedidos_venta_detalle_tenant_isolation ON pedidos_venta_detalle
  FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1
      FROM pedidos_venta
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id
        AND pedidos_venta.tenant_id = app.current_tenant_id()
    )
  );

-- DOCUMENTOS
DROP POLICY IF EXISTS documentos_tenant_isolation ON documentos;
CREATE POLICY documentos_tenant_isolation ON documentos
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

DROP POLICY IF EXISTS documento_detalles_tenant_isolation ON documento_detalles;
CREATE POLICY documento_detalles_tenant_isolation ON documento_detalles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM documentos
      WHERE documentos.id = documento_detalles.documento_id
        AND (documentos.tenant_id = app.current_tenant_id() OR app.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM documentos
      WHERE documentos.id = documento_detalles.documento_id
        AND (documentos.tenant_id = app.current_tenant_id() OR app.is_superadmin())
    )
  );

DROP POLICY IF EXISTS documento_archivos_tenant_isolation ON documento_archivos;
CREATE POLICY documento_archivos_tenant_isolation ON documento_archivos
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

DROP POLICY IF EXISTS documento_auditoria_tenant_isolation ON documento_auditoria;
CREATE POLICY documento_auditoria_tenant_isolation ON documento_auditoria
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

DROP POLICY IF EXISTS documento_series_tenant_isolation ON documento_series;
CREATE POLICY documento_series_tenant_isolation ON documento_series
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- EMPRESA CONFIG
DROP POLICY IF EXISTS empresa_config_tenant_isolation ON empresa_config;
CREATE POLICY empresa_config_tenant_isolation ON empresa_config
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- PROVEEDORES
DROP POLICY IF EXISTS proveedores_tenant_isolation ON proveedores;
CREATE POLICY proveedores_tenant_isolation ON proveedores
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- ORDENES DE COMPRA
DROP POLICY IF EXISTS ordenes_compra_tenant_isolation ON ordenes_compra;
CREATE POLICY ordenes_compra_tenant_isolation ON ordenes_compra
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- ORDEN_COMPRA_DETALLES (sin tenant_id directo)
DROP POLICY IF EXISTS orden_compra_detalles_tenant_isolation ON orden_compra_detalles;
CREATE POLICY orden_compra_detalles_tenant_isolation ON orden_compra_detalles
  FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1
      FROM ordenes_compra
      WHERE ordenes_compra.id = orden_compra_detalles.orden_id
        AND ordenes_compra.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1
      FROM ordenes_compra
      WHERE ordenes_compra.id = orden_compra_detalles.orden_id
        AND ordenes_compra.tenant_id = app.current_tenant_id()
    )
  );

-- EMPLEADOS (verificar si tiene tenant_id, si no, omitir)
-- Nota: Si empleados no tiene tenant_id, esta política debe ajustarse
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'empleados' AND column_name = 'tenant_id'
  ) THEN
    DROP POLICY IF EXISTS empleados_tenant_isolation ON empleados;
    EXECUTE 'CREATE POLICY empleados_tenant_isolation ON empleados
      FOR ALL
      USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
      WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin())';
  END IF;
END $$;

-- MOVIMIENTOS INVENTARIO
DROP POLICY IF EXISTS "Users can view their tenant's movimientos_inventario" ON movimientos_inventario;
DROP POLICY IF EXISTS "Users can insert their tenant's movimientos_inventario" ON movimientos_inventario;

CREATE POLICY movimientos_inventario_select ON movimientos_inventario
  FOR SELECT
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin());

CREATE POLICY movimientos_inventario_insert ON movimientos_inventario
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- VENTAS Y VENTAS POS
DROP POLICY IF EXISTS ventas_tenant_isolation ON ventas;
CREATE POLICY ventas_tenant_isolation ON ventas
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- VENTA_DETALLES (sin tenant_id directo)
DROP POLICY IF EXISTS venta_detalles_tenant_isolation ON venta_detalles;
CREATE POLICY venta_detalles_tenant_isolation ON venta_detalles
  FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1
      FROM ventas
      WHERE ventas.id = venta_detalles.venta_id
        AND ventas.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1
      FROM ventas
      WHERE ventas.id = venta_detalles.venta_id
        AND ventas.tenant_id = app.current_tenant_id()
    )
  );

DROP POLICY IF EXISTS ventas_pos_tenant_isolation ON ventas_pos;
CREATE POLICY ventas_pos_tenant_isolation ON ventas_pos
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

DROP POLICY IF EXISTS detalle_ventas_pos_tenant_isolation ON detalle_ventas_pos;
CREATE POLICY detalle_ventas_pos_tenant_isolation ON detalle_ventas_pos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM ventas_pos
      WHERE ventas_pos.id = detalle_ventas_pos.venta_id
        AND (ventas_pos.tenant_id = app.current_tenant_id() OR app.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ventas_pos
      WHERE ventas_pos.id = detalle_ventas_pos.venta_id
        AND (ventas_pos.tenant_id = app.current_tenant_id() OR app.is_superadmin())
    )
  );

-- AUDIT LOG
DROP POLICY IF EXISTS audit_log_tenant_isolation ON audit_log;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin() OR tenant_id IS NULL);

COMMIT;
