-- Alinea el ciclo comercial con el contrato canónico:
-- cotización -> pedido -> reserva (al confirmar el pedido).
--
-- Las cotizaciones no inmovilizan existencias. Además, las escrituras de
-- cabecera/detalle y las transiciones críticas se ejecutan en una única
-- transacción PostgreSQL para no dejar documentos parciales.

BEGIN;

-- Un despliegue debe fallar rápido si no puede obtener el lock de corte; no
-- puede quedar esperando tráfico indefinidamente.
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION app.tasa_impuesto_tenant(
  p_tenant_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tasa numeric;
BEGIN
  SELECT coalesce(cf.tasa_igv, cf.impuesto_principal_porcentaje)
    INTO v_tasa
  FROM public.empresa_config ec
  JOIN public.configuracion_fiscal cf
    ON cf.pais_id::text = ec.pais_id::text
   AND coalesce(cf.activo, true)
   AND (cf.tenant_id = p_tenant_id OR cf.tenant_id IS NULL)
  WHERE ec.tenant_id = p_tenant_id
  ORDER BY (cf.tenant_id = p_tenant_id) DESC NULLS LAST, cf.updated_at DESC, cf.id
  LIMIT 1;

  IF v_tasa IS NULL THEN
    SELECT ec.igv_porcentaje INTO v_tasa
    FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id;
  END IF;

  v_tasa := coalesce(v_tasa, 0.18);
  IF v_tasa > 1 THEN v_tasa := v_tasa / 100; END IF;
  IF v_tasa < 0 OR v_tasa > 1 THEN
    RAISE EXCEPTION 'La tasa tributaria configurada para el tenant es inválida: %', v_tasa;
  END IF;
  RETURN v_tasa;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_stock_cotizacion(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_item record;
  v_liberados integer := 0;
  v_pendientes integer := 0;
  v_referencia_tipo text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cotizacion-stock:' || p_cotizacion_id::text, 439)
  );

  -- Se parte del kardex, no del detalle actual. Así también se corrigen
  -- reservas históricas cuyo producto fue retirado luego de la cotización.
  FOR v_item IN
    SELECT
      m.producto_id,
      m.almacen_id,
      greatest(
        coalesce(sum(CASE WHEN upper(coalesce(m.tipo, m.tipo_movimiento, '')) = 'RESERVA'
                          THEN m.cantidad ELSE 0 END), 0)
        - coalesce(sum(CASE WHEN upper(coalesce(m.tipo, m.tipo_movimiento, '')) = 'LIBERACION'
                            THEN m.cantidad ELSE 0 END), 0),
        0
      ) AS cantidad
    FROM public.movimientos_inventario m
    WHERE m.tenant_id = p_tenant_id
      AND m.referencia_id = p_cotizacion_id
      AND upper(coalesce(m.tipo, m.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
      AND (
        upper(coalesce(m.referencia_tipo, '')) = 'COTIZACION'
        OR upper(coalesce(m.referencia_tipo, '')) LIKE 'COTIZACION_CIERRE_%'
      )
    GROUP BY m.producto_id, m.almacen_id
    ORDER BY m.producto_id, m.almacen_id
  LOOP
    IF v_item.cantidad > 0 THEN
      -- El writer físico es idempotente por referencia. Cada delta necesita
      -- identidad propia: reutilizar COTIZACION_CIERRE_439 haría que una
      -- reparación posterior retornase el movimiento viejo sin aplicarla.
      v_referencia_tipo := 'COTIZACION_CIERRE_' ||
        replace(gen_random_uuid()::text, '-', '');
      IF v_item.almacen_id IS NULL THEN
        PERFORM public.liberar_stock_atomico(
          v_item.producto_id,
          v_item.cantidad,
          v_referencia_tipo,
          p_cotizacion_id::text,
          'Liberación de reserva histórica de cotización'
        );
      ELSE
        PERFORM public.aplicar_movimiento_inventario_tx(
          p_tenant_id := p_tenant_id,
          p_producto_id := v_item.producto_id,
          p_almacen_id := v_item.almacen_id,
          p_tipo := 'LIBERACION',
          p_cantidad := v_item.cantidad,
          p_referencia_tipo := v_referencia_tipo,
          p_referencia_id := p_cotizacion_id,
          p_notas := 'Liberación de reserva histórica de cotización',
          p_metadata := jsonb_build_object(
            'atomic_rpc', 'liberar_stock_cotizacion',
            'migration', 439,
            'cotizacion_id', p_cotizacion_id
          )
        );
      END IF;
      v_liberados := v_liberados + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_pendientes
  FROM (
    SELECT m.producto_id
    FROM public.movimientos_inventario m
    WHERE m.tenant_id = p_tenant_id
      AND m.referencia_id = p_cotizacion_id
      AND upper(coalesce(m.tipo, m.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
      AND (
        upper(coalesce(m.referencia_tipo, '')) = 'COTIZACION'
        OR upper(coalesce(m.referencia_tipo, '')) LIKE 'COTIZACION_CIERRE_%'
      )
    -- Una reserva legacy sin almacén se libera físicamente en el único
    -- producto_existencias que demuestra saldo reservado suficiente. Por eso
    -- la postcondición de compatibilidad es neta por producto; las reservas
    -- modernas no nulas se liberan arriba contra su mismo almacén.
    GROUP BY m.producto_id
    HAVING sum(CASE
      WHEN upper(coalesce(m.tipo, m.tipo_movimiento, '')) = 'RESERVA'
        THEN coalesce(m.cantidad, 0)
      ELSE -coalesce(m.cantidad, 0)
    END) <> 0
  ) pendientes;

  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'No se pudieron liberar todas las reservas históricas de la cotización %',
      p_cotizacion_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'productos_liberados', v_liberados,
    'cotizacion_id', p_cotizacion_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.prevent_cotizacion_reservation_439()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF upper(coalesce(NEW.tipo, NEW.tipo_movimiento, '')) = 'RESERVA'
     AND upper(coalesce(NEW.referencia_tipo, '')) LIKE 'COTIZACION%' THEN
    RAISE EXCEPTION 'Las cotizaciones no pueden reservar inventario; confirme el pedido para reservar';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cotizacion_reservation_439
ON public.movimientos_inventario;
CREATE TRIGGER trg_prevent_cotizacion_reservation_439
BEFORE INSERT OR UPDATE OF tipo, tipo_movimiento, referencia_tipo
ON public.movimientos_inventario
FOR EACH ROW
EXECUTE FUNCTION app.prevent_cotizacion_reservation_439();

-- La sustitución del wrapper y el backfill se publican juntos. El lock impide
-- que el wrapper histórico agregue una reserva mientras se limpia el kardex.
LOCK TABLE public.movimientos_inventario IN SHARE ROW EXCLUSIVE MODE;

-- Libera cualquier reserva histórica antes de retirar el comportamiento.
DO $$
DECLARE
  v_cot record;
BEGIN
  FOR v_cot IN
    SELECT DISTINCT m.tenant_id, m.referencia_id AS cotizacion_id
    FROM public.movimientos_inventario m
    WHERE upper(coalesce(m.referencia_tipo, '')) = 'COTIZACION'
      AND m.referencia_id IS NOT NULL
  LOOP
    PERFORM public.liberar_stock_cotizacion(v_cot.cotizacion_id, v_cot.tenant_id);
  END LOOP;
END;
$$;

-- Wrapper conservado por compatibilidad. Una cotización ya no reserva stock.
CREATE OR REPLACE FUNCTION public.reservar_stock_cotizacion(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cotizacion-stock:' || p_cotizacion_id::text, 439)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.cotizaciones
    WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'skipped', true,
    'reason', 'La reserva de stock se realiza al confirmar el pedido',
    'cotizacion_id', p_cotizacion_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.crear_cotizacion_tx(
  uuid, uuid, date, text, text, text, numeric, numeric, numeric, jsonb
);

CREATE OR REPLACE FUNCTION public.crear_cotizacion_tx(
  p_tenant_id uuid,
  p_created_by uuid,
  p_cliente_id uuid,
  p_fecha_vencimiento date,
  p_observaciones text,
  p_vendedor text,
  p_moneda text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_numero text;
  v_next integer;
  v_cot public.cotizaciones%ROWTYPE;
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_tasa_igv numeric;
BEGIN
  IF p_tenant_id IS NULL OR p_cliente_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'tenant_id, cliente_id y created_by son obligatorios';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_created_by AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El creador no pertenece al tenant o está inactivo';
  END IF;
  IF p_detalle IS NULL OR jsonb_typeof(p_detalle) <> 'array'
     OR jsonb_array_length(p_detalle) = 0 THEN
    RAISE EXCEPTION 'La cotización debe tener al menos un producto';
  END IF;
  IF p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento < v_hoy THEN
    RAISE EXCEPTION 'La fecha de vencimiento no puede ser anterior a la fecha local del tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = p_cliente_id AND tenant_id = p_tenant_id AND activo
  ) THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalle) AS d(producto_id uuid)
    LEFT JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = p_tenant_id AND p.activo
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uno o más productos no existen o están inactivos';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalle) AS d(
      producto_id uuid, cantidad numeric, precio_unitario numeric, orden integer
    )
    WHERE d.producto_id IS NULL OR d.cantidad IS NULL OR d.cantidad <= 0
      OR d.precio_unitario IS NULL OR d.precio_unitario < 0
      OR d.orden IS NULL OR d.orden <= 0
  ) OR (
    SELECT count(DISTINCT d.orden)
    FROM jsonb_to_recordset(p_detalle) AS d(orden integer)
  ) <> jsonb_array_length(p_detalle) THEN
    RAISE EXCEPTION 'El detalle contiene cantidades, precios u orden inválidos o duplicados';
  END IF;

  v_tasa_igv := app.tasa_impuesto_tenant(p_tenant_id);

  SELECT
    round(coalesce(sum(round(d.cantidad * d.precio_unitario, 2)), 0), 2),
    round(coalesce(sum(CASE
      WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
        THEN round(d.cantidad * d.precio_unitario, 2)
      ELSE 0 END), 0) * v_tasa_igv, 2)
  INTO v_subtotal, v_igv
  FROM jsonb_to_recordset(p_detalle) AS d(
    producto_id uuid, cantidad numeric, precio_unitario numeric
  )
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = p_tenant_id;
  v_total := round(v_subtotal + v_igv, 2);

  IF round(coalesce(p_subtotal, -1), 2) <> v_subtotal
     OR round(coalesce(p_igv, -1), 2) <> v_igv
     OR round(coalesce(p_total, -1), 2) <> v_total THEN
    RAISE EXCEPTION 'Los totales de la cotización no coinciden con su detalle: subtotal=% igv=% total=%',
      v_subtotal, v_igv, v_total;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cotizaciones', 439));
  SELECT coalesce(max(substring(numero FROM '^COT-[0-9]{4}-([0-9]+)$')::integer), 0) + 1
    INTO v_next
  FROM public.cotizaciones
  WHERE tenant_id = p_tenant_id
    AND numero LIKE 'COT-' || to_char(v_hoy, 'YYYY') || '-%'
    AND numero ~ '^COT-[0-9]{4}-[0-9]+$';
  v_numero := 'COT-' || to_char(v_hoy, 'YYYY') || '-' ||
    lpad(v_next::text, greatest(4, length(v_next::text)), '0');

  INSERT INTO public.cotizaciones (
    tenant_id, numero, cliente_id, fecha, fecha_cotizacion,
    fecha_vencimiento, estado, subtotal, igv, total, observaciones,
    vendedor, moneda, items, probabilidad, created_by
  )
  VALUES (
    p_tenant_id, v_numero, p_cliente_id, v_hoy, v_hoy,
    p_fecha_vencimiento, 'BORRADOR', v_subtotal,
    v_igv, v_total,
    nullif(btrim(p_observaciones), ''), coalesce(nullif(btrim(p_vendedor), ''), 'Sistema'),
    upper(coalesce(nullif(btrim(p_moneda), ''), 'PEN')),
    p_detalle, 50, p_created_by
  )
  RETURNING * INTO v_cot;

  INSERT INTO public.cotizacion_detalles (
    tenant_id, cotizacion_id, producto_id, producto_nombre, descripcion,
    cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
    subtotal, orden
  )
  SELECT
    p_tenant_id, v_cot.id, d.producto_id, p.nombre,
    coalesce(nullif(btrim(d.descripcion), ''), p.nombre),
    d.cantidad, d.precio_unitario, 0, 0,
    round(d.cantidad * d.precio_unitario, 2), d.orden
  FROM jsonb_to_recordset(p_detalle) AS d(
    producto_id uuid, descripcion text, cantidad numeric,
    precio_unitario numeric, orden integer
  )
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = p_tenant_id
  WHERE d.cantidad > 0 AND d.precio_unitario >= 0 AND d.orden > 0;

  IF (SELECT count(*) FROM public.cotizacion_detalles WHERE cotizacion_id = v_cot.id)
     <> jsonb_array_length(p_detalle) THEN
    RAISE EXCEPTION 'El detalle contiene cantidades, precios u orden inválidos';
  END IF;

  RETURN jsonb_build_object(
    'cotizacion', to_jsonb(v_cot),
    'detalle', (
      SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.orden), '[]'::jsonb)
      FROM public.cotizacion_detalles d
      WHERE d.cotizacion_id = v_cot.id AND d.tenant_id = p_tenant_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_cotizacion_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_patch jsonb,
  p_detalle jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cot public.cotizaciones%ROWTYPE;
  v_cliente_id uuid;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_tasa_igv numeric;
  v_fecha_vencimiento date;
BEGIN
  SELECT * INTO v_cot
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;

  IF upper(v_cot.estado::text) <> 'BORRADOR'
     AND (
       p_detalle IS NOT NULL
       OR coalesce(p_patch, '{}'::jsonb) ?| ARRAY[
         'cliente_id', 'fecha_vencimiento', 'observaciones',
         'subtotal', 'igv', 'total'
       ]
     ) THEN
    RAISE EXCEPTION 'Solo se puede editar el contenido de una cotización en estado BORRADOR';
  END IF;

  IF coalesce(p_patch, '{}'::jsonb) ? 'estado' THEN
    RAISE EXCEPTION 'El estado se cambia mediante el flujo autorizado de cotizaciones';
  END IF;

  IF p_detalle IS NOT NULL THEN
    IF upper(v_cot.estado::text) <> 'BORRADOR' THEN
      RAISE EXCEPTION 'Solo se pueden editar los productos de cotizaciones en estado BORRADOR';
    END IF;
    IF jsonb_typeof(p_detalle) <> 'array' OR jsonb_array_length(p_detalle) = 0 THEN
      RAISE EXCEPTION 'La cotización debe tener al menos un producto';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_detalle) AS d(producto_id uuid)
      LEFT JOIN public.productos p
        ON p.id = d.producto_id AND p.tenant_id = p_tenant_id AND p.activo
      WHERE p.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Uno o más productos no existen o están inactivos';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_detalle) AS d(
        producto_id uuid, cantidad numeric, precio_unitario numeric, orden integer
      )
      WHERE d.producto_id IS NULL OR d.cantidad IS NULL OR d.cantidad <= 0
        OR d.precio_unitario IS NULL OR d.precio_unitario < 0
        OR d.orden IS NULL OR d.orden <= 0
    ) OR (
      SELECT count(DISTINCT d.orden)
      FROM jsonb_to_recordset(p_detalle) AS d(orden integer)
    ) <> jsonb_array_length(p_detalle) THEN
      RAISE EXCEPTION 'El detalle contiene cantidades, precios u orden inválidos o duplicados';
    END IF;

    v_tasa_igv := app.tasa_impuesto_tenant(p_tenant_id);

    SELECT
      round(coalesce(sum(round(d.cantidad * d.precio_unitario, 2)), 0), 2),
      round(coalesce(sum(CASE
        WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
          THEN round(d.cantidad * d.precio_unitario, 2)
        ELSE 0 END), 0) * v_tasa_igv, 2)
    INTO v_subtotal, v_igv
    FROM jsonb_to_recordset(p_detalle) AS d(
      producto_id uuid, cantidad numeric, precio_unitario numeric
    )
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = p_tenant_id;
    v_total := round(v_subtotal + v_igv, 2);

    IF (p_patch ? 'subtotal' AND round((p_patch->>'subtotal')::numeric, 2) <> v_subtotal)
       OR (p_patch ? 'igv' AND round((p_patch->>'igv')::numeric, 2) <> v_igv)
       OR (p_patch ? 'total' AND round((p_patch->>'total')::numeric, 2) <> v_total) THEN
      RAISE EXCEPTION 'Los totales de la cotización no coinciden con su detalle: subtotal=% igv=% total=%',
        v_subtotal, v_igv, v_total;
    END IF;

    DELETE FROM public.cotizacion_detalles
    WHERE cotizacion_id = p_cotizacion_id AND tenant_id = p_tenant_id;

    INSERT INTO public.cotizacion_detalles (
      tenant_id, cotizacion_id, producto_id, producto_nombre, descripcion,
      cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
      subtotal, orden
    )
    SELECT
      p_tenant_id, p_cotizacion_id, d.producto_id, p.nombre,
      coalesce(nullif(btrim(d.descripcion), ''), p.nombre),
      d.cantidad, d.precio_unitario, 0, 0,
      round(d.cantidad * d.precio_unitario, 2), d.orden
    FROM jsonb_to_recordset(p_detalle) AS d(
      producto_id uuid, descripcion text, cantidad numeric,
      precio_unitario numeric, orden integer
    )
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = p_tenant_id
    WHERE d.cantidad > 0 AND d.precio_unitario >= 0 AND d.orden > 0;

    IF (SELECT count(*) FROM public.cotizacion_detalles WHERE cotizacion_id = p_cotizacion_id)
       <> jsonb_array_length(p_detalle) THEN
      RAISE EXCEPTION 'El detalle contiene cantidades, precios u orden inválidos';
    END IF;
  END IF;

  IF p_detalle IS NULL
     AND coalesce(p_patch, '{}'::jsonb) ?| ARRAY['subtotal', 'igv', 'total'] THEN
    RAISE EXCEPTION 'Los totales sólo se actualizan junto con el detalle';
  END IF;

  IF p_patch ? 'cliente_id' THEN
    v_cliente_id := nullif(p_patch->>'cliente_id', '')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes
      WHERE id = v_cliente_id AND tenant_id = p_tenant_id AND activo
    ) THEN
      RAISE EXCEPTION 'Cliente no encontrado';
    END IF;
  END IF;

  IF p_patch ? 'fecha_vencimiento' THEN
    v_fecha_vencimiento := nullif(p_patch->>'fecha_vencimiento', '')::date;
    IF v_fecha_vencimiento IS NOT NULL
       AND v_fecha_vencimiento < app.hoy_tenant(p_tenant_id) THEN
      RAISE EXCEPTION 'La fecha de vencimiento no puede ser anterior a la fecha local del tenant';
    END IF;
  END IF;

  UPDATE public.cotizaciones
  SET cliente_id = CASE WHEN p_patch ? 'cliente_id' THEN v_cliente_id ELSE cliente_id END,
      fecha_vencimiento = CASE WHEN p_patch ? 'fecha_vencimiento'
        THEN v_fecha_vencimiento ELSE fecha_vencimiento END,
      observaciones = CASE WHEN p_patch ? 'observaciones' THEN p_patch->>'observaciones' ELSE observaciones END,
      notas = CASE WHEN p_patch ? 'observaciones' THEN p_patch->>'observaciones' ELSE notas END,
      subtotal = CASE WHEN p_detalle IS NOT NULL THEN v_subtotal ELSE subtotal END,
      igv = CASE WHEN p_detalle IS NOT NULL THEN v_igv ELSE igv END,
      total = CASE WHEN p_detalle IS NOT NULL THEN v_total ELSE total END,
      items = CASE WHEN p_detalle IS NOT NULL THEN p_detalle ELSE items END,
      updated_at = now()
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cot;

  RETURN to_jsonb(v_cot);
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_cotizacion_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_nuevo_estado text,
  p_actor_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cot public.cotizaciones%ROWTYPE;
  v_estado text := upper(nullif(btrim(p_nuevo_estado), ''));
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor no pertenece al tenant o está inactivo';
  END IF;

  SELECT * INTO v_cot
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;

  IF NOT (
    (upper(v_cot.estado::text) = 'BORRADOR' AND v_estado = 'ENVIADA')
    OR (upper(v_cot.estado::text) IN ('BORRADOR', 'ENVIADA')
        AND v_estado IN ('APROBADA', 'RECHAZADA'))
  ) THEN
    RAISE EXCEPTION 'Transición de cotización inválida: % -> %', v_cot.estado, v_estado;
  END IF;

  IF v_estado IN ('APROBADA', 'RECHAZADA')
     AND (v_cot.created_by IS NULL OR v_cot.created_by = p_actor_id) THEN
    RAISE EXCEPTION 'La cotización no tiene creador trazable o el actor intenta decidir su propia cotización';
  END IF;

  UPDATE public.cotizaciones
  SET estado = v_estado,
      aprobado_por = CASE WHEN v_estado = 'APROBADA' THEN p_actor_id ELSE aprobado_por END,
      fecha_aprobacion = CASE WHEN v_estado = 'APROBADA' THEN now() ELSE fecha_aprobacion END,
      observaciones_aprobacion = CASE WHEN v_estado = 'APROBADA'
        THEN nullif(btrim(p_motivo), '') ELSE observaciones_aprobacion END,
      rechazado_por = CASE WHEN v_estado = 'RECHAZADA' THEN p_actor_id ELSE rechazado_por END,
      fecha_rechazo = CASE WHEN v_estado = 'RECHAZADA' THEN now() ELSE fecha_rechazo END,
      motivo_rechazo = CASE WHEN v_estado = 'RECHAZADA'
        THEN nullif(btrim(p_motivo), '') ELSE motivo_rechazo END,
      updated_at = now()
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cot;

  RETURN to_jsonb(v_cot);
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_cotizacion_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT upper(estado::text) INTO v_estado
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden eliminar cotizaciones en estado BORRADOR';
  END IF;

  PERFORM public.liberar_stock_cotizacion(p_cotizacion_id, p_tenant_id);
  DELETE FROM public.cotizacion_detalles
  WHERE cotizacion_id = p_cotizacion_id AND tenant_id = p_tenant_id;
  DELETE FROM public.cotizaciones
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('success', true, 'cotizacion_id', p_cotizacion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_cotizaciones_vencidas_tx(
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id es obligatorio';
  END IF;

  UPDATE public.cotizaciones
  SET estado = 'VENCIDA', updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND upper(estado::text) IN ('BORRADOR', 'ENVIADA')
    AND fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento < app.hoy_tenant(p_tenant_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
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
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cot public.cotizaciones%ROWTYPE;
  v_pedido_id uuid;
  v_numero text;
  v_next integer;
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_tasa_igv numeric;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_user_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor de conversión no pertenece al tenant o está inactivo';
  END IF;

  SELECT * INTO v_cot
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF upper(v_cot.estado::text) = 'CONVERTIDA' THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;
  IF upper(v_cot.estado::text) NOT IN ('BORRADOR', 'ENVIADA', 'APROBADA') THEN
    RAISE EXCEPTION 'Estado de cotización inválido para convertir: %', v_cot.estado;
  END IF;
  IF v_cot.fecha_vencimiento IS NOT NULL AND v_cot.fecha_vencimiento < v_hoy THEN
    RAISE EXCEPTION 'No se puede convertir una cotización vencida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cotizacion_detalles
    WHERE cotizacion_id = p_cotizacion_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'La cotización no tiene productos para convertir';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.cotizacion_detalles cd
    LEFT JOIN public.productos p
      ON p.id = cd.producto_id AND p.tenant_id = p_tenant_id AND p.activo
    WHERE cd.cotizacion_id = p_cotizacion_id
      AND cd.tenant_id = p_tenant_id
      AND (p.id IS NULL OR coalesce(cd.cantidad, 0) <= 0
        OR coalesce(cd.precio_unitario, -1) < 0)
  ) THEN
    RAISE EXCEPTION 'La cotización contiene productos inactivos o líneas inválidas';
  END IF;

  -- El detalle, no una cabecera legacy manipulable, es la fuente económica.
  -- Esto permite convertir documentos anteriores a 439 sin propagar montos
  -- inconsistentes a pedido, CPE y contabilidad.
  v_tasa_igv := app.tasa_impuesto_tenant(p_tenant_id);
  SELECT
    round(coalesce(sum(round(cd.cantidad * cd.precio_unitario, 2)), 0), 2),
    round(coalesce(sum(CASE
      WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
        THEN round(cd.cantidad * cd.precio_unitario, 2)
      ELSE 0 END), 0) * v_tasa_igv, 2)
  INTO v_subtotal, v_igv
  FROM public.cotizacion_detalles cd
  JOIN public.productos p
    ON p.id = cd.producto_id AND p.tenant_id = p_tenant_id
  WHERE cd.cotizacion_id = p_cotizacion_id
    AND cd.tenant_id = p_tenant_id;
  v_total := round(v_subtotal + v_igv, 2);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':pedidos', 439));
  SELECT coalesce(max(substring(numero FROM '^PED-[0-9]{4}-([0-9]+)$')::integer), 0) + 1
    INTO v_next
  FROM public.pedidos_venta
  WHERE tenant_id = p_tenant_id
    AND numero LIKE 'PED-' || to_char(v_hoy, 'YYYY') || '-%'
    AND numero ~ '^PED-[0-9]{4}-[0-9]+$';
  v_numero := 'PED-' || to_char(v_hoy, 'YYYY') || '-' ||
    lpad(v_next::text, greatest(4, length(v_next::text)), '0');

  INSERT INTO public.pedidos_venta (
    tenant_id, numero, cotizacion_id, cliente_id, fecha, fecha_pedido,
    estado, subtotal, igv, total, moneda, observaciones, notas,
    created_by, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_numero, p_cotizacion_id, v_cot.cliente_id,
    v_hoy, v_hoy, 'PENDIENTE', v_subtotal,
    v_igv, v_total, coalesce(v_cot.moneda, 'PEN'),
    coalesce(p_notas, v_cot.observaciones), coalesce(p_notas, v_cot.observaciones),
    p_user_id, now(), now()
  ) RETURNING id INTO v_pedido_id;

  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, created_at, updated_at
  )
  SELECT p_tenant_id, v_pedido_id, cd.producto_id,
         coalesce(cd.descripcion, cd.producto_nombre), cd.cantidad,
         cd.precio_unitario, round(cd.cantidad * cd.precio_unitario, 2),
         'PENDIENTE', now(), now()
  FROM public.cotizacion_detalles cd
  WHERE cd.cotizacion_id = p_cotizacion_id AND cd.tenant_id = p_tenant_id
  ORDER BY cd.orden;

  UPDATE public.cotizaciones
  SET estado = 'CONVERTIDA', subtotal = v_subtotal, igv = v_igv,
      total = v_total, fecha_conversion = now(), convertido_por = p_user_id,
      pedido_id = v_pedido_id, updated_at = now()
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id;

  -- Compatibilidad para cotizaciones creadas antes de esta migración.
  PERFORM public.liberar_stock_cotizacion(p_cotizacion_id, p_tenant_id);

  RETURN jsonb_build_object(
    'success', true,
    'pedido_id', v_pedido_id,
    'pedido_numero', v_numero,
    'cotizacion_id', p_cotizacion_id
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pedidos_venta
    WHERE cotizacion_id IS NOT NULL
    GROUP BY tenant_id, cotizacion_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen cotizaciones enlazadas a más de un pedido; reconciliar antes de aplicar 439';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_venta_tenant_cotizacion_439
  ON public.pedidos_venta (tenant_id, cotizacion_id)
  WHERE cotizacion_id IS NOT NULL;

REVOKE ALL ON FUNCTION public.reservar_stock_cotizacion(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.tasa_impuesto_tenant(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liberar_stock_cotizacion(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_cotizacion_tx(uuid, uuid, uuid, date, text, text, text, numeric, numeric, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_cotizacion_tx(uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_cotizacion_tx(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_cotizaciones_vencidas_tx(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convertir_cotizacion_a_pedido(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reservar_stock_cotizacion(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION app.tasa_impuesto_tenant(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.liberar_stock_cotizacion(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_cotizacion_tx(uuid, uuid, uuid, date, text, text, text, numeric, numeric, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_cotizacion_tx(uuid, uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.eliminar_cotizacion_tx(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_cotizaciones_vencidas_tx(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.convertir_cotizacion_a_pedido(uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.crear_cotizacion_tx(uuid, uuid, uuid, date, text, text, text, numeric, numeric, numeric, jsonb) IS
  'Crea cabecera y detalle de cotización atómicamente. La cotización no reserva inventario.';
COMMENT ON FUNCTION public.actualizar_cotizacion_tx(uuid, uuid, jsonb, jsonb) IS
  'Actualiza cabecera y reemplaza detalle de cotización en una sola transacción.';
COMMENT ON FUNCTION public.eliminar_cotizacion_tx(uuid, uuid) IS
  'Elimina una cotización borrador y limpia reservas históricas en una sola transacción.';
COMMENT ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text) IS
  'Envía o decide una cotización con actor tenant, segregación y transición validadas.';
COMMENT ON FUNCTION public.marcar_cotizaciones_vencidas_tx(uuid) IS
  'Marca cotizaciones vencidas usando la fecha comercial local configurada para el tenant.';

COMMIT;
