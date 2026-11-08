\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
 IF NOT has_table_privilege('service_role','public.pedido_aprobaciones','SELECT') THEN
  RAISE EXCEPTION 'VERIFY_612_BACKEND_HISTORY_READ_MISSING';
 END IF;
 IF has_table_privilege('service_role','public.pedido_aprobaciones','SELECT WITH GRANT OPTION') THEN
  RAISE EXCEPTION 'VERIFY_612_BACKEND_GRANT_OPTION';
 END IF;
 IF has_table_privilege('anon','public.pedido_aprobaciones','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('authenticated','public.pedido_aprobaciones','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('service_role','public.pedido_aprobaciones','INSERT,UPDATE,DELETE,TRUNCATE') THEN
  RAISE EXCEPTION 'VERIFY_612_DIRECT_CLIENT_OR_WRITE_ACCESS';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.pedido_aprobaciones'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION 'VERIFY_612_HISTORY_RLS_NOT_FORCED';
 END IF;
END;
$verify$;
SET LOCAL ROLE service_role;
-- Ejecutar la lectura real con el rol del backend, además de consultar su ACL.
SELECT count(*) FROM public.pedido_aprobaciones WHERE tenant_id=gen_random_uuid();
RESET ROLE;
SELECT 'PASS612: lectura backend explícita, sin delegación, clientes ni DML; RLS forzado';
ROLLBACK;
