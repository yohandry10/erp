-- ============================================================================
-- 039__finanzas_rpc_analytics_alignment.sql
-- Alinea RPC financieras con el contrato consumido por financial-integration.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper local: resolver tenant para RPC sin parametros explicitos.
-- Orden de resolucion:
-- 1) app.current_tenant_id (set_config)
-- 2) header x-tenant-id (solo service_role/postgres/supabase_admin)
-- 3) claim JWT tenant_id
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.resolve_request_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
  v_headers jsonb;
BEGIN
  v := current_setting('app.current_tenant_id', true);
  IF v IS NOT NULL AND btrim(v) <> '' THEN
    RETURN v::uuid;
  END IF;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    BEGIN
      v_headers := current_setting('request.headers', true)::jsonb;
      IF v_headers ? 'x-tenant-id' THEN
        v := NULLIF(btrim(v_headers->>'x-tenant-id'), '');
      ELSIF v_headers ? 'x_tenant_id' THEN
        v := NULLIF(btrim(v_headers->>'x_tenant_id'), '');
      ELSE
        v := NULL;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v := NULL;
    END;

    IF v IS NOT NULL AND btrim(v) <> '' THEN
      RETURN v::uuid;
    END IF;
  END IF;

  v := current_setting('request.jwt.claim.tenant_id', true);
  IF v IS NULL OR btrim(v) = '' THEN
    BEGIN
      v := NULLIF(btrim((current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')), '');
    EXCEPTION
      WHEN OTHERS THEN
        v := NULL;
    END;
  END IF;

  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_resumen_financiero_mensual
-- Contrato esperado:
-- periodo (YYYY-MM), ventas, gastos, utilidad, margen_porcentaje
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_resumen_financiero_mensual();
DROP FUNCTION IF EXISTS public.get_resumen_financiero_mensual(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_resumen_financiero_mensual(
  p_tenant_id uuid,
  p_meses integer DEFAULT 12
)
RETURNS TABLE (
  periodo text,
  ventas numeric,
  gastos numeric,
  utilidad numeric,
  margen_porcentaje numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_meses integer := GREATEST(1, LEAST(COALESCE(p_meses, 12), 60));
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH meses AS (
    SELECT to_char(gs::date, 'YYYY-MM') AS periodo
    FROM generate_series(
      date_trunc('month', now())::date - make_interval(months => v_meses - 1),
      date_trunc('month', now())::date,
      interval '1 month'
    ) AS gs
  ),
  ventas_mensuales AS (
    SELECT
      to_char(date_trunc('month', COALESCE(v.fecha::timestamp, v.created_at)), 'YYYY-MM') AS periodo,
      SUM(app.to_numeric_or_zero(v.total::text))::numeric(14,2) AS ventas
    FROM public.ventas v
    WHERE v.tenant_id = p_tenant_id
      AND COALESCE(v.fecha::timestamp, v.created_at) >= (date_trunc('month', now())::date - make_interval(months => v_meses - 1))
      AND COALESCE(v.estado, 'EMITIDA') IN ('EMITIDA', 'PAGADA')
    GROUP BY 1
  ),
  gastos_mensuales AS (
    SELECT
      to_char(date_trunc('month', COALESCE(g.fecha::timestamp, g.created_at)), 'YYYY-MM') AS periodo,
      SUM(app.to_numeric_or_zero(g.monto::text))::numeric(14,2) AS gastos
    FROM public.gastos g
    WHERE g.tenant_id = p_tenant_id
      AND COALESCE(g.fecha::timestamp, g.created_at) >= (date_trunc('month', now())::date - make_interval(months => v_meses - 1))
    GROUP BY 1
  )
  SELECT
    m.periodo,
    COALESCE(v.ventas, 0)::numeric(14,2) AS ventas,
    COALESCE(g.gastos, 0)::numeric(14,2) AS gastos,
    (COALESCE(v.ventas, 0) - COALESCE(g.gastos, 0))::numeric(14,2) AS utilidad,
    CASE
      WHEN COALESCE(v.ventas, 0) > 0 THEN
        round(((COALESCE(v.ventas, 0) - COALESCE(g.gastos, 0)) / COALESCE(v.ventas, 0)) * 100, 2)
      ELSE 0
    END::numeric(8,2) AS margen_porcentaje
  FROM meses m
  LEFT JOIN ventas_mensuales v ON v.periodo = m.periodo
  LEFT JOIN gastos_mensuales g ON g.periodo = m.periodo
  ORDER BY m.periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_resumen_financiero_mensual()
RETURNS TABLE (
  periodo text,
  ventas numeric,
  gastos numeric,
  utilidad numeric,
  margen_porcentaje numeric
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.get_resumen_financiero_mensual(app.resolve_request_tenant_id(), 12);
$$;

-- ----------------------------------------------------------------------------
-- get_kpis_financieros
-- Contrato esperado:
-- efectivo_disponible, ventas_30_dias, gastos_30_dias, utilidad_30_dias,
-- cuentas_por_cobrar, cuentas_por_pagar, valor_inventario, margen_bruto
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_kpis_financieros();
DROP FUNCTION IF EXISTS public.get_kpis_financieros(uuid);

CREATE OR REPLACE FUNCTION public.get_kpis_financieros(
  p_tenant_id uuid
)
RETURNS TABLE (
  efectivo_disponible numeric,
  ventas_30_dias numeric,
  gastos_30_dias numeric,
  utilidad_30_dias numeric,
  cuentas_por_cobrar numeric,
  cuentas_por_pagar numeric,
  valor_inventario numeric,
  margen_bruto numeric,
  fecha_corte timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_efectivo numeric(14,2) := 0;
  v_ventas numeric(14,2) := 0;
  v_gastos numeric(14,2) := 0;
  v_utilidad numeric(14,2) := 0;
  v_cxc numeric(14,2) := 0;
  v_cxp numeric(14,2) := 0;
  v_inventario numeric(14,2) := 0;
  v_margen numeric(8,2) := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      now();
    RETURN;
  END IF;

  SELECT COALESCE(SUM(app.to_numeric_or_zero(cb.saldo_actual::text)), 0)::numeric(14,2)
    INTO v_efectivo
  FROM public.cuentas_bancarias cb
  WHERE cb.tenant_id = p_tenant_id
    AND COALESCE(cb.activo, true);

  SELECT COALESCE(SUM(app.to_numeric_or_zero(v.total::text)), 0)::numeric(14,2)
    INTO v_ventas
  FROM public.ventas v
  WHERE v.tenant_id = p_tenant_id
    AND COALESCE(v.fecha::timestamp, v.created_at) >= (now() - interval '30 days')
    AND COALESCE(v.estado, 'EMITIDA') IN ('EMITIDA', 'PAGADA');

  SELECT COALESCE(SUM(app.to_numeric_or_zero(g.monto::text)), 0)::numeric(14,2)
    INTO v_gastos
  FROM public.gastos g
  WHERE g.tenant_id = p_tenant_id
    AND COALESCE(g.fecha::timestamp, g.created_at) >= (now() - interval '30 days');

  SELECT COALESCE(SUM(GREATEST(app.to_numeric_or_zero(cxc.saldo_pendiente::text), 0)), 0)::numeric(14,2)
    INTO v_cxc
  FROM public.cuentas_por_cobrar cxc
  WHERE cxc.tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(GREATEST(app.to_numeric_or_zero(cxp.saldo_pendiente::text), 0)), 0)::numeric(14,2)
    INTO v_cxp
  FROM public.cuentas_por_pagar cxp
  WHERE cxp.tenant_id = p_tenant_id;

  SELECT COALESCE(
           SUM(
             COALESCE(app.to_numeric_or_zero(p.precio::text), app.to_numeric_or_zero(p.precio_venta::text), 0)
             * COALESCE(app.to_numeric_or_zero(p.stock_actual::text), app.to_numeric_or_zero(p.stock::text), 0)
           ),
           0
         )::numeric(14,2)
    INTO v_inventario
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
    AND NOT COALESCE(p.es_servicio, false);

  v_utilidad := (COALESCE(v_ventas, 0) - COALESCE(v_gastos, 0))::numeric(14,2);
  v_margen := CASE
    WHEN COALESCE(v_ventas, 0) > 0 THEN round((v_utilidad / v_ventas) * 100, 2)
    ELSE 0
  END;

  RETURN QUERY
  SELECT
    v_efectivo,
    v_ventas,
    v_gastos,
    v_utilidad,
    v_cxc,
    v_cxp,
    v_inventario,
    v_margen,
    now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_kpis_financieros()
RETURNS TABLE (
  efectivo_disponible numeric,
  ventas_30_dias numeric,
  gastos_30_dias numeric,
  utilidad_30_dias numeric,
  cuentas_por_cobrar numeric,
  cuentas_por_pagar numeric,
  valor_inventario numeric,
  margen_bruto numeric,
  fecha_corte timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.get_kpis_financieros(app.resolve_request_tenant_id());
$$;

-- ----------------------------------------------------------------------------
-- get_analisis_crecimiento
-- Contrato esperado:
-- tendencia (además de métricas de soporte)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_analisis_crecimiento();
DROP FUNCTION IF EXISTS public.get_analisis_crecimiento(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_analisis_crecimiento(
  p_tenant_id uuid,
  p_dias integer DEFAULT 30
)
RETURNS TABLE (
  ventas_periodo_actual numeric,
  ventas_periodo_anterior numeric,
  crecimiento_porcentaje numeric,
  tendencia text,
  fecha_corte timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_dias integer := GREATEST(7, LEAST(COALESCE(p_dias, 30), 365));
  v_actual numeric(14,2) := 0;
  v_anterior numeric(14,2) := 0;
  v_crecimiento numeric(10,2) := 0;
  v_tendencia text := 'ESTABLE';
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT 0::numeric, 0::numeric, 0::numeric, 'ESTABLE'::text, now();
    RETURN;
  END IF;

  SELECT COALESCE(SUM(app.to_numeric_or_zero(v.total::text)), 0)::numeric(14,2)
    INTO v_actual
  FROM public.ventas v
  WHERE v.tenant_id = p_tenant_id
    AND COALESCE(v.fecha::timestamp, v.created_at) >= (now() - make_interval(days => v_dias))
    AND COALESCE(v.estado, 'EMITIDA') IN ('EMITIDA', 'PAGADA');

  SELECT COALESCE(SUM(app.to_numeric_or_zero(v.total::text)), 0)::numeric(14,2)
    INTO v_anterior
  FROM public.ventas v
  WHERE v.tenant_id = p_tenant_id
    AND COALESCE(v.fecha::timestamp, v.created_at) >= (now() - make_interval(days => (2 * v_dias)))
    AND COALESCE(v.fecha::timestamp, v.created_at) < (now() - make_interval(days => v_dias))
    AND COALESCE(v.estado, 'EMITIDA') IN ('EMITIDA', 'PAGADA');

  IF v_anterior > 0 THEN
    v_crecimiento := round(((v_actual - v_anterior) / v_anterior) * 100, 2);
  ELSE
    v_crecimiento := CASE WHEN v_actual > 0 THEN 100 ELSE 0 END;
  END IF;

  v_tendencia := CASE
    WHEN v_crecimiento >= 10 THEN 'POSITIVO'
    WHEN v_crecimiento >= -5 THEN 'ESTABLE'
    ELSE 'NEGATIVO'
  END;

  RETURN QUERY
  SELECT v_actual, v_anterior, v_crecimiento, v_tendencia, now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_analisis_crecimiento()
RETURNS TABLE (
  ventas_periodo_actual numeric,
  ventas_periodo_anterior numeric,
  crecimiento_porcentaje numeric,
  tendencia text,
  fecha_corte timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.get_analisis_crecimiento(app.resolve_request_tenant_id(), 30);
$$;

-- ----------------------------------------------------------------------------
-- Índices de soporte para RPC financieras
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gastos_tenant_fecha
ON public.gastos (tenant_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_cxc_tenant_saldo_pendiente
ON public.cuentas_por_cobrar (tenant_id, saldo_pendiente)
WHERE saldo_pendiente > 0;

CREATE INDEX IF NOT EXISTS idx_cxp_tenant_saldo_pendiente
ON public.cuentas_por_pagar (tenant_id, saldo_pendiente)
WHERE saldo_pendiente > 0;

COMMIT;

