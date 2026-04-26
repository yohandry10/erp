-- ============================================================================
-- 218__cpe_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados de CPE.
-- Tabla foco: public.cpe.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Cierre defensivo de columnas esperadas en runtime.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cpe
  ADD COLUMN IF NOT EXISTS sunat_status text,
  ADD COLUMN IF NOT EXISTS estado_sunat text;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cpe_estado_218(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));

  IF v_estado IN ('ACTIVO', 'DRAFT', 'PENDIENTE', 'PENDING') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('READY', 'LISTO', 'GENERADO') THEN v_estado := 'FIRMADO'; END IF;
  IF v_estado IN ('SENT', 'SENDING') THEN v_estado := 'ENVIADO'; END IF;
  IF v_estado IN ('ACCEPTED', 'ACEPTADA') THEN v_estado := 'ACEPTADO'; END IF;
  IF v_estado IN ('REJECTED', 'RECHAZADA') THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;
  IF v_estado IN ('CANCELLED', 'ANULADA') THEN v_estado := 'ANULADO'; END IF;

  IF v_estado NOT IN ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR') THEN
    v_estado := 'BORRADOR';
  END IF;

  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_cpe_sunat_status_218(p_status text, p_estado text DEFAULT NULL)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
  v_estado text;
BEGIN
  v_estado := app.normalize_cpe_estado_218(COALESCE(p_estado, 'BORRADOR'))::text;
  v_status := upper(COALESCE(NULLIF(btrim(COALESCE(p_status, '')), ''), ''));

  IF v_status = '' THEN
    v_status := CASE
      WHEN v_estado = 'BORRADOR' THEN 'NOT_SENT'
      WHEN v_estado = 'FIRMADO' THEN 'READY'
      WHEN v_estado = 'ENVIADO' THEN 'SENDING'
      WHEN v_estado = 'ACEPTADO' THEN 'ACCEPTED'
      WHEN v_estado = 'RECHAZADO' THEN 'REJECTED'
      WHEN v_estado = 'ERROR' THEN 'ERROR'
      ELSE 'NOT_SENT'
    END;
  END IF;

  IF v_status IN ('BORRADOR', 'PENDIENTE', 'PENDING', 'NOT_SENT') THEN v_status := 'NOT_SENT'; END IF;
  IF v_status IN ('FIRMADO', 'LISTO', 'READY') THEN v_status := 'READY'; END IF;
  IF v_status IN ('ENVIADO', 'SENT', 'SENDING') THEN v_status := 'SENDING'; END IF;
  IF v_status IN ('ACEPTADO', 'ACCEPTED') THEN v_status := 'ACCEPTED'; END IF;
  IF v_status IN ('RECHAZADO', 'REJECTED') THEN v_status := 'REJECTED'; END IF;
  IF v_status IN ('FAILED', 'ERROR') THEN v_status := 'ERROR'; END IF;

  IF v_status NOT IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR') THEN
    v_status := 'NOT_SENT';
  END IF;

  RETURN v_status::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.map_cpe_estado_sunat_218(p_sunat_status text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  v_status := app.normalize_cpe_sunat_status_218(p_sunat_status, NULL)::text;

  RETURN (
    CASE
      WHEN v_status = 'NOT_SENT' THEN 'PENDIENTE'
      WHEN v_status = 'READY' THEN 'PENDIENTE'
      WHEN v_status = 'SENDING' THEN 'ENVIADO'
      WHEN v_status = 'ACCEPTED' THEN 'ACEPTADO'
      WHEN v_status = 'REJECTED' THEN 'RECHAZADO'
      ELSE 'ERROR'
    END
  )::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cpe
  ALTER COLUMN estado TYPE citext
  USING app.normalize_cpe_estado_218(estado::text),
  ALTER COLUMN sunat_status TYPE citext
  USING app.normalize_cpe_sunat_status_218(sunat_status::text, estado::text),
  ALTER COLUMN estado_sunat TYPE citext
  USING COALESCE(
    NULLIF(upper(btrim(COALESCE(estado_sunat::text, ''))), ''),
    app.map_cpe_estado_sunat_218(sunat_status::text)::text
  );

-- ----------------------------------------------------------------------------
-- Trigger de normalizacion en fila.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cpe_row_218()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_cpe_estado_218(NEW.estado::text);
  NEW.sunat_status := app.normalize_cpe_sunat_status_218(NEW.sunat_status::text, NEW.estado::text);
  NEW.estado_sunat := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.estado_sunat::text, ''))), ''),
    app.map_cpe_estado_sunat_218(NEW.sunat_status::text)::text
  )::citext;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cpe_row_218 ON public.cpe;
CREATE TRIGGER trg_normalize_cpe_row_218
BEFORE INSERT OR UPDATE ON public.cpe
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cpe_row_218();

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cpe c
SET
  estado = app.normalize_cpe_estado_218(c.estado::text),
  sunat_status = app.normalize_cpe_sunat_status_218(c.sunat_status::text, c.estado::text),
  estado_sunat = COALESCE(
    NULLIF(upper(btrim(COALESCE(c.estado_sunat::text, ''))), ''),
    app.map_cpe_estado_sunat_218(c.sunat_status::text)::text
  )::citext,
  updated_at = now()
WHERE c.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cpe_tenant_estado_ci_runtime_218
ON public.cpe (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpe_tenant_sunat_status_ci_runtime_218
ON public.cpe (tenant_id, sunat_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpe_retry_rechazado_runtime_218
ON public.cpe (tenant_id, updated_at DESC)
WHERE lower(estado::text) = 'rechazado';

COMMIT;
