-- ============================================================================
-- 345__supabase_advisor_security_hardening.sql
-- Hardening para hallazgos de Supabase Security Advisor:
-- - 0013 rls disabled in public: financial_forensic_repair_log.
-- - 0010 security definer view: vistas public sin security_invoker.
-- - 0011 function search path mutable: funciones propias sin search_path fijo.
-- - 0028/0029 security definer function executable por anon/authenticated.
--
-- Criterio:
-- - Las vistas public deben respetar RLS del invoker. El backend opera con
--   service_role y headers de tenant; usuarios finales no necesitan bypass por
--   vista definer.
-- - Las vistas diagnosticas/runtime no deben quedar expuestas por PostgREST a
--   anon/authenticated. Se consultan desde backend/service_role o SQL operativo.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.financial_forensic_repair_log') IS NOT NULL THEN
    ALTER TABLE public.financial_forensic_repair_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.financial_forensic_repair_log FORCE ROW LEVEL SECURITY;

    REVOKE ALL ON TABLE public.financial_forensic_repair_log FROM PUBLIC;
    REVOKE ALL ON TABLE public.financial_forensic_repair_log FROM anon;
    REVOKE ALL ON TABLE public.financial_forensic_repair_log FROM authenticated;
    GRANT SELECT, INSERT ON TABLE public.financial_forensic_repair_log TO service_role;

    DROP POLICY IF EXISTS financial_forensic_repair_log_backend_only
      ON public.financial_forensic_repair_log;

    CREATE POLICY financial_forensic_repair_log_backend_only
      ON public.financial_forensic_repair_log
      AS PERMISSIVE
      FOR ALL
      TO postgres, service_role
      USING (true)
      WITH CHECK (true);

    COMMENT ON TABLE public.financial_forensic_repair_log IS
      'Log forense de reparaciones financieras. RLS forzado y acceso directo cerrado a clientes; escritura/lectura operativa solo por backend/service_role.';
  END IF;
END
$$;

-- Supabase Advisor marca las vistas public como SECURITY DEFINER si no declaran
-- security_invoker. Aplicarlo por catalogo evita dejar deuda repetida en las
-- vistas runtime/compatibilidad ya existentes.
DO $$
DECLARE
  v_view record;
BEGIN
  FOR v_view IN
    SELECT c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND NOT COALESCE(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_view.view_name);
  END LOOP;
END
$$;

-- Las vistas diagnosticas de validacion/runtime son evidencia operacional, no
-- superficie publica del producto. Mantenerlas para service_role y SQL admin.
DO $$
DECLARE
  v_view record;
BEGIN
  FOR v_view IN
    SELECT c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND (
        c.relname LIKE 'v\_%\_runtime\_status\_actual' ESCAPE '\'
        OR c.relname LIKE 'v\_%\_validacion\_actual' ESCAPE '\'
        OR c.relname LIKE 'v\_%\_validation\_status\_actual' ESCAPE '\'
        OR c.relname IN (
          'v_dashboard_stock_sync_gap',
          'v_rebuild_runtime_checks_actual',
          'v_rebuild_runtime_summary_actual',
          'v_rebuild_runtime_failures_actual',
          'v_rebuild_runtime_pack_metrics_actual',
          'v_smoke_tests_modulos_runtime_actual',
          'v_smoke_tests_modulos_summary_actual',
          'v_smoke_tests_modulos_failures_actual',
          'v_smoke_tests_modulos_global_actual',
          'v_security_definer_inventory',
          'v_security_definer_risk_summary',
          'v_rls_tenant_tables_audit',
          'v_rls_tenant_tables_audit_summary'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_view.view_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_view.view_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', v_view.view_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', v_view.view_name);
  END LOOP;
END
$$;

-- Fijar search_path en funciones propias. Se excluyen funciones pertenecientes a
-- extensiones (por ejemplo citext) para no modificar objetos gestionados por la
-- extension.
DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app')
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, app, extensions, pg_temp',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  END LOOP;
END
$$;

-- Ninguna funcion SECURITY DEFINER propia debe ser ejecutable directamente por
-- clientes. El backend las invoca con service_role cuando aplica; los triggers
-- no dependen de grants directos a anon/authenticated.
DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app')
      AND p.prokind = 'f'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('public', p.oid, 'EXECUTE')
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.v_dashboard_runtime_status_actual') IS NOT NULL THEN
    COMMENT ON VIEW public.v_dashboard_runtime_status_actual IS
      'Vista diagnostica dashboard. security_invoker=true por migracion 345; acceso directo cliente revocado.';
  END IF;

  IF to_regclass('public.v_dashboard_stock_sync_gap') IS NOT NULL THEN
    COMMENT ON VIEW public.v_dashboard_stock_sync_gap IS
      'Vista diagnostica de gap stock legacy/canonico. security_invoker=true por migracion 345; acceso directo cliente revocado.';
  END IF;

  IF to_regclass('public.v_compras_estado_case_insensitive_runtime_status_actual') IS NOT NULL THEN
    COMMENT ON VIEW public.v_compras_estado_case_insensitive_runtime_status_actual IS
      'Vista diagnostica de estados Compras. security_invoker=true por migracion 345; acceso directo cliente revocado.';
  END IF;
END
$$;

COMMIT;
