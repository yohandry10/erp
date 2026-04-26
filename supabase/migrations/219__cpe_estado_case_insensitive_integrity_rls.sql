-- ============================================================================
-- 219__cpe_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en CPE.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints de dominio/consistencia.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_estado_valid_runtime_218;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_estado_valid_runtime_218
  CHECK (lower(estado::text) IN ('borrador', 'firmado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error')) NOT VALID;

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_sunat_status_valid_runtime_218;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_sunat_status_valid_runtime_218
  CHECK (lower(sunat_status::text) IN ('not_sent', 'ready', 'sending', 'accepted', 'rejected', 'error')) NOT VALID;

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_estado_sunat_consistency_runtime_218;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_estado_sunat_consistency_runtime_218
  CHECK (
    (lower(estado::text) <> 'aceptado' OR lower(sunat_status::text) = 'accepted')
    AND (lower(estado::text) <> 'rechazado' OR lower(sunat_status::text) IN ('rejected', 'error'))
    AND (lower(estado::text) <> 'enviado' OR lower(sunat_status::text) IN ('sending', 'ready'))
    AND (lower(estado::text) <> 'firmado' OR lower(sunat_status::text) IN ('ready', 'not_sent'))
    AND (lower(estado::text) <> 'borrador' OR lower(sunat_status::text) IN ('not_sent', 'ready'))
  ) NOT VALID;

ALTER TABLE public.cpe DROP CONSTRAINT IF EXISTS ck_cpe_estado_sunat_alias_valid_runtime_218;
ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_estado_sunat_alias_valid_runtime_218
  CHECK (
    estado_sunat IS NULL
    OR lower(estado_sunat::text) IN ('pendiente', 'enviado', 'aceptado', 'rechazado', 'error', 'anulado')
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cpe
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN sunat_status SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cpe VALIDATE CONSTRAINT ck_cpe_estado_valid_runtime_218;
ALTER TABLE public.cpe VALIDATE CONSTRAINT ck_cpe_sunat_status_valid_runtime_218;
ALTER TABLE public.cpe VALIDATE CONSTRAINT ck_cpe_estado_sunat_consistency_runtime_218;
ALTER TABLE public.cpe VALIDATE CONSTRAINT ck_cpe_estado_sunat_alias_valid_runtime_218;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cpe');
SELECT app.apply_tenant_policy('public', 'comprobantes_electronicos');

COMMIT;
