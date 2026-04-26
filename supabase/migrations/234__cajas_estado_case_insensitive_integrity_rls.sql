-- ============================================================================
-- 234__cajas_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en Cajas.
-- Tablas foco:
--   public.cajas
--   public.sesiones_caja
--   public.retiros_caja (estado_conciliacion)
--   public.cambios_turno
--   public.autorizaciones_caja
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cajas c
SET estado = app.normalize_cajas_estado_233(c.estado::text)
WHERE c.id IS NOT NULL;

UPDATE public.sesiones_caja s
SET estado = app.normalize_sesiones_caja_estado_233(s.estado::text)
WHERE s.id IS NOT NULL;

UPDATE public.retiros_caja r
SET estado_conciliacion = app.normalize_retiros_caja_estado_conciliacion_233(r.estado_conciliacion::text)
WHERE r.id IS NOT NULL;

UPDATE public.cambios_turno ct
SET estado = app.normalize_cambios_turno_estado_233(ct.estado::text)
WHERE ct.id IS NOT NULL;

UPDATE public.autorizaciones_caja a
SET estado = app.normalize_autorizaciones_caja_estado_233(a.estado::text)
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cajas DROP CONSTRAINT IF EXISTS ck_cajas_estado_valid;
ALTER TABLE public.cajas
  ADD CONSTRAINT ck_cajas_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'mantenimiento', 'bloqueada')) NOT VALID;

ALTER TABLE public.sesiones_caja DROP CONSTRAINT IF EXISTS ck_sesiones_caja_estado_valid;
ALTER TABLE public.sesiones_caja
  ADD CONSTRAINT ck_sesiones_caja_estado_valid
  CHECK (lower(estado::text) IN ('abierta', 'cerrada', 'pausada', 'anulada')) NOT VALID;

ALTER TABLE public.retiros_caja DROP CONSTRAINT IF EXISTS ck_retiros_caja_estado_valid;
ALTER TABLE public.retiros_caja
  ADD CONSTRAINT ck_retiros_caja_estado_valid
  CHECK (lower(estado_conciliacion::text) IN ('pendiente', 'conciliado', 'rechazado')) NOT VALID;

ALTER TABLE public.cambios_turno DROP CONSTRAINT IF EXISTS ck_cambios_turno_estado_valid;
ALTER TABLE public.cambios_turno
  ADD CONSTRAINT ck_cambios_turno_estado_valid
  CHECK (lower(estado::text) IN ('en_proceso', 'completado', 'cancelado')) NOT VALID;

ALTER TABLE public.cambios_turno DROP CONSTRAINT IF EXISTS ck_cambios_turno_estado_fin_consistency;
ALTER TABLE public.cambios_turno
  ADD CONSTRAINT ck_cambios_turno_estado_fin_consistency
  CHECK (
    (lower(estado::text) = 'en_proceso' AND timestamp_fin IS NULL)
    OR (lower(estado::text) IN ('completado', 'cancelado') AND timestamp_fin IS NOT NULL)
  ) NOT VALID;

ALTER TABLE public.autorizaciones_caja DROP CONSTRAINT IF EXISTS ck_autorizaciones_caja_estado_valid;
ALTER TABLE public.autorizaciones_caja
  ADD CONSTRAINT ck_autorizaciones_caja_estado_valid
  CHECK (lower(estado::text) IN ('aprobado', 'rechazado', 'pendiente')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual para estados.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cajas
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.sesiones_caja
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.retiros_caja
  ALTER COLUMN estado_conciliacion SET NOT NULL;

ALTER TABLE public.cambios_turno
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.autorizaciones_caja
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cajas VALIDATE CONSTRAINT ck_cajas_estado_valid;
ALTER TABLE public.sesiones_caja VALIDATE CONSTRAINT ck_sesiones_caja_estado_valid;
ALTER TABLE public.retiros_caja VALIDATE CONSTRAINT ck_retiros_caja_estado_valid;
ALTER TABLE public.cambios_turno VALIDATE CONSTRAINT ck_cambios_turno_estado_valid;
ALTER TABLE public.cambios_turno VALIDATE CONSTRAINT ck_cambios_turno_estado_fin_consistency;
ALTER TABLE public.autorizaciones_caja VALIDATE CONSTRAINT ck_autorizaciones_caja_estado_valid;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cajas');
SELECT app.apply_tenant_policy('public', 'sesiones_caja');
SELECT app.apply_tenant_policy('public', 'retiros_caja');
SELECT app.apply_tenant_policy('public', 'cambios_turno');
SELECT app.apply_tenant_policy('public', 'autorizaciones_caja');

COMMIT;
