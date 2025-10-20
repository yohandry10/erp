-- Migration 006: Crear funciones para cálculo de stock
-- Fecha: 2025-01-18
-- Descripción: Crea funciones SQL para calcular stock disponible y otras operaciones

-- =====================================================
-- FUNCIÓN: stock_disponible
-- =====================================================
-- Calcula el stock disponible de un producto (stock_actual - stock_reservado)

CREATE OR REPLACE FUNCTION stock_disponible(p_producto_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_disponible NUMERIC;
  v_stock NUMERIC;
  v_stock_reservado NUMERIC;
BEGIN
  -- La tabla productos usa el campo 'stock' (no 'stock_actual')
  SELECT COALESCE(stock, 0), COALESCE(stock_reservado, 0)
  INTO v_stock, v_stock_reservado
  FROM productos
  WHERE id = p_producto_id;
  
  v_disponible := v_stock - v_stock_reservado;
  RETURN COALESCE(v_disponible, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION stock_disponible IS 'Calcula stock disponible: stock - stock_reservado';

-- =====================================================
-- FUNCIÓN: verificar_stock_disponible
-- =====================================================
-- Verifica si hay stock disponible suficiente para una cantidad solicitada

CREATE OR REPLACE FUNCTION verificar_stock_disponible(
  p_producto_id UUID,
  p_cantidad NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_disponible NUMERIC;
BEGIN
  v_disponible := stock_disponible(p_producto_id);
  RETURN v_disponible >= p_cantidad;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION verificar_stock_disponible IS 'Verifica si hay stock suficiente para la cantidad solicitada';

-- =====================================================
-- FUNCIÓN: obtener_stock_info
-- =====================================================
-- Obtiene información completa de stock de un producto

CREATE OR REPLACE FUNCTION obtener_stock_info(p_producto_id UUID)
RETURNS TABLE (
  producto_id UUID,
  stock_total NUMERIC,
  stock_reservado NUMERIC,
  stock_disponible NUMERIC
) AS $$
BEGIN
  -- La tabla productos usa el campo 'stock' (no 'stock_actual')
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(p.stock::NUMERIC, 0),
    COALESCE(p.stock_reservado, 0),
    (COALESCE(p.stock::NUMERIC, 0) - COALESCE(p.stock_reservado, 0))
  FROM productos p
  WHERE p.id = p_producto_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION obtener_stock_info IS 'Obtiene información completa de stock de un producto';

-- =====================================================
-- FUNCIÓN: actualizar_stock_reservado
-- =====================================================
-- Actualiza el stock reservado de un producto (incrementa o decrementa)

CREATE OR REPLACE FUNCTION actualizar_stock_reservado(
  p_producto_id UUID,
  p_cantidad NUMERIC,
  p_operacion VARCHAR  -- 'INCREMENTAR' o 'DECREMENTAR'
)
RETURNS VOID AS $$
BEGIN
  IF p_operacion = 'INCREMENTAR' THEN
    UPDATE productos
    SET stock_reservado = COALESCE(stock_reservado, 0) + p_cantidad,
        updated_at = NOW()
    WHERE id = p_producto_id;
    
  ELSIF p_operacion = 'DECREMENTAR' THEN
    UPDATE productos
    SET stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0),
        updated_at = NOW()
    WHERE id = p_producto_id;
    
  ELSE
    RAISE EXCEPTION 'Operación inválida: %. Use INCREMENTAR o DECREMENTAR', p_operacion;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION actualizar_stock_reservado IS 'Actualiza stock reservado (INCREMENTAR o DECREMENTAR)';

-- =====================================================
-- FUNCIÓN: descontar_stock
-- =====================================================
-- Descuenta stock actual y libera reserva

CREATE OR REPLACE FUNCTION descontar_stock(
  p_producto_id UUID,
  p_cantidad NUMERIC
)
RETURNS VOID AS $$
BEGIN
  -- La tabla productos usa el campo 'stock' (INTEGER, no 'stock_actual')
  UPDATE productos
  SET 
    stock = GREATEST(COALESCE(stock, 0) - p_cantidad::INTEGER, 0),
    stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0),
    created_at = NOW()
  WHERE id = p_producto_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION descontar_stock IS 'Descuenta stock actual y libera reserva simultáneamente';
