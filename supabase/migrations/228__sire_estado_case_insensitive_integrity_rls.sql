-- ============================================================================
-- 228__sire_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en SIRE.
-- Tablas foco: public.sire_files, public.sire_registros_detalle.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.sire_files DROP CONSTRAINT IF EXISTS ck_sire_files_estado_valid;
ALTER TABLE public.sire_files
  ADD CONSTRAINT ck_sire_files_estado_valid
  CHECK (lower(estado::text) IN ('generando', 'generado', 'enviado', 'pendiente', 'error', 'anulado')) NOT VALID;

ALTER TABLE public.sire_files DROP CONSTRAINT IF EXISTS ck_sire_files_status_valid;
ALTER TABLE public.sire_files
  ADD CONSTRAINT ck_sire_files_status_valid
  CHECK (lower(status::text) IN ('running', 'completed', 'sent', 'pending', 'error', 'cancelled')) NOT VALID;

ALTER TABLE public.sire_files DROP CONSTRAINT IF EXISTS ck_sire_files_estado_status_consistency_runtime_227;
ALTER TABLE public.sire_files
  ADD CONSTRAINT ck_sire_files_estado_status_consistency_runtime_227
  CHECK (
    (lower(estado::text) <> 'generando' OR lower(status::text) = 'running')
    AND (lower(estado::text) <> 'generado' OR lower(status::text) = 'completed')
    AND (lower(estado::text) <> 'enviado' OR lower(status::text) = 'sent')
    AND (lower(estado::text) <> 'pendiente' OR lower(status::text) = 'pending')
    AND (lower(estado::text) <> 'error' OR lower(status::text) = 'error')
    AND (lower(estado::text) <> 'anulado' OR lower(status::text) = 'cancelled')
  ) NOT VALID;

ALTER TABLE public.sire_registros_detalle DROP CONSTRAINT IF EXISTS ck_sire_registros_detalle_estado_valid;
ALTER TABLE public.sire_registros_detalle
  ADD CONSTRAINT ck_sire_registros_detalle_estado_valid
  CHECK (lower(estado::text) IN ('registrado', 'anulado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual en estados.
-- ----------------------------------------------------------------------------
ALTER TABLE public.sire_files
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.sire_registros_detalle
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.sire_files VALIDATE CONSTRAINT ck_sire_files_estado_valid;
ALTER TABLE public.sire_files VALIDATE CONSTRAINT ck_sire_files_status_valid;
ALTER TABLE public.sire_files VALIDATE CONSTRAINT ck_sire_files_estado_status_consistency_runtime_227;
ALTER TABLE public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_estado_valid;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'sire_files');
SELECT app.apply_tenant_policy('public', 'sire_registros_detalle');

COMMIT;
