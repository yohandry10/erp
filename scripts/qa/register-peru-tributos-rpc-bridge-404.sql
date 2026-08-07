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
    RAISE EXCEPTION 'Registro 404 rechazado: la base no es PROD autorizada';
  END IF;
  IF to_regprocedure('public.guardar_tributo_mensual_tx(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.guardar_tributo_anual_tx(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Registro 404 rechazado: puentes tributarios inexistentes';
  END IF;
  SELECT name INTO v_existing_name FROM supabase_migrations.schema_migrations WHERE version = '404';
  IF v_existing_name IS NOT NULL AND v_existing_name <> '_peru_tributos_rpc_public_bridge' THEN
    RAISE EXCEPTION 'La versión 404 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '404',
  ARRAY['Aplicada desde supabase/migrations/404__peru_tributos_rpc_public_bridge.sql'],
  '_peru_tributos_rpc_public_bridge'
)
ON CONFLICT (version) DO NOTHING;
