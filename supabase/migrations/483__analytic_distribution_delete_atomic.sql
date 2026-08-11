BEGIN;
SET lock_timeout='10s';SET statement_timeout='120s';
CREATE OR REPLACE FUNCTION app.eliminar_distribucion_analitica_tx_483(
 p_tenant_id uuid,p_actor_id uuid,p_detalle_id uuid,p_eje text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE k text:=lower(btrim(coalesce(p_idempotency_key,''))); axis text:=upper(btrim(coalesce(p_eje,'CENTRO_COSTO')));
 fp text;op public.financial_master_operations%ROWTYPE;entry public.detalle_asientos%ROWTYPE;result jsonb;removed integer;
BEGIN
 PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
 IF length(k) NOT BETWEEN 8 AND 200 OR p_detalle_id IS NULL OR axis='' THEN RAISE EXCEPTION 'ANALYTIC_DELETE_REQUEST_INVALID';END IF;
 fp:=app.financial_master_fingerprint_477(jsonb_build_object('detalle_id',p_detalle_id,'eje',axis));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':analytic-delete:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='ANALYTIC_DISTRIBUTION_DELETE' AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN IF op.request_fingerprint<>fp OR op.actor_id<>p_actor_id THEN RAISE EXCEPTION 'ANALYTIC_DELETE_IDEMPOTENCY_CONFLICT';END IF;
  RETURN op.result||jsonb_build_object('idempotent',true);END IF;
 SELECT * INTO entry FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND id=p_detalle_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ANALYTIC_DETAIL_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.asientos_contables a WHERE a.tenant_id=p_tenant_id AND a.id=entry.asiento_id
  AND upper(coalesce(a.estado,''))<>'BORRADOR') THEN RAISE EXCEPTION 'ANALYTIC_POSTED_ENTRY_IMMUTABLE';END IF;
 DELETE FROM public.distribucion_analitica WHERE tenant_id=p_tenant_id AND detalle_asiento_id=p_detalle_id AND eje=axis;
 GET DIAGNOSTICS removed=ROW_COUNT;
 result:=jsonb_build_object('success',true,'detalle_id',p_detalle_id,'eje',axis,'removed',removed,'idempotent',false);
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
 VALUES(p_tenant_id,'ANALYTIC_DISTRIBUTION_DELETE',k,fp,p_actor_id,p_detalle_id,result);RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.eliminar_distribucion_analitica_tx(uuid,uuid,uuid,text,text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.eliminar_distribucion_analitica_tx_483($1,$2,$3,$4,$5) $$;
REVOKE ALL ON FUNCTION app.eliminar_distribucion_analitica_tx_483(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.eliminar_distribucion_analitica_tx(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_distribucion_analitica_tx(uuid,uuid,uuid,text,text) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.distribucion_analitica,public.financial_master_operations FROM service_role;
COMMIT;NOTIFY pgrst,'reload schema';
