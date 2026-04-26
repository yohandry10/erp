-- ============================================================================
-- 079__auth_sessions_login_attempts_validation_pack.sql
-- Pack de validación runtime para auth_login_attempts y user_sessions.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_auth_sessions_runtime(
  p_tenant_id uuid DEFAULT NULL
)
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
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_normalize_auth_login_attempts_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'auth_login_attempts'
        AND t.tgname = 'trg_normalize_auth_login_attempts_row'
        AND NOT t.tgisinternal
    ),
    'normalización de intentos de login';

  RETURN QUERY
  SELECT
    'trigger_normalize_user_sessions_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'user_sessions'
        AND t.tgname = 'trg_normalize_user_sessions_row'
        AND NOT t.tgisinternal
    ),
    'normalización de sesiones';

  RETURN QUERY
  SELECT
    'auth_login_attempts_ip_address_type_text'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auth_login_attempts'
        AND column_name = 'ip_address'
        AND udt_name = 'text'
    ),
    'soporta ip_address no-IPv4/no-IPv6 (ej: unknown)';

  RETURN QUERY
  SELECT
    'ux_user_sessions_token_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_sessions'
        AND indexname = 'ux_user_sessions_token'
    ),
    'unicidad por token de sesión';

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_sessions s
  LEFT JOIN public.usuarios_sistema us
    ON us.id = s.usuario_sistema_id
  WHERE s.usuario_sistema_id IS NOT NULL
    AND us.id IS NULL
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'sessions_with_missing_usuario_sistema'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_sessions s
  JOIN public.usuarios_sistema us
    ON us.id = s.usuario_sistema_id
  WHERE s.tenant_id IS DISTINCT FROM us.tenant_id
    AND (
      p_tenant_id IS NULL
      OR s.tenant_id = p_tenant_id
      OR us.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'tenant_mismatch_user_sessions'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT session_token, COUNT(*) AS c
    FROM public.user_sessions
    WHERE session_token IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY session_token
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_session_token_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_sessions s
  WHERE s.revoked_at IS NULL
    AND (s.session_token IS NULL OR s.expires_at IS NULL)
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'active_sessions_missing_token_or_expiry'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_sessions s
  WHERE s.revoked_at IS NULL
    AND s.expires_at IS NOT NULL
    AND s.expires_at < now()
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'expired_sessions_not_revoked'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auth_login_attempts a
  WHERE COALESCE(a.success, false) = false
    AND a.failed_reason IS NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'failed_login_without_reason'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.auth_login_attempts a
  WHERE COALESCE(a.success, false) = true
    AND a.failed_reason IS NOT NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'successful_login_with_failed_reason'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_auth_sessions_runtime_status_actual AS
SELECT *
FROM public.validar_auth_sessions_runtime(app.resolve_request_tenant_id());

COMMIT;
