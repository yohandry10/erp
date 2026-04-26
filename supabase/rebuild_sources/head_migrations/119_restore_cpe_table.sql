-- =====================================================
-- MIGRACIÓN 119: Restauración de Definición de Tabla CPE
-- =====================================================
-- Descripción: Esta migración actúa como "baseline" para la tabla 'cpe'.
--              El archivo original de creación fue eliminado accidentalmente.
--              Este script asegura que la tabla exista con la estructura correcta
--              para futuros despliegues o entornos de desarrollo.
-- Fecha: 2025-11-27
-- Autor: Antigravity (Restauración Forense)
-- =====================================================

CREATE TABLE IF NOT EXISTS cpe (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  tipo_documento VARCHAR(10) NOT NULL,
  serie VARCHAR(10) NOT NULL,
  numero INTEGER NOT NULL,
  ruc_emisor VARCHAR(11) NOT NULL,
  razon_social_emisor VARCHAR(255) NOT NULL,
  tipo_documento_receptor VARCHAR(10) NOT NULL,
  documento_receptor VARCHAR(20) NOT NULL,
  razon_social_receptor VARCHAR(255) NOT NULL,
  direccion_receptor TEXT,
  moneda VARCHAR(3) NOT NULL,
  total_gravadas NUMERIC(12,2) DEFAULT 0,
  total_igv NUMERIC(12,2) DEFAULT 0,
  total_venta NUMERIC(12,2) DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'PENDIENTE', -- Estado interno
  hash VARCHAR(255),
  xml_firmado TEXT,
  cdr_sunat TEXT,
  error_message TEXT,
  items JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Columnas agregadas en migraciones posteriores (incluidas aquí para completitud del baseline)
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  idempotency_key VARCHAR(255),
  sunat_status VARCHAR(20) DEFAULT 'NOT_SENT', -- Estado workflow SUNAT
  hash_firma TEXT,
  event_id UUID,
  fecha_emision DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  documento_id UUID
);

-- Comentarios de columnas
COMMENT ON TABLE cpe IS 'Comprobantes de Pago Electrónicos (Facturas, Boletas, Notas)';
COMMENT ON COLUMN cpe.retry_count IS 'Número de reintentos realizados para envío a SUNAT';
COMMENT ON COLUMN cpe.next_retry_at IS 'Fecha y hora del siguiente reintento programado (backoff exponencial)';
COMMENT ON COLUMN cpe.idempotency_key IS 'Identificador idempotente por tenant para evitar emisión duplicada del comprobante';
COMMENT ON COLUMN cpe.sunat_status IS 'Estado endurecido del workflow con SUNAT: NOT_SENT, READY, SENDING, ACCEPTED, REJECTED, ERROR';
COMMENT ON COLUMN cpe.hash_firma IS 'Hash SHA-256 de la firma digital del XML enviado a SUNAT';
COMMENT ON COLUMN cpe.event_id IS 'Identificador del evento FacturaEmitidaEvent asociado al comprobante';
COMMENT ON COLUMN cpe.fecha_emision IS 'Fecha de emisión declarada ante SUNAT';
COMMENT ON COLUMN cpe.fecha_vencimiento IS 'Fecha de vencimiento para cobranza del comprobante';
COMMENT ON COLUMN cpe.documento_id IS 'UUID del documento fiscal. Conecta el CPE con el documento en la tabla documentos';

-- Índices (si no existen, se crean para asegurar performance)
CREATE INDEX IF NOT EXISTS idx_cpe_tenant ON cpe(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cpe_fecha_emision ON cpe(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_cpe_serie_numero ON cpe(tenant_id, tipo_documento, serie, numero);
CREATE INDEX IF NOT EXISTS idx_cpe_sunat_status ON cpe(sunat_status);

-- RLS (Row Level Security)
ALTER TABLE cpe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpe_tenant_isolation" ON cpe;
CREATE POLICY "cpe_tenant_isolation"
  ON cpe FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());
