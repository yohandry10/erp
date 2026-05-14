-- ============================================================================
-- 164__rrhh_talento_runtime_alignment.sql
-- Alineacion runtime para RRHH talento:
-- vacantes, candidatos, solicitudes, evaluaciones.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- vacantes
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.vacantes
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS puesto_solicitado text,
  ADD COLUMN IF NOT EXISTS departamento_id uuid,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS ubicacion text,
  ADD COLUMN IF NOT EXISTS tipo_contrato text,
  ADD COLUMN IF NOT EXISTS salario_minimo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_maximo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_min numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_max numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experiencia_requerida text,
  ADD COLUMN IF NOT EXISTS requisitos text,
  ADD COLUMN IF NOT EXISTS beneficios text,
  ADD COLUMN IF NOT EXISTS fecha_limite date,
  ADD COLUMN IF NOT EXISTS fecha_publicacion date,
  ADD COLUMN IF NOT EXISTS fecha_cierre date,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

DROP POLICY IF EXISTS tenant_isolation ON public.vacantes;
DROP POLICY IF EXISTS tenant_isolation ON public.candidatos;
DROP POLICY IF EXISTS tenant_isolation ON public.solicitudes;
DROP POLICY IF EXISTS tenant_isolation ON public.evaluaciones;

ALTER TABLE IF EXISTS public.vacantes
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN departamento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(departamento_id::text, '')),
  ALTER COLUMN titulo TYPE text USING NULLIF(btrim(COALESCE(titulo, '')), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN puesto_solicitado TYPE text USING NULLIF(btrim(COALESCE(puesto_solicitado, '')), ''),
  ALTER COLUMN departamento TYPE text USING NULLIF(btrim(COALESCE(departamento, '')), ''),
  ALTER COLUMN ubicacion TYPE text USING NULLIF(btrim(COALESCE(ubicacion, '')), ''),
  ALTER COLUMN tipo_contrato TYPE text USING NULLIF(lower(btrim(COALESCE(tipo_contrato, ''))), ''),
  ALTER COLUMN salario_minimo TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(salario_minimo::text, '0')),
  ALTER COLUMN salario_maximo TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(salario_maximo::text, '0')),
  ALTER COLUMN salario_min TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(salario_min::text, '0')),
  ALTER COLUMN salario_max TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(salario_max::text, '0')),
  ALTER COLUMN experiencia_requerida TYPE text USING NULLIF(btrim(COALESCE(experiencia_requerida, '')), ''),
  ALTER COLUMN requisitos TYPE text USING NULLIF(btrim(COALESCE(requisitos, '')), ''),
  ALTER COLUMN beneficios TYPE text USING NULLIF(btrim(COALESCE(beneficios, '')), ''),
  ALTER COLUMN fecha_limite TYPE date USING app.to_date_or_null(COALESCE(fecha_limite::text, '')),
  ALTER COLUMN fecha_publicacion TYPE date USING app.to_date_or_null(COALESCE(fecha_publicacion::text, '')),
  ALTER COLUMN fecha_cierre TYPE date USING app.to_date_or_null(COALESCE(fecha_cierre::text, '')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'activa')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN salario_minimo SET DEFAULT 0,
  ALTER COLUMN salario_maximo SET DEFAULT 0,
  ALTER COLUMN salario_min SET DEFAULT 0,
  ALTER COLUMN salario_max SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.vacantes v
SET
  titulo = COALESCE(NULLIF(btrim(COALESCE(v.titulo, '')), ''), NULLIF(btrim(COALESCE(v.nombre, '')), ''), format('VACANTE-%s', upper(left(replace(v.id::text, '-', ''), 8)))),
  descripcion = NULLIF(btrim(COALESCE(v.descripcion, '')), ''),
  puesto_solicitado = COALESCE(NULLIF(btrim(COALESCE(v.puesto_solicitado, '')), ''), NULLIF(btrim(COALESCE(v.titulo, '')), ''), 'PUESTO'),
  ubicacion = NULLIF(btrim(COALESCE(v.ubicacion, '')), ''),
  tipo_contrato = CASE
    WHEN lower(COALESCE(NULLIF(btrim(v.tipo_contrato), ''), 'tiempo_completo')) IN ('tiempo_completo', 'medio_tiempo', 'contrato', 'pasantia', 'freelance')
      THEN lower(COALESCE(NULLIF(btrim(v.tipo_contrato), ''), 'tiempo_completo'))
    ELSE 'tiempo_completo'
  END,
  salario_minimo = GREATEST(COALESCE(NULLIF(v.salario_minimo, 0), v.salario_min, 0), 0),
  salario_min = GREATEST(COALESCE(NULLIF(v.salario_min, 0), v.salario_minimo, 0), 0),
  salario_maximo = GREATEST(
    COALESCE(NULLIF(v.salario_maximo, 0), v.salario_max, NULLIF(v.salario_minimo, 0), NULLIF(v.salario_min, 0), 0),
    GREATEST(COALESCE(NULLIF(v.salario_minimo, 0), v.salario_min, 0), 0)
  ),
  salario_max = GREATEST(
    COALESCE(NULLIF(v.salario_max, 0), v.salario_maximo, NULLIF(v.salario_min, 0), NULLIF(v.salario_minimo, 0), 0),
    GREATEST(COALESCE(NULLIF(v.salario_min, 0), v.salario_minimo, 0), 0)
  ),
  experiencia_requerida = NULLIF(btrim(COALESCE(v.experiencia_requerida, '')), ''),
  requisitos = NULLIF(btrim(COALESCE(v.requisitos, '')), ''),
  beneficios = NULLIF(btrim(COALESCE(v.beneficios, '')), ''),
  fecha_publicacion = COALESCE(v.fecha_publicacion, v.created_at::date, current_date),
  fecha_limite = COALESCE(v.fecha_limite, v.fecha_cierre, v.created_at::date + 30, current_date + 30),
  fecha_cierre = COALESCE(v.fecha_cierre, v.fecha_limite, v.created_at::date + 30, current_date + 30),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(v.estado), ''), 'activa')) IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador')
      THEN lower(COALESCE(NULLIF(btrim(v.estado), ''), 'activa'))
    WHEN lower(COALESCE(NULLIF(btrim(v.estado), ''), 'activa')) IN ('activo') THEN 'activa'
    WHEN lower(COALESCE(NULLIF(btrim(v.estado), ''), 'activa')) IN ('inactivo') THEN 'pausada'
    ELSE 'activa'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(v.estado), ''), 'activa')) IN ('cerrada', 'cancelada') THEN false
    ELSE COALESCE(v.activo, true)
  END,
  departamento = COALESCE(NULLIF(btrim(COALESCE(v.departamento, '')), ''), d.nombre),
  nombre = COALESCE(NULLIF(btrim(COALESCE(v.nombre, '')), ''), NULLIF(btrim(COALESCE(v.titulo, '')), ''), 'Vacante'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(v.codigo, ''))), ''), format('VAC-%s', upper(left(replace(v.id::text, '-', ''), 8)))),
  metadata = COALESCE(v.metadata, '{}'::jsonb),
  updated_at = now()
FROM public.departamentos d
WHERE v.departamento_id IS NOT NULL
  AND d.id = v.departamento_id;

UPDATE public.vacantes v
SET
  departamento = COALESCE(NULLIF(btrim(COALESCE(v.departamento, '')), ''), NULLIF(btrim(COALESCE(v.nombre, '')), '')),
  updated_at = now()
WHERE v.departamento IS NULL OR btrim(v.departamento) = '';

CREATE OR REPLACE FUNCTION app.normalize_vacantes_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.departamento_id := app.to_uuid_or_null(COALESCE(NEW.departamento_id::text, ''));

  NEW.titulo := COALESCE(NULLIF(btrim(COALESCE(NEW.titulo, '')), ''), NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Vacante');
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.puesto_solicitado := COALESCE(NULLIF(btrim(COALESCE(NEW.puesto_solicitado, '')), ''), NEW.titulo);
  NEW.ubicacion := NULLIF(btrim(COALESCE(NEW.ubicacion, '')), '');
  NEW.tipo_contrato := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_contrato, '')), ''), 'tiempo_completo'));
  IF NEW.tipo_contrato NOT IN ('tiempo_completo', 'medio_tiempo', 'contrato', 'pasantia', 'freelance') THEN
    NEW.tipo_contrato := 'tiempo_completo';
  END IF;

  NEW.salario_minimo := GREATEST(COALESCE(NEW.salario_minimo, NEW.salario_min, 0), 0);
  NEW.salario_min := NEW.salario_minimo;
  NEW.salario_maximo := GREATEST(COALESCE(NEW.salario_maximo, NEW.salario_max, NEW.salario_minimo, 0), NEW.salario_minimo);
  NEW.salario_max := NEW.salario_maximo;

  NEW.experiencia_requerida := NULLIF(btrim(COALESCE(NEW.experiencia_requerida, '')), '');
  NEW.requisitos := NULLIF(btrim(COALESCE(NEW.requisitos, '')), '');
  NEW.beneficios := NULLIF(btrim(COALESCE(NEW.beneficios, '')), '');

  NEW.fecha_publicacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_publicacion::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_limite := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_limite::text, '')), app.to_date_or_null(COALESCE(NEW.fecha_cierre::text, '')), NEW.fecha_publicacion + 30);
  NEW.fecha_cierre := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_cierre::text, '')), NEW.fecha_limite);
  IF NEW.fecha_cierre < NEW.fecha_publicacion THEN
    NEW.fecha_cierre := NEW.fecha_limite;
  END IF;
  IF NEW.fecha_limite < NEW.fecha_publicacion THEN
    NEW.fecha_limite := NEW.fecha_publicacion;
  END IF;

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activa'));
  IF v_estado = 'activo' THEN
    v_estado := 'activa';
  ELSIF v_estado = 'inactivo' THEN
    v_estado := 'pausada';
  END IF;
  IF v_estado NOT IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador') THEN
    v_estado := 'activa';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, NEW.estado NOT IN ('cerrada', 'cancelada'));
  IF NEW.estado IN ('cerrada', 'cancelada') THEN
    NEW.activo := false;
  END IF;

  NEW.departamento := NULLIF(btrim(COALESCE(NEW.departamento, '')), '');
  IF NEW.departamento IS NULL AND NEW.departamento_id IS NOT NULL THEN
    SELECT d.nombre INTO NEW.departamento
    FROM public.departamentos d
    WHERE d.id = NEW.departamento_id;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), NEW.titulo);
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('VAC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_vacantes_row ON public.vacantes;
CREATE TRIGGER trg_normalize_vacantes_row
BEFORE INSERT OR UPDATE ON public.vacantes
FOR EACH ROW
EXECUTE FUNCTION app.normalize_vacantes_row();

-- ----------------------------------------------------------------------------
-- candidatos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.candidatos
  ADD COLUMN IF NOT EXISTS id_vacante uuid,
  ADD COLUMN IF NOT EXISTS vacante_id uuid,
  ADD COLUMN IF NOT EXISTS nombres text,
  ADD COLUMN IF NOT EXISTS apellidos text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS nivel_educacion text,
  ADD COLUMN IF NOT EXISTS experiencia_anos numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pretension_salarial numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cv_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS idiomas jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS habilidades_tecnicas jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS experiencia_laboral jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS formacion_academica jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estado_proceso text,
  ADD COLUMN IF NOT EXISTS puntuacion_cv numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS disponibilidad_inmediata boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS modalidad_trabajo_preferida text,
  ADD COLUMN IF NOT EXISTS fecha_postulacion timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.candidatos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_vacante TYPE uuid USING app.to_uuid_or_null(COALESCE(id_vacante::text, '')),
  ALTER COLUMN vacante_id TYPE uuid USING app.to_uuid_or_null(COALESCE(vacante_id::text, '')),
  ALTER COLUMN nombres TYPE text USING NULLIF(btrim(COALESCE(nombres, '')), ''),
  ALTER COLUMN apellidos TYPE text USING NULLIF(btrim(COALESCE(apellidos, '')), ''),
  ALTER COLUMN email TYPE text USING NULLIF(lower(btrim(COALESCE(email, ''))), ''),
  ALTER COLUMN telefono TYPE text USING NULLIF(btrim(COALESCE(telefono, '')), ''),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(upper(btrim(COALESCE(numero_documento, ''))), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN fecha_nacimiento TYPE date USING app.to_date_or_null(COALESCE(fecha_nacimiento::text, '')),
  ALTER COLUMN direccion TYPE text USING NULLIF(btrim(COALESCE(direccion, '')), ''),
  ALTER COLUMN nivel_educacion TYPE text USING NULLIF(lower(btrim(COALESCE(nivel_educacion, ''))), ''),
  ALTER COLUMN experiencia_anos TYPE numeric(6,2) USING app.to_numeric_or_zero(COALESCE(experiencia_anos::text, '0')),
  ALTER COLUMN pretension_salarial TYPE numeric(14,2) USING app.to_numeric_or_zero(COALESCE(pretension_salarial::text, '0')),
  ALTER COLUMN cv_url TYPE text USING NULLIF(btrim(COALESCE(cv_url, '')), ''),
  ALTER COLUMN linkedin_url TYPE text USING NULLIF(btrim(COALESCE(linkedin_url, '')), ''),
  ALTER COLUMN portfolio_url TYPE text USING NULLIF(btrim(COALESCE(portfolio_url, '')), ''),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'postulante')),
  ALTER COLUMN estado_proceso TYPE text USING lower(COALESCE(NULLIF(btrim(estado_proceso), ''), '')),
  ALTER COLUMN puntuacion_cv TYPE numeric(5,2) USING app.to_numeric_or_zero(COALESCE(puntuacion_cv::text, '0')),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN modalidad_trabajo_preferida TYPE text USING NULLIF(lower(btrim(COALESCE(modalidad_trabajo_preferida, ''))), ''),
  ALTER COLUMN fecha_postulacion TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_postulacion::text, '')),
  ALTER COLUMN experiencia_anos SET DEFAULT 0,
  ALTER COLUMN pretension_salarial SET DEFAULT 0,
  ALTER COLUMN puntuacion_cv SET DEFAULT 0,
  ALTER COLUMN disponibilidad_inmediata SET DEFAULT true,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN idiomas SET DEFAULT '[]'::jsonb,
  ALTER COLUMN habilidades_tecnicas SET DEFAULT '[]'::jsonb,
  ALTER COLUMN experiencia_laboral SET DEFAULT '[]'::jsonb,
  ALTER COLUMN formacion_academica SET DEFAULT '[]'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.candidatos c
SET
  id_vacante = COALESCE(c.id_vacante, c.vacante_id),
  vacante_id = COALESCE(c.vacante_id, c.id_vacante),
  nombres = COALESCE(NULLIF(btrim(COALESCE(c.nombres, '')), ''), split_part(COALESCE(c.nombre, ''), ' ', 1), 'NOMBRE'),
  apellidos = COALESCE(NULLIF(btrim(COALESCE(c.apellidos, '')), ''), NULLIF(btrim(replace(COALESCE(c.nombre, ''), split_part(COALESCE(c.nombre, ''), ' ', 1), '')), ''), ''),
  email = NULLIF(lower(btrim(COALESCE(c.email, ''))), ''),
  telefono = NULLIF(btrim(COALESCE(c.telefono, '')), ''),
  numero_documento = NULLIF(upper(btrim(COALESCE(c.numero_documento, ''))), ''),
  tipo_documento = COALESCE(NULLIF(upper(btrim(COALESCE(c.tipo_documento, ''))), ''), 'DNI'),
  fecha_nacimiento = app.to_date_or_null(COALESCE(c.fecha_nacimiento::text, '')),
  direccion = NULLIF(btrim(COALESCE(c.direccion, '')), ''),
  nivel_educacion = COALESCE(NULLIF(lower(btrim(COALESCE(c.nivel_educacion, ''))), ''), 'universitario'),
  experiencia_anos = GREATEST(COALESCE(c.experiencia_anos, 0), 0),
  pretension_salarial = GREATEST(COALESCE(c.pretension_salarial, 0), 0),
  cv_url = NULLIF(btrim(COALESCE(c.cv_url, '')), ''),
  linkedin_url = NULLIF(btrim(COALESCE(c.linkedin_url, '')), ''),
  portfolio_url = NULLIF(btrim(COALESCE(c.portfolio_url, '')), ''),
  idiomas = CASE WHEN jsonb_typeof(COALESCE(c.idiomas, '[]'::jsonb)) = 'array' THEN COALESCE(c.idiomas, '[]'::jsonb) ELSE '[]'::jsonb END,
  habilidades_tecnicas = CASE WHEN jsonb_typeof(COALESCE(c.habilidades_tecnicas, '[]'::jsonb)) = 'array' THEN COALESCE(c.habilidades_tecnicas, '[]'::jsonb) ELSE '[]'::jsonb END,
  experiencia_laboral = CASE WHEN jsonb_typeof(COALESCE(c.experiencia_laboral, '[]'::jsonb)) = 'array' THEN COALESCE(c.experiencia_laboral, '[]'::jsonb) ELSE '[]'::jsonb END,
  formacion_academica = CASE WHEN jsonb_typeof(COALESCE(c.formacion_academica, '[]'::jsonb)) = 'array' THEN COALESCE(c.formacion_academica, '[]'::jsonb) ELSE '[]'::jsonb END,
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), NULLIF(btrim(c.estado_proceso), ''), 'postulante')) IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado')
      THEN lower(COALESCE(NULLIF(btrim(c.estado), ''), NULLIF(btrim(c.estado_proceso), ''), 'postulante'))
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), NULLIF(btrim(c.estado_proceso), ''), 'postulante')) IN ('en_entrevista') THEN 'entrevista'
    ELSE 'postulante'
  END,
  estado_proceso = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado_proceso), ''), NULLIF(btrim(c.estado), ''), 'postulante')) IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado')
      THEN lower(COALESCE(NULLIF(btrim(c.estado_proceso), ''), NULLIF(btrim(c.estado), ''), 'postulante'))
    WHEN lower(COALESCE(NULLIF(btrim(c.estado_proceso), ''), NULLIF(btrim(c.estado), ''), 'postulante')) IN ('en_entrevista') THEN 'entrevista'
    ELSE 'postulante'
  END,
  puntuacion_cv = LEAST(GREATEST(COALESCE(c.puntuacion_cv, 0), 0), 100),
  observaciones = NULLIF(btrim(COALESCE(c.observaciones, '')), ''),
  disponibilidad_inmediata = COALESCE(c.disponibilidad_inmediata, true),
  modalidad_trabajo_preferida = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.modalidad_trabajo_preferida), ''), 'presencial')) IN ('presencial', 'remoto', 'hibrido')
      THEN lower(COALESCE(NULLIF(btrim(c.modalidad_trabajo_preferida), ''), 'presencial'))
    ELSE 'presencial'
  END,
  fecha_postulacion = COALESCE(app.to_timestamptz_or_null(COALESCE(c.fecha_postulacion::text, '')), c.created_at, now()),
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(c.estado), ''), 'postulante')) IN ('rechazado', 'descartado') THEN COALESCE(c.activo, false)
    ELSE COALESCE(c.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), format('%s %s', COALESCE(NULLIF(btrim(COALESCE(c.nombres, '')), ''), ''), COALESCE(NULLIF(btrim(COALESCE(c.apellidos, '')), ''), ''))),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), format('CAND-%s', upper(left(replace(c.id::text, '-', ''), 8)))),
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_candidatos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_vacante := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_vacante::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.vacante_id::text, ''))
  );
  NEW.vacante_id := NEW.id_vacante;

  NEW.nombres := COALESCE(NULLIF(btrim(COALESCE(NEW.nombres, '')), ''), split_part(COALESCE(NEW.nombre, ''), ' ', 1), 'NOMBRE');
  NEW.apellidos := COALESCE(NULLIF(btrim(COALESCE(NEW.apellidos, '')), ''), NULLIF(btrim(replace(COALESCE(NEW.nombre, ''), split_part(COALESCE(NEW.nombre, ''), ' ', 1), '')), ''), '');
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.telefono := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');
  NEW.numero_documento := NULLIF(upper(btrim(COALESCE(NEW.numero_documento, ''))), '');
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'DNI'));
  IF NEW.tipo_documento NOT IN ('DNI', 'CE', 'PASAPORTE', 'RUC', 'OTRO') THEN
    NEW.tipo_documento := 'DNI';
  END IF;

  NEW.fecha_nacimiento := app.to_date_or_null(COALESCE(NEW.fecha_nacimiento::text, ''));
  NEW.direccion := NULLIF(btrim(COALESCE(NEW.direccion, '')), '');
  NEW.nivel_educacion := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.nivel_educacion, '')), ''), 'universitario'));
  IF NEW.nivel_educacion NOT IN ('secundaria', 'tecnico', 'universitario', 'maestria', 'doctorado', 'otro') THEN
    NEW.nivel_educacion := 'universitario';
  END IF;

  NEW.experiencia_anos := GREATEST(COALESCE(NEW.experiencia_anos, 0), 0);
  NEW.pretension_salarial := GREATEST(COALESCE(NEW.pretension_salarial, 0), 0);
  NEW.cv_url := NULLIF(btrim(COALESCE(NEW.cv_url, '')), '');
  NEW.linkedin_url := NULLIF(btrim(COALESCE(NEW.linkedin_url, '')), '');
  NEW.portfolio_url := NULLIF(btrim(COALESCE(NEW.portfolio_url, '')), '');

  NEW.idiomas := CASE WHEN jsonb_typeof(COALESCE(NEW.idiomas, '[]'::jsonb)) = 'array' THEN COALESCE(NEW.idiomas, '[]'::jsonb) ELSE '[]'::jsonb END;
  NEW.habilidades_tecnicas := CASE WHEN jsonb_typeof(COALESCE(NEW.habilidades_tecnicas, '[]'::jsonb)) = 'array' THEN COALESCE(NEW.habilidades_tecnicas, '[]'::jsonb) ELSE '[]'::jsonb END;
  NEW.experiencia_laboral := CASE WHEN jsonb_typeof(COALESCE(NEW.experiencia_laboral, '[]'::jsonb)) = 'array' THEN COALESCE(NEW.experiencia_laboral, '[]'::jsonb) ELSE '[]'::jsonb END;
  NEW.formacion_academica := CASE WHEN jsonb_typeof(COALESCE(NEW.formacion_academica, '[]'::jsonb)) = 'array' THEN COALESCE(NEW.formacion_academica, '[]'::jsonb) ELSE '[]'::jsonb END;

  v_estado := lower(COALESCE(
    NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
    NULLIF(btrim(COALESCE(NEW.estado_proceso, '')), ''),
    'postulante'
  ));
  IF v_estado = 'en_entrevista' THEN
    v_estado := 'entrevista';
  END IF;
  IF v_estado NOT IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado') THEN
    v_estado := 'postulante';
  END IF;
  NEW.estado := v_estado;
  NEW.estado_proceso := v_estado;

  NEW.puntuacion_cv := LEAST(GREATEST(COALESCE(NEW.puntuacion_cv, 0), 0), 100);
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.disponibilidad_inmediata := COALESCE(NEW.disponibilidad_inmediata, true);
  NEW.modalidad_trabajo_preferida := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.modalidad_trabajo_preferida, '')), ''), 'presencial'));
  IF NEW.modalidad_trabajo_preferida NOT IN ('presencial', 'remoto', 'hibrido') THEN
    NEW.modalidad_trabajo_preferida := 'presencial';
  END IF;

  NEW.fecha_postulacion := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_postulacion::text, '')), NEW.created_at, now());
  NEW.activo := COALESCE(NEW.activo, NEW.estado NOT IN ('rechazado', 'descartado'));

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('%s %s', NEW.nombres, NEW.apellidos));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CAND-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_candidatos_row ON public.candidatos;
CREATE TRIGGER trg_normalize_candidatos_row
BEFORE INSERT OR UPDATE ON public.candidatos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_candidatos_row();

-- ----------------------------------------------------------------------------
-- solicitudes
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.solicitudes
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS comentario text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.solicitudes
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN aprobado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(aprobado_por::text, '')),
  ALTER COLUMN tipo TYPE text USING NULLIF(lower(btrim(COALESCE(tipo, ''))), ''),
  ALTER COLUMN motivo TYPE text USING NULLIF(btrim(COALESCE(motivo, '')), ''),
  ALTER COLUMN comentario TYPE text USING NULLIF(btrim(COALESCE(comentario, '')), ''),
  ALTER COLUMN fecha_inicio TYPE date USING app.to_date_or_null(COALESCE(fecha_inicio::text, '')),
  ALTER COLUMN fecha_fin TYPE date USING app.to_date_or_null(COALESCE(fecha_fin::text, '')),
  ALTER COLUMN fecha_aprobacion TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_aprobacion::text, '')),
  ALTER COLUMN observaciones_aprobacion TYPE text USING NULLIF(btrim(COALESCE(observaciones_aprobacion, '')), ''),
  ALTER COLUMN dias TYPE integer USING GREATEST(COALESCE(dias, 0), 0),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'pendiente')),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN dias SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.solicitudes s
SET
  tipo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(s.tipo), ''), 'vacaciones')) IN ('vacaciones', 'licencia', 'permiso', 'descanso_medico', 'compensacion', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(s.tipo), ''), 'vacaciones'))
    ELSE 'otro'
  END,
  motivo = NULLIF(btrim(COALESCE(s.motivo, '')), ''),
  comentario = NULLIF(btrim(COALESCE(s.comentario, '')), ''),
  fecha_inicio = COALESCE(s.fecha_inicio, s.created_at::date, current_date),
  fecha_fin = COALESCE(s.fecha_fin, s.fecha_inicio, s.created_at::date, current_date),
  dias = CASE
    WHEN COALESCE(s.dias, 0) > 0 THEN s.dias
    WHEN s.fecha_inicio IS NOT NULL AND s.fecha_fin IS NOT NULL THEN GREATEST((s.fecha_fin - s.fecha_inicio) + 1, 0)
    ELSE 0
  END,
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente')) IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')
      THEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente'))
    WHEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente')) = 'aprobado' THEN 'aprobada'
    WHEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente')) = 'rechazado' THEN 'rechazada'
    WHEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente')) IN ('activo') THEN 'pendiente'
    ELSE 'pendiente'
  END,
  fecha_aprobacion = CASE
    WHEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente')) IN ('aprobada', 'aprobado', 'rechazada', 'rechazado')
      THEN COALESCE(s.fecha_aprobacion, now())
    ELSE s.fecha_aprobacion
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(s.estado), ''), 'pendiente')) = 'cancelada' THEN false
    ELSE COALESCE(s.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(s.nombre, '')), ''), format('SOLICITUD %s', upper(COALESCE(s.tipo, 'GENERAL')))),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(s.codigo, ''))), ''), format('SOL-%s', upper(left(replace(s.id::text, '-', ''), 8)))),
  metadata = COALESCE(s.metadata, '{}'::jsonb),
  updated_at = now()
WHERE s.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_solicitudes_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, ''));
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));

  NEW.tipo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'vacaciones'));
  IF NEW.tipo NOT IN ('vacaciones', 'licencia', 'permiso', 'descanso_medico', 'compensacion', 'otro') THEN
    NEW.tipo := 'otro';
  END IF;

  NEW.motivo := NULLIF(btrim(COALESCE(NEW.motivo, '')), '');
  NEW.comentario := NULLIF(btrim(COALESCE(NEW.comentario, '')), '');
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, current_date);
  NEW.fecha_fin := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_fin::text, '')), NEW.fecha_inicio);
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;

  NEW.dias := GREATEST(COALESCE(NEW.dias, 0), 0);
  IF NEW.dias = 0 AND NEW.fecha_inicio IS NOT NULL AND NEW.fecha_fin IS NOT NULL THEN
    NEW.dias := GREATEST((NEW.fecha_fin - NEW.fecha_inicio) + 1, 0);
  END IF;

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'pendiente'));
  IF NEW.estado = 'aprobado' THEN
    NEW.estado := 'aprobada';
  ELSIF NEW.estado = 'rechazado' THEN
    NEW.estado := 'rechazada';
  ELSIF NEW.estado = 'activo' THEN
    NEW.estado := 'pendiente';
  END IF;
  IF NEW.estado NOT IN ('pendiente', 'aprobada', 'rechazada', 'cancelada') THEN
    NEW.estado := 'pendiente';
  END IF;

  NEW.fecha_aprobacion := app.to_timestamptz_or_null(COALESCE(NEW.fecha_aprobacion::text, ''));
  IF NEW.estado IN ('aprobada', 'rechazada') THEN
    NEW.fecha_aprobacion := COALESCE(NEW.fecha_aprobacion, now());
  END IF;

  NEW.observaciones_aprobacion := NULLIF(btrim(COALESCE(NEW.observaciones_aprobacion, '')), '');
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'cancelada');

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('SOLICITUD %s', upper(NEW.tipo)));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('SOL-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_solicitudes_row ON public.solicitudes;
CREATE TRIGGER trg_normalize_solicitudes_row
BEFORE INSERT OR UPDATE ON public.solicitudes
FOR EACH ROW
EXECUTE FUNCTION app.normalize_solicitudes_row();

-- ----------------------------------------------------------------------------
-- evaluaciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.evaluaciones
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS evaluador_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS puntaje_total numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fortalezas text,
  ADD COLUMN IF NOT EXISTS oportunidades_mejora text,
  ADD COLUMN IF NOT EXISTS plan_accion text,
  ADD COLUMN IF NOT EXISTS proxima_evaluacion date,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.evaluaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN evaluador_id TYPE uuid USING app.to_uuid_or_null(COALESCE(evaluador_id::text, '')),
  ALTER COLUMN fecha_evaluacion TYPE date USING app.to_date_or_null(COALESCE(fecha_evaluacion::text, '')),
  ALTER COLUMN periodo TYPE text USING NULLIF(lower(btrim(COALESCE(periodo, ''))), ''),
  ALTER COLUMN tipo TYPE text USING NULLIF(lower(btrim(COALESCE(tipo, ''))), ''),
  ALTER COLUMN puntaje_total TYPE numeric(5,2) USING app.to_numeric_or_zero(COALESCE(puntaje_total::text, '0')),
  ALTER COLUMN fortalezas TYPE text USING NULLIF(btrim(COALESCE(fortalezas, '')), ''),
  ALTER COLUMN oportunidades_mejora TYPE text USING NULLIF(btrim(COALESCE(oportunidades_mejora, '')), ''),
  ALTER COLUMN plan_accion TYPE text USING NULLIF(btrim(COALESCE(plan_accion, '')), ''),
  ALTER COLUMN proxima_evaluacion TYPE date USING app.to_date_or_null(COALESCE(proxima_evaluacion::text, '')),
  ALTER COLUMN estado TYPE text USING lower(COALESCE(NULLIF(btrim(estado), ''), 'borrador')),
  ALTER COLUMN puntaje_total SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.evaluaciones e
SET
  id_empleado = app.to_uuid_or_null(COALESCE(e.id_empleado::text, '')),
  evaluador_id = app.to_uuid_or_null(COALESCE(e.evaluador_id::text, '')),
  fecha_evaluacion = COALESCE(e.fecha_evaluacion, e.created_at::date, current_date),
  periodo = COALESCE(NULLIF(lower(btrim(COALESCE(e.periodo, ''))), ''), to_char(COALESCE(e.fecha_evaluacion, e.created_at::date, current_date), 'YYYY-MM')),
  tipo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.tipo), ''), 'desempeno')) IN ('desempeno', 'periodica', 'prueba', '360', 'objetivos', 'otro')
      THEN lower(COALESCE(NULLIF(btrim(e.tipo), ''), 'desempeno'))
    ELSE 'desempeno'
  END,
  puntaje_total = LEAST(GREATEST(COALESCE(e.puntaje_total, 0), 0), 100),
  fortalezas = NULLIF(btrim(COALESCE(e.fortalezas, '')), ''),
  oportunidades_mejora = NULLIF(btrim(COALESCE(e.oportunidades_mejora, '')), ''),
  plan_accion = NULLIF(btrim(COALESCE(e.plan_accion, '')), ''),
  proxima_evaluacion = app.to_date_or_null(COALESCE(e.proxima_evaluacion::text, '')),
  estado = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'borrador')) IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada')
      THEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'borrador'))
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'borrador')) IN ('activo') THEN 'programada'
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'borrador')) IN ('inactivo') THEN 'rechazada'
    ELSE 'borrador'
  END,
  activo = CASE
    WHEN lower(COALESCE(NULLIF(btrim(e.estado), ''), 'borrador')) = 'rechazada' THEN COALESCE(e.activo, false)
    ELSE COALESCE(e.activo, true)
  END,
  nombre = COALESCE(NULLIF(btrim(COALESCE(e.nombre, '')), ''), format('EVALUACION %s', upper(COALESCE(e.periodo, to_char(COALESCE(e.fecha_evaluacion, e.created_at::date, current_date), 'YYYY-MM'))))),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(e.codigo, ''))), ''), format('EVAL-%s', upper(left(replace(e.id::text, '-', ''), 8)))),
  metadata = COALESCE(e.metadata, '{}'::jsonb),
  updated_at = now()
WHERE e.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_evaluaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, ''));
  NEW.evaluador_id := app.to_uuid_or_null(COALESCE(NEW.evaluador_id::text, ''));

  NEW.fecha_evaluacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_evaluacion::text, '')), NEW.created_at::date, current_date);
  NEW.periodo := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.periodo, ''))), ''), to_char(NEW.fecha_evaluacion, 'YYYY-MM'));
  NEW.tipo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'desempeno'));
  IF NEW.tipo NOT IN ('desempeno', 'periodica', 'prueba', '360', 'objetivos', 'otro') THEN
    NEW.tipo := 'desempeno';
  END IF;

  NEW.puntaje_total := LEAST(GREATEST(COALESCE(NEW.puntaje_total, 0), 0), 100);
  NEW.fortalezas := NULLIF(btrim(COALESCE(NEW.fortalezas, '')), '');
  NEW.oportunidades_mejora := NULLIF(btrim(COALESCE(NEW.oportunidades_mejora, '')), '');
  NEW.plan_accion := NULLIF(btrim(COALESCE(NEW.plan_accion, '')), '');
  NEW.proxima_evaluacion := app.to_date_or_null(COALESCE(NEW.proxima_evaluacion::text, ''));

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'borrador'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'programada';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'rechazada';
  END IF;
  IF NEW.estado NOT IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada') THEN
    NEW.estado := 'borrador';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'rechazada');

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('EVALUACION %s', upper(NEW.periodo)));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('EVAL-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_evaluaciones_row ON public.evaluaciones;
CREATE TRIGGER trg_normalize_evaluaciones_row
BEFORE INSERT OR UPDATE ON public.evaluaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_evaluaciones_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo de timestamps.
-- ----------------------------------------------------------------------------
UPDATE public.vacantes
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.candidatos
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.solicitudes
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.evaluaciones
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Indices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vacantes_tenant_estado_fecha_runtime
ON public.vacantes (tenant_id, estado, fecha_publicacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vacantes_tenant_departamento_fecha_runtime
ON public.vacantes (tenant_id, departamento_id, fecha_publicacion DESC)
WHERE departamento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vacantes_tenant_puesto_runtime
ON public.vacantes (tenant_id, puesto_solicitado);

CREATE INDEX IF NOT EXISTS idx_candidatos_tenant_vacante_fecha_runtime
ON public.candidatos (tenant_id, id_vacante, fecha_postulacion DESC, created_at DESC)
WHERE id_vacante IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidatos_tenant_estado_fecha_runtime
ON public.candidatos (tenant_id, estado, fecha_postulacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidatos_tenant_email_runtime
ON public.candidatos (tenant_id, lower(email))
WHERE email IS NOT NULL
  AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_solicitudes_tenant_empleado_estado_fecha_runtime
ON public.solicitudes (tenant_id, id_empleado, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_solicitudes_tenant_tipo_rango_runtime
ON public.solicitudes (tenant_id, tipo, fecha_inicio DESC, fecha_fin DESC);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_tenant_empleado_fecha_runtime
ON public.evaluaciones (tenant_id, id_empleado, fecha_evaluacion DESC, created_at DESC)
WHERE id_empleado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evaluaciones_tenant_estado_fecha_runtime
ON public.evaluaciones (tenant_id, estado, fecha_evaluacion DESC, created_at DESC);

SELECT app.apply_tenant_policy('public', 'vacantes');
SELECT app.apply_tenant_policy('public', 'candidatos');
SELECT app.apply_tenant_policy('public', 'solicitudes');
SELECT app.apply_tenant_policy('public', 'evaluaciones');

COMMIT;
