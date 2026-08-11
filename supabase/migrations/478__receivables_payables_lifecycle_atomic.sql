BEGIN;

SET lock_timeout = '10s';
SET statement_timeout = '120s';

CREATE OR REPLACE FUNCTION app.reprogramar_cxc_tx_478(
  p_tenant_id uuid, p_cxc_id uuid, p_actor_id uuid,
  p_fecha_vencimiento date, p_motivo text, p_comentarios text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_payload jsonb;
  v_fp text;
  v_op public.financial_master_operations%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_financial_master_actor_477(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 200 OR p_fecha_vencimiento IS NULL THEN
    RAISE EXCEPTION 'CXC_REPROGRAM_REQUEST_INVALID';
  END IF;
  v_payload := jsonb_build_object('cxc_id', p_cxc_id, 'fecha', p_fecha_vencimiento,
    'motivo', nullif(btrim(p_motivo), ''), 'comentarios', nullif(btrim(p_comentarios), ''));
  v_fp := app.financial_master_fingerprint_477(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cxc-reprogram:' || v_key, 0));
  SELECT * INTO v_op FROM public.financial_master_operations
   WHERE tenant_id=p_tenant_id AND operation_type='CXC_REPROGRAM' AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint<>v_fp OR v_op.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'CXC_REPROGRAM_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_op.result || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_cxc FROM public.cuentas_por_cobrar
   WHERE tenant_id=p_tenant_id AND id=p_cxc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CXC_NOT_FOUND'; END IF;
  IF upper(coalesce(v_cxc.estado,'')) IN ('ANULADA','CANCELADA','PAGADA','COBRADA')
     OR coalesce(v_cxc.saldo_pendiente, v_cxc.saldo, 0) <= 0 THEN
    RAISE EXCEPTION 'CXC_REPROGRAM_STATE_INVALID:%', v_cxc.estado;
  END IF;
  UPDATE public.cuentas_por_cobrar
     SET fecha_vencimiento=p_fecha_vencimiento,
         dias_mora=greatest(current_date-p_fecha_vencimiento,0), updated_at=clock_timestamp()
   WHERE tenant_id=p_tenant_id AND id=p_cxc_id
   RETURNING to_jsonb(cuentas_por_cobrar.*) INTO v_result;
  v_result := jsonb_build_object('success',true,'id',p_cxc_id,'cuenta',v_result,
    'fecha_anterior',v_cxc.fecha_vencimiento,'motivo',nullif(btrim(p_motivo),''),'idempotent',false);
  INSERT INTO public.financial_master_operations
    (tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
  VALUES (p_tenant_id,'CXC_REPROGRAM',v_key,v_fp,p_actor_id,p_cxc_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.gestionar_cxp_tx_478(
  p_tenant_id uuid, p_cxp_id uuid, p_actor_id uuid,
  p_action text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_action text := upper(btrim(coalesce(p_action,'')));
  v_key text := lower(btrim(coalesce(p_idempotency_key,'')));
  v_fp text;
  v_op public.financial_master_operations%ROWTYPE;
  v_cxp public.cuentas_por_pagar%ROWTYPE;
  v_result jsonb;
  v_event_id uuid;
BEGIN
  PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
  IF v_action NOT IN ('UPDATE_TERMS','CANCEL') OR length(v_key) NOT BETWEEN 8 AND 200
     OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'CXP_MANAGE_REQUEST_INVALID';
  END IF;
  IF v_action='UPDATE_TERMS' AND p_payload ?| ARRAY['subtotal','igv','total','saldo','moneda','proveedor_id','numero_documento','fecha_emision'] THEN
    RAISE EXCEPTION 'CXP_FINANCIAL_FIELDS_IMMUTABLE';
  END IF;
  v_fp := app.financial_master_fingerprint_477(jsonb_build_object('cxp_id',p_cxp_id,'action',v_action,'payload',p_payload));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cxp:' || v_key,0));
  SELECT * INTO v_op FROM public.financial_master_operations
   WHERE tenant_id=p_tenant_id AND operation_type='CXP_'||v_action AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint<>v_fp OR v_op.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'CXP_MANAGE_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_op.result || jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_cxp FROM public.cuentas_por_pagar
   WHERE tenant_id=p_tenant_id AND id=p_cxp_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CXP_NOT_FOUND'; END IF;

  IF v_action='UPDATE_TERMS' THEN
    IF upper(coalesce(v_cxp.estado,'')) IN ('PAGADA','ANULADA') THEN
      RAISE EXCEPTION 'CXP_UPDATE_STATE_INVALID:%',v_cxp.estado;
    END IF;
    UPDATE public.cuentas_por_pagar SET
      fecha_vencimiento=coalesce((p_payload->>'fecha_vencimiento')::date,fecha_vencimiento),
      condiciones_pago=coalesce(nullif(upper(btrim(p_payload->>'condiciones_pago')),''),condiciones_pago),
      dias_credito=coalesce((p_payload->>'dias_credito')::integer,dias_credito),
      observaciones=CASE WHEN p_payload ? 'observaciones' THEN nullif(btrim(p_payload->>'observaciones'),'') ELSE observaciones END,
      updated_at=clock_timestamp()
    WHERE tenant_id=p_tenant_id AND id=p_cxp_id
    RETURNING to_jsonb(cuentas_por_pagar.*) INTO v_result;
  ELSE
    IF upper(coalesce(v_cxp.estado,''))='ANULADA' THEN RAISE EXCEPTION 'CXP_ALREADY_CANCELLED'; END IF;
    IF abs(coalesce(v_cxp.saldo,0)-coalesce(v_cxp.total,0))>0.01 OR EXISTS (
      SELECT 1 FROM public.pagos_facturas p WHERE p.tenant_id=p_tenant_id
        AND p.cuenta_por_pagar_id=p_cxp_id AND coalesce(p.activo,true)
    ) THEN RAISE EXCEPTION 'CXP_CANCEL_HAS_APPLIED_PAYMENTS'; END IF;
    IF nullif(btrim(p_payload->>'motivo'),'') IS NULL THEN RAISE EXCEPTION 'CXP_CANCEL_REASON_REQUIRED'; END IF;
    UPDATE public.cuentas_por_pagar SET estado='ANULADA',anulado_at=clock_timestamp(),
      anulado_by=p_actor_id::text, observaciones=concat_ws(' ', 'ANULADA:',btrim(p_payload->>'motivo'),nullif(btrim(p_payload->>'observaciones'),'')),
      updated_at=clock_timestamp()
    WHERE tenant_id=p_tenant_id AND id=p_cxp_id
    RETURNING to_jsonb(cuentas_por_pagar.*) INTO v_result;
    v_event_id:=gen_random_uuid();
    INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at)
    VALUES(p_tenant_id,'CuentaPorPagar',p_cxp_id::text,'cxp.anulada',
      jsonb_build_object('tenantId',p_tenant_id,'cxpId',p_cxp_id,'proveedorId',v_cxp.proveedor_id,
        'numeroDocumento',v_cxp.numero_documento,'total',v_cxp.total,'motivo',p_payload->>'motivo',
        'actorId',p_actor_id,'eventId',v_event_id,'accountingHandledByOutbox',true),
      'pending',0,'cxp.anulada:'||p_tenant_id||':'||p_cxp_id,v_event_id,clock_timestamp());
  END IF;
  v_result:=jsonb_build_object('success',true,'id',p_cxp_id,'cuenta',v_result,'action',v_action,'idempotent',false);
  INSERT INTO public.financial_master_operations
    (tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
  VALUES(p_tenant_id,'CXP_'||v_action,v_key,v_fp,p_actor_id,p_cxp_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reprogramar_cxc_tx(
  p_tenant_id uuid,p_cxc_id uuid,p_actor_id uuid,p_fecha_vencimiento date,
  p_motivo text,p_comentarios text,p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.reprogramar_cxc_tx_478($1,$2,$3,$4,$5,$6,$7) $$;

CREATE OR REPLACE FUNCTION public.gestionar_cxp_tx(
  p_tenant_id uuid,p_cxp_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $$ SELECT app.gestionar_cxp_tx_478($1,$2,$3,$4,$5,$6) $$;

REVOKE ALL ON FUNCTION app.reprogramar_cxc_tx_478(uuid,uuid,uuid,date,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.gestionar_cxp_tx_478(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reprogramar_cxc_tx(uuid,uuid,uuid,date,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gestionar_cxp_tx(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reprogramar_cxc_tx(uuid,uuid,uuid,date,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gestionar_cxp_tx(uuid,uuid,uuid,text,jsonb,text) TO service_role;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.cuentas_por_cobrar,public.cuentas_por_pagar,public.financial_master_operations FROM service_role;

COMMIT;
NOTIFY pgrst,'reload schema';
