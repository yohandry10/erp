BEGIN;

DO $$
DECLARE
  v_existing_name text;
BEGIN
  SELECT name INTO v_existing_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '433';

  IF v_existing_name IS NOT NULL
     AND v_existing_name <> '_demo_create_rpc_postgrest_contract' THEN
    RAISE EXCEPTION 'La versión 433 ya pertenece a %', v_existing_name;
  END IF;

  IF to_regprocedure(
       'public.create_demo_tenant(character varying,integer,character varying)'
     ) IS NULL THEN
    RAISE EXCEPTION 'Registro 433 rechazado: falta la firma PostgREST';
  END IF;
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '433',
  ARRAY['Aplicada desde supabase/migrations/433__demo_create_rpc_postgrest_contract.sql'],
  '_demo_create_rpc_postgrest_contract'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
