-- ============================================================================
-- 168__rrhh_personal_operativo_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- beneficios, capacitaciones, horarios_trabajo, empleado_beneficios,
-- empleado_capacitaciones, empleado_horarios, expediente_documentos,
-- liquidaciones, historial_pagos_planilla.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.empleado_beneficios eb
SET
  tenant_id = e.tenant_id,
  id_empleado = COALESCE(eb.id_empleado, eb.empleado_id, e.id),
  empleado_id = COALESCE(eb.empleado_id, eb.id_empleado, e.id)
FROM public.empleados e
WHERE (eb.id_empleado = e.id OR eb.empleado_id = e.id)
  AND e.tenant_id IS NOT NULL
  AND (
    eb.tenant_id IS NULL
    OR eb.tenant_id <> e.tenant_id
    OR eb.id_empleado IS NULL
    OR eb.empleado_id IS NULL
  );

UPDATE public.empleado_beneficios eb
SET
  tenant_id = COALESCE(eb.tenant_id, b.tenant_id),
  id_beneficio = COALESCE(eb.id_beneficio, eb.beneficio_id, b.id),
  beneficio_id = COALESCE(eb.beneficio_id, eb.id_beneficio, b.id)
FROM public.beneficios b
WHERE (eb.id_beneficio = b.id OR eb.beneficio_id = b.id)
  AND (
    eb.tenant_id IS NULL
    OR eb.id_beneficio IS NULL
    OR eb.beneficio_id IS NULL
  );

UPDATE public.beneficios b
SET tenant_id = eb.tenant_id
FROM public.empleado_beneficios eb
WHERE (eb.id_beneficio = b.id OR eb.beneficio_id = b.id)
  AND eb.tenant_id IS NOT NULL
  AND b.tenant_id IS NULL;

UPDATE public.empleado_capacitaciones ec
SET
  tenant_id = e.tenant_id,
  id_empleado = COALESCE(ec.id_empleado, ec.empleado_id, e.id),
  empleado_id = COALESCE(ec.empleado_id, ec.id_empleado, e.id)
FROM public.empleados e
WHERE (ec.id_empleado = e.id OR ec.empleado_id = e.id)
  AND e.tenant_id IS NOT NULL
  AND (
    ec.tenant_id IS NULL
    OR ec.tenant_id <> e.tenant_id
    OR ec.id_empleado IS NULL
    OR ec.empleado_id IS NULL
  );

UPDATE public.empleado_capacitaciones ec
SET
  tenant_id = COALESCE(ec.tenant_id, c.tenant_id),
  id_capacitacion = COALESCE(ec.id_capacitacion, ec.capacitacion_id, c.id),
  capacitacion_id = COALESCE(ec.capacitacion_id, ec.id_capacitacion, c.id)
FROM public.capacitaciones c
WHERE (ec.id_capacitacion = c.id OR ec.capacitacion_id = c.id)
  AND (
    ec.tenant_id IS NULL
    OR ec.id_capacitacion IS NULL
    OR ec.capacitacion_id IS NULL
  );

UPDATE public.capacitaciones c
SET tenant_id = ec.tenant_id
FROM public.empleado_capacitaciones ec
WHERE (ec.id_capacitacion = c.id OR ec.capacitacion_id = c.id)
  AND ec.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.empleado_horarios eh
SET
  tenant_id = e.tenant_id,
  id_empleado = COALESCE(eh.id_empleado, eh.empleado_id, e.id),
  empleado_id = COALESCE(eh.empleado_id, eh.id_empleado, e.id)
FROM public.empleados e
WHERE (eh.id_empleado = e.id OR eh.empleado_id = e.id)
  AND e.tenant_id IS NOT NULL
  AND (
    eh.tenant_id IS NULL
    OR eh.tenant_id <> e.tenant_id
    OR eh.id_empleado IS NULL
    OR eh.empleado_id IS NULL
  );

UPDATE public.empleado_horarios eh
SET
  tenant_id = COALESCE(eh.tenant_id, h.tenant_id),
  id_horario = COALESCE(eh.id_horario, eh.horario_id, h.id),
  horario_id = COALESCE(eh.horario_id, eh.id_horario, h.id)
FROM public.horarios_trabajo h
WHERE (eh.id_horario = h.id OR eh.horario_id = h.id)
  AND (
    eh.tenant_id IS NULL
    OR eh.id_horario IS NULL
    OR eh.horario_id IS NULL
  );

UPDATE public.horarios_trabajo h
SET tenant_id = eh.tenant_id
FROM public.empleado_horarios eh
WHERE (eh.id_horario = h.id OR eh.horario_id = h.id)
  AND eh.tenant_id IS NOT NULL
  AND h.tenant_id IS NULL;

UPDATE public.expediente_documentos ed
SET
  tenant_id = e.tenant_id,
  id_empleado = COALESCE(ed.id_empleado, ed.empleado_id, e.id),
  empleado_id = COALESCE(ed.empleado_id, ed.id_empleado, e.id)
FROM public.empleados e
WHERE (ed.id_empleado = e.id OR ed.empleado_id = e.id)
  AND e.tenant_id IS NOT NULL
  AND (
    ed.tenant_id IS NULL
    OR ed.tenant_id <> e.tenant_id
    OR ed.id_empleado IS NULL
    OR ed.empleado_id IS NULL
  );

UPDATE public.expediente_documentos ed
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE ed.subido_por = u.id
  AND u.tenant_id IS NOT NULL
  AND ed.tenant_id IS NULL;

UPDATE public.liquidaciones l
SET
  tenant_id = e.tenant_id,
  id_empleado = COALESCE(l.id_empleado, l.empleado_id, e.id),
  empleado_id = COALESCE(l.empleado_id, l.id_empleado, e.id)
FROM public.empleados e
WHERE (l.id_empleado = e.id OR l.empleado_id = e.id)
  AND e.tenant_id IS NOT NULL
  AND (
    l.tenant_id IS NULL
    OR l.tenant_id <> e.tenant_id
    OR l.id_empleado IS NULL
    OR l.empleado_id IS NULL
  );

UPDATE public.historial_pagos_planilla hpp
SET tenant_id = p.tenant_id
FROM public.planillas p
WHERE hpp.planilla_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (hpp.tenant_id IS NULL OR hpp.tenant_id <> p.tenant_id);

-- ----------------------------------------------------------------------------
-- FKs runtime para joins/embeds.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('empleado_beneficios', 'id_empleado', 'empleados', 'id', 'empleado_beneficios_id_empleado_fkey');
SELECT app.add_fk_if_possible('empleado_beneficios', 'empleado_id', 'empleados', 'id', 'empleado_beneficios_empleado_id_fkey');
SELECT app.add_fk_if_possible('empleado_beneficios', 'id_beneficio', 'beneficios', 'id', 'empleado_beneficios_id_beneficio_fkey');
SELECT app.add_fk_if_possible('empleado_beneficios', 'beneficio_id', 'beneficios', 'id', 'empleado_beneficios_beneficio_id_fkey');

SELECT app.add_fk_if_possible('empleado_capacitaciones', 'id_empleado', 'empleados', 'id', 'empleado_capacitaciones_id_empleado_fkey');
SELECT app.add_fk_if_possible('empleado_capacitaciones', 'empleado_id', 'empleados', 'id', 'empleado_capacitaciones_empleado_id_fkey');
SELECT app.add_fk_if_possible('empleado_capacitaciones', 'id_capacitacion', 'capacitaciones', 'id', 'empleado_capacitaciones_id_capacitacion_fkey');
SELECT app.add_fk_if_possible('empleado_capacitaciones', 'capacitacion_id', 'capacitaciones', 'id', 'empleado_capacitaciones_capacitacion_id_fkey');

SELECT app.add_fk_if_possible('empleado_horarios', 'id_empleado', 'empleados', 'id', 'empleado_horarios_id_empleado_fkey');
SELECT app.add_fk_if_possible('empleado_horarios', 'empleado_id', 'empleados', 'id', 'empleado_horarios_empleado_id_fkey');
SELECT app.add_fk_if_possible('empleado_horarios', 'id_horario', 'horarios_trabajo', 'id', 'empleado_horarios_id_horario_fkey');
SELECT app.add_fk_if_possible('empleado_horarios', 'horario_id', 'horarios_trabajo', 'id', 'empleado_horarios_horario_id_fkey');

SELECT app.add_fk_if_possible('expediente_documentos', 'id_empleado', 'empleados', 'id', 'expediente_documentos_id_empleado_fkey');
SELECT app.add_fk_if_possible('expediente_documentos', 'empleado_id', 'empleados', 'id', 'expediente_documentos_empleado_id_fkey');
SELECT app.add_fk_if_possible('expediente_documentos', 'subido_por', 'usuarios_sistema', 'id', 'expediente_documentos_subido_por_fkey');
SELECT app.add_fk_if_possible('expediente_documentos', 'verificado_por', 'usuarios_sistema', 'id', 'expediente_documentos_verificado_por_fkey');

SELECT app.add_fk_if_possible('liquidaciones', 'id_empleado', 'empleados', 'id', 'liquidaciones_id_empleado_fkey');
SELECT app.add_fk_if_possible('liquidaciones', 'empleado_id', 'empleados', 'id', 'liquidaciones_empleado_id_fkey');
SELECT app.add_fk_if_possible('liquidaciones', 'aprobado_por', 'usuarios_sistema', 'id', 'liquidaciones_aprobado_por_fkey');
SELECT app.add_fk_if_possible('liquidaciones', 'pagado_por', 'usuarios_sistema', 'id', 'liquidaciones_pagado_por_fkey');

SELECT app.add_fk_if_possible('historial_pagos_planilla', 'planilla_id', 'planillas', 'id', 'fk_historial_pagos_planilla_id');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar unicidades.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    eb.id,
    row_number() OVER (
      PARTITION BY eb.tenant_id, eb.id_empleado, eb.id_beneficio, eb.fecha_inicio
      ORDER BY COALESCE(eb.updated_at, eb.created_at, now()) DESC, eb.id::text DESC
    ) AS rn
  FROM public.empleado_beneficios eb
  WHERE eb.tenant_id IS NOT NULL
    AND eb.id_empleado IS NOT NULL
    AND eb.id_beneficio IS NOT NULL
    AND eb.fecha_inicio IS NOT NULL
    AND eb.estado IN ('activo', 'inactivo', 'suspendido')
)
UPDATE public.empleado_beneficios eb
SET
  fecha_inicio = eb.fecha_inicio + (r.rn - 1)::integer,
  updated_at = now()
FROM ranked r
WHERE eb.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    ec.id,
    row_number() OVER (
      PARTITION BY ec.tenant_id, ec.id_empleado, ec.id_capacitacion, ec.fecha_inscripcion
      ORDER BY COALESCE(ec.updated_at, ec.created_at, now()) DESC, ec.id::text DESC
    ) AS rn
  FROM public.empleado_capacitaciones ec
  WHERE ec.tenant_id IS NOT NULL
    AND ec.id_empleado IS NOT NULL
    AND ec.id_capacitacion IS NOT NULL
    AND ec.fecha_inscripcion IS NOT NULL
)
UPDATE public.empleado_capacitaciones ec
SET
  fecha_inscripcion = ec.fecha_inscripcion + (r.rn - 1)::integer,
  updated_at = now()
FROM ranked r
WHERE ec.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    eh.id,
    row_number() OVER (
      PARTITION BY eh.tenant_id, eh.id_empleado, eh.id_horario, eh.fecha_inicio
      ORDER BY COALESCE(eh.updated_at, eh.created_at, now()) DESC, eh.id::text DESC
    ) AS rn
  FROM public.empleado_horarios eh
  WHERE eh.tenant_id IS NOT NULL
    AND eh.id_empleado IS NOT NULL
    AND eh.id_horario IS NOT NULL
    AND eh.fecha_inicio IS NOT NULL
)
UPDATE public.empleado_horarios eh
SET
  fecha_inicio = eh.fecha_inicio + (r.rn - 1)::integer,
  updated_at = now()
FROM ranked r
WHERE eh.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    eh.id,
    row_number() OVER (
      PARTITION BY eh.tenant_id, eh.id_empleado
      ORDER BY COALESCE(eh.fecha_inicio, eh.created_at::date, current_date) DESC, COALESCE(eh.updated_at, eh.created_at, now()) DESC, eh.id::text DESC
    ) AS rn
  FROM public.empleado_horarios eh
  WHERE eh.tenant_id IS NOT NULL
    AND eh.id_empleado IS NOT NULL
    AND eh.activo = true
)
UPDATE public.empleado_horarios eh
SET
  activo = false,
  estado = 'inactivo',
  fecha_fin = COALESCE(eh.fecha_fin, eh.fecha_inicio, current_date),
  updated_at = now()
FROM ranked r
WHERE eh.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    l.id,
    row_number() OVER (
      PARTITION BY l.tenant_id, l.id_empleado, l.fecha_terminacion
      ORDER BY COALESCE(l.updated_at, l.created_at, now()) DESC, l.id::text DESC
    ) AS rn
  FROM public.liquidaciones l
  WHERE l.tenant_id IS NOT NULL
    AND l.id_empleado IS NOT NULL
    AND l.fecha_terminacion IS NOT NULL
    AND l.estado IN ('calculada', 'aprobada', 'pagada')
)
UPDATE public.liquidaciones l
SET
  fecha_terminacion = l.fecha_terminacion + (r.rn - 1)::integer,
  ultimo_dia_trabajado = COALESCE(l.ultimo_dia_trabajado, l.fecha_terminacion + (r.rn - 1)::integer),
  updated_at = now()
FROM ranked r
WHERE l.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    h.id,
    row_number() OVER (
      PARTITION BY h.tenant_id, h.planilla_id, h.fecha, upper(btrim(h.numero_operacion))
      ORDER BY COALESCE(h.updated_at, h.created_at, now()) DESC, h.id::text DESC
    ) AS rn
  FROM public.historial_pagos_planilla h
  WHERE h.tenant_id IS NOT NULL
    AND h.planilla_id IS NOT NULL
    AND h.fecha IS NOT NULL
    AND h.numero_operacion IS NOT NULL
    AND btrim(h.numero_operacion) <> ''
)
UPDATE public.historial_pagos_planilla h
SET
  numero_operacion = format('%s-DUP-%s', upper(btrim(h.numero_operacion)), r.rn),
  updated_at = now()
FROM ranked r
WHERE h.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: empleado_beneficios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_empleado_beneficios_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_empleado uuid;
  v_tenant_beneficio uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.id_beneficio := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_beneficio::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.beneficio_id::text, ''))
  );
  NEW.beneficio_id := NEW.id_beneficio;

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_tenant_empleado
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_empleado;
    ELSIF v_tenant_empleado IS NOT NULL AND NEW.tenant_id <> v_tenant_empleado THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en empleado_beneficios', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.id_beneficio IS NOT NULL THEN
    SELECT b.tenant_id INTO v_tenant_beneficio
    FROM public.beneficios b
    WHERE b.id = NEW.id_beneficio;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Beneficio no existe: %s', NEW.id_beneficio), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_beneficio;
    ELSIF v_tenant_beneficio IS NOT NULL AND NEW.tenant_id <> v_tenant_beneficio THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con beneficio en empleado_beneficios', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en empleado_beneficios', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_empleado_beneficios_tenant_consistency ON public.empleado_beneficios;
CREATE TRIGGER trg_enforce_empleado_beneficios_tenant_consistency
BEFORE INSERT OR UPDATE ON public.empleado_beneficios
FOR EACH ROW
EXECUTE FUNCTION app.enforce_empleado_beneficios_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: empleado_capacitaciones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_empleado_capacitaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_empleado uuid;
  v_tenant_capacitacion uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.id_capacitacion := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_capacitacion::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.capacitacion_id::text, ''))
  );
  NEW.capacitacion_id := NEW.id_capacitacion;

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_tenant_empleado
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_empleado;
    ELSIF v_tenant_empleado IS NOT NULL AND NEW.tenant_id <> v_tenant_empleado THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en empleado_capacitaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.id_capacitacion IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_capacitacion
    FROM public.capacitaciones c
    WHERE c.id = NEW.id_capacitacion;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Capacitacion no existe: %s', NEW.id_capacitacion), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_capacitacion;
    ELSIF v_tenant_capacitacion IS NOT NULL AND NEW.tenant_id <> v_tenant_capacitacion THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con capacitacion en empleado_capacitaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en empleado_capacitaciones', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_empleado_capacitaciones_tenant_consistency ON public.empleado_capacitaciones;
CREATE TRIGGER trg_enforce_empleado_capacitaciones_tenant_consistency
BEFORE INSERT OR UPDATE ON public.empleado_capacitaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_empleado_capacitaciones_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: empleado_horarios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_empleado_horarios_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_empleado uuid;
  v_tenant_horario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.id_horario := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_horario::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.horario_id::text, ''))
  );
  NEW.horario_id := NEW.id_horario;

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_tenant_empleado
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_empleado;
    ELSIF v_tenant_empleado IS NOT NULL AND NEW.tenant_id <> v_tenant_empleado THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en empleado_horarios', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.id_horario IS NOT NULL THEN
    SELECT h.tenant_id INTO v_tenant_horario
    FROM public.horarios_trabajo h
    WHERE h.id = NEW.id_horario;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Horario no existe: %s', NEW.id_horario), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_horario;
    ELSIF v_tenant_horario IS NOT NULL AND NEW.tenant_id <> v_tenant_horario THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con horario en empleado_horarios', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en empleado_horarios', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_empleado_horarios_tenant_consistency ON public.empleado_horarios;
CREATE TRIGGER trg_enforce_empleado_horarios_tenant_consistency
BEFORE INSERT OR UPDATE ON public.empleado_horarios
FOR EACH ROW
EXECUTE FUNCTION app.enforce_empleado_horarios_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: expediente_documentos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_expediente_documentos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_empleado uuid;
  v_tenant_usuario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.subido_por := app.to_uuid_or_null(COALESCE(NEW.subido_por::text, ''));
  NEW.verificado_por := app.to_uuid_or_null(COALESCE(NEW.verificado_por::text, ''));

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_tenant_empleado
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_empleado;
    ELSIF v_tenant_empleado IS NOT NULL AND NEW.tenant_id <> v_tenant_empleado THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en expediente_documentos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.subido_por IS NOT NULL THEN
    SELECT u.tenant_id INTO v_tenant_usuario
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.subido_por;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Usuario no existe (subido_por): %s', NEW.subido_por), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_usuario;
    ELSIF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con subido_por en expediente_documentos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.verificado_por IS NOT NULL THEN
    SELECT u.tenant_id INTO v_tenant_usuario
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.verificado_por;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Usuario no existe (verificado_por): %s', NEW.verificado_por), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_usuario;
    ELSIF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con verificado_por en expediente_documentos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en expediente_documentos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_expediente_documentos_tenant_consistency ON public.expediente_documentos;
CREATE TRIGGER trg_enforce_expediente_documentos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.expediente_documentos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_expediente_documentos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: liquidaciones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_liquidaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_empleado uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));
  NEW.pagado_por := app.to_uuid_or_null(COALESCE(NEW.pagado_por::text, ''));

  IF NEW.id_empleado IS NOT NULL THEN
    SELECT e.tenant_id INTO v_tenant_empleado
    FROM public.empleados e
    WHERE e.id = NEW.id_empleado;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Empleado no existe: %s', NEW.id_empleado), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_empleado;
    ELSIF v_tenant_empleado IS NOT NULL AND NEW.tenant_id <> v_tenant_empleado THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con empleado en liquidaciones', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en liquidaciones', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_liquidaciones_tenant_consistency ON public.liquidaciones;
CREATE TRIGGER trg_enforce_liquidaciones_tenant_consistency
BEFORE INSERT OR UPDATE ON public.liquidaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_liquidaciones_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: historial_pagos_planilla.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_historial_pagos_planilla_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_planilla uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.planilla_id := app.to_uuid_or_null(COALESCE(NEW.planilla_id::text, ''));

  IF NEW.planilla_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_planilla
    FROM public.planillas p
    WHERE p.id = NEW.planilla_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Planilla no existe: %s', NEW.planilla_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_planilla;
    ELSIF v_tenant_planilla IS NOT NULL AND NEW.tenant_id <> v_tenant_planilla THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con planilla en historial_pagos_planilla', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en historial_pagos_planilla', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_historial_pagos_planilla ON public.historial_pagos_planilla;
DROP TRIGGER IF EXISTS trg_enforce_historial_pagos_planilla_tenant_consistency ON public.historial_pagos_planilla;
CREATE TRIGGER trg_enforce_historial_pagos_planilla_tenant_consistency
BEFORE INSERT OR UPDATE ON public.historial_pagos_planilla
FOR EACH ROW
EXECUTE FUNCTION app.enforce_historial_pagos_planilla_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.beneficios DROP CONSTRAINT IF EXISTS ck_beneficios_estado_runtime;
ALTER TABLE public.beneficios
  ADD CONSTRAINT ck_beneficios_estado_runtime
  CHECK (estado IN ('activo', 'inactivo', 'archivado'));

ALTER TABLE public.beneficios DROP CONSTRAINT IF EXISTS ck_beneficios_monto_fechas_runtime;
ALTER TABLE public.beneficios
  ADD CONSTRAINT ck_beneficios_monto_fechas_runtime
  CHECK (
    monto >= 0
    AND (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
  );

ALTER TABLE public.capacitaciones DROP CONSTRAINT IF EXISTS ck_capacitaciones_estado_runtime;
ALTER TABLE public.capacitaciones
  ADD CONSTRAINT ck_capacitaciones_estado_runtime
  CHECK (estado IN ('activo', 'inactivo', 'completada', 'cancelada'));

ALTER TABLE public.capacitaciones DROP CONSTRAINT IF EXISTS ck_capacitaciones_metricas_runtime;
ALTER TABLE public.capacitaciones
  ADD CONSTRAINT ck_capacitaciones_metricas_runtime
  CHECK (
    duracion_horas >= 0
    AND costo >= 0
    AND (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
  );

ALTER TABLE public.horarios_trabajo DROP CONSTRAINT IF EXISTS ck_horarios_trabajo_estado_runtime;
ALTER TABLE public.horarios_trabajo
  ADD CONSTRAINT ck_horarios_trabajo_estado_runtime
  CHECK (estado IN ('activo', 'inactivo'));

ALTER TABLE public.horarios_trabajo DROP CONSTRAINT IF EXISTS ck_horarios_trabajo_reglas_runtime;
ALTER TABLE public.horarios_trabajo
  ADD CONSTRAINT ck_horarios_trabajo_reglas_runtime
  CHECK (
    tolerancia_minutos >= 0
    AND (hora_inicio IS NULL OR hora_fin IS NULL OR hora_inicio <> hora_fin)
  );

ALTER TABLE public.empleado_beneficios DROP CONSTRAINT IF EXISTS ck_empleado_beneficios_estado_runtime;
ALTER TABLE public.empleado_beneficios
  ADD CONSTRAINT ck_empleado_beneficios_estado_runtime
  CHECK (estado IN ('activo', 'inactivo', 'suspendido', 'vencido'));

ALTER TABLE public.empleado_beneficios DROP CONSTRAINT IF EXISTS ck_empleado_beneficios_fechas_runtime;
ALTER TABLE public.empleado_beneficios
  ADD CONSTRAINT ck_empleado_beneficios_fechas_runtime
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio);

ALTER TABLE public.empleado_capacitaciones DROP CONSTRAINT IF EXISTS ck_empleado_capacitaciones_estado_runtime;
ALTER TABLE public.empleado_capacitaciones
  ADD CONSTRAINT ck_empleado_capacitaciones_estado_runtime
  CHECK (estado IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado'));

ALTER TABLE public.empleado_capacitaciones DROP CONSTRAINT IF EXISTS ck_empleado_capacitaciones_calificacion_runtime;
ALTER TABLE public.empleado_capacitaciones
  ADD CONSTRAINT ck_empleado_capacitaciones_calificacion_runtime
  CHECK (
    calificacion >= 0
    AND calificacion <= 100
    AND (fecha_inscripcion IS NULL OR fecha_completado IS NULL OR fecha_completado >= fecha_inscripcion)
  );

ALTER TABLE public.empleado_horarios DROP CONSTRAINT IF EXISTS ck_empleado_horarios_estado_runtime;
ALTER TABLE public.empleado_horarios
  ADD CONSTRAINT ck_empleado_horarios_estado_runtime
  CHECK (estado IN ('activo', 'inactivo', 'suspendido'));

ALTER TABLE public.empleado_horarios DROP CONSTRAINT IF EXISTS ck_empleado_horarios_fechas_runtime;
ALTER TABLE public.empleado_horarios
  ADD CONSTRAINT ck_empleado_horarios_fechas_runtime
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio);

ALTER TABLE public.expediente_documentos DROP CONSTRAINT IF EXISTS ck_expediente_documentos_estado_runtime;
ALTER TABLE public.expediente_documentos
  ADD CONSTRAINT ck_expediente_documentos_estado_runtime
  CHECK (estado IN ('activo', 'archivado', 'eliminado'));

ALTER TABLE public.expediente_documentos DROP CONSTRAINT IF EXISTS ck_expediente_documentos_tipo_runtime;
ALTER TABLE public.expediente_documentos
  ADD CONSTRAINT ck_expediente_documentos_tipo_runtime
  CHECK (
    tipo_documento IN ('contrato', 'dni', 'cv', 'certificado', 'licencia', 'otro')
    AND tamanio_bytes >= 0
    AND (fecha_verificacion IS NULL OR fecha_subida IS NULL OR fecha_verificacion >= fecha_subida)
  );

ALTER TABLE public.liquidaciones DROP CONSTRAINT IF EXISTS ck_liquidaciones_estado_runtime;
ALTER TABLE public.liquidaciones
  ADD CONSTRAINT ck_liquidaciones_estado_runtime
  CHECK (estado IN ('calculada', 'aprobada', 'pagada', 'anulada'));

ALTER TABLE public.liquidaciones DROP CONSTRAINT IF EXISTS ck_liquidaciones_motivo_runtime;
ALTER TABLE public.liquidaciones
  ADD CONSTRAINT ck_liquidaciones_motivo_runtime
  CHECK (motivo_terminacion IN ('renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo', 'abandono', 'fallecimiento', 'otro'));

ALTER TABLE public.liquidaciones DROP CONSTRAINT IF EXISTS ck_liquidaciones_montos_fechas_runtime;
ALTER TABLE public.liquidaciones
  ADD CONSTRAINT ck_liquidaciones_montos_fechas_runtime
  CHECK (
    monto_cts >= 0
    AND vacaciones_pendientes >= 0
    AND indemnizacion >= 0
    AND dias_cts >= 0
    AND total_liquidacion >= 0
    AND total_liquidacion >= (monto_cts + indemnizacion)
    AND (fecha_terminacion IS NULL OR ultimo_dia_trabajado IS NULL OR ultimo_dia_trabajado <= fecha_terminacion)
    AND (metodo_pago IS NULL OR metodo_pago IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro'))
  );

ALTER TABLE public.historial_pagos_planilla DROP CONSTRAINT IF EXISTS ck_historial_pagos_planilla_estado_runtime;
ALTER TABLE public.historial_pagos_planilla
  ADD CONSTRAINT ck_historial_pagos_planilla_estado_runtime
  CHECK (estado IN ('registrado', 'anulado', 'conciliado'));

ALTER TABLE public.historial_pagos_planilla DROP CONSTRAINT IF EXISTS ck_historial_pagos_planilla_metricas_runtime;
ALTER TABLE public.historial_pagos_planilla
  ADD CONSTRAINT ck_historial_pagos_planilla_metricas_runtime
  CHECK (
    monto >= 0
    AND empleados_count >= 0
    AND fecha IS NOT NULL
    AND metodo IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro')
    AND metodo_pago IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro')
  );

ALTER TABLE public.beneficios VALIDATE CONSTRAINT ck_beneficios_estado_runtime;
ALTER TABLE public.beneficios VALIDATE CONSTRAINT ck_beneficios_monto_fechas_runtime;

ALTER TABLE public.capacitaciones VALIDATE CONSTRAINT ck_capacitaciones_estado_runtime;
ALTER TABLE public.capacitaciones VALIDATE CONSTRAINT ck_capacitaciones_metricas_runtime;

ALTER TABLE public.horarios_trabajo VALIDATE CONSTRAINT ck_horarios_trabajo_estado_runtime;
ALTER TABLE public.horarios_trabajo VALIDATE CONSTRAINT ck_horarios_trabajo_reglas_runtime;

ALTER TABLE public.empleado_beneficios VALIDATE CONSTRAINT ck_empleado_beneficios_estado_runtime;
ALTER TABLE public.empleado_beneficios VALIDATE CONSTRAINT ck_empleado_beneficios_fechas_runtime;

ALTER TABLE public.empleado_capacitaciones VALIDATE CONSTRAINT ck_empleado_capacitaciones_estado_runtime;
ALTER TABLE public.empleado_capacitaciones VALIDATE CONSTRAINT ck_empleado_capacitaciones_calificacion_runtime;

ALTER TABLE public.empleado_horarios VALIDATE CONSTRAINT ck_empleado_horarios_estado_runtime;
ALTER TABLE public.empleado_horarios VALIDATE CONSTRAINT ck_empleado_horarios_fechas_runtime;

ALTER TABLE public.expediente_documentos VALIDATE CONSTRAINT ck_expediente_documentos_estado_runtime;
ALTER TABLE public.expediente_documentos VALIDATE CONSTRAINT ck_expediente_documentos_tipo_runtime;

ALTER TABLE public.liquidaciones VALIDATE CONSTRAINT ck_liquidaciones_estado_runtime;
ALTER TABLE public.liquidaciones VALIDATE CONSTRAINT ck_liquidaciones_motivo_runtime;
ALTER TABLE public.liquidaciones VALIDATE CONSTRAINT ck_liquidaciones_montos_fechas_runtime;

ALTER TABLE public.historial_pagos_planilla VALIDATE CONSTRAINT ck_historial_pagos_planilla_estado_runtime;
ALTER TABLE public.historial_pagos_planilla VALIDATE CONSTRAINT ck_historial_pagos_planilla_metricas_runtime;

-- ----------------------------------------------------------------------------
-- Unicidades operativas.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_beneficios_tenant_codigo_activo
ON public.beneficios (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND estado IN ('activo', 'inactivo');

CREATE UNIQUE INDEX IF NOT EXISTS ux_capacitaciones_tenant_codigo_activo
ON public.capacitaciones (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND estado IN ('activo', 'inactivo');

CREATE UNIQUE INDEX IF NOT EXISTS ux_horarios_trabajo_tenant_codigo_activo
ON public.horarios_trabajo (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND estado IN ('activo', 'inactivo');

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_beneficios_tenant_empleado_beneficio_fecha
ON public.empleado_beneficios (tenant_id, id_empleado, id_beneficio, fecha_inicio)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND id_beneficio IS NOT NULL
  AND fecha_inicio IS NOT NULL
  AND estado IN ('activo', 'inactivo', 'suspendido');

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_capacitaciones_tenant_empleado_capacitacion_fecha
ON public.empleado_capacitaciones (tenant_id, id_empleado, id_capacitacion, fecha_inscripcion)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND id_capacitacion IS NOT NULL
  AND fecha_inscripcion IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_horarios_tenant_empleado_horario_fecha
ON public.empleado_horarios (tenant_id, id_empleado, id_horario, fecha_inicio)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND id_horario IS NOT NULL
  AND fecha_inicio IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_horarios_tenant_empleado_activo
ON public.empleado_horarios (tenant_id, id_empleado)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND activo = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_liquidaciones_tenant_empleado_fecha_terminacion
ON public.liquidaciones (tenant_id, id_empleado, fecha_terminacion)
WHERE tenant_id IS NOT NULL
  AND id_empleado IS NOT NULL
  AND fecha_terminacion IS NOT NULL
  AND estado IN ('calculada', 'aprobada', 'pagada');

CREATE UNIQUE INDEX IF NOT EXISTS ux_historial_pagos_planilla_tenant_planilla_fecha_operacion
ON public.historial_pagos_planilla (tenant_id, planilla_id, fecha, upper(btrim(numero_operacion)))
WHERE tenant_id IS NOT NULL
  AND planilla_id IS NOT NULL
  AND fecha IS NOT NULL
  AND numero_operacion IS NOT NULL
  AND btrim(numero_operacion) <> '';

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
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
