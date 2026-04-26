-- ============================================================================
-- 065__rls_global_catalog_context_hardening.sql
-- Endurece políticas SELECT en catálogos global+tenant para exigir contexto.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- roles: evitar lectura de filas globales sin tenant en contexto.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_tenant_or_global ON public.roles;
CREATE POLICY roles_tenant_or_global
ON public.roles
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id IS NULL
  )
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

-- ----------------------------------------------------------------------------
-- permisos (canónico): globales visibles solo con contexto tenant válido.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permisos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permisos_tenant_select ON public.permisos;
CREATE POLICY permisos_tenant_select
ON public.permisos
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id IS NULL
  )
);

-- ----------------------------------------------------------------------------
-- permissions (legacy): mismo criterio de visibilidad que permisos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.permissions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS permissions_tenant_select ON public.permissions';
  EXECUTE $sql$
    CREATE POLICY permissions_tenant_select
    ON public.permissions
    FOR SELECT
    USING (
      app.is_superadmin()
      OR tenant_id = app.current_tenant_id()
      OR (
        app.current_tenant_id() IS NOT NULL
        AND tenant_id IS NULL
      )
    )
  $sql$;
END
$$;

-- ----------------------------------------------------------------------------
-- role_permissions (legacy): no exponer vínculos globales sin contexto tenant.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS role_permissions_tenant_select ON public.role_permissions';
  EXECUTE $sql$
    CREATE POLICY role_permissions_tenant_select
    ON public.role_permissions
    FOR SELECT
    USING (
      app.is_superadmin()
      OR tenant_id = app.current_tenant_id()
      OR (
        app.current_tenant_id() IS NOT NULL
        AND tenant_id IS NULL
      )
    )
  $sql$;
END
$$;

COMMIT;
