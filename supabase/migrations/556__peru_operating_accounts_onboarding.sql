-- Completa el catálogo operativo vigente de PlanCuentasService para nuevos PE.
-- No escribe desde lectores/consumidores ni modifica cuentas ya configuradas.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION app.seed_peru_operating_accounts_556(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE v_account record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresa_config
    WHERE tenant_id=p_tenant_id AND upper(btrim(pais))='PE') THEN RETURN; END IF;
  FOR v_account IN SELECT * FROM (VALUES
    ('421', 'Facturas, boletas y otros comprobantes por pagar', 'PASIVO', 3),
    ('422', 'Anticipos a proveedores', 'PASIVO', 3),
    ('4699', 'Otras cuentas por pagar diversas - terceros', 'PASIVO', 4),
    ('629', 'Beneficios sociales de los trabajadores', 'GASTO', 3),
    ('19', 'Estimacion de cuentas de cobranza dudosa', 'ACTIVO', 2),
    ('10', 'Efectivo y equivalentes de efectivo', 'ACTIVO', 2),
    ('1041', 'Cuentas corrientes operativas', 'ACTIVO', 4),
    ('1042', 'Cuentas corrientes para fines específicos - detracciones', 'ACTIVO', 4),
    ('12', 'Cuentas por cobrar comerciales', 'ACTIVO', 2),
    ('122', 'Anticipos de clientes', 'PASIVO', 3),
    ('18', 'Servicios y otros contratados por anticipado', 'ACTIVO', 2),
    ('20', 'Mercaderias', 'ACTIVO', 2),
    ('33', 'Inmuebles, maquinaria y equipo', 'ACTIVO', 2),
    ('39', 'Depreciacion y amortizacion acumuladas', 'ACTIVO', 2),
    ('63', 'Gastos de servicios prestados por terceros', 'GASTO', 2),
    ('65', 'Otros gastos de gestion', 'GASTO', 2),
    ('75', 'Otros ingresos de gestion', 'INGRESO', 2),
    ('40', 'Tributos por pagar', 'PASIVO', 2),
    ('40113', 'IGV - régimen de percepciones', 'PASIVO', 5),
    ('40114', 'IGV - régimen de retenciones', 'ACTIVO', 5),
    ('42', 'Cuentas por pagar comerciales', 'PASIVO', 2),
    ('49', 'Pasivo diferido', 'PASIVO', 2),
    ('68', 'Valuacion y deterioro de activos y provisiones', 'GASTO', 2),
    ('676', 'Diferencia de cambio', 'GASTO', 3),
    ('69', 'Costo de ventas', 'GASTO', 2),
    ('70', 'Ventas', 'INGRESO', 2),
    ('76', 'Ganancia por medicion de activos no financieros', 'INGRESO', 2),
    ('776', 'Diferencia de cambio', 'INGRESO', 3),
    ('403', 'Instituciones publicas', 'PASIVO', 3),
    ('407', 'Administradoras de fondos y aportes patronales por pagar', 'PASIVO', 3),
    ('411', 'Remuneraciones por pagar', 'PASIVO', 3),
    ('621', 'Remuneraciones', 'GASTO', 3),
    ('627', 'Seguridad y prevision social', 'GASTO', 3)
  ) AS a(codigo,nombre,tipo,nivel) LOOP
    PERFORM app.ensure_fiscal_account_465(p_tenant_id, v_account.codigo,
      v_account.nombre, v_account.tipo, v_account.nivel);
  END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION app.seed_peru_operating_config_556()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  PERFORM app.seed_peru_operating_accounts_556(NEW.tenant_id);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER trg_seed_peru_operating_accounts_556
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_peru_operating_config_556();
REVOKE ALL ON FUNCTION app.seed_peru_operating_accounts_556(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_peru_operating_config_556() FROM PUBLIC, anon, authenticated, service_role;
SELECT app.seed_peru_operating_accounts_556(tenant_id)
FROM public.empresa_config WHERE upper(btrim(pais))='PE';
-- Backfill sólo aditivo, con locks por tenant/código del escritor 465; sin cambios
-- de RLS/ACL de tablas, saldos ni asientos. Rollback: detener runtime dependiente
-- y retirar trigger/funciones 556. Conservar cuentas creadas con posibles
-- movimientos posteriores; cualquier borrado exige autorización independiente.
COMMIT;
