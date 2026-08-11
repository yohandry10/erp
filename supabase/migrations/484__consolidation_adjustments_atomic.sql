BEGIN;
SET lock_timeout='10s';
SET statement_timeout='120s';

CREATE OR REPLACE FUNCTION app.gestionar_consolidacion_tx_484(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_grupo_id uuid,
  p_accion text,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE
  v_key text:=lower(btrim(coalesce(p_idempotency_key,'')));
  v_action text:=upper(btrim(coalesce(p_accion,'')));
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_fp text;
  v_op public.financial_master_operations%ROWTYPE;
  v_group public.grupos_consolidacion%ROWTYPE;
  v_member uuid;
  v_origin text;
  v_destination text;
  v_id uuid;
  v_result jsonb;
  v_debit numeric;
  v_credit numeric;
BEGIN
  PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
  IF p_grupo_id IS NULL OR v_action NOT IN ('RATE','ACCOUNT_MAP','ADJUSTMENT')
     OR length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'CONSOLIDATION_REQUEST_INVALID';
  END IF;
  v_fp:=app.financial_master_fingerprint_477(jsonb_build_object(
    'group_id',p_grupo_id,'action',v_action,'payload',v_payload
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':consolidation:'||v_key,0));
  SELECT * INTO v_op FROM public.financial_master_operations
   WHERE tenant_id=p_tenant_id AND operation_type='CONSOLIDATION_'||v_action AND idempotency_key=v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint<>v_fp OR v_op.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'CONSOLIDATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_op.result||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_group FROM public.grupos_consolidacion
   WHERE id=p_grupo_id AND tenant_id=p_tenant_id AND activo=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONSOLIDATION_CONTROLLER_REQUIRED'; END IF;

  IF v_action='RATE' THEN
    v_member:=nullif(v_payload->>'tenant_miembro_id','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.grupos_consolidacion_miembros
      WHERE grupo_id=p_grupo_id AND tenant_id=v_member AND estado='ACTIVO') THEN
      RAISE EXCEPTION 'CONSOLIDATION_ACTIVE_MEMBER_REQUIRED';
    END IF;
    SELECT upper(moneda_defecto) INTO v_origin FROM public.empresa_config WHERE tenant_id=v_member;
    v_destination:=upper(v_group.moneda_presentacion);
    IF v_origin IS NULL OR v_origin=v_destination THEN RAISE EXCEPTION 'CONSOLIDATION_RATE_NOT_REQUIRED'; END IF;
    INSERT INTO public.tipos_cambio_consolidacion(
      grupo_id,tenant_id,miembro_tenant_id,fecha,tipo,moneda_origen,moneda_destino,
      factor_conversion,created_by,updated_at
    ) VALUES(
      p_grupo_id,p_tenant_id,v_member,(v_payload->>'fecha')::date,upper(v_payload->>'tipo'),
      v_origin,v_destination,(v_payload->>'factor_conversion')::numeric,p_actor_id::text,clock_timestamp()
    ) ON CONFLICT(grupo_id,miembro_tenant_id,fecha,tipo) DO UPDATE SET
      factor_conversion=excluded.factor_conversion,moneda_origen=excluded.moneda_origen,
      moneda_destino=excluded.moneda_destino,created_by=excluded.created_by,updated_at=clock_timestamp()
    RETURNING id INTO v_id;
  ELSIF v_action='ACCOUNT_MAP' THEN
    v_member:=nullif(v_payload->>'tenant_miembro_id','')::uuid;
    v_origin:=btrim(v_payload->>'cuenta_codigo_origen');
    v_destination:=btrim(v_payload->>'cuenta_codigo_destino');
    IF v_member=p_tenant_id OR NOT EXISTS(SELECT 1 FROM public.grupos_consolidacion_miembros
      WHERE grupo_id=p_grupo_id AND tenant_id=v_member AND estado='ACTIVO') THEN
      RAISE EXCEPTION 'CONSOLIDATION_ACTIVE_EXTERNAL_MEMBER_REQUIRED';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_member AND codigo=v_origin AND activo=true)
       OR NOT EXISTS(SELECT 1 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo=v_destination AND activo=true) THEN
      RAISE EXCEPTION 'CONSOLIDATION_ACCOUNT_NOT_FOUND';
    END IF;
    INSERT INTO public.mapeos_cuentas_consolidacion(
      grupo_id,tenant_id,miembro_tenant_id,cuenta_codigo_origen,cuenta_codigo_destino,created_by,updated_at
    ) VALUES(p_grupo_id,p_tenant_id,v_member,v_origin,v_destination,p_actor_id::text,clock_timestamp())
    ON CONFLICT(grupo_id,miembro_tenant_id,cuenta_codigo_origen) DO UPDATE SET
      cuenta_codigo_destino=excluded.cuenta_codigo_destino,created_by=excluded.created_by,updated_at=clock_timestamp()
    RETURNING id INTO v_id;
  ELSE
    v_debit:=coalesce((v_payload->>'debe')::numeric,0);
    v_credit:=coalesce((v_payload->>'haber')::numeric,0);
    v_destination:=btrim(v_payload->>'cuenta_codigo');
    IF (v_debit>0)=(v_credit>0) OR NOT EXISTS(
      SELECT 1 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo=v_destination AND activo=true
    ) THEN RAISE EXCEPTION 'CONSOLIDATION_ADJUSTMENT_INVALID'; END IF;
    INSERT INTO public.ajustes_consolidacion(
      grupo_id,tenant_id,fecha,tipo,cuenta_codigo,descripcion,debe,haber,referencia,created_by
    ) VALUES(
      p_grupo_id,p_tenant_id,(v_payload->>'fecha')::date,upper(v_payload->>'tipo'),v_destination,
      btrim(v_payload->>'descripcion'),v_debit,v_credit,nullif(btrim(v_payload->>'referencia'),''),p_actor_id::text
    ) RETURNING id INTO v_id;
  END IF;
  SELECT to_jsonb(x) INTO v_result FROM (
    SELECT v_id AS id,p_grupo_id AS grupo_id,v_action AS accion,false AS idempotent
  ) x;
  INSERT INTO public.financial_master_operations(
    tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result
  ) VALUES(p_tenant_id,'CONSOLIDATION_'||v_action,v_key,v_fp,p_actor_id,v_id,v_result);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.gestionar_consolidacion_tx_484($1,$2,$3,$4,$5,$6) $$;

REVOKE ALL ON FUNCTION app.gestionar_consolidacion_tx_484(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.tipos_cambio_consolidacion,public.mapeos_cuentas_consolidacion,public.ajustes_consolidacion FROM service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
