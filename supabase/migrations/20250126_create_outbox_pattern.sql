-- Outbox Pattern para eventos atómicos
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    correlation_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL, -- 'factura', 'compra', 'stock', etc.
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- 'created', 'updated', 'deleted'
    event_data JSONB NOT NULL,
    event_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    retry_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
    error_message TEXT NULL
);

-- Índices para optimización
CREATE INDEX idx_outbox_status_created ON outbox_events(status, created_at);
CREATE INDEX idx_outbox_correlation ON outbox_events(correlation_id);
CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_event_type ON outbox_events(event_type);

-- Tabla para tracking de procesamiento
CREATE TABLE IF NOT EXISTS event_processing_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL,
    processor_name VARCHAR(100) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    status VARCHAR(20) DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed')),
    error_details JSONB NULL,
    FOREIGN KEY (event_id) REFERENCES outbox_events(event_id)
);

CREATE INDEX idx_processing_log_event ON event_processing_log(event_id);
CREATE INDEX idx_processing_log_status ON event_processing_log(status, started_at);

-- Función para limpiar eventos procesados (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_processed_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM outbox_events 
    WHERE status = 'processed' 
    AND processed_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE outbox_events IS 'Outbox pattern para eventos atómicos y consistencia eventual';
COMMENT ON TABLE event_processing_log IS 'Log de procesamiento de eventos para trazabilidad';