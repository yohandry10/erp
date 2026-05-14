-- ============================================================================
-- 302__auth_failed_login_attempts_atomic_rpc.sql
-- Incremento atomico de intentos fallidos de login.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.increment_failed_login_attempts(
  p_user_id uuid,
  p_max_attempts integer DEFAULT 5,
  p_lock_minutes integer DEFAULT 15
)
RETURNS TABLE (
  failed_login_attempts integer,
  locked_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  RETURN QUERY
  UPDATE public.usuarios_sistema u
  SET
    failed_login_attempts = COALESCE(u.failed_login_attempts, 0) + 1,
    locked_until = CASE
      WHEN COALESCE(u.failed_login_attempts, 0) + 1 >= GREATEST(COALESCE(p_max_attempts, 5), 1)
        THEN now() + make_interval(mins => GREATEST(COALESCE(p_lock_minutes, 15), 1))
      ELSE u.locked_until
    END,
    updated_at = now()
  WHERE u.id = p_user_id
  RETURNING u.failed_login_attempts, u.locked_until;
END;
$$;

REVOKE ALL ON FUNCTION app.increment_failed_login_attempts(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.increment_failed_login_attempts(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION app.increment_failed_login_attempts(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.increment_failed_login_attempts(uuid, integer, integer) TO service_role;

COMMIT;
