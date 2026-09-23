\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_555_SOLO_ERP_E2E';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.sucursales', 'SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('service_role', 'public.usuario_sucursales', 'SELECT,INSERT,DELETE') THEN
    RAISE EXCEPTION 'VERIFY_555_RUNTIME_ACL_MISSING';
  END IF;
  IF has_table_privilege('authenticated', 'public.sucursales', 'INSERT')
     OR has_table_privilege('authenticated', 'public.usuario_sucursales', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_555_CLIENT_WRITE_EXPOSED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.sucursales'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.usuario_sucursales'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'VERIFY_555_RLS_MISSING';
  END IF;
END;
$verify$;
ROLLBACK;
