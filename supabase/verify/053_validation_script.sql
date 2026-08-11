-- Verificación automatizada del aislamiento RLS fiscal vigente.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_table text;
  v_rls_enabled boolean;
  v_rls_forced boolean;
  v_policy_count integer;
BEGIN
  IF to_regprocedure('app.current_tenant_id()') IS NULL THEN
    RAISE EXCEPTION 'Falta app.current_tenant_id()';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'cpe',
    'gre',
    'sire_files',
    'auditoria',
    'rls_alert_config',
    'rls_alert_history'
  ] LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO v_rls_enabled, v_rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table
      AND c.relkind = 'r';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Falta la tabla fiscal public.%', v_table;
    END IF;

    IF NOT v_rls_enabled OR NOT v_rls_forced THEN
      RAISE EXCEPTION 'public.% requiere RLS habilitado y forzado', v_table;
    END IF;

    SELECT count(*)::integer
      INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v_table;

    IF v_policy_count = 0 THEN
      RAISE EXCEPTION 'public.% no tiene políticas RLS', v_table;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
