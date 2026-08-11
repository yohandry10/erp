-- Cierra el ciclo cotizacion de compra -> orden -> decision con una sola
-- autoridad transaccional. Las lecturas siguen protegidas por RLS; las
-- escrituras operativas son exclusivamente service-role mediante RPC.
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ordenes_compra
    WHERE tenant_id IS NOT NULL AND cotizacion_id IS NOT NULL
    GROUP BY tenant_id, cotizacion_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '453: hay mas de una OC enlazada a la misma cotizacion; reconciliar antes del despliegue';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_compra_tenant_cotizacion_453
  ON public.ordenes_compra (tenant_id, cotizacion_id)
  WHERE tenant_id IS NOT NULL AND cotizacion_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizaciones_compra_idempotency_453
  ON public.cotizaciones_compra (tenant_id, (metadata->>'idempotency_key'))
  WHERE tenant_id IS NOT NULL
    AND nullif(btrim(metadata->>'idempotency_key'), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_compra_idempotency_453
  ON public.ordenes_compra (tenant_id, (metadata->>'idempotency_key'))
  WHERE tenant_id IS NOT NULL
    AND nullif(btrim(metadata->>'idempotency_key'), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_fingerprint_453
  ON public.oc_aprobaciones (tenant_id, orden_id, (metadata->>'fingerprint'))
  WHERE tenant_id IS NOT NULL AND orden_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.assert_purchase_actor_453(
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
      AND coalesce(u.activo, false)
      AND lower(u.estado::text) = 'activo'
  ) THEN
    RAISE EXCEPTION 'Actor de compras obligatorio, activo y perteneciente al tenant'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_cotizacion_compra_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_cot public.cotizaciones_compra%ROWTYPE;
  v_numero text;
  v_proveedor_id uuid;
  v_fecha date;
  v_validez integer;
  v_vencimiento date;
  v_detalles jsonb;
  v_detalle jsonb;
  v_ordinal bigint;
  v_producto_id uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric := 0;
  v_igv numeric;
  v_total numeric;
  v_tasa numeric;
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_payload = '{}'::jsonb THEN
    RAISE EXCEPTION 'Payload de actualizacion invalido';
  END IF;
  IF p_payload - ARRAY['numero','proveedor_id','fecha_cotizacion','validez_dias','observaciones','detalles'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'La edicion no admite estado ni campos de conversion';
  END IF;

  SELECT * INTO v_cot
  FROM public.cotizaciones_compra
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotizacion de compra no encontrada'; END IF;
  IF upper(v_cot.estado::text) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se edita una cotizacion en BORRADOR';
  END IF;

  v_numero := CASE WHEN p_payload ? 'numero'
    THEN nullif(btrim(p_payload->>'numero'), '') ELSE v_cot.numero END;
  IF v_numero IS NULL THEN RAISE EXCEPTION 'numero es obligatorio'; END IF;
  BEGIN
    v_proveedor_id := CASE WHEN p_payload ? 'proveedor_id'
      THEN (p_payload->>'proveedor_id')::uuid ELSE v_cot.proveedor_id END;
    v_fecha := CASE WHEN p_payload ? 'fecha_cotizacion'
      THEN (p_payload->>'fecha_cotizacion')::date ELSE v_cot.fecha_cotizacion END;
    v_validez := CASE WHEN p_payload ? 'validez_dias'
      THEN (p_payload->>'validez_dias')::integer ELSE v_cot.validez_dias END;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Proveedor, fecha o validez invalidos';
  END;
  IF v_validez < 1 OR v_validez > 3650 THEN RAISE EXCEPTION 'validez_dias fuera de rango'; END IF;
  v_vencimiento := v_fecha + v_validez;
  IF v_vencimiento < app.hoy_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'No se puede guardar una cotizacion vencida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = v_proveedor_id AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
  ) THEN
    RAISE EXCEPTION 'Proveedor inexistente, inactivo o ajeno al tenant';
  END IF;

  v_tasa := app.tasa_impuesto_tenant(p_tenant_id);
  IF p_payload ? 'detalles' THEN
    v_detalles := p_payload->'detalles';
    IF v_detalles IS NULL OR jsonb_typeof(v_detalles) <> 'array'
       OR jsonb_array_length(v_detalles) = 0 OR jsonb_array_length(v_detalles) > 999 THEN
      RAISE EXCEPTION 'La cotizacion requiere entre 1 y 999 detalles';
    END IF;
    FOR v_detalle, v_ordinal IN
      SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
    LOOP
      IF v_detalle - ARRAY['producto_id','descripcion','cantidad','precio_unitario'] <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Detalle de cotizacion contiene campos no admitidos';
      END IF;
      BEGIN
        v_producto_id := (v_detalle->>'producto_id')::uuid;
        v_cantidad := (v_detalle->>'cantidad')::numeric;
        v_precio := round((v_detalle->>'precio_unitario')::numeric, 2);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Producto, cantidad o precio invalidos en linea %', v_ordinal;
      END;
      v_descripcion := nullif(btrim(v_detalle->>'descripcion'), '');
      IF v_descripcion IS NULL OR v_cantidad <= 0 OR v_precio < 0 THEN
        RAISE EXCEPTION 'Descripcion, cantidad o precio invalidos en linea %', v_ordinal;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.productos p
        WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
      ) THEN
        RAISE EXCEPTION 'Producto inexistente, inactivo o ajeno al tenant en linea %', v_ordinal;
      END IF;
      v_subtotal := v_subtotal + round(v_cantidad * v_precio, 2);
    END LOOP;
    v_subtotal := round(v_subtotal, 2);
    SELECT round(coalesce(sum(CASE
      WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
        THEN round((x.value->>'cantidad')::numeric * round((x.value->>'precio_unitario')::numeric, 2), 2)
      ELSE 0 END), 0) * v_tasa, 2)
    INTO v_igv
    FROM jsonb_array_elements(v_detalles) x
    JOIN public.productos p
      ON p.id = (x.value->>'producto_id')::uuid AND p.tenant_id = p_tenant_id;
    v_total := round(v_subtotal + v_igv, 2);
  ELSE
    SELECT
      round(coalesce(sum(d.subtotal), 0), 2),
      round(coalesce(sum(CASE
        WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
          THEN d.subtotal ELSE 0 END), 0) * v_tasa, 2)
    INTO v_subtotal, v_igv
    FROM public.cotizacion_compra_detalles d
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    WHERE d.cotizacion_id = p_cotizacion_id AND d.tenant_id = p_tenant_id;
    v_total := round(v_subtotal + v_igv, 2);
  END IF;

  UPDATE public.cotizaciones_compra
  SET numero = v_numero,
      proveedor_id = v_proveedor_id,
      fecha_cotizacion = v_fecha,
      fecha_vencimiento = v_vencimiento,
      validez_dias = v_validez,
      observaciones = CASE WHEN p_payload ? 'observaciones'
        THEN nullif(btrim(p_payload->>'observaciones'), '') ELSE observaciones END,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
      updated_by = p_actor_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'revision', coalesce((metadata->>'revision')::integer, 1) + 1,
          'last_actor_id', p_actor_id,
          'last_content_fingerprint', app.sha256_json_453(jsonb_build_object(
            'numero', upper(v_numero), 'proveedor_id', v_proveedor_id,
            'fecha', v_fecha, 'validez', v_validez,
            'detalles', coalesce(v_detalles, '[]'::jsonb),
            'subtotal', v_subtotal, 'igv', v_igv, 'total', v_total
          ))
        )
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id;

  IF p_payload ? 'detalles' THEN
    DELETE FROM public.cotizacion_compra_detalles
    WHERE cotizacion_id = p_cotizacion_id AND tenant_id = p_tenant_id;
    FOR v_detalle, v_ordinal IN
      SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
    LOOP
      INSERT INTO public.cotizacion_compra_detalles (
        tenant_id, cotizacion_id, numero, producto_id, descripcion,
        cantidad, precio_unitario, subtotal, metadata
      ) VALUES (
        p_tenant_id, p_cotizacion_id, v_ordinal::integer,
        (v_detalle->>'producto_id')::uuid, btrim(v_detalle->>'descripcion'),
        (v_detalle->>'cantidad')::numeric,
        round((v_detalle->>'precio_unitario')::numeric, 2),
        round((v_detalle->>'cantidad')::numeric * (v_detalle->>'precio_unitario')::numeric, 2),
        jsonb_build_object(
          'tax_rate', CASE
            WHEN left(coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
              WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10'), 1) = '1'
              THEN v_tasa ELSE 0 END,
          'afectacion_igv', coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
            WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10')
        )
      );
    END LOOP;
  END IF;

  RETURN app.purchase_quote_result_453(p_cotizacion_id, p_tenant_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_cotizacion_compra_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_accion text,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cot public.cotizaciones_compra%ROWTYPE;
  v_accion text := upper(nullif(btrim(p_accion), ''));
  v_nuevo_estado text;
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  SELECT * INTO v_cot
  FROM public.cotizaciones_compra
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotizacion de compra no encontrada'; END IF;
  IF v_cot.orden_compra_id IS NOT NULL THEN
    RAISE EXCEPTION 'La cotizacion ya fue convertida y es inmutable';
  END IF;

  CASE v_accion
    WHEN 'ENVIAR' THEN
      IF upper(v_cot.estado::text) = 'ENVIADA' THEN
        RETURN app.purchase_quote_result_453(p_cotizacion_id, p_tenant_id)
          || jsonb_build_object('idempotent', true);
      END IF;
      IF upper(v_cot.estado::text) <> 'BORRADOR' THEN
        RAISE EXCEPTION 'Solo una cotizacion BORRADOR puede enviarse';
      END IF;
      v_nuevo_estado := 'ENVIADA';
    WHEN 'APROBAR' THEN
      IF upper(v_cot.estado::text) = 'APROBADA'
         AND v_cot.metadata->>'decision_actor_id' = p_actor_id::text THEN
        RETURN app.purchase_quote_result_453(p_cotizacion_id, p_tenant_id)
          || jsonb_build_object('idempotent', true);
      END IF;
      IF upper(v_cot.estado::text) <> 'ENVIADA' THEN
        RAISE EXCEPTION 'Solo una cotizacion ENVIADA puede aprobarse';
      END IF;
      IF v_cot.created_by IS NULL OR v_cot.created_by = p_actor_id THEN
        RAISE EXCEPTION 'La aprobacion exige un creador trazable y un actor distinto';
      END IF;
      v_nuevo_estado := 'APROBADA';
    WHEN 'RECHAZAR' THEN
      IF upper(v_cot.estado::text) = 'RECHAZADA'
         AND v_cot.metadata->>'decision_actor_id' = p_actor_id::text THEN
        RETURN app.purchase_quote_result_453(p_cotizacion_id, p_tenant_id)
          || jsonb_build_object('idempotent', true);
      END IF;
      IF upper(v_cot.estado::text) <> 'ENVIADA' THEN
        RAISE EXCEPTION 'Solo una cotizacion ENVIADA puede rechazarse';
      END IF;
      IF v_cot.created_by IS NULL OR v_cot.created_by = p_actor_id THEN
        RAISE EXCEPTION 'El rechazo exige un creador trazable y un actor distinto';
      END IF;
      IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Motivo de rechazo obligatorio'; END IF;
      v_nuevo_estado := 'RECHAZADA';
    ELSE
      RAISE EXCEPTION 'Accion de cotizacion no admitida';
  END CASE;

  IF v_cot.fecha_vencimiento < app.hoy_tenant(p_tenant_id) AND v_accion <> 'RECHAZAR' THEN
    RAISE EXCEPTION 'La cotizacion esta vencida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cotizacion_compra_detalles d
    WHERE d.cotizacion_id = p_cotizacion_id AND d.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'La cotizacion no tiene detalles';
  END IF;

  UPDATE public.cotizaciones_compra
  SET estado = v_nuevo_estado,
      observaciones = CASE WHEN v_accion = 'RECHAZAR'
        THEN concat_ws(E'\n\n', nullif(btrim(observaciones), ''), 'Motivo de rechazo: ' || btrim(p_motivo))
        ELSE observaciones END,
      updated_by = p_actor_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'last_action', v_accion,
        'last_action_at', now(),
        'decision_actor_id', CASE WHEN v_accion IN ('APROBAR','RECHAZAR') THEN p_actor_id END,
        'decision_fingerprint', CASE WHEN v_accion IN ('APROBAR','RECHAZAR')
          THEN app.purchase_quote_fingerprint_453(p_cotizacion_id, p_tenant_id) END,
        'motivo_rechazo', CASE WHEN v_accion = 'RECHAZAR' THEN btrim(p_motivo) END
      ))
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id;

  RETURN app.purchase_quote_result_453(p_cotizacion_id, p_tenant_id)
    || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.sha256_json_453(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(convert_to(coalesce(p_value, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
$function$;

CREATE OR REPLACE FUNCTION app.purchase_quote_result_453(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT to_jsonb(q) || jsonb_build_object(
    'detalles', coalesce((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY coalesce(d.numero, 2147483647), d.created_at, d.id)
      FROM public.cotizacion_compra_detalles d
      WHERE d.cotizacion_id = q.id AND d.tenant_id = q.tenant_id
    ), '[]'::jsonb)
  )
  FROM public.cotizaciones_compra q
  WHERE q.id = p_cotizacion_id AND q.tenant_id = p_tenant_id;
$function$;

CREATE OR REPLACE FUNCTION app.purchase_order_result_453(
  p_orden_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT to_jsonb(o) || jsonb_build_object(
    'detalles', coalesce((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY coalesce(d.numero, 2147483647), d.created_at, d.id)
      FROM public.orden_compra_detalles d
      WHERE d.orden_id = o.id AND d.tenant_id = o.tenant_id
    ), '[]'::jsonb)
  )
  FROM public.ordenes_compra o
  WHERE o.id = p_orden_id AND o.tenant_id = p_tenant_id;
$function$;

CREATE OR REPLACE FUNCTION app.purchase_quote_fingerprint_453(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.sha256_json_453(
    jsonb_build_object(
      'numero', upper(btrim(q.numero)),
      'proveedor_id', q.proveedor_id,
      'fecha_cotizacion', q.fecha_cotizacion,
      'fecha_vencimiento', q.fecha_vencimiento,
      'subtotal', round(q.subtotal, 2),
      'igv', round(q.igv, 2),
      'total', round(q.total, 2),
      'detalles', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'producto_id', d.producto_id,
          'descripcion', btrim(d.descripcion),
          'cantidad', d.cantidad,
          'precio_unitario', round(d.precio_unitario, 2),
          'subtotal', round(d.subtotal, 2)
        ) ORDER BY coalesce(d.numero, 2147483647), d.created_at, d.id)
        FROM public.cotizacion_compra_detalles d
        WHERE d.cotizacion_id = q.id AND d.tenant_id = q.tenant_id
      ), '[]'::jsonb)
    )
  )
  FROM public.cotizaciones_compra q
  WHERE q.id = p_cotizacion_id AND q.tenant_id = p_tenant_id;
$function$;

CREATE OR REPLACE FUNCTION app.purchase_order_fingerprint_453(
  p_orden_id uuid,
  p_tenant_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.sha256_json_453(
    jsonb_build_object(
      'numero', upper(btrim(o.numero)),
      'proveedor_id', o.proveedor_id,
      'cotizacion_id', o.cotizacion_id,
      'fecha_orden', o.fecha_orden,
      'fecha_entrega', coalesce(o.fecha_entrega_esperada, o.fecha_entrega),
      'condiciones_pago', coalesce(o.condiciones_pago, ''),
      'dias_credito', coalesce(o.dias_credito, 0),
      'almacen_destino_id', o.almacen_destino_id,
      'moneda', upper(coalesce(o.moneda, 'PEN')),
      'subtotal', round(o.subtotal, 2),
      'igv', round(o.igv, 2),
      'total', round(o.total, 2),
      'detalles', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'producto_id', d.producto_id,
          'descripcion', btrim(d.descripcion),
          'cantidad', d.cantidad,
          'precio_unitario', round(d.precio_unitario, 2),
          'subtotal', round(d.subtotal, 2)
        ) ORDER BY coalesce(d.numero, 2147483647), d.created_at, d.id)
        FROM public.orden_compra_detalles d
        WHERE d.orden_id = o.id AND d.tenant_id = o.tenant_id
      ), '[]'::jsonb)
    )
  )
  FROM public.ordenes_compra o
  WHERE o.id = p_orden_id AND o.tenant_id = p_tenant_id;
$function$;

CREATE OR REPLACE FUNCTION public.crear_cotizacion_compra_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_numero text := nullif(btrim(p_payload->>'numero'), '');
  v_proveedor_id uuid;
  v_fecha date;
  v_validez integer;
  v_vencimiento date;
  v_detalles jsonb := p_payload->'detalles';
  v_detalle jsonb;
  v_ordinal bigint;
  v_producto_id uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric := 0;
  v_igv numeric;
  v_total numeric;
  v_tasa numeric;
  v_request jsonb;
  v_fingerprint text;
  v_existing public.cotizaciones_compra%ROWTYPE;
  v_id uuid := gen_random_uuid();
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload de cotizacion invalido';
  END IF;
  IF p_payload - ARRAY['numero','proveedor_id','fecha_cotizacion','validez_dias','observaciones','detalles'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Payload de cotizacion contiene campos no admitidos';
  END IF;
  IF v_key IS NULL OR v_numero IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'numero e idempotency_key son obligatorios';
  END IF;
  BEGIN
    v_proveedor_id := (p_payload->>'proveedor_id')::uuid;
    v_fecha := coalesce((p_payload->>'fecha_cotizacion')::date, app.hoy_tenant(p_tenant_id));
    v_validez := coalesce((p_payload->>'validez_dias')::integer, 30);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Proveedor, fecha o validez invalidos';
  END;
  IF v_validez < 1 OR v_validez > 3650 THEN
    RAISE EXCEPTION 'validez_dias fuera de rango';
  END IF;
  v_vencimiento := v_fecha + v_validez;
  IF v_vencimiento < app.hoy_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'No se puede crear una cotizacion vencida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = v_proveedor_id AND p.tenant_id = p_tenant_id
      AND coalesce(p.activo, true)
  ) THEN
    RAISE EXCEPTION 'Proveedor inexistente, inactivo o ajeno al tenant';
  END IF;
  IF v_detalles IS NULL OR jsonb_typeof(v_detalles) <> 'array'
     OR jsonb_array_length(v_detalles) = 0 OR jsonb_array_length(v_detalles) > 999 THEN
    RAISE EXCEPTION 'La cotizacion requiere entre 1 y 999 detalles';
  END IF;

  FOR v_detalle, v_ordinal IN
    SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
  LOOP
    IF v_detalle - ARRAY['producto_id','descripcion','cantidad','precio_unitario'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Detalle de cotizacion contiene campos no admitidos';
    END IF;
    BEGIN
      v_producto_id := (v_detalle->>'producto_id')::uuid;
      v_cantidad := (v_detalle->>'cantidad')::numeric;
      v_precio := round((v_detalle->>'precio_unitario')::numeric, 2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Producto, cantidad o precio invalidos en linea %', v_ordinal;
    END;
    v_descripcion := nullif(btrim(v_detalle->>'descripcion'), '');
    IF v_descripcion IS NULL OR v_cantidad <= 0 OR v_precio < 0 THEN
      RAISE EXCEPTION 'Descripcion, cantidad o precio invalidos en linea %', v_ordinal;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.productos p
      WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id
        AND coalesce(p.activo, true)
    ) THEN
      RAISE EXCEPTION 'Producto inexistente, inactivo o ajeno al tenant en linea %', v_ordinal;
    END IF;
    v_subtotal := v_subtotal + round(v_cantidad * v_precio, 2);
  END LOOP;

  v_tasa := app.tasa_impuesto_tenant(p_tenant_id);
  v_subtotal := round(v_subtotal, 2);
  SELECT round(coalesce(sum(CASE
    WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
      THEN round((x.value->>'cantidad')::numeric * round((x.value->>'precio_unitario')::numeric, 2), 2)
    ELSE 0 END), 0) * v_tasa, 2)
  INTO v_igv
  FROM jsonb_array_elements(v_detalles) x
  JOIN public.productos p
    ON p.id = (x.value->>'producto_id')::uuid AND p.tenant_id = p_tenant_id;
  v_total := round(v_subtotal + v_igv, 2);
  v_request := jsonb_build_object(
    'numero', upper(v_numero), 'proveedor_id', v_proveedor_id,
    'fecha', v_fecha, 'validez', v_validez,
    'observaciones', coalesce(p_payload->>'observaciones', ''),
    'detalles', v_detalles, 'subtotal', v_subtotal, 'igv', v_igv, 'total', v_total
  );
  v_fingerprint := app.sha256_json_453(v_request);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':purchase-quote:' || v_key, 453));
  SELECT * INTO v_existing
  FROM public.cotizaciones_compra
  WHERE tenant_id = p_tenant_id AND metadata->>'idempotency_key' = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.metadata->>'request_fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'Idempotency key reutilizada con otra cotizacion' USING ERRCODE = '23505';
    END IF;
    RETURN app.purchase_quote_result_453(v_existing.id, p_tenant_id)
      || jsonb_build_object('idempotent', true);
  END IF;

  INSERT INTO public.cotizaciones_compra (
    id, tenant_id, numero, proveedor_id, fecha_cotizacion, fecha_vencimiento,
    validez_dias, estado, subtotal, igv, total, observaciones,
    created_by, updated_by, metadata, created_at, updated_at
  ) VALUES (
    v_id, p_tenant_id, v_numero, v_proveedor_id, v_fecha, v_vencimiento,
    v_validez, 'BORRADOR', v_subtotal, v_igv, v_total,
    nullif(btrim(p_payload->>'observaciones'), ''), p_actor_id, p_actor_id,
    jsonb_build_object('idempotency_key', v_key, 'request_fingerprint', v_fingerprint, 'revision', 1),
    now(), now()
  );

  FOR v_detalle, v_ordinal IN
    SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
  LOOP
    INSERT INTO public.cotizacion_compra_detalles (
      tenant_id, cotizacion_id, numero, producto_id, descripcion,
      cantidad, precio_unitario, subtotal, metadata
    ) VALUES (
      p_tenant_id, v_id, v_ordinal::integer, (v_detalle->>'producto_id')::uuid,
      btrim(v_detalle->>'descripcion'), (v_detalle->>'cantidad')::numeric,
      round((v_detalle->>'precio_unitario')::numeric, 2),
      round((v_detalle->>'cantidad')::numeric * (v_detalle->>'precio_unitario')::numeric, 2),
      jsonb_build_object(
        'tax_rate', CASE
          WHEN left(coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
            WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10'), 1) = '1'
            THEN v_tasa ELSE 0 END,
        'afectacion_igv', coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
          WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10')
      )
    );
  END LOOP;

  RETURN app.purchase_quote_result_453(v_id, p_tenant_id)
    || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.insert_purchase_order_453(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_cotizacion_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_numero text := nullif(btrim(p_payload->>'numero'), '');
  v_proveedor_id uuid;
  v_fecha date;
  v_fecha_entrega date;
  v_condiciones text;
  v_dias_credito integer;
  v_almacen_id uuid;
  v_moneda text;
  v_detalles jsonb := p_payload->'detalles';
  v_detalle jsonb;
  v_ordinal bigint;
  v_producto_id uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric := 0;
  v_igv numeric;
  v_total numeric;
  v_tasa numeric;
  v_items jsonb := '[]'::jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_existing public.ordenes_compra%ROWTYPE;
  v_id uuid := gen_random_uuid();
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload de orden invalido';
  END IF;
  IF p_payload - ARRAY[
    'numero','proveedor_id','fecha_orden','fecha_entrega_esperada',
    'condiciones_pago','dias_credito','almacen_destino_id','observaciones',
    'detalles','moneda'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Payload de orden contiene campos no admitidos';
  END IF;
  IF v_key IS NULL OR v_numero IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'numero e idempotency_key son obligatorios';
  END IF;
  BEGIN
    v_proveedor_id := (p_payload->>'proveedor_id')::uuid;
    v_fecha := coalesce((p_payload->>'fecha_orden')::date, app.hoy_tenant(p_tenant_id));
    v_fecha_entrega := coalesce(
      (p_payload->>'fecha_entrega_esperada')::date,
      v_fecha + 30
    );
    v_dias_credito := coalesce((p_payload->>'dias_credito')::integer, 0);
    v_almacen_id := nullif(p_payload->>'almacen_destino_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Proveedor, fechas, credito o almacen invalidos';
  END;
  IF v_fecha_entrega < v_fecha THEN RAISE EXCEPTION 'La entrega no puede preceder a la orden'; END IF;
  IF v_dias_credito < 0 OR v_dias_credito > 3650 THEN RAISE EXCEPTION 'dias_credito fuera de rango'; END IF;
  v_condiciones := coalesce(nullif(btrim(p_payload->>'condiciones_pago'), ''),
    CASE WHEN v_dias_credito > 0 THEN 'CREDITO' ELSE 'CONTADO' END);
  SELECT upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), ec.moneda_defecto, 'PEN'))
  INTO v_moneda
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  v_moneda := coalesce(v_moneda, upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN')));
  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = v_proveedor_id AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
  ) THEN
    RAISE EXCEPTION 'Proveedor inexistente, inactivo o ajeno al tenant';
  END IF;
  IF v_almacen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id AND coalesce(a.activo, true)
  ) THEN
    RAISE EXCEPTION 'Almacen destino inexistente, inactivo o ajeno al tenant';
  END IF;
  IF p_cotizacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cotizaciones_compra q
    WHERE q.id = p_cotizacion_id AND q.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Cotizacion origen inexistente o ajena al tenant';
  END IF;
  IF v_detalles IS NULL OR jsonb_typeof(v_detalles) <> 'array'
     OR jsonb_array_length(v_detalles) = 0 OR jsonb_array_length(v_detalles) > 999 THEN
    RAISE EXCEPTION 'La orden requiere entre 1 y 999 detalles';
  END IF;

  FOR v_detalle, v_ordinal IN
    SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
  LOOP
    IF v_detalle - ARRAY['producto_id','descripcion','cantidad','precio_unitario'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Detalle de orden contiene campos no admitidos';
    END IF;
    BEGIN
      v_producto_id := (v_detalle->>'producto_id')::uuid;
      v_cantidad := (v_detalle->>'cantidad')::numeric;
      v_precio := round((v_detalle->>'precio_unitario')::numeric, 2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Producto, cantidad o precio invalidos en linea %', v_ordinal;
    END;
    v_descripcion := nullif(btrim(v_detalle->>'descripcion'), '');
    IF v_descripcion IS NULL OR v_cantidad <= 0 OR v_precio < 0 THEN
      RAISE EXCEPTION 'Descripcion, cantidad o precio invalidos en linea %', v_ordinal;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.productos p
      WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
    ) THEN
      RAISE EXCEPTION 'Producto inexistente, inactivo o ajeno al tenant en linea %', v_ordinal;
    END IF;
    v_subtotal := v_subtotal + round(v_cantidad * v_precio, 2);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_id, 'producto_nombre', v_descripcion,
      'cantidad', v_cantidad, 'precio_unitario', v_precio,
      'subtotal', round(v_cantidad * v_precio, 2)
    ));
  END LOOP;
  v_tasa := app.tasa_impuesto_tenant(p_tenant_id);
  v_subtotal := round(v_subtotal, 2);
  SELECT round(coalesce(sum(CASE
    WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
      THEN round((x.value->>'cantidad')::numeric * round((x.value->>'precio_unitario')::numeric, 2), 2)
    ELSE 0 END), 0) * v_tasa, 2)
  INTO v_igv
  FROM jsonb_array_elements(v_detalles) x
  JOIN public.productos p
    ON p.id = (x.value->>'producto_id')::uuid AND p.tenant_id = p_tenant_id;
  v_total := round(v_subtotal + v_igv, 2);
  v_request := jsonb_build_object(
    'numero', upper(v_numero), 'proveedor_id', v_proveedor_id,
    'cotizacion_id', p_cotizacion_id, 'fecha', v_fecha,
    'fecha_entrega', v_fecha_entrega, 'condiciones', v_condiciones,
    'dias_credito', v_dias_credito, 'almacen_id', v_almacen_id,
    'moneda', v_moneda, 'observaciones', coalesce(p_payload->>'observaciones', ''),
    'detalles', v_detalles, 'subtotal', v_subtotal, 'igv', v_igv, 'total', v_total
  );
  v_fingerprint := app.sha256_json_453(v_request);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':purchase-order:' || v_key, 453));
  SELECT * INTO v_existing
  FROM public.ordenes_compra
  WHERE tenant_id = p_tenant_id AND metadata->>'idempotency_key' = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.metadata->>'request_fingerprint' IS DISTINCT FROM v_fingerprint
       OR v_existing.cotizacion_id IS DISTINCT FROM p_cotizacion_id THEN
      RAISE EXCEPTION 'Idempotency key reutilizada con otra orden' USING ERRCODE = '23505';
    END IF;
    RETURN app.purchase_order_result_453(v_existing.id, p_tenant_id)
      || jsonb_build_object('idempotent', true);
  END IF;

  INSERT INTO public.ordenes_compra (
    id, tenant_id, numero, numero_orden, proveedor_id, cotizacion_id,
    fecha, fecha_orden, fecha_entrega, fecha_entrega_esperada,
    condiciones_pago, dias_credito, almacen_destino_id, moneda,
    estado, subtotal, igv, total, items, observaciones,
    usuario_id, created_by, updated_by, metadata, created_at, updated_at
  ) VALUES (
    v_id, p_tenant_id, v_numero, v_numero, v_proveedor_id, p_cotizacion_id,
    v_fecha, v_fecha, v_fecha_entrega, v_fecha_entrega,
    v_condiciones, v_dias_credito, v_almacen_id, v_moneda,
    'BORRADOR', v_subtotal, v_igv, v_total, v_items,
    nullif(btrim(p_payload->>'observaciones'), ''),
    p_actor_id, p_actor_id, p_actor_id,
    jsonb_strip_nulls(jsonb_build_object(
      'idempotency_key', v_key, 'request_fingerprint', v_fingerprint,
      'source_quote_id', p_cotizacion_id,
      'source_quote_fingerprint', CASE WHEN p_cotizacion_id IS NOT NULL
        THEN app.purchase_quote_fingerprint_453(p_cotizacion_id, p_tenant_id) END,
      'revision', 1
    )), now(), now()
  );

  FOR v_detalle, v_ordinal IN
    SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
  LOOP
    INSERT INTO public.orden_compra_detalles (
      tenant_id, orden_id, numero, producto_id, descripcion, cantidad,
      cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal,
      moneda, metadata
    ) VALUES (
      p_tenant_id, v_id, v_ordinal::integer, (v_detalle->>'producto_id')::uuid,
      btrim(v_detalle->>'descripcion'), (v_detalle->>'cantidad')::numeric,
      0, (v_detalle->>'cantidad')::numeric,
      round((v_detalle->>'precio_unitario')::numeric, 2),
      round((v_detalle->>'cantidad')::numeric * (v_detalle->>'precio_unitario')::numeric, 2),
      v_moneda, jsonb_build_object(
        'tax_rate', CASE
          WHEN left(coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
            WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10'), 1) = '1'
            THEN v_tasa ELSE 0 END,
        'afectacion_igv', coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
          WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10'),
        'source_quote_id', p_cotizacion_id
      )
    );
  END LOOP;

  RETURN app.purchase_order_result_453(v_id, p_tenant_id)
    || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_orden_compra_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_payload ? 'cotizacion_id' THEN
    RAISE EXCEPTION 'Una OC vinculada a cotizacion solo se crea mediante convertir_cotizacion_compra_a_oc_tx';
  END IF;
  RETURN app.insert_purchase_order_453(
    p_tenant_id, p_actor_id, p_idempotency_key, p_payload, NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.convertir_cotizacion_compra_a_oc_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_numero_oc text DEFAULT NULL,
  p_fecha_entrega date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cot public.cotizaciones_compra%ROWTYPE;
  v_numero text := nullif(btrim(p_numero_oc), '');
  v_year integer;
  v_next bigint;
  v_payload jsonb;
  v_result jsonb;
  v_order_id uuid;
  v_calc_subtotal numeric;
  v_tasa numeric;
  v_calc_igv numeric;
  v_calc_total numeric;
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':purchase-quote-convert:' || p_cotizacion_id::text, 453
  ));
  SELECT * INTO v_cot
  FROM public.cotizaciones_compra
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotizacion de compra no encontrada'; END IF;

  IF v_cot.orden_compra_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ordenes_compra o
      WHERE o.id = v_cot.orden_compra_id AND o.tenant_id = p_tenant_id
        AND o.cotizacion_id = p_cotizacion_id
    ) THEN
      RAISE EXCEPTION 'La cotizacion apunta a una OC inconsistente';
    END IF;
    RETURN app.purchase_order_result_453(v_cot.orden_compra_id, p_tenant_id)
      || jsonb_build_object('idempotent', true);
  END IF;
  IF upper(v_cot.estado::text) <> 'APROBADA' THEN
    RAISE EXCEPTION 'Solo una cotizacion APROBADA puede convertirse';
  END IF;
  IF v_cot.fecha_vencimiento < app.hoy_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'La cotizacion aprobada esta vencida';
  END IF;

  v_tasa := app.tasa_impuesto_tenant(p_tenant_id);
  SELECT
    round(coalesce(sum(d.subtotal), 0), 2),
    round(coalesce(sum(CASE
      WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
        THEN d.subtotal ELSE 0 END), 0) * v_tasa, 2)
  INTO v_calc_subtotal, v_calc_igv
  FROM public.cotizacion_compra_detalles d
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
  WHERE d.cotizacion_id = p_cotizacion_id AND d.tenant_id = p_tenant_id;
  IF v_calc_subtotal <= 0 AND NOT EXISTS (
    SELECT 1 FROM public.cotizacion_compra_detalles d
    WHERE d.cotizacion_id = p_cotizacion_id AND d.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'La cotizacion no tiene detalles';
  END IF;
  v_calc_total := round(v_calc_subtotal + v_calc_igv, 2);
  IF abs(v_cot.subtotal - v_calc_subtotal) > 0.01
     OR abs(v_cot.igv - v_calc_igv) > 0.01
     OR abs(v_cot.total - v_calc_total) > 0.01 THEN
    RAISE EXCEPTION 'La cabecera historica de la cotizacion no coincide con sus detalles';
  END IF;

  IF v_numero IS NULL THEN
    v_year := extract(year FROM app.hoy_tenant(p_tenant_id))::integer;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':purchase-order-number:' || v_year, 453));
    SELECT coalesce(max((regexp_match(o.numero, '([0-9]+)$'))[1]::bigint), 0) + 1
    INTO v_next
    FROM public.ordenes_compra o
    WHERE o.tenant_id = p_tenant_id AND upper(o.numero) LIKE 'OC-' || v_year || '-%';
    v_numero := 'OC-' || v_year || '-' || lpad(v_next::text, greatest(4, length(v_next::text)), '0');
  END IF;

  v_payload := jsonb_build_object(
    'numero', v_numero,
    'proveedor_id', v_cot.proveedor_id,
    'fecha_orden', app.hoy_tenant(p_tenant_id),
    'fecha_entrega_esperada', coalesce(p_fecha_entrega, app.hoy_tenant(p_tenant_id) + 30),
    'condiciones_pago', coalesce((SELECT p.condiciones_pago FROM public.proveedores p WHERE p.id=v_cot.proveedor_id), 'CONTADO'),
    'dias_credito', coalesce((SELECT p.dias_credito FROM public.proveedores p WHERE p.id=v_cot.proveedor_id), 0),
    'observaciones', v_cot.observaciones,
    'detalles', (
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id', d.producto_id,
        'descripcion', d.descripcion,
        'cantidad', d.cantidad,
        'precio_unitario', d.precio_unitario
      ) ORDER BY coalesce(d.numero, 2147483647), d.created_at, d.id)
      FROM public.cotizacion_compra_detalles d
      WHERE d.cotizacion_id = p_cotizacion_id AND d.tenant_id = p_tenant_id
    )
  );

  v_result := app.insert_purchase_order_453(
    p_tenant_id, p_actor_id,
    coalesce(nullif(btrim(p_idempotency_key), ''), 'convert:' || p_cotizacion_id::text),
    v_payload, p_cotizacion_id
  );
  v_order_id := (v_result->>'id')::uuid;
  UPDATE public.cotizaciones_compra
  SET orden_compra_id = v_order_id,
      updated_by = p_actor_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'converted_at', now(), 'converted_by', p_actor_id,
        'conversion_fingerprint', app.purchase_quote_fingerprint_453(p_cotizacion_id, p_tenant_id)
      )
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id;

  RETURN v_result || jsonb_build_object('converted_from_quote_id', p_cotizacion_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_orden_compra_tx(
  p_orden_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_orden public.ordenes_compra%ROWTYPE;
  v_numero text;
  v_proveedor_id uuid;
  v_fecha date;
  v_fecha_entrega date;
  v_condiciones text;
  v_dias_credito integer;
  v_almacen_id uuid;
  v_moneda text;
  v_detalles jsonb;
  v_detalle jsonb;
  v_ordinal bigint;
  v_producto_id uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_tasa numeric;
  v_items jsonb;
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_payload = '{}'::jsonb THEN
    RAISE EXCEPTION 'Payload de actualizacion invalido';
  END IF;
  IF p_payload - ARRAY[
    'numero','proveedor_id','fecha_orden','fecha_entrega_esperada',
    'condiciones_pago','dias_credito','almacen_destino_id','observaciones',
    'detalles','moneda'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'La edicion no admite estado, cotizacion ni cantidades recibidas de cabecera';
  END IF;
  SELECT * INTO v_orden
  FROM public.ordenes_compra
  WHERE id = p_orden_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF upper(v_orden.estado::text) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se edita una orden en BORRADOR';
  END IF;

  v_numero := CASE WHEN p_payload ? 'numero'
    THEN nullif(btrim(p_payload->>'numero'), '') ELSE v_orden.numero END;
  IF v_numero IS NULL THEN RAISE EXCEPTION 'numero es obligatorio'; END IF;
  BEGIN
    v_proveedor_id := CASE WHEN p_payload ? 'proveedor_id'
      THEN (p_payload->>'proveedor_id')::uuid ELSE v_orden.proveedor_id END;
    v_fecha := CASE WHEN p_payload ? 'fecha_orden'
      THEN (p_payload->>'fecha_orden')::date ELSE v_orden.fecha_orden END;
    v_fecha_entrega := CASE WHEN p_payload ? 'fecha_entrega_esperada'
      THEN (p_payload->>'fecha_entrega_esperada')::date
      ELSE coalesce(v_orden.fecha_entrega_esperada, v_orden.fecha_entrega, v_fecha + 30) END;
    v_dias_credito := CASE WHEN p_payload ? 'dias_credito'
      THEN (p_payload->>'dias_credito')::integer ELSE coalesce(v_orden.dias_credito, 0) END;
    v_almacen_id := CASE WHEN p_payload ? 'almacen_destino_id'
      THEN nullif(p_payload->>'almacen_destino_id', '')::uuid ELSE v_orden.almacen_destino_id END;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Proveedor, fechas, credito o almacen invalidos';
  END;
  IF v_fecha_entrega < v_fecha THEN RAISE EXCEPTION 'La entrega no puede preceder a la orden'; END IF;
  IF v_dias_credito < 0 OR v_dias_credito > 3650 THEN RAISE EXCEPTION 'dias_credito fuera de rango'; END IF;
  v_condiciones := CASE WHEN p_payload ? 'condiciones_pago'
    THEN coalesce(nullif(btrim(p_payload->>'condiciones_pago'), ''), 'CONTADO')
    ELSE coalesce(v_orden.condiciones_pago, 'CONTADO') END;
  v_moneda := CASE WHEN p_payload ? 'moneda'
    THEN upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN'))
    ELSE upper(coalesce(v_orden.moneda, 'PEN')) END;
  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = v_proveedor_id AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
  ) THEN RAISE EXCEPTION 'Proveedor inexistente, inactivo o ajeno al tenant'; END IF;
  IF v_almacen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id AND coalesce(a.activo, true)
  ) THEN RAISE EXCEPTION 'Almacen destino inexistente, inactivo o ajeno al tenant'; END IF;

  IF p_payload ? 'detalles' THEN
    v_detalles := p_payload->'detalles';
    IF v_detalles IS NULL OR jsonb_typeof(v_detalles) <> 'array'
       OR jsonb_array_length(v_detalles) = 0 OR jsonb_array_length(v_detalles) > 999 THEN
      RAISE EXCEPTION 'La orden requiere entre 1 y 999 detalles';
    END IF;
    v_subtotal := 0;
    v_items := '[]'::jsonb;
    FOR v_detalle, v_ordinal IN
      SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
    LOOP
      IF v_detalle - ARRAY['producto_id','descripcion','cantidad','precio_unitario'] <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Detalle de orden contiene campos no admitidos';
      END IF;
      BEGIN
        v_producto_id := (v_detalle->>'producto_id')::uuid;
        v_cantidad := (v_detalle->>'cantidad')::numeric;
        v_precio := round((v_detalle->>'precio_unitario')::numeric, 2);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Producto, cantidad o precio invalidos en linea %', v_ordinal;
      END;
      v_descripcion := nullif(btrim(v_detalle->>'descripcion'), '');
      IF v_descripcion IS NULL OR v_cantidad <= 0 OR v_precio < 0 THEN
        RAISE EXCEPTION 'Detalle invalido en linea %', v_ordinal;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.productos p
        WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
      ) THEN RAISE EXCEPTION 'Producto inexistente/inactivo/ajeno en linea %', v_ordinal; END IF;
      v_subtotal := v_subtotal + round(v_cantidad * v_precio, 2);
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto_id, 'producto_nombre', v_descripcion,
        'cantidad', v_cantidad, 'precio_unitario', v_precio,
        'subtotal', round(v_cantidad * v_precio, 2)
      ));
    END LOOP;
    v_tasa := app.tasa_impuesto_tenant(p_tenant_id);
    v_subtotal := round(v_subtotal, 2);
    SELECT round(coalesce(sum(CASE
      WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
        THEN round((x.value->>'cantidad')::numeric * round((x.value->>'precio_unitario')::numeric, 2), 2)
      ELSE 0 END), 0) * v_tasa, 2)
    INTO v_igv
    FROM jsonb_array_elements(v_detalles) x
    JOIN public.productos p
      ON p.id = (x.value->>'producto_id')::uuid AND p.tenant_id = p_tenant_id;
    v_total := round(v_subtotal + v_igv, 2);
  ELSE
    v_subtotal := v_orden.subtotal;
    v_igv := v_orden.igv;
    v_total := v_orden.total;
    v_items := v_orden.items;
  END IF;

  UPDATE public.ordenes_compra
  SET numero = v_numero,
      numero_orden = v_numero,
      proveedor_id = v_proveedor_id,
      fecha = v_fecha,
      fecha_orden = v_fecha,
      fecha_entrega = v_fecha_entrega,
      fecha_entrega_esperada = v_fecha_entrega,
      condiciones_pago = v_condiciones,
      dias_credito = v_dias_credito,
      almacen_destino_id = v_almacen_id,
      moneda = v_moneda,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
      items = v_items,
      observaciones = CASE WHEN p_payload ? 'observaciones'
        THEN nullif(btrim(p_payload->>'observaciones'), '') ELSE observaciones END,
      updated_by = p_actor_id,
      updated_at = now(),
      metadata = (coalesce(metadata, '{}'::jsonb)
        - ARRAY['approval_fingerprint','approval_actor_id','approval_event_id','approval_result'])
        || jsonb_build_object(
          'revision', coalesce((metadata->>'revision')::integer, 1) + 1,
          'last_actor_id', p_actor_id
        )
  WHERE id = p_orden_id AND tenant_id = p_tenant_id;

  IF p_payload ? 'detalles' THEN
    DELETE FROM public.orden_compra_detalles
    WHERE orden_id = p_orden_id AND tenant_id = p_tenant_id;
    FOR v_detalle, v_ordinal IN
      SELECT value, ordinality FROM jsonb_array_elements(v_detalles) WITH ORDINALITY
    LOOP
      INSERT INTO public.orden_compra_detalles (
        tenant_id, orden_id, numero, producto_id, descripcion, cantidad,
        cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal,
        moneda, metadata
      ) VALUES (
        p_tenant_id, p_orden_id, v_ordinal::integer, (v_detalle->>'producto_id')::uuid,
        btrim(v_detalle->>'descripcion'), (v_detalle->>'cantidad')::numeric,
        0, (v_detalle->>'cantidad')::numeric,
        round((v_detalle->>'precio_unitario')::numeric, 2),
        round((v_detalle->>'cantidad')::numeric * (v_detalle->>'precio_unitario')::numeric, 2),
        v_moneda, jsonb_build_object(
          'tax_rate', CASE
            WHEN left(coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
              WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10'), 1) = '1'
              THEN v_tasa ELSE 0 END,
          'afectacion_igv', coalesce(nullif(btrim((SELECT p.afectacion_igv FROM public.productos p
            WHERE p.id = (v_detalle->>'producto_id')::uuid AND p.tenant_id = p_tenant_id)), ''), '10'),
          'source_quote_id', v_orden.cotizacion_id
        )
      );
    END LOOP;
  END IF;

  RETURN app.purchase_order_result_453(p_orden_id, p_tenant_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decidir_orden_compra_tx(
  p_orden_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_accion text,
  p_comentarios text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_orden public.ordenes_compra%ROWTYPE;
  v_accion text := upper(nullif(btrim(p_accion), ''));
  v_fingerprint text;
  v_event_id uuid;
  v_event_key text;
  v_event_payload jsonb;
  v_existing_event public.outbox_events%ROWTYPE;
  v_aprobador_nombre text;
BEGIN
  PERFORM app.assert_purchase_actor_453(p_tenant_id, p_actor_id);
  SELECT * INTO v_orden
  FROM public.ordenes_compra
  WHERE id = p_orden_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  v_fingerprint := app.purchase_order_fingerprint_453(p_orden_id, p_tenant_id);
  SELECT concat_ws(' ', nullif(btrim(u.nombre), ''), nullif(btrim(u.apellido), ''))
  INTO v_aprobador_nombre
  FROM public.usuarios_sistema u WHERE u.id = p_actor_id;
  v_aprobador_nombre := coalesce(nullif(btrim(v_aprobador_nombre), ''), p_actor_id::text);

  IF v_accion = 'APROBAR' THEN
    IF upper(v_orden.estado::text) = 'APROBADA'
       AND v_orden.metadata->>'approval_actor_id' = p_actor_id::text
       AND v_orden.metadata->>'approval_fingerprint' = v_fingerprint THEN
      RETURN app.purchase_order_result_453(p_orden_id, p_tenant_id)
        || jsonb_build_object('idempotent', true);
    END IF;
    IF upper(v_orden.estado::text) NOT IN ('BORRADOR','PENDIENTE','APROBACION') THEN
      RAISE EXCEPTION 'La orden no esta en estado aprobable';
    END IF;
    IF v_orden.created_by IS NULL OR v_orden.created_by = p_actor_id THEN
      RAISE EXCEPTION 'La aprobacion exige creador trazable y actor distinto';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.orden_compra_detalles d
      WHERE d.orden_id = p_orden_id AND d.tenant_id = p_tenant_id
    ) THEN RAISE EXCEPTION 'La orden no tiene detalles'; END IF;

    DELETE FROM public.oc_aprobaciones
    WHERE orden_id = p_orden_id AND tenant_id = p_tenant_id
      AND lower(estado::text) = 'pendiente';
    INSERT INTO public.oc_aprobaciones (
      tenant_id, orden_id, nivel, aprobador_id, aprobador_nombre,
      estado, fecha_aprobacion, comentarios, metadata
    ) VALUES (
      p_tenant_id, p_orden_id, 1, p_actor_id::text, v_aprobador_nombre,
      'APROBADA', now(), nullif(btrim(p_comentarios), ''),
      jsonb_build_object('fingerprint', v_fingerprint, 'decision', 'APROBADA', 'actor_id', p_actor_id)
    );

    v_event_id := gen_random_uuid();
    v_event_key := 'compras.oc.aprobada:' || p_tenant_id::text || ':' || p_orden_id::text;
    v_event_payload := jsonb_build_object(
      'eventId', v_event_id,
      'idempotencyKey', v_event_key,
      'ordenId', p_orden_id,
      'numeroOrden', v_orden.numero,
      'proveedorId', v_orden.proveedor_id,
      'proveedorNombre', coalesce((
        SELECT nullif(btrim(p.razon_social), '') FROM public.proveedores p
        WHERE p.id = v_orden.proveedor_id AND p.tenant_id = p_tenant_id
      ), 'Proveedor'),
      'total', v_orden.total,
      'subtotal', v_orden.subtotal,
      'igv', v_orden.igv,
      'moneda', upper(coalesce(v_orden.moneda, 'PEN')),
      'fechaOrden', v_orden.fecha_orden,
      'fechaEntregaEsperada', coalesce(v_orden.fecha_entrega_esperada, v_orden.fecha_entrega),
      'aprobadoPor', p_actor_id,
      'aprobadoEn', now(),
      'diasCredito', coalesce(v_orden.dias_credito, 0),
      'fingerprint', v_fingerprint,
      'tenantId', p_tenant_id,
      'items', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'productoId', d.producto_id,
          'descripcion', d.descripcion,
          'cantidad', d.cantidad,
          'precioUnitario', d.precio_unitario,
          'total', d.subtotal
        ) ORDER BY coalesce(d.numero, 2147483647), d.created_at, d.id), '[]'::jsonb)
        FROM public.orden_compra_detalles d
        WHERE d.orden_id = p_orden_id AND d.tenant_id = p_tenant_id
      )
    );
    INSERT INTO public.outbox_events (
      event_id, tenant_id, aggregate_type, aggregate_id, event_type,
      payload, status, idempotency_key, occurred_at
    ) VALUES (
      v_event_id, p_tenant_id, 'orden_compra', p_orden_id::text,
      'orden.compra.aprobada', v_event_payload, 'pending', v_event_key, now()
    )
    ON CONFLICT (tenant_id, event_type, idempotency_key)
      WHERE idempotency_key IS NOT NULL DO NOTHING;
    SELECT * INTO v_existing_event
    FROM public.outbox_events
    WHERE tenant_id = p_tenant_id AND event_type = 'orden.compra.aprobada'
      AND idempotency_key = v_event_key
    FOR UPDATE;
    IF NOT FOUND OR v_existing_event.aggregate_id <> p_orden_id::text
       OR v_existing_event.payload->>'fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'Colision o ausencia del outbox de aprobacion';
    END IF;
    v_event_id := v_existing_event.event_id;

    UPDATE public.ordenes_compra
    SET estado = 'APROBADA', aprobado_at = now(), aprobado_by = p_actor_id,
        rechazado_at = NULL, rechazado_by = NULL, motivo_rechazo = NULL,
        updated_by = p_actor_id, updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_action', 'APROBAR', 'approval_actor_id', p_actor_id,
          'approval_fingerprint', v_fingerprint, 'approval_event_id', v_event_id
        )
    WHERE id = p_orden_id AND tenant_id = p_tenant_id;

  ELSIF v_accion = 'RECHAZAR' THEN
    IF upper(v_orden.estado::text) = 'ANULADA'
       AND v_orden.metadata->>'last_action' = 'RECHAZAR'
       AND v_orden.metadata->>'decision_actor_id' = p_actor_id::text
       AND v_orden.metadata->>'decision_fingerprint' = v_fingerprint THEN
      RETURN app.purchase_order_result_453(p_orden_id, p_tenant_id)
        || jsonb_build_object('idempotent', true);
    END IF;
    IF upper(v_orden.estado::text) NOT IN ('BORRADOR','PENDIENTE','APROBACION') THEN
      RAISE EXCEPTION 'La orden no esta en estado rechazable';
    END IF;
    IF v_orden.created_by IS NULL OR v_orden.created_by = p_actor_id THEN
      RAISE EXCEPTION 'El rechazo exige creador trazable y actor distinto';
    END IF;
    IF nullif(btrim(p_comentarios), '') IS NULL THEN RAISE EXCEPTION 'Motivo de rechazo obligatorio'; END IF;
    DELETE FROM public.oc_aprobaciones
    WHERE orden_id = p_orden_id AND tenant_id = p_tenant_id
      AND lower(estado::text) = 'pendiente';
    INSERT INTO public.oc_aprobaciones (
      tenant_id, orden_id, nivel, aprobador_id, aprobador_nombre,
      estado, fecha_aprobacion, comentarios, metadata
    ) VALUES (
      p_tenant_id, p_orden_id, 1, p_actor_id::text, v_aprobador_nombre,
      'RECHAZADA', now(), btrim(p_comentarios),
      jsonb_build_object('fingerprint', v_fingerprint, 'decision', 'RECHAZADA', 'actor_id', p_actor_id)
    );
    UPDATE public.ordenes_compra
    SET estado = 'ANULADA', rechazado_at = now(), rechazado_by = p_actor_id,
        motivo_rechazo = btrim(p_comentarios), updated_by = p_actor_id, updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_action', 'RECHAZAR', 'decision_actor_id', p_actor_id,
          'decision_fingerprint', v_fingerprint
        )
    WHERE id = p_orden_id AND tenant_id = p_tenant_id;

  ELSIF v_accion = 'CANCELAR' THEN
    IF upper(v_orden.estado::text) = 'ANULADA'
       AND v_orden.metadata->>'last_action' = 'CANCELAR'
       AND v_orden.metadata->>'decision_actor_id' = p_actor_id::text THEN
      RETURN app.purchase_order_result_453(p_orden_id, p_tenant_id)
        || jsonb_build_object('idempotent', true);
    END IF;
    IF upper(v_orden.estado::text) NOT IN ('BORRADOR','PENDIENTE','APROBACION','APROBADA') THEN
      RAISE EXCEPTION 'La orden ya tiene recepcion/progreso o es terminal';
    END IF;
    IF nullif(btrim(p_comentarios), '') IS NULL THEN RAISE EXCEPTION 'Motivo de cancelacion obligatorio'; END IF;
    PERFORM 1 FROM public.recepciones r
    WHERE r.orden_id = p_orden_id AND r.tenant_id = p_tenant_id
    ORDER BY r.id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.recepciones r
      WHERE r.orden_id = p_orden_id AND r.tenant_id = p_tenant_id
        AND upper(r.estado::text) <> 'BORRADOR'
    ) THEN
      RAISE EXCEPTION 'La OC tiene recepciones procesadas; use devolucion de proveedor, no cancelacion';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.cuentas_por_pagar c
      WHERE c.tenant_id = p_tenant_id AND c.orden_id = p_orden_id
        AND upper(coalesce(c.estado::text, '')) NOT IN ('ANULADA','CANCELADA')
    ) THEN
      RAISE EXCEPTION 'La OC tiene una cuenta por pagar activa y no puede cancelarse';
    END IF;
    DELETE FROM public.recepcion_items ri
    USING public.recepciones r
    WHERE ri.recepcion_id = r.id AND ri.tenant_id = r.tenant_id
      AND r.orden_id = p_orden_id AND r.tenant_id = p_tenant_id
      AND upper(r.estado::text) = 'BORRADOR';
    DELETE FROM public.recepciones r
    WHERE r.orden_id = p_orden_id AND r.tenant_id = p_tenant_id
      AND upper(r.estado::text) = 'BORRADOR';
    UPDATE public.ordenes_compra
    SET estado = 'ANULADA', cancelado_at = now(), cancelado_by = p_actor_id,
        motivo_cancelacion = btrim(p_comentarios), updated_by = p_actor_id, updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_action', 'CANCELAR', 'decision_actor_id', p_actor_id,
          'decision_fingerprint', v_fingerprint
        )
    WHERE id = p_orden_id AND tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'Accion de orden no admitida';
  END IF;

  RETURN app.purchase_order_result_453(p_orden_id, p_tenant_id)
    || jsonb_build_object('idempotent', false);
END;
$function$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.cotizaciones_compra,
  public.cotizacion_compra_detalles,
  public.ordenes_compra,
  public.orden_compra_detalles,
  public.oc_aprobaciones
FROM anon, authenticated;

REVOKE ALL ON FUNCTION app.assert_purchase_actor_453(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.sha256_json_453(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.purchase_quote_result_453(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.purchase_order_result_453(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.purchase_quote_fingerprint_453(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.purchase_order_fingerprint_453(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.insert_purchase_order_453(uuid, uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_cotizacion_compra_tx(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_cotizacion_compra_tx(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_cotizacion_compra_tx(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_orden_compra_tx(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_orden_compra_tx(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convertir_cotizacion_compra_a_oc_tx(uuid, uuid, uuid, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decidir_orden_compra_tx(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_cotizacion_compra_tx(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_cotizacion_compra_tx(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cotizacion_compra_tx(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_orden_compra_tx(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_orden_compra_tx(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.convertir_cotizacion_compra_a_oc_tx(uuid, uuid, uuid, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.decidir_orden_compra_tx(uuid, uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.crear_cotizacion_compra_tx(uuid, uuid, text, jsonb) IS
  'Alta atomica e idempotente de cotizacion de compra con actor y detalles.';
COMMENT ON FUNCTION public.convertir_cotizacion_compra_a_oc_tx(uuid, uuid, uuid, text, text, date) IS
  'Conversion exactamente una vez de cotizacion aprobada a OC borrador.';
COMMENT ON FUNCTION public.decidir_orden_compra_tx(uuid, uuid, uuid, text, text) IS
  'Aprobacion/rechazo/cancelacion atomica; aprobacion segregada y outbox durable.';

COMMIT;
