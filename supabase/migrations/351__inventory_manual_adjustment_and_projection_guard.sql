-- ============================================================================
-- 351__inventory_manual_adjustment_and_projection_guard.sql
-- Cierra las ultimas escrituras paralelas de saldo:
--   * ajuste absoluto de una existencia mediante el writer canonico;
--   * producto_stock_sucursal queda como proyeccion derivada, no ledger;
--   * cajas.almacen_id queda validado tras la limpieza controlada de DEV.
-- ============================================================================

BEGIN;

ALTER TABLE public.cajas
  VALIDATE CONSTRAINT ck_cajas_almacen_required_runtime_347;

CREATE OR REPLACE FUNCTION public.establecer_stock_en_almacen_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_stock_objetivo numeric,
  p_reservado_objetivo numeric DEFAULT NULL,
  p_referencia_tipo text DEFAULT 'AJUSTE_MANUAL',
  p_referencia_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_created_by text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_existencia public.producto_existencias;
  v_stock_actual numeric := 0;
  v_reservado_actual numeric := 0;
  v_reservado_objetivo numeric;
  v_referencia_id uuid := COALESCE(p_referencia_id, gen_random_uuid());
BEGIN
  IF p_tenant_id IS NULL OR p_producto_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_IDS_REQUIRED';
  END IF;
  IF p_stock_objetivo IS NULL OR p_stock_objetivo < 0 THEN
    RAISE EXCEPTION 'INVENTORY_TARGET_STOCK_INVALID';
  END IF;

  PERFORM 1
  FROM public.productos p
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND_OR_TENANT_MISMATCH: %', p_producto_id;
  END IF;

  SELECT pe.* INTO v_existencia
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = p_tenant_id
    AND pe.producto_id = p_producto_id
    AND pe.almacen_id = p_almacen_id
  FOR UPDATE;

  IF FOUND THEN
    v_stock_actual := COALESCE(v_existencia.stock_actual, 0);
    v_reservado_actual := COALESCE(v_existencia.stock_reservado, 0);
  END IF;

  v_reservado_objetivo := COALESCE(p_reservado_objetivo, v_reservado_actual);
  IF v_reservado_objetivo < 0 OR v_reservado_objetivo > p_stock_objetivo THEN
    RAISE EXCEPTION 'INVENTORY_TARGET_RESERVATION_INVALID: stock=% reservado=%',
      p_stock_objetivo, v_reservado_objetivo;
  END IF;

  -- Primero libera reservas para que una reduccion de stock nunca deje
  -- reservado > stock. Despues ajusta stock y finalmente crea reservas nuevas.
  IF v_reservado_objetivo < v_reservado_actual THEN
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id, p_producto_id, p_almacen_id, 'LIBERACION',
      v_reservado_actual - v_reservado_objetivo,
      p_referencia_tipo, v_referencia_id, p_notas,
      p_created_by := p_created_by,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'establecer_stock_en_almacen_tx', 'target_reserved', v_reservado_objetivo
      )
    );
  END IF;

  IF p_stock_objetivo < v_stock_actual THEN
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id, p_producto_id, p_almacen_id, 'SALIDA',
      v_stock_actual - p_stock_objetivo,
      p_referencia_tipo, v_referencia_id, p_notas,
      p_created_by := p_created_by,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'establecer_stock_en_almacen_tx', 'target_stock', p_stock_objetivo
      )
    );
  ELSIF p_stock_objetivo > v_stock_actual THEN
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id, p_producto_id, p_almacen_id, 'ENTRADA',
      p_stock_objetivo - v_stock_actual,
      p_referencia_tipo, v_referencia_id, p_notas,
      p_created_by := p_created_by,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'establecer_stock_en_almacen_tx', 'target_stock', p_stock_objetivo
      )
    );
  END IF;

  IF v_reservado_objetivo > v_reservado_actual THEN
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id, p_producto_id, p_almacen_id, 'RESERVA',
      v_reservado_objetivo - v_reservado_actual,
      p_referencia_tipo, v_referencia_id, p_notas,
      p_created_by := p_created_by,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'establecer_stock_en_almacen_tx', 'target_reserved', v_reservado_objetivo
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'producto_id', p_producto_id,
    'almacen_id', p_almacen_id,
    'stock_actual', p_stock_objetivo,
    'stock_reservado', v_reservado_objetivo,
    'referencia_id', v_referencia_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.establecer_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.establecer_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION app.enforce_product_stock_is_derived_350()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_stock_actual numeric;
  v_stock_reservado numeric;
BEGIN
  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_stock_actual, v_stock_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = NEW.tenant_id
    AND pe.producto_id = NEW.id;

  IF TG_OP = 'INSERT' THEN
    v_stock_actual := 0;
    v_stock_reservado := 0;
  END IF;

  IF COALESCE(NEW.stock_actual, NEW.stock, 0)::numeric IS DISTINCT FROM v_stock_actual
    OR COALESCE(NEW.stock, NEW.stock_actual, 0)::numeric IS DISTINCT FROM v_stock_actual
    OR COALESCE(NEW.stock_reservado, 0)::numeric IS DISTINCT FROM v_stock_reservado THEN
    RAISE EXCEPTION 'PRODUCT_STOCK_IS_DERIVED: use aplicar_movimiento_inventario_tx';
  END IF;

  IF (COALESCE(NEW.es_servicio, false) OR NOT COALESCE(NEW.controla_stock, true))
    AND (v_stock_actual <> 0 OR v_stock_reservado <> 0) THEN
    RAISE EXCEPTION 'PRODUCT_WITH_PHYSICAL_STOCK_CANNOT_DISABLE_STOCK_CONTROL';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_producto_stock_sucursal_from_existence_351()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE public.producto_stock_sucursal pss
  SET stock = NEW.stock_actual,
      stock_actual = NEW.stock_actual,
      reservado = NEW.stock_reservado,
      updated_at = now(),
      metadata = COALESCE(pss.metadata, '{}'::jsonb) || jsonb_build_object(
        'projection_source', 'producto_existencias',
        'existencia_id', NEW.id
      )
  WHERE pss.tenant_id = NEW.tenant_id
    AND pss.producto_id = NEW.producto_id
    AND pss.almacen_id = NEW.almacen_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producto_stock_sucursal_from_existence_351
  ON public.producto_existencias;
CREATE TRIGGER trg_sync_producto_stock_sucursal_from_existence_351
AFTER INSERT OR UPDATE OF stock_actual, stock_reservado
ON public.producto_existencias
FOR EACH ROW EXECUTE FUNCTION app.sync_producto_stock_sucursal_from_existence_351();

CREATE OR REPLACE FUNCTION app.enforce_producto_stock_sucursal_projection_351()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_stock numeric;
  v_reservado numeric;
BEGIN
  IF NEW.almacen_id IS NULL THEN
    IF COALESCE(NEW.stock_actual, NEW.stock, 0) <> 0 OR COALESCE(NEW.reservado, 0) <> 0 THEN
      RAISE EXCEPTION 'BRANCH_STOCK_PROJECTION_REQUIRES_WAREHOUSE';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(pe.stock_actual, 0), COALESCE(pe.stock_reservado, 0)
    INTO v_stock, v_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = NEW.tenant_id
    AND pe.producto_id = NEW.producto_id
    AND pe.almacen_id = NEW.almacen_id;

  IF NOT FOUND THEN
    v_stock := 0;
    v_reservado := 0;
  END IF;

  IF COALESCE(NEW.stock_actual, NEW.stock, 0)::numeric IS DISTINCT FROM v_stock
    OR COALESCE(NEW.stock, NEW.stock_actual, 0)::numeric IS DISTINCT FROM v_stock
    OR COALESCE(NEW.reservado, 0)::numeric IS DISTINCT FROM v_reservado THEN
    RAISE EXCEPTION 'BRANCH_STOCK_IS_DERIVED_FROM_WAREHOUSE_EXISTENCE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_producto_stock_sucursal_projection_351
  ON public.producto_stock_sucursal;
CREATE TRIGGER trg_enforce_producto_stock_sucursal_projection_351
BEFORE INSERT OR UPDATE OF stock, stock_actual, reservado, almacen_id, producto_id, tenant_id
ON public.producto_stock_sucursal
FOR EACH ROW EXECUTE FUNCTION app.enforce_producto_stock_sucursal_projection_351();

COMMENT ON FUNCTION public.establecer_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, text, jsonb
) IS 'Ajuste absoluto atomico que compone movimientos canonicos; no escribe saldos paralelos.';

COMMIT;
