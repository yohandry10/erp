-- ============================================================================
-- 064__security_functions_validation_pack.sql
-- Pack de validación runtime para hardening de funciones sensibles.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_security_functions_runtime()
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  i integer;
  v_fn text;
  v_expected_search_path text;
  v_proc regprocedure;
  v_actual_search_path text;
  v_role text;
  v_has_priv boolean;
  v_count bigint;
  v_sensitive_functions text[] := ARRAY[
    'app.set_tenant_context(uuid,uuid,boolean)',
    'app.clear_tenant_context()',
    'public."app.set_tenant_context"(uuid,uuid)',
    'public.set_tenant_context(uuid,uuid,boolean)',
    'public.set_config(text,text,boolean)',
    'public.pgrst_reload_schema()',
    'public.acquire_job_lock(text,integer)',
    'public.release_job_lock(text)',
    'public.acquire_pos_lock(uuid,text)',
    'public.release_pos_lock(uuid,text)',
    'public.get_pending_outbox_events(integer)',
    'public.mark_outbox_event_processing(uuid)',
    'public.mark_outbox_event_completed(uuid)',
    'public.mark_outbox_event_failed(uuid,text,timestamptz)'
  ];
  v_expected_paths text[] := ARRAY[
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,pg_catalog,pg_temp',
    'public,pg_catalog,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp',
    'public,app,pg_temp'
  ];
BEGIN
  RETURN QUERY
  SELECT
    'security_definer_inventory_view_exists'::text,
    to_regclass('public.v_security_definer_inventory') IS NOT NULL,
    'vista forense de funciones SECURITY DEFINER';

  RETURN QUERY
  SELECT
    'security_definer_risk_summary_view_exists'::text,
    to_regclass('public.v_security_definer_risk_summary') IS NOT NULL,
    'vista resumen de riesgo de funciones SECURITY DEFINER';

  FOR i IN 1..COALESCE(array_length(v_sensitive_functions, 1), 0) LOOP
    v_fn := v_sensitive_functions[i];
    v_expected_search_path := regexp_replace(v_expected_paths[i], '\s+', '', 'g');
    v_proc := to_regprocedure(v_fn);

    RETURN QUERY
    SELECT
      format('function_exists:%s', v_fn),
      v_proc IS NOT NULL,
      'función sensible para contexto/operación';

    IF v_proc IS NULL THEN
      CONTINUE;
    END IF;

    SELECT
      regexp_replace(split_part(cfg, '=', 2), '\s+', '', 'g')
    INTO v_actual_search_path
    FROM pg_proc p
    CROSS JOIN LATERAL unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
    WHERE p.oid = v_proc::oid
      AND cfg LIKE 'search_path=%'
    LIMIT 1;

    RETURN QUERY
    SELECT
      format('search_path_expected:%s', v_fn),
      COALESCE(v_actual_search_path, '') = v_expected_search_path,
      format(
        'expected=%s actual=%s',
        v_expected_search_path,
        COALESCE(v_actual_search_path, '<null>')
      );

    FOREACH v_role IN ARRAY ARRAY['PUBLIC', 'anon', 'authenticated'] LOOP
      IF upper(v_role) = 'PUBLIC' THEN
        v_has_priv := has_function_privilege('public', v_proc::oid, 'EXECUTE');
        RETURN QUERY
        SELECT
          format('execute_revoked:%s:%s', v_fn, lower(v_role)),
          NOT v_has_priv,
          format('has_execute=%s', v_has_priv);
      ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        v_has_priv := has_function_privilege(v_role, v_proc::oid, 'EXECUTE');
        RETURN QUERY
        SELECT
          format('execute_revoked:%s:%s', v_fn, lower(v_role)),
          NOT v_has_priv,
          format('has_execute=%s', v_has_priv);
      ELSE
        RETURN QUERY
        SELECT
          format('execute_revoked:%s:%s', v_fn, lower(v_role)),
          true,
          'role_not_present';
      END IF;
    END LOOP;

    FOREACH v_role IN ARRAY ARRAY['service_role', 'postgres', 'supabase_admin'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        v_has_priv := has_function_privilege(v_role, v_proc::oid, 'EXECUTE');
        RETURN QUERY
        SELECT
          format('execute_granted:%s:%s', v_fn, lower(v_role)),
          v_has_priv,
          format('has_execute=%s', v_has_priv);
      ELSE
        RETURN QUERY
        SELECT
          format('execute_granted:%s:%s', v_fn, lower(v_role)),
          true,
          'role_not_present';
      END IF;
    END LOOP;
  END LOOP;

  IF to_regclass('public.v_security_definer_inventory') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.v_security_definer_inventory
    WHERE risk_level = 'CRITICAL';

    RETURN QUERY
    SELECT
      'security_definer_critical_risk_count'::text,
      (v_count = 0),
      format('count=%s', v_count);

    SELECT COUNT(*)
    INTO v_count
    FROM public.v_security_definer_inventory
    WHERE NOT has_search_path;

    RETURN QUERY
    SELECT
      'security_definer_missing_search_path_count'::text,
      (v_count = 0),
      format('count=%s', v_count);

    SELECT COUNT(*)
    INTO v_count
    FROM public.v_security_definer_inventory
    WHERE execute_public
       OR COALESCE(execute_anon, false)
       OR COALESCE(execute_authenticated, false);

    RETURN QUERY
    SELECT
      'security_definer_exposed_to_client_roles_count'::text,
      (v_count = 0),
      format('count=%s', v_count);
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.v_security_functions_runtime_status_actual AS
SELECT *
FROM public.validar_security_functions_runtime();

COMMIT;
