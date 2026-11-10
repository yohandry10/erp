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
 -- Lo que protege el historial no depende del host. El proveedor concede por
 -- defecto SELECT a los clientes y DML al backend en las tablas de public (la
 -- cadena limpia no): esas concesiones heredadas no se retiran aquí, así que
 -- se comprueba lo que las contiene y no su ausencia.
 IF has_table_privilege('anon','public.pedido_aprobaciones','INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('authenticated','public.pedido_aprobaciones','INSERT,UPDATE,DELETE,TRUNCATE') THEN
  RAISE EXCEPTION 'VERIFY_612_DIRECT_CLIENT_WRITE_ACCESS';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.pedido_aprobaciones'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION 'VERIFY_612_HISTORY_RLS_NOT_FORCED';
 END IF;
 -- Con RLS forzado, una lectura de cliente sólo ve filas si una política la
 -- admite: ninguna puede quedar sin ligar a la empresa de la sesión.
 IF EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.pedido_aprobaciones'::regclass
   AND coalesce(pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid),'true') NOT LIKE '%app.current_tenant_id()%') THEN
  RAISE EXCEPTION 'VERIFY_612_POLICY_NOT_TENANT_BOUND';
 END IF;
 -- Una escritura directa del backend sigue pasando por la guarda de441.
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.pedido_aprobaciones'::regclass
   AND t.tgname='trg_enforce_pedido_aprobacion_441' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')) THEN
  RAISE EXCEPTION 'VERIFY_612_WRITE_GUARD_MISSING';
 END IF;
END;
$verify$;
SET LOCAL ROLE service_role;
-- Ejecutar la lectura real con el rol del backend, además de consultar su ACL.
SELECT count(*) FROM public.pedido_aprobaciones WHERE tenant_id=gen_random_uuid();
RESET ROLE;
SELECT 'PASS612: lectura backend explícita y sin delegación; clientes sin escritura; RLS forzado y ligado a la empresa; guarda441 activa';
ROLLBACK;
