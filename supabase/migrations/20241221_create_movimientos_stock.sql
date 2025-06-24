-- Crear tabla movimientos_stock
CREATE TABLE IF NOT EXISTS movimientos_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    producto_id VARCHAR(255) NOT NULL,
    tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('ENTRADA', 'SALIDA', 'AJUSTE')),
    cantidad DECIMAL(10,2) NOT NULL,
    stock_anterior DECIMAL(10,2) DEFAULT 0,
    stock_nuevo DECIMAL(10,2) DEFAULT 0,
    motivo TEXT,
    precio_unitario DECIMAL(10,2) DEFAULT 0,
    valor_total DECIMAL(10,2) DEFAULT 0,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    referencia VARCHAR(255),
    venta_id UUID,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_producto_id ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_tipo_movimiento ON movimientos_stock(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_fecha ON movimientos_stock(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_tenant_id ON movimientos_stock(tenant_id);

-- Comentarios para documentación
COMMENT ON TABLE movimientos_stock IS 'Tabla para registrar todos los movimientos de stock de productos';
COMMENT ON COLUMN movimientos_stock.tipo_movimiento IS 'Tipo de movimiento: ENTRADA, SALIDA, AJUSTE';
COMMENT ON COLUMN movimientos_stock.cantidad IS 'Cantidad del movimiento (positiva o negativa)';
COMMENT ON COLUMN movimientos_stock.stock_anterior IS 'Stock antes del movimiento';
COMMENT ON COLUMN movimientos_stock.stock_nuevo IS 'Stock después del movimiento'; 