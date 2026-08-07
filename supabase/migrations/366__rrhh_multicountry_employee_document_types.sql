BEGIN;

-- El normalizador histórico de empleados sólo admitía documentos peruanos.
-- Mantener el mismo saneamiento, ampliando únicamente el catálogo para los
-- tipos laborales ya habilitados en Argentina y Colombia.
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
  IF v_tipo_doc NOT IN (
    'DNI', 'CE', 'PASAPORTE', 'RUC', 'CUIL', 'CUIT', 'CC', 'TI', 'NIT', 'OTRO'
  ) THEN
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

-- Recupera los registros colombianos creados mientras el normalizador antiguo
-- estaba vigente. Sólo se transforma OTRO cuando la cédula tiene formato CC.
UPDATE public.empleados e
SET tipo_documento = 'CC',
    nacionalidad = 'CO',
    updated_at = now()
FROM public.empresa_config ec
WHERE ec.tenant_id = e.tenant_id
  AND (upper(COALESCE(ec.pais, '')) = 'CO' OR ec.pais_id = 2)
  AND e.tipo_documento = 'OTRO'
  AND e.numero_documento ~ '^[0-9]{6,10}$';

COMMIT;
