\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_table text;
  v_bad_tables text[] := ARRAY[]::text[];
  v_tables text[] := ARRAY[
    'cotizaciones', 'cotizacion_detalles',
    'pedidos_venta', 'pedidos_venta_detalle', 'pedido_aprobaciones',
    'recepciones', 'recepcion_items',
    'ordenes_compra', 'orden_compra_detalles',
    'movimientos_inventario', 'producto_existencias',
    'documentos', 'documento_detalles', 'cpe',
    'cuentas_por_cobrar', 'cxc_pagos', 'outbox_events'
  ];
  v_view text;
  v_bad_views text[] := ARRAY[]::text[];
  v_views text[] := ARRAY[
    'vw_kardex_valorizado',
    'v_inventory_single_ledger_status_actual'
  ];
  v_base text;
  v_missing_base_grants text[] := ARRAY[]::text[];
  v_bases text[] := ARRAY[
    'movimientos_inventario', 'recepciones', 'productos', 'almacenes',
    'almacen_ubicaciones', 'ordenes_compra', 'producto_existencias', 'cajas'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL
       OR has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') THEN
      v_bad_tables := array_append(v_bad_tables, v_table);
    END IF;
  END LOOP;

  IF cardinality(v_bad_tables) > 0 THEN
    RAISE EXCEPTION 'Tablas operativas con DML de cliente o ausentes: %', v_bad_tables;
  END IF;

  FOREACH v_view IN ARRAY v_views LOOP
    IF to_regclass('public.' || v_view) IS NULL
       OR NOT coalesce(
         (SELECT c.reloptions
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = v_view AND c.relkind = 'v'),
         ARRAY[]::text[]
       ) @> ARRAY['security_invoker=true']
       OR has_table_privilege('anon', format('public.%I', v_view), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', v_view), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', v_view), 'SELECT') THEN
      v_bad_views := array_append(v_bad_views, v_view);
    END IF;
  END LOOP;

  IF cardinality(v_bad_views) > 0 THEN
    RAISE EXCEPTION 'Vistas operativas sin security_invoker/ACL service-only: %', v_bad_views;
  END IF;

  FOREACH v_base IN ARRAY v_bases LOOP
    IF NOT has_table_privilege('service_role', format('public.%I', v_base), 'SELECT') THEN
      v_missing_base_grants := array_append(v_missing_base_grants, v_base);
    END IF;
  END LOOP;

  IF cardinality(v_missing_base_grants) > 0 THEN
    RAISE EXCEPTION 'service_role no puede leer bases de vistas invoker: %', v_missing_base_grants;
  END IF;

  IF has_function_privilege(
       'anon', 'public.validar_inventory_single_ledger_runtime(uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.validar_inventory_single_ledger_runtime(uuid)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.validar_inventory_single_ledger_runtime(uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Diagnóstico de inventario no conserva ACL service-only';
  END IF;
END;
$$;

-- El catálogo no basta: el consumidor autorizado debe poder resolver ambas
-- vistas con seguridad invoker sin depender de grants implícitos del proyecto.
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM count(*) FROM public.vw_kardex_valorizado;
  PERFORM count(*) FROM public.v_inventory_single_ledger_status_actual;
END;
$$;
RESET ROLE;

ROLLBACK;
