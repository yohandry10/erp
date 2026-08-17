\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_496_SOLO_ERP_E2E:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_496_REQUIERE_POSTGRESQL_16';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $catalog$
DECLARE
  v_validated boolean;
BEGIN
  SELECT convalidated INTO v_validated
  FROM pg_constraint
  WHERE conrelid = 'public.ventas_consolidados'::regclass
    AND conname = 'ck_ventas_consolidados_count_469';

  IF v_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_496_BATCH_LIMIT_NOT_VALIDATED_ON_CLEAN_DB';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.ventas_consolidados'::regclass
      AND tgname = 'trg_guard_ventas_consolidado_max_10_496'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_496_BATCH_GUARD_MISSING';
  END IF;
  IF has_function_privilege('anon',
       'public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
        'public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)', 'EXECUTE')
     OR has_function_privilege('anon',
        'public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
        'public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
        'public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
        'app.crear_consolidado_ventas_impl_496(uuid,uuid,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
        'app.guard_ventas_consolidado_max_10_496()', 'EXECUTE')
     OR has_function_privilege('service_role',
        'app.product_unit_supported_496(text)', 'EXECUTE')
     OR has_function_privilege('service_role',
        'app.guard_product_unit_supported_496()', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_496_ACL_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.productos'::regclass
      AND tgname = 'trg_guard_product_unit_supported_496'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'VERIFY_496_PRODUCT_UNIT_GUARD_MISSING';
  END IF;
  IF strpos(pg_get_functiondef(
       'public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)'::regprocedure
     ), '''unidad_medida'', upper(COALESCE(') = 0
     OR strpos(pg_get_functiondef(
       'public.actualizar_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
     ), 'INVENTORY_MASTER_PRODUCT_UNIT_WITH_HISTORY_IMMUTABLE') = 0 THEN
    RAISE EXCEPTION 'VERIFY_496_PRODUCT_UNIT_CANONICAL_WRITER_NOT_PATCHED';
  END IF;
END;
$catalog$;

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_product uuid;
  v_product_kg uuid;
  v_today date;
  v_result jsonb;
  v_legacy_sources jsonb;
  v_legacy_fingerprint text;
  v_blocked boolean := false;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, pais, plan, activo, estado)
  VALUES (
    v_tenant, 'VERIFY-496-' || left(v_tenant::text, 8),
    'Verify commercial and kardex 496', 'PE', 'test', true, 'ACTIVO'
  );
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado, configuracion_completa
  ) VALUES (
    v_tenant, '20600000496', 'Empresa verify 496', 'PE', 'PEN', 'ACTIVO', true
  );
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES (
    v_actor, v_tenant, 'Actor', 'Verify 496',
    'actor-496-' || left(v_actor::text, 8) || '@local.invalid',
    'actor496', 'unused-local-hash', true, 'ACTIVO'
  ), (
    v_other_actor, v_tenant, 'Otro', 'Verify 496',
    'actor-other-496-' || left(v_other_actor::text, 8) || '@local.invalid',
    'actorother496', 'unused-local-hash', true, 'ACTIVO'
  );

  SELECT jsonb_agg(jsonb_build_object('tipo', 'POS', 'id', id) ORDER BY id)
    INTO v_legacy_sources
  FROM (SELECT gen_random_uuid() AS id FROM generate_series(1, 11)) s;
  v_legacy_fingerprint := app.commercial_fingerprint_469(jsonb_build_object(
    'fuentes', v_legacy_sources, 'notas', 'Legacy once 496'
  ));
  -- Simula una fila válida creada por 469 antes de instalar el límite 496. La
  -- rama sólo permite recuperar exactamente esta intención; nunca crear otra.
  ALTER TABLE public.ventas_consolidados
    DISABLE TRIGGER trg_guard_ventas_consolidado_max_10_496;
  ALTER TABLE public.ventas_consolidados
    DROP CONSTRAINT ck_ventas_consolidados_count_469;
  INSERT INTO public.ventas_consolidados (
    tenant_id, numero, fecha, moneda, cantidad_fuentes,
    subtotal, impuestos, total, notas, source_fingerprint,
    idempotency_key, created_by, snapshot
  ) VALUES (
    v_tenant, 'VC-2095-LEGACY11', DATE '2095-01-01', 'PEN', 11,
    100, 18, 118, 'Legacy once 496', v_legacy_fingerprint,
    'verify-496-legacy-eleven', v_actor,
    jsonb_build_object('fuentes', v_legacy_sources, 'snapshot_version', 469)
  );
  ALTER TABLE public.ventas_consolidados
    ADD CONSTRAINT ck_ventas_consolidados_count_469
    CHECK (cantidad_fuentes BETWEEN 1 AND 10) NOT VALID;
  ALTER TABLE public.ventas_consolidados
    ENABLE TRIGGER trg_guard_ventas_consolidado_max_10_496;

  v_result := public.crear_consolidado_ventas_tx(
    v_tenant, v_actor, 'verify-496-legacy-eleven',
    v_legacy_sources, 'Legacy once 496'
  );
  IF COALESCE((v_result->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_result #>> '{consolidado,cantidad_fuentes}')::integer <> 11 THEN
    RAISE EXCEPTION 'VERIFY_496_LEGACY_ELEVEN_REPLAY_NOT_RECOVERABLE:%', v_result;
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.crear_consolidado_ventas_tx(
      v_tenant, v_other_actor, 'verify-496-legacy-eleven',
      v_legacy_sources, 'Legacy once 496'
    );
  EXCEPTION WHEN unique_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'VERIFY_496_LEGACY_REPLAY_ACTOR_TAKEOVER_ACCEPTED';
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.crear_consolidado_ventas_tx(
      v_tenant, v_actor, 'verify-496-legacy-eleven',
      v_legacy_sources, 'Notas distintas 496'
    );
  EXCEPTION WHEN unique_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'VERIFY_496_LEGACY_REPLAY_PAYLOAD_MISMATCH_ACCEPTED';
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.crear_consolidado_ventas_tx(
      v_tenant, v_actor, 'verify-496-new-eleven-forbidden',
      v_legacy_sources, 'Legacy once 496'
    );
  EXCEPTION WHEN invalid_parameter_value THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'VERIFY_496_NEW_ELEVEN_BATCH_ACCEPTED';
  END IF;

  BEGIN
    INSERT INTO public.ventas_consolidados (
      tenant_id, numero, fecha, moneda, cantidad_fuentes,
      subtotal, impuestos, total, source_fingerprint,
      idempotency_key, created_by, snapshot
    ) VALUES (
      v_tenant, 'VC-496-INVALID', app.hoy_tenant(v_tenant), 'PEN', 11,
      0, 0, 0, encode(extensions.digest('verify-496-invalid', 'sha256'), 'hex'),
      'verify-496-invalid-eleven', v_actor, '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM LIKE '%COMMERCIAL_BATCH_MAX_TEN_REQUIRED%';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'VERIFY_496_ELEVEN_SOURCE_BATCH_ACCEPTED';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.crear_consolidado_ventas_tx(
      v_tenant,
      v_actor,
      'verify-496-writer-eleven',
      (
        SELECT jsonb_agg(jsonb_build_object('tipo', 'POS', 'id', gen_random_uuid()))
        FROM generate_series(1, 11)
      ),
      'Debe fallar antes de inspeccionar fuentes'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := SQLERRM LIKE '%COMMERCIAL_BATCH_MAX_TEN_REQUIRED%';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'VERIFY_496_WRITER_DID_NOT_REJECT_ELEVEN_EARLY';
  END IF;

  INSERT INTO public.almacenes (
    id, tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_warehouse, v_tenant, 'V496-A', 'Almacen 496', 'ACTIVO', true, true, 'PE'
  );

  PERFORM public.crear_categoria_producto_maestro_tx(
    v_tenant, v_actor, 'verify-496-category',
    jsonb_build_object('codigo', 'CAT-496', 'nombre', 'Verificacion 496')
  );

  SELECT (public.crear_producto_maestro_tx(
    v_tenant, v_actor, 'verify-496-product-niu',
    jsonb_build_object(
      'codigo', 'PROD-496', 'nombre', 'Producto kardex 496',
      'categoria', 'CAT-496', 'precio_venta', 30,
      'precio_compra', 20, 'afectacion_igv', '10',
      'unidad_medida', 'NIU', 'almacen_id', v_warehouse,
      'es_servicio', false, 'controla_stock', true
    )
  )->>'id')::uuid INTO v_product;

  v_today := app.hoy_tenant(v_tenant);

  INSERT INTO public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
    referencia_tipo, referencia_id, metadata, activo, estado, created_at
  ) VALUES
  (
    v_tenant, v_product, v_warehouse, 'ENTRADA', 'ENTRADA', 10,
    'OPENING_BALANCE_496', gen_random_uuid(),
    jsonb_build_object('costo_unitario', 20), true, 'ACTIVO',
    ((v_today - 10)::timestamp + time '12:00') AT TIME ZONE 'America/Lima'
  ),
  (
    v_tenant, v_product, v_warehouse, 'SALIDA', 'SALIDA', 3,
    'PERIOD_EXIT_496', gen_random_uuid(),
    jsonb_build_object('costo_unitario', 20), true, 'ACTIVO',
    ((v_today - 2)::timestamp + time '12:00') AT TIME ZONE 'America/Lima'
  );

  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, v_warehouse, v_today - 5, v_today, 100
  );

  IF jsonb_array_length(v_result->'data') <> 1
     OR (v_result #>> '{resumen,totalMovimientos}')::integer <> 1
     OR (v_result #>> '{resumen,totalEntradas}')::numeric <> 0
     OR (v_result #>> '{resumen,totalSalidas}')::numeric <> 3
     OR (v_result #>> '{resumen,saldoInicialCantidad}')::numeric <> 10
     OR (v_result #>> '{resumen,movimientoNetoCantidad}')::numeric <> -3
     OR (v_result #>> '{resumen,saldoCantidad}')::numeric <> 7
     OR (v_result #>> '{resumen,saldoInicialValorizadoBase}')::numeric <> 200
     OR (v_result #>> '{resumen,movimientoNetoValorizadoBase}')::numeric <> -60
     OR (v_result #>> '{resumen,saldoValorizadoBase}')::numeric <> 140
     OR (v_result #>> '{resumen,valorPorMoneda,PEN}')::numeric <> 140
     OR (v_result #>> '{resumen,movimientoValorPorMoneda,PEN}')::numeric <> -60
     OR (v_result #>> '{data,0,fechaLocal}')::date <> v_today - 2
     OR (v_result #>> '{data,0,saldoCantidadPosterior}')::numeric <> 7
     OR (v_result #>> '{data,0,saldoValorizadoBasePosterior}')::numeric <> 140 THEN
    RAISE EXCEPTION 'VERIFY_496_KARDEX_OPENING_OR_RUNNING_BALANCE_INVALID:%', v_result;
  END IF;

  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, v_warehouse, v_today + 1, v_today + 1, 100
  );
  IF jsonb_array_length(v_result->'data') <> 0
     OR (v_result #>> '{resumen,totalMovimientos}')::integer <> 0
     OR (v_result #>> '{resumen,saldoInicialCantidad}')::numeric <> 7
     OR (v_result #>> '{resumen,movimientoNetoCantidad}')::numeric <> 0
     OR (v_result #>> '{resumen,saldoCantidad}')::numeric <> 7
     OR (v_result #>> '{resumen,saldoValorizadoBase}')::numeric <> 140 THEN
    RAISE EXCEPTION 'VERIFY_496_EMPTY_PERIOD_LOST_CLOSING_BALANCE:%', v_result;
  END IF;

  SELECT (public.crear_producto_maestro_tx(
    v_tenant, v_actor, 'verify-496-product-kgm',
    jsonb_build_object(
      'codigo', 'PROD-KG-496', 'nombre', 'Producto kg kardex 496',
      'categoria', 'CAT-496', 'precio_venta', 10,
      'precio_compra', 5, 'afectacion_igv', '10',
      'unidad_medida', 'KGM', 'almacen_id', v_warehouse,
      'es_servicio', false, 'controla_stock', true
    )
  )->>'id')::uuid INTO v_product_kg;
  IF (SELECT unidad_medida FROM public.productos WHERE id = v_product_kg) <> 'KGM' THEN
    RAISE EXCEPTION 'VERIFY_496_PRODUCT_UNIT_NOT_PERSISTED_BY_CANONICAL_WRITER';
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.crear_producto_maestro_tx(
      v_tenant, v_actor, 'verify-496-product-invalid-unit',
      jsonb_build_object(
        'codigo', 'PROD-LOL-496', 'nombre', 'Unidad inventada 496',
        'categoria', 'CAT-496', 'precio_venta', 10,
        'precio_compra', 5, 'afectacion_igv', '10',
        'unidad_medida', 'LOL', 'almacen_id', v_warehouse,
        'es_servicio', false, 'controla_stock', true
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked
     OR EXISTS (
       SELECT 1 FROM public.productos
       WHERE tenant_id = v_tenant AND codigo = 'PROD-LOL-496'
     ) THEN
    RAISE EXCEPTION 'VERIFY_496_INVENTED_PRODUCT_UNIT_ACCEPTED';
  END IF;
  INSERT INTO public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
    referencia_tipo, referencia_id, metadata, activo, estado, created_at
  ) VALUES (
    v_tenant, v_product_kg, v_warehouse, 'ENTRADA', 'ENTRADA', 2,
    'SECOND_PRODUCT_496', gen_random_uuid(),
    jsonb_build_object('costo_unitario', 5), true, 'ACTIVO',
    ((v_today - 1)::timestamp + time '12:00') AT TIME ZONE 'America/Lima'
  );
  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, NULL, v_warehouse, NULL, v_today, 100
  );
  IF (v_result #> '{resumen,saldoCantidad}') IS DISTINCT FROM 'null'::jsonb
     OR (v_result #> '{resumen,totalEntradas}') IS DISTINCT FROM 'null'::jsonb
     OR (v_result #>> '{resumen,cantidadAgregable}')::boolean IS DISTINCT FROM false
     OR (v_result #>> '{resumen,productosEnSaldo}')::integer <> 2
     OR (v_result #>> '{resumen,unidadesEnSaldo}')::integer <> 2
     OR (v_result #>> '{resumen,saldoValorizadoBase}')::numeric <> 150 THEN
    RAISE EXCEPTION 'VERIFY_496_KARDEX_MIXED_PRODUCTS_SUMMED_QUANTITIES:%', v_result;
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.actualizar_producto_maestro_tx(
      v_tenant, v_actor, v_product_kg, 'verify-496-unit-history-immutable',
      jsonb_build_object('unidad_medida', 'LTR')
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM LIKE '%INVENTORY_MASTER_PRODUCT_UNIT_WITH_HISTORY_IMMUTABLE%';
  END;
  IF NOT v_blocked
     OR (SELECT unidad_medida FROM public.productos WHERE id = v_product_kg) <> 'KGM' THEN
    RAISE EXCEPTION 'VERIFY_496_PRODUCT_UNIT_HISTORY_WAS_REINTERPRETED';
  END IF;

  -- Un movimiento cuyo costo no puede reconstruirse vuelve incompleto todo el
  -- saldo por moneda. La API no debe publicar el subtotal conocido como si
  -- fuera el saldo valorizado completo.
  INSERT INTO public.movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
    referencia_tipo, referencia_id, metadata, activo, estado, created_at
  ) VALUES (
    v_tenant, v_product, v_warehouse, 'ENTRADA', 'ENTRADA', 1,
    'UNVALUED_496', gen_random_uuid(), '{}'::jsonb, true, 'ACTIVO',
    ((v_today - 1)::timestamp + time '13:00') AT TIME ZONE 'America/Lima'
  );
  v_result := public.reporte_kardex_valorizado_470(
    v_tenant, v_product, v_warehouse, NULL, v_today, 100
  );
  IF (v_result #>> '{resumen,resumenConfiable}')::boolean IS DISTINCT FROM false
     OR (v_result #> '{resumen,saldoValorizadoBase}') IS DISTINCT FROM 'null'::jsonb
     OR (v_result #> '{resumen,valorPorMoneda}') IS DISTINCT FROM 'null'::jsonb
     OR (v_result #> '{resumen,valorBasePorMoneda}') IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_496_PARTIAL_VALUE_EXPOSED_AS_COMPLETE_BALANCE:%', v_result;
  END IF;
END;
$verify$;

ROLLBACK;
