BEGIN;

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
      'CONTRACT_FAIL: create_demo_tenant tiene % firmas; PostgREST requiere una',
      v_count;
  END IF;
END;
$$;

ROLLBACK;
