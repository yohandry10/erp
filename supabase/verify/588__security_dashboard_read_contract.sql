\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE relation_name text; target regclass; role_name text;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
   WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_575_LOCAL_ONLY';
 END IF;
 FOREACH relation_name IN ARRAY ARRAY['rls_audit_log','rls_alert_history','v_rls_violations_by_table','v_rls_violations_by_user','v_rls_violations_hourly','v_rls_alerts_recent','v_rls_alerts_unacknowledged'] LOOP
  target:=('public.'||relation_name)::regclass;
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid=target AND relkind='v' AND NOT coalesce(reloptions @> ARRAY['security_invoker=true'],false)) THEN
   RAISE EXCEPTION 'VERIFY_575_VIEW_NOT_INVOKER:%',target;
  END IF;
  IF NOT has_table_privilege('service_role',target,'SELECT') THEN RAISE EXCEPTION 'VERIFY_575_BACKEND_SELECT_MISSING:%',target; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(role_name,target,'INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'VERIFY_575_DIRECT_WRITE_ALLOWED:%:%',target,role_name; END IF;
   IF role_name<>'service_role' AND has_table_privilege(role_name,target,'SELECT') THEN RAISE EXCEPTION 'VERIFY_575_CLIENT_SELECT_ALLOWED:%:%',target,role_name; END IF;
  END LOOP;
 END LOOP;
 FOREACH relation_name IN ARRAY ARRAY['rls_audit_log','rls_alert_history'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||relation_name)::regclass AND relrowsecurity AND relforcerowsecurity) THEN
   RAISE EXCEPTION 'VERIFY_575_RLS_NOT_FORCED:%',relation_name;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='v_rls_violations_by_table' AND column_name IN('cross_tenant_count','missing_tenant_count'))<>2 THEN
  RAISE EXCEPTION 'VERIFY_575_COUNTER_COLUMNS_MISSING';
 END IF;
 IF NOT has_function_privilege('service_role','public.generate_rls_security_report(integer)','EXECUTE') THEN RAISE EXCEPTION 'VERIFY_575_REPORT_UNAVAILABLE'; END IF;
END;
$verify$;
ROLLBACK;
