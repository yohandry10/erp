\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE signature text;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_603_LOCAL_ONLY'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'app.cxc_book_reduction_598(uuid,uuid,numeric,numeric,boolean)',
  'public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text)'] LOOP
  IF strpos(pg_get_functiondef(signature::regprocedure),'customer_credit_cumulative_603')=0 THEN
   RAISE EXCEPTION 'VERIFY_603_WRITER_MISSING'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
  WHERE has_function_privilege(r.role,'app.cxc_book_reduction_598(uuid,uuid,numeric,numeric,boolean)','EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_603_HELPER_EXPOSED'; END IF;
 IF has_function_privilege('anon','public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY_603_WRITER_PRIVILEGES_CHANGED'; END IF;
END;
$verify$;
ROLLBACK;
