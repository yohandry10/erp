\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_registrar_venta_full_tx'
  LIMIT 1;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: falta pos_registrar_venta_full_tx';
  END IF;

  IF v_definition NOT ILIKE '%aplicar_movimiento_inventario_tx%' THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: POS no usa aplicar_movimiento_inventario_tx';
  END IF;

  IF v_definition NOT ILIKE '%almacen_id%' THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: POS no resuelve el almacen de la caja';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'aplicar_movimiento_inventario_tx'
  ) THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: falta la primitiva canonica de inventario';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.pos_registrar_venta_full_tx_legacy_327(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,text,numeric,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: la implementacion POS legacy sigue siendo invocable directamente';
  END IF;

  IF v_definition NOT ILIKE '%inventory_pos_legacy_bridge%'
    OR v_definition NOT ILIKE '%set_config%off%' THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: el puente POS legacy no esta encapsulado en la transaccion canonica';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.productos'::regclass
      AND tgname = 'trg_enforce_product_stock_is_derived_350'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: falta guarda de stock derivado en productos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.producto_stock_sucursal'::regclass
      AND tgname = 'trg_enforce_producto_stock_sucursal_projection_351'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: producto_stock_sucursal no esta protegido como proyeccion';
  END IF;
END;
$$;

DO $$
DECLARE
  v_tenant_id uuid;
  v_producto_id uuid;
  v_almacen_id uuid;
  v_stock numeric;
  v_reservado numeric;
  v_rejected boolean := false;
BEGIN
  SELECT pe.tenant_id, pe.producto_id, pe.almacen_id,
         pe.stock_actual, pe.stock_reservado
    INTO v_tenant_id, v_producto_id, v_almacen_id, v_stock, v_reservado
  FROM public.producto_existencias pe
  JOIN public.productos p ON p.id = pe.producto_id AND p.tenant_id = pe.tenant_id
  WHERE NOT COALESCE(p.es_servicio, false)
    AND COALESCE(p.controla_stock, true)
  ORDER BY pe.created_at
  LIMIT 1;

  IF v_producto_id IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: se requiere al menos una existencia real para prueba no vacua';
  END IF;

  PERFORM public.establecer_stock_en_almacen_tx(
    v_tenant_id, v_producto_id, v_almacen_id,
    v_stock + 1, v_reservado,
    'QA_CONTRACT', gen_random_uuid(), 'Prueba transaccional del contrato',
    'qa', jsonb_build_object('rollback', true)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.productos p
    JOIN public.producto_existencias pe
      ON pe.tenant_id = p.tenant_id AND pe.producto_id = p.id
    WHERE p.id = v_producto_id
      AND pe.almacen_id = v_almacen_id
      AND p.stock_actual = v_stock + 1
      AND pe.stock_actual = v_stock + 1
  ) THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: ajuste canonico no sincronizo existencia y agregado';
  END IF;

  BEGIN
    UPDATE public.productos
    SET stock_actual = stock_actual + 1,
        stock = stock_actual + 1
    WHERE id = v_producto_id;
  EXCEPTION WHEN OTHERS THEN
    v_rejected := SQLERRM LIKE 'PRODUCT_STOCK_IS_DERIVED:%';
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: productos acepto una escritura directa de saldo';
  END IF;
END;
$$;

DO $$
DECLARE
  v_failed bigint;
BEGIN
  SELECT count(*)
    INTO v_failed
  FROM public.validar_inventory_single_ledger_runtime(NULL)
  WHERE NOT ok;

  IF v_failed <> 0 THEN
    RAISE EXCEPTION 'CONTRACT_FAIL: validar_inventory_single_ledger_runtime reporta % checks fallidos', v_failed;
  END IF;
END;
$$;

SELECT check_name, ok, detail
FROM public.validar_inventory_single_ledger_runtime(NULL)
ORDER BY check_name;

ROLLBACK;
