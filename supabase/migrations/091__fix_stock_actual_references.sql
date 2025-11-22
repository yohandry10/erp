-- =====================================================
-- MIGRACIÓN 091: Corregir referencias a stock_actual
-- =====================================================
-- Descripción: Corrige todas las funciones RPC que usan stock_actual
--              La columna correcta es 'stock', no 'stock_actual'
-- Prioridad: CRÍTICA - Bloqueante
-- Fecha: 2025-11-14
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CORREGIR FUNCIÓN: reservar_stock_atomico
-- =====================================================

CREATE OR REPLACE FUNCTION reservar_stock_atomico(
  p_producto_id UUID,
  p_cantidad NUMERIC,
  p_referencia_tipo TEXT DEFAULT NULL,
  p_referencia_id TEXT DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := app.current_tenant_id();
  v_stock_actual NUMERIC;
  v_stock_reservado NUMERIC;
  v_stock_disponible NUMERIC;
  v_movimiento_id UUID;
  v_producto_existe BOOLEAN;
  v_referencia_id_uuid UUID;
BEGIN
  -- Convertir referencia_id de TEXT a UUID si es necesario
  IF p_referencia_id IS NOT NULL THEN
    v_referencia_id_uuid := p_referencia_id::UUID;
  END IF;

  -- Validaciones iniciales
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %. Debe ser mayor a cero', p_cantidad;
  END IF;

  -- HARDENING C1: Lock del registro con FOR UPDATE para prevenir race conditions
  SELECT 
    COALESCE(stock::NUMERIC, 0),
    COALESCE(stock_reservado, 0),
    TRUE
  INTO 
    v_stock_actual,
    v_stock_reservado,
    v_producto_existe
  FROM productos
  WHERE id = p_producto_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT v_producto_existe THEN
    RAISE EXCEPTION 'Producto % no encontrado o no pertenece al tenant actual', p_producto_id;
  END IF;

  -- Calcular stock disponible
  v_stock_disponible := v_stock_actual - v_stock_reservado;

  -- Validar stock suficiente
  IF v_stock_disponible < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para producto %. Disponible: %, Requerido: %', 
      p_producto_id, v_stock_disponible, p_cantidad;
  END IF;

  -- Actualización atómica del stock_reservado
  UPDATE productos
  SET stock_reservado = COALESCE(stock_reservado, 0) + p_cantidad
  WHERE id = p_producto_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error al actualizar stock del producto %', p_producto_id;
  END IF;

  -- Crear movimiento de inventario (RESERVA)
  INSERT INTO movimientos_inventario (
    tenant_id,
    producto_id,
    tipo,
    cantidad,
    referencia_tipo,
    referencia_id,
    notas,
    created_at
  ) VALUES (
    v_tenant,
    p_producto_id,
    'RESERVA',
    p_cantidad,
    p_referencia_tipo,
    v_referencia_id_uuid,
    COALESCE(p_notas, format('Reserva atómica de %s unidades', p_cantidad)),
    NOW()
  )
  RETURNING id INTO v_movimiento_id;

  RETURN v_movimiento_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error en reserva atómica de stock: %', SQLERRM;
END;
$$;

-- =====================================================
-- 2. CORREGIR FUNCIÓN: descontar_stock_y_liberar_reserva
-- =====================================================

-- Eliminar versiones anteriores de la función
DROP FUNCTION IF EXISTS descontar_stock_y_liberar_reserva(UUID, NUMERIC);
DROP FUNCTION IF EXISTS descontar_stock_y_liberar_reserva(UUID, NUMERIC, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION descontar_stock_y_liberar_reserva(
  p_producto_id UUID,
  p_cantidad NUMERIC,
  p_referencia_tipo TEXT DEFAULT NULL,
  p_referencia_id TEXT DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := app.current_tenant_id();
  v_stock_actual NUMERIC;
  v_stock_base INTEGER;
BEGIN
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %', p_cantidad;
  END IF;

  -- Lock y obtener stock actual
  SELECT
    COALESCE(stock::NUMERIC, 0),
    COALESCE(stock, 0)
  INTO v_stock_actual, v_stock_base
  FROM productos
  WHERE id = p_producto_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no pertenece al tenant actual', p_producto_id;
  END IF;

  IF v_stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible %, requerido %', v_stock_actual, p_cantidad;
  END IF;

  -- Descontar stock y liberar reserva
  UPDATE productos
  SET
    stock = GREATEST(v_stock_base - p_cantidad::INTEGER, 0),
    stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0)
  WHERE id = p_producto_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error al actualizar stock del producto %', p_producto_id;
  END IF;

  RETURN gen_random_uuid();
END;
$$;

-- =====================================================
-- 3. GRANT PERMISOS
-- =====================================================

GRANT EXECUTE ON FUNCTION reservar_stock_atomico(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION descontar_stock_y_liberar_reserva(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- =====================================================
-- 4. VERIFICACIÓN
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migración 091 completada:';
  RAISE NOTICE '  1. Función reservar_stock_atomico corregida (usa stock en lugar de stock_actual)';
  RAISE NOTICE '  2. Función descontar_stock_y_liberar_reserva corregida (usa stock en lugar de stock_actual)';
END $$;

COMMIT;
