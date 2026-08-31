\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_531') THEN
    RAISE EXCEPTION 'VERIFY_531_SOLO_BASE_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contract$
DECLARE
  v_credit jsonb;
  v_definition text;
BEGIN
  v_credit := app.normalizar_intencion_pago_pedido_531(
    '{"condicion_pago":"CREDITO","medio_pago":"42","plazo_pago_dias":30}'::jsonb,
    NULL, DATE '2026-08-31', true
  );
  IF v_credit <> '{"condicion_pago":"CREDITO","medio_pago":"42","plazo_pago_dias":30,"fecha_emision":"2026-08-31","fecha_vencimiento":"2026-09-30"}'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_531_CREDIT_CALENDAR:%', v_credit;
  END IF;

  BEGIN
    PERFORM app.normalizar_intencion_pago_pedido_531(
      '{"condicion_pago":"CREDITO","plazo_pago_dias":15,"fecha_vencimiento":"2026-09-30"}'::jsonb,
      NULL, DATE '2026-08-31', true
    );
    RAISE EXCEPTION 'VERIFY_531_ACCEPTED_CONTRADICTORY_DATES';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT pg_get_functiondef(
    'public.congelar_pago_dian_pedido_tx_531(uuid,uuid,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%FOR UPDATE%'
     OR v_definition NOT ILIKE '%PEDIDO_DIAN_PRODUCT_TAX_PROFILE_INVALID%'
     OR v_definition NOT ILIKE '%PEDIDO_DIAN_RECEIVER_PROFILE_INVALID%' THEN
    RAISE EXCEPTION 'VERIFY_531_FISCAL_ROW_LOCK_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'public.abortar_snapshot_dian_pedido_tx_531(uuid,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%public.cpe%'
     OR v_definition NOT ILIKE '%public.dian_numeracion_reservas%'
     OR v_definition NOT ILIKE '%public.outbox_events%'
     OR v_definition ILIKE '%DELETE FROM public.dian_numeracion_reservas%' THEN
    RAISE EXCEPTION 'VERIFY_531_ABORT_FAIL_CLOSED_CONTRACT_INVALID';
  END IF;

  SELECT pg_get_functiondef(
    'public.consumir_snapshot_dian_pedido_tx_531(uuid,uuid,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%JOIN public.documentos%'
     OR v_definition NOT ILIKE '%d.pedido_id = p_pedido_id%'
     OR v_definition NOT ILIKE '%v_pedido.factura_id = p_cpe_id%' THEN
    RAISE EXCEPTION 'VERIFY_531_ORDER_BOUND_CPE_CONTRACT_INVALID';
  END IF;

  IF to_regprocedure('public.crear_pedido_comercial_pago_tx_531(jsonb,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_pedido_comercial_pago_tx_531(uuid,uuid,jsonb,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.convertir_cotizacion_comercial_a_pedido_pago_tx_531(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR has_function_privilege('authenticated',
       'public.crear_pedido_comercial_pago_tx_531(jsonb,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.crear_pedido_comercial_pago_tx_531(jsonb,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.actualizar_pedido_comercial_pago_tx_531(uuid,uuid,jsonb,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.congelar_pago_dian_pedido_tx_531(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.consumir_snapshot_dian_pedido_tx_531(uuid,uuid,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.abortar_snapshot_dian_pedido_tx_531(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.consumir_snapshot_dian_pedido_tx_531(uuid,uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.abortar_snapshot_dian_pedido_tx_531(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.actualizar_pedido_comercial_tx(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.actualizar_pedido_venta_tx(uuid,uuid,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_531_RPC_CONTRACT_OR_ACL_INVALID';
  END IF;
END;
$contract$;

CREATE OR REPLACE FUNCTION pg_temp.fail_new_payment_intent_531()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(OLD.metadata, '{}'::jsonb) ? 'dian_payment_intent'
     AND coalesce(NEW.metadata, '{}'::jsonb) ? 'dian_payment_intent' THEN
    RAISE EXCEPTION 'VERIFY_531_FORCED_POST_WRITER_FAILURE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verify_531_fail_payment_intent
BEFORE UPDATE OF metadata ON public.pedidos_venta
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_new_payment_intent_531();

DO $atomic$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_country_id integer;
  v_cliente uuid;
  v_almacen uuid;
  v_producto uuid;
  v_precio numeric;
  v_detalle jsonb;
  v_pedido_payload jsonb;
  v_result jsonb;
  v_pedido uuid;
  v_pedido_otro uuid;
  v_cotizacion uuid;
  v_before bigint;
  v_original_observaciones text;
  v_cpe uuid;
  v_documento uuid;
  v_reserva jsonb;
  v_reserva_id uuid;
  v_event uuid := gen_random_uuid();
  v_key text;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY PEDIDO DIAN 531', 1, 'CO');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT id INTO STRICT v_country_id
  FROM public.paises
  WHERE upper(codigo_iso) = 'CO' AND coalesce(activo, true);
  UPDATE public.tenants SET pais = 'CO' WHERE id = v_tenant;
  UPDATE public.empresa_config
  SET pais_id = v_country_id,
      pais = 'CO', moneda = 'COP', moneda_defecto = 'COP',
      ruc = '9015310004', razon_social = 'Emisor verify 531 CO',
      direccion_fiscal = 'Carrera 7 # 72-41', departamento = 'Bogota D.C.',
      provincia = 'Bogota D.C.', ubigeo = '11001',
      estado = 'ACTIVO', configuracion_completa = true,
      is_demo = false, demo_extended = false, demo_expires_at = NULL,
      dian_activo = true, dian_resolucion_numero = '187640531',
      dian_resolucion_prefijo = 'FV',
      dian_resolucion_desde = 1, dian_resolucion_hasta = 100,
      dian_resolucion_fecha_inicio = app.hoy_tenant(v_tenant) - 1,
      dian_resolucion_fecha_fin = app.hoy_tenant(v_tenant) + 30,
      igv_porcentaje = 19,
      updated_at = now()
  WHERE tenant_id = v_tenant;

  INSERT INTO public.clientes(
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES (
    v_tenant, 'CLI-531', 'Cliente verify 531', 'Cliente verify 531',
    'NIT', '9001234568', true,
    'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
  ) RETURNING id INTO v_cliente;
  INSERT INTO public.almacenes(
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-531', 'Almacen verify 531', 'ACTIVO', true, true, 'CO'
  ) RETURNING id INTO v_almacen;
  v_producto := (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-531', 'nombre', 'Producto verify 531',
      'categoria', 'VERIFICACION', 'precio_venta', 100,
      'precio_compra', 50, 'afectacion_igv', '10'
    ),
    v_almacen, 10, 0, '[]'::jsonb
  )->>'id')::uuid;
  SELECT precio_venta INTO v_precio FROM public.productos WHERE id = v_producto;

  v_detalle := jsonb_build_array(jsonb_build_object(
    'producto_id', v_producto, 'descripcion', 'Producto verify 531',
    'cantidad', 1, 'precio_unitario', greatest(coalesce(v_precio, 1), 1), 'orden', 1
  ));
  v_pedido_payload := jsonb_build_object(
    'tenant_id', v_tenant, 'cliente_id', v_cliente, 'created_by', v_actor,
    'moneda', 'COP', 'observaciones', 'ORIGINAL-531'
  );

  SELECT count(*) INTO v_before FROM public.pedidos_venta WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.crear_pedido_comercial_pago_tx_531(
      v_pedido_payload, v_detalle,
      '{"condicion_pago":"CREDITO","medio_pago":"42","plazo_pago_dias":30}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_531_CREATE_DID_NOT_REACH_FORCED_FAILURE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'VERIFY_531_FORCED_POST_WRITER_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.pedidos_venta WHERE tenant_id = v_tenant) <> v_before THEN
    RAISE EXCEPTION 'VERIFY_531_CREATE_PARTIAL_COMMIT';
  END IF;

  v_result := public.crear_pedido_comercial_pago_tx_531(v_pedido_payload, v_detalle, NULL);
  v_pedido := (v_result->>'pedido_id')::uuid;
  v_result := public.crear_pedido_comercial_pago_tx_531(
    v_pedido_payload || jsonb_build_object('observaciones', 'OTRO-531'),
    v_detalle,
    NULL
  );
  v_pedido_otro := (v_result->>'pedido_id')::uuid;
  v_key := 'ventas.cpe.factura:' || v_tenant::text || ':' || v_pedido::text;
  SELECT observaciones INTO v_original_observaciones FROM public.pedidos_venta
  WHERE id = v_pedido AND tenant_id = v_tenant;

  BEGIN
    PERFORM public.actualizar_pedido_comercial_pago_tx_531(
      v_pedido, v_tenant, '{"observaciones":"MUTATED-531"}'::jsonb, NULL,
      '{"condicion_pago":"CONTADO","medio_pago":"10"}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_531_UPDATE_DID_NOT_REACH_FORCED_FAILURE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'VERIFY_531_FORCED_POST_WRITER_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT observaciones FROM public.pedidos_venta WHERE id = v_pedido)
     IS DISTINCT FROM v_original_observaciones THEN
    RAISE EXCEPTION 'VERIFY_531_UPDATE_PARTIAL_COMMIT';
  END IF;

  v_result := public.crear_cotizacion_tx(
    v_tenant, v_actor, v_cliente, app.hoy_tenant(v_tenant) + 5,
    'Cotizacion verify 531', 'Verifier', 'COP',
    greatest(coalesce(v_precio, 1), 1),
    round(greatest(coalesce(v_precio, 1), 1) * app.tasa_impuesto_tenant(v_tenant), 2),
    round(greatest(coalesce(v_precio, 1), 1)
      * (1 + app.tasa_impuesto_tenant(v_tenant)), 2), v_detalle
  );
  v_cotizacion := (v_result#>>'{cotizacion,id}')::uuid;
  SELECT count(*) INTO v_before FROM public.pedidos_venta WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.convertir_cotizacion_comercial_a_pedido_pago_tx_531(
      v_cotizacion, v_tenant, v_actor, 'Convert verify 531',
      '{"condicion_pago":"CONTADO","medio_pago":"10"}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_531_CONVERT_DID_NOT_REACH_FORCED_FAILURE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'VERIFY_531_FORCED_POST_WRITER_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.pedidos_venta WHERE tenant_id = v_tenant) <> v_before
     OR (SELECT upper(estado::text) FROM public.cotizaciones WHERE id = v_cotizacion) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'VERIFY_531_CONVERT_PARTIAL_COMMIT';
  END IF;

  UPDATE public.empresa_config SET pais = 'PE', updated_at = now()
  WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before FROM public.pedidos_venta WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.crear_pedido_comercial_pago_tx_531(
      v_pedido_payload, v_detalle, '{"condicion_pago":"CONTADO"}'::jsonb
    );
    RAISE EXCEPTION 'VERIFY_531_NON_CO_ACCEPTED_DIAN_FIELDS';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_PAYMENT_ONLY_CO' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.pedidos_venta WHERE tenant_id = v_tenant) <> v_before THEN
    RAISE EXCEPTION 'VERIFY_531_NON_CO_MUTATED_ORDER';
  END IF;

  UPDATE public.empresa_config SET pais = 'CO', updated_at = now()
  WHERE tenant_id = v_tenant;

  -- Simula el writer concurrente que gana justo antes de que el emisor tome el
  -- lock: el snapshot debe usar exclusivamente este estado nuevo y coherente.
  ALTER TABLE public.clientes
    DROP CONSTRAINT ck_clientes_dian_perfil_526;
  UPDATE public.clientes
  SET razon_social = 'CLIENTE CANONICO 531', direccion = 'CALLE CANONICA 531',
      updated_at = now()
  WHERE id = v_cliente AND tenant_id = v_tenant;
  UPDATE public.pedidos_venta_detalle
  SET descripcion = 'DETALLE CANONICO 531', cantidad = 2,
      subtotal = round(2 * greatest(coalesce(v_precio, 1), 1), 2),
      updated_at = now()
  WHERE pedido_id = v_pedido AND tenant_id = v_tenant;
  UPDATE public.pedidos_venta
  SET observaciones = 'CANONICAL-531',
      subtotal = round(2 * greatest(coalesce(v_precio, 1), 1), 2),
      igv = round(2 * greatest(coalesce(v_precio, 1), 1)
        * app.tasa_impuesto_tenant(v_tenant), 2),
      total = round(2 * greatest(coalesce(v_precio, 1), 1)
        * (1 + app.tasa_impuesto_tenant(v_tenant)), 2),
      updated_at = now()
  WHERE id = v_pedido AND tenant_id = v_tenant;
  v_original_observaciones := 'CANONICAL-531';

  -- En una empresa CO real no se persiste ningún corte fiscal si los maestros
  -- tributarios están incompletos. Ambas comprobaciones se hacen bajo los
  -- mismos locks que protegen el snapshot definitivo.
  -- Simula en la base efímera una fila legada anterior al catálogo 07. El DDL
  -- también queda bajo este BEGIN/ROLLBACK y nunca toca una base persistente.
  ALTER TABLE public.productos
    DROP CONSTRAINT ck_productos_afectacion_igv_catalogo07_356;
  UPDATE public.productos
  SET afectacion_igv = '18', updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;
  BEGIN
    PERFORM public.congelar_pago_dian_pedido_tx_531(
      v_tenant, v_pedido, v_key
    );
    RAISE EXCEPTION 'VERIFY_531_INVALID_PRODUCT_PROFILE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_PRODUCT_TAX_PROFILE_INVALID' THEN RAISE; END IF;
  END;
  IF (SELECT metadata ? 'dian_fiscal_snapshot' FROM public.pedidos_venta
      WHERE id = v_pedido) THEN
    RAISE EXCEPTION 'VERIFY_531_INVALID_PRODUCT_PERSISTED_SNAPSHOT';
  END IF;
  UPDATE public.productos
  SET afectacion_igv = '10', updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;

  UPDATE public.clientes
  SET dian_responsabilidad_fiscal = 'R-99-PN', updated_at = now()
  WHERE id = v_cliente AND tenant_id = v_tenant;
  BEGIN
    PERFORM public.congelar_pago_dian_pedido_tx_531(
      v_tenant, v_pedido, v_key
    );
    RAISE EXCEPTION 'VERIFY_531_INVALID_RECEIVER_PROFILE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_RECEIVER_PROFILE_INVALID' THEN RAISE; END IF;
  END;
  UPDATE public.clientes
  SET dian_responsabilidad_fiscal = 'O-99', updated_at = now()
  WHERE id = v_cliente AND tenant_id = v_tenant;

  v_result := public.congelar_pago_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key
  );
  IF v_result#>>'{fiscal_snapshot,pedido,observaciones}' <> 'CANONICAL-531'
     OR v_result#>>'{fiscal_snapshot,detalle,0,descripcion}' <> 'DETALLE CANONICO 531'
     OR (v_result#>>'{fiscal_snapshot,detalle,0,cantidad}')::numeric <> 2
     OR v_result#>>'{fiscal_snapshot,cliente,razon_social}' <> 'CLIENTE CANONICO 531'
     OR v_result#>>'{fiscal_snapshot,cliente,direccion}' <> 'CALLE CANONICA 531'
     OR v_result#>>ARRAY['fiscal_snapshot','productos',v_producto::text,'afectacion_igv'] <> '10'
     OR (v_result#>ARRAY['fiscal_snapshot','productos',v_producto::text]) ? 'costo'
     OR (v_result#>ARRAY['fiscal_snapshot','productos',v_producto::text]) ? 'precio_compra'
     OR length(coalesce(v_result#>>'{fiscal_snapshot,sha256}', '')) <> 64
     OR v_result#>>'{lifecycle,state}' <> 'PREPARED'
     OR coalesce((v_result->>'idempotent')::boolean, true) THEN
    RAISE EXCEPTION 'VERIFY_531_CANONICAL_FISCAL_SNAPSHOT_INVALID:%', v_result;
  END IF;

  -- Sin ninguna evidencia fiscal, ABORTED libera únicamente los snapshots y
  -- conserva el historial. Volver a preparar no consume ni recicla un número.
  v_result := public.abortar_snapshot_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key, 'VERIFY_PRE_RESERVATION_FAILURE'
  );
  IF v_result->>'state' <> 'ABORTED'
     OR NOT coalesce((v_result->>'released')::boolean, false)
     OR (SELECT metadata ? 'dian_payment_snapshot'
         OR metadata ? 'dian_fiscal_snapshot'
         FROM public.pedidos_venta WHERE id = v_pedido) THEN
    RAISE EXCEPTION 'VERIFY_531_SAFE_ABORT_DID_NOT_RELEASE:%', v_result;
  END IF;
  v_result := public.congelar_pago_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key
  );
  IF v_result#>>'{lifecycle,state}' <> 'PREPARED'
     OR jsonb_array_length(v_result#>'{lifecycle,history}') <> 3 THEN
    RAISE EXCEPTION 'VERIFY_531_REPREPARE_AUDIT_INVALID:%', v_result;
  END IF;

  -- Los maestros pueden evolucionar luego, pero un retry debe retornar el
  -- mismo corte durable y no volver a leerlos para armar otra factura.
  UPDATE public.clientes
  SET razon_social = 'CLIENTE POST FREEZE 531', updated_at = now()
  WHERE id = v_cliente AND tenant_id = v_tenant;
  UPDATE public.productos
  SET afectacion_igv = '20', updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;
  v_result := public.congelar_pago_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key
  );
  IF NOT coalesce((v_result->>'idempotent')::boolean, false)
     OR v_result#>>'{fiscal_snapshot,cliente,razon_social}' <> 'CLIENTE CANONICO 531'
     OR v_result#>>ARRAY['fiscal_snapshot','productos',v_producto::text,'afectacion_igv'] <> '10' THEN
    RAISE EXCEPTION 'VERIFY_531_RETRY_REBUILT_FISCAL_SNAPSHOT:%', v_result;
  END IF;

  BEGIN
    PERFORM public.actualizar_pedido_comercial_pago_tx_531(
      v_pedido, v_tenant, '{"observaciones":"FROZEN-MUTATED-531"}'::jsonb, NULL,
      NULL
    );
    RAISE EXCEPTION 'VERIFY_531_COMMERCIAL_MUTATION_AFTER_FREEZE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_PAYMENT_FROZEN' THEN RAISE; END IF;
  END;
  IF (SELECT observaciones FROM public.pedidos_venta WHERE id = v_pedido)
     IS DISTINCT FROM v_original_observaciones THEN
    RAISE EXCEPTION 'VERIFY_531_PAYMENT_FROZEN_MUTATED_ORDER';
  END IF;

  -- La sola existencia del outbox de la intención basta para impedir release.
  -- No se elimina evidencia ni se cambia PREPARED por un fallo tardío.
  INSERT INTO public.outbox_events(
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, created_at, updated_at
  ) VALUES (
    v_tenant, 'verify-531', v_pedido::text, 'factura.emitida', '{}'::jsonb,
    'pending', 0, v_key, now(), now()
  );
  v_result := public.abortar_snapshot_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key, 'VERIFY_POST_ARTIFACT_FAILURE'
  );
  IF v_result->>'state' <> 'PREPARED'
     OR coalesce((v_result->>'released')::boolean, true)
     OR NOT (SELECT metadata ? 'dian_fiscal_snapshot'
             FROM public.pedidos_venta WHERE id = v_pedido)
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant AND idempotency_key = v_key
     ) THEN
    RAISE EXCEPTION 'VERIFY_531_ABORT_REMOVED_FISCAL_EVIDENCE:%', v_result;
  END IF;

  BEGIN
    PERFORM public.consumir_snapshot_dian_pedido_tx_531(
      v_tenant, v_pedido, v_key, gen_random_uuid()
    );
    RAISE EXCEPTION 'VERIFY_531_CONSUMED_WITHOUT_CPE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_LIFECYCLE_FISCAL_ARTIFACTS_MISSING' THEN RAISE; END IF;
  END;

  -- El positivo reproduce la evidencia mínima que deja el writer atómico 530:
  -- reserva consumida, documento, CPE y outbox de la misma intención.
  -- Aun después de PREPARED, la frontera genérica (sin dueño interno) no puede
  -- apropiarse de la key ni dejar un correlativo huérfano.
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant, v_actor, '01', app.hoy_tenant(v_tenant), v_key, NULL
    );
    RAISE EXCEPTION 'VERIFY_531_GENERIC_CPE_PRECLAIM_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_INVOICE_IDEMPOTENCY_OWNER_REQUIRED' THEN RAISE; END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.dian_numeracion_reservas
    WHERE tenant_id = v_tenant AND idempotency_key = v_key
  ) THEN
    RAISE EXCEPTION 'VERIFY_531_GENERIC_CPE_PRECLAIM_PERSISTED';
  END IF;

  v_reserva := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant, v_actor, '01', app.hoy_tenant(v_tenant), v_key, v_pedido
  );
  v_reserva_id := (v_reserva->>'reserva_id')::uuid;
  v_result := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant, v_actor, '01', app.hoy_tenant(v_tenant), v_key, v_pedido
  );
  IF NOT coalesce((v_result->>'idempotent')::boolean, false)
     OR (v_result->>'reserva_id')::uuid IS DISTINCT FROM v_reserva_id
     OR (SELECT pedido_id FROM public.dian_numeracion_reservas
         WHERE id = v_reserva_id) IS DISTINCT FROM v_pedido THEN
    RAISE EXCEPTION 'VERIFY_531_ORDER_NUMBER_RETRY_NOT_IDEMPOTENT:%/%',
      v_reserva, v_result;
  END IF;
  INSERT INTO public.documentos(
    tenant_id, pedido_id, tipo_documento, serie, numero, estado, estado_sunat,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio, subtotal,
    impuesto_igv, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, cliente_id, created_by,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion, metadata
  ) VALUES (
    v_tenant, v_pedido_otro, 'FACTURA', v_reserva->>'prefijo',
    lpad(v_reserva->>'correlativo', 8, '0'), 'EMITIDO', 'PENDIENTE',
    now(), now(), 'COP', 1, 200, 38, 238, 200, 0, 0, 0,
    v_cliente, v_actor, '9015310004', 'Emisor verify 531 CO', 'Bogota',
    '31', '9001234568', '9001234568', 'CLIENTE CANONICO 531',
    'CLIENTE CANONICO 531', 'CALLE CANONICA 531',
    jsonb_build_object(
      'fiscal_country', 'CO',
      'dian_number_reservation_id', v_reserva_id,
      'dian_prefijo_autorizado', v_reserva->>'prefijo',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', v_reserva->>'numero_completo'
    )
  ) RETURNING id INTO v_documento;
  INSERT INTO public.cpe(
    tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id,
    idempotency_key, metadata, activo
  ) VALUES (
    v_tenant, v_documento, '01', v_reserva->>'prefijo',
    lpad(v_reserva->>'correlativo', 8, '0'),
    (v_reserva->>'correlativo')::integer,
    '9015310004', 'Emisor verify 531 CO', 'Bogota', '31', '9001234568',
    'CLIENTE CANONICO 531', 'CALLE CANONICA 531', v_cliente, 'COP',
    200, 0, 0, 0, 38, 238, 238,
    jsonb_build_array(jsonb_build_object(
      'codigo', 'PROD-531', 'descripcion', 'DETALLE CANONICO 531',
      'cantidad', 2, 'precio_unitario', 100, 'valor_venta', 200,
      'igv', 38, 'total', 238, 'afectacion_igv', '10'
    )), now(), now(), 'FIRMADO', 'PENDIENTE', 'READY', v_actor, v_event,
    v_key,
    jsonb_build_object(
      'fiscal_country', 'CO',
      'dian_number_reservation_id', v_reserva_id,
      'dian_prefijo_autorizado', v_reserva->>'prefijo',
      'dian_numbering_contract_version', 530,
      'numero_fiscal', v_reserva->>'numero_completo'
    ), true
  ) RETURNING id INTO v_cpe;
  UPDATE public.dian_numeracion_reservas
  SET estado = 'CONSUMIDA', consumida_at = now(), cpe_id = v_cpe,
      documento_id = v_documento
  WHERE id = v_reserva_id AND tenant_id = v_tenant;

  -- Aun con tenant, actor, key, CPE, reserva y outbox correctos, el lifecycle
  -- del pedido A no puede consumir un documento ligado al pedido B.
  UPDATE public.pedidos_venta
  SET factura_id = v_cpe, estado = 'FACTURADO', updated_at = now()
  WHERE id = v_pedido AND tenant_id = v_tenant;
  BEGIN
    PERFORM public.consumir_snapshot_dian_pedido_tx_531(
      v_tenant, v_pedido, v_key, v_cpe
    );
    RAISE EXCEPTION 'VERIFY_531_CROSS_ORDER_CPE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_LIFECYCLE_FISCAL_ARTIFACTS_MISSING' THEN RAISE; END IF;
  END;
  UPDATE public.documentos
  SET pedido_id = v_pedido, updated_at = now()
  WHERE id = v_documento AND tenant_id = v_tenant;

  v_result := public.consumir_snapshot_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key, v_cpe
  );
  IF v_result->>'state' <> 'CONSUMED'
     OR v_result#>>'{lifecycle,cpe_id}' IS DISTINCT FROM v_cpe::text THEN
    RAISE EXCEPTION 'VERIFY_531_CONSUMED_TRANSITION_INVALID:%', v_result;
  END IF;
  v_result := public.consumir_snapshot_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key, v_cpe
  );
  IF v_result->>'state' <> 'CONSUMED'
     OR NOT coalesce((v_result->>'idempotent')::boolean, false)
     OR v_result#>>'{lifecycle,cpe_id}' IS DISTINCT FROM v_cpe::text THEN
    RAISE EXCEPTION 'VERIFY_531_ORDER_CONSUME_RETRY_NOT_IDEMPOTENT:%', v_result;
  END IF;
  v_result := public.abortar_snapshot_dian_pedido_tx_531(
    v_tenant, v_pedido, v_key, 'VERIFY_AFTER_CONSUMED'
  );
  IF v_result->>'state' <> 'CONSUMED'
     OR coalesce((v_result->>'released')::boolean, true)
     OR NOT (SELECT metadata ? 'dian_fiscal_snapshot'
             FROM public.pedidos_venta WHERE id = v_pedido) THEN
    RAISE EXCEPTION 'VERIFY_531_CONSUMED_SNAPSHOT_RELEASED:%', v_result;
  END IF;

  -- Los términos usados por el API deben ser exactamente los que están dentro
  -- del snapshot hash-bound, no una copia mutable paralela en metadata.
  UPDATE public.pedidos_venta
  SET metadata = jsonb_set(
        metadata,
        '{dian_payment_snapshot,medio_pago}',
        to_jsonb('99'::text),
        false
      ),
      updated_at = now()
  WHERE id = v_pedido AND tenant_id = v_tenant;
  BEGIN
    PERFORM public.congelar_pago_dian_pedido_tx_531(
      v_tenant, v_pedido, v_key
    );
    RAISE EXCEPTION 'VERIFY_531_DIVERGENT_PAYMENT_SNAPSHOT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_FISCAL_SNAPSHOT_CORRUPT' THEN RAISE; END IF;
  END;
  UPDATE public.pedidos_venta
  SET metadata = jsonb_set(
        metadata,
        '{dian_payment_snapshot}',
        metadata->'dian_fiscal_snapshot'->'payment_snapshot',
        true
      ),
      updated_at = now()
  WHERE id = v_pedido AND tenant_id = v_tenant;

  -- Una mezcla o escritura accidental del JSON fiscal no puede pasar sólo
  -- porque conserve un texto con apariencia de SHA-256.
  UPDATE public.pedidos_venta
  SET metadata = jsonb_set(
        metadata,
        '{dian_fiscal_snapshot,cliente,razon_social}',
        to_jsonb('CLIENTE SNAPSHOT ALTERADO'::text),
        false
      ),
      updated_at = now()
  WHERE id = v_pedido AND tenant_id = v_tenant;
  BEGIN
    PERFORM public.congelar_pago_dian_pedido_tx_531(
      v_tenant, v_pedido, v_key
    );
    RAISE EXCEPTION 'VERIFY_531_CORRUPT_SNAPSHOT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PEDIDO_DIAN_FISCAL_SNAPSHOT_CORRUPT' THEN RAISE; END IF;
  END;
END;
$atomic$;

ROLLBACK;
