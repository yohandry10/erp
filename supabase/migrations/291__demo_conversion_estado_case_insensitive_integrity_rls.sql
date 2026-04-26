-- ============================================================================
-- 291__demo_conversion_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en
-- conversion demo.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo previo a constraints.
-- ----------------------------------------------------------------------------
UPDATE public.demo_conversiones_pendientes
SET
  estado = app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at),
  completed_at = CASE
    WHEN lower(app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at)::text) = 'completada'
    THEN COALESCE(completed_at, now())
    ELSE completed_at
  END,
  failed_at = CASE
    WHEN lower(app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at)::text)
      IN ('fallida', 'cancelada', 'expirada')
    THEN COALESCE(failed_at, now())
    ELSE failed_at
  END,
  failure_reason = CASE
    WHEN lower(app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at)::text) = 'pendiente'
         AND (stripe_session_id IS NULL OR btrim(stripe_session_id) = '')
    THEN COALESCE(NULLIF(btrim(COALESCE(failure_reason, '')), ''), 'PENDING_WITHOUT_SESSION')
    ELSE NULLIF(btrim(COALESCE(failure_reason, '')), '')
  END,
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Dedupe de sesiones Stripe pendientes (idempotencia webhook).
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY upper(stripe_session_id)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.demo_conversiones_pendientes
  WHERE stripe_session_id IS NOT NULL
    AND btrim(stripe_session_id) <> ''
    AND lower(estado::text) = 'pendiente'
)
UPDATE public.demo_conversiones_pendientes d
SET
  estado = 'CANCELADA'::citext,
  failed_at = COALESCE(d.failed_at, now()),
  failure_reason = COALESCE(d.failure_reason, 'DUPLICATE_PENDING_SESSION'),
  updated_at = now(),
  metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object('dedupe_migration', '291__demo_conversion_estado_case_insensitive_integrity_rls')
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Dedupe de pendientes por tenant.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.demo_conversiones_pendientes
  WHERE lower(estado::text) = 'pendiente'
)
UPDATE public.demo_conversiones_pendientes d
SET
  estado = 'CANCELADA'::citext,
  failed_at = COALESCE(d.failed_at, now()),
  failure_reason = COALESCE(d.failure_reason, 'SUPERSEDED_BY_NEWER_PENDING'),
  updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints case-insensitive de dominio/consistencia.
-- ----------------------------------------------------------------------------
ALTER TABLE public.demo_conversiones_pendientes DROP CONSTRAINT IF EXISTS ck_demo_conv_estado_valid;
ALTER TABLE public.demo_conversiones_pendientes
  ADD CONSTRAINT ck_demo_conv_estado_valid
  CHECK (lower(estado::text) IN ('pendiente', 'completada', 'fallida', 'cancelada', 'expirada')) NOT VALID;

ALTER TABLE public.demo_conversiones_pendientes DROP CONSTRAINT IF EXISTS ck_demo_conv_completed_requires_timestamp;
ALTER TABLE public.demo_conversiones_pendientes
  ADD CONSTRAINT ck_demo_conv_completed_requires_timestamp
  CHECK (lower(estado::text) <> 'completada' OR completed_at IS NOT NULL) NOT VALID;

ALTER TABLE public.demo_conversiones_pendientes DROP CONSTRAINT IF EXISTS ck_demo_conv_pending_requires_session;
ALTER TABLE public.demo_conversiones_pendientes
  ADD CONSTRAINT ck_demo_conv_pending_requires_session
  CHECK (lower(estado::text) <> 'pendiente' OR stripe_session_id IS NOT NULL) NOT VALID;

ALTER TABLE public.demo_conversiones_pendientes DROP CONSTRAINT IF EXISTS ck_demo_conv_failed_states_require_failed_at_291;
ALTER TABLE public.demo_conversiones_pendientes
  ADD CONSTRAINT ck_demo_conv_failed_states_require_failed_at_291
  CHECK (
    lower(estado::text) NOT IN ('fallida', 'cancelada', 'expirada')
    OR failed_at IS NOT NULL
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL de estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.demo_conversiones_pendientes ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.demo_conversiones_pendientes VALIDATE CONSTRAINT ck_demo_conv_estado_valid;
ALTER TABLE public.demo_conversiones_pendientes VALIDATE CONSTRAINT ck_demo_conv_completed_requires_timestamp;
ALTER TABLE public.demo_conversiones_pendientes VALIDATE CONSTRAINT ck_demo_conv_pending_requires_session;
ALTER TABLE public.demo_conversiones_pendientes VALIDATE CONSTRAINT ck_demo_conv_failed_states_require_failed_at_291;

-- ----------------------------------------------------------------------------
-- Reforzar índices únicos con predicados case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_demo_conv_stripe_session;
CREATE UNIQUE INDEX IF NOT EXISTS ux_demo_conv_stripe_session
ON public.demo_conversiones_pendientes (upper(stripe_session_id))
WHERE stripe_session_id IS NOT NULL
  AND btrim(stripe_session_id) <> '';

DROP INDEX IF EXISTS public.ux_demo_conv_tenant_pending;
CREATE UNIQUE INDEX IF NOT EXISTS ux_demo_conv_tenant_pending
ON public.demo_conversiones_pendientes (tenant_id)
WHERE lower(estado::text) = 'pendiente';

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de RLS (tabla sensible por password_hash).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.demo_conversiones_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.demo_conversiones_pendientes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.demo_conversiones_pendientes;
DROP POLICY IF EXISTS demo_conversiones_superadmin_only ON public.demo_conversiones_pendientes;
CREATE POLICY demo_conversiones_superadmin_only
ON public.demo_conversiones_pendientes
USING (app.is_superadmin())
WITH CHECK (app.is_superadmin());

COMMIT;
