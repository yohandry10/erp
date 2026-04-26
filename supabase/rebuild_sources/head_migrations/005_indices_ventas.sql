-- Migration 005: Crear índices de optimización para módulo de ventas
-- Fecha: 2025-01-18
-- Descripción: Crea índices adicionales para optimizar consultas frecuentes

-- =====================================================
-- ÍNDICES ADICIONALES PARA OPTIMIZACIÓN
-- =====================================================

-- Índices compuestos para consultas frecuentes en pedidos_venta
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_estado 
  ON pedidos_venta(tenant_id, estado);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_fecha 
  ON pedidos_venta(tenant_id, fecha_pedido DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_cliente_fecha 
  ON pedidos_venta(cliente_id, fecha_pedido DESC);

-- Índices para cotizaciones (usa fecha_cotizacion)
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_estado 
  ON cotizaciones(tenant_id, estado);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_fecha 
  ON cotizaciones(tenant_id, fecha_cotizacion DESC);

-- Índices para búsquedas por número de documento
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_numero 
  ON pedidos_venta(numero);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_numero 
  ON cotizaciones(numero);

-- Índice para consultas de pedidos por factura
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_factura 
  ON pedidos_venta(factura_id) WHERE factura_id IS NOT NULL;

-- Índice para consultas de pedidos por GRE
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_gre 
  ON pedidos_venta(gre_id) WHERE gre_id IS NOT NULL;

-- Índice para movimientos por fecha (para reportes)
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tenant_fecha 
  ON movimientos_inventario(tenant_id, created_at DESC);

-- Índice para movimientos por producto y tipo (para kardex)
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_producto_tipo 
  ON movimientos_inventario(producto_id, tipo, created_at DESC);
