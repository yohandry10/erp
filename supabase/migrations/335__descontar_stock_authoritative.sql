BEGIN;

-- Corrige descontar_stock_y_liberar_reserva (introducido en 333__inventory_stock_reconciliation_hardening.sql)
-- para no sobreescribir productos.stock_actual con SUM(producto_existencias) tras el descuento.
--
-- Cuando otros flujos (p.ej. devoluciones de compra) descuentan productos.stock_actual sin sincronizar
-- producto_existencias, la version 333 pisaba el saldo real al recalcular productos = SUM(existencias),
-- dejando stock incorrecto despues del despacho (regresion observada en e2e inventario-logistica).
--
-- Esta version descuenta productos.stock_actual / stock_reservado de forma autoritativa e independiente,
-- manteniendo el descuento granular de producto_existencias para preservar el rastreo fisico por almacen.

CREATE OR REPLACE FUNCTION public.descontar_stock_y_liberar_reserva(
  p_producto_id uuid,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_stock_actual numeric;
  v_stock_reservado numeric;
  v_mov_id uuid;
  v_ref_tipo text := COALESCE(NULLIF(upper(btrim(p_referencia_tipo)), ''), 'SALIDA');
  v_ref_id uuid := NULLIF(p_referencia_id, '')::uuid;
  v_restante numeric;
  v_liberar_restante numeric;
  v_descontar numeric;
  v_total_existencias numeric;
  v_total_reservado numeric;
  v_row record;
BEGIN
  IF p_producto_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Parametros invalidos para salida de stock';
  END IF;

  SELECT p.tenant_id, COALESCE(p.stock_actual, p.stock, 0)::numeric, COALESCE(p.stock_reservado, 0)::numeric
    INTO v_tenant, v_stock_actual, v_stock_reservado
  FROM public.productos p
  WHERE p.id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  -- Idempotencia por referencia: si ya existe SALIDA con (producto, tenant, tipo, ref), retorna sin descontar.
  IF v_ref_id IS NOT NULL THEN
    SELECT mi.id
      INTO v_mov_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = v_tenant
      AND mi.producto_id = p_producto_id
      AND mi.tipo = 'SALIDA'
      AND mi.referencia_tipo = v_ref_tipo
      AND mi.referencia_id = v_ref_id
    ORDER BY mi.created_at ASC
    LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      RETURN v_mov_id;
    END IF;
  END IF;

  IF v_stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente';
  END IF;

  -- Descuento granular en producto_existencias si hay registros, limitado a lo disponible alli.
  -- Si la suma de existencias < p_cantidad (gap por devoluciones u otros flujos que solo tocaron
  -- productos), descontamos lo posible y dejamos el resto sin afectar existencias; la reconciliacion
  -- (validar_inventory_stock_reconciliation_runtime) lo reportara como divergencia visible.
  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_total_existencias, v_total_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = v_tenant
    AND pe.producto_id = p_producto_id;

  IF v_total_existencias > 0 THEN
    v_restante := LEAST(p_cantidad, v_total_existencias);

    FOR v_row IN
      SELECT pe.id, COALESCE(pe.stock_actual, 0)::numeric AS stock_actual
      FROM public.producto_existencias pe
      WHERE pe.tenant_id = v_tenant
        AND pe.producto_id = p_producto_id
        AND COALESCE(pe.stock_actual, 0) > 0
      ORDER BY pe.updated_at ASC, pe.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_restante <= 0;
      v_descontar := LEAST(v_row.stock_actual, v_restante);

      UPDATE public.producto_existencias pe
      SET stock_actual = GREATEST(COALESCE(pe.stock_actual, 0) - v_descontar, 0),
          updated_at = now()
      WHERE pe.id = v_row.id;

      v_restante := v_restante - v_descontar;
    END LOOP;
  END IF;

  IF v_total_reservado > 0 THEN
    v_liberar_restante := LEAST(p_cantidad, v_total_reservado);

    FOR v_row IN
      SELECT pe.id, COALESCE(pe.stock_reservado, 0)::numeric AS stock_reservado
      FROM public.producto_existencias pe
      WHERE pe.tenant_id = v_tenant
        AND pe.producto_id = p_producto_id
        AND COALESCE(pe.stock_reservado, 0) > 0
      ORDER BY pe.updated_at ASC, pe.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_liberar_restante <= 0;
      v_descontar := LEAST(v_row.stock_reservado, v_liberar_restante);

      UPDATE public.producto_existencias pe
      SET stock_reservado = GREATEST(COALESCE(pe.stock_reservado, 0) - v_descontar, 0),
          updated_at = now()
      WHERE pe.id = v_row.id;

      v_liberar_restante := v_liberar_restante - v_descontar;
    END LOOP;
  END IF;

  -- Descuento autoritativo en productos: NUNCA via SUM(existencias). Esto preserva el descuento
  -- aun cuando productos y producto_existencias esten desincronizados por flujos historicos.
  UPDATE public.productos p
  SET
    stock_actual = GREATEST(COALESCE(p.stock_actual, p.stock, 0)::numeric - p_cantidad, 0),
    stock = GREATEST(COALESCE(p.stock_actual, p.stock, 0)::numeric - p_cantidad, 0),
    stock_reservado = GREATEST(
      COALESCE(p.stock_reservado, 0)::numeric
        - LEAST(p_cantidad, COALESCE(p.stock_reservado, 0)::numeric),
      0
    ),
    updated_at = now()
  WHERE p.tenant_id = v_tenant
    AND p.id = p_producto_id;

  INSERT INTO public.movimientos_inventario (
    id,
    tenant_id,
    producto_id,
    tipo,
    cantidad,
    referencia_tipo,
    referencia_id,
    notas,
    stock_actual,
    stock_reservado,
    metadata,
    activo,
    estado,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    v_tenant,
    p_producto_id,
    'SALIDA',
    p_cantidad,
    v_ref_tipo,
    v_ref_id,
    COALESCE(p_notas, 'Salida de stock'),
    COALESCE(p.stock_actual, p.stock, 0)::text,
    COALESCE(p.stock_reservado, 0)::text,
    jsonb_build_object(
      'metodo_costeo', 'ULTIMO_COSTO',
      'costo_unitario', COALESCE(NULLIF(p.precio_compra, 0), NULLIF(p.costo, 0), 0),
      'valor_total', (p_cantidad * COALESCE(NULLIF(p.precio_compra, 0), NULLIF(p.costo, 0), 0))::numeric(14,2)
    ),
    true,
    'ACTIVO',
    now(),
    now()
  FROM public.productos p
  WHERE p.tenant_id = v_tenant
    AND p.id = p_producto_id
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

COMMENT ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) IS
  'Salida atomica de inventario: idempotente por referencia, descuenta producto_existencias granular y descuenta productos.stock_actual/stock_reservado de forma autoritativa (no recalculado via SUM, robusto a desincronizacion).';

COMMIT;
