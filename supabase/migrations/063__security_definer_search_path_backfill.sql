-- ============================================================================
-- 063__security_definer_search_path_backfill.sql
-- Backfill de search_path en funciones SECURITY DEFINER sin configuración.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS function_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app')
      AND p.prokind = 'f'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = pg_catalog, public, app, pg_temp',
      r.schema_name,
      r.function_name,
      r.function_args
    );
  END LOOP;
END
$$;

COMMIT;
