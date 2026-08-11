\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_extension_schema text;
  v_result jsonb;
BEGIN
  SELECT n.nspname
    INTO v_extension_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_extension_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'pgcrypto debe vivir en extensions, actual=%', v_extension_schema;
  END IF;

  IF to_regprocedure('extensions.crypt(text,text)') IS NULL
     OR to_regprocedure('extensions.gen_salt(text)') IS NULL
     OR to_regprocedure('extensions.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Faltan funciones pgcrypto requeridas en extensions';
  END IF;

  -- La frontera PROD-only bloquea correctamente tenants en una reconstrucción
  -- sin marcar. Para probar el alta, se configura la marca canónica sólo dentro
  -- de esta transacción; el ROLLBACK final restaura UNCONFIGURED.
  UPDATE app.deployment_environment
  SET environment = 'PROD',
      project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true,
      configured_at = now(),
      updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY DEMO 436', 1, 'PE')
    INTO v_result;

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE
     OR v_result->>'tenant_id' IS NULL
     OR v_result->>'user_id' IS NULL THEN
    RAISE EXCEPTION 'create_demo_tenant no devolvió un alta válida';
  END IF;
END;
$$;

ROLLBACK;
