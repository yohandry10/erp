-- ============================================================================
-- 231__fiscal_baja_resumen_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive del flujo fiscal RA/RC.
-- Tablas foco:
--   public.comunicaciones_baja
--   public.resumenes_diarios
--   public.detalle_comunicacion_baja
--   public.detalle_resumen_diario
--   public.validaciones_sunat
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.comunicaciones_baja cb
SET
  estado = app.normalize_fiscal_baja_estado_230(cb.estado::text),
  updated_at = now()
WHERE cb.id IS NOT NULL;

UPDATE public.resumenes_diarios r
SET
  estado = app.normalize_fiscal_baja_estado_230(r.estado::text),
  updated_at = now()
WHERE r.id IS NOT NULL;

UPDATE public.detalle_comunicacion_baja d
SET
  estado = app.normalize_fiscal_baja_detalle_estado_230(d.estado::text),
  updated_at = now()
WHERE d.id IS NOT NULL;

UPDATE public.detalle_resumen_diario d
SET
  estado = app.normalize_fiscal_baja_detalle_estado_230(d.estado::text),
  updated_at = now()
WHERE d.id IS NOT NULL;

UPDATE public.validaciones_sunat v
SET
  estado = app.normalize_validaciones_sunat_estado_230(v.estado::text),
  updated_at = now()
WHERE v.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de estado (case-insensitive).
-- ----------------------------------------------------------------------------
ALTER TABLE public.comunicaciones_baja DROP CONSTRAINT IF EXISTS ck_comunicaciones_baja_estado_runtime;
ALTER TABLE public.comunicaciones_baja
  ADD CONSTRAINT ck_comunicaciones_baja_estado_runtime
  CHECK (lower(estado::text) IN ('pendiente', 'generado', 'enviado', 'aceptado', 'rechazado', 'error', 'anulado')) NOT VALID;

ALTER TABLE public.resumenes_diarios DROP CONSTRAINT IF EXISTS ck_resumenes_diarios_estado_runtime;
ALTER TABLE public.resumenes_diarios
  ADD CONSTRAINT ck_resumenes_diarios_estado_runtime
  CHECK (lower(estado::text) IN ('pendiente', 'generado', 'enviado', 'aceptado', 'rechazado', 'error', 'anulado')) NOT VALID;

ALTER TABLE public.detalle_comunicacion_baja DROP CONSTRAINT IF EXISTS ck_detalle_comunicacion_baja_estado_runtime;
ALTER TABLE public.detalle_comunicacion_baja
  ADD CONSTRAINT ck_detalle_comunicacion_baja_estado_runtime
  CHECK (lower(estado::text) IN ('pendiente', 'aceptado', 'rechazado', 'anulado')) NOT VALID;

ALTER TABLE public.detalle_resumen_diario DROP CONSTRAINT IF EXISTS ck_detalle_resumen_diario_estado_runtime;
ALTER TABLE public.detalle_resumen_diario
  ADD CONSTRAINT ck_detalle_resumen_diario_estado_runtime
  CHECK (lower(estado::text) IN ('pendiente', 'aceptado', 'rechazado', 'anulado')) NOT VALID;

ALTER TABLE public.validaciones_sunat DROP CONSTRAINT IF EXISTS ck_validaciones_sunat_estado_runtime;
ALTER TABLE public.validaciones_sunat
  ADD CONSTRAINT ck_validaciones_sunat_estado_runtime
  CHECK (lower(estado::text) IN ('pendiente', 'valido', 'invalido', 'error', 'vencido')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.comunicaciones_baja
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.resumenes_diarios
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.detalle_comunicacion_baja
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.detalle_resumen_diario
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.validaciones_sunat
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.comunicaciones_baja VALIDATE CONSTRAINT ck_comunicaciones_baja_estado_runtime;
ALTER TABLE public.resumenes_diarios VALIDATE CONSTRAINT ck_resumenes_diarios_estado_runtime;
ALTER TABLE public.detalle_comunicacion_baja VALIDATE CONSTRAINT ck_detalle_comunicacion_baja_estado_runtime;
ALTER TABLE public.detalle_resumen_diario VALIDATE CONSTRAINT ck_detalle_resumen_diario_estado_runtime;
ALTER TABLE public.validaciones_sunat VALIDATE CONSTRAINT ck_validaciones_sunat_estado_runtime;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'comunicaciones_baja');
SELECT app.apply_tenant_policy('public', 'detalle_comunicacion_baja');
SELECT app.apply_tenant_policy('public', 'resumenes_diarios');
SELECT app.apply_tenant_policy('public', 'detalle_resumen_diario');
SELECT app.apply_tenant_policy('public', 'validaciones_sunat');

COMMIT;
