-- =====================================================
-- MIGRACIÓN 062: Entrada de Stock Atómica para Recepciones
-- =====================================================
-- Descripción: Implementa entrada de stock atómica con validación para recepciones de compras
--              Garantiza que el movimiento y el stock se actualicen correctamente en una transacción
-- Prioridad: CRÍTICA - Tarea 14: Validación de stock actualizado
-- Fecha: 2025-01-XX
-- =====================================================

BEGIN;

-- =====================================================
-- 1. FUNCIÓN: registrar_entrada_stock_atomico
-- =====================================================
-- Registra entrada de stock de forma atómica con validación
-- Actualiza stock en producto_existencias y productos
-- Retorna el ID del movimiento creado y verifica que el stock se actualizó correctamente

CREATE OR REPLACE FUNCTION registrar_entrada_stock_atomico(
  p_producto_id UUID,
  p_almacen_id UUID,
  p_cantidad NUMERIC,
  p_referencia_tipo TEXT DEFAULT NULL,
  p_referencia_id TEXT DEFAULT NULL,
  p_notas TEXT DEFAULT NULL,
  p_ubicacion_id UUID DEFAULT NULL,
  p_lote TEXT DEFAULT NULL,
  p_fecha_expiracion TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := app.current_tenant_id();
  v_movimiento_id UUID;
  v_stock_anterior NUMERIC;
  v_stock_actual_nuevo NUMERIC;
  v_producto_existe BOOLEAN;
BEGIN
  -- Validaciones iniciales
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Almacén no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %. Debe ser mayor a cero', p_cantidad;
  END IF;

  -- Lock del registro del producto para prevenir race conditions
  SELECT 
    TRUE
  INTO 
    v_producto_existe
  FROM productos
  WHERE id = p_producto_id
    AND tenant_id = v_tenant
  FOR UPDATE;  -- 🔒 LOCK CRÍTICO: Previene entradas simultáneas

  IF NOT v_producto_existe THEN
    RAISE EXCEPTION 'Producto % no encontrado o no pertenece al tenant actual', p_producto_id;
  END IF;

  -- Obtener stock anterior de producto_existencias si existe
  SELECT COALESCE(stock_actual, 0) INTO v_stock_anterior
  FROM producto_existencias
  WHERE tenant_id = v_tenant
    AND producto_id = p_producto_id
    AND almacen_id = p_almacen_id;

  -- Si no existe, el stock anterior es 0
  IF v_stock_anterior IS NULL THEN
    v_stock_anterior := 0;
  END IF;

  -- Obtener o crear existencia en almacén
  INSERT INTO producto_existencias (
    tenant_id,
    producto_id,
    almacen_id,
    stock_actual,
    stock_reservado,
    ubicacion_id,
    updated_at
  )
  VALUES (
    v_tenant,
    p_producto_id,
    p_almacen_id,
    p_cantidad,
    0,
    p_ubicacion_id,
    NOW()
  )
  ON CONFLICT (tenant_id, producto_id, almacen_id)
  DO UPDATE SET
    stock_actual = producto_existencias.stock_actual + p_cantidad,
    ubicacion_id = COALESCE(p_ubicacion_id, producto_existencias.ubicacion_id),
    updated_at = NOW()
  RETURNING stock_actual INTO v_stock_actual_nuevo;

  -- Verificar que la actualización fue exitosa
  IF v_stock_actual_nuevo IS NULL THEN
    RAISE EXCEPTION 'Error al actualizar existencia en almacén % para producto %', p_almacen_id, p_producto_id;
  END IF;

  -- Actualizar stock agregado en productos
  UPDATE productos
  SET
    stock_actual = COALESCE(stock_actual, 0) + p_cantidad,
    updated_at = NOW()
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;

  -- Verificar que la actualización fue exitosa
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error al actualizar stock agregado del producto %', p_producto_id;
  END IF;

  -- Crear movimiento de inventario (ENTRADA)
  INSERT INTO movimientos_inventario (
    tenant_id,
    producto_id,
    almacen_id,
    tipo,
    cantidad,
    referencia_tipo,
    referencia_id,
    notas,
    ubicacion_id,
    lote,
    fecha_expiracion,
    created_at
  ) VALUES (
    v_tenant,
    p_producto_id,
    p_almacen_id,
    'ENTRADA',
    p_cantidad,
    p_referencia_tipo,
    p_referencia_id,
    COALESCE(p_notas, format('Entrada atómica de %s unidades', p_cantidad)),
    p_ubicacion_id,
    p_lote,
    p_fecha_expiracion,
    NOW()
  )
  RETURNING id INTO v_movimiento_id;

  -- Verificar que el movimiento se creó correctamente
  IF v_movimiento_id IS NULL THEN
    RAISE EXCEPTION 'Error al crear movimiento de inventario';
  END IF;

  -- Verificación final: confirmar que el stock se actualizó correctamente
  -- El stock nuevo debe ser igual al anterior + cantidad ingresada
  IF v_stock_actual_nuevo IS NULL OR v_stock_actual_nuevo < (v_stock_anterior + p_cantidad) THEN
    RAISE EXCEPTION 'Error validando stock actualizado: Stock anterior: %, Cantidad ingresada: %, Stock nuevo: %', 
      v_stock_anterior, p_cantidad, v_stock_actual_nuevo;
  END IF;

  -- Retornar ID del movimiento creado
  RETURN v_movimiento_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-lanzar la excepción con contexto adicional
    RAISE EXCEPTION 'Error en entrada atómica de stock: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION registrar_entrada_stock_atomico IS 
  'Registra entrada de stock de forma atómica con validación. CRÍTICO para garantizar integridad de inventario en recepciones.';

-- =====================================================
-- 2. GRANT PERMISOS
-- =====================================================

GRANT EXECUTE ON FUNCTION registrar_entrada_stock_atomico(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- =====================================================
-- 3. VERIFICACIÓN DE FUNCIÓN CREADA
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'registrar_entrada_stock_atomico'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: Función registrar_entrada_stock_atomico no fue creada correctamente';
  ELSE
    RAISE NOTICE '✅ Función registrar_entrada_stock_atomico creada exitosamente';
  END IF;
END $$;

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- CARACTERÍSTICAS DE LA FUNCIÓN:
-- 1. Usa FOR UPDATE para lock del registro y prevenir race conditions
-- 2. Actualiza stock en producto_existencias (almacén específico)
-- 3. Actualiza stock agregado en productos (stock total)
-- 4. Crea movimiento de inventario con todos los detalles
-- 5. Valida que el stock se actualizó correctamente antes de retornar
-- 6. Todo en una transacción atómica
--
-- TESTING REQUERIDO:
-- 1. Test de concurrencia: Múltiples recepciones simultáneas
-- 2. Test de validación: Verificar que el stock aumenta correctamente
-- 3. Test de tenant isolation: No debe actualizar stock de otros tenants
-- 4. Test de rollback: Si falla algo, todo debe revertirse
--
-- USO EN BACKEND:
-- Reemplazar llamadas a registrarMovimientoAlmacen + verificarStockActualizado
-- por una sola llamada a registrar_entrada_stock_atomico
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS registrar_entrada_stock_atomico(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ);
-- =====================================================

