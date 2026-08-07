DO $$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.guardar_plantilla_con_detalles_tx(uuid,text,uuid,jsonb,jsonb)'
  );
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Falta la RPC atomica de plantillas contables';
  END IF;
  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'La RPC atomica de plantillas no puede ser publica para clientes';
  END IF;
  IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role necesita ejecutar la RPC atomica de plantillas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plantillas_asientos_detalle'::regclass
      AND conname = 'ck_plantillas_asientos_detalle_runtime'
  ) THEN
    RAISE EXCEPTION 'Falta el constraint runtime alineado de detalles';
  END IF;
END
$$;
