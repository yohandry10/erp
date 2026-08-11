-- Alinea la reconstrucción PostgreSQL con el layout de extensiones de Supabase.
-- El baseline histórico creó pgcrypto en public, mientras create_demo_tenant
-- usa explícitamente extensions.crypt/gen_salt/gen_random_uuid.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname
    INTO v_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_schema IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  ELSIF v_schema <> 'extensions' THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA extensions TO service_role;

COMMIT;
