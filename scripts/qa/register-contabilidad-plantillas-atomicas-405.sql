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
    RAISE EXCEPTION 'Registro 405 rechazado: la base no es PROD autorizada';
  END IF;
  IF to_regprocedure('public.guardar_plantilla_con_detalles_tx(uuid,text,uuid,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Registro 405 rechazado: RPC atomica inexistente';
  END IF;
  SELECT name INTO v_existing_name FROM supabase_migrations.schema_migrations WHERE version = '405';
  IF v_existing_name IS NOT NULL AND v_existing_name <> '_contabilidad_plantillas_atomicas' THEN
    RAISE EXCEPTION 'La version 405 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '405',
  ARRAY['Aplicada desde supabase/migrations/405__contabilidad_plantillas_atomicas.sql'],
  '_contabilidad_plantillas_atomicas'
)
ON CONFLICT (version) DO NOTHING;
