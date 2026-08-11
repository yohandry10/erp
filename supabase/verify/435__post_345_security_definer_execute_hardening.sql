\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_exposed text;
BEGIN
  SELECT string_agg(
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    '; ' ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  )
    INTO v_exposed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef
    AND n.nspname IN ('public', 'app')
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    AND NOT (
      n.nspname = 'app'
      AND p.proname IN ('hoy_tenant', 'puede_leer_grupo_consolidacion_393')
    );

  IF v_exposed IS NOT NULL THEN
    RAISE EXCEPTION 'RPC SECURITY DEFINER expuestas fuera del allowlist: %', v_exposed;
  END IF;
END;
$$;

ROLLBACK;
