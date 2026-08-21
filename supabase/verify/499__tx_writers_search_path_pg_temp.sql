-- Verificador 499: ninguna función `_tx` con SECURITY DEFINER deja el esquema
-- temporal por delante de los reales.
--
-- La comprobación no se limita a las diez que arregló la migración: se aplica a
-- todas las `_tx` con SECURITY DEFINER, de modo que una función nueva que nazca
-- sin `pg_temp` en su `search_path` rompe aquí. Ése es el punto — la 498 y la 497
-- cerraron defectos que reaparecen solos, y éste es de los mismos: nadie se
-- acuerda del `search_path` al escribir el writer número 285.
--
-- También se comprueba lo contrario, que la ruta esté fijada: una función
-- SECURITY DEFINER sin `SET search_path` es el mismo problema en su forma más
-- cruda.

BEGIN;

DO $verify$
DECLARE
  v_sin_path integer;
  v_sin_temp integer;
  v_total integer;
  v_ejemplo text;
BEGIN
  SELECT count(*) INTO v_total
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'app')
    AND p.proname LIKE '%\_tx'
    AND p.prosecdef;

  IF v_total < 250 THEN
    RAISE EXCEPTION 'VERIFY_499: sólo % funciones _tx con SECURITY DEFINER; la comprobación no está midiendo lo que cree', v_total;
  END IF;

  ---------------------------------------------------------------------------
  -- 1. Todas fijan search_path
  ---------------------------------------------------------------------------
  SELECT count(*), min(n.nspname || '.' || p.proname)
  INTO v_sin_path, v_ejemplo
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'app')
    AND p.proname LIKE '%\_tx'
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS c(v)
      WHERE c.v LIKE 'search_path=%'
    );

  IF v_sin_path > 0 THEN
    RAISE EXCEPTION 'VERIFY_499: % funciones _tx SECURITY DEFINER sin SET search_path (ej. %)', v_sin_path, v_ejemplo;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Todas nombran pg_temp, para que no se busque el primero
  ---------------------------------------------------------------------------
  SELECT count(*), min(n.nspname || '.' || p.proname)
  INTO v_sin_temp, v_ejemplo
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'app')
    AND p.proname LIKE '%\_tx'
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS c(v)
      WHERE c.v LIKE 'search_path=%' AND c.v LIKE '%pg_temp%'
    );

  IF v_sin_temp > 0 THEN
    RAISE EXCEPTION 'VERIFY_499: % funciones _tx SECURITY DEFINER sin pg_temp en search_path (ej. %)', v_sin_temp, v_ejemplo;
  END IF;

  RAISE NOTICE 'VERIFY_499 OK: % funciones _tx SECURITY DEFINER, todas con search_path fijado y pg_temp nombrado', v_total;
END;
$verify$;

COMMIT;
