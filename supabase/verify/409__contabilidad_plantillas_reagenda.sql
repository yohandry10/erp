DO $$
DECLARE
  v_desalineadas integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.plantillas_asientos'::regclass
      AND tgname = 'trg_reagendar_plantilla_sin_ejecucion_409'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Falta el trigger de reagenda de plantillas';
  END IF;

  SELECT count(*) INTO v_desalineadas
  FROM public.plantillas_asientos
  WHERE ultima_ejecucion IS NULL
    AND upper(COALESCE(periodicidad, 'NINGUNA')) <> 'NINGUNA'
    AND fecha_inicio IS NOT NULL
    AND (proxima_ejecucion IS NULL OR proxima_ejecucion < fecha_inicio);

  IF v_desalineadas <> 0 THEN
    RAISE EXCEPTION 'Persisten % plantillas sin ejecutar con agenda obsoleta', v_desalineadas;
  END IF;
END
$$;
