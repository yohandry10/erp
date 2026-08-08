BEGIN;

DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure(
    'public.create_demo_tenant(character varying,integer,character varying)'
  );
  v_arg_names text[];
BEGIN
  IF v_rpc IS NULL THEN
    RAISE EXCEPTION 'Falta la firma de tres argumentos de create_demo_tenant';
  END IF;

  SELECT proargnames INTO v_arg_names FROM pg_proc WHERE oid = v_rpc;
  IF v_arg_names IS DISTINCT FROM ARRAY['p_nombre', 'p_dias_duracion', 'p_pais_codigo']::text[] THEN
    RAISE EXCEPTION 'Nombres de argumentos incompatibles con PostgREST: %', v_arg_names;
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_demo_tenant') <> 1 THEN
    RAISE EXCEPTION 'create_demo_tenant conserva sobrecargas ambiguas';
  END IF;

  IF has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Privilegios incorrectos para create_demo_tenant';
  END IF;
END;
$$;

ROLLBACK;
