-- ============================================================================
-- 350__inventory_derived_product_stock_guard.sql
-- Impide que productos.stock_* vuelva a actuar como un segundo ledger.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_product_stock_is_derived_350()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_stock_actual numeric;
  v_stock_reservado numeric;
BEGIN
  IF COALESCE(NEW.es_servicio, false) OR NOT COALESCE(NEW.controla_stock, true) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.stock_actual, NEW.stock, 0)::numeric <> 0
      OR COALESCE(NEW.stock, NEW.stock_actual, 0)::numeric <> 0
      OR COALESCE(NEW.stock_reservado, 0)::numeric <> 0 THEN
      RAISE EXCEPTION 'PRODUCT_STOCK_MUST_BE_INITIALIZED_THROUGH_INVENTORY_WRITER';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stock_actual IS NOT DISTINCT FROM OLD.stock_actual
    AND NEW.stock IS NOT DISTINCT FROM OLD.stock
    AND NEW.stock_reservado IS NOT DISTINCT FROM OLD.stock_reservado THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_stock_actual, v_stock_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = NEW.tenant_id
    AND pe.producto_id = NEW.id;

  IF COALESCE(NEW.stock_actual, NEW.stock, 0)::numeric IS DISTINCT FROM v_stock_actual
    OR COALESCE(NEW.stock, NEW.stock_actual, 0)::numeric IS DISTINCT FROM v_stock_actual
    OR COALESCE(NEW.stock_reservado, 0)::numeric IS DISTINCT FROM v_stock_reservado THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_IS_DERIVED: use aplicar_movimiento_inventario_tx';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_stock_is_derived_350 ON public.productos;
CREATE TRIGGER trg_enforce_product_stock_is_derived_350
BEFORE INSERT OR UPDATE OF stock_actual, stock, stock_reservado, controla_stock, es_servicio
ON public.productos
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_stock_is_derived_350();

CREATE OR REPLACE FUNCTION public.liberar_stock_atomico(
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
  v_tenant_id uuid;
  v_almacen_id uuid;
  v_almacenes integer;
BEGIN
  SELECT p.tenant_id INTO v_tenant_id
  FROM public.productos p
  WHERE p.id = p_producto_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND: %', p_producto_id;
  END IF;

  IF NULLIF(p_referencia_id, '') IS NOT NULL THEN
    SELECT count(DISTINCT mi.almacen_id), (array_agg(DISTINCT mi.almacen_id))[1]
      INTO v_almacenes, v_almacen_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = v_tenant_id
      AND mi.producto_id = p_producto_id
      AND mi.tipo = 'RESERVA'
      AND mi.referencia_tipo = upper(NULLIF(btrim(COALESCE(p_referencia_tipo, '')), ''))
      AND mi.referencia_id = NULLIF(p_referencia_id, '')::uuid
      AND mi.almacen_id IS NOT NULL;
  END IF;

  IF COALESCE(v_almacenes, 0) = 0 THEN
    SELECT count(*), (array_agg(pe.almacen_id ORDER BY pe.almacen_id))[1]
      INTO v_almacenes, v_almacen_id
    FROM public.producto_existencias pe
    WHERE pe.tenant_id = v_tenant_id
      AND pe.producto_id = p_producto_id
      AND COALESCE(pe.stock_reservado, 0) >= p_cantidad;
  END IF;

  IF v_almacenes <> 1 OR v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_REQUIRED_OR_AMBIGUOUS_FOR_RELEASE: producto=% almacenes=%',
      p_producto_id, COALESCE(v_almacenes, 0);
  END IF;

  RETURN public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := v_almacen_id,
    p_tipo := 'LIBERACION',
    p_cantidad := p_cantidad,
    p_referencia_tipo := COALESCE(p_referencia_tipo, 'LIBERACION'),
    p_referencia_id := NULLIF(p_referencia_id, '')::uuid,
    p_notas := p_notas,
    p_metadata := jsonb_build_object('compatibility_rpc', 'liberar_stock_atomico')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_stock_en_almacen_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_delta numeric,
  p_referencia_tipo text DEFAULT 'AJUSTE',
  p_referencia_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_DELTA_INVALID';
  END IF;

  RETURN public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := p_almacen_id,
    p_tipo := CASE WHEN p_delta > 0 THEN 'ENTRADA' ELSE 'SALIDA' END,
    p_cantidad := abs(p_delta),
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := p_referencia_id,
    p_notas := p_notas,
    p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'business_movement_type', 'AJUSTE',
      'delta', p_delta,
      'compatibility_rpc', 'ajustar_stock_en_almacen_tx'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_stock_cotizacion(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_item record;
  v_liberados integer := 0;
BEGIN
  FOR v_item IN
    SELECT cd.producto_id, COALESCE(cd.cantidad, 0) AS cantidad
    FROM public.cotizacion_detalles cd
    JOIN public.cotizaciones c ON c.id = cd.cotizacion_id
    WHERE cd.cotizacion_id = p_cotizacion_id
      AND c.tenant_id = p_tenant_id
    ORDER BY cd.producto_id
  LOOP
    IF v_item.cantidad > 0 THEN
      PERFORM public.liberar_stock_atomico(
        v_item.producto_id,
        v_item.cantidad,
        'COTIZACION',
        p_cotizacion_id::text,
        'Liberacion por cotizacion'
      );
      v_liberados := v_liberados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'productos_liberados', v_liberados,
    'cotizacion_id', p_cotizacion_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ajustar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, text, uuid, text, jsonb
) TO service_role;

COMMENT ON FUNCTION app.enforce_product_stock_is_derived_350() IS
  'Rechaza saldos iniciales/directos y exige que productos.stock_* coincida con SUM(producto_existencias).';

COMMIT;

