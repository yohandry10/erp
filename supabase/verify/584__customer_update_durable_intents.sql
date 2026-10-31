BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE FUNCTION pg_temp.fail_customer_intent_571() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.idempotency_key LIKE 'verify-571-fail-%' THEN
    RAISE EXCEPTION 'VERIFY_571_INJECTED_STORAGE_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verify_customer_intent_storage_571 BEFORE INSERT ON public.customer_update_intents
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_customer_intent_571();
DO $verify$
DECLARE
  v_demo jsonb; v_tenant uuid; v_actor uuid; v_other uuid; v_other_actor uuid;
  v_second_actor uuid; v_customer uuid; v_key text := 'verify-571-' || gen_random_uuid();
  v_result jsonb; v_replay jsonb; v_before jsonb; v_audits bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.customer_update_intents'::regclass
    AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'VERIFY_571_RLS_MISSING';
  END IF;
  UPDATE app.deployment_environment SET environment='DEV', project_ref='localerpephemeralqax',
    allow_demo_data=true, configured_at=now(), updated_at=now() WHERE singleton;
  v_demo:=public.create_demo_tenant_ready_tx('VERIFY-571-PE',14,'PE','verify-571-pe-'||gen_random_uuid());
  v_tenant:=(v_demo->>'tenant_id')::uuid; v_actor:=(v_demo->>'user_id')::uuid;
  v_demo:=public.create_demo_tenant_ready_tx('VERIFY-571-OTHER',14,'PE','verify-571-other-'||gen_random_uuid());
  v_other:=(v_demo->>'tenant_id')::uuid; v_other_actor:=(v_demo->>'user_id')::uuid;
  SELECT id INTO v_customer FROM public.clientes WHERE tenant_id=v_tenant ORDER BY id LIMIT 1;
  SELECT id INTO v_second_actor FROM public.usuarios_sistema
    WHERE tenant_id=v_tenant AND id<>v_actor AND activo ORDER BY id LIMIT 1;
  IF v_customer IS NULL OR v_second_actor IS NULL THEN RAISE EXCEPTION 'VERIFY_571_FIXTURE_MISSING'; END IF;
  SELECT count(*) INTO v_audits FROM public.audit_log WHERE tenant_id=v_tenant AND record_id=v_customer::text;
  v_result:=public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_actor,'{"telefono":"987571001"}',v_key);
  IF v_result->>'id' IS DISTINCT FROM v_customer::text OR v_result->>'telefono'<>'987571001'
    OR (SELECT count(*) FROM public.customer_update_intents WHERE tenant_id=v_tenant)<>1 THEN
    RAISE EXCEPTION 'VERIFY_571_UPDATE_NOT_PERSISTED';
  END IF;
  v_replay:=public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_actor,'{"telefono":"987571001"}',v_key);
  IF v_replay IS DISTINCT FROM v_result OR
    (SELECT count(*) FROM public.audit_log WHERE tenant_id=v_tenant AND record_id=v_customer::text)<>v_audits+1 THEN
    RAISE EXCEPTION 'VERIFY_571_REPLAY_DUPLICATES_AUDIT';
  END IF;
  -- Otra edición posterior no debe sustituir el recibo original al reintentar.
  PERFORM public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_actor,'{"telefono":"987571002"}',v_key||'-next');
  v_replay:=public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_actor,'{"telefono":"987571001"}',v_key);
  IF v_replay IS DISTINCT FROM v_result OR
    (SELECT telefono FROM public.clientes WHERE id=v_customer)<>'987571002' THEN
    RAISE EXCEPTION 'VERIFY_571_REPLAY_OVERWRITES_NEWER_EDIT';
  END IF;
  BEGIN
    PERFORM public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_actor,'{"telefono":"otro"}',v_key);
    RAISE EXCEPTION 'VERIFY_571_CHANGED_BODY_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_second_actor,'{"telefono":"987571001"}',v_key);
    RAISE EXCEPTION 'VERIFY_571_CHANGED_ACTOR_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.actualizar_cliente_idempotente_tx_571(v_customer,v_other,v_other_actor,'{"telefono":"ajeno"}',v_key);
    RAISE EXCEPTION 'VERIFY_571_FOREIGN_TENANT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CLIENTE_NOT_FOUND' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.customer_update_intents WHERE tenant_id=v_other) THEN
    RAISE EXCEPTION 'VERIFY_571_FOREIGN_TENANT_MUTATED';
  END IF;
  SELECT to_jsonb(c) INTO v_before FROM public.clientes c WHERE id=v_customer;
  SELECT count(*) INTO v_audits FROM public.audit_log WHERE tenant_id=v_tenant AND record_id=v_customer::text;
  BEGIN
    PERFORM public.actualizar_cliente_idempotente_tx_571(v_customer,v_tenant,v_actor,'{"telefono":"987571003"}','verify-571-fail-'||gen_random_uuid());
    RAISE EXCEPTION 'VERIFY_571_STORAGE_FAILURE_IGNORED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'VERIFY_571_INJECTED_STORAGE_FAILURE' THEN RAISE; END IF;
  END;
  IF (SELECT to_jsonb(c) FROM public.clientes c WHERE id=v_customer) IS DISTINCT FROM v_before OR
    (SELECT count(*) FROM public.audit_log WHERE tenant_id=v_tenant AND record_id=v_customer::text)<>v_audits THEN
    RAISE EXCEPTION 'VERIFY_571_PARTIAL_COMMIT';
  END IF;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM 1 FROM public.customer_update_intents LIMIT 1;
    RAISE EXCEPTION 'VERIFY_571_PRIVATE_INTENTS_READABLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF has_function_privilege('authenticated','public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('anon','public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_571_PUBLIC_WRITER';
  END IF;
END;
$verify$;
ROLLBACK;
