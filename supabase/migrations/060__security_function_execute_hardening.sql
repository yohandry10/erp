-- ============================================================================
-- 060__security_function_execute_hardening.sql
-- Endurece permisos EXECUTE en funciones sensibles de contexto y operación.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.revoke_execute_if_exists(
  p_function_signature text,
  p_role text
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

  IF upper(p_role) = 'PUBLIC' THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn);
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p_role) THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', v_fn, p_role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.grant_execute_if_exists(
  p_function_signature text,
  p_role text
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

  IF upper(p_role) = 'PUBLIC' THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_fn);
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_fn, p_role);
  END IF;
END;
$$;

DO $$
DECLARE
  v_fn text;
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
BEGIN
  FOREACH v_fn IN ARRAY v_sensitive_functions LOOP
    PERFORM app.revoke_execute_if_exists(v_fn, 'PUBLIC');
    PERFORM app.revoke_execute_if_exists(v_fn, 'anon');
    PERFORM app.revoke_execute_if_exists(v_fn, 'authenticated');

    PERFORM app.grant_execute_if_exists(v_fn, 'service_role');
    PERFORM app.grant_execute_if_exists(v_fn, 'postgres');
    PERFORM app.grant_execute_if_exists(v_fn, 'supabase_admin');
  END LOOP;
END
$$;

COMMIT;
