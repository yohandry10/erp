DO $$
DECLARE
  v_functions regprocedure[] := ARRAY[
    to_regprocedure('public.guardar_tributo_mensual_tx(uuid,uuid,jsonb)'),
    to_regprocedure('public.registrar_constancia_tributo_mensual_tx(uuid,uuid,uuid,text,timestamp with time zone)'),
    to_regprocedure('public.guardar_tributo_anual_tx(uuid,uuid,jsonb)'),
    to_regprocedure('public.registrar_constancia_tributo_anual_tx(uuid,uuid,uuid,text,timestamp with time zone)')
  ];
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY v_functions LOOP
    IF v_function IS NULL THEN
      RAISE EXCEPTION 'Falta un puente RPC público de tributos Perú';
    END IF;
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'El puente RPC tributario % no puede ser ejecutable por anon/authenticated', v_function;
    END IF;
    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role necesita ejecutar el puente RPC tributario %', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege('service_role',
       'app.guardar_tributo_mensual_tx(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.guardar_tributo_anual_tx(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_table_privilege('service_role',
       'public.tributos_declaraciones_mensuales', 'INSERT')
     OR has_table_privilege('service_role',
       'public.tributos_declaraciones_anuales', 'UPDATE') THEN
    RAISE EXCEPTION 'Los writers tributarios internos no quedaron cerrados';
  END IF;
END
$$;
