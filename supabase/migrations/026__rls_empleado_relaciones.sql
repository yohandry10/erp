-- ============================================================================
-- 026__rls_empleado_relaciones.sql
-- Vista de diagnóstico RLS para tablas de relaciones empleado_* con detalle FK.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_rls_status_empleado_relaciones AS
WITH employee_tables AS (
  SELECT t.table_name
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name LIKE 'empleado\_%' ESCAPE '\'
),
tenant_cols AS (
  SELECT c.table_name, true AS has_tenant_id
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'tenant_id'
),
rls_state AS (
  SELECT
    cls.relname AS table_name,
    cls.relrowsecurity AS rls_enabled
  FROM pg_class cls
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relkind = 'r'
),
policy_counts AS (
  SELECT p.tablename AS table_name, COUNT(*)::integer AS policies_count
  FROM pg_policies p
  WHERE p.schemaname = 'public'
  GROUP BY p.tablename
),
fk_summary AS (
  SELECT
    tc.table_name,
    COUNT(*)::integer AS fk_count,
    STRING_AGG(
      format('%s -> %s.%s', kcu.column_name, ccu.table_name, ccu.column_name),
      ', '
      ORDER BY kcu.column_name
    ) AS fk_relations
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.constraint_schema = tc.constraint_schema
   AND kcu.table_name = tc.table_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
  GROUP BY tc.table_name
)
SELECT
  et.table_name,
  COALESCE(tc.has_tenant_id, false) AS has_tenant_id,
  COALESCE(rs.rls_enabled, false) AS rls_enabled,
  COALESCE(pc.policies_count, 0) AS policies_count,
  COALESCE(fk.fk_count, 0) AS fk_count,
  COALESCE(fk.fk_relations, '') AS fk_relations
FROM employee_tables et
LEFT JOIN tenant_cols tc
  ON tc.table_name = et.table_name
LEFT JOIN rls_state rs
  ON rs.table_name = et.table_name
LEFT JOIN policy_counts pc
  ON pc.table_name = et.table_name
LEFT JOIN fk_summary fk
  ON fk.table_name = et.table_name
ORDER BY et.table_name;

COMMIT;
