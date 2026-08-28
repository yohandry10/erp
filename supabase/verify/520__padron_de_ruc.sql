-- Verificador 520: la cache del padron guarda lo que hace falta y no filtra.
--
-- Tres comprobaciones, y la tercera es la que de verdad protege:
--
--   1. Que la tabla exista con las columnas que decide un contador: `estado` y
--      `condicion`. Sin `condicion` no se puede avisar de un proveedor NO
--      HABIDO, que es la razon de ser de todo esto.
--
--   2. Que rechace un RUC que no tenga once digitos. Una cache de identidades
--      fiscales con basura dentro es peor que no tenerla: se consulta, responde
--      algo, y nadie vuelve a mirar.
--
--   3. Que **`anon` no la pueda leer**. Es informacion publica de SUNAT, pero
--      la tabla dice quien es cliente o proveedor de quien: la lista de RUC que
--      un sistema ha consultado no es publica aunque cada RUC lo sea.

BEGIN;

DO $verify$
DECLARE
  v_faltan text;
  v_rechazado boolean := false;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Las columnas que deciden
  ---------------------------------------------------------------------------
  SELECT string_agg(c, ', ') INTO v_faltan
  FROM unnest(ARRAY['ruc', 'razon_social', 'estado', 'condicion', 'fuente', 'consultado_en']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'padron_ruc' AND column_name = c
  );

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_520: a padron_ruc le faltan columnas: %. Sin `condicion` no se puede avisar '
      'de un proveedor NO HABIDO, que es para lo que existe la tabla.', v_faltan;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. No admite un RUC que no lo sea
  ---------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.padron_ruc (ruc, fuente) VALUES ('123', 'verificador 520');
  EXCEPTION WHEN check_violation THEN
    v_rechazado := true;
  END;

  IF NOT v_rechazado THEN
    RAISE EXCEPTION
      'VERIFY_520: se admitio «123» como RUC. Una cache de identidades fiscales con basura '
      'dentro responde algo y nadie vuelve a mirar.';
  END IF;

  -- Y uno correcto si entra.
  INSERT INTO public.padron_ruc (ruc, razon_social, estado, condicion, fuente)
  VALUES ('20100070970', 'PRUEBA DEL VERIFICADOR', 'ACTIVO', 'HABIDO', 'verificador 520');

  PERFORM 1 FROM public.padron_ruc WHERE ruc = '20100070970';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERIFY_520: no se pudo guardar un RUC valido, asi que la comprobacion '
                    'anterior paso sin mirar nada';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. `anon` no la lee
  ---------------------------------------------------------------------------
  IF has_table_privilege('anon', 'public.padron_ruc', 'SELECT') THEN
    RAISE EXCEPTION
      'VERIFY_520: anon puede leer padron_ruc. Cada RUC es publico, pero la lista de los que '
      'este sistema ha consultado dice quien es cliente o proveedor de quien, y eso no lo es.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.padron_ruc', 'INSERT') THEN
    RAISE EXCEPTION
      'VERIFY_520: service_role no puede escribir en padron_ruc, asi que el API no podria '
      'guardar lo que consulta y preguntaria a la fuente en cada pantalla.';
  END IF;

  RAISE NOTICE
    'VERIFY_520 OK: la cache del padron tiene estado y condicion, rechaza un RUC invalido y no la lee anon';
END;
$verify$;

ROLLBACK;
