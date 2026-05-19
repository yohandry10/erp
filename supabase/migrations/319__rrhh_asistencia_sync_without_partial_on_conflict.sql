BEGIN;

-- Los triggers de sincronizacion asistencia/asistencias no pueden usar
-- ON CONFLICT contra indices unicos parciales. Postgres requiere una
-- constraint o indice unico no parcial que cubra exactamente el conflicto.
-- Este runtime usa indices parciales para permitir filas historicas incompletas,
-- asi que el sync debe hacer UPDATE-then-INSERT de forma explicita.

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

  UPDATE public.asistencias
  SET
    id_empleado = NEW.id_empleado,
    hora_entrada = NEW.hora_entrada,
    hora_salida = NEW.hora_salida,
    horas_trabajadas = COALESCE(NEW.horas_trabajadas, 0),
    estado = NEW.estado,
    tardanza_minutos = COALESCE(NEW.tardanza_minutos, 0),
    turno = NEW.turno,
    observaciones = NEW.observaciones,
    marcado_por = NEW.marcado_por,
    origen = NEW.origen,
    activo = COALESCE(NEW.activo, true),
    metadata = COALESCE(NEW.metadata, '{}'::jsonb),
    updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND empleado_id = NEW.id_empleado
    AND fecha = NEW.fecha;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  BEGIN
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
    );
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.asistencias
    SET
      id_empleado = NEW.id_empleado,
      hora_entrada = NEW.hora_entrada,
      hora_salida = NEW.hora_salida,
      horas_trabajadas = COALESCE(NEW.horas_trabajadas, 0),
      estado = NEW.estado,
      tardanza_minutos = COALESCE(NEW.tardanza_minutos, 0),
      turno = NEW.turno,
      observaciones = NEW.observaciones,
      marcado_por = NEW.marcado_por,
      origen = NEW.origen,
      activo = COALESCE(NEW.activo, true),
      metadata = COALESCE(NEW.metadata, '{}'::jsonb),
      updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND empleado_id = NEW.id_empleado
      AND fecha = NEW.fecha;
  END;

  RETURN NEW;
END;
$$;

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

  UPDATE public.asistencia
  SET
    empleado_id = NEW.empleado_id,
    hora_entrada = NEW.hora_entrada,
    hora_salida = NEW.hora_salida,
    horas_trabajadas = COALESCE(NEW.horas_trabajadas, 0),
    estado = NEW.estado,
    tardanza_minutos = COALESCE(NEW.tardanza_minutos, 0),
    turno = NEW.turno,
    observaciones = NEW.observaciones,
    marcado_por = NEW.marcado_por,
    origen = NEW.origen,
    activo = COALESCE(NEW.activo, true),
    metadata = COALESCE(NEW.metadata, '{}'::jsonb),
    updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND id_empleado = NEW.empleado_id
    AND fecha = NEW.fecha;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  BEGIN
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
    );
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.asistencia
    SET
      empleado_id = NEW.empleado_id,
      hora_entrada = NEW.hora_entrada,
      hora_salida = NEW.hora_salida,
      horas_trabajadas = COALESCE(NEW.horas_trabajadas, 0),
      estado = NEW.estado,
      tardanza_minutos = COALESCE(NEW.tardanza_minutos, 0),
      turno = NEW.turno,
      observaciones = NEW.observaciones,
      marcado_por = NEW.marcado_por,
      origen = NEW.origen,
      activo = COALESCE(NEW.activo, true),
      metadata = COALESCE(NEW.metadata, '{}'::jsonb),
      updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND id_empleado = NEW.empleado_id
      AND fecha = NEW.fecha;
  END;

  RETURN NEW;
END;
$$;

COMMIT;
