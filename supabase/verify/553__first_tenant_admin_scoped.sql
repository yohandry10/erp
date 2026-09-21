\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
  IF current_database() <> 'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_553_SOLO_ERP_E2E'; END IF;
END $guard$;
UPDATE app.deployment_environment SET environment='DEV', project_ref='localqaerpephemeralx', allow_demo_data=true, configured_at=now(), updated_at=now() WHERE singleton;
DO $verify$
DECLARE fixture jsonb; actor uuid; tenant uuid := gen_random_uuid(); created jsonb; client uuid; denied boolean := false;
BEGIN
  fixture := public.create_demo_tenant('VERIFY 553',1,'PE');
  actor := (fixture->>'user_id')::uuid;
  UPDATE public.usuarios_sistema SET is_super_admin=true WHERE id=actor;
  created := public.crear_tenant_empresa_admin_tx(actor,'verify-553-create',tenant,
    jsonb_build_object('razon_social','VERIFY CLIENT 553','ruc','20999999553','email','company553@example.test','pais','PE','pais_id',1,'moneda_defecto','PEN'),
    jsonb_build_object('email','client553@example.test','nombre','Client 553','password_hash','$2b$12$verify553hash'));
  client := (created->'adminUser'->>'id')::uuid;
  IF client IS NULL OR (SELECT is_super_admin FROM public.usuarios_sistema WHERE id=client) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'VERIFY_553_CLIENT_GLOBAL_PRIVILEGE';
  END IF;
  PERFORM app.assert_admin_actor_462(tenant,client);
  BEGIN
    PERFORM app.assert_admin_actor_462((fixture->>'tenant_id')::uuid,client);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'VERIFY_553_CROSS_TENANT_ALLOWED'; END IF;
END $verify$;
ROLLBACK;
