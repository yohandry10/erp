-- ============================================================================
-- 243__contabilidad_plantillas_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en plantillas
-- contables.
-- Tablas foco:
--   public.plantillas_asientos
--   public.plantillas_asientos_detalle
--   public.plantillas_asientos_historial
--   public.plantillas_asientos_ventas
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.plantillas_asientos p
SET estado = app.normalize_plantilla_estado_242(p.estado::text, 'ACTIVO')
WHERE p.id IS NOT NULL;

UPDATE public.plantillas_asientos_detalle d
SET estado = app.normalize_plantilla_estado_242(d.estado::text, 'ACTIVO')
WHERE d.id IS NOT NULL;

UPDATE public.plantillas_asientos_historial h
SET estado = app.normalize_plantillas_asientos_historial_estado_242(h.estado::text)
WHERE h.id IS NOT NULL;

UPDATE public.plantillas_asientos_ventas pv
SET estado = app.normalize_plantilla_estado_242(pv.estado::text, 'ACTIVO')
WHERE pv.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de calidad/integridad (case-insensitive).
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas_asientos
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_runtime;
ALTER TABLE public.plantillas_asientos
ADD CONSTRAINT ck_plantillas_asientos_runtime CHECK (
  nombre IS NOT NULL
  AND btrim(nombre) <> ''
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivada')
  AND (
    (lower(estado::text) = 'activo' AND COALESCE(activo, true) = true)
    OR (lower(estado::text) <> 'activo' AND COALESCE(activo, false) = false)
  )
) NOT VALID;

ALTER TABLE public.plantillas_asientos_detalle
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_detalle_runtime;
ALTER TABLE public.plantillas_asientos_detalle
ADD CONSTRAINT ck_plantillas_asientos_detalle_runtime CHECK (
  nombre IS NOT NULL
  AND btrim(nombre) <> ''
  AND orden >= 1
  AND lado IN ('DEBE', 'HABER')
  AND tipo_valor IN ('FIJO', 'PORCENTAJE', 'FORMULA')
  AND valor_base >= 0
  AND porcentaje >= 0
  AND porcentaje <= 1
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivada')
  AND (
    lower(estado::text) <> 'activo'
    OR (
      plantilla_id IS NOT NULL
      AND cuenta_codigo IS NOT NULL
      AND btrim(cuenta_codigo) <> ''
    )
  )
) NOT VALID;

ALTER TABLE public.plantillas_asientos_historial
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_historial_runtime;
ALTER TABLE public.plantillas_asientos_historial
ADD CONSTRAINT ck_plantillas_asientos_historial_runtime CHECK (
  lower(estado::text) IN ('generado', 'error', 'pendiente', 'anulado')
  AND fecha_generacion IS NOT NULL
  AND periodo IS NOT NULL
  AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
) NOT VALID;

ALTER TABLE public.plantillas_asientos_ventas
DROP CONSTRAINT IF EXISTS ck_plantillas_asientos_ventas_runtime;
ALTER TABLE public.plantillas_asientos_ventas
ADD CONSTRAINT ck_plantillas_asientos_ventas_runtime CHECK (
  pais_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND btrim(tipo_documento) <> ''
  AND prioridad >= 1
  AND moneda ~ '^[A-Z]{3}$'
  AND lower(estado::text) IN ('activo', 'inactivo', 'archivada')
  AND (
    lower(estado::text) <> 'activo'
    OR (
      COALESCE(activo, true) = true
      AND tenant_id IS NULL
      AND cuenta_debe_codigo IS NOT NULL
      AND btrim(cuenta_debe_codigo) <> ''
      AND cuenta_haber_ventas_codigo IS NOT NULL
      AND btrim(cuenta_haber_ventas_codigo) <> ''
      AND cuenta_haber_impuesto_codigo IS NOT NULL
      AND btrim(cuenta_haber_impuesto_codigo) <> ''
    )
  )
) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas_asientos
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.plantillas_asientos_detalle
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.plantillas_asientos_historial
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.plantillas_asientos_ventas
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas_asientos
  VALIDATE CONSTRAINT ck_plantillas_asientos_runtime;

ALTER TABLE public.plantillas_asientos_detalle
  VALIDATE CONSTRAINT ck_plantillas_asientos_detalle_runtime;

ALTER TABLE public.plantillas_asientos_historial
  VALIDATE CONSTRAINT ck_plantillas_asientos_historial_runtime;

ALTER TABLE public.plantillas_asientos_ventas
  VALIDATE CONSTRAINT ck_plantillas_asientos_ventas_runtime;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'plantillas_asientos');
SELECT app.apply_tenant_policy('public', 'plantillas_asientos_detalle');
SELECT app.apply_tenant_policy('public', 'plantillas_asientos_historial');
SELECT app.apply_global_or_tenant_policy('public', 'plantillas_asientos_ventas');

COMMIT;
