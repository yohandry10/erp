-- ============================================================================
-- 201__rrhh_planillas_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS del contrato de estados de planillas.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill de consistencia (estado/estado_pago y tenant en detalle_planillas).
-- ----------------------------------------------------------------------------
UPDATE public.planillas p
SET
  estado_pago = app.normalize_planilla_estado_pago(
    COALESCE(
      NULLIF(btrim(COALESCE(p.estado_pago::text, '')), ''),
      CASE
        WHEN lower(COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), '')) IN ('pagada', 'pagado', 'cerrada', 'cerrado', 'finalizada', 'finalizado', 'completada', 'completado')
          THEN 'pagado'
        WHEN lower(COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), '')) IN ('anulada', 'anulado', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'inactiva', 'inactivo', 'baja')
          THEN 'anulado'
        WHEN COALESCE(p.total_pagado, 0) >= COALESCE(p.total_neto, 0)
             AND COALESCE(p.total_neto, 0) > 0 THEN 'pagado'
        WHEN COALESCE(p.total_pagado, 0) > 0 THEN 'parcial'
        ELSE 'pendiente'
      END
    )
  )::citext,
  estado = app.normalize_planilla_estado(
    COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), 'borrador'),
    app.normalize_planilla_estado_pago(
      COALESCE(
        NULLIF(btrim(COALESCE(p.estado_pago::text, '')), ''),
        CASE
          WHEN lower(COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), '')) IN ('pagada', 'pagado', 'cerrada', 'cerrado', 'finalizada', 'finalizado', 'completada', 'completado')
            THEN 'pagado'
          WHEN lower(COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), '')) IN ('anulada', 'anulado', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'inactiva', 'inactivo', 'baja')
            THEN 'anulado'
          WHEN COALESCE(p.total_pagado, 0) >= COALESCE(p.total_neto, 0)
               AND COALESCE(p.total_neto, 0) > 0 THEN 'pagado'
          WHEN COALESCE(p.total_pagado, 0) > 0 THEN 'parcial'
          ELSE 'pendiente'
        END
      )
    )
  )::citext,
  updated_at = now()
WHERE p.id IS NOT NULL;

UPDATE public.detalle_planillas dp
SET
  tenant_id = COALESCE(dp.tenant_id, p.tenant_id),
  estado = app.normalize_planilla_estado_pago(dp.estado::text)::citext,
  updated_at = now()
FROM public.planillas p
WHERE dp.planilla_id = p.id
  AND (
    dp.tenant_id IS NULL
    OR dp.tenant_id IS DISTINCT FROM p.tenant_id
    OR lower(COALESCE(dp.estado::text, '')) NOT IN ('pendiente', 'parcial', 'pagado', 'anulado')
  );

UPDATE public.detalle_planillas dp
SET
  tenant_id = COALESCE(dp.tenant_id, e.tenant_id),
  estado = app.normalize_planilla_estado_pago(dp.estado::text)::citext,
  updated_at = now()
FROM public.empleados e
WHERE dp.planilla_id IS NULL
  AND dp.empleado_id = e.id
  AND (
    dp.tenant_id IS NULL
    OR dp.tenant_id IS DISTINCT FROM e.tenant_id
    OR lower(COALESCE(dp.estado::text, '')) NOT IN ('pendiente', 'parcial', 'pagado', 'anulado')
  );

UPDATE public.detalle_planillas dp
SET
  estado = app.normalize_planilla_estado_pago(dp.estado::text)::citext,
  updated_at = now()
WHERE lower(COALESCE(dp.estado::text, '')) NOT IN ('pendiente', 'parcial', 'pagado', 'anulado');

CREATE OR REPLACE FUNCTION app.enforce_tenant_detalle_planillas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_tenant_planilla uuid;
  v_tenant_empleado uuid;
BEGIN
  IF NEW.planilla_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_planilla
    FROM public.planillas p
    WHERE p.id = NEW.planilla_id;
  END IF;

  IF NEW.empleado_id IS NOT NULL THEN
    SELECT e.tenant_id INTO v_tenant_empleado
    FROM public.empleados e
    WHERE e.id = NEW.empleado_id;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_planilla, v_tenant_empleado);
  NEW.estado := app.normalize_planilla_estado_pago(NEW.estado::text)::citext;

  IF v_tenant_planilla IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_planilla THEN
    RAISE EXCEPTION 'tenant_id no coincide con planilla en detalle_planillas (% != %)', NEW.tenant_id, v_tenant_planilla;
  END IF;

  IF v_tenant_empleado IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_empleado THEN
    RAISE EXCEPTION 'tenant_id no coincide con empleado en detalle_planillas (% != %)', NEW.tenant_id, v_tenant_empleado;
  END IF;

  IF v_tenant_planilla IS NOT NULL
     AND v_tenant_empleado IS NOT NULL
     AND v_tenant_planilla IS DISTINCT FROM v_tenant_empleado THEN
    RAISE EXCEPTION 'planilla y empleado pertenecen a tenants distintos en detalle_planillas';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_detalle_planillas ON public.detalle_planillas;
CREATE TRIGGER trg_enforce_tenant_detalle_planillas
BEFORE INSERT OR UPDATE OF tenant_id, planilla_id, empleado_id, estado
ON public.detalle_planillas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_detalle_planillas();

-- ----------------------------------------------------------------------------
-- Constraints de dominio para contrato de estados.
-- ----------------------------------------------------------------------------
ALTER TABLE public.planillas DROP CONSTRAINT IF EXISTS ck_planillas_estado_runtime_200;
ALTER TABLE public.planillas
  ADD CONSTRAINT ck_planillas_estado_runtime_200
  CHECK (lower(estado::text) IN ('borrador', 'calculada', 'pagada', 'anulada'));

ALTER TABLE public.planillas DROP CONSTRAINT IF EXISTS ck_planillas_estado_pago_runtime_200;
ALTER TABLE public.planillas
  ADD CONSTRAINT ck_planillas_estado_pago_runtime_200
  CHECK (lower(estado_pago::text) IN ('pendiente', 'parcial', 'pagado', 'anulado'));

ALTER TABLE public.planillas DROP CONSTRAINT IF EXISTS ck_planillas_estado_pago_consistency_runtime_200;
ALTER TABLE public.planillas
  ADD CONSTRAINT ck_planillas_estado_pago_consistency_runtime_200
  CHECK (
    (
      lower(estado::text) = 'borrador'
      AND lower(estado_pago::text) = 'pendiente'
    )
    OR (
      lower(estado::text) = 'calculada'
      AND lower(estado_pago::text) IN ('pendiente', 'parcial')
    )
    OR (
      lower(estado::text) = 'pagada'
      AND lower(estado_pago::text) = 'pagado'
    )
    OR (
      lower(estado::text) = 'anulada'
      AND lower(estado_pago::text) = 'anulado'
    )
  );

ALTER TABLE public.detalle_planillas DROP CONSTRAINT IF EXISTS ck_detalle_planillas_estado_runtime_200;
ALTER TABLE public.detalle_planillas
  ADD CONSTRAINT ck_detalle_planillas_estado_runtime_200
  CHECK (lower(estado::text) IN ('pendiente', 'parcial', 'pagado', 'anulado'));

ALTER TABLE public.planillas
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN estado_pago SET NOT NULL;

ALTER TABLE public.detalle_planillas
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.planillas VALIDATE CONSTRAINT ck_planillas_estado_runtime_200;
ALTER TABLE public.planillas VALIDATE CONSTRAINT ck_planillas_estado_pago_runtime_200;
ALTER TABLE public.planillas VALIDATE CONSTRAINT ck_planillas_estado_pago_consistency_runtime_200;
ALTER TABLE public.detalle_planillas VALIDATE CONSTRAINT ck_detalle_planillas_estado_runtime_200;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito para flujo de planillas (contabilidad legacy incluido).
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'planillas');
SELECT app.apply_tenant_policy('public', 'empleado_planilla');
SELECT app.apply_tenant_policy('public', 'detalle_planillas');
SELECT app.apply_tenant_policy('public', 'pagos_empleados');
SELECT app.apply_tenant_policy('public', 'rrhh_pagos');

COMMIT;
