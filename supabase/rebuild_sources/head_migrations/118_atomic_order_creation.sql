-- =====================================================
-- MIGRACIÓN 118: Creación Atómica de Pedidos (Header + Detalle)
-- =====================================================
-- Descripción: Crea una función RPC para insertar cabecera y detalles de pedido
--              en una única transacción, eliminando el riesgo de "pedidos huérfanos".
-- Fecha: 2025-11-27
-- Autor: Antigravity
-- =====================================================

BEGIN;

-- 1. Definir tipo para el detalle del pedido (si no existe, o usar jsonb)
-- Usaremos JSONB para flexibilidad y simplicidad en la firma de la función.

-- 2. Función RPC: crear_pedido_completo
CREATE OR REPLACE FUNCTION crear_pedido_completo(
  p_pedido JSONB,
  p_detalle JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido_id UUID;
  v_tenant_id UUID;
  v_numero TEXT;
  v_detalle_item JSONB;
  v_result JSONB;
BEGIN
  -- Extraer tenant_id del objeto pedido para validaciones
  v_tenant_id := (p_pedido->>'tenant_id')::UUID;
  
  -- Validar que el tenant coincida con el usuario autenticado (RLS manual)
  IF v_tenant_id != app.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant ID mismatch';
  END IF;

  -- Insertar Cabecera
  INSERT INTO pedidos_venta (
    tenant_id,
    numero,
    cotizacion_id,
    cliente_id,
    fecha_pedido,
    estado,
    subtotal,
    igv,
    total,
    observaciones,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_tenant_id,
    p_pedido->>'numero',
    (p_pedido->>'cotizacion_id')::UUID,
    (p_pedido->>'cliente_id')::UUID,
    (p_pedido->>'fecha_pedido')::DATE,
    p_pedido->>'estado',
    (p_pedido->>'subtotal')::NUMERIC,
    (p_pedido->>'igv')::NUMERIC,
    (p_pedido->>'total')::NUMERIC,
    p_pedido->>'observaciones',
    (p_pedido->>'created_by')::UUID,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_pedido_id;

  -- Insertar Detalles
  FOR v_detalle_item IN SELECT * FROM jsonb_array_elements(p_detalle)
  LOOP
    INSERT INTO pedidos_venta_detalle (
      pedido_id,
      producto_id,
      descripcion,
      cantidad,
      precio_unitario,
      subtotal,
      created_at
    ) VALUES (
      v_pedido_id,
      (v_detalle_item->>'producto_id')::UUID,
      v_detalle_item->>'descripcion',
      (v_detalle_item->>'cantidad')::NUMERIC,
      (v_detalle_item->>'precio_unitario')::NUMERIC,
      (v_detalle_item->>'subtotal')::NUMERIC,
      NOW()
    );
  END LOOP;

  -- Construir resultado
  v_result := jsonb_build_object(
    'success', true,
    'pedido_id', v_pedido_id
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error en crear_pedido_completo: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION crear_pedido_completo IS 'Crea pedido y detalles en una sola transacción atómica';

GRANT EXECUTE ON FUNCTION crear_pedido_completo(JSONB, JSONB) TO authenticated, service_role;

COMMIT;
