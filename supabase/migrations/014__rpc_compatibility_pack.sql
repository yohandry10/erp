-- ============================================================================
-- 014__rpc_compatibility_pack.sql
-- RPC faltantes consumidos por backend/web.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Wrapper de compatibilidad para llamada rpc('app.set_tenant_context')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public."app.set_tenant_context"(
  p_tenant_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.set_tenant_context(p_tenant_id, p_user_id, false);
END;
$$;

-- ----------------------------------------------------------------------------
-- Ventas: cotizaciones -> pedidos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_stock_cotizacion(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item record;
  v_reservados integer := 0;
BEGIN
  FOR v_item IN
    SELECT cd.producto_id, COALESCE(cd.cantidad, 0) AS cantidad
    FROM public.cotizacion_detalles cd
    JOIN public.cotizaciones c ON c.id = cd.cotizacion_id
    WHERE cd.cotizacion_id = p_cotizacion_id
      AND c.tenant_id = p_tenant_id
  LOOP
    IF v_item.cantidad > 0 THEN
      PERFORM public.reservar_stock_atomico(
        v_item.producto_id,
        v_item.cantidad,
        'COTIZACION',
        p_cotizacion_id::text,
        'Reserva por cotización'
      );
      v_reservados := v_reservados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'productos_reservados', v_reservados,
    'cotizacion_id', p_cotizacion_id
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
  LOOP
    IF v_item.cantidad > 0 THEN
      PERFORM public.decrementar_stock_reservado(v_item.producto_id, v_item.cantidad);
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

CREATE OR REPLACE FUNCTION public.crear_pedido_completo(
  p_pedido jsonb,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido_id uuid;
  v_item jsonb;
  v_tenant_id uuid;
BEGIN
  v_tenant_id := NULLIF(p_pedido->>'tenant_id', '')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id es requerido en p_pedido';
  END IF;

  INSERT INTO public.pedidos_venta (
    id, tenant_id, numero, cotizacion_id, cliente_id, fecha_pedido, estado,
    subtotal, igv, total, observaciones, created_by, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_tenant_id,
    p_pedido->>'numero',
    NULLIF(p_pedido->>'cotizacion_id', '')::uuid,
    NULLIF(p_pedido->>'cliente_id', '')::uuid,
    COALESCE(NULLIF(p_pedido->>'fecha_pedido', '')::date, current_date),
    COALESCE(NULLIF(p_pedido->>'estado', ''), 'BORRADOR'),
    app.to_numeric_or_zero(p_pedido->>'subtotal'),
    app.to_numeric_or_zero(p_pedido->>'igv'),
    app.to_numeric_or_zero(p_pedido->>'total'),
    p_pedido->>'observaciones',
    NULLIF(p_pedido->>'created_by', '')::uuid,
    now(),
    now()
  )
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_detalle, '[]'::jsonb))
  LOOP
    INSERT INTO public.pedidos_venta_detalle (
      id, tenant_id, pedido_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_tenant_id,
      v_pedido_id,
      NULLIF(v_item->>'producto_id', '')::uuid,
      v_item->>'descripcion',
      app.to_numeric_or_zero(v_item->>'cantidad'),
      app.to_numeric_or_zero(v_item->>'precio_unitario'),
      app.to_numeric_or_zero(v_item->>'subtotal'),
      now(),
      now()
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'pedido_id', v_pedido_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.convertir_cotizacion_a_pedido(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cot record;
  v_pedido_id uuid;
  v_numero text;
  v_next integer;
BEGIN
  SELECT *
  INTO v_cot
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  IF COALESCE(v_cot.estado, '') = 'CONVERTIDA' THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;

  SELECT COALESCE(MAX(app.to_int_or_zero(regexp_replace(numero::text, '[^0-9]', '', 'g'))), 0) + 1
  INTO v_next
  FROM public.pedidos_venta
  WHERE tenant_id = p_tenant_id;

  v_numero := 'PED-' || to_char(current_date, 'YYYY') || '-' || lpad(v_next::text, 4, '0');

  INSERT INTO public.pedidos_venta (
    id, tenant_id, numero, cotizacion_id, cliente_id, fecha_pedido, estado,
    subtotal, igv, total, observaciones, created_by, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    p_tenant_id,
    v_numero,
    p_cotizacion_id,
    v_cot.cliente_id,
    current_date,
    'PENDIENTE',
    COALESCE(v_cot.subtotal, 0),
    COALESCE(v_cot.igv, 0),
    COALESCE(v_cot.total, 0),
    COALESCE(p_notas, v_cot.observaciones),
    p_user_id,
    now(),
    now()
  )
  RETURNING id INTO v_pedido_id;

  INSERT INTO public.pedidos_venta_detalle (
    id, tenant_id, pedido_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    p_tenant_id,
    v_pedido_id,
    cd.producto_id,
    COALESCE(cd.descripcion, cd.producto_nombre),
    COALESCE(cd.cantidad, 0),
    COALESCE(cd.precio_unitario, 0),
    COALESCE(cd.subtotal, 0),
    now(),
    now()
  FROM public.cotizacion_detalles cd
  WHERE cd.cotizacion_id = p_cotizacion_id;

  UPDATE public.cotizaciones
  SET
    estado = 'CONVERTIDA',
    fecha_conversion = now(),
    convertido_por = p_user_id,
    pedido_id = v_pedido_id,
    updated_at = now()
  WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'pedido_id', v_pedido_id,
    'pedido_numero', v_numero,
    'cotizacion_id', p_cotizacion_id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- CPE / documentos / numeracion SUNAT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_documento_desde_cpe(p_cpe_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cpe record;
  v_doc_id uuid;
  v_tipo text;
BEGIN
  SELECT * INTO v_cpe
  FROM public.cpe
  WHERE id = p_cpe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE no encontrado: %', p_cpe_id;
  END IF;

  IF v_cpe.documento_id IS NOT NULL THEN
    RETURN v_cpe.documento_id;
  END IF;

  v_tipo := CASE
    WHEN v_cpe.tipo_documento IN ('01', 'FACTURA') THEN 'FACTURA'
    WHEN v_cpe.tipo_documento IN ('03', 'BOLETA') THEN 'BOLETA'
    ELSE COALESCE(v_cpe.tipo_documento, 'FACTURA')
  END;

  INSERT INTO public.documentos (
    id,
    tenant_id,
    tipo_documento,
    serie,
    numero,
    fecha_emision,
    fecha_vencimiento,
    moneda,
    subtotal,
    impuesto_igv,
    total,
    estado,
    estado_sunat,
    emisor_ruc,
    emisor_razon_social,
    emisor_direccion,
    receptor_documento,
    receptor_nombre,
    receptor_direccion,
    receptor_tipo_doc,
    observaciones,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_cpe.tenant_id,
    v_tipo,
    v_cpe.serie,
    COALESCE(v_cpe.numero, v_cpe.id::text),
    COALESCE(v_cpe.fecha_emision::date, current_date),
    COALESCE(v_cpe.fecha_vencimiento, COALESCE(v_cpe.fecha_emision::date, current_date)),
    COALESCE(v_cpe.moneda, 'PEN'),
    COALESCE(v_cpe.total_gravadas, v_cpe.total_venta, 0),
    COALESCE(v_cpe.total_igv, 0),
    COALESCE(v_cpe.total_venta, v_cpe.total, 0),
    CASE
      WHEN COALESCE(v_cpe.sunat_status, v_cpe.estado_sunat, v_cpe.estado) IN ('ACEPTADO', 'ACCEPTED') THEN 'EMITIDO'
      WHEN COALESCE(v_cpe.sunat_status, v_cpe.estado_sunat, v_cpe.estado) IN ('RECHAZADO', 'REJECTED') THEN 'ANULADO'
      ELSE 'BORRADOR'
    END,
    v_cpe.estado_sunat,
    COALESCE(v_cpe.ruc_emisor, '20000000000'),
    COALESCE(v_cpe.razon_social_emisor, 'EMISOR'),
    COALESCE(v_cpe.direccion_emisor, 'DIRECCION NO DEFINIDA'),
    COALESCE(v_cpe.documento_receptor, '00000000'),
    COALESCE(v_cpe.razon_social_receptor, 'CLIENTE'),
    v_cpe.direccion_receptor,
    COALESCE(v_cpe.tipo_documento_receptor, 'RUC'),
    format('Documento creado desde CPE %s', v_cpe.id),
    now(),
    now()
  )
  RETURNING id INTO v_doc_id;

  UPDATE public.cpe
  SET documento_id = v_doc_id, updated_at = now()
  WHERE id = p_cpe_id;

  RETURN v_doc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_numero_comunicacion_baja(
  p_tenant_id uuid,
  p_fecha date
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_correlativo integer;
BEGIN
  SELECT COALESCE(MAX(app.to_int_or_zero(substring(numero_comunicacion from 13))), 0) + 1
  INTO v_correlativo
  FROM public.comunicaciones_baja
  WHERE tenant_id = p_tenant_id
    AND fecha_generacion = p_fecha;

  RETURN 'RA-' || to_char(p_fecha, 'YYYYMMDD') || '-' || lpad(v_correlativo::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_numero_resumen_diario(
  p_tenant_id uuid,
  p_fecha date
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_correlativo integer;
BEGIN
  SELECT COALESCE(MAX(app.to_int_or_zero(substring(numero_resumen from 13))), 0) + 1
  INTO v_correlativo
  FROM public.resumenes_diarios
  WHERE tenant_id = p_tenant_id
    AND fecha_generacion = p_fecha;

  RETURN 'RC-' || to_char(p_fecha, 'YYYYMMDD') || '-' || lpad(v_correlativo::text, 3, '0');
END;
$$;

-- ----------------------------------------------------------------------------
-- POS auditoria
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_evento_pos(
  p_tenant_id uuid,
  p_sesion_caja_id uuid,
  p_usuario_id uuid,
  p_tipo_evento varchar,
  p_subtipo varchar DEFAULT NULL,
  p_venta_id uuid DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_item_index int DEFAULT NULL,
  p_datos jsonb DEFAULT '{}'::jsonb,
  p_ip_address inet DEFAULT NULL,
  p_dispositivo varchar DEFAULT NULL,
  p_requiere_supervisor boolean DEFAULT false,
  p_supervisor_id uuid DEFAULT NULL,
  p_justificacion text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.eventos_pos (
    id,
    tenant_id,
    sesion_caja_id,
    usuario_id,
    tipo_evento,
    subtipo,
    venta_id,
    producto_id,
    item_index,
    datos,
    ip_address,
    dispositivo,
    requiere_supervisor,
    supervisor_id,
    justificacion,
    "timestamp",
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_tenant_id,
    p_sesion_caja_id,
    p_usuario_id,
    p_tipo_evento,
    p_subtipo,
    p_venta_id,
    p_producto_id,
    p_item_index,
    COALESCE(p_datos, '{}'::jsonb),
    p_ip_address,
    p_dispositivo,
    COALESCE(p_requiere_supervisor, false),
    p_supervisor_id,
    p_justificacion,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.detectar_patrones_sospechosos_pos(
  p_tenant_id uuid,
  p_sesion_caja_id uuid DEFAULT NULL,
  p_horas_atras integer DEFAULT 24
)
RETURNS TABLE (
  patron varchar,
  cantidad bigint,
  descripcion text,
  nivel_riesgo varchar
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'APERTURA_CAJON_SIN_VENTA'::varchar,
    COUNT(*)::bigint,
    'Aperturas de cajón sin venta asociada'::text,
    CASE WHEN COUNT(*) > 5 THEN 'ALTO'
         WHEN COUNT(*) > 2 THEN 'MEDIO'
         ELSE 'BAJO'
    END::varchar
  FROM public.eventos_pos
  WHERE tenant_id = p_tenant_id
    AND tipo_evento = 'APERTURA_CAJON_SIN_VENTA'
    AND "timestamp" > now() - make_interval(hours => GREATEST(p_horas_atras, 1))
    AND (p_sesion_caja_id IS NULL OR sesion_caja_id = p_sesion_caja_id)
  HAVING COUNT(*) > 0

  UNION ALL
  SELECT
    'ANULACION_ITEM_EXCESIVA'::varchar,
    COUNT(*)::bigint,
    'Anulaciones de ítems después de escanear'::text,
    CASE WHEN COUNT(*) > 10 THEN 'ALTO'
         WHEN COUNT(*) > 5 THEN 'MEDIO'
         ELSE 'BAJO'
    END::varchar
  FROM public.eventos_pos
  WHERE tenant_id = p_tenant_id
    AND tipo_evento = 'ANULACION_ITEM'
    AND "timestamp" > now() - make_interval(hours => GREATEST(p_horas_atras, 1))
    AND (p_sesion_caja_id IS NULL OR sesion_caja_id = p_sesion_caja_id)
  HAVING COUNT(*) > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- Inventario: funciones atomicas de stock
-- ----------------------------------------------------------------------------
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
  v_tenant uuid;
  v_stock_actual numeric;
  v_stock_reservado numeric;
  v_mov_id uuid;
BEGIN
  IF p_producto_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Parámetros inválidos para reservar stock';
  END IF;

  SELECT tenant_id, COALESCE(stock_actual, stock, 0), COALESCE(stock_reservado, 0)
    INTO v_tenant, v_stock_actual, v_stock_reservado
  FROM public.productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_producto_id;
  END IF;

  IF (v_stock_actual - v_stock_reservado) < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para producto %', p_producto_id;
  END IF;

  UPDATE public.productos
  SET stock_reservado = COALESCE(stock_reservado, 0) + p_cantidad,
      updated_at = now()
  WHERE id = p_producto_id;

  INSERT INTO public.movimientos_inventario (
    id, tenant_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id, notas, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_tenant,
    p_producto_id,
    'RESERVA',
    p_cantidad,
    p_referencia_tipo,
    NULLIF(p_referencia_id, '')::uuid,
    COALESCE(p_notas, 'Reserva de stock'),
    now(),
    now()
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrementar_stock_reservado(
  p_producto_id uuid,
  p_cantidad numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_producto_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.productos
  SET stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0),
      updated_at = now()
  WHERE id = p_producto_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.descontar_stock_y_liberar_reserva(
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
  v_tenant uuid;
  v_stock_actual numeric;
  v_mov_id uuid;
BEGIN
  IF p_producto_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Parámetros inválidos';
  END IF;

  SELECT tenant_id, COALESCE(stock_actual, stock, 0)
    INTO v_tenant, v_stock_actual
  FROM public.productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF v_stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente';
  END IF;

  UPDATE public.productos
  SET
    stock_actual = GREATEST(COALESCE(stock_actual, stock, 0) - p_cantidad, 0),
    stock = GREATEST(COALESCE(stock_actual, stock, 0) - p_cantidad, 0),
    stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0),
    updated_at = now()
  WHERE id = p_producto_id;

  INSERT INTO public.movimientos_inventario (
    id, tenant_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id, notas, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_tenant,
    p_producto_id,
    'SALIDA',
    p_cantidad,
    COALESCE(p_referencia_tipo, 'SALIDA'),
    NULLIF(p_referencia_id, '')::uuid,
    COALESCE(p_notas, 'Salida de stock'),
    now(),
    now()
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_almacen(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_referencia_tipo text,
  p_referencia_id uuid,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_mov_id uuid;
BEGIN
  IF p_producto_id IS NULL OR p_almacen_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Parámetros inválidos para movimiento de almacén';
  END IF;

  SELECT tenant_id INTO v_tenant
  FROM public.productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  INSERT INTO public.producto_existencias (
    id, tenant_id, producto_id, almacen_id, ubicacion_id, lote, fecha_expiracion,
    stock_actual, stock_reservado, stock_danado, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_tenant, p_producto_id, p_almacen_id, p_ubicacion_id, p_lote, p_fecha_expiracion,
    0, 0, 0, now(), now()
  )
  ON CONFLICT (tenant_id, producto_id, almacen_id)
  DO NOTHING;

  IF p_tipo = 'ENTRADA' THEN
    UPDATE public.producto_existencias
    SET stock_actual = COALESCE(stock_actual, 0) + p_cantidad, updated_at = now()
    WHERE tenant_id = v_tenant AND producto_id = p_producto_id AND almacen_id = p_almacen_id;
  ELSIF p_tipo = 'SALIDA' THEN
    UPDATE public.producto_existencias
    SET stock_actual = GREATEST(COALESCE(stock_actual, 0) - p_cantidad, 0), updated_at = now()
    WHERE tenant_id = v_tenant AND producto_id = p_producto_id AND almacen_id = p_almacen_id;
  ELSIF p_tipo = 'RESERVA' THEN
    UPDATE public.producto_existencias
    SET stock_reservado = COALESCE(stock_reservado, 0) + p_cantidad, updated_at = now()
    WHERE tenant_id = v_tenant AND producto_id = p_producto_id AND almacen_id = p_almacen_id;
  ELSIF p_tipo = 'LIBERACION' THEN
    UPDATE public.producto_existencias
    SET stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - p_cantidad, 0), updated_at = now()
    WHERE tenant_id = v_tenant AND producto_id = p_producto_id AND almacen_id = p_almacen_id;
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento no soportado: %', p_tipo;
  END IF;

  UPDATE public.productos p
  SET
    stock_actual = COALESCE(t.stock_actual, 0),
    stock = COALESCE(t.stock_actual, 0),
    stock_reservado = COALESCE(t.stock_reservado, 0),
    updated_at = now()
  FROM (
    SELECT
      producto_id,
      SUM(COALESCE(stock_actual, 0)) AS stock_actual,
      SUM(COALESCE(stock_reservado, 0)) AS stock_reservado
    FROM public.producto_existencias
    WHERE tenant_id = v_tenant
      AND producto_id = p_producto_id
    GROUP BY producto_id
  ) t
  WHERE p.id = p_producto_id;

  INSERT INTO public.movimientos_inventario (
    id, tenant_id, producto_id, almacen_id, ubicacion_id, lote, fecha_expiracion,
    tipo, cantidad, referencia_tipo, referencia_id, notas, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_tenant, p_producto_id, p_almacen_id, p_ubicacion_id, p_lote, p_fecha_expiracion,
    p_tipo, p_cantidad, p_referencia_tipo, p_referencia_id, p_notas, now(), now()
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_entrada_stock_atomico(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.registrar_movimiento_almacen(
    p_producto_id,
    p_almacen_id,
    'ENTRADA',
    p_cantidad,
    COALESCE(p_referencia_tipo, 'ENTRADA'),
    NULLIF(p_referencia_id, '')::uuid,
    p_notas,
    p_ubicacion_id,
    p_lote,
    p_fecha_expiracion::date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rma_retorno_inventario(
  p_rma_item_id uuid,
  p_cantidad numeric,
  p_almacen_id uuid,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_item record;
BEGIN
  SELECT *
  INTO v_item
  FROM public.rma_items
  WHERE id = p_rma_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA item no encontrado';
  END IF;

  PERFORM public.registrar_movimiento_almacen(
    v_item.producto_id,
    p_almacen_id,
    'ENTRADA',
    p_cantidad,
    'RMA',
    v_item.rma_id,
    'Retorno RMA',
    p_ubicacion_id,
    p_lote,
    p_fecha_expiracion
  );

  UPDATE public.rma_items
  SET
    cantidad_devuelta = COALESCE(cantidad_devuelta, 0) + p_cantidad,
    estado = CASE
      WHEN COALESCE(cantidad_devuelta, 0) + p_cantidad >= COALESCE(cantidad_autorizada, p_cantidad)
        THEN 'CERRADO'
      ELSE 'PARCIAL'
    END,
    updated_at = now()
  WHERE id = p_rma_item_id;

  INSERT INTO public.rma_eventos (
    id, tenant_id, rma_id, tipo, descripcion, metadata, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_item.tenant_id,
    v_item.rma_id,
    'RETORNO_INVENTARIO',
    'Ingreso de stock por RMA',
    jsonb_build_object('rma_item_id', p_rma_item_id, 'cantidad', p_cantidad),
    now(),
    now()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Caja: configuracion efectiva
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_configuracion_efectiva_caja(
  p_tenant_id uuid,
  p_caja_id uuid
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  caja_id uuid,
  monto_apertura_min numeric(10,2),
  monto_apertura_max numeric(10,2),
  requiere_supervisor_fuera_rango boolean,
  tolerancia_diferencia_cierre numeric(10,2)
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.tenant_id,
    c.caja_id,
    c.monto_apertura_min,
    c.monto_apertura_max,
    c.requiere_supervisor_fuera_rango,
    c.tolerancia_diferencia_cierre
  FROM public.configuracion_caja c
  WHERE c.tenant_id = p_tenant_id
    AND c.caja_id = p_caja_id
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.tenant_id,
    c.caja_id,
    c.monto_apertura_min,
    c.monto_apertura_max,
    c.requiere_supervisor_fuera_rango,
    c.tolerancia_diferencia_cierre
  FROM public.configuracion_caja c
  WHERE c.tenant_id = p_tenant_id
    AND c.caja_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    gen_random_uuid(),
    p_tenant_id,
    NULL::uuid,
    0.00::numeric(10,2),
    50000.00::numeric(10,2),
    false,
    10.00::numeric(10,2);
END;
$$;

-- ----------------------------------------------------------------------------
-- Caja: registrar movimiento + validacion de integridad
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_movimiento_caja(
  p_sesion_caja_id uuid,
  p_tipo_movimiento varchar,
  p_monto numeric,
  p_referencia_documento varchar DEFAULT NULL,
  p_referencia_tipo varchar DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_supervisor_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS public.movimientos_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_sesion public.sesiones_caja;
  v_ultimo public.movimientos_caja;
  v_secuencia integer;
  v_saldo_anterior numeric(14,2);
  v_row public.movimientos_caja;
BEGIN
  SELECT * INTO v_sesion
  FROM public.sesiones_caja
  WHERE id = p_sesion_caja_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de caja no encontrada';
  END IF;

  IF COALESCE(v_sesion.estado, 'ABIERTA') <> 'ABIERTA' THEN
    RAISE EXCEPTION 'La sesión de caja no está ABIERTA (estado=%)', v_sesion.estado;
  END IF;

  IF COALESCE(v_sesion.congelada, false) THEN
    RAISE EXCEPTION 'La sesión de caja está congelada';
  END IF;

  SELECT * INTO v_ultimo
  FROM public.movimientos_caja
  WHERE sesion_caja_id = p_sesion_caja_id
  ORDER BY secuencia DESC
  LIMIT 1;

  v_secuencia := COALESCE(v_ultimo.secuencia, 0) + 1;
  v_saldo_anterior := COALESCE(v_ultimo.saldo_nuevo, v_sesion.monto_inicial, v_sesion.monto_inicio, 0);

  INSERT INTO public.movimientos_caja (
    id,
    tenant_id,
    sesion_caja_id,
    secuencia,
    tipo_movimiento,
    monto,
    saldo_anterior,
    saldo_nuevo,
    referencia_documento,
    referencia_tipo,
    motivo,
    usuario_id,
    supervisor_id,
    "timestamp",
    ip_address,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_sesion.tenant_id,
    p_sesion_caja_id,
    v_secuencia,
    p_tipo_movimiento,
    p_monto,
    v_saldo_anterior,
    v_saldo_anterior + p_monto,
    p_referencia_documento,
    p_referencia_tipo,
    p_motivo,
    p_usuario_id,
    p_supervisor_id,
    now(),
    p_ip_address,
    COALESCE(p_metadata, '{}'::jsonb),
    now(),
    now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_integridad_sesion(p_sesion_caja_id uuid)
RETURNS TABLE (
  valido boolean,
  errores text[]
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_errores text[] := ARRAY[]::text[];
  v_total integer := 0;
  v_max_seq integer := 0;
  v_inconsistencias integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sesiones_caja WHERE id = p_sesion_caja_id) THEN
    v_errores := array_append(v_errores, 'Sesión no encontrada');
    RETURN QUERY SELECT false, v_errores;
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(MAX(secuencia), 0)
  INTO v_total, v_max_seq
  FROM public.movimientos_caja
  WHERE sesion_caja_id = p_sesion_caja_id;

  IF v_total > 0 AND v_max_seq <> v_total THEN
    v_errores := array_append(v_errores, 'Gaps en secuencia de movimientos');
  END IF;

  SELECT COUNT(*)
  INTO v_inconsistencias
  FROM public.movimientos_caja
  WHERE sesion_caja_id = p_sesion_caja_id
    AND round(COALESCE(saldo_anterior, 0) + COALESCE(monto, 0), 2) <> round(COALESCE(saldo_nuevo, 0), 2);

  IF v_inconsistencias > 0 THEN
    v_errores := array_append(v_errores, 'Inconsistencia matemática en saldos');
  END IF;

  RETURN QUERY
  SELECT COALESCE(array_length(v_errores, 1), 0) = 0, v_errores;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_metricas_cajero(
  p_tenant_id uuid,
  p_cajero_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
)
RETURNS TABLE (
  total_turnos bigint,
  duracion_promedio_horas numeric,
  total_ventas numeric,
  promedio_ventas_turno numeric,
  total_diferencias numeric,
  turnos_cuadrados bigint,
  turnos_sobrante bigint,
  turnos_faltante bigint,
  porcentaje_efectividad numeric,
  transacciones_totales bigint,
  transacciones_por_hora numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH sesiones AS (
    SELECT
      sc.id,
      sc.tenant_id,
      sc.cajero_id,
      COALESCE(sc.hora_apertura, sc.fecha_apertura) AS apertura,
      COALESCE(sc.hora_cierre, sc.fecha_cierre) AS cierre,
      COALESCE(sc.monto_inicio, sc.monto_inicial, 0) AS monto_inicio,
      COALESCE(sc.monto_esperado, 0) AS monto_esperado,
      COALESCE(sc.diferencia, 0) AS diferencia
    FROM public.sesiones_caja sc
    WHERE sc.tenant_id = p_tenant_id
      AND sc.cajero_id = p_cajero_id
      AND COALESCE(sc.estado, 'ABIERTA') = 'CERRADA'
      AND COALESCE(sc.hora_cierre, sc.fecha_cierre) IS NOT NULL
      AND (p_fecha_desde IS NULL OR COALESCE(sc.hora_apertura, sc.fecha_apertura)::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR COALESCE(sc.hora_apertura, sc.fecha_apertura)::date <= p_fecha_hasta)
  ),
  agg AS (
    SELECT
      COUNT(*)::bigint AS total_turnos,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (cierre - apertura)) / 3600), 0)::numeric, 2) AS duracion_promedio_horas,
      ROUND(COALESCE(SUM(monto_esperado - monto_inicio), 0)::numeric, 2) AS total_ventas,
      ROUND(COALESCE(AVG(monto_esperado - monto_inicio), 0)::numeric, 2) AS promedio_ventas_turno,
      ROUND(COALESCE(SUM(diferencia), 0)::numeric, 2) AS total_diferencias,
      COUNT(*) FILTER (WHERE diferencia = 0)::bigint AS turnos_cuadrados,
      COUNT(*) FILTER (WHERE diferencia > 0)::bigint AS turnos_sobrante,
      COUNT(*) FILTER (WHERE diferencia < 0)::bigint AS turnos_faltante,
      ROUND(
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE ((COUNT(*) FILTER (WHERE diferencia = 0))::numeric / COUNT(*)::numeric) * 100
        END
      , 2) AS porcentaje_efectividad,
      ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (cierre - apertura)) / 3600), 0)::numeric, 2) AS total_horas
    FROM sesiones
  ),
  trx AS (
    SELECT
      COUNT(*)::bigint AS transacciones_totales
    FROM public.movimientos_caja mc
    JOIN sesiones s ON s.id = mc.sesion_caja_id
    WHERE COALESCE(mc.tipo_movimiento, '') = 'VENTA'
  )
  SELECT
    a.total_turnos,
    a.duracion_promedio_horas,
    a.total_ventas,
    a.promedio_ventas_turno,
    a.total_diferencias,
    a.turnos_cuadrados,
    a.turnos_sobrante,
    a.turnos_faltante,
    a.porcentaje_efectividad,
    t.transacciones_totales,
    ROUND(CASE WHEN a.total_horas = 0 THEN 0 ELSE t.transacciones_totales::numeric / a.total_horas END, 2) AS transacciones_por_hora
  FROM agg a
  CROSS JOIN trx t;
$$;

-- ----------------------------------------------------------------------------
-- Tesoreria: pagos en lote
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procesar_pago_lote(
  p_tenant_id uuid,
  p_cuenta_bancaria_id uuid,
  p_fecha_pago date,
  p_metodo_pago text,
  p_referencia_lote text,
  p_observaciones text,
  p_pagos jsonb,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cuenta record;
  v_pago jsonb;
  v_cxp record;
  v_monto_pago numeric;
  v_monto_total numeric := 0;
  v_saldo_cuenta numeric;
  v_saldo_nuevo numeric;
  v_mov_id uuid;
  v_result_pagos jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF COALESCE(jsonb_typeof(p_pagos), '') <> 'array' OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un pago en el lote';
  END IF;

  IF p_referencia_lote IS NOT NULL THEN
    SELECT resultado INTO v_result
    FROM public.pagos_lote
    WHERE tenant_id = p_tenant_id
      AND referencia_lote = p_referencia_lote
    LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  SELECT id, nombre, moneda, COALESCE(saldo, 0) AS saldo, COALESCE(permite_sobregiro, false) AS permite_sobregiro, COALESCE(activa, true) AS activa
  INTO v_cuenta
  FROM public.cuentas_bancarias
  WHERE id = p_cuenta_bancaria_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_cuenta.activa THEN
    RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva';
  END IF;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    SELECT
      c.id,
      c.proveedor_id,
      COALESCE(c.estado, 'PENDIENTE') AS estado,
      COALESCE(c.saldo, c.saldo_pendiente, 0) AS saldo,
      COALESCE(c.total, c.subtotal + c.igv, c.saldo, 0) AS total,
      COALESCE(c.moneda, 'PEN') AS moneda,
      c.numero_documento,
      p.razon_social AS proveedor_nombre
    INTO v_cxp
    FROM public.cuentas_por_pagar c
    LEFT JOIN public.proveedores p ON p.id = c.proveedor_id
    WHERE c.id = NULLIF(v_pago->>'cxp_id', '')::uuid
      AND c.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CxP no encontrada: %', v_pago->>'cxp_id';
    END IF;

    IF v_cxp.estado = 'ANULADA' THEN
      RAISE EXCEPTION 'No se puede pagar una CxP anulada';
    END IF;

    v_monto_pago := COALESCE((v_pago->>'monto')::numeric, v_cxp.saldo);
    IF v_monto_pago <= 0 OR v_monto_pago > v_cxp.saldo THEN
      RAISE EXCEPTION 'Monto inválido para CxP %', v_cxp.id;
    END IF;

    v_monto_total := v_monto_total + v_monto_pago;
  END LOOP;

  IF NOT v_cuenta.permite_sobregiro AND v_cuenta.saldo < v_monto_total THEN
    RAISE EXCEPTION 'Saldo insuficiente en cuenta bancaria';
  END IF;

  v_saldo_cuenta := v_cuenta.saldo;

  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    SELECT
      c.id,
      c.proveedor_id,
      COALESCE(c.estado, 'PENDIENTE') AS estado,
      COALESCE(c.saldo, c.saldo_pendiente, 0) AS saldo,
      COALESCE(c.total, c.subtotal + c.igv, c.saldo, 0) AS total,
      COALESCE(c.moneda, 'PEN') AS moneda,
      c.numero_documento,
      p.razon_social AS proveedor_nombre
    INTO v_cxp
    FROM public.cuentas_por_pagar c
    LEFT JOIN public.proveedores p ON p.id = c.proveedor_id
    WHERE c.id = NULLIF(v_pago->>'cxp_id', '')::uuid
      AND c.tenant_id = p_tenant_id
    FOR UPDATE;

    v_monto_pago := COALESCE((v_pago->>'monto')::numeric, v_cxp.saldo);
    v_saldo_nuevo := round(v_saldo_cuenta - v_monto_pago, 2);

    UPDATE public.cuentas_por_pagar
    SET
      saldo = round(v_cxp.saldo - v_monto_pago, 2),
      saldo_pendiente = round(v_cxp.saldo - v_monto_pago, 2),
      estado = CASE
        WHEN round(v_cxp.saldo - v_monto_pago, 2) <= 0 THEN 'PAGADA'
        ELSE 'PARCIAL'
      END,
      ultimo_pago = p_fecha_pago,
      updated_at = now()
    WHERE id = v_cxp.id;

    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
      metodo_pago, cxp_id, proveedor_id, conciliado, saldo_anterior, saldo_nuevo, created_by, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      p_tenant_id,
      p_cuenta_bancaria_id,
      'CARGO',
      v_monto_pago,
      p_fecha_pago,
      COALESCE(p_referencia_lote, 'LOTE') || ' - Pago proveedor',
      p_referencia_lote,
      p_metodo_pago,
      v_cxp.id,
      v_cxp.proveedor_id,
      false,
      v_saldo_cuenta,
      v_saldo_nuevo,
      p_created_by,
      now(),
      now()
    )
    RETURNING id INTO v_mov_id;

    v_result_pagos := v_result_pagos || jsonb_build_object(
      'cxp_id', v_cxp.id,
      'proveedor_id', v_cxp.proveedor_id,
      'proveedor', COALESCE(v_cxp.proveedor_nombre, v_cxp.proveedor_id::text),
      'numero_documento', v_cxp.numero_documento,
      'monto', v_monto_pago,
      'saldo_anterior', v_cxp.saldo,
      'saldo_nuevo', round(v_cxp.saldo - v_monto_pago, 2),
      'estado_anterior', v_cxp.estado,
      'estado_nuevo', CASE WHEN round(v_cxp.saldo - v_monto_pago, 2) <= 0 THEN 'PAGADA' ELSE 'PARCIAL' END,
      'movimiento_bancario_id', v_mov_id
    );

    v_saldo_cuenta := v_saldo_nuevo;
  END LOOP;

  UPDATE public.cuentas_bancarias
  SET saldo = v_saldo_cuenta, saldo_actual = v_saldo_cuenta, updated_at = now()
  WHERE id = p_cuenta_bancaria_id
    AND tenant_id = p_tenant_id;

  v_result := jsonb_build_object(
    'success', true,
    'lote_id', p_referencia_lote,
    'total_pagos', jsonb_array_length(p_pagos),
    'monto_total', round(v_monto_total, 2),
    'pagos_exitosos', jsonb_array_length(v_result_pagos),
    'pagos_fallidos', 0,
    'cuenta_bancaria', jsonb_build_object(
      'id', v_cuenta.id,
      'nombre', v_cuenta.nombre,
      'moneda', v_cuenta.moneda,
      'saldo_anterior', v_cuenta.saldo,
      'saldo_nuevo', v_saldo_cuenta
    ),
    'pagos', v_result_pagos
  );

  INSERT INTO public.pagos_lote (
    id, tenant_id, referencia_lote, cuenta_bancaria_id, fecha_pago, metodo_pago,
    monto_total, pagos, resultado, estado, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_referencia_lote, p_cuenta_bancaria_id, p_fecha_pago, p_metodo_pago,
    round(v_monto_total, 2), p_pagos, v_result, 'PROCESADO', now(), now()
  )
  ON CONFLICT (tenant_id, referencia_lote)
  DO UPDATE SET resultado = EXCLUDED.resultado, updated_at = now();

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- Bot ayuda
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_ayuda(
  p_query text,
  p_rol varchar DEFAULT NULL,
  p_categoria varchar DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_limite int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  pregunta text,
  respuesta text,
  pasos jsonb,
  url_modulo varchar,
  categoria varchar,
  relevancia float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.pregunta,
    kb.respuesta,
    kb.pasos,
    kb.url_modulo::varchar,
    kb.categoria::varchar,
    ts_rank(
      to_tsvector('spanish', COALESCE(kb.pregunta, '') || ' ' || COALESCE(array_to_string(kb.palabras_clave, ' '), '')),
      plainto_tsquery('spanish', COALESCE(p_query, ''))
    )::float AS relevancia
  FROM public.knowledge_base kb
  WHERE COALESCE(kb.activo, true) = true
    AND (
      to_tsvector('spanish', COALESCE(kb.pregunta, '') || ' ' || COALESCE(array_to_string(kb.palabras_clave, ' '), ''))
        @@ plainto_tsquery('spanish', COALESCE(p_query, ''))
      OR kb.pregunta ILIKE '%' || COALESCE(p_query, '') || '%'
    )
    AND (p_rol IS NULL OR kb.rol IS NULL OR kb.rol = p_rol)
    AND (p_categoria IS NULL OR kb.categoria = p_categoria)
    AND (p_tenant_id IS NULL OR kb.tenant_id IS NULL OR kb.tenant_id = p_tenant_id)
  ORDER BY relevancia DESC, COALESCE(kb.orden, 0)
  LIMIT GREATEST(COALESCE(p_limite, 5), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_sugerencias_ayuda(
  p_rol varchar DEFAULT NULL,
  p_categoria varchar DEFAULT NULL,
  p_limite int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  pregunta text,
  categoria varchar,
  url_modulo varchar
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kb.id,
    kb.pregunta,
    kb.categoria::varchar,
    kb.url_modulo::varchar
  FROM public.knowledge_base kb
  WHERE COALESCE(kb.activo, true) = true
    AND (p_rol IS NULL OR kb.rol IS NULL OR kb.rol = p_rol)
    AND (p_categoria IS NULL OR kb.categoria = p_categoria)
    AND kb.tenant_id IS NULL
  ORDER BY COALESCE(kb.orden, 0), kb.created_at DESC
  LIMIT GREATEST(COALESCE(p_limite, 5), 1);
$$;

-- ----------------------------------------------------------------------------
-- Contabilidad y materialized views
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_resultado_ejercicio(
  p_tenant_id uuid,
  p_anio integer
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ingresos numeric := 0;
  v_gastos numeric := 0;
  v_ini date := make_date(p_anio, 1, 1);
  v_fin date := make_date(p_anio, 12, 31);
BEGIN
  SELECT COALESCE(SUM(COALESCE(da.haber, 0) - COALESCE(da.debe, 0)), 0)
  INTO v_ingresos
  FROM public.detalle_asientos da
  JOIN public.asientos_contables ac ON ac.id = da.asiento_id
  JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id
  WHERE ac.tenant_id = p_tenant_id
    AND ac.fecha::date BETWEEN v_ini AND v_fin
    AND COALESCE(ac.estado, 'APROBADO') = 'APROBADO'
    AND pc.codigo LIKE '7%';

  SELECT COALESCE(SUM(COALESCE(da.debe, 0) - COALESCE(da.haber, 0)), 0)
  INTO v_gastos
  FROM public.detalle_asientos da
  JOIN public.asientos_contables ac ON ac.id = da.asiento_id
  JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id
  WHERE ac.tenant_id = p_tenant_id
    AND ac.fecha::date BETWEEN v_ini AND v_fin
    AND COALESCE(ac.estado, 'APROBADO') = 'APROBADO'
    AND pc.codigo LIKE '6%';

  RETURN COALESCE(v_ingresos, 0) - COALESCE(v_gastos, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.refrescar_estados_financieros(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_balance_comprobacion;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_estado_resultados;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_balance_general;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_materialized_view(
  view_name text,
  tenant_id uuid DEFAULT NULL,
  p_anio integer DEFAULT NULL,
  p_mes integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF view_name NOT IN ('mv_balance_comprobacion', 'mv_estado_resultados', 'mv_balance_general') THEN
    RAISE EXCEPTION 'Vista materializada no permitida: %', view_name;
  END IF;

  EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', view_name);
  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Seguridad RLS dashboard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_rls_security_report(
  p_days integer DEFAULT 7
)
RETURNS TABLE (
  metric text,
  value text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total integer;
  v_crit integer;
  v_users integer;
  v_tables integer;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.rls_audit_log
  WHERE "timestamp" > now() - make_interval(days => GREATEST(p_days, 1));

  SELECT COUNT(*) INTO v_crit
  FROM public.rls_audit_log
  WHERE "timestamp" > now() - make_interval(days => GREATEST(p_days, 1))
    AND COALESCE(severity, 'WARNING') = 'CRITICAL';

  SELECT COUNT(DISTINCT user_id) INTO v_users
  FROM public.rls_audit_log
  WHERE "timestamp" > now() - make_interval(days => GREATEST(p_days, 1));

  SELECT COUNT(DISTINCT table_name) INTO v_tables
  FROM public.rls_audit_log
  WHERE "timestamp" > now() - make_interval(days => GREATEST(p_days, 1));

  RETURN QUERY
  SELECT 'periodo', p_days::text
  UNION ALL SELECT 'total_violations', COALESCE(v_total, 0)::text
  UNION ALL SELECT 'critical_violations', COALESCE(v_crit, 0)::text
  UNION ALL SELECT 'unique_users', COALESCE(v_users, 0)::text
  UNION ALL SELECT 'tables_affected', COALESCE(v_tables, 0)::text;
END;
$$;

-- ----------------------------------------------------------------------------
-- Demo tenant bootstrap
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_demo_tenant(
  p_nombre varchar DEFAULT 'DEMO COMERCIAL SAC',
  p_dias_duracion integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_demo_email text;
  v_demo_password text;
  v_expires_at timestamptz;
  v_admin_role_id uuid;
BEGIN
  v_demo_email := 'demo-' || left(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := upper(left(md5(random()::text), 8));
  v_expires_at := now() + make_interval(days => GREATEST(COALESCE(p_dias_duracion, 14), 1));

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado, created_at, updated_at
  ) VALUES (
    v_tenant_id,
    'DEMO-' || upper(left(v_tenant_id::text, 8)),
    p_nombre,
    'Tenant demo autogenerado',
    'PE',
    'demo',
    true,
    'ACTIVO',
    now(),
    now()
  );

  INSERT INTO public.empresa_config (
    id, tenant_id, razon_social, nombre_comercial, ruc, pais, moneda_defecto,
    is_demo, demo_created_at, demo_expires_at, demo_extended, demo_conversion_attempted,
    estado, plan, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    p_nombre,
    p_nombre,
    '20' || lpad((random() * 999999999)::int::text, 9, '0'),
    'PE',
    'PEN',
    true,
    now(),
    v_expires_at,
    false,
    false,
    'PRUEBA',
    'BASICO',
    now(),
    now()
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin, is_demo_user, demo_email_temp,
    created_at, updated_at
  ) VALUES (
    v_user_id,
    v_tenant_id,
    'Usuario',
    'Demo',
    v_demo_email,
    'demo',
    crypt(v_demo_password, gen_salt('bf')),
    true,
    'ACTIVO',
    false,
    true,
    v_demo_email,
    now(),
    now()
  );

  INSERT INTO public.users (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, v_demo_email, 'Usuario', 'Demo', true, 'ACTIVO', now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.roles (
    id, tenant_id, nombre, descripcion, is_system_role, activo, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_tenant_id, 'ADMIN', 'Administrador del tenant demo', true, true, now(), now()
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_admin_role_id
  FROM public.roles
  WHERE tenant_id = v_tenant_id
    AND lower(nombre) = 'admin'
  LIMIT 1;

  IF v_admin_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      id, usuario_sistema_id, role_id, tenant_id, created_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_admin_role_id, v_tenant_id, now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'user_id', v_user_id,
    'email', v_demo_email,
    'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', GREATEST(COALESCE(p_dias_duracion, 14), 1)
  );
END;
$$;

COMMIT;
