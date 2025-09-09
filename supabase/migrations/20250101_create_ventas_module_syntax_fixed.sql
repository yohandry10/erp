-- =============================================
-- MIGRACIÓN MÓDULO DE VENTAS - SINTAXIS CORREGIDA
-- Fecha: 2025-01-01
-- Descripción: Corregir estructura completa y crear módulo de ventas
-- =============================================

-- 1. CORREGIR Y COMPLETAR TABLA CLIENTES
DO $$
BEGIN
    -- Crear tabla si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clientes') THEN
        CREATE TABLE public.clientes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
            codigo VARCHAR(20),
            razon_social TEXT,
            nombre_comercial TEXT,
            tipo_documento VARCHAR(20) DEFAULT 'RUC',
            numero_documento VARCHAR(20),
            direccion TEXT,
            telefono VARCHAR(20),
            email VARCHAR(100),
            contacto_principal TEXT,
            condicion_pago VARCHAR(20) DEFAULT 'CONTADO',
            limite_credito DECIMAL(12,2) DEFAULT 0,
            vendedor_asignado UUID,
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE '✅ Tabla clientes creada';
    END IF;
    
    -- Corregir tamaño de columna codigo si es muy pequeña
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clientes' 
        AND column_name = 'codigo' 
        AND character_maximum_length < 20
    ) THEN
        ALTER TABLE public.clientes ALTER COLUMN codigo TYPE VARCHAR(20);
        RAISE NOTICE '✅ Columna codigo en clientes corregida a VARCHAR(20)';
    END IF;
    
    -- Agregar columnas faltantes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.clientes ADD COLUMN tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'codigo') THEN
        ALTER TABLE public.clientes ADD COLUMN codigo VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'razon_social') THEN
        ALTER TABLE public.clientes ADD COLUMN razon_social TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'tipo_documento') THEN
        ALTER TABLE public.clientes ADD COLUMN tipo_documento VARCHAR(20) DEFAULT 'RUC';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'numero_documento') THEN
        ALTER TABLE public.clientes ADD COLUMN numero_documento VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'direccion') THEN
        ALTER TABLE public.clientes ADD COLUMN direccion TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'telefono') THEN
        ALTER TABLE public.clientes ADD COLUMN telefono VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'email') THEN
        ALTER TABLE public.clientes ADD COLUMN email VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'activo') THEN
        ALTER TABLE public.clientes ADD COLUMN activo BOOLEAN DEFAULT true;
    END IF;
    
    RAISE NOTICE '✅ Tabla clientes verificada y completada';
END $$;

-- 2. CORREGIR Y COMPLETAR TABLA PRODUCTOS
DO $$
BEGIN
    -- Crear tabla si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'productos') THEN
        CREATE TABLE public.productos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
            codigo VARCHAR(50),
            nombre TEXT,
            descripcion TEXT,
            categoria VARCHAR(50),
            marca VARCHAR(50),
            precio_venta DECIMAL(10,2) DEFAULT 0,
            precio_compra DECIMAL(10,2) DEFAULT 0,
            costo_promedio DECIMAL(10,2) DEFAULT 0,
            unidad_medida VARCHAR(10) DEFAULT 'UND',
            stock_actual DECIMAL(10,2) DEFAULT 0,
            stock_minimo DECIMAL(10,2) DEFAULT 0,
            stock_maximo DECIMAL(10,2) DEFAULT 0,
            afecto_igv BOOLEAN DEFAULT true,
            porcentaje_igv DECIMAL(5,2) DEFAULT 18.00,
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE '✅ Tabla productos creada';
    END IF;
    
    -- Corregir tamaño de columna codigo si es muy pequeña
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'productos' 
        AND column_name = 'codigo' 
        AND character_maximum_length < 50
    ) THEN
        ALTER TABLE public.productos ALTER COLUMN codigo TYPE VARCHAR(50);
        RAISE NOTICE '✅ Columna codigo en productos corregida a VARCHAR(50)';
    END IF;
    
    -- Agregar columnas faltantes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.productos ADD COLUMN tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'codigo') THEN
        ALTER TABLE public.productos ADD COLUMN codigo VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'nombre') THEN
        ALTER TABLE public.productos ADD COLUMN nombre TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'descripcion') THEN
        ALTER TABLE public.productos ADD COLUMN descripcion TEXT;
        RAISE NOTICE '✅ Columna descripcion agregada a productos';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'precio_venta') THEN
        ALTER TABLE public.productos ADD COLUMN precio_venta DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'activo') THEN
        ALTER TABLE public.productos ADD COLUMN activo BOOLEAN DEFAULT true;
    END IF;
    
    RAISE NOTICE '✅ Tabla productos verificada y completada';
END $$;

-- 3. ACTUALIZAR CÓDIGOS VACÍOS
DO $$
DECLARE
    cliente_record RECORD;
    producto_record RECORD;
    contador INTEGER;
BEGIN
    -- Actualizar códigos de clientes
    contador := 1;
    FOR cliente_record IN 
        SELECT id FROM public.clientes 
        WHERE codigo IS NULL OR codigo = '' 
        ORDER BY created_at
    LOOP
        UPDATE public.clientes 
        SET codigo = 'CLI' || LPAD(contador::TEXT, 3, '0')
        WHERE id = cliente_record.id;
        contador := contador + 1;
    END LOOP;
    
    -- Actualizar códigos de productos
    contador := 1;
    FOR producto_record IN 
        SELECT id FROM public.productos 
        WHERE codigo IS NULL OR codigo = '' 
        ORDER BY created_at
    LOOP
        UPDATE public.productos 
        SET codigo = 'PROD' || LPAD(contador::TEXT, 3, '0')
        WHERE id = producto_record.id;
        contador := contador + 1;
    END LOOP;
    
    RAISE NOTICE '✅ Códigos actualizados';
END $$;

-- 4. CREAR RESTO DE TABLAS DEL MÓDULO DE VENTAS

-- COTIZACIONES
CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    numero VARCHAR(20) NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    cliente_id UUID,
    cliente_razon_social TEXT NOT NULL,
    cliente_documento VARCHAR(20),
    cliente_direccion TEXT,
    vendedor_id UUID,
    condiciones_pago VARCHAR(50),
    tiempo_entrega VARCHAR(50),
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    descuento DECIMAL(12,2) DEFAULT 0,
    igv DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'BORRADOR',
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DETALLE DE COTIZACIONES
CREATE TABLE IF NOT EXISTS public.cotizacion_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
    producto_id UUID,
    producto_codigo VARCHAR(50) NOT NULL,
    producto_nombre TEXT NOT NULL,
    descripcion TEXT,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
    descuento_monto DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    orden INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VENTAS
CREATE TABLE IF NOT EXISTS public.ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    tipo_documento VARCHAR(20) NOT NULL DEFAULT 'FACTURA',
    serie VARCHAR(10) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    cliente_id UUID,
    cliente_razon_social TEXT NOT NULL,
    cliente_documento VARCHAR(20),
    cliente_direccion TEXT,
    cotizacion_id UUID,
    vendedor_id UUID,
    condiciones_pago VARCHAR(50),
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    descuento DECIMAL(12,2) DEFAULT 0,
    igv DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'EMITIDA',
    estado_pago VARCHAR(20) DEFAULT 'PENDIENTE',
    monto_pagado DECIMAL(12,2) DEFAULT 0,
    saldo_pendiente DECIMAL(12,2) DEFAULT 0,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DETALLE DE VENTAS
CREATE TABLE IF NOT EXISTS public.venta_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id UUID,
    producto_codigo VARCHAR(50) NOT NULL,
    producto_nombre TEXT NOT NULL,
    descripcion TEXT,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
    descuento_monto DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    orden INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAGOS DE VENTAS
CREATE TABLE IF NOT EXISTS public.pagos_ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID REFERENCES public.ventas(id) ON DELETE CASCADE,
    fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
    monto DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(30) NOT NULL,
    numero_operacion VARCHAR(50),
    banco VARCHAR(100),
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CREAR ÍNDICES Y DATOS DE PRUEBA
DO $$
BEGIN
    -- Índices para clientes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clientes_tenant_codigo') THEN
        CREATE INDEX idx_clientes_tenant_codigo ON public.clientes(tenant_id, codigo);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clientes_documento') THEN
        CREATE INDEX idx_clientes_documento ON public.clientes(numero_documento);
    END IF;
    
    -- Índices para productos
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_productos_tenant_codigo') THEN
        CREATE INDEX idx_productos_tenant_codigo ON public.productos(tenant_id, codigo);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_productos_activo') THEN
        CREATE INDEX idx_productos_activo ON public.productos(activo);
    END IF;
    
    -- Insertar cliente de prueba
    IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE numero_documento = '20123456789') THEN
        INSERT INTO public.clientes (codigo, razon_social, tipo_documento, numero_documento, direccion, telefono, email) 
        VALUES ('CLI001', 'Cliente de Prueba S.A.C.', 'RUC', '20123456789', 'Av. Principal 123, Lima', '01-234-5678', 'cliente@prueba.com');
        RAISE NOTICE '✅ Cliente de prueba insertado';
    END IF;
    
    -- Insertar producto de prueba
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE codigo = 'PROD001') THEN
        INSERT INTO public.productos (codigo, nombre, descripcion, precio_venta) 
        VALUES ('PROD001', 'Producto de Prueba', 'Descripción del producto de prueba', 100.00);
        RAISE NOTICE '✅ Producto de prueba insertado';
    END IF;
    
    RAISE NOTICE '🎉 =====================================';
    RAISE NOTICE '🎉 MIGRACIÓN VENTAS COMPLETADA';
    RAISE NOTICE '🎉 =====================================';
END $$;