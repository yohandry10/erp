-- No backfill ni nuevos permisos DML. Rollback: detener consumidores y retirar
-- exclusivamente esta firma; conservar eventos/auditoría ya confirmados.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
CREATE OR REPLACE FUNCTION public.operar_logistica_tx(
  p_tenant_id uuid, p_pedido_id uuid, p_actor_id uuid,
  p_accion text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_pedido public.pedidos_venta;
  v_evento public.logistica_eventos;
  v_backorder public.pedido_backorders;
  v_tipo text;
  v_tracking text;
  v_fingerprint text;
  v_result jsonb;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
BEGIN
  PERFORM app.assert_inventory_actor_455(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 200 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'LOGISTICS_INVALID_REQUEST';
  END IF;
  IF p_accion NOT IN ('PREPARAR','LISTO','TRACKING','EVENTO','BACKORDER') OR p_accion IS NULL THEN
    RAISE EXCEPTION 'LOGISTICS_INVALID_ACTION';
  END IF;
  v_tipo := CASE p_accion WHEN 'PREPARAR' THEN 'PICKING' WHEN 'LISTO' THEN 'PACKING'
    WHEN 'BACKORDER' THEN 'BACKORDER' WHEN 'EVENTO' THEN p_payload->>'tipo'
    ELSE CASE WHEN p_payload->>'estado' = 'ENTREGADO' THEN 'ENTREGA' ELSE 'TRANSITO' END END;
  -- Un evento manual no puede fabricar la evidencia de un despacho físico.
  IF v_tipo IS NULL OR v_tipo NOT IN ('PICKING','PACKING','TRANSITO','ENTREGA','BACKORDER') THEN
    RAISE EXCEPTION 'LOGISTICS_USE_CANONICAL_DISPATCH';
  END IF;
  v_fingerprint := app.inventory_operation_fingerprint_455(jsonb_build_object(
    'pedido',p_pedido_id,'actor',p_actor_id,'accion',p_accion,'payload',p_payload));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':logistics:' || v_tipo || ':' || v_key, 0));
  SELECT * INTO v_pedido FROM public.pedidos_venta
    WHERE id=p_pedido_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOGISTICS_ORDER_NOT_FOUND'; END IF;
  SELECT * INTO v_evento FROM public.logistica_eventos
    WHERE tenant_id=p_tenant_id AND tipo=v_tipo AND idempotency_key=v_key;
  IF FOUND THEN
    IF v_evento.datos->>'fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'LOGISTICS_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN (v_evento.datos->'resultado') || jsonb_build_object('idempotent',true);
  END IF;
  IF p_accion IN ('PREPARAR','LISTO') THEN
    IF NOT EXISTS (SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND usar_flujo_logistica) THEN
      RAISE EXCEPTION 'LOGISTICS_DISABLED';
    END IF;
    IF (p_accion='PREPARAR' AND upper(v_pedido.estado::text) NOT IN ('CONFIRMADO','DESPACHO_PARCIAL'))
      OR (p_accion='LISTO' AND upper(v_pedido.estado::text) NOT IN ('EN_PREPARACION','DESPACHO_PARCIAL')) THEN
      RAISE EXCEPTION 'LOGISTICS_INVALID_ORDER_STATE';
    END IF;
    IF p_payload ? 'items_preparados' THEN
      IF jsonb_typeof(p_payload->'items_preparados') <> 'array' THEN RAISE EXCEPTION 'LOGISTICS_INVALID_ITEMS'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_payload->'items_preparados') item
        WHERE NOT EXISTS (SELECT 1 FROM public.pedidos_venta_detalle d
          WHERE d.pedido_id=p_pedido_id AND d.id::text=item)) THEN
        RAISE EXCEPTION 'LOGISTICS_ITEMS_OUTSIDE_ORDER';
      END IF;
    END IF;
    v_tracking := CASE WHEN p_accion='PREPARAR' THEN 'EN_PREPARACION' ELSE 'LISTO_DESPACHO' END;
    UPDATE public.pedidos_venta SET estado=v_tracking, tracking_estado=v_tracking,
      tracking_actualizado_en=now(), tracking_notas=p_payload->>'notas', updated_at=now(),
      notas=CASE WHEN nullif(p_payload->>'notas','') IS NULL THEN notas
        ELSE concat_ws(E'\n',nullif(notas,''),'[PREPARACIÓN] ' || (p_payload->>'notas')) END
      WHERE id=p_pedido_id AND tenant_id=p_tenant_id;
  ELSIF p_accion IN ('TRACKING','EVENTO') THEN
    v_tracking := CASE WHEN v_tipo='ENTREGA' THEN 'ENTREGADO' ELSE p_payload->>'estado' END;
    IF (p_accion='TRACKING' AND v_tracking IS NULL)
      OR (v_tracking IS NOT NULL AND v_tracking NOT IN ('EN_TRANSITO','ENTREGADO','INCIDENCIA')) THEN
      RAISE EXCEPTION 'LOGISTICS_INVALID_TRACKING';
    END IF;
    IF v_tracking IS NOT NULL THEN
      IF upper(v_pedido.estado::text) NOT IN ('DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO') THEN
        RAISE EXCEPTION 'LOGISTICS_TRACKING_REQUIRES_DISPATCH';
      END IF;
      IF v_pedido.tracking_estado='ENTREGADO' AND v_tracking<>'ENTREGADO' THEN
        RAISE EXCEPTION 'LOGISTICS_DELIVERY_CANNOT_REGRESS';
      END IF;
      UPDATE public.pedidos_venta SET tracking_estado=v_tracking, tracking_actualizado_en=now(),
        tracking_notas=p_payload->>'notas',updated_at=now(),
        estado=CASE WHEN v_tracking='ENTREGADO' AND upper(estado::text)='FACTURADO' THEN 'COMPLETADO' ELSE estado END
        WHERE id=p_pedido_id AND tenant_id=p_tenant_id;
    ELSIF upper(v_pedido.estado::text) IN ('ANULADO','CANCELADO','COMPLETADO') THEN
      RAISE EXCEPTION 'LOGISTICS_ORDER_CLOSED';
    END IF;
  ELSE
    SELECT * INTO v_backorder FROM public.pedido_backorders WHERE tenant_id=p_tenant_id
      AND pedido_id=p_pedido_id AND detalle_id=(p_payload->>'detalle_id')::uuid FOR UPDATE;
    IF NOT FOUND OR lower(v_backorder.estado::text)='cerrado' THEN RAISE EXCEPTION 'LOGISTICS_BACKORDER_NOT_OPEN'; END IF;
    IF coalesce((p_payload->>'prioridad')::integer,v_backorder.prioridad,3) NOT BETWEEN 1 AND 5
      OR nullif(p_payload->>'proxima_fecha_compromiso','') IS NULL THEN RAISE EXCEPTION 'LOGISTICS_INVALID_SCHEDULE'; END IF;
    UPDATE public.pedido_backorders SET proxima_fecha_compromiso=(p_payload->>'proxima_fecha_compromiso')::date,
      prioridad=coalesce((p_payload->>'prioridad')::integer,prioridad,3),ultimo_compromiso_en=now(),updated_at=now(),
      notas=concat_ws(E'\n',nullif(notas,''),format('[%s] %s -> Reprogramado al %s %s',now(),p_actor_id,
        p_payload->>'proxima_fecha_compromiso',p_payload->>'nota'))
      WHERE id=v_backorder.id AND tenant_id=p_tenant_id;
  END IF;
  v_result := jsonb_build_object('success',true,'pedido_id',p_pedido_id,'idempotent',false);
  INSERT INTO public.logistica_eventos(tenant_id,pedido_id,tipo,datos,registrado_por,registrado_en,idempotency_key)
    VALUES(p_tenant_id,p_pedido_id,v_tipo,p_payload || jsonb_build_object('fingerprint',v_fingerprint,
      'resultado',v_result,'accion',p_accion),p_actor_id,now(),v_key);
  INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,old_values,new_values,metadata)
    VALUES(p_tenant_id,p_actor_id,'pedidos_venta','UPDATE',p_pedido_id::text,
      jsonb_build_object('estado',v_pedido.estado,'tracking_estado',v_pedido.tracking_estado),
      jsonb_build_object('accion',p_accion,'tracking_estado',v_tracking),
      jsonb_build_object('source','operar_logistica_tx','idempotency_key',v_key));
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.operar_logistica_tx(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operar_logistica_tx(uuid,uuid,uuid,text,jsonb,text) TO service_role;
COMMIT;
