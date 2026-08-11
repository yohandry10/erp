BEGIN;
SET lock_timeout='10s';
SET statement_timeout='120s';

CREATE OR REPLACE FUNCTION app.gestionar_activo_diferido_tx_479(
 p_tenant_id uuid,p_actor_id uuid,p_entity text,p_action text,p_record_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE
 e text:=upper(btrim(coalesce(p_entity,''))); a text:=upper(btrim(coalesce(p_action,'')));
 k text:=lower(btrim(coalesce(p_idempotency_key,''))); typ text; fp text;
 op public.financial_master_operations%ROWTYPE; rid uuid:=coalesce(p_record_id,gen_random_uuid()); result jsonb;
 asset public.activos_fijos%ROWTYPE; deferred public.diferidos%ROWTYPE;
 residual numeric; acquisition numeric; periods integer; total numeric;
BEGIN
 PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
 IF e NOT IN ('ASSET','DEFERRED') OR a NOT IN ('CREATE','UPDATE','CANCEL')
    OR (a='CREATE' AND p_record_id IS NOT NULL) OR (a<>'CREATE' AND p_record_id IS NULL)
    OR length(k) NOT BETWEEN 8 AND 200 OR jsonb_typeof(coalesce(p_payload,'null'))<>'object' THEN
   RAISE EXCEPTION 'ACCOUNTING_MASTER_REQUEST_INVALID';
 END IF;
 IF e='ASSET' AND a='CANCEL' OR e='DEFERRED' AND a='UPDATE' THEN
   RAISE EXCEPTION 'ACCOUNTING_MASTER_ACTION_INVALID';
 END IF;
 typ:='ACCOUNTING_'||e||'_'||a;
 fp:=app.financial_master_fingerprint_477(jsonb_build_object('entity',e,'action',a,'id',p_record_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||lower(e)||':'||k,0));
 SELECT * INTO op FROM public.financial_master_operations
  WHERE tenant_id=p_tenant_id AND operation_type=typ AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF op.request_fingerprint<>fp OR op.actor_id<>p_actor_id THEN RAISE EXCEPTION 'ACCOUNTING_MASTER_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN op.result||jsonb_build_object('idempotent',true);
 END IF;

 IF e='ASSET' THEN
  IF a='CREATE' THEN
   acquisition:=(p_payload->>'valor_adquisicion')::numeric; residual:=coalesce((p_payload->>'valor_residual')::numeric,0);
   periods:=(p_payload->>'vida_util_meses')::integer;
   IF nullif(btrim(p_payload->>'codigo'),'') IS NULL OR nullif(btrim(p_payload->>'nombre'),'') IS NULL
      OR acquisition<=0 OR residual<0 OR residual>acquisition OR periods<=0 THEN RAISE EXCEPTION 'ASSET_VALUES_INVALID'; END IF;
   INSERT INTO public.activos_fijos(id,tenant_id,codigo,nombre,descripcion,fecha_adquisicion,valor_adquisicion,
    valor_residual,vida_util_meses,metodo_depreciacion,fecha_inicio_depreciacion,depreciacion_acumulada,
    situacion,centro_costo_id,estado,activo,created_by)
   VALUES(rid,p_tenant_id,btrim(p_payload->>'codigo'),btrim(p_payload->>'nombre'),nullif(btrim(p_payload->>'descripcion'),''),
    (p_payload->>'fecha_adquisicion')::date,round(acquisition,2),round(residual,2),periods,'LINEAL',
    coalesce((p_payload->>'fecha_inicio_depreciacion')::date,(p_payload->>'fecha_adquisicion')::date),0,'ACTIVO',
    app.to_uuid_or_null(p_payload->>'centro_costo_id'),'ACTIVO',true,p_actor_id::text)
   RETURNING to_jsonb(activos_fijos.*) INTO result;
  ELSE
   SELECT * INTO asset FROM public.activos_fijos WHERE tenant_id=p_tenant_id AND id=rid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'ASSET_NOT_FOUND'; END IF;
   IF upper(coalesce(asset.situacion,''))<>'ACTIVO' THEN RAISE EXCEPTION 'ASSET_UPDATE_STATE_INVALID:%',asset.situacion; END IF;
   residual:=coalesce((p_payload->>'valor_residual')::numeric,asset.valor_residual);
   IF residual<0 OR residual>asset.valor_adquisicion THEN RAISE EXCEPTION 'ASSET_RESIDUAL_INVALID'; END IF;
   UPDATE public.activos_fijos SET nombre=coalesce(nullif(btrim(p_payload->>'nombre'),''),nombre),
    descripcion=CASE WHEN p_payload?'descripcion' THEN nullif(btrim(p_payload->>'descripcion'),'') ELSE descripcion END,
    vida_util_meses=coalesce((p_payload->>'vida_util_meses')::integer,vida_util_meses),valor_residual=round(residual,2),
    centro_costo_id=CASE WHEN p_payload?'centro_costo_id' THEN app.to_uuid_or_null(p_payload->>'centro_costo_id') ELSE centro_costo_id END,
    updated_at=clock_timestamp() WHERE tenant_id=p_tenant_id AND id=rid RETURNING to_jsonb(activos_fijos.*) INTO result;
  END IF;
 ELSE
  IF a='CREATE' THEN
   total:=(p_payload->>'monto_total')::numeric; periods:=(p_payload->>'periodos')::integer;
   IF nullif(btrim(p_payload->>'nombre'),'') IS NULL OR upper(p_payload->>'tipo') NOT IN ('GASTO','INGRESO')
      OR total<=0 OR periods<=0 OR app.to_uuid_or_null(p_payload->>'cuenta_diferido_id') IS NULL
      OR app.to_uuid_or_null(p_payload->>'cuenta_resultado_id') IS NULL
      OR p_payload->>'cuenta_diferido_id'=p_payload->>'cuenta_resultado_id' THEN RAISE EXCEPTION 'DEFERRED_VALUES_INVALID'; END IF;
   IF (SELECT count(*) FROM public.plan_cuentas pc WHERE pc.tenant_id=p_tenant_id AND pc.id IN
      (app.to_uuid_or_null(p_payload->>'cuenta_diferido_id'),app.to_uuid_or_null(p_payload->>'cuenta_resultado_id'))
      AND coalesce(pc.activo,true) AND coalesce(pc.acepta_movimiento,false))<>2 THEN RAISE EXCEPTION 'DEFERRED_ACCOUNTS_INVALID'; END IF;
   INSERT INTO public.diferidos(id,tenant_id,codigo,nombre,descripcion,tipo,cuenta_diferido_id,cuenta_resultado_id,
    monto_total,monto_devengado,periodos,fecha_inicio,centro_costo_id,estado,created_by)
   VALUES(rid,p_tenant_id,nullif(btrim(p_payload->>'codigo'),''),btrim(p_payload->>'nombre'),nullif(btrim(p_payload->>'descripcion'),''),
    upper(p_payload->>'tipo'),app.to_uuid_or_null(p_payload->>'cuenta_diferido_id'),app.to_uuid_or_null(p_payload->>'cuenta_resultado_id'),
    round(total,2),0,periods,(p_payload->>'fecha_inicio')::date,app.to_uuid_or_null(p_payload->>'centro_costo_id'),'VIGENTE',p_actor_id::text)
   RETURNING to_jsonb(diferidos.*) INTO result;
  ELSE
   SELECT * INTO deferred FROM public.diferidos WHERE tenant_id=p_tenant_id AND id=rid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEFERRED_NOT_FOUND'; END IF;
   IF upper(coalesce(deferred.estado,''))<>'VIGENTE' THEN RAISE EXCEPTION 'DEFERRED_CANCEL_STATE_INVALID:%',deferred.estado; END IF;
   UPDATE public.diferidos SET estado='CANCELADO',updated_at=clock_timestamp()
    WHERE tenant_id=p_tenant_id AND id=rid RETURNING to_jsonb(diferidos.*) INTO result;
  END IF;
 END IF;
 result:=jsonb_build_object('success',true,'id',rid,'entity',e,'action',a,'record',result,'idempotent',false);
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
 VALUES(p_tenant_id,typ,k,fp,p_actor_id,rid,result);
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gestionar_activo_diferido_tx(
 p_tenant_id uuid,p_actor_id uuid,p_entity text,p_action text,p_record_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.gestionar_activo_diferido_tx_479($1,$2,$3,$4,$5,$6,$7) $$;

REVOKE ALL ON FUNCTION app.gestionar_activo_diferido_tx_479(uuid,uuid,text,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestionar_activo_diferido_tx(uuid,uuid,text,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_activo_diferido_tx(uuid,uuid,text,text,uuid,jsonb,text) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.activos_fijos,public.diferidos,public.financial_master_operations FROM service_role;

COMMIT;
NOTIFY pgrst,'reload schema';
