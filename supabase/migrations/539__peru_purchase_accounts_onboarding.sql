-- La 428 completaba 4699 sólo para los tenants presentes al aplicar el SQL.
-- Los tenants PE creados después podían recibir stock sin poder contabilizarlo.
-- Provisionar las cuentas de recepción al configurar el país, nunca desde el
-- consumidor contable ni mediante DML directo del backend.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION app.seed_peru_purchase_accounts_539(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_account record;
  v_rows integer;
  v_inserted integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.empresa_config
    WHERE tenant_id = p_tenant_id AND upper(btrim(pais)) = 'PE'
  ) THEN RETURN 0; END IF;

  FOR v_account IN SELECT * FROM (VALUES
    ('4699', 'Mercaderías recibidas por facturar', 'PASIVO', 4),
    ('63', 'Gastos de servicios prestados por terceros', 'GASTO', 2)
  ) AS c(codigo, nombre, tipo, nivel) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      format('%s:FISCAL-ACCOUNT:%s', p_tenant_id, v_account.codigo), 465
    ));
    INSERT INTO public.plan_cuentas (
      tenant_id, codigo, nombre, tipo, tipo_cuenta, nivel,
      acepta_movimiento, activo, estado, metadata
    )
    SELECT p_tenant_id, v_account.codigo, v_account.nombre,
      v_account.tipo, v_account.tipo, v_account.nivel, true, true, 'ACTIVO',
      jsonb_build_object('source', 'peru_purchase_accounts_539', 'pais', 'PE')
    WHERE NOT EXISTS (
      SELECT 1 FROM public.plan_cuentas
      WHERE tenant_id = p_tenant_id AND codigo = v_account.codigo
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END LOOP;
  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_peru_purchase_accounts_config_539()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.seed_peru_purchase_accounts_539(NEW.tenant_id);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_seed_peru_purchase_accounts_539
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_peru_purchase_accounts_config_539();

SELECT app.seed_peru_purchase_accounts_539(tenant_id)
FROM public.empresa_config WHERE upper(btrim(pais)) = 'PE';

REVOKE ALL ON FUNCTION app.seed_peru_purchase_accounts_539(uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_peru_purchase_accounts_config_539()
FROM PUBLIC, anon, authenticated, service_role;

-- Backfill aditivo: sólo cuentas ausentes; no cambiar cuentas configuradas,
-- saldos, asientos, RLS ni ACL de tablas. Rollback de código: retirar trigger y
-- funciones. Conservar las cuentas añadidas: podrían tener movimientos después
-- del despliegue; su eliminación exige revisar evidencia y autorización aparte.
COMMIT;
