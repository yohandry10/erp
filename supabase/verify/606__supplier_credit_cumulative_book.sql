\set ON_ERROR_STOP on
BEGIN;
DO $verify$ DECLARE signature text; BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_606_LOCAL_ONLY'; END IF;
 FOREACH signature IN ARRAY ARRAY['app.supplier_credit_trace_606(uuid,uuid)','app.supplier_credit_book_606(uuid,uuid,numeric)',
  'app.cxp_book_reduction_601(uuid,uuid,numeric,numeric)','public.aplicar_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text)'] LOOP
  IF strpos(pg_get_functiondef(signature::regprocedure),'supplier_credit_cumulative_606')=0 THEN RAISE EXCEPTION 'VERIFY_606_WRITER_MISSING'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role)
  CROSS JOIN(VALUES('app.supplier_credit_trace_606(uuid,uuid)'),('app.supplier_credit_book_606(uuid,uuid,numeric)'))f(signature)
  WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'VERIFY_606_HELPER_EXPOSED'; END IF;
END; $verify$;
ROLLBACK;
