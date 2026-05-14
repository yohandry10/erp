-- ============================================================================
-- 167__rrhh_personal_operativo_runtime_alignment.sql
-- Alineacion runtime para RRHH operativo:
-- beneficios, capacitaciones, horarios_trabajo, empleado_beneficios,
-- empleado_capacitaciones, empleado_horarios, expediente_documentos,
-- liquidaciones, historial_pagos_planilla.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper local: parseo seguro de hora.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.to_time_or_null(p_input text)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN p_input::time;
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- beneficios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.beneficios
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

DROP POLICY IF EXISTS tenant_isolation ON public.beneficios;
DROP POLICY IF EXISTS tenant_isolation ON public.capacitaciones;
DROP POLICY IF EXISTS tenant_isolation ON public.horarios_trabajo;
DROP POLICY IF EXISTS tenant_isolation ON public.empleado_beneficios;
DROP POLICY IF EXISTS tenant_isolation ON public.empleado_capacitaciones;
DROP POLICY IF EXISTS tenant_isolation ON public.empleado_horarios;
DROP POLICY IF EXISTS tenant_isolation ON public.expediente_documentos;
DROP POLICY IF EXISTS tenant_isolation ON public.liquidaciones;
DROP POLICY IF EXISTS tenant_isolation ON public.historial_pagos_planilla;

ALTER TABLE IF EXISTS public.beneficios
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN tipo TYPE text USING NULLIF(lower(btrim(COALESCE(tipo, ''))), ''),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(monto::text, '0')),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN fecha_inicio TYPE date USING app.to_date_or_null(COALESCE(fecha_inicio::text, '')),
  ALTER COLUMN fecha_fin TYPE date USING app.to_date_or_null(COALESCE(fecha_fin::text, '')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.beneficios b
SET
  descripcion = NULLIF(btrim(COALESCE(b.descripcion, '')), ''),
  tipo = COALESCE(NULLIF(lower(btrim(COALESCE(b.tipo, ''))), ''), 'general'),
  monto = GREATEST(COALESCE(b.monto, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(b.moneda, ''))), ''), 'PEN'),
  fecha_inicio = COALESCE(b.fecha_inicio, b.created_at::date, current_date),
  fecha_fin = COALESCE(b.fecha_fin, b.fecha_inicio),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(b.estado), ''), 'activo')) IN ('activo', 'inactivo', 'archivado')
      THEN lower(COALESCE(NULLIF(btrim(b.estado), ''), 'activo'))
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(b.estado), ''), 'activo')) IN ('inactivo', 'archivado') THEN false
    ELSE COALESCE(b.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(b.nombre, '')), ''), 'Beneficio'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(b.codigo, ''))), ''), format('BEN-%s', upper(left(replace(b.id::text, '-', ''), 8)))),
  metadata = COALESCE(b.metadata, '{}'::jsonb),
  updated_at = now()
WHERE b.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_beneficios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.tipo := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.tipo, ''))), ''), 'general');
  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_fin := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_fin::text, '')), NEW.fecha_inicio);
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado NOT IN ('activo', 'inactivo', 'archivado') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Beneficio');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('BEN-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_beneficios_row ON public.beneficios;
CREATE TRIGGER trg_normalize_beneficios_row
BEFORE INSERT OR UPDATE ON public.beneficios
FOR EACH ROW
EXECUTE FUNCTION app.normalize_beneficios_row();

-- ----------------------------------------------------------------------------
-- capacitaciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.capacitaciones
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS instructor text,
  ADD COLUMN IF NOT EXISTS duracion_horas numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS costo numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.capacitaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN instructor TYPE text USING NULLIF(btrim(COALESCE(instructor, '')), ''),
  ALTER COLUMN duracion_horas TYPE numeric(10,2) USING app.to_numeric_or_zero(COALESCE(duracion_horas::text, '0')),
  ALTER COLUMN fecha_inicio TYPE date USING app.to_date_or_null(COALESCE(fecha_inicio::text, '')),
  ALTER COLUMN fecha_fin TYPE date USING app.to_date_or_null(COALESCE(fecha_fin::text, '')),
  ALTER COLUMN costo TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(costo::text, '0')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN duracion_horas SET DEFAULT 0,
  ALTER COLUMN costo SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.capacitaciones c
SET
  descripcion = NULLIF(btrim(COALESCE(c.descripcion, '')), ''),
  instructor = NULLIF(btrim(COALESCE(c.instructor, '')), ''),
  duracion_horas = GREATEST(COALESCE(c.duracion_horas, 0), 0),
  fecha_inicio = COALESCE(c.fecha_inicio, c.created_at::date, current_date),
  fecha_fin = COALESCE(c.fecha_fin, c.fecha_inicio),
  costo = GREATEST(COALESCE(c.costo, 0), 0),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'activo')) IN ('activo', 'inactivo', 'completada', 'cancelada')
      THEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'activo'))
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'activo')) IN ('inactivo', 'cancelada') THEN false
    ELSE COALESCE(c.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), 'Capacitacion'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), format('CAP-%s', upper(left(replace(c.id::text, '-', ''), 8)))),
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_capacitaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.instructor := NULLIF(btrim(COALESCE(NEW.instructor, '')), '');
  NEW.duracion_horas := GREATEST(COALESCE(NEW.duracion_horas, 0), 0);
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_fin := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_fin::text, '')), NEW.fecha_inicio);
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.costo := GREATEST(COALESCE(NEW.costo, 0), 0);
  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado NOT IN ('activo', 'inactivo', 'completada', 'cancelada') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Capacitacion');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CAP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_capacitaciones_row ON public.capacitaciones;
CREATE TRIGGER trg_normalize_capacitaciones_row
BEFORE INSERT OR UPDATE ON public.capacitaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_capacitaciones_row();

-- ----------------------------------------------------------------------------
-- horarios_trabajo
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.horarios_trabajo
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fin time,
  ADD COLUMN IF NOT EXISTS dias_semana jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tolerancia_minutos integer DEFAULT 0;

ALTER TABLE IF EXISTS public.horarios_trabajo
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN hora_inicio TYPE time USING hora_inicio::time,
  ALTER COLUMN hora_fin TYPE time USING hora_fin::time,
  ALTER COLUMN dias_semana SET DEFAULT '[]'::jsonb,
  ALTER COLUMN tolerancia_minutos TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(tolerancia_minutos::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN tolerancia_minutos SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.horarios_trabajo h
SET
  hora_inicio = COALESCE(h.hora_inicio, '09:00'::time),
  hora_fin = COALESCE(h.hora_fin, '18:00'::time),
  dias_semana = CASE WHEN jsonb_typeof(COALESCE(h.dias_semana, '[]'::jsonb)) = 'array' THEN COALESCE(h.dias_semana, '[]'::jsonb) ELSE '[]'::jsonb END,
  tolerancia_minutos = GREATEST(COALESCE(h.tolerancia_minutos, 0), 0),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(h.estado), ''), 'activo')) IN ('activo', 'inactivo')
      THEN lower(COALESCE(NULLIF(btrim(h.estado), ''), 'activo'))
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(h.estado), ''), 'activo')) = 'inactivo' THEN false
    ELSE COALESCE(h.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(h.nombre, '')), ''), 'Horario'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(h.codigo, ''))), ''), format('HOR-%s', upper(left(replace(h.id::text, '-', ''), 8)))),
  metadata = COALESCE(h.metadata, '{}'::jsonb),
  updated_at = now()
WHERE h.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_horarios_trabajo_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.hora_inicio := COALESCE(NEW.hora_inicio, '09:00'::time);
  NEW.hora_fin := COALESCE(NEW.hora_fin, '18:00'::time);
  NEW.dias_semana := CASE WHEN jsonb_typeof(COALESCE(NEW.dias_semana, '[]'::jsonb)) = 'array' THEN COALESCE(NEW.dias_semana, '[]'::jsonb) ELSE '[]'::jsonb END;
  NEW.tolerancia_minutos := GREATEST(COALESCE(NEW.tolerancia_minutos, 0), 0);
  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado NOT IN ('activo', 'inactivo') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Horario');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('HOR-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_horarios_trabajo_row ON public.horarios_trabajo;
CREATE TRIGGER trg_normalize_horarios_trabajo_row
BEFORE INSERT OR UPDATE ON public.horarios_trabajo
FOR EACH ROW
EXECUTE FUNCTION app.normalize_horarios_trabajo_row();

-- ----------------------------------------------------------------------------
-- empleado_beneficios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleado_beneficios
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS beneficio_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.empleado_beneficios
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN id_beneficio TYPE uuid USING app.to_uuid_or_null(COALESCE(id_beneficio::text, '')),
  ALTER COLUMN beneficio_id TYPE uuid USING app.to_uuid_or_null(COALESCE(beneficio_id::text, '')),
  ALTER COLUMN fecha_inicio TYPE date USING app.to_date_or_null(COALESCE(fecha_inicio::text, '')),
  ALTER COLUMN fecha_fin TYPE date USING app.to_date_or_null(COALESCE(fecha_fin::text, '')),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.empleado_beneficios eb
SET
  id_empleado = COALESCE(eb.id_empleado, eb.empleado_id),
  empleado_id = COALESCE(eb.empleado_id, eb.id_empleado),
  id_beneficio = COALESCE(eb.id_beneficio, eb.beneficio_id),
  beneficio_id = COALESCE(eb.beneficio_id, eb.id_beneficio),
  fecha_inicio = COALESCE(eb.fecha_inicio, eb.created_at::date, current_date),
  fecha_fin = CASE
    WHEN eb.fecha_fin IS NULL THEN NULL
    WHEN eb.fecha_inicio IS NULL THEN eb.fecha_fin
    WHEN eb.fecha_fin < eb.fecha_inicio THEN eb.fecha_inicio
    ELSE eb.fecha_fin
  END,
  observaciones = NULLIF(btrim(COALESCE(eb.observaciones, '')), ''),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(eb.estado), ''), 'activo')) IN ('activo', 'inactivo', 'suspendido', 'vencido')
      THEN lower(COALESCE(NULLIF(btrim(eb.estado), ''), 'activo'))
    WHEN lower(COALESCE(NULLIF(btrim(eb.estado), ''), 'activo')) = 'vigente' THEN 'activo'
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(eb.estado), ''), 'activo')) IN ('inactivo', 'suspendido', 'vencido') THEN false
    ELSE COALESCE(eb.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(eb.nombre, '')), ''), 'Beneficio Empleado'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(eb.codigo, ''))), ''), format('BENEMP-%s', upper(left(replace(eb.id::text, '-', ''), 8)))),
  metadata = COALESCE(eb.metadata, '{}'::jsonb),
  updated_at = now()
WHERE eb.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_empleado_beneficios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_fin := app.to_date_or_null(COALESCE(NEW.fecha_fin::text, ''));
  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado = 'vigente' THEN
    NEW.estado := 'activo';
  END IF;
  IF NEW.estado NOT IN ('activo', 'inactivo', 'suspendido', 'vencido') THEN
    NEW.estado := 'activo';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('inactivo', 'suspendido', 'vencido') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Beneficio Empleado');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('BENEMP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_empleado_beneficios_row ON public.empleado_beneficios;
CREATE TRIGGER trg_normalize_empleado_beneficios_row
BEFORE INSERT OR UPDATE ON public.empleado_beneficios
FOR EACH ROW
EXECUTE FUNCTION app.normalize_empleado_beneficios_row();

-- ----------------------------------------------------------------------------
-- empleado_capacitaciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleado_capacitaciones
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS capacitacion_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_completado date,
  ADD COLUMN IF NOT EXISTS calificacion numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certificado_url text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.empleado_capacitaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN id_capacitacion TYPE uuid USING app.to_uuid_or_null(COALESCE(id_capacitacion::text, '')),
  ALTER COLUMN capacitacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(capacitacion_id::text, '')),
  ALTER COLUMN fecha_inscripcion TYPE date USING app.to_date_or_null(COALESCE(fecha_inscripcion::text, '')),
  ALTER COLUMN fecha_completado TYPE date USING app.to_date_or_null(COALESCE(fecha_completado::text, '')),
  ALTER COLUMN calificacion TYPE numeric(5,2) USING app.to_numeric_or_zero(COALESCE(calificacion::text, '0')),
  ALTER COLUMN certificado_url TYPE text USING NULLIF(btrim(COALESCE(certificado_url, '')), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'inscrito')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN calificacion SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.empleado_capacitaciones ec
SET
  id_empleado = COALESCE(ec.id_empleado, ec.empleado_id),
  empleado_id = COALESCE(ec.empleado_id, ec.id_empleado),
  id_capacitacion = COALESCE(ec.id_capacitacion, ec.capacitacion_id),
  capacitacion_id = COALESCE(ec.capacitacion_id, ec.id_capacitacion),
  fecha_inscripcion = COALESCE(ec.fecha_inscripcion, ec.created_at::date, current_date),
  fecha_completado = CASE
    WHEN ec.fecha_completado IS NULL THEN NULL
    WHEN ec.fecha_inscripcion IS NULL THEN ec.fecha_completado
    WHEN ec.fecha_completado < ec.fecha_inscripcion THEN ec.fecha_inscripcion
    ELSE ec.fecha_completado
  END,
  calificacion = LEAST(GREATEST(COALESCE(ec.calificacion, 0), 0), 100),
  certificado_url = NULLIF(btrim(COALESCE(ec.certificado_url, '')), ''),
  observaciones = NULLIF(btrim(COALESCE(ec.observaciones, '')), ''),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(ec.estado), ''), 'inscrito')) IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado')
      THEN lower(COALESCE(NULLIF(btrim(ec.estado), ''), 'inscrito'))
    WHEN lower(COALESCE(NULLIF(btrim(ec.estado), ''), 'inscrito')) = 'activo' THEN 'inscrito'
    WHEN lower(COALESCE(NULLIF(btrim(ec.estado), ''), 'inscrito')) = 'inactivo' THEN 'cancelado'
    ELSE 'inscrito'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(ec.estado), ''), 'inscrito')) IN ('cancelado') THEN false
    ELSE COALESCE(ec.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(ec.nombre, '')), ''), 'Capacitacion Empleado'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(ec.codigo, ''))), ''), format('CAPEMP-%s', upper(left(replace(ec.id::text, '-', ''), 8)))),
  metadata = COALESCE(ec.metadata, '{}'::jsonb),
  updated_at = now()
WHERE ec.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_empleado_capacitaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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
  NEW.fecha_inscripcion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inscripcion::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_completado := app.to_date_or_null(COALESCE(NEW.fecha_completado::text, ''));
  IF NEW.fecha_completado IS NOT NULL AND NEW.fecha_completado < NEW.fecha_inscripcion THEN
    NEW.fecha_completado := NEW.fecha_inscripcion;
  END IF;
  NEW.calificacion := LEAST(GREATEST(COALESCE(NEW.calificacion, 0), 0), 100);
  NEW.certificado_url := NULLIF(btrim(COALESCE(NEW.certificado_url, '')), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'inscrito'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'inscrito';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'cancelado';
  END IF;
  IF NEW.estado NOT IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado') THEN
    NEW.estado := 'inscrito';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'cancelado');
  IF NEW.estado = 'cancelado' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Capacitacion Empleado');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CAPEMP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_empleado_capacitaciones_row ON public.empleado_capacitaciones;
CREATE TRIGGER trg_normalize_empleado_capacitaciones_row
BEFORE INSERT OR UPDATE ON public.empleado_capacitaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_empleado_capacitaciones_row();

-- ----------------------------------------------------------------------------
-- empleado_horarios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleado_horarios
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS horario_id uuid,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.empleado_horarios
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN id_horario TYPE uuid USING app.to_uuid_or_null(COALESCE(id_horario::text, '')),
  ALTER COLUMN horario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(horario_id::text, '')),
  ALTER COLUMN fecha_inicio TYPE date USING app.to_date_or_null(COALESCE(fecha_inicio::text, '')),
  ALTER COLUMN fecha_fin TYPE date USING app.to_date_or_null(COALESCE(fecha_fin::text, '')),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.empleado_horarios eh
SET
  id_empleado = COALESCE(eh.id_empleado, eh.empleado_id),
  empleado_id = COALESCE(eh.empleado_id, eh.id_empleado),
  id_horario = COALESCE(eh.id_horario, eh.horario_id),
  horario_id = COALESCE(eh.horario_id, eh.id_horario),
  fecha_inicio = COALESCE(eh.fecha_inicio, eh.created_at::date, current_date),
  fecha_fin = CASE
    WHEN eh.fecha_fin IS NULL THEN NULL
    WHEN eh.fecha_inicio IS NULL THEN eh.fecha_fin
    WHEN eh.fecha_fin < eh.fecha_inicio THEN eh.fecha_inicio
    ELSE eh.fecha_fin
  END,
  observaciones = NULLIF(btrim(COALESCE(eh.observaciones, '')), ''),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(eh.estado), ''), 'activo')) IN ('activo', 'inactivo', 'suspendido')
      THEN lower(COALESCE(NULLIF(btrim(eh.estado), ''), 'activo'))
    WHEN lower(COALESCE(NULLIF(btrim(eh.estado), ''), 'activo')) = 'vigente' THEN 'activo'
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(eh.estado), ''), 'activo')) IN ('inactivo', 'suspendido') THEN false
    ELSE COALESCE(eh.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(eh.nombre, '')), ''), 'Horario Asignado'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(eh.codigo, ''))), ''), format('HORASIG-%s', upper(left(replace(eh.id::text, '-', ''), 8)))),
  metadata = COALESCE(eh.metadata, '{}'::jsonb),
  updated_at = now()
WHERE eh.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_empleado_horarios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_fin := app.to_date_or_null(COALESCE(NEW.fecha_fin::text, ''));
  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado = 'vigente' THEN
    NEW.estado := 'activo';
  END IF;
  IF NEW.estado NOT IN ('activo', 'inactivo', 'suspendido') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('inactivo', 'suspendido') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Horario Asignado');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('HORASIG-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_empleado_horarios_row ON public.empleado_horarios;
CREATE TRIGGER trg_normalize_empleado_horarios_row
BEFORE INSERT OR UPDATE ON public.empleado_horarios
FOR EACH ROW
EXECUTE FUNCTION app.normalize_empleado_horarios_row();

-- ----------------------------------------------------------------------------
-- expediente_documentos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.expediente_documentos
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS tamanio_bytes bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS verificado_por uuid,
  ADD COLUMN IF NOT EXISTS fecha_verificacion timestamptz;

ALTER TABLE IF EXISTS public.expediente_documentos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN nombre_archivo TYPE text USING NULLIF(btrim(COALESCE(nombre_archivo, '')), ''),
  ALTER COLUMN archivo_url TYPE text USING NULLIF(btrim(COALESCE(archivo_url, '')), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(lower(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN fecha_subida TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_subida::text, '')),
  ALTER COLUMN subido_por TYPE uuid USING app.to_uuid_or_null(COALESCE(subido_por::text, '')),
  ALTER COLUMN mime_type TYPE text USING NULLIF(lower(btrim(COALESCE(mime_type, ''))), ''),
  ALTER COLUMN tamanio_bytes TYPE bigint USING GREATEST(COALESCE(tamanio_bytes, 0), 0),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN verificado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(verificado_por::text, '')),
  ALTER COLUMN fecha_verificacion TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_verificacion::text, '')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.expediente_documentos ed
SET
  id_empleado = COALESCE(ed.id_empleado, ed.empleado_id),
  empleado_id = COALESCE(ed.empleado_id, ed.id_empleado),
  nombre_archivo = COALESCE(NULLIF(btrim(COALESCE(ed.nombre_archivo, '')), ''), format('documento_%s.pdf', upper(left(replace(ed.id::text, '-', ''), 8)))),
  archivo_url = NULLIF(btrim(COALESCE(ed.archivo_url, '')), ''),
  tipo_documento = CASE
    WHEN lower(COALESCE(NULLIF(btrim(ed.tipo_documento), ''), 'otro')) IN ('contrato', 'dni', 'cv', 'certificado', 'licencia', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(ed.tipo_documento), ''), 'otro'))
    ELSE 'otro'
  END,
  fecha_subida = COALESCE(app.to_timestamptz_or_null(COALESCE(ed.fecha_subida::text, '')), ed.created_at, now()),
  mime_type = COALESCE(
    NULLIF(lower(btrim(COALESCE(ed.mime_type, ''))), ''),
    CASE
      WHEN lower(COALESCE(ed.nombre_archivo, '')) LIKE '%.pdf' THEN 'application/pdf'
      WHEN lower(COALESCE(ed.nombre_archivo, '')) LIKE '%.jpg' OR lower(COALESCE(ed.nombre_archivo, '')) LIKE '%.jpeg' THEN 'image/jpeg'
      WHEN lower(COALESCE(ed.nombre_archivo, '')) LIKE '%.png' THEN 'image/png'
      ELSE 'application/octet-stream'
    END
  ),
  tamanio_bytes = GREATEST(COALESCE(ed.tamanio_bytes, 0), 0),
  descripcion = NULLIF(btrim(COALESCE(ed.descripcion, '')), ''),
  verificado_por = app.to_uuid_or_null(COALESCE(ed.verificado_por::text, '')),
  fecha_verificacion = CASE
    WHEN app.to_timestamptz_or_null(COALESCE(ed.fecha_verificacion::text, '')) IS NULL THEN NULL
    WHEN app.to_timestamptz_or_null(COALESCE(ed.fecha_verificacion::text, '')) < COALESCE(app.to_timestamptz_or_null(COALESCE(ed.fecha_subida::text, '')), ed.created_at, now())
      THEN COALESCE(app.to_timestamptz_or_null(COALESCE(ed.fecha_subida::text, '')), ed.created_at, now())
    ELSE app.to_timestamptz_or_null(COALESCE(ed.fecha_verificacion::text, ''))
  END,
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(ed.estado), ''), 'activo')) IN ('activo', 'archivado', 'eliminado')
      THEN lower(COALESCE(NULLIF(btrim(ed.estado), ''), 'activo'))
    WHEN lower(COALESCE(NULLIF(btrim(ed.estado), ''), 'activo')) = 'inactivo' THEN 'archivado'
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(ed.estado), ''), 'activo')) IN ('archivado', 'eliminado', 'inactivo') THEN false
    ELSE COALESCE(ed.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(ed.nombre, '')), ''), 'Documento Expediente'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(ed.codigo, ''))), ''), format('EXPDOC-%s', upper(left(replace(ed.id::text, '-', ''), 8)))),
  metadata = COALESCE(ed.metadata, '{}'::jsonb),
  updated_at = now()
WHERE ed.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_expediente_documentos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.subido_por := app.to_uuid_or_null(COALESCE(NEW.subido_por::text, ''));
  NEW.verificado_por := app.to_uuid_or_null(COALESCE(NEW.verificado_por::text, ''));

  NEW.nombre_archivo := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre_archivo, '')), ''), format('documento_%s.pdf', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.archivo_url := NULLIF(btrim(COALESCE(NEW.archivo_url, '')), '');
  NEW.tipo_documento := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'otro'));
  IF NEW.tipo_documento NOT IN ('contrato', 'dni', 'cv', 'certificado', 'licencia', 'otro') THEN
    NEW.tipo_documento := 'otro';
  END IF;

  NEW.fecha_subida := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_subida::text, '')), NEW.created_at, now());
  NEW.fecha_verificacion := app.to_timestamptz_or_null(COALESCE(NEW.fecha_verificacion::text, ''));
  IF NEW.fecha_verificacion IS NOT NULL AND NEW.fecha_verificacion < NEW.fecha_subida THEN
    NEW.fecha_verificacion := NEW.fecha_subida;
  END IF;

  NEW.mime_type := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.mime_type, ''))), ''),
    CASE
      WHEN lower(NEW.nombre_archivo) LIKE '%.pdf' THEN 'application/pdf'
      WHEN lower(NEW.nombre_archivo) LIKE '%.jpg' OR lower(NEW.nombre_archivo) LIKE '%.jpeg' THEN 'image/jpeg'
      WHEN lower(NEW.nombre_archivo) LIKE '%.png' THEN 'image/png'
      ELSE 'application/octet-stream'
    END
  );
  NEW.tamanio_bytes := GREATEST(COALESCE(NEW.tamanio_bytes, 0), 0);
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado = 'inactivo' THEN
    NEW.estado := 'archivado';
  END IF;
  IF NEW.estado NOT IN ('activo', 'archivado', 'eliminado') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('archivado', 'eliminado') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Documento Expediente');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('EXPDOC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_expediente_documentos_row ON public.expediente_documentos;
CREATE TRIGGER trg_normalize_expediente_documentos_row
BEFORE INSERT OR UPDATE ON public.expediente_documentos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_expediente_documentos_row();

-- ----------------------------------------------------------------------------
-- liquidaciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.liquidaciones
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_calculo timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS pagado_por uuid,
  ADD COLUMN IF NOT EXISTS fecha_pago timestamptz,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.liquidaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN fecha_terminacion TYPE date USING app.to_date_or_null(COALESCE(fecha_terminacion::text, '')),
  ALTER COLUMN ultimo_dia_trabajado TYPE date USING app.to_date_or_null(COALESCE(ultimo_dia_trabajado::text, '')),
  ALTER COLUMN fecha_calculo TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_calculo::text, '')),
  ALTER COLUMN aprobado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(aprobado_por::text, '')),
  ALTER COLUMN pagado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(pagado_por::text, '')),
  ALTER COLUMN fecha_pago TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_pago::text, '')),
  ALTER COLUMN motivo_terminacion TYPE text USING NULLIF(lower(btrim(COALESCE(motivo_terminacion, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(lower(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN monto_cts TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(monto_cts::text, '0')),
  ALTER COLUMN vacaciones_pendientes TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(vacaciones_pendientes::text, '0')),
  ALTER COLUMN indemnizacion TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(indemnizacion::text, '0')),
  ALTER COLUMN dias_cts TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(dias_cts::text, '0')), 0),
  ALTER COLUMN total_liquidacion TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(total_liquidacion::text, '0')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'calculada')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN monto_cts SET DEFAULT 0,
  ALTER COLUMN vacaciones_pendientes SET DEFAULT 0,
  ALTER COLUMN indemnizacion SET DEFAULT 0,
  ALTER COLUMN dias_cts SET DEFAULT 0,
  ALTER COLUMN total_liquidacion SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.liquidaciones l
SET
  id_empleado = COALESCE(l.id_empleado, l.empleado_id),
  empleado_id = COALESCE(l.empleado_id, l.id_empleado),
  fecha_terminacion = COALESCE(l.fecha_terminacion, l.created_at::date, current_date),
  ultimo_dia_trabajado = COALESCE(l.ultimo_dia_trabajado, l.fecha_terminacion, l.created_at::date, current_date),
  fecha_calculo = COALESCE(app.to_timestamptz_or_null(COALESCE(l.fecha_calculo::text, '')), l.created_at, now()),
  aprobado_por = app.to_uuid_or_null(COALESCE(l.aprobado_por::text, '')),
  pagado_por = app.to_uuid_or_null(COALESCE(l.pagado_por::text, '')),
  fecha_pago = app.to_timestamptz_or_null(COALESCE(l.fecha_pago::text, '')),
  motivo_terminacion = CASE
    WHEN lower(COALESCE(NULLIF(btrim(l.motivo_terminacion), ''), 'otro')) IN ('renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo', 'abandono', 'fallecimiento', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(l.motivo_terminacion), ''), 'otro'))
    ELSE 'otro'
  END,
  metodo_pago = CASE
    WHEN lower(COALESCE(NULLIF(btrim(l.metodo_pago), ''), 'transferencia')) IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(l.metodo_pago), ''), 'transferencia'))
    ELSE 'otro'
  END,
  observaciones = NULLIF(btrim(COALESCE(l.observaciones, '')), ''),
  monto_cts = GREATEST(COALESCE(l.monto_cts, 0), 0),
  vacaciones_pendientes = GREATEST(COALESCE(l.vacaciones_pendientes, 0), 0),
  indemnizacion = GREATEST(COALESCE(l.indemnizacion, 0), 0),
  dias_cts = GREATEST(COALESCE(l.dias_cts, 0), 0),
  total_liquidacion = GREATEST(COALESCE(l.total_liquidacion, 0), GREATEST(COALESCE(l.monto_cts, 0), 0) + GREATEST(COALESCE(l.indemnizacion, 0), 0)),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(l.estado), ''), 'calculada')) IN ('calculada', 'aprobada', 'pagada', 'anulada')
      THEN lower(COALESCE(NULLIF(btrim(l.estado), ''), 'calculada'))
    WHEN lower(COALESCE(NULLIF(btrim(l.estado), ''), 'calculada')) = 'activo' THEN 'calculada'
    WHEN lower(COALESCE(NULLIF(btrim(l.estado), ''), 'calculada')) = 'inactivo' THEN 'anulada'
    ELSE 'calculada'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(l.estado), ''), 'calculada')) IN ('anulada', 'inactivo') THEN false
    ELSE COALESCE(l.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(l.nombre, '')), ''), 'Liquidacion'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(l.codigo, ''))), ''), format('LIQ-%s', upper(left(replace(l.id::text, '-', ''), 8)))),
  metadata = COALESCE(l.metadata, '{}'::jsonb),
  updated_at = now()
WHERE l.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_liquidaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));
  NEW.pagado_por := app.to_uuid_or_null(COALESCE(NEW.pagado_por::text, ''));

  NEW.fecha_terminacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_terminacion::text, '')), NEW.created_at::date, current_date);
  NEW.ultimo_dia_trabajado := COALESCE(app.to_date_or_null(COALESCE(NEW.ultimo_dia_trabajado::text, '')), NEW.fecha_terminacion);
  IF NEW.ultimo_dia_trabajado > NEW.fecha_terminacion THEN
    NEW.ultimo_dia_trabajado := NEW.fecha_terminacion;
  END IF;
  NEW.fecha_calculo := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_calculo::text, '')), NEW.created_at, now());
  NEW.fecha_pago := app.to_timestamptz_or_null(COALESCE(NEW.fecha_pago::text, ''));

  NEW.motivo_terminacion := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.motivo_terminacion, '')), ''), 'otro'));
  IF NEW.motivo_terminacion NOT IN ('renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo', 'abandono', 'fallecimiento', 'otro') THEN
    NEW.motivo_terminacion := 'otro';
  END IF;

  NEW.metodo_pago := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'transferencia'));
  IF NEW.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro') THEN
    NEW.metodo_pago := 'otro';
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.monto_cts := GREATEST(COALESCE(NEW.monto_cts, 0), 0);
  NEW.vacaciones_pendientes := GREATEST(COALESCE(NEW.vacaciones_pendientes, 0), 0);
  NEW.indemnizacion := GREATEST(COALESCE(NEW.indemnizacion, 0), 0);
  NEW.dias_cts := GREATEST(COALESCE(NEW.dias_cts, 0), 0);
  NEW.total_liquidacion := GREATEST(COALESCE(NEW.total_liquidacion, 0), NEW.monto_cts + NEW.indemnizacion);

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'calculada'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'calculada';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'anulada';
  END IF;
  IF NEW.estado NOT IN ('calculada', 'aprobada', 'pagada', 'anulada') THEN
    NEW.estado := 'calculada';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'anulada');
  IF NEW.estado = 'anulada' THEN
    NEW.activo := false;
  END IF;
  IF NEW.estado = 'pagada' AND NEW.fecha_pago IS NULL THEN
    NEW.fecha_pago := now();
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Liquidacion');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('LIQ-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_liquidaciones_row ON public.liquidaciones;
CREATE TRIGGER trg_normalize_liquidaciones_row
BEFORE INSERT OR UPDATE ON public.liquidaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_liquidaciones_row();

-- ----------------------------------------------------------------------------
-- historial_pagos_planilla
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.historial_pagos_planilla
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS procesado_por uuid,
  ADD COLUMN IF NOT EXISTS fecha_registro timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

DROP TRIGGER IF EXISTS trg_enforce_tenant_historial_pagos_planilla ON public.historial_pagos_planilla;

ALTER TABLE IF EXISTS public.historial_pagos_planilla
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN planilla_id TYPE uuid USING app.to_uuid_or_null(COALESCE(planilla_id::text, '')),
  ALTER COLUMN fecha TYPE date USING app.to_date_or_null(COALESCE(fecha::text, '')),
  ALTER COLUMN metodo TYPE text USING NULLIF(lower(btrim(COALESCE(metodo, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(lower(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(monto::text, '0')),
  ALTER COLUMN empleados_count TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(empleados_count::text, '0')), 0),
  ALTER COLUMN numero_operacion TYPE text USING NULLIF(upper(btrim(COALESCE(numero_operacion, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN procesado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(procesado_por::text, '')),
  ALTER COLUMN fecha_registro TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_registro::text, '')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'registrado')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN empleados_count SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.historial_pagos_planilla hpp
SET
  planilla_id = app.to_uuid_or_null(COALESCE(hpp.planilla_id::text, '')),
  fecha = COALESCE(hpp.fecha, hpp.created_at::date, current_date),
  metodo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(COALESCE(hpp.metodo, hpp.metodo_pago)), ''), 'transferencia')) IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(COALESCE(hpp.metodo, hpp.metodo_pago)), ''), 'transferencia'))
    ELSE 'otro'
  END,
  metodo_pago = CASE
    WHEN lower(COALESCE(NULLIF(btrim(COALESCE(hpp.metodo_pago, hpp.metodo)), ''), 'transferencia')) IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(COALESCE(hpp.metodo_pago, hpp.metodo)), ''), 'transferencia'))
    ELSE 'otro'
  END,
  monto = GREATEST(COALESCE(hpp.monto, 0), 0),
  empleados_count = GREATEST(COALESCE(hpp.empleados_count, 0), 0),
  numero_operacion = NULLIF(upper(btrim(COALESCE(hpp.numero_operacion, ''))), ''),
  observaciones = NULLIF(btrim(COALESCE(hpp.observaciones, '')), ''),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(hpp.moneda, ''))), ''), 'PEN'),
  procesado_por = app.to_uuid_or_null(COALESCE(hpp.procesado_por::text, '')),
  fecha_registro = COALESCE(app.to_timestamptz_or_null(COALESCE(hpp.fecha_registro::text, '')), hpp.created_at, now()),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(hpp.estado), ''), 'registrado')) IN ('registrado', 'anulado', 'conciliado')
      THEN lower(COALESCE(NULLIF(btrim(hpp.estado), ''), 'registrado'))
    WHEN lower(COALESCE(NULLIF(btrim(hpp.estado), ''), 'registrado')) = 'activo' THEN 'registrado'
    WHEN lower(COALESCE(NULLIF(btrim(hpp.estado), ''), 'registrado')) = 'inactivo' THEN 'anulado'
    ELSE 'registrado'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(hpp.estado), ''), 'registrado')) IN ('anulado', 'inactivo') THEN false
    ELSE COALESCE(hpp.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(hpp.nombre, '')), ''), 'Historial Pago Planilla'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(hpp.codigo, ''))), ''), format('HPP-%s', upper(left(replace(hpp.id::text, '-', ''), 8)))),
  metadata = COALESCE(hpp.metadata, '{}'::jsonb),
  updated_at = now()
WHERE hpp.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_historial_pagos_planilla_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.planilla_id := app.to_uuid_or_null(COALESCE(NEW.planilla_id::text, ''));
  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), NEW.created_at::date, current_date);

  NEW.metodo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo, NEW.metodo_pago)), ''), 'transferencia'));
  IF NEW.metodo NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro') THEN
    NEW.metodo := 'otro';
  END IF;
  NEW.metodo_pago := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, NEW.metodo)), ''), NEW.metodo));
  IF NEW.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro') THEN
    NEW.metodo_pago := NEW.metodo;
  END IF;

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.empleados_count := GREATEST(COALESCE(NEW.empleados_count, 0), 0);
  NEW.numero_operacion := NULLIF(upper(btrim(COALESCE(NEW.numero_operacion, ''))), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.procesado_por := app.to_uuid_or_null(COALESCE(NEW.procesado_por::text, ''));
  NEW.fecha_registro := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_registro::text, '')), NEW.created_at, now());

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'registrado'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'registrado';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'anulado';
  END IF;
  IF NEW.estado NOT IN ('registrado', 'anulado', 'conciliado') THEN
    NEW.estado := 'registrado';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'anulado');
  IF NEW.estado = 'anulado' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Historial Pago Planilla');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('HPP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_historial_pagos_planilla_row ON public.historial_pagos_planilla;
CREATE TRIGGER trg_normalize_historial_pagos_planilla_row
BEFORE INSERT OR UPDATE ON public.historial_pagos_planilla
FOR EACH ROW
EXECUTE FUNCTION app.normalize_historial_pagos_planilla_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo de timestamps.
-- ----------------------------------------------------------------------------
UPDATE public.beneficios
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.capacitaciones
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.horarios_trabajo
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.empleado_beneficios
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.empleado_capacitaciones
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.empleado_horarios
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.expediente_documentos
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.liquidaciones
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.historial_pagos_planilla
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Indices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_beneficios_tenant_estado_nombre_runtime
ON public.beneficios (tenant_id, estado, nombre, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beneficios_tenant_tipo_runtime
ON public.beneficios (tenant_id, tipo, created_at DESC)
WHERE tipo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capacitaciones_tenant_estado_fecha_inicio_runtime
ON public.capacitaciones (tenant_id, estado, fecha_inicio DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capacitaciones_tenant_instructor_fecha_runtime
ON public.capacitaciones (tenant_id, instructor, fecha_inicio DESC)
WHERE instructor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_horarios_trabajo_tenant_estado_nombre_runtime
ON public.horarios_trabajo (tenant_id, estado, nombre, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_horarios_trabajo_tenant_horas_runtime
ON public.horarios_trabajo (tenant_id, hora_inicio, hora_fin);

CREATE INDEX IF NOT EXISTS idx_empleado_beneficios_tenant_empleado_estado_fecha_runtime
ON public.empleado_beneficios (tenant_id, id_empleado, estado, fecha_inicio DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_beneficios_tenant_beneficio_estado_fecha_runtime
ON public.empleado_beneficios (tenant_id, id_beneficio, estado, fecha_inicio DESC, created_at DESC)
WHERE id_beneficio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_capacitaciones_tenant_empleado_estado_fecha_runtime
ON public.empleado_capacitaciones (tenant_id, id_empleado, estado, fecha_inscripcion DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_capacitaciones_tenant_capacitacion_estado_fecha_runtime
ON public.empleado_capacitaciones (tenant_id, id_capacitacion, estado, fecha_inscripcion DESC, created_at DESC)
WHERE id_capacitacion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_horarios_tenant_empleado_activo_fecha_runtime
ON public.empleado_horarios (tenant_id, id_empleado, activo, fecha_inicio DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empleado_horarios_tenant_horario_activo_fecha_runtime
ON public.empleado_horarios (tenant_id, id_horario, activo, fecha_inicio DESC, created_at DESC)
WHERE id_horario IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expediente_documentos_tenant_empleado_fecha_runtime
ON public.expediente_documentos (tenant_id, id_empleado, fecha_subida DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expediente_documentos_tenant_tipo_fecha_runtime
ON public.expediente_documentos (tenant_id, tipo_documento, fecha_subida DESC, created_at DESC)
WHERE tipo_documento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidaciones_tenant_empleado_fecha_runtime
ON public.liquidaciones (tenant_id, id_empleado, fecha_terminacion DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidaciones_tenant_estado_fecha_runtime
ON public.liquidaciones (tenant_id, estado, fecha_terminacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_tenant_planilla_fecha_runtime
ON public.historial_pagos_planilla (tenant_id, planilla_id, fecha DESC, created_at DESC)
WHERE planilla_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_tenant_metodo_fecha_runtime
ON public.historial_pagos_planilla (tenant_id, metodo, fecha DESC, created_at DESC);

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
