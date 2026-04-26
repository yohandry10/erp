-- ============================================================================
-- 104__demo_conversion_runtime_alignment.sql
-- Alineación runtime del flujo de conversión demo -> cuenta real.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime usadas por DemoService.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.demo_conversiones_pendientes
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS checkout_provider text DEFAULT 'STRIPE',
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS processing_attempts integer DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Normalización de demo_conversiones_pendientes.
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

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado = 'ACTIVO' THEN
    NEW.estado := 'PENDIENTE';
  ELSIF NEW.estado = 'INACTIVO' THEN
    NEW.estado := 'CANCELADA';
  END IF;

  IF NEW.estado = 'COMPLETADA' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF NEW.estado IN ('FALLIDA', 'CANCELADA', 'EXPIRADA') AND NEW.failed_at IS NULL THEN
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
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
UPDATE public.demo_conversiones_pendientes
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime para lookup por webhook y seguimiento de conversión.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_demo_conv_tenant_estado_created_runtime
ON public.demo_conversiones_pendientes (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_conv_session_estado_runtime
ON public.demo_conversiones_pendientes (stripe_session_id, estado)
WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_conv_tenant_plan_periodo_runtime
ON public.demo_conversiones_pendientes (tenant_id, plan_id, periodo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_conv_tenant_ruc_runtime
ON public.demo_conversiones_pendientes (tenant_id, ruc)
WHERE ruc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_conv_tenant_email_runtime
ON public.demo_conversiones_pendientes (tenant_id, email)
WHERE email IS NOT NULL;

COMMIT;
