-- Migration 124: Add shift analytics view and helper functions
-- Purpose: Provide analytical views for shift/turn metrics and KPIs

-- 1. CREATE ANALYTICAL VIEW FOR SHIFT METRICS
CREATE OR REPLACE VIEW vw_turnos_metrics AS
SELECT 
  sc.id AS sesion_id,
  sc.tenant_id,
  sc.caja_id,
  c.nombre AS caja_nombre,
  sc.usuario_id AS cajero_id,
  u.nombre AS cajero_nombre,
  sc.dispositivo,
  sc.fecha_apertura AS hora_apertura,
  sc.fecha_cierre AS hora_cierre,
  sc.estado,
  
  -- Duración del turno
  CASE 
    WHEN sc.fecha_cierre IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (sc.fecha_cierre - sc.fecha_apertura)) / 3600.0
    ELSE EXTRACT(EPOCH FROM (NOW() - sc.fecha_apertura)) / 3600.0
  END AS duracion_horas,
  
  -- Métricas financieras
  sc.monto_inicial AS monto_inicio,
  sc.monto_esperado AS monto_cierre,
  COALESCE(sc.monto_esperado - sc.monto_inicial, 0) AS diferencia_neta,
  
  -- Métricas de transacciones (desde movimientos_caja)
  COALESCE(movs.total_transacciones, 0) AS total_transacciones,
  COALESCE(movs.total_ventas, 0) AS total_ventas,
  COALESCE(movs.total_retiros, 0) AS total_retiros,
  COALESCE(movs.total_entradas, 0) AS total_entradas,
  
  -- Eficiencia (transacciones por hora)
  CASE 
    WHEN sc.fecha_cierre IS NOT NULL AND EXTRACT(EPOCH FROM (sc.fecha_cierre - sc.fecha_apertura)) > 0
    THEN COALESCE(movs.total_transacciones, 0) / (EXTRACT(EPOCH FROM (sc.fecha_cierre - sc.fecha_apertura)) / 3600.0)
    WHEN sc.estado = 'ABIERTA' AND EXTRACT(EPOCH FROM (NOW() - sc.fecha_apertura)) > 0
    THEN COALESCE(movs.total_transacciones, 0) / (EXTRACT(EPOCH FROM (NOW() - sc.fecha_apertura)) / 3600.0)
    ELSE 0
  END AS transacciones_por_hora,
  
  -- Autorización y anomalías
  sc.requirio_autorizacion,
  sc.es_cierre_administrativo,
  
  -- Timestamps
  sc.created_at

FROM sesiones_caja sc
LEFT JOIN cajas c ON c.id = sc.caja_id
LEFT JOIN usuarios_sistema u ON u.id = sc.usuario_id
LEFT JOIN (
  -- Subquery para agregar métricas de movimientos
  SELECT 
    sesion_caja_id,
    COUNT(*) AS total_transacciones,
    COUNT(*) FILTER (WHERE tipo_movimiento IN ('VENTA', 'COBRO')) AS total_ventas,
    COUNT(*) FILTER (WHERE tipo_movimiento = 'RETIRO') AS total_retiros,
    COUNT(*) FILTER (WHERE tipo_movimiento IN ('INGRESO', 'DEPOSITO')) AS total_entradas
  FROM movimientos_caja
  GROUP BY sesion_caja_id
) movs ON movs.sesion_caja_id = sc.id;

COMMENT ON VIEW vw_turnos_metrics IS 'Vista analítica de turnos/shifts con KPIs: duración, transacciones, eficiencia';

-- 2. CREATE FUNCTION TO GET SHIFT SUMMARY FOR PERIOD
CREATE OR REPLACE FUNCTION obtener_resumen_turnos(
  p_tenant_id UUID,
  p_fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_fecha_fin TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_cajero_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_turnos BIGINT,
  duracion_promedio_horas NUMERIC,
  transacciones_totales BIGINT,
  transacciones_promedio_por_turno NUMERIC,
  eficiencia_promedio NUMERIC,
  turnos_con_autorizacion BIGINT,
  turnos_cerrados_admin BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT AS total_turnos,
    ROUND(AVG(duracion_horas), 2) AS duracion_promedio_horas,
    SUM(total_transacciones)::BIGINT AS transacciones_totales,
    ROUND(AVG(total_transacciones), 2) AS transacciones_promedio_por_turno,
    ROUND(AVG(transacciones_por_hora), 2) AS eficiencia_promedio,
    COUNT(*) FILTER (WHERE requirio_autorizacion = true)::BIGINT AS turnos_con_autorizacion,
    COUNT(*) FILTER (WHERE es_cierre_administrativo = true)::BIGINT AS turnos_cerrados_admin
  FROM vw_turnos_metrics
  WHERE tenant_id = p_tenant_id
    AND estado = 'CERRADA'
    AND (p_fecha_inicio IS NULL OR hora_apertura >= p_fecha_inicio)
    AND (p_fecha_fin IS NULL OR hora_cierre <= p_fecha_fin)
    AND (p_cajero_id IS NULL OR cajero_id = p_cajero_id);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION obtener_resumen_turnos IS 'Genera resumen estadístico de turnos para período y cajero específico';

-- 3. CREATE FUNCTION TO GET TOP PERFORMERS
CREATE OR REPLACE FUNCTION obtener_top_cajeros(
  p_tenant_id UUID,
  p_fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  p_fecha_fin TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  cajero_id UUID,
  cajero_nombre VARCHAR,
  total_turnos BIGINT,
  duracion_total_horas NUMERIC,
  transacciones_totales BIGINT,
  eficiencia_promedio NUMERIC,
  ranking INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.cajero_id,
    v.cajero_nombre,
    COUNT(*)::BIGINT AS total_turnos,
    ROUND(SUM(v.duracion_horas), 2) AS duracion_total_horas,
    SUM(v.total_transacciones)::BIGINT AS transacciones_totales,
    ROUND(AVG(v.transacciones_por_hora), 2) AS eficiencia_promedio,
    ROW_NUMBER() OVER (ORDER BY AVG(v.transacciones_por_hora) DESC)::INTEGER AS ranking
  FROM vw_turnos_metrics v
  WHERE v.tenant_id = p_tenant_id
    AND v.estado = 'CERRADA'
    AND v.hora_apertura >= p_fecha_inicio
    AND v.hora_cierre <= p_fecha_fin
    AND v.cajero_id IS NOT NULL
  GROUP BY v.cajero_id, v.cajero_nombre
  ORDER BY eficiencia_promedio DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION obtener_top_cajeros IS 'Retorna ranking de cajeros más eficientes por transacciones/hora';

-- 4. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_apertura_cierre 
ON sesiones_caja(fecha_apertura, fecha_cierre) 
WHERE estado = 'CERRADA';

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_cajero_fecha 
ON sesiones_caja(usuario_id, fecha_apertura) 
WHERE usuario_id IS NOT NULL;

-- 5. ADD COMMENTS
COMMENT ON INDEX idx_sesiones_caja_apertura_cierre IS 'Optimiza consultas de turnos por rango de fechas';
COMMENT ON INDEX idx_sesiones_caja_cajero_fecha IS 'Optimiza consultas de turnos por cajero y período';
