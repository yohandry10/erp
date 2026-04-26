-- Migration 126: Analytics de turnos para Q15
-- Vista optimizada para métricas de turnos por cajero
-- ============================================

-- Vista analítica de turnos con KPIs
DROP VIEW IF EXISTS vw_turnos_metrics CASCADE;
CREATE OR REPLACE VIEW vw_turnos_metrics AS
SELECT
  sc.tenant_id,
  sc.cajero_id,
  sc.caja_id,
  c.nombre AS caja_nombre,
  DATE(sc.hora_apertura) AS fecha,
  
  -- Métricas de tiempo
  COUNT(*) AS total_turnos,
  AVG(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600) AS duracion_promedio_horas,
  MIN(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600) AS duracion_min_horas,
  MAX(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600) AS duracion_max_horas,
  
  -- Métricas financieras
  SUM(sc.monto_esperado - sc.monto_inicio) AS total_ventas_netas,
  AVG(sc.monto_esperado - sc.monto_inicio) AS promedio_ventas_por_turno,
  SUM(sc.diferencia) AS total_diferencias,
  AVG(ABS(sc.diferencia)) AS promedio_diferencia_absoluta,
  
  -- Contadores de cuadre
  COUNT(*) FILTER (WHERE sc.diferencia = 0) AS turnos_cuadrados,
  COUNT(*) FILTER (WHERE sc.diferencia > 0) AS turnos_sobrante,
  COUNT(*) FILTER (WHERE sc.diferencia < 0) AS turnos_faltante,
  
  -- Porcentaje de efectividad (turnos cuadrados / total)
  ROUND(
    (COUNT(*) FILTER (WHERE sc.diferencia = 0)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) AS porcentaje_efectividad

FROM sesiones_caja sc
LEFT JOIN cajas c ON sc.caja_id = c.id
WHERE sc.estado = 'CERRADA'
  AND sc.hora_cierre IS NOT NULL
GROUP BY 
  sc.tenant_id, 
  sc.cajero_id, 
  sc.caja_id, 
  c.nombre,
  DATE(sc.hora_apertura);

COMMENT ON VIEW vw_turnos_metrics IS 'Vista analítica de métricas de turnos por cajero, caja y fecha';

-- Vista de ranking de cajeros por efectividad
DROP VIEW IF EXISTS vw_ranking_cajeros CASCADE;
CREATE OR REPLACE VIEW vw_ranking_cajeros AS
SELECT
  sc.tenant_id,
  sc.cajero_id,
  COUNT(*) AS total_turnos,
  
  -- Efectividad de cuadre
  ROUND(
    (COUNT(*) FILTER (WHERE sc.diferencia = 0)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) AS porcentaje_cuadre,
  
  -- Promedio de diferencia (menor es mejor)
  ROUND(AVG(ABS(sc.diferencia))::NUMERIC, 2) AS promedio_diferencia,
  
  -- Ventas promedio por turno
  ROUND(AVG(sc.monto_esperado - sc.monto_inicio)::NUMERIC, 2) AS ventas_promedio,
  
  -- Duración promedio de turno
  ROUND(AVG(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600)::NUMERIC, 2) AS horas_promedio,
  
  -- Transacciones por hora (eficiencia)
  ROUND(
    (SELECT COUNT(*) FROM movimientos_caja mc 
     WHERE mc.sesion_caja_id = ANY(ARRAY_AGG(sc.id)) 
     AND mc.tipo_movimiento = 'VENTA')::NUMERIC 
    / NULLIF(SUM(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600), 0),
    2
  ) AS transacciones_por_hora,
  
  -- Último turno
  MAX(sc.hora_cierre) AS ultimo_turno

FROM sesiones_caja sc
WHERE sc.estado = 'CERRADA'
  AND sc.hora_cierre IS NOT NULL
GROUP BY sc.tenant_id, sc.cajero_id
ORDER BY porcentaje_cuadre DESC, promedio_diferencia ASC;

COMMENT ON VIEW vw_ranking_cajeros IS 'Ranking de cajeros por efectividad de cuadre y eficiencia';

-- Vista de sesiones activas (para monitoreo en tiempo real)
DROP VIEW IF EXISTS vw_sesiones_activas CASCADE;
CREATE OR REPLACE VIEW vw_sesiones_activas AS
SELECT
  sc.id,
  sc.tenant_id,
  sc.caja_id,
  c.nombre AS caja_nombre,
  c.ubicacion AS caja_ubicacion,
  sc.cajero_id,
  sc.hora_apertura,
  EXTRACT(EPOCH FROM (NOW() - sc.hora_apertura)) / 3600 AS horas_activa,
  sc.monto_inicio,
  sc.dispositivo,
  sc.congelada,
  
  -- Calcular saldo actual
  sc.monto_inicio + COALESCE(
    (SELECT SUM(monto) FROM movimientos_caja mc WHERE mc.sesion_caja_id = sc.id),
    0
  ) AS saldo_actual,
  
  -- Contar movimientos
  (SELECT COUNT(*) FROM movimientos_caja mc WHERE mc.sesion_caja_id = sc.id) AS total_movimientos,
  
  -- Última actividad
  COALESCE(
    (SELECT MAX(timestamp) FROM movimientos_caja mc WHERE mc.sesion_caja_id = sc.id),
    sc.hora_apertura
  ) AS ultima_actividad

FROM sesiones_caja sc
LEFT JOIN cajas c ON sc.caja_id = c.id
WHERE sc.estado = 'ABIERTA';

COMMENT ON VIEW vw_sesiones_activas IS 'Vista de sesiones de caja activas para monitoreo en tiempo real';

-- Función para obtener métricas de un cajero específico
CREATE OR REPLACE FUNCTION obtener_metricas_cajero(
  p_tenant_id UUID,
  p_cajero_id UUID,
  p_fecha_desde DATE DEFAULT NULL,
  p_fecha_hasta DATE DEFAULT NULL
)
RETURNS TABLE (
  total_turnos BIGINT,
  duracion_promedio_horas NUMERIC,
  total_ventas NUMERIC,
  promedio_ventas_turno NUMERIC,
  total_diferencias NUMERIC,
  turnos_cuadrados BIGINT,
  turnos_sobrante BIGINT,
  turnos_faltante BIGINT,
  porcentaje_efectividad NUMERIC,
  transacciones_totales BIGINT,
  transacciones_por_hora NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_turnos,
    ROUND(AVG(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600)::NUMERIC, 2) AS duracion_promedio_horas,
    ROUND(SUM(sc.monto_esperado - sc.monto_inicio)::NUMERIC, 2) AS total_ventas,
    ROUND(AVG(sc.monto_esperado - sc.monto_inicio)::NUMERIC, 2) AS promedio_ventas_turno,
    ROUND(SUM(sc.diferencia)::NUMERIC, 2) AS total_diferencias,
    COUNT(*) FILTER (WHERE sc.diferencia = 0)::BIGINT AS turnos_cuadrados,
    COUNT(*) FILTER (WHERE sc.diferencia > 0)::BIGINT AS turnos_sobrante,
    COUNT(*) FILTER (WHERE sc.diferencia < 0)::BIGINT AS turnos_faltante,
    ROUND((COUNT(*) FILTER (WHERE sc.diferencia = 0)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS porcentaje_efectividad,
    (SELECT COUNT(*) FROM movimientos_caja mc 
     JOIN sesiones_caja s ON mc.sesion_caja_id = s.id 
     WHERE s.cajero_id = p_cajero_id 
     AND s.tenant_id = p_tenant_id
     AND mc.tipo_movimiento = 'VENTA')::BIGINT AS transacciones_totales,
    ROUND(
      (SELECT COUNT(*) FROM movimientos_caja mc 
       JOIN sesiones_caja s ON mc.sesion_caja_id = s.id 
       WHERE s.cajero_id = p_cajero_id 
       AND s.tenant_id = p_tenant_id
       AND mc.tipo_movimiento = 'VENTA')::NUMERIC 
      / NULLIF(SUM(EXTRACT(EPOCH FROM (sc.hora_cierre - sc.hora_apertura)) / 3600), 0),
      2
    ) AS transacciones_por_hora
  FROM sesiones_caja sc
  WHERE sc.tenant_id = p_tenant_id
    AND sc.cajero_id = p_cajero_id
    AND sc.estado = 'CERRADA'
    AND sc.hora_cierre IS NOT NULL
    AND (p_fecha_desde IS NULL OR DATE(sc.hora_apertura) >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR DATE(sc.hora_apertura) <= p_fecha_hasta);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION obtener_metricas_cajero IS 'Obtiene métricas detalladas de un cajero en un período';

-- Índices para optimizar las vistas
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_analytics 
ON sesiones_caja(tenant_id, cajero_id, estado, hora_apertura, hora_cierre)
WHERE estado = 'CERRADA';

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_activas
ON sesiones_caja(tenant_id, estado)
WHERE estado = 'ABIERTA';

-- Permisos
GRANT SELECT ON vw_turnos_metrics TO authenticated;
GRANT SELECT ON vw_ranking_cajeros TO authenticated;
GRANT SELECT ON vw_sesiones_activas TO authenticated;
