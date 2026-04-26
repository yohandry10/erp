-- ============================================================================
-- 027__rrhh_planillas_flow_alignment.sql
-- Alinea flujo de planillas (RRHH) para relaciones/FK reales e índices runtime.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper local: parseo seguro de UUID desde payload legado (texto)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.to_uuid_or_null(p_input text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN p_input::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- empleado_planilla: columnas canonicas UUID + normalización de montos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleado_planilla
  ADD COLUMN IF NOT EXISTS planilla_id uuid,
  ADD COLUMN IF NOT EXISTS empleado_id uuid;

UPDATE public.empleado_planilla
SET
  planilla_id = COALESCE(planilla_id, app.to_uuid_or_null(id_planilla)),
  empleado_id = COALESCE(empleado_id, app.to_uuid_or_null(id_empleado))
WHERE planilla_id IS NULL
   OR empleado_id IS NULL;

ALTER TABLE IF EXISTS public.empleado_planilla
  ALTER COLUMN neto_pagar TYPE numeric(14,2) USING app.to_numeric_or_zero(neto_pagar::text),
  ALTER COLUMN total_ingresos TYPE numeric(14,2) USING app.to_numeric_or_zero(total_ingresos::text),
  ALTER COLUMN total_descuentos TYPE numeric(14,2) USING app.to_numeric_or_zero(total_descuentos::text),
  ALTER COLUMN total_aportes TYPE numeric(14,2) USING app.to_numeric_or_zero(total_aportes::text);

ALTER TABLE IF EXISTS public.empleado_planilla
  ALTER COLUMN neto_pagar SET DEFAULT 0,
  ALTER COLUMN total_ingresos SET DEFAULT 0,
  ALTER COLUMN total_descuentos SET DEFAULT 0,
  ALTER COLUMN total_aportes SET DEFAULT 0;

CREATE OR REPLACE FUNCTION app.sync_empleado_planilla_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.planilla_id := COALESCE(NEW.planilla_id, app.to_uuid_or_null(NEW.id_planilla));
  NEW.empleado_id := COALESCE(NEW.empleado_id, app.to_uuid_or_null(NEW.id_empleado));

  IF NEW.id_planilla IS NULL AND NEW.planilla_id IS NOT NULL THEN
    NEW.id_planilla := NEW.planilla_id::text;
  END IF;

  IF NEW.id_empleado IS NULL AND NEW.empleado_id IS NOT NULL THEN
    NEW.id_empleado := NEW.empleado_id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_empleado_planilla_aliases ON public.empleado_planilla;
CREATE TRIGGER trg_sync_empleado_planilla_aliases
BEFORE INSERT OR UPDATE OF id_planilla, id_empleado, planilla_id, empleado_id
ON public.empleado_planilla
FOR EACH ROW
EXECUTE FUNCTION app.sync_empleado_planilla_aliases();

-- ----------------------------------------------------------------------------
-- empleado_planilla_conceptos: columnas canonicas UUID + sync aliases
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleado_planilla_conceptos
  ADD COLUMN IF NOT EXISTS empleado_planilla_id uuid,
  ADD COLUMN IF NOT EXISTS concepto_id uuid;

UPDATE public.empleado_planilla_conceptos
SET
  empleado_planilla_id = COALESCE(empleado_planilla_id, app.to_uuid_or_null(id_empleado_planilla)),
  concepto_id = COALESCE(concepto_id, app.to_uuid_or_null(id_concepto))
WHERE empleado_planilla_id IS NULL
   OR concepto_id IS NULL;

ALTER TABLE IF EXISTS public.empleado_planilla_conceptos
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN monto SET DEFAULT 0;

CREATE OR REPLACE FUNCTION app.sync_empleado_planilla_conceptos_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.empleado_planilla_id := COALESCE(NEW.empleado_planilla_id, app.to_uuid_or_null(NEW.id_empleado_planilla));
  NEW.concepto_id := COALESCE(NEW.concepto_id, app.to_uuid_or_null(NEW.id_concepto));

  IF NEW.id_empleado_planilla IS NULL AND NEW.empleado_planilla_id IS NOT NULL THEN
    NEW.id_empleado_planilla := NEW.empleado_planilla_id::text;
  END IF;

  IF NEW.id_concepto IS NULL AND NEW.concepto_id IS NOT NULL THEN
    NEW.id_concepto := NEW.concepto_id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_empleado_planilla_conceptos_aliases ON public.empleado_planilla_conceptos;
CREATE TRIGGER trg_sync_empleado_planilla_conceptos_aliases
BEFORE INSERT OR UPDATE OF id_empleado_planilla, id_concepto, empleado_planilla_id, concepto_id
ON public.empleado_planilla_conceptos
FOR EACH ROW
EXECUTE FUNCTION app.sync_empleado_planilla_conceptos_aliases();

-- ----------------------------------------------------------------------------
-- pagos_empleados / rrhh_pagos: normalización numérica usada por servicios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pagos_empleados
  ALTER COLUMN sueldo_bruto TYPE numeric(14,2) USING app.to_numeric_or_zero(sueldo_bruto::text),
  ALTER COLUMN descuentos TYPE numeric(14,2) USING app.to_numeric_or_zero(descuentos::text),
  ALTER COLUMN monto_neto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_neto::text);

ALTER TABLE IF EXISTS public.pagos_empleados
  ALTER COLUMN sueldo_bruto SET DEFAULT 0,
  ALTER COLUMN descuentos SET DEFAULT 0,
  ALTER COLUMN monto_neto SET DEFAULT 0;

ALTER TABLE IF EXISTS public.rrhh_pagos
  ALTER COLUMN monto_bruto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_bruto::text),
  ALTER COLUMN descuentos TYPE numeric(14,2) USING app.to_numeric_or_zero(descuentos::text),
  ALTER COLUMN monto_neto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_neto::text);

ALTER TABLE IF EXISTS public.rrhh_pagos
  ALTER COLUMN monto_bruto SET DEFAULT 0,
  ALTER COLUMN descuentos SET DEFAULT 0,
  ALTER COLUMN monto_neto SET DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Integridad referencial + índices de uso real RRHH
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('empleado_planilla', 'planilla_id', 'planillas', 'id', 'fk_empleado_planilla_planilla_id_v2');
SELECT app.add_fk_if_possible('empleado_planilla', 'empleado_id', 'empleados', 'id', 'fk_empleado_planilla_empleado_id_v2');
SELECT app.add_fk_if_possible('empleado_planilla_conceptos', 'empleado_planilla_id', 'empleado_planilla', 'id', 'fk_epc_empleado_planilla_id');
SELECT app.add_fk_if_possible('empleado_planilla_conceptos', 'concepto_id', 'conceptos_planilla', 'id', 'fk_epc_concepto_id');
SELECT app.add_fk_if_possible('pagos_empleados', 'planilla_id', 'planillas', 'id', 'fk_pagos_empleados_planilla_id');
SELECT app.add_fk_if_possible('pagos_empleados', 'empleado_id', 'empleados', 'id', 'fk_pagos_empleados_empleado_id');
SELECT app.add_fk_if_possible('rrhh_pagos', 'planilla_id', 'planillas', 'id', 'fk_rrhh_pagos_planilla_id');
SELECT app.add_fk_if_possible('rrhh_pagos', 'empleado_id', 'empleados', 'id', 'fk_rrhh_pagos_empleado_id');
SELECT app.add_fk_if_possible('historial_pagos_planilla', 'planilla_id', 'planillas', 'id', 'fk_historial_pagos_planilla_id');

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_planilla_planilla_empleado
ON public.empleado_planilla (planilla_id, empleado_id)
WHERE planilla_id IS NOT NULL
  AND empleado_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_planilla_conceptos_ep_concepto
ON public.empleado_planilla_conceptos (empleado_planilla_id, concepto_id)
WHERE empleado_planilla_id IS NOT NULL
  AND concepto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planillas_tenant_periodo_estado
ON public.planillas (tenant_id, periodo, estado);

CREATE INDEX IF NOT EXISTS idx_empleado_planilla_planilla_estado_pago
ON public.empleado_planilla (planilla_id, estado_pago);

CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_planilla_fecha
ON public.historial_pagos_planilla (planilla_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_empleados_tenant_planilla_fecha
ON public.pagos_empleados (tenant_id, planilla_id, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_tenant_periodo_created
ON public.rrhh_pagos (tenant_id, periodo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_tenant_empleado_periodo
ON public.rrhh_pagos (tenant_id, empleado_id, periodo, created_at DESC);

COMMIT;
