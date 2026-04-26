-- ============================================================================
-- 035__contabilidad_materialized_views_alignment.sql
-- Reestructura materialized views contables al shape esperado por runtime.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Recrear vistas materializadas en orden seguro de dependencias
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_balance_general;
DROP MATERIALIZED VIEW IF EXISTS public.mv_estado_resultados;
DROP MATERIALIZED VIEW IF EXISTS public.mv_balance_comprobacion;

-- ----------------------------------------------------------------------------
-- Balance de comprobación por tenant/período/cuenta
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.mv_balance_comprobacion AS
WITH base AS (
  SELECT
    ac.tenant_id,
    EXTRACT(YEAR FROM date_trunc('month', COALESCE(ac.fecha, ac.created_at)))::integer AS anio,
    EXTRACT(MONTH FROM date_trunc('month', COALESCE(ac.fecha, ac.created_at)))::integer AS mes,
    COALESCE(NULLIF(btrim(pc.codigo), ''), 'SIN_CUENTA') AS cuenta,
    COALESCE(NULLIF(btrim(pc.nombre), ''), 'SIN_CUENTA') AS nombre_cuenta,
    app.to_numeric_or_zero(da.debe::text)::numeric(14,2) AS debe,
    app.to_numeric_or_zero(da.haber::text)::numeric(14,2) AS haber
  FROM public.asientos_contables ac
  JOIN public.detalle_asientos da
    ON da.asiento_id = ac.id
  LEFT JOIN public.plan_cuentas pc
    ON pc.id = da.cuenta_id
  WHERE ac.tenant_id IS NOT NULL
    AND COALESCE(ac.fecha, ac.created_at) IS NOT NULL
    AND upper(COALESCE(ac.estado, 'APROBADO')) NOT IN ('ANULADO', 'BORRADOR')
),
monthly AS (
  SELECT
    b.tenant_id,
    b.anio,
    b.mes,
    b.cuenta,
    b.nombre_cuenta,
    COALESCE(SUM(b.debe), 0)::numeric(14,2) AS debe,
    COALESCE(SUM(b.haber), 0)::numeric(14,2) AS haber,
    COALESCE(SUM(b.debe - b.haber), 0)::numeric(14,2) AS neto
  FROM base b
  GROUP BY b.tenant_id, b.anio, b.mes, b.cuenta, b.nombre_cuenta
)
SELECT
  m.tenant_id,
  m.anio,
  m.mes,
  m.cuenta,
  m.nombre_cuenta,
  ROUND(
    COALESCE(
      SUM(m.neto) OVER (
        PARTITION BY m.tenant_id, m.cuenta
        ORDER BY m.anio, m.mes
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ),
    2
  )::numeric(14,2) AS saldo_inicial,
  ROUND(COALESCE(m.debe, 0), 2)::numeric(14,2) AS debe,
  ROUND(COALESCE(m.haber, 0), 2)::numeric(14,2) AS haber,
  ROUND(
    COALESCE(
      SUM(m.neto) OVER (
        PARTITION BY m.tenant_id, m.cuenta
        ORDER BY m.anio, m.mes
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ),
      0
    ),
    2
  )::numeric(14,2) AS saldo_final,
  now() AS generated_at
FROM monthly m
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_balance_comprobacion_tenant_periodo_cuenta
ON public.mv_balance_comprobacion (tenant_id, anio, mes, cuenta);

CREATE INDEX IF NOT EXISTS idx_mv_balance_comprobacion_tenant_periodo
ON public.mv_balance_comprobacion (tenant_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_mv_balance_comprobacion_cuenta
ON public.mv_balance_comprobacion (tenant_id, cuenta);

-- ----------------------------------------------------------------------------
-- Estado de resultados por tenant/período
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.mv_estado_resultados AS
WITH base AS (
  SELECT
    ac.tenant_id,
    EXTRACT(YEAR FROM date_trunc('month', COALESCE(ac.fecha, ac.created_at)))::integer AS anio,
    EXTRACT(MONTH FROM date_trunc('month', COALESCE(ac.fecha, ac.created_at)))::integer AS mes,
    COALESCE(NULLIF(btrim(pc.codigo), ''), '') AS cuenta_codigo,
    app.to_numeric_or_zero(da.debe::text)::numeric(14,2) AS debe,
    app.to_numeric_or_zero(da.haber::text)::numeric(14,2) AS haber
  FROM public.asientos_contables ac
  JOIN public.detalle_asientos da
    ON da.asiento_id = ac.id
  LEFT JOIN public.plan_cuentas pc
    ON pc.id = da.cuenta_id
  WHERE ac.tenant_id IS NOT NULL
    AND COALESCE(ac.fecha, ac.created_at) IS NOT NULL
    AND upper(COALESCE(ac.estado, 'APROBADO')) NOT IN ('ANULADO', 'BORRADOR')
),
agg AS (
  SELECT
    b.tenant_id,
    b.anio,
    b.mes,
    COALESCE(SUM(CASE WHEN b.cuenta_codigo ~ '^(70|71|72)' THEN b.haber - b.debe ELSE 0 END), 0)::numeric(14,2) AS ventas,
    COALESCE(SUM(CASE WHEN b.cuenta_codigo ~ '^7[3-9]' THEN b.haber - b.debe ELSE 0 END), 0)::numeric(14,2) AS otros_ingresos,
    COALESCE(SUM(CASE WHEN b.cuenta_codigo ~ '^(69|60)' THEN b.debe - b.haber ELSE 0 END), 0)::numeric(14,2) AS costo_ventas,
    COALESCE(SUM(CASE WHEN b.cuenta_codigo ~ '^94' THEN b.debe - b.haber ELSE 0 END), 0)::numeric(14,2) AS gastos_administrativos,
    COALESCE(SUM(CASE WHEN b.cuenta_codigo ~ '^95' THEN b.debe - b.haber ELSE 0 END), 0)::numeric(14,2) AS gastos_ventas,
    COALESCE(SUM(CASE WHEN b.cuenta_codigo ~ '^(96|97)' THEN b.debe - b.haber ELSE 0 END), 0)::numeric(14,2) AS gastos_financieros
  FROM base b
  GROUP BY b.tenant_id, b.anio, b.mes
)
SELECT
  a.tenant_id,
  a.anio,
  a.mes,
  ROUND(a.ventas, 2)::numeric(14,2) AS ventas,
  ROUND(a.otros_ingresos, 2)::numeric(14,2) AS otros_ingresos,
  ROUND(a.costo_ventas, 2)::numeric(14,2) AS costo_ventas,
  ROUND(a.gastos_administrativos, 2)::numeric(14,2) AS gastos_administrativos,
  ROUND(a.gastos_ventas, 2)::numeric(14,2) AS gastos_ventas,
  ROUND(a.gastos_financieros, 2)::numeric(14,2) AS gastos_financieros,
  ROUND(
    a.ventas + a.otros_ingresos
    - a.costo_ventas
    - a.gastos_administrativos
    - a.gastos_ventas
    - a.gastos_financieros,
    2
  )::numeric(14,2) AS resultado_ejercicio,
  now() AS generated_at
FROM agg a
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_estado_resultados_tenant_periodo
ON public.mv_estado_resultados (tenant_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_mv_estado_resultados_tenant_anio
ON public.mv_estado_resultados (tenant_id, anio);

-- ----------------------------------------------------------------------------
-- Balance general por tenant/período
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.mv_balance_general AS
SELECT
  bc.tenant_id,
  bc.anio,
  bc.mes,
  ROUND(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '10%' THEN GREATEST(bc.saldo_final, 0) ELSE 0 END), 0), 2)::numeric(14,2) AS efectivo,
  ROUND(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '12%' THEN GREATEST(bc.saldo_final, 0) ELSE 0 END), 0), 2)::numeric(14,2) AS cuentas_por_cobrar,
  ROUND(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '20%' THEN GREATEST(bc.saldo_final, 0) ELSE 0 END), 0), 2)::numeric(14,2) AS inventarios,
  ROUND(COALESCE(SUM(CASE WHEN bc.cuenta ~ '^(11|13|14|16|18)' THEN GREATEST(bc.saldo_final, 0) ELSE 0 END), 0), 2)::numeric(14,2) AS otros_activos_corrientes,
  ROUND(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '33%' THEN GREATEST(bc.saldo_final, 0) ELSE 0 END), 0), 2)::numeric(14,2) AS activos_fijos,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '39%' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS depreciacion_acumulada,
  ROUND(COALESCE(SUM(CASE WHEN bc.cuenta ~ '^(34|35|36|37|38)' THEN GREATEST(bc.saldo_final, 0) ELSE 0 END), 0), 2)::numeric(14,2) AS otros_activos_no_corrientes,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '42%' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS cuentas_por_pagar,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '40%' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS tributos_por_pagar,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '41%' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS remuneraciones_por_pagar,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta ~ '^(43|44)' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS otros_pasivos_corrientes,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta ~ '^(45|46|47|48)' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS deudas_largo_plazo,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '49%' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS otros_pasivos_no_corrientes,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta LIKE '50%' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS capital,
  ROUND(ABS(COALESCE(SUM(CASE WHEN bc.cuenta ~ '^(56|57|58|59)' THEN bc.saldo_final ELSE 0 END), 0)), 2)::numeric(14,2) AS resultados_acumulados,
  now() AS generated_at
FROM public.mv_balance_comprobacion bc
GROUP BY bc.tenant_id, bc.anio, bc.mes
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_balance_general_tenant_periodo
ON public.mv_balance_general (tenant_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_mv_balance_general_tenant_anio
ON public.mv_balance_general (tenant_id, anio);

COMMIT;
