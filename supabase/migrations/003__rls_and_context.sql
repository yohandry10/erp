-- ============================================================================
-- 003__rls_and_context.sql
-- RLS generico multi-tenant + triggers updated_at para todas las tablas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Aplicar trigger updated_at en todas las tablas con columna updated_at
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at_%I ON %I.%I',
      r.table_name,
      r.table_schema,
      r.table_name
    );

    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at_%I
       BEFORE UPDATE ON %I.%I
       FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()',
      r.table_name,
      r.table_schema,
      r.table_name
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Helper para crear politica tenant en tablas con tenant_id
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.apply_tenant_policy(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', p_schema, p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I.%I
     USING (app.is_superadmin() OR tenant_id = app.current_tenant_id())
     WITH CHECK (app.is_superadmin() OR tenant_id = app.current_tenant_id())',
    p_schema,
    p_table
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RLS para todas las tablas public con tenant_id
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
  LOOP
    PERFORM app.apply_tenant_policy(r.table_schema, r.table_name);
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Politicas especiales para tablas globales/core
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_superadmin_or_self ON public.tenants;
CREATE POLICY tenants_superadmin_or_self
ON public.tenants
USING (app.is_superadmin() OR id = app.current_tenant_id())
WITH CHECK (app.is_superadmin() OR id = app.current_tenant_id());

ALTER TABLE IF EXISTS public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permisos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permisos_read_all ON public.permisos;
CREATE POLICY permisos_read_all
ON public.permisos
FOR SELECT
USING (true);

DROP POLICY IF EXISTS permisos_write_superadmin ON public.permisos;
CREATE POLICY permisos_write_superadmin
ON public.permisos
FOR ALL
USING (app.is_superadmin())
WITH CHECK (app.is_superadmin());

ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_tenant_or_global ON public.roles;
CREATE POLICY roles_tenant_or_global
ON public.roles
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR tenant_id IS NULL
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

-- ----------------------------------------------------------------------------
-- Endurecimiento: no depender de GRANT public abierto por defecto
-- ----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;

COMMIT;
