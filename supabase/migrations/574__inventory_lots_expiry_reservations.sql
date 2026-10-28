-- ============================================================================
-- 574__inventory_lots_expiry_reservations.sql
-- F02 ALKHOFAR: existencias por lote, vencimiento y ubicación; reservas por lote.
--
-- producto_existencias sigue siendo el saldo físico por almacén y el kardex sigue
-- proyectando movimientos_inventario. Para los productos con control de lote,
-- el mismo writer único reparte cada movimiento entre saldos por lote/ubicación
-- y deja el detalle en un ledger por lote. Los productos sin política de lote
-- conservan exactamente el comportamiento de la 347.
--
-- Invariantes por producto/almacén con control de lote:
--   suma(stock por lote)     <= stock físico del almacén (la diferencia es
--                               stock sin lote, pendiente de regularización)
--   suma(reservado por lote)  = reservado del almacén
-- El stock sin lote no se puede reservar ni despachar hasta regularizarlo.
-- ============================================================================

BEGIN;

CREATE TABLE public.inventario_lote_politicas (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  controla_lote boolean NOT NULL DEFAULT false,
  requiere_vencimiento boolean NOT NULL DEFAULT true,
  dias_minimos_vida_util integer NOT NULL DEFAULT 0
    CHECK (dias_minimos_vida_util BETWEEN 0 AND 3650),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, producto_id)
);

CREATE TABLE public.inventario_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  codigo text NOT NULL CHECK (codigo = btrim(codigo) AND length(codigo) BETWEEN 1 AND 80),
  -- El vencimiento identifica al lote y no se corrige en silencio.
  fecha_vencimiento date,
  origen text NOT NULL CHECK (origen IN ('MOVIMIENTO', 'REGULARIZACION')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, producto_id, id)
);
CREATE UNIQUE INDEX ux_inventario_lotes_codigo_574
  ON public.inventario_lotes (tenant_id, producto_id, upper(codigo));
CREATE INDEX idx_inventario_lotes_vencimiento_574
  ON public.inventario_lotes (tenant_id, fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;

CREATE TABLE public.inventario_lote_saldos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  lote_id uuid NOT NULL,
  ubicacion_id uuid REFERENCES public.almacen_ubicaciones(id),
  stock_actual numeric NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_reservado numeric NOT NULL DEFAULT 0
    CHECK (stock_reservado >= 0 AND stock_reservado <= stock_actual),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, producto_id, lote_id)
    REFERENCES public.inventario_lotes(tenant_id, producto_id, id)
);
CREATE UNIQUE INDEX ux_inventario_lote_saldos_bucket_574
  ON public.inventario_lote_saldos (
    tenant_id, almacen_id, lote_id,
    coalesce(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX idx_inventario_lote_saldos_producto_574
  ON public.inventario_lote_saldos (tenant_id, producto_id, almacen_id);
CREATE INDEX idx_inventario_lote_saldos_ubicacion_574
  ON public.inventario_lote_saldos (ubicacion_id) WHERE ubicacion_id IS NOT NULL;

-- Decisiones de lote sin movimiento físico propio: política, regularización del
-- stock sin lote y reasignación de reservas. También es la clave idempotente.
CREATE TABLE public.inventario_lote_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  fingerprint text NOT NULL,
  accion text NOT NULL CHECK (accion IN ('CONFIGURAR_POLITICA', 'REGULARIZAR', 'REASIGNAR_RESERVA')),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  almacen_id uuid REFERENCES public.almacenes(id),
  referencia_id uuid,
  motivo text CHECK (motivo IS NULL OR length(motivo) BETWEEN 5 AND 1000),
  anterior jsonb,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_inventario_lote_operaciones_producto_574
  ON public.inventario_lote_operaciones (tenant_id, producto_id, created_at DESC, id);

-- Ledger por lote. Cada fila pertenece a un movimiento físico o a una operación
-- de lote. La reserva de una referencia (pedido) se deriva de RESERVA menos
-- LIBERACION menos SALIDA con consume_reserva.
CREATE TABLE public.movimientos_inventario_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  lote_id uuid NOT NULL,
  ubicacion_id uuid REFERENCES public.almacen_ubicaciones(id),
  tipo text NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION', 'REGULARIZACION')),
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  consume_reserva boolean NOT NULL DEFAULT false CHECK (NOT consume_reserva OR tipo = 'SALIDA'),
  referencia_id uuid,
  movimiento_id uuid REFERENCES public.movimientos_inventario(id),
  operacion_id uuid REFERENCES public.inventario_lote_operaciones(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls(movimiento_id, operacion_id) = 1),
  FOREIGN KEY (tenant_id, producto_id, lote_id)
    REFERENCES public.inventario_lotes(tenant_id, producto_id, id)
);
CREATE INDEX idx_movimientos_lotes_referencia_574
  ON public.movimientos_inventario_lotes (tenant_id, referencia_id, producto_id, almacen_id)
  WHERE referencia_id IS NOT NULL;
CREATE INDEX idx_movimientos_lotes_movimiento_574
  ON public.movimientos_inventario_lotes (movimiento_id) WHERE movimiento_id IS NOT NULL;
CREATE INDEX idx_movimientos_lotes_lote_574
  ON public.movimientos_inventario_lotes (tenant_id, producto_id, lote_id, created_at, id);

DO $secure$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventario_lote_politicas', 'inventario_lotes', 'inventario_lote_saldos',
    'inventario_lote_operaciones', 'movimientos_inventario_lotes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY inventario_lotes_private_574 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------

-- Fecha mínima de vencimiento aceptable para comprometer o despachar en venta.
-- Para un pedido vinculado a un contrato se mide contra su entrega programada
-- más tardía; nunca contra una fecha anterior a hoy.
CREATE FUNCTION app.lote_vence_desde_574(
  p_tenant_id uuid, p_producto_id uuid, p_referencia_id uuid, p_metadata jsonb, p_dias integer
) RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_ref date := nullif(coalesce(p_metadata, '{}'::jsonb)->>'fecha_referencia_vencimiento', '')::date;
BEGIN
  IF v_ref IS NULL AND p_referencia_id IS NOT NULL THEN
    SELECT max(e.fecha_programada) INTO v_ref
    FROM public.suministro_pedidos v
    JOIN public.suministro_pedido_lineas l ON l.vinculo_id = v.id AND l.tenant_id = v.tenant_id
    JOIN public.suministro_entregas_programadas e ON e.id = l.entrega_id AND e.tenant_id = l.tenant_id
    WHERE v.tenant_id = p_tenant_id AND v.pedido_id = p_referencia_id
      AND v.estado = 'VINCULADO' AND l.producto_id = p_producto_id;
  END IF;
  RETURN greatest(v_hoy, coalesce(v_ref, v_hoy)) + coalesce(p_dias, 0);
END $fn$;

CREATE FUNCTION app.lote_resolver_574(
  p_tenant_id uuid, p_producto_id uuid, p_codigo text, p_vencimiento date,
  p_crear boolean, p_requiere_vencimiento boolean, p_origen text, p_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_lote public.inventario_lotes;
BEGIN
  IF length(v_codigo) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'INVENTORY_LOT_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lote FROM public.inventario_lotes
  WHERE tenant_id = p_tenant_id AND producto_id = p_producto_id AND upper(codigo) = upper(v_codigo);
  IF FOUND THEN
    IF p_vencimiento IS NOT NULL AND v_lote.fecha_vencimiento IS DISTINCT FROM p_vencimiento THEN
      RAISE EXCEPTION 'INVENTORY_LOT_EXPIRY_MISMATCH: lote=% registrado=% recibido=%',
        v_lote.codigo, v_lote.fecha_vencimiento, p_vencimiento USING ERRCODE = '23514';
    END IF;
    RETURN v_lote.id;
  END IF;
  IF NOT p_crear THEN
    RAISE EXCEPTION 'INVENTORY_LOT_NOT_FOUND: %', v_codigo USING ERRCODE = 'P0002';
  END IF;
  IF p_requiere_vencimiento AND p_vencimiento IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_LOT_EXPIRY_REQUIRED: %', v_codigo USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.inventario_lotes (tenant_id, producto_id, codigo, fecha_vencimiento, origen, created_by)
  VALUES (p_tenant_id, p_producto_id, v_codigo, p_vencimiento, p_origen, p_actor)
  RETURNING * INTO v_lote;
  RETURN v_lote.id;
END $fn$;

CREATE FUNCTION app.lote_ubicacion_valida_574(p_tenant_id uuid, p_almacen_id uuid, p_ubicacion_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  IF p_ubicacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = p_ubicacion_id AND u.tenant_id = p_tenant_id AND u.almacen_id = p_almacen_id
      AND lower(coalesce(u.estado::text, 'inactivo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_LOT_LOCATION_INVALID: %', p_ubicacion_id USING ERRCODE = '23503';
  END IF;
END $fn$;

-- Suma cantidad a un saldo lote/ubicación y deja la fila del ledger.
CREATE FUNCTION app.lote_sumar_574(
  p_tenant_id uuid, p_producto_id uuid, p_almacen_id uuid, p_lote_id uuid, p_ubicacion_id uuid,
  p_cantidad numeric, p_tipo text, p_referencia_id uuid, p_movimiento_id uuid, p_operacion_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_LOT_QUANTITY_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.lote_ubicacion_valida_574(p_tenant_id, p_almacen_id, p_ubicacion_id);
  SELECT s.id INTO v_id FROM public.inventario_lote_saldos s
  WHERE s.tenant_id = p_tenant_id AND s.almacen_id = p_almacen_id AND s.lote_id = p_lote_id
    AND s.ubicacion_id IS NOT DISTINCT FROM p_ubicacion_id
  FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.inventario_lote_saldos (tenant_id, producto_id, almacen_id, lote_id, ubicacion_id, stock_actual)
    VALUES (p_tenant_id, p_producto_id, p_almacen_id, p_lote_id, p_ubicacion_id, p_cantidad);
  ELSE
    UPDATE public.inventario_lote_saldos
    SET stock_actual = stock_actual + p_cantidad, updated_at = now()
    WHERE id = v_id;
  END IF;
  INSERT INTO public.movimientos_inventario_lotes (
    tenant_id, producto_id, almacen_id, lote_id, ubicacion_id, tipo, cantidad,
    referencia_id, movimiento_id, operacion_id
  ) VALUES (
    p_tenant_id, p_producto_id, p_almacen_id, p_lote_id, p_ubicacion_id, p_tipo, p_cantidad,
    p_referencia_id, p_movimiento_id, p_operacion_id
  );
END $fn$;

-- Toma cantidad de saldos por lote y devuelve lo que no pudo cubrir.
--   p_modo DISPONIBLE: stock no reservado (SALIDA descuenta, RESERVA reserva).
--   p_modo REFERENCIA: lo reservado por p_referencia_id (LIBERACION libera,
--                      SALIDA consume la reserva y descuenta).
-- p_vence_desde excluye lotes con vencimiento anterior; NULL no filtra.
-- Orden FEFO; p_desc invierte el orden de vencimiento (liberaciones parciales).
CREATE FUNCTION app.lote_tomar_574(
  p_tenant_id uuid, p_producto_id uuid, p_almacen_id uuid, p_modo text, p_tipo text,
  p_cantidad numeric, p_lote_id uuid, p_ubicacion_id uuid, p_ubicacion_exacta boolean,
  p_referencia_id uuid, p_movimiento_id uuid, p_operacion_id uuid, p_vence_desde date, p_desc boolean
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_restante numeric := p_cantidad;
  v_take numeric;
  v_row record;
BEGIN
  IF p_modo = 'DISPONIBLE' THEN
    FOR v_row IN
      SELECT s.id, s.lote_id, s.ubicacion_id, s.stock_actual - s.stock_reservado AS cantidad
      FROM public.inventario_lote_saldos s
      JOIN public.inventario_lotes l ON l.id = s.lote_id AND l.tenant_id = s.tenant_id
      WHERE s.tenant_id = p_tenant_id AND s.producto_id = p_producto_id AND s.almacen_id = p_almacen_id
        AND (p_lote_id IS NULL OR s.lote_id = p_lote_id)
        AND (NOT p_ubicacion_exacta OR s.ubicacion_id IS NOT DISTINCT FROM p_ubicacion_id)
        AND s.stock_actual - s.stock_reservado > 0
        AND (p_vence_desde IS NULL OR l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= p_vence_desde)
      ORDER BY (p_ubicacion_id IS NOT NULL AND s.ubicacion_id = p_ubicacion_id) DESC,
        CASE WHEN p_desc THEN l.fecha_vencimiento END DESC NULLS LAST,
        CASE WHEN NOT p_desc THEN l.fecha_vencimiento END ASC NULLS LAST,
        l.created_at, l.id, s.id
      FOR UPDATE OF s
    LOOP
      EXIT WHEN v_restante <= 0;
      v_take := least(v_restante, v_row.cantidad);
      IF p_tipo = 'SALIDA' THEN
        UPDATE public.inventario_lote_saldos SET stock_actual = stock_actual - v_take, updated_at = now()
        WHERE id = v_row.id;
      ELSIF p_tipo = 'RESERVA' THEN
        UPDATE public.inventario_lote_saldos SET stock_reservado = stock_reservado + v_take, updated_at = now()
        WHERE id = v_row.id;
      ELSE
        RAISE EXCEPTION 'INVENTORY_LOT_MODE_INVALID' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.movimientos_inventario_lotes (
        tenant_id, producto_id, almacen_id, lote_id, ubicacion_id, tipo, cantidad,
        referencia_id, movimiento_id, operacion_id
      ) VALUES (
        p_tenant_id, p_producto_id, p_almacen_id, v_row.lote_id, v_row.ubicacion_id, p_tipo, v_take,
        p_referencia_id, p_movimiento_id, p_operacion_id
      );
      v_restante := v_restante - v_take;
    END LOOP;
  ELSIF p_modo = 'REFERENCIA' THEN
    IF p_referencia_id IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_LOT_RESERVATION_REFERENCE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    FOR v_row IN
      SELECT s.id, s.lote_id, s.ubicacion_id, l.codigo, l.fecha_vencimiento, r.cantidad
      FROM (
        SELECT m.lote_id, m.ubicacion_id,
          sum(CASE WHEN m.tipo = 'RESERVA' THEN m.cantidad
                   WHEN m.tipo = 'LIBERACION' OR m.consume_reserva THEN -m.cantidad
                   ELSE 0 END) AS cantidad
        FROM public.movimientos_inventario_lotes m
        WHERE m.tenant_id = p_tenant_id AND m.referencia_id = p_referencia_id
          AND m.producto_id = p_producto_id AND m.almacen_id = p_almacen_id
        GROUP BY m.lote_id, m.ubicacion_id
      ) r
      JOIN public.inventario_lote_saldos s
        ON s.tenant_id = p_tenant_id AND s.almacen_id = p_almacen_id
       AND s.lote_id = r.lote_id AND s.ubicacion_id IS NOT DISTINCT FROM r.ubicacion_id
      JOIN public.inventario_lotes l ON l.id = s.lote_id AND l.tenant_id = s.tenant_id
      WHERE r.cantidad > 0
        AND (p_lote_id IS NULL OR s.lote_id = p_lote_id)
        AND (NOT p_ubicacion_exacta OR s.ubicacion_id IS NOT DISTINCT FROM p_ubicacion_id)
      ORDER BY CASE WHEN p_desc THEN l.fecha_vencimiento END DESC NULLS LAST,
        CASE WHEN NOT p_desc THEN l.fecha_vencimiento END ASC NULLS LAST,
        l.created_at, l.id, s.id
      FOR UPDATE OF s
    LOOP
      EXIT WHEN v_restante <= 0;
      IF p_tipo = 'SALIDA' AND p_vence_desde IS NOT NULL
         AND v_row.fecha_vencimiento IS NOT NULL AND v_row.fecha_vencimiento < p_vence_desde THEN
        RAISE EXCEPTION 'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED: lote=% vence=% minimo=%',
          v_row.codigo, v_row.fecha_vencimiento, p_vence_desde USING ERRCODE = '23514';
      END IF;
      v_take := least(v_restante, v_row.cantidad);
      IF p_tipo = 'LIBERACION' THEN
        UPDATE public.inventario_lote_saldos SET stock_reservado = stock_reservado - v_take, updated_at = now()
        WHERE id = v_row.id;
      ELSIF p_tipo = 'SALIDA' THEN
        UPDATE public.inventario_lote_saldos
        SET stock_reservado = stock_reservado - v_take, stock_actual = stock_actual - v_take, updated_at = now()
        WHERE id = v_row.id;
      ELSE
        RAISE EXCEPTION 'INVENTORY_LOT_MODE_INVALID' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.movimientos_inventario_lotes (
        tenant_id, producto_id, almacen_id, lote_id, ubicacion_id, tipo, cantidad, consume_reserva,
        referencia_id, movimiento_id, operacion_id
      ) VALUES (
        p_tenant_id, p_producto_id, p_almacen_id, v_row.lote_id, v_row.ubicacion_id, p_tipo, v_take,
        p_tipo = 'SALIDA', p_referencia_id, p_movimiento_id, p_operacion_id
      );
      v_restante := v_restante - v_take;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'INVENTORY_LOT_MODE_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN v_restante;
END $fn$;

-- Reservado por una referencia, por lote/ubicación, sin modificar nada. Sirve
-- para que el despacho libere y descuente exactamente los mismos lotes.
CREATE FUNCTION app.lote_reserva_referencia_574(
  p_tenant_id uuid, p_producto_id uuid, p_almacen_id uuid, p_referencia_id uuid,
  p_lote text, p_cantidad numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_restante numeric := p_cantidad;
  v_result jsonb := '[]'::jsonb;
  v_take numeric;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT r.lote_id, r.ubicacion_id, r.cantidad
    FROM (
      SELECT m.lote_id, m.ubicacion_id,
        sum(CASE WHEN m.tipo = 'RESERVA' THEN m.cantidad
                 WHEN m.tipo = 'LIBERACION' OR m.consume_reserva THEN -m.cantidad
                 ELSE 0 END) AS cantidad
      FROM public.movimientos_inventario_lotes m
      WHERE m.tenant_id = p_tenant_id AND m.referencia_id = p_referencia_id
        AND m.producto_id = p_producto_id AND m.almacen_id = p_almacen_id
      GROUP BY m.lote_id, m.ubicacion_id
    ) r
    JOIN public.inventario_lotes l ON l.id = r.lote_id AND l.tenant_id = p_tenant_id
    WHERE r.cantidad > 0
    ORDER BY (p_lote IS NOT NULL AND upper(l.codigo) = upper(btrim(p_lote))) DESC,
      l.fecha_vencimiento ASC NULLS LAST, l.created_at, l.id, r.ubicacion_id NULLS FIRST
  LOOP
    EXIT WHEN v_restante <= 0;
    v_take := least(v_restante, v_row.cantidad);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'lote_id', v_row.lote_id, 'ubicacion_id', v_row.ubicacion_id, 'cantidad', v_take));
    v_restante := v_restante - v_take;
  END LOOP;
  IF v_restante > 0 THEN
    RAISE EXCEPTION 'INVENTORY_LOT_RESERVATION_INSUFFICIENT: referencia=% faltante=%',
      p_referencia_id, v_restante USING ERRCODE = '23514';
  END IF;
  RETURN v_result;
END $fn$;

-- Lotes del movimiento que se revierte o continúa (anulación de despacho,
-- reverso RMA, transferencia, nota de crédito o devolución a proveedor).
CREATE FUNCTION app.lote_origen_574(
  p_tenant_id uuid, p_producto_id uuid, p_almacen_id uuid, p_tipo text, p_metadata jsonb
) RETURNS TABLE (lote_id uuid, ubicacion_id uuid, almacen_id uuid, cantidad numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
  WITH meta AS (SELECT coalesce(p_metadata, '{}'::jsonb) AS m),
  fuente AS (
    SELECT ml.* FROM public.movimientos_inventario_lotes ml, meta
    WHERE ml.tenant_id = p_tenant_id AND ml.producto_id = p_producto_id
      AND ml.movimiento_id IS NOT NULL AND (
        (meta.m ? 'source_movement_id'
          AND ml.movimiento_id = app.to_uuid_or_null(meta.m->>'source_movement_id'))
        OR (NOT meta.m ? 'source_movement_id' AND p_tipo = 'ENTRADA' AND meta.m ? 'transferencia_id'
          AND ml.tipo = 'SALIDA' AND ml.referencia_id = app.to_uuid_or_null(meta.m->>'transferencia_id'))
        OR (NOT meta.m ? 'source_movement_id' AND NOT meta.m ? 'transferencia_id'
          AND p_tipo = 'ENTRADA' AND meta.m ? 'venta_origen_id' AND ml.tipo = 'SALIDA'
          AND ml.almacen_id = p_almacen_id
          AND ml.referencia_id = app.to_uuid_or_null(meta.m->>'venta_origen_id'))
        OR (NOT meta.m ? 'source_movement_id' AND p_tipo = 'SALIDA' AND meta.m ? 'recepcion_item_id'
          AND ml.tipo = 'ENTRADA' AND EXISTS (
            SELECT 1 FROM public.movimientos_inventario mi
            WHERE mi.id = ml.movimiento_id AND mi.tenant_id = p_tenant_id
              AND (mi.referencia_id = app.to_uuid_or_null(meta.m->>'recepcion_item_id')
                OR mi.metadata->>'recepcion_item_id' = meta.m->>'recepcion_item_id')))
      )
  )
  SELECT f.lote_id, f.ubicacion_id, f.almacen_id, sum(f.cantidad)
  FROM fuente f
  GROUP BY f.lote_id, f.ubicacion_id, f.almacen_id
$fn$;

-- El origen de una salida existe y entró sin lote (reverso RMA o devolución a
-- proveedor de una recepción sin lote).
CREATE FUNCTION app.lote_origen_sin_lote_574(p_tenant_id uuid, p_producto_id uuid, p_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
  WITH meta AS (SELECT coalesce(p_metadata, '{}'::jsonb) AS m),
  origen AS (
    SELECT mi.id FROM public.movimientos_inventario mi, meta
    WHERE mi.tenant_id = p_tenant_id AND mi.producto_id = p_producto_id AND (
      (meta.m ? 'source_movement_id' AND mi.id = app.to_uuid_or_null(meta.m->>'source_movement_id'))
      OR (NOT meta.m ? 'source_movement_id' AND meta.m ? 'recepcion_item_id'
        AND upper(coalesce(mi.tipo, '')) = 'ENTRADA'
        AND (mi.referencia_id = app.to_uuid_or_null(meta.m->>'recepcion_item_id')
          OR mi.metadata->>'recepcion_item_id' = meta.m->>'recepcion_item_id')))
  )
  SELECT EXISTS (SELECT 1 FROM origen)
    AND NOT EXISTS (SELECT 1 FROM public.movimientos_inventario_lotes ml
      WHERE ml.tenant_id = p_tenant_id AND ml.movimiento_id IN (SELECT id FROM origen))
$fn$;

-- Coherencia del almacén tras cada operación de lote.
CREATE FUNCTION app.lote_assert_coherencia_574(p_tenant_id uuid, p_producto_id uuid, p_almacen_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE v_stock numeric; v_reservado numeric; v_lote_stock numeric; v_lote_reservado numeric;
BEGIN
  SELECT coalesce(pe.stock_actual, 0), coalesce(pe.stock_reservado, 0) INTO v_stock, v_reservado
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = p_tenant_id AND pe.producto_id = p_producto_id AND pe.almacen_id = p_almacen_id;
  SELECT coalesce(sum(s.stock_actual), 0), coalesce(sum(s.stock_reservado), 0)
    INTO v_lote_stock, v_lote_reservado
  FROM public.inventario_lote_saldos s
  WHERE s.tenant_id = p_tenant_id AND s.producto_id = p_producto_id AND s.almacen_id = p_almacen_id;
  IF v_lote_stock > coalesce(v_stock, 0) OR v_lote_reservado <> coalesce(v_reservado, 0) THEN
    RAISE EXCEPTION 'INVENTORY_LOT_LEDGER_INCOHERENT: fisico=% lotes=% reservado=% reservado_lotes=%',
      v_stock, v_lote_stock, v_reservado, v_lote_reservado USING ERRCODE = '23514';
  END IF;
END $fn$;

-- Reparte un movimiento físico entre lotes. Sólo actúa con control de lote.
--   metadata.lotes: reparto explícito [{lote_id | lote + fecha_vencimiento,
--     ubicacion_id?, cantidad}]; con lotes_completar_fefo el resto sigue FEFO.
--   p_lote: un único lote indicado por el writer de negocio.
--   Sin lote: reflejo del movimiento origen y, si no lo hay, FEFO para salidas
--   y reservas. Una entrada sin evidencia de lote queda sin lote.
CREATE FUNCTION app.lote_aplicar_movimiento_574(
  p_tenant_id uuid, p_producto_id uuid, p_almacen_id uuid, p_tipo text, p_cantidad numeric,
  p_movimiento_id uuid, p_referencia_tipo text, p_referencia_id uuid, p_ubicacion_id uuid,
  p_lote text, p_fecha_expiracion date, p_metadata jsonb, p_liberar_reserva boolean, p_created_by text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_pol public.inventario_lote_politicas;
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_restante numeric := p_cantidad;
  v_item jsonb;
  v_cantidad numeric;
  v_lote_id uuid;
  v_lote public.inventario_lotes;
  v_ubicacion uuid;
  v_exacta boolean;
  v_falta numeric;
  v_permite_vencido boolean;
  v_vence_desde date;
  v_origen record;
  v_origen_total numeric;
  v_origen_lotes integer;
BEGIN
  SELECT * INTO v_pol FROM public.inventario_lote_politicas
  WHERE tenant_id = p_tenant_id AND producto_id = p_producto_id AND controla_lote;
  IF NOT FOUND THEN RETURN; END IF;

  -- Ajustes, transferencias, devoluciones y reversos pueden mover lotes
  -- vencidos; ventas y reservas no.
  v_permite_vencido := upper(coalesce(v_meta->>'business_movement_type', ''))
      IN ('AJUSTE', 'TRANSFERENCIA', 'RMA_RETURN', 'RMA_RETURN_REVERSAL')
    OR upper(coalesce(p_referencia_tipo, '')) IN ('DEVOLUCION_PROVEEDOR_ITEM', 'TRANSFERENCIA_SALIDA')
    OR v_meta ? 'source_movement_id';
  v_vence_desde := CASE WHEN v_permite_vencido AND p_tipo <> 'RESERVA' THEN NULL
    ELSE app.lote_vence_desde_574(p_tenant_id, p_producto_id, p_referencia_id, v_meta,
      v_pol.dias_minimos_vida_util) END;

  IF jsonb_typeof(v_meta->'lotes') = 'array' AND jsonb_array_length(v_meta->'lotes') > 0 THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_meta->'lotes') LOOP
      v_cantidad := nullif(v_item->>'cantidad', '')::numeric;
      IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
        RAISE EXCEPTION 'INVENTORY_LOT_QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
      IF nullif(v_item->>'lote_id', '') IS NOT NULL THEN
        SELECT * INTO v_lote FROM public.inventario_lotes
        WHERE tenant_id = p_tenant_id AND producto_id = p_producto_id AND id = (v_item->>'lote_id')::uuid;
        IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_LOT_NOT_FOUND: %', v_item->>'lote_id' USING ERRCODE = 'P0002'; END IF;
        v_lote_id := v_lote.id;
      ELSE
        v_lote_id := app.lote_resolver_574(p_tenant_id, p_producto_id, v_item->>'lote',
          nullif(v_item->>'fecha_vencimiento', '')::date, p_tipo = 'ENTRADA',
          v_pol.requiere_vencimiento, 'MOVIMIENTO', p_created_by);
        SELECT * INTO v_lote FROM public.inventario_lotes WHERE id = v_lote_id;
      END IF;
      v_exacta := v_item ? 'ubicacion_id';
      v_ubicacion := CASE WHEN v_exacta THEN nullif(v_item->>'ubicacion_id', '')::uuid ELSE p_ubicacion_id END;
      IF p_tipo IN ('SALIDA', 'RESERVA') AND v_vence_desde IS NOT NULL
         AND v_lote.fecha_vencimiento IS NOT NULL AND v_lote.fecha_vencimiento < v_vence_desde THEN
        RAISE EXCEPTION 'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED: lote=% vence=% minimo=%',
          v_lote.codigo, v_lote.fecha_vencimiento, v_vence_desde USING ERRCODE = '23514';
      END IF;
      IF p_tipo = 'ENTRADA' THEN
        PERFORM app.lote_sumar_574(p_tenant_id, p_producto_id, p_almacen_id, v_lote_id, v_ubicacion,
          v_cantidad, 'ENTRADA', p_referencia_id, p_movimiento_id, NULL);
        v_falta := 0;
      ELSIF p_tipo = 'LIBERACION' OR (p_tipo = 'SALIDA' AND p_liberar_reserva) THEN
        v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'REFERENCIA', p_tipo,
          v_cantidad, v_lote_id, v_ubicacion, v_exacta, p_referencia_id, p_movimiento_id, NULL,
          v_vence_desde, false);
      ELSE
        v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'DISPONIBLE', p_tipo,
          v_cantidad, v_lote_id, v_ubicacion, v_exacta, p_referencia_id, p_movimiento_id, NULL,
          NULL, false);
      END IF;
      IF v_falta > 0 THEN
        RAISE EXCEPTION 'INVENTORY_LOT_AVAILABLE_INSUFFICIENT: lote=% faltante=%', v_lote.codigo, v_falta
          USING ERRCODE = '23514';
      END IF;
      v_restante := v_restante - v_cantidad;
    END LOOP;
    IF v_restante < 0 OR (v_restante > 0 AND NOT coalesce((v_meta->>'lotes_completar_fefo')::boolean, false)) THEN
      RAISE EXCEPTION 'INVENTORY_LOT_ALLOCATION_MISMATCH: movimiento=% asignado=%',
        p_cantidad, p_cantidad - v_restante USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Recepción y ajuste manual conocen el lote físico: no se aceptan sin él.
  IF v_restante > 0 AND nullif(btrim(coalesce(p_lote, '')), '') IS NULL
     AND upper(coalesce(p_referencia_tipo, '')) IN ('RECEPCION', 'AJUSTE_MANUAL') THEN
    RAISE EXCEPTION 'INVENTORY_LOT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF v_restante > 0 THEN
    IF p_tipo = 'ENTRADA' THEN
      IF nullif(btrim(coalesce(p_lote, '')), '') IS NOT NULL THEN
        v_lote_id := app.lote_resolver_574(p_tenant_id, p_producto_id, p_lote, p_fecha_expiracion, true,
          v_pol.requiere_vencimiento, 'MOVIMIENTO', p_created_by);
        PERFORM app.lote_sumar_574(p_tenant_id, p_producto_id, p_almacen_id, v_lote_id, p_ubicacion_id,
          v_restante, 'ENTRADA', p_referencia_id, p_movimiento_id, NULL);
        v_restante := 0;
      ELSE
        SELECT coalesce(sum(o.cantidad), 0), count(DISTINCT o.lote_id) INTO v_origen_total, v_origen_lotes
        FROM app.lote_origen_574(p_tenant_id, p_producto_id, p_almacen_id, p_tipo, v_meta) o;
        IF v_origen_lotes = 1 THEN
          -- Un único lote de origen: la entrada completa vuelve a ese lote.
          SELECT o.* INTO v_origen
          FROM app.lote_origen_574(p_tenant_id, p_producto_id, p_almacen_id, p_tipo, v_meta) o
          ORDER BY o.cantidad DESC, o.ubicacion_id NULLS FIRST LIMIT 1;
          v_ubicacion := CASE WHEN v_origen.almacen_id = p_almacen_id
            THEN coalesce(p_ubicacion_id, v_origen.ubicacion_id) ELSE p_ubicacion_id END;
          PERFORM app.lote_sumar_574(p_tenant_id, p_producto_id, p_almacen_id, v_origen.lote_id, v_ubicacion,
            v_restante, 'ENTRADA', p_referencia_id, p_movimiento_id, NULL);
          v_restante := 0;
        ELSIF v_origen_lotes > 1 AND v_origen_total = v_restante THEN
          -- Reverso total de un reparto entre lotes: se refleja fila por fila.
          FOR v_origen IN
            SELECT o.* FROM app.lote_origen_574(p_tenant_id, p_producto_id, p_almacen_id, p_tipo, v_meta) o
            ORDER BY o.lote_id, o.ubicacion_id NULLS FIRST
          LOOP
            v_ubicacion := CASE WHEN v_origen.almacen_id = p_almacen_id
              THEN coalesce(p_ubicacion_id, v_origen.ubicacion_id) ELSE p_ubicacion_id END;
            PERFORM app.lote_sumar_574(p_tenant_id, p_producto_id, p_almacen_id, v_origen.lote_id, v_ubicacion,
              v_origen.cantidad, 'ENTRADA', p_referencia_id, p_movimiento_id, NULL);
          END LOOP;
          v_restante := 0;
        END IF;
        -- Lo no atribuible queda como stock sin lote, visible y pendiente de
        -- regularización; nunca se presume un lote.
      END IF;
    ELSIF p_tipo = 'RESERVA' THEN
      v_lote_id := CASE WHEN nullif(btrim(coalesce(p_lote, '')), '') IS NOT NULL
        THEN app.lote_resolver_574(p_tenant_id, p_producto_id, p_lote, NULL, false, false, 'MOVIMIENTO', p_created_by) END;
      IF v_lote_id IS NOT NULL THEN
        SELECT * INTO v_lote FROM public.inventario_lotes WHERE id = v_lote_id;
        IF v_lote.fecha_vencimiento IS NOT NULL AND v_lote.fecha_vencimiento < v_vence_desde THEN
          RAISE EXCEPTION 'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED: lote=% vence=% minimo=%',
            v_lote.codigo, v_lote.fecha_vencimiento, v_vence_desde USING ERRCODE = '23514';
        END IF;
      END IF;
      v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'DISPONIBLE', 'RESERVA',
        v_restante, v_lote_id, p_ubicacion_id, false, p_referencia_id, p_movimiento_id, NULL, v_vence_desde, false);
      IF v_falta > 0 THEN
        RAISE EXCEPTION 'INVENTORY_LOT_AVAILABLE_INSUFFICIENT_FOR_RESERVATION: faltante=% vence_desde=%',
          v_falta, v_vence_desde USING ERRCODE = '23514';
      END IF;
      v_restante := 0;
    ELSIF p_tipo = 'LIBERACION' THEN
      v_lote_id := CASE WHEN nullif(btrim(coalesce(p_lote, '')), '') IS NOT NULL
        THEN app.lote_resolver_574(p_tenant_id, p_producto_id, p_lote, NULL, false, false, 'MOVIMIENTO', p_created_by) END;
      v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'REFERENCIA', 'LIBERACION',
        v_restante, v_lote_id, p_ubicacion_id, false, p_referencia_id, p_movimiento_id, NULL, NULL, true);
      IF v_falta > 0 THEN
        RAISE EXCEPTION 'INVENTORY_LOT_RESERVATION_INSUFFICIENT: referencia=% faltante=%',
          p_referencia_id, v_falta USING ERRCODE = '23514';
      END IF;
      v_restante := 0;
    ELSE
      IF p_liberar_reserva THEN
        v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'REFERENCIA', 'SALIDA',
          v_restante, NULL, p_ubicacion_id, false, p_referencia_id, p_movimiento_id, NULL, v_vence_desde, false);
      ELSIF nullif(btrim(coalesce(p_lote, '')), '') IS NOT NULL THEN
        v_lote_id := app.lote_resolver_574(p_tenant_id, p_producto_id, p_lote, NULL, false, false, 'MOVIMIENTO', p_created_by);
        SELECT * INTO v_lote FROM public.inventario_lotes WHERE id = v_lote_id;
        IF v_vence_desde IS NOT NULL AND v_lote.fecha_vencimiento IS NOT NULL AND v_lote.fecha_vencimiento < v_vence_desde THEN
          RAISE EXCEPTION 'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED: lote=% vence=% minimo=%',
            v_lote.codigo, v_lote.fecha_vencimiento, v_vence_desde USING ERRCODE = '23514';
        END IF;
        v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'DISPONIBLE', 'SALIDA',
          v_restante, v_lote_id, p_ubicacion_id, false, p_referencia_id, p_movimiento_id, NULL, NULL, false);
      ELSE
        SELECT count(*) INTO v_origen_lotes
        FROM app.lote_origen_574(p_tenant_id, p_producto_id, p_almacen_id, p_tipo, v_meta) o
        WHERE o.almacen_id = p_almacen_id;
        IF v_origen_lotes = 0 AND app.lote_origen_sin_lote_574(p_tenant_id, p_producto_id, v_meta) THEN
          -- Revierte una entrada que quedó sin lote: descuenta stock sin lote.
          IF (SELECT coalesce(sum(s.stock_actual), 0) FROM public.inventario_lote_saldos s
              WHERE s.tenant_id = p_tenant_id AND s.producto_id = p_producto_id AND s.almacen_id = p_almacen_id)
             > (SELECT coalesce(pe.stock_actual, 0) FROM public.producto_existencias pe
              WHERE pe.tenant_id = p_tenant_id AND pe.producto_id = p_producto_id AND pe.almacen_id = p_almacen_id) THEN
            RAISE EXCEPTION 'INVENTORY_LOT_UNASSIGNED_INSUFFICIENT' USING ERRCODE = '23514';
          END IF;
          v_falta := 0;
        ELSIF v_origen_lotes > 0 THEN
          -- Devolver o revertir exactamente los lotes de origen; no se sustituye
          -- por otro lote.
          v_falta := v_restante;
          FOR v_origen IN
            SELECT o.lote_id, sum(o.cantidad) AS cantidad
            FROM app.lote_origen_574(p_tenant_id, p_producto_id, p_almacen_id, p_tipo, v_meta) o
            WHERE o.almacen_id = p_almacen_id
            GROUP BY o.lote_id ORDER BY o.lote_id
          LOOP
            EXIT WHEN v_falta <= 0;
            v_cantidad := least(v_falta, v_origen.cantidad);
            v_falta := v_falta - v_cantidad + app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id,
              'DISPONIBLE', 'SALIDA', v_cantidad, v_origen.lote_id, p_ubicacion_id, false,
              p_referencia_id, p_movimiento_id, NULL, NULL, false);
          END LOOP;
        ELSE
          v_falta := app.lote_tomar_574(p_tenant_id, p_producto_id, p_almacen_id, 'DISPONIBLE', 'SALIDA',
            v_restante, NULL, p_ubicacion_id, false, p_referencia_id, p_movimiento_id, NULL, v_vence_desde, false);
        END IF;
      END IF;
      IF v_falta > 0 THEN
        RAISE EXCEPTION 'INVENTORY_LOT_AVAILABLE_INSUFFICIENT: faltante=% vence_desde=%', v_falta, v_vence_desde
          USING ERRCODE = '23514';
      END IF;
      v_restante := 0;
    END IF;
  END IF;

  PERFORM app.lote_assert_coherencia_574(p_tenant_id, p_producto_id, p_almacen_id);
END $fn$;

-- ---------------------------------------------------------------------------
-- Writer único (347) con reparto por lote. El cuerpo es el de la 347; los dos
-- cambios están marcados con 574.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_movimiento_inventario_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_fecha_expiracion date DEFAULT NULL,
  p_created_by text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_liberar_reserva boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text := upper(btrim(COALESCE(p_tipo, '')));
  v_referencia_tipo text := upper(NULLIF(btrim(COALESCE(p_referencia_tipo, '')), ''));
  v_producto public.productos;
  v_existencia public.producto_existencias;
  v_movimiento_id uuid;
  v_movimiento_legacy_id uuid;
  v_stock_almacen numeric;
  v_reservado_almacen numeric;
  v_stock_total numeric;
  v_reservado_total numeric;
  v_costo_unitario numeric;
  v_metadata jsonb;
  v_controla_lote boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_producto_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_IDS_REQUIRED';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_QUANTITY_INVALID';
  END IF;
  IF v_tipo NOT IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION') THEN
    RAISE EXCEPTION 'INVENTORY_TYPE_UNSUPPORTED: %', v_tipo;
  END IF;

  SELECT p.*
    INTO v_producto
  FROM public.productos p
  WHERE p.id = p_producto_id
    AND p.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND_OR_TENANT_MISMATCH: %', p_producto_id;
  END IF;

  IF COALESCE(v_producto.es_servicio, false) OR NOT COALESCE(v_producto.controla_stock, true) THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_DOES_NOT_CONTROL_STOCK: %', p_producto_id;
  END IF;

  -- 574: la política se lee con el producto bloqueado.
  v_controla_lote := EXISTS (
    SELECT 1 FROM public.inventario_lote_politicas lp
    WHERE lp.tenant_id = p_tenant_id AND lp.producto_id = p_producto_id AND lp.controla_lote
  );

  PERFORM 1
  FROM public.almacenes a
  WHERE a.id = p_almacen_id
    AND a.tenant_id = p_tenant_id
    AND COALESCE(a.activo, true)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_NOT_FOUND_IN_TENANT: %', p_almacen_id;
  END IF;

  IF p_ubicacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.almacen_ubicaciones au
    WHERE au.id = p_ubicacion_id
      AND au.tenant_id = p_tenant_id
      AND au.almacen_id = p_almacen_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_LOCATION_NOT_IN_WAREHOUSE: %', p_ubicacion_id;
  END IF;

  IF p_referencia_id IS NOT NULL AND v_referencia_tipo IS NOT NULL THEN
    SELECT mi.id
      INTO v_movimiento_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.producto_id = p_producto_id
      AND mi.almacen_id = p_almacen_id
      AND mi.tipo = v_tipo
      AND mi.referencia_tipo = v_referencia_tipo
      AND mi.referencia_id = p_referencia_id
    ORDER BY mi.created_at, mi.id
    LIMIT 1
    FOR UPDATE;

    IF v_movimiento_id IS NOT NULL THEN
      RETURN v_movimiento_id;
    END IF;

    -- Adopta el movimiento que la implementacion POS 327 inserto dentro de la
    -- misma transaccion antes de que este wrapper aplique la existencia fisica.
    SELECT mi.id
      INTO v_movimiento_legacy_id
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.producto_id = p_producto_id
      AND mi.almacen_id IS NULL
      AND mi.tipo = v_tipo
      AND mi.referencia_tipo = v_referencia_tipo
      AND mi.referencia_id = p_referencia_id
    ORDER BY mi.created_at DESC, mi.id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  SELECT pe.*
    INTO v_existencia
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = p_tenant_id
    AND pe.producto_id = p_producto_id
    AND pe.almacen_id = p_almacen_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_tipo <> 'ENTRADA' THEN
      RAISE EXCEPTION 'INVENTORY_EXISTENCE_REQUIRED: producto=% almacen=%', p_producto_id, p_almacen_id;
    END IF;

    INSERT INTO public.producto_existencias (
      id, tenant_id, producto_id, almacen_id, ubicacion_id, lote,
      fecha_expiracion, stock_actual, stock_reservado, stock_danado,
      estado, metadata, ultimo_movimiento_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_producto_id, p_almacen_id,
      p_ubicacion_id,
      CASE WHEN v_controla_lote THEN NULL ELSE p_lote END,
      CASE WHEN v_controla_lote THEN NULL ELSE p_fecha_expiracion END,
      0, 0, 0,
      'ACTIVO', '{}'::jsonb, now(), now(), now()
    )
    ON CONFLICT (tenant_id, producto_id, almacen_id) DO NOTHING;

    SELECT pe.*
      INTO v_existencia
    FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id
      AND pe.producto_id = p_producto_id
      AND pe.almacen_id = p_almacen_id
    FOR UPDATE;
  END IF;

  v_stock_almacen := COALESCE(v_existencia.stock_actual, 0);
  v_reservado_almacen := COALESCE(v_existencia.stock_reservado, 0);

  IF v_tipo = 'ENTRADA' THEN
    v_stock_almacen := v_stock_almacen + p_cantidad;
  ELSIF v_tipo = 'SALIDA' THEN
    IF p_liberar_reserva THEN
      IF v_stock_almacen < p_cantidad OR v_reservado_almacen < p_cantidad THEN
        RAISE EXCEPTION 'INVENTORY_RESERVED_STOCK_INSUFFICIENT: disponible=% reservado=% solicitado=%',
          v_stock_almacen, v_reservado_almacen, p_cantidad;
      END IF;
      v_stock_almacen := v_stock_almacen - p_cantidad;
      v_reservado_almacen := v_reservado_almacen - p_cantidad;
    ELSE
      IF (v_stock_almacen - v_reservado_almacen) < p_cantidad THEN
        RAISE EXCEPTION 'INVENTORY_AVAILABLE_STOCK_INSUFFICIENT: disponible=% solicitado=%',
          v_stock_almacen - v_reservado_almacen, p_cantidad;
      END IF;
      v_stock_almacen := v_stock_almacen - p_cantidad;
    END IF;
  ELSIF v_tipo = 'RESERVA' THEN
    IF (v_stock_almacen - v_reservado_almacen) < p_cantidad THEN
      RAISE EXCEPTION 'INVENTORY_AVAILABLE_STOCK_INSUFFICIENT_FOR_RESERVATION: disponible=% solicitado=%',
        v_stock_almacen - v_reservado_almacen, p_cantidad;
    END IF;
    v_reservado_almacen := v_reservado_almacen + p_cantidad;
  ELSIF v_tipo = 'LIBERACION' THEN
    IF v_reservado_almacen < p_cantidad THEN
      RAISE EXCEPTION 'INVENTORY_RESERVATION_INSUFFICIENT_FOR_RELEASE: reservado=% solicitado=%',
        v_reservado_almacen, p_cantidad;
    END IF;
    v_reservado_almacen := v_reservado_almacen - p_cantidad;
  END IF;

  -- 574: con control de lote el lote vive en el saldo por lote, no se
  -- sobrescribe en la existencia agregada del almacén.
  UPDATE public.producto_existencias pe
  SET stock_actual = v_stock_almacen,
      stock_reservado = v_reservado_almacen,
      ubicacion_id = COALESCE(p_ubicacion_id, pe.ubicacion_id),
      lote = CASE WHEN v_controla_lote THEN pe.lote ELSE COALESCE(p_lote, pe.lote) END,
      fecha_expiracion = CASE WHEN v_controla_lote THEN pe.fecha_expiracion
        ELSE COALESCE(p_fecha_expiracion, pe.fecha_expiracion) END,
      ultimo_movimiento_at = now(),
      updated_at = now()
  WHERE pe.id = v_existencia.id;

  SELECT COALESCE(SUM(COALESCE(pe.stock_actual, 0)), 0),
         COALESCE(SUM(COALESCE(pe.stock_reservado, 0)), 0)
    INTO v_stock_total, v_reservado_total
  FROM public.producto_existencias pe
  WHERE pe.tenant_id = p_tenant_id
    AND pe.producto_id = p_producto_id;

  UPDATE public.productos p
  SET stock_actual = v_stock_total,
      stock = v_stock_total,
      stock_reservado = v_reservado_total,
      updated_at = now()
  WHERE p.id = p_producto_id
    AND p.tenant_id = p_tenant_id;

  v_costo_unitario := COALESCE(
    NULLIF(app.to_numeric_or_zero(COALESCE(p_metadata, '{}'::jsonb)->>'costo_unitario'), 0),
    NULLIF(v_producto.precio_compra, 0),
    NULLIF(v_producto.costo, 0),
    0
  );
  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'inventory_writer', 'aplicar_movimiento_inventario_tx',
    'almacen_id', p_almacen_id,
    'stock_almacen_actual', v_stock_almacen,
    'stock_almacen_reservado', v_reservado_almacen,
    'stock_total_actual', v_stock_total,
    'stock_total_reservado', v_reservado_total,
    'metodo_costeo', COALESCE(COALESCE(p_metadata, '{}'::jsonb)->>'metodo_costeo', 'ULTIMO_COSTO'),
    'costo_unitario', v_costo_unitario,
    'valor_total', round(p_cantidad * v_costo_unitario, 2)
  );

  IF v_movimiento_legacy_id IS NOT NULL THEN
    UPDATE public.movimientos_inventario mi
    SET almacen_id = p_almacen_id,
        ubicacion_id = COALESCE(p_ubicacion_id, mi.ubicacion_id),
        lote = COALESCE(p_lote, mi.lote),
        fecha_expiracion = COALESCE(p_fecha_expiracion::timestamptz, mi.fecha_expiracion),
        created_by = COALESCE(p_created_by, mi.created_by),
        notas = COALESCE(p_notas, mi.notas),
        stock_actual = v_stock_total::text,
        stock_reservado = v_reservado_total::text,
        metadata = COALESCE(mi.metadata, '{}'::jsonb) || v_metadata,
        updated_at = now()
    WHERE mi.id = v_movimiento_legacy_id
    RETURNING mi.id INTO v_movimiento_id;
  ELSE
    INSERT INTO public.movimientos_inventario (
      id, tenant_id, producto_id, almacen_id, ubicacion_id, lote,
      fecha_expiracion, tipo, tipo_movimiento, cantidad, referencia_tipo,
      referencia_id, created_by, motivo, notas, stock_actual, stock_reservado,
      activo, estado, metadata, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_producto_id, p_almacen_id,
      p_ubicacion_id, p_lote, p_fecha_expiracion::timestamptz,
      v_tipo, v_tipo, p_cantidad, v_referencia_tipo, p_referencia_id,
      p_created_by, COALESCE(p_notas, v_tipo || ' de inventario'), p_notas,
      v_stock_total::text, v_reservado_total::text, true, 'ACTIVO',
      v_metadata, now(), now()
    )
    RETURNING id INTO v_movimiento_id;
  END IF;

  -- 574: reparto por lote dentro de la misma transacción del movimiento.
  IF v_controla_lote THEN
    PERFORM app.lote_aplicar_movimiento_574(
      p_tenant_id, p_producto_id, p_almacen_id, v_tipo, p_cantidad, v_movimiento_id,
      v_referencia_tipo, p_referencia_id, p_ubicacion_id, p_lote, p_fecha_expiracion,
      p_metadata, p_liberar_reserva, p_created_by
    );
  END IF;

  RETURN v_movimiento_id;
END;
$$;

-- Despacho de pedido: con control de lote libera y descuenta exactamente los
-- lotes reservados por el pedido. Un lote indicado en el despacho prevalece
-- sobre los reservados; cualquier excedente sobre la reserva sigue FEFO.
CREATE OR REPLACE FUNCTION public.despachar_stock_en_almacen_tx(
  p_tenant_id uuid,
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_cantidad_reservada numeric,
  p_referencia_tipo text,
  p_referencia_id uuid,
  p_notas text DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_liberar numeric := LEAST(GREATEST(COALESCE(p_cantidad_reservada, 0), 0), p_cantidad);
  v_salida_id uuid;
  v_lotes jsonb := '[]'::jsonb;
  v_controla_lote boolean;
BEGIN
  PERFORM 1 FROM public.productos p WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  v_controla_lote := EXISTS (
    SELECT 1 FROM public.inventario_lote_politicas lp
    WHERE lp.tenant_id = p_tenant_id AND lp.producto_id = p_producto_id AND lp.controla_lote
  );

  IF v_liberar > 0 THEN
    IF v_controla_lote THEN
      v_lotes := app.lote_reserva_referencia_574(p_tenant_id, p_producto_id, p_almacen_id,
        p_referencia_id, p_lote, v_liberar);
    END IF;
    PERFORM public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := p_producto_id,
      p_almacen_id := p_almacen_id,
      p_tipo := 'LIBERACION',
      p_cantidad := v_liberar,
      p_referencia_tipo := COALESCE(p_referencia_tipo, 'DESPACHO') || '_LIBERACION',
      p_referencia_id := p_referencia_id,
      p_notas := p_notas,
      p_ubicacion_id := p_ubicacion_id,
      p_lote := CASE WHEN v_controla_lote THEN NULL ELSE p_lote END,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb)
        || jsonb_build_object('atomic_rpc', 'despachar_stock_en_almacen_tx')
        || CASE WHEN v_controla_lote THEN jsonb_build_object('lotes', v_lotes) ELSE '{}'::jsonb END
    );
  END IF;

  v_salida_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := p_producto_id,
    p_almacen_id := p_almacen_id,
    p_tipo := 'SALIDA',
    p_cantidad := p_cantidad,
    p_referencia_tipo := p_referencia_tipo,
    p_referencia_id := p_referencia_id,
    p_notas := p_notas,
    p_ubicacion_id := p_ubicacion_id,
    p_lote := p_lote,
    p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'atomic_rpc', 'despachar_stock_en_almacen_tx',
      'cantidad_reserva_liberada', v_liberar
    ) || CASE WHEN v_controla_lote AND nullif(btrim(coalesce(p_lote, '')), '') IS NULL
                   AND jsonb_array_length(v_lotes) > 0
      THEN jsonb_build_object('lotes', v_lotes, 'lotes_completar_fefo', true)
      ELSE '{}'::jsonb END
  );

  RETURN v_salida_id;
END;
$$;

-- Ajuste manual (455) con lote opcional. Sin lote, la huella es la misma que
-- antes, de modo que una clave idempotente previa conserva su resultado.
CREATE OR REPLACE FUNCTION app.registrar_ajuste_inventario_tx_455(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_producto_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'producto_id', ''));
  v_almacen_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'almacen_id', ''));
  v_ubicacion_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'ubicacion_id', ''));
  v_centro_costo_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'centro_costo_id', ''));
  v_delta numeric := NULLIF(p_payload->>'delta', '')::numeric;
  v_motivo text := NULLIF(btrim(COALESCE(p_payload->>'motivo', '')), '');
  v_lote text := NULLIF(btrim(COALESCE(p_payload->>'lote', '')), '');
  v_fecha_expiracion date := NULLIF(p_payload->>'fecha_expiracion', '')::date;
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.operaciones_inventario%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_movimiento public.movimientos_inventario%ROWTYPE;
  v_movimiento_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_tipo_fisico text;
  v_tipo_ajuste text;
  v_costo numeric;
  v_valor numeric;
  v_resultado jsonb;
  v_event_key text;
BEGIN
  PERFORM app.assert_inventory_actor_455(p_tenant_id, p_actor_id);
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_producto_id IS NULL OR v_almacen_id IS NULL
     OR v_delta IS NULL OR v_delta = 0 OR abs(v_delta) > 999999999999::numeric
     OR v_motivo IS NULL OR length(v_motivo) > 500
     OR length(COALESCE(v_lote, '')) > 80
     OR (v_fecha_expiracion IS NOT NULL AND v_lote IS NULL) THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_delta := round(v_delta, 6);
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_DELTA_TOO_SMALL' USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_build_object(
    'producto_id', v_producto_id,
    'almacen_id', v_almacen_id,
    'ubicacion_id', v_ubicacion_id,
    'centro_costo_id', v_centro_costo_id,
    'delta', v_delta,
    'motivo', v_motivo
  ) || CASE WHEN v_lote IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('lote', v_lote, 'fecha_expiracion', v_fecha_expiracion) END;
  v_fingerprint := app.inventory_operation_fingerprint_455(v_canonical);

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:AJUSTE:%s', p_tenant_id, v_key), 0)
  );

  SELECT * INTO v_operacion
  FROM public.operaciones_inventario o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo = 'AJUSTE'
    AND o.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'INVENTORY_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    IF v_operacion.resultado IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_INCOMPLETE_RETRY'
        USING ERRCODE = '40001';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_producto
  FROM public.productos p
  WHERE p.id = v_producto_id
    AND p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_producto.es_servicio, false)
     OR NOT COALESCE(v_producto.controla_stock, true) THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_DOES_NOT_CONTROL_STOCK' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.almacenes a
  WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, true)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_NOT_FOUND_IN_TENANT' USING ERRCODE = '23503';
  END IF;
  IF v_ubicacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = v_ubicacion_id AND u.tenant_id = p_tenant_id
      AND u.almacen_id = v_almacen_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_LOCATION_NOT_IN_WAREHOUSE' USING ERRCODE = '23503';
  END IF;
  IF v_centro_costo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.centros_costo c
    WHERE c.id = v_centro_costo_id AND c.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_COST_CENTER_NOT_IN_TENANT' USING ERRCODE = '23503';
  END IF;

  v_costo := COALESCE(
    NULLIF(v_producto.precio_compra, 0),
    NULLIF(v_producto.costo, 0),
    0
  );
  IF v_costo <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_UNIT_COST_REQUIRED' USING ERRCODE = '23514';
  END IF;
  v_valor := round(abs(v_delta) * v_costo, 2);
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_VALUE_INVALID' USING ERRCODE = '23514';
  END IF;

  v_operacion.id := gen_random_uuid();
  v_tipo_fisico := CASE WHEN v_delta > 0 THEN 'ENTRADA' ELSE 'SALIDA' END;
  v_tipo_ajuste := CASE WHEN v_delta > 0 THEN 'SOBRANTE' ELSE 'FALTANTE' END;

  -- El anchor nace antes del writer, pero la constraint se difiere mediante la
  -- insercion final completa: la fila se inserta despues de obtener movimiento.
  v_movimiento_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_almacen_id,
    p_tipo := v_tipo_fisico,
    p_cantidad := abs(v_delta),
    p_referencia_tipo := 'AJUSTE_MANUAL',
    p_referencia_id := v_operacion.id,
    p_notas := v_motivo,
    p_ubicacion_id := v_ubicacion_id,
    p_lote := v_lote,
    p_fecha_expiracion := v_fecha_expiracion,
    p_created_by := p_actor_id::text,
    p_metadata := jsonb_build_object(
      'business_movement_type', 'AJUSTE',
      'delta', v_delta,
      'costo_unitario', v_costo,
      'valor_total', v_valor,
      'idempotency_key', v_key,
      'actor_id', p_actor_id
    )
  );

  SELECT * INTO v_movimiento
  FROM public.movimientos_inventario
  WHERE id = v_movimiento_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_MOVEMENT_NOT_PERSISTED'
      USING ERRCODE = '40001';
  END IF;

  v_event_key := format('ajuste.inventario.aplicado:%s:%s', p_tenant_id, v_operacion.id);
  v_resultado := jsonb_build_object(
    'success', true,
    'operacion_id', v_operacion.id,
    'movimiento_id', v_movimiento_id,
    'event_id', v_event_id,
    'producto_id', v_producto_id,
    'almacen_id', v_almacen_id,
    'delta', v_delta,
    'cantidad', abs(v_delta),
    'tipo', v_tipo_ajuste,
    'costo_unitario', v_costo,
    'valor', v_valor,
    'stock_nuevo', app.to_numeric_or_zero(v_movimiento.stock_actual),
    'idempotent', false
  ) || CASE WHEN v_lote IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('lote', v_lote) END;

  INSERT INTO public.operaciones_inventario (
    id, tenant_id, tipo, idempotency_key, fingerprint, producto_id,
    almacen_origen_id, ubicacion_origen_id, cantidad, delta, costo_unitario,
    motivo, actor_id, movimiento_salida_id, movimiento_entrada_id,
    event_id, resultado, metadata
  ) VALUES (
    v_operacion.id, p_tenant_id, 'AJUSTE', v_key, v_fingerprint, v_producto_id,
    v_almacen_id, v_ubicacion_id, abs(v_delta), v_delta, v_costo,
    v_motivo, p_actor_id,
    CASE WHEN v_delta < 0 THEN v_movimiento_id ELSE NULL END,
    CASE WHEN v_delta > 0 THEN v_movimiento_id ELSE NULL END,
    v_event_id, v_resultado,
    jsonb_build_object('payload', v_canonical)
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'ajuste_inventario', v_operacion.id::text,
    'ajuste.inventario.aplicado',
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key,
      'operacionId', v_operacion.id,
      'movimientoId', v_movimiento_id,
      'productoId', v_producto_id,
      'almacenId', v_almacen_id,
      'fecha', clock_timestamp(),
      'diferencia', v_delta,
      'cantidad', abs(v_delta),
      'tipo', v_tipo_ajuste,
      'costoUnitario', v_costo,
      'valor', v_valor,
      'centro_costo_id', v_centro_costo_id,
      'referencia', format('AJUSTE:%s', v_operacion.id),
      'motivo', v_motivo,
      'actorId', p_actor_id,
      'accountingHandledByOutbox', true
    ),
    'pending', 0, v_event_key, v_event_id, clock_timestamp()
  );

  RETURN v_resultado;
END;
$function$;
REVOKE ALL ON FUNCTION app.registrar_ajuste_inventario_tx_455(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Una ubicación con stock por lote no se desactiva.
CREATE FUNCTION app.guard_lote_ubicacion_574() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  IF lower(coalesce(OLD.estado::text, 'inactivo')) = 'activo'
     AND lower(coalesce(NEW.estado::text, 'inactivo')) <> 'activo' AND EXISTS (
    SELECT 1 FROM public.inventario_lote_saldos s
    WHERE s.ubicacion_id = NEW.id AND s.tenant_id = NEW.tenant_id AND s.stock_actual > 0
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_guard_lote_ubicacion_574 BEFORE UPDATE OF estado ON public.almacen_ubicaciones
FOR EACH ROW EXECUTE FUNCTION app.guard_lote_ubicacion_574();

-- ---------------------------------------------------------------------------
-- API: consultas y operaciones con actor y permiso
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.lote_estado_574(p_vence date, p_hoy date, p_dias integer, p_alerta integer)
RETURNS text LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_vence IS NULL THEN 'SIN_VENCIMIENTO'
    WHEN p_vence < p_hoy THEN 'VENCIDO'
    WHEN p_vence < p_hoy + coalesce(p_dias, 0) THEN 'VIDA_UTIL_INSUFICIENTE'
    WHEN p_vence <= p_hoy + coalesce(p_alerta, 90) THEN 'POR_VENCER'
    ELSE 'VIGENTE' END
$fn$;

CREATE FUNCTION public.consultar_lotes_inventario_574(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL, p_lote_id uuid DEFAULT NULL, p_busqueda text DEFAULT '',
  p_dias integer DEFAULT 90, p_pagina integer DEFAULT 1, p_limite integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_q text := btrim(coalesce(p_busqueda, ''));
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_pol public.inventario_lote_politicas;
  v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'inventario.lotes.read');
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 100000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 200
     OR p_dias IS NULL OR p_dias NOT BETWEEN 0 AND 3650 OR length(v_q) > 120 THEN
    RAISE EXCEPTION 'INVENTORY_LOT_QUERY_INVALID' USING ERRCODE = '22023';
  END IF;
  v_q := replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  IF p_accion = 'PRODUCTOS' THEN
    SELECT jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.nombre, s.id), '[]'::jsonb),
      'pagina', p_pagina, 'limite', p_limite) INTO v_result
    FROM (
      SELECT p.id, p.codigo, p.nombre, p.unidad_medida, coalesce(p.stock_actual, 0) AS stock_actual,
        coalesce(lp.controla_lote, false) AS controla_lote
      FROM public.productos p
      LEFT JOIN public.inventario_lote_politicas lp ON lp.tenant_id = p.tenant_id AND lp.producto_id = p.id
      WHERE p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
        AND NOT coalesce(p.es_servicio, false) AND coalesce(p.controla_stock, true)
        AND (p.nombre ILIKE '%' || v_q || '%' OR p.codigo ILIKE '%' || v_q || '%')
      ORDER BY p.nombre, p.id LIMIT p_limite OFFSET (p_pagina - 1) * p_limite
    ) s;
    RETURN v_result;
  END IF;

  IF p_accion = 'POR_VENCER' THEN
    SELECT jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.fecha_vencimiento, s.producto_nombre, s.lote_id), '[]'::jsonb),
      'hoy', v_hoy, 'dias', p_dias) INTO v_result
    FROM (
      SELECT l.id AS lote_id, l.codigo AS lote, l.fecha_vencimiento, p.id AS producto_id,
        p.codigo AS producto_codigo, p.nombre AS producto_nombre,
        sum(s.stock_actual) AS stock_actual, sum(s.stock_reservado) AS stock_reservado,
        app.lote_estado_574(l.fecha_vencimiento, v_hoy, lp.dias_minimos_vida_util, p_dias) AS estado
      FROM public.inventario_lote_saldos s
      JOIN public.inventario_lotes l ON l.id = s.lote_id AND l.tenant_id = s.tenant_id
      JOIN public.productos p ON p.id = s.producto_id AND p.tenant_id = s.tenant_id
      JOIN public.inventario_lote_politicas lp ON lp.tenant_id = s.tenant_id AND lp.producto_id = s.producto_id
      WHERE s.tenant_id = p_tenant_id AND s.stock_actual > 0 AND l.fecha_vencimiento IS NOT NULL
        AND l.fecha_vencimiento <= v_hoy + p_dias
        AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
      GROUP BY l.id, p.id, lp.dias_minimos_vida_util
      ORDER BY l.fecha_vencimiento, p.nombre, l.id
      LIMIT p_limite OFFSET (p_pagina - 1) * p_limite
    ) s;
    RETURN v_result;
  END IF;

  PERFORM 1 FROM public.productos p WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_LOT_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_pol FROM public.inventario_lote_politicas WHERE tenant_id = p_tenant_id AND producto_id = p_producto_id;

  IF p_accion = 'PRODUCTO' THEN
    SELECT jsonb_build_object(
      'hoy', v_hoy,
      'producto', (SELECT jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre,
          'unidad_medida', p.unidad_medida, 'stock_actual', coalesce(p.stock_actual, 0),
          'stock_reservado', coalesce(p.stock_reservado, 0))
        FROM public.productos p WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id),
      'politica', CASE WHEN v_pol.producto_id IS NULL THEN jsonb_build_object('controla_lote', false,
          'requiere_vencimiento', true, 'dias_minimos_vida_util', 0, 'version', 0)
        ELSE jsonb_build_object('controla_lote', v_pol.controla_lote, 'requiere_vencimiento', v_pol.requiere_vencimiento,
          'dias_minimos_vida_util', v_pol.dias_minimos_vida_util, 'version', v_pol.version, 'updated_at', v_pol.updated_at) END,
      'almacenes', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'almacen_id', a.id, 'almacen_codigo', a.codigo, 'almacen_nombre', a.nombre,
          'stock_actual', coalesce(pe.stock_actual, 0), 'stock_reservado', coalesce(pe.stock_reservado, 0),
          'stock_lotes', coalesce(ls.stock, 0), 'reservado_lotes', coalesce(ls.reservado, 0),
          'stock_sin_lote', CASE WHEN coalesce(v_pol.controla_lote, false)
            THEN greatest(coalesce(pe.stock_actual, 0) - coalesce(ls.stock, 0), 0) ELSE 0 END,
          'saldos', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'lote_id', l.id, 'lote', l.codigo, 'fecha_vencimiento', l.fecha_vencimiento,
              'ubicacion_id', s.ubicacion_id, 'ubicacion_codigo', u.codigo, 'ubicacion_nombre', u.nombre,
              'stock_actual', s.stock_actual, 'stock_reservado', s.stock_reservado,
              'disponible', s.stock_actual - s.stock_reservado,
              'estado', app.lote_estado_574(l.fecha_vencimiento, v_hoy, v_pol.dias_minimos_vida_util, p_dias))
              ORDER BY l.fecha_vencimiento NULLS LAST, l.codigo, u.codigo NULLS FIRST)
            FROM public.inventario_lote_saldos s
            JOIN public.inventario_lotes l ON l.id = s.lote_id AND l.tenant_id = s.tenant_id
            LEFT JOIN public.almacen_ubicaciones u ON u.id = s.ubicacion_id AND u.tenant_id = s.tenant_id
            WHERE s.tenant_id = p_tenant_id AND s.producto_id = p_producto_id AND s.almacen_id = a.id
              AND (s.stock_actual > 0 OR s.stock_reservado > 0)), '[]'::jsonb),
          'reservas', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'referencia_id', r.referencia_id, 'lote_id', r.lote_id, 'lote', l.codigo,
              'fecha_vencimiento', l.fecha_vencimiento, 'ubicacion_id', r.ubicacion_id,
              'cantidad', r.cantidad, 'pedido_numero', pv.numero,
              'cliente_nombre', (SELECT coalesce(c.razon_social, c.nombre) FROM public.clientes c
                WHERE c.id = pv.cliente_id AND c.tenant_id = pv.tenant_id))
              ORDER BY pv.numero NULLS LAST, r.referencia_id, l.fecha_vencimiento NULLS LAST)
            FROM (
              SELECT m.referencia_id, m.lote_id, m.ubicacion_id,
                sum(CASE WHEN m.tipo = 'RESERVA' THEN m.cantidad
                         WHEN m.tipo = 'LIBERACION' OR m.consume_reserva THEN -m.cantidad ELSE 0 END) AS cantidad
              FROM public.movimientos_inventario_lotes m
              WHERE m.tenant_id = p_tenant_id AND m.producto_id = p_producto_id AND m.almacen_id = a.id
                AND m.referencia_id IS NOT NULL
              GROUP BY m.referencia_id, m.lote_id, m.ubicacion_id
            ) r
            JOIN public.inventario_lotes l ON l.id = r.lote_id AND l.tenant_id = p_tenant_id
            LEFT JOIN public.pedidos_venta pv ON pv.id = r.referencia_id AND pv.tenant_id = p_tenant_id
            WHERE r.cantidad > 0), '[]'::jsonb))
          ORDER BY a.es_principal DESC NULLS LAST, a.nombre, a.id)
        FROM public.almacenes a
        LEFT JOIN public.producto_existencias pe
          ON pe.tenant_id = a.tenant_id AND pe.almacen_id = a.id AND pe.producto_id = p_producto_id
        LEFT JOIN LATERAL (
          SELECT sum(s.stock_actual) AS stock, sum(s.stock_reservado) AS reservado
          FROM public.inventario_lote_saldos s
          WHERE s.tenant_id = a.tenant_id AND s.almacen_id = a.id AND s.producto_id = p_producto_id
        ) ls ON true
        WHERE a.tenant_id = p_tenant_id AND (coalesce(a.activo, true) OR coalesce(pe.stock_actual, 0) > 0)
          AND (p_almacen_id IS NULL OR a.id = p_almacen_id)), '[]'::jsonb),
      'operaciones', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.id, 'accion', o.accion, 'almacen_id', o.almacen_id,
            'referencia_id', o.referencia_id, 'motivo', o.motivo, 'anterior', o.anterior, 'resultado', o.resultado,
            'actor_nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u
              WHERE u.id = o.actor_id AND u.tenant_id = o.tenant_id), 'created_at', o.created_at)
          ORDER BY o.created_at DESC, o.id)
        FROM (SELECT * FROM public.inventario_lote_operaciones o
          WHERE o.tenant_id = p_tenant_id AND o.producto_id = p_producto_id
          ORDER BY o.created_at DESC, o.id LIMIT 50) o), '[]'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  ELSIF p_accion = 'MOVIMIENTOS' THEN
    -- Kardex por lote: entradas, salidas y regularizaciones con saldo corrido
    -- por lote y almacén; reservas y liberaciones no cambian el físico.
    SELECT jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC, s.id DESC), '[]'::jsonb),
      'pagina', p_pagina, 'limite', p_limite) INTO v_result
    FROM (
      SELECT k.* FROM (
        SELECT m.id, m.created_at, m.tipo, m.cantidad, m.consume_reserva, m.almacen_id, a.nombre AS almacen_nombre,
          m.lote_id, l.codigo AS lote, l.fecha_vencimiento, m.ubicacion_id, u.codigo AS ubicacion_codigo,
          m.referencia_id, m.movimiento_id, m.operacion_id,
          coalesce(mi.referencia_tipo, o.accion) AS referencia_tipo, coalesce(mi.notas, o.motivo) AS notas,
          sum(CASE WHEN m.tipo IN ('ENTRADA', 'REGULARIZACION') THEN m.cantidad
                   WHEN m.tipo = 'SALIDA' THEN -m.cantidad ELSE 0 END)
            OVER (PARTITION BY m.lote_id, m.almacen_id ORDER BY m.created_at, m.id) AS saldo_lote
        FROM public.movimientos_inventario_lotes m
        JOIN public.inventario_lotes l ON l.id = m.lote_id AND l.tenant_id = m.tenant_id
        JOIN public.almacenes a ON a.id = m.almacen_id AND a.tenant_id = m.tenant_id
        LEFT JOIN public.almacen_ubicaciones u ON u.id = m.ubicacion_id AND u.tenant_id = m.tenant_id
        LEFT JOIN public.movimientos_inventario mi ON mi.id = m.movimiento_id AND mi.tenant_id = m.tenant_id
        LEFT JOIN public.inventario_lote_operaciones o ON o.id = m.operacion_id AND o.tenant_id = m.tenant_id
        WHERE m.tenant_id = p_tenant_id AND m.producto_id = p_producto_id
          AND (p_almacen_id IS NULL OR m.almacen_id = p_almacen_id)
          AND (p_lote_id IS NULL OR m.lote_id = p_lote_id)
      ) k
      ORDER BY k.created_at DESC, k.id DESC
      LIMIT p_limite OFFSET (p_pagina - 1) * p_limite
    ) s;
    RETURN v_result;
  END IF;
  RAISE EXCEPTION 'INVENTORY_LOT_ACTION_INVALID' USING ERRCODE = '22023';
END $fn$;

CREATE FUNCTION public.operar_lotes_inventario_574(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_op public.inventario_lote_operaciones;
  v_producto public.productos;
  v_pol public.inventario_lote_politicas;
  v_old jsonb;
  v_new jsonb;
  v_result jsonb;
  v_producto_id uuid;
  v_almacen_id uuid;
  v_referencia_id uuid;
  v_motivo text := nullif(btrim(p_payload->>'motivo'), '');
  v_item jsonb;
  v_cantidad numeric;
  v_total numeric := 0;
  v_actual numeric;
  v_sin_lote numeric;
  v_lote_id uuid;
  v_lote public.inventario_lotes;
  v_ubicacion uuid;
  v_falta numeric;
  v_vence_desde date;
  v_controla boolean;
  v_dias integer;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'inventario.lotes.manage');
  IF length(v_key) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_accion IS NULL OR p_accion NOT IN ('CONFIGURAR_POLITICA', 'REGULARIZAR', 'REASIGNAR_RESERVA') THEN
    RAISE EXCEPTION 'INVENTORY_LOT_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion', p_accion, 'payload', p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':inventario-lotes:' || v_key, 574));
  SELECT * INTO v_op FROM public.inventario_lote_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'INVENTORY_LOT_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;

  v_producto_id := app.to_uuid_or_null(p_payload->>'producto_id');
  SELECT * INTO v_producto FROM public.productos
  WHERE tenant_id = p_tenant_id AND id = v_producto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_LOT_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(v_producto.es_servicio, false) OR NOT coalesce(v_producto.controla_stock, true) THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_DOES_NOT_CONTROL_STOCK' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_pol FROM public.inventario_lote_politicas
  WHERE tenant_id = p_tenant_id AND producto_id = v_producto_id FOR UPDATE;

  INSERT INTO public.inventario_lote_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, accion,
    producto_id, motivo, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, p_accion, v_producto_id, v_motivo, '{}'::jsonb)
  RETURNING * INTO v_op;

  IF p_accion = 'CONFIGURAR_POLITICA' THEN
    IF jsonb_typeof(p_payload->'controla_lote') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_payload->'requiere_vencimiento') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_payload->'dias_minimos_vida_util') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'version') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'INVENTORY_LOT_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;
    v_controla := (p_payload->>'controla_lote')::boolean;
    v_dias := (p_payload->>'dias_minimos_vida_util')::numeric::integer;
    IF (p_payload->>'dias_minimos_vida_util')::numeric <> v_dias OR v_dias NOT BETWEEN 0 AND 3650 THEN
      RAISE EXCEPTION 'INVENTORY_LOT_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_pol.version, 0) IS DISTINCT FROM (p_payload->>'version')::integer THEN
      RAISE EXCEPTION 'INVENTORY_LOT_VERSION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_controla AND NOT coalesce(v_pol.controla_lote, false) AND EXISTS (
      SELECT 1 FROM public.producto_existencias pe
      WHERE pe.tenant_id = p_tenant_id AND pe.producto_id = v_producto_id AND coalesce(pe.stock_reservado, 0) > 0
    ) THEN
      -- Una reserva sin lote no podría liberarse ni despacharse por lote.
      RAISE EXCEPTION 'INVENTORY_LOT_CONTROL_REQUIRES_NO_RESERVATIONS' USING ERRCODE = '23514';
    END IF;
    IF NOT v_controla AND coalesce(v_pol.controla_lote, false) AND EXISTS (
      SELECT 1 FROM public.inventario_lote_saldos s
      WHERE s.tenant_id = p_tenant_id AND s.producto_id = v_producto_id AND (s.stock_actual > 0 OR s.stock_reservado > 0)
    ) THEN
      RAISE EXCEPTION 'INVENTORY_LOT_CONTROL_HAS_LOT_STOCK' USING ERRCODE = '23514';
    END IF;
    v_old := CASE WHEN v_pol.producto_id IS NULL THEN NULL ELSE to_jsonb(v_pol) END;
    INSERT INTO public.inventario_lote_politicas (tenant_id, producto_id, controla_lote, requiere_vencimiento,
      dias_minimos_vida_util, updated_by)
    VALUES (p_tenant_id, v_producto_id, v_controla, (p_payload->>'requiere_vencimiento')::boolean, v_dias, p_actor_id)
    ON CONFLICT (tenant_id, producto_id) DO UPDATE
      SET controla_lote = EXCLUDED.controla_lote, requiere_vencimiento = EXCLUDED.requiere_vencimiento,
          dias_minimos_vida_util = EXCLUDED.dias_minimos_vida_util, updated_by = EXCLUDED.updated_by,
          version = public.inventario_lote_politicas.version + 1, updated_at = now()
    RETURNING * INTO v_pol;
    v_new := to_jsonb(v_pol);
  ELSE
    v_almacen_id := app.to_uuid_or_null(p_payload->>'almacen_id');
    IF NOT coalesce(v_pol.controla_lote, false) THEN
      RAISE EXCEPTION 'INVENTORY_LOT_CONTROL_DISABLED' USING ERRCODE = '23514';
    END IF;
    IF coalesce(length(v_motivo), 0) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'INVENTORY_LOT_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'INVENTORY_LOT_LINES_REQUIRED' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.almacenes a WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_LOT_WAREHOUSE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    SELECT coalesce(pe.stock_actual, 0) INTO v_actual FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.producto_id = v_producto_id AND pe.almacen_id = v_almacen_id FOR UPDATE;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
      v_cantidad := nullif(v_item->>'cantidad', '')::numeric;
      IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad <> round(v_cantidad, 4) THEN
        RAISE EXCEPTION 'INVENTORY_LOT_QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
      v_total := v_total + v_cantidad;
    END LOOP;
    v_old := jsonb_build_object('almacen_id', v_almacen_id, 'saldos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('lote_id', s.lote_id, 'ubicacion_id', s.ubicacion_id,
        'stock_actual', s.stock_actual, 'stock_reservado', s.stock_reservado) ORDER BY s.lote_id, s.ubicacion_id)
      FROM public.inventario_lote_saldos s
      WHERE s.tenant_id = p_tenant_id AND s.producto_id = v_producto_id AND s.almacen_id = v_almacen_id), '[]'::jsonb));

    IF p_accion = 'REGULARIZAR' THEN
      SELECT greatest(coalesce(v_actual, 0) - coalesce(sum(s.stock_actual), 0), 0) INTO v_sin_lote
      FROM public.inventario_lote_saldos s
      WHERE s.tenant_id = p_tenant_id AND s.producto_id = v_producto_id AND s.almacen_id = v_almacen_id;
      IF v_total > v_sin_lote THEN
        RAISE EXCEPTION 'INVENTORY_LOT_REGULARIZATION_EXCEEDS_UNASSIGNED: sin_lote=% solicitado=%', v_sin_lote, v_total
          USING ERRCODE = '23514';
      END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
        v_lote_id := app.lote_resolver_574(p_tenant_id, v_producto_id, v_item->>'lote',
          nullif(v_item->>'fecha_vencimiento', '')::date, true, v_pol.requiere_vencimiento,
          'REGULARIZACION', p_actor_id::text);
        PERFORM app.lote_sumar_574(p_tenant_id, v_producto_id, v_almacen_id, v_lote_id,
          app.to_uuid_or_null(v_item->>'ubicacion_id'), (v_item->>'cantidad')::numeric,
          'REGULARIZACION', NULL, NULL, v_op.id);
      END LOOP;
    ELSE
      v_referencia_id := app.to_uuid_or_null(p_payload->>'referencia_id');
      IF v_referencia_id IS NULL THEN
        RAISE EXCEPTION 'INVENTORY_LOT_RESERVATION_REFERENCE_REQUIRED' USING ERRCODE = '22023';
      END IF;
      SELECT coalesce(sum(CASE WHEN m.tipo = 'RESERVA' THEN m.cantidad
                               WHEN m.tipo = 'LIBERACION' OR m.consume_reserva THEN -m.cantidad ELSE 0 END), 0)
        INTO v_actual
      FROM public.movimientos_inventario_lotes m
      WHERE m.tenant_id = p_tenant_id AND m.referencia_id = v_referencia_id
        AND m.producto_id = v_producto_id AND m.almacen_id = v_almacen_id;
      IF v_actual <= 0 OR v_total <> v_actual THEN
        RAISE EXCEPTION 'INVENTORY_LOT_REASSIGNMENT_MUST_KEEP_QUANTITY: reservado=% solicitado=%', v_actual, v_total
          USING ERRCODE = '23514';
      END IF;
      v_falta := app.lote_tomar_574(p_tenant_id, v_producto_id, v_almacen_id, 'REFERENCIA', 'LIBERACION',
        v_actual, NULL, NULL, false, v_referencia_id, NULL, v_op.id, NULL, true);
      IF v_falta <> 0 THEN
        RAISE EXCEPTION 'INVENTORY_LOT_LEDGER_INCOHERENT' USING ERRCODE = '23514';
      END IF;
      v_vence_desde := app.lote_vence_desde_574(p_tenant_id, v_producto_id, v_referencia_id, '{}'::jsonb,
        v_pol.dias_minimos_vida_util);
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
        SELECT * INTO v_lote FROM public.inventario_lotes
        WHERE tenant_id = p_tenant_id AND producto_id = v_producto_id AND id = app.to_uuid_or_null(v_item->>'lote_id');
        IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_LOT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
        IF v_lote.fecha_vencimiento IS NOT NULL AND v_lote.fecha_vencimiento < v_vence_desde THEN
          RAISE EXCEPTION 'INVENTORY_LOT_EXPIRED_OR_SHORT_DATED: lote=% vence=% minimo=%',
            v_lote.codigo, v_lote.fecha_vencimiento, v_vence_desde USING ERRCODE = '23514';
        END IF;
        v_ubicacion := app.to_uuid_or_null(v_item->>'ubicacion_id');
        v_falta := app.lote_tomar_574(p_tenant_id, v_producto_id, v_almacen_id, 'DISPONIBLE', 'RESERVA',
          (v_item->>'cantidad')::numeric, v_lote.id, v_ubicacion, v_item ? 'ubicacion_id', v_referencia_id,
          NULL, v_op.id, NULL, false);
        IF v_falta > 0 THEN
          RAISE EXCEPTION 'INVENTORY_LOT_AVAILABLE_INSUFFICIENT_FOR_RESERVATION: lote=% faltante=%', v_lote.codigo, v_falta
            USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;
    PERFORM app.lote_assert_coherencia_574(p_tenant_id, v_producto_id, v_almacen_id);
    v_new := jsonb_build_object('almacen_id', v_almacen_id, 'referencia_id', v_referencia_id,
      'lineas', p_payload->'lineas', 'cantidad', v_total);
  END IF;

  v_result := jsonb_build_object('id', v_op.id, 'accion', p_accion, 'producto_id', v_producto_id,
    'almacen_id', v_almacen_id, 'referencia_id', v_referencia_id, 'idempotent', false);
  UPDATE public.inventario_lote_operaciones
  SET almacen_id = v_almacen_id, referencia_id = v_referencia_id, anterior = v_old,
      resultado = v_result || jsonb_build_object('actual', v_new)
  WHERE id = v_op.id;
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, old_values, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'inventario_lote_operaciones', 'INSERT', v_op.id::text, v_old, v_new,
    jsonb_build_object('source', 'operar_lotes_inventario_574', 'accion', p_accion,
      'producto_id', v_producto_id, 'idempotency_key', v_key));
  RETURN v_result || jsonb_build_object('actual', v_new);
END $fn$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.seed_inventario_lotes_permissions_574(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, 'inventario', 'lotes', s.accion, 'inventario.lotes.' || s.accion, s.descripcion, true
  FROM (VALUES ('read', 'Consultar lotes, vencimientos y reservas por lote'),
    ('manage', 'Configurar control de lote, regularizar stock sin lote y reasignar reservas')) s(accion, descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = 'inventario.lotes.' || s.accion);
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.activo AND p.activo
    AND p.codigo IN ('inventario.lotes.read', 'inventario.lotes.manage')
    AND (upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO', 'ALMACEN')
      OR (upper(r.nombre) IN ('GERENCIA', 'COMPRAS', 'VENDEDOR', 'AUDITOR', 'CONTADOR')
        AND p.codigo = 'inventario.lotes.read'))
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_inventario_lotes_role_574() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_inventario_lotes_permissions_574(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_inventario_lotes_role_574 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_inventario_lotes_role_574();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_inventario_lotes_permissions_574(t); END LOOP;
END $seed$;

DO $acl$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'app.lote_vence_desde_574(uuid,uuid,uuid,jsonb,integer)',
    'app.lote_resolver_574(uuid,uuid,text,date,boolean,boolean,text,text)',
    'app.lote_ubicacion_valida_574(uuid,uuid,uuid)',
    'app.lote_sumar_574(uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid)',
    'app.lote_tomar_574(uuid,uuid,uuid,text,text,numeric,uuid,uuid,boolean,uuid,uuid,uuid,date,boolean)',
    'app.lote_reserva_referencia_574(uuid,uuid,uuid,uuid,text,numeric)',
    'app.lote_origen_574(uuid,uuid,uuid,text,jsonb)',
    'app.lote_origen_sin_lote_574(uuid,uuid,jsonb)',
    'app.lote_assert_coherencia_574(uuid,uuid,uuid)',
    'app.lote_aplicar_movimiento_574(uuid,uuid,uuid,text,numeric,uuid,text,uuid,uuid,text,date,jsonb,boolean,text)',
    'app.guard_lote_ubicacion_574()',
    'app.seed_inventario_lotes_permissions_574(uuid)',
    'app.seed_inventario_lotes_role_574()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $acl$;
REVOKE ALL ON FUNCTION app.lote_estado_574(date,date,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_movimiento_inventario_tx(
  uuid, uuid, uuid, text, numeric, text, uuid, text, uuid, text, date, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_movimiento_inventario_tx(
  uuid, uuid, uuid, text, numeric, text, uuid, text, uuid, text, date, text, jsonb, boolean
) TO service_role;
REVOKE ALL ON FUNCTION public.despachar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.despachar_stock_en_almacen_tx(
  uuid, uuid, uuid, numeric, numeric, text, uuid, text, uuid, text, jsonb
) TO service_role;
REVOKE ALL ON FUNCTION public.consultar_lotes_inventario_574(uuid,uuid,text,uuid,uuid,uuid,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operar_lotes_inventario_574(uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_lotes_inventario_574(uuid,uuid,text,uuid,uuid,uuid,text,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.operar_lotes_inventario_574(uuid,uuid,text,jsonb,text) TO service_role;

COMMENT ON FUNCTION public.aplicar_movimiento_inventario_tx(
  uuid, uuid, uuid, text, numeric, text, uuid, text, uuid, text, date, text, jsonb, boolean
) IS 'Writer único de inventario por almacén; con control de lote reparte el movimiento por lote/ubicación (574).';

NOTIFY pgrst, 'reload schema';
COMMIT;
