-- ============================================================================
-- 288__security_secrets_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en
-- secretos/alertas/PII.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo antes de constraints.
-- ----------------------------------------------------------------------------
UPDATE public.secret_rotation_state
SET
  estado = app.normalize_security_secrets_estado_287('secret_rotation_state', estado::text, true, NULL),
  updated_at = COALESCE(updated_at, now());

UPDATE public.system_alerts
SET
  acknowledged = COALESCE(acknowledged, false) OR (resolved_at IS NOT NULL),
  acknowledged_at = CASE
    WHEN (COALESCE(acknowledged, false) OR resolved_at IS NOT NULL) AND acknowledged_at IS NULL
      THEN COALESCE(resolved_at, created_at, now())
    ELSE acknowledged_at
  END,
  estado = app.normalize_security_secrets_estado_287('system_alerts', estado::text, NULL, resolved_at),
  updated_at = COALESCE(updated_at, now());

UPDATE public.pii_encryption_log
SET
  success = COALESCE(success, true),
  estado = app.normalize_security_secrets_estado_287('pii_encryption_log', estado::text, COALESCE(success, true), NULL),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Dedupe de alertas activas por scope+alert_key (predicado CI).
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(alert_key)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.system_alerts
  WHERE alert_key IS NOT NULL
    AND btrim(alert_key) <> ''
    AND resolved_at IS NULL
    AND lower(
      app.normalize_security_secrets_estado_287('system_alerts', estado::text, NULL, resolved_at)::text
    ) = 'activo'
)
UPDATE public.system_alerts a
SET
  resolved_at = now(),
  estado = 'INACTIVO'::citext,
  acknowledged = true,
  acknowledged_at = COALESCE(a.acknowledged_at, now()),
  updated_at = now(),
  metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object('dedupe_migration', '288__security_secrets_estado_case_insensitive_integrity_rls')
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de dominio/consistencia case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.secret_rotation_state DROP CONSTRAINT IF EXISTS ck_secret_rotation_state_estado_valid_287;
ALTER TABLE public.secret_rotation_state
  ADD CONSTRAINT ck_secret_rotation_state_estado_valid_287
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS ck_system_alerts_estado_valid_287;
ALTER TABLE public.system_alerts
  ADD CONSTRAINT ck_system_alerts_estado_valid_287
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS ck_system_alerts_estado_resolved_sync_287;
ALTER TABLE public.system_alerts
  ADD CONSTRAINT ck_system_alerts_estado_resolved_sync_287
  CHECK (
    (resolved_at IS NULL AND lower(estado::text) = 'activo')
    OR (resolved_at IS NOT NULL AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.pii_encryption_log DROP CONSTRAINT IF EXISTS ck_pii_encryption_log_estado_valid_287;
ALTER TABLE public.pii_encryption_log
  ADD CONSTRAINT ck_pii_encryption_log_estado_valid_287
  CHECK (lower(estado::text) IN ('activo', 'error')) NOT VALID;

ALTER TABLE public.pii_encryption_log DROP CONSTRAINT IF EXISTS ck_pii_encryption_log_estado_success_sync_287;
ALTER TABLE public.pii_encryption_log
  ADD CONSTRAINT ck_pii_encryption_log_estado_success_sync_287
  CHECK (
    (COALESCE(success, true) = true AND lower(estado::text) = 'activo')
    OR (COALESCE(success, true) = false AND lower(estado::text) = 'error')
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL.
-- ----------------------------------------------------------------------------
ALTER TABLE public.secret_rotation_state ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.system_alerts ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.pii_encryption_log ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.pii_encryption_log ALTER COLUMN success SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.secret_rotation_state VALIDATE CONSTRAINT ck_secret_rotation_state_estado_valid_287;

ALTER TABLE public.system_alerts VALIDATE CONSTRAINT ck_system_alerts_estado_valid_287;
ALTER TABLE public.system_alerts VALIDATE CONSTRAINT ck_system_alerts_estado_resolved_sync_287;

ALTER TABLE public.pii_encryption_log VALIDATE CONSTRAINT ck_pii_encryption_log_estado_valid_287;
ALTER TABLE public.pii_encryption_log VALIDATE CONSTRAINT ck_pii_encryption_log_estado_success_sync_287;

-- ----------------------------------------------------------------------------
-- Reforzar unicidad activa de alert_key con predicado case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_system_alerts_scope_alert_key_unresolved;
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_alerts_scope_alert_key_unresolved
ON public.system_alerts (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(alert_key)
)
WHERE alert_key IS NOT NULL
  AND btrim(alert_key) <> ''
  AND resolved_at IS NULL
  AND lower(estado::text) = 'activo';

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_global_or_tenant_policy('public', 'secret_rotation_state');
SELECT app.apply_global_or_tenant_policy('public', 'system_alerts');
SELECT app.apply_tenant_policy('public', 'pii_encryption_log');

COMMIT;
