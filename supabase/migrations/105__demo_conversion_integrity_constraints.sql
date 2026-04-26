-- ============================================================================
-- 105__demo_conversion_integrity_constraints.sql
-- Integridad, dedupe e hardening RLS para demo_conversiones_pendientes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill defensivo previo a constraints.
-- ----------------------------------------------------------------------------
UPDATE public.demo_conversiones_pendientes
SET
  email = lower(NULLIF(btrim(COALESCE(email, '')), '')),
  ruc = NULLIF(regexp_replace(COALESCE(ruc, ''), '[^0-9]', '', 'g'), ''),
  razon_social = NULLIF(btrim(COALESCE(razon_social, '')), ''),
  telefono = NULLIF(btrim(COALESCE(telefono, '')), ''),
  plan_id = lower(COALESCE(NULLIF(btrim(COALESCE(plan_id, '')), ''), 'basico')),
  periodo = lower(COALESCE(NULLIF(btrim(COALESCE(periodo, '')), ''), 'mensual')),
  moneda = upper(COALESCE(NULLIF(btrim(COALESCE(moneda, '')), ''), 'PEN')),
  checkout_provider = upper(COALESCE(NULLIF(btrim(COALESCE(checkout_provider, '')), ''), 'STRIPE')),
  stripe_session_id = NULLIF(btrim(COALESCE(stripe_session_id, '')), ''),
  monto = round(GREATEST(COALESCE(monto, 0), 0)::numeric, 2),
  processing_attempts = GREATEST(COALESCE(processing_attempts, 0), 0),
  estado = CASE upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), 'PENDIENTE'))
    WHEN 'ACTIVO' THEN 'PENDIENTE'
    WHEN 'INACTIVO' THEN 'CANCELADA'
    ELSE upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), 'PENDIENTE'))
  END,
  completed_at = CASE
    WHEN upper(COALESCE(estado, 'PENDIENTE')) = 'COMPLETADA' THEN COALESCE(completed_at, now())
    ELSE completed_at
  END,
  failed_at = CASE
    WHEN upper(COALESCE(estado, 'PENDIENTE')) IN ('FALLIDA', 'CANCELADA', 'EXPIRADA') THEN COALESCE(failed_at, now())
    ELSE failed_at
  END,
  failure_reason = NULLIF(btrim(COALESCE(failure_reason, '')), ''),
  updated_at = now()
WHERE
  plan_id IS NULL
  OR periodo IS NULL
  OR monto IS NULL
  OR monto < 0
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = ''
  OR processing_attempts IS NULL
  OR processing_attempts < 0;

-- Normalización adicional para valores fuera de catálogo.
UPDATE public.demo_conversiones_pendientes
SET
  plan_id = 'basico',
  updated_at = now()
WHERE plan_id IS NULL
  OR plan_id NOT IN ('basico', 'profesional', 'enterprise');

UPDATE public.demo_conversiones_pendientes
SET
  periodo = 'mensual',
  updated_at = now()
WHERE periodo IS NULL
  OR periodo NOT IN ('mensual', 'anual');

UPDATE public.demo_conversiones_pendientes
SET
  estado = 'CANCELADA',
  failed_at = COALESCE(failed_at, now()),
  failure_reason = COALESCE(failure_reason, 'INVALID_OR_UNKNOWN_STATE_NORMALIZED'),
  updated_at = now()
WHERE estado NOT IN ('PENDIENTE', 'COMPLETADA', 'FALLIDA', 'CANCELADA', 'EXPIRADA');

UPDATE public.demo_conversiones_pendientes
SET
  estado = 'CANCELADA',
  failed_at = COALESCE(failed_at, now()),
  failure_reason = COALESCE(failure_reason, 'PENDING_WITHOUT_SESSION'),
  updated_at = now()
WHERE estado = 'PENDIENTE'
  AND (stripe_session_id IS NULL OR btrim(stripe_session_id) = '');

-- Normalizar email/ruc inválidos para no bloquear por checks estrictos.
UPDATE public.demo_conversiones_pendientes
SET
  email = NULL,
  updated_at = now()
WHERE email IS NOT NULL
  AND NOT (
    position('@' in email) > 1
    AND position('.' in split_part(email, '@', 2)) > 1
  );

UPDATE public.demo_conversiones_pendientes
SET
  ruc = NULL,
  updated_at = now()
WHERE ruc IS NOT NULL
  AND ruc !~ '^[0-9]{11}$';

-- ----------------------------------------------------------------------------
-- Dedupe de sesiones Stripe en pendientes para asegurar idempotencia de webhook.
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
    AND estado = 'PENDIENTE'
)
UPDATE public.demo_conversiones_pendientes d
SET
  estado = 'CANCELADA',
  failed_at = COALESCE(d.failed_at, now()),
  failure_reason = COALESCE(d.failure_reason, 'DUPLICATE_PENDING_SESSION'),
  updated_at = now(),
  metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object('dedupe_migration', '105__demo_conversion_integrity_constraints')
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Dedupe de pendientes por tenant para evitar múltiples conversiones activas.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.demo_conversiones_pendientes
  WHERE estado = 'PENDIENTE'
)
UPDATE public.demo_conversiones_pendientes d
SET
  estado = 'CANCELADA',
  failed_at = COALESCE(d.failed_at, now()),
  failure_reason = COALESCE(d.failure_reason, 'SUPERSEDED_BY_NEWER_PENDING'),
  updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad y negocio.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.demo_conversiones_pendientes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_plan_valid'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_plan_valid
      CHECK (plan_id IN ('basico', 'profesional', 'enterprise'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_periodo_valid'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_periodo_valid
      CHECK (periodo IN ('mensual', 'anual'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_estado_valid'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_estado_valid
      CHECK (estado IN ('PENDIENTE', 'COMPLETADA', 'FALLIDA', 'CANCELADA', 'EXPIRADA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_monto_nonnegative'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_monto_nonnegative
      CHECK (monto >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_processing_attempts_nonnegative'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_processing_attempts_nonnegative
      CHECK (processing_attempts >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_email_shape'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_email_shape
      CHECK (
        email IS NULL
        OR (position('@' in email) > 1 AND position('.' in split_part(email, '@', 2)) > 1)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_ruc_shape'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_ruc_shape
      CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_completed_timeline'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_completed_timeline
      CHECK (completed_at IS NULL OR completed_at >= created_at);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_failed_timeline'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_failed_timeline
      CHECK (failed_at IS NULL OR failed_at >= created_at);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_completed_requires_timestamp'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_completed_requires_timestamp
      CHECK (estado <> 'COMPLETADA' OR completed_at IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_demo_conv_pending_requires_session'
        AND conrelid = 'public.demo_conversiones_pendientes'::regclass
    ) THEN
      ALTER TABLE public.demo_conversiones_pendientes
      ADD CONSTRAINT ck_demo_conv_pending_requires_session
      CHECK (estado <> 'PENDIENTE' OR stripe_session_id IS NOT NULL);
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Índices únicos operativos.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_demo_conv_stripe_session
ON public.demo_conversiones_pendientes (upper(stripe_session_id))
WHERE stripe_session_id IS NOT NULL
  AND btrim(stripe_session_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_demo_conv_tenant_pending
ON public.demo_conversiones_pendientes (tenant_id)
WHERE estado = 'PENDIENTE';

-- ----------------------------------------------------------------------------
-- Hardening RLS (tabla sensible por password_hash).
-- Solo superadmin (y service_role por bypass nativo) debe acceder.
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
