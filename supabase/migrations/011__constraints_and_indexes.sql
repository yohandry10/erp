-- ============================================================================
-- 011__constraints_and_indexes.sql
-- Integridad incremental: FKs e indices aplicados solo si existen columnas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.add_fk_if_possible(
  p_table text,
  p_column text,
  p_ref_table text,
  p_ref_column text,
  p_fk_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  ) INTO v_exists;

  IF v_exists THEN
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      p_table, p_fk_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE SET NULL',
      p_table, p_fk_name, p_column, p_ref_table, p_ref_column
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.add_index_if_possible(
  p_table text,
  p_column text,
  p_index_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  ) INTO v_exists;

  IF v_exists THEN
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
      p_index_name, p_table, p_column
    );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- FKs principales entre módulos
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('clientes', 'tenant_id', 'tenants', 'id', 'fk_clientes_tenant_id');
SELECT app.add_fk_if_possible('productos', 'tenant_id', 'tenants', 'id', 'fk_productos_tenant_id');
SELECT app.add_fk_if_possible('pedidos_venta', 'tenant_id', 'tenants', 'id', 'fk_pedidos_venta_tenant_id');
SELECT app.add_fk_if_possible('pedidos_venta', 'cliente_id', 'clientes', 'id', 'fk_pedidos_venta_cliente_id');
SELECT app.add_fk_if_possible('pedidos_venta_detalle', 'pedido_id', 'pedidos_venta', 'id', 'fk_pedidos_venta_detalle_pedido_id');
SELECT app.add_fk_if_possible('pedidos_venta_detalle', 'producto_id', 'productos', 'id', 'fk_pedidos_venta_detalle_producto_id');

SELECT app.add_fk_if_possible('cotizaciones', 'tenant_id', 'tenants', 'id', 'fk_cotizaciones_tenant_id');
SELECT app.add_fk_if_possible('cotizaciones', 'cliente_id', 'clientes', 'id', 'fk_cotizaciones_cliente_id');
SELECT app.add_fk_if_possible('cotizacion_detalles', 'cotizacion_id', 'cotizaciones', 'id', 'fk_cotizacion_detalles_cotizacion_id');
SELECT app.add_fk_if_possible('cotizacion_detalles', 'producto_id', 'productos', 'id', 'fk_cotizacion_detalles_producto_id');

SELECT app.add_fk_if_possible('proveedores', 'tenant_id', 'tenants', 'id', 'fk_proveedores_tenant_id');
SELECT app.add_fk_if_possible('ordenes_compra', 'tenant_id', 'tenants', 'id', 'fk_ordenes_compra_tenant_id');
SELECT app.add_fk_if_possible('ordenes_compra', 'proveedor_id', 'proveedores', 'id', 'fk_ordenes_compra_proveedor_id');
SELECT app.add_fk_if_possible('orden_compra_detalles', 'orden_id', 'ordenes_compra', 'id', 'fk_orden_compra_detalles_orden_id');
SELECT app.add_fk_if_possible('orden_compra_detalles', 'producto_id', 'productos', 'id', 'fk_orden_compra_detalles_producto_id');
SELECT app.add_fk_if_possible('recepciones', 'orden_id', 'ordenes_compra', 'id', 'fk_recepciones_orden_id');
SELECT app.add_fk_if_possible('recepcion_items', 'recepcion_id', 'recepciones', 'id', 'fk_recepcion_items_recepcion_id');
SELECT app.add_fk_if_possible('recepcion_items', 'producto_id', 'productos', 'id', 'fk_recepcion_items_producto_id');

SELECT app.add_fk_if_possible('cuentas_por_cobrar', 'tenant_id', 'tenants', 'id', 'fk_cxc_tenant_id');
SELECT app.add_fk_if_possible('cuentas_por_cobrar', 'cliente_id', 'clientes', 'id', 'fk_cxc_cliente_id');
SELECT app.add_fk_if_possible('cuentas_por_pagar', 'tenant_id', 'tenants', 'id', 'fk_cxp_tenant_id');
SELECT app.add_fk_if_possible('cuentas_por_pagar', 'proveedor_id', 'proveedores', 'id', 'fk_cxp_proveedor_id');
SELECT app.add_fk_if_possible('movimientos_bancarios', 'cuenta_bancaria_id', 'cuentas_bancarias', 'id', 'fk_mov_bancarios_cuenta_id');

SELECT app.add_fk_if_possible('documentos', 'tenant_id', 'tenants', 'id', 'fk_documentos_tenant_id');
SELECT app.add_fk_if_possible('documento_detalles', 'documento_id', 'documentos', 'id', 'fk_documento_detalles_documento_id');
SELECT app.add_fk_if_possible('documento_archivos', 'documento_id', 'documentos', 'id', 'fk_documento_archivos_documento_id');
SELECT app.add_fk_if_possible('cpe', 'tenant_id', 'tenants', 'id', 'fk_cpe_tenant_id');
SELECT app.add_fk_if_possible('cpe', 'documento_id', 'documentos', 'id', 'fk_cpe_documento_id');
SELECT app.add_fk_if_possible('gre_guias', 'tenant_id', 'tenants', 'id', 'fk_gre_guias_tenant_id');

SELECT app.add_fk_if_possible('ventas_pos', 'tenant_id', 'tenants', 'id', 'fk_ventas_pos_tenant_id');
SELECT app.add_fk_if_possible('ventas_pos', 'sesion_caja_id', 'sesiones_caja', 'id', 'fk_ventas_pos_sesion_caja_id');
SELECT app.add_fk_if_possible('detalle_ventas_pos', 'venta_pos_id', 'ventas_pos', 'id', 'fk_detalle_ventas_pos_venta_id');
SELECT app.add_fk_if_possible('detalle_ventas_pos', 'producto_id', 'productos', 'id', 'fk_detalle_ventas_pos_producto_id');
SELECT app.add_fk_if_possible('movimientos_caja', 'sesion_caja_id', 'sesiones_caja', 'id', 'fk_movimientos_caja_sesion_id');

SELECT app.add_fk_if_possible('empleados', 'tenant_id', 'tenants', 'id', 'fk_empleados_tenant_id');
SELECT app.add_fk_if_possible('planillas', 'tenant_id', 'tenants', 'id', 'fk_planillas_tenant_id');
SELECT app.add_fk_if_possible('empleado_planilla', 'planilla_id', 'planillas', 'id', 'fk_empleado_planilla_planilla_id');
SELECT app.add_fk_if_possible('empleado_planilla', 'empleado_id', 'empleados', 'id', 'fk_empleado_planilla_empleado_id');

SELECT app.add_fk_if_possible('asientos_contables', 'tenant_id', 'tenants', 'id', 'fk_asientos_contables_tenant_id');
SELECT app.add_fk_if_possible('detalle_asientos', 'asiento_id', 'asientos_contables', 'id', 'fk_detalle_asientos_asiento_id');
SELECT app.add_fk_if_possible('detalle_asientos', 'cuenta_id', 'plan_cuentas', 'id', 'fk_detalle_asientos_cuenta_id');

-- ----------------------------------------------------------------------------
-- Indices frecuentes
-- ----------------------------------------------------------------------------
SELECT app.add_index_if_possible('clientes', 'tenant_id', 'idx_clientes_tenant_id');
SELECT app.add_index_if_possible('clientes', 'numero_documento', 'idx_clientes_numero_documento');
SELECT app.add_index_if_possible('productos', 'tenant_id', 'idx_productos_tenant_id');
SELECT app.add_index_if_possible('productos', 'codigo', 'idx_productos_codigo');
SELECT app.add_index_if_possible('pedidos_venta', 'tenant_id', 'idx_pedidos_venta_tenant_id');
SELECT app.add_index_if_possible('pedidos_venta', 'estado', 'idx_pedidos_venta_estado');
SELECT app.add_index_if_possible('ordenes_compra', 'tenant_id', 'idx_ordenes_compra_tenant_id');
SELECT app.add_index_if_possible('ordenes_compra', 'estado', 'idx_ordenes_compra_estado');
SELECT app.add_index_if_possible('documentos', 'tenant_id', 'idx_documentos_tenant_id');
SELECT app.add_index_if_possible('documentos', 'estado', 'idx_documentos_estado');
SELECT app.add_index_if_possible('cpe', 'tenant_id', 'idx_cpe_tenant_id');
SELECT app.add_index_if_possible('cpe', 'estado_sunat', 'idx_cpe_estado_sunat');
SELECT app.add_index_if_possible('ventas_pos', 'tenant_id', 'idx_ventas_pos_tenant_id');
SELECT app.add_index_if_possible('ventas_pos', 'estado', 'idx_ventas_pos_estado');
SELECT app.add_index_if_possible('sesiones_caja', 'tenant_id', 'idx_sesiones_caja_tenant_id');
SELECT app.add_index_if_possible('movimientos_inventario', 'tenant_id', 'idx_movimientos_inventario_tenant_id');
SELECT app.add_index_if_possible('movimientos_inventario', 'producto_id', 'idx_movimientos_inventario_producto_id');
SELECT app.add_index_if_possible('cuentas_por_cobrar', 'tenant_id', 'idx_cxc_tenant_id');
SELECT app.add_index_if_possible('cuentas_por_pagar', 'tenant_id', 'idx_cxp_tenant_id');
SELECT app.add_index_if_possible('asientos_contables', 'tenant_id', 'idx_asientos_contables_tenant_id');
SELECT app.add_index_if_possible('empleados', 'tenant_id', 'idx_empleados_tenant_id');
SELECT app.add_index_if_possible('planillas', 'tenant_id', 'idx_planillas_tenant_id');

COMMIT;
