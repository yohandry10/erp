-- Migration 001: Crear tablas nuevas del módulo de ventas
-- Fecha: 2025-01-18
-- Descripción: Crea SOLO las tablas que NO existen: pedidos_venta, pedidos_venta_detalle
-- NOTA: Las tablas clientes, cotizaciones y cotizacion_detalles YA EXISTEN

-- =====================================================
-- VERIFICAR Y AGREGAR CAMPOS FALTANTES A TABLAS EXISTENTES
-- =====================================================

-- Agregar campos faltantes a tabla clientes (si no existen)
DO $$ 
BEGIN
  -- Verificar si falta el campo tipo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='clientes' AND column_name='tipo') THEN
    ALTER TABLE clientes ADD COLUMN tipo VARCHAR(10) DEFAULT 'EMPRESA' 
      CHECK (tipo IN ('PERSONA', 'EMPRESA'));
  END IF;
  
  -- Verificar si falta el campo documento_tipo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='clientes' AND column_name='documento_tipo') THEN
    ALTER TABLE clientes ADD COLUMN documento_tipo VARCHAR(10) DEFAULT 'RUC'
      CHECK (documento_tipo IN ('DNI', 'RUC', 'CE', 'PASAPORTE'));
  END IF;
END $$;

-- Agregar índice de búsqueda full-text si no existe
CREATE INDEX IF NOT EXISTS idx_clientes_search 
  ON clientes USING gin(to_tsvector('spanish', razon_social || ' ' || COALESCE(nombre_comercial, '')));

-- Verificar campos de tabla cotizaciones (ya existen, solo crear índices)
-- NOTA: La tabla cotizaciones ya tiene: fecha_cotizacion, fecha_vencimiento, estado, observaciones

-- Agregar índice por fecha_cotizacion si no existe
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha_cotizacion ON cotizaciones(fecha_cotizacion DESC);

-- Agregar índice por estado si no existe
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones(estado);


-- =====================================================
-- TABLA NUEVA: pedidos_venta
-- =====================================================
-- NOTA: Esta tabla es para el flujo Cotización → Pedido → Factura
-- NO confundir con "ventas" o "ventas_pos" que son para otros módulos

CREATE TABLE IF NOT EXISTS pedidos_venta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(50) NOT NULL,
  cotizacion_id UUID REFERENCES cotizaciones(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha_pedido DATE NOT NULL DEFAULT CURRENT_DATE,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN (
      'PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 
      'LISTO_DESPACHO', 'LISTO_FACTURAR', 'FACTURADO', 
      'COMPLETADO', 'COMPLETADO_CON_GRE', 'CANCELADO'
    )),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  factura_id UUID,
  gre_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  UNIQUE(tenant_id, numero)
);

COMMENT ON TABLE pedidos_venta IS 'Pedidos de venta del módulo Ventas (flujo: Cotización → Pedido → Factura). NO confundir con tabla "ventas" o "ventas_pos"';

-- Índices para pedidos_venta
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant ON pedidos_venta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_cliente ON pedidos_venta(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_estado ON pedidos_venta(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_cotizacion ON pedidos_venta(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_fecha_pedido ON pedidos_venta(fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_estado_fecha ON pedidos_venta(estado, fecha_pedido DESC);

-- RLS para pedidos_venta
ALTER TABLE pedidos_venta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's pedidos_venta"
  ON pedidos_venta FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "Users can insert their tenant's pedidos_venta"
  ON pedidos_venta FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "Users can update their tenant's pedidos_venta"
  ON pedidos_venta FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY "Users can delete their tenant's pedidos_venta"
  ON pedidos_venta FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- =====================================================
-- TABLA NUEVA: pedidos_venta_detalle
-- =====================================================
CREATE TABLE IF NOT EXISTS pedidos_venta_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  descripcion VARCHAR(255) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE pedidos_venta_detalle IS 'Detalle de pedidos de venta del módulo Ventas. NO confundir con "venta_detalles" o "detalle_ventas_pos"';

-- Índices para pedidos_venta_detalle
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_pedido ON pedidos_venta_detalle(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_producto ON pedidos_venta_detalle(producto_id);

-- RLS para pedidos_venta_detalle
ALTER TABLE pedidos_venta_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos_venta 
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id 
      AND pedidos_venta.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "Users can insert their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos_venta 
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id 
      AND pedidos_venta.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "Users can update their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pedidos_venta 
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id 
      AND pedidos_venta.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY "Users can delete their tenant's pedidos_venta_detalle"
  ON pedidos_venta_detalle FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pedidos_venta 
      WHERE pedidos_venta.id = pedidos_venta_detalle.pedido_id 
      AND pedidos_venta.tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );
