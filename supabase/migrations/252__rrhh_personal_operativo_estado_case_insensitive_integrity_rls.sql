-- ============================================================================
-- 252__rrhh_personal_operativo_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en RRHH personal
-- operativo.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.beneficios
SET estado = app.normalize_beneficios_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.capacitaciones
SET estado = app.normalize_capacitaciones_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.horarios_trabajo
SET estado = app.normalize_horarios_trabajo_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.empleado_beneficios
SET estado = app.normalize_empleado_beneficios_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.empleado_capacitaciones
SET estado = app.normalize_empleado_capacitaciones_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.empleado_horarios
SET estado = app.normalize_empleado_horarios_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.expediente_documentos
SET estado = app.normalize_expediente_documentos_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.liquidaciones
SET estado = app.normalize_liquidaciones_estado_251(estado::text)
WHERE id IS NOT NULL;

UPDATE public.historial_pagos_planilla
SET estado = app.normalize_historial_pagos_planilla_estado_251(estado::text)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de dominio de estado en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.beneficios DROP CONSTRAINT IF EXISTS ck_beneficios_estado_runtime;
ALTER TABLE public.beneficios
  ADD CONSTRAINT ck_beneficios_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'archivado')) NOT VALID;

ALTER TABLE public.capacitaciones DROP CONSTRAINT IF EXISTS ck_capacitaciones_estado_runtime;
ALTER TABLE public.capacitaciones
  ADD CONSTRAINT ck_capacitaciones_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'completada', 'cancelada')) NOT VALID;

ALTER TABLE public.horarios_trabajo DROP CONSTRAINT IF EXISTS ck_horarios_trabajo_estado_runtime;
ALTER TABLE public.horarios_trabajo
  ADD CONSTRAINT ck_horarios_trabajo_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.empleado_beneficios DROP CONSTRAINT IF EXISTS ck_empleado_beneficios_estado_runtime;
ALTER TABLE public.empleado_beneficios
  ADD CONSTRAINT ck_empleado_beneficios_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'suspendido', 'vencido')) NOT VALID;

ALTER TABLE public.empleado_capacitaciones DROP CONSTRAINT IF EXISTS ck_empleado_capacitaciones_estado_runtime;
ALTER TABLE public.empleado_capacitaciones
  ADD CONSTRAINT ck_empleado_capacitaciones_estado_runtime
  CHECK (lower(estado::text) IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado')) NOT VALID;

ALTER TABLE public.empleado_horarios DROP CONSTRAINT IF EXISTS ck_empleado_horarios_estado_runtime;
ALTER TABLE public.empleado_horarios
  ADD CONSTRAINT ck_empleado_horarios_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'inactivo', 'suspendido')) NOT VALID;

ALTER TABLE public.expediente_documentos DROP CONSTRAINT IF EXISTS ck_expediente_documentos_estado_runtime;
ALTER TABLE public.expediente_documentos
  ADD CONSTRAINT ck_expediente_documentos_estado_runtime
  CHECK (lower(estado::text) IN ('activo', 'archivado', 'eliminado')) NOT VALID;

ALTER TABLE public.liquidaciones DROP CONSTRAINT IF EXISTS ck_liquidaciones_estado_runtime;
ALTER TABLE public.liquidaciones
  ADD CONSTRAINT ck_liquidaciones_estado_runtime
  CHECK (lower(estado::text) IN ('calculada', 'aprobada', 'pagada', 'anulada')) NOT VALID;

ALTER TABLE public.historial_pagos_planilla DROP CONSTRAINT IF EXISTS ck_historial_pagos_planilla_estado_runtime;
ALTER TABLE public.historial_pagos_planilla
  ADD CONSTRAINT ck_historial_pagos_planilla_estado_runtime
  CHECK (lower(estado::text) IN ('registrado', 'anulado', 'conciliado')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual en estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.beneficios ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.capacitaciones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.horarios_trabajo ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.empleado_beneficios ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.empleado_capacitaciones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.empleado_horarios ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.expediente_documentos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.liquidaciones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.historial_pagos_planilla ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Unicidades con predicados CI en estados.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_beneficios_tenant_codigo_activo;
CREATE UNIQUE INDEX ux_beneficios_tenant_codigo_activo
ON public.beneficios (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND lower(estado::text) IN ('activo', 'inactivo');

DROP INDEX IF EXISTS public.ux_capacitaciones_tenant_codigo_activo;
CREATE UNIQUE INDEX ux_capacitaciones_tenant_codigo_activo
ON public.capacitaciones (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND lower(estado::text) IN ('activo', 'inactivo');

DROP INDEX IF EXISTS public.ux_horarios_trabajo_tenant_codigo_activo;
CREATE UNIQUE INDEX ux_horarios_trabajo_tenant_codigo_activo
ON public.horarios_trabajo (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND lower(estado::text) IN ('activo', 'inactivo');

DROP INDEX IF EXISTS public.ux_empleado_beneficios_tenant_empleado_beneficio_fecha;
CREATE UNIQUE INDEX ux_empleado_beneficios_tenant_empleado_beneficio_fecha
ON public.empleado_beneficios (tenant_id, id_empleado, id_beneficio, fecha_inicio)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND id_beneficio IS NOT NULL
  AND fecha_inicio IS NOT NULL
  AND lower(estado::text) IN ('activo', 'inactivo', 'suspendido');

DROP INDEX IF EXISTS public.ux_liquidaciones_tenant_empleado_fecha_terminacion;
CREATE UNIQUE INDEX ux_liquidaciones_tenant_empleado_fecha_terminacion
ON public.liquidaciones (tenant_id, id_empleado, fecha_terminacion)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha_terminacion IS NOT NULL
  AND lower(estado::text) IN ('calculada', 'aprobada', 'pagada');

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.beneficios VALIDATE CONSTRAINT ck_beneficios_estado_runtime;
ALTER TABLE public.capacitaciones VALIDATE CONSTRAINT ck_capacitaciones_estado_runtime;
ALTER TABLE public.horarios_trabajo VALIDATE CONSTRAINT ck_horarios_trabajo_estado_runtime;
ALTER TABLE public.empleado_beneficios VALIDATE CONSTRAINT ck_empleado_beneficios_estado_runtime;
ALTER TABLE public.empleado_capacitaciones VALIDATE CONSTRAINT ck_empleado_capacitaciones_estado_runtime;
ALTER TABLE public.empleado_horarios VALIDATE CONSTRAINT ck_empleado_horarios_estado_runtime;
ALTER TABLE public.expediente_documentos VALIDATE CONSTRAINT ck_expediente_documentos_estado_runtime;
ALTER TABLE public.liquidaciones VALIDATE CONSTRAINT ck_liquidaciones_estado_runtime;
ALTER TABLE public.historial_pagos_planilla VALIDATE CONSTRAINT ck_historial_pagos_planilla_estado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'beneficios');
SELECT app.apply_tenant_policy('public', 'capacitaciones');
SELECT app.apply_tenant_policy('public', 'horarios_trabajo');
SELECT app.apply_tenant_policy('public', 'empleado_beneficios');
SELECT app.apply_tenant_policy('public', 'empleado_capacitaciones');
SELECT app.apply_tenant_policy('public', 'empleado_horarios');
SELECT app.apply_tenant_policy('public', 'expediente_documentos');
SELECT app.apply_tenant_policy('public', 'liquidaciones');
SELECT app.apply_tenant_policy('public', 'historial_pagos_planilla');

COMMIT;
