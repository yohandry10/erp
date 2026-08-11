-- Verificación de exposición por GRANT/REVOKE (PostgREST/Supabase)
-- Objetivo: inventariar privilegios efectivos para roles públicos (`anon`, `authenticated`, `service_role`).
-- Ejecutar en staging/local (Supabase) con un rol con permisos de lectura en catálogos.
-- Recomendado: correr dentro de una transacción y NO modificar datos.

BEGIN;

-- 1) Privilegios efectivos por schema (USAGE/CREATE). PostgreSQL 16 no
-- expone information_schema.schema_privileges.
SELECT
  n.nspname AS schema_name,
  r.rolname AS grantee,
  has_schema_privilege(r.rolname, n.oid, 'USAGE') AS has_usage,
  has_schema_privilege(r.rolname, n.oid, 'CREATE') AS has_create
FROM pg_namespace n
CROSS JOIN pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY n.nspname, r.rolname;

-- 2) Privilegios sobre tablas y vistas (SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER)
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_schema, table_name, grantee, privilege_type;

-- 3) Privilegios EXECUTE sobre funciones/rutinas (RPCs expuestos por PostgREST)
SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_routine_grants
WHERE grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY routine_schema, routine_name, grantee;

-- 4) Tablas sensibles sugeridas para doble-check (ajusta la lista según tu threat model)
-- Nota: esta consulta NO asume que existan todas las tablas.
SELECT
  rtg.table_schema,
  rtg.table_name,
  rtg.grantee,
  rtg.privilege_type
FROM information_schema.role_table_grants rtg
WHERE rtg.grantee IN ('anon', 'authenticated')
  AND rtg.table_schema = 'public'
  AND rtg.table_name IN (
    'usuarios_sistema',
    'user_roles',
    'roles',
    'tenants',
    'outbox_events'
  )
ORDER BY rtg.table_schema, rtg.table_name, rtg.grantee, rtg.privilege_type;

ROLLBACK;
