\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_611_LOCAL_ONLY';
 END IF;
END;
$guard$;
DO $verify$
DECLARE
 v_demo jsonb;v_tenant uuid;v_actor uuid;v_key text;v_cpe public.cpe%ROWTYPE;
 v_country text;v_before jsonb;v_after jsonb;
BEGIN
 v_key:='verify-611-'||gen_random_uuid();
 v_demo:=public.create_demo_tenant_ready_tx('Verificación611 PE',14,'PE',v_key,NULL,NULL,NULL,'COMERCIO');
 v_tenant:=(v_demo->>'tenant_id')::uuid;v_actor:=(v_demo->>'user_id')::uuid;
 SELECT * INTO STRICT v_cpe FROM public.cpe WHERE tenant_id=v_tenant AND idempotency_key='demo-cpe-'||v_tenant::text;
 IF v_cpe.tipo_documento<>'01' THEN RAISE EXCEPTION 'VERIFY_611_CPE_TYPE:%',v_cpe.tipo_documento;END IF;
 IF upper(v_cpe.estado::text)<>'BORRADOR' OR upper(v_cpe.estado_sunat::text)<>'PENDIENTE'
   OR upper(v_cpe.sunat_status::text)<>'NOT_SENT' OR v_cpe.simulated_origin IS DISTINCT FROM true
   OR v_cpe.fecha_envio IS NOT NULL OR nullif(v_cpe.cdr_sunat,'') IS NOT NULL OR nullif(v_cpe.xml_firmado,'') IS NOT NULL
   OR v_cpe.metadata->>'fiscal_evidence' IS DISTINCT FROM 'NONE'
   OR v_cpe.metadata->>'sunat_sent' IS DISTINCT FROM 'false'
   OR v_cpe.metadata->>'sample_kind' IS DISTINCT FROM 'COMMERCIAL_ONLY' THEN
  RAISE EXCEPTION 'VERIFY_611_FALSE_FISCAL_ACCEPTANCE';
 END IF;
 IF app.cpe_fiscal_acceptance_evidence_524(v_tenant,v_cpe.id,v_cpe.documento_id) IS NOT NULL THEN
  RAISE EXCEPTION 'VERIFY_611_DRAFT_HAS_ACCEPTANCE_EVIDENCE';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.documentos WHERE tenant_id=v_tenant AND id=v_cpe.documento_id AND tipo_documento::text='FACTURA' AND total=179.80)
  OR v_cpe.total_gravadas<>152.37 OR v_cpe.total_igv<>27.43 OR v_cpe.total_venta<>179.80 OR v_cpe.total<>179.80
  OR NOT EXISTS(SELECT 1 FROM public.documento_series WHERE tenant_id=v_tenant AND tipo_documento='FACTURA' AND serie='F001' AND correlativo_actual=1) THEN
  RAISE EXCEPTION 'VERIFY_611_COMMERCIAL_VALUES_CHANGED';
 END IF;
 IF public.obtener_siguiente_numero_documento(v_tenant,'FACTURA','F001')<>'00000002' THEN
  RAISE EXCEPTION 'VERIFY_611_NEXT_NUMBER_CHANGED';
 END IF;
 SELECT to_jsonb(c) INTO v_before FROM public.cpe c WHERE id=v_cpe.id;
 v_demo:=public.create_demo_tenant_ready_tx('Verificación611 PE',14,'PE',v_key,NULL,NULL,NULL,'COMERCIO');
 SELECT to_jsonb(c) INTO v_after FROM public.cpe c WHERE id=v_cpe.id;
 IF (v_demo->>'tenant_id')::uuid<>v_tenant OR v_before IS DISTINCT FROM v_after
  OR (SELECT count(*) FROM public.cpe WHERE tenant_id=v_tenant AND idempotency_key='demo-cpe-'||v_tenant::text)<>1
  OR NOT EXISTS(SELECT 1 FROM public.documento_series WHERE tenant_id=v_tenant AND tipo_documento='FACTURA' AND serie='F001' AND correlativo_actual=2) THEN
  RAISE EXCEPTION 'VERIFY_611_REPLAY_CHANGED_SAMPLE';
 END IF;
 FOREACH v_country IN ARRAY ARRAY['CO','AR'] LOOP
  v_demo:=public.create_demo_tenant_ready_tx('Verificación611 país'||v_country,14,v_country,'verify-611-country-'||gen_random_uuid(),NULL,NULL,NULL,'COMERCIO');
  v_tenant:=(v_demo->>'tenant_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=v_tenant AND pais=v_country)
    OR EXISTS(SELECT 1 FROM public.cpe WHERE tenant_id=v_tenant AND (upper(estado::text)='ACEPTADO' OR upper(coalesce(estado_sunat::text,''))='ACEPTADO' OR upper(coalesce(sunat_status::text,''))='ACCEPTED' OR cdr_sunat IS NOT NULL)) THEN
   RAISE EXCEPTION 'VERIFY_611_COUNTRY_OR_EVIDENCE_CHANGED:%',v_country;
  END IF;
 END LOOP;
END;
$verify$;
SELECT 'PASS611: factura01 en CPE, FACTURA en core, borrador simulado sin evidencia, importes/número/replay y paísesCO/AR';
ROLLBACK;
