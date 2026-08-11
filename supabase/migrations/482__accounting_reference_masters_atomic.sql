BEGIN;
SET lock_timeout='10s'; SET statement_timeout='120s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.tipos_cambio GROUP BY tenant_id,moneda_origen,moneda_destino,fecha HAVING count(*)>1)
 THEN RAISE EXCEPTION 'FX_DUPLICATES_PREFLIGHT'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_cambio_pair_date_482
 ON public.tipos_cambio(tenant_id,moneda_origen,moneda_destino,fecha);
CREATE OR REPLACE FUNCTION app.gestionar_maestro_contable_tx_482(
 p_tenant_id uuid,p_actor_id uuid,p_entity text,p_action text,p_record_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE e text:=upper(btrim(coalesce(p_entity,''))); a text:=upper(btrim(coalesce(p_action,'')));
 k text:=lower(btrim(coalesce(p_idempotency_key,''))); typ text; fp text; op public.financial_master_operations%ROWTYPE;
 rid uuid:=coalesce(p_record_id,gen_random_uuid()); result jsonb; buy numeric; sell numeric; origin text; destination text;
BEGIN
 PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
 IF e NOT IN('COST_CENTER','PERIOD','FX') OR a NOT IN('CREATE','UPDATE','DEACTIVATE')
  OR (a='CREATE' AND p_record_id IS NOT NULL AND e<>'FX') OR (a<>'CREATE' AND p_record_id IS NULL)
  OR (e='PERIOD' AND a<>'CREATE') OR length(k) NOT BETWEEN 8 AND 200
  OR jsonb_typeof(coalesce(p_payload,'null'))<>'object' THEN RAISE EXCEPTION 'ACCOUNTING_REFERENCE_REQUEST_INVALID'; END IF;
 typ:='ACCOUNTING_REFERENCE_'||e||'_'||a; fp:=app.financial_master_fingerprint_477(jsonb_build_object('entity',e,'action',a,'id',p_record_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':reference:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type=typ AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN IF op.request_fingerprint<>fp OR op.actor_id<>p_actor_id THEN RAISE EXCEPTION 'ACCOUNTING_REFERENCE_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN op.result||jsonb_build_object('idempotent',true); END IF;
 IF e='COST_CENTER' THEN
  IF a='CREATE' THEN
   IF nullif(btrim(p_payload->>'codigo'),'') IS NULL OR nullif(btrim(p_payload->>'nombre'),'') IS NULL THEN RAISE EXCEPTION 'COST_CENTER_VALUES_INVALID'; END IF;
   INSERT INTO public.centros_costo(id,tenant_id,codigo,nombre,descripcion,eje,activo,estado,metadata)
   VALUES(rid,p_tenant_id,upper(btrim(p_payload->>'codigo')),btrim(p_payload->>'nombre'),nullif(btrim(p_payload->>'descripcion'),''),
    upper(coalesce(nullif(btrim(p_payload->>'eje'),''),'CENTRO_COSTO')),true,'ACTIVO',jsonb_build_object('created_by',p_actor_id))
   RETURNING to_jsonb(centros_costo.*) INTO result;
  ELSE
   PERFORM 1 FROM public.centros_costo WHERE tenant_id=p_tenant_id AND id=rid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'COST_CENTER_NOT_FOUND'; END IF;
   IF a='DEACTIVATE' AND EXISTS(SELECT 1 FROM public.presupuestos b WHERE b.tenant_id=p_tenant_id AND b.centro_costo_id=rid AND upper(b.estado)='ACTIVO')
    THEN RAISE EXCEPTION 'COST_CENTER_HAS_ACTIVE_BUDGET'; END IF;
   UPDATE public.centros_costo SET codigo=coalesce(nullif(upper(btrim(p_payload->>'codigo')),''),codigo),
    nombre=coalesce(nullif(btrim(p_payload->>'nombre'),''),nombre),descripcion=CASE WHEN p_payload?'descripcion' THEN nullif(btrim(p_payload->>'descripcion'),'') ELSE descripcion END,
    activo=CASE WHEN a='DEACTIVATE' THEN false ELSE coalesce((p_payload->>'activo')::boolean,activo) END,
    estado=CASE WHEN a='DEACTIVATE' THEN 'INACTIVO' ELSE estado END,updated_at=clock_timestamp(),
    metadata=coalesce(metadata,'{}')||jsonb_build_object('updated_by',p_actor_id)
   WHERE tenant_id=p_tenant_id AND id=rid RETURNING to_jsonb(centros_costo.*) INTO result;
  END IF;
 ELSIF e='PERIOD' THEN
  IF (p_payload->>'anio')::integer NOT BETWEEN 2000 AND 2200 OR (p_payload->>'mes')::integer NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'PERIOD_VALUES_INVALID'; END IF;
  INSERT INTO public.periodos_contables(id,tenant_id,codigo,nombre,anio,mes,estado,metadata)
  VALUES(rid,p_tenant_id,(p_payload->>'anio')||'-'||lpad(p_payload->>'mes',2,'0'),
   'Periodo '||(p_payload->>'anio')||'-'||lpad(p_payload->>'mes',2,'0'),(p_payload->>'anio')::integer,(p_payload->>'mes')::integer,'ABIERTO',
   jsonb_build_object('created_by',p_actor_id)) RETURNING to_jsonb(periodos_contables.*) INTO result;
 ELSIF e='FX' THEN
  IF a='CREATE' THEN
   origin:=upper(btrim(p_payload->>'moneda_origen')); destination:=upper(btrim(p_payload->>'moneda_destino'));
   buy:=coalesce((p_payload->>'compra')::numeric,(p_payload->>'venta')::numeric); sell:=coalesce((p_payload->>'venta')::numeric,(p_payload->>'compra')::numeric);
   IF origin!~'^[A-Z]{3}$' OR destination!~'^[A-Z]{3}$' OR origin=destination OR buy<=0 OR sell<=0 THEN RAISE EXCEPTION 'FX_VALUES_INVALID'; END IF;
   INSERT INTO public.tipos_cambio(tenant_id,moneda_origen,moneda_destino,fecha,compra,venta,fuente,created_by,activo,estado)
   VALUES(p_tenant_id,origin,destination,(p_payload->>'fecha')::date,buy,sell,upper(coalesce(nullif(btrim(p_payload->>'fuente'),''),'MANUAL')),p_actor_id,true,'ACTIVO')
   ON CONFLICT(tenant_id,moneda_origen,moneda_destino,fecha) DO UPDATE SET compra=excluded.compra,venta=excluded.venta,
    fuente=excluded.fuente,activo=true,estado='ACTIVO',updated_at=clock_timestamp()
   RETURNING id,to_jsonb(tipos_cambio.*) INTO rid,result;
  ELSE
   UPDATE public.tipos_cambio SET activo=false,estado='INACTIVO',updated_at=clock_timestamp()
   WHERE tenant_id=p_tenant_id AND id=rid AND a='DEACTIVATE' RETURNING to_jsonb(tipos_cambio.*) INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'FX_NOT_FOUND_OR_ACTION_INVALID'; END IF;
  END IF;
 END IF;
 result:=jsonb_build_object('success',true,'id',rid,'entity',e,'action',a,'record',result,'idempotent',false);
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
 VALUES(p_tenant_id,typ,k,fp,p_actor_id,rid,result); RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.gestionar_maestro_contable_tx(uuid,uuid,text,text,uuid,jsonb,text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.gestionar_maestro_contable_tx_482($1,$2,$3,$4,$5,$6,$7) $$;
REVOKE ALL ON FUNCTION app.gestionar_maestro_contable_tx_482(uuid,uuid,text,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestionar_maestro_contable_tx(uuid,uuid,text,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_maestro_contable_tx(uuid,uuid,text,text,uuid,jsonb,text) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.centros_costo,public.periodos_contables,public.tipos_cambio,public.financial_master_operations FROM service_role;
COMMIT; NOTIFY pgrst,'reload schema';
