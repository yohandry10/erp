-- ============================================================================
-- 264__empresa_config_wizard_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en
-- empresa_config/wizard.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.empresa_config
SET estado = app.normalize_empresa_config_estado_263(estado::text)
WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraint de dominio en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.empresa_config DROP CONSTRAINT IF EXISTS ck_empresa_config_estado_runtime;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'suspendido', 'prueba')) NOT VALID;

ALTER TABLE public.empresa_config
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.empresa_config
  VALIDATE CONSTRAINT ck_empresa_config_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'empresa_config');
SELECT app.apply_tenant_policy('public', 'wizard_progress');

COMMIT;
