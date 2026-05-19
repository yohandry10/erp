-- ============================================================================
-- 323__tenant_creation_operational_rbac_public_rpc.sql
-- Wrapper público para PostgREST/Supabase RPC del seed RBAC operativo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_operational_rbac_for_tenant(
  p_tenant_id uuid,
  p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT *
  FROM app.seed_operational_rbac_for_tenant(p_tenant_id, p_source_tenant_id);
$$;

REVOKE ALL ON FUNCTION public.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_operational_rbac_for_tenant(uuid, uuid) TO authenticated, service_role;

COMMIT;
