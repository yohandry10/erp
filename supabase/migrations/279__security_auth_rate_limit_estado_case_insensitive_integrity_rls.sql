-- ============================================================================
-- 279__security_auth_rate_limit_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en
-- seguridad/auth/rate-limit.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de estado/flags antes de constraints.
-- ----------------------------------------------------------------------------
UPDATE public.auth_login_attempts
SET
  success = COALESCE(success, false),
  estado = app.normalize_security_auth_rate_limit_estado_278(
    'auth_login_attempts',
    estado::text,
    COALESCE(success, false)
  ),
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
  endpoint_pattern = upper(COALESCE(NULLIF(btrim(COALESCE(endpoint_pattern, '')), ''), 'DEFAULT')),
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
-- Dedupe para unicidades activas reforzadas por estado.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), ip_address
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.trusted_ips
  WHERE ip_address IS NOT NULL
    AND lower(estado::text) = 'activo'
)
UPDATE public.trusted_ips t
SET
  active = false,
  estado = 'INACTIVO'::citext,
  updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(endpoint_pattern)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.rate_limit_configs
  WHERE endpoint_pattern IS NOT NULL
    AND btrim(endpoint_pattern) <> ''
    AND lower(estado::text) = 'activo'
)
UPDATE public.rate_limit_configs c
SET
  enabled = false,
  estado = 'INACTIVO'::citext,
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de dominio/consistencia case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.auth_login_attempts DROP CONSTRAINT IF EXISTS ck_auth_login_attempts_estado_runtime_278;
ALTER TABLE public.auth_login_attempts
  ADD CONSTRAINT ck_auth_login_attempts_estado_runtime_278
  CHECK (lower(estado::text) IN ('exitoso', 'fallido', 'bloqueada')) NOT VALID;

ALTER TABLE public.auth_login_attempts DROP CONSTRAINT IF EXISTS ck_auth_login_attempts_estado_success_consistency_278;
ALTER TABLE public.auth_login_attempts
  ADD CONSTRAINT ck_auth_login_attempts_estado_success_consistency_278
  CHECK (
    (COALESCE(success, false) = true AND lower(estado::text) = 'exitoso')
    OR (COALESCE(success, false) = false AND lower(estado::text) IN ('fallido', 'bloqueada'))
  ) NOT VALID;

ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS ck_user_sessions_estado_runtime_278;
ALTER TABLE public.user_sessions
  ADD CONSTRAINT ck_user_sessions_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'revocada', 'expirada')) NOT VALID;

ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS ck_user_sessions_revocation_estado_consistency;
ALTER TABLE public.user_sessions
  ADD CONSTRAINT ck_user_sessions_revocation_estado_consistency
  CHECK (
    revoked_at IS NULL
    OR lower(estado::text) IN ('revocada', 'inactivo', 'expirada')
  ) NOT VALID;

ALTER TABLE public.trusted_ips DROP CONSTRAINT IF EXISTS ck_trusted_ips_estado_runtime_278;
ALTER TABLE public.trusted_ips
  ADD CONSTRAINT ck_trusted_ips_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.trusted_ips DROP CONSTRAINT IF EXISTS ck_trusted_ips_estado_active_consistency_278;
ALTER TABLE public.trusted_ips
  ADD CONSTRAINT ck_trusted_ips_estado_active_consistency_278
  CHECK (
    (active = true AND lower(estado::text) = 'activo')
    OR (active = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.rate_limit_blocks DROP CONSTRAINT IF EXISTS ck_rate_limit_blocks_estado_runtime_278;
ALTER TABLE public.rate_limit_blocks
  ADD CONSTRAINT ck_rate_limit_blocks_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.rate_limit_blocks DROP CONSTRAINT IF EXISTS ck_rate_limit_blocks_estado_release_consistency_278;
ALTER TABLE public.rate_limit_blocks
  ADD CONSTRAINT ck_rate_limit_blocks_estado_release_consistency_278
  CHECK (
    (lower(estado::text) = 'activo' AND released_at IS NULL)
    OR (lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.rate_limit_configs DROP CONSTRAINT IF EXISTS ck_rate_limit_configs_estado_runtime_278;
ALTER TABLE public.rate_limit_configs
  ADD CONSTRAINT ck_rate_limit_configs_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.rate_limit_configs DROP CONSTRAINT IF EXISTS ck_rate_limit_configs_estado_enabled_consistency_278;
ALTER TABLE public.rate_limit_configs
  ADD CONSTRAINT ck_rate_limit_configs_estado_enabled_consistency_278
  CHECK (
    (enabled = true AND lower(estado::text) = 'activo')
    OR (enabled = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.rate_limit_anomalies DROP CONSTRAINT IF EXISTS ck_rate_limit_anomalies_estado_runtime_278;
ALTER TABLE public.rate_limit_anomalies
  ADD CONSTRAINT ck_rate_limit_anomalies_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'revisada')) NOT VALID;

ALTER TABLE public.rate_limit_anomalies DROP CONSTRAINT IF EXISTS ck_rate_limit_anomalies_estado_review_consistency_278;
ALTER TABLE public.rate_limit_anomalies
  ADD CONSTRAINT ck_rate_limit_anomalies_estado_review_consistency_278
  CHECK (
    reviewed_at IS NULL
    OR lower(estado::text) IN ('revisada', 'inactivo')
  ) NOT VALID;

ALTER TABLE public.rate_limit_baselines DROP CONSTRAINT IF EXISTS ck_rate_limit_baselines_estado_runtime_278;
ALTER TABLE public.rate_limit_baselines
  ADD CONSTRAINT ck_rate_limit_baselines_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.request_logs DROP CONSTRAINT IF EXISTS ck_request_logs_estado_runtime_278;
ALTER TABLE public.request_logs
  ADD CONSTRAINT ck_request_logs_estado_runtime_278
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL de estado/flags.
-- ----------------------------------------------------------------------------
ALTER TABLE public.auth_login_attempts ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.user_sessions ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.trusted_ips ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.trusted_ips ALTER COLUMN active SET NOT NULL;

ALTER TABLE public.rate_limit_blocks ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.rate_limit_configs ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.rate_limit_configs ALTER COLUMN enabled SET NOT NULL;

ALTER TABLE public.rate_limit_anomalies ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.rate_limit_baselines ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.request_logs ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.auth_login_attempts VALIDATE CONSTRAINT ck_auth_login_attempts_estado_runtime_278;
ALTER TABLE public.auth_login_attempts VALIDATE CONSTRAINT ck_auth_login_attempts_estado_success_consistency_278;

ALTER TABLE public.user_sessions VALIDATE CONSTRAINT ck_user_sessions_estado_runtime_278;
ALTER TABLE public.user_sessions VALIDATE CONSTRAINT ck_user_sessions_revocation_estado_consistency;

ALTER TABLE public.trusted_ips VALIDATE CONSTRAINT ck_trusted_ips_estado_runtime_278;
ALTER TABLE public.trusted_ips VALIDATE CONSTRAINT ck_trusted_ips_estado_active_consistency_278;

ALTER TABLE public.rate_limit_blocks VALIDATE CONSTRAINT ck_rate_limit_blocks_estado_runtime_278;
ALTER TABLE public.rate_limit_blocks VALIDATE CONSTRAINT ck_rate_limit_blocks_estado_release_consistency_278;

ALTER TABLE public.rate_limit_configs VALIDATE CONSTRAINT ck_rate_limit_configs_estado_runtime_278;
ALTER TABLE public.rate_limit_configs VALIDATE CONSTRAINT ck_rate_limit_configs_estado_enabled_consistency_278;

ALTER TABLE public.rate_limit_anomalies VALIDATE CONSTRAINT ck_rate_limit_anomalies_estado_runtime_278;
ALTER TABLE public.rate_limit_anomalies VALIDATE CONSTRAINT ck_rate_limit_anomalies_estado_review_consistency_278;

ALTER TABLE public.rate_limit_baselines VALIDATE CONSTRAINT ck_rate_limit_baselines_estado_runtime_278;
ALTER TABLE public.request_logs VALIDATE CONSTRAINT ck_request_logs_estado_runtime_278;

-- ----------------------------------------------------------------------------
-- Reforzar unicidades activas con predicados case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_trusted_ips_scope_active;
CREATE UNIQUE INDEX IF NOT EXISTS ux_trusted_ips_scope_active
ON public.trusted_ips (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), ip_address)
WHERE ip_address IS NOT NULL
  AND lower(estado::text) = 'activo';

DROP INDEX IF EXISTS public.ux_rate_limit_configs_scope_endpoint_enabled;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_limit_configs_scope_endpoint_enabled
ON public.rate_limit_configs (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(endpoint_pattern))
WHERE endpoint_pattern IS NOT NULL
  AND btrim(endpoint_pattern) <> ''
  AND lower(estado::text) = 'activo';

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'auth_login_attempts');
SELECT app.apply_tenant_policy('public', 'user_sessions');
SELECT app.apply_tenant_policy('public', 'rate_limit_baselines');
SELECT app.apply_tenant_policy('public', 'rate_limit_blocks');
SELECT app.apply_tenant_policy('public', 'rate_limit_anomalies');
SELECT app.apply_tenant_policy('public', 'request_logs');

SELECT app.apply_global_or_tenant_policy('public', 'trusted_ips');
SELECT app.apply_global_or_tenant_policy('public', 'rate_limit_configs');

COMMIT;
