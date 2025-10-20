-- Backfill: Inicializar stock_reservado para datos existentes
-- Fecha: 2025-01-18
-- Descripción: Inicializa el campo stock_reservado y recalcula reservas de pedidos existentes

-- =====================================================
-- PASO 1: Inicializar stock_reservado a 0
-- =====================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Actualizar productos sin stock_reservado
  UPDATE productos 
  SET stock_reservado = 0 
  WHERE stock_reservado IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Inicializados % productos con stock_reservado = 0', v_count;
END $$;

-- =====================================================
-- PASO 2: Recalcular reservas de pedidos confirmados
-- =====================================================

DO $$
DECLARE
  v_pedido RECORD;
  v_detalle RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Buscar pedidos en estados que deberían tener stock reservado
  FOR v_pedido IN 
    SELECT id, numero, tenant_id
    FROM pedidos_venta
    WHERE estado IN ('CONFIRMADO', 'EN_PREPARACION', 'LISTO_DESPACHO')
  LOOP
    -- Para cada detalle del pedido, crear movimiento de RESERVA
    FOR v_detalle IN
      SELECT producto_id, cantidad
      FROM pedidos_venta_detalle
      WHERE pedido_id = v_pedido.id
    LOOP
      -- Crear movimiento de RESERVA
      INSERT INTO movimientos_inventario (
        tenant_id,
        producto_id,
        tipo,
        cantidad,
        referencia_tipo,
        referencia_id,
        notas,
        created_at
      )
      VALUES (
        v_pedido.tenant_id,
        v_detalle.producto_id,
        'RESERVA',
        v_detalle.cantidad,
        'PEDIDO',
        v_pedido.id,
        'Backfill: Reserva recalculada para pedido ' || v_pedido.numero,
        NOW()
      );
      
      -- Actualizar stock_reservado del producto
      UPDATE productos
      SET stock_reservado = COALESCE(stock_reservado, 0) + v_detalle.cantidad
      WHERE id = v_detalle.producto_id;
      
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Recalculadas % reservas de pedidos existentes', v_count;
END $$;

-- =====================================================
-- PASO 3: Verificar integridad
-- =====================================================

DO $$
DECLARE
  v_productos_negativos INTEGER;
  v_productos_exceso INTEGER;
BEGIN
  -- Verificar productos con stock_reservado negativo
  SELECT COUNT(*) INTO v_productos_negativos
  FROM productos
  WHERE stock_reservado < 0;
  
  IF v_productos_negativos > 0 THEN
    RAISE WARNING 'Encontrados % productos con stock_reservado negativo', v_productos_negativos;
  END IF;
  
  -- Verificar productos con stock_reservado > stock_actual
  SELECT COUNT(*) INTO v_productos_exceso
  FROM productos
  WHERE stock_reservado > stock_actual;
  
  IF v_productos_exceso > 0 THEN
    RAISE WARNING 'Encontrados % productos con stock_reservado > stock_actual', v_productos_exceso;
  END IF;
  
  IF v_productos_negativos = 0 AND v_productos_exceso = 0 THEN
    RAISE NOTICE 'Verificación de integridad completada: OK';
  END IF;
END $$;

RAISE NOTICE 'Backfill de stock_reservado completado';
