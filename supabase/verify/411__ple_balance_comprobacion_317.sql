DO $$
DECLARE
  v_definition text;
  v_security_definer boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '411'
      AND name = '_ple_balance_comprobacion_317'
  ) THEN
    RAISE EXCEPTION '411: migracion no registrada';
  END IF;

  IF to_regprocedure(
    'public.ple_balance_comprobacion_317(uuid,integer,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION '411: RPC PLE 3.17 inexistente';
  END IF;

  SELECT pg_get_functiondef(
    'public.ple_balance_comprobacion_317(uuid,integer,integer)'::regprocedure
  ) INTO v_definition;

  SELECT p.prosecdef
  INTO v_security_definer
  FROM pg_proc p
  WHERE p.oid = 'public.ple_balance_comprobacion_317(uuid,integer,integer)'::regprocedure;

  IF position('CONFIRMADO' IN v_definition) = 0
     OR position('CIERRE_ANUAL' IN v_definition) = 0
     OR v_security_definer THEN
    RAISE EXCEPTION '411: la RPC no conserva filtros/segmentación/seguridad esperados';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.ple_balance_comprobacion_317(uuid,integer,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.ple_balance_comprobacion_317(uuid,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION '411: la RPC quedó expuesta fuera del backend';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.ple_balance_comprobacion_317(uuid,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION '411: service_role no puede ejecutar la RPC';
  END IF;
END;
$$;

SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege(
    'service_role', p.oid, 'EXECUTE'
  ) AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'ple_balance_comprobacion_317';
