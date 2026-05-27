-- ============================================================================
-- 337__client_migration_rls_rpc_hardening.sql
-- Hardening post-336 para auditoria de migracion de clientes.
--
-- Motivo:
-- - La migracion 336 habilito RLS en migration_runs/migration_run_rows pero
--   las politicas leian app.tenant_id, mientras el baseline usa
--   app.current_tenant_id().
-- - La funcion SECURITY DEFINER validar_migracion_apertura aceptaba p_tenant_id
--   y estaba concedida a authenticated; el backend ya la invoca con
--   service_role, por lo que no necesita exposicion directa a usuarios finales.
-- ============================================================================

BEGIN;

ALTER TABLE public.migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.migration_run_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_run_rows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_migration_runs_tenant_read ON public.migration_runs;
CREATE POLICY rls_migration_runs_tenant_read ON public.migration_runs
  FOR SELECT
  USING (
    app.is_superadmin()
    OR tenant_id = app.current_tenant_id()
  );

DROP POLICY IF EXISTS rls_migration_run_rows_tenant_read ON public.migration_run_rows;
CREATE POLICY rls_migration_run_rows_tenant_read ON public.migration_run_rows
  FOR SELECT
  USING (
    app.is_superadmin()
    OR tenant_id = app.current_tenant_id()
  );

REVOKE ALL ON FUNCTION public.validar_migracion_apertura(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validar_migracion_apertura(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validar_migracion_apertura(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validar_migracion_apertura(uuid, date) TO service_role;

COMMENT ON POLICY rls_migration_runs_tenant_read ON public.migration_runs IS
  'Lectura aislada por tenant usando app.current_tenant_id(); escritura exclusivamente via backend service_role.';

COMMENT ON POLICY rls_migration_run_rows_tenant_read ON public.migration_run_rows IS
  'Lectura aislada por tenant usando app.current_tenant_id(); escritura exclusivamente via backend service_role.';

COMMENT ON FUNCTION public.validar_migracion_apertura(uuid, date) IS
  'Valida cuadre de migracion inicial. Ejecucion restringida a service_role para evitar consultas SECURITY DEFINER cross-tenant por RPC directa.';

COMMIT;
