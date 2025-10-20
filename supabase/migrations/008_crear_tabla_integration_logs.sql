-- Migration: Create integration_logs table for external service integration tracking
-- Requirements: 27.3, 27.5

-- Create integration_logs table
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    servicio VARCHAR(50) NOT NULL,
    operacion VARCHAR(100) NOT NULL,
    correlacion_id UUID,
    correlacion_tipo VARCHAR(50),
    request_summary JSONB,
    response_summary JSONB,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'PENDING', 'TIMEOUT')),
    status_code INTEGER,
    error_message TEXT,
    duration_ms INTEGER,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant ON integration_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_servicio ON integration_logs(servicio);
CREATE INDEX IF NOT EXISTS idx_integration_logs_correlacion ON integration_logs(correlacion_id, correlacion_tipo);
CREATE INDEX IF NOT EXISTS idx_integration_logs_timestamp ON integration_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_servicio 
    ON integration_logs(tenant_id, servicio, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see integration logs from their tenant
CREATE POLICY integration_logs_tenant_isolation ON integration_logs
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id 
            FROM usuarios_sistema 
            WHERE id = auth.uid()
        )
    );

-- Policy: System can insert integration logs
CREATE POLICY integration_logs_insert_policy ON integration_logs
    FOR INSERT
    WITH CHECK (true);

-- Add comments
COMMENT ON TABLE integration_logs IS 'Logs of external service integrations (SUNAT, GRE, etc.)';
COMMENT ON COLUMN integration_logs.servicio IS 'Name of the external service (SUNAT, GRE, etc.)';
COMMENT ON COLUMN integration_logs.operacion IS 'Operation performed (enviar_factura, consultar_ruc, etc.)';
COMMENT ON COLUMN integration_logs.correlacion_id IS 'ID of the related entity (pedido_id, factura_id, etc.)';
COMMENT ON COLUMN integration_logs.correlacion_tipo IS 'Type of related entity (PEDIDO, FACTURA, etc.)';
COMMENT ON COLUMN integration_logs.request_summary IS 'Summarized request data (sensitive data removed)';
COMMENT ON COLUMN integration_logs.response_summary IS 'Summarized response data';
COMMENT ON COLUMN integration_logs.status IS 'Status of the integration call';
COMMENT ON COLUMN integration_logs.duration_ms IS 'Duration of the call in milliseconds';
