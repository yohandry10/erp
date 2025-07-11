-- =============================================
-- MIGRACIÓN COMPLETA MÓDULO CONTABILIDAD
-- Fecha: 2024-12-30
-- Descripción: Crear todas las tablas necesarias para el módulo contable
-- =============================================

-- 1. PLAN DE CUENTAS (Catálogo contable)
-- Plan de cuentas - Solo agregar columnas faltantes
DO $$
BEGIN
    -- Agregar naturaleza si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plan_cuentas' AND column_name = 'naturaleza') THEN
        ALTER TABLE public.plan_cuentas ADD COLUMN naturaleza TEXT NOT NULL DEFAULT 'DEUDORA';
    END IF;
    
    -- Agregar nivel si no existe  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plan_cuentas' AND column_name = 'nivel') THEN
        ALTER TABLE public.plan_cuentas ADD COLUMN nivel INTEGER NOT NULL DEFAULT 1;
    END IF;
    
    -- Agregar cuenta_padre si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plan_cuentas' AND column_name = 'cuenta_padre') THEN
        ALTER TABLE public.plan_cuentas ADD COLUMN cuenta_padre VARCHAR(10);
    END IF;
    
    -- Agregar acepta_movimiento si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plan_cuentas' AND column_name = 'acepta_movimiento') THEN
        ALTER TABLE public.plan_cuentas ADD COLUMN acepta_movimiento BOOLEAN DEFAULT false;
    END IF;
    
    RAISE NOTICE '✅ Tabla plan_cuentas verificada y actualizada';
END $$;

-- 2. ASIENTOS CONTABLES (Ya existe, pero verificamos estructura)
CREATE TABLE IF NOT EXISTS public.asientos_contables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_asiento VARCHAR(50) NOT NULL UNIQUE,
    fecha DATE NOT NULL,
    concepto TEXT NOT NULL,
    referencia VARCHAR(255),
    total_debe DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_haber DECIMAL(12,2) NOT NULL DEFAULT 0,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DETALLE DE ASIENTOS (Ya existe, pero verificamos estructura)
CREATE TABLE IF NOT EXISTS public.detalle_asientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asiento_id UUID REFERENCES public.asientos_contables(id) ON DELETE CASCADE,
    cuenta_id UUID REFERENCES public.plan_cuentas(id), -- ¡CORREGIDO! Debe referenciar plan_cuentas
    debe DECIMAL(12,2) NOT NULL DEFAULT 0,
    haber DECIMAL(12,2) NOT NULL DEFAULT 0,
    concepto TEXT,
    referencia VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TIPOS DE CAMBIO (Para multi-moneda)
CREATE TABLE IF NOT EXISTS public.tipos_cambio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL UNIQUE,
    compra DECIMAL(8,4) NOT NULL,
    venta DECIMAL(8,4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CUENTAS POR COBRAR (Para finanzas)
CREATE TABLE IF NOT EXISTS public.cuentas_por_cobrar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpe_id UUID, -- referencia a comprobante
    factura_id UUID, -- referencia alternativa
    cliente_id VARCHAR(255),
    numero_documento VARCHAR(50) NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    moneda VARCHAR(3) DEFAULT 'PEN',
    monto_original DECIMAL(12,2) NOT NULL,
    saldo_pendiente DECIMAL(12,2) NOT NULL,
    monto_pagado DECIMAL(12,2) DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'VIGENTE', -- VIGENTE, VENCIDA, EN_COBRANZA, COBRADA
    ultimo_pago TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CUENTAS POR PAGAR (Para finanzas)
CREATE TABLE IF NOT EXISTS public.cuentas_por_pagar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID, -- referencia a orden de compra
    proveedor_id VARCHAR(255),
    numero_documento VARCHAR(50) NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    moneda VARCHAR(3) DEFAULT 'PEN',
    monto_original DECIMAL(12,2) NOT NULL,
    saldo_pendiente DECIMAL(12,2) NOT NULL,
    monto_pagado DECIMAL(12,2) DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'VIGENTE', -- VIGENTE, VENCIDA, PAGADA
    ultimo_pago TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. GASTOS (Para control de gastos)
CREATE TABLE IF NOT EXISTS public.gastos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_comprobante VARCHAR(50),
    fecha DATE NOT NULL,
    proveedor_nombre VARCHAR(255),
    proveedor_ruc VARCHAR(11),
    concepto TEXT NOT NULL,
    categoria VARCHAR(50), -- SUMINISTROS, SERVICIOS, TRANSPORTE, etc.
    monto DECIMAL(12,2) NOT NULL,
    igv DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(20), -- EFECTIVO, TRANSFERENCIA, TARJETA
    estado VARCHAR(20) DEFAULT 'REGISTRADO', -- REGISTRADO, CONTABILIZADO
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PAGOS DE FACTURAS (Para tracking de pagos)
CREATE TABLE IF NOT EXISTS public.pagos_facturas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id UUID NOT NULL, -- referencia a CPE o cuenta por cobrar
    monto_pagado DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(20) NOT NULL, -- EFECTIVO, TRANSFERENCIA, TARJETA
    fecha_pago TIMESTAMPTZ NOT NULL,
    observaciones TEXT,
    usuario_id VARCHAR(255) DEFAULT 'sistema',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INSERTAR PLAN DE CUENTAS BÁSICO PERÚ
-- =============================================

INSERT INTO public.plan_cuentas (codigo, nombre, tipo, naturaleza, nivel, cuenta_padre, acepta_movimiento) VALUES
-- CLASE 1: ACTIVOS
('1', 'ACTIVO', 'ACTIVO', 'DEUDORA', 1, null, false),
('10', 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', 'ACTIVO', 'DEUDORA', 2, '1', false),
('101', 'Caja', 'ACTIVO', 'DEUDORA', 3, '10', true),
('102', 'Fondos Fijos', 'ACTIVO', 'DEUDORA', 3, '10', true),
('104', 'Cuentas Corrientes en Instituciones Financieras', 'ACTIVO', 'DEUDORA', 3, '10', true),

('12', 'CUENTAS POR COBRAR COMERCIALES', 'ACTIVO', 'DEUDORA', 2, '1', false),
('121', 'Facturas, Boletas y Otros Comprobantes por Cobrar', 'ACTIVO', 'DEUDORA', 3, '12', true),
('122', 'Anticipos de Clientes', 'ACTIVO', 'DEUDORA', 3, '12', true),

('20', 'MERCADERÍAS', 'ACTIVO', 'DEUDORA', 2, '1', false),
('201', 'Mercaderías Manufacturadas', 'ACTIVO', 'DEUDORA', 3, '20', true),
('202', 'Mercaderías de Extracción', 'ACTIVO', 'DEUDORA', 3, '20', true),

-- CLASE 4: PASIVOS
('4', 'PASIVO', 'PASIVO', 'ACREEDORA', 1, null, false),
('40', 'TRIBUTOS, CONTRAPRESTACIONES Y APORTES AL SPP Y SNP POR PAGAR', 'PASIVO', 'ACREEDORA', 2, '4', false),
('401', 'Gobierno Central', 'PASIVO', 'ACREEDORA', 3, '40', true),
('403', 'Instituciones Públicas', 'PASIVO', 'ACREEDORA', 3, '40', true),
('407', 'Administradoras de Fondos', 'PASIVO', 'ACREEDORA', 3, '40', true),

('41', 'REMUNERACIONES Y PARTICIPACIONES POR PAGAR', 'PASIVO', 'ACREEDORA', 2, '4', false),
('411', 'Remuneraciones por Pagar', 'PASIVO', 'ACREEDORA', 3, '41', true),
('415', 'Beneficios Sociales de los Trabajadores por Pagar', 'PASIVO', 'ACREEDORA', 3, '41', true),

('42', 'CUENTAS POR PAGAR COMERCIALES', 'PASIVO', 'ACREEDORA', 2, '4', false),
('421', 'Facturas por Pagar', 'PASIVO', 'ACREEDORA', 3, '42', true),
('422', 'Anticipos a Proveedores', 'PASIVO', 'ACREEDORA', 3, '42', true),

-- CLASE 5: PATRIMONIO
('5', 'PATRIMONIO', 'PATRIMONIO', 'ACREEDORA', 1, null, false),
('50', 'CAPITAL', 'PATRIMONIO', 'ACREEDORA', 2, '5', false),
('501', 'Capital Social', 'PATRIMONIO', 'ACREEDORA', 3, '50', true),

('59', 'RESULTADOS ACUMULADOS', 'PATRIMONIO', 'ACREEDORA', 2, '5', false),
('591', 'Utilidades no Distribuidas', 'PATRIMONIO', 'ACREEDORA', 3, '59', true),
('592', 'Pérdidas Acumuladas', 'PATRIMONIO', 'ACREEDORA', 3, '59', true),

-- CLASE 6: GASTOS (usando ACTIVO como tipo genérico)
('6', 'GASTOS POR NATURALEZA', 'ACTIVO', 'DEUDORA', 1, null, false),
('60', 'COMPRAS', 'ACTIVO', 'DEUDORA', 2, '6', false),
('601', 'Mercaderías', 'ACTIVO', 'DEUDORA', 3, '60', true),

('62', 'GASTOS DE PERSONAL, DIRECTORES Y GERENTES', 'ACTIVO', 'DEUDORA', 2, '6', false),
('621', 'Remuneraciones', 'ACTIVO', 'DEUDORA', 3, '62', true),
('627', 'Seguridad y Previsión Social', 'ACTIVO', 'DEUDORA', 3, '62', true),

('63', 'GASTOS DE SERVICIOS PRESTADOS POR TERCEROS', 'ACTIVO', 'DEUDORA', 2, '6', false),
('634', 'Mantenimiento y Reparaciones', 'ACTIVO', 'DEUDORA', 3, '63', true),
('636', 'Servicios Básicos', 'ACTIVO', 'DEUDORA', 3, '63', true),
('637', 'Publicidad, Publicaciones, Relaciones Públicas', 'ACTIVO', 'DEUDORA', 3, '63', true),

('65', 'OTROS GASTOS DE GESTIÓN', 'ACTIVO', 'DEUDORA', 2, '6', false),
('659', 'Otros Gastos de Gestión', 'ACTIVO', 'DEUDORA', 3, '65', true),

('69', 'COSTO DE VENTAS', 'ACTIVO', 'DEUDORA', 2, '6', false),
('691', 'Mercaderías', 'ACTIVO', 'DEUDORA', 3, '69', true),

-- CLASE 7: INGRESOS (usando PASIVO como tipo genérico)
('7', 'INGRESOS', 'PASIVO', 'ACREEDORA', 1, null, false),
('70', 'VENTAS', 'PASIVO', 'ACREEDORA', 2, '7', false),
('701', 'Mercaderías', 'PASIVO', 'ACREEDORA', 3, '70', true),

('75', 'OTROS INGRESOS DE GESTIÓN', 'PASIVO', 'ACREEDORA', 2, '7', false),
('759', 'Otros Ingresos de Gestión', 'PASIVO', 'ACREEDORA', 3, '75', true)
ON CONFLICT (codigo) DO NOTHING;

-- =============================================
-- CREAR ÍNDICES PARA PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_codigo ON public.plan_cuentas(codigo);
CREATE INDEX IF NOT EXISTS idx_plan_cuentas_tipo ON public.plan_cuentas(tipo);
CREATE INDEX IF NOT EXISTS idx_plan_cuentas_acepta_movimiento ON public.plan_cuentas(acepta_movimiento);

CREATE INDEX IF NOT EXISTS idx_asientos_contables_fecha ON public.asientos_contables(fecha);
CREATE INDEX IF NOT EXISTS idx_asientos_contables_estado ON public.asientos_contables(estado);
CREATE INDEX IF NOT EXISTS idx_asientos_contables_numero ON public.asientos_contables(numero_asiento);

CREATE INDEX IF NOT EXISTS idx_detalle_asientos_asiento_id ON public.detalle_asientos(asiento_id);
CREATE INDEX IF NOT EXISTS idx_detalle_asientos_cuenta_id ON public.detalle_asientos(cuenta_id);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_cliente ON public.cuentas_por_cobrar(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_estado ON public.cuentas_por_cobrar(estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_fecha_venc ON public.cuentas_por_cobrar(fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_proveedor ON public.cuentas_por_pagar(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_estado ON public.cuentas_por_pagar(estado);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_fecha_venc ON public.cuentas_por_pagar(fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON public.gastos(categoria);

CREATE INDEX IF NOT EXISTS idx_pagos_facturas_factura_id ON public.pagos_facturas(factura_id);
CREATE INDEX IF NOT EXISTS idx_pagos_facturas_fecha ON public.pagos_facturas(fecha_pago);

-- =============================================
-- INSERTAR TIPO DE CAMBIO INICIAL
-- =============================================

INSERT INTO public.tipos_cambio (fecha, compra, venta) VALUES
(CURRENT_DATE, 3.70, 3.73)
ON CONFLICT (fecha) DO NOTHING;

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON TABLE public.plan_cuentas IS 'Plan de cuentas contables según PCGE Perú';
COMMENT ON TABLE public.asientos_contables IS 'Cabecera de asientos contables';
COMMENT ON TABLE public.detalle_asientos IS 'Detalle de movimientos contables';
COMMENT ON TABLE public.cuentas_por_cobrar IS 'Control de cuentas por cobrar a clientes';
COMMENT ON TABLE public.cuentas_por_pagar IS 'Control de cuentas por pagar a proveedores';
COMMENT ON TABLE public.gastos IS 'Registro de gastos de la empresa';
COMMENT ON TABLE public.pagos_facturas IS 'Registro de pagos recibidos de clientes';
COMMENT ON TABLE public.tipos_cambio IS 'Tipos de cambio diarios USD-PEN';

-- Log de finalización
DO $$
BEGIN
    RAISE NOTICE '✅ Módulo de Contabilidad creado exitosamente';
    RAISE NOTICE '📊 Plan de cuentas básico insertado';
    RAISE NOTICE '🔗 Referencias UUID configuradas correctamente';
    RAISE NOTICE '⚡ Índices de performance creados';
END $$; 