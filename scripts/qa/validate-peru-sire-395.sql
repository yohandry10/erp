\set ON_ERROR_STOP on
\pset pager off

DO $$
DECLARE
  v_environment text;
  v_project_ref text;
BEGIN
  SELECT environment, project_ref
  INTO v_environment, v_project_ref
  FROM app.deployment_environment
  WHERE singleton = true;

  IF v_environment <> 'PROD' OR v_project_ref <> 'wypnbcptofqdmoynlonq' THEN
    RAISE EXCEPTION 'Validación 395 rechazada: la base no es PROD autorizada';
  END IF;
  IF to_regclass('public.sire_operaciones') IS NULL THEN
    RAISE EXCEPTION 'Falta public.sire_operaciones';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresa_config'
      AND column_name = 'sire_activo' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Falta empresa_config.sire_activo NOT NULL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sire_files'
      AND column_name = 'sunat_ticket'
  ) THEN
    RAISE EXCEPTION 'Faltan columnas de ticket en sire_files';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'sire_operaciones'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS/FORCE RLS incompleto en sire_operaciones';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sire_operaciones'
      AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION 'Falta policy tenant_isolation en sire_operaciones';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '395' AND name = '_peru_sire_api_evidence'
  ) THEN
    RAISE EXCEPTION 'La migración 395 no quedó registrada';
  END IF;
END
$$;

SELECT
  (SELECT count(*) FROM public.sire_operaciones) AS operaciones_existentes,
  (SELECT count(*) FROM public.empresa_config WHERE sire_activo) AS tenants_sire_activo,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '395') AS historial_395;
