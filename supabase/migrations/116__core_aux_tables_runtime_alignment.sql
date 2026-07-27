-- ============================================================================
-- 116__core_aux_tables_runtime_alignment.sql
-- Alineación runtime para tablas auxiliares críticas detectadas por uso real.
-- Tablas: fe_configuracion, asientos_contables_rrhh, feriados, profiles.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- fe_configuracion: contrato mínimo operativo para facturación electrónica.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.fe_configuracion
  ADD COLUMN IF NOT EXISTS ruc text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS direccion_fiscal text,
  ADD COLUMN IF NOT EXISTS ambiente text DEFAULT 'BETA',
  ADD COLUMN IF NOT EXISTS email_contacto text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE OR REPLACE FUNCTION app.normalize_fe_configuracion_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.ruc := NULLIF(regexp_replace(COALESCE(NEW.ruc, ''), '\\D', '', 'g'), '');
  NEW.razon_social := NULLIF(btrim(COALESCE(NEW.razon_social, '')), '');
  NEW.direccion_fiscal := NULLIF(btrim(COALESCE(NEW.direccion_fiscal, '')), '');
  NEW.email_contacto := NULLIF(lower(btrim(COALESCE(NEW.email_contacto, ''))), '');

  NEW.ambiente := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.ambiente, '')), ''), 'BETA'));
  IF NEW.ambiente NOT IN ('BETA', 'PRODUCCION', 'HOMOLOGACION') THEN
    NEW.ambiente := 'BETA';
  END IF;

  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'FE-' || COALESCE(NEW.tenant_id::text, NEW.id::text)
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_fe_configuracion_row ON public.fe_configuracion;
CREATE TRIGGER trg_normalize_fe_configuracion_row
BEFORE INSERT OR UPDATE ON public.fe_configuracion
FOR EACH ROW
EXECUTE FUNCTION app.normalize_fe_configuracion_row();

UPDATE public.fe_configuracion
SET updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_fe_configuracion_tenant_updated_runtime
ON public.fe_configuracion (tenant_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- asientos_contables_rrhh: columnas usadas por reportes de libro diario.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asientos_contables_rrhh
  ADD COLUMN IF NOT EXISTS planilla_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS debe numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS haber numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.asientos_contables_rrhh
  ALTER COLUMN debe TYPE numeric(14,2) USING app.to_numeric_or_zero(debe::text),
  ALTER COLUMN haber TYPE numeric(14,2) USING app.to_numeric_or_zero(haber::text),
  ALTER COLUMN debe SET DEFAULT 0,
  ALTER COLUMN haber SET DEFAULT 0;

CREATE OR REPLACE FUNCTION app.normalize_asientos_contables_rrhh_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.planilla_id := app.to_uuid_or_null(COALESCE(NEW.planilla_id::text, ''));
  NEW.cuenta := COALESCE(
    NULLIF(btrim(COALESCE(NEW.cuenta, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'RRHH-GENERICO'
  );
  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Asiento RRHH'
  );

  NEW.debe := GREATEST(COALESCE(NEW.debe, 0), 0);
  NEW.haber := GREATEST(COALESCE(NEW.haber, 0), 0);
  NEW.fecha := COALESCE(NEW.fecha, current_date);

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'RRHH-' || COALESCE(NEW.planilla_id::text, NEW.id::text)
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_asientos_contables_rrhh_row ON public.asientos_contables_rrhh;
CREATE TRIGGER trg_normalize_asientos_contables_rrhh_row
BEFORE INSERT OR UPDATE ON public.asientos_contables_rrhh
FOR EACH ROW
EXECUTE FUNCTION app.normalize_asientos_contables_rrhh_row();

UPDATE public.asientos_contables_rrhh
SET updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_asientos_contables_rrhh_tenant_fecha_runtime
ON public.asientos_contables_rrhh (tenant_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_asientos_contables_rrhh_tenant_planilla_runtime
ON public.asientos_contables_rrhh (tenant_id, planilla_id, fecha DESC);

-- ----------------------------------------------------------------------------
-- feriados: compatibilidad operacional para jobs automáticos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.feriados
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS es_nacional boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurrente_anual boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE OR REPLACE FUNCTION app.normalize_feriados_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.pais := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.pais, '')), ''), 'PE'));
  NEW.fecha := COALESCE(NEW.fecha, current_date);

  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Feriado'
  );

  NEW.es_nacional := COALESCE(NEW.es_nacional, true);
  NEW.recurrente_anual := COALESCE(NEW.recurrente_anual, true);
  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.pais || '-' || to_char(NEW.fecha, 'YYYYMMDD')
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_feriados_row ON public.feriados;
CREATE TRIGGER trg_normalize_feriados_row
BEFORE INSERT OR UPDATE ON public.feriados
FOR EACH ROW
EXECUTE FUNCTION app.normalize_feriados_row();

UPDATE public.feriados
SET updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_feriados_tenant_pais_fecha_runtime
ON public.feriados (tenant_id, upper(pais), fecha);

-- ----------------------------------------------------------------------------
-- profiles: contrato mínimo para healthcheck y consistencia de identidad.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE OR REPLACE FUNCTION app.normalize_profiles_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.user_id := COALESCE(NEW.user_id, NEW.id, app.to_uuid_or_null(COALESCE(NEW.codigo, '')));
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.full_name := NULLIF(btrim(COALESCE(NEW.full_name, NEW.nombre, '')), '');
  NEW.avatar_url := NULLIF(btrim(COALESCE(NEW.avatar_url, '')), '');

  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    COALESCE(NEW.user_id::text, NEW.id::text)
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profiles_row ON public.profiles;
CREATE TRIGGER trg_normalize_profiles_row
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION app.normalize_profiles_row();

UPDATE public.profiles
SET
  user_id = COALESCE(user_id, id),
  updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_user_runtime
ON public.profiles (tenant_id, user_id, updated_at DESC);

COMMIT;
