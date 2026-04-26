-- Migration 139: Mover funciones POS al schema public
-- PostgREST busca funciones en public por defecto cuando se llama .rpc('nombre')
-- Llamar .rpc('app.pos_registrar_venta_tx') causa error PGRST202 porque interpreta 
-- 'app.pos_registrar_venta_tx' como nombre de función en schema public

-- =====================================================
-- 1. FUNCIONES DE ADVISORY LOCK
-- =====================================================
DROP FUNCTION IF EXISTS app.acquire_pos_lock CASCADE;
DROP FUNCTION IF EXISTS app.release_pos_lock CASCADE;

CREATE OR REPLACE FUNCTION acquire_pos_lock(p_tenant_id uuid, p_lock_key text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_key text := coalesce(p_lock_key, 'default');
BEGIN
  PERFORM pg_advisory_lock(hashtext(p_tenant_id::text || ':' || v_key));
END;
$fn$;

CREATE OR REPLACE FUNCTION release_pos_lock(p_tenant_id uuid, p_lock_key text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_key text := coalesce(p_lock_key, 'default');
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_tenant_id::text || ':' || v_key));
END;
$fn$;

-- =====================================================
-- 2. FUNCIÓN PRINCIPAL DE VENTA POS
-- =====================================================
DROP FUNCTION IF EXISTS app.pos_registrar_venta_tx CASCADE;

-- Crear función en schema public (donde PostgREST la puede encontrar)
CREATE OR REPLACE FUNCTION pos_registrar_venta_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid,
  p_cliente_documento text,
  p_cliente_nombre text,
  p_metodo_pago text,
  p_items jsonb,
  p_serie text DEFAULT 'T001',
  p_sesion_caja_id uuid DEFAULT NULL,
  p_vendedor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_correlativo bigint;
  v_numero text;
  v_venta_id uuid;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  -- Validar tenant
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id requerido';
  END IF;

  -- Obtener y actualizar correlativo
  INSERT INTO pos_numeracion (tenant_id, serie, correlativo)
  VALUES (p_tenant_id, p_serie, 1)
  ON CONFLICT (tenant_id, serie) 
  DO UPDATE SET correlativo = pos_numeracion.correlativo + 1
  RETURNING correlativo INTO v_correlativo;

  v_numero := LPAD(v_correlativo::text, 8, '0');

  -- Calcular totales
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal + (v_item->>'subtotal')::numeric;
  END LOOP;

  v_igv := ROUND(v_subtotal * 0.18, 2);
  v_total := v_subtotal + v_igv;

  -- Insertar venta usando la estructura real de la tabla
  INSERT INTO ventas (
    tenant_id,
    tipo_documento,
    serie,
    numero,
    fecha,
    cliente_id,
    cliente_razon_social,
    cliente_documento,
    subtotal,
    igv,
    total,
    estado,
    estado_pago,
    observaciones
  ) VALUES (
    p_tenant_id,
    '03',
    p_serie,
    v_numero,
    CURRENT_DATE,
    p_cliente_id,
    p_cliente_nombre,
    p_cliente_documento,
    v_subtotal,
    v_igv,
    v_total,
    'EMITIDA',
    'PAGADO',
    jsonb_build_object(
      'metodo_pago', p_metodo_pago,
      'sesion_caja_id', p_sesion_caja_id,
      'items', p_items
    )::text
  ) RETURNING id INTO v_venta_id;

  -- Actualizar stock de productos (la columna se llama 'stock', no 'stock_actual')
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE productos
    SET stock = stock - (v_item->>'cantidad')::integer
    WHERE id = (v_item->>'producto_id')::uuid
      AND tenant_id = p_tenant_id;
  END LOOP;

  -- Retornar resultado como array (el backend espera un array)
  RETURN jsonb_build_array(
    jsonb_build_object(
      'venta_id', v_venta_id,
      'numero_ticket', p_serie || '-' || v_numero,
      'subtotal', v_subtotal,
      'impuestos', v_igv,
      'total', v_total,
      'success', true
    )
  );
END;
$$;

COMMENT ON FUNCTION pos_registrar_venta_tx IS 
'Registra venta POS usando la estructura real de la tabla ventas. Retorna array para compatibilidad con backend.';
