-- Verifica el contrato RLS/auditoría vigente sobre el esquema reconstruido.
-- El archivo histórico comprobaba triggers retirados y no era SQL ejecutable.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_failures text;
  v_report_rows integer;
BEGIN
  IF to_regclass('public.rls_audit_log') IS NULL THEN
    RAISE EXCEPTION 'Falta public.rls_audit_log';
  END IF;

  IF to_regprocedure('public.validar_rls_security_runtime()') IS NULL THEN
    RAISE EXCEPTION 'Falta validar_rls_security_runtime()';
  END IF;

  IF to_regprocedure('public.generate_rls_security_report(integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta generate_rls_security_report(integer)';
  END IF;

  IF to_regclass('public.v_rls_violations_by_table') IS NULL
     OR to_regclass('public.v_rls_violations_by_user') IS NULL
     OR to_regclass('public.v_rls_violations_hourly') IS NULL
     OR to_regclass('public.v_rls_violations_recent') IS NULL THEN
    RAISE EXCEPTION 'Faltan vistas operativas de auditoría RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rls_audit_log'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'rls_audit_log debe tener RLS habilitado y forzado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rls_audit_log'
  ) THEN
    RAISE EXCEPTION 'rls_audit_log no tiene políticas RLS';
  END IF;

  SELECT string_agg(format('%s (%s)', check_name, detail), '; ' ORDER BY check_name)
    INTO v_failures
  FROM public.validar_rls_security_runtime()
  WHERE NOT ok;

  IF v_failures IS NOT NULL THEN
    RAISE EXCEPTION 'Fallos del contrato RLS runtime: %', v_failures;
  END IF;

  SELECT count(*)::integer
    INTO v_report_rows
  FROM public.generate_rls_security_report(1);

  IF v_report_rows < 0 THEN
    RAISE EXCEPTION 'El reporte RLS devolvió un conteo inválido';
  END IF;
END;
$$;

ROLLBACK;
