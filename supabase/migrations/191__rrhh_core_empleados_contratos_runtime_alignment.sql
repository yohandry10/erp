-- ============================================================================
-- 191__rrhh_core_empleados_contratos_runtime_alignment.sql
-- Alineacion runtime para RRHH core:
-- departamentos, empleados y contratos.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON public.departamentos;
DROP POLICY IF EXISTS tenant_isolation ON public.empleados;
DROP POLICY IF EXISTS tenant_isolation ON public.contratos;

-- ----------------------------------------------------------------------------
-- departamentos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.departamentos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS responsable_id uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.departamentos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN responsable_id TYPE uuid USING app.to_uuid_or_null(COALESCE(responsable_id::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.departamentos d
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(d.nombre, '')), ''), 'Departamento'),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(d.descripcion, '')), ''), NULLIF(btrim(COALESCE(d.nombre, '')), ''), 'Departamento'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(d.codigo, ''))), ''), format('DEP-%s', upper(left(replace(d.id::text, '-', ''), 8)))),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(d.estado), ''), 'activo')) IN ('activo', 'inactivo')
      THEN lower(COALESCE(NULLIF(btrim(d.estado), ''), 'activo'))
    WHEN lower(COALESCE(NULLIF(btrim(d.estado), ''), 'activo')) IN ('activa', 'vigente')
      THEN 'activo'
    WHEN lower(COALESCE(NULLIF(btrim(d.estado), ''), 'activo')) IN ('inactiva', 'baja', 'cesado')
      THEN 'inactivo'
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(d.estado), ''), 'activo')) IN ('inactivo', 'inactiva', 'baja', 'cesado')
      THEN false
    ELSE COALESCE(d.activo, true)
  END,
  metadata = COALESCE(d.metadata, '{}'::jsonb),
  updated_at = now()
WHERE d.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_departamentos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.responsable_id := app.to_uuid_or_null(COALESCE(NEW.responsable_id::text, ''));

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Departamento');
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), NEW.nombre);
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('DEP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF v_estado IN ('activa', 'vigente') THEN
    v_estado := 'activo';
  ELSIF v_estado IN ('inactiva', 'baja', 'cesado') THEN
    v_estado := 'inactivo';
  END IF;
  IF v_estado NOT IN ('activo', 'inactivo') THEN
    v_estado := 'activo';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, v_estado = 'activo');
  IF NEW.estado = 'inactivo' THEN
    NEW.activo := false;
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_departamentos_row ON public.departamentos;
CREATE TRIGGER trg_normalize_departamentos_row
BEFORE INSERT OR UPDATE ON public.departamentos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_departamentos_row();

-- ----------------------------------------------------------------------------
-- empleados
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleados
  ADD COLUMN IF NOT EXISTS departamento_id uuid,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS genero text,
  ADD COLUMN IF NOT EXISTS estado_civil text,
  ADD COLUMN IF NOT EXISTS nacionalidad text,
  ADD COLUMN IF NOT EXISTS ubigeo text,
  ADD COLUMN IF NOT EXISTS tiene_hijos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cantidad_hijos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asignacion_familiar boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS tipo_cuenta text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia text,
  ADD COLUMN IF NOT EXISTS telefono_emergencia text,
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS familiares jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.empleados
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_departamento TYPE uuid USING app.to_uuid_or_null(COALESCE(id_departamento::text, '')),
  ALTER COLUMN departamento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(departamento_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(upper(btrim(COALESCE(numero_documento::text, ''))), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN email TYPE text USING NULLIF(lower(btrim(COALESCE(email, ''))), ''),
  ALTER COLUMN telefono TYPE text USING NULLIF(btrim(COALESCE(telefono, '')), ''),
  ALTER COLUMN direccion TYPE text USING NULLIF(btrim(COALESCE(direccion, '')), ''),
  ALTER COLUMN fecha_nacimiento TYPE date USING app.to_date_or_null(COALESCE(fecha_nacimiento::text, '')),
  ALTER COLUMN fecha_ingreso TYPE date USING app.to_date_or_null(COALESCE(fecha_ingreso::text, '')),
  ALTER COLUMN genero TYPE text USING NULLIF(lower(btrim(COALESCE(genero, ''))), ''),
  ALTER COLUMN estado_civil TYPE text USING NULLIF(lower(btrim(COALESCE(estado_civil, ''))), ''),
  ALTER COLUMN nacionalidad TYPE text USING NULLIF(upper(btrim(COALESCE(nacionalidad, ''))), ''),
  ALTER COLUMN ubigeo TYPE text USING NULLIF(upper(btrim(COALESCE(ubigeo, ''))), ''),
  ALTER COLUMN cuenta_bancaria TYPE text USING NULLIF(btrim(COALESCE(cuenta_bancaria, '')), ''),
  ALTER COLUMN banco TYPE text USING NULLIF(btrim(COALESCE(banco, '')), ''),
  ALTER COLUMN tipo_cuenta TYPE text USING NULLIF(lower(btrim(COALESCE(tipo_cuenta, ''))), ''),
  ALTER COLUMN contacto_emergencia TYPE text USING NULLIF(btrim(COALESCE(contacto_emergencia, '')), ''),
  ALTER COLUMN telefono_emergencia TYPE text USING NULLIF(btrim(COALESCE(telefono_emergencia, '')), ''),
  ALTER COLUMN foto_url TYPE text USING NULLIF(btrim(COALESCE(foto_url, '')), ''),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activo')),
  ALTER COLUMN cantidad_hijos TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(cantidad_hijos::text, '0')), 0),
  ALTER COLUMN tiene_hijos SET DEFAULT false,
  ALTER COLUMN cantidad_hijos SET DEFAULT 0,
  ALTER COLUMN asignacion_familiar SET DEFAULT false,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.empleados
  ALTER COLUMN familiares TYPE jsonb
  USING CASE
    WHEN familiares IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(familiares) = 'array' THEN familiares
    ELSE '[]'::jsonb
  END;

ALTER TABLE IF EXISTS public.empleados
  ALTER COLUMN familiares SET DEFAULT '[]'::jsonb;

UPDATE public.empleados e
SET
  id_empleado = COALESCE(e.id_empleado, e.empleado_id, e.id),
  empleado_id = COALESCE(e.empleado_id, e.id_empleado, e.id),
  id_departamento = COALESCE(e.id_departamento, e.departamento_id),
  departamento_id = COALESCE(e.departamento_id, e.id_departamento),
  nombres = COALESCE(NULLIF(btrim(COALESCE(e.nombres, '')), ''), NULLIF(btrim(COALESCE(e.nombre, '')), ''), 'NOMBRE'),
  apellidos = COALESCE(NULLIF(btrim(COALESCE(e.apellidos, '')), ''), 'APELLIDO'),
  tipo_documento = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.tipo_documento), ''), 'DNI')) IN ('DNI', 'CE', 'PASAPORTE', 'RUC', 'OTRO')
      THEN upper(COALESCE(NULLIF(btrim(e.tipo_documento), ''), 'DNI'))
    WHEN upper(COALESCE(NULLIF(btrim(e.tipo_documento), ''), 'DNI')) IN ('CARNET EXTRANJERIA', 'CARNET_DE_EXTRANJERIA', 'CARNET DE EXTRANJERIA')
      THEN 'CE'
    ELSE 'OTRO'
  END,
  numero_documento = COALESCE(NULLIF(upper(btrim(COALESCE(e.numero_documento, ''))), ''), format('DOC-%s', upper(left(replace(e.id::text, '-', ''), 8)))),
  email = NULLIF(lower(btrim(COALESCE(e.email, ''))), ''),
  telefono = NULLIF(btrim(COALESCE(e.telefono, '')), ''),
  direccion = NULLIF(btrim(COALESCE(e.direccion, '')), ''),
  fecha_nacimiento = COALESCE(e.fecha_nacimiento, app.to_date_or_null(COALESCE(e.fecha::text, ''))),
  fecha_ingreso = COALESCE(e.fecha_ingreso, e.created_at::date, current_date),
  puesto = COALESCE(NULLIF(btrim(COALESCE(e.puesto, '')), ''), 'Colaborador'),
  genero = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.genero), ''), '')) IN ('masculino', 'femenino', 'otro', 'no_binario')
      THEN lower(COALESCE(NULLIF(btrim(e.genero), ''), ''))
    ELSE NULL
  END,
  estado_civil = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.estado_civil), ''), '')) IN ('soltero', 'casado', 'conviviente', 'divorciado', 'viudo')
      THEN lower(COALESCE(NULLIF(btrim(e.estado_civil), ''), ''))
    ELSE NULL
  END,
  nacionalidad = COALESCE(NULLIF(upper(btrim(COALESCE(e.nacionalidad, ''))), ''), NULLIF(upper(btrim(COALESCE(e.pais, ''))), ''), 'PE'),
  ubigeo = NULLIF(upper(btrim(COALESCE(e.ubigeo, ''))), ''),
  tiene_hijos = COALESCE(e.tiene_hijos, COALESCE(e.cantidad_hijos, 0) > 0),
  cantidad_hijos = GREATEST(COALESCE(e.cantidad_hijos, 0), 0),
  asignacion_familiar = COALESCE(e.asignacion_familiar, COALESCE(e.cantidad_hijos, 0) > 0),
  cuenta_bancaria = NULLIF(btrim(COALESCE(e.cuenta_bancaria, '')), ''),
  banco = NULLIF(btrim(COALESCE(e.banco, '')), ''),
  tipo_cuenta = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.tipo_cuenta), ''), '')) IN ('ahorros', 'corriente', 'cts', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(e.tipo_cuenta), ''), ''))
    ELSE NULL
  END,
  contacto_emergencia = NULLIF(btrim(COALESCE(e.contacto_emergencia, '')), ''),
  telefono_emergencia = NULLIF(btrim(COALESCE(e.telefono_emergencia, '')), ''),
  foto_url = NULLIF(btrim(COALESCE(e.foto_url, '')), ''),
  departamento = NULLIF(btrim(COALESCE(e.departamento, '')), ''),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'activo')) IN ('activo', 'inactivo', 'suspendido', 'cesado')
      THEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'activo'))
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'activo')) IN ('activa', 'vigente')
      THEN 'activo'
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'activo')) IN ('baja', 'retirado', 'terminado', 'finalizado')
      THEN 'cesado'
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'activo')) IN ('inactiva')
      THEN 'inactivo'
    ELSE 'activo'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'activo')) IN ('inactivo', 'inactiva', 'cesado', 'baja', 'retirado', 'terminado', 'finalizado')
      THEN false
    ELSE COALESCE(e.activo, true)
  END,
  familiares = CASE
    WHEN e.familiares IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(e.familiares) = 'array' THEN e.familiares
    ELSE '[]'::jsonb
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(e.nombre, '')), ''), concat_ws(' ', COALESCE(NULLIF(btrim(COALESCE(e.nombres, '')), ''), 'NOMBRE'), COALESCE(NULLIF(btrim(COALESCE(e.apellidos, '')), ''), 'APELLIDO'))),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(e.codigo, ''))), ''), format('EMP-%s', upper(left(replace(e.id::text, '-', ''), 8)))),
  metadata = COALESCE(e.metadata, '{}'::jsonb),
  updated_at = now()
WHERE e.id IS NOT NULL;

UPDATE public.empleados e
SET
  departamento = COALESCE(NULLIF(btrim(COALESCE(e.departamento, '')), ''), d.nombre),
  updated_at = now()
FROM public.departamentos d
WHERE d.id = COALESCE(e.id_departamento, e.departamento_id);

UPDATE public.empleados e
SET
  id_departamento = d.id,
  departamento_id = d.id,
  departamento = COALESCE(NULLIF(btrim(COALESCE(e.departamento, '')), ''), d.nombre),
  updated_at = now()
FROM public.departamentos d
WHERE COALESCE(e.id_departamento, e.departamento_id) IS NULL
  AND NULLIF(lower(btrim(COALESCE(e.departamento, ''))), '') = lower(btrim(d.nombre))
  AND (d.tenant_id IS NULL OR e.tenant_id IS NULL OR d.tenant_id = e.tenant_id);

CREATE OR REPLACE FUNCTION app.normalize_empleados_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
  v_tipo_doc text;
  v_departamento text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_departamento := app.to_uuid_or_null(COALESCE(NEW.id_departamento::text, NEW.departamento_id::text, ''));
  NEW.departamento_id := NEW.id_departamento;
  NEW.id_empleado := COALESCE(app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')), app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, '')), NEW.id);
  NEW.empleado_id := NEW.id_empleado;

  NEW.nombres := COALESCE(NULLIF(btrim(COALESCE(NEW.nombres, '')), ''), NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'NOMBRE');
  NEW.apellidos := COALESCE(NULLIF(btrim(COALESCE(NEW.apellidos, '')), ''), 'APELLIDO');

  v_tipo_doc := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'DNI'));
  IF v_tipo_doc IN ('CARNET EXTRANJERIA', 'CARNET_DE_EXTRANJERIA', 'CARNET DE EXTRANJERIA') THEN
    v_tipo_doc := 'CE';
  END IF;
  IF v_tipo_doc NOT IN ('DNI', 'CE', 'PASAPORTE', 'RUC', 'OTRO') THEN
    v_tipo_doc := 'OTRO';
  END IF;
  NEW.tipo_documento := v_tipo_doc;

  NEW.numero_documento := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero_documento, ''))), ''), format('DOC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.telefono := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');
  NEW.direccion := NULLIF(btrim(COALESCE(NEW.direccion, '')), '');
  NEW.fecha_nacimiento := app.to_date_or_null(COALESCE(NEW.fecha_nacimiento::text, ''));
  NEW.fecha_ingreso := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_ingreso::text, '')), NEW.created_at::date, current_date);
  NEW.puesto := COALESCE(NULLIF(btrim(COALESCE(NEW.puesto, '')), ''), 'Colaborador');
  NEW.genero := NULLIF(lower(btrim(COALESCE(NEW.genero, ''))), '');
  NEW.estado_civil := NULLIF(lower(btrim(COALESCE(NEW.estado_civil, ''))), '');
  NEW.nacionalidad := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.nacionalidad, ''))), ''), 'PE');
  NEW.ubigeo := NULLIF(upper(btrim(COALESCE(NEW.ubigeo, ''))), '');

  NEW.cantidad_hijos := GREATEST(COALESCE(NEW.cantidad_hijos, 0), 0);
  NEW.tiene_hijos := COALESCE(NEW.tiene_hijos, NEW.cantidad_hijos > 0);
  IF NEW.tiene_hijos = false THEN
    NEW.cantidad_hijos := 0;
  END IF;
  NEW.asignacion_familiar := COALESCE(NEW.asignacion_familiar, NEW.cantidad_hijos > 0);

  NEW.cuenta_bancaria := NULLIF(btrim(COALESCE(NEW.cuenta_bancaria, '')), '');
  NEW.banco := NULLIF(btrim(COALESCE(NEW.banco, '')), '');
  NEW.tipo_cuenta := NULLIF(lower(btrim(COALESCE(NEW.tipo_cuenta, ''))), '');
  NEW.contacto_emergencia := NULLIF(btrim(COALESCE(NEW.contacto_emergencia, '')), '');
  NEW.telefono_emergencia := NULLIF(btrim(COALESCE(NEW.telefono_emergencia, '')), '');
  NEW.foto_url := NULLIF(btrim(COALESCE(NEW.foto_url, '')), '');
  NEW.departamento := NULLIF(btrim(COALESCE(NEW.departamento, '')), '');

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF v_estado IN ('activa', 'vigente') THEN
    v_estado := 'activo';
  ELSIF v_estado IN ('inactiva') THEN
    v_estado := 'inactivo';
  ELSIF v_estado IN ('baja', 'retirado', 'terminado', 'finalizado') THEN
    v_estado := 'cesado';
  END IF;
  IF v_estado NOT IN ('activo', 'inactivo', 'suspendido', 'cesado') THEN
    v_estado := 'activo';
  END IF;
  NEW.estado := v_estado;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('inactivo', 'cesado') THEN
    NEW.activo := false;
  END IF;

  NEW.familiares := COALESCE(NEW.familiares, '[]'::jsonb);
  IF jsonb_typeof(NEW.familiares) <> 'array' THEN
    NEW.familiares := '[]'::jsonb;
  END IF;

  IF NEW.departamento IS NULL AND NEW.id_departamento IS NOT NULL THEN
    SELECT d.nombre INTO v_departamento
    FROM public.departamentos d
    WHERE d.id = NEW.id_departamento;
    NEW.departamento := v_departamento;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), concat_ws(' ', NEW.nombres, NEW.apellidos));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('EMP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_empleados_row ON public.empleados;
CREATE TRIGGER trg_normalize_empleados_row
BEFORE INSERT OR UPDATE ON public.empleados
FOR EACH ROW
EXECUTE FUNCTION app.normalize_empleados_row();

-- ----------------------------------------------------------------------------
-- contratos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.contratos
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_contrato text,
  ADD COLUMN IF NOT EXISTS sueldo_bruto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS beneficios text,
  ADD COLUMN IF NOT EXISTS regimen_pensionario text,
  ADD COLUMN IF NOT EXISTS jornada_laboral text,
  ADD COLUMN IF NOT EXISTS periodo_prueba_meses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_firma date,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.contratos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN fecha_inicio TYPE date USING app.to_date_or_null(COALESCE(fecha_inicio::text, '')),
  ALTER COLUMN fecha_fin TYPE date USING app.to_date_or_null(COALESCE(fecha_fin::text, '')),
  ALTER COLUMN fecha_firma TYPE date USING app.to_date_or_null(COALESCE(fecha_firma::text, '')),
  ALTER COLUMN tipo_contrato TYPE text USING NULLIF(lower(replace(btrim(COALESCE(tipo_contrato, '')), ' ', '_')), ''),
  ALTER COLUMN sueldo_bruto TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(sueldo_bruto::text, '0')), 0),
  ALTER COLUMN salario TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(salario::text, '0')), 0),
  ALTER COLUMN moneda TYPE text USING COALESCE(NULLIF(upper(btrim(COALESCE(moneda, ''))), ''), 'PEN'),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'vigente')),
  ALTER COLUMN beneficios TYPE text USING NULLIF(btrim(COALESCE(beneficios, '')), ''),
  ALTER COLUMN regimen_pensionario TYPE text USING COALESCE(NULLIF(upper(btrim(COALESCE(regimen_pensionario, ''))), ''), 'AFP'),
  ALTER COLUMN jornada_laboral TYPE text USING NULLIF(lower(replace(btrim(COALESCE(jornada_laboral, '')), ' ', '_')), ''),
  ALTER COLUMN periodo_prueba_meses TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(periodo_prueba_meses::text, '0')), 0),
  ALTER COLUMN sueldo_bruto SET DEFAULT 0,
  ALTER COLUMN salario SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN periodo_prueba_meses SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.contratos c
SET
  id_empleado = COALESCE(c.id_empleado, c.empleado_id, e.id),
  empleado_id = COALESCE(c.empleado_id, c.id_empleado, e.id),
  tenant_id = COALESCE(c.tenant_id, e.tenant_id),
  tipo_contrato = CASE
    WHEN lower(COALESCE(NULLIF(replace(btrim(c.tipo_contrato), ' ', '_'), ''), 'temporal')) IN ('indefinido', 'temporal', 'practicas', 'locacion_servicios', 'part_time', 'por_horas', 'servicios')
      THEN lower(COALESCE(NULLIF(replace(btrim(c.tipo_contrato), ' ', '_'), ''), 'temporal'))
    WHEN lower(COALESCE(NULLIF(replace(btrim(c.tipo_contrato), ' ', '_'), ''), 'temporal')) IN ('plazo_fijo', 'plazo')
      THEN 'temporal'
    WHEN lower(COALESCE(NULLIF(replace(btrim(c.tipo_contrato), ' ', '_'), ''), 'temporal')) IN ('locacion', 'locacion_de_servicios')
      THEN 'locacion_servicios'
    ELSE 'temporal'
  END,
  sueldo_bruto = GREATEST(COALESCE(c.sueldo_bruto, c.salario, 0), 0),
  salario = GREATEST(COALESCE(c.sueldo_bruto, c.salario, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(c.moneda, ''))), ''), 'PEN'),
  fecha_inicio = COALESCE(c.fecha_inicio, c.created_at::date, current_date),
  fecha_firma = COALESCE(c.fecha_firma, c.fecha_inicio, c.created_at::date, current_date),
  fecha_fin = CASE
    WHEN c.fecha_fin IS NOT NULL AND c.fecha_inicio IS NOT NULL AND c.fecha_fin < c.fecha_inicio THEN c.fecha_inicio
    ELSE c.fecha_fin
  END,
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'vigente')) IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado')
      THEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'vigente'))
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'vigente')) IN ('activo', 'activa')
      THEN 'vigente'
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'vigente')) IN ('inactivo', 'inactiva')
      THEN 'finalizado'
    ELSE 'vigente'
  END,
  beneficios = NULLIF(btrim(COALESCE(c.beneficios, '')), ''),
  regimen_pensionario = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.regimen_pensionario), ''), 'AFP')) IN ('AFP', 'ONP', 'MIXTO', 'SIN_REGIMEN')
      THEN upper(COALESCE(NULLIF(btrim(c.regimen_pensionario), ''), 'AFP'))
    WHEN upper(COALESCE(NULLIF(btrim(c.regimen_pensionario), ''), 'AFP')) IN ('SNP')
      THEN 'ONP'
    ELSE 'AFP'
  END,
  jornada_laboral = CASE
    WHEN lower(COALESCE(NULLIF(replace(btrim(c.jornada_laboral), ' ', '_'), ''), '')) IN ('tiempo_completo', 'medio_tiempo', 'por_horas', 'mixta')
      THEN lower(COALESCE(NULLIF(replace(btrim(c.jornada_laboral), ' ', '_'), ''), ''))
    ELSE NULL
  END,
  periodo_prueba_meses = GREATEST(COALESCE(c.periodo_prueba_meses, 0), 0),
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'vigente')) IN ('finalizado', 'terminado', 'vencido', 'anulado', 'inactivo', 'inactiva')
      THEN false
    ELSE COALESCE(c.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), format('Contrato %s %s', COALESCE(e.nombres, ''), COALESCE(e.apellidos, ''))),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), format('CTR-%s', upper(left(replace(c.id::text, '-', ''), 8)))),
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
FROM public.empleados e
WHERE COALESCE(c.id_empleado, c.empleado_id) = e.id;

UPDATE public.contratos c
SET
  id_empleado = COALESCE(c.id_empleado, c.empleado_id),
  empleado_id = COALESCE(c.empleado_id, c.id_empleado),
  tipo_contrato = COALESCE(c.tipo_contrato, 'temporal'),
  sueldo_bruto = GREATEST(COALESCE(c.sueldo_bruto, c.salario, 0), 0),
  salario = GREATEST(COALESCE(c.sueldo_bruto, c.salario, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(c.moneda, ''))), ''), 'PEN'),
  fecha_inicio = COALESCE(c.fecha_inicio, c.created_at::date, current_date),
  fecha_firma = COALESCE(c.fecha_firma, c.fecha_inicio, c.created_at::date, current_date),
  estado = COALESCE(NULLIF(lower(btrim(COALESCE(c.estado, ''))), ''), 'vigente'),
  regimen_pensionario = COALESCE(NULLIF(upper(btrim(COALESCE(c.regimen_pensionario, ''))), ''), 'AFP'),
  periodo_prueba_meses = GREATEST(COALESCE(c.periodo_prueba_meses, 0), 0),
  activo = COALESCE(c.activo, c.estado IN ('vigente', 'renovado', 'en_periodo_prueba')),
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), 'Contrato'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), format('CTR-%s', upper(left(replace(c.id::text, '-', ''), 8)))),
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_contratos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text;
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, NEW.empleado_id::text, ''));
  NEW.empleado_id := NEW.id_empleado;

  v_tipo := lower(COALESCE(NULLIF(replace(btrim(COALESCE(NEW.tipo_contrato, '')), ' ', '_'), ''), 'temporal'));
  IF v_tipo IN ('plazo_fijo', 'plazo') THEN
    v_tipo := 'temporal';
  ELSIF v_tipo IN ('locacion', 'locacion_de_servicios') THEN
    v_tipo := 'locacion_servicios';
  END IF;
  IF v_tipo NOT IN ('indefinido', 'temporal', 'practicas', 'locacion_servicios', 'part_time', 'por_horas', 'servicios') THEN
    v_tipo := 'temporal';
  END IF;
  NEW.tipo_contrato := v_tipo;

  NEW.sueldo_bruto := GREATEST(COALESCE(NEW.sueldo_bruto, NEW.salario, 0), 0);
  NEW.salario := NEW.sueldo_bruto;
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_firma := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_firma::text, '')), NEW.fecha_inicio, NEW.created_at::date, current_date);
  NEW.fecha_fin := app.to_date_or_null(COALESCE(NEW.fecha_fin::text, ''));
  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'vigente'));
  IF v_estado IN ('activo', 'activa') THEN
    v_estado := 'vigente';
  ELSIF v_estado IN ('inactivo', 'inactiva') THEN
    v_estado := 'finalizado';
  END IF;
  IF v_estado NOT IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado') THEN
    v_estado := 'vigente';
  END IF;
  NEW.estado := v_estado;

  NEW.beneficios := NULLIF(btrim(COALESCE(NEW.beneficios, '')), '');
  NEW.regimen_pensionario := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.regimen_pensionario, '')), ''), 'AFP'));
  IF NEW.regimen_pensionario = 'SNP' THEN
    NEW.regimen_pensionario := 'ONP';
  END IF;
  IF NEW.regimen_pensionario NOT IN ('AFP', 'ONP', 'MIXTO', 'SIN_REGIMEN') THEN
    NEW.regimen_pensionario := 'AFP';
  END IF;

  NEW.jornada_laboral := NULLIF(lower(replace(btrim(COALESCE(NEW.jornada_laboral, '')), ' ', '_')), '');
  NEW.periodo_prueba_meses := GREATEST(COALESCE(NEW.periodo_prueba_meses, 0), 0);
  NEW.motivo_finalizacion := NULLIF(btrim(COALESCE(NEW.motivo_finalizacion, '')), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.activo := COALESCE(NEW.activo, NEW.estado IN ('vigente', 'renovado', 'en_periodo_prueba'));
  IF NEW.estado IN ('finalizado', 'terminado', 'vencido', 'anulado') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('Contrato %s', upper(NEW.tipo_contrato)));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CTR-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_contratos_row ON public.contratos;
CREATE TRIGGER trg_normalize_contratos_row
BEFORE INSERT OR UPDATE ON public.contratos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_contratos_row();

-- ----------------------------------------------------------------------------
-- Indices runtime
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_departamentos_tenant_estado_nombre_runtime
ON public.departamentos (tenant_id, estado, nombre, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_empleados_tenant_estado_nombre_runtime
ON public.empleados (tenant_id, estado, apellidos, nombres, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_empleados_tenant_departamento_estado_runtime
ON public.empleados (tenant_id, id_departamento, estado, fecha_ingreso DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_empleados_tenant_documento_runtime
ON public.empleados (tenant_id, tipo_documento, numero_documento)
WHERE tenant_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND numero_documento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_tenant_empleado_estado_fecha_runtime
ON public.contratos (tenant_id, id_empleado, estado, fecha_inicio DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant_tipo_estado_runtime
ON public.contratos (tenant_id, tipo_contrato, estado, fecha_fin DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant_fecha_inicio_runtime
ON public.contratos (tenant_id, fecha_inicio DESC, created_at DESC);

SELECT app.apply_tenant_policy('public', 'departamentos');
SELECT app.apply_tenant_policy('public', 'empleados');
SELECT app.apply_tenant_policy('public', 'contratos');

COMMIT;
