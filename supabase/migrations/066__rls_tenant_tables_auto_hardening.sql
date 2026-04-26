-- ============================================================================
-- 066__rls_tenant_tables_auto_hardening.sql
-- Reaplica RLS de forma idempotente en tablas public con tenant_id.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      (
        SELECT COUNT(*)::integer
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
      ) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns ic
        WHERE ic.table_schema = 'public'
          AND ic.table_name = c.relname
          AND ic.column_name = 'tenant_id'
      )
  LOOP
    IF NOT r.rls_enabled THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    END IF;

    IF NOT r.rls_forced THEN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.table_name);
    END IF;

    IF COALESCE(r.policy_count, 0) = 0 THEN
      PERFORM app.apply_tenant_policy('public', r.table_name);
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW public.v_rls_tenant_tables_audit AS
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (
    SELECT COUNT(*)::integer
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
  ) AS policy_count,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
      AND p.policyname IN ('tenant_isolation', 'tenant_or_global_select', 'tenant_or_global_write')
  ) AS has_tenant_or_global_policy,
  (
    NOT c.relrowsecurity
    OR NOT c.relforcerowsecurity
    OR (
      SELECT COUNT(*)::integer
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = c.relname
    ) = 0
  ) AS needs_attention
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns ic
    WHERE ic.table_schema = 'public'
      AND ic.table_name = c.relname
      AND ic.column_name = 'tenant_id'
  )
ORDER BY c.relname;

CREATE OR REPLACE VIEW public.v_rls_tenant_tables_audit_summary AS
SELECT
  COUNT(*)::bigint AS total_tables_with_tenant_id,
  COUNT(*) FILTER (WHERE rls_enabled)::bigint AS rls_enabled_tables,
  COUNT(*) FILTER (WHERE rls_forced)::bigint AS rls_forced_tables,
  COUNT(*) FILTER (WHERE policy_count > 0)::bigint AS tables_with_policies,
  COUNT(*) FILTER (WHERE needs_attention)::bigint AS tables_needing_attention
FROM public.v_rls_tenant_tables_audit;

COMMIT;
