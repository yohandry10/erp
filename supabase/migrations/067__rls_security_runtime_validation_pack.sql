-- ============================================================================
-- 067__rls_security_runtime_validation_pack.sql
-- Validaciones runtime de hardening RLS para tablas de seguridad/core tenant.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rls_security_runtime()
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
  v_table text;
  v_relrowsecurity boolean;
  v_relforcerowsecurity boolean;
  v_policy_count integer;
  v_policy_expr text;
  v_policy_expr_norm text;
  v_core_tables text[] := ARRAY[
    'usuarios_sistema',
    'user_roles',
    'roles',
    'permisos',
    'rol_permisos',
    'users',
    'auth_login_attempts',
    'user_sessions',
    'permissions',
    'role_permissions'
  ];
BEGIN
  RETURN QUERY
  SELECT
    'v_rls_tenant_tables_audit_exists'::text,
    to_regclass('public.v_rls_tenant_tables_audit') IS NOT NULL,
    'vista de auditoría de RLS para tablas con tenant_id';

  RETURN QUERY
  SELECT
    'v_rls_tenant_tables_audit_summary_exists'::text,
    to_regclass('public.v_rls_tenant_tables_audit_summary') IS NOT NULL,
    'vista resumen de auditoría de RLS';

  IF to_regclass('public.v_rls_tenant_tables_audit') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.v_rls_tenant_tables_audit
    WHERE needs_attention;

    RETURN QUERY
    SELECT
      'rls_tenant_tables_needing_attention'::text,
      v_count = 0,
      format('count=%s', v_count);
  END IF;

  FOREACH v_table IN ARRAY v_core_tables LOOP
    IF to_regclass(format('public.%s', v_table)) IS NULL THEN
      RETURN QUERY
      SELECT
        format('core_table_rls:%s', v_table),
        true,
        'table_not_present';
      CONTINUE;
    END IF;

    SELECT
      c.relrowsecurity,
      c.relforcerowsecurity,
      (
        SELECT COUNT(*)::integer
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
      )
    INTO v_relrowsecurity, v_relforcerowsecurity, v_policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table
      AND c.relkind = 'r';

    RETURN QUERY
    SELECT
      format('core_table_rls:%s', v_table),
      COALESCE(v_relrowsecurity, false) AND COALESCE(v_relforcerowsecurity, false) AND COALESCE(v_policy_count, 0) > 0,
      format(
        'rls_enabled=%s rls_forced=%s policy_count=%s',
        COALESCE(v_relrowsecurity, false),
        COALESCE(v_relforcerowsecurity, false),
        COALESCE(v_policy_count, 0)
      );
  END LOOP;

  -- --------------------------------------------------------------------------
  -- Guard de contexto para filas globales (tenant_id IS NULL) en políticas
  -- SELECT de seguridad/catálogo.
  -- --------------------------------------------------------------------------

  IF to_regclass('public.roles') IS NOT NULL THEN
    SELECT p.qual
    INTO v_policy_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'roles'
      AND p.policyname = 'roles_tenant_or_global';

    v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

    RETURN QUERY
    SELECT
      'roles_global_guard'::text,
      v_policy_expr IS NOT NULL
      AND (
        position('tenant_idisnull' IN v_policy_expr_norm) = 0
        OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
        OR position('current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
      ),
      COALESCE(v_policy_expr, '<missing_policy>');
  END IF;

  IF to_regclass('public.permisos') IS NOT NULL THEN
    SELECT p.qual
    INTO v_policy_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'permisos'
      AND p.policyname = 'permisos_tenant_select';

    v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

    RETURN QUERY
    SELECT
      'permisos_global_guard'::text,
      v_policy_expr IS NOT NULL
      AND (
        position('tenant_idisnull' IN v_policy_expr_norm) = 0
        OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
        OR position('current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
      ),
      COALESCE(v_policy_expr, '<missing_policy>');
  END IF;

  IF to_regclass('public.permissions') IS NOT NULL THEN
    SELECT p.qual
    INTO v_policy_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'permissions'
      AND p.policyname = 'permissions_tenant_select';

    v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

    RETURN QUERY
    SELECT
      'permissions_global_guard'::text,
      v_policy_expr IS NOT NULL
      AND (
        position('tenant_idisnull' IN v_policy_expr_norm) = 0
        OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
        OR position('current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
      ),
      COALESCE(v_policy_expr, '<missing_policy>');
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    SELECT p.qual
    INTO v_policy_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'role_permissions'
      AND p.policyname = 'role_permissions_tenant_select';

    v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

    RETURN QUERY
    SELECT
      'role_permissions_global_guard'::text,
      v_policy_expr IS NOT NULL
      AND (
        position('tenant_idisnull' IN v_policy_expr_norm) = 0
        OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
        OR position('current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
      ),
      COALESCE(v_policy_expr, '<missing_policy>');
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.v_rls_security_runtime_status_actual AS
SELECT *
FROM public.validar_rls_security_runtime();

COMMIT;
