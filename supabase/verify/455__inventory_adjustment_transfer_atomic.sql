\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_455_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localqaerpephemeralx',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

CREATE FUNCTION app.verify_455_fail_outbox()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.event_type = 'ajuste.inventario.aplicado'
     AND NEW.payload->>'motivo' = 'FAIL-OUTBOX-455' THEN
    RAISE EXCEPTION 'VERIFY_455_FALLO_INDUCIDO';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_verify_455_fail_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_455_fail_outbox();

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_tenant_ajeno uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_actor_ajeno uuid := gen_random_uuid();
  v_almacen_a uuid := gen_random_uuid();
  v_almacen_b uuid := gen_random_uuid();
  v_producto uuid;
  v_producto_rollback uuid;
  v_servicio uuid;
  v_result jsonb;
  v_retry jsonb;
  v_failed boolean;
  v_before integer;
  v_after integer;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, activo, estado)
  VALUES
    (v_tenant, 'V455-' || left(v_tenant::text, 8), 'Verify inventario 455', true, 'ACTIVO'),
    (v_tenant_ajeno, 'V455-' || left(v_tenant_ajeno::text, 8), 'Verify ajeno 455', true, 'ACTIVO');

  INSERT INTO public.usuarios_sistema (id, tenant_id, email, activo, estado)
  VALUES
    (v_actor, v_tenant, 'v455-' || v_actor || '@example.test', true, 'ACTIVO'),
    (v_actor_ajeno, v_tenant_ajeno, 'v455-' || v_actor_ajeno || '@example.test', true, 'ACTIVO');

  INSERT INTO public.almacenes (
    id, tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES
    (v_almacen_a, v_tenant, 'V455-A', 'Almacén origen 455', 'ACTIVO', true, true, 'PE'),
    (v_almacen_b, v_tenant, 'V455-B', 'Almacén destino 455', 'ACTIVO', true, false, 'PE');

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-455-1', 'nombre', 'Producto decimal 455',
      'categoria', 'VERIFICACION', 'precio_venta', 30,
      'precio_compra', 20, 'afectacion_igv', '10',
      'es_servicio', false, 'controla_stock', true
    ),
    v_almacen_a, 10.5, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-455-2', 'nombre', 'Producto rollback 455',
      'categoria', 'VERIFICACION', 'precio_venta', 30,
      'precio_compra', 20, 'afectacion_igv', '10',
      'es_servicio', false, 'controla_stock', true
    ),
    v_almacen_a, 5, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_rollback;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'SERV-455', 'nombre', 'Servicio 455',
      'categoria', 'VERIFICACION', 'precio_venta', 50,
      'precio_compra', 20, 'afectacion_igv', '10',
      'es_servicio', true, 'controla_stock', false
    ),
    NULL, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_servicio;

  v_result := public.registrar_ajuste_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_id', v_almacen_a,
      'delta', 1.25,
      'motivo', 'Conteo físico decimal'
    ),
    v_actor,
    'verify-455-ajuste-decimal'
  );

  IF COALESCE((v_result->>'idempotent')::boolean, true)
     OR round((v_result->>'delta')::numeric, 6) <> 1.25
     OR round((v_result->>'valor')::numeric, 2) <> 25
     OR NOT EXISTS (
       SELECT 1 FROM public.producto_existencias pe
       WHERE pe.tenant_id = v_tenant AND pe.producto_id = v_producto
         AND pe.almacen_id = v_almacen_a AND pe.stock_actual = 11.75
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events o
       WHERE o.event_id = (v_result->>'event_id')::uuid
         AND o.event_type = 'ajuste.inventario.aplicado'
         AND round((o.payload->>'valor')::numeric, 2) = 25
         AND o.payload->>'tipo' = 'SOBRANTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_455_AJUSTE_ATOMICO_INCORRECTO:%', v_result;
  END IF;

  v_retry := public.registrar_ajuste_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_id', v_almacen_a,
      'delta', 1.25,
      'motivo', 'Conteo físico decimal'
    ),
    v_actor,
    'verify-455-ajuste-decimal'
  );
  IF NOT COALESCE((v_retry->>'idempotent')::boolean, false)
     OR v_retry->>'operacion_id' IS DISTINCT FROM v_result->>'operacion_id'
     OR v_retry->>'movimiento_id' IS DISTINCT FROM v_result->>'movimiento_id'
     OR (SELECT count(*) FROM public.operaciones_inventario
         WHERE tenant_id = v_tenant AND tipo = 'AJUSTE'
           AND idempotency_key = 'verify-455-ajuste-decimal') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_455_RETRY_AJUSTE_NO_ESTABLE:%', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(
      v_tenant,
      jsonb_build_object(
        'producto_id', v_producto, 'almacen_id', v_almacen_a,
        'delta', 2, 'motivo', 'Conteo físico decimal'
      ),
      v_actor,
      'verify-455-ajuste-decimal'
    );
  EXCEPTION WHEN SQLSTATE '23505' THEN
    v_failed := position('DIFFERENT_PAYLOAD' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_455_KEY_AJUSTE_REUTILIZADA';
  END IF;

  v_result := public.transferir_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_origen_id', v_almacen_a,
      'almacen_destino_id', v_almacen_b,
      'cantidad', 2.5,
      'motivo', 'Reabastecimiento interno'
    ),
    v_actor,
    'verify-455-transferencia'
  );
  IF COALESCE((v_result->>'idempotent')::boolean, true)
     OR NOT EXISTS (
       SELECT 1 FROM public.producto_existencias pe
       WHERE pe.tenant_id = v_tenant AND pe.producto_id = v_producto
         AND pe.almacen_id = v_almacen_a AND pe.stock_actual = 9.25
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.producto_existencias pe
       WHERE pe.tenant_id = v_tenant AND pe.producto_id = v_producto
         AND pe.almacen_id = v_almacen_b AND pe.stock_actual = 2.5
     )
     OR (SELECT sum(stock_actual) FROM public.producto_existencias
         WHERE tenant_id = v_tenant AND producto_id = v_producto) <> 11.75 THEN
    RAISE EXCEPTION 'VERIFY_455_TRANSFERENCIA_NO_CONSERVA_STOCK:%', v_result;
  END IF;

  v_retry := public.transferir_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_origen_id', v_almacen_a,
      'almacen_destino_id', v_almacen_b,
      'cantidad', 2.5,
      'motivo', 'Reabastecimiento interno'
    ),
    v_actor,
    'verify-455-transferencia'
  );
  IF NOT COALESCE((v_retry->>'idempotent')::boolean, false)
     OR v_retry->>'operacion_id' IS DISTINCT FROM v_result->>'operacion_id'
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE referencia_id = (v_result->>'operacion_id')::uuid
           AND referencia_tipo IN ('TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA')) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_455_RETRY_TRANSFERENCIA_NO_ESTABLE:%', v_retry;
  END IF;

  v_result := public.registrar_ajuste_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_id', v_almacen_a,
      'delta', -0.25,
      'motivo', 'Merma decimal'
    ),
    v_actor,
    'verify-455-ajuste-faltante'
  );
  IF v_result->>'tipo' <> 'FALTANTE'
     OR NOT EXISTS (
       SELECT 1 FROM public.operaciones_inventario o
       WHERE o.id = (v_result->>'operacion_id')::uuid
         AND o.movimiento_salida_id = (v_result->>'movimiento_id')::uuid
         AND o.movimiento_entrada_id IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.producto_existencias pe
       WHERE pe.tenant_id = v_tenant AND pe.producto_id = v_producto
         AND pe.almacen_id = v_almacen_a AND pe.stock_actual = 9
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events o
       WHERE o.event_id = (v_result->>'event_id')::uuid
         AND o.payload->>'tipo' = 'FALTANTE'
         AND round((o.payload->>'valor')::numeric, 2) = 5
     ) THEN
    RAISE EXCEPTION 'VERIFY_455_AJUSTE_FALTANTE_INCORRECTO:%', v_result;
  END IF;

  SELECT count(*) INTO v_before FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant AND producto_id = v_producto;
  v_failed := false;
  BEGIN
    PERFORM public.transferir_inventario_tx(
      v_tenant,
      jsonb_build_object(
        'producto_id', v_producto,
        'almacen_origen_id', v_almacen_a,
        'almacen_destino_id', v_almacen_b,
        'cantidad', 100,
        'motivo', 'No debe alcanzar'
      ),
      v_actor,
      'verify-455-transfer-insuficiente'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('INSUFFICIENT' IN SQLERRM) > 0;
  END;
  SELECT count(*) INTO v_after FROM public.movimientos_inventario
  WHERE tenant_id = v_tenant AND producto_id = v_producto;
  IF NOT v_failed OR v_after <> v_before OR EXISTS (
    SELECT 1 FROM public.operaciones_inventario
    WHERE tenant_id = v_tenant AND idempotency_key = 'verify-455-transfer-insuficiente'
  ) THEN
    RAISE EXCEPTION 'VERIFY_455_TRANSFERENCIA_PARCIAL_ANTE_FALLO';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(
      v_tenant,
      jsonb_build_object(
        'producto_id', v_servicio, 'almacen_id', v_almacen_a,
        'delta', 1, 'motivo', 'Servicio inválido'
      ),
      v_actor,
      'verify-455-servicio'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_failed := position('DOES_NOT_CONTROL_STOCK' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_455_SERVICIO_MOVIO_STOCK';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(
      v_tenant,
      jsonb_build_object(
        'producto_id', v_producto_rollback, 'almacen_id', v_almacen_a,
        'delta', 1, 'motivo', 'Actor ajeno'
      ),
      v_actor_ajeno,
      'verify-455-actor-ajeno'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_failed := position('CROSS_TENANT' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_455_ACTOR_CROSS_TENANT_ACEPTADO';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_ajuste_inventario_tx(
      v_tenant,
      jsonb_build_object(
        'producto_id', v_producto_rollback, 'almacen_id', v_almacen_a,
        'delta', 0.5, 'motivo', 'FAIL-OUTBOX-455'
      ),
      v_actor,
      'verify-455-outbox-rollback'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('VERIFY_455_FALLO_INDUCIDO' IN SQLERRM) > 0;
  END;
  IF NOT v_failed
     OR EXISTS (
       SELECT 1 FROM public.operaciones_inventario
       WHERE tenant_id = v_tenant AND idempotency_key = 'verify-455-outbox-rollback'
     )
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant AND producto_id = v_producto_rollback
         AND referencia_tipo = 'AJUSTE_MANUAL'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.producto_existencias
       WHERE tenant_id = v_tenant AND producto_id = v_producto_rollback
         AND almacen_id = v_almacen_a AND stock_actual = 5
     ) THEN
    RAISE EXCEPTION 'VERIFY_455_FALLO_OUTBOX_NO_REIRTIO_AJUSTE';
  END IF;

  IF has_function_privilege(
       'authenticated', 'public.registrar_ajuste_inventario_tx(uuid,jsonb,uuid,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.transferir_inventario_tx(uuid,jsonb,uuid,text)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.registrar_ajuste_inventario_tx(uuid,jsonb,uuid,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.registrar_ajuste_inventario_tx_455(uuid,jsonb,uuid,text)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.transferir_inventario_tx_455(uuid,jsonb,uuid,text)', 'EXECUTE'
     )
     OR has_table_privilege('authenticated', 'public.operaciones_inventario', 'INSERT')
     OR has_table_privilege('authenticated', 'public.operaciones_inventario', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.operaciones_inventario', 'DELETE')
     OR has_table_privilege('service_role', 'public.operaciones_inventario', 'INSERT')
     OR has_table_privilege('service_role', 'public.operaciones_inventario', 'UPDATE')
     OR has_table_privilege('service_role', 'public.operaciones_inventario', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_455_ACL_INCORRECTO';
  END IF;
END;
$verify$;

DROP TRIGGER trg_verify_455_fail_outbox ON public.outbox_events;
DROP FUNCTION app.verify_455_fail_outbox();

ROLLBACK;
