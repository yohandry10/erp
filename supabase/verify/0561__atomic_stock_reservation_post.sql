-- Verifica el contrato actual de las RPC legacy de reserva/liberación.
-- No concede permisos ni escribe eventos de auditoría.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_rpc regprocedure;
BEGIN
  FOREACH v_rpc IN ARRAY ARRAY[
    'public.reservar_stock_atomico(uuid,numeric,text,text,text)'::regprocedure,
    'public.liberar_stock_atomico(uuid,numeric,text,text,text)'::regprocedure,
    'public.descontar_stock_y_liberar_reserva_en_almacen(uuid,uuid,uuid,numeric,text,text,text,boolean)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_rpc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_rpc, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE') THEN
      RAISE EXCEPTION 'Privilegios incorrectos para %', v_rpc;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
