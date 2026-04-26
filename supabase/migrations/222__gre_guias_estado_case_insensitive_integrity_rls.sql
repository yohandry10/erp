-- ============================================================================
-- 222__gre_guias_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en GRE canónica.
-- Tabla foco: public.gre_guias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.gre_guias DROP CONSTRAINT IF EXISTS ck_gre_guias_estado_valid;
ALTER TABLE public.gre_guias
  ADD CONSTRAINT ck_gre_guias_estado_valid
  CHECK (lower(estado::text) IN ('borrador', 'firmado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error')) NOT VALID;

ALTER TABLE public.gre_guias DROP CONSTRAINT IF EXISTS ck_gre_guias_sunat_status_valid;
ALTER TABLE public.gre_guias
  ADD CONSTRAINT ck_gre_guias_sunat_status_valid
  CHECK (lower(sunat_status::text) IN ('not_sent', 'ready', 'sending', 'accepted', 'rejected', 'error')) NOT VALID;

ALTER TABLE public.gre_guias DROP CONSTRAINT IF EXISTS ck_gre_guias_estado_sunat_consistency_runtime_221;
ALTER TABLE public.gre_guias
  ADD CONSTRAINT ck_gre_guias_estado_sunat_consistency_runtime_221
  CHECK (
    (lower(estado::text) <> 'aceptado' OR lower(sunat_status::text) = 'accepted')
    AND (lower(estado::text) <> 'rechazado' OR lower(sunat_status::text) IN ('rejected', 'error'))
    AND (lower(estado::text) <> 'enviado' OR lower(sunat_status::text) = 'sending')
    AND (lower(estado::text) <> 'firmado' OR lower(sunat_status::text) IN ('ready', 'not_sent'))
    AND (lower(estado::text) <> 'borrador' OR lower(sunat_status::text) IN ('not_sent', 'ready'))
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual.
-- ----------------------------------------------------------------------------
ALTER TABLE public.gre_guias
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN sunat_status SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Reforzar índice de cola de reintentos con predicado explícitamente CI.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_gre_guias_tenant_retry_queue_runtime;
CREATE INDEX idx_gre_guias_tenant_retry_queue_runtime
ON public.gre_guias (tenant_id, estado, retry_count, next_retry_at, updated_at DESC)
WHERE tenant_id IS NOT NULL
  AND lower(estado::text) IN ('rechazado', 'error');

-- ----------------------------------------------------------------------------
-- Validación de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_estado_valid;
ALTER TABLE public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_sunat_status_valid;
ALTER TABLE public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_estado_sunat_consistency_runtime_221;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'gre_guias');
SELECT app.apply_tenant_policy('public', 'gre');

COMMIT;
