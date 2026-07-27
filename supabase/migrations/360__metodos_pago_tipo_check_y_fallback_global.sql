-- ============================================================================
-- 360__metodos_pago_tipo_check_y_fallback_global.sql
-- Dos huecos que quedaban tras 359:
--
-- 1. Un tenant sin filas propias en metodos_pago no encontraba el medio y la RPC
--    caia a COALESCE(v_metodo.tipo, 'EFECTIVO'), acreditando la gaveta con
--    cualquier medio de pago. En DEV hay 4 tenants en esa situacion. Ahora la
--    busqueda cae al catalogo global (tenant_id IS NULL), que si tiene la
--    taxonomia correcta, prefiriendo siempre la fila propia del tenant.
--
-- 2. metodos_pago.tipo no tenia CHECK, asi que un valor mal escrito pasaba sin
--    aviso y rompia la clasificacion de caja. Se restringe a la taxonomia del
--    catalogo global sembrado en 024.
-- ============================================================================

BEGIN;

ALTER TABLE public.metodos_pago
  DROP CONSTRAINT IF EXISTS ck_metodos_pago_tipo_taxonomia;

ALTER TABLE public.metodos_pago
  ADD CONSTRAINT ck_metodos_pago_tipo_taxonomia
  CHECK (tipo IS NULL OR upper(tipo) IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'BILLETERA_DIGITAL'));

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_full_tx_legacy_327(p_tenant_id uuid, p_usuario_id uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_cliente_documento text DEFAULT NULL::text, p_cliente_nombre text DEFAULT NULL::text, p_metodo_pago text DEFAULT 'efectivo'::text, p_items jsonb DEFAULT '[]'::jsonb, p_serie text DEFAULT 'B001'::text, p_sesion_caja_id uuid DEFAULT NULL::uuid, p_vendedor text DEFAULT NULL::text, p_max_descuento_pct numeric DEFAULT 0, p_idempotency_key text DEFAULT NULL::text, p_pagos jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(venta_id uuid, numero_ticket text, subtotal numeric, impuestos numeric, total numeric, impactos_aplicados boolean, caja_movimiento_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_existing public.ventas_pos;
  v_existing_movimiento_id uuid;
  v_sesion public.sesiones_caja;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric := 0;
  v_tasa_igv numeric := 0.18;
  v_igv_items numeric := NULL;
  v_correlativo text;
  v_ticket text;
  v_venta_id uuid;
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'B001'));
  v_idempotency text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_item jsonb;
  v_item_index integer := 0;
  v_producto public.productos;
  v_cantidad numeric;
  v_precio numeric;
  v_descuento numeric;
  v_subtotal_item numeric;
  v_impuesto_item numeric;
  v_total_item numeric;
  v_nuevo_stock numeric;
  v_pagos jsonb := COALESCE(p_pagos, '[]'::jsonb);
  v_pago jsonb;
  v_metodo public.metodos_pago;
  v_monto_efectivo numeric := 0;
  v_movimiento public.movimientos_caja;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED';
  END IF;

  IF v_idempotency IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.ventas_pos
    WHERE tenant_id = p_tenant_id
      AND idempotency_key = v_idempotency
    LIMIT 1;

    IF FOUND THEN
      SELECT mc.id
      INTO v_existing_movimiento_id
      FROM public.movimientos_caja mc
      WHERE mc.tenant_id = p_tenant_id
        AND mc.referencia_tipo = 'venta_pos'
        AND mc.referencia_documento = v_existing.id::text
      ORDER BY mc.created_at DESC
      LIMIT 1;

      RETURN QUERY
      SELECT
        v_existing.id,
        v_existing.numero_ticket,
        COALESCE(v_existing.subtotal, 0),
        COALESCE(v_existing.impuestos, 0),
        COALESCE(v_existing.total, 0),
        true,
        v_existing_movimiento_id;
      RETURN;
    END IF;
  END IF;

  IF p_sesion_caja_id IS NOT NULL THEN
    SELECT *
    INTO v_sesion
    FROM public.sesiones_caja
    WHERE id = p_sesion_caja_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESION_CAJA_NOT_FOUND: %', p_sesion_caja_id;
    END IF;

    IF lower(COALESCE(v_sesion.estado::text, 'abierta')) <> 'abierta'
      OR v_sesion.hora_cierre IS NOT NULL
      OR v_sesion.fecha_cierre IS NOT NULL THEN
      RAISE EXCEPTION 'SESION_CAJA_NOT_OPEN: %', p_sesion_caja_id;
    END IF;
  END IF;

  SELECT COALESCE(ec.igv_porcentaje / 100, 0.18)
  INTO v_tasa_igv
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  LIMIT 1;
  v_tasa_igv := COALESCE(v_tasa_igv, 0.18);

  SELECT COALESCE(
    SUM(
      CASE
        WHEN i.value ? 'subtotal' THEN app.to_numeric_or_zero(i.value->>'subtotal')
        ELSE GREATEST(
          0,
          app.to_numeric_or_zero(i.value->>'cantidad') * app.to_numeric_or_zero(COALESCE(i.value->>'precio_unitario', i.value->>'precio_original')) - app.to_numeric_or_zero(i.value->>'descuento_monto')
        )
      END
    ),
    0
  )
  INTO v_subtotal
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i(value);

  SELECT SUM(CASE WHEN i.value ? 'igv' THEN app.to_numeric_or_zero(i.value->>'igv') ELSE NULL END)
  INTO v_igv_items
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i(value);

  v_subtotal := round(v_subtotal, 2);
  -- El IGV llega repartido por item segun su afectacion del Catalogo 07. La tasa
  -- plana solo se usa si ningun item lo declara (clientes antiguos u offline).
  IF v_igv_items IS NULL THEN
    v_igv := round(v_subtotal * v_tasa_igv, 2);
  ELSE
    v_igv := round(v_igv_items, 2);
  END IF;
  v_total := round(v_subtotal + v_igv, 2);
  v_correlativo := public.obtener_siguiente_numero_pos(p_tenant_id, v_serie, 'TICKET', v_sesion.caja_id);
  v_ticket := v_serie || '-' || v_correlativo;

  INSERT INTO public.ventas_pos(
    id, tenant_id, cliente_id, usuario_id, cliente_documento, cliente_nombre,
    metodo_pago, sesion_caja_id, subtotal, impuestos, total, cpe_pendiente,
    estado, numero_ticket, serie, correlativo, idempotency_key, fecha, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, p_cliente_id, p_usuario_id, p_cliente_documento,
    p_cliente_nombre, p_metodo_pago, p_sesion_caja_id, v_subtotal, v_igv, v_total,
    true, 'PAGADA', v_ticket, v_serie, v_correlativo, v_idempotency, now(), now(), now()
  )
  RETURNING id INTO v_venta_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS t(value) LOOP
    v_item_index := v_item_index + 1;
    v_cantidad := app.to_numeric_or_zero(v_item->>'cantidad');
    v_precio := app.to_numeric_or_zero(COALESCE(v_item->>'precio_unitario', v_item->>'precio_original'));
    v_descuento := app.to_numeric_or_zero(v_item->>'descuento_monto');
    v_subtotal_item := CASE
      WHEN v_item ? 'subtotal' THEN app.to_numeric_or_zero(v_item->>'subtotal')
      ELSE GREATEST(0, v_cantidad * v_precio - v_descuento)
    END;
    v_subtotal_item := round(v_subtotal_item, 2);
    v_impuesto_item := CASE
      WHEN v_item ? 'igv' THEN round(app.to_numeric_or_zero(v_item->>'igv'), 2)
      ELSE round(v_subtotal_item * v_tasa_igv, 2)
    END;
    v_total_item := round(v_subtotal_item + v_impuesto_item, 2);

    SELECT *
    INTO v_producto
    FROM public.productos
    WHERE id = NULLIF(v_item->>'producto_id', '')::uuid
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NOT_FOUND: %', v_item->>'producto_id';
    END IF;

    INSERT INTO public.detalle_ventas_pos(
      tenant_id, venta_id, venta_pos_id, producto_id, item_index, cantidad,
      precio_unitario, descuento, impuesto, subtotal, total, nombre_producto,
      codigo_producto, unidad_medida, estado, metadata, created_at, updated_at
    )
    VALUES (
      p_tenant_id, v_venta_id, v_venta_id, v_producto.id, v_item_index, v_cantidad,
      v_precio, v_descuento, v_impuesto_item, v_subtotal_item, v_total_item,
      COALESCE(v_item #>> '{producto,nombre}', v_item->>'nombre', v_item->>'descripcion', v_producto.nombre, 'Producto'),
      COALESCE(v_item #>> '{producto,codigo}', v_item->>'codigo', v_producto.codigo, 'PROD'),
      COALESCE(v_item #>> '{producto,unidad_medida_sunat}', v_item #>> '{producto,unidad_medida}', v_item->>'unidad_medida_sunat', v_item->>'unidad_medida', v_producto.unidad_medida, 'NIU'),
      'CONFIRMADO',
      jsonb_build_object('source', 'pos', 'idempotency_key', v_idempotency),
      now(), now()
    );

    IF COALESCE(v_producto.es_servicio, false) = false AND COALESCE(v_producto.controla_stock, true) = true THEN
      v_nuevo_stock := round(COALESCE(v_producto.stock_actual, v_producto.stock, 0) - v_cantidad, 2);
      IF v_nuevo_stock < 0 THEN
        RAISE EXCEPTION 'STOCK_INSUFICIENTE: %', COALESCE(v_producto.nombre, v_producto.codigo, v_producto.id::text);
      END IF;

      UPDATE public.productos
      SET stock_actual = v_nuevo_stock,
          stock = v_nuevo_stock,
          updated_at = now()
      WHERE id = v_producto.id
        AND tenant_id = p_tenant_id;

      INSERT INTO public.movimientos_inventario(
        tenant_id, producto_id, tipo, tipo_movimiento, cantidad, referencia_tipo,
        referencia_id, created_by, motivo, notas, stock_actual, stock_reservado,
        activo, estado, metadata, created_at, updated_at
      )
      VALUES (
        p_tenant_id, v_producto.id, 'SALIDA', 'SALIDA', v_cantidad, 'VENTA_POS',
        v_venta_id, p_usuario_id::text, 'Venta POS ' || v_ticket,
        'Salida POS por venta ' || v_ticket, v_nuevo_stock::text,
        COALESCE(v_producto.stock_reservado, 0)::text, true, 'ACTIVO',
        jsonb_build_object('source', 'pos', 'idempotency_key', v_idempotency, 'numero_ticket', v_ticket),
        now(), now()
      );
    END IF;
  END LOOP;

  IF jsonb_typeof(v_pagos) = 'array' AND jsonb_array_length(v_pagos) > 0 THEN
    FOR v_pago IN SELECT value FROM jsonb_array_elements(v_pagos) AS p(value) LOOP
      SELECT *
      INTO v_metodo
      FROM public.metodos_pago mp
      WHERE (mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
        AND mp.activo = true
        AND (
          mp.id::text = COALESCE(v_pago->>'metodo_pago_id', v_pago->>'metodo_pago', v_pago->>'codigo')
          OR lower(mp.codigo) = lower(COALESCE(v_pago->>'codigo', v_pago->>'metodo_pago', ''))
        )
      ORDER BY (mp.tenant_id IS NULL)
      LIMIT 1;

      INSERT INTO public.ventas_pos_pagos(
        tenant_id, venta_pos_id, metodo_pago_id, metodo_pago_codigo,
        metodo_pago_tipo, monto, moneda, referencia, estado, metadata, created_at, updated_at
      )
      VALUES (
        p_tenant_id, v_venta_id, v_metodo.id,
        COALESCE(v_pago->>'codigo', v_metodo.codigo, 'efectivo'),
        COALESCE(v_pago->>'tipo', v_metodo.tipo, 'EFECTIVO'),
        app.to_numeric_or_zero(v_pago->>'monto'),
        COALESCE(v_pago->>'moneda', 'PEN'),
        NULLIF(v_pago->>'referencia', ''),
        'ACTIVO',
        jsonb_build_object('source', 'pos', 'idempotency_key', v_idempotency),
        now(), now()
      );

      IF upper(COALESCE(v_pago->>'tipo', v_metodo.tipo, '')) = 'EFECTIVO' THEN
        v_monto_efectivo := v_monto_efectivo + app.to_numeric_or_zero(v_pago->>'monto');
      END IF;
    END LOOP;
  ELSE
    SELECT *
    INTO v_metodo
    FROM public.metodos_pago mp
    WHERE (mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
      AND mp.activo = true
      AND (mp.id::text = COALESCE(p_metodo_pago, '') OR lower(mp.codigo) = lower(COALESCE(p_metodo_pago, 'efectivo')))
    ORDER BY (mp.tenant_id IS NULL)
    LIMIT 1;

    INSERT INTO public.ventas_pos_pagos(
      tenant_id, venta_pos_id, metodo_pago_id, metodo_pago_codigo,
      metodo_pago_tipo, monto, moneda, referencia, estado, metadata, created_at, updated_at
    )
    VALUES (
      p_tenant_id, v_venta_id, v_metodo.id, COALESCE(v_metodo.codigo, COALESCE(p_metodo_pago, 'efectivo')),
      COALESCE(v_metodo.tipo, 'EFECTIVO'), v_total, 'PEN', NULL, 'ACTIVO',
      jsonb_build_object('source', 'pos', 'idempotency_key', v_idempotency),
      now(), now()
    );

    IF upper(COALESCE(v_metodo.tipo, 'EFECTIVO')) = 'EFECTIVO' THEN
      v_monto_efectivo := v_total;
    END IF;
  END IF;

  IF v_monto_efectivo > 0 AND p_sesion_caja_id IS NOT NULL THEN
    v_movimiento := public.registrar_movimiento_caja(
      p_sesion_caja_id := p_sesion_caja_id,
      p_tipo_movimiento := 'VENTA',
      p_monto := v_monto_efectivo,
      p_referencia_documento := v_venta_id::text,
      p_referencia_tipo := 'venta_pos',
      p_motivo := 'Venta POS ' || v_ticket,
      p_usuario_id := p_usuario_id,
      p_metadata := jsonb_build_object(
        'metodo_pago', 'EFECTIVO',
        'metodo_codigo', 'efectivo',
        'pos_full_tx', true,
        'idempotency_key', v_idempotency
      )
    );
  END IF;

  INSERT INTO public.outbox_events(
    id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, idempotency_key, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, 'venta_pos', v_venta_id::text, 'venta_pos.registrada',
    jsonb_build_object(
      'ventaId', v_venta_id,
      'tenantId', p_tenant_id,
      'usuarioId', p_usuario_id,
      'clienteId', p_cliente_id,
      'total', v_total,
      'numeroTicket', v_ticket,
      'items', COALESCE(p_items, '[]'::jsonb),
      'impactosAplicados', true
    ),
    'pending', v_idempotency, now(), now()
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT v_venta_id, v_ticket, v_subtotal, v_igv, v_total, true, v_movimiento.id;
END;
$function$;

COMMENT ON FUNCTION public.pos_registrar_venta_full_tx_legacy_327(uuid, uuid, uuid, text, text, text, jsonb, text, uuid, text, numeric, text, jsonb)
IS 'Registra la venta POS liquidando el IGV por afectacion (Catalogo 07) y resolviendo el medio de pago contra el catalogo del tenant o, si no lo tiene, el global.';

COMMIT;
