-- ============================================================================
-- 325__tenant_creation_rbac_rpc_execute_hardening.sql
-- Cierra ejecucion publica del RPC de seed RBAC para tenants nuevos.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_operational_rbac_for_tenant(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_operational_rbac_for_tenant(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
