BEGIN;

-- Reconcilia el saldo agregado de productos con las existencias fisicas por almacen.
WITH existencia_totales AS (
  SELECT
    pe.tenant_id,
    pe.producto_id,
    SUM(COALESCE(pe.stock_actual, 0))::numeric(14,2) AS stock_actual,
    SUM(COALESCE(pe.stock_reservado, 0))::numeric(14,2) AS stock_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id IS NOT NULL
    AND pe.producto_id IS NOT NULL
  GROUP BY pe.tenant_id, pe.producto_id
)
UPDATE public.productos p
SET
  stock_actual = e.stock_actual,
  stock = e.stock_actual,
  stock_reservado = e.stock_reservado,
  updated_at = now()
FROM existencia_totales e
WHERE p.tenant_id = e.tenant_id
  AND p.id = e.producto_id
  AND (
    COALESCE(p.stock_actual, p.stock, 0)::numeric IS DISTINCT FROM e.stock_actual
    OR COALESCE(p.stock_reservado, 0)::numeric IS DISTINCT FROM e.stock_reservado
  );

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
  v_restante numeric := p_cantidad;
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

  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_total_existencias, v_total_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = v_tenant
    AND pe.producto_id = p_producto_id;

  IF v_total_existencias > 0 OR v_total_reservado > 0 THEN
    IF v_total_existencias < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en existencias por almacen';
    END IF;

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

    IF v_restante > 0 THEN
      RAISE EXCEPTION 'No se pudo aplicar la salida a existencias por almacen';
    END IF;

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

    UPDATE public.productos p
    SET
      stock_actual = COALESCE(t.stock_actual, 0),
      stock = COALESCE(t.stock_actual, 0),
      stock_reservado = COALESCE(t.stock_reservado, 0),
      updated_at = now()
    FROM (
      SELECT
        pe.producto_id,
        SUM(COALESCE(pe.stock_actual, 0))::numeric(14,2) AS stock_actual,
        SUM(COALESCE(pe.stock_reservado, 0))::numeric(14,2) AS stock_reservado
      FROM public.producto_existencias pe
      WHERE pe.tenant_id = v_tenant
        AND pe.producto_id = p_producto_id
      GROUP BY pe.producto_id
    ) t
    WHERE p.tenant_id = v_tenant
      AND p.id = p_producto_id;
  ELSE
    UPDATE public.productos p
    SET
      stock_actual = GREATEST(COALESCE(p.stock_actual, p.stock, 0)::numeric - p_cantidad, 0),
      stock = GREATEST(COALESCE(p.stock_actual, p.stock, 0)::numeric - p_cantidad, 0),
      stock_reservado = GREATEST(COALESCE(p.stock_reservado, 0)::numeric - p_cantidad, 0),
      updated_at = now()
    WHERE p.tenant_id = v_tenant
      AND p.id = p_producto_id;
  END IF;

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

UPDATE public.movimientos_inventario mi
SET metadata = COALESCE(mi.metadata, '{}'::jsonb) || jsonb_build_object(
    'metodo_costeo', COALESCE(mi.metadata->>'metodo_costeo', 'ULTIMO_COSTO'),
    'costo_unitario', COALESCE(NULLIF(p.precio_compra, 0), NULLIF(p.costo, 0), 0),
    'valor_total', (COALESCE(mi.cantidad, 0) * COALESCE(NULLIF(p.precio_compra, 0), NULLIF(p.costo, 0), 0))::numeric(14,2)
  ),
  updated_at = now()
FROM public.productos p
WHERE mi.tenant_id = p.tenant_id
  AND mi.producto_id = p.id
  AND mi.tipo IN ('SALIDA', 'DEVOLUCION', 'AJUSTE')
  AND (
    mi.metadata IS NULL
    OR NOT (mi.metadata ? 'costo_unitario')
    OR NOT (mi.metadata ? 'valor_total')
  );

CREATE OR REPLACE FUNCTION public.validar_inventory_stock_reconciliation_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  WITH existencia_totales AS (
    SELECT
      pe.tenant_id,
      pe.producto_id,
      SUM(COALESCE(pe.stock_actual, 0))::numeric(14,2) AS stock_actual,
      SUM(COALESCE(pe.stock_reservado, 0))::numeric(14,2) AS stock_reservado
    FROM public.producto_existencias pe
    WHERE pe.tenant_id IS NOT NULL
      AND pe.producto_id IS NOT NULL
      AND (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id)
    GROUP BY pe.tenant_id, pe.producto_id
  )
  SELECT COUNT(*)
    INTO v_count
  FROM existencia_totales e
  JOIN public.productos p
    ON p.tenant_id = e.tenant_id
   AND p.id = e.producto_id
  WHERE COALESCE(p.stock_actual, p.stock, 0)::numeric IS DISTINCT FROM e.stock_actual
     OR COALESCE(p.stock_reservado, 0)::numeric IS DISTINCT FROM e.stock_reservado;

  RETURN QUERY SELECT
    'productos_vs_existencias_reconciliado'::text,
    v_count = 0,
    format('%s productos con stock agregado distinto a existencias', v_count);

  SELECT COUNT(*)
    INTO v_count
  FROM public.productos p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      COALESCE(p.stock_actual, p.stock, 0)::numeric < 0
      OR COALESCE(p.stock_reservado, 0)::numeric < 0
      OR COALESCE(p.stock_reservado, 0)::numeric > COALESCE(p.stock_actual, p.stock, 0)::numeric
    );

  RETURN QUERY SELECT
    'productos_stock_no_negativo_y_reserva_valida'::text,
    v_count = 0,
    format('%s productos con saldos negativos o reserva mayor al stock', v_count);

  SELECT COUNT(*)
    INTO v_count
  FROM public.movimientos_inventario mi
  LEFT JOIN public.productos p
    ON p.tenant_id = mi.tenant_id
   AND p.id = mi.producto_id
  WHERE (p_tenant_id IS NULL OR mi.tenant_id = p_tenant_id)
    AND mi.tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION')
    AND (mi.tenant_id IS NULL OR mi.producto_id IS NULL OR p.id IS NULL);

  RETURN QUERY SELECT
    'movimientos_fisicos_con_producto_tenant'::text,
    v_count = 0,
    format('%s movimientos fisicos sin producto/tenant valido', v_count);

  SELECT COUNT(*)
    INTO v_count
  FROM (
    SELECT mi.tenant_id, mi.producto_id, mi.tipo, mi.referencia_tipo, mi.referencia_id, COUNT(*) AS total
    FROM public.movimientos_inventario mi
    WHERE (p_tenant_id IS NULL OR mi.tenant_id = p_tenant_id)
      AND mi.tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION')
      AND mi.referencia_tipo IS NOT NULL
      AND mi.referencia_id IS NOT NULL
    GROUP BY mi.tenant_id, mi.producto_id, mi.tipo, mi.referencia_tipo, mi.referencia_id
    HAVING COUNT(*) > 1
  ) duplicados;

  RETURN QUERY SELECT
    'movimientos_fisicos_sin_duplicado_por_referencia'::text,
    v_count = 0,
    format('%s grupos duplicados por tenant/producto/tipo/referencia', v_count);

  SELECT COUNT(*)
    INTO v_count
  FROM public.movimientos_inventario mi
  WHERE (p_tenant_id IS NULL OR mi.tenant_id = p_tenant_id)
    AND mi.tipo IN ('SALIDA', 'DEVOLUCION', 'AJUSTE')
    AND (
      mi.metadata IS NULL
      OR NOT (mi.metadata ? 'metodo_costeo')
      OR NOT (mi.metadata ? 'costo_unitario')
      OR NOT (mi.metadata ? 'valor_total')
    );

  RETURN QUERY SELECT
    'salidas_con_costo_trazable'::text,
    v_count = 0,
    format('%s salidas/devoluciones/ajustes sin costo trazable en metadata', v_count);

  RETURN QUERY SELECT
    'rpc_salida_actualiza_existencias'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'descontar_stock_y_liberar_reserva'
        AND pg_get_functiondef(p.oid) ILIKE '%producto_existencias%'
    ),
    'RPC descontar_stock_y_liberar_reserva contiene actualizacion de producto_existencias';
END;
$$;

CREATE OR REPLACE VIEW public.v_inventory_stock_reconciliation_status_actual AS
SELECT *
FROM public.validar_inventory_stock_reconciliation_runtime(NULL);

COMMENT ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) IS
  'Salida atomica de inventario: idempotente por referencia, descuenta producto_existencias, recalcula productos y registra movimiento fisico.';
COMMENT ON FUNCTION public.validar_inventory_stock_reconciliation_runtime(uuid) IS
  'Valida reconciliacion inventario/productos/existencias y duplicados fisicos por referencia.';

COMMIT;
