\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_failures text;
BEGIN
  SELECT string_agg(format('%s (%s)', check_name, detail), '; ' ORDER BY check_name)
    INTO v_failures
  FROM public.validar_rls_security_runtime()
  WHERE NOT ok;

  IF v_failures IS NOT NULL THEN
    RAISE EXCEPTION 'El contrato RLS runtime conserva fallos: %', v_failures;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.v_rls_tenant_tables_audit
    WHERE needs_attention
  ) THEN
    RAISE EXCEPTION 'Persisten tablas tenant-scoped sin RLS forzado o sin políticas';
  END IF;
END;
$$;

ROLLBACK;
