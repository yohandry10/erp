-- =====================================================
-- Migración 145: Tabla para Conversiones Pendientes de Demo
-- =====================================================

CREATE TABLE IF NOT EXISTS demo_conversiones_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  stripe_session_id VARCHAR(255) UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  ruc VARCHAR(11) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  telefono VARCHAR(50),
  plan_id VARCHAR(50) NOT NULL DEFAULT 'basico',
  periodo VARCHAR(20) NOT NULL DEFAULT 'mensual',
  monto NUMERIC(10,2) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT check_estado CHECK (estado IN ('PENDIENTE', 'COMPLETADA', 'CANCELADA', 'EXPIRADA'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_demo_conv_tenant ON demo_conversiones_pendientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_demo_conv_session ON demo_conversiones_pendientes(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_demo_conv_estado ON demo_conversiones_pendientes(estado);

-- Comentarios
COMMENT ON TABLE demo_conversiones_pendientes IS 
  'Almacena datos de conversión mientras se procesa el pago en Stripe';

-- Grants
GRANT SELECT, INSERT, UPDATE ON demo_conversiones_pendientes TO service_role;
