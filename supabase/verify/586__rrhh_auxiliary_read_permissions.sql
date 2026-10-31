\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE target regclass; role_name text; relation_name text;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
   WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_573_LOCAL_ONLY';
 END IF;
 FOREACH relation_name IN ARRAY ARRAY['beneficios','capacitaciones','empleado_beneficios','empleado_capacitaciones','expediente_documentos'] LOOP
  target:=('public.'||relation_name)::regclass;
  IF NOT has_table_privilege('service_role',target,'SELECT') THEN RAISE EXCEPTION 'VERIFY_573_BACKEND_SELECT_MISSING:%',target; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=target AND relrowsecurity AND relforcerowsecurity) THEN
   RAISE EXCEPTION 'VERIFY_573_RLS_NOT_FORCED:%',target;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(role_name,target,'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'VERIFY_573_DIRECT_WRITE_ALLOWED:%:%',target,role_name;
   END IF;
   IF role_name<>'service_role' AND has_table_privilege(role_name,target,'SELECT') THEN
    RAISE EXCEPTION 'VERIFY_573_CLIENT_SELECT_ALLOWED:%:%',target,role_name;
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_function_privilege('service_role','public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)','EXECUTE') THEN
   RAISE EXCEPTION 'VERIFY_573_WRITER_BOUNDARY_INVALID';
 END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conname IN
    ('empleado_beneficios_id_beneficio_fkey','empleado_capacitaciones_id_capacitacion_fkey') AND contype='f')<>2 THEN
  RAISE EXCEPTION 'VERIFY_573_EXPLICIT_FOREIGN_KEYS_MISSING';
 END IF;
END;
$verify$;
ROLLBACK;
