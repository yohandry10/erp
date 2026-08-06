-- PostgREST cannot resolve an RPC call when both the historical two-argument
-- function and the country-aware three-argument function (all arguments with
-- defaults) coexist. Keep exactly one callable signature per database.
--
-- Environments upgraded with the country-aware function retain that version;
-- clean environments that only have the historical function remain valid.
DO $$
BEGIN
  IF to_regprocedure('public.create_demo_tenant(character varying,integer,character varying)') IS NOT NULL
     AND to_regprocedure('public.create_demo_tenant(character varying,integer)') IS NOT NULL THEN
    DROP FUNCTION public.create_demo_tenant(character varying, integer);
  END IF;
END;
$$;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_demo_tenant';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'create_demo_tenant debe tener una sola firma para PostgREST; encontradas: %',
      v_count;
  END IF;
END;
$$;
