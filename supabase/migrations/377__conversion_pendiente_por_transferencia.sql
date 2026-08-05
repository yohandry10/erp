-- ============================================================================
-- 377__conversion_pendiente_por_transferencia.sql
-- Una solicitud de activación pagada por transferencia no tiene sesión de
-- Stripe, y el normalizador de la 290 cancelaba en el acto toda fila PENDIENTE
-- sin sesión. Resultado: el cliente pedía su cuenta, la fila nacía CANCELADA y
-- el superadmin no veía nada que aprobar.
--
-- A partir de aquí lo que decide si hace falta una sesión es el medio de pago:
-- si es STRIPE, sí; si es transferencia, no.
-- Tabla foco:
--   public.demo_conversiones_pendientes
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Helper canónico: ahora recibe el medio de pago.
-- Se elimina la versión de 4 argumentos para que no queden dos sobrecargas
-- ambiguas resolviendo la misma llamada.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.normalize_demo_conversion_estado_290(text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION app.normalize_demo_conversion_estado_290(
  p_estado text,
  p_stripe_session_id text DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL,
  p_failed_at timestamptz DEFAULT NULL,
  p_checkout_provider text DEFAULT 'STRIPE'
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
  v_has_session boolean;
  v_necesita_sesion boolean;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));
  v_has_session := NULLIF(btrim(COALESCE(p_stripe_session_id, '')), '') IS NOT NULL;

  -- Solo el checkout de Stripe se apoya en una sesión; el pago por
  -- transferencia queda pendiente hasta que alguien confirma el abono.
  v_necesita_sesion :=
    upper(COALESCE(NULLIF(btrim(COALESCE(p_checkout_provider, '')), ''), 'STRIPE')) = 'STRIPE';

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

  IF v = '' OR v NOT IN ('PENDIENTE', 'COMPLETADA', 'FALLIDA', 'CANCELADA', 'EXPIRADA') THEN
    IF p_completed_at IS NOT NULL THEN
      v := 'COMPLETADA';
    ELSIF p_failed_at IS NOT NULL THEN
      v := 'FALLIDA';
    ELSIF v_has_session OR NOT v_necesita_sesion THEN
      v := 'PENDIENTE';
    ELSE
      v := 'CANCELADA';
    END IF;
  END IF;

  IF v = 'PENDIENTE' AND v_necesita_sesion AND NOT v_has_session THEN
    v := 'CANCELADA';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Normalizador de fila: pasa el medio de pago y deja de cancelar transferencias.
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
    NEW.failed_at,
    NEW.checkout_provider
  );

  IF lower(NEW.estado::text) = 'completada' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF lower(NEW.estado::text) IN ('fallida', 'cancelada', 'expirada') AND NEW.failed_at IS NULL THEN
    NEW.failed_at := now();
  END IF;

  -- Una solicitud que vuelve a PENDIENTE (el cliente corrige y reenvía) no
  -- puede arrastrar la marca de fallo de la vez anterior.
  IF lower(NEW.estado::text) = 'pendiente' THEN
    NEW.failed_at := NULL;
    NEW.failure_reason := NULL;
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
-- La misma regla, a nivel de constraint: la 291 exigía sesión de Stripe a toda
-- fila pendiente. Se mantiene la exigencia para Stripe —una fila pendiente sin
-- sesión sí es un checkout roto— y se libera para el resto de medios de pago.
-- ----------------------------------------------------------------------------
ALTER TABLE public.demo_conversiones_pendientes DROP CONSTRAINT IF EXISTS ck_demo_conv_pending_requires_session;
ALTER TABLE public.demo_conversiones_pendientes
  ADD CONSTRAINT ck_demo_conv_pending_requires_session
  CHECK (
    lower(estado::text) <> 'pendiente'
    OR stripe_session_id IS NOT NULL
    OR upper(COALESCE(checkout_provider, 'STRIPE')) <> 'STRIPE'
  ) NOT VALID;

ALTER TABLE public.demo_conversiones_pendientes VALIDATE CONSTRAINT ck_demo_conv_pending_requires_session;

COMMIT;
