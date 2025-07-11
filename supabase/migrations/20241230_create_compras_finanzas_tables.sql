-- =============================================
-- MIGRACIÓN TABLAS COMPRAS Y FINANZAS
-- Fecha: 2024-12-30
-- Descripción: Crear tablas necesarias para módulos de Compras y Finanzas
-- =============================================

-- =============================================
-- MÓDULO COMPRAS
-- =============================================

-- 1. PROVEEDORES (Ya existe, solo agregamos columnas si faltan)
DO $$
BEGIN
    -- Agregar condiciones_pago si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'proveedores' AND column_name = 'condiciones_pago') THEN
        ALTER TABLE public.proveedores ADD COLUMN condiciones_pago VARCHAR(20) DEFAULT 'CONTADO';
        RAISE NOTICE '✅ Columna condiciones_pago agregada a proveedores';
    END IF;

    -- Agregar activo si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'proveedores' AND column_name = 'activo') THEN
        ALTER TABLE public.proveedores ADD COLUMN activo BOOLEAN DEFAULT true;
        RAISE NOTICE '✅ Columna activo agregada a proveedores';
    END IF;

    RAISE NOTICE '✅ Tabla proveedores verificada';
END $$;

-- 2. ÓRDENES DE COMPRA - Solo agregar columnas faltantes
DO $$
BEGIN
    -- Agregar tenant_id si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.ordenes_compra ADD COLUMN tenant_id UUID;
    END IF;
    
    -- Agregar fecha_requerida si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'fecha_requerida') THEN
        ALTER TABLE public.ordenes_compra ADD COLUMN fecha_requerida DATE;
    END IF;
    
    -- Agregar usuario_id si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_compra' AND column_name = 'usuario_id') THEN
        ALTER TABLE public.ordenes_compra ADD COLUMN usuario_id VARCHAR(255) DEFAULT 'sistema';
    END IF;
    
    RAISE NOTICE '✅ Tabla ordenes_compra verificada y actualizada';
END $$;

-- 3. DETALLE ÓRDENES DE COMPRA
CREATE TABLE IF NOT EXISTS public.orden_compra_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
    producto_id VARCHAR(255) NOT NULL, -- Referencia a productos
    descripcion TEXT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    cantidad_recibida DECIMAL(10,2) DEFAULT 0,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    fecha_recepcion TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MÓDULO FINANZAS (TESORERÍA)
-- =============================================

-- 4. BANCOS Y CUENTAS BANCARIAS
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    banco VARCHAR(50) NOT NULL,
    numero_cuenta VARCHAR(30) NOT NULL UNIQUE,
    tipo_cuenta VARCHAR(20) NOT NULL, -- CORRIENTE, AHORRO, DETRACCION
    moneda VARCHAR(3) DEFAULT 'PEN',
    saldo_actual DECIMAL(12,2) DEFAULT 0,
    saldo_contable DECIMAL(12,2) DEFAULT 0,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MOVIMIENTOS BANCARIOS
CREATE TABLE IF NOT EXISTS public.movimientos_bancarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_bancaria_id UUID REFERENCES public.cuentas_bancarias(id),
    fecha_operacion DATE NOT NULL,
    tipo_operacion VARCHAR(20) NOT NULL, -- INGRESO, EGRESO, TRANSFERENCIA_IN, TRANSFERENCIA_OUT
    concepto TEXT NOT NULL,
    referencia VARCHAR(100),
    monto DECIMAL(12,2) NOT NULL,
    saldo_anterior DECIMAL(12,2),
    saldo_nuevo DECIMAL(12,2),
    comprobante_pago_id UUID, -- Referencia a comprobante relacionado
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CAJAS - Solo agregar columnas faltantes si existen
DO $$
BEGIN
    -- Agregar monto_proyectado si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cajas' AND column_name = 'monto_proyectado') THEN
        ALTER TABLE public.cajas ADD COLUMN monto_proyectado DECIMAL(12,2) DEFAULT 0;
    END IF;
    
    -- Agregar categoria si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cajas' AND column_name = 'categoria') THEN
        ALTER TABLE public.cajas ADD COLUMN categoria VARCHAR(50);
    END IF;
    
    RAISE NOTICE '✅ Tabla cajas verificada y actualizada';
END $$;

-- 7. COBRANZAS (SEGUIMIENTO DE PAGOS)
CREATE TABLE IF NOT EXISTS public.cobranzas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_por_cobrar_id UUID, -- Referencia sin FK por ahora
    cliente_id VARCHAR(255),
    numero_documento VARCHAR(50),
    monto_original DECIMAL(12,2) NOT NULL,
    monto_cobrado DECIMAL(12,2) DEFAULT 0,
    saldo_pendiente DECIMAL(12,2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    dias_vencidos INTEGER DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, GESTIONANDO, COBRADO, INCOBRABLE
    responsable_cobranza VARCHAR(255),
    ultima_gestion DATE,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GESTIONES DE COBRANZA
CREATE TABLE IF NOT EXISTS public.gestiones_cobranza (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cobranza_id UUID REFERENCES public.cobranzas(id) ON DELETE CASCADE,
    fecha_gestion DATE NOT NULL,
    tipo_gestion VARCHAR(30) NOT NULL, -- LLAMADA, EMAIL, VISITA, CARTA, JUDICIAL
    resultado VARCHAR(30), -- CONTACTADO, NO_CONTACTADO, PROMESA_PAGO, PAGO_PARCIAL, PAGO_TOTAL
    fecha_promesa DATE,
    monto_prometido DECIMAL(12,2),
    observaciones TEXT,
    responsable VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EGRESOS (CONTROL DE GASTOS Y PAGOS)
CREATE TABLE IF NOT EXISTS public.egresos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_egreso VARCHAR(50) NOT NULL UNIQUE,
    fecha DATE NOT NULL,
    beneficiario VARCHAR(255) NOT NULL,
    concepto TEXT NOT NULL,
    categoria VARCHAR(50), -- GASTO_OPERATIVO, PAGO_PROVEEDOR, PAGO_PLANILLA, PRESTAMO, etc.
    monto DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(20) NOT NULL, -- EFECTIVO, TRANSFERENCIA, CHEQUE
    cuenta_bancaria_id UUID REFERENCES public.cuentas_bancarias(id),
    numero_operacion VARCHAR(50),
    comprobante_url TEXT,
    estado VARCHAR(20) DEFAULT 'PAGADO', -- PAGADO, ANULADO
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INSERTAR DATOS INICIALES
-- =============================================

-- Cuenta bancaria LIMPIA - SIN DATOS HARDCODEADOS
INSERT INTO public.cuentas_bancarias (banco, numero_cuenta, tipo_cuenta, moneda, saldo_actual, saldo_contable) VALUES
('BCP', '123456789012', 'CORRIENTE', 'PEN', 0.00, 0.00),
('BBVA', '987654321098', 'AHORRO', 'PEN', 0.00, 0.00)
ON CONFLICT (numero_cuenta) DO NOTHING;

-- Proveedores de ejemplo (solo si no existen)
DO $$
DECLARE
    default_tenant_id UUID;
BEGIN
    -- Obtener un tenant_id existente de la tabla tenants
    SELECT id INTO default_tenant_id FROM public.tenants LIMIT 1;
    
    IF default_tenant_id IS NULL THEN
        -- Si no hay tenants, omitir la inserción
        RAISE NOTICE '⚠️ No hay tenants disponibles, omitiendo inserción de proveedores de ejemplo';
        RETURN;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE ruc = '20123456789') THEN
        INSERT INTO public.proveedores (tenant_id, ruc, razon_social, nombre_comercial, direccion, telefono, email, contacto, estado, condiciones_pago, activo) VALUES
        (default_tenant_id, '20123456789', 'Distribuidora ABC Sociedad Anónima Cerrada', 'Distribuidora ABC SAC', 'Av. Ejemplo 123, Lima', '01-1234567', 'ventas@abc.com', 'María González', 'ACTIVO', 'CREDITO_30', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE ruc = '20987654321') THEN
        INSERT INTO public.proveedores (tenant_id, ruc, razon_social, nombre_comercial, direccion, telefono, email, contacto, estado, condiciones_pago, activo) VALUES
        (default_tenant_id, '20987654321', 'Suministros XYZ Empresa Individual de Responsabilidad Limitada', 'Suministros XYZ EIRL', 'Jr. Comercio 456, Lima', '01-7654321', 'contacto@xyz.com', 'Carlos Vargas', 'ACTIVO', 'CONTADO', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE ruc = '10456789123') THEN
        INSERT INTO public.proveedores (tenant_id, ruc, razon_social, nombre_comercial, direccion, telefono, email, contacto, estado, condiciones_pago, activo) VALUES
        (default_tenant_id, '10456789123', 'Juan Carlos Pérez López', 'Juan Pérez', 'Calle Los Olivos 789, Lima', '999-888-777', 'jperez@email.com', 'Juan Pérez', 'ACTIVO', 'CREDITO_15', true);
    END IF;
    
    RAISE NOTICE '✅ Proveedores de ejemplo verificados con tenant_id: %', default_tenant_id;
END $$;

-- =============================================
-- CREAR ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índices Proveedores
CREATE INDEX IF NOT EXISTS idx_proveedores_ruc ON public.proveedores(ruc);
CREATE INDEX IF NOT EXISTS idx_proveedores_activo ON public.proveedores(activo);

-- Índices Órdenes de Compra
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor ON public.ordenes_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado ON public.ordenes_compra(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_fecha ON public.ordenes_compra(fecha_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_numero ON public.ordenes_compra(numero);

-- Índices Detalles Órdenes
CREATE INDEX IF NOT EXISTS idx_orden_detalles_orden ON public.orden_compra_detalles(orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_detalles_producto ON public.orden_compra_detalles(producto_id);

-- Índices Cuentas Bancarias
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_numero ON public.cuentas_bancarias(numero_cuenta);
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_activa ON public.cuentas_bancarias(activa);

-- Índices Movimientos Bancarios
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_cuenta ON public.movimientos_bancarios(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_fecha ON public.movimientos_bancarios(fecha_operacion);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tipo ON public.movimientos_bancarios(tipo_operacion);

-- Índices Cajas
CREATE INDEX IF NOT EXISTS idx_cajas_codigo ON public.cajas(codigo);
CREATE INDEX IF NOT EXISTS idx_cajas_estado ON public.cajas(estado);
CREATE INDEX IF NOT EXISTS idx_cajas_activa ON public.cajas(activa);

-- Índices Cobranzas
CREATE INDEX IF NOT EXISTS idx_cobranzas_cliente ON public.cobranzas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobranzas_estado ON public.cobranzas(estado);
CREATE INDEX IF NOT EXISTS idx_cobranzas_vencimiento ON public.cobranzas(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_cobranzas_cuenta_cobrar ON public.cobranzas(cuenta_por_cobrar_id);

-- Índices Gestiones
CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_id ON public.gestiones_cobranza(cobranza_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_fecha ON public.gestiones_cobranza(fecha_gestion);

-- Índices Egresos
CREATE INDEX IF NOT EXISTS idx_egresos_fecha ON public.egresos(fecha);
CREATE INDEX IF NOT EXISTS idx_egresos_categoria ON public.egresos(categoria);
CREATE INDEX IF NOT EXISTS idx_egresos_cuenta_bancaria ON public.egresos(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_egresos_numero ON public.egresos(numero_egreso);

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON TABLE public.proveedores IS 'Catálogo de proveedores de la empresa';
COMMENT ON TABLE public.ordenes_compra IS 'Órdenes de compra a proveedores';
COMMENT ON TABLE public.orden_compra_detalles IS 'Detalle de productos en órdenes de compra';
COMMENT ON TABLE public.cuentas_bancarias IS 'Cuentas bancarias de la empresa';
COMMENT ON TABLE public.movimientos_bancarios IS 'Movimientos bancarios de ingresos y egresos';
COMMENT ON TABLE public.cajas IS 'Gestión de cajas de la empresa';
COMMENT ON TABLE public.cobranzas IS 'Gestión de cobranzas a clientes';
COMMENT ON TABLE public.gestiones_cobranza IS 'Historial de gestiones de cobranza';
COMMENT ON TABLE public.egresos IS 'Control de egresos y pagos de la empresa';

-- Log de finalización
DO $$
BEGIN
    RAISE NOTICE '✅ Tablas de Compras y Finanzas creadas exitosamente';
    RAISE NOTICE '🏪 Proveedores y órdenes de compra configuradas';
    RAISE NOTICE '🏦 Cuentas bancarias y movimientos configurados';
    RAISE NOTICE '💰 Plan de caja y cobranzas implementados';
    RAISE NOTICE '💸 Control de egresos y pagos habilitado';
END $$; 