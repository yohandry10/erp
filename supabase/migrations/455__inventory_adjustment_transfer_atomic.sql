-- Ajustes manuales y transferencias entre almacenes con una sola autoridad.
--
-- Cierra tres brechas del endpoint legado: cantidades redondeadas a enteros,
-- actor suministrado por el cliente e inventario confirmado sin outbox contable.

BEGIN;

SET LOCAL search_path = public, app, extensions, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.operaciones_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  almacen_origen_id uuid REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  almacen_destino_id uuid REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  ubicacion_origen_id uuid REFERENCES public.almacen_ubicaciones(id) ON DELETE RESTRICT,
  ubicacion_destino_id uuid REFERENCES public.almacen_ubicaciones(id) ON DELETE RESTRICT,
  cantidad numeric(18,6) NOT NULL,
  delta numeric(18,6),
  costo_unitario numeric(18,6),
  motivo text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  movimiento_salida_id uuid REFERENCES public.movimientos_inventario(id) ON DELETE RESTRICT,
  movimiento_entrada_id uuid REFERENCES public.movimientos_inventario(id) ON DELETE RESTRICT,
  event_id uuid,
  resultado jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_operaciones_inventario_tipo_455
    CHECK (tipo IN ('AJUSTE', 'TRANSFERENCIA')),
  CONSTRAINT ck_operaciones_inventario_cantidad_455
    CHECK (cantidad > 0),
  CONSTRAINT ck_operaciones_inventario_key_455
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  CONSTRAINT ck_operaciones_inventario_forma_455 CHECK (
    (
      tipo = 'AJUSTE'
      AND delta IS NOT NULL AND delta <> 0
      AND almacen_origen_id IS NOT NULL
      AND almacen_destino_id IS NULL
      AND (
        (delta > 0 AND movimiento_entrada_id IS NOT NULL AND movimiento_salida_id IS NULL)
        OR
        (delta < 0 AND movimiento_salida_id IS NOT NULL AND movimiento_entrada_id IS NULL)
      )
      AND event_id IS NOT NULL
    )
    OR
    (
      tipo = 'TRANSFERENCIA'
      AND delta IS NULL
      AND almacen_origen_id IS NOT NULL
      AND almacen_destino_id IS NOT NULL
      AND almacen_origen_id <> almacen_destino_id
      AND movimiento_salida_id IS NOT NULL
      AND movimiento_entrada_id IS NOT NULL
      AND event_id IS NULL
    )
  )
);

ALTER TABLE public.operaciones_inventario
  DROP CONSTRAINT IF EXISTS ck_operaciones_inventario_forma_455;
ALTER TABLE public.operaciones_inventario
  ADD CONSTRAINT ck_operaciones_inventario_forma_455 CHECK (
    (
      tipo = 'AJUSTE'
      AND delta IS NOT NULL AND delta <> 0
      AND almacen_origen_id IS NOT NULL
      AND almacen_destino_id IS NULL
      AND (
        (delta > 0 AND movimiento_entrada_id IS NOT NULL AND movimiento_salida_id IS NULL)
        OR
        (delta < 0 AND movimiento_salida_id IS NOT NULL AND movimiento_entrada_id IS NULL)
      )
      AND event_id IS NOT NULL
    )
    OR
    (
      tipo = 'TRANSFERENCIA'
      AND delta IS NULL
      AND almacen_origen_id IS NOT NULL
      AND almacen_destino_id IS NOT NULL
      AND almacen_origen_id <> almacen_destino_id
      AND movimiento_salida_id IS NOT NULL
      AND movimiento_entrada_id IS NOT NULL
      AND event_id IS NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_inventario_key_455
  ON public.operaciones_inventario (tenant_id, tipo, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_inventario_event_455
  ON public.operaciones_inventario (tenant_id, event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_inventario_salida_455
  ON public.operaciones_inventario (tenant_id, movimiento_salida_id)
  WHERE movimiento_salida_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_operaciones_inventario_entrada_455
  ON public.operaciones_inventario (tenant_id, movimiento_entrada_id)
  WHERE movimiento_entrada_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operaciones_inventario_producto_fecha_455
  ON public.operaciones_inventario (tenant_id, producto_id, created_at DESC);

SELECT app.apply_tenant_policy('public', 'operaciones_inventario');
ALTER TABLE public.operaciones_inventario FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.assert_inventory_actor_455(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND upper(COALESCE(u.estado::text, 'ACTIVO')) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ACTOR_INVALID_OR_CROSS_TENANT'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.inventory_operation_fingerprint_455(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex');
$function$;

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
     OR v_motivo IS NULL OR length(v_motivo) > 500 THEN
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
  );
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
  );

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

CREATE OR REPLACE FUNCTION app.transferir_inventario_tx_455(
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
  v_origen_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'almacen_origen_id', ''));
  v_destino_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'almacen_destino_id', ''));
  v_ubicacion_origen_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'ubicacion_origen_id', ''));
  v_ubicacion_destino_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'ubicacion_destino_id', ''));
  v_cantidad numeric := NULLIF(p_payload->>'cantidad', '')::numeric;
  v_motivo text := NULLIF(btrim(COALESCE(p_payload->>'motivo', '')), '');
  v_lote text := NULLIF(btrim(COALESCE(p_payload->>'lote', '')), '');
  v_fecha_expiracion date := NULLIF(p_payload->>'fecha_expiracion', '')::date;
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.operaciones_inventario%ROWTYPE;
  v_salida_id uuid;
  v_entrada_id uuid;
  v_resultado jsonb;
BEGIN
  PERFORM app.assert_inventory_actor_455(p_tenant_id, p_actor_id);
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_producto_id IS NULL OR v_origen_id IS NULL OR v_destino_id IS NULL
     OR v_origen_id = v_destino_id
     OR v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > 999999999999::numeric
     OR v_motivo IS NULL OR length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_cantidad := round(v_cantidad, 6);
  IF v_cantidad <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_QUANTITY_TOO_SMALL' USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_build_object(
    'producto_id', v_producto_id,
    'almacen_origen_id', v_origen_id,
    'almacen_destino_id', v_destino_id,
    'ubicacion_origen_id', v_ubicacion_origen_id,
    'ubicacion_destino_id', v_ubicacion_destino_id,
    'cantidad', v_cantidad,
    'motivo', v_motivo,
    'lote', v_lote,
    'fecha_expiracion', v_fecha_expiracion
  );
  v_fingerprint := app.inventory_operation_fingerprint_455(v_canonical);

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:TRANSFERENCIA:%s', p_tenant_id, v_key), 0)
  );

  SELECT * INTO v_operacion
  FROM public.operaciones_inventario o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo = 'TRANSFERENCIA'
    AND o.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'INVENTORY_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    IF v_operacion.resultado IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_INCOMPLETE_RETRY' USING ERRCODE = '40001';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM 1 FROM public.productos p
  WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
    AND NOT COALESCE(p.es_servicio, false)
    AND COALESCE(p.controla_stock, true)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_STOCK_CONTROLLED' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.almacenes a
  WHERE a.id IN (v_origen_id, v_destino_id)
    AND a.tenant_id = p_tenant_id
    AND COALESCE(a.activo, true)
  ORDER BY a.id
  FOR SHARE;
  IF (SELECT count(*) FROM public.almacenes a
      WHERE a.id IN (v_origen_id, v_destino_id)
        AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, true)) <> 2 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_WAREHOUSE_INVALID' USING ERRCODE = '23503';
  END IF;

  IF v_ubicacion_origen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = v_ubicacion_origen_id AND u.tenant_id = p_tenant_id
      AND u.almacen_id = v_origen_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ORIGIN_LOCATION_INVALID' USING ERRCODE = '23503';
  END IF;
  IF v_ubicacion_destino_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = v_ubicacion_destino_id AND u.tenant_id = p_tenant_id
      AND u.almacen_id = v_destino_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DESTINATION_LOCATION_INVALID' USING ERRCODE = '23503';
  END IF;

  v_operacion.id := gen_random_uuid();
  v_salida_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_origen_id,
    p_tipo := 'SALIDA',
    p_cantidad := v_cantidad,
    p_referencia_tipo := 'TRANSFERENCIA_SALIDA',
    p_referencia_id := v_operacion.id,
    p_notas := v_motivo,
    p_ubicacion_id := v_ubicacion_origen_id,
    p_lote := v_lote,
    p_fecha_expiracion := v_fecha_expiracion,
    p_created_by := p_actor_id::text,
    p_metadata := jsonb_build_object(
      'business_movement_type', 'TRANSFERENCIA',
      'transferencia_id', v_operacion.id,
      'almacen_destino_id', v_destino_id,
      'idempotency_key', v_key,
      'actor_id', p_actor_id
    )
  );

  v_entrada_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_destino_id,
    p_tipo := 'ENTRADA',
    p_cantidad := v_cantidad,
    p_referencia_tipo := 'TRANSFERENCIA_ENTRADA',
    p_referencia_id := v_operacion.id,
    p_notas := v_motivo,
    p_ubicacion_id := v_ubicacion_destino_id,
    p_lote := v_lote,
    p_fecha_expiracion := v_fecha_expiracion,
    p_created_by := p_actor_id::text,
    p_metadata := jsonb_build_object(
      'business_movement_type', 'TRANSFERENCIA',
      'transferencia_id', v_operacion.id,
      'almacen_origen_id', v_origen_id,
      'idempotency_key', v_key,
      'actor_id', p_actor_id
    )
  );

  v_resultado := jsonb_build_object(
    'success', true,
    'operacion_id', v_operacion.id,
    'producto_id', v_producto_id,
    'almacen_origen_id', v_origen_id,
    'almacen_destino_id', v_destino_id,
    'cantidad', v_cantidad,
    'movimiento_salida_id', v_salida_id,
    'movimiento_entrada_id', v_entrada_id,
    'idempotent', false
  );

  INSERT INTO public.operaciones_inventario (
    id, tenant_id, tipo, idempotency_key, fingerprint, producto_id,
    almacen_origen_id, almacen_destino_id,
    ubicacion_origen_id, ubicacion_destino_id,
    cantidad, delta, costo_unitario, motivo, actor_id,
    movimiento_salida_id, movimiento_entrada_id, resultado, metadata
  ) VALUES (
    v_operacion.id, p_tenant_id, 'TRANSFERENCIA', v_key, v_fingerprint,
    v_producto_id, v_origen_id, v_destino_id,
    v_ubicacion_origen_id, v_ubicacion_destino_id,
    v_cantidad, NULL, NULL, v_motivo, p_actor_id,
    v_salida_id, v_entrada_id, v_resultado,
    jsonb_build_object('payload', v_canonical)
  );

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_ajuste_inventario_tx(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.registrar_ajuste_inventario_tx_455(
    p_tenant_id, p_payload, p_actor_id, p_idempotency_key
  );
$function$;

CREATE OR REPLACE FUNCTION public.transferir_inventario_tx(
  p_tenant_id uuid,
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.transferir_inventario_tx_455(
    p_tenant_id, p_payload, p_actor_id, p_idempotency_key
  );
$function$;

REVOKE ALL ON TABLE public.operaciones_inventario
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.operaciones_inventario TO service_role;

REVOKE ALL ON FUNCTION app.assert_inventory_actor_455(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.inventory_operation_fingerprint_455(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.registrar_ajuste_inventario_tx_455(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.transferir_inventario_tx_455(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_ajuste_inventario_tx(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transferir_inventario_tx(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_ajuste_inventario_tx(uuid, jsonb, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.transferir_inventario_tx(uuid, jsonb, uuid, text)
  TO service_role;

COMMENT ON TABLE public.operaciones_inventario
IS 'Anchor inmutable e idempotente para ajustes contables y transferencias fisicas entre almacenes.';
COMMENT ON FUNCTION public.registrar_ajuste_inventario_tx(uuid, jsonb, uuid, text)
IS 'Aplica ajuste decimal y publica ajuste.inventario.aplicado dentro del mismo commit.';
COMMENT ON FUNCTION public.transferir_inventario_tx(uuid, jsonb, uuid, text)
IS 'Mueve stock entre almacenes mediante SALIDA+ENTRADA atomicas, sin impacto contable neto.';

COMMIT;
