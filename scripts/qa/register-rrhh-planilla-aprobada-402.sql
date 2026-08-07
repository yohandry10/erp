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
    RAISE EXCEPTION 'Registro 402 rechazado: la base no es PROD autorizada';
  END IF;

  IF app.normalize_planilla_estado('aprobada', 'pendiente') <> 'aprobada' THEN
    RAISE EXCEPTION 'Registro 402 rechazado: contrato APROBADA ausente';
  END IF;

  SELECT name
  INTO v_existing_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '402';

  IF v_existing_name IS NOT NULL
     AND v_existing_name <> '_rrhh_planilla_aprobada_estado' THEN
    RAISE EXCEPTION 'La versión 402 ya pertenece a %', v_existing_name;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '402',
  ARRAY['Aplicada desde supabase/migrations/402__rrhh_planilla_aprobada_estado.sql'],
  '_rrhh_planilla_aprobada_estado'
)
ON CONFLICT (version) DO NOTHING;
