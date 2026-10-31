-- Sólo local. prior_acl y prior_view deben ser capturados inmediatamente antes
-- de aplicar575. No se adivinan permisos ni la definición previa de la vista.
\set ON_ERROR_STOP on
\if :{?prior_acl}
\else
DO $$ BEGIN RAISE EXCEPTION 'ROLLBACK_575_REQUIRES_PRIOR_ACL'; END $$;
\endif
\if :{?prior_view}
\else
DO $$ BEGIN RAISE EXCEPTION 'ROLLBACK_575_REQUIRES_PRIOR_VIEW'; END $$;
\endif
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT set_config('uat.rollback575.prior_acl', :'prior_acl', true);
SELECT set_config('uat.rollback575.prior_view', :'prior_view', true);
DO $rollback$
DECLARE prior jsonb; prior_view jsonb; relation_name text; view_owner oid; option_value text;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
   WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'ROLLBACK_575_LOCAL_ONLY';
 END IF;
 prior:=current_setting('uat.rollback575.prior_acl')::jsonb;
 prior_view:=current_setting('uat.rollback575.prior_view')::jsonb;
 IF jsonb_typeof(prior)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(prior))<>7 THEN RAISE EXCEPTION 'ROLLBACK_575_INVALID_ACL'; END IF;
 IF jsonb_typeof(prior_view->'definition') IS DISTINCT FROM 'string' OR jsonb_typeof(prior_view->'owner') IS DISTINCT FROM 'string'
    OR coalesce(jsonb_typeof(prior_view->'options'),'missing') NOT IN('null','array') THEN RAISE EXCEPTION 'ROLLBACK_575_INVALID_VIEW_SNAPSHOT'; END IF;
 IF jsonb_typeof(prior_view->'options')='array' THEN
  FOR option_value IN SELECT jsonb_array_elements_text(prior_view->'options') LOOP
   IF option_value !~ '^(security_invoker|security_barrier)=(true|false)$' AND option_value !~ '^check_option=(local|cascaded)$' THEN
    RAISE EXCEPTION 'ROLLBACK_575_UNSUPPORTED_PRIOR_VIEW_OPTION';
   END IF;
  END LOOP;
 END IF;
 SELECT relowner INTO view_owner FROM pg_class WHERE oid='public.v_rls_violations_by_table'::regclass;
 IF pg_get_userbyid(view_owner) IS DISTINCT FROM prior_view->>'owner' OR EXISTS(
  SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) a
  WHERE c.oid='public.v_rls_violations_by_table'::regclass AND a.grantee NOT IN(view_owner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
 ) THEN RAISE EXCEPTION 'ROLLBACK_575_VIEW_GRANTS_REQUIRE_MANUAL_REVIEW'; END IF;
 -- Sin CASCADE: una dependencia nueva impide el rollback en lugar de borrarla.
 DROP VIEW public.v_rls_violations_by_table;
 EXECUTE 'CREATE VIEW public.v_rls_violations_by_table AS '||(prior_view->>'definition');
 IF jsonb_typeof(prior_view->'options')='array' THEN
  FOR option_value IN SELECT jsonb_array_elements_text(prior_view->'options') LOOP
   EXECUTE format('ALTER VIEW public.v_rls_violations_by_table SET (%I=%L)',split_part(option_value,'=',1),split_part(option_value,'=',2));
  END LOOP;
 END IF;
 EXECUTE format('ALTER VIEW public.v_rls_violations_by_table OWNER TO %I',prior_view->>'owner');
 FOREACH relation_name IN ARRAY ARRAY['rls_audit_log','rls_alert_history','v_rls_violations_by_table','v_rls_violations_by_user','v_rls_violations_hourly','v_rls_alerts_recent','v_rls_alerts_unacknowledged'] LOOP
  IF jsonb_typeof(prior->relation_name) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'ROLLBACK_575_INVALID_PRIOR_SELECT:%',relation_name; END IF;
  IF (prior->>relation_name)::boolean THEN EXECUTE format('GRANT SELECT ON public.%I TO service_role',relation_name);
  ELSE EXECUTE format('REVOKE SELECT ON public.%I FROM service_role',relation_name); END IF;
 END LOOP;
END;
$rollback$;
COMMIT;
