\set ON_ERROR_STOP on
DO $$
DECLARE
  v_environment text;
  v_project_ref text;
  v_existing_name text;
BEGIN
  SELECT environment, project_ref
  INTO v_environment, v_project_ref
  FROM app.deployment_environment
  WHERE singleton = true;

  IF v_environment <> 'PROD' OR v_project_ref <> 'wypnbcptofqdmoynlonq' THEN
    RAISE EXCEPTION 'Registro 411 rechazado: la base no es PROD autorizada';
  END IF;

  IF to_regprocedure(
    'public.ple_balance_comprobacion_317(uuid,integer,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Registro 411 rechazado: RPC PLE 3.17 inexistente';
  END IF;

  SELECT name
  INTO v_existing_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '411';

  IF v_existing_name IS NOT NULL
     AND v_existing_name <> '_ple_balance_comprobacion_317' THEN
    RAISE EXCEPTION 'La version 411 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '411',
  ARRAY['Aplicada desde supabase/migrations/411__ple_balance_comprobacion_317.sql'],
  '_ple_balance_comprobacion_317'
)
ON CONFLICT (version) DO NOTHING;
