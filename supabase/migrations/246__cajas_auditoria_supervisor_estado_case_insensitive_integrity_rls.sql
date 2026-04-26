-- ============================================================================
-- 246__cajas_auditoria_supervisor_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en:
--   public.caja_audit_log
--   public.supervisor_pins
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

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
-- Constraints runtime en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.caja_audit_log
DROP CONSTRAINT IF EXISTS ck_caja_audit_log_runtime;
ALTER TABLE public.caja_audit_log
ADD CONSTRAINT ck_caja_audit_log_runtime CHECK (
  tenant_id IS NOT NULL
  AND evento IS NOT NULL
  AND btrim(evento) <> ''
  AND "timestamp" IS NOT NULL
  AND riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivado')
) NOT VALID;

ALTER TABLE public.supervisor_pins
DROP CONSTRAINT IF EXISTS ck_supervisor_pins_runtime;
ALTER TABLE public.supervisor_pins
ADD CONSTRAINT ck_supervisor_pins_runtime CHECK (
  tenant_id IS NOT NULL
  AND usuario_id IS NOT NULL
  AND lower(estado::text) IN ('activo', 'inactivo', 'bloqueado', 'revocado')
  AND intentos_fallidos >= 0
  AND intentos_fallidos <= 100
  AND pin_version >= 1
  AND (
    COALESCE(activo, false) = false
    OR (hash_pin IS NOT NULL AND btrim(hash_pin) <> '')
  )
) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual de estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.caja_audit_log
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.supervisor_pins
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.caja_audit_log
  VALIDATE CONSTRAINT ck_caja_audit_log_runtime;

ALTER TABLE public.supervisor_pins
  VALIDATE CONSTRAINT ck_supervisor_pins_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'caja_audit_log');
SELECT app.apply_tenant_policy('public', 'supervisor_pins');

COMMIT;
