-- ============================================================================
-- 045__rrhh_asistencia_legacy_sync.sql
-- Sincroniza tablas legacy/canónica: asistencia <-> asistencias.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Deduplicación defensiva por (tenant, empleado, fecha) antes de índices únicos
-- ----------------------------------------------------------------------------
DELETE FROM public.asistencia a
USING public.asistencia b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.id_empleado = b.id_empleado
  AND a.fecha = b.fecha;

DELETE FROM public.asistencias a
USING public.asistencias b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.empleado_id = b.empleado_id
  AND a.fecha = b.fecha;

-- Índices de unicidad funcional (idempotencia por día)
CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencia_tenant_empleado_fecha
ON public.asistencia (tenant_id, id_empleado, fecha);

CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencias_tenant_empleado_fecha
ON public.asistencias (tenant_id, empleado_id, fecha);

-- ----------------------------------------------------------------------------
-- Trigger: asistencia -> asistencias
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
    tenant_id,
    empleado_id,
    fecha,
    hora_entrada,
    hora_salida,
    horas_trabajadas,
    estado,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    NEW.tenant_id,
    NEW.id_empleado,
    NEW.fecha,
    NEW.hora_entrada,
    NEW.hora_salida,
    COALESCE(NEW.horas_trabajadas, 0),
    NEW.estado,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (tenant_id, empleado_id, fecha) DO UPDATE
  SET
    hora_entrada = EXCLUDED.hora_entrada,
    hora_salida = EXCLUDED.hora_salida,
    horas_trabajadas = EXCLUDED.horas_trabajadas,
    estado = EXCLUDED.estado,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_asistencia_to_asistencias ON public.asistencia;

CREATE TRIGGER trg_sync_asistencia_to_asistencias
AFTER INSERT OR UPDATE
ON public.asistencia
FOR EACH ROW
EXECUTE FUNCTION app.sync_asistencia_to_asistencias();

-- ----------------------------------------------------------------------------
-- Trigger: asistencias -> asistencia
-- ----------------------------------------------------------------------------
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
    tenant_id,
    id_empleado,
    fecha,
    hora_entrada,
    hora_salida,
    horas_trabajadas,
    estado,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    NEW.tenant_id,
    NEW.empleado_id,
    NEW.fecha,
    NEW.hora_entrada,
    NEW.hora_salida,
    COALESCE(NEW.horas_trabajadas, 0),
    NEW.estado,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (tenant_id, id_empleado, fecha) DO UPDATE
  SET
    hora_entrada = EXCLUDED.hora_entrada,
    hora_salida = EXCLUDED.hora_salida,
    horas_trabajadas = EXCLUDED.horas_trabajadas,
    estado = EXCLUDED.estado,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_asistencias_to_asistencia ON public.asistencias;

CREATE TRIGGER trg_sync_asistencias_to_asistencia
AFTER INSERT OR UPDATE
ON public.asistencias
FOR EACH ROW
EXECUTE FUNCTION app.sync_asistencias_to_asistencia();

-- ----------------------------------------------------------------------------
-- Backfill bidireccional inicial
-- ----------------------------------------------------------------------------
INSERT INTO public.asistencias (
  tenant_id,
  empleado_id,
  fecha,
  hora_entrada,
  hora_salida,
  horas_trabajadas,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  a.tenant_id,
  a.id_empleado,
  a.fecha,
  a.hora_entrada,
  a.hora_salida,
  COALESCE(a.horas_trabajadas, 0),
  a.estado,
  COALESCE(a.metadata, '{}'::jsonb),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.asistencia a
WHERE a.tenant_id IS NOT NULL
  AND a.id_empleado IS NOT NULL
  AND a.fecha IS NOT NULL
ON CONFLICT (tenant_id, empleado_id, fecha) DO UPDATE
SET
  hora_entrada = EXCLUDED.hora_entrada,
  hora_salida = EXCLUDED.hora_salida,
  horas_trabajadas = EXCLUDED.horas_trabajadas,
  estado = EXCLUDED.estado,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.asistencia (
  tenant_id,
  id_empleado,
  fecha,
  hora_entrada,
  hora_salida,
  horas_trabajadas,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  a.tenant_id,
  a.empleado_id,
  a.fecha,
  a.hora_entrada,
  a.hora_salida,
  COALESCE(a.horas_trabajadas, 0),
  a.estado,
  COALESCE(a.metadata, '{}'::jsonb),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.asistencias a
WHERE a.tenant_id IS NOT NULL
  AND a.empleado_id IS NOT NULL
  AND a.fecha IS NOT NULL
ON CONFLICT (tenant_id, id_empleado, fecha) DO UPDATE
SET
  hora_entrada = EXCLUDED.hora_entrada,
  hora_salida = EXCLUDED.hora_salida,
  horas_trabajadas = EXCLUDED.horas_trabajadas,
  estado = EXCLUDED.estado,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;

