-- ============================================================================
-- 194__rrhh_asistencia_runtime_alignment.sql
-- Alineacion runtime para asistencia RRHH (canonico + legacy):
-- tablas: asistencia, asistencias.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON public.asistencia;
DROP POLICY IF EXISTS tenant_isolation ON public.asistencias;
DROP FUNCTION IF EXISTS public.get_asistencia_unificada(uuid, date, date);
DROP VIEW IF EXISTS public.v_asistencia_unificada;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado y calculo de horas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_asistencia_estado(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := lower(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'presente'));

  IF v IN ('presente', 'asistio', 'asistencia', 'trabajando') THEN
    RETURN 'presente';
  ELSIF v IN ('ausente', 'falta', 'falto', 'inasistencia', 'no_asistio') THEN
    RETURN 'ausente';
  ELSIF v IN ('tardanza', 'tarde', 'late') THEN
    RETURN 'tardanza';
  ELSIF v IN ('justificado', 'justificada', 'permiso', 'permiso_medico') THEN
    RETURN 'justificado';
  ELSIF v IN ('licencia', 'descanso_medico') THEN
    RETURN 'licencia';
  ELSIF v IN ('vacaciones', 'feriado') THEN
    RETURN 'vacaciones';
  END IF;

  RETURN 'presente';
END;
$$;

CREATE OR REPLACE FUNCTION app.calc_horas_trabajadas(
  p_hora_entrada time,
  p_hora_salida time
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seconds numeric;
BEGIN
  IF p_hora_entrada IS NULL OR p_hora_salida IS NULL THEN
    RETURN 0;
  END IF;

  v_seconds := EXTRACT(EPOCH FROM (p_hora_salida - p_hora_entrada));
  IF v_seconds < 0 THEN
    v_seconds := v_seconds + 86400;
  END IF;

  RETURN ROUND((v_seconds / 3600.0)::numeric, 2);
END;
$$;

-- ----------------------------------------------------------------------------
-- asistencia
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asistencia
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS tardanza_minutos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turno text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS marcado_por uuid,
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.asistencia
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN fecha TYPE date USING app.to_date_or_null(COALESCE(fecha::text, '')),
  ALTER COLUMN hora_entrada TYPE time USING app.to_time_or_null(COALESCE(hora_entrada::text, '')),
  ALTER COLUMN hora_salida TYPE time USING app.to_time_or_null(COALESCE(hora_salida::text, '')),
  ALTER COLUMN horas_trabajadas TYPE numeric(6,2) USING app.to_numeric_or_zero(COALESCE(horas_trabajadas::text, '0')),
  ALTER COLUMN estado TYPE text USING app.normalize_asistencia_estado(estado),
  ALTER COLUMN tardanza_minutos TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(tardanza_minutos::text, '0')), 0),
  ALTER COLUMN turno TYPE text USING NULLIF(lower(btrim(COALESCE(turno, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN marcado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(marcado_por::text, '')),
  ALTER COLUMN origen TYPE text USING NULLIF(lower(btrim(COALESCE(origen, ''))), ''),
  ALTER COLUMN horas_trabajadas SET DEFAULT 0,
  ALTER COLUMN tardanza_minutos SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN origen SET DEFAULT 'manual',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.asistencia a
SET
  id_empleado = COALESCE(a.id_empleado, a.empleado_id),
  empleado_id = COALESCE(a.empleado_id, a.id_empleado),
  fecha = COALESCE(a.fecha, a.created_at::date, current_date),
  hora_entrada = app.to_time_or_null(COALESCE(a.hora_entrada::text, '')),
  hora_salida = app.to_time_or_null(COALESCE(a.hora_salida::text, '')),
  horas_trabajadas = GREATEST(
    LEAST(
      COALESCE(
        NULLIF(app.to_numeric_or_zero(COALESCE(a.horas_trabajadas::text, '0')), 0),
        app.calc_horas_trabajadas(
          app.to_time_or_null(COALESCE(a.hora_entrada::text, '')),
          app.to_time_or_null(COALESCE(a.hora_salida::text, ''))
        ),
        0
      ),
      24
    ),
    0
  ),
  estado = app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(a.estado, '')), ''),
      CASE
        WHEN app.to_time_or_null(COALESCE(a.hora_entrada::text, '')) IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  ),
  tardanza_minutos = GREATEST(LEAST(app.to_int_or_zero(COALESCE(a.tardanza_minutos::text, '0')), 1440), 0),
  turno = CASE
    WHEN NULLIF(lower(btrim(COALESCE(a.turno, ''))), '') IN ('manana', 'tarde', 'noche', 'mixto')
      THEN NULLIF(lower(btrim(COALESCE(a.turno, ''))), '')
    ELSE NULL
  END,
  observaciones = NULLIF(btrim(COALESCE(a.observaciones, '')), ''),
  origen = CASE
    WHEN NULLIF(lower(btrim(COALESCE(a.origen, ''))), '') IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema')
      THEN NULLIF(lower(btrim(COALESCE(a.origen, ''))), '')
    ELSE 'manual'
  END,
  activo = COALESCE(a.activo, true),
  metadata = COALESCE(
    CASE
      WHEN a.metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(a.metadata) = 'object' THEN a.metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  updated_at = now()
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_asistencia_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, NEW.empleado_id::text, ''));
  NEW.empleado_id := NEW.id_empleado;
  NEW.marcado_por := app.to_uuid_or_null(COALESCE(NEW.marcado_por::text, ''));
  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), NEW.created_at::date, current_date);
  NEW.hora_entrada := app.to_time_or_null(COALESCE(NEW.hora_entrada::text, ''));
  NEW.hora_salida := app.to_time_or_null(COALESCE(NEW.hora_salida::text, ''));

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NOT NULL THEN
    NEW.hora_entrada := NEW.hora_salida;
  END IF;

  NEW.horas_trabajadas := GREATEST(
    LEAST(
      COALESCE(
        NULLIF(app.to_numeric_or_zero(COALESCE(NEW.horas_trabajadas::text, '0')), 0),
        app.calc_horas_trabajadas(NEW.hora_entrada, NEW.hora_salida),
        0
      ),
      24
    ),
    0
  );

  NEW.tardanza_minutos := GREATEST(LEAST(app.to_int_or_zero(COALESCE(NEW.tardanza_minutos::text, '0')), 1440), 0);
  NEW.turno := NULLIF(lower(btrim(COALESCE(NEW.turno, ''))), '');
  IF NEW.turno IS NOT NULL AND NEW.turno NOT IN ('manana', 'tarde', 'noche', 'mixto') THEN
    NEW.turno := NULL;
  END IF;

  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.origen := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.origen, ''))), ''), 'manual');
  IF NEW.origen NOT IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema') THEN
    NEW.origen := 'manual';
  END IF;

  v_estado := app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      CASE
        WHEN NEW.hora_entrada IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  );

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NULL AND v_estado IN ('presente', 'tardanza') THEN
    v_estado := 'ausente';
    NEW.horas_trabajadas := 0;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NOT NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  END IF;

  IF NEW.tardanza_minutos > 0 AND v_estado = 'presente' THEN
    v_estado := 'tardanza';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.metadata := COALESCE(
    CASE
      WHEN NEW.metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(NEW.metadata) = 'object' THEN NEW.metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_asistencia_row ON public.asistencia;
CREATE TRIGGER trg_normalize_asistencia_row
BEFORE INSERT OR UPDATE ON public.asistencia
FOR EACH ROW
EXECUTE FUNCTION app.normalize_asistencia_row();

-- ----------------------------------------------------------------------------
-- asistencias (legacy)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asistencias
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS tardanza_minutos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turno text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS marcado_por uuid,
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.asistencias
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN id_empleado TYPE uuid USING app.to_uuid_or_null(COALESCE(id_empleado::text, '')),
  ALTER COLUMN empleado_id TYPE uuid USING app.to_uuid_or_null(COALESCE(empleado_id::text, '')),
  ALTER COLUMN fecha TYPE date USING app.to_date_or_null(COALESCE(fecha::text, '')),
  ALTER COLUMN hora_entrada TYPE time USING app.to_time_or_null(COALESCE(hora_entrada::text, '')),
  ALTER COLUMN hora_salida TYPE time USING app.to_time_or_null(COALESCE(hora_salida::text, '')),
  ALTER COLUMN horas_trabajadas TYPE numeric(6,2) USING app.to_numeric_or_zero(COALESCE(horas_trabajadas::text, '0')),
  ALTER COLUMN estado TYPE text USING app.normalize_asistencia_estado(estado),
  ALTER COLUMN tardanza_minutos TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(tardanza_minutos::text, '0')), 0),
  ALTER COLUMN turno TYPE text USING NULLIF(lower(btrim(COALESCE(turno, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN marcado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(marcado_por::text, '')),
  ALTER COLUMN origen TYPE text USING NULLIF(lower(btrim(COALESCE(origen, ''))), ''),
  ALTER COLUMN horas_trabajadas SET DEFAULT 0,
  ALTER COLUMN tardanza_minutos SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN origen SET DEFAULT 'manual',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.asistencias a
SET
  empleado_id = COALESCE(a.empleado_id, a.id_empleado),
  id_empleado = COALESCE(a.id_empleado, a.empleado_id),
  fecha = COALESCE(a.fecha, a.created_at::date, current_date),
  hora_entrada = app.to_time_or_null(COALESCE(a.hora_entrada::text, '')),
  hora_salida = app.to_time_or_null(COALESCE(a.hora_salida::text, '')),
  horas_trabajadas = GREATEST(
    LEAST(
      COALESCE(
        NULLIF(app.to_numeric_or_zero(COALESCE(a.horas_trabajadas::text, '0')), 0),
        app.calc_horas_trabajadas(
          app.to_time_or_null(COALESCE(a.hora_entrada::text, '')),
          app.to_time_or_null(COALESCE(a.hora_salida::text, ''))
        ),
        0
      ),
      24
    ),
    0
  ),
  estado = app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(a.estado, '')), ''),
      CASE
        WHEN app.to_time_or_null(COALESCE(a.hora_entrada::text, '')) IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  ),
  tardanza_minutos = GREATEST(LEAST(app.to_int_or_zero(COALESCE(a.tardanza_minutos::text, '0')), 1440), 0),
  turno = CASE
    WHEN NULLIF(lower(btrim(COALESCE(a.turno, ''))), '') IN ('manana', 'tarde', 'noche', 'mixto')
      THEN NULLIF(lower(btrim(COALESCE(a.turno, ''))), '')
    ELSE NULL
  END,
  observaciones = NULLIF(btrim(COALESCE(a.observaciones, '')), ''),
  origen = CASE
    WHEN NULLIF(lower(btrim(COALESCE(a.origen, ''))), '') IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema')
      THEN NULLIF(lower(btrim(COALESCE(a.origen, ''))), '')
    ELSE 'manual'
  END,
  activo = COALESCE(a.activo, true),
  metadata = COALESCE(
    CASE
      WHEN a.metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(a.metadata) = 'object' THEN a.metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  updated_at = now()
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_asistencias_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.empleado_id := app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, NEW.id_empleado::text, ''));
  NEW.id_empleado := NEW.empleado_id;
  NEW.marcado_por := app.to_uuid_or_null(COALESCE(NEW.marcado_por::text, ''));
  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), NEW.created_at::date, current_date);
  NEW.hora_entrada := app.to_time_or_null(COALESCE(NEW.hora_entrada::text, ''));
  NEW.hora_salida := app.to_time_or_null(COALESCE(NEW.hora_salida::text, ''));

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NOT NULL THEN
    NEW.hora_entrada := NEW.hora_salida;
  END IF;

  NEW.horas_trabajadas := GREATEST(
    LEAST(
      COALESCE(
        NULLIF(app.to_numeric_or_zero(COALESCE(NEW.horas_trabajadas::text, '0')), 0),
        app.calc_horas_trabajadas(NEW.hora_entrada, NEW.hora_salida),
        0
      ),
      24
    ),
    0
  );

  NEW.tardanza_minutos := GREATEST(LEAST(app.to_int_or_zero(COALESCE(NEW.tardanza_minutos::text, '0')), 1440), 0);
  NEW.turno := NULLIF(lower(btrim(COALESCE(NEW.turno, ''))), '');
  IF NEW.turno IS NOT NULL AND NEW.turno NOT IN ('manana', 'tarde', 'noche', 'mixto') THEN
    NEW.turno := NULL;
  END IF;

  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.origen := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.origen, ''))), ''), 'manual');
  IF NEW.origen NOT IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema') THEN
    NEW.origen := 'manual';
  END IF;

  v_estado := app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      CASE
        WHEN NEW.hora_entrada IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  );

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NULL AND v_estado IN ('presente', 'tardanza') THEN
    v_estado := 'ausente';
    NEW.horas_trabajadas := 0;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NOT NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  END IF;

  IF NEW.tardanza_minutos > 0 AND v_estado = 'presente' THEN
    v_estado := 'tardanza';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.metadata := COALESCE(
    CASE
      WHEN NEW.metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(NEW.metadata) = 'object' THEN NEW.metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_asistencias_row ON public.asistencias;
CREATE TRIGGER trg_normalize_asistencias_row
BEFORE INSERT OR UPDATE ON public.asistencias
FOR EACH ROW
EXECUTE FUNCTION app.normalize_asistencias_row();

-- ----------------------------------------------------------------------------
-- Sync bidireccional reforzado (canonico <-> legacy)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_asistencia_to_asistencias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL OR NEW.id_empleado IS NULL OR NEW.fecha IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.asistencias (
    tenant_id, empleado_id, id_empleado, fecha,
    hora_entrada, hora_salida, horas_trabajadas, estado,
    tardanza_minutos, turno, observaciones, marcado_por, origen,
    activo, metadata, created_at, updated_at
  )
  VALUES (
    NEW.tenant_id, NEW.id_empleado, NEW.id_empleado, NEW.fecha,
    NEW.hora_entrada, NEW.hora_salida, COALESCE(NEW.horas_trabajadas, 0), NEW.estado,
    COALESCE(NEW.tardanza_minutos, 0), NEW.turno, NEW.observaciones, NEW.marcado_por, NEW.origen,
    COALESCE(NEW.activo, true), COALESCE(NEW.metadata, '{}'::jsonb), COALESCE(NEW.created_at, now()), now()
  )
  ON CONFLICT (tenant_id, empleado_id, fecha) DO UPDATE
  SET
    id_empleado = EXCLUDED.id_empleado,
    hora_entrada = EXCLUDED.hora_entrada,
    hora_salida = EXCLUDED.hora_salida,
    horas_trabajadas = EXCLUDED.horas_trabajadas,
    estado = EXCLUDED.estado,
    tardanza_minutos = EXCLUDED.tardanza_minutos,
    turno = EXCLUDED.turno,
    observaciones = EXCLUDED.observaciones,
    marcado_por = EXCLUDED.marcado_por,
    origen = EXCLUDED.origen,
    activo = EXCLUDED.activo,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_asistencia_to_asistencias ON public.asistencia;
CREATE TRIGGER trg_sync_asistencia_to_asistencias
AFTER INSERT OR UPDATE ON public.asistencia
FOR EACH ROW
EXECUTE FUNCTION app.sync_asistencia_to_asistencias();

CREATE OR REPLACE FUNCTION app.sync_asistencias_to_asistencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL OR NEW.empleado_id IS NULL OR NEW.fecha IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.asistencia (
    tenant_id, id_empleado, empleado_id, fecha,
    hora_entrada, hora_salida, horas_trabajadas, estado,
    tardanza_minutos, turno, observaciones, marcado_por, origen,
    activo, metadata, created_at, updated_at
  )
  VALUES (
    NEW.tenant_id, NEW.empleado_id, NEW.empleado_id, NEW.fecha,
    NEW.hora_entrada, NEW.hora_salida, COALESCE(NEW.horas_trabajadas, 0), NEW.estado,
    COALESCE(NEW.tardanza_minutos, 0), NEW.turno, NEW.observaciones, NEW.marcado_por, NEW.origen,
    COALESCE(NEW.activo, true), COALESCE(NEW.metadata, '{}'::jsonb), COALESCE(NEW.created_at, now()), now()
  )
  ON CONFLICT (tenant_id, id_empleado, fecha) DO UPDATE
  SET
    empleado_id = EXCLUDED.empleado_id,
    hora_entrada = EXCLUDED.hora_entrada,
    hora_salida = EXCLUDED.hora_salida,
    horas_trabajadas = EXCLUDED.horas_trabajadas,
    estado = EXCLUDED.estado,
    tardanza_minutos = EXCLUDED.tardanza_minutos,
    turno = EXCLUDED.turno,
    observaciones = EXCLUDED.observaciones,
    marcado_por = EXCLUDED.marcado_por,
    origen = EXCLUDED.origen,
    activo = EXCLUDED.activo,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_asistencias_to_asistencia ON public.asistencias;
CREATE TRIGGER trg_sync_asistencias_to_asistencia
AFTER INSERT OR UPDATE ON public.asistencias
FOR EACH ROW
EXECUTE FUNCTION app.sync_asistencias_to_asistencia();

-- Backfill bidireccional inicial.
INSERT INTO public.asistencias (
  tenant_id, empleado_id, id_empleado, fecha,
  hora_entrada, hora_salida, horas_trabajadas, estado,
  tardanza_minutos, turno, observaciones, marcado_por, origen,
  activo, metadata, created_at, updated_at
)
SELECT
  a.tenant_id,
  a.id_empleado,
  COALESCE(a.id_empleado, a.empleado_id),
  a.fecha,
  a.hora_entrada,
  a.hora_salida,
  COALESCE(a.horas_trabajadas, 0),
  a.estado,
  COALESCE(a.tardanza_minutos, 0),
  a.turno,
  a.observaciones,
  a.marcado_por,
  a.origen,
  COALESCE(a.activo, true),
  COALESCE(a.metadata, '{}'::jsonb),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.asistencia a
WHERE a.tenant_id IS NOT NULL
  AND a.id_empleado IS NOT NULL
  AND a.fecha IS NOT NULL
ON CONFLICT (tenant_id, empleado_id, fecha) DO UPDATE
SET
  id_empleado = EXCLUDED.id_empleado,
  hora_entrada = EXCLUDED.hora_entrada,
  hora_salida = EXCLUDED.hora_salida,
  horas_trabajadas = EXCLUDED.horas_trabajadas,
  estado = EXCLUDED.estado,
  tardanza_minutos = EXCLUDED.tardanza_minutos,
  turno = EXCLUDED.turno,
  observaciones = EXCLUDED.observaciones,
  marcado_por = EXCLUDED.marcado_por,
  origen = EXCLUDED.origen,
  activo = EXCLUDED.activo,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.asistencia (
  tenant_id, id_empleado, empleado_id, fecha,
  hora_entrada, hora_salida, horas_trabajadas, estado,
  tardanza_minutos, turno, observaciones, marcado_por, origen,
  activo, metadata, created_at, updated_at
)
SELECT
  a.tenant_id,
  a.empleado_id,
  COALESCE(a.empleado_id, a.id_empleado),
  a.fecha,
  a.hora_entrada,
  a.hora_salida,
  COALESCE(a.horas_trabajadas, 0),
  a.estado,
  COALESCE(a.tardanza_minutos, 0),
  a.turno,
  a.observaciones,
  a.marcado_por,
  a.origen,
  COALESCE(a.activo, true),
  COALESCE(a.metadata, '{}'::jsonb),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.asistencias a
WHERE a.tenant_id IS NOT NULL
  AND a.empleado_id IS NOT NULL
  AND a.fecha IS NOT NULL
ON CONFLICT (tenant_id, id_empleado, fecha) DO UPDATE
SET
  empleado_id = EXCLUDED.empleado_id,
  hora_entrada = EXCLUDED.hora_entrada,
  hora_salida = EXCLUDED.hora_salida,
  horas_trabajadas = EXCLUDED.horas_trabajadas,
  estado = EXCLUDED.estado,
  tardanza_minutos = EXCLUDED.tardanza_minutos,
  turno = EXCLUDED.turno,
  observaciones = EXCLUDED.observaciones,
  marcado_por = EXCLUDED.marcado_por,
  origen = EXCLUDED.origen,
  activo = EXCLUDED.activo,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Indices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_fecha_estado_runtime
ON public.asistencia (tenant_id, fecha DESC, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_empleado_fecha_runtime
ON public.asistencia (tenant_id, id_empleado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_tardanza_runtime
ON public.asistencia (tenant_id, fecha DESC, tardanza_minutos DESC)
WHERE tenant_id IS NOT NULL
  AND tardanza_minutos > 0;

CREATE INDEX IF NOT EXISTS idx_asistencias_tenant_fecha_estado_runtime
ON public.asistencias (tenant_id, fecha DESC, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asistencias_tenant_empleado_fecha_runtime
ON public.asistencias (tenant_id, empleado_id, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asistencias_tenant_tardanza_runtime
ON public.asistencias (tenant_id, fecha DESC, tardanza_minutos DESC)
WHERE tenant_id IS NOT NULL
  AND tardanza_minutos > 0;

SELECT app.apply_tenant_policy('public', 'asistencia');
SELECT app.apply_tenant_policy('public', 'asistencias');

CREATE OR REPLACE VIEW public.v_asistencia_unificada AS
WITH base AS (
  SELECT
    a.tenant_id,
    a.id_empleado AS empleado_id,
    a.fecha,
    a.hora_entrada,
    a.hora_salida,
    a.horas_trabajadas,
    a.estado,
    a.created_at,
    a.updated_at,
    'asistencia'::text AS source_table
  FROM public.asistencia a

  UNION ALL

  SELECT
    a.tenant_id,
    a.empleado_id,
    a.fecha,
    a.hora_entrada,
    a.hora_salida,
    a.horas_trabajadas,
    a.estado,
    a.created_at,
    a.updated_at,
    'asistencias'::text AS source_table
  FROM public.asistencias a
),
ranked AS (
  SELECT
    b.*,
    row_number() OVER (
      PARTITION BY b.tenant_id, b.empleado_id, b.fecha
      ORDER BY
        CASE WHEN b.source_table = 'asistencia' THEN 0 ELSE 1 END,
        b.updated_at DESC NULLS LAST,
        b.created_at DESC NULLS LAST
    ) AS rn
  FROM base b
  WHERE b.tenant_id IS NOT NULL
    AND b.empleado_id IS NOT NULL
    AND b.fecha IS NOT NULL
)
SELECT
  r.tenant_id,
  r.empleado_id,
  r.fecha,
  r.hora_entrada,
  r.hora_salida,
  COALESCE(r.horas_trabajadas, 0)::numeric(6,2) AS horas_trabajadas,
  r.estado,
  r.created_at,
  r.updated_at,
  r.source_table
FROM ranked r
WHERE r.rn = 1;

CREATE OR REPLACE FUNCTION public.get_asistencia_unificada(
  p_tenant_id uuid,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  empleado_id uuid,
  fecha date,
  hora_entrada time,
  hora_salida time,
  horas_trabajadas numeric,
  estado text,
  source_table text
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT
    v.tenant_id,
    v.empleado_id,
    v.fecha,
    v.hora_entrada,
    v.hora_salida,
    v.horas_trabajadas,
    v.estado,
    v.source_table
  FROM public.v_asistencia_unificada v
  WHERE v.tenant_id = p_tenant_id
    AND (p_fecha_desde IS NULL OR v.fecha >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR v.fecha <= p_fecha_hasta)
  ORDER BY v.fecha DESC, v.empleado_id;
$$;

COMMIT;
