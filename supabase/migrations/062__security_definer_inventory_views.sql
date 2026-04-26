-- ============================================================================
-- 062__security_definer_inventory_views.sql
-- Inventario forense de funciones SECURITY DEFINER y su nivel de riesgo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_security_definer_inventory AS
WITH role_flags AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AS has_anon_role,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS has_authenticated_role,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS has_service_role
),
base AS (
  SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    p.oid::regprocedure::text AS function_signature,
    pg_get_userbyid(p.proowner) AS owner_role,
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
      WHERE cfg LIKE 'search_path=%'
    ) AS has_search_path,
    COALESCE(
      (
        SELECT split_part(cfg, '=', 2)
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
        LIMIT 1
      ),
      ''
    ) AS search_path,
    has_function_privilege('public', p.oid, 'EXECUTE') AS execute_public,
    CASE
      WHEN rf.has_anon_role THEN has_function_privilege('anon', p.oid, 'EXECUTE')
      ELSE NULL
    END AS execute_anon,
    CASE
      WHEN rf.has_authenticated_role THEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ELSE NULL
    END AS execute_authenticated,
    CASE
      WHEN rf.has_service_role THEN has_function_privilege('service_role', p.oid, 'EXECUTE')
      ELSE NULL
    END AS execute_service_role
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN role_flags rf
  WHERE n.nspname IN ('public', 'app')
    AND p.prokind = 'f'
    AND p.prosecdef
)
SELECT
  b.schema_name,
  b.function_name,
  b.function_signature,
  b.owner_role,
  b.has_search_path,
  b.search_path,
  b.execute_public,
  b.execute_anon,
  b.execute_authenticated,
  b.execute_service_role,
  CASE
    WHEN NOT b.has_search_path
      OR b.execute_public
      OR COALESCE(b.execute_anon, false)
      OR COALESCE(b.execute_authenticated, false)
    THEN 'CRITICAL'
    WHEN b.execute_service_role IS FALSE
    THEN 'WARN'
    ELSE 'OK'
  END AS risk_level
FROM base b
ORDER BY b.schema_name, b.function_name, b.function_signature;

CREATE OR REPLACE VIEW public.v_security_definer_risk_summary AS
SELECT
  risk_level,
  COUNT(*)::bigint AS total
FROM public.v_security_definer_inventory
GROUP BY risk_level
ORDER BY CASE risk_level
  WHEN 'CRITICAL' THEN 1
  WHEN 'WARN' THEN 2
  ELSE 3
END;

COMMIT;
