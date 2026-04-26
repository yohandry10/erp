-- ============================================================
-- Migration 104: Ampliar numero_asiento y estado a TEXT
-- ============================================================
-- La tabla asientos_contables aún tenía columnas varchar que
-- disparan el error 22001. numero_asiento contiene valores
-- alfanuméricos (ej. AST-...) así que no se puede castear a
-- BIGINT; lo convertimos a TEXT junto con estado.
-- ============================================================

-- Las vistas materializadas de estados financieros dependen de la columna
-- estado, por lo que deben eliminarse temporalmente antes del cambio.
DROP MATERIALIZED VIEW IF EXISTS mv_balance_general;
DROP MATERIALIZED VIEW IF EXISTS mv_estado_resultados;
DROP MATERIALIZED VIEW IF EXISTS mv_balance_comprobacion;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asientos_contables'
      AND column_name = 'numero_asiento'
      AND data_type IN ('character varying', 'character')
  ) THEN
    ALTER TABLE public.asientos_contables
      ALTER COLUMN numero_asiento TYPE TEXT;
    RAISE NOTICE '✅ numero_asiento convertido a TEXT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asientos_contables'
      AND column_name = 'estado'
      AND data_type IN ('character varying', 'character')
  ) THEN
    ALTER TABLE public.asientos_contables
      ALTER COLUMN estado TYPE TEXT;
    RAISE NOTICE '✅ estado convertido a TEXT';
  END IF;
END $$;

-- =====================================================
-- Re-crear vistas materializadas de estados financieros
-- (mismas definiciones que la migración 048)
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_balance_comprobacion AS
SELECT 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha)::INTEGER AS anio,
  EXTRACT(MONTH FROM ac.fecha)::INTEGER AS mes,
  pc.codigo AS cuenta,
  pc.nombre AS nombre_cuenta,
  pc.tipo,
  COALESCE(sic.saldo_inicial, 0) AS saldo_inicial,
  SUM(da.debe) AS debe,
  SUM(da.haber) AS haber,
  COALESCE(sic.saldo_inicial, 0) + SUM(da.debe) - SUM(da.haber) AS saldo_final,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_balance_tenant_periodo_cuenta 
  ON mv_balance_comprobacion(tenant_id, anio, mes, cuenta);
CREATE INDEX IF NOT EXISTS idx_mv_balance_tenant_anio 
  ON mv_balance_comprobacion(tenant_id, anio);
CREATE INDEX IF NOT EXISTS idx_mv_balance_tipo 
  ON mv_balance_comprobacion(tipo);
COMMENT ON MATERIALIZED VIEW mv_balance_comprobacion IS 
  'Vista materializada del Balance de Comprobación por tenant, período y cuenta';

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_estado_resultados AS
SELECT 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha)::INTEGER AS anio,
  EXTRACT(MONTH FROM ac.fecha)::INTEGER AS mes,
  SUM(CASE WHEN pc.codigo LIKE '70%' THEN da.haber - da.debe ELSE 0 END) AS ventas,
  SUM(CASE WHEN pc.codigo LIKE '75%' OR pc.codigo LIKE '76%' OR pc.codigo LIKE '77%' 
    THEN da.haber - da.debe ELSE 0 END) AS otros_ingresos,
  SUM(CASE WHEN pc.codigo LIKE '7%' THEN da.haber - da.debe ELSE 0 END) AS total_ingresos,
  SUM(CASE WHEN pc.codigo LIKE '69%' THEN da.debe - da.haber ELSE 0 END) AS costo_ventas,
  SUM(CASE WHEN pc.codigo LIKE '7%' THEN da.haber - da.debe ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '69%' THEN da.debe - da.haber ELSE 0 END) AS utilidad_bruta,
  SUM(CASE WHEN pc.codigo LIKE '94%' THEN da.debe - da.haber ELSE 0 END) AS gastos_administrativos,
  SUM(CASE WHEN pc.codigo LIKE '95%' THEN da.debe - da.haber ELSE 0 END) AS gastos_ventas,
  SUM(CASE WHEN pc.codigo LIKE '97%' THEN da.debe - da.haber ELSE 0 END) AS gastos_financieros,
  SUM(CASE WHEN pc.codigo LIKE '9%' THEN da.debe - da.haber ELSE 0 END) AS total_gastos,
  SUM(CASE WHEN pc.codigo LIKE '7%' THEN da.haber - da.debe ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '69%' THEN da.debe - da.haber ELSE 0 END) -
  SUM(CASE WHEN pc.codigo LIKE '9%' THEN da.debe - da.haber ELSE 0 END) AS utilidad_neta,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_estado_resultados_tenant_periodo 
  ON mv_estado_resultados(tenant_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_mv_estado_resultados_tenant_anio 
  ON mv_estado_resultados(tenant_id, anio);
COMMENT ON MATERIALIZED VIEW mv_estado_resultados IS 
  'Vista materializada del Estado de Resultados (P&L) por tenant y período';

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_balance_general AS
SELECT 
  u.tenant_id,
  EXTRACT(YEAR FROM ac.fecha)::INTEGER AS anio,
  EXTRACT(MONTH FROM ac.fecha)::INTEGER AS mes,
  SUM(CASE WHEN pc.codigo LIKE '10%' THEN da.debe - da.haber ELSE 0 END) AS efectivo,
  SUM(CASE WHEN pc.codigo LIKE '12%' THEN da.debe - da.haber ELSE 0 END) AS cuentas_por_cobrar,
  SUM(CASE WHEN pc.codigo LIKE '20%' OR pc.codigo LIKE '21%' OR pc.codigo LIKE '22%' 
    THEN da.debe - da.haber ELSE 0 END) AS inventarios,
  SUM(CASE WHEN pc.codigo LIKE '16%' OR pc.codigo LIKE '17%' OR pc.codigo LIKE '18%' OR pc.codigo LIKE '19%' 
    THEN da.debe - da.haber ELSE 0 END) AS otros_activos_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '1%' OR pc.codigo LIKE '2%' 
    THEN da.debe - da.haber ELSE 0 END) AS total_activos_corrientes,
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
  SUM(CASE WHEN pc.codigo LIKE '1%' OR pc.codigo LIKE '2%' OR pc.codigo LIKE '3%' 
    THEN da.debe - da.haber ELSE 0 END) AS total_activos,
  SUM(CASE WHEN pc.codigo LIKE '42%' THEN da.haber - da.debe ELSE 0 END) AS cuentas_por_pagar,
  SUM(CASE WHEN pc.codigo LIKE '40%' THEN da.haber - da.debe ELSE 0 END) AS tributos_por_pagar,
  SUM(CASE WHEN pc.codigo LIKE '41%' THEN da.haber - da.debe ELSE 0 END) AS remuneraciones_por_pagar,
  SUM(CASE WHEN pc.codigo LIKE '43%' OR pc.codigo LIKE '44%' OR pc.codigo LIKE '46%' OR pc.codigo LIKE '47%' OR pc.codigo LIKE '49%' 
    THEN da.haber - da.debe ELSE 0 END) AS otros_pasivos_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '4%' AND NOT pc.codigo LIKE '45%' AND NOT pc.codigo LIKE '48%' 
    THEN da.haber - da.debe ELSE 0 END) AS total_pasivos_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '45%' THEN da.haber - da.debe ELSE 0 END) AS deudas_largo_plazo,
  SUM(CASE WHEN pc.codigo LIKE '48%' THEN da.haber - da.debe ELSE 0 END) AS otros_pasivos_no_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '45%' OR pc.codigo LIKE '48%' 
    THEN da.haber - da.debe ELSE 0 END) AS total_pasivos_no_corrientes,
  SUM(CASE WHEN pc.codigo LIKE '4%' THEN da.haber - da.debe ELSE 0 END) AS total_pasivos,
  SUM(CASE WHEN pc.codigo LIKE '50%' THEN da.haber - da.debe ELSE 0 END) AS capital,
  SUM(CASE WHEN pc.codigo LIKE '57%' OR pc.codigo LIKE '58%' OR pc.codigo LIKE '59%' 
    THEN da.haber - da.debe ELSE 0 END) AS resultados_acumulados,
  SUM(CASE WHEN pc.codigo LIKE '5%' THEN da.haber - da.debe ELSE 0 END) AS total_patrimonio_base,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_balance_general_tenant_periodo 
  ON mv_balance_general(tenant_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_mv_balance_general_tenant_anio 
  ON mv_balance_general(tenant_id, anio);
COMMENT ON MATERIALIZED VIEW mv_balance_general IS 
  'Vista materializada del Balance General por tenant y período';

-- Restaurar permisos y refrescar vistas
GRANT SELECT ON mv_balance_comprobacion TO authenticated;
GRANT SELECT ON mv_estado_resultados TO authenticated;
GRANT SELECT ON mv_balance_general TO authenticated;

REFRESH MATERIALIZED VIEW mv_balance_comprobacion;
REFRESH MATERIALIZED VIEW mv_estado_resultados;
REFRESH MATERIALIZED VIEW mv_balance_general;
