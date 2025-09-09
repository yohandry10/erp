-- =============================================================================
-- OPTIMIZACIÓN DE RENDIMIENTO - REPORTES Y ANÁLISIS
-- Índices optimizados y agregaciones históricas para KPIs y tendencias
-- =============================================================================

-- =============================================================================
-- 1. ÍNDICES PARA CONSULTAS DE KPIs
-- =============================================================================

-- Índices para ventas_pos (consultas de ventas por tiempo)
CREATE INDEX IF NOT EXISTS idx_ventas_pos_fecha_estado ON ventas_pos(fecha DESC, estado) WHERE estado IN ('COMPLETADA', 'PAGADA');
CREATE INDEX IF NOT EXISTS idx_ventas_pos_fecha_total ON ventas_pos(fecha DESC, total);
CREATE INDEX IF NOT EXISTS idx_ventas_pos_mes_anio ON ventas_pos(EXTRACT(YEAR FROM fecha), EXTRACT(MONTH FROM fecha));
CREATE INDEX IF NOT EXISTS idx_ventas_pos_periodo ON ventas_pos(TO_CHAR(fecha, 'YYYY-MM'));

-- Índices para gastos (análisis de costos)
CREATE INDEX IF NOT EXISTS idx_gastos_fecha_categoria ON gastos(fecha DESC, categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_mes_anio ON gastos(EXTRACT(YEAR FROM fecha), EXTRACT(MONTH FROM fecha));
CREATE INDEX IF NOT EXISTS idx_gastos_periodo_categoria ON gastos(TO_CHAR(fecha, 'YYYY-MM'), categoria);

-- Índices para cuentas por cobrar/pagar
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_fecha_venc ON cuentas_por_cobrar(fecha_vencimiento DESC, estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_fecha_venc ON cuentas_por_pagar(fecha_vencimiento DESC, estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_cliente ON cuentas_por_cobrar(cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_proveedor ON cuentas_por_pagar(proveedor_id, estado);

-- Índices para productos y análisis de rentabilidad
CREATE INDEX IF NOT EXISTS idx_productos_precio_stock ON productos(precio, stock);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_producto ON ventas_detalle(producto_id, cantidad, precio_unitario);
CREATE INDEX IF NOT EXISTS idx_compras_detalle_producto ON compras_detalle(producto_id, cantidad, precio_unitario);

-- =============================================================================
-- 2. TABLAS DE AGREGACIONES HISTÓRICAS
-- =============================================================================

-- Tabla de ventas mensuales agregadas
CREATE TABLE IF NOT EXISTS ventas_mensuales_agregadas (
    id SERIAL PRIMARY KEY,
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    periodo VARCHAR(7) UNIQUE NOT NULL, -- Formato YYYY-MM
    total_ventas DECIMAL(15,2) DEFAULT 0,
    cantidad_transacciones INTEGER DEFAULT 0,
    ticket_promedio DECIMAL(10,2) DEFAULT 0,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_periodo UNIQUE (anio, mes)
);

-- Tabla de gastos mensuales por categoría
CREATE TABLE IF NOT EXISTS gastos_mensuales_agregados (
    id SERIAL PRIMARY KEY,
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    periodo VARCHAR(7) NOT NULL, -- Formato YYYY-MM
    categoria VARCHAR(100) NOT NULL,
    total_gastos DECIMAL(15,2) DEFAULT 0,
    cantidad_registros INTEGER DEFAULT 0,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_periodo_categoria UNIQUE (anio, mes, categoria)
);

-- Tabla de utilidad mensual
CREATE TABLE IF NOT EXISTS utilidad_mensual_agregada (
    id SERIAL PRIMARY KEY,
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    periodo VARCHAR(7) UNIQUE NOT NULL, -- Formato YYYY-MM
    ventas_totales DECIMAL(15,2) DEFAULT 0,
    gastos_totales DECIMAL(15,2) DEFAULT 0,
    utilidad_neta DECIMAL(15,2) DEFAULT 0,
    margen_porcentaje DECIMAL(5,2) DEFAULT 0,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_periodo_utilidad UNIQUE (anio, mes)
);

-- Tabla de cuentas por cobrar agregadas
CREATE TABLE IF NOT EXISTS cuentas_cobrar_agregadas (
    id SERIAL PRIMARY KEY,
    fecha_corte DATE NOT NULL,
    total_cuentas_cobrar DECIMAL(15,2) DEFAULT 0,
    total_vencido DECIMAL(15,2) DEFAULT 0,
    porcentaje_vencido DECIMAL(5,2) DEFAULT 0,
    dias_promedio_vencimiento INTEGER DEFAULT 0,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de cuentas por pagar agregadas
CREATE TABLE IF NOT EXISTS cuentas_pagar_agregadas (
    id SERIAL PRIMARY KEY,
    fecha_corte DATE NOT NULL,
    total_cuentas_pagar DECIMAL(15,2) DEFAULT 0,
    total_vencido DECIMAL(15,2) DEFAULT 0,
    porcentaje_vencido DECIMAL(5,2) DEFAULT 0,
    dias_promedio_vencimiento INTEGER DEFAULT 0,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 3. FUNCIONES PARA ACTUALIZAR AGREGACIONES
-- =============================================================================

-- Función para actualizar ventas mensuales
CREATE OR REPLACE FUNCTION actualizar_ventas_mensuales(p_anio INTEGER, p_mes INTEGER)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ventas_mensuales_agregadas (anio, mes, periodo, total_ventas, cantidad_transacciones, ticket_promedio)
    SELECT 
        p_anio,
        p_mes,
        TO_CHAR(DATE '2024-01-01' + (p_anio - 2024) * INTERVAL '1 year' + (p_mes - 1) * INTERVAL '1 month', 'YYYY-MM'),
        COALESCE(SUM(total), 0),
        COALESCE(COUNT(*), 0),
        CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total), 0) / COUNT(*) ELSE 0 END
    FROM ventas_pos
    WHERE EXTRACT(YEAR FROM fecha) = p_anio 
      AND EXTRACT(MONTH FROM fecha) = p_mes
      AND estado IN ('COMPLETADA', 'PAGADA')
    ON CONFLICT (anio, mes) DO UPDATE SET
        total_ventas = EXCLUDED.total_ventas,
        cantidad_transacciones = EXCLUDED.cantidad_transacciones,
        ticket_promedio = EXCLUDED.ticket_promedio,
        fecha_actualizacion = NOW();
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar gastos mensuales
CREATE OR REPLACE FUNCTION actualizar_gastos_mensuales(p_anio INTEGER, p_mes INTEGER)
RETURNS VOID AS $$
BEGIN
    INSERT INTO gastos_mensuales_agregados (anio, mes, periodo, categoria, total_gastos, cantidad_registros)
    SELECT 
        p_anio,
        p_mes,
        TO_CHAR(DATE '2024-01-01' + (p_anio - 2024) * INTERVAL '1 year' + (p_mes - 1) * INTERVAL '1 month', 'YYYY-MM'),
        categoria,
        COALESCE(SUM(monto), 0),
        COALESCE(COUNT(*), 0)
    FROM gastos
    WHERE EXTRACT(YEAR FROM fecha) = p_anio 
      AND EXTRACT(MONTH FROM fecha) = p_mes
    GROUP BY categoria
    ON CONFLICT (anio, mes, categoria) DO UPDATE SET
        total_gastos = EXCLUDED.total_gastos,
        cantidad_registros = EXCLUDED.cantidad_registros,
        fecha_actualizacion = NOW();
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar utilidad mensual
CREATE OR REPLACE FUNCTION actualizar_utilidad_mensual(p_anio INTEGER, p_mes INTEGER)
RETURNS VOID AS $$
DECLARE
    v_ventas DECIMAL(15,2);
    v_gastos DECIMAL(15,2);
    v_utilidad DECIMAL(15,2);
    v_margen DECIMAL(5,2);
BEGIN
    -- Calcular ventas del mes
    SELECT COALESCE(SUM(total), 0) INTO v_ventas
    FROM ventas_pos
    WHERE EXTRACT(YEAR FROM fecha) = p_anio 
      AND EXTRACT(MONTH FROM fecha) = p_mes
      AND estado IN ('COMPLETADA', 'PAGADA');

    -- Calcular gastos del mes
    SELECT COALESCE(SUM(monto), 0) INTO v_gastos
    FROM gastos
    WHERE EXTRACT(YEAR FROM fecha) = p_anio 
      AND EXTRACT(MONTH FROM fecha) = p_mes;

    -- Calcular utilidad y margen
    v_utilidad := v_ventas - v_gastos;
    v_margen := CASE WHEN v_ventas > 0 THEN (v_utilidad / v_ventas) * 100 ELSE 0 END;

    -- Insertar o actualizar
    INSERT INTO utilidad_mensual_agregada (anio, mes, periodo, ventas_totales, gastos_totales, utilidad_neta, margen_porcentaje)
    VALUES (p_anio, p_mes, TO_CHAR(DATE '2024-01-01' + (p_anio - 2024) * INTERVAL '1 year' + (p_mes - 1) * INTERVAL '1 month', 'YYYY-MM'), v_ventas, v_gastos, v_utilidad, v_margen)
    ON CONFLICT (anio, mes) DO UPDATE SET
        ventas_totales = EXCLUDED.ventas_totales,
        gastos_totales = EXCLUDED.gastos_totales,
        utilidad_neta = EXCLUDED.utilidad_neta,
        margen_porcentaje = EXCLUDED.margen_porcentaje,
        fecha_actualizacion = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. TRIGGERS PARA ACTUALIZACIÓN AUTOMÁTICA
-- =============================================================================

-- Trigger para actualizar agregaciones cuando se inserta una venta
CREATE OR REPLACE FUNCTION trigger_actualizar_ventas_agregadas()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM actualizar_ventas_mensuales(EXTRACT(YEAR FROM NEW.fecha), EXTRACT(MONTH FROM NEW.fecha));
    PERFORM actualizar_utilidad_mensual(EXTRACT(YEAR FROM NEW.fecha), EXTRACT(MONTH FROM NEW.fecha));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_ventas_agregadas
    AFTER INSERT OR UPDATE ON ventas_pos
    FOR EACH ROW
    WHEN (NEW.estado IN ('COMPLETADA', 'PAGADA'))
    EXECUTE FUNCTION trigger_actualizar_ventas_agregadas();

-- Trigger para actualizar agregaciones cuando se inserta un gasto
CREATE OR REPLACE FUNCTION trigger_actualizar_gastos_agregados()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM actualizar_gastos_mensuales(EXTRACT(YEAR FROM NEW.fecha), EXTRACT(MONTH FROM NEW.fecha));
    PERFORM actualizar_utilidad_mensual(EXTRACT(YEAR FROM NEW.fecha), EXTRACT(MONTH FROM NEW.fecha));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_gastos_agregados
    AFTER INSERT OR UPDATE ON gastos
    FOR EACH ROW
    EXECUTE FUNCTION trigger_actualizar_gastos_agregados();

-- =============================================================================
-- 5. VISTAS MATERIALIZADAS PARA CONSULTAS RÁPIDAS
-- =============================================================================

-- Vista materializada de KPIs mensuales
CREATE MATERIALIZED VIEW IF NOT EXISTS kpi_mensual_resumen AS
SELECT 
    u.anio,
    u.mes,
    u.periodo,
    u.ventas_totales,
    u.gastos_totales,
    u.utilidad_neta,
    u.margen_porcentaje,
    COALESCE(cpc.total_cuentas_cobrar, 0) as cuentas_por_cobrar,
    COALESCE(cpp.total_cuentas_pagar, 0) as cuentas_por_pagar,
    COALESCE(v.cantidad_transacciones, 0) as cantidad_transacciones,
    COALESCE(v.ticket_promedio, 0) as ticket_promedio
FROM utilidad_mensual_agregada u
LEFT JOIN ventas_mensuales_agregadas v ON u.anio = v.anio AND u.mes = v.mes
LEFT JOIN cuentas_cobrar_agregadas cpc ON DATE_TRUNC('month', cpc.fecha_corte) = DATE_TRUNC('month', DATE '2024-01-01' + (u.anio - 2024) * INTERVAL '1 year' + (u.mes - 1) * INTERVAL '1 month')
LEFT JOIN cuentas_pagar_agregadas cpp ON DATE_TRUNC('month', cpp.fecha_corte) = DATE_TRUNC('month', DATE '2024-01-01' + (u.anio - 2024) * INTERVAL '1 year' + (u.mes - 1) * INTERVAL '1 month')
ORDER BY u.anio DESC, u.mes DESC;

-- Índices para la vista materializada
CREATE INDEX IF NOT EXISTS idx_kpi_mensual_periodo ON kpi_mensual_resumen(periodo);
CREATE INDEX IF NOT EXISTS idx_kpi_mensual_anio_mes ON kpi_mensual_resumen(anio, mes);

-- =============================================================================
-- 6. REFRESH AUTOMÁTICO DE VISTAS MATERIALIZADAS
-- =============================================================================

-- Función para refrescar vistas materializadas
CREATE OR REPLACE FUNCTION refrescar_vistas_materializadas()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY kpi_mensual_resumen;
END;
$$ LANGUAGE plpgsql;

-- Job programado para refrescar vistas cada hora
SELECT cron.schedule('refresh-kpi-vistas', '0 * * * *', 'SELECT refrescar_vistas_materializadas();');

-- =============================================================================
-- 7. INSTRUCCIONES DE USO
-- =============================================================================

-- Para poblar datos históricos:
-- SELECT actualizar_ventas_mensuales(2024, 1);
-- SELECT actualizar_gastos_mensuales(2024, 1);
-- SELECT actualizar_utilidad_mensual(2024, 1);

-- Para consultar KPIs rápidamente:
-- SELECT * FROM kpi_mensual_resumen WHERE periodo = '2024-01';
-- SELECT * FROM ventas_mensuales_agregadas WHERE anio = 2024 ORDER BY mes;

-- Para ver estadísticas de rendimiento:
-- EXPLAIN ANALYZE SELECT * FROM kpi_mensual_resumen WHERE periodo >= '2024-01';