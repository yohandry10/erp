-- Migration 122: Create autorizaciones_caja table
-- Tracks all supervisor authorizations for exceptional operations

CREATE TABLE IF NOT EXISTS autorizaciones_caja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  sesion_caja_id UUID NOT NULL REFERENCES sesiones_caja(id) ON DELETE CASCADE,
  
  -- Authorization type
  tipo_autorizacion VARCHAR(50) NOT NULL,
  -- Types: 'APERTURA_MONTO_BAJO', 'APERTURA_MONTO_ALTO', 'CIERRE_DIFERENCIA_ALTA', etc.
  
  -- Amount details
  monto_solicitado DECIMAL(10,2) NOT NULL,
  monto_min_configurado DECIMAL(10,2),
  monto_max_configurado DECIMAL(10,2),
  
  -- Authorization parties
  supervisor_id UUID NOT NULL REFERENCES usuarios_sistema(id),
  solicitante_id UUID NOT NULL REFERENCES usuarios_sistema(id),
  
  -- Authorization details
  razon_autorizacion TEXT NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'APROBADO',
  -- Estados: 'APROBADO', 'RECHAZADO', 'PENDIENTE'
  
  -- Digital signature for non-repudiation
  firma_digital TEXT,
  
  -- IP and device tracking
  ip_address INET,
  dispositivo VARCHAR(100),
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_tipo_autorizacion CHECK (
    tipo_autorizacion IN (
      'APERTURA_MONTO_BAJO',
      'APERTURA_MONTO_ALTO',
      'CIERRE_DIFERENCIA_ALTA',
      'RETIRO_MONTO_ALTO',
      'AJUSTE_MANUAL'
    )
  ),
  CONSTRAINT valid_estado CHECK (
    estado IN ('APROBADO', 'RECHAZADO', 'PENDIENTE')
  ),
  CONSTRAINT razon_minima CHECK (LENGTH(TRIM(razon_autorizacion)) >= 10)
);

-- Indexes for common queries
CREATE INDEX idx_autorizaciones_caja_tenant ON autorizaciones_caja(tenant_id);
CREATE INDEX idx_autorizaciones_caja_sesion ON autorizaciones_caja(sesion_caja_id);
CREATE INDEX idx_autorizaciones_caja_supervisor ON autorizaciones_caja(supervisor_id);
CREATE INDEX idx_autorizaciones_caja_solicitante ON autorizaciones_caja(solicitante_id);
CREATE INDEX idx_autorizaciones_caja_tipo ON autorizaciones_caja(tipo_autorizacion);
CREATE INDEX idx_autorizaciones_caja_fecha ON autorizaciones_caja(created_at DESC);

-- Composite index for audit reports
CREATE INDEX idx_autorizaciones_caja_audit ON autorizaciones_caja(
  tenant_id, 
  created_at DESC, 
  tipo_autorizacion
);

-- Comments
COMMENT ON TABLE autorizaciones_caja IS 
'Registro de todas las autorizaciones de supervisor para operaciones excepcionales en cajas. Incluye firma digital para no-repudio y trazabilidad completa.';

COMMENT ON COLUMN autorizaciones_caja.tipo_autorizacion IS 
'Tipo de operación que requirió autorización: APERTURA_MONTO_BAJO (< mín), APERTURA_MONTO_ALTO (> máx), CIERRE_DIFERENCIA_ALTA, etc.';

COMMENT ON COLUMN autorizaciones_caja.firma_digital IS 
'Hash SHA-256 de: tipo + monto + supervisor_id + timestamp + secret. Previene modificación posterior de autorizaciones.';

COMMENT ON COLUMN autorizaciones_caja.razon_autorizacion IS 
'Razón detallada proporcionada por el supervisor para justificar la excepción. Mínimo 10 caracteres.';

-- RLS Policies
ALTER TABLE autorizaciones_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY autorizaciones_caja_tenant_isolation ON autorizaciones_caja
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Function to generate digital signature
CREATE OR REPLACE FUNCTION generar_firma_autorizacion(
  p_tipo VARCHAR,
  p_monto DECIMAL,
  p_supervisor_id UUID,
  p_timestamp TIMESTAMP,
  p_secret TEXT DEFAULT 'CHANGE_ME_IN_PRODUCTION'
)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      p_tipo || '|' ||
      p_monto::TEXT || '|' ||
      p_supervisor_id::TEXT || '|' ||
      EXTRACT(EPOCH FROM p_timestamp)::TEXT || '|' ||
      p_secret,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generar_firma_autorizacion IS 
'Genera firma digital SHA-256 para autorización. Incluye tipo, monto, supervisor, timestamp y secret para prevenir falsificación.';

-- View for audit reports with user details
CREATE OR REPLACE VIEW vista_autorizaciones_caja AS
SELECT 
  a.id,
  a.tenant_id,
  a.sesion_caja_id,
  a.tipo_autorizacion,
  a.monto_solicitado,
  a.monto_min_configurado,
  a.monto_max_configurado,
  a.razon_autorizacion,
  a.estado,
  a.created_at,
  
  -- Supervisor details
  sup.nombre AS supervisor_nombre,
  sup.email AS supervisor_email,
  
  -- Requester details
  sol.nombre AS solicitante_nombre,
  sol.email AS solicitante_email,
  
  -- Session details
  s.caja_id,
  s.hora_apertura AS sesion_apertura,
  c.nombre AS caja_nombre
  
FROM autorizaciones_caja a
LEFT JOIN usuarios_sistema sup ON a.supervisor_id = sup.id
LEFT JOIN usuarios_sistema sol ON a.solicitante_id = sol.id
LEFT JOIN sesiones_caja s ON a.sesion_caja_id = s.id
LEFT JOIN cajas c ON s.caja_id = c.id;

COMMENT ON VIEW vista_autorizaciones_caja IS 
'Vista enriquecida de autorizaciones con detalles de supervisor, solicitante, y caja para reportes.';
