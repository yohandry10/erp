-- Migration 127: Auditoría completa de eventos POS
-- Q40: Registrar TODAS las acciones del cajero para auditoría forense
-- ============================================

-- Tabla de eventos POS para auditoría forense
CREATE TABLE IF NOT EXISTS eventos_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sesion_caja_id uuid REFERENCES sesiones_caja(id),
  usuario_id uuid,
  
  -- Tipo de evento
  tipo_evento VARCHAR(50) NOT NULL,
  subtipo VARCHAR(50),
  
  -- Contexto del evento
  venta_id uuid,
  producto_id uuid,
  item_index INT,
  
  -- Datos del evento
  datos JSONB NOT NULL DEFAULT '{}',
  
  -- Metadatos de auditoría
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  dispositivo VARCHAR(100),
  user_agent TEXT,
  
  -- Flags de riesgo
  requiere_supervisor BOOLEAN DEFAULT false,
  supervisor_id uuid,
  justificacion TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tipos de eventos POS a auditar
COMMENT ON TABLE eventos_pos IS 'Auditoría forense de TODAS las acciones del cajero en POS';

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant ON eventos_pos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pos_sesion ON eventos_pos(sesion_caja_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pos_tipo ON eventos_pos(tenant_id, tipo_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_pos_timestamp ON eventos_pos(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_pos_riesgo ON eventos_pos(tenant_id, requiere_supervisor) 
  WHERE requiere_supervisor = true;

-- RLS
ALTER TABLE eventos_pos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_pos_tenant_isolation ON eventos_pos;
CREATE POLICY eventos_pos_tenant_isolation ON eventos_pos
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Función para registrar evento POS
CREATE OR REPLACE FUNCTION registrar_evento_pos(
  p_tenant_id uuid,
  p_sesion_caja_id uuid,
  p_usuario_id uuid,
  p_tipo_evento VARCHAR,
  p_subtipo VARCHAR DEFAULT NULL,
  p_venta_id uuid DEFAULT NULL,
  p_producto_id uuid DEFAULT NULL,
  p_item_index INT DEFAULT NULL,
  p_datos JSONB DEFAULT '{}',
  p_ip_address INET DEFAULT NULL,
  p_dispositivo VARCHAR DEFAULT NULL,
  p_requiere_supervisor BOOLEAN DEFAULT false,
  p_supervisor_id uuid DEFAULT NULL,
  p_justificacion TEXT DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_evento_id uuid;
BEGIN
  INSERT INTO eventos_pos (
    tenant_id, sesion_caja_id, usuario_id,
    tipo_evento, subtipo,
    venta_id, producto_id, item_index,
    datos, ip_address, dispositivo,
    requiere_supervisor, supervisor_id, justificacion
  ) VALUES (
    p_tenant_id, p_sesion_caja_id, p_usuario_id,
    p_tipo_evento, p_subtipo,
    p_venta_id, p_producto_id, p_item_index,
    p_datos, p_ip_address, p_dispositivo,
    p_requiere_supervisor, p_supervisor_id, p_justificacion
  ) RETURNING id INTO v_evento_id;
  
  RETURN v_evento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION registrar_evento_pos IS 'Registra evento de auditoría POS';

-- Vista de eventos sospechosos (para dashboard de supervisores)
CREATE OR REPLACE VIEW vw_eventos_pos_sospechosos AS
SELECT
  ep.id,
  ep.tenant_id,
  ep.sesion_caja_id,
  ep.usuario_id,
  ep.tipo_evento,
  ep.subtipo,
  ep.datos,
  ep.timestamp,
  ep.requiere_supervisor,
  ep.supervisor_id,
  ep.justificacion,
  sc.cajero_id,
  c.nombre AS caja_nombre
FROM eventos_pos ep
LEFT JOIN sesiones_caja sc ON ep.sesion_caja_id = sc.id
LEFT JOIN cajas c ON sc.caja_id = c.id
WHERE ep.tipo_evento IN (
  'APERTURA_CAJON_SIN_VENTA',
  'ANULACION_ITEM',
  'DESCUENTO_MANUAL',
  'CAMBIO_PRECIO',
  'BUSQUEDA_MANUAL_EXCESIVA',
  'VENTA_ANULADA',
  'DEVOLUCION'
)
ORDER BY ep.timestamp DESC;

COMMENT ON VIEW vw_eventos_pos_sospechosos IS 'Eventos POS que requieren revisión de supervisor';

-- Función para detectar patrones sospechosos
CREATE OR REPLACE FUNCTION detectar_patrones_sospechosos_pos(
  p_tenant_id uuid,
  p_sesion_caja_id uuid DEFAULT NULL,
  p_horas_atras INT DEFAULT 24
)
RETURNS TABLE (
  patron VARCHAR,
  cantidad BIGINT,
  descripcion TEXT,
  nivel_riesgo VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  
  -- Patrón 1: Aperturas de cajón sin venta
  SELECT 
    'APERTURA_CAJON_SIN_VENTA'::VARCHAR AS patron,
    COUNT(*)::BIGINT AS cantidad,
    'Aperturas de cajón sin venta asociada'::TEXT AS descripcion,
    CASE 
      WHEN COUNT(*) > 5 THEN 'ALTO'
      WHEN COUNT(*) > 2 THEN 'MEDIO'
      ELSE 'BAJO'
    END::VARCHAR AS nivel_riesgo
  FROM eventos_pos
  WHERE tenant_id = p_tenant_id
    AND tipo_evento = 'APERTURA_CAJON_SIN_VENTA'
    AND timestamp > NOW() - (p_horas_atras || ' hours')::INTERVAL
    AND (p_sesion_caja_id IS NULL OR sesion_caja_id = p_sesion_caja_id)
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Patrón 2: Anulaciones de ítems excesivas
  SELECT 
    'ANULACION_ITEM_EXCESIVA'::VARCHAR,
    COUNT(*)::BIGINT,
    'Anulaciones de ítems después de escanear'::TEXT,
    CASE 
      WHEN COUNT(*) > 10 THEN 'ALTO'
      WHEN COUNT(*) > 5 THEN 'MEDIO'
      ELSE 'BAJO'
    END::VARCHAR
  FROM eventos_pos
  WHERE tenant_id = p_tenant_id
    AND tipo_evento = 'ANULACION_ITEM'
    AND timestamp > NOW() - (p_horas_atras || ' hours')::INTERVAL
    AND (p_sesion_caja_id IS NULL OR sesion_caja_id = p_sesion_caja_id)
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Patrón 3: Descuentos manuales frecuentes
  SELECT 
    'DESCUENTO_MANUAL_FRECUENTE'::VARCHAR,
    COUNT(*)::BIGINT,
    'Descuentos manuales aplicados'::TEXT,
    CASE 
      WHEN COUNT(*) > 20 THEN 'ALTO'
      WHEN COUNT(*) > 10 THEN 'MEDIO'
      ELSE 'BAJO'
    END::VARCHAR
  FROM eventos_pos
  WHERE tenant_id = p_tenant_id
    AND tipo_evento = 'DESCUENTO_MANUAL'
    AND timestamp > NOW() - (p_horas_atras || ' hours')::INTERVAL
    AND (p_sesion_caja_id IS NULL OR sesion_caja_id = p_sesion_caja_id)
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Patrón 4: Búsquedas manuales vs escaneos
  SELECT 
    'BUSQUEDA_MANUAL_ALTA'::VARCHAR,
    COUNT(*)::BIGINT,
    'Búsquedas manuales de productos (vs escaneo)'::TEXT,
    CASE 
      WHEN COUNT(*) > 50 THEN 'ALTO'
      WHEN COUNT(*) > 25 THEN 'MEDIO'
      ELSE 'BAJO'
    END::VARCHAR
  FROM eventos_pos
  WHERE tenant_id = p_tenant_id
    AND tipo_evento = 'BUSQUEDA_PRODUCTO'
    AND subtipo = 'MANUAL'
    AND timestamp > NOW() - (p_horas_atras || ' hours')::INTERVAL
    AND (p_sesion_caja_id IS NULL OR sesion_caja_id = p_sesion_caja_id)
  HAVING COUNT(*) > 0;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION detectar_patrones_sospechosos_pos IS 'Detecta patrones de comportamiento sospechoso en POS';

-- Permisos
GRANT SELECT ON vw_eventos_pos_sospechosos TO authenticated;
