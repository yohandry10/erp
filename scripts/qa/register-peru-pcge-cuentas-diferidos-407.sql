\set ON_ERROR_STOP on
DO $$
DECLARE
  v_environment text;
  v_project_ref text;
  v_existing_name text;
BEGIN
  SELECT environment, project_ref INTO v_environment, v_project_ref
  FROM app.deployment_environment WHERE singleton = true;
  IF v_environment <> 'PROD' OR v_project_ref <> 'wypnbcptofqdmoynlonq' THEN
    RAISE EXCEPTION 'Registro 407 rechazado: la base no es PROD autorizada';
  END IF;
  SELECT name INTO v_existing_name FROM supabase_migrations.schema_migrations WHERE version = '407';
  IF v_existing_name IS NOT NULL AND v_existing_name <> '_peru_pcge_cuentas_diferidos' THEN
    RAISE EXCEPTION 'La version 407 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '407',
  ARRAY['Aplicada desde supabase/migrations/407__peru_pcge_cuentas_diferidos.sql'],
  '_peru_pcge_cuentas_diferidos'
)
ON CONFLICT (version) DO NOTHING;
