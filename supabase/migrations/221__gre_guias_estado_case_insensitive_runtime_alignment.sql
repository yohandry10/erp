-- ============================================================================
-- 221__gre_guias_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados de GRE canónica.
-- Tabla foco: public.gre_guias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_gre_guias_estado_221(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));

  IF v_estado IN ('ACTIVO', 'PENDIENTE', 'GENERATED', 'NOT_SENT') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('EMITIDO', 'READY', 'LISTO') THEN v_estado := 'FIRMADO'; END IF;
  IF v_estado IN ('SENT', 'SENDING') THEN v_estado := 'ENVIADO'; END IF;
  IF v_estado IN ('ACCEPTED', 'ACEPTADA') THEN v_estado := 'ACEPTADO'; END IF;
  IF v_estado IN ('REJECTED', 'RECHAZADA') THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;
  IF v_estado IN ('CANCELADO', 'ANULADA') THEN v_estado := 'ANULADO'; END IF;

  IF v_estado NOT IN ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR') THEN
    v_estado := 'BORRADOR';
  END IF;

  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_gre_guias_sunat_status_221(
  p_sunat_status text,
  p_estado text DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_sunat text;
  v_estado text;
BEGIN
  v_estado := app.normalize_gre_guias_estado_221(COALESCE(p_estado, 'BORRADOR'))::text;
  v_sunat := upper(COALESCE(NULLIF(btrim(COALESCE(p_sunat_status, '')), ''), ''));

  IF v_sunat = '' THEN
    v_sunat := CASE
      WHEN v_estado = 'BORRADOR' THEN 'NOT_SENT'
      WHEN v_estado = 'FIRMADO' THEN 'READY'
      WHEN v_estado = 'ENVIADO' THEN 'SENDING'
      WHEN v_estado = 'ACEPTADO' THEN 'ACCEPTED'
      WHEN v_estado = 'RECHAZADO' THEN 'REJECTED'
      WHEN v_estado = 'ERROR' THEN 'ERROR'
      ELSE 'NOT_SENT'
    END;
  END IF;

  IF v_sunat IN ('BORRADOR', 'PENDIENTE', 'PENDING', 'NOT_SENT') THEN v_sunat := 'NOT_SENT'; END IF;
  IF v_sunat IN ('FIRMADO', 'LISTO', 'READY') THEN v_sunat := 'READY'; END IF;
  IF v_sunat IN ('ENVIADO', 'SENT', 'SENDING') THEN v_sunat := 'SENDING'; END IF;
  IF v_sunat IN ('ACEPTADO', 'ACCEPTED') THEN v_sunat := 'ACCEPTED'; END IF;
  IF v_sunat IN ('RECHAZADO', 'REJECTED') THEN v_sunat := 'REJECTED'; END IF;
  IF v_sunat IN ('FAILED', 'ERROR') THEN v_sunat := 'ERROR'; END IF;

  IF v_sunat NOT IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR') THEN
    v_sunat := 'NOT_SENT';
  END IF;

  RETURN v_sunat::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.gre_guias
  ALTER COLUMN estado TYPE citext
  USING app.normalize_gre_guias_estado_221(estado::text),
  ALTER COLUMN sunat_status TYPE citext
  USING app.normalize_gre_guias_sunat_status_221(sunat_status::text, estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.gre_guias g
SET
  estado = app.normalize_gre_guias_estado_221(g.estado::text),
  sunat_status = app.normalize_gre_guias_sunat_status_221(g.sunat_status::text, g.estado::text),
  updated_at = now()
WHERE g.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_estado_ci_runtime_221
ON public.gre_guias (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_sunat_status_ci_runtime_221
ON public.gre_guias (tenant_id, sunat_status, retry_count, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_guias_retry_rechazado_runtime_221
ON public.gre_guias (tenant_id, updated_at DESC)
WHERE lower(estado::text) = 'rechazado';

COMMIT;
