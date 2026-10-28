-- ============================================================================
-- 576__supply_billing_reconciliation.sql
-- F04 ALKHOFAR: facturación y conciliación por contrato y OC.
--
-- La facturación sigue siendo la de pedidos (446): cada pedido vinculado se
-- factura una sola vez con su comprobante, su CxC y sus cobros (452) y notas
-- (494/448). Facturar por entrega es facturar el pedido de esa entrega; una
-- cantidad no puede facturarse dos veces porque cada línea de pedido pertenece a
-- una sola programación y el pedido tiene un único comprobante. El contrato puede
-- exigir conformidad: entonces un pedido vinculado sólo se factura con todo lo
-- despachado aceptado por el cliente (575). El estado de cuenta se calcula desde
-- esos documentos, en la moneda del contrato, sin crear efectos contables nuevos.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

ALTER TABLE public.suministro_contratos
  ADD COLUMN base_facturacion text NOT NULL DEFAULT 'DESPACHO'
  CHECK (base_facturacion IN ('DESPACHO', 'CONFORMIDAD'));

CREATE FUNCTION public.configurar_facturacion_suministro_576(
  p_tenant_id uuid, p_actor_id uuid, p_contrato_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_op public.suministro_operaciones;
  v_c public.suministro_contratos;
  v_base text := upper(btrim(coalesce(p_payload->>'base_facturacion', '')));
  v_motivo text := nullif(btrim(p_payload->>'motivo'), '');
  v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'ventas.contratos.gestionar');
  IF length(v_key) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR v_base NOT IN ('DESPACHO', 'CONFORMIDAD') THEN
    RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(v_motivo), 0) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion', 'CONFIGURAR_FACTURACION',
    'contrato', p_contrato_id, 'payload', p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_c FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_c.estado = 'ANULADO' OR v_c.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
    RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE = '23505';
  END IF;
  UPDATE public.suministro_contratos SET base_facturacion = v_base, version = version + 1, updated_at = now()
  WHERE id = v_c.id;
  INSERT INTO public.suministro_historial (tenant_id, contrato_id, recurso_id, accion, anterior, actual, motivo, actor_id)
  VALUES (p_tenant_id, v_c.id, v_c.id, 'CONFIGURAR_FACTURACION',
    jsonb_build_object('base_facturacion', v_c.base_facturacion, 'version', v_c.version),
    jsonb_build_object('base_facturacion', v_base, 'version', v_c.version + 1), v_motivo, p_actor_id);
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, old_values, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'suministro_contratos', 'UPDATE', v_c.id::text,
    jsonb_build_object('base_facturacion', v_c.base_facturacion), jsonb_build_object('base_facturacion', v_base),
    jsonb_build_object('source', 'configurar_facturacion_suministro_576', 'idempotency_key', v_key));
  v_result := jsonb_build_object('id', v_c.id, 'contrato_id', v_c.id, 'accion', 'CONFIGURAR_FACTURACION', 'idempotent', false);
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

-- Con base CONFORMIDAD, asignar el comprobante a un pedido vinculado exige que
-- cada línea contractual del pedido esté despachada y aceptada en su totalidad.
CREATE FUNCTION app.exigir_conformidad_factura_576() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  IF NEW.factura_id IS NOT NULL AND OLD.factura_id IS DISTINCT FROM NEW.factura_id AND EXISTS (
    SELECT 1
    FROM public.suministro_pedidos v
    JOIN public.suministro_contratos c ON c.id = v.contrato_id AND c.tenant_id = v.tenant_id
    JOIN public.suministro_pedido_lineas l ON l.vinculo_id = v.id AND l.tenant_id = v.tenant_id
    JOIN public.pedidos_venta_detalle d ON d.id = l.pedido_detalle_id AND d.tenant_id = v.tenant_id
    WHERE v.tenant_id = NEW.tenant_id AND v.pedido_id = NEW.id AND v.estado = 'VINCULADO'
      AND c.base_facturacion = 'CONFORMIDAD'
      AND coalesce((
        SELECT sum(rl.cantidad_aceptada) FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id
        WHERE rl.tenant_id = NEW.tenant_id AND rl.pedido_detalle_id = d.id AND r.estado = 'REGISTRADA'
      ), 0) < d.cantidad
  ) THEN
    RAISE EXCEPTION 'SUPPLY_INVOICE_REQUIRES_CONFORMITY' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER exigir_conformidad_factura_576 BEFORE UPDATE OF factura_id ON public.pedidos_venta
FOR EACH ROW EXECUTE FUNCTION app.exigir_conformidad_factura_576();

-- Estado de cuenta contractual. Cantidades y valores por línea a precio
-- contractual/OC sin impuestos; documentos con impuestos y en su moneda.
CREATE FUNCTION app.suministro_estado_cuenta_576(p_tenant_id uuid, p_contrato_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  WITH c AS (
    SELECT * FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id
  ), lineas_pedido AS (
    -- Líneas de pedidos vinculados no cancelados, con su programación y OC.
    SELECT l.pedido_detalle_id, l.entrega_id, l.cantidad, l.precio_unitario, v.pedido_id,
      ol.contrato_linea_id, ol.orden_cliente_id, d.cantidad_facturada, pv.estado AS pedido_estado
    FROM public.suministro_pedido_lineas l
    JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id AND v.estado = 'VINCULADO'
    JOIN public.pedidos_venta pv ON pv.id = v.pedido_id AND pv.tenant_id = v.tenant_id
    JOIN public.pedidos_venta_detalle d ON d.id = l.pedido_detalle_id AND d.tenant_id = l.tenant_id
    JOIN public.suministro_entregas_programadas e ON e.id = l.entrega_id AND e.tenant_id = l.tenant_id
    JOIN public.suministro_orden_lineas ol ON ol.id = e.orden_linea_id AND ol.tenant_id = e.tenant_id
    WHERE l.tenant_id = p_tenant_id AND l.contrato_id = p_contrato_id AND upper(pv.estado) <> 'CANCELADO'
  ), despachado AS (
    SELECT lp.pedido_detalle_id, sum(pd.cantidad) AS cantidad
    FROM lineas_pedido lp
    JOIN public.pedido_despachos pd ON pd.tenant_id = p_tenant_id AND pd.pedido_id = lp.pedido_id
      AND pd.detalle_id = lp.pedido_detalle_id AND upper(coalesce(pd.estado, 'REGISTRADO')) <> 'ANULADO'
    GROUP BY lp.pedido_detalle_id
  ), aceptado AS (
    SELECT rl.pedido_detalle_id, sum(rl.cantidad_aceptada) AS cantidad
    FROM public.suministro_recepcion_lineas rl
    JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id
    WHERE rl.tenant_id = p_tenant_id AND rl.contrato_id = p_contrato_id AND r.estado = 'REGISTRADA'
    GROUP BY rl.pedido_detalle_id
  ), por_linea AS (
    SELECT lp.contrato_linea_id, lp.orden_cliente_id,
      sum(lp.cantidad) AS en_pedidos,
      sum(coalesce(dp.cantidad, 0)) AS despachado,
      sum(coalesce(ac.cantidad, 0)) AS aceptado,
      sum(least(coalesce(lp.cantidad_facturada, 0), lp.cantidad)) AS facturado,
      sum(least(coalesce(lp.cantidad_facturada, 0), lp.cantidad) * lp.precio_unitario) AS facturado_valor,
      -- Base de facturación: lo despachado o lo aceptado, sin lo ya facturado.
      sum(greatest(CASE WHEN (SELECT base_facturacion FROM c) = 'CONFORMIDAD'
            THEN coalesce(ac.cantidad, 0) ELSE coalesce(dp.cantidad, 0) END
          - least(coalesce(lp.cantidad_facturada, 0), lp.cantidad), 0)) AS por_facturar,
      sum(greatest(CASE WHEN (SELECT base_facturacion FROM c) = 'CONFORMIDAD'
            THEN coalesce(ac.cantidad, 0) ELSE coalesce(dp.cantidad, 0) END
          - least(coalesce(lp.cantidad_facturada, 0), lp.cantidad), 0) * lp.precio_unitario) AS por_facturar_valor
    FROM lineas_pedido lp
    LEFT JOIN despachado dp ON dp.pedido_detalle_id = lp.pedido_detalle_id
    LEFT JOIN aceptado ac ON ac.pedido_detalle_id = lp.pedido_detalle_id
    GROUP BY lp.contrato_linea_id, lp.orden_cliente_id
  ), documentos AS (
    SELECT cx.id AS cxc_id, cx.pedido_id, pv.numero AS pedido_numero,
      coalesce(cx.numero_documento, concat_ws('-', cx.serie, cx.numero)) AS documento,
      cx.tipo_documento, cx.fecha_emision, cx.fecha_vencimiento, upper(coalesce(cx.moneda, 'PEN')) AS moneda,
      coalesce(cx.monto_total, cx.total, 0) AS total,
      coalesce(cx.monto_pendiente, cx.saldo_pendiente, 0) AS saldo, cx.estado::text AS estado,
      coalesce((SELECT sum(p.monto) FROM public.cxc_pagos p WHERE p.tenant_id = p_tenant_id AND p.cuenta_id = cx.id
        AND coalesce(p.activo, true) AND upper(coalesce(p.estado, 'ACTIVO')) = 'ACTIVO'
        AND upper(coalesce(p.tipo, '')) = 'NOTA_CREDITO'), 0) AS notas,
      coalesce((SELECT sum(p.monto) FROM public.cxc_pagos p WHERE p.tenant_id = p_tenant_id AND p.cuenta_id = cx.id
        AND coalesce(p.activo, true) AND upper(coalesce(p.estado, 'ACTIVO')) = 'ACTIVO'
        AND upper(coalesce(p.tipo, '')) <> 'NOTA_CREDITO'), 0) AS cobrado
    FROM public.cuentas_por_cobrar cx
    JOIN public.pedidos_venta pv ON pv.id = cx.pedido_id AND pv.tenant_id = cx.tenant_id
    WHERE cx.tenant_id = p_tenant_id AND coalesce(cx.activo, true)
      AND cx.pedido_id IN (SELECT v.pedido_id FROM public.suministro_pedidos v
        WHERE v.tenant_id = p_tenant_id AND v.contrato_id = p_contrato_id AND v.estado = 'VINCULADO')
  )
  SELECT jsonb_build_object(
    'contrato_id', (SELECT id FROM c), 'moneda', (SELECT moneda FROM c),
    'base_facturacion', (SELECT base_facturacion FROM c), 'version', (SELECT version FROM c),
    'lineas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'contrato_linea_id', cl.id, 'codigo_producto', cl.codigo_producto, 'descripcion', cl.descripcion,
        'unidad_medida', cl.unidad_medida, 'precio_unitario', cl.precio_unitario,
        'contratado', cl.cantidad, 'contratado_valor', round(cl.cantidad * cl.precio_unitario, 2),
        'en_oc', coalesce((SELECT sum(ol.cantidad) FROM public.suministro_orden_lineas ol
          JOIN public.suministro_ordenes_cliente o ON o.id = ol.orden_cliente_id AND o.tenant_id = ol.tenant_id
          WHERE ol.tenant_id = p_tenant_id AND ol.contrato_linea_id = cl.id AND o.estado = 'ACTIVA'), 0),
        'programado', coalesce((SELECT sum(e.cantidad) FROM public.suministro_entregas_programadas e
          JOIN public.suministro_orden_lineas ol ON ol.id = e.orden_linea_id AND ol.tenant_id = e.tenant_id
          WHERE e.tenant_id = p_tenant_id AND ol.contrato_linea_id = cl.id AND e.estado = 'PROGRAMADA'), 0),
        'en_pedidos', coalesce((SELECT sum(pl.en_pedidos) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0),
        'despachado', coalesce((SELECT sum(pl.despachado) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0),
        'aceptado', coalesce((SELECT sum(pl.aceptado) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0),
        'facturado', coalesce((SELECT sum(pl.facturado) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0),
        'facturado_valor', round(coalesce((SELECT sum(pl.facturado_valor) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0), 2),
        'por_facturar', coalesce((SELECT sum(pl.por_facturar) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0),
        'por_facturar_valor', round(coalesce((SELECT sum(pl.por_facturar_valor) FROM por_linea pl WHERE pl.contrato_linea_id = cl.id), 0), 2)
      ) ORDER BY cl.orden)
      FROM public.suministro_contrato_lineas cl WHERE cl.tenant_id = p_tenant_id AND cl.contrato_id = p_contrato_id), '[]'::jsonb),
    'ordenes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'orden_cliente_id', o.id, 'numero', o.numero, 'estado', o.estado,
        'valor', round(coalesce((SELECT sum(ol.cantidad * ol.precio_unitario) FROM public.suministro_orden_lineas ol
          WHERE ol.tenant_id = p_tenant_id AND ol.orden_cliente_id = o.id), 0), 2),
        'facturado_valor', round(coalesce((SELECT sum(pl.facturado_valor) FROM por_linea pl WHERE pl.orden_cliente_id = o.id), 0), 2),
        'por_facturar_valor', round(coalesce((SELECT sum(pl.por_facturar_valor) FROM por_linea pl WHERE pl.orden_cliente_id = o.id), 0), 2)
      ) ORDER BY o.fecha_emision, o.numero)
      FROM public.suministro_ordenes_cliente o WHERE o.tenant_id = p_tenant_id AND o.contrato_id = p_contrato_id), '[]'::jsonb),
    'documentos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'cxc_id', d.cxc_id, 'pedido_id', d.pedido_id, 'pedido_numero', d.pedido_numero, 'documento', d.documento,
        'tipo_documento', d.tipo_documento, 'fecha_emision', d.fecha_emision, 'fecha_vencimiento', d.fecha_vencimiento,
        'moneda', d.moneda, 'total', round(d.total, 2), 'notas_credito', round(d.notas, 2), 'cobrado', round(d.cobrado, 2),
        'saldo', round(d.saldo, 2), 'estado', d.estado,
        -- Total menos notas y cobros debe coincidir con el saldo de la CxC.
        'cuadra', abs(round(d.total - d.notas - d.cobrado - d.saldo, 2)) < 0.01
      ) ORDER BY d.fecha_emision, d.documento) FROM documentos d), '[]'::jsonb),
    'totales', coalesce((
      SELECT jsonb_agg(jsonb_build_object('moneda', t.moneda, 'facturado', t.total, 'notas_credito', t.notas,
        'neto', round(t.total - t.notas, 2), 'cobrado', t.cobrado, 'saldo', t.saldo) ORDER BY t.moneda)
      FROM (SELECT moneda, round(sum(total), 2) AS total, round(sum(notas), 2) AS notas,
        round(sum(cobrado), 2) AS cobrado, round(sum(saldo), 2) AS saldo FROM documentos GROUP BY moneda) t), '[]'::jsonb)
  )
$fn$;

CREATE FUNCTION public.consultar_suministro_estado_cuenta_576(p_tenant_id uuid, p_actor_id uuid, p_contrato_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'ventas.contratos.ver');
  IF NOT EXISTS (SELECT 1 FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id) THEN
    RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN app.suministro_estado_cuenta_576(p_tenant_id, p_contrato_id);
END $fn$;

REVOKE ALL ON FUNCTION app.exigir_conformidad_factura_576(), app.suministro_estado_cuenta_576(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consultar_suministro_estado_cuenta_576(uuid, uuid, uuid),
  public.configurar_facturacion_suministro_576(uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_suministro_estado_cuenta_576(uuid, uuid, uuid),
  public.configurar_facturacion_suministro_576(uuid, uuid, uuid, jsonb, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
