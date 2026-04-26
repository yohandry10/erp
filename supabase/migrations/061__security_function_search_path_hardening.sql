-- ============================================================================
-- 061__security_function_search_path_hardening.sql
-- Asegura search_path explícito en funciones sensibles para evitar hijacking.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.set_function_search_path_if_exists(
  p_function_signature text,
  p_search_path text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fn regprocedure;
BEGIN
  v_fn := to_regprocedure(p_function_signature);
  IF v_fn IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('ALTER FUNCTION %s SET search_path = %s', v_fn, p_search_path);
END;
$$;

DO $$
BEGIN
  PERFORM app.set_function_search_path_if_exists(
    'app.set_tenant_context(uuid,uuid,boolean)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'app.clear_tenant_context()',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public."app.set_tenant_context"(uuid,uuid)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.set_tenant_context(uuid,uuid,boolean)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.set_config(text,text,boolean)',
    'public, pg_catalog, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.pgrst_reload_schema()',
    'public, pg_catalog, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.acquire_job_lock(text,integer)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.release_job_lock(text)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.acquire_pos_lock(uuid,text)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.release_pos_lock(uuid,text)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.get_pending_outbox_events(integer)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.mark_outbox_event_processing(uuid)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.mark_outbox_event_completed(uuid)',
    'public, app, pg_temp'
  );

  PERFORM app.set_function_search_path_if_exists(
    'public.mark_outbox_event_failed(uuid,text,timestamptz)',
    'public, app, pg_temp'
  );
END
$$;

COMMIT;
