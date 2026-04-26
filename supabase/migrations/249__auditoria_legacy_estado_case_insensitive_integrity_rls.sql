-- ============================================================================
-- 249__auditoria_legacy_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en auditoria legacy.
-- Tablas foco:
--   public.audit_log_archive
--   public.auditoria
--   public.auditoria_cotizaciones
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints runtime en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_log_archive
DROP CONSTRAINT IF EXISTS ck_audit_log_archive_runtime;
ALTER TABLE public.audit_log_archive
ADD CONSTRAINT ck_audit_log_archive_runtime CHECK (
  tenant_id IS NOT NULL
  AND source_table IS NOT NULL
  AND btrim(source_table) <> ''
  AND operation IN ('INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'ARCHIVE', 'RESTORE', 'LOGIN', 'LOGOUT')
  AND archived_at IS NOT NULL
  AND retention_until IS NOT NULL
  AND retention_until >= archived_at
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivado')
) NOT VALID;

ALTER TABLE public.auditoria
DROP CONSTRAINT IF EXISTS ck_auditoria_runtime;
ALTER TABLE public.auditoria
ADD CONSTRAINT ck_auditoria_runtime CHECK (
  tenant_id IS NOT NULL
  AND tabla IS NOT NULL
  AND btrim(tabla) <> ''
  AND accion IS NOT NULL
  AND btrim(accion) <> ''
  AND ocurrido_en IS NOT NULL
  AND criticidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivado')
) NOT VALID;

ALTER TABLE public.auditoria_cotizaciones
DROP CONSTRAINT IF EXISTS ck_auditoria_cotizaciones_runtime;
ALTER TABLE public.auditoria_cotizaciones
ADD CONSTRAINT ck_auditoria_cotizaciones_runtime CHECK (
  tenant_id IS NOT NULL
  AND accion IS NOT NULL
  AND btrim(accion) <> ''
  AND "timestamp" IS NOT NULL
  AND criticidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivado')
) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_log_archive
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.auditoria
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.auditoria_cotizaciones
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Unicidad con predicado CI explicito.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_audit_log_archive_scope_runtime;
CREATE UNIQUE INDEX ux_audit_log_archive_scope_runtime
ON public.audit_log_archive (tenant_id, source_table, source_id, operation, archived_at)
WHERE tenant_id IS NOT NULL
  AND source_table IS NOT NULL
  AND archived_at IS NOT NULL
  AND lower(estado::text) <> 'inactivo';

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_log_archive
  VALIDATE CONSTRAINT ck_audit_log_archive_runtime;

ALTER TABLE public.auditoria
  VALIDATE CONSTRAINT ck_auditoria_runtime;

ALTER TABLE public.auditoria_cotizaciones
  VALIDATE CONSTRAINT ck_auditoria_cotizaciones_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'audit_log_archive');
SELECT app.apply_tenant_policy('public', 'auditoria');
SELECT app.apply_tenant_policy('public', 'auditoria_cotizaciones');

COMMIT;
