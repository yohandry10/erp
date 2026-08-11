DO $$
DECLARE
  v_guardar regprocedure := to_regprocedure('public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)');
  v_evidencia regprocedure := to_regprocedure('public.registrar_rrhh_peru_evidencia_tx(uuid,uuid,uuid,text,text,text,timestamp with time zone)');
BEGIN
  IF v_guardar IS NULL OR v_evidencia IS NULL THEN
    RAISE EXCEPTION 'Faltan los puentes RPC públicos de planilla electrónica Perú';
  END IF;
  IF has_function_privilege('anon', v_guardar, 'EXECUTE')
     OR has_function_privilege('authenticated', v_guardar, 'EXECUTE')
     OR has_function_privilege('anon', v_evidencia, 'EXECUTE')
     OR has_function_privilege('authenticated', v_evidencia, 'EXECUTE') THEN
    RAISE EXCEPTION 'Los puentes RPC PLAME no deben ser ejecutables por anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', v_guardar, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_evidencia, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role necesita ejecutar los puentes RPC PLAME';
  END IF;
  IF has_function_privilege('service_role',
       'app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.registrar_rrhh_peru_evidencia_tx(uuid,uuid,uuid,text,text,text,timestamp with time zone)', 'EXECUTE')
     OR has_table_privilege('service_role',
       'public.rrhh_peru_presentaciones_planilla', 'INSERT')
     OR has_table_privilege('service_role',
       'public.rrhh_peru_presentaciones_planilla', 'UPDATE') THEN
    RAISE EXCEPTION 'Los writers internos PLAME no quedaron cerrados';
  END IF;
END
$$;
