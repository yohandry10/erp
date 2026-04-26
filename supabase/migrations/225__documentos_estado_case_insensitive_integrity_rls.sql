-- ============================================================================
-- 225__documentos_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en documentos.
-- Tablas foco: public.documentos, public.documento_archivos.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS ck_documentos_estado_valid;
ALTER TABLE public.documentos
  ADD CONSTRAINT ck_documentos_estado_valid
  CHECK (lower(estado::text) IN ('borrador', 'emitido', 'enviado_sunat', 'observado', 'rechazado', 'anulado')) NOT VALID;

ALTER TABLE public.documento_archivos DROP CONSTRAINT IF EXISTS ck_documento_archivos_estado_valid;
ALTER TABLE public.documento_archivos
  ADD CONSTRAINT ck_documento_archivos_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'archivado', 'eliminado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual en estados.
-- ----------------------------------------------------------------------------
ALTER TABLE public.documentos
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.documento_archivos
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.documentos VALIDATE CONSTRAINT ck_documentos_estado_valid;
ALTER TABLE public.documento_archivos VALIDATE CONSTRAINT ck_documento_archivos_estado_valid;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito en vertical documentos.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'documentos');
SELECT app.apply_tenant_policy('public', 'documento_detalles');
SELECT app.apply_tenant_policy('public', 'documento_auditoria');
SELECT app.apply_tenant_policy('public', 'documento_archivos');

COMMIT;
