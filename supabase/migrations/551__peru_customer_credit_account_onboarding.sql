-- Completa el contrato 465/456 para empresas PE nuevas y existentes.
-- Sólo inserta 122 si falta. No modifica cuentas configuradas, saldos ni ACL.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION app.seed_peru_customer_credit_account_551(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(btrim(pais))='PE') THEN
    PERFORM app.ensure_fiscal_account_465(p_tenant_id, '122', 'Anticipos de clientes', 'PASIVO', 3);
  END IF;
END;
$fn$;
CREATE OR REPLACE FUNCTION app.seed_peru_customer_credit_config_551()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  PERFORM app.seed_peru_customer_credit_account_551(NEW.tenant_id);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER trg_seed_peru_customer_credit_551
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_peru_customer_credit_config_551();
SELECT app.seed_peru_customer_credit_account_551(tenant_id)
FROM public.empresa_config WHERE upper(btrim(pais))='PE';
REVOKE ALL ON FUNCTION app.seed_peru_customer_credit_account_551(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_peru_customer_credit_config_551() FROM PUBLIC, anon, authenticated, service_role;
-- Rollback: detener runtime dependiente y retirar trigger/funciones 551.
-- Conservar cuentas incorporadas; borrar una cuenta con movimientos requiere
-- evaluación, respaldo y autorización explícita independiente.
COMMIT;
