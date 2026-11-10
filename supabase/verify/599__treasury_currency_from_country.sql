\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE t uuid; country text; preference text; expected text; country_id integer; n integer:=0;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_599_LOCAL_ONLY'; END IF;
 IF strpos(pg_get_functiondef('app.treasury_local_currency_452(uuid)'::regprocedure),'country_currency_599')=0 THEN
  RAISE EXCEPTION 'VERIFY_599_DEFINITION_NOT_APPLIED'; END IF;
 FOREACH country IN ARRAY ARRAY['PE','AR','CO'] LOOP
  n:=n+1;t:=gen_random_uuid();
  expected:=CASE country WHEN 'AR' THEN 'ARS' WHEN 'CO' THEN 'COP' ELSE 'PEN' END;
  country_id:=CASE country WHEN 'AR' THEN 5 WHEN 'CO' THEN 2 ELSE 1 END;
  INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
  VALUES(t,'VERIFY-599-'||left(t::text,8),'Currency599 '||country,'Fixture local transaccional',country,'test',true,'ACTIVO');
  INSERT INTO public.empresa_config(tenant_id,ruc,razon_social,pais,pais_id,moneda_defecto,estado,configuracion_completa)
  VALUES(t,'2060000059'||n,'Currency599 '||country,country,country_id,'USD','ACTIVO',true);
  FOREACH preference IN ARRAY ARRAY['USD','EUR','PEN'] LOOP
   UPDATE public.empresa_config SET moneda_defecto=preference WHERE tenant_id=t;
   IF app.treasury_local_currency_452(t) IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'VERIFY_599_DEFAULT_CHANGED_ACCOUNTING_CURRENCY country=% preference=%',country,preference; END IF;
  END LOOP;
 END LOOP;
 IF app.treasury_local_currency_452(gen_random_uuid()) IS NOT NULL THEN
  RAISE EXCEPTION 'VERIFY_599_MISSING_TENANT_HAS_CURRENCY'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) r(role)
  WHERE has_function_privilege(r.role,'app.treasury_local_currency_452(uuid)','EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_599_BACKEND_HELPER_EXPOSED'; END IF;
 IF NOT has_function_privilege('service_role','app.treasury_local_currency_452(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY_599_BACKEND_CONTRACT_REMOVED'; END IF;
END;
$verify$;
ROLLBACK;
