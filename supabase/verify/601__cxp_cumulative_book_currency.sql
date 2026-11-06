\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_601_LOCAL_ONLY'; END IF;
 IF strpos(pg_get_functiondef('app.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)'::regprocedure),'cumulative_cxp_book_601')=0 THEN
  RAISE EXCEPTION 'VERIFY_601_WRITER_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
  WHERE has_function_privilege(r.role,'app.cxp_book_reduction_601(uuid,uuid,numeric,numeric)','EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_601_HELPER_EXPOSED'; END IF;
 BEGIN
  PERFORM app.cxp_book_reduction_601(gen_random_uuid(),gen_random_uuid(),.01,3.8);
  RAISE EXCEPTION 'VERIFY_601_UNKNOWN_DEBT_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'CXP_FX_BOOK_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
END;
$verify$;
ROLLBACK;
