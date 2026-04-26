-- ============================================================================
-- 224__documentos_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en documentos.
-- Tablas foco: public.documentos, public.documento_archivos.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_documentos_estado_224(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'DRAFT', 'PENDIENTE') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('ENVIADO', 'ACEPTADO', 'ACEPTADA') THEN v_estado := 'ENVIADO_SUNAT'; END IF;
  IF v_estado NOT IN ('BORRADOR', 'EMITIDO', 'ENVIADO_SUNAT', 'OBSERVADO', 'RECHAZADO', 'ANULADO') THEN
    v_estado := 'BORRADOR';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_documento_archivos_estado_224(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));
  IF v_estado NOT IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO') THEN
    v_estado := 'ACTIVO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion a citext para filtros case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.documentos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_documentos_estado_224(estado::text);

ALTER TABLE public.documento_archivos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_documento_archivos_estado_224(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.documentos d
SET estado = app.normalize_documentos_estado_224(d.estado::text),
    updated_at = now()
WHERE d.id IS NOT NULL;

UPDATE public.documento_archivos a
SET estado = app.normalize_documento_archivos_estado_224(a.estado::text),
    updated_at = now()
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documentos_tenant_estado_ci_runtime_224
ON public.documentos (tenant_id, estado, fecha_emision DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documento_archivos_tenant_estado_ci_runtime_224
ON public.documento_archivos (tenant_id, estado, uploaded_at DESC, created_at DESC);

COMMIT;
