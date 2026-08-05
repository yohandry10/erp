-- Alta transaccional de productos y endurecimiento del catálogo de categorías.
-- Evita productos parciales cuando falla el stock inicial, la reserva o un
-- precio por sucursal, y cierra carreras de códigos duplicados por tenant.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.productos p
    WHERE p.tenant_id IS NOT NULL
      AND NULLIF(btrim(p.codigo), '') IS NOT NULL
    GROUP BY p.tenant_id, lower(btrim(p.codigo))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear la unicidad de productos: hay codigos duplicados dentro de un tenant'
      USING ERRCODE = '23505';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_tenant_codigo_ci
ON public.productos (tenant_id, lower(btrim(codigo)))
WHERE tenant_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL;

ALTER TABLE public.categorias_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categorias_producto_tenant_isolation ON public.categorias_producto;
DROP POLICY IF EXISTS categorias_producto_insert ON public.categorias_producto;
DROP POLICY IF EXISTS categorias_producto_update ON public.categorias_producto;
DROP POLICY IF EXISTS categorias_producto_delete ON public.categorias_producto;

CREATE POLICY categorias_producto_tenant_isolation ON public.categorias_producto
FOR SELECT
USING (
  app.is_superadmin()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id = app.current_tenant_id()
  )
);

CREATE POLICY categorias_producto_insert ON public.categorias_producto
FOR INSERT
WITH CHECK (
  app.is_superadmin()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id = app.current_tenant_id()
  )
);

CREATE POLICY categorias_producto_update ON public.categorias_producto
FOR UPDATE
USING (
  app.is_superadmin()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id = app.current_tenant_id()
  )
)
WITH CHECK (
  app.is_superadmin()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id = app.current_tenant_id()
  )
);

CREATE POLICY categorias_producto_delete ON public.categorias_producto
FOR DELETE
USING (
  app.is_superadmin()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id = app.current_tenant_id()
  )
);

CREATE OR REPLACE FUNCTION public.crear_producto_inventario_tx(
  p_tenant_id uuid,
  p_producto jsonb,
  p_almacen_id uuid DEFAULT NULL,
  p_stock_inicial numeric DEFAULT 0,
  p_stock_reservado numeric DEFAULT 0,
  p_precios_sucursal jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_producto public.productos;
  v_codigo text := NULLIF(btrim(COALESCE(p_producto->>'codigo', '')), '');
  v_nombre text := NULLIF(btrim(COALESCE(p_producto->>'nombre', '')), '');
  v_categoria text := NULLIF(btrim(COALESCE(p_producto->>'categoria', '')), '');
  v_es_servicio boolean := COALESCE((p_producto->>'es_servicio')::boolean, false);
  v_controla_stock boolean := COALESCE((p_producto->>'controla_stock')::boolean, true);
  v_precio record;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_TENANT_NOT_FOUND';
  END IF;

  IF v_codigo IS NULL OR v_nombre IS NULL OR v_categoria IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_REQUIRED_FIELDS';
  END IF;

  IF p_stock_inicial < 0 OR p_stock_reservado < 0 THEN
    RAISE EXCEPTION 'INVENTORY_INITIAL_STOCK_NEGATIVE';
  END IF;

  IF v_es_servicio THEN
    v_controla_stock := false;
  END IF;

  IF NOT v_controla_stock AND (p_stock_inicial <> 0 OR p_stock_reservado <> 0) THEN
    RAISE EXCEPTION 'INVENTORY_NON_STOCK_PRODUCT_WITH_INITIAL_STOCK';
  END IF;

  IF v_controla_stock AND (p_stock_inicial > 0 OR p_stock_reservado > 0) THEN
    IF p_almacen_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.almacenes a
      WHERE a.id = p_almacen_id
        AND a.tenant_id = p_tenant_id
        AND COALESCE(a.activo, true)
    ) THEN
      RAISE EXCEPTION 'INVENTORY_WAREHOUSE_NOT_FOUND_IN_TENANT';
    END IF;
  END IF;

  IF p_stock_reservado > p_stock_inicial THEN
    RAISE EXCEPTION 'INVENTORY_INITIAL_RESERVATION_EXCEEDS_STOCK';
  END IF;

  IF jsonb_typeof(COALESCE(p_precios_sucursal, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVENTORY_BRANCH_PRICES_MUST_BE_ARRAY';
  END IF;

  INSERT INTO public.productos (
    tenant_id,
    codigo,
    nombre,
    descripcion,
    precio_venta,
    precio_compra,
    stock_actual,
    stock,
    categoria,
    activo,
    codigo_barras,
    stock_minimo,
    stock_reservado,
    impuesto,
    es_servicio,
    controla_stock,
    afectacion_igv,
    tipo_operacion,
    clasificador_sunat,
    favorito,
    imagen_url,
    atributos_extra
  ) VALUES (
    p_tenant_id,
    v_codigo,
    v_nombre,
    NULLIF(btrim(p_producto->>'descripcion'), ''),
    app.to_numeric_or_zero(p_producto->>'precio_venta'),
    app.to_numeric_or_zero(p_producto->>'precio_compra'),
    0,
    0,
    v_categoria,
    true,
    COALESCE(NULLIF(btrim(p_producto->>'codigo_barras'), ''), v_codigo),
    app.to_numeric_or_zero(p_producto->>'stock_minimo'),
    0,
    app.to_numeric_or_zero(p_producto->>'impuesto'),
    v_es_servicio,
    v_controla_stock,
    COALESCE(NULLIF(btrim(p_producto->>'afectacion_igv'), ''), '10'),
    NULLIF(btrim(p_producto->>'tipo_operacion'), ''),
    NULLIF(btrim(p_producto->>'clasificador_sunat'), ''),
    COALESCE((p_producto->>'favorito')::boolean, false),
    COALESCE(p_producto->>'imagen_url', ''),
    CASE
      WHEN jsonb_typeof(p_producto->'atributos_extra') = 'object'
        THEN p_producto->'atributos_extra'
      ELSE '{}'::jsonb
    END
  )
  RETURNING * INTO v_producto;

  IF v_controla_stock AND p_stock_inicial > 0 THEN
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_producto.id,
      p_almacen_id := p_almacen_id,
      p_tipo := 'ENTRADA',
      p_cantidad := p_stock_inicial,
      p_referencia_tipo := 'PRODUCTO_STOCK_INICIAL',
      p_referencia_id := v_producto.id,
      p_notas := 'Stock inicial del producto',
      p_metadata := jsonb_build_object(
        'source', 'crear_producto_inventario_tx',
        'costo_unitario', app.to_numeric_or_zero(p_producto->>'precio_compra')
      )
    );
  END IF;

  IF v_controla_stock AND p_stock_reservado > 0 THEN
    PERFORM public.reservar_stock_en_almacen_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_producto.id,
      p_almacen_id := p_almacen_id,
      p_cantidad := p_stock_reservado,
      p_referencia_tipo := 'PRODUCTO_RESERVA_INICIAL',
      p_referencia_id := v_producto.id::text,
      p_notas := 'Reserva inicial del producto',
      p_metadata := jsonb_build_object('source', 'crear_producto_inventario_tx')
    );
  END IF;

  FOR v_precio IN
    SELECT x.sucursal_id,
           upper(COALESCE(NULLIF(btrim(x.moneda), ''), 'PEN')) AS moneda,
           COALESCE(x.precio, 0) AS precio,
           COALESCE(x.activo, true) AS activo
    FROM jsonb_to_recordset(COALESCE(p_precios_sucursal, '[]'::jsonb))
      AS x(sucursal_id uuid, moneda text, precio numeric, activo boolean)
  LOOP
    IF v_precio.sucursal_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.sucursales s
      WHERE s.id = v_precio.sucursal_id
        AND s.tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'INVENTORY_BRANCH_PRICE_TENANT_MISMATCH';
    END IF;
    IF v_precio.precio < 0 THEN
      RAISE EXCEPTION 'INVENTORY_BRANCH_PRICE_NEGATIVE';
    END IF;

    INSERT INTO public.producto_precios_sucursal (
      tenant_id, producto_id, sucursal_id, moneda, precio, activo,
      estado, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_producto.id, v_precio.sucursal_id, v_precio.moneda,
      v_precio.precio, v_precio.activo, 'ACTIVO',
      jsonb_build_object('source', 'crear_producto_inventario_tx'), now(), now()
    )
    ON CONFLICT (producto_id, sucursal_id, moneda)
    DO UPDATE SET
      precio = EXCLUDED.precio,
      activo = EXCLUDED.activo,
      updated_at = now();
  END LOOP;

  SELECT p.* INTO v_producto
  FROM public.productos p
  WHERE p.id = v_producto.id AND p.tenant_id = p_tenant_id;

  RETURN to_jsonb(v_producto);
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_producto_inventario_tx(
  uuid, jsonb, uuid, numeric, numeric, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_producto_inventario_tx(
  uuid, jsonb, uuid, numeric, numeric, jsonb
) TO service_role;

COMMENT ON FUNCTION public.crear_producto_inventario_tx(
  uuid, jsonb, uuid, numeric, numeric, jsonb
) IS 'Crea producto, stock/reserva inicial y precios por sucursal en una sola transaccion.';

COMMIT;
