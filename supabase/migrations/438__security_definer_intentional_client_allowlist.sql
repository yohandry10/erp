-- Distingue las dos funciones SECURITY DEFINER de lectura deliberadamente
-- expuestas de cualquier grant inesperado. Los privilegios reales permanecen
-- visibles en raw_execute_* para no ocultar superficie de ataque.

BEGIN;

CREATE OR REPLACE VIEW public.v_security_definer_inventory
WITH (security_invoker = true) AS
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
    has_function_privilege('public', p.oid, 'EXECUTE') AS raw_execute_public,
    CASE
      WHEN rf.has_anon_role THEN has_function_privilege('anon', p.oid, 'EXECUTE')
      ELSE NULL
    END AS raw_execute_anon,
    CASE
      WHEN rf.has_authenticated_role THEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ELSE NULL
    END AS raw_execute_authenticated,
    CASE
      WHEN rf.has_service_role THEN has_function_privilege('service_role', p.oid, 'EXECUTE')
      ELSE NULL
    END AS execute_service_role,
    coalesce(
      p.oid = ANY (ARRAY[
        to_regprocedure('app.hoy_tenant(uuid)')::oid,
        to_regprocedure('app.puede_leer_grupo_consolidacion_393(uuid)')::oid
      ]),
      false
    ) AS allowed_client_execute
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
  b.raw_execute_public AND NOT b.allowed_client_execute AS execute_public,
  b.raw_execute_anon AND NOT b.allowed_client_execute AS execute_anon,
  b.raw_execute_authenticated AND NOT b.allowed_client_execute AS execute_authenticated,
  b.execute_service_role,
  CASE
    WHEN NOT b.has_search_path
      OR (
        NOT b.allowed_client_execute
        AND (
          b.raw_execute_public
          OR COALESCE(b.raw_execute_anon, false)
          OR COALESCE(b.raw_execute_authenticated, false)
        )
      )
    THEN 'CRITICAL'
    WHEN b.execute_service_role IS FALSE
    THEN 'WARN'
    ELSE 'OK'
  END AS risk_level,
  b.allowed_client_execute,
  b.raw_execute_public,
  b.raw_execute_anon,
  b.raw_execute_authenticated
FROM base b
ORDER BY b.schema_name, b.function_name, b.function_signature;

CREATE OR REPLACE VIEW public.v_security_definer_risk_summary
WITH (security_invoker = true) AS
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

-- Son vistas diagnósticas del backend, no endpoints SQL para clientes.
REVOKE ALL ON TABLE
  public.v_security_definer_inventory,
  public.v_security_definer_risk_summary
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.v_security_definer_inventory,
  public.v_security_definer_risk_summary
TO service_role;

COMMIT;
