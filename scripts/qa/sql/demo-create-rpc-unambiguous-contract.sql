BEGIN;

DO $$
DECLARE
  v_count integer;
  v_rpc regprocedure;
  v_arg_names text[];
BEGIN
  SELECT count(*)
    INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_demo_tenant';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'CONTRACT_FAIL: create_demo_tenant tiene % firmas; PostgREST requiere una',
      v_count;
  END IF;

  v_rpc := to_regprocedure(
    'public.create_demo_tenant(character varying,integer,character varying)'
  );
  IF v_rpc IS NULL THEN
    RAISE EXCEPTION
      'CONTRACT_FAIL: falta create_demo_tenant(varchar,integer,varchar)';
  END IF;

  SELECT proargnames INTO v_arg_names FROM pg_proc WHERE oid = v_rpc;
  IF v_arg_names IS DISTINCT FROM ARRAY['p_nombre', 'p_dias_duracion', 'p_pais_codigo']::text[] THEN
    RAISE EXCEPTION
      'CONTRACT_FAIL: nombres de argumentos incompatibles con PostgREST: %',
      v_arg_names;
  END IF;
END;
$$;

ROLLBACK;
