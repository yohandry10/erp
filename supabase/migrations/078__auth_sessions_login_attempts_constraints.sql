-- ============================================================================
-- 078__auth_sessions_login_attempts_constraints.sql
-- Constraints, índices y helpers de mantenimiento para sesiones/auth.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Dedupe por token de sesión (conservar el registro más reciente).
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY session_token
      ORDER BY
        COALESCE(last_activity, updated_at, created_at, now()) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.user_sessions
  WHERE session_token IS NOT NULL
)
DELETE FROM public.user_sessions s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad de datos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_user_sessions_token_nonempty'
        AND conrelid = 'public.user_sessions'::regclass
    ) THEN
      ALTER TABLE public.user_sessions
      ADD CONSTRAINT ck_user_sessions_token_nonempty
      CHECK (session_token IS NULL OR btrim(session_token) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_user_sessions_expires_after_created'
        AND conrelid = 'public.user_sessions'::regclass
    ) THEN
      ALTER TABLE public.user_sessions
      ADD CONSTRAINT ck_user_sessions_expires_after_created
      CHECK (
        created_at IS NULL
        OR expires_at IS NULL
        OR expires_at >= created_at
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_user_sessions_revocation_estado_consistency'
        AND conrelid = 'public.user_sessions'::regclass
    ) THEN
      ALTER TABLE public.user_sessions
      ADD CONSTRAINT ck_user_sessions_revocation_estado_consistency
      CHECK (
        revoked_at IS NULL
        OR upper(btrim(COALESCE(estado, ''))) IN ('REVOCADA', 'REVOCADO', 'INACTIVO', 'EXPIRADA')
      );
    END IF;
  END IF;

  IF to_regclass('public.auth_login_attempts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_auth_login_attempts_email_nonempty'
        AND conrelid = 'public.auth_login_attempts'::regclass
    ) THEN
      ALTER TABLE public.auth_login_attempts
      ADD CONSTRAINT ck_auth_login_attempts_email_nonempty
      CHECK (user_email IS NULL OR btrim(user_email) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_auth_login_attempts_failed_reason_when_success'
        AND conrelid = 'public.auth_login_attempts'::regclass
    ) THEN
      ALTER TABLE public.auth_login_attempts
      ADD CONSTRAINT ck_auth_login_attempts_failed_reason_when_success
      CHECK ((NOT COALESCE(success, false)) OR failed_reason IS NULL);
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.user_sessions
  VALIDATE CONSTRAINT ck_user_sessions_token_nonempty;
ALTER TABLE IF EXISTS public.user_sessions
  VALIDATE CONSTRAINT ck_user_sessions_expires_after_created;
ALTER TABLE IF EXISTS public.user_sessions
  VALIDATE CONSTRAINT ck_user_sessions_revocation_estado_consistency;

ALTER TABLE IF EXISTS public.auth_login_attempts
  VALIDATE CONSTRAINT ck_auth_login_attempts_email_nonempty;
ALTER TABLE IF EXISTS public.auth_login_attempts
  VALIDATE CONSTRAINT ck_auth_login_attempts_failed_reason_when_success;

-- ----------------------------------------------------------------------------
-- Índices de consulta reales para auth/sesiones.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_token
ON public.user_sessions (session_token)
WHERE session_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_activity_active
ON public.user_sessions (usuario_sistema_id, last_activity DESC)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_expiry_active
ON public.user_sessions (tenant_id, expires_at DESC)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_cleanup
ON public.user_sessions (expires_at)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email_success_created
ON public.auth_login_attempts (user_email, success, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_ip_created
ON public.auth_login_attempts (ip_address, created_at DESC)
WHERE ip_address IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Helpers de mantenimiento de sesiones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_user_session(
  p_session_token text,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := NULLIF(btrim(COALESCE(p_session_token, '')), '');
  IF v_token IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.user_sessions
  SET
    revoked_at = COALESCE(revoked_at, now()),
    revocation_reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), revocation_reason),
    estado = CASE
      WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')) = 'ACTIVO' THEN 'REVOCADA'
      ELSE upper(COALESCE(NULLIF(btrim(estado), ''), 'REVOCADA'))
    END,
    updated_at = now()
  WHERE session_token = v_token
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_user_sessions(
  p_limit integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_deleted bigint;
BEGIN
  v_limit := GREATEST(COALESCE(p_limit, 5000), 1);

  WITH target AS (
    SELECT id
    FROM public.user_sessions
    WHERE
      (expires_at IS NOT NULL AND expires_at < now())
      OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '90 days')
    ORDER BY
      COALESCE(expires_at, revoked_at, created_at, now()) ASC
    LIMIT v_limit
  )
  DELETE FROM public.user_sessions s
  USING target t
  WHERE s.id = t.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN COALESCE(v_deleted, 0);
END;
$$;

COMMIT;
