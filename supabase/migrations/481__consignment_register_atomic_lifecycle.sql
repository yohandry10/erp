BEGIN;
SET lock_timeout='10s'; SET statement_timeout='120s';
CREATE OR REPLACE FUNCTION app.gestionar_consignacion_tx_481(
 p_tenant_id uuid,p_actor_id uuid,p_action text,p_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE a text:=upper(btrim(coalesce(p_action,''))); k text:=lower(btrim(coalesce(p_idempotency_key,'')));
 typ text; fp text; op public.financial_master_operations%ROWTYPE; row public.registro_consignaciones%ROWTYPE;
 rid uuid:=coalesce(p_id,gen_random_uuid()); qty numeric; price numeric; target text; result jsonb;
BEGIN
 PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
 IF a NOT IN('CREATE','TRANSITION') OR (a='CREATE' AND p_id IS NOT NULL) OR (a='TRANSITION' AND p_id IS NULL)
  OR length(k) NOT BETWEEN 8 AND 200 OR jsonb_typeof(coalesce(p_payload,'null'))<>'object' THEN RAISE EXCEPTION 'CONSIGNMENT_REQUEST_INVALID'; END IF;
 typ:='CONSIGNMENT_'||a; fp:=app.financial_master_fingerprint_477(jsonb_build_object('action',a,'id',p_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':consignment:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type=typ AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN IF op.request_fingerprint<>fp OR op.actor_id<>p_actor_id THEN RAISE EXCEPTION 'CONSIGNMENT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN op.result||jsonb_build_object('idempotent',true); END IF;
 IF a='CREATE' THEN
  qty:=(p_payload->>'cantidad')::numeric; price:=(p_payload->>'valor_unitario')::numeric;
  IF qty<=0 OR price<0 OR nullif(btrim(p_payload->>'consignatario_nombre'),'') IS NULL THEN RAISE EXCEPTION 'CONSIGNMENT_VALUES_INVALID'; END IF;
  IF app.to_uuid_or_null(p_payload->>'producto_id') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.productos p WHERE p.tenant_id=p_tenant_id AND p.id=app.to_uuid_or_null(p_payload->>'producto_id')
  ) THEN RAISE EXCEPTION 'CONSIGNMENT_PRODUCT_INVALID'; END IF;
  INSERT INTO public.registro_consignaciones(id,tenant_id,numero,fecha_registro,fecha_entrega,producto_id,
   consignatario_nombre,cantidad,valor_unitario,valor_total,moneda,estado,activo,metadata)
  VALUES(rid,p_tenant_id,nullif(btrim(p_payload->>'numero'),''),coalesce((p_payload->>'fecha_registro')::date,current_date),
   (p_payload->>'fecha_entrega')::date,app.to_uuid_or_null(p_payload->>'producto_id'),btrim(p_payload->>'consignatario_nombre'),
   qty,price,round(qty*price,2),upper(coalesce(nullif(btrim(p_payload->>'moneda'),''),'PEN')),'PENDIENTE',true,
   jsonb_build_object('created_by',p_actor_id)) RETURNING to_jsonb(registro_consignaciones.*) INTO result;
 ELSE
  SELECT * INTO row FROM public.registro_consignaciones WHERE tenant_id=p_tenant_id AND id=rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONSIGNMENT_NOT_FOUND'; END IF;
  target:=upper(btrim(coalesce(p_payload->>'estado','')));
  IF NOT ((upper(row.estado)='PENDIENTE' AND target IN('VENDIDA','DEVUELTA','ANULADA'))
    OR (upper(row.estado)='VENDIDA' AND target='CERRADA')) THEN
   RAISE EXCEPTION 'CONSIGNMENT_TRANSITION_INVALID:%->%',row.estado,target; END IF;
  UPDATE public.registro_consignaciones SET estado=target,updated_at=clock_timestamp(),
   metadata=coalesce(metadata,'{}')||jsonb_build_object('updated_by',p_actor_id,'transitioned_at',clock_timestamp())
   WHERE tenant_id=p_tenant_id AND id=rid RETURNING to_jsonb(registro_consignaciones.*) INTO result;
 END IF;
 result:=jsonb_build_object('success',true,'id',rid,'record',result,'action',a,'idempotent',false);
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
 VALUES(p_tenant_id,typ,k,fp,p_actor_id,rid,result);
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.gestionar_consignacion_tx(uuid,uuid,text,uuid,jsonb,text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.gestionar_consignacion_tx_481($1,$2,$3,$4,$5,$6) $$;
REVOKE ALL ON FUNCTION app.gestionar_consignacion_tx_481(uuid,uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestionar_consignacion_tx(uuid,uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_consignacion_tx(uuid,uuid,text,uuid,jsonb,text) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.registro_consignaciones,public.financial_master_operations FROM service_role;
COMMIT; NOTIFY pgrst,'reload schema';
