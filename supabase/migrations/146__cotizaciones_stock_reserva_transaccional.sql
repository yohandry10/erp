-- =====================================================
-- MIGRACIÓN: Reserva de Stock y Conversión Transaccional para Cotizaciones
-- Fecha: 2025-11-29
-- Descripción: Resuelve brechas de auditoría:
--   1. Reserva de stock al crear cotización
--   2. Conversión atómica de cotización a pedido
-- =====================================================

-- =====================================================
-- 1. FUNCIÓN: Reservar stock para cotización
-- =====================================================
CREATE OR REPLACE FUNCTION reservar_stock_cotizacion(
    p_cotizacion_id UUID,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_stock_disponible NUMERIC;
    v_errores JSONB := '[]'::JSONB;
    v_reservados INT := 0;
BEGIN
    -- Iterar sobre los detalles de la cotización
    FOR v_item IN 
        SELECT cd.producto_id, cd.cantidad
        FROM cotizacion_detalles cd
        JOIN cotizaciones c ON c.id = cd.cotizacion_id
        WHERE cd.cotizacion_id = p_cotizacion_id
        AND c.tenant_id = p_tenant_id
    LOOP
        -- Verificar stock disponible
        SELECT COALESCE(stock, 0) - COALESCE(stock_reservado, 0)
        INTO v_stock_disponible
        FROM productos
        WHERE id = v_item.producto_id
        AND tenant_id = p_tenant_id;

        IF v_stock_disponible < v_item.cantidad THEN
            v_errores := v_errores || jsonb_build_object(
                'producto_id', v_item.producto_id,
                'solicitado', v_item.cantidad,
                'disponible', COALESCE(v_stock_disponible, 0)
            );
        ELSE
            -- Reservar stock
            UPDATE productos
            SET stock_reservado = COALESCE(stock_reservado, 0) + v_item.cantidad,
                updated_at = NOW()
            WHERE id = v_item.producto_id
            AND tenant_id = p_tenant_id;
            
            v_reservados := v_reservados + 1;
        END IF;
    END LOOP;

    -- Si hay errores, hacer rollback
    IF jsonb_array_length(v_errores) > 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para algunos productos: %', v_errores;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'productos_reservados', v_reservados,
        'cotizacion_id', p_cotizacion_id
    );
END;
$$;

-- =====================================================
-- 2. FUNCIÓN: Liberar stock reservado de cotización
-- =====================================================
CREATE OR REPLACE FUNCTION liberar_stock_cotizacion(
    p_cotizacion_id UUID,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_liberados INT := 0;
BEGIN
    -- Iterar sobre los detalles de la cotización
    FOR v_item IN 
        SELECT cd.producto_id, cd.cantidad
        FROM cotizacion_detalles cd
        JOIN cotizaciones c ON c.id = cd.cotizacion_id
        WHERE cd.cotizacion_id = p_cotizacion_id
        AND c.tenant_id = p_tenant_id
    LOOP
        -- Liberar stock reservado
        UPDATE productos
        SET stock_reservado = GREATEST(0, COALESCE(stock_reservado, 0) - v_item.cantidad),
            updated_at = NOW()
        WHERE id = v_item.producto_id
        AND tenant_id = p_tenant_id;
        
        v_liberados := v_liberados + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'productos_liberados', v_liberados,
        'cotizacion_id', p_cotizacion_id
    );
END;
$$;

-- =====================================================
-- 3. FUNCIÓN: Convertir cotización a pedido (TRANSACCIONAL)
-- =====================================================
CREATE OR REPLACE FUNCTION convertir_cotizacion_a_pedido(
    p_cotizacion_id UUID,
    p_tenant_id UUID,
    p_user_id UUID,
    p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cotizacion RECORD;
    v_pedido_id UUID;
    v_pedido_numero TEXT;
    v_year INT;
    v_next_number INT;
    v_item RECORD;
BEGIN
    -- 1. Obtener y validar cotización
    SELECT c.*, cl.razon_social as cliente_nombre
    INTO v_cotizacion
    FROM cotizaciones c
    LEFT JOIN clientes cl ON cl.id = c.cliente_id
    WHERE c.id = p_cotizacion_id
    AND c.tenant_id = p_tenant_id
    FOR UPDATE; -- Lock para evitar conversiones concurrentes

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cotización no encontrada';
    END IF;

    IF v_cotizacion.estado = 'CONVERTIDA' THEN
        RAISE EXCEPTION 'Esta cotización ya fue convertida a pedido';
    END IF;

    IF v_cotizacion.estado NOT IN ('BORRADOR', 'ENVIADA', 'APROBADA') THEN
        RAISE EXCEPTION 'Solo se pueden convertir cotizaciones en estado BORRADOR, ENVIADA o APROBADA. Estado actual: %', v_cotizacion.estado;
    END IF;

    -- 2. Generar número de pedido
    v_year := EXTRACT(YEAR FROM NOW());
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM 'PED-[0-9]+-([0-9]+)') AS INT)), 0) + 1
    INTO v_next_number
    FROM pedidos_venta
    WHERE tenant_id = p_tenant_id
    AND numero LIKE 'PED-' || v_year || '-%';

    v_pedido_numero := 'PED-' || v_year || '-' || LPAD(v_next_number::TEXT, 4, '0');

    -- 3. Crear pedido en pedidos_venta
    INSERT INTO pedidos_venta (
        tenant_id,
        numero,
        cliente_id,
        cotizacion_id,
        fecha_pedido,
        estado,
        subtotal,
        igv,
        total,
        observaciones,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        p_tenant_id,
        v_pedido_numero,
        v_cotizacion.cliente_id,
        p_cotizacion_id,
        NOW()::DATE,
        'PENDIENTE',
        v_cotizacion.subtotal,
        v_cotizacion.igv,
        v_cotizacion.total,
        COALESCE(p_notas, v_cotizacion.observaciones),
        p_user_id,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_pedido_id;

    -- 4. Copiar detalles de cotización a pedido_venta_detalle
    INSERT INTO pedidos_venta_detalle (
        pedido_id,
        producto_id,
        descripcion,
        cantidad,
        precio_unitario,
        subtotal,
        created_at
    )
    SELECT 
        v_pedido_id,
        cd.producto_id,
        COALESCE(cd.descripcion, cd.producto_nombre),
        cd.cantidad,
        cd.precio_unitario,
        cd.subtotal,
        NOW()
    FROM cotizacion_detalles cd
    WHERE cd.cotizacion_id = p_cotizacion_id;

    -- 5. Actualizar estado de cotización
    UPDATE cotizaciones
    SET estado = 'CONVERTIDA',
        fecha_conversion = NOW(),
        convertido_por = p_user_id,
        updated_at = NOW()
    WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id;

    -- 6. Transferir reserva de stock de cotización a pedido
    -- (El stock ya está reservado, solo cambiamos la referencia)
    
    -- 7. Registrar en auditoría
    INSERT INTO audit_log (
        table_name,
        operation,
        record_id,
        old_values,
        new_values,
        user_id,
        tenant_id,
        timestamp,
        metadata
    ) VALUES (
        'cotizaciones',
        'UPDATE',
        p_cotizacion_id::TEXT,
        jsonb_build_object('estado', v_cotizacion.estado),
        jsonb_build_object('estado', 'CONVERTIDA', 'pedido_id', v_pedido_id),
        p_user_id,
        p_tenant_id,
        NOW(),
        jsonb_build_object(
            'accion', 'CONVERSION_A_PEDIDO',
            'pedido_numero', v_pedido_numero
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', v_pedido_id,
        'pedido_numero', v_pedido_numero,
        'cotizacion_id', p_cotizacion_id,
        'cotizacion_numero', v_cotizacion.numero
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Rollback automático por la transacción
        RAISE;
END;
$$;

-- =====================================================
-- 4. TRIGGER: Liberar stock cuando cotización vence o se rechaza
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_liberar_stock_cotizacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Si el estado cambia a VENCIDA o RECHAZADA, liberar stock
    IF NEW.estado IN ('VENCIDA', 'RECHAZADA') AND OLD.estado NOT IN ('VENCIDA', 'RECHAZADA', 'CONVERTIDA') THEN
        PERFORM liberar_stock_cotizacion(NEW.id, NEW.tenant_id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS trg_liberar_stock_cotizacion ON cotizaciones;
CREATE TRIGGER trg_liberar_stock_cotizacion
    AFTER UPDATE ON cotizaciones
    FOR EACH ROW
    WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
    EXECUTE FUNCTION trigger_liberar_stock_cotizacion();

-- =====================================================
-- 5. Agregar columna pedido_id a cotizaciones si no existe
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cotizaciones' AND column_name = 'pedido_id'
    ) THEN
        ALTER TABLE cotizaciones ADD COLUMN pedido_id UUID REFERENCES pedidos_venta(id);
        CREATE INDEX IF NOT EXISTS idx_cotizaciones_pedido_id ON cotizaciones(pedido_id);
    END IF;
END $$;

-- =====================================================
-- 6. Comentarios de documentación
-- =====================================================
COMMENT ON FUNCTION reservar_stock_cotizacion IS 'Reserva stock para los productos de una cotización. Lanza excepción si no hay stock suficiente.';
COMMENT ON FUNCTION liberar_stock_cotizacion IS 'Libera el stock reservado de una cotización (usado cuando vence o se rechaza).';
COMMENT ON FUNCTION convertir_cotizacion_a_pedido IS 'Convierte una cotización a pedido de forma atómica. Incluye validaciones, creación de pedido, copia de detalles y auditoría.';
