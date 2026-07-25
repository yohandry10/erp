-- ============================================================================
-- 348__inventory_reservation_dispatch_single_writer.sql
-- Enruta reservas, liberaciones legacy y despacho por el writer canonico 347.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reservar_stock_en_almacen_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := p_almacen_id,
    p_tipo := 'RESERVA',
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := NULLIF(p_referencia_id, '')::uuid,
    p_notas := p_notas,
    p_metadata := COALESCE(p_metadata, '{}'::jsonb) ||
      jsonb_build_object('compatibility_rpc', 'reservar_stock_en_almacen_tx')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reservar_stock_atomico(
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

  SELECT count(*), (array_agg(pe.almacen_id ORDER BY pe.almacen_id))[1]
    INTO v_almacenes, v_almacen_id
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = v_tenant_id
    AND pe.producto_id = p_producto_id
    AND (COALESCE(pe.stock_actual, 0) - COALESCE(pe.stock_reservado, 0)) >= p_cantidad;

  IF v_almacenes <> 1 OR v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_REQUIRED_OR_AMBIGUOUS_FOR_RESERVATION: producto=% almacenes=%',
      p_producto_id, COALESCE(v_almacenes, 0);
  END IF;

  RETURN public.reservar_stock_en_almacen_tx(
    p_tenant_id := v_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := v_almacen_id,
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := p_referencia_id,
    p_notas := p_notas,
    p_metadata := jsonb_build_object('legacy_warehouse_resolution', 'single_candidate')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decrementar_stock_reservado(
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_almacen_id uuid;
  v_almacenes integer;
BEGIN
  IF p_producto_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_RELEASE_PARAMETERS_INVALID';
  END IF;

  SELECT p.tenant_id INTO v_tenant_id
  FROM public.productos p
  WHERE p.id = p_producto_id;

  SELECT count(*), (array_agg(pe.almacen_id ORDER BY pe.almacen_id))[1]
    INTO v_almacenes, v_almacen_id
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = v_tenant_id
    AND pe.producto_id = p_producto_id
    AND COALESCE(pe.stock_reservado, 0) >= p_cantidad;

  IF v_almacenes <> 1 OR v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_REQUIRED_OR_AMBIGUOUS_FOR_RELEASE: producto=% almacenes=%',
      p_producto_id, COALESCE(v_almacenes, 0);
  END IF;

  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := v_almacen_id,
    p_tipo := 'LIBERACION',
    p_cantidad := p_cantidad,
    p_referencia_tipo := 'LEGACY_RELEASE',
    p_notas := 'Liberacion por compatibilidad decrementar_stock_reservado',
    p_metadata := jsonb_build_object('compatibility_rpc', 'decrementar_stock_reservado')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.despachar_stock_en_almacen_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_cantidad_reservada numeric,
  p_referencia_tipo text,
  p_referencia_id uuid,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_liberar numeric := LEAST(GREATEST(COALESCE(p_cantidad_reservada, 0), 0), p_cantidad);
  v_salida_id uuid;
BEGIN
  IF v_liberar > 0 THEN
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := p_producto_id,
      p_almacen_id := p_almacen_id,
      p_tipo := 'LIBERACION',
      p_cantidad := v_liberar,
      p_referencia_tipo := COALESCE(p_referencia_tipo, 'DESPACHO') || '_LIBERACION',
      p_referencia_id := p_referencia_id,
      p_notas := p_notas,
      p_ubicacion_id := p_ubicacion_id,
      p_lote := p_lote,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('atomic_rpc', 'despachar_stock_en_almacen_tx')
    );
  END IF;

  v_salida_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := p_almacen_id,
    p_tipo := 'SALIDA',
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := p_referencia_id,
    p_notas := p_notas,
    p_ubicacion_id := p_ubicacion_id,
    p_lote := p_lote,
    p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'atomic_rpc', 'despachar_stock_en_almacen_tx',
      'cantidad_reserva_liberada', v_liberar
    )
  );

  RETURN v_salida_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, text, text, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.despachar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.despachar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, uuid, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.reservar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, text, text, text, jsonb
) IS 'Reserva fisica explicita por almacen mediante aplicar_movimiento_inventario_tx.';
COMMENT ON FUNCTION public.despachar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, uuid, text, jsonb
) IS 'Libera la reserva aplicable y registra la salida en una unica transaccion y almacen.';

COMMIT;

