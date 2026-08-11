-- Cancelación de pedidos: estado, reservas, backorders, auditoría durable y
-- outbox forman una sola transacción. Un pedido ya despachado exige una
-- devolución física explícita; nunca se "rebobina" el stock por UPDATE.
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF to_regclass('public.pedidos_venta') IS NULL
     OR to_regclass('public.pedidos_venta_detalle') IS NULL
     OR to_regclass('public.pedido_backorders') IS NULL
     OR to_regclass('public.pedido_despachos') IS NULL
     OR to_regclass('public.pedido_gres') IS NULL
     OR to_regclass('public.documentos') IS NULL
     OR to_regclass('public.movimientos_inventario') IS NULL
     OR to_regclass('public.outbox_events') IS NULL
     OR to_regprocedure('public.liberar_reservas_pedido_tx(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('app.pedido_venta_fingerprint_441(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '467 requiere pedidos 441/442/446, inventario y outbox';
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.pedido_cancelaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  pedido_id uuid NOT NULL REFERENCES public.pedidos_venta(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  motivo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  pedido_fingerprint text NOT NULL,
  event_id uuid NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pedido_cancelaciones_motivo_467 CHECK (length(btrim(motivo)) BETWEEN 3 AND 1000),
  CONSTRAINT ck_pedido_cancelaciones_key_467 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  CONSTRAINT ck_pedido_cancelaciones_fingerprint_467 CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_pedido_cancelaciones_pedido_fingerprint_467 CHECK (pedido_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_cancelaciones_tenant_key_467
  ON public.pedido_cancelaciones (tenant_id, lower(idempotency_key));
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_cancelaciones_tenant_pedido_467
  ON public.pedido_cancelaciones (tenant_id, pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_cancelaciones_event_467
  ON public.pedido_cancelaciones (tenant_id, event_id);

ALTER TABLE public.pedido_cancelaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_cancelaciones FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pedido_cancelaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pedido_cancelaciones TO service_role;

CREATE OR REPLACE FUNCTION app.cancelar_pedido_fingerprint_467(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$function$;

REVOKE ALL ON FUNCTION app.cancelar_pedido_fingerprint_467(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_pedido_venta_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_motivo text,
  p_idempotency_key text,
  p_confirmar_retorno_fisico boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_request jsonb;
  v_fingerprint text;
  v_pedido_fingerprint text;
  v_existing public.pedido_cancelaciones%ROWTYPE;
  v_pedido public.pedidos_venta%ROWTYPE;
  v_release jsonb;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_outbox public.outbox_events%ROWTYPE;
  v_result jsonb;
  v_has_dispatch boolean := false;
  v_source record;
  v_source_count integer := 0;
  v_reverse_id uuid;
  v_reversals jsonb := '[]'::jsonb;
BEGIN
  IF p_pedido_id IS NULL OR p_tenant_id IS NULL OR p_actor_id IS NULL
     OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 3 AND 1000
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;

  v_request := jsonb_build_object(
    'version', 1,
    'pedido_id', p_pedido_id,
    'motivo', v_motivo,
    'confirmar_retorno_fisico', coalesce(p_confirmar_retorno_fisico, false)
  );
  v_fingerprint := app.cancelar_pedido_fingerprint_467(v_request);

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:PEDIDO_CANCEL:%s', p_tenant_id, p_pedido_id), 467));

  SELECT * INTO v_existing
  FROM public.pedido_cancelaciones c
  WHERE c.tenant_id = p_tenant_id AND lower(c.idempotency_key) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.pedido_id IS DISTINCT FROM p_pedido_id
       OR v_existing.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'ORDER_CANCELLATION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_existing
  FROM public.pedido_cancelaciones c
  WHERE c.tenant_id = p_tenant_id AND c.pedido_id = p_pedido_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'ORDER_ALREADY_CANCELLED_WITH_DIFFERENT_REASON' USING ERRCODE = '23514';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM d.id
  FROM public.pedidos_venta_detalle d
  WHERE d.tenant_id = p_tenant_id AND d.pedido_id = p_pedido_id
  ORDER BY d.producto_id, d.id
  FOR UPDATE;

  PERFORM b.id
  FROM public.pedido_backorders b
  WHERE b.tenant_id = p_tenant_id AND b.pedido_id = p_pedido_id
  ORDER BY b.detalle_id, b.id
  FOR UPDATE;

  IF upper(coalesce(v_pedido.estado, '')) NOT IN (
       'PENDIENTE', 'PENDIENTE_APROBACION', 'CONFIRMADO',
       'EN_PREPARACION', 'LISTO_DESPACHO', 'DESPACHO_PARCIAL',
       'LISTO_FACTURAR', 'CANCELADO'
     )
     OR v_pedido.factura_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.documentos d
       WHERE d.tenant_id = p_tenant_id AND d.pedido_id = p_pedido_id
         AND upper(coalesce(d.estado, '')) NOT IN ('ANULADO', 'CANCELADO')
     ) THEN
    RAISE EXCEPTION 'ORDER_ALREADY_DOCUMENTED_USE_CPE_CANCELLATION' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.pedido_gres pg
       WHERE pg.tenant_id = p_tenant_id AND pg.pedido_id = p_pedido_id
         AND upper(coalesce(pg.estado, 'BORRADOR')) NOT IN ('ANULADO', 'CANCELADO', 'RECHAZADO')
     ) THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_REQUIRES_GRE_CANCELLATION' USING ERRCODE = '23514';
  END IF;

  v_has_dispatch := EXISTS (
       SELECT 1 FROM public.pedidos_venta_detalle d
       WHERE d.tenant_id = p_tenant_id AND d.pedido_id = p_pedido_id
         AND coalesce(d.cantidad_despachada, 0) > 0
     )
     OR EXISTS (
       SELECT 1 FROM public.pedido_despachos pd
       WHERE pd.tenant_id = p_tenant_id AND pd.pedido_id = p_pedido_id
         AND coalesce(pd.cantidad, 0) > 0
     )
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario mi
       WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
         AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'SALIDA'
         AND (
           upper(coalesce(mi.referencia_tipo, '')) IN ('PEDIDO', 'PEDIDO_VENTA', 'DESPACHO', 'PEDIDO_FACTURA_446')
           OR upper(coalesce(mi.referencia_tipo, '')) LIKE 'PEDIDO_DESP_%'
         )
     );

  IF v_has_dispatch AND NOT coalesce(p_confirmar_retorno_fisico, false) THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_REQUIRES_PHYSICAL_RETURN' USING ERRCODE = '23514';
  END IF;

  IF v_has_dispatch THEN
    FOR v_source IN
      SELECT mi.*
      FROM public.movimientos_inventario mi
      JOIN public.productos p
        ON p.id = mi.producto_id AND p.tenant_id = mi.tenant_id
      WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
        AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'SALIDA'
        AND NOT coalesce(p.es_servicio, false) AND coalesce(p.controla_stock, true)
        AND (
          upper(coalesce(mi.referencia_tipo, '')) IN ('PEDIDO', 'PEDIDO_VENTA', 'DESPACHO')
          OR upper(coalesce(mi.referencia_tipo, '')) LIKE 'PEDIDO_DESP_%'
        )
      ORDER BY mi.producto_id, mi.almacen_id, mi.id
      FOR UPDATE OF mi
    LOOP
      v_source_count := v_source_count + 1;
      SELECT mi.id INTO v_reverse_id
      FROM public.movimientos_inventario mi
      WHERE mi.tenant_id = p_tenant_id
        AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'ENTRADA'
        AND upper(coalesce(mi.referencia_tipo, '')) = 'REVERSO_DESPACHO_PEDIDO_467'
        AND mi.referencia_id = v_source.id
        AND mi.producto_id = v_source.producto_id
        AND mi.almacen_id = v_source.almacen_id
      FOR UPDATE;

      IF v_reverse_id IS NULL THEN
        v_reverse_id := public.aplicar_movimiento_inventario_tx(
          p_tenant_id := p_tenant_id,
          p_producto_id := v_source.producto_id,
          p_almacen_id := v_source.almacen_id,
          p_tipo := 'ENTRADA',
          p_cantidad := v_source.cantidad,
          p_referencia_tipo := 'REVERSO_DESPACHO_PEDIDO_467',
          p_referencia_id := v_source.id,
          p_notas := format('Retorno físico por cancelación del pedido %s: %s',
            coalesce(v_pedido.numero, p_pedido_id::text), v_motivo),
          p_ubicacion_id := v_source.ubicacion_id,
          p_lote := v_source.lote,
          p_fecha_expiracion := v_source.fecha_expiracion::date,
          p_created_by := p_actor_id::text,
          p_metadata := jsonb_build_object(
            'pedido_id', p_pedido_id,
            'source_movement_id', v_source.id,
            'cancellation_key', v_key,
            'physical_return_confirmed_by', p_actor_id,
            'costo_unitario', coalesce(
              nullif(app.to_numeric_or_zero(v_source.metadata->>'costo_unitario'), 0),
              CASE WHEN coalesce(v_source.cantidad, 0) <> 0
                THEN app.to_numeric_or_zero(v_source.metadata->>'valor_total') / v_source.cantidad
                ELSE 0 END,
              0
            ),
            'atomic_rpc', 'cancelar_pedido_venta_tx'
          )
        );

        INSERT INTO public.outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload,
          status, retry_count, idempotency_key, event_id, created_at, updated_at
        ) VALUES (
          p_tenant_id, 'inventory_movement', v_reverse_id::text, 'stock.movimiento',
          jsonb_build_object(
            'eventId', v_reverse_id,
            'tenantId', p_tenant_id,
            'movimientoId', v_reverse_id,
            'productoId', v_source.producto_id,
            'almacenId', v_source.almacen_id,
            'tipoMovimiento', 'ENTRADA',
            'cantidad', v_source.cantidad,
            'referenciaTipo', 'REVERSO_DESPACHO_PEDIDO_467',
            'referenciaId', v_source.id,
            'pedidoId', p_pedido_id,
            'actorId', p_actor_id,
            'fecha', now()
          ),
          'pending', 0,
          format('stock.movimiento:%s:%s', p_tenant_id, v_reverse_id),
          v_reverse_id, now(), now()
        ) ON CONFLICT DO NOTHING;
      END IF;

      v_reversals := v_reversals || jsonb_build_array(jsonb_build_object(
        'source_movement_id', v_source.id,
        'reverse_movement_id', v_reverse_id,
        'producto_id', v_source.producto_id,
        'almacen_id', v_source.almacen_id,
        'cantidad', v_source.cantidad
      ));
      v_reverse_id := NULL;
    END LOOP;

    IF v_source_count = 0 THEN
      RAISE EXCEPTION 'ORDER_DISPATCH_LEDGER_INCONSISTENT' USING ERRCODE = '23514';
    END IF;

    UPDATE public.pedido_despachos pd
    SET estado = 'ANULADO',
        notas = concat_ws(E'\n', nullif(btrim(pd.notas), ''),
          'Retorno físico confirmado al cancelar: ' || v_motivo),
        updated_at = now()
    WHERE pd.tenant_id = p_tenant_id AND pd.pedido_id = p_pedido_id
      AND upper(coalesce(pd.estado, 'REGISTRADO')) <> 'ANULADO';
  END IF;

  v_pedido_fingerprint := app.pedido_venta_fingerprint_441(p_pedido_id, p_tenant_id);
  IF v_pedido_fingerprint IS NULL OR length(v_pedido_fingerprint) <> 64 THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_FINGERPRINT_INVALID' USING ERRCODE = '23514';
  END IF;

  v_release := public.liberar_reservas_pedido_tx(
    p_pedido_id,
    p_tenant_id,
    'PEDIDO_CANCELACION_467',
    format('Cancelación atómica. Motivo: %s', v_motivo)
  );

  IF EXISTS (
    SELECT 1
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
    GROUP BY mi.producto_id, mi.almacen_id
    HAVING round(sum(CASE
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
      ELSE -mi.cantidad END), 2) <> 0
  ) THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_RESERVATION_REMAINS' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.pedido_backorders b
  WHERE b.tenant_id = p_tenant_id AND b.pedido_id = p_pedido_id;

  UPDATE public.pedidos_venta_detalle d
  SET cantidad_despachada = 0,
      cantidad_facturada = 0,
      -- El catálogo histórico de estado_item no incluye CANCELADO; la
      -- terminalidad vive en la cabecera y la línea vuelve a no atendida.
      estado_item = 'PENDIENTE',
      updated_at = now()
  WHERE d.tenant_id = p_tenant_id AND d.pedido_id = p_pedido_id;

  UPDATE public.pedidos_venta p
  SET estado = 'CANCELADO',
      requiere_aprobacion = false,
      motivo_requiere_aprobacion = NULL,
      tracking_estado = 'CANCELADO',
      tracking_actualizado_en = now(),
      tracking_notas = v_motivo,
      observaciones = CASE
        WHEN upper(coalesce(p.estado, '')) = 'CANCELADO' THEN p.observaciones
        ELSE concat_ws(E'\n\n', nullif(btrim(p.observaciones), ''), '[CANCELADO] ' || v_motivo)
      END,
      metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelled_by', p_actor_id,
        'cancelled_at', now(),
        'cancellation_reason', v_motivo,
        'cancellation_key', v_key,
        'atomic_rpc', 'cancelar_pedido_venta_tx'
      ),
      updated_at = now()
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  RETURNING * INTO v_pedido;

  v_event_key := format('pedido.cancelado:%s:%s', p_tenant_id, p_pedido_id);
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, created_at, updated_at
  ) VALUES (
    p_tenant_id, 'pedido_venta', p_pedido_id::text, 'pedido.cancelado',
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'pedidoId', p_pedido_id,
      'numero', v_pedido.numero,
      'motivo', v_motivo,
      'actorId', p_actor_id,
      'requestFingerprint', v_fingerprint,
      'pedidoFingerprint', v_pedido_fingerprint,
      'liberaciones', coalesce(v_release->'movimientos', '[]'::jsonb),
      'reversosDespacho', v_reversals,
      'fecha', now()
    ),
    'pending', 0, v_event_key, v_event_id, now(), now()
  )
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_outbox
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND o.event_type = 'pedido.cancelado'
    AND o.idempotency_key = v_event_key
  FOR UPDATE;
  IF NOT FOUND
     OR v_outbox.aggregate_id IS DISTINCT FROM p_pedido_id::text
     OR v_outbox.payload->>'requestFingerprint' IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_OUTBOX_CONFLICT' USING ERRCODE = '23505';
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'pedido_id', p_pedido_id,
    'numero', v_pedido.numero,
    'estado', v_pedido.estado,
    'movimientos_liberacion', coalesce(v_release->'movimientos', '[]'::jsonb),
    'movimientos_retorno', v_reversals,
    'event_id', v_outbox.event_id,
    'idempotent', false
  );

  INSERT INTO public.pedido_cancelaciones (
    tenant_id, pedido_id, actor_id, motivo, idempotency_key,
    fingerprint, pedido_fingerprint, event_id, resultado
  ) VALUES (
    p_tenant_id, p_pedido_id, p_actor_id, v_motivo, v_key,
    v_fingerprint, v_pedido_fingerprint, v_outbox.event_id, v_result
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_pedido_venta_tx(uuid,uuid,uuid,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_venta_tx(uuid,uuid,uuid,text,text,boolean)
  TO service_role;

COMMENT ON FUNCTION public.cancelar_pedido_venta_tx(uuid,uuid,uuid,text,text,boolean)
IS 'Cancela un pedido no despachado, libera reservas y persiste operación+outbox en un commit; si hubo salida física exige devolución explícita.';

COMMIT;
