-- ============================================================================
-- 290__demo_conversion_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en conversion demo.
-- Tabla foco:
--   public.demo_conversiones_pendientes
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion de estado para conversion demo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_demo_conversion_estado_290(
  p_estado text,
  p_stripe_session_id text DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL,
  p_failed_at timestamptz DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
  v_has_session boolean;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));
  v_has_session := NULLIF(btrim(COALESCE(p_stripe_session_id, '')), '') IS NOT NULL;

  IF v IN ('ACTIVO', 'ABIERTA', 'ABIERTO', 'PENDING', 'PENDIENTE_PAGO') THEN
    v := 'PENDIENTE';
  END IF;
  IF v IN ('INACTIVO', 'ANULADA', 'ANULADO', 'CANCELLED') THEN
    v := 'CANCELADA';
  END IF;
  IF v IN ('SUCCESS', 'SUCCEEDED', 'PAID', 'PAGADA', 'COMPLETED') THEN
    v := 'COMPLETADA';
  END IF;
  IF v IN ('FAILED', 'FAILURE', 'ERROR') THEN
    v := 'FALLIDA';
  END IF;
  IF v IN ('EXPIRED', 'EXPIRADO') THEN
    v := 'EXPIRADA';
  END IF;

  IF v = '' THEN
    IF p_completed_at IS NOT NULL THEN
      v := 'COMPLETADA';
    ELSIF p_failed_at IS NOT NULL THEN
      v := 'FALLIDA';
    ELSIF v_has_session THEN
      v := 'PENDIENTE';
    ELSE
      v := 'CANCELADA';
    END IF;
  END IF;

  IF v NOT IN ('PENDIENTE', 'COMPLETADA', 'FALLIDA', 'CANCELADA', 'EXPIRADA') THEN
    IF p_completed_at IS NOT NULL THEN
      v := 'COMPLETADA';
    ELSIF p_failed_at IS NOT NULL THEN
      v := 'FALLIDA';
    ELSIF v_has_session THEN
      v := 'PENDIENTE';
    ELSE
      v := 'CANCELADA';
    END IF;
  END IF;

  IF v = 'PENDIENTE' AND NOT v_has_session THEN
    v := 'CANCELADA';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas minimas de contrato.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.demo_conversiones_pendientes
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalizador runtime (reemplazo compatible de función existente).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_demo_conversiones_pendientes_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_fallback_id text;
BEGIN
  v_fallback_id := upper(substr(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 1, 8));

  NEW.email := lower(NULLIF(btrim(COALESCE(NEW.email, '')), ''));
  NEW.ruc := NULLIF(regexp_replace(COALESCE(NEW.ruc, ''), '[^0-9]', '', 'g'), '');
  NEW.razon_social := NULLIF(btrim(COALESCE(NEW.razon_social, '')), '');
  NEW.telefono := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');

  NEW.plan_id := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.plan_id, '')), ''), 'basico'));
  NEW.periodo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.periodo, '')), ''), 'mensual'));
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.checkout_provider := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.checkout_provider, '')), ''), 'STRIPE'));
  NEW.stripe_session_id := NULLIF(btrim(COALESCE(NEW.stripe_session_id, '')), '');

  NEW.monto := round(GREATEST(COALESCE(NEW.monto, 0), 0)::numeric, 2);
  NEW.processing_attempts := GREATEST(COALESCE(NEW.processing_attempts, 0), 0);

  NEW.estado := app.normalize_demo_conversion_estado_290(
    NEW.estado::text,
    NEW.stripe_session_id,
    NEW.completed_at,
    NEW.failed_at
  );

  IF lower(NEW.estado::text) = 'pendiente' AND NEW.stripe_session_id IS NULL THEN
    NEW.estado := 'CANCELADA'::citext;
    NEW.failed_at := COALESCE(NEW.failed_at, now());
    NEW.failure_reason := COALESCE(NULLIF(btrim(COALESCE(NEW.failure_reason, '')), ''), 'PENDING_WITHOUT_SESSION');
  END IF;

  IF lower(NEW.estado::text) = 'completada' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF lower(NEW.estado::text) IN ('fallida', 'cancelada', 'expirada') AND NEW.failed_at IS NULL THEN
    NEW.failed_at := now();
  END IF;

  NEW.failure_reason := NULLIF(btrim(COALESCE(NEW.failure_reason, '')), '');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), NEW.razon_social, 'CONVERSION DEMO');
  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.stripe_session_id,
    format('DEMO-CONV-%s', v_fallback_id)
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_demo_conversiones_pendientes_row ON public.demo_conversiones_pendientes;
CREATE TRIGGER trg_normalize_demo_conversiones_pendientes_row
BEFORE INSERT OR UPDATE ON public.demo_conversiones_pendientes
FOR EACH ROW
EXECUTE FUNCTION app.normalize_demo_conversiones_pendientes_row();

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext + default canonico.
-- ----------------------------------------------------------------------------
ALTER TABLE public.demo_conversiones_pendientes
  ALTER COLUMN estado TYPE citext
  USING app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.demo_conversiones_pendientes
SET
  estado = app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at),
  failed_at = CASE
    WHEN lower(app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at)::text)
      IN ('fallida', 'cancelada', 'expirada')
    THEN COALESCE(failed_at, now())
    ELSE failed_at
  END,
  completed_at = CASE
    WHEN lower(app.normalize_demo_conversion_estado_290(estado::text, stripe_session_id, completed_at, failed_at)::text)
      = 'completada'
    THEN COALESCE(completed_at, now())
    ELSE completed_at
  END,
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_demo_conv_tenant_estado_ci_runtime_290
ON public.demo_conversiones_pendientes (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_conv_session_estado_ci_runtime_290
ON public.demo_conversiones_pendientes (stripe_session_id, estado)
WHERE stripe_session_id IS NOT NULL;

COMMIT;
