\set ON_ERROR_STOP on
\pset pager off

\d supabase_migrations.schema_migrations

SELECT version, COALESCE(name, '') AS name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 12;
