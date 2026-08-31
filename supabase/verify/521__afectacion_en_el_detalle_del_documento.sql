-- Verificador 521: el detalle de un documento tiene que decir su afectacion.
--
-- Por que hace falta:
--
-- `crear_nota_referenciada_legacy_494` --la funcion que arma una nota de
-- credito o debito-- clasifica cada linea leyendo
-- `documento_detalles.metadata->>'afectacion_igv'`, y si no esta cae a un
-- respaldo:
--
--     coalesce(nullif(v_line.metadata->>'afectacion_igv', ''),
--              CASE WHEN v_line_igv > 0 THEN '10' ELSE '20' END)
--
-- El camino del POS (migracion 476) escribia en ese metadata solo `source` y
-- un fingerprint: la afectacion viajaba en `cpe.items`, no ahi. Asi que el
-- respaldo disparaba **siempre**. Lo gravado y lo exonerado salian bien por
-- casualidad --uno paga IGV y el otro no--, pero **inafecto (30) y exportacion
-- (40) tambien tienen IGV cero**, de modo que una nota sobre una venta con esos
-- items los declaraba como exonerados: esquema 9997/E en vez de 9998/O o 9995.
--
-- Se comprobo el 2026-08-28 en una venta real: el metadata de la linea traia
-- unicamente {"source":"pos.atomic.476","pos_finalization_fingerprint":"..."}.

BEGIN;

DO $verify$
DECLARE
  v_fuente text;
  v_metadata jsonb;
  v_afectacion text;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. La funcion del POS escribe la afectacion en el metadata del detalle
  ---------------------------------------------------------------------------
  -- Desde la 530 la frontera publica es un wrapper que enlaza la reserva DIAN
  -- y la implementacion de la 521 queda preservada con nombre explicito. Este
  -- verificador debe inspeccionar esa implementacion, que es donde se arma el
  -- INSERT del detalle, y seguir funcionando antes de que exista la 530.
  SELECT pg_get_functiondef(p.oid) INTO v_fuente
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = CASE
      WHEN to_regprocedure(
        'public.finalizar_cpe_pos_tx_521_legacy_530(uuid,uuid,uuid,jsonb,text)'
      ) IS NOT NULL
        THEN 'finalizar_cpe_pos_tx_521_legacy_530'
      ELSE 'finalizar_cpe_pos_tx'
    END;

  IF v_fuente IS NULL THEN
    RAISE EXCEPTION 'VERIFY_521: no existe public.finalizar_cpe_pos_tx';
  END IF;

  -- Se mira el INSERT en documento_detalles, no la funcion entera: la
  -- afectacion ya aparece en otras partes (los items del CPE) y buscarla suelta
  -- daria verde sin comprobar nada.
  IF position('pos_finalization_fingerprint' in v_fuente) = 0 THEN
    RAISE EXCEPTION
      'VERIFY_521: finalizar_cpe_pos_tx ya no arma el metadata del detalle como se esperaba; '
      'revisar a mano antes de dar por bueno este verificador';
  END IF;

  IF v_fuente !~ 'jsonb_build_object\(\s*''source''\s*,\s*''pos\.atomic\.[0-9]+''\s*,\s*''pos_finalization_fingerprint''\s*,\s*v_fp\s*,\s*''afectacion_igv''' THEN
    RAISE EXCEPTION
      'VERIFY_521: el detalle que escribe el POS no lleva afectacion_igv en su metadata, '
      'asi que la nota de credito clasificara inafecto y exportacion como exonerado';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Y el respaldo de la nota sigue siendo el que se esta cubriendo
  ---------------------------------------------------------------------------
  -- Si alguien cambia la nota para no depender del metadata, este verificador
  -- estaria protegiendo algo que ya no importa y hay que revisarlo.
  SELECT pg_get_functiondef(p.oid) INTO v_fuente
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'crear_nota_referenciada_legacy_494';

  IF v_fuente IS NULL THEN
    RAISE EXCEPTION 'VERIFY_521: no existe crear_nota_referenciada_legacy_494';
  END IF;

  IF position('metadata->>''afectacion_igv''' in v_fuente) = 0 THEN
    RAISE EXCEPTION
      'VERIFY_521: la nota ya no lee la afectacion del metadata del detalle; '
      'este verificador cubre un contrato que cambio y hay que rehacerlo';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Control positivo: la comprobacion sabe ver un metadata sin afectacion
  ---------------------------------------------------------------------------
  v_metadata := jsonb_build_object('source', 'pos.atomic.476',
                                   'pos_finalization_fingerprint', 'abc');
  v_afectacion := coalesce(nullif(v_metadata->>'afectacion_igv', ''),
                           CASE WHEN 0 > 0 THEN '10' ELSE '20' END);
  IF v_afectacion <> '20' THEN
    RAISE EXCEPTION
      'VERIFY_521: el respaldo de la nota no se comporta como se creia (%), '
      'la premisa de este verificador es falsa', v_afectacion;
  END IF;

  v_metadata := v_metadata || jsonb_build_object('afectacion_igv', '30');
  v_afectacion := coalesce(nullif(v_metadata->>'afectacion_igv', ''),
                           CASE WHEN 0 > 0 THEN '10' ELSE '20' END);
  IF v_afectacion <> '30' THEN
    RAISE EXCEPTION
      'VERIFY_521: con la afectacion en el metadata la nota deberia leer 30 y leyo %',
      v_afectacion;
  END IF;

  RAISE NOTICE
    'VERIFY_521 OK: el detalle que escribe el POS lleva su afectacion, asi que una nota sobre esa venta no convierte inafecto ni exportacion en exonerado';
END;
$verify$;

ROLLBACK;
