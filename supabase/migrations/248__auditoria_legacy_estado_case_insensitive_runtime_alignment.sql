-- ============================================================================
-- 248__auditoria_legacy_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en auditoria legacy.
-- Tablas foco:
--   public.audit_log_archive
--   public.auditoria
--   public.auditoria_cotizaciones
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_auditoria_legacy_estado_248(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), upper(COALESCE(NULLIF(btrim(COALESCE(p_default, '')), ''), 'ACTIVO'))));
  IF v IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN
    RETURN v::citext;
  END IF;
  IF v IN ('ANULADO', 'ANULADA', 'DISABLED') THEN
    RETURN 'INACTIVO'::citext;
  END IF;
  IF v IN ('ARCHIVE', 'ARCHIVED', 'CERRADO', 'CERRADA') THEN
    RETURN 'ARCHIVADO'::citext;
  END IF;
  RETURN 'ACTIVO'::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipo a citext para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_log_archive
  ALTER COLUMN estado TYPE citext
  USING app.normalize_auditoria_legacy_estado_248(estado::text, 'ARCHIVADO');

ALTER TABLE public.auditoria
  ALTER COLUMN estado TYPE citext
  USING app.normalize_auditoria_legacy_estado_248(estado::text, 'ACTIVO');

ALTER TABLE public.auditoria_cotizaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_auditoria_legacy_estado_248(estado::text, 'ACTIVO');

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.audit_log_archive a
SET estado = app.normalize_auditoria_legacy_estado_248(a.estado::text, 'ARCHIVADO')
WHERE a.id IS NOT NULL;

UPDATE public.auditoria a
SET estado = app.normalize_auditoria_legacy_estado_248(a.estado::text, 'ACTIVO')
WHERE a.id IS NOT NULL;

UPDATE public.auditoria_cotizaciones ac
SET estado = app.normalize_auditoria_legacy_estado_248(ac.estado::text, 'ACTIVO')
WHERE ac.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_estado_ci_runtime_248
ON public.audit_log_archive (tenant_id, estado, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant_estado_ci_runtime_248
ON public.auditoria (tenant_id, estado, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_cotizaciones_tenant_estado_ci_runtime_248
ON public.auditoria_cotizaciones (tenant_id, estado, "timestamp" DESC);

COMMIT;
