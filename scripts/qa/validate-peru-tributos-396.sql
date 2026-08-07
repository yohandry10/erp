\set ON_ERROR_STOP on
\pset pager off

DO $$
DECLARE
  v_environment text;
  v_project_ref text;
BEGIN
  SELECT environment, project_ref INTO v_environment, v_project_ref
  FROM app.deployment_environment WHERE singleton = true;

  IF v_environment <> 'PROD' OR v_project_ref <> 'wypnbcptofqdmoynlonq' THEN
    RAISE EXCEPTION 'Validación 396 rechazada: la base no es PROD autorizada';
  END IF;
  IF to_regclass('public.tributos_declaraciones_mensuales') IS NULL THEN
    RAISE EXCEPTION 'Falta public.tributos_declaraciones_mensuales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'tributos_declaraciones_mensuales'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS/FORCE RLS incompleto en tributos_declaraciones_mensuales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'tributos_declaraciones_mensuales' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION 'Falta policy tenant_isolation en tributos_declaraciones_mensuales';
  END IF;
  IF to_regprocedure('app.guardar_tributo_mensual_tx(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('app.registrar_constancia_tributo_mensual_tx(uuid,uuid,uuid,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Faltan funciones transaccionales de tributos mensuales';
  END IF;
  IF has_table_privilege('anon', 'public.tributos_declaraciones_mensuales', 'SELECT')
     OR has_table_privilege('authenticated', 'public.tributos_declaraciones_mensuales', 'SELECT') THEN
    RAISE EXCEPTION 'Anon/authenticated conservan acceso directo a tributos mensuales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '396' AND name = '_peru_tributos_mensuales'
  ) THEN
    RAISE EXCEPTION 'La migración 396 no quedó registrada';
  END IF;
END
$$;

SELECT
  (SELECT count(*) FROM public.tributos_declaraciones_mensuales) AS declaraciones_existentes,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '396') AS historial_396;
