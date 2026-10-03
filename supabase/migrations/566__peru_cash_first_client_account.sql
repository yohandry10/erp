-- Caja PE del primer cliente: lecturas del backend y cuenta operativa 10111.
-- Sin backfill ni cambios a cuentas de empresas ya configuradas.
BEGIN;
SET LOCAL lock_timeout='10s';
GRANT SELECT ON public.cambios_turno TO service_role;
GRANT SELECT ON public.retiros_caja TO service_role;
CREATE OR REPLACE FUNCTION app.seed_peru_cash_account_config_566()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
BEGIN
 IF upper(btrim(NEW.pais))='PE' THEN
  PERFORM app.ensure_fiscal_account_465(NEW.tenant_id,'10111','Caja operativa POS','ACTIVO',5);
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION app.seed_peru_cash_account_config_566() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER seed_peru_cash_account_config_566
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_peru_cash_account_config_566();
COMMIT;
