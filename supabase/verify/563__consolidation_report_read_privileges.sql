\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE table_name text; table_id regclass;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_563_LOCAL_ONLY'; END IF;
 FOREACH table_name IN ARRAY ARRAY['mapeos_cuentas_consolidacion','tipos_cambio_consolidacion','ajustes_consolidacion'] LOOP
  table_id:=to_regclass('public.'||table_name);
  IF table_id IS NULL OR NOT has_table_privilege('service_role',table_id,'SELECT')
    OR has_table_privilege('service_role',table_id,'INSERT')
    OR has_table_privilege('service_role',table_id,'UPDATE')
    OR has_table_privilege('service_role',table_id,'DELETE')
    OR has_table_privilege('service_role',table_id,'TRUNCATE')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=table_id)
  THEN RAISE EXCEPTION 'VERIFY_563_TABLE_PRIVILEGES_INVALID:%',table_name; END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role','public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('anon','public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.gestionar_consolidacion_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'VERIFY_563_MUTATION_BOUNDARY_INVALID'; END IF;
END $verify$;
SET LOCAL ROLE service_role;
SELECT 1 FROM public.mapeos_cuentas_consolidacion LIMIT 1;
SELECT 1 FROM public.tipos_cambio_consolidacion LIMIT 1;
SELECT 1 FROM public.ajustes_consolidacion LIMIT 1;
RESET ROLE;
ROLLBACK;
