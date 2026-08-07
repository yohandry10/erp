-- Reagenda una plantilla recurrente aún no ejecutada cuando cambia su fecha o
-- periodicidad. Evita conservar una proxima_ejecucion obsoleta tras editarla.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.reagendar_plantilla_sin_ejecucion_409()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $function$
BEGIN
  IF NEW.ultima_ejecucion IS NULL
     AND (
       NEW.periodicidad IS DISTINCT FROM OLD.periodicidad
       OR NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio
       OR NEW.dia_ejecucion IS DISTINCT FROM OLD.dia_ejecucion
     ) THEN
    NEW.proxima_ejecucion := CASE
      WHEN upper(COALESCE(NEW.periodicidad, 'NINGUNA')) = 'NINGUNA' THEN NULL
      ELSE COALESCE(NEW.fecha_inicio, CURRENT_DATE)
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reagendar_plantilla_sin_ejecucion_409
ON public.plantillas_asientos;
CREATE TRIGGER trg_reagendar_plantilla_sin_ejecucion_409
BEFORE UPDATE OF periodicidad, fecha_inicio, dia_ejecucion
ON public.plantillas_asientos
FOR EACH ROW
EXECUTE FUNCTION app.reagendar_plantilla_sin_ejecucion_409();

UPDATE public.plantillas_asientos
SET proxima_ejecucion = fecha_inicio,
    updated_at = now()
WHERE ultima_ejecucion IS NULL
  AND upper(COALESCE(periodicidad, 'NINGUNA')) <> 'NINGUNA'
  AND fecha_inicio IS NOT NULL
  AND (proxima_ejecucion IS NULL OR proxima_ejecucion < fecha_inicio);

COMMIT;
