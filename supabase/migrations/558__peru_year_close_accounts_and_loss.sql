-- Candidato local: completa únicamente las cuentas de cierre de empresas PE.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
CREATE OR REPLACE FUNCTION app.seed_peru_year_close_accounts_558(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresa_config
    WHERE tenant_id=p_tenant_id AND upper(btrim(pais))='PE') THEN RETURN; END IF;
  PERFORM app.ensure_fiscal_account_465(p_tenant_id, '59', 'Resultados acumulados', 'PATRIMONIO', 2);
  PERFORM app.ensure_fiscal_account_465(p_tenant_id, '89', 'Determinacion del resultado', 'ORDEN', 2);
END;
$fn$;
CREATE OR REPLACE FUNCTION app.seed_peru_year_close_config_558()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  PERFORM app.seed_peru_year_close_accounts_558(NEW.tenant_id);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER trg_seed_peru_year_close_accounts_558
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_peru_year_close_config_558();
REVOKE ALL ON FUNCTION app.seed_peru_year_close_accounts_558(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_peru_year_close_config_558() FROM PUBLIC, anon, authenticated, service_role;
SELECT app.seed_peru_year_close_accounts_558(tenant_id)
FROM public.empresa_config WHERE upper(btrim(pais))='PE';
-- El writer 465 sólo inserta códigos ausentes bajo advisory lock. Conserva
-- nombres, clasificación, inactividad, saldos y permisos de cuentas existentes.
-- Rollback: retirar el trigger y los dos helpers; conservar las cuentas creadas.
CREATE OR REPLACE FUNCTION public.balance_general_live(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_resultado jsonb;
  v_resultado_ejercicio numeric;
  v_cierre_confirmado boolean;
  v_balance jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_REPORT_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_resultado := app.estado_resultados_live_458(p_tenant_id, p_anio, p_mes);
  v_resultado_ejercicio := COALESCE((v_resultado->>'utilidad_neta')::numeric, 0);

  SELECT EXISTS (
    SELECT 1
    FROM public.asientos_contables a
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND upper(COALESCE(a.origen, '')) = 'CIERRE_ANUAL'
      AND EXTRACT(YEAR FROM COALESCE(a.fecha, a.created_at))::integer = p_anio
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
  ) INTO v_cierre_confirmado;

  IF v_cierre_confirmado THEN
    v_resultado_ejercicio := 0;
  END IF;

  WITH balances AS (
    SELECT
      COALESCE(pc.codigo, '') AS codigo,
      round(COALESCE(sum(COALESCE(da.debe, 0) - COALESCE(da.haber, 0)), 0), 2) AS saldo
    FROM public.asientos_contables ac
    JOIN public.detalle_asientos da
      ON da.asiento_id = ac.id
     AND da.tenant_id = ac.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = da.cuenta_id
     AND pc.tenant_id = ac.tenant_id
    WHERE ac.tenant_id = p_tenant_id
      AND upper(COALESCE(ac.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(ac.fecha, ac.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    GROUP BY pc.codigo
  ), agg AS (
    SELECT
      COALESCE(sum(CASE WHEN codigo ~ '^10' THEN greatest(saldo, 0) ELSE 0 END), 0) AS efectivo,
      COALESCE(sum(CASE WHEN codigo ~ '^12' THEN greatest(saldo, 0) ELSE 0 END), 0) AS cuentas_por_cobrar,
      COALESCE(sum(CASE WHEN codigo ~ '^20' THEN greatest(saldo, 0) ELSE 0 END), 0) AS inventarios,
      COALESCE(sum(CASE WHEN codigo ~ '^(11|13|14|16|18)' THEN greatest(saldo, 0) ELSE 0 END), 0) AS otros_activos_corrientes,
      COALESCE(sum(CASE WHEN codigo ~ '^33' THEN greatest(saldo, 0) ELSE 0 END), 0) AS activos_fijos,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^39' THEN least(saldo, 0) ELSE 0 END), 0)) AS depreciacion_acumulada,
      COALESCE(sum(CASE WHEN codigo ~ '^(34|35|36|37|38)' THEN greatest(saldo, 0) ELSE 0 END), 0) AS otros_activos_no_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^42' THEN least(saldo, 0) ELSE 0 END), 0)) AS cuentas_por_pagar,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^40' THEN least(saldo, 0) ELSE 0 END), 0)) AS tributos_por_pagar,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^41' THEN least(saldo, 0) ELSE 0 END), 0)) AS remuneraciones_por_pagar,
      abs(COALESCE(sum(CASE
        WHEN codigo ~ '^(43|44)' THEN least(saldo, 0)
        WHEN codigo ~ '^(10|12)' THEN least(saldo, 0)
        ELSE 0 END), 0)) AS otros_pasivos_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^(45|46|47|48)' THEN least(saldo, 0) ELSE 0 END), 0)) AS deudas_largo_plazo,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^49' THEN least(saldo, 0) ELSE 0 END), 0)) AS otros_pasivos_no_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^50' THEN least(saldo, 0) ELSE 0 END), 0)) AS capital,
      COALESCE(sum(CASE WHEN codigo ~ '^(56|57|58|59)' THEN -saldo ELSE 0 END), 0) AS resultados_acumulados
    FROM balances
  )
  SELECT jsonb_build_object(
    'efectivo', round(efectivo, 2),
    'cuentas_por_cobrar', round(cuentas_por_cobrar, 2),
    'inventarios', round(inventarios, 2),
    'otros_activos_corrientes', round(otros_activos_corrientes, 2),
    'activos_fijos', round(activos_fijos, 2),
    'depreciacion_acumulada', round(depreciacion_acumulada, 2),
    'otros_activos_no_corrientes', round(otros_activos_no_corrientes, 2),
    'cuentas_por_pagar', round(cuentas_por_pagar, 2),
    'tributos_por_pagar', round(tributos_por_pagar, 2),
    'remuneraciones_por_pagar', round(remuneraciones_por_pagar, 2),
    'otros_pasivos_corrientes', round(otros_pasivos_corrientes, 2),
    'deudas_largo_plazo', round(deudas_largo_plazo, 2),
    'otros_pasivos_no_corrientes', round(otros_pasivos_no_corrientes, 2),
    'capital', round(capital, 2),
    'resultados_acumulados', round(resultados_acumulados, 2),
    'resultado_ejercicio', round(v_resultado_ejercicio, 2)
  ) INTO v_balance
  FROM agg;

  RETURN v_balance;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
