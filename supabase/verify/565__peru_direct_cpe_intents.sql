\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $verify$
DECLARE writer regprocedure;
BEGIN
 writer:=to_regprocedure('public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text)');
 IF writer IS NULL THEN RAISE EXCEPTION 'VERIFY_565_BOUNDARY_MISSING'; END IF;
 IF NOT has_function_privilege('service_role',writer,'EXECUTE')
  OR has_function_privilege('anon',writer,'EXECUTE') OR has_function_privilege('authenticated',writer,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=writer AND a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_565_EXECUTE_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=writer AND p.prosecdef AND p.provolatile='v' AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=pg_catalog, public, app, extensions, pg_temp'])
 THEN RAISE EXCEPTION 'VERIFY_565_SECURITY_DEFINER_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=writer AND position('assert_actor_461' IN p.prosrc)>0 AND position('PE_DIRECT_CPE_PERMISSION_REQUIRED' IN p.prosrc)>0 AND position('pg_advisory_xact_lock' IN p.prosrc)>0 AND position('PE_DIRECT_CPE_IDEMPOTENCY_CONFLICT' IN p.prosrc)>0 AND position('pe_direct_request_fingerprint' IN p.prosrc)>0 AND position('emitir_factura_cliente_tx' IN p.prosrc)>0 AND position('PE_DIRECT_CPE_POSTCONDITION_FAILED' IN p.prosrc)>0)
 THEN RAISE EXCEPTION 'VERIFY_565_ACTOR_INTENT_BOUNDARY_INVALID'; END IF;
END $verify$;
ROLLBACK;
