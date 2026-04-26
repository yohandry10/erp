-- Verificación de exposición a rol anon (RLS + grants)
-- Ejecutar en staging/local (Supabase) con un rol con permisos de lectura de catálogos.
-- Recomendado: correr dentro de una transacción y NO modificar datos.

BEGIN;

-- 1) Políticas que incluyen anon explícitamente
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  permissive,
  cmd
FROM pg_policies
WHERE 'anon' = ANY(roles)
ORDER BY schemaname, tablename, policyname;

-- 2) Grants directos a anon sobre tablas/vistas
SELECT
  table_schema,
  table_name,
  privilege_type,
  grantee
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
ORDER BY table_schema, table_name, privilege_type;

-- 3) Grants EXECUTE a anon sobre funciones (riesgo de RPC expuesto)
SELECT
  routine_schema,
  routine_name,
  privilege_type,
  grantee
FROM information_schema.role_routine_grants
WHERE grantee = 'anon'
ORDER BY routine_schema, routine_name, privilege_type;

ROLLBACK;

