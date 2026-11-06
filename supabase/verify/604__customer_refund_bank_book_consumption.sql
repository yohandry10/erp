\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE signature text;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_604_LOCAL_ONLY'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'app.bank_full_consumption_600(uuid,uuid,numeric,text)',
  'public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text)',
  'public.revertir_reembolso_saldo_favor_tx(uuid,uuid,uuid,uuid,jsonb,text)'] LOOP
  IF strpos(pg_get_functiondef(signature::regprocedure),'customer_refund_bank_604')=0 THEN
   RAISE EXCEPTION 'VERIFY_604_WRITER_MISSING'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
  WHERE has_function_privilege(r.role,'app.bank_full_consumption_600(uuid,uuid,numeric,text)','EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_604_HELPER_EXPOSED'; END IF;
END;
$verify$;
ROLLBACK;
