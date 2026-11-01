-- Lecturas por usuario: privadas, y sólo se escriben por su función.
BEGIN READ ONLY;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.notificaciones_lecturas'::regclass) THEN
    RAISE EXCEPTION 'notificaciones_lecturas debe tener RLS forzado';
  END IF;
  IF has_table_privilege('anon', 'public.notificaciones_lecturas', 'SELECT')
     OR has_table_privilege('authenticated', 'public.notificaciones_lecturas', 'SELECT')
     OR has_table_privilege('service_role', 'public.notificaciones_lecturas', 'INSERT') THEN
    RAISE EXCEPTION 'notificaciones_lecturas tiene privilegios de más';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.notificaciones_lecturas', 'SELECT') THEN
    RAISE EXCEPTION 'service_role debe poder leer notificaciones_lecturas';
  END IF;
  IF has_function_privilege('anon', 'public.marcar_aviso_compartido_leido_tx(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.marcar_aviso_compartido_leido_tx(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.marcar_aviso_compartido_leido_tx(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'marcar_aviso_compartido_leido_tx debe ser sólo de service_role';
  END IF;
END $$;

ROLLBACK;
