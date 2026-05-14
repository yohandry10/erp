-- ============================================================================
-- 263__empresa_config_wizard_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estado en empresa_config/wizard.
-- Tablas foco:
--   public.empresa_config
--   public.wizard_progress
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

DROP TRIGGER IF EXISTS trg_sync_tenants_from_empresa_config ON public.empresa_config;

-- ----------------------------------------------------------------------------
-- Helper de normalizacion de estado para empresa_config.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_empresa_config_estado_263(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ACTIVA', 'VIGENTE') THEN v := 'ACTIVO'; END IF;
  IF v IN ('INACTIVA', 'BAJA', 'CESADO', 'CESADA') THEN v := 'INACTIVO'; END IF;
  IF v IN ('SUSPENDIDA') THEN v := 'SUSPENDIDO'; END IF;
  IF v IN ('DEMO', 'TRIAL') THEN v := 'PRUEBA'; END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.empresa_config
  ALTER COLUMN estado TYPE citext
  USING app.normalize_empresa_config_estado_263(estado::text);

ALTER TABLE public.empresa_config
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.empresa_config
SET estado = app.normalize_empresa_config_estado_263(estado::text)
WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indice runtime CI para filtros por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_empresa_config_tenant_estado_ci_runtime_263
ON public.empresa_config (tenant_id, estado, updated_at DESC);

CREATE TRIGGER trg_sync_tenants_from_empresa_config
AFTER INSERT OR UPDATE OF tenant_id, razon_social, nombre_comercial, ruc, pais, plan, estado
ON public.empresa_config
FOR EACH ROW
EXECUTE FUNCTION app.sync_tenants_from_empresa_config();

COMMIT;
