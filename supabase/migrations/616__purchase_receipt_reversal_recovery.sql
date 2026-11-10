-- La recuperación sólo lee el commit propio. Resolver comparte el cerrojo del
-- writer615 y cierra una clave ausente antes de autorizar retirar la intención.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE FUNCTION public.consultar_reversa_recepcion_616(p_tenant_id uuid,p_actor_id uuid,p_recepcion_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE r public.inventario_reversas;receipt public.recepciones;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'compras.recepciones.cerrar');
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'RECEIPT_REVERSAL_PAYLOAD_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO r FROM public.inventario_reversas WHERE tenant_id=p_tenant_id AND tipo='RECEPCION'
  AND fuente_id=p_recepcion_id AND actor_id=p_actor_id AND idempotency_key=btrim(p_idempotency_key);
 -- Ni una clave ajena ni la ausencia del recibo revelan el origen o prueban
 -- abandono. Únicamente resolver puede establecer el cierre de la intención.
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO receipt FROM public.recepciones WHERE tenant_id=p_tenant_id AND id=p_recepcion_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_NOT_FOUND' USING ERRCODE='P0002';END IF;
 RETURN jsonb_build_object('recepcion',to_jsonb(receipt),'reversa',to_jsonb(r),
  'items',(SELECT coalesce(jsonb_agg((to_jsonb(i)-'cantidad_recibida')||jsonb_build_object('cantidad_recibida',i.cantidad_recibida::text) ORDER BY i.id),'[]')
   FROM public.recepcion_items i WHERE i.tenant_id=p_tenant_id AND i.recepcion_id=p_recepcion_id),
  'items_origen',(SELECT coalesce(jsonb_agg((i-'cantidad_recibida')||jsonb_build_object('cantidad_recibida',i->>'cantidad_recibida') ORDER BY i->>'id'),'[]')
   FROM jsonb_array_elements(r.fuente_snapshot->'items') i),
  'movimientos_origen',(SELECT coalesce(jsonb_agg(app.inventory_reversal_movement_receipt_613(p_tenant_id,m.id) ORDER BY m.id),'[]')
   FROM public.movimientos_inventario m WHERE m.tenant_id=p_tenant_id AND m.id=ANY(r.movimientos_origen)),
  'movimientos_reversa',(SELECT coalesce(jsonb_agg(app.inventory_reversal_movement_receipt_613(p_tenant_id,m.id) ORDER BY m.id),'[]')
   FROM public.movimientos_inventario m WHERE m.tenant_id=p_tenant_id AND m.metadata->>'reversa_id'=r.id::text));
END $fn$;

CREATE FUNCTION public.resolver_reversa_recepcion_616(p_tenant_id uuid,p_actor_id uuid,p_recepcion_id uuid,p_payload jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE k text:=btrim(coalesce(p_idempotency_key,''));payload jsonb;fp text;r public.inventario_reversas;f public.inventario_reversa_resoluciones;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'compras.recepciones.cerrar');
 payload:=app.receipt_reversal_request_615(p_actor_id,p_recepcion_id,p_payload,k);fp:=app.inventory_operation_fingerprint_455(payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:RECEPCION_REVERSA:%s',p_tenant_id,k),0));
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'compras.recepciones.cerrar');
 SELECT * INTO r FROM public.inventario_reversas WHERE tenant_id=p_tenant_id AND tipo='RECEPCION' AND idempotency_key=k FOR UPDATE;
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'compras.recepciones.cerrar');
 IF r.id IS NOT NULL THEN
  IF r.fingerprint IS DISTINCT FROM fp OR r.resultado IS NULL THEN
   RAISE EXCEPTION 'INVENTORY_REVERSAL_RESOLUTION_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('status','COMMITTED','receipt',r.resultado||'{"idempotent":true}'::jsonb,
   'detail',public.consultar_reversa_recepcion_616(p_tenant_id,p_actor_id,p_recepcion_id,k));
 END IF;
 SELECT * INTO f FROM public.inventario_reversa_resoluciones WHERE tenant_id=p_tenant_id AND tipo='RECEPCION' AND idempotency_key=k FOR UPDATE;
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'compras.recepciones.cerrar');
 IF f.id IS NOT NULL THEN
  IF f.fingerprint IS DISTINCT FROM fp THEN RAISE EXCEPTION 'INVENTORY_REVERSAL_RESOLUTION_CONFLICT' USING ERRCODE='23505';END IF;
 ELSE
  PERFORM 1 FROM public.recepciones WHERE tenant_id=p_tenant_id AND id=p_recepcion_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_REVERSAL_NOT_FOUND' USING ERRCODE='P0002';END IF;
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'compras.recepciones.cerrar');
  INSERT INTO public.inventario_reversa_resoluciones(tenant_id,tipo,fuente_id,actor_id,idempotency_key,fingerprint,payload)
   VALUES(p_tenant_id,'RECEPCION',p_recepcion_id,p_actor_id,k,fp,payload) RETURNING * INTO f;
 END IF;
 RETURN jsonb_build_object('status','ABANDONED','resolution',jsonb_build_object('id',f.id,'type','RECEPCION_REVERSA',
  'tenant_id',f.tenant_id,'actor_id',f.actor_id,'source_operation_id',f.fuente_id,'idempotency_key',f.idempotency_key,
  'request_payload',f.payload,'request_fingerprint',f.fingerprint,'confirmed_at',f.created_at));
END $fn$;
REVOKE ALL ON FUNCTION public.consultar_reversa_recepcion_616(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.resolver_reversa_recepcion_616(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_reversa_recepcion_616(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_reversa_recepcion_616(uuid,uuid,uuid,jsonb,text) TO service_role;
COMMIT;
