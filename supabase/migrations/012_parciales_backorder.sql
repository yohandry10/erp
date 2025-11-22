-- Migration 012: Parciales, backorders y consistencia de stock
-- Fecha: 2025-10-21
-- Descripción:
--   * Corrige funciones de inventario para operar sobre stock_actual y mantener stock_reservado
--   * Añade columnas de control de despacho/facturación a pedidos_venta_detalle
--   * Crea tablas de histórico de despachos y backorders multi-tenant

BEGIN;

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

COMMENT ON FUNCTION incrementar_stock_reservado IS 'Incrementa el stock reservado validando tenant actual';

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

COMMENT ON FUNCTION decrementar_stock_reservado IS 'Decrementa el stock reservado validando tenant actual';

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
  v_stock_actual numeric;
  v_stock_base numeric;
BEGIN
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %', p_cantidad;
  END IF;

  v_cantidad := p_cantidad;

  SELECT
    COALESCE(stock::numeric, 0),
    COALESCE(stock, 0)
  INTO v_stock_actual, v_stock_base
  FROM productos
  WHERE id = p_producto_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no pertenece al tenant actual', p_producto_id;
  END IF;

  IF v_stock_actual < v_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible %, requerido %', v_stock_actual, v_cantidad;
  END IF;

  UPDATE productos
  SET
    stock = GREATEST(v_stock_base - v_cantidad::integer, 0),
    stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - v_cantidad, 0),
    updated_at = NOW()
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;
END;
$$;

COMMENT ON FUNCTION descontar_stock_y_liberar_reserva IS 'Descuenta stock actual y libera reserva validando tenant actual';

-- =====================================================
-- PEDIDOS: CAMPOS PARA PARCIALES Y BACKORDER
-- =====================================================

ALTER TABLE pedidos_venta_detalle
  ADD COLUMN IF NOT EXISTS cantidad_despachada NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_facturada NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_item TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_item IN ('PENDIENTE','PARCIAL','DESPACHADO','FACTURADO'));

CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_estado
  ON pedidos_venta_detalle(pedido_id, estado_item);

-- Backfill estado_item en base a cantidades actuales
UPDATE pedidos_venta_detalle
SET estado_item = CASE
  WHEN cantidad_despachada >= cantidad THEN 'DESPACHADO'
  ELSE 'PENDIENTE'
END
WHERE estado_item IS NULL OR estado_item = '';

-- =====================================================
-- HISTÓRICO DE DESPACHOS (MULTI-TENANT)
-- =====================================================

CREATE TABLE IF NOT EXISTS pedido_despachos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  detalle_id UUID NOT NULL REFERENCES pedidos_venta_detalle(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  registrado_por UUID,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notas TEXT
);

ALTER TABLE pedido_despachos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_despachos_rls ON pedido_despachos;
CREATE POLICY pedido_despachos_rls
  ON pedido_despachos
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_pedido_despachos_pedido
  ON pedido_despachos(pedido_id, detalle_id);

-- =====================================================
-- BACKORDERS (PENDIENTES DE DESPACHO)
-- =====================================================

CREATE TABLE IF NOT EXISTS pedido_backorders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  detalle_id UUID NOT NULL REFERENCES pedidos_venta_detalle(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad_comprometida NUMERIC(12,2) NOT NULL,
  cantidad_despachada NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad_pendiente NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','PARCIAL','CERRADO')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pedido_backorders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_backorders_rls ON pedido_backorders;
CREATE POLICY pedido_backorders_rls
  ON pedido_backorders
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_backorders_detalle
  ON pedido_backorders(detalle_id);

COMMIT;
