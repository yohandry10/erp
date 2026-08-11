-- La confirmación comercial reserva existencias, pero todavía no reconoce una
-- venta contable. Reserva, estado y aprobación deben quedar en un solo commit.

-- El alta directa debe usar la misma fecha, numeración y liquidación tributaria
-- que la conversión desde cotización. La RPC histórica confiaba en cabecera y
-- número calculados por JavaScript, lo que permitía documentos descuadrados y
-- colisiones concurrentes.
BEGIN;

ALTER TABLE public.pedidos_venta
  ADD COLUMN IF NOT EXISTS confirmado_por uuid,
  ADD COLUMN IF NOT EXISTS confirmado_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pedidos_venta'::regclass
      AND conname = 'pedidos_venta_confirmado_por_fkey_441'
  ) THEN
    ALTER TABLE public.pedidos_venta
      ADD CONSTRAINT pedidos_venta_confirmado_por_fkey_441
      FOREIGN KEY (confirmado_por) REFERENCES public.usuarios(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;
ALTER TABLE public.pedidos_venta
  VALIDATE CONSTRAINT pedidos_venta_confirmado_por_fkey_441;

CREATE OR REPLACE FUNCTION public.crear_pedido_completo(
  p_pedido jsonb,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido_id uuid;
  v_tenant_id uuid := nullif(p_pedido->>'tenant_id', '')::uuid;
  v_cliente_id uuid := nullif(p_pedido->>'cliente_id', '')::uuid;
  v_created_by uuid := nullif(p_pedido->>'created_by', '')::uuid;
  v_hoy date;
  v_numero text;
  v_next integer;
  v_tasa_igv numeric;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_moneda text;
BEGIN
  IF v_tenant_id IS NULL OR v_cliente_id IS NULL OR v_created_by IS NULL THEN
    RAISE EXCEPTION 'tenant_id, cliente_id y created_by son obligatorios';
  END IF;
  IF nullif(p_pedido->>'cotizacion_id', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Una cotización sólo puede originar un pedido mediante convertir_cotizacion_a_pedido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_created_by AND u.tenant_id = v_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El creador del pedido no pertenece al tenant o está inactivo';
  END IF;
  IF p_detalle IS NULL OR jsonb_typeof(p_detalle) <> 'array'
     OR jsonb_array_length(p_detalle) = 0 THEN
    RAISE EXCEPTION 'El pedido debe tener al menos un producto';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_cliente_id AND c.tenant_id = v_tenant_id AND c.activo
  ) THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalle) AS d(
      producto_id uuid, cantidad numeric, precio_unitario numeric
    )
    LEFT JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = v_tenant_id AND p.activo
    WHERE p.id IS NULL OR d.cantidad IS NULL OR d.cantidad <= 0
      OR d.precio_unitario IS NULL OR d.precio_unitario < 0
  ) THEN
    RAISE EXCEPTION 'El detalle contiene productos, cantidades o precios inválidos';
  END IF;

  SELECT upper(coalesce(nullif(btrim(p_pedido->>'moneda'), ''), ec.moneda_defecto, 'PEN'))
    INTO v_moneda
  FROM public.empresa_config ec
  WHERE ec.tenant_id = v_tenant_id
  LIMIT 1;
  v_tasa_igv := app.tasa_impuesto_tenant(v_tenant_id);
  v_moneda := coalesce(v_moneda, 'PEN');

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
    ON p.id = d.producto_id AND p.tenant_id = v_tenant_id;
  v_total := round(v_subtotal + v_igv, 2);

  IF (p_pedido ? 'subtotal' AND round(app.to_numeric_or_zero(p_pedido->>'subtotal'), 2) <> v_subtotal)
     OR (p_pedido ? 'igv' AND round(app.to_numeric_or_zero(p_pedido->>'igv'), 2) <> v_igv)
     OR (p_pedido ? 'total' AND round(app.to_numeric_or_zero(p_pedido->>'total'), 2) <> v_total) THEN
    RAISE EXCEPTION 'Los totales del pedido no coinciden con su detalle: subtotal=% igv=% total=%',
      v_subtotal, v_igv, v_total;
  END IF;

  v_hoy := app.hoy_tenant(v_tenant_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':pedidos', 439));
  SELECT coalesce(max(substring(numero FROM '^PV-[0-9]{4}-([0-9]+)$')::integer), 0) + 1
    INTO v_next
  FROM public.pedidos_venta
  WHERE tenant_id = v_tenant_id
    AND numero LIKE 'PV-' || to_char(v_hoy, 'YYYY') || '-%'
    AND numero ~ '^PV-[0-9]{4}-[0-9]+$';
  v_numero := 'PV-' || to_char(v_hoy, 'YYYY') || '-' ||
    lpad(v_next::text, greatest(4, length(v_next::text)), '0');

  INSERT INTO public.pedidos_venta (
    tenant_id, numero, cotizacion_id, cliente_id, fecha, fecha_pedido,
    estado, subtotal, igv, total, moneda, observaciones, notas,
    created_by, created_at, updated_at
  ) VALUES (
    v_tenant_id, v_numero, NULL,
    v_cliente_id, v_hoy, v_hoy, 'PENDIENTE', v_subtotal, v_igv,
    v_total, v_moneda, nullif(btrim(p_pedido->>'observaciones'), ''),
    nullif(btrim(p_pedido->>'observaciones'), ''), v_created_by, now(), now()
  ) RETURNING id INTO v_pedido_id;

  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, created_at, updated_at
  )
  SELECT v_tenant_id, v_pedido_id, d.producto_id,
         coalesce(nullif(btrim(d.descripcion), ''), p.nombre),
         d.cantidad, d.precio_unitario,
         round(d.cantidad * d.precio_unitario, 2),
         'PENDIENTE', now(), now()
  FROM jsonb_to_recordset(p_detalle) AS d(
    producto_id uuid, descripcion text, cantidad numeric, precio_unitario numeric
  )
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'pedido_id', v_pedido_id,
    'numero', v_numero,
    'subtotal', v_subtotal,
    'igv', v_igv,
    'total', v_total
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_pedido_aprobaciones_tenant_pedido_latest_441
  ON public.pedido_aprobaciones (tenant_id, pedido_id, created_at DESC, id DESC)
  WHERE pedido_id IS NOT NULL;

ALTER TABLE public.pedido_aprobaciones
  DROP CONSTRAINT IF EXISTS ck_pedido_aprobaciones_decision_441;
ALTER TABLE public.pedido_aprobaciones
  ADD CONSTRAINT ck_pedido_aprobaciones_decision_441
  CHECK (decision IS NULL OR upper(decision) IN ('APROBADO', 'RECHAZADO')) NOT VALID;

ALTER TABLE public.pedido_aprobaciones
  DROP CONSTRAINT IF EXISTS pedido_aprobaciones_pedido_id_fkey_441;
ALTER TABLE public.pedido_aprobaciones
  ADD CONSTRAINT pedido_aprobaciones_pedido_id_fkey_441
  FOREIGN KEY (pedido_id) REFERENCES public.pedidos_venta(id) NOT VALID;

CREATE OR REPLACE FUNCTION app.enforce_pedido_aprobacion_441()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido_tenant uuid;
  v_actor_id uuid;
BEGIN
  IF NEW.pedido_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tenant_id INTO v_pedido_tenant
  FROM public.pedidos_venta p
  WHERE p.id = NEW.pedido_id;
  IF v_pedido_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM v_pedido_tenant THEN
    RAISE EXCEPTION 'La aprobación no pertenece al tenant del pedido';
  END IF;

  IF NEW.decision IS NOT NULL THEN
    v_actor_id := app.to_uuid_or_null(coalesce(NEW.aprobado_por, ''));
    IF v_actor_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = v_actor_id AND u.tenant_id = NEW.tenant_id
        AND coalesce(u.activo, true)
    ) THEN
      RAISE EXCEPTION 'La decisión requiere un actor activo del tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pedido_aprobacion_441
  ON public.pedido_aprobaciones;
CREATE TRIGGER trg_enforce_pedido_aprobacion_441
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, decision, aprobado_por
ON public.pedido_aprobaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pedido_aprobacion_441();

CREATE OR REPLACE FUNCTION app.pedido_venta_fingerprint_441(
  p_pedido_id uuid,
  p_tenant_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'cliente_id', p.cliente_id,
    'subtotal', round(coalesce(p.subtotal, 0), 2),
    'igv', round(coalesce(p.igv, 0), 2),
    'total', round(coalesce(p.total, 0), 2),
    'moneda', upper(coalesce(p.moneda, 'PEN')),
    'detalle', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'producto_id', d.producto_id,
          'descripcion', d.descripcion,
          'cantidad', round(coalesce(d.cantidad, 0), 2),
          'precio_unitario', round(coalesce(d.precio_unitario, 0), 2),
          'subtotal', round(coalesce(d.subtotal, 0), 2)
        ) ORDER BY d.producto_id, d.descripcion, d.cantidad, d.precio_unitario, d.id
      )
      FROM public.pedidos_venta_detalle d
      WHERE d.pedido_id = p.id AND d.tenant_id = p.tenant_id
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION public.evaluar_politica_pedido_441(
  p_pedido_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_config public.empresa_config%ROWTYPE;
  v_limite numeric := 0;
  v_permite_morosidad boolean := false;
  v_pendiente numeric := 0;
  v_tiene_vencidos boolean := false;
  v_moneda_base text := 'PEN';
  v_total_pedido_base numeric := 0;
  v_tipo_cambio_pedido numeric := 0;
  v_cxc_sin_tipo_cambio boolean := false;
  v_motivos text[] := ARRAY[]::text[];
  v_estado_credito text := 'OK';
BEGIN
  SELECT * INTO v_pedido
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  SELECT * INTO v_config
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuración de empresa no encontrada'; END IF;

  v_moneda_base := upper(coalesce(
    nullif(btrim(v_config.moneda_defecto), ''),
    nullif(btrim(v_config.moneda), ''),
    'PEN'
  ));
  IF upper(coalesce(v_pedido.moneda, v_moneda_base)) = v_moneda_base THEN
    v_total_pedido_base := coalesce(v_pedido.total, 0);
  ELSE
    v_tipo_cambio_pedido := app.to_numeric_or_zero(v_pedido.metadata->>'tipo_cambio');
    IF v_tipo_cambio_pedido <= 0 THEN
      v_motivos := array_append(
        v_motivos,
        format(
          'Pedido en %s sin tipo de cambio snapshot hacia %s',
          upper(coalesce(v_pedido.moneda, '')), v_moneda_base
        )
      );
      v_estado_credito := 'BLOQUEADO';
    ELSE
      v_total_pedido_base := round(coalesce(v_pedido.total, 0) * v_tipo_cambio_pedido, 2);
    END IF;
  END IF;

  IF coalesce(v_config.monto_maximo_sin_aprobacion, 0) > 0
     AND v_total_pedido_base > v_config.monto_maximo_sin_aprobacion THEN
    v_motivos := array_append(v_motivos, format(
      'Monto total %s supera el límite sin aprobación %s',
      round(v_total_pedido_base, 2),
      round(v_config.monto_maximo_sin_aprobacion, 2)
    ));
  END IF;

  IF coalesce(v_config.aplicar_limite_credito, false) THEN
    SELECT coalesce(c.limite_credito, 0), coalesce(c.permite_morosidad, false)
      INTO v_limite, v_permite_morosidad
    FROM public.clientes c
    WHERE c.id = v_pedido.cliente_id AND c.tenant_id = p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente del pedido no encontrado'; END IF;

    SELECT coalesce(sum(
             coalesce(cxc.monto_pendiente, 0) * CASE
               WHEN upper(coalesce(cxc.moneda, v_moneda_base)) = v_moneda_base THEN 1
               ELSE coalesce(nullif(cxc.tipo_cambio_origen, 0), 0)
             END
           ), 0),
           coalesce(bool_or(
             upper(coalesce(cxc.estado::text, '')) = 'VENCIDO'
             OR (
               coalesce(cxc.monto_pendiente, 0) > 0
               AND cxc.fecha_vencimiento < app.hoy_tenant(p_tenant_id)
             )
           ), false),
           coalesce(bool_or(
             upper(coalesce(cxc.moneda, v_moneda_base)) <> v_moneda_base
             AND coalesce(cxc.tipo_cambio_origen, 0) <= 0
           ), false)
      INTO v_pendiente, v_tiene_vencidos, v_cxc_sin_tipo_cambio
    FROM public.cuentas_por_cobrar cxc
    WHERE cxc.tenant_id = p_tenant_id
      AND cxc.cliente_id = v_pedido.cliente_id
      AND upper(coalesce(cxc.estado::text, '')) NOT IN (
        'ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA', 'REVERTIDA'
      );

    IF v_cxc_sin_tipo_cambio THEN
      v_motivos := array_append(
        v_motivos,
        format('La cartera contiene moneda extranjera sin tipo de cambio snapshot hacia %s', v_moneda_base)
      );
      v_estado_credito := 'BLOQUEADO';
    END IF;
    IF v_limite > 0 AND v_pendiente + v_total_pedido_base > v_limite THEN
      v_motivos := array_append(v_motivos, format(
        'Límite de crédito excedido: comprometido %s > límite %s',
        round(v_pendiente + v_total_pedido_base, 2), round(v_limite, 2)
      ));
      v_estado_credito := 'BLOQUEADO';
    END IF;
    IF v_tiene_vencidos AND NOT v_permite_morosidad THEN
      v_motivos := array_append(v_motivos, 'Cliente con cuentas por cobrar vencidas');
      v_estado_credito := 'BLOQUEADO';
    END IF;
  END IF;

  IF cardinality(v_motivos) > 0 AND v_estado_credito <> 'BLOQUEADO' THEN
    v_estado_credito := 'REVISION';
  END IF;

  RETURN jsonb_build_object(
    'pedido_fingerprint', app.pedido_venta_fingerprint_441(p_pedido_id, p_tenant_id),
    'requiere_aprobacion', cardinality(v_motivos) > 0,
    'estado_credito', v_estado_credito,
    'motivos', to_jsonb(v_motivos),
    'usar_flujo_logistica', coalesce(v_config.usar_flujo_logistica, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pedido_tiene_aprobacion_vigente(
  p_pedido_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_decision text;
  v_fingerprint text;
BEGIN
  SELECT upper(coalesce(pa.decision, '')), pa.metadata->>'pedido_fingerprint'
    INTO v_decision, v_fingerprint
  FROM public.pedido_aprobaciones pa
  WHERE pa.pedido_id = p_pedido_id AND pa.tenant_id = p_tenant_id
  ORDER BY pa.created_at DESC, pa.id DESC
  LIMIT 1;

  RETURN coalesce(v_decision = 'APROBADO'
    AND v_fingerprint = app.pedido_venta_fingerprint_441(p_pedido_id, p_tenant_id), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_pedido_venta_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_detalle jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_cliente_id uuid;
  v_tasa_igv numeric;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_invalida_aprobacion boolean := false;
BEGIN
  SELECT * INTO v_pedido
  FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF upper(v_pedido.estado::text) <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden editar pedidos en estado PENDIENTE';
  END IF;

  IF coalesce(p_patch, '{}'::jsonb) - ARRAY[
    'cliente_id', 'observaciones', 'subtotal', 'igv', 'total', 'updated_at'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'El patch contiene campos no permitidos para editar un pedido';
  END IF;

  IF coalesce(p_patch, '{}'::jsonb) ? 'cliente_id' THEN
    v_cliente_id := nullif(p_patch->>'cliente_id', '')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = v_cliente_id AND c.tenant_id = p_tenant_id AND c.activo
    ) THEN
      RAISE EXCEPTION 'Cliente no encontrado';
    END IF;
    v_invalida_aprobacion := v_cliente_id IS DISTINCT FROM v_pedido.cliente_id;
  END IF;

  IF p_detalle IS NOT NULL THEN
    IF jsonb_typeof(p_detalle) <> 'array' OR jsonb_array_length(p_detalle) = 0 THEN
      RAISE EXCEPTION 'El pedido debe tener al menos un producto';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_detalle) AS d(
        producto_id uuid, cantidad numeric, precio_unitario numeric
      )
      LEFT JOIN public.productos p
        ON p.id = d.producto_id AND p.tenant_id = p_tenant_id AND p.activo
      WHERE p.id IS NULL OR d.cantidad IS NULL OR d.cantidad <= 0
        OR d.precio_unitario IS NULL OR d.precio_unitario < 0
    ) THEN
      RAISE EXCEPTION 'El detalle contiene productos, cantidades o precios inválidos';
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
      RAISE EXCEPTION 'Los totales del pedido no coinciden con su detalle';
    END IF;

    DELETE FROM public.pedidos_venta_detalle
    WHERE pedido_id = p_pedido_id AND tenant_id = p_tenant_id;

    INSERT INTO public.pedidos_venta_detalle (
      tenant_id, pedido_id, producto_id, descripcion, cantidad,
      precio_unitario, subtotal, estado_item, created_at, updated_at
    )
    SELECT p_tenant_id, p_pedido_id, d.producto_id,
           coalesce(nullif(btrim(d.descripcion), ''), p.nombre),
           d.cantidad, d.precio_unitario,
           round(d.cantidad * d.precio_unitario, 2),
           'PENDIENTE', now(), now()
    FROM jsonb_to_recordset(p_detalle) AS d(
      producto_id uuid, descripcion text, cantidad numeric, precio_unitario numeric
    )
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = p_tenant_id;
    v_invalida_aprobacion := true;
  ELSIF coalesce(p_patch, '{}'::jsonb) ?| ARRAY['subtotal', 'igv', 'total'] THEN
    RAISE EXCEPTION 'Los totales sólo se actualizan junto con el detalle';
  END IF;

  UPDATE public.pedidos_venta
  SET cliente_id = CASE WHEN p_patch ? 'cliente_id' THEN v_cliente_id ELSE cliente_id END,
      observaciones = CASE WHEN p_patch ? 'observaciones' THEN p_patch->>'observaciones' ELSE observaciones END,
      notas = CASE WHEN p_patch ? 'observaciones' THEN p_patch->>'observaciones' ELSE notas END,
      subtotal = CASE WHEN p_detalle IS NOT NULL THEN v_subtotal ELSE subtotal END,
      igv = CASE WHEN p_detalle IS NOT NULL THEN v_igv ELSE igv END,
      total = CASE WHEN p_detalle IS NOT NULL THEN v_total ELSE total END,
      requiere_aprobacion = CASE WHEN v_invalida_aprobacion THEN false ELSE requiere_aprobacion END,
      motivo_requiere_aprobacion = CASE WHEN v_invalida_aprobacion THEN NULL ELSE motivo_requiere_aprobacion END,
      aprobado_por = CASE WHEN v_invalida_aprobacion THEN NULL ELSE aprobado_por END,
      aprobado_en = CASE WHEN v_invalida_aprobacion THEN NULL ELSE aprobado_en END,
      estado_credito = CASE WHEN v_invalida_aprobacion THEN 'PENDIENTE' ELSE estado_credito END,
      updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_pedido;

  RETURN to_jsonb(v_pedido);
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitar_aprobacion_pedido_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_motivos text,
  p_estado_credito text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
BEGIN
  SELECT * INTO v_pedido
  FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF upper(v_pedido.estado::text) NOT IN ('PENDIENTE', 'PENDIENTE_APROBACION') THEN
    RAISE EXCEPTION 'No se puede solicitar aprobación para un pedido en estado %', v_pedido.estado;
  END IF;

  UPDATE public.pedidos_venta
  SET estado = 'PENDIENTE_APROBACION',
      requiere_aprobacion = true,
      motivo_requiere_aprobacion = nullif(btrim(p_motivos), ''),
      estado_credito = upper(coalesce(nullif(btrim(p_estado_credito), ''), 'REVISION')),
      aprobado_por = NULL,
      aprobado_en = NULL,
      updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_pedido;

  RETURN to_jsonb(v_pedido);
END;
$$;

CREATE OR REPLACE FUNCTION public.decidir_aprobacion_pedido_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_decision text,
  p_motivos text,
  p_aprobado_por uuid,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_decision text := upper(nullif(btrim(p_decision), ''));
  v_fingerprint text;
  v_observaciones text;
BEGIN
  IF p_aprobado_por IS NULL THEN
    RAISE EXCEPTION 'No se pudo identificar al aprobador';
  END IF;
  IF v_decision NOT IN ('APROBADO', 'RECHAZADO') THEN
    RAISE EXCEPTION 'Decisión de aprobación inválida';
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF upper(v_pedido.estado::text) <> 'PENDIENTE_APROBACION'
     OR NOT coalesce(v_pedido.requiere_aprobacion, false) THEN
    RAISE EXCEPTION 'El pedido no está pendiente de aprobación';
  END IF;
  IF v_pedido.created_by IS NULL OR v_pedido.created_by = p_aprobado_por THEN
    RAISE EXCEPTION 'El pedido no tiene creador trazable o el actor intenta decidir su propio pedido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_aprobado_por AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El aprobador no pertenece al tenant o está inactivo';
  END IF;

  v_fingerprint := app.pedido_venta_fingerprint_441(p_pedido_id, p_tenant_id);
  INSERT INTO public.pedido_aprobaciones (
    tenant_id, pedido_id, decision, motivos, aprobado_por, aprobado_en, metadata
  ) VALUES (
    p_tenant_id, p_pedido_id, v_decision, nullif(btrim(p_motivos), ''),
    p_aprobado_por::text, now()::text,
    jsonb_build_object(
      'pedido_fingerprint', v_fingerprint,
      'pedido_fingerprint_version', 2,
      'atomic_rpc', 'decidir_aprobacion_pedido_tx'
    )
  );

  v_observaciones := v_pedido.observaciones;
  IF nullif(btrim(p_observaciones), '') IS NOT NULL THEN
    v_observaciones := concat_ws(E'\n\n', nullif(btrim(v_observaciones), ''),
      '[APROBACION:' || v_decision || '] ' || btrim(p_observaciones));
  END IF;

  UPDATE public.pedidos_venta
  SET estado = CASE WHEN v_decision = 'APROBADO' THEN 'PENDIENTE' ELSE 'CANCELADO' END,
      requiere_aprobacion = false,
      motivo_requiere_aprobacion = CASE WHEN v_decision = 'RECHAZADO'
        THEN nullif(btrim(p_motivos), '') ELSE NULL END,
      aprobado_por = p_aprobado_por,
      aprobado_en = now(),
      estado_credito = v_decision,
      observaciones = v_observaciones,
      updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_pedido;

  IF v_decision = 'RECHAZADO' THEN
    PERFORM public.liberar_reservas_pedido_tx(
      p_pedido_id, p_tenant_id, 'PEDIDO_RECHAZO',
      'Liberación atómica por rechazo de pedido'
    );
  END IF;

  RETURN jsonb_build_object('decision', v_decision, 'pedido', to_jsonb(v_pedido));
END;
$$;

CREATE OR REPLACE FUNCTION public.reservar_pedido_stock_tx(
  p_pedido_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_numero text;
  v_item record;
  v_saldo record;
  v_mov_id uuid;
  v_almacen_id uuid;
  v_almacenes integer;
  v_almacenes_principales integer;
  v_almacen_principal_id uuid;
  v_actual numeric;
  v_faltante numeric;
  v_exceso numeric;
  v_tuvo_reserva boolean;
  v_movimientos jsonb := '[]'::jsonb;
  v_ajustes jsonb := '[]'::jsonb;
  v_count_items integer;
  v_inconsistencias integer;
  v_referencia_ajuste text;
BEGIN
  IF p_pedido_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'pedido_id y tenant_id son obligatorios';
  END IF;

  SELECT numero INTO v_numero
  FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  SELECT count(*) INTO v_count_items
  FROM public.pedidos_venta_detalle d
  JOIN public.productos p
    ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
    AND NOT coalesce(p.es_servicio, false)
    AND coalesce(p.controla_stock, true);

  -- Primero libera saldos de productos que ya no pertenecen al pedido.
  FOR v_saldo IN
    SELECT mi.producto_id, mi.almacen_id,
           sum(CASE WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                    THEN coalesce(mi.cantidad, 0) ELSE -coalesce(mi.cantidad, 0) END) AS cantidad
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
      AND NOT EXISTS (
        SELECT 1
        FROM public.pedidos_venta_detalle d
        JOIN public.productos p
          ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
        WHERE d.tenant_id = p_tenant_id AND d.pedido_id = p_pedido_id
          AND d.producto_id = mi.producto_id
          AND NOT coalesce(p.es_servicio, false)
          AND coalesce(p.controla_stock, true)
      )
    GROUP BY mi.producto_id, mi.almacen_id
    HAVING sum(CASE WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                    THEN coalesce(mi.cantidad, 0) ELSE -coalesce(mi.cantidad, 0) END) > 0
    ORDER BY mi.producto_id, mi.almacen_id
  LOOP
    v_mov_id := public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_saldo.producto_id,
      p_almacen_id := v_saldo.almacen_id,
      p_tipo := 'LIBERACION',
      p_cantidad := v_saldo.cantidad,
      p_referencia_tipo := 'PEDIDO_REPARACION_' || replace(gen_random_uuid()::text, '-', ''),
      p_referencia_id := p_pedido_id,
      p_notas := 'Liberación de producto ajeno al pedido durante reconciliación',
      p_metadata := jsonb_build_object('atomic_rpc', 'reservar_pedido_stock_tx', 'repair', true)
    );
    v_ajustes := v_ajustes || jsonb_build_object('movimiento_id', v_mov_id, 'tipo', 'LIBERACION',
      'producto_id', v_saldo.producto_id, 'cantidad', v_saldo.cantidad);
  END LOOP;

  IF v_count_items = 0 THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'El pedido no contiene productos que controlen stock',
      'movimientos', '[]'::jsonb,
      'ajustes_reparacion', v_ajustes
    );
  END IF;

  -- Completa faltantes y libera excesos sin reusar la clave idempotente de una
  -- reserva histórica ya liberada.
  FOR v_item IN
    SELECT d.producto_id, sum(d.cantidad) AS cantidad
    FROM public.pedidos_venta_detalle d
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
      AND NOT coalesce(p.es_servicio, false)
      AND coalesce(p.controla_stock, true)
    GROUP BY d.producto_id
    ORDER BY d.producto_id
  LOOP
    IF v_item.producto_id IS NULL OR coalesce(v_item.cantidad, 0) <= 0 THEN
      RAISE EXCEPTION 'Item de pedido inválido (producto/cantidad) en pedido %', p_pedido_id;
    END IF;

    -- Incluso una reserva ya completa debe ser físicamente despachable desde
    -- un solo almacén. Antes este control sólo corría cuando había faltantes y
    -- aceptaba silenciosamente saldos repartidos entre almacenes.
    SELECT count(*), (array_agg(s.almacen_id ORDER BY s.almacen_id))[1]
      INTO v_almacenes, v_almacen_id
    FROM (
      SELECT mi.almacen_id
      FROM public.movimientos_inventario mi
      WHERE mi.tenant_id = p_tenant_id
        AND mi.referencia_id = p_pedido_id
        AND mi.producto_id = v_item.producto_id
        AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
      GROUP BY mi.almacen_id
      HAVING sum(CASE
        WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
        ELSE -mi.cantidad END) > 0
    ) s;

    IF v_almacenes > 1 OR (v_almacenes = 1 AND v_almacen_id IS NULL) THEN
      RAISE EXCEPTION 'ORDER_RESERVATION_MULTIWAREHOUSE_UNSUPPORTED: pedido=% producto=% almacenes=%',
        p_pedido_id, v_item.producto_id, v_almacenes;
    END IF;

    SELECT coalesce(sum(CASE
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'LIBERACION' THEN -mi.cantidad
      ELSE 0 END), 0),
      bool_or(upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA')
    INTO v_actual, v_tuvo_reserva
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
      AND mi.producto_id = v_item.producto_id
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION');

    v_exceso := greatest(v_actual - v_item.cantidad, 0);
    IF v_exceso > 0 THEN
      FOR v_saldo IN
        SELECT mi.almacen_id,
               sum(CASE WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                        THEN mi.cantidad ELSE -mi.cantidad END) AS cantidad
        FROM public.movimientos_inventario mi
        WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
          AND mi.producto_id = v_item.producto_id
          AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
        GROUP BY mi.almacen_id
        HAVING sum(CASE WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                        THEN mi.cantidad ELSE -mi.cantidad END) > 0
        ORDER BY mi.almacen_id
      LOOP
        EXIT WHEN v_exceso <= 0;
        v_faltante := least(v_exceso, v_saldo.cantidad);
        v_mov_id := public.aplicar_movimiento_inventario_tx(
          p_tenant_id := p_tenant_id,
          p_producto_id := v_item.producto_id,
          p_almacen_id := v_saldo.almacen_id,
          p_tipo := 'LIBERACION',
          p_cantidad := v_faltante,
          p_referencia_tipo := 'PEDIDO_REPARACION_' || replace(gen_random_uuid()::text, '-', ''),
          p_referencia_id := p_pedido_id,
          p_notas := 'Liberación de exceso al reconciliar pedido',
          p_metadata := jsonb_build_object('atomic_rpc', 'reservar_pedido_stock_tx', 'repair', true)
        );
        v_ajustes := v_ajustes || jsonb_build_object('movimiento_id', v_mov_id, 'tipo', 'LIBERACION',
          'producto_id', v_item.producto_id, 'cantidad', v_faltante);
        v_exceso := v_exceso - v_faltante;
      END LOOP;
      v_actual := v_item.cantidad;
    END IF;

    v_faltante := greatest(v_item.cantidad - v_actual, 0);
    IF v_faltante > 0 THEN
      v_almacen_id := NULL;

      -- Si ya existe saldo, el complemento debe permanecer en ese mismo
      -- almacén. El despacho legacy resuelve el origen desde la reserva PEDIDO
      -- y no puede consumir silenciosamente una reserva repartida.
      IF v_actual > 0 THEN
        SELECT count(*), (array_agg(s.almacen_id ORDER BY s.almacen_id))[1]
          INTO v_almacenes, v_almacen_id
        FROM (
          SELECT mi.almacen_id
          FROM public.movimientos_inventario mi
          WHERE mi.tenant_id = p_tenant_id
            AND mi.referencia_id = p_pedido_id
            AND mi.producto_id = v_item.producto_id
            AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
          GROUP BY mi.almacen_id
          HAVING sum(CASE
            WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
            ELSE -mi.cantidad END) > 0
        ) s;

        IF v_almacenes <> 1 OR v_almacen_id IS NULL THEN
          RAISE EXCEPTION 'ORDER_RESERVATION_MULTIWAREHOUSE_UNSUPPORTED: pedido=% producto=% almacenes=%',
            p_pedido_id, v_item.producto_id, coalesce(v_almacenes, 0);
        END IF;
      ELSIF coalesce(v_tuvo_reserva, false) THEN
        -- Una reserva histórica totalmente liberada conserva el almacén de
        -- origen para que una re-confirmación siga siendo despachable.
        SELECT count(DISTINCT mi.almacen_id),
               (array_agg(DISTINCT mi.almacen_id ORDER BY mi.almacen_id))[1]
          INTO v_almacenes, v_almacen_id
        FROM public.movimientos_inventario mi
        WHERE mi.tenant_id = p_tenant_id
          AND mi.referencia_id = p_pedido_id
          AND mi.producto_id = v_item.producto_id
          AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
          AND mi.almacen_id IS NOT NULL;

        IF v_almacenes <> 1 OR v_almacen_id IS NULL THEN
          RAISE EXCEPTION 'ORDER_RESERVATION_HISTORY_AMBIGUOUS: pedido=% producto=% almacenes=%',
            p_pedido_id, v_item.producto_id, coalesce(v_almacenes, 0);
        END IF;
      END IF;

      IF v_almacen_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.producto_existencias pe
          JOIN public.almacenes a
            ON a.id = pe.almacen_id AND a.tenant_id = pe.tenant_id
          WHERE pe.tenant_id = p_tenant_id
            AND pe.producto_id = v_item.producto_id
            AND pe.almacen_id = v_almacen_id
            AND coalesce(a.activo, true)
            AND (coalesce(pe.stock_actual, 0) - coalesce(pe.stock_reservado, 0)) >= v_faltante
        ) THEN
          RAISE EXCEPTION 'INVENTORY_AVAILABLE_STOCK_INSUFFICIENT_FOR_ORDER_WAREHOUSE: producto=% almacen=% solicitado=%',
            v_item.producto_id, v_almacen_id, v_faltante;
        END IF;
      ELSE
        -- Los pedidos no exponen todavía un almacén de despacho en su cabecera.
        -- En multialmacén se usa el único principal elegible; sin principal sólo
        -- es seguro continuar cuando existe un único candidato con stock.
        SELECT
          count(*),
          count(*) FILTER (WHERE coalesce(a.es_principal, false)),
          (array_agg(pe.almacen_id ORDER BY pe.almacen_id)
            FILTER (WHERE coalesce(a.es_principal, false)))[1],
          (array_agg(pe.almacen_id ORDER BY pe.almacen_id))[1]
        INTO v_almacenes, v_almacenes_principales, v_almacen_principal_id, v_almacen_id
        FROM public.producto_existencias pe
        JOIN public.almacenes a
          ON a.id = pe.almacen_id AND a.tenant_id = pe.tenant_id
        WHERE pe.tenant_id = p_tenant_id
          AND pe.producto_id = v_item.producto_id
          AND coalesce(a.activo, true)
          AND (coalesce(pe.stock_actual, 0) - coalesce(pe.stock_reservado, 0)) >= v_faltante;

        IF v_almacenes_principales = 1 THEN
          v_almacen_id := v_almacen_principal_id;
        ELSIF v_almacenes_principales > 1 THEN
          RAISE EXCEPTION 'INVENTORY_MULTIPLE_PRIMARY_WAREHOUSES: tenant=% producto=%',
            p_tenant_id, v_item.producto_id;
        ELSIF v_almacenes = 0 OR v_almacen_id IS NULL THEN
          RAISE EXCEPTION 'Stock insuficiente para completar reserva del producto %', v_item.producto_id;
        ELSIF v_almacenes > 1 THEN
          RAISE EXCEPTION 'INVENTORY_PRIMARY_WAREHOUSE_REQUIRED_FOR_ORDER: tenant=% producto=% candidatos=%',
            p_tenant_id, v_item.producto_id, v_almacenes;
        END IF;
      END IF;

      IF coalesce(v_tuvo_reserva, false) THEN
        -- Las reparaciones pueden repetirse a lo largo de varias ediciones. Una
        -- referencia única por ajuste evita que el writer idempotente confunda
        -- una cantidad nueva con un movimiento anterior ya aplicado.
        v_referencia_ajuste := 'PEDIDO_AJUSTE_' || replace(gen_random_uuid()::text, '-', '');
        v_mov_id := public.reservar_stock_en_almacen_tx(
          p_tenant_id := p_tenant_id,
          p_producto_id := v_item.producto_id,
          p_almacen_id := v_almacen_id,
          p_cantidad := v_faltante,
          p_referencia_tipo := v_referencia_ajuste,
          p_referencia_id := p_pedido_id::text,
          p_notas := 'Complemento atómico de reserva para pedido ' || coalesce(v_numero, ''),
          p_metadata := jsonb_build_object('atomic_rpc', 'reservar_pedido_stock_tx', 'repair', true)
        );
        v_ajustes := v_ajustes || jsonb_build_object('movimiento_id', v_mov_id, 'tipo', 'RESERVA',
          'producto_id', v_item.producto_id, 'almacen_id', v_almacen_id, 'cantidad', v_faltante);
      ELSE
        v_mov_id := public.reservar_stock_en_almacen_tx(
          p_tenant_id := p_tenant_id,
          p_producto_id := v_item.producto_id,
          p_almacen_id := v_almacen_id,
          p_cantidad := v_faltante,
          p_referencia_tipo := 'PEDIDO',
          p_referencia_id := p_pedido_id::text,
          p_notas := 'Reserva atómica para pedido ' || coalesce(v_numero, ''),
          p_metadata := jsonb_build_object('atomic_rpc', 'reservar_pedido_stock_tx', 'warehouse_resolution', 'principal_or_unique')
        );
        v_movimientos := v_movimientos || jsonb_build_object(
          'movimiento_id', v_mov_id, 'producto_id', v_item.producto_id,
          'almacen_id', v_almacen_id, 'cantidad', v_faltante
        );
      END IF;
    END IF;
  END LOOP;

  WITH esperados AS (
    SELECT d.producto_id, sum(d.cantidad) AS cantidad
    FROM public.pedidos_venta_detalle d
    JOIN public.productos p
      ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
    WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
      AND NOT coalesce(p.es_servicio, false)
      AND coalesce(p.controla_stock, true)
    GROUP BY d.producto_id
  ), saldos AS (
    SELECT mi.producto_id, sum(CASE
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'LIBERACION' THEN -mi.cantidad
      ELSE 0 END) AS cantidad
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
    GROUP BY mi.producto_id
    HAVING sum(CASE
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA' THEN mi.cantidad
      WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'LIBERACION' THEN -mi.cantidad
      ELSE 0 END) <> 0
  ), diferencias AS (
    (SELECT * FROM esperados EXCEPT SELECT * FROM saldos)
    UNION ALL (SELECT * FROM saldos EXCEPT SELECT * FROM esperados)
  )
  SELECT count(*) INTO v_inconsistencias FROM diferencias;
  IF v_inconsistencias > 0 THEN
    RAISE EXCEPTION 'La reserva final no coincide con el detalle del pedido';
  END IF;

  RETURN jsonb_build_object(
    'skipped', jsonb_array_length(v_movimientos) = 0 AND jsonb_array_length(v_ajustes) = 0,
    'movimientos', v_movimientos,
    'ajustes_reparacion', v_ajustes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_reservas_pedido_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_referencia_tipo text DEFAULT 'PEDIDO_CANCELACION',
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_saldo record;
  v_movimiento_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
BEGIN
  PERFORM 1 FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  FOR v_saldo IN
    SELECT mi.producto_id, mi.almacen_id,
           sum(CASE WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                    THEN mi.cantidad ELSE -mi.cantidad END) AS cantidad
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = p_pedido_id
      AND upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) IN ('RESERVA', 'LIBERACION')
    GROUP BY mi.producto_id, mi.almacen_id
    HAVING sum(CASE WHEN upper(coalesce(mi.tipo, mi.tipo_movimiento, '')) = 'RESERVA'
                    THEN mi.cantidad ELSE -mi.cantidad END) > 0
    ORDER BY mi.producto_id, mi.almacen_id
  LOOP
    v_movimiento_id := public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_saldo.producto_id,
      p_almacen_id := v_saldo.almacen_id,
      p_tipo := 'LIBERACION',
      p_cantidad := v_saldo.cantidad,
      p_referencia_tipo := upper(coalesce(nullif(btrim(p_referencia_tipo), ''), 'PEDIDO_CANCELACION'))
        || '_' || replace(gen_random_uuid()::text, '-', ''),
      p_referencia_id := p_pedido_id,
      p_notas := p_notas,
      p_metadata := jsonb_build_object('atomic_rpc', 'liberar_reservas_pedido_tx', 'net_balance_441', true)
    );
    v_movimientos := v_movimientos || jsonb_build_object(
      'movimiento_id', v_movimiento_id, 'producto_id', v_saldo.producto_id,
      'almacen_id', v_saldo.almacen_id, 'cantidad', v_saldo.cantidad
    );
  END LOOP;
  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'movimientos', v_movimientos);
END;
$$;

DROP FUNCTION IF EXISTS public.confirmar_pedido_tx(
  uuid, uuid, text, text, boolean, boolean, uuid, text
);
DROP FUNCTION IF EXISTS public.confirmar_pedido_tx(
  uuid, uuid, text, text, boolean, boolean, uuid, text, text
);

CREATE OR REPLACE FUNCTION public.confirmar_pedido_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_estado_credito text,
  p_estado_destino text DEFAULT 'CONFIRMADO',
  p_forzado boolean DEFAULT false,
  p_requiere_aprobacion boolean DEFAULT false,
  p_aprobado_por uuid DEFAULT NULL,
  p_motivos text DEFAULT NULL,
  p_expected_fingerprint text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta;
  v_reserva jsonb;
  v_destino text;
  v_politica jsonb;
  v_estado_credito text;
  v_requiere_aprobacion boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_pedido
  FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El confirmador no pertenece al tenant o está inactivo';
  END IF;
  IF upper(v_pedido.estado::text) IN ('CONFIRMADO', 'LISTO_FACTURAR')
     AND p_expected_fingerprint IS NOT NULL
     AND v_pedido.metadata->>'confirmation_fingerprint' = p_expected_fingerprint
     AND jsonb_typeof(v_pedido.metadata->'confirmation_result') = 'object' THEN
    RETURN (v_pedido.metadata->'confirmation_result') || jsonb_build_object('idempotent', true);
  END IF;
  IF upper(v_pedido.estado::text) <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'No se puede confirmar un pedido en estado %', v_pedido.estado;
  END IF;
  IF p_forzado THEN
    RAISE EXCEPTION 'La confirmación forzada fue retirada; use el flujo de aprobación segregado';
  END IF;
  IF p_expected_fingerprint IS NULL
     OR p_expected_fingerprint IS DISTINCT FROM
        app.pedido_venta_fingerprint_441(p_pedido_id, p_tenant_id) THEN
    RAISE EXCEPTION 'ORDER_CHANGED_RETRY: el pedido cambió después de evaluar sus políticas';
  END IF;

  -- Congela durante la reevaluación las proyecciones externas que alimentan
  -- crédito. El lock SHARE espera writers previos y bloquea INSERT/UPDATE hasta
  -- terminar; la siguiente sentencia ve su commit bajo READ COMMITTED.
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.cuentas_por_cobrar IN SHARE MODE;
  PERFORM 1 FROM public.empresa_config
  WHERE tenant_id = p_tenant_id FOR SHARE;
  PERFORM 1 FROM public.clientes
  WHERE id = v_pedido.cliente_id AND tenant_id = p_tenant_id FOR SHARE;

  -- La política se deriva otra vez dentro de la misma sentencia que bloquea el
  -- pedido. Los flags/textos del caller son sólo compatibilidad y no otorgan
  -- autoridad para saltar crédito o aprobación.
  v_politica := public.evaluar_politica_pedido_441(p_pedido_id, p_tenant_id);
  v_estado_credito := upper(coalesce(v_politica->>'estado_credito', 'OK'));
  v_requiere_aprobacion := coalesce((v_politica->>'requiere_aprobacion')::boolean, false);
  v_destino := CASE
    WHEN coalesce((v_politica->>'usar_flujo_logistica')::boolean, false)
      THEN 'CONFIRMADO'
    ELSE 'LISTO_FACTURAR'
  END;

  IF v_estado_credito = 'BLOQUEADO' THEN
    RAISE EXCEPTION 'El pedido tiene crédito bloqueado: %',
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_politica->'motivos')), '; ');
  END IF;
  IF v_requiere_aprobacion
     AND NOT public.pedido_tiene_aprobacion_vigente(p_pedido_id, p_tenant_id) THEN
    RAISE EXCEPTION 'El pedido requiere una aprobación vigente para su contenido actual';
  END IF;
  IF v_requiere_aprobacion THEN
    -- La política puede diagnosticar REVISION, pero una decisión segregada y
    -- vigente ya resolvió esa revisión. Persistir REVISION después de aprobar
    -- hacía que API y UI discreparan al refrescar el pedido.
    v_estado_credito := 'APROBADO';
  END IF;
  IF p_estado_destino IS NOT NULL
     AND upper(nullif(btrim(p_estado_destino), '')) IS DISTINCT FROM v_destino THEN
    RAISE EXCEPTION 'Estado destino no coincide con la configuración vigente: esperado %', v_destino;
  END IF;

  v_reserva := public.reservar_pedido_stock_tx(p_pedido_id, p_tenant_id);

  v_result := jsonb_build_object(
    'pedido_id', p_pedido_id,
    'estado', v_destino,
    'estado_credito', v_estado_credito,
    'reserva', v_reserva,
    'movimientos', coalesce(v_reserva->'movimientos', '[]'::jsonb),
    'idempotent', false
  );

  UPDATE public.pedidos_venta
  SET estado = v_destino,
      requiere_aprobacion = false,
      motivo_requiere_aprobacion = NULL,
      estado_credito = v_estado_credito,
      confirmado_por = p_actor_id,
      confirmado_en = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'confirmation_fingerprint', p_expected_fingerprint,
        'confirmation_fingerprint_version', 2,
        'confirmation_result', v_result
      ),
      updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_pedido_completo(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pedido_completo(jsonb, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION app.pedido_venta_fingerprint_441(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.pedido_tiene_aprobacion_vigente(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_tiene_aprobacion_vigente(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.evaluar_politica_pedido_441(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluar_politica_pedido_441(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.actualizar_pedido_venta_tx(uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_pedido_venta_tx(uuid, uuid, jsonb, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.solicitar_aprobacion_pedido_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_aprobacion_pedido_tx(uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.decidir_aprobacion_pedido_tx(uuid, uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decidir_aprobacion_pedido_tx(uuid, uuid, text, text, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_stock_tx(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.liberar_reservas_pedido_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reservas_pedido_tx(uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.confirmar_pedido_tx(
  uuid, uuid, text, text, boolean, boolean, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pedido_tx(
  uuid, uuid, text, text, boolean, boolean, uuid, text, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION app.enforce_pedido_aprobacion_441()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.confirmar_pedido_tx(uuid, uuid, text, text, boolean, boolean, uuid, text, text, uuid) IS
  'Confirma un pedido y reserva todo el stock en una sola transacción. Si la política exige aprobación, valida una decisión segregada vigente para el contenido actual. No genera ingreso contable: ese nace con la factura/CPE.';

COMMIT;
