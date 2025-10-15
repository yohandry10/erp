-- FUNCIONES DE INTEGRACIÓN FINANCIERA
-- Creadas basadas en FinancialIntegrationService para KPIs y análisis financiero

-- Función principal para obtener KPIs financieros (optimizada)
CREATE OR REPLACE FUNCTION get_kpis_financieros()
RETURNS TABLE (
    efectivo_disponible numeric,
    ventas_ultimos_30dias numeric,
    gastos_ultimos_30dias numeric,
    utilidad_ultimos_30dias numeric,
    cuentas_por_cobrar numeric,
    cuentas_por_pagar numeric,
    rotacion_inventario numeric,
    margen_bruto numeric,
    liquidez text,
    rentabilidad text,
    crecimiento text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_efectivo numeric;
    v_ventas numeric;
    v_gastos numeric;
    v_cobrar numeric;
    v_pagar numeric;
    v_inventario numeric;
    v_utilidad numeric;
    v_margen numeric;
    v_rotacion numeric;
BEGIN
    -- Calcular efectivo disponible (pagos en efectivo de ventas de últimos 30 días)
    SELECT COALESCE(SUM(pv.monto::numeric), 0)
    INTO v_efectivo
    FROM pagos_ventas pv
    INNER JOIN ventas v ON pv.venta_id = v.id
    WHERE pv.metodo_pago = 'EFECTIVO'
    AND v.fecha >= CURRENT_DATE - INTERVAL '30 days'
    AND v.estado IN ('EMITIDA', 'PAGADA');

    -- Calcular ventas últimos 30 días
    SELECT COALESCE(SUM(total::numeric), 0)
    INTO v_ventas
    FROM ventas
    WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
    AND estado IN ('EMITIDA', 'PAGADA');

    -- Calcular gastos últimos 30 días
    SELECT COALESCE(SUM(monto::numeric), 0)
    INTO v_gastos
    FROM gastos
    WHERE fecha >= CURRENT_DATE - INTERVAL '30 days';

    -- Calcular cuentas por cobrar pendientes
    SELECT COALESCE(SUM(saldo_pendiente::numeric), 0)
    INTO v_cobrar
    FROM cuentas_por_cobrar
    WHERE estado != 'COBRADA';

    -- Calcular cuentas por pagar pendientes
    SELECT COALESCE(SUM(saldo_pendiente::numeric), 0)
    INTO v_pagar
    FROM cuentas_por_pagar
    WHERE estado != 'PAGADA';

    -- Calcular valor del inventario manejando ambas posibles estructuras
    BEGIN
        EXECUTE 'SELECT COALESCE(SUM(precio_venta::numeric * stock_actual::numeric),0) FROM productos'
        INTO v_inventario;
    EXCEPTION
        WHEN undefined_column THEN
            EXECUTE 'SELECT COALESCE(SUM(precio::numeric * stock::numeric),0) FROM productos'
            INTO v_inventario;
    END;

    -- Cálculos derivados
    v_utilidad := v_ventas - v_gastos;
    v_margen := CASE WHEN v_ventas > 0 THEN (v_utilidad / v_ventas) * 100 ELSE 0 END;
    v_rotacion := CASE WHEN v_inventario > 0 THEN v_gastos / v_inventario ELSE 0 END;

    -- Retornar resultados
    RETURN QUERY SELECT
        v_efectivo,
        v_ventas,
        v_gastos,
        v_utilidad,
        v_cobrar,
        v_pagar,
        v_rotacion,
        v_margen,
        evaluar_liquidez(v_efectivo, v_pagar),
        evaluar_rentabilidad(v_margen),
        evaluar_crecimiento();

END;
$$;

-- Función auxiliar para evaluar liquidez
CREATE OR REPLACE FUNCTION evaluar_liquidez(efectivo numeric, cuentas_por_pagar numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF cuentas_por_pagar = 0 THEN
        RETURN 'EXCELENTE';
    END IF;
    
    DECLARE
        ratio numeric := efectivo / cuentas_por_pagar;
    BEGIN
        IF ratio >= 2 THEN RETURN 'EXCELENTE';
        ELSIF ratio >= 1.5 THEN RETURN 'BUENA';
        ELSIF ratio >= 1 THEN RETURN 'REGULAR';
        ELSIF ratio >= 0.5 THEN RETURN 'MALA';
        ELSE RETURN 'CRITICA';
        END IF;
    END;
END;
$$;

-- Función auxiliar para evaluar rentabilidad
CREATE OR REPLACE FUNCTION evaluar_rentabilidad(margen_bruto numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF margen_bruto >= 40 THEN RETURN 'EXCELENTE';
    ELSIF margen_bruto >= 25 THEN RETURN 'BUENA';
    ELSIF margen_bruto >= 15 THEN RETURN 'REGULAR';
    ELSIF margen_bruto >= 5 THEN RETURN 'MALA';
    ELSE RETURN 'CRITICA';
    END IF;
END;
$$;

-- Función auxiliar para evaluar crecimiento
CREATE OR REPLACE FUNCTION evaluar_crecimiento()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_ventas_actuales numeric;
    v_ventas_anteriores numeric;
    v_crecimiento numeric;
BEGIN
    -- Ventas últimos 30 días
    SELECT COALESCE(SUM(total::numeric), 0)
    INTO v_ventas_actuales
    FROM ventas
    WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
    AND estado IN ('EMITIDA', 'PAGADA');

    -- Ventas de 30 a 60 días atrás
    SELECT COALESCE(SUM(total::numeric), 0)
    INTO v_ventas_anteriores
    FROM ventas
    WHERE fecha >= CURRENT_DATE - INTERVAL '60 days'
    AND fecha < CURRENT_DATE - INTERVAL '30 days'
    AND estado IN ('EMITIDA', 'PAGADA');

    IF v_ventas_anteriores = 0 THEN
        RETURN 'ESTABLE';
    END IF;

    v_crecimiento := ((v_ventas_actuales - v_ventas_anteriores) / v_ventas_anteriores) * 100;

    IF v_crecimiento >= 10 THEN RETURN 'POSITIVO';
    ELSIF v_crecimiento >= -5 THEN RETURN 'ESTABLE';
    ELSE RETURN 'NEGATIVO';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ESTABLE';
END;
$$;

-- Función para obtener datos históricos completos (usada por getDatosHistoricosCompleto)
CREATE OR REPLACE FUNCTION get_datos_historicos_completos(meses integer DEFAULT 12)
RETURNS TABLE (
    periodo text,
    ventas numeric,
    gastos numeric,
    utilidad numeric,
    cuentas_por_cobrar numeric,
    cuentas_por_pagar numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH periodos AS (
        SELECT 
            to_char(generate_series(
                CURRENT_DATE - (meses || ' months')::interval,
                CURRENT_DATE,
                '1 month'::interval
            ), 'YYYY-MM') as periodo
    )
    SELECT 
        p.periodo,
        COALESCE(SUM(CASE WHEN v.fecha >= to_date(p.periodo || '-01', 'YYYY-MM-DD') 
                     AND v.fecha < to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
                     THEN v.total::numeric ELSE 0 END), 0) as ventas,
        COALESCE(SUM(CASE WHEN g.fecha >= to_date(p.periodo || '-01', 'YYYY-MM-DD') 
                     AND g.fecha < to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
                     THEN g.monto::numeric ELSE 0 END), 0) as gastos,
        COALESCE(SUM(CASE WHEN v.fecha >= to_date(p.periodo || '-01', 'YYYY-MM-DD') 
                     AND v.fecha < to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
                     THEN v.total::numeric ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN g.fecha >= to_date(p.periodo || '-01', 'YYYY-MM-DD') 
                     AND g.fecha < to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
                     THEN g.monto::numeric ELSE 0 END), 0) as utilidad,
        COALESCE(SUM(CASE WHEN cpc.fecha_creacion >= to_date(p.periodo || '-01', 'YYYY-MM-DD') 
                     AND cpc.fecha_creacion < to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
                     THEN cpc.saldo_pendiente::numeric ELSE 0 END), 0) as cuentas_por_cobrar,
        COALESCE(SUM(CASE WHEN cpp.fecha_creacion >= to_date(p.periodo || '-01', 'YYYY-MM-DD') 
                     AND cpp.fecha_creacion < to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
                     THEN cpp.saldo_pendiente::numeric ELSE 0 END), 0) as cuentas_por_pagar
    FROM periodos p
    LEFT JOIN ventas v ON v.estado IN ('EMITIDA', 'PAGADA')
    LEFT JOIN gastos g ON true
    LEFT JOIN cuentas_por_cobrar cpc ON cpc.estado != 'COBRADA'
    LEFT JOIN cuentas_por_pagar cpp ON cpp.estado != 'PAGADA'
    GROUP BY p.periodo
    ORDER BY p.periodo;
END;
$$;

-- Índices para optimizar las consultas financieras
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_estado ON ventas(fecha, estado);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_ventas_metodo_fecha ON pagos_ventas(metodo_pago, venta_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_estado ON cuentas_por_cobrar(estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_estado ON cuentas_por_pagar(estado);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='productos' AND column_name='stock_actual') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='productos' AND indexname='idx_productos_precio_stock_actual') THEN
            EXECUTE 'CREATE INDEX idx_productos_precio_stock_actual ON productos((precio_venta::numeric),(stock_actual::numeric));';
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='productos' AND indexname='idx_productos_precio_stock') THEN
            EXECUTE 'CREATE INDEX idx_productos_precio_stock ON productos((precio::numeric),(stock::numeric));';
        END IF;
    END IF;
END $$;

-- Comentarios para documentación
COMMENT ON FUNCTION get_kpis_financieros() IS 'Función principal para obtener KPIs financieros en tiempo real. Utilizada por FinancialIntegrationService';
COMMENT ON FUNCTION get_datos_historicos_completos(integer) IS 'Función para obtener datos históricos financieros por mes. Soporta análisis de tendencias';

-- Log de migración (solo si la tabla existe)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
          AND table_schema = 'public'
    ) THEN
        INSERT INTO schema_migrations (version, applied_at)
        VALUES ('20250201_create_financial_integration_functions', NOW());
    END IF;
END $$;