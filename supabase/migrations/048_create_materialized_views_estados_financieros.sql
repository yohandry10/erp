-- =====================================================
-- MIGRACIÓN 048: Vistas Materializadas para Estados Financieros
-- =====================================================
-- Descripción: Crea vistas materializadas para optimizar la consulta
--              de estados financieros (Balance de Comprobación, 
--              Estado de Resultados y Balance General)
-- Fecha: 2025-10-27
-- =====================================================

-- =====================================================
-- 1. VISTA MATERIALIZADA: Balance de Comprobación
-- =====================================================
-- Agrupa movimientos contables por cuenta, tenant y período
-- para generar el balance de comprobación de forma eficiente

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_balance_comprobacion AS
SELECT 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha)::INTEGER AS anio,
  EXTRACT(MONTH FROM ac.fecha)::INTEGER AS mes,
  pc.codigo AS cuenta,
  pc.nombre AS nombre_cuenta,
  pc.tipo,
  -- Saldo inicial (se calculará desde saldos_iniciales_cuentas)
  COALESCE(sic.saldo_inicial, 0) AS saldo_inicial,
  -- Suma de débitos del período
  SUM(da.debe) AS debe,
  -- Suma de créditos del período
  SUM(da.haber) AS haber,
  -- Saldo final = saldo_inicial + debe - haber
  COALESCE(sic.saldo_inicial, 0) + SUM(da.debe) - SUM(da.haber) AS saldo_final,
  -- Metadata
  MAX(ac.fecha) AS ultima_actualizacion
FROM detalle_asientos da
INNER JOIN asientos_contables ac ON da.asiento_id = ac.id
INNER JOIN usuarios_sistema u ON ac.usuario_id = u.id
INNER JOIN plan_cuentas pc ON da.cuenta_id = pc.id
LEFT JOIN saldos_iniciales_cuentas sic ON (
  sic.cuenta_id = pc.id 
  AND sic.tenant_id = u.tenant_id
  AND sic.periodo = TO_CHAR(ac.fecha, 'YYYY-MM')
)
WHERE ac.estado = 'APROBADO'
GROUP BY 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha),
  EXTRACT(MONTH FROM ac.fecha),
  pc.codigo,
  pc.nombre,
  pc.tipo,
  sic.saldo_inicial;

-- Índices para optimizar consultas
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_balance_tenant_periodo_cuenta 
  ON mv_balance_comprobacion(tenant_id, anio, mes, cuenta);

CREATE INDEX IF NOT EXISTS idx_mv_balance_tenant_anio 
  ON mv_balance_comprobacion(tenant_id, anio);

CREATE INDEX IF NOT EXISTS idx_mv_balance_tipo 
  ON mv_balance_comprobacion(tipo);

COMMENT ON MATERIALIZED VIEW mv_balance_comprobacion IS 
  'Vista materializada del Balance de Comprobación por tenant, período y cuenta';

-- =====================================================
-- 2. VISTA MATERIALIZADA: Estado de Resultados
-- =====================================================
-- Agrupa ingresos, costos y gastos por tenant y período
-- para generar el Estado de Resultados (P&L)

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_estado_resultados AS
SELECT 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha)::INTEGER AS anio,
  EXTRACT(MONTH FROM ac.fecha)::INTEGER AS mes,
  -- INGRESOS (Cuentas 70-79, naturaleza acreedora)
  SUM(CASE WHEN pc.codigo LIKE '70%' THEN da.haber - da.debe ELSE 0 END) AS ventas,
  SUM(CASE WHEN pc.codigo LIKE '75%' OR pc.codigo LIKE '76%' OR pc.codigo LIKE '77%' 
    THEN da.haber - da.debe ELSE 0 END) AS otros_ingresos,
  SUM(CASE WHEN pc.codigo LIKE '7%' THEN da.haber - da.debe ELSE 0 END) AS total_ingresos,
  -- COSTOS (Cuenta 69, naturaleza deudora)
  SUM(CASE WHEN pc.codigo LIKE '69%' THEN da.debe - da.haber ELSE 0 END) AS costo_ventas,
  -- Utilidad Bruta = Ingresos - Costo de Ventas
  SUM(CASE WHEN pc.codigo LIKE '7%' THEN da.haber - da.debe ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '69%' THEN da.debe - da.haber ELSE 0 END) AS utilidad_bruta,
  -- GASTOS (Cuentas 94-97, naturaleza deudora)
  SUM(CASE WHEN pc.codigo LIKE '94%' THEN da.debe - da.haber ELSE 0 END) AS gastos_administrativos,
  SUM(CASE WHEN pc.codigo LIKE '95%' THEN da.debe - da.haber ELSE 0 END) AS gastos_ventas,
  SUM(CASE WHEN pc.codigo LIKE '97%' THEN da.debe - da.haber ELSE 0 END) AS gastos_financieros,
  SUM(CASE WHEN pc.codigo LIKE '9%' THEN da.debe - da.haber ELSE 0 END) AS total_gastos,
  -- Utilidad Neta = Utilidad Bruta - Gastos
  SUM(CASE WHEN pc.codigo LIKE '7%' THEN da.haber - da.debe ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '69%' THEN da.debe - da.haber ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '9%' THEN da.debe - da.haber ELSE 0 END) AS utilidad_neta,
  -- Metadata
  MAX(ac.fecha) AS ultima_actualizacion
FROM detalle_asientos da
INNER JOIN asientos_contables ac ON da.asiento_id = ac.id
INNER JOIN usuarios_sistema u ON ac.usuario_id = u.id
INNER JOIN plan_cuentas pc ON da.cuenta_id = pc.id
WHERE ac.estado = 'APROBADO'
  AND (pc.codigo LIKE '6%' OR pc.codigo LIKE '7%' OR pc.codigo LIKE '9%')
GROUP BY 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha),
  EXTRACT(MONTH FROM ac.fecha);

-- Índices para optimizar consultas
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_estado_resultados_tenant_periodo 
  ON mv_estado_resultados(tenant_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_mv_estado_resultados_tenant_anio 
  ON mv_estado_resultados(tenant_id, anio);

COMMENT ON MATERIALIZED VIEW mv_estado_resultados IS 
  'Vista materializada del Estado de Resultados (P&L) por tenant y período';

-- =====================================================
-- 3. VISTA MATERIALIZADA: Balance General
-- =====================================================
-- Agrupa activos, pasivos y patrimonio por tenant y período
-- para generar el Balance General

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_balance_general AS
SELECT 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha)::INTEGER AS anio,
  EXTRACT(MONTH FROM ac.fecha)::INTEGER AS mes,
  -- ACTIVOS CORRIENTES (Cuentas 10-19, naturaleza deudora)
  SUM(CASE WHEN pc.codigo LIKE '10%' THEN da.debe - da.haber ELSE 0 END) AS efectivo,
  SUM(CASE WHEN pc.codigo LIKE '12%' THEN da.debe - da.haber ELSE 0 END) AS cuentas_por_cobrar,
  SUM(CASE WHEN pc.codigo LIKE '20%' OR pc.codigo LIKE '21%' OR pc.codigo LIKE '22%' 
    THEN da.debe - da.haber ELSE 0 END) AS inventarios,
  SUM(CASE WHEN pc.codigo LIKE '16%' OR pc.codigo LIKE '17%' OR pc.codigo LIKE '18%' OR pc.codigo LIKE '19%' 
    THEN da.debe - da.haber ELSE 0 END) AS otros_activos_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '1%' OR pc.codigo LIKE '2%' 
    THEN da.debe - da.haber ELSE 0 END) AS total_activos_corrientes,
  -- ACTIVOS NO CORRIENTES (Cuentas 30-39, naturaleza deudora)
  SUM(CASE WHEN pc.codigo LIKE '33%' OR pc.codigo LIKE '34%' OR pc.codigo LIKE '35%' OR pc.codigo LIKE '36%' 
    THEN da.debe - da.haber ELSE 0 END) AS activos_fijos,
  SUM(CASE WHEN pc.codigo LIKE '39%' THEN da.haber - da.debe ELSE 0 END) AS depreciacion_acumulada,
  SUM(CASE WHEN pc.codigo LIKE '33%' OR pc.codigo LIKE '34%' OR pc.codigo LIKE '35%' OR pc.codigo LIKE '36%' 
    THEN da.debe - da.haber ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '39%' THEN da.haber - da.debe ELSE 0 END) AS activos_fijos_neto,
  SUM(CASE WHEN pc.codigo LIKE '30%' OR pc.codigo LIKE '31%' OR pc.codigo LIKE '37%' OR pc.codigo LIKE '38%' 
    THEN da.debe - da.haber ELSE 0 END) AS otros_activos_no_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '3%' 
    THEN da.debe - da.haber ELSE 0 END) AS total_activos_no_corrientes,
  -- TOTAL ACTIVOS
  SUM(CASE WHEN pc.codigo LIKE '1%' OR pc.codigo LIKE '2%' OR pc.codigo LIKE '3%' 
    THEN da.debe - da.haber ELSE 0 END) AS total_activos,
  -- PASIVOS CORRIENTES (Cuentas 40-49, naturaleza acreedora)
  SUM(CASE WHEN pc.codigo LIKE '42%' THEN da.haber - da.debe ELSE 0 END) AS cuentas_por_pagar,
  SUM(CASE WHEN pc.codigo LIKE '40%' THEN da.haber - da.debe ELSE 0 END) AS tributos_por_pagar,
  SUM(CASE WHEN pc.codigo LIKE '41%' THEN da.haber - da.debe ELSE 0 END) AS remuneraciones_por_pagar,
  SUM(CASE WHEN pc.codigo LIKE '43%' OR pc.codigo LIKE '44%' OR pc.codigo LIKE '46%' OR pc.codigo LIKE '47%' OR pc.codigo LIKE '49%' 
    THEN da.haber - da.debe ELSE 0 END) AS otros_pasivos_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '4%' AND NOT pc.codigo LIKE '45%' AND NOT pc.codigo LIKE '48%' 
    THEN da.haber - da.debe ELSE 0 END) AS total_pasivos_corrientes,
  -- PASIVOS NO CORRIENTES
  SUM(CASE WHEN pc.codigo LIKE '45%' THEN da.haber - da.debe ELSE 0 END) AS deudas_largo_plazo,
  SUM(CASE WHEN pc.codigo LIKE '48%' THEN da.haber - da.debe ELSE 0 END) AS otros_pasivos_no_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '45%' OR pc.codigo LIKE '48%' 
    THEN da.haber - da.debe ELSE 0 END) AS total_pasivos_no_corrientes,
  -- TOTAL PASIVOS
  SUM(CASE WHEN pc.codigo LIKE '4%' THEN da.haber - da.debe ELSE 0 END) AS total_pasivos,
  -- PATRIMONIO (Cuentas 50-59, naturaleza acreedora)
  SUM(CASE WHEN pc.codigo LIKE '50%' THEN da.haber - da.debe ELSE 0 END) AS capital,
  SUM(CASE WHEN pc.codigo LIKE '57%' OR pc.codigo LIKE '58%' OR pc.codigo LIKE '59%' 
    THEN da.haber - da.debe ELSE 0 END) AS resultados_acumulados,
  -- Total Patrimonio (sin incluir resultado del ejercicio que viene del Estado de Resultados)
  SUM(CASE WHEN pc.codigo LIKE '5%' THEN da.haber - da.debe ELSE 0 END) AS total_patrimonio_base,
  -- Metadata
  MAX(ac.fecha) AS ultima_actualizacion
FROM detalle_asientos da
INNER JOIN asientos_contables ac ON da.asiento_id = ac.id
INNER JOIN usuarios_sistema u ON ac.usuario_id = u.id
INNER JOIN plan_cuentas pc ON da.cuenta_id = pc.id
WHERE ac.estado = 'APROBADO'
  AND (pc.codigo LIKE '1%' OR pc.codigo LIKE '2%' OR pc.codigo LIKE '3%' 
       OR pc.codigo LIKE '4%' OR pc.codigo LIKE '5%')
GROUP BY 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha),
  EXTRACT(MONTH FROM ac.fecha);

-- Índices para optimizar consultas
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_balance_general_tenant_periodo 
  ON mv_balance_general(tenant_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_mv_balance_general_tenant_anio 
  ON mv_balance_general(tenant_id, anio);

COMMENT ON MATERIALIZED VIEW mv_balance_general IS 
  'Vista materializada del Balance General por tenant y período';

-- =====================================================
-- 4. FUNCIÓN: Refrescar Estados Financieros
-- =====================================================
-- Refresca todas las vistas materializadas de estados financieros
-- para un tenant y período específico

CREATE OR REPLACE FUNCTION refrescar_estados_financieros(
  p_tenant_id UUID,
  p_anio INTEGER,
  p_mes INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refrescar todas las vistas materializadas
  -- Nota: REFRESH MATERIALIZED VIEW refresca toda la vista, no solo un tenant/período
  -- Para optimizar, se podría implementar un refresh incremental en el futuro
  
  RAISE NOTICE 'Refrescando vistas materializadas para tenant %, período %-%', 
    p_tenant_id, p_anio, p_mes;
  
  -- Refrescar Balance de Comprobación
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_balance_comprobacion;
  RAISE NOTICE 'Balance de Comprobación refrescado';
  
  -- Refrescar Estado de Resultados
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_estado_resultados;
  RAISE NOTICE 'Estado de Resultados refrescado';
  
  -- Refrescar Balance General
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_balance_general;
  RAISE NOTICE 'Balance General refrescado';
  
  RAISE NOTICE 'Todas las vistas materializadas han sido refrescadas exitosamente';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error refrescando estados financieros: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION refrescar_estados_financieros IS 
  'Refresca todas las vistas materializadas de estados financieros';

-- =====================================================
-- 5. TRIGGER: Auto-refresh de vistas materializadas
-- =====================================================
-- Opcional: Trigger para refrescar automáticamente las vistas
-- cuando se crean o modifican asientos contables
-- NOTA: Deshabilitado por defecto para evitar impacto en performance
-- Se recomienda refrescar manualmente o mediante un job programado

/*
CREATE OR REPLACE FUNCTION trigger_refresh_estados_financieros()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Refrescar vistas en background (requiere pg_cron o similar)
  -- Por ahora, solo registramos que se necesita un refresh
  RAISE NOTICE 'Asiento contable modificado, considerar refrescar vistas materializadas';
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_asiento_change
  AFTER INSERT OR UPDATE OR DELETE ON asientos_contables
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_estados_financieros();
*/

-- =====================================================
-- 6. PERMISOS Y SEGURIDAD
-- =====================================================
-- Las vistas materializadas no soportan RLS directamente
-- La seguridad se maneja a nivel de aplicación filtrando por tenant_id

-- Otorgar permisos de lectura a usuarios autenticados
GRANT SELECT ON mv_balance_comprobacion TO authenticated;
GRANT SELECT ON mv_estado_resultados TO authenticated;
GRANT SELECT ON mv_balance_general TO authenticated;

-- Otorgar permisos de ejecución de la función de refresh
GRANT EXECUTE ON FUNCTION refrescar_estados_financieros TO authenticated;

-- =====================================================
-- 7. REFRESH INICIAL
-- =====================================================
-- Realizar el primer refresh de las vistas materializadas

REFRESH MATERIALIZED VIEW mv_balance_comprobacion;
REFRESH MATERIALIZED VIEW mv_estado_resultados;
REFRESH MATERIALIZED VIEW mv_balance_general;

-- =====================================================
-- FIN DE MIGRACIÓN 048
-- =====================================================
