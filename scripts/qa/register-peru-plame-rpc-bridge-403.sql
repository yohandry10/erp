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
    RAISE EXCEPTION 'Registro 403 rechazado: la base no es PROD autorizada';
  END IF;

  IF to_regprocedure('public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Registro 403 rechazado: puente PostgREST PLAME inexistente';
  END IF;

  SELECT name INTO v_existing_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '403';

  IF v_existing_name IS NOT NULL
     AND v_existing_name <> '_peru_plame_rpc_public_bridge' THEN
    RAISE EXCEPTION 'La versión 403 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '403',
  ARRAY['Aplicada desde supabase/migrations/403__peru_plame_rpc_public_bridge.sql'],
  '_peru_plame_rpc_public_bridge'
)
ON CONFLICT (version) DO NOTHING;
