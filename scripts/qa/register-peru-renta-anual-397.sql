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
    RAISE EXCEPTION 'Registro 397 rechazado: la base no es PROD autorizada';
  END IF;
  IF to_regclass('public.tributos_declaraciones_anuales') IS NULL THEN
    RAISE EXCEPTION 'Registro 397 rechazado: tabla anual inexistente';
  END IF;
  SELECT name INTO v_existing_name FROM supabase_migrations.schema_migrations WHERE version = '397';
  IF v_existing_name IS NOT NULL AND v_existing_name <> '_peru_renta_anual_itan' THEN
    RAISE EXCEPTION 'La versión 397 ya pertenece a %', v_existing_name;
  END IF;
END
$$;
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('397', ARRAY['Aplicada desde supabase/migrations/397__peru_renta_anual_itan.sql'], '_peru_renta_anual_itan')
ON CONFLICT (version) DO NOTHING;
