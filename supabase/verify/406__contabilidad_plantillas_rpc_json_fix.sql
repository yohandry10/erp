DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.guardar_plantilla_con_detalles_tx(uuid,text,uuid,jsonb,jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT LIKE '%jsonb_array_elements(p_detalles) WITH ORDINALITY%' THEN
    RAISE EXCEPTION 'La RPC de plantillas no contiene el iterador JSON corregido';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.guardar_plantilla_con_detalles_tx(uuid,text,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'La RPC corregida no puede quedar ejecutable por authenticated';
  END IF;
END
$$;
