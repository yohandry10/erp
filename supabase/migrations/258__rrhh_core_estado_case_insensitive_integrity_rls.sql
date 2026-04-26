-- ============================================================================
-- 258__rrhh_core_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en RRHH core.
-- Tablas foco:
--   public.departamentos
--   public.contratos
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.departamentos
SET estado = app.normalize_departamentos_estado_257(estado::text)
WHERE id IS NOT NULL;

UPDATE public.contratos
SET estado = app.normalize_contratos_estado_257(estado::text)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.departamentos DROP CONSTRAINT IF EXISTS ck_departamentos_estado_runtime;
ALTER TABLE public.departamentos
  ADD CONSTRAINT ck_departamentos_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_estado_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_estado_runtime
  CHECK (lower(estado::text) IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual en estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.departamentos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.contratos ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Unicidades activas con predicados CI.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_departamentos_tenant_nombre_activo;
CREATE UNIQUE INDEX ux_departamentos_tenant_nombre_activo
ON public.departamentos (tenant_id, upper(btrim(nombre)))
WHERE tenant_id IS NOT NULL
  AND nombre IS NOT NULL
  AND btrim(nombre) <> ''
  AND lower(estado::text) = 'activo';

DROP INDEX IF EXISTS public.ux_contratos_tenant_empleado_fecha_tipo_activo;
CREATE UNIQUE INDEX ux_contratos_tenant_empleado_fecha_tipo_activo
ON public.contratos (tenant_id, id_empleado, fecha_inicio, tipo_contrato)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha_inicio IS NOT NULL
  AND tipo_contrato IS NOT NULL
  AND lower(estado::text) IN ('vigente', 'renovado', 'en_periodo_prueba', 'vencido');

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.departamentos VALIDATE CONSTRAINT ck_departamentos_estado_runtime;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'departamentos');
SELECT app.apply_tenant_policy('public', 'empleados');
SELECT app.apply_tenant_policy('public', 'contratos');

COMMIT;
