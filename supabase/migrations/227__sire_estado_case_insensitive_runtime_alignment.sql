-- ============================================================================
-- 227__sire_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en SIRE.
-- Tablas foco: public.sire_files, public.sire_registros_detalle.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_sire_files_estado_227(
  p_estado text,
  p_status text DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_raw text;
  v_estado text;
BEGIN
  v_raw := upper(COALESCE(
    NULLIF(btrim(COALESCE(p_estado, '')), ''),
    NULLIF(btrim(COALESCE(p_status, '')), ''),
    'GENERANDO'
  ));

  IF v_raw IN ('RUNNING', 'GENERATING', 'GENERANDO') THEN v_estado := 'GENERANDO'; END IF;
  IF v_raw IN ('COMPLETED', 'GENERADO') THEN v_estado := 'GENERADO'; END IF;
  IF v_raw IN ('SENT', 'ENVIADO') THEN v_estado := 'ENVIADO'; END IF;
  IF v_raw IN ('PENDING', 'PENDIENTE') THEN v_estado := 'PENDIENTE'; END IF;
  IF v_raw IN ('FAILED', 'ERROR') THEN v_estado := 'ERROR'; END IF;
  IF v_raw IN ('CANCELLED', 'CANCELED', 'ANULADO') THEN v_estado := 'ANULADO'; END IF;

  v_estado := COALESCE(v_estado, 'GENERANDO');
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.map_sire_files_status_227(
  p_estado text,
  p_status text DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
  v_status text;
BEGIN
  v_estado := app.normalize_sire_files_estado_227(p_estado, p_status)::text;

  v_status := CASE v_estado
    WHEN 'GENERANDO' THEN 'RUNNING'
    WHEN 'GENERADO' THEN 'COMPLETED'
    WHEN 'ENVIADO' THEN 'SENT'
    WHEN 'PENDIENTE' THEN 'PENDING'
    WHEN 'ANULADO' THEN 'CANCELLED'
    WHEN 'ERROR' THEN 'ERROR'
    ELSE 'RUNNING'
  END;

  RETURN v_status::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_sire_registros_detalle_estado_227(
  p_estado text
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'REGISTRADO'));

  IF v_estado IN ('ACTIVO', 'COMPLETADO') THEN
    v_estado := 'REGISTRADO';
  END IF;
  IF v_estado IN ('CANCELADO', 'ANULADA') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('REGISTRADO', 'ANULADO') THEN
    v_estado := 'REGISTRADO';
  END IF;

  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion a citext para filtros case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.sire_files
  ALTER COLUMN estado TYPE citext
  USING app.normalize_sire_files_estado_227(estado::text, status::text);

ALTER TABLE public.sire_files
  ALTER COLUMN status TYPE citext
  USING app.map_sire_files_status_227(estado::text, status::text);

ALTER TABLE public.sire_registros_detalle
  ALTER COLUMN estado TYPE citext
  USING app.normalize_sire_registros_detalle_estado_227(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.sire_files sf
SET
  estado = app.normalize_sire_files_estado_227(sf.estado::text, sf.status::text),
  status = app.map_sire_files_status_227(sf.estado::text, sf.status::text),
  updated_at = now()
WHERE sf.id IS NOT NULL;

UPDATE public.sire_registros_detalle srd
SET
  estado = app.normalize_sire_registros_detalle_estado_227(srd.estado::text),
  updated_at = now()
WHERE srd.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado/status.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_estado_ci_runtime_227
ON public.sire_files (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_status_ci_runtime_227
ON public.sire_files (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_registros_detalle_tenant_estado_ci_runtime_227
ON public.sire_registros_detalle (tenant_id, estado, fecha_registro DESC);

COMMIT;
