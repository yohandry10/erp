-- =====================================================
-- MIGRACIÓN 056: Reserva de Stock Atómica y Concurrente (C1)
-- =====================================================
-- Descripción: Implementa reserva de stock atómica con locks para prevenir race conditions
--              cuando múltiples pedidos intentan reservar el mismo producto simultáneamente
-- Prioridad: CRÍTICA - Bloqueante de producción (Tarea C1)
-- Fecha: 2025-01-27
-- Sprint: 3 - Ventas e Inventario
-- =====================================================

BEGIN;

-- =====================================================
-- 1. FUNCIÓN: reservar_stock_atomico
-- =====================================================
-- Reserva stock de forma atómica con validación de disponibilidad
-- Usa FOR UPDATE para prevenir race conditions en reservas concurrentes
-- Retorna el nuevo stock_reservado si exitoso, lanza excepción si falla

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
BEGIN
  -- Validaciones iniciales
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto no especificado';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %. Debe ser mayor a cero', p_cantidad;
  END IF;

  -- HARDENING C1: Lock del registro con FOR UPDATE para prevenir race conditions
  -- Esto asegura que solo una transacción puede reservar stock del mismo producto a la vez
  SELECT 
    COALESCE(stock_actual, stock::NUMERIC, 0),
    COALESCE(stock_reservado, 0),
    TRUE
  INTO 
    v_stock_actual,
    v_stock_reservado,
    v_producto_existe
  FROM productos
  WHERE id = p_producto_id
    AND tenant_id = v_tenant
  FOR UPDATE;  -- 🔒 LOCK CRÍTICO: Previene reservas simultáneas

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

  -- HARDENING C1: Actualización atómica del stock_reservado
  UPDATE productos
  SET
    stock_reservado = COALESCE(stock_reservado, 0) + p_cantidad,
    updated_at = NOW()
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;

  -- Verificar que la actualización fue exitosa
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
    p_referencia_id,
    COALESCE(p_notas, format('Reserva atómica de %s unidades', p_cantidad)),
    NOW()
  )
  RETURNING id INTO v_movimiento_id;

  -- Retornar ID del movimiento creado
  RETURN v_movimiento_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-lanzar la excepción con contexto adicional
    RAISE EXCEPTION 'Error en reserva atómica de stock: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION reservar_stock_atomico IS 
  'Reserva stock de forma atómica con locks (FOR UPDATE) para prevenir race conditions. CRÍTICO para producción.';

-- =====================================================
-- 2. GRANT PERMISOS
-- =====================================================

GRANT EXECUTE ON FUNCTION reservar_stock_atomico(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- =====================================================
-- 3. VERIFICACIÓN DE FUNCIÓN CREADA
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'reservar_stock_atomico'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: Función reservar_stock_atomico no fue creada correctamente';
  ELSE
    RAISE NOTICE '✅ Función reservar_stock_atomico creada exitosamente';
  END IF;
END $$;

-- =====================================================
-- 4. REGISTRO EN AUDIT LOG
-- =====================================================

INSERT INTO audit_log (
  table_name,
  operation,
  record_id,
  new_values,
  user_id,
  tenant_id,
  metadata,
  timestamp
) VALUES (
  'system_migrations',
  'STOCK_ATOMIC_RESERVATION',
  gen_random_uuid(),
  jsonb_build_object(
    'migration', '056_atomic_stock_reservation',
    'function_created', 'reservar_stock_atomico',
    'priority', 'CRITICAL',
    'task', 'C1 - Reserva de stock atómica y concurrente',
    'sprint', 'Sprint 3 - Ventas e Inventario',
    'features', jsonb_build_array(
      'FOR UPDATE lock',
      'Validación de stock disponible',
      'Operación atómica',
      'Inserción de movimiento'
    )
  ),
  NULL,  -- System migration
  NULL,  -- System-wide
  jsonb_build_object(
    'action', 'CREATE_ATOMIC_STOCK_RESERVATION',
    'compliance', 'PRODUCTION_BLOCKER_RESOLVED',
    'security_impact', 'HIGH',
    'concurrency_safety', 'CRITICAL'
  ),
  NOW()
);

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN:
-- =====================================================
-- 
-- CARACTERÍSTICAS DE LA FUNCIÓN:
-- 1. Usa FOR UPDATE para lock del registro y prevenir race conditions
-- 2. Valida stock disponible ANTES de reservar
-- 3. Actualización atómica del stock_reservado
-- 4. Inserción automática del movimiento de inventario
-- 5. Validación de tenant para seguridad multi-tenant
--
-- TESTING REQUERIDO:
-- 1. Test de concurrencia: 10 pedidos simultáneos reservando el mismo producto
-- 2. Test de stock insuficiente: Debe fallar correctamente
-- 3. Test de tenant isolation: No debe reservar stock de otros tenants
-- 4. Test de transacciones: Rollback debe liberar el lock
--
-- USO EN BACKEND:
-- Reemplazar llamadas a incrementar_stock_reservado + crearMovimiento separadas
-- por una sola llamada a reservar_stock_atomico
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS reservar_stock_atomico(UUID, NUMERIC, TEXT, TEXT, TEXT);
-- =====================================================

