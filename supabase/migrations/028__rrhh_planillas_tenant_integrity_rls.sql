-- ============================================================================
-- 028__rrhh_planillas_tenant_integrity_rls.sql
-- Endurece consistencia tenant en flujo de planillas y reafirma RLS RRHH.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Consistencia tenant para empleado_planilla
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_tenant_empleado_planilla()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_planilla uuid;
  v_tenant_empleado uuid;
BEGIN
  NEW.planilla_id := COALESCE(NEW.planilla_id, app.to_uuid_or_null(NEW.id_planilla));
  NEW.empleado_id := COALESCE(NEW.empleado_id, app.to_uuid_or_null(NEW.id_empleado));

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

  IF v_tenant_planilla IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_planilla THEN
    RAISE EXCEPTION 'tenant_id no coincide con planilla (% != %)', NEW.tenant_id, v_tenant_planilla;
  END IF;

  IF v_tenant_empleado IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_empleado THEN
    RAISE EXCEPTION 'tenant_id no coincide con empleado (% != %)', NEW.tenant_id, v_tenant_empleado;
  END IF;

  IF v_tenant_planilla IS NOT NULL
     AND v_tenant_empleado IS NOT NULL
     AND v_tenant_planilla IS DISTINCT FROM v_tenant_empleado THEN
    RAISE EXCEPTION 'planilla y empleado pertenecen a tenants distintos';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_empleado_planilla ON public.empleado_planilla;
CREATE TRIGGER trg_enforce_tenant_empleado_planilla
BEFORE INSERT OR UPDATE OF tenant_id, planilla_id, empleado_id, id_planilla, id_empleado
ON public.empleado_planilla
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_empleado_planilla();

-- ----------------------------------------------------------------------------
-- Consistencia tenant para empleado_planilla_conceptos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_tenant_empleado_planilla_conceptos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_empleado_planilla uuid;
BEGIN
  NEW.empleado_planilla_id := COALESCE(NEW.empleado_planilla_id, app.to_uuid_or_null(NEW.id_empleado_planilla));
  NEW.concepto_id := COALESCE(NEW.concepto_id, app.to_uuid_or_null(NEW.id_concepto));

  IF NEW.empleado_planilla_id IS NOT NULL THEN
    SELECT ep.tenant_id INTO v_tenant_empleado_planilla
    FROM public.empleado_planilla ep
    WHERE ep.id = NEW.empleado_planilla_id;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_empleado_planilla);

  IF v_tenant_empleado_planilla IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM v_tenant_empleado_planilla THEN
    RAISE EXCEPTION 'tenant_id no coincide con empleado_planilla (% != %)', NEW.tenant_id, v_tenant_empleado_planilla;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_empleado_planilla_conceptos ON public.empleado_planilla_conceptos;
CREATE TRIGGER trg_enforce_tenant_empleado_planilla_conceptos
BEFORE INSERT OR UPDATE OF tenant_id, empleado_planilla_id, id_empleado_planilla
ON public.empleado_planilla_conceptos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_empleado_planilla_conceptos();

-- ----------------------------------------------------------------------------
-- Consistencia tenant para pagos_empleados, rrhh_pagos e historial
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_tenant_pagos_empleados()
RETURNS trigger
LANGUAGE plpgsql
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

  IF v_tenant_planilla IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_planilla THEN
    RAISE EXCEPTION 'tenant_id no coincide con planilla en pagos_empleados';
  END IF;

  IF v_tenant_empleado IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_empleado THEN
    RAISE EXCEPTION 'tenant_id no coincide con empleado en pagos_empleados';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_pagos_empleados ON public.pagos_empleados;
CREATE TRIGGER trg_enforce_tenant_pagos_empleados
BEFORE INSERT OR UPDATE OF tenant_id, planilla_id, empleado_id
ON public.pagos_empleados
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_pagos_empleados();

CREATE OR REPLACE FUNCTION app.enforce_tenant_rrhh_pagos()
RETURNS trigger
LANGUAGE plpgsql
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

  IF v_tenant_planilla IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_planilla THEN
    RAISE EXCEPTION 'tenant_id no coincide con planilla en rrhh_pagos';
  END IF;

  IF v_tenant_empleado IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_empleado THEN
    RAISE EXCEPTION 'tenant_id no coincide con empleado en rrhh_pagos';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_rrhh_pagos ON public.rrhh_pagos;
CREATE TRIGGER trg_enforce_tenant_rrhh_pagos
BEFORE INSERT OR UPDATE OF tenant_id, planilla_id, empleado_id
ON public.rrhh_pagos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_rrhh_pagos();

CREATE OR REPLACE FUNCTION app.enforce_tenant_historial_pagos_planilla()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_planilla uuid;
BEGIN
  IF NEW.planilla_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_planilla
    FROM public.planillas p
    WHERE p.id = NEW.planilla_id;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_planilla);

  IF v_tenant_planilla IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_planilla THEN
    RAISE EXCEPTION 'tenant_id no coincide con planilla en historial_pagos_planilla';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_historial_pagos_planilla ON public.historial_pagos_planilla;
CREATE TRIGGER trg_enforce_tenant_historial_pagos_planilla
BEFORE INSERT OR UPDATE OF tenant_id, planilla_id
ON public.historial_pagos_planilla
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_historial_pagos_planilla();

-- ----------------------------------------------------------------------------
-- Reafirmar políticas RLS en tablas RRHH/planillas
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'planillas',
    'conceptos_planilla',
    'empleado_planilla',
    'empleado_planilla_conceptos',
    'pagos_empleados',
    'rrhh_pagos',
    'historial_pagos_planilla',
    'liquidaciones',
    'asistencia',
    'asistencias',
    'solicitudes'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'tenant_id'
    ) THEN
      PERFORM app.apply_tenant_policy('public', v_table);
    END IF;
  END LOOP;
END
$$;

COMMIT;
