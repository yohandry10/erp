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
    RAISE EXCEPTION 'Registro 406 rechazado: la base no es PROD autorizada';
  END IF;
  SELECT name INTO v_existing_name FROM supabase_migrations.schema_migrations WHERE version = '406';
  IF v_existing_name IS NOT NULL AND v_existing_name <> '_contabilidad_plantillas_rpc_json_fix' THEN
    RAISE EXCEPTION 'La version 406 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '406',
  ARRAY['Aplicada desde supabase/migrations/406__contabilidad_plantillas_rpc_json_fix.sql'],
  '_contabilidad_plantillas_rpc_json_fix'
)
ON CONFLICT (version) DO NOTHING;
