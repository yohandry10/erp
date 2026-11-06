\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE role_name text;
BEGIN
 IF strpos(pg_get_functiondef('app.bank_full_consumption_600(uuid,uuid,numeric,text)'::regprocedure),'supplier_refund_bank_608')=0
  OR to_regprocedure('app.supplier_refund_bank_trace_608(uuid,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'BANK608_TRACE_MISSING'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(role_name,'app.supplier_refund_bank_trace_608(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'BANK608_TRACE_EXPOSED'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='app.supplier_refund_bank_trace_608(uuid,uuid,uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'BANK608_TRACE_EXPOSED'; END IF;
END; $verify$;
ROLLBACK;
