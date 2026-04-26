-- ============================================================================
-- 245__cajas_auditoria_supervisor_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en:
--   public.caja_audit_log
--   public.supervisor_pins
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion (wrapper CI sobre normalizadores runtime existentes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_caja_audit_estado_245(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN app.normalize_caja_audit_estado(p_input, p_default)::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_supervisor_pin_estado_245(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN app.normalize_supervisor_pin_estado(p_input, p_default)::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipo a citext para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.caja_audit_log
  ALTER COLUMN estado TYPE citext
  USING app.normalize_caja_audit_estado_245(estado::text, 'ACTIVO');

ALTER TABLE public.supervisor_pins
  ALTER COLUMN estado TYPE citext
  USING app.normalize_supervisor_pin_estado_245(estado::text, 'ACTIVO');

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.caja_audit_log c
SET estado = app.normalize_caja_audit_estado_245(c.estado::text, 'ACTIVO')
WHERE c.id IS NOT NULL;

UPDATE public.supervisor_pins sp
SET estado = app.normalize_supervisor_pin_estado_245(sp.estado::text, 'ACTIVO')
WHERE sp.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_estado_ci_runtime_245
ON public.caja_audit_log (tenant_id, estado, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_supervisor_pins_tenant_estado_ci_runtime_245
ON public.supervisor_pins (tenant_id, estado, activo, usuario_id);

COMMIT;
