-- Edición de recepciones en borrador mediante writer transaccional.
-- service_role no recibe DML directo; sin backfill.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE OR REPLACE FUNCTION public.actualizar_recepcion_tx_568(
 p_tenant_id uuid, p_actor_id uuid, p_recepcion_id uuid, p_observaciones text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE v_row public.recepciones; v_obs text:=nullif(btrim(coalesce(p_observaciones,'')),'');
BEGIN
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_recepcion_id IS NULL OR length(coalesce(v_obs,''))>2000 THEN
  RAISE EXCEPTION 'RECEPCION_UPDATE_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM app.assert_actor_461(p_tenant_id,p_actor_id);
 SELECT * INTO v_row FROM public.recepciones WHERE id=p_recepcion_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEPCION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF upper(v_row.estado::text)<>'BORRADOR' THEN RAISE EXCEPTION 'RECEPCION_NOT_EDITABLE' USING ERRCODE='55000'; END IF;
 IF v_row.observaciones IS NOT DISTINCT FROM v_obs THEN
  RETURN jsonb_build_object('id',v_row.id,'estado',v_row.estado,'idempotent',true);
 END IF;
 UPDATE public.recepciones SET observaciones=v_obs,updated_at=now(),updated_by=p_actor_id
 WHERE id=p_recepcion_id AND tenant_id=p_tenant_id;
 RETURN jsonb_build_object('id',v_row.id,'estado',v_row.estado,'idempotent',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.actualizar_recepcion_tx_568(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_recepcion_tx_568(uuid,uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
