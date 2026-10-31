-- LOCAL: -v prior_acl='{"beneficios":false,...}' debe provenir de la captura
-- inmediatamente anterior. Nunca adivinar ni revocar un permiso preexistente.
\set ON_ERROR_STOP on
\if :{?prior_acl}
\else
DO $$ BEGIN RAISE EXCEPTION 'ROLLBACK_573_REQUIRES_PRIOR_ACL_SNAPSHOT'; END $$;
\endif
BEGIN;
SELECT set_config('uat.rollback573.prior_acl', :'prior_acl', true);
DO $rollback$
DECLARE prior jsonb; name text;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
   WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'ROLLBACK_573_LOCAL_ONLY';
 END IF;
 prior:=current_setting('uat.rollback573.prior_acl')::jsonb;
 IF jsonb_typeof(prior)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(prior))<>5 THEN RAISE EXCEPTION 'ROLLBACK_573_INVALID_ACL_SNAPSHOT'; END IF;
 FOREACH name IN ARRAY ARRAY['beneficios','capacitaciones','empleado_beneficios','empleado_capacitaciones','expediente_documentos'] LOOP
  IF jsonb_typeof(prior->name) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'ROLLBACK_573_INVALID_PRIOR_SELECT:%',name; END IF;
  IF (prior->>name)::boolean THEN EXECUTE format('GRANT SELECT ON public.%I TO service_role',name);
  ELSE EXECUTE format('REVOKE SELECT ON public.%I FROM service_role',name); END IF;
 END LOOP;
END;
$rollback$;
COMMIT;
