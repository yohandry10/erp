BEGIN;
SET lock_timeout='10s'; SET statement_timeout='120s';

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.presupuestos GROUP BY tenant_id,centro_costo_id,cuenta_id,periodo_contable_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'BUDGET_DUPLICATES_PREFLIGHT'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_presupuestos_scope_480
 ON public.presupuestos(tenant_id,centro_costo_id,cuenta_id,periodo_contable_id);

CREATE OR REPLACE FUNCTION app.gestionar_presupuesto_tx_480(
 p_tenant_id uuid,p_actor_id uuid,p_action text,p_presupuesto_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE a text:=upper(btrim(coalesce(p_action,''))); k text:=lower(btrim(coalesce(p_idempotency_key,'')));
 typ text; fp text; op public.financial_master_operations%ROWTYPE; b public.presupuestos%ROWTYPE;
 period public.periodos_contables%ROWTYPE; rid uuid:=coalesce(p_presupuesto_id,gen_random_uuid()); amount numeric; result jsonb;
BEGIN
 PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
 IF a NOT IN('CREATE','UPDATE','DELETE') OR (a='CREATE' AND p_presupuesto_id IS NOT NULL)
  OR (a<>'CREATE' AND p_presupuesto_id IS NULL) OR length(k) NOT BETWEEN 8 AND 200
  OR jsonb_typeof(coalesce(p_payload,'null'))<>'object' THEN RAISE EXCEPTION 'BUDGET_REQUEST_INVALID'; END IF;
 typ:='BUDGET_'||a; fp:=app.financial_master_fingerprint_477(jsonb_build_object('action',a,'id',p_presupuesto_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':budget:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type=typ AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF op.request_fingerprint<>fp OR op.actor_id<>p_actor_id THEN RAISE EXCEPTION 'BUDGET_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN op.result||jsonb_build_object('idempotent',true);
 END IF;
 IF a='CREATE' THEN
  amount:=(p_payload->>'monto_presupuestado')::numeric;
  SELECT * INTO period FROM public.periodos_contables WHERE tenant_id=p_tenant_id
   AND id=app.to_uuid_or_null(p_payload->>'periodo_contable_id') FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(period.estado,''))='CERRADO' THEN RAISE EXCEPTION 'BUDGET_PERIOD_NOT_OPEN'; END IF;
  IF amount<=0 OR NOT EXISTS(SELECT 1 FROM public.centros_costo c WHERE c.tenant_id=p_tenant_id AND c.id=app.to_uuid_or_null(p_payload->>'centro_costo_id'))
    OR NOT EXISTS(SELECT 1 FROM public.plan_cuentas pc WHERE pc.tenant_id=p_tenant_id AND pc.id=app.to_uuid_or_null(p_payload->>'cuenta_id') AND coalesce(pc.activo,true))
  THEN RAISE EXCEPTION 'BUDGET_VALUES_INVALID'; END IF;
  INSERT INTO public.presupuestos(id,tenant_id,centro_costo_id,cuenta_id,periodo_contable_id,monto_presupuestado,
   monto_ejecutado,monto_comprometido,estado,notas,created_by,updated_by)
  VALUES(rid,p_tenant_id,app.to_uuid_or_null(p_payload->>'centro_costo_id'),app.to_uuid_or_null(p_payload->>'cuenta_id'),
   period.id,round(amount,2),0,0,coalesce(nullif(upper(btrim(p_payload->>'estado')),''),'ACTIVO'),
   nullif(btrim(p_payload->>'notas'),''),p_actor_id,p_actor_id)
  RETURNING to_jsonb(presupuestos.*) INTO result;
 ELSE
  SELECT * INTO b FROM public.presupuestos WHERE tenant_id=p_tenant_id AND id=rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_NOT_FOUND'; END IF;
  SELECT * INTO period FROM public.periodos_contables WHERE tenant_id=p_tenant_id AND id=b.periodo_contable_id FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(period.estado,''))='CERRADO' THEN RAISE EXCEPTION 'BUDGET_PERIOD_NOT_OPEN'; END IF;
  IF a='UPDATE' THEN
   amount:=coalesce((p_payload->>'monto_presupuestado')::numeric,b.monto_presupuestado);
   IF amount<=0 THEN RAISE EXCEPTION 'BUDGET_AMOUNT_INVALID'; END IF;
   UPDATE public.presupuestos SET monto_presupuestado=round(amount,2),
    notas=CASE WHEN p_payload?'notas' THEN nullif(btrim(p_payload->>'notas'),'') ELSE notas END,
    estado=coalesce(nullif(upper(btrim(p_payload->>'estado')),''),estado),updated_by=p_actor_id,updated_at=clock_timestamp()
   WHERE tenant_id=p_tenant_id AND id=rid RETURNING to_jsonb(presupuestos.*) INTO result;
  ELSE
   result:=to_jsonb(b); DELETE FROM public.presupuestos WHERE tenant_id=p_tenant_id AND id=rid;
  END IF;
 END IF;
 result:=jsonb_build_object('success',true,'id',rid,'action',a,'record',result,'idempotent',false);
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
 VALUES(p_tenant_id,typ,k,fp,p_actor_id,rid,result);
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.gestionar_presupuesto_tx(uuid,uuid,text,uuid,jsonb,text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.gestionar_presupuesto_tx_480($1,$2,$3,$4,$5,$6) $$;
REVOKE ALL ON FUNCTION app.gestionar_presupuesto_tx_480(uuid,uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestionar_presupuesto_tx(uuid,uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_presupuesto_tx(uuid,uuid,text,uuid,jsonb,text) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.presupuestos,public.financial_master_operations FROM service_role;
COMMIT; NOTIFY pgrst,'reload schema';
