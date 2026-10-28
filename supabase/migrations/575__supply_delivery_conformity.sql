-- ============================================================================
-- 575__supply_delivery_conformity.sql
-- F03 ALKHOFAR: recepción y conformidad del cliente sobre los despachos.
--
-- Cadena trazable: contrato → OC → programación → pedido vinculado (572) →
-- despacho parcial (442) → movimiento y lotes (574) → recepción del cliente.
-- Marcar el tracking como entregado no acredita aceptación: sólo una recepción
-- registrada con cantidades aceptadas lo hace. Lo rechazado vuelve a quedar
-- pendiente y libera saldo de la programación para reponerlo. La devolución
-- física del rechazo sigue el flujo RMA existente.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.suministro_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  pedido_id uuid NOT NULL REFERENCES public.pedidos_venta(id),
  numero integer NOT NULL CHECK (numero > 0),
  fecha_recepcion date NOT NULL,
  receptor_nombre text NOT NULL CHECK (length(btrim(receptor_nombre)) BETWEEN 3 AND 160),
  receptor_documento text CHECK (receptor_documento IS NULL OR length(receptor_documento) BETWEEN 1 AND 20),
  receptor_cargo text CHECK (receptor_cargo IS NULL OR length(receptor_cargo) BETWEEN 1 AND 120),
  guia_referencia text CHECK (guia_referencia IS NULL OR length(guia_referencia) BETWEEN 1 AND 60),
  pecosa_numero text CHECK (pecosa_numero IS NULL OR length(pecosa_numero) BETWEEN 1 AND 60),
  conformidad_numero text CHECK (conformidad_numero IS NULL OR length(conformidad_numero) BETWEEN 1 AND 60),
  incidencias text CHECK (incidencias IS NULL OR length(incidencias) <= 2000),
  estado text NOT NULL DEFAULT 'REGISTRADA' CHECK (estado IN ('REGISTRADA', 'ANULADA')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  motivo_anulacion text CHECK (motivo_anulacion IS NULL OR length(motivo_anulacion) BETWEEN 5 AND 1000),
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id),
  UNIQUE (tenant_id, contrato_id, numero),
  UNIQUE (tenant_id, contrato_id, id),
  CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL))
);
CREATE INDEX suministro_recepciones_pedido_575 ON public.suministro_recepciones (tenant_id, pedido_id);

CREATE TABLE public.suministro_recepcion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  recepcion_id uuid NOT NULL,
  despacho_id uuid NOT NULL REFERENCES public.pedido_despachos(id),
  entrega_id uuid NOT NULL REFERENCES public.suministro_entregas_programadas(id),
  pedido_detalle_id uuid NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  lote_id uuid REFERENCES public.inventario_lotes(id),
  cantidad_recibida numeric(18,4) NOT NULL CHECK (cantidad_recibida > 0),
  cantidad_aceptada numeric(18,4) NOT NULL CHECK (cantidad_aceptada >= 0),
  cantidad_rechazada numeric(18,4) NOT NULL CHECK (cantidad_rechazada >= 0),
  motivo_rechazo text CHECK (motivo_rechazo IS NULL OR length(motivo_rechazo) BETWEEN 5 AND 1000),
  CHECK (cantidad_aceptada + cantidad_rechazada = cantidad_recibida),
  CHECK ((cantidad_rechazada > 0) = (motivo_rechazo IS NOT NULL)),
  FOREIGN KEY (tenant_id, contrato_id, recepcion_id)
    REFERENCES public.suministro_recepciones(tenant_id, contrato_id, id)
);
CREATE UNIQUE INDEX suministro_recepcion_linea_unica_575 ON public.suministro_recepcion_lineas (
  recepcion_id, despacho_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX suministro_recepcion_lineas_despacho_575 ON public.suministro_recepcion_lineas (despacho_id);
CREATE INDEX suministro_recepcion_lineas_entrega_575 ON public.suministro_recepcion_lineas (tenant_id, entrega_id);

DO $secure$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['suministro_recepciones', 'suministro_recepcion_lineas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY suministro_private_575 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

-- Lo rechazado por el cliente deja de contar como asignado: la programación
-- admite vincular un pedido de reposición por esa cantidad.
CREATE OR REPLACE FUNCTION app.suministro_asignado_572(t uuid, e uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  SELECT coalesce((
    SELECT sum(l.cantidad) FROM public.suministro_pedido_lineas l
    JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id
    JOIN public.pedidos_venta p ON p.id = v.pedido_id AND p.tenant_id = v.tenant_id
    WHERE l.tenant_id = t AND l.entrega_id = e AND v.estado = 'VINCULADO' AND upper(p.estado) <> 'CANCELADO'
  ), 0) - coalesce((
    SELECT sum(rl.cantidad_rechazada) FROM public.suministro_recepcion_lineas rl
    JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id
    JOIN public.pedidos_venta p ON p.id = r.pedido_id AND p.tenant_id = r.tenant_id
    WHERE rl.tenant_id = t AND rl.entrega_id = e AND r.estado = 'REGISTRADA' AND upper(p.estado) <> 'CANCELADO'
      AND EXISTS (SELECT 1 FROM public.suministro_pedidos v WHERE v.tenant_id = t AND v.pedido_id = p.id AND v.estado = 'VINCULADO')
  ), 0);
$fn$;

-- Cantidad despachada de un despacho para un lote (NULL = producto sin lote).
CREATE FUNCTION app.suministro_despacho_lote_575(t uuid, d uuid, lote uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  WITH ds AS (
    SELECT pd.cantidad, app.to_uuid_or_null(pd.metadata->>'movimiento_id') AS mov
    FROM public.pedido_despachos pd WHERE pd.tenant_id = t AND pd.id = d
  ), lotes AS (
    SELECT ml.lote_id, sum(ml.cantidad) AS cantidad
    FROM ds JOIN public.movimientos_inventario_lotes ml
      ON ml.tenant_id = t AND ml.movimiento_id = ds.mov AND ml.tipo = 'SALIDA'
    GROUP BY ml.lote_id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM lotes) THEN coalesce((SELECT cantidad FROM lotes WHERE lotes.lote_id = lote), 0)
    WHEN lote IS NULL THEN coalesce((SELECT cantidad FROM ds), 0)
    ELSE 0 END
$fn$;

CREATE FUNCTION app.suministro_ejecucion_575(p_tenant_id uuid, p_contrato_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  WITH vinculos AS (
    SELECT l.entrega_id, l.pedido_detalle_id, v.pedido_id
    FROM public.suministro_pedido_lineas l
    JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id
    WHERE l.tenant_id = p_tenant_id AND l.contrato_id = p_contrato_id AND v.estado = 'VINCULADO'
  ), despachos AS (
    SELECT pd.id, pd.pedido_id, pd.detalle_id, pd.producto_id, pd.cantidad, pd.registrado_en,
      app.to_uuid_or_null(pd.metadata->>'movimiento_id') AS movimiento_id, k.entrega_id
    FROM public.pedido_despachos pd
    JOIN vinculos k ON k.pedido_id = pd.pedido_id AND k.pedido_detalle_id = pd.detalle_id
    WHERE pd.tenant_id = p_tenant_id AND upper(coalesce(pd.estado, 'REGISTRADO')) <> 'ANULADO'
  ), recibido AS (
    SELECT rl.despacho_id, rl.lote_id, rl.entrega_id, rl.cantidad_recibida, rl.cantidad_aceptada, rl.cantidad_rechazada
    FROM public.suministro_recepcion_lineas rl
    JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id
    WHERE rl.tenant_id = p_tenant_id AND rl.contrato_id = p_contrato_id AND r.estado = 'REGISTRADA'
  )
  SELECT jsonb_build_object(
    'programaciones', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'fecha_programada', x->>'entrega_id') FROM (
        SELECT jsonb_build_object(
          'entrega_id', e.id, 'estado', e.estado, 'fecha_original', e.fecha_original,
          'fecha_programada', e.fecha_programada, 'destino', e.destino, 'cantidad_programada', e.cantidad,
          'oc_numero', o.numero, 'producto_id', cl.producto_id, 'codigo_producto', cl.codigo_producto,
          'descripcion', cl.descripcion, 'unidad_medida', cl.unidad_medida,
          'cantidad_despachada', coalesce((SELECT sum(d.cantidad) FROM despachos d WHERE d.entrega_id = e.id), 0),
          'cantidad_recibida', coalesce((SELECT sum(r.cantidad_recibida) FROM recibido r WHERE r.entrega_id = e.id), 0),
          'cantidad_aceptada', coalesce((SELECT sum(r.cantidad_aceptada) FROM recibido r WHERE r.entrega_id = e.id), 0),
          'cantidad_rechazada', coalesce((SELECT sum(r.cantidad_rechazada) FROM recibido r WHERE r.entrega_id = e.id), 0)
        ) AS x
        FROM public.suministro_entregas_programadas e
        JOIN public.suministro_orden_lineas ol ON ol.id = e.orden_linea_id AND ol.tenant_id = e.tenant_id
        JOIN public.suministro_ordenes_cliente o ON o.id = ol.orden_cliente_id AND o.tenant_id = ol.tenant_id
        JOIN public.suministro_contrato_lineas cl ON cl.id = ol.contrato_linea_id AND cl.tenant_id = ol.tenant_id
        WHERE e.tenant_id = p_tenant_id AND e.contrato_id = p_contrato_id
      ) s), '[]'::jsonb),
    'despachos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'despacho_id', d.id, 'pedido_id', d.pedido_id, 'pedido_numero', pv.numero, 'entrega_id', d.entrega_id,
        'pedido_detalle_id', d.detalle_id, 'producto_id', d.producto_id, 'producto_nombre', pr.nombre,
        'producto_codigo', pr.codigo, 'fecha_despacho', d.registrado_en, 'cantidad', d.cantidad,
        'cantidad_recibida', coalesce((SELECT sum(r.cantidad_recibida) FROM recibido r WHERE r.despacho_id = d.id), 0),
        'lotes', CASE WHEN EXISTS (
            SELECT 1 FROM public.movimientos_inventario_lotes ml
            WHERE ml.tenant_id = p_tenant_id AND ml.movimiento_id = d.movimiento_id AND ml.tipo = 'SALIDA')
          THEN (SELECT jsonb_agg(jsonb_build_object('lote_id', z.lote_id, 'lote', il.codigo,
              'fecha_vencimiento', il.fecha_vencimiento, 'cantidad', z.cantidad,
              'cantidad_recibida', coalesce((SELECT sum(r.cantidad_recibida) FROM recibido r
                WHERE r.despacho_id = d.id AND r.lote_id = z.lote_id), 0)) ORDER BY il.fecha_vencimiento NULLS LAST, il.codigo)
            FROM (SELECT ml.lote_id, sum(ml.cantidad) AS cantidad FROM public.movimientos_inventario_lotes ml
              WHERE ml.tenant_id = p_tenant_id AND ml.movimiento_id = d.movimiento_id AND ml.tipo = 'SALIDA'
              GROUP BY ml.lote_id) z
            JOIN public.inventario_lotes il ON il.id = z.lote_id AND il.tenant_id = p_tenant_id)
          ELSE jsonb_build_array(jsonb_build_object('lote_id', NULL, 'lote', NULL, 'fecha_vencimiento', NULL,
            'cantidad', d.cantidad, 'cantidad_recibida', coalesce((SELECT sum(r.cantidad_recibida) FROM recibido r
              WHERE r.despacho_id = d.id AND r.lote_id IS NULL), 0))) END
      ) ORDER BY d.registrado_en, d.id)
      FROM despachos d
      JOIN public.pedidos_venta pv ON pv.id = d.pedido_id AND pv.tenant_id = p_tenant_id
      JOIN public.productos pr ON pr.id = d.producto_id AND pr.tenant_id = p_tenant_id), '[]'::jsonb),
    'recepciones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'numero', r.numero, 'pedido_id', r.pedido_id, 'pedido_numero', pv.numero,
        'fecha_recepcion', r.fecha_recepcion, 'receptor_nombre', r.receptor_nombre,
        'receptor_documento', r.receptor_documento, 'receptor_cargo', r.receptor_cargo,
        'guia_referencia', r.guia_referencia, 'pecosa_numero', r.pecosa_numero,
        'conformidad_numero', r.conformidad_numero, 'incidencias', r.incidencias, 'estado', r.estado,
        'version', r.version, 'motivo_anulacion', r.motivo_anulacion, 'created_at', r.created_at,
        'actor_nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u
          WHERE u.id = r.created_by AND u.tenant_id = r.tenant_id),
        'lineas', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'despacho_id', rl.despacho_id, 'entrega_id', rl.entrega_id, 'producto_id', rl.producto_id,
            'producto_nombre', pr.nombre, 'lote_id', rl.lote_id, 'lote', il.codigo,
            'cantidad_recibida', rl.cantidad_recibida, 'cantidad_aceptada', rl.cantidad_aceptada,
            'cantidad_rechazada', rl.cantidad_rechazada, 'motivo_rechazo', rl.motivo_rechazo) ORDER BY pr.nombre, il.codigo)
          FROM public.suministro_recepcion_lineas rl
          JOIN public.productos pr ON pr.id = rl.producto_id AND pr.tenant_id = rl.tenant_id
          LEFT JOIN public.inventario_lotes il ON il.id = rl.lote_id AND il.tenant_id = rl.tenant_id
          WHERE rl.recepcion_id = r.id AND rl.tenant_id = r.tenant_id), '[]'::jsonb)
      ) ORDER BY r.numero)
      FROM public.suministro_recepciones r
      JOIN public.pedidos_venta pv ON pv.id = r.pedido_id AND pv.tenant_id = r.tenant_id
      WHERE r.tenant_id = p_tenant_id AND r.contrato_id = p_contrato_id), '[]'::jsonb)
  )
$fn$;

CREATE FUNCTION public.consultar_suministro_ejecucion_575(p_tenant_id uuid, p_actor_id uuid, p_contrato_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'ventas.contratos.ver');
  IF NOT EXISTS (SELECT 1 FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id) THEN
    RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN app.suministro_ejecucion_575(p_tenant_id, p_contrato_id);
END $fn$;

CREATE FUNCTION public.operar_suministro_recepciones_575(
  p_tenant_id uuid, p_actor_id uuid, p_contrato_id uuid, p_accion text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_op public.suministro_operaciones;
  v_c public.suministro_contratos;
  v_r public.suministro_recepciones;
  v_d public.pedido_despachos;
  v_item jsonb;
  v_entrega uuid;
  v_lote uuid;
  v_recibida numeric; v_aceptada numeric; v_rechazada numeric;
  v_tope numeric; v_previo numeric;
  v_fecha date;
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_old jsonb; v_new jsonb; v_result jsonb;
  v_motivo text := nullif(btrim(p_payload->>'motivo'), '');
  v_pedido uuid;
  v_vistos text[] := ARRAY[]::text[];
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'ventas.contratos.conformar');
  IF length(v_key) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_accion IS NULL OR p_accion NOT IN ('REGISTRAR_RECEPCION', 'ANULAR_RECEPCION') THEN
    RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion', p_accion, 'contrato', p_contrato_id,
    'payload', p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  -- Serializa por contrato, igual que las demás escrituras de suministro.
  SELECT * INTO v_c FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF p_accion = 'REGISTRAR_RECEPCION' THEN
    v_pedido := app.to_uuid_or_null(p_payload->>'pedido_id');
    IF NOT EXISTS (SELECT 1 FROM public.suministro_pedidos v WHERE v.tenant_id = p_tenant_id
        AND v.contrato_id = v_c.id AND v.pedido_id = v_pedido AND v.estado = 'VINCULADO') THEN
      RAISE EXCEPTION 'SUPPLY_RECEPTION_ORDER_NOT_LINKED' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM public.pedidos_venta p WHERE p.tenant_id = p_tenant_id AND p.id = v_pedido FOR SHARE;
    v_fecha := nullif(p_payload->>'fecha_recepcion', '')::date;
    IF v_fecha IS NULL OR v_fecha > v_hoy THEN
      RAISE EXCEPTION 'SUPPLY_RECEPTION_DATE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF length(btrim(coalesce(p_payload->>'receptor_nombre', ''))) NOT BETWEEN 3 AND 160 THEN
      RAISE EXCEPTION 'SUPPLY_RECEPTION_RECEIVER_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.suministro_recepciones (tenant_id, contrato_id, pedido_id, numero, fecha_recepcion,
      receptor_nombre, receptor_documento, receptor_cargo, guia_referencia, pecosa_numero, conformidad_numero,
      incidencias, created_by)
    VALUES (p_tenant_id, v_c.id, v_pedido,
      coalesce((SELECT max(numero) FROM public.suministro_recepciones WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id), 0) + 1,
      v_fecha, btrim(p_payload->>'receptor_nombre'),
      nullif(btrim(p_payload->>'receptor_documento'), ''), nullif(btrim(p_payload->>'receptor_cargo'), ''),
      nullif(upper(btrim(p_payload->>'guia_referencia')), ''), nullif(upper(btrim(p_payload->>'pecosa_numero')), ''),
      nullif(upper(btrim(p_payload->>'conformidad_numero')), ''), nullif(btrim(p_payload->>'incidencias'), ''),
      p_actor_id)
    RETURNING * INTO v_r;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
      SELECT * INTO v_d FROM public.pedido_despachos pd
      WHERE pd.tenant_id = p_tenant_id AND pd.id = app.to_uuid_or_null(v_item->>'despacho_id') AND pd.pedido_id = v_pedido
      FOR UPDATE;
      IF NOT FOUND OR upper(coalesce(v_d.estado, 'REGISTRADO')) = 'ANULADO' THEN
        RAISE EXCEPTION 'SUPPLY_RECEPTION_DISPATCH_INVALID' USING ERRCODE = '23514';
      END IF;
      SELECT l.entrega_id INTO v_entrega FROM public.suministro_pedido_lineas l
      JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id
      WHERE l.tenant_id = p_tenant_id AND l.contrato_id = v_c.id AND v.pedido_id = v_pedido
        AND v.estado = 'VINCULADO' AND l.pedido_detalle_id = v_d.detalle_id;
      IF v_entrega IS NULL THEN RAISE EXCEPTION 'SUPPLY_RECEPTION_DISPATCH_INVALID' USING ERRCODE = '23514'; END IF;
      v_lote := app.to_uuid_or_null(v_item->>'lote_id');
      IF (v_item->>'lote_id') IS NOT NULL AND v_lote IS NULL THEN
        RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE = '22023';
      END IF;
      IF (v_d.id::text || ':' || coalesce(v_lote::text, '')) = ANY (v_vistos) THEN
        RAISE EXCEPTION 'SUPPLY_RECEPTION_LINE_REPEATED' USING ERRCODE = '23514';
      END IF;
      v_vistos := v_vistos || (v_d.id::text || ':' || coalesce(v_lote::text, ''));
      v_recibida := nullif(v_item->>'cantidad_recibida', '')::numeric;
      v_aceptada := nullif(v_item->>'cantidad_aceptada', '')::numeric;
      v_rechazada := coalesce(nullif(v_item->>'cantidad_rechazada', '')::numeric, 0);
      IF v_recibida IS NULL OR v_aceptada IS NULL OR v_recibida <= 0 OR v_aceptada < 0 OR v_rechazada < 0
         OR v_recibida <> round(v_recibida, 4) OR v_aceptada <> round(v_aceptada, 4) OR v_rechazada <> round(v_rechazada, 4)
         OR v_aceptada + v_rechazada <> v_recibida THEN
        RAISE EXCEPTION 'SUPPLY_RECEPTION_QUANTITY_INVALID' USING ERRCODE = '23514';
      END IF;
      IF (v_rechazada > 0) <> (length(btrim(coalesce(v_item->>'motivo_rechazo', ''))) BETWEEN 5 AND 1000) THEN
        RAISE EXCEPTION 'SUPPLY_RECEPTION_REJECTION_REASON' USING ERRCODE = '22023';
      END IF;
      IF v_fecha < (v_d.registrado_en AT TIME ZONE app.zona_horaria_pais(
          (SELECT t.pais FROM public.tenants t WHERE t.id = p_tenant_id)))::date THEN
        RAISE EXCEPTION 'SUPPLY_RECEPTION_DATE_INVALID' USING ERRCODE = '23514';
      END IF;
      v_tope := app.suministro_despacho_lote_575(p_tenant_id, v_d.id, v_lote);
      SELECT coalesce(sum(rl.cantidad_recibida), 0) INTO v_previo
      FROM public.suministro_recepcion_lineas rl
      JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id
      WHERE rl.tenant_id = p_tenant_id AND rl.despacho_id = v_d.id AND r.estado = 'REGISTRADA'
        AND rl.lote_id IS NOT DISTINCT FROM v_lote;
      IF v_tope <= 0 OR v_previo + v_recibida > v_tope THEN
        RAISE EXCEPTION 'SUPPLY_RECEPTION_EXCEEDS_DISPATCH: despachado=% recibido=% solicitado=%',
          v_tope, v_previo, v_recibida USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.suministro_recepcion_lineas (tenant_id, contrato_id, recepcion_id, despacho_id, entrega_id,
        pedido_detalle_id, producto_id, lote_id, cantidad_recibida, cantidad_aceptada, cantidad_rechazada, motivo_rechazo)
      VALUES (p_tenant_id, v_c.id, v_r.id, v_d.id, v_entrega, v_d.detalle_id, v_d.producto_id, v_lote,
        v_recibida, v_aceptada, v_rechazada, nullif(btrim(v_item->>'motivo_rechazo'), ''));
    END LOOP;
    v_old := NULL;
    v_new := to_jsonb(v_r) || jsonb_build_object('lineas', p_payload->'lineas');
  ELSE
    SELECT * INTO v_r FROM public.suministro_recepciones
    WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id AND id = app.to_uuid_or_null(p_payload->>'recepcion_id') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_r.estado <> 'REGISTRADA' OR v_r.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
      RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF coalesce(length(v_motivo), 0) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
    v_old := to_jsonb(v_r);
    UPDATE public.suministro_recepciones SET estado = 'ANULADA', motivo_anulacion = v_motivo,
      version = version + 1, updated_at = now() WHERE id = v_r.id RETURNING * INTO v_r;
    -- Si la recepción liberó saldo por rechazo, ese saldo no puede estar ya
    -- tomado por un pedido de reposición.
    IF EXISTS (
      SELECT 1 FROM public.suministro_recepcion_lineas rl
      JOIN public.suministro_entregas_programadas e ON e.id = rl.entrega_id AND e.tenant_id = rl.tenant_id
      WHERE rl.recepcion_id = v_r.id AND rl.cantidad_rechazada > 0
        AND app.suministro_asignado_572(p_tenant_id, e.id) > e.cantidad
    ) THEN
      RAISE EXCEPTION 'SUPPLY_RECEPTION_REJECTION_REPLACED' USING ERRCODE = '23514';
    END IF;
    v_new := to_jsonb(v_r);
  END IF;

  INSERT INTO public.suministro_historial (tenant_id, contrato_id, recurso_id, accion, anterior, actual, motivo, actor_id)
  VALUES (p_tenant_id, v_c.id, v_r.id, p_accion, v_old, v_new, v_motivo, p_actor_id);
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, old_values, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'suministro_recepciones', CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_r.id::text, v_old, v_new, jsonb_build_object('source', 'operar_suministro_recepciones_575', 'accion', p_accion,
      'contrato_id', v_c.id, 'idempotency_key', v_key));
  v_result := jsonb_build_object('id', v_r.id, 'contrato_id', v_c.id, 'accion', p_accion, 'numero', v_r.numero,
    'idempotent', false);
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

-- Una entrega con aceptación del cliente no se revierte cancelando el pedido:
-- la vuelta de mercadería aceptada es una devolución (RMA).
CREATE FUNCTION app.proteger_despacho_conforme_575() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  IF upper(coalesce(NEW.estado, '')) = 'ANULADO' AND upper(coalesce(OLD.estado, '')) <> 'ANULADO' AND EXISTS (
    SELECT 1 FROM public.suministro_recepcion_lineas rl
    JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id
    WHERE rl.despacho_id = NEW.id AND r.estado = 'REGISTRADA' AND rl.cantidad_aceptada > 0
  ) THEN
    RAISE EXCEPTION 'SUPPLY_DELIVERY_ACCEPTED_BY_CUSTOMER' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER proteger_despacho_conforme_575 BEFORE UPDATE OF estado ON public.pedido_despachos
FOR EACH ROW EXECUTE FUNCTION app.proteger_despacho_conforme_575();

-- Adjuntos: guía, PECOSA y conformidad firmada se asocian a la recepción.
ALTER TABLE public.suministro_adjuntos DROP CONSTRAINT suministro_adjuntos_recurso_tipo_check;
ALTER TABLE public.suministro_adjuntos ADD CONSTRAINT suministro_adjuntos_recurso_tipo_check
  CHECK (recurso_tipo IN ('CONTRATO', 'OC', 'ADENDA', 'RECEPCION'));

CREATE FUNCTION app.suministro_puede_575(t uuid, a uuid, codigo text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  PERFORM app.assert_actor_permission_466(t, a, codigo);
  RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION public.reservar_suministro_adjunto_573(p_tenant_id uuid,p_actor_id uuid,p_contrato_id uuid,p_payload jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE a public.suministro_adjuntos; c public.suministro_contratos; k text:=btrim(coalesce(p_idempotency_key,'')); rid uuid;
BEGIN
 -- 575: quien registra conformidades puede adjuntar sus documentos.
 IF p_payload->>'recurso_tipo'='RECEPCION' AND app.suministro_puede_575(p_tenant_id,p_actor_id,'ventas.contratos.conformar') THEN
  NULL;
 ELSE
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 END IF;
 IF length(k) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':suministro-adjunto:'||k,573));
 SELECT * INTO a FROM public.suministro_adjuntos WHERE tenant_id=p_tenant_id AND idempotency_key=k;
 IF FOUND THEN
  IF a.actor_id IS DISTINCT FROM p_actor_id OR a.contrato_id IS DISTINCT FROM p_contrato_id
    OR (a.nombre,a.mime,a.bytes,a.sha256,a.recurso_tipo,a.recurso_id) IS DISTINCT FROM
     (p_payload->>'nombre',p_payload->>'mime',(p_payload->>'bytes')::integer,p_payload->>'sha256',p_payload->>'recurso_tipo',(p_payload->>'recurso_id')::uuid) THEN
   RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF a.estado='RETIRADO' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(a);
 END IF;
 SELECT * INTO c FROM public.suministro_contratos WHERE tenant_id=p_tenant_id AND id=p_contrato_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 rid:=(p_payload->>'recurso_id')::uuid;
 IF NOT ((p_payload->>'recurso_tipo'='CONTRATO' AND rid=c.id)
  OR (p_payload->>'recurso_tipo'='OC' AND EXISTS(SELECT 1 FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND id=rid))
  OR (p_payload->>'recurso_tipo'='ADENDA' AND EXISTS(SELECT 1 FROM public.suministro_historial WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND id=rid AND accion='ADENDAR'))
  OR (p_payload->>'recurso_tipo'='RECEPCION' AND EXISTS(SELECT 1 FROM public.suministro_recepciones WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND id=rid AND estado='REGISTRADA'))) THEN
  RAISE EXCEPTION 'SUPPLY_ATTACHMENT_TARGET_INVALID' USING ERRCODE='23514'; END IF;
 a.id:=gen_random_uuid();
 INSERT INTO public.suministro_adjuntos(id,tenant_id,contrato_id,recurso_tipo,recurso_id,nombre,mime,bytes,sha256,object_path,actor_id,idempotency_key)
 VALUES(a.id,p_tenant_id,c.id,p_payload->>'recurso_tipo',rid,p_payload->>'nombre',p_payload->>'mime',
  (p_payload->>'bytes')::integer,p_payload->>'sha256',p_tenant_id::text||'/'||c.id::text||'/'||a.id::text,p_actor_id,k) RETURNING * INTO a;
 RETURN to_jsonb(a);
END $fn$;

CREATE OR REPLACE FUNCTION public.finalizar_suministro_adjunto_573(p_tenant_id uuid,p_actor_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE a public.suministro_adjuntos; replay boolean;
BEGIN
 -- 575: confirma quien reservó; la reserva ya comprobó el permiso del destino.
 IF NOT app.suministro_puede_575(p_tenant_id,p_actor_id,'ventas.contratos.conformar') THEN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 END IF;
 SELECT * INTO a FROM public.suministro_adjuntos WHERE tenant_id=p_tenant_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF a.actor_id<>p_actor_id OR a.estado='RETIRADO' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 IF a.recurso_tipo<>'RECEPCION' THEN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 END IF;
 replay:=a.estado='DISPONIBLE';
 IF NOT replay THEN
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='supply-contract-files' AND name=a.object_path) THEN
   RAISE EXCEPTION 'SUPPLY_ATTACHMENT_NOT_STORED' USING ERRCODE='23514'; END IF;
  UPDATE public.suministro_adjuntos SET estado='DISPONIBLE',completed_at=now() WHERE id=a.id RETURNING * INTO a;
  INSERT INTO public.suministro_historial(tenant_id,contrato_id,recurso_id,accion,actual,actor_id)
   VALUES(p_tenant_id,a.contrato_id,a.id,'ADJUNTAR_DOCUMENTO',to_jsonb(a)-'object_path'-'idempotency_key',p_actor_id);
  INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,new_values)
   VALUES(p_tenant_id,p_actor_id,'suministro_adjuntos','INSERT',a.id::text,to_jsonb(a)-'object_path'-'idempotency_key');
 END IF;
 RETURN jsonb_build_object('id',a.id,'contrato_id',a.contrato_id,'accion','ADJUNTAR_DOCUMENTO','idempotent',replay);
END $fn$;

-- Permiso propio: registrar conformidades no exige gestionar el contrato.
CREATE FUNCTION app.seed_suministro_conformar_575(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, 'ventas', 'contratos', 'conformar', 'ventas.contratos.conformar',
    'Registrar recepciones y conformidades del cliente sobre entregas contractuales', true
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = 'ventas.contratos.conformar');
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.activo AND p.activo AND p.codigo = 'ventas.contratos.conformar'
    AND upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO', 'GERENCIA', 'ALMACEN')
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
  -- Almacén registra conformidades sobre contratos que también puede consultar.
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.activo AND p.activo AND p.codigo = 'ventas.contratos.ver'
    AND upper(r.nombre) = 'ALMACEN'
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_suministro_conformar_role_575() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_suministro_conformar_575(NEW.tenant_id); RETURN NEW; END $fn$;
-- Después del trigger 570, que crea ventas.contratos.ver para el tenant.
CREATE TRIGGER seed_suministro_role_575 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_suministro_conformar_role_575();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_suministro_conformar_575(t); END LOOP;
END $seed$;

-- El patrón genérico '^ventas\.' del sembrado canónico (320/379) concede a
-- VENDEDOR todo permiso de ventas. Gestionar contratos y registrar
-- conformidades son decisiones curadas (570/575): se retiran sólo las filas que
-- el patrón creó en esta misma siembra; una concesión posterior se conserva.
DO $wrap$
BEGIN
  IF to_regprocedure('app.seed_operational_rbac_for_tenant_base_575(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
      RENAME TO seed_operational_rbac_for_tenant_base_575;
  END IF;
END $wrap$;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid, p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(permisos_seeded integer, roles_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
  v_retirados integer;
BEGIN
  SELECT * INTO v_base FROM app.seed_operational_rbac_for_tenant_base_575(p_tenant_id, p_source_tenant_id);
  DELETE FROM public.rol_permisos rp
  USING public.roles r, public.permisos p
  WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    AND r.tenant_id = p_tenant_id AND p.tenant_id = p_tenant_id
    AND upper(r.nombre) = 'VENDEDOR'
    AND p.codigo IN ('ventas.contratos.gestionar', 'ventas.contratos.conformar')
    AND rp.created_at = now();
  GET DIAGNOSTICS v_retirados = ROW_COUNT;
  permisos_seeded := coalesce(v_base.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0) - v_retirados;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant_base_575(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app.suministro_despacho_lote_575(uuid, uuid, uuid), app.suministro_ejecucion_575(uuid, uuid),
  app.proteger_despacho_conforme_575(), app.suministro_puede_575(uuid, uuid, text),
  app.seed_suministro_conformar_575(uuid), app.seed_suministro_conformar_role_575(),
  app.suministro_asignado_572(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consultar_suministro_ejecucion_575(uuid, uuid, uuid),
  public.operar_suministro_recepciones_575(uuid, uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_suministro_ejecucion_575(uuid, uuid, uuid),
  public.operar_suministro_recepciones_575(uuid, uuid, uuid, text, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.reservar_suministro_adjunto_573(uuid,uuid,uuid,jsonb,text),
  public.finalizar_suministro_adjunto_573(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_suministro_adjunto_573(uuid,uuid,uuid,jsonb,text),
  public.finalizar_suministro_adjunto_573(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
