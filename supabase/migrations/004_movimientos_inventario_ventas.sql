-- Migration 004: Crear tabla movimientos_inventario para ventas
-- Fecha: 2025-01-18
-- Descripción: Crea tabla para registrar movimientos de inventario (RESERVA, LIBERACION, SALIDA)
-- NOTA: Ya existe tabla "stock_movimientos", esta es específica para el módulo de ventas

-- =====================================================
-- TABLA: movimientos_inventario
-- =====================================================

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL 
    CHECK (tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION', 'AJUSTE', 'TRANSFERENCIA')),
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  referencia_tipo VARCHAR(50),  -- 'PEDIDO', 'COMPRA', 'AJUSTE', etc.
  referencia_id UUID,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID
);

COMMENT ON TABLE movimientos_inventario IS 'Movimientos de inventario del módulo Ventas. Incluye RESERVA y LIBERACION para control de pedidos';

-- Índices para movimientos_inventario
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tenant 
  ON movimientos_inventario(tenant_id);
  
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_producto 
  ON movimientos_inventario(producto_id);
  
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tipo 
  ON movimientos_inventario(tipo);
  
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_referencia 
  ON movimientos_inventario(referencia_tipo, referencia_id);
  
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_fecha 
  ON movimientos_inventario(created_at DESC);

-- RLS para movimientos_inventario
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's movimientos_inventario"
  ON movimientos_inventario FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "Users can insert their tenant's movimientos_inventario"
  ON movimientos_inventario FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- No permitir UPDATE ni DELETE para mantener integridad del historial
CREATE POLICY "Movimientos are immutable"
  ON movimientos_inventario FOR UPDATE
  USING (false);

CREATE POLICY "Movimientos cannot be deleted"
  ON movimientos_inventario FOR DELETE
  USING (false);
