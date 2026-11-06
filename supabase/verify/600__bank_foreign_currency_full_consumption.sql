\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_600_LOCAL_ONLY'; END IF;
 IF strpos(pg_get_functiondef('app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)'::regprocedure),'bank_full_consumption_600')=0 THEN
  RAISE EXCEPTION 'VERIFY_600_WRITER_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
  WHERE has_function_privilege(r.role,'app.bank_full_consumption_600(uuid,uuid,numeric,text)','EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_600_HELPER_EXPOSED'; END IF;
 BEGIN
  PERFORM app.bank_full_consumption_600(gen_random_uuid(),gen_random_uuid(),0.07,'PEN');
  RAISE EXCEPTION 'VERIFY_600_UNKNOWN_BANK_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'BANK_FX_BOOK_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
END;
$verify$;
ROLLBACK;
