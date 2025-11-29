-- Migration: Adaptive Rate Limiting
-- Descripción: Tablas para rate limiting adaptativo por usuario/tenant

-- ============================================
-- Tabla: rate_limit_baselines
-- Almacena el baseline de requests por usuario/endpoint
-- ============================================
CREATE TABLE IF NOT EXISTS app.rate_limit_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    
    -- Estadísticas calculadas
    avg_requests_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_requests_per_hour INTEGER NOT NULL DEFAULT 0,
    std_deviation NUMERIC(10,2) NOT NULL DEFAULT 0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint único por usuario/tenant/endpoint
    CONSTRAINT uq_rate_limit_baseline UNIQUE (tenant_id, user_id, endpoint)
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_tenant 
    ON app.rate_limit_baselines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_user 
    ON app.rate_limit_baselines(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_last_calc 
    ON app.rate_limit_baselines(last_calculated);

-- ============================================
-- Tabla: rate_limit_blocks
-- Bloqueos temporales por comportamiento anómalo
-- ============================================
CREATE TABLE IF NOT EXISTS app.rate_limit_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    -- Información del bloqueo
    reason TEXT NOT NULL,
    blocked_endpoint VARCHAR(255),
    request_count INTEGER,
    
    -- Vigencia
    expires_at TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ,
    released_by UUID,
    release_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_tenant 
    ON app.rate_limit_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_user 
    ON app.rate_limit_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_expires 
    ON app.rate_limit_blocks(expires_at) 
    WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_active 
    ON app.rate_limit_blocks(tenant_id, user_id, expires_at) 
    WHERE released_at IS NULL;

-- ============================================
-- Tabla: rate_limit_anomalies
-- Registro de anomalías detectadas
-- ============================================
CREATE TABLE IF NOT EXISTS app.rate_limit_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    
    -- Detalles de la anomalía
    anomaly_type VARCHAR(50) NOT NULL, -- BURST, SUSTAINED, PATTERN, GEOGRAPHIC
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
    description TEXT NOT NULL,
    
    -- Métricas
    request_count INTEGER NOT NULL,
    baseline_avg NUMERIC(10,2),
    threshold_exceeded NUMERIC(10,2),
    
    -- Contexto
    ip_address INET,
    user_agent TEXT,
    geo_location JSONB,
    
    -- Acción tomada
    action_taken VARCHAR(50), -- NONE, WARNED, THROTTLED, BLOCKED
    block_id UUID REFERENCES app.rate_limit_blocks(id),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    review_notes TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_tenant 
    ON app.rate_limit_anomalies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_user 
    ON app.rate_limit_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_created 
    ON app.rate_limit_anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_severity 
    ON app.rate_limit_anomalies(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_unreviewed 
    ON app.rate_limit_anomalies(tenant_id, created_at DESC) 
    WHERE reviewed_at IS NULL;

-- ============================================
-- Tabla: trusted_ips
-- IPs confiables sin rate limiting
-- ============================================
CREATE TABLE IF NOT EXISTS app.trusted_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- NULL = global
    
    ip_address INET NOT NULL,
    ip_range CIDR, -- Para rangos de IP
    description TEXT NOT NULL,
    
    -- Control
    active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    
    -- Auditoría
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_trusted_ip UNIQUE (tenant_id, ip_address)
);

-- Índice para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_trusted_ips_active 
    ON app.trusted_ips(ip_address) 
    WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_trusted_ips_tenant 
    ON app.trusted_ips(tenant_id) 
    WHERE active = true;


-- ============================================
-- Tabla: request_logs
-- Log de requests para cálculo de baseline
-- ============================================
CREATE TABLE IF NOT EXISTS app.request_logs (
    id UUID DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    
    -- Métricas
    response_time_ms INTEGER,
    status_code INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    
    -- Contexto
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Primary key must include partition key
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Crear particiones para los próximos 12 meses
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..11 LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'request_logs_' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS app.%I PARTITION OF app.request_logs 
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        start_date := end_date;
    END LOOP;
END $$;

-- Índices en tabla particionada
CREATE INDEX IF NOT EXISTS idx_request_logs_tenant_user 
    ON app.request_logs(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_endpoint 
    ON app.request_logs(endpoint, created_at DESC);

-- ============================================
-- Tabla: rate_limit_configs
-- Configuración de límites por endpoint/tenant
-- ============================================
CREATE TABLE IF NOT EXISTS app.rate_limit_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- NULL = global
    
    endpoint_pattern VARCHAR(255) NOT NULL,
    
    -- Límites
    base_limit INTEGER NOT NULL DEFAULT 100,
    window_ms INTEGER NOT NULL DEFAULT 60000,
    adaptive_multiplier NUMERIC(3,1) NOT NULL DEFAULT 3.0,
    burst_multiplier NUMERIC(3,1) NOT NULL DEFAULT 5.0,
    
    -- Control
    enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_rate_limit_config UNIQUE (tenant_id, endpoint_pattern)
);

-- Configuraciones por defecto
INSERT INTO app.rate_limit_configs (tenant_id, endpoint_pattern, base_limit, window_ms, adaptive_multiplier, burst_multiplier)
VALUES 
    (NULL, 'POST /api/auth/login', 5, 60000, 1.5, 2.0),
    (NULL, 'POST /api/auth/refresh', 10, 60000, 2.0, 3.0),
    (NULL, 'POST /api/auth/password-reset', 3, 60000, 1.0, 1.5),
    (NULL, 'POST /api/pedidos', 100, 3600000, 3.0, 5.0),
    (NULL, 'GET /api/productos', 1000, 3600000, 3.0, 5.0),
    (NULL, 'POST /api/pos/ventas', 200, 3600000, 3.0, 5.0),
    (NULL, 'GET /api/reportes', 50, 3600000, 2.0, 3.0),
    (NULL, 'DEFAULT', 100, 60000, 3.0, 5.0)
ON CONFLICT DO NOTHING;

-- ============================================
-- Vista: v_rate_limit_status
-- Estado actual de rate limiting por tenant
-- ============================================
CREATE OR REPLACE VIEW app.v_rate_limit_status AS
SELECT 
    ec.tenant_id,
    ec.razon_social AS tenant_nombre,
    
    -- Baselines
    (SELECT COUNT(*) FROM app.rate_limit_baselines b WHERE b.tenant_id = ec.tenant_id) AS total_baselines,
    
    -- Bloqueos activos
    (SELECT COUNT(*) FROM app.rate_limit_blocks bl 
     WHERE bl.tenant_id = ec.tenant_id 
     AND bl.expires_at > NOW() 
     AND bl.released_at IS NULL) AS active_blocks,
    
    -- Anomalías últimas 24h
    (SELECT COUNT(*) FROM app.rate_limit_anomalies a 
     WHERE a.tenant_id = ec.tenant_id 
     AND a.created_at > NOW() - INTERVAL '24 hours') AS anomalies_24h,
    
    -- Anomalías críticas sin revisar
    (SELECT COUNT(*) FROM app.rate_limit_anomalies a 
     WHERE a.tenant_id = ec.tenant_id 
     AND a.severity = 'CRITICAL'
     AND a.reviewed_at IS NULL) AS critical_unreviewed,
    
    -- IPs confiables
    (SELECT COUNT(*) FROM app.trusted_ips tip 
     WHERE (tip.tenant_id = ec.tenant_id OR tip.tenant_id IS NULL)
     AND tip.active = true) AS trusted_ips_count

FROM empresa_config ec;

-- ============================================
-- Función: calcular_baseline_usuario
-- Calcula el baseline de un usuario para un endpoint
-- ============================================
CREATE OR REPLACE FUNCTION app.calcular_baseline_usuario(
    p_tenant_id UUID,
    p_user_id UUID,
    p_endpoint VARCHAR(255),
    p_dias INTEGER DEFAULT 7
)
RETURNS TABLE (
    avg_requests_per_hour NUMERIC,
    max_requests_per_hour INTEGER,
    std_deviation NUMERIC,
    sample_count INTEGER
) AS $$
DECLARE
    v_start_date TIMESTAMPTZ := NOW() - (p_dias || ' days')::INTERVAL;
BEGIN
    RETURN QUERY
    WITH hourly_counts AS (
        SELECT 
            DATE_TRUNC('hour', created_at) AS hour_bucket,
            COUNT(*) AS request_count
        FROM app.request_logs
        WHERE tenant_id = p_tenant_id
          AND user_id = p_user_id
          AND endpoint = p_endpoint
          AND created_at >= v_start_date
        GROUP BY DATE_TRUNC('hour', created_at)
    )
    SELECT 
        COALESCE(AVG(request_count), 0)::NUMERIC AS avg_requests_per_hour,
        COALESCE(MAX(request_count), 0)::INTEGER AS max_requests_per_hour,
        COALESCE(STDDEV(request_count), 0)::NUMERIC AS std_deviation,
        COUNT(*)::INTEGER AS sample_count
    FROM hourly_counts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Función: detectar_anomalia_rate_limit
-- Detecta si un patrón de requests es anómalo
-- ============================================
CREATE OR REPLACE FUNCTION app.detectar_anomalia_rate_limit(
    p_tenant_id UUID,
    p_user_id UUID,
    p_endpoint VARCHAR(255),
    p_current_count INTEGER
)
RETURNS TABLE (
    is_anomaly BOOLEAN,
    anomaly_type VARCHAR(50),
    severity VARCHAR(20),
    description TEXT
) AS $$
DECLARE
    v_baseline RECORD;
    v_threshold NUMERIC;
BEGIN
    -- Obtener baseline
    SELECT * INTO v_baseline
    FROM app.rate_limit_baselines
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND endpoint = p_endpoint;
    
    -- Sin baseline suficiente
    IF v_baseline IS NULL OR v_baseline.sample_count < 10 THEN
        RETURN QUERY SELECT false, NULL::VARCHAR, NULL::VARCHAR, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Verificar si excede 5x el promedio (BURST)
    IF p_current_count > v_baseline.avg_requests_per_hour * 5 THEN
        RETURN QUERY SELECT 
            true,
            'BURST'::VARCHAR,
            'HIGH'::VARCHAR,
            format('Request count %s exceeds 5x baseline (%s)', 
                   p_current_count, 
                   ROUND(v_baseline.avg_requests_per_hour, 2))::TEXT;
        RETURN;
    END IF;
    
    -- Verificar si excede promedio + 3 desviaciones estándar
    v_threshold := v_baseline.avg_requests_per_hour + (v_baseline.std_deviation * 3);
    IF p_current_count > v_threshold THEN
        RETURN QUERY SELECT 
            true,
            'SUSTAINED'::VARCHAR,
            'MEDIUM'::VARCHAR,
            format('Request count %s exceeds statistical threshold (%s)', 
                   p_current_count, 
                   ROUND(v_threshold, 2))::TEXT;
        RETURN;
    END IF;
    
    -- No es anomalía
    RETURN QUERY SELECT false, NULL::VARCHAR, NULL::VARCHAR, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Función: limpiar_request_logs_antiguos
-- Limpia logs de más de 30 días
-- ============================================
CREATE OR REPLACE FUNCTION app.limpiar_request_logs_antiguos()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM app.request_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Habilitar RLS
-- ============================================
ALTER TABLE app.rate_limit_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_limit_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_limit_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trusted_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_limit_configs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (acceso por tenant)
CREATE POLICY rate_limit_baselines_tenant_policy ON app.rate_limit_baselines
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY rate_limit_blocks_tenant_policy ON app.rate_limit_blocks
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY rate_limit_anomalies_tenant_policy ON app.rate_limit_anomalies
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY trusted_ips_tenant_policy ON app.trusted_ips
    FOR ALL USING (
        tenant_id IS NULL 
        OR tenant_id = current_setting('app.tenant_id', true)::UUID
    );

CREATE POLICY rate_limit_configs_tenant_policy ON app.rate_limit_configs
    FOR ALL USING (
        tenant_id IS NULL 
        OR tenant_id = current_setting('app.tenant_id', true)::UUID
    );

-- ============================================
-- Comentarios
-- ============================================
COMMENT ON TABLE app.rate_limit_baselines IS 'Baseline de requests por usuario/endpoint para rate limiting adaptativo';
COMMENT ON TABLE app.rate_limit_blocks IS 'Bloqueos temporales por comportamiento anómalo';
COMMENT ON TABLE app.rate_limit_anomalies IS 'Registro de anomalías detectadas en patrones de requests';
COMMENT ON TABLE app.trusted_ips IS 'IPs confiables exentas de rate limiting';
COMMENT ON TABLE app.request_logs IS 'Log de requests para cálculo de baselines (particionado por mes)';
COMMENT ON TABLE app.rate_limit_configs IS 'Configuración de límites por endpoint';
