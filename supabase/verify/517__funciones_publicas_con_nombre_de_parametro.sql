-- Verificador 517: una funcion publica sin nombres de parametro no la puede
-- llamar el API.
--
-- Por que hacia falta este verificador, que es lo mas util de todo esto:
--
-- Catorce funciones de escritura llevaban meses inalcanzables desde el API y
-- **todos los verificadores que las prueban pasaban en verde**. No es que
-- miraran mal: es que las llaman desde SQL con argumentos posicionales
--
--     SELECT public.gestionar_maestro_contable_tx(v_tenant, v_actor, 'FX', ...)
--
-- y asi funcionan perfectamente. PostgREST, en cambio, solo sabe llamarlas por
-- **nombre de parametro** --es como las llama supabase-js-- y si el envoltorio
-- se declaro con los tipos a secas responde `PGRST202: Could not find the
-- function ... in the schema cache`.
--
-- O sea: el contrato que se estaba comprobando no era el que usa el producto.
-- Por eso aqui no se comprueba llamando, sino mirando el catalogo.

BEGIN;

DO $verify$
DECLARE
  v_sin_nombres text;
  v_total integer;
  v_nombres text[];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Ninguna funcion publica SECURITY DEFINER se queda sin nombres
  ---------------------------------------------------------------------------
  -- Se acota a SECURITY DEFINER porque esas son las nuestras: las de las
  -- extensiones (citext y compania) no lo son, y no las llama el API.
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', '
                    ORDER BY p.proname),
         count(*)
    INTO v_sin_nombres, v_total
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.pronargs > 0
    AND p.proargnames IS NULL
    AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  IF v_sin_nombres IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_517: % funciones publicas declaran sus parametros sin nombre, asi que PostgREST '
      'no las puede llamar y el API recibe PGRST202: %. Se arreglan recreandolas con los '
      'nombres que el codigo ya envia.', v_total, v_sin_nombres;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Y los nombres son los que el codigo envia, no unos cualesquiera
  ---------------------------------------------------------------------------
  -- Poner nombres inventados dejaria pasar la comprobacion de arriba y el API
  -- seguiria recibiendo PGRST202, que es exactamente el fallo que se corrige.
  SELECT p.proargnames INTO v_nombres
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'gestionar_maestro_contable_tx';

  IF v_nombres IS DISTINCT FROM ARRAY[
       'p_tenant_id','p_actor_id','p_entity','p_action','p_record_id','p_payload','p_idempotency_key'
     ] THEN
    RAISE EXCEPTION
      'VERIFY_517: gestionar_maestro_contable_tx declara los parametros % y el API envia '
      'p_tenant_id, p_actor_id, p_entity, p_action, p_record_id, p_payload, p_idempotency_key',
      coalesce(array_to_string(v_nombres, ', '), '(ninguno)');
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Control positivo: la comprobacion sabe ver una sin nombres
  ---------------------------------------------------------------------------
  CREATE FUNCTION public.control_positivo_517(integer) RETURNS integer
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $control$ SELECT $1 $control$;

  SELECT count(*) INTO v_total
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.pronargs > 0 AND p.proargnames IS NULL AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  IF v_total <> 1 THEN
    RAISE EXCEPTION
      'VERIFY_517: se creo una funcion sin nombres a proposito y la comprobacion encontro %; '
      'estaba pasando en verde sin mirar nada', v_total;
  END IF;

  DROP FUNCTION public.control_positivo_517(integer);

  RAISE NOTICE
    'VERIFY_517 OK: ninguna funcion publica SECURITY DEFINER se queda sin nombres de parametro, y la comprobacion detecta la que falte';
END;
$verify$;

ROLLBACK;
