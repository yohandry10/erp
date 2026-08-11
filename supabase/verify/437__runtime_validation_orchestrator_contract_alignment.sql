\set ON_ERROR_STOP on

BEGIN;

-- Un validador que no puede decidir no debe desaparecer de only_failed.
-- Esta función adversarial sólo vive dentro de la transacción del verifier.
CREATE FUNCTION public.validar_null_437_runtime()
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT 'null_is_failure'::text, NULL::boolean, 'ok nulo deliberado'::text;
$$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_failures text;
  v_null_failures integer;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD',
      project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true,
      configured_at = now(),
      updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY RUNTIME 437', 1, 'PE')
    INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;

  SELECT string_agg(
    format('%s.%s (%s)', pack_name, check_name, detail),
    '; ' ORDER BY pack_name, check_name
  )
    INTO v_failures
  FROM public.validar_rebuild_runtime_orchestrator(v_tenant_id, true)
  WHERE pack_name <> 'validar_null_437_runtime';

  IF v_failures IS NOT NULL THEN
    RAISE EXCEPTION 'El orquestador runtime conserva fallos: %', v_failures;
  END IF;

  SELECT count(*)::integer
    INTO v_null_failures
  FROM public.validar_rebuild_runtime_orchestrator(v_tenant_id, true)
  WHERE pack_name = 'validar_null_437_runtime'
    AND check_name = 'null_is_failure'
    AND ok IS NULL;

  IF v_null_failures <> 1 THEN
    RAISE EXCEPTION 'only_failed ocultó un resultado ok=NULL: filas=%', v_null_failures;
  END IF;
END;
$$;

ROLLBACK;
