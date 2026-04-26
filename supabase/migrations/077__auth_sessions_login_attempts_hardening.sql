-- ============================================================================
-- 077__auth_sessions_login_attempts_hardening.sql
-- Hardening de normalización y consistencia para auth_login_attempts/user_sessions.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- auth_login_attempts: compatibilidad de tipos con runtime real de AuthService.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auth_login_attempts'
      AND column_name = 'ip_address'
      AND udt_name = 'inet'
  ) THEN
    ALTER TABLE public.auth_login_attempts
      ALTER COLUMN ip_address TYPE text
      USING NULLIF(btrim(ip_address::text), '');
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.auth_login_attempts
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS success boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- user_sessions: completar shape operativo para trazabilidad de sesión.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_sessions
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_sistema_id uuid,
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalización de intentos de login.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_auth_login_attempts_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  NEW.user_email := NULLIF(btrim(COALESCE(NEW.user_email, '')), '');
  NEW.ip_address := NULLIF(btrim(COALESCE(NEW.ip_address, '')), '');
  NEW.user_agent := NULLIF(btrim(COALESCE(NEW.user_agent, '')), '');
  NEW.failed_reason := NULLIF(btrim(COALESCE(NEW.failed_reason, '')), '');
  NEW.success := COALESCE(NEW.success, false);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  NEW.estado := upper(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      CASE WHEN NEW.success THEN 'EXITOSO' ELSE 'FALLIDO' END
    )
  );

  IF NEW.success THEN
    NEW.failed_reason := NULL;
  END IF;

  IF NEW.tenant_id IS NULL AND NEW.user_email IS NOT NULL THEN
    SELECT us.tenant_id
    INTO v_tenant_id
    FROM public.usuarios_sistema us
    WHERE lower(us.email) = lower(NEW.user_email)
    LIMIT 1;

    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_auth_login_attempts_row ON public.auth_login_attempts;
CREATE TRIGGER trg_normalize_auth_login_attempts_row
BEFORE INSERT OR UPDATE OF user_email, ip_address, user_agent, success, failed_reason, estado
ON public.auth_login_attempts
FOR EACH ROW
EXECUTE FUNCTION app.normalize_auth_login_attempts_row();

-- ----------------------------------------------------------------------------
-- Normalización de sesiones y consistencia tenant con usuario.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_user_sessions_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_user uuid;
BEGIN
  NEW.session_token := NULLIF(btrim(COALESCE(NEW.session_token, '')), '');
  NEW.ip_address := NULLIF(btrim(COALESCE(NEW.ip_address, '')), '');
  NEW.user_agent := NULLIF(btrim(COALESCE(NEW.user_agent, '')), '');
  NEW.revocation_reason := NULLIF(btrim(COALESCE(NEW.revocation_reason, '')), '');

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.last_activity := COALESCE(NEW.last_activity, NEW.created_at, now());
  NEW.expires_at := COALESCE(NEW.expires_at, NEW.created_at + interval '8 hours');
  NEW.updated_at := now();

  NEW.estado := upper(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      'ACTIVO'
    )
  );

  IF NEW.usuario_sistema_id IS NOT NULL THEN
    SELECT us.tenant_id
    INTO v_tenant_user
    FROM public.usuarios_sistema us
    WHERE us.id = NEW.usuario_sistema_id
    LIMIT 1;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_user);

  IF v_tenant_user IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM v_tenant_user THEN
    RAISE EXCEPTION 'tenant_id no coincide con usuario_sistema en user_sessions (% != %)',
      NEW.tenant_id, v_tenant_user;
  END IF;

  IF NEW.revoked_at IS NOT NULL
     AND NEW.estado = 'ACTIVO' THEN
    NEW.estado := 'REVOCADA';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_user_sessions_row ON public.user_sessions;
CREATE TRIGGER trg_normalize_user_sessions_row
BEFORE INSERT OR UPDATE OF tenant_id, usuario_sistema_id, session_token, expires_at, last_activity, revoked_at, estado
ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION app.normalize_user_sessions_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización en ambas tablas.
-- ----------------------------------------------------------------------------
UPDATE public.auth_login_attempts
SET
  user_email = NULLIF(btrim(COALESCE(user_email, '')), ''),
  ip_address = NULLIF(btrim(COALESCE(ip_address, '')), ''),
  user_agent = NULLIF(btrim(COALESCE(user_agent, '')), ''),
  success = COALESCE(success, false),
  failed_reason = CASE
    WHEN COALESCE(success, false) THEN NULL
    ELSE NULLIF(btrim(COALESCE(failed_reason, '')), '')
  END,
  estado = upper(
    COALESCE(
      NULLIF(btrim(COALESCE(estado, '')), ''),
      CASE WHEN COALESCE(success, false) THEN 'EXITOSO' ELSE 'FALLIDO' END
    )
  ),
  tenant_id = COALESCE(
    tenant_id,
    (
      SELECT us.tenant_id
      FROM public.usuarios_sistema us
      WHERE user_email IS NOT NULL
        AND lower(us.email) = lower(user_email)
      LIMIT 1
    )
  ),
  created_at = COALESCE(created_at, now()),
  updated_at = now();

UPDATE public.user_sessions s
SET
  session_token = NULLIF(btrim(COALESCE(s.session_token, '')), ''),
  ip_address = NULLIF(btrim(COALESCE(s.ip_address, '')), ''),
  user_agent = NULLIF(btrim(COALESCE(s.user_agent, '')), ''),
  revocation_reason = NULLIF(btrim(COALESCE(s.revocation_reason, '')), ''),
  created_at = COALESCE(s.created_at, now()),
  last_activity = COALESCE(s.last_activity, s.created_at, now()),
  expires_at = COALESCE(s.expires_at, s.created_at + interval '8 hours', now() + interval '8 hours'),
  estado = CASE
    WHEN s.revoked_at IS NOT NULL AND upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ACTIVO')) = 'ACTIVO'
      THEN 'REVOCADA'
    ELSE upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ACTIVO'))
  END,
  tenant_id = COALESCE(
    s.tenant_id,
    (
      SELECT us.tenant_id
      FROM public.usuarios_sistema us
      WHERE us.id = s.usuario_sistema_id
      LIMIT 1
    )
  ),
  updated_at = now();

COMMIT;
