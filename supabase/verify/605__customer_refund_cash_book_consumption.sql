\set ON_ERROR_STOP on
BEGIN;
DO $verify$ DECLARE signature text; BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_605_LOCAL_ONLY'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'app.cash_refund_trace_605(uuid,uuid,uuid)',
  'app.cash_full_consumption_602(uuid,uuid,numeric,text)',
  'public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text)',
  'public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)'] LOOP
  IF strpos(pg_get_functiondef(signature::regprocedure),'customer_refund_cash_605')=0 THEN
   RAISE EXCEPTION 'VERIFY_605_WRITER_MISSING'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
  CROSS JOIN (VALUES('app.cash_refund_trace_605(uuid,uuid,uuid)'),('app.cash_full_consumption_602(uuid,uuid,numeric,text)')) f(signature)
  WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_605_HELPER_EXPOSED'; END IF;
END; $verify$;
ROLLBACK;
