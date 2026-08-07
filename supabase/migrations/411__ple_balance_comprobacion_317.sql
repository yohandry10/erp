BEGIN;

-- Agrega el Balance de Comprobación 3.17 en PostgreSQL para no descargar ni
-- truncar miles de líneas de detalle en la API. Sólo considera asientos
-- confirmados del tenant solicitado; apertura y cierre conservan columnas
-- separadas para completar la estructura oficial de SUNAT.
CREATE OR REPLACE FUNCTION public.ple_balance_comprobacion_317(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS TABLE (
  codigo text,
  tipo text,
  inicial_debe numeric,
  inicial_haber numeric,
  movimiento_debe numeric,
  movimiento_haber numeric,
  transferencia_debe numeric,
  transferencia_haber numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  WITH limites AS (
    SELECT
      make_date(p_anio, 1, 1) AS inicio_ejercicio,
      (make_date(p_anio, p_mes, 1) + interval '1 month')::date AS fin_exclusivo
    WHERE p_tenant_id IS NOT NULL
      AND p_anio BETWEEN 1900 AND 2100
      AND p_mes BETWEEN 1 AND 12
  ), movimientos AS (
    SELECT
      pc.codigo,
      upper(COALESCE(pc.tipo, '')) AS tipo,
      ac.fecha::date AS fecha,
      upper(COALESCE(ac.tipo_asiento, '')) AS tipo_asiento,
      COALESCE(da.debe, 0)::numeric AS debe,
      COALESCE(da.haber, 0)::numeric AS haber,
      l.inicio_ejercicio
    FROM limites l
    JOIN public.asientos_contables ac
      ON ac.tenant_id = p_tenant_id
     AND upper(COALESCE(ac.estado, '')) = 'CONFIRMADO'
     AND ac.fecha::date < l.fin_exclusivo
    JOIN public.detalle_asientos da
      ON da.asiento_id = ac.id
    JOIN public.plan_cuentas pc
      ON pc.id = da.cuenta_id
     AND pc.tenant_id = p_tenant_id
  )
  SELECT
    m.codigo,
    max(m.tipo) AS tipo,
    COALESCE(sum(m.debe) FILTER (
      WHERE m.fecha < m.inicio_ejercicio
         OR m.tipo_asiento IN ('APERTURA', 'OPENING', 'SALDO_INICIAL')
    ), 0) AS inicial_debe,
    COALESCE(sum(m.haber) FILTER (
      WHERE m.fecha < m.inicio_ejercicio
         OR m.tipo_asiento IN ('APERTURA', 'OPENING', 'SALDO_INICIAL')
    ), 0) AS inicial_haber,
    COALESCE(sum(m.debe) FILTER (
      WHERE m.fecha >= m.inicio_ejercicio
        AND m.tipo_asiento NOT IN (
          'APERTURA', 'OPENING', 'SALDO_INICIAL',
          'CIERRE', 'CLOSING', 'CIERRE_ANUAL'
        )
    ), 0) AS movimiento_debe,
    COALESCE(sum(m.haber) FILTER (
      WHERE m.fecha >= m.inicio_ejercicio
        AND m.tipo_asiento NOT IN (
          'APERTURA', 'OPENING', 'SALDO_INICIAL',
          'CIERRE', 'CLOSING', 'CIERRE_ANUAL'
        )
    ), 0) AS movimiento_haber,
    COALESCE(sum(m.debe) FILTER (
      WHERE m.fecha >= m.inicio_ejercicio
        AND m.tipo_asiento IN ('CIERRE', 'CLOSING', 'CIERRE_ANUAL')
    ), 0) AS transferencia_debe,
    COALESCE(sum(m.haber) FILTER (
      WHERE m.fecha >= m.inicio_ejercicio
        AND m.tipo_asiento IN ('CIERRE', 'CLOSING', 'CIERRE_ANUAL')
    ), 0) AS transferencia_haber
  FROM movimientos m
  GROUP BY m.codigo
  HAVING sum(abs(m.debe) + abs(m.haber)) > 0
  ORDER BY m.codigo;
$fn$;

REVOKE ALL ON FUNCTION public.ple_balance_comprobacion_317(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ple_balance_comprobacion_317(uuid, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.ple_balance_comprobacion_317(uuid, integer, integer)
  IS 'Agregación tenant-scoped de asientos confirmados para PLE Balance de Comprobación 3.17';

COMMIT;
