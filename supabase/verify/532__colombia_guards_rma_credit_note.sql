\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_532') THEN
    RAISE EXCEPTION 'VERIFY_532_SOLO_BASE_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contract$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure('public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_532_RMA_ROUTER_MISSING';
  END IF;
  IF NOT has_function_privilege(
       'service_role',
       'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_532_RMA_ROUTER_ACL_INVALID';
  END IF;

  SELECT pg_get_functiondef(
    'public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW%'
     OR v_definition NOT ILIKE '%RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW%'
     OR v_definition NOT ILIKE '%emitir_nota_credito_rma_legacy_532%' THEN
    RAISE EXCEPTION 'VERIFY_532_RMA_ROUTER_DEFINITION_INVALID';
  END IF;
END;
$contract$;

DO $behavior$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_before_documents bigint;
  v_before_cpe bigint;
  v_before_payments bigint;
  v_before_balances bigint;
  v_before_rma bigint;
  v_before_outbox bigint;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY RMA DIAN 532', 1, 'CO');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  SELECT count(*) INTO v_before_documents FROM public.documentos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_cpe FROM public.cpe WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_payments FROM public.cxc_pagos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_balances FROM public.saldos_favor_clientes WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_rma FROM public.rma_solicitudes WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_outbox FROM public.outbox_events WHERE tenant_id = v_tenant;

  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(
      v_tenant,
      v_actor,
      gen_random_uuid(),
      '{"motivo":"Devolucion","tipo_nota_credito":"07"}'::jsonb,
      'verify-rma-dian-532'
    );
    RAISE EXCEPTION 'VERIFY_532_CO_SUNAT_RMA_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant) <> v_before_documents
     OR (SELECT count(*) FROM public.cpe WHERE tenant_id = v_tenant) <> v_before_cpe
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id = v_tenant) <> v_before_payments
     OR (SELECT count(*) FROM public.saldos_favor_clientes WHERE tenant_id = v_tenant) <> v_before_balances
     OR (SELECT count(*) FROM public.rma_solicitudes WHERE tenant_id = v_tenant) <> v_before_rma
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id = v_tenant) <> v_before_outbox THEN
    RAISE EXCEPTION 'VERIFY_532_CO_RMA_GUARD_MUTATED_STATE';
  END IF;

  UPDATE public.empresa_config
  SET pais = 'AR', updated_at = now()
  WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(
      v_tenant,
      v_actor,
      gen_random_uuid(),
      '{"motivo":"Devolucion","tipo_nota_credito":"07"}'::jsonb,
      'verify-rma-arca-532'
    );
    RAISE EXCEPTION 'VERIFY_532_AR_SUNAT_RMA_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM public.documentos WHERE tenant_id = v_tenant) <> v_before_documents
     OR (SELECT count(*) FROM public.cpe WHERE tenant_id = v_tenant) <> v_before_cpe
     OR (SELECT count(*) FROM public.cxc_pagos WHERE tenant_id = v_tenant) <> v_before_payments
     OR (SELECT count(*) FROM public.saldos_favor_clientes WHERE tenant_id = v_tenant) <> v_before_balances
     OR (SELECT count(*) FROM public.rma_solicitudes WHERE tenant_id = v_tenant) <> v_before_rma
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id = v_tenant) <> v_before_outbox THEN
    RAISE EXCEPTION 'VERIFY_532_AR_RMA_GUARD_MUTATED_STATE';
  END IF;

  UPDATE public.empresa_config
  SET pais = 'PE', updated_at = now()
  WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(
      v_tenant,
      v_actor,
      gen_random_uuid(),
      '{"motivo":"Devolucion","tipo_nota_credito":"07"}'::jsonb,
      'verify-rma-sunat-532'
    );
    RAISE EXCEPTION 'VERIFY_532_PE_DID_NOT_DELEGATE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'RMA_CREDIT_NOTE_REQUIRES_UNCREDITED_RECEIVED_STATE' THEN
      RAISE;
    END IF;
  END;
END;
$behavior$;

ROLLBACK;
