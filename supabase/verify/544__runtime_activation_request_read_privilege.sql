\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY544_REQUIERE_ERP_E2E'; END IF;
  IF NOT has_table_privilege('service_role','public.demo_conversiones_pendientes','SELECT')
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.demo_conversiones_pendientes'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'VERIFY544_PRIVILEGES_INVALID';
  END IF;
  -- CI y ensayo preservan todas las ACL anteriores salvo SELECT service_role.
  SET LOCAL ROLE service_role;
  PERFORM id FROM public.demo_conversiones_pendientes LIMIT 1;
  RESET ROLE;
END;
$verify$;
ROLLBACK;
