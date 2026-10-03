\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $verify$
DECLARE writer regprocedure; seed regprocedure;
BEGIN
 writer:=to_regprocedure('public.configurar_certificado_pos_tx(uuid,uuid,text,text,bytea,text,timestamp with time zone)');
 seed:=to_regprocedure('app.seed_pos_payment_catalog_564()');
 IF writer IS NULL OR seed IS NULL THEN RAISE EXCEPTION 'VERIFY_564_BOUNDARY_MISSING'; END IF;
 IF NOT has_function_privilege('service_role',writer,'EXECUTE')
  OR has_function_privilege('anon',writer,'EXECUTE') OR has_function_privilege('authenticated',writer,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=writer AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_564_WRITER_EXECUTE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN(writer,seed) AND (NOT p.prosecdef OR p.provolatile<>'v' OR pg_get_userbyid(p.proowner)<>'postgres'))
  OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=writer AND p.proconfig=ARRAY['search_path=pg_catalog, public, app, extensions, pg_temp'])
  OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=seed AND p.proconfig=ARRAY['search_path=pg_catalog, public, app, pg_temp'])
 THEN RAISE EXCEPTION 'VERIFY_564_SECURITY_DEFINER_INVALID'; END IF;
 IF has_function_privilege('anon',seed,'EXECUTE') OR has_function_privilege('authenticated',seed,'EXECUTE') OR has_function_privilege('service_role',seed,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=seed AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_564_SEED_EXECUTE_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=writer AND position('assert_configuration_actor_464' IN p.prosrc)>0 AND position('POS_CERTIFICATE_PERMISSION_REQUIRED' IN p.prosrc)>0 AND position('configuration_intent_replay_464' IN p.prosrc)>0 AND position('configuration_intent_finish_464' IN p.prosrc)>0 AND position('actualizar_empresa_config_tx' IN p.prosrc)>0)
 THEN RAISE EXCEPTION 'VERIFY_564_ACTOR_INTENT_BOUNDARY_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.empresa_config'::regclass AND tgname='seed_pos_payment_catalog_564' AND tgfoid=seed AND tgenabled='O' AND tgtype=5)
 THEN RAISE EXCEPTION 'VERIFY_564_INSERT_TRIGGER_INVALID'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.metodos_pago'::regclass)
 THEN RAISE EXCEPTION 'VERIFY_564_CATALOG_RLS_INVALID'; END IF;
 -- Los permisos heredados se comparan antes/después en el ensayo/promotor.
 -- La función interna permanece inaccesible incluso al backend; sólo se
 -- alcanza desde el writer autorizado SECURITY DEFINER.
 IF has_function_privilege('service_role','app.apply_empresa_config_patch_464(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('anon','app.apply_empresa_config_patch_464(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','app.apply_empresa_config_patch_464(uuid,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_564_INTERNAL_PATCH_EXECUTE_GRANTED'; END IF;
END $verify$;
ROLLBACK;
