-- ============================================================================
-- 577__supply_configurable_alerts.sql
-- F05 ALKHOFAR: alertas configurables de entregas, lotes y cobranza.
--
-- Una regla por tipo y empresa define anticipación, destinatarios, escalamiento
-- y correo. La evaluación es idempotente: una condición abierta tiene una sola
-- alerta (clave de deduplicación con el objeto y su fecha), reintentar no crea
-- otra y, cuando la condición desaparece o la fecha cambia por reprogramación,
-- la alerta se resuelve con su motivo y la nueva fecha abre otra. El historial
-- conserva ambas. Cada destinatario recibe una notificación personal y reconoce
-- la alerta por sí mismo. El correo se encola en el outbox existente; su envío
-- real depende del servicio de correo configurado.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.alertas_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ENTREGA_PROXIMA', 'ENTREGA_ATRASADA', 'ENTREGA_INCOMPLETA',
    'LOTE_POR_VENCER', 'COBRANZA_POR_VENCER', 'COBRANZA_VENCIDA')),
  activa boolean NOT NULL DEFAULT true,
  dias_anticipacion integer NOT NULL DEFAULT 0 CHECK (dias_anticipacion BETWEEN 0 AND 365),
  dias_escalamiento integer CHECK (dias_escalamiento IS NULL OR dias_escalamiento BETWEEN 1 AND 90),
  destinatarios uuid[] NOT NULL DEFAULT '{}',
  escalar_a uuid[] NOT NULL DEFAULT '{}',
  incluir_responsable boolean NOT NULL DEFAULT true,
  enviar_correo boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo),
  CHECK ((dias_escalamiento IS NULL) = (cardinality(escalar_a) = 0))
);

CREATE TABLE public.alertas_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  regla_id uuid NOT NULL REFERENCES public.alertas_reglas(id),
  tipo text NOT NULL,
  objeto_tipo text NOT NULL CHECK (objeto_tipo IN ('ENTREGA', 'LOTE', 'CXC')),
  objeto_id uuid NOT NULL,
  contrato_id uuid,
  clave text NOT NULL,
  fecha_objetivo date NOT NULL,
  -- Fecha evaluada en que nació la alerta; el escalamiento cuenta desde ella.
  fecha_alerta date NOT NULL,
  severidad text NOT NULL CHECK (severidad IN ('AVISO', 'CRITICA')),
  titulo text NOT NULL,
  detalle jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'RESUELTA')),
  motivo_resolucion text CHECK (motivo_resolucion IS NULL OR motivo_resolucion IN
    ('CONDICION_SUPERADA', 'REPROGRAMADA', 'REGLA_DESACTIVADA')),
  escalada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz,
  CHECK ((estado = 'RESUELTA') = (resuelta_at IS NOT NULL AND motivo_resolucion IS NOT NULL))
);
-- Una sola alerta abierta por condición; resuelta, la condición puede volver.
CREATE UNIQUE INDEX alertas_eventos_abierta_unica_577 ON public.alertas_eventos (tenant_id, clave) WHERE estado = 'ABIERTA';
CREATE INDEX alertas_eventos_objeto_577 ON public.alertas_eventos (tenant_id, objeto_tipo, objeto_id, created_at);

CREATE TABLE public.alertas_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alerta_id uuid NOT NULL REFERENCES public.alertas_eventos(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  nivel text NOT NULL CHECK (nivel IN ('INICIAL', 'ESCALAMIENTO')),
  notificacion_id uuid,
  correo_evento_id uuid,
  reconocido_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alerta_id, usuario_id, nivel)
);
CREATE INDEX alertas_destinatarios_usuario_577 ON public.alertas_destinatarios (tenant_id, usuario_id, reconocido_at);

CREATE TABLE public.alertas_ejecuciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fecha_evaluada date NOT NULL,
  creadas integer NOT NULL,
  resueltas integer NOT NULL,
  escaladas integer NOT NULL,
  notificaciones integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $secure$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['alertas_reglas', 'alertas_eventos', 'alertas_destinatarios', 'alertas_ejecuciones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY alertas_private_577 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

-- Condiciones vigentes para una fecha. Cada fila es una alerta candidata.
CREATE FUNCTION app.alertas_condiciones_577(p_tenant_id uuid, p_hoy date)
RETURNS TABLE (regla_id uuid, tipo text, objeto_tipo text, objeto_id uuid, contrato_id uuid, clave text,
  fecha_objetivo date, severidad text, titulo text, detalle jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  WITH reglas AS (
    SELECT * FROM public.alertas_reglas WHERE tenant_id = p_tenant_id AND activa
  ), entregas AS (
    SELECT e.id, e.contrato_id, e.fecha_programada, e.destino, e.cantidad, c.numero AS contrato_numero,
      cl.codigo_producto, cl.descripcion,
      coalesce((SELECT sum(pd.cantidad) FROM public.suministro_pedido_lineas l
        JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id AND v.estado = 'VINCULADO'
        JOIN public.pedido_despachos pd ON pd.tenant_id = l.tenant_id AND pd.pedido_id = v.pedido_id
          AND pd.detalle_id = l.pedido_detalle_id AND upper(coalesce(pd.estado, 'REGISTRADO')) <> 'ANULADO'
        WHERE l.tenant_id = e.tenant_id AND l.entrega_id = e.id), 0) AS despachado,
      coalesce((SELECT sum(rl.cantidad_aceptada) FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
        WHERE rl.tenant_id = e.tenant_id AND rl.entrega_id = e.id), 0) AS aceptado,
      coalesce((SELECT sum(rl.cantidad_rechazada) FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
        WHERE rl.tenant_id = e.tenant_id AND rl.entrega_id = e.id), 0) AS rechazado
    FROM public.suministro_entregas_programadas e
    JOIN public.suministro_contratos c ON c.id = e.contrato_id AND c.tenant_id = e.tenant_id AND c.estado = 'ACTIVO'
    JOIN public.suministro_orden_lineas ol ON ol.id = e.orden_linea_id AND ol.tenant_id = e.tenant_id
    JOIN public.suministro_contrato_lineas cl ON cl.id = ol.contrato_linea_id AND cl.tenant_id = ol.tenant_id
    WHERE e.tenant_id = p_tenant_id AND e.estado = 'PROGRAMADA'
  )
  SELECT r.id, r.tipo, 'ENTREGA', e.id, e.contrato_id, r.tipo || ':' || e.id || ':' || e.fecha_programada,
    e.fecha_programada,
    CASE WHEN r.tipo = 'ENTREGA_ATRASADA' THEN 'CRITICA' ELSE 'AVISO' END,
    CASE r.tipo
      WHEN 'ENTREGA_PROXIMA' THEN format('Entrega próxima %s · contrato %s', to_char(e.fecha_programada, 'DD/MM/YYYY'), e.contrato_numero)
      WHEN 'ENTREGA_ATRASADA' THEN format('Entrega atrasada desde %s · contrato %s', to_char(e.fecha_programada, 'DD/MM/YYYY'), e.contrato_numero)
      ELSE format('Entrega incompleta %s · contrato %s', to_char(e.fecha_programada, 'DD/MM/YYYY'), e.contrato_numero) END,
    jsonb_build_object('contrato_numero', e.contrato_numero, 'producto', e.codigo_producto || ' ' || e.descripcion,
      'destino', e.destino, 'programado', e.cantidad, 'despachado', e.despachado, 'aceptado', e.aceptado,
      'rechazado', e.rechazado, 'pendiente', e.cantidad - e.aceptado)
  FROM entregas e JOIN reglas r ON (
    (r.tipo = 'ENTREGA_PROXIMA' AND e.aceptado < e.cantidad AND e.despachado = 0
      AND e.fecha_programada BETWEEN p_hoy AND p_hoy + r.dias_anticipacion)
    OR (r.tipo = 'ENTREGA_ATRASADA' AND e.aceptado < e.cantidad AND e.fecha_programada < p_hoy)
    OR (r.tipo = 'ENTREGA_INCOMPLETA' AND e.aceptado < e.cantidad AND (e.rechazado > 0 OR e.despachado >= e.cantidad))
  )
  UNION ALL
  SELECT r.id, r.tipo, 'LOTE', l.id, NULL::uuid, r.tipo || ':' || l.id || ':' || l.fecha_vencimiento, l.fecha_vencimiento,
    CASE WHEN l.fecha_vencimiento < p_hoy THEN 'CRITICA' ELSE 'AVISO' END,
    format('Lote %s de %s %s el %s', l.codigo, p.codigo,
      CASE WHEN l.fecha_vencimiento < p_hoy THEN 'venció' ELSE 'vence' END, to_char(l.fecha_vencimiento, 'DD/MM/YYYY')),
    jsonb_build_object('producto', p.codigo || ' ' || p.nombre, 'lote', l.codigo, 'stock', s.stock, 'reservado', s.reservado)
  FROM reglas r
  JOIN public.inventario_lotes l ON l.tenant_id = p_tenant_id AND l.fecha_vencimiento IS NOT NULL
    AND l.fecha_vencimiento <= p_hoy + r.dias_anticipacion
  JOIN LATERAL (SELECT sum(x.stock_actual) AS stock, sum(x.stock_reservado) AS reservado FROM public.inventario_lote_saldos x
    WHERE x.tenant_id = p_tenant_id AND x.lote_id = l.id) s ON s.stock > 0
  JOIN public.productos p ON p.id = l.producto_id AND p.tenant_id = l.tenant_id
  WHERE r.tipo = 'LOTE_POR_VENCER'
  UNION ALL
  SELECT r.id, r.tipo, 'CXC', cx.id, v.contrato_id, r.tipo || ':' || cx.id || ':' || cx.fecha_vencimiento, cx.fecha_vencimiento,
    CASE WHEN r.tipo = 'COBRANZA_VENCIDA' THEN 'CRITICA' ELSE 'AVISO' END,
    format('%s %s · contrato %s', CASE WHEN r.tipo = 'COBRANZA_VENCIDA' THEN 'Cobranza vencida' ELSE 'Cobranza por vencer' END,
      coalesce(cx.numero_documento, concat_ws('-', cx.serie, cx.numero)), c.numero),
    jsonb_build_object('documento', coalesce(cx.numero_documento, concat_ws('-', cx.serie, cx.numero)), 'contrato_numero', c.numero,
      'moneda', cx.moneda, 'saldo', coalesce(cx.monto_pendiente, cx.saldo_pendiente), 'vence', cx.fecha_vencimiento)
  FROM reglas r
  JOIN public.cuentas_por_cobrar cx ON cx.tenant_id = p_tenant_id AND coalesce(cx.activo, true)
    AND coalesce(cx.monto_pendiente, cx.saldo_pendiente, 0) > 0 AND cx.fecha_vencimiento IS NOT NULL
  JOIN public.suministro_pedidos v ON v.tenant_id = p_tenant_id AND v.pedido_id = cx.pedido_id AND v.estado = 'VINCULADO'
  JOIN public.suministro_contratos c ON c.id = v.contrato_id AND c.tenant_id = v.tenant_id
  WHERE (r.tipo = 'COBRANZA_POR_VENCER' AND cx.fecha_vencimiento BETWEEN p_hoy AND p_hoy + r.dias_anticipacion)
     OR (r.tipo = 'COBRANZA_VENCIDA' AND cx.fecha_vencimiento < p_hoy)
$fn$;

-- Entrega una alerta a un usuario activo: notificación personal y correo
-- opcional. Idempotente por alerta/usuario/nivel.
CREATE FUNCTION app.alertas_notificar_577(p_alerta public.alertas_eventos, p_usuario uuid, p_nivel text, p_correo boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_dest public.alertas_destinatarios;
  v_user public.usuarios_sistema;
  v_notif uuid;
  v_correo uuid;
  v_titulo text := CASE WHEN p_nivel = 'ESCALAMIENTO' THEN 'Escalamiento: ' || p_alerta.titulo ELSE p_alerta.titulo END;
BEGIN
  SELECT * INTO v_user FROM public.usuarios_sistema
  WHERE id = p_usuario AND tenant_id = p_alerta.tenant_id AND coalesce(activo, false) AND lower(coalesce(estado::text, '')) = 'activo';
  IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO public.alertas_destinatarios (tenant_id, alerta_id, usuario_id, nivel)
  VALUES (p_alerta.tenant_id, p_alerta.id, p_usuario, p_nivel)
  ON CONFLICT (alerta_id, usuario_id, nivel) DO NOTHING
  RETURNING * INTO v_dest;
  IF v_dest.id IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notificaciones (tenant_id, usuario_id, roles_destinatarios, tipo, titulo, mensaje, severidad,
    action_url, action_label, leida, metadata)
  VALUES (p_alerta.tenant_id, p_usuario, '{}', 'ALERTA_' || p_alerta.tipo, v_titulo,
    coalesce(p_alerta.detalle->>'producto', p_alerta.detalle->>'documento', p_alerta.titulo),
    CASE WHEN p_alerta.severidad = 'CRITICA' THEN 'critical' ELSE 'warning' END,
    CASE WHEN p_alerta.contrato_id IS NOT NULL THEN '/dashboard/ventas/contratos?contrato=' || p_alerta.contrato_id
      WHEN p_alerta.objeto_tipo = 'LOTE' THEN '/dashboard/inventario/lotes' ELSE NULL END,
    'Ver detalle', false,
    jsonb_build_object('alerta_id', p_alerta.id, 'nivel', p_nivel, 'source', 'alertas_577'))
  RETURNING id INTO v_notif;
  IF p_correo AND nullif(btrim(coalesce(v_user.email, '')), '') IS NOT NULL THEN
    v_correo := (public.enqueue_outbox_event_tx(jsonb_build_object(
      'tenant_id', p_alerta.tenant_id, 'event_type', 'email.send', 'aggregate_type', 'alerta_suministro',
      'aggregate_id', p_alerta.id::text, 'idempotency_key', 'alerta-577:' || v_dest.id,
      'payload', jsonb_build_object('to', v_user.email, 'subject', v_titulo,
        'text', v_titulo || E'\n' || coalesce(p_alerta.detalle::text, ''),
        'html', '<p>' || replace(replace(replace(v_titulo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>',
        'metadata', jsonb_build_object('tenantId', p_alerta.tenant_id, 'alerta_id', p_alerta.id, 'nivel', p_nivel))
    ))->>'event_id')::uuid;
  END IF;
  UPDATE public.alertas_destinatarios SET notificacion_id = v_notif, correo_evento_id = v_correo WHERE id = v_dest.id;
  RETURN 1;
END $fn$;

-- Evaluación del día: crea, resuelve y escala. Serializada por empresa.
CREATE FUNCTION public.evaluar_alertas_suministro_577(p_tenant_id uuid, p_fecha date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_hoy date := coalesce(p_fecha, app.hoy_tenant(p_tenant_id));
  v_cond record;
  v_alerta public.alertas_eventos;
  v_regla public.alertas_reglas;
  v_usuario uuid;
  v_creadas integer := 0; v_resueltas integer := 0; v_escaladas integer := 0; v_notificaciones integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'ALERTS_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':alertas-suministro', 577));
  IF to_regclass('pg_temp.alertas_vigentes_577') IS NULL THEN
    CREATE TEMP TABLE alertas_vigentes_577 (LIKE public.alertas_eventos INCLUDING DEFAULTS) ON COMMIT DROP;
  END IF;
  TRUNCATE alertas_vigentes_577;
  INSERT INTO alertas_vigentes_577 (tenant_id, regla_id, tipo, objeto_tipo, objeto_id, contrato_id, clave, fecha_objetivo,
    fecha_alerta, severidad, titulo, detalle)
  SELECT p_tenant_id, c.regla_id, c.tipo, c.objeto_tipo, c.objeto_id, c.contrato_id, c.clave, c.fecha_objetivo,
    v_hoy, c.severidad, c.titulo, c.detalle FROM app.alertas_condiciones_577(p_tenant_id, v_hoy) c;

  -- Resolver: la condición ya no existe. Si el mismo objeto sigue alertado con
  -- otra fecha, fue reprogramado; si la regla se desactivó, se dice así.
  FOR v_alerta IN
    SELECT a.* FROM public.alertas_eventos a
    WHERE a.tenant_id = p_tenant_id AND a.estado = 'ABIERTA'
      AND NOT EXISTS (SELECT 1 FROM alertas_vigentes_577 v WHERE v.clave = a.clave)
    FOR UPDATE
  LOOP
    UPDATE public.alertas_eventos SET estado = 'RESUELTA', resuelta_at = now(),
      motivo_resolucion = CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.alertas_reglas r WHERE r.id = v_alerta.regla_id AND r.activa) THEN 'REGLA_DESACTIVADA'
        WHEN v_alerta.objeto_tipo = 'ENTREGA' AND EXISTS (SELECT 1 FROM public.suministro_entregas_programadas e
          WHERE e.id = v_alerta.objeto_id AND e.estado = 'PROGRAMADA' AND e.fecha_programada <> v_alerta.fecha_objetivo) THEN 'REPROGRAMADA'
        ELSE 'CONDICION_SUPERADA' END
    WHERE id = v_alerta.id;
    v_resueltas := v_resueltas + 1;
  END LOOP;

  -- Crear las nuevas y notificar a sus destinatarios iniciales.
  FOR v_cond IN SELECT v.* FROM alertas_vigentes_577 v
    WHERE NOT EXISTS (SELECT 1 FROM public.alertas_eventos a WHERE a.tenant_id = p_tenant_id AND a.estado = 'ABIERTA' AND a.clave = v.clave)
  LOOP
    INSERT INTO public.alertas_eventos (tenant_id, regla_id, tipo, objeto_tipo, objeto_id, contrato_id, clave, fecha_objetivo,
      fecha_alerta, severidad, titulo, detalle)
    VALUES (p_tenant_id, v_cond.regla_id, v_cond.tipo, v_cond.objeto_tipo, v_cond.objeto_id, v_cond.contrato_id, v_cond.clave,
      v_cond.fecha_objetivo, v_hoy, v_cond.severidad, v_cond.titulo, v_cond.detalle)
    RETURNING * INTO v_alerta;
    v_creadas := v_creadas + 1;
    SELECT * INTO v_regla FROM public.alertas_reglas WHERE id = v_alerta.regla_id;
    FOR v_usuario IN
      SELECT DISTINCT u FROM (
        SELECT unnest(v_regla.destinatarios) AS u
        UNION SELECT c.responsable_id FROM public.suministro_contratos c
          WHERE v_regla.incluir_responsable AND c.id = v_alerta.contrato_id AND c.tenant_id = p_tenant_id
      ) d WHERE u IS NOT NULL
    LOOP
      v_notificaciones := v_notificaciones + app.alertas_notificar_577(v_alerta, v_usuario, 'INICIAL', v_regla.enviar_correo);
    END LOOP;
  END LOOP;

  -- Escalar las abiertas sin reconocer pasado el plazo de la regla.
  FOR v_alerta IN
    SELECT a.* FROM public.alertas_eventos a
    JOIN public.alertas_reglas r ON r.id = a.regla_id AND r.dias_escalamiento IS NOT NULL
    WHERE a.tenant_id = p_tenant_id AND a.estado = 'ABIERTA' AND a.escalada_at IS NULL
      AND a.fecha_alerta + r.dias_escalamiento <= v_hoy
      AND NOT EXISTS (SELECT 1 FROM public.alertas_destinatarios d WHERE d.alerta_id = a.id AND d.reconocido_at IS NOT NULL)
    FOR UPDATE OF a
  LOOP
    SELECT * INTO v_regla FROM public.alertas_reglas WHERE id = v_alerta.regla_id;
    FOREACH v_usuario IN ARRAY v_regla.escalar_a LOOP
      v_notificaciones := v_notificaciones + app.alertas_notificar_577(v_alerta, v_usuario, 'ESCALAMIENTO', v_regla.enviar_correo);
    END LOOP;
    UPDATE public.alertas_eventos SET escalada_at = now() WHERE id = v_alerta.id;
    v_escaladas := v_escaladas + 1;
  END LOOP;

  INSERT INTO public.alertas_ejecuciones (tenant_id, fecha_evaluada, creadas, resueltas, escaladas, notificaciones)
  VALUES (p_tenant_id, v_hoy, v_creadas, v_resueltas, v_escaladas, v_notificaciones);
  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'fecha', v_hoy, 'creadas', v_creadas, 'resueltas', v_resueltas,
    'escaladas', v_escaladas, 'notificaciones', v_notificaciones);
END $fn$;

-- Empresas con alguna regla activa, para la tarea periódica.
CREATE FUNCTION public.listar_tenants_alertas_577() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
  SELECT DISTINCT tenant_id FROM public.alertas_reglas WHERE activa ORDER BY tenant_id
$fn$;

CREATE FUNCTION public.configurar_regla_alerta_577(
  p_tenant_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_tipo text := upper(btrim(coalesce(p_payload->>'tipo', '')));
  v_old public.alertas_reglas;
  v_new public.alertas_reglas;
  v_dest uuid[];
  v_esc uuid[];
  v_dias_esc integer;
  v_result jsonb;
  v_op public.suministro_operaciones;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'alertas.suministro.gestionar');
  IF length(v_key) NOT BETWEEN 8 AND 170 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR v_tipo NOT IN ('ENTREGA_PROXIMA', 'ENTREGA_ATRASADA', 'ENTREGA_INCOMPLETA', 'LOTE_POR_VENCER',
       'COBRANZA_POR_VENCER', 'COBRANZA_VENCIDA')
     OR jsonb_typeof(p_payload->'activa') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_payload->'incluir_responsable') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_payload->'enviar_correo') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_payload->'destinatarios') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'escalar_a') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'version') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'ALERTS_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion', 'CONFIGURAR_ALERTA',
    'payload', p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  v_key := 'alerta:' || v_key;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  -- Replay: misma clave y mismo contenido devuelven el resultado registrado.
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'ALERTS_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':alertas-regla:' || v_tipo, 577));
  SELECT * INTO v_new FROM public.alertas_reglas WHERE tenant_id = p_tenant_id AND tipo = v_tipo FOR UPDATE;
  IF coalesce(v_new.version, 0) IS DISTINCT FROM (p_payload->>'version')::integer THEN
    RAISE EXCEPTION 'ALERTS_VERSION_CONFLICT' USING ERRCODE = '23505';
  END IF;
  v_old := v_new;
  SELECT coalesce(array_agg(DISTINCT x::uuid), '{}') INTO v_dest FROM jsonb_array_elements_text(p_payload->'destinatarios') x;
  SELECT coalesce(array_agg(DISTINCT x::uuid), '{}') INTO v_esc FROM jsonb_array_elements_text(p_payload->'escalar_a') x;
  IF cardinality(v_dest) > 50 OR cardinality(v_esc) > 50 OR EXISTS (
    SELECT 1 FROM unnest(v_dest || v_esc) u WHERE NOT EXISTS (
      SELECT 1 FROM public.usuarios_sistema s WHERE s.id = u AND s.tenant_id = p_tenant_id
        AND coalesce(s.activo, false) AND lower(coalesce(s.estado::text, '')) = 'activo'))
  THEN
    RAISE EXCEPTION 'ALERTS_RECIPIENT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF cardinality(v_dest) = 0 AND NOT (p_payload->>'incluir_responsable')::boolean AND (p_payload->>'activa')::boolean THEN
    RAISE EXCEPTION 'ALERTS_RECIPIENT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  v_dias_esc := nullif(p_payload->>'dias_escalamiento', '')::integer;
  IF (v_dias_esc IS NULL) <> (cardinality(v_esc) = 0) THEN
    RAISE EXCEPTION 'ALERTS_ESCALATION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.alertas_reglas (tenant_id, tipo, activa, dias_anticipacion, dias_escalamiento, destinatarios, escalar_a,
    incluir_responsable, enviar_correo, updated_by)
  VALUES (p_tenant_id, v_tipo, (p_payload->>'activa')::boolean, coalesce((p_payload->>'dias_anticipacion')::integer, 0),
    v_dias_esc, v_dest, v_esc, (p_payload->>'incluir_responsable')::boolean, (p_payload->>'enviar_correo')::boolean, p_actor_id)
  ON CONFLICT (tenant_id, tipo) DO UPDATE SET activa = EXCLUDED.activa, dias_anticipacion = EXCLUDED.dias_anticipacion,
    dias_escalamiento = EXCLUDED.dias_escalamiento, destinatarios = EXCLUDED.destinatarios, escalar_a = EXCLUDED.escalar_a,
    incluir_responsable = EXCLUDED.incluir_responsable, enviar_correo = EXCLUDED.enviar_correo,
    updated_by = EXCLUDED.updated_by, version = public.alertas_reglas.version + 1, updated_at = now()
  RETURNING * INTO v_new;
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, old_values, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'alertas_reglas', CASE WHEN v_old.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END, v_new.id::text,
    to_jsonb(v_old), to_jsonb(v_new), jsonb_build_object('source', 'configurar_regla_alerta_577', 'idempotency_key', v_key,
      'fingerprint', v_hash));
  v_result := jsonb_build_object('id', v_new.id, 'tipo', v_tipo, 'version', v_new.version, 'idempotent', false);
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

CREATE FUNCTION public.reconocer_alerta_577(p_tenant_id uuid, p_actor_id uuid, p_alerta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE id = p_actor_id AND tenant_id = p_tenant_id
      AND coalesce(activo, false) AND lower(coalesce(estado::text, '')) = 'activo') THEN
    RAISE EXCEPTION 'ALERTS_ACTOR_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;
  -- Cada destinatario reconoce por sí mismo; reintentar no cambia la fecha.
  UPDATE public.alertas_destinatarios SET reconocido_at = coalesce(reconocido_at, now())
  WHERE tenant_id = p_tenant_id AND alerta_id = p_alerta_id AND usuario_id = p_actor_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'ALERTS_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.notificaciones n SET leida = true, leida_at = coalesce(n.leida_at, now())
  FROM public.alertas_destinatarios d
  WHERE d.alerta_id = p_alerta_id AND d.usuario_id = p_actor_id AND d.tenant_id = p_tenant_id
    AND n.id = d.notificacion_id AND n.tenant_id = p_tenant_id AND n.usuario_id = p_actor_id;
  RETURN jsonb_build_object('id', p_alerta_id, 'reconocida', true);
END $fn$;

CREATE FUNCTION public.consultar_alertas_577(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_estado text DEFAULT 'ABIERTA', p_pagina integer DEFAULT 1, p_limite integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 100000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 200
     OR coalesce(p_estado, '') NOT IN ('ABIERTA', 'RESUELTA', 'TODAS') THEN
    RAISE EXCEPTION 'ALERTS_QUERY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_accion = 'MIAS' THEN
    -- Las propias no requieren permiso de administración de alertas.
    IF NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE id = p_actor_id AND tenant_id = p_tenant_id
        AND coalesce(activo, false) AND lower(coalesce(estado::text, '')) = 'activo') THEN
      RAISE EXCEPTION 'ALERTS_ACTOR_NOT_ACTIVE' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'alertas.suministro.ver');
  END IF;
  IF p_accion = 'REGLAS' THEN
    SELECT jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.tipo), '[]'::jsonb),
      'usuarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
        'email', u.email) ORDER BY u.nombre, u.id) FROM public.usuarios_sistema u
        WHERE u.tenant_id = p_tenant_id AND coalesce(u.activo, false) AND lower(coalesce(u.estado::text, '')) = 'activo'), '[]'::jsonb))
    INTO v_result FROM public.alertas_reglas r WHERE r.tenant_id = p_tenant_id;
    RETURN v_result;
  ELSIF p_accion IN ('MIAS', 'TODAS') THEN
    SELECT jsonb_build_object('items', coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb),
      'pagina', p_pagina, 'limite', p_limite) INTO v_result FROM (
      SELECT to_jsonb(a) || jsonb_build_object(
        'destinatarios', coalesce((SELECT jsonb_agg(jsonb_build_object('usuario_id', d.usuario_id, 'nivel', d.nivel,
            'nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u WHERE u.id = d.usuario_id),
            'reconocido_at', d.reconocido_at, 'correo', d.correo_evento_id IS NOT NULL) ORDER BY d.nivel, d.created_at)
          FROM public.alertas_destinatarios d WHERE d.alerta_id = a.id), '[]'::jsonb),
        'reconocida_por_mi', EXISTS (SELECT 1 FROM public.alertas_destinatarios d WHERE d.alerta_id = a.id
          AND d.usuario_id = p_actor_id AND d.reconocido_at IS NOT NULL),
        'soy_destinatario', EXISTS (SELECT 1 FROM public.alertas_destinatarios d WHERE d.alerta_id = a.id AND d.usuario_id = p_actor_id)
      ) AS x
      FROM public.alertas_eventos a
      WHERE a.tenant_id = p_tenant_id AND (p_estado = 'TODAS' OR a.estado = p_estado)
        AND (p_accion = 'TODAS' OR EXISTS (SELECT 1 FROM public.alertas_destinatarios d WHERE d.alerta_id = a.id AND d.usuario_id = p_actor_id))
      ORDER BY a.created_at DESC, a.id LIMIT p_limite OFFSET (p_pagina - 1) * p_limite
    ) s;
    RETURN v_result;
  END IF;
  RAISE EXCEPTION 'ALERTS_ACTION_INVALID' USING ERRCODE = '22023';
END $fn$;

CREATE FUNCTION app.seed_alertas_permissions_577(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, 'alertas', 'suministro', s.accion, 'alertas.suministro.' || s.accion, s.descripcion, true
  FROM (VALUES ('ver', 'Consultar las alertas de entregas, lotes y cobranza de la empresa'),
    ('gestionar', 'Configurar reglas, destinatarios y escalamiento de alertas')) s(accion, descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = 'alertas.suministro.' || s.accion);
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.activo AND p.activo AND p.codigo IN ('alertas.suministro.ver', 'alertas.suministro.gestionar')
    AND (upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO', 'GERENCIA')
      OR (upper(r.nombre) IN ('ALMACEN', 'FINANZAS', 'AUDITOR') AND p.codigo = 'alertas.suministro.ver'))
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_alertas_role_577() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_alertas_permissions_577(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_alertas_role_577 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_alertas_role_577();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_alertas_permissions_577(t); END LOOP;
END $seed$;

REVOKE ALL ON FUNCTION app.alertas_condiciones_577(uuid, date),
  app.alertas_notificar_577(public.alertas_eventos, uuid, text, boolean),
  app.seed_alertas_permissions_577(uuid), app.seed_alertas_role_577()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.evaluar_alertas_suministro_577(uuid, date), public.listar_tenants_alertas_577(),
  public.configurar_regla_alerta_577(uuid, uuid, jsonb, text), public.reconocer_alerta_577(uuid, uuid, uuid),
  public.consultar_alertas_577(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluar_alertas_suministro_577(uuid, date), public.listar_tenants_alertas_577(),
  public.configurar_regla_alerta_577(uuid, uuid, jsonb, text), public.reconocer_alerta_577(uuid, uuid, uuid),
  public.consultar_alertas_577(uuid, uuid, text, text, integer, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
