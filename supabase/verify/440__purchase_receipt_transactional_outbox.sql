\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 440 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_reloptions text[];
  v_public_select boolean;
BEGIN
  SELECT c.reloptions,
         EXISTS (
           SELECT 1
           FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
           WHERE acl.grantee = 0
             AND acl.privilege_type = 'SELECT'
         )
    INTO v_reloptions, v_public_select
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'vw_kardex_valorizado'
    AND c.relkind = 'v';

  IF NOT FOUND
     OR NOT coalesce(v_reloptions, ARRAY[]::text[])
          @> ARRAY['security_invoker=true']
     OR v_public_select
     OR has_table_privilege('anon', 'public.vw_kardex_valorizado', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vw_kardex_valorizado', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.vw_kardex_valorizado', 'SELECT') THEN
    RAISE EXCEPTION 'vw_kardex_valorizado no conserva security_invoker y ACL service-only';
  END IF;
END;
$$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_proveedor_id uuid;
  v_almacen_id uuid;
  v_producto_id uuid;
  v_otro_producto_id uuid;
  v_orden_id uuid;
  v_detalle_id uuid;
  v_recepcion_id uuid;
  v_orden_rechazo uuid;
  v_detalle_rechazo uuid;
  v_recepcion_rechazo uuid;
  v_orden_conflicto uuid;
  v_detalle_conflicto uuid;
  v_recepcion_conflicto uuid;
  v_guard_recepcion constant uuid := '00000000-0000-4400-8000-000000000001';
  v_event record;
  v_result jsonb;
  v_stock_antes numeric;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY RECEIPT OUTBOX 440', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  INSERT INTO public.proveedores (
    tenant_id, codigo, nombre, razon_social, ruc, estado, activo,
    condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, 'PROV-VERIFY-440', 'Proveedor Verify 440',
    'Proveedor Verify 440', '20123456786', 'ACTIVO', true, 'CREDITO', 30
  ) RETURNING id INTO v_proveedor_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-440', 'Almacén Verify 440',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-VERIFY-440', 'nombre', 'Producto Verify 440',
      'categoria', 'VERIFICACION', 'precio_venta', 70,
      'precio_compra', 50, 'afectacion_igv', '10'
    ),
    v_almacen_id, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;
  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-VERIFY-440-B', 'nombre', 'Otro Producto Verify 440',
      'categoria', 'VERIFICACION', 'precio_venta', 20,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen_id, 0, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_otro_producto_id;

  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total, condiciones_pago, dias_credito
  ) VALUES (
    v_tenant_id, 'OC-VERIFY-440', 'OC-VERIFY-440', v_proveedor_id,
    current_date, current_date, 'APROBADA', true, 'PEN', 100, 18, 118,
    'CREDITO', 30
  ) RETURNING id INTO v_orden_id;

  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES (
    v_tenant_id, v_orden_id, v_producto_id, 'Producto Verify 440',
    2, 0, 2, 50, 100
  ) RETURNING id INTO v_detalle_id;

  INSERT INTO public.recepciones (
    tenant_id, numero, orden_id, fecha_recepcion, estado, activo
  ) VALUES (
    v_tenant_id, 'REC-VERIFY-440', v_orden_id, now(), 'BORRADOR', true
  ) RETURNING id INTO v_recepcion_id;

  -- Dos renglones del mismo SKU/almacén deben producir dos entradas físicas.
  INSERT INTO public.recepcion_items (
    tenant_id, recepcion_id, detalle_id, producto_id, almacen_id,
    cantidad_recibida, calidad, lote
  ) VALUES
    (v_tenant_id, v_recepcion_id, v_detalle_id, v_producto_id,
      v_almacen_id, 1, 'OK', 'LOTE-A'),
    (v_tenant_id, v_recepcion_id, v_detalle_id, v_producto_id,
      v_almacen_id, 1, 'OBSERVADO', 'LOTE-B');

  SELECT public.cerrar_recepcion_tx(
    v_recepcion_id, v_tenant_id, v_user_id::text, 'Cierre verify 440'
  ) INTO v_result;

  IF jsonb_array_length(v_result->'movimientos') <> 2
     OR (SELECT cantidad_recibida FROM public.orden_compra_detalles WHERE id = v_detalle_id) <> 2
     OR (SELECT upper(estado::text) FROM public.ordenes_compra WHERE id = v_orden_id) <> 'RECIBIDA'
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 2 THEN
    RAISE EXCEPTION 'El cierre no mantuvo stock, detalle y OC en la misma cantidad';
  END IF;
  IF (SELECT count(*) FROM public.movimientos_inventario
      WHERE tenant_id = v_tenant_id
        AND upper(coalesce(referencia_tipo, '')) = 'RECEPCION'
        AND app.to_uuid_or_null(metadata->>'recepcion_id') = v_recepcion_id
        AND upper(coalesce(tipo, tipo_movimiento, '')) = 'ENTRADA') <> 2 THEN
    RAISE EXCEPTION 'Dos items del mismo SKU colisionaron en el ledger físico';
  END IF;

  SELECT * INTO v_event
  FROM public.outbox_events
  WHERE tenant_id = v_tenant_id
    AND event_type = 'recepcion.registrada'
    AND aggregate_id = v_recepcion_id::text;
  IF NOT FOUND
     OR v_event.status <> 'pending'
     OR (v_event.payload->>'subtotalParcial')::numeric <> 100
     OR (v_event.payload->>'igvParcial')::numeric <> 18
     OR (v_event.payload->>'totalParcial')::numeric <> 118
     OR jsonb_array_length(v_event.payload->'items') <> 2 THEN
    RAISE EXCEPTION 'El payload durable de recepción es incompleto: %', v_event.payload;
  END IF;

  SELECT public.cerrar_recepcion_tx(
    v_recepcion_id, v_tenant_id, v_user_id::text, NULL
  ) INTO v_result;
  IF NOT coalesce((v_result->>'idempotent')::boolean, false)
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'recepcion.registrada'
           AND aggregate_id = v_recepcion_id::text) <> 1 THEN
    RAISE EXCEPTION 'El retry del cierre no fue idempotente';
  END IF;

  BEGIN
    UPDATE public.recepcion_items
    SET cantidad_recibida = 9
    WHERE recepcion_id = v_recepcion_id;
    RAISE EXCEPTION 'Los items cerrados no deben poder mutar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Los items cerrados no deben poder mutar' THEN RAISE; END IF;
  END;

  -- Una recepción 100% rechazada no cumple la OC ni crea evento contable cero.
  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total
  ) VALUES (
    v_tenant_id, 'OC-VERIFY-440-R', 'OC-VERIFY-440-R', v_proveedor_id,
    current_date, current_date, 'APROBADA', true, 'PEN', 50, 9, 59
  ) RETURNING id INTO v_orden_rechazo;
  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES (
    v_tenant_id, v_orden_rechazo, v_producto_id, 'Producto rechazado',
    1, 0, 1, 50, 50
  ) RETURNING id INTO v_detalle_rechazo;
  INSERT INTO public.recepciones (
    tenant_id, numero, orden_id, fecha_recepcion, estado, activo
  ) VALUES (
    v_tenant_id, 'REC-VERIFY-440-R', v_orden_rechazo, now(), 'BORRADOR', true
  ) RETURNING id INTO v_recepcion_rechazo;
  INSERT INTO public.recepcion_items (
    tenant_id, recepcion_id, detalle_id, producto_id, almacen_id,
    cantidad_recibida, calidad
  ) VALUES (
    v_tenant_id, v_recepcion_rechazo, v_detalle_rechazo, v_producto_id,
    v_almacen_id, 1, 'RECHAZADO'
  );
  SELECT stock_actual INTO v_stock_antes FROM public.productos WHERE id = v_producto_id;
  PERFORM public.cerrar_recepcion_tx(
    v_recepcion_rechazo, v_tenant_id, v_user_id::text, NULL
  );
  IF (SELECT cantidad_recibida FROM public.orden_compra_detalles WHERE id = v_detalle_rechazo) <> 0
     OR (SELECT upper(estado::text) FROM public.ordenes_compra WHERE id = v_orden_rechazo) <> 'APROBADA'
     OR (SELECT stock_actual FROM public.productos WHERE id = v_producto_id) <> v_stock_antes
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant_id AND event_type = 'recepcion.registrada'
         AND aggregate_id = v_recepcion_rechazo::text
     ) THEN
    RAISE EXCEPTION 'Una recepción rechazada cumplió OC, movió stock o emitió costo cero';
  END IF;

  -- Producto físico y detalle de OC no pueden cruzarse.
  INSERT INTO public.ordenes_compra (
    tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    estado, activo, moneda, subtotal, igv, total
  ) VALUES (
    v_tenant_id, 'OC-VERIFY-440-C', 'OC-VERIFY-440-C', v_proveedor_id,
    current_date, current_date, 'APROBADA', true, 'PEN', 50, 9, 59
  ) RETURNING id INTO v_orden_conflicto;
  INSERT INTO public.orden_compra_detalles (
    tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal
  ) VALUES (
    v_tenant_id, v_orden_conflicto, v_producto_id, 'Producto conflicto',
    1, 0, 1, 50, 50
  ) RETURNING id INTO v_detalle_conflicto;
  INSERT INTO public.recepciones (
    tenant_id, numero, orden_id, fecha_recepcion, estado, activo
  ) VALUES (
    v_tenant_id, 'REC-VERIFY-440-C', v_orden_conflicto, now(), 'BORRADOR', true
  ) RETURNING id INTO v_recepcion_conflicto;
  BEGIN
    INSERT INTO public.recepcion_items (
      tenant_id, recepcion_id, detalle_id, producto_id, almacen_id,
      cantidad_recibida, calidad
    ) VALUES (
      v_tenant_id, v_recepcion_conflicto, v_detalle_conflicto,
      v_otro_producto_id, v_almacen_id, 1, 'OK'
    );
    RAISE EXCEPTION 'El producto cruzado debió ser rechazado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El producto cruzado debió ser rechazado' THEN RAISE; END IF;
  END;
  INSERT INTO public.recepcion_items (
    tenant_id, recepcion_id, detalle_id, producto_id, almacen_id,
    cantidad_recibida, calidad
  ) VALUES (
    v_tenant_id, v_recepcion_conflicto, v_detalle_conflicto,
    v_producto_id, v_almacen_id, 1, 'OK'
  );

  -- Una colisión outbox al final debe revertir stock, detalle, OC y recepción.
  INSERT INTO public.outbox_events (
    event_id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, retry_count, idempotency_key
  ) VALUES (
    gen_random_uuid(), v_tenant_id, 'recepcion', v_recepcion_conflicto::text,
    'recepcion.registrada', '{}'::jsonb, 'pending', 0,
    'recepcion:' || v_tenant_id::text || ':' || v_recepcion_conflicto::text
  );
  SELECT stock_actual INTO v_stock_antes FROM public.productos WHERE id = v_producto_id;
  BEGIN
    PERFORM public.cerrar_recepcion_tx(
      v_recepcion_conflicto, v_tenant_id, v_user_id::text, NULL
    );
    RAISE EXCEPTION 'La colisión outbox debió abortar el cierre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La colisión outbox debió abortar el cierre' THEN RAISE; END IF;
  END;
  IF (SELECT upper(estado::text) FROM public.recepciones WHERE id = v_recepcion_conflicto) <> 'BORRADOR'
     OR (SELECT cantidad_recibida FROM public.orden_compra_detalles WHERE id = v_detalle_conflicto) <> 0
     OR (SELECT stock_actual FROM public.productos WHERE id = v_producto_id) <> v_stock_antes THEN
    RAISE EXCEPTION 'El fallo de outbox dejó efectos parciales';
  END IF;

  -- Identidad fija para probar el guard de cierre directo como service_role.
  INSERT INTO public.recepciones (
    id, tenant_id, numero, orden_id, fecha_recepcion, estado, activo
  ) VALUES (
    v_guard_recepcion, v_tenant_id, 'REC-VERIFY-440-G',
    v_orden_conflicto, now(), 'BORRADOR', true
  );
END;
$$;

-- Evita que la prueba del guard pase por un simple error de permisos: el rol
-- debe alcanzar el UPDATE y ser rechazado específicamente por el trigger.
GRANT SELECT, UPDATE ON public.recepciones TO service_role;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    UPDATE public.recepciones
    SET estado = 'CERRADA'
    WHERE id = '00000000-0000-4400-8000-000000000001'::uuid;
    RAISE EXCEPTION 'El cierre directo como service_role debió fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%La recepción sólo puede cerrarse mediante cerrar_recepcion_tx%' THEN
      RAISE;
    END IF;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT upper(estado::text) FROM public.recepciones
      WHERE id = '00000000-0000-4400-8000-000000000001'::uuid) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'El guard no preservó la recepción BORRADOR';
  END IF;
END;
$$;

ROLLBACK;
