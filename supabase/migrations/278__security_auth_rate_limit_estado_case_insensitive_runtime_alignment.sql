-- ============================================================================
-- 278__security_auth_rate_limit_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en seguridad/auth/rate-limit.
-- Tablas foco:
--   public.auth_login_attempts
--   public.user_sessions
--   public.trusted_ips
--   public.rate_limit_blocks
--   public.rate_limit_configs
--   public.rate_limit_anomalies
--   public.rate_limit_baselines
--   public.request_logs
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion de estado por vertical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_security_auth_rate_limit_estado_278(
  p_table text,
  p_estado text,
  p_flag boolean DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_table text;
  v text;
BEGIN
  v_table := lower(COALESCE(NULLIF(btrim(COALESCE(p_table, '')), ''), ''));
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE', 'ACTIVA') THEN
    v := 'ACTIVO';
  END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'INACTIVA', 'BAJA', 'ARCHIVADO') THEN
    v := 'INACTIVO';
  END IF;

  IF v IN ('SUCCESS', 'SUCCEEDED', 'OK', 'EXITOSA') THEN
    v := 'EXITOSO';
  END IF;
  IF v IN ('FAIL', 'FAILED', 'FAILURE', 'ERROR', 'ERRONEO') THEN
    v := 'FALLIDO';
  END IF;

  IF v = 'REVOCADO' THEN
    v := 'REVOCADA';
  END IF;
  IF v IN ('EXPIRED', 'EXPIRADO') THEN
    v := 'EXPIRADA';
  END IF;
  IF v IN ('BLOCKED', 'BLOQUEADO') THEN
    v := 'BLOQUEADA';
  END IF;
  IF v IN ('REVISADO', 'REVIEWED', 'RESUELTA', 'RESUELTO') THEN
    v := 'REVISADA';
  END IF;

  IF v_table = 'auth_login_attempts' THEN
    IF v = '' THEN
      v := CASE WHEN COALESCE(p_flag, false) THEN 'EXITOSO' ELSE 'FALLIDO' END;
    END IF;
    IF v NOT IN ('EXITOSO', 'FALLIDO', 'BLOQUEADA') THEN
      v := CASE WHEN COALESCE(p_flag, false) THEN 'EXITOSO' ELSE 'FALLIDO' END;
    END IF;
    RETURN v::citext;
  END IF;

  IF v_table = 'user_sessions' THEN
    IF v = '' THEN
      v := CASE WHEN COALESCE(p_flag, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
    END IF;
    IF v NOT IN ('ACTIVO', 'INACTIVO', 'REVOCADA', 'EXPIRADA') THEN
      v := CASE WHEN COALESCE(p_flag, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
    END IF;
    RETURN v::citext;
  END IF;

  IF v_table = 'rate_limit_anomalies' THEN
    IF v = '' THEN
      v := 'ACTIVO';
    END IF;
    IF v NOT IN ('ACTIVO', 'INACTIVO', 'REVISADA') THEN
      v := 'ACTIVO';
    END IF;
    RETURN v::citext;
  END IF;

  IF v = '' THEN
    v := CASE WHEN COALESCE(p_flag, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;
  IF v NOT IN ('ACTIVO', 'INACTIVO') THEN
    v := CASE WHEN COALESCE(p_flag, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas minimas de contrato.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.auth_login_attempts
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'FALLIDO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.user_sessions
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.trusted_ips
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.rate_limit_blocks
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.rate_limit_configs
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.rate_limit_anomalies
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.rate_limit_baselines
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.request_logs
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalizadores runtime (reemplazo compatible de funciones existentes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_auth_login_attempts_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  NEW.user_email := NULLIF(lower(btrim(COALESCE(NEW.user_email, ''))), '');
  NEW.ip_address := NULLIF(btrim(COALESCE(NEW.ip_address, '')), '');
  NEW.user_agent := NULLIF(btrim(COALESCE(NEW.user_agent, '')), '');
  NEW.failed_reason := NULLIF(btrim(COALESCE(NEW.failed_reason, '')), '');
  NEW.success := COALESCE(NEW.success, false);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'auth_login_attempts',
    NEW.estado::text,
    NEW.success
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

CREATE OR REPLACE FUNCTION app.normalize_user_sessions_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_user uuid;
  v_is_active boolean;
BEGIN
  NEW.session_token := NULLIF(btrim(COALESCE(NEW.session_token, '')), '');
  NEW.ip_address := NULLIF(btrim(COALESCE(NEW.ip_address, '')), '');
  NEW.user_agent := NULLIF(btrim(COALESCE(NEW.user_agent, '')), '');
  NEW.revocation_reason := NULLIF(btrim(COALESCE(NEW.revocation_reason, '')), '');

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.last_activity := COALESCE(NEW.last_activity, NEW.created_at, now());
  NEW.expires_at := COALESCE(NEW.expires_at, NEW.created_at + interval '8 hours');
  NEW.updated_at := COALESCE(NEW.updated_at, now());

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

  v_is_active := (
    NEW.revoked_at IS NULL
    AND (NEW.expires_at IS NULL OR NEW.expires_at > now())
  );

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'user_sessions',
    NEW.estado::text,
    v_is_active
  );

  IF NEW.revoked_at IS NOT NULL AND lower(NEW.estado::text) = 'activo' THEN
    NEW.estado := 'REVOCADA'::citext;
  ELSIF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() AND lower(NEW.estado::text) = 'activo' THEN
    NEW.estado := 'EXPIRADA'::citext;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_trusted_ips_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.description := COALESCE(
    NULLIF(btrim(COALESCE(NEW.description, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    CASE
      WHEN NEW.ip_address IS NOT NULL THEN format('Trusted IP %s', NEW.ip_address::text)
      ELSE 'Trusted IP'
    END
  );

  NEW.active := COALESCE(
    NEW.active,
    lower(app.normalize_security_auth_rate_limit_estado_278('trusted_ips', NEW.estado::text, true)::text) = 'activo'
  );

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'trusted_ips',
    NEW.estado::text,
    NEW.active
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_rate_limit_blocks_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_is_active boolean;
BEGIN
  NEW.reason := COALESCE(
    NULLIF(btrim(COALESCE(NEW.reason, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'RATE_LIMIT'
  );
  NEW.blocked_endpoint := NULLIF(btrim(COALESCE(NEW.blocked_endpoint, '')), '');
  NEW.request_count := GREATEST(COALESCE(NEW.request_count, 0), 0);

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  v_is_active := (
    NEW.released_at IS NULL
    AND (NEW.expires_at IS NULL OR NEW.expires_at > now())
  );

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'rate_limit_blocks',
    NEW.estado::text,
    v_is_active
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_rate_limit_configs_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.endpoint_pattern := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.endpoint_pattern, ''))), ''),
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    NULLIF(upper(btrim(COALESCE(NEW.nombre, ''))), ''),
    'DEFAULT'
  );

  NEW.base_limit := GREATEST(COALESCE(NEW.base_limit, 100), 1);
  NEW.window_ms := GREATEST(COALESCE(NEW.window_ms, 60000), 1000);
  NEW.adaptive_multiplier := GREATEST(COALESCE(NEW.adaptive_multiplier, 3), 0.1);
  NEW.burst_multiplier := GREATEST(COALESCE(NEW.burst_multiplier, 5), 1);

  NEW.enabled := COALESCE(
    NEW.enabled,
    lower(app.normalize_security_auth_rate_limit_estado_278('rate_limit_configs', NEW.estado::text, true)::text) = 'activo'
  );

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'rate_limit_configs',
    NEW.estado::text,
    NEW.enabled
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_rate_limit_anomalies_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.endpoint := COALESCE(
    NULLIF(btrim(COALESCE(NEW.endpoint, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'UNKNOWN'
  );
  NEW.anomaly_type := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.anomaly_type, '')), ''), 'SUSTAINED'));
  NEW.severity := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.severity, '')), ''), 'MEDIUM'));
  NEW.description := COALESCE(
    NULLIF(btrim(COALESCE(NEW.description, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('Rate limit anomaly (%s)', NEW.anomaly_type)
  );
  NEW.request_count := GREATEST(COALESCE(NEW.request_count, 0), 0);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'rate_limit_anomalies',
    NEW.estado::text,
    true
  );

  IF NEW.reviewed_at IS NOT NULL AND lower(NEW.estado::text) = 'activo' THEN
    NEW.estado := 'REVISADA'::citext;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_rate_limit_baselines_row_278()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.endpoint := NULLIF(btrim(COALESCE(NEW.endpoint, '')), '');
  NEW.avg_requests_per_hour := GREATEST(COALESCE(NEW.avg_requests_per_hour, 0), 0);
  NEW.max_requests_per_hour := GREATEST(COALESCE(NEW.max_requests_per_hour, 0), 0);
  NEW.std_deviation := GREATEST(COALESCE(NEW.std_deviation, 0), 0);
  NEW.sample_count := GREATEST(COALESCE(NEW.sample_count, 0), 0);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'rate_limit_baselines',
    NEW.estado::text,
    true
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_request_logs_row_278()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.endpoint := NULLIF(btrim(COALESCE(NEW.endpoint, '')), '');
  NEW.status_code := CASE
    WHEN NEW.status_code IS NULL THEN NULL
    ELSE GREATEST(LEAST(NEW.status_code, 599), 100)
  END;
  NEW.response_time_ms := CASE
    WHEN NEW.response_time_ms IS NULL THEN NULL
    ELSE GREATEST(NEW.response_time_ms, 0)
  END;
  NEW.request_size := CASE
    WHEN NEW.request_size IS NULL THEN NULL
    ELSE GREATEST(NEW.request_size, 0)
  END;
  NEW.response_size := CASE
    WHEN NEW.response_size IS NULL THEN NULL
    ELSE GREATEST(NEW.response_size, 0)
  END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  NEW.estado := app.normalize_security_auth_rate_limit_estado_278(
    'request_logs',
    NEW.estado::text,
    true
  );

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_normalize_auth_login_attempts_row ON public.auth_login_attempts;
DROP TRIGGER IF EXISTS trg_normalize_user_sessions_row ON public.user_sessions;
DROP TRIGGER IF EXISTS trg_normalize_trusted_ips_row ON public.trusted_ips;
DROP TRIGGER IF EXISTS trg_normalize_rate_limit_blocks_row ON public.rate_limit_blocks;
DROP TRIGGER IF EXISTS trg_normalize_rate_limit_configs_row ON public.rate_limit_configs;
DROP TRIGGER IF EXISTS trg_normalize_rate_limit_anomalies_row ON public.rate_limit_anomalies;
DROP TRIGGER IF EXISTS trg_normalize_rate_limit_baselines_row_278 ON public.rate_limit_baselines;
DROP TRIGGER IF EXISTS trg_normalize_request_logs_row_278 ON public.request_logs;

ALTER TABLE public.auth_login_attempts
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278('auth_login_attempts', estado::text, COALESCE(success, false));

ALTER TABLE public.user_sessions
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278(
    'user_sessions',
    estado::text,
    (revoked_at IS NULL)
  );

ALTER TABLE public.trusted_ips
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278('trusted_ips', estado::text, COALESCE(active, true));

ALTER TABLE public.rate_limit_blocks
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278(
    'rate_limit_blocks',
    estado::text,
    (released_at IS NULL)
  );

ALTER TABLE public.rate_limit_configs
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278('rate_limit_configs', estado::text, COALESCE(enabled, true));

ALTER TABLE public.rate_limit_anomalies
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278('rate_limit_anomalies', estado::text, true);

ALTER TABLE public.rate_limit_baselines
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278('rate_limit_baselines', estado::text, true);

ALTER TABLE public.request_logs
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_auth_rate_limit_estado_278('request_logs', estado::text, true);

-- ----------------------------------------------------------------------------
-- Defaults canonicos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.auth_login_attempts
  ALTER COLUMN estado SET DEFAULT 'FALLIDO'::citext;

ALTER TABLE public.user_sessions
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.trusted_ips
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN active SET DEFAULT true;

ALTER TABLE public.rate_limit_blocks
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.rate_limit_configs
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN enabled SET DEFAULT true;

ALTER TABLE public.rate_limit_anomalies
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.rate_limit_baselines
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.request_logs
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.auth_login_attempts
SET
  estado = app.normalize_security_auth_rate_limit_estado_278('auth_login_attempts', estado::text, COALESCE(success, false)),
  updated_at = COALESCE(updated_at, now());

UPDATE public.user_sessions
SET
  estado = CASE
    WHEN revoked_at IS NOT NULL THEN 'REVOCADA'::citext
    WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'EXPIRADA'::citext
    ELSE app.normalize_security_auth_rate_limit_estado_278('user_sessions', estado::text, true)
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.trusted_ips
SET
  active = COALESCE(
    active,
    lower(app.normalize_security_auth_rate_limit_estado_278('trusted_ips', estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      active,
      lower(app.normalize_security_auth_rate_limit_estado_278('trusted_ips', estado::text, true)::text) = 'activo'
    )
      THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_blocks
SET
  estado = CASE
    WHEN released_at IS NULL AND (expires_at IS NULL OR expires_at > now()) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_configs
SET
  enabled = COALESCE(
    enabled,
    lower(app.normalize_security_auth_rate_limit_estado_278('rate_limit_configs', estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      enabled,
      lower(app.normalize_security_auth_rate_limit_estado_278('rate_limit_configs', estado::text, true)::text) = 'activo'
    )
      THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_anomalies
SET
  estado = CASE
    WHEN reviewed_at IS NOT NULL THEN 'REVISADA'::citext
    ELSE app.normalize_security_auth_rate_limit_estado_278('rate_limit_anomalies', estado::text, true)
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.rate_limit_baselines
SET
  estado = app.normalize_security_auth_rate_limit_estado_278('rate_limit_baselines', estado::text, true),
  updated_at = COALESCE(updated_at, now());

UPDATE public.request_logs
SET
  estado = app.normalize_security_auth_rate_limit_estado_278('request_logs', estado::text, true),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Reaplicar triggers de normalizacion.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_normalize_auth_login_attempts_row ON public.auth_login_attempts;
CREATE TRIGGER trg_normalize_auth_login_attempts_row
BEFORE INSERT OR UPDATE OF user_email, ip_address, user_agent, success, failed_reason, estado
ON public.auth_login_attempts
FOR EACH ROW
EXECUTE FUNCTION app.normalize_auth_login_attempts_row();

DROP TRIGGER IF EXISTS trg_normalize_user_sessions_row ON public.user_sessions;
CREATE TRIGGER trg_normalize_user_sessions_row
BEFORE INSERT OR UPDATE OF tenant_id, usuario_sistema_id, session_token, expires_at, last_activity, revoked_at, estado
ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION app.normalize_user_sessions_row();

DROP TRIGGER IF EXISTS trg_normalize_trusted_ips_row ON public.trusted_ips;
CREATE TRIGGER trg_normalize_trusted_ips_row
BEFORE INSERT OR UPDATE ON public.trusted_ips
FOR EACH ROW
EXECUTE FUNCTION app.normalize_trusted_ips_row();

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_blocks_row ON public.rate_limit_blocks;
CREATE TRIGGER trg_normalize_rate_limit_blocks_row
BEFORE INSERT OR UPDATE ON public.rate_limit_blocks
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_blocks_row();

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_configs_row ON public.rate_limit_configs;
CREATE TRIGGER trg_normalize_rate_limit_configs_row
BEFORE INSERT OR UPDATE ON public.rate_limit_configs
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_configs_row();

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_anomalies_row ON public.rate_limit_anomalies;
CREATE TRIGGER trg_normalize_rate_limit_anomalies_row
BEFORE INSERT OR UPDATE ON public.rate_limit_anomalies
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_anomalies_row();

DROP TRIGGER IF EXISTS trg_normalize_rate_limit_baselines_row_278 ON public.rate_limit_baselines;
CREATE TRIGGER trg_normalize_rate_limit_baselines_row_278
BEFORE INSERT OR UPDATE ON public.rate_limit_baselines
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rate_limit_baselines_row_278();

DROP TRIGGER IF EXISTS trg_normalize_request_logs_row_278 ON public.request_logs;
CREATE TRIGGER trg_normalize_request_logs_row_278
BEFORE INSERT OR UPDATE ON public.request_logs
FOR EACH ROW
EXECUTE FUNCTION app.normalize_request_logs_row_278();

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_tenant_estado_ci_runtime_278
ON public.auth_login_attempts (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_estado_ci_runtime_278
ON public.user_sessions (tenant_id, estado, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_trusted_ips_scope_estado_ci_runtime_278
ON public.trusted_ips (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  estado,
  active,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_tenant_estado_ci_runtime_278
ON public.rate_limit_blocks (tenant_id, estado, expires_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_tenant_estado_ci_runtime_278
ON public.rate_limit_configs (tenant_id, estado, enabled, endpoint_pattern);

CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_tenant_estado_ci_runtime_278
ON public.rate_limit_anomalies (tenant_id, estado, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_tenant_estado_ci_runtime_278
ON public.rate_limit_baselines (tenant_id, estado, endpoint, last_calculated DESC);

CREATE INDEX IF NOT EXISTS idx_request_logs_tenant_estado_ci_runtime_278
ON public.request_logs (tenant_id, estado, endpoint, created_at DESC);

COMMIT;
