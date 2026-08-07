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
    RAISE EXCEPTION 'Registro 410 rechazado: la base no es PROD autorizada';
  END IF;

  IF to_regprocedure('app.sembrar_permisos_contador_operativo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Registro 410 rechazado: seeder RBAC inexistente';
  END IF;

  SELECT name
  INTO v_existing_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '410';

  IF v_existing_name IS NOT NULL
     AND v_existing_name <> '_contador_operational_read_rbac' THEN
    RAISE EXCEPTION 'La version 410 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '410',
  ARRAY['Aplicada desde supabase/migrations/410__contador_operational_read_rbac.sql'],
  '_contador_operational_read_rbac'
)
ON CONFLICT (version) DO NOTHING;
