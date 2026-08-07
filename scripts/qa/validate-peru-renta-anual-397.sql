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
    RAISE EXCEPTION 'Validación 397 rechazada: la base no es PROD autorizada';
  END IF;
  IF to_regclass('public.tributos_declaraciones_anuales') IS NULL THEN
    RAISE EXCEPTION 'Falta tributos_declaraciones_anuales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'tributos_declaraciones_anuales'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'RLS/FORCE RLS anual incompleto'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'tributos_declaraciones_anuales' AND policyname = 'tenant_isolation'
  ) THEN RAISE EXCEPTION 'Falta policy tenant anual'; END IF;
  IF has_table_privilege('anon', 'public.tributos_declaraciones_anuales', 'SELECT')
     OR has_table_privilege('authenticated', 'public.tributos_declaraciones_anuales', 'SELECT') THEN
    RAISE EXCEPTION 'Anon/authenticated conservan acceso anual';
  END IF;
  IF to_regprocedure('app.guardar_tributo_anual_tx(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('app.registrar_constancia_tributo_anual_tx(uuid,uuid,uuid,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Faltan RPC anuales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '397' AND name = '_peru_renta_anual_itan'
  ) THEN RAISE EXCEPTION '397 no registrada'; END IF;
END
$$;
SELECT
  (SELECT count(*) FROM public.tributos_declaraciones_anuales) AS declaraciones_anuales,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '397') AS historial_397;
